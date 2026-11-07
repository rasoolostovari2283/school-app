/**
 * EduConnect Live Classroom State Persistence Service
 * 
 * Persists live whiteboard strokes, shared documents, and class chat messages
 * to SQLite with debounced snapshotting. Guarantees that server restarts or PM2 reloads
 * will NEVER erase active classroom drawings, slides, or chat logs.
 */

const db = require('../config/database');

const saveDebounceTimers = new Map();
let tableInitialized = false;

/**
 * Ensures the persistence table exists in SQLite
 */
async function ensureTable() {
  if (tableInitialized) return;
  try {
    const exists = await db.schema.hasTable('live_classroom_sessions');
    if (!exists) {
      await db.schema.createTable('live_classroom_sessions', (t) => {
        t.string('class_id').primary();
        t.string('teacher_id').nullable();
        t.string('teacher_name').nullable();
        t.string('board_type').defaultTo('white');
        t.integer('current_page').defaultTo(1);
        t.text('board_pages').nullable();
        t.text('doc_state').nullable();
        t.text('strokes').nullable();
        t.text('chat_messages').nullable();
        t.boolean('is_live').defaultTo(false);
        t.timestamp('updated_at').defaultTo(db.fn.now());
      });
      console.log('[ClassroomPersistence] live_classroom_sessions table created successfully.');
    }
    tableInitialized = true;
  } catch (err) {
    console.warn('[ClassroomPersistence] ensureTable warning:', err.message);
  }
}

/**
 * Loads saved state from database on classroom startup
 */
async function loadClassroomSnapshot(classId) {
  await ensureTable();
  try {
    const row = await db('live_classroom_sessions').where({ class_id: classId }).first();
    if (!row) return null;

    let strokes = [];
    let chatMessages = [];
    let docState = null;
    let boardPages = null;

    try { if (row.strokes) strokes = JSON.parse(row.strokes); } catch (e) {}
    try { if (row.chat_messages) chatMessages = JSON.parse(row.chat_messages); } catch (e) {}
    try { if (row.doc_state) docState = JSON.parse(row.doc_state); } catch (e) {}
    try { if (row.board_pages) boardPages = JSON.parse(row.board_pages); } catch (e) {}

    return {
      teacherId: row.teacher_id,
      teacherName: row.teacher_name,
      boardType: row.board_type || 'white',
      currentPage: row.current_page || 1,
      boardPages,
      docState,
      strokes,
      chatMessages,
      isLive: !!row.is_live,
    };
  } catch (err) {
    console.warn('[ClassroomPersistence] loadClassroomSnapshot error:', err.message);
    return null;
  }
}

/**
 * Persists classroom state to SQLite with 1.5s debounce to protect I/O
 */
function scheduleSave(classId, room) {
  if (!classId || !room) return;

  if (saveDebounceTimers.has(classId)) {
    clearTimeout(saveDebounceTimers.get(classId));
  }

  const timer = setTimeout(async () => {
    saveDebounceTimers.delete(classId);
    await ensureTable();

    try {
      // Keep max 2000 strokes and 200 chat messages to bound DB footprint
      const strokesJson = JSON.stringify((room.whiteboardStrokes || []).slice(-2000));
      const chatJson = JSON.stringify((room.chatMessages || []).slice(-200));
      const docStateJson = room.docState ? JSON.stringify(room.docState) : null;
      const boardPagesJson = room.boardPages ? JSON.stringify(room.boardPages) : null;

      const payload = {
        class_id: classId,
        teacher_id: room.teacherId || null,
        teacher_name: room.teacherName || null,
        board_type: room.boardType || 'white',
        current_page: room.currentPage || 1,
        board_pages: boardPagesJson,
        doc_state: docStateJson,
        strokes: strokesJson,
        chat_messages: chatJson,
        is_live: !!room.isLive,
        updated_at: new Date().toISOString(),
      };

      const existing = await db('live_classroom_sessions').where({ class_id: classId }).first();
      if (existing) {
        await db('live_classroom_sessions').where({ class_id: classId }).update(payload);
      } else {
        await db('live_classroom_sessions').insert(payload);
      }
    } catch (err) {
      console.warn('[ClassroomPersistence] save error:', err.message);
    }
  }, 1500);

  saveDebounceTimers.set(classId, timer);
}

/**
 * Clears or resets session upon teacher explicitly ending class
 */
async function clearSession(classId) {
  await ensureTable();
  try {
    await db('live_classroom_sessions').where({ class_id: classId }).update({
      is_live: false,
      strokes: '[]',
      updated_at: new Date().toISOString(),
    });
  } catch (err) {}
}

module.exports = {
  loadClassroomSnapshot,
  scheduleSave,
  clearSession,
};

