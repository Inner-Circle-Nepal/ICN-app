-- ============================================================================
--  Rate limiting: only the service role may count (2026-11-24)
-- ============================================================================
--  Mirrors the change to the site repo's supabase/2026-10-rate-limits.sql.
--  The site's limiter now calls these with the service-role key; the anon key
--  is public (it ships in the app), so it must not be able to inflate another
--  reader's counter or fill the table with junk keys.
-- ============================================================================

revoke execute on function public.bump_rate_limit(text, text, integer)
  from public, anon, authenticated;
grant execute on function public.bump_rate_limit(text, text, integer) to service_role;

revoke execute on function public.prune_rate_limits() from public, anon, authenticated;
grant execute on function public.prune_rate_limits() to service_role;
