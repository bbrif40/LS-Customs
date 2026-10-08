const {chromium}=require('C:/Users/acer/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('fs'),assert=require('node:assert/strict');
const base=process.env.QA_URL||'http://127.0.0.1:5174/', label=process.env.QA_LABEL||'admin-remediation';
const id='11111111-1111-4111-8111-111111111111', customer='22222222-2222-4222-8222-222222222222', mechanic='33333333-3333-4333-8333-333333333333', rentalId='44444444-4444-4444-8444-444444444444', serviceId='55555555-5555-4555-8555-555555555555';
const user={id,email:'qa-admin@example.test',aud:'authenticated',role:'authenticated',user_metadata:{full_name:'QA Admin'},app_metadata:{provider:'email'}};
const session={access_token:'qa-fixture-only',refresh_token:'fixture-refresh',token_type:'bearer',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,user};
const rental={id:rentalId,vehicle_id:'66666666-6666-4666-8666-666666666666',customer_id:customer,start_date:'2026-12-10',end_date:'2026-12-12',created_at:'2026-10-01T02:00:00Z',status:'confirmed',total_price:2800,pickup_location:'QA pickup',vehicles:{name:'QA Sedan',image_url:null},profiles:{id:customer,full_name:'QA Customer',phone:null}};
const service={id:serviceId,customer_id:customer,mechanic_id:null,scheduled_at:'2026-10-15T02:00:00Z',created_at:'2026-10-01T02:00:00Z',status:'confirmed',total_price:500,notes:'QA street',pin_lat:null,pin_lng:null,profiles:{id:customer,full_name:'QA Customer',phone:null},service_booking_items:[{mechanic_services:{name:'QA Oil Change'}}]};
(async()=>{
 const browser=await chromium.launch({headless:true});const context=await browser.newContext({viewport:{width:1440,height:1000}}), page=await context.newPage();page.setDefaultTimeout(15000);
 const errors=[],requests=[],checks=[];page.on('pageerror',e=>errors.push(e.message));
 await context.addInitScript(s=>localStorage.setItem('sb-reyghhsjiwyabhgbgubt-auth-token',JSON.stringify(s)),session);
 await page.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url());
  if(url.pathname.startsWith('/auth/v1/'))return route.fulfill({json:user});
  if(url.pathname.startsWith('/functions/v1/')){requests.push({path:url.pathname,method:req.method(),body:req.postDataJSON()});return route.fulfill({status:502,json:{data:null,error:{code:'DELIVERY_ERROR',message:'QA provider failure'}}});}
  if(url.pathname.startsWith('/rest/v1/')){
   requests.push({path:url.pathname,method:req.method(),body:req.postData()?req.postDataJSON():null,query:url.search});const table=url.pathname.split('/')[3],single=(req.headers().accept||'').includes('object');
   if(req.method()==='PATCH'&&table==='vehicle_bookings')Object.assign(rental,req.postDataJSON());
   if(req.method()==='PATCH'&&table==='service_bookings')Object.assign(service,req.postDataJSON());
   if(table==='mechanic_profiles'&&url.searchParams.get('select')?.split(',').includes('user_id'))return route.fulfill({status:400,json:{message:'Unknown user_id column'}});
   const admin={id,role:'admin',full_name:'QA Admin'},mechanicProfile={id:mechanic,role:'mechanic',full_name:'QA Mechanic',phone:null};
   let data=table==='profiles'?(single?admin:[admin,{id:customer,full_name:'QA Customer',role:'customer'},mechanicProfile]):table==='vehicle_bookings'?[rental]:table==='service_bookings'?[service]:table==='mechanic_profiles'?[{id:mechanic,is_available:true,profiles:mechanicProfile}]:table==='customer_site_settings'?{settings:{}}:[];
   if(table==='profiles'&&url.searchParams.get('id')?.startsWith('eq.')){const wanted=url.searchParams.get('id').slice(3);data=[admin,{id:customer,full_name:'QA Customer',role:'customer'},mechanicProfile].filter(p=>p.id===wanted);}
   return route.fulfill({json:single?(Array.isArray(data)?data[0]??null:data):(Array.isArray(data)?data:[data]),headers:{'content-range':Array.isArray(data)?`0-${Math.max(0,data.length-1)}/${data.length}`:'0-0/0'}});
  }
  return route.continue();
 });
 try{
  await page.goto(new URL('/admin',base).href,{waitUntil:'networkidle'});
  assert.match(await page.getByRole('button',{name:/^Total Revenue/}).innerText(),/\u20b10/);checks.push('overview displays only real payments');
  await page.getByRole('button',{name:/^Bookings/}).click();await page.getByRole('heading',{name:'Bookings Overview'}).waitFor();
  assert.equal(errors.length,0,errors.join('\n'));checks.push('admin startup has no duplicate-channel exception');
  const row=page.locator('tr').filter({hasText:'QA Sedan'});await row.locator('button[title="View Details"]').click();
  await page.getByText('Amount Paid:',{exact:true}).waitFor();await page.waitForTimeout(100);
  const modal=page.locator('.admin-modal-overlay');assert.match(await modal.innerText(),/\u20b10/);assert.match(await modal.innerText(),/\u20b12,800/);checks.push('unpaid details show zero paid and real outstanding');
  await modal.getByRole('button',{name:'Close',exact:true}).click();
  await row.locator('button[title="Edit"]').click();await page.getByRole('textbox',{name:'Booking instructions'}).fill('Updated QA pickup');await page.getByRole('button',{name:'Save instructions'}).click();await page.getByRole('dialog',{name:'Edit booking instructions'}).waitFor({state:'hidden'});
  assert.equal(rental.pickup_location,'Updated QA pickup');checks.push('edit persists instructions');
  await page.getByRole('button',{name:/Mechanic Services/}).click();
  const serviceRow=page.locator('tr').filter({hasText:'55555555'});assert.equal(await serviceRow.locator('button[title="Assign Mechanic"]').count(),1);checks.push('confirmed service can be assigned');
  await page.getByRole('button',{name:/Vehicle Rentals/}).click();
  await row.locator('select').selectOption('completed');await page.waitForTimeout(300);
  assert.equal(rental.status,'completed');assert.ok(!requests.some(r=>r.path==='/rest/v1/payments'&&r.method!=='GET'));checks.push('completion does not manufacture payments');
  await page.getByRole('button',{name:/^Revenue/}).click();await page.waitForTimeout(300);assert.ok(!requests.some(r=>r.path==='/rest/v1/payments'&&r.method!=='GET'));checks.push('revenue is read-only');
  assert.equal(errors.length,0,errors.join('\n'));
  fs.writeFileSync(`artifacts/apk-test/${label}-results.json`,JSON.stringify({passed:true,checks,errors,requests},null,2));console.log(JSON.stringify({passed:true,checks,errors}));
 }catch(error){console.error(error);console.log((await page.locator('body').innerText()).slice(0,3500));process.exitCode=1;}
 await browser.close();
})();