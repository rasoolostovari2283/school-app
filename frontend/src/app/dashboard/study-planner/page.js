'use client';
import { useState, useEffect, useMemo, useRef } from 'react';
import useAuthStore from '../../../stores/authStore';
import api, { getApiBaseUrl } from '../../../lib/api';
import toast from 'react-hot-toast';
import {
  HiOutlineCalendarDays,
  HiOutlineAcademicCap,
  HiOutlineClock,
  HiOutlineBookOpen,
  HiOutlineSparkles,
  HiOutlinePlus,
  HiOutlineTrash,
  HiOutlineCheckCircle,
  HiOutlineFunnel,
  HiOutlinePrinter,
  HiOutlineMapPin,
  HiOutlineChatBubbleBottomCenterText,
  HiOutlineArrowPath,
  HiOutlineFire,
  HiOutlineChartBar,
  HiOutlineDocumentText,
  HiOutlineCheck,
  HiOutlinePencilSquare,
  HiOutlineClipboardDocumentCheck,
  HiOutlineTableCells,
  HiOutlineSquares2X2,
  HiOutlineArrowDownTray,
  HiOutlineCloudArrowUp,
  HiOutlineFolder,
  HiOutlineMagnifyingGlass,
  HiOutlineXMark,
  HiOutlineBookmark,
  HiOutlineClipboardDocument,
  HiOutlineTag,
} from 'react-icons/hi2';
import styles from './study-planner.module.css';

const DAYS = [
  { id: 0, name: 'شنبه' },
  { id: 1, name: 'یکشنبه' },
  { id: 2, name: 'دوشنبه' },
  { id: 3, name: 'سه‌شنبه' },
  { id: 4, name: 'چهارشنبه' },
  { id: 5, name: 'پنج‌شنبه' },
];

const PERIODS = [
  { id: 1, start: '۰۷:۴۵', end: '۰۹:۱۵', label: 'زنگ اول (۰۷:۴۵ - ۰۹:۱۵)' },
  { id: 2, start: '۰۹:۳۰', end: '۱۱:۰۰', label: 'زنگ دوم (۰۹:۳۰ - ۱۱:۰۰)' },
  { id: 3, start: '۱۱:۱۵', end: '۱۲:۴۵', label: 'زنگ سوم (۱۱:۱۵ - ۱۲:۴۵)' },
  { id: 4, start: '۱۳:۳۰', end: '۱۵:۰۰', label: 'زنگ چهارم (۱۳:۳۰ - ۱۵:۰۰)' },
  { id: 5, start: '۱۵:۱۵', end: '۱۶:۴۵', label: 'زنگ پنجم - المپیاد/کارگاه (۱۵:۱۵ - ۱۶:۴۵)' },
];

const PRESET_GRADES = [
  { label: 'پایه دهم ریاضی', gradeCode: 'دهم' },
  { label: 'پایه دهم تجربی', gradeCode: 'دهم' },
  { label: 'پایه یازدهم ریاضی', gradeCode: 'یازدهم' },
  { label: 'پایه یازدهم تجربی', gradeCode: 'یازدهم' },
  { label: 'پایه دوازدهم ریاضی', gradeCode: 'دوازدهم' },
  { label: 'پایه دوازدهم تجربی', gradeCode: 'دوازدهم' },
  { label: 'پایه نهم (متوسطه اول)', gradeCode: 'متوسطه اول' },
];

export default function StudyPlannerPage() {
  const { user } = useAuthStore();
  const isTeacher = user?.role === 'teacher' || user?.role === 'admin' || user?.role === 'manager';

  // Teacher navigation tabs: 'schedule' (برنامه کلاسی و هفتگی), 'roadmap' (طرح درس و بودجه‌بندی), 'students' (پایش مطالعه بچه‌ها)
  const [activeTab, setActiveTab] = useState('schedule');

  // Teacher Schedule & Plans
  const [teacherPlans, setTeacherPlans] = useState(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('teacher_plans_cache');
        if (saved) return JSON.parse(saved);
      } catch (e) {}
    }
    return [];
  });
  const [loadingPlans, setLoadingPlans] = useState(false);
  const [gradeFilter, setGradeFilter] = useState('all');
  const [scheduleViewMode, setScheduleViewMode] = useState('matrix'); // 'matrix' (جدول برنامه هفتگی تدریس) | 'board' (تقویم ستونی) | 'bands' (ردیف‌های روزانه)
  const [calendarDayFilter, setCalendarDayFilter] = useState('all'); // 'all' | 0..5 (روز مشخص شنبه تا پنج‌شنبه)
  const [showAddPlanModal, setShowAddPlanModal] = useState(false);

  // Teacher custom user-defined grades
  const defaultGrades = ['پایه دهم ریاضی', 'پایه دهم تجربی', 'پایه یازدهم ریاضی', 'پایه یازدهم تجربی', 'پایه دوازدهم ریاضی', 'پایه دوازدهم تجربی', 'پایه نهم'];
  const [customGrades, setCustomGrades] = useState(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('teacher_defined_grades');
        if (saved) return JSON.parse(saved);
      } catch (e) {}
    }
    return defaultGrades;
  });
  const [newGradeInput, setNewGradeInput] = useState('');
  const [showAddGradeInput, setShowAddGradeInput] = useState(false);

  // Merge customGrades with any unique grades from teacherPlans
  const allAvailableGrades = useMemo(() => {
    const list = [...customGrades];
    teacherPlans.forEach((p) => {
      const g = (p.grade || '').trim();
      if (g && !list.includes(g)) {
        list.push(g);
      }
    });
    return list;
  }, [customGrades, teacherPlans]);

  const handleAddCustomGrade = (e) => {
    e?.preventDefault();
    const val = newGradeInput.trim();
    if (!val) return;
    if (!customGrades.includes(val)) {
      const updated = [...customGrades, val];
      setCustomGrades(updated);
      try {
        localStorage.setItem('teacher_defined_grades', JSON.stringify(updated));
      } catch (err) {}
      toast.success(`پایه «${val}» با موفقیت افزوده شد 🎉`);
    }
    setGradeFilter(val);
    setPlanForm((prev) => ({ ...prev, grade: val }));
    setNewGradeInput('');
    setShowAddGradeInput(false);
  };

  const handleRemoveCustomGrade = (gradeToRemove, e) => {
    e?.stopPropagation();
    const updated = customGrades.filter((g) => g !== gradeToRemove);
    setCustomGrades(updated);
    try {
      localStorage.setItem('teacher_defined_grades', JSON.stringify(updated));
    } catch (err) {}
    if (gradeFilter === gradeToRemove) {
      setGradeFilter('all');
    }
    toast.success(`پایه «${gradeToRemove}» از لیست پایه‌ها حذف شد`);
  };

  const handleQuickAddForDay = (dayId) => {
    setPlanForm((prev) => ({ ...prev, day_of_week: dayId }));
    setShowAddPlanModal(true);
  };

  // ── SELECTED DAY FOR TOP BRIEFING BOARD (پیش‌فرض: روز جاری) ──
  // Iranian week map: Saturday=0, Sunday=1, ..., Thursday=5
  const getInitialDay = () => {
    const jsDay = new Date().getDay();
    const map = { 6: 0, 0: 1, 1: 2, 2: 3, 3: 4, 4: 5, 5: 0 };
    return map[jsDay] ?? 0;
  };
  const [briefingDay, setBriefingDay] = useState(getInitialDay);

  // ── MODAL: QUICK EDIT SESSION SUBJECT, TOPIC & HOMEWORK ──
  const [editingSession, setEditingSession] = useState(null);
  const [editSubject, setEditSubject] = useState('');
  const [editGrade, setEditGrade] = useState('');
  const [editClassName, setEditClassName] = useState('');
  const [editTopic, setEditTopic] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editStatus, setEditStatus] = useState('upcoming');
  const [editSessionType, setEditSessionType] = useState('teaching');
  const [savingEdit, setSavingEdit] = useState(false);

  // ── COMPACT BOTTOM FORM STATE (باکس جمع‌وجور افزودن برنامه کلاسی در پایین صفحه) ──
  const [planForm, setPlanForm] = useState({
    day_of_week: 0,
    grade: 'پایه دهم ریاضی',
    class_name: 'کلاس ۱۰۱',
    subject: 'حسابان و ریاضیات ۱',
    period_number: 1,
    start_time: '۰۷:۴۵',
    end_time: '۰۹:۱۵',
    topic: 'فصل ۲: توان‌های گویا و عبارت‌های جبری',
    session_type: 'teaching',
    room: 'کلاس ۱۰۱',
    notes: 'حل تمرین‌های صفحه ۳۴ تا ۳۸ کتاب درسی',
  });
  const [submittingPlan, setSubmittingPlan] = useState(false);

  // Student Logs & Stats (Konkur/Study tracker)
  const [logs, setLogs] = useState([]);
  const [stats, setStats] = useState(null);
  const [loadingLogs, setLoadingLogs] = useState(true);

  // Modal: Register Daily Log (for students)
  const [showLogModal, setShowLogModal] = useState(false);
  const [logForm, setLogForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    subject: 'حسابان و دیفرانسیل',
    study_minutes_descriptive: 60,
    study_minutes_test: 90,
    tests_count: 40,
    tests_correct: 34,
    tests_wrong: 4,
    satisfaction_score: 5,
    student_notes: '',
  });
  const [submittingLog, setSubmittingLog] = useState(false);

  // Modal: Advisor Feedback (Teacher on student log)
  const [selectedLogForFeedback, setSelectedLogForFeedback] = useState(null);
  const [feedbackText, setFeedbackText] = useState('');
  const [submittingFeedback, setSubmittingFeedback] = useState(false);

  // ── STUDENT NOTEPAD STATE (دفترچه یادداشت و برنامه‌ریزی شخصی دانش‌آموز) ──
  const [studentNotes, setStudentNotes] = useState(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('student_study_notes_cache');
        if (saved) return JSON.parse(saved);
      } catch (e) {}
    }
    return [];
  });
  const [loadingNotes, setLoadingNotes] = useState(false);
  const [noteForm, setNoteForm] = useState({
    title: '',
    content: '',
    color: 'yellow',
    is_pinned: false,
    category: 'general',
  });
  const [submittingNote, setSubmittingNote] = useState(false);
  const [noteFilter, setNoteFilter] = useState('all'); // 'all' | 'completed' | 'pending' | 'pinned' | 'general' | 'homework' | 'daily_task' | 'exam_notes' | 'weekly_goal'
  const [noteSearch, setNoteSearch] = useState('');
  const [celebratingNoteId, setCelebratingNoteId] = useState(null);
  const [celebrationMessage, setCelebrationMessage] = useState('');
  const [editingNote, setEditingNote] = useState(null);
  const [editNoteForm, setEditNoteForm] = useState({
    title: '',
    content: '',
    color: 'yellow',
    is_pinned: false,
    is_completed: false,
    category: 'general',
  });
  const [savingEditNote, setSavingEditNote] = useState(false);

  // ── TEACHER DOCUMENTS & LESSON PLANS REPOSITORY STATE ──
  const [teacherDocuments, setTeacherDocuments] = useState([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [docCategoryFilter, setDocCategoryFilter] = useState('all'); // 'all' | 'lesson_plan' | 'content_calendar' | 'syllabus' | 'guide'
  const [docSearchQuery, setDocSearchQuery] = useState('');
  const [showUploadForm, setShowUploadForm] = useState(false);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const fileInputRef = useRef(null);
  const [docForm, setDocForm] = useState({
    title: '',
    category: 'lesson_plan',
    grade: 'پایه دهم ریاضی',
    subject: '',
    academic_term: 'سال تحصیلی ۱۴۰۵-۱۴۰۴',
    description: '',
  });

  const getFullFileUrl = (url) => {
    if (!url) return '#';
    if (
      url.startsWith('http://') ||
      url.startsWith('https://') ||
      url.startsWith('blob:') ||
      url.startsWith('data:')
    ) {
      return url;
    }
    const backendBase = getApiBaseUrl().replace(/\/api\/v1\/?$/, '');
    return `${backendBase}${url.startsWith('/') ? '' : '/'}${url}`;
  };

  const formatFileSize = (bytes) => {
    if (!bytes || bytes === 0) return '—';
    if (bytes < 1024) return bytes + ' بایت';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' کیلوبایت';
    return (bytes / (1024 * 1024)).toFixed(1) + ' مگابایت';
  };

  const getDocTypeBadge = (fileType) => {
    switch (fileType) {
      case 'word':
        return { label: 'Word', color: '#2563eb', bg: 'rgba(37, 99, 235, 0.12)', icon: '📘' };
      case 'excel':
        return { label: 'Excel', color: '#059669', bg: 'rgba(5, 150, 105, 0.12)', icon: '📊' };
      case 'powerpoint':
        return { label: 'PowerPoint', color: '#ea580c', bg: 'rgba(234, 88, 12, 0.12)', icon: '📽️' };
      case 'archive':
        return { label: 'ZIP', color: '#d97706', bg: 'rgba(217, 119, 6, 0.12)', icon: '🗜️' };
      case 'image':
        return { label: 'تصویر', color: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.12)', icon: '🖼️' };
      case 'pdf':
      default:
        return { label: 'PDF', color: '#dc2626', bg: 'rgba(220, 38, 38, 0.12)', icon: '📄' };
    }
  };

  const getDocCategoryLabel = (category) => {
    switch (category) {
      case 'lesson_plan':
        return { text: 'طرح درس سالانه / جامع', color: '#4f46e5', bg: 'rgba(79, 70, 229, 0.12)' };
      case 'content_calendar':
        return { text: 'تقویم محتوایی و بودجه‌بندی', color: '#0891b2', bg: 'rgba(8, 145, 178, 0.12)' };
      case 'syllabus':
        return { text: 'طرح درس روزانه / سناریو', color: '#16a34a', bg: 'rgba(22, 163, 74, 0.12)' };
      case 'guide':
        return { text: 'جزوه و راهنمای تدریس', color: '#ca8a04', bg: 'rgba(202, 138, 4, 0.12)' };
      default:
        return { text: 'سند آموزشی', color: '#64748b', bg: 'rgba(100, 116, 139, 0.12)' };
    }
  };

  const fetchTeacherDocuments = async () => {
    setLoadingDocs(true);
    try {
      const res = await api.get('/study-planner/teacher-documents');
      if (res.data?.success) {
        const serverDocs = res.data.data.documents || [];
        let localDocs = [];
        try {
          localDocs = JSON.parse(localStorage.getItem('cached_teacher_documents') || '[]');
        } catch (e) {}
        const mergedMap = new Map();
        localDocs.forEach((d) => mergedMap.set(d.id, d));
        serverDocs.forEach((d) => mergedMap.set(d.id, d));
        const mergedList = Array.from(mergedMap.values()).sort(
          (a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)
        );
        setTeacherDocuments(mergedList);
      }
    } catch (err) {
      console.warn('Error fetching teacher documents from server, loading cached:', err?.message);
      try {
        const localDocs = JSON.parse(localStorage.getItem('cached_teacher_documents') || '[]');
        if (localDocs.length > 0) {
          setTeacherDocuments(localDocs);
        }
      } catch (e) {}
    } finally {
      setLoadingDocs(false);
    }
  };

  const handleProcessSelectedFile = (file) => {
    if (!file) return;
    if (file.size > 50 * 1024 * 1024) {
      toast.error('حجم فایل نباید بیش از ۵۰ مگابایت باشد');
      return;
    }
    setSelectedFile(file);
    if (!docForm.title || docForm.title.trim() === '') {
      const nameWithoutExt = file.name.replace(/\.[^/.]+$/, '');
      setDocForm((prev) => ({ ...prev, title: nameWithoutExt }));
    }
    toast.success(`فایل «${file.name}» آماده بارگذاری است`);
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      handleProcessSelectedFile(file);
    }
  };

  const handleUploadDocument = async (e) => {
    e.preventDefault();
    if (!selectedFile) {
      toast.error('لطفاً فایل مورد نظر را برای بارگذاری انتخاب کنید');
      return;
    }
    if (!docForm.title.trim()) {
      toast.error('لطفاً عنوان فایل را وارد کنید');
      return;
    }

    setUploadingDoc(true);
    const toastId = toast.loading('در حال بارگذاری و پردازش فایل طرح درس...');

    try {
      let uploadedUrl = '';
      let uploadedFilename = selectedFile.name;
      let originalName = selectedFile.name;
      let uploadedSize = selectedFile.size;

      // 1. Try uploading binary file to backend /upload
      try {
        const formData = new FormData();
        formData.append('file', selectedFile);
        formData.append('files', selectedFile);

        const uploadRes = await api.post('/upload', formData);
        const fileData = uploadRes.data?.data?.file || uploadRes.data?.data?.files?.[0];
        if (fileData?.url) {
          uploadedUrl = fileData.url;
          uploadedFilename = fileData.filename || selectedFile.name;
          originalName = fileData.originalname || selectedFile.name;
          uploadedSize = fileData.size || selectedFile.size;
        }
      } catch (uploadErr) {
        console.warn('Backend /upload error, fallback to client-side data url:', uploadErr?.message);
        if (selectedFile.size <= 8 * 1024 * 1024) {
          uploadedUrl = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(selectedFile);
          });
        } else {
          uploadedUrl = URL.createObjectURL(selectedFile);
        }
      }

      if (!uploadedUrl) {
        throw new Error('خطا در پردازش فایل انتخابی');
      }

      // Determine file extension
      let fileType = 'pdf';
      const ext = selectedFile.name.split('.').pop()?.toLowerCase();
      if (['doc', 'docx'].includes(ext)) fileType = 'word';
      else if (['xls', 'xlsx', 'csv'].includes(ext)) fileType = 'excel';
      else if (['ppt', 'pptx'].includes(ext)) fileType = 'powerpoint';
      else if (['zip', 'rar', '7z'].includes(ext)) fileType = 'archive';
      else if (['png', 'jpg', 'jpeg', 'webp', 'svg'].includes(ext)) fileType = 'image';

      // 2. Save document record
      const payload = {
        title: docForm.title.trim(),
        category: docForm.category,
        grade: docForm.grade || 'عمومی',
        subject: docForm.subject.trim(),
        file_url: uploadedUrl,
        file_name: uploadedFilename,
        original_name: originalName,
        file_size: uploadedSize,
        file_type: fileType,
        academic_term: docForm.academic_term,
        description: docForm.description.trim(),
      };

      try {
        const res = await api.post('/study-planner/teacher-documents', payload);
        if (res.data?.success) {
          const newDoc = res.data.data.document;
          setTeacherDocuments((prev) => [newDoc, ...prev.filter((d) => d.id !== newDoc.id)]);
          try {
            const existing = JSON.parse(localStorage.getItem('cached_teacher_documents') || '[]');
            localStorage.setItem('cached_teacher_documents', JSON.stringify([newDoc, ...existing.filter((d) => d.id !== newDoc.id)]));
          } catch (e) {}
        }
      } catch (dbErr) {
        console.warn('Server record save failed, persisting locally:', dbErr?.message);
        const fallbackDoc = {
          id: `doc-${Date.now()}`,
          ...payload,
          created_at: new Date().toISOString(),
        };
        setTeacherDocuments((prev) => [fallbackDoc, ...prev]);
        try {
          const existing = JSON.parse(localStorage.getItem('cached_teacher_documents') || '[]');
          localStorage.setItem('cached_teacher_documents', JSON.stringify([fallbackDoc, ...existing]));
        } catch (e) {}
      }

      toast.success('سند طرح درس / تقویم محتوایی با موفقیت بارگذاری شد 🎉', { id: toastId });
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      setDocForm({
        title: '',
        category: 'lesson_plan',
        grade: allAvailableGrades[0] || 'پایه دهم ریاضی',
        subject: '',
        academic_term: 'سال تحصیلی ۱۴۰۵-۱۴۰۴',
        description: '',
      });
      setShowUploadForm(false);
      fetchTeacherDocuments();
    } catch (err) {
      console.error(err);
      toast.error('خطا در بارگذاری فایل: ' + (err.response?.data?.message || err.message), { id: toastId });
    } finally {
      setUploadingDoc(false);
    }
  };

  const handleDeleteDocument = async (docId) => {
    if (!window.confirm('آیا از حذف این سند آموزشی اطمینان دارید؟')) {
      return;
    }
    try {
      setTeacherDocuments((prev) => prev.filter((d) => d.id !== docId));
      try {
        const existing = JSON.parse(localStorage.getItem('cached_teacher_documents') || '[]');
        localStorage.setItem('cached_teacher_documents', JSON.stringify(existing.filter((d) => d.id !== docId)));
      } catch (e) {}
      const res = await api.delete(`/study-planner/teacher-documents/${docId}`);
      if (res.data?.success) {
        toast.success('سند آموزشی با موفقیت حذف شد');
      }
    } catch (err) {
      console.warn('Server delete error, removed from client state:', err?.message);
      toast.success('سند از لیست حذف گردید');
    }
  };

  const filteredDocuments = useMemo(() => {
    return teacherDocuments.filter((doc) => {
      if (docCategoryFilter !== 'all' && doc.category !== docCategoryFilter) {
        return false;
      }
      if (docSearchQuery.trim()) {
        const q = docSearchQuery.trim().toLowerCase();
        const t = (doc.title || '').toLowerCase();
        const s = (doc.subject || '').toLowerCase();
        const g = (doc.grade || '').toLowerCase();
        const desc = (doc.description || '').toLowerCase();
        if (!t.includes(q) && !s.includes(q) && !g.includes(q) && !desc.includes(q)) {
          return false;
        }
      }
      return true;
    });
  }, [teacherDocuments, docCategoryFilter, docSearchQuery]);

  useEffect(() => {
    if (isTeacher) {
      fetchTeacherPlans();
      fetchTeacherDocuments();
    } else {
      fetchStudentNotes();
    }
    fetchStudentData();
  }, [isTeacher]);

  const fetchStudentNotes = async () => {
    setLoadingNotes(true);
    try {
      const res = await api.get('/study-planner/notes');
      if (res.data?.success) {
        const list = res.data.data.notes || [];
        setStudentNotes(list);
        try {
          localStorage.setItem('student_study_notes_cache', JSON.stringify(list));
        } catch (e) {}
      }
    } catch (err) {
      console.error('Error fetching student notes:', err);
    } finally {
      setLoadingNotes(false);
    }
  };

  const handleCreateNote = async (e) => {
    e.preventDefault();
    if (!noteForm.title.trim() && !noteForm.content.trim()) {
      toast.error('لطفاً عنوان یا متن یادداشت را وارد کنید');
      return;
    }
    setSubmittingNote(true);
    try {
      const res = await api.post('/study-planner/notes', noteForm);
      if (res.data?.success) {
        toast.success('یادداشت جدید با موفقیت ثبت شد 📝');
        const newNote = res.data.data.note;
        setStudentNotes((prev) => {
          const updated = [newNote, ...prev.filter((n) => n.id !== newNote.id)];
          try {
            localStorage.setItem('student_study_notes_cache', JSON.stringify(updated));
          } catch (e) {}
          return updated;
        });
        setNoteForm((prev) => ({
          title: '',
          content: '',
          color: prev.color,
          is_pinned: false,
          category: prev.category,
        }));
      }
    } catch (err) {
      console.error(err);
      toast.error('خطا در ثبت یادداشت');
    } finally {
      setSubmittingNote(false);
    }
  };

  const handleUpdateNote = async (e) => {
    e.preventDefault();
    if (!editingNote) return;
    setSavingEditNote(true);
    try {
      const res = await api.put(`/study-planner/notes/${editingNote.id}`, editNoteForm);
      if (res.data?.success) {
        toast.success('یادداشت با موفقیت ویرایش شد ✍️');
        const updatedNote = res.data.data.note;
        setStudentNotes((prev) => {
          const updated = prev.map((n) => (n.id === editingNote.id ? updatedNote : n));
          try {
            localStorage.setItem('student_study_notes_cache', JSON.stringify(updated));
          } catch (e) {}
          return updated;
        });
        setEditingNote(null);
      }
    } catch (err) {
      console.error(err);
      toast.error('خطا در ویرایش یادداشت');
    } finally {
      setSavingEditNote(false);
    }
  };

  const handleDeleteNote = async (noteId, e) => {
    e?.stopPropagation();
    if (!window.confirm('آیا از حذف این یادداشت اطمینان دارید؟')) return;
    try {
      const res = await api.delete(`/study-planner/notes/${noteId}`);
      if (res.data?.success) {
        toast.success('یادداشت حذف شد');
        setStudentNotes((prev) => {
          const updated = prev.filter((n) => n.id !== noteId);
          try {
            localStorage.setItem('student_study_notes_cache', JSON.stringify(updated));
          } catch (e) {}
          return updated;
        });
      }
    } catch (err) {
      console.error(err);
      toast.error('خطا در حذف یادداشت');
    }
  };

  const handleTogglePin = async (note, e) => {
    e?.stopPropagation();
    const newPinnedStatus = !note.is_pinned;
    try {
      const res = await api.put(`/study-planner/notes/${note.id}`, {
        ...note,
        is_pinned: newPinnedStatus,
      });
      if (res.data?.success) {
        toast.success(newPinnedStatus ? 'یادداشت سنجاق شد 📌' : 'سنجاق یادداشت برداشته شد');
        setStudentNotes((prev) => {
          const updated = prev.map((n) =>
            n.id === note.id ? { ...n, is_pinned: newPinnedStatus } : n
          );
          try {
            localStorage.setItem('student_study_notes_cache', JSON.stringify(updated));
          } catch (e) {}
          return updated;
        });
      }
    } catch (err) {
      console.error(err);
      toast.error('خطا در تغییر وضعیت سنجاق');
    }
  };

  const CELEBRATION_MESSAGES = [
    'آفرین قهرمان! یک قدم بزرگ به هدفت نزدیک‌تر شدی! 🌟',
    'عالی بود! این کار با موفقیت تیک خورد 🚀',
    'فوق‌العاده‌ای! استمرار و پشتکار رمز اصلی موفقیته 💪',
    'یک موفقیت دیگه ثبت شد! به تلاشت ادامه بده 🎯',
    'احسنت! تیک زدن کارها بهترین حس دنیاست ✨',
    'تلاش امروزت، درخشش فرداته! باریکلا 🏆',
    'با قدرت ادامه بده، تو بی‌نظیری! 🔥',
  ];

  const playSuccessSound = () => {
    try {
      if (typeof window === 'undefined') return;
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();

      const playTone = (freq, startTime, duration) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, startTime);
        gain.gain.setValueAtTime(0.18, startTime);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(startTime);
        osc.stop(startTime + duration);
      };

      const now = ctx.currentTime;
      playTone(523.25, now, 0.16);         // C5
      playTone(659.25, now + 0.09, 0.18);  // E5
      playTone(783.99, now + 0.18, 0.28);  // G5
      playTone(1046.50, now + 0.27, 0.42); // C6 - celebratory chime
    } catch (e) {
      // AudioContext restricted by browser policy; silently ignore
    }
  };

  const handleToggleCompleteNote = async (note, e) => {
    e?.stopPropagation();
    const newCompletedStatus = !note.is_completed;

    // Optimistic UI update
    setStudentNotes((prev) => {
      const updated = prev.map((n) =>
        n.id === note.id ? { ...n, is_completed: newCompletedStatus } : n
      );
      try {
        localStorage.setItem('student_study_notes_cache', JSON.stringify(updated));
      } catch (err) {}
      return updated;
    });

    if (newCompletedStatus) {
      setCelebratingNoteId(note.id);
      const randomMsg = CELEBRATION_MESSAGES[Math.floor(Math.random() * CELEBRATION_MESSAGES.length)];
      setCelebrationMessage(randomMsg);
      playSuccessSound();

      toast.success(randomMsg, {
        icon: '🎉',
        duration: 3800,
        style: {
          borderRadius: '14px',
          background: '#064e3b',
          color: '#ecfdf5',
          fontWeight: 'bold',
          fontSize: '0.88rem',
          border: '1px solid #10b981',
          boxShadow: '0 10px 25px rgba(16, 185, 129, 0.25)',
        },
      });

      setTimeout(() => {
        setCelebratingNoteId((curr) => (curr === note.id ? null : curr));
      }, 2800);
    } else {
      toast('یادداشت به وضعیت در حال انجام بازگشت ⏳', {
        icon: '↩️',
        duration: 2500,
      });
    }

    try {
      await api.put(`/study-planner/notes/${note.id}`, {
        ...note,
        is_completed: newCompletedStatus,
      });
    } catch (err) {
      console.error(err);
      toast.error('خطا در ذخیره وضعیت یادداشت');
    }
  };

  const handleCopyNote = (note, e) => {
    e?.stopPropagation();
    const text = `${note.title ? note.title + '\n' : ''}${note.content}`;
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(text);
      toast.success('متن یادداشت در کلیپ‌بورد کپی شد 📋');
    } else {
      toast.success('کپی شد');
    }
  };

  const handleStartEditNote = (note, e) => {
    e?.stopPropagation();
    setEditingNote(note);
    setEditNoteForm({
      title: note.title || '',
      content: note.content || '',
      color: note.color || 'yellow',
      is_pinned: Boolean(note.is_pinned),
      is_completed: Boolean(note.is_completed),
      category: note.category || 'general',
    });
  };

  const noteStats = useMemo(() => {
    const total = studentNotes.length;
    const completed = studentNotes.filter((n) => Boolean(n.is_completed)).length;
    const pending = total - completed;
    const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
    return { total, completed, pending, percent };
  }, [studentNotes]);

  const filteredStudentNotes = useMemo(() => {
    return studentNotes
      .filter((note) => {
        if (noteFilter === 'pinned' && !note.is_pinned) return false;
        if (noteFilter === 'completed' && !note.is_completed) return false;
        if (noteFilter === 'pending' && note.is_completed) return false;
        if (
          noteFilter !== 'all' &&
          noteFilter !== 'pinned' &&
          noteFilter !== 'completed' &&
          noteFilter !== 'pending' &&
          note.category !== noteFilter
        ) {
          return false;
        }
        if (noteSearch.trim()) {
          const q = noteSearch.trim().toLowerCase();
          const t = (note.title || '').toLowerCase();
          const c = (note.content || '').toLowerCase();
          if (!t.includes(q) && !c.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (noteFilter !== 'completed') {
          if (a.is_completed && !b.is_completed) return 1;
          if (!a.is_completed && b.is_completed) return -1;
        }
        if (a.is_pinned && !b.is_pinned) return -1;
        if (!a.is_pinned && b.is_pinned) return 1;
        return new Date(b.created_at || b.updated_at || 0) - new Date(a.created_at || a.updated_at || 0);
      });
  }, [studentNotes, noteFilter, noteSearch]);

  const getNoteCategoryBadge = (category) => {
    switch (category) {
      case 'homework': return { label: 'تکالیف درسی 📚', icon: '📚' };
      case 'daily_task': return { label: 'برنامه روزانه 🎯', icon: '🎯' };
      case 'exam_notes': return { label: 'نکات آزمون و امتحان 💡', icon: '💡' };
      case 'weekly_goal': return { label: 'هدف هفتگی ⏳', icon: '⏳' };
      case 'general':
      default: return { label: 'یادداشت شخصی 📝', icon: '📝' };
    }
  };

  const getNoteColorClass = (color) => {
    switch (color) {
      case 'blue': return styles.noteCardBlue;
      case 'green': return styles.noteCardGreen;
      case 'purple': return styles.noteCardPurple;
      case 'pink': return styles.noteCardPink;
      case 'yellow':
      default: return styles.noteCardYellow;
    }
  };

  const fetchTeacherPlans = async () => {
    setLoadingPlans(true);
    try {
      const res = await api.get('/study-planner/teacher-plans');
      if (res.data?.success) {
        const plans = res.data.data.plans || [];
        setTeacherPlans(plans);
        try {
          localStorage.setItem('teacher_plans_cache', JSON.stringify(plans));
        } catch (e) {}
      }
    } catch (err) {
      console.error(err);
      try {
        const saved = localStorage.getItem('teacher_plans_cache');
        if (saved) setTeacherPlans(JSON.parse(saved));
      } catch (e) {}
    } finally {
      setLoadingPlans(false);
    }
  };

  const fetchStudentData = async () => {
    setLoadingLogs(true);
    try {
      const [logsRes, statsRes] = await Promise.all([
        api.get('/study-planner/logs'),
        api.get('/study-planner/stats'),
      ]);
      setLogs(logsRes.data.data.logs || []);
      setStats(statsRes.data.data.stats || null);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingLogs(false);
    }
  };

  // Add new period to Teacher Timetable from the compact box or modal
  const handleCreateTeacherPlan = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!planForm.subject?.trim()) {
      toast.error('لطفاً عنوان درس را وارد کنید');
      return;
    }
    if (!planForm.grade?.trim()) {
      toast.error('لطفاً پایه تحصیلی را مشخص کنید');
      return;
    }

    setSubmittingPlan(true);
    const periodObj = PERIODS.find((p) => p.id === parseInt(planForm.period_number, 10)) || PERIODS[0];
    const payload = {
      ...planForm,
      subject: planForm.subject.trim(),
      grade: planForm.grade.trim(),
      period_number: parseInt(planForm.period_number, 10),
      day_of_week: parseInt(planForm.day_of_week, 10),
      start_time: periodObj.start,
      end_time: periodObj.end,
    };

    try {
      const res = await api.post('/study-planner/teacher-plans', payload);
      const createdPlan = res.data?.data?.plan || {
        ...payload,
        id: 'plan-' + Date.now(),
        status: 'upcoming',
      };

      toast.success(res.data?.message || `جلسه «${payload.subject}» با موفقیت در تقویم تدریس ثبت شد 🎉`);

      setTeacherPlans((prev) => {
        const updated = [...prev, createdPlan];
        try {
          localStorage.setItem('teacher_plans_cache', JSON.stringify(updated));
        } catch (e) {}
        return updated;
      });

      setBriefingDay(parseInt(payload.day_of_week, 10));
      setGradeFilter('all');
      setShowAddPlanModal(false);

      setPlanForm((prev) => ({
        ...prev,
        topic: '',
        notes: '',
      }));

      fetchTeacherPlans();
    } catch (err) {
      console.error(err);
      // Fallback local save so teacher's plan is preserved and visible
      const localPlan = {
        ...payload,
        id: 'local-' + Date.now(),
        status: 'upcoming',
      };
      setTeacherPlans((prev) => {
        const updated = [...prev, localPlan];
        try {
          localStorage.setItem('teacher_plans_cache', JSON.stringify(updated));
        } catch (e) {}
        return updated;
      });
      setBriefingDay(parseInt(payload.day_of_week, 10));
      setGradeFilter('all');
      setShowAddPlanModal(false);
      toast.success(`جلسه «${payload.subject}» با موفقیت ثبت شد 🎉`);
    } finally {
      setSubmittingPlan(false);
    }
  };

  // Toggle Status: completed <-> upcoming
  const handleToggleStatus = async (plan) => {
    const nextStatus = plan.status === 'completed' ? 'upcoming' : 'completed';
    try {
      await api.put(`/study-planner/teacher-plans/${plan.id}`, { status: nextStatus });
      toast.success(nextStatus === 'completed' ? 'جلسه به عنوان «تدریس شد» علامت‌گذاری شد ✅' : 'وضعیت جلسه به «پیش‌رو» تغییر یافت ⏳');
      setTeacherPlans((prev) =>
        prev.map((p) => (p.id === plan.id ? { ...p, status: nextStatus } : p))
      );
    } catch (err) {
      toast.error('خطا در به‌روزرسانی وضعیت جلسه');
    }
  };

  // Open Quick Edit Modal for Subject, Topic & Homework
  const handleOpenEdit = (plan) => {
    setEditingSession(plan);
    setEditSubject(plan.subject || '');
    setEditGrade(plan.grade || '');
    setEditClassName(plan.class_name || '');
    setEditTopic(plan.topic || '');
    setEditNotes(plan.notes || '');
    setEditStatus(plan.status || 'upcoming');
    setEditSessionType(plan.session_type || 'teaching');
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (!editingSession) return;
    if (!editSubject.trim()) {
      toast.error('عنوان درس نمی‌تواند خالی باشد');
      return;
    }
    setSavingEdit(true);
    try {
      await api.put(`/study-planner/teacher-plans/${editingSession.id}`, {
        subject: editSubject.trim(),
        grade: editGrade,
        class_name: editClassName,
        topic: editTopic,
        notes: editNotes,
        status: editStatus,
        session_type: editSessionType,
      });
      toast.success('مشخصات درس و تکالیف جلسه با موفقیت بروزرسانی شد 📝');
      setTeacherPlans((prev) =>
        prev.map((p) =>
          p.id === editingSession.id
            ? {
                ...p,
                subject: editSubject.trim(),
                grade: editGrade,
                class_name: editClassName,
                topic: editTopic,
                notes: editNotes,
                status: editStatus,
                session_type: editSessionType,
              }
            : p
        )
      );
      setEditingSession(null);
    } catch (err) {
      toast.error('خطا در ذخیره تغییرات');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDeletePlan = async (planId) => {
    if (!window.confirm('آیا از حذف این زنگ کلاسی از برنامه هفتگی مطمئن هستید؟')) return;
    try {
      await api.delete(`/study-planner/teacher-plans/${planId}`);
      toast.success('زنگ کلاسی حذف شد');
      setTeacherPlans((prev) => prev.filter((p) => p.id !== planId));
    } catch (err) {
      toast.error('خطا در حذف برنامه');
    }
  };

  // Filter plans by selected grade
  const filteredPlans = useMemo(() => {
    if (gradeFilter === 'all') return teacherPlans;
    return teacherPlans.filter((p) => {
      const g = (p.grade || '').trim().toLowerCase();
      const filter = gradeFilter.trim().toLowerCase();
      return g === filter || g.includes(filter) || filter.includes(g);
    });
  }, [teacherPlans, gradeFilter]);

  // Group plans by day (0 to 5)
  const plansByDay = useMemo(() => {
    const map = { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [] };
    filteredPlans.forEach((plan) => {
      const day = parseInt(plan.day_of_week, 10);
      if (map[day]) {
        map[day].push(plan);
      }
    });
    Object.keys(map).forEach((d) => {
      map[d].sort((a, b) => a.period_number - b.period_number);
    });
    return map;
  }, [filteredPlans]);

  // Classes for the top briefing day
  const briefingClasses = useMemo(() => {
    const list = teacherPlans.filter((p) => parseInt(p.day_of_week, 10) === briefingDay);
    return list.sort((a, b) => a.period_number - b.period_number);
  }, [teacherPlans, briefingDay]);

  // Teacher KPI Calculations
  const teacherStats = useMemo(() => {
    const totalPeriods = teacherPlans.length;
    const weeklyHours = (totalPeriods * 1.5).toFixed(1);
    const completedCount = teacherPlans.filter((p) => p.status === 'completed').length;
    const gradesSet = new Set(teacherPlans.map((p) => p.grade));
    const activeGradesCount = gradesSet.size;

    const jsDay = new Date().getDay();
    const iranianDayMap = { 6: 0, 0: 1, 1: 2, 2: 3, 3: 4, 4: 5, 5: -1 };
    const todayIndex = iranianDayMap[jsDay] ?? 0;
    const todayClasses = teacherPlans.filter((p) => p.day_of_week === todayIndex);

    return {
      totalPeriods,
      weeklyHours,
      completedCount,
      activeGradesCount,
      todayClassesCount: todayClasses.length,
      todayIndex,
    };
  }, [teacherPlans]);

  // Helper for grade badge style
  const getGradeStyle = (gradeStr = '') => {
    if (gradeStr.includes('دهم') || gradeStr.includes('10')) return { card: styles.sessionGrade10, badge: styles.gradeBadge10 };
    if (gradeStr.includes('یازدهم') || gradeStr.includes('11')) return { card: styles.sessionGrade11, badge: styles.gradeBadge11 };
    if (gradeStr.includes('دوازدهم') || gradeStr.includes('12')) return { card: styles.sessionGrade12, badge: styles.gradeBadge12 };
    return { card: styles.sessionGradeOther, badge: styles.gradeBadgeOther };
  };

  const getSessionTypeLabel = (type) => {
    switch (type) {
      case 'teaching': return 'تدریس سرفصل جدید 📚';
      case 'practice': return 'حل تمرین و تست 🎯';
      case 'quiz': return 'کوئیز و سنجش 📝';
      case 'lab': return 'آزمایشگاه و کارگاه 🔬';
      case 'review': return 'مرور و رفع اشکال 💬';
      default: return 'کلاس حضوری';
    }
  };

  // Student Logs Actions
  const handleCreateLog = async (e) => {
    e.preventDefault();
    setSubmittingLog(true);
    try {
      await api.post('/study-planner/logs', logForm);
      toast.success('گزارش مطالعه روزانه با موفقیت ثبت شد 🎯');
      setShowLogModal(false);
      fetchStudentData();
    } catch (err) {
      toast.error('خطا در ثبت گزارش');
    } finally {
      setSubmittingLog(false);
    }
  };

  const handleOpenFeedback = (log) => {
    setSelectedLogForFeedback(log);
    setFeedbackText(log.advisor_feedback || '');
  };

  const handleSubmitFeedback = async (e) => {
    e.preventDefault();
    if (!feedbackText.trim()) return;
    setSubmittingFeedback(true);
    try {
      await api.post(`/study-planner/logs/${selectedLogForFeedback.id}/feedback`, {
        advisor_feedback: feedbackText,
      });
      toast.success('بازخورد مشاور با موفقیت ثبت شد 📝');
      setSelectedLogForFeedback(null);
      setFeedbackText('');
      fetchStudentData();
    } catch (err) {
      toast.error('خطا در ثبت بازخورد');
    } finally {
      setSubmittingFeedback(false);
    }
  };

  return (
    <div className={styles.container}>
      {/* ── Top Hero Header ── */}
      <div className={styles.heroCard}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <h1 className={styles.title}>
              <span>{isTeacher ? 'برنامه‌ریزی درسی و تقویم تدریس دبیر' : 'دفترچه یادداشت و برنامه‌ریزی تحصیلی'}</span>
              <HiOutlineSparkles style={{ color: '#fbbf24' }} />
            </h1>
            <span className={styles.sampadBadge}>
              <HiOutlineAcademicCap />
              <span>{isTeacher ? 'سامانه تخصصی مدیریت کلاس و سرفصل‌ها' : 'دفترچه برنامه‌ریزی من 📝'}</span>
            </span>
          </div>
          <p className={styles.subtitle}>
            {isTeacher
              ? 'مشاهده فوری سرفصل‌های تدریس‌شده و تکالیف معین هر جلسه، مدیریت وضعیت تدریس و تنظیم برنامه کلاسی هفتگی'
              : 'صفحه اختصاصی ثبت و سازماندهی کارهای روزانه، تکالیف درسی، نکات مهم، یادداشت‌ها و اهداف مطالعاتی'}
          </p>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          {isTeacher ? (
            <>
              <button
                className="btn btn-primary"
                style={{
                  background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
                  borderColor: '#4f46e5',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontWeight: 700,
                  boxShadow: '0 4px 14px rgba(79, 70, 229, 0.35)',
                }}
                onClick={() => setShowAddPlanModal(true)}
              >
                <HiOutlinePlus />
                <span>ثبت برنامه کلاسی جدید ➕</span>
              </button>
              <button className="btn btn-secondary" onClick={() => window.print()}>
                <HiOutlinePrinter />
                <span>چاپ برنامه هفتگی</span>
              </button>
            </>
          ) : (
            <button
              className="btn btn-primary"
              style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)', borderColor: '#f59e0b' }}
              onClick={() => {
                const el = document.getElementById('student-notepad-card');
                if (el) el.scrollIntoView({ behavior: 'smooth' });
                const input = document.getElementById('note-title-input');
                if (input) input.focus();
              }}
            >
              <HiOutlinePlus />
              <span>یادداشت جدید 📝</span>
            </button>
          )}
        </div>
      </div>

      {/* ── TEACHER VIEW ── */}
      {isTeacher ? (
        <>
          {/* Navigation Tab Switcher */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
            <div className={styles.tabSwitcher}>
              <button
                className={`${styles.tabBtn} ${activeTab === 'schedule' ? styles.tabBtnActive : ''}`}
                onClick={() => setActiveTab('schedule')}
              >
                <HiOutlineCalendarDays />
                <span>برنامه‌ریزی تدریس و وضعیت جلسات</span>
              </button>
              <button
                className={`${styles.tabBtn} ${activeTab === 'roadmap' ? styles.tabBtnActive : ''}`}
                onClick={() => setActiveTab('roadmap')}
              >
                <HiOutlineBookOpen />
                <span>طرح درس و سرفصل پایه‌ها</span>
              </button>
              <button
                className={`${styles.tabBtn} ${activeTab === 'students' ? styles.tabBtnActive : ''}`}
                onClick={() => setActiveTab('students')}
              >
                <HiOutlineChartBar />
                <span>پایش مطالعاتی دانش‌آموزان ({logs.length})</span>
              </button>
            </div>

            <button
              className="btn btn-sm btn-secondary"
              onClick={fetchTeacherPlans}
              title="بارگذاری مجدد اطلاعات"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              <HiOutlineArrowPath className={loadingPlans ? 'spin' : ''} />
              <span>بروزرسانی داده‌ها</span>
            </button>
          </div>

          {activeTab === 'schedule' && (
            <>
              {/* ─────────────────────────────────────────────────────────────
                 ★ TOP BRIEIFNG HUB (میز کار تدریس و وضعیت مباحث و تکالیف روز)
                 ───────────────────────────────────────────────────────────── */}
              <div className={styles.dailyBriefingCard}>
                <div className={styles.briefingHeader}>
                  <div className={styles.briefingTitleRow}>
                    <div className={styles.briefingIcon}>
                      <HiOutlineClipboardDocumentCheck />
                    </div>
                    <div>
                      <div className={styles.briefingTitle}>
                        میز کار تدریس و خلاصه وضعیت کلاس‌های روز {DAYS.find((d) => d.id === briefingDay)?.name}
                        {teacherStats.todayIndex === briefingDay && (
                          <span style={{ marginRight: '8px', fontSize: '0.72rem', padding: '2px 8px', borderRadius: '12px', background: 'rgba(16, 185, 129, 0.15)', color: '#10b981', fontWeight: 800 }}>
                            (امروز)
                          </span>
                        )}
                      </div>
                      <div className={styles.briefingSubtitle}>
                        مشاهده سرفصل تدریس‌شده تا این لحظه، تکالیف تعیین‌شده و مدیریت وضعیت برگزاری هر زنگ
                      </div>
                    </div>
                  </div>

                  {/* Day Selector Buttons */}
                  <div className={styles.daySelectorBar}>
                    {DAYS.map((day) => {
                      const count = teacherPlans.filter((p) => parseInt(p.day_of_week, 10) === day.id).length;
                      const isActive = briefingDay === day.id;
                      const isToday = teacherStats.todayIndex === day.id;

                      return (
                        <button
                          key={day.id}
                          type="button"
                          className={`${styles.daySelectBtn} ${isActive ? styles.daySelectBtnActive : ''}`}
                          onClick={() => setBriefingDay(day.id)}
                        >
                          <span>{day.name}</span>
                          {isToday && !isActive && <span style={{ color: '#10b981', fontSize: '0.75rem' }}>●</span>}
                          <span className={styles.dayCountBadge}>{count}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* List of Classes for Selected Day with Highlights */}
                {briefingClasses.length === 0 ? (
                  <div className={styles.emptyDayNotice} style={{ padding: '36px 16px' }}>
                    <HiOutlineSparkles style={{ fontSize: '2rem', color: 'var(--text-tertiary)' }} />
                    <strong style={{ color: 'var(--text-primary)', fontSize: '0.95rem' }}>
                      در روز {DAYS.find((d) => d.id === briefingDay)?.name} کلاسی ثبت نشده است
                    </strong>
                    <span>برای این روز می‌توانید از بخش «تنظیم و افزودن برنامه کلاسی» در پایین صفحه جلسه جدیدی اضافه کنید.</span>
                  </div>
                ) : (
                  <div className={styles.briefingClassesGrid}>
                    {briefingClasses.map((plan) => {
                      const gradeStyles = getGradeStyle(plan.grade);
                      const isCompleted = plan.status === 'completed';

                      return (
                        <div key={plan.id} className={`${styles.briefingClassCard} ${gradeStyles.card}`}>
                          <div className={styles.briefingClassTop}>
                            <div>
                              <div
                                className={styles.briefingSubjectTitle}
                                onClick={() => handleOpenEdit(plan)}
                                style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                                title="کلیک برای ویرایش نام درس و مشخصات"
                              >
                                <span>{plan.subject}</span>
                                <HiOutlinePencilSquare style={{ fontSize: '0.85rem', opacity: 0.6 }} />
                              </div>
                              <div className={styles.sessionClassName} style={{ marginTop: '2px' }}>
                                <span>🏫 {plan.class_name || 'کلاس اصلی'}</span>
                                {plan.room && (
                                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', color: 'var(--text-tertiary)' }}>
                                    <HiOutlineMapPin /> {plan.room}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div style={{ textAlign: 'left', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                              <span className={`${styles.gradeBadge} ${gradeStyles.badge}`}>
                                {plan.grade}
                              </span>
                              <span className={styles.periodBadge}>
                                <HiOutlineClock />
                                <span>زنگ {plan.period_number} • {plan.start_time} - {plan.end_time}</span>
                              </span>
                            </div>
                          </div>

                          {/* ── HIGHLIGHT 1: تا اینجا تدریس کردی ── */}
                          <div className={styles.progressHighlightBox}>
                            <div className={styles.progressBoxTitle}>
                              <HiOutlineBookOpen />
                              <span>این درس رو تا اینجا تدریس کردی:</span>
                            </div>
                            <div className={styles.progressBoxContent}>
                              {plan.topic ? plan.topic : 'مبحثی برای این جلسه ثبت نشده است (جهت ثبت کلیک کنید)'}
                            </div>
                          </div>

                          {/* ── HIGHLIGHT 2: تکالیف هم اینا تعیین کردی ── */}
                          <div className={styles.homeworkHighlightBox}>
                            <div className={styles.homeworkBoxTitle}>
                              <HiOutlineDocumentText />
                              <span>تکالیف هم اینا تعیین کردی:</span>
                            </div>
                            <div className={styles.homeworkBoxContent}>
                              {plan.notes ? plan.notes : 'تکلیفی برای این جلسه ثبت نشده است.'}
                            </div>
                          </div>

                          {/* Footer with Status & Quick Edit */}
                          <div className={styles.briefingCardFooter}>
                            <span className={styles.sessionTypeTag}>
                              {getSessionTypeLabel(plan.session_type)}
                            </span>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <button
                                type="button"
                                className={styles.quickEditBtn}
                                onClick={() => handleOpenEdit(plan)}
                              >
                                <HiOutlinePencilSquare />
                                <span>ویرایش مبحث و تکلیف</span>
                              </button>

                              <button
                                type="button"
                                className={`${styles.statusToggleBtn} ${isCompleted ? styles.statusCompleted : ''}`}
                                onClick={() => handleToggleStatus(plan)}
                              >
                                {isCompleted ? <HiOutlineCheck /> : <HiOutlineClock />}
                                <span>{isCompleted ? 'تدریس شد ✅' : 'پیش‌رو ⏳'}</span>
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* ─────────────────────────────────────────────────────────────
                 ★ COMPACT PLANNING BOX (باکس افزودن و ثبت جلسه درسی جدید - زیر میز کار تدریس)
                 ───────────────────────────────────────────────────────────── */}
              <div id="compact-planner-box" className={styles.compactPlannerCard}>
                <div className={styles.compactPlannerHeader}>
                  <div className={styles.compactPlannerTitle}>
                    <HiOutlinePlus style={{ color: '#4f46e5', fontSize: '1.2rem' }} />
                    <span>افزودن و ثبت جلسه درسی جدید در برنامه کلاسی</span>
                  </div>
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>
                    مشخص کنید در چه روزی با چه پایه و زنگی کلاس دارید
                  </span>
                </div>

                <form onSubmit={handleCreateTeacherPlan}>
                  {/* Compact Day Selection */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '12px' }}>
                    <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)' }}>روز هفته:</span>
                    <div className={styles.compactDayChips}>
                      {DAYS.map((day) => (
                        <button
                          key={day.id}
                          type="button"
                          className={`${styles.compactDayChip} ${parseInt(planForm.day_of_week, 10) === day.id ? styles.compactDayChipActive : ''}`}
                          onClick={() => setPlanForm({ ...planForm, day_of_week: day.id })}
                        >
                          {day.name}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Compact Grade Selection */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '14px' }}>
                    <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)' }}>پایه تحصیلی:</span>
                    <div className={styles.compactGradeChips}>
                      {allAvailableGrades.map((gradeLabel, idx) => (
                        <button
                          key={idx}
                          type="button"
                          className={`${styles.compactGradeChip} ${planForm.grade === gradeLabel ? styles.compactGradeChipActive : ''}`}
                          onClick={() => setPlanForm({ ...planForm, grade: gradeLabel })}
                        >
                          {gradeLabel}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Compact Form Grid */}
                  <div className={styles.compactFormGrid}>
                    <div className="form-group">
                      <label style={{ fontSize: '0.78rem', fontWeight: 700 }}>عنوان درس *</label>
                      <input
                        type="text"
                        className="input"
                        placeholder="مثال: حسابان ۲، فیزیک، زیست‌شناسی"
                        value={planForm.subject}
                        onChange={(e) => setPlanForm({ ...planForm, subject: e.target.value })}
                        required
                      />
                    </div>

                    <div className="form-group">
                      <label style={{ fontSize: '0.78rem', fontWeight: 700 }}>پایه تحصیلی دقیق *</label>
                      <input
                        type="text"
                        className="input"
                        placeholder="مثال: پایه دهم ریاضی یا یازدهم تجربی"
                        value={planForm.grade}
                        onChange={(e) => setPlanForm({ ...planForm, grade: e.target.value })}
                        required
                      />
                    </div>

                    <div className="form-group">
                      <label style={{ fontSize: '0.78rem', fontWeight: 700 }}>زنگ و ساعت کلاسی *</label>
                      <select
                        className="input"
                        value={planForm.period_number}
                        onChange={(e) => setPlanForm({ ...planForm, period_number: e.target.value })}
                      >
                        {PERIODS.map((period) => (
                          <option key={period.id} value={period.id}>
                            {period.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="form-group">
                      <label style={{ fontSize: '0.78rem', fontWeight: 700 }}>نام کلاس یا اتاق</label>
                      <input
                        type="text"
                        className="input"
                        placeholder="مثال: کلاس ۱۰۱، سالن ۲"
                        value={planForm.class_name}
                        onChange={(e) => setPlanForm({ ...planForm, class_name: e.target.value })}
                      />
                    </div>

                    <div className="form-group">
                      <label style={{ fontSize: '0.78rem', fontWeight: 700 }}>نوع جلسه آموزشی</label>
                      <select
                        className="input"
                        value={planForm.session_type}
                        onChange={(e) => setPlanForm({ ...planForm, session_type: e.target.value })}
                      >
                        <option value="teaching">تدریس سرفصل جدید 📚</option>
                        <option value="practice">حل تمرین و تست 🎯</option>
                        <option value="quiz">کوئیز و سنجش 📝</option>
                        <option value="lab">آزمایشگاه و کارگاه 🔬</option>
                        <option value="review">مرور و رفع اشکال 💬</option>
                      </select>
                    </div>

                    <div className="form-group">
                      <label style={{ fontSize: '0.78rem', fontWeight: 700 }}>سرفصل یا مبحث تدریس جلسه</label>
                      <input
                        type="text"
                        className="input"
                        placeholder="مثال: فصل ۳: کار و انرژی (تدریس تا صفحه ۴۵)"
                        value={planForm.topic}
                        onChange={(e) => setPlanForm({ ...planForm, topic: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="form-group" style={{ marginTop: '10px' }}>
                    <label style={{ fontSize: '0.78rem', fontWeight: 700 }}>تکالیف تعیین‌شده برای این جلسه:</label>
                    <input
                      type="text"
                      className="input"
                      placeholder="مثال: حل تمرین‌های صفحه ۳۰ تا ۳۲ کتاب درسی و ۵ تست کنکور سراسری"
                      value={planForm.notes}
                      onChange={(e) => setPlanForm({ ...planForm, notes: e.target.value })}
                    />
                  </div>

                  <div className={styles.compactFormActions}>
                    <button
                      type="submit"
                      className="btn btn-primary btn-sm"
                      disabled={submittingPlan}
                      style={{ padding: '8px 20px', fontSize: '0.85rem' }}
                    >
                      <HiOutlinePlus />
                      <span>{submittingPlan ? 'در حال ثبت...' : 'ثبت در تقویم تدریس هفتگی'}</span>
                    </button>
                  </div>
                </form>
              </div>

              {/* ─────────────────────────────────────────────────────────────
                 ★ LOWER SECTION: WEEKLY TIMETABLE (تقویم و برنامه هفتگی تدریس)
                 ───────────────────────────────────────────────────────────── */}
              <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
                <div className={styles.sectionHeader}>
                  <div className={styles.sectionTitle}>
                    <HiOutlineCalendarDays style={{ color: '#4f46e5' }} />
                    <span>تقویم و برنامه هفتگی تدریس (شنبه تا پنج‌شنبه)</span>
                  </div>

                  {/* Mode switcher: Table (Matrix) vs Board vs Bands */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <div style={{ display: 'inline-flex', background: 'var(--bg-surface)', padding: '3px', borderRadius: 'var(--radius-xl)', border: '1px solid var(--border-color)', gap: '4px' }}>
                      <button
                        type="button"
                        className={`${styles.filterGradeBtn} ${scheduleViewMode === 'matrix' ? styles.filterGradeBtnActive : ''}`}
                        onClick={() => setScheduleViewMode('matrix')}
                        style={{ border: 'none' }}
                      >
                        <HiOutlineTableCells />
                        <span>جدول برنامه هفتگی (ماتریسی)</span>
                      </button>
                      <button
                        type="button"
                        className={`${styles.filterGradeBtn} ${scheduleViewMode === 'board' ? styles.filterGradeBtnActive : ''}`}
                        onClick={() => setScheduleViewMode('board')}
                        style={{ border: 'none' }}
                      >
                        <HiOutlineSquares2X2 />
                        <span>نمای ستونی روزها</span>
                      </button>
                      <button
                        type="button"
                        className={`${styles.filterGradeBtn} ${scheduleViewMode === 'bands' ? styles.filterGradeBtnActive : ''}`}
                        onClick={() => setScheduleViewMode('bands')}
                        style={{ border: 'none' }}
                      >
                        <HiOutlineCalendarDays />
                        <span>نمای سطری</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Grade Filter Bar (پایه‌های تعریف‌شده توسط معلم) */}
                <div className={styles.filterToolbar}>
                  <div className={styles.filterGradeGroup} style={{ flexWrap: 'wrap', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
                      <HiOutlineFunnel />
                      <span>پایه‌های تدریس من:</span>
                    </div>

                    {/* همه پایه‌ها */}
                    <button
                      type="button"
                      className={`${styles.filterGradeBtn} ${gradeFilter === 'all' ? styles.filterGradeBtnActive : ''}`}
                      onClick={() => setGradeFilter('all')}
                    >
                      همه پایه‌ها ({teacherPlans.length})
                    </button>

                    {/* چیپ‌های پایه‌های تعریف‌شده توسط کاربر */}
                    {allAvailableGrades.map((grade) => {
                      const count = teacherPlans.filter((p) => {
                        const g = (p.grade || '').trim().toLowerCase();
                        const f = grade.trim().toLowerCase();
                        return g === f || g.includes(f) || f.includes(g);
                      }).length;
                      const isActive = gradeFilter === grade;

                      return (
                        <div key={grade} style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
                          <button
                            type="button"
                            className={`${styles.filterGradeBtn} ${isActive ? styles.filterGradeBtnActive : ''}`}
                            onClick={() => setGradeFilter(grade)}
                            style={{ paddingLeft: '26px' }}
                            title={`فیلتر کلاس‌های ${grade}`}
                          >
                            <span>{grade}</span>
                            <span style={{ fontSize: '0.7rem', opacity: 0.8, marginRight: '4px' }}>({count})</span>
                          </button>
                          <button
                            type="button"
                            onClick={(e) => handleRemoveCustomGrade(grade, e)}
                            style={{
                              position: 'absolute',
                              left: '6px',
                              background: 'none',
                              border: 'none',
                              color: isActive ? '#fff' : 'var(--text-tertiary)',
                              cursor: 'pointer',
                              fontSize: '0.9rem',
                              display: 'flex',
                              alignItems: 'center',
                              padding: '2px',
                              opacity: 0.7,
                            }}
                            title={`حذف «${grade}» از پایه‌ها`}
                          >
                            ×
                          </button>
                        </div>
                      );
                    })}

                    {/* فیلد افزودن پایه جدید توسط کاربر */}
                    {showAddGradeInput ? (
                      <form onSubmit={handleAddCustomGrade} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                        <input
                          type="text"
                          className="input"
                          style={{ width: '175px', padding: '5px 10px', fontSize: '0.78rem', height: '32px' }}
                          placeholder="نام پایه جدید (مثلاً دهم تجربی)..."
                          value={newGradeInput}
                          onChange={(e) => setNewGradeInput(e.target.value)}
                          autoFocus
                          required
                        />
                        <button
                          type="submit"
                          className="btn btn-primary btn-sm"
                          style={{ padding: '4px 10px', fontSize: '0.78rem', height: '32px' }}
                        >
                          ثبت پایه
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          style={{ padding: '4px 8px', fontSize: '0.78rem', height: '32px' }}
                          onClick={() => {
                            setShowAddGradeInput(false);
                            setNewGradeInput('');
                          }}
                        >
                          ×
                        </button>
                      </form>
                    ) : (
                      <button
                        type="button"
                        className={styles.addCustomGradeBtn}
                        onClick={() => setShowAddGradeInput(true)}
                        title="افزودن پایه تحصیلی جدید برای فیلتر و ثبت کلاس"
                      >
                        <HiOutlinePlus />
                        <span>+ افزودن پایه دلخواه</span>
                      </button>
                    )}
                  </div>

                  <div style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>
                    نمایش {filteredPlans.length} جلسه در طول هفته
                  </div>
                </div>

                {/* Day Filter Tabs (شنبه تا پنج‌شنبه) */}
                <div className={styles.calendarDayTabsBar}>
                  <button
                    type="button"
                    className={`${styles.calendarDayTab} ${calendarDayFilter === 'all' ? styles.calendarDayTabActive : ''}`}
                    onClick={() => setCalendarDayFilter('all')}
                  >
                    <span>همه روزهای هفته (شنبه تا پنج‌شنبه)</span>
                    <span className={styles.calendarDayTabBadge}>{filteredPlans.length}</span>
                  </button>
                  {DAYS.map((day) => {
                    const count = (plansByDay[day.id] || []).length;
                    const isActive = calendarDayFilter === day.id;
                    const isToday = teacherStats.todayIndex === day.id;

                    return (
                      <button
                        key={day.id}
                        type="button"
                        className={`${styles.calendarDayTab} ${isActive ? styles.calendarDayTabActive : ''}`}
                        onClick={() => setCalendarDayFilter(day.id)}
                      >
                        <span>{day.name}</span>
                        {isToday && <span style={{ color: '#10b981', fontSize: '0.72rem' }}>●</span>}
                        <span className={styles.calendarDayTabBadge}>{count}</span>
                      </button>
                    );
                  })}
                </div>

                {loadingPlans ? (
                  <div style={{ textAlign: 'center', padding: '40px 0' }}>
                    <div className="spinner" style={{ margin: '0 auto' }}></div>
                  </div>
                ) : scheduleViewMode === 'board' ? (
                  /* ── WEEKLY CALENDAR BOARD VIEW (۶ ستون مستقل شنبه تا پنج‌شنبه برای نمایش تک‌تک کلاس‌ها) ── */
                  <div className={styles.calendarBoardScrollWrapper}>
                    <div className={`${styles.calendarBoardGrid} ${calendarDayFilter !== 'all' ? styles.calendarBoardGridSingleDay : ''}`}>
                      {DAYS.filter((d) => calendarDayFilter === 'all' || d.id === calendarDayFilter).map((day) => {
                        const dayPlans = plansByDay[day.id] || [];
                        const isToday = teacherStats.todayIndex === day.id;

                        return (
                          <div
                            key={day.id}
                            className={`${styles.calendarDayColumn} ${isToday ? styles.calendarDayColumnToday : ''}`}
                          >
                            {/* Day Header */}
                            <div className={styles.calendarDayColumnHeader}>
                              <div className={styles.calendarDayColumnTitle}>
                                <HiOutlineCalendarDays style={{ color: isToday ? '#10b981' : '#6366f1' }} />
                                <span>{day.name}</span>
                                {isToday && (
                                  <span style={{ fontSize: '0.68rem', padding: '2px 8px', borderRadius: '12px', background: 'rgba(16, 185, 129, 0.15)', color: '#10b981', fontWeight: 800 }}>
                                    امروز
                                  </span>
                                )}
                              </div>
                              <span className={styles.calendarDayCountPill}>
                                {dayPlans.length} کلاس
                              </span>
                            </div>

                            {/* Column Body: All classes of this day stacked cleanly */}
                            <div className={styles.calendarDayColumnBody}>
                              {dayPlans.length === 0 ? (
                                <div className={styles.calendarEmptyDayBox}>
                                  <HiOutlineSparkles style={{ fontSize: '1.8rem', color: 'var(--text-tertiary)' }} />
                                  <span>در روز {day.name} کلاسی ثبت نشده است</span>
                                  <button
                                    type="button"
                                    className={styles.columnAddClassBtn}
                                    onClick={() => handleQuickAddForDay(day.id)}
                                  >
                                    <HiOutlinePlus />
                                    <span>ثبت اولین کلاس برای {day.name}</span>
                                  </button>
                                </div>
                              ) : (
                                dayPlans.map((plan) => {
                                  const gradeStyles = getGradeStyle(plan.grade);
                                  const isCompleted = plan.status === 'completed';

                                  return (
                                    <div key={plan.id} className={`${styles.calendarClassCard} ${gradeStyles.card}`}>
                                      {/* Top Row: Period & Grade */}
                                      <div className={styles.calendarClassCardTop}>
                                        <span className={styles.periodBadge}>
                                          <HiOutlineClock />
                                          <span>زنگ {plan.period_number} • {plan.start_time} - {plan.end_time}</span>
                                        </span>
                                        <span className={`${styles.gradeBadge} ${gradeStyles.badge}`}>
                                          {plan.grade}
                                        </span>
                                      </div>

                                      {/* Subject Title */}
                                      <div
                                        className={styles.calendarClassSubject}
                                        onClick={() => handleOpenEdit(plan)}
                                        style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                                        title="کلیک برای ویرایش نام درس و مشخصات"
                                      >
                                        <span>{plan.subject}</span>
                                        <HiOutlinePencilSquare style={{ fontSize: '0.85rem', opacity: 0.6, flexShrink: 0 }} />
                                      </div>

                                      {/* Class Name & Room */}
                                      <div className={styles.calendarClassMeta}>
                                        <span>🏫 {plan.class_name || 'کلاس اصلی'}</span>
                                        {plan.room && (
                                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', color: 'var(--text-tertiary)' }}>
                                            <HiOutlineMapPin /> {plan.room}
                                          </span>
                                        )}
                                      </div>

                                      {/* تدریس تا اینجا */}
                                      <div className={`${styles.calendarMiniHighlight} ${styles.calendarMiniHighlightTopic}`}>
                                        <div className={`${styles.calendarMiniHighlightLabel} ${styles.calendarMiniHighlightLabelTopic}`}>
                                          <HiOutlineBookOpen />
                                          <span>تدریس تا اینجا:</span>
                                        </div>
                                        <div className={styles.calendarMiniHighlightValue}>
                                          {plan.topic ? plan.topic : 'مبحثی برای این جلسه ثبت نشده است.'}
                                        </div>
                                      </div>

                                      {/* تکالیف تعیین‌شده */}
                                      <div className={`${styles.calendarMiniHighlight} ${styles.calendarMiniHighlightHomework}`}>
                                        <div className={`${styles.calendarMiniHighlightLabel} ${styles.calendarMiniHighlightLabelHomework}`}>
                                          <HiOutlineDocumentText />
                                          <span>تکالیف تعیین‌شده:</span>
                                        </div>
                                        <div className={styles.calendarMiniHighlightValue}>
                                          {plan.notes ? plan.notes : 'تکلیفی تعیین نشده است.'}
                                        </div>
                                      </div>

                                      {/* Card Footer: Status & Actions */}
                                      <div className={styles.calendarClassFooter}>
                                        <button
                                          type="button"
                                          className={`${styles.statusToggleBtn} ${isCompleted ? styles.statusCompleted : ''}`}
                                          onClick={() => handleToggleStatus(plan)}
                                          title="تغییر وضعیت برگزاری جلسه"
                                        >
                                          {isCompleted ? <HiOutlineCheck /> : <HiOutlineClock />}
                                          <span style={{ fontSize: '0.72rem' }}>{isCompleted ? 'تدریس شد' : 'پیش‌رو'}</span>
                                        </button>

                                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                          <span className={styles.sessionTypeTag} style={{ fontSize: '0.68rem', padding: '2px 6px' }}>
                                            {getSessionTypeLabel(plan.session_type)}
                                          </span>

                                          <button
                                            type="button"
                                            className={styles.quickEditBtn}
                                            onClick={() => handleOpenEdit(plan)}
                                            title="ویرایش مبحث و تکالیف"
                                          >
                                            <HiOutlinePencilSquare />
                                          </button>

                                          <button
                                            type="button"
                                            className={styles.deletePlanBtn}
                                            onClick={() => handleDeletePlan(plan.id)}
                                            title="حذف از تقویم تدریس"
                                          >
                                            <HiOutlineTrash />
                                          </button>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })
                              )}
                            </div>

                            {/* Column Footer: Quick Add Class */}
                            <div className={styles.calendarDayColumnFooter}>
                              <button
                                type="button"
                                className={styles.columnAddClassBtn}
                                onClick={() => handleQuickAddForDay(day.id)}
                              >
                                <HiOutlinePlus />
                                <span>افزودن کلاس به {day.name}</span>
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : scheduleViewMode === 'bands' ? (
                  /* ── DAY BANDS VIEW (تک‌تک کلاس‌ها در هر روز مشخص و واضح) ── */
                  <div className={styles.weeklyScheduleGrid}>
                    {DAYS.filter((d) => calendarDayFilter === 'all' || d.id === calendarDayFilter).map((day) => {
                      const dayPlans = plansByDay[day.id] || [];
                      const isToday = teacherStats.todayIndex === day.id;

                      return (
                        <div key={day.id} className={styles.dayBandCard}>
                          <div className={styles.dayBandHeader}>
                            <div className={styles.dayBandTitleGroup}>
                              <div className={styles.dayBandTitle}>
                                <HiOutlineCalendarDays style={{ color: isToday ? '#10b981' : '#6366f1' }} />
                                <span>{day.name}</span>
                                {isToday && (
                                  <span style={{ fontSize: '0.7rem', padding: '2px 8px', borderRadius: '12px', background: 'rgba(16, 185, 129, 0.15)', color: '#10b981', fontWeight: 800 }}>
                                    امروز
                                  </span>
                                )}
                              </div>
                              <span className={styles.dayBandPill}>
                                {dayPlans.length} کلاس آموزشی
                              </span>
                            </div>

                            <button
                              type="button"
                              className={styles.addDayClassBtn}
                              onClick={() => handleQuickAddForDay(day.id)}
                            >
                              <HiOutlinePlus />
                              <span>افزودن کلاس به {day.name}</span>
                            </button>
                          </div>

                          <div className={styles.dayBandContent}>
                            {dayPlans.length === 0 ? (
                              <div className={styles.emptyDayBandNotice}>
                                <span>در روز {day.name} کلاسی برای این فیلتر ثبت نشده است.</span>
                                <button
                                  type="button"
                                  className={styles.addDayClassBtn}
                                  onClick={() => handleQuickAddForDay(day.id)}
                                >
                                  <HiOutlinePlus />
                                  <span>ثبت اولین کلاس برای {day.name}</span>
                                </button>
                              </div>
                            ) : (
                              <div className={styles.dayBandClassesGrid}>
                                {dayPlans.map((plan) => {
                                  const gradeStyles = getGradeStyle(plan.grade);
                                  const isCompleted = plan.status === 'completed';

                                  return (
                                    <div key={plan.id} className={`${styles.sessionCard} ${gradeStyles.card}`}>
                                      <div className={styles.sessionTopRow}>
                                        <span className={styles.periodBadge}>
                                          <HiOutlineClock />
                                          <span>زنگ {plan.period_number} • {plan.start_time} - {plan.end_time}</span>
                                        </span>
                                        <span className={`${styles.gradeBadge} ${gradeStyles.badge}`}>
                                          {plan.grade}
                                        </span>
                                      </div>

                                      <div
                                        className={styles.sessionSubject}
                                        onClick={() => handleOpenEdit(plan)}
                                        style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                                        title="کلیک برای ویرایش نام درس و مشخصات"
                                      >
                                        <span>{plan.subject}</span>
                                        <HiOutlinePencilSquare style={{ fontSize: '0.85rem', opacity: 0.6 }} />
                                      </div>

                                      <div className={styles.sessionClassName}>
                                        <span>🏫 {plan.class_name || 'کلاس اصلی'}</span>
                                        {plan.room && (
                                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', color: 'var(--text-tertiary)' }}>
                                            <HiOutlineMapPin /> {plan.room}
                                          </span>
                                        )}
                                      </div>

                                      {plan.topic && (
                                        <div className={styles.sessionTopicBox}>
                                          <strong>تدریس تا:</strong> {plan.topic}
                                        </div>
                                      )}

                                      {plan.notes && (
                                        <div style={{ fontSize: '0.75rem', color: '#f59e0b', fontWeight: 600 }}>
                                          📝 تکلیف: {plan.notes}
                                        </div>
                                      )}

                                      <div className={styles.sessionFooter}>
                                        <span className={styles.sessionTypeTag}>
                                          {getSessionTypeLabel(plan.session_type)}
                                        </span>

                                        <div className={styles.sessionActions}>
                                          <button
                                            type="button"
                                            className={styles.quickEditBtn}
                                            onClick={() => handleOpenEdit(plan)}
                                            title="ویرایش سرفصل و تکالیف"
                                          >
                                            <HiOutlinePencilSquare />
                                          </button>

                                          <button
                                            type="button"
                                            className={`${styles.statusToggleBtn} ${isCompleted ? styles.statusCompleted : ''}`}
                                            onClick={() => handleToggleStatus(plan)}
                                            title="تغییر وضعیت برگزاری جلسه"
                                          >
                                            {isCompleted ? <HiOutlineCheck /> : <HiOutlineClock />}
                                          </button>

                                          <button
                                            type="button"
                                            className={styles.deletePlanBtn}
                                            onClick={() => handleDeletePlan(plan.id)}
                                            title="حذف از برنامه هفتگی"
                                          >
                                            <HiOutlineTrash />
                                          </button>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  /* ── MATRIX TIMETABLE VIEW (جدول برنامه هفتگی تدریس) ── */
                  <div className={styles.matrixWrapper}>
                    <table className={styles.matrixTable}>
                      <thead>
                        <tr>
                          <th style={{ width: '130px' }}>
                            <div className={styles.matrixThContent}>
                              <span>روز هفته</span>
                              <span className={styles.matrixThTime}>شنبه تا پنج‌شنبه</span>
                            </div>
                          </th>
                          {PERIODS.map((period) => (
                            <th key={period.id}>
                              <div className={styles.matrixThContent}>
                                <span>{period.label.split('(')[0]}</span>
                                <span className={styles.matrixThTime}>{period.start} - {period.end}</span>
                              </div>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {DAYS.filter((d) => calendarDayFilter === 'all' || d.id === calendarDayFilter).map((day) => {
                          const isToday = teacherStats.todayIndex === day.id;
                          const dayClassesCount = (plansByDay[day.id] || []).length;

                          return (
                            <tr key={day.id}>
                              <td className={styles.matrixDayCell}>
                                <div className={styles.matrixDayCellContent}>
                                  <div className={styles.matrixDayName}>
                                    <HiOutlineCalendarDays style={{ color: isToday ? '#10b981' : '#6366f1' }} />
                                    <span>{day.name}</span>
                                  </div>
                                  {isToday && (
                                    <span style={{ fontSize: '0.68rem', padding: '2px 8px', borderRadius: '12px', background: 'rgba(16, 185, 129, 0.15)', color: '#10b981', fontWeight: 800 }}>
                                      امروز
                                    </span>
                                  )}
                                  <span className={styles.matrixDayPill}>
                                    {dayClassesCount} کلاس
                                  </span>
                                  <button
                                    type="button"
                                    className={styles.matrixAddDayBtn}
                                    onClick={() => handleQuickAddForDay(day.id)}
                                    title={`افزودن کلاس به ${day.name}`}
                                  >
                                    <HiOutlinePlus />
                                    <span>افزودن</span>
                                  </button>
                                </div>
                              </td>

                              {PERIODS.map((period) => {
                                const matchingPlans = (plansByDay[day.id] || []).filter(
                                  (p) => parseInt(p.period_number, 10) === period.id
                                );

                                return (
                                  <td key={period.id} className={styles.matrixPeriodCell}>
                                    {matchingPlans.length === 0 ? (
                                      <div
                                        className={styles.matrixEmptySlot}
                                        onClick={() => {
                                          setPlanForm((prev) => ({
                                            ...prev,
                                            day_of_week: day.id,
                                            period_number: period.id,
                                          }));
                                          setShowAddPlanModal(true);
                                        }}
                                        title={`کلیک برای ثبت جلسه در ${day.name} - زنگ ${period.id}`}
                                      >
                                        <HiOutlinePlus style={{ fontSize: '1.2rem', opacity: 0.6 }} />
                                        <span>+ زنگ آزاد</span>
                                        <span style={{ fontSize: '0.68rem', opacity: 0.5 }}>ثبت کلاس</span>
                                      </div>
                                    ) : (
                                      matchingPlans.map((plan) => {
                                        const gradeStyles = getGradeStyle(plan.grade);
                                        const isCompleted = plan.status === 'completed';

                                        return (
                                          <div key={plan.id} className={`${styles.matrixClassCard} ${gradeStyles.card}`}>
                                            <div className={styles.matrixClassHeader}>
                                              <div
                                                className={styles.matrixClassSubject}
                                                onClick={() => handleOpenEdit(plan)}
                                                style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px' }}
                                                title="کلیک برای ویرایش نام درس و مشخصات"
                                              >
                                                <span>{plan.subject}</span>
                                                <HiOutlinePencilSquare style={{ fontSize: '0.8rem', opacity: 0.6, flexShrink: 0 }} />
                                              </div>
                                              <span className={`${styles.gradeBadge} ${gradeStyles.badge}`} style={{ fontSize: '0.68rem', padding: '2px 6px' }}>
                                                {plan.grade}
                                              </span>
                                            </div>

                                            <div className={styles.matrixClassMeta}>
                                              <span>🏫 {plan.class_name || 'کلاس اصلی'}</span>
                                              {plan.room && (
                                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', color: 'var(--text-tertiary)' }}>
                                                  <HiOutlineMapPin /> {plan.room}
                                                </span>
                                              )}
                                            </div>

                                            {/* سرفصل تدریس تا این لحظه */}
                                            <div className={`${styles.matrixClassHighlight} ${styles.matrixClassHighlightTopic}`}>
                                              <div className={`${styles.matrixClassHighlightTitle} ${styles.matrixClassHighlightTitleTopic}`}>
                                                <HiOutlineBookOpen />
                                                <span>تدریس تا الان:</span>
                                              </div>
                                              <div className={styles.matrixClassHighlightText}>
                                                {plan.topic || 'مبحثی ثبت نشده'}
                                              </div>
                                            </div>

                                            {/* تکالیف تعیین‌شده */}
                                            <div className={`${styles.matrixClassHighlight} ${styles.matrixClassHighlightHomework}`}>
                                              <div className={`${styles.matrixClassHighlightTitle} ${styles.matrixClassHighlightTitleHomework}`}>
                                                <HiOutlineDocumentText />
                                                <span>تکالیف:</span>
                                              </div>
                                              <div className={styles.matrixClassHighlightText}>
                                                {plan.notes || 'تکلیفی معین نشده'}
                                              </div>
                                            </div>

                                            {/* Footer with status and actions */}
                                            <div className={styles.matrixClassFooter}>
                                              <button
                                                type="button"
                                                className={`${styles.statusToggleBtn} ${isCompleted ? styles.statusCompleted : ''}`}
                                                onClick={() => handleToggleStatus(plan)}
                                                style={{ padding: '3px 8px', fontSize: '0.7rem' }}
                                                title="تغییر وضعیت برگزاری جلسه"
                                              >
                                                {isCompleted ? <HiOutlineCheck /> : <HiOutlineClock />}
                                                <span>{isCompleted ? 'تدریس شد' : 'پیش‌رو'}</span>
                                              </button>

                                              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                <button
                                                  type="button"
                                                  className={styles.quickEditBtn}
                                                  onClick={() => handleOpenEdit(plan)}
                                                  title="ویرایش سرفصل و تکالیف"
                                                >
                                                  <HiOutlinePencilSquare />
                                                </button>

                                                <button
                                                  type="button"
                                                  className={styles.deletePlanBtn}
                                                  onClick={() => handleDeletePlan(plan.id)}
                                                  title="حذف از جدول"
                                                >
                                                  <HiOutlineTrash />
                                                </button>
                                              </div>
                                            </div>
                                          </div>
                                        );
                                      })
                                    )}
                                  </td>
                                );
                              })}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* ─────────────────────────────────────────────────────────────
                 ★ TEACHER REPOSITORY: طرح درس و تقویم محتوایی دبیر
                 ───────────────────────────────────────────────────────────── */}
              <div className={styles.teacherDocsSection}>
                <div className={styles.teacherDocsHeader}>
                  <div className={styles.teacherDocsTitleGroup}>
                    <div className={styles.teacherDocsTitle}>
                      <HiOutlineFolder style={{ color: '#6366f1', fontSize: '1.45rem' }} />
                      <span>طرح درس و تقویم محتوایی دبیر</span>
                      <span style={{ fontSize: '0.72rem', padding: '3px 10px', borderRadius: '14px', background: 'rgba(99, 102, 241, 0.12)', color: '#6366f1', fontWeight: 800 }}>
                        مخزن اسناد و بودجه‌بندی تدریس
                      </span>
                    </div>
                    <div className={styles.teacherDocsSubtitle}>
                      بارگذاری و مدیریت فایل‌های طرح درس سالانه و روزانه، تقویم محتوایی و بودجه‌بندی هفتگی، جزوات و راهنماهای آموزشی
                    </div>
                  </div>

                  <div className={styles.teacherDocsHeaderActions}>
                    <button
                      type="button"
                      className={styles.uploadToggleBtn}
                      onClick={() => setShowUploadForm(!showUploadForm)}
                    >
                      {showUploadForm ? (
                        <>
                          <HiOutlineXMark style={{ fontSize: '1.1rem' }} />
                          <span>بستن فرم بارگذاری</span>
                        </>
                      ) : (
                        <>
                          <HiOutlineCloudArrowUp style={{ fontSize: '1.1rem' }} />
                          <span>+ بارگذاری طرح درس / تقویم محتوایی</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* فرم بارگذاری فایل طرح درس یا تقویم محتوایی */}
                {showUploadForm && (
                  <form onSubmit={handleUploadDocument} className={styles.uploadPanel}>
                    <div className={styles.uploadPanelHeader}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <HiOutlineCloudArrowUp style={{ color: '#4f46e5', fontSize: '1.2rem' }} />
                        <span>بارگذاری سند جدید (طرح درس سالانه / تقویم محتوایی و بودجه‌بندی)</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => setShowUploadForm(false)}
                        className={styles.closeBtn}
                        style={{ fontSize: '1.2rem', padding: 0 }}
                      >
                        ×
                      </button>
                    </div>

                    {/* Drag & Drop File Input */}
                    <div
                      className={`${styles.dropzoneContainer} ${isDraggingFile ? styles.dropzoneContainerActive : ''}`}
                      onClick={() => fileInputRef.current?.click()}
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setIsDraggingFile(true);
                      }}
                      onDragEnter={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setIsDraggingFile(true);
                      }}
                      onDragLeave={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setIsDraggingFile(false);
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setIsDraggingFile(false);
                        const file = e.dataTransfer?.files?.[0];
                        if (file) handleProcessSelectedFile(file);
                      }}
                      role="button"
                      tabIndex={0}
                      title="برای انتخاب فایل کلیک کنید یا فایل را بکشید و رها نمایید"
                    >
                      <input
                        ref={fileInputRef}
                        id="teacher-doc-file-input"
                        type="file"
                        style={{ display: 'none' }}
                        onChange={handleFileChange}
                        onClick={(e) => e.stopPropagation()}
                        accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.rar,.png,.jpg,.jpeg,.txt,.csv"
                      />
                      <HiOutlineCloudArrowUp className={styles.dropzoneIcon} />
                      <div className={styles.dropzonePrompt}>
                        {selectedFile ? 'برای تغییر فایل کلیک کنید' : 'کلیک کنید یا فایل طرح درس / تقویم محتوایی را اینجا بکشید و رها نمایید'}
                      </div>
                      <div className={styles.dropzoneHint}>
                        پشتیبانی از فرمت‌های PDF، Word (DOCX)، Excel (XLSX)، PowerPoint و ZIP (حداکثر ۵۰ مگابایت)
                      </div>

                      {selectedFile && (
                        <div
                          className={styles.filePreviewBadge}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <HiOutlineCheckCircle style={{ fontSize: '1.1rem' }} />
                          <span>فایل انتخاب‌شده: {selectedFile.name} ({formatFileSize(selectedFile.size)})</span>
                          <button
                            type="button"
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: '#ef4444',
                              cursor: 'pointer',
                              marginRight: '8px',
                              fontWeight: 800,
                              fontSize: '1rem',
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedFile(null);
                              if (fileInputRef.current) fileInputRef.current.value = '';
                            }}
                            title="حذف فایل انتخاب‌شده"
                          >
                            ✕
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Form Fields Grid */}
                    <div className={styles.compactFormGrid}>
                      <div className="form-group">
                        <label style={{ fontSize: '0.8rem', fontWeight: 700 }}>عنوان سند یا طرح درس *</label>
                        <input
                          type="text"
                          className="input"
                          placeholder="مثلاً: طرح درس جامع سالانه حسابان دوازدهم یا تقویم محتوایی ترم اول"
                          value={docForm.title}
                          onChange={(e) => setDocForm({ ...docForm, title: e.target.value })}
                          required
                        />
                      </div>

                      <div className="form-group">
                        <label style={{ fontSize: '0.8rem', fontWeight: 700 }}>نوع سند آموزشی</label>
                        <select
                          className="select"
                          value={docForm.category}
                          onChange={(e) => setDocForm({ ...docForm, category: e.target.value })}
                        >
                          <option value="lesson_plan">📘 طرح درس سالانه و سرفصل‌ها</option>
                          <option value="content_calendar">📅 تقویم محتوایی و بودجه‌بندی هفتگی</option>
                          <option value="syllabus">📝 طرح درس روزانه و سناریوی تدریس</option>
                          <option value="guide">📂 جزوه، اسلاید و راهنمای آموزشی</option>
                        </select>
                      </div>

                      <div className="form-group">
                        <label style={{ fontSize: '0.8rem', fontWeight: 700 }}>پایه تحصیلی مربوطه</label>
                        <select
                          className="select"
                          value={docForm.grade}
                          onChange={(e) => setDocForm({ ...docForm, grade: e.target.value })}
                        >
                          <option value="عمومی / تمام پایه‌ها">عمومی / تمام پایه‌ها</option>
                          {allAvailableGrades.map((g) => (
                            <option key={g} value={g}>{g}</option>
                          ))}
                        </select>
                      </div>

                      <div className="form-group">
                        <label style={{ fontSize: '0.8rem', fontWeight: 700 }}>درس یا عنوان مبحث</label>
                        <input
                          type="text"
                          className="input"
                          placeholder="مثلاً: حسابان ۲، فیزیک ۱، زیست‌شناسی..."
                          value={docForm.subject}
                          onChange={(e) => setDocForm({ ...docForm, subject: e.target.value })}
                        />
                      </div>

                      <div className="form-group">
                        <label style={{ fontSize: '0.8rem', fontWeight: 700 }}>دوره / نیم‌سال تحصیلی</label>
                        <select
                          className="select"
                          value={docForm.academic_term}
                          onChange={(e) => setDocForm({ ...docForm, academic_term: e.target.value })}
                        >
                          <option value="سال تحصیلی ۱۴۰۵-۱۴۰۴">سال تحصیلی ۱۴۰۵-۱۴۰۴</option>
                          <option value="نیم‌سال اول ۱۴۰۴-۱۴۰۵">نیم‌سال اول ۱۴۰۴-۱۴۰۵</option>
                          <option value="نیم‌سال دوم ۱۴۰۴-۱۴۰۵">نیم‌سال دوم ۱۴۰۴-۱۴۰۵</option>
                          <option value="دوره تابستانه و المپیاد">دوره تابستانه و المپیاد</option>
                        </select>
                      </div>

                      <div className="form-group">
                        <label style={{ fontSize: '0.8rem', fontWeight: 700 }}>توضیحات و اهداف آموزشی سند</label>
                        <input
                          type="text"
                          className="input"
                          placeholder="خلاصه‌ای از اهداف، شیوه تدریس و بودجه‌بندی آزمون‌ها..."
                          value={docForm.description}
                          onChange={(e) => setDocForm({ ...docForm, description: e.target.value })}
                        />
                      </div>
                    </div>

                    <div className={styles.compactFormActions}>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => {
                          setShowUploadForm(false);
                          setSelectedFile(null);
                        }}
                      >
                        انصراف
                      </button>
                      <button
                        type="submit"
                        className="btn btn-primary btn-sm"
                        disabled={uploadingDoc}
                        style={{ padding: '8px 24px', fontSize: '0.85rem' }}
                      >
                        <HiOutlineCloudArrowUp style={{ fontSize: '1.1rem' }} />
                        <span>{uploadingDoc ? 'در حال بارگذاری فایل...' : 'ذخیره در آرشیو طرح درس'}</span>
                      </button>
                    </div>
                  </form>
                )}

                {/* نوار فیلتر دسته‌بندی و جستجوی اسناد */}
                <div className={styles.docsFilterRow}>
                  <div className={styles.docsCategoryTabs}>
                    <button
                      type="button"
                      className={`${styles.docsCategoryTab} ${docCategoryFilter === 'all' ? styles.docsCategoryTabActive : ''}`}
                      onClick={() => setDocCategoryFilter('all')}
                    >
                      <span>همه اسناد</span>
                      <span style={{ fontSize: '0.74rem', opacity: 0.8 }}>({teacherDocuments.length})</span>
                    </button>
                    <button
                      type="button"
                      className={`${styles.docsCategoryTab} ${docCategoryFilter === 'lesson_plan' ? styles.docsCategoryTabActive : ''}`}
                      onClick={() => setDocCategoryFilter('lesson_plan')}
                    >
                      <span>📘 طرح درس سالانه</span>
                      <span style={{ fontSize: '0.74rem', opacity: 0.8 }}>
                        ({teacherDocuments.filter((d) => d.category === 'lesson_plan').length})
                      </span>
                    </button>
                    <button
                      type="button"
                      className={`${styles.docsCategoryTab} ${docCategoryFilter === 'content_calendar' ? styles.docsCategoryTabActive : ''}`}
                      onClick={() => setDocCategoryFilter('content_calendar')}
                    >
                      <span>📅 تقویم محتوایی و بودجه‌بندی</span>
                      <span style={{ fontSize: '0.74rem', opacity: 0.8 }}>
                        ({teacherDocuments.filter((d) => d.category === 'content_calendar').length})
                      </span>
                    </button>
                    <button
                      type="button"
                      className={`${styles.docsCategoryTab} ${docCategoryFilter === 'syllabus' ? styles.docsCategoryTabActive : ''}`}
                      onClick={() => setDocCategoryFilter('syllabus')}
                    >
                      <span>📝 سناریوی روزانه</span>
                      <span style={{ fontSize: '0.74rem', opacity: 0.8 }}>
                        ({teacherDocuments.filter((d) => d.category === 'syllabus').length})
                      </span>
                    </button>
                    <button
                      type="button"
                      className={`${styles.docsCategoryTab} ${docCategoryFilter === 'guide' ? styles.docsCategoryTabActive : ''}`}
                      onClick={() => setDocCategoryFilter('guide')}
                    >
                      <span>📂 جزوه و راهنما</span>
                      <span style={{ fontSize: '0.74rem', opacity: 0.8 }}>
                        ({teacherDocuments.filter((d) => d.category === 'guide').length})
                      </span>
                    </button>
                  </div>

                  <div className={styles.docsSearchBox}>
                    <HiOutlineMagnifyingGlass style={{ color: 'var(--text-tertiary)', fontSize: '0.95rem' }} />
                    <input
                      type="text"
                      className={styles.docsSearchInput}
                      placeholder="جستجو در طرح درس‌ها و تقویم..."
                      value={docSearchQuery}
                      onChange={(e) => setDocSearchQuery(e.target.value)}
                    />
                    {docSearchQuery && (
                      <button
                        type="button"
                        onClick={() => setDocSearchQuery('')}
                        style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: '0.9rem' }}
                      >
                        ×
                      </button>
                    )}
                  </div>
                </div>

                {/* گرید نمایش کارت‌های اسناد */}
                {loadingDocs ? (
                  <div style={{ textAlign: 'center', padding: '30px 0' }}>
                    <div className="spinner" style={{ margin: '0 auto' }}></div>
                  </div>
                ) : filteredDocuments.length === 0 ? (
                  <div className={styles.emptyDocsCard}>
                    <HiOutlineFolder className={styles.emptyDocsIcon} />
                    <div style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                      هیچ سندی در این دسته‌بندی یافت نشد
                    </div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', maxWidth: '420px', lineHeight: 1.5 }}>
                      می‌توانید برای برنامه‌ریزی دقیق کلاسی، فایل‌های طرح درس سالانه و تقویم محتوایی خود را بارگذاری کنید تا همیشه در دسترس شما باشد.
                    </div>
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={() => setShowUploadForm(true)}
                      style={{ marginTop: '8px' }}
                    >
                      <HiOutlineCloudArrowUp />
                      <span>بارگذاری اولین سند آموزشی</span>
                    </button>
                  </div>
                ) : (
                  <div className={styles.docsGrid}>
                    {filteredDocuments.map((doc) => {
                      const typeBadge = getDocTypeBadge(doc.file_type);
                      const catBadge = getDocCategoryLabel(doc.category);
                      const fullUrl = getFullFileUrl(doc.file_url);

                      return (
                        <div key={doc.id} className={styles.docCard}>
                          <div className={styles.docCardTop}>
                            <div
                              className={styles.docTypeIconWrapper}
                              style={{ background: typeBadge.bg, color: typeBadge.color }}
                              title={typeBadge.label}
                            >
                              <span>{typeBadge.icon}</span>
                            </div>

                            <div className={styles.docCardMain}>
                              <div className={styles.docTitle}>
                                {doc.title}
                              </div>

                              <div className={styles.docMetaBadges}>
                                <span
                                  className={styles.docCategoryBadge}
                                  style={{ background: catBadge.bg, color: catBadge.color }}
                                >
                                  {catBadge.text}
                                </span>

                                {doc.grade && (
                                  <span className={styles.docGradeBadge}>
                                    {doc.grade}
                                  </span>
                                )}

                                {doc.subject && (
                                  <span style={{ fontSize: '0.72rem', padding: '2px 8px', borderRadius: 'var(--radius-md)', background: 'rgba(99, 102, 241, 0.08)', color: '#818cf8', fontWeight: 700 }}>
                                    {doc.subject}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          {doc.description && (
                            <div className={styles.docDescription}>
                              {doc.description}
                            </div>
                          )}

                          <div className={styles.docCardFooter}>
                            <div className={styles.docFileDetails}>
                              <span>{typeBadge.label}</span>
                              <span>•</span>
                              <span>{formatFileSize(doc.file_size)}</span>
                              {doc.academic_term && (
                                <>
                                  <span>•</span>
                                  <span>{doc.academic_term}</span>
                                </>
                              )}
                            </div>

                            <div className={styles.docActionButtons}>
                              <a
                                href={fullUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={styles.docDownloadLink}
                                download
                                title="دانلود یا مشاهده فایل"
                              >
                                <HiOutlineArrowDownTray style={{ fontSize: '0.9rem' }} />
                                <span>دانلود / مشاهده</span>
                              </a>

                              <button
                                type="button"
                                className={styles.docDeleteBtn}
                                onClick={() => handleDeleteDocument(doc.id)}
                                title="حذف از مخزن اسناد"
                              >
                                <HiOutlineTrash style={{ fontSize: '1rem' }} />
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}

          {/* Tab 2: Curriculum Roadmap & Textbook Syllabus */}
          {activeTab === 'roadmap' && (
            <div className={styles.roadmapGrid}>
              <div className={styles.roadmapCard}>
                <div className={styles.roadmapHeader}>
                  <div className={styles.roadmapTitle}>پایه دهم ریاضی و تجربی (ریاضی و فیزیک ۱)</div>
                  <span className={styles.gradeBadge10} style={{ padding: '3px 10px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 800 }}>
                    پیشرفت: ۶۵٪
                  </span>
                </div>
                <div className={styles.roadmapTrack}>
                  <div className={styles.roadmapFill} style={{ width: '65%', background: '#06b6d4' }}></div>
                </div>
                <div className={styles.roadmapTopicsList}>
                  <div className={styles.roadmapTopicItem}>
                    <HiOutlineCheckCircle style={{ color: '#10b981' }} />
                    <span>فصل ۱: مجموعه‌ها، الگو و دنباله حسابی و هندسی (تکمیل شد)</span>
                  </div>
                  <div className={styles.roadmapTopicItem}>
                    <HiOutlineCheckCircle style={{ color: '#10b981' }} />
                    <span>فصل ۲: مثلثات و نسبت‌های زاویه (تکمیل شد)</span>
                  </div>
                  <div className={styles.roadmapTopicItem}>
                    <HiOutlineClock style={{ color: '#f59e0b' }} />
                    <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>فصل ۳: توان‌های گویا و عبارت‌های جبری (در حال تدریس)</span>
                  </div>
                  <div className={styles.roadmapTopicItem}>
                    <HiOutlineSparkles style={{ color: 'var(--text-tertiary)' }} />
                    <span>فصل ۴: معادلات درجه دوم و نامعادلات (جلسات آینده)</span>
                  </div>
                </div>
              </div>

              <div className={styles.roadmapCard}>
                <div className={styles.roadmapHeader}>
                  <div className={styles.roadmapTitle}>پایه یازدهم (حسابان ۱ و فیزیک ۲)</div>
                  <span className={styles.gradeBadge11} style={{ padding: '3px 10px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 800 }}>
                    پیشرفت: ۵۰٪
                  </span>
                </div>
                <div className={styles.roadmapTrack}>
                  <div className={styles.roadmapFill} style={{ width: '50%', background: '#8b5cf6' }}></div>
                </div>
                <div className={styles.roadmapTopicsList}>
                  <div className={styles.roadmapTopicItem}>
                    <HiOutlineCheckCircle style={{ color: '#10b981' }} />
                    <span>فصل ۱: جبر و معادله (معادلات کسری و رادیکالی)</span>
                  </div>
                  <div className={styles.roadmapTopicItem}>
                    <HiOutlineCheckCircle style={{ color: '#10b981' }} />
                    <span>فصل ۲: تابع، اعمال روی توابع و توابع معکوس</span>
                  </div>
                  <div className={styles.roadmapTopicItem}>
                    <HiOutlineClock style={{ color: '#f59e0b' }} />
                    <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>فصل ۳: توابع نمایی و لگاریتمی (در حال تدریس)</span>
                  </div>
                  <div className={styles.roadmapTopicItem}>
                    <HiOutlineSparkles style={{ color: 'var(--text-tertiary)' }} />
                    <span>فصل ۴: حد و پیوستگی (آماده‌سازی نهایی)</span>
                  </div>
                </div>
              </div>

              <div className={styles.roadmapCard}>
                <div className={styles.roadmapHeader}>
                  <div className={styles.roadmapTitle}>پایه دوازدهم (حسابان ۲ و آمادگی نهایی/کنکور)</div>
                  <span className={styles.gradeBadge12} style={{ padding: '3px 10px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 800 }}>
                    پیشرفت: ۷۵٪
                  </span>
                </div>
                <div className={styles.roadmapTrack}>
                  <div className={styles.roadmapFill} style={{ width: '75%', background: '#f59e0b' }}></div>
                </div>
                <div className={styles.roadmapTopicsList}>
                  <div className={styles.roadmapTopicItem}>
                    <HiOutlineCheckCircle style={{ color: '#10b981' }} />
                    <span>فصل ۱: توابع درجه سوم و ترکیب توابع</span>
                  </div>
                  <div className={styles.roadmapTopicItem}>
                    <HiOutlineCheckCircle style={{ color: '#10b981' }} />
                    <span>فصل ۲: مثلثات پیشرفته و معادلات مثلثاتی</span>
                  </div>
                  <div className={styles.roadmapTopicItem}>
                    <HiOutlineCheckCircle style={{ color: '#10b981' }} />
                    <span>فصل ۳: حد بی‌نهایت و حد در بی‌نهایت</span>
                  </div>
                  <div className={styles.roadmapTopicItem}>
                    <HiOutlineClock style={{ color: '#f59e0b' }} />
                    <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>فصل ۴: مشتق و کاربرد مشتق (آزمون‌های شبیه‌ساز کنکور)</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Tab 3: Student Study Logs Monitoring */}
          {activeTab === 'students' && (
            <div className={styles.tableCard}>
              <div className={styles.tableHeader}>
                <div>
                  <h3>گزارش‌های مطالعه دانش‌آموزان و ارائه راهبرد تحصیلی</h3>
                  <p style={{ fontSize: '0.8125rem', color: 'var(--text-tertiary)', marginTop: '4px' }}>
                    مشاهده ساعات مطالعه تستی و تشریحی ثبت‌شده توسط دانش‌آموزان و ثبت نظر مشاوره‌ای
                  </p>
                </div>
                <span style={{ fontSize: '0.8125rem', color: 'var(--text-tertiary)' }}>
                  تعداد کل: {logs.length} گزارش
                </span>
              </div>

              <div className={styles.tableWrapper}>
                {loadingLogs ? (
                  <div style={{ textAlign: 'center', padding: '40px 0' }}>
                    <div className="spinner" style={{ margin: '0 auto' }}></div>
                  </div>
                ) : logs.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-tertiary)' }}>
                    هنوز هیچ گزارش مطالعه‌ای ثبت نشده است.
                  </div>
                ) : (
                  <table className={styles.studyTable}>
                    <thead>
                      <tr>
                        <th>تاریخ</th>
                        <th>نام دانش‌آموز</th>
                        <th>درس</th>
                        <th>زمان تشریحی</th>
                        <th>زمان تستی</th>
                        <th>تست‌ها (د/غ/کل)</th>
                        <th>درصد تراز</th>
                        <th>رضایت</th>
                        <th>یادداشت دانش‌آموز</th>
                        <th>بازخورد مشاور</th>
                        <th>عملیات</th>
                      </tr>
                    </thead>
                    <tbody>
                      {logs.map((log) => {
                        const total = log.tests_count || 0;
                        const correct = log.tests_correct || 0;
                        const wrong = log.tests_wrong || 0;
                        const perc = total > 0
                          ? Math.max(0, Math.round(((3 * correct - wrong) / (3 * total)) * 100))
                          : 0;

                        return (
                          <tr key={log.id}>
                            <td style={{ whiteSpace: 'nowrap' }}>
                              {new Date(log.date).toLocaleDateString('fa-IR', {
                                month: 'short',
                                day: 'numeric',
                              })}
                            </td>
                            <td>
                              <strong>{log.student_name}</strong>
                              {log.student_code && (
                                <span style={{ fontSize: '0.6875rem', color: 'var(--text-tertiary)', display: 'block' }}>
                                  {log.student_code}
                                </span>
                              )}
                            </td>
                            <td>
                              <span className={styles.subjectBadge}>{log.subject}</span>
                            </td>
                            <td>{log.study_minutes_descriptive} دقیقه</td>
                            <td>{log.study_minutes_test} دقیقه</td>
                            <td>
                              <span style={{ color: '#10b981' }}>{correct}</span> /{' '}
                              <span style={{ color: '#ef4444' }}>{wrong}</span> /{' '}
                              <span>{total}</span>
                            </td>
                            <td>
                              <span className={styles.accuracyBadge}>%{perc}</span>
                            </td>
                            <td>{'⭐'.repeat(log.satisfaction_score || 4)}</td>
                            <td style={{ maxWidth: '200px', fontSize: '0.8125rem' }}>
                              {log.student_notes || '—'}
                            </td>
                            <td style={{ maxWidth: '240px' }}>
                              {log.advisor_feedback ? (
                                <div className={styles.feedbackBox}>
                                  <strong>{log.advisor_name || 'مشاور'}:</strong> {log.advisor_feedback}
                                </div>
                              ) : (
                                <span style={{ color: 'var(--text-tertiary)', fontSize: '0.75rem' }}>در انتظار بررسی</span>
                              )}
                            </td>
                            <td>
                              <button
                                className="btn btn-secondary btn-sm"
                                onClick={() => handleOpenFeedback(log)}
                              >
                                <HiOutlineChatBubbleBottomCenterText />
                                <span>ثبت نظر</span>
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}
        </>
      ) : (
        /* ── STUDENT / PARENT VIEW: NOTEPAD / PERSONAL NOTES PAGE ── */
        <div className={styles.studentNotepadSection}>
          {/* Quick Note Input Box (دفترچه ثبت یادداشت سریع) */}
          <div className={styles.notepadQuickCard} id="student-notepad-card">
            <div className={styles.notepadHeader}>
              <div className={styles.notepadHeaderLeft}>
                <div className={styles.notepadHeaderIcon}>
                  <HiOutlineDocumentText />
                </div>
                <div>
                  <h2 className={styles.notepadTitle}>دفترچه یادداشت و برنامه‌ریزی من 📝</h2>
                  <p className={styles.notepadSub}>
                    ثبت کارهای روزانه، تکالیف درسی، نکات مهم و اهداف مطالعاتی
                  </p>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '0.8125rem', color: 'var(--text-tertiary)', fontWeight: 600 }}>
                  تعداد کل یادداشت‌ها: {studentNotes.length}
                </span>
                {studentNotes.length > 0 && (
                  <span style={{ fontSize: '0.8125rem', color: '#10b981', fontWeight: 700 }}>
                    • {noteStats.completed} تیک خورده ({noteStats.percent}٪)
                  </span>
                )}
              </div>
            </div>

            <form onSubmit={handleCreateNote} className={styles.notepadForm}>
              <input
                id="note-title-input"
                type="text"
                className={styles.notepadInput}
                placeholder="عنوان یادداشت یا درس (مثال: تکالیف فیزیک، تست‌های هندسه، فرمول‌های مثلثات...)"
                value={noteForm.title}
                onChange={(e) => setNoteForm({ ...noteForm, title: e.target.value })}
              />

              <textarea
                className={styles.notepadTextarea}
                placeholder="متن یادداشت، برنامه درسی، نکات مهم یا کارهایی که باید انجام بدم..."
                value={noteForm.content}
                onChange={(e) => setNoteForm({ ...noteForm, content: e.target.value })}
              />

              <div className={styles.notepadControlsRow}>
                <div className={styles.controlsLeftGroup}>
                  {/* Color Picker */}
                  <div className={styles.colorPickerBar}>
                    <span className={styles.colorPickerLabel}>رنگ نوت:</span>
                    {['yellow', 'blue', 'green', 'purple', 'pink'].map((color) => (
                      <button
                        type="button"
                        key={color}
                        className={`${styles.colorDot} ${
                          color === 'yellow' ? styles.colorDotYellow :
                          color === 'blue' ? styles.colorDotBlue :
                          color === 'green' ? styles.colorDotGreen :
                          color === 'purple' ? styles.colorDotPurple :
                          styles.colorDotPink
                        } ${noteForm.color === color ? styles.colorDotActive : ''}`}
                        title={color}
                        onClick={() => setNoteForm({ ...noteForm, color })}
                      />
                    ))}
                  </div>

                  {/* Category Select */}
                  <select
                    className={styles.categorySelectBox}
                    value={noteForm.category}
                    onChange={(e) => setNoteForm({ ...noteForm, category: e.target.value })}
                  >
                    <option value="general">📝 یادداشت شخصی</option>
                    <option value="homework">📚 تکالیف درسی</option>
                    <option value="daily_task">🎯 برنامه روزانه</option>
                    <option value="exam_notes">💡 نکات آزمون و درس</option>
                    <option value="weekly_goal">⏳ هدف هفتگی</option>
                  </select>

                  {/* Pin Toggle */}
                  <label
                    className={`${styles.pinToggleLabel} ${
                      noteForm.is_pinned ? styles.pinToggleLabelActive : ''
                    }`}
                  >
                    <input
                      type="checkbox"
                      style={{ display: 'none' }}
                      checked={noteForm.is_pinned}
                      onChange={(e) => setNoteForm({ ...noteForm, is_pinned: e.target.checked })}
                    />
                    <span>{noteForm.is_pinned ? '📌 سنجاق‌شده در بالای صفحه' : '📌 سنجاق کردن'}</span>
                  </label>
                </div>

                <button
                  type="submit"
                  className={styles.submitNoteBtn}
                  disabled={submittingNote || (!noteForm.title.trim() && !noteForm.content.trim())}
                >
                  <HiOutlinePlus />
                  <span>{submittingNote ? 'در حال ثبت...' : 'ثبت در دفترچه ✍️'}</span>
                </button>
              </div>
            </form>

            {/* Progress Bar & Achievement Tracker for student notes */}
            {studentNotes.length > 0 && (
              <div className={styles.notepadProgressCard}>
                <div className={styles.notepadProgressTop}>
                  <div className={styles.notepadProgressLabel}>
                    <HiOutlineSparkles style={{ color: '#10b981', fontSize: '1.2rem' }} />
                    <span>میزان پیشرفت برنامه‌ها و تکالیف:</span>
                    <span style={{ fontWeight: 800 }}>
                      {noteStats.completed} از {noteStats.total} کار انجام شده
                    </span>
                  </div>
                  <div className={styles.notepadProgressPercent}>
                    {noteStats.percent}٪ تکمیل
                  </div>
                </div>

                <div className={styles.notepadProgressTrack}>
                  <div
                    className={styles.notepadProgressFill}
                    style={{ width: `${noteStats.percent}%` }}
                  />
                </div>

                {noteStats.total > 0 && noteStats.percent === 100 && (
                  <div className={styles.notepadAllDoneBanner}>
                    <span>🎉</span>
                    <span>آفرین و تبریک قهرمان! تمام یادداشت‌ها و تکالیف با موفقیت تیک خوردند و انجام شدند!</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Toolbar: Filters & Search */}
          <div className={styles.notesToolbar}>
            <div className={styles.filterChipsGroup}>
              <button
                type="button"
                className={`${styles.filterChip} ${noteFilter === 'all' ? styles.filterChipActive : ''}`}
                onClick={() => setNoteFilter('all')}
              >
                <span>همه یادداشت‌ها</span>
                <span>({studentNotes.length})</span>
              </button>
              <button
                type="button"
                className={`${styles.filterChip} ${noteFilter === 'completed' ? styles.filterChipActive : ''}`}
                onClick={() => setNoteFilter('completed')}
              >
                <span>✅ انجام‌شده‌ها</span>
                <span>({noteStats.completed})</span>
              </button>
              <button
                type="button"
                className={`${styles.filterChip} ${noteFilter === 'pending' ? styles.filterChipActive : ''}`}
                onClick={() => setNoteFilter('pending')}
              >
                <span>⏳ در حال انجام</span>
                <span>({noteStats.pending})</span>
              </button>
              <button
                type="button"
                className={`${styles.filterChip} ${noteFilter === 'pinned' ? styles.filterChipActive : ''}`}
                onClick={() => setNoteFilter('pinned')}
              >
                <span>📌 سنجاق‌شده‌ها</span>
                <span>({studentNotes.filter((n) => n.is_pinned).length})</span>
              </button>
              <button
                type="button"
                className={`${styles.filterChip} ${noteFilter === 'homework' ? styles.filterChipActive : ''}`}
                onClick={() => setNoteFilter('homework')}
              >
                <span>📚 تکالیف درسی</span>
              </button>
              <button
                type="button"
                className={`${styles.filterChip} ${noteFilter === 'daily_task' ? styles.filterChipActive : ''}`}
                onClick={() => setNoteFilter('daily_task')}
              >
                <span>🎯 برنامه روزانه</span>
              </button>
              <button
                type="button"
                className={`${styles.filterChip} ${noteFilter === 'exam_notes' ? styles.filterChipActive : ''}`}
                onClick={() => setNoteFilter('exam_notes')}
              >
                <span>💡 نکات مهم</span>
              </button>
              <button
                type="button"
                className={`${styles.filterChip} ${noteFilter === 'weekly_goal' ? styles.filterChipActive : ''}`}
                onClick={() => setNoteFilter('weekly_goal')}
              >
                <span>⏳ اهداف هفتگی</span>
              </button>
            </div>

            <div className={styles.notesSearchBox}>
              <HiOutlineMagnifyingGlass style={{ color: 'var(--text-tertiary)', fontSize: '1rem' }} />
              <input
                type="text"
                className={styles.notesSearchInput}
                placeholder="جستجو در متن یا عنوان یادداشت‌ها..."
                value={noteSearch}
                onChange={(e) => setNoteSearch(e.target.value)}
              />
              {noteSearch && (
                <button
                  type="button"
                  style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)' }}
                  onClick={() => setNoteSearch('')}
                >
                  <HiOutlineXMark />
                </button>
              )}
            </div>
          </div>

          {/* Sticky Notes Wall Grid */}
          {loadingNotes && studentNotes.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '50px 0' }}>
              <div className="spinner" style={{ margin: '0 auto' }}></div>
              <p style={{ marginTop: '12px', color: 'var(--text-tertiary)', fontSize: '0.875rem' }}>
                در حال دریافت یادداشت‌ها...
              </p>
            </div>
          ) : filteredStudentNotes.length === 0 ? (
            <div className={styles.emptyNotepad}>
              <div className={styles.emptyNotepadIcon}>📝</div>
              <h3 className={styles.emptyNotepadTitle}>
                {noteSearch || noteFilter !== 'all'
                  ? 'یادداشتی با این مشخصات یافت نشد'
                  : 'دفترچه یادداشت شما هنوز خالی است!'}
              </h3>
              <p className={styles.emptyNotepadSub}>
                {noteSearch || noteFilter !== 'all'
                  ? 'می‌توانید فیلترها را تغییر دهید یا عبارت دیگری جستجو کنید.'
                  : 'هر زمان خواستی چیزی ثبت کنی، کارهای روزانه، تمرین‌ها و نکات مهم درسی رو در کادر بالا بنویس و دکمه ثبت رو بزن.'}
              </p>
            </div>
          ) : (
            <div className={styles.notesGrid}>
              {filteredStudentNotes.map((note) => {
                const catBadge = getNoteCategoryBadge(note.category);
                const colorClass = getNoteColorClass(note.color);
                const isCompleted = Boolean(note.is_completed);
                const isCelebrating = celebratingNoteId === note.id;
                const dateDisplay = note.created_at
                  ? new Date(note.created_at).toLocaleDateString('fa-IR', {
                      month: 'long',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })
                  : 'امروز';

                return (
                  <div
                    key={note.id}
                    className={`${styles.noteCard} ${colorClass} ${
                      isCompleted ? styles.noteCardCompleted : ''
                    } ${isCelebrating ? styles.noteCardCelebrating : ''}`}
                  >
                    {/* ── Celebration Confetti Burst & Motivational Banner ── */}
                    {isCelebrating && (
                      <div className={styles.confettiBurstWrapper}>
                        <div className={styles.celebrationToast}>
                          <span>🎉</span>
                          <span>{celebrationMessage}</span>
                        </div>

                        {/* Sparkle Stars */}
                        {[
                          { tx: '-60px', ty: '-50px', size: '1.4rem', color: '#f59e0b', delay: '0s' },
                          { tx: '60px', ty: '-55px', size: '1.5rem', color: '#10b981', delay: '0.1s' },
                          { tx: '-80px', ty: '30px', size: '1.2rem', color: '#ec4899', delay: '0.05s' },
                          { tx: '75px', ty: '35px', size: '1.3rem', color: '#6366f1', delay: '0.15s' },
                          { tx: '0px', ty: '-70px', size: '1.7rem', color: '#fbbf24', delay: '0.08s' },
                        ].map((s, idx) => (
                          <span
                            key={`star-${idx}`}
                            className={styles.starSparkle}
                            style={{
                              '--tx': s.tx,
                              '--ty': s.ty,
                              '--star-size': s.size,
                              '--star-color': s.color,
                              animationDelay: s.delay,
                              top: '25px',
                              right: '50%',
                            }}
                          >
                            ✨
                          </span>
                        ))}

                        {/* Confetti Particles */}
                        {Array.from({ length: 32 }).map((_, idx) => {
                          const angle = (idx / 32) * 360;
                          const distance = 55 + (idx % 6) * 18;
                          const tx = `${Math.cos((angle * Math.PI) / 180) * distance}px`;
                          const ty = `${Math.sin((angle * Math.PI) / 180) * distance - 20}px`;
                          const colors = ['#10b981', '#3b82f6', '#f59e0b', '#ec4899', '#8b5cf6', '#14b8a6', '#f97316', '#eab308'];
                          const color = colors[idx % colors.length];
                          const isRound = idx % 3 === 0;
                          const size = `${6 + (idx % 5) * 2}px`;
                          const rot = `${(idx * 45) % 360}deg`;
                          return (
                            <span
                              key={`p-${idx}`}
                              className={styles.confettiParticle}
                              style={{
                                '--tx': tx,
                                '--ty': ty,
                                '--color': color,
                                '--size': size,
                                '--radius': isRound ? '50%' : '2px',
                                '--rot': rot,
                                top: '35px',
                                right: '50%',
                              }}
                            />
                          );
                        })}
                      </div>
                    )}

                    <div className={styles.noteCardHeader}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {/* Interactive Checkbox Button */}
                        <button
                          type="button"
                          className={`${styles.noteCheckboxBtn} ${
                            isCompleted ? styles.noteCheckboxBtnChecked : ''
                          }`}
                          title={isCompleted ? 'تغییر به انجام‌نشده' : 'تیک زدن و ثبت موفقیت! 🎉'}
                          onClick={(e) => handleToggleCompleteNote(note, e)}
                        >
                          {isCompleted ? <HiOutlineCheck style={{ strokeWidth: 3 }} /> : null}
                        </button>

                        <span className={styles.noteCategoryTag}>
                          <span>{catBadge.label}</span>
                        </span>

                        {isCompleted && (
                          <span className={styles.noteCompletedBadge}>
                            🎉 انجام شد!
                          </span>
                        )}
                      </div>

                      {note.is_pinned && (
                        <span className={styles.notePinBadge}>
                          📌 سنجاق شده
                        </span>
                      )}
                    </div>

                    {note.title && (
                      <div className={styles.noteTitleRow}>
                        <h4
                          className={`${styles.noteCardTitle} ${
                            isCompleted ? styles.noteCardTitleCompleted : ''
                          }`}
                        >
                          {note.title}
                        </h4>
                      </div>
                    )}

                    <div
                      className={`${styles.noteCardContent} ${
                        isCompleted ? styles.noteCardContentCompleted : ''
                      }`}
                    >
                      {note.content || '—'}
                    </div>

                    <div className={styles.noteCardFooter}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span>{dateDisplay}</span>
                        {isCompleted && (
                          <span style={{ color: '#059669', fontWeight: 700, fontSize: '0.72rem' }}>
                            • تکمیل شده 🌟
                          </span>
                        )}
                      </div>

                      <div className={styles.noteActionsRow}>
                        <button
                          type="button"
                          className={styles.noteIconBtn}
                          title={isCompleted ? 'علامت‌گذاری به عنوان انجام‌نشده' : 'تیک زدن و اتمام کار'}
                          onClick={(e) => handleToggleCompleteNote(note, e)}
                          style={{ color: isCompleted ? '#059669' : 'inherit' }}
                        >
                          {isCompleted ? <HiOutlineCheckCircle /> : <HiOutlineCheck />}
                        </button>
                        <button
                          type="button"
                          className={styles.noteIconBtn}
                          title={note.is_pinned ? 'برداشتن سنجاق' : 'سنجاق کردن به بالا'}
                          onClick={(e) => handleTogglePin(note, e)}
                        >
                          📌
                        </button>
                        <button
                          type="button"
                          className={styles.noteIconBtn}
                          title="کپی متن"
                          onClick={(e) => handleCopyNote(note, e)}
                        >
                          <HiOutlineClipboardDocument />
                        </button>
                        <button
                          type="button"
                          className={styles.noteIconBtn}
                          title="ویرایش یادداشت"
                          onClick={(e) => handleStartEditNote(note, e)}
                        >
                          <HiOutlinePencilSquare />
                        </button>
                        <button
                          type="button"
                          className={styles.noteIconBtn}
                          title="حذف یادداشت"
                          style={{ color: '#ef4444' }}
                          onClick={(e) => handleDeleteNote(note.id, e)}
                        >
                          <HiOutlineTrash />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── MODAL: QUICK EDIT SESSION SUBJECT, TOPIC & HOMEWORK ── */}
      {editingSession && (
        <div className={styles.modalBackdrop} onClick={() => setEditingSession(null)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div>
                <h2>ویرایش مشخصات درس و برنامه کلاسی</h2>
                <p style={{ fontSize: '0.8125rem', color: 'var(--text-tertiary)', marginTop: '4px' }}>
                  {editingSession.grade} • زنگ {editingSession.period_number} ({editingSession.start_time} - {editingSession.end_time})
                </p>
              </div>
              <button className={styles.closeBtn} onClick={() => setEditingSession(null)}>
                &times;
              </button>
            </div>

            <form onSubmit={handleSaveEdit}>
              {/* نام و عنوان درس */}
              <div className="form-group">
                <label style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <HiOutlineBookOpen style={{ color: '#4f46e5' }} />
                  <span>نام و عنوان درس *</span>
                </label>
                <input
                  type="text"
                  className="input"
                  placeholder="مثال: حسابان ۲، فیزیک، هندسه تحلیلی، زیست‌شناسی"
                  value={editSubject}
                  onChange={(e) => setEditSubject(e.target.value)}
                  required
                />
              </div>

              {/* پایه و نام کلاس */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '12px' }}>
                <div className="form-group">
                  <label style={{ fontSize: '0.8rem', fontWeight: 600 }}>پایه تحصیلی</label>
                  <input
                    type="text"
                    className="input"
                    placeholder="مثال: پایه دهم ریاضی یا یازدهم تجربی"
                    value={editGrade}
                    onChange={(e) => setEditGrade(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label style={{ fontSize: '0.8rem', fontWeight: 600 }}>نام کلاس / سالن</label>
                  <input
                    type="text"
                    className="input"
                    placeholder="مثال: کلاس ۱۰۱، سالن ۲"
                    value={editClassName}
                    onChange={(e) => setEditClassName(e.target.value)}
                  />
                </div>
              </div>

              {/* مبحث تدریس‌شده تا اینجا */}
              <div className="form-group" style={{ marginTop: '14px' }}>
                <label style={{ fontSize: '0.85rem', fontWeight: 700, color: '#06b6d4', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <HiOutlineBookOpen />
                  <span>این درس رو تا اینجا تدریس کردی (مبحث تدریس‌شده):</span>
                </label>
                <textarea
                  className="input"
                  rows={2}
                  placeholder="مثال: فصل ۲: توان‌های گویا و عبارت‌های جبری - تدریس کامل مفاهیم صفحه ۳۴ تا ۳۸"
                  value={editTopic}
                  onChange={(e) => setEditTopic(e.target.value)}
                />
              </div>

              {/* تکالیف */}
              <div className="form-group" style={{ marginTop: '14px' }}>
                <label style={{ fontSize: '0.85rem', fontWeight: 700, color: '#f59e0b', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <HiOutlineDocumentText />
                  <span>تکالیف هم اینا تعیین کردی (تکالیف مشخص‌شده دانش‌آموزان):</span>
                </label>
                <textarea
                  className="input"
                  rows={2}
                  placeholder="مثال: حل تمرین‌های صفحه ۳۸ کتاب درسی و ۱۰ تست کنکور سراسری برای جلسه بعد"
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                />
              </div>

              {/* نوع جلسه و وضعیت برگزاری */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '14px' }}>
                <div className="form-group">
                  <label style={{ fontSize: '0.8125rem', fontWeight: 600 }}>نوع جلسه آموزشی:</label>
                  <select
                    className="input"
                    value={editSessionType}
                    onChange={(e) => setEditSessionType(e.target.value)}
                  >
                    <option value="teaching">تدریس سرفصل جدید 📚</option>
                    <option value="practice">حل تمرین و تست 🎯</option>
                    <option value="quiz">کوئیز و سنجش 📝</option>
                    <option value="lab">آزمایشگاه و کارگاه 🔬</option>
                    <option value="review">مرور و رفع اشکال 💬</option>
                  </select>
                </div>

                <div className="form-group">
                  <label style={{ fontSize: '0.8125rem', fontWeight: 600 }}>وضعیت برگزاری جلسه:</label>
                  <select
                    className="input"
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value)}
                  >
                    <option value="upcoming">در انتظار برگزاری / پیش‌رو ⏳</option>
                    <option value="completed">برگزار شد و تدریس تکمیل گردید ✅</option>
                    <option value="cancelled">لغو شده / تعطیل ❌</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={savingEdit}>
                  {savingEdit ? 'در حال ذخیره...' : 'ذخیره تغییرات مشخصات درس'}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setEditingSession(null)}
                >
                  انصراف
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL: ADD TEACHER CLASS PLAN / SESSION ── */}
      {showAddPlanModal && (
        <div className={styles.modalBackdrop} onClick={() => setShowAddPlanModal(false)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()} style={{ maxWidth: '600px' }}>
            <div className={styles.modalHeader}>
              <div>
                <h2>افزودن و ثبت زنگ درسی جدید 📅</h2>
                <p style={{ fontSize: '0.8125rem', color: 'var(--text-tertiary)', marginTop: '4px' }}>
                  تنظیم زمان، عنوان درس، پایه و سرفصل تدریس در تقویم کلاسی دبیر
                </p>
              </div>
              <button className={styles.closeBtn} onClick={() => setShowAddPlanModal(false)}>
                &times;
              </button>
            </div>

            <form onSubmit={handleCreateTeacherPlan}>
              {/* روز هفته */}
              <div className="form-group">
                <label style={{ fontSize: '0.8125rem', fontWeight: 700, marginBottom: '6px', display: 'block' }}>
                  روز هفته *
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '6px' }}>
                  {DAYS.map((day) => (
                    <button
                      key={day.id}
                      type="button"
                      className={`${styles.compactDayChip} ${parseInt(planForm.day_of_week, 10) === day.id ? styles.compactDayChipActive : ''}`}
                      onClick={() => setPlanForm({ ...planForm, day_of_week: day.id })}
                      style={{ textAlign: 'center', padding: '6px 2px', fontSize: '0.8rem' }}
                    >
                      {day.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* عنوان درس و پایه */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '12px' }}>
                <div className="form-group">
                  <label style={{ fontSize: '0.8125rem', fontWeight: 700 }}>عنوان درس *</label>
                  <input
                    type="text"
                    className="input"
                    placeholder="مثال: حسابان ۲، فیزیک، هندسه"
                    value={planForm.subject}
                    onChange={(e) => setPlanForm({ ...planForm, subject: e.target.value })}
                    required
                    autoFocus
                  />
                </div>

                <div className="form-group">
                  <label style={{ fontSize: '0.8125rem', fontWeight: 700 }}>پایه تحصیلی *</label>
                  <select
                    className="input"
                    value={planForm.grade}
                    onChange={(e) => setPlanForm({ ...planForm, grade: e.target.value })}
                  >
                    {allAvailableGrades.map((g, idx) => (
                      <option key={idx} value={g}>
                        {g}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* زنگ کلاسی و نوع جلسه */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '12px' }}>
                <div className="form-group">
                  <label style={{ fontSize: '0.8125rem', fontWeight: 700 }}>زنگ و ساعت کلاسی *</label>
                  <select
                    className="input"
                    value={planForm.period_number}
                    onChange={(e) => setPlanForm({ ...planForm, period_number: e.target.value })}
                  >
                    {PERIODS.map((period) => (
                      <option key={period.id} value={period.id}>
                        {period.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label style={{ fontSize: '0.8125rem', fontWeight: 700 }}>نوع جلسه آموزشی</label>
                  <select
                    className="input"
                    value={planForm.session_type}
                    onChange={(e) => setPlanForm({ ...planForm, session_type: e.target.value })}
                  >
                    <option value="teaching">تدریس سرفصل جدید 📚</option>
                    <option value="practice">حل تمرین و تست 🎯</option>
                    <option value="quiz">کوئیز و سنجش 📝</option>
                    <option value="lab">آزمایشگاه و کارگاه 🔬</option>
                    <option value="review">مرور و رفع اشکال 💬</option>
                  </select>
                </div>
              </div>

              {/* کلاس / سالن */}
              <div className="form-group" style={{ marginTop: '12px' }}>
                <label style={{ fontSize: '0.8125rem', fontWeight: 700 }}>نام کلاس یا سالن</label>
                <input
                  type="text"
                  className="input"
                  placeholder="مثال: کلاس ۱۰۱، سالن ۲"
                  value={planForm.class_name}
                  onChange={(e) => setPlanForm({ ...planForm, class_name: e.target.value })}
                />
              </div>

              {/* سرفصل یا مبحث تدریس */}
              <div className="form-group" style={{ marginTop: '12px' }}>
                <label style={{ fontSize: '0.8125rem', fontWeight: 700, color: '#06b6d4' }}>
                  سرفصل یا مبحث تدریس جلسه:
                </label>
                <input
                  type="text"
                  className="input"
                  placeholder="مثال: فصل ۳: کار و انرژی (تدریس تا صفحه ۴۵)"
                  value={planForm.topic}
                  onChange={(e) => setPlanForm({ ...planForm, topic: e.target.value })}
                />
              </div>

              {/* تکالیف تعیین‌شده */}
              <div className="form-group" style={{ marginTop: '12px' }}>
                <label style={{ fontSize: '0.8125rem', fontWeight: 700, color: '#f59e0b' }}>
                  تکالیف تعیین‌شده دانش‌آموزان:
                </label>
                <textarea
                  className="input"
                  rows={2}
                  placeholder="مثال: حل تمرین‌های صفحه ۳۰ تا ۳۲ کتاب درسی و ۵ تست کنکور سراسری"
                  value={planForm.notes}
                  onChange={(e) => setPlanForm({ ...planForm, notes: e.target.value })}
                />
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ flex: 1, padding: '12px', fontWeight: 700 }}
                  disabled={submittingPlan}
                >
                  {submittingPlan ? 'در حال ثبت...' : 'ثبت در تقویم تدریس هفتگی 💾'}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowAddPlanModal(false)}
                >
                  انصراف
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal: Register Study Log (Student) ── */}
      {showLogModal && (
        <div className={styles.modalBackdrop} onClick={() => setShowLogModal(false)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2>ثبت ساعت مطالعه روزانه</h2>
              <button className={styles.closeBtn} onClick={() => setShowLogModal(false)}>
                &times;
              </button>
            </div>

            <form onSubmit={handleCreateLog}>
              <div className={styles.formGrid}>
                <div className="form-group">
                  <label style={{ fontSize: '0.8125rem', fontWeight: 600 }}>درس *</label>
                  <select
                    className="input"
                    value={logForm.subject}
                    onChange={(e) => setLogForm({ ...logForm, subject: e.target.value })}
                  >
                    <option value="حسابان و دیفرانسیل">حسابان و دیفرانسیل</option>
                    <option value="فیزیک پیشرفته">فیزیک پیشرفته</option>
                    <option value="هندسه تحلیلی">هندسه تحلیلی</option>
                    <option value="شیمی و آزمایشگاه">شیمی و آزمایشگاه</option>
                    <option value="زیست‌شناسی پایه و کنکور">زیست‌شناسی پایه و کنکور</option>
                    <option value="گسسته و ترکیبیات">گسسته و ترکیبیات</option>
                    <option value="ادبیات و درک مطلب">ادبیات و درک مطلب</option>
                  </select>
                </div>

                <div className="form-group">
                  <label style={{ fontSize: '0.8125rem', fontWeight: 600 }}>تاریخ مطالعه</label>
                  <input
                    type="date"
                    className="input"
                    value={logForm.date}
                    onChange={(e) => setLogForm({ ...logForm, date: e.target.value })}
                  />
                </div>
              </div>

              <div className={styles.formGrid} style={{ marginTop: '12px' }}>
                <div className="form-group">
                  <label style={{ fontSize: '0.8125rem', fontWeight: 600 }}>مطالعه تشریحی (دقیقه)</label>
                  <input
                    type="number"
                    min="0"
                    step="15"
                    className="input"
                    value={logForm.study_minutes_descriptive}
                    onChange={(e) => setLogForm({ ...logForm, study_minutes_descriptive: e.target.value })}
                  />
                </div>

                <div className="form-group">
                  <label style={{ fontSize: '0.8125rem', fontWeight: 600 }}>مطالعه تستی (دقیقه)</label>
                  <input
                    type="number"
                    min="0"
                    step="15"
                    className="input"
                    value={logForm.study_minutes_test}
                    onChange={(e) => setLogForm({ ...logForm, study_minutes_test: e.target.value })}
                  />
                </div>
              </div>

              <div className={styles.formGrid} style={{ marginTop: '12px' }}>
                <div className="form-group">
                  <label style={{ fontSize: '0.8125rem', fontWeight: 600 }}>کل تست‌های حل شده</label>
                  <input
                    type="number"
                    min="0"
                    className="input"
                    value={logForm.tests_count}
                    onChange={(e) => setLogForm({ ...logForm, tests_count: e.target.value })}
                  />
                </div>

                <div className="form-group">
                  <label style={{ fontSize: '0.8125rem', fontWeight: 600 }}>تست‌های درست</label>
                  <input
                    type="number"
                    min="0"
                    className="input"
                    value={logForm.tests_correct}
                    onChange={(e) => setLogForm({ ...logForm, tests_correct: e.target.value })}
                  />
                </div>
              </div>

              <div className={styles.formGrid} style={{ marginTop: '12px' }}>
                <div className="form-group">
                  <label style={{ fontSize: '0.8125rem', fontWeight: 600 }}>تست‌های نادرست</label>
                  <input
                    type="number"
                    min="0"
                    className="input"
                    value={logForm.tests_wrong}
                    onChange={(e) => setLogForm({ ...logForm, tests_wrong: e.target.value })}
                  />
                </div>

                <div className="form-group">
                  <label style={{ fontSize: '0.8125rem', fontWeight: 600 }}>میزان رضایت</label>
                  <select
                    className="input"
                    value={logForm.satisfaction_score}
                    onChange={(e) => setLogForm({ ...logForm, satisfaction_score: e.target.value })}
                  >
                    <option value="5">⭐⭐⭐⭐⭐ عالی و تمرکز کامل</option>
                    <option value="4">⭐⭐⭐⭐ خوب و پربازده</option>
                    <option value="3">⭐⭐⭐ متوسط</option>
                    <option value="2">⭐⭐ نیاز به تلاش و جبران</option>
                  </select>
                </div>
              </div>

              <div className="form-group" style={{ marginTop: '14px' }}>
                <label style={{ fontSize: '0.8125rem', fontWeight: 600 }}>نکات چالشی یا ابهامات درسی</label>
                <textarea
                  className="input"
                  rows={2}
                  placeholder="مباحثی که نیاز به رفع اشکال با دبیر دارد..."
                  value={logForm.student_notes}
                  onChange={(e) => setLogForm({ ...logForm, student_notes: e.target.value })}
                />
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '18px' }}>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={submittingLog}>
                  {submittingLog ? 'در حال ثبت...' : 'ثبت قطعی در دفتر برنامه‌ریزی'}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowLogModal(false)}
                >
                  انصراف
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal: Advisor Feedback (Teacher on student log) ── */}
      {selectedLogForFeedback && (
        <div className={styles.modalBackdrop} onClick={() => setSelectedLogForFeedback(null)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div>
                <h2>ثبت بازخورد مشاور تحصیلی</h2>
                <p style={{ fontSize: '0.8125rem', color: 'var(--text-tertiary)' }}>
                  دانش‌آموز: {selectedLogForFeedback.student_name} • درس: {selectedLogForFeedback.subject}
                </p>
              </div>
              <button className={styles.closeBtn} onClick={() => setSelectedLogForFeedback(null)}>
                &times;
              </button>
            </div>

            <form onSubmit={handleSubmitFeedback}>
              <div className="form-group">
                <label style={{ fontSize: '0.875rem', fontWeight: 600 }}>متن توصیه و راهبرد مشاور</label>
                <textarea
                  className="input"
                  rows={4}
                  placeholder="توصیه‌های انگیزشی، مدیریت زمان، تحلیل تعادل تستی و برنامه هفته آینده..."
                  value={feedbackText}
                  onChange={(e) => setFeedbackText(e.target.value)}
                  required
                />
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '18px' }}>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={submittingFeedback}>
                  {submittingFeedback ? 'در حال ثبت...' : 'ارسال بازخورد برای دانش‌آموز'}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setSelectedLogForFeedback(null)}
                >
                  انصراف
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL: EDIT STUDENT NOTE ── */}
      {editingNote && (
        <div className={styles.modalBackdrop} onClick={() => setEditingNote(null)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div>
                <h2>ویرایش یادداشت 📝</h2>
                <p style={{ fontSize: '0.8125rem', color: 'var(--text-tertiary)', marginTop: '4px' }}>
                  تغییر متن، رنگ، دسته‌بندی یا وضعیت سنجاق یادداشت
                </p>
              </div>
              <button className={styles.closeBtn} onClick={() => setEditingNote(null)}>
                &times;
              </button>
            </div>

            <form onSubmit={handleUpdateNote}>
              <div className="form-group">
                <label style={{ fontSize: '0.8125rem', fontWeight: 600 }}>عنوان یادداشت</label>
                <input
                  type="text"
                  className="input"
                  value={editNoteForm.title}
                  onChange={(e) => setEditNoteForm({ ...editNoteForm, title: e.target.value })}
                />
              </div>

              <div className="form-group" style={{ marginTop: '12px' }}>
                <label style={{ fontSize: '0.8125rem', fontWeight: 600 }}>متن یادداشت</label>
                <textarea
                  className="input"
                  rows={4}
                  value={editNoteForm.content}
                  onChange={(e) => setEditNoteForm({ ...editNoteForm, content: e.target.value })}
                />
              </div>

              <div className={styles.formGrid} style={{ marginTop: '12px' }}>
                <div className="form-group">
                  <label style={{ fontSize: '0.8125rem', fontWeight: 600 }}>دسته‌بندی</label>
                  <select
                    className="input"
                    value={editNoteForm.category}
                    onChange={(e) => setEditNoteForm({ ...editNoteForm, category: e.target.value })}
                  >
                    <option value="general">📝 یادداشت شخصی</option>
                    <option value="homework">📚 تکالیف درسی</option>
                    <option value="daily_task">🎯 برنامه روزانه</option>
                    <option value="exam_notes">💡 نکات آزمون و درس</option>
                    <option value="weekly_goal">⏳ هدف هفتگی</option>
                  </select>
                </div>

                <div className="form-group">
                  <label style={{ fontSize: '0.8125rem', fontWeight: 600 }}>رنگ کارت</label>
                  <select
                    className="input"
                    value={editNoteForm.color}
                    onChange={(e) => setEditNoteForm({ ...editNoteForm, color: e.target.value })}
                  >
                    <option value="yellow">💛 زرد قناری</option>
                    <option value="blue">💙 آبی آسمانی</option>
                    <option value="green">💚 سبز بهاری</option>
                    <option value="purple">💜 بنفش یاسی</option>
                    <option value="pink">💖 صورتی پاستلی</option>
                  </select>
                </div>
              </div>

              <div className="form-group" style={{ marginTop: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={editNoteForm.is_pinned}
                    onChange={(e) => setEditNoteForm({ ...editNoteForm, is_pinned: e.target.checked })}
                  />
                  <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>📌 سنجاق در بالای دفترچه یادداشت</span>
                </label>

                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={editNoteForm.is_completed}
                    onChange={(e) => setEditNoteForm({ ...editNoteForm, is_completed: e.target.checked })}
                  />
                  <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#059669' }}>
                    ✅ علامت‌گذاری به عنوان انجام‌شده (تکمیل برنامه)
                  </span>
                </label>
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={savingEditNote}>
                  {savingEditNote ? 'در حال ذخیره...' : 'ذخیره تغییرات'}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setEditingNote(null)}
                >
                  انصراف
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
