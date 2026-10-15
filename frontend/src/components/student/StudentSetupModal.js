'use client';
import { useState, useEffect } from 'react';
import api from '../../lib/api';
import toast from 'react-hot-toast';
import {
  HiOutlineAcademicCap,
  HiOutlineBuildingLibrary,
  HiOutlineUserGroup,
  HiOutlineCheck,
  HiOutlineXMark,
  HiOutlineSparkles,
} from 'react-icons/hi2';
import styles from './StudentSetupModal.module.css';

const EDUCATIONAL_STAGES = [
  {
    id: 'preschool',
    title: 'پیش‌دبستانی',
    icon: '🧸',
    desc: 'پیش ۱ و پیش ۲',
    grades: [
      'پیش‌دبستانی ۱',
      'پیش‌دبستانی ۲',
    ],
  },
  {
    id: 'elementary',
    title: 'دبستان',
    icon: '🎒',
    desc: 'پایه اول تا ششم',
    grades: [
      'اول دبستان',
      'دوم دبستان',
      'سوم دبستان',
      'چهارم دبستان',
      'پنجم دبستان',
      'ششم دبستان',
    ],
  },
  {
    id: 'middle',
    title: 'متوسطه اول',
    icon: '📚',
    desc: 'پایه هفتم تا نهم',
    grades: [
      'پایه هفتم',
      'پایه هشتم',
      'پایه نهم',
    ],
  },
  {
    id: 'high',
    title: 'متوسطه دوم',
    icon: '🎓',
    desc: 'ریاضی، تجربی، انسانی',
    grades: [
      'پایه دهم ریاضی',
      'پایه دهم تجربی',
      'پایه دهم انسانی',
      'پایه یازدهم ریاضی',
      'پایه یازدهم تجربی',
      'پایه یازدهم انسانی',
      'پایه دوازدهم ریاضی',
      'پایه دوازدهم تجربی',
      'پایه دوازدهم انسانی',
    ],
  },
  {
    id: 'vocational',
    title: 'هنرستان و فنی',
    icon: '⚙️',
    desc: 'فنی‌حرفه‌ای و کاردانش',
    grades: [
      'دهم هنرستان (فنی‌حرفه‌ای)',
      'دهم هنرستان (کاردانش)',
      'یازدهم هنرستان (فنی‌حرفه‌ای)',
      'یازدهم هنرستان (کاردانش)',
      'دوازدهم هنرستان (فنی‌حرفه‌ای)',
      'دوازدهم هنرستان (کاردانش)',
    ],
  },
];

export default function StudentSetupModal({ isOpen, onClose, onSuccess, initialData }) {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [options, setOptions] = useState({ schools: [], grades: [], teachers: [] });

  const [selectedStage, setSelectedStage] = useState('high');
  const [selectedGrade, setSelectedGrade] = useState('پایه دهم ریاضی');
  const [selectedSchool, setSelectedSchool] = useState('');
  const [customSchool, setCustomSchool] = useState('');
  const [isCustomSchool, setIsCustomSchool] = useState(false);
  const [selectedTeacherIds, setSelectedTeacherIds] = useState(new Set());

  useEffect(() => {
    if (isOpen) {
      loadOptions();
    }
  }, [isOpen]);

  useEffect(() => {
    if (initialData) {
      if (initialData.grade) {
        setSelectedGrade(initialData.grade);
        // Find which stage this grade belongs to
        const matchedStage = EDUCATIONAL_STAGES.find((s) => s.grades.includes(initialData.grade));
        if (matchedStage) {
          setSelectedStage(matchedStage.id);
        }
      }
      if (initialData.school_name) {
        setSelectedSchool(initialData.school_name);
      }
      if (Array.isArray(initialData.selected_teacher_ids)) {
        setSelectedTeacherIds(new Set(initialData.selected_teacher_ids));
      }
    }
  }, [initialData]);

  const loadOptions = async () => {
    setLoading(true);
    try {
      const res = await api.get('/auth/student-setup-options');
      const data = res.data.data;
      setOptions(data);

      if (!selectedSchool && data.schools?.length > 0) {
        setSelectedSchool(data.schools[0].name);
      }
    } catch (err) {
      console.error(err);
      toast.error('خطا در دریافت لیست مدارس و معلمان');
    } finally {
      setLoading(false);
    }
  };

  const activeStage = EDUCATIONAL_STAGES.find((s) => s.id === selectedStage) || EDUCATIONAL_STAGES[2];

  if (!isOpen) return null;

  const handleSchoolChange = (e) => {
    const val = e.target.value;
    if (val === 'CUSTOM') {
      setIsCustomSchool(true);
    } else {
      setIsCustomSchool(false);
      setSelectedSchool(val);
    }
  };

  const toggleTeacher = (teacherId) => {
    const next = new Set(selectedTeacherIds);
    if (next.has(teacherId)) {
      next.delete(teacherId);
    } else {
      next.add(teacherId);
    }
    setSelectedTeacherIds(next);
  };

  const handleSelectAllTeachers = () => {
    if (selectedTeacherIds.size === options.teachers.length) {
      setSelectedTeacherIds(new Set());
    } else {
      setSelectedTeacherIds(new Set(options.teachers.map((t) => t.id)));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const finalSchool = isCustomSchool ? customSchool.trim() : selectedSchool;
    if (!finalSchool) {
      toast.error('لطفاً نام مدرسه خود را مشخص فرمایید');
      return;
    }
    if (!selectedGrade) {
      toast.error('لطفاً پایه تحصیلی خود را انتخاب فرمایید');
      return;
    }

    setSubmitting(true);
    try {
      const teacherIdsArray = Array.from(selectedTeacherIds);
      const res = await api.post('/auth/student-setup', {
        school_name: finalSchool,
        grade: selectedGrade,
        teacher_ids: teacherIdsArray,
      });

      toast.success(res.data.message || 'مشخصات و معلمان با موفقیت ذخیره شدند! 🎉');
      if (onSuccess) {
        onSuccess(res.data.data.user);
      }
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.message || 'خطا در ثبت اطلاعات');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.headerTitleBox}>
            <div className={styles.headerIcon}>🎓</div>
            <div>
              <h2 className={styles.title}>تکمیل مشخصات تحصیلی و معلمان</h2>
              <p className={styles.subtitle}>
                پایه تحصیلی و نام مدرسه خود را مشخص کنید و دبیران خود را تیک بزنید تا کلاس‌ها و پیام‌های آن‌ها فوراً به پنل شما متصل شوند.
              </p>
            </div>
          </div>
          <button className={styles.closeBtn} onClick={onClose} title="بستن">
            <HiOutlineXMark />
          </button>
        </div>

        {/* Body */}
        <div className={styles.body}>
          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '20px 0' }}>
              <div className="skeleton" style={{ height: 40, borderRadius: 'var(--radius-lg)' }}></div>
              <div className="skeleton" style={{ height: 50, borderRadius: 'var(--radius-lg)' }}></div>
              <div className="skeleton" style={{ height: 160, borderRadius: 'var(--radius-lg)' }}></div>
            </div>
          ) : (
            <>
              {/* 1. Grade & Educational Stage Selection */}
              <div className={styles.section}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                  <label className={styles.sectionLabel}>
                    <HiOutlineAcademicCap style={{ color: '#818cf8', fontSize: '1.25rem' }} />
                    <span>مقطع و شاخه تحصیلی:</span>
                  </label>
                  <span className={styles.sectionBadge}>
                    پایه انتخابی: <strong>{selectedGrade}</strong>
                  </span>
                </div>

                {/* 4 Main Stages */}
                <div className={styles.stagesGrid}>
                  {EDUCATIONAL_STAGES.map((stg) => {
                    const isActive = selectedStage === stg.id;
                    return (
                      <div
                        key={stg.id}
                        className={`${styles.stageCard} ${isActive ? styles.stageCardActive : ''}`}
                        onClick={() => {
                          setSelectedStage(stg.id);
                          if (!stg.grades.includes(selectedGrade)) {
                            setSelectedGrade(stg.grades[0]);
                          }
                        }}
                      >
                        <span className={styles.stageIcon}>{stg.icon}</span>
                        <span className={styles.stageTitle}>{stg.title}</span>
                        <span className={styles.stageDesc}>{stg.desc}</span>
                      </div>
                    );
                  })}
                </div>

                {/* Dynamic Sub-Grades of Active Stage */}
                {activeStage && (
                  <div className={styles.subGradesBox}>
                    <div className={styles.subGradesHeader}>
                      <span className={styles.subGradesTitle}>
                        🎯 پایه‌های مقطع <strong>{activeStage.title}</strong> (یکی را انتخاب فرمایید):
                      </span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                        {activeStage.grades.length} زیرشاخه
                      </span>
                    </div>

                    <div className={styles.gradesGrid}>
                      {activeStage.grades.map((gr) => {
                        const isChosen = selectedGrade === gr;
                        return (
                          <button
                            key={gr}
                            type="button"
                            className={`${styles.gradeChip} ${isChosen ? styles.gradeChipActive : ''}`}
                            onClick={() => setSelectedGrade(gr)}
                          >
                            {isChosen && <HiOutlineCheck style={{ marginLeft: 6, display: 'inline' }} />}
                            {gr}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* 2. School Selection */}
              <div className={styles.section}>
                <label className={styles.sectionLabel}>
                  <HiOutlineBuildingLibrary style={{ color: '#38bdf8', fontSize: '1.25rem' }} />
                  <span>مدرسه شما:</span>
                </label>
                <div className={styles.schoolInputRow}>
                  <select
                    className="input"
                    value={isCustomSchool ? 'CUSTOM' : selectedSchool}
                    onChange={handleSchoolChange}
                    style={{ fontWeight: 700, padding: '12px' }}
                  >
                    {options.schools.map((sch) => (
                      <option key={sch.id} value={sch.name}>
                        🏛️ {sch.name} {sch.city ? `(${sch.city})` : ''}
                      </option>
                    ))}
                    <option value="CUSTOM">✏️ سایر مدارس (تایپ نام مدرسه جدید...)</option>
                  </select>

                  {isCustomSchool && (
                    <input
                      className={`input ${styles.customSchoolInput}`}
                      type="text"
                      placeholder="نام کامل مدرسه خود را وارد کنید (مثلاً: دبیرستان اندیشه نو)"
                      value={customSchool}
                      onChange={(e) => setCustomSchool(e.target.value)}
                      autoFocus
                      required
                    />
                  )}
                </div>
              </div>

              {/* 3. Teachers Checkbox Selection */}
              <div className={styles.section}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                  <label className={styles.sectionLabel}>
                    <HiOutlineUserGroup style={{ color: '#10b981', fontSize: '1.25rem' }} />
                    <span>انتخاب معلمان و دبیران این ترم:</span>
                  </label>
                  <button
                    type="button"
                    onClick={handleSelectAllTeachers}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--primary-500)',
                      fontSize: '0.8125rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    {selectedTeacherIds.size === options.teachers.length
                      ? 'لغو انتخاب همه'
                      : 'انتخاب همه دبیران ✓'}
                  </button>
                </div>

                <div className={styles.teachersGrid}>
                  {options.teachers.map((teacher) => {
                    const isSelected = selectedTeacherIds.has(teacher.id);
                    return (
                      <div
                        key={teacher.id}
                        className={`${styles.teacherCard} ${isSelected ? styles.teacherCardSelected : ''}`}
                        onClick={() => toggleTeacher(teacher.id)}
                      >
                        {/* Custom Animated Checkbox */}
                        <div className={`${styles.checkboxBox} ${isSelected ? styles.checkboxBoxChecked : ''}`}>
                          {isSelected && <HiOutlineCheck />}
                        </div>

                        {/* Avatar */}
                        <div className={styles.teacherAvatar}>
                          {teacher.display_name?.charAt(0)}
                        </div>

                        {/* Teacher Info */}
                        <div className={styles.teacherInfo}>
                          <div className={styles.teacherNameRow}>
                            <span className={styles.teacherName}>{teacher.display_name}</span>
                            {teacher.username && (
                              <span className={styles.teacherHandle}>@{teacher.username}</span>
                            )}
                          </div>
                          <span className={styles.teacherSubject}>
                            📚 {teacher.subjects?.join(' • ') || teacher.job_title}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className={styles.footer}>
          <div className={styles.selectedCountHint}>
            <span>دبیران تیک‌خورده:</span>
            <span className={styles.selectedCountNum}>{selectedTeacherIds.size} نفر</span>
          </div>

          <button
            type="button"
            className={styles.submitBtn}
            onClick={handleSubmit}
            disabled={submitting || loading}
          >
            <HiOutlineSparkles style={{ fontSize: '1.2rem' }} />
            <span>{submitting ? 'در حال ذخیره‌سازی...' : 'ثبت و اتصال به کلاس‌های درسی 🚀'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
