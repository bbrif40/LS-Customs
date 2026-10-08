// Execute the real endpoint handlers against a mocked Supabase HTTP boundary.
// No real users, provider calls, messages, or production data are touched.
type Handler = (req: Request) => Response | Promise<Response>;
const caller = '10000000-0000-0000-0000-000000000001';
const other = '10000000-0000-0000-0000-000000000002';
const bookingId = '20000000-0000-0000-0000-000000000001';
const savedEnvironment = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_ANON_KEY'].map(name => [name, Deno.env.get(name)] as const);
Deno.env.set('SUPABASE_URL', 'https://backend.example.test');
Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'test-service-role');
Deno.env.set('SUPABASE_ANON_KEY', 'test-anon');
const originalServe = Deno.serve;
let captured: Handler | undefined;
Deno.serve = ((handler: Handler) => { captured = handler; return {}; }) as unknown as typeof Deno.serve;
const handlers: Record<string, Handler> = {};
try {
  for (const name of ['dispatch-notification', 'send-receipt', 'create-payment-intent', 'assign-mechanic', 'send-booking-confirmation']) {
    await import(`../${name}/index.ts`);
    if (!captured) throw new Error('Handler was not registered');
    handlers[name] = captured; captured = undefined;
  }
} finally {
  Deno.serve = originalServe;
  for (const [name, value] of savedEnvironment) {
    if (value === undefined) Deno.env.delete(name); else Deno.env.set(name, value);
  }
}
function response(data: unknown) { return Response.json(data); }
async function call(name: string, body: unknown, rows: Record<string, unknown[]> = {}, authenticated = true) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = ((input: RequestInfo | URL) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    if (url.pathname === '/auth/v1/user') return Promise.resolve(response({ id: caller, email: 'qa@example.test' }));
    if (url.pathname === `/auth/v1/admin/users/${caller}`) return Promise.resolve(response({ user: { id: caller, email: 'qa@example.test' } }));
    if (url.pathname === '/rest/v1/rpc/reserve_booking_confirmation') return Promise.resolve(response(true));
    const table = url.pathname.match(/^\/rest\/v1\/(\w+)$/)?.[1];
    if (table && table in rows) return Promise.resolve(response(rows[table]));
    throw new Error(`Unexpected external request: ${url.pathname}`);
  }) as typeof fetch;
  try {
    return await handlers[name](new Request('https://functions.example.test', { method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(authenticated ? { Authorization: 'Bearer test-customer' } : {}) },
      body: JSON.stringify(body),
    }));
  } finally { globalThis.fetch = originalFetch; }
}
function status(actual: Response, expected: number) { if (actual.status !== expected) throw new Error(`Expected HTTP ${expected}, received ${actual.status}`); }
Deno.test('notification record shape cannot authenticate an unsigned caller', async () => {
  status(await call('dispatch-notification', { record: { id: bookingId, metadata: { dispatch_sms: true } } }, {}, false), 401);
});
Deno.test('receipt rejects missing transaction even if a recipient and amount are supplied', async () => {
  status(await call('send-receipt', { bookingId, customerEmail: 'attacker@example.test', amount: 1 }, { payments: [] }), 404);
});
Deno.test('receipt rejects another customer successful payment', async () => {
  status(await call('send-receipt', { paymentId: bookingId }, { payments: [{ id: bookingId, customer_id: other, status: 'succeeded' }], profiles: [{ role: 'customer' }] }), 403);
});
Deno.test('checkout rejects another customer booking before contacting a provider', async () => {
  status(await call('create-payment-intent', { booking_type: 'vehicle', booking_id: bookingId }, {
    vehicle_bookings: [{ customer_id: other, total_price: 2000, status: 'pending' }],
  }), 403);
});
Deno.test('checkout rejects external return destinations for an owned booking', async () => {
  status(await call('create-payment-intent', { booking_type: 'vehicle', booking_id: bookingId, success_url: 'https://attacker.example' }, {
    vehicle_bookings: [{ customer_id: caller, total_price: 2000, status: 'pending' }],
  }), 400);
});
Deno.test('checkout rejects a cancelled booking and an expired hold', async () => {
  for (const booking of [{ status: 'cancelled' }, { status: 'pending', hold_expires_at: '2020-01-01' }]) {
    status(await call('create-payment-intent', { booking_type: 'vehicle', booking_id: bookingId }, {
      vehicle_bookings: [{ customer_id: caller, total_price: 2000, ...booking }],
    }), 409);
  }
});
Deno.test('assignment rejects another customer booking', async () => {
  // assign-mechanic reads its auth URL/key per request, unlike the shared client.
  Deno.env.set('SUPABASE_URL', 'https://backend.example.test');
  try {
    status(await call('assign-mechanic', { service_booking_id: bookingId }, {
      service_bookings: [{ customer_id: other }], profiles: [{ role: 'customer' }],
    }), 403);
  } finally { Deno.env.delete('SUPABASE_URL'); }
});

Deno.test('confirmation rejects another customer booking', async () => {
  status(await call('send-booking-confirmation', { bookingId, bookingType: 'vehicle' }, {
    vehicle_bookings: [{ id: bookingId, customer_id: other, status: 'confirmed' }], profiles: [{ role: 'customer' }],
  }), 403);
});
Deno.test('confirmation rejects unapproved booking without contacting email provider', async () => {
  status(await call('send-booking-confirmation', { bookingId, bookingType: 'service' }, {
    service_bookings: [{ id: bookingId, customer_id: caller, status: 'pending' }], profiles: [{ role: 'customer' }],
  }), 409);
});
Deno.test('confirmation rejects missing login', async () => {
  status(await call('send-booking-confirmation', { bookingId, bookingType: 'vehicle' }, {}, false), 401);
});

Deno.test('approved unpaid booking sends only an approval confirmation from authoritative data', async () => {
  const { createConfirmationHandler } = await import('../send-booking-confirmation/index.ts');
  let emailed: import('./resend.ts').ReceiptEmailData | undefined;
  const original = handlers['send-booking-confirmation'];
  handlers['send-booking-confirmation'] = createConfirmationHandler(async data => { emailed = data; return { success: true, id: 'fixture-email' }; });
  try {
    status(await call('send-booking-confirmation', { bookingId, bookingType: 'vehicle', customerEmail: 'attacker@example.test', amount: 1 }, {
      vehicle_bookings: [{ id: bookingId, customer_id: caller, status: 'confirmed', total_price: 2800, start_date: '2026-12-10', end_date: '2026-12-12' }], profiles: [{ role: 'customer', full_name: 'QA Customer' }],
    }), 200);
    if (emailed?.documentKind !== 'confirmation' || emailed.customerEmail !== 'qa@example.test' || emailed.amount !== 2800 || !emailed.status?.includes('payment not certified'))
      throw new Error('Approval mail used caller-provided payment or identity fields');
  } finally { handlers['send-booking-confirmation'] = original; }
});

Deno.test('missing SMS provider never reports simulated success', async () => {
  const result = await call('dispatch-notification', { phone: '+639171234567', message: 'QA assigned', metadata: { dispatch_sms: true } }, { profiles: [{ role: 'admin' }] });
  const body = await result.json();
  if (body.data?.dispatched !== false || body.data?.simulated !== false || body.data?.channels.length !== 0)
    throw new Error('Missing provider was reported as delivery success');
});
Deno.test('customer cannot dispatch another customer notification even with override content', async () => {
  status(await call('dispatch-notification', { notification_id: bookingId, phone: '+639171234567', message: 'Spoofed' }, {
    profiles: [{ role: 'customer' }], notifications: [{ id: bookingId, user_id: other, metadata: {} }],
  }), 403);
});
