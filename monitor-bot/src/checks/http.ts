import axios from 'axios';

export interface HttpCheckResult {
  name: string;
  url: string;
  ok: boolean;
  statusCode?: number;
  latencyMs?: number;
  error?: string;
}

export async function checkHttp(name: string, url: string, timeoutMs = 5_000): Promise<HttpCheckResult> {
  const start = Date.now();
  try {
    const res = await axios.get(url, {
      timeout: timeoutMs,
      // Any HTTP response (even 401/403) = service is UP
      validateStatus: () => true,
      maxRedirects: 3,
    });
    return {
      name,
      url,
      ok: res.status < 500,
      statusCode: res.status,
      latencyMs: Date.now() - start,
    };
  } catch (err: any) {
    return {
      name,
      url,
      ok: false,
      latencyMs: Date.now() - start,
      error: err.code === 'ECONNREFUSED'
        ? 'Connection refused'
        : err.code === 'ETIMEDOUT' || err.message?.includes('timeout')
          ? 'Timeout'
          : err.message?.slice(0, 80),
    };
  }
}
