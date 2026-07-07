import type { FastifyInstance } from 'fastify';
import OpenAI from 'openai';
import { requireUser } from '../lib/supabase.js';

const openai = new OpenAI({
  baseURL: process.env.LLM_BASE_URL || 'https://api.deepseek.com/v1',
  apiKey: process.env.LLM_API_KEY ?? 'noop',
});

export default async function plugin(app: FastifyInstance) {
  app.post('/api/budget/suggest', async (request, reply) => {
    try {
      const { unauthorized } = await requireUser(request);
      if (unauthorized) return reply.code(401).send({ error: 'Unauthorized' });

      const body = request.body as any;
      const { income, savings_target, allocatable, categories } = body;

      if (!income || !Array.isArray(categories) || categories.length === 0) {
        return reply.code(400).send({ error: 'Data tidak lengkap' });
      }

      const formatRp = (n: number) => `Rp ${Number(n).toLocaleString('id-ID')}`;

      const systemPrompt = `Kamu adalah perencana keuangan pribadi yang ahli dalam penganggaran rumah tangga di Indonesia.
Tugasmu: alokasikan budget bulanan secara optimal ke kategori pengeluaran berdasarkan data yang diberikan.

Prinsip alokasi:
- Prioritaskan kebutuhan pokok: makan, transportasi, utilitas, kesehatan
- Gunakan referensi 50/30/20 rule (kebutuhan/keinginan/tabungan) tapi sesuaikan konteks Indonesia
- Distribusikan proporsional berdasarkan jenis kategori
- Jika kategori sudah punya budget tersimpan, jadikan referensi tapi boleh disesuaikan
- Beri alokasi minimal ke semua kategori, jangan ada yang 0

KRITIS — CONSTRAINT ABSOLUT:
Total semua suggested_amount HARUS tepat sama dengan nilai allocatable.
Jika ada sisa karena pembulatan, tambahkan ke kategori dengan alokasi terbesar.

Balas HANYA dalam format JSON valid ini (tanpa markdown, tanpa teks lain):
{
  "suggestions": [
    { "category_id": "uuid-here", "suggested_amount": 1500000, "reason": "penjelasan max 12 kata" }
  ]
}`;

      const userPrompt = `Data keuangan pengguna:
- Pemasukan total: ${formatRp(income)}
- Target tabungan: ${formatRp(savings_target)} (${income > 0 ? ((savings_target / income) * 100).toFixed(1) : 0}% dari pemasukan)
- Dana yang bisa dialokasikan ke pengeluaran: ${formatRp(allocatable)}

Daftar kategori:
${categories
  .map(
    (c: { id: string; name: string; current_budget: number }) =>
      `- ID: ${c.id} | Nama: ${c.name} | Budget saat ini: ${c.current_budget ? formatRp(c.current_budget) : 'belum diset'}`
  )
  .join('\n')}

Alokasikan total ${formatRp(allocatable)} ke semua ${categories.length} kategori di atas.
Pastikan sum(suggested_amount) == ${allocatable} persis.`;

      const completion = await openai.chat.completions.create({
        model: process.env.LLM_MODEL || 'deepseek-chat',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.2,
        max_tokens: 2000,
      });

      const raw = completion.choices[0]?.message?.content ?? '{}';
      const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
      const parsed = JSON.parse(cleaned);

      if (!parsed.suggestions || !Array.isArray(parsed.suggestions)) {
        return reply.code(500).send({ error: 'Respons AI tidak valid' });
      }

      // Enforce total constraint: adjust largest category if off
      const total = parsed.suggestions.reduce((s: number, x: { suggested_amount: number }) => s + x.suggested_amount, 0);
      const diff = allocatable - total;
      if (diff !== 0 && parsed.suggestions.length > 0) {
        const maxIdx = parsed.suggestions.reduce(
          (best: number, x: { suggested_amount: number }, i: number) =>
            x.suggested_amount > parsed.suggestions[best].suggested_amount ? i : best,
          0
        );
        parsed.suggestions[maxIdx].suggested_amount += diff;
      }

      return parsed;
    } catch (error) {
      console.error('Budget suggest error:', error);
      return reply.code(500).send({ error: 'Internal server error' });
    }
  });
}
