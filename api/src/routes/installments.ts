import type { FastifyInstance } from 'fastify';
import { requireUser } from '../lib/supabase.js';

export default async function plugin(app: FastifyInstance) {
  app.post('/api/installments', async (request, reply) => {
    const { supabase, user, unauthorized } = await requireUser(request);
    if (unauthorized || !supabase) return reply.code(401).send({ error: 'Unauthorized' });

    const body = request.body as any;
    const { name, monthly_amount, total_months, start_date, due_day, account_id, category_id } = body;

    if (!name || !monthly_amount || !total_months) {
      return reply.code(400).send({ error: 'name, monthly_amount, total_months wajib diisi' });
    }

    const { data: installment, error } = await (supabase as any)
      .from('installments')
      .insert({
        name,
        monthly_amount,
        total_months,
        paid_months: 0,
        start_date: start_date || new Date().toISOString().split('T')[0],
        due_day: due_day || null,
        account_id: account_id || null,
        category_id: category_id || null,
        status: 'active',
        user_id: user.id,
      })
      .select()
      .single();

    if (error) return reply.code(500).send({ error: error.message });

    const months = Array.from({ length: total_months }, (_: unknown, i: number) => ({
      installment_id: installment.id,
      month_number: i + 1,
      amount: monthly_amount,
      is_paid: false,
    }));

    await (supabase as any).from('installment_months').insert(months);

    return reply.code(201).send(installment);
  });
}
