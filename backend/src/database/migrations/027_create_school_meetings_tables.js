exports.up = async function up(knex) {
  // 1. Categorized media & files table (photos, videos, files) scoped by school_id
  const hasItems = await knex.schema.hasTable('school_meeting_items');
  if (!hasItems) {
    await knex.schema.createTable('school_meeting_items', (table) => {
      table.string('id', 36).primary();
      table.string('school_id', 64).notNullable().index('idx_smi_school_id');
      table.string('uploaded_by', 36).notNullable().references('id').inTable('users').onDelete('CASCADE');
      table.string('media_type', 20).notNullable().index('idx_smi_media_type'); // 'photo' | 'video' | 'file'
      table.string('category_group', 120).defaultTo('عمومی');
      table.string('title', 255).notNullable();
      table.text('description').nullable();
      table.string('file_url', 500).notNullable();
      table.string('file_name', 255).notNullable();
      table.string('mimetype', 120).nullable();
      table.integer('file_size').defaultTo(0);
      table.boolean('is_recording').defaultTo(false);
      table.string('webinar_session_id', 36).nullable();
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());
    });
  }

  // 2. Notice board table (تابلو اعلانات جلسات آنلاین مدرسه)
  const hasNotices = await knex.schema.hasTable('school_meeting_notices');
  if (!hasNotices) {
    await knex.schema.createTable('school_meeting_notices', (table) => {
      table.string('id', 36).primary();
      table.string('school_id', 64).notNullable().index('idx_smn_school_id');
      table.string('author_id', 36).notNullable().references('id').inTable('users').onDelete('CASCADE');
      table.string('title', 255).nullable();
      table.text('content').notNullable();
      table.boolean('is_pinned').defaultTo(false);
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());
    });
  }

  // 3. Live webinar sessions table (اتاق وبینار زنده مدرسه)
  const hasSessions = await knex.schema.hasTable('school_webinar_sessions');
  if (!hasSessions) {
    await knex.schema.createTable('school_webinar_sessions', (table) => {
      table.string('id', 36).primary();
      table.string('school_id', 64).notNullable().index('idx_sws_school_id');
      table.string('host_id', 36).notNullable().references('id').inTable('users').onDelete('CASCADE');
      table.string('title', 255).notNullable();
      table.string('status', 20).notNullable().defaultTo('live').index('idx_sws_status'); // 'live' | 'ended'
      table.string('recording_item_id', 36).nullable();
      table.timestamp('started_at').defaultTo(knex.fn.now());
      table.timestamp('ended_at').nullable();
      table.timestamp('created_at').defaultTo(knex.fn.now());
    });
  }
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('school_webinar_sessions');
  await knex.schema.dropTableIfExists('school_meeting_notices');
  await knex.schema.dropTableIfExists('school_meeting_items');
};
