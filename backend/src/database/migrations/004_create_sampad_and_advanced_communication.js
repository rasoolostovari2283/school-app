/**
 * Migration 004: Create Sampad Elite Modules & Advanced Communication
 * - Study planner & test tracking (دفتر برنامه‌ریزی و مطالعه سمپاد)
 * - Message groups & group chat (چت گروهی)
 * - Call sessions & call logs (تماس صوتی و تصویری)
 * - User personnel / student codes (کد پرسنلی و کد دانش‌آموزی)
 */
exports.up = async function (knex) {
  // ── Extend users with personnel_code, student_code, department, job_title ──
  const hasPersonnelCode = await knex.schema.hasColumn('users', 'personnel_code');
  if (!hasPersonnelCode) {
    await knex.schema.table('users', (table) => {
      table.string('personnel_code');
      table.string('student_code');
      table.string('department');
      table.string('job_title');
    });
  }

  // ── Study Planner Logs (دفتر برنامه‌ریزی سمپاد) ──
  const hasStudyLogs = await knex.schema.hasTable('study_logs');
  if (!hasStudyLogs) {
    await knex.schema.createTable('study_logs', (table) => {
      table.string('id', 36).primary();
      table.string('student_id', 36).references('id').inTable('users').onDelete('CASCADE');
      table.string('date', 10).notNullable(); // YYYY-MM-DD
      table.string('subject').notNullable(); // ریاضی، فیزیک، زیست و...
      table.integer('study_minutes_descriptive').defaultTo(0); // مطالعه تشریحی
      table.integer('study_minutes_test').defaultTo(0); // تست‌زنی
      table.integer('tests_count').defaultTo(0); // کل تست‌ها
      table.integer('tests_correct').defaultTo(0); // درست
      table.integer('tests_wrong').defaultTo(0); // غلط
      table.integer('satisfaction_score').defaultTo(4); // ۱ تا ۵
      table.text('student_notes');
      table.text('advisor_feedback');
      table.string('advisor_id', 36).references('id').inTable('users').onDelete('SET NULL');
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());
    });
  }

  // ── Message Groups (گروه‌های گفتگوی مدرسه) ──
  const hasMessageGroups = await knex.schema.hasTable('message_groups');
  if (!hasMessageGroups) {
    await knex.schema.createTable('message_groups', (table) => {
      table.string('id', 36).primary();
      table.string('name').notNullable();
      table.string('description');
      table.string('category').defaultTo('general'); // council (شورای دبیران) | parents (انجمن اولیا) | olympiad (المپیاد) | class (کلاس)
      table.string('avatar_url');
      table.string('created_by', 36).references('id').inTable('users').onDelete('SET NULL');
      table.timestamp('created_at').defaultTo(knex.fn.now());
    });
  }

  // ── Message Group Members ──
  const hasGroupMembers = await knex.schema.hasTable('message_group_members');
  if (!hasGroupMembers) {
    await knex.schema.createTable('message_group_members', (table) => {
      table.string('id', 36).primary();
      table.string('group_id', 36).references('id').inTable('message_groups').onDelete('CASCADE');
      table.string('user_id', 36).references('id').inTable('users').onDelete('CASCADE');
      table.string('role').defaultTo('member'); // admin | member
      table.timestamp('joined_at').defaultTo(knex.fn.now());
      table.unique(['group_id', 'user_id']);
    });
  }

  // ── Group Messages ──
  const hasGroupMessages = await knex.schema.hasTable('message_group_messages');
  if (!hasGroupMessages) {
    await knex.schema.createTable('message_group_messages', (table) => {
      table.string('id', 36).primary();
      table.string('group_id', 36).references('id').inTable('message_groups').onDelete('CASCADE');
      table.string('sender_id', 36).references('id').inTable('users').onDelete('CASCADE');
      table.text('content');
      table.text('attachments').defaultTo('[]');
      table.timestamp('sent_at').defaultTo(knex.fn.now());
    });
  }

  // ── Call Sessions (تماس صوتی و تصویری درون‌برنامه‌ای) ──
  const hasCallSessions = await knex.schema.hasTable('call_sessions');
  if (!hasCallSessions) {
    await knex.schema.createTable('call_sessions', (table) => {
      table.string('id', 36).primary();
      table.string('caller_id', 36).references('id').inTable('users').onDelete('CASCADE');
      table.string('receiver_id', 36).references('id').inTable('users').onDelete('SET NULL');
      table.string('group_id', 36).references('id').inTable('message_groups').onDelete('SET NULL');
      table.string('call_type').notNullable(); // audio | video
      table.string('status').defaultTo('ended'); // active | ended | rejected | missed
      table.integer('duration_seconds').defaultTo(0);
      table.timestamp('started_at').defaultTo(knex.fn.now());
      table.timestamp('ended_at');
    });
  }

  // ── Quizzes Negative Marking Option ──
  const hasNegativeMarking = await knex.schema.hasColumn('quizzes', 'has_negative_marking');
  if (!hasNegativeMarking) {
    await knex.schema.table('quizzes', (table) => {
      table.boolean('has_negative_marking').defaultTo(false);
      table.text('diagnostic_topics').defaultTo('[]');
    });
  }
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('call_sessions');
  await knex.schema.dropTableIfExists('message_group_messages');
  await knex.schema.dropTableIfExists('message_group_members');
  await knex.schema.dropTableIfExists('message_groups');
  await knex.schema.dropTableIfExists('study_logs');
};
