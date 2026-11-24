/**
 * Socket.IO handler for School Online Meetings Live Webinar Room (Skyroom-style WebRTC mesh).
 * Register inside backend/src/socket.js -> io.on('connection', (socket) => { registerSchoolWebinarSocket(io, socket, authUser); });
 */

const PRINCIPAL_ROLES = new Set(['admin', 'manager', 'principal', 'school_admin', 'super_admin']);

// In-memory state per schoolId: { participants: Map<socketId, participantInfo>, chat: Array }
const schoolWebinarRooms = new Map();

function getOrCreateRoom(schoolId) {
  const key = String(schoolId || 'default_school');
  if (!schoolWebinarRooms.has(key)) {
    schoolWebinarRooms.set(key, {
      participants: new Map(),
      chat: [],
    });
  }
  return schoolWebinarRooms.get(key);
}

function registerSchoolWebinarSocket(io, socket, authUser) {
  if (!authUser || !authUser.id) return;
  const schoolId = String(authUser.school_id || 'default_school');
  const role = String(authUser.role || '').toLowerCase();
  const isHost = PRINCIPAL_ROLES.has(role);

  // Subscribe to school meetings feed for live webinar status updates
  socket.join(`school_meetings_feed:${schoolId}`);

  let joinedRoomKey = null;

  socket.on('school_webinar_join', ({ sessionId } = {}) => {
    const roomName = `school_webinar:${schoolId}`;
    const room = getOrCreateRoom(schoolId);
    joinedRoomKey = schoolId;

    socket.join(roomName);

    const participant = {
      socketId: socket.id,
      userId: authUser.id,
      fullName: authUser.full_name || authUser.username || 'کاربر',
      role,
      isHost,
      micOn: true,
      camOn: true,
      screenSharing: false,
      handRaised: false,
      sessionId: sessionId || null,
    };

    room.participants.set(socket.id, participant);

    // Send existing participants & recent chat to the newly joined user
    socket.emit('school_webinar_init', {
      selfSocketId: socket.id,
      participants: Array.from(room.participants.values()),
      chat: room.chat.slice(-100),
    });

    // Notify other participants so they initiate WebRTC peer connections
    socket.to(roomName).emit('school_webinar_participant_joined', { participant });
  });

  // Relay WebRTC SDP offer/answer & ICE candidates strictly within the same school webinar room
  socket.on('school_webinar_signal', ({ targetSocketId, signal } = {}) => {
    if (!joinedRoomKey || !targetSocketId || !signal) return;
    const room = getOrCreateRoom(joinedRoomKey);
    if (!room.participants.has(targetSocketId)) return;

    io.to(targetSocketId).emit('school_webinar_signal', {
      fromSocketId: socket.id,
      fromParticipant: room.participants.get(socket.id) || null,
      signal,
    });
  });

  socket.on('school_webinar_media_state', ({ micOn, camOn, screenSharing } = {}) => {
    if (!joinedRoomKey) return;
    const room = getOrCreateRoom(joinedRoomKey);
    const p = room.participants.get(socket.id);
    if (!p) return;

    if (typeof micOn === 'boolean') p.micOn = micOn;
    if (typeof camOn === 'boolean') p.camOn = camOn;
    if (typeof screenSharing === 'boolean') p.screenSharing = screenSharing;

    io.to(`school_webinar:${joinedRoomKey}`).emit('school_webinar_participant_updated', { participant: p });
  });

  socket.on('school_webinar_hand', ({ handRaised } = {}) => {
    if (!joinedRoomKey) return;
    const room = getOrCreateRoom(joinedRoomKey);
    const p = room.participants.get(socket.id);
    if (!p) return;

    p.handRaised = Boolean(handRaised);
    io.to(`school_webinar:${joinedRoomKey}`).emit('school_webinar_participant_updated', { participant: p });
  });

  socket.on('school_webinar_chat', ({ text } = {}) => {
    if (!joinedRoomKey) return;
    const cleanText = String(text || '').trim().slice(0, 1000);
    if (!cleanText) return;

    const room = getOrCreateRoom(joinedRoomKey);
    const message = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      senderId: authUser.id,
      senderName: authUser.full_name || authUser.username || 'کاربر',
      senderRole: role,
      isHost,
      text: cleanText,
      createdAt: new Date().toISOString(),
    };

    room.chat.push(message);
    if (room.chat.length > 200) room.chat.shift();

    io.to(`school_webinar:${joinedRoomKey}`).emit('school_webinar_chat_message', { message });
  });

  const handleLeave = () => {
    if (!joinedRoomKey) return;
    const roomName = `school_webinar:${joinedRoomKey}`;
    const room = getOrCreateRoom(joinedRoomKey);
    room.participants.delete(socket.id);
    socket.leave(roomName);
    socket.to(roomName).emit('school_webinar_participant_left', { socketId: socket.id });
    if (room.participants.size === 0) {
      schoolWebinarRooms.delete(joinedRoomKey);
    }
    joinedRoomKey = null;
  };

  socket.on('school_webinar_leave', handleLeave);
  socket.on('disconnect', handleLeave);
}

module.exports = { registerSchoolWebinarSocket };
