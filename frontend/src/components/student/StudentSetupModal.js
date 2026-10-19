'use client';
import { useState, useEffect } from 'react';
import api from '../../lib/api';
import useAuthStore from '../../stores/authStore';
import toast from 'react-hot-toast';
import {
  HiOutlineAcademicCap,
  HiOutlineBuildingLibrary,
  HiOutlineUserGroup,
  HiOutlineCheck,
  HiOutlineXMark,
  HiOutlineSparkles,
  HiOutlinePlus,
} from 'react-icons/hi2';
import styles from './StudentSetupModal.module.css';

const DEFAULT_TEACHERS = [
  {
    id: 'staff-mirzaei',
    display_name: 'مهندس حسین میرزایی',
    username: 'hossein_mirzaei',
    job_title: 'معاون آموزشی و دبیر حسابان',
    subjects: ['حسابان و دیفرانسیل', 'ریاضیات'],
  },
  {
    id: 'staff-sadeghi',
    display_name: 'دکتر فاطمه صادقی',
    username: 'fatemeh_sadeghi',
    job_title: 'دبیر زیست‌شناسی و ژنتیک',
    subjects: ['زیست‌شناسی و ژنتیک'],
  },
  {
    id: 'staff-akbari',
    display_name: 'استاد مسعود اکبری',
    username: 'masoud_akbari',
    job_title: 'دبیر ادبیات فارسی و نگارش',
    subjects: ['ادبیات فارسی', 'نگارش'],
  },
  {
    id: 'staff-jalali',
    display_name: 'سرکار خانم مهندس جلالی',
    username: 'jalali',
    job_title: 'دبیر شیمی پایه و پیشرفته',
    subjects: ['شیمی'],
  },
  {
    id: 'staff-rahmani',
    display_name: 'دکتر مهدی رحمانی',
    username: 'mehdi_rahmani',
    job_title: 'دبیر و طراح فیزیک کنکور',
    subjects: ['فیزیک'],
  },
  {
    id: '15148e90-e32b-418f-a356-fa77867f86b2',
    display_name: 'دکتر مسعود کریمی',
    username: 'masoud_karimi',
    job_title: 'دبیر هندسه و گسسته',
    subjects: ['هندسه', 'ریاضیات گسسته'],
  },
  {
    id: 'staff-taghavi',
    display_name: 'دکتر علیرضا تقوی',
    username: 'alireza_taghavi',
    job_title: 'مدیریت و مدرس معارف',
    subjects: ['دین و زندگی', 'معارف اسلامی'],
  },
];

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
  const { user } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [options, setOptions] = useState({ schools: [], grades: [], teachers: [] });

  const [selectedStage, setSelectedStage] = useState('high');
  const [selectedGrade, setSelectedGrade] = useState('پایه دهم ریاضی');
  const [selectedSchool, setSelectedSchool] = useState('');
  const [customSchool, setCustomSchool] = useState('');
  const [isCustomSchool, setIsCustomSchool] = useState(false);
  const [selectedTeacherIds, setSelectedTeacherIds] = useState(new Set());

  // Quick add teacher
  const [showAddCustomTeacher, setShowAddCustomTeacher] = useState(false);
  const [newTeacherName, setNewTeacherName] = useState('');
  const [newTeacherSubject, setNewTeacherSubject] = useState('');

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
      if (Array.isArray(initialData.selected_teacher_ids) && initialData.selected_teacher_ids.length > 0) {
        setSelectedTeacherIds(new Set(initialData.selected_teacher_ids));
      }
    }
  }, [initialData]);

  const loadOptions = async () => {
    setLoading(true);
    let data = { schools: [], grades: [], teachers: [] };

    try {
      const res = await api.get('/auth/student-setup-options');
      if (res.data?.data) {
        data = res.data.data;
      }
    } catch (err) {
      console.warn('Could not fetch setup options from server, reading local cache:', err.message);
    }

    // 1. Merge locally registered schools if any
    try {
      const registered = JSON.parse(localStorage.getItem('registered_schools') || '[]');
      if (Array.isArray(registered) && registered.length > 0) {
        const existingNames = new Set((data.schools || []).map((s) => (s.name || '').trim()));
        for (const s of registered) {
          const cleanName = (s.name || s.school_name || '').trim();
          if (cleanName && !existingNames.has(cleanName)) {
            data.schools.unshift({
              id: s.school_code || s.id || cleanName,
              name: cleanName,
              code: s.school_code || s.code || '',
              city: s.city || 'ایران',
              is_registered: true,
            });
            existingNames.add(cleanName);
          }
        }
      }
    } catch (e) {}

    // Fallback default schools if empty
    if (!data.schools || data.schools.length === 0) {
      data.schools = [
        { id: 'sch-1', name: 'دبیرستان استعدادهای درخشان علامه حلی ۱ (تهران)', code: 'SCH-4821', city: 'تهران' },
        { id: 'sch-2', name: 'دبیرستان ماندگار البرز', code: 'SCH-1002', city: 'تهران' },
        { id: 'sch-3', name: 'دبیرستان هوشمند رشد', code: 'SCH-1003', city: 'تهران' },
      ];
    }

    // 2. Collect teachers from all local storage sources
    let localTeachers = [];
    try {
      const fromDb = JSON.parse(localStorage.getItem('school_teachers_database') || '[]');
      if (Array.isArray(fromDb)) localTeachers.push(...fromDb);
    } catch (e) {}

    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('mgmt_teachers_')) {
          const list = JSON.parse(localStorage.getItem(key) || '[]');
          if (Array.isArray(list)) localTeachers.push(...list);
        }
      }
    } catch (e) {}

    // Build unified map of teachers
    const allTeachersMap = new Map();

    // Add server teachers
    (data.teachers || []).forEach((t) => {
      if (!t) return;
      const tid = String(t.id || t.username || t.name);
      allTeachersMap.set(tid, {
        id: tid,
        display_name: t.display_name || t.name || 'دبیر محترم',
        username: t.username || '',
        job_title: t.job_title || t.subject || 'دبیر تخصصی',
        subjects: Array.isArray(t.subjects) && t.subjects.length > 0 ? t.subjects : [t.subject || t.job_title || 'دبیر تخصصی'],
        avatar_url: t.avatar_url || null,
      });
    });

    // Add local teachers
    localTeachers.forEach((t) => {
      if (!t) return;
      const tid = String(t.id || t.code || t.name);
      const cleanName = t.display_name || t.name || 'دبیر محترم';
      if (!allTeachersMap.has(tid)) {
        allTeachersMap.set(tid, {
          id: tid,
          display_name: cleanName,
          username: t.username || t.code || '',
          job_title: t.job_title || t.subject || 'دبیر تخصصی',
          subjects: Array.isArray(t.subjects) && t.subjects.length > 0 ? t.subjects : [t.subject || t.job_title || 'دبیر تخصصی'],
          avatar_url: t.avatar_url || null,
        });
      }
    });

    // If still empty, add default teachers
    if (allTeachersMap.size === 0) {
      DEFAULT_TEACHERS.forEach((t) => {
        allTeachersMap.set(String(t.id), t);
      });
    }

    const mergedTeachers = Array.from(allTeachersMap.values());
    data.teachers = mergedTeachers;
    setOptions(data);

    // School selection
    let cachedUser = null;
    try {
      cachedUser = JSON.parse(localStorage.getItem('cached_user') || 'null');
    } catch (e) {}

    const preferredSchool = initialData?.school_name || cachedUser?.school_name;
    if (preferredSchool) {
      setSelectedSchool(preferredSchool);
      setIsCustomSchool(false);
    } else if (!selectedSchool && data.schools?.length > 0) {
      setSelectedSchool(data.schools[0].name);
    }

    // Auto-select teachers if not already selected
    if ((!initialData?.selected_teacher_ids || initialData.selected_teacher_ids.length === 0) && selectedTeacherIds.size === 0) {
      setSelectedTeacherIds(new Set(mergedTeachers.map((t) => t.id)));
    }

    setLoading(false);
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

  const handleAddQuickTeacher = (e) => {
    if (e && e.preventDefault) e.preventDefault();
    const cleanName = newTeacherName.trim();
    if (!cleanName) {
      toast.error('لطفاً نام دبیر را وارد فرمایید');
      return;
    }
    const cleanSubject = newTeacherSubject.trim() || 'دبیر تخصصی';
    const newId = 'tch-custom-' + Date.now();
    const newT = {
      id: newId,
      display_name: cleanName,
      name: cleanName,
      username: '',
      job_title: cleanSubject,
      subjects: [cleanSubject],
    };

    setOptions((prev) => ({
      ...prev,
      teachers: [newT, ...prev.teachers],
    }));

    setSelectedTeacherIds((prev) => new Set([...prev, newId]));

    // Persist to local storage
    try {
      const code = user?.school_code || 'SCH-4821';
      const existing = JSON.parse(localStorage.getItem(`mgmt_teachers_${code}`) || '[]');
      existing.unshift(newT);
      localStorage.setItem(`mgmt_teachers_${code}`, JSON.stringify(existing));
      localStorage.setItem('school_teachers_database', JSON.stringify(existing));
    } catch (e) {}

    setNewTeacherName('');
    setNewTeacherSubject('');
    setShowAddCustomTeacher(false);
    toast.success(`دبیر «${cleanName}» با موفقیت اضافه و انتخاب شد ✨`);
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
    const teacherIdsArray = Array.from(selectedTeacherIds);

    // 1. Immediately update localStorage cached_user for 100% reliability
    let updatedUserLocal = null;
    try {
      const cached = JSON.parse(localStorage.getItem('cached_user') || 'null');
      if (cached) {
        let st = typeof cached.settings === 'string' ? JSON.parse(cached.settings) : (cached.settings || {});
        st.school_name = finalSchool;
        st.grade = selectedGrade;
        st.selected_teacher_ids = teacherIdsArray;
        st.is_onboarded = true;
        cached.settings = st;
        cached.department = selectedGrade;
        cached.school_name = finalSchool;
        localStorage.setItem('cached_user', JSON.stringify(cached));
        useAuthStore.setState({ user: cached });
        updatedUserLocal = cached;
      }
    } catch (e) {}

    // 2. Synchronize with Backend
    try {
      const res = await api.post('/auth/student-setup', {
        school_name: finalSchool,
        grade: selectedGrade,
        teacher_ids: teacherIdsArray,
      });

      const userFromServer = res.data?.data?.user || updatedUserLocal;
      if (userFromServer) {
        useAuthStore.setState({ user: userFromServer });
      }

      toast.success(res.data?.message || 'مشخصات و معلمان با موفقیت ذخیره شدند! 🎉');
      if (onSuccess) {
        onSuccess(userFromServer);
      }
      onClose();
    } catch (err) {
      console.warn('Backend student-setup failed, fallback to local state:', err.message);
      toast.success('مشخصات و معلمان منتخب شما ذخیره گردید 🎉');
      if (onSuccess && updatedUserLocal) {
        onSuccess(updatedUserLocal);
      }
      onClose();
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

                {/* Main Stages */}
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

                {/* Sub-Grades */}
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
                      <option key={sch.id || sch.name} value={sch.name}>
                        🏛️ {sch.name} {sch.code ? `[کد: ${sch.code}]` : ''} {sch.city ? `(${sch.city})` : ''} {sch.is_registered ? '✨ (مدرسه ثبت‌شده)' : ''}
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
                    <span>انتخاب معلمان و دبیران این ترم ({options.teachers.length} دبیر):</span>
                  </label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <button
                      type="button"
                      onClick={() => setShowAddCustomTeacher((prev) => !prev)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#6366f1',
                        fontSize: '0.8125rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      <HiOutlinePlus />
                      <span>{showAddCustomTeacher ? 'بستن فرم دبیر جدید' : 'افزودن نام معلم دیگر'}</span>
                    </button>
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
                </div>

                {/* Quick Add Custom Teacher Drawer/Box */}
                {showAddCustomTeacher && (
                  <div
                    style={{
                      background: 'rgba(99, 102, 241, 0.08)',
                      border: '1px dashed rgba(99, 102, 241, 0.4)',
                      borderRadius: 'var(--radius-xl)',
                      padding: '14px 16px',
                      marginBottom: '14px',
                      display: 'flex',
                      gap: '10px',
                      flexWrap: 'wrap',
                      alignItems: 'center',
                    }}
                  >
                    <input
                      type="text"
                      className="input"
                      placeholder="نام و نام‌خانوادگی دبیر (مثلاً: مهندس رضایی)..."
                      value={newTeacherName}
                      onChange={(e) => setNewTeacherName(e.target.value)}
                      style={{ flex: '1 1 200px', fontSize: '0.875rem' }}
                    />
                    <input
                      type="text"
                      className="input"
                      placeholder="نام درس (مثلاً: فیزیک یا هندسه)..."
                      value={newTeacherSubject}
                      onChange={(e) => setNewTeacherSubject(e.target.value)}
                      style={{ flex: '1 1 160px', fontSize: '0.875rem' }}
                    />
                    <button
                      type="button"
                      onClick={handleAddQuickTeacher}
                      className="btn btn-primary btn-sm"
                      style={{ fontWeight: 800 }}
                    >
                      <span>+ افزودن به لیست</span>
                    </button>
                  </div>
                )}

                <div className={styles.teachersGrid}>
                  {options.teachers.map((teacher) => {
                    const isSelected = selectedTeacherIds.has(teacher.id);
                    const teacherName = teacher.display_name || teacher.name || 'دبیر گرامی';
                    const teacherTitle = Array.isArray(teacher.subjects) && teacher.subjects.length > 0
                      ? teacher.subjects.join(' • ')
                      : (teacher.job_title || teacher.subject || 'دبیر تخصصی');
                    const initialLetter = teacherName.replace(/^استاد\s+|^دکتر\s+|^مهندس\s+|^سرکار\s+خانم\s+/, '').trim().charAt(0) || '👨‍🏫';

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
                          {initialLetter}
                        </div>

                        {/* Teacher Info */}
                        <div className={styles.teacherInfo}>
                          <div className={styles.teacherNameRow}>
                            <span className={styles.teacherName}>{teacherName}</span>
                            {teacher.username && (
                              <span className={styles.teacherHandle}>@{teacher.username}</span>
                            )}
                          </div>
                          <span className={styles.teacherSubject}>
                            📚 {teacherTitle}
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
