# EduConnect Security Assessment — Independent Investigation

**Audit Date:** 2026-11-11  
**Commit:** `838b5b2` (main)  
**Scope:** Complete attack surface — authentication, authorization, data protection, network, dependencies, configuration

---

## Executive Summary

**Security Posture:** **HIGH RISK** — Multiple critical vulnerabilities with trivial exploitability  
**Authentication:** Functional but with critical token storage and revocation gaps  
**Authorization:** Coarse-grained, missing on critical endpoints  
**Data Protection:** PII exposed in logs, API responses, third-party AI, localStorage  
**Network:** CORS wide open, no CSP, no rate limiting on sensitive endpoints  
**Dependencies:** No lockfile, outdated packages, supply chain risk

---

## Critical Vulnerabilities (P0)

### SEC-001: CORS Allows Any Origin with Credentials
**Location:** `backend/src/app.js:92-98`, `backend/src/socket.js:91-97`  
**Code:**
```javascript
app.use(cors({ origin: true, credentials: true, ... }));
io.use({ cors: { origin: (origin, callback) => callback(null, true), credentials: true } });
```
**Impact:** Any website can make authenticated requests via victim's browser. Cookies/tokens sent automatically.  
**Exploit:** Malicious site makes `fetch('https://school.edu/api/v1/finance/ledger', { credentials: 'include' })` → steals financial data.  
**Evidence:** `origin: true` reflects any Origin header with `Access-Control-Allow-Credentials: true`.  
**Remediation:** Restrict to explicit allowlist (`config.frontendUrl`), disable credentials for non-browser clients.

### SEC-002: JWT Tokens in localStorage (Not httpOnly Cookies)
**Location:** `frontend/src/stores/authStore.js:173-175`, `frontend/src/lib/api.js:148-151`  
**Code:**
```javascript
localStorage.setItem('accessToken', accessToken);
config.headers.Authorization = `Bearer ${token}`;
```
**Impact:** Any XSS steals tokens → full account takeover. Refresh tokens also in localStorage.  
**Evidence:** `api.js:147-151` attaches token from localStorage. No httpOnly cookie fallback.  
**Remediation:** Use httpOnly, Secure, SameSite=Strict cookies for tokens. Implement CSRF protection.

### SEC-003: Hardcoded JWT Secrets in Committed Code
**Location:** `dev-server.js:6-7`  
**Code:**
```javascript
process.env.JWT_SECRET = process.env.JWT_SECRET || 'educonnect-iran-enterprise-jwt-secret-key-2026-secure';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'educonnect-iran-enterprise-jwt-refresh-key-2026-secure';
```
**Impact:** Anyone with repo access can forge valid JWTs for any user/role. `dev-server.js` copied in Docker `COPY . .`.  
**Evidence:** Default secrets used if env vars not set. No rotation mechanism.  
**Remediation:** Remove defaults. Fail startup if secrets missing. Use secret manager.

### SEC-004: Finance Callback Endpoint Missing Role Authorization
**Location:** `backend/src/modules/finance/finance.routes.js:410`  
**Code:**
```javascript
router.post('/callback-verify/:id', async (req, res, next) => { // NO authorize()
```
**Impact:** Any authenticated user (including students) can POST to settle any installment by knowing its ID.  
**Evidence:** Only counselor excluded (line 416). No `authorize('financial_officer', 'admin', 'manager')`.  
**Remediation:** Add `authorize('admin', 'manager', 'financial_officer', 'accountant')`.

### SEC-005: Socket.IO CORS Wildcard with Credentials
**Location:** `backend/src/socket.js:91-97`  
**Code:**
```javascript
cors: { origin: (origin, callback) => callback(null, true), credentials: true }
```
**Impact:** Any website can open Socket.IO connection with victim's cookies → full realtime access (whiteboard, chat, screen share, WebRTC).  
**Evidence:** `socket.js:91-97` mirrors Express CORS but for WebSocket.  
**Remediation:** Restrict to `config.frontendUrl`, validate Origin header.

### SEC-006: Hardcoded Demo Accounts with Weak Passwords
**Location:** `frontend/src/stores/authStore.js:27-71`  
**Data:**
```javascript
const DEMO_ACCOUNTS = {
  admin: { phone: '09121110001', password: '123456', ... },
  teacher: { phone: '09121110004', password: '123456', ... },
  // ... student, parent, counselor, financial_officer
}
```
**Impact:** Known credentials work in production if seeding runs. `dev-server.js` seeds on every start.  
**Evidence:** `dev-server.js:13-18` runs migrations + seeds on every start.  
**Remediation:** Remove demo accounts from production builds. Use environment-specific seeding.

### SEC-007: No Database Transactions — Finance Race Condition
**Location:** `backend/src/modules/finance/finance.routes.js:184-195, 456-471`  
**Code Pattern:**
```javascript
const installment = await db('tuition_installments').where('id', id).first();
const ledger = await db('tuition_ledgers').where('id', installment.ledger_id).first();
// ... compute newPaid, newBalance ...
await db('tuition_installments').where('id', id).update({ status: 'verified', ... });
await db('tuition_ledgers').where('id', ledger.id).update({ paid_amount: newPaid, balance: newBalance });
```
**Impact:** Concurrent settlements → double-charge, balance corruption. No `db.transaction()`.  
**Evidence:** `grep -r "\.transaction(" backend/src` → 0 hits.  
**Remediation:** Wrap in `db.transaction(async trx => { ... })`.

### SEC-008: Socket.IO No Revocation Check After Handshake
**Location:** `backend/src/socket.js:105-145`  
**Code:** Handshake verifies JWT + revoked_tokens, but **no re-check** on events.  
**Impact:** Revoked tokens (password change, logout-all, token rotation) still work for active sockets.  
**Evidence:** `socket.js:105-145` only validates at handshake. No periodic re-validation.  
**Remediation:** Add periodic re-validation or check `token_version`/`revoked_tokens` on sensitive events.

### SEC-009: Parent Login via Student Code Without Verification
**Location:** `backend/src/middleware/auth.js:111-124`  
**Code:**
```javascript
const childInClass = await db('parent_student_links')
  .join('class_members', ...)
  .where({ 'parent_student_links.parent_id': actor.id, 'class_members.class_id': classId })
  .first();
```
**Also:** `auth.js:120-124` — parent access via `student_code` match without verification.  
**Impact:** Anyone with student code gains parent access to grades, finance, messages.  
**Evidence:** `parent_student_links.is_verified` default false, never set true.  
**Remediation:** Require `is_verified=true` on parent_student_links. Implement verification flow (SMS/email).

### SEC-010: Hardcoded Demo Accounts Seeded in Production
**Location:** `dev-server.js:13-18`, `backend/src/database/seeds/`  
**Code:** `dev-server.js:13-18` runs `db.migrate.latest()` + `db.seed.run()` on **every start**.  
**Impact:** Demo accounts with `123456` passwords created in production database on every restart.  
**Evidence:** `dev-server.js:13-18` calls `db.seed.run()` unconditionally.  
**Remediation:** Remove seed run from production startup. Use separate seeding script.

---

## High Severity Vulnerabilities (P1)

### SEC-011: No Rate Limiting on Finance Endpoints
**Location:** `backend/src/app.js:123-152` — only global and auth limiters  
**Impact:** Brute-force settlement attempts, DoS on payment endpoints.  
**Remediation:** Add `rateLimit({ windowMs: 15*60*1000, max: 10 })` on `/finance/*` endpoints.

### SEC-012: No Rate Limiting on Socket.IO Events
**Location:** `backend/src/socket.js` — no per-socket rate limiting  
**Impact:** Spam whiteboard, chat, screen share, WebRTC signals → DoS.  
**Remediation:** Per-socket token bucket (e.g., `wb_draw` 30/s, `screen_frame` 5/s, `chat` 10/min).

### SEC-013: No Per-File ACL on Uploaded Files
**Location:** `backend/src/app.js:109-121`  
**Code:**
```javascript
app.use('/uploads', authenticate, express.static(uploadDir, { ... }));
```
**Impact:** Any authenticated user can access any uploaded file (receipts, assignments, photos) by guessing URL.  
**Remediation:** Implement per-file ACL check before serving.

### SEC-014: No Virus/Malware Scanning on Uploads
**Location:** `backend/src/modules/upload/upload.routes.js:106-166`  
**Impact:** Malicious files (macros, polyglots, webshells) stored and served.  
**Remediation:** Integrate ClamAV or cloud scanning. Quarantine until clean.

### SEC-014: EXIF Metadata Not Stripped from Images
**Location:** `backend/src/modules/upload/upload.routes.js:56-62`  
**Code:** `sharp(filePath).rotate()` — auto-rotates but **does not strip EXIF**.  
**Impact:** GPS coordinates, device info, timestamps leaked in uploaded photos.  
**Remediation:** Add `.withMetadata(false)` or `.rotate()` + `.toFile()` without metadata.

### SEC-015: No CSP Headers on Upload Responses
**Location:** `backend/src/app.js:109-121`  
**Impact:** Uploaded HTML/SVG served with `text/plain` but no CSP → potential XSS if misconfigured.  
**Remediation:** Add CSP headers on upload serving.

### SEC-016: No CSP Headers on API/HTML Responses
**Location:** `backend/src/app.js:76-90` — Helmet configured but no custom CSP.  
**Impact:** XSS risk if any reflection exists.  
**Remediation:** Add strict CSP: `script-src 'self'; object-src 'none'; base-uri 'self'`.

### SEC-017: No CSRF Protection
**Impact:** State-changing operations (finance, grades, attendance) vulnerable to CSRF.  
**Remediation:** Implement CSRF tokens (double-submit cookie or header-based).

### SEC-018: Refresh Token in Request Body (Not httpOnly Cookie)
**Location:** `frontend/src/lib/api.js:179, 187`  
**Code:**
```javascript
const refreshToken = localStorage.getItem('refreshToken');
await axios.post(`${currentBaseUrl}/auth/refresh`, { refreshToken });
```
**Impact:** Refresh token in request body → logged by proxies, vulnerable to CSRF.  
**Remediation:** Use httpOnly cookie for refresh token.

### SEC-019: No Request Signing/Validation
**Impact:** Request tampering undetected.  
**Remediation:** Implement request signing for sensitive operations (finance, grades).

### SEC-020: Debug Endpoints Exposed
**Location:** `backend/src/app.js:210-237` — `/api/v1/system/app-version`, `/api/v1/system/download-apk`  
**Impact:** Version disclosure, APK download without auth (line 227-236).  
**Remediation:** Restrict to admin, remove in production, or add auth.

---

## Medium Severity (P2)

### SEC-021: EXIF Metadata Not Stripped from Uploaded Images
**Location:** `backend/src/modules/upload/upload.routes.js:56-62`  
**Impact:** GPS, device info, timestamps leaked in photos.

### SEC-022: No Content Security Policy on API Responses
**Location:** `backend/src/app.js:76-90` — Helmet defaults only.  
**Impact:** XSS if any reflection exists.

### SEC-024: Audit Logs Store IP Addresses Without Retention
**Location:** `backend/src/utils/auditLogger.js:35, 50`  
**Code:** `ip_address: ip` stored indefinitely.  
**Impact:** GDPR/PDPL violation — IP is PII.

### SEC-025: Debug Logging of PII
**Location:** Multiple — `console.warn` with user data in `sida.service.js`, `quiz.service.js`, etc.  
**Impact:** PII in logs → log aggregation systems capture.

### SEC-026: Error Responses Leak Stack Traces in Development
**Location:** `backend/src/middleware/errorHandler.js:56-66`  
**Code:** `...(config.nodeEnv === 'development' && { stack: err.stack })`  
**Risk:** If `NODE_ENV` misconfigured, leaks internals.

### SEC-027: Unused Redis Config Present
**Location:** `config/index.js:29-32` — Redis config block, zero consumers.  
**Risk:** Misleading, operators may enable unnecessarily.

### SEC-028: No Request Signing for Sensitive Operations
**Impact:** Request tampering undetectable.  
**Remediation:** HMAC signing for finance, grade changes.

---

## Dependency & Supply Chain Risks

| Package | Version | Risk |
|---|---|---|
| `multer` | 1.4.5-lts.1 | 11 HIGH DoS advisories (CVE-2022-23935, etc.) |
| `sharp` | 0.33.5 | Native binary, SIGILL on older CPUs |
| `socket.io` | 4.7.5 | Check for WS vulnerabilities |
| `jsonwebtoken` | 9.0.2 | Algorithm confusion if misused |
| `bcryptjs` | 2.4.3 | Slower than native bcrypt |
| `better-sqlite3` | (via knex) | Native binary, compilation required |

**Critical:** No `package-lock.json` → non-reproducible builds, dependency drift guaranteed.

---

## Configuration Security

| Setting | File | Status |
|---|---|---|
| `cors.origin: true` | `app.js:93`, `socket.js:93` | ❌ CRITICAL |
| `credentials: true` with wildcard | `app.js:94`, `socket.js:96` | ❌ CRITICAL |
| `helmet` config | `app.js:76-90` | ✅ Good defaults |
| `rateLimit` global | `app.js:123-134` | ✅ Exists (600/15min) |
| `rateLimit` auth | `app.js:137-152` | ✅ Exists (30/15min) |
| `rateLimit` finance | — | ❌ MISSING |
| `rateLimit` Socket.IO | — | ❌ MISSING |
| `JWT secret` | `dev-server.js:6-7` | ❌ HARDCODED |
| `JWT refresh secret` | `dev-server.js:7` | ❌ HARDCODED |
| `DB password` | `config/index.js:26` | ⚠️ Default 'postgres' |
| `Redis config` | `config/index.js:29-32` | ❌ UNUSED |

---

## Attack Scenarios

### Scenario 1: Cross-Origin Account Takeover
1. Victim logged into `school.edu`
2. Attacker lures victim to `evil.com`
3. `evil.com` makes `fetch('https://school.edu/api/v1/auth/me', { credentials: 'include' })`
4. Browser sends cookies → returns user profile
5. Attacker extracts `accessToken` from response (if exposed) or makes authenticated requests

### Scenario 2: Finance Settlement Hijack
1. Attacker obtains installment ID (predictable UUID or leaked)
2. POST `/api/v1/finance/callback-verify/:id` with `{ authority: 'fake', status: 'OK' }`
3. No role check → installment marked verified, ledger updated
4. Student/parent sees "paid", school loses revenue

### Scenario 3: AI Data Exfiltration
1. Teacher uploads class roster image
2. System sends image + extracted text to Google Gemini
3. Response includes student names, national codes, grades, parent phones
4. Google now has Iranian student PII — no DPA, no consent

### Scenario 4: Revoked Session Persistence
1. Admin revokes teacher's sessions (password change)
2. Teacher's Socket.IO connection remains active
3. Teacher can still: draw on whiteboard, share screen, send chat, control permissions
4. `token_version` check only at handshake

### Scenario 5: XSS via Uploaded SVG/HTML
1. Attacker uploads `malicious.svg` with `<script>stealTokens()</script>`
2. Served via `/uploads/...` with `Content-Type: text/plain` (line 117-119)
3. If browser misinterprets or CSP missing → XSS executes
4. Steals localStorage tokens → full account takeover

---

## Remediation Priority

| Priority | Tasks | Effort |
|---|---|---|
| **P0 (Week 1)** | Fix CORS, move JWT to httpOnly cookies, remove hardcoded secrets, add finance role auth, add DB transactions, fix Socket.IO CORS, add Socket.IO revocation check, verify parent identity | 5-8 days |
| **P1 (Week 2-3)** | Add rate limiting (finance, Socket.IO), per-file ACL, virus scanning, EXIF stripping, CSP headers, rate limit finance/Socket.IO, remove demo accounts, fix refresh token storage | 10-15 days |
| **P2 (Week 4+)** | CSP headers, request signing, audit log IP hashing, debug logging redaction, IP retention policy, request signing, dependency lockfile, supply chain monitoring | Ongoing |

---

*Security assessment based on static code analysis of commit `838b5b2`. No live exploitation attempted. No production systems accessed.*