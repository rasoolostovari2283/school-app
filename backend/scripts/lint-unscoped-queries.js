#!/usr/bin/env node
/**
 * Ratcheting lint — unscoped primary-key lookups in route files.
 *
 * The dominant failure mode of the security report is a primary-key lookup
 * that is not bound to the caller's context:
 *
 *   await db('submissions').where({ id: submissionId }).update({ ... })
 *
 * In a route file that shape usually means `db('…').where({ id: req.params.x })`
 * with no check that the row belongs to the requester's school or to a class
 * they own. Phase 2 of the remediation roadmap introduces shared assertion
 * helpers (`assertOwnsClass`, `assertSameSchool`, `assertOwnsResource`,
 * `assertTeacherOfStudent`, `assertPaymentScope`); a handler that calls one of
 * them is considered scoped.
 *
 * This lint is a RATCHET, not a hard gate:
 *
 *   - the violations that exist today are recorded in
 *     `scripts/unscoped-queries.baseline.json`;
 *   - a NEW violation (one that is not in the baseline) fails the build;
 *   - a baseline entry that has been fixed is reported as stale, so the
 *     baseline can be tightened — but it never fails the build on its own.
 *
 * Usage:
 *   node scripts/lint-unscoped-queries.js            # check
 *   node scripts/lint-unscoped-queries.js --update   # rewrite the baseline
 *   node scripts/lint-unscoped-queries.js --root <dir> --baseline <file>
 */
const fs = require('node:fs');
const path = require('node:path');

const BACKEND_DIR = path.resolve(__dirname, '..');
const DEFAULT_ROOT = path.join(BACKEND_DIR, 'src');
const DEFAULT_BASELINE = path.join(__dirname, 'unscoped-queries.baseline.json');

/** `db('table').where({ id: req.params.x })` / `db('table').where('id', req.params.x)` */
const LOOKUP_PATTERN = /db\('([a-z_]+)'\)\s*\.\s*where\(\s*(?:\{\s*id:\s*req\.params\.(\w+)|'id',\s*req\.params\.(\w+))/g;

/** A route registration: `router.get('/path', …` */
const ROUTE_PATTERN = /router\.(get|post|put|patch|delete)\s*\(\s*'([^']*)'/g;

/** Any shared access assertion, e.g. `assertSameSchool(user, resource)`. */
const ASSERT_PATTERN = /\bassert[A-Z]\w*\s*\(/;

/**
 * Recursively collect every `*.routes.js` file below `dir`.
 *
 * @param {string} dir
 * @returns {string[]} absolute paths, sorted
 */
function collectRouteFiles(dir) {
  const found = [];
  if (!fs.existsSync(dir)) return found;

  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
        walk(full);
      } else if (entry.name.endsWith('.routes.js')) {
        found.push(full);
      }
    }
  };

  walk(dir);
  return found.sort();
}

/**
 * Split a route file into the sections between two route registrations.
 *
 * Every lookup belongs to the most recent route registration above it; a
 * lookup before the first registration belongs to the file preamble.
 *
 * @param {string} source
 * @returns {{method: string, route: string, body: string}[]}
 */
function splitIntoRouteSections(source) {
  const starts = [];
  let match;
  ROUTE_PATTERN.lastIndex = 0;
  while ((match = ROUTE_PATTERN.exec(source)) !== null) {
    starts.push({ index: match.index, method: match[1], route: match[2] });
  }

  if (starts.length === 0) {
    return [{ method: '<preamble>', route: '<preamble>', body: source }];
  }

  const sections = [];
  if (starts[0].index > 0) {
    sections.push({
      method: '<preamble>',
      route: '<preamble>',
      body: source.slice(0, starts[0].index),
    });
  }

  for (let i = 0; i < starts.length; i += 1) {
    const end = i + 1 < starts.length ? starts[i + 1].index : source.length;
    sections.push({
      method: starts[i].method,
      route: starts[i].route,
      body: source.slice(starts[i].index, end),
    });
  }

  return sections;
}

/**
 * Find every unscoped primary-key lookup in the route files below `root`.
 *
 * @param {string} root - directory that contains the `modules/` tree
 * @returns {{key: string, file: string, method: string, route: string, table: string, param: string, line: number}[]}
 */
function collectViolations(root = DEFAULT_ROOT) {
  const violations = [];
  const modulesDir = path.join(root, 'modules');

  for (const file of collectRouteFiles(modulesDir)) {
    const source = fs.readFileSync(file, 'utf8');
    // The path is always relative to the scanned root (e.g. `src/modules/...`),
    // so the baseline keys stay stable regardless of where the tree lives.
    const relative = path
      .join(path.basename(root), path.relative(root, file))
      .split(path.sep)
      .join('/');

    for (const section of splitIntoRouteSections(source)) {
      // A handler that calls a shared assertion helper is scoped by definition.
      if (ASSERT_PATTERN.test(section.body)) continue;

      LOOKUP_PATTERN.lastIndex = 0;
      let match;
      while ((match = LOOKUP_PATTERN.exec(section.body)) !== null) {
        const line = source.slice(0, source.indexOf(section.body) + match.index).split('\n').length;
        const table = match[1];
        const param = match[2] || match[3];

        violations.push({
          key: `${relative}::${section.method.toUpperCase()} ${section.route}::${table}`,
          file: relative,
          method: section.method.toUpperCase(),
          route: section.route,
          table,
          param,
          line,
        });
      }
    }
  }

  return violations;
}

/** Read the baseline file. A missing or unreadable baseline is an empty one. */
function readBaseline(baselinePath = DEFAULT_BASELINE) {
  try {
    const parsed = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Run the lint.
 *
 * @param {object} [options]
 * @param {string} [options.root]
 * @param {string} [options.baseline]
 * @returns {{newViolations: object[], staleBaseline: string[], violations: object[]}}
 */
function lint(options = {}) {
  const root = options.root || DEFAULT_ROOT;
  const baselinePath = options.baseline || DEFAULT_BASELINE;
  const baseline = readBaseline(baselinePath);

  const violations = collectViolations(root);
  const baselineKeys = new Set(baseline.map((entry) => entry.key));

  const newViolations = violations.filter((violation) => !baselineKeys.has(violation.key));
  const foundKeys = new Set(violations.map((violation) => violation.key));
  const staleBaseline = baseline
    .map((entry) => entry.key)
    .filter((key) => !foundKeys.has(key));

  return { newViolations, staleBaseline, violations };
}

/** Write the baseline file from the current violations. */
function updateBaseline(options = {}) {
  const root = options.root || DEFAULT_ROOT;
  const baselinePath = options.baseline || DEFAULT_BASELINE;
  const violations = collectViolations(root);

  const entries = [];
  const seen = new Set();
  for (const violation of violations) {
    if (seen.has(violation.key)) continue;
    seen.add(violation.key);
    entries.push({
      key: violation.key,
      file: violation.file,
      route: `${violation.method} ${violation.route}`,
      table: violation.table,
    });
  }

  fs.writeFileSync(baselinePath, `${JSON.stringify(entries, null, 2)}\n`, 'utf8');
  return entries;
}

/* ── CLI ────────────────────────────────────────────────────────────────── */

function parseArgs(argv) {
  const options = { update: false };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--update') options.update = true;
    if (argv[i] === '--root') options.root = argv[++i];
    if (argv[i] === '--baseline') options.baseline = argv[++i];
  }
  return options;
}

function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.update) {
    const entries = updateBaseline(options);
    process.stdout.write(
      `unscoped-queries: baseline updated with ${entries.length} known violation(s)\n`,
    );
    return 0;
  }

  const { newViolations, staleBaseline, violations } = lint(options);

  if (staleBaseline.length > 0) {
    process.stdout.write(
      `unscoped-queries: ${staleBaseline.length} baseline entr(y/ies) no longer reproduce.\n`
      + '  Run `node scripts/lint-unscoped-queries.js --update` to tighten the baseline.\n',
    );
    for (const key of staleBaseline) {
      process.stdout.write(`  - ${key}\n`);
    }
  }

  if (newViolations.length > 0) {
    process.stderr.write(
      `\nunscoped-queries: ${newViolations.length} NEW unscoped primary-key lookup(s).\n`
      + 'A route handler must bind the addressed row to the caller. Add a shared\n'
      + 'assertion helper (assertOwnsClass / assertSameSchool / assertOwnsResource /\n'
      + 'assertTeacherOfStudent / assertPaymentScope) to the handler, or extend the\n'
      + 'baseline deliberately.\n\n',
    );
    for (const violation of newViolations) {
      process.stderr.write(
        `  ${violation.file}:${violation.line}  ${violation.method} ${violation.route}`
        + `  ->  db('${violation.table}').where({ id: req.params.${violation.param} })\n`,
      );
    }
    return 1;
  }

  process.stdout.write(
    `unscoped-queries: OK (${violations.length} known violation(s), all in the baseline)\n`,
  );
  return 0;
}

if (require.main === module) {
  process.exitCode = main();
}

module.exports = {
  DEFAULT_ROOT,
  DEFAULT_BASELINE,
  collectRouteFiles,
  splitIntoRouteSections,
  collectViolations,
  readBaseline,
  lint,
  updateBaseline,
};
