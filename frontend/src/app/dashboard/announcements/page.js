'use client';
import { useState, useEffect, useMemo } from 'react';
import useAuthStore from '../../../stores/authStore';
import api from '../../../lib/api';
import toast from 'react-hot-toast';
import {
  HiOutlineMegaphone,
  HiOutlinePlusCircle,
  HiOutlineExclamationTriangle,
  HiOutlineCheckCircle,
  HiOutlineTrash,
  HiOutlineUserGroup,
  HiOutlineUsers,
  HiOutlineAcademicCap,
  HiOutlineClock,
  HiOutlineXMark,
  HiOutlineShieldCheck,
  HiOutlineEye,
  HiOutlineCheck,
  HiOutlinePlus,
} from 'react-icons/hi2';
import styles from './announcements.module.css';

const DEFAULT_ANNOUNCEMENT_GRADES = [
  'پایه دهم ریاضی',
  'پایه دهم تجربی',
  'پایه دهم انسانی',
  'پایه یازدهم ریاضی',
  'پایه یازدهم تجربی',
  'پایه یازدهم انسانی',
  'پایه دوازدهم ریاضی',
  'پایه دوازدهم تجربی',
  'پایه دوازدهم انسانی',
  'پایه هفتم',
  'پایه هشتم',
  'پایه نهم',
  'دبستان (ابتدایی)',
  'هنرستان (فنی‌حرفه‌ای و کاردانش)',
  'کلاس‌های کنکور و المپیاد',
  'پایه دهم',
  'پایه یازدهم',
  'پایه دوازدهم',
];

const DEFAULT_ANNOUNCEMENT_SUBJECTS = [
  'ریاضیات و حسابان',
  'فیزیک',
  'شیمی',
  'زیست‌شناسی',
  'هندسه و گسسته',
  'ادبیات و زبان فارسی',
  'زبان انگلیسی',
  'عربی و زبان قرآن',
  'دین و زندگی',
  'تاریخ و جغرافیا',
  'علوم تجربی',
  'علوم اجتماعی و جامعه‌شناسی',
  'فلسفه و منطق',
  'روان‌شناسی',
  'کامپیوتر و برنامه‌نویسی',
  'هنر و گرافیک',
  'تربیت بدنی و ورزش',
  'کار و فناوری',
];

export default function AnnouncementsPage() {
  const { user } = useAuthStore();
  const [announcements, setAnnouncements] = useState([]);
  const [targetingOptions, setTargetingOptions] = useState({
    grades: DEFAULT_ANNOUNCEMENT_GRADES,
    subjects: DEFAULT_ANNOUNCEMENT_SUBJECTS,
    classes: [],
  });
  const [customGradeInput, setCustomGradeInput] = useState('');
  const [customSubjectInput, setCustomSubjectInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('all');

  // Modals state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [selectedStatsAnnouncement, setSelectedStatsAnnouncement] = useState(null);
  const [showStatsModal, setShowStatsModal] = useState(false);

  // New Announcement Form State
  const [form, setForm] = useState({
    title: '',
    content: '',
    priority: 'important', // normal | important | urgent
    target_audience: 'all', // all | students | parents
    target_grades: ['*'], // ['*'] or array of grade strings
    target_subjects: ['*'], // ['*'] or array of subject strings
    target_class_ids: ['*'], // ['*'] or array of class UUIDs
    is_mandatory: true,
  });

  const isTeacherOrAdmin = user?.role === 'teacher' || user?.role === 'admin' || user?.role === 'manager';

  const myTaughtGrades = useMemo(() => {
    try {
      let settings = user?.settings;
      if (!settings && typeof window !== 'undefined') {
        const cached = JSON.parse(localStorage.getItem('cached_user') || 'null');
        settings = cached?.settings;
      }
      const parsed = typeof settings === 'string' ? JSON.parse(settings) : (settings || {});
      return Array.isArray(parsed.taught_grades) ? parsed.taught_grades : [];
    } catch (e) {
      return [];
    }
  }, [user]);

  useEffect(() => {
    fetchAnnouncements();
    fetchTargetingOptions();
  }, [user]);

  const fetchAnnouncements = async () => {
    try {
      setLoading(true);
      const res = await api.get('/announcements');
      if (res.data?.success) {
        setAnnouncements(res.data.data.announcements || []);
      }
    } catch (err) {
      console.error('Error fetching announcements:', err);
      toast.error('خطا در بارگذاری فهرست اطلاعیه‌ها');
    } finally {
      setLoading(false);
    }
  };

  const fetchTargetingOptions = async () => {
    let teacherGrades = [];
    let teacherSubject = null;
    try {
      let settings = user?.settings;
      if (!settings && typeof window !== 'undefined') {
        const cached = JSON.parse(localStorage.getItem('cached_user') || 'null');
        settings = cached?.settings;
      }
      const parsedSettings = typeof settings === 'string' ? JSON.parse(settings) : (settings || {});
      if (Array.isArray(parsedSettings.taught_grades)) {
        teacherGrades = parsedSettings.taught_grades;
      }
      if (parsedSettings.subject) {
        teacherSubject = parsedSettings.subject;
      }
    } catch (e) {}

    try {
      const res = await api.get('/announcements/targeting-options');
      if (res.data?.success && res.data.data) {
        const fetched = res.data.data;
        const mergedGrades = Array.from(new Set([
          ...teacherGrades,
          ...(fetched.grades || []),
          ...DEFAULT_ANNOUNCEMENT_GRADES,
        ]));
        const mergedSubjects = Array.from(new Set([
          ...(teacherSubject ? [teacherSubject] : []),
          ...(fetched.subjects || []),
          ...DEFAULT_ANNOUNCEMENT_SUBJECTS,
        ]));
        setTargetingOptions({
          grades: mergedGrades,
          subjects: mergedSubjects,
          classes: fetched.classes || [],
        });
        return;
      }
    } catch (err) {
      console.error('Error fetching targeting options:', err);
    }

    // Fallback if network or error
    setTargetingOptions((prev) => ({
      ...prev,
      grades: Array.from(new Set([...teacherGrades, ...prev.grades, ...DEFAULT_ANNOUNCEMENT_GRADES])),
      subjects: Array.from(new Set([...(teacherSubject ? [teacherSubject] : []), ...prev.subjects, ...DEFAULT_ANNOUNCEMENT_SUBJECTS])),
    }));
  };

  const handleAddCustomGrade = () => {
    if (!customGradeInput || !customGradeInput.trim()) return;
    const clean = customGradeInput.trim();
    if (!targetingOptions.grades.includes(clean)) {
      setTargetingOptions((prev) => ({
        ...prev,
        grades: [clean, ...prev.grades],
      }));
    }
    toggleGradeSelect(clean);
    setCustomGradeInput('');
    toast.success(`پایه «${clean}» اضافه و انتخاب شد 👍`);
  };

  const handleAddCustomSubject = () => {
    if (!customSubjectInput || !customSubjectInput.trim()) return;
    const clean = customSubjectInput.trim();
    if (!targetingOptions.subjects.includes(clean)) {
      setTargetingOptions((prev) => ({
        ...prev,
        subjects: [clean, ...prev.subjects],
      }));
    }
    toggleSubjectSelect(clean);
    setCustomSubjectInput('');
    toast.success(`درس «${clean}» اضافه و انتخاب شد 👍`);
  };

  const selectOnlyTeacherGrades = (grades) => {
    if (!grades || grades.length === 0) return;
    setForm({ ...form, target_grades: [...grades] });
    toast.success(`پایه‌های اختصاصی شما (${grades.length} پایه) انتخاب شدند 👍`);
  };

  const handleCreateAnnouncement = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) {
      return toast.error('لطفاً عنوان اطلاعیه را بنویسید');
    }
    if (!form.content.trim()) {
      return toast.error('لطفاً متن پیام اطلاعیه را بنویسید');
    }

    try {
      setSubmitting(true);
      const res = await api.post('/announcements', form);
      if (res.data?.success) {
        toast.success('اطلاعیه با موفقیت صادر و بر اساس پایه، درس و مخاطبان ارسال شد');
        setShowCreateModal(false);
        setForm({
          title: '',
          content: '',
          priority: 'important',
          target_audience: 'all',
          target_grades: ['*'],
          target_subjects: ['*'],
          target_class_ids: ['*'],
          is_mandatory: true,
        });
        fetchAnnouncements();
      }
    } catch (err) {
      console.error('Error creating announcement:', err);
      toast.error(err.response?.data?.message || 'خطا در ثبت اطلاعیه');
    } finally {
      setSubmitting(false);
    }
  };

  // Toggle grade selection
  const toggleGradeSelect = (grade) => {
    if (grade === '*') {
      setForm({ ...form, target_grades: ['*'] });
      return;
    }
    let current = form.target_grades.includes('*') ? [] : [...form.target_grades];
    if (current.includes(grade)) {
      current = current.filter((g) => g !== grade);
      if (current.length === 0) current = ['*'];
    } else {
      current.push(grade);
    }
    setForm({ ...form, target_grades: current });
  };

  // Toggle subject selection
  const toggleSubjectSelect = (subject) => {
    if (subject === '*') {
      setForm({ ...form, target_subjects: ['*'] });
      return;
    }
    let current = form.target_subjects.includes('*') ? [] : [...form.target_subjects];
    if (current.includes(subject)) {
      current = current.filter((s) => s !== subject);
      if (current.length === 0) current = ['*'];
    } else {
      current.push(subject);
    }
    setForm({ ...form, target_subjects: current });
  };

  // Toggle class selection in form
  const toggleClassSelect = (classId) => {
    if (classId === '*') {
      setForm({ ...form, target_class_ids: ['*'] });
      return;
    }

    let current = form.target_class_ids.includes('*') ? [] : [...form.target_class_ids];
    if (current.includes(classId)) {
      current = current.filter((id) => id !== classId);
      if (current.length === 0) current = ['*'];
    } else {
      current.push(classId);
    }
    setForm({ ...form, target_class_ids: current });
  };

  const handleAcknowledge = async (id) => {
    try {
      const res = await api.post(`/announcements/${id}/acknowledge`);
      if (res.data?.success) {
        toast.success('مطالعه اطلاعیه با موفقیت تایید شد');
        fetchAnnouncements();
      }
    } catch (err) {
      console.error('Error acknowledging:', err);
      toast.error(err.response?.data?.message || 'خطا در تایید پیام');
    }
  };

  const handleDeleteAnnouncement = async (id) => {
    if (!window.confirm('آیا از حذف این اطلاعیه اطمینان دارید؟')) return;

    try {
      const res = await api.delete(`/announcements/${id}`);
      if (res.data?.success) {
        toast.success('اطلاعیه حذف گردید');
        setAnnouncements(announcements.filter((a) => a.id !== id));
      }
    } catch (err) {
      console.error('Error deleting announcement:', err);
      toast.error('خطا در حذف اطلاعیه');
    }
  };

  const openStatsModal = async (announcement) => {
    try {
      const res = await api.get(`/announcements/${announcement.id}/stats`);
      if (res.data?.success) {
        setSelectedStatsAnnouncement({
          ...announcement,
          statsData: res.data.data,
        });
        setShowStatsModal(true);
      }
    } catch (err) {
      console.error('Error getting stats:', err);
      toast.error('خطا در دریافت آمار تاییدها');
    }
  };


  // Filtered announcements
  const isMgmtAnn = (a) => a.is_management || a.teacher_role === 'admin' || a.teacher_role === 'manager';

  const filteredList = announcements.filter((item) => {
    if (activeTab === 'urgent') return item.priority === 'urgent';
    if (activeTab === 'mandatory') return item.is_mandatory;
    if (activeTab === 'management') return isMgmtAnn(item);
    if (activeTab === 'parents') return item.target_audience === 'parents';
    if (activeTab === 'students') return item.target_audience === 'students';
    if (activeTab === 'unacknowledged' && !isTeacherOrAdmin) return !item.is_acknowledged;
    return true;
  });

  const totalUrgent = announcements.filter((a) => a.priority === 'urgent').length;
  const totalMandatory = announcements.filter((a) => a.is_mandatory).length;
  const totalManagement = announcements.filter(isMgmtAnn).length;

  return (
    <div className={styles.container} dir="rtl">
      {/* Page Header */}
      <div className={styles.header}>
        <div>
          <h1 className={styles.headerTitle}>
            <HiOutlineMegaphone style={{ color: '#6366f1' }} />
            اطلاع‌رسانی و بخشنامه‌های هوشمند مدرسه
          </h1>
          <p className={styles.headerSubtitle}>
            ارسال پیام‌های رسمی با قابلیت پاپ‌آپ اجباری قبل از ورود به پنل، تفکیک مخاطبان (دانش‌آموزان / اولیا) و پایش لحظه‌ای تاییدها
          </p>
        </div>

        {isTeacherOrAdmin && (
          <button
            className="btn btn-primary"
            style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 20px' }}
            onClick={() => setShowCreateModal(true)}
          >
            <HiOutlinePlusCircle style={{ fontSize: '1.25rem' }} />
            صدور اطلاعیه جدید
          </button>
        )}
      </div>

      {/* Stats Summary Cards */}
      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <div className={styles.statIcon} style={{ background: 'rgba(99, 102, 241, 0.15)', color: '#6366f1' }}>
            <HiOutlineMegaphone />
          </div>
          <div className={styles.statInfo}>
            <span className={styles.statLabel}>کل اطلاعیه‌ها</span>
            <span className={styles.statValue}>{announcements.length}</span>
          </div>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statIcon} style={{ background: 'rgba(239, 68, 68, 0.15)', color: '#ef4444' }}>
            <HiOutlineExclamationTriangle />
          </div>
          <div className={styles.statInfo}>
            <span className={styles.statLabel}>اطلاعیه‌های فوری و اضطراری</span>
            <span className={styles.statValue}>{totalUrgent}</span>
          </div>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statIcon} style={{ background: 'rgba(244, 63, 94, 0.15)', color: '#f43f5e' }}>
            <HiOutlineShieldCheck />
          </div>
          <div className={styles.statInfo}>
            <span className={styles.statLabel}>دارای پاپ‌آپ اجباری</span>
            <span className={styles.statValue}>{totalMandatory}</span>
          </div>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statIcon} style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#10b981' }}>
            <HiOutlineCheckCircle />
          </div>
          <div className={styles.statInfo}>
            <span className={styles.statLabel}>وضعیت سیستم اطلاع‌رسانی</span>
            <span className={styles.statValue} style={{ fontSize: '1rem', color: '#10b981' }}>
              فعال و برخط
            </span>
          </div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className={styles.tabsRow}>
        <div className={styles.filterTabs}>
          <button
            className={`${styles.tabBtn} ${activeTab === 'all' ? styles.activeTab : ''}`}
            onClick={() => setActiveTab('all')}
          >
            همه ({announcements.length})
          </button>
          <button
            className={`${styles.tabBtn} ${activeTab === 'management' ? styles.activeTab : ''}`}
            onClick={() => setActiveTab('management')}
            style={totalManagement > 0 ? { borderColor: 'rgba(245, 158, 11, 0.5)', color: '#d97706', fontWeight: 700 } : {}}
          >
            🏛️ بخشنامه‌های مدیریت مدرسه ({totalManagement})
          </button>
          <button
            className={`${styles.tabBtn} ${activeTab === 'urgent' ? styles.activeTab : ''}`}
            onClick={() => setActiveTab('urgent')}
          >
            فوری و اضطراری ({totalUrgent})
          </button>
          <button
            className={`${styles.tabBtn} ${activeTab === 'mandatory' ? styles.activeTab : ''}`}
            onClick={() => setActiveTab('mandatory')}
          >
            پاپ‌آپ اجباری ({totalMandatory})
          </button>
          <button
            className={`${styles.tabBtn} ${activeTab === 'students' ? styles.activeTab : ''}`}
            onClick={() => setActiveTab('students')}
          >
            مخصوص دانش‌آموزان
          </button>
          <button
            className={`${styles.tabBtn} ${activeTab === 'parents' ? styles.activeTab : ''}`}
            onClick={() => setActiveTab('parents')}
          >
            مخصوص اولیا و خانواده‌ها
          </button>
          {!isTeacherOrAdmin && (
            <button
              className={`${styles.tabBtn} ${activeTab === 'unacknowledged' ? styles.activeTab : ''}`}
              onClick={() => setActiveTab('unacknowledged')}
            >
              در انتظار تایید من
            </button>
          )}
        </div>
      </div>

      {/* Announcements List */}
      {loading ? (
        <div className={styles.emptyState}>
          <div className="spinner"></div>
          <p>در حال بارگذاری اطلاعیه‌ها...</p>
        </div>
      ) : filteredList.length === 0 ? (
        <div className={styles.emptyState}>
          <HiOutlineMegaphone style={{ fontSize: '3rem', opacity: 0.4 }} />
          <h3>هیچ اطلاعیه‌ای در این بخش یافت نشد</h3>
          <p>در صورت صدور بخشنامه یا پیام جدید، در این قسمت نمایش داده خواهد شد.</p>
        </div>
      ) : (
        <div className={styles.cardsGrid}>
          {filteredList.map((ann) => {
            const priorityBadgeClass = {
              urgent: styles.badgeUrgent,
              important: styles.badgeImportant,
              normal: styles.badgeNormal,
            }[ann.priority] || styles.badgeImportant;

            const priorityText = {
              urgent: 'فوری و اضطراری',
              important: 'مهم',
              normal: 'عادی',
            }[ann.priority] || 'مهم';

            const audienceText = {
              all: '👥 همه (دانش‌آموزان و اولیا)',
              students: '🎓 فقط دانش‌آموزان',
              parents: '👨‍👩‍👧 فقط اولیا و خانواده‌ها',
            }[ann.target_audience] || 'همه';

            const classTargetDisplay =
              ann.target_class_ids?.includes('*') || !ann.target_class_ids?.length
                ? '🏫 تمام کلاس‌های مدرسه'
                : `🏫 ${ann.target_class_ids.length} کلاس انتخابی`;

            const isFromManagement = isMgmtAnn(ann);

            return (
              <div
                key={ann.id}
                className={`${styles.noticeCard} ${isFromManagement ? styles.noticeCardManagement : ''}`}
              >
                <div className={styles.cardTopRow}>
                  <div className={styles.tagsCluster}>
                    {isFromManagement && (
                      <span className={`${styles.badge} ${styles.managementTag}`}>
                        🏛️ پیام رسمی مدیریت مجتمع مدرسه
                      </span>
                    )}

                    <span className={`${styles.badge} ${priorityBadgeClass}`}>
                      {priorityText}
                    </span>

                    {ann.is_mandatory && (
                      <span className={`${styles.badge} ${styles.mandatoryTag}`}>
                        <HiOutlineExclamationTriangle /> پاپ‌آپ اجباری قبل ورود
                      </span>
                    )}

                    <span className={`${styles.badge} ${styles.audienceTag}`}>
                      {audienceText}
                    </span>

                    <span className={`${styles.badge} ${styles.audienceTag}`}>
                      🎓 پایه: {ann.target_grades?.includes('*') || !ann.target_grades?.length ? 'تمام پایه‌ها' : ann.target_grades.join('، ')}
                    </span>

                    <span className={`${styles.badge} ${styles.audienceTag}`}>
                      📖 درس: {ann.target_subjects?.includes('*') || !ann.target_subjects?.length ? 'تمام درس‌ها' : ann.target_subjects.join('، ')}
                    </span>

                    <span className={`${styles.badge} ${styles.audienceTag}`}>
                      {classTargetDisplay}
                    </span>
                  </div>

                  {isTeacherOrAdmin && (
                    <button
                      className="btn btn-ghost"
                      style={{ color: '#ef4444', padding: '6px 10px', fontSize: '0.8125rem' }}
                      onClick={() => handleDeleteAnnouncement(ann.id)}
                      title="حذف اطلاعیه"
                    >
                      <HiOutlineTrash style={{ fontSize: '1.1rem' }} />
                      حذف
                    </button>
                  )}
                </div>

                <h3 className={styles.noticeTitle}>{ann.title}</h3>

                <div className={styles.noticeContent}>
                  {ann.content}
                </div>

                <div className={styles.cardFooter}>
                  <div className={styles.metaAuthor}>
                    <div
                      className={styles.authorAvatar}
                      style={isFromManagement ? { background: 'linear-gradient(135deg, #d97706, #b45309)', color: '#fff', fontSize: '1.1rem' } : {}}
                    >
                      {isFromManagement ? '🏛️' : (ann.teacher_name?.charAt(0) || 'م')}
                    </div>
                    <div>
                      <span style={{ fontWeight: 700, color: 'var(--text-primary)', display: 'block' }}>
                        {ann.teacher_name || 'مدیریت مدرسه'}
                        {isFromManagement && (
                          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#d97706', marginRight: '6px' }}>
                            ({ann.teacher_job_title || 'مدیریت مجتمع آموزشی'})
                          </span>
                        )}
                      </span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                        <HiOutlineClock style={{ verticalAlign: 'middle', marginLeft: '3px' }} />
                        {new Date(ann.created_at).toLocaleDateString('fa-IR')} - {new Date(ann.created_at).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>

                  {/* Actions & Stats */}
                  <div className={styles.cardActions}>
                    {isTeacherOrAdmin ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          style={{ fontSize: '0.8125rem', display: 'flex', alignItems: 'center', gap: '6px' }}
                          onClick={() => openStatsModal(ann)}
                        >
                          <HiOutlineEye />
                          مشاهده تاییدها ({ann.acknowledged_count || 0} نفر)
                        </button>
                      </div>
                    ) : (
                      <div>
                        {ann.is_acknowledged ? (
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '6px',
                              padding: '6px 14px',
                              borderRadius: '20px',
                              background: 'rgba(16, 185, 129, 0.15)',
                              color: '#10b981',
                              fontWeight: 700,
                              fontSize: '0.8125rem',
                              border: '1px solid rgba(16, 185, 129, 0.3)',
                            }}
                          >
                            <HiOutlineCheckCircle style={{ fontSize: '1.1rem' }} />
                            توسط شما تایید و خوانده شده
                          </span>
                        ) : (
                          <button
                            className="btn btn-primary"
                            style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8125rem', background: '#10b981' }}
                            onClick={() => handleAcknowledge(ann.id)}
                          >
                            <HiOutlineCheck style={{ fontSize: '1.1rem' }} />
                            تایید مطالعه این اطلاعیه
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal 1: Create Announcement */}
      {showCreateModal && (
        <div className={styles.modalBackdrop} onClick={() => setShowCreateModal(false)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '1.3rem', color: '#6366f1' }}>📢</span>
                <h2 style={{ fontSize: '1.2rem', fontWeight: 800 }}>صدور و ارسال اطلاعیه جدید</h2>
              </div>
              <button className={styles.closeBtn} onClick={() => setShowCreateModal(false)}>
                <HiOutlineXMark />
              </button>
            </div>

            <form onSubmit={handleCreateAnnouncement} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
              {/* Title */}
              <div className="form-group">
                <label style={{ fontSize: '0.875rem', fontWeight: 700, marginBottom: '6px', display: 'block' }}>
                  عنوان اطلاعیه *
                </label>
                <input
                  type="text"
                  className="input"
                  placeholder="مثلاً: برگزاری جلسه فوری اولیا و مربیان یا تغییر ساعت آزمون"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  required
                />
              </div>

              {/* Priority Selection */}
              <div>
                <label style={{ fontSize: '0.875rem', fontWeight: 700, marginBottom: '8px', display: 'block' }}>
                  سطح اهمیت و فوریت:
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                  <div
                    className={`${styles.priorityRadio} ${form.priority === 'urgent' ? styles.audienceSelected : ''}`}
                    onClick={() => setForm({ ...form, priority: 'urgent' })}
                  >
                    <span>🔴</span>
                    <div>
                      <div style={{ fontWeight: 700 }}>فوری و اضطراری</div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>اعلان با نشان قرمز</div>
                    </div>
                  </div>

                  <div
                    className={`${styles.priorityRadio} ${form.priority === 'important' ? styles.audienceSelected : ''}`}
                    onClick={() => setForm({ ...form, priority: 'important' })}
                  >
                    <span>🟡</span>
                    <div>
                      <div style={{ fontWeight: 700 }}>مهم</div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>اعلان کهربایی استاندارد</div>
                    </div>
                  </div>

                  <div
                    className={`${styles.priorityRadio} ${form.priority === 'normal' ? styles.audienceSelected : ''}`}
                    onClick={() => setForm({ ...form, priority: 'normal' })}
                  >
                    <span>🔵</span>
                    <div>
                      <div style={{ fontWeight: 700 }}>عادی</div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>اطلاع‌رسانی عمومی</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Target Audience */}
              <div>
                <label style={{ fontSize: '0.875rem', fontWeight: 700, marginBottom: '8px', display: 'block' }}>
                  مخاطبان هدف (چه کسانی دریافت کنند؟):
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                  <div
                    className={`${styles.audienceOptionCard} ${form.target_audience === 'all' ? styles.audienceSelected : ''}`}
                    onClick={() => setForm({ ...form, target_audience: 'all' })}
                  >
                    <HiOutlineUsers style={{ fontSize: '1.5rem' }} />
                    <span>دانش‌آموزان و اولیا</span>
                    <span style={{ fontSize: '0.6875rem', color: 'var(--text-tertiary)' }}>ارسال به هر دو گروه</span>
                  </div>

                  <div
                    className={`${styles.audienceOptionCard} ${form.target_audience === 'students' ? styles.audienceSelected : ''}`}
                    onClick={() => setForm({ ...form, target_audience: 'students' })}
                  >
                    <HiOutlineAcademicCap style={{ fontSize: '1.5rem' }} />
                    <span>فقط دانش‌آموزان</span>
                    <span style={{ fontSize: '0.6875rem', color: 'var(--text-tertiary)' }}>نمایش فقط در پنل دانش‌آموز</span>
                  </div>

                  <div
                    className={`${styles.audienceOptionCard} ${form.target_audience === 'parents' ? styles.audienceSelected : ''}`}
                    onClick={() => setForm({ ...form, target_audience: 'parents' })}
                  >
                    <HiOutlineUserGroup style={{ fontSize: '1.5rem' }} />
                    <span>فقط اولیا و خانواده‌ها</span>
                    <span style={{ fontSize: '0.6875rem', color: 'var(--text-tertiary)' }}>نمایش فقط در پنل اولیا</span>
                  </div>
                </div>
              </div>

              {/* Target Grades (پایه‌های تحصیلی) */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <label style={{ fontSize: '0.875rem', fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>🎓</span>
                    <span>پایه‌های تحصیلی هدف (کدام پایه‌ها دریافت کنند؟): *</span>
                  </label>
                  <span style={{ fontSize: '0.75rem', color: form.target_grades.includes('*') ? '#6366f1' : '#10b981', fontWeight: 700 }}>
                    {form.target_grades.includes('*') ? '🌟 ارسال به تمام پایه‌ها (سراسری)' : `✅ ${form.target_grades.length} پایه انتخاب شده`}
                  </span>
                </div>

                <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '8px', marginTop: 0 }}>
                  روی هر پایه که می‌خواهید کلیک کنید تا فعال شود (امکان انتخاب همزمان چند پایه وجود دارد):
                </p>

                {/* Quick Shortcuts for Teacher */}
                {myTaughtGrades.length > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', fontWeight: 700 }}>انتخاب سریع:</span>
                    <button
                      type="button"
                      onClick={() => selectOnlyTeacherGrades(myTaughtGrades)}
                      className="btn btn-secondary btn-sm"
                      style={{
                        fontSize: '0.75rem',
                        padding: '4px 10px',
                        borderRadius: '12px',
                        background: 'rgba(99, 102, 241, 0.1)',
                        color: '#6366f1',
                        border: '1px solid rgba(99, 102, 241, 0.3)',
                        fontWeight: 700,
                      }}
                    >
                      👨‍🏫 فقط پایه‌های تدریس من ({myTaughtGrades.length} پایه)
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleGradeSelect('*')}
                      className="btn btn-secondary btn-sm"
                      style={{
                        fontSize: '0.75rem',
                        padding: '4px 10px',
                        borderRadius: '12px',
                      }}
                    >
                      🌟 تمام پایه‌های مدرسه
                    </button>
                  </div>
                )}

                {/* Grade Selection Chips */}
                <div style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '8px',
                  maxHeight: '160px',
                  overflowY: 'auto',
                  padding: '8px',
                  background: 'var(--bg-hover)',
                  borderRadius: '12px',
                  border: '1px solid var(--border-color)',
                }}>
                  <button
                    type="button"
                    className={`btn ${form.target_grades.includes('*') ? 'btn-primary' : 'btn-secondary'}`}
                    style={{
                      fontSize: '0.8125rem',
                      padding: '6px 14px',
                      borderRadius: '20px',
                      fontWeight: form.target_grades.includes('*') ? 800 : 600,
                    }}
                    onClick={() => toggleGradeSelect('*')}
                  >
                    🌟 تمام پایه‌ها (سراسری)
                  </button>

                  {targetingOptions.grades?.map((g) => {
                    const isSelected = !form.target_grades.includes('*') && form.target_grades.includes(g);
                    const isMyGrade = myTaughtGrades.includes(g);
                    return (
                      <button
                        key={g}
                        type="button"
                        className={`btn ${isSelected ? 'btn-primary' : 'btn-secondary'}`}
                        style={{
                          fontSize: '0.8125rem',
                          padding: '6px 14px',
                          borderRadius: '20px',
                          fontWeight: isSelected ? 800 : (isMyGrade ? 700 : 500),
                          borderColor: isSelected ? '#10b981' : (isMyGrade ? '#6366f1' : undefined),
                          background: isSelected ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)' : (isMyGrade ? 'rgba(99, 102, 241, 0.08)' : undefined),
                          color: isSelected ? '#ffffff' : (isMyGrade ? '#4f46e5' : undefined),
                        }}
                        onClick={() => toggleGradeSelect(g)}
                        title={isMyGrade ? 'از پایه‌های تدریس شما' : ''}
                      >
                        {isSelected ? '✓ ' : ''}{g} {isMyGrade && !isSelected ? '⭐' : ''}
                      </button>
                    );
                  })}
                </div>

                {/* Add Custom Grade Input */}
                <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                  <input
                    type="text"
                    className="input"
                    placeholder="افزودن پایه یا کلاس دیگر (مثلاً: دهم ریاضی ۲ یا نهم ب)..."
                    value={customGradeInput}
                    onChange={(e) => setCustomGradeInput(e.target.value)}
                    style={{ flex: 1, fontSize: '0.78rem', padding: '6px 10px' }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddCustomGrade();
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={handleAddCustomGrade}
                    style={{ fontSize: '0.75rem', padding: '6px 12px', whiteSpace: 'nowrap', fontWeight: 700 }}
                  >
                    <HiOutlinePlus style={{ verticalAlign: 'middle', marginLeft: '4px' }} />
                    افزودن و انتخاب
                  </button>
                </div>
              </div>

              {/* Target Subjects (درس‌های هدف) */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <label style={{ fontSize: '0.875rem', fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>📖</span>
                    <span>درس‌های هدف:</span>
                  </label>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                    {form.target_subjects.includes('*') ? 'ارسال به تمام درس‌ها' : `${form.target_subjects.length} درس انتخاب شده`}
                  </span>
                </div>
                <div style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '8px',
                  maxHeight: '140px',
                  overflowY: 'auto',
                  padding: '8px',
                  background: 'var(--bg-hover)',
                  borderRadius: '12px',
                  border: '1px solid var(--border-color)',
                }}>
                  <button
                    type="button"
                    className={`btn ${form.target_subjects.includes('*') ? 'btn-primary' : 'btn-secondary'}`}
                    style={{ fontSize: '0.8125rem', padding: '6px 14px', borderRadius: '20px' }}
                    onClick={() => toggleSubjectSelect('*')}
                  >
                    📚 تمام درس‌ها
                  </button>

                  {targetingOptions.subjects?.map((s) => {
                    const isSelected = !form.target_subjects.includes('*') && form.target_subjects.includes(s);
                    return (
                      <button
                        key={s}
                        type="button"
                        className={`btn ${isSelected ? 'btn-primary' : 'btn-secondary'}`}
                        style={{
                          fontSize: '0.8125rem',
                          padding: '6px 14px',
                          borderRadius: '20px',
                          fontWeight: isSelected ? 800 : 500,
                          borderColor: isSelected ? '#10b981' : undefined,
                          background: isSelected ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)' : undefined,
                        }}
                        onClick={() => toggleSubjectSelect(s)}
                      >
                        {isSelected ? '✓ ' : ''}{s}
                      </button>
                    );
                  })}
                </div>

                {/* Add Custom Subject Input */}
                <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                  <input
                    type="text"
                    className="input"
                    placeholder="افزودن درس دلخواه دیگر (مثلاً: زیست المپیاد یا آزمایشگاه علوم)..."
                    value={customSubjectInput}
                    onChange={(e) => setCustomSubjectInput(e.target.value)}
                    style={{ flex: 1, fontSize: '0.78rem', padding: '6px 10px' }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddCustomSubject();
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={handleAddCustomSubject}
                    style={{ fontSize: '0.75rem', padding: '6px 12px', whiteSpace: 'nowrap', fontWeight: 700 }}
                  >
                    <HiOutlinePlus style={{ verticalAlign: 'middle', marginLeft: '4px' }} />
                    افزودن و انتخاب
                  </button>
                </div>
              </div>

              {/* Target Classes (کلاس‌های خاص - اختیاری) */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <label style={{ fontSize: '0.875rem', fontWeight: 700, margin: 0 }}>
                    🏫 کلاس‌های دریافت‌کننده (اختیاری جهت تفکیک کلاسی):
                  </label>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                    {form.target_class_ids.includes('*') ? 'تمام کلاس‌ها' : `${form.target_class_ids.length} کلاس انتخاب شده`}
                  </span>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', maxHeight: '120px', overflowY: 'auto', padding: '2px' }}>
                  <button
                    type="button"
                    className={`btn ${form.target_class_ids.includes('*') ? 'btn-primary' : 'btn-secondary'}`}
                    style={{ fontSize: '0.8125rem', padding: '6px 14px', borderRadius: '20px' }}
                    onClick={() => toggleClassSelect('*')}
                  >
                    🏫 تمام کلاس‌های مدرسه
                  </button>

                  {targetingOptions.classes?.map((c) => {
                    const isSelected = !form.target_class_ids.includes('*') && form.target_class_ids.includes(c.id);
                    return (
                      <button
                        key={c.id}
                        type="button"
                        className={`btn ${isSelected ? 'btn-primary' : 'btn-secondary'}`}
                        style={{ fontSize: '0.8125rem', padding: '6px 14px', borderRadius: '20px' }}
                        onClick={() => toggleClassSelect(c.id)}
                      >
                        {c.name} {c.grade ? `(${c.grade})` : ''}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Content Body */}
              <div className="form-group">
                <label style={{ fontSize: '0.875rem', fontWeight: 700, marginBottom: '6px', display: 'block' }}>
                  متن پیام اطلاعیه *
                </label>
                <textarea
                  className="input"
                  rows={4}
                  placeholder="متن کامل پیام یا دستورالعمل را در این قسمت یادداشت نمایید..."
                  value={form.content}
                  onChange={(e) => setForm({ ...form, content: e.target.value })}
                  required
                  style={{ resize: 'vertical', lineHeight: 1.7 }}
                />
              </div>

              {/* Mandatory Modal Checkbox */}
              <div
                style={{
                  background: 'rgba(239, 68, 68, 0.08)',
                  border: '1px solid rgba(239, 68, 68, 0.25)',
                  borderRadius: '12px',
                  padding: '14px',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '12px',
                  cursor: 'pointer',
                }}
                onClick={() => setForm({ ...form, is_mandatory: !form.is_mandatory })}
              >
                <input
                  type="checkbox"
                  checked={form.is_mandatory}
                  onChange={(e) => setForm({ ...form, is_mandatory: e.target.checked })}
                  style={{ width: '18px', height: '18px', marginTop: '2px', accentColor: '#ef4444', cursor: 'pointer' }}
                />
                <div>
                  <div style={{ fontWeight: 800, fontSize: '0.9rem', color: '#ef4444' }}>
                    🚨 الزام به پاپ‌آپ تمام‌صفحه و تایید قبل از ورود به پنل
                  </div>
                  <div style={{ fontSize: '0.78125rem', color: 'var(--text-secondary)', marginTop: '4px', lineHeight: 1.5 }}>
                    به محض ورود دانش‌آموز یا ولی به سامانه، این پیام روی کل صفحه‌شان ظاهر می‌شود و تا دکمه «تایید و خواندم» را نزنند امکان دسترسی به بخش‌های دیگر پنل را نخواهند داشت.
                  </div>
                </div>
              </div>

              {/* Form Buttons */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowCreateModal(false)}
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={submitting}
                  style={{ minWidth: '150px' }}
                >
                  {submitting ? 'در حال ارسال...' : 'انتشار و ارسال سراسری'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 2: View Acknowledgements Stats */}
      {showStatsModal && selectedStatsAnnouncement && (
        <div className={styles.modalBackdrop} onClick={() => setShowStatsModal(false)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div>
                <h2 style={{ fontSize: '1.15rem', fontWeight: 800 }}>
                  لیست افراد تاییدکننده اطلاعیه
                </h2>
                <span style={{ fontSize: '0.8125rem', color: 'var(--text-tertiary)' }}>
                  «{selectedStatsAnnouncement.title}»
                </span>
              </div>
              <button className={styles.closeBtn} onClick={() => setShowStatsModal(false)}>
                <HiOutlineXMark />
              </button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: 'var(--bg-subtle)', borderRadius: '12px' }}>
              <span style={{ fontSize: '0.875rem', fontWeight: 700 }}>
                تعداد کل تاییدیه‌های ثبت‌شده:
              </span>
              <span style={{ fontSize: '1.2rem', fontWeight: 800, color: '#10b981' }}>
                {selectedStatsAnnouncement.statsData?.total_acknowledged || 0} نفر
              </span>
            </div>

            <div style={{ maxHeight: '350px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {selectedStatsAnnouncement.statsData?.acknowledgements?.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text-tertiary)' }}>
                  هنوز هیچ کاربری این اطلاعیه را تایید نکرده است.
                </div>
              ) : (
                selectedStatsAnnouncement.statsData?.acknowledgements?.map((ack) => (
                  <div
                    key={ack.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '12px 14px',
                      background: 'var(--bg-card)',
                      border: '1px solid var(--border-color)',
                      borderRadius: '10px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div
                        style={{
                          width: '36px',
                          height: '36px',
                          borderRadius: '50%',
                          background: ack.user_role === 'parent' ? '#f59e0b' : '#6366f1',
                          color: '#fff',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 700,
                        }}
                      >
                        {ack.user_name?.charAt(0) || 'ک'}
                      </div>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '0.875rem' }}>{ack.user_name}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                          نقش: {ack.user_role === 'parent' ? '👨‍👩‍👧 اولیا' : '🎓 دانش‌آموز'}
                          {ack.student_code ? ` | کد: ${ack.student_code}` : ''}
                          {ack.phone ? ` | شماره: ${ack.phone}` : ''}
                        </div>
                      </div>
                    </div>

                    <div style={{ textAlign: 'left', fontSize: '0.75rem', color: '#10b981', fontWeight: 600 }}>
                      <HiOutlineCheckCircle style={{ verticalAlign: 'middle', marginLeft: '3px' }} />
                      {new Date(ack.acknowledged_at).toLocaleDateString('fa-IR')} - {new Date(ack.acknowledged_at).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                ))
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '12px' }}>
              <button className="btn btn-secondary" onClick={() => setShowStatsModal(false)}>
                بستن
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
