import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readBookingDraft, saveBookingDraft, clearBookingDraft, clearBookingDrafts } from '../../web/src/utils/bookingDraft.ts'
import { serviceCategoryLabel } from '../../web/src/utils/serviceCategory.ts'
import { coverageRing } from '../../web/src/utils/serviceCoverage.ts'
const storage: Record<string,string> = {}
Object.defineProperty(globalThis, 'sessionStorage', { configurable:true, value: storage })
Object.defineProperties(storage, {
 getItem: { value:(key:string)=>storage[key] ?? null },
 setItem: { value:(key:string,value:string)=>{storage[key]=value} },
 removeItem: { value:(key:string)=>{delete storage[key]} },
})
test('booking drafts retain a request ID across reload and isolate accounts',()=>{
 saveBookingDraft('alice','mechanic',{requestId:'same-attempt',step:'review',serviceId:'live-catalog-id'})
 assert.equal(readBookingDraft<{requestId:string}>('alice','mechanic')?.requestId,'same-attempt')
 assert.equal(readBookingDraft('bob','mechanic'),null)
 saveBookingDraft('bob','rental',{date:'2026-10-25'})
 saveBookingDraft('alice','rental',{date:'2026-10-26'})
 clearBookingDraft('alice','mechanic')
 assert.equal(readBookingDraft('alice','mechanic'),null)
 assert.ok(readBookingDraft('alice','rental'))
 clearBookingDrafts('alice')
 assert.equal(readBookingDraft('alice','mechanic'),null)
 assert.ok(readBookingDraft('bob','rental'))
})
test('expired, malformed or unsupported drafts cannot break booking',()=>{
 storage['ls-customs:draft:alice:mechanic']='invalid json'
 assert.equal(readBookingDraft('alice','mechanic'),null)
 storage['ls-customs:draft:alice:mechanic']=JSON.stringify({version:1,savedAt:Date.now()-86400001,data:{step:'review'}})
 assert.equal(readBookingDraft('alice','mechanic'),null)
 Object.defineProperty(globalThis,'sessionStorage',{configurable:true,get(){throw new Error('Blocked')}})
 assert.doesNotThrow(()=>saveBookingDraft('alice','mechanic',{}))
 assert.equal(readBookingDraft('alice','mechanic'),null)
 assert.doesNotThrow(()=>clearBookingDrafts('alice'))
})
test('category keys display readable names and coverage ring reaches Bulacan and Cavite latitudes',()=>{
 assert.equal(serviceCategoryLabel('routine_fluid_service'),'Routine & Fluid Service')
 const ring=coverageRing({center_lat:14.5995,center_lng:120.9842,radius_km:100,active:true})
 assert.equal(ring.length,65)
 assert.ok(Math.max(...ring.map(p=>p[1]))>15.14)
 assert.ok(Math.min(...ring.map(p=>p[1]))<14.12)
 assert.ok(Math.abs(ring[0][0]-ring[64][0])<1e-9)
})
