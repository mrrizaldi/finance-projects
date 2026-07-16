// Sign a Supabase-compatible HS256 user JWT with the project JWT secret.
import crypto from 'node:crypto';

const b64url = (s) => Buffer.from(s).toString('base64url');

export function signUserJwt(userId, secret, ttlSeconds = 300) {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const now = Math.floor(Date.now() / 1000);
  const payload = b64url(JSON.stringify({
    sub: userId, role: 'authenticated', aud: 'authenticated',
    iat: now, exp: now + ttlSeconds,
  }));
  const data = `${header}.${payload}`;
  const sig = crypto.createHmac('sha256', secret).update(data).digest('base64url');
  return `${data}.${sig}`;
}
