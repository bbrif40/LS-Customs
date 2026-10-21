import { before, after, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { PGlite } from '@electric-sql/pglite'

const db = new PGlite()
const owner = '10000000-0000-4000-8000-000000000001'
const phone = '+639171234567'
const contactHash = 'a'.repeat(64), codeDigest = 'b'.repeat(64), wrongDigest = 'c'.repeat(64)
const reserve = (id, create = false, hash = contactHash) => db.query('select * from reserve_customer_phone_otp($1,$2,$3,$4,$5)', [phone,id,hash,codeDigest,create])
const consume = id => db.query('select consume_customer_phone_otp($1,$2) as owner', [id,codeDigest])
function isolated(name, work) { test(name, async()=>{await db.exec('begin');try{await work()}finally{await db.exec('rollback')}}) }

before(async()=>{
 await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
 create schema auth; create type public.user_role as enum ('customer','admin','mechanic');
 create table auth.users(id uuid primary key,email text,phone text,email_confirmed_at timestamptz,banned_until timestamptz,raw_user_meta_data jsonb default '{}');
 create table public.profiles(id uuid primary key references auth.users,full_name text not null,phone text,role user_role not null default 'customer');
 insert into auth.users(id,email,email_confirmed_at) values ('${owner}','original@example.invalid',now());
 insert into profiles values ('${owner}','Original Customer','0917 123 4567','customer');
 create table bookings(customer_id uuid references auth.users, reference text);
 insert into bookings values ('${owner}','existing-booking');`)
 await db.exec(await readFile('supabase/migrations/20261008120000_customer_phone_otp.sql','utf8'))
})
after(async()=>{await db.close()})

isolated('profile-only phone resolves the Google account and preserves its ID and bookings', async()=>{
 const id=randomUUID();assert.equal((await reserve(id)).rows[0].delivery,'profile');
 assert.equal((await consume(id)).rows[0].owner,owner)
 assert.equal((await db.query('select count(*)::int as count from auth.users')).rows[0].count,1)
 assert.equal((await db.query('select customer_id from bookings')).rows[0].customer_id,owner)
 assert.equal((await consume(id)).rows[0].owner,null)
})
isolated('invalid codes lock out after five attempts, including a later correct code',async()=>{
 const id=randomUUID();await reserve(id)
 for(let i=0;i<5;i++)assert.equal((await db.query('select consume_customer_phone_otp($1,$2) as owner',[id,wrongDigest])).rows[0].owner,null)
 assert.equal((await consume(id)).rows[0].owner,null)
})
isolated('expired codes cannot issue a session',async()=>{
 const id=randomUUID();await reserve(id);await db.query("update customer_phone_otp_challenges set expires_at=now()-interval '1 second' where id=$1",[id]);assert.equal((await consume(id)).rows[0].owner,null)
})
isolated('duplicate profile contacts and conflicting auth identities are not merged',async()=>{
 const stranger=randomUUID();await db.query('insert into auth.users(id,email,email_confirmed_at,phone) values($1,$2,now(),$3)',[stranger,'other@example.invalid','639171234567']);
 assert.equal((await reserve(randomUUID())).rows[0].delivery,'conflict')
 await db.query('update auth.users set phone=null where id=$1',[stranger]);await db.query('insert into profiles values($1,$2,$3,$4)',[stranger,'Other Customer',phone,'customer']);
 assert.equal((await reserve(randomUUID(),false,'d'.repeat(64))).rows[0].delivery,'conflict')
})
isolated('unknown login does not create an account; registration permits the normal Supabase path',async()=>{
 await db.exec('delete from profiles');const id=randomUUID();assert.equal((await reserve(id)).rows[0].delivery,'profile');assert.equal((await consume(id)).rows[0].owner,null)
 assert.equal((await reserve(randomUUID(),true,'d'.repeat(64))).rows[0].delivery,'supabase')
 assert.equal((await db.query('select count(*)::int as count from auth.users')).rows[0].count,1)
})
isolated('existing auth SMS identity uses Supabase, not profile recovery',async()=>{
 await db.query('update auth.users set phone=$1 where id=$2',['639171234567',owner]);assert.equal((await reserve(randomUUID())).rows[0].delivery,'supabase')
})
isolated('phone removed after sending a code invalidates that code',async()=>{
 const id=randomUUID();await reserve(id);await db.query('update profiles set phone=null where id=$1',[owner]);assert.equal((await consume(id)).rows[0].owner,null)
})
isolated('admin profiles do not gain an unverified phone recovery path',async()=>{
 await db.query("update profiles set role='admin' where id=$1",[owner]);const id=randomUUID();await reserve(id);assert.equal((await consume(id)).rows[0].owner,null)
})
isolated('send cooldown and hourly quota are durable',async()=>{
 await reserve(randomUUID());assert.equal((await reserve(randomUUID())).rows[0].delivery,'rate_limited');
 for(let i=0;i<2;i++){await db.exec("update customer_phone_otp_challenges set created_at=created_at-interval '61 seconds'");assert.equal((await reserve(randomUUID())).rows[0].delivery,'profile')}
 await db.exec("update customer_phone_otp_challenges set created_at=created_at-interval '61 seconds'");assert.equal((await reserve(randomUUID())).rows[0].delivery,'rate_limited')
})
for(const role of ['anon','authenticated'])isolated(`${role} cannot read challenges or invoke the service-only account lookup`,async()=>{
 await db.exec(`set role ${role};savepoint denied`)
 await assert.rejects(db.query('select * from customer_phone_otp_challenges'),/permission denied/);await db.exec('rollback to savepoint denied')
 await assert.rejects(reserve(randomUUID()),/permission denied/);await db.exec('rollback to savepoint denied')
 await assert.rejects(consume(randomUUID()),/permission denied/);await db.exec('rollback to savepoint denied;reset role')
})
