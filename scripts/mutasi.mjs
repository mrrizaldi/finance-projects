#!/usr/bin/env node
import { createHmac } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ENV_FILE = process.env.MUTASI_ENV_FILE ?? join(ROOT, 'api', '.env');
const DEFAULT_BASE_URL = 'https://finance-dashboard.mrrizaldi.com';
const TOKEN_TTL_SECONDS = 900;
const MS_PER_SECOND = 1000;
const DESCRIPTION_PREVIEW = 70;
const ISO_DATE_LENGTH = 'yyyy-mm-dd'.length;
const ENV_LINE = /^([A-Z0-9_]+)=(.*)$/;

const USAGE = `Pemakaian: node scripts/mutasi.mjs <perintah>
  akun                                   daftar akun aktif (id, nama, saldo)
  unggah <account_id> <file...>          PDF (1) atau screenshot (1-10)
  lihat <import_id>                      ringkasan + semua baris
  daftar [account_id]                    20 import terakhir
  baris <import_id> <line_id> '<json>'   ubah selected/decision/category_id/target_account_id
  temuan <import_id> <transaction_id> <true|false>
  catat <import_id>                      commit (hanya setelah user setuju)
  batal <import_id>                      discard
Env: FINANCE_API_URL (default ${DEFAULT_BASE_URL}), MUTASI_USER_ID (default OWNER_USER_ID),
     SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_JWT_SECRET (dibaca dari ${ENV_FILE} kalau ada).`;

function loadEnv() {
  if (!existsSync(ENV_FILE)) return;
  for (const line of readFileSync(ENV_FILE, 'utf8').split('\n')) {
    const match = line.trim().match(ENV_LINE);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key] === undefined) process.env[key] = rawValue.replace(/^["']|["']$/g, '');
  }
}

function die(message) {
  console.error(message);
  process.exit(1);
}

const base64url = (text) => Buffer.from(text).toString('base64url');

function userToken() {
  const secret = process.env.SUPABASE_JWT_SECRET;
  const userId = process.env.MUTASI_USER_ID ?? process.env.OWNER_USER_ID;
  if (!secret || !userId) die('SUPABASE_JWT_SECRET dan MUTASI_USER_ID/OWNER_USER_ID wajib ada');
  const now = Math.floor(Date.now() / MS_PER_SECOND);
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = base64url(JSON.stringify({ sub: userId, role: 'authenticated', aud: 'authenticated', iat: now, exp: now + TOKEN_TTL_SECONDS }));
  const signature = createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${signature}`;
}

async function call(method, path, body) {
  const baseUrl = process.env.FINANCE_API_URL ?? DEFAULT_BASE_URL;
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { Authorization: `Bearer ${userToken()}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) die(`HTTP ${res.status}: ${JSON.stringify(json)}`);
  return json;
}

const rupiah = (value) => `Rp ${Math.round(Number(value)).toLocaleString('id-ID')}`;
const short = (text) => String(text ?? '').replace(/\s+/g, ' ').slice(0, DESCRIPTION_PREVIEW);

function printView(view) {
  const { import: imp, lines, transactions } = view;
  const txById = new Map(transactions.map((t) => [t.id, t]));
  const describeTx = (id) => {
    const tx = txById.get(id);
    return tx ? `${tx.transaction_date.slice(0, ISO_DATE_LENGTH)} ${tx.type} ${rupiah(tx.amount)} ${short(tx.description ?? tx.merchant)} [${tx.account_name}${tx.to_account_name ? ' → ' + tx.to_account_name : ''}]` : id;
  };
  const counts = lines.reduce((acc, l) => ({ ...acc, [l.decision]: (acc[l.decision] ?? 0) + 1 }), {});
  console.log(JSON.stringify({
    import_id: imp.id, status: imp.status, kind: imp.kind, bank: imp.bank, account_id: imp.account_id,
    period: `${imp.period_start}..${imp.period_end}`, integrity_ok: imp.integrity_ok,
    opening: imp.opening_balance, closing: imp.closing_balance, audit: imp.audit, counts,
    selected: lines.filter((l) => l.selected).length,
  }));
  for (const l of lines) {
    console.log(JSON.stringify({
      line_no: l.line_no, line_id: l.id, date: l.occurred_on, time: l.occurred_time, dir: l.direction,
      amount: Number(l.amount), decision: l.decision, selected: l.selected, confidence: Number(l.confidence),
      desc: short(l.counterparty ? `${l.counterparty} | ${l.description_raw}` : l.description_raw),
      matched: l.matched_transaction_id ? describeTx(l.matched_transaction_id) : null,
    }));
  }
  for (const f of imp.app_findings ?? []) {
    console.log(JSON.stringify({ finding: f.kind, transaction_id: f.transactionId, selected: f.selected, tx: describeTx(f.transactionId) }));
  }
}

async function listAccounts() {
  const url = process.env.SUPABASE_URL;
  const anon = process.env.SUPABASE_ANON_KEY;
  if (!url || !anon) die('SUPABASE_URL dan SUPABASE_ANON_KEY wajib ada');
  const res = await fetch(`${url}/rest/v1/accounts?is_active=eq.true&select=id,name,type,balance&order=name`, {
    headers: { apikey: anon, Authorization: `Bearer ${userToken()}` },
  });
  if (!res.ok) die(`HTTP ${res.status}: ${await res.text()}`);
  for (const a of await res.json()) console.log(JSON.stringify({ id: a.id, name: a.name, type: a.type, balance: rupiah(a.balance) }));
}

loadEnv();
const [, , command, ...args] = process.argv;

switch (command) {
  case 'akun':
    await listAccounts();
    break;
  case 'unggah': {
    const [accountId, ...files] = args;
    if (!accountId || files.length === 0) die(USAGE);
    const payload = { account_id: accountId, files: files.map((f) => ({ name: basename(f), content_base64: readFileSync(f).toString('base64') })) };
    printView(await call('POST', '/api/statements', payload));
    break;
  }
  case 'lihat':
    if (!args[0]) die(USAGE);
    printView(await call('GET', `/api/statements/${args[0]}`));
    break;
  case 'daftar': {
    const query = args[0] ? `?account_id=${encodeURIComponent(args[0])}` : '';
    for (const row of (await call('GET', `/api/statements${query}`)).data) console.log(JSON.stringify(row));
    break;
  }
  case 'baris': {
    const [importId, lineId, json] = args;
    if (!importId || !lineId || !json) die(USAGE);
    console.log(JSON.stringify((await call('PATCH', `/api/statements/${importId}/lines/${lineId}`, JSON.parse(json))).data));
    break;
  }
  case 'temuan': {
    const [importId, transactionId, value] = args;
    if (!importId || !transactionId || !['true', 'false'].includes(value)) die(USAGE);
    console.log(JSON.stringify((await call('PATCH', `/api/statements/${importId}/findings/${transactionId}`, { selected: value === 'true' })).data));
    break;
  }
  case 'catat':
    if (!args[0]) die(USAGE);
    console.log(JSON.stringify((await call('POST', `/api/statements/${args[0]}/commit`, {})).data));
    break;
  case 'batal':
    if (!args[0]) die(USAGE);
    console.log(JSON.stringify((await call('POST', `/api/statements/${args[0]}/discard`, {})).data));
    break;
  default:
    die(USAGE);
}
