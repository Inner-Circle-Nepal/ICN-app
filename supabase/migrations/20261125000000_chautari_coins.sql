-- ============================================================================
--  INNER CIRCLE NEPAL — Chautari coins, gifts and the ledger
-- ============================================================================
--  Copy of the site repo's supabase/2026-11-chautari-coins.sql, so the local
--  stack (npx supabase db reset) has it. Production applies the site
--  file by hand in the SQL editor.
--  Idempotent: safe to re-run.
--
--  Listeners buy coins through Apple / Google in-app purchases (RevenueCat
--  today) and spend them on gifts to a room's host. Hosts earn points, which
--  nobody can buy. Nothing here pays anyone out.
--
--  Every table is written only by the server (service role) through the
--  functions below; RLS is on with no policies, and the functions are not
--  executable by anon or authenticated.
--
--  THE LEDGER
--  ----------
--  `ledger_transactions` + `ledger_postings` record every coin and point
--  movement. Postings of one transaction sum to zero (double entry), amounts
--  are whole numbers, and neither table can be updated or deleted: a mistake
--  is fixed by a new, reversing transaction. `coin_wallets` is a cached copy
--  of the sums, changed only inside the same transaction as the postings.
--
--  TEST COINS
--  ----------
--  Purchases made through a sandbox (RevenueCat Test Store, Apple sandbox,
--  Google license testers, App Review) give test coins. A gift is paid in one
--  kind only, never mixed. A test gift shows in the room like any other but
--  only ever adds to the host's `test_points`, which are never paid out.
-- ============================================================================


-- ----------------------------------------------------------------------------
--  Catalogue: what packs give and what gifts cost. The server is the only
--  authority on both; the stores only know product ids and prices.
-- ----------------------------------------------------------------------------

create table if not exists public.coin_packs (
  product_id text primary key,                    -- same id on every store
  coins      integer not null check (coins > 0),
  active     boolean not null default true,
  sort       integer not null default 0
);

create table if not exists public.gift_catalog (
  id      text primary key check (id ~ '^[a-z0-9_]{2,30}$'),
  name    text not null,
  name_ne text,
  coins   integer not null check (coins > 0),
  active  boolean not null default true,
  sort    integer not null default 0
);

-- Placeholders for testing; edit the rows, not the app.
insert into public.coin_packs (product_id, coins, sort) values
  ('coins_100', 100, 1),
  ('coins_500', 500, 2),
  ('coins_1000', 1000, 3)
on conflict (product_id) do nothing;

insert into public.gift_catalog (id, name, name_ne, coins, sort) values
  ('phool', 'Phool', 'फूल', 10, 1),
  ('chiya', 'Chiya', 'चिया', 50, 2),
  ('diyo',  'Diyo',  'दियो', 100, 3)
on conflict (id) do nothing;


-- ----------------------------------------------------------------------------
--  Store purchases. Keyed on the store's own transaction id, not the
--  provider's event id: if purchases ever reach us through a second path
--  (our own Apple/Google verification replacing RevenueCat, or both during a
--  move), the same purchase still cannot be credited twice.
-- ----------------------------------------------------------------------------

create table if not exists public.store_purchases (
  id                   uuid primary key default gen_random_uuid(),
  store                text not null check (store in ('app_store', 'play_store', 'test_store')),
  store_transaction_id text not null,
  clerk_user_id        text not null,
  product_id           text not null,
  coins                integer not null check (coins >= 0),
  is_test              boolean not null,
  purchased_at         timestamptz,
  country              text,
  price_micros         bigint,
  currency             text,
  source               text not null,               -- 'revenuecat', later 'apple' / 'google'
  source_event_id      text,
  /* `refunded_before_credit`: the refund arrived first. The row exists so a
     late purchase event finds it and credits nothing. */
  status               text not null default 'credited'
                       check (status in ('credited', 'refunded', 'refunded_before_credit')),
  created_at           timestamptz not null default now(),
  refunded_at          timestamptz,
  unique (store, store_transaction_id)
);

create index if not exists store_purchases_buyer
  on public.store_purchases (clerk_user_id, created_at desc);


-- ----------------------------------------------------------------------------
--  Gifts. One row per gift; `recipient_clerk_id` is the host today, and is a
--  column so speakers could receive later without a schema change.
-- ----------------------------------------------------------------------------

create table if not exists public.chautari_gifts (
  id                 uuid primary key default gen_random_uuid(),
  request_id         uuid not null unique,          -- the app's idempotency key
  room_id            uuid not null references public.chautari_rooms(id) on delete restrict,
  sender_clerk_id    text not null,
  recipient_clerk_id text not null,
  gift_id            text not null references public.gift_catalog(id),
  coins              integer not null check (coins > 0),
  is_test            boolean not null,
  created_at         timestamptz not null default now(),
  check (sender_clerk_id <> recipient_clerk_id)
);

create index if not exists chautari_gifts_room
  on public.chautari_gifts (room_id, created_at desc);
create index if not exists chautari_gifts_recipient
  on public.chautari_gifts (recipient_clerk_id, created_at desc);
create index if not exists chautari_gifts_sender
  on public.chautari_gifts (sender_clerk_id, created_at desc);


-- ----------------------------------------------------------------------------
--  Ledger.
-- ----------------------------------------------------------------------------

create table if not exists public.ledger_transactions (
  id              uuid primary key default gen_random_uuid(),
  kind            text not null check (kind in ('purchase', 'refund', 'gift', 'adjustment')),
  idempotency_key text not null unique,
  purchase_id     uuid references public.store_purchases(id),
  gift_id         uuid references public.chautari_gifts(id),
  note            text,
  created_at      timestamptz not null default now()
);

create table if not exists public.ledger_postings (
  id             bigint generated always as identity primary key,
  transaction_id uuid not null references public.ledger_transactions(id),
  /* store_issuance: coins entering from store sales (negative = issued);
     adjustments: staff/test grants; listener_coins / host_points: per person. */
  account        text not null
                 check (account in ('store_issuance', 'adjustments', 'listener_coins', 'host_points')),
  clerk_user_id  text,
  amount         bigint not null check (amount <> 0),
  is_test        boolean not null,
  created_at     timestamptz not null default now(),
  check ((account in ('listener_coins', 'host_points')) = (clerk_user_id is not null))
);

create index if not exists ledger_postings_transaction
  on public.ledger_postings (transaction_id);
create index if not exists ledger_postings_person
  on public.ledger_postings (clerk_user_id, account, created_at desc)
  where clerk_user_id is not null;

create table if not exists public.coin_wallets (
  clerk_user_id text primary key,
  coins         bigint not null default 0,          -- may go negative after a refund
  test_coins    bigint not null default 0,
  points        bigint not null default 0,          -- payable, real coins only
  test_points   bigint not null default 0,          -- never payable
  updated_at    timestamptz not null default now()
);

-- Append-only: even the service role cannot rewrite history.
create or replace function public.ledger_refuse_change()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception 'ledger rows are append-only (% on %)', tg_op, tg_table_name;
end;
$$;

drop trigger if exists ledger_transactions_append_only on public.ledger_transactions;
create trigger ledger_transactions_append_only
  before update or delete on public.ledger_transactions
  for each row execute function public.ledger_refuse_change();

drop trigger if exists ledger_postings_append_only on public.ledger_postings;
create trigger ledger_postings_append_only
  before update or delete on public.ledger_postings
  for each row execute function public.ledger_refuse_change();

alter table public.coin_packs          enable row level security;
alter table public.gift_catalog        enable row level security;
alter table public.store_purchases     enable row level security;
alter table public.chautari_gifts      enable row level security;
alter table public.ledger_transactions enable row level security;
alter table public.ledger_postings     enable row level security;
alter table public.coin_wallets        enable row level security;


-- ----------------------------------------------------------------------------
--  Locks a wallet row, creating it first if needed. Every function that
--  changes balances goes through here, so concurrent calls for the same
--  person queue on the row lock instead of both reading the old balance.
-- ----------------------------------------------------------------------------

create or replace function public.lock_coin_wallet(p_clerk_user_id text)
returns public.coin_wallets
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_wallet public.coin_wallets;
begin
  insert into public.coin_wallets (clerk_user_id) values (p_clerk_user_id)
  on conflict (clerk_user_id) do nothing;

  select * into v_wallet from public.coin_wallets
  where clerk_user_id = p_clerk_user_id
  for update;

  return v_wallet;
end;
$$;


-- ----------------------------------------------------------------------------
--  credit_store_purchase: a verified purchase → coins. Returns
--  { status: 'credited' | 'already_credited' | 'unknown_product', ... }.
--  An unknown product credits nothing and records nothing, so fixing the
--  catalogue and replaying the event still works.
-- ----------------------------------------------------------------------------

create or replace function public.credit_store_purchase(
  p_store           text,
  p_transaction_id  text,
  p_clerk_user_id   text,
  p_product_id      text,
  p_is_test         boolean,
  p_purchased_at    timestamptz,
  p_country         text,
  p_price_micros    bigint,
  p_currency        text,
  p_source          text,
  p_source_event_id text
)
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_coins       integer;
  v_purchase_id uuid;
  v_txn_id      uuid;
  v_wallet      public.coin_wallets;
begin
  select coins into v_coins from public.coin_packs where product_id = p_product_id;
  if v_coins is null then
    return jsonb_build_object('status', 'unknown_product');
  end if;

  -- Lock first, so two deliveries of the same purchase queue here.
  v_wallet := public.lock_coin_wallet(p_clerk_user_id);

  insert into public.store_purchases (
    store, store_transaction_id, clerk_user_id, product_id, coins, is_test,
    purchased_at, country, price_micros, currency, source, source_event_id
  ) values (
    p_store, p_transaction_id, p_clerk_user_id, p_product_id, v_coins, p_is_test,
    p_purchased_at, p_country, p_price_micros, p_currency, p_source, p_source_event_id
  )
  on conflict (store, store_transaction_id) do nothing
  returning id into v_purchase_id;

  if v_purchase_id is null then
    return jsonb_build_object('status', 'already_credited');
  end if;

  insert into public.ledger_transactions (kind, idempotency_key, purchase_id)
  values ('purchase', 'purchase:' || p_store || ':' || p_transaction_id, v_purchase_id)
  returning id into v_txn_id;

  insert into public.ledger_postings (transaction_id, account, clerk_user_id, amount, is_test) values
    (v_txn_id, 'store_issuance', null, -v_coins, p_is_test),
    (v_txn_id, 'listener_coins', p_clerk_user_id, v_coins, p_is_test);

  update public.coin_wallets set
    coins      = coins + case when p_is_test then 0 else v_coins end,
    test_coins = test_coins + case when p_is_test then v_coins else 0 end,
    updated_at = now()
  where clerk_user_id = p_clerk_user_id
  returning * into v_wallet;

  return jsonb_build_object(
    'status', 'credited',
    'purchaseId', v_purchase_id,
    'coins', v_coins,
    'isTest', p_is_test,
    'balance', v_wallet.coins + v_wallet.test_coins
  );
end;
$$;


-- ----------------------------------------------------------------------------
--  refund_store_purchase: the store gave the money back → take the coins
--  back, once. The balance may go negative (coins already spent); gifting is
--  then refused until it is positive again. Returns
--  { status: 'refunded' | 'already_refunded' | 'refunded_before_credit' | 'unknown_product' }.
-- ----------------------------------------------------------------------------

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
  v_purchase public.store_purchases;
  v_coins    integer;
  v_txn_id   uuid;
begin
  perform public.lock_coin_wallet(p_clerk_user_id);

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
  where clerk_user_id = v_purchase.clerk_user_id;

  return jsonb_build_object('status', 'refunded', 'coins', v_purchase.coins);
end;
$$;


-- ----------------------------------------------------------------------------
--  send_gift: listener → host, in one transaction. The caller (the gift
--  route) has already checked the room rules; this checks only money.
--  Returns { status: 'sent' | 'insufficient_coins' | 'gift_unavailable' |
--  'cannot_gift_self' | 'request_conflict', ... }. A repeated request_id
--  returns the first result with `replay: true` and moves nothing.
-- ----------------------------------------------------------------------------

create or replace function public.send_gift(
  p_request_id   uuid,
  p_room_id      uuid,
  p_sender       text,
  p_recipient    text,
  p_gift_id      text
)
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_cost     integer;
  v_is_test  boolean;
  v_existing public.chautari_gifts;
  v_sender   public.coin_wallets;
  v_gift_id  uuid;
  v_txn_id   uuid;
begin
  if p_sender = p_recipient then
    return jsonb_build_object('status', 'cannot_gift_self');
  end if;

  -- Lock both wallets in a fixed order so two people gifting each other at
  -- once cannot deadlock.
  if p_sender < p_recipient then
    v_sender := public.lock_coin_wallet(p_sender);
    perform public.lock_coin_wallet(p_recipient);
  else
    perform public.lock_coin_wallet(p_recipient);
    v_sender := public.lock_coin_wallet(p_sender);
  end if;

  -- Checked after the lock: a double tap's second call waits for the first.
  select * into v_existing from public.chautari_gifts where request_id = p_request_id;
  if v_existing.id is not null then
    if v_existing.sender_clerk_id <> p_sender then
      return jsonb_build_object('status', 'request_conflict');
    end if;
    return jsonb_build_object(
      'status', 'sent',
      'replay', true,
      'giftRowId', v_existing.id,
      'giftId', v_existing.gift_id,
      'coins', v_existing.coins,
      'isTest', v_existing.is_test,
      'balance', v_sender.coins + v_sender.test_coins
    );
  end if;

  select coins into v_cost from public.gift_catalog where id = p_gift_id and active;
  if v_cost is null then
    return jsonb_build_object('status', 'gift_unavailable');
  end if;

  -- One kind only: test coins if they cover the whole gift, else real coins.
  if v_sender.test_coins >= v_cost then
    v_is_test := true;
  elsif v_sender.coins >= v_cost then
    v_is_test := false;
  else
    return jsonb_build_object(
      'status', 'insufficient_coins',
      'balance', v_sender.coins + v_sender.test_coins
    );
  end if;

  insert into public.chautari_gifts (
    request_id, room_id, sender_clerk_id, recipient_clerk_id, gift_id, coins, is_test
  ) values (
    p_request_id, p_room_id, p_sender, p_recipient, p_gift_id, v_cost, v_is_test
  )
  returning id into v_gift_id;

  insert into public.ledger_transactions (kind, idempotency_key, gift_id)
  values ('gift', 'gift:' || p_request_id::text, v_gift_id)
  returning id into v_txn_id;

  insert into public.ledger_postings (transaction_id, account, clerk_user_id, amount, is_test) values
    (v_txn_id, 'listener_coins', p_sender, -v_cost, v_is_test),
    (v_txn_id, 'host_points', p_recipient, v_cost, v_is_test);

  update public.coin_wallets set
    coins      = coins - case when v_is_test then 0 else v_cost end,
    test_coins = test_coins - case when v_is_test then v_cost else 0 end,
    updated_at = now()
  where clerk_user_id = p_sender
  returning * into v_sender;

  update public.coin_wallets set
    points      = points + case when v_is_test then 0 else v_cost end,
    test_points = test_points + case when v_is_test then v_cost else 0 end,
    updated_at  = now()
  where clerk_user_id = p_recipient;

  return jsonb_build_object(
    'status', 'sent',
    'replay', false,
    'giftRowId', v_gift_id,
    'giftId', p_gift_id,
    'coins', v_cost,
    'isTest', v_is_test,
    'balance', v_sender.coins + v_sender.test_coins
  );
end;
$$;


-- ----------------------------------------------------------------------------
--  adjust_coins: a staff or test grant (or correction), as its own ledger
--  transaction. `p_key` makes a repeated call a no-op. Not exposed by any
--  route yet; used by the local bots CLI and by hand.
-- ----------------------------------------------------------------------------

create or replace function public.adjust_coins(
  p_clerk_user_id text,
  p_amount        integer,
  p_is_test       boolean,
  p_note          text,
  p_key           text
)
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_txn_id uuid;
  v_wallet public.coin_wallets;
begin
  if p_amount = 0 then
    raise exception 'amount must not be zero';
  end if;

  v_wallet := public.lock_coin_wallet(p_clerk_user_id);

  insert into public.ledger_transactions (kind, idempotency_key, note)
  values ('adjustment', 'adjustment:' || p_key, p_note)
  on conflict (idempotency_key) do nothing
  returning id into v_txn_id;

  if v_txn_id is null then
    return jsonb_build_object('status', 'already_applied');
  end if;

  insert into public.ledger_postings (transaction_id, account, clerk_user_id, amount, is_test) values
    (v_txn_id, 'adjustments', null, -p_amount, p_is_test),
    (v_txn_id, 'listener_coins', p_clerk_user_id, p_amount, p_is_test);

  update public.coin_wallets set
    coins      = coins + case when p_is_test then 0 else p_amount end,
    test_coins = test_coins + case when p_is_test then p_amount else 0 end,
    updated_at = now()
  where clerk_user_id = p_clerk_user_id
  returning * into v_wallet;

  return jsonb_build_object('status', 'applied', 'balance', v_wallet.coins + v_wallet.test_coins);
end;
$$;


-- ----------------------------------------------------------------------------
--  Only the server may call these. Postgres grants EXECUTE to PUBLIC by
--  default and Supabase adds anon/authenticated, so all three are revoked.
-- ----------------------------------------------------------------------------

revoke all on function public.lock_coin_wallet(text) from public, anon, authenticated;
revoke all on function public.credit_store_purchase(text, text, text, text, boolean, timestamptz, text, bigint, text, text, text) from public, anon, authenticated;
revoke all on function public.refund_store_purchase(text, text, text, text, boolean, text, text) from public, anon, authenticated;
revoke all on function public.send_gift(uuid, uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.adjust_coins(text, integer, boolean, text, text) from public, anon, authenticated;

grant execute on function public.lock_coin_wallet(text) to service_role;
grant execute on function public.credit_store_purchase(text, text, text, text, boolean, timestamptz, text, bigint, text, text, text) to service_role;
grant execute on function public.refund_store_purchase(text, text, text, text, boolean, text, text) to service_role;
grant execute on function public.send_gift(uuid, uuid, text, text, text) to service_role;
grant execute on function public.adjust_coins(text, integer, boolean, text, text) to service_role;
