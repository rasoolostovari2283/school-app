# Testing & Verification Report — EduConnect @ 838b5b2

## 1. Baseline test suite (as shipped)

```
$ cd backend && npm test
```
Result: **145/145 pass** (smoke + security + ci + ratchet lint), run offline over zsh, 2026-11-10.

Composition observed in `backend/tests`:
- `security/` (11 files): academics, attendance, auth, classes, communication, deployment, extended-findings,
  finance, gradebook, socket, uploads.
- `smoke/`: main flows, `fixtures/twoSchools.js` (two tenants: school-a / school-b with admins, teachers,
  students, parents, classes, gradebook, ledgers, installments, announcements, chats).
- `ci/`: the ratcheting lint for unscoped primary keys.
- `support/`: `env.js` (process scaffold), `database.js`, `server.js`, `http.js`, `auth.js`, `harness.js`,
  `assertions.js`.

Notable feature of the suite: it is a *ratcheting* safety net — `extended-findings.test.js` contains
deliberately `expectFailure`-wrapped tests that currently document intended vulnerable behavior (the Shaparak
fake-callback flow, the paper-to-digital commit path, cross-tenant finance). They are the designed point for the
next remediation phase to flip (see FW-TEST-001).

## 2. Dynamic verification performed for this audit (Phase 4)

Harness: `backend/.tmp/verify/findings-dynamic-2026-11-10.cjs` — reuses the shipped harness modules, boots the
real express/socket.io app on an ephemeral port with a disposable SQLite populated by the two-school fixture, and
issues real HTTP (fetch) against it. It runs in the same process whose環境 we freeze via `tests/support/env.js`
(ephemeral `TEST_DB_FILE`, JWT keys, upload dir) — so the app is identical to production's except the secrets/DB.
Scratch artifacts are confined to `backend/.tmp/` (gitignored). Output preserved in
`backend/.tmp/verify/out.txt`.

**Result: 10/10 candidate behaviors reproduced.**

| ID | Target | Method | Verdict |
|---|---|---|---|
| A1 | unauth parent-login creates verified parent + returns student identity | POST `/auth/parent-login` `{student_code:'STD-A-1002'}` | **Reproduced** (200; parents 2→3; `is_verified=1`; display_name in body) |
| A2 | unknown code → 401 oracle; frontend-shaped body → contract fail | POST same route ×2 | **Reproduced** (401 + 400) |
| A3 | codes enumerable across schools | POST 3 codes both schools | **Reproduced** (all 200) |
| B1 | callback-verify self-settlement | student JWT → `/finance/callback-verify/installment-a-1` with `{FAKE authority}` | **Reproduced** (verified; ledger 6M paid, 19M balance) |
| C1 | empty OCR → fabricated high-conf rows | POST `/ai/paper-to-digital` | **Reproduced** |
| C2 | commit rewrites existing official grades; needs_review ignored | POST `/ai/paper-to-digital/commit` | **Reproduced** (18→3.0; needs_review committed) |
| C3 | empty roster OCR → fabricated pupil rows + parents in DB | commit roster, then `users` view | **Reproduced** |
| D1 | directory 500 when users lack username | null all usernames → GET `/messages/directory` | **Reproduced** (500 `ensureUserHasUsername is not a function`) |
| E1 | CORS reflects arbitrary origin + credentials | GET/preflight with `Origin: https://evil.example.com` | **Reproduced** |
| F1 | backup route role-only guard | admin GET `/system/backups` | **Reproduced** (200 role-gate passes) |

Methods notes:
- No production data was touched; the suite/db paths write only to `backend/.tmp/...`.
- SMS, Gemini, and the Shaparak gateway flows were exercised with keys unset → deterministic off-ramps (as
  designed); those specific flows were therefore code-reviewed only.
- The upload-quota stress loop (SEC-UPLOAD-001) and the seed-backed 123456 login (SEC-AUTH-002) were verified by
  proof-reading of seeded hashes and the auth flow shape, not by a live seeded login (fixture-test isolation).

## 3. Test coverage / gaps observed

**Covered (as evidenced by passing tests):**
- Role-based rejections for backups+audit logs `[A23]`, announcements (cross-tenant), academics `[A6]`,
  feedback `[A27]`, schedules `[#40]`, live-settings secrets `[F6]`, teacher assets (quizzes/attendance),
  socket connection auth, upload MIME/role checks, analytics tenant scoping, JWT rotation `[A21]`,
  session revocation `[Arch-P1-SessionRevocation]`, account `is_active` gate `[Arch-P1-IsActive]`.

**Not covered (high-priority gaps):**
- Finance settlement (`/callback-verify`) — only exercised **as the intended vulnerable flow**
  (`[Iran-EdTech-Shaparak-SMS]`), never inverted yet.
- Paper-to-digital **commit** path — same pattern (`[Iran-EdTech-PaperToDigital]` locks the flow rather than
  coding the rule "never overwrite without review").
- Parent-login (entire route) has **no** test at all — despite the massive identity implications.
- Backup download/list boundary across schools (role only, see SEC-DATA-001) — no cross-tenant test.
- Upload quota/Doシング edge (multer DoS + disk exhaustion) — static only.
- Frontend: no component tests for the login/demo flow, authStore contract, or directory page crash.
- `npm audit`-equivalent checks in CI (no lock), OSV/native-lib updates — none.

**Suite robustness notes:**
- `node --test` runs each file in its own process with its own DB → suites can't contaminate each other.
- The `expectFailure` wrappers are a *documentation* mechanism (they assert that the vuln is still present) —
  the moment a fix lands, they flip red and demand attention. This is good — but they should be renamed to a
  "fixed-behavior" marker so CI output reads honestly during remediation.
- 203 unique packages (backend+root+frontend) are inventory-kind; frontend packages were inventoried but not
  deeply reviewed (see roadmap).

## 4. How to re-run the audit harness (for reviewers)

```bash
cd backend && \
  NODE_OPTIONS=--no-warnings node .tmp/verify/findings-dynamic-2026-11-10.cjs
# prints the PASS/FAIL per check plus a JSON-ish summary; also writes .tmp/verify/out.txt
```

Verify-status notation used across the report:
- **Confirmed (dynamic)** — reproduced by the harness against the real app;
- **Confirmed (code/static)** — evidence from code reading only (line refs given);
- **Static / advisory** — dependency advisories retrieved from OSV 2026-11-11;
- **Probable / Weakness** — for the items we knowingly classified lower because of reduced exploitability.
