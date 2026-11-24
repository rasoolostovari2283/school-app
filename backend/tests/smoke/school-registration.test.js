const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const { setupHarness, teardownHarness, resetDatabase } = require('../support/harness');
const { get, post } = require('../support/http');
const db = require('../../src/config/database');
const {
  isHighSchoolLevel,
  normalizeMajors,
  generateBaseUsername,
} = require('../../src/utils/usernameHelper');

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

test('unit: isHighSchoolLevel and normalizeMajors handle high school vs non-high school levels', () => {
  assert.equal(isHighSchoolLevel('متوسطه دوم (دبیرستان)'), true);
  assert.equal(isHighSchoolLevel('متوسطه دوم'), true);
  assert.equal(isHighSchoolLevel('دبستان (ابتدایی)'), false);
  assert.equal(isHighSchoolLevel('متوسطه اول (راهنمایی)'), false);

  assert.deepEqual(
    normalizeMajors(['ریاضی و فیزیک', 'علوم تجربی', 'ریاضی و فیزیک'], 'متوسطه دوم (دبیرستان)'),
    ['ریاضی و فیزیک', 'علوم تجربی']
  );
  assert.deepEqual(
    normalizeMajors('ریاضی و فیزیک، ادبیات و علوم انسانی', 'متوسطه دوم'),
    ['ریاضی و فیزیک', 'ادبیات و علوم انسانی']
  );
  assert.deepEqual(
    normalizeMajors(['ریاضی و فیزیک'], 'دبستان (ابتدایی)'),
    []
  );
  assert.equal(generateBaseUsername('دکتر مهدی رضایی'), 'mehdi_rezaei');
});

test('school registration persists all fields in a single schools row, generates unique username, supports search & password login', async () => {
  const payload = {
    school_name: 'دبیرستان نمونه علمی رازی',
    school_level: 'متوسطه دوم (دبیرستان)',
    majors: ['ریاضی و فیزیک', 'علوم تجربی'],
    city: 'اصفهان',
    admin_name: 'حسین فضیلت‌پور',
    admin_phone: '09131234567',
    admin_password: 'StrongPassword#2026',
  };

  const regRes = await post(baseUrl, '/api/v1/auth/register-school', { body: payload });
  assert.equal(regRes.status, 201);
  assert.equal(regRes.body.success, true);

  const { user, school, accessToken } = regRes.body.data;
  assert.ok(accessToken, 'accessToken should be returned');
  assert.equal(user.role, 'admin');
  assert.ok(school.username && school.username.length >= 3, 'unique username should be generated');
  assert.equal(user.username, school.username, 'admin user and school must share the generated username');
  assert.equal(school.name, payload.school_name);
  assert.equal(school.city, 'اصفهان');
  assert.equal(school.level, 'متوسطه دوم (دبیرستان)');
  assert.deepEqual(school.majors, ['ریاضی و فیزیک', 'علوم تجربی']);
  assert.equal(school.principal_name, 'حسین فضیلت‌پور');
  assert.equal(school.principal_phone, '09131234567');
  assert.equal(school.password_hash, undefined, 'password_hash must never be returned in API response');
  assert.equal(user.password_hash, undefined, 'user password_hash must never be returned in API response');

  // Direct DB check: verify ALL school fields are saved in ONE dedicated row in `schools`
  const dbRow = await db('schools').where({ id: school.id }).first();
  assert.ok(dbRow, 'school row must exist in schools table');
  assert.equal(dbRow.name, payload.school_name);
  assert.equal(dbRow.city, 'اصفهان');
  assert.equal(dbRow.level, 'متوسطه دوم (دبیرستان)');
  assert.deepEqual(JSON.parse(dbRow.majors), ['ریاضی و فیزیک', 'علوم تجربی']);
  assert.equal(dbRow.username, school.username);
  assert.equal(dbRow.principal_name, 'حسین فضیلت‌پور');
  assert.equal(dbRow.principal_phone, '09131234567');
  assert.ok(dbRow.password_hash, 'password_hash must be stored in schools row');
  assert.notEqual(dbRow.password_hash, payload.admin_password, 'password must be hashed, not plaintext');
  assert.equal(await bcrypt.compare(payload.admin_password, dbRow.password_hash), true);

  // Subsequent login with generated @username + saved password must succeed
  const loginByUsername = await post(baseUrl, '/api/v1/auth/login', {
    body: { identifier: `@${school.username}`, password: payload.admin_password },
  });
  assert.equal(loginByUsername.status, 200);
  assert.equal(loginByUsername.body.data.user.id, user.id);

  // Subsequent login with phone + saved password must also succeed
  const loginByPhone = await post(baseUrl, '/api/v1/auth/login', {
    body: { identifier: payload.admin_phone, password: payload.admin_password },
  });
  assert.equal(loginByPhone.status, 200);

  // Wrong password must be rejected with 401
  const wrongPass = await post(baseUrl, '/api/v1/auth/login', {
    body: { identifier: school.username, password: 'WrongPassword123' },
  });
  assert.equal(wrongPass.status, 401);

  // Search schools by generated username (with and without @)
  const searchRes = await get(baseUrl, `/api/v1/auth/schools?q=@${encodeURIComponent(school.username)}`);
  assert.equal(searchRes.status, 200);
  assert.ok(Array.isArray(searchRes.body.data));
  const found = searchRes.body.data.find((s) => s.id === school.id);
  assert.ok(found, 'school should be searchable by its generated username');
  assert.equal(found.username, school.username);
  assert.equal(found.city, 'اصفهان');
  assert.deepEqual(found.majors, ['ریاضی و فیزیک', 'علوم تجربی']);
  assert.equal(found.password_hash, undefined, 'public school search must never expose password_hash');
  assert.equal(found.principal_phone, undefined, 'public school search must never expose principal_phone');

  // Authenticated management panel endpoint GET /api/v1/school/info returns complete school profile
  const infoRes = await get(baseUrl, '/api/v1/school/info', { token: accessToken });
  assert.equal(infoRes.status, 200);
  assert.equal(infoRes.body.data.name, payload.school_name);
  assert.equal(infoRes.body.data.username, school.username);
  assert.equal(infoRes.body.data.city, 'اصفهان');
  assert.equal(infoRes.body.data.level, 'متوسطه دوم (دبیرستان)');
  assert.deepEqual(infoRes.body.data.majors, ['ریاضی و فیزیک', 'علوم تجربی']);
  assert.equal(infoRes.body.data.principal_name, 'حسین فضیلت‌پور');
  assert.equal(infoRes.body.data.principal_phone, '09131234567');
  assert.equal(infoRes.body.data.password_hash, undefined);
});

test('two schools with the same principal name receive strictly unique usernames, and elementary schools store empty majors', async () => {
  const first = await post(baseUrl, '/api/v1/auth/register-school', {
    body: {
      school_name: 'دبستان شکوفه‌ها',
      school_level: 'دبستان (ابتدایی)',
      majors: ['ریاضی و فیزیک'],
      city: 'شیراز',
      admin_name: 'سارا کریمی',
      admin_phone: '09171112233',
      admin_password: 'PasswordOne1',
    },
  });
  assert.equal(first.status, 201);
  assert.deepEqual(first.body.data.school.majors, []);

  const second = await post(baseUrl, '/api/v1/auth/register-school', {
    body: {
      school_name: 'دبیرستان فرزانگان ۲',
      school_level: 'متوسطه دوم (دبیرستان)',
      majors: ['ادبیات و علوم انسانی'],
      city: 'مشهد',
      admin_name: 'سارا کریمی',
      admin_phone: '09152223344',
      admin_password: 'PasswordTwo2',
    },
  });
  assert.equal(second.status, 201);
  assert.notEqual(
    first.body.data.school.username,
    second.body.data.school.username,
    'second registrant with identical name must receive a distinct unique username'
  );
  assert.deepEqual(second.body.data.school.majors, ['ادبیات و علوم انسانی']);
});
