'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import useAuthStore from '../../../stores/authStore';
import api from '../../../lib/api';
import toast from 'react-hot-toast';
import {
  HiOutlineBuildingOffice2,
  HiOutlineAcademicCap,
  HiOutlineUsers,
  HiOutlineMegaphone,
  HiOutlinePaperAirplane,
  HiOutlineCheckCircle,
  HiOutlineClock,
  HiOutlineShieldCheck,
  HiOutlineDocumentText,
  HiOutlineExclamationTriangle,
  HiOutlineUserGroup,
  HiOutlineTrash,
  HiOutlinePlus,
  HiOutlineClipboardDocumentCheck,
  HiOutlineIdentification,
  HiOutlinePhone,
  HiOutlineBookOpen,
  HiOutlineXMark,
} from 'react-icons/hi2';
import styles from './management.module.css';

export default function ManagementDashboardPage() {
  const { user } = useAuthStore();
  const [activeTab, setActiveTab] = useState('teachers'); // teachers | students | classes | directives
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // School Identity
  const [schoolData, setSchoolData] = useState({
    name: 'مجتمع آموزشی هوشمند علامه حلی',
    code: 'SCH-4821',
    level: 'دوره دوم متوسطه',
    city: 'تهران',
    principal: 'دکتر تقوی',
  });

  // 1. Teachers state
  const [teachers, setTeachers] = useState([]);
  const [showTeacherModal, setShowTeacherModal] = useState(false);
  const [newTeacher, setNewTeacher] = useState({
    name: '',
    code: '',
    subject: 'ریاضی و هندسه',
    phone: '',
    grades: ['پایه دهم', 'پایه یازدهم'],
  });

  // 2. Students state
  const [selectedGrade, setSelectedGrade] = useState('all');
  const [students, setStudents] = useState([]);
  const [showStudentModal, setShowStudentModal] = useState(false);
  const [newStudent, setNewStudent] = useState({
    name: '',
    code: '',
    grade: 'پایه دهم',
    class_name: 'کلاس ۱۰۱ - ریاضی',
    teacher_name: 'مهندس حسین میرزایی',
    parent_phone: '',
  });

  // 3. Classes state (subordinate to teachers)
  const [classesList, setClassesList] = useState([]);
  const [showClassModal, setShowClassModal] = useState(false);
  const [newClass, setNewClass] = useState({
    name: '',
    grade: 'پایه دهم',
    teacher_id: '',
    room: 'اتاق ۲۰۴',
  });

  // 4. Sent Directives state
  const [sentDirectives, setSentDirectives] = useState([]);
  const [directiveForm, setDirectiveForm] = useState({
    title: '',
    body: '',
    category: 'administrative',
    priority: 'important',
    target_audience: 'students',
    target_grades: ['*'],
    teacher_ids: ['*'],
    is_mandatory: true,
    is_pinned: false,
  });

  // Load School Identity and Seed / Stored Data
  useEffect(() => {
    // Determine active school info
    let currentSchoolCode = user?.school_code || 'SCH-4821';
    let currentSchoolName = user?.school_name || 'مجتمع آموزشی هوشمند علامه حلی';
    let principalName = user?.display_name || user?.name || 'دکتر تقوی';
    let schoolLevel = user?.school_level || 'دوره دوم متوسطه';
    let schoolCity = user?.city || 'تهران';

    // If registered via login recently, check localStorage.registered_schools
    try {
      const savedSchools = JSON.parse(localStorage.getItem('registered_schools') || '[]');
      if (savedSchools.length > 0) {
        const matched = savedSchools.find((s) => s.school_code === currentSchoolCode) || savedSchools[0];
        if (matched) {
          currentSchoolCode = matched.school_code;
          currentSchoolName = matched.school_name;
          schoolLevel = matched.school_level || schoolLevel;
          schoolCity = matched.city || schoolCity;
          principalName = matched.admin_name || principalName;
        }
      }
    } catch (e) {}

    setSchoolData({
      name: currentSchoolName,
      code: currentSchoolCode,
      level: schoolLevel,
      city: schoolCity,
      principal: principalName,
    });

    const isDummyTeacher = (t) => ['tch-101', 'tch-102', 'tch-103', 'tch-104', 'tch-105'].includes(t.id);
    const isDummyStudent = (s) => ['std-1', 'std-2', 'std-3', 'std-4', 'std-5', 'std-6', 'std-7'].includes(s.id);
    const isDummyClass = (c) => ['cls-1', 'cls-2', 'cls-3', 'cls-4', 'cls-5'].includes(c.id);

    // ── Load Teachers ──
    const teacherStorageKey = `mgmt_teachers_${currentSchoolCode}`;
    const savedTeachers = localStorage.getItem(teacherStorageKey);
    let loadedTeachers = [];
    if (savedTeachers) {
      try {
        loadedTeachers = JSON.parse(savedTeachers);
      } catch (e) {}
    }
    loadedTeachers = Array.isArray(loadedTeachers) ? loadedTeachers.filter((t) => !isDummyTeacher(t)) : [];
    setTeachers(loadedTeachers);
    try {
      localStorage.setItem(teacherStorageKey, JSON.stringify(loadedTeachers));
    } catch (e) {}

    // ── Load Students Grade-by-Grade ──
    const studentStorageKey = `mgmt_students_${currentSchoolCode}`;
    const savedStudents = localStorage.getItem(studentStorageKey);
    let loadedStudents = [];
    if (savedStudents) {
      try {
        loadedStudents = JSON.parse(savedStudents);
      } catch (e) {}
    }
    loadedStudents = Array.isArray(loadedStudents) ? loadedStudents.filter((s) => !isDummyStudent(s)) : [];
    setStudents(loadedStudents);
    try {
      localStorage.setItem(studentStorageKey, JSON.stringify(loadedStudents));
    } catch (e) {}

    // ── Load Classes Subordinate to Teachers ──
    const classStorageKey = `mgmt_classes_${currentSchoolCode}`;
    const savedClasses = localStorage.getItem(classStorageKey);
    let loadedClasses = [];
    if (savedClasses) {
      try {
        loadedClasses = JSON.parse(savedClasses);
      } catch (e) {}
    }
    loadedClasses = Array.isArray(loadedClasses) ? loadedClasses.filter((c) => !isDummyClass(c)) : [];
    setClassesList(loadedClasses);
    try {
      localStorage.setItem(classStorageKey, JSON.stringify(loadedClasses));
    } catch (e) {}

    // ── Load Directives ──
    const savedDirectives = localStorage.getItem('sent_management_directives');
    if (savedDirectives) {
      try {
        setSentDirectives(JSON.parse(savedDirectives));
      } catch (e) {}
    } else {
      setSentDirectives([
        {
          id: 'init-1',
          title: 'برگزاری جلسه فوری شورای دبیران - هماهنگی آزمون‌های میان‌ترم',
          body: 'به اطلاع کلیه دبیران محترم می‌رساند جلسه شورای آموزشی روز شنبه ساعت ۱۳:۳۰ در اتاق شورا برگزار می‌گردد.',
          category: 'council',
          priority: 'urgent',
          target_audience: 'teachers',
          recipients_count: 'کلیه دبیران مدرسه',
          created_at: new Date(Date.now() - 3600000 * 24).toISOString(),
        },
        {
          id: 'init-2',
          title: 'تقویم آموزشی و برنامه آزمون‌های جامع نیم‌سال اول',
          body: 'دانش‌آموزان گرامی جهت برنامه‌ریزی درسی، زمان‌بندی دقیق آزمون‌های میان‌ترم در بخش اطلاعیه‌ها بارگذاری شد.',
          category: 'administrative',
          priority: 'important',
          target_audience: 'students',
          recipients_count: 'کلیه دانش‌آموزان مدرسه',
          created_at: new Date(Date.now() - 3600000 * 48).toISOString(),
        },
      ]);
    }

    setLoading(false);
  }, [user]);

  // Copy School Code
  const copySchoolCode = () => {
    navigator.clipboard.writeText(schoolData.code);
    toast.success(`کد اختصاصی مدرسه (${schoolData.code}) کپی شد! ✅`);
  };

  // Copy Teacher Code
  const copyTeacherCode = (code, teacherName) => {
    navigator.clipboard.writeText(code);
    toast.success(`کد معلم ${teacherName} (${code}) کپی شد! 📋`);
  };

  // ── 1. Teacher Management Actions ──
  const handleOpenAddTeacher = () => {
    const nextCodeNum = teachers.length + 101;
    setNewTeacher({
      name: '',
      code: `TCH-${nextCodeNum}`,
      subject: 'ریاضی و هندسه',
      phone: '',
      grades: ['پایه دهم'],
    });
    setShowTeacherModal(true);
  };

  const handleSaveTeacher = (e) => {
    e.preventDefault();
    const cleanName = newTeacher.name.trim();
    if (!cleanName) return toast.error('نام و نام‌خانوادگی معلم را وارد کنید');

    const cleanCode = newTeacher.code.trim().toUpperCase() || `TCH-${100 + teachers.length + 1}`;

    const teacherObj = {
      id: `tch-${Date.now()}`,
      name: cleanName,
      code: cleanCode,
      subject: newTeacher.subject || 'ریاضی و هندسه',
      phone: newTeacher.phone.trim() || 'ثبت نشده',
      grades: newTeacher.grades && newTeacher.grades.length > 0 ? newTeacher.grades : ['پایه دهم'],
    };

    const updated = [teacherObj, ...teachers];
    setTeachers(updated);
    try {
      localStorage.setItem(`mgmt_teachers_${schoolData.code}`, JSON.stringify(updated));
      localStorage.setItem('school_teachers_database', JSON.stringify(updated));
    } catch (err) {}

    toast.success(`معلم گرامی «${teacherObj.name}» با کد اختصاصی ${teacherObj.code} به زیرمجموعه مدرسه افزوده شد 🎉`);
    setShowTeacherModal(false);
  };

  const handleDeleteTeacher = (id, name) => {
    if (!window.confirm(`آیا از حذف معلم «${name}» از لیست مدرسه اطمینان دارید؟`)) return;
    const updated = teachers.filter((t) => t.id !== id);
    setTeachers(updated);
    try {
      localStorage.setItem(`mgmt_teachers_${schoolData.code}`, JSON.stringify(updated));
    } catch (err) {}
    toast.success(`معلم «${name}» از کادر مدرسه حذف شد.`);
  };

  // ── 2. Student Management Actions ──
  const handleOpenAddStudent = () => {
    const nextStdNum = 1000 + students.length + 1;
    const defaultGrade = selectedGrade === 'all' ? 'پایه دهم' : selectedGrade;
    setNewStudent({
      name: '',
      code: `STD-${nextStdNum}`,
      grade: defaultGrade,
      class_name: classesList[0]?.name || 'کلاس ۱۰۱ - ریاضی',
      teacher_name: teachers[0]?.name || 'مهندس حسین میرزایی',
      parent_phone: '',
    });
    setShowStudentModal(true);
  };

  const handleSaveStudent = (e) => {
    e.preventDefault();
    if (!newStudent.name.trim()) return toast.error('نام دانش‌آموز را وارد کنید');
    if (!newStudent.code.trim()) return toast.error('کد دانش‌آموزی را وارد کنید');

    const studentObj = {
      id: `std-${Date.now()}`,
      name: newStudent.name.trim(),
      code: newStudent.code.trim().toUpperCase(),
      grade: newStudent.grade,
      class_name: newStudent.class_name,
      teacher_name: newStudent.teacher_name,
      parent_phone: newStudent.parent_phone.trim() || 'ثبت نشده',
    };

    const updated = [studentObj, ...students];
    setStudents(updated);
    try {
      localStorage.setItem(`mgmt_students_${schoolData.code}`, JSON.stringify(updated));
    } catch (err) {}

    toast.success(`دانش‌آموز «${studentObj.name}» در ${studentObj.grade} ثبت‌نام شد 🎓`);
    setShowStudentModal(false);
  };

  const handleDeleteStudent = (id, name) => {
    if (!window.confirm(`آیا از حذف دانش‌آموز «${name}» اطمینان دارید؟`)) return;
    const updated = students.filter((s) => s.id !== id);
    setStudents(updated);
    try {
      localStorage.setItem(`mgmt_students_${schoolData.code}`, JSON.stringify(updated));
    } catch (err) {}
    toast.success(`دانش‌آموز «${name}» حذف شد.`);
  };

  // Filter students based on selected grade
  const filteredStudents = selectedGrade === 'all' ? students : students.filter((s) => s.grade === selectedGrade);

  // ── 3. Class (Teacher Subordinates) Actions ──
  const handleOpenAddClass = (teacherId = null) => {
    const assignedTeacher = teachers.find((t) => t.id === teacherId) || teachers[0];
    setNewClass({
      name: '',
      grade: 'پایه دهم',
      teacher_id: assignedTeacher ? assignedTeacher.id : '',
      room: 'اتاق ۱۰۱',
    });
    setShowClassModal(true);
  };

  const handleSaveClass = (e) => {
    e.preventDefault();
    if (!newClass.name.trim()) return toast.error('نام کلاس را وارد کنید');
    if (!newClass.teacher_id) return toast.error('معلم سرپرست کلاس را انتخاب کنید');

    const teacher = teachers.find((t) => t.id === newClass.teacher_id);
    const classObj = {
      id: `cls-${Date.now()}`,
      name: newClass.name.trim(),
      grade: newClass.grade,
      teacher_id: newClass.teacher_id,
      teacher_name: teacher ? teacher.name : 'نامشخص',
      students_count: 0,
      room: newClass.room.trim() || 'کلاس عمومی',
    };

    const updated = [...classesList, classObj];
    setClassesList(updated);
    try {
      localStorage.setItem(`mgmt_classes_${schoolData.code}`, JSON.stringify(updated));
    } catch (err) {}

    toast.success(`کلاس «${classObj.name}» به عنوان زیرشاخه معلم «${classObj.teacher_name}» ایجاد شد 🏫`);
    setShowClassModal(false);
  };

  const handleDeleteClass = (id, name) => {
    if (!window.confirm(`آیا از حذف کلاس «${name}» اطمینان دارید؟`)) return;
    const updated = classesList.filter((c) => c.id !== id);
    setClassesList(updated);
    try {
      localStorage.setItem(`mgmt_classes_${schoolData.code}`, JSON.stringify(updated));
    } catch (err) {}
    toast.success(`کلاس «${name}» حذف شد.`);
  };

  // ── 4. Directives Actions ──
  const toggleTeacherSelect = (teacherId) => {
    if (teacherId === '*') {
      setDirectiveForm({ ...directiveForm, teacher_ids: ['*'] });
      return;
    }
    let current = directiveForm.teacher_ids.includes('*') ? [] : [...directiveForm.teacher_ids];
    if (current.includes(teacherId)) {
      current = current.filter((id) => id !== teacherId);
      if (current.length === 0) current = ['*'];
    } else {
      current.push(teacherId);
    }
    setDirectiveForm({ ...directiveForm, teacher_ids: current });
  };

  const toggleGradeSelect = (grade) => {
    if (grade === '*') {
      setDirectiveForm({ ...directiveForm, target_grades: ['*'] });
      return;
    }
    let current = directiveForm.target_grades.includes('*') ? [] : [...directiveForm.target_grades];
    if (current.includes(grade)) {
      current = current.filter((g) => g !== grade);
      if (current.length === 0) current = ['*'];
    } else {
      current.push(grade);
    }
    setDirectiveForm({ ...directiveForm, target_grades: current });
  };

  const handleSendDirective = async (e) => {
    e.preventDefault();
    if (!directiveForm.title.trim()) return toast.error('لطفاً عنوان بخشنامه را بنویسید');
    if (!directiveForm.body.trim()) return toast.error('لطفاً متن بخشنامه را وارد کنید');

    try {
      setSubmitting(true);
      let recText = 'کلیه مخاطبان مدرسه';
      if (directiveForm.target_audience === 'students') {
        recText = directiveForm.target_grades.includes('*') ? 'کلیه دانش‌آموزان' : `دانش‌آموزان (${directiveForm.target_grades.join('، ')})`;
      } else if (directiveForm.target_audience === 'teachers') {
        recText = directiveForm.teacher_ids.includes('*') ? 'کلیه دبیران مدرسه' : `${directiveForm.teacher_ids.length} دبیر منتخب`;
      } else if (directiveForm.target_audience === 'parents') {
        recText = 'کلیه اولیای دانش‌آموزان';
      }

      const newDirective = {
        id: Date.now().toString(),
        title: directiveForm.title,
        body: directiveForm.body,
        category: directiveForm.category,
        priority: directiveForm.priority,
        target_audience: directiveForm.target_audience,
        recipients_count: recText,
        created_at: new Date().toISOString(),
      };

      const updated = [newDirective, ...sentDirectives];
      setSentDirectives(updated);
      try {
        localStorage.setItem('sent_management_directives', JSON.stringify(updated));
      } catch (err) {}

      toast.success('پیام و بخشنامه مدیریت با موفقیت در سراسر مدرسه ابلاغ شد 🚀');

      setDirectiveForm({
        title: '',
        body: '',
        category: 'administrative',
        priority: 'important',
        target_audience: directiveForm.target_audience,
        target_grades: ['*'],
        teacher_ids: ['*'],
        is_mandatory: true,
        is_pinned: false,
      });
    } catch (err) {
      toast.error('خطا در ارسال بخشنامه');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteDirective = (id, e) => {
    e?.stopPropagation();
    if (!window.confirm('آیا از حذف این پیام از تاریخچه مدیریت اطمینان دارید؟')) return;
    const updated = sentDirectives.filter((d) => d.id !== id);
    setSentDirectives(updated);
    try {
      localStorage.setItem('sent_management_directives', JSON.stringify(updated));
    } catch (err) {}
    toast.success('پیام از تاریخچه حذف شد');
  };

  const categoryNames = {
    administrative: '📑 بخشنامه اداری',
    council: '👥 جلسه شورای دبیران',
    grades: '📝 کارنامه و نمرات',
    urgent: '🚨 پیام فوری مدیریت',
    general_school: '📢 اطلاعیه عمومی مدرسه',
  };

  return (
    <div className={styles.container} dir="rtl">
      {/* ── 1. Top Header: School Identity & School Code ── */}
      <div className={styles.header}>
        <div>
          <h1 className={styles.headerTitle}>
            <HiOutlineBuildingOffice2 style={{ color: '#f59e0b' }} />
            {schoolData.name}
          </h1>
          <p className={styles.headerSubtitle}>
            سامانه فرماندهی و نظارت مدرسه | مدیر مجتمع: {schoolData.principal} | مقطع: {schoolData.level} | شهر: {schoolData.city}
          </p>
        </div>

        <div className={styles.schoolCodeBox}>
          <div>
            <span className={styles.schoolCodeLabel}>کد اختصاصی مدرسه:</span>
            <span className={styles.schoolCodeText}>{schoolData.code}</span>
          </div>
          <button className={styles.copyCodeBtn} onClick={copySchoolCode} title="کپی کد مدرسه">
            <HiOutlineClipboardDocumentCheck style={{ fontSize: '1.1rem' }} />
            کپی کد
          </button>
        </div>
      </div>

      {/* ── 2. Top Stats Overview ── */}
      <div className={styles.statsGrid}>
        <div className={styles.statCard} onClick={() => setActiveTab('teachers')} style={{ cursor: 'pointer' }}>
          <div className={styles.statIcon} style={{ background: 'rgba(99, 102, 241, 0.15)', color: '#6366f1' }}>
            <HiOutlineAcademicCap />
          </div>
          <div className={styles.statInfo}>
            <span className={styles.statLabel}>کادر و معلمان زیرشاخه</span>
            <span className={styles.statValue}>{teachers.length} دبیر</span>
          </div>
        </div>

        <div className={styles.statCard} onClick={() => setActiveTab('students')} style={{ cursor: 'pointer' }}>
          <div className={styles.statIcon} style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#10b981' }}>
            <HiOutlineUsers />
          </div>
          <div className={styles.statInfo}>
            <span className={styles.statLabel}>دانش‌آموزان ثبت‌شده</span>
            <span className={styles.statValue}>{students.length} نفر</span>
          </div>
        </div>

        <div className={styles.statCard} onClick={() => setActiveTab('classes')} style={{ cursor: 'pointer' }}>
          <div className={styles.statIcon} style={{ background: 'rgba(14, 165, 233, 0.15)', color: '#0ea5e9' }}>
            <HiOutlineBuildingOffice2 />
          </div>
          <div className={styles.statInfo}>
            <span className={styles.statLabel}>کلاس‌های زیرشاخه معلمان</span>
            <span className={styles.statValue}>{classesList.length} کلاس</span>
          </div>
        </div>

        <div className={styles.statCard} onClick={() => setActiveTab('directives')} style={{ cursor: 'pointer' }}>
          <div className={styles.statIcon} style={{ background: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b' }}>
            <HiOutlineMegaphone />
          </div>
          <div className={styles.statInfo}>
            <span className={styles.statLabel}>بخشنامه‌ها و اعلان‌ها</span>
            <span className={styles.statValue}>{sentDirectives.length} مورد</span>
          </div>
        </div>
      </div>

      {/* ── 3. Main Navigation Tabs ── */}
      <div className={styles.mgmtTabs}>
        <button
          className={`${styles.mgmtTabBtn} ${activeTab === 'teachers' ? styles.mgmtTabBtnActive : ''}`}
          onClick={() => setActiveTab('teachers')}
        >
          <HiOutlineAcademicCap style={{ fontSize: '1.2rem' }} />
          👥 معلمان و کادر مدرسه (با کد اختصاصی)
        </button>

        <button
          className={`${styles.mgmtTabBtn} ${activeTab === 'students' ? styles.mgmtTabBtnActive : ''}`}
          onClick={() => setActiveTab('students')}
        >
          <HiOutlineUsers style={{ fontSize: '1.2rem' }} />
          🎓 دانش‌آموزان پایه به پایه
        </button>

        <button
          className={`${styles.mgmtTabBtn} ${activeTab === 'classes' ? styles.mgmtTabBtnActive : ''}`}
          onClick={() => setActiveTab('classes')}
        >
          <HiOutlineBuildingOffice2 style={{ fontSize: '1.2rem' }} />
          🏫 کلاس‌های زیرشاخه معلمان
        </button>

        <button
          className={`${styles.mgmtTabBtn} ${activeTab === 'directives' ? styles.mgmtTabBtnActive : ''}`}
          onClick={() => setActiveTab('directives')}
        >
          <HiOutlineMegaphone style={{ fontSize: '1.2rem' }} />
          📢 بخشنامه‌ها و شورای مدرسه
        </button>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          TAB 1: معلمان و کادر مدرسه (با کد اختصاصی)
      ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'teachers' && (
        <div className={styles.cardSection}>
          <div className={styles.sectionHeader}>
            <div>
              <h2 className={styles.sectionTitle}>
                <HiOutlineAcademicCap style={{ color: '#6366f1' }} />
                لیست اسامی معلمان و دبیران زیرشاخه مدرسه ({teachers.length} نفر)
              </h2>
              <p style={{ fontSize: '0.8125rem', color: 'var(--text-tertiary)', marginTop: '4px' }}>
                هر معلم دارای کد اختصاصی مشخص است و کلاس‌های آموزشی به عنوان زیرشاخه به او متصل می‌گردند.
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <Link
                href="/dashboard/teachers"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-color)',
                  color: 'var(--text-primary)',
                  borderRadius: 'var(--radius-lg)',
                  padding: '8px 14px',
                  fontSize: '0.8125rem',
                  fontWeight: 750,
                  textDecoration: 'none',
                  transition: 'all 0.2s ease',
                }}
              >
                <HiOutlineAcademicCap style={{ fontSize: '1.1rem', color: '#6366f1' }} />
                بانک و دیتابیس معلمان
              </Link>
              <button className={styles.addBtn} onClick={handleOpenAddTeacher}>
                <HiOutlinePlus style={{ fontSize: '1.1rem' }} />
                ثبت معلم جدید در مدرسه
              </button>
            </div>
          </div>

          <div className={styles.teachersGrid}>
            {teachers.map((teacher) => {
              // Find classes taught by this teacher
              const teacherClasses = classesList.filter((c) => c.teacher_id === teacher.id || c.teacher_name === teacher.name);

              return (
                <div key={teacher.id} className={styles.teacherCard}>
                  <div className={styles.teacherTopRow}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div className={styles.teacherAvatar}>
                        {teacher.name.charAt(0)}
                      </div>
                      <div className={styles.teacherMeta}>
                        <span className={styles.teacherName}>{teacher.name}</span>
                        <span className={styles.teacherSubject}>{teacher.subject}</span>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span
                        className={styles.teacherCodeBadge}
                        onClick={() => copyTeacherCode(teacher.code, teacher.name)}
                        title="کلیک برای کپی کد معلم"
                        style={{ cursor: 'pointer' }}
                      >
                        کد: {teacher.code}
                      </span>
                      <button
                        onClick={() => handleDeleteTeacher(teacher.id, teacher.name)}
                        className={styles.deleteDirectiveBtn}
                        title="حذف معلم"
                      >
                        <HiOutlineTrash />
                      </button>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                    <HiOutlinePhone style={{ color: '#10b981' }} />
                    <span>تلفن تماس: {teacher.phone}</span>
                  </div>

                  <div className={styles.teacherClassesRow}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', width: '100%' }}>
                      کلاس‌های زیرشاخه ({teacherClasses.length} کلاس):
                    </span>
                    {teacherClasses.length > 0 ? (
                      teacherClasses.map((cls) => (
                        <span key={cls.id} className={styles.teacherClassChip}>
                          📖 {cls.name} ({cls.grade})
                        </span>
                      ))
                    ) : (
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>هنوز کلاسی به این معلم تخصیص نیافته است.</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          TAB 2: دانش‌آموزان پایه به پایه
      ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'students' && (
        <div className={styles.cardSection}>
          <div className={styles.sectionHeader}>
            <div>
              <h2 className={styles.sectionTitle}>
                <HiOutlineUsers style={{ color: '#10b981' }} />
                مدیریت دانش‌آموزان پایه به پایه
              </h2>
              <p style={{ fontSize: '0.8125rem', color: 'var(--text-tertiary)', marginTop: '4px' }}>
                دسته‌بندی و ثبت دانش‌آموزان بر اساس پایه‌های تحصیلی و اتصال به کلاس‌های معلمان
              </p>
            </div>
            <button className={styles.addBtn} onClick={handleOpenAddStudent} style={{ background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)' }}>
              <HiOutlinePlus style={{ fontSize: '1.1rem' }} />
              ثبت دانش‌آموز جدید
            </button>
          </div>

          {/* Grade Selector Tabs */}
          <div className={styles.gradesNav}>
            <button
              className={`${styles.gradeBtn} ${selectedGrade === 'all' ? styles.gradeBtnActive : ''}`}
              onClick={() => setSelectedGrade('all')}
            >
              🌟 همه پایه‌ها ({students.length})
            </button>
            {['پایه دهم', 'پایه یازدهم', 'پایه دوازدهم', 'پایه نهم', 'پایه هشتم', 'پایه هفتم'].map((grade) => {
              const count = students.filter((s) => s.grade === grade).length;
              return (
                <button
                  key={grade}
                  className={`${styles.gradeBtn} ${selectedGrade === grade ? styles.gradeBtnActive : ''}`}
                  onClick={() => setSelectedGrade(grade)}
                >
                  {grade} ({count})
                </button>
              );
            })}
          </div>

          {/* Students Table */}
          {filteredStudents.length > 0 ? (
            <div className={styles.studentsTableWrapper}>
              <table className={styles.studentsTable}>
                <thead>
                  <tr>
                    <th>نام و نام خانوادگی</th>
                    <th>کد دانش‌آموزی</th>
                    <th>پایه تحصیلی</th>
                    <th>کلاس و معلم اختصاصی</th>
                    <th>شماره تماس ولی</th>
                    <th>عملیات</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStudents.map((std) => (
                    <tr key={std.id}>
                      <td style={{ fontWeight: 800 }}>{std.name}</td>
                      <td>
                        <span className={styles.studentCodeBadge}>{std.code}</span>
                      </td>
                      <td>
                        <span style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>{std.grade}</span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <span style={{ fontWeight: 700, fontSize: '0.84rem' }}>{std.class_name}</span>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>معلم: {std.teacher_name}</span>
                        </div>
                      </td>
                      <td style={{ direction: 'ltr', textAlign: 'right', fontFamily: 'monospace' }}>
                        {std.parent_phone}
                      </td>
                      <td>
                        <button
                          className={styles.deleteDirectiveBtn}
                          onClick={() => handleDeleteStudent(std.id, std.name)}
                          title="حذف دانش‌آموز"
                        >
                          <HiOutlineTrash />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className={styles.emptyState}>
              <HiOutlineUsers className={styles.emptyStateIcon} />
              <p style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary)' }}>
                دانش‌آموزی در {selectedGrade === 'all' ? 'مدرسه' : selectedGrade} یافت نشد
              </p>
              <p style={{ fontSize: '0.8125rem' }}>با کلیک بر روی دکمه بالا دانش‌آموزان این پایه را به سیستم اضافه کنید.</p>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          TAB 3: کلاس‌ها و زیرشاخه‌های معلمان
      ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'classes' && (
        <div className={styles.cardSection}>
          <div className={styles.sectionHeader}>
            <div>
              <h2 className={styles.sectionTitle}>
                <HiOutlineBuildingOffice2 style={{ color: '#0ea5e9' }} />
                ساختار درختی کلاس‌ها (زیرمجموعه مستقیم هر معلم)
              </h2>
              <p style={{ fontSize: '0.8125rem', color: 'var(--text-tertiary)', marginTop: '4px' }}>
                نمایش کلاس‌ها بر اساس معلم مسئول؛ هر کلاس به دبیر تخصصی خود متصل است.
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <Link
                href="/dashboard/manage-classes"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-color)',
                  color: 'var(--text-primary)',
                  borderRadius: 'var(--radius-lg)',
                  padding: '8px 14px',
                  fontSize: '0.8125rem',
                  fontWeight: 750,
                  textDecoration: 'none',
                  transition: 'all 0.2s ease',
                }}
              >
                <HiOutlineUserGroup style={{ fontSize: '1.1rem', color: '#0284c7' }} />
                سامانه ثبت کلاس‌ها و دانش‌آموزان
              </Link>
              <button className={styles.addBtn} onClick={() => handleOpenAddClass()} style={{ background: 'linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%)' }}>
                <HiOutlinePlus style={{ fontSize: '1.1rem' }} />
                ایجاد کلاس جدید
              </button>
            </div>
          </div>

          <div className={styles.classesTreeGrid}>
            {teachers.map((teacher) => {
              const teacherClasses = classesList.filter((c) => c.teacher_id === teacher.id || c.teacher_name === teacher.name);

              return (
                <div key={teacher.id} className={styles.teacherClassGroupCard}>
                  <div className={styles.teacherGroupHeader}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div className={styles.teacherAvatar} style={{ width: '38px', height: '38px', fontSize: '1rem' }}>
                        {teacher.name.charAt(0)}
                      </div>
                      <div>
                        <div style={{ fontWeight: 800, fontSize: '0.92rem' }}>{teacher.name}</div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>{teacher.subject}</div>
                      </div>
                    </div>
                    <span className={styles.teacherCodeBadge}>{teacher.code}</span>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {teacherClasses.length > 0 ? (
                      teacherClasses.map((cls) => {
                        const classStudents = students.filter((s) => s.class_name === cls.name);
                        return (
                          <div key={cls.id} className={styles.classCardSubordinate}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                              <span style={{ fontWeight: 800, fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                                {cls.name}
                              </span>
                              <button
                                className={styles.deleteDirectiveBtn}
                                onClick={() => handleDeleteClass(cls.id, cls.name)}
                                title="حذف کلاس"
                              >
                                <HiOutlineTrash />
                              </button>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                              <span>📍 {cls.grade}</span>
                              <span>🏢 {cls.room}</span>
                              <span style={{ color: '#10b981', fontWeight: 700 }}>
                                👥 {classStudents.length > 0 ? `${classStudents.length} دانش‌آموز` : `${cls.students_count || 0} دانش‌آموز`}
                              </span>
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div style={{ textAlign: 'center', padding: '16px', background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)', border: '1px dashed var(--border-color)' }}>
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', margin: '0 0 8px 0' }}>هنوز کلاسی به این معلم اختصاص نیافته است.</p>
                        <button
                          onClick={() => handleOpenAddClass(teacher.id)}
                          style={{
                            background: 'transparent',
                            border: '1px solid #6366f1',
                            color: '#6366f1',
                            borderRadius: '6px',
                            padding: '4px 10px',
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            cursor: 'pointer',
                          }}
                        >
                          + افزودن کلاس برای این معلم
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          TAB 4: بخشنامه‌ها و شورای مدرسه (کامل حفظ شده)
      ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'directives' && (
        <div className={styles.panelGrid}>
          {/* Left Card: Send Directive */}
          <div className={styles.cardSection}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>
                <HiOutlinePaperAirplane style={{ color: '#f59e0b' }} />
                ارسال بخشنامه و ابلاغ پیام مدیر به دانش‌آموزان و مدرسه
              </h2>
              <span style={{ fontSize: '0.75rem', color: '#10b981', fontWeight: 700 }}>
                ● متصل به صندوق اعلانات و زنگوله مخاطبان
              </span>
            </div>

            <form onSubmit={handleSendDirective} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ fontSize: '0.8125rem', fontWeight: 700, marginBottom: '8px', display: 'block' }}>
                  مخاطبان دریافت‌کننده پیام مدیریت:
                </label>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className={`${styles.catPill} ${directiveForm.target_audience === 'students' ? styles.catPillActive : ''}`}
                    onClick={() => setDirectiveForm({ ...directiveForm, target_audience: 'students' })}
                  >
                    🎓 دانش‌آموزان
                  </button>
                  <button
                    type="button"
                    className={`${styles.catPill} ${directiveForm.target_audience === 'teachers' ? styles.catPillActive : ''}`}
                    onClick={() => setDirectiveForm({ ...directiveForm, target_audience: 'teachers' })}
                  >
                    👥 معلمان و کادر آموزشی
                  </button>
                  <button
                    type="button"
                    className={`${styles.catPill} ${directiveForm.target_audience === 'parents' ? styles.catPillActive : ''}`}
                    onClick={() => setDirectiveForm({ ...directiveForm, target_audience: 'parents' })}
                  >
                    👨‍👩‍👧 اولیا و خانواده‌ها
                  </button>
                  <button
                    type="button"
                    className={`${styles.catPill} ${directiveForm.target_audience === 'all' ? styles.catPillActive : ''}`}
                    onClick={() => setDirectiveForm({ ...directiveForm, target_audience: 'all' })}
                  >
                    🌐 کل اعضای مدرسه (عمومی)
                  </button>
                </div>
              </div>

              {/* Title */}
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>عنوان بخشنامه یا پیام مدیریت *</label>
                <input
                  type="text"
                  className={styles.formInput}
                  placeholder="مثلاً: برنامه امتحانات میان‌ترم یا زمان تشکیل شورای دبیران..."
                  value={directiveForm.title}
                  onChange={(e) => setDirectiveForm({ ...directiveForm, title: e.target.value })}
                  required
                />
              </div>

              {/* Category */}
              <div>
                <label className={styles.formLabel} style={{ marginBottom: '6px', display: 'block' }}>
                  دسته‌بندی موضوعی بخشنامه:
                </label>
                <div className={styles.categoryPills}>
                  {Object.entries(categoryNames).map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      className={`${styles.catPill} ${directiveForm.category === key ? styles.catPillActive : ''}`}
                      onClick={() => setDirectiveForm({ ...directiveForm, category: key })}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Priority */}
              <div>
                <label className={styles.formLabel} style={{ marginBottom: '6px', display: 'block' }}>
                  سطح اهمیت:
                </label>
                <div style={{ display: 'flex', gap: '14px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '0.8125rem' }}>
                    <input
                      type="radio"
                      name="priority"
                      checked={directiveForm.priority === 'urgent'}
                      onChange={() => setDirectiveForm({ ...directiveForm, priority: 'urgent' })}
                    />
                    <span>🔴 فوری</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '0.8125rem' }}>
                    <input
                      type="radio"
                      name="priority"
                      checked={directiveForm.priority === 'important'}
                      onChange={() => setDirectiveForm({ ...directiveForm, priority: 'important' })}
                    />
                    <span>🟡 مهم</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '0.8125rem' }}>
                    <input
                      type="radio"
                      name="priority"
                      checked={directiveForm.priority === 'normal'}
                      onChange={() => setDirectiveForm({ ...directiveForm, priority: 'normal' })}
                    />
                    <span>🔵 عادی</span>
                  </label>
                </div>
              </div>

              {/* Message Body */}
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>متن کامل بخشنامه یا دستورالعمل *</label>
                <textarea
                  className={styles.formInput}
                  rows={4}
                  placeholder="متن پیام مدیریت مدرسه را بنویسید..."
                  value={directiveForm.body}
                  onChange={(e) => setDirectiveForm({ ...directiveForm, body: e.target.value })}
                  required
                  style={{ resize: 'vertical' }}
                />
              </div>

              <button
                type="submit"
                className={styles.modalSubmitBtn}
                disabled={submitting}
                style={{
                  background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                  padding: '12px 20px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  fontSize: '0.9375rem',
                }}
              >
                <HiOutlinePaperAirplane style={{ transform: 'rotate(180deg)' }} />
                {submitting ? 'در حال ابلاغ...' : 'ابلاغ مستقیم بخشنامه در سراسر مدرسه 🚀'}
              </button>
            </form>
          </div>

          {/* Right Card: Sent Directives Feed */}
          <div className={styles.cardSection}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>
                <HiOutlineDocumentText style={{ color: '#6366f1' }} />
                تاریخچه بخشنامه‌ها و پیام‌های ارسالی مدیریت
              </h2>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                {sentDirectives.length} پیام صادر شده
              </span>
            </div>

            <div className={styles.directiveFeed}>
              {sentDirectives.map((d) => (
                <div key={d.id} className={styles.directiveItem}>
                  <div className={styles.directiveItemTop}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <span className={styles.directiveItemTitle}>{d.title}</span>
                      <span
                        style={{
                          fontSize: '0.6875rem',
                          fontWeight: 700,
                          padding: '1px 7px',
                          borderRadius: '10px',
                          background: 'rgba(99, 102, 241, 0.12)',
                          color: '#6366f1',
                        }}
                      >
                        {d.target_audience === 'students' ? '🎓 دانش‌آموزان' : d.target_audience === 'teachers' ? '👥 معلمان' : d.target_audience === 'parents' ? '👨‍👩‍👧 اولیا' : '🌐 کل مدرسه'}
                      </span>
                    </div>

                    <span
                      style={{
                        fontSize: '0.6875rem',
                        fontWeight: 700,
                        padding: '2px 8px',
                        borderRadius: '12px',
                        background: d.priority === 'urgent' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                        color: d.priority === 'urgent' ? '#ef4444' : '#f59e0b',
                      }}
                    >
                      {d.priority === 'urgent' ? 'فوری' : 'مهم'}
                    </span>
                  </div>

                  <div className={styles.directiveItemBody}>{d.body}</div>

                  <div className={styles.directiveItemMeta}>
                    <span>
                      <HiOutlineUsers style={{ verticalAlign: 'middle', marginLeft: '4px' }} />
                      دریافت‌کننده: {d.recipients_count}
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span>
                        <HiOutlineClock style={{ verticalAlign: 'middle', marginLeft: '4px' }} />
                        {new Date(d.created_at).toLocaleDateString('fa-IR')}
                      </span>
                      <button
                        type="button"
                        className={styles.deleteDirectiveBtn}
                        title="حذف از تاریخچه"
                        onClick={(e) => handleDeleteDirective(d.id, e)}
                      >
                        <HiOutlineTrash />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          MODAL: ثبت معلم جدید زیرمجموعه مدرسه
      ══════════════════════════════════════════════════════════════════════ */}
      {/* ── MODAL: ثبت معلم جدید زیرمجموعه مدرسه ── */}
      {showTeacherModal && (
        <div
          className={styles.modalOverlay}
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowTeacherModal(false);
          }}
        >
          <div className={styles.modalDialog} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>
                <HiOutlineAcademicCap style={{ color: '#6366f1' }} />
                ثبت معلم جدید زیرمجموعه {schoolData.name}
              </h3>
              <button
                type="button"
                className={styles.modalCloseBtn}
                onClick={() => setShowTeacherModal(false)}
                aria-label="بستن"
              >
                <HiOutlineXMark />
              </button>
            </div>

            <form onSubmit={handleSaveTeacher} noValidate style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>نام و نام خانوادگی دبیر *</label>
                <input
                  type="text"
                  className={styles.formInput}
                  placeholder="مثلاً: دکتر علی رضایی"
                  value={newTeacher.name}
                  onChange={(e) => setNewTeacher({ ...newTeacher, name: e.target.value })}
                  autoFocus
                />
              </div>

              <div className={styles.modalRow2Col}>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>کد اختصاصی معلم</label>
                  <input
                    type="text"
                    className={styles.formInput}
                    style={{ fontFamily: 'monospace', letterSpacing: '1px' }}
                    placeholder="مثال: TCH-106 (خودکار)"
                    value={newTeacher.code}
                    onChange={(e) => setNewTeacher({ ...newTeacher, code: e.target.value })}
                  />
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>درس / رشته تخصصی *</label>
                  <select
                    className={styles.formSelect}
                    value={newTeacher.subject}
                    onChange={(e) => setNewTeacher({ ...newTeacher, subject: e.target.value })}
                  >
                    <option value="ریاضی و هندسه">ریاضی و هندسه</option>
                    <option value="فیزیک">فیزیک</option>
                    <option value="زیست‌شناسی">زیست‌شناسی</option>
                    <option value="شیمی">شیمی</option>
                    <option value="ادبیات فارسی">ادبیات فارسی</option>
                    <option value="زبان انگلیسی">زبان انگلیسی</option>
                    <option value="عربی">عربی</option>
                    <option value="دینی و قرآن">دینی و قرآن</option>
                    <option value="مشاوره و برنامه ریزی">مشاوره و برنامه ریزی</option>
                  </select>
                </div>
              </div>

              <div className={styles.formGroup}>
                <label className={styles.formLabel}>شماره تماس دبیر</label>
                <input
                  type="tel"
                  className={styles.formInput}
                  placeholder="0912xxxxxxx"
                  value={newTeacher.phone}
                  onChange={(e) => setNewTeacher({ ...newTeacher, phone: e.target.value })}
                  dir="ltr"
                />
              </div>

              <div className={styles.modalFooter}>
                <button type="button" className={styles.modalCancelBtn} onClick={() => setShowTeacherModal(false)}>
                  انصراف
                </button>
                <button type="submit" className={styles.modalSubmitBtn}>
                  ثبت معلم در مدرسه
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          MODAL: ثبت دانش‌آموز جدید پایه به پایه
      ══════════════════════════════════════════════════════════════════════ */}
      {showStudentModal && (
        <div className={styles.modalOverlay} onClick={() => setShowStudentModal(false)}>
          <div className={styles.modalDialog} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>
                <HiOutlineUsers style={{ color: '#10b981' }} />
                ثبت دانش‌آموز جدید در مدرسه
              </h3>
              <button className={styles.modalCloseBtn} onClick={() => setShowStudentModal(false)}>
                <HiOutlineXMark />
              </button>
            </div>

            <form onSubmit={handleSaveStudent} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>نام و نام خانوادگی دانش‌آموز *</label>
                <input
                  type="text"
                  className={styles.formInput}
                  placeholder="مثلاً: امیرعلی محمدی"
                  value={newStudent.name}
                  onChange={(e) => setNewStudent({ ...newStudent, name: e.target.value })}
                  required
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>کد دانش‌آموزی *</label>
                  <input
                    type="text"
                    className={styles.formInput}
                    style={{ fontFamily: 'monospace' }}
                    value={newStudent.code}
                    onChange={(e) => setNewStudent({ ...newStudent, code: e.target.value })}
                    required
                  />
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>پایه تحصیلی *</label>
                  <select
                    className={styles.formSelect}
                    value={newStudent.grade}
                    onChange={(e) => setNewStudent({ ...newStudent, grade: e.target.value })}
                  >
                    <option value="پایه دهم">پایه دهم</option>
                    <option value="پایه یازدهم">پایه یازدهم</option>
                    <option value="پایه دوازدهم">پایه دوازدهم</option>
                    <option value="پایه نهم">پایه نهم</option>
                    <option value="پایه هشتم">پایه هشتم</option>
                    <option value="پایه هفتم">پایه هفتم</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>کلاس آموزشی</label>
                  <select
                    className={styles.formSelect}
                    value={newStudent.class_name}
                    onChange={(e) => {
                      const selectedCls = classesList.find((c) => c.name === e.target.value);
                      setNewStudent({
                        ...newStudent,
                        class_name: e.target.value,
                        teacher_name: selectedCls ? selectedCls.teacher_name : newStudent.teacher_name,
                      });
                    }}
                  >
                    {classesList.map((c) => (
                      <option key={c.id} value={c.name}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>معلم تخصصی</label>
                  <select
                    className={styles.formSelect}
                    value={newStudent.teacher_name}
                    onChange={(e) => setNewStudent({ ...newStudent, teacher_name: e.target.value })}
                  >
                    {teachers.map((t) => (
                      <option key={t.id} value={t.name}>
                        {t.name} ({t.code})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className={styles.formGroup}>
                <label className={styles.formLabel}>شماره تماس ولی دانش‌آموز</label>
                <input
                  type="tel"
                  className={styles.formInput}
                  placeholder="0912xxxxxxx"
                  value={newStudent.parent_phone}
                  onChange={(e) => setNewStudent({ ...newStudent, parent_phone: e.target.value })}
                />
              </div>

              <div className={styles.modalFooter}>
                <button type="button" className={styles.modalCancelBtn} onClick={() => setShowStudentModal(false)}>
                  انصراف
                </button>
                <button
                  type="submit"
                  className={styles.modalSubmitBtn}
                  style={{ background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)' }}
                >
                  ثبت دانش‌آموز
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          MODAL: ایجاد کلاس جدید زیرشاخه معلم
      ══════════════════════════════════════════════════════════════════════ */}
      {showClassModal && (
        <div className={styles.modalOverlay} onClick={() => setShowClassModal(false)}>
          <div className={styles.modalDialog} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>
                <HiOutlineBuildingOffice2 style={{ color: '#0ea5e9' }} />
                ایجاد کلاس جدید و انتساب به معلم
              </h3>
              <button className={styles.modalCloseBtn} onClick={() => setShowClassModal(false)}>
                <HiOutlineXMark />
              </button>
            </div>

            <form onSubmit={handleSaveClass} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>نام کلاس یا عنوان درس *</label>
                <input
                  type="text"
                  className={styles.formInput}
                  placeholder="مثلاً: کلاس ۱۰۱ - حسابان و ریاضیات گسسته"
                  value={newClass.name}
                  onChange={(e) => setNewClass({ ...newClass, name: e.target.value })}
                  required
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>معلم سرپرست (کد اختصاصی) *</label>
                  <select
                    className={styles.formSelect}
                    value={newClass.teacher_id}
                    onChange={(e) => setNewClass({ ...newClass, teacher_id: e.target.value })}
                    required
                  >
                    {teachers.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} ({t.code} - {t.subject})
                      </option>
                    ))}
                  </select>
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>پایه تحصیلی *</label>
                  <select
                    className={styles.formSelect}
                    value={newClass.grade}
                    onChange={(e) => setNewClass({ ...newClass, grade: e.target.value })}
                  >
                    <option value="پایه دهم">پایه دهم</option>
                    <option value="پایه یازدهم">پایه یازدهم</option>
                    <option value="پایه دوازدهم">پایه دوازدهم</option>
                    <option value="پایه نهم">پایه نهم</option>
                    <option value="پایه هشتم">پایه هشتم</option>
                    <option value="پایه هفتم">پایه هفتم</option>
                  </select>
                </div>
              </div>

              <div className={styles.formGroup}>
                <label className={styles.formLabel}>محل تشکیل کلاس یا اتاق</label>
                <input
                  type="text"
                  className={styles.formInput}
                  placeholder="مثلاً: سالن ۲۰۱، یا آزمایشگاه فیزیک"
                  value={newClass.room}
                  onChange={(e) => setNewClass({ ...newClass, room: e.target.value })}
                />
              </div>

              <div className={styles.modalFooter}>
                <button type="button" className={styles.modalCancelBtn} onClick={() => setShowClassModal(false)}>
                  انصراف
                </button>
                <button
                  type="submit"
                  className={styles.modalSubmitBtn}
                  style={{ background: 'linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%)' }}
                >
                  ثبت کلاس زیرشاخه معلم
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
