/**
 * Migration 009: Add Mandatory Announcement Acknowledgements and Multi-class/Parent Targeting
 */
exports.up = async function (knex) {
  // ── Extend announcements table ──
  const hasTargetAudience = await knex.schema.hasColumn('announcements', 'target_audience');
  if (!hasTargetAudience) {
    await knex.schema.table('announcements', (table) => {
      table.string('target_audience').defaultTo('all'); // all | students | parents
      table.text('target_class_ids').defaultTo('[]'); // JSON array of class IDs, or ["*"] for all
      table.boolean('is_mandatory').defaultTo(true); // Requires confirmation before accessing panel
      table.string('priority').defaultTo('important'); // normal | important | urgent
    });
  }

  // ── Create announcement_acknowledgements table ──
  const hasAcknowledgements = await knex.schema.hasTable('announcement_acknowledgements');
  if (!hasAcknowledgements) {
    await knex.schema.createTable('announcement_acknowledgements', (table) => {
      table.string('id', 36).primary();
      table.string('announcement_id', 36).references('id').inTable('announcements').onDelete('CASCADE');
      table.string('user_id', 36).references('id').inTable('users').onDelete('CASCADE');
      table.string('role', 20); // student | parent
      table.timestamp('acknowledged_at').defaultTo(knex.fn.now());
      table.unique(['announcement_id', 'user_id']);
    });
  }
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('announcement_acknowledgements');
  const hasTargetAudience = await knex.schema.hasColumn('announcements', 'target_audience');
  if (hasTargetAudience) {
    await knex.schema.table('announcements', (table) => {
      table.dropColumn('target_audience');
      table.dropColumn('target_class_ids');
      table.dropColumn('is_mandatory');
      table.dropColumn('priority');
    });
  }
};
