import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../src/app.js';
import { createServiceClient } from '../src/lib/supabase.js';

const SB_URL = process.env.SUPABASE_URL;
const ANON_KEY = process.env.SUPABASE_ANON_KEY;
const HAS_ENV = Boolean(SB_URL && ANON_KEY && process.env.SUPABASE_SERVICE_ROLE_KEY);
const PNG_1PX = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const UPLOAD_TEST_TIMEOUT_MS = 20_000;

describe.skipIf(!HAS_ENV)('receipts API end to end', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let user: { userId: string; jwt: string; cleanup: () => Promise<void> };
  let accountId: string;
  let categoryId: string;
  let txId: string;
  let receiptId: string;
  let other: { userId: string; jwt: string; cleanup: () => Promise<void> };
  const asUser = (method: 'GET' | 'POST' | 'DELETE', url: string, body?: unknown) =>
    app.inject({ method, url, payload: body as any, headers: { authorization: `Bearer ${user.jwt}` } });
  const rest = async (path: string, init: RequestInit = {}) => {
    const res = await fetch(`${SB_URL}/rest/v1${path}`, {
      ...init,
      headers: {
        apikey: ANON_KEY!, Authorization: `Bearer ${user.jwt}`, 'Content-Type': 'application/json',
        Prefer: 'return=representation', ...(init.headers ?? {}),
      },
    });
    return res.json();
  };

  beforeAll(async () => {
    process.env.DISABLE_AUTH = 'false';
    process.env.GEMINI_API_KEY = '';
    const helpers = await import('../../tests/integration/helpers/users.js');
    user = await helpers.createTestUser(`receipt-api-${Date.now()}@example.com`);
    const [account] = await rest('/accounts', { method: 'POST', body: JSON.stringify({ name: 'TEST_RECEIPT_API', type: 'bank', balance: 0, is_active: false }) });
    accountId = account.id;
    const [category] = await rest('/categories', { method: 'POST', body: JSON.stringify({ name: 'TEST_Makan_API', type: 'expense' }) });
    categoryId = category.id;
    txId = await rest('/rpc/record_manual_entry', {
      method: 'POST',
      body: JSON.stringify({ p_account: accountId, p_type: 'expense', p_amount: 52000, p_category: categoryId, p_merchant: 'INDOMARET', p_date: new Date().toISOString() }),
    });
    other = await helpers.createTestUser(`receipt-api-b-${Date.now()}@example.com`);
    app = await buildApp();
  });

  afterAll(async () => {
    await app?.close();
    if (receiptId) {
      const service = createServiceClient();
      const { data } = await service.from('receipt_files').select('path').eq('receipt_id', receiptId);
      if (data?.length) await service.storage.from('receipts').remove(data.map((f) => f.path));
    }
    await user?.cleanup();
    await other?.cleanup();
  });

  it('menolak tanpa token', async () => {
    expect((await app.inject({ method: 'POST', url: '/api/receipts', payload: { files: [] } })).statusCode).toBe(401);
  });

  it('upload gambar: draft dibuat, file tersimpan, ekstraksi gagal tercatat, kandidat kosong', async () => {
    const res = await asUser('POST', '/api/receipts', { files: [{ name: 'struk.png', content_base64: PNG_1PX }] });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    receiptId = body.receipt.id;
    expect(body.receipt.status).toBe('draft');
    expect(body.lines).toEqual([]);
    expect(body.extractionError).toContain('GEMINI_API_KEY');
    expect(body.candidates).toEqual([]);
    const files = await rest(`/receipt_files?receipt_id=eq.${receiptId}&select=path,mime`);
    expect(files).toHaveLength(1);
    expect(files[0].mime).toBe('image/png');
  });

  it('simpan draft ke transaksi yang ada, lalu ambil lewat by-transaction dengan signed URL', async () => {
    const save = await asUser('POST', '/api/receipts/save', {
      receipt_id: receiptId, transaction_id: txId, new_transaction: null,
      lines: [{ kind: 'item', name: 'Roti', qty: 1, amount: 52000, category_id: categoryId }],
    });
    expect(save.statusCode).toBe(200);
    expect(save.json().data).toEqual({ receipt_id: receiptId, transaction_id: txId });
    const view = await asUser('GET', `/api/receipts/by-transaction/${txId}`);
    expect(view.statusCode).toBe(200);
    const body = view.json();
    expect(body.receipt.status).toBe('saved');
    expect(body.lines).toHaveLength(1);
    expect(body.files[0].url).toContain('/storage/v1/object/sign/receipts/');
  });

  it('file yang sama lagi → 409 menunjuk rincian tersimpan', async () => {
    const res = await asUser('POST', '/api/receipts', { files: [{ name: 'lagi.png', content_base64: PNG_1PX }] });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ receipt_id: receiptId, transaction_id: txId });
  });

  it('validasi save: kind ngawur → 400, transaksi sudah punya rincian → 409', async () => {
    const bad = await asUser('POST', '/api/receipts/save', { receipt_id: null, transaction_id: txId, new_transaction: null, lines: [{ kind: 'gaib', name: 'x', amount: 1 }] });
    expect(bad.statusCode).toBe(400);
    const dup = await asUser('POST', '/api/receipts/save', { receipt_id: null, transaction_id: txId, new_transaction: null, lines: [{ kind: 'item', name: 'x', qty: 1, amount: 1000, category_id: null }] });
    expect(dup.statusCode).toBe(409);
  });

  it('user lain: GET dan DELETE struk orang lain 404, struk asli utuh', async () => {
    const asOther = (method: 'GET' | 'DELETE', url: string) =>
      app.inject({ method, url, headers: { authorization: `Bearer ${other.jwt}` } });
    expect((await asOther('GET', `/api/receipts/by-transaction/${txId}`)).statusCode).toBe(404);
    expect((await asOther('DELETE', `/api/receipts/${receiptId}`)).statusCode).toBe(404);
    expect(await rest(`/receipts?id=eq.${receiptId}&select=id`)).toHaveLength(1);
  });

  it('401 tanpa token di tiga route lain', async () => {
    expect((await app.inject({ method: 'GET', url: `/api/receipts/by-transaction/${txId}` })).statusCode).toBe(401);
    expect((await app.inject({ method: 'POST', url: '/api/receipts/save', payload: {} })).statusCode).toBe(401);
    expect((await app.inject({ method: 'DELETE', url: `/api/receipts/${receiptId}` })).statusCode).toBe(401);
  });

  it('hapus rincian: baris dan file hilang, by-transaction jadi 404', async () => {
    const del = await asUser('DELETE', `/api/receipts/${receiptId}`);
    expect(del.statusCode).toBe(200);
    expect((await asUser('GET', `/api/receipts/by-transaction/${txId}`)).statusCode).toBe(404);
    const { data } = await createServiceClient().storage.from('receipts').list(`${user.userId}/${receiptId}`);
    expect(data ?? []).toHaveLength(0);
    receiptId = '';
  });

  it('item nominal 0 ditolak 400 dengan pesan ramah', async () => {
    const res = await asUser('POST', '/api/receipts/save', { receipt_id: null, transaction_id: txId, new_transaction: null, lines: [{ kind: 'item', name: 'x', qty: 1, amount: 0, category_id: null }] });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain('Nominal atau jumlah item');
  });

  it('file kembar dalam satu upload dijadikan satu', async () => {
    const res = await asUser('POST', '/api/receipts', { files: [{ name: 'a.png', content_base64: PNG_1PX }, { name: 'b.png', content_base64: PNG_1PX }] });
    expect(res.statusCode).toBe(201);
    receiptId = res.json().receipt.id;
    expect(await rest(`/receipt_files?receipt_id=eq.${receiptId}&select=path`)).toHaveLength(1);
  });

  it('upload ulang file yang sama menimpa draft lama sendiri', async () => {
    const first = await asUser('POST', '/api/receipts', { files: [{ name: 'a.png', content_base64: PNG_1PX }] });
    expect(first.statusCode).toBe(201);
    const oldId = first.json().receipt.id;
    const second = await asUser('POST', '/api/receipts', { files: [{ name: 'b.png', content_base64: PNG_1PX }] });
    expect(second.statusCode).toBe(201);
    receiptId = second.json().receipt.id;
    expect(receiptId).not.toBe(oldId);
    expect(await rest(`/receipts?id=eq.${oldId}&select=id`)).toHaveLength(0);
  }, UPLOAD_TEST_TIMEOUT_MS);

  it('file bukan gambar/PDF ditolak 415', async () => {
    const res = await asUser('POST', '/api/receipts', { files: [{ name: 'x.txt', content_base64: Buffer.from('halo bukan gambar').toString('base64') }] });
    expect(res.statusCode).toBe(415);
  });
});
