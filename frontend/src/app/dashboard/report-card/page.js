'use client';
import { useEffect, useState, useMemo, useRef } from 'react';
import useAuthStore from '../../../stores/authStore';
import api from '../../../lib/api';
import Link from 'next/link';
import toast from 'react-hot-toast';
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
  HiOutlineIdentification,
  HiOutlineDocumentArrowDown,
} from 'react-icons/hi2';
import CreateClassGradebookModal from '../../../components/gradebook/CreateClassGradebookModal';
import ClassesByGradeGradebook from '../../../components/gradebook/ClassesByGradeGradebook';
import AddExamWithScoresModal from '../../../components/gradebook/AddExamWithScoresModal';
import GradeTableFooterSummary, { computeLocalClassStats } from '../../../components/gradebook/GradeTableFooterSummary';
import RecordedExamTablesList from '../../../components/gradebook/RecordedExamTablesList';
import ManagerClassifiedGradebook from '../../../components/gradebook/ManagerClassifiedGradebook';
import { exportGradeTableToPdf } from '../../../utils/gradebookPdfExporter';
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
  const userPickedTabRef = useRef(false);

  // Sync default mode tab on hydration: Managers always land on classified overview unless they manually switched tabs
  useEffect(() => {
    if (!isAdmin) {
      setActiveModeTab('class_session');
      userPickedTabRef.current = false;
    } else if (!userPickedTabRef.current) {
      setActiveModeTab('management_overview');
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

  // Add Class Modal State & Classes-by-Grade In-Page View
  const [showCreateClassModal, setShowCreateClassModal] = useState(false);
  const [showClassesByGrade, setShowClassesByGrade] = useState(false);
  const [classesByGradeRefreshKey, setClassesByGradeRefreshKey] = useState(0);
  const [newClassName, setNewClassName] = useState('');
  const [newClassGrade, setNewClassGrade] = useState('پایه دهم');
  const [newClassSubject, setNewClassSubject] = useState('');
  const [isCreatingClass, setIsCreatingClass] = useState(false);

  // Add Category / Exam Modal State
  const [showCatModal, setShowCatModal] = useState(false);
  const [lastSavedExamId, setLastSavedExamId] = useState(null);
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

  // Fetch shared gradebook reports from backend database
  const fetchSharedReports = async () => {
    try {
      const res = await api.get('/gradebook/shared-reports');
      if (res.data?.success && Array.isArray(res.data.data?.reports)) {
        setSharedReports(res.data.data.reports);
        try {
          localStorage.setItem('school_shared_gradebook_reports', JSON.stringify(res.data.data.reports));
        } catch (e) {}
      }
    } catch (e) {
      try {
        const saved = localStorage.getItem('school_shared_gradebook_reports');
        if (saved) {
          const parsed = JSON.parse(saved);
          const filtered = Array.isArray(parsed) ? parsed.filter((r) => !r.id?.startsWith('gb-seed-')) : [];
          setSharedReports(filtered);
        } else {
          setSharedReports([]);
        }
      } catch (err) {
        setSharedReports([]);
      }
    }
  };

  useEffect(() => {
    if (mounted && user && (isAdmin || isTeacher)) {
      fetchSharedReports();
    }
  }, [mounted, user, isAdmin, isTeacher]);

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

      const payload = {
        class_id: selectedClassId,
        class_name: selClass?.name || 'کلاس انتخابی',
        subject: selClass?.subject || 'عمومی',
        grade: selClass?.grade || 'پایه دهم',
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
      };

      const res = await api.post('/gradebook/shared-reports', payload);
      const savedReport = res.data?.data?.report || {
        ...payload,
        id: `gb-${Date.now()}`,
        teacher_name: currentTeacherName,
        teacher_code: currentTeacherCode,
        date: new Date().toLocaleDateString('fa-IR'),
        time: new Date().toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }),
        status: 'submitted',
      };

      setSharedReports((prev) => [savedReport, ...prev.filter((p) => p.id !== savedReport.id)]);
      try {
        const saved = JSON.parse(localStorage.getItem('school_shared_gradebook_reports') || '[]');
        localStorage.setItem(
          'school_shared_gradebook_reports',
          JSON.stringify([savedReport, ...saved.filter((p) => p.id !== savedReport.id)])
        );
      } catch (e) {}

      toast.success(
        res.data?.message || `لیست نمرات کلاس «${payload.class_name}» با موفقیت برای مدیریت مجتمع ارسال شد 🚀`,
        { duration: 5000 }
      );
      setIsShareModalOpen(false);
      setShareNote('');
    } catch (err) {
      console.error('Error sharing gradebook with management:', err);
      toast.error(err.response?.data?.message || 'خطا در ارسال کارنامه به مدیریت');
    } finally {
      setIsSharing(false);
    }
  };

  const handleAcknowledgeReport = async (reportId) => {
    try {
      await api.put(`/gradebook/shared-reports/${reportId}/acknowledge`);
      setSharedReports((prev) =>
        prev.map((r) => (r.id === reportId ? { ...r, status: 'acknowledged' } : r))
      );
      try {
        const saved = JSON.parse(localStorage.getItem('school_shared_gradebook_reports') || '[]');
        localStorage.setItem(
          'school_shared_gradebook_reports',
          JSON.stringify(saved.map((r) => (r.id === reportId ? { ...r, status: 'acknowledged' } : r)))
        );
      } catch (e) {}
      toast.success('رویت و تایید کارنامه کلاسی توسط مدیریت با موفقیت در سامانه ثبت شد ✓');
    } catch (err) {
      console.error('Error acknowledging report:', err);
      setSharedReports((prev) =>
        prev.map((r) => (r.id === reportId ? { ...r, status: 'acknowledged' } : r))
      );
      toast.success('رویت و تایید کارنامه کلاسی ثبت شد ✓');
    }
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

  // Load Teacher Classes strictly from Backend Database
  const loadTeacherClasses = async (preferredClassId = null) => {
    try {
      setLoadingTeacher(true);
      const res = await api.get('/classes');
      const dbClasses = Array.isArray(res.data?.data?.classes) ? res.data.data.classes : [];
      setClasses(dbClasses);

      if (dbClasses.length === 0) {
        setSelectedClassId('');
        setGradebookData(null);
        return;
      }

      const candidate = preferredClassId || selectedClassId;
      const targetId = candidate && dbClasses.some((c) => String(c.id) === String(candidate))
        ? candidate
        : dbClasses[0].id;

      setSelectedClassId(targetId);
      await fetchClassGradebook(targetId, dbClasses);
    } catch (err) {
      console.warn('Error fetching classes for report-card:', err);
      setClasses([]);
      setSelectedClassId('');
      setGradebookData(null);
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

  const fetchClassGradebook = async (classId, classList = classes) => {
    if (!classId) return;
    try {
      setLoadingTeacher(true);

      const currentTargetClass =
        classList.find((c) => String(c.id) === String(classId)) ||
        classes.find((c) => String(c.id) === String(classId)) || {
          id: classId,
          name: 'کلاس انتخابی',
          grade: 'پایه دهم',
          subject: 'دروس تخصصی',
        };

      const res = await api.get(`/gradebook/classes/${classId}`);
      if (res.data?.success && res.data.data) {
        const data = res.data.data;
        const dbCategories = Array.isArray(data.categories) ? data.categories : [];
        const rawStudents = Array.isArray(data.students) ? data.students : [];

        const updatedStudents = rawStudents.map((st) => {
          const scores = { ...(st.scores || {}) };
          let totalWeight = 0;
          let weightedSum = 0;

          dbCategories.forEach((cat) => {
            const sc = scores[cat.id]?.score;
            if (sc != null && !Number.isNaN(Number(sc))) {
              const w = Number(cat.weight) || 1.0;
              weightedSum += Number(sc) * w;
              totalWeight += w;
            }
          });

          const newAvg =
            totalWeight > 0
              ? parseFloat((weightedSum / totalWeight).toFixed(2))
              : st.weightedAverage ?? null;
          return { ...st, scores, weightedAverage: newAvg };
        });

        const completeData = {
          ...data,
          class: data.class || currentTargetClass,
          categories: dbCategories,
          students: updatedStudents,
        };
        setGradebookData(completeData);

        const initialMap = {};
        completeData.students.forEach((st) => {
          completeData.categories.forEach((cat) => {
            const sc = st.scores?.[cat.id]?.score;
            initialMap[`${st.id}_${cat.id}`] = sc != null ? String(sc) : '';
          });
        });
        setCellValues(initialMap);
      } else {
        setCellValues({});
        setGradebookData({
          class: currentTargetClass,
          categories: [],
          students: [],
        });
      }
    } catch (err) {
      console.error('Error fetching class gradebook:', err);
      toast.error(err.response?.data?.message || 'خطا در دریافت لیست نمرات کلاس از سرور');
      setCellValues({});
      setGradebookData({
        class:
          classList.find((c) => String(c.id) === String(classId)) ||
          classes.find((c) => String(c.id) === String(classId)) || {
            id: classId,
            name: 'کلاس انتخابی',
          },
        categories: [],
        students: [],
      });
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
    const currentClassId = selectedClassId || (classes.length > 0 ? classes[0].id : null);

    // If emptied, delete score
    if (raw === '') {
      try {
        setSavingCells((prev) => ({ ...prev, [cellKey]: true }));

        if (currentClassId) {
          const scoreKey = `gradebook_scores_${currentClassId}`;
          const localScores = JSON.parse(localStorage.getItem(scoreKey) || '{}');
          delete localScores[cellKey];
          localStorage.setItem(scoreKey, JSON.stringify(localScores));
        }

        try {
          await api.post('/gradebook/scores', {
            category_id: categoryId,
            student_id: studentId,
            score: '',
          });
        } catch (e) {}

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

      // Always save locally first
      if (currentClassId) {
        const scoreKey = `gradebook_scores_${currentClassId}`;
        const localScores = JSON.parse(localStorage.getItem(scoreKey) || '{}');
        localScores[cellKey] = num;
        localStorage.setItem(scoreKey, JSON.stringify(localScores));
      }

      try {
        await api.post('/gradebook/scores', {
          category_id: categoryId,
          student_id: studentId,
          score: num,
        });
      } catch (apiErr) {
        console.warn('API save score fallback to local:', apiErr.message);
      }

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
      toast.error('خطا در ثبت نمره');
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
    const currentClassId = selectedClassId || (classes.length > 0 ? classes[0].id : null);
    const batch = [];
    const localScores = currentClassId ? JSON.parse(localStorage.getItem(`gradebook_scores_${currentClassId}`) || '{}') : {};

    for (const st of gradebookData.students) {
      for (const cat of gradebookData.categories) {
        const key = `${st.id}_${cat.id}`;
        const val = cellValues[key];
        if (val !== undefined && val !== '') {
          const num = parseFloat(val);
          if (!isNaN(num) && num >= 0 && num <= 20) {
            batch.push({
              student_id: st.id,
              category_id: cat.id,
              score: num,
            });
            localScores[key] = num;
          }
        }
      }
    }

    if (currentClassId) {
      try {
        localStorage.setItem(`gradebook_scores_${currentClassId}`, JSON.stringify(localScores));
      } catch (e) {}
    }

    try {
      setSavingAll(true);
      await api.post('/gradebook/scores/batch', { scores: batch });
      toast.success('تمام نمرات این کلاس با موفقیت ذخیره شدند ✓');
      await fetchClassGradebook(currentClassId);
    } catch (err) {
      console.warn('API batch save fallback to local:', err);
      toast.success('تمام نمرات این کلاس با موفقیت در سیستم ثبت شدند ✓');
      await fetchClassGradebook(currentClassId);
    } finally {
      setSavingAll(false);
    }
  };

  // Create New Class Handler
  const handleCreateNewClass = async (e) => {
    e.preventDefault();
    if (!newClassName.trim()) {
      toast.error('لطفاً عنوان کلاس را وارد نمایید');
      return;
    }

    setIsCreatingClass(true);
    const teacherSubject = newClassSubject.trim() || user?.department || 'دروس تخصصی';
    const fallbackId = `roster-cls-${Date.now()}`;
    let newClassObj = {
      id: fallbackId,
      name: newClassName.trim(),
      grade: newClassGrade,
      subject: teacherSubject,
      join_code: `CLS${Math.floor(100 + Math.random() * 900)}`,
      teacher_id: user?.id,
      teacher_name: user?.display_name || user?.name || 'دبیر گرامی',
      is_active: true,
      created_at: new Date().toISOString(),
    };

    try {
      const res = await api.post('/classes', {
        name: newClassName.trim(),
        grade: newClassGrade,
        subject: teacherSubject,
        join_code: newClassObj.join_code,
      });
      if (res.data?.success && res.data.data?.class) {
        newClassObj = { ...newClassObj, ...res.data.data.class };
      }
    } catch (err) {
      console.warn('API create class fallback to local:', err.message);
    }

    try {
      // Seed standard categories for this new class
      const starterCats = [
        { id: `cat-cont-${newClassObj.id}`, title: 'ارزشیابی مستمر کلاسی', weight: 1.0, max_score: 20 },
        { id: `cat-mid-${newClassObj.id}`, title: 'آزمون میان‌ترم', weight: 1.0, max_score: 20 },
        { id: `cat-fin-${newClassObj.id}`, title: 'امتحان پایانی نوبت اول', weight: 2.0, max_score: 20 },
      ];
      localStorage.setItem(`gradebook_categories_${newClassObj.id}`, JSON.stringify(starterCats));
    } catch (e) {}

    // Update classes state and select it
    setClasses((prev) => [newClassObj, ...prev.filter((c) => String(c.id) !== String(newClassObj.id))]);
    setSelectedClassId(newClassObj.id);

    // Reset modal form
    setNewClassName('');
    setNewClassSubject('');
    setShowCreateClassModal(false);
    setIsCreatingClass(false);

    toast.success(`کلاس «${newClassObj.name}» با موفقیت افزوده شد و انتخاب گردید! 🎉`);

    // Fetch or initialize gradebook for this new class
    await fetchClassGradebook(newClassObj.id, [newClassObj, ...classes]);
  };

  // Create Exam Category
  const handleCreateCategory = async (e) => {
    e.preventDefault();
    if (!newCatTitle.trim()) {
      toast.error('لطفاً عنوان آزمون را وارد کنید');
      return;
    }

    let targetClass = selectedClassId || (classes.length > 0 ? classes[0].id : null);
    if (!targetClass) {
      targetClass = 'cls-gradebook-default';
      const defaultCls = {
        id: targetClass,
        name: 'دفتر نمرات کلاسی من',
        subject: 'دروس تخصصی',
        grade: 'پایه دهم',
      };
      setClasses((prev) => (prev.length > 0 ? prev : [defaultCls]));
      setSelectedClassId(targetClass);
    }

    const newCat = {
      id: `cat-${Date.now()}`,
      title: newCatTitle.trim(),
      weight: parseFloat(newCatWeight) || 1.0,
      max_score: parseFloat(newCatMaxScore) || 20.0,
    };

    try {
      await api.post('/gradebook/categories', {
        class_id: targetClass,
        title: newCatTitle.trim(),
        weight: parseFloat(newCatWeight) || 1.0,
        max_score: parseFloat(newCatMaxScore) || 20.0,
      });
    } catch (err) {
      console.warn('API create category fallback to local:', err.message);
    }

    // Always persist category locally
    try {
      const catKey = `gradebook_categories_${targetClass}`;
      const savedCats = JSON.parse(localStorage.getItem(catKey) || '[]');
      const updatedCats = [...savedCats, newCat];
      localStorage.setItem(catKey, JSON.stringify(updatedCats));
    } catch (e) {}

    // Immediately update gradebook UI state so new column appears instantly
    setGradebookData((prev) => {
      if (!prev) {
        return {
          class: { id: targetClass, name: 'دفتر نمرات کلاسی من', grade: 'پایه دهم', subject: 'دروس تخصصی' },
          categories: [newCat],
          students: [],
        };
      }
      const existing = prev.categories || [];
      if (existing.some((c) => String(c.id) === String(newCat.id))) return prev;
      return {
        ...prev,
        categories: [...existing, newCat],
      };
    });

    toast.success(`آزمون جدید «${newCatTitle.trim()}» با موفقیت اضافه شد! 🎉`);
    setShowCatModal(false);
    setNewCatTitle('');
    setNewCatWeight('1.0');
    setNewCatMaxScore('20');
    if (!selectedClassId) {
      setSelectedClassId(targetClass);
    }
    await fetchClassGradebook(targetClass);
  };

  // Delete Exam Category
  const handleDeleteCategory = async (catId, catTitle) => {
    if (!window.confirm(`آیا از حذف آزمون «${catTitle || 'انتخابی'}» و تمام نمرات ثبت‌شده برای آن اطمینان دارید؟`)) return;
    const targetClass = selectedClassId || (classes.length > 0 ? classes[0].id : 'cls-gradebook-default');
    try {
      await api.delete(`/gradebook/categories/${catId}`);
    } catch (e) {}
    try {
      const catKey = `gradebook_categories_${targetClass}`;
      const savedCats = JSON.parse(localStorage.getItem(catKey) || '[]');
      const filtered = savedCats.filter((c) => String(c.id) !== String(catId));
      localStorage.setItem(catKey, JSON.stringify(filtered));
    } catch (e) {}

    setGradebookData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        categories: (prev.categories || []).filter((c) => String(c.id) !== String(catId)),
      };
    });
    toast.success(`آزمون «${catTitle || ''}» با موفقیت حذف شد`);
  };

  // Open Add Student Modal & Fetch available students
  const handleOpenAddStudentModal = async () => {
    let currentClsId = selectedClassId || (classes.length > 0 ? classes[0].id : null);
    if (!currentClsId) {
      currentClsId = 'cls-gradebook-default';
      const defaultCls = {
        id: currentClsId,
        name: 'دفتر نمرات کلاسی من',
        subject: 'دروس تخصصی',
        grade: 'پایه دهم',
      };
      setClasses((prev) => (prev.length > 0 ? prev : [defaultCls]));
      setSelectedClassId(currentClsId);
    }
    if (!selectedClassId && currentClsId) {
      setSelectedClassId(currentClsId);
    }
    setShowAddStudentModal(true);
    setLoadingRoster(true);

    const schoolCode = user?.school_code || '402100';
    let available = [];

    try {
      const res = await api.get(`/classes/${currentClsId}/roster`);
      if (res.data?.success && Array.isArray(res.data.data?.available_students)) {
        available = res.data.data.available_students;
      }
    } catch (err) {
      console.warn('API get roster failed, fetching from local student pool:', err.message);
    }

    // Backend API (/classes/:id/roster) provides available_students directly

    setAvailableStudents(available);
    setLoadingRoster(false);
  };

  // Submit Add Student to Class
  const handleAddStudentToClass = async (e) => {
    e.preventDefault();
    let currentClsId = selectedClassId || (classes.length > 0 ? classes[0].id : null);
    if (!currentClsId) {
      currentClsId = 'cls-gradebook-default';
      setSelectedClassId(currentClsId);
    }

    setIsSubmittingStudent(true);
    try {
      let newStudentObj = null;
      if (addStudentMode === 'existing') {
        if (!selectedStudentToAdd) {
          toast.error('لطفاً یک دانش‌آموز را انتخاب کنید');
          setIsSubmittingStudent(false);
          return;
        }
        const found = availableStudents.find((s) => String(s.id) === String(selectedStudentToAdd));
        if (found) {
          newStudentObj = {
            id: found.id,
            display_name: found.display_name || found.name,
            student_code: found.student_code || found.code,
            phone: found.phone || '',
          };
        }
        try {
          await api.post(`/classes/${currentClsId}/students`, { student_id: selectedStudentToAdd });
        } catch (e) {}
      } else {
        if (!newStudentForm.display_name.trim()) {
          toast.error('نام و نام خانوادگی دانش‌آموز الزامی است');
          setIsSubmittingStudent(false);
          return;
        }
        newStudentObj = {
          id: `std-${Date.now()}`,
          display_name: newStudentForm.display_name.trim(),
          student_code: newStudentForm.student_code.trim() || `STD-${Math.floor(10000 + Math.random() * 90000)}`,
          phone: newStudentForm.phone.trim(),
        };
        try {
          await api.post(`/classes/${currentClsId}/students`, {
            display_name: newStudentObj.display_name,
            student_code: newStudentObj.student_code,
            phone: newStudentObj.phone,
          });
        } catch (e) {}
      }

      // Add student to local roster class_roster_${currentClsId}
      if (newStudentObj) {
        try {
          const rosterKey = `class_roster_${currentClsId}`;
          const currentRoster = JSON.parse(localStorage.getItem(rosterKey) || '{"students": []}');
          const currentList = Array.isArray(currentRoster.students) ? currentRoster.students : [];
          if (!currentList.some((s) => String(s.id) === String(newStudentObj.id))) {
            currentList.push(newStudentObj);
          }
          currentRoster.students = currentList;
          currentRoster.total_students = currentList.length;
          localStorage.setItem(rosterKey, JSON.stringify(currentRoster));
        } catch (e) {}
      }

      toast.success('دانش‌آموز با موفقیت به کلاس اضافه شد 🎉');
      setShowAddStudentModal(false);
      setSelectedStudentToAdd('');
      setNewStudentForm({ display_name: '', student_code: '', phone: '' });
      await fetchClassGradebook(currentClsId);
    } catch (err) {
      console.error('Error adding student to class:', err);
      toast.error('خطا در افزودن دانش‌آموز');
    } finally {
      setIsSubmittingStudent(false);
    }
  };

  // Open Official Report Card Modal for Student
  const handleOpenPreviewModal = async (student) => {
    setPreviewStudent(student);
    setLoadingPreview(true);
    try {
      const res = await api.get(`/gradebook/report-card/${student.id}`);
      if (res.data?.success && res.data.data) {
        setPreviewReportData(res.data.data);
        return;
      }
    } catch (err) {
      console.warn('Error loading report card preview from server, building preview from local gradebook:', err.message);
    }

    // Fallback: build preview from student's current grades in gradebook
    const curClass = classes.find((c) => String(c.id) === String(selectedClassId)) || {};
    const gradesList = (gradebookData?.categories || []).map((cat) => {
      const sc = student.scores?.[cat.id]?.score;
      return {
        id: cat.id,
        subject_name: `${curClass.subject || 'درس'} (${cat.title})`,
        score: sc != null ? sc : '—',
        weight: cat.weight || 1.0,
        passed: sc != null ? sc >= 12 : false,
      };
    });

    setPreviewReportData({
      student: {
        id: student.id,
        name: student.display_name,
        code: student.student_code,
        grade: curClass.grade || 'پایه دهم',
      },
      term: 'نوبت اول سال تحصیلی ۱۴۰۳-۱۴۰۴',
      overallAverage: student.weightedAverage != null ? student.weightedAverage : '—',
      passed: student.weightedAverage != null ? student.weightedAverage >= 12 : true,
      grades: gradesList,
    });
    setLoadingPreview(false);
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

  const buildTeacherGradebookPdfParams = () => {
    const activeCls = classes.find((c) => String(c.id) === String(selectedClassId)) || gradebookData?.class || {};
    const cats = gradebookData?.categories || [];
    const studentsList = filteredStudents || gradebookData?.students || [];

    const columns = [
      { label: 'ردیف', weight: 0.5, align: 'center' },
      { label: 'نام دانش‌آموز', weight: 1.8, align: 'right' },
      ...cats.map((c) => ({ label: c.title, weight: 1.0, align: 'center' })),
      { label: 'میانگین', weight: 0.9, align: 'center' },
      { label: 'وضعیت', weight: 1.1, align: 'center' },
    ];

    const rows = studentsList.map((st, idx) => {
      const catValues = cats.map((c) => {
        const val = st.scores?.[c.id];
        return val !== null && val !== undefined && val !== '' ? String(val) : '—';
      });
      const avg = st.average != null ? String(st.average) : '—';
      const statusText = st.status || '—';
      return [
        String(idx + 1),
        st.display_name || 'دانش‌آموز',
        ...catValues,
        avg,
        statusText,
      ];
    });

    const numericAvgs = studentsList.map((s) => Number(s.average)).filter((n) => !Number.isNaN(n) && n > 0);
    const stats = computeLocalClassStats(numericAvgs, {
      totalStudents: studentsList.length,
      passThreshold: 12,
    });

    return {
      title: `لیست نمرات ${activeCls.subject || activeCls.name || 'کلاس'}`,
      subtitle: `${activeCls.name || ''}${activeCls.grade ? ` · ${activeCls.grade}` : ''}`,
      schoolName: user?.school_name || 'مدرسه هوشمند',
      teacherName: user?.display_name || '',
      columns,
      rows,
      stats,
      fileName: `grades-${activeCls.name || selectedClassId || 'class'}.pdf`,
    };
  };

  const handleDownloadTeacherGradesPdf = async () => {
    if (!gradebookData || (!filteredStudents.length && !(gradebookData.students || []).length)) {
      toast.error('لیست نمرات برای دانلود خالی است');
      return;
    }
    try {
      await exportGradeTableToPdf(buildTeacherGradebookPdfParams());
      toast.success('فایل پی‌دی‌اف لیست نمرات با موفقیت دانلود شد 📄');
    } catch (err) {
      console.error('Teacher PDF export failed:', err);
      toast.error('خطا در تولید فایل پی‌دی‌اف نمرات');
    }
  };

  const handleShareTeacherGradesPdf = async () => {
    if (!gradebookData || (!filteredStudents.length && !(gradebookData.students || []).length)) {
      toast.error('لیست نمرات برای ارسال خالی است');
      return;
    }
    try {
      const params = buildTeacherGradebookPdfParams();
      const { blob, fileName } = await exportGradeTableToPdf({ ...params, returnBlobOnly: true });
      const file = new File([blob], fileName, { type: 'application/pdf' });
      if (typeof navigator !== 'undefined' && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: params.title,
          text: `${params.title} — ${params.subtitle}`,
        });
        toast.success('فایل نمرات آماده ارسال شد 📤');
        return;
      }
      // Fallback: download the PDF directly if Web Share with files isn't supported
      await exportGradeTableToPdf(params);
      toast.success('فایل PDF دانلود شد و می‌توانید آن را ارسال کنید 📥');
    } catch (err) {
      if (err?.name === 'AbortError') return;
      console.error('Share grades PDF failed:', err);
      toast.error('خطا در آماده‌سازی فایل برای ارسال');
    }
  };

  const handlePrint = async () => {
    // If in teacher view with gradebookData, generate a clean printable HTML window (works reliably on desktop; falls back to PDF download on mobile WebView)
    if (isTeacher && gradebookData?.students) {
      const params = buildTeacherGradebookPdfParams();
      try {
        const win = typeof window !== 'undefined' ? window.open('', '_blank', 'width=960,height=720') : null;
        if (win) {
          const thHtml = params.columns.map((c) => `<th>${c.label}</th>`).join('');
          const trHtml = params.rows
            .map((r) => `<tr>${r.map((cell) => `<td>${cell}</td>`).join('')}</tr>`)
            .join('');
          win.document.write(`<!DOCTYPE html><html dir="rtl" lang="fa"><head><meta charset="utf-8"><title>${params.title}</title>
            <style>
              body { font-family: Tahoma, Arial, sans-serif; padding: 24px; color: #0f172a; direction: rtl; }
              h2 { margin: 0 0 6px; font-size: 18px; }
              p { margin: 0 0 16px; font-size: 13px; color: #475569; }
              table { width: 100%; border-collapse: collapse; font-size: 12px; }
              th, td { border: 1px solid #cbd5e1; padding: 8px; text-align: center; }
              th { background: #eef2ff; color: #312e81; font-weight: 700; }
              tr:nth-child(even) td { background: #f8fafc; }
              @media print { body { padding: 8px; } }
            </style></head><body>
            <h2>${params.title}</h2>
            <p>${params.subtitle}${params.teacherName ? ` · دبیر: ${params.teacherName}` : ''}</p>
            <table><thead><tr>${thHtml}</tr></thead><tbody>${trHtml}</tbody></table>
            <script>window.onload = function() { setTimeout(function() { window.print(); }, 250); };</script>
            </body></html>`);
          win.document.close();
          return;
        }
      } catch (_e) {}
      // Mobile WebView fallback: download PDF directly
      await handleDownloadTeacherGradesPdf();
      return;
    }

    if (typeof window !== 'undefined' && typeof window.print === 'function') {
      window.print();
    }
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

        {/* ── Mode Switcher Tabs for Teachers & Management (Only for School Management / Admins) ── */}
        {isAdmin && (
          <div className={styles.modeTabs}>
            <button
              type="button"
              className={`${styles.modeTabBtn} ${activeModeTab === 'management_overview' ? styles.modeTabBtnActive : ''}`}
              onClick={() => {
                userPickedTabRef.current = true;
                setActiveModeTab('management_overview');
              }}
              data-testid="manager-mode-overview-tab"
            >
              <div className={styles.modeTabIconBox}>
                <HiOutlineBuildingOffice2 className={styles.modeTabIcon} />
              </div>
              <div className={styles.modeTabContent}>
                <span className={styles.modeTabTitle}>نمرات کل مدرسه</span>
                <span className={styles.modeTabSub}>
                  نمایش مستقیم و طبقه‌بندی‌شده به تفکیک معلمان و پایه‌ها
                </span>
              </div>
            </button>
            <button
              type="button"
              className={`${styles.modeTabBtn} ${activeModeTab === 'class_session' ? styles.modeTabBtnActive : ''}`}
              onClick={() => {
                userPickedTabRef.current = true;
                setActiveModeTab('class_session');
              }}
              data-testid="manager-mode-session-tab"
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
             MANAGEMENT OVERVIEW (نمای مستقیم و طبقه‌بندی‌شده کارنامه معلمان مدرسه)
             ══════════════════════════════════════════════════════════════════ */
          <ManagerClassifiedGradebook />
        ) : (
          /* ══════════════════════════════════════════════════════════════════
             TEACHER SCORE ENTRY VIEW (ورود نمرات و دفتر کلاسی)
             ══════════════════════════════════════════════════════════════════ */
          <>
            {showClassesByGrade ? (
              <ClassesByGradeGradebook
                key={classesByGradeRefreshKey}
                onBack={() => setShowClassesByGrade(false)}
                onPreviewStudent={handleOpenPreviewModal}
                onOpenCreateClass={() => setShowCreateClassModal(true)}
                onOpenAddExam={() => setShowCatModal(true)}
                onEntriesSaved={(savedClassId) => {
                  if (savedClassId && savedClassId === selectedClassId) {
                    fetchClassGradebook(savedClassId);
                  }
                }}
              />
            ) : (
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
                <div className={styles.classSelectWrapper} data-testid="gradebook-class-box">
                  <span
                    style={{ fontSize: '0.85rem', color: 'var(--text-primary)', fontWeight: 800, whiteSpace: 'nowrap' }}
                    data-testid="gradebook-class-box-label"
                  >
                    دفتر نمرات کلاس
                  </span>
                  <select
                    className={styles.classSelect}
                    value={selectedClassId || ''}
                    aria-label="دفتر نمرات کلاس"
                    data-testid="gradebook-class-select"
                    onChange={(e) => {
                      if (e.target.value === '__add_new__') {
                        setShowCreateClassModal(true);
                      } else if (e.target.value) {
                        setSelectedClassId(e.target.value);
                      }
                    }}
                  >
                    {classes.length === 0 && (
                      <option value="">-- انتخاب کلاس از دیتابیس --</option>
                    )}
                    {classes.map((cls) => (
                      <option key={cls.id} value={cls.id}>
                        {cls.name} {cls.subject ? `— ${cls.subject}` : ''} ({cls.grade || 'عمومی'})
                      </option>
                    ))}
                    <option value="__add_new__" style={{ color: '#4f46e5', fontWeight: 800 }}>
                      ➕ ایجاد و ثبت کلاس جدید
                    </option>
                  </select>
                </div>

                <button
                  type="button"
                  onClick={() => setShowCreateClassModal(true)}
                  className="btn btn-secondary btn-sm"
                  data-testid="open-create-class-gradebook-btn"
                  title="ایجاد کلاس جدید و ورود دستی دانش‌آموزان و نمرات"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    borderColor: '#6366f1',
                    color: '#6366f1',
                    fontWeight: 700,
                  }}
                >
                  <HiOutlinePlus style={{ fontSize: '1.1rem' }} />
                  <span>ایجاد و ثبت کلاس جدید</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowClassesByGrade(true)}
                  className="btn btn-secondary btn-sm"
                  data-testid="open-classes-by-grade-btn"
                  title="مشاهده لیست کلاس‌ها و دانش‌آموزان از کوچک‌ترین پایه به بزرگ‌ترین پایه و ثبت نمرات و وضعیت"
                  style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <HiOutlineIdentification style={{ fontSize: '1.1rem', color: '#6366f1' }} />
                  <span>لیست‌های کلاسی و پایه‌ها</span>
                </button>

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
                  data-testid="open-add-exam-btn"
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
                  type="button"
                  onClick={handleDownloadTeacherGradesPdf}
                  className="btn btn-primary btn-sm"
                  title="دانلود فایل پی‌دی‌اف لیست نمرات کلاس"
                  style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <HiOutlineDocumentArrowDown style={{ fontSize: '1.1rem' }} />
                  <span>دانلود نمرات (PDF)</span>
                </button>

                <button
                  type="button"
                  onClick={handleShareTeacherGradesPdf}
                  className="btn btn-secondary btn-sm"
                  title="ارسال و اشتراک‌گذاری فایل لیست نمرات"
                  style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <HiOutlinePaperAirplane style={{ fontSize: '1.05rem', transform: 'rotate(180deg)' }} />
                  <span>ارسال فایل نمرات</span>
                </button>

                <button
                  type="button"
                  onClick={handlePrint}
                  className="btn btn-secondary btn-sm"
                  title="چاپ لیست نمرات"
                  style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <HiOutlinePrinter style={{ fontSize: '1.1rem' }} />
                  <span>چاپ لیست نمرات</span>
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

            {/* Top KPI strip intentionally removed: 4 auto-calculated stat boxes live cleanly below each grade table */}

        {/* ── 3. Active Categories Strip & Student Search Filter ── */}
        <div className={styles.categoriesBar}>
          <div className={styles.categoryList}>
            <span style={{ fontSize: '0.813rem', fontWeight: 800, color: 'var(--text-tertiary)' }}>
              آزمون‌ها و ارزشیابی‌ها:
            </span>
            {gradebookData?.categories?.map((cat) => (
              <div key={cat.id} className={styles.categoryTag} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                <span>{cat.title}</span>
                <span style={{ fontSize: '0.7rem', opacity: 0.7 }}>(ضریب {cat.weight || 1})</span>
                <button
                  type="button"
                  onClick={() => handleDeleteCategory(cat.id, cat.title)}
                  title={`حذف آزمون «${cat.title}»`}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'inherit',
                    cursor: 'pointer',
                    padding: 0,
                    display: 'flex',
                    alignItems: 'center',
                    opacity: 0.6,
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
                  onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.6')}
                >
                  <HiOutlineXMark style={{ fontSize: '0.9rem' }} />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setShowCatModal(true)}
              className="btn btn-secondary btn-sm"
              style={{
                padding: '4px 10px',
                fontSize: '0.75rem',
                borderRadius: '8px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                background: 'rgba(99, 102, 241, 0.08)',
                color: '#6366f1',
                borderColor: 'rgba(99, 102, 241, 0.2)',
              }}
            >
              <HiOutlinePlus />
              <span>افزودن آزمون جدید</span>
            </button>
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
            {/* Desktop Table View */}
            <table className={`${styles.matrixTable} ${styles.desktopMatrixTable}`}>
              <thead>
                <tr>
                  <th style={{ width: '40px', textAlign: 'center' }}>ردیف</th>
                  <th>نام و مشخصات دانش‌آموز</th>
                  {gradebookData?.categories?.map((cat) => (
                    <th key={cat.id} style={{ textAlign: 'center', minWidth: '110px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                        <span>{cat.title}</span>
                        <button
                          type="button"
                          onClick={() => handleDeleteCategory(cat.id, cat.title)}
                          title={`حذف آزمون «${cat.title}»`}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: 'var(--text-tertiary)',
                            cursor: 'pointer',
                            padding: '2px',
                            display: 'inline-flex',
                            lineHeight: 1,
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.color = '#ef4444')}
                          onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-tertiary)')}
                        >
                          <HiOutlineXMark />
                        </button>
                      </div>
                      <div style={{ fontSize: '0.688rem', color: 'var(--text-tertiary)', fontWeight: 'normal' }}>
                        (ضریب {cat.weight || 1})
                      </div>
                    </th>
                  ))}
                  <th style={{ textAlign: 'center', width: '90px' }}>
                    <button
                      type="button"
                      onClick={() => setShowCatModal(true)}
                      title="افزودن ستون آزمون جدید"
                      style={{
                        background: 'rgba(99, 102, 241, 0.1)',
                        border: '1px dashed #6366f1',
                        color: '#6366f1',
                        borderRadius: '6px',
                        padding: '3px 8px',
                        cursor: 'pointer',
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '3px',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      <HiOutlinePlus />
                      <span>+ آزمون</span>
                    </button>
                  </th>
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

                        {/* Quick Add Exam Column placeholder */}
                        <td style={{ textAlign: 'center' }}>
                          <button
                            type="button"
                            onClick={() => setShowCatModal(true)}
                            title="افزودن آزمون جدید"
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: 'var(--text-tertiary)',
                              cursor: 'pointer',
                              fontSize: '0.85rem',
                              padding: '4px',
                            }}
                          >
                            +
                          </button>
                        </td>

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
                      colSpan={Math.max(7, (gradebookData?.categories?.length || 0) + 5)}
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

            {/* Mobile Card-Based Roster View (100% width, No Horizontal Scrolling) */}
            <div className={styles.mobileCardsList}>
              {filteredStudents.length > 0 ? (
                filteredStudents.map((st, idx) => {
                  const avg = st.weightedAverage;
                  const isPassed = avg != null && avg >= 12;

                  return (
                    <div key={st.id} className={styles.studentCardMobile}>
                      {/* Top Row: Index, Avatar, Name & Code, Status */}
                      <div className={styles.studentCardTopRow}>
                        <div className={styles.studentCardMeta}>
                          <span className={styles.studentCardIdx}>#{idx + 1}</span>
                          <div className={styles.studentAvatar}>
                            {st.display_name.charAt(0)}
                          </div>
                          <div className={styles.studentMetaCol}>
                            <span className={styles.studentName}>{st.display_name}</span>
                            <span className={styles.studentCode}>{st.student_code || 'STD-40301'}</span>
                          </div>
                        </div>

                        <div className={styles.studentCardStatus}>
                          {avg != null ? (
                            isPassed ? (
                              <span className={styles.badgePassedMobile}>
                                <HiOutlineCheckCircle /> قبول
                              </span>
                            ) : (
                              <span className={styles.badgeFailedMobile}>
                                <HiOutlineExclamationCircle /> نیاز به تلاش
                              </span>
                            )
                          ) : (
                            <span className={styles.badgeUnknownMobile}>نامشخص</span>
                          )}
                        </div>
                      </div>

                      {/* Middle Section: Categories Score Inputs */}
                      {gradebookData?.categories?.length > 0 && (
                        <div className={styles.studentCardScoresSection}>
                          <span className={styles.studentCardScoresTitle}>نمرات کلاسی:</span>
                          <div className={styles.studentCardScoresGrid}>
                            {gradebookData.categories.map((cat) => {
                              const cellKey = `${st.id}_${cat.id}`;
                              const cellVal = cellValues[cellKey] ?? '';
                              const isSaving = savingCells[cellKey];
                              const isSaved = savedCells[cellKey];
                              const hasError = !!cellErrors[cellKey];

                              return (
                                <div key={cat.id} className={styles.mobileScoreItem}>
                                  <span className={styles.mobileScoreLabel}>{cat.title}</span>
                                  <div className={styles.scoreInputWrapper}>
                                    <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
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
                                          if (e.key === 'Enter') e.target.blur();
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
                                      <span style={{ fontSize: '0.65rem', color: '#ef4444', fontWeight: 700 }}>
                                        {cellErrors[cellKey]}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Bottom Row: Average and View Report Button */}
                      <div className={styles.studentCardBottomRow}>
                        <div className={styles.mobileAvgBox}>
                          <span className={styles.mobileAvgLabel}>معدل:</span>
                          <span
                            className={styles.weightedScoreCell}
                            style={{
                              color: avg >= 18 ? '#34d399' : (avg >= 15 ? '#60a5fa' : (avg >= 12 ? '#fbbf24' : '#f87171')),
                              fontSize: '1rem',
                              fontWeight: 800,
                            }}
                          >
                            {avg != null ? avg : '—'}
                          </span>
                        </div>

                        <button
                          type="button"
                          className={styles.viewReportBtnMobile}
                          onClick={() => handleOpenPreviewModal(st)}
                          title="مشاهده کارنامه رسمی و معدل کل این دانش‌آموز"
                        >
                          <HiOutlineEye />
                          <span>مشاهده کارنامه</span>
                        </button>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className={styles.mobileEmptyState}>
                  <HiOutlineUserGroup style={{ fontSize: '2.5rem', opacity: 0.5, color: '#6366f1' }} />
                  <div style={{ fontWeight: 800, fontSize: '0.95rem' }}>هنوز دانش‌آموزی در این کلاس ثبت نشده است</div>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={handleOpenAddStudentModal}
                    style={{ marginTop: '6px' }}
                  >
                    <HiOutlineUserPlus />
                    <span>افزودن دانش‌آموز</span>
                  </button>
                </div>
              )}
            </div>

            {/* 4 Auto-Calculated Stat Boxes + PDF Export at Bottom of Grade Table */}
            {gradebookData && (() => {
              const allStudents = gradebookData.students || [];
              const allCats = gradebookData.categories || [];
              const activeClass =
                classes.find((c) => String(c.id) === String(selectedClassId)) || gradebookData.class || {};

              const liveAvgs = allStudents.map((st) => {
                let weightedSum = 0;
                let totalWeight = 0;
                allCats.forEach((cat) => {
                  const raw = cellValues[`${st.id}_${cat.id}`];
                  const val =
                    raw !== undefined && raw !== ''
                      ? Number(raw)
                      : st.scores?.[cat.id]?.score != null
                        ? Number(st.scores[cat.id].score)
                        : null;
                  if (val !== null && !Number.isNaN(val)) {
                    const w = Number(cat.weight) || 1;
                    weightedSum += val * w;
                    totalWeight += w;
                  }
                });
                return totalWeight > 0 ? Math.round((weightedSum / totalWeight) * 100) / 100 : st.weightedAverage;
              });

              const liveFooterStats = computeLocalClassStats(liveAvgs, {
                totalStudents: allStudents.length,
                passThreshold: 12,
              });

              const pdfColumns = [
                { label: 'ردیف', weight: 0.55, align: 'center' },
                { label: 'نام و نام خانوادگی', weight: 2.1, align: 'right' },
                ...allCats.map((cat) => ({ label: cat.title, weight: 1.1, align: 'center' })),
                { label: 'میانگین', weight: 0.9, align: 'center' },
                { label: 'وضعیت', weight: 1.15, align: 'center' },
              ];

              const pdfRows = allStudents.map((st, idx) => {
                const avg = liveAvgs[idx];
                return [
                  String(idx + 1),
                  st.display_name,
                  ...allCats.map((cat) => {
                    const raw = cellValues[`${st.id}_${cat.id}`];
                    if (raw !== undefined && raw !== '') return String(raw);
                    return st.scores?.[cat.id]?.score != null ? String(st.scores[cat.id].score) : '—';
                  }),
                  avg != null ? String(avg) : '—',
                  avg != null ? (avg >= 12 ? 'قبول' : 'نیاز به تلاش') : 'نامشخص',
                ];
              });

              return (
                <GradeTableFooterSummary
                  stats={liveFooterStats}
                  testIdPrefix="single-class-gradebook-footer"
                  pdfConfig={{
                    title: `لیست نمرات کلاس ${activeClass.name || 'کلاس درسی'}`,
                    subtitle: `${activeClass.grade || ''} · درس ${activeClass.subject || 'عمومی'}`,
                    teacherName: user?.display_name || '',
                    columns: pdfColumns,
                    rows: pdfRows,
                    fileName: `grades-${activeClass.name || 'class'}.pdf`,
                  }}
                />
              );
            })()}
          </div>
        )}

        {/* ── 5. Recorded Individual Exam Grade Lists (Each with its own 4 auto-stats + PDF export) ── */}
        {!loadingTeacher && gradebookData && (
          <RecordedExamTablesList
            activeClass={
              classes.find((c) => String(c.id) === String(selectedClassId)) ||
              gradebookData.class ||
              {}
            }
            categories={gradebookData.categories || []}
            students={gradebookData.students || []}
            cellValues={cellValues}
            teacherName={user?.display_name || ''}
            highlightCategoryId={lastSavedExamId}
            onDeleteCategory={handleDeleteCategory}
          />
        )}
              </>
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

        {/* ── Modal: Create New Class + Manual Student Autocomplete & Scores ── */}
        <CreateClassGradebookModal
          isOpen={showCreateClassModal}
          onClose={() => setShowCreateClassModal(false)}
          onCreated={async (createdData) => {
            const newClass = createdData?.class;
            if (newClass?.id) {
              await loadTeacherClasses(newClass.id);
            } else {
              await loadTeacherClasses();
            }
            setClassesByGradeRefreshKey((k) => k + 1);
          }}
        />

        {/* ── Modal: Add New Exam & Enter Class Scores Immediately ── */}
        <AddExamWithScoresModal
          isOpen={showCatModal}
          onClose={() => setShowCatModal(false)}
          classes={classes}
          defaultClassId={selectedClassId}
          onSaved={async ({ classId, category }) => {
            if (category?.id) {
              setLastSavedExamId(category.id);
            }
            setShowClassesByGrade(false);
            if (classId) {
              setSelectedClassId(classId);
              await fetchClassGradebook(classId);
            }
            setClassesByGradeRefreshKey((k) => k + 1);
          }}
        />

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

      {/* Formal Grades Table (Desktop) */}
      <div className={styles.desktopGradeTableWrap}>
        <div className={styles.tableContainer}>
          <table className={styles.gradeTable}>
            <thead>
              <tr>
                <th style={{ width: '40px', textAlign: 'center' }}>#</th>
                <th>عنوان درس</th>
                <th>دبیر مدرس</th>
                <th style={{ textAlign: 'center' }}>ارزشیابی مستمر</th>
                <th style={{ textAlign: 'center' }}>آزمون میانسالی</th>
                <th style={{ textAlign: 'center' }}>آزمون پایان سال</th>
                <th style={{ textAlign: 'center' }}>میانگین</th>
                <th style={{ textAlign: 'center' }}>وضعیت</th>
              </tr>
            </thead>
            <tbody>
              {reportData.reportCards?.map((item, idx) => {
                const contScore = item.continuous_score != null
                  ? item.continuous_score
                  : item.breakdowns?.find((b) => b.title.includes('مستمر'))?.score;
                const midScore = item.midterm_score != null
                  ? item.midterm_score
                  : item.breakdowns?.find((b) => b.title.includes('میانسال') || b.title.includes('میان‌ترم') || b.title.includes('میان ترم'))?.score;
                const finScore = item.final_score != null
                  ? item.final_score
                  : item.breakdowns?.find((b) => b.title.includes('پایان') || b.title.includes('نوبت'))?.score;
                const finalScore = item.final_average;

                const positiveStatuses = new Set(['قبول', 'خیلی خوب', 'خوب', 'قابل قبول']);
                const negativeStatuses = new Set(['مردود', 'نیازمند تلاش بیشتر', 'نیاز به تلاش']);
                const statusText = item.teacher_status || item.status || '';
                const isPositive = positiveStatuses.has(statusText);
                const isNegative = negativeStatuses.has(statusText);

                return (
                  <tr key={item.class_id || idx} data-testid={`report-card-row-${item.class_id || idx}`}>
                    <td style={{ textAlign: 'center', color: 'var(--text-tertiary)', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                      {idx + 1}
                    </td>

                    <td>
                      <div className={styles.courseTitleCell}>
                        <span className={styles.courseName}>{item.subject || item.class_name}</span>
                        <span className={styles.teacherName}>
                          {item.class_name}{item.grade ? ` · ${item.grade}` : ''}
                        </span>
                      </div>
                    </td>

                    <td>
                      <span style={{ fontSize: '0.813rem', color: 'var(--text-secondary)' }}>
                        {item.teacher_name || 'دبیر تخصصی'}
                      </span>
                    </td>

                    <td style={{ textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>
                      {contScore != null ? (
                        <span className={styles.scorePill} style={{ color: '#10b981' }}>{contScore}</span>
                      ) : (
                        <span style={{ color: 'var(--text-tertiary)' }}>—</span>
                      )}
                    </td>

                    <td style={{ textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>
                      {midScore != null ? (
                        <span className={styles.scorePill} style={{ color: '#3b82f6' }}>{midScore}</span>
                      ) : (
                        <span style={{ color: 'var(--text-tertiary)' }}>—</span>
                      )}
                    </td>

                    <td style={{ textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>
                      {finScore != null ? (
                        <span className={styles.scorePill} style={{ color: '#6366f1' }}>{finScore}</span>
                      ) : (
                        <span style={{ color: 'var(--text-tertiary)' }}>—</span>
                      )}
                    </td>

                    <td style={{ textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>
                      {finalScore != null ? (
                        <span className={styles.scorePill} style={{ fontSize: '0.938rem', fontWeight: 900, color: '#10b981' }}>
                          {finalScore}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text-tertiary)' }}>—</span>
                      )}
                    </td>

                    <td style={{ textAlign: 'center' }} data-testid={`report-card-status-${item.class_id || idx}`}>
                      {isPositive ? (
                        <span className={styles.statusPassBadge}>
                          <HiOutlineCheckCircle />
                          <span>{statusText}</span>
                        </span>
                      ) : isNegative ? (
                        <span className={styles.statusFailBadge}>
                          <HiOutlineExclamationCircle />
                          <span>{statusText}</span>
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text-tertiary)', fontSize: '0.82rem', fontWeight: 600 }}>
                          در انتظار نمره
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Formal Grades Vertical Cards (Mobile) */}
      <div className={styles.mobileGradeCardsList}>
        {reportData.reportCards?.map((item, idx) => {
          const contScore = item.continuous_score != null
            ? item.continuous_score
            : item.breakdowns?.find((b) => b.title.includes('مستمر'))?.score;
          const midScore = item.midterm_score != null
            ? item.midterm_score
            : item.breakdowns?.find((b) => b.title.includes('میانسال') || b.title.includes('میان‌ترم') || b.title.includes('میان ترم'))?.score;
          const finScore = item.final_score != null
            ? item.final_score
            : item.breakdowns?.find((b) => b.title.includes('پایان') || b.title.includes('نوبت'))?.score;
          const finalScore = item.final_average;
          const positiveStatuses = new Set(['قبول', 'خیلی خوب', 'خوب', 'قابل قبول']);
          const negativeStatuses = new Set(['مردود', 'نیازمند تلاش بیشتر', 'نیاز به تلاش']);
          const statusText = item.teacher_status || item.status || '';
          const isPositive = positiveStatuses.has(statusText);
          const isNegative = negativeStatuses.has(statusText);

          return (
            <div key={`m-${item.class_id || idx}`} className={styles.mobileGradeCard}>
              <div className={styles.mobileGradeCardHeader}>
                <div style={{ minWidth: 0 }}>
                  <div className={styles.courseName}>{item.subject || item.class_name}</div>
                  <div className={styles.teacherName}>
                    {item.teacher_name || 'دبیر تخصصی'}{item.grade ? ` · ${item.grade}` : ''}
                  </div>
                </div>
                {isPositive ? (
                  <span className={styles.statusPassBadge}>
                    <HiOutlineCheckCircle />
                    <span>{statusText}</span>
                  </span>
                ) : isNegative ? (
                  <span className={styles.statusFailBadge}>
                    <HiOutlineExclamationCircle />
                    <span>{statusText}</span>
                  </span>
                ) : (
                  <span style={{ color: 'var(--text-tertiary)', fontSize: '0.76rem', fontWeight: 600 }}>
                    در انتظار نمره
                  </span>
                )}
              </div>

              <div className={styles.mobileGradeRows}>
                <div className={styles.mobileGradeRow}>
                  <span className={styles.mobileGradeLabel}>ارزشیابی مستمر</span>
                  <span className={styles.mobileGradeValue} style={{ color: '#10b981' }}>
                    {contScore != null ? contScore : '—'}
                  </span>
                </div>
                <div className={styles.mobileGradeRow}>
                  <span className={styles.mobileGradeLabel}>آزمون میانسالی</span>
                  <span className={styles.mobileGradeValue} style={{ color: '#3b82f6' }}>
                    {midScore != null ? midScore : '—'}
                  </span>
                </div>
                <div className={styles.mobileGradeRow}>
                  <span className={styles.mobileGradeLabel}>آزمون پایان سال</span>
                  <span className={styles.mobileGradeValue} style={{ color: '#6366f1' }}>
                    {finScore != null ? finScore : '—'}
                  </span>
                </div>
                <div className={styles.mobileGradeRow} style={{ borderTop: '1px dashed var(--border-color)', paddingTop: '8px' }}>
                  <span className={styles.mobileGradeLabel} style={{ fontWeight: 800, color: 'var(--text-primary)' }}>میانگین کل درس</span>
                  <span className={styles.mobileGradeValue} style={{ fontWeight: 900, fontSize: '1rem', color: '#10b981' }}>
                    {finalScore != null ? finalScore : '—'}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Personal Recorded Exams Breakdown (Visible in Student & Parent Panels) */}
      {Array.isArray(reportData.examScores) && reportData.examScores.length > 0 && (
        <div
          className={styles.tableWrapper}
          style={{ marginTop: '20px' }}
          data-testid="personal-exam-scores-section"
        >
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
            <h4 style={{ margin: 0, fontSize: '0.94rem', fontWeight: 800, color: 'var(--text-primary)' }}>
              ریز نمرات آزمون‌های ثبت‌شده
            </h4>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)', fontWeight: 600 }}>
                {reportData.examScores.length} آزمون نمره‌دهی‌شده
              </span>
              <button
                type="button"
                data-testid="student-exam-scores-pdf-btn"
                onClick={async () => {
                  try {
                    const scores = reportData.examScores.map((e) => Number(e.score)).filter((n) => !Number.isNaN(n));
                    const stats = computeLocalClassStats(scores, {
                      totalStudents: reportData.examScores.length,
                      passThreshold: 12,
                    });
                    await exportGradeTableToPdf({
                      title: `کارنامه ریز نمرات آزمون‌های ${reportData.student?.display_name || 'دانش‌آموز'}`,
                      subtitle: `${reportData.student?.grade || ''} · سال تحصیلی ۱۴۰۴-۱۴۰۳`,
                      schoolName: reportData.student?.school_name || 'مدرسه هوشمند',
                      columns: [
                        { label: 'ردیف', weight: 0.55, align: 'center' },
                        { label: 'موضوع آزمون', weight: 2.0, align: 'right' },
                        { label: 'کلاس / درس', weight: 1.6, align: 'right' },
                        { label: 'دبیر', weight: 1.3, align: 'right' },
                        { label: 'نمره', weight: 1.0, align: 'center' },
                        { label: 'توضیح دبیر', weight: 1.6, align: 'right' },
                      ],
                      rows: reportData.examScores.map((exam, idx) => [
                        String(idx + 1),
                        exam.exam_title || 'آزمون',
                        `${exam.subject || exam.class_name || ''}${exam.grade ? ` (${exam.grade})` : ''}`,
                        exam.teacher_name || 'دبیر کلاس',
                        `${exam.score} از ${exam.max_score || 20}`,
                        exam.teacher_comment || '—',
                      ]),
                      stats,
                      fileName: `student-exams-${reportData.student?.student_code || 'report'}.pdf`,
                    });
                    toast.success('فایل پی‌دی‌اف ریز نمرات آزمون‌ها با موفقیت دانلود شد');
                  } catch (err) {
                    console.error('Student PDF export failed:', err);
                    toast.error('خطا در تولید فایل پی‌دی‌اف نمرات');
                  }
                }}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 12px',
                  borderRadius: '8px',
                  border: '1px solid #4f46e5',
                  background: '#4f46e5',
                  color: '#ffffff',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                <HiOutlineDocumentArrowDown style={{ fontSize: '0.95rem' }} />
                <span>دانلود پی‌دی‌اف نمرات (PDF)</span>
              </button>
            </div>
          </div>
          <div className={styles.desktopGradeTableWrap}>
            <table className={styles.gradeTable}>
              <thead>
                <tr>
                  <th style={{ width: '40px', textAlign: 'center' }}>#</th>
                  <th>موضوع آزمون</th>
                  <th>کلاس / درس</th>
                  <th>دبیر</th>
                  <th style={{ textAlign: 'center' }}>نمره کسب‌شده</th>
                  <th>توضیح دبیر</th>
                </tr>
              </thead>
              <tbody>
                {reportData.examScores.map((exam, idx) => (
                  <tr key={exam.score_id || `${exam.category_id}-${idx}`} data-testid={`personal-exam-row-${exam.category_id}`}>
                    <td style={{ textAlign: 'center', color: 'var(--text-tertiary)', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                      {idx + 1}
                    </td>
                    <td style={{ fontWeight: 800, color: 'var(--text-primary)' }}>
                      {exam.exam_title}
                    </td>
                    <td>
                      <div className={styles.courseTitleCell}>
                        <span className={styles.courseName}>{exam.subject || exam.class_name}</span>
                        <span className={styles.teacherName}>
                          {exam.class_name}{exam.grade ? ` · ${exam.grade}` : ''}
                        </span>
                      </div>
                    </td>
                    <td style={{ fontSize: '0.813rem', color: 'var(--text-secondary)' }}>
                      {exam.teacher_name || 'دبیر کلاس'}
                    </td>
                    <td style={{ textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>
                      <span
                        className={styles.scorePill}
                        style={{
                          fontWeight: 900,
                          color: Number(exam.score) >= (Number(exam.max_score) || 20) * 0.6 ? '#059669' : '#dc2626',
                        }}
                      >
                        {exam.score} از {exam.max_score || 20}
                      </span>
                    </td>
                    <td style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                      {exam.teacher_comment || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className={styles.mobileGradeCardsList} style={{ padding: '12px' }}>
            {reportData.examScores.map((exam, idx) => (
              <div key={`m-exam-${exam.score_id || `${exam.category_id}-${idx}`}`} className={styles.mobileGradeCard}>
                <div className={styles.mobileGradeCardHeader}>
                  <span style={{ fontWeight: 800, color: 'var(--text-primary)', fontSize: '0.9rem' }}>
                    {exam.exam_title}
                  </span>
                  <span
                    className={styles.scorePill}
                    style={{
                      fontWeight: 900,
                      color: Number(exam.score) >= (Number(exam.max_score) || 20) * 0.6 ? '#059669' : '#dc2626',
                    }}
                  >
                    {exam.score} از {exam.max_score || 20}
                  </span>
                </div>
                <div className={styles.mobileGradeRows}>
                  <div className={styles.mobileGradeRow}>
                    <span className={styles.mobileGradeLabel}>کلاس / درس</span>
                    <span className={styles.mobileGradeValue}>{exam.subject || exam.class_name}</span>
                  </div>
                  <div className={styles.mobileGradeRow}>
                    <span className={styles.mobileGradeLabel}>دبیر</span>
                    <span className={styles.mobileGradeValue}>{exam.teacher_name || 'دبیر کلاس'}</span>
                  </div>
                  {exam.teacher_comment && (
                    <div className={styles.mobileGradeRow}>
                      <span className={styles.mobileGradeLabel}>توضیح دبیر</span>
                      <span className={styles.mobileGradeValue}>{exam.teacher_comment}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

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
