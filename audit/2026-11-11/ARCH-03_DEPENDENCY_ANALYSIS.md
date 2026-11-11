# Dependency Analysis — EduConnect @ 838b5b2

Manifest-level analysis (3 manifests read whole) + internal module matrix from first-party reads (session inventory). Installed versions from the preserved tree inventory (`backend/.tmp/verify/pkglist.json`, 203 unique pkgs, 2026-11-11) and targeted reads. Run offline; npm audit impossible (no npm lockfile — `bun.lock` only, lockfileVersion 2).

## 3.1. Manifest matrix

| Package | backend manifest | backend **installed** | root manifest | frontend manifest | Runtime role / notes |
|---|---|---|---|---|---|
| express | `^4.21.0` | 4.22.3 | `^5.3.0` | — | web framework; backend is its own `node_modules` (npm workspaces non-hoisted) |
| socket.io | `^4.7.5` | 4.8.4 | — | — | realtime server |
| socket.io-client | dev `^4.8.1` | — | — | `^4.8.1` | client; also test harness |
| multer | `^1.4.5-lts.1` | 1.4.5-lts.2 | `^2.5.0` | — | upload middleware — **root 2.x is dead weight; backend 1.x carries OSV HIGH cluster (§A-02)** |
| better-sqlite3 | **(absent)** | 13.0.3 | `^13.0.3` | — | **drives `knexfile.js:12` but undeclared in backend** — ENOLOCK/npm-repro blocker (§11) |
| sqlite3 | — | — | `^6.0.1` | — | declared at root, **never required in src** — vestigial |
| pg | `^8.13.0` | 8.23.1 | — | — | pg opt-in dialect (unused: production falls back to SQLite, knexfile:46–66) |
| joi | `^17.13.3` | 17.13.9 | `^18.3.2` | — | validation (auth.validators); root 18 unused |
| joi decl. drift: same skew | helmet `^7.1.0` vs `^8.3.0` | 7.2.0 | 8.3.0; express-rate-limit `^7.4.0` vs `^8.7.4` (7.5.1); cors `^2.8.5` vs `^2.8.6`; bcryptjs `^2.4.3` vs `^3.0.3` (2.4.3); uuid `^10.0.0` vs `^14.0.3`; jsonwebtoken `^9.0.2` vs `^9.0.3`; compression `^1.7.5` vs `^1.8.2`; morgan `^1.10.0` vs `^1.12.1`; knex `^3.1.0` vs `^3.3.0`; dotenv backend-only `^16.4.5` ✔; axios dedup 1.7.9/1.7.9 ✔; socket.io-client 4.8.1 ✔; React/Next consistent; zustand `^5.0.2` ✔ |
| sharp | `^0.33.5` | 0.33.5 | — | — | image pipeline (optional-run at cold boot: SSSE3 guard) — **OSV HIGH cluster** |
| @google/genai | — | absent | `^3.0.0` | — | root-only, lazy-requires in `ai.service.js:103`, `paperToDigital.js:27` → AI paths dark (SEC-AI-002); **install into backend = live prompt-injection surface** |
| jsonwebtoken | `^9.0.2` | 9.0.3 | `^9.0.3` | — | JWT lifecycle |
| uuid | `^10.0.0` | 10.0.0 | `^14.0.0` | — | two majors co-installed (harmless today; drift smell) |
| next/react/react-dom | — | — | `^15.1.0` / `^19.0.0` | same | APP router shell |
| capacitor core/app | — | — | `^8.1.2` / `^8.6.0` | — | Android packaging (frontend/android/) |
| tailwindcss | — | — | `^4.0.0` + `@tailwindcss/postcss` | same | v4 with PostCSS plugin standalone |
| pdfjs-dist | — | — | `^3.11.174` | same | but browser actually uses **vendored** `frontend/public/pdf*.js` (568K/1.9M/1.0M) — npm package possibly redundant for runtime path (build-size question) |

**Count check:** backend manifest 16 deps, root 28, frontend 13 (several shared-redeclared); the tree carries two `node_modules` roots (`backend/node_modules` 72 MB, `frontend/node_modules` 660 MB — incl. Next/React native parts).

## 3.2. Workspace drift diagnosis

Root cause: backend deps were pinned **older majors** when the root was later hoisted/upgraded; npm workspaces non-hoS ts each gets its own tree so dual majors simply exist side by side. Consequences today: drift is *cosmetic* (no behavioral shared dep), but it (a) doubles CVE surface comparisons, (b) lures admins into upgrading only one manifest, (c) anchors the "no committed npm lockfile" defect: `bun.lock` (v2) covers root; backend-only deps (`better-sqlite3`, `sharp`, `multer`, `pg`, `socket.io`, `express 4`…) are **not reliably locked** → Docker ps1/npm-ci reproducibility risk (§11).

## 3.3. Internal module dependency (first-party DAG)

As in `ARCH-02/D3`. Dominant shared-cross-module consumers:
- `modules/school` (729-ln router), `modules/finance`, `modules/attendance` → `services/smsGateway.js` (in-memory; three call sites; single instance).
- `modules/ai/paperToDigital` → `modules/school/sida.service` + `modules/quizzes/quiz.service` (commit-time vertical writes into two unrelated domains).
- `modules/classes/class.controller` → late `externalLive.service` (per-class provider: skyroom/bbb).
- `app.js` → `socket.js` (+ `classroomPersistence`) and `dbMaintenance.js` (+ schedule at boot).
- **One dead module:** `services/sms.service.js` (89 ln) — zero importers.
- **One phantom documented helper:** ratchet lint header advertises `assertPaymentScope` — absent from `middleware/auth.js` (grep: no matches) (drift symptom, §14).

## 3.4. Advisory exposure (from preserved OSV batch, linked to security deliverables)

4 of 203 installed packages match OSV advisories at install versions:
- **multer 1.4.5-lts.2 — 11 HIGH (DoS)** — on the primary upload path (SEC-UPLOAD-001).
- **sharp 0.33.5 — 3 HIGH (native image libs)** — image pipeline (SEC-DEP-001 matrix).
- **minimatch 10.2.6 — 1 moderate; uuid 10.0.0 — 1 moderate.**
No `express@4.22.3`, `helmet@7.2.0`, `joi@17.13.9`, `jsonwebtoken@9.0.3`, `bcryptjs@2.4.3`, `socket.io@4.8.4`, `knex@3.3.0`, `better-sqlite3@13.0.3` hits as installed.
**Reproducibility:** advisories not re-fetched (fresh fetch could add matches; preserved JSON: `backend/.tmp/verify/osv-report.json`).

## 3.5. Install/upgrade hazards summary

| # | Hazard | Kind | Smallest fix |
|---|---|---|---|
| D-1 | `better-sqlite3` drives DB but not in backend manifest; only a hoisted/or root copy | Deployment | declare in `backend/package.json`; verify `npm ci` in Dockerfile |
| D-2 | single `bun.lock` v2, no npm lockfile; CI/ps1/Docker use `npm ci`/`npm install` | Deployment | pick one PM across scripts (see §11) and commit its lockfile |
| D-3 | `@google/genai` root-only, lazily required by backend (absent today) | Supply chain | move to backend manifest behind env gate, or internal provider interface |
| D-4 | `sqlite3@^6` root — unused | Debt | delete from root manifest |
| D-5 | dual majors for shared deps (multer especially) | Hygiene | align backend majors to root where safe (multer 2.x is the CVE fix) |
| D-6 | sharp/multer advisory clusters × primary surfaces | Security | multer→2.x; sharp→latest patchline |
| D-7 | frontend `pdfjs-dist` in manifests but runtime uses vendored copy | Hygiene | either drop dep or load via package; one source of truth |

*See roadmap Phase 0/2 tie-ins (`ARCH-05`).*
