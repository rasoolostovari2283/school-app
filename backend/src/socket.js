const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const db = require('./config/database');
const { isSchoolAdmin, assertOwnsClass } = require('./middleware/auth');
const { loadClassroomSnapshot, scheduleSave, clearSession } = require('./services/classroomPersistence');

// In-memory active live classrooms manager
const activeClassrooms = new Map();

function parseCookieHeader(cookieHeader, name) {
  if (!cookieHeader || typeof cookieHeader !== 'string') return null;
  const parts = cookieHeader.split(';');
  for (const part of parts) {
    const [k, ...v] = part.trim().split('=');
    if (k === name && v.length > 0) {
      try {
        return decodeURIComponent(v.join('='));
      } catch {
        return v.join('=');
      }
    }
  }
  return null;
}

function extractSocketToken(socket) {
  const authToken = socket.handshake?.auth?.token;
  if (typeof authToken === 'string' && authToken.trim()) {
    return authToken.trim().replace(/^Bearer\s+/i, '');
  }

  const header = socket.handshake?.headers?.authorization;
  if (typeof header === 'string' && header.startsWith('Bearer ')) {
    return header.slice(7).trim();
  }

  const cookieToken =
    parseCookieHeader(socket.handshake?.headers?.cookie, 'accessToken') ||
    parseCookieHeader(socket.handshake?.headers?.cookie, 'access_token');
  if (cookieToken) {
    return cookieToken;
  }

  return null;
}

function getOrCreateClassroom(classId) {
  if (!activeClassrooms.has(classId)) {
    const room = {
      classId,
      isLive: false,
      startedAt: null,
      teacherSocketId: null,
      teacherId: null,
      teacherName: null,
      title: '',
      participants: new Map(),
      whiteboardStrokes: [],
      boardType: 'white',
      docState: null,
      boardPages: null,
      currentPage: 1,
      chatMessages: [],
    };
    activeClassrooms.set(classId, room);

    loadClassroomSnapshot(classId).then((snapshot) => {
      if (snapshot && activeClassrooms.has(classId)) {
        const currentRoom = activeClassrooms.get(classId);
        if (currentRoom.whiteboardStrokes.length === 0 && snapshot.strokes?.length > 0) {
          currentRoom.whiteboardStrokes = snapshot.strokes;
        }
        if (currentRoom.chatMessages.length === 0 && snapshot.chatMessages?.length > 0) {
          currentRoom.whiteboardStrokes = currentRoom.whiteboardStrokes || [];
          currentRoom.chatMessages = snapshot.chatMessages;
        }
        if (!currentRoom.docState && snapshot.docState) {
          currentRoom.docState = snapshot.docState;
        }
        if (!currentRoom.boardPages && snapshot.boardPages) {
          currentRoom.boardPages = snapshot.boardPages;
        }
        if (snapshot.boardType) currentRoom.boardType = snapshot.boardType;
        if (snapshot.currentPage) currentRoom.currentPage = snapshot.currentPage;
      }
    }).catch(() => {});
  }
  return activeClassrooms.get(classId);
}

function initSocket(server, config) {
  const isAllowedSocketOrigin = (origin) => {
    if (!origin) return true;
    const allowedList = [
      config?.frontendUrl,
      process.env.FRONTEND_URL,
      process.env.TUNNEL_URL,
      ...(process.env.CORS_ALLOWED_ORIGINS ? process.env.CORS_ALLOWED_ORIGINS.split(',') : []),
    ]
      .filter(Boolean)
      .map((u) => u.trim().replace(/\/+$/, ''));
    const normalized = String(origin).trim().replace(/\/+$/, '');
    if (allowedList.includes(normalized)) return true;
    if (config?.nodeEnv !== 'production' && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(normalized)) {
      return true;
    }
    return false;
  };

  const io = new Server(server, {
    cors: {
      origin: (origin, callback) => {
        if (isAllowedSocketOrigin(origin)) {
          return callback(null, true);
        }
        return callback(new Error('CORS origin not allowed'), false);
      },
      methods: ['GET', 'POST'],
      credentials: true,
    },
    transports: ['websocket', 'polling'],
    maxHttpBufferSize: 2 * 1024 * 1024,
    pingTimeout: 35000,
    pingInterval: 15000,
  });

  // Authenticate every Socket.IO handshake using JWT (#3/F8)
  io.use(async (socket, next) => {
    try {
      const token = extractSocketToken(socket);
      if (!token) {
        return next(new Error('احراز هویت برای اتصال وب‌سوکت الزامی است'));
      }

      const decoded = jwt.verify(token, config.jwt.secret);
      if (decoded.typ === 'refresh') {
        return next(new Error('توکن نامعتبر است'));
      }

      const user = await db('users')
        .where({ id: decoded.userId })
        .select('id', 'email', 'display_name', 'role', 'school_id', 'avatar_url', 'student_code', 'is_active', 'token_version')
        .first();

      if (!user || user.is_active === false || user.is_active === 0) {
        return next(new Error('کاربر یافت نشد یا غیرفعال است'));
      }

      if (decoded.tv !== undefined && Number(decoded.tv) !== Number(user.token_version || 0)) {
        return next(new Error('نشست کاربری ابطال شده است'));
      }

      if (decoded.jti) {
        const revoked = await db('revoked_tokens')
          .where({ jti: decoded.jti })
          .first()
          .catch(() => null);
        if (revoked) {
          return next(new Error('توکن احراز هویت ابطال شده است'));
        }
      }

      socket.data.user = user;
      socket.data.tokenJti = decoded.jti || null;
      socket.data.tokenVersion = decoded.tv !== undefined ? Number(decoded.tv) : Number(user.token_version || 0);
      socket.data.tokenExp = decoded.exp ? decoded.exp * 1000 : null;
      socket.data.lastSessionCheck = Date.now();
      return next();
    } catch (_err) {
      return next(new Error('توکن احراز هویت نامعتبر یا منقضی شده است'));
    }
  });

  const isSessionStillValid = async (socket) => {
    try {
      if (socket.data.tokenExp && Date.now() > socket.data.tokenExp) {
        socket.emit('error_message', { message: 'نشست کاربری منقضی شده است' });
        socket.disconnect(true);
        return false;
      }
      if (Date.now() - (socket.data.lastSessionCheck || 0) < 2000) {
        return true;
      }
      const freshUser = await db('users')
        .where({ id: socket.data.user.id })
        .select('id', 'is_active', 'token_version', 'role', 'school_id')
        .first();
      if (!freshUser || freshUser.is_active === false || freshUser.is_active === 0) {
        socket.disconnect(true);
        return false;
      }
      if (Number(freshUser.token_version || 0) !== Number(socket.data.tokenVersion || 0)) {
        socket.disconnect(true);
        return false;
      }
      if (socket.data.tokenJti) {
        const revoked = await db('revoked_tokens')
          .where({ jti: socket.data.tokenJti })
          .first()
          .catch(() => null);
        if (revoked) {
          socket.disconnect(true);
          return false;
        }
      }
      socket.data.lastSessionCheck = Date.now();
      return true;
    } catch (_e) {
      return true;
    }
  };

  io.on('connection', (socket) => {
    const authUser = socket.data.user;
    if (!authUser) {
      socket.disconnect(true);
      return;
    }

    let currentClassId = null;
    let eventWindowStart = Date.now();
    let eventCount = 0;
    const allowSocketEvent = (limitPerSecond = 60) => {
      const now = Date.now();
      if (now - eventWindowStart > 1000) {
        eventWindowStart = now;
        eventCount = 0;
      }
      eventCount += 1;
      return eventCount <= limitPerSecond;
    };

    const currentUser = {
      id: authUser.id,
      name: authUser.display_name || 'کاربر',
      role: authUser.role || 'student',
      school_id: authUser.school_id,
      avatar: authUser.avatar_url || null,
    };

    // ── Join a Class Room ──
    socket.on('join_class', async ({ classId } = {}) => {
      if (!classId) return;
      if (!(await isSessionStillValid(socket))) return;

      let cls = null;
      try {
        cls = await assertOwnsClass(authUser, classId, { allowEnrolled: true });
      } catch (_err) {
        socket.emit('error_message', { message: 'شما مجاز به ورود به این کلاس نیستید' });
        return;
      }

      // Clean up previous room membership if switching rooms (SEC-SOCKET-012)
      if (currentClassId && currentClassId !== classId) {
        socket.leave(`class:${currentClassId}`);
        if (activeClassrooms.has(currentClassId)) {
          const prevRoom = activeClassrooms.get(currentClassId);
          const prevParticipant = prevRoom.participants.get(socket.id);
          prevRoom.participants.delete(socket.id);
          if (prevRoom.teacherSocketId === socket.id) {
            prevRoom.teacherSocketId = null;
          }
          io.to(`class:${currentClassId}`).emit('participant_left', {
            socketId: socket.id,
            userId: prevParticipant?.userId,
            name: prevParticipant?.name,
            participantsCount: prevRoom.participants.size,
          });
        }
      }

      currentClassId = classId;
      socket.join(`class:${classId}`);

      const room = getOrCreateClassroom(classId);

      // Derive teacher privileges strictly from verified server-side user + class ownership (#3/F8)
      const isTeacher = (authUser.role === 'teacher' && cls.teacher_id === authUser.id)
        || isSchoolAdmin(authUser);
      const canDraw = isTeacher;
      const canMic = isTeacher;
      const canScreenShare = isTeacher;

      room.participants.set(socket.id, {
        socketId: socket.id,
        userId: currentUser.id,
        name: currentUser.name,
        role: isTeacher ? authUser.role : 'student',
        avatar: currentUser.avatar,
        handRaised: false,
        micOn: false,
        cameraOn: false,
        canDraw,
        canMic,
        canScreenShare,
        joinedAt: new Date().toISOString(),
      });

      if (isTeacher) {
        room.teacherSocketId = socket.id;
        room.teacherId = currentUser.id;
        room.teacherName = currentUser.name;
      }

      const participantsList = Array.from(room.participants.values());

      socket.emit('init_class_state', {
        isLive: room.isLive,
        startedAt: room.startedAt,
        teacherId: room.teacherId,
        teacherName: room.teacherName,
        teacherSocketId: room.teacherSocketId,
        boardType: room.boardType,
        strokes: room.whiteboardStrokes,
        docState: room.docState || null,
        boardPages: room.boardPages || null,
        currentPage: room.currentPage || 1,
        chatMessages: room.chatMessages.slice(-50),
        participants: participantsList,
        canDraw,
        canMic,
        canScreenShare,
        screenSharingUser: room.screenSharingUser || null,
      });

      socket.to(`class:${classId}`).emit('participant_joined', {
        participant: room.participants.get(socket.id),
        participantsCount: room.participants.size,
      });
    });

    const isRoomTeacher = (room) => {
      if (!room) return false;
      if (room.teacherSocketId === socket.id) return true;
      const participant = room.participants.get(socket.id);
      return Boolean(participant && (participant.role === 'teacher' || participant.role === 'admin' || participant.role === 'manager'));
    };

    // ── Teacher Starts Live Class ──
    socket.on('start_live', ({ classId, title, boardType } = {}) => {
      if (!classId || classId !== currentClassId) return;
      const room = getOrCreateClassroom(classId);
      if (!isRoomTeacher(room)) return;

      room.isLive = true;
      room.startedAt = new Date().toISOString();
      room.title = title || 'کلاس آنلاین زنده';
      room.boardType = boardType || room.boardType || 'white';
      room.teacherSocketId = socket.id;
      room.teacherId = currentUser.id;
      room.teacherName = currentUser.name;

      io.to(`class:${classId}`).emit('class_live_started', {
        classId,
        title: room.title,
        startedAt: room.startedAt,
        teacherId: room.teacherId,
        teacherName: room.teacherName,
        teacherSocketId: socket.id,
      });
      scheduleSave(classId, room);
    });

    // ── Teacher Ends Live Class ──
    socket.on('end_live', ({ classId } = {}) => {
      if (!classId || classId !== currentClassId) return;
      const room = getOrCreateClassroom(classId);
      if (!isRoomTeacher(room)) return;

      room.isLive = false;
      const durationSeconds = room.startedAt
        ? Math.round((Date.now() - new Date(room.startedAt).getTime()) / 1000)
        : 0;

      io.to(`class:${classId}`).emit('class_live_ended', {
        classId,
        durationSeconds,
      });

      room.startedAt = null;
      clearSession(classId);
      room.whiteboardStrokes = [];
    });

    const canUserDraw = (room) => {
      if (!room) return false;
      if (isRoomTeacher(room)) return true;
      const participant = room.participants.get(socket.id);
      return Boolean(participant && participant.canDraw);
    };

    socket.on('wb_draw', ({ classId, stroke } = {}) => {
      if (!classId || classId !== currentClassId) return;
      const room = getOrCreateClassroom(classId);
      if (!canUserDraw(room)) return;
      if (room) {
        room.whiteboardStrokes.push(stroke);
        if (room.whiteboardStrokes.length > 2000) {
          room.whiteboardStrokes.shift();
        }
        scheduleSave(classId, room);
      }
      socket.to(`class:${classId}`).emit('wb_draw', stroke);
    });

    socket.on('wb_clear', ({ classId } = {}) => {
      if (!classId || classId !== currentClassId) return;
      const room = getOrCreateClassroom(classId);
      if (!canUserDraw(room)) return;
      if (room) {
        room.whiteboardStrokes = [];
        scheduleSave(classId, room);
      }
      socket.to(`class:${classId}`).emit('wb_clear');
    });

    socket.on('wb_undo', ({ classId } = {}) => {
      if (!classId || classId !== currentClassId) return;
      const room = getOrCreateClassroom(classId);
      if (!canUserDraw(room)) return;
      if (room && room.whiteboardStrokes.length > 0) {
        room.whiteboardStrokes.pop();
        scheduleSave(classId, room);
        io.to(`class:${classId}`).emit('wb_sync_all', {
          strokes: room.whiteboardStrokes,
        });
      }
    });

    socket.on('wb_change_bg', ({ classId, boardType } = {}) => {
      if (!classId || classId !== currentClassId) return;
      const room = getOrCreateClassroom(classId);
      if (!canUserDraw(room)) return;
      if (room) {
        room.boardType = boardType;
        scheduleSave(classId, room);
      }
      socket.to(`class:${classId}`).emit('wb_change_bg', { boardType });
    });

    socket.on('wb_sync_all', ({ classId, strokes, boardType, docState, boardPages, currentPage } = {}) => {
      if (!classId || classId !== currentClassId) return;
      const room = getOrCreateClassroom(classId);
      if (!canUserDraw(room)) return;
      if (room) {
        if (strokes !== undefined) room.whiteboardStrokes = strokes;
        if (boardType) room.boardType = boardType;
        if (docState !== undefined) room.docState = docState;
        if (boardPages !== undefined) room.boardPages = boardPages;
        if (currentPage !== undefined) room.currentPage = currentPage;
        scheduleSave(classId, room);
      }
      socket.to(`class:${classId}`).emit('wb_sync_all', {
        strokes: room?.whiteboardStrokes,
        boardType: room?.boardType,
        docState: room?.docState,
        boardPages: room?.boardPages,
        currentPage: room?.currentPage,
      });
    });

    socket.on('wb_doc_change', ({ classId, docState } = {}) => {
      if (!classId || classId !== currentClassId) return;
      const room = getOrCreateClassroom(classId);
      if (!canUserDraw(room)) return;
      if (room) {
        room.docState = docState;
        scheduleSave(classId, room);
      }
      socket.to(`class:${classId}`).emit('wb_doc_change', docState);
    });

    socket.on('wb_page_change', ({ classId, pageNum, boardPages } = {}) => {
      if (!classId || classId !== currentClassId) return;
      const room = getOrCreateClassroom(classId);
      if (!canUserDraw(room)) return;
      if (room) {
        room.currentPage = pageNum;
        if (boardPages) room.boardPages = boardPages;
        scheduleSave(classId, room);
      }
      socket.to(`class:${classId}`).emit('wb_page_change', { pageNum, boardPages });
    });

    socket.on('grant_whiteboard_access', ({ classId, targetSocketId, targetUserId } = {}) => {
      if (!classId || classId !== currentClassId) return;
      const room = getOrCreateClassroom(classId);
      if (!isRoomTeacher(room)) return;
      const requester = room.participants.get(socket.id);

      let target = null;
      if (targetSocketId && room.participants.has(targetSocketId)) {
        target = room.participants.get(targetSocketId);
      } else if (targetUserId) {
        for (const p of room.participants.values()) {
          if (p.userId === targetUserId) {
            target = p;
            break;
          }
        }
      }

      if (target) {
        target.canDraw = true;
        io.to(`class:${classId}`).emit('whiteboard_access_changed', {
          socketId: target.socketId,
          userId: target.userId,
          name: target.name,
          canDraw: true,
          grantedBy: requester?.name || 'دبیر',
        });
      }
    });

    socket.on('revoke_whiteboard_access', ({ classId, targetSocketId, targetUserId } = {}) => {
      if (!classId || classId !== currentClassId) return;
      const room = getOrCreateClassroom(classId);
      if (!isRoomTeacher(room)) return;
      const requester = room.participants.get(socket.id);

      let target = null;
      if (targetSocketId && room.participants.has(targetSocketId)) {
        target = room.participants.get(targetSocketId);
      } else if (targetUserId) {
        for (const p of room.participants.values()) {
          if (p.userId === targetUserId) {
            target = p;
            break;
          }
        }
      }

      if (target) {
        target.canDraw = false;
        io.to(`class:${classId}`).emit('whiteboard_access_changed', {
          socketId: target.socketId,
          userId: target.userId,
          name: target.name,
          canDraw: false,
          revokedBy: requester?.name || 'دبیر',
        });
      }
    });

    socket.on('set_all_whiteboard_access', ({ classId, canDraw } = {}) => {
      if (!classId || classId !== currentClassId) return;
      const room = getOrCreateClassroom(classId);
      if (!isRoomTeacher(room)) return;
      const requester = room.participants.get(socket.id);

      for (const p of room.participants.values()) {
        if (p.role !== 'teacher' && p.role !== 'admin' && p.role !== 'manager') {
          p.canDraw = !!canDraw;
        }
      }

      io.to(`class:${classId}`).emit('all_whiteboard_access_changed', {
        canDraw: !!canDraw,
        setBy: requester?.name || 'دبیر',
      });
    });

    socket.on('request_whiteboard_access', ({ classId } = {}) => {
      if (!classId || classId !== currentClassId) return;
      const room = getOrCreateClassroom(classId);
      const participant = room.participants.get(socket.id);
      if (participant) {
        io.to(`class:${classId}`).emit('whiteboard_access_requested', {
          socketId: socket.id,
          userId: participant.userId,
          name: participant.name,
          requestedAt: new Date().toISOString(),
        });
      }
    });

    socket.on('set_student_permission', ({ classId, targetSocketId, targetUserId, permissionType, allowed } = {}) => {
      if (!classId || classId !== currentClassId) return;
      const room = getOrCreateClassroom(classId);
      if (!isRoomTeacher(room)) return;
      const requester = room.participants.get(socket.id);

      let target = null;
      if (targetSocketId && room.participants.has(targetSocketId)) {
        target = room.participants.get(targetSocketId);
      } else if (targetUserId) {
        for (const p of room.participants.values()) {
          if (p.userId === targetUserId) {
            target = p;
            break;
          }
        }
      }

      if (target) {
        if (permissionType === 'whiteboard') target.canDraw = !!allowed;
        if (permissionType === 'mic') target.canMic = !!allowed;
        if (permissionType === 'screen') target.canScreenShare = !!allowed;

        io.to(`class:${classId}`).emit('student_permission_changed', {
          socketId: target.socketId,
          userId: target.userId,
          name: target.name,
          permissionType,
          allowed: !!allowed,
          grantedBy: requester?.name || 'دبیر',
        });
      }
    });

    socket.on('toggle_mic', ({ classId, micOn } = {}) => {
      if (!classId || classId !== currentClassId) return;
      const room = getOrCreateClassroom(classId);
      const participant = room?.participants.get(socket.id);
      if (participant) {
        if (!isRoomTeacher(room) && !participant.canMic) return;

        participant.micOn = !!micOn;
        io.to(`class:${classId}`).emit('participant_mic_changed', {
          socketId: socket.id,
          userId: participant.userId,
          name: participant.name,
          micOn: !!micOn,
        });
      }
    });

    socket.on('start_screen_share', ({ classId } = {}) => {
      if (!classId || classId !== currentClassId) return;
      const room = getOrCreateClassroom(classId);
      const participant = room?.participants.get(socket.id);
      if (participant) {
        if (!isRoomTeacher(room) && !participant.canScreenShare) return;

        room.screenSharingUser = {
          socketId: socket.id,
          userId: participant.userId,
          name: participant.name,
        };

        io.to(`class:${classId}`).emit('screen_share_started', {
          user: room.screenSharingUser,
        });
      }
    });

    socket.on('stop_screen_share', ({ classId } = {}) => {
      if (!classId || classId !== currentClassId) return;
      const room = getOrCreateClassroom(classId);
      if (room && room.screenSharingUser?.socketId === socket.id) {
        room.screenSharingUser = null;
        io.to(`class:${classId}`).emit('screen_share_stopped', {
          socketId: socket.id,
        });
      }
    });

    socket.on('screen_frame', ({ classId, frame } = {}) => {
      if (!allowSocketEvent(30)) return;
      if (!classId || classId !== currentClassId) return;
      const room = getOrCreateClassroom(classId);
      const participant = room?.participants.get(socket.id);
      if (!isRoomTeacher(room) && !participant?.canScreenShare) {
        socket.emit('error_message', { message: 'شما مجاز به اشتراک‌گذاری صفحه نیستید' });
        return;
      }
      if (typeof frame !== 'string' || frame.length > 1_000_000) return;
      socket.to(`class:${classId}`).emit('screen_frame', frame);
    });

    socket.on('audio_chunk', ({ classId, chunk } = {}) => {
      if (!allowSocketEvent(45)) return;
      if (!classId || classId !== currentClassId) return;
      const room = getOrCreateClassroom(classId);
      const participant = room?.participants.get(socket.id);
      if (!isRoomTeacher(room) && !participant?.canMic) return;

      socket.to(`class:${classId}`).emit('audio_chunk', {
        senderSocketId: socket.id,
        senderName: participant?.name || 'کاربر',
        chunk,
      });
    });

    socket.on('send_chat_message', async ({ classId, text } = {}) => {
      if (!allowSocketEvent(10)) return;
      if (!classId || classId !== currentClassId) return;
      if (!text || typeof text !== 'string' || !text.trim()) return;
      if (!(await isSessionStillValid(socket))) return;

      const sanitizedText = text
        .replace(/<[^>]*>?/gm, '')
        .trim()
        .slice(0, 1000);
      if (!sanitizedText) return;

      const room = getOrCreateClassroom(classId);
      const msg = {
        id: 'msg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
        senderId: currentUser.id,
        senderName: currentUser.name,
        senderRole: currentUser.role,
        text: sanitizedText,
        createdAt: new Date().toISOString(),
      };

      room.chatMessages.push(msg);
      if (room.chatMessages.length > 100) {
        room.chatMessages.shift();
      }
      scheduleSave(classId, room);

      io.to(`class:${classId}`).emit('new_chat_message', msg);
    });

    socket.on('toggle_hand_raise', ({ classId } = {}) => {
      if (!classId || classId !== currentClassId) return;
      const room = getOrCreateClassroom(classId);
      const participant = room.participants.get(socket.id);
      if (participant) {
        participant.handRaised = !participant.handRaised;
        io.to(`class:${classId}`).emit('hand_status_changed', {
          socketId: socket.id,
          userId: participant.userId,
          name: participant.name,
          handRaised: participant.handRaised,
        });
      }
    });

    socket.on('lower_student_hand', ({ classId, targetSocketId, targetUserId } = {}) => {
      if (!classId || classId !== currentClassId) return;
      const room = getOrCreateClassroom(classId);
      if (!isRoomTeacher(room)) return;

      let participant = targetSocketId ? room.participants.get(targetSocketId) : null;
      if (!participant && targetUserId) {
        for (const p of room.participants.values()) {
          if (p.userId === targetUserId) {
            participant = p;
            break;
          }
        }
      }
      if (participant) {
        participant.handRaised = false;
        io.to(`class:${classId}`).emit('hand_status_changed', {
          socketId: participant.socketId,
          userId: participant.userId,
          name: participant.name,
          handRaised: false,
        });
      }
    });

    socket.on('set_all_student_permission', ({ classId, permissionType, allowed } = {}) => {
      if (!classId || classId !== currentClassId) return;
      const room = getOrCreateClassroom(classId);
      if (!isRoomTeacher(room)) return;
      const requester = room.participants.get(socket.id);

      for (const p of room.participants.values()) {
        if (p.role !== 'teacher' && p.role !== 'admin' && p.role !== 'manager') {
          if (permissionType === 'whiteboard') p.canDraw = !!allowed;
          if (permissionType === 'mic') p.canMic = !!allowed;
          if (permissionType === 'screen') p.canScreenShare = !!allowed;
        }
      }

      io.to(`class:${classId}`).emit('all_student_permission_changed', {
        permissionType,
        allowed: !!allowed,
        setBy: requester?.name || 'دبیر',
      });
    });

    socket.on('webrtc_signal', ({ targetSocketId, signal } = {}) => {
      if (!allowSocketEvent(50)) return;
      if (!currentClassId || !activeClassrooms.has(currentClassId)) return;
      const room = activeClassrooms.get(currentClassId);
      const senderParticipant = room.participants.get(socket.id);
      if (!senderParticipant) return;

      const verifiedSenderData = {
        userId: senderParticipant.userId,
        name: senderParticipant.name,
        role: senderParticipant.role,
      };

      if (targetSocketId) {
        // Only relay WebRTC signals to sockets in the exact same classroom (SEC-SOCKET-002)
        if (!room.participants.has(targetSocketId)) {
          socket.emit('error_message', { message: 'مقصد سیگنال در این کلاس حضور ندارد' });
          return;
        }
        io.to(targetSocketId).emit('webrtc_signal', {
          senderSocketId: socket.id,
          signal,
          senderData: verifiedSenderData,
        });
      } else {
        socket.to(`class:${currentClassId}`).emit('webrtc_signal', {
          senderSocketId: socket.id,
          signal,
          senderData: verifiedSenderData,
        });
      }
    });

    socket.on('live_video_frame', ({ classId, frame } = {}) => {
      if (!allowSocketEvent(30)) return;
      if (!classId || classId !== currentClassId) return;
      const room = getOrCreateClassroom(classId);
      if (!isRoomTeacher(room)) {
        socket.emit('error_message', { message: 'فقط دبیر کلاس مجاز به ارسال تصویر زنده است' });
        return;
      }
      if (typeof frame !== 'string' || frame.length > 1_000_000) return;
      socket.to(`class:${classId}`).emit('live_video_frame', frame);
    });

    socket.on('disconnect', () => {
      if (currentClassId && activeClassrooms.has(currentClassId)) {
        const room = activeClassrooms.get(currentClassId);
        const leavingParticipant = room.participants.get(socket.id);
        room.participants.delete(socket.id);

        if (room.screenSharingUser?.socketId === socket.id) {
          room.screenSharingUser = null;
          io.to(`class:${currentClassId}`).emit('screen_share_stopped', { socketId: socket.id });
        }

        if (socket.id === room.teacherSocketId) {
          room.teacherSocketId = null;
          const remainingTeacher = Array.from(room.participants.values()).find(
            (p) => p.role === 'teacher' || p.role === 'admin' || p.role === 'manager'
          );
          if (remainingTeacher) {
            room.teacherSocketId = remainingTeacher.socketId;
          } else if (room.isLive && room.participants.size === 0) {
            room.isLive = false;
            room.startedAt = null;
          }
        }

        io.to(`class:${currentClassId}`).emit('participant_left', {
          socketId: socket.id,
          userId: leavingParticipant?.userId,
          name: leavingParticipant?.name,
          participantsCount: room.participants.size,
        });

        if (room.participants.size === 0 && !room.isLive) {
          activeClassrooms.delete(currentClassId);
        }
      }
    });
  });

  return { io, activeClassrooms };
}

module.exports = { initSocket, activeClassrooms };
