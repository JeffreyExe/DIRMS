(() => {
  'use strict';
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const state = {data: {alerts: [], centers: [], hotlines: [], tips: [], news: [], settings: {}}, user: null, csrf: '', alertPage: 1, alertSeverity: 'all', centerExpanded: false};
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const text = value => String(value ?? '');
  const dateString = value => { if (!value) return 'Not recorded'; let raw=String(value).replace(' ', 'T');if(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(raw))raw+='Z';const d = new Date(raw); return Number.isNaN(+d) ? 'Not recorded' : d.toLocaleString('en-PH', {timeZone:'Asia/Manila',month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'}); };
  const trackerEnabled = () => window.DIRMS_TRACKER_ENABLED || document.body.dataset.tracking === 'true' || !!$('#reportTracker');
  const statusLabel = status => ({pending:'Report Submitted',received:'Received by Admin',reviewing:'Under Review',in_progress:'Action in Progress',resolved:'Resolved',rejected:'Rejected',needs_info:'Additional Information Required'}[status] || 'Status unavailable');
  const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const pageTarget = php => window.BS_PREVIEW_MODE ? (php === 'index.php' ? 'preview.html' : php === 'admin.php' ? 'admin-preview.html' : 'preview-' + php.replace(/\.php$/, '.html')) : php;
  const iconOf = type => ({Flood:'♒',Fire:'♨','Strong Winds':'≋','Heavy Rainfall':'☁',Typhoon:'◉',Landslide:'▲',Earthquake:'⌁','Road Block':'⚑'}[type] || '⚠');
  const isDemo = item => Number(item.is_demo) === 1;
  const badge = item => isDemo(item) ? '<span class="sample-pill">DEMO</span>' : '';
  const toast = (message, isError = false) => {const t = document.createElement('div'); t.className = 'toast' + (isError ? ' error' : ''); t.textContent = message; $('#toastRegion')?.append(t); setTimeout(() => t.remove(), isError ? 8000 : 4800);};
  async function api(action, body = null, query = {}) {
    if (window.BS_PREVIEW_MODE) return previewApi(action, body);
    const opts = body ? {method:'POST', body: body instanceof FormData ? body : JSON.stringify(body), headers: {'X-CSRF-Token':state.csrf, ...(body instanceof FormData ? {} : {'Content-Type':'application/json'})}} : {};
    const response = await fetch(`api.php?${new URLSearchParams({action,...query})}`, {...opts,cache:'no-store',credentials:'same-origin'});
    let result;
    try { result = await response.json(); } catch { throw new Error('Server returned an unexpected response.'); }
    if (!response.ok || !result.ok) {const error=new Error(result.message || 'Request failed.');error.status=response.status;throw error;}
    return result;
  }
  function previewApi(action, body) {
    const raw = window.BS_PREVIEW_DATA;
    if (action === 'bootstrap') { try{state.user=JSON.parse(window.sessionStorage?.getItem('bs_preview_user') || 'null');}catch{} return Promise.resolve({ok:true,data:raw,user:state.user,csrf:'preview-token'}); }
    if (action === 'alerts') {
      // Read latest saved preview changes, including changes made in the admin preview tab.
      let saved = window.BS_PREVIEW_ADMIN;
      try { const stored = localStorage.getItem('bs_preview_admin_v3'); if (stored) saved = JSON.parse(stored); } catch {}
      const now = Date.now();
      const alerts = (saved?.alerts || []).filter(a => Number(a.is_active) === 1 && (!a.expires_at || Date.parse(String(a.expires_at).replace(' ', 'T')) >= now));
      return Promise.resolve({ok:true,alerts});
    }
    if (action === 'login' || action === 'register') {
      state.user = {id:42,full_name: body.full_name || 'Demo Resident', email: body.email,phone:'',role:'resident'};
      if (action === 'register') {const d=window.BS_PREVIEW_ADMIN;d.users.push({...state.user,created_at:new Date().toISOString().slice(0,19).replace('T',' '),is_active:1});window.BS_SAVE_PREVIEW?.();}
      return Promise.resolve({ok:true,user:state.user,message:'Signed in for this interactive preview.'});
    }
    if (action === 'logout') {state.user=null;window.sessionStorage?.removeItem('bs_preview_user');return Promise.resolve({ok:true,message:'Signed out of preview account.'});}
    if (action === 'report') {const d=window.BS_PREVIEW_ADMIN, id=Math.max(100,...d.reports.map(r=>Number(r.id)))+1;d.reports.unshift({id,reference:'DEMO-'+String(id).padStart(6,'0'),incident_type:body.get('incident_type'),location:body.get('location'),description:body.get('description'),reporter_name:body.get('reporter_name'),reporter_contact:body.get('reporter_contact'),user_id:state.user?.id||null,status:'pending',admin_notes:'',photo_path:null,is_demo:1,created_at:new Date().toISOString()});window.BS_SAVE_PREVIEW?.();return Promise.resolve({ok:true,message:'Preview report #'+id+' saved in this browser (not sent to a server).',id,report_id:id,reference:'DEMO-'+String(id).padStart(6,'0')});}
    if (action === 'my_reports') return Promise.resolve({ok:true,reports:window.BS_PREVIEW_ADMIN.reports.filter(r=>Number(r.user_id)===Number(state.user?.id))});
    return Promise.reject(new Error('This action requires the PHP/MySQL website.'));
  }
  function renderAlerts() {
    const alertsPage = $('#alertList');
    const latestPanel = $('#latestAlert');
    if (!alertsPage && !latestPanel) return;
    if (alertsPage) {
      const query = ($('#alertSearch')?.value || '').trim().toLowerCase();
      const category = $('#alertCategory')?.value || '';
      const matching = state.data.alerts.filter(a => (!a.expires_at || Date.parse(String(a.expires_at).replace(' ', 'T')) > Date.now()) && (state.alertSeverity === 'all' || a.severity === state.alertSeverity) && (!category || a.alert_type === category) && [a.title,a.alert_type,a.location,a.description].join(' ').toLowerCase().includes(query));
      const perPage = 6, totalPages = Math.ceil(matching.length / perPage);
      if ($('#alertFeedStatus')) $('#alertFeedStatus').textContent = `${matching.length} matching alert${matching.length===1?'':'s'} · ${state.data.alerts.length} published`;
      state.alertPage = Math.min(Math.max(1,state.alertPage),Math.max(1,totalPages));
      alertsPage.innerHTML = matching.length ? matching.slice((state.alertPage - 1) * perPage,state.alertPage * perPage).map(a => `
        <article class="alert-card" data-severity="${escape(a.severity)}"><div class="alert-bar" aria-hidden="true">${iconOf(a.alert_type)}</div><div class="alert-body"><h3>${escape(a.title)}</h3><small>${dateString(a.created_at)}</small>${badge(a)}<span class="sev-pill sev-${escape(a.severity)}">${escape(a.severity)}</span><p>${escape(text(a.description).slice(0,195))}${text(a.description).length>195?'…':''}</p><button type="button" class="read-more" data-alert-id="${Number(a.id)}">Read more →</button></div></article>`).join('') : empty('No matching alerts','Try another search, category or severity filter.');
      $('#alertPagination').innerHTML = totalPages > 1 ? Array.from({length:totalPages},(_,i)=>`<button type="button" class="page-btn ${state.alertPage===i+1?'current':''}" data-alert-page="${i+1}" aria-label="Alert page ${i+1}">${i+1}</button>`).join('') : '';
    }
    if (latestPanel) {
      const latest = state.data.alerts.find(a => !a.expires_at || Date.parse(String(a.expires_at).replace(' ', 'T')) > Date.now());
      latestPanel.innerHTML = latest ? `<div class="featured-alert"><span class="featured-symbol">⚠</span><div class="featured-info"><h3>${escape(latest.title)}</h3><p>${escape(text(latest.description).slice(0,90))}${text(latest.description).length>90?'…':''}</p>${badge(latest)} <small>${dateString(latest.created_at)}</small></div><button type="button" class="btn btn-danger btn-sm" data-alert-id="${Number(latest.id)}">Read more</button></div>` : empty('No current alerts','Check official sources for current community updates.');
    }
  }
  async function loadLatestAlerts(showFeedback=false) {
    const button = $('#refreshAlerts');
    if (button) {button.disabled = true; button.textContent = '↻ Updating…';}
    try {
      const result = await api('alerts');
      state.data.alerts = result.alerts;
      state.alertPage = 1;
      updateCategories();
      renderAlerts();
      if (showFeedback) toast('Disaster alerts updated.');
    } catch (error) {if ($('#alertFeedStatus')) $('#alertFeedStatus').textContent = 'Refresh failed. Previously loaded alerts may be out of date.';toast('Could not refresh alerts: ' + error.message, true);}
    finally {if(button){button.disabled = false; button.textContent = '↻ Refresh';}}
  }
  function showReceipt(result) {
    const receipt = $('#reportReceipt');
    if (!receipt) return;
    const reference = result.reference || 'Reference unavailable — contact the administrator';
    $('#receiptTitle').textContent = window.BS_PREVIEW_MODE ? 'Demo incident report saved' : 'Incident report submitted successfully';
    $('#receiptId').textContent = reference;
    $('#receiptText').textContent = window.BS_PREVIEW_MODE
      ? 'Saved in this browser for testing. No report was sent to emergency responders.'
      : state.user ? 'Your report is saved with Pending status. You can return to My Reports to check its review status.'
        : 'Your report is saved as Report Submitted and is waiting for administrative acknowledgment. Save the private tracking receipt below.';
    $('#receiptMyReports').hidden = !state.user;
    const reportsButton = $('#receiptMyReports');
    if (reportsButton) reportsButton.dataset.reportId = String(result.report_id || result.id || '');
    $('#guestTrackingReceipt')?.remove();
    if (!state.user && !window.BS_PREVIEW_MODE && result.tracking_code) {
      const privateReceipt = document.createElement('div');
      privateReceipt.id = 'guestTrackingReceipt';
      privateReceipt.className = 'guest-tracking-receipt';
      privateReceipt.innerHTML = '<strong>Private tracking code</strong><code class="tracking-code"></code><p>Keep this code private. The reference alone cannot open your report. Save this receipt now; the code is shown only with this submission receipt.</p><div class="receipt-actions"><button type="button" class="btn btn-outline" data-copy-tracking>Copy private receipt</button><button type="button" class="btn btn-outline" data-save-tracking>Save receipt</button><a href="track-report.php" class="btn btn-blue">Track my report →</a></div>';
      $('.tracking-code', privateReceipt).textContent = result.tracking_code;
      const receiptText = `DIRMS private incident tracking receipt\nReference: ${reference}\nPrivate tracking code: ${result.tracking_code}\n\nKeep this code private. Open Track My Report and enter both values.\nThis report is awaiting administrative acknowledgment. Online submission is not an emergency dispatch request.`;
      $('[data-copy-tracking]', privateReceipt).addEventListener('click', async () => {
        try { await navigator.clipboard.writeText(receiptText); toast('Private receipt copied. Keep it secure.'); }
        catch { toast('Copy is unavailable. Select and save the reference and private code shown above.', true); }
      });
      $('[data-save-tracking]', privateReceipt).addEventListener('click', () => {
        const url = URL.createObjectURL(new Blob([receiptText], {type:'text/plain;charset=utf-8'}));
        const download = document.createElement('a'); download.href = url; download.download = `${reference}-private-receipt.txt`; download.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      });
      $('.receipt-reference', receipt)?.after(privateReceipt);
    }
    receipt.hidden = false;
    receipt.scrollIntoView({behavior:reduceMotion()?'auto':'smooth',block:'nearest'});
  }
  function centerHasCoordinates(center) {
    const valid = v => v !== null && v !== undefined && String(v).trim() !== '';
    if (!valid(center.latitude) || !valid(center.longitude)) return false;
    const lat = Number(center.latitude), lng = Number(center.longitude);
    return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
  }
  function centerMapQuery(center) {
    return centerHasCoordinates(center)
      ? `${Number(center.latitude)},${Number(center.longitude)}`
      : [center.name,center.address || [center.barangay,'San Pablo City, Laguna'].filter(Boolean).join(', ')].filter(Boolean).join(', ');
  }
  function mapUrl(center) {
    // Google Maps q= creates a pin; z=18 requests close zoom on the target.
    return `https://www.google.com/maps?q=${encodeURIComponent(centerMapQuery(center))}&z=18`;
  }
  function mapEmbedUrl(center) {
    // No Google API key required for the basic Google Maps place-search iframe.
    return `https://maps.google.com/maps?q=${encodeURIComponent(centerMapQuery(center))}&z=17&output=embed`;
  }
  const pinSvg = '<svg viewBox="0 0 30 40" aria-hidden="true"><path fill="#d72938" stroke="white" stroke-width="2" d="M15 1C7 1 1 7 1 15c0 11 14 24 14 24s14-13 14-24C29 7 23 1 15 1Z"/><circle cx="15" cy="15" r="5" fill="white"/></svg>';
  function renderCenters() {
    if (!$('#centerList')) return;
    const query = ($('#centerSearch')?.value || '').trim().toLowerCase();
    const matching = state.data.centers.filter(c => [c.name,c.barangay,c.address].join(' ').toLowerCase().includes(query));
    const selected = state.centerExpanded || query ? matching : matching.slice(0,3);
    $('#centerList').innerHTML = selected.length ? selected.map(c => {
      const cap = Number(c.capacity), occ = Number(c.occupancy), demoRecord = isDemo(c);
      const status = cap <= 0 ? 'unknown' : (occ >= cap ? 'full' : 'available');
      const verified = c.verification_status === 'verified' && !demoRecord;
      const hasGPS = centerHasCoordinates(c);
      const mapLabel = hasGPS ? 'View supplied GPS pin' : 'Approximate address search';
      const verify = hasGPS ? 'SUPPLIED COORDINATES · CONFIRM LOCATION' : 'APPROXIMATE ADDRESS SEARCH · NO GPS';
      return `<article class="center-card">
        <div class="map-thumbnail map-click"><iframe title="Map preview for ${escape(c.name)}" loading="lazy" tabindex="-1" aria-hidden="true" referrerpolicy="no-referrer-when-downgrade" src="${escape(mapEmbedUrl(c))}"></iframe>
          ${hasGPS ? `<span class="map-pin-icon">${pinSvg}</span>` : '<span class="map-search-icon" aria-hidden="true">?</span>'}<span class="preview-map-label">🔎 ${mapLabel} ↗</span>
          <button class="map-preview-button" type="button" data-center-map="${Number(c.id)}" aria-label="View map preview for ${escape(c.name)}"></button></div>
        <div class="center-info"><h3>${escape(c.name)}</h3><p>${escape(c.address)}</p><small class="map-verify ${hasGPS?'exact':''}">${verify}</small>
          <div class="capacity">${demoRecord?'Demo':'Reported'} capacity: <strong>${cap ? cap.toLocaleString() : 'Not supplied'}</strong> &nbsp; Occupancy: <strong>${Number.isFinite(occ) ? occ.toLocaleString() : 'Not supplied'}</strong></div>
          <small class="center-updated">Last update: ${c.updated_at ? escape(dateString(c.updated_at)) : 'Not recorded'}</small>
          ${c.notes ? `<p class="center-notes">${escape(c.notes)}</p>` : ''}
          <div class="center-bottom"><span class="availability ${demoRecord?'demo':verified?status:'unknown'}">${demoRecord?'DEMO · NOT A VERIFIED OPEN SHELTER':!Number(c.is_active)?'INACTIVE':!verified?'LISTED · AVAILABILITY UNVERIFIED':status==='unknown'?'AVAILABILITY NOT RECORDED':status==='full'?'REPORTED FULL':'REPORTED SPACE AVAILABLE'}</span>
            <a href="${escape(mapUrl(c))}" class="btn btn-blue btn-sm" target="_blank" rel="noopener noreferrer" aria-label="${hasGPS?'Open supplied coordinates':'Search approximate address'} for ${escape(c.name)} in Google Maps">${hasGPS?'View map':'Search address'} ↗</a>
            <a href="https://www.google.com/maps/dir/?api=1&amp;destination=${encodeURIComponent(centerMapQuery(c))}" class="btn btn-outline btn-sm" target="_blank" rel="noopener noreferrer">Directions${hasGPS?'':' (approximate)'} ↗</a></div>${badge(c)}</div></article>`;
    }).join('') : empty('No evacuation centers found','Try searching another barangay.');
    const b = $('#showAllCenters'); if (b) { b.hidden = matching.length<=3; b.textContent = state.centerExpanded ? 'Show fewer centers ↑' : `View all ${matching.length} evacuation centers →`; }
  }
  function openCenterMap(id) {
    const center=state.data.centers.find(v=>Number(v.id)===Number(id));
    if (!center) return;
    const coords=centerHasCoordinates(center);
    $('#centerMapTitle').textContent=center.name;
    $('#centerMapAddress').textContent=center.address||center.barangay||'Address not supplied';
    const accuracy=$('#centerMapAccuracy');
    accuracy.classList.toggle('exact',coords);
    accuracy.textContent=coords
      ? `Supplied GPS coordinates: ${Number(center.latitude).toFixed(6)}, ${Number(center.longitude).toFixed(6)}. Coordinates alone do not verify the location or opening status. Confirm both with local officials before traveling.`
      : 'Address-search map (approximate). This record has no verified GPS coordinates. Ask the local disaster office to confirm the exact location before traveling.';
    if (isDemo(center)) accuracy.textContent += ' This center is a DEMO record, not a verified active shelter.';
    const frame=$('#centerMapFrame');frame.replaceChildren();
    const iframe=document.createElement('iframe');
    iframe.title='Interactive Google Map showing '+center.name;
    iframe.src=mapEmbedUrl(center);
    iframe.loading='eager'; iframe.referrerPolicy='no-referrer-when-downgrade';
    iframe.allowFullscreen=true;
    frame.append(iframe);
    $('#centerMapOpenGoogle').href=mapUrl(center);
    openModal('centerMapModal');
  }
  function renderHotlines() {
    if (!$('#hotlineList')) return;
    const icons = textValue => {
      const v=String(textValue||'').toLowerCase();
      if (/red cross|medical|health|ambulance/.test(v)) return '✚';
      if (/fire/.test(v)) return '♨';
      if (/police|pnp/.test(v)) return '♙';
      if (/weather|pagasa/.test(v)) return '☁';
      if (/phivolcs|earthquake/.test(v)) return '⌁';
      if (/disaster|cdrrmo|ndrrmc|pdr(r|r)mo/.test(v)) return '⚠';
      return '☎';
    };
    const query = ($('#hotlineSearch')?.value || '').trim().toLowerCase();
    const matching = state.data.hotlines.filter(h => [h.organization,h.phone,h.description].join(' ').toLowerCase().includes(query));
    $('#hotlineList').innerHTML = matching.length ? matching.map(h => {
      const phone=String(h.phone||'');
      const dial=phone.replace(/[^+\d]/g,'');
      const source = h.source_url && /^https?:\/\//i.test(h.source_url) ? `<a href="${escape(h.source_url)}" target="_blank" rel="noopener noreferrer">Agency source ↗</a>` : 'Source not recorded';
      return `<div class="hotline-item"><span class="hotline-icon" aria-hidden="true">${icons(h.organization)}</span><div><strong>${escape(h.organization)}</strong><small>${escape(h.description || 'Emergency and community assistance')} ${badge(h)}</small><small class="directory-source">${source} · ${h.verified_at ? 'Verification recorded '+escape(dateString(h.verified_at)) : 'Confirm current number with the agency'}</small></div><div><a class="call-number" href="tel:${escape(dial)}" aria-label="Call ${escape(h.organization)} at ${escape(phone)}">${escape(phone)}</a><span class="call-caption">Tap to call ☎</span></div></div>`;
    }).join('') : empty('No matching emergency contacts','Try another search. For immediate emergencies in the Philippines, call 911.');
  }
  function renderTips() {
    if (!$('#tipsList')) return;
    const metadata={
      cloud:{icon:'🌀',sub:'Before a typhoon or severe storm',steps:['Monitor official PAGASA and local CDRRMO updates.','Secure light outdoor items, check roofs and windows, and charge devices.','Evacuate early when authorities instruct you to do so.']},
      waves:{icon:'🌊',sub:'Flood and heavy rainfall safety',steps:['Never walk, swim or drive through floodwater.','Move to higher ground and avoid canals or fast-moving water.','Turn off electrical power only if you can do so safely.']},
      activity:{icon:'🏠',sub:'During and after an earthquake',steps:['DROP, COVER and HOLD ON while shaking continues.','Stay away from windows, falling debris and damaged structures.','After shaking stops, evacuate carefully and expect aftershocks.']},
      briefcase:{icon:'🎒',sub:'Essentials ready before evacuation',steps:['Pack water, ready-to-eat food, medicines and first aid.','Bring a flashlight, radio, power bank, whistle, IDs and cash.','Include supplies for children, older adults, persons with disabilities and pets.']},
      users:{icon:'👨‍👩‍👧',sub:'Plan together with family',steps:['Choose a meeting place and out-of-area contact person.','Practice evacuation routes and share contact numbers.','Prepare for household members who need extra assistance.']},
      fire:{icon:'🔥',sub:'Fire prevention and safe escape',steps:['Know at least two exits from your home.','If there is smoke, stay low while leaving; never return for belongings.','Call 911 from a safe location and follow firefighters’ instructions.']},
      mountain:{icon:'⛰️',sub:'Landslide and hillside hazards',steps:['Watch for new cracks, falling rocks or tilting trees after heavy rain.','Move away from steep slopes and river channels when warned.','Follow local evacuation orders and avoid unstable ground.']},
      shield:{icon:'🛡️',sub:'Follow verified public safety guidance',steps:['Use verified official agency updates, not unconfirmed social posts.','Check for hazards before returning home.','Report damaged utilities and avoid downed wires.']}
    };
    const query = ($('#tipSearch')?.value || '').trim().toLowerCase();
    const expanded = new Set($$('#tipsList .tip-trigger[aria-expanded="true"]').map(el => el.dataset.tip));
    const matching = state.data.tips.filter(t => [t.title,t.body].join(' ').toLowerCase().includes(query));
    $('#tipsList').innerHTML=matching.length ? matching.map((t,i)=>{
      const info=metadata[t.icon]||metadata.shield;
      const steps=info.steps.map(step=>`<li>${escape(step)}</li>`).join('');
      const key = String(t.id || i), open = expanded.has(key);
      return `<div class="tip-item${open?' open':''}"><button type="button" class="tip-trigger" data-tip="${escape(key)}" aria-expanded="${open}" aria-controls="tip-body-${i}"><span class="tip-icon" aria-hidden="true">${info.icon}</span><span class="tip-title">${escape(t.title)}<small class="tip-subtitle">${escape(info.sub)}</small></span><span class="chev" aria-hidden="true">›</span></button><div id="tip-body-${i}" class="tip-body"${open?'':' hidden'}><p>${escape(t.body||'')}</p><ol class="tip-steps">${steps}</ol></div></div>`;
    }).join('') : empty('No matching preparedness tips','Try another search or check with your local disaster office.');
  }
  function renderNews() {
    if (!$('#newsList')) return;
    $('#newsList').innerHTML = state.data.news.length ? state.data.news.map(n => `<article class="news-card"><span class="news-category">${badge(n)} COMMUNITY NEWS · ${dateString(n.created_at).split(',')[0]}</span><h3>${escape(n.title)}</h3><p>${escape(text(n.summary).slice(0,180))}${text(n.summary).length>180?'…':''}</p>${n.source_url && /^https?:\/\//i.test(n.source_url) ? `<a class="read-more" href="${escape(n.source_url)}" target="_blank" rel="noopener noreferrer">Read source ↗</a>` : ''}</article>`).join('') : empty('No news published','Updates will appear here when added by an administrator.');
  }
  function renderSettings() {
    const settings=state.data.settings || {};
    if ($('#safetyText')) $('#safetyText').textContent = settings.safety_banner || 'Community disaster information may be incomplete. Verify with official sources.';
    if ($('#heroCity')) $('#heroCity').textContent = (settings.city || 'San Pablo City, Laguna').replace(/[.\s]+$/, '') + '.';
    if ($('#footerEmail')) $('#footerEmail').textContent = settings.contact_email || '';
    const view = document.body.dataset.view || 'home';
    const labels = {home:'Home',alerts:'Disaster Alerts',report:'Report Incident',centers:'Evacuation Centers',hotlines:'Emergency Hotlines',tips:'Preparedness Tips',news:'Disaster News',login:'Login',register:'Register','my-reports':'My Reports'};
    document.title = `${labels[view] || 'Home'} | DIRMS`;
  }
  function renderUser() {
    const isAdmin = state.user?.role === 'admin';
    if ($('#adminNav')) $('#adminNav').hidden = !isAdmin;
    if ($('#myReportsNav')) $('#myReportsNav').hidden = !state.user;
    if ($('#accountButton')) {
      $('#accountButton').hidden=!!state.user;
      $('#accountButton').href=pageTarget('login.php');
    }
    if ($('#navLogout')) $('#navLogout').hidden=!state.user;
    const report=$('#incidentForm');
    if (state.user && report) {
      if (!report.elements.reporter_name.value) report.elements.reporter_name.value=state.user.full_name;
      if (!report.elements.reporter_contact.value) report.elements.reporter_contact.value=state.user.phone || '';
    }
    if ($('#myReportsNotice') && !state.user && !trackerEnabled()) {
      $('#myReportsNotice').innerHTML=`<p class="notice-message">You need to <a href="${pageTarget('login.php')}">log in</a> to see your submitted reports.</p>`;
      $('#myReportsList').innerHTML=empty('Login required','Only signed-in residents can track their reports.');
    }
  }
  function refresh() { renderAlerts(); renderCenters(); renderTips(); renderHotlines(); renderNews(); renderSettings(); renderUser(); }
  const modalReturnFocus = new Map();
  function openModal(id) { const el=$('#'+id); if (!el) return; modalReturnFocus.set(id, document.activeElement); el.hidden=false; document.body.style.overflow='hidden'; el.querySelector('.modal-close')?.focus(); }
  function closeModal(id) {const el=$('#'+id); if(el)el.hidden=true;if(id==='centerMapModal')$('#centerMapFrame')?.replaceChildren();if ($$('.modal-backdrop:not([hidden])').length===0)document.body.style.overflow='';const trigger=modalReturnFocus.get(id);if(trigger?.isConnected)trigger.focus();modalReturnFocus.delete(id);}
  function showAlert(id) {
    const a=state.data.alerts.find(v=>Number(v.id)===Number(id)); if(!a)return;
    $('#detailContent').innerHTML=`${badge(a)} <span class="sev-pill sev-${escape(a.severity)}">${escape(a.severity)}</span><h2 id="detailTitle">${escape(a.title)}</h2><div class="detail-meta"><span>📍 ${escape(a.location)}</span><span>◷ ${dateString(a.created_at)}</span><span>${escape(a.alert_type)}</span></div><p>${escape(a.description).replace(/\n/g,'<br>')}</p>${a.instructions?`<div class="detail-instructions"><strong>Safety instructions</strong><p>${escape(a.instructions).replace(/\n/g,'<br>')}</p></div>`:''}${isDemo(a)?'<p class="fineprint">This is an example alert, NOT an active emergency notice.</p>':''}`;
    openModal('detailModal');
  }
  function authTab(tab) {
    if (!$('#authPanel')) return;
    $$('#authPanel [data-auth-tab]').forEach(b=>b.classList.toggle('active',b.dataset.authTab===tab));
    $('#loginForm').hidden=tab!=='login'; $('#registerForm').hidden=tab!=='register';
    $('#authTitle').textContent=tab==='login'?'Welcome back':'Join your community';
    $('#authSubtitle').textContent=tab==='login'?'Sign in to access your community account.':'Create an account to track your incident reports.';
  }
  async function renderMyReports() {
    if (trackerEnabled() || !$('#myReportsList') || !state.user) return;
    $('#myReportsNotice').textContent='Loading your reports…';
    try {
      const result=await api('my_reports');
      $('#myReportsNotice').textContent=`${result.reports.length} report${result.reports.length === 1 ? '' : 's'} found for this account.`;
      $('#myReportsList').innerHTML=result.reports.length?result.reports.map(r=>`<article class="report-history-card"><div class="report-history-top"><div><small>REFERENCE ${escape(r.reference || (window.BS_PREVIEW_MODE?'DEMO-'+String(r.id).padStart(6,'0'):'Not supplied'))}</small><h3>${escape(r.incident_type)} · ${escape(r.location)}</h3></div><span class="status-pill status-${escape(r.status)}">${escape(statusLabel(r.status))}</span></div><div class="report-history-date">Submitted ${dateString(r.created_at)}</div><p>${escape(r.description)}</p>${r.has_photo && !window.BS_PREVIEW_MODE?`<a href="api.php?action=report_photo&amp;id=${Number(r.id)}" target="_blank" rel="noopener noreferrer">View submitted photo ↗</a>`:''}${r.latest_public_note?`<div class="report-history-note"><strong>Public administrator update</strong><p>${escape(r.latest_public_note)}</p></div>`:''}</article>`).join(''):empty('No reports yet','Reports you submit while logged in will appear here.');
    }catch(error){$('#myReportsNotice').textContent=error.message;$('#myReportsList').innerHTML=empty('Unable to load reports','Check your connection and try again.');}
  }
  async function showMyReports() {
    if (trackerEnabled()) { location.assign(pageTarget('my-reports.php')); return; }
    try {
      const result=await api('my_reports');
      $('#detailContent').innerHTML=`<h2 id="detailTitle">Your Incident Reports</h2><p>Recent reports submitted while logged into your account.</p>${result.reports.length?result.reports.map(r=>`<article class="news-card" style="margin-bottom:10px"><strong>${escape(r.reference || '#'+Number(r.id))} · ${escape(r.incident_type)}</strong><p>${escape(r.location)} · ${dateString(r.created_at)}</p><span class="status-pill status-${escape(r.status)}">${escape(statusLabel(r.status))}</span>${r.latest_public_note?`<p>Public administrator update: ${escape(r.latest_public_note)}</p>`:''}</article>`).join(''):empty('No reports yet','Submit a new incident report from the homepage.')}<button type="button" class="btn btn-outline" id="detailLogout">Log out</button>`;
      openModal('detailModal');
    } catch(e) { toast(e.message,true); }
  }
  let notificationTimer=null,notificationBusy=false,notificationVersion='',notificationStopped=false;
  const headerBadges=()=>$$('#reportNotificationBadge,[data-notification-unread]');
  function clearHeaderNotifications(){clearTimeout(notificationTimer);notificationTimer=null;notificationVersion='';headerBadges().forEach(el=>{el.textContent='';el.hidden=true;});}
  async function pollHeaderNotifications(){
    clearTimeout(notificationTimer);
    if(notificationStopped || notificationBusy || !state.user || trackerEnabled() || window.BS_PREVIEW_MODE || document.hidden)return;
    const owner=Number(state.user.id);notificationBusy=true;
    try{
      const result=await api('my_notifications',null,{version:notificationVersion});
      if(Number(state.user?.id)!==owner || notificationStopped)return;
      if(!result.unchanged && Number.isFinite(Number(result.unread_count))){
        const count=Math.max(0,Number(result.unread_count));notificationVersion=String(result.version || '');
        headerBadges().forEach(el=>{el.textContent=String(count);el.hidden=count===0;el.setAttribute('aria-label',`${count} unread report notifications`);});
      }
    }catch(error){if(error.status===401){state.user=null;clearHeaderNotifications();renderUser();}}
    finally{notificationBusy=false;if(!notificationStopped && state.user && !document.hidden && !trackerEnabled())notificationTimer=setTimeout(pollHeaderNotifications,15000);}
  }
  async function logout() {try {await api('logout',{});state.user=null;clearHeaderNotifications();renderUser();closeModal('detailModal');toast('You have been logged out.');return true;}catch(e){toast(e.message,true);return false;}}
  function prepareTools() {
    $$('#loginForm,#registerForm').forEach(form=>{if(form.querySelector('[data-auth-error]'))return;const error=document.createElement('p');error.dataset.authError='';error.className='form-error';error.setAttribute('role','alert');error.hidden=true;form.prepend(error);});
    for (const [listId, inputId, labelText, render] of [['hotlineList','hotlineSearch','Search emergency hotlines',renderHotlines],['tipsList','tipSearch','Search preparedness tips',renderTips]]) {
      const list=$('#'+listId); if (!list || $('#'+inputId)) continue;
      const wrapper=document.createElement('label');wrapper.className='search-wrap directory-search';
      const caption=document.createElement('span');caption.textContent=labelText;caption.className='sr-only';
      const input=document.createElement('input');input.type='search';input.id=inputId;input.placeholder=labelText;input.addEventListener('input',render);
      wrapper.append(caption,input);list.before(wrapper);
    }
    if ($('#alertSearch') && !$('#alertCategory')) {
      const wrapper=document.createElement('label');wrapper.className='module-filter';wrapper.textContent='Incident category';
      const select=document.createElement('select');select.id='alertCategory';select.addEventListener('change',()=>{state.alertPage=1;renderAlerts();});wrapper.append(select);$('.filter-row')?.after(wrapper);
    }
    $$('input[type="password"]').forEach((input,index)=>{
      if (input.closest('.password-field')) return;
      if (!input.id) input.id='dirms-password-'+index;
      const label=input.closest('label'); if (!label) return;
      const wrapper=document.createElement('div');wrapper.className='password-field';label.before(wrapper);wrapper.append(label);
      const button=document.createElement('button');button.type='button';button.className='password-toggle';button.textContent='Show';button.setAttribute('aria-label',input.name==='confirm_password'?'Show password confirmation':'Show password');button.setAttribute('aria-controls',input.id);button.setAttribute('aria-pressed','false');
      const reset=()=>{input.type='password';button.textContent='Show';button.setAttribute('aria-pressed','false');button.setAttribute('aria-label',input.name==='confirm_password'?'Show password confirmation':'Show password');};
      button.addEventListener('click',()=>{const show=input.type==='password';input.type=show?'text':'password';button.textContent=show?'Hide':'Show';button.setAttribute('aria-pressed',String(show));button.setAttribute('aria-label',`${show?'Hide':'Show'} ${input.name==='confirm_password'?'password confirmation':'password'}`);});
      input.form?.addEventListener('reset',reset);wrapper.append(button);
    });
  }
  function updateCategories() {
    const select=$('#alertCategory');if(!select)return;const current=select.value;
    select.innerHTML='<option value="">All categories</option>'+[...new Set(state.data.alerts.map(a=>a.alert_type))].sort().map(type=>`<option value="${escape(type)}">${escape(type)}</option>`).join('');
    if([...select.options].some(option=>option.value===current))select.value=current;
  }
  function onEvents() {
    const menu=$('#menuToggle');
    const closeMenu=()=>{const nav=$('#topNav');nav?.classList.remove('open');menu?.setAttribute('aria-expanded','false');};
    if (menu) {menu.setAttribute('aria-controls','topNav');menu.addEventListener('click',()=>{const n=$('#topNav');if(!n)return;n.classList.toggle('open');menu.setAttribute('aria-expanded',String(n.classList.contains('open')));});}
    $$('#topNav a').forEach(a=>a.addEventListener('click',closeMenu));
    document.addEventListener('click',e=>{if(!e.target.closest('.site-header'))closeMenu();});
    document.addEventListener('focusin',e=>{if(!e.target.closest('.site-header'))closeMenu();});
    document.addEventListener('visibilitychange',()=>{clearTimeout(notificationTimer);if(!document.hidden)pollHeaderNotifications();});
    window.addEventListener('pagehide',()=>{notificationStopped=true;clearHeaderNotifications();});
    window.addEventListener('pageshow',event=>{if(event.persisted){notificationStopped=false;pollHeaderNotifications();}});
    if ($('#refreshAlerts')) $('#refreshAlerts').addEventListener('click',()=>loadLatestAlerts(true));
    if ($('#refreshMyReports')) $('#refreshMyReports').addEventListener('click',renderMyReports);
    if ($('#copyReportReference')) $('#copyReportReference').addEventListener('click',async ()=>{
      const reference = $('#receiptId').textContent;if(!reference)return;
      try{await navigator.clipboard.writeText(reference);toast('Reference copied.');}catch{toast('Save this reference: '+reference);}
    });
    if ($('#receiptMyReports')) $('#receiptMyReports').addEventListener('click',e=>location.assign(pageTarget('my-reports.php')+(e.currentTarget.dataset.reportId?'#report-'+encodeURIComponent(e.currentTarget.dataset.reportId):'')));
    if ($('#alertSearch')) $('#alertSearch').addEventListener('input',()=>{state.alertPage=1;renderAlerts();});
    if ($('#centerSearch')) $('#centerSearch').addEventListener('input',renderCenters);
    $$('.filter-chip').forEach(chip=>{chip.setAttribute('aria-pressed',String(chip.classList.contains('active')));chip.addEventListener('click',()=>{$$('.filter-chip').forEach(c=>{c.classList.remove('active');c.setAttribute('aria-pressed','false');});chip.classList.add('active');chip.setAttribute('aria-pressed','true');state.alertSeverity=chip.dataset.severity;state.alertPage=1;renderAlerts();});});
    if ($('#showAllCenters')) $('#showAllCenters').addEventListener('click',()=>{state.centerExpanded=!state.centerExpanded;renderCenters();});
    document.addEventListener('click', e=>{
      const centerMap=e.target.closest('[data-center-map]');if(centerMap){openCenterMap(centerMap.dataset.centerMap);return;}
      const alertButton=e.target.closest('[data-alert-id]');if(alertButton){showAlert(alertButton.dataset.alertId);return;}
      const page=e.target.closest('[data-alert-page]');if(page){state.alertPage=Number(page.dataset.alertPage);renderAlerts();return;}
      const tip=e.target.closest('[data-tip]');if(tip){const item=tip.closest('.tip-item');const open=item.classList.toggle('open');tip.setAttribute('aria-expanded',String(open));$('.tip-body',item).hidden=!open;return;}
      if(e.target.closest('[data-close-modal]')) {closeModal(e.target.closest('.modal-backdrop').id);return;}
      if(e.target.classList.contains('modal-backdrop'))closeModal(e.target.id);
      if(e.target.closest('#detailLogout'))logout();
    });
    document.addEventListener('keydown',e=>{
      if(e.key==='Escape'){$$('.modal-backdrop:not([hidden])').forEach(el=>closeModal(el.id));if($('#topNav')?.classList.contains('open')){closeMenu();menu?.focus();}}
      if(e.key==='Tab'){
        const modal=$$('.modal-backdrop:not([hidden])').at(-1);if(!modal)return;
        const focusable=$$('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex="0"]',modal).filter(el=>el.getClientRects().length);
        const first=focusable[0],last=focusable.at(-1);if(!first)return;
        if(e.shiftKey && (document.activeElement===first || !modal.contains(document.activeElement))){e.preventDefault();last.focus();}
        else if(!e.shiftKey && (document.activeElement===last || !modal.contains(document.activeElement))){e.preventDefault();first.focus();}
      }
    });
    if ($('#navLogout')) $('#navLogout').addEventListener('click',async()=>{if(await logout())location.assign(pageTarget('index.php'));});
    if ($('#photoInput')) $('#photoInput').addEventListener('change',e=>{
      const file=e.target.files[0];$('#uploadLabel').textContent=file?file.name:'Choose JPG, PNG or WebP image';
      const img=$('#photoPreview');if(img.dataset.blobUrl)URL.revokeObjectURL(img.dataset.blobUrl);
      img.hidden=!file;
      if(file && file.type.startsWith('image/')){const url=URL.createObjectURL(file);img.src=url;img.dataset.blobUrl=url;} else img.hidden=true;
    });
    if ($('#incidentForm')) $('#incidentForm').addEventListener('submit',async e=>{
      e.preventDefault();const form=e.currentTarget,btn=$('#reportSubmit');if(btn.disabled)return;const data=new FormData(form);
      const errorBox=$('#reportFormError');errorBox.hidden=true;
      const photo=data.get('photo');
      if(photo instanceof File && photo.size>5*1024*1024){errorBox.textContent='Maximum photo size is 5 MB.';errorBox.hidden=false;return;}
      if(photo instanceof File && photo.size && !['image/jpeg','image/png','image/webp'].includes(photo.type)) {errorBox.textContent='Please upload only JPG, PNG or WebP photos.';errorBox.hidden=false;return;}
      if(!form.reportValidity())return;
      if(!form.dataset.submissionKey)form.dataset.submissionKey=Array.from(crypto.getRandomValues(new Uint8Array(24)),value=>value.toString(16).padStart(2,'0')).join('');
      data.set('submission_key',form.dataset.submissionKey);
      btn.disabled=true;btn.setAttribute('aria-busy','true');btn.textContent='Submitting…';
      try{const result=await api('report',data);showReceipt(result);toast(result.message);delete form.dataset.submissionKey;form.reset();$('#photoPreview').hidden=true;$('#uploadLabel').textContent='Choose JPG, PNG or WebP image';if($('#photoPreview').dataset.blobUrl){URL.revokeObjectURL($('#photoPreview').dataset.blobUrl);delete $('#photoPreview').dataset.blobUrl;}}
      catch(err){errorBox.textContent=err.message;errorBox.hidden=false;errorBox.scrollIntoView({behavior:reduceMotion()?'auto':'smooth',block:'nearest'});toast(err.message,true);}
      finally{btn.disabled=false;btn.removeAttribute('aria-busy');btn.innerHTML='Submit Incident Report <span>→</span>';}
    });
    if ($('#loginForm')) $('#loginForm').addEventListener('submit',async e=>{
      e.preventDefault();const form=e.currentTarget,btn=$('button[type=submit]',form),error=$('[data-auth-error]',form);if(btn.disabled)return;if(error)error.hidden=true;btn.disabled=true;
      try{const result=await api('login',Object.fromEntries(new FormData(form)));state.user=result.user;renderUser();toast(result.message);form.reset();
        if (window.BS_PREVIEW_MODE) window.sessionStorage?.setItem('bs_preview_user',JSON.stringify(result.user));
        location.assign(pageTarget(result.user?.role === 'admin'?'admin.php':'my-reports.php'));
      }catch(err){if(error){error.textContent=err.message;error.hidden=false;}toast(err.message,true);}finally{btn.disabled=false;}
    });
    if ($('#registerForm')) $('#registerForm').addEventListener('submit',async e=>{
      e.preventDefault();const form=e.currentTarget,btn=$('button[type=submit]',form),input=Object.fromEntries(new FormData(form)),error=$('[data-auth-error]',form);if(btn.disabled)return;if(error)error.hidden=true;
      if(input.password!==input.confirm_password){if(error){error.textContent='Passwords do not match.';error.hidden=false;}toast('Passwords do not match.',true);return;}
      btn.disabled=true;try{const result=await api('register',input);state.user=result.user;renderUser();form.reset();toast(result.message);if(window.BS_PREVIEW_MODE)window.sessionStorage?.setItem('bs_preview_user',JSON.stringify(result.user));location.assign(pageTarget('my-reports.php'));}
      catch(err){if(error){error.textContent=err.message;error.hidden=false;}toast(err.message,true);}finally{btn.disabled=false;}
    });
  }
  async function start() {
    const view=document.body.dataset.view || 'home';
    state.centerExpanded=view==='centers';
    prepareTools();
    onEvents();
    if(view==='login'||view==='register')authTab(view);
    if(new URLSearchParams(location.search).get('admin')==='denied')toast('Administrator privileges are required to open the admin dashboard.',true);
    try {
      const res=await api('bootstrap');state.data=res.data;state.user=res.user;state.csrf=res.csrf;
      updateCategories();
      refresh();
      window.DIRMS_APP.ready=true;
      document.dispatchEvent(new CustomEvent('dirms:ready',{detail:{user:state.user,csrf:state.csrf}}));
      pollHeaderNotifications();
      if(view==='my-reports' && !trackerEnabled())await renderMyReports();
      if(view==='login' && state.user && new URLSearchParams(location.search).get('next')==='admin' && state.user.role==='admin')location.replace(pageTarget('admin.php'));
    }
    catch(e){
      const help='Website data is temporarily unavailable. Check the connection and try again. On a local XAMPP installation, confirm MySQL is running and installation or upgrade is complete.';
      ['alertList','latestAlert','centerList','hotlineList','tipsList','newsList','myReportsList'].forEach(id=>{const el=$('#'+id);if(el)el.innerHTML=empty('Database setup required',help);});
      if($('#safetyText'))$('#safetyText').textContent=help;
      if($('#reportFormError')){$('#reportFormError').textContent=help;$('#reportFormError').hidden=false;}
      if($('#reportSubmit'))$('#reportSubmit').disabled=true;
      if($('#alertFeedStatus'))$('#alertFeedStatus').textContent='Database not connected';
      if($('#myReportsNotice'))$('#myReportsNotice').textContent=help;
      if($('#loginForm'))$('button[type=submit]',$('#loginForm')).disabled=true;
      if($('#registerForm'))$('button[type=submit]',$('#registerForm')).disabled=true;
      document.dispatchEvent(new CustomEvent('dirms:unavailable',{detail:{message:e.message}}));
      toast(e.message,true);
    }
  }
  function empty(title,body){return `<div class="empty-state"><strong>${escape(title)}</strong>${escape(body)}</div>`;}
  window.DIRMS_APP={api,getUser:()=>state.user,getCsrf:()=>state.csrf,ready:false};
  document.addEventListener('DOMContentLoaded',start);
})();
