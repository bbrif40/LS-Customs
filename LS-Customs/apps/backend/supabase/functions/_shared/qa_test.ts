import { validateCheckoutRedirect } from './checkout.ts';
import { escapeHtml } from './html.ts';
import { computeHmacSha256, normalizeWebhookEvent, retrievePaymentIntent, verifyWebhookSignature } from './paymentProvider.ts';
import { normalizeAuthContact } from '../../../../web/src/utils/authContact.ts';
import { addCalendarDays } from '../../../../web/src/utils/bookingDates.ts';

function equal(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`);
}
function rejectsRedirect(url: string) {
  let rejected = false;
  try { validateCheckoutRedirect(url); } catch { rejected = true; }
  equal(rejected, true);
}
Deno.test('checkout accepts only configured HTTPS origins without credentials', () => {
  const previous = Deno.env.get('ALLOWED_ORIGINS');
  Deno.env.set('ALLOWED_ORIGINS', 'https://ls-customs-web.vercel.app');
  try {
    equal(validateCheckoutRedirect(undefined), undefined);
    equal(validateCheckoutRedirect('https://ls-customs-web.vercel.app/bookings'), 'https://ls-customs-web.vercel.app/bookings');
    for (const url of ['https://evil.example', 'http://ls-customs-web.vercel.app', 'https://ls-customs-web.vercel.app.evil.example', 'javascript:alert(1)', 'https://user:pass@ls-customs-web.vercel.app']) rejectsRedirect(url);
  } finally { if (previous === undefined) Deno.env.delete('ALLOWED_ORIGINS'); else Deno.env.set('ALLOWED_ORIGINS', previous); }
});
Deno.test('receipt values cannot introduce HTML tags or attributes', () => {
  equal(escapeHtml('<img src=x onerror="alert(1)"> & \'quoted\''), '&lt;img src=x onerror=&quot;alert(1)&quot;&gt; &amp; &#39;quoted&#39;');
});
Deno.test('Stripe verifies raw bytes and rejects tampering and stale signed events', async () => {
  const savedProvider = Deno.env.get('PAYMENT_PROVIDER'), savedSecret = Deno.env.get('PAYMENT_PROVIDER_WEBHOOK_SECRET');
  Deno.env.set('PAYMENT_PROVIDER', 'stripe'); Deno.env.set('PAYMENT_PROVIDER_WEBHOOK_SECRET', 'test-webhook-secret');
  try {
    const body = '{"type":"payment_intent.succeeded"}', timestamp = Math.floor(Date.now() / 1000);
    const signature = await computeHmacSha256('test-webhook-secret', `${timestamp}.${body}`);
    const request = new Request('https://example.test', { headers: { 'stripe-signature': `t=${timestamp},v1=${signature}` } });
    equal((await verifyWebhookSignature(request, body, 'stripe')).verified, true);
    equal((await verifyWebhookSignature(request, body + ' ', 'stripe')).verified, false);
    const stale = timestamp - 600, staleSignature = await computeHmacSha256('test-webhook-secret', `${stale}.${body}`);
    equal((await verifyWebhookSignature(new Request('https://example.test', { headers: { 'stripe-signature': `t=${stale},v1=${staleSignature}` } }), body, 'stripe')).verified, false);
    equal((await verifyWebhookSignature(new Request('https://example.test'), body, 'stripe')).verified, false);
  } finally {
    for (const [name, value] of [['PAYMENT_PROVIDER', savedProvider], ['PAYMENT_PROVIDER_WEBHOOK_SECRET', savedSecret]]) {
      if (value === undefined) Deno.env.delete(name!); else Deno.env.set(name!, value);
    }
  }
});
Deno.test('PayMongo paid checkout preserves session and related intent references', () => {
  const event = normalizeWebhookEvent('paymongo', { data: { id: 'evt_test', attributes: { type: 'checkout_session.payment.paid', data: {
    id: 'cs_test', type: 'checkout_session', attributes: { payment_intent: { id: 'pi_test' }, payments: [{ id: 'pay_test' }] },
  } } } });
  equal(event?.type, 'payment_intent.succeeded'); equal(event?.providerReference, 'cs_test');
  equal(event?.alternateReferences, ['pi_test', 'pay_test']);
});
Deno.test('resuming Stripe retrieves the client secret instead of returning the provider ID', async () => {
  const originalFetch = globalThis.fetch, previous = Deno.env.get('PAYMENT_PROVIDER');
  Deno.env.set('PAYMENT_PROVIDER', 'stripe');
  globalThis.fetch = ((input: RequestInfo | URL) => {
    equal(String(input), 'https://api.stripe.com/v1/payment_intents/pi_test');
    return Promise.resolve(Response.json({ id: 'pi_test', client_secret: 'pi_test_secret_test' }));
  }) as typeof fetch;
  try { equal(await retrievePaymentIntent('pi_test', 'stripe'), { client_secret: 'pi_test_secret_test' }); }
  finally { globalThis.fetch = originalFetch; if (previous === undefined) Deno.env.delete('PAYMENT_PROVIDER'); else Deno.env.set('PAYMENT_PROVIDER', previous); }
});
Deno.test('Philippine mobile entry normalizes local numbers and preserves international numbers', () => {
  equal(normalizeAuthContact('0917 123 4567'), '+639171234567');
  equal(normalizeAuthContact('9171234567'), '+639171234567');
  equal(normalizeAuthContact('+1 (202) 555-0123'), '+12025550123');
  equal(normalizeAuthContact(' qa@example.test '), 'qa@example.test');
  let rejected = false;
  try { normalizeAuthContact('123'); } catch { rejected = true; }
  equal(rejected, true);
});
Deno.test('live PayMongo rejects a test-mode signature, even when its HMAC is valid', async () => {
  const names = ['PAYMENT_PROVIDER', 'PAYMONGO_MODE', 'PAYMONGO_WEBHOOK_SECRET'];
  const saved = names.map(name => Deno.env.get(name));
  Deno.env.set('PAYMENT_PROVIDER', 'paymongo'); Deno.env.set('PAYMONGO_MODE', 'live'); Deno.env.set('PAYMONGO_WEBHOOK_SECRET', 'test-webhook-secret');
  try {
    const body = '{}', timestamp = Math.floor(Date.now() / 1000);
    const signature = await computeHmacSha256('test-webhook-secret', `${timestamp}.${body}`);
    for (const [field, expected] of [['te', false], ['li', true]] as const) {
      const request = new Request('https://example.test', { headers: { 'paymongo-signature': `t=${timestamp},${field}=${signature}` } });
      equal((await verifyWebhookSignature(request, body, 'paymongo')).verified, expected);
    }
  } finally { names.forEach((name, index) => saved[index] === undefined ? Deno.env.delete(name) : Deno.env.set(name, saved[index]!)); }
});
Deno.test('rental calendar arithmetic preserves return dates across month and leap-year boundaries', () => {
  equal(addCalendarDays('2026-10-06', 1), '2026-10-07');
  equal(addCalendarDays('2026-10-06', 30), '2026-11-05');
  equal(addCalendarDays('2028-02-28', 1), '2028-02-29');
});
