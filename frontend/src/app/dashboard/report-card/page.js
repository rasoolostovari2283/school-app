'use client';
import { useEffect, useState, useMemo } from 'react';
import useAuthStore from '../../../stores/authStore';
import api from '../../../lib/api';
import Link from 'next/link';
import toast, { Toaster } from 'react-hot-toast';
import {
  HiOutlineDocumentText,
  HiOutlinePrinter,
  HiOutlineAcademicCap,
  HiOutlineCheckCircle,
  HiOutlineExclamationCircle,
  HiOutlineUser,
  HiOutlineChatBubbleLeftRight,
  HiOutlineSparkles,
  HiOutlineArrowRight,
  HiOutlineTrophy,
  HiOutlineShieldCheck,
  HiOutlineCalculator,
  HiOutlinePlus,
  HiOutlineUserGroup,
  HiOutlineMagnifyingGlass,
  HiOutlineEye,
  HiOutlineXMark,
  HiOutlineBuildingOffice2,
  HiOutlinePaperAirplane,
  HiOutlinePhone,
  HiOutlineXCircle,
  HiOutlineUserPlus,
} from 'react-icons/hi2';
import styles from './report-card.module.css';

export default function ReportCardPage() {
  const [mounted, setMounted] = useState(false);
  const { user, isLoading: authLoading } = useAuthStore();
  const isParent = user?.role === 'parent';
  const isStudent = user?.role === 'student';
  const isAdmin = user?.role === 'admin' || user?.role === 'manager';
  const isTeacher = user?.role === 'teacher' || isAdmin;

  // Mode: 'management_overview' (کارنامه‌ها و نمرات کل به تفکیک معلمان) | 'class_session' (دفتر کلاسی)
  const [activeModeTab, setActiveModeTab] = useState(isAdmin ? 'management_overview' : 'class_session');

  // Ensure non-admin teachers always stay on class_session mode
  useEffect(() => {
    if (!isAdmin) {
      setActiveModeTab('class_session');
    }
  }, [isAdmin]);

  // Shared Gradebook Reports State (نتایج و نمرات ارسالی معلمان به مدیریت)
  const [sharedReports, setSharedReports] = useState([]);
  const [teacherFilter, setTeacherFilter] = useState('all');
  const [mgmtSearchQuery, setMgmtSearchQuery] = useState('');

  // Share Modal State (جهت ارسال لیست نمرات به مدیریت)
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [shareNote, setShareNote] = useState('');
  const [isSharing, setIsSharing] = useState(false);

  // Detailed Modal State (جهت مشاهده ریز کارنامه ارسالی توسط مدیریت)
  const [selectedReportDetail, setSelectedReportDetail] = useState(null);

  // ── Student & Parent State ──
  const [reportData, setReportData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedChildId, setSelectedChildId] = useState(null);

  // ── Teacher State ──
  const [classes, setClasses] = useState([]);
  const [selectedClassId, setSelectedClassId] = useState('');
  const [gradebookData, setGradebookData] = useState(null);
  const [loadingTeacher, setLoadingTeacher] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [previewStudent, setPreviewStudent] = useState(null);
  const [previewReportData, setPreviewReportData] = useState(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  // Cell-level score states for instant editing & visual feedback
  const [cellValues, setCellValues] = useState({});
  const [savingCells, setSavingCells] = useState({});
  const [savedCells, setSavedCells] = useState({});
  const [cellErrors, setCellErrors] = useState({});
  const [savingAll, setSavingAll] = useState(false);

  // Add Category Modal State
  const [showCatModal, setShowCatModal] = useState(false);
  const [newCatTitle, setNewCatTitle] = useState('');
  const [newCatWeight, setNewCatWeight] = useState('1.0');
  const [newCatMaxScore, setNewCatMaxScore] = useState('20');

  // Add Student to Class Modal State
  const [showAddStudentModal, setShowAddStudentModal] = useState(false);
  const [availableStudents, setAvailableStudents] = useState([]);
  const [loadingRoster, setLoadingRoster] = useState(false);
  const [selectedStudentToAdd, setSelectedStudentToAdd] = useState('');
  const [newStudentForm, setNewStudentForm] = useState({
    display_name: '',
    student_code: '',
    phone: '',
  });
  const [addStudentMode, setAddStudentMode] = useState('existing'); // 'existing' | 'new'
  const [isSubmittingStudent, setIsSubmittingStudent] = useState(false);

  // Hydration Mount
  useEffect(() => {
    setMounted(true);
  }, []);

  // Load shared gradebook reports from teachers to management
  useEffect(() => {
    try {
      const saved = localStorage.getItem('school_shared_gradebook_reports');
      if (saved) {
        const parsed = JSON.parse(saved);
        const filtered = Array.isArray(parsed) ? parsed.filter((r) => !r.id?.startsWith('gb-seed-')) : [];
        setSharedReports(filtered);
        localStorage.setItem('school_shared_gradebook_reports', JSON.stringify(filtered));
      } else {
        setSharedReports([]);
      }
    } catch (e) {
      setSharedReports([]);
    }
  }, []);

  const handleShareWithManagement = async () => {
    if (!gradebookData || !gradebookData.students?.length) {
      toast.error('اطلاعات نمراتی برای اشتراک‌گذاری وجود ندارد');
      return;
    }
    setIsSharing(true);
    try {
      const currentTeacherName = user?.display_name || user?.name || 'دبیر محترم';
      const currentTeacherCode = user?.personnel_code || 'TCH-101';
      const selClass = classes.find((c) => c.id === selectedClassId);

      const stList = gradebookData.students || [];
      const failing = stList
        .filter((st) => st.weightedAverage != null && st.weightedAverage < 12)
        .map((st) => ({
          id: st.id,
          name: st.display_name,
          score: st.weightedAverage,
          reason: 'نمره کمتر از حد نصاب قبولی (۱۲) - نیازمند پیگیری و جبران',
        }));

      const newReport = {
        id: `gb-${Date.now()}`,
        teacher_name: currentTeacherName,
        teacher_code: currentTeacherCode,
        subject: selClass?.subject || 'عمومی',
        class_name: selClass?.name || 'کلاس انتخابی',
        grade: selClass?.grade || 'پایه دهم',
        date: new Date().toLocaleDateString('fa-IR'),
        time: new Date().toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }),
        created_at: new Date().toISOString(),
        students_count: stList.length,
        class_average: classStats.average !== 0 ? parseFloat(classStats.average) : 0,
        top_score: classStats.topScore !== 0 ? parseFloat(classStats.topScore) : 0,
        pass_rate: classStats.passRate !== 0 ? parseFloat(classStats.passRate) : 0,
        categories: (gradebookData.categories || []).map((c) => c.title),
        failing_students: failing,
        students: stList.map((st) => ({
          id: st.id,
          name: st.display_name,
          code: st.student_code || 'STD-403',
          average: st.weightedAverage,
          status: st.weightedAverage != null ? (st.weightedAverage >= 12 ? 'passed' : 'failed') : 'no_score',
        })),
        teacher_note: shareNote.trim() || 'کارنامه و لیست نمرات کلاس توسط دبیر تایید و برای دفتر مدیریت ارسال شد.',
        status: 'submitted',
      };

      const updated = [newReport, ...sharedReports];
      setSharedReports(updated);
      try {
        localStorage.setItem('school_shared_gradebook_reports', JSON.stringify(updated));
      } catch (e) {}

      // Broadcast notification to school management
      try {
        await api.post('/notifications/broadcast', {
          title: `📊 کارنامه و لیست نمرات: ${newReport.class_name}`,
          body: `دبیر محترم ${newReport.teacher_name} کارنامه و نمرات کلاس ${newReport.class_name} را با میانگین ${newReport.class_average} برای مدیریت ارسال فرمودند.`,
          category: 'academic',
          priority: 'normal',
          target_audience: 'admin',
          is_mandatory: false,
        });
      } catch (e) {}

      toast.success(`لیست نمرات کلاس «${newReport.class_name}» با موفقیت برای مدیریت مجتمع ارسال شد 🚀`, { duration: 5000 });
      setIsShareModalOpen(false);
      setShareNote('');
    } catch (err) {
      toast.error('خطا در ارسال کارنامه به مدیریت');
    } finally {
      setIsSharing(false);
    }
  };

  const handleAcknowledgeReport = (reportId) => {
    const updated = sharedReports.map((r) => (r.id === reportId ? { ...r, status: 'acknowledged' } : r));
    setSharedReports(updated);
    try {
      localStorage.setItem('school_shared_gradebook_reports', JSON.stringify(updated));
    } catch (e) {}
    toast.success('رویت و تایید کارنامه کلاسی توسط مدیریت با موفقیت ثبت شد ✓');
  };

  // Initial Data Fetching
  useEffect(() => {
    if (!mounted || authLoading || !user) return;
    if (isTeacher) {
      loadTeacherClasses();
    } else {
      fetchReportCard(selectedChildId);
    }
  }, [mounted, authLoading, user?.id, user?.role, selectedChildId]);

  // Load Teacher Classes
  const loadTeacherClasses = async () => {
    try {
      setLoadingTeacher(true);
      const res = await api.get('/classes');
      const list = res.data?.data?.classes || [];
      setClasses(list);
      if (list.length > 0) {
        const targetId = selectedClassId || list[0].id;
        setSelectedClassId(targetId);
        await fetchClassGradebook(targetId);
      }
    } catch (err) {
      console.error('Error fetching classes:', err);
      toast.error('خطا در بارگذاری لیست کلاس‌ها');
    } finally {
      setLoadingTeacher(false);
    }
  };

  // Fetch Class Gradebook when selectedClassId changes
  useEffect(() => {
    if (mounted && isTeacher && selectedClassId) {
      fetchClassGradebook(selectedClassId);
    }
  }, [selectedClassId]);

  const fetchClassGradebook = async (classId) => {
    try {
      setLoadingTeacher(true);
      const res = await api.get(`/gradebook/classes/${classId}`);
      if (res.data?.success) {
        const data = res.data.data;
        setGradebookData(data);

        // Pre-populate controlled cells
        const initialMap = {};
        data.students?.forEach((st) => {
          data.categories?.forEach((cat) => {
            const sc = st.scores?.[cat.id]?.score;
            initialMap[`${st.id}_${cat.id}`] = sc != null ? String(sc) : '';
          });
        });
        setCellValues(initialMap);
      }
    } catch (err) {
      console.error('Error fetching class gradebook:', err);
      toast.error('خطا در دریافت لیست نمرات کلاس');
    } finally {
      setLoadingTeacher(false);
    }
  };

  // Fetch Report Card for Student/Parent
  const fetchReportCard = async (studentId) => {
    setLoading(true);
    setError(null);
    try {
      const url = studentId
        ? `/gradebook/report-card/${studentId}`
        : '/gradebook/report-card';
      const res = await api.get(url);
      if (res.data?.success) {
        setReportData(res.data.data);
        if (
          !selectedChildId &&
          res.data.data.availableChildren &&
          res.data.data.availableChildren.length > 0
        ) {
          setSelectedChildId(res.data.data.student.id);
        }
      } else {
        setError(res.data?.message || 'خطا در بارگذاری کارنامه');
      }
    } catch (err) {
      console.error('Report card error:', err);
      setError(err.response?.data?.message || 'خطا در برقراری ارتباط با سرور کارنامه');
    } finally {
      setLoading(false);
    }
  };

  // Cell input change with automatic Persian/Arabic digit conversion
  const handleCellChange = (studentId, categoryId, rawVal) => {
    const cellKey = `${studentId}_${categoryId}`;
    const cleaned = rawVal
      .replace(/[۰-۹]/g, (d) => '0123456789'['۰۱۲۳۴۵۶۷۸۹'.indexOf(d)])
      .replace(/[٠-٩]/g, (d) => '0123456789'['٠١٢٣٤٥٦٧٨٩'.indexOf(d)])
      .replace(/[/,،]/g, '.')
      .replace(/[^0-9.]/g, '');

    setCellValues((prev) => ({ ...prev, [cellKey]: cleaned }));
    setCellErrors((prev) => {
      const next = { ...prev };
      delete next[cellKey];
      return next;
    });
  };

  // Recalculate average in local state
  const recalcStudentAverage = (studentId, categoryId, newScore) => {
    setGradebookData((prev) => {
      if (!prev) return prev;
      const updatedStudents = prev.students.map((st) => {
        if (st.id === studentId) {
          const nextScores = { ...st.scores };
          if (newScore === null) {
            delete nextScores[categoryId];
          } else {
            nextScores[categoryId] = { ...(nextScores[categoryId] || {}), score: newScore };
          }

          let totalWeight = 0;
          let weightedSum = 0;
          prev.categories.forEach((cat) => {
            const sc = nextScores[cat.id]?.score;
            if (sc != null) {
              const w = cat.weight || 1.0;
              weightedSum += sc * w;
              totalWeight += w;
            }
          });

          const newAvg = totalWeight > 0 ? parseFloat((weightedSum / totalWeight).toFixed(2)) : null;
          return {
            ...st,
            scores: nextScores,
            weightedAverage: newAvg,
          };
        }
        return st;
      });

      return { ...prev, students: updatedStudents };
    });
  };

  // Teacher Score Entry Save (Per cell on blur / enter)
  const handleSaveCell = async (studentId, categoryId) => {
    const cellKey = `${studentId}_${categoryId}`;
    const raw = cellValues[cellKey]?.trim() ?? '';

    // If emptied, delete score
    if (raw === '') {
      try {
        setSavingCells((prev) => ({ ...prev, [cellKey]: true }));
        await api.post('/gradebook/scores', {
          category_id: categoryId,
          student_id: studentId,
          score: '',
        });
        setSavedCells((prev) => ({ ...prev, [cellKey]: true }));
        setTimeout(() => {
          setSavedCells((prev) => {
            const next = { ...prev };
            delete next[cellKey];
            return next;
          });
        }, 1500);
        recalcStudentAverage(studentId, categoryId, null);
      } catch (err) {
        console.error('Error clearing score:', err);
      } finally {
        setSavingCells((prev) => {
          const next = { ...prev };
          delete next[cellKey];
          return next;
        });
      }
      return;
    }

    const num = parseFloat(raw);
    if (isNaN(num) || num < 0 || num > 20) {
      setCellErrors((prev) => ({ ...prev, [cellKey]: 'بین ۰ تا ۲۰' }));
      toast.error('نمره باید بین ۰ تا ۲۰ باشد');
      return;
    }

    try {
      setSavingCells((prev) => ({ ...prev, [cellKey]: true }));
      await api.post('/gradebook/scores', {
        category_id: categoryId,
        student_id: studentId,
        score: num,
      });

      setSavedCells((prev) => ({ ...prev, [cellKey]: true }));
      setTimeout(() => {
        setSavedCells((prev) => {
          const next = { ...prev };
          delete next[cellKey];
          return next;
        });
      }, 1500);

      recalcStudentAverage(studentId, categoryId, num);
      toast.success('نمره با موفقیت ذخیره شد ✓', { id: 'score-ok', duration: 1000 });
    } catch (err) {
      console.error('Error saving score:', err);
      toast.error('خطا در ثبت نمره در سرور');
    } finally {
      setSavingCells((prev) => {
        const next = { ...prev };
        delete next[cellKey];
        return next;
      });
    }
  };

  // Batch Save all edited scores
  const handleSaveAll = async () => {
    if (!gradebookData?.students || !gradebookData?.categories) return;
    const batch = [];
    for (const st of gradebookData.students) {
      for (const cat of gradebookData.categories) {
        const key = `${st.id}_${cat.id}`;
        const val = cellValues[key];
        if (val !== undefined && val !== '') {
          batch.push({
            student_id: st.id,
            category_id: cat.id,
            score: val,
          });
        }
      }
    }

    try {
      setSavingAll(true);
      await api.post('/gradebook/scores/batch', { scores: batch });
      toast.success('تمام نمرات این کلاس با موفقیت ذخیره شدند ✓');
      await fetchClassGradebook(selectedClassId);
    } catch (err) {
      toast.error('خطا در ذخیره جمعی نمرات');
    } finally {
      setSavingAll(false);
    }
  };

  // Create Exam Category
  const handleCreateCategory = async (e) => {
    e.preventDefault();
    if (!newCatTitle.trim()) {
      toast.error('لطفاً عنوان آزمون را وارد کنید');
      return;
    }

    const targetClass = selectedClassId || (classes.length > 0 ? classes[0].id : null);
    if (!targetClass) {
      toast.error('هیچ کلاسی یافت نشد. لطفاً ابتدا کلاس را مشخص کنید.');
      return;
    }

    try {
      const res = await api.post('/gradebook/categories', {
        class_id: targetClass,
        title: newCatTitle.trim(),
        weight: parseFloat(newCatWeight) || 1.0,
        max_score: parseFloat(newCatMaxScore) || 20.0,
      });

      if (res.data?.success) {
        toast.success(`آزمون جدید «${newCatTitle.trim()}» با موفقیت اضافه شد! 🎉`);
        setShowCatModal(false);
        setNewCatTitle('');
        setNewCatWeight('1.0');
        setNewCatMaxScore('20');
        if (!selectedClassId) {
          setSelectedClassId(targetClass);
        }
        await fetchClassGradebook(targetClass);
      }
    } catch (err) {
      console.error('Error creating category:', err);
      toast.error(err.response?.data?.message || 'خطا در ایجاد آزمون جدید');
    }
  };

  // Open Add Student Modal & Fetch available students
  const handleOpenAddStudentModal = async () => {
    const currentClsId = selectedClassId || (classes.length > 0 ? classes[0].id : null);
    if (!currentClsId) {
      toast.error('ابتدا یک کلاس را انتخاب نمایید');
      return;
    }
    if (!selectedClassId && currentClsId) {
      setSelectedClassId(currentClsId);
    }
    setShowAddStudentModal(true);
    setLoadingRoster(true);
    try {
      const res = await api.get(`/classes/${currentClsId}/roster`);
      if (res.data?.success) {
        setAvailableStudents(res.data.data?.available_students || []);
      }
    } catch (err) {
      console.error('Error fetching roster:', err);
    } finally {
      setLoadingRoster(false);
    }
  };

  // Submit Add Student to Class
  const handleAddStudentToClass = async (e) => {
    e.preventDefault();
    const currentClsId = selectedClassId || (classes.length > 0 ? classes[0].id : null);
    if (!currentClsId) {
      toast.error('کلاس انتخابی نامعتبر است');
      return;
    }

    setIsSubmittingStudent(true);
    try {
      let payload = {};
      if (addStudentMode === 'existing') {
        if (!selectedStudentToAdd) {
          toast.error('لطفاً یک دانش‌آموز را انتخاب کنید');
          setIsSubmittingStudent(false);
          return;
        }
        payload = { student_id: selectedStudentToAdd };
      } else {
        if (!newStudentForm.display_name.trim()) {
          toast.error('نام و نام خانوادگی دانش‌آموز الزامی است');
          setIsSubmittingStudent(false);
          return;
        }
        payload = {
          display_name: newStudentForm.display_name.trim(),
          student_code: newStudentForm.student_code.trim(),
          phone: newStudentForm.phone.trim(),
        };
      }

      const res = await api.post(`/classes/${currentClsId}/students`, payload);
      if (res.data?.success) {
        toast.success(res.data.message || 'دانش‌آموز با موفقیت به کلاس اضافه شد 🎉');
        setShowAddStudentModal(false);
        setSelectedStudentToAdd('');
        setNewStudentForm({ display_name: '', student_code: '', phone: '' });
        await fetchClassGradebook(currentClsId);
      }
    } catch (err) {
      console.error('Error adding student to class:', err);
      toast.error(err.response?.data?.message || 'خطا در افزودن دانش‌آموز');
    } finally {
      setIsSubmittingStudent(false);
    }
  };

  // Open Official Report Card Modal for Student
  const handleOpenPreviewModal = async (student) => {
    setPreviewStudent(student);
    try {
      setLoadingPreview(true);
      const res = await api.get(`/gradebook/report-card/${student.id}`);
      if (res.data?.success) {
        setPreviewReportData(res.data.data);
      }
    } catch (err) {
      console.error('Error loading report card preview:', err);
      toast.error('خطا در بارگذاری کارنامه');
    } finally {
      setLoadingPreview(false);
    }
  };

  // Class KPI Stats
  const classStats = useMemo(() => {
    if (!gradebookData?.students || gradebookData.students.length === 0) {
      return { totalStudents: 0, average: 0, topScore: 0, passRate: 0 };
    }
    const students = gradebookData.students;
    const validAvgs = students
      .map((s) => s.weightedAverage)
      .filter((avg) => avg != null);

    const totalStudents = students.length;
    const avgSum = validAvgs.reduce((a, b) => a + b, 0);
    const average = validAvgs.length > 0 ? (avgSum / validAvgs.length).toFixed(2) : 0;
    const topScore = validAvgs.length > 0 ? Math.max(...validAvgs) : 0;
    const passedCount = validAvgs.filter((a) => a >= 12).length;
    const passRate = validAvgs.length > 0 ? Math.round((passedCount / validAvgs.length) * 100) : 0;

    return { totalStudents, average, topScore, passRate };
  }, [gradebookData]);

  // Filtered Students
  const filteredStudents = useMemo(() => {
    if (!gradebookData?.students) return [];
    if (!searchQuery.trim()) return gradebookData.students;
    const q = searchQuery.toLowerCase().trim();
    return gradebookData.students.filter(
      (s) =>
        s.display_name.toLowerCase().includes(q) ||
        (s.student_code && s.student_code.toLowerCase().includes(q))
    );
  }, [gradebookData, searchQuery]);

  const handlePrint = () => {
    window.print();
  };

  const getScoreColorClass = (score) => {
    if (score == null) return '';
    if (score >= 18) return styles.scoreExcellent;
    if (score >= 15) return styles.scoreGood;
    if (score >= 12) return styles.scoreFair;
    return styles.scorePoor;
  };

  const getProgressBarColor = (score) => {
    if (score == null) return '#94a3b8';
    if (score >= 18) return 'linear-gradient(90deg, #10b981, #34d399)';
    if (score >= 15) return 'linear-gradient(90deg, #3b82f6, #60a5fa)';
    if (score >= 12) return 'linear-gradient(90deg, #f59e0b, #fbbf24)';
    return 'linear-gradient(90deg, #ef4444, #f87171)';
  };

  // Management Shared Reports Filters & Calculations
  const filteredSharedReports = useMemo(() => {
    return sharedReports.filter((r) => {
      const matchesTeacher =
        teacherFilter === 'all' ||
        r.teacher_code === teacherFilter ||
        r.teacher_name === teacherFilter;
      const matchesSearch =
        !mgmtSearchQuery.trim() ||
        (r.teacher_name && r.teacher_name.toLowerCase().includes(mgmtSearchQuery.toLowerCase())) ||
        (r.class_name && r.class_name.toLowerCase().includes(mgmtSearchQuery.toLowerCase())) ||
        (r.subject && r.subject.toLowerCase().includes(mgmtSearchQuery.toLowerCase())) ||
        (r.failing_students || []).some(
          (s) => s.name && s.name.toLowerCase().includes(mgmtSearchQuery.toLowerCase())
        );
      return matchesTeacher && matchesSearch;
    });
  }, [sharedReports, teacherFilter, mgmtSearchQuery]);

  const uniqueTeachers = useMemo(() => {
    return Array.from(
      new Map(
        sharedReports.map((r) => [r.teacher_code || r.teacher_name, { name: r.teacher_name, code: r.teacher_code }])
      ).values()
    );
  }, [sharedReports]);

  const mgmtOverviewStats = useMemo(() => {
    const totalClasses = sharedReports.length;
    const totalStudents = sharedReports.reduce((acc, r) => acc + (r.students_count || 0), 0);
    const avgSum = sharedReports.reduce((acc, r) => acc + (r.class_average || 0), 0);
    const schoolAvg = totalClasses > 0 ? (avgSum / totalClasses).toFixed(2) : 0;
    const passRateSum = sharedReports.reduce((acc, r) => acc + (r.pass_rate || 0), 0);
    const schoolPassRate = totalClasses > 0 ? Math.round(passRateSum / totalClasses) : 0;
    return { totalClasses, totalStudents, schoolAvg, schoolPassRate };
  }, [sharedReports]);

  // ══════════════════════════════════════════════════════════
  // VIEW 1: TEACHER & ADMIN EXPERIENCE (ROSTER & SCORE ENTRY)
  // ══════════════════════════════════════════════════════════
  if (!mounted || authLoading) {
    return (
      <div className={styles.container}>
        <div className="skeleton" style={{ height: 420, borderRadius: 'var(--radius-2xl)' }} />
      </div>
    );
  }

  if (isTeacher) {
    return (
      <div className={styles.container}>
        <Toaster position="top-center" />

        {/* ── Mode Switcher Tabs for Teachers & Management (Only for School Management / Admins) ── */}
        {isAdmin && (
          <div className={styles.modeTabs}>
            <button
              type="button"
              className={`${styles.modeTabBtn} ${activeModeTab === 'management_overview' ? styles.modeTabBtnActive : ''}`}
              onClick={() => setActiveModeTab('management_overview')}
            >
              <div className={styles.modeTabIconBox}>
                <HiOutlineBuildingOffice2 className={styles.modeTabIcon} />
              </div>
              <div className={styles.modeTabContent}>
                <span className={styles.modeTabTitle}>نمرات کل مدرسه</span>
                <span className={styles.modeTabSub}>
                  به تفکیک معلمان ({sharedReports.length} کلاس ثبت‌شده)
                </span>
              </div>
            </button>
            <button
              type="button"
              className={`${styles.modeTabBtn} ${activeModeTab === 'class_session' ? styles.modeTabBtnActive : ''}`}
              onClick={() => setActiveModeTab('class_session')}
            >
              <div className={styles.modeTabIconBox}>
                <HiOutlineAcademicCap className={styles.modeTabIcon} />
              </div>
              <div className={styles.modeTabContent}>
                <span className={styles.modeTabTitle}>ثبت و ورود نمرات کلاسی</span>
                <span className={styles.modeTabSub}>
                  {classes.find((c) => c.id === selectedClassId)?.name
                    ? `کلاس: ${classes.find((c) => c.id === selectedClassId).name}`
                    : 'انتخاب و ورود نمرات کلاس'}
                </span>
              </div>
            </button>
          </div>
        )}

        {isAdmin && activeModeTab === 'management_overview' ? (
          /* ══════════════════════════════════════════════════════════════════
             MANAGEMENT OVERVIEW (نمای مدیریت: کارنامه‌ها و نمرات به تفکیک معلمان)
             ══════════════════════════════════════════════════════════════════ */
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Top KPI Cards for Management */}
            <div className={styles.classStatsGrid}>
              <div className={styles.statCard}>
                <div className={styles.statHeader}>
                  <span className={styles.statLabel}>کل کلاس‌های ارسالی معلمان</span>
                  <HiOutlineBuildingOffice2 className={styles.statIcon} style={{ color: '#818cf8' }} />
                </div>
                <div className={styles.statValue}>{mgmtOverviewStats.totalClasses} کلاس</div>
                <span className={styles.statSub}>تعداد کل کلاس‌های ثبت‌شده توسط معلمان</span>
              </div>

              <div className={styles.statCard}>
                <div className={styles.statHeader}>
                  <span className={styles.statLabel}>میانگین نمرات کل مدرسه</span>
                  <HiOutlineSparkles className={styles.statIcon} style={{ color: '#3b82f6' }} />
                </div>
                <div className={styles.statValue} style={{ color: '#3b82f6' }}>
                  {mgmtOverviewStats.schoolAvg} <span style={{ fontSize: '1rem', opacity: 0.8 }}>از ۲۰</span>
                </div>
                <span className={styles.statSub}>میانگین کلی نمرات تمام کلاس‌های مدرسه</span>
              </div>

              <div className={styles.statCard}>
                <div className={styles.statHeader}>
                  <span className={styles.statLabel}>درصد کل قبولی مدرسه</span>
                  <HiOutlineCheckCircle className={styles.statIcon} style={{ color: '#10b981' }} />
                </div>
                <div className={styles.statValue} style={{ color: '#10b981' }}>
                  {mgmtOverviewStats.schoolPassRate}٪
                </div>
                <span className={styles.statSub}>درصد دانش‌آموزان با نمره بالاتر از ۱۲</span>
              </div>

              <div className={styles.statCard}>
                <div className={styles.statHeader}>
                  <span className={styles.statLabel}>تعداد کل دانش‌آموزان ارزیابی‌شده</span>
                  <HiOutlineUserGroup className={styles.statIcon} style={{ color: '#f59e0b' }} />
                </div>
                <div className={styles.statValue} style={{ color: '#f59e0b' }}>
                  {mgmtOverviewStats.totalStudents} نفر
                </div>
                <span className={styles.statSub}>تعداد کل نمرات ثبت‌شده در سامانه</span>
              </div>
            </div>

            {/* Management Filter Bar */}
            <div
              style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius-2xl)',
                padding: '16px 20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '12px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: '1', minWidth: '260px' }}>
                <div style={{ position: 'relative', width: '100%' }}>
                  <HiOutlineMagnifyingGlass
                    style={{
                      position: 'absolute',
                      right: '12px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      color: 'var(--text-tertiary)',
                    }}
                  />
                  <input
                    type="text"
                    placeholder="جستجو در نام معلم، کد دبیر، کلاس یا دانش‌آموز..."
                    value={mgmtSearchQuery}
                    onChange={(e) => setMgmtSearchQuery(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '9px 38px 9px 14px',
                      borderRadius: 'var(--radius-lg)',
                      border: '1px solid var(--border-color)',
                      background: 'var(--bg-surface)',
                      color: 'var(--text-primary)',
                      fontSize: '0.875rem',
                    }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <label style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
                  فیلتر دبیر:
                </label>
                <select
                  className={styles.classSelect}
                  value={teacherFilter}
                  onChange={(e) => setTeacherFilter(e.target.value)}
                  style={{ minWidth: '180px' }}
                >
                  <option value="all">همه دبیران مدرسه ({uniqueTeachers.length} معلم)</option>
                  {uniqueTeachers.map((t, idx) => (
                    <option key={idx} value={t.code || t.name}>
                      {t.name} ({t.code || 'کد دبیر'})
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => {
                    setMgmtSearchQuery('');
                    setTeacherFilter('all');
                  }}
                  title="پاکسازی فیلترها"
                >
                  نمایش همه
                </button>
              </div>
            </div>

            {/* Teacher Cards Grid */}
            {filteredSharedReports.length === 0 ? (
              <div
                style={{
                  background: 'var(--bg-card)',
                  border: '1px dashed var(--border-color)',
                  borderRadius: 'var(--radius-2xl)',
                  padding: '50px 24px',
                  textAlign: 'center',
                  color: 'var(--text-tertiary)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '12px',
                }}
              >
                <HiOutlineCalculator style={{ fontSize: '3rem', opacity: 0.5 }} />
                <p style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary)' }}>
                  گزارشی با فیلترهای انتخابی یافت نشد
                </p>
                <span style={{ fontSize: '0.8125rem' }}>
                  معلمان می‌توانند در تب «ثبت و ورود نمرات کلاسی»، با زدن دکمه «اشتراک‌گذاری با مدیریت»، لیست نمرات کلاس خود را فوراً به این بخش ارسال نمایند.
                </span>
              </div>
            ) : (
              <div className={styles.mgmtBreakdownGrid}>
                {filteredSharedReports.map((rep) => (
                  <div key={rep.id} className={styles.mgmtTeacherCard}>
                    {/* Card Header with Teacher Avatar and Badge */}
                    <div className={styles.mgmtCardHeader}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div className={styles.teacherAvatarCircle}>
                          {rep.teacher_name?.charAt(0) || 'م'}
                        </div>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <h3 style={{ fontSize: '1rem', fontWeight: 800, margin: 0 }}>
                              {rep.teacher_name}
                            </h3>
                            <span className={styles.teacherCodePill}>{rep.teacher_code}</span>
                          </div>
                          <div style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', marginTop: '2px' }}>
                            {rep.subject} | {rep.class_name} {rep.grade ? `(${rep.grade})` : ''}
                          </div>
                        </div>
                      </div>

                      <div style={{ textAlign: 'left', flexShrink: 0 }}>
                        <span
                          style={{
                            display: 'inline-block',
                            fontSize: '0.72rem',
                            fontWeight: 800,
                            padding: '3px 8px',
                            borderRadius: '6px',
                            background:
                              rep.status === 'acknowledged' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                            color: rep.status === 'acknowledged' ? '#10b981' : '#f59e0b',
                            border: `1px solid ${
                              rep.status === 'acknowledged'
                                ? 'rgba(16, 185, 129, 0.3)'
                                : 'rgba(245, 158, 11, 0.3)'
                            }`,
                          }}
                        >
                          {rep.status === 'acknowledged' ? '✓ تایید مدیریت' : '⏳ در انتظار بررسی'}
                        </span>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', marginTop: '4px', direction: 'ltr' }}>
                          {rep.date} - {rep.time}
                        </div>
                      </div>
                    </div>

                    {/* Score Stats Badges */}
                    <div className={styles.mgmtStatsPills}>
                      <div className={`${styles.statBadgeItem} ${styles.statBadgeAvg}`}>
                        <span>📊 میانگین کلاس:</span>
                        <strong>{rep.class_average}</strong>
                      </div>
                      <div className={`${styles.statBadgeItem} ${styles.statBadgePass}`}>
                        <span>✓ درصد قبولی:</span>
                        <strong>{rep.pass_rate}٪</strong>
                      </div>
                      <div className={`${styles.statBadgeItem} ${styles.statBadgeTop}`}>
                        <span>🏆 بالاترین نمره:</span>
                        <strong>{rep.top_score}</strong>
                      </div>
                      <div className={`${styles.statBadgeItem} ${styles.statBadgeCount}`}>
                        <span>👥 دانش‌آموزان:</span>
                        <strong>{rep.students_count} نفر</strong>
                      </div>
                    </div>

                    {/* Failing / Attention Students Alert Callout */}
                    {rep.failing_students && rep.failing_students.length > 0 ? (
                      <div className={styles.attentionCalloutBox}>
                        <div className={styles.attentionCalloutTitle}>
                          <HiOutlineXCircle style={{ fontSize: '0.9rem' }} />
                          <span>
                            دانش‌آموزان نیازمند توجه و تقویت ({rep.failing_students.length} نفر با نمره زیر ۱۲):
                          </span>
                        </div>
                        <div className={styles.attentionStudentsList}>
                          {rep.failing_students.map((st, sIdx) => (
                            <div key={sIdx} className={styles.attentionStudentItem}>
                              <span>{st.name}</span>
                              <span style={{ fontWeight: 800, marginRight: '4px', color: '#b91c1c' }}>
                                ({st.score})
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div
                        style={{
                          padding: '8px 12px',
                          borderRadius: 'var(--radius-lg)',
                          background: 'rgba(16, 185, 129, 0.08)',
                          color: '#059669',
                          fontSize: '0.78rem',
                          fontWeight: 700,
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                        }}
                      >
                        <HiOutlineCheckCircle />
                        <span>تبریک! تمام دانش‌آموزان این کلاس نمره قبولی کسب کرده‌اند.</span>
                      </div>
                    )}

                    {/* Teacher Notes */}
                    {rep.teacher_note && (
                      <div className={styles.teacherNotesSection}>
                        <span style={{ fontWeight: 700, color: 'var(--text-primary)', display: 'block', marginBottom: '2px' }}>
                          💬 یادداشت دبیر به مدیریت:
                        </span>
                        <span>{rep.teacher_note}</span>
                      </div>
                    )}

                    {/* Card Actions */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginTop: 'auto',
                        paddingTop: '10px',
                        borderTop: '1px solid var(--border-color)',
                        flexWrap: 'wrap',
                        gap: '8px',
                      }}
                    >
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => setSelectedReportDetail(rep)}
                        style={{ fontSize: '0.78rem' }}
                      >
                        <HiOutlineDocumentText />
                        <span>مشاهده ریز نمرات و کارنامه</span>
                      </button>

                      {isAdmin && rep.status !== 'acknowledged' && (
                        <button
                          type="button"
                          className="btn btn-sm"
                          style={{
                            background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                            color: 'white',
                            fontWeight: 700,
                            fontSize: '0.78rem',
                          }}
                          onClick={() => handleAcknowledgeReport(rep.id)}
                        >
                          ✓ تایید و ثبت رویت مدیریت
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          /* ══════════════════════════════════════════════════════════════════
             TEACHER SCORE ENTRY VIEW (ورود نمرات و دفتر کلاسی)
             ══════════════════════════════════════════════════════════════════ */
          <>
            {/* ── 1. Header & Class Selector ── */}
            <div className={styles.topToolbar}>
              <div className={styles.pageTitleBox}>
                <div className={styles.pageIcon}>
                  <HiOutlineCalculator />
                </div>
                <div>
                  <h1>کارنامه‌ها و دفتر ورود نمرات کلاسی</h1>
                  <p>انتخاب کلاس، مشاهده لیست اسامی دانش‌آموزان و ثبت نمرات مستمر و آزمون‌ها</p>
                </div>
              </div>

              <div className={styles.toolbarActions}>
                {classes.length > 0 && (
                  <div className={styles.classSelectWrapper}>
                    <span style={{ fontSize: '0.813rem', color: 'var(--text-tertiary)', fontWeight: 700 }}>
                      کلاس درسی:
                    </span>
                    <select
                      className={styles.classSelect}
                      value={selectedClassId}
                      onChange={(e) => setSelectedClassId(e.target.value)}
                    >
                      {classes.map((cls) => (
                        <option key={cls.id} value={cls.id}>
                          {cls.name} — {cls.subject} ({cls.grade || 'پایه دهم'})
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <button
                  className="btn btn-primary btn-sm"
                  onClick={handleSaveAll}
                  disabled={savingAll}
                  type="button"
                  title="ذخیره تمام نمرات تغییر یافته در یک لحظه"
                  style={{ background: '#059669', borderColor: '#059669', display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <HiOutlineCheckCircle style={{ fontSize: '1.1rem' }} />
                  <span>{savingAll ? 'در حال ذخیره‌سازی...' : 'ذخیره تمام نمرات'}</span>
                </button>

                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => setShowCatModal(true)}
                  type="button"
                  style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <HiOutlinePlus />
                  <span>افزودن آزمون جدید</span>
                </button>

                <button
                  className="btn btn-primary btn-sm"
                  onClick={handleOpenAddStudentModal}
                  type="button"
                  title="افزودن دانش‌آموز به لیست کلاس جهت نمره‌دهی"
                  style={{ background: '#4f46e5', borderColor: '#4f46e5', display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <HiOutlineUserPlus style={{ fontSize: '1.1rem' }} />
                  <span>افزودن دانش‌آموز به کلاس</span>
                </button>

                <button
                  onClick={handlePrint}
                  className="btn btn-secondary btn-sm"
                  title="چاپ لیست نمرات یا ذخیره به صورت PDF"
                  style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <HiOutlinePrinter style={{ fontSize: '1.1rem' }} />
                  <span>چاپ لیست نمرات (PDF)</span>
                </button>

                <button
                  type="button"
                  className={styles.shareWithMgmtBtn}
                  onClick={() => setIsShareModalOpen(true)}
                  title="ارسال مستقیم کارنامه و لیست نمرات این کلاس برای دفتر مدیریت مدرسه"
                >
                  <HiOutlinePaperAirplane style={{ fontSize: '1.1rem', transform: 'rotate(180deg)' }} />
                  <span>اشتراک‌گذاری با مدیریت 📤</span>
                </button>

                <Link href="/dashboard" className="btn btn-secondary btn-sm">
                  <HiOutlineArrowRight />
                  <span>داشبورد</span>
                </Link>
              </div>
            </div>

        {/* ── 2. Class KPI Overview ── */}
        {gradebookData && (
          <div className={styles.classStatsGrid}>
            <div className={styles.statCard}>
              <div className={styles.statHeader}>
                <span className={styles.statLabel}>تعداد دانش‌آموزان کلاس</span>
                <HiOutlineUserGroup className={styles.statIcon} />
              </div>
              <div className={styles.statValue}>{classStats.totalStudents} نفر</div>
              <span className={styles.statSub}>فهرست اسامی ثبت‌شده این کلاس</span>
            </div>

            <div className={styles.statCard}>
              <div className={styles.statHeader}>
                <span className={styles.statLabel}>میانگین نمرات کلاس</span>
                <HiOutlineSparkles className={styles.statIcon} style={{ color: '#818cf8' }} />
              </div>
              <div className={styles.statValue} style={{ color: '#818cf8' }}>
                {classStats.average}
              </div>
              <span className={styles.statSub}>میانگین نمرات ثبت‌شده</span>
            </div>

            <div className={styles.statCard}>
              <div className={styles.statHeader}>
                <span className={styles.statLabel}>بالاترین نمره کلاس</span>
                <HiOutlineTrophy className={styles.statIcon} style={{ color: '#34d399' }} />
              </div>
              <div className={styles.statValue} style={{ color: '#34d399' }}>
                {classStats.topScore}
              </div>
              <span className={styles.statSub}>رتبه برتر کلاسی</span>
            </div>

            <div className={styles.statCard}>
              <div className={styles.statHeader}>
                <span className={styles.statLabel}>درصد قبولی کلاس</span>
                <HiOutlineCheckCircle className={styles.statIcon} style={{ color: '#fbbf24' }} />
              </div>
              <div className={styles.statValue} style={{ color: '#fbbf24' }}>
                {classStats.passRate}٪
              </div>
              <span className={styles.statSub}>نمرات بالاتر از ۱۲</span>
            </div>
          </div>
        )}

        {/* ── 3. Active Categories Strip & Student Search Filter ── */}
        <div className={styles.categoriesBar}>
          <div className={styles.categoryList}>
            <span style={{ fontSize: '0.813rem', fontWeight: 800, color: 'var(--text-tertiary)' }}>
              آزمون‌ها و ارزشیابی‌های این کلاس:
            </span>
            {gradebookData?.categories?.map((cat) => (
              <div key={cat.id} className={styles.categoryTag}>
                <span>{cat.title}</span>
              </div>
            ))}
          </div>

          <div className={styles.searchBox}>
            <HiOutlineMagnifyingGlass style={{ color: 'var(--text-tertiary)' }} />
            <input
              type="text"
              placeholder="جستجوی نام یا شماره دانش‌آموز..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        {/* ── 4. Roster & Scores Matrix Table ── */}
        <div className={styles.mobileScrollHint}>
          <span>📱 برای مشاهده کامل نمرات، نام‌ها و دکمه کارنامه، جدول را به چپ بکشید ⟷</span>
        </div>
        {loadingTeacher ? (
          <div className="skeleton" style={{ height: 320, borderRadius: 'var(--radius-2xl)' }} />
        ) : (
          <div className={styles.matrixWrapper}>
            <table className={styles.matrixTable}>
              <thead>
                <tr>
                  <th style={{ width: '40px', textAlign: 'center' }}>ردیف</th>
                  <th>نام و مشخصات دانش‌آموز</th>
                  {gradebookData?.categories?.map((cat) => (
                    <th key={cat.id} style={{ textAlign: 'center' }}>
                      <div>{cat.title}</div>
                    </th>
                  ))}
                  <th style={{ textAlign: 'center', background: 'rgba(99, 102, 241, 0.08)' }}>
                    میانگین نمرات
                  </th>
                  <th style={{ textAlign: 'center' }}>وضعیت</th>
                  <th style={{ textAlign: 'center' }}>کارنامه رسمی</th>
                </tr>
              </thead>
              <tbody>
                {filteredStudents.length > 0 ? (
                  filteredStudents.map((st, idx) => {
                    const avg = st.weightedAverage;
                    const isPassed = avg != null && avg >= 12;

                    return (
                      <tr key={st.id}>
                        <td style={{ textAlign: 'center', color: 'var(--text-tertiary)', fontWeight: 700 }}>
                          {idx + 1}
                        </td>

                        <td>
                          <div className={styles.studentCell}>
                            <div className={styles.studentAvatar}>
                              {st.display_name.charAt(0)}
                            </div>
                            <div className={styles.studentMetaCol}>
                              <span className={styles.studentName}>{st.display_name}</span>
                              <span className={styles.studentCode}>{st.student_code || 'STD-40301'}</span>
                            </div>
                          </div>
                        </td>

                        {/* Category Score Inputs (Controlled & Instant Feedback) */}
                        {gradebookData?.categories?.map((cat) => {
                          const cellKey = `${st.id}_${cat.id}`;
                          const cellVal = cellValues[cellKey] ?? '';
                          const isSaving = savingCells[cellKey];
                          const isSaved = savedCells[cellKey];
                          const hasError = !!cellErrors[cellKey];

                          return (
                            <td key={cat.id} style={{ textAlign: 'center' }}>
                              <div className={styles.scoreInputWrapper}>
                                <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                                  <input
                                    type="text"
                                    inputMode="decimal"
                                    dir="ltr"
                                    className={`${styles.scoreInput} ${hasError ? styles.scoreInputError : ''} ${isSaved ? styles.scoreInputSuccess : ''}`}
                                    value={cellVal}
                                    placeholder="—"
                                    onChange={(e) => handleCellChange(st.id, cat.id, e.target.value)}
                                    onBlur={() => handleSaveCell(st.id, cat.id)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') {
                                        e.target.blur();
                                      }
                                    }}
                                  />
                                  {isSaving && (
                                    <span className={styles.cellSavingIndicator} title="در حال ذخیره...">⏳</span>
                                  )}
                                  {isSaved && !isSaving && (
                                    <span className={styles.cellSavedIndicator} title="ذخیره شد ✓">✓</span>
                                  )}
                                </div>
                                {hasError && (
                                  <span style={{ fontSize: '0.688rem', color: '#ef4444', fontWeight: 700 }}>
                                    {cellErrors[cellKey]}
                                  </span>
                                )}
                              </div>
                            </td>
                          );
                        })}

                        {/* Average */}
                        <td style={{ textAlign: 'center', background: 'rgba(99, 102, 241, 0.04)' }}>
                          <span className={styles.weightedScoreCell} style={{
                            color: avg >= 18 ? '#34d399' : (avg >= 15 ? '#60a5fa' : (avg >= 12 ? '#fbbf24' : '#f87171'))
                          }}>
                            {avg != null ? avg : '—'}
                          </span>
                        </td>

                        {/* Status */}
                        <td style={{ textAlign: 'center' }}>
                          {avg != null ? (
                            isPassed ? (
                              <span style={{ color: '#34d399', fontSize: '0.813rem', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                <HiOutlineCheckCircle /> قبول
                              </span>
                            ) : (
                              <span style={{ color: '#f87171', fontSize: '0.813rem', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                <HiOutlineExclamationCircle /> نیاز به تلاش
                              </span>
                            )
                          ) : (
                            <span style={{ color: 'var(--text-tertiary)', fontSize: '0.75rem' }}>نامشخص</span>
                          )}
                        </td>

                        {/* Action Button: View Official Report Card */}
                        <td style={{ textAlign: 'center' }}>
                          <button
                            type="button"
                            className={styles.viewReportBtn}
                            onClick={() => handleOpenPreviewModal(st)}
                            title="مشاهده کارنامه رسمی و معدل کل این دانش‌آموز"
                          >
                            <HiOutlineEye />
                            <span>مشاهده کارنامه</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td
                      colSpan={Math.max(6, (gradebookData?.categories?.length || 0) + 4)}
                      style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--text-tertiary)' }}
                    >
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                        <HiOutlineUserGroup style={{ fontSize: '2.5rem', opacity: 0.5, color: '#6366f1' }} />
                        <div style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--text-primary)' }}>
                          هنوز دانش‌آموزی در این کلاس ثبت نشده است
                        </div>
                        <p style={{ margin: 0, fontSize: '0.825rem', color: 'var(--text-secondary)', maxWidth: '420px', lineHeight: 1.5 }}>
                          برای ثبت و ورود نمرات کلاسی، با کلیک بر روی دکمه زیر می‌توانید دانش‌آموزان مدرسه را به این کلاس اضافه فرمایید.
                        </p>
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          onClick={handleOpenAddStudentModal}
                          style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}
                        >
                          <HiOutlineUserPlus />
                          <span>افزودن اولین دانش‌آموز به کلاس</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* ── Modal: View Official Student Report Card ── */}
        {previewStudent && (
          <div className={styles.modalOverlay} onClick={() => setPreviewStudent(null)}>
            <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
              <div className={styles.modalHeader}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '1.25rem' }}>🎓</span>
                  <h3 style={{ margin: 0, fontWeight: 800, color: 'var(--text-primary)' }}>
                    کارنامه رسمی دانش‌آموز: {previewStudent.display_name}
                  </h3>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => window.print()}
                    type="button"
                  >
                    <HiOutlinePrinter />
                    <span>چاپ کارنامه</span>
                  </button>
                  <button
                    onClick={() => setPreviewStudent(null)}
                    style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: '1.25rem' }}
                  >
                    <HiOutlineXMark />
                  </button>
                </div>
              </div>

              <div className={styles.modalBody}>
                {loadingPreview ? (
                  <div className="skeleton" style={{ height: 350, borderRadius: 'var(--radius-xl)' }} />
                ) : previewReportData ? (
                  <OfficialReportCardPaperSheet reportData={previewReportData} />
                ) : (
                  <div>اطلاعات کارنامه در دسترس نیست.</div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── Modal: Add Evaluation Category ── */}
        {showCatModal && (
          <div className={styles.modalOverlay} onClick={() => setShowCatModal(false)}>
            <div className={styles.modalContent} style={{ maxWidth: '440px' }} onClick={(e) => e.stopPropagation()}>
              <div className={styles.modalHeader}>
                <h3 style={{ margin: 0, fontWeight: 800 }}>تعریف آزمون / ستون نمره جدید</h3>
                <button
                  onClick={() => setShowCatModal(false)}
                  style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: '1.25rem' }}
                >
                  <HiOutlineXMark />
                </button>
              </div>

              <div className={styles.modalBody}>
                <form onSubmit={handleCreateCategory} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div style={{ background: 'var(--bg-surface)', padding: '10px 14px', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-color)' }}>
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)', display: 'block', marginBottom: '2px' }}>
                      کلاس انتخابی جهت ثبت آزمون:
                    </span>
                    <strong style={{ fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                      {classes.find((c) => c.id === selectedClassId)?.name || 'کلاس انتخابی'}
                    </strong>
                  </div>

                  <div className="input-group">
                    <label className="input-label" htmlFor="cat_title">عنوان آزمون / ارزشیابی *</label>
                    <input
                      id="cat_title"
                      className="input"
                      type="text"
                      placeholder="مثلاً: کوئیز کلاسی فصل ۲، آزمون عملی، پرسش شفاهی"
                      value={newCatTitle}
                      onChange={(e) => setNewCatTitle(e.target.value)}
                      required
                      autoFocus
                    />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <div className="input-group">
                      <label className="input-label" htmlFor="cat_weight">ضریب در معدل</label>
                      <input
                        id="cat_weight"
                        className="input"
                        type="number"
                        step="0.1"
                        min="0.1"
                        max="10"
                        value={newCatWeight}
                        onChange={(e) => setNewCatWeight(e.target.value)}
                      />
                    </div>
                    <div className="input-group">
                      <label className="input-label" htmlFor="cat_max">سقف نمره</label>
                      <input
                        id="cat_max"
                        className="input"
                        type="number"
                        min="1"
                        max="100"
                        value={newCatMaxScore}
                        onChange={(e) => setNewCatMaxScore(e.target.value)}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '10px' }}>
                    <button type="button" className="btn btn-secondary" onClick={() => setShowCatModal(false)}>
                      انصراف
                    </button>
                    <button type="submit" className="btn btn-primary">
                      افزودن به دفتر نمرات
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}

        {/* ── Modal: Add Student to Class ── */}
        {showAddStudentModal && (
          <div className={styles.modalOverlay} onClick={() => setShowAddStudentModal(false)}>
            <div className={styles.modalContent} style={{ maxWidth: '480px' }} onClick={(e) => e.stopPropagation()}>
              <div className={styles.modalHeader}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <HiOutlineUserPlus style={{ fontSize: '1.25rem', color: '#4f46e5' }} />
                  <h3 style={{ margin: 0, fontWeight: 800 }}>افزودن دانش‌آموز به لیست کلاس</h3>
                </div>
                <button
                  onClick={() => setShowAddStudentModal(false)}
                  style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: '1.25rem' }}
                >
                  <HiOutlineXMark />
                </button>
              </div>

              <div className={styles.modalBody}>
                {/* Mode Selector Tabs */}
                <div style={{ display: 'flex', gap: '8px', background: 'var(--bg-surface)', padding: '4px', borderRadius: 'var(--radius-lg)', marginBottom: '16px', border: '1px solid var(--border-color)' }}>
                  <button
                    type="button"
                    onClick={() => setAddStudentMode('existing')}
                    style={{
                      flex: 1,
                      padding: '8px 12px',
                      borderRadius: 'var(--radius-md)',
                      border: 'none',
                      background: addStudentMode === 'existing' ? '#4f46e5' : 'transparent',
                      color: addStudentMode === 'existing' ? '#fff' : 'var(--text-secondary)',
                      fontWeight: 700,
                      fontSize: '0.825rem',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                    }}
                  >
                    انتخاب از دانش‌آموزان مدرسه
                  </button>
                  <button
                    type="button"
                    onClick={() => setAddStudentMode('new')}
                    style={{
                      flex: 1,
                      padding: '8px 12px',
                      borderRadius: 'var(--radius-md)',
                      border: 'none',
                      background: addStudentMode === 'new' ? '#4f46e5' : 'transparent',
                      color: addStudentMode === 'new' ? '#fff' : 'var(--text-secondary)',
                      fontWeight: 700,
                      fontSize: '0.825rem',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                    }}
                  >
                    ثبت مشخصات دانش‌آموز جدید
                  </button>
                </div>

                <form onSubmit={handleAddStudentToClass} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <div style={{ background: 'var(--bg-surface)', padding: '8px 12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', fontSize: '0.813rem' }}>
                    <span style={{ color: 'var(--text-tertiary)' }}>کلاس مقصد: </span>
                    <strong style={{ color: 'var(--text-primary)' }}>
                      {classes.find((c) => c.id === selectedClassId)?.name || 'کلاس انتخابی'}
                    </strong>
                  </div>

                  {addStudentMode === 'existing' ? (
                    <div className="input-group">
                      <label className="input-label" htmlFor="student_select">
                        انتخاب دانش‌آموز
                      </label>
                      {loadingRoster ? (
                        <div className="skeleton" style={{ height: '42px', borderRadius: 'var(--radius-md)' }} />
                      ) : availableStudents.length > 0 ? (
                        <select
                          id="student_select"
                          className="input"
                          value={selectedStudentToAdd}
                          onChange={(e) => setSelectedStudentToAdd(e.target.value)}
                          required
                        >
                          <option value="">-- لطفاً یک دانش‌آموز را انتخاب کنید --</option>
                          {availableStudents.map((st) => (
                            <option key={st.id} value={st.id}>
                              {st.display_name} {st.student_code ? `(${st.student_code})` : ''}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <div style={{ padding: '12px', background: 'rgba(245, 158, 11, 0.1)', color: '#d97706', borderRadius: 'var(--radius-md)', fontSize: '0.813rem', lineHeight: 1.5 }}>
                          تمامی دانش‌آموزان ثبت‌شده در مدرسه هم‌اکنون عضو این کلاس هستند یا دانش‌آموز بدون کلاسی یافت نشد. می‌توانید از تب «ثبت مشخصات دانش‌آموز جدید» دانش‌آموز دیگری را ثبت کنید.
                        </div>
                      )}
                    </div>
                  ) : (
                    <>
                      <div className="input-group">
                        <label className="input-label" htmlFor="new_st_name">نام و نام خانوادگی دانش‌آموز *</label>
                        <input
                          id="new_st_name"
                          className="input"
                          type="text"
                          placeholder="مثلاً: علی رضایی"
                          value={newStudentForm.display_name}
                          onChange={(e) => setNewStudentForm((prev) => ({ ...prev, display_name: e.target.value }))}
                          required
                        />
                      </div>
                      <div className="input-group">
                        <label className="input-label" htmlFor="new_st_code">کد دانش‌آموزی (اختیاری)</label>
                        <input
                          id="new_st_code"
                          className="input"
                          type="text"
                          placeholder="مثلاً: STD-40315"
                          value={newStudentForm.student_code}
                          onChange={(e) => setNewStudentForm((prev) => ({ ...prev, student_code: e.target.value }))}
                        />
                      </div>
                      <div className="input-group">
                        <label className="input-label" htmlFor="new_st_phone">شماره تماس (اختیاری)</label>
                        <input
                          id="new_st_phone"
                          className="input"
                          type="tel"
                          placeholder="مثلاً: 09123456789"
                          value={newStudentForm.phone}
                          onChange={(e) => setNewStudentForm((prev) => ({ ...prev, phone: e.target.value }))}
                        />
                      </div>
                    </>
                  )}

                  <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '8px' }}>
                    <button type="button" className="btn btn-secondary" onClick={() => setShowAddStudentModal(false)}>
                      انصراف
                    </button>
                    <button
                      type="submit"
                      className="btn btn-primary"
                      disabled={isSubmittingStudent || (addStudentMode === 'existing' && availableStudents.length === 0)}
                    >
                      {isSubmittingStudent ? 'در حال افزودن...' : 'افزودن به دفتر نمرات کلاس'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}
          </>
        )}

        {/* ══════════════════════════════════════════════════════════════════
           MODAL: SHARE GRADEBOOK REPORT WITH MANAGEMENT (اشتراک‌گذاری نمرات با مدیریت)
           ══════════════════════════════════════════════════════════════════ */}
        {isShareModalOpen && (
          <div className={styles.shareModalOverlay} onClick={() => setIsShareModalOpen(false)}>
            <div className={styles.shareModalDialog} onClick={(e) => e.stopPropagation()}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div
                    style={{
                      width: '36px',
                      height: '36px',
                      borderRadius: '10px',
                      background: 'rgba(16, 185, 129, 0.15)',
                      color: '#10b981',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '1.25rem',
                    }}
                  >
                    <HiOutlinePaperAirplane style={{ transform: 'rotate(180deg)' }} />
                  </div>
                  <h3 style={{ fontSize: '1.15rem', fontWeight: 800, margin: 0 }}>
                    اشتراک‌گذاری لیست نمرات و کارنامه با مدیریت
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setIsShareModalOpen(false)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-tertiary)',
                    cursor: 'pointer',
                    fontSize: '1.2rem',
                  }}
                >
                  <HiOutlineXMark />
                </button>
              </div>

              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>
                با ارسال این کارنامه، نمرات ثبت‌شده کلاس{' '}
                <strong>{classes.find((c) => c.id === selectedClassId)?.name || 'کلاس'}</strong> همراه با میانگین و درصد قبولی مستقیماً در پنل ستاد مدیریت مدرسه قرار گرفته و اعلان رسمی ارسال خواهد شد.
              </p>

              <div
                style={{
                  background: 'var(--bg-surface)',
                  borderRadius: 'var(--radius-xl)',
                  padding: '12px 16px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-around',
                  border: '1px solid var(--border-color)',
                }}
              >
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#3b82f6' }}>
                    {classStats.average}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>میانگین کلاس</div>
                </div>
                <div style={{ width: '1px', height: '28px', background: 'var(--border-color)' }}></div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#10b981' }}>
                    {classStats.passRate}٪
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>درصد قبولی</div>
                </div>
                <div style={{ width: '1px', height: '28px', background: 'var(--border-color)' }}></div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#f59e0b' }}>
                    {classStats.topScore}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>بالاترین نمره</div>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
                  توضیحات یا یادداشت برای مدیریت مدرسه (اختیاری):
                </label>
                <textarea
                  rows={3}
                  placeholder="مثلاً: نمرات مستمر نوبت اول ثبت شد. دانش‌آموزان با نمره زیر ۱۲ نیاز به آزمون جبرانی دارند..."
                  value={shareNote}
                  onChange={(e) => setShareNote(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: 'var(--radius-lg)',
                    border: '1px solid var(--border-color)',
                    background: 'var(--bg-surface)',
                    color: 'var(--text-primary)',
                    fontSize: '0.85rem',
                    resize: 'vertical',
                  }}
                />
              </div>

              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '8px' }}>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setIsShareModalOpen(false)}
                  disabled={isSharing}
                >
                  انصراف
                </button>
                <button
                  type="button"
                  className="btn btn-sm"
                  style={{
                    background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                    color: 'white',
                    fontWeight: 800,
                    padding: '8px 18px',
                  }}
                  onClick={handleShareWithManagement}
                  disabled={isSharing}
                >
                  {isSharing ? 'در حال ارسال...' : 'ارسال قطعی به مدیریت مدرسه 🚀'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════
           MODAL: MANAGEMENT REPORT DETAIL MODAL (مشاهده ریز کارنامه کلاسی)
           ══════════════════════════════════════════════════════════════════ */}
        {selectedReportDetail && (
          <div className={styles.shareModalOverlay} onClick={() => setSelectedReportDetail(null)}>
            <div
              className={styles.shareModalDialog}
              style={{ maxWidth: '680px' }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <h3 style={{ fontSize: '1.15rem', fontWeight: 800, margin: 0 }}>
                    ریز نمرات کلاسی: {selectedReportDetail.class_name}
                  </h3>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>
                    دبیر: {selectedReportDetail.teacher_name} ({selectedReportDetail.teacher_code}) | {selectedReportDetail.date} - {selectedReportDetail.time}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedReportDetail(null)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-tertiary)',
                    cursor: 'pointer',
                    fontSize: '1.2rem',
                  }}
                >
                  <HiOutlineXMark />
                </button>
              </div>

              {/* KPI Badges */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(4, 1fr)',
                  gap: '8px',
                  background: 'var(--bg-surface)',
                  padding: '12px',
                  borderRadius: 'var(--radius-xl)',
                  textAlign: 'center',
                }}
              >
                <div>
                  <div style={{ fontWeight: 800, color: '#3b82f6', fontSize: '1.1rem' }}>
                    {selectedReportDetail.class_average}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)' }}>میانگین کلاس</div>
                </div>
                <div>
                  <div style={{ fontWeight: 800, color: '#10b981', fontSize: '1.1rem' }}>
                    {selectedReportDetail.pass_rate}٪
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)' }}>درصد قبولی</div>
                </div>
                <div>
                  <div style={{ fontWeight: 800, color: '#f59e0b', fontSize: '1.1rem' }}>
                    {selectedReportDetail.top_score}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)' }}>بالاترین نمره</div>
                </div>
                <div>
                  <div style={{ fontWeight: 800, color: '#818cf8', fontSize: '1.1rem' }}>
                    {selectedReportDetail.students_count}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)' }}>تعداد دانش‌آموز</div>
                </div>
              </div>

              <div style={{ maxHeight: '380px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px', paddingLeft: '4px' }}>
                {/* Failing students alert if any */}
                {selectedReportDetail.failing_students && selectedReportDetail.failing_students.length > 0 && (
                  <div className={styles.attentionCalloutBox}>
                    <div className={styles.attentionCalloutTitle}>
                      <HiOutlineXCircle />
                      <span>دانش‌آموزان نیازمند آزمون جبرانی و پیگیری اولیا:</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      {selectedReportDetail.failing_students.map((st, i) => (
                        <div
                          key={i}
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            padding: '4px 8px',
                            background: 'var(--bg-card)',
                            borderRadius: '6px',
                            fontSize: '0.78rem',
                          }}
                        >
                          <span style={{ fontWeight: 700, color: '#dc2626' }}>{st.name}</span>
                          <span style={{ fontWeight: 800, color: '#dc2626' }}>نمره: {st.score}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Full Roster Table */}
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.813rem' }}>
                  <thead>
                    <tr style={{ background: 'var(--bg-surface)', borderBottom: '1px solid var(--border-color)' }}>
                      <th style={{ padding: '8px', textAlign: 'center', width: '40px' }}>ردیف</th>
                      <th style={{ padding: '8px', textAlign: 'right' }}>نام و نام خانوادگی</th>
                      <th style={{ padding: '8px', textAlign: 'center' }}>کد دانش‌آموزی</th>
                      <th style={{ padding: '8px', textAlign: 'center' }}>میانگین نمرات</th>
                      <th style={{ padding: '8px', textAlign: 'center' }}>وضعیت</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(selectedReportDetail.students || []).map((st, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid var(--border-color)' }}>
                        <td style={{ padding: '8px', textAlign: 'center', color: 'var(--text-tertiary)' }}>
                          {i + 1}
                        </td>
                        <td style={{ padding: '8px', fontWeight: 700 }}>{st.name}</td>
                        <td style={{ padding: '8px', textAlign: 'center', fontFamily: 'monospace', color: 'var(--text-tertiary)' }}>
                          {st.code}
                        </td>
                        <td style={{ padding: '8px', textAlign: 'center', fontWeight: 800, color: st.average >= 12 ? '#10b981' : '#ef4444' }}>
                          {st.average != null ? st.average : '—'}
                        </td>
                        <td style={{ padding: '8px', textAlign: 'center' }}>
                          <span
                            style={{
                              fontSize: '0.72rem',
                              fontWeight: 750,
                              padding: '2px 8px',
                              borderRadius: '4px',
                              background: st.average >= 12 ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                              color: st.average >= 12 ? '#10b981' : '#ef4444',
                            }}
                          >
                            {st.average >= 12 ? 'قبول ✓' : 'نیازمند جبران ✕'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* Teacher note */}
                {selectedReportDetail.teacher_note && (
                  <div style={{ background: 'var(--bg-surface)', padding: '10px 12px', borderRadius: 'var(--radius-lg)' }}>
                    <strong style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>توضیحات و یادداشت دبیر:</strong>
                    <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: 'var(--text-primary)' }}>
                      {selectedReportDetail.teacher_note}
                    </p>
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px' }}>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => window.print()}
                >
                  <HiOutlinePrinter />
                  <span>چاپ کارنامه کلاس (PDF)</span>
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setSelectedReportDetail(null)}
                >
                  بستن
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════
  // VIEW 2: STUDENT & PARENT OFFICIAL REPORT CARD
  // ══════════════════════════════════════════════════════════
  return (
    <div className={styles.container}>
      {/* ── Top Toolbar ── */}
      <div className={styles.topToolbar}>
        <div className={styles.pageTitleBox}>
          <div className={styles.pageIcon}>
            <HiOutlineDocumentText />
          </div>
          <div>
            <h1>کارنامه تحصیلی رسمی</h1>
            <p>
              {isParent
                ? 'کارنامه و ریز نمرات رسمی فرزند شما متصل به پرونده مدرسه'
                : 'ریز نمرات ارزشیابی مستمر، آزمون‌ها و معدل کل ترم'}
            </p>
          </div>
        </div>

        <div className={styles.toolbarActions}>
          <button
            onClick={handlePrint}
            className="btn btn-secondary btn-sm"
            title="چاپ کارنامه یا ذخیره به صورت PDF"
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <HiOutlinePrinter style={{ fontSize: '1.1rem' }} />
            <span>چاپ و دریافت نسخه رسمی (PDF)</span>
          </button>

          <Link href="/dashboard" className="btn btn-secondary btn-sm">
            <HiOutlineArrowRight />
            <span>بازگشت به داشبورد</span>
          </Link>
        </div>
      </div>

      {/* ── Parent Notice Banner & Multiple Children Switcher ── */}
      {isParent && (
        <div className={styles.parentNoticeBanner}>
          <div className={styles.parentNoticeInfo}>
            <div className={styles.parentNoticeAvatar}>
              🎓
            </div>
            <div className={styles.parentNoticeText}>
              <h3>
                {reportData?.student
                  ? `کارنامه تحصیلی فرزند شما: ${reportData.student.display_name}`
                  : 'کارنامه تحصیلی فرزند'}
              </h3>
              <p>
                این کارنامه به صورت خودکار از سیستم نمرات دبیران مدرسه فراخوانی و اعتبارسنجی شده است.
              </p>
            </div>
          </div>

          {reportData?.availableChildren && reportData.availableChildren.length > 1 && (
            <div className={styles.childSwitchChips}>
              <span style={{ fontSize: '0.813rem', color: 'var(--text-tertiary)', marginLeft: '6px' }}>
                انتخاب فرزند:
              </span>
              {reportData.availableChildren.map((child) => (
                <button
                  key={child.id}
                  onClick={() => setSelectedChildId(child.id)}
                  className={`${styles.childChip} ${
                    (selectedChildId === child.id || (!selectedChildId && reportData.student.id === child.id))
                      ? styles.childChipActive
                      : ''
                  }`}
                >
                  <HiOutlineUser />
                  <span>{child.display_name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Loading & Error States ── */}
      {loading ? (
        <div className={styles.reportCardSheet}>
          <div className="skeleton" style={{ height: 120, borderRadius: 'var(--radius-xl)', marginBottom: 20 }} />
          <div className="skeleton" style={{ height: 80, borderRadius: 'var(--radius-xl)', marginBottom: 20 }} />
          <div className="skeleton" style={{ height: 260, borderRadius: 'var(--radius-xl)' }} />
        </div>
      ) : error ? (
        <div className={styles.reportCardSheet} style={{ textAlign: 'center', padding: '40px 20px' }}>
          <HiOutlineExclamationCircle style={{ fontSize: '3rem', color: '#ef4444', marginBottom: 12 }} />
          <h3 style={{ color: 'var(--text-primary)', marginBottom: 8 }}>امکان دریافت کارنامه وجود ندارد</h3>
          <p style={{ color: 'var(--text-secondary)', marginBottom: 20 }}>{error}</p>
          <button onClick={() => fetchReportCard(selectedChildId)} className="btn btn-primary">
            تلاش مجدد
          </button>
        </div>
      ) : reportData ? (
        <OfficialReportCardPaperSheet reportData={reportData} />
      ) : null}

      {/* ── Parent Contact Support Card ── */}
      {isParent && reportData && (
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '16px',
          background: 'var(--bg-card)',
          border: '1px solid var(--border-color)',
          borderRadius: 'var(--radius-2xl)',
          padding: '20px 24px'
        }}>
          <div>
            <h4 style={{ margin: '0 0 4px 0', fontSize: '1rem', fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <HiOutlineChatBubbleLeftRight style={{ color: 'var(--primary-500)' }} />
              <span>نیاز به گفتگو با معلمان درباره نمرات فرزند دارید؟</span>
            </h4>
            <p style={{ margin: 0, fontSize: '0.813rem', color: 'var(--text-secondary)' }}>
              می‌توانید مستقیماً با دبیر هر درس یا مشاور تحصیلی پیام رد و بدل کرده و وقت ملاقات تنظیم نمایید.
            </p>
          </div>

          <Link href="/dashboard/messages" className="btn btn-primary">
            <HiOutlineChatBubbleLeftRight />
            <span>ارسال پیام به دبیران مربوطه</span>
          </Link>
        </div>
      )}
    </div>
  );
}

// ── Official Report Card Paper Sheet Component ──
function OfficialReportCardPaperSheet({ reportData }) {
  if (!reportData) return null;

  return (
    <div className={styles.reportCardSheet}>
      {/* Header */}
      <div className={styles.schoolHeader}>
        <div className={styles.schoolEmblemBox}>
          <div className={styles.schoolLogo}>
            🎓
          </div>
          <div className={styles.schoolDetails}>
            <h2>{reportData.summary?.school_name || 'مجتمع آموزشی هوشمند ادیبان'}</h2>
            <p>جمهوری اسلامی ایران • اداره آموزش و پرورش منطقه یک</p>
          </div>
        </div>

        <div className={styles.reportCardTitleCenter}>
          <h3>کارنامه تحصیلی و انضباطی</h3>
          <div className={styles.termBadge}>
            {reportData.summary?.term || 'نوبت اول (دی ماه ۱۴۰۳)'} • {reportData.summary?.academic_year || 'سال تحصیلی ۱۴۰۳ - ۱۴۰۴'}
          </div>
        </div>

        <div className={styles.headerDateBox}>
          <span>تاریخ صدور: <strong>{reportData.summary?.generated_at}</strong></span>
          <span>کد پرونده: <strong>{reportData.student?.student_code}</strong></span>
          <span>وضعیت سیستم: <strong>تایید شده رسمی ✓</strong></span>
        </div>
      </div>

      {/* Student Meta Details */}
      <div className={styles.studentMetaGrid}>
        <div className={styles.metaItem}>
          <span className={styles.metaLabel}>نام و نام خانوادگی دانش‌آموز</span>
          <span className={styles.metaValue}>{reportData.student?.display_name}</span>
        </div>

        <div className={styles.metaItem}>
          <span className={styles.metaLabel}>شماره پرونده / کد دانش‌آموزی</span>
          <span className={styles.metaValue}>{reportData.student?.student_code}</span>
        </div>

        <div className={styles.metaItem}>
          <span className={styles.metaLabel}>دوره و مقطع تحصیلی</span>
          <span className={styles.metaValue}>{reportData.student?.department || 'پایه دهم ریاضی فیزیک'}</span>
        </div>

        <div className={styles.metaItem}>
          <span className={styles.metaLabel}>رتبه علمی نوبت</span>
          <span className={styles.metaValue} style={{ color: '#34d399' }}>
            {reportData.summary?.academic_standing || 'رتبه الف (ممتاز)'}
          </span>
        </div>
      </div>

      {/* KPI Summary Cards */}
      <div className={styles.kpiGrid}>
        <div className={styles.kpiCard} style={{ borderColor: 'rgba(99, 102, 241, 0.4)' }}>
          <div className={styles.kpiHeader}>
            <span className={styles.kpiTitle}>معدل کل نوبت</span>
            <HiOutlineTrophy style={{ color: '#818cf8', fontSize: '1.25rem' }} />
          </div>
          <div className={styles.kpiValueRow}>
            <span className={styles.kpiMainNumber} style={{ color: '#818cf8' }}>
              {reportData.summary?.overall_gpa != null ? reportData.summary.overall_gpa : '—'}
            </span>
            <span className={styles.kpiSubText}>از ۲۰</span>
          </div>
          <span className={styles.kpiSubText}>میانگین نمرات تمام دروس نوبت</span>
        </div>

        <div className={styles.kpiCard} style={{ borderColor: 'rgba(16, 185, 129, 0.4)' }}>
          <div className={styles.kpiHeader}>
            <span className={styles.kpiTitle}>رتبه و وضعیت علمی</span>
            <HiOutlineSparkles style={{ color: '#34d399', fontSize: '1.25rem' }} />
          </div>
          <div className={styles.kpiValueRow}>
            <span className={styles.kpiMainNumber} style={{ fontSize: '1.2rem', color: '#34d399' }}>
              {reportData.summary?.academic_standing}
            </span>
          </div>
          <span className={styles.kpiSubText}>بر اساس نمرات رسمی ثبت‌شده</span>
        </div>

        <div className={styles.kpiCard} style={{ borderColor: 'rgba(59, 130, 246, 0.4)' }}>
          <div className={styles.kpiHeader}>
            <span className={styles.kpiTitle}>نمره انضباط و اخلاق</span>
            <HiOutlineShieldCheck style={{ color: '#60a5fa', fontSize: '1.25rem' }} />
          </div>
          <div className={styles.kpiValueRow}>
            <span className={styles.kpiMainNumber} style={{ color: '#60a5fa' }}>
              {reportData.summary?.discipline_score}
            </span>
            <span className={styles.kpiSubText}>از ۲۰</span>
          </div>
          <span className={styles.kpiSubText}>ثبت شده توسط معاونت انضباطی</span>
        </div>

        <div className={styles.kpiCard}>
          <div className={styles.kpiHeader}>
            <span className={styles.kpiTitle}>وضعیت دروس</span>
            <HiOutlineAcademicCap style={{ color: '#fbbf24', fontSize: '1.25rem' }} />
          </div>
          <div className={styles.kpiValueRow}>
            <span className={styles.kpiMainNumber}>
              {reportData.summary?.passed_courses}
            </span>
            <span className={styles.kpiSubText}>از {reportData.summary?.total_courses} درس قبول</span>
          </div>
          <span className={styles.kpiSubText} style={{ color: reportData.summary?.failed_courses > 0 ? '#f87171' : '#34d399' }}>
            {reportData.summary?.failed_courses > 0
              ? `${reportData.summary.failed_courses} درس نیاز به تلاش`
              : 'بدون درس افتاده ✓'}
          </span>
        </div>
      </div>

      {/* Formal Grades Table */}
      <div className={styles.mobileScrollHint}>
        <span>📱 برای مشاهده نمرات مستمر، میان‌ترم و پایانی، جدول را به چپ بکشید ⟷</span>
      </div>
      <div className={styles.tableContainer}>
        <table className={styles.gradeTable}>
          <thead>
            <tr>
              <th style={{ width: '40px', textAlign: 'center' }}>#</th>
              <th>عنوان درس</th>
              <th>دبیر مدرس</th>
              <th style={{ textAlign: 'center' }}>ارزشیابی مستمر</th>
              <th style={{ textAlign: 'center' }}>آزمون میان‌ترم</th>
              <th style={{ textAlign: 'center' }}>آزمون پایانی</th>
              <th style={{ textAlign: 'center' }}>نمره نهایی درس</th>
              <th style={{ textAlign: 'center' }}>وضعیت قبولی</th>
            </tr>
          </thead>
          <tbody>
            {reportData.reportCards?.map((item, idx) => {
              const contScore = item.breakdowns?.find((b) => b.title.includes('مستمر'))?.score;
              const midScore = item.breakdowns?.find((b) => b.title.includes('میان‌ترم'))?.score;
              const finScore = item.breakdowns?.find((b) => b.title.includes('پایانی'))?.score;
              const finalScore = item.final_average;

              return (
                <tr key={item.class_id || idx}>
                  <td style={{ textAlign: 'center', color: 'var(--text-tertiary)', fontWeight: 700 }}>
                    {idx + 1}
                  </td>

                  <td>
                    <div className={styles.courseTitleCell}>
                      <span className={styles.courseName}>{item.subject || item.class_name}</span>
                      <span className={styles.teacherName}>{item.class_name}</span>
                    </div>
                  </td>

                  <td>
                    <span style={{ fontSize: '0.813rem', color: 'var(--text-secondary)' }}>
                      {item.teacher_name || 'دبیر تخصصی'}
                    </span>
                  </td>

                  <td style={{ textAlign: 'center' }}>
                    {contScore != null ? (
                      <span className={styles.scorePill} style={{ color: '#34d399' }}>{contScore}</span>
                    ) : (
                      <span style={{ color: 'var(--text-tertiary)' }}>—</span>
                    )}
                  </td>

                  <td style={{ textAlign: 'center' }}>
                    {midScore != null ? (
                      <span className={styles.scorePill} style={{ color: '#60a5fa' }}>{midScore}</span>
                    ) : (
                      <span style={{ color: 'var(--text-tertiary)' }}>—</span>
                    )}
                  </td>

                  <td style={{ textAlign: 'center' }}>
                    {finScore != null ? (
                      <span className={styles.scorePill} style={{ color: '#818cf8' }}>{finScore}</span>
                    ) : (
                      <span style={{ color: 'var(--text-tertiary)' }}>—</span>
                    )}
                  </td>

                  <td style={{ textAlign: 'center' }}>
                    {finalScore != null ? (
                      <span className={styles.scorePill} style={{ fontSize: '0.938rem', fontWeight: 900, color: '#34d399' }}>
                        {finalScore}
                      </span>
                    ) : (
                      <span style={{ color: 'var(--text-tertiary)' }}>—</span>
                    )}
                  </td>

                  <td style={{ textAlign: 'center' }}>
                    {item.status === 'قبول' ? (
                      <span className={styles.statusPassBadge}>
                        <HiOutlineCheckCircle />
                        <span>قبول</span>
                      </span>
                    ) : (
                      <span className={styles.statusFailBadge}>
                        <HiOutlineExclamationCircle />
                        <span>نیاز به تلاش</span>
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Discipline & Behavioral Note */}
      <div className={styles.disciplineBox}>
        <div className={styles.disciplineLeft}>
          <div className={styles.disciplineIconBox}>🛡️</div>
          <div>
            <h4 style={{ margin: '0 0 4px 0', fontSize: '0.938rem', fontWeight: 800, color: 'var(--text-primary)' }}>
              ارزشیابی اخلاقی، انضباطی و حضور و غیاب
            </h4>
            <p style={{ margin: 0, fontSize: '0.813rem', color: 'var(--text-secondary)' }}>
              دانش‌آموز دارای رفتار شایسته، مشارکت فعال در برنامه‌های پرورشی و غیبت‌های موجه است.
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '0.813rem', color: 'var(--text-tertiary)' }}>نمره انضباط ترم:</span>
          <span className={styles.disciplineScoreBadge}>
            {reportData.summary?.discipline_score} از ۲۰
          </span>
        </div>
      </div>

      {/* Signatures & Stamps */}
      <div className={styles.signatureSection}>
        <div className={styles.signatureBox}>
          <span className={styles.signatureRole}>دبیر راهنما و مدیر پایه</span>
          <div className={styles.signatureLine}>تایید و امضا شد</div>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>استاد مهدی رحمانی</span>
        </div>

        <div className={styles.signatureBox}>
          <span className={styles.signatureRole}>مهر رسمی آموزشگاه</span>
          <div className={styles.stampBox}>
            <span>مجتمع ادیبان</span>
            <span>تایید رسمی</span>
            <span>۱۴۰۳</span>
          </div>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>دبیرخانه منطقه یک</span>
        </div>

        <div className={styles.signatureBox}>
          <span className={styles.signatureRole}>مدیر مجتمع آموزشی</span>
          <div className={styles.signatureLine}>مهر و امضای نهایی</div>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>دکتر اصغر رضایی</span>
        </div>
      </div>
    </div>
  );
}
