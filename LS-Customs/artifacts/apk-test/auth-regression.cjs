const {chromium}=require('C:/Users/acer/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('fs'),assert=require('node:assert/strict');
const base=process.env.QA_URL||'http://127.0.0.1:5173/',label=process.env.QA_LABEL||'auth-regression';
const originalId='11111111-1111-4111-8111-111111111111',newId='22222222-2222-4222-8222-222222222222';
const user={id:originalId,email:'existing@gmail.com',phone:'',aud:'authenticated',role:'authenticated',user_metadata:{name:'Original Member'},app_metadata:{provider:'google'},created_at:'2025-01-01T00:00:00Z',email_confirmed_at:'2025-01-01T00:00:00Z'};
const jwt=()=>[Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url'),Buffer.from(JSON.stringify({sub:originalId,exp:Math.floor(Date.now()/1000)+3600,iat:Math.floor(Date.now()/1000),role:'authenticated'})).toString('base64url'),Buffer.from('fixture-signature').toString('base64url')].join('.');
const session=u=>({access_token:jwt(),refresh_token:'fixture-refresh',token_type:'bearer',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,user:u});
(async()=>{
 const browser=await chromium.launch({headless:true}),results=[];
 async function run(name,options,work){
  const context=await browser.newContext({viewport:options.mobile?{width:390,height:844}:{width:1440,height:1000}}),page=await context.newPage();page.setDefaultTimeout(10000);
  const errors=[],requests=[];let activeUser=user,attempts=0;
  page.on('pageerror',e=>errors.push(e.stack));await context.addInitScript(()=>localStorage.clear());
  await page.route('**/*',async route=>{
   const request=route.request(),url=new URL(request.url());
   if(url.pathname.startsWith('/auth/v1/')||url.pathname.startsWith('/functions/v1/')){
    const body=request.postData()?request.postDataJSON():null;requests.push({path:url.pathname,body});
    if(url.pathname.endsWith('/customer-phone-otp')){
     if(body.action==='send')return route.fulfill({json:{data:{verification:options.directSms?'sms':'profile_phone',...(!options.directSms?{challengeId:'33333333-3333-4333-8333-333333333333'}:{})},error:null}});
     if(options.unknown||(++attempts===1&&options.rejectCode))return route.fulfill({status:400,json:{data:null,error:{code:'INVALID_CODE',message:'This code is invalid or expired. Try again, or use email or Google to sign in.'}}});
     return route.fulfill({json:{data:{session:session(activeUser)},error:null}});
    }
    if(url.pathname.endsWith('/otp')){
     if(options.unknown)return route.fulfill({status:400,json:{msg:'Signups not allowed for otp',error_code:'signup_disabled'}});
     if(options.newUser)activeUser={...user,id:newId,email:body.email,user_metadata:{full_name:body.data.full_name},created_at:new Date().toISOString()};
     return route.fulfill({json:{}});
    }
    if(url.pathname.endsWith('/verify'))return route.fulfill({json:session(activeUser)});
    if(url.pathname.endsWith('/user'))return route.fulfill({json:activeUser});
    return route.fulfill({json:{}});
   }
   if(url.pathname.startsWith('/rest/v1/')){
    requests.push({path:url.pathname,query:url.search});const table=url.pathname.split('/')[3];
    const single=(request.headers().accept||'').includes('object');let row=null;
    if(table==='profiles'){
     if(options.delayedProfile)await new Promise(r=>setTimeout(r,400));
     row={id:activeUser.id,full_name:activeUser.id===originalId?'Original Member':'New Member',phone:'+639171234567',role:'customer',avatar_url:null};
    }
    if(table==='customer_site_settings')row={settings:{}};
    return route.fulfill({json:single?row:row?[row]:[],headers:{'content-range':'0-0/0'}});
   }
   return route.continue();
  });
  try{
   await page.goto(base,{waitUntil:'networkidle'});await work({page,requests});
   assert.equal(await page.locator('#app-error-title').count(),0);assert.deepEqual(errors,[]);
   await page.screenshot({path:`artifacts/apk-test/${label}-${name}.png`,fullPage:true});results.push({name,passed:true,requests,errors});
  }catch(e){await page.screenshot({path:`artifacts/apk-test/${label}-${name}-failed.png`,fullPage:true}).catch(()=>{});results.push({name,passed:false,failure:e.stack,requests,errors,text:(await page.locator('body').innerText()).slice(0,2000)});}
  await context.close();
 }
 const openLogin=async page=>page.getByRole('button',{name:'Sign in to continue',exact:true}).click();
 const send=async(page,contact)=>{await page.getByRole('textbox',{name:'Email or phone number',exact:true}).fill(contact);await page.getByRole('button',{name:'Send sign-in code',exact:true}).click()};
 const verify=async(page,code='123456')=>{await page.getByRole('textbox',{name:'Six-digit verification code',exact:true}).fill(code);await page.getByRole('button',{name:'Sign in to my account',exact:true}).click()};
 const expectOriginal=async(page,requests)=>{
  await page.locator('.welcome-row').waitFor();assert.match(await page.locator('.welcome-row').innerText(),/Original Member/);
  assert.equal(await page.getByRole('heading',{name:'Complete your profile',exact:true}).count(),0);
  const profiles=requests.filter(r=>r.path==='/rest/v1/profiles');assert.ok(profiles.length>0);assert.ok(profiles.every(r=>r.query.includes(originalId)));
  const stored=await page.evaluate(()=>Object.entries(localStorage).find(([key])=>/^sb-.*-auth-token$/.test(key))?.[1]);assert.equal(JSON.parse(stored).user.id,originalId);
 };
 await run('existing-gmail', {delayedProfile:true},async({page,requests})=>{
  await openLogin(page);await send(page,' Existing@GMAIL.com ');
  const otp=requests.find(r=>r.path==='/auth/v1/otp');assert.equal(otp.body.email,'existing@gmail.com');assert.equal(otp.body.create_user,false);assert.equal(otp.body.data.full_name,undefined);
  await verify(page);await expectOriginal(page,requests);
 });
 await run('google-profile-phone', {rejectCode:true},async({page,requests})=>{
  await openLogin(page);await send(page,'0917 123 4567');
  await page.getByRole('textbox',{name:'Six-digit verification code',exact:true}).waitFor();
  assert.deepEqual(requests.find(r=>r.path.endsWith('/customer-phone-otp')).body,{action:'send',phone:'+639171234567',createAccount:false});
  await verify(page,'000000');await page.getByRole('alert').filter({hasText:/invalid or expired/}).waitFor();
  await verify(page);await expectOriginal(page,requests);assert.equal(requests.filter(r=>r.path==='/auth/v1/otp').length,0);
 });
 await run('existing-auth-sms',{directSms:true},async({page,requests})=>{
  await openLogin(page);await send(page,'+639171234567');await verify(page);await expectOriginal(page,requests);
  assert.equal(requests.find(r=>r.path==='/auth/v1/verify').body.type,'sms');
 });
 await run('unknown-email-login',{unknown:true},async({page,requests})=>{
  await openLogin(page);await send(page,'unknown@example.invalid');await page.getByRole('alert').waitFor();
  assert.equal(requests.find(r=>r.path==='/auth/v1/otp').body.create_user,false);assert.equal(await page.getByRole('textbox',{name:'Your name',exact:true}).count(),0);
 });
 await run('unknown-sms-login',{unknown:true},async({page,requests})=>{
  await openLogin(page);await send(page,'+15555550123');await verify(page);await page.getByRole('alert').waitFor();
  assert.equal(requests.find(r=>r.path.endsWith('/customer-phone-otp')).body.createAccount,false);assert.equal(await page.locator('.welcome-row').count(),0);
 });
 for(const mobile of [false,true])await run(mobile?'signup-mobile':'signup-desktop',{mobile},async({page})=>{
  await page.getByRole('button',{name:'Create an account',exact:true}).first().click();
  await page.getByRole('textbox',{name:'Your name',exact:true}).waitFor();assert.equal(await page.locator('.auth-account-dialog--signup').count(),1);
  assert.equal(await page.getByRole('list',{name:'Account creation progress'}).count(),1);
  await page.getByRole('textbox',{name:'Your name',exact:true}).fill('Alex Santos');await page.getByRole('textbox',{name:'Email or phone number',exact:true}).fill('alex@example.invalid');
  assert.equal(await page.getByRole('button',{name:'Create account & send code',exact:true}).isEnabled(),true);
  await page.screenshot({path:`artifacts/apk-test/${label}-${mobile?'signup-mobile':'signup-desktop'}-modal.png`,fullPage:true});
  await page.getByRole('button',{name:'Sign in instead',exact:true}).click();assert.equal(await page.getByRole('textbox',{name:'Your name',exact:true}).count(),0);assert.equal(await page.locator('.auth-account-dialog--signup').count(),0);
 });
 await run('new-signup',{newUser:true},async({page,requests})=>{
  await page.getByRole('button',{name:'Create an account',exact:true}).first().click();await page.getByRole('textbox',{name:'Your name',exact:true}).fill('New Member');await page.getByRole('textbox',{name:'Email or phone number',exact:true}).fill('new@example.invalid');
  await page.getByRole('button',{name:'Create account & send code',exact:true}).click();const otp=requests.find(r=>r.path==='/auth/v1/otp');assert.equal(otp.body.create_user,true);assert.equal(otp.body.data.full_name,'New Member');
  await page.getByRole('textbox',{name:'Six-digit verification code',exact:true}).fill('123456');await page.getByRole('button',{name:'Verify and continue',exact:true}).click();await page.locator('.welcome-row').waitFor();assert.match(await page.locator('.welcome-row').innerText(),/New Member/);
 });
 fs.writeFileSync(`artifacts/apk-test/${label}-results.json`,JSON.stringify(results,null,2));console.log(JSON.stringify(results.map(({name,passed,failure,errors})=>({name,passed,failure,errors})),null,2));await browser.close();if(results.some(r=>!r.passed))process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1});
