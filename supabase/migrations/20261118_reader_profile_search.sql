-- ============================================================================
--  Reader search: find a reader by @handle or by name.
--
--  Used by the app's People search and the @handle dropdowns (Chautari
--  moderators, invites). Called straight from the app with the anon key via
--  `rpc('search_reader_profiles', { q, lim })`: `reader_profiles` is already
--  publicly readable, so this exposes nothing new.
--
--  Staying fast as the table grows:
--    * Handle prefix ("@a…") is a range scan on a text_pattern_ops btree. A
--      range (`~>=~` / `~<~`) rather than `like q || '%'`, because a LIKE
--      pattern built from a parameter cannot use a btree index.
--    * Name contains ("sharma") uses a pg_trgm GIN index. Trigrams need three
--      characters, so names are only matched from three characters on;
--      shorter input matches handles only.
--    * Every branch is capped, and the result is at most 20 rows.
--
--  Only readers who completed signup have a row, so only they are found.
--
--  Run once in the Supabase SQL editor. Safe to re-run.
-- ============================================================================

-- Supabase keeps extensions in the `extensions` schema; an older project may
-- have pg_trgm in `public`. The search path makes `gin_trgm_ops` resolve in
-- either case.
create extension if not exists pg_trgm with schema extensions;
set search_path = public, extensions;

create index if not exists reader_profiles_username_pattern_idx
  on public.reader_profiles (username text_pattern_ops);

create index if not exists reader_profiles_display_name_trgm_idx
  on public.reader_profiles using gin (lower(display_name) gin_trgm_ops);

drop function if exists public.search_reader_profiles(text, integer);
create function public.search_reader_profiles(q text, lim integer default 8)
returns setof public.reader_profiles
language sql
stable
set search_path = public, extensions
as $$
  with params as (
    select
      term,
      least(greatest(coalesce(lim, 8), 1), 20) as cap,
      -- Escape LIKE wildcards so "a_b" means a literal underscore.
      replace(replace(replace(term, '\', '\\'), '%', '\%'), '_', '\_') as pat
    from (
      select lower(btrim(regexp_replace(coalesce(q, ''), '^\s*@+', ''))) as term
    ) t
  ),
  -- Handles starting with the term, in handle order. An exact match sorts
  -- first on its own because it is the shortest string in the range.
  by_handle as (
    select p.clerk_user_id,
           case when p.username = params.term then 0 else 1 end as rank
    from public.reader_profiles p, params
    where params.term ~ '^[a-z0-9_]{1,30}$'
      and p.username ~>=~ params.term
      -- '{' sorts just after 'z', and handles are only [a-z0-9_].
      and p.username ~<~ (params.term || '{')
    order by p.username using ~<~
    limit (select cap from params)
  ),
  -- Display names containing the term; a word that starts with it ranks
  -- above a match in the middle of a word.
  by_name as (
    select p.clerk_user_id,
           case
             when lower(p.display_name) like params.pat || '%'
               or lower(p.display_name) like '% ' || params.pat || '%'
             then 2 else 3
           end as rank
    from public.reader_profiles p, params
    where char_length(params.term) >= 3
      and lower(p.display_name) like '%' || params.pat || '%'
    limit 100
  ),
  merged as (
    select clerk_user_id, min(rank) as rank
    from (select * from by_handle union all select * from by_name) u
    group by clerk_user_id
  )
  select p.*
  from merged m
  join public.reader_profiles p using (clerk_user_id)
  order by m.rank, char_length(p.username), p.username
  limit (select cap from params);
$$;

revoke all on function public.search_reader_profiles(text, integer) from public;
grant execute on function public.search_reader_profiles(text, integer) to anon, authenticated;

reset search_path;
