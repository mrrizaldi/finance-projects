import type { FastifyInstance } from 'fastify';
import { requireUser } from '../lib/supabase.js';
import { recalculateForAccounts } from '../lib/recalculate-snapshots.js';

export default async function plugin(app: FastifyInstance) {
  app.post('/api/accounts/:id/adjust', async (request, reply) => {
    try {
      const { supabase, user, unauthorized } = await requireUser(request);
      if (unauthorized || !supabase) return reply.code(401).send({ error: 'Unauthorized' });

      const { id } = request.params as { id: string };
      const body = request.body as any;

      const targetBalance = Number(body?.target_balance);
      const note = typeof body?.note === 'string' ? body.note.trim() : '';

      if (!Number.isFinite(targetBalance)) {
        return reply.code(400).send({ error: 'target_balance tidak valid' });
      }

      const { data: account, error: accountError } = await (supabase as any)
        .from('accounts').select('id, name, balance').eq('id', id).maybeSingle();

      if (accountError || !account) return reply.code(404).send({ error: 'Akun tidak ditemukan' });

      const { data: rpcResult, error: rpcError } = await (supabase as any).rpc('set_account_balance', {
        p_account_id: account.id,
        p_target_balance: targetBalance,
      });

      if (rpcError) throw new Error(`Gagal set saldo akun: ${rpcError.message}`);

      const row = rpcResult?.[0];
      if (!row) throw new Error('Gagal set saldo akun: response kosong');

      const before = Number(row.balance_before);
      const after = Number(row.balance_after);
      const delta = Number(row.delta);

      if (Math.abs(delta) > 0.000001) {
        const txType = delta > 0 ? 'income' : 'expense';
        const { error: txError } = await (supabase as any).from('transactions').insert({
          type: txType,
          amount: Math.abs(delta),
          description: `Balance adjustment ${account.name}`,
          account_id: account.id,
          source: 'manual_web',
          transaction_date: new Date().toISOString(),
          is_adjustment: true,
          adjustment_note: note || null,
          balance_before: before,
          balance_after: after,
          user_id: user.id,
        });
        if (txError) throw new Error(`Gagal mencatat adjustment: ${txError.message}`);
      }

      await recalculateForAccounts(supabase, [account.id]);

      return {
        success: true,
        data: { account_id: account.id, balance_before: before, balance_after: after, delta },
      };
    } catch (error: any) {
      return reply.code(500).send({ error: error?.message || 'Internal server error' });
    }
  });
}
