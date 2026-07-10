import * as cheerio from 'cheerio';
import { parseIndonesianNumber } from './bareksa.js';

const USER_AGENT =
  'Mozilla/5.0 (compatible; finance-project-nav-tracker/1.0; personal use; contact: muhammadrafiriz23@gmail.com)';
const URL = 'https://www.phei.co.id/Data/HPW-dan-Imbal-Hasil';

const PRICE_MIN = 50; // % of par -- di luar ini kemungkinan parse salah, bukan harga riil
const PRICE_MAX = 150;
const DEVIATION_THRESHOLD = 0.05; // 5% vs kemarin -- PHEI kasih dua-duanya di 1 halaman, gak perlu lookup DB

export interface PheiQuote {
  series: string;
  todayPricePct: number;
  yesterdayPricePct: number;
  couponPct: number;
  needsReview: boolean;
}

/**
 * Parse tabel "Retail Series" (ORI + SR sekaligus, 1 fetch = semua seri). Struktur
 * terisolasi di modul ini -- kalau phei.co.id ubah HTML, cuma di sini yang perlu disentuh.
 */
export function parseRetailSeriesTable(html: string): PheiQuote[] {
  const $ = cheerio.load(html);
  const heading = $('h6').filter((_, el) => $(el).text().trim() === 'Retail Series').first();
  if (heading.length === 0) {
    throw new Error('Heading "Retail Series" gak ketemu — struktur HTML PHEI berubah?');
  }

  const table = heading.closest('.col-md-6').find('table').first();
  if (table.length === 0) {
    throw new Error('Tabel di bawah "Retail Series" gak ketemu — struktur HTML PHEI berubah?');
  }

  const results: PheiQuote[] = [];

  table.find('tr').each((i, row) => {
    if (i === 0) return; // header row (th, bukan td)

    const cells = $(row).find('td');
    const series = $(cells[1]).text().trim();
    if (!series) return;

    const todayPricePct = Number(parseIndonesianNumber($(cells[4]).text()));
    const yesterdayPricePct = Number(parseIndonesianNumber($(cells[6]).text()));
    const couponPct = Number(parseIndonesianNumber($(cells[7]).text()));

    if (!(todayPricePct >= PRICE_MIN && todayPricePct <= PRICE_MAX)) {
      // di luar rentang wajar harga obligasi ritel -> kemungkinan parse salah, skip
      return;
    }

    const deviation =
      yesterdayPricePct > 0 ? Math.abs(todayPricePct - yesterdayPricePct) / yesterdayPricePct : 0;

    results.push({
      series,
      todayPricePct,
      yesterdayPricePct,
      couponPct,
      needsReview: deviation > DEVIATION_THRESHOLD,
    });
  });

  return results;
}

export async function fetchPheiRetailSeries(): Promise<PheiQuote[]> {
  const res = await fetch(URL, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`PHEI HTTP ${res.status}`);
  return parseRetailSeriesTable(await res.text());
}
