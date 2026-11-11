# Improvement Roadmap — EduConnect Architecture

Small-team scoped; **no microservices, no new infra categories** (explicitly). Every item is an in-place structural or hygiene change with an acceptance gate. Sequenced by exposure (see risks R-xx in `ARCH-04`). Est = dev-weeks for 1 experienced dev; deps are other items/CI/test assets only.

Legend: S ≤ 1 wk · M 1–2 wks · L 2–4 wks. Tying refs: ARCH-01 §, R-# risks, SEC- audit crosses.

---

## Phase 0 — Stop the bleeding (integrité & operability) — weeks 1–3

These are surgical, single-PR-able, high-exposure fixes. Several *must* land before Phase 1 data-migration work is even safe to test.

| # | Item | Actions (smallest real fix) | Est | Deps / Acceptance |
|---|---|---|---|---|
| P0-1 | Settle-path transactions (R-01) | wrap `verify-installment` (:184–208) and `callback-verify` (:427–471) in `db.transaction` + a status-machine guard (`pending\|submitted` → `verified)`; assert `status!=='verified'` inline in tx, not after (removes the crash window at a stroke) | S (3–5 d) | tests exist for 409 path; acceptance: kill-node mid-settle in staging leaves `submitted`-mark intact & repairable |
| P0-2 | **authority/idempotency** (R-01) | composite unique `(authority)` on `tuition_installments`; callback handler rejects dedupe by authority, not by installment only | S–M | migration 018a; acceptance: double-callback sweep test (2 calls 200-first-409-second, balance monotonic) |
| P0-3 | **fail-closed DB boot** (R-05) | replace stub `config/database.js:7–26` with require-fails-fast + `process.exit(1)` during boot (before route mount, emitting a config failure); keep a *dev-only* in-memory escape hatch behind `NODE_ENV=test` explicitly (never in prod) | S | harness unchanged (real DB already used); acceptance: broken DSN ⇒ app stops instead of silent empty |
| P0-4 | **CORS + cookie posture** (R-06, SEC-CORS-001 ÷ SEC-AUTH-001 cousin) | (a) `origin` allowlist from `FRONTEND_URL` at `app.js:92–98`; (b) choose ONE: Bearer-only OR httpOnly-SameSite-Strict cookie; (c) align `auth.js:11–29` and `socket.js` CORS to the same decision; (d) add CSRF token for cookie-mode mutating calls (double-submit simple header) | M | frontend `api.js:29–` attach change; acceptance: evil-origin preflight refused; cookie-less 401s; socket handshake verified end-to-end by existing socket suite |
| P0-5 | **rate-limit holes** (SEC-AUTH-001, R-06) | add `/auth/parent-login` to authLimiter (`app.js:149–152` pattern); confirm counselor-exclusion suite still green | S | none; acceptance: >30/min parent-login ⇒ 429 while login path unaffected |
| P0-6 | **socket room hygiene** (R-08) | `webrtc_signal` (socket.js:662–670) + `screen_frame`/`live_video_frame` room-membership checks; emit `authz_error{event,reason}` on denials | S–M | acceptance: 2-class cross-signal denied + client receives error event; sockets test suite passes (false-negative note in `03_UNRELIABLE_TESTS.md` R5 addressed simultaneously: add an explicit negative event assert rather than relying on null-timeout) |
| P0-7 | **reproducible installs** (R-04, R-13) | declare `better-sqlite3` in `backend/package.json`; delete unused `sqlite3` (root); write **one** canonical install path (recommend: keep npm everywhere **or** switch all to bun — do not blend), commit `package-lock.json` (or `bun.lock` frozen) accordingly; touch CI comment | S–M | lockfile selection followed across Dockerfile/ps1/CI; acceptance: clean-VM `clone → npm ci → npm test` green (or bun equivalent) |
| P0-8 | **upload sanity gate** (R-10) | request cap at multer wrapper (e.g. reject `Content-Length` > `MAX_FILE_SIZE × files` × 1.2 and/or lower `files` to 10); disk watermark per school via `system_settings` KV + scheduled sweep plan; sharp keep (already optional) | S | acceptance: 1.5 GB-beta-request tests 400/413; plausible-per-school disk HIGH watermark test |

**Phase 0 exit gates:** security smoke (`backend npm test` 145/145) + seed-level dynamic harness 10/10 remain green; `docker compose up` produces a *migrated*, healthy, empty-seed DB with healthcheck green; evil-origin CORS probe fails; authority double-call returns 409.

---

## Phase 1 — Structural integrity (the two schemas that bite) — months 1–2

| # | Item | Actions | Est | Deps / Acceptance |
|---|---|---|---|---|
| P1-1 | **AI commit trust** (R-02, SEC-AI-001/002) | implement §ARCH-01:9(1–3): server-side packet table `ai_extraction_packets{id, user_id, mode, raw_text_hash, items jsonb, extracted_at, ttl}`; `POST /commit` accepts `{packetId, items:[{idx, decision: 'skip\|\|accept', notes}]}` + `reviewer`; enforce **no fabricated rows on empty OCR** (422); git-accept needs_review violations at server; record audit_logs entry + `feasibility` honest fields | M–L | Phase 0 harness; acceptance: forgery commits rejected, honest-review commits pass, 409/422 matrix in backend suite |
| P1-2 | **Tenant scaffolding migration (018)** (R-03) | add `school_id` to first-tier entity tables (messages..tickets..) + backfill via class-membership; create composite indexes; add **cross-tenant matrix tests** (two-school fixture × per-module can't-cross) covering the HIGH-leak paths from the security register; re-run ratchet w/ new scope/lint patterns (service files + `whereRaw` school-free selects of tiered tables) | M (2–3) | schema review + migration test fixture; acceptance: matrix tests fail-before/fix-after against HEAD; no known baseline violation grows |
| P1-3 | **PSP verification integration (dry-run first)** (R-01) | build `payments/psp.verify.js` adapter: `{authority, amount, merchantId}` server→bank verify; `callback-verify` gates settlement on successful verify; keep local dry-run mode behind env (`PSP_MODE=dry`) so tests/SaaS w/o key keep running | M (2–4, vendor contract dependent) | Phase 0-1 green; acceptance: dry-run test asserts no hand-off ever writes `verified` without a gateway 200 (harness-level test) |
| P1-4 | **financial date normalization** (R-14) | migrate all money date columns to ISO-8601 (`due_date|paid_at`), Persian display at API edge only | S | acceptance: seeded Latin/Persian mixed data compares equal after backfill |
| P1-5 | **audit truthfully + doc-truth pass** (R-15) | fix ratchet-doc phantom `assertPaymentScope` (delete or implement), set `metadata.json` engines honestly (deterministic-only until Gemini wired & schema-validated), replace `CLAUDE.md`/`AGENTS.md`/root README with one project runbook page (run/test/deploy/reset/backup/env table); `Deploy-Windows` pins refresh | S | acceptance: doc line refs resolve; metadata matches installed packages; onboarding run-through by a new-person proxy |

**Phase 1 exit gates:** forgery/uncertified commits 100 % blocked (harness), cross-tenant matrix green, ledger invariant test (`paid_amount ≤ balance ledger rev` across installments) passes in CI, backend suite ≥150 tests, runbook reviewed.

---

## Phase 2 — Velocity, operability, honesty (quarter 2) — months 2–4

| # | Item | Actions | Est | Deps / Acceptance |
|---|---|---|---|---|
| P2-1 | **frontend Page-split** (R-12) | decompose 4 files >2500 ln (`record`, `live`, `messages`, `quizzes`) into `components/auth-domain/…` per existing comment-blocks; keep client-shell & stores; no behavior delta (page tests diff) | M–L | none; acceptance pages still render identically in manual panel pass; eslint+build green |
| P2-2 | **frontend test seed** (R-12) | `vitest` + jsdom: authStore flows (login/refresh/demo/logout), `api.js` interceptor matrix (401→refresh→retry, redirect), store contract (keys), socket client singleton (optional) | M | none; acceptance: new tests run in <30 s in CI; `npm test` root script extended |
| P2-3 | **httpOnly cookie migration (frontend half)** (R-06) | replace localStorage token persistence w/ cookie set by backend on login/refresh/logout; `getSocket` stops reading localStorage in favor of cookie-transport | M | Phase 0-4 decision; persistence-compat acceptance: Capacitor app works after reinstall; web app unaffected |
| P2-4 | **observability-lite** (R-11, AR-12) | `pino` (+pretty dev) with redacted payloads; `/api/health/deep` (quick_check + canary row); count metrics to a tiny endpoint; structured error envelopes incl. traceId | M | none; acceptance: 500s carry traceId visible in client & log; health/deep used by compose healthcheck |
| P2-5 | **backup integrity** (R-11) | `BACKUP_DIR` from config; sha256 attestation file per backup; `scripts/backup-restore-drill.sh` smoke into repo + CI monthly restore invert-test; keep prune | S–M | acceptance: drill passes 10/10 with hash match |
| P2-6 | **SMS provider adapter** (R-01-sibling) | introduce `providers/sms/…` interface (dry/mock/kavenegar); keep ring buffer for dev only; dispatch row gains honest `status` enum (queued/sent/failed observed) when provider available | M | none; acceptance: two providers interchangeable in tests; finance receipt asserts only observed pipeline events |
| P2-7 | **file manifest + sweep** (R-10) | `stored_files` table on upload; scheduled orphan sweep (link path in scheduler next to backup); dedupe on content-hash | M | Phase 0-8; acceptance: orphan sweep leaves zero live-linked files; count parity in tests |
| P2-8 | **Edge pagination** (R-07) | `limit/offset` (offset to `created_before` cursor for messages/announcements/directory) + response envelope `{items,total,next_cursor}`; keep default bounded | M | none; acceptance: two-page lists stable across writes |

**Phase 2 exit gates:** page files ≤ ~1200 ln each, ≥20 frontend unit tests green, health/deep flaps 200 under DB-kill, backup drill scheduled & passing, message API cursors stable.

---

## Phase 3 — Threshold-gated capacity exits (only on measured need) — "when, not now"

All Phase 3 items are *monitoring-triggered* — if and only if observed envelope exceeds claims in §ARCH-01:13:

| # | Trigger | Exit move (pre-assessed, chunked behind env flags) | Cost if triggered |
|---|---|---|---|
| C-1 | SQLite writer saturation observed in staging (lock-wait >10 s p95) or >1 live class × >1 school sharing install | enable `DB_CLIENT=pg` path (already scaffolded knexfile:46–65): migrate schema snapshots, point health/deep to pg; no query rewrites expected (knex portability verified via tests) | M–L (2–6 wks) |
| C-2 | >1 node instances required (HA/DR) | shared redis adapter for socket.io + extract state service (`activeClassrooms` → durable store) behind config; keep scheduler as single cron master (lock row) | M–L |
| C-3 | upload/multipart DoS seen or multer upgrade proves incompatible | multer→2.x + streaming busboy behind same interface; sharp bump | S–M |
| C-4 | multi-school data pace breaks `default: limit` reads | server-side pagination already Phase-2-8 (push to cursor only needed tables) + aggregated analytics endpoints | S |

**Explicit non-goals for this horizon:** microservices (any domain split), Kubernetes, Kafka, GraphQL, full TypeScript migration, PWA/SSR re-architecture, external queue infrastructure. Each is a justified future exit (per C-1..C-4 style) or a disproportionate spend now.

---

## Sequencing logic

1. Phase 0 first: each item is a *self-contained PR* executable by one dev; dependencies are only CI/production-safe scaffolding (P0-7 before P1-2 migration rehearsal, P0-4 before P2-3).
2. Phase 1 folds the *security remediation's architectural half* (AI commit + tenant schema + PSP) — after Phase 0 P0-1/2 the ledger internals are idempotent enough for double-keyed migrations.
3. Phase 2 turns velocity (frontend, tests, observability) into durable capacity; observable via the observability gate itself.
4. Phase 3 is a "measure-then-build" plan, parked with triggers.

**Definition of done (all items):** regression tests fail-on-old/fix-on-new via `git stash` flip round-trip; deployment docs updated per affected step; CI gates (`npm test`, ratchet lint, smoke cron) remain green; no committed generated artifacts beyond logs.
