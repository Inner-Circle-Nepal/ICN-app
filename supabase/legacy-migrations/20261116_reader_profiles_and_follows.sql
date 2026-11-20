-- ============================================================================
--  Reader profiles + follow graph
--
--  Today every reader is a bare Clerk account: email + auto-synthesized
--  username (hidden from the user) + empty firstName/lastName. No reader-side
--  row exists in Supabase, which means there is no public identity, nothing
--  to follow, and the Chautari UI leaks raw Clerk ids as display names.
--
--  These two tables are the foundation. `reader_profiles` is the projection
--  of each Clerk user that other readers may see; `user_follows` is the edge
--  graph that follower-based features (profile pages, follower counts, and
--  later follower-filtered Chautari push) build on.
--
--  Writes never come through the Supabase client: the mobile app's anon key
--  cannot prove which Clerk user it is, so writes go through the website
--  backend's Next.js API routes under /api/reader/*, which verify the Clerk
--  session and use the service role. Reads of public profile data are open
--  to anon/authenticated.
--
--  Run once in the Supabase SQL editor. Safe to re-run.
-- ============================================================================

-- ----------------------------------------------------------------------------
--  reader_profiles — one row per Clerk user that has completed signup.
-- ----------------------------------------------------------------------------

create table if not exists public.reader_profiles (
  clerk_user_id text primary key
                check (clerk_user_id ~ '^user_'),

  -- Public @handle. Lowercase, letters + digits + underscore, 3-30 chars.
  -- The website's signup route enforces the reserved-words list in addition.
  username      text not null unique
                check (username ~ '^[a-z0-9_]{3,30}$'),

  -- What other readers actually see. May contain any script (Latin, Devanagari,
  -- etc.) and spaces. Trimmed length is what counts.
  display_name  text not null
                check (char_length(btrim(display_name)) between 1 and 60),

  bio           text
                check (bio is null or char_length(bio) <= 240),

  -- Mirror of the Clerk CDN URL at the time of the reader's last upload.
  -- Nullable — fallback is initials from display_name via Avatar.tsx.
  avatar_url    text,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Belt-and-suspenders: the regex above already guarantees lowercase, so this
-- index is redundant today — but if the regex is ever relaxed to accept mixed
-- case, this prevents "Aksho" and "aksho" from coexisting as separate rows.
create unique index if not exists reader_profiles_username_lower_idx
  on public.reader_profiles (lower(username));

-- Auto-touch updated_at on any UPDATE. Shared helper, safe to create once.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists reader_profiles_updated_at on public.reader_profiles;
create trigger reader_profiles_updated_at
  before update on public.reader_profiles
  for each row
  execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
--  user_follows — directed edge graph.
--
--  A row (A, B) means "A follows B". Deleting either reader's profile removes
--  every edge they were part of. Reverse lookup ("who follows B") is the hot
--  path for the eventual follower-filtered push, hence the followee index.
-- ----------------------------------------------------------------------------

create table if not exists public.user_follows (
  follower_clerk_id text not null
                    references public.reader_profiles(clerk_user_id) on delete cascade,
  followee_clerk_id text not null
                    references public.reader_profiles(clerk_user_id) on delete cascade,
  created_at        timestamptz not null default now(),
  primary key (follower_clerk_id, followee_clerk_id),
  check (follower_clerk_id <> followee_clerk_id)
);

create index if not exists user_follows_followee_idx
  on public.user_follows (followee_clerk_id);

-- ----------------------------------------------------------------------------
--  RLS: public read, no client writes.
--
--  Write paths are all routed through the website backend using the service
--  role, which bypasses RLS entirely. The anon/authenticated roles get SELECT
--  only, via explicit policies, so the mobile anon client can render profile
--  pages and follower counts without a server hop.
-- ----------------------------------------------------------------------------

alter table public.reader_profiles enable row level security;
alter table public.user_follows    enable row level security;

drop policy if exists reader_profiles_public_read on public.reader_profiles;
create policy reader_profiles_public_read
  on public.reader_profiles
  for select
  using (true);

drop policy if exists user_follows_public_read on public.user_follows;
create policy user_follows_public_read
  on public.user_follows
  for select
  using (true);

-- Explicit grants so the anon key may SELECT (the policy still gates what it
-- sees — here, everything). No INSERT/UPDATE/DELETE grants: clients cannot
-- write even with a bypassed policy.
grant select on public.reader_profiles to anon, authenticated;
grant select on public.user_follows    to anon, authenticated;
