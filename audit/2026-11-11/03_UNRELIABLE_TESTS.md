# Unreliable / Misleading Tests — EduConnect @ 838b5b2 (re-audited 2026-11-11)

Scope: `backend/tests/**` (19 files: `security/`×11, `smoke/`×5, `ci/`×1, fixtures,
support). Suite as shipped: **145 tests, 145 pass / 0 fail / 0 skipped**, `~4.3 s`
(Node v24.16.0, two independent runs this session incl. `npm test` exit 0).
Each item below was re-read at line level this session unless attributed to the
test-infrastructure subagent's full-file inventory (their per-file test census is
cited as *[subagent]*).

## R1 — Green test *locks in* SEC-AI-001 (fabricated-data commit pipeline)
`backend/tests/security/extended-findings.test.js:555–633`
`[Iran-EdTech-PaperToDigital] … commits human-verified rows`.
Plain `test(...)`: imports two fabricated Persian fixture rows via `/school/sida/import`
(559–571), extracts a gradesheet (574–589) **including the honest-feasibility
assertions**, then asserts `POST /api/v1/ai/paper-to-digital/commit` returns **201**
with `committed_count: 2` (600–601), and commits a fabricated *exam* into a live quiz as
201 with a `quiz_id` (622–632).
- Why misleading: the name advertises "human-verified"; nothing in the request carries
  any review flag — the test *proves the vulnerable pipeline works end-to-end and then
  celebrates it*. The `feasibility_assessment.mandatory_human_in_the_loop: true` assertion
  (587) hard-codes the theatre (`needs_review` is never enforced server-side at commit).
- Any correct fix (packet signing / review gate) turns this red — good as a gate, but no
  reviewer reading the suite would infer a vulnerability exists from a green check.

## R2 — Green test *locks in* SEC-FIN-001 (self-settlement)
Same file `:635–695` `[Iran-EdTech-Shaparak-SMS]`.
Calls `callback-verify` with `{authority: <client-known>, card_pan: '…', status: 'OK'}`
and asserts **200**, receipt shape, ref id `SHP-…`, masked PAN (669–679); the only
"security" assertion is that the *same* installment double-settles to 409 (682–689)
— which enshrines "settlement = database write" as correct behavior.
- The test exercises neither a bank nor a verifier; authority is simply echoed back
  (app side `finance.routes.js:498,511`). A real server→server verification design will
  flip this red.

## R3 — Green tests *lock in* the SEC-AUTH-001 identity oracle
`backend/tests/security/auth.test.js:319–368` and `backend/tests/smoke/auth.test.js:84–91`.
Both actually exercise `/auth/parent-login` with the fixture's exact student code and
assert **200 with the student's identity** (`student.id`, `accessToken`) as a *happy path*.
- They do document the phase-0 *mitigations* properly (partial code → 401 at 303–317;
  existing parent display name/phone/student_code never rewritten at 346–367 — these two
  are genuine regression value), but they simultaneously pin the dangerous property
  (unauthenticated 200 + PII disclosure + verified account creation) as the *expected*
  outcome. A fix that adds custody proof/rate-limiting/scope breaks them — intended —
  but nothing in the suite names the dangerous half.

## R4 — Status-only denial assertions (blast-radius ambiguity)
`backend/tests/support/assertions.js:20–40` — `expectCrossTenantDenied` asserts **only
`res.status`** (default 403; only optional `expectedStatus`), no body-set no
identifier-leak checks beyond the smashed `expectNoLeak` (51–61). Used across several
`security/*.test.js` files *[subagent census]*.
- A 403 tells you *denied*, not *why* or *what didn't leak*; a 500 from an unrelated bug
  (e.g. R7's missing export) maps cleanly onto the same assertion as "safely denied".
  Example walking the line: `extended-findings.test.js:77–88` (`[A23]`) is itself a
  triple status-403 on backups/audit-logs — meaningful for role enforcement but silent on
  the actual SEC-DATA-001 cross-tenant scope gap.
- Also brittle-by-equality *[subagent: finance/auth/communication tests assert exact
  Persian error strings]* — cosmetic message edits flip red.

## R5 — Socket "absence" tests can *never* fail for infrastructure reasons
`backend/tests/security/socket.test.js:58–71` `waitForEvent(...)` resolves **`null` on
timeout** (`:69`). The suite's negative-authorization tests assert exactly that null:
an unauthenticated join must not receive `init_class_state` (128–134), a school-A teacher
must not join a school-B room (152–162, `[F8]`).
- Consequence: if the socket server didn't boot, the event name changed, the backend 500s
  on join, or the network black-holes the frame, each of these tests still passes.
  The negative property is verified by construction rather than by signal. (Positive
  state-receiving tests on the same helper are fine — they fail loudly on null.)

## R6 — DB bootstrap error is swallowed into a query-less stub
`backend/src/config/database.js:7–26` — `knex(knexConfig[environment])` in try/catch
forwards *any* failure (bad dialect, missing file, invalid creds) into a chainable in-memory
mock (`createChain`, all methods no-ops) with a console.warn.
- Every consumer importing `db` gets a silently-different db module; any test that keeps
  passing with empty results could be passing against the stub. (In practice the suite's
  harness boots the real per-process file first, so this is a robustness trap more than a
  live contaminator today; the risk is real for CI machines with mis-set NODE_ENV.)
  Bonus offender *[subagent]*: `errorHandler` path leaks `messageEn` internals and
  auth middleware treats cookie `accessToken=` as equal-trust (see SEC-CORS-001) — no test
  asserts on either.

## R7 — Chained/fixture state that silently rewrites reality
- Same-process suite order & fixture mutability *[subagent]*: `[A3]` identity-protection
  tests depend on `a-parent` existing from the fixture; reset is per-*file*, not per-test
  for the seeded fixtures `beforeEach(resetDatabase())` re-migrates, but rows written by
  earlier tests inside one file (e.g. created parents) persist across tests in that file —
  the D1 username-clear scenario is reproducible precisely because the suite can mutate.
- `uploads.test.js:19,29–30` materializes a fixture file inside the **committed**
  `backend/uploads/` (the video-stream route reads exactly there) and only best-effort
  deletes it in `after()` (`:33–40`); a failed run leaves untracked pollution in a
  versioned directory. The suite's correctness therefore depends on a committed path
  outside the test double-tree (`UPLOAD_DIR`).
- `socket.test.js` also leaves sockets/timeouts `unref`'d (`:69`) — on tight CI, silent
  process-exit instead of hang.

## R8 — The prior audit's central test claim is factually wrong (correct before remediation)
`audit/2026-11-10/06_TESTING_VERIFICATION.md:19–22`, `03_FUNCTIONAL_BUGS.md:109–119`
(FW-TEST-001), `07_REMEDIATION_ROADMAP.md` (Phase 1.4 + "Definition of done" ¶2), and
`01_EXECUTIVE_SUMMARY.md:53–55` all assert the suite contains "deliberately
`expectFailure`-wrapped tests" documenting intended-vulnerable behavior that the next
phase should "flip".
- Verified this session: `grep "expectFailure("` over `backend/tests` → **0 call sites**;
  the only definition is the polyfill `tests/support/env.js:35–51`, which itself never
  executes on Node ≥22 (`nodeTest.expectFailure` exists natively — Node here is v24.16.0),
  exported at `env.js:59` to nobody; nine files destructure it from `require('node:test')`
  without calling it.
- The named tests (`:555`, `:635`) are plain tests. **Remediation consequence:** there
  is nothing to "flip"; the workflows must *rewrite* R1/R2/R3 assertions into fixed-rule
  tests, and the FW-TEST-001 → roadmap conversion step is inapplicable as written.

## R9 — What the suite genuinely covers (to be fair)
The inventory *[subagent, 19 files]* also shows the ratchet working as designed for the
merged-phase findings: A1–A4, F11 core, Arch-P1 checks all green with real assertions
(exact-code parent lookup, is_active gate, display-name rejection, session revocation);
uploads MIME/role checks, announcement/academic cross-tenant role denials, schedule
and live-settings secret stripping. These are NORMAL tests on positive invariants and
remain trustworthy as regression gates.

## R10 — Coverage gaps that make "145/145 green" overconfident
- No shipped test covers: SEC-AUTH-002's seeded `123456` login path (fixture password
  `Fixture#2026!` at `fixtures/twoSchools.js:18` deliberately never exercises the seed),
  the SEC-DATA-001 cross-tenant backup scope (only role rejection, R4), callback-verify
  *bank-side* verification (R2), review-enforcement of AI commits (R1), the
  username-less user crash *as a regression gate* (D1 was only harness-verified, no
  committed test reproduces it), and Gemini-prompt validation (SEC-AI-002).
- `npm audit` equivalent absent from CI (`backend-tests.yml:44`), so dependency drift is
  invisible to the suite (SEC-DEP-001).
