-- Add mechanic_services to the supabase_realtime publication so customer
-- clients (e.g. useServices) can subscribe to catalog changes and see a
-- new service the admin just added without a hard refresh.
--
-- ponytail: only tables added to this publication emit postgres_changes
-- events. Notifications, support_ticket_messages, and the booking tables
-- may need the same treatment — add when their UIs need live updates.
alter publication supabase_realtime add table public.mechanic_services;
