import { vi } from 'vitest';

// A chainable query object that resolves to a given response
export function makeQueryChain(response: { data?: any; error?: any } = { data: null, error: null }) {
  const chain: any = {
    select: vi.fn().mockReturnThis(),
    filter: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue(response),
    single: vi.fn().mockResolvedValue(response),
  };
  chain.eq = vi.fn().mockImplementation(() => {
    const eqChain = { ...chain };
    eqChain.eq = vi.fn().mockResolvedValue(response);
    return eqChain;
  });
  chain.in = vi.fn().mockResolvedValue(response);
  chain.update = vi.fn().mockImplementation(() => {
    const updateChain: any = {};
    updateChain.eq = vi.fn().mockImplementation(() => {
      const eq2Chain: any = {};
      eq2Chain.eq = vi.fn().mockResolvedValue(response);
      eq2Chain.then = (res: any, rej: any) => Promise.resolve(response).then(res, rej);
      return eq2Chain;
    });
    updateChain.then = (res: any, rej: any) => Promise.resolve(response).then(res, rej);
    return updateChain;
  });
  chain.insert = vi.fn().mockResolvedValue(response);
  chain.delete = vi.fn().mockReturnValue({
    eq: vi.fn().mockResolvedValue(response),
    in: vi.fn().mockResolvedValue(response),
  });
  chain.or = vi.fn().mockReturnThis();
  chain.gte = vi.fn().mockReturnThis();
  chain.lte = vi.fn().mockReturnThis();
  chain.upsert = vi.fn().mockResolvedValue(response);
  return chain;
}

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
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
  };

  return { supabase, callCounts };
}
