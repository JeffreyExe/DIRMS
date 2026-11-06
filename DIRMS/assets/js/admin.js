(() => {
 'use strict';
 const $=(s,root=document)=>root.querySelector(s);
 const $$=(s,root=document)=>[...root.querySelectorAll(s)];
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const fmt=v=>v ? String(v).replace('T',' ').slice(0,16) : '—';
 const words=s=>s.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
 let db={},csrf='',currentSection='overview',currentContent='news';
 const displayNames={alerts:'Alert',centers:'Evacuation Center',hotlines:'Hotline',tips:'Preparedness Tip',news:'News Article'};
 const fields={
   alerts:[['title','Alert Title','text',true],['alert_type','Alert Type','select',true,['Flood','Fire','Typhoon','Earthquake','Heavy Rainfall','Strong Winds','Landslide','Other']],['severity','Severity','select',true,['low','medium','high','extreme']],['location','Affected Location','text',true],['description','Description','textarea',true],['instructions','Safety Instructions','textarea'],['expires_at','Expiry Date / Time (optional)','datetime-local'],['is_active','Visible to public','checkbox']],
   centers:[['name','Center Name','text',true],['barangay','Barangay','text',true],['address','Full Address','text',true],['capacity','Total Capacity','number',true],['occupancy','Current Occupancy','number',true],['latitude','Pin Latitude (optional; decimal GPS)','number'],['longitude','Pin Longitude (optional; decimal GPS)','number'],['notes','Notes','textarea'],['is_active','Visible to public','checkbox']],
   hotlines:[['organization','Organization','text',true],['phone','Verified Phone Number','tel',true],['description','Description','text'],['sort_order','Display Order','number'],['is_active','Visible to public','checkbox']],
   tips:[['title','Tip Title','text',true],['body','Safety Guidance','textarea',true],['icon','Icon Theme','select',true,['shield','cloud','waves','activity','briefcase','users','fire','mountain']],['sort_order','Display Order','number']],
   news:[['title','Headline','text',true],['summary','Summary','textarea',true],['source_url','Source Website (optional)','url'],['is_active','Visible to public','checkbox']]
 };
 async function api(action,body){
   if(window.BS_PREVIEW_MODE) return previewApi(action,body);
   const opts={headers:{'X-CSRF-Token':csrf}};
   if(body!==undefined){opts.method='POST';opts.headers['Content-Type']='application/json';opts.body=JSON.stringify(body);}
   const response=await fetch(`api.php?action=${encodeURIComponent(action)}`,opts);
   let result;try{result=await response.json();}catch{throw new Error('Unexpected server response.');}
   if(!response.ok||!result.ok)throw new Error(result.message||'Request failed.');
   return result;
 }
 function previewApi(action,body){
   const d=window.BS_PREVIEW_ADMIN;
   const save=()=>window.BS_SAVE_PREVIEW?.();
   const recalc=()=>{d.stats={reports:d.reports.length,residents:d.users.filter(u=>u.role==='resident'&&Number(u.is_active)).length,centers:d.centers.filter(c=>Number(c.is_active)).length,alerts:d.alerts.filter(a=>Number(a.is_active)).length,pending:d.reports.filter(r=>['pending','reviewing'].includes(r.status)).length};};
   if(action==='admin_data'){recalc();return Promise.resolve({ok:true,data:d,csrf:'preview-token'});}
   if(action==='admin_save'){
      const collection=d[body.type];const id=Number(body.id)||Math.max(0,...collection.map(r=>Number(r.id)))+1;
      const entry=collection.find(r=>Number(r.id)===id);
      const fields={...body.data,is_demo:0};
      if(entry)Object.assign(entry,fields);
      else collection.unshift({id,...fields,created_at:new Date().toISOString().slice(0,19).replace('T',' ')});
      save();return Promise.resolve({ok:true,message:'Saved in local demo data.',id});
   }
   if(action==='admin_delete'){d[body.type]=d[body.type].filter(r=>Number(r.id)!==Number(body.id));save();return Promise.resolve({ok:true,message:'Removed from local demo data.'});}
   if(action==='report_status'){const entry=d.reports.find(r=>Number(r.id)===Number(body.id));if(entry)Object.assign(entry,{status:body.status,admin_notes:body.admin_notes});save();return Promise.resolve({ok:true,message:'Demo report status updated.'});}
   if(action==='user_update'){const u=d.users.find(r=>Number(r.id)===Number(body.id));if(u)Object.assign(u,{role:body.role,is_active:body.is_active?1:0});save();return Promise.resolve({ok:true,message:'Demo user updated.'});}
   if(action==='settings_save'){d.settings={...d.settings,...body};save();return Promise.resolve({ok:true,message:'Demo settings updated.'});}
   if(action==='logout'){return Promise.resolve({ok:true,message:'Preview closed.'});}
   return Promise.reject(new Error('This action requires PHP/MySQL.'));
 }
 function toast(message,error=false){const item=document.createElement('div');item.className='toast'+(error?' error':'');item.textContent=message;$('#adminToastRegion').append(item);setTimeout(()=>item.remove(),4500);}
 function badgeStatus(status){return `<span class="status-pill status-${esc(status)}">${esc(words(status||'unknown'))}</span>`;}
 function badgeSeverity(v){return `<span class="sev-pill sev-${esc(v)}">${esc(v)}</span>`;}
 function demo(v){return Number(v.is_demo)===1?'<span class="sample-pill">DEMO</span> ':'';}
 function empty(msg='No records found.'){return `<div class="empty-state"><strong>${esc(msg)}</strong>Add a record to get started, or adjust your search.</div>`;}
 function openModal(id){$('#'+id).hidden=false;document.body.style.overflow='hidden';$('#'+id+' .modal-close')?.focus();}
 function closeModal(id){$('#'+id).hidden=true;if($$('.modal-backdrop:not([hidden])').length===0)document.body.style.overflow='';}
 async function reload(){const result=await api('admin_data');db=result.data;csrf=result.csrf;renderSection();}
 function header(title,desc,action=''){return `<div class="admin-lead"><div><h2>${esc(title)}</h2><p>${esc(desc)}</p></div>${action}</div>`;}
 function addBtn(type){return `<button type="button" class="btn btn-blue btn-sm" data-add="${type}">＋ Add ${esc(displayNames[type])}</button>`;}
 function table(columns,items,type,options={}){
   const headers=columns.map(c=>`<th>${esc(c[0])}</th>`).join('');
   const rows=items.map(r=>`<tr>${columns.map(c=>`<td title="${esc(String(r[c[2]||'']??''))}">${c[1](r)}</td>`).join('')}<td><div class="table-actions">${options.report?`<button class="icon-btn" title="Review report" data-review="${Number(r.id)}">View</button>`:options.user?`<button class="icon-btn" title="Manage user" data-user="${Number(r.id)}">Edit</button>`:`<button class="icon-btn" title="Edit" data-edit="${type}" data-id="${Number(r.id)}">✎</button><button class="icon-btn delete" title="Delete" data-delete="${type}" data-id="${Number(r.id)}">▣</button>`}</div></td></tr>`).join('');
   return `<div class="data-card"><div class="data-toolbar"><h2>${esc(options.title || displayNames[type]+' Records')}</h2><div class="toolbar-actions"><input class="toolbar-search" aria-label="Search table" placeholder="Search records..." type="search" data-table-search>${options.add===false?'':addBtn(type)}</div></div><div class="admin-table-wrap"><table class="data-table"><thead><tr>${headers}<th>Actions</th></tr></thead><tbody>${rows||`<tr><td colspan="${columns.length+1}">${empty()}</td></tr>`}</tbody></table></div><div class="table-caption">Showing ${items.length} record${items.length===1?'':'s'}. DEMO entries are sample content, not verified live information.</div></div>`;
 }
 const reportsColumns=[['Reference',r=>`<strong>#${Number(r.id)}</strong>`],['Incident',r=>`${demo(r)}<strong>${esc(r.incident_type)}</strong>`],['Location',r=>esc(r.location)],['Reported',r=>`<span class="table-muted">${esc(fmt(r.created_at))}</span>`],['Status',r=>badgeStatus(r.status)]];
 const alertColumns=[['Title',r=>`${demo(r)}<strong>${esc(r.title)}</strong>`],['Type',r=>esc(r.alert_type)],['Severity',r=>badgeSeverity(r.severity)],['Location',r=>esc(r.location)],['Published',r=>`<span class="table-muted">${esc(fmt(r.created_at))}</span>`],['Visible',r=>Number(r.is_active)?'Yes':'No']];
 const centerColumns=[['Center',r=>`${demo(r)}<strong>${esc(r.name)}</strong>`],['Barangay',r=>esc(r.barangay)],['Capacity',r=>Number(r.capacity).toLocaleString()],['Occupancy',r=>Number(r.occupancy).toLocaleString()],['Status',r=>Number(r.capacity)<=0?badgeStatus('pending'):Number(r.occupancy)>=Number(r.capacity)?'<span class="sev-pill sev-high">Full</span>':'<span class="sev-pill sev-low">Available</span>'],['Visible',r=>Number(r.is_active)?'Yes':'No']];
 const hotlineColumns=[['Organization',r=>`${demo(r)}<strong>${esc(r.organization)}</strong>`],['Phone',r=>esc(r.phone)],['Description',r=>esc(r.description)],['Visible',r=>Number(r.is_active)?'Yes':'No']];
 const newsColumns=[['Headline',r=>`${demo(r)}<strong>${esc(r.title)}</strong>`],['Summary',r=>esc(r.summary).slice(0,130)],['Date',r=>esc(fmt(r.created_at))],['Visible',r=>Number(r.is_active)?'Yes':'No']];
 const tipsColumns=[['Title',r=>`<strong>${esc(r.title)}</strong>`],['Guidance',r=>esc(r.body).slice(0,110)],['Order',r=>Number(r.sort_order)]];
 const userColumns=[['Name',r=>`<strong>${esc(r.full_name)}</strong>`],['Email',r=>esc(r.email)],['Phone',r=>esc(r.phone||'—')],['Role',r=>`<span class="sev-pill ${r.role==='admin'?'sev-high':'sev-low'}">${esc(r.role)}</span>`],['Status',r=>Number(r.is_active)?'<span class="sev-pill sev-low">Active</span>':'<span class="sev-pill sev-high">Disabled</span>'],['Joined',r=>esc(fmt(r.created_at))]];
 function overview(){const s=db.stats||{};return `${header('Community Overview','A snapshot of alerts, residents, evacuation resources, and incoming incident reports.',`<a class="btn btn-outline btn-sm" href="index.php" target="_blank" rel="noopener noreferrer">View Public Website ↗</a>`)}<div class="admin-note">This project includes clearly marked demonstration records. Replace sample entries with verified information before community use.</div><div class="stat-grid"><div class="stat-card red"><div><strong>${s.reports||0}</strong><span>Total Incident Reports</span></div><span class="stat-icon">▤</span></div><div class="stat-card blue"><div><strong>${s.residents||0}</strong><span>Active Residents</span></div><span class="stat-icon">♟</span></div><div class="stat-card green"><div><strong>${s.centers||0}</strong><span>Active Centers</span></div><span class="stat-icon">⌂</span></div><div class="stat-card orange"><div><strong>${s.alerts||0}</strong><span>Active Alerts</span></div><span class="stat-icon">♧</span></div></div><div class="admin-grid2"><div class="dashboard-card"><div class="section-head"><h2>Recent Incident Reports</h2><button type="button" data-section="reports" class="btn btn-outline btn-sm">View all →</button></div><div class="admin-table-wrap"><table class="data-table"><thead><tr><th>Incident</th><th>Location</th><th>Status</th><th>Actions</th></tr></thead><tbody>${(db.reports||[]).slice(0,6).map(r=>`<tr><td>${demo(r)}<strong>${esc(r.incident_type)}</strong></td><td>${esc(r.location)}</td><td>${badgeStatus(r.status)}</td><td><button type="button" class="icon-btn" data-review="${r.id}">View</button></td></tr>`).join('')||'<tr><td colspan="4">No reported incidents yet.</td></tr>'}</tbody></table></div></div><div class="dashboard-card"><div class="section-head"><h2>Recent Alerts</h2><button type="button" data-section="alerts" class="btn btn-outline btn-sm">Manage →</button></div><div class="admin-table-wrap"><table class="data-table"><thead><tr><th>Alert</th><th>Severity</th><th>Actions</th></tr></thead><tbody>${(db.alerts||[]).slice(0,6).map(a=>`<tr><td>${demo(a)}${esc(a.title)}</td><td>${badgeSeverity(a.severity)}</td><td><button type="button" class="icon-btn" data-edit="alerts" data-id="${a.id}">✎</button></td></tr>`).join('')||'<tr><td colspan="3">No alerts published yet.</td></tr>'}</tbody></table></div></div></div>`;}
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
     case 'reports':html=header('Incident Reports','Review evidence and track incoming incident cases through resolution.')+table(reportsColumns,db.reports||[],'reports',{title:'Submitted Incident Reports',report:true,add:false});break;
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
     let value=item[key]??(key==='is_active'?1:key==='severity'?'medium':key==='icon'?'shield':key==='sort_order'||key==='capacity'||key==='occupancy'?0:'');
     if(key==='expires_at' && value)value=String(value).slice(0,16).replace(' ','T');
     const req=required?'required':'';
     if(inputType==='checkbox')return `<label class="check-line"><input name="${key}" type="checkbox" ${Number(value)?'checked':''}><span>${esc(label)}</span></label>`;
     if(inputType==='textarea')return `<label>${esc(label)}<textarea name="${key}" ${req} maxlength="5000">${esc(value)}</textarea></label>`;
     if(inputType==='select')return `<label>${esc(label)}<select name="${key}" ${req}>${options.map(option=>`<option value="${esc(option)}" ${String(value)===option?'selected':''}>${esc(words(option))}</option>`).join('')}</select></label>`;
     return `<label>${esc(label)}<input name="${key}" type="${inputType}" value="${esc(value)}" ${req} ${inputType==='number' ? (key==='latitude'||key==='longitude'?'step="any"':'step="1"') : ''}></label>`;
   }).join('')+`<div class="editor-actions"><button type="button" class="btn btn-outline" data-close-modal>Cancel</button><button class="btn btn-blue" type="submit">Save ${esc(displayNames[type])} →</button></div>`;
   openModal('editorModal');
 }
 function showReport(id){
   const r=(db.reports||[]).find(r=>Number(r.id)===Number(id));if(!r)return;
   const statusOptions=['pending','reviewing','resolved','rejected'];
   const content=`<div class="report-detail"><span class="eyebrow">INCIDENT REVIEW · REFERENCE #${Number(r.id)}</span><h2 id="adminDetailTitle">${esc(r.incident_type)} Report</h2>${demo(r)} ${badgeStatus(r.status)}<dl><dt>Location</dt><dd>${esc(r.location)}</dd><dt>Submitted</dt><dd>${esc(fmt(r.created_at))}</dd><dt>Reporter</dt><dd>${esc(r.reporter_name||'Anonymous')}</dd><dt>Contact</dt><dd>${esc(r.reporter_contact||'Not provided')}</dd></dl><strong>Description</strong><blockquote>${esc(r.description)}</blockquote>${r.photo_path&&/^uploads\/[a-f0-9]{32}\.(jpg|png|webp)$/.test(r.photo_path)?`<a href="${esc(r.photo_path)}" target="_blank" rel="noopener noreferrer"><img class="report-photo" src="${esc(r.photo_path)}" alt="Photo submitted with incident report"></a>`:''}<form class="form-stack" id="reportReviewForm" data-id="${Number(id)}"><label>Report Status<select name="status">${statusOptions.map(v=>`<option value="${v}" ${r.status===v?'selected':''}>${esc(words(v))}</option>`).join('')}</select></label><label>Administrator Notes<textarea name="admin_notes" rows="4" placeholder="Review notes, response, or follow-up...">${esc(r.admin_notes||'')}</textarea></label><div class="editor-actions"><button class="btn btn-outline" type="button" data-close-modal>Cancel</button><button class="btn btn-blue" type="submit">Save Review →</button></div></form></div>`;
   $('#adminDetailContent').innerHTML=content;openModal('adminDetailModal');
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
     const side=e.target.closest('[data-section]');if(side){currentSection=side.dataset.section;renderSection();$('#sidebar').classList.remove('open');return;}
     const add=e.target.closest('[data-add]');if(add){showEditor(add.dataset.add);return;}
     const edit=e.target.closest('[data-edit]');if(edit){showEditor(edit.dataset.edit,Number(edit.dataset.id));return;}
     const remove=e.target.closest('[data-delete]');if(remove){const type=remove.dataset.delete,id=Number(remove.dataset.id);if(confirm(`Delete this ${displayNames[type].toLowerCase()}? This cannot be undone.`))try{const r=await api('admin_delete',{type,id});await reload();toast(r.message);}catch(er){toast(er.message,true);}return;}
     const review=e.target.closest('[data-review]');if(review){showReport(review.dataset.review);return;}
     const user=e.target.closest('[data-user]');if(user){showUser(user.dataset.user);return;}
     const tab=e.target.closest('[data-content-tab]');if(tab){currentContent=tab.dataset.contentTab;renderSection();return;}
     if(e.target.closest('[data-close-modal]')){closeModal(e.target.closest('.modal-backdrop').id);return;}
     if(e.target.classList.contains('modal-backdrop'))closeModal(e.target.id);
   });
   document.addEventListener('input',e=>{
     if(e.target.matches('[data-table-search]')){const q=e.target.value.toLowerCase();$$('.data-table tbody tr').forEach(tr=>{tr.hidden=!tr.textContent.toLowerCase().includes(q);});}
   });
   document.addEventListener('submit',e=>{
     const form=e.target;if(form.id==='editorForm'){e.preventDefault();const data=Object.fromEntries(new FormData(form));fields[form.dataset.type].filter(f=>f[2]==='checkbox').forEach(f=>data[f[0]]=form.elements[f[0]].checked);saveForm(form,'admin_save',{type:form.dataset.type,id:Number(form.dataset.id),data},'editorModal');}
     if(form.id==='reportReviewForm'){e.preventDefault();saveForm(form,'report_status',{id:Number(form.dataset.id),...Object.fromEntries(new FormData(form))},'adminDetailModal');}
     if(form.id==='userForm'){e.preventDefault();saveForm(form,'user_update',{id:Number(form.dataset.id),role:form.elements.role.value,is_active:form.elements.is_active.checked},'adminDetailModal');}
     if(form.id==='settingsForm'){e.preventDefault();saveForm(form,'settings_save',Object.fromEntries(new FormData(form)),null);}
   });
   document.addEventListener('keydown',e=>{if(e.key==='Escape')$$('.modal-backdrop:not([hidden])').forEach(el=>closeModal(el.id));});
   $('#sidebarToggle').addEventListener('click',()=>$('#sidebar').classList.toggle('open'));
   $('#adminLogout').addEventListener('click',async()=>{try{await api('logout',{});location.href=window.BS_PREVIEW_MODE?'preview.html':'index.php';}catch(e){toast(e.message,true);}});
 }
 async function start(){onEvents();try{await reload();}catch(e){$('#adminContent').innerHTML=`<div class="admin-note">Unable to load administrator information. Check that MySQL is running and the application has been installed.</div>`;toast(e.message,true);}}
 document.addEventListener('DOMContentLoaded',start);
})();
