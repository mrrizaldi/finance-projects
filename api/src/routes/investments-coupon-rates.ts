import type { FastifyInstance } from 'fastify';
import { requireUser } from '../lib/supabase.js';

export default async function plugin(app: FastifyInstance) {
  // Kupon SBR/ST floating, reset tiap kuartal -- input manual dari DJPPR
  // ("Data Historis Tingkat Kupon SBR dan Tingkat Imbalan ST"), belum ada parser otomatis.
  app.get('/api/investments/coupon-rates', async (request, reply) => {
    const { supabase, unauthorized } = await requireUser(request);
    if (unauthorized || !supabase) return reply.code(401).send({ error: 'Unauthorized' });

    const query = request.query as { instrument_id?: string };
    let q = (supabase as any).from('coupon_rates').select('*').order('effective_from', { ascending: false });
    if (query.instrument_id) q = q.eq('instrument_id', query.instrument_id);

    const { data, error } = await q;
    if (error) return reply.code(500).send({ error: error.message });
    return data ?? [];
  });

  app.post('/api/investments/coupon-rates', async (request, reply) => {
    const { supabase, unauthorized } = await requireUser(request);
    if (unauthorized || !supabase) return reply.code(401).send({ error: 'Unauthorized' });

    const body = request.body as any;
    const instrumentId = body?.instrument_id;
    const effectiveFrom = typeof body?.effective_from === 'string' ? body.effective_from : '';
    const ratePct = Number(body?.rate_pct);

    if (!instrumentId) return reply.code(400).send({ error: 'instrument_id wajib diisi' });
    if (!effectiveFrom) return reply.code(400).send({ error: 'effective_from wajib diisi (YYYY-MM-DD)' });
    if (!Number.isFinite(ratePct) || ratePct <= 0) return reply.code(400).send({ error: 'rate_pct harus angka > 0' });

    // Tutup periode sebelumnya yang masih open (effective_to NULL) sehari sebelum rate baru mulai.
    await (supabase as any)
      .from('coupon_rates')
      .update({ effective_to: shiftDay(effectiveFrom, -1) })
      .eq('instrument_id', instrumentId)
      .is('effective_to', null);

    const { data, error } = await (supabase as any)
      .from('coupon_rates')
      .insert({ instrument_id: instrumentId, effective_from: effectiveFrom, rate_pct: ratePct, source: 'manual' })
      .select()
      .single();

    if (error) return reply.code(500).send({ error: error.message });
    return { success: true, data };
  });
}

function shiftDay(iso: string, delta: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}
