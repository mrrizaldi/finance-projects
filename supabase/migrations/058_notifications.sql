create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('tx_baru', 'laporan', 'parse_gagal')),
  title text not null,
  body text not null,
  payload jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_user_created_idx on notifications (user_id, created_at desc);
create index notifications_user_unread_idx on notifications (user_id) where read_at is null;

alter table notifications enable row level security;

create policy notifications_select_own on notifications
  for select using (auth.uid() = user_id);

create policy notifications_update_own on notifications
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy notifications_delete_own on notifications
  for delete using (auth.uid() = user_id);

grant select, update, delete on notifications to authenticated;

create or replace function notify_push_on_transaction_insert()
returns trigger as $$
declare
  v record;
  v_amount text;
  v_body text;
begin
  select category_name, account_name, to_account_name, is_adjustment
    into v
    from v_transactions
   where id = new.id;

  v_amount := 'Rp ' || replace(to_char(new.amount, 'FM999G999G999G999'), ',', '.');

  if coalesce(v.is_adjustment, false) then
    v_body := 'Penyesuaian ' || v_amount || ' · ' || coalesce(v.account_name, 'Akun');
  elsif new.type = 'transfer' then
    v_body := 'Transfer ' || v_amount || ' · ' || coalesce(v.account_name, '') || ' → ' || coalesce(v.to_account_name, '');
  elsif new.type = 'income' then
    v_body := 'Pemasukan ' || v_amount || ' · ' || coalesce(v.category_name, '-') || ' · ' || coalesce(v.account_name, '-');
  else
    v_body := 'Pengeluaran ' || v_amount || ' · ' || coalesce(v.category_name, '-') || ' · ' || coalesce(v.account_name, '-');
  end if;

  insert into notifications (user_id, kind, title, body, payload)
  values (new.user_id, 'tx_baru', 'Transaksi Baru', v_body,
          jsonb_build_object('transaction_id', new.id));

  return new;
end;
$$ language plpgsql security definer;

create or replace function notify_push_on_notification_insert()
returns trigger as $$
declare
  webhook_secret text;
begin
  select decrypted_secret into webhook_secret
    from vault.decrypted_secrets
   where name = 'push_webhook_secret'
   limit 1;

  if webhook_secret is null or webhook_secret = '' then
    return new;
  end if;

  perform net.http_post(
    url := 'https://finance-dashboard.mrrizaldi.com/api/push/notify',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Webhook-Secret', webhook_secret
    ),
    body := jsonb_build_object(
      'type', 'INSERT',
      'table', 'notifications',
      'schema', 'public',
      'record', jsonb_build_object('id', new.id, 'user_id', new.user_id)
    )
  );

  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists push_notify_on_notification_insert on notifications;
create trigger push_notify_on_notification_insert
  after insert on notifications
  for each row
  execute function notify_push_on_notification_insert();
