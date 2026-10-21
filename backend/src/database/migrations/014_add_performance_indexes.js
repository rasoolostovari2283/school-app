/**
 * Migration 012: Add high-performance indexes for heavy concurrent load.
 * Optimizes foreign key lookups, filtering, and ordering to prevent table locks and slow queries.
 */

const indexes = [
  // Users table
  { table: 'users', name: 'idx_users_role', columns: ['role'] },
  { table: 'users', name: 'idx_users_phone', columns: ['phone'] },

  // Direct Messages
  { table: 'messages', name: 'idx_messages_sender_receiver_date', columns: ['sender_id', 'receiver_id', 'sent_at'] },
  { table: 'messages', name: 'idx_messages_receiver_read', columns: ['receiver_id', 'is_read'] },
  { table: 'messages', name: 'idx_messages_class', columns: ['class_id'] },

  // Group Messages
  { table: 'message_group_messages', name: 'idx_mgm_group_sent', columns: ['group_id', 'sent_at'] },
  { table: 'message_group_messages', name: 'idx_mgm_sender', columns: ['sender_id'] },
  { table: 'message_group_members', name: 'idx_mgm_group_user', columns: ['group_id', 'user_id'] },
  { table: 'message_group_members', name: 'idx_mgm_user', columns: ['user_id'] },

  // Notifications
  { table: 'notifications', name: 'idx_notifications_user_read', columns: ['user_id', 'is_read'] },
  { table: 'notifications', name: 'idx_notifications_user_created', columns: ['user_id', 'created_at'] },

  // Assignments & Submissions
  { table: 'assignments', name: 'idx_assignments_class_due', columns: ['class_id', 'due_date'] },
  { table: 'assignments', name: 'idx_assignments_teacher', columns: ['teacher_id'] },
  { table: 'submissions', name: 'idx_submissions_assign_student', columns: ['assignment_id', 'student_id'] },
  { table: 'submissions', name: 'idx_submissions_student', columns: ['student_id'] },

  // Attendance
  { table: 'attendance_sessions', name: 'idx_att_sess_class', columns: ['class_id'] },
  { table: 'attendance_sessions', name: 'idx_att_sess_teacher', columns: ['teacher_id'] },
  { table: 'attendance_records', name: 'idx_att_rec_sess_student', columns: ['session_id', 'student_id'] },
  { table: 'attendance_records', name: 'idx_att_rec_student', columns: ['student_id'] },

  // Gradebook
  { table: 'gradebook_categories', name: 'idx_gb_cat_class', columns: ['class_id'] },
  { table: 'gradebook_scores', name: 'idx_gb_scores_cat_student', columns: ['category_id', 'student_id'] },
  { table: 'gradebook_scores', name: 'idx_gb_scores_student', columns: ['student_id'] },

  // Schedules & Classes
  { table: 'weekly_schedules', name: 'idx_ws_class_day', columns: ['class_id', 'day_of_week'] },
  { table: 'weekly_schedules', name: 'idx_ws_teacher_day', columns: ['teacher_id', 'day_of_week'] },
  { table: 'classes', name: 'idx_classes_school_teacher', columns: ['school_id', 'teacher_id'] },
  { table: 'classes', name: 'idx_classes_teacher', columns: ['teacher_id'] },

  // Enrollments & Parent Links
  { table: 'course_enrollments', name: 'idx_enroll_student_course', columns: ['student_id', 'course_id'] },
  { table: 'parent_student_links', name: 'idx_psl_parent', columns: ['parent_id'] },
  { table: 'parent_student_links', name: 'idx_psl_student', columns: ['student_id'] },

  // Tickets & Counseling & Discipline
  { table: 'school_tickets', name: 'idx_tickets_user_status', columns: ['user_id', 'status'] },
  { table: 'school_tickets', name: 'idx_tickets_assigned', columns: ['assigned_to'] },
  { table: 'school_ticket_messages', name: 'idx_ticket_msgs_ticket', columns: ['ticket_id'] },
  { table: 'study_logs', name: 'idx_study_logs_student_date', columns: ['student_id', 'date'] },
  { table: 'counseling_cases', name: 'idx_counseling_student', columns: ['student_id'] },
  { table: 'counseling_cases', name: 'idx_counseling_counselor', columns: ['counselor_id'] },
  { table: 'discipline_records', name: 'idx_discipline_student', columns: ['student_id'] },
  { table: 'academic_events', name: 'idx_events_dates', columns: ['start_date', 'end_date'] },
];

exports.up = async function (knex) {
  for (const item of indexes) {
    const hasTable = await knex.schema.hasTable(item.table);
    if (!hasTable) continue;

    const cols = item.columns.join(', ');
    const query = `CREATE INDEX IF NOT EXISTS ${item.name} ON ${item.table} (${cols});`;
    await knex.raw(query);
  }
};

exports.down = async function (knex) {
  for (const item of indexes) {
    const hasTable = await knex.schema.hasTable(item.table);
    if (!hasTable) continue;

    const query = `DROP INDEX IF EXISTS ${item.name};`;
    await knex.raw(query);
  }
};
