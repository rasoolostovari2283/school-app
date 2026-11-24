/**
 * Migration 024: Create video_folders table and ensure videos folder/category/audience columns exist.
 */
exports.up = async function (knex) {
  const hasVideoFolders = await knex.schema.hasTable('video_folders');
  if (!hasVideoFolders) {
    await knex.schema.createTable('video_folders', (table) => {
      table.string('id', 36).primary();
      table.string('name').notNullable();
      table.string('teacher_id', 36).references('id').inTable('users').onDelete('CASCADE');
      table.string('class_id', 36).nullable().references('id').inTable('classes').onDelete('SET NULL');
      table.string('color').defaultTo('#6366f1');
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.index(['teacher_id', 'name'], 'idx_video_folders_teacher_name');
    });
  }

  const hasVideos = await knex.schema.hasTable('videos');
  if (hasVideos) {
    const missingChecks = [
      { col: 'folder_name', add: (t) => t.string('folder_name').defaultTo('عمومی') },
      { col: 'category', add: (t) => t.string('category').defaultTo('تدریس') },
      { col: 'target_audience', add: (t) => t.string('target_audience').defaultTo('all') },
      { col: 'file_url', add: (t) => t.string('file_url') },
      { col: 'video_url', add: (t) => t.string('video_url') },
      { col: 'thumbnail_url', add: (t) => t.string('thumbnail_url') },
      { col: 'pdf_url', add: (t) => t.string('pdf_url') },
      { col: 'pdf_name', add: (t) => t.string('pdf_name') },
      { col: 'mimetype', add: (t) => t.string('mimetype') },
      { col: 'file_size', add: (t) => t.integer('file_size').defaultTo(0) },
      { col: 'duration_seconds', add: (t) => t.integer('duration_seconds').defaultTo(0) },
      { col: 'views_count', add: (t) => t.integer('views_count').defaultTo(0) },
      { col: 'is_published', add: (t) => t.boolean('is_published').defaultTo(true) },
    ];

    for (const item of missingChecks) {
      const exists = await knex.schema.hasColumn('videos', item.col);
      if (!exists) {
        await knex.schema.alterTable('videos', (table) => {
          item.add(table);
        });
      }
    }
  }
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('video_folders');
};
