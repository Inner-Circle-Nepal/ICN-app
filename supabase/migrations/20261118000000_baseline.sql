


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE EXTENSION IF NOT EXISTS "pg_cron" WITH SCHEMA "pg_catalog";






CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "extensions";






COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pg_trgm" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "unaccent" WITH SCHEMA "public";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE TYPE "public"."app_role" AS ENUM (
    'superadmin',
    'admin'
);


ALTER TYPE "public"."app_role" OWNER TO "postgres";


CREATE TYPE "public"."article_status" AS ENUM (
    'draft',
    'scheduled',
    'published',
    'archived'
);


ALTER TYPE "public"."article_status" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_analytics_by_author"("days" integer DEFAULT 30) RETURNS TABLE("user_id" "uuid", "name" "text", "email" "text", "articles" bigint, "views" bigint, "readers" bigint)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  since timestamptz := now() - make_interval(days => greatest(days, 1));
begin
  if not public.has_cap('analytics:all') then
    raise exception 'Not permitted to read newsroom-wide analytics';
  end if;

  return query
  select p.id, coalesce(p.full_name, p.email), p.email,
         count(distinct a.id)::bigint,
         count(e.id) filter (where e.kind = 'view')::bigint,
         count(distinct e.session_id) filter (where e.kind = 'view')::bigint
    from public.profiles p
    left join public.articles a on a.created_by = p.id
    left join public.analytics_events e
           on e.article_id = a.id and e.created_at >= since
   group by p.id, p.full_name, p.email
   order by 5 desc;
end;
$$;


ALTER FUNCTION "public"."admin_analytics_by_author"("days" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_analytics_daily"("days" integer DEFAULT 30) RETURNS TABLE("day" "date", "views" bigint, "readers" bigint)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  scope_all boolean := public.has_cap('analytics:all');
  since timestamptz := now() - make_interval(days => greatest(days, 1));
begin
  if not (scope_all or public.has_cap('analytics:own')) then
    raise exception 'Not permitted to read analytics';
  end if;

  return query
  select d::date,
         count(e.id) filter (where e.kind = 'view')::bigint,
         count(distinct e.session_id) filter (where e.kind = 'view')::bigint
  from generate_series(date_trunc('day', since), date_trunc('day', now()), '1 day') d
  left join public.analytics_events e
         on date_trunc('day', e.created_at) = d
  left join public.articles a on a.id = e.article_id
       and (scope_all or a.created_by = auth.uid())
  where e.id is null or scope_all or a.id is not null
  group by d
  order by d;
end;
$$;


ALTER FUNCTION "public"."admin_analytics_daily"("days" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_analytics_top"("days" integer DEFAULT 30, "lim" integer DEFAULT 10) RETURNS TABLE("article_id" "uuid", "slug" "text", "title" "text", "status" "text", "author_name" "text", "views" bigint, "readers" bigint, "shares" bigint, "completions" bigint)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  scope_all boolean := public.has_cap('analytics:all');
  since timestamptz := now() - make_interval(days => greatest(days, 1));
begin
  if not (scope_all or public.has_cap('analytics:own')) then
    raise exception 'Not permitted to read analytics';
  end if;

  return query
  select a.id, a.slug, a.title, a.status::text,
         coalesce(au.name, p.full_name, '—'),
         count(e.id) filter (where e.kind = 'view')::bigint,
         count(distinct e.session_id) filter (where e.kind = 'view')::bigint,
         count(e.id) filter (where e.kind = 'share')::bigint,
         count(e.id) filter (where e.kind = 'read_100')::bigint
    from public.articles a
    left join public.authors au on au.id = a.author_id
    left join public.profiles p on p.id = a.created_by
    left join public.analytics_events e
           on e.article_id = a.id and e.created_at >= since
   where scope_all or a.created_by = auth.uid()
   group by a.id, a.slug, a.title, a.status, au.name, p.full_name
   order by 6 desc, a.published_at desc
   limit greatest(lim, 1);
end;
$$;


ALTER FUNCTION "public"."admin_analytics_top"("days" integer, "lim" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_analytics_totals"("days" integer DEFAULT 30) RETURNS TABLE("views" bigint, "readers" bigint, "shares" bigint, "saves" bigint, "completions" bigint, "articles_live" bigint)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  scope_all boolean := public.has_cap('analytics:all');
  since timestamptz := now() - make_interval(days => greatest(days, 1));
begin
  if not (scope_all or public.has_cap('analytics:own')) then
    raise exception 'Not permitted to read analytics';
  end if;

  return query
  with scoped as (
    select e.* from public.analytics_events e
    left join public.articles a on a.id = e.article_id
    where e.created_at >= since
      and (scope_all or a.created_by = auth.uid())
  )
  select
    count(*) filter (where kind = 'view')::bigint,
    count(distinct session_id) filter (where kind = 'view')::bigint,
    count(*) filter (where kind = 'share')::bigint,
    count(*) filter (where kind = 'save')::bigint,
    count(*) filter (where kind = 'read_100')::bigint,
    (select count(*) from public.articles a2
      where a2.status = 'published' and (scope_all or a2.created_by = auth.uid()))::bigint
  from scoped;
end;
$$;


ALTER FUNCTION "public"."admin_analytics_totals"("days" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ads_touch_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at := now();
  return new;
end;
$$;


ALTER FUNCTION "public"."ads_touch_updated_at"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."ai_jobs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "kind" "text" NOT NULL,
    "subject_id" "uuid",
    "language" "text",
    "dedupe_key" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "attempts" integer DEFAULT 0 NOT NULL,
    "max_attempts" integer DEFAULT 3 NOT NULL,
    "last_error" "text",
    "locked_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "ai_jobs_kind_check" CHECK (("kind" = ANY (ARRAY['article_metadata'::"text", 'briefing'::"text", 'cluster'::"text"]))),
    CONSTRAINT "ai_jobs_language_check" CHECK (("language" = ANY (ARRAY['en'::"text", 'ne'::"text"]))),
    CONSTRAINT "ai_jobs_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'running'::"text", 'done'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."ai_jobs" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ai_claim_jobs"("batch" integer DEFAULT 5) RETURNS SETOF "public"."ai_jobs"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  return query
  with claimed as (
    select j.id
      from public.ai_jobs j
     where (
             j.status = 'pending'
             or (j.status = 'running' and j.locked_at < now() - interval '1 hour')
           )
       and j.attempts < j.max_attempts
     order by j.created_at
     limit greatest(1, least(batch, 50))
     for update skip locked
  )
  update public.ai_jobs j
     set status = 'running',
         locked_at = now(),
         attempts = j.attempts + 1,
         updated_at = now()
    from claimed
   where j.id = claimed.id
  returning j.*;
end;
$$;


ALTER FUNCTION "public"."ai_claim_jobs"("batch" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."analytics_bump_view_count"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if new.kind = 'view' and new.article_id is not null then
    update public.articles
       set view_count = view_count + 1
     where id = new.article_id;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."analytics_bump_view_count"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."articles_search_vector_update"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.search_vector :=
      setweight(to_tsvector('english', coalesce(new.title, '')),   'A')
   || setweight(to_tsvector('english', coalesce(new.excerpt, '')), 'B')
   || setweight(to_tsvector('english', coalesce(new.body, '')),    'C');
  return new;
end;
$$;


ALTER FUNCTION "public"."articles_search_vector_update"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."articles_touch_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  if new.status = 'published' and old.status = 'published' then
    new.updated_at := now();
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."articles_touch_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."close_stale_shifts"("max_hours" integer DEFAULT 12) RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  closed int;
begin
  update public.shifts
     set ended_at = started_at + make_interval(hours => max_hours),
         auto_closed = true
   where ended_at is null
     and started_at < now() - make_interval(hours => max_hours);

  get diagnostics closed = row_count;
  return closed;
end;
$$;


ALTER FUNCTION "public"."close_stale_shifts"("max_hours" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  first_user boolean;
begin
  select count(*) = 0 into first_user from public.profiles;

  insert into public.profiles (id, email, full_name, role, capabilities)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    case when first_user then 'superadmin'::public.app_role else 'admin'::public.app_role end,
    '{}'
  )
  on conflict (id) do nothing;

  return new;
end;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."has_cap"("cap" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1 from public.profiles p
     where p.id = auth.uid()
       and p.is_active
       and (p.role = 'superadmin' or cap = any(p.capabilities))
  );
$$;


ALTER FUNCTION "public"."has_cap"("cap" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."increment_article_views"("article_slug" "text") RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  update public.articles
     set view_count = view_count + 1
   where slug = article_slug and status = 'published';
$$;


ALTER FUNCTION "public"."increment_article_views"("article_slug" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_editor"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (select 1 from public.editors e where e.user_id = auth.uid());
$$;


ALTER FUNCTION "public"."is_editor"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_staff"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.is_active
  );
$$;


ALTER FUNCTION "public"."is_staff"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_superadmin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1 from public.profiles p
     where p.id = auth.uid() and p.role = 'superadmin' and p.is_active
  );
$$;


ALTER FUNCTION "public"."is_superadmin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."my_author_id"() RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select author_id from public.profiles where id = auth.uid();
$$;


ALTER FUNCTION "public"."my_author_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."profiles_guard_privileges"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if public.is_superadmin() then
    new.updated_at := now();
    return new;
  end if;

  -- Self-service edits cannot escalate.
  if new.role is distinct from old.role
     or new.capabilities is distinct from old.capabilities
     or new.is_active is distinct from old.is_active
     or new.author_id is distinct from old.author_id then
    raise exception 'Only a superadmin may change role, capabilities, status or byline link';
  end if;

  new.updated_at := now();
  return new;
end;
$$;


ALTER FUNCTION "public"."profiles_guard_privileges"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_ad_event"("creative" "uuid", "kind" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if kind = 'impression' then
    update public.ad_creatives set impressions = impressions + 1 where id = creative;
  elsif kind = 'click' then
    update public.ad_creatives set clicks = clicks + 1 where id = creative;
  end if;
end;
$$;


ALTER FUNCTION "public"."record_ad_event"("creative" "uuid", "kind" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."register_push_token"("p_token" "text", "p_platform" "text", "p_language" "text" DEFAULT 'en'::"text", "p_edition" "text" DEFAULT NULL::"text", "p_breaking" boolean DEFAULT NULL::boolean) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  insert into public.mobile_push_tokens (token, platform, language, edition, breaking_enabled)
  values (p_token, p_platform, coalesce(p_language, 'en'), p_edition, coalesce(p_breaking, true))
  on conflict (token) do update
    set platform         = excluded.platform,
        language         = excluded.language,
        edition          = excluded.edition,
        breaking_enabled = coalesce(p_breaking, public.mobile_push_tokens.breaking_enabled),
        last_seen_at     = now();
end;
$$;


ALTER FUNCTION "public"."register_push_token"("p_token" "text", "p_platform" "text", "p_language" "text", "p_edition" "text", "p_breaking" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reset_ad_counters"("creative" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if not public.has_cap('ads:manage') then
    raise exception 'ads:manage required';
  end if;

  update public.ad_creatives
     set impressions = 0, clicks = 0
   where id = creative;
end;
$$;


ALTER FUNCTION "public"."reset_ad_counters"("creative" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rls_auto_enable"() RETURNS "event_trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."rls_auto_enable"() OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."reader_profiles" (
    "clerk_user_id" "text" NOT NULL,
    "username" "text" NOT NULL,
    "display_name" "text" NOT NULL,
    "bio" "text",
    "avatar_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "reader_profiles_bio_check" CHECK ((("bio" IS NULL) OR ("char_length"("bio") <= 240))),
    CONSTRAINT "reader_profiles_clerk_user_id_check" CHECK (("clerk_user_id" ~ '^user_'::"text")),
    CONSTRAINT "reader_profiles_display_name_check" CHECK ((("char_length"("btrim"("display_name")) >= 1) AND ("char_length"("btrim"("display_name")) <= 60))),
    CONSTRAINT "reader_profiles_username_check" CHECK (("username" ~ '^[a-z0-9_]{3,30}$'::"text"))
);


ALTER TABLE "public"."reader_profiles" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."search_reader_profiles"("q" "text", "lim" integer DEFAULT 8) RETURNS SETOF "public"."reader_profiles"
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public', 'extensions'
    AS $_$
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
$_$;


ALTER FUNCTION "public"."search_reader_profiles"("q" "text", "lim" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_breaking_push_preference"("p_token" "text", "p_enabled" boolean) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  update public.mobile_push_tokens
     set breaking_enabled = p_enabled,
         last_seen_at     = now()
   where token = p_token;
end;
$$;


ALTER FUNCTION "public"."set_breaking_push_preference"("p_token" "text", "p_enabled" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_chautari_push_preference"("p_token" "text", "p_enabled" boolean) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  update public.mobile_push_tokens
     set chautari_enabled = p_enabled,
         last_seen_at     = now()
   where token = p_token;
end;
$$;


ALTER FUNCTION "public"."set_chautari_push_preference"("p_token" "text", "p_enabled" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_reminder_push_preference"("p_token" "text", "p_enabled" boolean) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  update public.mobile_push_tokens
     set reminders_enabled = p_enabled,
         last_seen_at      = now()
   where token = p_token;
end;
$$;


ALTER FUNCTION "public"."set_reminder_push_preference"("p_token" "text", "p_enabled" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."shifts_touch_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at := now();
  return new;
end;
$$;


ALTER FUNCTION "public"."shifts_touch_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."snapshot_month"("month" "date") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  zone  constant text := 'Asia/Kathmandu';
  first date := date_trunc('month', month)::date;
  people int;
begin
  insert into public.monthly_timesheets as m (
    profile_id, month, total_minutes, shift_count, days_worked,
    flagged_count, first_in, last_out, generated_at
  )
  select
    s.profile_id,
    first,
    coalesce(sum(
      case when s.ended_at is not null and not s.auto_closed
           then extract(epoch from (s.ended_at - s.started_at)) / 60
      end
    ), 0)::int,
    count(*) filter (where s.ended_at is not null),
    count(distinct ((s.started_at at time zone zone)::date)),
    count(*) filter (where s.auto_closed),
    min(s.started_at),
    max(s.ended_at),
    now()
  from public.shifts s
  where date_trunc('month', (s.started_at at time zone zone))::date = first
  group by s.profile_id
  on conflict (profile_id, month) do update
    set total_minutes = excluded.total_minutes,
        shift_count   = excluded.shift_count,
        days_worked   = excluded.days_worked,
        flagged_count = excluded.flagged_count,
        first_in      = excluded.first_in,
        last_out      = excluded.last_out,
        generated_at  = excluded.generated_at;

  get diagnostics people = row_count;
  return people;
end;
$$;


ALTER FUNCTION "public"."snapshot_month"("month" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."touch_reader_subscription"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."touch_reader_subscription"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."unregister_push_token"("p_token" "text") RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  delete from public.mobile_push_tokens where token = p_token;
$$;


ALTER FUNCTION "public"."unregister_push_token"("p_token" "text") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ad_creatives" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "placement" "text" NOT NULL,
    "name" "text" NOT NULL,
    "advertiser" "text",
    "image_url" "text" NOT NULL,
    "image_alt" "text" NOT NULL,
    "target_url" "text" NOT NULL,
    "starts_at" timestamp with time zone,
    "ends_at" timestamp with time zone,
    "weight" integer DEFAULT 1 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "impressions" bigint DEFAULT 0 NOT NULL,
    "clicks" bigint DEFAULT 0 NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "ad_creatives_dates" CHECK ((("ends_at" IS NULL) OR ("starts_at" IS NULL) OR ("ends_at" > "starts_at"))),
    CONSTRAINT "ad_creatives_image_alt_check" CHECK (("char_length"("btrim"("image_alt")) > 0)),
    CONSTRAINT "ad_creatives_target_url_check" CHECK (("target_url" ~* '^https?://'::"text")),
    CONSTRAINT "ad_creatives_weight_check" CHECK ((("weight" >= 1) AND ("weight" <= 100)))
);


ALTER TABLE "public"."ad_creatives" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ad_placements" (
    "slug" "text" NOT NULL,
    "label" "text" NOT NULL,
    "description" "text",
    "sort_order" integer DEFAULT 100 NOT NULL,
    "is_enabled" boolean DEFAULT false NOT NULL,
    "adsense_slot" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."ad_placements" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ad_settings" (
    "id" boolean DEFAULT true NOT NULL,
    "ads_enabled" boolean DEFAULT false NOT NULL,
    "adsense_enabled" boolean DEFAULT false NOT NULL,
    "adsense_client" "text",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_by" "uuid",
    CONSTRAINT "ad_settings_id_check" CHECK ("id")
);


ALTER TABLE "public"."ad_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ai_answers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "article_id" "uuid" NOT NULL,
    "language" "text" NOT NULL,
    "question" "text" NOT NULL,
    "question_hash" "text" NOT NULL,
    "answer" "text" NOT NULL,
    "citations" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "uncertainties" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "model" "text",
    "source_hash" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "ai_answers_language_check" CHECK (("language" = ANY (ARRAY['en'::"text", 'ne'::"text"])))
);


ALTER TABLE "public"."ai_answers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ai_article_metadata" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "article_id" "uuid" NOT NULL,
    "language" "text" NOT NULL,
    "summary_short" "text",
    "summary_long" "text",
    "takeaways" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "why_it_matters" "text",
    "background" "text",
    "topics" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "entities" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "uncertainties" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "reading_minutes" integer,
    "model" "text",
    "source_hash" "text" NOT NULL,
    "prompt_version" integer DEFAULT 1 NOT NULL,
    "generated_at" timestamp with time zone,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "last_error" "text",
    "review_state" "text" DEFAULT 'approved'::"text" NOT NULL,
    "reviewed_by" "text",
    "reviewed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "ai_article_metadata_language_check" CHECK (("language" = ANY (ARRAY['en'::"text", 'ne'::"text"]))),
    CONSTRAINT "ai_article_metadata_review_state_check" CHECK (("review_state" = ANY (ARRAY['approved'::"text", 'needs_review'::"text", 'rejected'::"text"]))),
    CONSTRAINT "ai_article_metadata_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'ready'::"text", 'failed'::"text", 'skipped'::"text"])))
);


ALTER TABLE "public"."ai_article_metadata" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ai_briefing_items" (
    "briefing_id" "uuid" NOT NULL,
    "article_id" "uuid" NOT NULL,
    "rank" integer NOT NULL,
    "blurb" "text",
    "significance" "text"
);


ALTER TABLE "public"."ai_briefing_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ai_briefings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "slug" "text" NOT NULL,
    "kind" "text" NOT NULL,
    "language" "text" NOT NULL,
    "edition" "text",
    "headline" "text",
    "intro" "text",
    "model" "text",
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "edition_date" "date" NOT NULL,
    "generated_at" timestamp with time zone,
    "published_at" timestamp with time zone,
    CONSTRAINT "ai_briefings_kind_check" CHECK (("kind" = ANY (ARRAY['morning'::"text", 'evening'::"text"]))),
    CONSTRAINT "ai_briefings_language_check" CHECK (("language" = ANY (ARRAY['en'::"text", 'ne'::"text"]))),
    CONSTRAINT "ai_briefings_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'published'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."ai_briefings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ai_usage_daily" (
    "day" "date" NOT NULL,
    "model" "text" NOT NULL,
    "requests" integer DEFAULT 0 NOT NULL,
    "input_tokens" bigint DEFAULT 0 NOT NULL,
    "output_tokens" bigint DEFAULT 0 NOT NULL,
    "failures" integer DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."ai_usage_daily" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."analytics_events" (
    "id" bigint NOT NULL,
    "article_id" "uuid",
    "path" "text" NOT NULL,
    "kind" "text" NOT NULL,
    "session_id" "text",
    "referrer" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "analytics_events_kind_check" CHECK (("kind" = ANY (ARRAY['view'::"text", 'share'::"text", 'save'::"text", 'read_50'::"text", 'read_100'::"text", 'outbound'::"text"])))
);


ALTER TABLE "public"."analytics_events" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."analytics_events_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."analytics_events_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."analytics_events_id_seq" OWNED BY "public"."analytics_events"."id";



CREATE TABLE IF NOT EXISTS "public"."app_notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "body" "text" NOT NULL,
    "path" "text",
    "audience" "text" DEFAULT 'all'::"text" NOT NULL,
    "edition" "text",
    "channels" "text"[] DEFAULT ARRAY['app'::"text"] NOT NULL,
    "recipients" integer DEFAULT 0 NOT NULL,
    "accepted" integer DEFAULT 0 NOT NULL,
    "failed" integer DEFAULT 0 NOT NULL,
    "pruned" integer DEFAULT 0 NOT NULL,
    "web_sent" integer DEFAULT 0 NOT NULL,
    "error" "text",
    "sent_by" "uuid",
    "sent_by_name" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "app_notifications_audience_check" CHECK (("audience" = ANY (ARRAY['all'::"text", 'signed_in'::"text", 'edition'::"text"]))),
    CONSTRAINT "app_notifications_body_check" CHECK ((("char_length"("body") >= 1) AND ("char_length"("body") <= 400))),
    CONSTRAINT "app_notifications_title_check" CHECK ((("char_length"("title") >= 1) AND ("char_length"("title") <= 120)))
);


ALTER TABLE "public"."app_notifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."app_push_tokens" (
    "token" "text" NOT NULL,
    "platform" "text" NOT NULL,
    "clerk_user_id" "text",
    "edition" "text",
    "app_version" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_seen_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_sent_at" timestamp with time zone,
    "last_error" "text",
    CONSTRAINT "app_push_tokens_platform_check" CHECK (("platform" = ANY (ARRAY['ios'::"text", 'android'::"text"])))
);


ALTER TABLE "public"."app_push_tokens" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."article_tags" (
    "article_id" "uuid" NOT NULL,
    "tag_id" "uuid" NOT NULL
);


ALTER TABLE "public"."article_tags" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."articles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "slug" "text" NOT NULL,
    "title" "text" NOT NULL,
    "title_ne" "text",
    "excerpt" "text" NOT NULL,
    "excerpt_ne" "text",
    "body" "text" DEFAULT ''::"text" NOT NULL,
    "hero_image" "text",
    "hero_alt" "text",
    "hero_credit" "text",
    "category_id" "uuid" NOT NULL,
    "author_id" "uuid",
    "editions" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "status" "public"."article_status" DEFAULT 'draft'::"public"."article_status" NOT NULL,
    "published_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone,
    "is_featured" boolean DEFAULT false NOT NULL,
    "is_breaking" boolean DEFAULT false NOT NULL,
    "is_live" boolean DEFAULT false NOT NULL,
    "reading_minutes" integer DEFAULT 1 NOT NULL,
    "view_count" bigint DEFAULT 0 NOT NULL,
    "seo_title" "text",
    "seo_description" "text",
    "search_vector" "tsvector",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid"
);


ALTER TABLE "public"."articles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."authors" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "slug" "text" NOT NULL,
    "name" "text" NOT NULL,
    "role" "text",
    "bio" "text",
    "avatar_url" "text",
    "location" "text",
    "email" "text",
    "x_handle" "text",
    "linkedin_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."authors" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."categories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "slug" "text" NOT NULL,
    "name" "text" NOT NULL,
    "name_ne" "text",
    "description" "text",
    "accent" "text",
    "sort_order" integer DEFAULT 100 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "is_locked" boolean DEFAULT false NOT NULL,
    "locked_blurb" "text"
);


ALTER TABLE "public"."categories" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."chautari_bans" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "clerk_user_id" "text" NOT NULL,
    "display_name" "text",
    "reason" "text" NOT NULL,
    "expires_at" timestamp with time zone,
    "banned_by" "uuid",
    "banned_by_name" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "lifted_at" timestamp with time zone,
    "lifted_by" "uuid",
    "lift_note" "text",
    "report_id" "uuid"
);


ALTER TABLE "public"."chautari_bans" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."chautari_host_entitlements" (
    "clerk_user_id" "text" NOT NULL,
    "display_name" "text",
    "granted_by" "uuid",
    "granted_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "revoked_at" timestamp with time zone,
    "note" "text"
);


ALTER TABLE "public"."chautari_host_entitlements" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."chautari_invites" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "room_id" "uuid" NOT NULL,
    "inviter_clerk_id" "text" NOT NULL,
    "invitee_clerk_id" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "notified_at" timestamp with time zone
);


ALTER TABLE "public"."chautari_invites" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."chautari_moderation_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "action" "text" NOT NULL,
    "actor_id" "uuid",
    "actor_name" "text",
    "target_clerk_id" "text",
    "target_name" "text",
    "room_id" "uuid",
    "room_title" "text",
    "report_id" "uuid",
    "note" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "chautari_moderation_log_action_check" CHECK (("action" = ANY (ARRAY['end_room'::"text", 'remove_participant'::"text", 'ban'::"text", 'lift_ban'::"text", 'grant_host'::"text", 'revoke_host'::"text", 'resolve_report'::"text", 'dismiss_report'::"text", 'review_report'::"text"])))
);


ALTER TABLE "public"."chautari_moderation_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."chautari_participants" (
    "room_id" "uuid" NOT NULL,
    "clerk_user_id" "text" NOT NULL,
    "display_name" "text",
    "role" "text" DEFAULT 'listener'::"text" NOT NULL,
    "joined_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "left_at" timestamp with time zone,
    "removed_at" timestamp with time zone,
    "avatar_url" "text",
    CONSTRAINT "chautari_participants_role_check" CHECK (("role" = ANY (ARRAY['host'::"text", 'moderator'::"text", 'speaker'::"text", 'listener'::"text"])))
);


ALTER TABLE "public"."chautari_participants" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."chautari_push_log" (
    "room_id" "uuid" NOT NULL,
    "sent_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "recipients" integer DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."chautari_push_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."chautari_reports" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "room_id" "uuid",
    "room_slug" "text",
    "room_title" "text",
    "reporter_clerk_id" "text" NOT NULL,
    "reporter_name" "text",
    "target_clerk_id" "text",
    "target_name" "text",
    "reason" "text" NOT NULL,
    "details" "text",
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "resolution" "text",
    "resolved_by" "uuid",
    "resolved_by_name" "text",
    "resolved_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "chautari_reports_details_check" CHECK (("char_length"("details") <= 1000)),
    CONSTRAINT "chautari_reports_reason_check" CHECK (("reason" = ANY (ARRAY['harassment'::"text", 'hate'::"text", 'sexual'::"text", 'violence'::"text", 'self_harm'::"text", 'spam'::"text", 'misinformation'::"text", 'impersonation'::"text", 'other'::"text"]))),
    CONSTRAINT "chautari_reports_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'reviewing'::"text", 'actioned'::"text", 'dismissed'::"text"])))
);


ALTER TABLE "public"."chautari_reports" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."chautari_rooms" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "slug" "text" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "host_clerk_id" "text" NOT NULL,
    "host_name" "text",
    "status" "text" DEFAULT 'scheduled'::"text" NOT NULL,
    "livekit_room" "text" NOT NULL,
    "scheduled_for" timestamp with time zone,
    "started_at" timestamp with time zone,
    "ended_at" timestamp with time zone,
    "max_participants" integer DEFAULT 200 NOT NULL,
    "category_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "visibility" "text" DEFAULT 'public'::"text" NOT NULL,
    "banner_url" "text",
    CONSTRAINT "chautari_rooms_max_participants_check" CHECK ((("max_participants" >= 2) AND ("max_participants" <= 1000))),
    CONSTRAINT "chautari_rooms_status_check" CHECK (("status" = ANY (ARRAY['scheduled'::"text", 'live'::"text", 'ended'::"text"]))),
    CONSTRAINT "chautari_rooms_visibility_check" CHECK (("visibility" = ANY (ARRAY['public'::"text", 'private'::"text"])))
);


ALTER TABLE "public"."chautari_rooms" OWNER TO "postgres";


COMMENT ON COLUMN "public"."chautari_rooms"."visibility" IS 'public = listed in discover; private = unlisted but reachable by link. Not access control.';



CREATE TABLE IF NOT EXISTS "public"."chautari_speaker_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "room_id" "uuid" NOT NULL,
    "clerk_user_id" "text" NOT NULL,
    "display_name" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "requested_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "decided_at" timestamp with time zone,
    "decided_by" "text",
    CONSTRAINT "chautari_speaker_requests_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'denied'::"text", 'withdrawn'::"text"])))
);


ALTER TABLE "public"."chautari_speaker_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."contact_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "email" "text" NOT NULL,
    "topic" "text" DEFAULT 'General'::"text" NOT NULL,
    "message" "text" NOT NULL,
    "status" "text" DEFAULT 'new'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."contact_messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."editors" (
    "user_id" "uuid" NOT NULL,
    "name" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."editors" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."forex_rates" (
    "code" "text" NOT NULL,
    "currency" "text" NOT NULL,
    "symbol" "text" DEFAULT ''::"text" NOT NULL,
    "buy" numeric(12,4) NOT NULL,
    "sell" numeric(12,4) NOT NULL,
    "change" numeric(6,2) DEFAULT 0 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "unit" integer DEFAULT 1 NOT NULL
);


ALTER TABLE "public"."forex_rates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."live_updates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "article_id" "uuid" NOT NULL,
    "posted_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "headline" "text" NOT NULL,
    "body" "text" DEFAULT ''::"text" NOT NULL
);


ALTER TABLE "public"."live_updates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."media_assets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "path" "text" NOT NULL,
    "url" "text" NOT NULL,
    "alt" "text",
    "credit" "text",
    "width" integer,
    "height" integer,
    "bytes" bigint,
    "mime" "text",
    "uploaded_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."media_assets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."mobile_push_log" (
    "article_id" "uuid" NOT NULL,
    "sent_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "recipients" integer DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."mobile_push_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."mobile_push_tokens" (
    "token" "text" NOT NULL,
    "platform" "text" NOT NULL,
    "language" "text" DEFAULT 'en'::"text" NOT NULL,
    "edition" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_seen_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "chautari_enabled" boolean DEFAULT false NOT NULL,
    "reminders_enabled" boolean DEFAULT false NOT NULL,
    "clerk_user_id" "text",
    "breaking_enabled" boolean DEFAULT true NOT NULL,
    "last_reminded_at" timestamp with time zone,
    CONSTRAINT "mobile_push_tokens_clerk_user_id_check" CHECK ((("clerk_user_id" IS NULL) OR ("clerk_user_id" ~ '^user_'::"text"))),
    CONSTRAINT "mobile_push_tokens_language_check" CHECK (("language" = ANY (ARRAY['en'::"text", 'ne'::"text"]))),
    CONSTRAINT "mobile_push_tokens_platform_check" CHECK (("platform" = ANY (ARRAY['ios'::"text", 'android'::"text"]))),
    CONSTRAINT "mobile_push_tokens_token_check" CHECK (("token" ~ '^(Expo|Exponent)PushToken\[[A-Za-z0-9_-]+\]$'::"text"))
);


ALTER TABLE "public"."mobile_push_tokens" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."monthly_timesheets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "profile_id" "uuid" NOT NULL,
    "month" "date" NOT NULL,
    "total_minutes" integer DEFAULT 0 NOT NULL,
    "shift_count" integer DEFAULT 0 NOT NULL,
    "days_worked" integer DEFAULT 0 NOT NULL,
    "flagged_count" integer DEFAULT 0 NOT NULL,
    "first_in" timestamp with time zone,
    "last_out" timestamp with time zone,
    "generated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."monthly_timesheets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."newsletter_sends" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "send_key" "text" NOT NULL,
    "edition" "text",
    "subject" "text" NOT NULL,
    "article_ids" "uuid"[] DEFAULT '{}'::"uuid"[] NOT NULL,
    "recipients" integer DEFAULT 0 NOT NULL,
    "failures" integer DEFAULT 0 NOT NULL,
    "sent_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."newsletter_sends" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "full_name" "text",
    "role" "public"."app_role" DEFAULT 'admin'::"public"."app_role" NOT NULL,
    "capabilities" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "author_id" "uuid",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."reader_subscriptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "reader_id" "text" NOT NULL,
    "email" "text",
    "stripe_customer_id" "text",
    "stripe_subscription_id" "text",
    "status" "text" DEFAULT 'incomplete'::"text" NOT NULL,
    "price_id" "text",
    "billing_interval" "text",
    "current_period_end" timestamp with time zone,
    "cancel_at_period_end" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."reader_subscriptions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."reminder_push_log" (
    "sent_on" "date" NOT NULL,
    "sent_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "recipients" integer DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."reminder_push_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."shifts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "profile_id" "uuid" NOT NULL,
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "ended_at" timestamp with time zone,
    "note" "text",
    "auto_closed" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "shifts_end_after_start" CHECK ((("ended_at" IS NULL) OR ("ended_at" > "started_at")))
);


ALTER TABLE "public"."shifts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."subscribers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "email" "text" NOT NULL,
    "edition" "text",
    "source" "text",
    "confirmed" boolean DEFAULT false NOT NULL,
    "confirmed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "name" "text",
    "token" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "unsubscribed_at" timestamp with time zone,
    "last_sent_at" timestamp with time zone,
    "reader_id" "text"
);


ALTER TABLE "public"."subscribers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tags" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "slug" "text" NOT NULL,
    "name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."tags" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_follows" (
    "follower_clerk_id" "text" NOT NULL,
    "followee_clerk_id" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "notify" boolean DEFAULT false NOT NULL,
    CONSTRAINT "user_follows_check" CHECK (("follower_clerk_id" <> "followee_clerk_id"))
);


ALTER TABLE "public"."user_follows" OWNER TO "postgres";


ALTER TABLE ONLY "public"."analytics_events" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."analytics_events_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."ad_creatives"
    ADD CONSTRAINT "ad_creatives_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ad_placements"
    ADD CONSTRAINT "ad_placements_pkey" PRIMARY KEY ("slug");



ALTER TABLE ONLY "public"."ad_settings"
    ADD CONSTRAINT "ad_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ai_answers"
    ADD CONSTRAINT "ai_answers_article_id_language_question_hash_source_hash_key" UNIQUE ("article_id", "language", "question_hash", "source_hash");



ALTER TABLE ONLY "public"."ai_answers"
    ADD CONSTRAINT "ai_answers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ai_article_metadata"
    ADD CONSTRAINT "ai_article_metadata_article_id_language_key" UNIQUE ("article_id", "language");



ALTER TABLE ONLY "public"."ai_article_metadata"
    ADD CONSTRAINT "ai_article_metadata_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ai_briefing_items"
    ADD CONSTRAINT "ai_briefing_items_pkey" PRIMARY KEY ("briefing_id", "article_id");



ALTER TABLE ONLY "public"."ai_briefings"
    ADD CONSTRAINT "ai_briefings_edition_date_kind_language_edition_key" UNIQUE ("edition_date", "kind", "language", "edition");



ALTER TABLE ONLY "public"."ai_briefings"
    ADD CONSTRAINT "ai_briefings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ai_briefings"
    ADD CONSTRAINT "ai_briefings_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."ai_jobs"
    ADD CONSTRAINT "ai_jobs_dedupe_key_key" UNIQUE ("dedupe_key");



ALTER TABLE ONLY "public"."ai_jobs"
    ADD CONSTRAINT "ai_jobs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ai_usage_daily"
    ADD CONSTRAINT "ai_usage_daily_pkey" PRIMARY KEY ("day", "model");



ALTER TABLE ONLY "public"."analytics_events"
    ADD CONSTRAINT "analytics_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."app_notifications"
    ADD CONSTRAINT "app_notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."app_push_tokens"
    ADD CONSTRAINT "app_push_tokens_pkey" PRIMARY KEY ("token");



ALTER TABLE ONLY "public"."article_tags"
    ADD CONSTRAINT "article_tags_pkey" PRIMARY KEY ("article_id", "tag_id");



ALTER TABLE ONLY "public"."articles"
    ADD CONSTRAINT "articles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."articles"
    ADD CONSTRAINT "articles_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."authors"
    ADD CONSTRAINT "authors_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."authors"
    ADD CONSTRAINT "authors_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."categories"
    ADD CONSTRAINT "categories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."categories"
    ADD CONSTRAINT "categories_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."chautari_bans"
    ADD CONSTRAINT "chautari_bans_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."chautari_host_entitlements"
    ADD CONSTRAINT "chautari_host_entitlements_pkey" PRIMARY KEY ("clerk_user_id");



ALTER TABLE ONLY "public"."chautari_invites"
    ADD CONSTRAINT "chautari_invites_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."chautari_invites"
    ADD CONSTRAINT "chautari_invites_room_id_invitee_clerk_id_key" UNIQUE ("room_id", "invitee_clerk_id");



ALTER TABLE ONLY "public"."chautari_moderation_log"
    ADD CONSTRAINT "chautari_moderation_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."chautari_participants"
    ADD CONSTRAINT "chautari_participants_pkey" PRIMARY KEY ("room_id", "clerk_user_id");



ALTER TABLE ONLY "public"."chautari_push_log"
    ADD CONSTRAINT "chautari_push_log_pkey" PRIMARY KEY ("room_id");



ALTER TABLE ONLY "public"."chautari_reports"
    ADD CONSTRAINT "chautari_reports_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."chautari_rooms"
    ADD CONSTRAINT "chautari_rooms_livekit_room_key" UNIQUE ("livekit_room");



ALTER TABLE ONLY "public"."chautari_rooms"
    ADD CONSTRAINT "chautari_rooms_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."chautari_rooms"
    ADD CONSTRAINT "chautari_rooms_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."chautari_speaker_requests"
    ADD CONSTRAINT "chautari_speaker_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."chautari_speaker_requests"
    ADD CONSTRAINT "chautari_speaker_requests_room_id_clerk_user_id_key" UNIQUE ("room_id", "clerk_user_id");



ALTER TABLE ONLY "public"."contact_messages"
    ADD CONSTRAINT "contact_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."editors"
    ADD CONSTRAINT "editors_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."forex_rates"
    ADD CONSTRAINT "forex_rates_pkey" PRIMARY KEY ("code");



ALTER TABLE ONLY "public"."live_updates"
    ADD CONSTRAINT "live_updates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."media_assets"
    ADD CONSTRAINT "media_assets_path_key" UNIQUE ("path");



ALTER TABLE ONLY "public"."media_assets"
    ADD CONSTRAINT "media_assets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."mobile_push_log"
    ADD CONSTRAINT "mobile_push_log_pkey" PRIMARY KEY ("article_id");



ALTER TABLE ONLY "public"."mobile_push_tokens"
    ADD CONSTRAINT "mobile_push_tokens_pkey" PRIMARY KEY ("token");



ALTER TABLE ONLY "public"."monthly_timesheets"
    ADD CONSTRAINT "monthly_timesheets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."monthly_timesheets"
    ADD CONSTRAINT "monthly_timesheets_profile_id_month_key" UNIQUE ("profile_id", "month");



ALTER TABLE ONLY "public"."newsletter_sends"
    ADD CONSTRAINT "newsletter_sends_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."newsletter_sends"
    ADD CONSTRAINT "newsletter_sends_send_key_key" UNIQUE ("send_key");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."reader_profiles"
    ADD CONSTRAINT "reader_profiles_pkey" PRIMARY KEY ("clerk_user_id");



ALTER TABLE ONLY "public"."reader_profiles"
    ADD CONSTRAINT "reader_profiles_username_key" UNIQUE ("username");



ALTER TABLE ONLY "public"."reader_subscriptions"
    ADD CONSTRAINT "reader_subscriptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."reader_subscriptions"
    ADD CONSTRAINT "reader_subscriptions_reader_id_key" UNIQUE ("reader_id");



ALTER TABLE ONLY "public"."reader_subscriptions"
    ADD CONSTRAINT "reader_subscriptions_stripe_customer_id_key" UNIQUE ("stripe_customer_id");



ALTER TABLE ONLY "public"."reader_subscriptions"
    ADD CONSTRAINT "reader_subscriptions_stripe_subscription_id_key" UNIQUE ("stripe_subscription_id");



ALTER TABLE ONLY "public"."reminder_push_log"
    ADD CONSTRAINT "reminder_push_log_pkey" PRIMARY KEY ("sent_on");



ALTER TABLE ONLY "public"."shifts"
    ADD CONSTRAINT "shifts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."subscribers"
    ADD CONSTRAINT "subscribers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tags"
    ADD CONSTRAINT "tags_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tags"
    ADD CONSTRAINT "tags_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."user_follows"
    ADD CONSTRAINT "user_follows_pkey" PRIMARY KEY ("follower_clerk_id", "followee_clerk_id");



CREATE INDEX "ad_creatives_placement_idx" ON "public"."ad_creatives" USING "btree" ("placement", "is_active");



CREATE INDEX "ai_answers_article_idx" ON "public"."ai_answers" USING "btree" ("article_id", "created_at" DESC);



CREATE INDEX "ai_article_metadata_article_idx" ON "public"."ai_article_metadata" USING "btree" ("article_id");



CREATE INDEX "ai_article_metadata_status_idx" ON "public"."ai_article_metadata" USING "btree" ("status", "updated_at" DESC);



CREATE INDEX "ai_briefing_items_rank_idx" ON "public"."ai_briefing_items" USING "btree" ("briefing_id", "rank");



CREATE INDEX "ai_jobs_pending_idx" ON "public"."ai_jobs" USING "btree" ("status", "created_at") WHERE ("status" = ANY (ARRAY['pending'::"text", 'running'::"text"]));



CREATE INDEX "analytics_article_time_idx" ON "public"."analytics_events" USING "btree" ("article_id", "created_at" DESC);



CREATE INDEX "analytics_kind_idx" ON "public"."analytics_events" USING "btree" ("kind", "created_at" DESC);



CREATE INDEX "analytics_time_idx" ON "public"."analytics_events" USING "btree" ("created_at" DESC);



CREATE INDEX "app_notifications_recent" ON "public"."app_notifications" USING "btree" ("created_at" DESC);



CREATE INDEX "app_push_tokens_edition_idx" ON "public"."app_push_tokens" USING "btree" ("edition");



CREATE INDEX "app_push_tokens_user_idx" ON "public"."app_push_tokens" USING "btree" ("clerk_user_id") WHERE ("clerk_user_id" IS NOT NULL);



CREATE INDEX "article_tags_tag_idx" ON "public"."article_tags" USING "btree" ("tag_id");



CREATE INDEX "articles_breaking_idx" ON "public"."articles" USING "btree" ("published_at" DESC) WHERE (("status" = 'published'::"public"."article_status") AND ("is_breaking" OR "is_live"));



CREATE INDEX "articles_category_published_idx" ON "public"."articles" USING "btree" ("category_id", "published_at" DESC) WHERE ("status" = 'published'::"public"."article_status");



CREATE INDEX "articles_created_by_idx" ON "public"."articles" USING "btree" ("created_by");



CREATE INDEX "articles_editions_idx" ON "public"."articles" USING "gin" ("editions");



CREATE INDEX "articles_featured_idx" ON "public"."articles" USING "btree" ("published_at" DESC) WHERE (("status" = 'published'::"public"."article_status") AND "is_featured");



CREATE INDEX "articles_published_idx" ON "public"."articles" USING "btree" ("published_at" DESC) WHERE ("status" = 'published'::"public"."article_status");



CREATE INDEX "articles_search_idx" ON "public"."articles" USING "gin" ("search_vector");



CREATE INDEX "articles_views_idx" ON "public"."articles" USING "btree" ("view_count" DESC) WHERE ("status" = 'published'::"public"."article_status");



CREATE UNIQUE INDEX "chautari_bans_one_active" ON "public"."chautari_bans" USING "btree" ("clerk_user_id") WHERE ("lifted_at" IS NULL);



CREATE INDEX "chautari_bans_user_idx" ON "public"."chautari_bans" USING "btree" ("clerk_user_id", "created_at" DESC);



CREATE INDEX "chautari_host_active_idx" ON "public"."chautari_host_entitlements" USING "btree" ("clerk_user_id") WHERE ("revoked_at" IS NULL);



CREATE INDEX "chautari_moderation_log_recent" ON "public"."chautari_moderation_log" USING "btree" ("created_at" DESC);



CREATE INDEX "chautari_moderation_log_target" ON "public"."chautari_moderation_log" USING "btree" ("target_clerk_id") WHERE ("target_clerk_id" IS NOT NULL);



CREATE INDEX "chautari_participants_room_idx" ON "public"."chautari_participants" USING "btree" ("room_id", "role") WHERE (("left_at" IS NULL) AND ("removed_at" IS NULL));



CREATE UNIQUE INDEX "chautari_reports_one_open" ON "public"."chautari_reports" USING "btree" ("reporter_clerk_id", "room_id", COALESCE("target_clerk_id", ''::"text")) WHERE ("status" = ANY (ARRAY['open'::"text", 'reviewing'::"text"]));



CREATE INDEX "chautari_reports_queue_idx" ON "public"."chautari_reports" USING "btree" ("status", "created_at" DESC);



CREATE INDEX "chautari_reports_room_idx" ON "public"."chautari_reports" USING "btree" ("room_id");



CREATE INDEX "chautari_reports_target_idx" ON "public"."chautari_reports" USING "btree" ("target_clerk_id") WHERE ("target_clerk_id" IS NOT NULL);



CREATE INDEX "chautari_requests_pending_idx" ON "public"."chautari_speaker_requests" USING "btree" ("room_id", "requested_at") WHERE ("status" = 'pending'::"text");



CREATE INDEX "chautari_rooms_live_idx" ON "public"."chautari_rooms" USING "btree" ("started_at" DESC) WHERE ("status" = 'live'::"text");



CREATE INDEX "chautari_rooms_public_live_idx" ON "public"."chautari_rooms" USING "btree" ("started_at" DESC) WHERE (("status" = 'live'::"text") AND ("visibility" = 'public'::"text"));



CREATE INDEX "chautari_rooms_public_upcoming_idx" ON "public"."chautari_rooms" USING "btree" ("scheduled_for") WHERE (("status" = 'scheduled'::"text") AND ("visibility" = 'public'::"text"));



CREATE INDEX "chautari_rooms_upcoming_idx" ON "public"."chautari_rooms" USING "btree" ("scheduled_for") WHERE ("status" = 'scheduled'::"text");



CREATE INDEX "mobile_push_tokens_clerk_user_idx" ON "public"."mobile_push_tokens" USING "btree" ("clerk_user_id") WHERE ("clerk_user_id" IS NOT NULL);



CREATE INDEX "monthly_timesheets_month_idx" ON "public"."monthly_timesheets" USING "btree" ("month" DESC);



CREATE INDEX "newsletter_sends_sent_idx" ON "public"."newsletter_sends" USING "btree" ("sent_at" DESC);



CREATE INDEX "profiles_author_idx" ON "public"."profiles" USING "btree" ("author_id");



CREATE INDEX "profiles_role_idx" ON "public"."profiles" USING "btree" ("role");



CREATE INDEX "reader_profiles_display_name_trgm_idx" ON "public"."reader_profiles" USING "gin" ("lower"("display_name") "extensions"."gin_trgm_ops");



CREATE UNIQUE INDEX "reader_profiles_username_lower_idx" ON "public"."reader_profiles" USING "btree" ("lower"("username"));



CREATE INDEX "reader_profiles_username_pattern_idx" ON "public"."reader_profiles" USING "btree" ("username" "text_pattern_ops");



CREATE INDEX "reader_subscriptions_reader_idx" ON "public"."reader_subscriptions" USING "btree" ("reader_id");



CREATE UNIQUE INDEX "shifts_one_open_per_person" ON "public"."shifts" USING "btree" ("profile_id") WHERE ("ended_at" IS NULL);



CREATE INDEX "shifts_profile_started_idx" ON "public"."shifts" USING "btree" ("profile_id", "started_at" DESC);



CREATE INDEX "shifts_started_idx" ON "public"."shifts" USING "btree" ("started_at" DESC);



CREATE INDEX "subscribers_deliverable_idx" ON "public"."subscribers" USING "btree" ("edition") WHERE ("confirmed" AND ("unsubscribed_at" IS NULL));



CREATE UNIQUE INDEX "subscribers_email_lower_key" ON "public"."subscribers" USING "btree" ("lower"("email"));



CREATE UNIQUE INDEX "subscribers_token_key" ON "public"."subscribers" USING "btree" ("token");



CREATE INDEX "user_follows_followee_idx" ON "public"."user_follows" USING "btree" ("followee_clerk_id");



CREATE INDEX "user_follows_notify_followee_idx" ON "public"."user_follows" USING "btree" ("followee_clerk_id") WHERE "notify";



CREATE OR REPLACE TRIGGER "ad_creatives_touch_trg" BEFORE UPDATE ON "public"."ad_creatives" FOR EACH ROW EXECUTE FUNCTION "public"."ads_touch_updated_at"();



CREATE OR REPLACE TRIGGER "ad_placements_touch_trg" BEFORE UPDATE ON "public"."ad_placements" FOR EACH ROW EXECUTE FUNCTION "public"."ads_touch_updated_at"();



CREATE OR REPLACE TRIGGER "ad_settings_touch_trg" BEFORE UPDATE ON "public"."ad_settings" FOR EACH ROW EXECUTE FUNCTION "public"."ads_touch_updated_at"();



CREATE OR REPLACE TRIGGER "analytics_bump_view_count_trg" AFTER INSERT ON "public"."analytics_events" FOR EACH ROW EXECUTE FUNCTION "public"."analytics_bump_view_count"();



CREATE OR REPLACE TRIGGER "articles_search_vector_trg" BEFORE INSERT OR UPDATE OF "title", "excerpt", "body" ON "public"."articles" FOR EACH ROW EXECUTE FUNCTION "public"."articles_search_vector_update"();



CREATE OR REPLACE TRIGGER "articles_touch_updated_at_trg" BEFORE UPDATE ON "public"."articles" FOR EACH ROW EXECUTE FUNCTION "public"."articles_touch_updated_at"();



CREATE OR REPLACE TRIGGER "chautari-invite-push" AFTER INSERT ON "public"."chautari_invites" FOR EACH ROW EXECUTE FUNCTION "supabase_functions"."http_request"('http://kong:8000/functions/v1/send-chautari-invite-push', 'POST', '{"Content-type":"application/json","x-webhook-secret":"local-webhook-secret"}', '{}', '5000');



CREATE OR REPLACE TRIGGER "chautari-live-push" AFTER INSERT OR UPDATE ON "public"."chautari_rooms" FOR EACH ROW EXECUTE FUNCTION "supabase_functions"."http_request"('http://kong:8000/functions/v1/send-chautari-live-push', 'POST', '{"Content-type":"application/json","x-webhook-secret":"local-webhook-secret"}', '{}', '5000');



CREATE OR REPLACE TRIGGER "mobile-breaking-push" AFTER INSERT OR UPDATE ON "public"."articles" FOR EACH ROW EXECUTE FUNCTION "supabase_functions"."http_request"('http://kong:8000/functions/v1/send-breaking-push', 'POST', '{"Content-type":"application/json","x-webhook-secret":"local-webhook-secret"}', '{}', '5000');



CREATE OR REPLACE TRIGGER "profiles_guard_privileges_trg" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."profiles_guard_privileges"();



CREATE OR REPLACE TRIGGER "reader_profiles_updated_at" BEFORE UPDATE ON "public"."reader_profiles" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "reader_subscriptions_touch" BEFORE UPDATE ON "public"."reader_subscriptions" FOR EACH ROW EXECUTE FUNCTION "public"."touch_reader_subscription"();



CREATE OR REPLACE TRIGGER "shifts_touch_updated_at_trg" BEFORE UPDATE ON "public"."shifts" FOR EACH ROW EXECUTE FUNCTION "public"."shifts_touch_updated_at"();



ALTER TABLE ONLY "public"."ad_creatives"
    ADD CONSTRAINT "ad_creatives_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."ad_creatives"
    ADD CONSTRAINT "ad_creatives_placement_fkey" FOREIGN KEY ("placement") REFERENCES "public"."ad_placements"("slug") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ad_settings"
    ADD CONSTRAINT "ad_settings_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."ai_answers"
    ADD CONSTRAINT "ai_answers_article_id_fkey" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ai_article_metadata"
    ADD CONSTRAINT "ai_article_metadata_article_id_fkey" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ai_briefing_items"
    ADD CONSTRAINT "ai_briefing_items_article_id_fkey" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ai_briefing_items"
    ADD CONSTRAINT "ai_briefing_items_briefing_id_fkey" FOREIGN KEY ("briefing_id") REFERENCES "public"."ai_briefings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."analytics_events"
    ADD CONSTRAINT "analytics_events_article_id_fkey" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."app_notifications"
    ADD CONSTRAINT "app_notifications_sent_by_fkey" FOREIGN KEY ("sent_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."article_tags"
    ADD CONSTRAINT "article_tags_article_id_fkey" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."article_tags"
    ADD CONSTRAINT "article_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."articles"
    ADD CONSTRAINT "articles_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "public"."authors"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."articles"
    ADD CONSTRAINT "articles_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."articles"
    ADD CONSTRAINT "articles_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."chautari_bans"
    ADD CONSTRAINT "chautari_bans_banned_by_fkey" FOREIGN KEY ("banned_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."chautari_bans"
    ADD CONSTRAINT "chautari_bans_lifted_by_fkey" FOREIGN KEY ("lifted_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."chautari_host_entitlements"
    ADD CONSTRAINT "chautari_host_entitlements_granted_by_fkey" FOREIGN KEY ("granted_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."chautari_invites"
    ADD CONSTRAINT "chautari_invites_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "public"."chautari_rooms"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chautari_moderation_log"
    ADD CONSTRAINT "chautari_moderation_log_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."chautari_moderation_log"
    ADD CONSTRAINT "chautari_moderation_log_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "public"."chautari_rooms"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."chautari_participants"
    ADD CONSTRAINT "chautari_participants_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "public"."chautari_rooms"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chautari_reports"
    ADD CONSTRAINT "chautari_reports_resolved_by_fkey" FOREIGN KEY ("resolved_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."chautari_reports"
    ADD CONSTRAINT "chautari_reports_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "public"."chautari_rooms"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."chautari_rooms"
    ADD CONSTRAINT "chautari_rooms_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."chautari_speaker_requests"
    ADD CONSTRAINT "chautari_speaker_requests_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "public"."chautari_rooms"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."editors"
    ADD CONSTRAINT "editors_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."live_updates"
    ADD CONSTRAINT "live_updates_article_id_fkey" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."media_assets"
    ADD CONSTRAINT "media_assets_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."monthly_timesheets"
    ADD CONSTRAINT "monthly_timesheets_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "public"."authors"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."shifts"
    ADD CONSTRAINT "shifts_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_follows"
    ADD CONSTRAINT "user_follows_followee_clerk_id_fkey" FOREIGN KEY ("followee_clerk_id") REFERENCES "public"."reader_profiles"("clerk_user_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_follows"
    ADD CONSTRAINT "user_follows_follower_clerk_id_fkey" FOREIGN KEY ("follower_clerk_id") REFERENCES "public"."reader_profiles"("clerk_user_id") ON DELETE CASCADE;



ALTER TABLE "public"."ad_creatives" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ad_placements" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ad_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ai_answers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ai_article_metadata" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ai_briefing_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ai_briefings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ai_jobs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ai_usage_daily" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."analytics_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "anyone can contact" ON "public"."contact_messages" FOR INSERT WITH CHECK (((("char_length"("name") >= 1) AND ("char_length"("name") <= 120)) AND (("char_length"("email") >= 5) AND ("char_length"("email") <= 254)) AND (("char_length"("message") >= 10) AND ("char_length"("message") <= 8000))));



CREATE POLICY "anyone can subscribe" ON "public"."subscribers" FOR INSERT WITH CHECK ((("email" IS NOT NULL) AND (("char_length"("email") >= 5) AND ("char_length"("email") <= 254)) AND ("email" ~~ '%@%.%'::"text")));



ALTER TABLE "public"."app_notifications" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."app_push_tokens" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."article_tags" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."articles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."authors" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."categories" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."chautari_bans" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."chautari_host_entitlements" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."chautari_invites" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."chautari_moderation_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."chautari_participants" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."chautari_push_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."chautari_reports" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."chautari_rooms" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."chautari_speaker_requests" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "clock in" ON "public"."shifts" FOR INSERT WITH CHECK ((("profile_id" = "auth"."uid"()) AND "public"."is_staff"()));



ALTER TABLE "public"."contact_messages" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "correct all shifts" ON "public"."shifts" FOR UPDATE USING ("public"."has_cap"('timesheets:all'::"text")) WITH CHECK ("public"."has_cap"('timesheets:all'::"text"));



CREATE POLICY "correct own shifts" ON "public"."shifts" FOR UPDATE USING (("profile_id" = "auth"."uid"())) WITH CHECK (("profile_id" = "auth"."uid"()));



CREATE POLICY "create articles" ON "public"."articles" FOR INSERT WITH CHECK (("public"."has_cap"('articles:create'::"text") AND (("created_by" IS NULL) OR ("created_by" = "auth"."uid"())) AND (("status" <> 'published'::"public"."article_status") OR "public"."has_cap"('articles:publish'::"text"))));



CREATE POLICY "delete articles" ON "public"."articles" FOR DELETE USING ("public"."has_cap"('articles:delete'::"text"));



CREATE POLICY "delete media assets" ON "public"."media_assets" FOR DELETE USING ("public"."has_cap"('media:delete'::"text"));



CREATE POLICY "delete shifts" ON "public"."shifts" FOR DELETE USING (((("profile_id" = "auth"."uid"()) AND ("ended_at" IS NULL)) OR "public"."has_cap"('timesheets:all'::"text")));



CREATE POLICY "edit articles" ON "public"."articles" FOR UPDATE USING (("public"."has_cap"('articles:edit:any'::"text") OR ("public"."has_cap"('articles:edit:own'::"text") AND ("created_by" = "auth"."uid"())))) WITH CHECK ((("public"."has_cap"('articles:edit:any'::"text") OR ("public"."has_cap"('articles:edit:own'::"text") AND ("created_by" = "auth"."uid"()))) AND (("status" <> 'published'::"public"."article_status") OR "public"."has_cap"('articles:publish'::"text"))));



ALTER TABLE "public"."editors" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "editors manage ai_answers" ON "public"."ai_answers" USING ("public"."is_editor"()) WITH CHECK ("public"."is_editor"());



CREATE POLICY "editors manage ai_article_metadata" ON "public"."ai_article_metadata" USING ("public"."is_editor"()) WITH CHECK ("public"."is_editor"());



CREATE POLICY "editors manage ai_briefing_items" ON "public"."ai_briefing_items" USING ("public"."is_editor"()) WITH CHECK ("public"."is_editor"());



CREATE POLICY "editors manage ai_briefings" ON "public"."ai_briefings" USING ("public"."is_editor"()) WITH CHECK ("public"."is_editor"());



CREATE POLICY "editors manage ai_jobs" ON "public"."ai_jobs" USING ("public"."is_editor"()) WITH CHECK ("public"."is_editor"());



CREATE POLICY "editors manage ai_usage_daily" ON "public"."ai_usage_daily" USING ("public"."is_editor"()) WITH CHECK ("public"."is_editor"());



CREATE POLICY "editors manage chautari_host_entitlements" ON "public"."chautari_host_entitlements" USING ("public"."is_editor"()) WITH CHECK ("public"."is_editor"());



CREATE POLICY "editors manage chautari_participants" ON "public"."chautari_participants" USING ("public"."is_editor"()) WITH CHECK ("public"."is_editor"());



CREATE POLICY "editors manage chautari_rooms" ON "public"."chautari_rooms" USING ("public"."is_editor"()) WITH CHECK ("public"."is_editor"());



CREATE POLICY "editors manage chautari_speaker_requests" ON "public"."chautari_speaker_requests" USING ("public"."is_editor"()) WITH CHECK ("public"."is_editor"());



CREATE POLICY "editors read own row" ON "public"."editors" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "editors read reader subscriptions" ON "public"."reader_subscriptions" FOR SELECT USING ("public"."is_editor"());



ALTER TABLE "public"."forex_rates" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "insert media assets" ON "public"."media_assets" FOR INSERT WITH CHECK (("public"."has_cap"('media:upload'::"text") AND ("uploaded_by" = "auth"."uid"())));



ALTER TABLE "public"."live_updates" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "manage ad placements" ON "public"."ad_placements" USING ("public"."has_cap"('ads:manage'::"text")) WITH CHECK ("public"."has_cap"('ads:manage'::"text"));



CREATE POLICY "manage ad settings" ON "public"."ad_settings" USING ("public"."has_cap"('ads:manage'::"text")) WITH CHECK ("public"."has_cap"('ads:manage'::"text"));



CREATE POLICY "manage article tags" ON "public"."article_tags" USING (("public"."has_cap"('articles:edit:any'::"text") OR ("public"."has_cap"('articles:edit:own'::"text") AND (EXISTS ( SELECT 1
   FROM "public"."articles" "a"
  WHERE (("a"."id" = "article_tags"."article_id") AND ("a"."created_by" = "auth"."uid"()))))))) WITH CHECK (("public"."has_cap"('articles:edit:any'::"text") OR ("public"."has_cap"('articles:edit:own'::"text") AND (EXISTS ( SELECT 1
   FROM "public"."articles" "a"
  WHERE (("a"."id" = "article_tags"."article_id") AND ("a"."created_by" = "auth"."uid"())))))));



CREATE POLICY "manage authors" ON "public"."authors" USING ("public"."has_cap"('authors:manage'::"text")) WITH CHECK ("public"."has_cap"('authors:manage'::"text"));



CREATE POLICY "manage creatives" ON "public"."ad_creatives" USING ("public"."has_cap"('ads:manage'::"text")) WITH CHECK ("public"."has_cap"('ads:manage'::"text"));



CREATE POLICY "manage forex" ON "public"."forex_rates" USING ("public"."has_cap"('taxonomy:manage'::"text")) WITH CHECK ("public"."has_cap"('taxonomy:manage'::"text"));



CREATE POLICY "manage live updates" ON "public"."live_updates" USING (("public"."has_cap"('articles:edit:any'::"text") OR ("public"."has_cap"('articles:edit:own'::"text") AND (EXISTS ( SELECT 1
   FROM "public"."articles" "a"
  WHERE (("a"."id" = "live_updates"."article_id") AND ("a"."created_by" = "auth"."uid"()))))))) WITH CHECK (("public"."has_cap"('articles:edit:any'::"text") OR ("public"."has_cap"('articles:edit:own'::"text") AND (EXISTS ( SELECT 1
   FROM "public"."articles" "a"
  WHERE (("a"."id" = "live_updates"."article_id") AND ("a"."created_by" = "auth"."uid"())))))));



CREATE POLICY "manage months" ON "public"."monthly_timesheets" USING ("public"."has_cap"('timesheets:all'::"text")) WITH CHECK ("public"."has_cap"('timesheets:all'::"text"));



CREATE POLICY "manage taxonomy categories" ON "public"."categories" USING ("public"."has_cap"('taxonomy:manage'::"text")) WITH CHECK ("public"."has_cap"('taxonomy:manage'::"text"));



CREATE POLICY "manage taxonomy tags" ON "public"."tags" USING ("public"."has_cap"('taxonomy:manage'::"text")) WITH CHECK ("public"."has_cap"('taxonomy:manage'::"text"));



ALTER TABLE "public"."media_assets" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."mobile_push_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."mobile_push_tokens" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "moderators append log" ON "public"."chautari_moderation_log" FOR INSERT TO "authenticated" WITH CHECK (("public"."has_cap"('chautari:moderate'::"text") AND ("actor_id" = "auth"."uid"())));



CREATE POLICY "moderators manage bans" ON "public"."chautari_bans" TO "authenticated" USING ("public"."has_cap"('chautari:moderate'::"text")) WITH CHECK ("public"."has_cap"('chautari:moderate'::"text"));



CREATE POLICY "moderators manage chautari_host_entitlements" ON "public"."chautari_host_entitlements" TO "authenticated" USING ("public"."has_cap"('chautari:moderate'::"text")) WITH CHECK ("public"."has_cap"('chautari:moderate'::"text"));



CREATE POLICY "moderators manage chautari_participants" ON "public"."chautari_participants" TO "authenticated" USING ("public"."has_cap"('chautari:moderate'::"text")) WITH CHECK ("public"."has_cap"('chautari:moderate'::"text"));



CREATE POLICY "moderators manage chautari_rooms" ON "public"."chautari_rooms" TO "authenticated" USING ("public"."has_cap"('chautari:moderate'::"text")) WITH CHECK ("public"."has_cap"('chautari:moderate'::"text"));



CREATE POLICY "moderators manage chautari_speaker_requests" ON "public"."chautari_speaker_requests" TO "authenticated" USING ("public"."has_cap"('chautari:moderate'::"text")) WITH CHECK ("public"."has_cap"('chautari:moderate'::"text"));



CREATE POLICY "moderators read log" ON "public"."chautari_moderation_log" FOR SELECT TO "authenticated" USING ("public"."has_cap"('chautari:moderate'::"text"));



CREATE POLICY "moderators read reports" ON "public"."chautari_reports" FOR SELECT TO "authenticated" USING ("public"."has_cap"('chautari:moderate'::"text"));



CREATE POLICY "moderators resolve reports" ON "public"."chautari_reports" FOR UPDATE TO "authenticated" USING ("public"."has_cap"('chautari:moderate'::"text")) WITH CHECK ("public"."has_cap"('chautari:moderate'::"text"));



ALTER TABLE "public"."monthly_timesheets" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."newsletter_sends" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "public read ad placements" ON "public"."ad_placements" FOR SELECT USING (true);



CREATE POLICY "public read ad settings" ON "public"."ad_settings" FOR SELECT USING (true);



CREATE POLICY "public read ai answers" ON "public"."ai_answers" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."articles" "a"
  WHERE (("a"."id" = "ai_answers"."article_id") AND ("a"."status" = 'published'::"public"."article_status") AND ("a"."published_at" <= "now"())))));



CREATE POLICY "public read article tags" ON "public"."article_tags" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."articles" "a"
  WHERE (("a"."id" = "article_tags"."article_id") AND ("a"."status" = 'published'::"public"."article_status") AND ("a"."published_at" <= "now"())))));



CREATE POLICY "public read authors" ON "public"."authors" FOR SELECT USING (true);



CREATE POLICY "public read briefing items" ON "public"."ai_briefing_items" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."ai_briefings" "b"
  WHERE (("b"."id" = "ai_briefing_items"."briefing_id") AND ("b"."status" = 'published'::"text")))));



CREATE POLICY "public read categories" ON "public"."categories" FOR SELECT USING (true);



CREATE POLICY "public read forex" ON "public"."forex_rates" FOR SELECT USING (true);



CREATE POLICY "public read live creatives" ON "public"."ad_creatives" FOR SELECT USING (("is_active" AND (("starts_at" IS NULL) OR ("starts_at" <= "now"())) AND (("ends_at" IS NULL) OR ("ends_at" >= "now"()))));



CREATE POLICY "public read live updates" ON "public"."live_updates" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."articles" "a"
  WHERE (("a"."id" = "live_updates"."article_id") AND ("a"."status" = 'published'::"public"."article_status") AND ("a"."published_at" <= "now"())))));



CREATE POLICY "public read media assets" ON "public"."media_assets" FOR SELECT USING (true);



CREATE POLICY "public read open rooms" ON "public"."chautari_rooms" FOR SELECT USING (("status" = ANY (ARRAY['scheduled'::"text", 'live'::"text"])));



CREATE POLICY "public read participants of open rooms" ON "public"."chautari_participants" FOR SELECT USING ((("left_at" IS NULL) AND ("removed_at" IS NULL) AND (EXISTS ( SELECT 1
   FROM "public"."chautari_rooms" "r"
  WHERE (("r"."id" = "chautari_participants"."room_id") AND ("r"."status" = ANY (ARRAY['scheduled'::"text", 'live'::"text"])))))));



CREATE POLICY "public read published articles" ON "public"."articles" FOR SELECT USING ((("status" = 'published'::"public"."article_status") AND ("published_at" <= "now"())));



CREATE POLICY "public read published briefings" ON "public"."ai_briefings" FOR SELECT USING (("status" = 'published'::"text"));



CREATE POLICY "public read ready ai metadata" ON "public"."ai_article_metadata" FOR SELECT USING ((("status" = 'ready'::"text") AND ("review_state" = 'approved'::"text") AND (EXISTS ( SELECT 1
   FROM "public"."articles" "a"
  WHERE (("a"."id" = "ai_article_metadata"."article_id") AND ("a"."status" = 'published'::"public"."article_status") AND ("a"."published_at" <= "now"()))))));



CREATE POLICY "public read tags" ON "public"."tags" FOR SELECT USING (true);



CREATE POLICY "read all months" ON "public"."monthly_timesheets" FOR SELECT USING ("public"."has_cap"('timesheets:all'::"text"));



CREATE POLICY "read all shifts" ON "public"."shifts" FOR SELECT USING ("public"."has_cap"('timesheets:all'::"text"));



CREATE POLICY "read messages" ON "public"."contact_messages" FOR SELECT USING ("public"."has_cap"('messages:read'::"text"));



CREATE POLICY "read newsletter sends" ON "public"."newsletter_sends" FOR SELECT USING ("public"."has_cap"('subscribers:read'::"text"));



CREATE POLICY "read own months" ON "public"."monthly_timesheets" FOR SELECT USING (("profile_id" = "auth"."uid"()));



CREATE POLICY "read own profile" ON "public"."profiles" FOR SELECT USING (("auth"."uid"() = "id"));



CREATE POLICY "read own shifts" ON "public"."shifts" FOR SELECT USING (("profile_id" = "auth"."uid"()));



CREATE POLICY "read subscribers" ON "public"."subscribers" FOR SELECT USING ("public"."has_cap"('subscribers:read'::"text"));



ALTER TABLE "public"."reader_profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "reader_profiles_public_read" ON "public"."reader_profiles" FOR SELECT USING (true);



ALTER TABLE "public"."reader_subscriptions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "record analytics" ON "public"."analytics_events" FOR INSERT WITH CHECK ((("kind" = ANY (ARRAY['view'::"text", 'share'::"text", 'save'::"text", 'read_50'::"text", 'read_100'::"text", 'outbound'::"text"])) AND (("char_length"("path") >= 1) AND ("char_length"("path") <= 512)) AND (("session_id" IS NULL) OR ("char_length"("session_id") <= 64)) AND (("referrer" IS NULL) OR ("char_length"("referrer") <= 512))));



ALTER TABLE "public"."reminder_push_log" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "senders read notifications" ON "public"."app_notifications" FOR SELECT TO "authenticated" USING ("public"."has_cap"('notifications:send'::"text"));



CREATE POLICY "senders read tokens" ON "public"."app_push_tokens" FOR SELECT TO "authenticated" USING ("public"."has_cap"('notifications:send'::"text"));



CREATE POLICY "senders record notifications" ON "public"."app_notifications" FOR INSERT TO "authenticated" WITH CHECK (("public"."has_cap"('notifications:send'::"text") AND ("sent_by" = "auth"."uid"())));



ALTER TABLE "public"."shifts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "staff read all articles" ON "public"."articles" FOR SELECT USING ("public"."has_cap"('articles:read'::"text"));



CREATE POLICY "staff read all creatives" ON "public"."ad_creatives" FOR SELECT USING ("public"."has_cap"('ads:manage'::"text"));



ALTER TABLE "public"."subscribers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "superadmin reads all profiles" ON "public"."profiles" FOR SELECT USING ("public"."is_superadmin"());



CREATE POLICY "superadmin writes profiles" ON "public"."profiles" USING ("public"."is_superadmin"()) WITH CHECK ("public"."is_superadmin"());



ALTER TABLE "public"."tags" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "timesheet managers read profiles" ON "public"."profiles" FOR SELECT USING ("public"."has_cap"('timesheets:all'::"text"));



CREATE POLICY "update media assets" ON "public"."media_assets" FOR UPDATE USING ("public"."has_cap"('media:upload'::"text")) WITH CHECK ("public"."has_cap"('media:upload'::"text"));



CREATE POLICY "update messages" ON "public"."contact_messages" FOR UPDATE USING ("public"."has_cap"('messages:read'::"text")) WITH CHECK ("public"."has_cap"('messages:read'::"text"));



CREATE POLICY "update own profile" ON "public"."profiles" FOR UPDATE USING (("auth"."uid"() = "id")) WITH CHECK (("auth"."uid"() = "id"));



ALTER TABLE "public"."user_follows" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_follows_public_read" ON "public"."user_follows" FOR SELECT USING (true);





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";








GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";








































































































































































































































































GRANT ALL ON FUNCTION "public"."admin_analytics_by_author"("days" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."admin_analytics_by_author"("days" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_analytics_by_author"("days" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."admin_analytics_daily"("days" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."admin_analytics_daily"("days" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_analytics_daily"("days" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."admin_analytics_top"("days" integer, "lim" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."admin_analytics_top"("days" integer, "lim" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_analytics_top"("days" integer, "lim" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."admin_analytics_totals"("days" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."admin_analytics_totals"("days" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_analytics_totals"("days" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."ads_touch_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."ads_touch_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."ads_touch_updated_at"() TO "service_role";



GRANT ALL ON TABLE "public"."ai_jobs" TO "anon";
GRANT ALL ON TABLE "public"."ai_jobs" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_jobs" TO "service_role";



REVOKE ALL ON FUNCTION "public"."ai_claim_jobs"("batch" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."ai_claim_jobs"("batch" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."analytics_bump_view_count"() TO "anon";
GRANT ALL ON FUNCTION "public"."analytics_bump_view_count"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."analytics_bump_view_count"() TO "service_role";



GRANT ALL ON FUNCTION "public"."articles_search_vector_update"() TO "anon";
GRANT ALL ON FUNCTION "public"."articles_search_vector_update"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."articles_search_vector_update"() TO "service_role";



GRANT ALL ON FUNCTION "public"."articles_touch_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."articles_touch_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."articles_touch_updated_at"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."close_stale_shifts"("max_hours" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."close_stale_shifts"("max_hours" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."has_cap"("cap" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."has_cap"("cap" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_cap"("cap" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."increment_article_views"("article_slug" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."increment_article_views"("article_slug" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."increment_article_views"("article_slug" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_editor"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_editor"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_editor"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_staff"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_staff"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_staff"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_superadmin"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_superadmin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_superadmin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."my_author_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."my_author_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."my_author_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."profiles_guard_privileges"() TO "anon";
GRANT ALL ON FUNCTION "public"."profiles_guard_privileges"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."profiles_guard_privileges"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."record_ad_event"("creative" "uuid", "kind" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."record_ad_event"("creative" "uuid", "kind" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."record_ad_event"("creative" "uuid", "kind" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."record_ad_event"("creative" "uuid", "kind" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."register_push_token"("p_token" "text", "p_platform" "text", "p_language" "text", "p_edition" "text", "p_breaking" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."register_push_token"("p_token" "text", "p_platform" "text", "p_language" "text", "p_edition" "text", "p_breaking" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."register_push_token"("p_token" "text", "p_platform" "text", "p_language" "text", "p_edition" "text", "p_breaking" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."register_push_token"("p_token" "text", "p_platform" "text", "p_language" "text", "p_edition" "text", "p_breaking" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."reset_ad_counters"("creative" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reset_ad_counters"("creative" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."reset_ad_counters"("creative" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."reset_ad_counters"("creative" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "anon";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "service_role";



GRANT ALL ON TABLE "public"."reader_profiles" TO "anon";
GRANT ALL ON TABLE "public"."reader_profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."reader_profiles" TO "service_role";



REVOKE ALL ON FUNCTION "public"."search_reader_profiles"("q" "text", "lim" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."search_reader_profiles"("q" "text", "lim" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."search_reader_profiles"("q" "text", "lim" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."search_reader_profiles"("q" "text", "lim" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_breaking_push_preference"("p_token" "text", "p_enabled" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_breaking_push_preference"("p_token" "text", "p_enabled" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."set_breaking_push_preference"("p_token" "text", "p_enabled" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_breaking_push_preference"("p_token" "text", "p_enabled" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_chautari_push_preference"("p_token" "text", "p_enabled" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_chautari_push_preference"("p_token" "text", "p_enabled" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."set_chautari_push_preference"("p_token" "text", "p_enabled" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_chautari_push_preference"("p_token" "text", "p_enabled" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_reminder_push_preference"("p_token" "text", "p_enabled" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_reminder_push_preference"("p_token" "text", "p_enabled" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."set_reminder_push_preference"("p_token" "text", "p_enabled" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_reminder_push_preference"("p_token" "text", "p_enabled" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."shifts_touch_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."shifts_touch_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."shifts_touch_updated_at"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."snapshot_month"("month" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."snapshot_month"("month" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."touch_reader_subscription"() TO "anon";
GRANT ALL ON FUNCTION "public"."touch_reader_subscription"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."touch_reader_subscription"() TO "service_role";



GRANT ALL ON FUNCTION "public"."unaccent"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."unaccent"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."unaccent"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."unaccent"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."unaccent"("regdictionary", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."unaccent"("regdictionary", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."unaccent"("regdictionary", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."unaccent"("regdictionary", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."unaccent_init"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."unaccent_init"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."unaccent_init"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."unaccent_init"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."unaccent_lexize"("internal", "internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."unaccent_lexize"("internal", "internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."unaccent_lexize"("internal", "internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."unaccent_lexize"("internal", "internal", "internal", "internal") TO "service_role";



REVOKE ALL ON FUNCTION "public"."unregister_push_token"("p_token" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."unregister_push_token"("p_token" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."unregister_push_token"("p_token" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."unregister_push_token"("p_token" "text") TO "service_role";
























GRANT ALL ON TABLE "public"."ad_creatives" TO "anon";
GRANT ALL ON TABLE "public"."ad_creatives" TO "authenticated";
GRANT ALL ON TABLE "public"."ad_creatives" TO "service_role";



GRANT ALL ON TABLE "public"."ad_placements" TO "anon";
GRANT ALL ON TABLE "public"."ad_placements" TO "authenticated";
GRANT ALL ON TABLE "public"."ad_placements" TO "service_role";



GRANT ALL ON TABLE "public"."ad_settings" TO "anon";
GRANT ALL ON TABLE "public"."ad_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."ad_settings" TO "service_role";



GRANT ALL ON TABLE "public"."ai_answers" TO "anon";
GRANT ALL ON TABLE "public"."ai_answers" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_answers" TO "service_role";



GRANT ALL ON TABLE "public"."ai_article_metadata" TO "anon";
GRANT ALL ON TABLE "public"."ai_article_metadata" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_article_metadata" TO "service_role";



GRANT ALL ON TABLE "public"."ai_briefing_items" TO "anon";
GRANT ALL ON TABLE "public"."ai_briefing_items" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_briefing_items" TO "service_role";



GRANT ALL ON TABLE "public"."ai_briefings" TO "anon";
GRANT ALL ON TABLE "public"."ai_briefings" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_briefings" TO "service_role";



GRANT ALL ON TABLE "public"."ai_usage_daily" TO "anon";
GRANT ALL ON TABLE "public"."ai_usage_daily" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_usage_daily" TO "service_role";



GRANT ALL ON TABLE "public"."analytics_events" TO "anon";
GRANT ALL ON TABLE "public"."analytics_events" TO "authenticated";
GRANT ALL ON TABLE "public"."analytics_events" TO "service_role";



GRANT ALL ON SEQUENCE "public"."analytics_events_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."analytics_events_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."analytics_events_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."app_notifications" TO "anon";
GRANT ALL ON TABLE "public"."app_notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."app_notifications" TO "service_role";



GRANT ALL ON TABLE "public"."app_push_tokens" TO "anon";
GRANT ALL ON TABLE "public"."app_push_tokens" TO "authenticated";
GRANT ALL ON TABLE "public"."app_push_tokens" TO "service_role";



GRANT ALL ON TABLE "public"."article_tags" TO "anon";
GRANT ALL ON TABLE "public"."article_tags" TO "authenticated";
GRANT ALL ON TABLE "public"."article_tags" TO "service_role";



GRANT ALL ON TABLE "public"."articles" TO "anon";
GRANT ALL ON TABLE "public"."articles" TO "authenticated";
GRANT ALL ON TABLE "public"."articles" TO "service_role";



GRANT ALL ON TABLE "public"."authors" TO "anon";
GRANT ALL ON TABLE "public"."authors" TO "authenticated";
GRANT ALL ON TABLE "public"."authors" TO "service_role";



GRANT ALL ON TABLE "public"."categories" TO "anon";
GRANT ALL ON TABLE "public"."categories" TO "authenticated";
GRANT ALL ON TABLE "public"."categories" TO "service_role";



GRANT ALL ON TABLE "public"."chautari_bans" TO "anon";
GRANT ALL ON TABLE "public"."chautari_bans" TO "authenticated";
GRANT ALL ON TABLE "public"."chautari_bans" TO "service_role";



GRANT ALL ON TABLE "public"."chautari_host_entitlements" TO "anon";
GRANT ALL ON TABLE "public"."chautari_host_entitlements" TO "authenticated";
GRANT ALL ON TABLE "public"."chautari_host_entitlements" TO "service_role";



GRANT ALL ON TABLE "public"."chautari_invites" TO "service_role";



GRANT ALL ON TABLE "public"."chautari_moderation_log" TO "anon";
GRANT ALL ON TABLE "public"."chautari_moderation_log" TO "authenticated";
GRANT ALL ON TABLE "public"."chautari_moderation_log" TO "service_role";



GRANT ALL ON TABLE "public"."chautari_participants" TO "anon";
GRANT ALL ON TABLE "public"."chautari_participants" TO "authenticated";
GRANT ALL ON TABLE "public"."chautari_participants" TO "service_role";



GRANT ALL ON TABLE "public"."chautari_push_log" TO "service_role";



GRANT ALL ON TABLE "public"."chautari_reports" TO "anon";
GRANT ALL ON TABLE "public"."chautari_reports" TO "authenticated";
GRANT ALL ON TABLE "public"."chautari_reports" TO "service_role";



GRANT ALL ON TABLE "public"."chautari_rooms" TO "anon";
GRANT ALL ON TABLE "public"."chautari_rooms" TO "authenticated";
GRANT ALL ON TABLE "public"."chautari_rooms" TO "service_role";



GRANT ALL ON TABLE "public"."chautari_speaker_requests" TO "anon";
GRANT ALL ON TABLE "public"."chautari_speaker_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."chautari_speaker_requests" TO "service_role";



GRANT ALL ON TABLE "public"."contact_messages" TO "anon";
GRANT ALL ON TABLE "public"."contact_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."contact_messages" TO "service_role";



GRANT ALL ON TABLE "public"."editors" TO "anon";
GRANT ALL ON TABLE "public"."editors" TO "authenticated";
GRANT ALL ON TABLE "public"."editors" TO "service_role";



GRANT ALL ON TABLE "public"."forex_rates" TO "anon";
GRANT ALL ON TABLE "public"."forex_rates" TO "authenticated";
GRANT ALL ON TABLE "public"."forex_rates" TO "service_role";



GRANT ALL ON TABLE "public"."live_updates" TO "anon";
GRANT ALL ON TABLE "public"."live_updates" TO "authenticated";
GRANT ALL ON TABLE "public"."live_updates" TO "service_role";



GRANT ALL ON TABLE "public"."media_assets" TO "anon";
GRANT ALL ON TABLE "public"."media_assets" TO "authenticated";
GRANT ALL ON TABLE "public"."media_assets" TO "service_role";



GRANT ALL ON TABLE "public"."mobile_push_log" TO "service_role";



GRANT ALL ON TABLE "public"."mobile_push_tokens" TO "service_role";



GRANT ALL ON TABLE "public"."monthly_timesheets" TO "anon";
GRANT ALL ON TABLE "public"."monthly_timesheets" TO "authenticated";
GRANT ALL ON TABLE "public"."monthly_timesheets" TO "service_role";



GRANT ALL ON TABLE "public"."newsletter_sends" TO "anon";
GRANT ALL ON TABLE "public"."newsletter_sends" TO "authenticated";
GRANT ALL ON TABLE "public"."newsletter_sends" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."reader_subscriptions" TO "anon";
GRANT ALL ON TABLE "public"."reader_subscriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."reader_subscriptions" TO "service_role";



GRANT ALL ON TABLE "public"."reminder_push_log" TO "service_role";



GRANT ALL ON TABLE "public"."shifts" TO "anon";
GRANT ALL ON TABLE "public"."shifts" TO "authenticated";
GRANT ALL ON TABLE "public"."shifts" TO "service_role";



GRANT ALL ON TABLE "public"."subscribers" TO "anon";
GRANT ALL ON TABLE "public"."subscribers" TO "authenticated";
GRANT ALL ON TABLE "public"."subscribers" TO "service_role";



GRANT ALL ON TABLE "public"."tags" TO "anon";
GRANT ALL ON TABLE "public"."tags" TO "authenticated";
GRANT ALL ON TABLE "public"."tags" TO "service_role";



GRANT ALL ON TABLE "public"."user_follows" TO "anon";
GRANT ALL ON TABLE "public"."user_follows" TO "authenticated";
GRANT ALL ON TABLE "public"."user_follows" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";



































