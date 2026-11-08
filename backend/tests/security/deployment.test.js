/**
 * Deployment and client-configuration regression tests (Phase 0 safety net).
 *
 * These are static assertions over committed configuration files. They never
 * print the offending value — only the file and the property that is wrong.
 *
 *   A15 — hardcoded JWT signing secrets in committed deployment configuration
 *   A16 — Android client: cleartext traffic, user-CA trust, arbitrary navigation
 *   A17 — bearer token exfiltration to an attacker-controllable origin
 *   F10 — unsafe automatic deployment (no committed lockfile)
 */
const { test, expectFailure, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { setupHarness, teardownHarness } = require('../support/harness');
const { BACKEND_DIR } = require('../support/env');

const REPO_ROOT = path.resolve(BACKEND_DIR, '..');

const read = (...segments) => fs.readFileSync(path.join(REPO_ROOT, ...segments), 'utf8');

let baseUrl;

before(async () => {
  ({ baseUrl } = await setupHarness());
});

after(async () => {
  await teardownHarness();
});

expectFailure('[A15] docker-compose.yml must not hardcode the JWT signing secrets', () => {
  const source = read('backend', 'docker-compose.yml');

  assert.doesNotMatch(
    source,
    /^\s*-\s*JWT_SECRET\s*=\s*\S+/m,
    'backend/docker-compose.yml must not contain a committed JWT_SECRET value',
  );
  assert.doesNotMatch(
    source,
    /^\s*-\s*JWT_REFRESH_SECRET\s*=\s*\S+/m,
    'backend/docker-compose.yml must not contain a committed JWT_REFRESH_SECRET value',
  );
});

test('[A15] .env.example documents the JWT signing secrets', () => {
  const source = read('backend', '.env.example');

  assert.match(source, /^JWT_SECRET=/m, '.env.example must document JWT_SECRET');
  assert.match(source, /^JWT_REFRESH_SECRET=/m, '.env.example must document JWT_REFRESH_SECRET');
});

expectFailure('[A15] Deploy-Windows-Server.ps1 must generate secrets with a CSPRNG', () => {
  const source = read('Deploy-Windows-Server.ps1');

  assert.doesNotMatch(
    source,
    /JWT_SECRET[^\n]*Get-Random/,
    'Deploy-Windows-Server.ps1 must not derive the JWT secret from Get-Random',
  );
  assert.doesNotMatch(
    source,
    /JWT_REFRESH_SECRET[^\n]*Get-Random/,
    'Deploy-Windows-Server.ps1 must not derive the JWT refresh secret from Get-Random',
  );
});

expectFailure('[F10] the dependency lockfile must be committed so `npm ci` can work', () => {
  const gitignore = read('.gitignore');

  assert.doesNotMatch(
    gitignore,
    /^package-lock\.json$/m,
    'package-lock.json must not be git-ignored (the Dockerfile runs `npm ci`)',
  );
});

expectFailure('[A16] the Android network security config must not permit cleartext traffic globally', () => {
  const source = read(
    'frontend', 'android', 'app', 'src', 'main', 'res', 'xml', 'network_security_config.xml',
  );

  assert.doesNotMatch(
    source,
    /<base-config[^>]*cleartextTrafficPermitted="true"/,
    'the base-config must not allow cleartext traffic for every domain',
  );
});

expectFailure('[A16] the Android network security config must not trust user-installed CAs', () => {
  const source = read(
    'frontend', 'android', 'app', 'src', 'main', 'res', 'xml', 'network_security_config.xml',
  );

  assert.doesNotMatch(
    source,
    /<certificates\s+src="user"\s*\/>/,
    'user-installed certificate authorities must not be trusted',
  );
});

expectFailure('[A16] the Android manifest must disable application backup and cleartext traffic', () => {
  const source = read('frontend', 'android', 'app', 'src', 'main', 'AndroidManifest.xml');

  assert.doesNotMatch(
    source,
    /android:allowBackup="true"/,
    'android:allowBackup must be false (localStorage holds the bearer tokens)',
  );
  assert.doesNotMatch(
    source,
    /android:usesCleartextTraffic="true"/,
    'android:usesCleartextTraffic must be false',
  );
});

expectFailure('[A16] the Capacitor server configuration must not allow arbitrary navigation', () => {
  const source = read('frontend', 'capacitor.config.ts');

  assert.doesNotMatch(
    source,
    /androidScheme:\s*['"]http['"]/,
    'androidScheme must be https',
  );
  assert.doesNotMatch(
    source,
    /allowNavigation:\s*\[\s*['"]\*['"]\s*\]/,
    'allowNavigation must not be a wildcard',
  );
});

expectFailure('[A17] the client must enforce an allow-list of permitted API origins', () => {
  const source = read('frontend', 'src', 'lib', 'api.js');

  assert.match(
    source,
    /(allow[-_]?list|allowed|permitted)/i,
    'frontend/src/lib/api.js must validate the API origin against an allow-list',
  );
});
