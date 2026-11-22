/**
 * Migration 023: Persist class rosters as dedicated group records in the database
 * (`class_roster_groups`) synchronized with `classes` and `class_members`.
 */
exports.up = async function up(knex) {
  const hasTable = await knex.schema.hasTable('class_roster_groups');
  if (!hasTable) {
    await knex.schema.createTable('class_roster_groups', (table) => {
      table.uuid('id').primary();
      table.uuid('class_id').notNullable().unique().references('id').inTable('classes').onDelete('CASCADE');
      table.string('school_id', 100).index();
      table.uuid('teacher_id').index();
      table.string('group_name', 255).notNullable();
      table.string('grade', 120);
      table.string('major', 120);
      table.text('member_user_ids').notNullable().defaultTo('[]');
      table.text('members_snapshot').notNullable().defaultTo('[]');
      table.integer('member_count').notNullable().defaultTo(0);
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());
    });
  }
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('class_roster_groups');
};
