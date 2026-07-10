const USER_AGENT =
  'Mozilla/5.0 (compatible; finance-project-nav-tracker/1.0; personal use; contact: muhammadrafiriz23@gmail.com)';
const MAX_ATTEMPTS = 3;

export interface YahooSplitEvent {
  date: string;
  numerator: number;
  denominator: number;
}

export interface YahooDividendEvent {
  date: string;
  amountPerShare: number;
}

export interface YahooQuote {
  closePrice: number;
  asOf: string;
  splits: YahooSplitEvent[];
  dividends: YahooDividendEvent[];
}

export class YahooRateLimitError extends Error {}

/**
 * Yahoo /v8/finance/chart itu unofficial & reverse-engineered -- endpoint bisa berubah
 * tanpa notice (SPEC v2 §1). Sengaja dipakai varian /v8/chart (bukan /v7/quote) karena
 * historically TIDAK minta cookie/crumb. Perlakukan sebagai sumber fragile: struktur
 * berubah -> error jelas di sini, jangan diam-diam salah parse.
 */
export function parseYahooChartResponse(json: any): YahooQuote {
  const result = json?.chart?.result?.[0];
  if (!result) {
    throw new Error('Yahoo chart response kosong — ticker gak ketemu atau struktur API berubah?');
  }

  const timestamps: number[] = result.timestamp ?? [];
  const closes: Array<number | null> = result.indicators?.quote?.[0]?.close ?? [];

  let idx = closes.length - 1;
  while (idx >= 0 && closes[idx] == null) idx -= 1;
  if (idx < 0) {
    throw new Error('Yahoo gak punya data close yang valid di rentang ini');
  }

  const closePrice = closes[idx] as number;
  const asOf = new Date(timestamps[idx] * 1000).toISOString().slice(0, 10);

  const splits: YahooSplitEvent[] = Object.values(result.events?.splits ?? {}).map((s: any) => ({
    date: new Date(s.date * 1000).toISOString().slice(0, 10),
    numerator: s.numerator,
    denominator: s.denominator,
  }));

  const dividends: YahooDividendEvent[] = Object.values(result.events?.dividends ?? {}).map((d: any) => ({
    date: new Date(d.date * 1000).toISOString().slice(0, 10),
    amountPerShare: d.amount,
  }));

  return { closePrice, asOf, splits, dividends };
}

async function fetchOnce(ticker: string): Promise<YahooQuote> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}.JK?events=div,split&range=3mo&interval=1d`;
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });

  if (res.status === 429) throw new YahooRateLimitError(`Yahoo rate limit (429) untuk ${ticker}`);
  if (!res.ok) throw new Error(`Yahoo HTTP ${res.status} untuk ${ticker}`);

  return parseYahooChartResponse(await res.json());
}

export async function fetchYahooQuote(ticker: string): Promise<YahooQuote> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await fetchOnce(ticker);
    } catch (error) {
      lastError = error;
      if (attempt < MAX_ATTEMPTS) {
        await new Promise((resolve) => setTimeout(resolve, 2 ** attempt * 1000));
      }
    }
  }

  throw lastError;
}
