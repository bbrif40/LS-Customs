import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { createTestDatabase } from './test-database.ts'
const { db, customer, stranger, admin, service, as, fails, isolated } = createTestDatabase(6)
isolated('radius covers Manila, north Bulacan and south Cavite without geocoding', async () => {
  await as('authenticated', customer)
  for (const [lat,lng] of [[14.5995,120.9842],[14.8443,120.8104],[15.142,120.976],[14.3294,120.9367],[14.1153,120.9621]]) {
    const { rows } = await db.query(`select verify_service_pin(${lat},${lng}) as checked`)
    assert.equal(rows[0].checked.radius_km,100)
    assert.ok(rows[0].checked.id)
  }
  await fails('select verify_service_pin(16.4023,120.596)', /outside the 100 km/)
  await fails('select verify_service_pin(91,120)', /valid map location/)
})
isolated('pin attestations belong to the customer and cannot be forged', async () => {
  await as('authenticated',customer)
  await db.query('select verify_service_pin(14.6,121)')
  assert.equal((await db.query('select * from service_location_checks')).rows.length,1)
  await as('authenticated',stranger)
  assert.equal((await db.query('select * from service_location_checks')).rows.length,0)
  await fails(`insert into service_location_checks(customer_id,area_id,lat,lng) values('${stranger}','cf000000-0000-4000-8000-000000000001',14.6,121)`, /permission denied|row-level security/)
  await as('anon'); await fails('select verify_service_pin(14.6,121)',/permission denied/)
})
isolated('only admins change coverage; changes invalidate outstanding checks and are audited', async () => {
  await as('authenticated',customer)
  await db.query('select verify_service_pin(14.6,121)')
  await db.query('update service_coverage set radius_km=50 where id')
  assert.equal((await db.query('select radius_km from service_coverage')).rows[0].radius_km,'100')
  await as('authenticated',admin)
  await db.query('update service_coverage set radius_km=50 where id')
  await as('postgres')
  assert.equal((await db.query('select count(*)::int n from service_location_checks where expires_at>now()')).rows[0].n,0)
  assert.equal((await db.query("select count(*)::int n from admin_audit_logs where action_type='coverage_changed'")).rows[0].n,1)
})
isolated('new terms retain historical versions and describe the radius',async()=>{
  const {rows}=await db.query("select version,content from transaction_terms where active")
  assert.equal(rows[0].version,'2026-10-21'); assert.match(rows[0].content,/100 km from Manila/)
  assert.equal((await db.query("select count(*)::int n from transaction_terms where version='2026-10-20'")).rows[0].n,1)
})

isolated('radius attestation creates a booking with current terms and coverage changes invalidate it',async()=>{
 await as('authenticated',customer)
 const request=randomUUID()
 await db.query(`select accept_transaction_terms('${request}','service','2026-10-21')`)
 const checked=(await db.query('select verify_service_pin(14.6,121) as checked')).rows[0].checked.id
 const sql=`select * from create_service_booking('${request}','${service}',(current_date+1+time '10:00') at time zone 'Asia/Manila',null,14.6,121,'Test location',null,null,'cash','${checked}')`
 const booking=(await db.query(sql)).rows[0]
 assert.equal(booking.customer_id,customer)
 assert.equal((await db.query(sql)).rows[0].id,booking.id)
 const next=randomUUID()
 await db.query(`select accept_transaction_terms('${next}','service','2026-10-21')`)
 await as('authenticated',admin); await db.query('update service_coverage set radius_km=90 where id')
 await as('authenticated',customer)
 await fails(sql.replaceAll(request,next),/location|coverage|verified|check/i)
})
