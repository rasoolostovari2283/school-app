/**
 * Migration 019: Create dedicated `students` table
 * Stores each registered student's personal, exclusive registration record
 * (full name, phone, school identity, education level, high-school major,
 * grade, exclusive username, and bcrypt-hashed password) in its own dedicated table.
 */
exports.up = async function (knex) {
  const exists = await knex.schema.hasTable('students');
  if (!exists) {
    await knex.schema.createTable('students', (table) => {
      table.string('id', 64).primary();
      table.string('user_id', 64).notNullable().unique();
      table.string('full_name', 150).notNullable();
      table.string('phone', 40);
      table.string('school_id', 64);
      table.string('school_name', 200);
      table.string('school_username', 120);
      table.string('education_level', 80).notNullable();
      table.string('major', 80);
      table.string('grade', 80).notNullable();
      table.string('student_code', 50);
      table.string('username', 120).notNullable().unique();
      table.string('password_hash', 255).notNullable();
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());

      table.index(['school_id'], 'idx_students_school_id');
      table.index(['phone'], 'idx_students_phone');
      table.index(['username'], 'idx_students_username');
      table.index(['user_id'], 'idx_students_user_id');
    });
  }
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('students');
};
