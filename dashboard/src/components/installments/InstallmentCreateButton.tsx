'use client';

import { useState } from 'react';
import { useRevalidator } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus } from 'lucide-react';
import type { Account, Category } from '@/types';

interface Props {
  accounts: Account[];
  categories: Category[];
}

export function InstallmentCreateButton({ accounts, categories }: Props) {
  const { t } = useTranslation();
  const revalidator = useRevalidator();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: '',
    monthly_amount: '',
    total_months: '',
    start_date: new Date().toISOString().split('T')[0],
    due_day: '',
    account_id: '',
    category_id: '',
  });

  function update(field: string, value: string) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  async function handleCreate() {
    if (!form.name || !form.monthly_amount || !form.total_months) return;
    setSaving(true);

    const res = await fetch('/api/installments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: form.name,
        monthly_amount: parseFloat(form.monthly_amount.replace(/\./g, '').replace(',', '.')),
        total_months: parseInt(form.total_months),
        start_date: form.start_date,
        due_day: form.due_day ? parseInt(form.due_day) : null,
        account_id: form.account_id || null,
        category_id: form.category_id || null,
      }),
    });

    setSaving(false);
    if (res.ok) {
      setOpen(false);
      setForm({
        name: '',
        monthly_amount: '',
        total_months: '',
        start_date: new Date().toISOString().split('T')[0],
        due_day: '',
        account_id: '',
        category_id: '',
      });
      revalidator.revalidate();
    }
  }

  return (
    <>
      <Button onClick={() => setOpen(true)} size="sm">
        <Plus className="h-4 w-4 mr-1" />
        {t('inst.add')}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('inst.addNew')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label>{t('inst.name')}</Label>
              <Input
                placeholder={t('inst.namePlaceholder')}
                value={form.name}
                onChange={(e) => update('name', e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>{t('inst.amountPerMonth')}</Label>
                <Input
                  type="text"
                  inputMode="decimal"
                  placeholder="500.000"
                  value={form.monthly_amount}
                  onChange={(e) => update('monthly_amount', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>{t('inst.totalMonths')}</Label>
                <Input
                  type="number"
                  min={1}
                  placeholder="12"
                  value={form.total_months}
                  onChange={(e) => update('total_months', e.target.value)}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>{t('inst.startDate')}</Label>
                <Input
                  type="date"
                  value={form.start_date}
                  onChange={(e) => update('start_date', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>{t('inst.dueDayLabel')}</Label>
                <Input
                  type="number"
                  min={1}
                  max={31}
                  placeholder={t('tx.optional')}
                  value={form.due_day}
                  onChange={(e) => update('due_day', e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>{t('tx.account')}</Label>
              <select
                value={form.account_id}
                onChange={(e) => update('account_id', e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">{t('tx.selectAccount')}</option>
                {accounts.map(a => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label>{t('tx.category')}</Label>
              <select
                value={form.category_id}
                onChange={(e) => update('category_id', e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">{t('tx.selectCategory')}</option>
                {categories.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <Button
              onClick={handleCreate}
              className="w-full"
              disabled={saving || !form.name || !form.monthly_amount || !form.total_months}
            >
              {saving ? t('common.saving') : t('inst.create')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
