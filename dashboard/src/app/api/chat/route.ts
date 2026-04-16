import { unstable_cache } from 'next/cache';
import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { createServerClient } from '@/lib/supabase';
import { startOfMonth, endOfMonth } from '@/lib/utils';

export const dynamic = 'force-dynamic';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const getChatContext = unstable_cache(
  async (yearMonth: string) => {
    const supabase = createServerClient();
    const [year, month] = yearMonth.split('-').map(Number);
    const now = new Date(year, (month || 1) - 1, 2);
    const start = startOfMonth(now);
    const end = endOfMonth(now);

    const [summaryRes, breakdownRes, accountsRes] = await Promise.all([
      supabase.rpc('get_summary', { p_start_date: start, p_end_date: end }),
      supabase.rpc('get_category_breakdown', { p_start_date: start, p_end_date: end, p_type: 'expense' }),
      supabase.from('accounts').select('name, type, balance').eq('is_active', true),
    ]);

    return {
      summary: summaryRes.data?.[0] ?? null,
      breakdown: breakdownRes.data ?? [],
      accounts: accountsRes.data ?? [],
    };
  },
  ['chat-monthly-context'],
  { revalidate: 45, tags: ['chat-context', 'overview', 'analytics', 'accounts', 'categories'] }
);

export async function POST(req: NextRequest) {
  try {
    const { messages } = await req.json();

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: 'Invalid messages' }, { status: 400 });
    }

    const now = new Date();
    const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const { summary, breakdown, accounts } = await getChatContext(yearMonth);

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
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages.slice(-10), // Last 10 messages for context
      ],
      temperature: 0.7,
      max_tokens: 800,
    });

    const reply = completion.choices[0]?.message?.content ?? 'Maaf, tidak bisa memproses permintaan.';

    return NextResponse.json({ message: reply });
  } catch (error) {
    console.error('Chat API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
