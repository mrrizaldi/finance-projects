import {
  callGeminiChain,
  configuredModels,
  GEMINI_TOTAL_BUDGET_MS,
  isValidCalendarDate,
  ScreenshotExtractionError,
  type ScreenshotImage,
} from './screenshot-extractor.js';
import { scorePair, type MatchLine } from './statement-matcher.js';
import { toMatchTransaction, type TransactionRow } from './statement-import.js';

export const RECEIPT_PROMPT_VERSION = 1;
export const LINE_KINDS = ['item', 'tax', 'service', 'discount', 'rounding'] as const;
export type LineKind = (typeof LINE_KINDS)[number];

export interface ReceiptLine {
  kind: LineKind;
  name: string;
  qty: number;
  amount: number;
  category_id: string | null;
}

export interface CategoryRef {
  id: string;
  name: string;
}

export interface NormalizedReceipt {
  merchant: string | null;
  purchasedDate: string | null;
  purchasedTime: string | null;
  printedTotal: number | null;
  lines: ReceiptLine[];
}

export interface ReceiptExtraction extends NormalizedReceipt {
  extractor: string;
}

const TOTAL_TOLERANCE_RUPIAH = 1;
const MAX_CANDIDATES = 3;
const LOCAL_DATETIME = /^(\d{4}-\d{2}-\d{2})(?:[T ]([01]\d|2[0-3]):([0-5]\d))?/;

export const RECEIPT_SCHEMA = {
  type: 'OBJECT',
  properties: {
    merchant: { type: 'STRING', nullable: true },
    purchased_at: { type: 'STRING', nullable: true },
    printed_total: { type: 'NUMBER', nullable: true },
    lines: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          kind: { type: 'STRING', enum: [...LINE_KINDS] },
          name: { type: 'STRING' },
          qty: { type: 'NUMBER' },
          amount: { type: 'NUMBER' },
          category: { type: 'STRING', nullable: true },
        },
        required: ['kind', 'name', 'amount'],
      },
    },
  },
  required: ['lines'],
};

export function buildReceiptPrompt(referenceDate: string, categoryNames: string[]): string {
  return [
    'Kamu membaca struk belanja Indonesia (foto, bisa beberapa foto dari satu struk panjang, atau PDF/e-receipt).',
    'Kembalikan isinya sebagai JSON sesuai skema.',
    '',
    'Aturan:',
    '- merchant: nama toko/resto seperti tercetak, null kalau tidak terbaca.',
    `- purchased_at: "YYYY-MM-DD HH:mm" (24 jam) atau "YYYY-MM-DD" kalau jam tidak ada; null kalau tidak ada tanggal. Kalau tahun tidak tercetak, pakai tahun yang membuat tanggalnya paling dekat dan tidak melewati ${referenceDate}.`,
    '- printed_total: total akhir yang dibayar seperti tercetak (TOTAL / GRAND TOTAL / TOTAL BAYAR), angka rupiah biasa. Bukan tunai yang diserahkan, bukan kembalian.',
    '- lines: satu baris per item dan per penyesuaian, urut seperti di struk.',
    '  kind "item" untuk barang/jasa; amount = total baris (harga × qty, sudah dikurangi diskon yang tercetak tepat di bawah item itu).',
    '  kind "discount" untuk diskon/voucher/potongan tingkat struk; amount negatif.',
    '  kind "tax" untuk PPN/PB1/pajak; kind "service" untuk service charge; kind "rounding" untuk pembulatan/donasi pembulatan (bisa negatif).',
    '  Lewati baris subtotal, total, tunai, kembalian, metode bayar, poin, dan teks promosi.',
    '- qty: jumlah barang kalau tercetak, 1 kalau tidak.',
    '- amount: angka rupiah biasa. "15.000", "15,000", dan "Rp15.000" sama-sama 15000.',
    `- category: untuk kind "item", pilih satu nama paling cocok dari daftar ini persis seperti tertulis: ${categoryNames.join(', ')}. null kalau tidak ada yang cocok. Untuk kind lain selalu null.`,
    '- Jangan mengarang baris. Kalau tidak terbaca, kembalikan lines kosong.',
  ].join('\n');
}

interface RawLine {
  kind?: unknown;
  name?: unknown;
  qty?: unknown;
  amount?: unknown;
  category?: unknown;
}

export interface RawReceipt {
  merchant?: unknown;
  purchased_at?: unknown;
  printed_total?: unknown;
  lines?: RawLine[];
}

const isLineKind = (value: unknown): value is LineKind => LINE_KINDS.includes(value as LineKind);

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export function normalizeReceipt(answer: unknown, categories: CategoryRef[]): NormalizedReceipt {
  const raw: RawReceipt = isPlainObject(answer) ? answer : {};
  const byName = new Map(categories.map((c) => [c.name.trim().toLowerCase(), c.id]));
  const lines: ReceiptLine[] = [];
  for (const line of Array.isArray(raw.lines) ? raw.lines : []) {
    if (!isPlainObject(line)) continue;
    const value = Math.round(Number(line.amount));
    if (!Number.isFinite(value) || value === 0) continue;
    const declared: LineKind = isLineKind(line.kind) ? line.kind : 'item';
    const kind: LineKind = declared === 'item' && value < 0 ? 'discount' : declared;
    const amount = kind === 'discount' ? -Math.abs(value) : kind === 'rounding' ? value : Math.abs(value);
    const qty = Number(line.qty);
    const name = typeof line.name === 'string' ? line.name.replace(/\s+/g, ' ').trim() : '';
    lines.push({
      kind,
      name: name || kind,
      qty: Number.isFinite(qty) && qty > 0 ? qty : 1,
      amount,
      category_id: kind === 'item' && typeof line.category === 'string'
        ? byName.get(line.category.trim().toLowerCase()) ?? null
        : null,
    });
  }
  const match = typeof raw.purchased_at === 'string' ? LOCAL_DATETIME.exec(raw.purchased_at.trim()) : null;
  const validDate = match !== null && isValidCalendarDate(match[1]);
  const printed = typeof raw.printed_total === 'number' ? raw.printed_total : Number.NaN;
  return {
    merchant: typeof raw.merchant === 'string' && raw.merchant.trim() ? raw.merchant.trim() : null,
    purchasedDate: validDate ? match[1] : null,
    purchasedTime: validDate && match[2] ? `${match[2]}:${match[3]}` : null,
    printedTotal: Number.isFinite(printed) && printed > 0 ? printed : null,
    lines,
  };
}

export const receiptTotal = (lines: ReceiptLine[]) => lines.reduce((sum, line) => sum + line.amount, 0);

export const totalMatches = (lines: ReceiptLine[], printed: number | null) =>
  printed !== null && Math.abs(receiptTotal(lines) - printed) < TOTAL_TOLERANCE_RUPIAH;

export function rankCandidates(
  receipt: { date: string; time: string | null; amount: number; merchant: string | null },
  rows: TransactionRow[],
): Array<{ id: string; score: number }> {
  const line: MatchLine = {
    id: 'receipt', date: receipt.date, time: receipt.time, amount: receipt.amount,
    direction: 'debit', description: receipt.merchant ?? '',
  };
  return rows
    .map(toMatchTransaction)
    .filter((tx) => tx.type === 'expense' && !tx.isAdjustment)
    .map((tx) => ({ id: tx.id, score: scorePair(line, -tx.amount, tx) }))
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_CANDIDATES);
}

export async function extractReceipt(
  files: ScreenshotImage[],
  referenceDate: string,
  categories: CategoryRef[],
  options: { apiKey?: string; models?: string[]; budgetMs?: number } = {},
): Promise<ReceiptExtraction> {
  const apiKey = options.apiKey ?? process.env.GEMINI_API_KEY;
  if (!apiKey) throw new ScreenshotExtractionError('not_configured', 'GEMINI_API_KEY belum di-set di server');
  const { model, answer } = await callGeminiChain(
    files,
    buildReceiptPrompt(referenceDate, categories.map((c) => c.name)),
    RECEIPT_SCHEMA,
    apiKey,
    options.models ?? configuredModels(),
    Date.now() + (options.budgetMs ?? GEMINI_TOTAL_BUDGET_MS),
  );
  const normalized = normalizeReceipt(answer, categories);
  if (!normalized.lines.some((line) => line.kind === 'item')) throw new ScreenshotExtractionError('empty', 'Tidak ada item terbaca dari struk');
  return { ...normalized, extractor: `vision:${model}@${RECEIPT_PROMPT_VERSION}` };
}
