# EduConnect Frontend Assessment — Independent Investigation

**Audit Date:** 2026-11-11  
**Commit:** `838b5b2` (main)  
**Scope:** Next.js 15 App Router frontend — architecture, state management, API integration, UX, security, testing

---

## Executive Summary

**Frontend Maturity:** **Functional Prototype** — Feature-complete but with significant architectural and security gaps  
**Architecture:** Next.js 15 App Router, React 19, Zustand, Axios  
**Lines of Code:** ~50,700 (JS) + 22,100 (CSS)  
**Testing:** **ZERO** — No test files, no test runner, no CI gate  
**Security Posture:** **HIGH RISK** — Tokens in localStorage, CORS issues, XSS vectors  
**Accessibility:** Not assessed (requires runtime)  
**Performance:** Client-heavy, no code splitting visible, large bundles

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         FRONTEND ARCHITECTURE (Next.js 15)                  │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│  NEXT.JS 15 APP ROUTER                                                      │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ app/                                                                  │   │
│  │  ├── layout.js (root)                                                │   │
│  │  ├── page.js (root redirect)                                         │   │
│  │  ├── login/page.js (auth entry)                                      │   │
│  │  └── dashboard/ (27 sections)                                        │   │
│  │     ├── page.js (dashboard root)                                     │   │
│  │     ├── layout.js (sidebar, header)                                  │   │
│  │     ├── classes/[id]/page.js (class detail)                          │   │
│  │     ├── classes/[id]/live/page.js (live classroom)                   │   │
│  │     ├── finance/page.js (tuition, payments)                          │   │
│  │     ├── gradebook/page.js → report-card/page.js                      │   │
│  │     ├── attendance/page.js                                           │   │
│  │     ├── quizzes/page.js                                              │   │
│  │     ├── assignments/page.js                                          │   │
│  │     ├── messages/page.js                                             │   │
│  │     ├── ... (20 more sections)                                       │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    ▼               ▼               ▼
            ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
            │   STORES     │  │   API LIB    │  │  SOCKET.IO   │
            │  (Zustand)   │  │   (Axios)    │  │  (Socket.IO) │
            │              │  │              │  │              │
            │ • authStore  │  │ • Axios      │  │ • Token from │
            │ • classStore │  │ • Interceptors│  │   localStorage│
            │              │  │ • Origin check│  │ • Auto-reconnect│
            │ ~2000 lines  │  │ • Token refresh│ │ • Event handlers│
            └──────────────┘ └──────────────┘ └──────────────┘
```

---

## Codebase Metrics

| Metric | Value |
|---|---|
| **Total JS/JSX Files** | 88 (50 .js + 38 .css) |
| **Dashboard Sections** | 27 (under `app/dashboard/`) |
| **Page Components** | 29 `page.js` files (3 under `classes/[id]/`) |
| **Client Components** | 44 files with `"use client"` |
| **Server Components** | 0 (all dashboard pages are client) |
| **Zustand Stores** | 2 (`authStore`, `classStore`) |
| **API Client** | 1 (`lib/api.js` — Axios wrapper) |
| **Socket Client** | 1 (`lib/socket.js`) |
| **Components** | 18 files in `components/` (7 categories) |
| **Total JS LOC** | ~50,733 |
| **Total CSS LOC** | ~22,110 |
| **Test Files** | **0** |
| **TypeScript** | **No** — `jsconfig.json` only |

---

## State Management (Zustand)

### `authStore.js` (~1,200 lines)
**Responsibilities:**
- User authentication state (`user`, `isAuthenticated`, `isLoading`)
- Login flows: `login`, `quickEntry`, `parentLogin`, `demoLogin`, `register`, `registerSchool`
- Token management: `accessToken`, `refreshToken` in **localStorage**
- Profile: `updateProfile`, `refreshProfile`
- Session: `logout`, `revokeAllSessions`
- Locale management
- Demo accounts (6 hardcoded accounts with `password: '123456'`)

**Security Issues:**
- Tokens in `localStorage` (not httpOnly cookies) — **PRIV-044**
- Demo accounts with `password: '123456'` in production code — **PRIV-005**
- Full user profile (including `settings` with national codes) in localStorage — **PRIV-024**

### `classStore.js` (~200 lines)
**Responsibilities:**
- Class caching (by teacher)
- Student roster caching
- Class selection state

**Scope:** Limited to class-level caching — minimal compared to authStore.

---

## API Client (`lib/api.js`)

### Architecture
```javascript
const api = axios.create({
  baseURL: getApiBaseUrl(),  // Dynamic from localStorage/window.origin
  timeout: 15000,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' }
});
```

### Key Behaviors
| Feature | Implementation |
|---|---|
| **Base URL Resolution** | `getApiBaseUrl()` — prefers same-origin proxy, falls back to localStorage URLs |
| **Origin Validation** | `isAllowedApiOrigin()` — allow-list of 7 origins + `NEXT_PUBLIC_API_URL` |
| **Request Interceptor** | Updates `baseURL` per request, attaches `Authorization` from localStorage |
| **FormData Handling** | Removes Content-Type header for multipart |
| **Response Interceptor** | Auto-refresh on 401 `TOKEN_EXPIRED` (with `_retry` guard) |
| **Legacy URL Cleanup** | Purges old tunnel/LAN URLs from localStorage |

### Security Issues
| Issue | Location | Risk |
|---|---|---|
| Tokens in localStorage | Lines 148-151 | XSS = token theft |
| Refresh token in request body | Line 187 | Logged by proxies, CSRF |
| No request deduplication | — | Double-submit possible |
| No request IDs | — | No correlation for debugging |
| Dynamic baseURL per request | Line 145 | Race condition if `getApiBaseUrl()` changes mid-flight |

---

## Real-time Client (`lib/socket.js`)

### Connection Flow
```javascript
socket = io(backendUrl, {
  transports: ['polling', 'websocket'],
  reconnectionAttempts: 15,
  reconnectionDelay: 1500,
  timeout: 20000,
  autoConnect: true,
  withCredentials: true,
  auth: (cb) => cb({ token: localStorage.getItem('accessToken') || ... })
});
```

### Security Issues
| Issue | Location | Risk |
|---|---|---|
| Token from localStorage | Line 27 | XSS = token theft |
| No reconnection auth refresh | — | Revoked tokens still work |
| No exponential backoff cap | `reconnectionDelay: 1500` | Reconnection storm |
| No connection state UI | — | User unaware of disconnect |

---

## Dashboard Sections (27 Sections)

| Section | File | Auth Guard | Key Features |
|---|---|---|---|
| `analytics` | `analytics/page.js` | ✅ | Charts, metrics |
| `announcements` | `announcements/page.js` | ✅ | CRUD, pin, target |
| `assignments` | `assignments/page.js` | ✅ | Create, submit, grade |
| `attendance` | `attendance/page.js` | ✅ | Sessions, check-in, reports |
| `children` | `children/page.js` | ✅ | **Demo data only** (PRIV-025) |
| `class-rosters` | `class-rosters/page.js` | ✅ | Roster management |
| `classes` | `classes/page.js` | ✅ | List, create, join |
| `classes/[id]` | `classes/[id]/page.js` | ✅ | Detail, live, roster, settings |
| `classes/[id]/live` | `classes/[id]/live/page.js` | ✅ | **Live classroom** (whiteboard, WebRTC) |
| `discipline` | `discipline/page.js` | ✅ | Records |
| `finance` | `finance/page.js` | ✅ | Ledger, payments, Shaparak |
| `gradebook` | `gradebook/page.js` | ❌ **Redirects to report-card** | Redirect only |
| `manage-classes` | `manage-classes/page.js` | ✅ | Class management |
| `management` | `management/page.js` | ✅ | Admin dashboard |
| `messages` | `messages/page.js` | ✅ | Chat, groups, calls |
| `notifications` | `notifications/page.js` | ✅ | List, read, broadcast |
| `quizzes` | `quizzes/page.js` | ✅ | Create, take, share, results |
| `record` | `record/page.js` | ✅ | Student records |
| `report-card` | `report-card/page.js` | ✅ | Transcripts, GPA |
| `schedule` | `schedule/page.js` | ✅ | Timetable |
| `school-meetings` | `school-meetings/page.js` | ✅ | Meetings |
| `settings` | `settings/page.js` | ✅ | Profile, password |
| `smart-operations` | `smart-operations/page.js` | ✅ | AI, finance, admin |
| `study-planner` | `study-planner/page.js` | ✅ | Planning, logs |
| `teacher-setup` | `teacher-setup/page.js` | ✅ | Onboarding |
| `teachers` | `teachers/page.js` | ✅ | Directory |
| `tickets` | `tickets/page.js` | ✅ | Ticketing |
| `videos` | `videos/page.js` | ✅ | Library, streaming |

### Missing Auth Guards (PRIV-008 related)
| Page | Role Check |
|---|---|
| `gradebook/page.js` | **None** — 7 LOC loader, no `useAuthStore` |
| `notifications/page.js` | **None** — 152 LOC, no `useAuthStore` |

---

## Live Classroom (`classes/[id]/live/page.js` — 1,400+ lines)

### Features
- Whiteboard (canvas, strokes, undo/redo, multi-page, backgrounds)
- Screen sharing (getDisplayMedia, 350ms frame broadcast)
- Audio (WebRTC, MediaRecorder, Opus/WebM chunks)
- Chat (100 message history, real-time)
- Participants (hand raise, mic/cam permissions, teacher controls)
- Document viewer (PDF, PPTX via `pptxRenderer.js`)
- Recording (MediaRecorder, canvas capture)
- External provider integration (Skyroom, BigBlueButton)

### Security Issues
| Issue | Location | Risk |
|---|---|---|
| Permissions from server only at join | Line 86-93 | Revoked permissions not re-checked |
| `screen_frame`/`live_video_frame` no auth | Line 561-564, 678-681 | **PRIV-023** — Any participant broadcasts |
| `webrtc_signal` blind relay | Line 662-676 | **SEC-SOCKET-002** — Spoofable senderData |
| No rate limiting on events | — | DoS via spam |
| EXIF not stripped from uploads | — | GPS/device leakage |

---

## UI/UX Assessment

### Strengths
- **Persian/RTL first** — Proper RTL layout, Persian numerals, Jalali dates
- **Responsive** — Mobile-first CSS, hamburger menu, bottom nav
- **Loading states** — Spinners, skeletons on most pages
- **Toast notifications** — `react-hot-toast` for feedback
- **Persian number normalization** — Input helpers for Persian/Arabic digits
- **Accessibility basics** — Semantic HTML, alt text on images

### Weaknesses
| Issue | Example |
|---|---|
| **No code splitting** | All 27 dashboard sections in main bundle |
| **Large bundle size** | ~50k JS + 22k CSS, no dynamic imports |
| **No skeleton loading** | Only spinners, no content placeholders |
| **No optimistic UI** | Mutations wait for server response |
| **No offline support** | No service worker, no offline queue |
| **No keyboard shortcuts** | Power user features missing |
| **No undo for destructive actions** | Delete class, delete assignment — confirm only |
| **Inconsistent empty states** | Some pages show "no data", others blank |
| **No pagination on lists** | Messages, notifications, members — all loaded at once |
| **Demo data in production** | `children/page.js` hardcoded demo children |

---

## Security Issues (Frontend-Specific)

| ID | Finding | Location | Severity |
|---|---|---|---|
| **PRIV-005** | Demo accounts with `123456` in `authStore.js:27-71` | `authStore.js:27-71` | P0 |
| **PRIV-006** | Username from display name (transliteration) | `authStore.js:91-93` | P2 |
| **PRIV-007** | Full user profile in localStorage | `authStore.js:98-100` | P1 |
| **PRIV-008** | Gradebook/Notifications pages lack auth guard | `gradebook/page.js`, `notifications/page.js` | P1 |
| **PRIV-011** | Full user object in finance API response | `finance/page.js:75-82` | P1 |
| **PRIV-014** | Payment receipt URLs exposed | `finance/page.js:793-892` | P1 |
| **PRIV-015** | Sheba validation returns full IBAN | `finance/page.js:173-188` | P1 |
| **PRIV-016** | Uploaded files served without ACL | `app.js:109-121` | P1 |
| **PRIV-017** | EXIF not stripped from images | `upload.routes.js:56-62` | P1 |
| **PRIV-018** | No virus scanning on uploads | `upload.routes.js:106-166` | P1 |
| **PRIV-019** | Orphaned uploads persist | `class.service.js:313-329` | P2 |
| **PRIV-020** | API returns full user object with settings | `auth.service.js:123-125` | P0 |
| **PRIV-021** | Finance ledger returns student PII | `finance/page.js:75-82` | P1 |
| **PRIV-022** | Class detail returns all member PII | `classes/[id]/page.js:117-151` | P1 |
| **PRIV-023** | AI extraction returns PII before review | `paperToDigital.service.js:62-99` | P0 |
| **PRIV-024** | localStorage stores full user profile | `authStore.js:98-100` | P1 |
| **PRIV-025** | Demo PII in children page | `children/page.js:9-28` | P2 |
| **PRIV-044** | JWT in localStorage | `authStore.js:173-175` | P0 |
| **PRIV-046** | CORS allows any origin | `app.js:92-98` | P0 |

---

## Performance Analysis

### Bundle Characteristics
| Metric | Value | Concern |
|---|---|---|
| **Total JS** | ~50,733 LOC | Large |
| **Total CSS** | ~22,110 LOC | Large |
| **Client Components** | 44 files | All in main bundle |
| **Route-level Code Splitting** | **None** | All in main bundle |
| **Dynamic Imports** | **None found** | `next/dynamic` not used |
| **Tree Shaking** | Unknown | No bundle analysis |

### Network Behavior
| Pattern | Observation |
|---|---|
| **Request Deduplication** | None — double-click = double request |
| **Request Cancellation** | None — no `AbortController` usage |
| **Optimistic Updates** | None — all mutations wait for server |
| **Pagination** | None — full lists loaded (messages, notifications, members) |
| **Caching** | `localStorage` for classes, manual cache invalidation |

### Loading States
| Page | Loading Pattern |
|---|---|
| Dashboard | `useEffect` + `Promise.allSettled` for parallel loads |
| Class Detail | `Promise.allSettled` for 5 parallel requests |
| Finance | Sequential: students → ledger |
| Quizzes | Parallel: classes + quizzes |
| Messages | Sequential: conversations → groups → directory |

---

## Accessibility (Static Analysis Only)

| Criterion | Status | Notes |
|---|---|---|
| **Semantic HTML** | ✅ | `main`, `section`, `header`, `button`, `label` |
| **Alt Text** | ⚠️ Partial | Some images lack alt |
| **Form Labels** | ✅ | `label` + `htmlFor` used |
| **ARIA** | ⚠️ Partial | Some `aria-label`, missing on custom components |
| **Keyboard Navigation** | ⚠️ Partial | Focus visible, but custom dropdowns may trap |
| **Color Contrast** | ⚠️ Unknown | Requires runtime audit |
| **Focus Management** | ⚠️ Partial | Modals trap focus, but not all |
| **Screen Reader** | ❌ Not tested | Requires runtime |

---

## State Consistency Issues

| Issue | Location | Impact |
|---|---|---|
| **Stale class cache** | `classStore.js` — no invalidation on class update | Teacher sees old class list |
| **Optimistic UI missing** | All mutations | Perceived latency, double-clicks |
| **Race condition: class join** | `class.service.js:252-278` | 500 error on concurrent join |
| **Stale user profile** | `authStore.js` — `refreshProfile` manual only | Role/school changes not reflected |
| **Socket reconnection state loss** | `socket.js` — permissions reset on reconnect | Teacher loses granted permissions |

---

## Mobile (Capacitor) Assessment

| Aspect | Status |
|---|---|
| **Code** | 3 Java files (`MainActivity.java` + 2 scaffold tests) |
| **Functionality** | WebView wrapper only — no native features |
| **Capacitor Config** | `capacitor.config.ts` exists |
| **Build** | `npm run build` → `npx cap sync` → Android Studio |
| **Security** | WebView cookie/storage handling unclear |
| **Push Notifications** | Not implemented |
| **Offline** | Not implemented |

---

## Testing Gap

| Test Type | Status | Coverage |
|---|---|---|
| **Unit Tests** | **None** | 0% |
| **Integration Tests** | **None** | 0% |
| **E2E Tests** | **None** | 0% |
| **Component Tests** | **None** | 0% |
| **Accessibility Tests** | **None** | 0% |
| **Visual Regression** | **None** | 0% |
| **Test Runner** | **None configured** | No `vitest`, `jest`, `playwright`, `cypress` |
| **CI Gate** | **None** | `frontend/package.json` has no `test` script |

**Critical:** 50k+ lines of React code with **zero automated tests**.

---

## Build & Deployment

| Aspect | Status |
|---|---|
| **Build Command** | `npm run build` (Next.js) |
| **Output** | `.next/` (standalone not configured) |
| **Dockerfile** | **None** |
| **CI/CD** | **None** (only backend CI) |
| **Environment Config** | `NEXT_PUBLIC_API_URL` only |
| **Standalone Output** | Not configured |
| **Image Optimization** | Next.js default (unconfigured) |
| **Bundle Analysis** | Not configured |

---

## Recommendations

### Immediate (P0)
1. **Add httpOnly cookies for tokens** — Remove from localStorage
2. **Add auth guards to gradebook/notifications pages** — Use `useAuthStore`
3. **Remove demo accounts from production** — Environment-based seeding
4. **Add request deduplication** — Prevent double-submit
5. **Add CSP headers** — Mitigate XSS from uploads

### Short-term (P1)
1. **Add httpOnly cookie auth** — Replace localStorage tokens
2. **Add request deduplication** — `axios-request-deduplicator` or custom
3. **Add route-level code splitting** — `next/dynamic` for dashboard sections
4. **Add skeleton loading** — Replace spinners with content placeholders
5. **Add request deduplication** — Prevent double-submit
6. **Add CSP headers** — On upload responses and HTML
7. **Add per-file ACL checks** — Before serving uploads
8. **Add virus scanning** — On upload
9. **Remove demo data** — Environment-based
9. **Add auth guards** — All dashboard pages

### Medium-term (P2)
1. **Route-level code splitting** — `next/dynamic` for each dashboard section
2. **Add E2E tests** — Playwright for critical flows
2. **Add component tests** — React Testing Library for stores/components
3. **Add visual regression** — Playwright + pixelmatch
4. **Add accessibility tests** — axe-core in CI
5. **Add bundle analysis** — `next-bundle-analyzer`
5. **Add bundle size budgets** — CI gate
6. **Add image optimization** — Next.js Image component
6. **Add service worker** — Offline support, caching
6. **Add PWA manifest** — Installable
7. **Add bundle size budgets** — CI gate
8. **Add visual regression testing** — Playwright
9. **Add accessibility audit** — axe-core in CI
10. **Add performance budgets** — Lighthouse CI

---

## Frontend Architecture Scorecard

| Dimension | Score | Notes |
|---|---|---|
| **Architecture** | 7/10 | Next.js App Router, Zustand, clean separation |
| **State Management** | 6/10 | Zustand works, but localStorage tokens |
| **API Integration** | 5/10 | Axios interceptors good, but token handling weak |
| **Real-time** | 6/10 | Socket.IO works, but permission issues |
| **Component Design** | 7/10 | Consistent, reusable, Persian/RTL |
| **Security** | 2/10 | Tokens in localStorage, CORS, demo accounts |
| **Performance** | 4/10 | No code splitting, large bundles, no pagination |
| **Accessibility** | 5/10 | Basics done, needs audit |
| **Testing** | **0/10** | **Zero tests** |
| **Build/Deploy** | 3/10 | No Docker, no CI, no frontend tests in CI |
| **Maintainability** | 6/10 | Consistent patterns, but large files |
| **Scalability** | 3/10 | No code splitting, single bundle |

**Overall Frontend Score: 4.5/10** — **Prototype grade**

---

*Frontend assessment based on static code analysis of commit `838b5b2`. No runtime testing performed.*
