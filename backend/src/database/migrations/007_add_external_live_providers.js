/**
 * Migration 007: Add external live providers (Skyroom & BigBlueButton) configuration to classes
 */
exports.up = async function (knex) {
  const hasProvider = await knex.schema.hasColumn('classes', 'live_provider');
  if (!hasProvider) {
    await knex.schema.table('classes', (table) => {
      table.string('live_provider').defaultTo('native'); // native | skyroom | bigbluebutton
      table.string('skyroom_url');
      table.string('skyroom_api_key');
      table.string('bbb_server_url');
      table.string('bbb_secret');
      table.string('bbb_meeting_id');
    });
  }

  // Also add source column to videos table to know if a video was imported from Skyroom or BBB
  const hasSource = await knex.schema.hasColumn('videos', 'source_platform');
  if (!hasSource) {
    await knex.schema.table('videos', (table) => {
      table.string('source_platform').defaultTo('native'); // native | skyroom | bigbluebutton
      table.string('external_recording_id');
    });
  }
};

exports.down = async function (knex) {
  const hasProvider = await knex.schema.hasColumn('classes', 'live_provider');
  if (hasProvider) {
    await knex.schema.table('classes', (table) => {
      table.dropColumns('live_provider', 'skyroom_url', 'skyroom_api_key', 'bbb_server_url', 'bbb_secret', 'bbb_meeting_id');
    });
  }
};
