import type { FastifyInstance } from 'fastify';
import { requireUser } from '../lib/supabase.js';

const QUOTE_CONVENTION_BY_TYPE: Record<string, string> = {
  reksadana: 'nav_per_unit',
  saham: 'price_per_share',
  obligasi_tradable: 'percent_of_par',
  obligasi_nontradable: 'par_only',
};

export default async function plugin(app: FastifyInstance) {
  // Valuasi semua instrument type sekaligus (dashboard "Instrumen Lain") -- lihat
  // get_all_instruments_value (migration 032), pasangan SQL dari valueOf() TS.
  app.get('/api/investments/instruments/value', async (request, reply) => {
    const { supabase, unauthorized } = await requireUser(request);
    if (unauthorized || !supabase) return reply.code(401).send({ error: 'Unauthorized' });

    const { data, error } = await (supabase as any).rpc('get_all_instruments_value');
    if (error) return reply.code(500).send({ error: error.message });
    return (data ?? []).filter((row: any) => row.type !== 'reksadana');
  });

  // Instrumen selain reksadana (yang punya endpoint /funds sendiri dari v1) -- saham & obligasi.
  app.get('/api/investments/instruments', async (request, reply) => {
    const { supabase, unauthorized } = await requireUser(request);
    if (unauthorized || !supabase) return reply.code(401).send({ error: 'Unauthorized' });

    const query = request.query as { type?: string };
    let q = (supabase as any)
      .from('instruments')
      .select('id, name, type, quote_convention, ticker, sbn_series, maturity_date, coupon_pay_day, coupon_fixed_pct, account_id, is_active')
      .eq('is_active', true)
      .neq('type', 'reksadana')
      .order('name');

    if (query.type) q = q.eq('type', query.type);

    const { data, error } = await q;
    if (error) return reply.code(500).send({ error: error.message });
    return data ?? [];
  });

  app.post('/api/investments/instruments', async (request, reply) => {
    const { supabase, user, unauthorized } = await requireUser(request);
    if (unauthorized || !supabase) return reply.code(401).send({ error: 'Unauthorized' });

    const body = request.body as any;
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    const type = body?.type;
    const accountId = body?.account_id;

    if (!name) return reply.code(400).send({ error: 'name wajib diisi' });
    if (!accountId) return reply.code(400).send({ error: 'account_id wajib diisi' });
    if (!QUOTE_CONVENTION_BY_TYPE[type] || type === 'reksadana') {
      return reply.code(400).send({ error: 'type harus salah satu: saham, obligasi_tradable, obligasi_nontradable' });
    }

    const row: Record<string, any> = {
      name,
      account_id: accountId,
      type,
      quote_convention: QUOTE_CONVENTION_BY_TYPE[type],
      user_id: user.id,
    };

    if (type === 'saham') {
      const ticker = typeof body?.ticker === 'string' ? body.ticker.trim().toUpperCase() : '';
      if (!ticker) return reply.code(400).send({ error: 'ticker wajib diisi untuk saham (tanpa .JK, mis. BBCA)' });
      row.ticker = ticker;
    }

    if (type === 'obligasi_tradable' || type === 'obligasi_nontradable') {
      const sbnSeries = typeof body?.sbn_series === 'string' ? body.sbn_series.trim().toUpperCase() : '';
      const maturityDate = typeof body?.maturity_date === 'string' ? body.maturity_date : '';
      const couponPayDay = Number(body?.coupon_pay_day);

      if (!sbnSeries) return reply.code(400).send({ error: 'sbn_series wajib diisi, mis. ORI029T3' });
      if (!maturityDate) return reply.code(400).send({ error: 'maturity_date wajib diisi (YYYY-MM-DD)' });
      if (!Number.isInteger(couponPayDay) || couponPayDay < 1 || couponPayDay > 28) {
        return reply.code(400).send({ error: 'coupon_pay_day wajib angka 1-28' });
      }

      row.sbn_series = sbnSeries;
      row.maturity_date = maturityDate;
      row.coupon_pay_day = couponPayDay;

      if (type === 'obligasi_tradable') {
        const couponFixedPct = Number(body?.coupon_fixed_pct);
        if (!Number.isFinite(couponFixedPct) || couponFixedPct <= 0) {
          return reply.code(400).send({ error: 'coupon_fixed_pct wajib diisi untuk ORI/SR (kupon fixed)' });
        }
        row.coupon_fixed_pct = couponFixedPct;
      }
      // obligasi_nontradable (SBR/ST): coupon_fixed_pct SENGAJA tidak diisi -- floating, lihat coupon_rates.
    }

    const { data, error } = await (supabase as any).from('instruments').insert(row).select().single();
    if (error) return reply.code(500).send({ error: error.message });
    return { success: true, data };
  });
}
