-- =============================================================================
-- LS Customs — Extend payment notification trigger to cover 'refunded' status
-- =============================================================================
-- The existing notify_on_payment_status_change function (created in
-- 20260902120000_notification_triggers_tickets_payments.sql) only fires
-- notifications for 'succeeded' and 'failed'. With the new refund-payment
-- edge function, 'refunded' must also trigger a customer notification.
--
-- This migration modifies ONLY the function body — the trigger object
-- (trg_notify_payment_status) stays attached and continues to fire AFTER
-- UPDATE OF status on public.payments.
--
-- Idempotent: uses `create or replace function` + `DROP TRIGGER IF EXISTS`
-- + re-create, so it is safe to re-run.
-- =============================================================================

create or replace function public.notify_on_payment_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  amount_text text;
  title_text  text;
  body_text   text;
begin
  if new.status is distinct from old.status
     and new.status in ('succeeded', 'failed', 'refunded')
     and new.customer_id is not null then

    amount_text := format('₱%s', to_char(new.amount, 'FM999,999,990.00'));

    if new.status = 'succeeded' then
      title_text := 'Payment received';
      body_text  := format('Your %s payment of %s succeeded.',
                           new.booking_type, amount_text);
    elsif new.status = 'failed' then
      title_text := 'Payment failed';
      body_text  := format('Your %s payment of %s could not be processed. '
                           || 'Please try a different payment method.',
                           new.booking_type, amount_text);
    elsif new.status = 'refunded' then
      title_text := 'Payment refunded';
      body_text  := format('Your %s payment of %s has been refunded. '
                           || 'The refund will appear on your statement '
                           || 'within 5–10 business days.',
                           new.booking_type, amount_text);
    end if;

    insert into public.notifications (user_id, type, title, body, metadata)
    values (
      new.customer_id,
      'payment_status_changed',
      title_text,
      body_text,
      jsonb_build_object(
        'payment_id',   new.id,
        'booking_id',   new.booking_id,
        'booking_type', new.booking_type,
        'amount',       new.amount,
        'currency',     new.currency,
        'provider',     new.provider,
        'new_status',   new.status
      )
    );
  end if;

  return new;
end;
$$;

-- Re-attach the trigger (safe to drop+recreate; the trigger name is unchanged)
drop trigger if exists trg_notify_payment_status on public.payments;
create trigger trg_notify_payment_status
  after update of status on public.payments
  for each row execute function public.notify_on_payment_status_change();

-- Keep the execute grant in sync
grant execute on function public.notify_on_payment_status_change() to public;
