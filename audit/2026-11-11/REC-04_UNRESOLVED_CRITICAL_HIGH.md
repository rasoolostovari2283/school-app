# Unresolved Critical & High Findings — second independent pass @ 838b5b2 (2026-11-11)

**Every item re-verified this session** (code re-read line-by-line and/or dynamically re-run);
no fixes exist at HEAD. The Socket.IO findings (added earlier today, same HEAD) are folded in.

## Critical

1. **SEC-FIN-001 — Tuition settles with no bank/IPG verification (≈ 9.2).** `finance.routes.js:410–527`. Live B1 again: *student* settles instalment, injected authority echoed; balances drain to 0 instalment-by-instalment (single-instalment dedupe only). Lock-in: R2 test.
2. **SEC-AI-001 — AI pipeline commits fabricated/unreviewed data (≈ 8.8).** `paperToDigital.service.js:195–225/265–289/335–357/461–598` + `ai.routes.js:45–56`. Live C1–C3 again: fabricated pupil rows extracted at high confidence; gradebook overwritten 18→3.0 incl `needs_review`; forged national codes committed into `users` with auto-created parents; existing students' identity fields rewritten (`sida.service.js:226–233`). Lock-in: R1 test.
3. **SEC-SOCKET-001 — Ungated media-frame relay (High-E, realtime data plane).** `socket.js:561–564,678–681`. Any participant relays arbitrary ≤5 MB frames to the whole room as "screen share"/"teacher video"; no share/teacher check; client renders them into the room UI. Live N-STREAM-06. → treat as Critical-adjacent (realtime integrity + DoS).
4. **SEC-SOCKET-002 — Blind global WebRTC-signal relay with spoofable sender (High-E).** `socket.js:662–676`. `io.to(targetSocketId)` to *any* socket across rooms/tenants with attacker-controlled `senderData`; live N-WEBRTC-08. Realtime-plane injection/spoofing.

## High

5. **SEC-AUTH-002 — Universal `123456` seeds + shipped demo buttons (≈ 8.5).** Now **dynamically** confirmed this pass: fresh disposable-seed login succeeds for seed admin, student, and parent with `123456` (harness `seeded-login-123456-2026-11-11.cjs`); seeds re-run per fresh env (`dev-server.js:10–23`). No test covers it.
6. **SEC-DATA-001 — Cross-tenant DB exfiltration via role-only backups (≈ 8.4).** `app.js:240–279`; `dbMaintenance.js:14–16,51–84`. Any school-scoped admin `school_admin`/`manager` lists, creates, and **downloads the whole multi-tenant SQLite**; only `basename` filters the path param. Live F1 again; role rejection tested status-only (R4).
7. **SEC-AUTH-001 — Unauthenticated parent-login → verified account + student identity oracle (≈ 7.7).** `auth.controller.js:107–121`; `auth.service.js:465–575`; unlisted in rate limits (`app.js:149–152`). Live A1–A3 again (cross-tenant enumeration practical via sequential `STD-40301…`).
8. **SEC-DEP-001 — Advisories on install set; un-pinned, un-audited supply (≈ 7.1).** multer 11 HIGH DoS, sharp 3 HIGH; preserved OSV snapshot; no committed npm lockfile (`backend-tests.yml:44` `--no-audit --no-fund`).
9. **SEC-SOCKET-003 — Socket handshake CORS reflects any origin with credentials.** `socket.js:91–97`; same-class as the REST CORS finding but with full read+write realtime access. Live N-CORS-15.

## Watch list (still open, Medium→Info)

SEC-AI-002 (7.4 LATENT — Gemini path verbatim, engine/kernel absent), SEC-CORS-001 (6.8, live E1),
SEC-UPLOAD-001 (6.4), SEC-DIR-001 (6.0, D1 live), SEC-CFG-001 (5.4), SEC-CFG-002 (4.7),
SEC-SOCKET-004 (Medium — revoked-session latency), plus functional FW-AUTH-001 (blocker),
FW-AI-002/003, FW-UPLOAD-002 (dead branch — half confirmed this pass), FW-API-004, FW-DB-005.

## Combined statement

**0 Critical and 0 High findings are fixed at HEAD.** Independent second pass changes *depth of
evidence* — SEC-AUTH-002 static→dynamic, FW-UPLOAD-002 partially closed, SOCKET set added — but
not a single verdict from the prior suite was overturned.
