import type { FastifyInstance } from 'fastify';
import OpenAI from 'openai';
import { requireUser } from '../lib/supabase.js';
import { startOfMonth, endOfMonth } from '../lib/utils.js';

const openai = new OpenAI({
  baseURL: process.env.LLM_BASE_URL || 'https://api.deepseek.com/v1',
  apiKey: process.env.LLM_API_KEY || 'noop',
});

export default async function plugin(app: FastifyInstance) {
  app.post('/api/chat', async (request, reply) => {
    try {
      const { supabase, unauthorized } = await requireUser(request);
      if (unauthorized || !supabase) return reply.code(401).send({ error: 'Unauthorized' });

      const { messages } = request.body as { messages: any[] };
      if (!messages || !Array.isArray(messages)) {
        return reply.code(400).send({ error: 'Invalid messages' });
      }

      const now = new Date();
      const start = startOfMonth(now);
      const end = endOfMonth(now);

      const [summaryRes, breakdownRes, accountsRes] = await Promise.all([
        (supabase as any).rpc('get_summary', { p_start_date: start, p_end_date: end }),
        (supabase as any).rpc('get_category_breakdown', { p_start_date: start, p_end_date: end, p_type: 'expense' }),
        (supabase as any).from('accounts').select('name, type, balance').eq('is_active', true),
      ]);

      const summary = summaryRes.data?.[0] ?? null;
      const breakdown = breakdownRes.data ?? [];
      const accounts = accountsRes.data ?? [];

      const formatRp = (n: number) => `Rp ${Number(n).toLocaleString('id-ID')}`;

      const contextLines: string[] = [
        '=== DATA KEUANGAN BULAN INI ===',
        summary
          ? [
              `Pemasukan: ${formatRp(summary.total_income)}`,
              `Pengeluaran: ${formatRp(summary.total_expense)}`,
              `Net cashflow: ${formatRp(summary.net_cashflow)}`,
              `Jumlah transaksi: ${summary.transaction_count}`,
              `Rata-rata pengeluaran harian: ${formatRp(summary.avg_daily_expense)}`,
              `Kategori terbesar: ${summary.top_expense_category} (${formatRp(summary.top_expense_amount)})`,
            ].join('\n')
          : 'Tidak ada data summary.',
        '',
        '=== BREAKDOWN KATEGORI PENGELUARAN ===',
        breakdown.slice(0, 8).map((c: any) =>
          `- ${c.category_name}: ${formatRp(c.total_amount)} (${c.percentage}%, ${c.transaction_count} transaksi)`
        ).join('\n') || 'Tidak ada data.',
        '',
        '=== SALDO AKUN ===',
        accounts.map((a: any) => `- ${a.name} (${a.type}): ${formatRp(a.balance)}`).join('\n') || 'Tidak ada akun.',
      ];

      const systemPrompt = `Kamu adalah asisten keuangan pribadi yang cerdas dan membantu.
Kamu berbicara dengan santai dalam Bahasa Indonesia.
Kamu memiliki akses ke data keuangan pengguna yang diberikan di bawah ini.
Berikan analisis yang bermanfaat, actionable, dan spesifik berdasarkan data.
Format angka dalam Rupiah (Rp 1.500.000).
Jika ditanya sesuatu yang tidak ada datanya, katakan dengan jujur.

${contextLines.join('\n')}`;

      const completion = await openai.chat.completions.create({
        model: process.env.LLM_MODEL || 'deepseek-chat',
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages.slice(-10),
        ],
        temperature: 0.7,
        max_tokens: 800,
      });

      const message = completion.choices[0]?.message?.content ?? 'Maaf, tidak bisa memproses permintaan.';
      return { message };
    } catch (error) {
      console.error('Chat API error:', error);
      return reply.code(500).send({ error: 'Internal server error' });
    }
  });
}
