const USER_AGENT =
  'Mozilla/5.0 (compatible; finance-project-nav-tracker/1.0; personal use; contact: muhammadrafiriz23@gmail.com)';

const CATALOG_URL = 'https://www.bareksa.com/id/data/reksadana/daftar';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // katalog fund gak berubah cepet, cache sehari

export interface CatalogEntry {
  name: string;
  bareksaId: number;
  bareksaSlug: string;
  code: string;
  managerName: string;
}

// Sama persis logic slugify yang dipake bareksa.com sendiri buat generate link produk:
// namaProduct.toLowerCase().replace(/[^\w ]+/g,'').replace(/ +/g,'-')
export function slugify(name: string): string {
  return name.toLowerCase().replace(/[^\w ]+/g, '').replace(/ +/g, '-');
}

let cache: { entries: CatalogEntry[]; fetchedAt: number } | null = null;

async function fetchCatalog(): Promise<CatalogEntry[]> {
  const res = await fetch(CATALOG_URL, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`Bareksa HTTP ${res.status} untuk ${CATALOG_URL}`);

  const html = await res.text();
  const match = html.match(/var data = '(\[.*?\])';/s);
  if (!match) throw new Error('Katalog Bareksa gak ketemu — struktur halaman berubah?');

  const raw = match[1].replace(/\\\//g, '/');
  const rows = JSON.parse(raw) as Array<{ pid: string; name: string; code: string; im?: { name?: string } }>;

  return rows.map((r) => ({
    name: r.name,
    bareksaId: Number(r.pid),
    bareksaSlug: slugify(r.name),
    code: r.code,
    managerName: r.im?.name ?? '',
  }));
}

async function getCatalog(): Promise<CatalogEntry[]> {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) return cache.entries;

  // Bareksa sesekali balikin 502 transient — retry sebelum nyerah.
  const maxAttempts = 3;
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const entries = await fetchCatalog();
      cache = { entries, fetchedAt: Date.now() };
      return entries;
    } catch (error) {
      lastError = error;
      if (attempt < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 2 ** attempt * 500));
      }
    }
  }

  if (cache) return cache.entries; // stale cache lebih baik daripada error total
  throw lastError;
}

export async function searchFunds(query: string, limit = 20): Promise<CatalogEntry[]> {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];

  const catalog = await getCatalog();
  return catalog.filter((e) => e.name.toLowerCase().includes(q) || e.code.toLowerCase().includes(q)).slice(0, limit);
}
