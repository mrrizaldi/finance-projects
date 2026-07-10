export type QuoteConvention = 'nav_per_unit' | 'price_per_share' | 'percent_of_par' | 'par_only';

/**
 * Satu-satunya tempat quantity*harga boleh dikali (SPEC v2 §5.1). Jangan pernah
 * kalikan holdings.quantity * price_history.value di luar fungsi ini — semantiknya
 * beda per quote_convention dan par_only bahkan gak pernah lookup harga sama sekali.
 *
 * Pakai clean price (tanpa accrued interest) — accrued interest sengaja dilewat,
 * kompleksitasnya gak sepadan untuk personal tracker dan kupon udah di-track lewat
 * `distributions`, jadi accrued cuma bikin double-count parsial.
 */
export function valueOf(
  quoteConvention: QuoteConvention,
  quantity: number,
  latestPriceValue: number | null
): number {
  switch (quoteConvention) {
    case 'nav_per_unit':
    case 'price_per_share':
      return latestPriceValue == null ? 0 : quantity * latestPriceValue;
    case 'percent_of_par':
      return latestPriceValue == null ? 0 : quantity * (latestPriceValue / 100);
    case 'par_only':
      return quantity * 1.0;
  }
}
