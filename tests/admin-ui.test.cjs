/* Run: npm --prefix tests install; node --test tests/admin-ui.test.cjs */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');
const root = path.resolve(__dirname, '..', 'DIRMS');
const html = fs.readFileSync(path.join(root, 'admin.php'), 'utf8').replace(/<\?(?:php|=)[\s\S]*?\?>/g, '');
const script = fs.readFileSync(path.join(root, 'assets/js/admin.js'), 'utf8');
const wait = () => new Promise(resolve => setImmediate(resolve));

function report(overrides = {}) {
  return { id: 125, reference: 'DIRMS-000125', incident_type: 'Flood', location: 'San Pablo City', description: 'Water near the road.', reporter_name: 'Test Resident', reporter_contact: 'Provided privately', status: 'pending', version: 8, created_at: '2026-11-06T18:00:00Z', updated_at: '2026-11-06T18:00:00Z', allowed_transitions: ['received', 'rejected', 'needs_info'], can_reopen: false, history: [], ...overrides };
}

async function setup(reports, { conflict = false, preview = false } = {}) {
  const requests = [], errors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', error => errors.push(error.message));
  const dom = new JSDOM(html, { url: 'http://localhost/DIRMS/admin.php', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: vc });
  const { window } = dom;
  const data = { reports: structuredClone(reports), stats: {}, alerts: [], centers: [], users: [], news: [], hotlines: [], tips: [], settings: {}, activity: [] };
  window.confirm = () => true;
  window.HTMLElement.prototype.scrollIntoView = function () {};
  window.fetch = async (url, options) => {
    const action = new URL(url, window.location.href).searchParams.get('action');
    const body = options.body ? JSON.parse(options.body) : undefined;
    requests.push({ action, body, options });
    let result;
    if (action === 'admin_data') result = { ok: true, data, csrf: 'test-csrf' };
    else if (action === 'report_details') {
      const id = Number(new URL(url, window.location.href).searchParams.get('id'));
      result = { ok: true, report: data.reports.find(item => item.id === id) };
    } else if (action === 'report_status' || action === 'report_add_public_update') {
      if (conflict) return { ok: false, status: 409, json: async () => ({ ok: false, message: 'This report changed. Load its latest version.' }) };
      const item = data.reports.find(item => item.id === body.id);
      if (body.status) item.status = body.status;
      item.version++;
      result = { ok: true, message: 'Report saved.' };
    } else result = { ok: true, message: 'Saved.' };
    return { ok: true, status: 200, json: async () => result };
  };
  if (preview) { window.BS_PREVIEW_MODE = true; window.BS_PREVIEW_ADMIN = data; window.BS_SAVE_PREVIEW = () => {}; }
  window.eval(script);
  await wait(); await wait();
  const $ = selector => window.document.querySelector(selector);
  const click = selector => $(selector).click();
  const change = (selector, value) => { const element = $(selector); element.value = value; element.dispatchEvent(new window.Event('change', { bubbles: true })); };
  const input = (selector, value) => { const element = $(selector); element.value = value; element.dispatchEvent(new window.Event('input', { bubbles: true })); };
  const open = async id => { click('[data-section="reports"]'); click(`[data-review="${id}"]`); await wait(); };
  const submit = async () => { $('#reportReviewForm').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })); await wait(); await wait(); };
  return { window, dom, $, click, change, input, open, submit, requests, errors, data };
}

test('all report counts, reference search and Manila calendar-date filters render from data', async t => {
  const env = await setup([report(), report({ id: 126, reference: 'BS-000126', status: 'resolved' })]);
  t.after(() => env.dom.window.close());
  env.click('[data-section="reports"]');
  assert.equal(env.window.document.querySelectorAll('.report-stat').length, 8);
  assert.equal(env.$('.report-stat.pending strong').textContent, '1');
  assert.equal(env.$('.report-stat.resolved strong').textContent, '1');
  assert.equal(env.window.document.querySelectorAll('.admin-report-card').length, 2);
  env.input('[data-report-filter="search"]', 'BS-000126');
  assert.equal(env.window.document.querySelectorAll('.admin-report-card').length, 1);
  assert.match(env.$('#reportResults').textContent, /BS-000126/);
  env.input('[data-report-filter="search"]', '');
  env.input('[data-report-filter="from"]', '2026-11-07');
  env.input('[data-report-filter="to"]', '2026-11-07');
  assert.equal(env.window.document.querySelectorAll('.admin-report-card').length, 2);
  env.input('[data-report-filter="to"]', '2026-11-06');
  assert.equal(env.window.document.querySelectorAll('.admin-report-card').length, 0);
  assert.deepEqual(env.errors, []);
});

for (const status of ['resolved', 'rejected']) test(`${status} report exposes explicit reopen despite empty forward transitions`, async t => {
  const env = await setup([report({ status, allowed_transitions: [], can_reopen: true })]);
  t.after(() => env.dom.window.close());
  await env.open(125);
  const option = env.$('#reportAction option[value="reviewing"]');
  assert.equal(option.textContent, 'Reopen Report');
  env.change('#reportAction', 'reviewing');
  assert.equal(env.$('[name="public_note"]').required, true);
  await env.submit();
  assert.equal(env.requests.filter(request => request.action === 'report_status').length, 0);
  env.$('[name="public_note"]').value = 'New evidence was supplied; review is needed.';
  await env.submit();
  const saved = env.requests.find(request => request.action === 'report_status');
  assert.equal(saved.body.version, 8);
  assert.equal(saved.body.event_type, 'reopen');
  assert.equal(saved.body.status, 'reviewing');
  assert.equal(saved.options.headers['X-CSRF-Token'], 'test-csrf');
  assert.equal(env.$('#adminDetailModal').hidden, true);
  assert.deepEqual(env.errors, []);
});

test('special actions require public explanations and note-only saves never submit a status', async t => {
  const env = await setup([report({ status: 'reviewing', allowed_transitions: ['in_progress', 'needs_info', 'rejected'] })]);
  t.after(() => env.dom.window.close());
  await env.open(125);
  for (const status of ['in_progress', 'needs_info', 'rejected']) {
    env.change('#reportAction', status);
    assert.equal(env.$('[name="public_note"]').required, true);
    await env.submit();
  }
  assert.equal(env.requests.filter(request => request.action === 'report_status').length, 0);
  env.change('#reportAction', '');
  env.$('[name="internal_note"]').value = 'Private coordination details.';
  await env.submit();
  const saved = env.requests.find(request => request.action === 'report_add_public_update');
  assert.equal(saved.body.version, 8);
  assert.equal(saved.body.internal_note, 'Private coordination details.');
  assert.equal(Object.hasOwn(saved.body, 'status'), false);
  assert.deepEqual(env.errors, []);
});

test('conflict keeps unsaved notes visible and offers an explicit latest-version reload', async t => {
  const env = await setup([report()], { conflict: true });
  t.after(() => env.dom.window.close());
  await env.open(125);
  env.change('#reportAction', 'received');
  env.$('[name="public_note"]').value = 'Acknowledged by the duty officer.';
  await env.submit();
  assert.equal(env.$('#adminDetailModal').hidden, false);
  assert.equal(env.$('[name="public_note"]').value, 'Acknowledged by the duty officer.');
  assert.match(env.$('#reportSaveError').textContent, /report changed/);
  assert.equal(env.$('[data-reload-report]').textContent, 'Load latest report');
  assert.equal(env.$('#reportReviewForm').dataset.version, '8');
  assert.deepEqual(env.errors, []);
});

test('protected evidence and escaped history keep raw upload URLs and markup out of the modal', async t => {
  const env = await setup([report({ photo_url: 'api.php?action=report_photo&id=125', photo_path: 'uploads/private-photo.jpg', description: '<img src=x onerror=alert(1)>', admin_notes: 'Private legacy notes', history: [{ event_type: 'note', previous_status: 'pending', new_status: 'pending', actor_name: 'Admin', created_at: '2026-11-06T18:00:00Z', public_note: '<script>bad()</script>', internal_note: 'Private history note' }] })]);
  t.after(() => env.dom.window.close());
  await env.open(125);
  assert.match(env.$('.report-photo').getAttribute('src'), /^api\.php\?action=report_photo/);
  assert.equal(env.$('#adminDetailContent script'), null);
  assert.equal(env.$('#adminDetailContent img[onerror]'), null);
  assert.equal(env.$('#adminDetailContent a[href^="uploads/"]'), null);
  assert.match(env.$('.admin-report-history').textContent, /Administrator note/);
  assert.match(env.$('.admin-report-history').textContent, /Private history note/);
  assert.match(env.$('.legacy-private-notes').textContent, /Private legacy notes/);
  assert.deepEqual(env.errors, []);
});

test('legacy import annotations stay in history without becoming an administrator response', async t => {
  const env = await setup([report({ status: 'resolved', can_reopen: true, allowed_transitions: [], history: [{ event_type: 'legacy_submission', previous_status: null, new_status: 'pending', created_at: '2026-11-06T18:00:00Z', public_note: 'Imported submission only; earlier administrator actions are unknown.' }] })]);
  t.after(() => env.dom.window.close());
  await env.open(125);
  assert.match(env.$('.admin-report-history').textContent, /Imported submission only/);
  assert.doesNotMatch(env.$('#adminDetailContent').textContent, /Latest public response/);
  assert.deepEqual(env.errors, []);
});

test('demo editor flags preserve existing samples and default new entries to demonstration', async t => {
  const env = await setup([], { preview: true });
  t.after(() => env.dom.window.close());
  env.data.alerts.push({ id: 1, title: 'Demo warning', severity: 'high', alert_type: 'Flood', location: 'Sample location', description: 'Sample only', is_demo: 1, is_active: 1 });
  env.click('[data-section="alerts"]');
  env.click('[data-edit="alerts"]');
  assert.equal(env.$('[name="is_demo"]').checked, true);
  env.$('#editorForm').dispatchEvent(new env.window.Event('submit', { bubbles: true, cancelable: true }));
  await wait(); await wait();
  assert.equal(env.data.alerts[0].is_demo, true);
  env.click('[data-add="alerts"]');
  assert.equal(env.$('[name="is_demo"]').checked, true);
  assert.deepEqual(env.errors, []);
});
