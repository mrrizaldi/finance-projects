'use client';

import { useState, useEffect } from 'react';
import { Sparkles, ArrowRight } from 'lucide-react';
import Link from 'next/link';

interface Props {
  month: string; // YYYY-MM, for display only (API always uses current month)
  hasOverrun: boolean; // any category over budget?
}

export function AiInsightWidget({ hasOverrun }: Props) {
  const [insight, setInsight] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const prompt =
      'Berikan 1 insight paling penting tentang kondisi keuangan bulan ini dalam 2-3 kalimat singkat saja. ' +
      'Jika ada pengeluaran yang melampaui budget, fokus ke situ dan beri saran ringkas. ' +
      'Jika kondisi baik, berikan apresiasi singkat dan 1 tips. ' +
      'Jangan pakai list bullet. Gunakan bahasa Indonesia santai.';

    fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: prompt }] }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setInsight(d.message ?? null);
      })
      .catch(() => {
        if (!cancelled) setInsight(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div
      className="rounded-xl border p-4"
      style={{ background: 'var(--surface)', borderColor: 'var(--border-faint)' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-2.5">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4" style={{ color: 'var(--accent-hi)' }} />
          <span className="text-sm font-semibold" style={{ color: 'var(--text-mid)' }}>
            Insight Hari Ini
          </span>
        </div>
        <span
          className="text-xs font-medium px-2 py-0.5 rounded-full"
          style={
            hasOverrun
              ? { background: 'var(--negative-soft)', color: 'var(--negative)' }
              : { background: 'var(--positive-soft)', color: 'var(--positive)' }
          }
        >
          {hasOverrun ? 'Perhatian' : 'Baik'}
        </span>
      </div>

      {/* Content */}
      <div className="min-h-[60px]">
        {loading ? (
          <div className="flex items-center gap-2">
            <span
              className="inline-block w-1.5 h-1.5 rounded-full animate-pulse"
              style={{ background: 'var(--accent-hi)' }}
            />
            <span className="text-xs" style={{ color: 'var(--text-dim)' }}>
              Menganalisis keuangan kamu...
            </span>
          </div>
        ) : insight ? (
          <p className="text-xs leading-relaxed" style={{ color: 'var(--text-mute)' }}>
            {insight}
          </p>
        ) : (
          <p className="text-xs" style={{ color: 'var(--text-dim)' }}>
            Gagal memuat insight. Coba refresh.
          </p>
        )}
      </div>

      {/* Footer */}
      <Link
        href="/insights"
        className="mt-3 flex items-center gap-1 text-xs font-medium"
        style={{ color: 'var(--accent-hi)' }}
      >
        Tanya lebih lanjut
        <ArrowRight className="h-3 w-3" />
      </Link>
    </div>
  );
}
