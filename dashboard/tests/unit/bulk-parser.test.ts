import { describe, it, expect } from 'vitest';
import { parseBulkInput } from '@/lib/bulk-parser';

describe('parseBulkInput', () => {
  const YEAR = 2026;

  it('basic expense line', () => {
    const [line] = parseBulkInput('20/05 50000 Makan siang', YEAR);
    expect(line.error).toBeNull();
    expect(line.type).toBe('expense');
    expect(line.amount).toBe(50000);
    expect(line.description).toBe('Makan siang');
    expect(line.date).toBe('2026-05-20');
    expect(line.accountName).toBeNull();
  });

  it('income prefix +', () => {
    const [line] = parseBulkInput('+01/05 1000000 Gaji', YEAR);
    expect(line.error).toBeNull();
    expect(line.type).toBe('income');
    expect(line.amount).toBe(1000000);
  });

  it('rb shorthand', () => {
    const [line] = parseBulkInput('01/01 100rb Bensin', YEAR);
    expect(line.error).toBeNull();
    expect(line.amount).toBe(100000);
  });

  it('jt shorthand', () => {
    const [line] = parseBulkInput('01/01 1.5jt Transfer', YEAR);
    expect(line.error).toBeNull();
    expect(line.amount).toBe(1500000);
  });

  it('account tag [BCA] extracted', () => {
    const [line] = parseBulkInput('20/05 50rb Bensin [BCA]', YEAR);
    expect(line.error).toBeNull();
    expect(line.accountName).toBe('BCA');
    expect(line.description).toBe('Bensin');
  });

  it('single digit day and month zero-padded', () => {
    const [line] = parseBulkInput('1/5 50000 Test', YEAR);
    expect(line.date).toBe('2026-05-01');
  });

  it('invalid format returns error', () => {
    const [line] = parseBulkInput('invalid line no date', YEAR);
    expect(line.error).not.toBeNull();
    expect(line.amount).toBe(0);
  });

  it('zero amount returns error', () => {
    const [line] = parseBulkInput('20/05 0 Makan', YEAR);
    expect(line.error).not.toBeNull();
  });

  it('empty lines are filtered', () => {
    const lines = parseBulkInput('20/05 50000 A\n\n   \n20/05 30000 B', YEAR);
    expect(lines).toHaveLength(2);
  });

  it('multi-line: mix of valid and invalid', () => {
    const text = '20/05 50000 A\nbad line\n+20/05 100000 C';
    const lines = parseBulkInput(text, YEAR);
    expect(lines).toHaveLength(3);
    expect(lines[0].error).toBeNull();
    expect(lines[1].error).not.toBeNull();
    expect(lines[2].error).toBeNull();
    expect(lines[2].type).toBe('income');
  });

  it('income + account tag combined', () => {
    const [line] = parseBulkInput('+15/06 500rb Freelance [BSI]', YEAR);
    expect(line.error).toBeNull();
    expect(line.type).toBe('income');
    expect(line.amount).toBe(500000);
    expect(line.accountName).toBe('BSI');
  });

  it('uses currentYear parameter', () => {
    const [line] = parseBulkInput('01/01 50000 Test', 2024);
    expect(line.date).toBe('2024-01-01');
  });
});
