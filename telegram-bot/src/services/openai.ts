import OpenAI from 'openai';
import { config } from '../config';
import { Category } from '../types';

const openai = new OpenAI({ apiKey: config.openai.apiKey });

export async function categorizeTransaction(
  description: string,
  merchant: string | undefined,
  type: 'income' | 'expense',
  categories: Category[]
): Promise<string | null> {
  const categoryList = categories
    .map((c) => `- ID: ${c.id} | ${c.icon} ${c.name}`)
    .join('\n');

  const prompt = `Kamu adalah asisten kategorisasi keuangan pribadi Indonesia.

Diberikan transaksi:
- Tipe: ${type}
- Deskripsi: "${description}"
${merchant ? `- Merchant: "${merchant}"` : ''}

Pilih SATU kategori yang paling cocok dari daftar berikut:
${categoryList}

Balas HANYA dengan ID kategori (UUID), tanpa penjelasan.`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 100,
      temperature: 0,
    });

    const categoryId = response.choices[0].message.content?.trim();
    const valid = categories.find((c) => c.id === categoryId);
    return valid ? categoryId! : null;
  } catch (err) {
    console.error('OpenAI categorization error:', err);
    return null;
  }
}

export async function generateInsight(
  summaryData: string,
  question?: string
): Promise<string> {
  const systemPrompt = `Kamu adalah analis keuangan pribadi yang membantu user Indonesia mengelola cashflow mereka.
Gaya bahasa: casual, friendly, pakai bahasa Indonesia sehari-hari.
Gunakan emoji untuk highlight poin penting.
Berikan insight yang actionable, bukan hanya deskripsi data.
Format: ringkas, pakai bullet points jika perlu.
Selalu gunakan format Rupiah (Rp) dengan titik sebagai separator ribuan.`;

  const userPrompt = question
    ? `Berdasarkan data keuangan berikut:\n${summaryData}\n\nPertanyaan user: ${question}`
    : `Berdasarkan data keuangan berikut, berikan insight dan rekomendasi:\n${summaryData}`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    max_tokens: 800,
    temperature: 0.7,
  });

  return response.choices[0].message.content || 'Maaf, tidak bisa generate insight saat ini.';
}
