exports.up = async function (knex) {
  const hasSchoolId = await knex.schema.hasColumn('users', 'school_id');
  if (!hasSchoolId) {
    await knex.schema.table('users', (table) => {
      table.uuid('school_id').references('id').inTable('schools').onDelete('SET NULL');
    });
  }
};

exports.down = async function (knex) {
  const hasSchoolId = await knex.schema.hasColumn('users', 'school_id');
  if (hasSchoolId) {
    await knex.schema.table('users', (table) => {
      table.dropColumn('school_id');
    });
  }
};
