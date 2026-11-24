const crypto = require('crypto');

const genId = () => (crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex'));

exports.up = async function up(knex) {
  // 1. Enhance video_folders with grade, target_class_ids, updated_at
  const hasFolders = await knex.schema.hasTable('video_folders');
  if (hasFolders) {
    const hasGrade = await knex.schema.hasColumn('video_folders', 'grade');
    const hasTargetClassIds = await knex.schema.hasColumn('video_folders', 'target_class_ids');
    const hasUpdatedAt = await knex.schema.hasColumn('video_folders', 'updated_at');

    await knex.schema.alterTable('video_folders', (table) => {
      if (!hasGrade) table.string('grade', 80).nullable();
      if (!hasTargetClassIds) table.text('target_class_ids').defaultTo('[]');
      if (!hasUpdatedAt) table.timestamp('updated_at').nullable();
    });
  }

  // 2. Enhance videos with grade, target_class_ids, quality_variants
  const hasVideos = await knex.schema.hasTable('videos');
  if (hasVideos) {
    const hasGrade = await knex.schema.hasColumn('videos', 'grade');
    const hasTargetClassIds = await knex.schema.hasColumn('videos', 'target_class_ids');
    const hasQualityVariants = await knex.schema.hasColumn('videos', 'quality_variants');

    await knex.schema.alterTable('videos', (table) => {
      if (!hasGrade) table.string('grade', 80).nullable();
      if (!hasTargetClassIds) table.text('target_class_ids').defaultTo('[]');
      if (!hasQualityVariants) table.text('quality_variants').defaultTo('[]');
    });
  }

  // 3. Join table: video_folder_classes (many-to-many folder <-> DB classes)
  const hasFolderClasses = await knex.schema.hasTable('video_folder_classes');
  if (!hasFolderClasses) {
    await knex.schema.createTable('video_folder_classes', (table) => {
      table.string('id', 36).primary();
      table.string('folder_id', 36).notNullable().references('id').inTable('video_folders').onDelete('CASCADE');
      table.string('class_id', 36).notNullable().references('id').inTable('classes').onDelete('CASCADE');
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.unique(['folder_id', 'class_id'], 'uq_video_folder_classes');
      table.index(['class_id'], 'idx_vfc_class_id');
    });
  }

  // 4. Join table: video_classes (many-to-many video <-> DB classes)
  const hasVideoClasses = await knex.schema.hasTable('video_classes');
  if (!hasVideoClasses) {
    await knex.schema.createTable('video_classes', (table) => {
      table.string('id', 36).primary();
      table.string('video_id', 36).notNullable().references('id').inTable('videos').onDelete('CASCADE');
      table.string('class_id', 36).notNullable().references('id').inTable('classes').onDelete('CASCADE');
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.unique(['video_id', 'class_id'], 'uq_video_classes');
      table.index(['class_id'], 'idx_vc_class_id');
    });
  }

  // 5. Join table: video_folder_items (many-to-many video <-> folders for multi-folder sharing)
  const hasFolderItems = await knex.schema.hasTable('video_folder_items');
  if (!hasFolderItems) {
    await knex.schema.createTable('video_folder_items', (table) => {
      table.string('id', 36).primary();
      table.string('video_id', 36).notNullable().references('id').inTable('videos').onDelete('CASCADE');
      table.string('folder_id', 36).nullable().references('id').inTable('video_folders').onDelete('CASCADE');
      table.string('folder_name', 200).notNullable();
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.unique(['video_id', 'folder_name'], 'uq_video_folder_items_name');
      table.index(['folder_id'], 'idx_vfi_folder_id');
      table.index(['folder_name'], 'idx_vfi_folder_name');
    });
  }

  // 6. Table: video_pdfs (one or multiple PDFs attached underneath a video)
  const hasVideoPdfs = await knex.schema.hasTable('video_pdfs');
  if (!hasVideoPdfs) {
    await knex.schema.createTable('video_pdfs', (table) => {
      table.string('id', 36).primary();
      table.string('video_id', 36).notNullable().references('id').inTable('videos').onDelete('CASCADE');
      table.string('file_url', 500).notNullable();
      table.string('file_name', 255).notNullable();
      table.integer('file_size').defaultTo(0);
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.index(['video_id'], 'idx_video_pdfs_video_id');
    });
  }

  // 7. Backfill existing data cleanly so legacy videos/folders keep working
  if (hasVideos) {
    const existingVideos = await knex('videos').select(
      'id',
      'teacher_id',
      'class_id',
      'folder_name',
      'pdf_url',
      'pdf_name'
    );
    const folderColumns = hasFolders ? await knex('video_folders').columnInfo() : {};
    const folderHasClassId = Boolean(folderColumns.class_id);
    const existingFolders = hasFolders
      ? await knex('video_folders').select('id', 'teacher_id', 'name', ...(folderHasClassId ? ['class_id'] : []))
      : [];

    const folderMap = new Map();
    for (const f of existingFolders) {
      folderMap.set(`${f.teacher_id}::${f.name}`, f);
      if (f.class_id) {
        const exists = await knex('video_folder_classes')
          .where({ folder_id: f.id, class_id: f.class_id })
          .first();
        if (!exists) {
          await knex('video_folder_classes').insert({
            id: genId(),
            folder_id: f.id,
            class_id: f.class_id,
          });
        }
        await knex('video_folders')
          .where({ id: f.id })
          .update({ target_class_ids: JSON.stringify([f.class_id]) });
      }
    }

    for (const v of existingVideos) {
      if (v.class_id) {
        const exists = await knex('video_classes')
          .where({ video_id: v.id, class_id: v.class_id })
          .first();
        if (!exists) {
          await knex('video_classes').insert({
            id: genId(),
            video_id: v.id,
            class_id: v.class_id,
          });
        }
        await knex('videos')
          .where({ id: v.id })
          .update({ target_class_ids: JSON.stringify([v.class_id]) });
      }

      const folderName = (v.folder_name || 'عمومی').trim() || 'عمومی';
      const matchedFolder = folderMap.get(`${v.teacher_id}::${folderName}`);
      const itemExists = await knex('video_folder_items')
        .where({ video_id: v.id, folder_name: folderName })
        .first();
      if (!itemExists) {
        await knex('video_folder_items').insert({
          id: genId(),
          video_id: v.id,
          folder_id: matchedFolder ? matchedFolder.id : null,
          folder_name: folderName,
        });
      }

      if (v.pdf_url) {
        const pdfExists = await knex('video_pdfs')
          .where({ video_id: v.id, file_url: v.pdf_url })
          .first();
        if (!pdfExists) {
          await knex('video_pdfs').insert({
            id: genId(),
            video_id: v.id,
            file_url: v.pdf_url,
            file_name: v.pdf_name || 'فایل پیوست.pdf',
            file_size: 0,
          });
        }
      }
    }
  }
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('video_pdfs');
  await knex.schema.dropTableIfExists('video_folder_items');
  await knex.schema.dropTableIfExists('video_classes');
  await knex.schema.dropTableIfExists('video_folder_classes');
};
