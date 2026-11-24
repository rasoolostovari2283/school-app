const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { setupHarness, teardownHarness, resetDatabase } = require('../support/harness');
const { get, post } = require('../support/http');
const {
  normalizeVideoAudience,
  canUserAccessVideo,
  resolveSafeUploadPath,
} = require('../../src/utils/videoAccessHelper');

let baseUrl;

before(async () => {
  ({ baseUrl } = await setupHarness());
});

after(async () => {
  await teardownHarness();
});

beforeEach(async () => {
  await resetDatabase();
});

// ═══════════════════════════════════════════════════════════════
// 1. PURE UNIT TESTS (videoAccessHelper)
// ═══════════════════════════════════════════════════════════════

test('unit: normalizeVideoAudience accepts valid audiences and defaults unknown values to all', () => {
  assert.equal(normalizeVideoAudience('teacher_students'), 'teacher_students');
  assert.equal(normalizeVideoAudience('STUDENTS'), 'students');
  assert.equal(normalizeVideoAudience('teachers'), 'teachers');
  assert.equal(normalizeVideoAudience('parents'), 'parents');
  assert.equal(normalizeVideoAudience('unknown_role'), 'all');
  assert.equal(normalizeVideoAudience(null), 'all');
});

test('unit: canUserAccessVideo enforces strict teacher-subordinate visibility for teacher_students', () => {
  const teacherVideo = {
    id: 'vid-1',
    teacher_id: 'teacher-1',
    class_id: null,
    target_audience: 'teacher_students',
    is_published: true,
  };

  // Owner teacher & school admin always allowed
  assert.equal(canUserAccessVideo({ id: 'teacher-1', role: 'teacher' }, teacherVideo), true);
  assert.equal(canUserAccessVideo({ id: 'admin-1', role: 'admin' }, teacherVideo), true);

  // Another teacher cannot view private teacher_students video
  assert.equal(canUserAccessVideo({ id: 'teacher-2', role: 'teacher' }, teacherVideo), false);

  // Linked student is allowed
  assert.equal(
    canUserAccessVideo(
      { id: 'student-a', role: 'student' },
      teacherVideo,
      { linkedTeacherIds: new Set(['teacher-1']) }
    ),
    true
  );

  // Unlinked student in same school is denied
  assert.equal(
    canUserAccessVideo(
      { id: 'student-b', role: 'student' },
      teacherVideo,
      { linkedTeacherIds: new Set(['teacher-9']) }
    ),
    false
  );

  // Parent is denied teacher_students videos
  assert.equal(canUserAccessVideo({ id: 'parent-1', role: 'parent' }, teacherVideo), false);
});

test('unit: resolveSafeUploadPath strips traversal sequences and keeps paths inside uploadsDir', () => {
  const uploadsRoot = path.resolve('/tmp/eduflow-test-uploads');
  const valid = resolveSafeUploadPath(uploadsRoot, 'smartboard_123.webm');
  assert.equal(valid, path.join(uploadsRoot, 'smartboard_123.webm'));

  // Traversal attempt reduces to basename confined within uploadsRoot
  const traversal = resolveSafeUploadPath(uploadsRoot, '../../etc/passwd');
  assert.ok(traversal.startsWith(uploadsRoot + path.sep));
  assert.equal(path.basename(traversal), 'passwd');

  // Empty / dot filenames rejected
  assert.equal(resolveSafeUploadPath(uploadsRoot, '..'), null);
  assert.equal(resolveSafeUploadPath(uploadsRoot, '.'), null);
  assert.equal(resolveSafeUploadPath(uploadsRoot, ''), null);
});

// ═══════════════════════════════════════════════════════════════
// 2. INTEGRATION TESTS (Smartboard Publish to Videos Folder + Messages)
// ═══════════════════════════════════════════════════════════════

async function registerSchool(name, mobile) {
  const res = await post(baseUrl, '/api/v1/auth/register-school', {
    body: {
      school_name: name,
      city: 'تهران',
      education_level: 'متوسطه دوم',
      majors: ['تجربی', 'ریاضی'],
      principal_name: `مدیر ${name}`,
      principal_phone: mobile,
      password: 'Password123!',
    },
  });
  assert.equal(res.status, 201, `registerSchool failed: ${JSON.stringify(res.body)}`);
  return res.body.data;
}

test('integration: Teacher publishes Smartboard recording to folder; only subordinate students see & stream it; Messages video share works', async () => {
  const schoolA = await registerSchool('دبیرستان تخته هوشمند الف', '09121001001');
  const schoolB = await registerSchool('دبیرستان تخته هوشمند ب', '09121001002');

  // Register Teacher 1 in School A
  const t1Res = await post(baseUrl, '/api/v1/auth/register-teacher', {
    body: {
      full_name: 'استاد کریمی فیزیک',
      phone: '09122001001',
      school_id: schoolA.school.id,
      education_level: 'متوسطه دوم',
      majors: ['ریاضی'],
      taught_grades: ['پایه دهم'],
      password: 'Password123!',
    },
  });
  assert.equal(t1Res.status, 201, `register teacher failed: ${JSON.stringify(t1Res.body)}`);
  const teacherToken = t1Res.body.data.accessToken;
  const teacherUser = t1Res.body.data.user;

  // Register Student A (will select Teacher 1)
  const stARes = await post(baseUrl, '/api/v1/auth/register-student', {
    body: {
      full_name: 'آرمان دانش‌آموز الف',
      phone: '09123001001',
      school_id: schoolA.school.id,
      education_level: 'متوسطه دوم',
      major: 'ریاضی',
      grade: 'پایه دهم',
      password: 'Password123!',
    },
  });
  assert.equal(stARes.status, 201, `register student A failed: ${JSON.stringify(stARes.body)}`);
  const studentAToken = stARes.body.data.accessToken;

  // Student A selects Teacher 1
  const setupRes = await post(baseUrl, '/api/v1/auth/student-setup', {
    token: studentAToken,
    body: { teacher_ids: [teacherUser.id] },
  });
  assert.equal(setupRes.status, 200, `student-setup failed: ${JSON.stringify(setupRes.body)}`);

  // Register Student B (same school, does NOT select Teacher 1)
  const stBRes = await post(baseUrl, '/api/v1/auth/register-student', {
    body: {
      full_name: 'بهداد دانش‌آموز ب',
      phone: '09123001002',
      school_id: schoolA.school.id,
      education_level: 'متوسطه دوم',
      major: 'ریاضی',
      grade: 'پایه دهم',
      password: 'Password123!',
    },
  });
  assert.equal(stBRes.status, 201, `register student B failed: ${JSON.stringify(stBRes.body)}`);
  const studentBToken = stBRes.body.data.accessToken;

  // Register Student C (different school B)
  const stCRes = await post(baseUrl, '/api/v1/auth/register-student', {
    body: {
      full_name: 'سینا دانش‌آموز مدرسه دیگر',
      phone: '09123001003',
      school_id: schoolB.school.id,
      education_level: 'متوسطه دوم',
      major: 'تجربی',
      grade: 'پایه دهم',
      password: 'Password123!',
    },
  });
  assert.equal(stCRes.status, 201, `register student C failed: ${JSON.stringify(stCRes.body)}`);
  const studentCToken = stCRes.body.data.accessToken;

  // Teacher 1 creates folder «فیزیک فصل ۱»
  const folderRes = await post(baseUrl, '/api/v1/videos/folders', {
    token: teacherToken,
    body: { name: 'فیزیک فصل ۱', color: '#8b5cf6' },
  });
  assert.ok([200, 201].includes(folderRes.status));

  // Teacher 1 uploads a Smartboard .webm recording into folder «فیزیک فصل ۱» for subordinate students
  const fakeWebmBytes = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81, 0x01, 0x42, 0xf7, 0x81, 0x01]);
  const videoForm = new FormData();
  videoForm.append('file', new Blob([fakeWebmBytes], { type: 'video/webm' }), 'smartboard_physics.webm');
  videoForm.append('title', 'تدریس فصل اول فیزیک دهم');
  videoForm.append('description', 'ضبط شده روی تخته هوشمند');
  videoForm.append('folder_name', 'فیزیک فصل ۱');
  videoForm.append('category', 'تخته هوشمند');
  videoForm.append('target_audience', 'teacher_students');
  videoForm.append('duration_seconds', '12');

  const uploadVideoResp = await fetch(`${baseUrl}/api/v1/videos`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${teacherToken}` },
    body: videoForm,
  });
  const uploadVideoJson = await uploadVideoResp.json();
  assert.equal(uploadVideoResp.status, 201, `video upload failed: ${JSON.stringify(uploadVideoJson)}`);
  const createdVideo = uploadVideoJson.data.video;
  assert.equal(createdVideo.folder_name, 'فیزیک فصل ۱');
  assert.equal(createdVideo.target_audience, 'teacher_students');

  // 1) Teacher 1 sees video & folder
  const tList = await get(baseUrl, '/api/v1/videos', { token: teacherToken });
  assert.equal(tList.status, 200);
  assert.ok(tList.body.data.videos.some((v) => v.id === createdVideo.id));

  // 2) Subordinate Student A sees video, sees folder «فیزیک فصل ۱», and can stream it (200)
  const stAList = await get(baseUrl, '/api/v1/videos', { token: studentAToken });
  assert.equal(stAList.status, 200);
  assert.ok(
    stAList.body.data.videos.some((v) => v.id === createdVideo.id && v.folder_name === 'فیزیک فصل ۱'),
    'Subordinate student A must see teacher video in folder'
  );
  const stAFolders = await get(baseUrl, '/api/v1/videos/folders', { token: studentAToken });
  assert.equal(stAFolders.status, 200);
  assert.ok(stAFolders.body.data.folders.some((f) => f.name === 'فیزیک فصل ۱'));

  const stAStream = await fetch(`${baseUrl}/api/v1/videos/${createdVideo.id}/stream`, {
    headers: { Authorization: `Bearer ${studentAToken}` },
  });
  assert.equal(stAStream.status, 200);

  // 3) Unlinked Student B (same school) must NOT see video or stream it
  const stBList = await get(baseUrl, '/api/v1/videos', { token: studentBToken });
  assert.equal(stBList.status, 200);
  assert.equal(
    stBList.body.data.videos.some((v) => v.id === createdVideo.id),
    false,
    'Unlinked student B must NOT see Teacher 1 private video'
  );
  const stBDetail = await get(baseUrl, `/api/v1/videos/${createdVideo.id}`, { token: studentBToken });
  assert.equal(stBDetail.status, 403);
  const stBStream = await fetch(`${baseUrl}/api/v1/videos/${createdVideo.id}/stream`, {
    headers: { Authorization: `Bearer ${studentBToken}` },
  });
  assert.equal(stBStream.status, 403);

  // 4) Student C (other school) must get 403
  const stCDetail = await get(baseUrl, `/api/v1/videos/${createdVideo.id}`, { token: studentCToken });
  assert.equal(stCDetail.status, 403);

  // 5) Sending Smartboard recorded video in Messages works for both Student & Teacher
  const msgUploadForm = new FormData();
  msgUploadForm.append('file', new Blob([fakeWebmBytes], { type: 'video/webm' }), 'student_note_recording.webm');
  const upResp = await fetch(`${baseUrl}/api/v1/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${studentAToken}` },
    body: msgUploadForm,
  });
  const upJson = await upResp.json();
  assert.equal(upResp.status, 201, `upload failed: ${JSON.stringify(upJson)}`);
  const uploadedFile = upJson.data.file;

  const msgRes = await post(baseUrl, '/api/v1/messages', {
    token: studentAToken,
    body: {
      receiver_id: teacherUser.id,
      content: 'ویدیو تمرین تخته هوشمند',
      attachments: [
        {
          url: uploadedFile.url,
          originalname: uploadedFile.originalname,
          mimetype: uploadedFile.mimetype,
          size: uploadedFile.size,
          media_type: 'video',
        },
      ],
    },
  });
  assert.equal(msgRes.status, 201, `send video message failed: ${JSON.stringify(msgRes.body)}`);
});
