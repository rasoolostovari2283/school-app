exports.seed = async function (knex) {
  const DEFAULT_SCHOOL_ID = 'sch-1';

  // ── 1. Seed Gradebook Categories & Scores ──
  const classObj = await knex('classes').where({ school_id: DEFAULT_SCHOOL_ID }).first() || await knex('classes').first();
  if (classObj) {
    const catsCount = await knex('gradebook_categories').where('class_id', classObj.id).count('id as count').first();
    if (parseInt(catsCount.count, 10) === 0) {
      const cat1Id = 'cat-term1-cont';
      const cat2Id = 'cat-midterm';
      const cat3Id = 'cat-term1-final';

      await knex('gradebook_categories').insert([
        {
          id: cat1Id,
          class_id: classObj.id,
          title: 'نمره مستمر و فعالیت کلاسی (نوبت اول)',
          weight: 1.0,
          max_score: 20.0,
          term: 'term1',
        },
        {
          id: cat2Id,
          class_id: classObj.id,
          title: 'آزمون میان‌ترم تستی و تشریحی',
          weight: 2.0,
          max_score: 20.0,
          term: 'midterm',
        },
        {
          id: cat3Id,
          class_id: classObj.id,
          title: 'امتحان پایانی نوبت اول (هماهنگ کشوری)',
          weight: 4.0,
          max_score: 20.0,
          term: 'term1',
        },
      ]);

      const students = await knex('users').where({ role: 'student', school_id: DEFAULT_SCHOOL_ID }).select('id');
      for (const st of students) {
        const existingScore = await knex('gradebook_scores').where({ category_id: cat1Id, student_id: st.id }).first();
        if (!existingScore) {
          await knex('gradebook_scores').insert([
            {
              id: `score-${st.id}-1`,
              category_id: cat1Id,
              student_id: st.id,
              score: 19.5,
              teacher_comment: 'مشارکت فعال در حل تمرین‌های سخت تخته کلاسی',
            },
            {
              id: `score-${st.id}-2`,
              category_id: cat2Id,
              student_id: st.id,
              score: 18.75,
              teacher_comment: 'درصد تستی ۸۲٪ در بخش سوالات تحلیلی',
            },
            {
              id: `score-${st.id}-3`,
              category_id: cat3Id,
              student_id: st.id,
              score: 19.0,
              teacher_comment: 'پاسخ‌های کامل و دقیق در بخش تشریحی',
            },
          ]);
        }
      }
    }

    // ── 2. Seed Weekly Schedule ──
    const schedCount = await knex('weekly_schedules').count('id as count').first();
    if (parseInt(schedCount.count, 10) === 0) {
      await knex('weekly_schedules').insert([
        {
          id: 'sch-1',
          class_id: classObj.id,
          teacher_id: classObj.teacher_id,
          subject: 'حسابان ۲ و کاربرد مشتق',
          day_of_week: 0, // شنبه
          period_number: 1,
          start_time: '07:45',
          end_time: '09:15',
          room: 'کلاس ۳۰۱ (سالن خوارزمی)',
        },
        {
          id: 'sch-2',
          class_id: classObj.id,
          teacher_id: classObj.teacher_id,
          subject: 'هندسه تحلیلی و جبر خطی',
          day_of_week: 0, // شنبه
          period_number: 2,
          start_time: '09:30',
          end_time: '11:00',
          room: 'کلاس ۳۰۱ (سالن خوارزمی)',
        },
        {
          id: 'sch-3',
          class_id: classObj.id,
          teacher_id: classObj.teacher_id,
          subject: 'کارگاه المپیاد و حل مسائل خلاق',
          day_of_week: 1, // یکشنبه
          period_number: 1,
          start_time: '07:45',
          end_time: '09:15',
          room: 'سایت تخصصی کامپیوتر',
        },
        {
          id: 'sch-4',
          class_id: classObj.id,
          teacher_id: classObj.teacher_id,
          subject: 'فیزیک اتمی و کوانتومی',
          day_of_week: 2, // دوشنبه
          period_number: 2,
          start_time: '09:30',
          end_time: '11:00',
          room: 'آزمایشگاه مرکزی فیزیک',
        },
        {
          id: 'sch-5',
          class_id: classObj.id,
          teacher_id: classObj.teacher_id,
          subject: 'شیمی سنتز و آزمایشگاه',
          day_of_week: 3, // سه‌شنبه
          period_number: 3,
          start_time: '11:15',
          end_time: '12:45',
          room: 'آزمایشگاه شیمی دکتر حسابی',
        },
      ]);
    }
  }

  // ── 3. Seed Discipline & Counseling Records ──
  const discCount = await knex('discipline_records').count('id as count').first();
  if (parseInt(discCount.count, 10) === 0) {
    const student = await knex('users').where({ role: 'student', school_id: DEFAULT_SCHOOL_ID }).first();
    const teacher = await knex('users').where({ role: 'teacher', school_id: DEFAULT_SCHOOL_ID }).first();

    if (student && teacher) {
      await knex('discipline_records').insert([
        {
          id: 'disc-1',
          student_id: student.id,
          issuer_id: teacher.id,
          type: 'reward',
          category: 'olympiad',
          title: 'کارت تشویق طلایی: کسب رتبه اول مرحله استانی المپیاد',
          description: 'تلاش و پشتکار علمی استثنایی و درخشش در آزمون‌های جامع کشوری',
          points: 1.5,
          date: '۱۴۰۳/۰۷/۱۰',
          is_parent_viewable: true,
        },
        {
          id: 'disc-2',
          student_id: student.id,
          issuer_id: teacher.id,
          type: 'reward',
          category: 'academic',
          title: 'کارت تشویق: بالاترین نمره تراز در آزمون جامع شیمی',
          description: 'کسب تراز ۷۴۰۰ و ارتقای چشمگیر در تحلیل سوالات المپیادی',
          points: 1.0,
          date: '۱۴۰۳/۰۷/۱۵',
          is_parent_viewable: true,
        },
        {
          id: 'disc-3',
          student_id: student.id,
          issuer_id: teacher.id,
          type: 'warning',
          category: 'punctuality',
          title: 'تذکر انضباطی: تأخیر ورود به زنگ اول آزمایشگاه',
          description: 'تأخیر ۱۵ دقیقه‌ای در شروع کارگاه آزمایشگاهی شیمی',
          points: -0.5,
          date: '۱۴۰۳/۰۷/۲۰',
          is_parent_viewable: true,
        },
      ]);

      await knex('counseling_cases').insert([
        {
          id: 'couns-1',
          student_id: student.id,
          counselor_id: 'staff-sadeghi',
          session_title: 'جلسه پایش راندمان مطالعه و برنامه‌ریزی کنکور و المپیاد',
          session_date: '۱۴۰۳/۰۷/۱۸',
          student_concerns: 'مدیریت زمان بین تکالیف مدرسه و حل تمرین‌های تشریحی المپیاد',
          counselor_notes: 'دانش‌آموز دارای هوش تحلیلی بالاست، توصیه شد سیستم پومودورو ۵۰/۱۰ اجرا شود.',
          recommendations: 'همکاری اولیا در تنظیم ساعات خواب شبانه و اختصاص روزهای جمعه به بازیابی انرژی.',
          follow_up_date: '۱۴۰۳/۰۸/۰۵',
          status: 'completed',
          shared_with_parent: true,
        },
      ]);
    }
  }

  // ── 4. Seed School Tickets ──
  const tckCount = await knex('school_tickets').count('id as count').first();
  if (parseInt(tckCount.count, 10) === 0) {
    const parent = await knex('users').where({ role: 'parent', school_id: DEFAULT_SCHOOL_ID }).first();
    const teacher = await knex('users').where({ role: 'teacher', school_id: DEFAULT_SCHOOL_ID }).first();

    if (parent && teacher) {
      const ticketId = 'tck-demo-1';
      await knex('school_tickets').insert({
        id: ticketId,
        ticket_number: 'TCK-1403-101',
        user_id: parent.id,
        department: 'educational',
        priority: 'high',
        subject: 'درخواست زمان مشاوره حضوری جهت بررسی پیشرفت تحصیلی فرزند',
        message: 'با سلام و احترام، مایل هستم در خصوص تراز آزمون‌های آزمایشی و نحوه انتخاب دروس تکمیلی با مشاور پایه صحبت کنم.',
        status: 'resolved',
        assigned_to: teacher.id,
      });

      await knex('school_ticket_messages').insert([
        {
          id: 'msg-tck-1',
          ticket_id: ticketId,
          sender_id: parent.id,
          message: 'با سلام و احترام، مایل هستم در خصوص تراز آزمون‌های آزمایشی و نحوه انتخاب دروس تکمیلی با مشاور پایه صحبت کنم.',
        },
        {
          id: 'msg-tck-2',
          ticket_id: ticketId,
          sender_id: teacher.id,
          message: 'سلام و احترام خدمت ولی محترم؛ وقت جلسه حضوری برای روز دوشنبه ساعت ۱۰:۳۰ در اتاق مشاوره هماهنگ گردید.',
        },
      ]);
    }
  }

  // ── 5. Seed Tuition Ledgers & Installments for Students ──
  const students = await knex('users').where({ role: 'student', school_id: DEFAULT_SCHOOL_ID }).select('id', 'display_name');
  for (const st of students) {
    const existingLedger = await knex('tuition_ledgers').where({ student_id: st.id }).first();
    if (!existingLedger) {
      const ledgerId = `led-${st.id}`;
      await knex('tuition_ledgers').insert({
        id: ledgerId,
        student_id: st.id,
        academic_year: '1403-1404',
        total_amount: 450000000,
        paid_amount: 150000000,
        discount_amount: 30000000,
        balance: 270000000,
        status: 'partial',
      });

      await knex('tuition_installments').insert([
        {
          id: `inst-${st.id}-1`,
          ledger_id: ledgerId,
          installment_number: 1,
          title: 'پیش‌پرداخت ثبت‌نام و خدمات آموزشی نوبت اول',
          amount: 150000000,
          due_date: '۱۴۰۳/۰۷/۱۵',
          paid_at: '۱۴۰۳/۰۷/۱۲',
          bank_name: 'شاپرک آنلاین (۶۰۳۷-****-****-۴۸۱۲)',
          tracking_number: 'SHP-88412095',
          status: 'verified',
        },
        {
          id: `inst-${st.id}-2`,
          ledger_id: ledgerId,
          installment_number: 2,
          title: 'قسط دوم شهریه و کلاس‌های فوق‌برنامه المپیاد',
          amount: 135000000,
          due_date: '۱۴۰۳/۱۰/۱۵',
          status: 'pending',
        },
        {
          id: `inst-${st.id}-3`,
          ledger_id: ledgerId,
          installment_number: 3,
          title: 'قسط سوم و تسویه نهایی سال تحصیلی',
          amount: 135000000,
          due_date: '۱۴۰۳/۱۲/۱۵',
          status: 'pending',
        },
      ]);
    }
  }
};
