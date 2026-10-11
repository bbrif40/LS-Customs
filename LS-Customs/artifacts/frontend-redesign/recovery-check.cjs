// Isolated frontend hook checks; no database writes or network requests.
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ts = require('typescript');
function harness(file) {
  let values = [], cursor = 0, responses = [];
  const react = { useState(initial) { const i = cursor++; if (!(i in values)) values[i] = initial; return [values[i], value => { values[i] = typeof value === 'function' ? value(values[i]) : value; }]; }, useCallback: fn => fn, useEffect() {}, useRef: value => ({current:value}), createContext: () => ({}) };
  const query = new Proxy({}, { get(_, name) { return name === 'then' ? (resolve, reject) => Promise.resolve(responses.shift() ?? {data:[],count:0,error:null}).then(resolve, reject) : () => query; } });
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, require: name => name === 'react' ? react : name.includes('supabaseClient') ? {supabase:{from:()=>query}} : {}, console, Date, setTimeout });
  return { run(name, ...args) { cursor=0; return module.exports[name](...args); }, queue(...items) {responses.push(...items);}, values };
}
(async () => {
  const h = harness('apps/web/src/hooks/useCustomerBookings.ts');
  h.queue({data:[{id:'test-booking', status:'confirmed', start_date:'2026-10-12'}],error:null},{data:[],error:null},{data:[],error:null});
  await h.run('useCustomerBookings','test-user').refetch();
  let state=h.run('useCustomerBookings','test-user');
  assert.equal(state.vehicleBookings.length,1); assert.ok(state.updatedAt); assert.equal(state.loading,false);
  const timestamp=state.updatedAt;
  h.queue({data:null,error:{message:'offline'}},{data:[],error:null});
  const pending=state.refetch();
  state=h.run('useCustomerBookings','test-user'); assert.equal(state.loading,true); assert.equal(state.vehicleBookings.length,1);
  await pending; state=h.run('useCustomerBookings','test-user');
  assert.equal(state.error,'offline'); assert.equal(state.vehicleBookings.length,1); assert.equal(state.updatedAt,timestamp); assert.equal(state.loading,false);
  h.queue({data:[],error:null},{data:[],error:null}); await state.refetch();
  state=h.run('useCustomerBookings','test-user'); assert.equal(state.error,null); assert.equal(state.vehicleBookings.length,0);
  console.log('PASS: success timestamp, visible snapshot during refresh, failure retention, and empty recovery.');
  for (const [file, hook, field] of [['useAdminOverviewStats','useAdminOverviewStats','stats'],['useLiveTechnicians','useLiveTechnicians','technicians'],['useRecentBookings','useRecentBookings','bookings']]) {
    const admin=harness(`apps/web/src/hooks/${file}.ts`);
    await admin.run(hook).refetch();
    let before=admin.run(hook); assert.ok(before.updatedAt); assert.equal(before.error,null);
    const snapshot=before[field], updated=before.updatedAt;
    admin.queue({data:null,error:new Error('offline')}); await before.refetch();
    let failed=admin.run(hook); assert.ok(failed.error); assert.equal(failed.loading,false); assert.equal(failed[field],snapshot); assert.equal(failed.updatedAt,updated);
    await failed.refetch(); const recovered=admin.run(hook); assert.equal(recovered.error,null); assert.ok(recovered.updatedAt);
    console.log(`PASS: ${hook} independent failure, retained snapshot, successful retry.`);
  }
})().catch(error => { console.error(error); process.exitCode=1; });
