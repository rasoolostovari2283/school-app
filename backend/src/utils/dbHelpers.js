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

module.exports = { generateId, insertAndReturn, updateAndReturn };
