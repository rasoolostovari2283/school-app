/**
 * Migration 017 — Session & Refresh Token Revocation + Staff Role Support
 *
 * 1. Adds `users.token_version` (integer, default 0) to support instant
 *    user-wide session/token invalidation on password change, logout-all, or
 *    refresh token replay detection.
 * 2. Creates `revoked_tokens` table (`jti` primary key) to support single-use
 *    refresh token rotation and immediate access/refresh token revocation.
 */

exports.up = async function (knex) {
  const hasUsers = await knex.schema.hasTable('users');
  if (hasUsers) {
    const hasTokenVersion = await knex.schema.hasColumn('users', 'token_version');
    if (!hasTokenVersion) {
      await knex.schema.alterTable('users', (t) => {
        t.integer('token_version').notNullable().defaultTo(0);
      });
    }
  }

  const hasRevokedTokens = await knex.schema.hasTable('revoked_tokens');
  if (!hasRevokedTokens) {
    await knex.schema.createTable('revoked_tokens', (t) => {
      t.string('jti', 128).primary();
      t.string('user_id', 36).nullable().index();
      t.string('token_type', 20).notNullable().defaultTo('refresh');
      t.string('reason', 64).nullable();
      t.timestamp('expires_at').nullable();
      t.timestamp('revoked_at').notNullable().defaultTo(knex.fn.now());
    });
  }
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('revoked_tokens');

  const hasUsers = await knex.schema.hasTable('users');
  if (hasUsers) {
    const hasTokenVersion = await knex.schema.hasColumn('users', 'token_version');
    if (hasTokenVersion) {
      await knex.schema.alterTable('users', (t) => {
        t.dropColumn('token_version');
      });
    }
  }
};
