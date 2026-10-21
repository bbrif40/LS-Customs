type Handler = (req: Request) => Response | Promise<Response>;
let handler: Handler;
const originalServe = Deno.serve;
Deno.serve = ((callback: Handler) => { handler = callback; return {}; }) as unknown as typeof Deno.serve;
try { await import('../textbee-sms-hook/index.ts'); } finally { Deno.serve = originalServe; }

Deno.test('Auth SMS hook rejects unsigned callers and forwards authenticated OTP payloads', async () => {
  const names = ['SUPABASE_SERVICE_ROLE_KEY', 'OPERATIONS_WORKER_TOKEN', 'TEXTBEE_API_KEY', 'TEXTBEE_DEVICE_ID'];
  const saved = names.map(name => Deno.env.get(name));
  const originalFetch = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = ((_input: RequestInfo | URL, init?: RequestInit) => {
    requests++;
    const body = JSON.parse(String(init?.body));
    if (body.recipients?.[0] !== '+639000000000' || body.message !== 'Your LS Customs verification code is: 123456')
      throw new Error('Hook did not forward the Auth phone and OTP');
    return Promise.resolve(Response.json({ success: true }));
  }) as typeof fetch;
  try {
    names.forEach((name, index) => Deno.env.set(name, ['service-secret', 'worker-secret', 'mock-api-key', 'mock-device'][index]));
    const call = (token?: string, method = 'POST') => handler(new Request('https://example.test/hook', {
      method, headers: token ? { Authorization: `Bearer ${token}` } : {},
      ...(method === 'POST' ? { body: JSON.stringify({ user: { phone: '+639000000000' }, sms: { otp: '123456' } }) } : {}),
    }));
    for (const token of [undefined, 'public-anon-key', 'wrong-token']) {
      if ((await call(token)).status !== 401) throw new Error('Unauthenticated request accepted');
    }
    if (requests !== 0) throw new Error('Rejected caller reached SMS provider');
    if ((await call('worker-secret', 'GET')).status !== 405) throw new Error('GET accepted');
    for (const token of ['worker-secret', 'service-secret']) {
      if ((await call(token)).status !== 200) throw new Error('Authorized OTP failed');
    }
    // The mocked fetch increments this inside a closure, which TypeScript's narrowing cannot see.
    if ((requests as number) !== 2) throw new Error('Unexpected SMS request count');
    Deno.env.delete('SUPABASE_SERVICE_ROLE_KEY'); Deno.env.delete('OPERATIONS_WORKER_TOKEN');
    if ((await call()).status !== 401) throw new Error('Missing server secrets allowed access');
  } finally {
    globalThis.fetch = originalFetch;
    names.forEach((name, index) => { const value = saved[index]; if (value === undefined) Deno.env.delete(name); else Deno.env.set(name, value); });
  }
});
