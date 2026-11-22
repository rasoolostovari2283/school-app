/**
 * Migration 020: Create dedicated `teachers` table linked as a subordinate of `schools`
 * Stores each registered teacher's full profile under their school (`school_id`),
 * including teaching education level, high-school majors, multi-selected taught grades,
 * exclusive username, and bcrypt-hashed password.
 */
exports.up = async function (knex) {
  const exists = await knex.schema.hasTable('teachers');
  if (!exists) {
    await knex.schema.createTable('teachers', (table) => {
      table.string('id', 64).primary();
      table.string('user_id', 64).notNullable().unique();
      table.string('school_id', 64).notNullable();
      table.string('school_name', 200).notNullable();
      table.string('school_username', 120);
      table.string('full_name', 150).notNullable();
      table.string('phone', 40);
      table.string('education_level', 80).notNullable();
      table.text('majors').defaultTo('[]');
      table.text('taught_grades').notNullable().defaultTo('[]');
      table.string('personnel_code', 50);
      table.string('username', 120).notNullable().unique();
      table.string('password_hash', 255).notNullable();
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());

      table.index(['school_id'], 'idx_teachers_school_id');
      table.index(['phone'], 'idx_teachers_phone');
      table.index(['username'], 'idx_teachers_username');
      table.index(['user_id'], 'idx_teachers_user_id');
    });
  }
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('teachers');
};
