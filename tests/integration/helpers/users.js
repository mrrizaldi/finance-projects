// tests/integration/helpers/users.js
// Create a real auth user (admin), sign in to get a JWT, and delete it after.
const SB_URL = 'https://dqvdhkpqyynvwfbuqyzu.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY = process.env.SUPABASE_ANON_KEY;

if (!SERVICE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY not set');
if (!ANON_KEY) throw new Error('SUPABASE_ANON_KEY not set');

const admin = (path, init = {}) =>
  fetch(`${SB_URL}${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });

// Query REST as a specific user (RLS applies). jwt=null => anonymous.
export function asUser(jwt) {
  return (path, init = {}) =>
    fetch(`${SB_URL}/rest/v1${path}`, {
      ...init,
      headers: {
        apikey: ANON_KEY,
        Authorization: `Bearer ${jwt ?? ANON_KEY}`,
        'Content-Type': 'application/json',
        ...(init.headers || {}),
      },
    });
}

// Hapus user test beserta barisnya. Urutan penting: FK ke auth.users gak pakai
// cascade, jadi delete user duluan bakal ditolak dan user-nya nyangkut selamanya.
export async function deleteTestUser(userId) {
  if (!userId) return;
  for (const tbl of ['transactions', 'installments', 'recurring_transactions',
                      'budgets', 'instruments', 'categories', 'accounts']) {
    await admin(`/rest/v1/${tbl}?user_id=eq.${userId}`, { method: 'DELETE' });
  }
  await admin(`/rest/v1/profiles?id=eq.${userId}`, { method: 'DELETE' });
  const res = await admin(`/auth/v1/admin/users/${userId}`, { method: 'DELETE' });
  // Jangan gagal diam-diam — user nyangkut numpuk tiap run.
  if (!res.ok) throw new Error(`hapus user test ${userId} gagal: ${res.status} ${await res.text()}`);
}

export async function createTestUser(email, password = 'Test-Passw0rd!') {
  const res = await admin('/auth/v1/admin/users', {
    method: 'POST',
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  const user = await res.json();
  if (!user.id) throw new Error(`create user failed: ${JSON.stringify(user)}`);

  const signin = await fetch(`${SB_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const session = await signin.json();
  if (!session.access_token) throw new Error(`signin failed: ${JSON.stringify(session)}`);

  return { userId: user.id, jwt: session.access_token, cleanup: () => deleteTestUser(user.id) };
}
