import { NextResponse } from 'next/server';
import { createApiClient, unauthorizedResponse } from '@/lib/supabase-api';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(request: Request) {
  const { supabase, unauthorized } = await createApiClient();
  if (unauthorized || !supabase) return unauthorizedResponse();

  const { description, type } = await request.json();

  const { data: categories } = await supabase
    .from('categories')
    .select('id, name, type')
    .or(`type.eq.${type},type.eq.both`)
    .eq('is_active', true)
    .order('sort_order');

  if (!categories || categories.length === 0) {
    return NextResponse.json({ category_id: null });
  }

  const categoryList = categories.map((c: { id: string; name: string }) => `${c.id}:${c.name}`).join(', ');

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: `Kamu adalah asisten kategorisasi transaksi keuangan. Berikan ID kategori yang paling sesuai untuk deskripsi transaksi yang diberikan. Hanya balas dengan UUID kategori, tanpa teks lain. Jika tidak yakin, balas "null". Kategori yang tersedia: ${categoryList}`,
      },
      { role: 'user', content: description },
    ],
    max_tokens: 50,
    temperature: 0,
  });

  const suggestedId = response.choices[0]?.message?.content?.trim();
  const isValid = categories.some((c: { id: string }) => c.id === suggestedId);

  return NextResponse.json({
    category_id: isValid ? suggestedId : null,
  });
}
