'use client';
import { useState, useEffect } from 'react';
import useAuthStore from '../../../stores/authStore';
import api from '../../../lib/api';
import toast, { Toaster } from 'react-hot-toast';
import {
  HiOutlineBuildingLibrary,
  HiOutlineAcademicCap,
  HiOutlineDocumentChartBar,
  HiOutlineCalendarDays,
  HiOutlineChatBubbleBottomCenterText,
  HiOutlineCheckCircle,
  HiOutlineXCircle,
  HiOutlineClock,
  HiOutlinePrinter,
  HiOutlineMagnifyingGlass,
  HiOutlineUser,
} from 'react-icons/hi2';
import styles from './sess.module.css';

export default function SessPortalPage() {
  const { user } = useAuthStore();
  const [activeTab, setActiveTab] = useState('courses'); // courses | transcript | calendar | feedback
  const isStudent = user?.role === 'student';

  // Data states
  const [courses, setCourses] = useState([]);
  const [transcript, setTranscript] = useState(null);
  const [calendarEvents, setCalendarEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  // Feedback states
  const [fbMessage, setFbMessage] = useState('');
  const [fbCategory, setFbCategory] = useState('educational');
  const [fbIsAnonymous, setFbIsAnonymous] = useState(true);
  const [generatedCode, setGeneratedCode] = useState(null);
  const [isSubmittingFb, setIsSubmittingFb] = useState(false);

  // Tracking feedback states
  const [searchTrackingCode, setSearchTrackingCode] = useState('');
  const [trackedTicket, setTrackedTicket] = useState(null);
  const [isTracking, setIsTracking] = useState(false);

  // Fetch Courses
  const fetchCourses = async () => {
    try {
      const res = await api.get('/courses');
      if (res.data?.success) {
        setCourses(res.data.data.courses);
      }
    } catch (err) {
      console.error('Failed to load courses', err);
    }
  };

  // Fetch Transcript
  const fetchTranscript = async () => {
    try {
      const res = await api.get('/courses/transcript');
      if (res.data?.success) {
        setTranscript(res.data.data);
      }
    } catch (err) {
      console.error('Failed to load transcript', err);
    }
  };

  // Fetch Calendar
  const fetchCalendar = async () => {
    try {
      const res = await api.get('/feedback/academic-calendar');
      if (res.data?.success) {
        setCalendarEvents(res.data.data.events);
      }
    } catch (err) {
      console.error('Failed to load academic calendar', err);
    }
  };

  useEffect(() => {
    const loadAll = async () => {
      setLoading(true);
      await Promise.allSettled([fetchCourses(), fetchTranscript(), fetchCalendar()]);
      setLoading(false);
    };
    loadAll();
  }, []);

  // Course Enrollment Handler (انتخاب واحد)
  const handleEnroll = async (courseId) => {
    try {
      const res = await api.post(`/courses/${courseId}/enroll`);
      if (res.data?.success) {
        toast.success('درس با موفقیت در سامانه سس اخذ شد! ✅');
        fetchCourses();
        fetchTranscript();
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'خطا در اخذ درس');
    }
  };

  // Course Drop Handler (حذف واحد)
  const handleDrop = async (courseId) => {
    if (!confirm('آیا از حذف این واحد درسی اطمینان دارید؟')) return;
    try {
      const res = await api.post(`/courses/${courseId}/drop`);
      if (res.data?.success) {
        toast.success('درس با موفقیت حذف گردید.');
        fetchCourses();
        fetchTranscript();
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'خطا در حذف درس');
    }
  };

  // Submit Feedback Handler
  const handleSubmitFeedback = async (e) => {
    e.preventDefault();
    if (!fbMessage.trim()) return;

    setIsSubmittingFb(true);
    try {
      const res = await api.post('/feedback', {
        message: fbMessage,
        category: fbCategory,
        is_anonymous: fbIsAnonymous,
      });

      if (res.data?.success) {
        setGeneratedCode(res.data.data.tracking_code);
        toast.success('بازخورد شما در سامانه سس با موفقیت ثبت شد! 🎉');
        setFbMessage('');
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'خطا در ثبت پیام');
    } finally {
      setIsSubmittingFb(false);
    }
  };

  // Track Ticket Handler
  const handleTrackTicket = async (e) => {
    e.preventDefault();
    if (!searchTrackingCode.trim()) return;

    setIsTracking(true);
    try {
      const res = await api.get(`/feedback/track/${searchTrackingCode.trim()}`);
      if (res.data?.success) {
        setTrackedTicket(res.data.data.ticket);
        toast.success('گزارش وضعیت بازخورد یافت شد');
      }
    } catch (err) {
      setTrackedTicket(null);
      toast.error('کد پیگیری معتبر نیست یا هنوز پاسخی برای آن ثبت نشده است');
    } finally {
      setIsTracking(false);
    }
  };

  // Calculate enrolled credits
  const enrolledCourses = courses.filter((c) => c.enrollment?.status === 'enrolled');
  const enrolledCredits = enrolledCourses.reduce((sum, c) => sum + (c.credits || 0), 0);
  const maxCredits = 20;

  return (
    <div className={styles.container}>
      <Toaster position="top-center" />

      {/* Header with Shiraz University SESS inspiration */}
      <div className={styles.header}>
        <div className={styles.headerInfo}>
          <div className={styles.headerIcon}>🏛️</div>
          <div>
            <h1 className={styles.title}>پورتال خدمات آموزشی و دانشگاهی سس (SESS)</h1>
            <p className={styles.subtitle}>
              اتوماسیون انتخاب واحد، کارنامه و ریزنمرات رسمی، تقویم آموزشی و میز ارتباط با مسئولین
            </p>
          </div>
        </div>

        <div className={styles.sessBadge}>
          <span>●</span>
          <span>نیمسال اول سال تحصیلی ۱۴۰۳-۱۴۰۴ فعال است</span>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className={styles.navTabs}>
        <button
          className={`${styles.navTab} ${activeTab === 'courses' ? styles.navTabActive : ''}`}
          onClick={() => setActiveTab('courses')}
          type="button"
        >
          <HiOutlineAcademicCap />
          <span>انتخاب واحد و حذف و اضافه</span>
        </button>

        <button
          className={`${styles.navTab} ${activeTab === 'transcript' ? styles.navTabActive : ''}`}
          onClick={() => setActiveTab('transcript')}
          type="button"
        >
          <HiOutlineDocumentChartBar />
          <span>کارنامه و ریز نمرات رسمی</span>
        </button>

        <button
          className={`${styles.navTab} ${activeTab === 'calendar' ? styles.navTabActive : ''}`}
          onClick={() => setActiveTab('calendar')}
          type="button"
        >
          <HiOutlineCalendarDays />
          <span>تقویم و رویدادهای آموزشی</span>
        </button>

        <button
          className={`${styles.navTab} ${activeTab === 'feedback' ? styles.navTabActive : ''}`}
          onClick={() => setActiveTab('feedback')}
          type="button"
        >
          <HiOutlineChatBubbleBottomCenterText />
          <span>میز ارتباط با مسئولین و پیگیری ناشناس</span>
        </button>
      </div>

      {/* ── TAB 1: Course Selection (انتخاب واحد) ── */}
      {activeTab === 'courses' && (
        <div className={styles.sessBento}>
          {/* Credit Summary Strip */}
          <div className={styles.creditStrip}>
            <div className={styles.creditCard}>
              <div className={styles.creditIcon}>📚</div>
              <div className={styles.creditInfo}>
                <span className={styles.creditVal}>{enrolledCredits} واحد</span>
                <span className={styles.creditLbl}>واحدهای اخذ شده در این ترم</span>
              </div>
            </div>

            <div className={styles.creditCard}>
              <div className={styles.creditIcon}>⚖️</div>
              <div className={styles.creditInfo}>
                <span className={styles.creditVal}>{maxCredits - enrolledCredits} واحد</span>
                <span className={styles.creditLbl}>ظرفیت مجاز باقی‌مانده</span>
              </div>
            </div>

            <div className={styles.creditCard}>
              <div className={styles.creditIcon}>🎓</div>
              <div className={styles.creditInfo}>
                <span className={styles.creditVal}>{maxCredits} واحد</span>
                <span className={styles.creditLbl}>سقف مجاز انتخاب واحد</span>
              </div>
            </div>
          </div>

          {/* Courses Catalog Grid */}
          <div className={styles.courseGrid}>
            {courses.map((course) => {
              const isEnrolled = course.enrollment?.status === 'enrolled';
              const isFull = course.enrolled_count >= course.capacity;

              return (
                <div key={course.id} className={styles.courseCard}>
                  <div className={styles.courseHeader}>
                    <span className={styles.courseCode}>{course.code}</span>
                    <span className={styles.courseCredits}>{course.credits} واحد نظری/تخصصی</span>
                  </div>

                  <h3 className={styles.courseName}>{course.name}</h3>
                  {course.description && (
                    <p className={styles.courseDesc}>{course.description}</p>
                  )}

                  <div className={styles.courseMetaList}>
                    <div className={styles.courseMetaItem}>
                      <span>🏛️ دپارتمان:</span>
                      <strong>{course.department || 'گروه آموزشی مدرسه'}</strong>
                    </div>
                    <div className={styles.courseMetaItem}>
                      <span>👤 استاد درس:</span>
                      <strong>{course.teacher_name || 'کادر آموزشی'}</strong>
                    </div>
                    <div className={styles.courseMetaItem}>
                      <span>🕒 زمان کلاس:</span>
                      <span>{course.schedule || 'شنبه و دوشنبه'}</span>
                    </div>
                    <div className={styles.courseMetaItem}>
                      <span>📝 تاریخ امتحان نهایی:</span>
                      <span>{course.exam_date || 'اعلام خواهد شد'}</span>
                    </div>
                  </div>

                  {/* Capacity Bar */}
                  <div className={styles.capacityBarWrapper}>
                    <div className={styles.capacityLabel}>
                      <span>ظرفیت ثبت‌نام:</span>
                      <span>
                        {course.enrolled_count} از {course.capacity} نفر
                      </span>
                    </div>
                    <div className={styles.capacityBarBg}>
                      <div
                        className={styles.capacityBarFill}
                        style={{
                          width: `${Math.min(100, (course.enrolled_count / course.capacity) * 100)}%`,
                          background: isFull ? '#ef4444' : undefined,
                        }}
                      />
                    </div>
                  </div>

                  {/* Actions */}
                  <div className={styles.courseFooter}>
                    {isEnrolled ? (
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', width: '100%', justifyContent: 'space-between' }}>
                        <span className="badge badge-success">
                          <HiOutlineCheckCircle />
                          <span>اخذ شده</span>
                        </span>
                        {isStudent && (
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => handleDrop(course.id)}
                            type="button"
                          >
                            حذف درس
                          </button>
                        )}
                      </div>
                    ) : (
                      <button
                        className="btn btn-primary btn-sm"
                        style={{ width: '100%' }}
                        disabled={!isStudent || isFull}
                        onClick={() => handleEnroll(course.id)}
                        type="button"
                      >
                        {isFull ? 'ظرفیت تکمیل است' : 'اخذ درس در سس (+)'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── TAB 2: Transcript & GPA (کارنامه و ریز نمرات رسمی) ── */}
      {activeTab === 'transcript' && (
        <div className={styles.sessBento}>
          {/* GPA & Academic Status Banner */}
          <div className={styles.gpaBanner}>
            <div>
              <div className={styles.gpaTitle}>کارنامه تحصیلی رسمی و تراز علمی</div>
              <div className={styles.gpaSubtitle}>
                دانش‌آموز: {user?.display_name} — شماره پرونده: {user?.student_code || 'STD-140301'} — وضعیت: ممتاز (رتبه الف)
              </div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div className={styles.gpaScore}>
                {transcript?.summary?.gpa || '۱۹.۴۵'}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#cbd5e1' }}>معدل کل نیمسال (GPA)</div>
            </div>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => window.print()}
              type="button"
            >
              <HiOutlinePrinter />
              <span>چاپ گواهی و کارنامه</span>
            </button>
          </div>

          {/* Transcript Table */}
          <div className={styles.tableContainer}>
            <table className={styles.transcriptTable}>
              <thead>
                <tr>
                  <th>کد درس</th>
                  <th>عنوان درس تخصصی</th>
                  <th>تعداد واحد</th>
                  <th>دپارتمان</th>
                  <th>مدرس</th>
                  <th>وضعیت قبولی</th>
                  <th>نمره نهایی (از ۲۰)</th>
                </tr>
              </thead>
              <tbody>
                {transcript?.enrollments?.length > 0 ? (
                  transcript.enrollments.map((enr, i) => (
                    <tr key={i}>
                      <td style={{ fontFamily: 'monospace', color: '#a5b4fc' }}>{enr.code}</td>
                      <td style={{ fontWeight: 700 }}>{enr.name}</td>
                      <td>{enr.credits}</td>
                      <td>{enr.department || 'علوم پایه'}</td>
                      <td>{enr.teacher_name || 'دبیر محترم'}</td>
                      <td>
                        {enr.status === 'completed' ? (
                          <span className="badge badge-success">قبول قطعی</span>
                        ) : enr.status === 'enrolled' ? (
                          <span className="badge badge-primary">در حال تحصیل</span>
                        ) : (
                          <span className="badge badge-warning">حذف شده</span>
                        )}
                      </td>
                      <td style={{ fontWeight: 800 }}>
                        {enr.grade != null ? (
                          <span className={enr.grade >= 17 ? styles.gradePass : styles.gradePending}>
                            {enr.grade}
                          </span>
                        ) : (
                          <span style={{ color: 'var(--text-tertiary)' }}>ثبت نشده</span>
                        )}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: '2rem' }}>
                      هنوز نمره‌ای در سیستم ثبت نشده است.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── TAB 3: Academic Calendar (تقویم آموزشی رسمی) ── */}
      {activeTab === 'calendar' && (
        <div className={styles.sessBento}>
          <div className={styles.timeline}>
            {calendarEvents.map((evt) => (
              <div key={evt.id} className={styles.timelineItem}>
                <div className={styles.timelineDateCol}>
                  <span className={styles.timelineDate}>{evt.start_date}</span>
                  {evt.end_date && (
                    <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                      تا {evt.end_date}
                    </span>
                  )}
                  <span className={styles.timelineSemester}>نیمسال {evt.semester || '۱۴۰۳'}</span>
                </div>

                <div className={styles.timelineBody}>
                  <h3 className={styles.timelineTitle}>{evt.title}</h3>
                  <p className={styles.timelineDesc}>{evt.description}</p>
                </div>

                {evt.is_important && (
                  <span className="badge badge-warning" style={{ alignSelf: 'flex-start' }}>
                    مهلت حساس
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── TAB 4: Anonymous SESS Feedback & Tracking (میز ارتباط و پیگیری) ── */}
      {activeTab === 'feedback' && (
        <div className={styles.feedbackGrid}>
          {/* Submit Feedback Form */}
          <div className={styles.feedbackFormCard}>
            <div>
              <h2 className={styles.cardHeaderTitle}>ارسال پیشنهاد، انتقاد یا درخواست به مدیریت سس</h2>
              <p className={styles.cardHeaderSubtitle}>
                پیام‌ها مستقیماً توسط مدیر مجتمع و معاونت آموزشی بررسی می‌شوند.
              </p>
            </div>

            <form onSubmit={handleSubmitFeedback} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div className="input-group">
                <label className="input-label" htmlFor="fb_category">
                  موضوع درخواست
                </label>
                <select
                  id="fb_category"
                  className="input"
                  value={fbCategory}
                  onChange={(e) => setFbCategory(e.target.value)}
                >
                  <option value="educational">امور آموزشی، اساتید و آزمون‌ها</option>
                  <option value="facility">امکانات رفاهی، اینترنت و سایت کامپیوتر</option>
                  <option value="general">پیشنهاد و نوآوری کلی</option>
                  <option value="complaint">شکایت و گزارش مشکل</option>
                </select>
              </div>

              <div className="input-group">
                <label className="input-label" htmlFor="fb_msg">
                  متن پیام شما
                </label>
                <textarea
                  id="fb_msg"
                  className="input"
                  rows={4}
                  placeholder="دیدگاه، پیشنهاد یا انتقاد خود را به صورت شفاف بنویسید..."
                  value={fbMessage}
                  onChange={(e) => setFbMessage(e.target.value)}
                  required
                />
              </div>

              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.875rem' }}>
                <input
                  type="checkbox"
                  checked={fbIsAnonymous}
                  onChange={(e) => setFbIsAnonymous(e.target.checked)}
                />
                <span>ارسال به صورت ۱۰۰٪ ناشناس (بدون ثبت نام، شماره و هویت کاربری)</span>
              </label>

              <button
                type="submit"
                className="btn btn-primary"
                disabled={isSubmittingFb}
              >
                {isSubmittingFb ? 'در حال ثبت...' : 'ثبت پیام و دریافت شماره پیگیری سس'}
              </button>
            </form>

            {generatedCode && (
              <div className={styles.trackingResult} style={{ borderColor: 'var(--primary-500)', background: 'rgba(99, 102, 241, 0.1)' }}>
                <span style={{ fontSize: '0.8125rem', color: '#c7d2fe' }}>کد رهگیری اختصاصی پیام شما:</span>
                <span style={{ fontSize: '1.25rem', fontWeight: 900, color: '#38bdf8', fontFamily: 'monospace' }}>
                  {generatedCode}
                </span>
                <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                  لطفاً این کد را یادداشت فرمایید تا در بخش پیگیری از پاسخ مدیریت مطلع شوید.
                </span>
              </div>
            )}
          </div>

          {/* Track Existing Ticket */}
          <div className={styles.trackingCard}>
            <div>
              <h2 className={styles.cardHeaderTitle}>پیگیری پاسخ با شماره پیگیری</h2>
              <p className={styles.cardHeaderSubtitle}>
                برای مشاهده پاسخ مسئولین مربوطه، کد پیگیری دریافت شده را وارد کنید.
              </p>
            </div>

            <form onSubmit={handleTrackTicket} style={{ display: 'flex', gap: '8px' }}>
              <input
                className="input"
                type="text"
                placeholder="مثلاً: FB-SESS-9481"
                value={searchTrackingCode}
                onChange={(e) => setSearchTrackingCode(e.target.value)}
                required
                dir="ltr"
              />
              <button
                type="submit"
                className="btn btn-secondary"
                disabled={isTracking}
              >
                <HiOutlineMagnifyingGlass />
                <span>رهگیری</span>
              </button>
            </form>

            {trackedTicket && (
              <div className={styles.trackingResult}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.8125rem', color: '#94a3b8' }}>وضعیت درخواست:</span>
                  <span className={`badge ${trackedTicket.status === 'resolved' ? 'badge-success' : 'badge-warning'}`}>
                    {trackedTicket.status === 'resolved' ? 'پاسخ داده شده' : 'در دست بررسی'}
                  </span>
                </div>

                <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                  <strong>پیام شما:</strong> {trackedTicket.message}
                </div>

                {trackedTicket.response ? (
                  <div className={styles.ticketResponseBox}>
                    <strong>پاسخ رسمی مدیریت:</strong>
                    <div>{trackedTicket.response}</div>
                  </div>
                ) : (
                  <div style={{ fontSize: '0.8125rem', color: '#fbbf24' }}>
                    پیام شما در نوبت بررسی شورای مدیریت قرار دارد.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
