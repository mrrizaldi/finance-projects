import { INTEGRITY_TOLERANCE_RUPIAH, roundCents, type StatementDirection, type StatementRow } from './statement-parser.js';

export interface ScreenshotRow extends StatementRow {
  counterparty: string | null;
  confidence: number;
}

export interface ScreenshotImage {
  data: Buffer;
  mimeType: string;
}

export interface ScreenshotExtraction {
  source: string;
  modelsUsed: string[];
  rows: ScreenshotRow[];
  droppedRows: number;
  openingBalance: number | null;
  closingBalance: number | null;
  integrityOk: boolean | null;
}

export class ScreenshotExtractionError extends Error {
  constructor(public code: 'not_configured' | 'model_failed' | 'empty', message: string) {
    super(message);
  }
}

export const DEFAULT_SCREENSHOT_MODELS = ['gemini-3.8-flash', 'gemini-2.5-flash', 'gemini-3.5-flash-lite'];
const RETRYABLE_STATUS = new Set([404, 429, 500, 503]);
export const PROMPT_VERSION = 2;
const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';
const GEMINI_TIMEOUT_MS = 45_000;
export const GEMINI_TOTAL_BUDGET_MS = 85_000;
const MIN_ATTEMPT_MS = 5_000;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const CLOCK_TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const UNKNOWN_SOURCE = 'UNKNOWN';

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    source: { type: 'STRING' },
    opening_balance: { type: 'NUMBER', nullable: true },
    closing_balance: { type: 'NUMBER', nullable: true },
    rows: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          date: { type: 'STRING' },
          time: { type: 'STRING', nullable: true },
          description: { type: 'STRING' },
          counterparty: { type: 'STRING', nullable: true },
          amount: { type: 'NUMBER' },
          direction: { type: 'STRING', enum: ['debit', 'credit'] },
          confidence: { type: 'NUMBER' },
        },
        required: ['date', 'description', 'amount', 'direction', 'confidence'],
      },
    },
  },
  required: ['source', 'rows'],
};

export function buildPrompt(referenceDate: string): string {
  return [
    'Kamu membaca screenshot riwayat transaksi atau e-statement PDF (bisa beberapa halaman) dari bank atau e-wallet Indonesia.',
    'Kembalikan setiap transaksi yang terlihat utuh sebagai satu baris JSON sesuai skema.',
    '',
    'Aturan:',
    '- source: nama bank/e-wallet yang terlihat (BCA, BSI, JAGO, DANA, GOPAY, SHOPEEPAY, OVO, dst). Huruf kapital.',
    '- amount: nominal transaksi dalam rupiah sebagai angka biasa. "IDR 15,000.00" dan "Rp15.000" sama-sama 15000.',
    '- Angka di dalam teks deskripsi (nomor referensi, kode seperti 00000.00, nomor HP, nomor rekening) BUKAN nominal.',
    '- direction: "debit" untuk uang keluar (merah, tanda minus, DB, Bayar, Kirim, Transfer ke, Top up ke e-wallet lain),',
    '  "credit" untuk uang masuk (biru/hijau, tanda plus, CR, Terima, Dana masuk, Cashback, Refund).',
    `- date: format YYYY-MM-DD. Kalau tahun tidak terlihat, pakai tahun yang membuat tanggalnya paling dekat dan tidak melewati ${referenceDate}.`,
    '  "Hari ini" dan "Kemarin" dihitung dari tanggal itu.',
    '- time: HH:mm 24 jam kalau terlihat, null kalau tidak.',
    '- description: teks utama transaksi apa adanya, satu baris.',
    '- counterparty: nama merchant/penerima/pengirim yang paling bermakna (mis. "PENS MART", "FABIOLA TASYA NATA"), null kalau tidak ada.',
    '- Lewati: transaksi gagal/dibatalkan/pending, baris saldo, judul bulan, iklan, baris yang terpotong sampai nominalnya tidak terbaca.',
    '- confidence: 0 sampai 1. Di bawah 0.8 kalau ada digit nominal, tanggal, atau arah yang kamu tidak yakin.',
    '- opening_balance dan closing_balance: saldo awal dan saldo akhir periode kalau dokumen mencantumkannya, sebagai angka rupiah; null kalau tidak ada. Jangan dihitung sendiri.',
    '- Ringkasan bulanan tanpa rincian per transaksi bukan baris transaksi.',
    '- Jangan mengarang baris. Kalau tidak ada transaksi, kembalikan rows kosong.',
  ].join('\n');
}

interface RawRow {
  date?: unknown;
  time?: unknown;
  description?: unknown;
  counterparty?: unknown;
  amount?: unknown;
  direction?: unknown;
  confidence?: unknown;
}

function isValidCalendarDate(text: string) {
  if (!ISO_DATE.test(text)) return false;
  const parsed = new Date(`${text}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(text);
}

export function normalizeRawRows(raw: RawRow[]): { rows: ScreenshotRow[]; dropped: number } {
  const rows: ScreenshotRow[] = [];
  for (const r of raw) {
    const amount = Number(r.amount);
    const direction = r.direction === 'credit' || r.direction === 'debit' ? (r.direction as StatementDirection) : null;
    if (typeof r.date !== 'string' || !isValidCalendarDate(r.date) || !Number.isFinite(amount) || amount <= 0 || !direction) {
      continue;
    }
    const confidence = Number(r.confidence);
    rows.push({
      date: r.date,
      time: typeof r.time === 'string' && CLOCK_TIME.test(r.time) ? r.time : null,
      description: typeof r.description === 'string' ? r.description.replace(/\s+/g, ' ').trim() : '',
      counterparty: typeof r.counterparty === 'string' && r.counterparty.trim() ? r.counterparty.trim() : null,
      amount,
      direction,
      balanceAfter: null,
      ref: null,
      confidence: Number.isFinite(confidence) ? Math.min(1, Math.max(0, confidence)) : 0,
    });
  }
  return { rows, dropped: raw.length - rows.length };
}

const mergeKey = (row: ScreenshotRow) => [row.date, row.time ?? '', row.amount.toFixed(2), row.direction].join('|');

export function mergeScreenshotRows(perImage: ScreenshotRow[][]): ScreenshotRow[] {
  const best = new Map<string, ScreenshotRow[]>();
  for (const rows of perImage) {
    const groups = new Map<string, ScreenshotRow[]>();
    for (const row of rows) {
      const key = mergeKey(row);
      groups.set(key, [...(groups.get(key) ?? []), row]);
    }
    for (const [key, group] of groups) {
      if (group.length > (best.get(key)?.length ?? 0)) best.set(key, group);
    }
  }
  return [...best.values()]
    .flat()
    .sort((a, b) => b.date.localeCompare(a.date) || (b.time ?? '').localeCompare(a.time ?? ''));
}

type GeminiAnswer = { source?: unknown; rows?: RawRow[]; opening_balance?: unknown; closing_balance?: unknown };

class RetryableModelError extends Error {}

export function configuredModels(): string[] {
  const fromEnv = (process.env.GEMINI_STATEMENT_MODEL ?? '').split(',').map((m) => m.trim()).filter(Boolean);
  return fromEnv.length > 0 ? fromEnv : DEFAULT_SCREENSHOT_MODELS;
}

async function callModel(
  image: ScreenshotImage,
  referenceDate: string,
  apiKey: string,
  model: string,
  timeoutMs: number,
): Promise<GeminiAnswer> {
  const res = await fetch(`${GEMINI_ENDPOINT}/${model}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    signal: AbortSignal.timeout(timeoutMs),
    body: JSON.stringify({
      contents: [{
        role: 'user',
        parts: [
          { text: buildPrompt(referenceDate) },
          { inline_data: { mime_type: image.mimeType, data: image.data.toString('base64') } },
        ],
      }],
      generationConfig: { responseMimeType: 'application/json', responseSchema: RESPONSE_SCHEMA, temperature: 0 },
    }),
  }).catch((error: Error) => {
    if (error.name === 'TimeoutError' || error.name === 'AbortError') throw new RetryableModelError(`${model} timeout`);
    throw error;
  });
  if (!res.ok) {
    const message = `${model} ${res.status}: ${(await res.text()).slice(0, 200)}`;
    if (RETRYABLE_STATUS.has(res.status)) throw new RetryableModelError(message);
    throw new ScreenshotExtractionError('model_failed', `Gemini ${message}`);
  }
  const body = await res.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  const text = body.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
  try {
    return JSON.parse(text) as GeminiAnswer;
  } catch {
    throw new ScreenshotExtractionError('model_failed', 'Jawaban Gemini bukan JSON yang valid');
  }
}

async function extractOne(image: ScreenshotImage, referenceDate: string, apiKey: string, models: string[], deadline: number) {
  const failures: string[] = [];
  for (const model of models) {
    const remaining = deadline - Date.now();
    if (remaining < MIN_ATTEMPT_MS) {
      failures.push(`${model} dilewati, waktu habis`);
      break;
    }
    try {
      return { model, answer: await callModel(image, referenceDate, apiKey, model, Math.min(GEMINI_TIMEOUT_MS, remaining)) };
    } catch (error) {
      if (!(error instanceof RetryableModelError)) throw error;
      failures.push(error.message);
    }
  }
  throw new ScreenshotExtractionError('model_failed', `Semua model Gemini gagal: ${failures.join(' | ')}`);
}

export async function extractScreenshots(
  images: ScreenshotImage[],
  referenceDate: string,
  options: { apiKey?: string; models?: string[]; budgetMs?: number } = {},
): Promise<ScreenshotExtraction> {
  const apiKey = options.apiKey ?? process.env.GEMINI_API_KEY;
  if (!apiKey) throw new ScreenshotExtractionError('not_configured', 'GEMINI_API_KEY belum di-set di server');
  const models = options.models ?? configuredModels();

  const deadline = Date.now() + (options.budgetMs ?? GEMINI_TOTAL_BUDGET_MS);
  const results = await Promise.all(images.map((image) => extractOne(image, referenceDate, apiKey, models, deadline)));
  const answers = results.map((r) => r.answer);
  let dropped = 0;
  const perImage = answers.map((answer) => {
    const normalized = normalizeRawRows(Array.isArray(answer.rows) ? answer.rows : []);
    dropped += normalized.dropped;
    return normalized.rows;
  });
  const rows = mergeScreenshotRows(perImage);
  if (rows.length === 0) throw new ScreenshotExtractionError('empty', 'Tidak ada transaksi terbaca dari file');

  const sources = answers.map((a) => (typeof a.source === 'string' ? a.source.trim().toUpperCase() : '')).filter(Boolean);
  const source = sources.sort((a, b) => sources.filter((s) => s === b).length - sources.filter((s) => s === a).length)[0];
  const [single] = answers;
  const opening = answers.length === 1 ? finiteOrNull(single.opening_balance) : null;
  const closing = answers.length === 1 ? finiteOrNull(single.closing_balance) : null;
  return {
    source: source ?? UNKNOWN_SOURCE,
    modelsUsed: [...new Set(results.map((r) => r.model))],
    rows,
    droppedRows: dropped,
    openingBalance: opening,
    closingBalance: closing,
    integrityOk: balancesClose(rows, opening, closing),
  };
}

function finiteOrNull(value: unknown): number | null {
  const number = typeof value === 'number' ? value : Number.NaN;
  return Number.isFinite(number) ? number : null;
}

export function balancesClose(rows: StatementRow[], opening: number | null, closing: number | null): boolean | null {
  if (opening === null || closing === null) return null;
  const net = rows.reduce((sum, r) => sum + (r.direction === 'credit' ? r.amount : -r.amount), 0);
  return Math.abs(roundCents(opening + net) - closing) < INTEGRITY_TOLERANCE_RUPIAH;
}
