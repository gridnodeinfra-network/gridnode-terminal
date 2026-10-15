#!/usr/bin/env node
'use strict';
/* GRID//NODE reliability v8.1 — browser drives for the two QA Mission 9
 * gate blockers on candidate f021e3e (v1.1.2). Choreography mirrors the
 * QA desk's gate-v9-g2b / gate-v9-g3 drives (stateful fake PostgREST
 * behind route interception, real UI paths, the app's exposed session
 * API), so a PASS here speaks to the same acceptance criteria:
 *
 *   C1  session draft storage is purged at UI sign-out (v8, control)
 *   C2  the drawer FORM STATE (DOM fields + custom-select state +
 *       moduleState draft/meridiem) is reset at the session boundary —
 *       nothing of account A renders into account B's drawer on the
 *       same-tab logout→login path (Mission 9 G2 blocker)
 *   C3  reload + Back boundary probes under B stay pristine
 *   C4  positive control: the OWNER's draft (med, dose, notes, time,
 *       meridiem, side effects) restores fully after a reload
 *   C5  cloud→local boundary: the local session's drawer is pristine
 *   D1  fault leg: ownership-claim failure -> LOCAL_BACKUP, no upload
 *   D2  retry leg: next sign-in claims AND migrates (Mission 9 G3
 *       blocker), exactly once across further sign-ins
 *   D3  the migrated record survives in local mode after sign-out
 *   D4  account B inherits nothing (fault leg + control leg)
 *   D5  control leg: a healthy first claim migrates immediately
 *
 * Usage: node scripts/test-reliability-v81-browser.cjs [baseUrl]
 * Serves ../dist itself when no baseUrl is given. The supabase UMD is
 * intercepted and served from GN_SB_UMD or the QA desk's vendored copy.
 */

const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

const { chromium } = require(path.join(__dirname, '..', 'node_modules', 'playwright'));

const SB_UMD = process.env.GN_SB_UMD || path.join(os.homedir(), 'workspace/gridnode-qa/supabase.min.js');
const HOST = 'https://quwbmhxgteyykujydvii.supabase.co';
const SB_KEY = 'sb-quwbmhxgteyykujydvii-auth-token';

const results = [];
function check(name, condition, detail = '') {
  results.push({ name, ok: Boolean(condition) });
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${condition ? '' : ` — ${String(detail).slice(0, 300)}`}`);
}

/* ── static dist server (same shape as the v8 harness) ─────────────── */
function serveDist() {
  const root = path.resolve(__dirname, '../dist');
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.ico': 'image/x-icon' };
  const server = http.createServer((req, res) => {
    const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let file = path.join(root, urlPath === '/' ? 'index.html' : urlPath);
    if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(root, 'index.html');
    res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve({ server, url: `http://127.0.0.1:${server.address().port}` })));
}

async function browserPath() {
  const fallback = fs.readdirSync(path.join(os.homedir(), '.cache/ms-playwright'), { withFileTypes: true })
    .filter(entry => entry.isDirectory() && entry.name.startsWith('chromium'))
    .map(entry => path.join(os.homedir(), '.cache/ms-playwright', entry.name))
    .sort().reverse();
  for (const dir of fallback) {
    for (const rel of ['chrome-linux/headless_shell', 'chrome-linux/chrome', 'chrome-headless-shell-linux64/chrome-headless-shell', 'chrome-linux64/chrome']) {
      const candidate = path.join(dir, rel);
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  return chromium.executablePath();
}

/* ── stateful fake cloud (QA gate lineage, workspace upsert fixed) ── */
let uuidN = 0;
const newUuid = () => '00000000-0000-4000-8000-' + String(++uuidN).padStart(12, '0');
const JWT = (sub) => 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.' + Buffer.from(JSON.stringify({ sub, aud: 'authenticated', role: 'authenticated', exp: 4102444800 })).toString('base64url') + '.sig';
const mkUser = (id) => ({ id, email: id + '@qa.test', token: JWT(id) });

function makeCloud() {
  const db = { shots: new Map(), weights: new Map(), profiles: new Map(), workspaces: new Map() };
  const calls = [];
  const cloud = { db, calls, users: [], lastUser: null };
  cloud.seedProfile = (userId) => { const row = { id: userId, display_name: 'QA' }; db.profiles.set(userId, row); return row; };
  cloud.sessionFor = (user) => ({ access_token: user.token, refresh_token: 'r', expires_at: 4102444800, expires_in: 3600, token_type: 'bearer', user: { id: user.id, aud: 'authenticated', role: 'authenticated', email: user.email } });
  cloud.userFromToken = (auth) => { const t = (auth || '').replace('Bearer ', ''); return cloud.users.find(u => u.token === t) || cloud.lastUser || null; };
  cloud.remoteShots = (userId) => [...db.shots.values()].filter(r => r.user_id === userId);
  cloud.handle = async (route) => {
    const req = route.request(); const url = new URL(req.url()); const p = url.pathname; const method = req.method();
    let body = null; try { body = req.postData() ? JSON.parse(req.postData()) : null; } catch (_) {}
    if (p === '/auth/v1/settings') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ external: { google: true, email: true } }) });
    if (p === '/auth/v1/user') { const u = cloud.userFromToken(req.headers()['authorization'] || ''); return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(u ? cloud.sessionFor(u).user : {}) }); }
    if (p === '/auth/v1/token') { const u = cloud.lastUser; return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(cloud.sessionFor(u)) }); }
    if (p === '/functions/v1/redeem-node-key') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, needsKey: false }) });
    if (p === '/functions/v1/phase-state') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ empty: true }) });
    const m = p.match(/^\/rest\/v1\/(\w+)$/);
    if (!m) return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ code: 'QA_NOT_IMPLEMENTED', message: 'fake cloud: unimplemented ' + p }) });
    const table = db[m[1]]; if (!table) return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
    const filters = {}; for (const [k, v] of url.searchParams) { const mm = v.match(/^eq\.(.*)$/); if (mm) filters[k] = mm[1]; }
    const rowsIn = body ? (Array.isArray(body) ? body : [body]) : [];
    calls.push({ method, table: m[1], at: Date.now() });
    const matchRows = () => [...table.values()].filter(r => Object.entries(filters).every(([k, v]) => String(r[k]) === String(v)));
    const wantsObject = (req.headers()['accept'] || '').includes('pgrst.object');
    if (method === 'GET') {
      const rows = matchRows();
      if (wantsObject) {
        if (rows.length === 1) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(rows[0]) });
        return route.fulfill({ status: 406, contentType: 'application/json', body: JSON.stringify({ code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' }) });
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(rows) });
    }
    if (method === 'POST') {
      const out = [];
      for (const r of rowsIn) {
        if (!r.id && m[1] === 'workspaces' && r.user_id) { const ex = [...table.values()].filter(x => x.user_id === r.user_id); if (ex.length) { r.id = ex[0].id; for (const dup of ex.slice(1)) table.delete(dup.id); } }
        if (!r.id) r.id = newUuid();
        table.set(r.id, { ...(table.get(r.id) || {}), ...r }); out.push(table.get(r.id));
      }
      return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(out) });
    }
    if (method === 'PATCH') { const rows = matchRows(); const patch = rowsIn[0] || {}; for (const r of rows) table.set(r.id, { ...r, ...patch }); return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(rows.map(r => table.get(r.id))) }); }
    if (method === 'DELETE') { const rows = matchRows(); for (const r of rows) table.delete(r.id); return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(rows) }); }
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  };
  return cloud;
}

async function newCloudPage(browser, cloud) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, timezoneId: 'America/New_York', locale: 'en-US' });
  await ctx.route('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.39.7/dist/umd/supabase.min.js', r => r.fulfill({ path: SB_UMD, contentType: 'application/javascript' }));
  await ctx.route(HOST + '/**', cloud.handle);
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e).slice(0, 140)));
  return { ctx, page, errs };
}

async function plant(ctx, user) {
  const sess = { access_token: user.token, refresh_token: 'r', expires_at: 4102444800, expires_in: 3600, token_type: 'bearer', user: { id: user.id, aud: 'authenticated', role: 'authenticated', email: user.email } };
  await ctx.addInitScript((s) => { try { localStorage.setItem('sb-quwbmhxgteyykujydvii-auth-token', JSON.stringify(s)); localStorage.setItem('gn_legal_accept_v1', JSON.stringify({ v: 1 })); } catch (_) {} }, sess);
}

/* Init scripts re-run on EVERY navigation, so a reload would re-plant
 * the FIRST user's token and silently restore the wrong account (this
 * trap is present in the QA gate script's positive control: its post-
 * reload draft carries the first account's owner stamp). Re-planting
 * the intended user right before a reload makes the later init script
 * win the same storage key. */
async function replant(ctx, user) { await plant(ctx, user); }

const stateOf = (page) => page.evaluate(() => {
  const s = window.GN?.state || {};
  const shots = (typeof window.getAllShots === 'function' ? window.getAllShots() : []);
  return { cloud: s.cloud, cloudStatus: s.cloudStatus, accountKey: s.accountKey, shots: shots.map(x => ({ id: x.id, med: x.med, dose: x.dose })) };
}).catch(() => null);

async function waitState(page, pred, timeout = 14000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) { const s = await stateOf(page); if (s && pred(s)) return s; await page.waitForTimeout(400); }
  return stateOf(page);
}

async function enterApp(page) {
  await page.waitForFunction(() => { const a = document.getElementById('app'); return a && getComputedStyle(a).display !== 'none'; }, null, { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(1200);
  await page.evaluate(() => { try { window.GN_ONBOARDING?.dismiss(); } catch (_) {} });
  await page.waitForTimeout(500);
}

async function loginInPage(page, cloud, user) {
  cloud.lastUser = user;
  const s = cloud.sessionFor(user);
  await page.evaluate(async (sess) => { try { localStorage.setItem('sb-quwbmhxgteyykujydvii-auth-token', JSON.stringify(sess)); } catch (_) {} if (typeof window.completeCloudSession === 'function') await window.completeCloudSession(sess); }, s);
}

async function dismissOnboarding(page) {
  for (let attempt = 0; attempt < 6; attempt++) {
    await page.evaluate(() => { try { window.GN_ONBOARDING?.dismiss?.(); } catch (_) {} });
    const obVisible = await page.locator('.gn-ob').isVisible().catch(() => false);
    if (!obVisible) return;
    for (const b of await page.$$('.gn-ob button')) {
      const t = (await b.textContent().catch(() => '') || '').trim();
      if (await b.isVisible().catch(() => false) && /got it|skip|begin|start|continue/i.test(t)) { await b.click().catch(() => {}); await page.waitForTimeout(400); }
    }
    await page.waitForTimeout(400);
  }
}

async function openDrawer(page) {
  /* The app restores the last active page across an in-page account
   * switch (the C drive signs out from the Vault), so the dashboard —
   * and its LOG SHOT button — may not be the visible page. Navigate
   * HOME first, the way a user would. The click is also retried until
   * the drawer is verifiably open: a missed click used to read as a
   * pristine (closed) drawer downstream. */
  await page.evaluate(() => {
    const pd = document.querySelector('#pageDash');
    if (pd && getComputedStyle(pd).display === 'none') document.querySelector('#navDash')?.click();
  });
  await page.waitForTimeout(600);
  /* The dashboard carries several LOG SHOT buttons (mission card,
   * Wanda card, FAB, an empty-state CTA with no handler); which one
   * is first in DOM order varies by account state, so rotate through
   * the visible candidates until the drawer verifiably opens. */
  let opened = false;
  for (let attempt = 0; attempt < 6 && !opened; attempt++) {
    opened = await page.evaluate(() => document.querySelector('#logOv')?.classList.contains('active'));
    if (opened) break;
    await page.evaluate((idx) => {
      const candidates = [...document.querySelectorAll('#pageDash button')].filter(x => (x.textContent || '').trim() === 'LOG SHOT' && x.getBoundingClientRect().width > 0);
      candidates[idx % Math.max(candidates.length, 1)]?.click();
    }, attempt);
    await page.waitForFunction(() => document.querySelector('#logOv')?.classList.contains('active'), null, { timeout: 4000 }).catch(() => {});
    opened = await page.evaluate(() => document.querySelector('#logOv')?.classList.contains('active'));
  }
  if (!opened) throw new Error('openDrawer: LOG SHOT drawer never opened');
  await page.waitForTimeout(1200);
  await dismissOnboarding(page);
}

async function closeDrawer(page) {
  await page.evaluate(() => { const x = [...document.querySelectorAll('#logOv button')].find(b => (b.textContent || '').trim() === '✕' || /close/i.test(b.className)); x?.click(); });
  await page.waitForTimeout(600);
  /* A dirty drawer raises the discard confirm instead of closing; the
   * session draft lives in sessionStorage either way, so force the
   * close through the module when the sheet is still up. */
  const stillOpen = await page.evaluate(() => document.querySelector('#logOv')?.classList.contains('active'));
  if (stillOpen) {
    await page.evaluate(() => { try { window.GNModules?.closeLog?.(true); } catch (_) {} });
    await page.waitForTimeout(700);
  }
}

/* Real picker selection, the way a user does it: open the custom
 * dropdown, reveal the medication's group when it starts collapsed
 * (TB-500 / GHK-Cu live in collapsed groups — their options have zero
 * geometry until revealed, which is why QA's width-sorted evaluate
 * click was the only thing that ever "worked" there), then activate
 * the revealed option. Capture fidelity is asserted separately, so a
 * harness-side miss surfaces as its own FAIL instead of a false
 * product one. */
async function pickMed(page, label) {
  await dismissOnboarding(page);
  await page.evaluate(() => { const trig = document.querySelector('#cpShotMedVal')?.closest('.cp-select-trigger'); if (trig && !trig.classList.contains('open')) trig.click(); });
  await page.waitForTimeout(700);
  await page.evaluate((lbl) => {
    const opt = [...document.querySelectorAll('#cpShotMedDrop .cp-option')].find(e => e.textContent.trim() === lbl);
    const box = opt?.closest('.cp-group-options');
    if (box && !box.classList.contains('gn-revealed')) {
      const group = box.getAttribute('data-gn-med-options');
      if (group && typeof window.gnMedRevealGroup === 'function') window.gnMedRevealGroup('cpShotMedDrop', group);
    }
  }, label);
  await page.waitForTimeout(500);
  /* The option is revealed and laid out now, but the drawer's layered
   * chrome defeats Playwright's hit-test, so activate the option
   * through its own wired click listener (the same handler a tap
   * invokes — selectOpt). Whether the selection truly registered is
   * not assumed: the draft-fidelity assertions read selectState and
   * the captured draft back. */
  const clicked = await page.evaluate((lbl) => {
    const opt = [...document.querySelectorAll('#cpShotMedDrop .cp-option')].find(e => e.textContent.trim() === lbl);
    if (!opt) return false;
    opt.click();
    return true;
  }, label);
  if (!clicked) throw new Error('pickMed: option not found: ' + label);
  await page.waitForTimeout(800);
}

async function fillDraft(page, { dose, notes, time, meridiem }) {
  await page.evaluate(({ dose, notes, time, meridiem }) => {
    if (notes != null) { const n = document.querySelector('#sNotes'); if (n) { n.focus(); n.value = notes; n.dispatchEvent(new Event('input', { bubbles: true })); } }
    if (time) { const t = document.querySelector('#sTime'); t.value = time; t.dispatchEvent(new Event('input', { bubbles: true })); }
    if (meridiem) window.GNModules?.gnSetShotMeridiem?.(meridiem);
    /* The session draft is captured on input/change inside the drawer,
     * so the dose edit goes LAST: the final capture then carries every
     * field, the meridiem included. */
    const d = document.querySelector('#sDose'); d.focus(); d.value = dose; d.dispatchEvent(new Event('input', { bubbles: true }));
  }, { dose, notes, time, meridiem });
  await page.waitForTimeout(900);
}

const readForm = (page) => page.evaluate(() => ({
  med: document.querySelector('#cpShotMedVal')?.textContent?.trim(),
  medPlaceholder: document.querySelector('#cpShotMedVal')?.classList?.contains('placeholder'),
  dose: document.querySelector('#sDose')?.value,
  notes: (document.querySelector('#sNotes') || document.querySelector('#logOv textarea'))?.value,
  time: document.querySelector('#sTime')?.value,
  wt: document.querySelector('#sWt')?.value,
  selectVal: window.GNModules?.selectState?.cpShotMed?.val ?? null,
  moduleDraft: window.GNModules?.moduleState?.shotDraft ? 'SET' : null,
  meridiem: window.GNModules?.moduleState?.meridiem,
  checkedSe: [...document.querySelectorAll('#logOv input[type="checkbox"]:checked')].map(i => i.value)
}));

const readDraft = (page) => page.evaluate(() => { try { return JSON.parse(sessionStorage.getItem('gn_shot_draft_session_v1') || 'null'); } catch (_) { return null; } });

/* ── DRIVE C — G2: draft form state across the session boundary ───── */
async function driveDraftBoundary(browser, baseUrl) {
  console.log('\n── C: draft form-state session boundary (G2) ──');
  const cloud = makeCloud();
  const A = mkUser('qa-user-a'), B = mkUser('qa-user-b');
  cloud.users = [A, B]; cloud.lastUser = A;
  cloud.seedProfile(A.id); cloud.seedProfile(B.id);
  const { ctx, page, errs } = await newCloudPage(browser, cloud);
  await plant(ctx, A);
  await page.goto(baseUrl + '/', { waitUntil: 'domcontentloaded' });
  await enterApp(page);
  let st = await waitState(page, s => s.cloud === true, 12000);
  check('C0 account A cloud session live', st && st.cloud === true, JSON.stringify(st));

  /* A composes an unsaved draft with private notes. */
  await openDrawer(page);
  await pickMed(page, 'TB-500');
  await fillDraft(page, { dose: '2.5', notes: 'A PRIVATE NOTE - cycle day 12', time: '6:27', meridiem: 'PM' });
  const draftA = await readDraft(page);
  check('C0 A draft captured faithfully (med + owner + meridiem)',
    !!draftA && draftA.med === 'tb500' && draftA.owner === A.id && draftA.meridiem === 'PM' && draftA.notes === 'A PRIVATE NOTE - cycle day 12',
    JSON.stringify(draftA));

  /* Close the drawer, then sign out via the REAL UI path. */
  await closeDrawer(page);
  await page.evaluate(() => document.querySelector('#navVault')?.click());
  await page.waitForTimeout(1200);
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /SIGN OUT|LOG OUT/i.test(x.textContent || '') && x.getBoundingClientRect().width > 0); b?.click(); });
  await page.waitForTimeout(900);
  await page.evaluate(() => { const o = document.querySelector('#signOutOverlay'); const b = o ? [...o.querySelectorAll('button')].find(x => /SIGN OUT/i.test(x.textContent || '')) : null; b?.click(); });
  await page.waitForTimeout(1500);
  const soCheck = await page.evaluate(() => ({ cloud: window.GN?.state?.cloud }));
  if (soCheck.cloud) { await page.evaluate(() => { try { window.GN?.signOut(); } catch (_) {} }); await page.waitForTimeout(1200); }

  const draftAfterOut = await page.evaluate(() => sessionStorage.getItem('gn_shot_draft_session_v1'));
  check('C1 sign-out purges the session draft (storage layer)', draftAfterOut === null, String(draftAfterOut).slice(0, 120));

  /* The carrier snapshot: the form itself, read behind the landing
   * screen before anyone else signs in. */
  const carrier = await readForm(page);
  check('C2 session boundary resets the drawer form state (med/dose/notes/select/module draft)',
    carrier.med !== 'TB-500' && carrier.dose !== '2.5' && carrier.notes !== 'A PRIVATE NOTE - cycle day 12' && !carrier.selectVal && carrier.moduleDraft === null,
    JSON.stringify(carrier));

  /* B signs in on the same tab; the drawer must open pristine. */
  await loginInPage(page, cloud, B);
  st = await waitState(page, s => s.cloud === true && s.accountKey === B.id, 14000);
  check('C2 account B cloud session live', !!(st && st.cloud), JSON.stringify(st));
  await openDrawer(page);
  const formB = await readForm(page);
  const noteAnywhere = await page.evaluate(() => (document.querySelector('#logOv')?.innerText || '').includes('A PRIVATE NOTE'));
  check('C2 B drawer opens pristine (no A med/dose/notes, placeholder med, no module draft)',
    formB.med !== 'TB-500' && formB.dose === '' && (formB.notes === '' || formB.notes == null) && !formB.selectVal && formB.moduleDraft === null && !noteAnywhere,
    JSON.stringify(formB) + ' noteInDom=' + noteAnywhere);

  /* C3a — Back-path probe: close via history back, reopen, re-check. */
  await page.evaluate(() => { history.back(); });
  await page.waitForTimeout(900);
  await openDrawer(page);
  const formBBack = await readForm(page);
  check('C3 Back-path reopen under B stays pristine',
    formBBack.med !== 'TB-500' && formBBack.dose === '' && !formBBack.selectVal && formBBack.moduleDraft === null,
    JSON.stringify(formBBack));
  await closeDrawer(page);

  /* C3b — reload boundary: B's session restores from storage; the
   * drawer must still open pristine (no draft exists for B). */
  await replant(ctx, B);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3500);
  await page.evaluate(() => { try { window.GN_ONBOARDING?.dismiss(); } catch (_) {} });
  st = await waitState(page, s => s.cloud === true && s.accountKey === B.id, 14000);
  check('C3 reload restores B session (identity asserted, not assumed)', !!(st && st.accountKey === B.id), JSON.stringify(st));
  await openDrawer(page);
  const formBReload = await readForm(page);
  check('C3 reload under B stays pristine',
    formBReload.med !== 'TB-500' && formBReload.dose === '' && !formBReload.selectVal && formBReload.moduleDraft === null,
    JSON.stringify(formBReload));

  /* C4 — positive control: B's OWN draft restores fully after reload.
   * Every field the draft contract touches: med, dose, notes, time,
   * meridiem, and one side-effect checkbox. */
  await pickMed(page, 'GHK-Cu (Injectable)');
  await page.evaluate(() => { const cb = document.querySelector('#logOv input[type="checkbox"]'); if (cb && !cb.checked) cb.click(); });
  await fillDraft(page, { dose: '3.5', notes: 'B PRIVATE NOTE', time: '9:15', meridiem: 'PM' });
  const draftB = await readDraft(page);
  const seChosen = draftB?.sideEffects || [];
  check('C4 B draft captured faithfully (med + owner + all fields)',
    !!draftB && draftB.owner === B.id && draftB.med === 'ghk_cu_injectable' && draftB.medLabel === 'GHK-Cu (Injectable)' && draftB.dose === '3.5' && draftB.notes === 'B PRIVATE NOTE' && draftB.time === '9:15' && draftB.meridiem === 'PM',
    JSON.stringify(draftB));
  await closeDrawer(page);
  await replant(ctx, B);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3500);
  await page.evaluate(() => { try { window.GN_ONBOARDING?.dismiss(); } catch (_) {} });
  st = await waitState(page, s => s.cloud === true && s.accountKey === B.id, 14000);
  check('C4 reload restores B session (identity asserted)', !!(st && st.accountKey === B.id), JSON.stringify(st));
  const diag = await page.evaluate(() => ({
    draftRaw: (sessionStorage.getItem('gn_shot_draft_session_v1') || 'NULL').slice(0, 160),
    doseBeatStart: document.body.dataset.gnFcDoseStart || null,
    cu: window.CU?.id || null
  }));
  console.log('C4 post-reload diagnostics:', JSON.stringify(diag));
  await openDrawer(page);
  const diag2 = await page.evaluate(() => ({
    draftRaw: (sessionStorage.getItem('gn_shot_draft_session_v1') || 'NULL').slice(0, 80),
    doseBeatStart: document.body.dataset.gnFcDoseStart || null
  }));
  console.log('C4 post-open diagnostics:', JSON.stringify(diag2));
  const formB2 = await readForm(page);
  check('C4 owner draft restores FULLY after reload (med/dose/notes/time/meridiem/side effects)',
    formB2.med === 'GHK-Cu (Injectable)' && formB2.dose === '3.5' && formB2.notes === 'B PRIVATE NOTE' && formB2.time === '9:15' && formB2.meridiem === 'PM' && seChosen.every(v => formB2.checkedSe.includes(v)),
    JSON.stringify(formB2) + ' expectedSe=' + JSON.stringify(seChosen));
  await closeDrawer(page);

  /* C5 — cloud→local boundary: sign out, continue locally on the same
   * tab (landing → boot → THIS DEVICE), and the local session's drawer
   * must open pristine. */
  await page.evaluate(() => { try { window.GN?.signOut(); } catch (_) {} });
  await page.waitForTimeout(1500);
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => (x.textContent || '').trim() === 'ENTER THE GRID' && x.getBoundingClientRect().width > 0); b?.click(); });
  /* The boot sequence lands on the auth screen; the device-only button
   * enters the local session (legal was accepted at plant time). Poll
   * for it instead of assuming a fixed boot duration. Entry is only
   * counted once the app screen is actually visible: clearSession
   * already leaves state at cloud=false/accountKey='local' on the
   * landing screen, so state alone would "detect" a local session
   * that was never entered. */
  let stLocal = null;
  for (let i = 0; i < 40 && !stLocal; i++) {
    await page.evaluate(() => { const b = document.querySelector('#gnDeviceBtn'); if (b && b.getBoundingClientRect().width > 0) b.click(); });
    await page.waitForTimeout(700);
    const s = await stateOf(page);
    const appVisible = await page.evaluate(() => { const a = document.getElementById('app'); return a && getComputedStyle(a).display !== 'none'; });
    if (s && s.cloud === false && s.accountKey === 'local' && appVisible) stLocal = s;
  }
  await page.evaluate(() => { try { window.GN_ONBOARDING?.dismiss(); } catch (_) {} });
  const localLive = !!stLocal;
  if (localLive) {
    await openDrawer(page);
    const drawerOpen = await page.evaluate(() => document.querySelector('#logOv')?.classList.contains('active'));
    const formLocal = await readForm(page);
    check('C5 local session drawer opens pristine after cloud sign-out',
      drawerOpen && formLocal.med !== 'GHK-Cu (Injectable)' && formLocal.dose !== '3.5' && formLocal.notes !== 'B PRIVATE NOTE' && !formLocal.selectVal && formLocal.moduleDraft === null,
      'drawerOpen=' + drawerOpen + ' ' + JSON.stringify(formLocal));
    await closeDrawer(page);
  } else {
    check('C5 local session reachable after cloud sign-out', false, 'app not in local mode');
  }

  check('C6 zero pageerrors across the boundary drive', errs.length === 0, JSON.stringify(errs.slice(0, 3)));
  await ctx.close();
}

/* ── DRIVE D — G3: migration retry after a failed ownership claim ─── */
async function enterLocalUI(page, baseUrl) {
  await page.goto(baseUrl + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3500);
  const tapText = async (txt) => { for (const b of await page.$$('button')) { const t = (await b.textContent() || '').trim(); if (t === txt && await b.isVisible()) { const bx = await b.boundingBox(); await page.touchscreen.tap(bx.x + bx.width / 2, bx.y + bx.height / 2); return true; } } return false; };
  await tapText('ENTER THE GRID'); await page.waitForTimeout(1000);
  await tapText('More sign-in options'); await page.waitForTimeout(1000);
  const dev = await page.$('#gnDeviceBtn'); const db = await dev.boundingBox(); await page.touchscreen.tap(db.x + db.width / 2, db.y + db.height / 2); await page.waitForTimeout(1000);
  for (const id of ['#gnLegalModalTerms', '#gnLegalModalResearch']) { const cb = await page.$(id); const bx = await cb.boundingBox(); await page.touchscreen.tap(bx.x + 7, bx.y + 7); await page.waitForTimeout(250); }
  await page.waitForFunction(() => { const b = document.getElementById('gnLegalModalAgree'); return b && !b.disabled; }, null, { timeout: 8000 });
  const ag = await page.$('#gnLegalModalAgree'); const ab = await ag.boundingBox(); await page.touchscreen.tap(ab.x + ab.width / 2, ab.y + ab.height / 2);
  await page.waitForFunction(() => { const a = document.getElementById('app'); return a && getComputedStyle(a).display !== 'none'; }, null, { timeout: 20000 });
  await page.waitForTimeout(900);
  await page.evaluate(() => { try { window.GN_ONBOARDING?.dismiss(); } catch (_) {} });
  await page.waitForTimeout(600);
}

async function localShot(page) {
  await openDrawer(page);
  await page.evaluate(() => { const trig = document.querySelector('#cpShotMedVal')?.closest('.cp-select-trigger'); if (trig && !trig.classList.contains('open')) trig.click(); });
  await page.waitForTimeout(700);
  await page.evaluate(() => { [...document.querySelectorAll('#cpShotMedDrop .cp-option')].filter(e => e.textContent.trim() === 'BPC-157').sort((a, b) => b.getBoundingClientRect().width - a.getBoundingClientRect().width)[0]?.click(); });
  await page.waitForTimeout(900);
  await page.evaluate(() => { const i = document.querySelector('#sDose'); i.focus(); i.value = '0.5'; i.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.waitForTimeout(400);
  await page.evaluate(() => document.querySelector('#logOv .gn-shot-fire')?.click());
  await page.waitForFunction(() => { const s = document.querySelector('#gnShotStep2'); return s && s.getBoundingClientRect().height > 0; }, null, { timeout: 9000 }).catch(() => {});
  await page.waitForTimeout(500);
  await page.evaluate(() => { const c = document.querySelector('#logOv #modalZonePicker button'); c?.click(); });
  await page.waitForTimeout(500);
  await page.evaluate(() => document.querySelector('#logOv .gn-shot-fire')?.click());
  await page.waitForTimeout(2000);
}

async function driveMigrationRetry(browser, baseUrl) {
  console.log('\n── D: migration retry after failed claim (G3) ──');
  for (const leg of ['fault', 'control']) {
    const cloud = makeCloud();
    const A = mkUser('qa-user-a'), B = mkUser('qa-user-b');
    cloud.users = [A, B]; cloud.lastUser = A;
    cloud.seedProfile(A.id); cloud.seedProfile(B.id);
    const { ctx, page, errs } = await newCloudPage(browser, cloud);
    await enterLocalUI(page, baseUrl);
    await localShot(page);
    const localRecs = await page.evaluate(() => window.getAllShots().map(s => ({ id: s.id, med: s.med, dose: s.dose })));
    check(`D0[${leg}] local record seeded through the real UI`, localRecs.length === 1, JSON.stringify(localRecs));

    if (leg === 'fault') {
      await page.evaluate(() => { const orig = Storage.prototype.setItem; window.__origSetItem = orig; Storage.prototype.setItem = function (k, v) { if (String(k).includes('gn_local_cloud_owner_v1')) throw new DOMException('quota', 'QuotaExceededError'); return orig.call(this, k, v); }; });
    }
    await loginInPage(page, cloud, A);
    let st = await waitState(page, s => s.cloud === true, 14000);
    await page.waitForTimeout(1500);
    const mark1 = await page.evaluate(() => localStorage.getItem('gn_local_cloud_owner_v1'));
    const remote1 = cloud.remoteShots(A.id);

    if (leg === 'fault') {
      const statusNow = await page.evaluate(() => window.GN?.state?.cloudStatus);
      const toastTxt = await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 1500));
      check('D1 fault leg: claim failure -> LOCAL_BACKUP, zero uploads, owner mark absent',
        statusNow === 'LOCAL_BACKUP' && remote1.length === 0 && mark1 === null,
        `status=${statusNow} remoteA=${remote1.length} mark=${JSON.stringify(mark1)}`);
      check('D1 fault leg: the toast promises a sign-in retry', /sign in again to retry/i.test(toastTxt), (toastTxt.match(/.{0,60}sign in again.{0,40}/i) || ['no match'])[0]);

      /* Retry: fault cleared, sign out, sign in as A again. */
      await page.evaluate(() => { if (window.__origSetItem) Storage.prototype.setItem = window.__origSetItem; });
      await page.evaluate(() => { try { window.GN?.signOut(); } catch (_) {} });
      await page.waitForTimeout(1200);
      await loginInPage(page, cloud, A);
      st = await waitState(page, s => s.cloud === true, 14000);
      await page.waitForTimeout(2500);
      const remote2 = cloud.remoteShots(A.id);
      const mark2 = await page.evaluate(() => localStorage.getItem('gn_local_cloud_owner_v1'));
      const status2 = await page.evaluate(() => window.GN?.state?.cloudStatus);
      check('D2 retry leg: next sign-in claims AND migrates the stranded record',
        remote2.length >= 1 && mark2 === A.id && status2 === 'CLOUD_SYNCED',
        `remoteA=${remote2.length} mark=${JSON.stringify(mark2)} status=${status2}`);

      /* Exactly once: a third sign-in must not duplicate the upload. */
      await page.evaluate(() => { try { window.GN?.signOut(); } catch (_) {} });
      await page.waitForTimeout(1200);
      await loginInPage(page, cloud, A);
      st = await waitState(page, s => s.cloud === true, 14000);
      await page.waitForTimeout(2500);
      const remote3 = cloud.remoteShots(A.id);
      check('D2 retry is exactly-once (third sign-in uploads no duplicate)', remote3.length === remote2.length, `remoteA=${remote3.length} after third sign-in vs ${remote2.length}`);

      /* The record is not lost locally either. */
      await page.evaluate(() => { try { window.GN?.signOut(); } catch (_) {} });
      await page.waitForTimeout(1500);
      const localKept = await page.evaluate((id) => { try { return (JSON.parse(localStorage.getItem('gn_local_shots') || '[]')).some(r => r.id === id); } catch (_) { return false; } }, localRecs[0].id);
      check('D3 migrated record still present in the local namespace (not lost)', localKept === true, 'gn_local_shots lookup');
    } else {
      check('D5 control leg: healthy first claim migrates immediately',
        remote1.length >= 1 && mark1 === A.id, `remoteA=${remote1.length} mark=${JSON.stringify(mark1)}`);
    }

    /* B inherits nothing on either leg. */
    await page.evaluate(() => { try { window.GN?.signOut(); } catch (_) {} });
    await page.waitForTimeout(1000);
    await loginInPage(page, cloud, B);
    st = await waitState(page, s => s.cloud === true, 14000);
    await page.waitForTimeout(1500);
    const bShots = await page.evaluate(() => window.getAllShots().map(s => ({ id: s.id, dose: s.dose })));
    const inherited = localRecs.length > 0 && bShots.some(s => s.id === localRecs[0].id);
    check(`D4[${leg}] account B inherits nothing`, !inherited && cloud.remoteShots(B.id).length === 0, 'B shots=' + JSON.stringify(bShots));
    check(`D6[${leg}] zero pageerrors`, errs.length === 0, JSON.stringify(errs.slice(0, 3)));
    await ctx.close();
  }
}

/* ── runner ────────────────────────────────────────────────────────── */
(async () => {
  const argUrl = process.argv[2];
  const { server, url } = argUrl ? { server: null, url: argUrl } : await serveDist();
  const browser = await chromium.launch({ executablePath: await browserPath(), args: ['--no-sandbox'] });
  try {
    await driveDraftBoundary(browser, url);
    await driveMigrationRetry(browser, url);
  } finally {
    await browser.close();
    if (server) server.close();
  }
  const failed = results.filter(r => !r.ok);
  console.log(`\n== v8.1 browser drives: ${results.length - failed.length}/${results.length} PASS ==`);
  process.exit(failed.length ? 1 : 0);
})().catch(error => { console.error('HARNESS ERROR', error); process.exit(2); });
