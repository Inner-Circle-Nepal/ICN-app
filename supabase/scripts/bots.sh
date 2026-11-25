#!/usr/bin/env bash
# Drive Chautari rooms hosted by the bot readers seeded in supabase/seed.sql.
# LOCAL database only: it talks to the supabase_db_ICN-app container and has no
# way to reach production.
#
#   npm run bots -- live <bot> [title]               open a live room now
#   npm run bots -- book <bot> [minutes] [title]     book one ahead (default 60 min)
#   npm run bots -- golive <slug>                    start a booked room
#   npm run bots -- end <slug>                       end a room
#   npm run bots -- list                             rooms and bots
#   npm run bots -- avatars                          upload the bots' profile pictures (after a db reset)
#   npm run bots -- staff                            local newsroom login staff@local.test / staff1234 (superadmin)
#   npm run bots -- join <slug> [bot…]               bots sit in a live room as listeners until Ctrl-C (default: all)
#
#   Invite-only rooms (the room must be live; join from the phone first to see the request arrive):
#   npm run bots -- lock <slug> [off]                make a room invite only (or public again)
#   npm run bots -- members <slug> [off]             let everyone in the room invite their followers (or not)
#   npm run bots -- ask <slug> <bot>                 a bot asks to join (your room: you get the toast and the request)
#   npm run bots -- letin <slug> <username>          approve a reader's request (a bot's room: as if its host let you in)
#
#   Live chat and applause (the room must be live and you must be in it):
#   npm run bots -- say <slug> <bot> [text]          a bot writes in the chat
#   npm run bots -- chatter <slug> [count] [secs]    the bots take turns (default 6, 2 s apart)
#   npm run bots -- unsay <slug> [bot]               delete the latest message (that bot's, or anyone's)
#   npm run bots -- clap <slug> [bot]                applause, credited to the bot (default: the host)
#   npm run bots -- chat <slug>                      the last 20 messages, deleted ones marked
#   npm run bots -- reports                          the latest reports (from readers and the word filter)
#
# <bot> is a username without or with the prefix: `sita` or `bot_sita`.
#
# Chat and applause do what the site's routes do: store the row, then push the
# packet into the room through the LOCAL LiveKit (livekit-send.mjs, keys read
# from the site's .env.development.local). They skip the site's checks and
# rate limits on purpose: bots don't join the room. LiveKit only knows a room
# once someone has joined it, so join from the phone first.
#
# Going live (`live`, `golive`) changes chautari_rooms the same way the site
# does, so the live-push webhook fires: followers of that bot with "Notify me"
# on get the real notification on their phone.
set -euo pipefail

db() { docker exec -i supabase_db_ICN-app psql -U postgres -q -v ON_ERROR_STOP=1 "$@"; }

usage() { grep -E '^#   (npm run bots|Live chat|Invite-only)' "$0" | sed 's/^# \{0,1\}//'; exit 1; }

here=$(cd "$(dirname "$0")" && pwd)
SITE_ENV=${SITE_ENV:-$here/../../../../site/site/.env.development.local}

# Push "<livekit room>\t<packet json>" (one line, as the SQL below returns) on a topic.
push() {
  local line=$1 topic=$2 room packet
  [ -n "$line" ] || { echo "Nothing to send: is the room live, and does it exist?" >&2; exit 1; }
  IFS=$'\t' read -r room packet <<<"$line"
  printf '%s' "$packet" | node "$here/livekit-send.mjs" "$room" "$topic" "$SITE_ENV"
}

SAMPLE_LINES=(
  "Namaste everyone 🙏"
  "Can you all hear the host clearly?"
  "नमस्ते सबैलाई!"
  "Great point about remittances."
  "Joining late, what did I miss?"
  "+1 to that"
  "Is this being recorded?"
  "Thanks for hosting this 👏"
)

# Store one chat message from a bot; prints "<livekit room>\t<packet>".
say_sql() {
  db -tA -v slug="$1" -v bot="$2" -v text="$3" <<'SQL'
with r as (
  select id, host_clerk_id, livekit_room from public.chautari_rooms
  where slug = :'slug' and status = 'live'
), ins as (
  insert into public.chautari_messages (room_id, clerk_user_id, display_name, avatar_url, role, body)
  select r.id, p.clerk_user_id, p.display_name, p.avatar_url,
    case when r.host_clerk_id = p.clerk_user_id then 'host' else 'listener' end, :'text'
  from r, public.reader_profiles p where p.clerk_user_id = :'bot'
  returning *
)
select r.livekit_room || E'\t' || json_build_object('type', 'message', 'message', json_build_object(
  'id', ins.id, 'authorId', ins.clerk_user_id,
  'name', coalesce(nullif(trim(ins.display_name), ''), 'Listener'),
  'avatarUrl', ins.avatar_url, 'role', ins.role, 'text', ins.body, 'sentAt', ins.created_at))::text
from ins, r;
SQL
}

bot_id() {
  local name=${1#bot_}
  local id
  id=$(db -tA -v u="bot_$name" <<<"select clerk_user_id from public.reader_profiles where username = :'u';")
  [ -n "$id" ] || { echo "No bot called bot_$name. Bots: $(db -tA <<<"select string_agg(username, ', ') from public.reader_profiles where clerk_user_id like 'user_bot_%';")" >&2; exit 1; }
  echo "$id"
}

# Same shape as the site's names: <slugified title>-<5 chars>, chautari-<…>.
create_room() {
  local host=$1 status=$2 minutes=$3 title=$4
  local suffix base
  suffix=$(head -c 200 /dev/urandom | tr -dc 'a-z0-9' | head -c 5; true)
  [ ${#suffix} -eq 5 ] || suffix=$(date +%s | tail -c 6)
  base=$(tr '[:upper:]' '[:lower:]' <<<"$title" | tr -cs 'a-z0-9' '-' | sed 's/^-//; s/-$//' | cut -c1-40)
  db -tA -v host="$host" -v status="$status" -v minutes="$minutes" -v title="$title" \
     -v slug="${base:-chautari}-$suffix" -v lk="chautari-${base:-chautari}-$suffix" <<'SQL'
insert into public.chautari_rooms
  (slug, title, host_clerk_id, host_name, status, scheduled_for, started_at, livekit_room)
select :'slug', :'title', p.clerk_user_id, p.display_name, :'status',
  case when :'status' = 'scheduled' then now() + make_interval(mins => :'minutes'::int) end,
  case when :'status' = 'live' then now() end,
  :'lk'
from public.reader_profiles p where p.clerk_user_id = :'host'
returning slug || '  (' || status || coalesce(', starts ' || to_char(scheduled_for at time zone 'Asia/Kathmandu', 'HH24:MI') || ' NPT', '') || ')';
SQL
}

cmd=${1:-}; shift || true
case "$cmd" in
  live)
    [ $# -ge 1 ] || usage
    host=$(bot_id "$1"); create_room "$host" live 0 "${2:-Live test room}" ;;
  book)
    [ $# -ge 1 ] || usage
    host=$(bot_id "$1"); create_room "$host" scheduled "${2:-60}" "${3:-Booked test room}" ;;
  golive)
    [ $# -eq 1 ] || usage
    db -tA -v slug="$1" <<<"update public.chautari_rooms set status = 'live', started_at = now(), updated_at = now() where slug = :'slug' and status = 'scheduled' returning slug || '  now live';" ;;
  end)
    [ $# -eq 1 ] || usage
    db -tA -v slug="$1" <<<"update public.chautari_rooms set status = 'ended', ended_at = now(), updated_at = now() where slug = :'slug' and status <> 'ended' returning slug || '  ended';" ;;
  staff)
    # A newsroom (admin) login for http://localhost:3001/admin, LOCAL only.
    # Safe to re-run: it resets the password and the superadmin profile.
    # A db reset deletes it; run this again afterwards.
    key=$(grep -E '^SUPABASE_SERVICE_ROLE_KEY=' "$SITE_ENV" | cut -d= -f2- | tr -d '"'"'")
    api=$(grep -E '^NEXT_PUBLIC_SUPABASE_URL=' "$SITE_ENV" | cut -d= -f2- | tr -d '"'"'")
    case "$api" in http://127.0.0.1*|http://localhost*) ;; *) echo "Refusing: Supabase URL is not local." >&2; exit 1 ;; esac
    email=staff@local.test password=staff1234
    id=$(db -tA -v e="$email" <<<"select id from auth.users where email = :'e';")
    body="{\"email\":\"$email\",\"password\":\"$password\",\"email_confirm\":true,\"user_metadata\":{\"full_name\":\"Local Staff\"}}"
    if [ -n "$id" ]; then
      curl -s -o /dev/null -X PUT "$api/auth/v1/admin/users/$id" -H "apikey: $key" -H "Authorization: Bearer $key" -H "Content-Type: application/json" -d "$body"
    else
      curl -s -o /dev/null -X POST "$api/auth/v1/admin/users" -H "apikey: $key" -H "Authorization: Bearer $key" -H "Content-Type: application/json" -d "$body"
    fi
    db -tA -v e="$email" <<'SQL'
insert into public.profiles (id, email, full_name, role, capabilities, is_active)
select id, email, 'Local Staff', 'superadmin', '{}', true from auth.users where email = :'e'
on conflict (id) do update set role = 'superadmin', is_active = true;
SQL
    echo "Newsroom login (local only): $email / $password at http://localhost:3001/admin/login" ;;
  avatars)
    # Same public bucket and paths as supabase/seed.sql, uploaded through the
    # local Storage API with the local service key (never production).
    key=$(grep -E '^SUPABASE_SERVICE_ROLE_KEY=' "$SITE_ENV" | cut -d= -f2- | tr -d '"'"'")
    api=$(grep -E '^NEXT_PUBLIC_SUPABASE_URL=' "$SITE_ENV" | cut -d= -f2- | tr -d '"'"'")
    case "$api" in http://127.0.0.1*|http://localhost*) ;; *) echo "Refusing: Supabase URL is not local." >&2; exit 1 ;; esac
    [ -n "$key" ] || { echo "No SUPABASE_SERVICE_ROLE_KEY in $SITE_ENV" >&2; exit 1; }
    db <<<"insert into storage.buckets (id, name, public) values ('bot-avatars', 'bot-avatars', true) on conflict (id) do nothing;"
    for f in "$here"/bot-avatars/*.png; do
      name=$(basename "$f")
      code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$api/storage/v1/object/bot-avatars/$name" \
        -H "Authorization: Bearer $key" -H "apikey: $key" -H "Content-Type: image/png" -H "x-upsert: true" \
        --data-binary "@$f")
      echo "$name: $code"
    done
    db <<<"update public.reader_profiles set avatar_url = 'http://127.0.0.1:54321/storage/v1/object/public/bot-avatars/' || substr(username, 5) || '.png' where clerk_user_id like 'user_bot_%';" ;;
  list)
    db <<'SQL'
select r.slug, r.status, p.username as host,
  to_char(r.scheduled_for at time zone 'Asia/Kathmandu', 'Mon DD HH24:MI') as starts_npt
from public.chautari_rooms r left join public.reader_profiles p on p.clerk_user_id = r.host_clerk_id
where r.status <> 'ended' order by r.created_at desc;
SQL
    echo "Bots: $(db -tA <<<"select string_agg(username, ', ') from public.reader_profiles where clerk_user_id like 'user_bot_%';")" ;;
  say)
    [ $# -ge 2 ] || usage
    bot=$(bot_id "$2")
    text=${3:-${SAMPLE_LINES[RANDOM % ${#SAMPLE_LINES[@]}]}}
    push "$(say_sql "$1" "$bot" "$text")" chautari.chat && echo "said: $text" ;;
  chatter)
    [ $# -ge 1 ] || usage
    count=${2:-6} secs=${3:-2}
    mapfile -t bots < <(db -tA <<<"select clerk_user_id from public.reader_profiles where clerk_user_id like 'user_bot_%' order by username;")
    for ((i = 0; i < count; i++)); do
      text=${SAMPLE_LINES[i % ${#SAMPLE_LINES[@]}]}
      push "$(say_sql "$1" "${bots[i % ${#bots[@]}]}" "$text")" chautari.chat && echo "said: $text"
      ((i + 1 < count)) && sleep "$secs"
    done ;;
  unsay)
    [ $# -ge 1 ] || usage
    bot=""; [ $# -ge 2 ] && bot=$(bot_id "$2")
    line=$(db -tA -v slug="$1" -v bot="$bot" <<'SQL'
with m as (
  select m.id, r.livekit_room from public.chautari_messages m
  join public.chautari_rooms r on r.id = m.room_id
  where r.slug = :'slug' and m.deleted_at is null and (:'bot' = '' or m.clerk_user_id = :'bot')
  order by m.created_at desc limit 1
)
update public.chautari_messages c
set deleted_at = now(), deleted_by = coalesce(nullif(:'bot', ''), 'bots.sh')
from m where c.id = m.id
returning m.livekit_room || E'\t' || json_build_object('type', 'delete', 'id', c.id)::text;
SQL
)
    push "$line" chautari.chat && echo "deleted the latest message" ;;
  clap)
    [ $# -ge 1 ] || usage
    bot=""; [ $# -ge 2 ] && bot=$(bot_id "$2")
    line=$(db -tA -v slug="$1" -v bot="$bot" <<'SQL'
select r.livekit_room || E'\t' || json_build_object(
  'type', 'effect', 'effect', 'clap', 'by', coalesce(p.display_name, 'The host'))::text
from public.chautari_rooms r
left join public.reader_profiles p on p.clerk_user_id = coalesce(nullif(:'bot', ''), r.host_clerk_id)
where r.slug = :'slug' and r.status = 'live';
SQL
)
    push "$line" chautari.effect && echo "clapped" ;;
  chat)
    [ $# -eq 1 ] || usage
    db -v slug="$1" <<'SQL'
select to_char(m.created_at at time zone 'Asia/Kathmandu', 'HH24:MI:SS') as npt,
  m.display_name as name, m.role, left(m.body, 60) as text,
  case when m.deleted_at is not null then 'deleted' else '' end as state
from public.chautari_messages m join public.chautari_rooms r on r.id = m.room_id
where r.slug = :'slug' order by m.created_at desc limit 20;
SQL
    ;;
  reports)
    db <<'SQL'
select to_char(created_at at time zone 'Asia/Kathmandu', 'Mon DD HH24:MI') as npt, source, reason, context,
  coalesce('@' || reported_username, reported_clerk_id) as reported,
  coalesce('@' || reporter_username, case when source = 'filter' then 'filter' end) as reporter,
  left(coalesce(message_text, ''), 40) as message, left(coalesce(details, ''), 40) as details, status
from public.reader_reports order by created_at desc limit 10;
SQL
    ;;
  join)
    [ $# -ge 1 ] || usage
    slug=$1; shift
    ids=()
    if [ $# -eq 0 ]; then
      mapfile -t ids < <(db -tA <<<"select clerk_user_id from public.reader_profiles where clerk_user_id like 'user_bot_%' order by username;")
    else
      for b in "$@"; do ids+=("$(bot_id "$b")"); done
    fi
    lk=$(db -tA -v slug="$slug" <<<"select livekit_room from public.chautari_rooms where slug = :'slug' and status = 'live';")
    [ -n "$lk" ] || { echo "No live room called $slug." >&2; exit 1; }
    # The LiveKit client lives in its own folder, installed on first use.
    [ -d "$here/livekit-bots/node_modules/@livekit/rtc-node" ] ||
      npm install --prefix "$here/livekit-bots" --no-audit --no-fund >/dev/null || exit 1
    # Not the host: a bot hosting this room would also be its host on screen.
    db -tA -F $'\t' -v ids="$(IFS=,; echo "${ids[*]}")" -v slug="$slug" <<'SQL' |
select p.clerk_user_id, coalesce(p.display_name, p.username), p.username, coalesce(p.avatar_url, '')
from public.reader_profiles p
where p.clerk_user_id = any(string_to_array(:'ids', ','))
  and p.clerk_user_id <> (select host_clerk_id from public.chautari_rooms where slug = :'slug');
SQL
      node "$here/livekit-bots/join.mjs" "$lk" "$SITE_ENV" 2>&1 |
      grep --line-buffered -v -e '^{"level"' -e 'Decoder is supported' ;;
  lock)
    [ $# -ge 1 ] || usage
    on=true; [ "${2:-}" = off ] && on=false
    line=$(db -tA -F $'\t' -v slug="$1" -v on="$on" <<'SQL'
update public.chautari_rooms set invite_only = :'on'::boolean, updated_at = now()
where slug = :'slug' and status <> 'ended'
returning livekit_room, json_build_object('type', 'settings', 'inviteOnly', invite_only, 'membersCanInvite', members_can_invite)::text;
SQL
)
    [ -n "$line" ] || { echo "No open room called $1." >&2; exit 1; }
    # Tell the apps in the room, if LiveKit has it (someone has joined).
    push "$line" chautari.room >/dev/null 2>&1 || true
    [ "$on" = true ] && echo "$1 is invite only" || echo "$1 is public" ;;
  members)
    [ $# -ge 1 ] || usage
    on=true; [ "${2:-}" = off ] && on=false
    line=$(db -tA -F $'\t' -v slug="$1" -v on="$on" <<'SQL'
update public.chautari_rooms set members_can_invite = :'on'::boolean, updated_at = now()
where slug = :'slug' and status <> 'ended'
returning livekit_room, json_build_object('type', 'settings', 'inviteOnly', invite_only, 'membersCanInvite', members_can_invite)::text;
SQL
)
    [ -n "$line" ] || { echo "No open room called $1." >&2; exit 1; }
    push "$line" chautari.room >/dev/null 2>&1 || true
    [ "$on" = true ] && echo "members of $1 can invite" || echo "only the host and moderators of $1 can invite" ;;
  ask)
    [ $# -ge 2 ] || usage
    bot=$(bot_id "$2")
    # What the site's join-request route does: a pending request, then a
    # join_request event (here to everyone in the room, not only the host).
    line=$(db -tA -F $'\t' -v slug="$1" -v bot="$bot" <<'SQL'
with r as (
  select id, livekit_room from public.chautari_rooms where slug = :'slug' and status = 'live'
), q as (
  insert into public.chautari_join_requests (room_id, clerk_user_id, status, created_at, decided_at, decided_by)
  select r.id, :'bot', 'pending', now(), null, null from r
  on conflict (room_id, clerk_user_id) do update
    set status = 'pending', created_at = now(), decided_at = null, decided_by = null
  returning id
)
select r.livekit_room, json_build_object(
  'type', 'join_request', 'requestId', q.id, 'name', coalesce(p.display_name, p.username),
  'username', p.username, 'avatarUrl', p.avatar_url)::text
from r, q left join public.reader_profiles p on p.clerk_user_id = :'bot';
SQL
)
    [ -n "$line" ] || { echo "No live room called $1." >&2; exit 1; }
    if push "$line" chautari.room >/dev/null 2>&1; then echo "$2 asked to join $1"
    else echo "$2 asked to join $1 (saved; nobody is in the room yet, so no toast)"; fi ;;
  letin)
    [ $# -eq 2 ] || usage
    out=$(db -tA -v slug="$1" -v u="${2#@}" <<'SQL'
update public.chautari_join_requests q set status = 'approved', decided_at = now(), decided_by = 'bots.sh'
from public.chautari_rooms r, public.reader_profiles p
where r.slug = :'slug' and q.room_id = r.id and p.username = :'u' and q.clerk_user_id = p.clerk_user_id
  and q.status = 'pending'
returning q.id;
SQL
)
    [ -n "$out" ] && echo "let $2 into $1" || { echo "No pending request from $2 in $1." >&2; exit 1; } ;;
  *) usage ;;
esac
