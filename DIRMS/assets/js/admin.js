(() => {
 'use strict';
 const $=(s,root=document)=>root.querySelector(s);
 const $$=(s,root=document)=>[...root.querySelectorAll(s)];
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const reportDate=v=>new Date(/[zZ]$|[+-]\d\d:\d\d$/.test(String(v))?v:String(v).replace(' ','T')+'Z');
 const fmt=v=>{if(!v)return 'Not recorded';const date=reportDate(v);return Number.isNaN(date.getTime())?'Not recorded':new Intl.DateTimeFormat('en-PH',{dateStyle:'medium',timeStyle:'medium',timeZone:'Asia/Manila'}).format(date)+' (Asia/Manila)';};
 const words=s=>s.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
 let db={},csrf='',currentSection='overview',currentContent='news',reportRequest=0;
 const reportFilters={search:'',status:'',type:'',from:'',to:'',sort:'newest'};
 const reportLabels={pending:'Report Submitted',received:'Received by Admin',reviewing:'Under Review',in_progress:'Action in Progress',resolved:'Resolved',rejected:'Rejected',needs_info:'Additional Information Required'};
 const reportActions={received:'Acknowledge Report',reviewing:'Start Review',needs_info:'Request More Information',in_progress:'Mark Action in Progress',resolved:'Mark Resolved',rejected:'Reject Report'};
 const reportTransitions={pending:['received','rejected','needs_info'],received:['reviewing','rejected','needs_info'],reviewing:['in_progress','rejected','needs_info'],in_progress:['resolved','needs_info'],needs_info:['reviewing','rejected'],resolved:['reviewing'],rejected:['reviewing']};
 const modalOrigins=new Map();
 const displayNames={alerts:'Alert',centers:'Evacuation Center',hotlines:'Hotline',tips:'Preparedness Tip',news:'News Article'};
 const fields={
   alerts:[['title','Alert Title','text',true],['alert_type','Alert Type','select',true,['Flood','Fire','Typhoon','Earthquake','Heavy Rainfall','Strong Winds','Landslide','Other']],['severity','Severity','select',true,['low','medium','high','extreme']],['location','Affected Location','text',true],['description','Description','textarea',true],['instructions','Safety Instructions','textarea'],['expires_at','Expiry Date / Time (optional)','datetime-local'],['is_active','Visible to public','checkbox']],
   centers:[['name','Center Name','text',true],['barangay','Barangay','text',true],['address','Full Address','text',true],['capacity','Total Capacity','number',true],['occupancy','Current Occupancy','number',true],['latitude','Pin Latitude (optional; decimal GPS)','number'],['longitude','Pin Longitude (optional; decimal GPS)','number'],['notes','Notes','textarea'],['is_active','Visible to public','checkbox']],
   hotlines:[['organization','Organization','text',true],['phone','Verified Phone Number','tel',true],['description','Description','text'],['sort_order','Display Order','number'],['is_active','Visible to public','checkbox']],
   tips:[['title','Tip Title','text',true],['body','Safety Guidance','textarea',true],['icon','Icon Theme','select',true,['shield','cloud','waves','activity','briefcase','users','fire','mountain']],['sort_order','Display Order','number']],
   news:[['title','Headline','text',true],['summary','Summary','textarea',true],['source_url','Source Website (optional)','url'],['is_active','Visible to public','checkbox']]
 };
 ['alerts','centers','hotlines','news'].forEach(type=>fields[type].push(['is_demo','Demonstration / sample record (not verified live information)','checkbox']));
 if(window.BS_PREVIEW_MODE&&!document.querySelector('link[href="assets/css/admin-tracking.css"]')){const stylesheet=document.createElement('link');stylesheet.rel='stylesheet';stylesheet.href='assets/css/admin-tracking.css';document.head.append(stylesheet);}
 async function api(action,body,params={}){
   if(window.BS_PREVIEW_MODE) return previewApi(action,body,params);
   const opts={headers:{'X-CSRF-Token':csrf},cache:'no-store',credentials:'same-origin'};
   if(body!==undefined){opts.method='POST';opts.headers['Content-Type']='application/json';opts.body=JSON.stringify(body);}
   const response=await fetch('api.php?'+new URLSearchParams({action,...params}),opts);
   let result;try{result=await response.json();}catch{throw new Error('Unexpected server response.');}
   if(!response.ok||!result.ok){const error=new Error(result.message||'Request failed.');error.status=response.status;throw error;}
   return result;
 }
 function previewApi(action,body,params={}){
   const d=window.BS_PREVIEW_ADMIN;
   const save=()=>window.BS_SAVE_PREVIEW?.();
   const recalc=()=>{d.stats={reports:d.reports.length,residents:d.users.filter(u=>u.role==='resident'&&Number(u.is_active)).length,centers:d.centers.filter(c=>Number(c.is_active)).length,alerts:d.alerts.filter(a=>Number(a.is_active)).length,pending:d.reports.filter(r=>['pending','reviewing'].includes(r.status)).length};};
   if(action==='admin_data'){recalc();return Promise.resolve({ok:true,data:d,csrf:'preview-token'});}
   if(action==='admin_save'){
      const collection=d[body.type];const id=Number(body.id)||Math.max(0,...collection.map(r=>Number(r.id)))+1;
      const entry=collection.find(r=>Number(r.id)===id);
      const fields={...body.data};
      if(entry)Object.assign(entry,fields);
      else collection.unshift({id,...fields,created_at:new Date().toISOString().slice(0,19).replace('T',' ')});
      save();return Promise.resolve({ok:true,message:'Saved in local demo data.',id});
   }
   if(action==='admin_delete'){d[body.type]=d[body.type].filter(r=>Number(r.id)!==Number(body.id));save();return Promise.resolve({ok:true,message:'Removed from local demo data.'});}
   if(action==='report_details'){const entry=d.reports.find(r=>Number(r.id)===Number(params.id));if(!entry)return Promise.reject(new Error('Demo report not found.'));const terminal=['resolved','rejected'].includes(entry.status);return Promise.resolve({ok:true,report:{...entry,reference:entry.reference||'BS-'+String(entry.id).padStart(6,'0'),version:Number(entry.version)||1,history:entry.history||[],allowed_transitions:terminal?[]:reportTransitions[entry.status]||[],can_reopen:terminal}});}
   if(action==='report_status'||action==='report_add_public_update'){
      const entry=d.reports.find(r=>Number(r.id)===Number(body.id));if(!entry)return Promise.reject(new Error('Demo report not found.'));
      if(Number(body.version)!==(Number(entry.version)||1))return Promise.reject(new Error('Demo report changed. Reopen its details before saving.'));
      const previous=entry.status;
      if(action==='report_status'&&!(reportTransitions[previous]||[]).includes(body.status))return Promise.reject(new Error('This status transition is not allowed.'));
      if(action==='report_status')entry.status=body.status;
      entry.version=(Number(entry.version)||1)+1;entry.updated_at=new Date().toISOString();
      entry.history=entry.history||[];entry.history.push({id:entry.version,previous_status:previous,new_status:entry.status,event_type:action==='report_add_public_update'?'note':body.event_type||'status_change',public_note:body.public_note||'',internal_note:body.internal_note||'',actor_name:'Demo Administrator',created_at:entry.updated_at});
      if(body.public_note)entry.public_note=body.public_note;
      save();return Promise.resolve({ok:true,message:'Saved in this browser demonstration only.'});
   }
   if(action==='user_update'){const u=d.users.find(r=>Number(r.id)===Number(body.id));if(u)Object.assign(u,{role:body.role,is_active:body.is_active?1:0});save();return Promise.resolve({ok:true,message:'Demo user updated.'});}
   if(action==='settings_save'){d.settings={...d.settings,...body};save();return Promise.resolve({ok:true,message:'Demo settings updated.'});}
   if(action==='logout'){return Promise.resolve({ok:true,message:'Preview closed.'});}
   return Promise.reject(new Error('This action requires PHP/MySQL.'));
 }
 function toast(message,error=false){const item=document.createElement('div');item.className='toast'+(error?' error':'');item.textContent=message;$('#adminToastRegion').append(item);setTimeout(()=>item.remove(),4500);}
 function badgeStatus(status){return `<span class="status-pill status-${esc(status)}">${esc(reportLabels[status]||words(status||'unknown'))}</span>`;}
 function badgeSeverity(v){return `<span class="sev-pill sev-${esc(v)}">${esc(v)}</span>`;}
 function demo(v){return Number(v.is_demo)===1?'<span class="sample-pill">DEMO</span> ':'';}
 function empty(msg='No records found.'){return `<div class="empty-state"><strong>${esc(msg)}</strong>Add a record to get started, or adjust your search.</div>`;}
 function openModal(id){const modal=$('#'+id);if(modal.hidden)modalOrigins.set(id,document.activeElement);modal.hidden=false;$('.admin-layout').inert=true;document.body.style.overflow='hidden';$('#'+id+' .modal-close')?.focus();}
 function closeModal(id){$('#'+id).hidden=true;if(id==='adminDetailModal')reportRequest++;if($$('.modal-backdrop:not([hidden])').length===0){document.body.style.overflow='';$('.admin-layout').inert=false;}const origin=modalOrigins.get(id);if(origin?.isConnected)origin.focus();modalOrigins.delete(id);}
 async function reload(){const result=await api('admin_data');db=result.data;csrf=result.csrf;renderSection();}
 function header(title,desc,action=''){return `<div class="admin-lead"><div><h2>${esc(title)}</h2><p>${esc(desc)}</p></div>${action}</div>`;}
 function addBtn(type){return `<button type="button" class="btn btn-blue btn-sm" data-add="${type}">＋ Add ${esc(displayNames[type])}</button>`;}
 function table(columns,items,type,options={}){
   const headers=columns.map(c=>`<th>${esc(c[0])}</th>`).join('');
   const rows=items.map(r=>`<tr>${columns.map(c=>`<td data-label="${esc(c[0])}" title="${esc(String(r[c[2]||'']??''))}">${c[1](r)}</td>`).join('')}<td data-label="Actions"><div class="table-actions">${options.report?`<button class="icon-btn" title="Review report" data-review="${Number(r.id)}">View</button>`:options.user?`<button class="icon-btn" title="Manage user" data-user="${Number(r.id)}">Edit</button>`:`<button class="icon-btn" title="Edit" data-edit="${type}" data-id="${Number(r.id)}">✎</button><button class="icon-btn delete" title="Delete" data-delete="${type}" data-id="${Number(r.id)}">▣</button>`}</div></td></tr>`).join('');
   return `<div class="data-card"><div class="data-toolbar"><h2>${esc(options.title || displayNames[type]+' Records')}</h2><div class="toolbar-actions"><input class="toolbar-search" aria-label="Search table" placeholder="Search records..." type="search" data-table-search>${options.add===false?'':addBtn(type)}</div></div><div class="admin-table-wrap"><table class="data-table"><thead><tr>${headers}<th>Actions</th></tr></thead><tbody>${rows||`<tr><td colspan="${columns.length+1}">${empty()}</td></tr>`}</tbody></table></div><div class="table-caption">Showing ${items.length} record${items.length===1?'':'s'}. DEMO entries are sample content, not verified live information.</div></div>`;
 }
 const reference=r=>r.reference||'BS-'+String(Number(r.id)).padStart(6,'0');
 const reportsColumns=[['Reference',r=>`<strong>${esc(reference(r))}</strong>`],['Incident',r=>`${demo(r)}<strong>${esc(r.incident_type)}</strong>`],['Location',r=>esc(r.location)],['Reported',r=>`<span class="table-muted">${esc(fmt(r.created_at))}</span>`],['Status',r=>badgeStatus(r.status)]];
 const alertColumns=[['Title',r=>`${demo(r)}<strong>${esc(r.title)}</strong>`],['Type',r=>esc(r.alert_type)],['Severity',r=>badgeSeverity(r.severity)],['Location',r=>esc(r.location)],['Published',r=>`<span class="table-muted">${esc(fmt(r.created_at))}</span>`],['Visible',r=>Number(r.is_active)?'Yes':'No']];
 const centerColumns=[['Center',r=>`${demo(r)}<strong>${esc(r.name)}</strong>`],['Barangay',r=>esc(r.barangay)],['Capacity',r=>Number(r.capacity)>0?Number(r.capacity).toLocaleString():'Not recorded'],['Occupancy',r=>Number(r.occupancy).toLocaleString()],['Status',r=>Number(r.is_demo)?'<span class="sample-pill">Demo · unverified</span>':'<span class="sev-pill sev-medium">Unverified operating status</span>'],['Visible',r=>Number(r.is_active)?'Yes':'No']];
 const hotlineColumns=[['Organization',r=>`${demo(r)}<strong>${esc(r.organization)}</strong>`],['Phone',r=>esc(r.phone)],['Description',r=>esc(r.description)],['Visible',r=>Number(r.is_active)?'Yes':'No']];
 const newsColumns=[['Headline',r=>`${demo(r)}<strong>${esc(r.title)}</strong>`],['Summary',r=>esc(r.summary).slice(0,130)],['Date',r=>esc(fmt(r.created_at))],['Visible',r=>Number(r.is_active)?'Yes':'No']];
 const tipsColumns=[['Title',r=>`<strong>${esc(r.title)}</strong>`],['Guidance',r=>esc(r.body).slice(0,110)],['Order',r=>Number(r.sort_order)]];
 const userColumns=[['Name',r=>`<strong>${esc(r.full_name)}</strong>`],['Email',r=>esc(r.email)],['Phone',r=>esc(r.phone||'—')],['Role',r=>`<span class="sev-pill ${r.role==='admin'?'sev-high':'sev-low'}">${esc(r.role)}</span>`],['Status',r=>Number(r.is_active)?'<span class="sev-pill sev-low">Active</span>':'<span class="sev-pill sev-high">Disabled</span>'],['Joined',r=>esc(fmt(r.created_at))]];
 function overview(){const s=db.stats||{};return `${header('Community Overview','A snapshot of alerts, residents, evacuation resources, and incoming incident reports.',`<a class="btn btn-outline btn-sm" href="index.php" target="_blank" rel="noopener noreferrer">View Public Website ↗</a>`)}<div class="admin-note">This project includes clearly marked demonstration records. Replace sample entries with verified information before community use.</div><div class="stat-grid"><div class="stat-card red"><div><strong>${s.reports||0}</strong><span>Total Incident Reports</span></div><span class="stat-icon">▤</span></div><div class="stat-card blue"><div><strong>${s.residents||0}</strong><span>Active Residents</span></div><span class="stat-icon">♟</span></div><div class="stat-card green"><div><strong>${s.centers||0}</strong><span>Active Centers</span></div><span class="stat-icon">⌂</span></div><div class="stat-card orange"><div><strong>${s.alerts||0}</strong><span>Active Alerts</span></div><span class="stat-icon">♧</span></div></div>${reportStats()}<div class="admin-grid2"><div class="dashboard-card"><div class="section-head"><h2>Recent Incident Reports</h2><button type="button" data-section="reports" class="btn btn-outline btn-sm">View all →</button></div><div class="admin-table-wrap"><table class="data-table"><thead><tr><th>Incident</th><th>Location</th><th>Status</th><th>Actions</th></tr></thead><tbody>${(db.reports||[]).slice(0,6).map(r=>`<tr><td>${demo(r)}<strong>${esc(r.incident_type)}</strong></td><td>${esc(r.location)}</td><td>${badgeStatus(r.status)}</td><td><button type="button" class="icon-btn" data-review="${r.id}">View</button></td></tr>`).join('')||'<tr><td colspan="4">No reported incidents yet.</td></tr>'}</tbody></table></div></div><div class="dashboard-card"><div class="section-head"><h2>Recent Alerts</h2><button type="button" data-section="alerts" class="btn btn-outline btn-sm">Manage →</button></div><div class="admin-table-wrap"><table class="data-table"><thead><tr><th>Alert</th><th>Severity</th><th>Actions</th></tr></thead><tbody>${(db.alerts||[]).slice(0,6).map(a=>`<tr><td>${demo(a)}${esc(a.title)}</td><td>${badgeSeverity(a.severity)}</td><td><button type="button" class="icon-btn" data-edit="alerts" data-id="${a.id}">✎</button></td></tr>`).join('')||'<tr><td colspan="3">No alerts published yet.</td></tr>'}</tbody></table></div></div></div>`;}
 function reportStats(){
   const counts=Object.fromEntries(Object.keys(reportLabels).map(key=>[key,0]));
   (db.reports||[]).forEach(r=>{if(Object.hasOwn(counts,r.status))counts[r.status]++;});
   return `<div class="report-stat-grid" aria-label="Incident report statistics"><div class="report-stat total"><strong>${(db.reports||[]).length}</strong><span>Total Reports</span></div>${Object.entries(reportLabels).map(([key,label])=>`<div class="report-stat ${key}"><strong>${counts[key]}</strong><span>${esc(label)}</span></div>`).join('')}</div>`;
 }
 function filteredReports(){
   const query=reportFilters.search.toLowerCase().trim();
   return (db.reports||[]).filter(r=>{
     const text=[reference(r),r.incident_type,r.location,r.reporter_name].join(' ').toLowerCase();
     const date=reportDate(r.created_at);const day=Number.isNaN(date.getTime())?'':new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Manila'}).format(date);
     return (!query||text.includes(query))&&(!reportFilters.status||r.status===reportFilters.status)&&(!reportFilters.type||r.incident_type===reportFilters.type)&&(!reportFilters.from||day>=reportFilters.from)&&(!reportFilters.to||day<=reportFilters.to);
   }).sort((a,b)=>{const chronological=(reportDate(a.created_at).getTime()||0)-(reportDate(b.created_at).getTime()||0)||Number(a.id)-Number(b.id);return reportFilters.sort==='oldest'?chronological:-chronological;});
 }
 function reportResults(){
   const reports=filteredReports();
   return `<p class="report-result-count" role="status">${reports.length} report${reports.length===1?'':'s'} shown</p><div class="admin-report-grid">${reports.map(r=>`<article class="admin-report-card"><div class="report-card-heading"><strong>${esc(reference(r))}</strong>${badgeStatus(r.status)}</div><h3>${demo(r)}${esc(r.incident_type)}</h3><p>${esc(r.location)}</p><dl><div><dt>Reporter</dt><dd>${esc(r.reporter_name||'Not provided')}</dd></div><div><dt>Submitted</dt><dd>${esc(fmt(r.created_at))}</dd></div><div><dt>Last activity</dt><dd>${esc(fmt(r.updated_at||r.created_at))}</dd></div></dl><button type="button" class="btn btn-outline" data-review="${Number(r.id)}" aria-label="Review ${esc(reference(r))}">Review report →</button></article>`).join('')||'<div class="empty-state"><strong>No matching incident reports</strong>Adjust the filters or refresh the report list.</div>'}</div>`;
 }
 function reportsPage(){
   const types=[...new Set((db.reports||[]).map(r=>r.incident_type))].sort();
   return `${header('Incident Report Management','Acknowledge reports explicitly, document every action, and keep residents informed.', '<button type="button" class="btn btn-outline btn-sm" data-refresh-reports>Refresh reports</button>')}${window.BS_PREVIEW_MODE?'<div class="admin-note">Browser demonstration only. Changes here are simulated and do not notify residents or update the PHP database.</div>':''}${reportStats()}<form class="report-filter-panel" id="reportFilterForm" role="search" aria-label="Filter incident reports"><label class="report-search">Search reports<input type="search" name="search" data-report-filter="search" placeholder="Reference, incident, location or reporter" value="${esc(reportFilters.search)}"></label><label>Status<select name="status" data-report-filter="status"><option value="">All statuses</option>${Object.entries(reportLabels).map(([key,label])=>`<option value="${key}" ${reportFilters.status===key?'selected':''}>${esc(label)}</option>`).join('')}</select></label><label>Incident type<select name="type" data-report-filter="type"><option value="">All incident types</option>${types.map(type=>`<option ${reportFilters.type===type?'selected':''}>${esc(type)}</option>`).join('')}</select></label><label>Submitted from<input type="date" name="from" data-report-filter="from" value="${esc(reportFilters.from)}"></label><label>Submitted through<input type="date" name="to" data-report-filter="to" value="${esc(reportFilters.to)}"></label><label>Sort<select name="sort" data-report-filter="sort"><option value="newest" ${reportFilters.sort==='newest'?'selected':''}>Newest first</option><option value="oldest" ${reportFilters.sort==='oldest'?'selected':''}>Oldest first</option></select></label><button type="button" class="btn btn-outline" data-clear-report-filters>Clear filters</button></form><div id="reportResults">${reportResults()}</div>`;
 }
 function settings(){const settings=db.settings||{};return `${header('Website Settings','Customize the public website title, community location, and safety notice.')}<div class="admin-note">Use a prominently displayed warning until every center, hotline, and alert has been verified by authorized local personnel.</div><div class="dashboard-card settings-form"><form class="form-stack" id="settingsForm"><label>Website Name<input name="site_name" required maxlength="120" value="${esc(settings.site_name||'DIRMS')}"></label><label>Covered City / Municipality<input name="city" maxlength="180" value="${esc(settings.city||'')}"></label><label>Public Contact Email<input type="email" name="contact_email" maxlength="190" value="${esc(settings.contact_email||'')}"></label><label>Homepage Safety Banner<textarea name="safety_banner" rows="4" maxlength="600">${esc(settings.safety_banner||'')}</textarea></label><button class="btn btn-blue" type="submit">Save Website Settings →</button></form></div>`;}
 function content(){const type=currentContent;return `${header('Content Management','Publish community news articles and update emergency preparedness instructions.')}<div class="admin-tabs"><button data-content-tab="news" class="${type==='news'?'active':''}">Disaster News</button><button data-content-tab="tips" class="${type==='tips'?'active':''}">Preparedness Tips</button></div>${type==='news'?table(newsColumns,db.news||[],'news'):table(tipsColumns,db.tips||[],'tips')}`;}
 function renderSection(){
   const titles={overview:'Dashboard',alerts:'Manage Alerts',reports:'Incident Reports',centers:'Evacuation Centers',hotlines:'Emergency Hotlines',users:'User Management',content:'News & Tips',settings:'Website Settings'};
   $('#adminPageTitle').textContent=titles[currentSection]||'Dashboard';
   $$('.side-nav [data-section]').forEach(b=>b.classList.toggle('active',b.dataset.section===currentSection));
   let html='';
   switch(currentSection){
     case 'overview':html=overview();break;
     case 'alerts':html=header('Manage Disaster Alerts','Create, edit, publish or archive community warnings.')+table(alertColumns,db.alerts||[],'alerts');break;
     case 'reports':html=reportsPage();break;
     case 'centers':html=header('Manage Evacuation Centers','For a GPS pinpoint, enter BOTH latitude and longitude from a verified Google Maps place pin. Without GPS, the public map searches the address and may be approximate.')+table(centerColumns,db.centers||[],'centers');break;
     case 'hotlines':html=header('Emergency Hotlines','Reference contacts are supplied; verify official numbers regularly before publishing.')+table(hotlineColumns,db.hotlines||[],'hotlines');break;
     case 'users':html=header('Community Users','Manage registered residents, administrator permissions and account status.')+table(userColumns,db.users||[],'users',{title:'Registered Users',user:true,add:false});break;
     case 'content':html=content();break;
     case 'settings':html=settings();break;
   }
   $('#adminContent').innerHTML=html;
 }
 function showEditor(type,id=0){
   const item=(db[type]||[]).find(x=>Number(x.id)===Number(id))||{};
   $('#editorTitle').textContent=(id?'Edit ':'Add ')+displayNames[type];
   const form=$('#editorForm');form.dataset.type=type;form.dataset.id=String(id);
   form.innerHTML=fields[type].map(([key,label,inputType,required,options])=>{
     let value=item[key]??(key==='is_active'||key==='is_demo'?1:key==='severity'?'medium':key==='icon'?'shield':key==='sort_order'||key==='capacity'||key==='occupancy'?0:'');
     if(key==='expires_at' && value){const date=reportDate(value);value=Number.isNaN(date.getTime())?'':new Intl.DateTimeFormat('sv-SE',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',timeZone:'Asia/Manila'}).format(date).replace(' ','T');}
     const req=required?'required':'';
     if(inputType==='checkbox')return `<label class="check-line"><input name="${key}" type="checkbox" ${Number(value)?'checked':''}><span>${esc(label)}</span></label>`;
     if(inputType==='textarea')return `<label>${esc(label)}<textarea name="${key}" ${req} maxlength="5000">${esc(value)}</textarea></label>`;
     if(inputType==='select')return `<label>${esc(label)}<select name="${key}" ${req}>${options.map(option=>`<option value="${esc(option)}" ${String(value)===option?'selected':''}>${esc(words(option))}</option>`).join('')}</select></label>`;
     return `<label>${esc(label)}<input name="${key}" type="${inputType}" value="${esc(value)}" ${req} ${inputType==='number' ? (key==='latitude'||key==='longitude'?'step="any"':'step="1"') : ''}></label>`;
   }).join('')+`<div class="editor-actions"><button type="button" class="btn btn-outline" data-close-modal>Cancel</button><button class="btn btn-blue" type="submit">Save ${esc(displayNames[type])} →</button></div>`;
   openModal('editorModal');
 }
 function reportHistory(r){
   const entries=r.history||[];
   return `<section class="admin-report-history" aria-labelledby="reportHistoryHeading"><h3 id="reportHistoryHeading">Complete recorded history</h3><p class="report-privacy-hint">Private notes are visible only to administrators. Existing reports may have no recorded administrator transitions before this upgrade.</p>${entries.length?`<ol>${entries.map(event=>{const noteEvent=['note','public_update','internal_note'].includes(event.event_type)||event.previous_status===event.new_status;const label=noteEvent?'Administrator note':event.event_type==='reopen'?'Report reopened':reportLabels[event.new_status]||'Report event';return `<li><div class="history-event-heading"><strong>${esc(label)}</strong><time>${esc(fmt(event.created_at))}</time></div><p class="history-actor">${esc(event.actor_name||(event.new_status==='pending'?'Submission record':'Recorded actor unavailable'))}${event.previous_status&&!noteEvent?` · ${esc(reportLabels[event.previous_status]||event.previous_status)} → ${esc(reportLabels[event.new_status]||event.new_status)}`:''}</p>${event.public_note?`<div class="history-public-note"><strong>Public update</strong><p>${esc(event.public_note)}</p></div>`:''}${event.internal_note?`<div class="history-private-note"><strong>Private administrator note</strong><p>${esc(event.internal_note)}</p></div>`:''}</li>`;}).join('')}</ol>`:'<p class="notice">No history entries are available for this legacy report. No administrator actions or times have been inferred.</p>'}</section>`;
 }
 function renderReportDetail(r){
   const terminal=['resolved','rejected'].includes(r.status);
   const transitions=terminal?(r.can_reopen?['reviewing']:[]):r.allowed_transitions||reportTransitions[r.status]||[];
   const latestPublic=r.public_note||[...(r.history||[])].reverse().find(event=>event.public_note&&!['submitted','legacy_submission'].includes(event.event_type))?.public_note;
   const photoUrl=typeof r.photo_url==='string'&&/^(?:evidence\.php|api\.php)\?/.test(r.photo_url)?r.photo_url:null;
   $('#adminDetailContent').innerHTML=`<div class="report-detail"><span class="eyebrow">INCIDENT REVIEW · ${esc(reference(r))}</span><h2 id="adminDetailTitle">${esc(r.incident_type)} Report</h2>${demo(r)} ${badgeStatus(r.status)}<dl><dt>Location</dt><dd>${esc(r.location)}</dd><dt>Submitted</dt><dd>${esc(fmt(r.created_at))}</dd><dt>Last activity</dt><dd>${esc(fmt(r.updated_at||r.created_at))}</dd><dt>Reporter</dt><dd>${esc(r.reporter_name||'Not provided')}</dd><dt>Contact</dt><dd>${esc(r.reporter_contact||'Not provided')}</dd><dt>Version</dt><dd>${Number(r.version)}</dd></dl><h3>Description</h3><blockquote>${esc(r.description)}</blockquote>${photoUrl?`<a class="protected-report-photo" href="${esc(photoUrl)}" target="_blank" rel="noopener noreferrer"><img class="report-photo" src="${esc(photoUrl)}" alt="Evidence submitted with ${esc(reference(r))}"><span>Open protected evidence ↗</span></a>`:''}${latestPublic?`<div class="history-public-note"><strong>Latest public response</strong><p>${esc(latestPublic)}</p></div>`:''}${r.admin_notes?`<details class="legacy-private-notes"><summary>Legacy private administrator notes</summary><p>${esc(r.admin_notes)}</p></details>`:''}${reportHistory(r)}<form class="form-stack report-review-form" id="reportReviewForm" data-id="${Number(r.id)}" data-version="${Number(r.version)||1}" data-status="${esc(r.status)}"><h3>Document an update</h3><label>Administrator action<select name="status" id="reportAction"><option value="">Save notes without changing status</option>${transitions.map(status=>`<option value="${esc(status)}" ${terminal?'data-reopen="true"':''}>${terminal?'Reopen Report':esc(reportActions[status]||reportLabels[status])}</option>`).join('')}</select></label><p class="report-action-help" id="reportActionHelp">Saving a note does not create a progress milestone.</p><label>Public response to the reporter<textarea name="public_note" rows="4" maxlength="3000" aria-describedby="reportPublicHelp" placeholder="Explain the action or next step. Do not include confidential information."></textarea></label><p class="report-privacy-hint" id="reportPublicHelp">Visible to this reporter. A rejection reason, information request, action summary, resolution summary or reopening reason is required for the corresponding action.</p><label>Private administrator note<textarea name="internal_note" rows="3" maxlength="3000" placeholder="Confidential operational details; visible only to administrators."></textarea></label><p id="reportSaveError" class="notice danger" role="alert" hidden></p><div class="editor-actions"><button class="btn btn-outline" type="button" data-close-modal>Cancel</button><button class="btn btn-blue" type="submit">Save Notes</button></div></form></div>`;
 }
 async function showReport(id){
   const request=++reportRequest;
   $('#adminDetailContent').innerHTML='<h2 id="adminDetailTitle">Loading incident report</h2><p role="status">Loading the latest details and permanent history…</p>';
   openModal('adminDetailModal');
   try{const result=await api('report_details',undefined,{id:Number(id)});if(request!==reportRequest||$('#adminDetailModal').hidden)return;renderReportDetail(result.report);}
   catch(error){if(request!==reportRequest||$('#adminDetailModal').hidden)return;$('#adminDetailContent').innerHTML=`<h2 id="adminDetailTitle">Report unavailable</h2><p role="alert">${esc(error.message)}</p><button type="button" class="btn btn-outline" data-reload-report="${Number(id)}">Try again</button>`;}
 }
 function updateReportAction(form){
   const status=form.elements.status.value;
   const reopen=['resolved','rejected'].includes(form.dataset.status)&&!!status;
   form.elements.public_note.required=reopen||['needs_info','in_progress','resolved','rejected'].includes(status);
   $('#reportActionHelp').textContent=reopen?'Reopening preserves the prior resolution and all recorded history.':status==='needs_info'?'Tell the reporter exactly what information is needed.':status==='resolved'?'Record the outcome and a public resolution summary.':status==='rejected'?'Give the reporter an appropriate reason for declining this report.':status==='in_progress'?'Describe the follow-up or action that is underway.':status?'This action records a new permanent status event and notifies the account owner.':'Saving a note does not create a progress milestone.';
   $('button[type=submit]',form).textContent=reopen?'Reopen Report':reportActions[status]||'Save Notes';
 }
 async function saveReport(form){
   updateReportAction(form);if(!form.reportValidity())return;
   const data={id:Number(form.dataset.id),version:Number(form.dataset.version),public_note:form.elements.public_note.value.trim(),internal_note:form.elements.internal_note.value.trim()};
   const status=form.elements.status.value,reopen=['resolved','rejected'].includes(form.dataset.status)&&!!status;
   if(!status&&!data.public_note&&!data.internal_note){$('#reportSaveError').textContent='Add a public response or a private note before saving.';$('#reportSaveError').hidden=false;return;}
   if(status){data.status=status;if(reopen)data.event_type='reopen';const text=reopen?'Reopen this report and record the supplied reason?':status==='resolved'?'Mark this report resolved with the supplied resolution summary?':status==='rejected'?'Reject this report with the supplied public explanation?':null;if(text&&!confirm(text))return;}
   const button=$('button[type=submit]',form);button.disabled=true;form.setAttribute('aria-busy','true');$('#reportSaveError').hidden=true;
   try{const result=await api(status?'report_status':'report_add_public_update',data);closeModal('adminDetailModal');await reload();toast(result.message||'Report update saved.');}
   catch(error){const message=$('#reportSaveError');if(message){message.hidden=false;message.textContent=error.message;if(error.status===409){const reloadButton=document.createElement('button');reloadButton.type='button';reloadButton.className='btn btn-outline';reloadButton.dataset.reloadReport=form.dataset.id;reloadButton.textContent='Load latest report';message.append(document.createElement('br'),reloadButton);}message.scrollIntoView({block:'nearest'});}toast(error.message,true);}
   finally{button.disabled=false;form.removeAttribute('aria-busy');}
 }
 function showUser(id){
   const u=(db.users||[]).find(v=>Number(v.id)===Number(id));if(!u)return;
   $('#adminDetailContent').innerHTML=`<div class="editor-heading"><span class="eyebrow">ACCESS MANAGEMENT</span><h2 id="adminDetailTitle">${esc(u.full_name)}</h2><p>${esc(u.email)}</p></div><form class="form-stack" id="userForm" data-id="${Number(id)}"><label>User Role<select name="role"><option value="resident" ${u.role==='resident'?'selected':''}>Resident</option><option value="admin" ${u.role==='admin'?'selected':''}>Administrator</option></select></label><label class="check-line"><input type="checkbox" name="is_active" ${Number(u.is_active)?'checked':''}> <span>Account active</span></label><div class="editor-actions"><button type="button" class="btn btn-outline" data-close-modal>Cancel</button><button type="submit" class="btn btn-blue">Save User Access →</button></div></form>`;
   openModal('adminDetailModal');
 }
 async function saveForm(form,action,data,modalId){
   const button=$('button[type=submit]',form);button.disabled=true;
   try{const result=await api(action,data);if(modalId)closeModal(modalId);await reload();toast(result.message||'Saved successfully.');}
   catch(e){toast(e.message,true);}finally{button.disabled=false;}
 }
 function onEvents(){
   document.addEventListener('click', async e=>{
     const side=e.target.closest('[data-section]');if(side){currentSection=side.dataset.section;renderSection();$('#sidebar').classList.remove('open');$('#sidebarToggle').setAttribute('aria-expanded','false');return;}
     const add=e.target.closest('[data-add]');if(add){showEditor(add.dataset.add);return;}
     const edit=e.target.closest('[data-edit]');if(edit){showEditor(edit.dataset.edit,Number(edit.dataset.id));return;}
     const remove=e.target.closest('[data-delete]');if(remove){const type=remove.dataset.delete,id=Number(remove.dataset.id);if(confirm(`Delete this ${displayNames[type].toLowerCase()}? This cannot be undone.`))try{const r=await api('admin_delete',{type,id});await reload();toast(r.message);}catch(er){toast(er.message,true);}return;}
     const review=e.target.closest('[data-review]');if(review){showReport(review.dataset.review);return;}
     const reloadReport=e.target.closest('[data-reload-report]');if(reloadReport){if($('#reportReviewForm')&&!confirm('Load the latest report and discard these unsaved notes?'))return;showReport(reloadReport.dataset.reloadReport);return;}
     const refreshReports=e.target.closest('[data-refresh-reports]');if(refreshReports){refreshReports.disabled=true;try{await reload();toast('Report list refreshed.');}catch(error){toast(error.message,true);refreshReports.disabled=false;}return;}
     if(e.target.closest('[data-clear-report-filters]')){Object.assign(reportFilters,{search:'',status:'',type:'',from:'',to:'',sort:'newest'});renderSection();return;}
     const user=e.target.closest('[data-user]');if(user){showUser(user.dataset.user);return;}
     const tab=e.target.closest('[data-content-tab]');if(tab){currentContent=tab.dataset.contentTab;renderSection();return;}
     if(e.target.closest('[data-close-modal]')){closeModal(e.target.closest('.modal-backdrop').id);return;}
     if(e.target.classList.contains('modal-backdrop'))closeModal(e.target.id);
   });
   document.addEventListener('input',e=>{
     if(e.target.matches('[data-table-search]')){const q=e.target.value.toLowerCase();$$('.data-table tbody tr').forEach(tr=>{tr.hidden=!tr.textContent.toLowerCase().includes(q);});}
     if(e.target.matches('[data-report-filter]')){reportFilters[e.target.dataset.reportFilter]=e.target.value;$('#reportResults').innerHTML=reportResults();}
   });
   document.addEventListener('change',e=>{if(e.target.id==='reportAction')updateReportAction(e.target.form);});
   document.addEventListener('submit',e=>{
     const form=e.target;if(form.id==='editorForm'){e.preventDefault();const data=Object.fromEntries(new FormData(form));fields[form.dataset.type].filter(f=>f[2]==='checkbox').forEach(f=>data[f[0]]=form.elements[f[0]].checked);saveForm(form,'admin_save',{type:form.dataset.type,id:Number(form.dataset.id),data},'editorModal');}
     if(form.id==='reportReviewForm'){e.preventDefault();saveReport(form);}
     if(form.id==='reportFilterForm')e.preventDefault();
     if(form.id==='userForm'){e.preventDefault();saveForm(form,'user_update',{id:Number(form.dataset.id),role:form.elements.role.value,is_active:form.elements.is_active.checked},'adminDetailModal');}
     if(form.id==='settingsForm'){e.preventDefault();saveForm(form,'settings_save',Object.fromEntries(new FormData(form)),null);}
   });
   document.addEventListener('keydown',e=>{
     if(e.key==='Escape'){$$('.modal-backdrop:not([hidden])').forEach(el=>closeModal(el.id));$('#sidebar').classList.remove('open');$('#sidebarToggle').setAttribute('aria-expanded','false');}
     if(e.key==='Tab'){
       const modal=$$('.modal-backdrop:not([hidden])').at(-1);if(!modal)return;
       const focusable=$$('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),summary,[tabindex="0"]',modal).filter(el=>el.getClientRects().length);
       if(!focusable.length)return;const first=focusable[0],last=focusable.at(-1);
       if(e.shiftKey&&(document.activeElement===first||!modal.contains(document.activeElement))){e.preventDefault();last.focus();}
       else if(!e.shiftKey&&(document.activeElement===last||!modal.contains(document.activeElement))){e.preventDefault();first.focus();}
     }
   });
   $('#sidebarToggle').addEventListener('click',()=>{const open=$('#sidebar').classList.toggle('open');$('#sidebarToggle').setAttribute('aria-expanded',String(open));});
   $('#adminLogout').addEventListener('click',async()=>{try{await api('logout',{});location.href=window.BS_PREVIEW_MODE?'preview.html':'index.php';}catch(e){toast(e.message,true);}});
 }
 async function start(){onEvents();try{await reload();}catch(e){$('#adminContent').innerHTML=`<div class="admin-note">Unable to load administrator information. Check that MySQL is running and the application has been installed.</div>`;toast(e.message,true);}}
 document.addEventListener('DOMContentLoaded',start);
})();
