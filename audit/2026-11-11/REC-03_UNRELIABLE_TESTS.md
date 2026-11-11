# Unreliable / Misleading Tests — second independent pass @ 838b5b2 (2026-11-11)

Scope: `backend/tests/**` (19 files), independently re-inspected for the specific claims R1–R10
made in the same-day suite. Result: **all ten claims confirmed verbatim this pass**, and one new
observation is appended (the R10 coverage gap now has a disposable harness — but the *shipped*
suite still has the hole). Suite re-run this session: **145 tests, 145 pass / 0 fail / 0 skipped**
(≈4.1 s, Node v24.16.0).

## Re-confirmed lock-in tests (green while vulnerable)

**R1 — `extended-findings.test.js:555–633`.** Re-read. Extracts a gradesheet with Persian numerals
(574–589), asserts the honest-feasibility theatre (`mandatory_human_in_the_loop === true` at 587 —
`needs_review` is *never enforced* server side, verified at `paperToDigital.service.js:461–598`),
then commits with 201 + `committed_count: 2` (600–601) and commits an exam into a live quiz
(622–632). The test proves the pipeline end-to-end *and celebrates it*.

**R2 — `same file :635–695`.** Re-read. `[Iran-EdTech-Shaparak-SMS]` initiates a payment, receives
`authority` (665), then `callback-verify` (669–679) asserts **200** on a purely client-known
authority; the only security-adjacent assertion is 409 on double-settle (682–689). Any real
server→server verification flips this red.

**R3 — `auth.test.js:303–367` + `smoke/auth.test.js:84–91`.** Re-read. Partial code → 401 (303–317)
is genuine regression value. But `:319–331` / `:333–344` assert **200 + full student identity**
for unauthenticated exact-code requests, and `smoke` repeats it — pinning the oracle as the
*expected* outcome. Genuine value (identity non-rewrite, `:346–367`) coexists with the green-lit
dangerous half.

**R4 — `tests/support/assertions.js:20–40`, `:51–61`.** Re-read. `expectCrossTenantDenied` asserts
status only; `expectNoLeak` (51–61) is the only leak guard and is unused by the lock-in tests'
backup/audit-triplet — `extended-findings.test.js:77–88` asserts exactly 403×3 for teacher role
denial, which proves nothing about the cross-tenant scope gap and *would also pass against an
unrelated 500*.

## Harness-robustness traps (still live)

**R5 — `socket.test.js:58–71`.** `waitForEvent` resolves `null` on timeout; negative tests (F8)
can *never* fail for infrastructure reasons. Re-read this pass.

**R6 — `src/config/database.js:7–26`.** Any knex bootstrap failure is swallowed into a
no-op chainable stub. The suite's harness boots the real per-PID file first, so the trap is latent,
not live — but any consumer test running without the harness silently passes empty results.

**R7 — fixture side effects.** `uploads.test.js:29–30` writes into the **committed**
`backend/uploads/` dir and only best-effort deletes it (`:33–40`)….; same-file `beforeEach`
`resetDatabase()` re-migrates but intra-file row mutations (created parents) persist and can
contaminate later tests in the same file. Re-read this pass.

**R8 — the expectFailure narrative.** Independently re-verified again: `grep "expectFailure("`
over `backend/tests` → the only matches are the *polyfill definition itself* (`env.js:36,47`),
which on Node ≥22 never executes. **0 call sites.** The roadmap conversion step name ("flip the
expectFailure wrappers") remains inapplicable.

**R9 — what genuinely works:** ratchet tests for merged phases (A1–A4, F11, Arch-P1), MIME/role
upload checks, cross-tenant role denials. Re-inspection confirms value as regression gates for
*already-fixed* behaviour.

**R10 — still-true coverage gaps:** seeded-123456 login (now dynamically proven by our disposable
harness — *shipped suite still silent*), SEC-DATA-001 cross-tenant scope, callback-verify bank-side,
review-enforcement, `ensureUserHasUsername` 500 regression, Gemini prompt validation,
`npm audit` absent from CI (`backend-tests.yml:44`).

## New this pass

- **R11 — R4's 403-only shape bites the backup tests specifically.** Re-read `app.js:240–246`:
  the guard is a *role list* with **no `school_id` scoping at all**; a 403-to-teacher test verifies
  only the list. The finding (SEC-DATA-001) requires a 200-with-foreign-scope probe, which no
  shipped test performs. Status-only assertions created a false sense of enclosure.
- **R12 — `npm test` is green across the board (145/145 re-run) but no shipped test ever asserts
  the *new* SOCKET comprehensive negative behaviour (N-STREAM-06/08/15 classes).** Harness results
  stand as the only executable evidence for SEC-SOCKET-001/002/003/004.
