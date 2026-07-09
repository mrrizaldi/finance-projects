import * as cheerio from 'cheerio';
import type { NavSource, FetchedNav } from './types.js';

const USER_AGENT =
  'Mozilla/5.0 (compatible; finance-project-nav-tracker/1.0; personal use; contact: muhammadrafiriz23@gmail.com)';

const MONTHS_ID: Record<string, number> = {
  januari: 0, februari: 1, maret: 2, april: 3, mei: 4, juni: 5,
  juli: 6, agustus: 7, september: 8, oktober: 9, november: 10, desember: 11,
};

// "1.234.567,89" -> "1234567.89" (titik = ribuan, koma = desimal)
export function parseIndonesianNumber(text: string): string {
  return text.trim().replace(/\./g, '').replace(',', '.');
}

// "Kamis, 09 Juli 2026 | 12:35" -> "2026-07-09"
export function parseIndonesianDate(text: string): string {
  const match = text.match(/(\d{1,2})\s+(\w+)\s+(\d{4})/);
  if (!match) throw new Error(`Gagal parse tanggal Bareksa: "${text}"`);
  const [, day, monthName, year] = match;
  const month = MONTHS_ID[monthName.toLowerCase()];
  if (month === undefined) throw new Error(`Nama bulan gak dikenal: "${monthName}"`);
  return `${year}-${String(month + 1).padStart(2, '0')}-${day.padStart(2, '0')}`;
}

async function fetchOnce(bareksaId: number, slug: string): Promise<FetchedNav> {
  const url = `https://www.bareksa.com/id/data/reksadana/${bareksaId}/${slug}`;
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`Bareksa HTTP ${res.status} untuk ${url}`);

  const html = await res.text();
  const $ = cheerio.load(html);

  const heading = $('h2').filter((_, el) => $(el).text().trim() === 'Nilai Aktiva Bersih/Unit').first();
  if (heading.length === 0) throw new Error('Heading "Nilai Aktiva Bersih/Unit" gak ketemu — struktur HTML Bareksa berubah?');

  const navText = heading.parent().find('.number.vm .fS40').first().text().trim();
  if (!navText) throw new Error('Elemen NAV (.number.vm .fS40) gak ketemu di section NAB per unit');

  const nav = parseIndonesianNumber(navText);
  if (!(Number(nav) > 0)) throw new Error(`NAV hasil parse gak valid: "${navText}" -> "${nav}"`);

  const dateText = $('.dateHeader .time').first().text().trim();
  const asOf = dateText ? parseIndonesianDate(dateText) : new Date().toISOString().slice(0, 10);

  return { nav, asOf };
}

async function fetchNav(bareksaId: number, slug: string): Promise<FetchedNav> {
  const maxAttempts = 3;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fetchOnce(bareksaId, slug);
    } catch (error) {
      lastError = error;
      if (attempt < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 2 ** attempt * 500));
      }
    }
  }

  throw lastError;
}

export const bareksaSource: NavSource = { fetchNav };
