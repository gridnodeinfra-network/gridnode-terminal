#!/usr/bin/env node

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.resolve(__dirname, '../supabase/functions/_shared/webauthn.ts'), 'utf8');
const match = source.match(/export async function mintSessionTokens[\s\S]*?\n}\n/);
assert.ok(match, 'mintSessionTokens implementation was not found');
const executable = match[0].replace(/^export async function mintSessionTokens.*\n/, 'async function mintSessionTokens(admin, sessionClient, email) {\n');
const mintSessionTokens = new Function(`${executable}\nreturn mintSessionTokens;`)();
const rateMatch = source.match(/export async function checkRateLimit[\s\S]*?\n}\n/);
assert.ok(rateMatch, 'checkRateLimit implementation was not found');
const rateExecutable = rateMatch[0].replace(/^export async function checkRateLimit.*\n/, 'async function checkRateLimit(admin, bucket, max, windowMs) {\n');
const checkRateLimit = new Function(`${rateExecutable}\nreturn checkRateLimit;`)();
const decodeMatch = source.match(/export function base64UrlToBytes[\s\S]*?\n}/);
assert.ok(decodeMatch, 'base64UrlToBytes implementation was not found');
const decodeExecutable = decodeMatch[0]
  .replace('export ', '')
  .replace('(value: string): Uint8Array', '(value)');
const base64UrlToBytes = new Function(`${decodeExecutable}\nreturn base64UrlToBytes;`)();
const authenticationSource = fs.readFileSync(path.resolve(__dirname, '../supabase/functions/webauthn-authenticate-verify/index.ts'), 'utf8');

(async () => {
  const calls = [];
  const admin = {
    auth: {
      admin: {
        async generateLink(input) {
          calls.push(['generateLink', input]);
          return {
            data: {
              properties: {
                action_link: 'https://example.test/verify?token=opaque&type=magiclink',
                hashed_token: 'hashed-token-from-gotrue',
                verification_type: 'magiclink',
              },
            },
            error: null,
          };
        },
      },
    },
  };
  const sessionClient = {
    auth: {
      async verifyOtp(input) {
        calls.push(['verifyOtp', input]);
        return {
          data: { session: { access_token: 'access', refresh_token: 'refresh' } },
          error: null,
        };
      },
    },
  };

  assert.deepEqual(await mintSessionTokens(admin, sessionClient, 'qa@example.test'), {
    access_token: 'access',
    refresh_token: 'refresh',
  });
  assert.deepEqual(calls, [
    ['generateLink', { type: 'magiclink', email: 'qa@example.test' }],
    ['verifyOtp', { token_hash: 'hashed-token-from-gotrue', type: 'magiclink' }],
  ]);
  assert.equal(await checkRateLimit({ rpc: async () => ({ data: null, error: new Error('database unavailable') }) }, 'qa', 5, 1000), false);
  assert.deepEqual([...base64UrlToBytes('AQID-v8')], [1, 2, 3, 250, 255]);
  assert.match(authenticationSource, /credentialPublicKey:\s*base64UrlToBytes\(credentialRow\.public_key\)/);
  assert.match(authenticationSource, /const sessionClient = createClient/);
  assert.match(authenticationSource, /const \{ error: counterError \}/);
  assert.match(authenticationSource, /if \(!audited\) return text\("audit unavailable", 500\)/);

  console.log('webauthn-session OK · generated token hash exchanged for a Supabase session');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
