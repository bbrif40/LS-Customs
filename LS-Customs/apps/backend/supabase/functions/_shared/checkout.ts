/** Validate hosted return destinations before handing them to a payment provider. */
export function validateCheckoutRedirect(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string') throw new Error('Invalid checkout return URL');
  const url = new URL(value);
  const origins = (Deno.env.get('ALLOWED_ORIGINS') ?? 'https://ls-customs-web.vercel.app')
    .split(',').map((origin) => origin.trim());
  if (url.protocol !== 'https:' || !origins.includes(url.origin) || url.username || url.password) {
    throw new Error('Checkout must return to an approved website');
  }
  return url.href;
}
