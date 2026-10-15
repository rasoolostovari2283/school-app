'use client';
import { useState, useEffect } from 'react';
import api from '../../../lib/api';
import toast from 'react-hot-toast';
import {
  HiOutlineBell,
  HiOutlineCheck,
  HiOutlineClipboardDocumentList,
  HiOutlineQuestionMarkCircle,
  HiOutlineAcademicCap,
  HiOutlineChatBubbleLeftRight,
  HiOutlineUserGroup,
  HiOutlineBuildingOffice2,
  HiOutlineShieldCheck,
} from 'react-icons/hi2';
import styles from './notifications.module.css';

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchNotifications();
  }, []);

  const fetchNotifications = async () => {
    setLoading(true);
    try {
      const res = await api.get('/notifications?limit=30');
      setNotifications(res.data.data.notifications || []);
    } catch (err) {
      console.error(err);
      toast.error('خطا در دریافت اعلان‌ها');
    } finally {
      setLoading(false);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await api.put('/notifications/read-all');
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      toast.success('همه اعلان‌ها به عنوان خوانده شده علامت‌گذاری شدند ✅');
    } catch (err) {
      toast.error('خطا در تغییر وضعیت اعلان‌ها');
    }
  };

  const getIcon = (type) => {
    switch (type) {
      case 'management':
      case 'school_directive':
        return { icon: HiOutlineBuildingOffice2, bg: 'rgba(245, 158, 11, 0.18)', color: '#d97706', isManagement: true };
      case 'assignment':
        return { icon: HiOutlineClipboardDocumentList, bg: '#eff6ff', color: '#2563eb' };
      case 'grade':
        return { icon: HiOutlineAcademicCap, bg: '#ecfdf5', color: '#059669' };
      case 'quiz':
        return { icon: HiOutlineQuestionMarkCircle, bg: '#fef3c7', color: '#d97706' };
      case 'attendance':
        return { icon: HiOutlineUserGroup, bg: '#fef2f2', color: '#dc2626' };
      case 'message':
      case 'announcement':
        return { icon: HiOutlineChatBubbleLeftRight, bg: '#f3e8ff', color: '#9333ea' };
      default:
        return { icon: HiOutlineBell, bg: 'var(--bg-hover)', color: 'var(--text-secondary)' };
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>صندوق اعلان‌ها و هشدارها</h1>
          <p className={styles.subtitle}>پیگیری رویدادهای کلاسی، ثبت تکالیف جدید، غیبت‌ها و نمرات ثبت شده</p>
        </div>

        {notifications.some((n) => !n.is_read) && (
          <button className="btn btn-secondary btn-sm" onClick={handleMarkAllRead}>
            <HiOutlineCheck />
            <span>علامت‌گذاری همه به عنوان خوانده شده</span>
          </button>
        )}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px 0' }}>
          <div className="spinner" style={{ margin: '0 auto' }}></div>
          <p style={{ marginTop: '12px', color: 'var(--text-tertiary)' }}>در حال بارگذاری اعلان‌ها...</p>
        </div>
      ) : notifications.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', background: 'var(--bg-card)', borderRadius: 'var(--radius-xl)' }}>
          <div style={{ fontSize: '3rem', marginBottom: '12px' }}>🔔</div>
          <h3>هیچ اعلانی ندارید</h3>
          <p style={{ color: 'var(--text-tertiary)', marginTop: '4px' }}>
            کلیه اخبار و تغییرات جدید کلاس‌ها اینجا نمایش داده می‌شوند.
          </p>
        </div>
      ) : (
        <div className={styles.notifList}>
          {notifications.map((notif) => {
            const { icon: Icon, bg, color } = getIcon(notif.type);
            return (
              <div
                key={notif.id}
                className={`${styles.notifCard} ${!notif.is_read ? styles.unread : ''}`}
                style={notif.type === 'management' ? { border: '1px solid rgba(245, 158, 11, 0.4)', background: 'rgba(245, 158, 11, 0.04)' } : {}}
              >
                <div className={styles.iconBox} style={{ background: bg, color }}>
                  <Icon />
                </div>

                <div className={styles.notifContent}>
                  <div className={styles.notifHeader}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <span className={styles.notifTitle}>{notif.title}</span>
                      {notif.type === 'management' && (
                        <span
                          style={{
                            fontSize: '0.6875rem',
                            fontWeight: 700,
                            padding: '2px 8px',
                            borderRadius: '12px',
                            background: 'rgba(245, 158, 11, 0.15)',
                            color: '#f59e0b',
                            border: '1px solid rgba(245, 158, 11, 0.3)',
                          }}
                        >
                          🏛️ بخشنامه مدیریت مدرسه
                        </span>
                      )}
                    </div>
                    <span className={styles.notifTime}>
                      {new Date(notif.created_at).toLocaleDateString('fa-IR', {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                  <p className={styles.notifBody}>{notif.body}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
