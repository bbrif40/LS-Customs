import { Client } from 'pg'

const DB_URL = 'postgresql://postgres:postgres@127.0.0.1:55422/postgres'
const client = new Client({ connectionString: DB_URL })
await client.connect()

console.log('--- Trigger functions ---')
const { rows: fns } = await client.query(`
  select proname as name
  from pg_proc
  where pronamespace = 'public'::regnamespace
    and proname in (
      'notify_on_status_change',
      'notify_on_ticket_admin_reply',
      'notify_on_payment_status_change',
      'notify_on_ticket_status_change'
    )
  order by proname
`)
fns.forEach((r) => console.log(' ✓', r.name))

console.log('\n--- Triggers ---')
const { rows: trgs } = await client.query(`
  select trigger_name, event_object_table
  from information_schema.triggers
  where trigger_schema = 'public'
    and trigger_name in (
      'trg_notify_ticket_admin_reply',
      'trg_notify_payment_status',
      'trg_notify_ticket_status'
    )
  order by trigger_name
`)
trgs.forEach((r) => console.log(` ✓ ${r.trigger_name} → ${r.event_object_table}`))

console.log('\n--- Existing booking triggers (sanity check) ---')
const { rows: bk } = await client.query(`
  select trigger_name, event_object_table
  from information_schema.triggers
  where trigger_schema = 'public'
    and trigger_name in (
      'trg_notify_vehicle_booking_status',
      'trg_notify_service_booking_status'
    )
  order by trigger_name
`)
bk.forEach((r) => console.log(` ✓ ${r.trigger_name} → ${r.event_object_table}`))

await client.end()
