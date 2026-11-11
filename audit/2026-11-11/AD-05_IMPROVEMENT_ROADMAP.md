# AD-05 — Prioritized Improvement Roadmap

Independent read-only assessment @ `main` 838b5b2 · 2026-11-11
Countermeasures for AD-04 (risk register); each item names the risk it retires, the smallest
reasonable change, complexity, and dependencies. Assumption: a **small team** (1–3 engineers)
on a school-scale product. Nothing here introduces services, extra infra, or rewrites —
the architecture's center of gravity (one Node process, SQLite by default, Next dashboard) is
treated as a *constraint to keep*, with documented exceptions to revisit (IMP-16b).

---

## Priority tiers

| Tier | Meaning |
|------|---------|
| **P0** | Retire a P0 defect first: integrity/confidentiality/broken-build. Smallest diffs win. |
| **P1** | Structural defects & sharpness — schedule next 2–4 weeks. |
| **P2** | Good-weather debt — pull in as cycles allow. Never a tiny risk, always a tiny fix. |

---

## P0 — stop the bleeding (each ≤ 1 engineer-day)

### IMP-01 · Settlement atomicity + idempotency + invariants (retires AR-03, AR-10, AR-11, shrinks SEC-FIN-001 blast radius)

- **What**: wrap the settle handler in `db.transaction(async trx => …)`; add
  unique `(ledger_id, payment_authority, tracking_number)` (callback) and
  `(ledger_id, installment_number)` (installments); add `CHECK (paid_amount <= total_amount
  AND balance >= 0)`; route *both* settlement paths (`pay-installment`, `callback-verify`)
  through one shared `confirmPayment(...)` primitive holding the idempotency key; deduplicated
  receipt/SMS dispatch after commit.
- **Complexity**: S — knex transaction + two unique indexes + one CHECK add. All confined to
  `finance.routes.js` and one migration.
- **Dependencies**: none. CI first (IMP-02) makes it verifiable end-to-end.
- **Design decision embedded**: choose **"confirmed payment is a ledger event"** as the
  record-of-truth (projection rebuildable from installments + events), and leave
  `tuition_ledgers.paid_amount/balance` as cached projections for 90 days (single-tenant
  scale still favors the read; it becomes derivable, not sacred).

### IMP-02 · Lockfile + working build gate + reproducible install (retires AR-16)

- **What:** commit root `package-lock.json` (npm workspace) or per-app locks; change Docker
  `npm ci --omit=dev` (now valid) and CI install from the lock; add a *frontend build gate*
  (needed to keep the SPA's own ship grounded; not optional because it is cheap).
- **Complexity:** S (0.5 d), but the CI changes touch deployment procedure — treat as a PR
  with a dry-run on a throwaway DigitalOcean instance.
- **Dependencies:** none. This item precedes anything that wants reproducible CI.
- **Note:** if npm workspaces resolution fights with native-binary installs, per-app locks
  are the acceptable fallback — the rule is *one source of truth per artifact*, not which.

### IMP-03 · Backup correctness: verification + per-tenant export + drill (retires AR-06/AR-20)

- **What:** after each copy, open the backup (SQLite `PRAGMA integrity_check`, or read-back
  of the WAL tail before copy), emit a pass/fail line into the logs; make the db path + output
  dir env-driven (kill the env-blind paths); ship a one-page restore drill ("how to restore
  school X alone via per-school `SELECT` dump") and run it once dry.
  *Smallest acceptable version:* verification + env paths + drill doc. *Next:* per-school
  `sqlite3 .dump` export when school #2 exists.
- **Complexity:** S–M (0.5–1 d for the first version).
- **Dependencies:** IMP-02 (CI to prove the copy step); the per-tenant export decision is
  tied to AR-06's "keep single-file + logistics" conclusion — document it once, in the
  deployment README, rather than rebuilding.

### IMP-04 · Real observability floor: one structured logger + one living health endpoint (retires AR-19)

- **What:** replace the 28 `console.*` sites with a tiny JSON logger (3-file internal util,
  keep `console` in tests); rewrite `GET /api/health` to hit the DB (`SELECT 1` +
  `PRAGMA integrity_check` on SQLite / `pg_isready` on PG) and return 200/503 — the
  registry probe that missed a dead DB for months ends. Add a `request_id` to the access
  log only (no full APM).
- **Complexity:** S (1 d) — 30+ small replacements but mechanical.
- **Dependencies:** none; health endpoint should be wired into whatever uptime probe
  already exists (even a weekly cron + status page counts).

### IMP-05 · Realtime auth parity — relight the deny signals (retires AR-08, the realtime half of SEC-SOCKET-001..004)

- **What:** (1) pad every silently-`return`ed event behavior with a uniform
  `{ok:false,e:"denied|…"}` response so abuse is distinguishable from a dead feature;
  (2) re-check `revoked_tokens`/token_version on the events that move state (media feed,
  signalling), not just at handshake; (3) room GC on `isLive` latch expiry (1-minute TTL)
  to kill zombie classrooms.
- **Complexity:** M (1–2 d, contained in `socket.js` + `classroomPersistence.js`).
- **Dependencies:** none — it's the same secrets/config as IMP-04/06, no order conflict.

### IMP-06 · AI `needs_review` enforcement at commit (retires AR-13, most of SEC-AI-001)

- **What:** server-side commit (§ `paperToDigital.service.js:461–598`) refuses items not
  carrying a `human_reviewed:true` stamp written by the review UI step; add the
  `ai_import_review` row (who/when/outcome) so the *review event is auditable* — currently
  there is no place for it; keep `imported_from` lineage but require it non-null on import.
- **Complexity:** S–M (0.5–1 d; mostly a schema change + guard, plus freezing the review UI
  flow that currently forwards items unverified).
- **Dependencies:** none, but the UI owner must agree the review gate is real (not
  pre-ticked by the AI step) — that's the *social* dependency, not technical.

---

## P1 — structural sharpness (next 2–4 weeks)

### IMP-07 · Extract `finance.service.js` from 530-LOC routes (retires AR-02's finance-defect arm)

- Extract settlement/ledger/installment logic into a real service with the transaction/unit
  seam that IMP-01 depends on; routes shrink to validation + auth + one call each.
  Afterward: *finance is testable without Express, and the P0 invariants have a home.*
- **Complexity:** M (1–2 d with IMP-01 staged first or inline).
- **Dependencies:** IMP-01 (do the seam and the invariant together).

### IMP-08 · Module public-API lint (retires AR-01's ungoverned edge, green-lights future refactors)

- One CI script in the `lint-unscoped-queries` family: a declared allowlist
  (e.g. `ai → {sida, quiz}` explicitly allowed; everything else flagged), enforced in CI so
  the graph can't silently rot. Also add services + socket handlers to the existing
  unscoped-query ratchet's gaze (currently routes-only, which is how AR-05's ceiling got
  coined).
- **Complexity:** S (0.5 d to write; the *settling* of allowlist entries is the real table
  session, count on half a day of squinting).
- **Dependencies:** none. The script itself is the governance.

### IMP-09 · Parent custody verification primitive (retires AR-07, the protocol root of SEC-AUTH-001/FW-AUTH-001)

- One design session: decide **what "proof" is in this product** — a school-admin
  verification step on `parent_student_links` (recommended) vs an SMS/out-of-band code —
  then implement as a middleware-adjacent "verified-claim" flow: linking request → admin
  approval or OOB step → only then flip `is_verified`. Move the two divergent custody
  implementations (login flow + signup flow) onto it; audit-log the *link-establishment*.
- **Complexity:** M (2–3 d; one small table/state column + two flows converged).
- **Dependencies:** a **product decision** (which custody proof), so schedule it as a
  design-then-code, not a code item. Nothing else blocks on it.

### IMP-10 · Role→operation registry + wire `financial_officer` to settle (retires AR-09, and after IMP-01 the bias, the SEC-FIN-001 shape)

- Build a declarative map (`{operation, allowedRoles}`) and an internal `assertCan(actor,
  operation, scope)` used by route guards; replace the ~40 literal `authorize(...)` **arrays
  at call sites that grant money/identity operations first**, then extend site by site.
  Explicitly grant `settle:*` → `financial_officer/admin` (today: nothing grants it).
- **Complexity:** M (2 d wind-up; the registry is hours, pinning sites to it is the day).
- **Dependencies:** IMP-01's service seam (IMP-07) makes finance the active area; ratchet
  file additions to the lint family help.

---

## P2 — good-weather debt (pull in cycles; each is a small, bounded fix)

### IMP-11 · Engine parity & migration discipline (retires AR-04)
Metadata policy: mark each migration `engine: sqlite|pg|both` in a comment; where PG differs
(index rebuild vs table), add a note and keep the reaction file in-repo. No code, no behavior
change — this is the *decision* that 016 in-place rewrites were acceptable at school scale
and must be re-visited at multi-school.

### IMP-12 · Ratchet extension to services/sockets/backup copies (retires AR-05's ceiling)
Move the unscoped-query lint's file glob from `routes.js` to `src/**` *for write* queries
and add `dbMaintenance.js` to the tracked list so tenant-oblivious paths become build
failures, not PR-ary discoveries. Small follow-up to IMP-08, do in its wake.

### IMP-13 · Analytics N+1 collapse (retires AR-21)
One-pass `SELECT class_id, count(*), avg(...) FROM gradebook > GROUP BY` replacing the
per-class loop in `analytics.routes.js:41–70`; cache at 60 s given AR-22's manual
invalidation. 0.5 d, pure win at any roster size.

### IMP-14 · Cache invalidation helper + documentation (retires AR-22)
Single `cache.invalidateForWrite(scope, patternFamily)` used by every writer so a missed
`delByPattern` becomes a lint-visible gap; one paragraph documenting the per-process cache
ceiling (second process = broken cache, don't).

### IMP-15 · Upload path unification + dep-days (retires AR-15)
Route every FS touch (`videos` streaming included) through `config.upload.dir`; two call
sites change, one comment added; set a calendar task to patch `multer` + `busboy` when the
maintainer ships, and drop the dead `includes('')` decode branch. Half a day total.

### IMP-16 · Deployment honesty pass (retires AR-17/AR-18)
(a) move JWT secrets out of `dev-server.js` (env-inject; do **not** delete — the seed loop
stays for local dev but dies without `NODE_ENV=development`), (b) add a three-line systemd
unit (or PM2 ecosystem) to the repo so "single process" is *stated and supervised*, (c) one
paragraph in README: what dies when the process dies.

### IMP-17 · Document the single-file + single-process acceptance (companion to AR-06/AR-17)
Write it down: the *decision* that one SQLite file holds all schools today, what the
trigger to split per-tenant is (school #2 / compliance request / single-tenant restore
need), and the room/process ceiling (one process = no sticky routing). Pure prose + one
architecture note; prevents a future dual of AR-17 being discovered by accident.

### IMP-18 · Frontend guardrails (retires AR-23)
Fastest valuable shard: add a `test` script running 5–8 smoke tests over `authStore`,
`api.js` origin whitelist, and socket init (the three files that leak between surfaces),
then add the vitest/jest harness; *exceptionally* not a route-by-route coverage spree.
Next-then: consider one App-Router boundary for the 44 `use client` components → keep at
2 stores, but shape context only where the dashboard actually shares state.

### IMP-19 · Opportunistic typing of the finance/auth boundary (retires AR-25's worst instance)
Convert `authStore.js`, `api.js`, and the finance dashboard pages to TypeScript *first*,
proving the boundary contracts (route shapes + token shapes) without touching the 50k
body. This is the *bounded* slice; full-conversion is explicitly out of AD-05 scope.

### IMP-20 · Docs/CI truth-in-advertising (retires AR-24)
One PR: README prereqs match reality (SQLite default; `DB_CLIENT=pg` opt-in; Redis unused);
delete the `expectFailure`/Node-24.14 sentences from README + CI comment (0 call sites
verified in-session); remove dead `REDIS_*` from `.env.example` (or adopt it — see
IMP-16b); state the test runtime honestly.

---

## Explicitly NOT recommended (small-team constraint, per client instruction)

- **Microservices or module-service split beyond finance.** Adds deployment topology to fix
  a *boundary* problem that IMP-08 (a lint/allowlist) solves at 1% of the cost.
- **DB-per-tenant or schema-per-school.** Arithmetic says one SQLite file is the right
  baseline at 1–2 schools; IMP-14's per-tenant export + trigger criteria cover the way up.
- **Redis adapter for the room plane.** The room model is honest for one process (IMP-05
  retrofit is the fix that matters); a pub/sub here buys nothing until process N exists —
  and IMP-17 documents the trigger to reconsider.
- **Full TypeScript conversion.** One bounded boundary slice (IMP-19) proves the contracts;
  wholesale conversion is a 3–5 week program for a team of 2 — DEFECT-class value, DEBT-class
  cost; parked, with a review point at the 1-year mark.
- **Foreign observability suites (APM/tracing).** A JSON logger + living health endpoint
  (IMP-04) covers the failure-detection floor the team can actually run this quarter; APM is
  the *next* conversation, not this one.

---

## Sequencing snapshot

```
Week 1:  IMP-02 (lockfile/ci) → IMP-01 (+IMP-07 seam) → IMP-05 (socket parity)
Week 2:  IMP-03 (backup verify/export) → IMP-04 (observability floor) + IMP-06 (AI review)
Week 3–4: IMP-08 (API lint) → IMP-09 (parent custody, design-first) → IMP-10 (RBAC registry)
Ongoing: IMP-11..IMP-20 as cycles allow; IMP-16/17 shipped with any deploy rehearsal
```

**Estimated total:** P0 ≈ 5–6 engineer-days · P1 ≈ 5–6 · P2 ≈ 8–10 (optional order) —
deliberately **no item exceeds 3 days**, and every P0 item is independently shippable.
*(The design decisions — single-file tenancy trigger, custody proof, needs_review
semantics, cache ceiling — are the only things that can push an item out; they are marked
"in design" rather than silently at risk.)*
