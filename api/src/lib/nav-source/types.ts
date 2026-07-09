// nav & asOf bertahan sebagai string (bukan number/Date) — hindari floating point
// drift dan pergeseran timezone saat lewat JS sebelum masuk kolom numeric/date di Postgres.
export interface FetchedNav {
  nav: string;
  asOf: string; // 'YYYY-MM-DD'
}

export interface NavSource {
  fetchNav(bareksaId: number, slug: string): Promise<FetchedNav>;
}
