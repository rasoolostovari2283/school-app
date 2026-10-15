'use client';
import { useState, useEffect } from 'react';
import useAuthStore from '../../stores/authStore';
import api from '../../lib/api';
import toast from 'react-hot-toast';
import {
  HiOutlineCheckCircle,
  HiOutlineExclamationTriangle,
  HiOutlineUser,
  HiOutlineCalendarDays,
  HiOutlineAcademicCap,
} from 'react-icons/hi2';
import styles from './MandatoryAnnouncementModal.module.css';

export default function MandatoryAnnouncementModal() {
  const { user, isAuthenticated } = useAuthStore();
  const [pendingList, setPendingList] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isAuthenticated || !user) return;
    // Only students and parents have mandatory modal restrictions
    if (user.role === 'teacher' || user.role === 'admin' || user.role === 'manager') {
      setLoading(false);
      return;
    }

    checkPendingAnnouncements();
  }, [isAuthenticated, user]);

  const checkPendingAnnouncements = async () => {
    try {
      setLoading(true);
      const res = await api.get('/announcements/pending-mandatory');
      if (res.data?.success && Array.isArray(res.data?.data?.pending)) {
        setPendingList(res.data.data.pending);
        setCurrentIndex(0);
      }
    } catch (err) {
      console.error('Failed to fetch pending mandatory announcements:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAcknowledge = async () => {
    const current = pendingList[currentIndex];
    if (!current) return;

    try {
      setSubmitting(true);
      const res = await api.post(`/announcements/${current.id}/acknowledge`);
      if (res.data?.success) {
        toast.success('اطلاعیه با موفقیت تایید شد. دسترسی به پنل باز گردید.');
        
        // Advance to next or close
        if (currentIndex + 1 < pendingList.length) {
          setCurrentIndex(prev => prev + 1);
        } else {
          setPendingList([]);
        }
      }
    } catch (err) {
      console.error('Failed to acknowledge announcement:', err);
      toast.error(err.response?.data?.message || 'خطا در ثبت تاییدیه اطلاعیه');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading || pendingList.length === 0) {
    return null;
  }

  const currentNotice = pendingList[currentIndex];
  if (!currentNotice) return null;

  const priorityLabel = {
    urgent: 'فوری و اضطراری',
    important: 'مهم',
    normal: 'عادی',
  }[currentNotice.priority] || 'مهم';

  const priorityClass = {
    urgent: styles.priorityUrgent,
    important: styles.priorityImportant,
    normal: styles.priorityNormal,
  }[currentNotice.priority] || styles.priorityImportant;

  const topBannerClass = {
    urgent: styles.topBannerUrgent,
    important: styles.topBannerImportant,
  }[currentNotice.priority] || styles.topBanner;

  return (
    <div className={styles.backdrop} dir="rtl">
      <div className={styles.modal}>
        <div className={`${styles.topBanner} ${topBannerClass}`} />

        <div className={styles.contentWrapper}>
          <div className={styles.headerRow}>
            <div className={styles.badgeGroup}>
              <span className={styles.mandatoryBadge}>
                <HiOutlineExclamationTriangle /> الزام به مطالعه و تایید
              </span>
              <span className={`${styles.priorityBadge} ${priorityClass}`}>
                {priorityLabel}
              </span>
            </div>

            {pendingList.length > 1 && (
              <span className={styles.counterBadge}>
                پیام {currentIndex + 1} از {pendingList.length}
              </span>
            )}
          </div>

          <h2 className={styles.title}>{currentNotice.title}</h2>

          <div className={styles.metaInfo}>
            <span className={styles.metaItem}>
              <HiOutlineUser />
              فرستنده: {currentNotice.teacher_name || 'مدیریت مدرسه'}
            </span>
            {currentNotice.class_name && (
              <span className={styles.metaItem}>
                <HiOutlineAcademicCap />
                کلاس: {currentNotice.class_name}
              </span>
            )}
            {currentNotice.target_grades && !currentNotice.target_grades.includes('*') && currentNotice.target_grades.length > 0 && (
              <span className={styles.metaItem}>
                🎓 پایه: {currentNotice.target_grades.join('، ')}
              </span>
            )}
            {currentNotice.target_subjects && !currentNotice.target_subjects.includes('*') && currentNotice.target_subjects.length > 0 && (
              <span className={styles.metaItem}>
                📖 درس: {currentNotice.target_subjects.join('، ')}
              </span>
            )}
            <span className={styles.metaItem}>
              <HiOutlineCalendarDays />
              {new Date(currentNotice.created_at).toLocaleDateString('fa-IR')}
            </span>
          </div>

          <div className={styles.bodyBox}>
            {currentNotice.content}
          </div>

          <div className={styles.noticeAlert}>
            <HiOutlineExclamationTriangle style={{ fontSize: '1.25rem', flexShrink: 0, marginTop: '2px' }} />
            <span>
              این پیام توسط مدرسه دارای وضعیت <strong>الزام به تایید</strong> تنظیم شده است. جهت ورود به پنل، حتماً دکمه تایید زیر را بفشارید.
            </span>
          </div>

          <div className={styles.actions}>
            <button
              type="button"
              className={styles.confirmBtn}
              onClick={handleAcknowledge}
              disabled={submitting}
            >
              <HiOutlineCheckCircle style={{ fontSize: '1.25rem' }} />
              {submitting ? 'در حال ثبت تاییدیه...' : 'پیام را خواندم و متوجه شدم (ورود به پنل)'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
