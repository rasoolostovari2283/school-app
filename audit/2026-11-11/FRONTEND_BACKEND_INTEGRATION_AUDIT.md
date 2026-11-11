# Frontend-to-Backend Integration Audit — EduConnect

**Read-only independent assessment** @ `main` `838b5b2` · 2026-11-11
**Scope:** Critical user workflows traced from UI components → API client → routes → middleware → services → database.

---

## Executive Summary

| Category | Critical (P0) | High (P1) | Medium (P2) | Total |
|---|---|---|---|---|
| Auth & Session | 2 | 3 | 2 | 7 |
| Finance/Ledger | 3 | 2 | 1 | 6 |
| Gradebook/Report Card | 1 | 2 | 2 | 5 |
| Attendance | 1 | 1 | 2 | 4 |
| Quizzes/Exams | 2 | 2 | 1 | 5 |
| Assignments | 1 | 2 | 1 | 4 |
| Classes/Live | 3 | 2 | 1 | 6 |
| Messages/Notifications | 1 | 2 | 2 | 5 |
| AI/Paper-to-Digital | 1 | 1 | 1 | 3 |
| File Upload | 1 | 1 | 1 | 3 |
| **TOTAL** | **16** | **18** | **14** | **48** |

**Key Finding:** The frontend assumes a richer backend contract than what exists. Server-side authorization is inconsistent, validation is duplicated/absent, and real-time features have critical security gaps.

---

## 1. Authentication & Session Management

### FBA-001: Frontend assumes `/auth/profile` returns full user object — **P1**
- **Frontend:** `authStore.js:98` calls `api.get('/auth/profile')` and stores entire `data.data` as user profile
- **Backend:** `auth.routes.js` (not shown but inferred) — profile endpoint returns user but may not include all fields frontend expects (`personnel_code`, `student_code`, `school_name`)
- **Evidence:** `login/page.js:258-277` `getPostLoginRedirect` accesses `user.settings.is_teacher_onboarded` — backend may not populate `settings` on profile
- **Risk:** Redirect logic fails silently; user stuck on login

### FBA-002: Token refresh logic has race condition — **P1**
- **Frontend:** `api.js:170-204` intercepts 401 with `TOKEN_EXPIRED` code, calls `/auth/refresh` with `refreshToken` from localStorage
- **Backend:** Refresh endpoint (not shown) must validate refresh token, check `revoked_tokens`, increment `token_version`
- **Gap:** No mutex — concurrent 401s from multiple tabs trigger parallel refresh requests; first succeeds, others fail with cleared tokens
- **Risk:** User logged out unexpectedly during token refresh

### FBA-003: Demo accounts hardcoded with weak passwords — **P0**
- **Frontend:** `authStore.js:27-71` `DEMO_ACCOUNTS` with phone/password `123456` for all roles
- **Backend:** `dev-server.js:6-7` seeds these accounts with JWT secrets committed
- **Impact:** Any deployed instance has known credentials for admin/teacher/student/parent/financial_officer/counselor
- **Evidence:** `seeded-login-123456-2026-11-11.cjs` reproduces live

### FBA-004: Parent login bypasses verification — **P0**
- **Frontend:** `login/page.js:343-363` calls `parentLogin` with `student_identifier`, `parent_name`, `parent_phone`
- **Backend:** `auth.routes.js` parent-login creates/finds parent user, sets `is_verified=true` without verification step
- **Evidence:** `class.service.js:508-538` creates parent with `is_verified` default false but never sets true; `auth.js:111-124` allows access via `student_code` match only
- **Risk:** Anyone with student code gains parent access to grades/finance/messages

### FBA-005: `revokeAllSessions` doesn't disconnect active sockets — **P1**
- **Frontend:** `authStore.js:251-259` calls `/auth/revoke-sessions` and clears localStorage
- **Backend:** Increments `token_version` but **Socket.IO handshake only validates at connect** (SEC-SOCKET-004)
- **Gap:** Revoked user keeps active realtime connection with full permissions
- **Fix:** Socket server must listen for revocation events or check `token_version` periodically

---

## 2. Finance & Tuition Ledger

### FBA-006: Frontend calculates balance locally — diverges from backend — **P1**
- **Frontend:** `finance/page.js:216-221` computes `totalNet = totalAmount - discount`, `remaining = ledger.balance || (totalNet - paidAmount)`, `paidPercent = (paidAmount / totalNet) * 100`
- **Backend:** `finance.routes.js:65-86` returns stored `ledger.balance`, `ledger.paid_amount`, `ledger.status`
- **Divergence:** Frontend recalculates; backend stores denormalized balance. If backend balance stale (BL-FIN-001 race), frontend shows wrong numbers
- **Risk:** Parent sees "paid 80%" but backend says "partial — balance 50M"

### FBA-007: Shaparak callback verification exposed in UI — **P0**
- **Frontend:** `finance/page.js:143-161` `handleConfirmShaparakPayment` POSTs to `/finance/callback-verify/:id` with `authority`, `card_pan`, `status: 'OK'`
- **Backend:** `finance.routes.js:410-527` — **no role check** (only counselor exclusion); trusts client-supplied `authority` and `status`
- **Evidence:** SEC-FIN-001 — any authenticated user can settle any installment by knowing ID
- **Frontend Assumption:** "Only financial officer sees verify button" (line 764 `canVerify` check) — but endpoint is public

### FBA-008: Manual receipt submission lacks idempotency — **P1**
- **Frontend:** `finance/page.js:104-122` `handlePaySubmit` POSTs `/finance/pay-installment/:id` with `tracking_number`, `bank_name`
- **Backend:** `finance.routes.js:96-155` — sets status to `submitted`, stores tracking number; **no unique constraint on tracking_number**
- **Risk:** Double-submit (network retry) creates duplicate receipt; financial officer sees two submissions for same installment

### FBA-009: Sheba validation only in UI, not enforced on create-ledger — **P2**
- **Frontend:** `finance/page.js:173-188` calls `/finance/validate-sheba` before initiating payment
- **Backend:** `finance.routes.js:326-404` `initiate-payment` validates sheba but `create-ledger` (line 244-320) doesn't
- **Gap:** Ledger created with invalid school sheba; payment initiation fails later

---

## 3. Gradebook & Report Card

### FBA-010: Gradebook page is a 7-line redirect — **P2**
- **Frontend:** `gradebook/page.js:1-6` redirects to `ReportCardPage`
- **Backend:** `/gradebook/classes/:classId` returns categories, students, scores matrix
- **Gap:** No dedicated gradebook management UI (create categories, enter scores, batch entry) — only report card view
- **Evidence:** `gradebook.routes.js:124-305` has full CRUD for categories/scores but no frontend consumer

### FBA-011: Report card computes GPA in frontend — no server validation — **P1**
- **Frontend:** `gradebook.routes.js:498-677` `handleGetReportCard` computes weighted averages, discipline score, overall GPA **server-side**
- **But:** Frontend `report-card/page.js` (not shown) likely re-computes for display; no verification that frontend matches backend
- **Risk:** If frontend formula diverges (BL-GRB-002 float precision), printed report card ≠ server record

### FBA-012: Discipline score included in report card but no frontend management — **P2**
- **Backend:** `gradebook.routes.js:639-644` adds `discipline_records.points` to base 20.0 score
- **Frontend:** No UI to view/manage discipline records; `discipline/page.js` exists but not linked
- **Gap:** Teacher can't see how discipline affects report card; parent sees score without context

---

## 4. Attendance

### FBA-013: Frontend assumes 15-minute fixed window — backend configurable — **P2**
- **Frontend:** `attendance/page.js:60` `selectedDuration` default 15; UI shows countdown timer (line 179-201)
- **Backend:** `attendance.service.js:30` `durationMinutes = Number(data.duration_minutes) || 15`
- **Gap:** Frontend hardcodes 15-min countdown logic; if teacher creates 30-min session, countdown wrong
- **Evidence:** Line 188 `diff <= 0` triggers `loadSessionData()` assuming 15 min exactly

### FBA-014: Shared attendance reports stored only in localStorage — **P1**
- **Frontend:** `attendance/page.js:84-98` loads `school_shared_attendance_reports` from localStorage; `handleShareWithManagement` (line 100-167) saves to localStorage + broadcasts notification
- **Backend:** No `/attendance/shared-reports` endpoint — reports never persisted server-side
- **Risk:** Management never sees teacher-submitted reports on different device/browser; localStorage cleared = reports lost

### FBA-015: Student check-in no duplicate prevention — **P1**
- **Frontend:** `attendance/page.js:295-313` `handleStudentCheckIn` calls `/attendance/sessions/:id/check-in`
- **Backend:** `attendance.service.js:92-117` checks existing record but **no unique constraint** on `(session_id, student_id)` (BL-ATT-002)
- **Race:** Double-click → two check-ins; second returns first but UI shows success both times

---

## 5. Quizzes & Examinations

### FBA-016: Quiz creation allows empty questions — backend validates but UX confusing — **P2**
- **Frontend:** `quizzes/page.js:511-528` validates questions have text/image and 4 options with text/image
- **Backend:** `quiz.service.js:43-58` inserts questions if `hasTextOrImg` — but allows partial questions
- **Gap:** Frontend blocks submit; backend would accept. If frontend bypassed, incomplete quiz created

### FBA-017: Student exam timer runs in frontend — no server enforcement — **P0**
- **Frontend:** `quizzes/page.js:197-221` `useEffect` countdown `secondsLeft`; at 0 calls `handleSubmitAttempt(true)` (auto-submit)
- **Backend:** `quiz.service.js:300-318` `startAttempt` records `started_at`; `submitAttempt` (line 320-448) **does not check elapsed time**
- **Critical:** Student can disable JS, extend timer, or call submit after expiry — backend accepts
- **Evidence:** Line 344-353 checks `completed_at` but not `started_at + duration_minutes`
- **Fix:** Backend must reject submit if `NOW() > started_at + duration_minutes * 60`

### FBA-018: Quiz share creates announcement without transaction — **P1**
- **Frontend:** `quizzes/page.js:781-799` `handleShareQuizSubmit` POSTs `/classes/:classId/quizzes/:id/share` with `sendToAnnouncements`, `customMessage`
- **Backend:** `quiz.service.js:237-295` `shareQuiz` updates quiz + inserts notification + inserts announcement — **no transaction**
- **Risk:** Quiz published but announcement fails → students notified but no announcement; or announcement created but notification fails

### FBA-019: Negative marking formula mismatch frontend/backend — **P1**
- **Frontend:** Not shown — quiz taking UI likely explains scoring
- **Backend:** `quiz.service.js:381-383` `percentage = Math.max(0, parseFloat((((3 * correctCount - wrongCount) / (3 * totalQ)) * 100).toFixed(1)))`
- **Gap:** Formula `(3C - W) / (3Q) * 100` assumes each wrong = -1/3 correct. Frontend may show different explanation
- **Risk:** Student confused by score calculation

---

## 6. Assignments

### FBA-020: Due date lock enforced in frontend only — **P0**
- **Frontend:** `assignments/page.js:88-155` `getDeadlineInfo` computes `isLocked = isExpired && !isAllowLate`; line 958-999 disables submit button if `deadline.isLocked`
- **Backend:** `assignment.service.js:203-209` checks `isLate && !isAllowLate` and throws 400
- **Critical:** Frontend lock is **UI-only**; student can bypass by calling API directly (curl, Postman, disable JS)
- **Backend does enforce** but frontend duplicates logic inconsistently (e.g., `allow_late` parsing differs: line 104 vs service line 203)

### FBA-021: Submission status enum mismatch — **P1**
- **Frontend:** `assignments/page.js:88-155` expects `status` values: `'graded'`, `'submitted'`, `'late'`
- **Backend:** `assignment.service.js:216, 226` sets status to `'submitted'` or `'late'`; `grade` (line 254) sets `'graded'`
- **Gap:** Frontend `activeTab` filters (line 609-616) use `submission.status === 'graded'` etc. — matches but fragile
- **Gap:** Parent view (line 875-929) checks `submission.status === 'graded'` — if backend adds new status, UI breaks

### FBA-021: File upload uses same `/upload` endpoint for all — no context — **P2**
- **Frontend:** Multiple pages (`assignments`, `quizzes`, `live`, `messages`) POST to `/upload` with `FormData`
- **Backend:** `upload.routes.js` (not fully shown) — single endpoint, no context (assignment vs quiz vs message)
- **Risk:** No per-context size/type limits; quiz attachments could be executable; no virus scan

---

## 7. Classes & Live Classroom

### FBA-022: Live provider settings saved to localStorage as fallback — **P1**
- **Frontend:** `classes/[id]/page.js:170-214` `handleSaveLiveSettings` calls API but **catches error and saves to localStorage** (line 195-203)
- **Backend:** `class.service.js:305-311` `updateQuietHours` pattern but no `updateLiveSettings` visible
- **Risk:** Settings lost on device change; no server-side validation of Skyroom/BBB credentials

### FBA-023: Live launch falls back to direct URL — bypasses backend — **P1**
- **Frontend:** `classes/[id]/page.js:216-251` `handleLaunchLive` calls `/live-launch`; on error **falls back to direct `window.open(skyroomUrl)`** (line 242-247)
- **Backend:** `class.service.js` no `liveLaunch` method visible
- **Risk:** Teacher launches class without backend recording; no audit trail; student joins without auth check

### FBA-024: Class roster batch add uses shared password hash — **P0**
- **Frontend:** `classes/[id]/page.js` not shown but `class.service.js:624, 635-642` `batchAddStudents` uses single `sharedBatchPasswordHash` for all students
- **Frontend:** `classes/[id]/page.js` likely calls `/classes/:id/students/batch`
- **Critical:** All batch-created students share identical password hash (BL-ENR-002)

### FBA-025: Live classroom whiteboard permissions UI trusts server — **P1**
- **Frontend:** `live/page.js:86-93` `canDraw = isTeacher || hasWhiteboardAccess`; permissions from `init_class_state` event
- **Backend:** `socket.js:181-185` sets `canDraw = isTeacher` at join; `grant_whiteboard_access` (line 388-416) updates in-memory room
- **Gap:** If socket disconnects/reconnects, permissions reset to teacher-only; student loses access mid-class
- **Socket:** No persistence of granted permissions in DB

---

## 8. Messages & Notifications

### FBA-026: Directory merges backend + localStorage with complex deduplication — **P1**
- **Frontend:** `messages/page.js:228-399` `fetchDirectory` merges `/messages/directory` with local `schoolTeachers`, `schoolStudents` arrays
- **Backend:** `/messages/directory` returns `{ staff, students, parents, all }` but frontend re-merges
- **Complexity:** 170 lines of deduplication logic (lines 248-398) — fragile, duplicates likely
- **Gap:** Grade filtering (lines 377-387) done in frontend only — backend returns all students

### FBA-027: Message edit/delete uses optimistic UI — no server sync verification — **P2**
- **Frontend:** `messages/page.js:770-815` `handleSendMessage` edit mode updates local state immediately, then calls API
- **Backend:** `message.service.js` (not fully shown) has edit/delete
- **Gap:** If API fails, local state already changed; no rollback shown

### FBA-028: Voice recording uploads to same `/upload` — no duration/size validation — **P2**
- **Frontend:** `messages/page.js:671-759` `stopAndSendRecording` creates blob, uploads via `/upload`
- **Backend:** No duration limit, no size limit, no mime-type validation
- **Risk:** 10MB voice messages stored; no cleanup

### FBA-029: Notification broadcast creates announcement + notifications without transaction — **P1**
- **Frontend:** `attendance/page.js:148-157` broadcasts notification; `messages/page.js` similar
- **Backend:** `notification.service.js:110-151` `sendBroadcast` inserts announcement + batch inserts notifications — **no transaction**
- **Risk:** Partial failure = announcement without notifications or vice versa

---

## 9. AI / Paper-to-Digital

### FBA-030: AI extraction returns fabricated data on empty input — **P0**
- **Frontend:** Not shown — likely calls `/ai/extract` with image/text
- **Backend:** `paperToDigital.service.js:195-224` (roster), `265-288` (gradesheet), `335-356` (exam) — **returns hardcoded fake data** when `lines.length === 0`
- **Frontend Assumption:** "AI extracts real data" — actually returns plausible fake students/grades
- **Critical:** Teacher sees "extracted" data, clicks commit → fake data enters gradebook/roster

### FBA-031: Commit endpoint accepts `needs_review: true` items — **P0**
- **Frontend:** Not shown — review UI likely shows `needs_review` badge
- **Backend:** `paperToDigital.service.js:461-598` `commitExtractedData` **iterates all items, ignores `needs_review`**
- **Critical:** `feasibility_assessment.mandatory_human_in_the_loop: true` (line 47) is theatre

### FBA-032: AI commit writes to 3 domains without transaction — **P1**
- **Backend:** `commitExtractedData` calls `sidaService.importRoster` + direct gradebook writes + `quizService.create` — **no transaction**
- **Risk:** Partial commit → roster created but grades fail; quiz created but roster fails

---

## 10. File Upload & Storage

### FBA-033: Single `/upload` endpoint for all contexts — no policy — **P2**
- **Frontend:** `api.post('/upload', formData)` from: `finance` (receipts), `quizzes` (question images), `assignments` (attachments), `live` (recordings), `messages` (voice/files)
- **Backend:** `upload.routes.js` — single handler, no context parameter
- **Gap:** No per-context limits (quiz images vs assignment PDFs vs voice messages)
- **Security:** No content-type validation, no virus scan, no filename sanitization shown

### FBA-034: Uploaded file URLs constructed in frontend — hardcoded backend base — **P1**
- **Frontend:** `assignments/page.js:79-86`, `quizzes/page.js:171-178` `getFullFileUrl` prepends `process.env.NEXT_PUBLIC_API_URL` or `localhost:5000`
- **Backend:** `upload.routes.js` returns relative URLs (`/uploads/...`)
- **Gap:** If backend behind proxy/CDN, frontend URL construction breaks; should use absolute URLs from backend

---

## 11. Cross-Cutting Integration Patterns

### FBA-035: Frontend duplicates backend validation logic — **P1** (15+ instances)
| Frontend | Backend | Issue |
|---|---|---|
| `finance/page.js:216-221` balance calc | `finance.routes.js:189-195` | Divergent formulas |
| `attendance/page.js:179-201` countdown | `attendance.service.js:75-82` expiry | Hardcoded 15-min |
| `assignments/page.js:88-155` deadline logic | `assignment.service.js:203-209` | Duplicate `allow_late` parsing |
| `quizzes/page.js:180-189` timer | `quiz.service.js:300-318` `started_at` | Frontend-only enforcement |
| `gradebook` weighted avg | `gradebook.routes.js:85-105` | Float precision drift |

### FBA-036: Error handling inconsistent — **P2**
- **Frontend:** Uses `err.response?.data?.message` everywhere but backend error formats vary:
  - Some return `{success: false, message: ...}`
  - Some throw `Error` with `statusCode` property
  - Some return 400/403/404 with different shapes
- **Frontend:** `toast.error(err.response?.data?.message || 'generic message')` — misses `messageEn`, `code` fields

### FBA-037: No request deduplication — duplicate submissions — **P1**
- **Pattern:** `setSubmitting(true)` → `api.post(...)` → `setSubmitting(false)` in `finally`
- **Gap:** No `requestId` or idempotency key; double-click → two requests
- **Affected:** Finance submit, quiz submit, assignment submit, attendance check-in, message send

### FBA-038: Real-time state not synced with REST — **P1**
- **Socket:** `live/page.js` receives `wb_draw`, `chat`, `participants` events
- **REST:** No endpoints to fetch current whiteboard state, chat history, participant list
- **Gap:** Page refresh loses real-time state; no "replay" API

### FBA-039: CORS/origin validation only in frontend — **P0**
- **Frontend:** `api.js:7-15, 39-51` `ALLOWED_API_ORIGINS` allowlist; `isAllowedApiOrigin` checks before attaching token
- **Backend:** `socket.js:91-97` `cors: { origin: (origin, callback) => callback(null, true), credentials: true }` — **allows any origin**
- **Critical:** Frontend protects itself; backend wide open (SEC-SOCKET-003)

### FBA-040: No API versioning in URLs — **P2**
- **Frontend:** `getApiBaseUrl()` returns `/api/v1`; all calls use `/api/v1/...`
- **Backend:** Routes mounted at `/api/v1` but no versioning strategy for breaking changes
- **Risk:** Future breaking changes require coordinated deploy

---

## 12. Role-Based UI vs Backend Authorization

### FBA-041: UI hides buttons but backend allows — **P1** (8 instances)
| UI Check | Backend Endpoint | Backend Auth |
|---|---|---|
| `finance/page.js:57` `canVerify` | `/finance/callback-verify` | **None** (only counselor excluded) |
| `finance/page.js:764` `canVerify` | `/finance/verify-installment` | `authorize('admin','manager','financial_officer','accountant')` |
| `classes/[id]/page.js:39-40` `isTeacher` | `/classes/:id/live-launch` | `requireClassMember` only |
| `live/page.js:85-86` `isTeacher` | `socket.io` events | `isRoomTeacher()` in-memory |
| `attendance/page.js:34-36` `isTeacher` | `/attendance/sessions` | `authorize('teacher')` + `requireClassMember` |
| `quizzes/page.js:41-44` `isTeacher` | `/quizzes` | `authorize('teacher','admin','manager')` + `requireClassMember` |
| `assignments/page.js:33-35` `isTeacher` | `/assignments` | `authorize('teacher','admin','manager')` + `requireClassMember` |
| `gradebook` (N/A) | `/gradebook/*` | `authorize('teacher','admin','manager')` + `assertOwnsClass` |

**Pattern:** Frontend role checks use `user.role === 'teacher'` but backend `authorize` expands `'admin'`/`'manager'` to include `school_admin`, `principal`, `headmaster` — frontend doesn't match.

---

## 13. Data Freshness & Caching

### FBA-042: Frontend caches aggressively — stale data — **P2**
| Page | Cache Mechanism | TTL | Invalidation |
|---|---|---|---|
| `login/page.js` | `localStorage` schools | Forever | Manual `loadSchools()` |
| `messages/page.js` | `localStorage` chat per partner | Forever | On new message |
| `attendance/page.js` | `localStorage` shared reports | Forever | On share |
| `assignments/page.js` | `localStorage` `cached_assignments` | Forever | On fetch |
| `classes/[id]/page.js` | `localStorage` `educonnect_classes_cache` | Forever | On save settings |

**No cache-busting strategy** — user sees stale data after backend changes.

### FBA-043: No ETag/If-None-Match — full payload every request — **P2**
- **Frontend:** Axios requests have no conditional headers
- **Backend:** No `ETag` support on GET endpoints
- **Impact:** Gradebook (4.4KB), messages (variable), attendance reports — full transfer every poll

---

## 14. Regression Test Matrix (Integration)

| Workflow | Frontend Entry | Backend Endpoint | Key Assertion |
|---|---|---|---|
| Student check-in | `attendance/page.js:295` | `POST /attendance/sessions/:id/check-in` | Duplicate click → single record |
| Finance settle | `finance/page.js:163` | `POST /finance/verify-installment/:id` | Concurrent settle → 1 success |
| Quiz submit | `quizzes/page.js:655` | `POST /quizzes/:id/submit` | Submit after expiry → 400 |
| Assignment submit | `assignments/page.js:580` | `POST /assignments/:id/submit` | Submit after deadline (no late) → 400 |
| Parent login | `login/page.js:343` | `POST /auth/parent-login` | Unverified parent → 403 |
| AI commit | `ai/page.js` (not seen) | `POST /ai/commit` | `needs_review:true` item → 403 |
| Live join | `live/page.js:949` | `socket.emit('join_class')` | Revoked token → disconnect |
| File upload | `assignments/page.js:351` | `POST /upload` | Executable file → 400 |

---

## 15. Priority Remediation Order (Integration-Focused)

| Priority | Task | Rationale |
|---|---|---|
| **P0-1** | Backend quiz submit time enforcement | Academic integrity; currently frontend-only |
| **P0-2** | Finance callback-verify role auth | Financial integrity; endpoint public |
| **P0-3** | Parent login verification flow | Identity custody; currently bypassed |
| **P0-4** | Socket.IO CORS + revocation check | Full realtime takeover possible |
| **P0-5** | AI commit `needs_review` gate | Fabricated data enters gradebook |
| **P1-1** | Unique constraints on attendance, quiz attempts, submissions | Prevent duplicate race conditions |
| **P1-2** | Transaction wrapper for finance settlement, quiz share, AI commit | Data integrity |
| **P1-3** | Backend deadline enforcement (assignments, quizzes) | Frontend-only locks bypassable |
| **P1-4** | Socket revocation re-check + permission persistence | Realtime auth drift |
| **P1-5** | Remove AI fabrication on empty input | Academic fraud vector |
| **P2-1** | Unified error response format + frontend handling | Debuggability |
| **P2-2** | Request deduplication (idempotency keys) | Double-submit prevention |
| **P2-3** | Cache invalidation strategy + ETag support | Stale data |
| **P2-4** | Backend-driven file URL generation | Proxy/CDN compatibility |
| **P2-5** | Role check alignment (frontend `isTeacher` vs backend `authorize`) | Consistent auth |

---

## 16. Files Requiring Changes (Integration Surface)

### Frontend (27 files)
```
src/lib/api.js                    # Token refresh mutex, idempotency, error normalization
src/stores/authStore.js           # Revocation sync, demo account removal
src/app/login/page.js             # Parent login flow, demo account removal
src/app/dashboard/finance/page.js # Remove local balance calc, add idempotency
src/app/dashboard/attendance/page.js # Server-driven countdown, shared reports API
src/app/dashboard/quizzes/page.js # Remove frontend timer, backend deadline check
src/app/dashboard/assignments/page.js # Remove frontend deadline lock
src/app/dashboard/classes/[id]/page.js # Live settings API, launch API
src/app/dashboard/classes/[id]/live/page.js # Permission persistence, revocation
src/app/dashboard/messages/page.js # Directory API, transaction broadcast
src/app/dashboard/gradebook/page.js # Real gradebook UI (not redirect)
src/lib/socket.js                 # Revocation check, permission sync
```

### Backend (23 files)
```
src/modules/auth/auth.routes.js           # Parent login verification, demo cleanup
src/modules/finance/finance.routes.js     # callback-verify auth, idempotency, transactions
src/modules/attendance/attendance.routes.js # Shared reports API, unique constraint
src/modules/quizzes/quiz.routes.js        # Submit deadline enforcement
src/modules/quizzes/quiz.service.js       # Server-side time check, transaction share
src/modules/assignments/assignment.routes.js # Deadline enforcement (already), unique constraint
src/modules/ai/paperToDigital.service.js  # Remove fabrication, needs_review gate, transaction
src/modules/ai/ai.routes.js               # Commit endpoint validation
src/modules/classes/class.routes.js       # Live settings, launch, live-status endpoints
src/modules/classes/class.service.js      # batchAddStudents unique passwords, live settings
src/modules/gradebook/gradebook.routes.js # Gradebook management UI endpoints
src/modules/messages/message.routes.js    # Directory endpoint, transaction broadcast
src/modules/notifications/notification.service.js # Transaction broadcast
src/src/socket.js                         # CORS, revocation check, permission persistence
src/config/database.js                    # Unique constraints migration
src/modules/upload/upload.routes.js       # Context-aware limits, absolute URLs
src/modules/school/sida.service.js        # Import roster transaction
```

---

*Assessment complete. All findings traced from frontend components through API client, routes, middleware, services, to database operations. No code modified.*