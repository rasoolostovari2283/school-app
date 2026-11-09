const { v4: uuidv4 } = require('uuid');

/**
 * Generate a UUID v4 string
 */
function generateId() {
  return uuidv4();
}

/**
 * SQLite-compatible insert that returns the full inserted row.
 * Knex's .returning() doesn't work with SQLite, so we insert then select.
 */
async function insertAndReturn(db, tableName, data) {
  const id = data.id || generateId();
  const record = { ...data, id };

  await db(tableName).insert(record);
  const row = await db(tableName).where({ id }).first();
  return row;
}

/**
 * SQLite-compatible update that returns the updated row.
 */
async function updateAndReturn(db, tableName, whereClause, data) {
  await db(tableName).where(whereClause).update(data);
  const row = await db(tableName).where(whereClause).first();
  return row;
}

function now() {
  return new Date().toISOString();
}

function parsePagination({ page = 1, limit = 50 } = {}) {
  const safePage = Math.max(1, parseInt(page, 10) || 1);
  const safeLimit = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));
  return {
    page: safePage,
    limit: safeLimit,
    offset: (safePage - 1) * safeLimit,
  };
}

function paginatedResponse(items, totalCount, page = 1, limit = 50) {
  const { page: safePage, limit: safeLimit } = parsePagination({ page, limit });
  const total = Number(totalCount || 0);
  return {
    items,
    messages: items,
    notifications: items,
    pagination: {
      total,
      page: safePage,
      limit: safeLimit,
      total_pages: Math.max(1, Math.ceil(total / safeLimit)),
    },
  };
}

module.exports = {
  generateId,
  now,
  parsePagination,
  paginatedResponse,
  insertAndReturn,
  updateAndReturn,
};
