BEGIN;

DROP POLICY own_rows ON public.receipts;
DROP POLICY own_rows ON public.receipt_lines;
DROP POLICY own_rows ON public.receipt_files;

CREATE POLICY own_rows ON public.receipts FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (
    user_id = auth.uid()
    AND (transaction_id IS NULL OR EXISTS (
      SELECT 1 FROM public.transactions t WHERE t.id = transaction_id AND t.user_id = auth.uid()
    ))
  );
CREATE POLICY own_rows ON public.receipt_lines FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.receipts r WHERE r.id = receipt_id AND r.user_id = auth.uid())
  );
CREATE POLICY own_rows ON public.receipt_files FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.receipts r WHERE r.id = receipt_id AND r.user_id = auth.uid())
  );

UPDATE storage.buckets
SET file_size_limit = 10485760,
    allowed_mime_types = '{image/png,image/jpeg,image/webp,application/pdf}'
WHERE id = 'receipts';

CREATE OR REPLACE FUNCTION public.save_receipt(p_receipt uuid, p_transaction uuid, p_new jsonb, p_lines jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path = public
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_tx public.transactions%ROWTYPE;
  v_tx_id uuid := p_transaction;
  v_receipt_id uuid := p_receipt;
  v_line jsonb;
  v_no integer := 0;
BEGIN
  IF (p_transaction IS NULL) = (p_new IS NULL) THEN
    RAISE EXCEPTION 'Isi tepat satu: transaksi yang ada atau transaksi baru';
  END IF;
  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'Rincian kosong';
  END IF;

  IF v_receipt_id IS NOT NULL THEN
    PERFORM 1 FROM public.receipts WHERE id = v_receipt_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Struk tidak ditemukan: %', v_receipt_id; END IF;
  END IF;

  IF p_new IS NOT NULL THEN
    IF NULLIF(p_new->>'account_id', '') IS NULL THEN
      RAISE EXCEPTION 'Akun wajib diisi';
    END IF;
    IF COALESCE((p_new->>'amount')::numeric, 0) <= 0 THEN
      RAISE EXCEPTION 'Nominal harus lebih dari 0';
    END IF;
    IF NULLIF(p_new->>'category_id', '') IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.categories
      WHERE id = (p_new->>'category_id')::uuid AND user_id = v_uid AND type IN ('expense', 'both')
    ) THEN
      RAISE EXCEPTION 'Kategori transaksi tidak ditemukan';
    END IF;
    v_tx_id := public.record_manual_entry(
      (p_new->>'account_id')::uuid, 'expense', (p_new->>'amount')::numeric,
      NULLIF(p_new->>'category_id', '')::uuid, NULLIF(p_new->>'description', ''), NULLIF(p_new->>'merchant', ''),
      COALESCE((p_new->>'transaction_date')::timestamptz, now()), NULL
    );
    UPDATE public.transactions SET source = 'receipt' WHERE id = v_tx_id;
  END IF;

  SELECT * INTO v_tx FROM public.transactions WHERE id = v_tx_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transaksi tidak ditemukan: %', v_tx_id; END IF;
  IF v_tx.type <> 'expense' OR COALESCE(v_tx.is_deleted, false) OR COALESCE(v_tx.is_adjustment, false) THEN
    RAISE EXCEPTION 'Rincian cuma untuk pengeluaran yang aktif';
  END IF;
  IF EXISTS (SELECT 1 FROM public.receipts WHERE transaction_id = v_tx_id AND id IS DISTINCT FROM v_receipt_id) THEN
    RAISE EXCEPTION 'Transaksi ini sudah punya rincian';
  END IF;

  IF v_receipt_id IS NULL THEN
    INSERT INTO public.receipts (transaction_id, status, extractor, user_id)
    VALUES (v_tx_id, 'saved', 'manual', v_uid)
    RETURNING id INTO v_receipt_id;
  ELSE
    UPDATE public.receipts SET transaction_id = v_tx_id, status = 'saved', updated_at = now() WHERE id = v_receipt_id;
  END IF;

  DELETE FROM public.receipt_lines WHERE receipt_id = v_receipt_id;
  FOR v_line IN SELECT value FROM jsonb_array_elements(p_lines) LOOP
    v_no := v_no + 1;
    IF NULLIF(v_line->>'category_id', '') IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.categories WHERE id = (v_line->>'category_id')::uuid AND user_id = v_uid AND type IN ('expense', 'both')
    ) THEN
      RAISE EXCEPTION 'Kategori tidak ditemukan di baris %', v_no;
    END IF;
    INSERT INTO public.receipt_lines (receipt_id, user_id, line_no, kind, name, qty, amount, category_id)
    VALUES (
      v_receipt_id, v_uid, v_no, v_line->>'kind',
      COALESCE(NULLIF(trim(v_line->>'name'), ''), v_line->>'kind'),
      COALESCE((v_line->>'qty')::numeric, 1),
      (v_line->>'amount')::numeric,
      NULLIF(v_line->>'category_id', '')::uuid
    );
  END LOOP;

  RETURN jsonb_build_object('receipt_id', v_receipt_id, 'transaction_id', v_tx_id);
END; $function$;

COMMIT;
