'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {JSDOM, VirtualConsole} = require('jsdom');
const appSource=fs.readFileSync(path.join(__dirname,'../DIRMS/assets/js/app.js'),'utf8');
const emptyData=()=>({alerts:[],centers:[],hotlines:[],tips:[],news:[],settings:{}});
const pause=()=>new Promise(resolve=>setTimeout(resolve,0));
async function until(condition){for(let i=0;i<80;i++){if(condition())return;await pause();}assert.fail('DOM did not reach expected state');}
async function boot(page,options={}){
  const virtualConsole=new VirtualConsole(),errors=[];
  virtualConsole.on('jsdomError',error=>{if(!error.message.startsWith('Not implemented: navigation'))errors.push(error);});
  const dom=new JSDOM(fs.readFileSync(path.join(__dirname,'../DIRMS/'+page),'utf8'),{url:'https://dirms.test/'+page,runScripts:'outside-only',pretendToBeVisual:true,virtualConsole});
  const {window}=dom,requests=[],clipboard=[];
  if(window.document.readyState!=='complete')await new Promise(resolve=>window.addEventListener('load',resolve,{once:true}));
  window.matchMedia=()=>({matches:false});
  window.HTMLElement.prototype.scrollIntoView=function(){};
  window.HTMLElement.prototype.getClientRects=function(){return this.closest('[hidden]')?[]:[{width:10,height:10}];};
  Object.defineProperty(window.navigator,'clipboard',{value:{writeText:async value=>clipboard.push(value)}});
  let hidden=false;
  Object.defineProperty(window.document,'hidden',{configurable:true,get:()=>hidden});
  if(options.badge){const badge=window.document.createElement('span');badge.id='reportNotificationBadge';badge.hidden=true;window.document.querySelector('#myReportsNav').append(badge);}
  const response=body=>({ok:true,status:200,json:async()=>body});
  window.fetch=async(url,config={})=>{
    const action=new URL(url,'https://dirms.test/').searchParams.get('action');requests.push({url,config,action});
    if(action==='bootstrap')return response({ok:true,data:options.data||emptyData(),user:options.user||null,csrf:'test-csrf'});
    if(options.request){const result=await options.request(action,config,requests);if(result!==undefined)return response(result);}
    if(action==='my_notifications')return response({ok:true,notifications:[],unread_count:0,version:'none'});
    if(action==='logout')return response({ok:true,message:'Signed out'});
    throw Error('Unexpected API action: '+action);
  };
  window.addEventListener('error',event=>errors.push(event.error||Error(event.message)));
  window.eval(appSource);
  window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
  await until(()=>window.DIRMS_APP.ready);
  await pause();
  return {dom,window,document:window.document,requests,clipboard,errors,setHidden(value){hidden=value;window.document.dispatchEvent(new window.Event('visibilitychange'));},close(){assert.deepEqual(errors,[]);window.close();}};
}

test('password reveal controls have linked names, state, and reset behavior',async()=>{
  const ui=await boot('preview-login.html');
  try{
    const inputs=[...ui.document.querySelectorAll('input[type=password]')];assert.equal(inputs.length,3);
    for(const input of inputs){
      const button=input.closest('.password-field').querySelector('button');
      assert.equal(button.getAttribute('aria-controls'),input.id);assert.equal(button.getAttribute('aria-pressed'),'false');
      button.click();assert.equal(input.type,'text');assert.equal(button.getAttribute('aria-pressed'),'true');
      input.form.reset();assert.equal(input.type,'password');assert.equal(button.textContent,'Show');
    }
  }finally{ui.close();}
});

test('mobile navigation closes with outside click, link selection, and Escape; modals return focus',async()=>{
  const data=emptyData();data.alerts=[{id:1,title:'Test advisory',alert_type:'Flood',severity:'high',description:'Test detail',location:'Test location',created_at:'2026-01-01T00:00:00Z',is_demo:1}];
  const ui=await boot('preview-alerts.html',{data});
  try{
    const menu=ui.document.querySelector('#menuToggle'),nav=ui.document.querySelector('#topNav');
    menu.click();assert.equal(menu.getAttribute('aria-expanded'),'true');assert.ok(nav.classList.contains('open'));
    ui.document.body.click();assert.equal(menu.getAttribute('aria-expanded'),'false');
    menu.click();const link=nav.querySelector('a');link.addEventListener('click',event=>event.preventDefault());link.click();assert.equal(menu.getAttribute('aria-expanded'),'false');
    menu.click();ui.document.dispatchEvent(new ui.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));assert.equal(menu.getAttribute('aria-expanded'),'false');assert.equal(ui.document.activeElement,menu);
    const trigger=ui.document.querySelector('[data-alert-id]');trigger.focus();trigger.click();
    const modal=ui.document.querySelector('#detailModal');assert.equal(modal.hidden,false);assert.equal(ui.document.activeElement,modal.querySelector('.modal-close'));
    ui.document.dispatchEvent(new ui.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));assert.equal(modal.hidden,true);assert.equal(ui.document.activeElement,trigger);
  }finally{ui.close();}
});

test('unknown and invalid center coordinates remain approximate and capacity never implies official opening',async()=>{
  const data=emptyData();data.centers=[
    {id:1,name:'Unknown GPS',address:'Test Barangay, San Pablo City',capacity:100,occupancy:0,latitude:null,longitude:null,is_active:1,is_demo:0},
    {id:2,name:'Invalid GPS',address:'Another test address',capacity:10,occupancy:10,latitude:'91',longitude:'121',is_active:1,is_demo:1},
    {id:3,name:'Supplied GPS',address:'Supplied location',capacity:100,occupancy:0,latitude:'14',longitude:'121',is_active:1,is_demo:0}
  ];
  const ui=await boot('preview-evacuation-centers.html',{data});
  try{
    const cards=[...ui.document.querySelectorAll('.center-card')];assert.equal(cards.length,3);
    for(const card of cards.slice(0,2)){assert.equal(card.querySelector('.map-pin-icon'),null);assert.match(card.textContent,/APPROXIMATE ADDRESS SEARCH/);assert.match(card.querySelector('.btn').textContent,/Search address/);}
    assert.match(cards[0].textContent,/AVAILABILITY UNVERIFIED/);assert.doesNotMatch(cards[0].textContent,/OFFICIALLY OPEN|REPORTED SPACE AVAILABLE/);
    assert.match(cards[1].textContent,/DEMO · NOT A VERIFIED OPEN SHELTER/);
    assert.ok(cards[2].querySelector('.map-pin-icon'));assert.match(cards[2].textContent,/AVAILABILITY UNVERIFIED/);
    const query=new URL(cards[0].querySelector('.btn').href).searchParams.get('q');assert.equal(query,'Unknown GPS, Test Barangay, San Pablo City');
    cards[0].querySelector('[data-center-map]').click();assert.match(ui.document.querySelector('#centerMapAccuracy').textContent,/approximate/);
    assert.doesNotMatch(ui.document.querySelector('#centerMapFrame iframe').src,/q=0(%2C|,)0/);
  }finally{ui.close();}
});

test('alerts escape content, exclude expired records, filter category, and retain a stale warning on refresh failure',async()=>{
  const data=emptyData();data.alerts=[
    {id:1,title:'Flood sample',alert_type:'Flood',severity:'high',description:'<img src=x onerror=alert(1)> '.repeat(20),location:'Test',created_at:'2026-01-01T00:00:00Z',is_demo:1},
    {id:2,title:'Fire sample',alert_type:'Fire',severity:'low',description:'Test only',location:'Test',created_at:'2026-01-01T00:00:00Z',is_demo:1},
    {id:3,title:'Expired test',alert_type:'Other',severity:'high',description:'Expired',location:'Test',created_at:'2000-01-01T00:00:00Z',expires_at:'2000-01-02T00:00:00Z',is_demo:1}
  ];
  const ui=await boot('preview-alerts.html',{data,request:async action=>{if(action==='alerts')throw Error('Offline test');}});
  try{
    const list=ui.document.querySelector('#alertList');assert.equal(list.querySelectorAll('article').length,2);assert.equal(list.querySelector('img'),null);assert.match(list.textContent,/<img src=x/);assert.doesNotMatch(list.textContent,/Expired test/);
    const select=ui.document.querySelector('#alertCategory');select.value='Fire';select.dispatchEvent(new ui.window.Event('change'));assert.equal(list.querySelectorAll('article').length,1);assert.match(list.textContent,/Fire sample/);
    ui.document.querySelector('#refreshAlerts').click();await until(()=>!ui.document.querySelector('#refreshAlerts').disabled);
    assert.match(ui.document.querySelector('#alertFeedStatus').textContent,/out of date/);assert.match(list.textContent,/Fire sample/);
  }finally{ui.close();}
});

test('hotline and preparedness searches filter stored content without inventing numbers',async()=>{
  const data=emptyData();data.hotlines=[{id:1,organization:'Test Office Alpha',phone:'911',description:'Test only',source_url:'https://example.org/agency',is_demo:1},{id:2,organization:'Test Office Beta',phone:'143',description:'Test only',is_demo:1}];
  let ui=await boot('preview-hotlines.html',{data});
  try{
    const search=ui.document.querySelector('#hotlineSearch');search.value='Alpha';search.dispatchEvent(new ui.window.Event('input'));
    assert.equal(ui.document.querySelectorAll('.hotline-item').length,1);assert.equal(ui.document.querySelector('.call-number').getAttribute('href'),'tel:911');assert.match(ui.document.querySelector('.directory-source').textContent,/Confirm current number/);assert.equal(ui.document.querySelector('.directory-source a').href,'https://example.org/agency');
  }finally{ui.close();}
  data.tips=[{id:1,title:'Test flood safety',body:'Avoid floodwater.',icon:'waves'},{id:2,title:'Test go bag',body:'Pack supplies.',icon:'briefcase'}];
  ui=await boot('preview-tips.html',{data});
  try{
    const trigger=ui.document.querySelector('[data-tip="1"]');trigger.click();assert.equal(trigger.getAttribute('aria-expanded'),'true');
    const search=ui.document.querySelector('#tipSearch');search.value='flood';search.dispatchEvent(new ui.window.Event('input'));
    assert.equal(ui.document.querySelectorAll('.tip-item').length,1);assert.equal(ui.document.querySelector('[data-tip="1"]').getAttribute('aria-expanded'),'true');assert.equal(ui.document.querySelector('.tip-body').hidden,false);
  }finally{ui.close();}
});

test('guest receipt uses server reference, keeps a retry key, and copies private code without URLs or browser storage',async()=>{
  const attempts=[],secret='test-private-code-123456789012345678901234567890';
  const ui=await boot('preview-report-incident.html',{request:async(action,config)=>{
    if(action!=='report')return;attempts.push(config.body.get('submission_key'));if(attempts.length===1)throw Error('Simulated lost response');
    return {ok:true,id:555,report_id:555,reference:'DIRMS-000555',tracking_code:secret,message:'Report saved'};
  }});
  try{
    const form=ui.document.querySelector('#incidentForm');form.elements.incident_type.value='Flood';form.elements.location.value='Test Barangay';form.elements.description.value='Automated test report only.';
    form.dispatchEvent(new ui.window.Event('submit',{cancelable:true,bubbles:true}));await until(()=>attempts.length===1 && !ui.document.querySelector('#reportSubmit').disabled);assert.equal(ui.document.querySelector('#reportFormError').hidden,false);
    form.dispatchEvent(new ui.window.Event('submit',{cancelable:true,bubbles:true}));await until(()=>!ui.document.querySelector('#reportReceipt').hidden);
    assert.match(attempts[0],/^[a-f0-9]{48}$/);assert.equal(attempts[0],attempts[1]);assert.equal(form.dataset.submissionKey,undefined);
    assert.equal(ui.document.querySelector('#receiptId').textContent,'DIRMS-000555');assert.equal(ui.document.querySelector('.tracking-code').textContent,secret);
    assert.equal(ui.document.querySelector('#guestTrackingReceipt a').getAttribute('href'),'track-report.php');assert.equal(ui.document.querySelector('#receiptMyReports').hidden,true);
    ui.document.querySelector('[data-copy-tracking]').click();await until(()=>ui.clipboard.length===1);await pause();assert.match(ui.clipboard[0],new RegExp(secret));
    assert.equal(ui.window.localStorage.length,0);assert.equal(ui.window.sessionStorage.length,0);assert.ok(ui.requests.every(request=>!request.url.includes(secret)));
  }finally{ui.close();}
});

test('registered receipts link their own report and never display a guest secret',async()=>{
  const ui=await boot('preview-report-incident.html',{user:{id:7,full_name:'Test Resident',phone:'',role:'resident'},request:async action=>action==='report'?{ok:true,id:12,report_id:12,reference:'DIRMS-000012',message:'Report saved'}:undefined});
  try{
    const form=ui.document.querySelector('#incidentForm');form.elements.incident_type.value='Flood';form.elements.location.value='Test Barangay';form.elements.description.value='Automated report test only.';
    form.dispatchEvent(new ui.window.Event('submit',{cancelable:true,bubbles:true}));await until(()=>!ui.document.querySelector('#reportReceipt').hidden);
    assert.equal(ui.document.querySelector('#guestTrackingReceipt'),null);assert.equal(ui.document.querySelector('#receiptMyReports').hidden,false);assert.equal(ui.document.querySelector('#receiptMyReports').dataset.reportId,'12');
  }finally{ui.close();}
});

test('header unread count preserves last successful value on errors, pauses hidden, and clears on logout',async()=>{
  let calls=0,fail=false;
  const ui=await boot('preview.html',{badge:true,user:{id:7,full_name:'Test Resident',role:'resident'},request:async action=>{
    if(action==='my_notifications'){calls++;if(fail)throw Error('Offline');return {ok:true,unread_count:3,version:'version-3',notifications:[]};}
  }});
  try{
    const badge=ui.document.querySelector('#reportNotificationBadge');await until(()=>badge.textContent==='3');assert.equal(badge.hidden,false);
    fail=true;ui.setHidden(true);const before=calls;await pause();assert.equal(calls,before);ui.setHidden(false);await until(()=>calls===before+1);await pause();assert.equal(badge.textContent,'3');assert.equal(badge.hidden,false);
    ui.document.querySelector('#navLogout').click();await until(()=>ui.window.DIRMS_APP.getUser()===null);assert.equal(badge.hidden,true);assert.equal(badge.textContent,'');
  }finally{ui.close();}
});

test('legacy preview cards preserve supplied references, use authorized evidence routes, and never render internal notes',async()=>{
  const ui=await boot('preview-my-reports.html',{user:{id:7,full_name:'Test Resident',role:'resident'},request:async action=>action==='my_reports'?{ok:true,reports:[{id:123,reference:'BS-000123',incident_type:'Flood',location:'Test location',description:'Test report',status:'reviewing',has_photo:true,photo_path:'uploads/private.jpg',admin_notes:'PRIVATE-NEVER-RENDER',latest_public_note:'Public progress message',created_at:'2026-01-01T00:00:00Z'}]}:undefined});
  try{
    await until(()=>ui.document.querySelector('.report-history-card'));
    const card=ui.document.querySelector('.report-history-card');assert.match(card.textContent,/BS-000123/);assert.match(card.textContent,/Public progress message/);assert.doesNotMatch(card.textContent,/PRIVATE-NEVER-RENDER/);
    const link=card.querySelector('a');assert.match(link.getAttribute('href'),/^api\.php\?action=report_photo&id=123$/);assert.doesNotMatch(link.getAttribute('href'),/uploads/);
  }finally{ui.close();}
});

test('header notification polling prevents overlapping visibility-triggered requests',async()=>{
  let calls=0,release;
  const pending=new Promise(resolve=>{release=resolve;});
  const ui=await boot('preview.html',{badge:true,user:{id:7,full_name:'Test Resident',role:'resident'},request:async action=>{
    if(action==='my_notifications'){calls++;await pending;return {ok:true,unread_count:4,version:'version-4',notifications:[]};}
  }});
  try{
    assert.equal(calls,1);ui.setHidden(true);ui.setHidden(false);ui.setHidden(false);await pause();assert.equal(calls,1);
    release();await until(()=>ui.document.querySelector('#reportNotificationBadge').textContent==='4');assert.equal(calls,1);
  }finally{release();await pause();ui.close();}
});
