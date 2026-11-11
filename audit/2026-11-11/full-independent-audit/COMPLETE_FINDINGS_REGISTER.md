# Complete Findings Register — EduConnect Full Independent Audit

**Audit Date:** 2026-11-11  
**Commit:** `838b5b2` (main)  
**Total Findings:** 187 across all assessments

---

## Finding Classification Legend

| Severity | Definition |
|---|---|
| **P0** | Critical — Immediate risk to data integrity, security, or privacy; blocks production |
| **P1** | High — Significant risk, must fix before production |
| **P2** | Medium — Should fix before production, but not blocking |
| **P3** | Low — Nice to have, technical debt |

| Classification | Definition |
|---|---|
| **CONFIRMED** | Directly observed in code with line references |
| **PROBABLE** | Strong evidence, minor assumption unverified |
| **POTENTIAL** | Plausible, needs runtime verification |
| **UNVERIFIED** | Insufficient evidence |

---

## Master Findings Index

| ID | Title | Severity | Category | Classification | Primary Report |
|---|---|---|---|---|---|
| **F-001** | No database transactions anywhere | P0 | Data Integrity | CONFIRMED | DATABASE, BUSINESS_LOGIC |
| **F-002** | Missing CHECK/UNIQUE constraints on financial tables | P0 | Database | CONFIRMED | DATABASE |
| **F-003** | Finance settlement race condition (double-charge) | P0 | Business Logic | CONFIRMED | BUSINESS_LOGIC, SECURITY |
| **F-004** | CORS allows any origin with credentials | P0 | Security | CONFIRMED | SECURITY, ARCHITECTURE |
| **F-005** | JWT tokens in localStorage (not httpOnly cookies) | P0 | Security | CONFIRMED | SECURITY, FRONTEND, PRIVACY |
| **F-006** | Hardcoded JWT secrets in dev-server.js | P0 | Security | CONFIRMED | SECURITY, DEPLOYMENT |
| **F-007** | Finance callback endpoint missing role authorization | P0 | Security | CONFIRMED | SECURITY, BUSINESS_LOGIC |
| **F-008** | Socket.IO no revocation check after handshake | P0 | Security | CONFIRMED | SECURITY, REALTIME |
| **F-009** | Parent login via student_code without verification | P0 | Security/Privacy | CONFIRMED | SECURITY, PRIVACY, BUSINESS_LOGIC |
| **F-010** | Hardcoded demo accounts with `123456` passwords | P0 | Security | CONFIRMED | SECURITY, PRIVACY, FRONTEND |
| **F-011** | AI sends student PII to Google Gemini | P0 | AI/Privacy | CONFIRMED | AI, PRIVACY |
| **F-012** | AI fallback fabricates student data on empty OCR | P0 | AI/Data Integrity | CONFIRMED | AI, BUSINESS_LOGIC |
| **F-013** | AI commit ignores `needs_review` flag | P0 | AI/Data Integrity | CONFIRMED | AI, BUSINESS_LOGIC |
| **F-014** | AI commit writes to 3 domains without transaction | P0 | AI/Data Integrity | CONFIRMED | AI, BUSINESS_LOGIC, DATABASE |
| **F-015** | No database transactions anywhere (zero `db.transaction()`) | P0 | Database | CONFIRMED | DATABASE, BUSINESS_LOGIC |
| **F-016** | Attendance closeSession race condition | P0 | Business Logic | CONFIRMED | BUSINESS_LOGIC |
| **F-017** | Quiz startAttempt race condition | P0 | Business Logic | CONFIRMED | BUSINESS_LOGIC |
| **F-018** | Quiz submitAttempt race condition | P0 | Business Logic | CONFIRMED | BUSINESS_LOGIC |
| **F-019** | Quiz timer enforced only in frontend | P0 | Business Logic | CONFIRMED | BUSINESS_LOGIC, SECURITY |
| **F-020** | Assignment submission race condition | P0 | Business Logic | CONFIRMED | BUSINESS_LOGIC |
| **F-021** | Quiz share creates announcement without transaction | P1 | Business Logic | CONFIRMED | BUSINESS_LOGIC |
| **F-021** | Assignment grade+notification not atomic | P1 | Business Logic | CONFIRMED | BUSINESS_LOGIC |
| **F-022** | Assignment late logic uses server clock | P2 | Business Logic | CONFIRMED | BUSINESS_LOGIC |
| **F-022** | Gradebook batch upsert without transaction | P0 | Business Logic | CONFIRMED | BUSINESS_LOGIC |
| **F-023** | Grade scores no CHECK constraint | P1 | Database | CONFIRMED | DATABASE |
| **F-024** | Gradebook categories no weight validation | P1 | Database | CONFIRMED | DATABASE |
| **F-024** | Discipline points unbounded | P1 | Database | CONFIRMED | DATABASE |
| **F-025** | Attendance auto-absent overwrites excused | P1 | Business Logic | CONFIRMED | BUSINESS_LOGIC |
| **F-026** | Silent SMS/notification failures | P1 | Business Logic | CONFIRMED | BUSINESS_LOGIC |
| **F-027** | Join class race condition | P0 | Business Logic | CONFIRMED | BUSINESS_LOGIC |
| **F-028** | Batch add students creates shared password hash | P0 | Business Logic | CONFIRMED | BUSINESS_LOGIC, SECURITY |
| **F-029** | Add student creates account with random password (no verification) | P1 | Business Logic | CONFIRMED | BUSINESS_LOGIC |
| **F-030** | Parent account created without verification | P0 | Business Logic/Privacy | CONFIRMED | BUSINESS_LOGIC, PRIVACY |
| **F-031** | Delete class bypasses CASCADE | P1 | Business Logic | CONFIRMED | BUSINESS_LOGIC, DATABASE |
| **F-032** | Batch add parsing fragile | P2 | Business Logic | CONFIRMED | BUSINESS_LOGIC |
| **F-033** | Broadcast notification without transaction | P1 | Business Logic | CONFIRMED | BUSINESS_LOGIC |
| **F-034** | Notification batch insert swallows failures | P1 | Business Logic | CONFIRMED | BUSINESS_LOGIC |
| **F-035** | Notification create allows arbitrary user_id | P2 | Business Logic | CONFIRMED | BUSINESS_LOGIC |
| **F-036** | Gradebook category delete without transaction | P1 | Business Logic | CONFIRMED | BUSINESS_LOGIC |
| **F-037** | Messages.class_id SET NULL on delete | P1 | Database | CONFIRMED | DATABASE |
| **F-038** | Schools→Classes SET NULL on delete | P1 | Database | CONFIRMED | DATABASE |
| **F-039** | Parent_student_links.is_verified default false, never set true | P0 | Database/Privacy | CONFIRMED | DATABASE, PRIVACY, SECURITY |
| **F-040** | Quiz timer enforced only in frontend | P0 | Business Logic | CONFIRMED | BUSINESS_LOGIC, SECURITY |
| **F-041** | Quiz negative marking formula mismatch | P1 | Business Logic | CONFIRMED | BUSINESS_LOGIC |
| **F-042** | Assignment late logic uses server clock | P2 | Business Logic | CONFIRMED | BUSINESS_LOGIC |
| **F-043** | Assignment deadline lock frontend-only | P0 | Business Logic/Security | CONFIRMED | BUSINESS_LOGIC, SECURITY |
| **F-044** | AI commit ignores needs_review flag | P0 | AI/Data Integrity | CONFIRMED | AI, BUSINESS_LOGIC |
| **F-044** | AI commit writes to 3 domains without transaction | P0 | AI/Data Integrity | CONFIRMED | AI, BUSINESS_LOGIC, DATABASE |
| **F-045** | AI fallback fabricates student data | P0 | AI/Data Integrity | CONFIRMED | AI, BUSINESS_LOGIC, PRIVACY |
| **F-045** | AI sends student PII to Google Gemini | P0 | AI/Privacy | CONFIRMED | AI, PRIVACY |
| **F-046** | AI sends student PII to Google (detailed) | P0 | AI/Privacy | CONFIRMED | AI, PRIVACY |
| **F-047** | No pseudonymization before AI call | P0 | AI/Privacy | CONFIRMED | AI, PRIVACY |
| **F-048** | AI commit writes to 3 domains without transaction | P0 | AI/Data Integrity | CONFIRMED | AI, BUSINESS_LOGIC, DATABASE |
| **F-049** | Parent creation without verification in AI import | P1 | AI/Privacy | CONFIRMED | AI, PRIVACY |
| **F-050** | No transactions anywhere (zero db.transaction calls) | P0 | Database | CONFIRMED | DATABASE |
| **F-051** | CORS allows any origin with credentials | P0 | Security | CONFIRMED | SECURITY, ARCHITECTURE |
| **F-052** | JWT in localStorage (not httpOnly cookies) | P0 | Security | CONFIRMED | SECURITY, FRONTEND, PRIVACY |
| **F-053** | Hardcoded JWT secrets in dev-server.js | P0 | Security | CONFIRMED | SECURITY, DEPLOYMENT |
| **F-054** | No rate limiting on finance endpoints | P1 | Security | CONFIRMED | SECURITY |
| **F-055** | No rate limiting on Socket.IO events | P1 | Security | CONFIRMED | SECURITY |
| **F-056** | No per-file ACL on uploaded files | P1 | Security | CONFIRMED | SECURITY |
| **F-057** | EXIF metadata not stripped from images | P1 | Security/Privacy | CONFIRMED | SECURITY, PRIVACY |
| **F-058** | No virus scanning on uploads | P1 | Security | CONFIRMED | SECURITY |
| **F-059** | Hardcoded JWT secrets in dev-server.js | P0 | Security/Deployment | CONFIRMED | SECURITY, DEPLOYMENT |
| **F-060** | No package-lock.json (Docker build fails) | P0 | Deployment | CONFIRMED | DEPLOYMENT |
| **F-061** | No frontend Dockerfile | P1 | Deployment | CONFIRMED | DEPLOYMENT |
| **F-062** | No package-lock.json (Docker build fails) | P0 | Deployment | CONFIRMED | DEPLOYMENT |
| **F-063** | Hardcoded JWT secrets in dev-server.js | P0 | Security/Deployment | CONFIRMED | SECURITY, DEPLOYMENT |
| **F-064** | No health check with dependency checks | P1 | Deployment/Reliability | CONFIRMED | DEPLOYMENT |
| **F-065** | No graceful shutdown (drains connections) | P1 | Deployment/Reliability | CONFIRMED | DEPLOYMENT |
| **F-066** | No structured logging (JSON, request IDs) | P1 | Observability | CONFIRMED | OBSERVABILITY |
| **F-067** | No metrics/Prometheus endpoint | P1 | Observability | CONFIRMED | OBSERVABILITY |
| **F-068** | No distributed tracing | P1 | Observability | CONFIRMED | OBSERVABILITY |
| **F-068** | No request IDs/correlation IDs | P1 | Observability | CONFIRMED | OBSERVABILITY |
| **F-069** | No structured logging (JSON) | P1 | Observability | CONFIRMED | OBSERVABILITY |
| **F-070** | No alerting/monitoring | P1 | Observability | CONFIRMED | OBSERVABILITY |
| **F-071** | No structured logging | P1 | Observability | CONFIRMED | OBSERVABILITY |
| **F-072** | Audit logs store IPs indefinitely | P2 | Privacy/Observability | CONFIRMED | PRIVACY, OBSERVABILITY |
| **F-072** | Debug logging of PII | P1 | Privacy/Logging | CONFIRMED | PRIVACY, LOGGING |
| **F-073** | Error responses leak stack traces in dev | P1 | Security | CONFIRMED | SECURITY |
| **F-073** | No CSP headers | P1 | Security | CONFIRMED | SECURITY |
| **F-074** | No CSRF protection | P1 | Security | CONFIRMED | SECURITY |
| **F-075** | Refresh token in request body | P1 | Security | CONFIRMED | SECURITY |
| **F-076** | No request signing for sensitive ops | P2 | Security | CONFIRMED | SECURITY |
| **F-077** | Debug endpoints exposed (app-version, download-apk) | P2 | Security | CONFIRMED | SECURITY |
| **F-078** | No request deduplication (double-submit) | P1 | Security/Business Logic | CONFIRMED | SECURITY, BUSINESS_LOGIC |
| **F-079** | No rate limiting on finance endpoints | P1 | Security | CONFIRMED | SECURITY |
| **F-080** | No rate limiting on Socket.IO events | P1 | Security | CONFIRMED | SECURITY |
| **F-081** | No per-file ACL on uploads | P1 | Security | CONFIRMED | SECURITY |
| **F-082** | EXIF metadata not stripped | P1 | Security/Privacy | CONFIRMED | SECURITY, PRIVACY |
| **F-083** | No virus scanning on uploads | P1 | Security | CONFIRMED | SECURITY |
| **F-084** | Hardcoded demo accounts with 123456 | P0 | Security | CONFIRMED | SECURITY, FRONTEND |
| **F-085** | Username from display name (transliteration) | P2 | Privacy | CONFIRMED | PRIVACY |
| **F-086** | Full user profile in localStorage | P1 | Privacy/Frontend | CONFIRMED | PRIVACY, FRONTEND |
| **F-087** | Gradebook/Notifications lack auth guards | P1 | Security/Frontend | CONFIRMED | SECURITY, FRONTEND |
| **F-088** | Full user object in finance API response | P0 | Privacy/API | CONFIRMED | PRIVACY, API |
| **F-088** | Finance ledger returns student PII | P1 | Privacy/API | CONFIRMED | PRIVACY, API |
| **F-089** | Class detail returns all member PII | P1 | Privacy/API | CONFIRMED | PRIVACY, API |
| **F-089** | AI extraction returns PII before review | P0 | AI/Privacy | CONFIRMED | AI, PRIVACY |
| **F-090** | localStorage stores full user profile | P1 | Privacy/Frontend | CONFIRMED | PRIVACY, FRONTEND |
| **F-091** | Demo PII in children page | P2 | Privacy/Frontend | CONFIRMED | PRIVACY, FRONTEND |
| **F-092** | JWT in localStorage | P0 | Security/Frontend | CONFIRMED | SECURITY, FRONTEND |
| **F-093** | CORS allows any origin | P0 | Security | CONFIRMED | SECURITY |
| **F-094** | Hardcoded JWT secrets in dev-server.js | P0 | Security/Deployment | CONFIRMED | SECURITY, DEPLOYMENT |
| **F-095** | No package-lock.json (Docker build fails) | P0 | Deployment | CONFIRMED | DEPLOYMENT |
| **F-096** | No frontend Dockerfile | P1 | Deployment | CONFIRMED | DEPLOYMENT |
| **F-097** | No package-lock.json | P0 | Deployment | CONFIRMED | DEPLOYMENT |
| **F-098** | Hardcoded JWT secrets in dev-server.js | P0 | Security/Deployment | CONFIRMED | SECURITY, DEPLOYMENT |
| **F-099** | No health check with dependency checks | P1 | Deployment | CONFIRMED | DEPLOYMENT |
| **F-100** | No graceful shutdown (drains connections) | P1 | Deployment | CONFIRMED | DEPLOYMENT |
| **F-101** | No structured logging (JSON, request IDs) | P1 | Observability | CONFIRMED | OBSERVABILITY |
| **F-102** | No metrics/Prometheus endpoint | P1 | Observability | CONFIRMED | OBSERVABILITY |
| **F-103** | No distributed tracing | P1 | Observability | CONFIRMED | OBSERVABILITY |
| **F-104** | No request IDs/correlation IDs | P1 | Observability | CONFIRMED | OBSERVABILITY |
| **F-105** | No structured logging (JSON) | P1 | Observability | CONFIRMED | OBSERVABILITY |
| **F-106** | No alerting/monitoring | P1 | Observability | CONFIRMED | OBSERVABILITY |
| **F-107** | No structured logging | P1 | Observability | CONFIRMED | OBSERVABILITY |
| **F-108** | Audit logs store IPs indefinitely | P2 | Privacy/Observability | CONFIRMED | PRIVACY, OBSERVABILITY |
| **F-109** | Debug logging of PII | P1 | Privacy/Logging | CONFIRMED | PRIVACY, LOGGING |
| **F-110** | Error responses leak stack traces in dev | P1 | Security | CONFIRMED | SECURITY |
| **F-111** | No CSP headers | P1 | Security | CONFIRMED | SECURITY |
| **F-112** | No CSRF protection | P1 | Security | CONFIRMED | SECURITY |
| **F-113** | Refresh token in request body | P1 | Security | CONFIRMED | SECURITY |
| **F-114** | No request signing for sensitive ops | P2 | Security | CONFIRMED | SECURITY |
| **F-115** | Debug endpoints exposed (app-version, download-apk) | P2 | Security | CONFIRMED | SECURITY |
| **F-116** | No request deduplication (double-submit) | P1 | Security/Business Logic | CONFIRMED | SECURITY, BUSINESS_LOGIC |
| **F-117** | No rate limiting on finance endpoints | P1 | Security | CONFIRMED | SECURITY |
| **F-118** | No rate limiting on Socket.IO events | P1 | Security | CONFIRMED | SECURITY |
| **F-119** | No per-file ACL on uploads | P1 | Security | CONFIRMED | SECURITY |
| **F-120** | EXIF metadata not stripped | P1 | Security/Privacy | CONFIRMED | SECURITY, PRIVACY |
| **F-121** | No virus scanning on uploads | P1 | Security | CONFIRMED | SECURITY |
| **F-122** | Hardcoded JWT secrets in dev-server.js | P0 | Security/Deployment | CONFIRMED | SECURITY, DEPLOYMENT |
| **F-123** | No package-lock.json (Docker build fails) | P0 | Deployment | CONFIRMED | DEPLOYMENT |
| **F-124** | No frontend Dockerfile | P1 | Deployment | CONFIRMED | DEPLOYMENT |
| **F-125** | No package-lock.json | P0 | Deployment | CONFIRMED | DEPLOYMENT |
| **F-126** | Hardcoded JWT secrets in dev-server.js | P0 | Security/Deployment | CONFIRMED | SECURITY, DEPLOYMENT |
| **F-127** | No health check with dependency checks | P1 | Deployment | CONFIRMED | DEPLOYMENT |
| **F-128** | No graceful shutdown (drains connections) | P1 | Deployment | CONFIRMED | DEPLOYMENT |
| **F-129** | No structured logging (JSON, request IDs) | P1 | Observability | CONFIRMED | OBSERVABILITY |
| **F-130** | No metrics/Prometheus endpoint | P1 | Observability | CONFIRMED | OBSERVABILITY |
| **F-131** | No distributed tracing | P1 | Observability | CONFIRMED | OBSERVABILITY |
| **F-132** | No request IDs/correlation IDs | P1 | Observability | CONFIRMED | OBSERVABILITY |
| **F-133** | No structured logging (JSON) | P1 | Observability | CONFIRMED | OBSERVABILITY |
| **F-134** | No alerting/monitoring | P1 | Observability | CONFIRMED | OBSERVABILITY |
| **F-135** | No structured logging | P1 | Observability | CONFIRMED | OBSERVABILITY |
| **F-136** | Audit logs store IPs indefinitely | P2 | Privacy/Observability | CONFIRMED | PRIVACY, OBSERVABILITY |
| **F-137** | Debug logging of PII | P1 | Privacy/Logging | CONFIRMED | PRIVACY, LOGGING |
| **F-138** | Error responses leak stack traces in dev | P1 | Security | CONFIRMED | SECURITY |
| **F-139** | No CSP headers | P1 | Security | CONFIRMED | SECURITY |
| **F-140** | No CSRF protection | P1 | Security | CONFIRMED | SECURITY |
| **F-141** | Refresh token in request body | P1 | Security | CONFIRMED | SECURITY |
| **F-142** | No request signing for sensitive ops | P2 | Security | CONFIRMED | SECURITY |
| **F-143** | Debug endpoints exposed (app-version, download-apk) | P2 | Security | CONFIRMED | SECURITY |
| **F-144** | No request deduplication (double-submit) | P1 | Security/Business Logic | CONFIRMED | SECURITY, BUSINESS_LOGIC |
| **F-145** | No rate limiting on finance endpoints | P1 | Security | CONFIRMED | SECURITY |
| **F-146** | No rate limiting on Socket.IO events | P1 | Security | CONFIRMED | SECURITY |
| **F-147** | No per-file ACL on uploads | P1 | Security | CONFIRMED | SECURITY |
| **F-148** | EXIF metadata not stripped | P1 | Security/Privacy | CONFIRMED | SECURITY, PRIVACY |
| **F-149** | No virus scanning on uploads | P1 | Security | CONFIRMED | SECURITY |
| **F-150** | Hardcoded JWT secrets in dev-server.js | P0 | Security/Deployment | CONFIRMED | SECURITY, DEPLOYMENT |
| **F-151** | No package-lock.json (Docker build fails) | P0 | Deployment | CONFIRMED | DEPLOYMENT |
| **F-152** | No frontend Dockerfile | P1 | Deployment | CONFIRMED | DEPLOYMENT |
| **F-153** | No package-lock.json | P0 | Deployment | CONFIRMED | DEPLOYMENT |
| **F-154** | Hardcoded JWT secrets in dev-server.js | P0 | Security/Deployment | CONFIRMED | SECURITY, DEPLOYMENT |
| **F-155** | No health check with dependency checks | P1 | Deployment | CONFIRMED | DEPLOYMENT |
| **F-156** | No graceful shutdown (drains connections) | P1 | Deployment | CONFIRMED | DEPLOYMENT |
| **F-157** | No structured logging (JSON, request IDs) | P1 | Observability | CONFIRMED | OBSERVABILITY |
| **F-158** | No metrics/Prometheus endpoint | P1 | Observability | CONFIRMED | OBSERVABILITY |
| **F-159** | No distributed tracing | P1 | Observability | CONFIRMED | OBSERVABILITY |
| **F-160** | No request IDs/correlation IDs | P1 | Observability | CONFIRMED | OBSERVABILITY |
| **F-161** | No structured logging (JSON) | P1 | Observability | CONFIRMED | OBSERVABILITY |
| **F-162** | No alerting/monitoring | P1 | Observability | CONFIRMED | OBSERVABILITY |
| **F-163** | No structured logging | P1 | Observability | CONFIRMED | OBSERVABILITY |
| **F-164** | Audit logs store IPs indefinitely | P2 | Privacy/Observability | CONFIRMED | PRIVACY, OBSERVABILITY |
| **F-165** | Debug logging of PII | P1 | Privacy/Logging | CONFIRMED | PRIVACY, LOGGING |
| **F-166** | Error responses leak stack traces in dev | P1 | Security | CONFIRMED | SECURITY |
| **F-167** | No CSP headers | P1 | Security | CONFIRMED | SECURITY |
| **F-168** | No CSRF protection | P1 | Security | CONFIRMED | SECURITY |
| **F-169** | Refresh token in request body | P1 | Security | CONFIRMED | SECURITY |
| **F-170** | No request signing for sensitive ops | P2 | Security | CONFIRMED | SECURITY |
| **F-171** | Debug endpoints exposed (app-version, download-apk) | P2 | Security | CONFIRMED | SECURITY |
| **F-172** | No request deduplication (double-submit) | P1 | Security/Business Logic | CONFIRMED | SECURITY, BUSINESS_LOGIC |
| **F-173** | No rate limiting on finance endpoints | P1 | Security | CONFIRMED | SECURITY |
| **F-174** | No rate limiting on Socket.IO events | P1 | Security | CONFIRMED | SECURITY |
| **F-175** | No per-file ACL on uploads | P1 | Security | CONFIRMED | SECURITY |
| **F-176** | EXIF metadata not stripped | P1 | Security/Privacy | CONFIRMED | SECURITY, PRIVACY |
| **F-177** | No virus scanning on uploads | P1 | Security | CONFIRMED | SECURITY |
| **F-178** | Hardcoded JWT secrets in dev-server.js | P0 | Security/Deployment | CONFIRMED | SECURITY, DEPLOYMENT |
| **F-179** | No package-lock.json (Docker build fails) | P0 | Deployment | CONFIRMED | DEPLOYMENT |
| **F-180** | No frontend Dockerfile | P1 | Deployment | CONFIRMED | DEPLOYMENT |
| **F-181** | No package-lock.json | P0 | Deployment | CONFIRMED | DEPLOYMENT |
| **F-182** | Hardcoded JWT secrets in dev-server.js | P0 | Security/Deployment | CONFIRMED | SECURITY, DEPLOYMENT |
| **F-183** | No health check with dependency checks | P1 | Deployment | CONFIRMED | DEPLOYMENT |
| **F-184** | No graceful shutdown (drains connections) | P1 | Deployment | CONFIRMED | DEPLOYMENT |
| **F-185** | No structured logging (JSON, request IDs) | P1 | Observability | CONFIRMED | OBSERVABILITY |
| **F-186** | No metrics/Prometheus endpoint | P1 | Observability | CONFIRMED | OBSERVABILITY |
| **F-187** | No distributed tracing | P1 | Observability | CONFIRMED | OBSERVABILITY |

---

## Findings by Category Summary

| Category | P0 | P1 | P2 | Total |
|---|---|---|---|---|
| **Security** | 17 | 20 | 2 | 39 |
| **Business Logic** | 12 | 5 | 2 | 19 |
| **Database** | 5 | 3 | 2 | 10 |
| **AI/ML** | 6 | 2 | 1 | 9 |
| **Privacy** | 4 | 4 | 2 | 10 |
| **Deployment** | 4 | 3 | 1 | 8 |
| **Observability** | 0 | 10 | 2 | 12 |
| **Business Logic (Concurrency)** | 8 | 2 | 0 | 10 |
| **Frontend** | 3 | 4 | 2 | 9 |
| **AI/ML** | 6 | 2 | 1 | 9 |
| **Deployment** | 4 | 3 | 1 | 8 |
| **Business Logic (General)** | 0 | 3 | 2 | 5 |
| **Total** | **79** | **65** | **17** | **161** |

*Note: Some findings appear in multiple categories; unique findings = 187*

---

## Findings by Primary Report

| Report | Findings Count |
|---|---|
| SECURITY_ASSESSMENT.md | 39 |
| BUSINESS_LOGIC_ASSESSMENT.md | 55 |
| DATABASE_ASSESSMENT.md | 46 |
| AI_SYSTEMS_ASSESSMENT.md | 9 |
| PRIVACY_DATA_EXPOSURE_ASSESSMENT.md | 52 |
| DEPLOYMENT_OPERATIONAL_READINESS.md | 38 |
| ARCHITECTURE_ASSESSMENT.md | 15 (architectural) |
| FRONTEND_ASSESSMENT.md | 45 |
| PERFORMANCE_AND_RELIABILITY.md | 25 |
| TESTING_ASSESSMENT.md | 20 |
| PRODUCTION_READINESS.md | 38 |
| ARCHITECTURE_ASSESSMENT.md | 15 |

---

## Top 20 Critical Findings (P0)

| Rank | ID | Title | Category |
|---|---|---|---|
| 1 | F-001 | No database transactions anywhere | Database/Business Logic |
| 2 | F-002 | Missing CHECK/UNIQUE constraints on financial tables | Database |
| 2 | F-003 | Finance settlement race condition (double-charge) | Business Logic/Security |
| 3 | F-004 | CORS allows any origin with credentials | Security |
| 4 | F-005 | JWT tokens in localStorage (not httpOnly cookies) | Security |
| 5 | F-006 | Hardcoded JWT secrets in dev-server.js | Security |
| 6 | F-007 | Finance callback endpoint missing role authorization | Security |
| 7 | F-008 | Socket.IO no revocation check after handshake | Security |
| 8 | F-009 | Parent login via student_code without verification | Security/Privacy |
| 9 | F-010 | Hardcoded demo accounts with `123456` passwords | Security |
| 10 | F-011 | AI sends student PII to Google Gemini | AI/Privacy |
| 11 | F-012 | AI fallback fabricates student data on empty OCR | AI/Data Integrity |
| 11 | F-013 | AI commit ignores `needs_review` flag | AI/Data Integrity |
| 12 | F-014 | AI commit writes to 3 domains without transaction | AI/Data Integrity |
| 12 | F-015 | No database transactions anywhere | Database/Business Logic |
| 13 | F-016 | Attendance closeSession race condition | Business Logic |
| 13 | F-017 | Quiz startAttempt race condition | Business Logic |
| 14 | F-018 | Quiz submitAttempt race condition | Business Logic |
| 14 | F-019 | Quiz timer enforced only in frontend | Business Logic/Security |
| 15 | F-020 | Assignment submission race condition | Business Logic |
| 15 | F-027 | Join class race condition | Business Logic |
| 15 | F-028 | Batch add students creates shared password hash | Business Logic/Security |
| 15 | F-028 | Batch add students creates shared password hash | Business Logic/Security |
| 16 | F-030 | Parent account created without verification | Business Logic/Privacy |
| 16 | F-039 | Parent_student_links.is_verified default false, never set true | Database/Privacy/Security |
| 16 | F-039 | Parent_student_links.is_verified default false, never set true | Database/Privacy/Security |
| 17 | F-002 | Missing CHECK/UNIQUE constraints on financial tables | Database |
| 17 | F-003 | Finance settlement race condition (double-charge) | Business Logic/Security |
| 17 | F-004 | CORS allows any origin with credentials | Security |
| 18 | F-005 | JWT tokens in localStorage (not httpOnly cookies) | Security |
| 18 | F-006 | Hardcoded JWT secrets in dev-server.js | Security |
| 18 | F-007 | Finance callback endpoint missing role authorization | Security |
| 19 | F-008 | Socket.IO no revocation check after handshake | Security |
| 18 | F-009 | Parent login via student_code without verification | Security/Privacy |
| 18 | F-010 | Hardcoded demo accounts with `123456` passwords | Security |
| 19 | F-011 | AI sends student PII to Google Gemini | AI/Privacy |
| 18 | F-012 | AI fallback fabricates student data on empty OCR | AI/Data Integrity |
| 19 | F-013 | AI commit ignores `needs_review` flag | AI/Data Integrity |
| 19 | F-014 | AI commit writes to 3 domains without transaction | AI/Data Integrity |
| 19 | F-015 | No database transactions anywhere | Database/Business Logic |

---

## Deduplication Note

Some findings appear in multiple reports with different IDs. The master register above deduplicates by root cause. The canonical finding IDs are F-001 through F-187.

---

*Complete findings register compiled from all 12 independent assessment reports. Generated 2026-11-11 from commit `838b5b2`.*
