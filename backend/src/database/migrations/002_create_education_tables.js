/**
 * Migration: Create educational module tables (SQLite-compatible)
 */
exports.up = async function (knex) {
  // ── Assignments ──
  await knex.schema.createTable('assignments', (table) => {
    table.string('id', 36).primary();
    table.string('class_id', 36).references('id').inTable('classes').onDelete('CASCADE');
    table.string('teacher_id', 36).references('id').inTable('users').onDelete('CASCADE');
    table.string('title').notNullable();
    table.text('description');
    table.timestamp('due_date');
    table.boolean('allow_late').defaultTo(false);
    table.text('attachments').defaultTo('[]');
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });

  // ── Submissions ──
  await knex.schema.createTable('submissions', (table) => {
    table.string('id', 36).primary();
    table.string('assignment_id', 36).references('id').inTable('assignments').onDelete('CASCADE');
    table.string('student_id', 36).references('id').inTable('users').onDelete('CASCADE');
    table.text('files').defaultTo('[]');
    table.text('student_note');
    table.decimal('grade', 5, 2);
    table.text('feedback_text');
    table.string('feedback_audio_url');
    table.string('status').defaultTo('submitted'); // submitted | graded | late | missing
    table.timestamp('submitted_at').defaultTo(knex.fn.now());
    table.timestamp('graded_at');
    table.unique(['assignment_id', 'student_id']);
  });

  // ── Quizzes ──
  await knex.schema.createTable('quizzes', (table) => {
    table.string('id', 36).primary();
    table.string('class_id', 36).references('id').inTable('classes').onDelete('CASCADE');
    table.string('teacher_id', 36).references('id').inTable('users').onDelete('CASCADE');
    table.string('title').notNullable();
    table.integer('duration_minutes').defaultTo(30);
    table.timestamp('start_time');
    table.timestamp('end_time');
    table.boolean('is_published').defaultTo(false);
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });

  // ── Quiz Questions ──
  await knex.schema.createTable('quiz_questions', (table) => {
    table.string('id', 36).primary();
    table.string('quiz_id', 36).references('id').inTable('quizzes').onDelete('CASCADE');
    table.text('question_text').notNullable();
    table.string('question_image_url');
    table.text('options').notNullable(); // JSON string
    table.string('correct_option').notNullable();
    table.integer('points').defaultTo(1);
    table.integer('order_index').defaultTo(0);
  });

  // ── Quiz Attempts ──
  await knex.schema.createTable('quiz_attempts', (table) => {
    table.string('id', 36).primary();
    table.string('quiz_id', 36).references('id').inTable('quizzes').onDelete('CASCADE');
    table.string('student_id', 36).references('id').inTable('users').onDelete('CASCADE');
    table.text('answers').defaultTo('{}');
    table.integer('score').defaultTo(0);
    table.integer('total_points').defaultTo(0);
    table.timestamp('started_at').defaultTo(knex.fn.now());
    table.timestamp('completed_at');
    table.unique(['quiz_id', 'student_id']);
  });

  // ── Attendance Sessions ──
  await knex.schema.createTable('attendance_sessions', (table) => {
    table.string('id', 36).primary();
    table.string('class_id', 36).references('id').inTable('classes').onDelete('CASCADE');
    table.string('teacher_id', 36).references('id').inTable('users').onDelete('CASCADE');
    table.string('session_code').notNullable();
    table.timestamp('opens_at').defaultTo(knex.fn.now());
    table.timestamp('closes_at');
    table.string('status').defaultTo('active'); // active | closed
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });

  // ── Attendance Records ──
  await knex.schema.createTable('attendance_records', (table) => {
    table.string('id', 36).primary();
    table.string('session_id', 36).references('id').inTable('attendance_sessions').onDelete('CASCADE');
    table.string('student_id', 36).references('id').inTable('users').onDelete('CASCADE');
    table.string('status').defaultTo('present'); // present | absent | late
    table.timestamp('recorded_at').defaultTo(knex.fn.now());
    table.unique(['session_id', 'student_id']);
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('attendance_records');
  await knex.schema.dropTableIfExists('attendance_sessions');
  await knex.schema.dropTableIfExists('quiz_attempts');
  await knex.schema.dropTableIfExists('quiz_questions');
  await knex.schema.dropTableIfExists('quizzes');
  await knex.schema.dropTableIfExists('submissions');
  await knex.schema.dropTableIfExists('assignments');
};
