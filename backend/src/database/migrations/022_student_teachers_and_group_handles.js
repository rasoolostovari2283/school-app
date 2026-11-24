/**
 * Migration 022:
 * 1. Create `student_teacher_links` table to persist student -> selected teacher relationships
 *    under each school (with grade, major, and linked class_id).
 * 2. Add `major` column to `classes` so teacher rosters organize cleanly by grade + major + teacher.
 * 3. Add `school_id`, `group_handle`, and `invite_code` columns to `message_groups` so groups
 *    have persistent searchable IDs/handles and invite links scoped strictly per school.
 */

const crypto = require('crypto');

function makeFallbackHandle(id) {
  const clean = String(id || '').replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 8);
  const rand = crypto.randomBytes(2).toString('hex');
  return `grp_${clean || 'school'}_${rand}`;
}

function makeFallbackInviteCode() {
  return crypto.randomBytes(6).toString('hex').toUpperCase();
}

exports.up = async function up(knex) {
  // 1. student_teacher_links table
  const hasLinksTable = await knex.schema.hasTable('student_teacher_links');
  if (!hasLinksTable) {
    await knex.schema.createTable('student_teacher_links', (t) => {
      t.string('id', 64).primary();
      t.string('school_id', 64).notNullable().index();
      t.string('student_user_id', 64).notNullable().index();
      t.string('teacher_user_id', 64).notNullable().index();
      t.string('class_id', 64).nullable().index();
      t.string('education_level', 120).nullable();
      t.string('grade', 120).nullable();
      t.string('major', 120).nullable();
      t.timestamp('created_at').defaultTo(knex.fn.now());
      t.timestamp('updated_at').defaultTo(knex.fn.now());

      t.unique(['student_user_id', 'teacher_user_id']);
    });
  }

  // 2. Add `major` to `classes` if missing
  const hasClassesTable = await knex.schema.hasTable('classes');
  if (hasClassesTable) {
    const hasMajor = await knex.schema.hasColumn('classes', 'major');
    if (!hasMajor) {
      await knex.schema.alterTable('classes', (t) => {
        t.string('major', 120).nullable();
      });
    }
  }

  // 3. Add `school_id`, `group_handle`, and `invite_code` to `message_groups` if missing
  const hasGroupsTable = await knex.schema.hasTable('message_groups');
  if (hasGroupsTable) {
    const hasSchoolId = await knex.schema.hasColumn('message_groups', 'school_id');
    const hasGroupHandle = await knex.schema.hasColumn('message_groups', 'group_handle');
    const hasInviteCode = await knex.schema.hasColumn('message_groups', 'invite_code');

    if (!hasSchoolId || !hasGroupHandle || !hasInviteCode) {
      await knex.schema.alterTable('message_groups', (t) => {
        if (!hasSchoolId) t.string('school_id', 64).nullable().index();
        if (!hasGroupHandle) t.string('group_handle', 80).nullable();
        if (!hasInviteCode) t.string('invite_code', 40).nullable();
      });
    }

    // Backfill existing message_groups rows with school_id, group_handle, and invite_code
    const existingGroups = await knex('message_groups').select('id', 'created_by', 'school_id', 'group_handle', 'invite_code');
    for (const grp of existingGroups) {
      const updates = {};
      if (!grp.school_id && grp.created_by) {
        const creator = await knex('users').where({ id: grp.created_by }).select('school_id').first();
        if (creator?.school_id) updates.school_id = creator.school_id;
      }
      if (!grp.group_handle) {
        updates.group_handle = makeFallbackHandle(grp.id);
      }
      if (!grp.invite_code) {
        updates.invite_code = makeFallbackInviteCode();
      }
      if (Object.keys(updates).length > 0) {
        await knex('message_groups').where({ id: grp.id }).update(updates);
      }
    }
  }
};

exports.down = async function down(knex) {
  const hasLinksTable = await knex.schema.hasTable('student_teacher_links');
  if (hasLinksTable) {
    await knex.schema.dropTable('student_teacher_links');
  }
};
