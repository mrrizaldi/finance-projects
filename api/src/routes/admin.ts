import type { FastifyInstance } from 'fastify';
import { randomBytes } from 'node:crypto';
import { requireUser, createServiceClient } from '../lib/supabase.js';

async function requireAdmin(request: any, reply: any) {
  const { supabase, user, unauthorized } = await requireUser(request);
  if (unauthorized || !supabase) {
    reply.code(401).send({ error: 'Unauthorized' });
    return null;
  }
  const { data: isAdmin } = await (supabase as any).rpc('is_admin');
  if (!isAdmin) {
    reply.code(403).send({ error: 'Forbidden' });
    return null;
  }
  return { user, admin: createServiceClient() };
}

export default async function plugin(app: FastifyInstance) {
  app.get('/api/admin/users', async (request, reply) => {
    try {
      const ctx = await requireAdmin(request, reply);
      if (!ctx) return;
      const { admin } = ctx;

      const { data: authList, error: authError } = await (admin as any).auth.admin.listUsers();
      if (authError) return reply.code(500).send({ error: authError.message });

      const { data: profiles, error: profilesError } = await admin
        .from('profiles').select('id, display_name, is_admin');
      if (profilesError) return reply.code(500).send({ error: profilesError.message });

      const { data: telegramLinks, error: telegramError } = await admin
        .from('telegram_links').select('chat_id, user_id');
      if (telegramError) return reply.code(500).send({ error: telegramError.message });

      const profileById = new Map((profiles || []).map((p: any) => [p.id, p]));
      const linkedUserIds = new Set((telegramLinks || []).map((l: any) => l.user_id));

      const users = (authList?.users || []).map((u: any) => {
        const profile = profileById.get(u.id);
        return {
          id: u.id,
          email: u.email,
          display_name: profile?.display_name ?? null,
          is_admin: profile?.is_admin ?? false,
          telegram_linked: linkedUserIds.has(u.id),
          created_at: u.created_at,
        };
      });

      return users;
    } catch (error: any) {
      return reply.code(500).send({ error: error?.message || 'Internal server error' });
    }
  });

  app.get('/api/admin/invites', async (request, reply) => {
    try {
      const ctx = await requireAdmin(request, reply);
      if (!ctx) return;
      const { admin } = ctx;

      const { data, error } = await admin
        .from('invite_codes').select('*').order('created_at', { ascending: false });
      if (error) return reply.code(500).send({ error: error.message });

      return data;
    } catch (error: any) {
      return reply.code(500).send({ error: error?.message || 'Internal server error' });
    }
  });

  app.post('/api/admin/invites', async (request, reply) => {
    try {
      const ctx = await requireAdmin(request, reply);
      if (!ctx) return;
      const { admin, user } = ctx;

      const code = randomBytes(4).toString('hex');
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

      const { error } = await admin
        .from('invite_codes')
        .insert({ code, created_by: user!.id, expires_at: expiresAt });
      if (error) return reply.code(500).send({ error: error.message });

      return { code, expires_at: expiresAt };
    } catch (error: any) {
      return reply.code(500).send({ error: error?.message || 'Internal server error' });
    }
  });

  app.post('/api/admin/users/:id/suspend', async (request, reply) => {
    try {
      const ctx = await requireAdmin(request, reply);
      if (!ctx) return;
      const { admin, user } = ctx;

      const { id } = request.params as { id: string };
      const { suspend } = (request.body as any) || {};

      if (id === user!.id) return reply.code(400).send({ error: 'Tidak bisa suspend diri sendiri' });

      const { error } = await (admin as any).auth.admin.updateUserById(id, {
        ban_duration: suspend ? '87600h' : 'none',
      });
      if (error) return reply.code(500).send({ error: error.message });

      return { ok: true, banned: !!suspend };
    } catch (error: any) {
      return reply.code(500).send({ error: error?.message || 'Internal server error' });
    }
  });
}
