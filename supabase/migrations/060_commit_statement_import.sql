BEGIN;

ALTER TABLE public.statement_imports
  ADD COLUMN app_findings jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN audit jsonb;

create or replace function notify_push_on_transaction_insert()
returns trigger as $$
declare
  v record;
  v_amount text;
  v_body text;
begin
  if new.source = 'statement_import' then
    return new;
  end if;

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

CREATE FUNCTION public.commit_statement_import(p_import uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path = public
AS $function$
DECLARE
  v_import public.statement_imports%ROWTYPE;
  v_line public.statement_lines%ROWTYPE;
  v_old public.transactions%ROWTYPE;
  v_finding jsonb;
  v_tx_id uuid;
  v_type text;
  v_account uuid;
  v_inserted integer := 0;
  v_moved integer := 0;
  v_deleted integer := 0;
BEGIN
  SELECT * INTO v_import FROM public.statement_imports WHERE id = p_import FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Import tidak ditemukan: %', p_import; END IF;
  IF v_import.status <> 'review' THEN RAISE EXCEPTION 'Import sudah berstatus %', v_import.status; END IF;
  IF v_import.integrity_ok IS FALSE THEN
    RAISE EXCEPTION 'Saldo statement tidak menutup, import tidak boleh dicatat';
  END IF;

  FOR v_finding IN SELECT value FROM jsonb_array_elements(v_import.app_findings) LOOP
    IF COALESCE((v_finding->>'selected')::boolean, false) THEN
      IF public.delete_manual_transaction((v_finding->>'transactionId')::uuid) THEN
        v_deleted := v_deleted + 1;
      END IF;
    END IF;
  END LOOP;

  FOR v_line IN
    SELECT * FROM public.statement_lines
    WHERE import_id = p_import AND selected AND decision IN ('new', 'other_account')
    ORDER BY line_no
  LOOP
    v_account := COALESCE(v_line.target_account_id, v_import.account_id);

    IF v_line.decision = 'other_account' THEN
      SELECT * INTO v_old FROM public.transactions
      WHERE id = v_line.matched_transaction_id AND NOT COALESCE(is_deleted, false);
      IF NOT FOUND THEN RAISE EXCEPTION 'Transaksi untuk baris % tidak ditemukan', v_line.line_no; END IF;
      PERFORM public.update_manual_transaction(
        v_old.id, v_old.type, v_old.amount, v_account, v_old.to_account_id, v_old.to_amount,
        v_old.category_id, v_old.description, v_old.merchant, v_old.transaction_date
      );
      UPDATE public.transactions SET statement_line_id = v_line.id WHERE id = v_old.id;
      UPDATE public.statement_lines SET committed_transaction_id = v_old.id WHERE id = v_line.id;
      v_moved := v_moved + 1;
      CONTINUE;
    END IF;

    v_type := CASE WHEN v_line.direction = 'credit' THEN 'income' ELSE 'expense' END;
    UPDATE public.accounts
    SET balance = balance + (CASE WHEN v_type = 'income' THEN v_line.amount ELSE -v_line.amount END),
        updated_at = now()
    WHERE id = v_account AND user_id = v_import.user_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Akun tidak ditemukan: %', v_account; END IF;

    INSERT INTO public.transactions (
      type, amount, account_id, category_id, description, source, transaction_date,
      user_id, statement_line_id
    ) VALUES (
      v_type, v_line.amount, v_account, v_line.category_id,
      COALESCE(NULLIF(v_line.counterparty, ''), v_line.description_raw),
      'statement_import',
      (v_line.occurred_on + COALESCE(v_line.occurred_time, time '12:00')) AT TIME ZONE 'Asia/Jakarta',
      v_import.user_id, v_line.id
    ) RETURNING id INTO v_tx_id;

    UPDATE public.statement_lines SET committed_transaction_id = v_tx_id WHERE id = v_line.id;
    v_inserted := v_inserted + 1;
  END LOOP;

  UPDATE public.statement_imports SET status = 'committed', committed_at = now() WHERE id = p_import;

  RETURN jsonb_build_object('inserted', v_inserted, 'moved', v_moved, 'deleted', v_deleted);
END; $function$;

REVOKE EXECUTE ON FUNCTION public.commit_statement_import(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.commit_statement_import(uuid) TO authenticated, service_role;

COMMIT;
