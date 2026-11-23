'use client';
import { useState, useEffect, useCallback } from 'react';
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
} from 'react-icons/hi2';
import styles from './announcements.module.css';

const INITIAL_FORM = {
  title: '',
  content: '',
  priority: 'important', // normal | important | urgent
  target_audience: 'all', // students | parents | all
  target_class_ids: ['*'], // ['*'] or array of teacher's DB class UUIDs
  is_mandatory: false,
};

export default function AnnouncementsPage() {
  const { user } = useAuthStore();
  const [announcements, setAnnouncements] = useState([]);
  const [teacherClasses, setTeacherClasses] = useState([]);
  const [loadingClasses, setLoadingClasses] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('all');

  // Modals state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [selectedStatsAnnouncement, setSelectedStatsAnnouncement] = useState(null);
  const [showStatsModal, setShowStatsModal] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  const [form, setForm] = useState(INITIAL_FORM);

  const isTeacherOrAdmin =
    user?.role === 'teacher' || user?.role === 'admin' || user?.role === 'manager';
  const isAdmin = user?.role === 'admin' || user?.role === 'manager';

  const fetchAnnouncements = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get('/announcements');
      if (res.data?.success && Array.isArray(res.data.data?.announcements)) {
        setAnnouncements(res.data.data.announcements);
      } else {
        setAnnouncements([]);
      }
    } catch (err) {
      console.error('Error fetching announcements:', err);
      toast.error('خطا در دریافت لیست اطلاعیه‌ها');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchTargetingClasses = useCallback(async () => {
    if (!isTeacherOrAdmin) return;
    try {
      setLoadingClasses(true);
      const res = await api.get('/announcements/targeting-options');
      if (res.data?.success && Array.isArray(res.data.data?.classes)) {
        setTeacherClasses(res.data.data.classes);
      } else {
        setTeacherClasses([]);
      }
    } catch (err) {
      console.error('Error fetching teacher classes for announcements:', err);
      setTeacherClasses([]);
    } finally {
      setLoadingClasses(false);
    }
  }, [isTeacherOrAdmin]);

  useEffect(() => {
    if (!user) return;
    fetchAnnouncements();
    if (isTeacherOrAdmin) {
      fetchTargetingClasses();
    }
  }, [user, isTeacherOrAdmin, fetchAnnouncements, fetchTargetingClasses]);

  const handleOpenCreateModal = () => {
    setForm(INITIAL_FORM);
    setShowCreateModal(true);
    fetchTargetingClasses();
  };

  // Toggle class selection from teacher's DB classes
  const toggleClassSelect = (classId) => {
    if (classId === '*') {
      setForm((prev) => ({ ...prev, target_class_ids: ['*'] }));
      return;
    }

    setForm((prev) => {
      let current = prev.target_class_ids.includes('*') ? [] : [...prev.target_class_ids];
      if (current.includes(classId)) {
        current = current.filter((id) => id !== classId);
        if (current.length === 0) current = ['*'];
      } else {
        current.push(classId);
      }
      return { ...prev, target_class_ids: current };
    });
  };

  const handleCreateAnnouncement = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    const cleanTitle = form.title.trim();
    const cleanContent = form.content.trim();

    if (!cleanTitle) {
      return toast.error('لطفاً عنوان اطلاعیه را وارد کنید');
    }
    if (!cleanContent) {
      return toast.error('لطفاً متن پیام اطلاعیه را بنویسید');
    }

    if (!isAdmin && teacherClasses.length === 0) {
      return toast.error('شما هنوز کلاسی در دیتابیس ثبت نکرده‌اید');
    }

    setSubmitting(true);
    try {
      const payload = {
        title: cleanTitle,
        content: cleanContent,
        priority: form.priority,
        target_audience: form.target_audience,
        target_class_ids: form.target_class_ids,
        is_mandatory: form.is_mandatory,
      };

      const res = await api.post('/announcements', payload);
      if (res.data?.success) {
        toast.success('اطلاعیه با موفقیت منتشر شد و در پنل مخاطبان انتخابی نمایش داده می‌شود', {
          duration: 4000,
        });
        setShowCreateModal(false);
        setForm(INITIAL_FORM);
        await fetchAnnouncements();
      } else {
        toast.error(res.data?.message || 'خطا در انتشار اطلاعیه');
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'خطا در برقراری ارتباط جهت انتشار اطلاعیه');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAcknowledge = async (id) => {
    try {
      const res = await api.post(`/announcements/${id}/acknowledge`);
      if (res.data?.success) {
        toast.success('مطالعه اطلاعیه با موفقیت تایید شد');
        fetchAnnouncements();
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'خطا در تایید مطالعه اطلاعیه');
    }
  };

  const handleDeleteAnnouncement = async (id) => {
    if (confirmDeleteId !== id) {
      setConfirmDeleteId(id);
      return;
    }

    try {
      const res = await api.delete(`/announcements/${id}`);
      if (res.data?.success) {
        toast.success('اطلاعیه حذف گردید');
        setAnnouncements((prev) => prev.filter((a) => a.id !== id));
      } else {
        toast.error(res.data?.message || 'خطا در حذف اطلاعیه');
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'خطا در حذف اطلاعیه');
    } finally {
      setConfirmDeleteId(null);
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
      toast.error('خطا در دریافت آمار تاییدها');
    }
  };

  const isMgmtAnn = (a) =>
    a.is_management || a.teacher_role === 'admin' || a.teacher_role === 'manager';

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
            اطلاع‌رسانی و بخشنامه‌های مدرسه
          </h1>
          <p className={styles.headerSubtitle}>
            انتشار هدفمند اطلاعیه‌ها بر اساس کلاس‌های ثبت‌شده، سطح اهمیت و گروه مخاطبان (دانش‌آموزان و اولیا) با نمایش فوری در داشبورد و بخش اطلاع‌رسانی
          </p>
        </div>

        {isTeacherOrAdmin && (
          <button
            type="button"
            className="btn btn-primary"
            style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 20px' }}
            onClick={handleOpenCreateModal}
            data-testid="open-create-announcement-btn"
          >
            <HiOutlinePlusCircle style={{ fontSize: '1.25rem' }} />
            <span>صدور اطلاعیه جدید</span>
          </button>
        )}
      </div>

      {/* Stats Summary Cards */}
      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <div className={styles.statIcon} style={{ background: 'rgba(99, 102, 241, 0.12)', color: '#6366f1' }}>
            <HiOutlineMegaphone />
          </div>
          <div className={styles.statInfo}>
            <span className={styles.statLabel}>کل اطلاعیه‌ها</span>
            <span className={styles.statValue}>{announcements.length}</span>
          </div>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statIcon} style={{ background: 'rgba(239, 68, 68, 0.12)', color: '#ef4444' }}>
            <HiOutlineExclamationTriangle />
          </div>
          <div className={styles.statInfo}>
            <span className={styles.statLabel}>اطلاعیه‌های فوری</span>
            <span className={styles.statValue}>{totalUrgent}</span>
          </div>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statIcon} style={{ background: 'rgba(244, 63, 94, 0.12)', color: '#f43f5e' }}>
            <HiOutlineShieldCheck />
          </div>
          <div className={styles.statInfo}>
            <span className={styles.statLabel}>الزام به تایید مطالعه</span>
            <span className={styles.statValue}>{totalMandatory}</span>
          </div>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statIcon} style={{ background: 'rgba(16, 185, 129, 0.12)', color: '#10b981' }}>
            <HiOutlineCheckCircle />
          </div>
          <div className={styles.statInfo}>
            <span className={styles.statLabel}>
              {isTeacherOrAdmin ? 'کلاس‌های قابل ارسال' : 'تاییدشده توسط شما'}
            </span>
            <span className={styles.statValue}>
              {isTeacherOrAdmin
                ? teacherClasses.length
                : announcements.filter((a) => a.is_acknowledged).length}
            </span>
          </div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className={styles.tabsRow}>
        <div className={styles.filterTabs}>
          <button
            type="button"
            className={`${styles.tabBtn} ${activeTab === 'all' ? styles.activeTab : ''}`}
            onClick={() => setActiveTab('all')}
          >
            همه ({announcements.length})
          </button>
          <button
            type="button"
            className={`${styles.tabBtn} ${activeTab === 'management' ? styles.activeTab : ''}`}
            onClick={() => setActiveTab('management')}
          >
            بخشنامه‌های مدیریت ({totalManagement})
          </button>
          <button
            type="button"
            className={`${styles.tabBtn} ${activeTab === 'urgent' ? styles.activeTab : ''}`}
            onClick={() => setActiveTab('urgent')}
          >
            فوری ({totalUrgent})
          </button>
          <button
            type="button"
            className={`${styles.tabBtn} ${activeTab === 'students' ? styles.activeTab : ''}`}
            onClick={() => setActiveTab('students')}
          >
            دانش‌آموزان
          </button>
          <button
            type="button"
            className={`${styles.tabBtn} ${activeTab === 'parents' ? styles.activeTab : ''}`}
            onClick={() => setActiveTab('parents')}
          >
            اولیاء
          </button>
          {!isTeacherOrAdmin && (
            <button
              type="button"
              className={`${styles.tabBtn} ${activeTab === 'unacknowledged' ? styles.activeTab : ''}`}
              onClick={() => setActiveTab('unacknowledged')}
            >
              خوانده‌نشده
            </button>
          )}
        </div>
      </div>

      {/* Announcements List */}
      {loading ? (
        <div className={styles.emptyState}>
          <div className="spinner" />
          <p>در حال بارگذاری اطلاعیه‌ها...</p>
        </div>
      ) : filteredList.length === 0 ? (
        <div className={styles.emptyState} data-testid="announcements-empty-state">
          <HiOutlineMegaphone style={{ fontSize: '3rem', opacity: 0.4 }} />
          <h3>هیچ اطلاعیه‌ای در این بخش یافت نشد</h3>
          <p>در صورت انتشار اطلاعیه جدید برای کلاس‌های شما، بلافاصله در این بخش و داشبورد نمایش داده خواهد شد.</p>
        </div>
      ) : (
        <div className={styles.cardsGrid} data-testid="announcements-list">
          {filteredList.map((ann) => {
            const priorityBadgeClass =
              {
                urgent: styles.badgeUrgent,
                important: styles.badgeImportant,
                normal: styles.badgeNormal,
              }[ann.priority] || styles.badgeImportant;

            const priorityText =
              {
                urgent: 'فوری',
                important: 'مهم',
                normal: 'عادی',
              }[ann.priority] || 'مهم';

            const audienceText =
              {
                all: 'دانش‌آموز و اولیاء',
                students: 'فقط دانش‌آموزان',
                parents: 'فقط اولیاء',
              }[ann.target_audience] || 'دانش‌آموز و اولیاء';

            const classNames = Array.isArray(ann.target_class_names)
              ? ann.target_class_names
              : [];
            const classTargetDisplay =
              classNames.length > 0
                ? `کلاس‌ها: ${classNames.join('، ')}`
                : ann.target_class_ids?.includes('*') || !ann.target_class_ids?.length
                  ? 'همه کلاس‌ها'
                  : `${ann.target_class_ids.length} کلاس انتخابی`;

            const isFromManagement = isMgmtAnn(ann);
            const canDelete = isAdmin || ann.teacher_id === user?.id;

            return (
              <div
                key={ann.id}
                className={`${styles.noticeCard} ${isFromManagement ? styles.noticeCardManagement : ''}`}
                data-testid={`announcement-card-${ann.id}`}
              >
                <div className={styles.cardTopRow}>
                  <div className={styles.tagsCluster}>
                    {isFromManagement && (
                      <span className={`${styles.badge} ${styles.managementTag}`}>
                        بخشنامه مدیریت مدرسه
                      </span>
                    )}

                    <span className={`${styles.badge} ${priorityBadgeClass}`}>
                      {priorityText}
                    </span>

                    {ann.is_mandatory && (
                      <span className={`${styles.badge} ${styles.mandatoryTag}`}>
                        <HiOutlineExclamationTriangle /> الزام تایید مطالعه
                      </span>
                    )}

                    <span className={`${styles.badge} ${styles.audienceTag}`}>
                      مخاطب: {audienceText}
                    </span>

                    <span className={`${styles.badge} ${styles.audienceTag}`}>
                      {classTargetDisplay}
                    </span>
                  </div>

                  {canDelete && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      {confirmDeleteId === ann.id ? (
                        <>
                          <button
                            type="button"
                            className="btn btn-sm"
                            style={{ background: '#dc2626', color: '#fff', fontSize: '0.75rem', padding: '5px 10px' }}
                            onClick={() => handleDeleteAnnouncement(ann.id)}
                          >
                            تایید حذف
                          </button>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            style={{ fontSize: '0.75rem', padding: '5px 10px' }}
                            onClick={() => setConfirmDeleteId(null)}
                          >
                            انصراف
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          className="btn btn-ghost"
                          style={{ color: '#ef4444', padding: '6px 10px', fontSize: '0.8125rem' }}
                          onClick={() => handleDeleteAnnouncement(ann.id)}
                          title="حذف اطلاعیه"
                        >
                          <HiOutlineTrash style={{ fontSize: '1.1rem' }} />
                          <span>حذف</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>

                <h3 className={styles.noticeTitle}>{ann.title}</h3>

                <div className={styles.noticeContent}>{ann.content}</div>

                <div className={styles.cardFooter}>
                  <div className={styles.metaAuthor}>
                    <div
                      className={styles.authorAvatar}
                      style={
                        isFromManagement
                          ? { background: '#d97706', color: '#fff', fontWeight: 800 }
                          : {}
                      }
                    >
                      {ann.teacher_name?.charAt(0) || 'م'}
                    </div>
                    <div>
                      <span style={{ fontWeight: 700, color: 'var(--text-primary)', display: 'block' }}>
                        {ann.teacher_name || 'کادر آموزشی مدرسه'}
                      </span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                        <HiOutlineClock style={{ verticalAlign: 'middle', marginLeft: '3px' }} />
                        {new Date(ann.created_at).toLocaleDateString('fa-IR')} -{' '}
                        {new Date(ann.created_at).toLocaleTimeString('fa-IR', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                  </div>

                  <div className={styles.cardActions}>
                    {isTeacherOrAdmin ? (
                      <button
                        type="button"
                        className="btn btn-secondary"
                        style={{ fontSize: '0.8125rem', display: 'flex', alignItems: 'center', gap: '6px' }}
                        onClick={() => openStatsModal(ann)}
                      >
                        <HiOutlineEye />
                        <span>مشاهده تاییدها ({ann.acknowledged_count || 0} نفر)</span>
                      </button>
                    ) : ann.is_acknowledged ? (
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '6px 12px',
                          borderRadius: '8px',
                          background: 'rgba(16, 185, 129, 0.12)',
                          color: '#059669',
                          fontWeight: 700,
                          fontSize: '0.8125rem',
                          border: '1px solid rgba(16, 185, 129, 0.25)',
                        }}
                      >
                        <HiOutlineCheckCircle style={{ fontSize: '1.1rem' }} />
                        <span>مطالعه و تایید شد</span>
                      </span>
                    ) : (
                      <button
                        type="button"
                        className="btn btn-primary"
                        style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8125rem', background: '#059669', borderColor: '#059669' }}
                        onClick={() => handleAcknowledge(ann.id)}
                      >
                        <HiOutlineCheck style={{ fontSize: '1.1rem' }} />
                        <span>تایید مطالعه اطلاعیه</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal 1: Create Announcement (Clean, DB-Class-Targeted) */}
      {showCreateModal && (
        <div
          className={styles.modalBackdrop}
          onClick={() => setShowCreateModal(false)}
          data-testid="create-announcement-modal"
        >
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <HiOutlineMegaphone style={{ fontSize: '1.35rem', color: '#4f46e5' }} />
                <h2 style={{ fontSize: '1.15rem', fontWeight: 800, margin: 0 }}>
                  صدور اطلاعیه جدید
                </h2>
              </div>
              <button
                type="button"
                className={styles.closeBtn}
                onClick={() => setShowCreateModal(false)}
                aria-label="بستن"
              >
                <HiOutlineXMark />
              </button>
            </div>

            <form
              onSubmit={handleCreateAnnouncement}
              noValidate
              style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}
            >
              {/* 1. Title */}
              <div className="form-group">
                <label
                  htmlFor="ann_title_input"
                  style={{ fontSize: '0.875rem', fontWeight: 700, marginBottom: '6px', display: 'block' }}
                >
                  عنوان اطلاعیه *
                </label>
                <input
                  id="ann_title_input"
                  data-testid="ann-title-input"
                  type="text"
                  className="input"
                  placeholder="مثلاً: زمان‌بندی آزمون میان‌ترم یا جلسه هماهنگی کلاس"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  required
                  autoFocus
                />
              </div>

              {/* 2. Priority Level */}
              <div>
                <label style={{ fontSize: '0.875rem', fontWeight: 700, marginBottom: '8px', display: 'block' }}>
                  سطح اهمیت:
                </label>
                <div className={styles.priorityGrid}>
                  <button
                    type="button"
                    data-testid="ann-priority-normal"
                    className={`${styles.priorityRadio} ${form.priority === 'normal' ? styles.audienceSelected : ''}`}
                    onClick={() => setForm({ ...form, priority: 'normal' })}
                    style={{ textAlign: 'right' }}
                  >
                    <div>
                      <div style={{ fontWeight: 700 }}>عادی</div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)' }}>اطلاع‌رسانی عمومی</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    data-testid="ann-priority-important"
                    className={`${styles.priorityRadio} ${form.priority === 'important' ? styles.audienceSelected : ''}`}
                    onClick={() => setForm({ ...form, priority: 'important' })}
                    style={{ textAlign: 'right' }}
                  >
                    <div>
                      <div style={{ fontWeight: 700 }}>مهم</div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)' }}>نمایش برجسته در پنل</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    data-testid="ann-priority-urgent"
                    className={`${styles.priorityRadio} ${form.priority === 'urgent' ? styles.audienceSelected : ''}`}
                    onClick={() => setForm({ ...form, priority: 'urgent' })}
                    style={{ textAlign: 'right' }}
                  >
                    <div>
                      <div style={{ fontWeight: 700, color: '#dc2626' }}>فوری</div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)' }}>اعلان فوری و اولویت بالا</div>
                    </div>
                  </button>
                </div>
              </div>

              {/* 3. Target Audience Group */}
              <div>
                <label style={{ fontSize: '0.875rem', fontWeight: 700, marginBottom: '8px', display: 'block' }}>
                  گروه مخاطبان (به چه کسانی نمایش داده شود؟):
                </label>
                <div className={styles.audienceGrid}>
                  <button
                    type="button"
                    data-testid="ann-audience-students"
                    className={`${styles.audienceOptionCard} ${form.target_audience === 'students' ? styles.audienceSelected : ''}`}
                    onClick={() => setForm({ ...form, target_audience: 'students' })}
                  >
                    <HiOutlineAcademicCap style={{ fontSize: '1.45rem' }} />
                    <span>دانش‌آموز</span>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>
                      نمایش فقط برای دانش‌آموزان کلاس
                    </span>
                  </button>

                  <button
                    type="button"
                    data-testid="ann-audience-parents"
                    className={`${styles.audienceOptionCard} ${form.target_audience === 'parents' ? styles.audienceSelected : ''}`}
                    onClick={() => setForm({ ...form, target_audience: 'parents' })}
                  >
                    <HiOutlineUserGroup style={{ fontSize: '1.45rem' }} />
                    <span>اولیاء</span>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>
                      نمایش فقط در پنل اولیاء
                    </span>
                  </button>

                  <button
                    type="button"
                    data-testid="ann-audience-all"
                    className={`${styles.audienceOptionCard} ${form.target_audience === 'all' ? styles.audienceSelected : ''}`}
                    onClick={() => setForm({ ...form, target_audience: 'all' })}
                  >
                    <HiOutlineUsers style={{ fontSize: '1.45rem' }} />
                    <span>دانش‌آموز و اولیاء</span>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>
                      نمایش همزمان برای هر دو گروه
                    </span>
                  </button>
                </div>
              </div>

              {/* 4. Class Selection (Strictly from Teacher's DB-Registered Classes) */}
              <div data-testid="ann-classes-selector">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <label style={{ fontSize: '0.875rem', fontWeight: 700, margin: 0 }}>
                    انتخاب کلاس‌ها {isAdmin ? '(کلاس‌های مدرسه)' : '(از کلاس‌های ثبت‌شده شما در دیتابیس)'}:
                  </label>
                  <span style={{ fontSize: '0.75rem', color: '#4f46e5', fontWeight: 700 }}>
                    {form.target_class_ids.includes('*')
                      ? isAdmin
                        ? 'همه کلاس‌های مدرسه'
                        : `همه کلاس‌های من (${teacherClasses.length} کلاس)`
                      : `${form.target_class_ids.length} کلاس انتخاب شده`}
                  </span>
                </div>

                {loadingClasses ? (
                  <div style={{ padding: '14px', fontSize: '0.82rem', color: 'var(--text-tertiary)', background: 'var(--bg-surface)', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                    در حال بارگذاری کلاس‌های ثبت‌شده شما از دیتابیس...
                  </div>
                ) : teacherClasses.length === 0 ? (
                  <div style={{ padding: '14px', fontSize: '0.82rem', color: '#b45309', background: 'rgba(245, 158, 11, 0.08)', borderRadius: '10px', border: '1px solid rgba(245, 158, 11, 0.25)' }}>
                    هنوز کلاسی برای شما در دیتابیس ثبت نشده است. لطفاً ابتدا از بخش «کلاس‌ها» یا «کارنامه‌ها» کلاس‌های خود را ایجاد کنید.
                  </div>
                ) : (
                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: '8px',
                      maxHeight: '165px',
                      overflowY: 'auto',
                      padding: '10px',
                      background: 'var(--bg-surface)',
                      borderRadius: '10px',
                      border: '1px solid var(--border-color)',
                    }}
                  >
                    <button
                      type="button"
                      data-testid="ann-class-btn-all"
                      className={`btn btn-sm ${form.target_class_ids.includes('*') ? 'btn-primary' : 'btn-secondary'}`}
                      style={{ fontSize: '0.8rem', borderRadius: '8px', padding: '6px 12px' }}
                      onClick={() => toggleClassSelect('*')}
                    >
                      {isAdmin ? 'همه کلاس‌های مدرسه' : `همه کلاس‌های من (${teacherClasses.length})`}
                    </button>

                    {teacherClasses.map((c) => {
                      const isSelected =
                        !form.target_class_ids.includes('*') &&
                        form.target_class_ids.includes(c.id);
                      return (
                        <button
                          key={c.id}
                          type="button"
                          data-testid={`ann-class-btn-${c.id}`}
                          className={`btn btn-sm ${isSelected ? 'btn-primary' : 'btn-secondary'}`}
                          style={{
                            fontSize: '0.8rem',
                            borderRadius: '8px',
                            padding: '6px 12px',
                            borderColor: isSelected ? '#059669' : undefined,
                            background: isSelected ? '#059669' : undefined,
                          }}
                          onClick={() => toggleClassSelect(c.id)}
                        >
                          {isSelected ? '✓ ' : ''}
                          {c.name}
                          {c.grade ? ` — ${c.grade}` : ''}
                          {c.student_count != null ? ` (${c.student_count} نفر)` : ''}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* 5. Message Body */}
              <div className="form-group">
                <label
                  htmlFor="ann_content_input"
                  style={{ fontSize: '0.875rem', fontWeight: 700, marginBottom: '6px', display: 'block' }}
                >
                  متن پیام اطلاعیه *
                </label>
                <textarea
                  id="ann_content_input"
                  data-testid="ann-content-input"
                  className="input"
                  rows={4}
                  placeholder="متن کامل پیام اطلاعیه را در این قسمت بنویسید..."
                  value={form.content}
                  onChange={(e) => setForm({ ...form, content: e.target.value })}
                  required
                  style={{ resize: 'vertical', lineHeight: 1.7 }}
                />
              </div>

              {/* Optional Mandatory Ack Checkbox */}
              <label
                style={{
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '10px',
                  padding: '12px 14px',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '10px',
                  cursor: 'pointer',
                }}
              >
                <input
                  type="checkbox"
                  checked={form.is_mandatory}
                  onChange={(e) => setForm((prev) => ({ ...prev, is_mandatory: e.target.checked }))}
                  style={{ width: '17px', height: '17px', marginTop: '2px', accentColor: '#4f46e5' }}
                />
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--text-primary)' }}>
                    الزام به تایید مطالعه توسط مخاطبان
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                    در صورت فعال بودن، مخاطبان هنگام ورود به سامانه این اطلاعیه را به صورت ویژه مشاهده و تایید می‌کنند.
                  </div>
                </div>
              </label>

              {/* Form Buttons */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '4px' }}>
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
                  style={{ minWidth: '140px' }}
                  data-testid="publish-announcement-btn"
                >
                  {submitting ? 'در حال انتشار...' : 'انتشار اطلاعیه'}
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
                <h2 style={{ fontSize: '1.15rem', fontWeight: 800, margin: 0 }}>
                  لیست افراد تاییدکننده اطلاعیه
                </h2>
                <span style={{ fontSize: '0.8125rem', color: 'var(--text-tertiary)' }}>
                  «{selectedStatsAnnouncement.title}»
                </span>
              </div>
              <button
                type="button"
                className={styles.closeBtn}
                onClick={() => setShowStatsModal(false)}
              >
                <HiOutlineXMark />
              </button>
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 16px',
                background: 'var(--bg-subtle)',
                borderRadius: '10px',
              }}
            >
              <span style={{ fontSize: '0.875rem', fontWeight: 700 }}>
                تعداد کل تاییدیه‌های ثبت‌شده:
              </span>
              <span style={{ fontSize: '1.15rem', fontWeight: 800, color: '#059669' }}>
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
                          background: ack.user_role === 'parent' ? '#d97706' : '#4f46e5',
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
                          نقش: {ack.user_role === 'parent' ? 'اولیاء' : 'دانش‌آموز'}
                          {ack.student_code ? ` · کد: ${ack.student_code}` : ''}
                        </div>
                      </div>
                    </div>

                    <div style={{ textAlign: 'left', fontSize: '0.75rem', color: '#059669', fontWeight: 600 }}>
                      <HiOutlineCheckCircle style={{ verticalAlign: 'middle', marginLeft: '3px' }} />
                      {new Date(ack.acknowledged_at).toLocaleDateString('fa-IR')}
                    </div>
                  </div>
                ))
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '12px' }}>
              <button type="button" className="btn btn-secondary" onClick={() => setShowStatsModal(false)}>
                بستن
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
