export interface ParsedLine {
  date: string; // YYYY-MM-DD
  type: 'income' | 'expense';
  amount: number;
  description: string;
  accountName: string | null;
  error: string | null;
  raw: string;
}

function parseAmountShorthand(raw: string): number {
  const cleaned = raw.toLowerCase().replace(/[^0-9.,rbjt]/g, '');
  if (cleaned.endsWith('jt')) return parseFloat(cleaned.replace('jt', '').replace(',', '.')) * 1_000_000;
  if (cleaned.endsWith('rb')) return parseFloat(cleaned.replace('rb', '').replace(',', '.')) * 1_000;
  return parseFloat(cleaned.replace(/\./g, '').replace(',', '.')) || 0;
}

export function parseBulkInput(text: string, currentYear: number = new Date().getFullYear()): ParsedLine[] {
  return text
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .map(raw => {
      try {
        // Format: DD/MM nominal description [account_name]
        // Prefix + = income, default = expense
        const isIncome = raw.startsWith('+');
        const cleaned = isIncome ? raw.slice(1).trim() : raw;

        // Extract account name if present: [account]
        let accountName: string | null = null;
        let remaining = cleaned;
        const accountMatch = remaining.match(/\[([^\]]+)\]\s*$/);
        if (accountMatch) {
          accountName = accountMatch[1];
          remaining = remaining.slice(0, accountMatch.index).trim();
        }

        // Parse: DD/MM amount description
        const match = remaining.match(/^(\d{1,2})\/(\d{1,2})\s+(\S+)\s+(.+)$/);
        if (!match) {
          return { date: '', type: 'expense' as const, amount: 0, description: '', accountName: null, error: 'Format tidak valid. Gunakan: DD/MM nominal deskripsi', raw };
        }

        const [, day, month, amountStr, description] = match;
        const amount = parseAmountShorthand(amountStr);

        if (amount <= 0) {
          return { date: '', type: 'expense' as const, amount: 0, description: '', accountName: null, error: `Nominal tidak valid: ${amountStr}`, raw };
        }

        const dateStr = `${currentYear}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;

        return {
          date: dateStr,
          type: isIncome ? 'income' as const : 'expense' as const,
          amount,
          description: description.trim(),
          accountName,
          error: null,
          raw,
        };
      } catch {
        return { date: '', type: 'expense' as const, amount: 0, description: '', accountName: null, error: 'Gagal parse baris ini', raw };
      }
    });
}
