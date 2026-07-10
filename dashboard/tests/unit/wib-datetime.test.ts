import { describe, it, expect } from 'vitest';
import { combineDateTimeWIB } from '@/lib/utils';

describe('combineDateTimeWIB', () => {
  it('combines date and time into WIB offset ISO string', () => {
    expect(combineDateTimeWIB('2026-07-10', '14:30')).toBe('2026-07-10T14:30:00+07:00');
  });

  it('defaults time to 00:00 when time is empty', () => {
    expect(combineDateTimeWIB('2026-07-10', '')).toBe('2026-07-10T00:00:00+07:00');
  });
});
