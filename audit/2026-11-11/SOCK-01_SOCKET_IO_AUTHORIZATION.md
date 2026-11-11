# SOCK-01 — Socket.IO & real-time communication security assessment

**Scope:** `backend/src/socket.js` (entire file, 710 lines), `backend/src/middleware/auth.js`,
`backend/src/services/classroomPersistence.js`, mount point `backend/src/app.js:51,59`, and the consuming
web client `frontend/src/app/dashboard/classes/[id]/live/page.js`.
**Target:** `main`@`838b5b2`. **Method:** read-only source audit + live negative testing.

## 1. Verification performed

| # | Action | Result |
|---|---|---|
| V1 | Full line-by-line read of `socket.js`, auth middleware, persistence service, client socket handlers | completed |
| V2 | Negative-test harness `backend/.tmp/verify/socket-auth-negative-2026-11-11.cjs` (git-ignored; reuses shipped disposable-SQLite/ephemeral-port test infra) run against the real app | **14/14 checks**, 4 vulnerability reproductions, all deterministic |
| V3 | Existing shipped socket regression tests `backend/tests/security/socket.test.js` re-run (`npm test` file-scoped) | pass (they cover handshake auth only) |
| V4 | Client handlers: `screen_frame`→`<img src={remoteScreenFrame}>` (`live/page.js:3156`), `live_video_frame`→state, `audio_chunk`→WebAudio, chat rendered via JSX text interpolation (§`3792`,`3802`), `webrtc_signal` **not consumed anywhere in the frontend** (dead relay in the web client) | confirmed |

---

## 2. Handshake / connection layer

`io.use` (`socket.js:105–145`) — **sound in essentials**:

| Check | Evidence | Live verdict |
|---|---|---|
| JWT verified with server secret; `typ:'refresh'` rejected | `socket.js:112–115` | N-AUTH-02 ✅ passes |
| Token auto-accept from `auth.token`, `Authorization: Bearer`, and **`access_token` cookie** | `extractSocketToken` (`socket.js:26–43`) | works (ambiguity: cookie path is ambient) |
| User loaded fresh from DB; `is_active` enforced | `:117–124` | right |
| `token_version` (`tv`) mismatch → reject | `:126–128` | right |
| `jti` revocation checked **only at handshake** — never re-validated for the connection's lifetime | `:130–138`; event handlers never re-check | **VULN** → SEC-SOCKET-004 (N-SESSION-03) |
| CORS: `origin` callback `(origin, cb) => cb(null, true)` with `credentials: true` | `socket.js:91–97` | **VULN** → SEC-SOCKET-003 (N-CORS-15) |

**SEC-SOCKET-003 (High)** — Every origin is echoed in `Access-Control-Allow-Origin`, and
`Access-Control-Allow-Credentials: true` is on. Any web page can open
`io(origin, { withCredentials: true })` using the victim's ambient `access_token` cookie and —
because CORS is reflected — **read every socket response**. Full room takeover with the victim's own
permissions (join every class they may join, read roster/chat/frames, emit every event as them), all
from a third-party origin. This is the same defect class as reported REST CORS finding (SEC-CORS-001),
but with complete read/write access to the realtime plane and cross-origin read access to every
event payload. Live-confirmed: server answers a raw probing GET to `/socket.io/?EIO=4&transport=polling`
with `ACAO: https://evil.example.com`, `ACAC: true`.

**Socket 4.8.4** in use (`backend/package.json:32`). No *transport* restrictions beyond explicit
`['websocket','polling']`; `maxHttpBufferSize` 5 MiB bounds single packets (DoS relief, not auth).

---

## 3. Event authorization matrix (every `socket.on` handler)

Legend — **Invoker** (who passes the event's gates) | **Identity** (server-side identity actually used) |
**Ownership** (resource ownership enforced) | **Tenant** (school-level authorization) |
**Surface** (what can be disclosed/modified) | **Repetition** (repeat/parallel abuse) |
Verdict | Lines.

Global preconditions: all events except `webrtc_signal` require `classId === currentClassId`
(set only by the caller's own last successful `join_class`, `socket.js:154,175`);
membership-derived checks read `room.participants` keyed by `socket.id`.

| Event (`socket.on`) | Invoker | Identity used | Ownership | Tenant | Surface (disclose/modify) | Repetition / concurrency | Verdict | Lines |
|---|---|---|---|---|---|---|---|---|
| `join_class` | any authenticated role per `assertOwnsClass(...,{allowEnrolled:true})` | DB `display_name`, `role`, `school_id`; **no client-supplied fields are trusted** | class row `teacher_id` / `class_members` membership / `parent_student_links`; `assertSameSchool` | ✅ enforced (403-refused, `error_message`) | room join; receives `init_class_state`: last 50 persisted chat messages, full participant roster (ids, names, avatars), board state, teacher identity | re-join re-registers; no join-rate limit; **one room entry per socket, not per user** | ✅ core gates hold | 164–233; `assertOwnsClass` 74–129 |
| `start_live` | room teacher (socket-pinned `teacherSocketId`) or admin participant | `currentUser.id` server-side | `currentClassId` lock + `isRoomTeacher` | ✅ via join path | sets `isLive`, `title`, `teacherSocketId/Id/Name` (any teacher-socket can seize teaching identity); broadcasts to room; marks DB row `is_live` (debounced) | raceless enough (single-threaded Map); teacher disconnect mid-live → `isLive` stays `true`, room lingers | ⚠️ teacher-pin is by socket (reconnect window); no audit log | 243–265, 683–704 |
| `end_live` | same as above | server-side | same | ✅ | clears board (2000-stroke in-memory + persisted state wiped to `[]` via `clearSession`), ends session | n/a | ✅ but: forced-reset destroys persisted history silently | 268–286 |
| `wb_draw` | teacher or `canDraw` participant | n/a (no sender attribution in stroke) | `canUserDraw` | ✅ | pushes arbitrary JSON stroke (≤5MB msg) to room buffer (cap 2000) + persisted JSON in `live_classroom_sessions` | flood capped at 2000 in-memory (self-limiting) | ✅ server-side gate holds | 295–307 |
| `wb_clear` | same as `wb_draw` | — | `canUserDraw` | ✅ | wipes in-memory + schedule-saves `[]` | n/a | ✅ | 309–318 |
| `wb_undo` | same as `wb_draw` | — | `canUserDraw` | ✅ | pops last stroke, broadcasts full state | n/a | ✅ | 320–331 |
| `wb_change_bg` | same as `wb_draw` | — | `canUserDraw` | ✅ | sets board skin | n/a | ✅ | 333–342 |
| `wb_sync_all` | same as `wb_draw` | — | `canUserDraw` | ✅ | **replaces entire server state** (`strokes`, `docState`, `boardPages`, `currentPage`) with client arrays — no schema/size validation beyond 2000-stroke DB slice | one-shot replace; payload unbounded short of 5MB buffer | ✅ gated but unvalidated → stored-content injection point | 344–363 |
| `wb_doc_change` | same as `wb_draw` | — | `canUserDraw` | ✅ | replaces doc model (free-form JSON) persisted verbatim | same | ✅ gated, unvalidated | 365–374 |
| `wb_page_change` | same as `wb_draw` | — | `canUserDraw` | ✅ | page/pagination state | n/a | ✅ | 376–386 |
| `grant_whiteboard_access` | room teacher only | requester name from server user (not client) | target must be **an in-room participant**, resolved by `socket.id` **(unguessable, server-assigned)** or `userId` scan of the room | ✅ | flips `canDraw` on target; broadcast announcement | n/a | ✅ does NOT traverse rooms/schools | 388–416 |
| `revoke_whiteboard_access` | room teacher only | same | same | ✅ | clears `canDraw` | n/a | ✅ | 418–446 |
| `set_all_whiteboard_access` | room teacher only | same | loops room participants only | ✅ | bulk `canDraw` for students | n/a | ✅ | 448–464 |
| `request_whiteboard_access` | **any participant** (unauthenticated to rights) | server-side participant record | participant record must exist | ✅ | broadcast "X requests whiteboard" (attendance/info event, harmless) | spammable but rate-unlimited | ✅ | 466–478 |
| `set_student_permission` | room teacher only | same | in-room target only | ✅ | sets `canDraw`/`canMic`/`canScreenShare` on target | n/a | ✅ | 480–512 |
| `toggle_mic` | self; teacher without grant or `canMic` participant | self `socket.id` | self only | ✅ | toggles own `micOn`; broadcasts identity (server-side name) | n/a | ✅ | 514–529 |
| `start_screen_share` | teacher or `canScreenShare` participant | self | self only | ✅ | sets `room.screenSharingUser` (last-writer-wins; no single-sharer enforcement) | two sharers alternate silently | ⚠️ minor | 531–548 |
| `stop_screen_share` | **only the sharer's socket** | self | self | ✅ | clears `screenSharingUser`; teacher cannot end another's share | n/a | ⚠️ asymm. feature gap, low | 550–559 |
| **`screen_frame`** | **any connected participant of the room — NO share/teacher right checked** | none | none (not even `canUserDraw`) | ✅ (join) | **arbitrary payload relayed verbatim to every room member** | unlimited rate, 5MB/packet → room-wide DoS, forged media | 🔴 **VULN** → SEC-SOCKET-001 (N-STREAM-06) | 561–564 |
| **`live_video_frame`** | **any participant — no teacher check** | none | none | ✅ (join) | arbitrary payload to whole room as "teacher video" | same | 🔴 **VULN** → SEC-SOCKET-001 (N-STREAM-06) | 678–681 |
| `audio_chunk` | teacher or `canMic` participant | sender attributed (`senderSocketId`+name by server) | same | ✅ | relays opaque chunk room-wide | bounded by 5MB | ✅ gate holds | 566–577 |
| `send_chat_message` | any participant | server `display_name`; client text stored verbatim | none needed (members) | ✅ | shops message in room buffer (cap 100) **and persists** last 200 to SQLite, replayed to future joiners; teacher has no delete/mod tools; 100-cap evicts history | 150 msgs/2.5s observed — **no per-user rate limit**; history poisoning | ⚠️ abuse + persistence caveats → SEC-SOCKET-005, -006 | 579–599 |
| `toggle_hand_raise` | self | self | self | ✅ | presence flip broadcast | n/a | ✅ | 601–614 |
| `lower_student_hand` | room teacher only | n/a | in-room target | ✅ | force-clear any hand | n/a | ✅ | 616–639 |
| `set_all_student_permission` | room teacher only | same | bulk over participant objects | ✅ | bulk mic/screen/draw | n/a | ✅ | 641–660 |
| **`webrtc_signal`** | **any connected user — no join/membership check when `targetSocketId` given** | caller; **`senderData` forwarded verbatim and spoofable** (`user:'teacher'` etc.) | none beyond socket id existence | ❌ none needed — crossed rooms live | **blind global relay: emit `webrtc_signal` to ANY socket id in the process, cross-room, cross-tenant**; receiver cannot validate the signal belongs to any expected conversation | unbounded spray; 5MB payloads to arbitrary sockets | 🔴 **VULN** → SEC-SOCKET-002 (N-WEBRTC-08) | 662–676 |
| `disconnect` | n/a | n/a | removes own participant row; clears teacher pin; room GC only when empty **and** `!isLive` | ✅ | emits `participant_left` w/ identity | note: teacher disconnect while live strands `isLive=true` room (never GC'd, recoverable by any later teacher) | ⚠️ lifetime bug | 683–704 |

### Permissions actually enforced server-side (synthesis)

- Draw/mic/screen **granting** does not exist for students; every effective *state-changing* control
  (start/end live, whiteboard, bulk permissions, hand lowering) correctly re-checks the
  server-side teacher identity (`isRoomTeacher`) anchored at join time.
- Cross-tenant enforcement rides on `join_class` → `assertOwnsClass` and never degrades afterwards
  (room emissions are all `socket.to(class:${classId}) `-scoped or socket-id-scoped).
- Identity attribution (chat sender, participant names, hand events) is uniformly server-side;
  **spoofable identity exists only inside `webrtc_signal.senderData`**.

---

## 4. Findings

| ID | Severity | Finding | Evidence | Live repro |
|---|---|---|---|---|
| **SEC-SOCKET-001** | 🔴 High | **Ungated media frame relay.** `screen_frame` (`:561`) and `live_video_frame` (`:678`) have no participation or screen-share right check at all; any enrolled member (even muted/non-sharer) injects arbitrary 5MB payloads into every room member's viewer. Combines with `<img src={remoteScreenFrame}>` (`live/page.js:3156`) and teacher-video UI (`:1360`) to force **forged "screen share"/"teacher video" content** to the whole class, and room-wide bandwidth/CPU DoS. | matrix rows `screen_frame`/`live_video_frame` | N-STREAM-06 ✅ student→student & student→teacher received `DATA-FORGE-RESOLUTION`/`VIDEO-FORGE-FRAME` |
| **SEC-SOCKET-002** | 🔴 High | **Blind global WebRTC signalling relay.** `webrtc_signal` (`:662`) forwards `signal` + attacker-controlled `senderData` to an arbitrary `targetSocketId` with **no room-membership, tenancy, or conversation affinity check**; a socket in class A of school A signals a socket in class B of school B. `senderData.name/user` relay **spoofed teacher identity**. Web client doesn't consume the event today, but the protocol endpoint is live for every connected client. | matrix row `webrtc_signal` | N-WEBRTC-08 ✅ cross-room forged signal received with `senderData={"user":"teacher","name":"Mimicked-Teacher-Alice"}` |
| **SEC-SOCKET-003** | 🟠 High | **Handshake CORS reflects every Origin with credentials.** Any origin may open an ambient-cookie-authenticated socket against the backend and — because `Access-Control-Allow-Origin` mirrors the origin — **read all responses** and drive the victim's realtime session (join their classes, read room state/chat, inject messages/frames). Same root cause family as SEC-CORS-001 but with full read/write socket-plane access. | `socket.js:91–97`; probe | N-CORS-15 ✅ `ACAO=https://evil.example.com`, `ACAC=true` |
| **SEC-SOCKET-004** | 🟠 Medium | **No per-event revocation re-validation.** `jti`/`token_version` are checked only in `io.use` at handshake. A socket whose token is revoked (logout-elsewhere, force-logout, password reset) keeps **full room rights until the TCP connection drops**; no idle-timeout or re-auth hook exists. | `:105–145` vs handlers | N-SESSION-03 ✅ post-revocation `send_chat_message` delivered to observers with revoked jti |
| **SEC-SOCKET-005** | 🟡 Medium | **Parent-level information revelation & cross-session chat replay.** `join_class` (`assertOwnsClass` `:111–125`) lets a parent join their child's class, receiving `init_class_state` with the **full class roster** (every student's id/name/role/avatar) and the **last 50 persisted chat messages** spanning prior sessions; parents of one child see siblings' peer data. Design question rather than a clean bug — no per-join scoping of what a parent may view. | `:208–227`, persistence 1.5s debounce | N-DISCLOSURE-11 ✅ roster + persisted 2-message chat replayed to a fresh parent join |
| **SEC-SOCKET-006** | 🟡 Medium | **Availability / hygiene gaps (bundle).** (a) no per-user connection cap — same identity duplicates participants per socket; (b) no event-level rate limiting — chat flood verified (150 msgs in 2.5s; buffered at 100 in-memory/200 persisted), frames/signals unlimited; (c) all denials fail **silently** (`return` w/o ack) — no audit trail of denied privileged attempts; (d) teacher disconnect while live leaves `isLive=true` room forever (GC requires `!isLive`); (e) `end_live` silently erases all persisted board/chat state. | observations | N-LIMITS-13, N-DUP-14 ✅ |

**Positive controls confirmed live:** unauthenticated/refresh handshakes rejected (N-AUTH-01/02);
cross-school join blocked (N-SCOPE-04); non-teacher student **cannot** start live/draw/change board/
grant/revoke access/alter others' mic or hands — room state bit-identical (N-PERM-05);
audio frame gate holds (N-STREAM-07); teacher grant path works and broadcasts correctly to the
target only (N-PERM-09); student-supplied identity/role payloads are ignored (shipped
`socket.test.js`, re-run green).

---

## 5. Reproducible negative tests

Harness (git-ignored, read-only vs. tracked tree, disposable per-PID SQLite):
`backend/.tmp/verify/socket-auth-negative-2026-11-11.cjs`

```bash
cd backend && node .tmp/verify/socket-auth-negative-2026-11-11.cjs
# Expected: 4× VULN-REPRODUCED (N-SESSION-03, N-STREAM-06, N-WEBRTC-08, N-CORS-15),
# 7× V-SAFE confirmations, 3 behaviour NOTES; exits cleanly, disposable DB removed.
```

Each check label is a self-contained negative expectation; flips to `V-SAFE` indicate a fix.

| Check | Negative expectation | Verifies |
|---|---|---|
| N-AUTH-01/02 | no token / refresh token → handshake rejected | baseline auth |
| N-SESSION-03 | post-revoke jti ⇒ established socket silenced | SEC-SOCKET-004 |
| N-SCOPE-04 | school-A teacher joins school-B → refused | tenant gate |
| N-PERM-05 | student privilege classes inert | RBAC enforcement |
| N-STREAM-06 | non-sharer frames must not relay · fails → reproduced | SEC-SOCKET-001 |
| N-STREAM-07 | non-granted audio must not relay | gate contrast |
| N-WEBRTC-08 | signals must not leave the room / must not fabricate sender · fails → reproduced | SEC-SOCKET-002 |
| N-PERM-09 | teacher grant reaches exactly the target | positive control |
| N-DISCLOSURE-11 | parent join yields no peer data/chat · fails → caveat | SEC-SOCKET-005 |
| N-PERSIST-12 | nothing persisted · fails → persistence documented | persistence map |
| N-LIMITS-13 | flood bounds/logging · observed | SEC-SOCKET-006 |
| N-DUP-14 | one identity, one participant record · fails → documented | SEC-SOCKET-006 |
| N-CORS-15 | CORS must not reflect with credentials · fails → reproduced | SEC-SOCKET-003 |

---

## 6. Verified / not verified

**Verified (live, this session, disposable env):** all matrix verdicts marked ✅/⚠️/🔴; every finding's
repro; client trust points (§1 V4); shipped socket tests pass; the 4 live reproductions are
deterministic across runs.

**Not verified (read-only boundary):** production gateway/WebRTC media plane (backend relays, it does
not terminate media — the true `getDisplayMedia`/`getUserMedia` consent and DTLS transport live in
the browser, out of server scope); browser XSS execution of forged frames (`<img>` context neuters
script, phishing-quality forgery demonstrated instead); the (currently unused-in-web) `webrtc_signal`
endpoint exploited against an actual RTCPeerConnection (injection into a real call not executed);
mobile clients (if any consume this endpoint); OSV advisories for `socket.io@4.8.4` (none known at
knowledge cutoff; transitive tree uses engine.io 6.x).

---

## 7. Remediation sketch (server-side, minimal)

1. **`screen_frame`/`live_video_frame`**: require `isRoomTeacher(room) || participant.canScreenShare`
   (screen) / teacher (video); strip to blob length caps; optionally bound frame rate per socket.
2. **`webrtc_signal`**: require `targetSocketId`'s socket to share `currentClassId` room with the
   sender; accept **only `signal`** (no free-form `senderData`); synthesize `senderData` server-side
   from the verified user; add per-socket signalling rate budget.
3. **CORS**: replace `cb(null,true)` with an explicit origin allow-list (or same-origin default),
   keep `credentials` only for listed origins — identical fix to SEC-CORS-001.
4. **Revocation**: on `revoked_tokens`/`token_version` change, `activeClassrooms` consumers should
   disconnect matching sockets (event hook on the auth module or short `auth-token-refresh` ping);
   at minimum enforce a max connection lifetime (`setInterval`-based re-`jwt.verify` of `jti`).
5. **Hardening bundle**: per-user connection cap (≤3), token-bucket rate limits per socket per event,
   replace silent denies with `error_message` audits, GC rule `isLive || participants.size` → idle-kill
   teacherless live rooms, scope `init_class_state` payloads by role (parents: child-only roster),
   lock `end_live` clear to fire only post-session, and log privileged events server-side.
