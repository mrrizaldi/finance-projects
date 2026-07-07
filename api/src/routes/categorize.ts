import type { FastifyInstance } from 'fastify';
import OpenAI from 'openai';
import { requireUser } from '../lib/supabase.js';

const openai = new OpenAI({
  baseURL: process.env.LLM_BASE_URL || 'https://api.deepseek.com/v1',
  apiKey: process.env.LLM_API_KEY ?? 'noop',
});

export default async function plugin(app: FastifyInstance) {
  app.post('/api/categorize', async (request, reply) => {
    const { supabase, unauthorized } = await requireUser(request);
    if (unauthorized || !supabase) return reply.code(401).send({ error: 'Unauthorized' });

    const { description, type } = request.body as { description: string; type: string };

    const { data: categories } = await (supabase as any)
      .from('categories')
      .select('id, name, type')
      .or(`type.eq.${type},type.eq.both`)
      .eq('is_active', true)
      .order('sort_order');

    if (!categories || categories.length === 0) {
      return { category_id: null };
    }

    const categoryList = categories.map((c: { id: string; name: string }) => `${c.id}:${c.name}`).join(', ');

    const response = await openai.chat.completions.create({
      model: process.env.LLM_MODEL || 'deepseek-chat',
      messages: [
        {
          role: 'system',
          content: `Kamu adalah asisten kategorisasi transaksi keuangan. Berikan ID kategori yang paling sesuai untuk deskripsi transaksi yang diberikan. Hanya balas dengan UUID kategori, tanpa teks lain. Jika tidak yakin, balas "null". Kategori yang tersedia: ${categoryList}`,
        },
        { role: 'user', content: description },
      ],
      max_tokens: 300,
      temperature: 0,
    });

    const suggestedId = response.choices[0]?.message?.content?.trim();
    const isValid = categories.some((c: { id: string }) => c.id === suggestedId);

    return { category_id: isValid ? suggestedId : null };
  });
}
