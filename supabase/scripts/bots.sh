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
#
# <bot> is a username without or with the prefix: `sita` or `bot_sita`.
#
# Going live (`live`, `golive`) changes chautari_rooms the same way the site
# does, so the live-push webhook fires: followers of that bot with "Notify me"
# on get the real notification on their phone.
set -euo pipefail

db() { docker exec -i supabase_db_ICN-app psql -U postgres -q -v ON_ERROR_STOP=1 "$@"; }

usage() { sed -n '5,10p' "$0" | sed 's/^# \{0,1\}//'; exit 1; }

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
  list)
    db <<'SQL'
select r.slug, r.status, p.username as host,
  to_char(r.scheduled_for at time zone 'Asia/Kathmandu', 'Mon DD HH24:MI') as starts_npt
from public.chautari_rooms r left join public.reader_profiles p on p.clerk_user_id = r.host_clerk_id
where r.status <> 'ended' order by r.created_at desc;
SQL
    echo "Bots: $(db -tA <<<"select string_agg(username, ', ') from public.reader_profiles where clerk_user_id like 'user_bot_%';")" ;;
  *) usage ;;
esac
