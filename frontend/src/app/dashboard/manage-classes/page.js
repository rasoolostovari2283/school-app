'use client';
import { useState, useEffect, useMemo } from 'react';
import useAuthStore from '../../../stores/authStore';
import api from '../../../lib/api';
import toast from 'react-hot-toast';
import Link from 'next/link';
import {
  HiOutlineUserGroup,
  HiOutlineAcademicCap,
  HiOutlineBuildingOffice2,
  HiOutlinePlus,
  HiOutlineClipboardDocumentCheck,
  HiOutlineMagnifyingGlass,
  HiOutlinePencilSquare,
  HiOutlineTrash,
  HiOutlinePhone,
  HiOutlineIdentification,
  HiOutlineSquares2X2,
  HiOutlineTableCells,
  HiOutlineCheckCircle,
  HiOutlineXMark,
  HiOutlineUsers,
  HiOutlineBookOpen,
  HiOutlineArrowPath,
} from 'react-icons/hi2';
import styles from './manage-classes.module.css';

const GRADES_LIST = [
  'پایه دهم',
  'پایه یازدهم',
  'پایه دوازدهم',
  'پایه نهم',
  'پایه هشتم',
  'پایه هفتم',
];

const MAJORS_LIST = [
  'ریاضی و فیزیک',
  'علوم تجربی',
  'ادبیات و علوم انسانی',
  'علوم و معارف اسلامی',
  'فنی و حرفه‌ای / کاردانش',
  'عمومی',
];

export default function ManageClassesPage() {
  const { user } = useAuthStore();
  const [loading, setLoading] = useState(true);

  // School Identity
  const [schoolData, setSchoolData] = useState({
    name: 'مدرسه من',
    code: 'SCH-1001',
    principal: '',
  });

  // State
  const [teachers, setTeachers] = useState([]);
  const [students, setStudents] = useState([]);
  const [classes, setClasses] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGradeFilter, setSelectedGradeFilter] = useState('all');
  const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'table'

  // Modals
  const [isClassModalOpen, setIsClassModalOpen] = useState(false);
  const [editingClass, setEditingClass] = useState(null);
  const [classForm, setClassForm] = useState({
    name: '',
    grade: 'پایه دهم',
    major: 'ریاضی و فیزیک',
    teacher_id: '',
    room: 'اتاق ۱۰۱',
    selectedStudentIds: [],
  });

  // Roster Management Modal (دانش‌آموزان این کلاس)
  const [selectedClassForRoster, setSelectedClassForRoster] = useState(null);
  const [newStudentQuickForm, setNewStudentQuickForm] = useState({
    name: '',
    code: '',
    parent_phone: '',
  });

  // ── 1. Load Data on Mount ──
  useEffect(() => {
    const userSettings = (() => {
      try {
        return typeof user?.settings === 'string' ? JSON.parse(user.settings) : (user?.settings || {});
      } catch (e) {
        return {};
      }
    })();

    let currentCode = user?.school_code || userSettings?.school_code || 'SCH-1001';
    let currentName = user?.school_name || userSettings?.school_name || (userSettings?.schools?.[0]) || 'مدرسه من';
    let principalName = user?.display_name || user?.name || 'مدیر / دبیر گرامی';

    try {
      const lastReg = JSON.parse(localStorage.getItem('last_registered_school') || 'null');
      if (lastReg && (lastReg.school_code || lastReg.code)) {
        currentCode = lastReg.school_code || lastReg.code;
        currentName = lastReg.name || lastReg.school_name || currentName;
        principalName = lastReg.principal || lastReg.admin_name || principalName;
      }

      const savedSchools = JSON.parse(localStorage.getItem('registered_schools') || '[]');
      if (savedSchools.length > 0) {
        const matched = savedSchools.find((s) => (s.school_code || s.code) === currentCode) || (!currentCode ? savedSchools[0] : null);
        if (matched) {
          currentCode = matched.school_code || matched.code || currentCode;
          currentName = matched.name || matched.school_name || currentName;
          principalName = matched.admin_name || matched.principal || principalName;
        }
      }
    } catch (e) {}

    setSchoolData({
      name: currentName,
      code: currentCode,
      principal: principalName,
    });

    const isDummyTeacher = (t) => ['tch-101', 'tch-102', 'tch-103', 'tch-104', 'tch-105'].includes(t.id);
    const isDummyStudent = (s) => ['std-1', 'std-2', 'std-3', 'std-4', 'std-5', 'std-6', 'std-7'].includes(s.id);
    const isDummyClass = (c) => ['cls-1', 'cls-2', 'cls-3', 'cls-4', 'cls-5'].includes(c.id);

    // 1. Load Teachers from LocalStorage as fallback
    let loadedTeachers = [];
    try {
      const savedTch =
        localStorage.getItem(`mgmt_teachers_${currentCode}`) ||
        localStorage.getItem('school_teachers_database');
      if (savedTch) loadedTeachers = JSON.parse(savedTch);
    } catch (e) {}

    loadedTeachers = Array.isArray(loadedTeachers) ? loadedTeachers.filter((t) => !isDummyTeacher(t)) : [];

    if (user && user.role === 'teacher' && loadedTeachers.length === 0) {
      loadedTeachers = [
        {
          id: user.id || 'tch-current',
          name: user.display_name || 'دبیر گرامی',
          code: user.personnel_code || 'TCH-01',
          subject: user.job_title || userSettings?.subject || 'دبیر تخصصی',
          phone: user.phone || '',
        },
      ];
    }
    setTeachers(loadedTeachers);

    // 2. Load Students from LocalStorage as fallback
    let loadedStudents = [];
    try {
      const savedStd = localStorage.getItem(`mgmt_students_${currentCode}`);
      if (savedStd) loadedStudents = JSON.parse(savedStd);
    } catch (e) {}

    loadedStudents = Array.isArray(loadedStudents) ? loadedStudents.filter((s) => !isDummyStudent(s)) : [];
    setStudents(loadedStudents);

    // 3. Load Classes from LocalStorage as fallback
    let loadedClasses = [];
    try {
      const savedCls =
        localStorage.getItem(`mgmt_classes_${currentCode}`) ||
        localStorage.getItem('school_classes_database');
      if (savedCls) loadedClasses = JSON.parse(savedCls);
    } catch (e) {}

    loadedClasses = Array.isArray(loadedClasses) ? loadedClasses.filter((c) => !isDummyClass(c)) : [];
    setClasses(loadedClasses);

    // ── Fetch Fresh Data Directly From SQLite Database ──
    Promise.allSettled([
      api.get('/classes'),
      api.get('/school/members'),
      api.get('/school/info'),
    ]).then(([classesRes, membersRes, infoRes]) => {
      // Classes from DB
      if (classesRes.status === 'fulfilled' && classesRes.value?.data?.success && classesRes.value?.data?.data?.classes) {
        const dbClasses = classesRes.value.data.data.classes;
        if (Array.isArray(dbClasses) && dbClasses.length > 0) {
          setClasses(dbClasses);
          try {
            localStorage.setItem(`mgmt_classes_${currentCode}`, JSON.stringify(dbClasses));
            localStorage.setItem('school_classes_database', JSON.stringify(dbClasses));
          } catch (e) {}
        }
      }

      // Members (Teachers & Students) from DB
      if (membersRes.status === 'fulfilled' && membersRes.value?.data?.success && membersRes.value?.data?.data) {
        const { teachers: dbTeachers, students: dbStudents } = membersRes.value.data.data;
        if (Array.isArray(dbTeachers) && dbTeachers.length > 0) {
          setTeachers(dbTeachers);
          try {
            localStorage.setItem(`mgmt_teachers_${currentCode}`, JSON.stringify(dbTeachers));
            localStorage.setItem('school_teachers_database', JSON.stringify(dbTeachers));
          } catch (e) {}
        }
        if (Array.isArray(dbStudents) && dbStudents.length > 0) {
          setStudents(dbStudents);
          try {
            localStorage.setItem(`mgmt_students_${currentCode}`, JSON.stringify(dbStudents));
          } catch (e) {}
        }
      }

      // School info
      if (infoRes.status === 'fulfilled' && infoRes.value?.data?.success && infoRes.value?.data?.data) {
        const dbInfo = infoRes.value.data.data;
        setSchoolData((prev) => ({
          ...prev,
          name: dbInfo.name || prev.name,
          code: dbInfo.code || prev.code,
          principal: dbInfo.principal || prev.principal,
        }));
      }

      setLoading(false);
    }).catch(() => {
      setLoading(false);
    });
  }, [user]);

  // Save Classes and Sync
  const saveClassesToStorage = (newList, code = schoolData.code) => {
    try {
      localStorage.setItem(`mgmt_classes_${code}`, JSON.stringify(newList));
      localStorage.setItem('school_classes_database', JSON.stringify(newList));
    } catch (e) {}
  };

  // Save Students and Sync
  const saveStudentsToStorage = (newList, code = schoolData.code) => {
    try {
      localStorage.setItem(`mgmt_students_${code}`, JSON.stringify(newList));
    } catch (e) {}
  };

  // Helper: Get students enrolled in a class
  const getStudentsForClass = (className) => {
    return students.filter((s) => s.class_name === className);
  };

  // Copy School Code
  const copySchoolCode = () => {
    navigator.clipboard.writeText(schoolData.code);
    toast.success(`کد اختصاصی مدرسه (${schoolData.code}) کپی شد 📋`);
  };

  // ── Open Add Class Modal ──
  const handleOpenAddModal = () => {
    setEditingClass(null);
    const defaultTeacher = teachers[0];
    setClassForm({
      name: '',
      grade: 'پایه دهم',
      major: 'ریاضی و فیزیک',
      teacher_id: defaultTeacher ? defaultTeacher.id : '',
      room: 'اتاق ۱۰۱',
      selectedStudentIds: [],
    });
    setIsClassModalOpen(true);
  };

  // ── Open Edit Class Modal ──
  const handleOpenEditModal = (cls) => {
    setEditingClass(cls);
    const enrolledIds = students.filter((s) => s.class_name === cls.name).map((s) => s.id);
    setClassForm({
      name: cls.name || '',
      grade: cls.grade || 'پایه دهم',
      major: cls.major || 'ریاضی و فیزیک',
      teacher_id: cls.teacher_id || (teachers[0]?.id || ''),
      room: cls.room || 'اتاق ۱۰۱',
      selectedStudentIds: enrolledIds,
    });
    setIsClassModalOpen(true);
  };

  // ── Save Class (Add or Edit) ──
  const handleSaveClass = async (e) => {
    e.preventDefault();
    if (!classForm.name.trim()) return toast.error('لطفاً نام کلاس را وارد فرمایید');
    if (!classForm.teacher_id) return toast.error('لطفاً دبیر سرپرست کلاس را از دیتابیس انتخاب کنید');

    const teacherObj = teachers.find((t) => t.id === classForm.teacher_id);
    const teacherName = teacherObj ? teacherObj.name : 'نامشخص';
    const teacherCode = teacherObj ? teacherObj.code : 'TCH';

    try {
      if (editingClass) {
        // Update Class in SQLite Database
        const res = await api.put(`/classes/${editingClass.id}`, {
          name: classForm.name.trim(),
          grade: classForm.grade,
          subject: classForm.major,
          teacher_id: classForm.teacher_id,
          room: classForm.room.trim() || 'کلاس عمومی',
        });

        const updatedDbClass = res.data?.data?.class;

        const updatedClasses = classes.map((c) => {
          if (c.id === editingClass.id) {
            return {
              ...c,
              ...(updatedDbClass || {}),
              name: classForm.name.trim(),
              grade: classForm.grade,
              major: classForm.major,
              teacher_id: classForm.teacher_id,
              teacher_name: teacherName,
              teacher_code: teacherCode,
              room: classForm.room.trim() || 'کلاس عمومی',
            };
          }
          return c;
        });

        // Update enrolled students assignment
        const updatedStudents = students.map((s) => {
          if (classForm.selectedStudentIds.includes(s.id)) {
            return { ...s, class_name: classForm.name.trim(), teacher_name: teacherName };
          } else if (s.class_name === editingClass.name) {
            return { ...s, class_name: 'تخصیص نیافته', teacher_name: '---' };
          }
          return s;
        });

        setClasses(updatedClasses);
        setStudents(updatedStudents);
        saveClassesToStorage(updatedClasses);
        saveStudentsToStorage(updatedStudents);
        toast.success(`کلاس «${classForm.name}» با موفقیت در دیتابیس بروزرسانی شد ✨`);
      } else {
        // Create New Class in SQLite Database
        const res = await api.post('/classes', {
          name: classForm.name.trim(),
          grade: classForm.grade,
          subject: classForm.major,
          teacher_id: classForm.teacher_id,
          room: classForm.room.trim() || 'کلاس عمومی',
        });

        const dbClass = res.data?.data?.class;

        const newClassObj = {
          id: dbClass?.id || `cls-${Date.now()}`,
          name: dbClass?.name || classForm.name.trim(),
          grade: dbClass?.grade || classForm.grade,
          major: dbClass?.subject || classForm.major,
          teacher_id: classForm.teacher_id,
          teacher_name: teacherName,
          teacher_code: teacherCode,
          room: classForm.room.trim() || 'کلاس عمومی',
          join_code: dbClass?.join_code || 'CLS',
          students_count: 0,
        };

        // Assign selected students to this new class
        const updatedStudents = students.map((s) => {
          if (classForm.selectedStudentIds.includes(s.id)) {
            return { ...s, class_name: newClassObj.name, teacher_name: teacherName };
          }
          return s;
        });

        const updatedClasses = [newClassObj, ...classes.filter((c) => c.id !== newClassObj.id)];
        setClasses(updatedClasses);
        setStudents(updatedStudents);
        saveClassesToStorage(updatedClasses);
        saveStudentsToStorage(updatedStudents);
        toast.success(`کلاس «${newClassObj.name}» با موفقیت در دیتابیس ثبت شد 🎉`);
      }

      setIsClassModalOpen(false);
    } catch (err) {
      toast.error(err.response?.data?.message || 'خطا در ثبت کلاس در دیتابیس');
    }
  };

  // ── Delete Class ──
  const handleDeleteClass = async (cls) => {
    if (!window.confirm(`آیا از حذف کلاس «${cls.name}» اطمینان دارید؟ دانش‌آموزان این کلاس از حالت تخصیص خارج می‌شوند.`)) return;
    try {
      await api.delete(`/classes/${cls.id}`);
      const updatedClasses = classes.filter((c) => c.id !== cls.id);
      const updatedStudents = students.map((s) => {
        if (s.class_name === cls.name) {
          return { ...s, class_name: 'تخصیص نیافته', teacher_name: '---' };
        }
        return s;
      });

      setClasses(updatedClasses);
      setStudents(updatedStudents);
      saveClassesToStorage(updatedClasses);
      saveStudentsToStorage(updatedStudents);
      toast.success(`کلاس «${cls.name}» از دیتابیس حذف گردید.`);
    } catch (err) {
      toast.error('خطا در حذف کلاس از دیتابیس');
    }
  };

  // ── Roster Modal Actions (دانش‌آموزان این کلاس) ──
  const handleOpenRosterModal = (cls) => {
    setSelectedClassForRoster(cls);
    setNewStudentQuickForm({
      name: '',
      code: `STD-${Math.floor(1000 + Math.random() * 9000)}`,
      parent_phone: '',
    });
  };

  const handleRemoveStudentFromClass = async (studentId) => {
    try {
      await api.delete(`/school/students/${studentId}`).catch(() => {});
      const updatedStudents = students.map((s) => {
        if (s.id === studentId) {
          return { ...s, class_name: 'تخصیص نیافته', teacher_name: '---' };
        }
        return s;
      });
      setStudents(updatedStudents);
      saveStudentsToStorage(updatedStudents);
      toast.success('دانش‌آموز از این کلاس حذف شد');
    } catch (err) {
      toast.error('خطا در حذف دانش‌آموز');
    }
  };

  const handleAddQuickStudentToClass = async (e) => {
    e.preventDefault();
    if (!newStudentQuickForm.name.trim()) return toast.error('نام دانش‌آموز را بنویسید');
    if (!selectedClassForRoster) return;

    try {
      const res = await api.post('/school/students', {
        name: newStudentQuickForm.name.trim(),
        code: newStudentQuickForm.code.trim().toUpperCase() || `STD-${Date.now().toString().slice(-4)}`,
        grade: selectedClassForRoster.grade,
        class_name: selectedClassForRoster.name,
        class_id: selectedClassForRoster.id,
        teacher_name: selectedClassForRoster.teacher_name,
        parent_phone: newStudentQuickForm.parent_phone.trim() || '',
      });

      const savedStd = res.data?.data?.student || {
        id: `std-${Date.now()}`,
        name: newStudentQuickForm.name.trim(),
        code: newStudentQuickForm.code.trim().toUpperCase() || `STD-${Date.now().toString().slice(-4)}`,
        grade: selectedClassForRoster.grade,
        class_name: selectedClassForRoster.name,
        teacher_name: selectedClassForRoster.teacher_name,
        parent_phone: newStudentQuickForm.parent_phone.trim() || 'ثبت نشده',
      };

      const updatedStudents = [savedStd, ...students.filter((s) => s.id !== savedStd.id)];
      setStudents(updatedStudents);
      saveStudentsToStorage(updatedStudents);

      toast.success(`دانش‌آموز «${savedStd.name}» با موفقیت در دیتابیس ثبت شد 🎓`);
      setNewStudentQuickForm({
        name: '',
        code: `STD-${Math.floor(1000 + Math.random() * 9000)}`,
        parent_phone: '',
      });
    } catch (err) {
      toast.error(err.response?.data?.message || 'خطا در ثبت دانش‌آموز در دیتابیس');
    }
  };

  // ── Filtered Classes ──
  const filteredClasses = useMemo(() => {
    return classes.filter((c) => {
      const matchesSearch =
        !searchQuery.trim() ||
        c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.teacher_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.grade.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (c.major && c.major.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchesGrade =
        selectedGradeFilter === 'all' || c.grade === selectedGradeFilter;

      return matchesSearch && matchesGrade;
    });
  }, [classes, searchQuery, selectedGradeFilter]);

  // Candidates for Class Form student picker (Filtered by grade)
  const candidateStudentsForGrade = useMemo(() => {
    return students.filter((s) => s.grade === classForm.grade);
  }, [students, classForm.grade]);

  return (
    <div className={styles.container} dir="rtl">
      {/* ── 1. Top Header: School Identification ── */}
      <div className={styles.header}>
        <div>
          <h1 className={styles.headerTitle}>
            <HiOutlineUserGroup style={{ color: '#0284c7' }} />
            ثبت و مدیریت کلاس‌های مدرسه و اعضای کلاسی
          </h1>
          <p className={styles.headerSubtitle}>
            تعریف کلاس‌های آموزشی «{schoolData.name}» | تعیین پایه، رشته، دبیر سرپرست و ثبت لیست دانش‌آموزان هر کلاس
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
          <div className={styles.statIcon} style={{ background: 'rgba(14, 165, 233, 0.15)', color: '#0ea5e9' }}>
            <HiOutlineUserGroup />
          </div>
          <div className={styles.statInfo}>
            <span className={styles.statLabel}>کل کلاس‌های دایر</span>
            <span className={styles.statValue}>{classes.length} کلاس</span>
          </div>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statIcon} style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#10b981' }}>
            <HiOutlineUsers />
          </div>
          <div className={styles.statInfo}>
            <span className={styles.statLabel}>کل دانش‌آموزان تخصیص‌یافته</span>
            <span className={styles.statValue}>
              {students.filter((s) => s.class_name && s.class_name !== 'تخصیص نیافته').length} نفر
            </span>
          </div>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statIcon} style={{ background: 'rgba(99, 102, 241, 0.15)', color: '#6366f1' }}>
            <HiOutlineAcademicCap />
          </div>
          <div className={styles.statInfo}>
            <span className={styles.statLabel}>دبیران سرپرست متصل</span>
            <span className={styles.statValue}>
              {new Set(classes.map((c) => c.teacher_id)).size} دبیر
            </span>
          </div>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statIcon} style={{ background: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b' }}>
            <HiOutlineBookOpen />
          </div>
          <div className={styles.statInfo}>
            <span className={styles.statLabel}>پایه‌های تحصیلی فعال</span>
            <span className={styles.statValue}>
              {new Set(classes.map((c) => c.grade)).size} پایه
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
              placeholder="جستجوی نام کلاس، دبیر سرپرست، پایه یا رشته..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          {/* Grade Filter */}
          <select
            className={styles.filterSelect}
            value={selectedGradeFilter}
            onChange={(e) => setSelectedGradeFilter(e.target.value)}
          >
            <option value="all">🌟 همه مقاطع و پایه‌ها</option>
            {GRADES_LIST.map((g) => (
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

          {/* Add Class Button */}
          <button className={styles.primaryAddBtn} onClick={handleOpenAddModal}>
            <HiOutlinePlus style={{ fontSize: '1.15rem' }} />
            ثبت کلاس جدید در مدرسه
          </button>
        </div>
      </div>

      {/* ── 4. Main Classes List ── */}
      {filteredClasses.length > 0 ? (
        viewMode === 'grid' ? (
          /* ── GRID CARDS VIEW ── */
          <div className={styles.classesGrid}>
            {filteredClasses.map((cls) => {
              const enrolledStudents = getStudentsForClass(cls.name);

              return (
                <div key={cls.id} className={styles.classCard}>
                  {/* Class Header */}
                  <div className={styles.classCardHeader}>
                    <div>
                      <div className={styles.className}>{cls.name}</div>
                      <div className={styles.classBadges}>
                        <span className={styles.gradeBadge}>📍 {cls.grade}</span>
                        <span className={styles.majorBadge}>📚 {cls.major || 'عمومی'}</span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>🏢 {cls.room}</span>
                      </div>
                    </div>
                  </div>

                  {/* Teacher Assigned Info */}
                  <div className={styles.teacherSubordinateBox}>
                    <div className={styles.teacherMeta}>
                      <div className={styles.teacherAvatarSmall}>{cls.teacher_name?.charAt(0) || 'م'}</div>
                      <div>
                        <div style={{ fontSize: '0.875rem', fontWeight: 800 }}>{cls.teacher_name}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>دبیر سرپرست کلاس</div>
                      </div>
                    </div>
                    <span className={styles.teacherCodeBadge}>{cls.teacher_code || 'TCH'}</span>
                  </div>

                  {/* Enrolled Students Section */}
                  <div className={styles.studentsSection}>
                    <div className={styles.studentsHeaderRow}>
                      <span className={styles.studentsCountLabel}>
                        <HiOutlineUsers style={{ color: '#0284c7' }} />
                        دانش‌آموزان کلاس: ({enrolledStudents.length} نفر)
                      </span>
                      <button
                        className={styles.manageStudentsBtn}
                        onClick={() => handleOpenRosterModal(cls)}
                      >
                        مدیریت دانش‌آموزان 👥
                      </button>
                    </div>

                    <div className={styles.studentsPillsRow}>
                      {enrolledStudents.length > 0 ? (
                        enrolledStudents.map((std) => (
                          <span key={std.id} className={styles.studentPill}>
                            <span>{std.name}</span>
                            <span className={styles.studentPillCode}>({std.code})</span>
                          </span>
                        ))
                      ) : (
                        <span style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>
                          هنوز دانش‌آموزی در این کلاس ثبت نشده است.
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Footer Actions */}
                  <div className={styles.classCardFooter}>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        className={styles.cardActionBtn}
                        onClick={() => handleOpenRosterModal(cls)}
                        title="مشاهده و ویرایش لیست کلاسی"
                      >
                        <HiOutlineUsers />
                        لیست کلاسی
                      </button>
                      <button
                        className={styles.cardActionBtn}
                        onClick={() => handleOpenEditModal(cls)}
                        title="ویرایش اطلاعات کلاس"
                      >
                        <HiOutlinePencilSquare />
                        ویرایش
                      </button>
                    </div>

                    <button
                      className={styles.deleteBtn}
                      onClick={() => handleDeleteClass(cls)}
                      title="حذف کلاس"
                    >
                      <HiOutlineTrash />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* ── TABLE VIEW ── */
          <div className={styles.tableWrapper}>
            <table className={styles.classesTable}>
              <thead>
                <tr>
                  <th>نام کلاس</th>
                  <th>پایه تحصیلی</th>
                  <th>رشته تحصیلی</th>
                  <th>دبیر سرپرست (کد دبیر)</th>
                  <th>محل تشکیل</th>
                  <th>تعداد دانش‌آموز</th>
                  <th>عملیات</th>
                </tr>
              </thead>
              <tbody>
                {filteredClasses.map((cls) => {
                  const enrolled = getStudentsForClass(cls.name);

                  return (
                    <tr key={cls.id}>
                      <td style={{ fontWeight: 800 }}>{cls.name}</td>
                      <td>
                        <span className={styles.gradeBadge}>{cls.grade}</span>
                      </td>
                      <td style={{ color: 'var(--text-secondary)' }}>{cls.major || 'عمومی'}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ fontWeight: 700 }}>{cls.teacher_name}</span>
                          <span className={styles.teacherCodeBadge}>{cls.teacher_code}</span>
                        </div>
                      </td>
                      <td>{cls.room}</td>
                      <td>
                        <button
                          onClick={() => handleOpenRosterModal(cls)}
                          style={{
                            background: 'rgba(2, 132, 199, 0.1)',
                            border: '1px solid rgba(2, 132, 199, 0.3)',
                            color: '#0284c7',
                            padding: '3px 10px',
                            borderRadius: '12px',
                            fontWeight: 750,
                            cursor: 'pointer',
                          }}
                        >
                          👥 {enrolled.length} دانش‌آموز
                        </button>
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <button
                            className={styles.cardActionBtn}
                            onClick={() => handleOpenEditModal(cls)}
                            title="ویرایش"
                            style={{ padding: '4px 8px' }}
                          >
                            <HiOutlinePencilSquare />
                          </button>
                          <button
                            className={styles.deleteBtn}
                            onClick={() => handleDeleteClass(cls)}
                            title="حذف"
                          >
                            <HiOutlineTrash />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      ) : (
        /* ── EMPTY STATE ── */
        <div className={styles.emptyState}>
          <HiOutlineUserGroup className={styles.emptyStateIcon} />
          <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
            کلاسی با این مشخصات یافت نشد
          </h3>
          <p style={{ fontSize: '0.875rem', maxWidth: '420px', lineHeight: 1.6 }}>
            می‌توانید با کلیک روی دکمه زیر، کلاس جدیدی با پایه و دانش‌آموزان دلخواه ثبت نمایید.
          </p>
          <button className={styles.primaryAddBtn} onClick={handleOpenAddModal} style={{ marginTop: '8px' }}>
            <HiOutlinePlus style={{ fontSize: '1.15rem' }} />
            ثبت اولین کلاس مدرسه
          </button>
        </div>
      )}

      {/* ── MODAL: Create / Edit Class ── */}
      {isClassModalOpen && (
        <div className={styles.modalOverlay} onClick={() => setIsClassModalOpen(false)}>
          <div className={styles.modalDialog} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>
                <HiOutlineUserGroup style={{ color: '#0284c7' }} />
                {editingClass ? `ویرایش کلاس: ${editingClass.name}` : 'ثبت کلاس جدید در مدرسه'}
              </h3>
              <button className={styles.modalCloseBtn} onClick={() => setIsClassModalOpen(false)}>
                <HiOutlineXMark />
              </button>
            </div>

            <form onSubmit={handleSaveClass} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Class Name */}
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>نام کامل کلاس یا عنوان درس *</label>
                <input
                  type="text"
                  className={styles.formInput}
                  placeholder="مثلاً: کلاس ۱۰۱ - ریاضی و حسابان یا کلاس ۲۰۲ - زیست تجربی"
                  value={classForm.name}
                  onChange={(e) => setClassForm({ ...classForm, name: e.target.value })}
                  required
                  autoFocus
                />
              </div>

              {/* Grade & Major */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>پایه تحصیلی *</label>
                  <select
                    className={styles.formSelect}
                    value={classForm.grade}
                    onChange={(e) => setClassForm({ ...classForm, grade: e.target.value })}
                  >
                    {GRADES_LIST.map((g) => (
                      <option key={g} value={g}>
                        {g}
                      </option>
                    ))}
                  </select>
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>رشته تحصیلی *</label>
                  <select
                    className={styles.formSelect}
                    value={classForm.major}
                    onChange={(e) => setClassForm({ ...classForm, major: e.target.value })}
                  >
                    {MAJORS_LIST.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Supervising Teacher (Connected to Teachers Database) */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>دبیر سرپرست (از دیتابیس معلمان) *</label>
                  <select
                    className={styles.formSelect}
                    value={classForm.teacher_id}
                    onChange={(e) => setClassForm({ ...classForm, teacher_id: e.target.value })}
                    required
                  >
                    <option value="">-- انتخاب دبیر --</option>
                    {teachers.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} ({t.code} - {t.subject})
                      </option>
                    ))}
                  </select>
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>محل تشکیل یا شماره اتاق</label>
                  <input
                    type="text"
                    className={styles.formInput}
                    placeholder="مثلاً: سالن ۲۰۱ یا آزمایشگاه"
                    value={classForm.room}
                    onChange={(e) => setClassForm({ ...classForm, room: e.target.value })}
                  />
                </div>
              </div>

              {/* Enrolled Students Picker (From Students of this Grade) */}
              <div className={styles.formGroup}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label className={styles.formLabel}>
                    انتخاب دانش‌آموزان عضو این کلاس ({classForm.grade}):
                  </label>
                  <span style={{ fontSize: '0.75rem', color: '#0284c7', fontWeight: 700 }}>
                    {classForm.selectedStudentIds.length} دانش‌آموز انتخاب شده
                  </span>
                </div>

                <div className={styles.studentsChecklistContainer}>
                  {candidateStudentsForGrade.length > 0 ? (
                    candidateStudentsForGrade.map((std) => {
                      const isChecked = classForm.selectedStudentIds.includes(std.id);

                      return (
                        <div
                          key={std.id}
                          className={styles.studentCheckRow}
                          onClick={() => {
                            let current = [...classForm.selectedStudentIds];
                            if (current.includes(std.id)) {
                              current = current.filter((id) => id !== std.id);
                            } else {
                              current.push(std.id);
                            }
                            setClassForm({ ...classForm, selectedStudentIds: current });
                          }}
                        >
                          <div className={styles.studentCheckInfo}>
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => {}} // handled by parent onClick
                            />
                            <span style={{ fontWeight: 750 }}>{std.name}</span>
                            <span style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                              ({std.code})
                            </span>
                          </div>

                          <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                            {std.class_name && std.class_name !== 'تخصیص نیافته'
                              ? `کلاس فعلی: ${std.class_name}`
                              : 'بدون کلاس'}
                          </span>
                        </div>
                      );
                    })
                  ) : (
                    <div style={{ textAlign: 'center', padding: '12px', fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>
                      هنوز دانش‌آموزی در {classForm.grade} در سیستم ثبت نشده است. می‌توانید بعداً از بخش مدیریت اعضا دانش‌آموز اضافه کنید.
                    </div>
                  )}
                </div>
              </div>

              <div className={styles.modalFooter}>
                <button type="button" className={styles.modalCancelBtn} onClick={() => setIsClassModalOpen(false)}>
                  انصراف
                </button>
                <button type="submit" className={styles.modalSubmitBtn}>
                  {editingClass ? 'ذخیره تغییرات کلاس' : 'ثبت قطعی کلاس در مدرسه'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL: Detailed Roster & Add Students to Class ── */}
      {selectedClassForRoster && (
        <div className={styles.modalOverlay} onClick={() => setSelectedClassForRoster(null)}>
          <div className={styles.modalDialog} onClick={(e) => e.stopPropagation()} style={{ maxWidth: '640px' }}>
            <div className={styles.modalHeader}>
              <div>
                <h3 className={styles.modalTitle}>
                  <HiOutlineUsers style={{ color: '#0284c7' }} />
                  لیست و اسامی دانش‌آموزان: {selectedClassForRoster.name}
                </h3>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>
                  پایه: {selectedClassForRoster.grade} | دبیر: {selectedClassForRoster.teacher_name} ({selectedClassForRoster.teacher_code})
                </span>
              </div>
              <button className={styles.modalCloseBtn} onClick={() => setSelectedClassForRoster(null)}>
                <HiOutlineXMark />
              </button>
            </div>

            {/* Quick Add Student on the spot */}
            <form onSubmit={handleAddQuickStudentToClass} style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '14px', background: 'var(--bg-surface)', borderRadius: 'var(--radius-xl)', border: '1px solid var(--border-color)' }}>
              <span style={{ fontSize: '0.8125rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                ➕ ثبت و الحاق سریع دانش‌آموز جدید به این کلاس:
              </span>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: '8px', alignItems: 'flex-end' }}>
                <div>
                  <label style={{ fontSize: '0.72rem', display: 'block', marginBottom: '3px' }}>نام دانش‌آموز *</label>
                  <input
                    type="text"
                    className={styles.formInput}
                    placeholder="نام کامل"
                    value={newStudentQuickForm.name}
                    onChange={(e) => setNewStudentQuickForm({ ...newStudentQuickForm, name: e.target.value })}
                    style={{ padding: '8px 10px', fontSize: '0.8125rem' }}
                    required
                  />
                </div>

                <div>
                  <label style={{ fontSize: '0.72rem', display: 'block', marginBottom: '3px' }}>کد دانش‌آموز</label>
                  <input
                    type="text"
                    className={styles.formInput}
                    value={newStudentQuickForm.code}
                    onChange={(e) => setNewStudentQuickForm({ ...newStudentQuickForm, code: e.target.value })}
                    style={{ padding: '8px 10px', fontSize: '0.8125rem', fontFamily: 'monospace' }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: '0.72rem', display: 'block', marginBottom: '3px' }}>تلفن ولی</label>
                  <input
                    type="tel"
                    className={styles.formInput}
                    placeholder="0912..."
                    value={newStudentQuickForm.parent_phone}
                    onChange={(e) => setNewStudentQuickForm({ ...newStudentQuickForm, parent_phone: e.target.value })}
                    style={{ padding: '8px 10px', fontSize: '0.8125rem', direction: 'ltr' }}
                  />
                </div>

                <button
                  type="submit"
                  className={styles.primaryAddBtn}
                  style={{ padding: '8px 14px', fontSize: '0.8125rem', height: '38px' }}
                >
                  الحاق به کلاس
                </button>
              </div>
            </form>

            {/* List of Enrolled Students in this class */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '300px', overflowY: 'auto' }}>
              <span style={{ fontSize: '0.8125rem', fontWeight: 800, color: 'var(--text-secondary)' }}>
                دانش‌آموزان ثبت‌نامی ({getStudentsForClass(selectedClassForRoster.name).length} نفر):
              </span>

              {getStudentsForClass(selectedClassForRoster.name).length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {getStudentsForClass(selectedClassForRoster.name).map((std, idx) => (
                    <div
                      key={std.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '10px 14px',
                        background: 'var(--bg-surface)',
                        borderRadius: 'var(--radius-lg)',
                        border: '1px solid var(--border-color)',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', fontWeight: 800 }}>
                          #{idx + 1}
                        </span>
                        <div>
                          <div style={{ fontWeight: 800, fontSize: '0.875rem' }}>{std.name}</div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', fontFamily: 'monospace' }}>
                            کد: {std.code} | تلفن: {std.parent_phone}
                          </div>
                        </div>
                      </div>

                      <button
                        onClick={() => handleRemoveStudentFromClass(std.id)}
                        className={styles.deleteBtn}
                        title="حذف از این کلاس"
                        style={{ fontSize: '0.9rem' }}
                      >
                        <HiOutlineTrash />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-tertiary)', border: '1px dashed var(--border-color)', borderRadius: 'var(--radius-lg)' }}>
                  هنوز دانش‌آموزی به این کلاس الحاق نشده است. با استفاده از فرم بالا می‌توانید دانش‌آموزان را به این کلاس متصل کنید.
                </div>
              )}
            </div>

            <div className={styles.modalFooter}>
              <button
                type="button"
                className={styles.modalSubmitBtn}
                onClick={() => setSelectedClassForRoster(null)}
              >
                تایید و بستن
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
