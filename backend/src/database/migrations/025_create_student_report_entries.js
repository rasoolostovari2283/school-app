/**
 * Structured student report card entries per class, hierarchically linked:
 *   schools (school_id) -> users/teacher (teacher_id) -> classes (class_id) -> users/student (student_id)
 *
 * Stores the 3 formal evaluation scores (continuous, midterm, final),
 * auto-computed average_score, and the teacher-selected status from the
 * 6 official Persian status labels, synchronizing cleanly to Student & Parent panels.
 */
exports.up = async function (knex) {
  const exists = await knex.schema.hasTable('student_report_entries');
  if (!exists) {
    await knex.schema.createTable('student_report_entries', (table) => {
      table.uuid('id').primary();
      table.uuid('school_id').notNullable().references('id').inTable('schools').onDelete('CASCADE');
      table.uuid('teacher_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
      table.uuid('class_id').notNullable().references('id').inTable('classes').onDelete('CASCADE');
      table.uuid('student_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
      table.decimal('continuous_score', 5, 2).nullable();
      table.decimal('midterm_score', 5, 2).nullable();
      table.decimal('final_score', 5, 2).nullable();
      table.decimal('average_score', 5, 2).nullable();
      table.string('status', 60).nullable();
      table.text('teacher_note').nullable();
      table.uuid('updated_by').nullable().references('id').inTable('users').onDelete('SET NULL');
      table.timestamps(true, true);

      table.unique(['class_id', 'student_id']);
      table.index(['school_id']);
      table.index(['teacher_id']);
      table.index(['class_id']);
      table.index(['student_id']);
    });
  }
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('student_report_entries');
};
