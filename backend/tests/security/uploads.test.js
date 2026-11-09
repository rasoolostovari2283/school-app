/**
 * File and media access regression tests (Phase 0 safety net).
 *
 *   F9 — publicly served uploads, unauthenticated media streaming and
 *        unauthenticated upload/processing.
 */
const { test, expectFailure, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { setupHarness, teardownHarness, resetDatabase } = require('../support/harness');
const { get } = require('../support/http');
const { BACKEND_DIR, UPLOAD_DIR } = require('../support/env');
const { VIDEOS, VIDEO_FIXTURE_FILE } = require('../fixtures/twoSchools');

const STATIC_UPLOAD_NAME = 'phase0-static-fixture.txt';

/** The video streaming route reads from `backend/uploads`, not from UPLOAD_DIR. */
const VIDEO_UPLOAD_DIR = path.join(BACKEND_DIR, 'uploads');

let baseUrl;

before(async () => {
  ({ baseUrl } = await setupHarness());

  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  fs.writeFileSync(path.join(UPLOAD_DIR, STATIC_UPLOAD_NAME), 'phase 0 fixture\n');

  fs.mkdirSync(VIDEO_UPLOAD_DIR, { recursive: true });
  fs.writeFileSync(path.join(VIDEO_UPLOAD_DIR, VIDEO_FIXTURE_FILE), 'phase 0 fixture\n');
});

after(async () => {
  for (const [dir, name] of [[UPLOAD_DIR, STATIC_UPLOAD_NAME], [VIDEO_UPLOAD_DIR, VIDEO_FIXTURE_FILE]]) {
    try {
      fs.unlinkSync(path.join(dir, name));
    } catch {
      /* best effort */
    }
  }

  await teardownHarness();
});

beforeEach(async () => {
  await resetDatabase();
});

test('[F9] GET /uploads/<file> must require authentication', async () => {
  const res = await get(baseUrl, `/uploads/${STATIC_UPLOAD_NAME}`);

  assert.equal(
    res.status,
    401,
    `uploads must not be world-readable, got ${res.status}`,
  );
});

test('[F9] GET /api/v1/videos/stream/<file> must require authentication', async () => {
  const res = await get(baseUrl, `/api/v1/videos/stream/${VIDEO_FIXTURE_FILE}`);

  assert.equal(
    res.status,
    401,
    `media streaming must require authentication, got ${res.status}`,
  );
});

test('[F9] POST /api/v1/videos/convert-pptx must require authentication', async () => {
  // A real multipart body, so the request gets past the upload middleware and
  // reaches the conversion handler. Reaching the handler at all proves the
  // endpoint is reachable without credentials.
  const form = new FormData();
  form.append(
    'file',
    new Blob([Buffer.from('phase 0 pptx fixture')], {
      type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    }),
    'phase0-fixture.pptx',
  );

  const res = await fetch(`${baseUrl}/api/v1/videos/convert-pptx`, {
    method: 'POST',
    body: form,
  });

  assert.equal(
    res.status,
    401,
    `the pptx conversion endpoint must require authentication, got ${res.status}`,
  );
});

test('[F9] GET /api/v1/videos/:id/stream must require authentication', async () => {
  const res = await get(baseUrl, `/api/v1/videos/${VIDEOS.b}/stream`);

  assert.equal(
    res.status,
    401,
    `media streaming must require authentication, got ${res.status}`,
  );
});
