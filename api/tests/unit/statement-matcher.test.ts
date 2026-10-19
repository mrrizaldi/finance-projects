import { describe, it, expect } from 'vitest';
import {
  auditBalance,
  matchStatement,
  type MatchLine,
  type MatchTransaction,
} from '../../src/lib/statement-matcher.js';

const JAGO = 'acc-jago';
const BCA = 'acc-bca';
const GOPAY = 'acc-gopay';
const PERIOD = { periodStart: '2026-09-01', periodEnd: '2026-09-30' };

let seq = 0;
const line = (date: string, amount: number, direction: 'debit' | 'credit', description = '', time: string | null = null): MatchLine => ({
  id: `line-${++seq}`, date, time, amount, direction, description,
});
const tx = (partial: Partial<MatchTransaction> & Pick<MatchTransaction, 'type' | 'amount' | 'date'>): MatchTransaction => ({
  id: `tx-${++seq}`,
  toAmount: null,
  accountId: JAGO,
  toAccountId: null,
  time: null,
  description: '',
  isAdjustment: false,
  ...partial,
});

const run = (lines: MatchLine[], transactions: MatchTransaction[], accountId = JAGO) =>
  matchStatement({ accountId, ...PERIOD, lines, transactions });

describe('matchStatement', () => {
  it('matches same amount, same day, same direction', () => {
    const l = line('2026-09-10', 225000, 'debit', 'M7 GYM');
    const t = tx({ type: 'expense', amount: 225000, date: '2026-09-10', description: 'M7 Gym' });
    const { lines, appFindings } = run([l], [t]);
    expect(lines).toEqual([{ lineId: l.id, decision: 'match', selected: false, matchedTransactionId: t.id, score: expect.any(Number) }]);
    expect(appFindings).toEqual([]);
  });

  it('still matches one day apart, but three days apart is only probable', () => {
    const near = line('2026-09-10', 40000, 'debit');
    const far = line('2026-09-20', 50000, 'debit');
    const { lines } = run([near, far], [
      tx({ type: 'expense', amount: 40000, date: '2026-09-11' }),
      tx({ type: 'expense', amount: 50000, date: '2026-09-23' }),
    ]);
    expect(lines.map((r) => r.decision)).toEqual(['match', 'probable']);
  });

  it('flags a generic app row with a slightly different amount as app_dup, unchecked', () => {
    const bank = line('2026-09-26', 58000, 'debit', 'GOPAY TOPUP');
    const real = tx({ type: 'expense', amount: 58000, date: '2026-09-26', description: 'Top up GoPay' });
    const generic = tx({ type: 'expense', amount: 57000, date: '2026-09-26', description: 'Internet Transaction Journal' });
    const { lines, appFindings } = run([bank], [real, generic]);
    expect(lines[0].matchedTransactionId).toBe(real.id);
    expect(appFindings).toEqual([
      { transactionId: generic.id, kind: 'app_dup', relatedLineId: bank.id, selected: false, signedAmount: -57000 },
    ]);
  });

  it('flags an exact second copy in the app as app_dup, checked', () => {
    const bank = line('2026-09-05', 18000, 'debit', 'KOPI');
    const first = tx({ type: 'expense', amount: 18000, date: '2026-09-05' });
    const copy = tx({ type: 'expense', amount: 18000, date: '2026-09-05' });
    const { lines, appFindings } = run([bank], [first, copy]);
    expect(lines[0].decision).toBe('match');
    expect(appFindings).toHaveLength(1);
    expect(appFindings[0]).toMatchObject({ kind: 'app_dup', selected: true });
  });

  it('pairs two identical bank rows with two identical app rows', () => {
    const bankRows = [line('2026-09-05', 18000, 'debit'), line('2026-09-05', 18000, 'debit')];
    const appRows = [tx({ type: 'expense', amount: 18000, date: '2026-09-05' }), tx({ type: 'expense', amount: 18000, date: '2026-09-05' })];
    const { lines, appFindings } = run(bankRows, appRows);
    expect(lines.map((r) => r.decision)).toEqual(['match', 'match']);
    expect(new Set(lines.map((r) => r.matchedTransactionId)).size).toBe(2);
    expect(appFindings).toEqual([]);
  });

  it('two identical bank rows but one app row: second is new and checked', () => {
    const bankRows = [line('2026-09-05', 18000, 'debit'), line('2026-09-05', 18000, 'debit')];
    const { lines } = run(bankRows, [tx({ type: 'expense', amount: 18000, date: '2026-09-05' })]);
    expect(lines.map((r) => [r.decision, r.selected])).toEqual([['match', false], ['new', true]]);
  });

  it('suggests other_account when the payment was recorded on another wallet', () => {
    const bank = line('2026-09-06', 20500, 'debit', 'GOSEND INSTANT');
    const onGopay = tx({ type: 'expense', amount: 20500, date: '2026-09-06', accountId: GOPAY, description: 'GoSend' });
    const { lines } = run([bank], [onGopay]);
    expect(lines[0]).toMatchObject({ decision: 'other_account', selected: true, matchedTransactionId: onGopay.id });
  });

  it('suggests a weak other_account match but leaves it unchecked', () => {
    const bank = line('2026-09-17', 10000, 'debit', 'DB INTERCHANGE GOOGLE CHROME');
    const cash = tx({ type: 'expense', amount: 10000, date: '2026-09-18', accountId: GOPAY, description: 'patungan badminton' });
    expect(run([bank], [cash]).lines[0]).toMatchObject({ decision: 'other_account', selected: false, matchedTransactionId: cash.id });
  });

  it('recognises a transfer between own accounts on the receiving side', () => {
    const bank = line('2026-09-09', 500000, 'credit', 'BIFAST DARI BCA');
    const transfer = tx({ type: 'transfer', amount: 500000, date: '2026-09-09', accountId: BCA, toAccountId: JAGO });
    const { lines } = run([bank], [transfer]);
    expect(lines[0]).toMatchObject({ decision: 'transfer_pair', matchedTransactionId: transfer.id });
  });

  it('uses to_amount for the receiving side of a transfer with a fee', () => {
    const bank = line('2026-09-09', 497500, 'credit');
    const transfer = tx({ type: 'transfer', amount: 500000, toAmount: 497500, date: '2026-09-09', accountId: BCA, toAccountId: JAGO });
    expect(run([bank], [transfer]).lines[0].decision).toBe('transfer_pair');
  });

  it('a bank debit that includes a fee the app left out is only probable', () => {
    const bank = line('2026-09-12', 102500, 'debit', 'TRF BIFAST');
    const transfer = tx({ type: 'transfer', amount: 100000, date: '2026-09-12', accountId: JAGO, toAccountId: BCA });
    expect(run([bank], [transfer]).lines[0].decision).toBe('probable');
  });

  it('never matches opposite directions', () => {
    const bank = line('2026-09-12', 50000, 'credit');
    const { lines } = run([bank], [tx({ type: 'expense', amount: 50000, date: '2026-09-12' })]);
    expect(lines[0].decision).toBe('new');
  });

  it('ignores balance adjustments entirely', () => {
    const adjustment = tx({ type: 'expense', amount: 2000, date: '2026-09-15', isAdjustment: true });
    const { lines, appFindings } = run([line('2026-09-15', 2000, 'debit')], [adjustment]);
    expect(lines[0].decision).toBe('new');
    expect(appFindings).toEqual([]);
  });

  it('reports app_only inside the period but not in the margin days', () => {
    const inside = tx({ type: 'expense', amount: 33000, date: '2026-09-04' });
    const margin = tx({ type: 'expense', amount: 44000, date: '2026-10-02' });
    const { appFindings } = run([], [inside, margin]);
    expect(appFindings).toEqual([
      { transactionId: inside.id, kind: 'app_only', relatedLineId: null, selected: false, signedAmount: -33000 },
    ]);
  });

  it('does not call a nearby but different transaction a duplicate', () => {
    const bank = line('2026-09-02', 12000, 'debit', 'JAJAN MOCHI');
    const real = tx({ type: 'expense', amount: 12000, date: '2026-09-02', description: 'Jajan Mochi' });
    const beforePeriod = tx({ type: 'expense', amount: 9900, date: '2026-08-31', description: 'Kopi WFC' });
    const otherDay = tx({ type: 'expense', amount: 9000, date: '2026-09-03', description: 'Takoyaki' });
    const { lines, appFindings } = run([bank], [real, beforePeriod, otherDay]);
    expect(lines[0].matchedTransactionId).toBe(real.id);
    expect(appFindings).toEqual([
      { transactionId: otherDay.id, kind: 'app_only', relatedLineId: null, selected: false, signedAmount: -9000 },
    ]);
  });

  it('uses time of day to break a tie between two same-amount rows', () => {
    const morning = line('2026-09-07', 15000, 'debit', '', '08:05');
    const evening = line('2026-09-07', 15000, 'debit', '', '19:40');
    const lateTx = tx({ type: 'expense', amount: 15000, date: '2026-09-07', time: '19:45' });
    const { lines } = run([morning, evening], [lateTx]);
    expect(lines.find((r) => r.lineId === evening.id)?.matchedTransactionId).toBe(lateTx.id);
    expect(lines.find((r) => r.lineId === morning.id)?.decision).toBe('new');
  });
});

describe('auditBalance', () => {
  it('explains the gap with new rows and app findings, leaving the rest unexplained', () => {
    const newRow = line('2026-09-03', 100000, 'debit');
    const matched = line('2026-09-04', 50000, 'debit');
    const appMatched = tx({ type: 'expense', amount: 50000, date: '2026-09-04' });
    const appOnly = tx({ type: 'expense', amount: 30000, date: '2026-09-20' });
    const lines = [newRow, matched];
    const result = run(lines, [appMatched, appOnly]);
    const audit = auditBalance({ statementClosing: 870000, appClosing: 940000, lines, result });
    expect(audit.explained).toBe(-70000);
    expect(audit.unexplained).toBe(0);
    const off = auditBalance({ statementClosing: 869000, appClosing: 940000, lines, result });
    expect(off.unexplained).toBe(-1000);
  });
});
