/**
 * Socket.IO regression tests (Phase 0 safety net).
 *
 *   F8 — Socket.IO connections trust client-supplied identity
 *
 * The backend performs no handshake authentication: `socket.js` has no
 * `io.use()` middleware, the Socket.IO CORS handler accepts every origin and
 * `join_class` takes the caller's identity and role verbatim from the payload
 * (`currentUser = user`).
 */
const { test, expectFailure, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { io } = require('socket.io-client');
const { setupHarness, teardownHarness, resetDatabase } = require('../support/harness');
const { loginAs } = require('../support/auth');
const { CLASSES } = require('../fixtures/twoSchools');

const CONNECT_TIMEOUT = 5000;
const EVENT_TIMEOUT = 1500;

let baseUrl;

/**
 * Open a socket and wait for the handshake to settle.
 *
 * @param {object} [options] - socket.io-client options (`auth` for the handshake)
 * @returns {Promise<{socket: object, connected: boolean, error: Error|null}>}
 */
function openSocket(options = {}) {
  return new Promise((resolve) => {
    const socket = io(baseUrl, {
      transports: ['websocket'],
      reconnection: false,
      timeout: CONNECT_TIMEOUT,
      ...options,
    });

    let settled = false;
    const settle = (connected, error) => {
      if (settled) return;
      settled = true;
      resolve({ socket, connected, error });
    };

    socket.on('connect', () => settle(true, null));
    socket.on('connect_error', (err) => settle(false, err));
  });
}

/**
 * Wait for a socket event, or resolve with `null` when it does not arrive.
 *
 * @param {object} socket
 * @param {string} event
 * @param {number} [timeout]
 * @returns {Promise<any|null>}
 */
function waitForEvent(socket, event, timeout = EVENT_TIMEOUT) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      socket.off(event, onEvent);
      resolve(value);
    };
    const onEvent = (payload) => finish(payload);
    socket.on(event, onEvent);
    setTimeout(() => finish(null), timeout).unref?.();
  });
}

/** Close a socket and wait for the disconnect to settle. */
function closeSocket(socket) {
  return new Promise((resolve) => {
    if (!socket || !socket.connected) {
      try {
        socket?.close();
      } catch {
        /* ignore */
      }
      resolve();
      return;
    }
    socket.once('disconnect', () => resolve());
    socket.close();
  });
}

before(async () => {
  ({ baseUrl } = await setupHarness());
});

after(async () => {
  await teardownHarness();
});

beforeEach(async () => {
  await resetDatabase();
});

test('[F8] a socket connection without a token must be rejected', async () => {
  const { socket, connected, error } = await openSocket();

  try {
    assert.equal(
      connected,
      false,
      'an unauthenticated socket handshake must be rejected'
        + (error ? ` (error: ${error.message})` : ' (the connection was accepted)'),
    );
  } finally {
    await closeSocket(socket);
  }
});

test('[F8] an unauthenticated socket must not join a class room', async () => {
  const { socket } = await openSocket();

  try {
    if (socket.connected) {
      socket.emit('join_class', {
        classId: CLASSES.b,
        user: { id: 'anonymous', name: 'Anonymous', role: 'teacher' },
      });
    }

    const state = await waitForEvent(socket, 'init_class_state');

    assert.equal(
      state,
      null,
      'an unauthenticated socket must not receive the state of a class room',
    );
  } finally {
    await closeSocket(socket);
  }
});

test('[F8] a school-A teacher socket must not join a school-B class room', async () => {
  const teacher = await loginAs(baseUrl, 'a', 'teacher');
  const { socket, connected } = await openSocket({ auth: { token: teacher.accessToken } });

  try {
    assert.ok(connected, 'the authenticated socket must connect');

    socket.emit('join_class', {
      classId: CLASSES.b,
      user: { id: teacher.user.id, name: teacher.user.display_name, role: 'teacher' },
    });

    const state = await waitForEvent(socket, 'init_class_state');

    assert.equal(
      state,
      null,
      'a school-A teacher must not receive the state of a school-B class room',
    );
  } finally {
    await closeSocket(socket);
  }
});

test('[F8] a client-supplied role must not grant teacher privileges', async () => {
  const student = await loginAs(baseUrl, 'a', 'student');
  const { socket, connected } = await openSocket({ auth: { token: student.accessToken } });

  try {
    assert.ok(connected, 'the authenticated socket must connect');

    socket.emit('join_class', {
      classId: CLASSES.a,
      // The client claims a teacher role the server-side account does not have.
      user: { id: student.user.id, name: student.user.display_name, role: 'teacher' },
    });

    const state = await waitForEvent(socket, 'init_class_state');
    assert.ok(state, 'the socket must still be able to join its own class');

    assert.equal(state.canDraw, false, 'a student must not receive drawing rights');
    assert.equal(state.canMic, false, 'a student must not receive microphone rights');
    assert.equal(state.canScreenShare, false, 'a student must not receive screen-sharing rights');
    assert.notEqual(
      state.teacherSocketId,
      socket.id,
      'a client-supplied teacher role must not become the room teacher',
    );
  } finally {
    await closeSocket(socket);
  }
});

test('[SEC-SOCKET-001 & SEC-SOCKET-002] unpermitted student cannot broadcast screen_frame or live_video_frame, and webrtc_signal blocks cross-room relay and sanitizes senderData', async () => {
  const teacherA = await loginAs(baseUrl, 'a', 'teacher');
  const studentA = await loginAs(baseUrl, 'a', 'student');
  const teacherB = await loginAs(baseUrl, 'b', 'teacher');

  const { socket: tASocket } = await openSocket({ auth: { token: teacherA.accessToken } });
  const { socket: sASocket } = await openSocket({ auth: { token: studentA.accessToken } });
  const { socket: tBSocket } = await openSocket({ auth: { token: teacherB.accessToken } });

  try {
    tASocket.emit('join_class', { classId: CLASSES.a });
    await waitForEvent(tASocket, 'init_class_state');

    sASocket.emit('join_class', { classId: CLASSES.a });
    await waitForEvent(sASocket, 'init_class_state');

    tBSocket.emit('join_class', { classId: CLASSES.b });
    await waitForEvent(tBSocket, 'init_class_state');

    // 1. SEC-SOCKET-001: Student without canScreenShare emitting screen_frame or live_video_frame must be rejected
    const screenFrameOnTeacher = waitForEvent(tASocket, 'screen_frame', 400);
    const liveVideoOnTeacher = waitForEvent(tASocket, 'live_video_frame', 400);
    sASocket.emit('screen_frame', { classId: CLASSES.a, frame: 'data:image/jpeg;base64,spoofed' });
    sASocket.emit('live_video_frame', { classId: CLASSES.a, frame: 'data:image/jpeg;base64,spoofed' });

    assert.equal(await screenFrameOnTeacher, null, 'Unpermitted student must not broadcast screen_frame');
    assert.equal(await liveVideoOnTeacher, null, 'Student must not broadcast live_video_frame');

    // 2. SEC-SOCKET-002: Student in Class A cannot send webrtc_signal to teacher in Class B
    const crossRoomSignal = waitForEvent(tBSocket, 'webrtc_signal', 400);
    sASocket.emit('webrtc_signal', {
      targetSocketId: tBSocket.id,
      signal: { type: 'offer' },
      senderData: { name: 'Spoofed Principal', role: 'admin' },
    });
    assert.equal(await crossRoomSignal, null, 'webrtc_signal must not cross classroom/tenant boundaries');

    // 3. SEC-SOCKET-002: Intra-room webrtc_signal overwrites spoofed senderData with verified server identity
    const validRoomSignalPromise = waitForEvent(tASocket, 'webrtc_signal', 1000);
    sASocket.emit('webrtc_signal', {
      targetSocketId: tASocket.id,
      signal: { type: 'offer' },
      senderData: { name: 'Spoofed Principal', role: 'admin' },
    });
    const receivedSignal = await validRoomSignalPromise;
    assert.ok(receivedSignal, 'Intra-room webrtc_signal must be delivered');
    assert.equal(receivedSignal.senderData.role, 'student', 'Spoofed senderData role must be overwritten by server');
    assert.equal(receivedSignal.senderData.userId, studentA.user.id);
  } finally {
    await closeSocket(tASocket);
    await closeSocket(sASocket);
    await closeSocket(tBSocket);
  }
});

