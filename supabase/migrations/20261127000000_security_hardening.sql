-- ============================================================================
--  INNER CIRCLE NEPAL — Security hardening (pre-launch audit, 2026-11-27)
-- ============================================================================
--  Run once in the Supabase SQL editor, BEFORE deploying the site that goes
--  with it (its earnings route reads chautari_gifts.clawed_back). Until that
--  site is live, ad impressions and clicks go uncounted: the old site calls
--  record_ad_event with the public key, which is refused here, and those
--  routes swallow the error. Deploy the site straight after. Idempotent.
--
--  1. Functions only the server may run. record_ad_event was granted to anon
--     on purpose, which let anyone inflate ad counters without the site's
--     rate limit. The other three are already service-role-only in production;
--     the local copy over-grants them, so they are revoked here as well.
--     Production's default privileges give every NEW function in `public` to
--     anon and authenticated: every new function needs its own revoke.
--  2. A new Supabase Auth login starts inactive. Staff are created by the
--     newsroom's Users page, which activates them; a login made through the
--     public sign-up endpoint is no longer an active staff profile.
--  3. Refund clawback. When a refund leaves the buyer owing coins (they had
--     already spent them on gifts), the gifts paid for with those coins are
--     reversed from the hosts' points, newest first, up to what is owed.
-- ============================================================================


-- 1. Server-only functions ----------------------------------------------------

revoke all on function public.record_ad_event(uuid, text) from public, anon, authenticated;
grant execute on function public.record_ad_event(uuid, text) to service_role;

revoke all on function public.ai_claim_jobs(integer) from public, anon, authenticated;
grant execute on function public.ai_claim_jobs(integer) to service_role;

revoke all on function public.close_stale_shifts(integer) from public, anon, authenticated;
grant execute on function public.close_stale_shifts(integer) to service_role;

revoke all on function public.snapshot_month(date) from public, anon, authenticated;
grant execute on function public.snapshot_month(date) to service_role;


-- 2. New logins start inactive -------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  first_user boolean;
begin
  select count(*) = 0 into first_user from public.profiles;

  -- Only the very first login of an empty project is active (and superadmin).
  -- Everyone else waits for a superadmin: the Users page sets is_active.
  insert into public.profiles (id, email, full_name, role, capabilities, is_active)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    case when first_user then 'superadmin'::public.app_role else 'admin'::public.app_role end,
    '{}',
    first_user
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;


-- 3. Refund clawback ------------------------------------------------------------

-- How much of each gift has been taken back because its coins were refunded.
alter table public.chautari_gifts
  add column if not exists clawed_back integer not null default 0;
alter table public.chautari_gifts drop constraint if exists chautari_gifts_clawed_back_range;
alter table public.chautari_gifts
  add constraint chautari_gifts_clawed_back_range check (clawed_back between 0 and coins);

alter table public.ledger_transactions drop constraint if exists ledger_transactions_kind_check;
alter table public.ledger_transactions
  add constraint ledger_transactions_kind_check
  check (kind in ('purchase', 'refund', 'gift', 'adjustment', 'clawback'));

/*
  refund_store_purchase, as before, plus the clawback. Returns
  { status: 'refunded', coins, clawedBack } | 'already_refunded' |
  'refunded_before_credit' | 'unknown_product'.

  Unspent coins are taken back first (the refund itself). Only what the buyer
  had already spent, i.e. how far the refund pushes their balance below zero,
  capped at the pack, is clawed back, from their gifts made since this
  purchase was credited, newest first. Each clawback is its own ledger
  transaction: the host's points go down, the buyer's debt goes down by the
  same amount. A host's points may go negative; payouts must not pay a
  negative or recent balance.

  Wallets are locked in one sorted order (as send_gift does), so a refund and
  a gift between the same people cannot deadlock. The buyer's wallet is the
  STORED buyer's, not whatever the event says.
*/
create or replace function public.refund_store_purchase(
  p_store           text,
  p_transaction_id  text,
  p_clerk_user_id   text,
  p_product_id      text,
  p_is_test         boolean,
  p_source          text,
  p_source_event_id text
)
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_owner    text;
  v_people   text[];
  v_person   text;
  v_purchase public.store_purchases;
  v_coins    integer;
  v_txn_id   uuid;
  v_wallet   public.coin_wallets;
  v_owed     bigint;
  v_gift     record;
  v_take     integer;
  v_clawed   bigint := 0;
begin
  select clerk_user_id into v_owner from public.store_purchases
  where store = p_store and store_transaction_id = p_transaction_id;
  v_owner := coalesce(v_owner, p_clerk_user_id);

  -- The buyer and everyone they could owe a clawback, locked in sorted order.
  select array_agg(x order by x) into v_people from (
    select v_owner as x
    union
    select g.recipient_clerk_id
    from public.chautari_gifts g
    join public.store_purchases sp
      on sp.store = p_store and sp.store_transaction_id = p_transaction_id
    where g.sender_clerk_id = v_owner
      and g.is_test = sp.is_test
      and g.created_at >= sp.created_at
      and g.coins > g.clawed_back
  ) s;
  foreach v_person in array v_people loop
    perform public.lock_coin_wallet(v_person);
  end loop;

  select * into v_purchase from public.store_purchases
  where store = p_store and store_transaction_id = p_transaction_id
  for update;

  if v_purchase.id is null then
    -- Refund before the purchase: remember it so the purchase never credits.
    select coins into v_coins from public.coin_packs where product_id = p_product_id;
    if v_coins is null then
      return jsonb_build_object('status', 'unknown_product');
    end if;
    insert into public.store_purchases (
      store, store_transaction_id, clerk_user_id, product_id, coins, is_test,
      source, source_event_id, status, refunded_at
    ) values (
      p_store, p_transaction_id, p_clerk_user_id, p_product_id, v_coins, p_is_test,
      p_source, p_source_event_id, 'refunded_before_credit', now()
    );
    return jsonb_build_object('status', 'refunded_before_credit');
  end if;

  if v_purchase.status <> 'credited' then
    return jsonb_build_object('status', 'already_refunded');
  end if;

  update public.store_purchases
    set status = 'refunded', refunded_at = now()
  where id = v_purchase.id;

  insert into public.ledger_transactions (kind, idempotency_key, purchase_id)
  values ('refund', 'refund:' || p_store || ':' || p_transaction_id, v_purchase.id)
  returning id into v_txn_id;

  insert into public.ledger_postings (transaction_id, account, clerk_user_id, amount, is_test) values
    (v_txn_id, 'listener_coins', v_purchase.clerk_user_id, -v_purchase.coins, v_purchase.is_test),
    (v_txn_id, 'store_issuance', null, v_purchase.coins, v_purchase.is_test);

  update public.coin_wallets set
    coins      = coins - case when v_purchase.is_test then 0 else v_purchase.coins end,
    test_coins = test_coins - case when v_purchase.is_test then v_purchase.coins else 0 end,
    updated_at = now()
  where clerk_user_id = v_purchase.clerk_user_id
  returning * into v_wallet;

  -- What the buyer had already spent of these coins.
  v_owed := least(
    v_purchase.coins,
    greatest(0, -(case when v_purchase.is_test then v_wallet.test_coins else v_wallet.coins end))
  );

  if v_owed > 0 then
    for v_gift in
      select g.id, g.recipient_clerk_id, g.coins - g.clawed_back as open
      from public.chautari_gifts g
      where g.sender_clerk_id = v_purchase.clerk_user_id
        and g.is_test = v_purchase.is_test
        and g.created_at >= v_purchase.created_at
        and g.coins > g.clawed_back
        and g.recipient_clerk_id = any(v_people)   -- only wallets locked above
      order by g.created_at desc
      for update of g
    loop
      exit when v_owed <= 0;
      v_take := least(v_owed, v_gift.open);

      update public.chautari_gifts set clawed_back = clawed_back + v_take where id = v_gift.id;

      insert into public.ledger_transactions (kind, idempotency_key, purchase_id, gift_id, note)
      values (
        'clawback',
        'clawback:' || p_store || ':' || p_transaction_id || ':' || v_gift.id,
        v_purchase.id, v_gift.id,
        'gift paid with refunded coins'
      )
      returning id into v_txn_id;

      insert into public.ledger_postings (transaction_id, account, clerk_user_id, amount, is_test) values
        (v_txn_id, 'host_points', v_gift.recipient_clerk_id, -v_take, v_purchase.is_test),
        (v_txn_id, 'listener_coins', v_purchase.clerk_user_id, v_take, v_purchase.is_test);

      update public.coin_wallets set
        points      = points - case when v_purchase.is_test then 0 else v_take end,
        test_points = test_points - case when v_purchase.is_test then v_take else 0 end,
        updated_at  = now()
      where clerk_user_id = v_gift.recipient_clerk_id;

      update public.coin_wallets set
        coins      = coins + case when v_purchase.is_test then 0 else v_take end,
        test_coins = test_coins + case when v_purchase.is_test then v_take else 0 end,
        updated_at = now()
      where clerk_user_id = v_purchase.clerk_user_id;

      v_owed := v_owed - v_take;
      v_clawed := v_clawed + v_take;
    end loop;
  end if;

  return jsonb_build_object('status', 'refunded', 'coins', v_purchase.coins, 'clawedBack', v_clawed);
end;
$$;

revoke all on function public.refund_store_purchase(text, text, text, text, boolean, text, text) from public, anon, authenticated;
grant execute on function public.refund_store_purchase(text, text, text, text, boolean, text, text) to service_role;
