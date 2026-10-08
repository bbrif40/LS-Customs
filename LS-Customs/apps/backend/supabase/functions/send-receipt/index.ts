import { getCorsHeaders, jsonResponse } from '../_shared/cors.ts';
import { createServiceClient, extractJwt } from '../_shared/supabaseClient.ts';
import { sendResendReceipt } from '../_shared/resend.ts';

Deno.serve(async (req: Request) => {
  const reply = (data: unknown, error: Parameters<typeof jsonResponse>[1], status = 200) => jsonResponse(data, error, status, req);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: getCorsHeaders(req) });
  if (req.method !== 'POST') return reply(null, { code: 'VALIDATION_ERROR', message: 'Use POST' }, 405);
  try {
    const client = createServiceClient();
    const { data: auth, error: authError } = await client.auth.getUser(extractJwt(req));
    if (authError || !auth.user) return reply(null, { code: 'UNAUTHENTICATED', message: 'Sign in to request a receipt' }, 401);
    const body = await req.json();
    if (!body.paymentId && !body.bookingId) return reply(null, { code: 'VALIDATION_ERROR', message: 'A payment or booking ID is required' }, 400);
    let query = client.from('payments').select('*').eq('status', 'succeeded');
    query = body.paymentId ? query.eq('id', body.paymentId) : query.eq('booking_id', body.bookingId)
      .eq('booking_type', ['rental', 'vehicle'].includes(body.bookingType) ? 'vehicle' : 'service');
    const { data: payment, error: paymentError } = await query.order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (paymentError) throw paymentError;
    if (!payment) return reply(null, { code: 'NOT_FOUND', message: 'A successful payment was not found' }, 404);
    const { data: caller } = await client.from('profiles').select('role').eq('id', auth.user.id).maybeSingle();
    if (payment.customer_id !== auth.user.id && caller?.role !== 'admin') return reply(null, { code: 'FORBIDDEN', message: 'Receipt access denied' }, 403);
    const rental = payment.booking_type === 'vehicle';
    const { data: booking, error: bookingError } = await client.from(rental ? 'vehicle_bookings' : 'service_bookings')
      .select('*').eq('id', payment.booking_id).eq('customer_id', payment.customer_id).maybeSingle();
    if (bookingError) throw bookingError;
    if (!booking) return reply(null, { code: 'NOT_FOUND', message: 'Booking not found' }, 404);
    const { data: recipient, error: recipientError } = await client.auth.admin.getUserById(payment.customer_id);
    if (recipientError) throw recipientError;
    if (!recipient.user?.email) return reply(null, { code: 'MISSING_EMAIL', message: 'Add an email to your account to receive a receipt' }, 422);
    const { data: profile } = await client.from('profiles').select('full_name').eq('id', payment.customer_id).maybeSingle();
    const { data: reserved, error: reserveError } = await client.rpc('reserve_receipt_delivery', { p_id: payment.id });
    if (reserveError) throw reserveError;
    if (!reserved) return reply(null, { code: 'RATE_LIMITED', message: 'A receipt was recently requested. Please wait one minute before trying again.' }, 429);
    const result = await sendResendReceipt({
      documentKind: 'receipt', customerName: profile?.full_name ?? 'Customer', customerEmail: recipient.user.email,
      bookingId: payment.booking_id, bookingType: rental ? 'rental' : 'service',
      amount: Number(payment.amount), status: 'Payment received',
      scheduledDate: rental ? `${booking.start_date} – ${booking.end_date}` : booking.scheduled_at,
      itemTitle: rental ? 'Vehicle rental' : 'Mobile mechanic service',
    });
    if (!result.success) return reply(null, { code: 'DELIVERY_ERROR', message: 'Receipt delivery failed. Please retry later.' }, 502);
    return reply({ sent: true, id: result.id, bookingId: payment.booking_id }, null);
  } catch (error) {
    console.error('Receipt request failed', error instanceof Error ? error.message : 'Unknown error');
    if (error && typeof error === 'object' && 'status' in error && error.status === 401)
      return reply(null, { code: 'UNAUTHENTICATED', message: 'Sign in to request a receipt' }, 401);
    return reply(null, { code: 'INTERNAL_ERROR', message: 'Receipt service is temporarily unavailable' }, 500);
  }
});
