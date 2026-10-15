/**
 * Migration: Create core tables for EduConnect
 * SQLite-compatible (no uuid-ossp, no native enums)
 */
exports.up = async function (knex) {
  // ── Users ──
  await knex.schema.createTable('users', (table) => {
    table.string('id', 36).primary();
    table.string('email').unique();
    table.string('phone').unique();
    table.string('password_hash').notNullable();
    table.string('role').notNullable(); // teacher | student | parent
    table.string('display_name').notNullable();
    table.string('avatar_url');
    table.string('locale').defaultTo('fa');
    table.boolean('is_verified').defaultTo(false);
    table.text('settings').defaultTo('{}');
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });

  // ── Schools ──
  await knex.schema.createTable('schools', (table) => {
    table.string('id', 36).primary();
    table.string('name').notNullable();
    table.string('code').unique().notNullable();
    table.string('city');
    table.string('province');
    table.string('created_by', 36).references('id').inTable('users').onDelete('SET NULL');
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });

  // ── Classes ──
  await knex.schema.createTable('classes', (table) => {
    table.string('id', 36).primary();
    table.string('name').notNullable();
    table.string('subject');
    table.string('grade');
    table.string('join_code').unique().notNullable();
    table.string('school_id', 36).references('id').inTable('schools').onDelete('SET NULL');
    table.string('teacher_id', 36).references('id').inTable('users').onDelete('CASCADE');
    table.text('quiet_hours').defaultTo('{"start":"20:00","end":"08:00"}');
    table.boolean('is_active').defaultTo(true);
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });

  // ── Class Members ──
  await knex.schema.createTable('class_members', (table) => {
    table.string('id', 36).primary();
    table.string('class_id', 36).references('id').inTable('classes').onDelete('CASCADE');
    table.string('user_id', 36).references('id').inTable('users').onDelete('CASCADE');
    table.string('role').notNullable(); // student | parent
    table.timestamp('joined_at').defaultTo(knex.fn.now());
    table.unique(['class_id', 'user_id']);
  });

  // ── Parent-Student Links ──
  await knex.schema.createTable('parent_student_links', (table) => {
    table.string('id', 36).primary();
    table.string('parent_id', 36).references('id').inTable('users').onDelete('CASCADE');
    table.string('student_id', 36).references('id').inTable('users').onDelete('CASCADE');
    table.string('relation').defaultTo('guardian'); // father | mother | guardian
    table.boolean('is_verified').defaultTo(false);
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.unique(['parent_id', 'student_id']);
  });

  // ── Invite Links ──
  await knex.schema.createTable('invite_links', (table) => {
    table.string('id', 36).primary();
    table.string('class_id', 36).references('id').inTable('classes').onDelete('CASCADE');
    table.string('token').unique().notNullable();
    table.string('target_role').notNullable(); // student | parent
    table.integer('max_uses').defaultTo(0);
    table.integer('used_count').defaultTo(0);
    table.timestamp('expires_at');
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('invite_links');
  await knex.schema.dropTableIfExists('parent_student_links');
  await knex.schema.dropTableIfExists('class_members');
  await knex.schema.dropTableIfExists('classes');
  await knex.schema.dropTableIfExists('schools');
  await knex.schema.dropTableIfExists('users');
};
