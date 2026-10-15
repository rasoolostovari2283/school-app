exports.seed = async function (knex) {
  // ── 1. Seed Courses (دروس انتخابی و تخصصی / سامانه مشابه سس) ──
  const coursesCount = await knex('courses').count('id as count').first();
  if (parseInt(coursesCount.count, 10) === 0) {
    await knex('courses').insert([
      {
        id: 'crs-math-201',
        code: 'MATH-201',
        name: 'حسابان ۲ و کاربرد مشتق (پیشرفته)',
        description: 'مباحث مشتق‌گیری پیشرفته، رسم نمودار توابع و مسائل بهینه‌سازی کنکور و المپیاد',
        credits: 4,
        department: 'دپارتمان ریاضیات',
        semester: 'نیمسال اول ۱۴۰۳-۱۴۰۴',
        teacher_id: 'staff-akbari',
        capacity: 35,
        enrolled_count: 24,
        schedule: 'شنبه و دوشنبه ۰۸:۰۰ الی ۰۹:۴۵',
        exam_date: '۱۴۰۳/۱۰/۲۲ ساعت ۰۹:۰۰',
        is_active: true,
      },
      {
        id: 'crs-phys-301',
        code: 'PHYS-301',
        name: 'فیزیک اتمی و کوانتومی پیشرفته',
        description: 'آشنایی با مدل‌های اتمی، فوتوالکتریک و امواج الکترومغناطیسی با تمرکز بر المپیاد فیزیک',
        credits: 3,
        department: 'دپارتمان فیزیک',
        semester: 'نیمسال اول ۱۴۰۳-۱۴۰۴',
        teacher_id: 'staff-rahmani',
        capacity: 30,
        enrolled_count: 19,
        schedule: 'یکشنبه و سه‌شنبه ۱۰:۱۵ الی ۱۱:۴۵',
        exam_date: '۱۴۰۳/۱۰/۲۵ ساعت ۱۰:۳۰',
        is_active: true,
      },
      {
        id: 'crs-chem-102',
        code: 'CHEM-102',
        name: 'شیمی آلی و سنتز ترکیبات دارویی',
        description: 'مکانیسم واکنش‌های آلی، سنتز استرها و تحلیل تست‌های چالشی سنجش',
        credits: 3,
        department: 'دپارتمان شیمی',
        semester: 'نیمسال اول ۱۴۰۳-۱۴۰۴',
        teacher_id: 'staff-taghavi',
        capacity: 25,
        enrolled_count: 25,
        schedule: 'چهارشنبه‌ها ۰۸:۰۰ الی ۱۱:۳۰ (کارگاهی)',
        exam_date: '۱۴۰۳/۱۰/۲۸ ساعت ۰۸:۳۰',
        is_active: true,
      },
      {
        id: 'crs-comp-401',
        code: 'COMP-401',
        name: 'الگوریتم‌های پیشرفته و برنامه‌نویسی المپیاد',
        description: 'طراحی الگوریتم، گراف و برنامه‌نویسی پویا با پایتون و C++ ویژه اعضای تیم المپیاد کامپیوتر',
        credits: 2,
        department: 'دپارتمان کامپیوتر و هوش مصنوعی',
        semester: 'نیمسال اول ۱۴۰۳-۱۴۰۴',
        teacher_id: 'staff-mirzaei',
        capacity: 20,
        enrolled_count: 14,
        schedule: 'پنج‌شنبه‌ها ۱۲:۳۰ الی ۱۴:۳۰',
        exam_date: '۱۴۰۳/۱۱/۰۲ ساعت ۱۱:۰۰',
        is_active: true,
      },
      {
        id: 'crs-bio-202',
        code: 'BIO-202',
        name: 'ژنتیک مولکولی و مهندسی ژن',
        description: 'فناوری CRISPR، انتقال ژن، رونویسی و همانندسازی در سلول‌های یوکاریوتی',
        credits: 3,
        department: 'دپارتمان زیست‌شناسی',
        semester: 'نیمسال اول ۱۴۰۳-۱۴۰۴',
        teacher_id: 'staff-sadeghi',
        capacity: 30,
        enrolled_count: 21,
        schedule: 'دوشنبه‌ها ۱۳:۰۰ الی ۱۵:۰۰',
        exam_date: '۱۴۰۳/۱۱/۰۵ ساعت ۰۹:۰۰',
        is_active: true,
      },
    ]);
  }

  // ── 2. Seed Academic Calendar Events (تقویم آموزشی رسمی) ──
  const eventsCount = await knex('academic_events').count('id as count').first();
  if (parseInt(eventsCount.count, 10) === 0) {
    await knex('academic_events').insert([
      {
        id: 'evt-1',
        title: 'مهلت انتخاب واحد و ثبت‌نام نیمسال دوم',
        description: 'کلیه دانش‌آموزان موظفند با مراجعه به پورتال انتخاب واحد، حداقل ۱۲ و حداکثر ۲۰ واحد را اخذ نمایند.',
        event_type: 'enrollment',
        start_date: '2026-10-01',
        end_date: '2026-10-07',
        semester: '۱۴۰۳-۱۴۰۴',
        is_important: true,
      },
      {
        id: 'evt-2',
        title: 'شروع کلاس‌های نیمسال اول',
        description: 'آغاز رسمی جلسات حضوری و کلاس‌های تخصصی مطابق برنامه هفتگی',
        event_type: 'semester_start',
        start_date: '2026-10-08',
        end_date: null,
        semester: '۱۴۰۳-۱۴۰۴',
        is_important: true,
      },
      {
        id: 'evt-3',
        title: 'بازه حذف و اضافه (Drop / Add)',
        description: 'امکان تغییر حداکثر ۲ درس در پورتال آموزشی بدون کسر شهریه یا سابقه',
        event_type: 'drop_add',
        start_date: '2026-10-18',
        end_date: '2026-10-22',
        semester: '۱۴۰۳-۱۴۰۴',
        is_important: false,
      },
      {
        id: 'evt-4',
        title: 'شروع امتحانات میان‌ترم',
        description: 'آزمون‌های هماهنگ تستی و تشریحی مرحله اول دبیرستان',
        event_type: 'exam_start',
        start_date: '2026-11-15',
        end_date: '2026-11-26',
        semester: '۱۴۰۳-۱۴۰۴',
        is_important: true,
      },
      {
        id: 'evt-5',
        title: 'ارزشیابی کیفیت تدریس اساتید (نظرسنجی سس)',
        description: 'فرم ارزشیابی مخفیانه عملکرد دبیران توسط دانش‌آموزان در سامانه',
        event_type: 'holiday',
        start_date: '2026-12-05',
        end_date: '2026-12-15',
        semester: '۱۴۰۳-۱۴۰۴',
        is_important: false,
      },
    ]);
  }

  // ── 3. Seed Course Enrollments for Students ──
  const enrCount = await knex('course_enrollments').count('id as count').first();
  if (parseInt(enrCount.count, 10) === 0) {
    const students = await knex('users').where({ role: 'student' }).select('id');
    for (const st of students) {
      await knex('course_enrollments').insert([
        {
          id: `enr-${st.id}-math`,
          course_id: 'crs-math-201',
          student_id: st.id,
          status: 'completed',
          grade: 19.5,
          grade_point: 19.5,
        },
        {
          id: `enr-${st.id}-phys`,
          course_id: 'crs-phys-301',
          student_id: st.id,
          status: 'completed',
          grade: 18.25,
          grade_point: 18.25,
        },
        {
          id: `enr-${st.id}-chem`,
          course_id: 'crs-chem-102',
          student_id: st.id,
          status: 'enrolled',
          grade: null,
          grade_point: null,
        },
      ]);
    }
  }

  // ── 4. Seed Feedback Tickets ──
  const fbCount = await knex('feedback').count('id as count').first();
  if (parseInt(fbCount.count, 10) === 0) {
    await knex('feedback').insert([
      {
        id: 'fb-001',
        tracking_code: 'FB-SESS-9481',
        category: 'educational',
        message: 'پیشنهاد می‌شود زمان آزمون آزمایشی فیزیک به دلیل فشردگی امتحانات روز دوشنبه به پنج‌شنبه منتقل شود.',
        response: 'با هماهنگی شورای دبیران و معاونت آموزشی، آزمون به روز پنج‌شنبه ۱۰:۳۰ صبح منتقل گردید.',
        status: 'resolved',
        is_anonymous: true,
        created_at: knex.fn.now(),
        responded_at: knex.fn.now(),
      },
      {
        id: 'fb-002',
        tracking_code: 'FB-SESS-9482',
        category: 'facility',
        message: 'سرعت اینترنت سایت کامپیوتر در زمان آزمون‌های برخط المپیاد نیاز به افزایش پهنای باند داخلی دارد.',
        response: 'تجهیزات مودم و سوییچ گیگابیتی جدید در اتاق سرور نصب شد و پهنای باند به ۱۰۰ مگابیت اختصاصی ارتقا یافت.',
        status: 'resolved',
        is_anonymous: true,
        created_at: knex.fn.now(),
        responded_at: knex.fn.now(),
      },
    ]);
  }
};
