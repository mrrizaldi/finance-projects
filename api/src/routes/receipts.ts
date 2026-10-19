import type { FastifyInstance } from 'fastify';
import { createHash } from 'node:crypto';
import { createServiceClient, requireUser } from '../lib/supabase.js';
import { fileKind, mimeTypeOf, type TransactionRow } from '../lib/statement-import.js';
import { ScreenshotExtractionError } from '../lib/screenshot-extractor.js';
import {
  extractReceipt,
  LINE_KINDS,
  rankCandidates,
  receiptTotal,
  totalMatches,
  type NormalizedReceipt,
} from '../lib/receipt.js';
import { jakartaDayEnd, jakartaDayStart, shiftCalendarDate, todayInJakarta } from '../lib/utils.js';

const BYTES_PER_MEGABYTE = 1024 * 1024;
const MAX_UPLOAD_BYTES = 10 * BYTES_PER_MEGABYTE;
const UPLOAD_BODY_LIMIT = Math.ceil((MAX_UPLOAD_BYTES * 4) / 3) + BYTES_PER_MEGABYTE;
const MAX_IMAGES = 5;
const DRAFT_TTL_DAYS = 7;
const MS_PER_DAY = 86_400_000;
const PURGE_BATCH = 20;
const SIGNED_URL_SECONDS = 3600;
const CANDIDATE_DAY_GAP = 1;
const CHECK_VIOLATION = '23514';
const STORAGE_BUCKET = 'receipts';
const TRANSACTION_COLUMNS =
  'id, type, amount, to_amount, account_id, to_account_id, transaction_date, description, merchant, is_adjustment';
const EXTENSIONS: Record<string, string> = {
  'application/pdf': 'pdf', 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp',
};

interface UploadFile {
  name?: string;
  content_base64?: string;
}

const sha256 = (data: Buffer) => createHash('sha256').update(data).digest('hex');

async function removeReceipt(supabase: any, service: ReturnType<typeof createServiceClient>, id: string) {
  const { data: files } = await service.from('receipt_files').select('path').eq('receipt_id', id);
  if (files?.length) await service.storage.from(STORAGE_BUCKET).remove(files.map((f: { path: string }) => f.path));
  await supabase.from('receipts').delete().eq('id', id);
}

async function purgeStaleDrafts(service: ReturnType<typeof createServiceClient>) {
  const { data: stale } = await service
    .from('receipts')
    .select('id')
    .eq('status', 'draft')
    .lt('created_at', new Date(Date.now() - DRAFT_TTL_DAYS * MS_PER_DAY).toISOString())
    .limit(PURGE_BATCH);
  for (const row of stale ?? []) await removeReceipt(service, service, row.id);
}

async function findCandidates(supabase: any, extraction: NormalizedReceipt) {
  const amount = extraction.printedTotal ?? receiptTotal(extraction.lines);
  if (amount <= 0) return [];
  const date = extraction.purchasedDate ?? todayInJakarta();
  const { data: rows, error } = await supabase
    .from('transactions')
    .select(TRANSACTION_COLUMNS)
    .eq('is_deleted', false)
    .eq('type', 'expense')
    .gte('transaction_date', jakartaDayStart(shiftCalendarDate(date, -CANDIDATE_DAY_GAP)))
    .lte('transaction_date', jakartaDayEnd(shiftCalendarDate(date, CANDIDATE_DAY_GAP)));
  if (error) throw new Error(`Gagal baca transaksi: ${error.message}`);
  const ids = (rows as TransactionRow[]).map((r) => r.id);
  const { data: taken } = ids.length
    ? await supabase.from('receipts').select('transaction_id').in('transaction_id', ids)
    : { data: [] };
  const takenIds = new Set((taken ?? []).map((t: { transaction_id: string }) => t.transaction_id));
  const ranked = rankCandidates(
    { date, time: extraction.purchasedTime, amount, merchant: extraction.merchant },
    (rows as TransactionRow[]).filter((r) => !takenIds.has(r.id)),
  );
  if (ranked.length === 0) return [];
  const { data: details } = await supabase
    .from('v_transactions')
    .select('id, amount, transaction_date, description, merchant, account_name, category_id, category_name, source')
    .in('id', ranked.map((r) => r.id));
  const byId = new Map((details ?? []).map((d: { id: string }) => [d.id, d]));
  return ranked.flatMap((r) => (byId.has(r.id) ? [{ ...(byId.get(r.id) as object), score: r.score }] : []));
}

function validLines(lines: unknown): boolean {
  return Array.isArray(lines) && lines.length > 0 && lines.every((l) =>
    l && typeof l === 'object'
    && LINE_KINDS.includes((l as { kind: never }).kind)
    && typeof (l as { name: unknown }).name === 'string'
    && Number.isFinite((l as { amount: unknown }).amount)
    && ((l as { category_id?: unknown }).category_id == null || typeof (l as { category_id: unknown }).category_id === 'string'));
}

export default async function plugin(app: FastifyInstance) {
  app.post('/api/receipts', { bodyLimit: UPLOAD_BODY_LIMIT }, async (request, reply) => {
    const { supabase, user, unauthorized } = await requireUser(request);
    if (unauthorized || !supabase) return reply.code(401).send({ error: 'Unauthorized' });

    const files = (request.body as { files?: UploadFile[] } | undefined)?.files;
    if (!Array.isArray(files) || files.length === 0 || files.length > MAX_IMAGES) {
      return reply.code(400).send({ error: `1-${MAX_IMAGES} file wajib diisi` });
    }
    if (files.some((f) => typeof f?.content_base64 !== 'string' || f.content_base64.length === 0)) {
      return reply.code(400).send({ error: 'content_base64 kosong' });
    }
    const decoded = files.map((f) => Buffer.from(f.content_base64!, 'base64'));
    const buffers = [...new Map(decoded.map((b) => [sha256(b), b])).values()];
    if (buffers.reduce((sum, b) => sum + b.length, 0) > MAX_UPLOAD_BYTES) {
      return reply.code(413).send({ error: 'Total file lebih dari 10MB' });
    }
    const kinds = new Set(buffers.map(fileKind));
    if (kinds.has(null)) return reply.code(415).send({ error: 'Hanya PDF atau gambar (PNG/JPEG/WEBP)' });
    if (kinds.has('pdf') && buffers.length > 1) return reply.code(400).send({ error: 'Satu struk PDF per upload' });

    const service = createServiceClient();
    const shas = buffers.map(sha256);
    const { data: known } = await supabase.from('receipt_files').select('receipt_id').in('sha256', shas);
    for (const receiptId of new Set((known ?? []).map((k: { receipt_id: string }) => k.receipt_id))) {
      const { data: existing } = await supabase.from('receipts').select('id, status, transaction_id').eq('id', receiptId).maybeSingle();
      if (existing?.status === 'saved') {
        return reply.code(409).send({ error: 'Struk ini sudah pernah dirinci', receipt_id: existing.id, transaction_id: existing.transaction_id });
      }
      if (existing) await removeReceipt(supabase, service, existing.id);
    }

    const { data: categories } = await supabase
      .from('categories').select('id, name').in('type', ['expense', 'both']).eq('is_active', true);
    let extraction: NormalizedReceipt & { extractor: string };
    let extractionError: string | null = null;
    try {
      extraction = await extractReceipt(
        buffers.map((data) => ({ data, mimeType: mimeTypeOf(data) })),
        todayInJakarta(),
        categories ?? [],
      );
    } catch (error) {
      if (!(error instanceof ScreenshotExtractionError)) throw error;
      extractionError = error.message;
      extraction = { merchant: null, purchasedDate: null, purchasedTime: null, printedTotal: null, lines: [], extractor: 'manual' };
    }

    const purchasedAt = extraction.purchasedDate
      ? `${extraction.purchasedDate}T${extraction.purchasedTime ?? '12:00'}:00+07:00`
      : null;
    const { data: receipt, error: insertError } = await supabase
      .from('receipts')
      .insert({
        status: 'draft', merchant: extraction.merchant, purchased_at: purchasedAt,
        printed_total: extraction.printedTotal, extractor: extraction.extractor, user_id: user.id,
      })
      .select('*')
      .single();
    if (insertError) throw new Error(`Gagal simpan struk: ${insertError.message}`);

    const stored = await Promise.all(buffers.map(async (buffer, i) => {
      const mime = mimeTypeOf(buffer);
      const path = `${user.id}/${receipt.id}/${i + 1}.${EXTENSIONS[mime]}`;
      const { error } = await service.storage.from(STORAGE_BUCKET).upload(path, buffer, { contentType: mime });
      return error ? null : { receipt_id: receipt.id, user_id: user.id, path, sha256: shas[i], mime };
    }));
    const fileRows = stored.filter((row) => row !== null);
    if (fileRows.length) {
      const { error: filesError } = await supabase.from('receipt_files').insert(fileRows);
      if (filesError) throw new Error(`Gagal simpan file struk: ${filesError.message}`);
    }
    await purgeStaleDrafts(service);

    return reply.code(201).send({
      receipt,
      lines: extraction.lines,
      totalOk: totalMatches(extraction.lines, extraction.printedTotal),
      candidates: await findCandidates(supabase, extraction),
      extractionError,
    });
  });

  app.get('/api/receipts/by-transaction/:transactionId', async (request, reply) => {
    const { supabase, unauthorized } = await requireUser(request);
    if (unauthorized || !supabase) return reply.code(401).send({ error: 'Unauthorized' });
    const { transactionId } = request.params as { transactionId: string };
    const { data: receipt } = await supabase
      .from('receipts').select('*').eq('transaction_id', transactionId).eq('status', 'saved').maybeSingle();
    if (!receipt) return reply.code(404).send({ error: 'Belum ada rincian' });
    const { data: lines } = await supabase
      .from('receipt_lines').select('kind, name, qty, amount, category_id').eq('receipt_id', receipt.id).order('line_no');
    const { data: files } = await supabase
      .from('receipt_files').select('path, mime').eq('receipt_id', receipt.id).order('created_at');
    const { data: signed } = files?.length
      ? await createServiceClient().storage.from(STORAGE_BUCKET).createSignedUrls(files.map((f: { path: string }) => f.path), SIGNED_URL_SECONDS)
      : { data: [] };
    return {
      receipt,
      lines: (lines ?? []).map((l: { amount: unknown; qty: unknown }) => ({ ...l, amount: Number(l.amount), qty: Number(l.qty) })),
      files: (files ?? []).flatMap((f: { mime: string }, i: number) =>
        signed?.[i]?.signedUrl ? [{ url: signed[i].signedUrl, mime: f.mime }] : []),
    };
  });

  app.post('/api/receipts/save', async (request, reply) => {
    const { supabase, unauthorized } = await requireUser(request);
    if (unauthorized || !supabase) return reply.code(401).send({ error: 'Unauthorized' });
    const body = (request.body ?? {}) as {
      receipt_id?: string | null; transaction_id?: string | null; new_transaction?: Record<string, unknown> | null; lines?: unknown;
    };
    if (!validLines(body.lines)) return reply.code(400).send({ error: 'lines tidak valid' });
    if (!body.transaction_id === !body.new_transaction) {
      return reply.code(400).send({ error: 'Isi tepat satu: transaction_id atau new_transaction' });
    }
    const { data, error } = await supabase.rpc('save_receipt', {
      p_receipt: body.receipt_id ?? null,
      p_transaction: body.transaction_id ?? null,
      p_new: body.new_transaction ?? null,
      p_lines: body.lines,
    });
    if (error) {
      if (error.code === CHECK_VIOLATION || /check constraint/i.test(error.message)) {
        return reply.code(400).send({ error: 'Nominal item harus lebih dari 0, diskon harus negatif' });
      }
      if (/wajib|harus/.test(error.message)) return reply.code(400).send({ error: error.message });
      const status = /tidak ditemukan/.test(error.message) ? 404 : /sudah punya rincian/.test(error.message) ? 409 : 422;
      return reply.code(status).send({ error: error.message });
    }
    return { data };
  });

  app.delete('/api/receipts/:id', async (request, reply) => {
    const { supabase, unauthorized } = await requireUser(request);
    if (unauthorized || !supabase) return reply.code(401).send({ error: 'Unauthorized' });
    const { id } = request.params as { id: string };
    const { data: receipt } = await supabase.from('receipts').select('id').eq('id', id).maybeSingle();
    if (!receipt) return reply.code(404).send({ error: 'Struk tidak ditemukan' });
    await removeReceipt(supabase, createServiceClient(), id);
    return { data: { id } };
  });
}
