const bcrypt = require('bcryptjs');

exports.seed = async function (knex) {
  if (process.env.DISABLE_DEMO_SEED === 'true') {
    console.log('ℹ️ [EduConnect Seed] Skipping demo seed (DISABLE_DEMO_SEED=true).');
    return;
  }
  const seedPassword = process.env.DEMO_SEED_PASSWORD || '123456';
  const passwordHash = await bcrypt.hash(seedPassword, 10);
  const DEFAULT_SCHOOL_ID = 'sch-1';
  const DEFAULT_SCHOOL_NAME = 'دبیرستان استعدادهای درخشان علامه حلی ۱ (تهران)';
  const DEFAULT_SCHOOL_CODE = 'SCH-1001';

  // ── 0. Ensure Default School Exists ──
  const existingSchool = await knex('schools').where({ id: DEFAULT_SCHOOL_ID }).first();
  if (!existingSchool) {
    await knex('schools').insert({
      id: DEFAULT_SCHOOL_ID,
      name: DEFAULT_SCHOOL_NAME,
      code: DEFAULT_SCHOOL_CODE,
      city: 'تهران',
    });
  }

  const schoolSettings = JSON.stringify({
    school_name: DEFAULT_SCHOOL_NAME,
    school_code: DEFAULT_SCHOOL_CODE,
    school_level: 'متوسطه دوم (دبیرستان)',
    city: 'تهران',
    principal: 'دکتر علیرضا تقوی',
    is_school_registered: true,
    is_teacher_onboarded: true,
    schools: [DEFAULT_SCHOOL_NAME],
    taught_grades: ['پایه دهم', 'پایه یازدهم', 'پایه دوازدهم'],
  });

  // ── 1. Create or Update Staff & Personnel (with proper roles & school_id) ──
  const staff = [
    {
      id: 'staff-taghavi',
      email: 'principal@school.ir',
      phone: '09121110001',
      username: 'taghavi_admin',
      password_hash: passwordHash,
      role: 'admin',
      school_id: DEFAULT_SCHOOL_ID,
      display_name: 'دکتر علیرضا تقوی',
      personnel_code: 'EMP-98401',
      department: 'مدیریت و ستاد آموزشی',
      job_title: 'مدیر مجتمع آموزشی',
      locale: 'fa',
      is_verified: true,
      settings: schoolSettings,
    },
    {
      id: 'staff-mirzaei',
      email: 'mirzaei@school.ir',
      phone: '09121110002',
      username: 'mirzaei_edu',
      password_hash: passwordHash,
      role: 'teacher',
      school_id: DEFAULT_SCHOOL_ID,
      display_name: 'مهندس حسین میرزایی',
      personnel_code: 'EMP-98402',
      department: 'معاونت آموزشی',
      job_title: 'معاون آموزشی و امور المپیاد',
      locale: 'fa',
      is_verified: true,
      settings: schoolSettings,
    },
    {
      id: 'staff-sadeghi',
      email: 'sadeghi@school.ir',
      phone: '09121110003',
      username: 'sadeghi_counselor',
      password_hash: passwordHash,
      role: 'counselor',
      school_id: DEFAULT_SCHOOL_ID,
      display_name: 'دکتر فاطمه صادقی',
      personnel_code: 'EMP-98403',
      department: 'مرکز مشاوره و هدایت تحصیلی',
      job_title: 'مشاور ارشد تحصیلی و کنکور',
      locale: 'fa',
      is_verified: true,
      settings: schoolSettings,
    },
    {
      id: 'staff-akbari',
      email: 'akbari@school.ir',
      phone: '09121110004',
      username: 'akbari_math',
      password_hash: passwordHash,
      role: 'teacher',
      school_id: DEFAULT_SCHOOL_ID,
      display_name: 'استاد مسعود اکبری',
      personnel_code: 'EMP-98404',
      department: 'دپارتمان ریاضیات',
      job_title: 'دبیر ریاضیات پیشرفته و حسابان',
      locale: 'fa',
      is_verified: true,
      settings: schoolSettings,
    },
    {
      id: 'staff-jalali',
      email: 'jalali@school.ir',
      phone: '09121110005',
      username: 'jalali_phys',
      password_hash: passwordHash,
      role: 'teacher',
      school_id: DEFAULT_SCHOOL_ID,
      display_name: 'سرکار خانم مهندس جلالی',
      personnel_code: 'EMP-98405',
      department: 'دپارتمان فیزیک و آزمایشگاه',
      job_title: 'دبیر فیزیک پایه و المپیاد',
      locale: 'fa',
      is_verified: true,
      settings: schoolSettings,
    },
    {
      id: 'staff-rahmani',
      email: 'health@school.ir',
      phone: '09121110006',
      username: 'rahmani_health',
      password_hash: passwordHash,
      role: 'teacher',
      school_id: DEFAULT_SCHOOL_ID,
      display_name: 'دکتر مهدی رحمانی',
      personnel_code: 'EMP-98406',
      department: 'بهداشت و سلامت',
      job_title: 'پزشک و مراقب سلامت مدرسه',
      locale: 'fa',
      is_verified: true,
      settings: schoolSettings,
    },
    {
      id: 'staff-finance',
      email: 'finance@school.ir',
      phone: '09121110007',
      username: 'rezaei_finance',
      password_hash: passwordHash,
      role: 'financial_officer',
      school_id: DEFAULT_SCHOOL_ID,
      display_name: 'مهندس سعید رضایی',
      personnel_code: 'EMP-98407',
      department: 'امور مالی و حسابداری شهریه',
      job_title: 'مسئول امور مالی و شهریه',
      locale: 'fa',
      is_verified: true,
      settings: schoolSettings,
    },
  ];

  for (const s of staff) {
    const existing = await knex('users').where({ id: s.id }).first();
    if (!existing) {
      await knex('users').insert(s);
    } else {
      await knex('users').where({ id: s.id }).update({
        role: s.role,
        school_id: DEFAULT_SCHOOL_ID,
        username: s.username,
        personnel_code: s.personnel_code,
        department: s.department,
        job_title: s.job_title,
        display_name: s.display_name,
        settings: s.settings,
      });
    }
  }

  // ── 2. Create Students ──
  const students = [
    {
      id: 'std-hosseini',
      email: 'hosseini@student.ir',
      phone: '09351110001',
      username: 'hosseini_std',
      password_hash: passwordHash,
      role: 'student',
      school_id: DEFAULT_SCHOOL_ID,
      display_name: 'امیرحسین حسینی',
      student_code: 'STD-40301',
      department: 'پایه دهم ریاضی - کلاس ۱۰۱',
      job_title: 'دانش‌آموز',
      locale: 'fa',
      is_verified: true,
      settings: JSON.stringify({ school_name: DEFAULT_SCHOOL_NAME, school_code: DEFAULT_SCHOOL_CODE, grade: 'پایه دهم' }),
    },
    {
      id: 'std-ahmadi',
      email: 'ahmadi@student.ir',
      phone: '09351110002',
      username: 'ahmadi_std',
      password_hash: passwordHash,
      role: 'student',
      school_id: DEFAULT_SCHOOL_ID,
      display_name: 'پارسا احمدی',
      student_code: 'STD-40302',
      department: 'پایه دهم ریاضی - کلاس ۱۰۱',
      job_title: 'دانش‌آموز',
      locale: 'fa',
      is_verified: true,
      settings: JSON.stringify({ school_name: DEFAULT_SCHOOL_NAME, school_code: DEFAULT_SCHOOL_CODE, grade: 'پایه دهم' }),
    },
    {
      id: 'std-kiani',
      email: 'kiani@student.ir',
      phone: '09351110003',
      username: 'kiani_std',
      password_hash: passwordHash,
      role: 'student',
      school_id: DEFAULT_SCHOOL_ID,
      display_name: 'علی کیانی',
      student_code: 'STD-40303',
      department: 'پایه دهم تجربی - کلاس ۱۰۲',
      job_title: 'دانش‌آموز',
      locale: 'fa',
      is_verified: true,
      settings: JSON.stringify({ school_name: DEFAULT_SCHOOL_NAME, school_code: DEFAULT_SCHOOL_CODE, grade: 'پایه دهم' }),
    },
    {
      id: 'std-saeedi',
      email: 'saeedi@student.ir',
      phone: '09351110004',
      username: 'saeedi_std',
      password_hash: passwordHash,
      role: 'student',
      school_id: DEFAULT_SCHOOL_ID,
      display_name: 'محمدرضا سعیدی',
      student_code: 'STD-40304',
      department: 'پایه دهم تجربی - کلاس ۱۰۲',
      job_title: 'دانش‌آموز',
      locale: 'fa',
      is_verified: true,
      settings: JSON.stringify({ school_name: DEFAULT_SCHOOL_NAME, school_code: DEFAULT_SCHOOL_CODE, grade: 'پایه دهم' }),
    },
  ];

  for (const st of students) {
    const existing = await knex('users').where({ id: st.id }).first();
    if (!existing) {
      await knex('users').insert(st);
    } else {
      await knex('users').where({ id: st.id }).update({
        school_id: DEFAULT_SCHOOL_ID,
        username: st.username,
        student_code: st.student_code,
        department: st.department,
        job_title: st.job_title,
        display_name: st.display_name,
        settings: st.settings,
      });
    }
  }

  // ── 3. Create Parents ──
  const parents = [
    {
      id: 'parent-hosseini',
      email: 'p_hosseini@parent.ir',
      phone: '09122220001',
      username: 'hosseini_parent',
      password_hash: passwordHash,
      role: 'parent',
      school_id: DEFAULT_SCHOOL_ID,
      display_name: 'حاج‌محمد حسینی (پدر امیرحسین)',
      student_code: 'STD-40301',
      department: 'انجمن اولیاء و مربیان',
      job_title: 'رئیس انجمن اولیاء',
      locale: 'fa',
      is_verified: true,
      settings: JSON.stringify({ school_name: DEFAULT_SCHOOL_NAME, school_code: DEFAULT_SCHOOL_CODE }),
    },
    {
      id: 'parent-ahmadi',
      email: 'p_ahmadi@parent.ir',
      phone: '09122220002',
      username: 'ahmadi_parent',
      password_hash: passwordHash,
      role: 'parent',
      school_id: DEFAULT_SCHOOL_ID,
      display_name: 'دکتر بهرام احمدی (پدر پارسا)',
      student_code: 'STD-40302',
      department: 'انجمن اولیاء و مربیان',
      job_title: 'عضو کارگروه علمی انجمن',
      locale: 'fa',
      is_verified: true,
      settings: JSON.stringify({ school_name: DEFAULT_SCHOOL_NAME, school_code: DEFAULT_SCHOOL_CODE }),
    },
  ];

  for (const p of parents) {
    const existing = await knex('users').where({ id: p.id }).first();
    if (!existing) {
      await knex('users').insert(p);
    } else {
      await knex('users').where({ id: p.id }).update({
        school_id: DEFAULT_SCHOOL_ID,
        username: p.username,
        student_code: p.student_code,
        department: p.department,
        job_title: p.job_title,
        display_name: p.display_name,
        settings: p.settings,
      });
    }
  }

  // Seed parent_student_links
  const sampleLinks = [
    { id: 'link-hosseini', parent_id: 'parent-hosseini', student_id: 'std-hosseini', relation: 'father', is_verified: true },
    { id: 'link-ahmadi', parent_id: 'parent-ahmadi', student_id: 'std-ahmadi', relation: 'father', is_verified: true },
  ];
  for (const l of sampleLinks) {
    const existingL = await knex('parent_student_links').where({ parent_id: l.parent_id, student_id: l.student_id }).first();
    if (!existingL) {
      await knex('parent_student_links').insert(l);
    }
  }

  // ── 3.5 Ensure Default Classes & Class Members Exist ──
  const defaultClasses = [
    {
      id: 'cls-101',
      name: 'کلاس ۱۰۱ - پایه دهم ریاضی و فیزیک',
      subject: 'حسابان و ریاضیات پیشرفته',
      grade: 'پایه دهم',
      join_code: 'CLS-101',
      teacher_id: 'staff-akbari',
      school_id: DEFAULT_SCHOOL_ID,
    },
    {
      id: 'cls-102',
      name: 'کلاس ۱۰۲ - فیزیک و آزمایشگاه پیشرفته',
      subject: 'فیزیک پایه و المپیاد',
      grade: 'پایه دهم',
      join_code: 'CLS-102',
      teacher_id: 'staff-jalali',
      school_id: DEFAULT_SCHOOL_ID,
    },
  ];

  for (const cls of defaultClasses) {
    const existingCls = await knex('classes').where({ id: cls.id }).first();
    if (!existingCls) {
      await knex('classes').insert(cls);
    } else {
      await knex('classes').where({ id: cls.id }).update({ school_id: DEFAULT_SCHOOL_ID });
    }
  }

  // Ensure any other classes also have school_id
  await knex('classes').whereNull('school_id').update({ school_id: DEFAULT_SCHOOL_ID });

  const classEnrollments = [
    { id: 'cm-101-akbari', class_id: 'cls-101', user_id: 'staff-akbari', role: 'teacher' },
    { id: 'cm-101-hosseini', class_id: 'cls-101', user_id: 'std-hosseini', role: 'student' },
    { id: 'cm-101-ahmadi', class_id: 'cls-101', user_id: 'std-ahmadi', role: 'student' },
    { id: 'cm-101-kiani', class_id: 'cls-101', user_id: 'std-kiani', role: 'student' },
    { id: 'cm-101-saeedi', class_id: 'cls-101', user_id: 'std-saeedi', role: 'student' },
    { id: 'cm-102-jalali', class_id: 'cls-102', user_id: 'staff-jalali', role: 'teacher' },
    { id: 'cm-102-hosseini', class_id: 'cls-102', user_id: 'std-hosseini', role: 'student' },
    { id: 'cm-102-ahmadi', class_id: 'cls-102', user_id: 'std-ahmadi', role: 'student' },
  ];

  for (const ce of classEnrollments) {
    const existingCe = await knex('class_members').where({ class_id: ce.class_id, user_id: ce.user_id }).first();
    if (!existingCe) {
      await knex('class_members').insert(ce);
    }
  }

  // ── 4. Create Message Groups ──
  const groups = [
    {
      id: 'grp-teachers-council',
      name: 'شورای دبیران و کادر آموزشی مدرسه',
      description: 'هماهنگی برنامه‌های درسی، آزمون‌های پیشرفت تحصیلی و رویدادهای آموزشی',
      category: 'council',
      created_by: 'staff-taghavi',
    },
    {
      id: 'grp-parents-association',
      name: 'انجمن اولیاء و مربیان دبیرستان',
      description: 'ارتباط رسمی نمایندگان اولیا با مدیریت مجتمع و بررسی مسائل تربیتی-رفاهی',
      category: 'parents',
      created_by: 'staff-taghavi',
    },
    {
      id: 'grp-olympiad-math',
      name: 'کارگروه تخصصی المپیاد ریاضی و کامپیوتر',
      description: 'ارسال تمرین‌های مرحله اول و دوم، جلسات حل مسئله و برنامه‌ریزی کارگاه‌ها',
      category: 'olympiad',
      created_by: 'staff-akbari',
    },
    {
      id: 'grp-class-101',
      name: 'کلاس ۱۰۱ - ریاضی و فیزیک پیشرفته',
      description: 'کانال رسمی کلاسی برای اطلاعیه‌های کلاسی و تبادل علمی',
      category: 'class',
      created_by: 'staff-akbari',
    },
  ];

  for (const g of groups) {
    const existing = await knex('message_groups').where({ id: g.id }).first();
    if (!existing) {
      await knex('message_groups').insert(g);
    }
  }

  // Group members
  const groupMembers = [
    { group_id: 'grp-teachers-council', user_id: 'staff-taghavi', role: 'admin' },
    { group_id: 'grp-teachers-council', user_id: 'staff-mirzaei', role: 'admin' },
    { group_id: 'grp-teachers-council', user_id: 'staff-sadeghi', role: 'member' },
    { group_id: 'grp-teachers-council', user_id: 'staff-akbari', role: 'member' },
    { group_id: 'grp-teachers-council', user_id: 'staff-jalali', role: 'member' },
    { group_id: 'grp-teachers-council', user_id: 'staff-finance', role: 'member' },
    { group_id: 'grp-parents-association', user_id: 'staff-taghavi', role: 'admin' },
    { group_id: 'grp-parents-association', user_id: 'parent-hosseini', role: 'member' },
    { group_id: 'grp-parents-association', user_id: 'parent-ahmadi', role: 'member' },
    { group_id: 'grp-olympiad-math', user_id: 'staff-akbari', role: 'admin' },
    { group_id: 'grp-olympiad-math', user_id: 'std-hosseini', role: 'member' },
    { group_id: 'grp-olympiad-math', user_id: 'std-ahmadi', role: 'member' },
  ];

  for (const gm of groupMembers) {
    const existing = await knex('message_group_members')
      .where({ group_id: gm.group_id, user_id: gm.user_id })
      .first();
    if (!existing) {
      await knex('message_group_members').insert({
        id: `gm-${gm.group_id}-${gm.user_id}`,
        ...gm,
      });
    }
  }

  // Seed sample group messages
  const existingMsgs = await knex('message_group_messages').first();
  if (!existingMsgs) {
    await knex('message_group_messages').insert([
      {
        id: 'gmsg-1',
        group_id: 'grp-teachers-council',
        sender_id: 'staff-taghavi',
        content: 'همکاران گرامی و دبیران ارجمند، جلسه شورای دبیران روز سه‌شنبه ساعت ۱۶ در بستر آنلاین ادوکانکت برگزار خواهد شد.',
        sent_at: new Date(Date.now() - 3600000 * 24).toISOString(),
      },
      {
        id: 'gmsg-2',
        group_id: 'grp-teachers-council',
        sender_id: 'staff-sadeghi',
        content: 'کارنامه آزمون آزمایشی مرحله اول تحلیل شد و نتایج در سامانه ثبت گردیده است.',
        sent_at: new Date(Date.now() - 3600000 * 12).toISOString(),
      },
      {
        id: 'gmsg-3',
        group_id: 'grp-olympiad-math',
        sender_id: 'staff-akbari',
        content: 'سلام به اعضای تیم المپیاد. جزوه ترکیبیات پیشرفته و تمرین‌های دوره تابستانه در بخش فایل‌ها بارگذاری شد.',
        sent_at: new Date(Date.now() - 3600000 * 6).toISOString(),
      },
    ]);
  }

  // ── 5. Seed Study Planner Logs (دفتر برنامه‌ریزی تحصیلی) ──
  const existingStudy = await knex('study_logs').first();
  if (!existingStudy) {
    await knex('study_logs').insert([
      {
        id: 'study-1',
        student_id: 'std-hosseini',
        date: new Date().toISOString().slice(0, 10),
        subject: 'حسابان و دیفرانسیل',
        study_minutes_descriptive: 90,
        study_minutes_test: 120,
        tests_count: 60,
        tests_correct: 52,
        tests_wrong: 5,
        satisfaction_score: 5,
        student_notes: 'مبحث مشتق و کاربرد آن جمع‌بندی شد. تست‌های هم‌ارزی نیاز به مرور مجدد دارد.',
        advisor_feedback: 'عالی بود امیرحسین جان! دقت تست‌زنی ۸۶٪ است. تمرکزت را روی سوالات ترکیبی حفظ کن.',
        advisor_id: 'staff-sadeghi',
      },
      {
        id: 'study-2',
        student_id: 'std-hosseini',
        date: new Date(Date.now() - 86400000).toISOString().slice(0, 10),
        subject: 'فیزیک پیشرفته',
        study_minutes_descriptive: 60,
        study_minutes_test: 90,
        tests_count: 45,
        tests_correct: 38,
        tests_wrong: 4,
        satisfaction_score: 4,
        student_notes: 'فصل الکتریسیته ساکن و خازن‌ها تست زدم.',
        advisor_feedback: 'روند صعودی و باثبات است. زمان پاسخ‌دهی را کمی کاهش بده.',
        advisor_id: 'staff-sadeghi',
      },
      {
        id: 'study-3',
        student_id: 'std-hosseini',
        date: new Date(Date.now() - 86400000 * 2).toISOString().slice(0, 10),
        subject: 'شیمی ۳',
        study_minutes_descriptive: 75,
        study_minutes_test: 60,
        tests_count: 35,
        tests_correct: 30,
        tests_wrong: 3,
        satisfaction_score: 4,
        student_notes: 'مسائل استوکیومتری و سینتیک شیمیایی.',
        advisor_feedback: 'آفرین، نسبت مطالعه تشریحی به تستی در شیمی متناسب است.',
        advisor_id: 'staff-sadeghi',
      },
    ]);
  }
};
