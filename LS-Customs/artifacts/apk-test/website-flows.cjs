const { chromium } = require('C:/Users/acer/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs = require('fs'), assert = require('node:assert/strict');
const base = process.env.QA_URL || 'http://127.0.0.1:5173/';
const label = process.env.QA_LABEL || 'website-flows';
const user = {id:'11111111-1111-4111-8111-111111111111',aud:'authenticated',role:'authenticated',email:'qa@example.invalid',phone:'+15555550123',user_metadata:{full_name:'QA Customer'},app_metadata:{provider:'phone'},created_at:new Date().toISOString()};
const session = {access_token:'qa-fixture-token',refresh_token:'qa-fixture-refresh',token_type:'bearer',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,user};
const profile = {id:user.id,full_name:'QA Customer',phone:user.phone,role:'customer',avatar_url:null};
const vehicle = {id:'22222222-2222-4222-8222-222222222222',name:'QA Sedan',category:'sedans',sub_category:null,seats:5,transmission:'Automatic',fuel_type:'Gasoline',price_per_day:1500,image_url:null,gallery_urls:[],location:'QA Garage',rating_avg:4.5,host_rating:4.8,features:[],rental_rules:[],delivery_methods:[],is_active:true};
const service = {id:'33333333-3333-4333-8333-333333333333',name:'QA Oil Change',main_category:'routine_fluid_service',description:'Test catalog service',base_price:500,estimated_duration_minutes:60,is_active:true};
const now = new Date().toISOString();
const rental = {id:'44444444-4444-4444-8444-444444444444',vehicle_id:vehicle.id,start_date:'2026-10-15',end_date:'2026-10-17',hold_expires_at:null,pickup_location:'QA Garage',status:'confirmed',total_price:3000,created_at:now,vehicles:{name:vehicle.name,image_url:null}};
const appointment = {id:'55555555-5555-4555-8555-555555555555',scheduled_at:'2026-10-15T02:00:00Z',is_emergency:false,status:'assigned',total_price:500,created_at:now,pin_lat:null,pin_lng:null,notes:null,mechanic_id:'66666666-6666-4666-8666-666666666666',mechanic_profiles:{current_lat:null,current_lng:null,profiles:{full_name:'QA Mechanic',phone:null}},service_booking_items:[{mechanic_services:{name:service.name}}]};
(async()=>{
 const browser=await chromium.launch({headless:true}), results=[];
 async function scenario(name,run,{signedIn=true,noPhone=false,settingsFailure=false}={}){
  const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(); page.setDefaultTimeout(10000);
  const errors=[],consoleErrors=[],requests=[],checks=[];let rejectCode=true;
  page.on('pageerror',e=>errors.push(e.stack));page.on('console',m=>{if(m.type()==='error')consoleErrors.push(m.text())});
  const fixtureUser=noPhone?{...user,phone:''}:user;
  const fixtures={profiles:{...profile,phone:noPhone?null:profile.phone},customer_site_settings:{settings:{}},vehicles:[vehicle],mechanic_services:[service],vehicle_bookings:[rental],service_bookings:[appointment]};
  await context.addInitScript(({s,signedIn})=>{window.localStorage.clear();if(signedIn)localStorage.setItem('sb-reyghhsjiwyabhgbgubt-auth-token',JSON.stringify(s))},{s:{...session,user:fixtureUser},signedIn});
  await page.route('**/*',async route=>{
   const req=route.request(),url=new URL(req.url());
   if(url.pathname.startsWith('/auth/v1/')){
    requests.push({path:url.pathname,method:req.method()});
    if(url.pathname.endsWith('/verify')){
     if(rejectCode){rejectCode=false;return route.fulfill({status:400,json:{msg:'Token has expired or is invalid',error_code:'otp_expired'}})}
     return route.fulfill({json:{...session,user:fixtureUser}});
    }
    if(url.pathname.endsWith('/logout'))return route.fulfill({status:204,body:''});
    if(url.pathname.endsWith('/otp'))return route.fulfill({json:{message_id:'qa-only'}});
    return route.fulfill({json:fixtureUser});
   }
   if(url.pathname.startsWith('/rest/v1/')){
    requests.push({path:url.pathname,method:req.method()});const table=url.pathname.split('/')[3];
    if(table==='customer_site_settings'&&settingsFailure)return route.fulfill({status:406,json:{code:'PGRST116',message:'JSON object requested, multiple (or no) rows returned',details:'The result contains 0 rows'}});
    const single=(req.headers().accept||'').includes('object'); let data=fixtures[table]??null;
    if(table==='profiles'&&req.method()==='PATCH'){fixtures.profiles={...fixtures.profiles,...req.postDataJSON()};data=fixtures.profiles}
    return route.fulfill({json:single?(Array.isArray(data)?data[0]??null:data):(Array.isArray(data)?data:data?[data]:[]),headers:{'content-range':Array.isArray(data)?`0-${Math.max(0,data.length-1)}/${data.length}`:'0-0/0'}});
   }
   if(url.pathname.endsWith('/functions/v1/customer-phone-otp'))return route.fulfill({json:{data:{verification:'sms'},error:null}});
   if(url.pathname.startsWith('/functions/v1/'))return route.fulfill({json:{}});
   return route.continue();
  });
  const check=async title=>{await page.waitForTimeout(250);assert.equal(await page.locator('#app-error-title').count(),0,`Crash at ${title}`);assert.equal(errors.length,0,`JS exception at ${title}: ${errors[0]}`);checks.push(title)};
  try{
   await page.goto(base,{waitUntil:'networkidle'});await run({page,check,requests});
   await page.screenshot({path:`artifacts/apk-test/${label}-${name}.png`,fullPage:true});
   results.push({name,passed:true,checks,errors,consoleErrors,requests});
  }catch(e){await page.screenshot({path:`artifacts/apk-test/${label}-${name}-failed.png`,fullPage:true}).catch(()=>{});results.push({name,passed:false,checks,failure:e.stack,errors,consoleErrors,requests,text:(await page.locator('body').innerText()).slice(0,4000)});}
  await context.close();
 }
 await scenario('sms-login-navigation',async({page,check,requests})=>{
  await page.getByRole('button',{name:'Sign in to continue',exact:true}).click();
  await page.getByRole('textbox',{name:'Email or phone number',exact:true}).fill('+15555550123');
  await page.getByRole('button',{name:'Send sign-in code',exact:true}).click();
  await page.getByRole('textbox',{name:'Six-digit verification code',exact:true}).fill('000000');
  await page.locator('.auth-dialog').getByRole('button',{name:'Sign in to my account',exact:true}).click();
  await page.getByRole('alert').filter({hasText:'Token has expired or is invalid'}).waitFor();await check('invalid SMS code handled');
  await page.getByRole('textbox',{name:'Six-digit verification code',exact:true}).fill('123456');
  await page.locator('.auth-dialog').getByRole('button',{name:'Sign in to my account',exact:true}).click();
  await page.locator('.welcome-row').waitFor();await check('SMS verification enters dashboard');
  assert.ok(requests.some(r=>r.path==='/auth/v1/verify'));
  for(let cycle=0;cycle<2;cycle++)for(const title of ['Rentals','Mechanic','Bookings','Profile','Workspace']){
   await page.locator('.side-nav').getByRole('button',{name:new RegExp(`^${title}`)}).click();await check(`${title} navigation ${cycle+1}`);
  }
  await page.locator('.sidebar').getByRole('button',{name:'Sign out',exact:true}).click();
  await page.getByRole('dialog').getByRole('button',{name:/sign out/i}).click();
  await page.getByRole('button',{name:'Sign in to continue',exact:true}).waitFor();await check('sign-out returns guest workspace');
 },{signedIn:false});
 await scenario('populated-customer-pages',async({page,check})=>{
  await page.locator('.welcome-row').waitFor();await check('populated dashboard');
  await page.locator('.side-nav').getByRole('button',{name:'Rentals',exact:true}).click();
  await page.getByRole('textbox',{name:'Search vehicles',exact:true}).fill('QA Sedan');
  await page.getByRole('button',{name:'QA Sedan',exact:true}).click();
  await page.getByRole('button',{name:'Close vehicle details',exact:true}).waitFor();await check('vehicle details opened');
  await page.getByRole('button',{name:'Close vehicle details',exact:true}).click();
  await page.locator('.side-nav').getByRole('button',{name:/^Bookings/}).click();
  await page.getByRole('button',{name:'View details for QA Sedan',exact:true}).click();await check('rental booking details');
  await page.getByRole('button',{name:'Close details',exact:true}).click();
  await page.getByRole('button',{name:'View details for service booking',exact:true}).click();await check('assigned mechanic booking with missing phone/location');
  await page.getByRole('button',{name:'Close details',exact:true}).click();
  await page.getByRole('button',{name:/Schedule Calendar/}).click();await check('populated booking calendar');
  await page.locator('.side-nav').getByRole('button',{name:'Mechanic',exact:true}).click();
  await page.getByRole('button',{name:/Routine Fluid Service/}).click();
  await page.getByRole('button',{name:/QA Oil Change/}).click();await check('mechanic category/service selection');
 });
 await scenario('missing-phone-setup',async({page,check})=>{
  await page.getByRole('heading',{name:'Complete your profile',exact:true}).waitFor();
  await page.getByRole('textbox',{name:'Phone number',exact:true}).fill('+15555550123');
  await page.locator('form button[type=submit]').click();await page.locator('.welcome-row').waitFor();await check('phone setup enters dashboard');
 },{noPhone:true});
 await scenario('missing-settings-row',async({page,check})=>{
  await page.locator('.welcome-row').waitFor();await check('missing settings row keeps defaults');
 },{settingsFailure:true});
 fs.writeFileSync(`artifacts/apk-test/${label}-results.json`,JSON.stringify(results,null,2));
 console.log(JSON.stringify(results.map(({name,passed,checks,failure,errors})=>({name,passed,checks,failure,errors})),null,2));await browser.close();if(results.some(r=>!r.passed))process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1});
