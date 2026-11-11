# EduConnect Remediation Roadmap — Independent Investigation

**Audit Date:** 2026-11-11  
**Commit:** `838b5b2` (main)  
**Scope:** Prioritized, practical remediation strategy for all 187 findings

---

## Remediation Philosophy

**Principles:**
1. **Fix root causes, not symptoms** — Address architectural gaps, not just surface bugs
2. **P0 first, always** — Critical risks before enhancements
3. **Small, verifiable increments** — Each change testable and deployable
4. **No new technical debt** — Every fix improves architecture
5. **Measure before/after** — Quantify improvement

**Team Assumption:** 2-3 engineers (1 backend, 1 frontend, 1 DevOps/shared)

---

## Phase 0: Emergency Fixes (Weeks 1-3) — P0 Only

**Goal:** Eliminate all P0 vulnerabilities and unblock Docker/build

| Week | Focus | Deliverables | Validation |
|---|---|---|---|
| **1** | Build & Secrets | `package-lock.json` committed; Docker builds; secrets removed | `docker build` succeeds; no hardcoded secrets in repo |
| **2** | Critical Security | CORS fixed; JWT to httpOnly cookies; finance auth; Socket.IO CORS; parent verification | Security scan passes; penetration test clean |
| **3** | Data Integrity | DB transactions on all P0 paths; AI review gate; AI fabrication removed | Race condition tests pass; AI review gate enforced |

### Week 1: Build & Secrets (Days 1-5)

| Day | Task | Owner | Acceptance |
|---|---|---|---|
| 1 | Generate `package-lock.json` (root + backend + frontend) | DevOps | `npm ci` works in clean checkout |
| 2 | Fix Dockerfile `npm ci` | DevOps | `docker build` succeeds |
| 3 | Remove hardcoded JWT secrets from `dev-server.js` | Backend | No secrets in repo; env vars required |
| 4 | Remove demo accounts from production build | Frontend | `DEMO_ACCOUNTS` only in dev env |
| 5 | Verify Docker build end-to-end | DevOps | `docker build && docker run` healthy |

### Week 2: Critical Security (Days 6-10)

| Day | Task | Owner | Acceptance |
|---|---|---|---|
| 6 | Fix CORS: `origin: true` → allowlist (`config.frontendUrl`) | Backend | `curl -H "Origin: https://evil.com"` → 403 |
| 2 | Move JWT to httpOnly cookies (backend + frontend) | Fullstack | Tokens not in localStorage; httpOnly cookies set |
| 3 | Add `authorize('financial_officer', ...)` to `/finance/callback-verify` | Backend | Student POST → 403 |
| 4 | Fix Socket.IO CORS + add revocation check on events | Backend | Revoked token → socket disconnects |
| 5 | Implement parent verification flow (SMS/email code) | Backend | Unverified parent → 403 on child data |

### Week 3: Data Integrity (Days 11-15)

| Day | Task | Owner | Acceptance |
|---|---|---|---|
| 11 | Add `db.transaction()` to finance settlement (both paths) | Backend | Race test: 20 concurrent → 1 success |
| 2 | Add `db.transaction()` to attendance `closeSession` | Backend | Race test: check-in during close → preserved |
| 3 | Add `db.transaction()` to quiz `startAttempt`/`submitAttempt` | Backend | Race test: 20 concurrent → 1 attempt |
| 4 | Add `db.transaction()` to AI `commitExtractedData` | Backend | Partial failure → full rollback |
| 4 | Enforce AI `needs_review` gate in commit | Backend | Item with `needs_review:true` → 403 |
| 5 | Remove AI data fabrication (return empty on empty OCR) | Backend | Empty input → empty items, confidence 0 |

---

## Phase 1: Hardening (Weeks 4-9) — P1 Items

**Goal:** Eliminate all P1 vulnerabilities and establish baseline reliability

| Week | Focus | Deliverables |
|---|---|---|
| **4-5** | Auth Hardening | httpOnly cookies, request deduplication, parent verification, rate limiting |
| **6-7** | Data Integrity | Missing constraints, transactions on remaining paths, grade history |
| **8** | Observability Foundation | Structured logging, health checks, request IDs |
| **9** | Frontend Quality | Auth guards, request deduplication, CSP, demo data removal |

### Week 4-5: Auth Hardening

| Task | Effort | Acceptance |
|---|---|---|
| Move JWT to httpOnly cookies (replace localStorage) | 2 days | Tokens not accessible via JS; Secure/SameSite=Strict |
| Add request deduplication (axios interceptor + frontend) | 1 day | Double-click → single request |
| Implement parent verification flow (SMS code) | 2 days | Unverified parent → 403 |
| Add rate limiting on finance endpoints (10/min/user) | 0.5 day | 11th request → 429 |
| Add rate limiting on Socket.IO events (per-socket) | 1 day | Spam → 429 after threshold |
| Add CSP headers on all responses | 0.5 day | `script-src 'self'; object-src 'none'` |

### Week 6-7: Data Integrity

| Task | Effort | Acceptance |
|---|---|---|
| Add missing CHECK/UNIQUE constraints (10+ constraints) | 1 day | Migration applies; invalid data rejected |
| Wrap remaining multi-write ops in transactions (8 paths) | 2 days | Race tests pass |
| Add grade history table + audit trail | 2 days | Grade change → immutable history row |
| Add financial reconciliation view | 1 day | `tuition_ledger_reconciliation` shows discrepancies |
| Add grade freeze / term closure workflow | 2 days | Term lock prevents grade changes |

### Week 8: Observability Foundation

| Task | Effort | Acceptance |
|---|---|---|
| Structured JSON logging (Pino/Winston) with request IDs | 1 day | Logs parseable; correlation works |
| Health endpoint with DB/dependency checks | 1 day | `/api/health` → 200 with `db: connected` |
| Prometheus `/metrics` endpoint | 1 day | `prometheus_client` scrapes successfully |
| Health check in Dockerfile | 0.5 day | `HEALTHCHECK CMD curl -f http://localhost:5000/api/health` |
| Graceful shutdown (drain HTTP, close WS) | 1 day | SIGTERM → 0 in-flight requests |

### Week 9: Frontend Quality

| Task | Effort | Acceptance |
|---|---|---|
| Add auth guards to gradebook/notifications pages | 0.5 day | Unauthenticated → redirect to login |
| Add request deduplication (axios interceptor) | 0.5 day | Double-click → single request |
| Add CSP headers on frontend | 0.5 day | `script-src 'self'; object-src 'none'` |
| Remove demo data from production build | 0.5 day | `children/page.js` no hardcoded demo |
| Add auth guards to all dashboard pages | 1 day | No page accessible without auth |
| Add request deduplication (prevent double-submit) | 0.5 day | Double-click → single request |

---

## Phase 2: Observability & Reliability (Weeks 10-12)

**Goal:** Production-grade observability and incident response capability

| Week | Focus | Deliverables |
|---|---|---|
| **10** | Logging & Metrics | Structured logs, Prometheus metrics, health checks |
| **11** | Tracing & Alerting | Distributed tracing, alerting rules, dashboards |
| **12** | DR & Incident Response | Backup verification, DR drill, runbooks, on-call |

### Week 10: Logging & Metrics

| Task | Effort | Acceptance |
|---|---|---|
| Structured JSON logging (Pino) with request correlation IDs | 1 day | Logs in Loki; queryable by `request_id` |
| Prometheus metrics: HTTP latency, error rate, active sockets, DB pool | 1 day | Grafana dashboard shows live metrics |
| Custom business metrics: settlements, quiz submissions, active classes | 1 day | Business KPIs visible |
| Log redaction (PII masking in logs) | 0.5 day | No PII in log output |

### Week 11: Tracing & Alerting

| Task | Effort | Acceptance |
|---|---|---|
| OpenTelemetry instrumentation (HTTP, DB, Socket.IO) | 1 day | Traces in Jaeger |
| Alerting rules: error rate >5%, latency p95>1s, disk>80%, memory>85% | 1 day | Alertmanager fires → PagerDuty/Slack |
| Grafana dashboards: API, Socket.IO, DB, Business | 1 day | Dashboards auto-provisioned |
| Synthetic monitoring (health endpoint polling) | 0.5 day | Uptime check every 30s |

### Week 12: DR & Incident Response

| Task | Effort | Acceptance |
|---|---|---|
| Backup integrity check (`PRAGMA integrity_check` + SHA256) | 1 day | Nightly job → pass/fail in logs |
| Off-site backup replication (S3/GCS) | 2 days | Daily backup in S3; lifecycle policy |
| Single-school restore procedure + test | 2 days | Restore < 1 hour; data verified |
| DR runbook (10 scenarios) | 3 days | Runbook executed in drill |
| On-call rotation + escalation matrix | 1 day | PagerDuty schedule active |
| Incident response playbook (top 10 scenarios) | 3 days | Playbook exercised in drill |
| Postmortem template + blameless process | 1 day | Template used in next incident |

---

## Phase 3: Frontend Quality & Scale Prep (Weeks 13-20)

**Goal:** Production-grade frontend with test coverage and performance budgets

| Week | Focus | Deliverables |
|---|---|---|
| **13-14** | Testing Infrastructure | Vitest, Playwright, CI integration |
| **15-16** | Test Coverage | 60% frontend, 80% backend |
| **17-18** | Code Splitting & Performance | Route-level splitting, bundle budgets |
| **19-20** | Scale Preparation | PG migration, Redis, job queue |

### Week 13-14: Testing Infrastructure

| Task | Effort | Acceptance |
|---|---|---|
| Add Vitest + React Testing Library + MSW | 1 day | `npm run test` passes |
| Add Playwright for E2E | 1 day | `npx playwright test` passes |
| Add CI workflow for frontend tests | 0.5 day | GitHub Actions runs on PR |
| Add accessibility testing (axe-core) | 0.5 day | `npm run test:a11y` passes |
| Add visual regression (Playwright + pixelmatch) | 1 day | Baseline screenshots captured |

### Week 15-16: Test Coverage

| Target | Target | Current |
|---|---|---|
| Backend unit/integration | 80% | ~40% |
| Frontend component | 60% | 0% |
| E2E critical paths | 20 flows | 0 |
| Mutation testing (backend) | 60% | N/A |

### Week 17-18: Code Splitting & Performance

| Task | Effort | Acceptance |
|---|---|---|
| Route-level code splitting (`next/dynamic` per dashboard section) | 2 days | Bundle size < 200 KB initial |
| Skeleton loading components | 1 day | No layout shift on load |
| Bundle size budgets in CI | 0.5 day | CI fails if > 200 KB gzipped |
| Image optimization (Next.js Image) | 0.5 day | Lighthouse images score > 90 |
| Service worker + PWA manifest | 1 day | Offline-capable; installable |

### Week 19-20: Scale Preparation

| Task | Effort | Acceptance |
|---|---|---|
| PostgreSQL migration + RLS policies | 5 days | PG primary; RLS enforced |
| Redis for Socket.IO adapter + sessions + cache | 2 days | Horizontal scaling works |
| BullMQ job queue (AI, backups, notifications) | 3 days | Async processing; retries |
| Horizontal scaling test (3 replicas) | 2 days | Load test: 2000 concurrent |

---

## Phase 4: Compliance & Maturity (Weeks 21-24)

**Goal:** Regulatory compliance and operational maturity

| Week | Focus | Deliverables |
|---|---|---|
| **21** | GDPR/PDPL Compliance | DPA with Google, consent flows, right-to-erasure |
| **22** | Security Hardening | Penetration test, CSP, request signing |
| **23** | Documentation & Knowledge | API docs, runbooks, architecture docs |
| **24** | Go-Live Preparation | Final security audit, staged rollout plan |

### Week 21: GDPR/PDPL Compliance

| Task | Effort | Acceptance |
|---|---|---|
| Data Processing Agreement with Google | 2 days | Signed DPA on file |
| Consent flow for AI processing (parent opt-in) | 2 days | Parent consents → AI enabled |
| Right-to-erasure endpoint (`DELETE /auth/me`) | 1 day | Account + data deleted in < 1 hour |
| Data portability endpoint (`GET /auth/me/export`) | 1 day | JSON export of all user data |
| Retention policies + automated cleanup | 2 days | Audit logs 1 year; notifications 90 days |

### Week 22: Security Hardening

| Task | Effort | Acceptance |
|---|---|---|
| External penetration test | 3 days | Report: 0 critical, < 3 high |
| CSP headers on all responses | 1 day | CSP eval score A+ |
| Request signing (HMAC) for finance/grade changes | 2 days | Tampered request → 401 |
| Request deduplication (idempotency keys) | 1 day | Duplicate request → 409 |
| Penetration test remediation | 2 days | All findings resolved |

### Week 23: Documentation & Knowledge

| Task | Effort | Acceptance |
|---|---|---|
| OpenAPI/Swagger documentation | 2 days | `/api/docs` serves spec |
| Architecture decision records (ADR 001-010) | 1 day | ADRs in repo |
| Runbooks for top 20 scenarios | 5 days | Runbook executed in drill |
| Architecture documentation | 1 day | Diagrams + narratives |
| API changelog + versioning policy | 1 day | Semantic versioning enforced |

### Week 24: Go-Live Preparation

| Task | Effort | Acceptance |
|---|---|---|
| Final security audit (external) | 3 days | Report: 0 critical, < 3 high |
| Staged rollout plan (1 pilot → 5 schools → GA) | 1 day | Plan approved |
| Final load test (2000 concurrent) | 2 days | p95 < 500ms, 0 errors |
| Final DR drill (full restore) | 1 day | Restore < 1 hour |
| Go/No-Go decision meeting | 0.5 day | All criteria met → GO |

---

## Remediation Tracker Template

| Finding ID | Title | Phase | Week | Owner | Status | Verification |
|---|---|---|---|---|---|---|
| F-001 | No DB transactions | Phase 0 | 3 | Backend | 🔄 In Progress | Race test passes |
| F-002 | Missing financial constraints | Phase 0 | 3 | Backend | ⏳ Pending | Migration applies |
| F-003 | Finance race condition | Phase 0 | 3 | Backend | 🔄 In Progress | Race test passes |
| ... | ... | ... | ... | ... | ... | ... |

---

## Resource Allocation

| Role | Phase 0 | Phase 1 | Phase 2 | Phase 3 | Phase 4 |
|---|---|---|---|---|---|
| **Backend Engineer 1** | P0 security + transactions | Auth hardening + data integrity | Observability + tracing | Frontend tests + code splitting | Compliance + hardening |
| **Backend Engineer 2** | P0 secrets + AI safety | Data integrity + auth | DR + incident response | Scale prep (PG, Redis, queue) | Go-live prep |
| **Frontend Engineer** | Auth guards + demo removal | Auth hardening | Tests + code splitting | Performance + PWA | Go-live prep |
| **DevOps/Platform** | Lockfile + Docker + secrets | CI/CD + observability | DR + backup + on-call | Scale (PG, Redis, K8s) | Go-live ops |

---

## Budget Estimate (Engineering Weeks)

| Phase | Weeks | Engineers | Total Eng-Weeks |
|---|---|---|---|
| Phase 0 (P0) | 3 | 3 | 9 |
| Phase 1 (P1) | 6 | 3 | 18 |
| Phase 2 (Observability) | 3 | 3 | 9 |
| Phase 2 (Frontend Quality) | 4 | 2 | 8 |
| Phase 2 (Scale Prep) | 4 | 2 | 8 |
| Phase 3 (Compliance) | 4 | 2 | 8 |
| **Total** | **24** | | **60 eng-weeks** |

**Estimated Calendar Time:** 24 weeks (6 months) with 3 engineers  
**With 2 engineers:** ~36 weeks (9 months)  
**With 4 engineers:** ~18 weeks (4.5 months)

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| PG migration complexity underestimated | Medium | High | Start PG migration in Phase 2; run dual-write |
| AI DPA with Google delayed | High | Critical | Prepare on-premise fallback (Ollama) |
| Frontend test coverage target missed | Medium | High | Prioritize E2E over unit; 60% target |
| PostgreSQL migration data issues | Medium | High | Run dual-write for 2 weeks before cutover |
| Team capacity reduced (turnover) | Low | High | Cross-train; document everything |
| External dependency (Gemini) outage | Medium | High | Circuit breaker + deterministic fallback |

---

## Success Metrics (Definition of Done)

| Metric | Target | Measurement |
|---|---|---|
| **P0 Vulnerabilities** | 0 | Security scan + code review |
| **Build Reproducibility** | 100% | `docker build` passes on clean checkout |
| **Test Pass Rate** | 100% | `npm test` (backend + frontend) |
| **Code Coverage** | >70% | `nyc` / `vitest --coverage` |
| **Health Endpoint** | 200 with deps | `curl /api/health` → `{db: "connected", ...}` |
| **Backup Verification** | Pass | `integrity_check` + SHA256 match |
| **Restore Drill** | < 1 hour | Single-school restore verified |
| **Incident Response** | MTTR < 1 hour | Postmortem metrics |
| **Availability** | > 99.5% | 30-day uptime |
| **Error Rate** | < 0.1% | 5xx / total requests |
| **Latency (p95)** | < 500ms | API + WebSocket |

---

*Remediation roadmap compiled from all assessment findings. Updated weekly during execution. Generated from commit `838b5b2`.*
ENDOFFILE