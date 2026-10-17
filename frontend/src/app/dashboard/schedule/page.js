'use client';
import { useState, useEffect } from 'react';
import useAuthStore from '../../../stores/authStore';
import api from '../../../lib/api';
import toast, { Toaster } from 'react-hot-toast';
import {
  HiOutlineCalendarDays,
  HiOutlinePlus,
  HiOutlineShieldExclamation,
  HiOutlineXMark,
  HiOutlineBuildingOffice2,
  HiOutlineUser,
} from 'react-icons/hi2';
import styles from './schedule.module.css';

const DAYS = [
  { id: 0, name: 'شنبه' },
  { id: 1, name: 'یکشنبه' },
  { id: 2, name: 'دوشنبه' },
  { id: 3, name: 'سه‌شنبه' },
  { id: 4, name: 'چهارشنبه' },
  { id: 5, name: 'پنج‌شنبه' },
];

const PERIODS = [
  { id: 1, time: '۰۷:۴۵ - ۰۹:۱۵', label: 'زنگ اول' },
  { id: 2, time: '۰۹:۳۰ - ۱۱:۰۰', label: 'زنگ دوم' },
  { id: 3, time: '۱۱:۱۵ - ۱۲:۴۵', label: 'زنگ سوم' },
  { id: 4, time: '۱۳:۳۰ - ۱۵:۰۰', label: 'زنگ چهارم (کارگاه)' },
  { id: 5, time: '۱۵:۱۵ - ۱۶:۴۵', label: 'زنگ پنجم (المپیاد)' },
];

export default function SchedulePage() {
  const { user } = useAuthStore();
  const isTeacher = user?.role === 'teacher' || user?.role === 'admin' || user?.role === 'manager';

  const [schedules, setSchedules] = useState([]);
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);

  // Add Period Modal State
  const [showModal, setShowModal] = useState(false);
  const [formClassId, setFormClassId] = useState('default_class');
  const [formSubject, setFormSubject] = useState('');
  const [formDay, setFormDay] = useState(0);
  const [formPeriod, setFormPeriod] = useState(1);
  const [formRoom, setFormRoom] = useState('کلاس ۳۰۱ (سالن خوارزمی)');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchSchedule = async () => {
    try {
      setLoading(true);
      const res = await api.get('/schedules');
      if (res.data?.success) {
        setSchedules(res.data.data.schedules || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchClasses = async () => {
    try {
      const res = await api.get('/classes');
      const list = res.data.data.classes || [];
      setClasses(list);
      if (list.length > 0) {
        setFormClassId(list[0].id);
      } else {
        setFormClassId('default_class');
      }
    } catch (err) {
      console.error(err);
      setFormClassId('default_class');
    }
  };

  useEffect(() => {
    fetchSchedule();
    fetchClasses();
  }, []);

  const handleAddPeriod = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const res = await api.post('/schedules', {
        class_id: formClassId,
        subject: formSubject,
        day_of_week: formDay,
        period_number: formPeriod,
        room: formRoom,
      });

      if (res.data?.success) {
        toast.success(res.data.message || 'زنگ کلاسی ثبت شد! 🎉');
        setShowModal(false);
        setFormSubject('');
        fetchSchedule();
      }
    } catch (err) {
      // Automatic clash detection response
      const errMsg = err.response?.data?.message || 'خطا در افزودن زنگ درسی';
      toast.error(errMsg, { duration: 5000 });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeletePeriod = async (id) => {
    if (!confirm('آیا از حذف این ساعت درسی اطمینان دارید؟')) return;
    try {
      await api.delete(`/schedules/${id}`);
      toast.success('زنگ درسی با موفقیت حذف شد');
      fetchSchedule();
    } catch (err) {
      toast.error('خطا در حذف زنگ درسی');
    }
  };

  // Find schedule entry for given day and period
  const getSlot = (dayId, periodId) => {
    return schedules.find(
      (s) => s.day_of_week === dayId && s.period_number === periodId
    );
  };

  return (
    <div className={styles.container}>
      <Toaster position="top-center" />

      {/* Header */}
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>برنامه هفتگی و ساعات آموزشی</h1>
          <p className={styles.subtitle}>
            جدول زمان‌بندی زنگ‌های کلاسی، کارگاه‌های تخصصی و سیستم هوشمند جلوگیری از تداخل اساتید
          </p>
        </div>

        {isTeacher && (
          <button
            className="btn btn-primary btn-sm"
            onClick={() => setShowModal(true)}
            type="button"
          >
            <HiOutlinePlus />
            <span>چینش و ثبت زنگ کلاسی جدید</span>
          </button>
        )}
      </div>

      {/* Clash Prevention Banner */}
      <div className={styles.clashBanner}>
        <HiOutlineShieldExclamation style={{ fontSize: '1.5rem', color: '#818cf8', flexShrink: 0 }} />
        <div>
          <strong>سیستم کنترل خودکار تداخل فعال است:</strong> در صورت انتخاب همزمان یک ساعت برای استاد یا فضای آزمایشگاه، سامانه به طور خودکار مانع ایجاد تداخل خواهد شد.
        </div>
      </div>

      {/* Timetable Matrix */}
      <div className={styles.timetableWrapper}>
        <table className={styles.timetable}>
          <thead>
            <tr>
              <th className={styles.dayHeaderCell}>روز هفته</th>
              {PERIODS.map((p) => (
                <th key={p.id}>
                  <div>{p.label}</div>
                  <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '2px' }}>
                    {p.time}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {DAYS.map((day) => (
              <tr key={day.id}>
                <td className={styles.dayHeaderCell}>{day.name}</td>
                {PERIODS.map((period) => {
                  const item = getSlot(day.id, period.id);

                  return (
                    <td key={period.id} className={styles.periodCell}>
                      {item ? (
                        <div className={styles.lessonCard}>
                          {isTeacher && (
                            <button
                              className={styles.deleteLessonBtn}
                              onClick={() => handleDeletePeriod(item.id)}
                              title="حذف"
                              type="button"
                            >
                              ×
                            </button>
                          )}
                          <div className={styles.lessonSubject}>{item.subject}</div>
                          <div className={styles.lessonTeacher}>
                            👤 {item.teacher_name || 'دبیر محترم'}
                          </div>
                          <div className={styles.lessonRoom}>
                            <HiOutlineBuildingOffice2 />
                            <span>{item.room || 'کلاس اصلی'}</span>
                          </div>
                        </div>
                      ) : (
                        <div className={styles.emptySlot}>— آزاد —</div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Modal: Add Class Period ── */}
      {showModal && (
        <div className="modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div style={{ background: 'var(--bg-card)', padding: '24px', borderRadius: 'var(--radius-2xl)', maxWidth: '480px', width: '100%', border: '1px solid var(--border-color)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontWeight: 800 }}>افزودن زنگ کلاسی جدید به جدول</h3>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: '1.25rem' }}>
                <HiOutlineXMark />
              </button>
            </div>

            <form onSubmit={handleAddPeriod} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div className="input-group">
                <label className="input-label" htmlFor="sched_class">کلاس و پایه</label>
                <select
                  id="sched_class"
                  className="input"
                  value={formClassId}
                  onChange={(e) => setFormClassId(e.target.value)}
                  required
                >
                  {classes.length === 0 ? (
                    <option value="default_class">کلاس عمومی پیش‌فرض</option>
                  ) : (
                    classes.map((c) => (
                      <option key={c.id} value={c.id}>{c.name} ({c.grade})</option>
                    ))
                  )}
                </select>
              </div>

              <div className="input-group">
                <label className="input-label" htmlFor="sched_subj">عنوان درس یا کارگاه</label>
                <input
                  id="sched_subj"
                  className="input"
                  type="text"
                  placeholder="مثلاً: هندسه تحلیلی و حل تست"
                  value={formSubject}
                  onChange={(e) => setFormSubject(e.target.value)}
                  required
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div className="input-group">
                  <label className="input-label" htmlFor="sched_day">روز هفته</label>
                  <select
                    id="sched_day"
                    className="input"
                    value={formDay}
                    onChange={(e) => setFormDay(e.target.value)}
                  >
                    {DAYS.map((d) => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </div>

                <div className="input-group">
                  <label className="input-label" htmlFor="sched_period">زنگ کلاسی</label>
                  <select
                    id="sched_period"
                    className="input"
                    value={formPeriod}
                    onChange={(e) => setFormPeriod(e.target.value)}
                  >
                    {PERIODS.map((p) => (
                      <option key={p.id} value={p.id}>{p.label} ({p.time})</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="input-group">
                <label className="input-label" htmlFor="sched_room">محل تشکیل (اتاق / آزمایشگاه)</label>
                <select
                  id="sched_room"
                  className="input"
                  value={formRoom}
                  onChange={(e) => setFormRoom(e.target.value)}
                >
                  <option value="کلاس ۳۰۱ (سالن خوارزمی)">کلاس ۳۰۱ (سالن خوارزمی)</option>
                  <option value="کلاس ۳۰۲ (سالن ابن‌سینا)">کلاس ۳۰۲ (سالن ابن‌سینا)</option>
                  <option value="آزمایشگاه مرکزی فیزیک">آزمایشگاه مرکزی فیزیک</option>
                  <option value="آزمایشگاه شیمی دکتر حسابی">آزمایشگاه شیمی دکتر حسابی</option>
                  <option value="سایت تخصصی کامپیوتر و هوش مصنوعی">سایت تخصصی کامپیوتر و هوش مصنوعی</option>
                </select>
              </div>

              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '10px' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>
                  انصراف
                </button>
                <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
                  {isSubmitting ? 'در حال بررسی تداخل...' : 'بررسی تداخل و ثبت'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
