'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import useAuthStore from '../../../stores/authStore';
import toast from 'react-hot-toast';
import {
  HiOutlineVideoCamera,
  HiOutlineUserGroup,
  HiOutlineAcademicCap,
  HiOutlineUsers,
  HiOutlineCalendar,
  HiOutlineClock,
  HiOutlinePlus,
  HiOutlineXMark,
  HiOutlineClipboardDocumentCheck,
  HiOutlineTrash,
  HiOutlineCheckCircle,
  HiOutlineSparkles,
  HiOutlineBuildingOffice2,
} from 'react-icons/hi2';
import styles from './schoolMeetings.module.css';

const INITIAL_MEETINGS = [
  {
    id: 'meet-1',
    title: 'جلسه مجمع عمومی اولیا و مربیان با مدیریت مدرسه',
    audience: 'parents', // parents | teachers | students | general
    audienceLabel: 'ویژه کلیه اولیا و خانواده‌ها',
    host: 'دکتر علیرضا تقوی (مدیر مجتمع آموزشی)',
    date: 'امروز • ۴ آبان',
    time: 'ساعت ۱۸:۳۰ الی ۲۰:۰۰',
    duration: '۹۰ دقیقه',
    status: 'live', // live | upcoming | completed
    agenda: 'بررسی روند تحصیلی ماه اول، گزارش انضباطی و هماهنگی آزمون‌های میان‌ترم آبان‌ماه',
    link: '/dashboard/classes/1/live?type=parent_meeting',
  },
  {
    id: 'meet-2',
    title: 'شورای هماهنگی دبیران و کادر آموزشی مجتمع',
    audience: 'teachers',
    audienceLabel: 'ویژه دبیران و کادر مدرسه',
    host: 'ستاد معاونت آموزشی و مدیر مجتمع',
    date: 'فردا • ۵ آبان',
    time: 'ساعت ۱۵:۰۰ الی ۱۶:۳۰',
    duration: '۹۰ دقیقه',
    status: 'upcoming',
    agenda: 'ارزشیابی مستمر کلاسی، ثبت نمرات در کارنامه الکترونیکی و نظارت بر تکالیف',
    link: '/dashboard/classes/1/live?type=teachers_council',
  },
  {
    id: 'meet-3',
    title: 'وبینار تخصصی هدایت تحصیلی و روش‌های تست‌زنی',
    audience: 'students',
    audienceLabel: 'ویژه دانش‌آموزان کلیه پایه‌ها',
    host: 'مشاور ارشد تحصیلی و دبیران راهنما',
    date: 'پنجشنبه • ۷ آبان',
    time: 'ساعت ۱۰:۳۰ الی ۱۲:۰۰',
    duration: '۹۰ دقیقه',
    status: 'upcoming',
    agenda: 'روش‌های مدیریت زمان در مطالعه، کنترل استرس آزمون و برنامه‌ریزی هفتگی',
    link: '/dashboard/classes/1/live?type=student_webinar',
  },
  {
    id: 'meet-4',
    title: 'کارگاه آموزش خانواده: مدیریت فضای مجازی و تمرکز تحصیلی',
    audience: 'parents',
    audienceLabel: 'ویژه اولیای گرامی',
    host: 'دکتر مشاور خانواده و مدیریت دبیرستان',
    date: 'دوشنبه • ۱۱ آبان',
    time: 'ساعت ۱۷:۰۰ الی ۱۸:۳۰',
    duration: '۹۰ دقیقه',
    status: 'upcoming',
    agenda: 'راهکارهای همراهی اولیا با فرزندان در ایام امتحانات و برنامه‌ریزی درسی در منزل',
    link: '/dashboard/classes/1/live?type=parent_workshop',
  },
];

export default function SchoolMeetingsPage() {
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'admin' || user?.role === 'manager';
  const isTeacher = user?.role === 'teacher';
  const isParent = user?.role === 'parent';
  const isStudent = user?.role === 'student';

  // State
  const [meetings, setMeetings] = useState([]);
  const [activeTab, setActiveTab] = useState('all'); // all | parents | teachers | students
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newMeeting, setNewMeeting] = useState({
    title: '',
    audience: isParent ? 'parents' : isTeacher ? 'teachers' : isStudent ? 'students' : 'parents',
    host: user?.display_name || 'مدیریت مجتمع آموزشی',
    date: 'امروز',
    time: 'ساعت ۱۸:۰۰',
    duration: '۶۰ دقیقه',
    agenda: '',
  });

  // Load from LocalStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('school_online_meetings_list');
      if (saved) {
        setMeetings(JSON.parse(saved));
      } else {
        setMeetings(INITIAL_MEETINGS);
        localStorage.setItem('school_online_meetings_list', JSON.stringify(INITIAL_MEETINGS));
      }
    } catch (e) {
      setMeetings(INITIAL_MEETINGS);
    }
  }, []);

  // Filter meetings by tab and role
  const filteredMeetings = meetings.filter((m) => {
    if (activeTab === 'all') return true;
    return m.audience === activeTab;
  });

  // Save New Meeting (Admin & Teacher)
  const handleSaveMeeting = (e) => {
    e.preventDefault();
    if (!newMeeting.title.trim()) {
      return toast.error('لطفاً عنوان وبینار یا جلسه را وارد کنید');
    }

    let audLabel = 'عمومی مدرسه';
    if (newMeeting.audience === 'parents') audLabel = 'ویژه اولیای گرامی';
    if (newMeeting.audience === 'teachers') audLabel = 'ویژه دبیران و کادر مدرسه';
    if (newMeeting.audience === 'students') audLabel = 'ویژه دانش‌آموزان';

    const created = {
      id: `meet-${Date.now()}`,
      title: newMeeting.title.trim(),
      audience: newMeeting.audience,
      audienceLabel: audLabel,
      host: newMeeting.host.trim() || user?.display_name || 'مدیریت مدرسه',
      date: newMeeting.date.trim() || 'به زودی',
      time: newMeeting.time.trim() || 'ساعت ۱۸:۰۰',
      duration: newMeeting.duration.trim() || '۶۰ دقیقه',
      status: 'upcoming',
      agenda: newMeeting.agenda.trim() || 'جلسه رسمی آنلاین از طرف مدرسه',
      link: `/dashboard/classes/1/live?type=school_${newMeeting.audience}`,
    };

    const updated = [created, ...meetings];
    setMeetings(updated);
    try {
      localStorage.setItem('school_online_meetings_list', JSON.stringify(updated));
    } catch (e) {}

    toast.success('جلسه آنلاین جدید با موفقیت ثبت و به اطلاع مخاطبان رسید 🎉');
    setShowCreateModal(false);
    setNewMeeting({
      title: '',
      audience: 'parents',
      host: user?.display_name || 'مدیریت مجتمع آموزشی',
      date: 'فردا',
      time: 'ساعت ۱۸:۰۰',
      duration: '۶۰ دقیقه',
      agenda: '',
    });
  };

  // Delete Meeting
  const handleDeleteMeeting = (id, title) => {
    if (!window.confirm(`آیا از حذف وبینار «${title}» اطمینان دارید؟`)) return;
    const updated = meetings.filter((m) => m.id !== id);
    setMeetings(updated);
    try {
      localStorage.setItem('school_online_meetings_list', JSON.stringify(updated));
    } catch (e) {}
    toast.success('جلسه از تقویم وبینارها حذف شد');
  };

  // Copy Meeting Link
  const handleCopyLink = (m) => {
    const fullUrl = `${window.location.origin}${m.link}`;
    navigator.clipboard.writeText(fullUrl);
    toast.success('لینک ورود به جلسه کپی شد! 📋');
  };

  const getAudienceBadgeClass = (aud) => {
    switch (aud) {
      case 'parents': return styles.badgeParent;
      case 'teachers': return styles.badgeTeacher;
      case 'students': return styles.badgeStudent;
      default: return styles.badgeGeneral;
    }
  };

  return (
    <div className={styles.container} dir="rtl">
      {/* ── 1. Header Banner ── */}
      <div className={styles.headerBanner}>
        <div className={styles.headerInfo}>
          <div className={styles.badgeLivePulse}>
            <span className={styles.pulseDot} />
            <span>اتاق وبینار و جلسات آنلاین مدرسه فعال است</span>
          </div>
          <h1 className={styles.title}>
            <HiOutlineVideoCamera style={{ color: '#818cf8', fontSize: '2rem' }} />
            <span>{isAdmin ? 'وبینارها و جلسات آنلاین مدرسه' : 'جلسات آنلاین و وبینارها از طرف مدرسه'}</span>
          </h1>
          <p className={styles.description}>
            {isAdmin
              ? 'سامانه برگزاری وبینارهای سراسری، جلسات هماهنگی انجمن اولیا و مربیان، شورای دبیران و همایش‌های مجازی دانش‌آموزان.'
              : isParent
              ? 'شرکت در جلسات آنلاین انجمن اولیا و مربیان، کارگاه‌های آموزش خانواده و ارتباط تصویری مستقیم با مدیریت و مشاوران مدرسه.'
              : isTeacher
              ? 'ورود به جلسات آنلاین شورای معلمان، نشست‌های اداری و وبینارهای آموزشی مدرسه با مدیریت مجتمع.'
              : 'ورود به وبینارهای آموزشی، مشاوره‌ای و همایش‌های انگیزشی آنلاین برگزار شده از سوی مدرسه.'}
          </p>
        </div>

        <div className={styles.headerActions}>
          {isAdmin && (
            <button
              type="button"
              className={styles.createMeetingBtn}
              onClick={() => setShowCreateModal(true)}
            >
              <HiOutlinePlus style={{ fontSize: '1.2rem' }} />
              <span>تعریف جلسه یا وبینار جدید</span>
            </button>
          )}

          <Link
            href="/dashboard/classes/1/live?type=school_webinar"
            className={styles.joinLiveBtn}
            title="ورود به اتاق زنده پخش و تخته هوشمند مدرسه"
          >
            <HiOutlineVideoCamera style={{ fontSize: '1.25rem' }} />
            <span>ورود به اتاق وبینار زنده (LIVE)</span>
          </Link>
        </div>
      </div>

      {/* ── 2. Active Live Room Card ── */}
      <div className={styles.liveRoomCard}>
        <div className={styles.liveRoomHeader}>
          <div className={styles.liveRoomIcon}>
            <HiOutlineVideoCamera />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <span style={{ background: '#ef4444', color: '#fff', fontSize: '0.6875rem', fontWeight: 900, padding: '2px 8px', borderRadius: '4px' }}>
                پخش زنده فعال
              </span>
              <h2 className={styles.liveRoomTitle} style={{ margin: 0 }}>
                اتاق اختصاصی جلسات آنلاین مدرسه
              </h2>
            </div>
            <p className={styles.liveRoomDesc}>
              مجهز به تخته هوشمند تعاملی، وبکم، میکروفون، اشتراک‌گذاری تصویر و اسلاید، و چت عمومی اعضا
            </p>
          </div>
        </div>

        <div className={styles.liveRoomRight}>
          <Link
            href="/dashboard/classes/1/live?type=school_webinar"
            className={styles.enterBtn}
            style={{ padding: '12px 24px', fontSize: '0.9375rem' }}
          >
            <span>ورود به اتاق جلسه 🚀</span>
          </Link>
        </div>
      </div>

      {/* ── 3. Tabs Navigation ── */}
      <div className={styles.tabsContainer}>
        <button
          className={`${styles.tabBtn} ${activeTab === 'all' ? styles.tabBtnActive : ''}`}
          onClick={() => setActiveTab('all')}
        >
          <HiOutlineSparkles />
          <span>همه جلسات ({meetings.length})</span>
        </button>

        <button
          className={`${styles.tabBtn} ${activeTab === 'parents' ? styles.tabBtnActive : ''}`}
          onClick={() => setActiveTab('parents')}
        >
          <HiOutlineUserGroup />
          <span>جلسات اولیا و مربیان ({meetings.filter((m) => m.audience === 'parents').length})</span>
        </button>

        <button
          className={`${styles.tabBtn} ${activeTab === 'teachers' ? styles.tabBtnActive : ''}`}
          onClick={() => setActiveTab('teachers')}
        >
          <HiOutlineAcademicCap />
          <span>شورای دبیران ({meetings.filter((m) => m.audience === 'teachers').length})</span>
        </button>

        <button
          className={`${styles.tabBtn} ${activeTab === 'students' ? styles.tabBtnActive : ''}`}
          onClick={() => setActiveTab('students')}
        >
          <HiOutlineUsers />
          <span>وبینار دانش‌آموزان ({meetings.filter((m) => m.audience === 'students').length})</span>
        </button>
      </div>

      {/* ── 4. Meetings Grid ── */}
      {filteredMeetings.length === 0 ? (
        <div className={styles.emptyState}>
          <div style={{ fontSize: '3rem', marginBottom: '12px' }}>📅</div>
          <h3 style={{ margin: '0 0 6px 0', fontWeight: 800 }}>جلسه‌ای در این بخش یافت نشد</h3>
          <p style={{ margin: 0, fontSize: '0.875rem' }}>
            در حال حاضر وبیناری با این فیلتر تعریف نشده است.
          </p>
        </div>
      ) : (
        <div className={styles.meetingsGrid}>
          {filteredMeetings.map((item) => (
            <div key={item.id} className={styles.meetingCard}>
              <div>
                <div className={styles.cardTop}>
                  <span className={`${styles.targetAudienceBadge} ${getAudienceBadgeClass(item.audience)}`}>
                    {item.audience === 'parents' ? '👨‍👩‍👧 اولیا و مربیان' : item.audience === 'teachers' ? '👨‍🏫 شورای معلمان' : '🎓 دانش‌آموزان'}
                  </span>

                  {item.status === 'live' && (
                    <span style={{ background: '#ef4444', color: '#ffffff', fontSize: '0.6875rem', fontWeight: 900, padding: '2px 8px', borderRadius: '4px' }}>
                      🔴 در حال برگزاری
                    </span>
                  )}
                </div>

                <h3 className={styles.cardTitle}>{item.title}</h3>
                <div className={styles.cardHost}>
                  <HiOutlineBuildingOffice2 style={{ color: '#0ea5e9' }} />
                  <span>برگزارکننده: {item.host}</span>
                </div>

                <div className={styles.cardMetaGrid}>
                  <div className={styles.cardMetaRow}>
                    <span><HiOutlineCalendar style={{ verticalAlign: 'middle', marginLeft: 4 }} /> زمان:</span>
                    <span className={styles.cardMetaValue}>{item.date} • {item.time}</span>
                  </div>
                  <div className={styles.cardMetaRow}>
                    <span><HiOutlineClock style={{ verticalAlign: 'middle', marginLeft: 4 }} /> مدت:</span>
                    <span className={styles.cardMetaValue}>{item.duration}</span>
                  </div>
                  {item.agenda && (
                    <div style={{ marginTop: '4px', fontSize: '0.75rem', color: 'var(--text-tertiary, #64748b)', lineHeight: '1.5' }}>
                      <strong>دستور جلسه:</strong> {item.agenda}
                    </div>
                  )}
                </div>
              </div>

              <div className={styles.cardActions}>
                <Link href={item.link} className={styles.enterBtn}>
                  <HiOutlineVideoCamera />
                  <span>{item.status === 'live' ? 'ورود به وبینار زنده' : 'ورود به اتاق جلسه'}</span>
                </Link>

                <button
                  type="button"
                  className={styles.copyLinkBtn}
                  onClick={() => handleCopyLink(item)}
                  title="کپی لینک دعوت به جلسه"
                >
                  <HiOutlineClipboardDocumentCheck />
                </button>

                {isAdmin && (
                  <button
                    type="button"
                    className={styles.deleteBtn}
                    onClick={() => handleDeleteMeeting(item.id, item.title)}
                    title="حذف جلسه"
                  >
                    <HiOutlineTrash />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── 5. Create Meeting Modal (Admin) ── */}
      {showCreateModal && (
        <div className={styles.modalOverlay} onClick={() => setShowCreateModal(false)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>
                <HiOutlineVideoCamera style={{ color: '#6366f1' }} />
                <span>تعریف وبینار و جلسه آنلاین جدید مدرسه</span>
              </h3>
              <button
                type="button"
                className={styles.closeBtn}
                onClick={() => setShowCreateModal(false)}
              >
                <HiOutlineXMark />
              </button>
            </div>

            <form onSubmit={handleSaveMeeting} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div className={styles.formGroup}>
                <label className={styles.label}>عنوان وبینار / جلسه آنلاین *</label>
                <input
                  type="text"
                  className={styles.input}
                  placeholder="مثال: مجمع عمومی اولیا و مربیان یا شورای دبیران پایه دهم"
                  value={newMeeting.title}
                  onChange={(e) => setNewMeeting({ ...newMeeting, title: e.target.value })}
                  required
                />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label}>مخاطبان هدف این جلسه *</label>
                <select
                  className={styles.select}
                  value={newMeeting.audience}
                  onChange={(e) => setNewMeeting({ ...newMeeting, audience: e.target.value })}
                >
                  <option value="parents">👨‍👩‍👧 اولیا و خانواده‌ها (نشست آموزش خانواده / کارنامه)</option>
                  <option value="teachers">👨‍🏫 کادر و دبیران (شورای معلمان / جلسات اداری)</option>
                  <option value="students">🎓 دانش‌آموزان (وبینار کنکور، هدایت تحصیلی و انگیزشی)</option>
                  <option value="general">📢 عمومی (کلیه اعضای مجتمع آموزشی)</option>
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className={styles.formGroup}>
                  <label className={styles.label}>تاریخ برگزاری</label>
                  <input
                    type="text"
                    className={styles.input}
                    placeholder="مثال: دوشنبه ۱۰ آبان"
                    value={newMeeting.date}
                    onChange={(e) => setNewMeeting({ ...newMeeting, date: e.target.value })}
                  />
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.label}>ساعت برگزاری</label>
                  <input
                    type="text"
                    className={styles.input}
                    placeholder="مثال: ساعت ۱۸:۳۰"
                    value={newMeeting.time}
                    onChange={(e) => setNewMeeting({ ...newMeeting, time: e.target.value })}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className={styles.formGroup}>
                  <label className={styles.label}>مدت زمان جلسه</label>
                  <input
                    type="text"
                    className={styles.input}
                    placeholder="مثال: ۹۰ دقیقه"
                    value={newMeeting.duration}
                    onChange={(e) => setNewMeeting({ ...newMeeting, duration: e.target.value })}
                  />
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.label}>میزبان یا سخنران</label>
                  <input
                    type="text"
                    className={styles.input}
                    placeholder="مثال: مدیریت مجتمع آموزشی"
                    value={newMeeting.host}
                    onChange={(e) => setNewMeeting({ ...newMeeting, host: e.target.value })}
                  />
                </div>
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label}>دستور جلسه یا توضیحات</label>
                <textarea
                  className={styles.textarea}
                  rows={3}
                  placeholder="محورهای گفتگو و سرفصل‌های مطرح‌شده در وبینار..."
                  value={newMeeting.agenda}
                  onChange={(e) => setNewMeeting({ ...newMeeting, agenda: e.target.value })}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowCreateModal(false)}
                >
                  انصراف
                </button>
                <button type="submit" className="btn btn-primary" style={{ fontWeight: 800 }}>
                  <HiOutlineCheckCircle />
                  <span>ثبت و ابلاغ وبینار</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
