/**
 * Migration 010: Add target_grades and target_subjects to announcements
 */
exports.up = async function (knex) {
  const hasTargetGrades = await knex.schema.hasColumn('announcements', 'target_grades');
  if (!hasTargetGrades) {
    await knex.schema.table('announcements', (table) => {
      table.text('target_grades').defaultTo('[]');
      table.text('target_subjects').defaultTo('[]');
    });
  }
};

exports.down = async function (knex) {
  const hasTargetGrades = await knex.schema.hasColumn('announcements', 'target_grades');
  if (hasTargetGrades) {
    await knex.schema.table('announcements', (table) => {
      table.dropColumn('target_grades');
      table.dropColumn('target_subjects');
    });
  }
};
