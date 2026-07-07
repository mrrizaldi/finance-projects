import type { FastifyInstance } from 'fastify';
import { requireUser } from '../lib/supabase.js';

export default async function plugin(app: FastifyInstance) {
  app.post('/api/installments/:id/pay', async (request, reply) => {
    const { supabase, unauthorized } = await requireUser(request);
    if (unauthorized || !supabase) return reply.code(401).send({ error: 'Unauthorized' });

    const { id } = request.params as { id: string };
    const { transaction_id, months_count = 1 } = request.body as any;

    if (!transaction_id) return reply.code(400).send({ error: 'transaction_id diperlukan' });

    const count = Math.max(1, parseInt(String(months_count)) || 1);

    const { data: installment, error: fetchError } = await (supabase as any)
      .from('installments').select('*, installment_months(*)').eq('id', id).single();

    if (fetchError || !installment) return reply.code(404).send({ error: 'Cicilan tidak ditemukan' });

    const unpaidMonths = (installment.installment_months ?? [])
      .filter((m: { is_paid: boolean }) => !m.is_paid)
      .sort((a: { month_number: number }, b: { month_number: number }) => a.month_number - b.month_number)
      .slice(0, count);

    if (unpaidMonths.length === 0) return reply.code(400).send({ error: 'Semua bulan sudah dibayar' });

    const { data: tx, error: txError } = await (supabase as any)
      .from('transactions').select('id, amount, transaction_date, description').eq('id', transaction_id).single();

    if (txError || !tx) return reply.code(404).send({ error: 'Transaksi tidak ditemukan' });

    const txAmount = Number(tx.amount);
    const originalAmount = Number(unpaidMonths[0].amount);
    const paidDate = tx.transaction_date.split('T')[0].split(' ')[0];

    for (const month of unpaidMonths) {
      const monthAmount = Number(month.amount);
      await (supabase as any).from('installment_months').update({
        is_paid: true,
        paid_date: paidDate,
        transaction_id: tx.id,
        ...(unpaidMonths.length === 1 && txAmount !== monthAmount ? { amount: txAmount } : {}),
      }).eq('id', month.id);
    }

    await (supabase as any).from('installments')
      .update({ paid_months: installment.paid_months + unpaidMonths.length })
      .eq('id', installment.id);

    await (supabase as any).from('transactions').update({ installment_id: installment.id }).eq('id', tx.id);

    return {
      paid: unpaidMonths.length,
      amount_used: txAmount,
      original_amount: originalAmount,
      amount_synced: unpaidMonths.length === 1 && txAmount !== originalAmount,
      months_paid: unpaidMonths.map((m: { month_number: number }) => m.month_number),
    };
  });
}
