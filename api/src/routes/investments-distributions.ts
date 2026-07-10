import type { FastifyInstance } from 'fastify';
import { requireUser } from '../lib/supabase.js';
import { generateCouponSchedule } from '../lib/coupon-schedule.js';

export default async function plugin(app: FastifyInstance) {
  app.get('/api/investments/distributions', async (request, reply) => {
    const { supabase, unauthorized } = await requireUser(request);
    if (unauthorized || !supabase) return reply.code(401).send({ error: 'Unauthorized' });

    const query = request.query as { instrument_id?: string; status?: string };
    let q = (supabase as any)
      .from('distributions')
      .select('*, instruments(name)')
      .order('period', { ascending: false });
    if (query.instrument_id) q = q.eq('instrument_id', query.instrument_id);
    if (query.status) q = q.eq('status', query.status);

    const { data, error } = await q;
    if (error) return reply.code(500).send({ error: error.message });
    return data ?? [];
  });

  // Regenerasi jadwal kupon obligasi (ORI/SR/SBR/ST) sebagai projected. Confirmed TIDAK
  // pernah disentuh (SPEC v2 §4.5) -- proyeksi cuma dipakai sampai user confirm manual.
  app.post('/api/investments/distributions/generate', async (request, reply) => {
    const { supabase, unauthorized } = await requireUser(request);
    if (unauthorized || !supabase) return reply.code(401).send({ error: 'Unauthorized' });

    const body = request.body as any;
    const instrumentId = body?.instrument_id;
    if (!instrumentId) return reply.code(400).send({ error: 'instrument_id wajib diisi' });

    const { data: instrument, error: instError } = await (supabase as any)
      .from('instruments')
      .select('type, coupon_fixed_pct, coupon_pay_day, maturity_date, holdings(quantity, acquired_at)')
      .eq('id', instrumentId)
      .single();
    if (instError || !instrument) return reply.code(404).send({ error: 'Instrumen tidak ditemukan' });
    if (instrument.type !== 'obligasi_tradable' && instrument.type !== 'obligasi_nontradable') {
      return reply.code(400).send({ error: 'Jadwal kupon cuma berlaku untuk obligasi' });
    }

    const holdingRows: Array<{ quantity: string | number; acquired_at: string | null }> = Array.isArray(instrument.holdings)
      ? instrument.holdings
      : instrument.holdings
        ? [instrument.holdings]
        : [];
    const totalQuantity = holdingRows.reduce((sum, h) => sum + Number(h.quantity ?? 0), 0);
    const acquiredDates = holdingRows.map((h) => h.acquired_at).filter((d): d is string => !!d).sort();
    if (totalQuantity <= 0 || acquiredDates.length === 0) {
      return reply.code(400).send({ error: 'Belum ada holdings aktif untuk instrumen ini' });
    }

    const { data: couponRatesRaw } = await (supabase as any)
      .from('coupon_rates')
      .select('effective_from, effective_to, rate_pct')
      .eq('instrument_id', instrumentId);

    const from = typeof body?.from === 'string' ? body.from : acquiredDates[0];
    const to = typeof body?.to === 'string' ? body.to : instrument.maturity_date;

    const schedule = generateCouponSchedule({
      instrumentType: instrument.type,
      couponFixedPct: instrument.coupon_fixed_pct,
      couponPayDay: instrument.coupon_pay_day,
      acquiredAt: acquiredDates[0],
      maturityDate: instrument.maturity_date,
      totalQuantity,
      couponRates: (couponRatesRaw ?? []).map((r: any) => ({
        effectiveFrom: r.effective_from,
        effectiveTo: r.effective_to,
        ratePct: Number(r.rate_pct),
      })),
      from,
      to,
    });

    const inserted = [];
    for (const c of schedule) {
      // Cuma insert kalau belum ada row projected/confirmed di periode itu -- confirmed
      // TIDAK PERNAH ditimpa ulang oleh proyeksi baru.
      const { data: existing } = await (supabase as any)
        .from('distributions')
        .select('id, status')
        .eq('instrument_id', instrumentId)
        .eq('kind', 'coupon')
        .eq('period', c.period)
        .maybeSingle();

      if (existing) continue;

      const { data: row, error: insertError } = await (supabase as any)
        .from('distributions')
        .insert({
          instrument_id: instrumentId,
          kind: 'coupon',
          period: c.period,
          gross_amount: c.grossAmount,
          tax_withheld: c.taxWithheld,
          net_amount: c.netAmount,
          status: 'projected',
          needs_review: c.needsReview,
        })
        .select()
        .single();

      if (insertError) return reply.code(500).send({ error: insertError.message });
      inserted.push(row);
    }

    return { success: true, data: inserted };
  });

  // projected -> confirmed. Satu-satunya jalan bikin income transaction dari kupon/dividen.
  app.post('/api/investments/distributions/:id/confirm', async (request, reply) => {
    const { supabase, user, unauthorized } = await requireUser(request);
    if (unauthorized || !supabase) return reply.code(401).send({ error: 'Unauthorized' });

    const { id } = request.params as { id: string };
    const body = request.body as any;
    const toAccountId = body?.to_account_id;
    if (!toAccountId) return reply.code(400).send({ error: 'to_account_id wajib diisi (rekening penerima)' });

    const { data, error } = await (supabase as any).rpc('confirm_distribution', {
      p_distribution_id: id,
      p_to_account_id: toAccountId,
      p_user_id: user.id,
      p_net_amount_override: body?.net_amount_override != null ? Number(body.net_amount_override) : null,
      p_paid_at: typeof body?.paid_at === 'string' ? body.paid_at : undefined,
    });

    if (error) return reply.code(500).send({ error: error.message });
    const row = data?.[0];
    return { success: true, data: { transaction_id: row?.transaction_id, net_amount: Number(row?.net_amount) } };
  });
}
