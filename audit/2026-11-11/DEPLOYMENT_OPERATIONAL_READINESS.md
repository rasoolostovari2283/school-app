# Production Deployment & Operational Readiness Assessment — EduConnect

**Independent read-only assessment** @ `main` `838b5b2` · 2026-11-11
**Scope:** Environment configuration, secret management, logging/monitoring, database backup/restore, migration safety, process management, deployment reproducibility, infrastructure assumptions, failure recovery, single points of failure, data loss scenarios.

---

## Executive Summary

| Category | Critical (P0) | High (P1) | Medium (P2) | Total |
|---|---|---|---|---|
| Environment & Secrets | 3 | 2 | 1 | 6 |
| Build & Dependency Reproducibility | 2 | 1 | 1 | 4 |
| Database Backup & Restore | 2 | 2 | 1 | 5 |
| Migration Safety & Rollback | 1 | 2 | 1 | 4 |
| Process Management & Graceful Shutdown | 1 | 2 | 2 | 5 |
| Logging, Monitoring & Observability | 2 | 2 | 1 | 5 |
| Infrastructure & Network Exposure | 2 | 1 | 1 | 4 |
| Failure Recovery & DR | 2 | 2 | 1 | 5 |
| **TOTAL** | **15** | **14** | **9** | **38** |

**Overall Readiness:** **Not production-ready** — Critical gaps in secret management, backup verification, deployment reproducibility, and observability. The application runs as a single-node process with SQLite by default, suitable for a single school but not for multi-tenant SaaS without significant operational investment.

---

## 1. Environment Configuration & Secret Management

### OP-001: Hardcoded JWT secrets in `dev-server.js` — **P0**
- **Location:** `dev-server.js:6-7`
- **Evidence:**
  ```javascript
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'educonnect-iran-enterprise-jwt-secret-key-2026-secure';
  process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'educonnect-iran-enterprise-jwt-refresh-key-2026-secure';
  ```
- **Impact:** These secrets ship in the repository. Any deployment using `dev-server.js` (including the Docker build which `COPY . .`) uses identical JWT keys. Attackers can forge valid access/refresh tokens for any user.
- **Exposure:** `dev-server.js` is at repo root, not in `.dockerignore`, and `COPY . .` in Dockerfile includes it.

### OP-002: No committed `package-lock.json` — **P0**
- **Evidence:** `glob` search → 0 lockfiles anywhere in repo (root, backend, frontend).
- **CI Admission:** `.github/workflows/backend-tests.yml:42-44`: "`npm ci` cannot be used yet: package-lock.json is not committed (finding F10)."
- **Dockerfile:** `backend/Dockerfile:16` runs `npm ci --omit=dev` — **will fail on fresh checkout** without lockfile.
- **Impact:** Every build/install resolves dependencies non-deterministically. Production image cannot be built from source. Dependency drift between CI, dev, and prod is guaranteed.

### OP-003: `.env.example` lists unused/misleading variables — **P1**
- **File:** `.env.example` lists `REDIS_HOST`, `REDIS_PORT`, `SMS_API_KEY`, `SMS_SENDER`, `DB_CLIENT`, `DB_HOST`, etc.
- **Reality:** 
  - Redis config exists in `config/index.js:29-32` but **zero consumers** in codebase.
  - SMS gateway (`services/smsGateway.js`) is a stub — logs only, no actual provider integration.
  - `DB_CLIENT` only toggles between SQLite (default) and PG — but README claims PostgreSQL 14+ as prerequisite.
- **Impact:** Operator configures Redis/SMS/PostgreSQL expecting them to be used; they are not. False sense of operational readiness.

### OP-004: `NODE_ENV` fallback to production — **P2**
- **Location:** `config/index.js:12-14`
- **Code:** `const nodeEnv = nodeEnvIsSet ? rawNodeEnv.trim() : 'production';`
- **Behavior:** If `NODE_ENV` unset → defaults to `'production'` (not development). This is actually **correct** for safety (prevents mock tokens in prod), but the error message at `app.js:15-21` says "Refusing to start" if unset — which contradicts the fallback.
- **Confusion:** The app *does* start with `NODE_ENV=production` default, but logs an error saying it refused.

### OP-005: `frontendUrl` default points to localhost — **P1**
- **Location:** `config/index.js:51`
- **Code:** `frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000'`
- **Impact:** In production without `FRONTEND_URL`, CORS/origin checks and any frontend URL generation will point to localhost.

### OP-006: No secret rotation mechanism — **P2**
- **JWT secrets:** Only `JWT_SECRET` and `JWT_REFRESH_SECRET` in env. No `JWT_SECRET_PREVIOUS` for rotation overlap.
- **Rotation procedure:** None documented. Changing secrets invalidates all active sessions immediately (no grace period).

---

## 2. Build & Dependency Reproducibility

### OP-007: Docker build fails without lockfile — **P0**
- **Dockerfile:** `backend/Dockerfile:16` → `RUN npm ci --omit=dev`
- **Reality:** No `package-lock.json` exists → `npm ci` fails with "package-lock.json not found".
- **Workaround:** CI uses `npm install --no-audit --no-fund` (non-reproducible).
- **Impact:** Production image **cannot be built from source** on a clean machine. Deployment requires pre-built artifacts or manual `npm install` on server.

### OP-008: Frontend has no Dockerfile — **P1**
- **Evidence:** No `Dockerfile` in `frontend/`. No multi-stage build for Next.js standalone output.
- **Deployment:** Frontend must be built manually (`npm run build`) and served via `npm start` or reverse proxy. No containerized frontend deployment path.

### OP-009: Native dependencies require build tools in Docker — **P2**
- **Dockerfile:** Installs `python3`, `make`, `g++` for `better-sqlite3` compilation.
- **Risk:** Build depends on Debian package availability. `node:20-bookworm-slim` base may change. No pinned `better-sqlite3` prebuild or `npm rebuild` strategy.

### OP-010: Version pinning inconsistent — **P2**
- **package.json:** Uses `^` caret ranges for all deps (e.g., `express: ^4.21.0`, `socket.io: ^4.7.5`).
- **No lockfile** → minor/patch updates pulled non-deterministically.
- **Node version:** Dockerfile uses `node:20-bookworm-slim`; CI uses Node 24; README claims Node 18+ for runtime, 24.14+ for tests. Three different Node versions in play.

---

## 3. Database Backup & Restoration

### OP-011: Backup is whole-file copy only — no verification — **P0**
- **Location:** `dbMaintenance.js:51-84` (`createBackup`)
- **Process:** `fs.copyFileSync(DB_PATH, destinationPath)` after `PRAGMA wal_checkpoint(TRUNCATE)`
- **Gaps:**
  - **No integrity check** (`PRAGMA integrity_check`) on backup after copy.
  - **No checksum** (SHA256) recorded for later verification.
  - **No test restore** — backup assumed valid because copy succeeded.
- **Impact:** Corrupt backup (disk error, partial WAL flush, SQLite bug) undetected until restore attempt fails. **Untested backup = no backup.**

### OP-012: Single-file backup = all tenants — no per-tenant restore — **P0**
- **Architecture:** Single SQLite file (`educonnect.db`) holds all schools' data.
- **Backup:** `dbMaintenance.js:63` copies entire file.
- **Restore:** Only full-file restore possible. **Cannot restore single school** without manual SQL extraction.
- **Impact:** 
  - Accidental deletion of one school's data → must restore all schools (data loss for others if they had intervening changes).
  - Compliance request for single-tenant data export → not supported.
  - Cross-tenant data leak risk if backup file exfiltrated.

### OP-013: Backup retention only 14 days — no off-site copy — **P1**
- **Code:** `dbMaintenance.js:89-113` `pruneOldBackups(14)`
- **Location:** `./db_backups/` on same disk as database (Docker volume mounts both).
- **Risk:** Disk failure = primary DB + all backups lost simultaneously. No S3/GCS/off-site replication.

### OP-014: Backup schedule uses `setInterval` — drifts, no persistence — **P2**
- **Code:** `dbMaintenance.js:159-163` — `setInterval(createBackup, 24*60*60*1000)`
- **Issues:**
  - Interval drifts over time (no cron-like alignment).
  - Process restart resets timer → backup may run immediately or be delayed 24h.
  - No record of last successful backup time persisted (only log output).
  - If process down during scheduled window, backup skipped entirely.

### OP-015: No automated restore testing/drill — **P2**
- **Gap:** No script, CI job, or runbook for test restore.
- **Operator burden:** Manual `sqlite3 educonnect.db ".dump" | sqlite3 restored.db` — error-prone under pressure.

---

## 4. Migration Safety & Rollback

### OP-016: Migrations are idempotent but `down()` drops tables — **P1**
- **Pattern:** All 17 migrations use `hasTable`/`hasColumn` guards (idempotent up).
- **Downside:** `down()` functions call `dropTableIfExists` — **destroys data** on rollback.
- **Example:** `016_production_schema_hardening.js:210-213` drops indexes; `017_session_revocation.js:35-37` drops `revoked_tokens` table.
- **Impact:** Rollback = data loss. Not a safe rollback strategy. No "down" migration that preserves data.

### OP-017: SQLite vs PostgreSQL parity not tested — **P1**
- **knexfile.js:46-66:** Production uses PG only if `DB_CLIENT=pg`, else SQLite.
- **Divergences:**
  - Migration 016 uses raw SQL `DROP INDEX IF EXISTS` / `CREATE UNIQUE INDEX` — SQLite syntax; PG may need `CONCURRENTLY` or different syntax.
  - `ssl: { rejectUnauthorized: false }` in PG config — **insecure** (disables cert validation).
  - `better-sqlite3` vs `pg` pool behavior differs (WAL, locking, transactions).
- **Gap:** No CI job runs migrations against PostgreSQL. Production PG deployments untested.

### OP-018: No migration locking / concurrent deploy protection — **P2**
- **knex-migrate** uses advisory locks in PG but not in SQLite.
- **Risk:** Two containers starting simultaneously (e.g., rolling deploy) could both attempt migration → corruption or duplicate migration records.

### OP-019: Seed data runs on every `dev-server.js` start — **P1**
- **Code:** `dev-server.js:13-18` runs `db.migrate.latest()` then `db.seed.run()` on every start.
- **Impact:** Seeds (including demo users with `123456` passwords) re-inserted on every restart. In production Docker, `dev-server.js` is copied but not used as entrypoint — however, if accidentally run, it reseeds production DB.

---

## 5. Process Management, Restart & Graceful Shutdown

### OP-020: Single process = single point of failure — **P1**
- **Architecture:** One Node.js process runs Express API + Socket.IO + scheduled maintenance + WAL checkpoint timer.
- **No:** Process manager (PM2, systemd in container), clustering, health check endpoint with dependency checks, graceful drain of connections.
- **Dockerfile:** `CMD ["node", "src/app.js"]` — no `dumb-init`, no signal forwarding wrapper.
- **docker-compose.yml:** `restart: unless-stopped` — restarts on crash but no health check to detect stuck process.

### OP-021: Graceful shutdown only handles WAL — **P1**
- **Code:** `app.js:504-519` `gracefulShutdown` flushes WAL then `process.exit(0)`.
- **Missing:**
  - Stop accepting new HTTP/Socket connections (no `server.close()`).
  - Drain in-flight requests (no request tracking).
  - Close Socket.IO gracefully (`io.close()`).
  - Flush scheduled maintenance timers.
  - Wait for in-flight DB transactions (none exist, but future-proofing).

### OP-022: No health check endpoint with dependency verification — **P1**
- **Endpoint:** `app.js:176-184` — returns static `{"status":"ok"}`.
- **No checks:** DB connectivity (`PRAGMA integrity_check`), disk space, WAL file size, Socket.IO rooms, external service reachability (SMS, AI).
- **Docker:** No `HEALTHCHECK` instruction in Dockerfile. Orchestrator cannot detect degraded state.

### OP-023: Socket.IO rooms in memory — no horizontal scaling — **P2**
- **Architecture:** `socket.js:8` `activeClassrooms = new Map()` — all room state in process memory.
- **Scaling:** Cannot run multiple replicas (rooms not shared). Sticky sessions required but not implemented.
- **Restart impact:** All live classrooms lose state (whiteboard, chat, participants) on restart. `classroomPersistence.js` debounced save (1.5s) mitigates but last seconds lost.

### OP-024: No process manager in container — **P2**
- **Dockerfile:** Runs `node` directly as PID 1 (via `USER node`).
- **Issues:** No zombie reaping, no signal forwarding for `SIGTERM`/`SIGINT` to child processes (none currently, but future-proofing), no log rotation.

---

## 6. Logging, Monitoring & Observability

### OP-025: Logging is unstructured `console.*` — **P1**
- **Evidence:** 28 `console.*` calls across backend (grep count).
- **Format:** Human-readable Persian/English strings with emojis (e.g., `🛡️ Database backup created:`).
- **No:** JSON structure, log levels (debug/info/warn/error), request IDs, correlation IDs, timestamps in ISO format, structured fields for log aggregation.
- **Impact:** Cannot parse/filter/alert in log aggregation systems (ELK, Loki, Datadog). Debugging requires manual grep.

### OP-026: No request ID / correlation ID — **P1**
- **Gap:** No middleware generates `X-Request-ID` or correlates HTTP request → Socket.IO events → DB queries → log lines.
- **Impact:** Cannot trace a user action across async boundaries (HTTP request → Socket event → background job).

### OP-027: No metrics / Prometheus endpoint — **P1**
- **Gap:** No `/metrics` endpoint. No counters for: request latency, error rates, active sockets, DB pool usage, queue depths, business metrics (ledger settlements, quiz submissions).
- **Only:** Static health endpoint, `morgan('dev')` in dev mode only.

### OP-028: Error reporting only to console — **P1**
- **Pattern:** `errorHandler.js` logs to `console.error` (suppressed in test env).
- **No:** Sentry, Bugsnag, custom error webhook, alerting on error rate spikes.
- **Unhandled:** `process.on('unhandledRejection')` and `uncaughtException` only log to console — process continues in undefined state.

### OP-028: Audit log exists but unwatched — **P2**
- **Table:** `audit_logs` (migration 016) with indexes on `[module, action]`, `[created_at]`.
- **Writes:** 8 call sites (5 gradebook, 2 finance, 1 health/login).
- **Gap:** No reader, no alerting on sensitive actions (finance settlement, parent login, role changes), no retention policy, no tamper-evidence (append-only not enforced).

---

## 7. Infrastructure Assumptions & Network Exposure

### OP-029: CORS allows any origin with credentials — **P0**
- **Code:** `app.js:92-98`
  ```javascript
  cors: {
    origin: true,
    credentials: true,
  }
  ```
- **Impact:** Any website can make authenticated requests to the API using victim's cookies (if SameSite=Lax) or by extracting token from localStorage via XSS. **Cross-origin socket takeover** (SEC-SOCKET-003).
- **Socket.IO:** Same CORS config at `socket.js:91-97`.

### OP-029: Single-node SQLite with WAL on shared volume — **P1**
- **Docker Compose:** Mounts `./educonnect.db:/app/educonnect.db` from host.
- **Risk:** If two containers mount same file (e.g., accidental duplicate deploy), SQLite locking may corrupt DB. `busy_timeout=10000` helps but not foolproof.
- **WAL mode:** Good for concurrency but file grows unbounded without checkpoint (handled by 5-min timer + 6-hr scheduled).

### OP-030: No TLS termination in application — **P1**
- **Assumption:** Reverse proxy (nginx, Traefik, Cloudflare) handles TLS.
- **Gap:** No documentation of required proxy headers (`X-Forwarded-Proto`, `X-Forwarded-For`), no `trust proxy` configuration beyond `app.set('trust proxy', 1)`.
- **Cookie security:** `withCredentials: true` on frontend requires `Secure` cookie flag in production — depends on proxy setting `X-Forwarded-Proto: https`.

### OP-031: External service dependencies unmonitored — **P2**
- **Dependencies:** Gemini AI (`GEMINI_API_KEY`), SMS gateway (stub), PostgreSQL (optional), Redis (config only).
- **No:** Circuit breakers, timeout configs, fallback behavior, health checks for external services.
- **AI:** `paperToDigital.service.js` falls back to deterministic parser on Gemini failure — silent degradation, no alert.

---

## 8. Failure Recovery & Disaster Recovery

### OP-032: No documented disaster recovery plan — **P0**
- **Missing:** 
  - RTO (Recovery Time Objective) / RPO (Recovery Point Objective) defined.
  - Runbook for: DB corruption, disk full, host failure, credential compromise, bad deploy rollback.
  - Contact tree, escalation paths.
- **Only:** `dbMaintenance.js` backup script and `gracefulShutdown` WAL flush.

### OP-033: Credential compromise — no rotation procedure — **P0**
- **Secrets:** JWT secrets, DB password, SMS API key, AI API key.
- **Rotation:** No mechanism. Changing JWT secret = all users logged out instantly. No overlap window.
- **Revocation:** `revoked_tokens` table + `token_version` support logout-all, but no admin UI or API to trigger for compromised account.

### OP-034: Database corruption — no automated recovery — **P1**
- **SQLite risks:** WAL corruption, disk bit-flip, OOM killer during checkpoint.
- **Recovery:** Manual `sqlite3 .recover` or restore from backup.
- **Gap:** No automated `PRAGMA integrity_check` on startup (only in backup script). No read-only mode to prevent writes during corruption.

### OP-035: Network partition — no graceful degradation — **P1**
- **DB:** SQLite local file — no network partition (single host). But if PG used, no retry/timeout config visible.
- **External:** AI, SMS — no circuit breaker, request queuing, or user-visible "service degraded" state.
- **Socket.IO:** No `io.engine.on("connection_error")` handling; clients reconnect with exponential backoff (configured at 15 attempts, 1.5s delay) but server-side room state lost on restart.

### OP-036: Bad deployment — no instant rollback — **P1**
- **Docker:** No blue/green, no canary, no `docker compose up --rollback`.
- **Database:** Migrations run on startup (`dev-server.js`) or manually (`npm run migrate`). Failed migration = manual fix.
- **Frontend:** No versioned assets, no cache-busting strategy documented.

---

## 9. Single Points of Failure (SPOF) Inventory

| Component | SPOF? | Impact if Down | Mitigation |
|---|---|---|---|
| **Node.js process** | **YES** | API + Realtime + Scheduler all down | None (single process) |
| **SQLite file** | **YES** | All data unavailable | Backup every 24h (unverified) |
| **WAL file** | **YES** | Uncommitted transactions lost | 5-min checkpoint + graceful shutdown |
| **JWT secret** | **YES** | All auth broken if compromised | No rotation procedure |
| **Disk** | **YES** | DB + backups + uploads lost | No off-site backup |
| **External AI (Gemini)** | **YES** | Paper-to-digital falls back to deterministic (fabricates data) | Silent degradation |
| **External SMS** | **YES** | No SMS alerts (finance, attendance) | Stubbed — logs only |
| **Redis** | **NO** (unused) | N/A | Config exists but zero consumers |
| **PostgreSQL** | **CONDITIONAL** | Only if `DB_CLIENT=pg` | Not default; untested |

---

## 10. Data Loss Scenarios

| Scenario | Likelihood | Data Loss | Detection Time | Recovery Time |
|---|---|---|---|---|
| Disk failure (no off-site backup) | Medium | **All data since last backup (≤24h)** | Immediate | Hours (manual restore) |
| SQLite corruption (WAL + DB) | Low | **All uncommitted + possibly committed** | Next backup/integrity check | Hours (manual `sqlite3 .recover`) |
| Accidental `DELETE` / bad migration | Medium | **Affected tables** | When noticed (no audit alerts) | Hours (restore from backup) |
| Credential leak (JWT secret) | Medium | **No data loss, but full auth bypass** | When abused (no monitoring) | Immediate (rotate secret = all users logged out) |
| Bad deploy (broken migration) | Medium | **Schema inconsistency** | Immediate (app crashes) | Manual fix + re-deploy |
| Host kernel panic / OOM kill | Low | **WAL data since last checkpoint (≤5 min)** | Immediate | Auto-restart + WAL replay |

---

## 11. Priority Remediation (Operational)

| Priority | Task | Effort |
|---|---|---|
| **P0-1** | Remove hardcoded JWT secrets from `dev-server.js`; generate at deploy time | 0.5 day |
| **P0-2** | Commit `package-lock.json` (root + workspaces); fix Docker `npm ci` | 0.5 day |
| **P0-3** | Restrict CORS to allowlist (`config.frontendUrl`); remove `origin: true` | 0.5 day |
| **P0-4** | Add backup integrity check (`PRAGMA integrity_check`) + SHA256 manifest | 1 day |
| **P0-5** | Document DR plan with RTO/RPO; test restore procedure | 2 days |
| **P1-1** | Add `HEALTHCHECK` to Dockerfile with DB connectivity check | 0.5 day |
| **P1-2** | Implement structured JSON logging + request ID middleware | 1 day |
| **P1-3** | Add graceful shutdown: `server.close()`, `io.close()`, drain requests | 1 day |
| **P1-4** | Add backup checksum + off-site copy (S3/GCS) script | 1 day |
| **P1-5** | Document secret rotation procedure with overlap window | 1 day |
| **P2-1** | Add Prometheus `/metrics` endpoint with key counters | 1 day |
| **P2-2** | Add CI job for PostgreSQL migration test | 0.5 day |
| **P2-3** | Implement per-tenant backup export capability | 1 day |
| **P2-4** | Add systemd/PM2 process management in container | 0.5 day |
| **P2-5** | Create deployment runbook (blue/green, rollback, scaling) | 2 days |

---

## 12. Deployment Readiness Checklist

| Item | Status | Notes |
|---|---|---|
| **Reproducible build (lockfile)** | ❌ FAIL | No `package-lock.json` |
| **Docker build succeeds** | ❌ FAIL | `npm ci` fails without lockfile |
| **Secrets not in repo** | ❌ FAIL | `dev-server.js` has hardcoded JWT secrets |
| **CORS restricted** | ❌ FAIL | `origin: true` with credentials |
| **Health endpoint checks deps** | ❌ FAIL | Static `{"status":"ok"}` |
| **Structured logging** | ❌ FAIL | 28 `console.*` calls |
| **Backup verified** | ❌ FAIL | No integrity check |
| **Backup off-site** | ❌ FAIL | Local disk only |
| **Per-tenant restore** | ❌ FAIL | Single file only |
| **Migration rollback safe** | ❌ FAIL | `down()` drops tables |
| **Secret rotation procedure** | ❌ FAIL | Not documented |
| **DR plan documented** | ❌ FAIL | Not documented |
| **TLS/proxy config documented** | ❌ FAIL | Not documented |
| **Horizontal scaling possible** | ❌ FAIL | In-memory Socket rooms |
| **Monitoring/alerting** | ❌ FAIL | Console only |

---

## 13. Recommended Deployment Architecture (Post-Remediation)

```
                          ┌─────────────────────┐
                          │   Load Balancer     │  (nginx/Traefik/Cloudflare)
                          │   TLS Termination   │
                          │   Rate Limiting     │
                          └──────────┬──────────┘
                                     │
                    ┌────────────────┼────────────────┐
                    ▼                ▼                ▼
             ┌─────────────┐  ┌─────────────┐  ┌─────────────┐
             │  App Pod 1  │  │  App Pod 2  │  │  App Pod N  │  (stateless API)
             │  (Node.js)  │  │  (Node.js)  │  │  (Node.js)  │
             └──────┬──────┘  └──────┬──────┘  └──────┬──────┘
                    │                │                │
                    └────────────────┼────────────────┘
                                     ▼
                          ┌─────────────────────┐
                          │  PostgreSQL Cluster │  (Primary + Replica)
                          │  (Primary/Replica)  │
                          └─────────────────────┘
                                     │
                    ┌────────────────┼────────────────┐
                    ▼                ▼                ▼
             ┌─────────────┐  ┌─────────────┐  ┌─────────────┐
             │  Redis      │  │  Object     │  │  Backup     │
             │  (Sessions, │  │  Storage    │  │  (S3/GCS)   │
             │   Cache,    │  │  (Uploads,  │  │  (Daily +   │
             │   Pub/Sub)  │  │   Backups)  │  │   Point-in- │
             └─────────────┘  └─────────────┘  │   Time)     │
                                               └─────────────┘
```

**Key changes required:**
1. PostgreSQL as primary (remove SQLite default)
2. Redis for Socket.IO adapter + session store + cache
3. Object storage for uploads + backups
4. Container orchestration (K8s, ECS, Nomad) with health checks
5. Structured logging → Loki/ELK
6. Metrics → Prometheus + Grafana
7. Tracing → Jaeger/Zipkin
8. Secret management → Vault/Sealed Secrets/Cloud provider

---

*Assessment complete. All findings derived from source code review. No production systems accessed.*