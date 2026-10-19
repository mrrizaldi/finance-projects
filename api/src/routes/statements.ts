import type { FastifyInstance, FastifyReply } from 'fastify';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServiceClient, requireUser } from '../lib/supabase.js';
import { parseStatementPdf, StatementParseError } from '../lib/statement-parser.js';
import { auditBalance, matchStatement, MAX_DAY_GAP, type MatchLine } from '../lib/statement-matcher.js';
import {
  balanceOnAccount,
  combinedSha256,
  fileKind,
  lineFingerprints,
  toMatchTransaction,
  type TransactionRow,
} from '../lib/statement-import.js';
import { jakartaDayEnd, jakartaDayStart, shiftCalendarDate } from '../lib/utils.js';

const BYTES_PER_MEGABYTE = 1024 * 1024;
const MAX_UPLOAD_BYTES = 20 * BYTES_PER_MEGABYTE;
const BASE64_OVERHEAD = 4 / 3;
const JSON_ENVELOPE_BYTES = BYTES_PER_MEGABYTE;
const UPLOAD_BODY_LIMIT = Math.ceil(MAX_UPLOAD_BYTES * BASE64_OVERHEAD) + JSON_ENVELOPE_BYTES;
const MAX_FILES = 10;
const FILE_RETENTION_DAYS = 90;
const MS_PER_DAY = 86_400_000;
const PURGE_BATCH = 20;
const LIST_LIMIT = 20;
const STORAGE_BUCKET = 'statements';
const TRANSACTION_TYPES = ['income', 'expense', 'transfer'];
const LINE_DECISIONS = ['match', 'probable', 'new', 'transfer_pair', 'other_account', 'skip'];
const TRANSACTION_COLUMNS =
  'id, type, amount, to_amount, account_id, to_account_id, transaction_date, description, merchant, is_adjustment';

interface UploadFile {
  name?: string;
  content_base64?: string;
}

const safeFileName = (name: string | undefined, index: number) =>
  (name ?? `file-${index + 1}`).replace(/[^A-Za-z0-9._-]+/g, '_');

async function purgeExpiredFiles(service: ReturnType<typeof createServiceClient>) {
  const { data: expired } = await service
    .from('statement_imports')
    .select('id, file_paths')
    .lt('file_expires_at', new Date().toISOString())
    .neq('file_paths', '{}')
    .limit(PURGE_BATCH);
  for (const row of expired ?? []) {
    await service.storage.from(STORAGE_BUCKET).remove(row.file_paths);
    await service.from('statement_imports').update({ file_paths: [] }).eq('id', row.id);
  }
}

async function loadImport(supabase: any, id: string) {
  const { data: imp } = await supabase.from('statement_imports').select('*').eq('id', id).maybeSingle();
  if (!imp) return null;
  const { data: lines } = await supabase
    .from('statement_lines')
    .select('*')
    .eq('import_id', id)
    .order('line_no');
  const txIds = [
    ...new Set([
      ...(lines ?? []).flatMap((l: any) => [l.matched_transaction_id, l.committed_transaction_id]),
      ...(imp.app_findings ?? []).map((f: any) => f.transactionId),
    ].filter(Boolean)),
  ];
  const { data: transactions } = txIds.length
    ? await supabase
        .from('v_transactions')
        .select('id, type, amount, to_amount, description, merchant, transaction_date, account_name, to_account_name, category_name, source')
        .in('id', txIds)
    : { data: [] };
  return { import: imp, lines: lines ?? [], transactions: transactions ?? [] };
}

function parseErrorStatus(error: StatementParseError) {
  return error.code === 'pdftotext_missing' || error.code === 'pdftotext_failed' ? 500 : 422;
}

export default async function plugin(app: FastifyInstance) {
  app.post('/api/statements', { bodyLimit: UPLOAD_BODY_LIMIT }, async (request, reply) => {
    const { supabase, user, unauthorized } = await requireUser(request);
    if (unauthorized || !supabase) return reply.code(401).send({ error: 'Unauthorized' });

    const body = request.body as { account_id?: string; files?: UploadFile[] } | undefined;
    const accountId = body?.account_id;
    const files = body?.files;
    if (!accountId || !Array.isArray(files) || files.length === 0 || files.length > MAX_FILES) {
      return reply.code(400).send({ error: `account_id dan 1-${MAX_FILES} file wajib diisi` });
    }
    if (files.some((f) => typeof f?.content_base64 !== 'string' || f.content_base64.length === 0)) {
      return reply.code(400).send({ error: 'content_base64 kosong' });
    }

    const buffers = files.map((f) => Buffer.from(f.content_base64!, 'base64'));
    if (buffers.reduce((sum, b) => sum + b.length, 0) > MAX_UPLOAD_BYTES) {
      return reply.code(413).send({ error: 'Total file lebih dari 20MB' });
    }
    const kinds = new Set(buffers.map(fileKind));
    if (kinds.has(null)) return reply.code(415).send({ error: 'Hanya PDF atau gambar (PNG/JPEG/WEBP)' });
    if (kinds.size > 1) return reply.code(400).send({ error: 'Jangan campur PDF dan gambar dalam satu upload' });
    const [kind] = kinds;
    if (kind === 'pdf' && buffers.length > 1) return reply.code(400).send({ error: 'Satu upload cuma boleh satu PDF' });
    if (kind === 'screenshot') return reply.code(422).send({ error: 'Screenshot belum didukung, kirim e-statement PDF dulu' });

    const { data: account } = await supabase.from('accounts').select('id').eq('id', accountId).maybeSingle();
    if (!account) return reply.code(404).send({ error: 'Akun tidak ditemukan' });

    const sha = combinedSha256(buffers);
    const { data: existing } = await supabase
      .from('statement_imports').select('id, status').eq('file_sha256', sha).maybeSingle();
    if (existing?.status === 'discarded') {
      await supabase.from('statement_imports').delete().eq('id', existing.id);
    } else if (existing) {
      return reply.code(409).send({ error: 'File ini sudah pernah diimpor', import_id: existing.id, status: existing.status });
    }

    const workDir = await mkdtemp(join(tmpdir(), 'statement-'));
    let parsed;
    try {
      const pdfPath = join(workDir, 'statement.pdf');
      await writeFile(pdfPath, buffers[0]);
      parsed = await parseStatementPdf(pdfPath);
    } catch (error) {
      if (error instanceof StatementParseError) {
        return reply.code(parseErrorStatus(error)).send({ error: error.message, code: error.code });
      }
      throw error;
    } finally {
      await rm(workDir, { recursive: true, force: true });
    }

    const firstDate = parsed.rows[0].date;
    const lastDate = parsed.rows[parsed.rows.length - 1].date;
    const periodStart = parsed.periodStart ?? firstDate;
    const periodEnd = parsed.periodEnd ?? lastDate;

    const { data: txRows, error: txError } = await supabase
      .from('transactions')
      .select(TRANSACTION_COLUMNS)
      .eq('is_deleted', false)
      .in('type', TRANSACTION_TYPES)
      .gte('transaction_date', jakartaDayStart(shiftCalendarDate(periodStart, -MAX_DAY_GAP)))
      .lte('transaction_date', jakartaDayEnd(shiftCalendarDate(periodEnd, MAX_DAY_GAP)));
    if (txError) throw new Error(`Gagal baca transaksi: ${txError.message}`);

    const fingerprints = lineFingerprints(parsed.rows);
    const lineIds = parsed.rows.map(() => crypto.randomUUID());
    const matchLines: MatchLine[] = parsed.rows.map((row, i) => ({
      id: lineIds[i], date: row.date, time: row.time, amount: row.amount, direction: row.direction, description: row.description,
    }));
    const result = matchStatement({
      accountId, periodStart, periodEnd, lines: matchLines,
      transactions: (txRows as TransactionRow[]).map(toMatchTransaction),
    });

    const { data: lastTx } = await supabase
      .from('transactions')
      .select('account_id, balance_after, to_balance_after')
      .or(`account_id.eq.${accountId},to_account_id.eq.${accountId}`)
      .eq('is_deleted', false)
      .lte('transaction_date', jakartaDayEnd(periodEnd))
      .order('transaction_date', { ascending: false })
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle();
    const appClosing = balanceOnAccount(accountId, lastTx);
    const audit = parsed.closingBalance !== null && appClosing !== null
      ? auditBalance({ statementClosing: parsed.closingBalance, appClosing, lines: matchLines, result })
      : null;

    const { data: imp, error: impError } = await supabase
      .from('statement_imports')
      .insert({
        account_id: accountId, kind, bank: parsed.bank, period_start: periodStart, period_end: periodEnd,
        opening_balance: parsed.openingBalance, closing_balance: parsed.closingBalance, file_sha256: sha,
        extractor: `parser:${parsed.bank.toLowerCase()}@1`, integrity_ok: parsed.integrityOk,
        app_findings: result.appFindings, audit, user_id: user.id,
      })
      .select('id')
      .single();
    if (impError) throw new Error(`Gagal simpan import: ${impError.message}`);

    const decisionByLine = new Map(result.lines.map((r) => [r.lineId, r]));
    const { error: linesError } = await supabase.from('statement_lines').insert(
      parsed.rows.map((row, i) => {
        const decision = decisionByLine.get(lineIds[i])!;
        return {
          id: lineIds[i], import_id: imp.id, user_id: user.id, line_no: i + 1, occurred_on: row.date,
          occurred_time: row.time, amount: row.amount, direction: row.direction, description_raw: row.description,
          running_balance: row.balanceAfter, fingerprint: fingerprints[i], decision: decision.decision,
          selected: decision.selected, matched_transaction_id: decision.matchedTransactionId,
        };
      }),
    );
    if (linesError) {
      await supabase.from('statement_imports').delete().eq('id', imp.id);
      throw new Error(`Gagal simpan baris: ${linesError.message}`);
    }

    const service = createServiceClient();
    const paths = files.map((f, i) => `${user.id}/${imp.id}/${safeFileName(f.name, i)}`);
    const uploads = await Promise.all(
      paths.map((path, i) => service.storage.from(STORAGE_BUCKET).upload(path, buffers[i], { contentType: 'application/pdf' })),
    );
    const stored = paths.filter((_, i) => !uploads[i].error);
    await supabase
      .from('statement_imports')
      .update({ file_paths: stored, file_expires_at: new Date(Date.now() + FILE_RETENTION_DAYS * MS_PER_DAY).toISOString() })
      .eq('id', imp.id);
    await purgeExpiredFiles(service);

    return reply.code(201).send(await loadImport(supabase, imp.id));
  });

  app.get('/api/statements', async (request, reply) => {
    const { supabase, unauthorized } = await requireUser(request);
    if (unauthorized || !supabase) return reply.code(401).send({ error: 'Unauthorized' });
    const { account_id: accountId } = request.query as { account_id?: string };
    let query = supabase
      .from('statement_imports')
      .select('id, account_id, kind, bank, period_start, period_end, status, integrity_ok, created_at, committed_at')
      .order('created_at', { ascending: false })
      .limit(LIST_LIMIT);
    if (accountId) query = query.eq('account_id', accountId);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return { data };
  });

  app.get('/api/statements/:id', async (request, reply) => {
    const { supabase, unauthorized } = await requireUser(request);
    if (unauthorized || !supabase) return reply.code(401).send({ error: 'Unauthorized' });
    const { id } = request.params as { id: string };
    const view = await loadImport(supabase, id);
    if (!view) return reply.code(404).send({ error: 'Import tidak ditemukan' });
    return view;
  });

  async function requireReviewImport(supabase: any, id: string, reply: FastifyReply) {
    const { data: imp } = await supabase.from('statement_imports').select('id, status, app_findings').eq('id', id).maybeSingle();
    if (!imp) {
      reply.code(404).send({ error: 'Import tidak ditemukan' });
      return null;
    }
    if (imp.status !== 'review') {
      reply.code(409).send({ error: `Import sudah ${imp.status}` });
      return null;
    }
    return imp;
  }

  app.patch('/api/statements/:id/lines/:lineId', async (request, reply) => {
    const { supabase, unauthorized } = await requireUser(request);
    if (unauthorized || !supabase) return reply.code(401).send({ error: 'Unauthorized' });
    const { id, lineId } = request.params as { id: string; lineId: string };
    const body = (request.body ?? {}) as Record<string, unknown>;

    if (!(await requireReviewImport(supabase, id, reply))) return reply;
    const { data: line } = await supabase
      .from('statement_lines')
      .select('id, selected, decision, category_id, target_account_id, user_correction')
      .eq('id', lineId).eq('import_id', id).maybeSingle();
    if (!line) return reply.code(404).send({ error: 'Baris tidak ditemukan' });

    const changes: Record<string, unknown> = {};
    if (body.selected !== undefined) {
      if (typeof body.selected !== 'boolean') return reply.code(400).send({ error: 'selected harus boolean' });
      changes.selected = body.selected;
    }
    if (body.decision !== undefined) {
      if (!LINE_DECISIONS.includes(body.decision as string)) return reply.code(400).send({ error: 'decision tidak valid' });
      changes.decision = body.decision;
    }
    for (const key of ['category_id', 'target_account_id']) {
      if (body[key] !== undefined) {
        if (body[key] !== null && typeof body[key] !== 'string') return reply.code(400).send({ error: `${key} tidak valid` });
        changes[key] = body[key];
      }
    }
    if (Object.keys(changes).length === 0) return reply.code(400).send({ error: 'Tidak ada perubahan' });

    const correction = { ...(line.user_correction ?? {}) } as Record<string, unknown>;
    for (const [key, value] of Object.entries(changes)) {
      const previous = correction[key] as { from: unknown } | undefined;
      correction[key] = { from: previous ? previous.from : (line as Record<string, unknown>)[key], to: value };
    }

    const { data: updated, error } = await supabase
      .from('statement_lines')
      .update({ ...changes, decided_by: 'user', user_correction: correction })
      .eq('id', lineId)
      .select('*')
      .single();
    if (error) return reply.code(400).send({ error: error.message });
    return { data: updated };
  });

  app.patch('/api/statements/:id/findings/:transactionId', async (request, reply) => {
    const { supabase, unauthorized } = await requireUser(request);
    if (unauthorized || !supabase) return reply.code(401).send({ error: 'Unauthorized' });
    const { id, transactionId } = request.params as { id: string; transactionId: string };
    const { selected } = (request.body ?? {}) as { selected?: unknown };
    if (typeof selected !== 'boolean') return reply.code(400).send({ error: 'selected harus boolean' });

    const imp = await requireReviewImport(supabase, id, reply);
    if (!imp) return reply;
    const findings = (imp.app_findings ?? []) as Array<{ transactionId: string; selected: boolean }>;
    if (!findings.some((f) => f.transactionId === transactionId)) {
      return reply.code(404).send({ error: 'Temuan tidak ditemukan' });
    }
    const next = findings.map((f) => (f.transactionId === transactionId ? { ...f, selected } : f));
    const { error } = await supabase.from('statement_imports').update({ app_findings: next }).eq('id', id);
    if (error) return reply.code(400).send({ error: error.message });
    return { data: next };
  });

  app.post('/api/statements/:id/commit', async (request, reply) => {
    const { supabase, unauthorized } = await requireUser(request);
    if (unauthorized || !supabase) return reply.code(401).send({ error: 'Unauthorized' });
    const { id } = request.params as { id: string };
    const { data, error } = await supabase.rpc('commit_statement_import', { p_import: id });
    if (error) {
      const status = /tidak ditemukan/.test(error.message) ? 404 : /berstatus/.test(error.message) ? 409 : 422;
      return reply.code(status).send({ error: error.message });
    }
    return { data };
  });

  app.post('/api/statements/:id/discard', async (request, reply) => {
    const { supabase, unauthorized } = await requireUser(request);
    if (unauthorized || !supabase) return reply.code(401).send({ error: 'Unauthorized' });
    const { id } = request.params as { id: string };
    if (!(await requireReviewImport(supabase, id, reply))) return reply;
    const { error } = await supabase.from('statement_imports').update({ status: 'discarded' }).eq('id', id);
    if (error) return reply.code(400).send({ error: error.message });
    return { data: { id, status: 'discarded' } };
  });
}
