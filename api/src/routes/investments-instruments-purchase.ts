import type { FastifyInstance } from 'fastify';
import { requireUser } from '../lib/supabase.js';
import { randomUUID } from 'node:crypto';

export default async function plugin(app: FastifyInstance) {
  // Generalisasi record_fund_purchase (v1, reksadana-only) -- dipakai saham & obligasi.
  // order_ref: SBR/ST wajib unik per pesanan (early redemption per-order, SPEC v2 §4.2).
  // Saham (weighted average) pakai 1 konstanta tetap biar ke-merge jadi satu holdings row.
  app.post('/api/investments/instruments/purchase', async (request, reply) => {
    try {
      const { supabase, user, unauthorized } = await requireUser(request);
      if (unauthorized || !supabase) return reply.code(401).send({ error: 'Unauthorized' });

      const body = request.body as any;
      const fromAccountId = body?.from_account_id;
      const instrumentId = body?.instrument_id;
      const amountIdr = Number(body?.amount_idr);
      const quantity = Number(body?.quantity);

      if (!fromAccountId || !instrumentId) {
        return reply.code(400).send({ error: 'from_account_id dan instrument_id wajib diisi' });
      }
      if (!Number.isFinite(amountIdr) || amountIdr <= 0) {
        return reply.code(400).send({ error: 'amount_idr harus angka > 0' });
      }
      if (!Number.isFinite(quantity) || quantity <= 0) {
        return reply.code(400).send({ error: 'quantity harus angka > 0' });
      }

      const { data: instrument, error: instrumentError } = await (supabase as any)
        .from('instruments')
        .select('type')
        .eq('id', instrumentId)
        .single();
      if (instrumentError || !instrument) return reply.code(404).send({ error: 'Instrumen tidak ditemukan' });

      // SBR/ST: order_ref unik per pesanan (client boleh kirim label sendiri). Selain itu
      // (saham weighted-average, ORI/SR): satu konstanta tetap per instrumen.
      const orderRef =
        instrument.type === 'obligasi_nontradable'
          ? typeof body?.order_ref === 'string' && body.order_ref.trim() ? body.order_ref.trim() : randomUUID()
          : 'weighted-avg';

      const { data, error } = await (supabase as any).rpc('record_instrument_purchase', {
        p_from_account_id: fromAccountId,
        p_instrument_id: instrumentId,
        p_amount_idr: amountIdr,
        p_quantity: quantity,
        p_user_id: user.id,
        p_order_ref: orderRef,
        p_date: typeof body?.date === 'string' ? body.date : undefined,
        p_category_id: typeof body?.category_id === 'string' ? body.category_id : null,
      });

      if (error) return reply.code(500).send({ error: error.message });
      const row = data?.[0];
      return { success: true, data: { transaction_id: row?.transaction_id, quantity_after: Number(row?.quantity_after) } };
    } catch (error: any) {
      return reply.code(500).send({ error: error?.message || 'Internal server error' });
    }
  });
}
