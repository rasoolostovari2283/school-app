/**
 * Migration 006: Create Enterprise School Management System Tables
 * 1. Gradebook & weighted transcripts (دفتر نمرات با ضرایب و معدل وزنی)
 * 2. Weekly schedule & timetable with conflict detection (برنامه هفتگی و ساعات کلاسی)
 * 3. Discipline & behavioral records (کارت‌های تشویق/تذکر و انضباط)
 * 4. Counseling & advisory cases (پرونده مشاوره تحصیلی و رفتاری)
 * 5. Tuition, installments & financial receipts (مدیریت مالی، اقساط و فیش‌های واریزی)
 * 6. Internal ticketing system (سیستم تیکتینگ رسمی مدرسه)
 * 7. Attendance enhancements (تأخیر، موجه، هشدار غیبت‌های متوالی)
 */
exports.up = async function (knex) {
  // ── 1. Attendance Enhancements ──
  const hasExcuse = await knex.schema.hasColumn('attendance_records', 'excuse_reason');
  if (!hasExcuse) {
    await knex.schema.table('attendance_records', (table) => {
      table.string('excuse_reason');
      table.boolean('is_excused').defaultTo(false);
      table.boolean('notified_parent').defaultTo(false);
    });
  }

  // ── 2. Gradebook Categories (انواع ارزیابی و ضرایب) ──
  const hasGradeCats = await knex.schema.hasTable('gradebook_categories');
  if (!hasGradeCats) {
    await knex.schema.createTable('gradebook_categories', (table) => {
      table.string('id', 36).primary();
      table.string('class_id', 36).references('id').inTable('classes').onDelete('CASCADE');
      table.string('title').notNullable(); // مستمر نوبت اول، پایانی، فعالیت کلاسی، پروژه
      table.float('weight').defaultTo(1.0); // ضریب ارزشیابی (مثلا ۰.۵، ۱، ۲)
      table.float('max_score').defaultTo(20.0);
      table.string('term').defaultTo('term1'); // term1 | midterm | term2
      table.timestamp('created_at').defaultTo(knex.fn.now());
    });
  }

  // ── Gradebook Scores (نمرات ثبت‌شده دانش‌آموزان) ──
  const hasGradeScores = await knex.schema.hasTable('gradebook_scores');
  if (!hasGradeScores) {
    await knex.schema.createTable('gradebook_scores', (table) => {
      table.string('id', 36).primary();
      table.string('category_id', 36).references('id').inTable('gradebook_categories').onDelete('CASCADE');
      table.string('student_id', 36).references('id').inTable('users').onDelete('CASCADE');
      table.float('score').notNullable();
      table.text('teacher_comment');
      table.timestamp('graded_at').defaultTo(knex.fn.now());
      table.unique(['category_id', 'student_id']);
    });
  }

  // ── 3. Weekly Schedule (برنامه هفتگی و ساعات تدریس) ──
  const hasWeekly = await knex.schema.hasTable('weekly_schedules');
  if (!hasWeekly) {
    await knex.schema.createTable('weekly_schedules', (table) => {
      table.string('id', 36).primary();
      table.string('class_id', 36).references('id').inTable('classes').onDelete('CASCADE');
      table.string('teacher_id', 36).references('id').inTable('users').onDelete('CASCADE');
      table.string('subject').notNullable();
      table.integer('day_of_week').notNullable(); // 0 = شنبه, 1 = یکشنبه, ..., 5 = پنج‌شنبه
      table.integer('period_number').notNullable(); // ۱ تا ۶
      table.string('start_time', 10).notNullable(); // "07:45"
      table.string('end_time', 10).notNullable();   // "09:15"
      table.string('room').defaultTo('کلاس اصلی');
      table.timestamp('created_at').defaultTo(knex.fn.now());
      // Unique per class period
      table.unique(['class_id', 'day_of_week', 'period_number']);
    });
  }

  // ── 4. Discipline Records (سوابق انضباطی، کارت‌های تشویق و تذکر) ──
  const hasDiscipline = await knex.schema.hasTable('discipline_records');
  if (!hasDiscipline) {
    await knex.schema.createTable('discipline_records', (table) => {
      table.string('id', 36).primary();
      table.string('student_id', 36).references('id').inTable('users').onDelete('CASCADE');
      table.string('issuer_id', 36).references('id').inTable('users').onDelete('SET NULL');
      table.string('type').notNullable(); // reward (تشویق) | warning (تذکر) | deduction (کسر امتیاز)
      table.string('category').defaultTo('general'); // academic | ethics | punctuality | olympiad
      table.string('title').notNullable();
      table.text('description');
      table.float('points').defaultTo(0); // مثلا +۲ برای المپیاد، -۱ برای تأخیر
      table.string('date', 10).notNullable();
      table.boolean('is_parent_viewable').defaultTo(true);
      table.timestamp('created_at').defaultTo(knex.fn.now());
    });
  }

  // ── 5. Counseling Records (پرونده و جلسات مشاوره) ──
  const hasCounseling = await knex.schema.hasTable('counseling_cases');
  if (!hasCounseling) {
    await knex.schema.createTable('counseling_cases', (table) => {
      table.string('id', 36).primary();
      table.string('student_id', 36).references('id').inTable('users').onDelete('CASCADE');
      table.string('counselor_id', 36).references('id').inTable('users').onDelete('SET NULL');
      table.string('session_title').notNullable();
      table.string('session_date', 10).notNullable();
      table.text('student_concerns'); // مسائل مطرح‌شده توسط دانش‌آموز
      table.text('counselor_notes'); // ارزیابی مشاور
      table.text('recommendations'); // راهکارهای ارائه شده
      table.string('follow_up_date', 10);
      table.string('status').defaultTo('completed'); // scheduled | completed | follow_up_needed
      table.boolean('shared_with_parent').defaultTo(true);
      table.timestamp('created_at').defaultTo(knex.fn.now());
    });
  }

  // ── 6. Tuition & Financial Management (مدیریت مالی و اقساط شهریه) ──
  const hasTuition = await knex.schema.hasTable('tuition_ledgers');
  if (!hasTuition) {
    await knex.schema.createTable('tuition_ledgers', (table) => {
      table.string('id', 36).primary();
      table.string('student_id', 36).references('id').inTable('users').onDelete('CASCADE');
      table.string('academic_year').defaultTo('۱۴۰۳-۱۴۰۴');
      table.integer('total_amount').notNullable(); // مبلغ کل شهریه به ریال یا تومان
      table.integer('discount_amount').defaultTo(0); // تخفیف نخبگان/سمپاد
      table.string('discount_reason');
      table.integer('paid_amount').defaultTo(0);
      table.integer('balance').notNullable(); // مانده بدهی
      table.string('status').defaultTo('unpaid'); // settled | partial | unpaid
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.unique(['student_id', 'academic_year']);
    });
  }

  const hasInstallments = await knex.schema.hasTable('tuition_installments');
  if (!hasInstallments) {
    await knex.schema.createTable('tuition_installments', (table) => {
      table.string('id', 36).primary();
      table.string('ledger_id', 36).references('id').inTable('tuition_ledgers').onDelete('CASCADE');
      table.integer('installment_number').notNullable(); // قسط ۱، ۲، ۳...
      table.string('title').notNullable(); // شهریه پیش‌ثبت‌نام، قسط آبان و...
      table.integer('amount').notNullable();
      table.string('due_date', 10).notNullable(); // تاریخ سررسید
      table.string('status').defaultTo('pending'); // pending | submitted | verified | overdue
      table.string('receipt_url'); // فیش واریزی
      table.string('tracking_number'); // شماره پیگیری بانکی
      table.string('bank_name');
      table.string('paid_at', 10);
      table.string('verified_by', 36).references('id').inTable('users').onDelete('SET NULL');
      table.timestamp('created_at').defaultTo(knex.fn.now());
    });
  }

  // ── 7. Internal School Ticketing (سیستم تیکتینگ رسمی) ──
  const hasTickets = await knex.schema.hasTable('school_tickets');
  if (!hasTickets) {
    await knex.schema.createTable('school_tickets', (table) => {
      table.string('id', 36).primary();
      table.string('ticket_number', 20).unique().notNullable(); // e.g. TCK-1403-102
      table.string('user_id', 36).references('id').inTable('users').onDelete('CASCADE');
      table.string('department').notNullable(); // educational | financial | discipline | counseling | principal
      table.string('priority').defaultTo('normal'); // low | normal | high | urgent
      table.string('subject').notNullable();
      table.text('message').notNullable();
      table.string('status').defaultTo('open'); // open | in_progress | resolved | closed
      table.string('assigned_to', 36).references('id').inTable('users').onDelete('SET NULL');
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());
    });
  }

  const hasTicketMsgs = await knex.schema.hasTable('school_ticket_messages');
  if (!hasTicketMsgs) {
    await knex.schema.createTable('school_ticket_messages', (table) => {
      table.string('id', 36).primary();
      table.string('ticket_id', 36).references('id').inTable('school_tickets').onDelete('CASCADE');
      table.string('sender_id', 36).references('id').inTable('users').onDelete('CASCADE');
      table.text('message').notNullable();
      table.string('attachment_url');
      table.timestamp('created_at').defaultTo(knex.fn.now());
    });
  }
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('school_ticket_messages');
  await knex.schema.dropTableIfExists('school_tickets');
  await knex.schema.dropTableIfExists('tuition_installments');
  await knex.schema.dropTableIfExists('tuition_ledgers');
  await knex.schema.dropTableIfExists('counseling_cases');
  await knex.schema.dropTableIfExists('discipline_records');
  await knex.schema.dropTableIfExists('weekly_schedules');
  await knex.schema.dropTableIfExists('gradebook_scores');
  await knex.schema.dropTableIfExists('gradebook_categories');
};
