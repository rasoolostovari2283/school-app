'use client';
import { useState, useEffect } from 'react';
import useAuthStore from '../../../stores/authStore';
import api from '../../../lib/api';
import toast from 'react-hot-toast';
import {
  HiOutlineShieldCheck,
  HiOutlineSparkles,
  HiOutlineExclamationTriangle,
  HiOutlinePlus,
  HiOutlineUserGroup,
  HiOutlineXMark,
  HiOutlineChatBubbleLeftRight,
} from 'react-icons/hi2';
import styles from './discipline.module.css';

export default function DisciplinePage() {
  const { user } = useAuthStore();
  const isTeacher = user?.role === 'teacher';

  const [activeTab, setActiveTab] = useState('discipline'); // discipline | counseling
  const [records, setRecords] = useState([]);
  const [summary, setSummary] = useState(null);
  const [counselingSessions, setCounselingSessions] = useState([]);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);

  // New Card Modal State
  const [showModal, setShowModal] = useState(false);
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [cardType, setCardType] = useState('reward');
  const [cardCategory, setCardCategory] = useState('olympiad');
  const [cardTitle, setCardTitle] = useState('');
  const [cardDesc, setCardDesc] = useState('');
  const [cardPoints, setCardPoints] = useState('1.0');

  const fetchData = async () => {
    try {
      setLoading(true);
      const [discRes, counsRes] = await Promise.allSettled([
        api.get('/discipline'),
        api.get('/discipline/counseling'),
      ]);

      if (discRes.status === 'fulfilled' && discRes.value.data?.success) {
        setRecords(discRes.value.data.data.records || []);
        setSummary(discRes.value.data.data.summary);
      }

      if (counsRes.status === 'fulfilled' && counsRes.value.data?.success) {
        setCounselingSessions(counsRes.value.data.data.sessions || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchStudents = async () => {
    try {
      const res = await api.get('/messages/directory');
      if (res.data?.success) {
        const stds = res.data.data.directory.filter((u) => u.role === 'student');
        setStudents(stds);
        if (stds.length > 0) setSelectedStudentId(stds[0].id);
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchData();
    if (isTeacher) fetchStudents();
  }, [isTeacher]);

  const handleCreateCard = async (e) => {
    e.preventDefault();
    if (!cardTitle.trim()) return;

    try {
      const res = await api.post('/discipline', {
        student_id: selectedStudentId,
        type: cardType,
        category: cardCategory,
        title: cardTitle.trim(),
        description: cardDesc.trim(),
        points: cardType === 'reward' ? Math.abs(parseFloat(cardPoints)) : -Math.abs(parseFloat(cardPoints)),
      });

      if (res.data?.success) {
        toast.success(res.data.message || 'ثبت گردید! 🎉');
        setShowModal(false);
        setCardTitle('');
        setCardDesc('');
        fetchData();
      }
    } catch (err) {
      toast.error('خطا در ثبت کارت انضباطی');
    }
  };

  return (
    <div className={styles.container}>

      {/* Header */}
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>سوابق انضباطی و پرونده مشاوره</h1>
          <p className={styles.subtitle}>
            سامانه ثبت کارت‌های تشویق، تذکرات انضباطی، امتیاز رفتار علمی و جلسات هدایت تحصیلی
          </p>
        </div>

        {isTeacher && (
          <button
            className="btn btn-primary btn-sm"
            onClick={() => setShowModal(true)}
            type="button"
          >
            <HiOutlinePlus />
            <span>صدور کارت تشویق / تذکر انضباطی</span>
          </button>
        )}
      </div>

      {/* Overall Discipline Score Banner */}
      <div className={styles.scoreBanner}>
        <div className={styles.scoreBannerInfo}>
          <div className={styles.scoreBannerTitle}>نمره انضباط و تراز رفتاری دانش‌آموز</div>
          <div className={styles.scoreBannerDesc}>
            پایه انضباطی ۲۰.۰ نمره — کارت‌های تشویق دارای امتیاز مثبت و تذکرات دارای کسر امتیاز می‌باشند.
          </div>
          <div style={{ display: 'flex', gap: '14px', marginTop: '6px', fontSize: '0.8125rem', color: '#cbd5e1' }}>
            <span>🌟 تشویق‌ها: {summary?.rewards_count || 0} مورد</span>
            <span>⚠️ تذکرات: {summary?.warnings_count || 0} مورد</span>
          </div>
        </div>

        <div className={styles.scoreCircle}>
          <span className={styles.scoreBig}>{summary?.discipline_score ?? '۲۰.۰'}</span>
          <span className={styles.scoreBase}>/ ۲۰</span>
        </div>
      </div>

      {/* Tabs */}
      <div className={styles.tabBar}>
        <button
          className={`${styles.tabBtn} ${activeTab === 'discipline' ? styles.tabBtnActive : ''}`}
          onClick={() => setActiveTab('discipline')}
          type="button"
        >
          <HiOutlineShieldCheck />
          <span>کارت‌های تشویق و تذکر انضباطی</span>
        </button>

        <button
          className={`${styles.tabBtn} ${activeTab === 'counseling' ? styles.tabBtnActive : ''}`}
          onClick={() => setActiveTab('counseling')}
          type="button"
        >
          <HiOutlineChatBubbleLeftRight />
          <span>پرونده و جلسات مشاوره تحصیلی</span>
        </button>
      </div>

      {/* ── TAB 1: Discipline Cards ── */}
      {activeTab === 'discipline' && (
        <div className={styles.cardsGrid}>
          {records.length > 0 ? (
            records.map((r) => (
              <div key={r.id} className={styles.discCard}>
                <div className={styles.discCardHeader}>
                  <span className={r.type === 'reward' ? styles.rewardBadge : styles.warningBadge}>
                    {r.type === 'reward' ? '🌟 کارت تشویق' : '⚠️ کارت تذکر'}
                  </span>
                  <span
                    className={`${styles.pointDelta} ${
                      r.points >= 0 ? styles.pointPlus : styles.pointMinus
                    }`}
                  >
                    {r.points >= 0 ? `+${r.points}` : r.points} نمره
                  </span>
                </div>

                <div className={styles.discTitle}>{r.title}</div>
                {r.description && <p className={styles.discDesc}>{r.description}</p>}

                <div className={styles.discFooter}>
                  <span>👤 دانش‌آموز: {r.student_name}</span>
                  <span>📅 {r.date}</span>
                </div>
              </div>
            ))
          ) : (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-tertiary)', gridColumn: '1 / -1' }}>
              هیچ سابقه انضباطی ثبت نشده است.
            </div>
          )}
        </div>
      )}

      {/* ── TAB 2: Counseling Sessions ── */}
      {activeTab === 'counseling' && (
        <div className={styles.counselingList}>
          {counselingSessions.length > 0 ? (
            counselingSessions.map((c) => (
              <div key={c.id} className={styles.counselingCard}>
                <div className={styles.counselingMetaRow}>
                  <span>👤 دانش‌آموز: {c.student_name}</span>
                  <span>📅 تاریخ جلسه: {c.session_date} — مشاور: {c.counselor_name || 'مرکز مشاوره تحصیلی'}</span>
                </div>

                <h3 className={styles.counselingTitle}>{c.session_title}</h3>

                {c.student_concerns && (
                  <div className={styles.counselingSection}>
                    <div className={styles.counselingSecLabel}>مسائل و چالش‌های مطرح‌شده دانش‌آموز:</div>
                    <div>{c.student_concerns}</div>
                  </div>
                )}

                {c.counselor_notes && (
                  <div className={styles.counselingSection}>
                    <div className={styles.counselingSecLabel}>تحلیل و ارزیابی مشاور تحصیلی:</div>
                    <div>{c.counselor_notes}</div>
                  </div>
                )}

                {c.recommendations && (
                  <div className={styles.counselingSection} style={{ background: 'rgba(16, 185, 129, 0.08)', borderColor: 'rgba(16, 185, 129, 0.25)' }}>
                    <div className={styles.counselingSecLabel} style={{ color: '#34d399' }}>راهکارها و توصیه‌های رفتاری/مطالعاتی به دانش‌آموز و اولیا:</div>
                    <div style={{ color: '#a7f3d0' }}>{c.recommendations}</div>
                  </div>
                )}
              </div>
            ))
          ) : (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-tertiary)' }}>
              جلسه مشاوره‌ای در سامانه ثبت نشده است.
            </div>
          )}
        </div>
      )}

      {/* ── Modal: Issue Discipline Card ── */}
      {showModal && (
        <div className="modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div style={{ background: 'var(--bg-card)', padding: '24px', borderRadius: 'var(--radius-2xl)', maxWidth: '480px', width: '100%', border: '1px solid var(--border-color)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontWeight: 800 }}>صدور کارت تشویق یا تذکر انضباطی</h3>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: '1.25rem' }}>
                <HiOutlineXMark />
              </button>
            </div>

            <form onSubmit={handleCreateCard} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div className="input-group">
                <label className="input-label" htmlFor="disc_student">انتخاب دانش‌آموز</label>
                <select
                  id="disc_student"
                  className="input"
                  value={selectedStudentId}
                  onChange={(e) => setSelectedStudentId(e.target.value)}
                  required
                >
                  {students.map((st) => (
                    <option key={st.id} value={st.id}>{st.display_name} ({st.personnel_or_student_code})</option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div className="input-group">
                  <label className="input-label" htmlFor="disc_type">نوع کارت</label>
                  <select
                    id="disc_type"
                    className="input"
                    value={cardType}
                    onChange={(e) => setCardType(e.target.value)}
                  >
                    <option value="reward">🌟 تشویق (+) امتیاز</option>
                    <option value="warning">⚠️ تذکر (-) کسر امتیاز</option>
                  </select>
                </div>

                <div className="input-group">
                  <label className="input-label" htmlFor="disc_pts">میزان امتیاز</label>
                  <input
                    id="disc_pts"
                    type="number"
                    step="0.5"
                    min="0.5"
                    max="5"
                    className="input"
                    value={cardPoints}
                    onChange={(e) => setCardPoints(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="input-group">
                <label className="input-label" htmlFor="disc_title">عنوان تشویق یا تذکر</label>
                <input
                  id="disc_title"
                  type="text"
                  className="input"
                  placeholder="مثلاً: رتبه برتر آزمون مرحله اول المپیاد"
                  value={cardTitle}
                  onChange={(e) => setCardTitle(e.target.value)}
                  required
                />
              </div>

              <div className="input-group">
                <label className="input-label" htmlFor="disc_desc">شرح و توضیحات تکمیلی</label>
                <textarea
                  id="disc_desc"
                  rows={3}
                  className="input"
                  placeholder="علت تشویق یا تذکر..."
                  value={cardDesc}
                  onChange={(e) => setCardDesc(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '10px' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>
                  انصراف
                </button>
                <button type="submit" className="btn btn-primary">
                  ثبت رسمی در پرونده
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
