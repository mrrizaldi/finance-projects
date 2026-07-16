#!/usr/bin/env node
// Tests: Supabase auth REST flow — login, logout, forgot-password → reset → login
// No browser: drives the same auth endpoints the dashboard's supabase-js client hits.

import { test, expect, runSuite } from './run.js';

const SB_URL = 'https://dqvdhkpqyynvwfbuqyzu.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY = process.env.SUPABASE_ANON_KEY;

if (!SERVICE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY not set');
if (!ANON_KEY) throw new Error('SUPABASE_ANON_KEY not set');

const EMAIL = `authflow-${Date.now()}@example.com`;
const PASSWORD = 'Test-Passw0rd!';
const NEW_PASSWORD = 'Test-Passw0rd-New!';

async function adminCreateUser(email, password) {
  const res = await fetch(`${SB_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  const data = await res.json();
  if (!data.id) throw new Error(`create user failed: ${JSON.stringify(data)}`);
  return data.id;
}

async function adminDeleteUser(userId) {
  await fetch(`${SB_URL}/auth/v1/admin/users/${userId}`, {
    method: 'DELETE',
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  });
}

async function login(email, password) {
  const res = await fetch(`${SB_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  return { status: res.status, data: await res.json() };
}

async function getUser(accessToken) {
  const res = await fetch(`${SB_URL}/auth/v1/user`, {
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${accessToken}` },
  });
  return { status: res.status, data: await res.json() };
}

async function logout(accessToken) {
  const res = await fetch(`${SB_URL}/auth/v1/logout`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${accessToken}` },
  });
  return res.status;
}

async function generateRecoveryLink(email) {
  const res = await fetch(`${SB_URL}/auth/v1/admin/generate_link`, {
    method: 'POST',
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'recovery', email }),
  });
  return { status: res.status, data: await res.json() };
}

async function verifyRecovery(tokenHash) {
  const res = await fetch(`${SB_URL}/auth/v1/verify`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'recovery', token_hash: tokenHash }),
  });
  return { status: res.status, data: await res.json() };
}

async function setPassword(accessToken, password) {
  const res = await fetch(`${SB_URL}/auth/v1/user`, {
    method: 'PUT',
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  return { status: res.status, data: await res.json() };
}

let userId;
try {
  userId = await adminCreateUser(EMAIL, PASSWORD);

  await runSuite('Auth flow — login / logout / recovery', async () => {

    await test('login succeeds with correct password, session is valid', async () => {
      const { status, data } = await login(EMAIL, PASSWORD);
      expect(status).toBe(200);
      expect(!!data.access_token).toBe(true);

      const who = await getUser(data.access_token);
      expect(who.status).toBe(200);
    });

    await test('login fails with wrong password', async () => {
      const { status } = await login(EMAIL, 'not-the-password');
      expect(status).toBe(400);
    });

    await test('logout returns 204', async () => {
      const { data } = await login(EMAIL, PASSWORD);
      const status = await logout(data.access_token);
      expect(status).toBe(204);
    });

    await test('forgot password → reset → login with new password', async () => {
      const link = await generateRecoveryLink(EMAIL);
      expect(link.status).toBe(200);
      // Response shape check: hashed_token can live at top level or under `properties`.
      const tokenHash = link.data.hashed_token ?? link.data.properties?.hashed_token;
      expect(!!tokenHash).toBe(true);

      const recovery = await verifyRecovery(tokenHash);
      expect(recovery.status).toBe(200);
      expect(!!recovery.data.access_token).toBe(true);

      const changed = await setPassword(recovery.data.access_token, NEW_PASSWORD);
      expect(changed.status).toBe(200);

      const okNew = await login(EMAIL, NEW_PASSWORD);
      expect(okNew.status).toBe(200);

      const failsOld = await login(EMAIL, PASSWORD);
      expect(failsOld.status).toBe(400);
    });
  });
} finally {
  if (userId) await adminDeleteUser(userId);
}
