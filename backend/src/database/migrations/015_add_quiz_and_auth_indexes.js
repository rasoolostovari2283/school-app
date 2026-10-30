/**
 * Migration 015: Add indexes for quizzes, quiz attempts, class members, and user lookup.
 * Eliminates sequential table scans under high concurrent student/teacher loads.
 */

const indexes = [
  // Quizzes & Questions
  { table: 'quizzes', name: 'idx_quizzes_class_created', columns: ['class_id', 'created_at'] },
  { table: 'quizzes', name: 'idx_quizzes_teacher', columns: ['teacher_id'] },
  { table: 'quiz_questions', name: 'idx_quiz_questions_quiz_order', columns: ['quiz_id', 'order_index'] },
  { table: 'quiz_attempts', name: 'idx_quiz_attempts_quiz_student', columns: ['quiz_id', 'student_id'] },

  // Class Memberships
  { table: 'class_members', name: 'idx_class_members_user_class', columns: ['user_id', 'class_id'] },
  { table: 'class_members', name: 'idx_class_members_class', columns: ['class_id'] },

  // Users & Identification
  { table: 'users', name: 'idx_users_username', columns: ['username'] },
  { table: 'users', name: 'idx_users_student_code', columns: ['student_code'] },
  { table: 'users', name: 'idx_users_email', columns: ['email'] },

  // Announcements
  { table: 'announcements', name: 'idx_announcements_class_pinned_created', columns: ['class_id', 'is_pinned', 'created_at'] },
];

exports.up = async function (knex) {
  for (const item of indexes) {
    const hasTable = await knex.schema.hasTable(item.table);
    if (!hasTable) continue;

    // Verify all columns exist on the table before creating index
    let allColsExist = true;
    for (const col of item.columns) {
      const hasCol = await knex.schema.hasColumn(item.table, col);
      if (!hasCol) {
        allColsExist = false;
        break;
      }
    }
    if (!allColsExist) continue;

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
