'use client';
import { useState, useEffect, useMemo } from 'react';
import useAuthStore from '../../../stores/authStore';
import toast from 'react-hot-toast';
import Link from 'next/link';
import {
  HiOutlineAcademicCap,
  HiOutlineBuildingOffice2,
  HiOutlinePlus,
  HiOutlineClipboardDocumentCheck,
  HiOutlineMagnifyingGlass,
  HiOutlinePencilSquare,
  HiOutlineTrash,
  HiOutlinePhone,
  HiOutlineIdentification,
  HiOutlineBookOpen,
  HiOutlineSquares2X2,
  HiOutlineTableCells,
  HiOutlineCheckCircle,
  HiOutlineArrowPath,
  HiOutlineXMark,
  HiOutlineUsers,
  HiOutlineUserGroup,
} from 'react-icons/hi2';
import styles from './teachers.module.css';

const DEFAULT_SUBJECTS = [
  'ریاضی و هندسه',
  'حسابان و دیفرانسیل',
  'فیزیک',
  'شیمی',
  'زیست‌شناسی و ژنتیک',
  'ادبیات فارسی',
  'زبان انگلیسی',
  'عربی',
  'دین و زندگی',
  'تاریخ و جغرافیا',
  'فلسفه و منطق',
  'مشاوره و سلامت روان',
  'کامپیوتر و هوش مصنوعی',
  'هنر و رسانه',
];

const ALL_GRADES = [
  'پایه دهم',
  'پایه یازدهم',
  'پایه دوازدهم',
  'پایه نهم',
  'پایه هشتم',
  'پایه هفتم',
];

export default function TeachersDatabasePage() {
  const { user } = useAuthStore();
  const [loading, setLoading] = useState(true);

  // School Identity
  const [schoolData, setSchoolData] = useState({
    name: 'مجتمع آموزشی هوشمند علامه حلی',
    code: 'SCH-4821',
    principal: 'دکتر تقوی',
  });

  // Teachers State
  const [teachers, setTeachers] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSubjectFilter, setSelectedSubjectFilter] = useState('all');
  const [selectedGradeFilter, setSelectedGradeFilter] = useState('all');
  const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'table'

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTeacher, setEditingTeacher] = useState(null);
  const [teacherForm, setTeacherForm] = useState({
    name: '',
    code: '',
    subject: 'ریاضی و هندسه',
    customSubject: '',
    phone: '',
    personnel_code: '',
    grades: ['پایه دهم', 'پایه یازدهم'],
    status: 'active',
  });

  // ── 1. Load Data on Mount ──
  useEffect(() => {
    let currentCode = user?.school_code || 'SCH-4821';
    let currentName = user?.school_name || 'مجتمع آموزشی هوشمند علامه حلی';
    let principalName = user?.display_name || user?.name || 'دکتر تقوی';

    try {
      const savedSchools = JSON.parse(localStorage.getItem('registered_schools') || '[]');
      if (savedSchools.length > 0) {
        const matched = savedSchools.find((s) => s.school_code === currentCode) || savedSchools[0];
        if (matched) {
          currentCode = matched.school_code;
          currentName = matched.school_name;
          principalName = matched.admin_name || principalName;
        }
      }
    } catch (e) {}

    setSchoolData({
      name: currentName,
      code: currentCode,
      principal: principalName,
    });

    // Load Teachers from persistent storage
    const storageKey = `mgmt_teachers_${currentCode}`;
    const saved = localStorage.getItem(storageKey);
    if (saved) {
      try {
        setTeachers(JSON.parse(saved));
      } catch (e) {}
    } else {
      // Default initial seeds
      const initialSeed = [
        {
          id: 'tch-101',
          name: 'مهندس حسین میرزایی',
          code: 'TCH-101',
          subject: 'ریاضی و هندسه',
          phone: '09121110002',
          personnel_code: '984021',
          grades: ['پایه دهم', 'پایه یازدهم'],
          status: 'active',
          classes_count: 2,
        },
        {
          id: 'tch-102',
          name: 'دکتر فاطمه صادقی',
          code: 'TCH-102',
          subject: 'زیست‌شناسی و ژنتیک',
          phone: '09121110003',
          personnel_code: '984022',
          grades: ['پایه دهم', 'پایه دوازدهم'],
          status: 'active',
          classes_count: 1,
        },
        {
          id: 'tch-103',
          name: 'استاد مسعود اکبری',
          code: 'TCH-103',
          subject: 'فیزیک',
          phone: '09121110004',
          personnel_code: '984023',
          grades: ['پایه یازدهم', 'پایه دوازدهم'],
          status: 'active',
          classes_count: 2,
        },
        {
          id: 'tch-104',
          name: 'سرکار خانم مهندس جلالی',
          code: 'TCH-104',
          subject: 'شیمی',
          phone: '09121110005',
          personnel_code: '984024',
          grades: ['پایه دهم', 'پایه یازدهم', 'پایه دوازدهم'],
          status: 'active',
          classes_count: 1,
        },
        {
          id: 'tch-105',
          name: 'دکتر مهدی رحمانی',
          code: 'TCH-105',
          subject: 'مشاوره و سلامت روان',
          phone: '09121110006',
          personnel_code: '984025',
          grades: ['پایه دوازدهم'],
          status: 'active',
          classes_count: 1,
        },
      ];
      setTeachers(initialSeed);
      saveTeachersToStorage(initialSeed, currentCode);
    }

    setLoading(false);
  }, [user]);

  // Save to storage and sync database across system
  const saveTeachersToStorage = (newList, code = schoolData.code) => {
    try {
      localStorage.setItem(`mgmt_teachers_${code}`, JSON.stringify(newList));
      localStorage.setItem('school_teachers_database', JSON.stringify(newList));
    } catch (e) {
      console.error('Storage error:', e);
    }
  };

  // Copy School Code
  const copySchoolCode = () => {
    navigator.clipboard.writeText(schoolData.code);
    toast.success(`کد اختصاصی مدرسه (${schoolData.code}) کپی شد 📋`);
  };

  // Copy Teacher Code
  const copyTeacherCode = (code, teacherName) => {
    navigator.clipboard.writeText(code);
    toast.success(`کد اختصاصی «${teacherName}» (${code}) کپی شد ✅`);
  };

  // ── Open Add Modal ──
  const handleOpenAddModal = () => {
    setEditingTeacher(null);
    const nextNum = teachers.length + 101;
    setTeacherForm({
      name: '',
      code: `TCH-${nextNum}`,
      subject: 'ریاضی و هندسه',
      customSubject: '',
      phone: '',
      personnel_code: '',
      grades: ['پایه دهم'],
      status: 'active',
    });
    setIsModalOpen(true);
  };

  // ── Open Edit Modal ──
  const handleOpenEditModal = (teacher) => {
    setEditingTeacher(teacher);
    const isStandard = DEFAULT_SUBJECTS.includes(teacher.subject);
    setTeacherForm({
      name: teacher.name || '',
      code: teacher.code || '',
      subject: isStandard ? teacher.subject : 'سایر',
      customSubject: isStandard ? '' : teacher.subject,
      phone: teacher.phone || '',
      personnel_code: teacher.personnel_code || '',
      grades: teacher.grades || ['پایه دهم'],
      status: teacher.status || 'active',
    });
    setIsModalOpen(true);
  };

  // ── Toggle Grade Selection in Form ──
  const handleToggleGrade = (grade) => {
    let current = [...teacherForm.grades];
    if (current.includes(grade)) {
      current = current.filter((g) => g !== grade);
      if (current.length === 0) current = [grade];
    } else {
      current.push(grade);
    }
    setTeacherForm({ ...teacherForm, grades: current });
  };

  // ── Save Teacher (Add or Edit) ──
  const handleSaveTeacher = (e) => {
    e.preventDefault();
    const cleanName = teacherForm.name.trim();
    if (!cleanName) {
      toast.error('لطفاً نام و نام‌خانوادگی دبیر را وارد فرمایید');
      return;
    }

    // Auto-generate code if empty
    const cleanCode = teacherForm.code.trim().toUpperCase() || `TCH-${teachers.length + 101}`;

    const finalSubject =
      teacherForm.subject === 'سایر'
        ? teacherForm.customSubject.trim() || 'عمومی'
        : teacherForm.subject;

    const cleanPhone = teacherForm.phone.trim() || 'ثبت نشده';
    const cleanPersonnel = teacherForm.personnel_code.trim() || '---';

    if (editingTeacher) {
      // Update existing
      const updatedList = teachers.map((t) => {
        if (t.id === editingTeacher.id) {
          return {
            ...t,
            name: cleanName,
            code: cleanCode,
            subject: finalSubject,
            phone: cleanPhone,
            personnel_code: cleanPersonnel,
            grades: teacherForm.grades && teacherForm.grades.length > 0 ? teacherForm.grades : ['پایه دهم'],
            status: teacherForm.status || 'active',
          };
        }
        return t;
      });

      setTeachers(updatedList);
      saveTeachersToStorage(updatedList);
      toast.success(`اطلاعات دبیر «${cleanName}» با موفقیت در دیتابیس بروزرسانی شد ✨`);
    } else {
      // Add new
      const newTeacherObj = {
        id: `tch-${Date.now()}`,
        name: cleanName,
        code: cleanCode,
        subject: finalSubject,
        phone: cleanPhone,
        personnel_code: cleanPersonnel,
        grades: teacherForm.grades && teacherForm.grades.length > 0 ? teacherForm.grades : ['پایه دهم'],
        status: teacherForm.status || 'active',
        classes_count: 0,
      };

      const updatedList = [newTeacherObj, ...teachers];
      setTeachers(updatedList);
      saveTeachersToStorage(updatedList);
      toast.success(`دبیر «${newTeacherObj.name}» با کد ${newTeacherObj.code} به دیتابیس مدرسه افزوده شد 🎉`);
    }

    setIsModalOpen(false);
  };

  // ── Delete Teacher ──
  const handleDeleteTeacher = (id, name) => {
    if (!window.confirm(`آیا از حذف دبیر «${name}» از دیتابیس مدرسه اطمینان دارید؟`)) return;
    const updatedList = teachers.filter((t) => t.id !== id);
    setTeachers(updatedList);
    saveTeachersToStorage(updatedList);
    toast.success(`دبیر «${name}» از دیتابیس حذف شد.`);
  };

  // ── Reset to Standard Seed ──
  const handleResetToSeed = () => {
    if (!window.confirm('آیا مایلید دیتابیس معلمان را با ۵ دبیر نمونه استاندارد بازنشانی کنید؟')) return;
    const defaultSeed = [
      {
        id: 'tch-101',
        name: 'مهندس حسین میرزایی',
        code: 'TCH-101',
        subject: 'ریاضی و هندسه',
        phone: '09121110002',
        personnel_code: '984021',
        grades: ['پایه دهم', 'پایه یازدهم'],
        status: 'active',
        classes_count: 2,
      },
      {
        id: 'tch-102',
        name: 'دکتر فاطمه صادقی',
        code: 'TCH-102',
        subject: 'زیست‌شناسی و ژنتیک',
        phone: '09121110003',
        personnel_code: '984022',
        grades: ['پایه دهم', 'پایه دوازدهم'],
        status: 'active',
        classes_count: 1,
      },
      {
        id: 'tch-103',
        name: 'استاد مسعود اکبری',
        code: 'TCH-103',
        subject: 'فیزیک',
        phone: '09121110004',
        personnel_code: '984023',
        grades: ['پایه یازدهم', 'پایه دوازدهم'],
        status: 'active',
        classes_count: 2,
      },
      {
        id: 'tch-104',
        name: 'سرکار خانم مهندس جلالی',
        code: 'TCH-104',
        subject: 'شیمی',
        phone: '09121110005',
        personnel_code: '984024',
        grades: ['پایه دهم', 'پایه یازدهم', 'پایه دوازدهم'],
        status: 'active',
        classes_count: 1,
      },
      {
        id: 'tch-105',
        name: 'دکتر مهدی رحمانی',
        code: 'TCH-105',
        subject: 'مشاوره و سلامت روان',
        phone: '09121110006',
        personnel_code: '984025',
        grades: ['پایه دوازدهم'],
        status: 'active',
        classes_count: 1,
      },
    ];
    setTeachers(defaultSeed);
    saveTeachersToStorage(defaultSeed);
    toast.success('دیتابیس معلمان با موفقیت بازنشانی شد.');
  };

  // ── Filtered Teachers ──
  const filteredTeachers = useMemo(() => {
    return teachers.filter((t) => {
      // Search
      const matchesSearch =
        !searchQuery.trim() ||
        t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (t.subject && t.subject.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (t.phone && t.phone.includes(searchQuery));

      // Subject Filter
      const matchesSubject =
        selectedSubjectFilter === 'all' || t.subject === selectedSubjectFilter;

      // Grade Filter
      const matchesGrade =
        selectedGradeFilter === 'all' ||
        (Array.isArray(t.grades) && t.grades.includes(selectedGradeFilter));

      return matchesSearch && matchesSubject && matchesGrade;
    });
  }, [teachers, searchQuery, selectedSubjectFilter, selectedGradeFilter]);

  // Unique subjects currently in DB
  const availableSubjectsInDB = useMemo(() => {
    const set = new Set();
    teachers.forEach((t) => {
      if (t.subject) set.add(t.subject);
    });
    return Array.from(set);
  }, [teachers]);

  return (
    <div className={styles.container} dir="rtl">
      {/* ── 1. Top Header: School Identification ── */}
      <div className={styles.header}>
        <div>
          <h1 className={styles.headerTitle}>
            <HiOutlineAcademicCap style={{ color: '#6366f1' }} />
            ثبت و دیتابیس جامع معلمان مدرسه
          </h1>
          <p className={styles.headerSubtitle}>
            بانک اطلاعات رسمی معلمان مجتمع «{schoolData.name}» | تخصیص کدهای اختصاصی، دروس تخصصی و اتصال خودکار به سایر بخش‌ها
          </p>
        </div>

        <div className={styles.schoolCodeBadge}>
          <div>
            <span className={styles.schoolCodeLabel}>کد اختصاصی مدرسه:</span>
            <span className={styles.schoolCodeText}>{schoolData.code}</span>
          </div>
          <button className={styles.copyBtn} onClick={copySchoolCode} title="کپی کد مدرسه">
            <HiOutlineClipboardDocumentCheck style={{ fontSize: '1.1rem' }} />
            کپی کد
          </button>
        </div>
      </div>

      {/* ── 2. KPI Metrics ── */}
      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <div className={styles.statIcon} style={{ background: 'rgba(99, 102, 241, 0.15)', color: '#6366f1' }}>
            <HiOutlineUsers />
          </div>
          <div className={styles.statInfo}>
            <span className={styles.statLabel}>کل معلمان ثبت‌شده</span>
            <span className={styles.statValue}>{teachers.length} دبیر</span>
          </div>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statIcon} style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#10b981' }}>
            <HiOutlineBookOpen />
          </div>
          <div className={styles.statInfo}>
            <span className={styles.statLabel}>دروس و تخصص‌های فعال</span>
            <span className={styles.statValue}>{availableSubjectsInDB.length} رشته</span>
          </div>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statIcon} style={{ background: 'rgba(14, 165, 233, 0.15)', color: '#0ea5e9' }}>
            <HiOutlineBuildingOffice2 />
          </div>
          <div className={styles.statInfo}>
            <span className={styles.statLabel}>اتصال به کلاس‌ها و کارنامه‌ها</span>
            <span className={styles.statValue} style={{ fontSize: '1.1rem', color: '#0284c7' }}>
              ✓ متصل و هماهنگ
            </span>
          </div>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statIcon} style={{ background: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b' }}>
            <HiOutlineCheckCircle />
          </div>
          <div className={styles.statInfo}>
            <span className={styles.statLabel}>کادر حاضر و فعال</span>
            <span className={styles.statValue}>
              {teachers.filter((t) => t.status === 'active').length} نفر
            </span>
          </div>
        </div>
      </div>

      {/* ── 3. Controls Bar: Search, Filters, Modes & Add Button ── */}
      <div className={styles.controlBar}>
        <div className={styles.filterGroup}>
          {/* Search Box */}
          <div className={styles.searchBox}>
            <HiOutlineMagnifyingGlass className={styles.searchIcon} />
            <input
              type="text"
              className={styles.searchInput}
              placeholder="جستجوی نام دبیر، کد اختصاصی (TCH) یا شماره تماس..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          {/* Subject Filter */}
          <select
            className={styles.filterSelect}
            value={selectedSubjectFilter}
            onChange={(e) => setSelectedSubjectFilter(e.target.value)}
          >
            <option value="all">📚 همه دروس تخصصی</option>
            {availableSubjectsInDB.map((sub) => (
              <option key={sub} value={sub}>
                {sub}
              </option>
            ))}
          </select>

          {/* Grade Filter */}
          <select
            className={styles.filterSelect}
            value={selectedGradeFilter}
            onChange={(e) => setSelectedGradeFilter(e.target.value)}
          >
            <option value="all">🎓 همه پایه‌های تحصیلی</option>
            {ALL_GRADES.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.btnGroup}>
          {/* View Mode Toggle */}
          <div className={styles.viewModeToggle}>
            <button
              className={`${styles.viewModeBtn} ${viewMode === 'grid' ? styles.viewModeBtnActive : ''}`}
              onClick={() => setViewMode('grid')}
              title="نمای کارتی"
            >
              <HiOutlineSquares2X2 />
            </button>
            <button
              className={`${styles.viewModeBtn} ${viewMode === 'table' ? styles.viewModeBtnActive : ''}`}
              onClick={() => setViewMode('table')}
              title="نمای جدولی"
            >
              <HiOutlineTableCells />
            </button>
          </div>

          {/* Reset Seed Button */}
          <button
            onClick={handleResetToSeed}
            className={styles.cardActionBtn}
            title="بازنشانی معلمان استاندارد"
          >
            <HiOutlineArrowPath />
            بازنشانی
          </button>

          {/* Add Teacher Button */}
          <button className={styles.primaryAddBtn} onClick={handleOpenAddModal}>
            <HiOutlinePlus style={{ fontSize: '1.15rem' }} />
            ثبت معلم جدید در دیتابیس
          </button>
        </div>
      </div>

      {/* ── 4. Main Teachers Content ── */}
      {filteredTeachers.length > 0 ? (
        viewMode === 'grid' ? (
          /* ── GRID CARDS VIEW ── */
          <div className={styles.teachersGrid}>
            {filteredTeachers.map((teacher) => (
              <div key={teacher.id} className={styles.teacherCard}>
                <div className={styles.teacherCardHeader}>
                  <div className={styles.teacherAvatarSection}>
                    <div className={styles.teacherAvatar}>{teacher.name.charAt(0)}</div>
                    <div>
                      <div className={styles.teacherName}>{teacher.name}</div>
                      <div className={styles.teacherSubject}>
                        <HiOutlineBookOpen />
                        <span>{teacher.subject}</span>
                      </div>
                    </div>
                  </div>

                  <span
                    className={styles.teacherCodeBadge}
                    onClick={() => copyTeacherCode(teacher.code, teacher.name)}
                    title="کلیک برای کپی کد اختصاصی"
                  >
                    <span>{teacher.code}</span>
                    <HiOutlineClipboardDocumentCheck style={{ fontSize: '1rem' }} />
                  </span>
                </div>

                <div className={styles.teacherDetailsList}>
                  <div className={styles.teacherDetailItem}>
                    <span className={styles.teacherDetailLabel}>
                      <HiOutlinePhone />
                      شماره تماس:
                    </span>
                    <span style={{ fontFamily: 'monospace', direction: 'ltr' }}>{teacher.phone}</span>
                  </div>

                  <div className={styles.teacherDetailItem}>
                    <span className={styles.teacherDetailLabel}>
                      <HiOutlineIdentification />
                      کد پرسنلی:
                    </span>
                    <span style={{ fontFamily: 'monospace' }}>{teacher.personnel_code || '---'}</span>
                  </div>

                  <div className={styles.teacherDetailItem}>
                    <span className={styles.teacherDetailLabel}>
                      <HiOutlineAcademicCap />
                      پایه‌های تدریس:
                    </span>
                  </div>
                  <div className={styles.teacherGradesList}>
                    {Array.isArray(teacher.grades) && teacher.grades.length > 0 ? (
                      teacher.grades.map((grade) => (
                        <span key={grade} className={styles.gradeChip}>
                          {grade}
                        </span>
                      ))
                    ) : (
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>تعیین نشده</span>
                    )}
                  </div>
                </div>

                <div className={styles.teacherCardFooter}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Link
                      href="/dashboard/management"
                      className={styles.cardActionBtn}
                      title="مشاهده کلاس‌های متصل در ستاد مدیریت"
                    >
                      <HiOutlineBuildingOffice2 />
                      مدیریت کلاس‌ها
                    </Link>

                    <button
                      className={styles.cardActionBtn}
                      onClick={() => handleOpenEditModal(teacher)}
                      title="ویرایش مشخصات دبیر"
                    >
                      <HiOutlinePencilSquare />
                      ویرایش
                    </button>
                  </div>

                  <button
                    className={styles.deleteBtn}
                    onClick={() => handleDeleteTeacher(teacher.id, teacher.name)}
                    title="حذف از دیتابیس"
                  >
                    <HiOutlineTrash />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* ── TABLE VIEW ── */
          <div className={styles.tableWrapper}>
            <table className={styles.teachersTable}>
              <thead>
                <tr>
                  <th>نام و نام خانوادگی</th>
                  <th>کد اختصاصی (TCH)</th>
                  <th>درس تخصصی</th>
                  <th>شماره همراه</th>
                  <th>کد پرسنلی</th>
                  <th>پایه‌های تدریس</th>
                  <th>عملیات</th>
                </tr>
              </thead>
              <tbody>
                {filteredTeachers.map((teacher) => (
                  <tr key={teacher.id}>
                    <td style={{ fontWeight: 800 }}>{teacher.name}</td>
                    <td>
                      <span
                        className={styles.teacherCodeBadge}
                        onClick={() => copyTeacherCode(teacher.code, teacher.name)}
                        title="کلیک برای کپی"
                        style={{ padding: '3px 8px', fontSize: '0.78rem' }}
                      >
                        {teacher.code}
                      </span>
                    </td>
                    <td style={{ fontWeight: 650, color: 'var(--text-secondary)' }}>{teacher.subject}</td>
                    <td style={{ fontFamily: 'monospace', direction: 'ltr', textAlign: 'right' }}>
                      {teacher.phone}
                    </td>
                    <td style={{ fontFamily: 'monospace' }}>{teacher.personnel_code || '---'}</td>
                    <td>
                      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                        {Array.isArray(teacher.grades) &&
                          teacher.grades.map((g) => (
                            <span key={g} className={styles.gradeChip}>
                              {g}
                            </span>
                          ))}
                      </div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <button
                          className={styles.cardActionBtn}
                          onClick={() => handleOpenEditModal(teacher)}
                          title="ویرایش"
                          style={{ padding: '4px 8px' }}
                        >
                          <HiOutlinePencilSquare />
                        </button>
                        <button
                          className={styles.deleteBtn}
                          onClick={() => handleDeleteTeacher(teacher.id, teacher.name)}
                          title="حذف"
                        >
                          <HiOutlineTrash />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : (
        /* ── EMPTY STATE ── */
        <div className={styles.emptyState}>
          <HiOutlineAcademicCap className={styles.emptyStateIcon} />
          <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
            معلمی با این مشخصات در دیتابیس یافت نشد
          </h3>
          <p style={{ fontSize: '0.875rem', maxWidth: '420px', lineHeight: 1.6 }}>
            می‌توانید فیلترهای جستجو را پاک کرده یا با زدن دکمه زیر، معلم جدیدی را به دیتابیس مدرسه اضافه نمایید.
          </p>
          <button className={styles.primaryAddBtn} onClick={handleOpenAddModal} style={{ marginTop: '8px' }}>
            <HiOutlinePlus style={{ fontSize: '1.15rem' }} />
            ثبت اولین دبیر در دیتابیس
          </button>
        </div>
      )}

      {/* ── MODAL: Add / Edit Teacher ── */}
      {isModalOpen && (
        <div
          className={styles.modalOverlay}
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsModalOpen(false);
          }}
        >
          <div className={styles.modalDialog} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>
                <HiOutlineAcademicCap style={{ color: '#6366f1' }} />
                {editingTeacher ? `ویرایش مشخصات دبیر: ${editingTeacher.name}` : 'ثبت معلم جدید در دیتابیس مدرسه'}
              </h3>
              <button
                type="button"
                className={styles.modalCloseBtn}
                onClick={() => setIsModalOpen(false)}
                aria-label="بستن"
              >
                <HiOutlineXMark />
              </button>
            </div>

            <form onSubmit={handleSaveTeacher} noValidate style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Full Name */}
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>نام و نام خانوادگی دبیر *</label>
                <input
                  type="text"
                  className={styles.formInput}
                  placeholder="مثلاً: دکتر علی رضایی یا مهندس زهرا باقری"
                  value={teacherForm.name}
                  onChange={(e) => setTeacherForm({ ...teacherForm, name: e.target.value })}
                  autoFocus
                />
              </div>

              {/* Code & Personnel Code */}
              <div className={styles.modalRow2Col}>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>کد اختصاصی دبیر در مدرسه (TCH)</label>
                  <input
                    type="text"
                    className={styles.formInput}
                    style={{ fontFamily: 'monospace', letterSpacing: '1px' }}
                    placeholder="مثال: TCH-106 (خودکار)"
                    value={teacherForm.code}
                    onChange={(e) => setTeacherForm({ ...teacherForm, code: e.target.value })}
                  />
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>شماره پرسنلی / شناسه ملی</label>
                  <input
                    type="text"
                    className={styles.formInput}
                    placeholder="مثلاً: 984021"
                    value={teacherForm.personnel_code}
                    onChange={(e) => setTeacherForm({ ...teacherForm, personnel_code: e.target.value })}
                  />
                </div>
              </div>

              {/* Subject & Phone */}
              <div className={styles.modalRow2Col}>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>درس / رشته تخصصی *</label>
                  <select
                    className={styles.formSelect}
                    value={teacherForm.subject}
                    onChange={(e) => setTeacherForm({ ...teacherForm, subject: e.target.value })}
                  >
                    {DEFAULT_SUBJECTS.map((sub) => (
                      <option key={sub} value={sub}>
                        {sub}
                      </option>
                    ))}
                    <option value="سایر">سایر دروس (وارد کردن دستی)...</option>
                  </select>
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>شماره تماس همراه دبیر</label>
                  <input
                    type="tel"
                    className={styles.formInput}
                    placeholder="09123456789"
                    value={teacherForm.phone}
                    onChange={(e) => setTeacherForm({ ...teacherForm, phone: e.target.value })}
                    dir="ltr"
                  />
                </div>
              </div>

              {teacherForm.subject === 'سایر' && (
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>عنوان درس سفارشی *</label>
                  <input
                    type="text"
                    className={styles.formInput}
                    placeholder="عنوان درس را بنویسید..."
                    value={teacherForm.customSubject}
                    onChange={(e) => setTeacherForm({ ...teacherForm, customSubject: e.target.value })}
                  />
                </div>
              )}

              {/* Grades Checkbox */}
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>پایه‌های تحصیلی تحت پوشش تدریس:</label>
                <div className={styles.gradesCheckboxGrid}>
                  {ALL_GRADES.map((grade) => {
                    const isChecked = teacherForm.grades.includes(grade);
                    return (
                      <label key={grade} className={styles.gradeCheckboxLabel}>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleToggleGrade(grade)}
                        />
                        <span>{grade}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className={styles.modalFooter}>
                <button type="button" className={styles.modalCancelBtn} onClick={() => setIsModalOpen(false)}>
                  انصراف
                </button>
                <button type="submit" className={styles.modalSubmitBtn}>
                  {editingTeacher ? 'ذخیره تغییرات دبیر' : 'ثبت قطعی در دیتابیس معلمان'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
