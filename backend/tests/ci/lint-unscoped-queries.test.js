/**
 * Tests for the ratcheting CI lint that detects unscoped primary-key lookups
 * in route files (`backend/scripts/lint-unscoped-queries.js`).
 */
const { test, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const lintModule = require('../../scripts/lint-unscoped-queries');

const { DEFAULT_ROOT, DEFAULT_BASELINE, collectViolations, lint } = lintModule;

let tmpRoot;
let caseCounter = 0;

/**
 * Create an isolated throwaway source tree for one test.
 * @returns {string} the `src` directory of the new tree
 */
function newSourceTree() {
  caseCounter += 1;
  const dir = path.join(tmpRoot, `case-${caseCounter}`, 'src');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** Write a route file into a throwaway source tree. */
function writeRoute(root, relativePath, source) {
  const full = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, source, 'utf8');
  return full;
}

/** Write a baseline file next to the throwaway source tree. */
function writeBaseline(name, entries) {
  const full = path.join(tmpRoot, `${name}.json`);
  fs.writeFileSync(full, `${JSON.stringify(entries, null, 2)}\n`, 'utf8');
  return full;
}

beforeEach(() => {
  if (!tmpRoot) {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'educonnect-lint-'));
  }
});

after(() => {
  if (tmpRoot) {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test('ci lint: the repository has no NEW unscoped primary-key lookups', () => {
  const result = lint({ root: DEFAULT_ROOT, baseline: DEFAULT_BASELINE });

  assert.deepEqual(
    result.newViolations.map((violation) => violation.key),
    [],
    'every unscoped lookup must either be fixed or listed in the baseline',
  );
});

test('ci lint: the baseline records the known violations', () => {
  const violations = collectViolations(DEFAULT_ROOT);
  const baseline = lintModule.readBaseline(DEFAULT_BASELINE);

  assert.ok(violations.length > 0, 'the repository is expected to still contain known violations');
  assert.ok(
    baseline.length > 0,
    'the baseline must record the known violations so the lint can ratchet',
  );

  for (const entry of baseline) {
    assert.ok(
      entry.key && entry.file && entry.route && entry.table,
      `baseline entry is incomplete: ${JSON.stringify(entry)}`,
    );
  }
});

test('ci lint: a new unscoped lookup is reported as a new violation', () => {
  const root = newSourceTree();
  writeRoute(
    root,
    path.join('modules', 'sample', 'sample.routes.js'),
    [
      "const express = require('express');",
      'const router = express.Router();',
      "const db = require('../../config/database');",
      '',
      "router.delete('/:id', async (req, res, next) => {",
      "  await db('sample_things').where({ id: req.params.id }).del();",
      '  res.json({ success: true });',
      '});',
      '',
      'module.exports = router;',
      '',
    ].join('\n'),
  );

  const baseline = writeBaseline('empty-baseline', []);
  const result = lint({ root, baseline });

  assert.equal(result.newViolations.length, 1);
  assert.match(result.newViolations[0].key, /sample\.routes\.js::DELETE \/:id::sample_things/);
  assert.equal(result.newViolations[0].table, 'sample_things');
});

test('ci lint: a handler that calls a shared assertion helper is not flagged', () => {
  const root = newSourceTree();
  writeRoute(
    root,
    path.join('modules', 'scoped', 'scoped.routes.js'),
    [
      "const express = require('express');",
      'const router = express.Router();',
      "const db = require('../../config/database');",
      "const { assertSameSchool } = require('../../middleware/requireSchoolScope');",
      '',
      "router.delete('/:id', async (req, res, next) => {",
      "  const thing = await db('scoped_things').where({ id: req.params.id }).first();",
      '  assertSameSchool(req.user, thing);',
      "  await db('scoped_things').where({ id: req.params.id }).del();",
      '  res.json({ success: true });',
      '});',
      '',
      'module.exports = router;',
      '',
    ].join('\n'),
  );

  const baseline = writeBaseline('empty-baseline-2', []);
  const result = lint({ root, baseline });

  assert.deepEqual(
    result.newViolations.map((violation) => violation.key),
    [],
    'a handler that calls an assert* helper must not be flagged',
  );
});

test('ci lint: a baseline entry that no longer reproduces is reported as stale', () => {
  const root = newSourceTree();
  const baseline = writeBaseline('stale-baseline', [
    {
      key: 'src/modules/sample/sample.routes.js::DELETE /:id::sample_things',
      file: 'src/modules/sample/sample.routes.js',
      route: 'DELETE /:id',
      table: 'sample_things',
    },
  ]);

  const result = lint({ root, baseline });

  assert.deepEqual(result.staleBaseline, [
    'src/modules/sample/sample.routes.js::DELETE /:id::sample_things',
  ]);
  assert.deepEqual(
    result.newViolations.map((violation) => violation.key),
    [],
    'a stale baseline entry must never fail the build on its own',
  );
});
