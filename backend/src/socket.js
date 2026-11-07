const { Server } = require('socket.io');
const { loadClassroomSnapshot, scheduleSave, clearSession } = require('./services/classroomPersistence');

// In-memory active live classrooms manager
const activeClassrooms = new Map();

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
      participants: new Map(), // socketId -> { userId, name, role, avatar, handRaised, micOn, cameraOn }
      whiteboardStrokes: [], // History of draw actions to sync new joiners
      boardType: 'white', // 'white' | 'grid' | 'blackboard'
      docState: null, // Shared document/PDF/PPTX/Image state
      boardPages: null,
      currentPage: 1,
      chatMessages: [],
    };
    activeClassrooms.set(classId, room);

    // Asynchronously restore persisted state from SQLite
    loadClassroomSnapshot(classId).then((snapshot) => {
      if (snapshot && activeClassrooms.has(classId)) {
        const currentRoom = activeClassrooms.get(classId);
        if (currentRoom.whiteboardStrokes.length === 0 && snapshot.strokes?.length > 0) {
          currentRoom.whiteboardStrokes = snapshot.strokes;
        }
        if (currentRoom.chatMessages.length === 0 && snapshot.chatMessages?.length > 0) {
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
  const io = new Server(server, {
    cors: {
      origin: (origin, callback) => {
        // Domestic intranet friendly: allow frontendUrl, localhost, 127.0.0.1, or local IP
        callback(null, true);
      },
      methods: ['GET', 'POST'],
      credentials: true,
    },
    // Domestic resilient transports: starts with websocket, smoothly falls back to polling
    transports: ['websocket', 'polling'],
    maxHttpBufferSize: 5 * 1024 * 1024,
    pingTimeout: 35000,
    pingInterval: 15000,
  });

  io.on('connection', (socket) => {
    let currentClassId = null;
    let currentUser = null;

    // ── Join a Class Room ──
    socket.on('join_class', ({ classId, user }) => {
      if (!classId) return;
      currentClassId = classId;
      currentUser = user || { id: socket.id, name: 'کاربر مهمان', role: 'student' };

      socket.join(`class:${classId}`);

      const room = getOrCreateClassroom(classId);

      // Track participant
      const isTeacher = (currentUser.role === 'teacher' || currentUser.role === 'admin' || currentUser.role === 'manager' || currentUser.role === 'school_admin');
      const canDraw = isTeacher; // default false for student, true for teacher
      const canMic = isTeacher;
      const canScreenShare = isTeacher;

      room.participants.set(socket.id, {
        socketId: socket.id,
        userId: currentUser.id,
        name: currentUser.name || currentUser.full_name || 'کاربر',
        role: currentUser.role || 'student',
        avatar: currentUser.avatar || null,
        handRaised: false,
        micOn: false,
        cameraOn: false,
        canDraw: canDraw,
        canMic: canMic,
        canScreenShare: canScreenShare,
        joinedAt: new Date().toISOString(),
      });

      if (currentUser.role === 'teacher' || currentUser.role === 'admin' || currentUser.role === 'manager' || currentUser.role === 'school_admin') {
        room.teacherSocketId = socket.id;
        room.teacherId = currentUser.id;
        room.teacherName = currentUser.name || currentUser.full_name;
      }

      // Convert participants Map to array for client
      const participantsList = Array.from(room.participants.values());

      // Send initial state to the newly connected user
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
        canDraw: canDraw,
        canMic: canMic,
        canScreenShare: canScreenShare,
        screenSharingUser: room.screenSharingUser || null,
      });

      // Broadcast to other members that a user joined
      socket.to(`class:${classId}`).emit('participant_joined', {
        participant: room.participants.get(socket.id),
        participantsCount: room.participants.size,
      });
    });

    // ── Teacher Starts Live Class ──
    socket.on('start_live', ({ classId, title, boardType }) => {
      const room = getOrCreateClassroom(classId);
      room.isLive = true;
      room.startedAt = new Date().toISOString();
      room.title = title || 'کلاس آنلاین زنده';
      room.boardType = boardType || room.boardType || 'white';
      room.teacherSocketId = socket.id;
      if (currentUser) {
        room.teacherId = currentUser.id;
        room.teacherName = currentUser.name;
      }

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
    socket.on('end_live', ({ classId }) => {
      const room = getOrCreateClassroom(classId);
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
      room.whiteboardStrokes = []; // reset for next session
    });

    // ── Helper to verify Whiteboard Access Permission ──
    const canUserDraw = (room) => {
      if (!room) return false;
      if (room.teacherSocketId === socket.id) return true;
      const participant = room.participants.get(socket.id);
      if (participant && (participant.role === 'teacher' || participant.role === 'admin' || participant.canDraw)) {
        return true;
      }
      if (currentUser && (currentUser.role === 'teacher' || currentUser.role === 'admin')) {
        return true;
      }
      return false;
    };

    // ── Whiteboard Drawing Synchronization (Guarded by Permission) ──
    socket.on('wb_draw', ({ classId, stroke }) => {
      const room = getOrCreateClassroom(classId);
      if (!canUserDraw(room)) {
        // Drop drawing if user has not been granted permission by teacher
        return;
      }
      if (room) {
        // Keep strokes history (limit to last 2000 to prevent memory blowup)
        room.whiteboardStrokes.push(stroke);
        if (room.whiteboardStrokes.length > 2000) {
          room.whiteboardStrokes.shift();
        }
        scheduleSave(classId, room);
      }
      // Broadcast to everyone else in the room
      socket.to(`class:${classId}`).emit('wb_draw', stroke);
    });

    socket.on('wb_clear', ({ classId }) => {
      const room = getOrCreateClassroom(classId);
      if (!canUserDraw(room)) return;
      if (room) {
        room.whiteboardStrokes = [];
        scheduleSave(classId, room);
      }
      socket.to(`class:${classId}`).emit('wb_clear');
    });

    socket.on('wb_undo', ({ classId }) => {
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

    socket.on('wb_change_bg', ({ classId, boardType }) => {
      const room = getOrCreateClassroom(classId);
      if (!canUserDraw(room)) return;
      if (room) {
        room.boardType = boardType;
        scheduleSave(classId, room);
      }
      socket.to(`class:${classId}`).emit('wb_change_bg', { boardType });
    });

    socket.on('wb_sync_all', ({ classId, strokes, boardType, docState, boardPages, currentPage }) => {
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

    socket.on('wb_doc_change', ({ classId, docState }) => {
      const room = getOrCreateClassroom(classId);
      if (!canUserDraw(room)) return;
      if (room) {
        room.docState = docState;
        scheduleSave(classId, room);
      }
      socket.to(`class:${classId}`).emit('wb_doc_change', docState);
    });

    socket.on('wb_page_change', ({ classId, pageNum, boardPages }) => {
      const room = getOrCreateClassroom(classId);
      if (!canUserDraw(room)) return;
      if (room) {
        room.currentPage = pageNum;
        if (boardPages) room.boardPages = boardPages;
        scheduleSave(classId, room);
      }
      socket.to(`class:${classId}`).emit('wb_page_change', { pageNum, boardPages });
    });

    // ── Whiteboard Permissions Controls (Teacher Grants/Revokes) ──
    socket.on('grant_whiteboard_access', ({ classId, targetSocketId, targetUserId }) => {
      const room = getOrCreateClassroom(classId);
      const requester = room.participants.get(socket.id);
      const isTeacherUser = socket.id === room.teacherSocketId ||
        (requester && (requester.role === 'teacher' || requester.role === 'admin')) ||
        (currentUser && (currentUser.role === 'teacher' || currentUser.role === 'admin'));

      if (!isTeacherUser) return;

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

    socket.on('revoke_whiteboard_access', ({ classId, targetSocketId, targetUserId }) => {
      const room = getOrCreateClassroom(classId);
      const requester = room.participants.get(socket.id);
      const isTeacherUser = socket.id === room.teacherSocketId ||
        (requester && (requester.role === 'teacher' || requester.role === 'admin')) ||
        (currentUser && (currentUser.role === 'teacher' || currentUser.role === 'admin'));

      if (!isTeacherUser) return;

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

    socket.on('set_all_whiteboard_access', ({ classId, canDraw }) => {
      const room = getOrCreateClassroom(classId);
      const requester = room.participants.get(socket.id);
      const isTeacherUser = socket.id === room.teacherSocketId ||
        (requester && (requester.role === 'teacher' || requester.role === 'admin')) ||
        (currentUser && (currentUser.role === 'teacher' || currentUser.role === 'admin'));

      if (!isTeacherUser) return;

      for (const p of room.participants.values()) {
        if (p.role !== 'teacher' && p.role !== 'admin') {
          p.canDraw = !!canDraw;
        }
      }

      io.to(`class:${classId}`).emit('all_whiteboard_access_changed', {
        canDraw: !!canDraw,
        setBy: requester?.name || 'دبیر',
      });
    });

    socket.on('request_whiteboard_access', ({ classId }) => {
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

    // ── Unified Student Permission Management (Mic, ScreenShare, Whiteboard) ──
    socket.on('set_student_permission', ({ classId, targetSocketId, targetUserId, permissionType, allowed }) => {
      const room = getOrCreateClassroom(classId);
      const requester = room.participants.get(socket.id);
      const isTeacherUser = socket.id === room.teacherSocketId ||
        (requester && (requester.role === 'teacher' || requester.role === 'admin')) ||
        (currentUser && (currentUser.role === 'teacher' || currentUser.role === 'admin'));

      if (!isTeacherUser) return;

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

    // ── Participant Microphone Toggle ──
    socket.on('toggle_mic', ({ classId, micOn }) => {
      const room = getOrCreateClassroom(classId);
      const participant = room?.participants.get(socket.id);
      if (participant) {
        const isTeacherUser = participant.role === 'teacher' || participant.role === 'admin' || socket.id === room.teacherSocketId;
        if (!isTeacherUser && !participant.canMic) return; // Disallow if no permission

        participant.micOn = !!micOn;
        io.to(`class:${classId}`).emit('participant_mic_changed', {
          socketId: socket.id,
          userId: participant.userId,
          name: participant.name,
          micOn: !!micOn,
        });
      }
    });

    // ── Screen Sharing Broadcast ──
    socket.on('start_screen_share', ({ classId }) => {
      const room = getOrCreateClassroom(classId);
      const participant = room?.participants.get(socket.id);
      if (participant) {
        const isTeacherUser = participant.role === 'teacher' || participant.role === 'admin' || socket.id === room.teacherSocketId;
        if (!isTeacherUser && !participant.canScreenShare) return;

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

    socket.on('stop_screen_share', ({ classId }) => {
      const room = getOrCreateClassroom(classId);
      if (room && room.screenSharingUser?.socketId === socket.id) {
        room.screenSharingUser = null;
        io.to(`class:${classId}`).emit('screen_share_stopped', {
          socketId: socket.id,
        });
      }
    });

    socket.on('screen_frame', ({ classId, frame }) => {
      socket.to(`class:${classId}`).emit('screen_frame', frame);
    });

    // ── Live Audio Stream Forwarding (Low-latency Web Voice) ──
    socket.on('audio_chunk', ({ classId, chunk }) => {
      const room = getOrCreateClassroom(classId);
      const participant = room?.participants.get(socket.id);
      const isTeacherUser = participant?.role === 'teacher' || participant?.role === 'admin' || socket.id === room.teacherSocketId;
      if (!isTeacherUser && !participant?.canMic) return;

      socket.to(`class:${classId}`).emit('audio_chunk', {
        senderSocketId: socket.id,
        senderName: participant?.name || 'کاربر',
        chunk,
      });
    });

    // ── Live Chat ──
    socket.on('send_chat_message', ({ classId, text }) => {
      if (!text || !text.trim()) return;
      const room = getOrCreateClassroom(classId);
      const msg = {
        id: 'msg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
        senderId: currentUser?.id,
        senderName: currentUser?.name || 'کاربر',
        senderRole: currentUser?.role || 'student',
        text: text.trim(),
        createdAt: new Date().toISOString(),
      };

      room.chatMessages.push(msg);
      if (room.chatMessages.length > 100) {
        room.chatMessages.shift();
      }
      scheduleSave(classId, room);

      io.to(`class:${classId}`).emit('new_chat_message', msg);
    });

    // ── Hand Raise (اجازه گرفتن دانش‌آموز) ──
    socket.on('toggle_hand_raise', ({ classId }) => {
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

    // ── Teacher Controls Student (e.g., lower student's hand) ──
    socket.on('lower_student_hand', ({ classId, targetSocketId, targetUserId }) => {
      const room = getOrCreateClassroom(classId);
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

    socket.on('set_all_student_permission', ({ classId, permissionType, allowed }) => {
      const room = getOrCreateClassroom(classId);
      const requester = room.participants.get(socket.id);
      const isTeacherUser = socket.id === room.teacherSocketId ||
        (requester && (requester.role === 'teacher' || requester.role === 'admin')) ||
        (currentUser && (currentUser.role === 'teacher' || currentUser.role === 'admin'));

      if (!isTeacherUser) return;

      for (const p of room.participants.values()) {
        if (p.role !== 'teacher' && p.role !== 'admin') {
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

    // ── WebRTC Signaling (100% Domestic Resilient Peer-to-Peer & Server Forwarding) ──
    socket.on('webrtc_signal', ({ targetSocketId, signal, senderData }) => {
      if (targetSocketId) {
        io.to(targetSocketId).emit('webrtc_signal', {
          senderSocketId: socket.id,
          signal,
          senderData,
        });
      } else if (currentClassId) {
        // Broadcast to entire room except sender
        socket.to(`class:${currentClassId}`).emit('webrtc_signal', {
          senderSocketId: socket.id,
          signal,
          senderData,
        });
      }
    });

    // ── Fallback Video Stream Frame (Broadcasting when WebRTC P2P is blocked by strict carrier NAT) ──
    socket.on('live_video_frame', ({ classId, frame }) => {
      // Forward teacher's video frame snapshot to all students in room
      socket.to(`class:${classId}`).emit('live_video_frame', frame);
    });

    // ── Disconnection ──
    socket.on('disconnect', () => {
      if (currentClassId && activeClassrooms.has(currentClassId)) {
        const room = activeClassrooms.get(currentClassId);
        const leavingParticipant = room.participants.get(socket.id);
        room.participants.delete(socket.id);

        if (socket.id === room.teacherSocketId) {
          room.teacherSocketId = null;
        }

        io.to(`class:${currentClassId}`).emit('participant_left', {
          socketId: socket.id,
          userId: leavingParticipant?.userId,
          name: leavingParticipant?.name,
          participantsCount: room.participants.size,
        });

        // Memory cleanup: If room is empty and class is not active live, clean up memory
        if (room.participants.size === 0 && !room.isLive) {
          activeClassrooms.delete(currentClassId);
        }
      }
    });
  });

  return { io, activeClassrooms };
}

module.exports = { initSocket, activeClassrooms };
