export type MonthPayload = {
  month_number: number;
  amount: number;
  is_paid: boolean;
};

export function parseMonths(raw: unknown): MonthPayload[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error('Detail nominal bulanan wajib diisi');
  }

  const parsed = (raw as any[]).map((row, idx) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      throw new Error(`Baris bulan ke-${idx + 1} tidak valid`);
    }

    const monthNumber = Number(row.month_number);
    const amount = Number(row.amount);
    const isPaid = Boolean(row.is_paid);

    if (!Number.isInteger(monthNumber) || monthNumber < 1) {
      throw new Error(`month_number pada baris ke-${idx + 1} tidak valid`);
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error(`amount pada baris ke-${idx + 1} harus lebih dari 0`);
    }

    return { month_number: monthNumber, amount, is_paid: isPaid };
  });

  parsed.sort((a, b) => a.month_number - b.month_number);

  for (let i = 0; i < parsed.length; i++) {
    if (parsed[i].month_number !== i + 1) {
      throw new Error('Urutan bulan harus berurutan mulai dari 1');
    }
  }

  return parsed;
}
