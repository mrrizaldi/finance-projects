import { useState } from 'react';
import { redirect, useLoaderData, useRevalidator } from 'react-router';
import { useTranslation } from 'react-i18next';
import i18n from '@/i18n';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface AdminUser {
  id: string;
  email: string | null;
  display_name: string | null;
  is_admin: boolean;
  telegram_linked: boolean;
  created_at: string;
}

interface InviteCode {
  code: string;
  created_by: string;
  email: string | null;
  used_by: string | null;
  used_at: string | null;
  expires_at: string;
  created_at: string;
}

interface TelegramRequest {
  chat_id: string;
  user_id: string;
  email: string | null;
  requested_at: string;
}

export async function clientLoader() {
  const [usersRes, invitesRes, telegramRes] = await Promise.all([
    fetch('/api/admin/users'),
    fetch('/api/admin/invites'),
    fetch('/api/admin/telegram-requests'),
  ]);

  if (usersRes.status === 401 || invitesRes.status === 401 || telegramRes.status === 401) throw redirect('/login');
  if (usersRes.status === 403 || invitesRes.status === 403 || telegramRes.status === 403) throw redirect('/');
  if (!usersRes.ok || !invitesRes.ok || !telegramRes.ok) throw new Error(i18n.t('page.adminLoadFailed'));

  const users: AdminUser[] = await usersRes.json();
  const invites: InviteCode[] = await invitesRes.json();
  const telegramRequests: TelegramRequest[] = await telegramRes.json();

  return { users, invites, telegramRequests };
}

function inviteStatus(invite: InviteCode): { label: string; variant: 'secondary' | 'outline' | 'destructive' } {
  if (invite.used_by) return { label: i18n.t('page.used'), variant: 'secondary' };
  if (new Date(invite.expires_at) < new Date()) return { label: i18n.t('page.expired'), variant: 'destructive' };
  return { label: i18n.t('page.active'), variant: 'outline' };
}

export default function AdminPage() {
  const { t } = useTranslation();
  const { users, invites, telegramRequests } = useLoaderData<typeof clientLoader>();
  const revalidator = useRevalidator();
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [newCode, setNewCode] = useState<string | null>(null);
  const [busyChatId, setBusyChatId] = useState<string | null>(null);
  // GET /api/admin/users tidak mengembalikan status banned, jadi status suspend
  // di-track lokal per sesi. ponytail: kalau nanti API expose banned_until, ganti ke situ.
  const [suspendedIds, setSuspendedIds] = useState<Set<string>>(new Set());

  async function toggleSuspend(u: AdminUser) {
    const nextSuspend = !suspendedIds.has(u.id);
    setError(null);
    setBusyId(u.id);
    try {
      const res = await fetch(`/api/admin/users/${u.id}/suspend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ suspend: nextSuspend }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? t('page.updateUserFailed'));
        return;
      }
      setSuspendedIds((prev) => {
        const next = new Set(prev);
        if (nextSuspend) next.add(u.id); else next.delete(u.id);
        return next;
      });
      revalidator.revalidate();
    } finally {
      setBusyId(null);
    }
  }

  async function generateInvite() {
    setError(null);
    setGenerating(true);
    try {
      const res = await fetch('/api/admin/invites', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? t('page.genInviteFailed'));
        return;
      }
      setNewCode(data.code);
      revalidator.revalidate();
    } finally {
      setGenerating(false);
    }
  }

  async function handleTelegramRequest(chatId: string, action: 'approve' | 'reject') {
    setError(null);
    setBusyChatId(chatId);
    try {
      const res = await fetch(`/api/admin/telegram-requests/${chatId}/${action}`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? t('page.updateReqFailed'));
        return;
      }
      revalidator.revalidate();
    } finally {
      setBusyChatId(null);
    }
  }

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-hi)' }}>
          Admin
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-mute)' }}>
          Kelola user dan kode undangan
        </p>
      </div>

      {error && (
        <div
          className="text-sm rounded-lg px-3 py-2"
          style={{ background: 'var(--surface-hi)', color: 'var(--text-mute)' }}
        >
          {error}
        </div>
      )}

      <section>
        <h2 className="text-lg font-semibold mb-3" style={{ color: 'var(--text-hi)' }}>
          Users
        </h2>
        <div className="rounded-lg" style={{ border: '1px solid var(--border-faint)' }}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>{t('inv.name')}</TableHead>
                <TableHead>Telegram</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>{t('page.action')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => (
                <TableRow key={u.id}>
                  <TableCell style={{ color: 'var(--text-mid)' }}>{u.email}</TableCell>
                  <TableCell style={{ color: 'var(--text-mute)' }}>{u.display_name ?? '-'}</TableCell>
                  <TableCell>
                    <Badge variant={u.telegram_linked ? 'default' : 'outline'}>
                      {u.telegram_linked ? t('page.connected') : t('page.notYet')}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {u.is_admin && <Badge variant="secondary">Admin</Badge>}
                  </TableCell>
                  <TableCell>
                    <Button
                      size="sm"
                      variant={suspendedIds.has(u.id) ? 'default' : 'outline'}
                      disabled={busyId === u.id}
                      onClick={() => toggleSuspend(u)}
                    >
                      {busyId === u.id ? '...' : suspendedIds.has(u.id) ? t('page.unsuspend') : t('page.suspend')}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3" style={{ color: 'var(--text-hi)' }}>
          Pending Telegram Requests
        </h2>
        {telegramRequests.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--text-mute)' }}>{t('page.noRequests')}</p>
        ) : (
          <div className="rounded-lg" style={{ border: '1px solid var(--border-faint)' }}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>{t('page.requestedAt')}</TableHead>
                  <TableHead>{t('page.action')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {telegramRequests.map((r) => (
                  <TableRow key={r.chat_id}>
                    <TableCell style={{ color: 'var(--text-mid)' }}>{r.email ?? '-'}</TableCell>
                    <TableCell style={{ color: 'var(--text-mute)' }}>
                      {new Date(r.requested_at).toLocaleString('id-ID')}
                    </TableCell>
                    <TableCell className="space-x-2">
                      <Button
                        size="sm"
                        disabled={busyChatId === r.chat_id}
                        onClick={() => handleTelegramRequest(r.chat_id, 'approve')}
                      >
                        {busyChatId === r.chat_id ? '...' : t('page.approve')}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busyChatId === r.chat_id}
                        onClick={() => handleTelegramRequest(r.chat_id, 'reject')}
                      >
                        {busyChatId === r.chat_id ? '...' : t('page.reject')}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold" style={{ color: 'var(--text-hi)' }}>
            Invites
          </h2>
          <Button size="sm" disabled={generating} onClick={generateInvite}>
            {generating ? t('page.creating') : t('page.genInvite')}
          </Button>
        </div>

        {newCode && (
          <div
            className="text-sm rounded-lg px-3 py-2 mb-3"
            style={{ background: 'var(--surface-hi)', color: 'var(--accent-hi)' }}
          >
            Kode baru: <span className="font-mono font-semibold">{newCode}</span>
          </div>
        )}

        <div className="rounded-lg" style={{ border: '1px solid var(--border-faint)' }}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Expires</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invites.map((inv) => {
                const status = inviteStatus(inv);
                return (
                  <TableRow key={inv.code}>
                    <TableCell className="font-mono" style={{ color: 'var(--text-mid)' }}>
                      {inv.code}
                    </TableCell>
                    <TableCell>
                      <Badge variant={status.variant}>{status.label}</Badge>
                    </TableCell>
                    <TableCell style={{ color: 'var(--text-mute)' }}>
                      {new Date(inv.expires_at).toLocaleDateString('id-ID')}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </section>
    </div>
  );
}
