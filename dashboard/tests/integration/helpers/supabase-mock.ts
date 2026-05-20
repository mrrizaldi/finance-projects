import { vi } from 'vitest';

// A chainable query object that resolves to a given response
export function makeQueryChain(response: { data?: any; error?: any } = { data: null, error: null }) {
  const chain: any = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    filter: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue(response),
    single: vi.fn().mockResolvedValue(response),
    // Resolve the chain directly (for update().eq() terminal patterns)
    then: undefined as any,
  };
  // Make the chain itself thenable (for `await supabase.from().update().eq()`)
  const resolved = Promise.resolve(response);
  chain.eq = vi.fn().mockImplementation(() => {
    const eqChain = { ...chain };
    eqChain.eq = vi.fn().mockResolvedValue(response); // second .eq() resolves
    return eqChain;
  });
  chain.in = vi.fn().mockResolvedValue(response);
  // update() must support multiple chained .eq() calls before awaiting
  chain.update = vi.fn().mockImplementation(() => {
    const updateChain: any = {};
    updateChain.eq = vi.fn().mockImplementation(() => {
      const eq2Chain: any = {};
      eq2Chain.eq = vi.fn().mockResolvedValue(response);
      // Make eq2Chain itself awaitable for single-eq patterns
      Object.assign(eq2Chain, Promise.resolve(response));
      eq2Chain.then = (res: any, rej: any) => Promise.resolve(response).then(res, rej);
      return eq2Chain;
    });
    // Make updateChain itself awaitable for zero-eq patterns
    updateChain.then = (res: any, rej: any) => Promise.resolve(response).then(res, rej);
    return updateChain;
  });
  chain.insert = vi.fn().mockResolvedValue(response);
  chain.delete = vi.fn().mockReturnValue({
    eq: vi.fn().mockResolvedValue(response),
  });
  return chain;
}

// Build a Supabase mock with per-table, per-call response sequences
export function makeSupabaseMock(
  tableResponses: Record<string, Array<{ data?: any; error?: any }>>
) {
  const callCounts: Record<string, number> = {};

  const supabase = {
    from: vi.fn().mockImplementation((table: string) => {
      callCounts[table] = (callCounts[table] ?? 0);
      const responses = tableResponses[table] ?? [{ data: null, error: null }];
      const idx = callCounts[table]++;
      const response = responses[Math.min(idx, responses.length - 1)];
      return makeQueryChain(response);
    }),
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
  };

  return { supabase, callCounts };
}

// Standard unauthorized mock response
export function makeUnauthorizedMock() {
  return new Response(JSON.stringify({ error: 'Unauthorized' }), {
    status: 401,
    headers: { 'content-type': 'application/json' },
  });
}
