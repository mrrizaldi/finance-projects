'use client';

import { useState, useEffect } from 'react';
import { useAddTransaction } from '@/lib/add-transaction-context';
import { AddPageClient } from '@/components/add/AddPageClient';
import { getBrowserClient } from '@/lib/supabase';
import type { Account, Category } from '@/types';
import { X } from 'lucide-react';

interface FormData {
  accounts: Account[];
  categories: Category[];
  defaultAccountId: string | null;
}

export function AddTransactionModal() {
  const { state, closeModal } = useAddTransaction();
  const [formData, setFormData] = useState<FormData | null>(null);
  const [loading, setLoading] = useState(false);

  // Lazy-fetch accounts/categories on first open
  useEffect(() => {
    if (!state.open || formData) return;
    setLoading(true);
    const supabase = getBrowserClient();
    Promise.all([
      supabase.from('accounts').select('*').eq('is_active', true).order('name'),
      supabase.from('categories').select('*').eq('is_active', true).order('sort_order'),
      supabase.from('profiles').select('default_account_id').single(),
    ]).then(([accountsRes, categoriesRes, profileRes]) => {
      setFormData({
        accounts: accountsRes.data ?? [],
        categories: categoriesRes.data ?? [],
        defaultAccountId: profileRes.data?.default_account_id ?? null,
      });
      setLoading(false);
    });
  }, [state.open, formData]);

  if (!state.open) return null;

  return (
    // Backdrop
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.4)' }}
      onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}
    >
      {/* Panel */}
      <div
        className="relative w-full max-w-lg max-h-[90dvh] overflow-y-auto rounded-2xl shadow-2xl"
        style={{ background: 'var(--surface)' }}
      >
        {/* Header */}
        <div
          className="sticky top-0 flex items-center justify-between px-5 py-4 z-10"
          style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border-faint)' }}
        >
          <h2 className="text-lg font-bold" style={{ color: 'var(--text-hi)' }}>
            Tambah Transaksi
          </h2>
          <button
            onClick={closeModal}
            className="p-1.5 rounded-lg transition-colors hover:bg-[var(--surface-hi)]"
            style={{ color: 'var(--text-mute)' }}
            aria-label="Tutup"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5">
          {loading || !formData ? (
            <div
              className="py-12 text-center text-sm"
              style={{ color: 'var(--text-dim)' }}
            >
              Memuat...
            </div>
          ) : (
            <AddPageClient
              accounts={formData.accounts}
              categories={formData.categories}
              defaultAccountId={formData.defaultAccountId}
              onSuccess={closeModal}
            />
          )}
        </div>
      </div>
    </div>
  );
}
