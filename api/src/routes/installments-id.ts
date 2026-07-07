import type { FastifyInstance } from 'fastify';
import { requireUser } from '../lib/supabase.js';
import { parseMonths, type MonthPayload } from '../lib/installment-utils.js';

function normalizeNullableString(value: unknown, field: string) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  if (typeof value !== 'string') throw new Error(`${field} harus berupa string`);
  return value;
}

export default async function plugin(app: FastifyInstance) {
  app.get('/api/installments/:id', async (request, reply) => {
    try {
      const { supabase, unauthorized } = await requireUser(request);
      if (unauthorized || !supabase) return reply.code(401).send({ error: 'Unauthorized' });

      const { id } = request.params as { id: string };
      const { data: installment, error: instErr } = await (supabase as any)
        .from('installments')
        .select(`
          id,
          name,
          monthly_amount,
          total_months,
          paid_months,
          start_date,
          due_day,
          account_id,
          category_id,
          status,
          notes,
          created_at,
          accounts(name),
          categories(name),
          installment_months(id, month_number, amount, is_paid, paid_date, transaction_id)
        `)
        .eq('id', id)
        .maybeSingle();

      if (instErr || !installment) return reply.code(404).send({ error: 'Cicilan tidak ditemukan' });

      const months = ((installment.installment_months as any[]) ?? []).sort(
        (a: any, b: any) => Number(a.month_number) - Number(b.month_number)
      );
      const firstAmount = months[0]?.amount != null ? Number(months[0].amount) : Number(installment.monthly_amount);

      const data = {
        ...installment,
        months,
        account_name: (installment as any).accounts?.name,
        category_name: (installment as any).categories?.name,
        next_amount: Number(months.find((m: any) => !m.is_paid)?.amount ?? installment.monthly_amount),
        has_variable_months: months.some((m: any) => Number(m.amount) !== firstAmount),
        paid_amount_total: months.filter((m: any) => m.is_paid).reduce((sum: number, m: any) => sum + Number(m.amount), 0),
        remaining_amount_total: months.filter((m: any) => !m.is_paid).reduce((sum: number, m: any) => sum + Number(m.amount), 0),
      };

      return { success: true, data };
    } catch (error: any) {
      return reply.code(500).send({ error: error?.message || 'Internal server error' });
    }
  });

  app.patch('/api/installments/:id', async (request, reply) => {
    try {
      const { supabase, unauthorized } = await requireUser(request);
      if (unauthorized || !supabase) return reply.code(401).send({ error: 'Unauthorized' });

      const { id } = request.params as { id: string };
      const { data: existing, error: fetchError } = await (supabase as any)
        .from('installments').select('id').eq('id', id).maybeSingle();

      if (fetchError || !existing) return reply.code(404).send({ error: 'Cicilan tidak ditemukan' });

      const body = request.body as any;
      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return reply.code(400).send({ error: 'Payload tidak valid' });
      }

      const updatePayload: Record<string, unknown> = {};
      let monthsPayload: MonthPayload[] | undefined;

      if ('name' in body) {
        const name = normalizeNullableString(body.name, 'name');
        if (!name) return reply.code(400).send({ error: 'Nama wajib diisi' });
        updatePayload.name = name;
      }

      if ('monthly_amount' in body) {
        const amount = Number(body.monthly_amount);
        if (!Number.isFinite(amount) || amount <= 0) return reply.code(400).send({ error: 'Nominal harus lebih dari 0' });
        updatePayload.monthly_amount = amount;
      }

      if ('total_months' in body) {
        const total = Number(body.total_months);
        if (!Number.isFinite(total) || total <= 0) return reply.code(400).send({ error: 'Total bulan harus lebih dari 0' });
        updatePayload.total_months = total;
      }

      if ('months' in body) {
        try {
          monthsPayload = parseMonths((body as any).months);
        } catch (e: any) {
          return reply.code(400).send({ error: e?.message || 'Detail bulan tidak valid' });
        }

        const totalAmount = monthsPayload.reduce((s, m) => s + m.amount, 0);
        updatePayload.total_months = monthsPayload.length;
        updatePayload.monthly_amount = Math.round(totalAmount / monthsPayload.length);
        updatePayload.paid_months = monthsPayload.filter((m) => m.is_paid).length;
      }

      if ('category_id' in body) updatePayload.category_id = normalizeNullableString(body.category_id, 'category_id');
      if ('account_id' in body) updatePayload.account_id = normalizeNullableString(body.account_id, 'account_id');

      if ('start_date' in body) {
        const raw = normalizeNullableString(body.start_date, 'start_date');
        if (!raw) return reply.code(400).send({ error: 'Tanggal mulai wajib diisi' });
        const parsed = new Date(raw);
        if (Number.isNaN(parsed.getTime())) return reply.code(400).send({ error: 'Format tanggal tidak valid' });
        updatePayload.start_date = parsed.toISOString();
      }

      if ('due_day' in body) {
        if (body.due_day === null || body.due_day === '') {
          updatePayload.due_day = null;
        } else {
          const day = Number(body.due_day);
          if (!Number.isFinite(day) || day < 1 || day > 31) return reply.code(400).send({ error: 'Jatuh tempo tidak valid' });
          updatePayload.due_day = day;
        }
      }

      if ('notes' in body) updatePayload.notes = normalizeNullableString(body.notes, 'notes');

      if ('status' in body) {
        const status = normalizeNullableString(body.status, 'status');
        if (!['active', 'completed', 'paused', 'cancelled'].includes(status as string)) {
          return reply.code(400).send({ error: 'Status tidak valid' });
        }
        updatePayload.status = status;
      }

      if (!Object.keys(updatePayload).length && !monthsPayload) {
        return reply.code(400).send({ error: 'Tidak ada field untuk diupdate' });
      }

      if (Object.keys(updatePayload).length) {
        const { error: updateError } = await (supabase as any).from('installments').update(updatePayload).eq('id', existing.id);
        if (updateError) throw new Error(`Gagal update cicilan: ${updateError.message}`);
      }

      if (monthsPayload) {
        const { data: oldMonths, error: oldErr } = await (supabase as any)
          .from('installment_months').select('month_number, paid_date, transaction_id').eq('installment_id', existing.id);
        if (oldErr) throw new Error(`Gagal membaca detail cicilan: ${oldErr.message}`);

        const oldMap = new Map<number, { paid_date: string | null; transaction_id: string | null }>(
          (oldMonths || []).map((m: any) => [m.month_number, { paid_date: m.paid_date, transaction_id: m.transaction_id }])
        );

        const { error: delErr } = await (supabase as any).from('installment_months').delete().eq('installment_id', existing.id);
        if (delErr) throw new Error(`Gagal update detail cicilan: ${delErr.message}`);

        const rows = monthsPayload.map((m) => {
          const old = oldMap.get(m.month_number);
          return {
            installment_id: existing.id,
            month_number: m.month_number,
            amount: m.amount,
            is_paid: m.is_paid,
            paid_date: m.is_paid ? old?.paid_date ?? null : null,
            transaction_id: m.is_paid ? old?.transaction_id ?? null : null,
          };
        });

        const { error: insErr } = await (supabase as any).from('installment_months').insert(rows);
        if (insErr) throw new Error(`Gagal simpan detail cicilan: ${insErr.message}`);
      }

      return { success: true };
    } catch (error: any) {
      return reply.code(500).send({ error: error?.message || 'Internal server error' });
    }
  });
}
