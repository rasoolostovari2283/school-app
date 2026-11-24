/**
 * Migration 018: Add complete school registration fields to schools table
 * Persists school level, high-school majors, unique school username/ID,
 * hashed login password, principal name, and principal phone in one dedicated row per school.
 */
exports.up = async function (knex) {
  const columnsToAdd = [
    { name: 'level', add: (table) => table.string('level', 120) },
    { name: 'majors', add: (table) => table.text('majors').defaultTo('[]') },
    { name: 'username', add: (table) => table.string('username', 120) },
    { name: 'password_hash', add: (table) => table.string('password_hash', 255) },
    { name: 'principal_name', add: (table) => table.string('principal_name', 150) },
    { name: 'principal_phone', add: (table) => table.string('principal_phone', 40) },
  ];

  for (const col of columnsToAdd) {
    const exists = await knex.schema.hasColumn('schools', col.name);
    if (!exists) {
      await knex.schema.table('schools', (table) => {
        col.add(table);
      });
    }
  }

  // Create unique index on schools.username (nullable values allowed multiple times in SQLite & PostgreSQL)
  try {
    await knex.raw(
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_schools_username ON schools (username) WHERE username IS NOT NULL'
    );
  } catch (_err) {
    try {
      await knex.schema.table('schools', (table) => {
        table.index('username', 'idx_schools_username');
      });
    } catch (_fallbackErr) {}
  }
};

exports.down = async function (knex) {
  try {
    await knex.raw('DROP INDEX IF EXISTS idx_schools_username');
  } catch (_err) {}

  const cols = ['level', 'majors', 'username', 'password_hash', 'principal_name', 'principal_phone'];
  for (const colName of cols) {
    const exists = await knex.schema.hasColumn('schools', colName);
    if (exists) {
      await knex.schema.table('schools', (table) => {
        table.dropColumn(colName);
      });
    }
  }
};
