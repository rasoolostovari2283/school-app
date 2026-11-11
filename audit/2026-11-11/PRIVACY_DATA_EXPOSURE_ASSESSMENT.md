# Privacy & Sensitive-Data Exposure Assessment — EduConnect

**Independent read-only assessment** @ `main` `838b5b2` · 2026-11-11  
**Scope:** Collection, storage, processing, transmission, logging, and deletion of sensitive data across backend, frontend, AI services, and third-party integrations.

---

## Executive Summary

| Category | Critical (P0) | High (P1) | Medium (P2) | Total |
|---|---|---|---|---|
| Student/Parent PII Collection | 3 | 2 | 2 | 7 |
| Academic Records Exposure | 2 | 3 | 2 | 7 |
| Financial Data Exposure | 2 | 2 | 1 | 5 |
| Uploaded Documents | 1 | 2 | 1 | 4 |
| API/Frontend State Leakage | 2 | 3 | 2 | 7 |
| Logging & Error Messages | 2 | 2 | 2 | 6 |
| Third-Party AI Services | 2 | 2 | 1 | 5 |
| Data Retention/Deletion | 1 | 2 | 2 | 5 |
| Access Control Gaps | 3 | 2 | 1 | 6 |
| **TOTAL** | **18** | **20** | **14** | **52** |

**Overall Risk Level:** **HIGH** — Multiple P0 findings involving unnecessary PII collection, insufficient access controls on financial/academic data, PII leakage in logs/API responses, and third-party AI processing of student data without adequate safeguards.

---

## 1. Student & Parent Personal Information

### PRIV-001: Excessive PII Collection at Registration — **P0**
- **Location:** `auth.service.js:56-125` (`register`), `auth.service.js:131-212` (`registerSchool`)
- **Data Collected:** `email`, `phone`, `display_name`, `password`, `role`, `school_id`, `school_code`, `locale`, `username` (auto-generated), `student_code` (auto-generated), `personnel_code` (auto-generated), `settings` (JSON blob)
- **Issues:**
  - `phone` and `email` marked `unique` globally in migration 001, then changed to school-scoped in 016 — but collection still happens without purpose limitation notice
  - `settings` JSON blob accepts arbitrary data (`auth.service.js:118`, `165`) — no schema validation
  - `registerSchool` stores admin phone in `users.phone` and school settings in `users.settings` JSON — mixes admin contact with school metadata
- **Exposure:** Phone/email used as login identifiers; if compromised, enables account takeover
- **Mitigation:** Implement data minimization — collect only required fields; add privacy notice; validate `settings` schema

### PRIV-002: National ID (کد ملی) Stored in Plaintext — **P0**
- **Location:** `users.settings` JSON (`auth.service.js:215-224` in `sida.service.js`), `student_study_notes`, `teacher_documents`
- **Evidence:** `sida.service.js:215-224` stores `national_code` in `users.settings` JSON blob
- **Evidence:** `paperToDigital.service.js:130-136` extracts `national_code` via AI and stores in extracted items
- **Risk:** Iranian national codes are sensitive PII (equivalent to SSN); plaintext storage enables identity theft if DB compromised
- **Mitigation:** Encrypt at rest (column-level encryption); hash for lookup; never log

### PRIV-003: Parent Phone Numbers Stored Without Consent Tracking — **P1**
- **Location:** `sida.service.js:101-102, 267-298` (`importRoster`), `class.service.js:508-538` (`addStudentToClass`)
- **Issue:** Parent phone extracted from roster/CSV and stored in `users.phone` and `users.settings.parent_phone`; `parent_student_links` created with `is_verified=false` but never verified
- **Risk:** Parent contact info collected from student roster without explicit parent consent; used for SMS notifications without opt-in
- **Mitigation:** Require explicit parent consent flow; store consent timestamp; allow opt-out

### PRIV-004: Student Code (کد دانش‌آموزی) Used as Parent Lookup Key — **P1**
- **Location:** `auth.js:111-124` (`assertOwnsClass` parent branch), `authStore.js:63-66` (demo parent has `student_code`)
- **Issue:** Parent login allows matching via `student_code` (`auth.js:120-124`): `where({ student_code: req.user.student_code, role: 'student', school_id: req.user.school_id })`
- **Risk:** Any parent who knows a student's code can link to that student's account; no verification of actual relationship
- **Mitigation:** Require verified parent_student_links; remove student_code fallback

### PRIV-005: Demo Accounts with Hardcoded Credentials in Production Code — **P0**
- **Location:** `authStore.js:27-71` (`DEMO_ACCOUNTS`), `dev-server.js:6-7`
- **Data:** 6 demo accounts (admin, teacher, counselor, financial_officer, student, parent) with phone `09121110001`-`09122220001` and password `123456`
- **Risk:** These credentials work in production if `dev-server.js` runs or seeds execute; `dev-server.js:6-7` has hardcoded JWT secrets
- **Mitigation:** Remove demo accounts from production builds; use environment-specific seeding

### PRIV-006: Username Auto-Generated from Display Name — **P2**
- **Location:** `usernameHelper.js` (referenced in `auth.service.js:91-93`), `message.service.js:88-90`
- **Issue:** Username derived from `display_name` via Persian-to-Latin transliteration; predictable and potentially revealing
- **Risk:** Username enumeration reveals user existence; Persian names transliterated may reveal ethnicity
- **Mitigation:** Allow user-chosen username; add random suffix; rate-limit username lookup

### PRIV-007: Student/Parent Data in Frontend localStorage — **P1**
- **Location:** `authStore.js:98-100, 126-129, 151-153, 173-175, 193-196, 213-216, 227-230`
- **Data Stored:** `user_profile` (full user object), `accessToken`, `refreshToken`, `locale`
- **Risk:** Full user profile (including `school_id`, `student_code`, `settings` with national_code) in localStorage — accessible via XSS; tokens in localStorage vulnerable to theft
- **Mitigation:** Use httpOnly cookies for tokens; minimize localStorage to non-sensitive data; implement CSP

---

## 2. Academic Records & Grades

### PRIV-008: Gradebook Data Accessible Beyond Need-to-Know — **P0**
- **Location:** `gradebook.routes.js:31-118` (`GET /gradebook/classes/:classId`)
- **Response Includes:** All students' `id`, `display_name`, `student_code`, `email`, all category scores, weighted averages, teacher comments
- **Access Control:** Only checks `assertOwnsClass` with `allowEnrolled: true` — students see only their own row; parents see only their children's rows (via `parent_student_links`)
- **Gap:** Teachers see **all** students' grades in class; admins see all classes in school; no audit of who accessed which grades
- **Risk:** Grade data is highly sensitive; excessive access increases breach impact
- **Mitigation:** Implement "minimum necessary" — teachers see only their classes; add access logging; implement grade freeze after term

### PRIV-009: Report Card Exposes Discipline Data — **P1**
- **Location:** `gradebook.routes.js:639-644` (`handleGetReportCard`)
- **Code:** `disciplineRecords` fetched and `disciplineScore` calculated from `discipline_records.points`; included in report card response
- **Risk:** Discipline records (warnings, point deductions) included in academic report without separate consent; `points` can be negative (deductions) — not validated
- **Mitigation:** Separate discipline report; require explicit inclusion; validate points range

### PRIV-010: Sida Export Includes Full Student PII — **P1**
- **Location:** `sida.service.js:327-445` (`exportClassGradesForSida`)
- **CSV Export Includes:** `national_code`, `student_code`, `full_name`, `father_name`, `grade`, `class_name`, `subject`, `continuous_score`, `final_score`, `weighted_average`, `pass_status`
- **Risk:** Full PII + grades exported as CSV; no audit of who exported; CSV downloadable by any teacher with class access
- **Mitigation:** Require admin approval for Sida export; pseudonymize national codes; audit export events

### PRIV-010: Report Card Includes Parent/Child Linkage — **P2**
- **Location:** `gradebook.routes.js:516-550` (`handleGetReportCard` parent branch)
- **Code:** Returns `availableChildren` array with `id`, `display_name`, `student_code`, `avatar_url`, `school_id`, `relation`
- **Risk:** Parent sees all linked children's metadata; if parent account compromised, all children's data exposed
- **Mitigation:** Minimize parent dashboard data; require re-auth for child switching

### PRIV-011: Grade History Not Preserved — **P2**
- **Location:** `gradebook.routes.js:219-226` (`UPSERT_GRADEBOOK_SCORE` logs previous_score in audit)
- **Issue:** Only `previous_score` logged in `audit_logs`; no immutable grade history table; teachers can overwrite grades without trace beyond audit log
- **Risk:** Grade tampering undetectable if audit log purged; no transcript integrity
- **Mitigation:** Implement `gradebook_score_history` table with immutable inserts; digital signatures on final grades

---

## 3. Financial Information

### PRIV-012: Financial Ledger Accessible to Teachers — **P0**
- **Location:** `finance.routes.js:19-90` (`GET /finance/ledger`)
- **Code:** Teachers with `assertTeacherOfStudent` can view any student's ledger in their class (`finance.routes.js:53-56`)
- **Response Includes:** `total_amount`, `discount_amount`, `paid_amount`, `balance`, `status`, all installments with `amount`, `due_date`, `status`, `tracking_number`, `bank_name`, `paid_at`
- **Risk:** Teachers (not financial staff) can view full family financial data; no segregation of duties
- **Mitigation:** Restrict finance access to `financial_officer`, `accountant`, `admin` roles only; teachers should not see financial data

### PRIV-013: Payment Receipt URLs Exposed — **P1**
- **Location:** `finance.routes.js:96-155` (`POST /pay-installment`), `finance.routes.js:106-122` (`handlePaySubmit` in frontend)
- **Data:** `receipt_url` stored in `tuition_installments.receipt_url`; returned in API responses
- **Risk:** Receipt URLs may contain sensitive banking info; accessible by teachers/parents via API; no expiration on URLs
- **Mitigation:** Use signed, expiring URLs; restrict receipt access to financial staff and account holder

### PRIV-014: SHAPARAK Callback Exposes Card PAN — **P0**
- **Location:** `finance.routes.js:410-527` (`POST /callback-verify`), `finance.routes.js:143-161` (`handleConfirmShaparakPayment` frontend)
- **Code:** Accepts `card_pan` from client (`card_pan = '6037-9975-****-4812'` default); returns `masked_card_pan` in response
- **Risk:** Full PAN may be logged/processed; masked PAN still reveals first 4/last 4 digits (BIN + check digit); callback endpoint has **no role authorization** (only counselor excluded)
- **Mitigation:** Never accept PAN from client; use tokenized payments; restrict callback to financial_officer; never log PAN

### PRIV-015: Sheba (IBAN) Validation Logs Full IBAN — **P1**
- **Location:** `finance.routes.js:219-238` (`POST /validate-sheba`), `iranianValidators.js` (not shown but used)
- **Risk:** Full IBAN sent in request/response; may be logged in audit/error logs; no masking in responses
- **Mitigation:** Mask IBAN in logs/responses; validate client-side; don't store

---

## 4. Uploaded Documents & Attachments

### PRIV-016: Uploaded Files Stored with Predictable Paths — **P1**
- **Location:** `upload.routes.js:47-66` (multer storage), `upload/processImageOptimization` (lines 40-100)
- **Storage:** Files saved to `config.upload.dir` (default `./uploads`) with UUID filenames but original extension preserved
- **Access:** Served statically via `app.use('/uploads', authenticate, express.static(uploadDir))` in `app.js:109-121`
- **Risk:** Authenticated users can access any file by URL; no per-file ACL; thumbnails generated and stored alongside originals
- **Mitigation:** Use signed URLs with expiration; store files outside web root; implement per-file ACL

### PRIV-017: EXIF Metadata Not Stripped from Uploaded Images — **P1**
- **Location:** `upload.routes.js:56-62` (sharp optimization)
- **Code:** `sharp(filePath).rotate()` — auto-rotates per EXIF but **does not strip EXIF** (GPS, camera model, timestamp)
- **Risk:** Uploaded photos may contain GPS coordinates, device info, timestamps — exposed to anyone with file access
- **Mitigation:** Add `.withMetadata(false)` or explicit `.rotate()` + `.toFile()` without metadata

### PRIV-018: No Virus/Malware Scanning on Uploads — **P1**
- **Location:** `upload.routes.js:106-166` (`POST /upload`)
- **Gap:** File validation only checks extension/MIME; no antivirus, no content-type verification, no sandbox
- **Risk:** Malicious files (macros in Office, polyglots) stored and served to users
- **Mitigation:** Integrate ClamAV or cloud scanning; quarantine until scanned; block macros

### PRIV-019: Uploaded Files Persist After Related Record Deletion — **P2**
- **Location:** `class.service.js:313-329` (`deleteClass` manually deletes from 7 tables but not uploads)
- **Issue:** Files in `uploads/` not cleaned when class/assignment/announcement deleted; orphaned files accumulate
- **Risk:** Orphaned files may contain sensitive data; storage bloat; compliance violation
- **Mitigation:** Track file references in DB; implement garbage collection; use object storage with lifecycle policies

---

## 5. API Responses & Frontend State Leakage

### PRIV-020: API Returns Full User Object Including Settings — **P0**
- **Location:** `auth.service.js:123-125` (`register`, `login`, `registerSchool`, etc.), `authController.getMe`
- **Response:** Returns entire `user` object with `settings` JSON containing `national_code`, `sida_code`, `father_name`, `class_name`, `grade`, `major`, `parent_phone`, `imported_from`
- **Frontend:** `authStore.js:98-100` stores entire profile in `localStorage.user_profile`
- **Risk:** Full PII in API response and localStorage; excessive for session management
- **Mitigation:** Return minimal user object for auth; separate `/me` endpoint with minimal fields; don't store settings in localStorage

### PRIV-021: Finance Ledger Returns Full Student PII — **P1**
- **Location:** `finance.routes.js:75-86` (ledger response)
- **Response:** Includes `student: { id, display_name, student_code }` plus full ledger/installments
- **Frontend:** `finance/page.js:74-82` stores in React state; no masking
- **Risk:** Student PII in finance context; unnecessary exposure
- **Mitigation:** Return only `student_id` in finance APIs; join on frontend if needed

### PRIV-022: Class Detail API Returns All Member PII — **P1**
- **Location:** `classes/[id]/page.js:117-151` (`loadAllClassData`), `class.service.js:280-286` (`getClassMembers`)
- **Response:** `users.id`, `display_name`, `avatar_url`, `role`, `joined_at` for all members
- **Risk:** Teachers see all students' full names and avatars; parents see other parents in class
- **Mitigation:** Minimize member list; paginate; allow opt-out of directory

### PRIV-023: AI Extraction Returns Extracted PII in Response — **P0**
- **Location:** `paperToDigital.service.js:62-99` (`extractFromPaper`), `ai.routes.js` (not fully shown)
- **Response:** Returns extracted items with `full_name`, `national_code`, `father_name`, `grade`, `class_name`, `parent_phone`, `student_name`, `student_code`, `score`, `teacher_comment`
- **Risk:** AI-extracted PII returned in API response before human review; stored in frontend state
- **Mitigation:** Return only preview with masked PII; require commit before full data returned

### PRIV-024: Frontend localStorage Stores Full User Profiles — **P1**
- **Location:** `authStore.js:98-100, 126-129, 151-153, 173-175, 193-196, 213-216, 227-230`
- **Data:** `user_profile` (full user object), `accessToken`, `refreshToken`
- **Risk:** XSS steals full identity; tokens in localStorage not httpOnly
- **Mitigation:** Use httpOnly cookies for tokens; store only user ID in localStorage; implement CSP

### PRIV-025: Children Page Shows Hardcoded Demo PII — **P2**
- **Location:** `children/page.js:9-28` (`demoChildren`)
- **Data:** Hardcoded children with `name`, `grade`, `school`, `attendance_rate`, `last_grade`, `pending_assignments`
- **Risk:** Demo data leaks in production; real children data structure exposed
- **Mitigation:** Remove demo data; use mock service in development only

---

## 6. Logging, Error Messages & Debugging Output

### PRIV-026: PII Logged in Console Output — **P0**
- **Location:** Multiple files — `console.error`, `console.warn`, `console.log` (28 occurrences per grep)
- **Examples:**
  - `auditLogger.js:53` — logs audit errors with message only
  - `sida.service.js:175` — `console.warn('Could not dispatch notifications:', notifErr.message)`
  - `quiz.service.js:74, 268` — `console.warn('Could not dispatch quiz notifications:', notifErr.message)`
  - `class.service.js:205` — `console.warn('Could not dispatch notifications:', notifErr.message)`
  - `upload.routes.js:129-133` — `console.warn` on decode (dead code)
- **Risk:** PII (names, codes, errors) in stdout; log aggregation systems capture; no redaction
- **Mitigation:** Structured logging with PII redaction; separate audit log from debug log; no PII in debug logs

### PRIV-027: Error Responses Leak Stack Traces in Development — **P1**
- **Location:** `errorHandler.js:56-66`
- **Code:** `...(config.nodeEnv === 'development' && { stack: err.stack })`
- **Risk:** Stack traces expose internal paths, DB schema, logic; if `NODE_ENV` misconfigured, leaks in production
- **Mitigation:** Never return stack traces; use error codes; log stack server-side only

### PRIV-028: Audit Logs Store IP Addresses — **P2**
- **Location:** `auditLogger.js:35, 50` (`logAudit` captures `ip` from `req.headers['x-forwarded-for']`)
- **Storage:** `audit_logs.ip_address` column
- **Risk:** IP addresses are PII (GDPR); no retention policy; stored indefinitely
- **Mitigation:** Hash IPs before storage; implement retention (e.g., 1 year); anonymize after period

### PRIV-029: Socket.IO Events Logged to Console — **P2**
- **Location:** `socket.js:1227-1390` (event handlers)
- **Events:** `console.log` for connections, disconnections, live class start/end
- **Risk:** Real-time activity visible in logs; correlates users to classes
- **Mitigation:** Structured logging; no PII in socket logs; separate audit events

---

## 7. Third-Party Integrations & External AI Services

### PRIV-030: Google Gemini AI Receives Student PII — **P0**
- **Location:** `paperToDigital.service.js:101-185` (`callGeminiVisionExtractor`)
- **Data Sent to Google:** `image_base64` (student photos/scans), `raw_ocr_text` (may contain names, national codes, grades), prompts with student context
- **Prompt Includes:** Student names, national codes, father names, grades, class names, parent phones (see lines 116-119)
- **Risk:** Student PII (including national codes) sent to external AI provider; no data processing agreement visible; fallback to deterministic parser but only on failure
- **Mitigation:** Pseudonymize before sending; use on-premise/private AI; data processing agreement; allow opt-out

### PRIV-031: AI Fallback Fabricates Student PII — **P0**
- **Location:** `paperToDigital.service.js:194-224` (roster), `265-288` (gradesheet), `335-356` (exam)
- **Code:** When `lines.length === 0`, returns **hardcoded fake students** with realistic names, national codes, phones, scores
- **Risk:** Fake PII returned as "extracted data"; if committed, pollutes database with fabricated records
- **Mitigation:** Return empty on failure; never fabricate data; flag empty extraction

### PRIV-032: AI Commit Accepts Unreviewed Items — **P0**
- **Location:** `paperToDigital.service.js:461-598` (`commitExtractedData`)
- **Code:** Iterates `items` and commits **all** regardless of `needs_review` flag (line 523)
- **Risk:** Unverified AI extractions (including fabricated data) committed to gradebook/roster/quiz
- **Mitigation:** Enforce `needs_review: false` gate; require human approval per item

### PRIV-033: SMS Gateway Stub Logs Phone Numbers — **P2**
- **Location:** `services/smsGateway.js` (referenced in `finance.routes.js:474-485`, `attendance.service.js:211-228`, `sida.service.js` not shown but used)
- **Code:** `console.log` for SMS sending (line 30), `console.warn` on failure (line 64)
- **Risk:** Phone numbers in logs; SMS content may contain sensitive info (tuition amounts, student names)
- **Mitigation:** Mask phone numbers in logs; don't log message content

---

## 8. Data Retention & Deletion

### PRIV-034: No Automated Data Retention Policy — **P1**
- **Database:** No `deleted_at` soft-delete on most tables; `users.is_active` (016) but not used consistently
- **Tables without retention:** `audit_logs` (grows indefinitely), `notifications` (never purged), `messages` (never purged), `chat_messages` in `live_classroom_sessions` (debounced 1.5s, unbounded)
- **Risk:** Indefinite retention violates data minimization; storage bloat; compliance risk
- **Mitigation:** Implement retention policies (e.g., audit logs 1 year, notifications 90 days); automated cleanup jobs

### PRIV-035: No Right-to-Erasure (GDPR/PDPL) Endpoint — **P1**
- **Gap:** No `/auth/delete-account` or admin user deletion with cascade
- **Code:** `class.service.js:313-329` (`deleteClass`) deletes class data but not user account
- **Risk:** Users cannot request data deletion; non-compliant with privacy laws
- **Mitigation:** Implement account deletion with full cascade; verify identity; audit deletion

### PRIV-036: Backup Retention Only 14 Days, No Off-Site — **P1**
- **Location:** `dbMaintenance.js:89-113` (`pruneOldBackups(14)`)
- **Issue:** Backups stored locally in `./db_backups/`; same disk as primary DB; no off-site replication
- **Risk:** Disk failure = total data loss; 14-day window may be insufficient for compliance
- **Mitigation:** Off-site backup (S3/GCS); longer retention for compliance; point-in-time recovery

### PRIV-037: Soft-Deleted Users Still Accessible — **P2**
- **Location:** `users.is_active` (016:23), `auth.js:192-198` (blocks login if `is_active === false`)
- **Gap:** Soft-deleted users' data remains in all tables; no anonymization; `is_active` not checked in all queries
- **Risk:** Deactivated user data still queryable; "deleted" but not forgotten
- **Mitigation:** Anonymize on deactivation; exclude from all queries by default; implement true deletion

---

## 8. Access by School Personnel

### PRIV-038: Admins See All Student Data Across School — **P0**
- **Location:** `auth.js:88-89` (`assertOwnsClass` allows `isSchoolAdmin` full access), `gradebook.routes.js:36` (allowEnrolled for students only)
- **Scope:** School admins (`admin`, `manager`, `school_admin`, `principal`, `headmaster`) bypass all class-level checks
- **Scope:** Can view all grades, attendance, finance, messages for any student in school
- **Risk:** Over-privileged access; no segregation of duties; single admin compromise = full school data breach
- **Mitigation:** Role-based access with granular permissions; admin audit log; require justification for sensitive access

### PRIV-039: Teachers See All Students in Their Classes — **P1**
- **Location:** `gradebook.routes.js:56-67`, `attendance.service.js:167-179` (`closeSession` gets all class members)
- **Scope:** Teachers see all students' names, codes, grades, attendance, contact info (phone/email in report)
- **Risk:** Teachers access more data than pedagogically necessary (e.g., parent phones in attendance report)
- **Mitigation:** Minimize teacher view; hide parent contact unless explicitly needed; audit teacher access

### PRIV-040: Financial Officers Access All Student Finance — **P0**
- **Location:** `finance.routes.js:244-320` (`create-ledger` authorized for `financial_officer`), `finance.routes.js:161-212` (`verify-installment`)
- **Gap:** `financial_officer` role authorized but **not checked in `callback-verify`** (line 410) — only counselor excluded
- **Risk:** Any authenticated user can trigger settlement; financial data accessible beyond need
- **Mitigation:** Enforce role check on all finance endpoints; segregate financial_officer permissions

### PRIV-041: Counselors Excluded from Finance But Not Other Data — **P2**
- **Location:** `finance.routes.js:24-28` (counselor forbidden), `gradebook.routes.js` no counselor check
- **Inconsistency:** Counselors blocked from finance but can access grades/attendance
- **Risk:** Role boundaries unclear; counselors may access sensitive academic data without oversight
- **Mitigation:** Define counselor permissions explicitly; apply consistently

### PRIV-042: Parent Access via Unverified Student Code — **P0**
- **Location:** `auth.js:111-124` (parent branch in `assertOwnsClass`), `authStore.js:63-66` (demo parent has `student_code`)
- **Code:** Parent access granted if `req.user.student_code === student.student_code` (line 120-124)
- **Risk:** No verification of parent-child relationship; anyone with student code gains access
- **Mitigation:** Require verified `parent_student_links`; remove student_code fallback; implement invitation flow

### PRIV-043: Counselors Can Access Student Lists — **P2**
- **Location:** `sida.service.js:180-184` (importRoster fetches students), `message.service.js:80-118` (`getDirectory`)
- **Gap:** Counselors not explicitly restricted from directory/roster imports
- **Risk:** Counselors may access student PII beyond counseling scope
- **Mitigation:** Explicit counselor permissions; restrict to assigned students

---

## 9. Network Transmission & Storage

### PRIV-044: JWT Tokens in localStorage (Not httpOnly) — **P0**
- **Location:** `authStore.js:173-175, 189-190, 214-215` — tokens stored in `localStorage`
- **Risk:** XSS steals tokens; no httpOnly protection; tokens accessible to any JS on page
- **Mitigation:** Use httpOnly, Secure, SameSite=Strict cookies; implement CSRF protection

### PRIV-045: Refresh Token Sent in Request Body — **P1**
- **Location:** `api.js:179, 187` (`axios.post('/auth/refresh', { refreshToken })`)
- **Risk:** Refresh token in request body (not httpOnly cookie); logged in some proxies; vulnerable to CSRF
- **Mitigation:** Use httpOnly cookie for refresh token; implement token rotation

### PRIV-046: CORS Allows Any Origin with Credentials — **P0**
- **Location:** `app.js:92-98`, `socket.js:91-97`
- **Code:** `cors: { origin: true, credentials: true }` — reflects any Origin with `Access-Control-Allow-Credentials: true`
- **Risk:** Any website can make authenticated requests via victim's browser; CSRF via cookies/tokens
- **Mitigation:** Restrict CORS to explicit allowlist (`config.frontendUrl`); disable credentials for non-browser clients

### PRIV-047: File Uploads Served Over Static Route Without ACL — **P1**
- **Location:** `app.js:109-121` (`app.use('/uploads', authenticate, express.static(uploadDir))`)
- **Gap:** Only checks authentication; no per-file authorization; any authenticated user can access any file
- **Risk:** Uploaded documents (receipts, assignments, photos) accessible by any logged-in user
- **Mitigation:** Implement per-file ACL; use signed URLs; store outside web root

### PRIV-048: AI Image Upload Sent as Base64 in JSON — **P1**
- **Location:** `paperToDigital.service.js:108-113` (`image_base64` in request)
- **Risk:** Large base64 payloads in JSON; may be logged by proxies; no streaming upload
- **Mitigation:** Use multipart upload; stream to AI; don't log request bodies

---

## 10. Configuration & Secrets

### PRIV-049: Hardcoded JWT Secrets in dev-server.js — **P0**
- **Location:** `dev-server.js:6-7`
- **Code:** `process.env.JWT_SECRET = process.env.JWT_SECRET || 'educonnect-iran-enterprise-jwt-secret-key-2026-secure'`
- **Risk:** Default secrets committed to repo; used if env not set; `dev-server.js` copied in Docker `COPY . .`
- **Mitigation:** Remove defaults; fail startup if secrets missing; use secret manager

### PRIV-050: Database Password in Config with Defaults — **P1**
- **Location:** `config/index.js:21-27`
- **Code:** `password: process.env.DB_PASSWORD || 'postgres'`
- **Risk:** Default `postgres` password if env not set; SQLite default means no password needed but PG misconfigured
- **Mitigation:** Fail if required env vars missing; no defaults for secrets

### PRIV-051: Gemini API Key in Environment Variable — **P2**
- **Location:** `paperToDigital.service.js:26-30, 102-104`
- **Code:** `process.env.GEMINI_API_KEY` used directly; no rotation, no scoped keys
- **Risk:** Single key for all AI operations; if leaked, full API access
- **Mitigation:** Use scoped API keys; rotate regularly; monitor usage

### PRIV-052: Redis Config Present But Unused — **P2**
- **Location:** `config/index.js:29-32`
- **Code:** Redis config block with host/port defaults; **zero consumers** in codebase
- **Risk:** Misleading configuration; operators may enable Redis unnecessarily
- **Mitigation:** Remove unused config or implement Redis for sessions/cache

---

## Summary of Findings by Severity

### P0 — Critical (Immediate Action Required)
| ID | Finding | Data Category |
|---|---|---|
| PRIV-001 | Excessive PII collection at registration | Student/Parent PII |
| PRIV-002 | National ID stored in plaintext | Student PII |
| PRIV-005 | Demo accounts with hardcoded credentials | All |
| PRIV-008 | Gradebook accessible to teachers beyond need | Academic |
| PRIV-012 | Teachers access student financial ledgers | Financial |
| PRIV-014 | SHAPARAK callback accepts card PAN | Financial |
| PRIV-020 | API returns full user object with settings | API Leakage |
| PRIV-023 | AI extraction returns PII before review | AI Services |
| PRIV-026 | PII in console logs | Logging |
| PRIV-030 | Gemini AI receives student PII | Third-Party AI |
| PRIV-031 | AI fallback fabricates student PII | AI Services |
| PRIV-032 | AI commit accepts unreviewed items | AI Services |
| PRIV-038 | Admins see all student data | Access Control |
| PRIV-042 | Parent access via unverified student code | Access Control |
| PRIV-044 | JWT in localStorage not httpOnly | Transmission |
| PRIV-046 | CORS allows any origin with credentials | Network |
| PRIV-049 | Hardcoded JWT secrets in dev-server | Secrets |

### P1 — High (Fix This Sprint)
| ID | Finding | Data Category |
|---|---|---|
| PRIV-003 | Parent phone without consent | Student/Parent PII |
| PRIV-004 | Student code as parent lookup | Access Control |
| PRIV-007 | User profile in localStorage | Frontend State |
| PRIV-009 | Report card exposes discipline | Academic |
| PRIV-010 | Sida export includes full PII | Academic |
| PRIV-013 | Payment receipt URLs exposed | Financial |
| PRIV-015 | Sheba validation logs full IBAN | Financial |
| PRIV-016 | Uploads with predictable paths | Uploads |
| PRIV-017 | EXIF metadata not stripped | Uploads |
| PRIV-018 | No virus scanning | Uploads |
| PRIV-021 | Finance ledger returns full PII | API Leakage |
| PRIV-022 | Class detail returns all member PII | API Leakage |
| PRIV-024 | localStorage stores full profile | Frontend State |
| PRIV-025 | Children page hardcoded demo PII | Frontend State |
| PRIV-027 | Stack traces in dev error responses | Logging |
| PRIV-030 | Gemini receives student PII | Third-Party AI |
| PRIV-031 | AI fallback fabricates PII | AI Services |
| PRIV-033 | SMS gateway logs phones | Third-Party |
| PRIV-034 | No data retention policy | Retention |
| PRIV-035 | No right-to-erasure endpoint | Retention |
| PRIV-036 | Backup only 14 days, no off-site | Retention |
| PRIV-038 | Admins see all student data | Access Control |
| PRIV-039 | Teachers see all student data | Access Control |
| PRIV-040 | Financial officers access all finance | Access Control |
| PRIV-043 | Parent access unverified | Access Control |
| PRIV-044 | JWT in localStorage | Transmission |
| PRIV-045 | Refresh token in body | Transmission |
| PRIV-047 | Uploads without per-file ACL | Storage |
| PRIV-048 | AI uploads as base64 in JSON | AI Services |
| PRIV-050 | DB password defaults | Secrets |

### P2 — Medium (Schedule)
| ID | Finding | Data Category |
|---|---|---|
| PRIV-006 | Username from display name | Student PII |
| PRIV-011 | Grade history not preserved | Academic |
| PRIV-019 | Orphaned uploads persist | Uploads |
| PRIV-028 | Audit logs store IPs | Logging |
| PRIV-029 | Socket events logged | Logging |
| PRIV-035 | No right-to-erasure | Retention |
| PRIV-037 | Soft-deleted users accessible | Retention |
| PRIV-041 | Counselor access inconsistent | Access Control |
| PRIV-048 | AI uploads as base64 | AI Services |
| PRIV-051 | Gemini API key not rotated | Secrets |
| PRIV-052 | Unused Redis config | Config |

---

## Recommended Remediation Priority

| Phase | Tasks | Effort |
|---|---|---|
| **Week 1 (Emergency)** | Remove hardcoded secrets (PRIV-049, PRIV-005); Fix CORS (PRIV-046); Move tokens to httpOnly cookies (PRIV-044); Restrict finance access (PRIV-012, PRIV-014); Enforce AI review gate (PRIV-032) | 5-8 days |
| **Week 2-3 (Core Fixes)** | Encrypt national codes (PRIV-002); Strip EXIF (PRIV-017); Add virus scanning (PRIV-018); Implement httpOnly cookies + CSRF (PRIV-044, PRIV-045); Fix parent verification (PRIV-042); Restrict admin access (PRIV-038) | 10-15 days |
| **Week 3-4 (Systemic)** | Data retention policies (PRIV-034, PRIV-035); Backup off-site + integrity (PRIV-036); Structured logging with redaction (PRIV-026, PRIV-027); Per-file upload ACLs (PRIV-047); Pseudonymize AI data (PRIV-030, PRIV-031) | 10-15 days |
| **Week 5+ (Compliance)** | Right-to-erasure endpoint (PRIV-035); Grade history immutability (PRIV-011); Data processing agreements for AI (PRIV-030); Penetration test; Privacy impact assessment | Ongoing |

---

## Compliance Gap Summary (GDPR / Iran PDPL)

| Requirement | Status | Gaps |
|---|---|---|
| **Lawful Basis** | ⚠️ Partial | No consent records for parent phone/SMS; legitimate interest not documented |
| **Data Minimization** | ❌ Fail | Excessive collection (national_code in settings, full user objects in API) |
| **Purpose Limitation** | ❌ Fail | Settings JSON accepts arbitrary data; AI uses data beyond extraction |
| **Storage Limitation** | ❌ Fail | No retention policies; audit logs indefinite; backups 14 days only |
| **Integrity/Confidentiality** | ❌ Fail | Plaintext national codes; JWT in localStorage; CORS wildcards |
| **Accountability** | ⚠️ Partial | Audit logs exist but unwatched; no DPIA; no DPO |
| **Data Subject Rights** | ❌ Fail | No access/rectification/erasure endpoints; no portability |
| **Breach Notification** | ❌ Fail | No incident response plan; no 72-hour notification process |
| **Third-Party Transfers** | ❌ Fail | Google Gemini receives PII without DPA; no SCCs |

---

*Assessment complete. All findings derived from static source analysis. No production data accessed. No files modified.*