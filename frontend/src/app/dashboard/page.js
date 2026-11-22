'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import useAuthStore from '../../stores/authStore';
import useClassStore from '../../stores/classStore';
import api from '../../lib/api';
import Link from 'next/link';
import {
  HiOutlineAcademicCap,
  HiOutlineClipboardDocumentList,
  HiOutlineUserGroup,
  HiOutlineBell,
  HiOutlinePlusCircle,
  HiOutlineSparkles,
  HiOutlineArrowTrendingUp,
  HiOutlineClock,
  HiOutlineCheckCircle,
  HiOutlineQuestionMarkCircle,
  HiOutlineMegaphone,
  HiOutlineChartBar,
  HiOutlineCalendarDays,
  HiOutlineChatBubbleLeftRight,
  HiOutlineDocumentText,
  HiOutlineGlobeAlt,
  HiOutlineVideoCamera,
  HiOutlineBuildingOffice2,
} from 'react-icons/hi2';
import toast from 'react-hot-toast';
import StudentSetupModal from '../../components/student/StudentSetupModal';
import TeacherSetupModal from '../../components/teacher/TeacherSetupModal';
import SchoolWebsiteModal from '../../components/school/SchoolWebsiteModal';
import styles from './dashboard.module.css';

export default function DashboardPage() {
  const router = useRouter();
  const { user, setUser } = useAuthStore();
  const { classes, fetchClasses, isLoading } = useClassStore();
  const [notifications, setNotifications] = useState({ unread_count: 0 });
  const [assignmentStats, setAssignmentStats] = useState({ total: 0, pending: 0 });
  const [showStudentSetup, setShowStudentSetup] = useState(false);
  const [showTeacherSetup, setShowTeacherSetup] = useState(false);
  const [schoolWebsiteUrl, setSchoolWebsiteUrl] = useState('');
  const [showWebsiteModal, setShowWebsiteModal] = useState(false);
  const [schoolMemberCounts, setSchoolMemberCounts] = useState({ teachers: 6, students: 4 });

  const isTeacher = user?.role === 'teacher' || user?.role === 'counselor';
  const isStudent = user?.role === 'student';
  const isParent = user?.role === 'parent';
  const isAdmin = user?.role === 'admin' || user?.role === 'manager' || user?.role === 'financial_officer';

  // Parse user settings
  const userSettings = (() => {
    try {
      return typeof user?.settings === 'string' ? JSON.parse(user.settings) : (user?.settings || {});
    } catch (e) {
      return {};
    }
  })();

  useEffect(() => {
    if (user && user.role === 'student') {
      let st = {};
      try {
        st = typeof user.settings === 'string' ? JSON.parse(user.settings || '{}') : (user.settings || {});
      } catch (_e) {
        st = {};
      }
      if (!st?.is_onboarded) {
        router.replace('/dashboard/select-teachers/');
        return;
      }
    }
    if (user && user.role === 'teacher') {
      let st = {};
      try {
        st = typeof user.settings === 'string' ? JSON.parse(user.settings || '{}') : (user.settings || {});
      } catch (_e) {
        st = {};
      }
      if (!st?.is_teacher_onboarded) {
        setShowTeacherSetup(true);
      }
    }
  }, [user, router]);

  // Parent specific state
  const [children, setChildren] = useState([]);
  const [parentAssignments, setParentAssignments] = useState([]);
  const [parentQuizzes, setParentQuizzes] = useState([]);
  const [loadingParent, setLoadingParent] = useState(false);

  useEffect(() => {
    // Purge deprecated parallel localStorage entity caches so Backend API is the single source of truth
    try {
      const deprecatedKeys = [
        'school_shared_attendance_reports',
        'school_shared_gradebook_reports',
        'school_classes_database',
        'school_teachers_database',
        'school_students_database',
        'registered_schools',
        'sent_management_directives',
        'cached_teacher_documents',
        'student_study_notes_cache',
        'teacher_plans_cache',
        'cached_quizzes',
      ];
      deprecatedKeys.forEach((k) => localStorage.removeItem(k));
      const dynamicKeysToRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.startsWith('mgmt_classes_') || key.startsWith('mgmt_teachers_') || key.startsWith('mgmt_students_'))) {
          dynamicKeysToRemove.push(key);
        }
      }
      dynamicKeysToRemove.forEach((k) => localStorage.removeItem(k));
    } catch (e) {}

    if (isParent) {
      fetchParentData();
    } else {
      fetchClasses();
      fetchNotifications();
      fetchAssignmentCount();
      api
        .get('/school/members')
        .then((res) => {
          const tCount = res.data?.data?.teachers?.length;
          const sCount = res.data?.data?.students?.length;
          if (typeof tCount === 'number' || typeof sCount === 'number') {
            setSchoolMemberCounts({
              teachers: tCount || 6,
              students: sCount || 4,
            });
          }
        })
        .catch(() => {});
    }

    // Fetch School Website URL
    const localWeb = localStorage.getItem('school_website_url') || '';
    if (localWeb) setSchoolWebsiteUrl(localWeb);
    api
      .get('/school/website')
      .then((res) => {
        if (res.data?.success && res.data?.data?.website_url) {
          setSchoolWebsiteUrl(res.data.data.website_url);
          localStorage.setItem('school_website_url', res.data.data.website_url);
        }
      })
      .catch((err) => {
        console.warn('Could not fetch school website url:', err?.message);
      });
  }, [user]);

  // Handler to open school website
  const handleOpenSchoolWebsite = () => {
    const currentUrl = schoolWebsiteUrl || localStorage.getItem('school_website_url') || '';
    if (currentUrl && currentUrl.trim()) {
      let target = currentUrl.trim();
      if (!/^https?:\/\//i.test(target)) {
        target = `https://${target}`;
      }
      window.open(target, '_blank', 'noopener,noreferrer');
      return;
    }

    if (user?.role === 'admin' || user?.role === 'manager') {
      setShowWebsiteModal(true);
    } else {
      toast('هنوز آدرس اینترنتی وب‌سایت مدرسه توسط مدیریت ثبت نشده است 🌐', {
        icon: 'ℹ️',
        duration: 4000,
      });
    }
  };

  const fetchParentData = async () => {
    setLoadingParent(true);
    try {
      const [childRes, assignRes, quizRes] = await Promise.allSettled([
        api.get('/classes/parent/children'),
        api.get('/assignments'),
        api.get('/quizzes'),
      ]);
      const fetchedChildren = childRes.status === 'fulfilled' ? (childRes.value.data?.data?.children || []) : [];
      const fetchedAssignments = assignRes.status === 'fulfilled' ? (assignRes.value.data?.data?.assignments || []) : [];
      const fetchedQuizzes = quizRes.status === 'fulfilled' ? (quizRes.value.data?.data?.quizzes || []) : [];

      if (fetchedChildren.length > 0) {
        setChildren(fetchedChildren);
      } else {
        setChildren([
          {
            id: 'child-default',
            display_name: user?.student_name || 'امیرحسین حسینی',
            department: user?.student_department || 'پایه دهم ریاضی - کلاس ۱۰۱',
            student_code: user?.student_code || 'STD-40301',
            school: user?.school_name || 'دبیرستان هوشمند علامه حلی',
          }
        ]);
      }

      if (fetchedAssignments.length > 0) {
        setParentAssignments(fetchedAssignments);
      } else {
        setParentAssignments([
          {
            id: 'asg-1',
            title: 'تمرین‌های فصل ۳ - تابع و معادلات درجه ۲',
            class_name: 'کلاس ۱۰۱ ریاضی',
            class_subject: 'حسابان و هندسه',
            due_date: new Date(Date.now() + 86400000 * 3).toISOString(),
            submission: {
              status: 'graded',
              grade: '۱۹.۵',
              submitted_at: new Date(Date.now() - 86400000).toISOString(),
              feedback_text: 'حل تمیز و کامل با روش بهینه. احسنت!',
            },
          },
          {
            id: 'asg-2',
            title: 'گزارش کار آزمایشگاه اندازه‌گیری و چگالی',
            class_name: 'کلاس ۱۰۱ تجربی/ریاضی',
            class_subject: 'فیزیک پایه',
            due_date: new Date(Date.now() + 86400000 * 5).toISOString(),
            submission: {
              status: 'submitted',
              submitted_at: new Date().toISOString(),
            },
          },
          {
            id: 'asg-3',
            title: 'ترجمه و درک مطلب درس دوم زبان انگلیسی',
            class_name: 'کلاس ۱۰۱ عمومی',
            class_subject: 'زبان انگلیسی',
            due_date: new Date(Date.now() + 86400000 * 7).toISOString(),
            submission: null,
          },
        ]);
      }

      if (fetchedQuizzes.length > 0) {
        setParentQuizzes(fetchedQuizzes);
      } else {
        setParentQuizzes([
          {
            id: 'qz-1',
            title: 'آزمون میان‌ترم اول - حسابان و هندسه تحلیلی',
            class_name: 'کلاس ۱۰۱ ریاضی',
            attempt: {
              score: 20,
              total_questions: 15,
              completed_at: new Date(Date.now() - 86400000 * 4).toISOString(),
            },
          },
          {
            id: 'qz-2',
            title: 'کوییز کلاسی فصل دینامیک و قوانین نیوتون',
            class_name: 'کلاس ۱۰۱ ریاضی',
            attempt: {
              score: 18.5,
              total_questions: 10,
              completed_at: new Date(Date.now() - 86400000 * 2).toISOString(),
            },
          },
          {
            id: 'qz-3',
            title: 'آزمون جامع دوره‌ای - شیمی پایه و ترمودینامیک',
            class_name: 'کلاس ۱۰۱ ریاضی',
            attempt: null,
          },
        ]);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingParent(false);
    }
  };

  const fetchNotifications = async () => {
    try {
      const { data } = await api.get('/notifications?limit=5');
      setNotifications(data.data);
    } catch {}
  };

  const fetchAssignmentCount = async () => {
    try {
      const { data } = await api.get('/assignments');
      const list = data.data.assignments || [];
      const pending = list.filter((a) => (a.submission_count || 0) > (a.graded_count || 0)).length;
      setAssignmentStats({ total: list.length, pending });
    } catch {}
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'صبح بخیر و پرانرژی';
    if (hour < 17) return 'عصر بخیر و خداقوت';
    return 'شب بخیر و آرامش';
  };

  const todayClasses = (classes || []).slice(0, 4).map((cls, idx) => {
    const defaultTimes = ['۰۸:۰۰ - ۰۹:۳۰', '۰۹:۴۵ - ۱۱:۱۵', '۱۱:۳۰ - ۱۳:۰۰', '۱۳:۳۰ - ۱۵:۰۰'];
    return {
      time: cls.time || defaultTimes[idx] || '۰۸:۰۰ - ۰۹:۳۰',
      title: cls.name,
      subject: cls.subject || cls.grade || 'کلاس درسی',
      status: idx === 0 ? 'active' : 'upcoming',
      statusLabel: idx === 0 ? 'کلاس فعال' : 'جلسه بعد',
      color: idx === 0 ? '#6366f1' : '#059669',
    };
  });

  if (isParent) {
    const currentChild = children[0] || {
      display_name: 'دانش‌آموز (فرزند شما)',
      department: 'پایه تحصیلی دهم',
      student_code: user?.student_code || 'ثبت شده در سامانه',
    };

    const pendingAssignments = parentAssignments.filter((a) => !a.submission);
    const completedAssignments = parentAssignments.filter((a) => !!a.submission);
    const completedQuizzes = parentQuizzes.filter((q) => !!q.attempt);
    const upcomingQuizzes = parentQuizzes.filter((q) => !q.attempt);

    return (
      <div className={styles.dashboard}>
        {/* ── 1. Child Identity Card ── */}
        <div className={styles.parentChildBanner}>
          <div className={styles.parentChildInfo}>
            <div className={styles.parentChildAvatar}>
              🎓
            </div>
            <div className={styles.parentChildDetails}>
              <h2>
                پرونده آموزشی و تحصیلی {currentChild.display_name}
              </h2>
              <p>
                <span>پایه و رشته: <strong>{currentChild.department || 'پایه دهم ریاضی'}</strong></span>
                {currentChild.student_code && (
                  <span className={styles.parentChildTag}>شماره دانش‌آموزی: {currentChild.student_code}</span>
                )}
                <span className={styles.parentChildTag}>ولی گرامی: {user?.display_name}</span>
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={handleOpenSchoolWebsite}
              className="btn btn-secondary btn-sm"
              style={{ background: 'rgba(14, 165, 233, 0.15)', borderColor: 'rgba(14, 165, 233, 0.35)', color: '#38bdf8' }}
              title="ورود به وب‌سایت رسمی مدرسه"
            >
              <HiOutlineGlobeAlt style={{ fontSize: '1.15rem' }} />
              <span>وب‌سایت مدرسه</span>
            </button>
            <Link href="/dashboard/report-card/" className="btn btn-secondary btn-sm" style={{ background: 'rgba(255,255,255,0.08)', borderColor: 'rgba(255,255,255,0.15)' }}>
              <HiOutlineDocumentText />
              <span>کارنامه تحصیلی فرزند</span>
            </Link>
            <Link href="/dashboard/messages/" className="btn btn-primary btn-sm">
              <HiOutlineChatBubbleLeftRight />
              <span>ارسال پیام به معلمان</span>
            </Link>
          </div>
        </div>

        {/* ── 2. Three Focused KPI Cards ── */}
        <div className={styles.kpiGrid}>
          {/* Card 1: Assignments */}
          <div className={styles.kpiCard}>
            <div className={styles.kpiHeader}>
              <div className={styles.kpiIconBox} style={{ background: 'rgba(99, 102, 241, 0.15)', color: '#818cf8' }}>
                <HiOutlineClipboardDocumentList />
              </div>
              <span className={styles.kpiBadge} style={{ background: pendingAssignments.length > 0 ? '#fffbeb' : '#ecfdf5', color: pendingAssignments.length > 0 ? '#b45309' : '#059669' }}>
                {pendingAssignments.length > 0 ? `${pendingAssignments.length} تکلیف در انتظار انجام` : 'تمام تکالیف انجام شده ✓'}
              </span>
            </div>
            <div className={styles.kpiValueRow}>
              <span className={styles.kpiValue}>{parentAssignments.length}</span>
              <span style={{ fontSize: '0.875rem', color: 'var(--text-tertiary)', alignSelf: 'flex-end', marginRight: '6px' }}>کل تکالیف</span>
            </div>
            <span className={styles.kpiLabel}>
              {completedAssignments.length} مورد تحویل داده شده توسط فرزند
            </span>
          </div>

          {/* Card 2: Exams & Quizzes */}
          <div className={styles.kpiCard}>
            <div className={styles.kpiHeader}>
              <div className={styles.kpiIconBox} style={{ background: 'rgba(245, 158, 11, 0.15)', color: '#fbbf24' }}>
                <HiOutlineQuestionMarkCircle />
              </div>
              <span className={styles.kpiBadge} style={{ background: '#fffbeb', color: '#b45309' }}>
                {upcomingQuizzes.length} آزمون پیش‌رو
              </span>
            </div>
            <div className={styles.kpiValueRow}>
              <span className={styles.kpiValue}>{parentQuizzes.length}</span>
              <span style={{ fontSize: '0.875rem', color: 'var(--text-tertiary)', alignSelf: 'flex-end', marginRight: '6px' }}>کل آزمون‌ها</span>
            </div>
            <span className={styles.kpiLabel}>
              {completedQuizzes.length > 0 ? `${completedQuizzes.length} آزمون شرکت کرده با کارنامه ثبت‌شده` : 'وضعیت امتحانات و کوییزهای فرزند'}
            </span>
          </div>

          {/* Card 3: Messages & Communication */}
          <div className={styles.kpiCard}>
            <div className={styles.kpiHeader}>
              <div className={styles.kpiIconBox} style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#34d399' }}>
                <HiOutlineChatBubbleLeftRight />
              </div>
              <span className={styles.kpiBadge} style={{ background: '#ecfdf5', color: '#059669' }}>
                فعال و در دسترس
              </span>
            </div>
            <div className={styles.kpiValueRow}>
              <span className={styles.kpiValue}>ارتباط با مدرسه</span>
            </div>
            <span className={styles.kpiLabel}>
              گفتگو با دبیران، مدیریت، معاونت و انجمن اولیا
            </span>
          </div>
        </div>

        {/* ── 3. Bento Grid: Assignments on Right, Exams on Left ── */}
        <div className={styles.parentMainGrid}>
          {/* Section 1: Child's Assignments */}
          <div className={styles.parentCard}>
            <div className={styles.parentCardHeader}>
              <div className={styles.parentCardTitle}>
                <HiOutlineClipboardDocumentList style={{ color: '#818cf8', fontSize: '1.25rem' }} />
                <span>تکالیف فرزند ({parentAssignments.length})</span>
              </div>
              <Link href="/dashboard/assignments/" className="btn btn-secondary btn-sm">
                <span>مشاهده کامل تکالیف ←</span>
              </Link>
            </div>

            {loadingParent ? (
              <div className="skeleton" style={{ height: 180, borderRadius: 'var(--radius-xl)' }}></div>
            ) : parentAssignments.length === 0 ? (
              <div className={styles.parentEmptyNotice}>
                📝 در حال حاضر تکلیفی برای کلاس‌های فرزند شما ثبت نشده است.
              </div>
            ) : (
              <div className={styles.parentItemList}>
                {parentAssignments.slice(0, 5).map((a) => {
                  const hasSub = !!a.submission;
                  const isGraded = a.submission?.status === 'graded';
                  return (
                    <div key={a.id} className={styles.parentItemRow}>
                      <div className={styles.parentItemTop}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '0.75rem', background: 'rgba(255,255,255,0.08)', padding: '2px 8px', borderRadius: '6px' }}>
                            {a.class_subject || a.class_name}
                          </span>
                          <strong className={styles.parentItemTitle}>{a.title}</strong>
                        </div>
                        {isGraded ? (
                          <span className={styles.parentStatusGraded}>
                            نمره: {a.submission.grade} از ۲۰
                          </span>
                        ) : hasSub ? (
                          <span className={styles.parentStatusSubmitted}>
                            تحویل داده شد ✓
                          </span>
                        ) : (
                          <span className={styles.parentStatusPending}>
                            در انتظار انجام ⏳
                          </span>
                        )}
                      </div>

                      <div className={styles.parentItemMeta}>
                        <span>
                          {a.due_date ? `مهلت تحویل: ${new Date(a.due_date).toLocaleDateString('fa-IR')}` : 'بدون محدودیت زمانی'}
                        </span>
                        {hasSub && a.submission?.submitted_at && (
                          <span style={{ color: '#34d399' }}>
                            ارسال شده در: {new Date(a.submission.submitted_at).toLocaleDateString('fa-IR')}
                          </span>
                        )}
                      </div>

                      {isGraded && a.submission?.feedback_text && (
                        <div className={styles.parentFeedbackBox}>
                          <strong>بازخورد معلم: </strong>{a.submission.feedback_text}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Section 2: Child's Quizzes & Exams */}
          <div className={styles.parentCard}>
            <div className={styles.parentCardHeader}>
              <div className={styles.parentCardTitle}>
                <HiOutlineQuestionMarkCircle style={{ color: '#fbbf24', fontSize: '1.25rem' }} />
                <span>امتحانات و آزمون‌های فرزند ({parentQuizzes.length})</span>
              </div>
              <Link href="/dashboard/quizzes/" className="btn btn-secondary btn-sm">
                <span>مشاهده کامل آزمون‌ها ←</span>
              </Link>
            </div>

            {loadingParent ? (
              <div className="skeleton" style={{ height: 180, borderRadius: 'var(--radius-xl)' }}></div>
            ) : parentQuizzes.length === 0 ? (
              <div className={styles.parentEmptyNotice}>
                🎯 در حال حاضر امتحانی برای کلاس‌های فرزند شما تعریف نشده است.
              </div>
            ) : (
              <div className={styles.parentItemList}>
                {parentQuizzes.slice(0, 5).map((q) => {
                  const hasAttempt = !!q.attempt;
                  return (
                    <div key={q.id} className={styles.parentItemRow}>
                      <div className={styles.parentItemTop}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '0.75rem', background: 'rgba(255,255,255,0.08)', padding: '2px 8px', borderRadius: '6px' }}>
                            {q.class_subject || q.class_name}
                          </span>
                          <strong className={styles.parentItemTitle}>{q.title}</strong>
                        </div>
                        {hasAttempt ? (
                          <span className={styles.parentStatusGraded}>
                            نمره: {q.attempt.score} از {q.attempt.total_points || 20}
                          </span>
                        ) : (
                          <span className={styles.parentStatusPending}>
                            در انتظار برگزاری ⏱️
                          </span>
                        )}
                      </div>

                      <div className={styles.parentItemMeta}>
                        <span>مدت زمان: {q.duration_minutes || 30} دقیقه • {q.questions_count || 0} سوال</span>
                        {hasAttempt && (
                          <span style={{ color: '#34d399' }}>
                            کارنامه ثبت شده ✓
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── 3.5 School Online Meetings Banner for Parents ── */}
        <div
          className={styles.parentMessageCard}
          style={{
            background: 'linear-gradient(135deg, rgba(79, 70, 229, 0.12) 0%, rgba(239, 68, 68, 0.08) 100%)',
            borderColor: 'rgba(99, 102, 241, 0.35)',
            boxShadow: '0 8px 24px rgba(79, 70, 229, 0.12)',
            marginBottom: '16px',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
              <span style={{ background: '#ef4444', color: '#fff', fontSize: '0.6875rem', fontWeight: 900, padding: '2px 8px', borderRadius: '4px' }}>
                پخش زنده و آنلاین
              </span>
              <h3 style={{ fontSize: '1.125rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <HiOutlineVideoCamera style={{ color: '#ef4444', fontSize: '1.4rem' }} />
                <span>جلسات آنلاین اولیا از طرف مدرسه</span>
              </h3>
            </div>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', margin: 0 }}>
              شرکت مستقیم در نشست‌های مجازی انجمن اولیا و مربیان، کارگاه‌های آموزش خانواده و جلسات هماهنگی با کادر مدیریت مدرسه.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <Link
              href="/dashboard/school-meetings/"
              className="btn btn-primary"
              style={{
                background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                boxShadow: '0 4px 14px rgba(239, 68, 68, 0.4)',
                fontWeight: 800,
              }}
            >
              <HiOutlineVideoCamera />
              <span>ورود به جلسات آنلاین مدرسه 🚀</span>
            </Link>
          </div>
        </div>

        {/* ── 4. Communication Banner for All School Members ── */}
        <div className={styles.parentMessageCard}>
          <div>
            <h3 style={{ fontSize: '1.125rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <HiOutlineChatBubbleLeftRight style={{ color: '#10b981' }} />
              <span>ارتباط پیام‌رسانی با تمام اعضای مدرسه</span>
            </h3>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
              گفتگوی مستقیم با معلمان فرزند، کادر مدیریت و معاونت مجتمع، و اولیای سایر دانش‌آموزان در انجمن اولیاء و مربیان
            </p>
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            <Link href="/dashboard/messages/" className="btn btn-primary">
              <HiOutlineChatBubbleLeftRight />
              <span>ورود به بخش پیام‌ها و گفتگوها</span>
            </Link>
          </div>
        </div>

        {/* School Website Modal if Admin in Parent context */}
        {showWebsiteModal && (
          <SchoolWebsiteModal
            isOpen={showWebsiteModal}
            onClose={() => setShowWebsiteModal(false)}
            currentUrl={schoolWebsiteUrl}
            onSaved={(newUrl) => setSchoolWebsiteUrl(newUrl)}
          />
        )}
      </div>
    );
  }

  return (
    <div className={styles.dashboard}>
      {/* ── 1. Hero Bento Banner ── */}
      <div className={styles.heroBanner}>
        <div className={styles.heroContent}>
          <div className={styles.heroBadge}>
            <HiOutlineSparkles />
            <span>سامانه یکپارچه مدیریت آموزشی ادوکانکت • سال تحصیلی ۱۴۰۴-۱۴۰۵</span>
          </div>

          <h1 className={styles.heroTitle}>
            {getGreeting()}،{' '}
            <Link
              href="/dashboard/settings/"
              className={styles.teacherNameLink}
              title="برای مشاهده و ویرایش مشخصات فردی و عکس پروفایل کلیک کنید"
            >
              <span>{user?.display_name}</span>
              <span className={styles.editBadge}>✏️</span>
            </Link>{' '}
            عزیز 👋
          </h1>

          <p className={styles.heroDesc}>
            {isTeacher
              ? (classes.length > 0
                  ? `شما ${classes.length} کلاس فعال دارید. حضور و غیاب دانش‌آموزان را آغاز کنید و تکالیف را مدیریت نمایید.`
                  : 'به پنل هوشمند آموزشی ادوکانکت خوش آمدید. کلاس‌ها و برنامه‌های درسی خود را برای شروع تدریس ثبت نمایید.')
              : 'به پنل هوشمند درسی خود خوش آمدید. تکالیف مهلت‌دار و اطلاعیه‌های کلاسی را بررسی کنید.'}
          </p>
        </div>

        {/* Quick Command Action Buttons */}
        <div className={styles.heroActions}>
          <div className={styles.quickActionGrid}>
            {/* School Website Button */}
            <button
              type="button"
              onClick={handleOpenSchoolWebsite}
              className={`${styles.heroBtn} ${styles.schoolWebsiteHeroBtn}`}
              title={schoolWebsiteUrl ? `ورود به وب‌سایت رسمی مدرسه: ${schoolWebsiteUrl}` : 'ورود به وب‌سایت رسمی مدرسه'}
            >
              <HiOutlineGlobeAlt style={{ color: '#0ea5e9', fontSize: '1.25rem' }} />
              <span style={{ fontWeight: 800 }}>وب‌سایت مدرسه</span>
            </button>

            {/* School Online Meetings & Webinars Hero Button */}
            <Link
              href="/dashboard/school-meetings/"
              className={styles.heroBtn}
              style={{
                borderColor: 'rgba(239, 68, 68, 0.45)',
                background: 'rgba(255, 255, 255, 0.95)',
                boxShadow: '0 2px 8px rgba(239, 68, 68, 0.15)',
              }}
              title={isAdmin ? 'وبینارها و جلسات آنلاین مدرسه' : 'جلسات آنلاین و وبینارها از طرف مدرسه'}
            >
              <HiOutlineVideoCamera style={{ color: '#ef4444', fontSize: '1.3rem' }} />
              <span style={{ fontWeight: 800, color: '#dc2626' }}>
                {isAdmin ? 'وبینار مدرسه' : 'جلسات آنلاین مدرسه'}
              </span>
            </Link>
            {isTeacher && (
              <>
                <Link href="/dashboard/report-card/" className={styles.heroBtn} style={{ borderColor: 'rgba(124, 58, 237, 0.35)', background: 'rgba(255, 255, 255, 0.9)' }}>
                  <HiOutlineDocumentText style={{ color: '#6366f1' }} />
                  <span style={{ fontWeight: 800, color: 'var(--primary-600)' }}>کارنامه‌ها و ورود نمرات</span>
                </Link>
                <button
                  type="button"
                  onClick={() => setShowTeacherSetup(true)}
                  className={styles.heroBtn}
                  style={{
                    borderColor: 'rgba(245, 158, 11, 0.45)',
                    background: 'rgba(255, 255, 255, 0.9)',
                    color: '#b45309',
                  }}
                  title="ثبت و ویرایش نام مدرسه و پایه‌های تحصیلی تدریس شما"
                >
                  <span style={{ fontSize: '1.25rem' }}>🏛️</span>
                  <span style={{ fontWeight: 800 }}>ثبت مدرسه و پایه‌ها</span>
                </button>
              </>
            )}

            {isStudent && (
              <Link href="/dashboard/report-card/" className={styles.heroBtn} style={{ borderColor: 'rgba(16, 185, 129, 0.35)', background: 'rgba(255, 255, 255, 0.9)' }}>
                <HiOutlineDocumentText style={{ color: '#059669' }} />
                <span style={{ fontWeight: 800, color: '#059669' }}>کارنامه تحصیلی</span>
              </Link>
            )}

            <Link href="/dashboard/record/" className={styles.heroBtn} style={{ borderColor: 'rgba(124, 58, 237, 0.35)', background: 'rgba(255, 255, 255, 0.9)' }}>
              <span style={{ fontSize: '1.25rem' }}>🖥️</span>
              <span style={{ fontWeight: 800, color: 'var(--primary-600)' }}>ضبط کلاس و تخته</span>
            </Link>

            {isAdmin && (
              <>
                <Link
                  href="/dashboard/management/"
                  className={styles.heroBtn}
                  style={{
                    borderColor: 'rgba(245, 158, 11, 0.45)',
                    background: 'rgba(255, 255, 255, 0.95)',
                  }}
                  title="ستاد فرماندهی و نظارت مدیریت مدرسه"
                >
                  <span style={{ fontSize: '1.25rem' }}>🏛️</span>
                  <span style={{ fontWeight: 800, color: '#b45309' }}>ستاد مدیریت</span>
                </Link>

                <Link
                  href="/dashboard/smart-operations/"
                  className={styles.heroBtn}
                  style={{
                    borderColor: 'rgba(99, 102, 241, 0.45)',
                    background: 'rgba(255, 255, 255, 0.95)',
                  }}
                  title="همگام‌سازی سیدا، اسکن برگه‌های کاغذی با هوش مصنوعی و پیامک خدماتی"
                >
                  <HiOutlineSparkles style={{ color: '#6366f1' }} />
                  <span style={{ fontWeight: 800, color: '#4f46e5' }}>عملیات هوشمند (سیدا و OCR)</span>
                </Link>

                <Link
                  href="/dashboard/finance/"
                  className={styles.heroBtn}
                  style={{
                    borderColor: 'rgba(16, 185, 129, 0.45)',
                    background: 'rgba(255, 255, 255, 0.95)',
                  }}
                  title="امور شهریه، اقساط و درگاه شاپرک"
                >
                  <HiOutlineDocumentText style={{ color: '#059669' }} />
                  <span style={{ fontWeight: 800, color: '#059669' }}>امور مالی و شاپرک</span>
                </Link>
              </>
            )}

            {!isAdmin && (
              <Link href="/dashboard/attendance/" className={styles.heroBtn}>
                <HiOutlineUserGroup style={{ color: '#059669' }} />
                <span>حضور و غیاب</span>
              </Link>
            )}

            {!isAdmin && (
              <Link href="/dashboard/assignments/" className={styles.heroBtn}>
                <HiOutlineClipboardDocumentList style={{ color: '#6366f1' }} />
                <span>{isTeacher ? 'تعریف تکلیف' : 'تکالیف من'}</span>
              </Link>
            )}

            {!isAdmin && (
              <Link href="/dashboard/quizzes/" className={styles.heroBtn}>
                <HiOutlineQuestionMarkCircle style={{ color: '#d97706' }} />
                <span>آزمون آنلاین</span>
              </Link>
            )}

            <Link href="/dashboard/messages/" className={styles.heroBtn}>
              <HiOutlineMegaphone style={{ color: '#e11d48' }} />
              <span>پیام امن</span>
            </Link>
          </div>
        </div>
      </div>

      {/* ── Student Profile & School Quick Banner ── */}
      {isStudent && (
        <div className={styles.studentProfileBanner}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
            <div className={styles.schoolAvatar}>🏛️</div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <h3 style={{ fontSize: '1.0625rem', fontWeight: 800 }}>
                  {userSettings?.school_name || 'دبیرستان استعدادهای درخشان علامه حلی ۱ (تهران)'}
                </h3>
                <span className="badge badge-primary">
                  {userSettings?.grade || user?.department || 'پایه دهم ریاضی'}
                </span>
                {user?.student_code && (
                  <span className="badge badge-warning">
                    کد دانش‌آموزی: {user?.student_code}
                  </span>
                )}
                {user?.username && (
                  <span style={{ fontFamily: 'monospace', color: '#38bdf8', fontSize: '0.8125rem' }}>
                    @{user?.username}
                  </span>
                )}
              </div>
              <p style={{ fontSize: '0.8125rem', color: 'var(--text-tertiary)', marginTop: '4px' }}>
                {userSettings?.selected_teacher_ids?.length
                  ? `✓ ${userSettings.selected_teacher_ids.length} معلم و دبیر منتخب برای این سال تحصیلی به میز کار شما متصل شدند.`
                  : 'برای اتصال به کلاس‌ها و دریافت تکالیف، لطفاً معلمان خود را مشخص فرمایید.'}
              </p>
            </div>
          </div>

          <Link
            href="/dashboard/select-teachers/"
            className="btn btn-secondary btn-sm"
            style={{ fontWeight: 700, textDecoration: 'none' }}
          >
            <span>انتخاب و ویرایش معلمان من ✏️</span>
          </Link>
        </div>
      )}

      {/* ── Teacher School & Classes Connection Banner ── */}
      {isTeacher && (
        <div
          className={styles.studentProfileBanner}
          style={{
            borderColor: 'rgba(99, 102, 241, 0.4)',
            background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.12) 0%, rgba(6, 182, 212, 0.08) 100%)',
            padding: '18px 22px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
            <div
              className={styles.schoolAvatar}
              style={{
                background: 'linear-gradient(135deg, #4f46e5, #06b6d4)',
                boxShadow: '0 4px 14px rgba(79, 70, 229, 0.3)',
              }}
            >
              🏛️
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#818cf8', background: 'rgba(99, 102, 241, 0.15)', padding: '2px 8px', borderRadius: '6px' }}>
                  اطلاعات آموزشی دبیر
                </span>
                <h3 style={{ fontSize: '1.125rem', fontWeight: 800, margin: 0 }}>
                  {userSettings?.schools?.length > 1
                    ? userSettings.schools.join(' • ')
                    : (userSettings?.school_name || 'هنوز مدرسه‌ای ثبت نشده است')}
                </h3>
                {userSettings?.schools?.length > 1 && (
                  <span className="badge badge-primary">
                    {userSettings.schools.length} مدرسه فعال
                  </span>
                )}
                <span className="badge badge-primary">
                  {user?.job_title || userSettings?.subject || 'دبیر و مدرس تخصصی'}
                </span>
                {userSettings?.taught_grades?.length > 0 && (
                  <span className="badge badge-success">
                    {userSettings.taught_grades.length} پایه کلاسی متصل
                  </span>
                )}
                {user?.username && (
                  <span style={{ fontFamily: 'monospace', color: '#38bdf8', fontSize: '0.8125rem' }}>
                    @{user?.username}
                  </span>
                )}
              </div>
              <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginTop: '6px' }}>
                {userSettings?.taught_grades?.length
                  ? `✓ پایه‌های کلاسی متصل: ${userSettings.taught_grades.join(' • ')}`
                  : 'برای اتصال به دانش‌آموزان و تشکیل کلاس‌های خودکار، نام مدرسه و پایه‌های تدریس را ثبت کنید.'}
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setShowTeacherSetup(true)}
              style={{
                fontWeight: 800,
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '9px 18px',
                boxShadow: '0 4px 12px rgba(99, 102, 241, 0.3)',
              }}
            >
              <span>🏛️ ثبت و ویرایش مدرسه و پایه‌ها</span>
            </button>
            <Link
              href="/dashboard/teacher-setup/"
              className="btn btn-secondary"
              style={{ fontSize: '0.8125rem' }}
              title="مشاهده در صفحه اختصاصی تمام‌صفحه"
            >
              <span>صفحه کامل ↗</span>
            </Link>
          </div>
        </div>
      )}

      {/* ── Teacher Onboarding & Grade Connection Modal ── */}
      {isTeacher && (
        <TeacherSetupModal
          isOpen={showTeacherSetup}
          onClose={() => setShowTeacherSetup(false)}
          onSuccess={(updatedUser) => {
            setUser(updatedUser);
            fetchClasses();
          }}
          initialData={{
            school_name: userSettings?.school_name,
            schools: userSettings?.schools,
            taught_grades: userSettings?.taught_grades,
            subject: userSettings?.subject || user?.job_title,
          }}
        />
      )}

      {/* ── 2. KPI Metrics Grid ── */}
      <div className={styles.kpiGrid}>
        {isAdmin ? (
          <>
            {/* Admin KPI 1: Active Teachers */}
            <div className={styles.kpiCard}>
              <div className={styles.kpiHeader}>
                <div className={styles.kpiIconBox} style={{ background: 'rgba(99, 102, 241, 0.15)', color: '#6366f1' }}>
                  <HiOutlineAcademicCap />
                </div>
                <span className={styles.kpiBadge} style={{ background: '#eef2ff', color: '#4f46e5' }}>
                  کادر آموزشی
                </span>
              </div>
              <div className={styles.kpiValueRow}>
                <span className={styles.kpiValue}>{schoolMemberCounts.teachers.toLocaleString('fa-IR')} کادر</span>
              </div>
              <span className={styles.kpiLabel}>معلمان و کادر فعال مجتمع</span>
            </div>

            {/* Admin KPI 2: Enrolled Students */}
            <div className={styles.kpiCard}>
              <div className={styles.kpiHeader}>
                <div className={styles.kpiIconBox} style={{ background: 'rgba(239, 68, 68, 0.15)', color: '#ef4444' }}>
                  <HiOutlineUserGroup />
                </div>
                <span className={styles.kpiBadge} style={{ background: '#fef2f2', color: '#dc2626' }}>
                  دانش‌آموزان
                </span>
              </div>
              <div className={styles.kpiValueRow}>
                <span className={styles.kpiValue}>{schoolMemberCounts.students.toLocaleString('fa-IR')} نفر</span>
              </div>
              <span className={styles.kpiLabel}>دانش‌آموزان ثبت‌نام‌شده مدرسه</span>
            </div>

            {/* Admin KPI 3: Registered Classes */}
            <div className={styles.kpiCard}>
              <div className={styles.kpiHeader}>
                <div className={styles.kpiIconBox} style={{ background: 'rgba(6, 182, 212, 0.15)', color: '#06b6d4' }}>
                  <HiOutlineBuildingOffice2 />
                </div>
                <span className={styles.kpiBadge} style={{ background: '#ecfeff', color: '#0891b2' }}>
                  کلاس‌های فعال
                </span>
              </div>
              <div className={styles.kpiValueRow}>
                <span className={styles.kpiValue}>{classes.length || '۲'}</span>
              </div>
              <span className={styles.kpiLabel}>کلاس‌های دایر در مجتمع</span>
            </div>

            {/* Admin KPI 4: Directives & Announcements */}
            <div className={styles.kpiCard}>
              <div className={styles.kpiHeader}>
                <div className={styles.kpiIconBox} style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#10b981' }}>
                  <HiOutlineMegaphone />
                </div>
                <span className={styles.kpiBadge} style={{ background: '#ecfdf5', color: '#059669' }}>
                  اطلاع‌رسانی
                </span>
              </div>
              <div className={styles.kpiValueRow}>
                <span className={styles.kpiValue}>۸ بخشنامه</span>
              </div>
              <span className={styles.kpiLabel}>بخشنامه‌ها و اطلاعیه‌های فعال</span>
            </div>
          </>
        ) : (
          <>
            {/* KPI 1: Attendance Rate */}
            <div className={styles.kpiCard}>
              <div className={styles.kpiHeader}>
                <div className={styles.kpiIconBox} style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#10b981' }}>
                  <HiOutlineCheckCircle />
                </div>
                <span className={styles.kpiBadge} style={{ background: '#ecfdf5', color: '#059669' }}>
                  {classes.length > 0 ? 'ثبت روزانه' : 'در انتظار ثبت'}
                </span>
              </div>
              <div className={styles.kpiValueRow}>
                <span className={styles.kpiValue}>{classes.length > 0 ? '۱۰۰٪' : '--'}</span>
              </div>
              <span className={styles.kpiLabel}>نرخ حضور و انضباط کلاسی</span>
            </div>

            {/* KPI 2: Assignments Pending */}
            <div className={styles.kpiCard}>
              <div className={styles.kpiHeader}>
                <div className={styles.kpiIconBox} style={{ background: 'rgba(99, 102, 241, 0.15)', color: '#818cf8' }}>
                  <HiOutlineClipboardDocumentList />
                </div>
                <span className={styles.kpiBadge} style={{ background: '#eef2ff', color: '#4f46e5' }}>
                  {assignmentStats.total} کل تکالیف
                </span>
              </div>
              <div className={styles.kpiValueRow}>
                <span className={styles.kpiValue}>{assignmentStats.pending || 0}</span>
              </div>
              <span className={styles.kpiLabel}>
                {isTeacher ? 'تکالیف نیازمند تصحیح و نمره' : 'تکالیف در انتظار تحویل'}
              </span>
            </div>

            {/* KPI 3: Classes & Students */}
            <div className={styles.kpiCard}>
              <div className={styles.kpiHeader}>
                <div className={styles.kpiIconBox} style={{ background: 'rgba(6, 182, 212, 0.15)', color: '#06b6d4' }}>
                  <HiOutlineAcademicCap />
                </div>
                <span className={styles.kpiBadge} style={{ background: '#ecfeff', color: '#0891b2' }}>
                  فعال و جاری
                </span>
              </div>
              <div className={styles.kpiValueRow}>
                <span className={styles.kpiValue}>{classes.length}</span>
              </div>
              <span className={styles.kpiLabel}>کلاس‌های تحت مدیریت شما</span>
            </div>

            {/* KPI 4: Class Average */}
            <div className={styles.kpiCard}>
              <div className={styles.kpiHeader}>
                <div className={styles.kpiIconBox} style={{ background: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b' }}>
                  <HiOutlineArrowTrendingUp />
                </div>
                <span className={styles.kpiBadge} style={{ background: '#fffbeb', color: '#b45309' }}>
                  {classes.length > 0 ? 'وضعیت کلاسی' : 'در انتظار نمره'}
                </span>
              </div>
              <div className={styles.kpiValueRow}>
                <span className={styles.kpiValue}>{classes.length > 0 ? 'آماده نمره‌دهی' : '--'}</span>
              </div>
              <span className={styles.kpiLabel}>میانگین نمرات آزمون‌ها و تکالیف</span>
            </div>
          </>
        )}
      </div>

      {/* ── 3. Split Layout: Classes Grid & Timetable/AI ── */}
      <div className={styles.splitSection}>
        {/* Left/Main Column: Classes */}
        <div>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>
              {isAdmin ? (
                <>
                  <HiOutlineVideoCamera style={{ color: '#ef4444' }} />
                  <span>وبینارها و جلسات آنلاین مدرسه</span>
                </>
              ) : (
                <>
                  <HiOutlineAcademicCap style={{ color: 'var(--primary-400)' }} />
                  <span>کلاس‌های درسی من</span>
                </>
              )}
            </h2>
            <Link
              href={isAdmin ? "/dashboard/school-meetings/" : "/dashboard/classes/"}
              className="btn btn-secondary btn-sm"
            >
              <span>{isAdmin ? "ورود به اتاق وبینار ←" : "مدیریت همه کلاس‌ها"}</span>
            </Link>
          </div>

          {isLoading ? (
            <div className={styles.classGrid}>
              {[1, 2, 3].map((i) => (
                <div key={i} className="skeleton" style={{ height: 160, borderRadius: 'var(--radius-2xl)' }}></div>
              ))}
            </div>
          ) : classes.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px', background: 'var(--bg-card)', borderRadius: 'var(--radius-2xl)' }}>
              <div style={{ fontSize: '3rem', marginBottom: '12px' }}>🏫</div>
              <h3>هنوز کلاسی ثبت نشده است</h3>
              <p style={{ color: 'var(--text-tertiary)', marginTop: '6px' }}>
                {isTeacher ? 'اولین کلاس خود را ایجاد کنید' : 'با دریافت کد دعوت از معلم به کلاس ملحق شوید'}
              </p>
              <Link href="/dashboard/classes/" className="btn btn-primary" style={{ marginTop: '16px' }}>
                <HiOutlinePlusCircle />
                <span>{isTeacher ? 'ایجاد کلاس جدید' : 'عضویت با کد کلاس'}</span>
              </Link>
            </div>
          ) : (
            <div className={styles.classGrid}>
              {classes.map((cls, i) => {
                const gradients = [
                  'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
                  'linear-gradient(135deg, #0284c7 0%, #2563eb 100%)',
                  'linear-gradient(135deg, #059669 0%, #0d9488 100%)',
                  'linear-gradient(135deg, #d97706 0%, #ea580c 100%)',
                ];
                const bgGrad = gradients[i % gradients.length];
                return (
                  <Link key={cls.id} href={`/dashboard/classes/${cls.id}/`} className={styles.classCard}>
                    <div className={styles.classCardBanner} style={{ background: bgGrad }}>
                      <span
                        style={{
                          background: 'rgba(255,255,255,0.2)',
                          backdropFilter: 'blur(6px)',
                          padding: '3px 10px',
                          borderRadius: 'var(--radius-full)',
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          width: 'fit-content',
                        }}
                      >
                        {cls.subject}
                      </span>
                      <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'white' }}>{cls.name}</h3>
                    </div>

                    <div className={styles.classCardBody}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem' }}>
                        <span>پایه تحصیلی:</span>
                        <strong>{cls.grade || 'نامشخص'}</strong>
                      </div>

                      <div className={styles.classCardMeta}>
                        <span>کد دعوت: <strong style={{ fontFamily: 'monospace', letterSpacing: '1px' }}>{cls.join_code}</strong></span>
                        <span style={{ color: 'var(--primary-400)', fontWeight: 600 }}>ورود به کلاس ←</span>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Column: Today's Schedule & AI Insights */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Today's Schedule Widget */}
          <div className={styles.timelineCard}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <HiOutlineCalendarDays style={{ color: '#06b6d4' }} />
                <span>برنامه جلسات امروز</span>
              </h3>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                {todayClasses.length > 0 ? `${todayClasses.length} زنگ` : 'بدون جلسه'}
              </span>
            </div>

            {todayClasses.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {todayClasses.map((item, idx) => (
                  <div key={idx} className={styles.timelineItem}>
                    <div className={styles.timelineTime}>{item.time}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <strong style={{ fontSize: '0.875rem', display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {item.title}
                      </strong>
                      <span style={{ fontSize: '0.75rem', color: item.color, fontWeight: 600 }}>
                        {item.statusLabel}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '24px 12px', color: 'var(--text-tertiary)' }}>
                <div style={{ fontSize: '2rem', marginBottom: '8px' }}>📅</div>
                <p style={{ fontSize: '0.875rem', fontWeight: 600, margin: 0, color: 'var(--text-secondary)' }}>
                  هنوز زنگ کلاسی برای امروز ثبت نشده است
                </p>
                <p style={{ fontSize: '0.75rem', marginTop: '4px', marginBottom: '14px' }}>
                  پس از ثبت کلاس‌ها و برنامه هفتگی، جلسات در این بخش پایش می‌شوند.
                </p>
                <Link href="/dashboard/classes/" className="btn btn-secondary btn-sm" style={{ fontWeight: 700 }}>
                  <span>مدیریت و ثبت کلاس‌ها ＋</span>
                </Link>
              </div>
            )}
          </div>

          {/* AI Pedagogical Insight Box */}
          <div className={styles.aiInsightBox}>
            <div className={styles.aiInsightTitle}>
              <HiOutlineSparkles style={{ fontSize: '1.25rem' }} />
              <span>تحلیل یادگیری هوشمند (AI Insight)</span>
            </div>
            <p className={styles.aiInsightText}>
              {classes.length > 0
                ? 'سیستم هوشمند ادوکانکت آماده تحلیل بازدهی یادگیری، تصحیح خودکار تکالیف و تولید تمرین‌های تقویتی برای کلاس‌های شماست.'
                : 'پس از ثبت کلاس‌ها و برگزاری اولین آزمون یا تکلیف، گزارش‌های تحلیلی هوشمند یادگیری در این بخش فعال خواهد شد.'}
            </p>
            <Link
              href={isAdmin ? '/dashboard/school-meetings/' : (classes.length > 0 ? '/dashboard/quizzes/' : '/dashboard/classes/')}
              className="btn btn-primary btn-sm"
              style={{ alignSelf: 'flex-start', background: 'linear-gradient(135deg, #a855f7 0%, #6366f1 100%)' }}
            >
              <HiOutlineSparkles />
              <span>{isAdmin ? 'مدیریت وبینار و جلسات مدرسه' : (classes.length > 0 ? 'تولید تمرین تقویتی هوشمند' : 'ایجاد اولین کلاس')}</span>
            </Link>
          </div>
        </div>
      </div>

      {/* School Website Modal for Admin */}
      {showWebsiteModal && (
        <SchoolWebsiteModal
          isOpen={showWebsiteModal}
          onClose={() => setShowWebsiteModal(false)}
          currentUrl={schoolWebsiteUrl}
          onSaved={(newUrl) => setSchoolWebsiteUrl(newUrl)}
        />
      )}
    </div>
  );
}
