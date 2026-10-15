/**
 * Migration 005: Create video library enhancements, course selection & academic transcript tables
 * Inspired by SESS (Shiraz University Education System)
 */
exports.up = async function (knex) {
  // ── Videos (Check and extend existing videos table) ──
  const hasVideos = await knex.schema.hasTable('videos');
  if (!hasVideos) {
    await knex.schema.createTable('videos', (table) => {
      table.string('id', 36).primary();
      table.string('title').notNullable();
      table.text('description');
      table.string('class_id', 36).references('id').inTable('classes').onDelete('CASCADE');
      table.string('teacher_id', 36).references('id').inTable('users').onDelete('CASCADE');
      table.string('file_url').notNullable();
      table.string('video_url');
      table.string('thumbnail_url');
      table.string('mimetype');
      table.integer('file_size').defaultTo(0);
      table.integer('duration_seconds').defaultTo(0);
      table.integer('views_count').defaultTo(0);
      table.boolean('is_published').defaultTo(true);
      table.string('pdf_url');
      table.string('pdf_name');
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());
    });
  } else {
    // Add any missing columns to existing videos table
    const hasFileUrl = await knex.schema.hasColumn('videos', 'file_url');
    if (!hasFileUrl) {
      await knex.schema.table('videos', (table) => {
        table.string('file_url');
        table.string('mimetype');
        table.integer('views_count').defaultTo(0);
        table.boolean('is_published').defaultTo(true);
        table.timestamp('updated_at').defaultTo(knex.fn.now());
      });
    }
    const hasPdfUrl = await knex.schema.hasColumn('videos', 'pdf_url');
    if (!hasPdfUrl) {
      await knex.schema.table('videos', (table) => {
        table.string('pdf_url');
        table.string('pdf_name');
      });
    }
  }

  // ── Courses (Course Catalog — SESS-inspired) ──
  const hasCourses = await knex.schema.hasTable('courses');
  if (!hasCourses) {
    await knex.schema.createTable('courses', (table) => {
      table.string('id', 36).primary();
      table.string('code').unique().notNullable(); // e.g. MATH-1101
      table.string('name').notNullable();
      table.text('description');
      table.integer('credits').defaultTo(2);
      table.string('department'); // e.g. ریاضیات
      table.string('semester'); // e.g. 1403-1
      table.string('teacher_id', 36).references('id').inTable('users').onDelete('SET NULL');
      table.integer('capacity').defaultTo(30);
      table.integer('enrolled_count').defaultTo(0);
      table.string('schedule'); // e.g. "شنبه و دوشنبه ۸-۱۰"
      table.string('exam_date');
      table.boolean('is_active').defaultTo(true);
      table.timestamp('created_at').defaultTo(knex.fn.now());
    });
  }

  // ── Course Enrollments (انتخاب واحد) ──
  const hasEnrollments = await knex.schema.hasTable('course_enrollments');
  if (!hasEnrollments) {
    await knex.schema.createTable('course_enrollments', (table) => {
      table.string('id', 36).primary();
      table.string('course_id', 36).references('id').inTable('courses').onDelete('CASCADE');
      table.string('student_id', 36).references('id').inTable('users').onDelete('CASCADE');
      table.string('status').defaultTo('enrolled'); // enrolled | dropped | completed
      table.float('grade').nullable();
      table.float('grade_point').nullable(); // GPA scale 0-20
      table.timestamp('enrolled_at').defaultTo(knex.fn.now());
      table.timestamp('dropped_at').nullable();
      table.unique(['course_id', 'student_id']);
    });
  }

  // ── Academic Calendar (تقویم آموزشی) ──
  const hasAcademicEvents = await knex.schema.hasTable('academic_events');
  if (!hasAcademicEvents) {
    await knex.schema.createTable('academic_events', (table) => {
      table.string('id', 36).primary();
      table.string('title').notNullable();
      table.text('description');
      table.string('event_type').notNullable(); // semester_start | exam_start | holiday | enrollment | drop_add
      table.date('start_date').notNullable();
      table.date('end_date');
      table.string('semester');
      table.boolean('is_important').defaultTo(false);
      table.timestamp('created_at').defaultTo(knex.fn.now());
    });
  }

  // ── Feedback & Suggestions (پیشنهادات و انتقادات — ناشناس با کد پیگیری) ──
  const hasFeedback = await knex.schema.hasTable('feedback');
  if (!hasFeedback) {
    await knex.schema.createTable('feedback', (table) => {
      table.string('id', 36).primary();
      table.string('tracking_code').unique().notNullable(); // شماره پیگیری
      table.string('category').defaultTo('general'); // general | educational | facility | complaint
      table.text('message').notNullable();
      table.text('response');
      table.string('status').defaultTo('pending'); // pending | in_progress | resolved
      table.string('submitted_by', 36).references('id').inTable('users').onDelete('SET NULL');
      table.boolean('is_anonymous').defaultTo(true);
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('responded_at');
    });
  }
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('feedback');
  await knex.schema.dropTableIfExists('academic_events');
  await knex.schema.dropTableIfExists('course_enrollments');
  await knex.schema.dropTableIfExists('courses');
};
