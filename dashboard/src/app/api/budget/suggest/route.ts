import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

export const dynamic = 'force-dynamic';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(req: NextRequest) {
  try {
    const { income, savings_target, allocatable, categories } = await req.json();

    if (!income || !Array.isArray(categories) || categories.length === 0) {
      return NextResponse.json({ error: 'Data tidak lengkap' }, { status: 400 });
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
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.2,
      max_tokens: 2000,
      response_format: { type: 'json_object' },
    });

    const raw = completion.choices[0]?.message?.content ?? '{}';
    const parsed = JSON.parse(raw);

    if (!parsed.suggestions || !Array.isArray(parsed.suggestions)) {
      return NextResponse.json({ error: 'Respons AI tidak valid' }, { status: 500 });
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

    return NextResponse.json(parsed);
  } catch (error) {
    console.error('Budget suggest error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
