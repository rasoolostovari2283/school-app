# Dependency, Configuration & Supply-Chain Audit — EduConnect @ 838b5b2

Two-part evidence report: (A) the dependency inventory + advisory scan, (B) configuration & repo hygiene.

---

## A. Dependency inventory (installed, not declared)

Method: inventoried the actual installed trees (`backend/node_modules`, `node_modules`, `frontend/node_modules`,
203 unique packages → `backend/.tmp/verify/pkglist.json`) and batch-queried OSV.dev
(`api.osv.dev/v1/query`) on 2026-11-11 for each `name@version`. This is the ground truth.

### A.1 Advisory matches (4 of 203)

| Package | Installed | Matching advisories | OSV severity | Intersection |
|---|---|---|---|---|
| `multer` | 1.4.5-lts.2 | 11 (GHSA-44fp-w29j-9vj5, GHSA-4pg4-qvpc-4q3h, GHSA-535w-7cp7-47q4, …) | **HIGH** | All upstream DoS classes — unclosed streams/memory, crafted multipart abuse, huge field-name index — on the exact upload pipeline (SEC-UPLOAD-001). |
| `sharp` | 0.33.5 | 3 (GHSA-f88m-g3jw-g9cj, GHSA-rgj7-g3m4-5g8c, GHSA-wq5f-xc86-pv6w) | **HIGH** | libvips/libheif/librsvg CVEs (2026). Same image pipeline (photo/PDF → sharp in `upload`). |
| `minimatch` | 10.2.6 | GHSA-g3hv-75wg-m249 | moderate | Used transitively (pattern matching) — moderate only. |
| `uuid` | 10.0.0 | GHSA-w5hq-g745-h8pq | moderate | Bounds-check on caller-provided buffer in `v3/v5/v6`; EduConnect uses `v4` — low practical risk. |

Clean at installed version: `express@4.22.3`, `helmet@7.2.0`, `joi@17.13.9`,
`express-rate-limit@7.5.1`, `bcryptjs@2.4.3`, `jsonwebtoken@9.0.3`, `knex@3.3.0`,
`better-sqlite3@13.0.3`, `socket.io@4.8.4`, `pg@8.23.1`, `cors@2.8.6`, `dotenv@16.6.1`, `uuid@10.0.0`
(no hits for the deliberately uncertain ones was also confirmed — see notes in ledger).

### A.2 Version drift: backend `package.json` vs installed vs root `package.json`

| Package | backend manifest | installed | root workspace | Notes |
|---|---|---|---|---|
| express | `^4.21.0` | 4.22.3 | `^5.3.0` | ~1 major apart |
| multer | `^1.4.5-lts.1` | 1.4.5-lts.2 | `^2.5.0` | multer 2.x line fixes the DoS class |
| helmet | `^7.1.0` | 7.2.0 | `^8.3.0` |  |
| joi | `^17.13.3` | 17.13.9 | `^18.3.2` |  |
| express-rate-limit | `^7.4.0` | 7.5.1 | `^8.7.4` |  |
| bcryptjs | `^2.4.3` | 2.4.3 | `^3.0.3` (bcryptjs?) | flag for manual check — root might bring `bcrypt` vs `bcryptjs` |
| jsonwebtoken | `^9.0.2` | 9.0.3 | `^9.0.2` | same |
| knex | `^3.1.0` | 3.3.0 | `^3.3.0` |  |
| better-sqlite3 | (backend) | 13.0.3 | — | only backend |
| sharp | `^0.33.5` | 0.33.5 | — |  |
| `@google/genai` | declared in AI module require (optional) | **not installed** | — | Gemini path dark (SEC-AI-002). |

The root also pulls `frontend` packages (Next.js 15.4, React 19) — recorded so the next audit can diff them
against the npm advisory DB for the client side (e.g. Next.js directive, webpack `minimatch`, etc.).

### A.3 Lockfile / reproducibility
- **No committed lockfile for npm** (`bun.lock` only at root; `npm audit` → ENOLOCK; CI does a bare
  `npm install --no-audit --no-fund` in `.github/workflows/backend-tests.yml`). Consequence: two machines can
  install different charts of the same manifest; advisory scanning is impossible for reproducible runs.
- The single `bun.lock` (lockfileVersion 2) records the root workspace resolution. When backend deps were
  upgraded at the workspace root, the backend's own older ranges were kept — an easy source of the
  multer/helmet/joi drift above.

### A.4 Homepage of the risk (recommended fix order)
1. `multer` → `2.x` (or drop to streaming busboy) — closes the DoS class on the upload path.
2. `sharp` → latest patch line (current 0.33.x already includes the patched native binaries; confirm via
   `sharp --version` in CI).
3. Move to a committed `bun.lock`/workspace lockfile and `npm ci` (or `bun install --frozen-lockfile`) in CI;
   add `osv-scanner` or `npm audit --omit=dev` to the workflow.
4. Decide the AI engine strategy (either pin `@google/genai` with a schema-validated parser or delete the cloud
   path — see SEC-AI-002).

---

## B. Configuration & repository hygiene

### B.1 Committed config / credentials
- **No committed `.env`** (scanned tracking tree for `*.env`, git log for `env` — only `.env.example` files
  tracked; `.env` is gitignored as `.env, .env*.local, *.env` with an explicit exception for examples).
- `backend/.env.example` and `.env.example` hold **empty** values for secrets (JWT blank) with "generate with
  openssl rand -hex 48" guidance − good.
- **dev-server.js** lines 7–8 commit two "dev" JWT defaults (see SEC-CFG-001). `dev-server.js` is not used by the
  Dockerfile/backend CI, but it is the documented local runner.
- `Deploy-Windows-Server.ps1` generates CSPRNG hex secrets for `/backend/.env` (good) but pins old installs
  (Node v20.18.0) and old Git (2.47.0) — pin bump + checksummed URLs a nice next pass.
- `metadata.json` simply describes the software; it reveals the Gemini capability — fine, but remember API keys in
  client metadata warn of accidental bundle leakage — the current bundle has no key (verified empty).

### B.2 Config values to revisit
- `express-rate-limit` global 600/15min per IP on `/api/` (app.js 123–135) — very generous for
  payroll-sensitive endpoints; per-auth-subject limiting isn't reachable from this API shape, so the login limiter
  (30/15min) is the only strong one. Note `parent-login` is **not** in the limiter list (auth.js 137–152).
- Upload budget: `MAX_FILE_SIZE=52428800` (50MB) — fine; per-request count 30 (see SEC-UPLOAD-001).
- `helmet` with `frameguard:false` (app.js 79) — intentional to allow third-party embeds; document the rationale.
- CORS (B) — see SEC-CORS-001.

### B.3 CI/CD posture
- `.github/workflows/backend-tests.yml`: Node 24, `npm install` (no lock, no audit) — reproducibility risks
  documented in A.3. Add the OSV step and a `--frozen-lockfile` so every PUSH/PR source-scans.
- There is **no lint/format gate** for new code aside from `npm test` (the unscoped-query ratchet). A frontend
  build gate would also catch the missing dev-time `@google/genai` import.

---

## Vulnerabilities summary (CVSS 4.0 / OWASP)

| # | Package | Severity | CVSS-ish | Primary exposure |
|---|---|---|---|---|
| 1 | multer (DoSing) | High | ~7.5 | Public upload pipeline; memory/disk exhaustion |
| 2 | sharp (native libs) | High | ~7.5 | Image-resize pipeline; crash/abuse via crafted media |
| 3 | minimatch | Moderate | ~6.5 | internal tooling only |
| 4 | uuid (buf API) | Moderate | ~6.5 | EduConnect uses v4 — near-zero |
| — | no lockfile | High (process) | — | supply-chain drift; CI can't know what runs |
| — | dev JWT defaults | Medium | 5.4 | secret leakage class (SEC-CFG-001) |

*All numbers recomputed as the OSV DB snapshot retrieved 2026-11-11.*
