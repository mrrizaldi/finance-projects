-- Fase 4/5 dashboard support: read-model generik utk SEMUA instrument type (get_portfolio_value
-- v1 sengaja tetap reksadana-only, lihat 029). CASE valueOf di sini harus tetap sinkron dengan
-- api/src/lib/instrument-valuation.ts (valueOf) -- dua implementasi (SQL utk read-model,
-- TS utk job revaluasi), sengaja gak digabung karena beda call surface, tapi aturannya sama:
-- nav_per_unit/price_per_share -> quantity*value; percent_of_par -> quantity*value/100;
-- par_only -> quantity*1.0, TIDAK PERNAH lookup price_history.

CREATE OR REPLACE FUNCTION public.get_all_instruments_value()
RETURNS TABLE (
  instrument_id UUID,
  name TEXT,
  type TEXT,
  quote_convention TEXT,
  account_id UUID,
  account_name TEXT,
  quantity NUMERIC,
  latest_price NUMERIC,
  price_date DATE,
  value NUMERIC
) AS $$
  SELECT
    i.id,
    i.name,
    i.type,
    i.quote_convention,
    i.account_id,
    a.name,
    COALESCE(SUM(h.quantity), 0),
    p.value,
    p.date,
    CASE i.quote_convention
      WHEN 'par_only' THEN COALESCE(SUM(h.quantity), 0) * 1.0
      WHEN 'percent_of_par' THEN COALESCE(SUM(h.quantity), 0) * COALESCE(p.value, 0) / 100
      ELSE COALESCE(SUM(h.quantity), 0) * COALESCE(p.value, 0)
    END
  FROM public.instruments i
  JOIN public.accounts a ON a.id = i.account_id
  LEFT JOIN public.holdings h ON h.instrument_id = i.id
  LEFT JOIN LATERAL (
    SELECT value, date FROM public.price_history
    WHERE instrument_id = i.id
    ORDER BY date DESC
    LIMIT 1
  ) p ON true
  WHERE i.is_active = true
  GROUP BY i.id, i.name, i.type, i.quote_convention, i.account_id, a.name, p.value, p.date
  ORDER BY i.name;
$$ LANGUAGE sql STABLE;
