/**
 * Migration 013: Add website to schools and create system_settings table
 */
exports.up = async function (knex) {
  const hasWebsite = await knex.schema.hasColumn('schools', 'website');
  if (!hasWebsite) {
    await knex.schema.table('schools', (table) => {
      table.string('website');
    });
  }

  const hasSettings = await knex.schema.hasTable('system_settings');
  if (!hasSettings) {
    await knex.schema.createTable('system_settings', (table) => {
      table.string('key', 100).primary();
      table.text('value');
      table.timestamp('updated_at').defaultTo(knex.fn.now());
    });
  }
};

exports.down = async function (knex) {
  const hasWebsite = await knex.schema.hasColumn('schools', 'website');
  if (hasWebsite) {
    await knex.schema.table('schools', (table) => {
      table.dropColumn('website');
    });
  }

  await knex.schema.dropTableIfExists('system_settings');
};
