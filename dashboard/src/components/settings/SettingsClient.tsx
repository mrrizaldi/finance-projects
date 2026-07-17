'use client';

import { useState, useCallback, useEffect, useTransition } from 'react';
import { useRevalidator } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Account, Category, Profile } from '@/types';
import i18n, { setLocale, storedLocale, type Locale } from '@/i18n';
import { formatRupiah } from '@/lib/utils';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AccountEditDialog } from './AccountEditDialog';
import { AccountAdjustDialog } from './AccountAdjustDialog';
import { CategoryEditDialog } from './CategoryEditDialog';
import { ArrowUpDown, Ban, Pencil, Plus } from 'lucide-react';
import { useTheme } from 'next-themes';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface SettingsClientProps {
  initialAccounts: Account[];
  initialCategories: Category[];
  profile: Profile | null;
  email: string | null;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return new Uint8Array(Array.from(rawData).map((c) => c.charCodeAt(0)));
}

// Returns an active ServiceWorkerRegistration without hanging.
// navigator.serviceWorker.ready blocks forever if SW is stuck in waiting.
async function getActiveReg(timeoutMs = 5000): Promise<ServiceWorkerRegistration> {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('sw-timeout')), timeoutMs)
  );
  try {
    return await Promise.race([navigator.serviceWorker.ready, timeout]);
  } catch {
    // ready timed out — find any registration that already has an active worker
    const regs = await navigator.serviceWorker.getRegistrations();
    const active = regs.find((r) => r.active);
    if (active) return active;
    throw new Error(i18n.t('settings.push.noSW'));
  }
}

type PushStatus = 'loading' | 'unsupported' | 'denied' | 'inactive' | 'active';

function PushNotificationSection() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<PushStatus>('loading');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setStatus('unsupported');
      return;
    }
    if (Notification.permission === 'denied') {
      setStatus('denied');
      return;
    }

    getActiveReg()
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setStatus(sub ? 'active' : 'inactive'))
      .catch((err) => {
        console.error('SW check error:', err);
        // Browser supports push (passed check above) but SW not ready yet.
        // Show inactive so user can still try to enable.
        setStatus('inactive');
      });
  }, []);

  async function handleEnable() {
    setSaving(true);
    setError(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setStatus('denied');
        return;
      }
      const vapidRes = await fetch('/api/push/vapid-key');
      if (!vapidRes.ok) {
        setError(t('settings.push.configFailed'));
        return;
      }
      const { publicKey } = await vapidRes.json();

      const reg = await getActiveReg();
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
      });

      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'subscribe', subscription: sub.toJSON() }),
      });
      if (!res.ok) {
        await sub.unsubscribe();
        setError(t('settings.push.subFailed'));
        return;
      }
      setStatus('active');
    } catch (err) {
      console.error('Push subscribe error:', err);
      setError(t('settings.push.error'));
    } finally {
      setSaving(false);
    }
  }

  async function handleDisable() {
    setSaving(true);
    setError(null);
    try {
      const reg = await getActiveReg();
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        const res = await fetch('/api/push/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'unsubscribe', subscription: sub.toJSON() }),
        });
        if (!res.ok) {
          setError(t('settings.push.unsubFailed'));
          return;
        }
        await sub.unsubscribe();
      }
      setStatus('inactive');
    } catch (err) {
      console.error('Push unsubscribe error:', err);
      setError(t('settings.push.error'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="text-base">{t('settings.push.title')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {error && (
          <p className="text-sm text-red-500">{error}</p>
        )}
        {status === 'loading' && (
          <p className="text-sm text-muted-foreground">{t('settings.push.checking')}</p>
        )}
        {status === 'unsupported' && (
          <p className="text-sm text-muted-foreground">
            {t('settings.push.unsupported')}
          </p>
        )}
        {status === 'denied' && (
          <p className="text-sm text-muted-foreground">
            {t('settings.push.denied')}
          </p>
        )}
        {(status === 'inactive' || status === 'active') && (
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">
                {status === 'active' ? t('settings.push.active') : t('settings.push.inactive')}
              </p>
              <p className="text-xs text-muted-foreground">
                {status === 'active'
                  ? t('settings.push.activeDesc')
                  : t('settings.push.inactiveDesc')}
              </p>
            </div>
            <Button
              size="sm"
              variant={status === 'active' ? 'outline' : 'default'}
              onClick={status === 'active' ? handleDisable : handleEnable}
              disabled={saving}
            >
              {saving ? t('common.processing') : status === 'active' ? t('settings.push.disable') : t('settings.push.enable')}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ThemeSection() {
  const { t } = useTranslation();
  const { theme, setTheme } = useTheme();

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="text-base">{t('settings.theme.title')}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">{t('settings.theme.label')}</p>
            <p className="text-xs text-muted-foreground">{t('settings.theme.desc')}</p>
          </div>
          <Select value={theme} onValueChange={(v) => v && setTheme(v)}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="light">{t('settings.theme.light')}</SelectItem>
              <SelectItem value="dark">{t('settings.theme.dark')}</SelectItem>
              <SelectItem value="system">{t('settings.theme.system')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardContent>
    </Card>
  );
}

function LanguageSection({ profile }: { profile: Profile | null }) {
  const { t } = useTranslation();
  // profiles.locale = source of truth; localStorage sbg cache/anti-flash.
  const [locale, setLocaleValue] = useState<Locale>(profile?.locale ?? storedLocale());
  const [saving, setSaving] = useState(false);

  async function handleChange(v: string | null) {
    if (!v) return;
    const next = (v === 'en' ? 'en' : 'id') as Locale;
    setLocaleValue(next);
    setLocale(next); // ganti bahasa UI live + localStorage
    setSaving(true);
    await fetch('/api/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ locale: next }),
    }).catch(() => {});
    setSaving(false);
  }

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="text-base">{t('settings.language.title')}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">{t('settings.language.title')}</p>
            <p className="text-xs text-muted-foreground">{t('settings.language.desc')}</p>
          </div>
          <Select value={locale} onValueChange={handleChange} disabled={saving}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="id">{t('languages.id')}</SelectItem>
              <SelectItem value="en">{t('languages.en')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardContent>
    </Card>
  );
}

export function SettingsClient({ initialAccounts, initialCategories, profile, email }: SettingsClientProps) {
  const { t } = useTranslation();
  const revalidator = useRevalidator();
  const [accounts, setAccounts] = useState<Account[]>(initialAccounts);
  const [categories, setCategories] = useState<Category[]>(initialCategories);

  const [accountDialog, setAccountDialog] = useState<{ open: boolean; account: Account | null }>({
    open: false,
    account: null,
  });
  const [categoryDialog, setCategoryDialog] = useState<{ open: boolean; category: Category | null }>({
    open: false,
    category: null,
  });
  const [adjustDialog, setAdjustDialog] = useState<{ open: boolean; account: Account | null }>({
    open: false,
    account: null,
  });

  const [deactivatingId, setDeactivatingId] = useState<string | null>(null);
  const [isRefreshing, startRefresh] = useTransition();

  // Profile state
  const [displayName, setDisplayName] = useState(profile?.display_name ?? '');
  const [defaultAccountId, setDefaultAccountId] = useState(profile?.default_account_id ?? '');
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);

  async function handleSaveProfile() {
    setSavingProfile(true);
    const res = await fetch('/api/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        display_name: displayName,
        default_account_id: defaultAccountId || null,
      }),
    });
    setSavingProfile(false);
    if (res.ok) {
      setProfileSaved(true);
      setTimeout(() => setProfileSaved(false), 2000);
    }
  }

  useEffect(() => {
    setAccounts(initialAccounts);
  }, [initialAccounts]);

  useEffect(() => {
    setCategories(initialCategories);
  }, [initialCategories]);

  const refreshAccounts = useCallback(() => {
    startRefresh(() => {
      revalidator.revalidate();
    });
  }, [revalidator]);

  const refreshCategories = useCallback(() => {
    startRefresh(() => {
      revalidator.revalidate();
    });
  }, [revalidator]);

  async function handleDeactivateAccount(acc: Account) {
    if (!confirm(t('settings.confirmDeactivateAccount', { name: acc.name }))) return;
    setDeactivatingId(acc.id);
    try {
      const res = await fetch(`/api/accounts/${acc.id}`, { method: 'DELETE' });
      if (res.ok) {
        setAccounts((prev) => prev.map((a) => a.id === acc.id ? { ...a, is_active: false } : a));
        refreshAccounts();
      }
    } finally {
      setDeactivatingId(null);
    }
  }

  async function handleDeactivateCategory(cat: Category) {
    if (!confirm(t('settings.confirmDeactivateCategory', { name: cat.name }))) return;
    setDeactivatingId(cat.id);
    try {
      const res = await fetch(`/api/categories/${cat.id}`, { method: 'DELETE' });
      if (res.ok) {
        setCategories((prev) => prev.map((c) => c.id === cat.id ? { ...c, is_active: false } : c));
        refreshCategories();
      }
    } finally {
      setDeactivatingId(null);
    }
  }

  const expenseCategories = categories.filter((c) => c.type === 'expense' || c.type === 'both');
  const incomeCategories = categories.filter((c) => c.type === 'income' || c.type === 'both');

  return (
    <>
      {isRefreshing && (
        <div className="fixed inset-0 z-[120] bg-black/70 backdrop-blur-sm flex items-center justify-center">
          <div className="rounded-xl border border-border bg-card px-4 py-3 text-sm text-foreground shadow-xl">
            {t('common.syncing')}
          </div>
        </div>
      )}

      {/* Profile */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">{t('settings.profile')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {email && (
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">{t('auth.login.email')}</Label>
              <p className="text-sm">{email}</p>
            </div>
          )}
          <div className="space-y-2">
            <Label>{t('settings.displayName')}</Label>
            <Input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder={t('settings.displayNamePlaceholder')}
            />
          </div>
          <div className="space-y-2">
            <Label>{t('settings.defaultAccount')}</Label>
            <select
              value={defaultAccountId}
              onChange={(e) => setDefaultAccountId(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">{t('settings.none')}</option>
              {initialAccounts.filter(a => a.is_active).map(a => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>
          <Button onClick={handleSaveProfile} disabled={savingProfile} size="sm">
            {profileSaved ? t('common.saved') : savingProfile ? t('common.saving') : t('settings.saveProfile')}
          </Button>
        </CardContent>
      </Card>

      <LanguageSection profile={profile} />
      <ThemeSection />
      <PushNotificationSection />

      {/* Accounts */}
      <Card className="mb-6">
        <CardHeader className="border-b border-border">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold text-foreground">{t('settings.accounts')} ({accounts.length})</CardTitle>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={() => setAccountDialog({ open: true, account: null })}
            >
              <Plus className="h-3 w-3 mr-1" />
              {t('settings.addAccount')}
            </Button>
          </div>
        </CardHeader>
        <div className="divide-y divide-border">
          {accounts.map((acc) => (
            <div
              key={acc.id}
              className={`flex flex-wrap items-center justify-between gap-2 px-4 py-3 ${acc.is_active === false ? 'opacity-50' : ''}`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium text-foreground break-words">{acc.name}</p>
                    {acc.is_active === false && (
                      <Badge variant="secondary" className="text-xs h-4 px-1.5">{t('settings.inactive')}</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground capitalize">{acc.type}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 ml-auto">
                <span className={`text-sm font-semibold ${acc.balance >= 0 ? 'text-foreground' : 'text-red-500'}`}>
                  {formatRupiah(acc.balance)}
                </span>
                {acc.is_active !== false && (
                  <>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs"
                      onClick={() => setAdjustDialog({ open: true, account: acc })}
                      title={t('settings.adjustBalance')}
                    >
                      <ArrowUpDown className="h-3 w-3 mr-1" />
                      {t('settings.adjust')}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs"
                      onClick={() => setAccountDialog({ open: true, account: acc })}
                    >
                      <Pencil className="h-3 w-3 mr-1" />
                      {t('common.edit')}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs text-muted-foreground hover:text-red-500"
                      disabled={deactivatingId === acc.id}
                      onClick={() => handleDeactivateAccount(acc)}
                    >
                      <Ban className="h-3 w-3 mr-1" />
                      {t('settings.deactivate')}
                    </Button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Categories */}
      <Card>
        <CardHeader className="border-b border-border">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold text-foreground">{t('settings.categories')} ({categories.length})</CardTitle>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={() => setCategoryDialog({ open: true, category: null })}
            >
              <Plus className="h-3 w-3 mr-1" />
              {t('settings.addCategory')}
            </Button>
          </div>
        </CardHeader>

        {/* Expense */}
        <div className="px-4 py-3 bg-muted/30 border-b border-border">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            {t('tx.type.expense')} ({expenseCategories.length})
          </p>
        </div>
        <div className="divide-y divide-border">
          {expenseCategories.map((cat) => (
            <CategoryRow
              key={cat.id}
              cat={cat}
              deactivatingId={deactivatingId}
              onEdit={() => setCategoryDialog({ open: true, category: cat })}
              onDeactivate={() => handleDeactivateCategory(cat)}
            />
          ))}
        </div>

        {/* Income */}
        <div className="px-4 py-3 bg-muted/30 border-y border-border">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            {t('tx.type.income')} ({incomeCategories.length})
          </p>
        </div>
        <div className="divide-y divide-border">
          {incomeCategories.map((cat) => (
            <CategoryRow
              key={cat.id}
              cat={cat}
              deactivatingId={deactivatingId}
              onEdit={() => setCategoryDialog({ open: true, category: cat })}
              onDeactivate={() => handleDeactivateCategory(cat)}
            />
          ))}
        </div>
      </Card>

      <AccountEditDialog
        account={accountDialog.account}
        open={accountDialog.open}
        onOpenChange={(open) => setAccountDialog((prev) => ({ ...prev, open }))}
        onSuccess={refreshAccounts}
      />
      <CategoryEditDialog
        category={categoryDialog.category}
        open={categoryDialog.open}
        onOpenChange={(open) => setCategoryDialog((prev) => ({ ...prev, open }))}
        onSuccess={refreshCategories}
      />
      <AccountAdjustDialog
        account={adjustDialog.account}
        open={adjustDialog.open}
        onOpenChange={(open) => setAdjustDialog((prev) => ({ ...prev, open }))}
        onSuccess={refreshAccounts}
      />
    </>
  );
}

function CategoryRow({
  cat,
  deactivatingId,
  onEdit,
  onDeactivate,
}: {
  cat: Category;
  deactivatingId: string | null;
  onEdit: () => void;
  onDeactivate: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className={`flex flex-wrap items-center justify-between gap-2 px-4 py-3 ${cat.is_active === false ? 'opacity-50' : ''}`}>
      <div className="flex items-center gap-3 min-w-0">
        <div
          className="w-3 h-3 rounded-full flex-shrink-0"
          style={{ backgroundColor: cat.color }}
        />
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm text-foreground break-words">{cat.name}</p>
          {cat.is_active === false && (
            <Badge variant="secondary" className="text-xs h-4 px-1.5">{t('settings.inactive')}</Badge>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 ml-auto">
        {cat.budget_monthly ? (
          <Badge variant="secondary" className="text-xs">
            {t('settings.budgetLabel')}: {formatRupiah(cat.budget_monthly)}
          </Badge>
        ) : (
          <span className="text-xs text-muted-foreground/50">{t('settings.noBudget')}</span>
        )}
        {cat.is_active !== false && (
          <>
            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={onEdit}>
              <Pencil className="h-3 w-3 mr-1" />
              {t('common.edit')}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs text-muted-foreground hover:text-red-500"
              disabled={deactivatingId === cat.id}
              onClick={onDeactivate}
            >
              <Ban className="h-3 w-3 mr-1" />
              {t('settings.deactivate')}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
