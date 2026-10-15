/**
 * Migration 008: Add edit and delete support for messages and group messages
 */
exports.up = async function (knex) {
  // Check and add is_edited & edited_at to messages table
  const hasMsgIsEdited = await knex.schema.hasColumn('messages', 'is_edited');
  if (!hasMsgIsEdited) {
    await knex.schema.table('messages', (table) => {
      table.boolean('is_edited').defaultTo(false);
      table.timestamp('edited_at').nullable();
    });
  }

  // Check and add is_edited & edited_at to message_group_messages table
  const hasGrpMsgIsEdited = await knex.schema.hasColumn('message_group_messages', 'is_edited');
  if (!hasGrpMsgIsEdited) {
    await knex.schema.table('message_group_messages', (table) => {
      table.boolean('is_edited').defaultTo(false);
      table.timestamp('edited_at').nullable();
    });
  }
};

exports.down = async function (knex) {
  const hasMsgIsEdited = await knex.schema.hasColumn('messages', 'is_edited');
  if (hasMsgIsEdited) {
    await knex.schema.table('messages', (table) => {
      table.dropColumns('is_edited', 'edited_at');
    });
  }

  const hasGrpMsgIsEdited = await knex.schema.hasColumn('message_group_messages', 'is_edited');
  if (hasGrpMsgIsEdited) {
    await knex.schema.table('message_group_messages', (table) => {
      table.dropColumns('is_edited', 'edited_at');
    });
  }
};
