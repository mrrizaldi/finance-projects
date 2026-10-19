import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export type StatementBank = 'BCA' | 'BSI';
export type StatementDirection = 'debit' | 'credit';

export interface StatementRow {
  date: string;
  time: string | null;
  description: string;
  amount: number;
  direction: StatementDirection;
  balanceAfter: number | null;
  ref: string | null;
}

export interface StatementSummary {
  openingBalance: number | null;
  closingBalance: number | null;
  credit: number | null;
  debit: number | null;
}

export interface ParsedStatement {
  bank: StatementBank;
  accountNo: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  openingBalance: number | null;
  closingBalance: number | null;
  summary: StatementSummary | null;
  rows: StatementRow[];
  totals: { debit: number; credit: number; count: number };
  integrityOk: boolean | null;
}

export type StatementParseErrorCode = 'pdftotext_missing' | 'pdftotext_failed' | 'unrecognized' | 'empty';

export class StatementParseError extends Error {
  constructor(public code: StatementParseErrorCode, message: string) {
    super(message);
  }
}

const PDFTOTEXT_TIMEOUT_MS = 120_000;
const PDFTOTEXT_MAX_BUFFER_BYTES = 32 * 1024 * 1024;
export const INTEGRITY_TOLERANCE_RUPIAH = 1;
export const CENTS_PER_RUPIAH = 100;
const MAX_CONTINUATION_LENGTH = 120;
const MONTH_ABBREV_LENGTH = 3;
const DECEMBER = 12;
const JANUARY = 1;

const MONTH_NUMBER_BY_FULL_NAME: Record<string, number> = {
  januari: 1, februari: 2, maret: 3, april: 4, mei: 5, juni: 6,
  juli: 7, agustus: 8, september: 9, oktober: 10, november: 11, desember: 12,
};

const MONTH_NUMBER_BY_ABBREV: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, mei: 5, may: 5, jun: 6, jul: 7,
  agu: 8, aug: 8, agt: 8, sep: 9, okt: 10, oct: 10, nov: 11, des: 12, dec: 12,
};

const ID_DECIMAL = /^[\d.]+,\d{1,2}$/;
const EN_DECIMAL = /^[\d,]+\.\d{1,2}$/;

const BCA_ACCOUNT = /NO\.?\s*RE\s*KE\s*NING\s*:?\s*(\d+)/i;
const BCA_PERIOD = /PE\s*RIOD\s*E\s*:?\s*([A-Za-z ]+)\s+(\d{4})/i;
const BCA_ROW = /^\s*(\d{2})\/(\d{2})\s+(.+?)\s+([\d,]+\.\d{2})(?:\s+(DB|CR))?(?:\s+([\d,]+\.\d{2}))?\s*$/;
const BCA_ROW_START = /^\s*\d{2}\/\d{2}\s/;
const BCA_SUMMARY = /^\s*(SALDO AWAL|SALDO AKHIR|MUTASI CR|MUTASI DB)\s*:\s*([\d,]+\.\d{2})/i;
const BCA_NON_DESCRIPTION = /^(TANGGAL|KETERANGAN|CATATAN|Bersambung|SALDO|MUTASI|HALAMAN|PERIOD)/i;
const BCA_CREDIT_MARKER = /\b(CR|KR)\b/;
const BCA_DEBIT_MARKER = /\bDB\b/;
const EN_AMOUNT_ANYWHERE = /[\d,]+\.\d{2}/g;

const BSI_ACCOUNT = /IDR\s*-\s*(\d{6,})/;
const BSI_PERIOD = /PERIODE LAPORAN\s*:\s*(\d{2})\s+(\w{3})\s*-\s*(\d{2})\s+(\w{3})\s+(\d{4})/i;
const BSI_OPENING = /SALDO BULAN LALU[\s\S]{0,200}?Rp\s*([\d.]+,\d{2})/i;
const BSI_ROW = /^\s*(\d{2})\s+(\w{3})\s+(\d{4})\s+(.+?)\s{2,}(\S*)\s{2,}([\d.]+,\d{2})\s+([\d.]+,\d{2})\s+([\d.]+,\d{2})\s*$/;
const BSI_TIME = /^\s*(\d{2}:\d{2})\s+(.*)$/;
const BSI_NON_DESCRIPTION = /^(Date|RINGKASAN|Selalu|Buka|Halaman|Info)/i;

const BCA_SIGNATURE = /REKENING TAHAPAN|PT\. BANK CENTRAL ASIA|NO\.?\s*RE\s*KE\s*NING/;
const BSI_SIGNATURE = /LAPORAN REKENING|BYOND|EASY WADIAH/;

const pad2 = (n: number) => String(n).padStart(2, '0');
const isoDate = (year: number, month: number, day: number) => `${year}-${pad2(month)}-${pad2(day)}`;
const collapseSpaces = (text: string) => text.replace(/\s{2,}/g, ' ').trim();
export const roundCents = (value: number) => Math.round(value * CENTS_PER_RUPIAH) / CENTS_PER_RUPIAH;
const lastDayOfMonth = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate();

export function parseStatementAmount(text: string | undefined | null): number | null {
  const compact = (text ?? '').replace(/\s/g, '');
  if (!compact) return null;
  let normalized: string;
  if (ID_DECIMAL.test(compact)) normalized = compact.replace(/\./g, '').replace(',', '.');
  else if (EN_DECIMAL.test(compact)) normalized = compact.replace(/,/g, '');
  else normalized = compact.replace(/[.,]/g, '');
  if (!normalized) return null;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

function appendDescription(row: StatementRow, fragment: string) {
  row.description = `${row.description} ${fragment}`.trim();
}

function lastKnownBalance(rows: StatementRow[], fallback: number | null): number | null {
  for (let i = rows.length - 1; i >= 0; i--) {
    const balance = rows[i].balanceAfter;
    if (balance !== null) return balance;
  }
  return fallback;
}

function inferBcaDirection(
  marker: string | undefined,
  description: string,
  balance: number | null,
  previousBalance: number | null,
): StatementDirection {
  if (marker) return marker.toUpperCase() === 'CR' ? 'credit' : 'debit';
  if (BCA_CREDIT_MARKER.test(description) && !BCA_DEBIT_MARKER.test(description)) return 'credit';
  if (balance !== null) return previousBalance !== null && balance > previousBalance ? 'credit' : 'debit';
  return 'debit';
}

function parseBca(text: string): Omit<ParsedStatement, 'totals' | 'integrityOk'> {
  const accountMatch = text.replace(/ /g, ' ').match(BCA_ACCOUNT);
  const periodMatch = text.match(BCA_PERIOD);
  let month: number | null = null;
  let year: number | null = null;
  if (periodMatch) {
    const [, monthName, yearText] = periodMatch;
    month = MONTH_NUMBER_BY_FULL_NAME[monthName.replace(/\s+/g, '').toLowerCase()] ?? null;
    year = Number(yearText);
  }

  const rows: StatementRow[] = [];
  const summaryValues: Record<string, number | null> = {};
  let opening: number | null = null;
  let runningBalance: number | null = null;

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trimEnd();
    if (!line.trim()) continue;

    const summaryMatch = line.match(BCA_SUMMARY);
    if (summaryMatch) {
      const [, label, value] = summaryMatch;
      summaryValues[label.toUpperCase()] = parseStatementAmount(value);
      continue;
    }

    const rowMatch = line.match(BCA_ROW);
    if (!rowMatch) {
      if (line.toUpperCase().includes('SALDO AWAL') && opening === null) {
        const amounts = line.match(EN_AMOUNT_ANYWHERE);
        if (amounts) opening = parseStatementAmount(amounts[amounts.length - 1]);
      } else if (rows.length > 0 && !BCA_ROW_START.test(line)) {
        const fragment = line.trim();
        if (!BCA_NON_DESCRIPTION.test(fragment) && fragment.length < MAX_CONTINUATION_LENGTH && !fragment.startsWith('•')) {
          appendDescription(rows[rows.length - 1], fragment);
        }
      }
      continue;
    }

    const [, dayText, monthText, rawDescription, amountText, marker, balanceText] = rowMatch;
    const description = collapseSpaces(rawDescription);
    if (description.toUpperCase().includes('SALDO AWAL')) {
      opening = parseStatementAmount(balanceText ?? amountText);
      runningBalance = opening;
      continue;
    }

    const rowMonth = Number(monthText);
    const rowYear = month === DECEMBER && rowMonth === JANUARY ? (year ?? 0) + 1 : (year ?? 0);
    const amount = parseStatementAmount(amountText) ?? 0;
    const balance = balanceText ? parseStatementAmount(balanceText) : null;
    const direction = inferBcaDirection(marker, description, balance, runningBalance ?? opening);
    const balanceBefore = runningBalance ?? opening;
    runningBalance = balance ?? (balanceBefore === null ? null : balanceBefore + (direction === 'credit' ? amount : -amount));
    rows.push({
      date: isoDate(rowYear, rowMonth, Number(dayText)),
      time: null,
      description,
      amount,
      direction,
      balanceAfter: balance,
      ref: null,
    });
  }

  const hasSummary = Object.keys(summaryValues).length > 0;
  const summary: StatementSummary | null = hasSummary
    ? {
        openingBalance: summaryValues['SALDO AWAL'] ?? null,
        closingBalance: summaryValues['SALDO AKHIR'] ?? null,
        credit: summaryValues['MUTASI CR'] ?? null,
        debit: summaryValues['MUTASI DB'] ?? null,
      }
    : null;
  if (summary?.openingBalance != null) opening = summary.openingBalance;
  const closing = summary?.closingBalance ?? lastKnownBalance(rows, null);

  return {
    bank: 'BCA',
    accountNo: accountMatch ? accountMatch[1] : null,
    periodStart: month && year ? isoDate(year, month, 1) : null,
    periodEnd: month && year ? isoDate(year, month, lastDayOfMonth(year, month)) : null,
    openingBalance: opening,
    closingBalance: closing,
    summary,
    rows,
  };
}

function parseBsi(text: string): Omit<ParsedStatement, 'totals' | 'integrityOk'> {
  const accountMatch = text.match(BSI_ACCOUNT);
  const periodMatch = text.match(BSI_PERIOD);
  let periodStart: string | null = null;
  let periodEnd: string | null = null;
  if (periodMatch) {
    const [, startDay, startMonthText, endDay, endMonthText, yearText] = periodMatch;
    const startMonth = MONTH_NUMBER_BY_ABBREV[startMonthText.slice(0, MONTH_ABBREV_LENGTH).toLowerCase()];
    const endMonth = MONTH_NUMBER_BY_ABBREV[endMonthText.slice(0, MONTH_ABBREV_LENGTH).toLowerCase()];
    const endYear = Number(yearText);
    if (startMonth && endMonth) {
      const startYear = startMonth > endMonth ? endYear - 1 : endYear;
      periodStart = isoDate(startYear, startMonth, Number(startDay));
      periodEnd = isoDate(endYear, endMonth, Number(endDay));
    }
  }
  const openingMatch = text.match(BSI_OPENING);
  const opening = openingMatch ? parseStatementAmount(openingMatch[1]) : null;

  const rows: StatementRow[] = [];
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trimEnd();
    if (!line.trim()) continue;

    const rowMatch = line.match(BSI_ROW);
    if (rowMatch) {
      const [, dayText, monthText, yearText, rawDescription, ref, debitText, creditText, balanceText] = rowMatch;
      const month = MONTH_NUMBER_BY_ABBREV[monthText.slice(0, MONTH_ABBREV_LENGTH).toLowerCase()];
      if (!month) continue;
      const debit = parseStatementAmount(debitText) ?? 0;
      const credit = parseStatementAmount(creditText) ?? 0;
      rows.push({
        date: isoDate(Number(yearText), month, Number(dayText)),
        time: null,
        description: collapseSpaces(rawDescription),
        amount: credit > 0 ? credit : debit,
        direction: credit > 0 ? 'credit' : 'debit',
        balanceAfter: parseStatementAmount(balanceText),
        ref: ref || null,
      });
      continue;
    }

    const lastRow = rows[rows.length - 1];
    if (!lastRow) continue;
    const timeMatch = line.match(BSI_TIME);
    if (timeMatch) {
      const [, time, rest] = timeMatch;
      if (lastRow.time === null) lastRow.time = time;
      if (rest.trim()) appendDescription(lastRow, rest.trim());
      continue;
    }
    const fragment = line.trim();
    if (!BSI_NON_DESCRIPTION.test(fragment) && fragment.length < MAX_CONTINUATION_LENGTH) {
      appendDescription(lastRow, fragment);
    }
  }

  return {
    bank: 'BSI',
    accountNo: accountMatch ? accountMatch[1] : null,
    periodStart,
    periodEnd,
    openingBalance: opening,
    closingBalance: rows.length > 0 ? rows[rows.length - 1].balanceAfter : null,
    summary: null,
    rows,
  };
}

function withinTolerance(a: number, b: number) {
  return Math.abs(a - b) < INTEGRITY_TOLERANCE_RUPIAH;
}

export function parseStatementText(text: string): ParsedStatement {
  const upper = text.toUpperCase();
  let parsed: Omit<ParsedStatement, 'totals' | 'integrityOk'>;
  if (BCA_SIGNATURE.test(upper)) parsed = parseBca(text);
  else if (BSI_SIGNATURE.test(upper)) parsed = parseBsi(text);
  else throw new StatementParseError('unrecognized', 'format e-statement bukan BCA/BSI, dibaca lewat Gemini');

  if (parsed.rows.length === 0) {
    throw new StatementParseError('empty', `tidak ada baris transaksi terbaca dari ${parsed.bank}, cek apakah PDF-nya ter-password atau hasil scan`);
  }

  const sumBy = (direction: StatementDirection) =>
    roundCents(parsed.rows.filter((r) => r.direction === direction).reduce((sum, r) => sum + r.amount, 0));
  const debit = sumBy('debit');
  const credit = sumBy('credit');

  let integrityOk: boolean | null = null;
  if (parsed.openingBalance !== null && parsed.closingBalance !== null) {
    integrityOk = withinTolerance(parsed.openingBalance + credit - debit, parsed.closingBalance);
    if (parsed.summary?.credit != null) integrityOk &&= withinTolerance(parsed.summary.credit, credit);
    if (parsed.summary?.debit != null) integrityOk &&= withinTolerance(parsed.summary.debit, debit);
  }

  return { ...parsed, totals: { debit, credit, count: parsed.rows.length }, integrityOk };
}

export async function extractPdfText(path: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync('pdftotext', ['-layout', path, '-'], {
      timeout: PDFTOTEXT_TIMEOUT_MS,
      maxBuffer: PDFTOTEXT_MAX_BUFFER_BYTES,
    });
    return stdout;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') throw new StatementParseError('pdftotext_missing', 'pdftotext tidak terpasang (paket poppler-utils)');
    throw new StatementParseError('pdftotext_failed', `pdftotext gagal: ${(error as Error).message.slice(0, 200)}`);
  }
}

export async function parseStatementPdf(path: string): Promise<ParsedStatement> {
  return parseStatementText(await extractPdfText(path));
}
