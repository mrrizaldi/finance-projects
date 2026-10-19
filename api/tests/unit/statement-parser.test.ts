import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseStatementAmount,
  parseStatementPdf,
  parseStatementText,
  StatementParseError,
} from '../../src/lib/statement-parser.js';

const RECAP_DIR = fileURLToPath(new URL('../../../recap', import.meta.url));

const BCA_DECEMBER = [
  'REKENING TAHAPAN',
  'NO. REKENING   : 1234567890',
  'PERIODE        : DESEMBER 2026',
  'TANGGAL  KETERANGAN                                  MUTASI           SALDO',
  '01/12    SALDO AWAL                                                 1,000,000.00',
  '02/12    TRSF E-BANKING DB   0212/FTSCY/WS95051       50,000.00 DB    950,000.00',
  '         TOKO SEBELAH',
  '03/12    TRSF E-BANKING CR   0312/FTSCY/WS95051      200,000.00      1,150,000.00',
  '05/12    KR OTOMATIS GAJI                             25,000.00',
  '07/12    QRIS PAYMENT                                 15,000.00      1,160,000.00',
  '02/01    BIAYA ADM                                    10,000.00 DB   1,150,000.00',
  'SALDO AWAL  : 1,000,000.00',
  'MUTASI CR   : 225,000.00',
  'MUTASI DB   : 75,000.00',
  'SALDO AKHIR : 1,150,000.00',
].join('\n');

const BSI_JUNE = [
  'LAPORAN REKENING',
  'Nomor Rekening IDR - 7261399169',
  'PERIODE LAPORAN : 01 Jun - 30 Jun 2026',
  'SALDO BULAN LALU',
  '        Rp 500.000,00',
  'Date         Description                 Ref        Debit          Credit        Balance',
  '03 Jun 2026  TRF KE BANK JAGO            FT001      100.000,00     0,00          400.000,00',
  '08:15  via BIFAST',
  '04 Jun 2026  SETOR TUNAI                 ST002      0,00           50.000,00     450.000,00',
  'Halaman 1 dari 1',
].join('\n');

describe('parseStatementAmount', () => {
  it('reads Indonesian and English decimal formats', () => {
    expect(parseStatementAmount('1.234.567,89')).toBe(1234567.89);
    expect(parseStatementAmount('1,234,567.89')).toBe(1234567.89);
    expect(parseStatementAmount('15.000')).toBe(15000);
  });

  it('returns null for blanks and non numbers', () => {
    expect(parseStatementAmount('')).toBeNull();
    expect(parseStatementAmount(null)).toBeNull();
    expect(parseStatementAmount('abc')).toBeNull();
  });
});

describe('parseStatementText BCA', () => {
  const parsed = parseStatementText(BCA_DECEMBER);

  it('reads account, period and balances', () => {
    expect(parsed.bank).toBe('BCA');
    expect(parsed.accountNo).toBe('1234567890');
    expect(parsed.periodStart).toBe('2026-12-01');
    expect(parsed.periodEnd).toBe('2026-12-31');
    expect(parsed.openingBalance).toBe(1000000);
    expect(parsed.closingBalance).toBe(1150000);
  });

  it('decides direction from DB suffix, CR/KR in description, then running balance', () => {
    expect(parsed.rows.map((r) => [r.date, r.amount, r.direction])).toEqual([
      ['2026-12-02', 50000, 'debit'],
      ['2026-12-03', 200000, 'credit'],
      ['2026-12-05', 25000, 'credit'],
      ['2026-12-07', 15000, 'debit'],
      ['2027-01-02', 10000, 'debit'],
    ]);
  });

  it('joins continuation lines onto the previous row', () => {
    expect(parsed.rows[0].description).toBe('TRSF E-BANKING DB 0212/FTSCY/WS95051 TOKO SEBELAH');
  });

  it('checks closing balance and summary totals', () => {
    expect(parsed.totals).toEqual({ debit: 75000, credit: 225000, count: 5 });
    expect(parsed.integrityOk).toBe(true);
  });

  it('fails integrity when the summary block disagrees with the rows', () => {
    const tampered = parseStatementText(BCA_DECEMBER.replace('MUTASI CR   : 225,000.00', 'MUTASI CR   : 226,000.00'));
    expect(tampered.integrityOk).toBe(false);
  });
});

describe('parseStatementText BSI', () => {
  const parsed = parseStatementText(BSI_JUNE);

  it('reads period, opening from the line after the header, and rows', () => {
    expect(parsed.bank).toBe('BSI');
    expect(parsed.accountNo).toBe('7261399169');
    expect(parsed.periodStart).toBe('2026-06-01');
    expect(parsed.periodEnd).toBe('2026-06-30');
    expect(parsed.openingBalance).toBe(500000);
    expect(parsed.closingBalance).toBe(450000);
    expect(parsed.integrityOk).toBe(true);
  });

  it('attaches the time line and its text to the previous row', () => {
    const [transfer, deposit] = parsed.rows;
    expect(transfer).toEqual({
      date: '2026-06-03', time: '08:15', description: 'TRF KE BANK JAGO via BIFAST',
      amount: 100000, direction: 'debit', balanceAfter: 400000, ref: 'FT001',
    });
    expect(deposit.direction).toBe('credit');
    expect(deposit.time).toBeNull();
  });
});

describe('parseStatementText errors', () => {
  it('rejects unknown banks', () => {
    expect(() => parseStatementText('BANK JAGO statement')).toThrowError(StatementParseError);
  });

  it('rejects a recognised bank with no rows', () => {
    try {
      parseStatementText('REKENING TAHAPAN\nkosong');
      expect.unreachable();
    } catch (error) {
      expect((error as StatementParseError).code).toBe('empty');
    }
  });
});

describe.skipIf(!existsSync(RECAP_DIR))('real e-statements in recap/', () => {
  const pdfs = existsSync(RECAP_DIR)
    ? readdirSync(RECAP_DIR).flatMap((bank) => readdirSync(join(RECAP_DIR, bank)).map((f) => join(RECAP_DIR, bank, f)))
    : [];

  it.each(pdfs)('%s closes its balance', async (pdf) => {
    const parsed = await parseStatementPdf(pdf);
    expect(parsed.rows.length).toBeGreaterThan(0);
    expect(parsed.integrityOk).toBe(true);
  });
});
