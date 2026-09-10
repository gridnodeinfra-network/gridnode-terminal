#!/usr/bin/env node
'use strict';

/*
 * Task 6 scanner-audio behavioral harness. It drives the served scanner and
 * its Web Audio boundary; it is not a source-text-only check.
 */

const { chromium } = require('playwright');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

const baseURL = process.argv[2] || 'http://127.0.0.1:4175';
const root = resolve(__dirname, '..');
const checks = [];
const failures = [];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function check(name, fn) {
  try {
    await fn();
    checks.push({ name, result: 'PASS' });
  } catch (error) {
    const message = error?.message || String(error);
    checks.push({ name, result: 'FAIL', message });
    failures.push(`${name}: ${message}`);
  }
}

async function installAudioProbe(page, mode = 'available') {
  await page.addInitScript(({ requestedMode }) => {
    const probe = { mode: requestedMode, contexts: [], oscillators: [], gains: [], filters: [], resumes: 0 };
    window.__gnScannerAudioProbe = probe;
    if (requestedMode === 'missing') {
      Object.defineProperty(window, 'AudioContext', { configurable: true, value: undefined });
      Object.defineProperty(window, 'webkitAudioContext', { configurable: true, value: undefined });
      return;
    }
    class Param {
      constructor(name) { this.name = name; this.value = 0; this.events = []; }
      setValueAtTime(value, time) { this.value = value; this.events.push({ method: 'setValueAtTime', value, time }); return this; }
      linearRampToValueAtTime(value, time) { this.value = value; this.events.push({ method: 'linearRampToValueAtTime', value, time }); return this; }
      exponentialRampToValueAtTime(value, time) { this.value = value; this.events.push({ method: 'exponentialRampToValueAtTime', value, time }); return this; }
      cancelScheduledValues(time) { this.events.push({ method: 'cancelScheduledValues', time }); return this; }
      cancelAndHoldAtTime(time) { this.events.push({ method: 'cancelAndHoldAtTime', time }); return this; }
    }
    class Node {
      constructor(kind) { this.kind = kind; this.connections = []; this.disconnects = 0; }
      connect(destination) { this.connections.push(destination); return destination; }
      disconnect() { this.disconnects += 1; this.connections = []; }
    }
    class Oscillator extends Node {
      constructor() { super('oscillator'); this.frequency = new Param('frequency'); this.detune = new Param('detune'); this.type = 'sine'; this.loop = false; this.starts = []; this.stops = []; probe.oscillators.push(this); }
      start(time = 0) { this.starts.push(time); }
      stop(time = 0) { this.stops.push(time); }
    }
    class Gain extends Node {
      constructor() { super('gain'); this.gain = new Param('gain'); probe.gains.push(this); }
    }
    class Filter extends Node {
      constructor() { super('filter'); this.frequency = new Param('frequency'); this.Q = new Param('Q'); this.type = 'lowpass'; probe.filters.push(this); }
    }
    class FakeAudioContext {
      constructor() {
        if (requestedMode === 'construct-throws') throw new Error('AudioContext unavailable');
        this.currentTime = 10;
        this.state = requestedMode.startsWith('suspended') ? 'suspended' : 'running';
        this.destination = new Node('destination');
        probe.contexts.push(this);
      }
      createOscillator() { return new Oscillator(); }
      createGain() { return new Gain(); }
      createBiquadFilter() { return new Filter(); }
      resume() {
        probe.resumes += 1;
        if (requestedMode === 'suspended-rejects') return Promise.reject(new Error('resume rejected'));
        this.state = 'running';
        return Promise.resolve();
      }
    }
    Object.defineProperty(window, 'AudioContext', { configurable: true, value: FakeAudioContext });
    Object.defineProperty(window, 'webkitAudioContext', { configurable: true, value: FakeAudioContext });
  }, { requestedMode: mode });
}

async function bootstrap(page, { stored = false } = {}) {
  await page.goto(`${baseURL}/?scanner-audio-tests=${Date.now()}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  const release = await page.evaluate(() => window.GN_VERSION?.release || '20260812.9');
  await page.evaluate(({ servedRelease, storedPreference }) => {
    localStorage.clear();
    localStorage.setItem('gn_onboarding_v1', 'complete');
    localStorage.setItem('gn.lang', 'en');
    localStorage.setItem('gn_theme_v1', 'dark');
    localStorage.setItem('gn_whatsnew_acknowledged_release_v2', servedRelease);
    localStorage.setItem('gn_session_v2', JSON.stringify({ user: { id: 'scanner-audio', email: 'scanner-audio@gridnode.local' } }));
    if (storedPreference) localStorage.setItem('gn_scanner_audio_v1', '1');
  }, { servedRelease: release, storedPreference: stored });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(900);
  const whatsNew = page.locator('#gnWhatsNewOverlay.active');
  if (await whatsNew.count()) await whatsNew.locator('.gn-whatsnew-close').click().catch(() => {});
  await page.locator('#app.active').waitFor({ state: 'visible', timeout: 10000 });
  await page.evaluate(() => window.showPage('Log'));
  await page.locator('#pageLog.active').waitFor({ state: 'visible', timeout: 10000 });
}

function audioSwitch(page) {
  return page.locator('#gnScannerAudioSwitch[role="switch"]');
}

async function requireAudioSwitch(page) {
  const control = audioSwitch(page);
  assert(await control.count() === 1, 'scanner-local audio role=switch control is missing');
  return control;
}

async function firstZonePoint(page) {
  return page.locator('#shotsRegionScanner .biotech-stage[data-view="core"] .zone-hit').first().evaluate(node => {
    const svg = node.ownerSVGElement.getBoundingClientRect();
    const [x1, y1, x2, y2] = node.dataset.zoneBounds.split(',').map(Number);
    return { x: svg.left + ((x1 + x2) / 2000) * svg.width, y: svg.top + ((y1 + y2) / 2000) * svg.height };
  });
}

async function clickFirstZone(page) {
  const point = await firstZonePoint(page);
  await page.mouse.click(point.x, point.y);
}

async function installCommitCounter(page) {
  await page.evaluate(() => {
    window.__gnScannerCommitCount = 0;
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function scannerAudioCommitCounter(key, value) {
      if (String(key).endsWith('_selectedLocation')) window.__gnScannerCommitCount += 1;
      return original.call(this, key, value);
    };
  });
}

async function storedAudioKey(page) {
  const entries = await page.evaluate(() => Object.entries(localStorage));
  const keys = entries.filter(([key, value]) => /scanner.*audio|audio.*scanner/i.test(key) && /^v?\d+|.*_v\d+$/i.test(key) && value === '1');
  assert(keys.length === 1, `scanner audio ON must persist exactly one versioned key with value 1; found ${JSON.stringify(keys)}`);
  return keys[0][0];
}

function createdOscillators(probe, startAt) {
  return probe.oscillators.slice(startAt);
}

function assertEnvelope(oscillators, minimumMs, maximumMs, cueName) {
  assert(oscillators.length > 0, `${cueName} must create native oscillator nodes`);
  for (const oscillator of oscillators) {
    assert(oscillator.loop !== true, `${cueName} must not loop`);
    assert(oscillator.starts.length === 1 && oscillator.stops.length === 1, `${cueName} oscillator must start and stop exactly once`);
    const durationMs = (oscillator.stops[0] - oscillator.starts[0]) * 1000;
    assert(durationMs >= minimumMs && durationMs <= maximumMs, `${cueName} duration ${durationMs}ms must be within ${minimumMs}-${maximumMs}ms`);
  }
}

async function withPage(browser, audioMode, fn) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'en-US' });
  const page = await context.newPage();
  await installAudioProbe(page, audioMode);
  try { await fn(page); } finally { await context.close(); }
}

async function testDefaultOff(browser) {
  await withPage(browser, 'available', async page => {
    await bootstrap(page);
    const control = await requireAudioSwitch(page);
    assert((await control.getAttribute('aria-checked')) === 'false', 'scanner audio defaults to aria-checked=false');
    assert((await control.getAttribute('aria-label')) === 'SCANNER AUDIO', 'scanner audio exposes a stable accessible name');
    assert((await control.locator('[data-scanner-sound-state]').innerText()).trim() === 'OFF', 'scanner audio defaults to an OFF state label');
    assert(await control.locator('.scanner-audio-track .scanner-audio-thumb').count() === 1, 'scanner audio renders a visible toggle track and thumb');
    assert((await page.evaluate(() => window.__gnScannerAudioProbe.contexts.length)) === 0, 'default boot must not construct AudioContext');
  });
}

async function testPersistenceAndLayout(browser) {
  await withPage(browser, 'available', async page => {
    await bootstrap(page);
    const control = await requireAudioSwitch(page);
    const box = await control.boundingBox();
    assert(box && box.width >= 44 && box.height >= 44, `390x844 scanner audio target must be at least 44px; got ${JSON.stringify(box)}`);
    assert(box && box.width <= 120, `390x844 scanner audio toggle must remain compact; got ${JSON.stringify(box)}`);
    const tabs = await page.locator('#shotsRegionScanner .scanner-mode-tabs').boundingBox();
    assert(tabs && box && (box.y + box.height <= tabs.y || tabs.y + tabs.height <= box.y || box.x + box.width <= tabs.x || tabs.x + tabs.width <= box.x), '390x844 audio control must not overlap scanner mode tabs');
    await control.click();
    assert((await control.getAttribute('aria-checked')) === 'true', 'toggle ON must expose aria-checked=true');
    assert((await control.locator('[data-scanner-sound-state]').innerText()).trim() === 'ON', 'toggle ON must expose an ON state label');
    const key = await storedAudioKey(page);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(900);
    await page.evaluate(() => window.showPage('Log'));
    const restored = await requireAudioSwitch(page);
    assert((await restored.getAttribute('aria-checked')) === 'true', 'stored 1 must restore ON presentation');
    assert((await page.evaluate(() => window.__gnScannerAudioProbe.contexts.length)) === 0, 'stored ON boot must defer AudioContext until a direct gesture');
    await restored.click();
    assert((await restored.getAttribute('aria-checked')) === 'false', 'toggle OFF must expose aria-checked=false');
    assert(await page.evaluate(audioKey => localStorage.getItem(audioKey), key) === '0', 'toggle OFF must persist 0 to the same versioned key');
  });
}

async function testAudioCuesAndThrottle(browser) {
  await withPage(browser, 'available', async page => {
    await bootstrap(page);
    const control = await requireAudioSwitch(page);
    await control.click();
    const beforeContact = await page.evaluate(() => window.__gnScannerAudioProbe.oscillators.length);
    await clickFirstZone(page);
    const afterPointer = await page.evaluate(() => window.__gnScannerAudioProbe);
    const pointerOscillators = createdOscillators(afterPointer, beforeContact);
    assert(pointerOscillators.length >= 3, 'valid pointer selection must produce a contact cue plus two-stage lock cue');
    assertEnvelope(pointerOscillators.slice(0, 1), 30, 55, 'contact cue');
    assertEnvelope(pointerOscillators.slice(1), 90, 160, 'lock cue');
    const peak = afterPointer.gains.flatMap(gain => gain.gain.events.map(event => event.value)).filter(value => typeof value === 'number');
    assert(peak.length > 0 && Math.max(...peak) <= 0.035, `audio master/envelope peak must be <= 0.035; got ${Math.max(...peak)}`);
    await page.waitForTimeout(50);
    const rapidPoint = await firstZonePoint(page);
    const beforeRapidContacts = await page.evaluate(() => window.__gnScannerAudioProbe.oscillators
      .filter(oscillator => oscillator.frequency.value === 880).length);
    await page.mouse.move(rapidPoint.x, rapidPoint.y);
    for (let index = 0; index < 8; index += 1) {
      await page.mouse.down();
      await page.mouse.up();
    }
    const afterRapidContacts = await page.evaluate(() => window.__gnScannerAudioProbe.oscillators
      .filter(oscillator => oscillator.frequency.value === 880).length);
    const rapidContacts = afterRapidContacts - beforeRapidContacts;
    assert(rapidContacts >= 1 && rapidContacts < 8, `rapid trusted pointer contacts must be deterministically throttled; created ${rapidContacts} contact voices for 8 interactions`);
  });
}

async function testDisabledNoops(browser) {
  await withPage(browser, 'available', async page => {
    await bootstrap(page);
    await requireAudioSwitch(page);
    const before = await page.evaluate(() => window.__gnScannerAudioProbe.oscillators.length);
    await page.evaluate(() => { window.GNScannerAudio.playContact(); window.GNScannerAudio.playLock(); });
    const after = await page.evaluate(() => window.__gnScannerAudioProbe.oscillators.length);
    assert(after === before, 'disabled playContact/playLock must be no-ops');
  });
}

async function testDisableCancelsScheduledLockVoices(browser) {
  await withPage(browser, 'available', async page => {
    await bootstrap(page);
    const control = await requireAudioSwitch(page);
    await control.click();
    const zone = page.locator('#shotsRegionScanner .biotech-stage[data-view="core"] .zone-hit').first();
    await zone.focus();
    await page.keyboard.press('Enter');

    const beforeDisable = await page.evaluate(() => window.__gnScannerAudioProbe);
    const lockVoices = beforeDisable.oscillators;
    assert(lockVoices.length === 2, `keyboard lock must schedule exactly two voices; got ${lockVoices.length}`);
    const contextTime = beforeDisable.contexts[0].currentTime;
    assert(lockVoices.some(voice => voice.starts[0] > contextTime), 'lock cue must include a future-scheduled second stage');

    await control.click();
    assert((await control.getAttribute('aria-checked')) === 'false', 'disable gesture must switch scanner audio OFF immediately');
    const afterDisable = await page.evaluate(() => window.__gnScannerAudioProbe);
    const cueGains = afterDisable.gains.slice(-lockVoices.length);
    assert(cueGains.length === lockVoices.length, 'each scheduled lock voice must expose its gain envelope');
    afterDisable.oscillators.forEach((voice, index) => {
      const gain = cueGains[index];
      const stoppedNow = voice.stops.some(time => time <= contextTime);
      const cancelledNow = gain.gain.events.some(event => ['cancelScheduledValues', 'cancelAndHoldAtTime'].includes(event.method) && event.time <= contextTime);
      const mutedNow = gain.gain.events.some(event => ['setValueAtTime', 'linearRampToValueAtTime', 'exponentialRampToValueAtTime'].includes(event.method) && event.time <= contextTime && event.value <= 0.0001);
      const disconnectedNow = voice.disconnects > 0 || gain.disconnects > 0;
      assert(stoppedNow || (cancelledNow && mutedNow) || disconnectedNow, `disable must stop, cancel/mute, or disconnect lock voice ${index + 1}`);
    });
    await page.waitForTimeout(60);
    assert((await page.evaluate(() => window.__gnScannerAudioProbe.oscillators.length)) === lockVoices.length, 'disable must leave no later lock tone to create or play');
  });
}

async function testStoredOnGestureUnlocksLockAudio(browser, gesture) {
  await withPage(browser, 'suspended', async page => {
    await bootstrap(page, { stored: true });
    await requireAudioSwitch(page);
    assert((await page.evaluate(() => window.__gnScannerAudioProbe.contexts.length)) === 0, `stored ON boot must construct zero contexts before ${gesture}`);
    await installCommitCounter(page);
    if (gesture === 'keyboard Enter') {
      const zone = page.locator('#shotsRegionScanner .biotech-stage[data-view="core"] .zone-hit').first();
      await zone.focus();
      await page.keyboard.press('Enter');
    } else {
      await page.locator('#shotsRegionScanner [data-stable-zone]').first().click();
    }
    const probe = await page.evaluate(() => window.__gnScannerAudioProbe);
    assert(probe.contexts.length === 1, `${gesture} may lazily create one AudioContext`);
    assert(probe.resumes === 1, `${gesture} must resume the suspended AudioContext from its real gesture`);
    assert(await page.evaluate(() => window.__gnScannerCommitCount) === 1, `${gesture} must still commit selection exactly once`);
    assert(probe.oscillators.length === 2, `${gesture} must play the two-stage lock cue after gesture unlock`);
  });
}

async function testSpoofedProgrammaticCallCannotUnlockFreshContext(browser, method) {
  await withPage(browser, 'suspended', async page => {
    await bootstrap(page, { stored: true });
    await requireAudioSwitch(page);
    assert((await page.evaluate(() => window.__gnScannerAudioProbe.contexts.length)) === 0, `stored ON boot must remain lazy before spoofed ${method}`);
    await page.evaluate(audioMethod => window.GNScannerAudio[audioMethod]({ userGesture: true }), method);
    const probe = await page.evaluate(() => window.__gnScannerAudioProbe);
    assert(probe.contexts.length === 0, `programmatic ${method} must not create AudioContext when caller spoofs userGesture=true`);
    assert(probe.resumes === 0, `programmatic ${method} must not resume AudioContext when caller spoofs userGesture=true`);
    assert(probe.oscillators.length === 0, `programmatic ${method} must not schedule audio when caller spoofs userGesture=true`);
  });
}

async function testSyntheticFallbackCannotUnlockFreshContext(browser) {
  await withPage(browser, 'suspended', async page => {
    await bootstrap(page, { stored: true });
    await requireAudioSwitch(page);
    assert((await page.evaluate(() => window.__gnScannerAudioProbe.contexts.length)) === 0, 'stored ON boot must remain lazy before synthetic fallback click');
    const trusted = await page.evaluate(() => {
      const fallback = document.querySelector('#shotsRegionScanner [data-stable-zone]');
      const event = new MouseEvent('click', { bubbles: true, cancelable: true, view: window });
      fallback.dispatchEvent(event);
      return event.isTrusted;
    });
    assert(trusted === false, 'page-dispatched fallback click fixture must be untrusted');
    const probe = await page.evaluate(() => window.__gnScannerAudioProbe);
    assert(probe.contexts.length === 0, 'synthetic untrusted fallback click must not create AudioContext');
    assert(probe.resumes === 0, 'synthetic untrusted fallback click must not resume AudioContext');
    assert(probe.oscillators.length === 0, 'synthetic untrusted fallback click must not schedule lock audio');
  });
}

async function testSyntheticPointerdownCannotUnlockFreshContext(browser) {
  await withPage(browser, 'suspended', async page => {
    await bootstrap(page, { stored: true });
    await requireAudioSwitch(page);
    assert((await page.evaluate(() => window.__gnScannerAudioProbe.contexts.length)) === 0, 'stored ON boot must remain lazy before synthetic pointerdown');
    const point = await firstZonePoint(page);
    const trusted = await page.evaluate(({ x, y }) => {
      const svg = document.querySelector('#shotsRegionScanner .biotech-stage[data-view="core"] .biotech-zones');
      const event = new PointerEvent('pointerdown', {
        bubbles: true,
        cancelable: true,
        pointerId: 207,
        clientX: x,
        clientY: y,
        pointerType: 'touch',
        isPrimary: true,
        buttons: 1
      });
      svg.dispatchEvent(event);
      return event.isTrusted;
    }, point);
    assert(trusted === false, 'page-dispatched valid pointerdown fixture must be untrusted');
    const probe = await page.evaluate(() => window.__gnScannerAudioProbe);
    assert(probe.contexts.length === 0, 'synthetic untrusted valid pointerdown must not create AudioContext');
    assert(probe.resumes === 0, 'synthetic untrusted valid pointerdown must not resume AudioContext');
    assert(probe.oscillators.length === 0, 'synthetic untrusted valid pointerdown must not schedule contact audio');
  });
}

async function testAudioFailuresDoNotBlockSelection(browser, mode) {
  await withPage(browser, mode, async page => {
    await bootstrap(page);
    const control = await requireAudioSwitch(page);
    await control.click();
    await installCommitCounter(page);
    await clickFirstZone(page);
    assert(await page.evaluate(() => window.__gnScannerCommitCount) === 1, `${mode} Web Audio must not block a committed scanner selection`);
  });
}

async function testTask4HookOwnership(browser) {
  await withPage(browser, 'available', async page => {
    await bootstrap(page);
    await page.evaluate(() => { window.__gnTask4Audio = { contact: 0, lock: 0 }; window.GNScannerAudio = { playContact() { window.__gnTask4Audio.contact += 1; }, playLock() { window.__gnTask4Audio.lock += 1; } }; });
    await clickFirstZone(page);
    assert(await page.evaluate(() => window.__gnTask4Audio.contact) === 1, 'pointer path calls playContact exactly once on valid pointer-down');
    assert(await page.evaluate(() => window.__gnTask4Audio.lock) === 1, 'selection owner calls playLock exactly once for committed pointer selection');
    const zone = page.locator('#shotsRegionScanner .biotech-stage[data-view="core"] .zone-hit').first();
    await zone.focus();
    await page.keyboard.press('Enter');
    assert(await page.evaluate(() => window.__gnTask4Audio.lock) === 2, 'selection owner calls playLock once for keyboard selection');
    await page.locator('#shotsRegionScanner [data-stable-zone]').first().click();
    assert(await page.evaluate(() => window.__gnTask4Audio.lock) === 3, 'selection owner calls playLock once for fallback selection');
  });
}

function testSourceBundleParityFixture() {
  const source = require('./read-modules-source.cjs');
  const bundle = readFileSync(resolve(root, 'js', 'gridnode-bundle.js'), 'utf8');
  const extract = (content, label) => {
    const match = content.match(/\/\* GN_SCANNER_AUDIO_CONTROLLER_V1_START \*\/([\s\S]*?)\/\* GN_SCANNER_AUDIO_CONTROLLER_V1_END \*\//);
    assert(match, `${label} must expose the mirrored GN_SCANNER_AUDIO_CONTROLLER_V1 controller fixture`);
    return match[1].replace(/\s+/g, ' ').trim();
  };
  assert(extract(source, 'readable source') === extract(bundle, 'delivery bundle'), 'source and delivery bundle audio controllers must be exactly behaviorally mirrored');
}

async function main() {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  try {
    await check('default OFF presentation defers AudioContext construction', () => testDefaultOff(browser));
    await check('390x844 toggle persists ON/OFF and restores stored 1 without boot audio', () => testPersistenceAndLayout(browser));
    await check('enabled native contact and lock envelopes stay bounded and rapid contact is throttled', () => testAudioCuesAndThrottle(browser));
    await check('disabled playContact/playLock are no-ops', () => testDisabledNoops(browser));
    await check('toggling OFF immediately cancels every active and scheduled lock voice', () => testDisableCancelsScheduledLockVoices(browser));
    await check('stored ON keyboard Enter resumes suspended lock audio and commits once', () => testStoredOnGestureUnlocksLockAudio(browser, 'keyboard Enter'));
    await check('stored ON fallback click resumes suspended lock audio and commits once', () => testStoredOnGestureUnlocksLockAudio(browser, 'fallback click'));
    await check('programmatic playLock cannot spoof userGesture=true to unlock a fresh context', () => testSpoofedProgrammaticCallCannotUnlockFreshContext(browser, 'playLock'));
    await check('programmatic playContact cannot spoof userGesture=true to unlock a fresh context', () => testSpoofedProgrammaticCallCannotUnlockFreshContext(browser, 'playContact'));
    await check('synthetic untrusted fallback click cannot unlock lock audio', () => testSyntheticFallbackCannotUnlockFreshContext(browser));
    await check('synthetic untrusted valid pointerdown cannot unlock contact audio', () => testSyntheticPointerdownCannotUnlockFreshContext(browser));
    await check('missing Web Audio cannot block scanner selection', () => testAudioFailuresDoNotBlockSelection(browser, 'missing'));
    await check('rejected AudioContext resume cannot block scanner selection', () => testAudioFailuresDoNotBlockSelection(browser, 'suspended-rejects'));
    await check('Task 4 pointer and selection hook ownership remains single-owner', () => testTask4HookOwnership(browser));
    await check('readable source and delivery bundle mirror the audio controller fixture', () => testSourceBundleParityFixture());
  } finally {
    await browser.close();
  }
  console.log(JSON.stringify({ result: failures.length ? 'RED' : 'PASS', baseURL, checks }, null, 2));
  if (failures.length) process.exitCode = 1;
}

main().catch(error => { console.error(error.stack || error); process.exit(1); });
