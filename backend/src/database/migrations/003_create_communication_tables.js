/**
 * Migration: Create communication & content tables (SQLite-compatible)
 */
exports.up = async function (knex) {
  // ── Messages ──
  await knex.schema.createTable('messages', (table) => {
    table.string('id', 36).primary();
    table.string('sender_id', 36).references('id').inTable('users').onDelete('CASCADE');
    table.string('receiver_id', 36).references('id').inTable('users').onDelete('CASCADE');
    table.string('class_id', 36).references('id').inTable('classes').onDelete('SET NULL');
    table.text('content');
    table.text('attachments').defaultTo('[]');
    table.boolean('is_broadcast').defaultTo(false);
    table.boolean('is_read').defaultTo(false);
    table.timestamp('sent_at').defaultTo(knex.fn.now());
  });

  // ── Announcements ──
  await knex.schema.createTable('announcements', (table) => {
    table.string('id', 36).primary();
    table.string('class_id', 36).references('id').inTable('classes').onDelete('CASCADE');
    table.string('teacher_id', 36).references('id').inTable('users').onDelete('CASCADE');
    table.string('title').notNullable();
    table.text('content');
    table.text('attachments').defaultTo('[]');
    table.boolean('is_pinned').defaultTo(false);
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });

  // ── Videos ──
  await knex.schema.createTable('videos', (table) => {
    table.string('id', 36).primary();
    table.string('class_id', 36).references('id').inTable('classes').onDelete('CASCADE');
    table.string('teacher_id', 36).references('id').inTable('users').onDelete('CASCADE');
    table.string('title').notNullable();
    table.text('description');
    table.string('video_url');
    table.string('thumbnail_url');
    table.string('category');
    table.integer('duration_seconds');
    table.integer('file_size');
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });

  // ── Notifications ──
  await knex.schema.createTable('notifications', (table) => {
    table.string('id', 36).primary();
    table.string('user_id', 36).references('id').inTable('users').onDelete('CASCADE');
    table.string('type').notNullable(); // assignment | quiz | grade | attendance | message | announcement
    table.string('title').notNullable();
    table.text('body');
    table.text('data').defaultTo('{}');
    table.boolean('is_read').defaultTo(false);
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('notifications');
  await knex.schema.dropTableIfExists('videos');
  await knex.schema.dropTableIfExists('announcements');
  await knex.schema.dropTableIfExists('messages');
};
