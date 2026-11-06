(() => {
  'use strict';
  const root = document.getElementById('reportTracker');
  if (!root || window.BS_PREVIEW_MODE) return;
  const $ = selector => root.querySelector(selector);
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const labels = {pending:'Report Submitted',received:'Received by Admin',reviewing:'Under Review',in_progress:'Action in Progress',resolved:'Resolved',rejected:'Rejected',needs_info:'Additional Information Required'};
  const milestones = ['pending','received','reviewing','in_progress','resolved'];
  const state = {user:null,csrf:'',ready:false,reports:[],listVersion:'',notifications:[],notificationVersion:'',guestId:null,timer:null,busy:false,controller:null,pendingRefresh:false,lookup:false,lastSync:null,stopped:false,epoch:0};
  const guest = root.dataset.trackingMode === 'guest';
  const time = value => {
    if (!value) return 'Not recorded';
    const normalized = /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/.test(value) ? value.replace(' ','T') + 'Z' : value;
    const parsed = new Date(normalized);
    return Number.isNaN(+parsed) ? 'Timestamp unavailable' : parsed.toLocaleString('en-PH',{timeZone:'Asia/Manila',month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'}) + ' PHT';
  };
  const stamp = value => `<time datetime="${escape(value || '')}">${escape(time(value))}</time>`;
  const statusLabel = status => labels[status] || 'Status unavailable';
  const empty = (title,body) => `<div class="tracking-empty"><span aria-hidden="true">▤</span><h3>${escape(title)}</h3><p>${escape(body)}</p></div>`;
  function feedback(message,error=false) {
    const el=$('#trackingFeedback'); el.hidden=!message; el.textContent=message;
    el.classList.toggle('is-error',error); el.setAttribute('role',error?'alert':'status');
  }
  function setSync(message) { $('#trackingSync').textContent=message; }
  async function request(action,body=null,query={},signal) {
    const params=new URLSearchParams({action,...query});
    const options={credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'},signal};
    if(body!==null) {options.method='POST';options.headers['Content-Type']='application/json';options.headers['X-CSRF-Token']=state.csrf;options.body=JSON.stringify(body);}
    const response=await fetch('api.php?'+params,options);
    let data;try{data=await response.json();}catch{throw new Error('The server could not return tracking data. Please try again.');}
    if(!response.ok || !data.ok) {const error=new Error(data.message || 'Unable to load tracking data. Please try again.');error.status=response.status;throw error;}
    return data;
  }
  function safePhoto(url) {
    if (!url) return '';
    try {
      const target = new URL(url,location.href);
      const safePath = target.pathname.endsWith('/evidence.php') || target.pathname.endsWith('/api.php') && target.searchParams.get('action')==='report_photo';
      if(target.origin!==location.origin || !safePath) return '';
      return target.href;
    } catch {return '';}
  }
  function timeline(report) {
    const history=Array.isArray(report.history)?report.history:[];
    const lastReopen=history.reduce((last,event,index)=>event.event_type==='reopen'?index:last,-1);
    const cycle=lastReopen<0?history:history.slice(lastReopen);
    const reached=new Map();
    for(const event of cycle) {
      if(['submitted','legacy_submission','status_change','reopen'].includes(event.event_type) && milestones.includes(event.new_status)) reached.set(event.new_status,event);
    }
    // Submission is known even when earlier administrative history was never recorded.
    const submitted=history.find(event=>['submitted','legacy_submission'].includes(event.event_type));
    if(submitted) reached.set('pending',submitted);
    const exceptional=['rejected','needs_info'].includes(report.status);
    let items=milestones;
    if(exceptional) items=milestones.filter(status=>reached.has(status) && status!=='resolved');
    if(!items.includes('pending'))items.unshift('pending');
    const current=report.status;
    return `${lastReopen>=0?'<p class="tracking-cycle-note">This case was reopened. The progress overview shows the current review cycle; earlier actions remain in the complete history.</p>':''}<ol class="tracking-timeline" aria-label="Recorded report progress">${items.map(status=>{
      const event=reached.get(status),isCurrent=current===status,complete=!!event && !isCurrent;
      const type=isCurrent?'current':complete?'completed':'future';
      return `<li class="tracking-milestone ${type}"${isCurrent?' aria-current="step"':''}><span class="tracking-step-icon" aria-hidden="true">${complete?'✓':isCurrent?'●':'○'}</span><div><strong>${escape(statusLabel(status))}</strong><span class="tracking-step-time">${event?stamp(event.created_at):status==='pending'?stamp(report.created_at):isCurrent?'Current status · transition time not recorded':'No recorded event'}</span></div></li>`;
    }).join('')}</ol>`;
  }
  function eventTitle(event) {
    if(event.event_type==='legacy_submission')return 'Report submitted · imported submission record';
    if(event.event_type==='reopen')return 'Report reopened';
    if(event.event_type==='public_update')return 'Public administrator update';
    if(event.event_type==='submitted')return 'Report submitted';
    return statusLabel(event.new_status);
  }
  function historyView(report) {
    const history=Array.isArray(report.history)?report.history:[];
    return history.length?`<ol class="tracking-history">${history.map(event=>`<li><span class="tracking-history-dot" aria-hidden="true"></span><div><strong>${escape(eventTitle(event))}</strong><div class="tracking-history-meta">${stamp(event.created_at)}${event.actor_name?` · ${escape(event.actor_name)}`:''}</div>${event.event_type==='reopen' && event.previous_status?`<p class="tracking-muted">Reopened from ${escape(statusLabel(event.previous_status))} to ${escape(statusLabel(event.new_status))}.</p>`:''}${event.public_note?`<p class="tracking-public-note">${escape(event.public_note)}</p>`:''}</div></li>`).join('')}</ol>`:'<p class="tracking-muted">No history has been recorded for this report.</p>';
  }
  function reportMarkup(report) {
    const id=Number(report.id),photo=safePhoto(report.photo_url);
    const exceptional=['needs_info','rejected'].includes(report.status);
    const publicNote=report.public_note || [...(report.history||[])].reverse().find(e=>e.public_note && !['submitted','legacy_submission'].includes(e.event_type))?.public_note || '';
    const stateEvent=[...(report.history||[])].reverse().find(e=>e.new_status===report.status && ['status_change','reopen'].includes(e.event_type));
    const actionNote=stateEvent?.public_note || publicNote;
    return `<div class="tracking-card-heading"><div><p class="tracking-reference">${escape(report.reference || 'Reference unavailable')} ${Number(report.is_demo)===1?'<span class="sample-pill">DEMO</span>':''}</p><h3>${escape(report.incident_type)}</h3><p class="tracking-location">${escape(report.location)}</p></div><span class="tracking-status tracking-status-${escape(report.status)}">${escape(statusLabel(report.status))}</span></div>
      ${Number(report.is_demo)===1?'<p class="tracking-legacy-note">Demonstration report only. This timeline does not describe a verified live incident.</p>':''}<dl class="tracking-dates"><div><dt>Submitted</dt><dd>${stamp(report.created_at)}</dd></div><div><dt>Last activity</dt><dd>${stamp(report.updated_at)}</dd></div></dl>
      ${exceptional?`<section class="tracking-action-message ${report.status==='rejected'?'is-rejected':'is-needs-info'}" aria-label="${escape(statusLabel(report.status))}"><strong>${escape(statusLabel(report.status))}</strong><p>${escape(actionNote || (report.status==='needs_info'?'An administrator has requested additional information. Contact the disaster office with your report reference.':'The report was declined. Check its complete history for the recorded reason.'))}</p>${report.status==='needs_info'?'<p class="tracking-action-hint">Action needed: follow the administrator’s request and contact the disaster office with this report reference. Keep your private tracking code to yourself.</p>':''}</section>`:''}
      ${report.legacy_history_incomplete?'<p class="tracking-legacy-note">This report predates detailed tracking. Its submission time and current status are preserved; earlier administrator actions and their timestamps were not recorded.</p>':''}
      ${timeline(report)}
      ${publicNote && !exceptional?`<section class="tracking-latest-note"><span class="feature-kicker">LATEST PUBLIC RESPONSE</span><p>${escape(publicNote)}</p></section>`:''}
      <details class="tracking-details" id="details-report-${id}"><summary id="summary-report-${id}">Report details</summary><div><p class="tracking-description">${escape(report.description)}</p>${photo?`<a class="tracking-photo-link" href="${escape(photo)}" target="_blank" rel="noopener noreferrer">View submitted evidence photo ↗</a>`:''}</div></details>
      <details class="tracking-details" id="history-report-${id}"><summary id="summary-history-${id}">Complete recorded history <span>${(report.history||[]).length} updates</span></summary>${historyView(report)}</details>`;
  }
  function updateCard(card,report) {
    const fingerprint=JSON.stringify(report);
    if(card._fingerprint===fingerprint)return;
    const open=[...card.querySelectorAll('details[open]')].map(detail=>detail.id);
    const active=card.contains(document.activeElement)?document.activeElement.id:'';
    card.innerHTML=reportMarkup(report);card._fingerprint=fingerprint;
    open.forEach(id=>{const detail=document.getElementById(id);if(detail)detail.open=true;});
    if(active)document.getElementById(active)?.focus({preventScroll:true});
  }
  function renderReports() {
    const list=$('#trackingReportList');list.setAttribute('aria-busy','false');
    const search=($('#trackingSearch')?.value || '').trim().toLowerCase();
    const status=$('#trackingStatus')?.value || 'all';
    const reports=state.reports.filter(report=>(status==='all'||report.status===status) && [report.reference,report.incident_type].join(' ').toLowerCase().includes(search));
    reports.sort((a,b)=>($('#trackingSort')?.value==='oldest'?1:-1)*(Number(a.id)-Number(b.id)));
    const visible=new Set(reports.map(report=>Number(report.id)));
    const known=new Set(state.reports.map(report=>Number(report.id)));
    list.querySelectorAll('[data-tracking-report]').forEach(card=>{if(!known.has(Number(card.dataset.trackingReport)))card.remove();else card.hidden=!visible.has(Number(card.dataset.trackingReport));});
    list.querySelectorAll('.tracking-empty,.tracking-loading').forEach(el=>el.remove());
    for(const report of reports) {
      let card=list.querySelector(`[data-tracking-report="${Number(report.id)}"]`);
      if(!card){card=document.createElement('article');card.className='tracking-report-card';card.id='report-'+Number(report.id);card.dataset.trackingReport=String(Number(report.id));list.append(card);}
      card.hidden=false;updateCard(card,report);
    }
    // Move only out-of-order cards; unchanged cards retain their expanded state and focus.
    reports.forEach((report,index)=>{const card=document.getElementById('report-'+Number(report.id)),visibleCards=[...list.children].filter(el=>!el.hidden);if(visibleCards[index]!==card)list.insertBefore(card,visibleCards[index] || null);});
    if(!reports.length) {
      const holder=document.createElement('div');holder.innerHTML=empty(state.reports.length?'No matching reports':guest?'Your timeline appears here':'No reports yet',state.reports.length?'Try a different search or status filter.':guest?'Enter your report reference and private tracking code above.':'Reports you submit while signed in will appear here. You can track a guest submission on Track My Report.');
      list.append(holder.firstElementChild);
    }
    const count=$('#trackingResultCount');count.hidden=guest;count.textContent=`${reports.length} of ${state.reports.length} reports shown`;
    renderStats();
  }
  function renderStats() {
    const el=$('#trackingStats');if(!el)return;
    const stats=[['Total reports',state.reports.length,'total'],['Pending',state.reports.filter(r=>r.status==='pending').length,'pending'],['Under review',state.reports.filter(r=>r.status==='reviewing').length,'reviewing'],['In progress',state.reports.filter(r=>r.status==='in_progress').length,'in_progress'],['Resolved',state.reports.filter(r=>r.status==='resolved').length,'resolved'],['Needs information',state.reports.filter(r=>r.status==='needs_info').length,'needs_info']];
    el.innerHTML=stats.map(([label,count,status])=>`<div class="tracking-stat tracking-stat-${status}"><strong>${count}</strong><span>${label}</span></div>`).join('');el.hidden=false;
  }
  function renderNotifications(unread) {
    const panel=$('#trackingNotifications');if(!panel)return;
    panel.hidden=false;
    const count=Number.isFinite(Number(unread))?Number(unread):state.notifications.filter(item=>!item.read_at && !Number(item.is_read)).length;
    $('#notificationUnread').textContent=String(count);$('#notificationUnread').setAttribute('aria-label',`${count} unread notifications`);
    document.querySelectorAll('[data-notification-unread]').forEach(el=>{el.textContent=String(count);el.hidden=count===0;});
    $('#markAllNotifications').disabled=!count;
    const list=$('#notificationList'),fingerprint=JSON.stringify(state.notifications);
    if(list._fingerprint===fingerprint)return;
    const active=list.contains(document.activeElement)?document.activeElement.id:'';
    list.innerHTML=state.notifications.length?state.notifications.map(item=>{
      const unreadItem=!item.read_at && !Number(item.is_read);
      return `<article class="tracking-notification ${unreadItem?'is-unread':''}"><div><a href="#report-${Number(item.report_id)}" data-open-report="${Number(item.report_id)}">${escape(item.reference || 'Report update')}</a><p>${escape(item.message || 'An administrator updated your report.')}</p><small>${stamp(item.created_at)}</small></div>${unreadItem?`<button class="btn btn-outline btn-sm" type="button" data-read-notification="${Number(item.id)}" id="read-notification-${Number(item.id)}">Mark as read</button>`:'<span class="tracking-read-label">Read</span>'}</article>`;
    }).join(''):'<p class="tracking-muted">Your report updates will appear here.</p>';
    list._fingerprint=fingerprint;
    if(active)document.getElementById(active)?.focus({preventScroll:true});
  }
  function schedule(immediate=false) {
    clearTimeout(state.timer);
    if(state.stopped || state.lookup || document.hidden || !state.ready || guest && !state.guestId || !guest && !state.user)return;
    state.timer=setTimeout(()=>sync(false),immediate?0:12000);
  }
  async function sync(manual=false) {
    if(state.lookup){state.pendingRefresh ||= manual;return;}
    if(state.busy){state.pendingRefresh ||= manual;return;}
    if(!state.ready){await bootstrap();return;}
    if(!guest&&!state.user)return;
    if(guest&&!state.guestId){renderReports();setSync('Enter your private receipt details to load a report.');return;}
    const epoch=state.epoch;
    state.busy=true;state.controller=new AbortController();$('#trackingRefresh').disabled=true;
    if(manual)setSync('Checking for recorded updates…');
    try {
      const reportPromise=guest?request('report_details',null,{id:state.guestId,version:state.listVersion},state.controller.signal):request('my_reports',null,{version:state.listVersion},state.controller.signal);
      const notificationPromise=guest?Promise.resolve(null):request('my_notifications',null,{version:state.notificationVersion},state.controller.signal).then(data=>({data})).catch(error=>({error}));
      const [result,notification]=await Promise.all([reportPromise,notificationPromise]);
      if(epoch!==state.epoch || state.stopped)return;
      if(!result.unchanged) {
        state.reports=guest?(result.report?[result.report]:[]):result.reports || [];
        state.listVersion=String(result.version ?? (guest?result.report?.version:'') ?? '');renderReports();
      }
      if(notification?.data) {
        if(!notification.data.unchanged){state.notifications=notification.data.notifications || [];state.notificationVersion=String(notification.data.version || '');renderNotifications(notification.data.unread_count);}
      }
      state.lastSync=new Date();setSync('Last synchronized '+time(state.lastSync.toISOString())+' · Checks every 12 seconds while visible.');
      feedback(notification?.error?'Reports are current, but notifications could not be refreshed. Try Refresh.':'',!!notification?.error);
    } catch(error) {
      if(error.name!=='AbortError' && epoch===state.epoch && !state.stopped) {
        if(error.status===401 && !guest){state.user=null;state.reports=[];state.notifications=[];renderReports();$('#trackingFilters').hidden=true;$('#trackingNotifications').hidden=true;$('#trackingStats').hidden=true;}
        if([401,403,404].includes(error.status)&&guest){state.guestId=null;state.reports=[];state.listVersion='';renderReports();$('#trackingForget').hidden=true;}
        feedback(error.message+' Displayed information may be out of date.',true);
        setSync(state.lastSync?'Last successful synchronization: '+time(state.lastSync.toISOString()):'No successful synchronization yet.');
      }
    } finally {
      state.busy=false;state.controller=null;$('#trackingRefresh').disabled=state.lookup;
      if(!state.lookup){const immediate=state.pendingRefresh;state.pendingRefresh=false;schedule(immediate);}
    }
  }
  async function bootstrap() {
    if(state.busy)return;
    state.busy=true;$('#trackingRefresh').disabled=true;setSync('Connecting to tracking service…');
    try {const data=await request('bootstrap');state.ready=true;state.user=data.user;state.csrf=data.csrf;state.busy=false;await begin();}
    catch(error){feedback(error.message,true);$('#trackingReportList').innerHTML=empty('Tracking is unavailable','Check your connection or contact the site administrator. Use Refresh to try again.');$('#trackingReportList').setAttribute('aria-busy','false');setSync('No successful synchronization yet.');}
    finally{state.busy=false;$('#trackingRefresh').disabled=false;}
  }
  async function begin() {
    if(guest){renderReports();setSync('Enter your private receipt details to load a report.');return;}
    if(!state.user) {
      $('#trackingReportList').innerHTML=empty('Sign in to view your reports','Only reports belonging to your signed-in account are shown here.');$('#trackingReportList').setAttribute('aria-busy','false');
      feedback('Please sign in to view your reports. Guest reports can be tracked with their private code.');
      const links=document.createElement('p');links.className='tracking-auth-links';links.innerHTML='<a class="btn btn-blue" href="login.php">Sign in</a><a class="btn btn-outline" href="track-report.php">Track a guest report</a>';
      $('#trackingReportList').append(links);setSync('Sign-in required.');return;
    }
    $('#trackingFilters').hidden=false;await sync(true);
    if(location.hash.startsWith('#report-'))openReport(Number(location.hash.slice(8)),false);
  }
  function openReport(id,moveFocus=true) {
    if(!Number.isInteger(id)||id<1)return;
    if($('#trackingSearch'))$('#trackingSearch').value='';if($('#trackingStatus'))$('#trackingStatus').value='all';renderReports();
    const card=document.getElementById('report-'+id);if(!card)return;
    const history=document.getElementById('history-report-'+id);if(history)history.open=true;
    card.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});
    if(moveFocus)document.getElementById('summary-history-'+id)?.focus({preventScroll:true});
  }
  $('#trackingRefresh').addEventListener('click',()=>sync(true));
  ['#trackingSearch','#trackingStatus','#trackingSort'].forEach(selector=>$(selector)?.addEventListener(selector==='#trackingSearch'?'input':'change',renderReports));
  root.addEventListener('click',async event=>{
    const open=event.target.closest('[data-open-report]');if(open){event.preventDefault();openReport(Number(open.dataset.openReport));return;}
    const read=event.target.closest('[data-read-notification]');if(read){read.disabled=true;try{await request('mark_notification_read',{id:Number(read.dataset.readNotification)});state.notificationVersion='';await sync(true);}catch(error){feedback(error.message,true);read.disabled=false;}}
  });
  $('#markAllNotifications')?.addEventListener('click',async event=>{const button=event.currentTarget;button.disabled=true;try{await request('mark_notification_read',{all:true});state.notificationVersion='';await sync(true);}catch(error){feedback(error.message,true);button.disabled=false;}});
  $('#toggleTrackingCode')?.addEventListener('click',event=>{const input=$('#guestTrackingCode'),shown=input.type==='password';input.type=shown?'text':'password';event.currentTarget.textContent=shown?'Hide':'Show';event.currentTarget.setAttribute('aria-pressed',String(shown));});
  $('#guestTrackingForm')?.addEventListener('submit',async event=>{
    event.preventDefault();if(state.lookup)return;
    const form=event.currentTarget;if(!form.reportValidity())return;
    if(!state.ready){feedback('The tracking service is unavailable. Select Refresh and try again.',true);return;}
    state.lookup=true;state.epoch++;clearTimeout(state.timer);state.controller?.abort();state.guestId=null;state.reports=[];state.listVersion='';renderReports();$('#trackingForget').hidden=true;$('#guestTrackingSubmit').disabled=true;$('#trackingRefresh').disabled=true;feedback('Checking your private receipt…');
    const body={reference:$('#guestReference').value.trim(),tracking_code:$('#guestTrackingCode').value};
    $('#guestTrackingCode').value='';$('#guestTrackingCode').type='password';$('#toggleTrackingCode').textContent='Show';$('#toggleTrackingCode').setAttribute('aria-pressed','false');
    try {const result=await request('track_guest_report',body);if(state.stopped)return;state.guestId=Number(result.report.id);state.reports=[result.report];state.listVersion=String(result.version ?? result.report.version ?? '');renderReports();$('#trackingForget').hidden=false;state.lastSync=new Date();setSync('Last synchronized '+time(state.lastSync.toISOString())+' · Your private code has been cleared from the form.');feedback('Report loaded securely. Keep your private code safe for future visits.');schedule();}
    catch(error){state.guestId=null;state.reports=[];state.listVersion='';renderReports();$('#trackingForget').hidden=true;feedback(error.message,true);setSync('Report lookup was not authorized or is temporarily unavailable.');}
    finally{body.tracking_code='';state.lookup=false;$('#guestTrackingSubmit').disabled=false;$('#trackingRefresh').disabled=false;const immediate=state.pendingRefresh;state.pendingRefresh=false;schedule(immediate);}
  });
  $('#trackingForget')?.addEventListener('click',async event=>{
    if(state.lookup)return;
    const button=event.currentTarget;button.disabled=true;state.lookup=true;$('#trackingRefresh').disabled=true;$('#guestTrackingSubmit').disabled=true;state.epoch++;clearTimeout(state.timer);state.controller?.abort();
    try{await request('clear_guest_tracking',{id:state.guestId});state.guestId=null;state.reports=[];state.listVersion='';renderReports();button.hidden=true;feedback('Private report access cleared.');setSync('Enter your private receipt details to load a report.');$('#guestReference').focus();}
    catch(error){feedback(error.message,true);}finally{button.disabled=false;state.lookup=false;$('#trackingRefresh').disabled=false;$('#guestTrackingSubmit').disabled=false;const immediate=state.pendingRefresh;state.pendingRefresh=false;schedule(immediate);}
  });
  document.addEventListener('visibilitychange',()=>{clearTimeout(state.timer);if(document.hidden)state.controller?.abort();else if(state.ready)schedule(true);});
  window.addEventListener('pagehide',()=>{state.stopped=true;state.epoch++;clearTimeout(state.timer);state.controller?.abort();state.reports=[];state.notifications=[];state.guestId=null;state.listVersion='';state.notificationVersion='';state.ready=false;$('#trackingReportList').replaceChildren();if($('#notificationList'))$('#notificationList').replaceChildren();if($('#guestTrackingCode'))$('#guestTrackingCode').value='';});
  window.addEventListener('pageshow',event=>{if(event.persisted){state.stopped=false;state.busy=false;bootstrap();}});
  document.addEventListener('dirms:ready',event=>{if(state.ready)return;state.ready=true;state.user=event.detail?.user || null;state.csrf=event.detail?.csrf || '';begin();});
  document.addEventListener('dirms:unavailable',event=>{if(state.ready)return;feedback(event.detail?.message || 'Unable to connect to the database. Try Refresh.',true);$('#trackingReportList').innerHTML=empty('Tracking is unavailable','Use Refresh to try again.');$('#trackingReportList').setAttribute('aria-busy','false');setSync('No successful synchronization yet.');});
  if(window.DIRMS_APP?.ready){state.ready=true;state.user=window.DIRMS_APP.getUser();state.csrf=window.DIRMS_APP.getCsrf();begin();}
})();
