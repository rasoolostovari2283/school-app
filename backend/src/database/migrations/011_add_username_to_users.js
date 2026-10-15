const { generateUniqueUsername } = require('../../utils/usernameHelper');

exports.up = async function (knex) {
  const hasUsername = await knex.schema.hasColumn('users', 'username');
  if (!hasUsername) {
    await knex.schema.table('users', (table) => {
      table.string('username').unique();
    });
  }

  // Backfill existing users who don't have a username yet
  const usersWithoutUsername = await knex('users')
    .whereNull('username')
    .orWhere('username', '')
    .select('id', 'display_name');

  for (const user of usersWithoutUsername) {
    const username = await generateUniqueUsername(knex, user.display_name, user.id);
    await knex('users').where({ id: user.id }).update({ username });
  }
};

exports.down = async function (knex) {
  const hasUsername = await knex.schema.hasColumn('users', 'username');
  if (hasUsername) {
    await knex.schema.table('users', (table) => {
      table.dropColumn('username');
    });
  }
};
