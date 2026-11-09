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
const { cache } = require('../../src/utils/cache');

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
    student2: 'a-student-2',
    parent: 'a-parent',
  },
  b: {
    admin: 'b-admin',
    teacher: 'b-teacher',
    student: 'b-student',
    parent: 'b-parent',
  },
};

/** Phone number suffix of each fixture role. */
const SUFFIXES = {
  admin: '0001',
  teacher: '0002',
  student: '1001',
  student2: '1002',
  parent: '1003',
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

const QUIZZES = {
  b: 'quiz-b',
};

const QUIZ_QUESTIONS = {
  b: 'quiz-question-b-1',
};

const TICKETS = {
  b: 'ticket-b',
};

const STUDY_LOGS = {
  b: 'study-log-b',
};

const MESSAGE_GROUPS = {
  b: 'group-b',
};

const VIDEOS = {
  b: 'video-b',
};

/**
 * Name of the media file the video fixture row points at.
 * The uploads test writes this file into `backend/uploads`, which is the
 * hardcoded directory the video streaming route reads from.
 */
const VIDEO_FIXTURE_FILE = 'phase0-video-fixture.mp4';

/** Login identifier (e-mail) of a fixture user. */
const emailFor = (school, role) => `${school}.${role}@school.test`;

/** Phone number of a fixture user. */
const phoneFor = (school, role) => `0912${school === 'a' ? '0000' : '1111'}${SUFFIXES[role]}`;

/**
 * Build the fixture rows.
 * @param {string} passwordHash - bcrypt hash shared by every fixture user
 */
function buildRows(passwordHash) {
  const user = (school, role) => {
    const suffix = SUFFIXES[role];
    const isStudent = role === 'student' || role === 'student2';
    const isParent = role === 'parent';

    return {
      id: USERS[school][role],
      email: emailFor(school, role),
      phone: phoneFor(school, role),
      password_hash: passwordHash,
      role: isStudent ? 'student' : role,
      display_name: `${school.toUpperCase()} ${role}`,
      username: `${school}_${role}`,
      school_id: SCHOOLS[school].id,
      personnel_code: isStudent || isParent ? null : `EMP-${school.toUpperCase()}-${suffix}`,
      student_code: isStudent || isParent
        ? `STD-${school.toUpperCase()}-${isStudent ? suffix : SUFFIXES.student}`
        : null,
      department: 'پایه دهم',
      job_title: role === 'admin'
        ? 'مدیر مدرسه'
        : (role === 'teacher' ? 'دبیر' : (isStudent ? 'دانش‌آموز' : 'ولی')),
      locale: 'fa',
      is_verified: true,
      settings: JSON.stringify({
        school_name: SCHOOLS[school].name,
        school_code: SCHOOLS[school].code,
      }),
    };
  };

  const aStudent = { ...user('a', 'student'), student_code: 'STD-A-1001' };
  const aStudent2 = { ...user('a', 'student2'), student_code: 'STD-A-1002' };
  const aParent = { ...user('a', 'parent'), student_code: 'STD-A-1001' };
  const bStudent = { ...user('b', 'student'), student_code: 'STD-B-2002' };
  const bParent = { ...user('b', 'parent'), student_code: 'STD-B-2002' };

  return {
    schools: [
      { ...SCHOOLS.a },
      { ...SCHOOLS.b },
    ],

    users: [
      user('a', 'admin'),
      user('a', 'teacher'),
      aStudent,
      aStudent2,
      aParent,
      user('b', 'admin'),
      user('b', 'teacher'),
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
      { id: 'member-a-student-2', class_id: CLASSES.a, user_id: USERS.a.student2, role: 'student' },
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
      { id: 'score-a-2', category_id: GRADEBOOK_CATEGORIES.a, student_id: USERS.a.student2, score: 16 },
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

    disciplineRecords: [
      {
        id: 'discipline-b-1',
        student_id: USERS.b.student,
        issuer_id: USERS.b.admin,
        type: 'warning',
        category: 'ethics',
        title: 'تذکر مدرسه ب',
        description: 'سوابق انضباطی محرمانه مدرسه ب',
        points: -1,
        date: '۱۴۰۳/۰۸/۰۱',
        is_parent_viewable: true,
      },
    ],

    counselingCases: [
      {
        id: 'counseling-b-1',
        student_id: USERS.b.student,
        counselor_id: USERS.b.admin,
        session_title: 'مشاوره محرمانه مدرسه ب',
        session_date: '۱۴۰۳/۰۸/۰۱',
        student_concerns: 'مشکلات دانش‌آموز مدرسه ب',
        counselor_notes: 'یادداشت مشاور مدرسه ب',
        recommendations: 'راهکار مشاور مدرسه ب',
        status: 'completed',
        shared_with_parent: true,
      },
    ],

    quizzes: [
      {
        id: QUIZZES.b,
        class_id: CLASSES.b,
        teacher_id: USERS.b.teacher,
        title: 'آزمون محرمانه مدرسه ب',
        duration_minutes: 30,
        is_published: false,
      },
    ],

    quizQuestions: [
      {
        id: QUIZ_QUESTIONS.b,
        quiz_id: QUIZZES.b,
        question_text: 'پاسخ درست کدام است؟',
        options: JSON.stringify(['الف', 'ب']),
        correct_option: 'ب',
        points: 1,
        order_index: 0,
      },
    ],

    schoolTickets: [
      {
        id: TICKETS.b,
        ticket_number: 'TCK-B-0001',
        user_id: USERS.b.student,
        department: 'educational',
        priority: 'normal',
        subject: 'شکایت محرمانه مدرسه ب',
        message: 'متن محرمانه تیکت مدرسه ب',
        status: 'open',
      },
    ],

    studyLogs: [
      {
        id: STUDY_LOGS.b,
        student_id: USERS.b.student,
        date: '۱۴۰۳/۰۸/۰۱',
        subject: 'ریاضی',
        study_minutes_descriptive: 30,
        study_minutes_test: 20,
        tests_count: 5,
        tests_correct: 4,
        tests_wrong: 1,
        satisfaction_score: 4,
        student_notes: 'یادداشت خصوصی دانش‌آموز مدرسه ب',
      },
    ],

    messageGroups: [
      {
        id: MESSAGE_GROUPS.b,
        name: 'گروه محرمانه مدرسه ب',
        description: 'گروه پیام‌رسانی مدرسه ب',
        category: 'class',
        created_by: USERS.b.admin,
      },
    ],

    messageGroupMembers: [
      { id: 'group-member-b', group_id: MESSAGE_GROUPS.b, user_id: USERS.b.teacher, role: 'admin' },
    ],

    messageGroupMessages: [
      {
        id: 'group-message-b',
        group_id: MESSAGE_GROUPS.b,
        sender_id: USERS.b.teacher,
        content: 'پیام محرمانه گروه مدرسه ب',
      },
    ],

    videos: [
      {
        id: VIDEOS.b,
        title: 'ویدیوی محرمانه مدرسه ب',
        description: 'ویدیوی کلاس مدرسه ب',
        class_id: CLASSES.b,
        teacher_id: USERS.b.teacher,
        file_url: VIDEO_FIXTURE_FILE,
        video_url: VIDEO_FIXTURE_FILE,
        mimetype: 'video/mp4',
        file_size: 15,
        duration_seconds: 10,
        is_published: true,
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
  await db('discipline_records').insert(rows.disciplineRecords);
  await db('counseling_cases').insert(rows.counselingCases);
  await db('quizzes').insert(rows.quizzes);
  await db('quiz_questions').insert(rows.quizQuestions);
  await db('school_tickets').insert(rows.schoolTickets);
  await db('study_logs').insert(rows.studyLogs);
  await db('message_groups').insert(rows.messageGroups);
  await db('message_group_members').insert(rows.messageGroupMembers);
  await db('message_group_messages').insert(rows.messageGroupMessages);
  await db('videos').insert(rows.videos);

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

  // The application caches GET responses in memory (announcements, folders, ...).
  // A stale cache entry would survive the reset and mask the real behaviour.
  cache.flush();

  return seedTwoSchools(db);
}

module.exports = {
  seedTwoSchools,
  resetFixture,
  emailFor,
  phoneFor,
  FIXTURE_PASSWORD,
  SCHOOLS,
  USERS,
  SUFFIXES,
  CLASSES,
  GRADEBOOK_CATEGORIES,
  LEDGERS,
  INSTALLMENTS,
  ANNOUNCEMENTS,
  QUIZZES,
  QUIZ_QUESTIONS,
  TICKETS,
  STUDY_LOGS,
  MESSAGE_GROUPS,
  VIDEOS,
  VIDEO_FIXTURE_FILE,
};
