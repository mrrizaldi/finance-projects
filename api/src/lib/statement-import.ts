import { createHash } from 'node:crypto';
import type { MatchTransaction } from './statement-matcher.js';
import type { StatementRow } from './statement-parser.js';
import { toJakartaDateAndTime } from './utils.js';

export type UploadKind = 'pdf' | 'screenshot';

const PDF_MAGIC = Buffer.from('%PDF');
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff]);
const RIFF_MAGIC = Buffer.from('RIFF');
const WEBP_MARKER = Buffer.from('WEBP');
const WEBP_MARKER_OFFSET = 8;

const startsWith = (buffer: Buffer, magic: Buffer, offset = 0) =>
  buffer.subarray(offset, offset + magic.length).equals(magic);

export function mimeTypeOf(buffer: Buffer): string {
  if (startsWith(buffer, PDF_MAGIC)) return 'application/pdf';
  if (startsWith(buffer, PNG_MAGIC)) return 'image/png';
  if (startsWith(buffer, JPEG_MAGIC)) return 'image/jpeg';
  return 'image/webp';
}

export function fileKind(buffer: Buffer): UploadKind | null {
  if (startsWith(buffer, PDF_MAGIC)) return 'pdf';
  if (startsWith(buffer, PNG_MAGIC) || startsWith(buffer, JPEG_MAGIC)) return 'screenshot';
  if (startsWith(buffer, RIFF_MAGIC) && startsWith(buffer, WEBP_MARKER, WEBP_MARKER_OFFSET)) return 'screenshot';
  return null;
}

const sha256 = (data: Buffer | string) => createHash('sha256').update(data).digest('hex');

export function combinedSha256(buffers: Buffer[]): string {
  return sha256(buffers.map(sha256).sort().join(':'));
}

const normalizeDescription = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export function lineFingerprints(rows: StatementRow[]): string[] {
  const seen = new Map<string, number>();
  return rows.map((row) => {
    const key = [row.date, row.time ?? '', row.amount.toFixed(2), row.direction, normalizeDescription(row.description)].join('|');
    const occurrence = (seen.get(key) ?? 0) + 1;
    seen.set(key, occurrence);
    return sha256(`${key}|${occurrence}`);
  });
}

export interface TransactionRow {
  id: string;
  type: MatchTransaction['type'];
  amount: number | string;
  to_amount: number | string | null;
  account_id: string | null;
  to_account_id: string | null;
  transaction_date: string;
  description: string | null;
  merchant: string | null;
  is_adjustment: boolean | null;
}

export function toMatchTransaction(row: TransactionRow): MatchTransaction {
  const { date, time } = toJakartaDateAndTime(row.transaction_date);
  return {
    id: row.id,
    type: row.type,
    amount: Number(row.amount),
    toAmount: row.to_amount === null ? null : Number(row.to_amount),
    accountId: row.account_id,
    toAccountId: row.to_account_id,
    date,
    time,
    description: [row.description, row.merchant].filter(Boolean).join(' '),
    isAdjustment: Boolean(row.is_adjustment),
  };
}

export function balanceOnAccount(
  accountId: string,
  row: { account_id: string | null; balance_after: number | string | null; to_balance_after: number | string | null } | null,
): number | null {
  if (!row) return null;
  const value = row.account_id === accountId ? row.balance_after : row.to_balance_after;
  return value === null ? null : Number(value);
}
