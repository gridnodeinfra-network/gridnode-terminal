#!/usr/bin/env node

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const repo = path.resolve(__dirname, '..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'gridnode-bundle-'));

try {
  fs.mkdirSync(path.join(temp, 'js'), { recursive: true });
  fs.mkdirSync(path.join(temp, 'scripts'), { recursive: true });
  for (const relative of [
    'js/gridnode-core.js',
    'js/gridnode-modules.js',
    'js/gridnode-app.js',
    'scripts/build-bundle.sh',
  ]) {
    const destination = path.join(temp, relative);
    fs.copyFileSync(path.join(repo, relative), destination);
  }

  const run = spawnSync('bash', [path.join(temp, 'scripts/build-bundle.sh')], {
    cwd: temp,
    encoding: 'utf8',
  });
  assert.equal(run.status, 0, `canonical build failed:\n${run.stdout}\n${run.stderr}`);

  const digest = value => crypto.createHash('sha256').update(value).digest('hex');
  const deployedArtifact = fs.readFileSync(path.join(repo, 'js/gridnode-bundle.js'));
  const rebuiltArtifact = fs.readFileSync(path.join(temp, 'js/gridnode-bundle.js'));
  assert.equal(
    digest(rebuiltArtifact),
    digest(deployedArtifact),
    'generated runtime is not reproducible from the modular source files',
  );

  console.log(`bundle-reproducibility OK · ${digest(deployedArtifact)}`);
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
