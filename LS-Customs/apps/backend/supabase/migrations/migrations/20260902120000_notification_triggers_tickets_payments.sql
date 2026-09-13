-- =============================================================================
-- LS Customs — Notification triggers: support tickets + payments
-- =============================================================================
-- Complements the existing `notify_on_status_change` trigger (which only
-- covers vehicle_bookings.status and service_bookings.status) by emitting
-- notifications for:
--
--   1. support_ticket_messages: admin reply on a customer's ticket
--      → notify the customer ("Support replied")
--   2. payments: status change to 'succeeded' or 'failed'
--      → notify the customer ("Payment received" / "Payment failed")
--   3. support_tickets: status moves to 'resolved' or 'closed'
--      → notify the customer ("Ticket resolved" / "Ticket closed")
--
-- All three follow the same shape as notify_on_status_change: a single
-- SECURITY DEFINER function inserts one row into public.notifications with
-- a stable `type`, a friendly `title`, a `body`, and a `metadata` JSONB
-- that the customer-app renderer can branch on.
--
-- Notification types emitted (so the frontend can switch on them):
--   ticket_admin_reply       — admin posted a message on a ticket
--   payment_status_changed   — payments.status moved to succeeded | failed
--   ticket_status_changed    — support_tickets.status moved to resolved | closed
--
-- For type 1 we deliberately only notify on ADMIN replies — the customer's
-- own message is the trigger, but a notification echoing their own words
-- back at them is noise. The type prefix makes it easy to extend later.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) support_ticket_messages → ticket_admin_reply
-- -----------------------------------------------------------------------------
-- AFTER INSERT: when an admin posts a message on a ticket, notify the
-- ticket's customer. Skips the customer's own replies (they don't need a
-- notification for what they just typed).
-- -----------------------------------------------------------------------------
create or replace function public.notify_on_ticket_admin_reply()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  ticket_customer_id uuid;
  ticket_tracking    text;
  ticket_subject     text;
begin
  if new.author_role <> 'admin' then
    return new;
  end if;

  select customer_id, tracking_number, subject
    into ticket_customer_id, ticket_tracking, ticket_subject
    from public.support_tickets
   where id = new.ticket_id;

  if ticket_customer_id is null then
    return new;
  end if;

  insert into public.notifications (user_id, type, title, body, metadata)
  values (
    ticket_customer_id,
    'ticket_admin_reply',
    'Support replied',
    format('New reply on ticket %s: %s',
           coalesce(ticket_tracking, substring(new.ticket_id::text, 1, 8)),
           ticket_subject),
    jsonb_build_object(
      'ticket_id',         new.ticket_id,
      'tracking_number',   ticket_tracking,
      'subject',           ticket_subject,
      'message_id',        new.id,
      'author_id',         new.author_id
    )
  );

  return new;
end;
$$;

create trigger trg_notify_ticket_admin_reply
  after insert on public.support_ticket_messages
  for each row execute function public.notify_on_ticket_admin_reply();

-- -----------------------------------------------------------------------------
-- 2) payments → payment_status_changed (succeeded | failed only)
-- -----------------------------------------------------------------------------
-- AFTER UPDATE OF status: notify the customer when a payment moves to
-- 'succeeded' or 'failed'. Idempotent at the trigger level (only fires
-- when status actually changed because of OF status, and we explicitly
-- guard on the new value).
-- -----------------------------------------------------------------------------
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
     and new.status in ('succeeded', 'failed')
     and new.customer_id is not null then

    amount_text := format('₱%s', to_char(new.amount, 'FM999,999,990.00'));

    if new.status = 'succeeded' then
      title_text := 'Payment received';
      body_text  := format('Your %s payment of %s succeeded.',
                           new.booking_type, amount_text);
    else
      title_text := 'Payment failed';
      body_text  := format('Your %s payment of %s could not be processed. '
                           || 'Please try a different payment method.',
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

create trigger trg_notify_payment_status
  after update of status on public.payments
  for each row execute function public.notify_on_payment_status_change();

-- -----------------------------------------------------------------------------
-- 3) support_tickets → ticket_status_changed (resolved | closed)
-- -----------------------------------------------------------------------------
-- AFTER UPDATE OF status: notify the customer when their ticket is moved
-- to 'resolved' or 'closed'. We skip the intermediate 'in_progress' (set
-- by the existing tg_ticket_message_sync_status trigger) to avoid
-- double-notifying for every admin reply.
-- -----------------------------------------------------------------------------
create or replace function public.notify_on_ticket_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  title_text text;
  body_text  text;
begin
  if new.status is distinct from old.status
     and new.status in ('resolved', 'closed')
     and new.customer_id is not null then

    if new.status = 'resolved' then
      title_text := 'Ticket resolved';
      body_text  := format('Your ticket %s has been marked as resolved. '
                           || 'If your issue is still open, just reply and '
                           || 'we''ll re-open the conversation.',
                           coalesce(new.tracking_number,
                                    substring(new.id::text, 1, 8)));
    else
      title_text := 'Ticket closed';
      body_text  := format('Your ticket %s has been closed.',
                           coalesce(new.tracking_number,
                                    substring(new.id::text, 1, 8)));
    end if;

    insert into public.notifications (user_id, type, title, body, metadata)
    values (
      new.customer_id,
      'ticket_status_changed',
      title_text,
      body_text,
      jsonb_build_object(
        'ticket_id',        new.id,
        'tracking_number',  new.tracking_number,
        'old_status',       old.status,
        'new_status',       new.status,
        'subject',          new.subject
      )
    );
  end if;

  return new;
end;
$$;

create trigger trg_notify_ticket_status
  after update of status on public.support_tickets
  for each row execute function public.notify_on_ticket_status_change();

-- -----------------------------------------------------------------------------
-- Grants
-- -----------------------------------------------------------------------------
-- Same "function added after the original GRANT" pattern as the existing
-- migrations. Without this, calls from RLS-enforced contexts (the
-- trigger functions run as SECURITY DEFINER, so this is belt-and-braces
-- for any direct RPC calls — safe to include for parity).
-- -----------------------------------------------------------------------------
grant execute on function public.notify_on_ticket_admin_reply() to public;
grant execute on function public.notify_on_payment_status_change() to public;
grant execute on function public.notify_on_ticket_status_change() to public;
