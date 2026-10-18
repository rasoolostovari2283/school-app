// Comprehensive End-to-End Test for All 4 Roles / Panels
const http = require('http');

const BASE_URL = 'http://localhost:5000/api/v1';

function request(method, path, body = null, token = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE_URL + path);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    if (token) {
      options.headers['Authorization'] = `Bearer ${token}`;
    }

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, data: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, raw: data });
        }
      });
    });

    req.on('error', (err) => reject(err));

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function runTests() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('🧪 Starting End-to-End Registration & Panel Tests for 4 Roles');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const results = {
    teacher: { success: [], errors: [] },
    student: { success: [], errors: [] },
    parent: { success: [], errors: [] },
    admin: { success: [], errors: [] },
  };

  const timestamp = Date.now().toString().slice(-4);

  // ─────────────────────────────────────────────────────────────
  // 1. TEACHER PANEL TEST
  // ─────────────────────────────────────────────────────────────
  console.log('👨‍🏫 [1/4] Testing TEACHER Panel Registration & Features...');
  let teacherToken = null;
  try {
    const teacherReg = await request('POST', '/auth/quick-entry', {
      display_name: `استاد تست معلمی ${timestamp}`,
      phone: `0912111${timestamp}`,
      role: 'teacher',
      password: 'password123',
      school_name: 'دبیرستان استعدادهای درخشان علامه حلی ۱',
      grades: ['پایه دهم ریاضی', 'پایه یازدهم حسابان'],
      subject: 'حسابان و هندسه تحلیلی',
    });

    if (teacherReg.status === 200 || teacherReg.status === 201) {
      teacherToken = teacherReg.data?.data?.accessToken;
      results.teacher.success.push(`ثبت‌نام معلم هوشمند: نام‌کاربری ${teacherReg.data?.data?.user?.username}`);
    } else {
      results.teacher.errors.push(`خطا در ثبت‌نام معلم: HTTP ${teacherReg.status} - ${JSON.stringify(teacherReg.data)}`);
    }

    if (teacherToken) {
      // 1.1 /auth/me
      const me = await request('GET', '/auth/me', null, teacherToken);
      if (me.status === 200) results.teacher.success.push('احراز هویت پروفایل /auth/me');
      else results.teacher.errors.push(`/auth/me: ${me.status}`);

      // 1.2 /classes
      const classes = await request('GET', '/classes', null, teacherToken);
      if (classes.status === 200) results.teacher.success.push(`مشاهده کلاس‌ها /classes (${classes.data?.data?.classes?.length || 0} کلاس)`);
      else results.teacher.errors.push(`/classes: ${classes.status}`);

      // 1.3 /study-planner/teacher-plans - GET & POST
      const plannerGet = await request('GET', '/study-planner/teacher-plans', null, teacherToken);
      if (plannerGet.status === 200) results.teacher.success.push('مشاهده برنامه‌های درسی معلم /study-planner/teacher-plans');
      else results.teacher.errors.push(`/study-planner/teacher-plans (GET): ${plannerGet.status}`);

      const plannerPost = await request('POST', '/study-planner/teacher-plans', {
        title: `طرح درس مبحث حد و پیوستگی ${timestamp}`,
        grade: 'پایه دهم ریاضی',
        subject: 'حسابان',
        target_week: 'هفته سوم آبان',
        notes: 'حل تمرین‌های منتخب',
      }, teacherToken);
      if (plannerPost.status === 200 || plannerPost.status === 201) {
        results.teacher.success.push('ثبت طرح درس جدید معلم در /study-planner/teacher-plans');
      } else {
        results.teacher.errors.push(`/study-planner/teacher-plans (POST): ${plannerPost.status} - ${JSON.stringify(plannerPost.data)}`);
      }

      // 1.4 /videos/folders - Create & list folders
      const folderPost = await request('POST', '/videos/folders', {
        name: `پوشه تدریس ${timestamp}`,
        color: '#6366f1',
      }, teacherToken);
      if (folderPost.status === 200 || folderPost.status === 201) {
        results.teacher.success.push('ایجاد پوشه ویدیو در /videos/folders');
      } else {
        results.teacher.errors.push(`/videos/folders (POST): ${folderPost.status}`);
      }

      const foldersGet = await request('GET', '/videos/folders', null, teacherToken);
      if (foldersGet.status === 200) results.teacher.success.push('مشاهده پوشه‌های ویدیو /videos/folders');
      else results.teacher.errors.push(`/videos/folders (GET): ${foldersGet.status}`);

      // 1.5 /assignments
      const asg = await request('GET', '/assignments', null, teacherToken);
      if (asg.status === 200) results.teacher.success.push('مشاهده تکالیف /assignments');
      else results.teacher.errors.push(`/assignments: ${asg.status}`);

      // 1.6 /quizzes
      const qz = await request('GET', '/quizzes', null, teacherToken);
      if (qz.status === 200) results.teacher.success.push('مشاهده کوییزها /quizzes');
      else results.teacher.errors.push(`/quizzes: ${qz.status}`);

      // 1.7 /messages/groups
      const msg = await request('GET', '/messages/groups', null, teacherToken);
      if (msg.status === 200) results.teacher.success.push('مشاهده پیام‌ها و گروه‌ها /messages/groups');
      else results.teacher.errors.push(`/messages/groups: ${msg.status}`);

      // 1.8 /announcements
      const ann = await request('GET', '/announcements', null, teacherToken);
      if (ann.status === 200) results.teacher.success.push('مشاهده اطلاعیه‌ها /announcements');
      else results.teacher.errors.push(`/announcements: ${ann.status}`);
    }
  } catch (err) {
    results.teacher.errors.push(`خطای غیرمنتظره در پنل معلم: ${err.message}`);
  }

  // ─────────────────────────────────────────────────────────────
  // 2. STUDENT PANEL TEST
  // ─────────────────────────────────────────────────────────────
  console.log('\n🎓 [2/4] Testing STUDENT Panel Registration & Features...');
  let studentToken = null;
  try {
    const studentReg = await request('POST', '/auth/quick-entry', {
      display_name: `دانش‌آموز تست کیانی ${timestamp}`,
      phone: `0919222${timestamp}`,
      role: 'student',
      password: 'password123',
      school_name: 'دبیرستان استعدادهای درخشان علامه حلی ۱',
      grade: 'پایه دهم ریاضی',
    });

    if (studentReg.status === 200 || studentReg.status === 201) {
      studentToken = studentReg.data?.data?.accessToken;
      results.student.success.push(`ثبت‌نام دانش‌آموز هوشمند: نام‌کاربری ${studentReg.data?.data?.user?.username}`);
    } else {
      results.student.errors.push(`خطا در ثبت‌نام دانش‌آموز: HTTP ${studentReg.status}`);
    }

    if (studentToken) {
      // 2.1 /auth/me
      const me = await request('GET', '/auth/me', null, studentToken);
      if (me.status === 200) results.student.success.push('احراز هویت دانش‌آموز /auth/me');
      else results.student.errors.push(`/auth/me: ${me.status}`);

      // 2.2 /classes
      const classes = await request('GET', '/classes', null, studentToken);
      if (classes.status === 200) results.student.success.push('مشاهده کلاس‌های دانش‌آموز /classes');
      else results.student.errors.push(`/classes: ${classes.status}`);

      // 2.3 /assignments
      const asg = await request('GET', '/assignments', null, studentToken);
      if (asg.status === 200) results.student.success.push('مشاهده تکالیف تحویلی /assignments');
      else results.student.errors.push(`/assignments: ${asg.status}`);

      // 2.4 /quizzes
      const qz = await request('GET', '/quizzes', null, studentToken);
      if (qz.status === 200) results.student.success.push('مشاهده آزمون‌ها و کوییزها /quizzes');
      else results.student.errors.push(`/quizzes: ${qz.status}`);

      // 2.5 /study-planner/logs
      const sp = await request('GET', '/study-planner/logs', null, studentToken);
      if (sp.status === 200) results.student.success.push('مشاهده برنامه‌ریزی مطالعه /study-planner/logs');
      else results.student.errors.push(`/study-planner/logs: ${sp.status}`);

      // 2.6 /videos
      const vid = await request('GET', '/videos', null, studentToken);
      if (vid.status === 200) results.student.success.push('مشاهده ویدیوهای آموزشی /videos');
      else results.student.errors.push(`/videos: ${vid.status}`);

      // 2.7 /messages/groups
      const msg = await request('GET', '/messages/groups', null, studentToken);
      if (msg.status === 200) results.student.success.push('مشاهده گروه‌های کلاسی /messages/groups');
      else results.student.errors.push(`/messages/groups: ${msg.status}`);
    }
  } catch (err) {
    results.student.errors.push(`خطای غیرمنتظره در پنل دانش‌آموز: ${err.message}`);
  }

  // ─────────────────────────────────────────────────────────────
  // 3. PARENT PANEL TEST
  // ─────────────────────────────────────────────────────────────
  console.log('\n👨‍👩‍👦 [3/4] Testing PARENT Panel Registration & Features...');
  let parentToken = null;
  try {
    const parentReg = await request('POST', '/auth/quick-entry', {
      display_name: `ولی گرامی صادقی ${timestamp}`,
      phone: `0935333${timestamp}`,
      role: 'parent',
      password: 'password123',
      school_name: 'دبیرستان استعدادهای درخشان علامه حلی ۱',
      student_code: 'STD-40301',
    });

    if (parentReg.status === 200 || parentReg.status === 201) {
      parentToken = parentReg.data?.data?.accessToken;
      results.parent.success.push(`ثبت‌نام اولیا: نام‌کاربری ${parentReg.data?.data?.user?.username}`);
    } else {
      results.parent.errors.push(`خطا در ثبت‌نام اولیا: HTTP ${parentReg.status}`);
    }

    if (parentToken) {
      // 3.1 /auth/me
      const me = await request('GET', '/auth/me', null, parentToken);
      if (me.status === 200) results.parent.success.push('پروفایل ولی دانش‌آموز /auth/me');
      else results.parent.errors.push(`/auth/me: ${me.status}`);

      // 3.2 /classes/parent/children
      const ch = await request('GET', '/classes/parent/children', null, parentToken);
      if (ch.status === 200) results.parent.success.push('مشاهده وضعیت فرزندان /classes/parent/children');
      else results.parent.errors.push(`/classes/parent/children: ${ch.status}`);

      // 3.3 /assignments (child assignments)
      const asg = await request('GET', '/assignments', null, parentToken);
      if (asg.status === 200) results.parent.success.push('مشاهده تکالیف فرزند /assignments');
      else results.parent.errors.push(`/assignments: ${asg.status}`);

      // 3.4 /quizzes (child quizzes)
      const qz = await request('GET', '/quizzes', null, parentToken);
      if (qz.status === 200) results.parent.success.push('مشاهده نمرات و کوییزهای فرزند /quizzes');
      else results.parent.errors.push(`/quizzes: ${qz.status}`);

      // 3.5 /messages/directory
      const msg = await request('GET', '/messages/directory', null, parentToken);
      if (msg.status === 200) results.parent.success.push('دایرکتوری اولیا و کادر مدرسه /messages/directory');
      else results.parent.errors.push(`/messages/directory: ${msg.status}`);
    }
  } catch (err) {
    results.parent.errors.push(`خطای غیرمنتظره در پنل اولیا: ${err.message}`);
  }

  // ─────────────────────────────────────────────────────────────
  // 4. ADMIN / MANAGEMENT PANEL TEST
  // ─────────────────────────────────────────────────────────────
  console.log('\n🏛️ [4/4] Testing ADMIN / School Registration & Features...');
  let adminToken = null;
  try {
    const schoolReg = await request('POST', '/auth/register-school', {
      school_name: `مجتمع آموزشی نمونه رشد ${timestamp}`,
      school_level: 'متوسطه دوم (دبیرستان)',
      city: 'تهران',
      admin_name: `دکتر بهرامی ${timestamp}`,
      admin_phone: `0912999${timestamp}`,
      admin_password: 'password123',
    });

    if (schoolReg.status === 200 || schoolReg.status === 201) {
      adminToken = schoolReg.data?.data?.accessToken;
      results.admin.success.push(`ثبت مدرسه جدید و حساب مدیر: کد مدرسه ${schoolReg.data?.data?.school?.school_code}`);
    } else {
      results.admin.errors.push(`خطا در ثبت مدرسه: HTTP ${schoolReg.status} - ${JSON.stringify(schoolReg.data)}`);
    }

    if (adminToken) {
      // 4.1 /auth/me
      const me = await request('GET', '/auth/me', null, adminToken);
      if (me.status === 200) results.admin.success.push('احراز هویت مدیر مجتمع /auth/me');
      else results.admin.errors.push(`/auth/me: ${me.status}`);

      // 4.2 /classes (Class Registry)
      const cls = await request('GET', '/classes', null, adminToken);
      if (cls.status === 200) results.admin.success.push('مدیریت کلاس‌های مدرسه /classes');
      else results.admin.errors.push(`/classes: ${cls.status}`);

      // 4.3 /messages/directory (School Personnel Directory)
      const tch = await request('GET', '/messages/directory', null, adminToken);
      if (tch.status === 200) results.admin.success.push('دایرکتوری و پرسنل مدرسه /messages/directory');
      else results.admin.errors.push(`/messages/directory: ${tch.status}`);

      // 4.4 /announcements (School Announcements)
      const ann = await request('GET', '/announcements', null, adminToken);
      if (ann.status === 200) results.admin.success.push('بخشنامه‌ها و اعلان‌های مدرسه /announcements');
      else results.admin.errors.push(`/announcements: ${ann.status}`);

      // 4.5 /announcements - POST a new announcement
      const annPost = await request('POST', '/announcements', {
        title: `بخشنامه شماره ${timestamp}: تقویم سال تحصیلی جدید`,
        content: 'جلسه شورای دبیران و اولیا روز دوشنبه برگزار می‌شود.',
        target_role: 'all',
        is_mandatory: false,
      }, adminToken);
      if (annPost.status === 200 || annPost.status === 201) {
        results.admin.success.push('ثبت بخشنامه جدید در /announcements');
      } else {
        results.admin.errors.push(`/announcements (POST): ${annPost.status} - ${JSON.stringify(annPost.data)}`);
      }

      // 4.6 /messages/groups (Admin broadcast / channels)
      const msg = await request('GET', '/messages/groups', null, adminToken);
      if (msg.status === 200) results.admin.success.push('کانال‌های رسمی ستاد مدرسه /messages/groups');
      else results.admin.errors.push(`/messages/groups: ${msg.status}`);
    }
  } catch (err) {
    results.admin.errors.push(`خطای غیرمنتظره در پنل مدیریت: ${err.message}`);
  }

  // ─────────────────────────────────────────────────────────────
  // Summary
  // ─────────────────────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('📊 FINAL TEST RESULTS SUMMARY:');
  console.log('═══════════════════════════════════════════════════════════════');

  for (const [panel, res] of Object.entries(results)) {
    console.log(`\n🔹 [${panel.toUpperCase()}] Panel:`);
    console.log(`   ✅ Successful checks (${res.success.length}):`);
    res.success.forEach((s) => console.log(`      ✓ ${s}`));
    if (res.errors.length > 0) {
      console.log(`   ❌ Errors found (${res.errors.length}):`);
      res.errors.forEach((e) => console.log(`      ✗ ${e}`));
    } else {
      console.log(`   🎉 100% OK - Zero Errors!`);
    }
  }

  const totalErrors = Object.values(results).reduce((acc, r) => acc + r.errors.length, 0);
  console.log('\n═══════════════════════════════════════════════════════════════');
  if (totalErrors === 0) {
    console.log('🌟 ALL 4 PANELS & REGISTRATION FLOWS WORKING PERFECTLY (100% PASS)!');
  } else {
    console.log(`⚠️ Found ${totalErrors} issue(s) to address.`);
  }
  console.log('═══════════════════════════════════════════════════════════════\n');
}

runTests();
