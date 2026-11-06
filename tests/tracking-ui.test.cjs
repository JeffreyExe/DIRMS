'use strict';
const assert = require('node:assert/strict');
const {test} = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {JSDOM} = require('jsdom');
const source = fs.readFileSync(path.join(__dirname,'../DIRMS/assets/js/tracking.js'),'utf8');
const view = path.join(__dirname,'../DIRMS/app/tracking-view.php');
const PHP_BIN = process.env.PHP_BIN || 'php';
const submittedAt = '2026-11-06T10:00:00.000000Z';
const event = (id,status,type='status_change',note='',previous=null) => ({id,event_type:type,previous_status:previous,new_status:status,public_note:note,created_at:`2026-11-06T${String(10+id).padStart(2,'0')}:00:00.000000Z`,actor_name:type==='submitted'?'Reporter':'Administrator'});
const submitted = {id:1,event_type:'submitted',previous_status:null,new_status:'pending',public_note:'',created_at:submittedAt,actor_name:'Reporter'};
const report = (status='pending',history=[submitted],overrides={}) => ({id:125,reference:'DIRMS-000125',incident_type:'Flood',location:'Test barangay',description:'Test incident description, not a live emergency.',status,version:1,created_at:submittedAt,updated_at:submittedAt,public_note:'',history,photo_url:null,legacy_history_incomplete:false,...overrides});
const flush = () => new Promise(resolve=>setImmediate(()=>setImmediate(resolve)));
function markup(mode) {
  const result=spawnSync(PHP_BIN,['-r','require $argv[1]; renderTrackingPage($argv[2] === "guest");',view,mode],{encoding:'utf8'});
  if(result.error)throw result.error;
  assert.equal(result.status,0,result.stderr);return result.stdout;
}
async function setup(reports=[report()],mode='resident') {
  const dom=new JSDOM('<!doctype html><html><body>'+markup(mode)+'</body></html>',{url:'http://localhost/DIRMS/'+(mode==='guest'?'track-report.php':'my-reports.php'),runScripts:'outside-only',pretendToBeVisual:true});
  const {window}=dom,document=window.document;
  window.Element.prototype.scrollIntoView=function(){};
  window.matchMedia=()=>({matches:true});
  let hidden=false,timerId=0;
  const timers=new Map();
  Object.defineProperty(document,'hidden',{configurable:true,get:()=>hidden});
  window.setTimeout=(callback,delay)=>{timers.set(++timerId,{callback,delay});return timerId;};
  window.clearTimeout=id=>timers.delete(id);
  const server={reports,version:'list-1',calls:[],notifications:[],notificationVersion:'notice-1',pendingReport:0,maxPendingReport:0,held:[],hold:false,fail:false};
  const response=(data,status=200)=>({ok:status>=200&&status<300,status,json:async()=>data});
  window.fetch=async (url,options={})=>{
    const parsed=new URL(url,window.location.href),action=parsed.searchParams.get('action');
    server.calls.push({url:String(url),action,options});
    if(action==='bootstrap')return response({ok:true,user:{id:7,role:'resident'},csrf:'test-csrf'});
    if(action==='my_reports'||action==='report_details'){
      server.pendingReport++;server.maxPendingReport=Math.max(server.maxPendingReport,server.pendingReport);
      try {
        if(server.hold)await new Promise((resolve,reject)=>{
          server.held.push(resolve);
          options.signal?.addEventListener('abort',()=>{const error=new Error('aborted');error.name='AbortError';reject(error);},{once:true});
        });
        if(server.fail)throw new Error('Connection lost');
        if(action==='report_details'){
          const item=server.reports.find(r=>r.id===Number(parsed.searchParams.get('id')));
          if(!item)return response({ok:false,message:'Report not found or access unavailable.'},404);
          return response(parsed.searchParams.get('version')===String(item.version)?{ok:true,unchanged:true,version:String(item.version)}:{ok:true,report:item,version:String(item.version),unchanged:false});
        }
        return response(parsed.searchParams.get('version')===server.version?{ok:true,version:server.version,unchanged:true}:{ok:true,reports:server.reports,version:server.version,unchanged:false});
      } finally {server.pendingReport--;}
    }
    if(action==='my_notifications')return response(parsed.searchParams.get('version')===server.notificationVersion?{ok:true,unchanged:true,version:server.notificationVersion}:{ok:true,notifications:server.notifications,unread_count:server.notifications.filter(item=>!item.read_at).length,version:server.notificationVersion,unchanged:false});
    if(action==='track_guest_report'){if(server.holdLookup)await new Promise(resolve=>server.releaseLookup=resolve);return response({ok:true,report:server.reports[0]});}
    if(action==='clear_guest_tracking')return response({ok:true});
    if(action==='mark_notification_read'){
      const body=JSON.parse(options.body);server.notifications.forEach(item=>{if(body.all||item.id===body.id)item.read_at='2026-11-06T20:00:00Z';});server.notificationVersion+='x';return response({ok:true});
    }
    throw new Error('Unexpected action '+action);
  };
  window.eval(source);
  document.dispatchEvent(new window.CustomEvent('dirms:ready',{detail:{user:{id:7,role:'resident'},csrf:'test-csrf'}}));
  await flush();
  return {dom,window,document,server,timers,async visibility(value){hidden=value;document.dispatchEvent(new window.Event('visibilitychange'));await flush();},async fire(delay){const entry=[...timers].find(([,timer])=>timer.delay===delay);assert.ok(entry,'Expected scheduled timer '+delay);timers.delete(entry[0]);entry[1].callback();await flush();},async refresh(){document.getElementById('trackingRefresh').click();await flush();},close(){dom.window.close();}};
}

test('timeline uses actual recorded events, timestamps, and public notes only',async()=>{
  const item=report('reviewing',[submitted,event(2,'reviewing','status_change','Reviewing the evidence.')],{public_note:'<img src=x onerror=alert(1)>',internal_note:'PRIVATE ADMIN SECRET',photo_url:'uploads/public.jpg'});
  const t=await setup([item]);try{
    const steps=[...t.document.querySelectorAll('.tracking-milestone')];
    assert.equal(steps.length,5);assert.equal(steps[0].classList.contains('completed'),true);assert.equal(steps[1].classList.contains('future'),true);assert.equal(steps[1].querySelector('time'),null);
    assert.equal(steps[2].getAttribute('aria-current'),'step');assert.equal(steps[2].querySelector('time').getAttribute('datetime'),item.history[1].created_at);
    assert.equal(steps[3].querySelector('time'),null);assert.equal(steps[4].querySelector('time'),null);
    assert.match(t.document.querySelector('.tracking-latest-note').textContent,/<img/);assert.equal(t.document.querySelector('.tracking-latest-note img'),null);
    assert.doesNotMatch(t.document.body.textContent,/PRIVATE ADMIN SECRET/);assert.equal(t.document.querySelector('.tracking-photo-link'),null);
    assert.doesNotMatch(t.document.querySelector('.tracking-report-card').textContent,/\d+%/);
  }finally{t.close();}
});

test('rejected and needs-info states never manufacture a resolved milestone',async()=>{
  for(const status of ['rejected','needs_info']){
    const note=status==='rejected'?'The submitted location is outside the service area.':'Please provide the nearest intersection.';
    const t=await setup([report(status,[submitted,event(2,'received'),event(3,status,'status_change',note)],{public_note:note})]);try{
      assert.equal(t.document.querySelectorAll('.tracking-milestone').length,2);
      assert.equal([...t.document.querySelectorAll('.tracking-milestone')].some(step=>step.textContent.includes('Resolved')),false);
      assert.match(t.document.querySelector('.tracking-action-message').textContent,new RegExp(note.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
      assert.equal(!!t.document.querySelector('.tracking-action-hint'),status==='needs_info');
    }finally{t.close();}
  }
});

test('reopening resets progress overview and preserves the earlier full history',async()=>{
  const history=[submitted,event(2,'received'),event(3,'reviewing'),event(4,'in_progress'),event(5,'resolved','status_change','Earlier resolution.'),event(6,'reviewing','reopen','New evidence received.','resolved')];
  const t=await setup([report('reviewing',history)]);try{
    const steps=[...t.document.querySelectorAll('.tracking-milestone')];
    assert.equal(steps[4].classList.contains('future'),true);assert.equal(steps[4].querySelector('time'),null);
    assert.equal(steps[2].getAttribute('aria-current'),'step');assert.equal(steps[2].querySelector('time').getAttribute('datetime'),history[5].created_at);
    assert.equal(t.document.querySelectorAll('.tracking-history>li').length,6);assert.match(t.document.querySelector('.tracking-history').textContent,/Earlier resolution/);assert.match(t.document.querySelector('.tracking-cycle-note').textContent,/reopened/);
  }finally{t.close();}
});

test('legacy reports disclose missing transitions without invented admin timestamps',async()=>{
  const legacy={...submitted,event_type:'legacy_submission',public_note:'Submission imported from earlier DIRMS records.'};
  const t=await setup([report('resolved',[legacy],{reference:'BS-000125',legacy_history_incomplete:true})]);try{
    assert.match(t.document.querySelector('.tracking-reference').textContent,/BS-000125/);
    assert.match(t.document.querySelector('.tracking-legacy-note').textContent,/earlier administrator actions and their timestamps were not recorded/);
    const current=t.document.querySelector('.tracking-milestone.current');assert.match(current.textContent,/transition time not recorded/);assert.equal(current.querySelector('time'),null);
    assert.equal(t.document.querySelectorAll('.tracking-timeline time').length,1);assert.equal(t.document.querySelector('.tracking-latest-note'),null);
  }finally{t.close();}
});

test('search, status filter, and sort work without resetting expanded report details',async()=>{
  const a=report(),b=report('received',[submitted,event(2,'received')],{id:126,reference:'DIRMS-000126',incident_type:'Fire'});
  const t=await setup([a,b]);try{
    const details=t.document.getElementById('history-report-125');details.open=true;
    const search=t.document.getElementById('trackingSearch');search.value='fire';search.dispatchEvent(new t.window.Event('input'));
    assert.equal(t.document.getElementById('report-125').hidden,true);assert.equal(t.document.getElementById('report-126').hidden,false);
    search.value='';search.dispatchEvent(new t.window.Event('input'));assert.equal(details.open,true);
    const status=t.document.getElementById('trackingStatus');status.value='pending';status.dispatchEvent(new t.window.Event('change'));
    assert.equal(t.document.getElementById('report-126').hidden,true);
    status.value='all';status.dispatchEvent(new t.window.Event('change'));
    const sort=t.document.getElementById('trackingSort');sort.value='oldest';sort.dispatchEvent(new t.window.Event('change'));
    assert.equal(t.document.querySelector('[data-tracking-report]:not([hidden])').dataset.trackingReport,'125');
  }finally{t.close();}
});

test('changed and unchanged refreshes preserve expanded history and keyboard focus',async()=>{
  const t=await setup();try{
    const details=t.document.getElementById('history-report-125');details.open=true;
    t.document.getElementById('summary-history-125').focus();
    await t.refresh();assert.equal(t.document.getElementById('history-report-125'),details);assert.equal(details.open,true);
    t.server.reports=[report('received',[submitted,event(2,'received')],{version:2})];t.server.version='list-2';await t.refresh();
    assert.equal(t.document.getElementById('history-report-125').open,true);assert.equal(t.document.activeElement.id,'summary-history-125');assert.match(t.document.querySelector('.tracking-status').textContent,/Received by Admin/);
  }finally{t.close();}
});

test('polling pauses while hidden, refreshes on visibility, and prevents overlapping report polls',async()=>{
  const t=await setup();try{
    assert.ok([...t.timers.values()].some(timer=>timer.delay===12000));
    await t.visibility(true);assert.equal(t.timers.size,0);
    const before=t.server.calls.filter(call=>call.action==='my_reports').length;
    await t.visibility(false);await t.fire(0);assert.equal(t.server.calls.filter(call=>call.action==='my_reports').length,before+1);
    t.server.hold=true;await t.fire(12000);assert.equal(t.server.pendingReport,1);
    t.document.getElementById('trackingRefresh').dispatchEvent(new t.window.Event('click'));await flush();assert.equal(t.server.maxPendingReport,1);
    await t.visibility(true);assert.equal(t.server.pendingReport,0);assert.equal(t.timers.size,0);
    t.server.hold=false;await t.visibility(false);await t.fire(0);assert.equal(t.server.maxPendingReport,1);
  }finally{t.close();}
});

test('connection failures retain last known report status with a stale-data error',async()=>{
  const t=await setup([report('received',[submitted,event(2,'received')])]);try{
    const status=t.document.querySelector('.tracking-status').textContent;t.server.fail=true;await t.refresh();
    assert.equal(t.document.querySelector('.tracking-status').textContent,status);assert.match(t.document.getElementById('trackingFeedback').textContent,/out of date/);assert.match(t.document.getElementById('trackingSync').textContent,/Last successful/);
  }finally{t.close();}
});

test('guest secrets travel only in POST bodies and polling uses the authorized session grant',async()=>{
  const t=await setup([report()],'guest');try{
    const secret='a'.repeat(64);t.document.getElementById('guestReference').value='DIRMS-000125';t.document.getElementById('guestTrackingCode').value=secret;
    t.document.getElementById('guestTrackingForm').dispatchEvent(new t.window.Event('submit',{bubbles:true,cancelable:true}));await flush();
    const lookup=t.server.calls.find(call=>call.action==='track_guest_report');assert.equal(lookup.options.method,'POST');assert.equal(JSON.parse(lookup.options.body).tracking_code,secret);assert.equal(t.document.getElementById('guestTrackingCode').value,'');
    assert.ok(t.server.calls.every(call=>!call.url.includes(secret)));assert.equal(t.window.location.search,'');assert.equal(t.window.localStorage.length,0);assert.equal(t.window.sessionStorage.length,0);
    await t.fire(12000);assert.ok(t.server.calls.some(call=>call.action==='report_details'));assert.equal(t.server.calls.filter(call=>call.action==='track_guest_report').length,1);
    t.document.getElementById('trackingForget').click();await flush();assert.ok(t.server.calls.some(call=>call.action==='clear_guest_tracking'));assert.equal(t.document.querySelector('.tracking-report-card'),null);
  }finally{t.close();}
});

test('notifications mark-read updates the badge and links to the report history',async()=>{
  const t=await setup();try{
    t.server.notifications=[{id:3,report_id:125,reference:'DIRMS-000125',message:'Received by Admin',created_at:submittedAt,read_at:null}];t.server.notificationVersion='notice-2';await t.refresh();
    assert.equal(t.document.getElementById('notificationUnread').textContent,'1');t.document.querySelector('[data-open-report]').click();assert.equal(t.document.getElementById('history-report-125').open,true);
    t.document.querySelector('[data-read-notification]').click();await flush();assert.equal(t.document.getElementById('notificationUnread').textContent,'0');assert.equal(t.document.querySelector('[data-read-notification]'),null);
  }finally{t.close();}
});


test('guest lookup blocks refresh and discards older in-flight poll responses',async()=>{
  const t=await setup([report()],'guest');try{
    const submit=()=>{t.document.getElementById('guestReference').value='DIRMS-000125';t.document.getElementById('guestTrackingCode').value='a'.repeat(64);t.document.getElementById('guestTrackingForm').dispatchEvent(new t.window.Event('submit',{cancelable:true}));};
    submit();await flush();t.server.hold=true;await t.fire(12000);assert.equal(t.server.pendingReport,1);
    t.server.holdLookup=true;submit();await flush();assert.equal(t.server.pendingReport,0);assert.equal(t.document.getElementById('trackingRefresh').disabled,true);assert.equal(t.document.querySelector('.tracking-report-card'),null);
    const count=t.server.calls.filter(call=>call.action==='report_details').length;t.document.getElementById('trackingRefresh').dispatchEvent(new t.window.Event('click'));await flush();assert.equal(t.server.calls.filter(call=>call.action==='report_details').length,count);
    t.server.reports=[report('received',[submitted,event(2,'received')],{version:2})];t.server.hold=false;t.server.releaseLookup();await flush();
    assert.equal(t.document.getElementById('trackingRefresh').disabled,false);assert.match(t.document.querySelector('.tracking-status').textContent,/Received by Admin/);assert.equal(t.server.maxPendingReport,1);
  }finally{t.close();}
});
