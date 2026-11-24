/**
 * Dedicated `parents` table storing every registered parent hierarchically
 * under their linked student (`student_id` / `student_user_id`) who is under
 * their registered school (`school_id`), with exclusive username & bcrypt password hash.
 */
exports.up = async function (knex) {
  const exists = await knex.schema.hasTable('parents');
  if (!exists) {
    await knex.schema.createTable('parents', (table) => {
      table.uuid('id').primary();
      table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
      table.uuid('school_id').notNullable().references('id').inTable('schools').onDelete('CASCADE');
      table.string('school_name', 255).notNullable();
      table.string('school_username', 120).nullable();
      table.uuid('student_id').nullable().references('id').inTable('students').onDelete('SET NULL');
      table.uuid('student_user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
      table.string('student_name', 255).notNullable();
      table.string('student_username', 120).notNullable();
      table.string('full_name', 255).notNullable();
      table.string('phone', 50).notNullable();
      table.string('relation_type', 40).notNullable(); // 'father' | 'mother' | 'other'
      table.string('relation', 120).notNullable();
      table.string('username', 120).notNullable().unique();
      table.string('password_hash', 255).notNullable();
      table.timestamps(true, true);

      table.index(['school_id']);
      table.index(['student_user_id']);
      table.index(['student_id']);
      table.index(['phone']);
      table.index(['username']);
      table.index(['user_id']);
    });
  }
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('parents');
};
