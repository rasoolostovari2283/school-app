const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setupHarness, teardownHarness, resetDatabase } = require('../support/harness');
const { get, post } = require('../support/http');
const { loginAs } = require('../support/auth');
const { USERS } = require('../fixtures/twoSchools');
const {
  buildAutoClassTitle,
  normalizeGroupHandle,
  extractGroupJoinToken,
  detectAttachmentMediaType,
  sanitizeMessageAttachments,
  getMessagePreviewLabel,
} = require('../../src/utils/studentTeacherHelper');

let baseUrl;
let db;

before(async () => {
  ({ baseUrl, db } = await setupHarness());
});

after(async () => {
  await teardownHarness();
});

beforeEach(async () => {
  await resetDatabase();
});

// ═══════════════════════════════════════════════════════════════
// 1. PURE UNIT TESTS (studentTeacherHelper)
// ═══════════════════════════════════════════════════════════════

test('unit: buildAutoClassTitle formats grade, major, and teacher cleanly', () => {
  assert.equal(
    buildAutoClassTitle({ grade: 'دهم', major: 'تجربی', teacherName: 'آرش نادری' }),
    'کلاس دهم — رشته تجربی — (آرش نادری)'
  );
  assert.equal(
    buildAutoClassTitle({ grade: 'پنجم', major: '', teacherName: 'سارا کریمی' }),
    'کلاس پنجم — (سارا کریمی)'
  );
});

test('unit: normalizeGroupHandle transliterates Persian/handles and strips @', () => {
  assert.equal(normalizeGroupHandle('@Math_10A'), 'math_10a');
  const auto = normalizeGroupHandle('', 'فیزیک دهم', 'ab12');
  assert.match(auto, /^grp_[a-z0-9_]+$/);
  assert.ok(auto.length >= 3 && auto.length <= 40);
});

test('unit: extractGroupJoinToken parses invite URLs, /join/ paths, and @handles', () => {
  const fromQuery = extractGroupJoinToken('https://school.ir/dashboard/messages/?joinGroup=AB12CD34EF56');
  assert.equal(fromQuery.code, 'AB12CD34EF56');

  const fromJoinPath = extractGroupJoinToken('https://educonnect.ir/join/XY9988ZZ');
  assert.equal(fromJoinPath.code, 'XY9988ZZ');

  const fromHandle = extractGroupJoinToken('@physics_grade10');
  assert.equal(fromHandle.handle, 'physics_grade10');
});

test('unit: sanitizeMessageAttachments accepts /uploads/* and rejects unsafe URLs', () => {
  const valid = sanitizeMessageAttachments([
    { url: '/uploads/photo_123.png', originalname: 'photo.png', mimetype: 'image/png', size: 1024 },
    { url: '/uploads/voice_note_1.webm', originalname: 'voice_note.webm', mimetype: 'audio/webm', size: 2048 },
    { url: '/uploads/lesson_clip.mp4', originalname: 'lesson_clip.mp4', mimetype: 'video/mp4', size: 4096 },
  ]);
  assert.equal(valid.length, 3);
  assert.equal(valid[0].media_type, 'image');
  assert.equal(valid[1].media_type, 'audio');
  assert.equal(valid[2].media_type, 'video');
  assert.equal(detectAttachmentMediaType(valid[0]), 'image');
  assert.equal(getMessagePreviewLabel('', [valid[0]]), '🖼️ تصویر');
  assert.equal(getMessagePreviewLabel('', [valid[1]]), '🎙️ پیام صوتی (ویس)');
  assert.equal(getMessagePreviewLabel('', [valid[2]]), '🎬 ویدیو');

  assert.throws(() => {
    sanitizeMessageAttachments([{ url: 'javascript:alert(1)', originalname: 'xss.png' }]);
  }, { statusCode: 400 });

  assert.throws(() => {
    sanitizeMessageAttachments([{ url: '/uploads/../../etc/passwd', originalname: 'bad.txt' }]);
  }, { statusCode: 400 });

  assert.throws(() => {
    sanitizeMessageAttachments([{ url: 'https://evil.example/payload.png', originalname: 'ext.png' }]);
  }, { statusCode: 400 });
});

// ═══════════════════════════════════════════════════════════════
// 2. INTEGRATION TESTS: STUDENT TEACHER SELECTION & ROSTER SYNC
// ═══════════════════════════════════════════════════════════════

async function seedCustomSchoolWithStaffAndStudent() {
  const schoolRes = await post(baseUrl, '/api/v1/auth/register-school', {
    body: {
      school_name: 'دبیرستان هوشمند اندیشه نو',
      city: 'تهران',
      education_level: 'متوسطه دوم',
      majors: ['ریاضی', 'تجربی'],
      principal_name: 'مهدی رضایی',
      principal_phone: '09121112233',
      password: 'Password123!',
    },
  });
  assert.equal(schoolRes.status, 201, `School registration failed: ${JSON.stringify(schoolRes.body)}`);
  const school = schoolRes.body.data.school;
  const principal = schoolRes.body.data.user;
  const principalToken = schoolRes.body.data.accessToken;

  const teacher1Res = await post(baseUrl, '/api/v1/auth/register-teacher', {
    body: {
      full_name: 'استاد کیوان مرادی',
      phone: '09123334455',
      school_id: school.id,
      education_level: 'متوسطه دوم',
      majors: ['تجربی'],
      taught_grades: ['پایه دهم', 'پایه یازدهم'],
      password: 'Password123!',
    },
  });
  assert.equal(teacher1Res.status, 201, `Teacher 1 registration failed: ${JSON.stringify(teacher1Res.body)}`);

  const teacher2Res = await post(baseUrl, '/api/v1/auth/register-teacher', {
    body: {
      full_name: 'خانم زهرا شریفی',
      phone: '09124445566',
      school_id: school.id,
      education_level: 'متوسطه دوم',
      majors: ['تجربی', 'ریاضی'],
      taught_grades: ['پایه دهم'],
      password: 'Password123!',
    },
  });
  assert.equal(teacher2Res.status, 201, `Teacher 2 registration failed: ${JSON.stringify(teacher2Res.body)}`);

  const studentRes = await post(baseUrl, '/api/v1/auth/register-student', {
    body: {
      full_name: 'پویا حسینی',
      phone: '09125556677',
      school_id: school.id,
      education_level: 'متوسطه دوم',
      major: 'تجربی',
      grade: 'پایه دهم',
      password: 'Password123!',
    },
  });
  assert.equal(studentRes.status, 201, `Student registration failed: ${JSON.stringify(studentRes.body)}`);

  return {
    school,
    principal,
    principalToken,
    teacher1: teacher1Res.body.data.user,
    teacher1Token: teacher1Res.body.data.accessToken,
    teacher2: teacher2Res.body.data.user,
    teacher2Token: teacher2Res.body.data.accessToken,
    student: studentRes.body.data.user,
    studentToken: studentRes.body.data.accessToken,
  };
}

test('integration: student sees only their school DB teachers, submits selection, and appears in teacher class rosters by grade & major', async () => {
  const { school, teacher1, teacher1Token, teacher2, teacher2Token, student, studentToken } =
    await seedCustomSchoolWithStaffAndStudent();

  // 1. Fetch options as student
  const optRes = await get(baseUrl, '/api/v1/auth/student-setup-options', { token: studentToken });
  assert.equal(optRes.status, 200);
  const returnedTeachers = optRes.body.data.teachers;
  assert.equal(returnedTeachers.length, 2, 'Should list exactly the 2 teachers of this school');
  const teacherIds = returnedTeachers.map((t) => t.id).sort();
  assert.deepEqual(teacherIds, [teacher1.id, teacher2.id].sort());
  assert.equal(optRes.body.data.student_profile.grade, 'پایه دهم');
  assert.equal(optRes.body.data.student_profile.major, 'تجربی');

  // 2. Cross-school security check: student cannot select a teacher from School A
  const crossRes = await post(baseUrl, '/api/v1/auth/student-setup', {
    token: studentToken,
    body: { teacher_ids: [USERS.a.teacher] },
  });
  assert.equal(crossRes.status, 403);

  // 3. Submit selection of both school teachers
  const saveRes = await post(baseUrl, '/api/v1/auth/student-setup', {
    token: studentToken,
    body: { teacher_ids: [teacher1.id, teacher2.id] },
  });
  assert.equal(saveRes.status, 200, `student-setup failed: ${JSON.stringify(saveRes.body)}`);
  assert.equal(saveRes.body.data.linked_teachers.length, 2);
  assert.equal(saveRes.body.data.enrolled_classes.length, 2);

  // Verify student_teacher_links table persisted both links under the school
  const dbLinks = await db('student_teacher_links').where({
    student_user_id: student.id,
    school_id: school.id,
  });
  assert.equal(dbLinks.length, 2);

  // 4. Verify Teacher 1's class roster shows the student organized by grade & major
  const t1ClassesRes = await get(baseUrl, '/api/v1/classes', { token: teacher1Token });
  assert.equal(t1ClassesRes.status, 200);
  assert.equal(t1ClassesRes.body.data.classes.length, 1);
  const t1Class = t1ClassesRes.body.data.classes[0];
  assert.equal(t1Class.grade, 'پایه دهم');
  assert.equal(t1Class.major, 'تجربی');
  assert.equal(t1Class.students_count, 1);

  const t1RosterRes = await get(baseUrl, `/api/v1/classes/${t1Class.id}/roster`, { token: teacher1Token });
  assert.equal(t1RosterRes.status, 200);
  assert.equal(t1RosterRes.body.data.students.length, 1);
  const rosterStudent = t1RosterRes.body.data.students[0];
  assert.equal(rosterStudent.id, student.id);
  assert.equal(rosterStudent.username, student.username);
  assert.equal(rosterStudent.grade, 'پایه دهم');
  assert.equal(rosterStudent.major, 'تجربی');

  // 5. Student updates selection to keep only Teacher 1 -> removed from Teacher 2's roster
  const updateRes = await post(baseUrl, '/api/v1/auth/student-setup', {
    token: studentToken,
    body: { teacher_ids: [teacher1.id] },
  });
  assert.equal(updateRes.status, 200);

  const t2ClassesRes = await get(baseUrl, '/api/v1/classes', { token: teacher2Token });
  assert.equal(t2ClassesRes.status, 200);
  assert.equal(t2ClassesRes.body.data.classes[0].students_count, 0);
});

// ═══════════════════════════════════════════════════════════════
// 3. INTEGRATION TESTS: MESSAGING, DEFAULT CONTACTS, MEDIA, GROUPS
// ═══════════════════════════════════════════════════════════════

test('integration: default contacts include principal + all teachers with @username, search works, media-only messages work, and searchable groups work', async () => {
  const { principal, teacher1, teacher1Token, teacher2, teacher2Token, student, studentToken } =
    await seedCustomSchoolWithStaffAndStudent();

  // 1. Default contacts in directory & conversations include principal + all school teachers with @username
  const dirRes = await get(baseUrl, '/api/v1/messages/directory', { token: studentToken });
  assert.equal(dirRes.status, 200);
  const defaultContacts = dirRes.body.data.default_contacts;
  assert.equal(defaultContacts.length, 3, 'Should contain principal + 2 school teachers');
  assert.equal(defaultContacts[0].id, principal.id, 'School principal should appear first');
  assert.equal(defaultContacts[0].is_principal, true);
  assert.equal(defaultContacts[0].role, 'admin');
  assert.ok(defaultContacts.every((c) => Boolean(c.username)), 'Every default contact must have a username ID');

  const convRes = await get(baseUrl, '/api/v1/messages/conversations', { token: studentToken });
  assert.equal(convRes.status, 200);
  const convUserIds = convRes.body.data.conversations.map((c) => c.user.id);
  assert.ok(convUserIds.includes(principal.id));
  assert.ok(convUserIds.includes(teacher1.id));
  assert.ok(convUserIds.includes(teacher2.id));

  // 2. Search user strictly by @username within same school
  const searchRes = await get(
    baseUrl,
    `/api/v1/messages/users/search?q=${encodeURIComponent('@' + teacher1.username)}`,
    { token: studentToken }
  );
  assert.equal(searchRes.status, 200);
  assert.ok(searchRes.body.data.users.some((u) => u.id === teacher1.id));

  // 3. Send media-only (photo, video, voice) direct message without text
  const photoMsgRes = await post(baseUrl, '/api/v1/messages', {
    token: studentToken,
    body: {
      receiver_id: teacher1.id,
      content: '',
      attachments: [
        { url: '/uploads/test_photo.jpg', originalname: 'homework.jpg', mimetype: 'image/jpeg', size: 12345 },
      ],
    },
  });
  assert.equal(photoMsgRes.status, 201, `Media-only direct message failed: ${JSON.stringify(photoMsgRes.body)}`);

  // Unsafe URL in attachment is blocked
  const unsafeMsgRes = await post(baseUrl, '/api/v1/messages', {
    token: studentToken,
    body: {
      receiver_id: teacher1.id,
      content: '',
      attachments: [{ url: 'javascript:alert(1)', originalname: 'bad.png', mimetype: 'image/png' }],
    },
  });
  assert.equal(unsafeMsgRes.status, 400);

  // 4. Create group with custom searchable @group_handle + direct member add by @username
  const createGroupRes = await post(baseUrl, '/api/v1/messages/groups', {
    token: teacher1Token,
    body: {
      name: 'گروه زیست‌شناسی دهم تجربی',
      description: 'پرسش و پاسخ و ارسال فیلم و ویس آموزشی',
      group_handle: '@bio_grade10_exp',
      member_identifiers: [`@${student.username}`],
    },
  });
  assert.equal(createGroupRes.status, 201, `Create group failed: ${JSON.stringify(createGroupRes.body)}`);
  const createdGroup = createGroupRes.body.data.group;
  assert.equal(createdGroup.group_handle, 'bio_grade10_exp');
  assert.ok(createdGroup.invite_code && createdGroup.invite_code.length >= 6);

  // Verify student was directly added via @username during group creation
  const studentGroupsRes = await get(baseUrl, '/api/v1/messages/groups', { token: studentToken });
  assert.equal(studentGroupsRes.status, 200);
  assert.ok(studentGroupsRes.body.data.groups.some((g) => g.id === createdGroup.id));

  // 5. Teacher 2 searches group by @group_handle and joins via handle
  const groupSearchRes = await get(
    baseUrl,
    `/api/v1/messages/groups/search?q=${encodeURIComponent('@bio_grade10_exp')}`,
    { token: teacher2Token }
  );
  assert.equal(groupSearchRes.status, 200);
  assert.equal(groupSearchRes.body.data.groups.length, 1);
  assert.equal(groupSearchRes.body.data.groups[0].id, createdGroup.id);
  assert.equal(groupSearchRes.body.data.groups[0].is_member, false);

  const joinRes = await post(baseUrl, '/api/v1/messages/groups/join', {
    token: teacher2Token,
    body: { group_handle: '@bio_grade10_exp' },
  });
  assert.equal(joinRes.status, 200);
  assert.equal(joinRes.body.data.joined, true);

  // Teacher 2 sends a voice-only message inside the group
  const groupVoiceRes = await post(baseUrl, `/api/v1/messages/groups/${createdGroup.id}/messages`, {
    token: teacher2Token,
    body: {
      content: '',
      attachments: [
        { url: '/uploads/voice_note_42.webm', originalname: 'voice_note_42.webm', mimetype: 'audio/webm', size: 8192 },
      ],
    },
  });
  assert.equal(groupVoiceRes.status, 201);

  // 6. Cross-school isolation: School A student cannot find or join this school's group
  const schoolAStudent = await loginAs(baseUrl, 'a', 'student');
  const crossSearch = await get(
    baseUrl,
    `/api/v1/messages/groups/search?q=${encodeURIComponent('@bio_grade10_exp')}`,
    { token: schoolAStudent.accessToken }
  );
  assert.equal(crossSearch.status, 200);
  assert.equal(crossSearch.body.data.groups.length, 0);

  const crossJoin = await post(baseUrl, '/api/v1/messages/groups/join', {
    token: schoolAStudent.accessToken,
    body: { group_handle: '@bio_grade10_exp' },
  });
  assert.equal(crossJoin.status, 403);
});
