import { createServiceClient, extractJwt } from '../_shared/supabaseClient.ts';
import { getCorsHeaders, jsonResponse } from '../_shared/cors.ts';
import { sendResendReceipt } from '../_shared/resend.ts';

// Approval acknowledgement; it never creates a payment or claims money was paid.
export const createConfirmationHandler = (send = sendResendReceipt) => async (req: Request): Promise<Response> => {
  const reply = (data: unknown, error: Parameters<typeof jsonResponse>[1], status = 200) => jsonResponse(data, error, status, req);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: getCorsHeaders(req) });
  if (req.method !== 'POST') return reply(null, { code: 'METHOD_NOT_ALLOWED', message: 'Use POST.' }, 405);
  try {
    const client = createServiceClient();
    const { data: auth, error: authError } = await client.auth.getUser(extractJwt(req));
    if (authError || !auth.user) return reply(null, { code: 'UNAUTHENTICATED', message: 'Sign in.' }, 401);
    let body: unknown;
    try { body = await req.json(); } catch { return reply(null, { code: 'INVALID_REQUEST', message: 'Invalid JSON.' }, 400); }
    if (!body || typeof body !== 'object') return reply(null, { code: 'INVALID_REQUEST', message: 'Invalid booking.' }, 400);
    const input = body as Record<string, unknown>;
    if (typeof input.bookingId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.bookingId)
      || !['vehicle','service'].includes(String(input.bookingType)))
      return reply(null, { code: 'INVALID_REQUEST', message: 'Invalid booking.' }, 400);
    const rental = input.bookingType === 'vehicle';
    const { data: booking, error } = await client.from(rental ? 'vehicle_bookings' : 'service_bookings')
      .select('*').eq('id', input.bookingId).maybeSingle();
    if (error) throw new Error('Booking lookup failed');
    if (!booking) return reply(null, { code: 'NOT_FOUND', message: 'Booking not found.' }, 404);
    const { data: caller } = await client.from('profiles').select('role').eq('id', auth.user.id).maybeSingle();
    if (booking.customer_id !== auth.user.id && caller?.role !== 'admin')
      return reply(null, { code: 'FORBIDDEN', message: 'Booking access denied.' }, 403);
    if (!['confirmed','assigned','en_route','in_progress','completed'].includes(booking.status))
      return reply(null, { code: 'INVALID_STATE', message: 'This booking has not been approved.' }, 409);
    const { data: recipient, error: recipientError } = await client.auth.admin.getUserById(booking.customer_id);
    if (recipientError) throw new Error('Recipient lookup failed');
    if (!recipient.user?.email) return reply(null, { code: 'MISSING_EMAIL', message: 'Add an email to receive confirmation.' }, 422);
    const { data: reservation, error: reservationError } = await client.rpc('reserve_booking_confirmation', { p_type: input.bookingType, p_id: input.bookingId });
    if (reservationError) throw new Error('Delivery reservation failed');
    if (!reservation) return reply(null, { code: 'RATE_LIMITED', message: 'Please wait one minute before retrying.' }, 429);
    const { data: customer } = await client.from('profiles').select('full_name').eq('id', booking.customer_id).maybeSingle();
    const result = await send({
      documentKind: 'confirmation', customerName: customer?.full_name ?? 'Customer', customerEmail: recipient.user.email,
      bookingId: booking.id, bookingType: rental ? 'rental' : 'service', amount: Number(booking.total_price),
      scheduledDate: rental ? `${booking.start_date} – ${booking.end_date}` : booking.scheduled_at,
      status: 'Booking approved — payment not certified', itemTitle: rental ? 'Vehicle rental' : 'Mobile mechanic service',
    });
    if (!result.success) return reply(null, { code: 'DELIVERY_ERROR', message: 'Confirmation email failed. Retry later.' }, 502);
    return reply({ accepted: true, providerId: result.id, bookingId: booking.id, documentKind: 'confirmation' }, null);
  } catch (error) {
    if (error && typeof error === 'object' && 'status' in error && error.status === 401)
      return reply(null, { code: 'UNAUTHENTICATED', message: 'Sign in.' }, 401);
    console.error('[booking-confirmation]', error instanceof Error ? error.message : 'Request failed');
    return reply(null, { code: 'UNAVAILABLE', message: 'Confirmation is unavailable. Please retry later.' }, 500);
  }
};
Deno.serve(createConfirmationHandler());
