/**
 * Two-school test fixture.
 *
 * Creates two independent tenants — School A and School B — each with one
 * admin, one teacher, one student and one parent, plus the classes, rosters,
 * gradebooks, tuition records and announcements the smoke tests rely on.
 *
 * Every user carries a populated `users.school_id`. This is deliberate: the
 * production seeds (`src/database/seeds/001_school_data.js`) leave that column
 * NULL, which silently disables the tenant branches in
 * `src/modules/classes/class.service.js` and would make cross-tenant tests
 * meaningless.
 */
const bcrypt = require('bcryptjs');

/** Password used by every fixture account. Deliberately NOT `123456`. */
const FIXTURE_PASSWORD = 'Fixture#2026!';

/** Cached bcrypt hash so re-seeding the fixture stays cheap. */
let cachedPasswordHash = null;

const SCHOOLS = {
  a: {
    id: 'school-a',
    name: 'دبیرستان الف',
    code: 'SCH-A',
    city: 'تهران',
  },
  b: {
    id: 'school-b',
    name: 'دبیرستان ب',
    code: 'SCH-B',
    city: 'تهران',
  },
};

const USERS = {
  a: {
    admin: 'a-admin',
    teacher: 'a-teacher',
    student: 'a-student',
    parent: 'a-parent',
  },
  b: {
    admin: 'b-admin',
    teacher: 'b-teacher',
    student: 'b-student',
    parent: 'b-parent',
  },
};

const CLASSES = {
  a: 'class-a',
  b: 'class-b',
};

const GRADEBOOK_CATEGORIES = {
  a: 'gb-category-a',
  b: 'gb-category-b',
};

const LEDGERS = {
  a: 'ledger-a',
  b: 'ledger-b',
};

const INSTALLMENTS = {
  a: 'installment-a-1',
  b: 'installment-b-1',
};

const ANNOUNCEMENTS = {
  a: 'announcement-a',
  b: 'announcement-b',
};

/**
 * Login identifier (e-mail) of a fixture user.
 * @param {'a'|'b'} school
 * @param {'admin'|'teacher'|'student'|'parent'} role
 */
const emailFor = (school, role) => `${school}.${role}@school.test`;

/**
 * Build the fixture rows.
 * @param {string} passwordHash - bcrypt hash shared by every fixture user
 */
function buildRows(passwordHash) {
  const user = (school, role, suffix) => ({
    id: USERS[school][role],
    email: emailFor(school, role),
    phone: `0912${school === 'a' ? '0000' : '1111'}${suffix}`,
    password_hash: passwordHash,
    role,
    display_name: `${school.toUpperCase()} ${role}`,
    username: `${school}_${role}`,
    school_id: SCHOOLS[school].id,
    personnel_code: role === 'student' || role === 'parent' ? null : `EMP-${school.toUpperCase()}-${suffix}`,
    student_code: role === 'student' ? `STD-${school.toUpperCase()}-${suffix}` : (role === 'parent' ? `STD-${school.toUpperCase()}-${suffix}` : null),
    department: 'پایه دهم',
    job_title: role === 'admin' ? 'مدیر مدرسه' : (role === 'teacher' ? 'دبیر' : (role === 'student' ? 'دانش‌آموز' : 'ولی')),
    locale: 'fa',
    is_verified: true,
    settings: JSON.stringify({ school_id: SCHOOLS[school].id, school_code: SCHOOLS[school].code }),
  });

  const schoolSettings = (school) => JSON.stringify({
    school_name: SCHOOLS[school].name,
    school_code: SCHOOLS[school].code,
  });

  const aStudent = {
    ...user('a', 'student', '1001'),
    student_code: 'STD-A-1001',
    department: 'پایه دهم',
  };
  const bStudent = {
    ...user('b', 'student', '2002'),
    student_code: 'STD-B-2002',
    department: 'پایه دهم',
  };
  const aParent = {
    ...user('a', 'parent', '1003'),
    student_code: 'STD-A-1001',
    department: 'پایه دهم',
  };
  const bParent = {
    ...user('b', 'parent', '2003'),
    student_code: 'STD-B-2002',
    department: 'پایه دهم',
  };

  return {
    schools: [
      { ...SCHOOLS.a },
      { ...SCHOOLS.b },
    ],

    users: [
      { ...user('a', 'admin', '0001'), settings: schoolSettings('a') },
      { ...user('a', 'teacher', '0002'), settings: schoolSettings('a') },
      aStudent,
      aParent,
      { ...user('b', 'admin', '0001'), settings: schoolSettings('b') },
      { ...user('b', 'teacher', '0002'), settings: schoolSettings('b') },
      bStudent,
      bParent,
    ],

    classes: [
      {
        id: CLASSES.a,
        name: 'کلاس الف',
        subject: 'ریاضی',
        grade: 'پایه دهم',
        join_code: 'JOIN-A-0001',
        school_id: SCHOOLS.a.id,
        teacher_id: USERS.a.teacher,
        is_active: true,
      },
      {
        id: CLASSES.b,
        name: 'کلاس ب',
        subject: 'فیزیک',
        grade: 'پایه دهم',
        join_code: 'JOIN-B-0001',
        school_id: SCHOOLS.b.id,
        teacher_id: USERS.b.teacher,
        is_active: true,
      },
    ],

    classMembers: [
      { id: 'member-a-student', class_id: CLASSES.a, user_id: USERS.a.student, role: 'student' },
      { id: 'member-b-student', class_id: CLASSES.b, user_id: USERS.b.student, role: 'student' },
    ],

    parentStudentLinks: [
      { id: 'link-a-parent', parent_id: USERS.a.parent, student_id: USERS.a.student, relation: 'guardian', is_verified: true },
      { id: 'link-b-parent', parent_id: USERS.b.parent, student_id: USERS.b.student, relation: 'guardian', is_verified: true },
    ],

    gradebookCategories: [
      { id: GRADEBOOK_CATEGORIES.a, class_id: CLASSES.a, title: 'ارزشیابی مستمر', weight: 1.0, max_score: 20.0, term: 'term1' },
      { id: GRADEBOOK_CATEGORIES.b, class_id: CLASSES.b, title: 'ارزشیابی مستمر', weight: 1.0, max_score: 20.0, term: 'term1' },
    ],

    gradebookScores: [
      { id: 'score-a-1', category_id: GRADEBOOK_CATEGORIES.a, student_id: USERS.a.student, score: 18 },
      { id: 'score-b-1', category_id: GRADEBOOK_CATEGORIES.b, student_id: USERS.b.student, score: 15 },
    ],

    tuitionLedgers: [
      {
        id: LEDGERS.a,
        student_id: USERS.a.student,
        academic_year: '۱۴۰۳-۱۴۰۴',
        total_amount: 25000000,
        discount_amount: 0,
        paid_amount: 0,
        balance: 25000000,
        status: 'unpaid',
      },
      {
        id: LEDGERS.b,
        student_id: USERS.b.student,
        academic_year: '۱۴۰۳-۱۴۰۴',
        total_amount: 25000000,
        discount_amount: 0,
        paid_amount: 0,
        balance: 25000000,
        status: 'unpaid',
      },
    ],

    tuitionInstallments: [
      {
        id: INSTALLMENTS.a,
        ledger_id: LEDGERS.a,
        installment_number: 1,
        title: 'قسط اول',
        amount: 6000000,
        due_date: '۱۴۰۳/۰۷/۳۰',
        status: 'pending',
      },
      {
        id: INSTALLMENTS.b,
        ledger_id: LEDGERS.b,
        installment_number: 1,
        title: 'قسط اول',
        amount: 6000000,
        due_date: '۱۴۰۳/۰۷/۳۰',
        status: 'pending',
      },
    ],

    announcements: [
      {
        id: ANNOUNCEMENTS.a,
        teacher_id: USERS.a.admin,
        class_id: null,
        title: 'اطلاعیه مدرسه الف',
        content: 'این اطلاعیه فقط متعلق به مدرسه الف است.',
        target_audience: 'all',
        target_grades: JSON.stringify(['*']),
        target_subjects: JSON.stringify(['*']),
        target_class_ids: JSON.stringify(['*']),
        is_mandatory: 0,
        priority: 'normal',
        attachments: JSON.stringify([]),
        is_pinned: 0,
      },
      {
        id: ANNOUNCEMENTS.b,
        teacher_id: USERS.b.admin,
        class_id: null,
        title: 'اطلاعیه مدرسه ب',
        content: 'این اطلاعیه فقط متعلق به مدرسه ب است.',
        target_audience: 'all',
        target_grades: JSON.stringify(['*']),
        target_subjects: JSON.stringify(['*']),
        target_class_ids: JSON.stringify(['*']),
        is_mandatory: 0,
        priority: 'normal',
        attachments: JSON.stringify([]),
        is_pinned: 0,
      },
    ],
  };
}

/**
 * Seed the two-school fixture.
 * @param {import('knex')} db
 */
async function seedTwoSchools(db) {
  if (!cachedPasswordHash) {
    cachedPasswordHash = await bcrypt.hash(FIXTURE_PASSWORD, 10);
  }
  const rows = buildRows(cachedPasswordHash);

  await db('schools').insert(rows.schools);
  await db('users').insert(rows.users);
  await db('classes').insert(rows.classes);
  await db('class_members').insert(rows.classMembers);
  await db('parent_student_links').insert(rows.parentStudentLinks);
  await db('gradebook_categories').insert(rows.gradebookCategories);
  await db('gradebook_scores').insert(rows.gradebookScores);
  await db('tuition_ledgers').insert(rows.tuitionLedgers);
  await db('tuition_installments').insert(rows.tuitionInstallments);
  await db('announcements').insert(rows.announcements);

  return rows;
}

/**
 * Wipe every table of the disposable test database and re-seed the fixture.
 *
 * Used to give each test a pristine two-school world, so that a test which
 * mutates state (for example the cross-tenant broadcast test) cannot influence
 * the next one.
 *
 * @param {import('knex')} db
 */
async function resetFixture(db) {
  const raw = await db.raw(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'knex_%'",
  );
  const tables = Array.isArray(raw) ? raw : raw.rows || [];

  await db.raw('PRAGMA foreign_keys = OFF');
  for (const { name } of tables) {
    await db.raw(`DELETE FROM "${name}"`);
  }
  await db.raw('PRAGMA foreign_keys = ON');

  return seedTwoSchools(db);
}

module.exports = {
  seedTwoSchools,
  resetFixture,
  emailFor,
  FIXTURE_PASSWORD,
  SCHOOLS,
  USERS,
  CLASSES,
  GRADEBOOK_CATEGORIES,
  LEDGERS,
  INSTALLMENTS,
  ANNOUNCEMENTS,
};
