# Architecture & Technical-Debt Register — EduConnect @ 838b5b2

Each item: ID · domain · location · why it matters · suggested direction.

---

## AR-01 — Single-file multi-tenant SQLite: no real tenant boundary at the storage layer
**Location:** `backend/src/config/database.js` (SQLite better-sqlite3), migration `001/012`, `dbMaintenance.js`,
`docker-compose.yml` (volume `./educonnect.db`).
**Why:** All tenant isolation is a convention (`users.school_id`) — permissions logic is scattered per-route
(see AR-04). This is the root design driver of SEC-DATA-001 (whole-DB backups), several cross-tenant tests
in `tests/security`, and the blast radius of any future SQL bug.
**Direction:** per-school DB files (or at minimum a row-level tenant gate library with the composite unique index)
and clearly separate "global" tables.

---

## AR-02 — The new AI pipeline crosses its trust boundary twice
**Location:** `ai.routes.js:45-56` (commit accepts anything), `paperToDigital.service.js` (extraction
server→client, review→client, commit←client), `postProcessExtractedItems` (needs_review unused downstream).
**Why:** "Human-in-the-loop" is implemented as *data labels*, not *enforcements*; extraction trust is implicit and
silently re-buys the client.
**Direction:** keep extraction packets server-side (short TTL), sign at commit, and treat review as a mandatory
attribute checked at commit. Make the engine explicit (deterministic vs Gemini) and stop silently falling back.

---

## AR-03 — The default "dual engine" is a single engine with a speck of dead code
**Location:** `paperToDigital.service.js` 24–30, 62–99; `@google/genai` missing from all `node_modules`.
**Why:** The cloud engine can never run in this checkout; operators will read the `engine_used` JSON and think
Gemini is alive. Conservative "feasibility" numbers are hard-coded (0.93/0.79), so the honesty theater
(`feasibility_assessment`) reports machine-generated confidence.
**Direction:** delete or gate the Gemini path on bundle resolution, and compute confidence from measured validation
rates, not constants.

---

## AR-04 — Authorization is a scattering of per-route guards instead of a consistent tenant/ownership layer
**Location:** per-module `assert*` in `middleware/auth.js` (assertSameSchool 52–64, assertOwnsClass 74–120) plus
many ad-hoc `req.user.school_id` comparisons inside routes (finance 432–443).
**Why:** every new route is a coin flip — some check ownership (native gradebook `/scores`, 192–198), some don't
(AI commit gradesheet 491, roster → school_y only, backup endpoints → role only, callback-verify → role only).
This is why the recent security phases had to ratchet one module at a time. The one truly consistent test
(`lint-unscoped-query`) only watches raw-SQL `where({id:…})` patterns, not the guard discipline.
**Direction:** a repository/class policy: all resource lookups by external id go through `assertOwnsClass`/`assertSameSchool`
or fail CI (extend the ratchet lint to search for `where({'…id': req.params.`).

---

## AR-05 — Backup/maintenance subsystem is env-blind and artifact-oriented
**Location:** `dbMaintenance.js` (constants 14–16, 51–84, 118–140, 145–166), `app.js` 239–279.
**Why:** `DB_PATH` hardcodes `backend/educonnect.db` and is used verbatim in tests/CI too; backup files land next to
the app and are served via authenticated route. Downtime windows and "download the whole DB" are the same gesture.
**Direction:** env-aware paths; crypted off-box backups; coarse-grained downloads (per-school dumps).

---

## AR-06 — No committed lockfile and dual manifest drift
**Location:** root `package.json` workspaces vs `backend/package.json` (different majors for express/multer/
helmet/joi/rate-limit/bcrypt) plus single `bun.lock` at root.
**Why:** CI cannot reproduce the dependency graph; npm audit is impossible (ENOLOCK); the Node scripts in CI
assume a package layout that drifts.
**Direction:** single manifest world (or at least a committed lockfile per workspace) + `npm ci` + `osv-scanner`
step.

---

## AR-07 — Secret hygiene lives in two contradictory places
**Location:** `dev-server.js` 7–8 (committed dev JWTs), `.env.example` empty, `.gitignore` excludes `.env`,
Docker/compose reference `.env`.
**Why:** env-less starts fail safe today for `NODE_ENV`, but JWT fall back to the *published* default; commit
history shows the same class of problem (deploy scripts renewing env from a committed `.env.example` is what
keeps producing real secrets in scripts — review `Deploy-Windows-Server.ps1`).
**Direction:** fail-fast missing-secret checks and baked-in secrets auditing in CI (git-secrets/gitleaks pattern,
esp. `JWT`, `SECRET`, `API_KEY`, `123456`).

---

## AR-08 — API robustness gaps across modules
**Location:** `persianNormalizer` (globals mutation), `errorHandler` (leaks stack in non-prod), `cache.js`,
`localCaptcha.js`.
**Why:** several still trust client-supplied shape; the error handler path returns `messageEn` fallback that can
leak internal phrasing, and the "not found" handlers default to 404 generically which makes reseller/customers
debug blind.
**Direction:** centralized validation DTO + a consistent error envelope (code, traceId, message) with an
ops-only debug flag.

---

## AR-09 — Frontend session storage: tokens in `localStorage`
**Location:** `frontend/src/lib/api.js` 148–189, `frontend/src/lib/socket.js` 24–30, `stores/authStore.js`.
**Why:** persistence across tabs is convenient but any `dangerouslySetInnerHTML`/script breach leaks both tokens
in plain; refresh rotation is good, but the refresh token is equally in plain.
**Direction:** httpOnly, `SameSite=Strict` cookie (paired with the CORS fix in SEC-CORS-001) or IndexedDB with a
transient-bearing CSRF ring when that is not feasible.

---

## AR-10 — Audio/video and socket surfaces share one long-lived bus with no per-room authorization
**Location:** `backend/src/socket.js` (710 lines), `messages/message.service.js` call sites.
**Why:** socket handlers mostly rely on the HTTP-level role; room operations (`join`, `message`, `calls`) are not
uniformly re-checked per event — the auth middleware only runs during connection upgrade.
**Direction:** per-room policy checks at each event entry, and separate socket namespaces for classroom/streaming.

---

## AR-11 — Deployment pipeline: no artifact signature/integrity checks; APK updater trusts repo files
**Location:** `app.js:227-237` (`download-apk`), `frontend/src/components/system/AutoUpdateChecker.js` 45–75,
`Deploy-Windows-Server.ps1`.
**Why:** the update path is fetch-and-run; mitm/tamper on the APK or an inside-commit would auto-deploy a
rogue build to the mobile client.
**Direction:** sign the APK, pin version/hash checks in app updater, serve over the pinned upgrade CDN.

---

## AR-12 — Monitoring & telemetry blind spots
**Location:** `app.js` (morgan dev log only), no metrics, no structured error tracking; `audits` table exists but
informational only.
**Why:** availability incidents (disk, sqlite lock, doS) have no proactive signal; rate limiters are global per IP,
not per subject.
**Direction:** health-check metrics (db size, backup age, upload disk headroom), watchdog for WAL/checkpoint,
and per-account rate assessment.
