#!/usr/bin/env node
import fs from 'node:fs';
import vm from 'node:vm';

const read = file => fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8');
const fail = message => { throw new Error(message); };
const versionSource = read('js/gridnode-version.js');
const semver = versionSource.match(/semver:\s*'([^']+)'/)?.[1] || fail('Missing canonical semver');
const release = versionSource.match(/release:\s*'([^']+)'/)?.[1] || fail('Missing canonical release');
const index = read('index.html');
const sw = read('sw.js');
const native = read('js/gridnode-native.js');
const core = read('js/gridnode-core.js');
const notesSource = read('js/gridnode-whatsnew.js');
const css = read('css/daylight-nexus-pilot.css') + '\n' + read('css/gridnode-native.css');

const indexMarkers = [...index.matchAll(/\?v=(20\d{6}\.\d+)/g)].map(match => match[1]);
if (!indexMarkers.length || indexMarkers.some(marker => marker !== release)) fail('Index cache markers are not synchronized');
if (!sw.includes(`const RELEASE = '${release}'`)) fail('Service worker release is stale');
if (!native.includes(`const V = '${release}'`)) fail('Native shell release is stale');
if (!core.includes('window.GN_VERSION') || !core.includes(`|| '${semver}'`)) fail('Core semver is stale');
if (!index.includes(`GRID//NODE v${semver}`)) fail('Visible version marker is stale');
const releaseKeyCount = (notesSource.match(new RegExp("'" + release.replace('.', '\\.') + "'\\s*:", 'g')) || []).length;
if (releaseKeyCount !== 1) fail(`Latest changelog release appears ${releaseKeyCount} times`);
if (!notesSource.includes(`version: '${semver}'`)) fail('Latest changelog semver does not match app version');
if (!notesSource.includes('en: {') || !notesSource.includes('es: {')) fail('Release notes must render in English and Spanish');
const installBlock = sw.slice(sw.indexOf("addEventListener('install'"), sw.indexOf("addEventListener('message'"));
if (installBlock.includes('skipWaiting()')) fail('Install must not activate over an active session');
if (!sw.includes("event.data?.type === 'SKIP_WAITING'")) fail('User-applied update path is missing');

const requiredTokens = ['primary','secondary','muted','dim','helper','label','placeholder','disabled','accent','success','warning','error','on-dark','on-light'];
requiredTokens.forEach(token => {
  const matches = [...css.matchAll(new RegExp(`--text-${token.replace('-', '\\-')}\\s*:\\s*([^;]+)`, 'g'))].map(match => match[1].trim());
  if (!matches.length) fail(`Missing --text-${token}`);
  if (matches.some(value => /rem|em|px$/.test(value))) fail(`--text-${token} is incorrectly used as a size token`);
});

const storage = new Map();
const sandbox = {
  window: { GN_VERSION: { semver, release, title: '', date: '' } },
  document: { documentElement: { lang: 'en' }, readyState: 'loading', addEventListener() {} },
  localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, String(value)) },
  setTimeout() {}, clearTimeout() {}, console
};
sandbox.window.window = sandbox.window;
sandbox.window.document = sandbox.document;
sandbox.window.localStorage = sandbox.localStorage;
sandbox.window.setTimeout = sandbox.setTimeout;
vm.createContext(sandbox);
vm.runInContext(notesSource, sandbox);
const api = sandbox.window.GN_WHATS_NEW;
if (!api || api.currentRelease !== release || api.currentVersion !== semver) fail('Release API is stale');
if (!api.notes[release]?.en || !api.notes[release]?.es) fail('Latest bilingual notes are missing');
if (api.releases.filter(item => item === release).length !== 1) fail('Duplicate release history entry');
if (!api.shouldAutoShow()) fail('A new release must open once from a prior-version state');
storage.set('gn_whatsnew_acknowledged_release_v2', release);
if (api.shouldAutoShow()) fail('Acknowledged release must not reopen automatically');

console.log(`release-system OK · v${semver} · ${release} · ${api.releases.length} history entries · EN/ES · safe activation`);
