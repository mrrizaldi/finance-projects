import type { FastifyInstance } from 'fastify';
import { requireUser } from '../lib/supabase.js';

export default async function plugin(app: FastifyInstance) {
  app.post('/api/installments/:id/append', async (request, reply) => {
    const { supabase, unauthorized } = await requireUser(request);
    if (unauthorized || !supabase) return reply.code(401).send({ error: 'Unauthorized' });

    const { id } = request.params as { id: string };
    const { months_to_add, amount_per_month } = request.body as any;

    if (!months_to_add || !amount_per_month) {
      return reply.code(400).send({ error: 'months_to_add dan amount_per_month wajib diisi' });
    }

    const { data: installment, error } = await (supabase as any)
      .from('installments').select('total_months').eq('id', id).single();

    if (error || !installment) return reply.code(404).send({ error: 'Cicilan tidak ditemukan' });

    const currentTotal = installment.total_months;
    const newTotal = currentTotal + months_to_add;

    const newMonths = Array.from({ length: months_to_add }, (_: unknown, i: number) => ({
      installment_id: id,
      month_number: currentTotal + i + 1,
      amount: amount_per_month,
      is_paid: false,
    }));

    await (supabase as any).from('installment_months').insert(newMonths);
    await (supabase as any).from('installments').update({ total_months: newTotal, status: 'active' }).eq('id', id);

    return { new_total: newTotal, months_added: months_to_add };
  });
}
