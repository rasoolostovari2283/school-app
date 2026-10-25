'use client';
import { useState, useEffect, useRef } from 'react';
import useAuthStore from '../../../stores/authStore';
import api from '../../../lib/api';
import toast from 'react-hot-toast';
import Link from 'next/link';
import {
  HiOutlineQuestionMarkCircle,
  HiOutlinePlus,
  HiOutlineClock,
  HiOutlineCheckBadge,
  HiOutlineTrash,
  HiOutlinePlay,
  HiOutlineDocumentCheck,
  HiOutlinePaperClip,
  HiOutlineDocumentText,
  HiOutlineDocumentArrowDown,
  HiOutlineArrowUpTray,
  HiOutlineXMark,
  HiOutlineLockClosed,
  HiOutlineAcademicCap,
  HiOutlineUserGroup,
  HiOutlineEye,
  HiOutlineExclamationTriangle,
  HiOutlineCheckCircle,
  HiOutlinePhoto,
  HiOutlineMagnifyingGlassPlus,
  HiOutlineArrowPath,
  HiOutlinePrinter,
  HiOutlinePhone,
  HiOutlineChatBubbleLeftRight,
} from 'react-icons/hi2';
import styles from './quizzes.module.css';

export default function QuizzesPage() {
  const { user } = useAuthStore();
  const isTeacher = user?.role === 'teacher';
  const isStudent = user?.role === 'student';
  const isParent = user?.role === 'parent';
  const isAdmin = user?.role === 'admin' || user?.role === 'manager';

  const [quizzes, setQuizzes] = useState([]);
  const [classes, setClasses] = useState([]);
  const [selectedClassFilter, setSelectedClassFilter] = useState('all');
  const [loading, setLoading] = useState(true);

  // Modal: Create Quiz
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState({
    class_id: '',
    title: '',
    description: '',
    duration_minutes: 30,
    has_negative_marking: true,
    attachments: [],
    questions: [],
  });

  // Grade & Class connection states (with "موارد دیگر / دستی")
  const [selectedGrade, setSelectedGrade] = useState('all');
  const [customGrade, setCustomGrade] = useState('');
  const [customClassName, setCustomClassName] = useState('');
  const [customClassSubject, setCustomClassSubject] = useState('');
  const [selectedClassMembers, setSelectedClassMembers] = useState([]);
  const [loadingMembers, setLoadingMembers] = useState(false);

  const [teacherUploading, setTeacherUploading] = useState(false);
  const [submittingQuiz, setSubmittingQuiz] = useState(false);
  const teacherFileInputRef = useRef(null);

  // Modal: Take Quiz (Student Online Exam)
  const [takingQuiz, setTakingQuiz] = useState(null);
  const [currentAttempt, setCurrentAttempt] = useState(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [isExamLocked, setIsExamLocked] = useState(false);
  const [studentAnswers, setStudentAnswers] = useState({});
  const [studentNote, setStudentNote] = useState('');
  const [studentFiles, setStudentFiles] = useState([]);
  const [studentUploading, setStudentUploading] = useState(false);
  const [submittingAttempt, setSubmittingAttempt] = useState(false);
  const [attemptResult, setAttemptResult] = useState(null);
  const [showInlineFile, setShowInlineFile] = useState(false);
  const studentFileInputRef = useRef(null);

  // Modal: Results & Participants (Teacher)
  const [resultsQuiz, setResultsQuiz] = useState(null);
  const [loadingResults, setLoadingResults] = useState(false);
  const [participantFilter, setParticipantFilter] = useState('all');
  const [liveMonitoring, setLiveMonitoring] = useState(false);
  const [refreshingList, setRefreshingList] = useState(false);

  // 🔍 Image Lightbox
  const [lightboxImage, setLightboxImage] = useState(null);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') setLightboxImage(null);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // 🔄 Live Monitoring interval when participants modal is open
  useEffect(() => {
    if (!resultsQuiz || !liveMonitoring) return;
    const interval = setInterval(async () => {
      try {
        const res = await api.get(`/classes/${resultsQuiz.class_id}/quizzes/${resultsQuiz.id}`);
        if (res.data?.data?.quiz) {
          setResultsQuiz(res.data.data.quiz);
        }
      } catch (err) {
        // silent
      }
    }, 12000);
    return () => clearInterval(interval);
  }, [resultsQuiz, liveMonitoring]);

  const formatPersianTime = (isoString) => {
    if (!isoString) return '—';
    try {
      const d = new Date(isoString);
      return d.toLocaleTimeString('fa-IR', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    } catch (e) {
      return isoString;
    }
  };

  const formatPersianDate = (isoString) => {
    if (!isoString) return '—';
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString('fa-IR', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    } catch (e) {
      return isoString;
    }
  };

  const calculateDurationMinutes = (startedAt, completedAt) => {
    if (!startedAt) return '—';
    const startMs = new Date(startedAt).getTime();
    const endMs = completedAt ? new Date(completedAt).getTime() : Date.now();
    const diffSec = Math.max(0, Math.floor((endMs - startMs) / 1000));
    const mins = Math.floor(diffSec / 60);
    const secs = diffSec % 60;
    if (mins > 0) {
      return `${mins} دقیقه و ${secs} ثانیه`;
    }
    return `${secs} ثانیه`;
  };

  const getFullFileUrl = (url) => {
    if (!url) return '#';
    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    const backendBase = process.env.NEXT_PUBLIC_API_URL
      ? process.env.NEXT_PUBLIC_API_URL.replace(/\/api\/v1\/?$/, '')
      : 'http://localhost:5000';
    return `${backendBase}${url.startsWith('/') ? '' : '/'}${url}`;
  };

  const formatTimer = (totalSeconds) => {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const pad = (n) => String(n).padStart(2, '0');
    if (hours > 0) {
      return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
    }
    return `${pad(minutes)}:${pad(seconds)}`;
  };

  useEffect(() => {
    fetchClasses();
    fetchQuizzes();
  }, []);

  // ⏱️ Live countdown timer for student online exam
  useEffect(() => {
    if (!takingQuiz || isExamLocked || attemptResult) return;

    if (secondsLeft <= 0) {
      setIsExamLocked(true);
      toast.error('زمان آزمون به پایان رسید! آزمون بسته و ثبت گردید.');
      handleSubmitAttempt(true);
      return;
    }

    const timer = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          setIsExamLocked(true);
          toast.error('زمان آزمون به پایان رسید! پاسخنامه قفل و ارسال شد.');
          handleSubmitAttempt(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [takingQuiz, secondsLeft, isExamLocked, attemptResult]);

  const fetchSelectedClassMembers = async (classId) => {
    if (!classId || classId === 'all' || classId === 'custom') {
      setSelectedClassMembers([]);
      return;
    }
    setLoadingMembers(true);
    try {
      const res = await api.get(`/classes/${classId}/members`);
      const members = res.data?.data?.members || [];
      setSelectedClassMembers(members.filter((m) => m.role === 'student' || !m.role));
    } catch (err) {
      console.error('Error fetching class members:', err);
      setSelectedClassMembers([]);
    } finally {
      setLoadingMembers(false);
    }
  };

  const fetchClasses = async () => {
    try {
      const res = await api.get('/classes');
      const list = res.data.data.classes || [];
      setClasses(list);
      if (list.length > 0) {
        setCreateForm((prev) => {
          const valid = list.some((c) => c.id === prev.class_id);
          const activeClassId = valid ? prev.class_id : list[0].id;
          fetchSelectedClassMembers(activeClassId);
          return { ...prev, class_id: activeClassId };
        });
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchQuizzes = async () => {
    setLoading(true);
    try {
      const res = await api.get('/quizzes');
      const list = res.data?.data?.quizzes || [];
      list.forEach((q) => {
        if (typeof q.attachments === 'string') {
          try {
            q.attachments = JSON.parse(q.attachments);
          } catch (e) {
            q.attachments = [];
          }
        }
      });
      setQuizzes(list);
      try {
        localStorage.setItem('cached_quizzes', JSON.stringify(list));
      } catch (e) {}
    } catch (err) {
      console.warn('Could not fetch quizzes from server, checking local cache:', err.message);
      try {
        const cached = JSON.parse(localStorage.getItem('cached_quizzes') || '[]');
        if (cached.length > 0) {
          setQuizzes(cached);
          return;
        }
      } catch (e) {}
      if (err.response?.status && err.response.status !== 401) {
        toast.error('خطا در بارگذاری کوییزها');
      }
    } finally {
      setLoading(false);
    }
  };

  const uniqueGrades = Array.from(
    new Set(classes.map((c) => c.grade).filter(Boolean))
  );

  const filteredClassesForCreate = selectedGrade === 'all'
    ? classes
    : classes.filter((c) => c.grade === selectedGrade);

  const handleGradeChange = (grade) => {
    setSelectedGrade(grade);
    if (grade === 'custom') {
      setCreateForm((prev) => ({ ...prev, class_id: 'custom' }));
      setSelectedClassMembers([]);
      return;
    }
    const available = grade === 'all' ? classes : classes.filter((c) => c.grade === grade);
    if (available.length > 0) {
      const nextId = available[0].id;
      setCreateForm((prev) => ({ ...prev, class_id: nextId }));
      fetchSelectedClassMembers(nextId);
    } else {
      setCreateForm((prev) => ({ ...prev, class_id: 'custom' }));
      setSelectedClassMembers([]);
    }
  };

  const handleClassChange = (classId) => {
    setCreateForm((prev) => ({ ...prev, class_id: classId }));
    if (classId === 'custom') {
      setSelectedClassMembers([]);
      return;
    }
    const found = classes.find((c) => c.id === classId);
    if (found?.grade && selectedGrade !== 'all' && selectedGrade !== 'custom' && selectedGrade !== found.grade) {
      setSelectedGrade(found.grade);
    }
    fetchSelectedClassMembers(classId);
  };

  const handleOpenCreateModal = () => {
    setShowCreateModal(true);
    if (classes.length > 0) {
      const valid = classes.some((c) => c.id === createForm.class_id);
      const activeClassId = valid ? createForm.class_id : classes[0].id;
      const activeCls = classes.find((c) => c.id === activeClassId);
      if (activeCls?.grade && selectedGrade === 'all') {
        setSelectedGrade(activeCls.grade);
      }
      setCreateForm((prev) => ({ ...prev, class_id: activeClassId }));
      fetchSelectedClassMembers(activeClassId);
    } else {
      setSelectedGrade('custom');
      setCreateForm((prev) => ({ ...prev, class_id: 'custom' }));
      fetchClasses();
    }
  };

  const handleTeacherFileUpload = async (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setTeacherUploading(true);
    const formData = new FormData();
    for (let i = 0; i < files.length; i++) {
      formData.append('files', files[i]);
    }
    try {
      const res = await api.post('/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const uploaded = res.data.data.files || [res.data.data.file];
      setCreateForm((prev) => ({
        ...prev,
        attachments: [...prev.attachments, ...uploaded],
      }));
      toast.success(`${uploaded.length} فایل برگه سوالات پیوست شد`);
    } catch (err) {
      toast.error('خطا در بارگذاری فایل سوالات');
    } finally {
      setTeacherUploading(false);
    }
  };

  const removeTeacherAttachment = (idx) => {
    setCreateForm((prev) => ({
      ...prev,
      attachments: prev.attachments.filter((_, i) => i !== idx),
    }));
  };

  const handleAddQuestion = () => {
    setCreateForm((prev) => ({
      ...prev,
      questions: [
        ...prev.questions,
        {
          question_text: '',
          question_image_url: '',
          options: [
            { text: '', image_url: '' },
            { text: '', image_url: '' },
            { text: '', image_url: '' },
            { text: '', image_url: '' },
          ],
          correct_option: '0',
          points: 1,
        },
      ],
    }));
  };

  const handleRemoveQuestion = (idx) => {
    setCreateForm((prev) => ({
      ...prev,
      questions: prev.questions.filter((_, i) => i !== idx),
    }));
  };

  const handleQuestionImageUpload = async (qIndex, file) => {
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await api.post('/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const url = res.data.data.url || res.data.data.file?.url;
      setCreateForm((prev) => {
        const updated = [...prev.questions];
        updated[qIndex] = { ...updated[qIndex], question_image_url: url };
        return { ...prev, questions: updated };
      });
      toast.success('تصویر صورت سوال با موفقیت پیوست شد 🖼️');
    } catch (err) {
      toast.error('خطا در بارگذاری تصویر سوال');
    }
  };

  const removeQuestionImage = (qIndex) => {
    setCreateForm((prev) => {
      const updated = [...prev.questions];
      updated[qIndex] = { ...updated[qIndex], question_image_url: '' };
      return { ...prev, questions: updated };
    });
  };

  const handleOptionImageUpload = async (qIndex, optIndex, file) => {
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await api.post('/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const url = res.data.data.url || res.data.data.file?.url;
      setCreateForm((prev) => {
        const updatedQuestions = [...prev.questions];
        const currentQuestion = { ...updatedQuestions[qIndex] };
        const currentOptions = [...currentQuestion.options];

        const existingOpt = currentOptions[optIndex];
        const currentText = typeof existingOpt === 'string' ? existingOpt : (existingOpt?.text || '');
        currentOptions[optIndex] = { text: currentText, image_url: url };

        currentQuestion.options = currentOptions;
        updatedQuestions[qIndex] = currentQuestion;
        return { ...prev, questions: updatedQuestions };
      });
      toast.success(`تصویر گزینه ${['الف', 'ب', 'ج', 'د'][optIndex]} با موفقیت اضافه شد`);
    } catch (err) {
      toast.error('خطا در بارگذاری تصویر گزینه');
    }
  };

  const removeOptionImage = (qIndex, optIndex) => {
    setCreateForm((prev) => {
      const updatedQuestions = [...prev.questions];
      const currentQuestion = { ...updatedQuestions[qIndex] };
      const currentOptions = [...currentQuestion.options];

      const existingOpt = currentOptions[optIndex];
      const currentText = typeof existingOpt === 'string' ? existingOpt : (existingOpt?.text || '');
      currentOptions[optIndex] = { text: currentText, image_url: '' };

      currentQuestion.options = currentOptions;
      updatedQuestions[qIndex] = currentQuestion;
      return { ...prev, questions: updatedQuestions };
    });
  };

  const handleOptionTextChange = (qIndex, optIndex, text) => {
    setCreateForm((prev) => {
      const updatedQuestions = [...prev.questions];
      const currentQuestion = { ...updatedQuestions[qIndex] };
      const currentOptions = [...currentQuestion.options];

      const existingOpt = currentOptions[optIndex];
      const existingImg = typeof existingOpt === 'object' ? (existingOpt?.image_url || '') : '';
      currentOptions[optIndex] = { text, image_url: existingImg };

      currentQuestion.options = currentOptions;
      updatedQuestions[qIndex] = currentQuestion;
      return { ...prev, questions: updatedQuestions };
    });
  };

  const handleCreateQuiz = async (e) => {
    e.preventDefault();
    if (!createForm.title.trim()) {
      toast.error('لطفاً عنوان آزمون را وارد کنید');
      return;
    }

    if (!createForm.attachments.length && !createForm.questions.length) {
      toast.error('لطفاً یا فایل برگه آزمون (PDF/تصویر) را پیوست کنید یا حداقل یک سوال تعریف نمایید');
      return;
    }

    // Validate questions if any were added
    for (let i = 0; i < createForm.questions.length; i++) {
      const q = createForm.questions[i];
      const hasStem = (q.question_text && q.question_text.trim()) || q.question_image_url;
      if (!hasStem) {
        toast.error(`سوال شماره ${i + 1} باید دارای متن یا عکس صورت سوال باشد`);
        return;
      }
      for (let optIdx = 0; optIdx < 4; optIdx++) {
        const opt = q.options[optIdx];
        const optText = typeof opt === 'string' ? opt : opt?.text;
        const optImg = typeof opt === 'object' ? opt?.image_url : null;
        if (!optText?.trim() && !optImg) {
          toast.error(`گزینه ${['الف', 'ب', 'ج', 'د'][optIdx]} از سوال ${i + 1} باید دارای متن یا تصویر باشد`);
          return;
        }
      }
    }

    let targetClassId = createForm.class_id;

    // Handle manual/custom class or grade
    if (targetClassId === 'custom' || !targetClassId) {
      if (!customClassName.trim()) {
        toast.error('لطفاً نام کلاس دستی را وارد کنید');
        return;
      }
      const gradeToSave = selectedGrade === 'custom'
        ? (customGrade.trim() || 'پایه عمومی')
        : selectedGrade !== 'all' ? selectedGrade : 'پایه عمومی';

      setSubmittingQuiz(true);
      try {
        const clsRes = await api.post('/classes', {
          name: customClassName.trim(),
          subject: customClassSubject.trim() || 'درس عمومی',
          grade: gradeToSave,
        });
        const createdClass = clsRes.data?.data?.class;
        targetClassId = createdClass?.id;
        toast.success(`کلاس جدید "${createdClass?.name || customClassName}" با موفقیت ثبت شد`);
      } catch (err) {
        toast.error(err.response?.data?.message || 'خطا در ثبت کلاس دستی جدید');
        setSubmittingQuiz(false);
        return;
      }
    }

    setSubmittingQuiz(true);
    try {
      await api.post(`/classes/${targetClassId}/quizzes`, {
        title: createForm.title.trim(),
        description: createForm.description,
        duration_minutes: parseInt(createForm.duration_minutes, 10) || 30,
        has_negative_marking: createForm.has_negative_marking,
        attachments: createForm.attachments,
        questions: createForm.questions.map((q) => ({
          question_text: q.question_text || '',
          question_image_url: q.question_image_url || null,
          options: q.options.map((opt) => (typeof opt === 'string' ? { text: opt, image_url: '' } : opt)),
          correct_option: String(q.correct_option ?? '0'),
          points: q.points || 1,
        })),
      });
      toast.success('آزمون آنلاین با موفقیت طراحی و فعال شد 🎉');
      setShowCreateModal(false);
      setCustomGrade('');
      setCustomClassName('');
      setCustomClassSubject('');
      setCreateForm({
        class_id: classes[0]?.id || targetClassId || '',
        title: '',
        description: '',
        duration_minutes: 30,
        has_negative_marking: true,
        attachments: [],
        questions: [],
      });
      await fetchClasses();
      fetchQuizzes();
    } catch (err) {
      toast.error(err.response?.data?.message || 'خطا در ساخت آزمون');
    } finally {
      setSubmittingQuiz(false);
    }
  };

  const handleStartTakingQuiz = async (quiz) => {
    try {
      const res = await api.get(`/classes/${quiz.class_id}/quizzes/${quiz.id}`);
      const fullQuiz = res.data.data.quiz;

      // Start or fetch attempt with started_at
      const startRes = await api.post(`/classes/${quiz.class_id}/quizzes/${quiz.id}/start`);
      const attempt = startRes.data.data.attempt;
      setCurrentAttempt(attempt);

      // Calculate remaining seconds
      const totalAllowedSeconds = (fullQuiz.duration_minutes || 30) * 60;
      const startedAtMs = attempt?.started_at ? new Date(attempt.started_at).getTime() : Date.now();
      const elapsedSeconds = Math.max(0, Math.floor((Date.now() - startedAtMs) / 1000));
      const remaining = Math.max(0, totalAllowedSeconds - elapsedSeconds);

      setSecondsLeft(remaining);
      setIsExamLocked(remaining <= 0);

      setTakingQuiz(fullQuiz);
      setShowInlineFile(fullQuiz.attachments && fullQuiz.attachments.length > 0);
      setStudentAnswers(attempt?.answers_data?.submitted_answers || {});
      setStudentFiles(attempt?.answers_data?.student_files || []);
      setStudentNote(attempt?.answers_data?.student_note || '');
      setAttemptResult(attempt?.completed_at ? attempt : null);
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.message || 'خطا در ورود به آزمون');
    }
  };

  const handleStudentFileUpload = async (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setStudentUploading(true);
    const formData = new FormData();
    for (let i = 0; i < files.length; i++) {
      formData.append('files', files[i]);
    }
    try {
      const res = await api.post('/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const uploaded = res.data.data.files || [res.data.data.file];
      setStudentFiles((prev) => [...prev, ...uploaded]);
      toast.success(`${uploaded.length} فایل پاسخنامه ضمیمه شد`);
    } catch (err) {
      toast.error('خطا در بارگذاری برگه پاسخنامه');
    } finally {
      setStudentUploading(false);
    }
  };

  const removeStudentFile = (idx) => {
    setStudentFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSubmitAttempt = async (isAuto = false) => {
    if (!takingQuiz) return;
    setSubmittingAttempt(true);
    try {
      const payload = {
        answers: studentAnswers,
        files: studentFiles,
        note: studentNote,
        auto_submitted: isAuto,
      };
      const res = await api.post(`/classes/${takingQuiz.class_id}/quizzes/${takingQuiz.id}/submit`, payload);
      setAttemptResult(res.data.data.result);
      setIsExamLocked(true);
      if (isAuto) {
        toast.success('زمان آزمون به پایان رسید و پاسخنامه شما به صورت خودکار نهایی شد.');
      } else {
        toast.success('پاسخنامه شما با موفقیت ثبت و تحویل شد! 🎉');
      }
      fetchQuizzes();
    } catch (err) {
      toast.error(err.response?.data?.message || 'خطا در ارسال پاسخنامه');
    } finally {
      setSubmittingAttempt(false);
    }
  };

  const handleOpenResults = async (quiz, isRefresh = false) => {
    if (isRefresh) setRefreshingList(true);
    else setLoadingResults(true);
    try {
      const res = await api.get(`/classes/${quiz.class_id}/quizzes/${quiz.id}`);
      setResultsQuiz(res.data.data.quiz);
      if (isRefresh) {
        toast.success('لیست شرکت‌کنندگان و ساعت‌های ورود بروزرسانی شد 🔄');
      }
    } catch (err) {
      toast.error('خطا در بارگذاری لیست شرکت‌کنندگان');
    } finally {
      setLoadingResults(false);
      setRefreshingList(false);
    }
  };

  const filteredQuizzes = quizzes.filter((q) => {
    if (selectedClassFilter === 'all') return true;
    return q.class_id === selectedClassFilter;
  });

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>
            {isParent ? 'امتحانات و آزمون‌های فرزند' : 'آزمون‌ها و کوییزهای آنلاین'}
          </h1>
          <p className={styles.subtitle}>
            {isParent
              ? 'مشاهده تاریخ برگزاری آزمون‌ها، بودجه‌بندی سوالات و کارنامه نمرات ثبت‌شده فرزند'
              : isTeacher
              ? 'طراحی آزمون‌های زمان‌دار تستی و بارگذاری برگه سوالات امتحانی، تصحیح هوشمند و کارنامه آنی'
              : 'شرکت آنلاین در آزمون‌های زمان‌دار، مشاهده فایل سوالات و تحویل پاسخنامه در موعد مقرر'}
          </p>
        </div>

        {isTeacher && (
          <button className="btn btn-primary" onClick={handleOpenCreateModal}>
            <HiOutlinePlus />
            <span>طراحی آزمون آنلاین با فایل سوالات</span>
          </button>
        )}
      </div>

      {/* Admin Notice */}
      {isAdmin && (
        <div
          style={{
            background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.12) 0%, rgba(99, 102, 241, 0.08) 100%)',
            border: '1.5px solid rgba(245, 158, 11, 0.35)',
            borderRadius: 'var(--radius-xl)',
            padding: '16px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '14px',
            flexWrap: 'wrap',
            marginBottom: '16px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '1.5rem' }}>ℹ️</span>
            <div>
              <div style={{ fontWeight: 800, color: 'var(--text-primary)' }}>
                بخش طراحی و برگزاری کوییز ویژه دبیران و دانش‌آموزان است
              </div>
              <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                جهت نظارت بر ریزنمرات، کارنامه‌ها و وضعیت تحصیلی کل مدرسه، به ستاد مدیریت یا دفتر نمرات مراجعه فرمایید.
              </div>
            </div>
          </div>
          <Link href="/dashboard/management" className="btn btn-secondary btn-sm" style={{ fontWeight: 700 }}>
            <span>بازگشت به ستاد مدیریت مدرسه ←</span>
          </Link>
        </div>
      )}

      {/* Filter by class / grade */}
      <div style={{ display: 'flex', justifyContent: 'flex-start', alignItems: 'center' }}>
        <select
          className="input"
          style={{ maxWidth: '300px' }}
          value={selectedClassFilter}
          onChange={(e) => setSelectedClassFilter(e.target.value)}
        >
          <option value="all">همه کلاس‌ها و پایه‌ها ({quizzes.length} آزمون)</option>
          {uniqueGrades.map((grade) => (
            <optgroup key={grade} label={`🎓 ${grade}`}>
              {classes
                .filter((c) => c.grade === grade)
                .map((cls) => (
                  <option key={cls.id} value={cls.id}>
                    {cls.name} — {cls.subject}
                  </option>
                ))}
            </optgroup>
          ))}
          {classes.some((c) => !c.grade) && (
            <optgroup label="سایر کلاس‌ها">
              {classes
                .filter((c) => !c.grade)
                .map((cls) => (
                  <option key={cls.id} value={cls.id}>
                    {cls.name} — {cls.subject}
                  </option>
                ))}
            </optgroup>
          )}
        </select>
      </div>

      {/* Quizzes List */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px 0' }}>
          <div className="spinner" style={{ margin: '0 auto' }}></div>
          <p style={{ marginTop: '12px', color: 'var(--text-tertiary)' }}>در حال بارگذاری آزمون‌ها...</p>
        </div>
      ) : filteredQuizzes.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', background: 'var(--bg-card)', borderRadius: 'var(--radius-xl)' }}>
          <div style={{ fontSize: '3rem', marginBottom: '12px' }}>📝</div>
          <h3>هیچ آزمونی یافت نشد</h3>
          <p style={{ color: 'var(--text-tertiary)', marginTop: '6px' }}>
            {isTeacher ? 'می‌توانید اولین آزمون یا کوییز را طراحی کنید' : 'در حال حاضر آزمونی برای این بخش تعریف نشده است'}
          </p>
        </div>
      ) : (
        <div className={styles.quizGrid}>
          {filteredQuizzes.map((quiz) => {
            const hasAttachments = quiz.attachments && quiz.attachments.length > 0;
            const isCompleted = isStudent && !!quiz.attempt?.completed_at;

            return (
              <div key={quiz.id} className={styles.quizCard}>
                <div className={styles.cardTop}>
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <span className={styles.classBadge}>
                      🏫 {quiz.class_name || 'کلاس'}
                    </span>
                    {quiz.class_grade && (
                      <span className={styles.gradeBadgeHighlight}>
                        🎓 {quiz.class_grade}
                      </span>
                    )}
                  </div>
                  <span style={{ fontSize: '0.75rem', color: '#059669', background: '#ecfdf5', padding: '3px 8px', borderRadius: '12px', fontWeight: 700 }}>
                    {isCompleted ? 'تحویل داده شده' : 'آزمون فعال'}
                  </span>
                </div>

                <div>
                  <h3 className={styles.quizTitle}>{quiz.title}</h3>
                  {quiz.description && (
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '4px', lineHeight: 1.45 }}>
                      {quiz.description}
                    </p>
                  )}
                </div>

                <div className={styles.metaRow}>
                  <div className={styles.metaItem}>
                    <HiOutlineClock style={{ color: '#6366f1' }} />
                    <span>مدت زمان: {quiz.duration_minutes} دقیقه</span>
                  </div>
                  {quiz.questions_count > 0 && (
                    <div className={styles.metaItem}>
                      <HiOutlineQuestionMarkCircle style={{ color: '#06b6d4' }} />
                      <span>{quiz.questions_count} سوال تستی</span>
                    </div>
                  )}
                  {hasAttachments && (
                    <div className={styles.metaItem} style={{ color: '#10b981', fontWeight: 650 }}>
                      <HiOutlineDocumentArrowDown />
                      <span>دارای برگه سوالات امتحانی ({quiz.attachments.length} فایل)</span>
                    </div>
                  )}
                </div>

                {/* Parent status: child score or upcoming */}
                {isParent && (
                  <div
                    style={{
                      background: quiz.attempt ? 'rgba(16, 185, 129, 0.12)' : 'rgba(245, 158, 11, 0.12)',
                      padding: '10px 14px',
                      borderRadius: 'var(--radius-lg)',
                      fontSize: '0.875rem',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      border: quiz.attempt ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(245, 158, 11, 0.3)',
                    }}
                  >
                    <span style={{ fontWeight: 600 }}>وضعیت شرکت فرزند:</span>
                    <strong style={{ color: quiz.attempt ? '#10b981' : '#f59e0b' }}>
                      {quiz.attempt
                        ? `نمره کسب شده: ${quiz.attempt.score} از ${quiz.attempt.total_points || 20} 🏆`
                        : 'در انتظار شرکت فرزند (آزمون دانش‌آموزی) ⏱️'}
                    </strong>
                  </div>
                )}

                {/* Student status */}
                {isStudent && (
                  <div
                    style={{
                      background: isCompleted ? 'rgba(16, 185, 129, 0.1)' : 'var(--bg-hover)',
                      padding: '10px 14px',
                      borderRadius: 'var(--radius-lg)',
                      fontSize: '0.8125rem',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <span>وضعیت شما:</span>
                    <strong style={{ color: isCompleted ? '#059669' : '#6366f1' }}>
                      {isCompleted
                        ? quiz.questions_count > 0
                          ? `نمره: ${quiz.attempt.score} از ${quiz.attempt.total_points}`
                          : 'پاسخنامه تحویل داده شد (در انتظار نمره دبیر)'
                        : 'آماده شرکت در آزمون آنلاین'}
                    </strong>
                  </div>
                )}

                <div className={styles.cardFooter}>
                  {isParent ? (
                    <Link
                      href="/dashboard/messages"
                      className="btn btn-secondary btn-sm"
                      style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                    >
                      <HiOutlineChatBubbleLeftRight />
                      <span>گفتگو با دبیر این درس</span>
                    </Link>
                  ) : isTeacher ? (
                    <button
                      className="btn btn-secondary btn-sm"
                      style={{ width: '100%' }}
                      onClick={() => handleOpenResults(quiz)}
                    >
                      <HiOutlineUserGroup style={{ color: '#6366f1', fontSize: '1.1rem' }} />
                      <span>لیست شرکت‌کنندگان و ساعت ورود ({quiz.attempts_count || 0})</span>
                    </button>
                  ) : (
                    <button
                      className={`btn btn-sm ${isCompleted ? 'btn-secondary' : 'btn-primary'}`}
                      style={{ width: '100%' }}
                      onClick={() => handleStartTakingQuiz(quiz)}
                    >
                      {isCompleted ? (
                        <>
                          <HiOutlineDocumentCheck />
                          <span>مشاهده وضعیت آزمون ثبت‌شده</span>
                        </>
                      ) : (
                        <>
                          <HiOutlinePlay />
                          <span>ورود به جلسه آزمون آنلاین</span>
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal: Create Quiz (Teacher) */}
      {showCreateModal && (
        <div className={styles.modalBackdrop} onClick={() => setShowCreateModal(false)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2>طراحی آزمون آنلاین با فایل سوالات</h2>
              <button className={styles.closeBtn} onClick={() => setShowCreateModal(false)}>
                &times;
              </button>
            </div>

            <form onSubmit={handleCreateQuiz} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* انتخاب ۲ مرحله‌ای: پایه تحصیلی و کلاس مقصد */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '14px' }}>
                {/* مرحله ۱: پایه تحصیلی */}
                <div className={styles.formGroup} style={{ marginBottom: 0 }}>
                  <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.84rem', fontWeight: 750 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <HiOutlineAcademicCap style={{ color: '#6366f1', fontSize: '1.15rem' }} />
                      <span>۱. پایه تحصیلی *</span>
                    </span>
                    {selectedGrade === 'custom' && (
                      <span style={{ fontSize: '0.72rem', color: '#6366f1', fontWeight: 600 }}>
                        ورود دستی
                      </span>
                    )}
                  </label>
                  <select
                    className="input"
                    value={selectedGrade}
                    onChange={(e) => handleGradeChange(e.target.value)}
                  >
                    <option value="all">همه پایه‌ها ({classes.length} کلاس)</option>
                    {uniqueGrades.map((g) => {
                      const count = classes.filter((c) => c.grade === g).length;
                      return (
                        <option key={g} value={g}>
                          {g} ({count} کلاس)
                        </option>
                      );
                    })}
                    <option value="custom">✏️ موارد دیگر (ورود دستی پایه تحصیلی)...</option>
                  </select>

                  {selectedGrade === 'custom' && (
                    <div style={{ marginTop: '8px' }}>
                      <input
                        type="text"
                        className="input"
                        placeholder="نام پایه مورد نظر (مثلاً: پایه نهم، یازدهم تجربی، کنکور...)"
                        value={customGrade}
                        onChange={(e) => setCustomGrade(e.target.value)}
                        required
                        autoFocus
                      />
                    </div>
                  )}
                </div>

                {/* مرحله ۲: کلاس مقصد */}
                <div className={styles.formGroup} style={{ marginBottom: 0 }}>
                  <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.84rem', fontWeight: 750 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <HiOutlineUserGroup style={{ color: '#06b6d4', fontSize: '1.15rem' }} />
                      <span>۲. کلاس مقصد *</span>
                    </span>
                    {createForm.class_id === 'custom' && (
                      <span style={{ fontSize: '0.72rem', color: '#06b6d4', fontWeight: 600 }}>
                        کلاس دستی جدید
                      </span>
                    )}
                  </label>
                  <select
                    className="input"
                    value={createForm.class_id}
                    onChange={(e) => handleClassChange(e.target.value)}
                    required
                  >
                    {filteredClassesForCreate.map((cls) => (
                      <option key={cls.id} value={cls.id}>
                        {cls.name} — {cls.subject} {cls.grade && selectedGrade === 'all' ? `[${cls.grade}]` : ''}
                      </option>
                    ))}
                    <option value="custom">✏️ موارد دیگر (تعریف دستی نام کلاس جدید)...</option>
                  </select>

                  {createForm.class_id === 'custom' && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '8px' }}>
                      <input
                        type="text"
                        className="input"
                        placeholder="نام کلاس جدید (مثلاً: کلاس ۲۰۵ یا المپیاد)"
                        value={customClassName}
                        onChange={(e) => setCustomClassName(e.target.value)}
                        required
                        autoFocus
                      />
                      <input
                        type="text"
                        className="input"
                        placeholder="عنوان درس (مثلاً: ریاضی پیشرفته)"
                        value={customClassSubject}
                        onChange={(e) => setCustomClassSubject(e.target.value)}
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* 👥 اعضای متصل به این کلاس و پایه */}
              {createForm.class_id === 'custom' ? (
                <div className={styles.classMembersBox} style={{ borderStyle: 'dashed', borderColor: '#6366f1' }}>
                  <div className={styles.classMembersHeader}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <HiOutlineUserGroup style={{ color: '#6366f1', fontSize: '1.15rem' }} />
                      <span>کلاس دستی جدید جهت برگزاری آزمون:</span>
                      <span className={styles.gradeBadgeHighlight}>
                        🎓 {selectedGrade === 'custom' ? (customGrade || 'پایه دستی جدید') : selectedGrade}
                      </span>
                      {customClassName && (
                        <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                          ({customClassName})
                        </span>
                      )}
                    </div>
                    <span className={styles.classMembersCountBadge}>
                      ✨ ایجاد خودکار کلاس
                    </span>
                  </div>

                  <div className={styles.targetAudienceNotice}>
                    <HiOutlineAcademicCap style={{ color: '#6366f1', fontSize: '1.25rem', flexShrink: 0 }} />
                    <span>
                      این آزمون منحصراً برای دانش‌آموزان همین پایه ({selectedGrade === 'custom' ? (customGrade || 'تعریف‌نشده') : selectedGrade}) و کلاس جدید ثبت خواهد شد.
                    </span>
                  </div>
                </div>
              ) : classes.find((c) => c.id === createForm.class_id) && (() => {
                const selectedClassObj = classes.find((c) => c.id === createForm.class_id);
                return (
                  <div className={styles.classMembersBox}>
                    <div className={styles.classMembersHeader}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <HiOutlineUserGroup style={{ color: '#6366f1', fontSize: '1.15rem' }} />
                        <span>دانش‌آموزان دریافت‌کننده آزمون:</span>
                        {selectedClassObj?.grade && (
                          <span className={styles.gradeBadgeHighlight}>
                            🎓 {selectedClassObj.grade}
                          </span>
                        )}
                        <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                          ({selectedClassObj?.name})
                        </span>
                      </div>
                      <span className={styles.classMembersCountBadge}>
                        {loadingMembers
                          ? 'در حال استعلام...'
                          : `${selectedClassMembers.length} دانش‌آموز عضو`}
                      </span>
                    </div>

                    {loadingMembers ? (
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)', padding: '6px 0' }}>
                        در حال بارگذاری اسامی دانش‌آموزان این کلاس...
                      </div>
                    ) : selectedClassMembers.length > 0 ? (
                      <div className={styles.classMembersGrid}>
                        {selectedClassMembers.map((member) => (
                          <div key={member.id || member.user_id} className={styles.classMemberChip}>
                            <div className={styles.classMemberAvatar}>
                              {(member.display_name || member.name || 'د').charAt(0)}
                            </div>
                            <span>{member.display_name || member.name}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)', fontStyle: 'italic', padding: '4px 0' }}>
                        هنوز دانش‌آموزی در این کلاس ثبت نام نشده است.
                      </div>
                    )}

                    <div className={styles.targetAudienceNotice}>
                      <HiOutlineAcademicCap style={{ color: '#6366f1', fontSize: '1.25rem', flexShrink: 0 }} />
                      <span>
                        این آزمون منحصراً برای دانش‌آموزان همین پایه ({selectedClassObj?.grade || 'انتخابی'}) در {selectedClassObj?.name} قابل مشاهده خواهد بود.
                      </span>
                    </div>
                  </div>
                );
              })()}

              <div>
                <label style={{ fontSize: '0.875rem', fontWeight: 600 }}>عنوان آزمون *</label>
                <input
                  type="text"
                  className="input"
                  placeholder="مثلاً: کوئیز جامع فصل ۲ فیزیک یا امتحان میان‌ترم ریاضی"
                  value={createForm.title}
                  onChange={(e) => setCreateForm({ ...createForm, title: e.target.value })}
                  required
                />
              </div>

              <div>
                <label style={{ fontSize: '0.875rem', fontWeight: 600 }}>توضیحات و دستورالعمل آزمون</label>
                <textarea
                  className="input"
                  rows={2}
                  placeholder="نکات ضروری، شیوه پاسخ‌دهی و قوانین جلسه..."
                  value={createForm.description}
                  onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
                />
              </div>

              {/* 📄 بارگذاری فایل برگه امتحانی (PDF / تصویر سوالات) */}
              <div>
                <label style={{ fontSize: '0.875rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <HiOutlinePaperClip style={{ color: '#6366f1' }} />
                  <span>آپلود فایل برگه سوالات آزمون (PDF، تصویر یا Word)</span>
                </label>
                <input
                  type="file"
                  ref={teacherFileInputRef}
                  style={{ display: 'none' }}
                  multiple
                  onChange={handleTeacherFileUpload}
                />
                <div
                  className={styles.uploadDropzone}
                  onClick={() => teacherFileInputRef.current?.click()}
                  style={{ marginTop: '6px' }}
                >
                  <HiOutlineDocumentText className={styles.dropzoneIcon} />
                  <div>
                    <strong>برای بارگذاری برگه سوالات کلیک کنید</strong>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginTop: '2px' }}>
                      دانش‌آموز به محض ورود آنلاین به آزمون، این فایل را مشاهده کرده و بر اساس زمان تعیین‌شده امتحان بسته می‌شود.
                    </p>
                  </div>
                </div>

                {teacherUploading && (
                  <p style={{ fontSize: '0.8125rem', color: 'var(--primary-500)', marginTop: '6px' }}>
                    در حال بارگذاری فایل...
                  </p>
                )}

                {createForm.attachments.length > 0 && (
                  <div className={styles.attachmentList}>
                    {createForm.attachments.map((att, i) => (
                      <div key={i} className={styles.attachmentChip}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <HiOutlineDocumentText style={{ color: '#38bdf8', fontSize: '1.25rem' }} />
                          <span>{att.originalname}</span>
                          <span style={{ fontSize: '0.6875rem', color: 'var(--text-tertiary)' }}>
                            ({Math.round((att.size || 0) / 1024)} KB)
                          </span>
                        </div>
                        <HiOutlineXMark
                          style={{ cursor: 'pointer', color: '#ef4444' }}
                          onClick={() => removeTeacherAttachment(i)}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* زمان آزمون و پریست‌ها */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label style={{ fontSize: '0.875rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <HiOutlineClock style={{ color: '#f59e0b' }} />
                    <span>مدت زمان آزمون (دقیقه) - پس از این زمان آزمون خودکار بسته می‌شود</span>
                  </label>
                  <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#6366f1' }}>
                    {createForm.duration_minutes} دقیقه
                  </span>
                </div>
                <input
                  type="number"
                  min="1"
                  max="360"
                  className="input"
                  style={{ marginTop: '6px' }}
                  value={createForm.duration_minutes}
                  onChange={(e) => setCreateForm({ ...createForm, duration_minutes: e.target.value })}
                  required
                />
                <div className={styles.durationPresetsRow}>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', alignSelf: 'center' }}>
                    انتخاب سریع:
                  </span>
                  {[15, 30, 45, 60, 90, 120].map((mins) => (
                    <button
                      key={mins}
                      type="button"
                      className={styles.durationPresetBtn}
                      onClick={() => setCreateForm((prev) => ({ ...prev, duration_minutes: mins }))}
                    >
                      {mins} دقیقه
                    </button>
                  ))}
                </div>
              </div>

              {/* گزینه نمره منفی */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  background: 'rgba(99, 102, 241, 0.08)',
                  border: '1px solid rgba(99, 102, 241, 0.25)',
                  padding: '12px 16px',
                  borderRadius: 'var(--radius-xl)',
                  cursor: 'pointer',
                }}
                onClick={() => setCreateForm({ ...createForm, has_negative_marking: !createForm.has_negative_marking })}
              >
                <input
                  type="checkbox"
                  id="has_negative_marking"
                  checked={createForm.has_negative_marking}
                  onChange={(e) => setCreateForm({ ...createForm, has_negative_marking: e.target.checked })}
                  onClick={(e) => e.stopPropagation()}
                />
                <div>
                  <label htmlFor="has_negative_marking" style={{ fontSize: '0.875rem', fontWeight: 700, cursor: 'pointer', display: 'block' }}>
                    اعمال نمره منفی آزمون (استاندارد سازمان سنجش)
                  </label>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                    هر ۳ پاسخ غلط ۱ پاسخ درست را باطل می‌کند و درصد تراز طبق استاندارد سازمان سنجش محاسبه می‌شود.
                  </span>
                </div>
              </div>

              {/* بخش اختیاری: سوالات ۴ گزینه‌ای آنلاین */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <div>
                    <h3 style={{ fontSize: '0.95rem', fontWeight: 700 }}>
                      سوالات چندگزینه‌ای آنلاین (اختیاری)
                    </h3>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                      در صورت آپلود برگه سوالات، نیازی به تایپ مجدد سوالات نیست؛ اما می‌توانید سوالات تستی آنلاین نیز اضافه کنید.
                    </span>
                  </div>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={handleAddQuestion}>
                    <HiOutlinePlus />
                    <span>افزودن سوال تستی</span>
                  </button>
                </div>

                {createForm.questions.map((q, qIndex) => (
                  <div key={qIndex} className={styles.questionBuilderCard}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <strong style={{ fontSize: '0.875rem' }}>سوال شماره {qIndex + 1}</strong>
                      <button
                        type="button"
                        style={{ color: '#ef4444', background: 'transparent', border: 'none', cursor: 'pointer' }}
                        onClick={() => handleRemoveQuestion(qIndex)}
                        title="حذف این سوال"
                      >
                        <HiOutlineTrash />
                      </button>
                    </div>

                    {/* صورت سوال: متن + بارگذاری عکس سوال */}
                    <div className={styles.questionStemWrapper}>
                      <div className={styles.questionStemInputRow}>
                        <input
                          type="text"
                          className="input"
                          style={{ flex: 1 }}
                          placeholder="متن صورت سوال (یا در صورت داشتن عکس، می‌توانید متن را خالی بگذارید)..."
                          value={q.question_text}
                          onChange={(e) => {
                            const updated = [...createForm.questions];
                            updated[qIndex].question_text = e.target.value;
                            setCreateForm({ ...createForm, questions: updated });
                          }}
                        />

                        {/* اینپوت مخفی فایل عکس صورت سوال */}
                        <input
                          type="file"
                          id={`q_img_input_${qIndex}`}
                          accept="image/*"
                          style={{ display: 'none' }}
                          onChange={(e) => {
                            if (e.target.files?.[0]) {
                              handleQuestionImageUpload(qIndex, e.target.files[0]);
                              e.target.value = '';
                            }
                          }}
                        />

                        <button
                          type="button"
                          className={styles.questionImageUploadBtn}
                          onClick={() => document.getElementById(`q_img_input_${qIndex}`)?.click()}
                          title="افزودن عکس برای صورت سوال (فرمول، نمودار یا هندسه)"
                        >
                          <HiOutlinePhoto style={{ fontSize: '1.15rem' }} />
                          <span>{q.question_image_url ? 'تغییر عکس سوال' : 'افزودن عکس سوال'}</span>
                        </button>
                      </div>

                      {/* پیش‌نمایش تصویر صورت سوال */}
                      {q.question_image_url && (
                        <div className={styles.questionImagePreviewCard}>
                          <img
                            src={getFullFileUrl(q.question_image_url)}
                            alt={`تصویر سوال ${qIndex + 1}`}
                            className={styles.questionImageThumbnail}
                            onClick={() => setLightboxImage(getFullFileUrl(q.question_image_url))}
                            title="کلیک برای مشاهده بزرگنمایی تصویر"
                          />
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                            <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                              🖼️ عکس صورت سوال پیوست شد
                            </span>
                            <span style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>
                              برای مشاهده بزرگنمایی، روی تصویر کلیک کنید
                            </span>
                          </div>
                          <button
                            type="button"
                            className={styles.questionImageRemoveBtn}
                            onClick={() => removeQuestionImage(qIndex)}
                            title="حذف عکس این سوال"
                          >
                            <HiOutlineTrash />
                            <span>حذف عکس</span>
                          </button>
                        </div>
                      )}
                    </div>

                    {/* گزینه‌های سوال: متن + عکس گزینه‌ها */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <label style={{ fontSize: '0.8125rem', color: 'var(--text-tertiary)' }}>
                        گزینه‌ها را وارد کنید (می‌توانید برای هر گزینه متن، عکس یا هر دو را تعیین فرمایید):
                      </label>
                      {['الف', 'ب', 'ج', 'د'].map((label, optIndex) => {
                        const opt = q.options[optIndex];
                        const optText = typeof opt === 'string' ? opt : (opt?.text || '');
                        const optImg = typeof opt === 'object' ? (opt?.image_url || '') : '';

                        return (
                          <div key={optIndex} className={styles.optionInputRowCustom}>
                            <input
                              type="radio"
                              name={`correct_${qIndex}`}
                              checked={q.correct_option === String(optIndex)}
                              onChange={() => {
                                const updated = [...createForm.questions];
                                updated[qIndex].correct_option = String(optIndex);
                                setCreateForm({ ...createForm, questions: updated });
                              }}
                              title="انتخاب به عنوان گزینه صحیح"
                            />
                            <span style={{ fontSize: '0.85rem', width: '22px', fontWeight: 700 }}>{label})</span>
                            <input
                              type="text"
                              className="input"
                              style={{ flex: 1, minWidth: '140px', padding: '6px 10px', fontSize: '0.85rem' }}
                              placeholder={`متن گزینه ${label} (اختیاری در صورت انتخاب تصویر)...`}
                              value={optText}
                              onChange={(e) => handleOptionTextChange(qIndex, optIndex, e.target.value)}
                            />

                            {/* اینپوت مخفی فایل عکس این گزینه */}
                            <input
                              type="file"
                              id={`opt_img_${qIndex}_${optIndex}`}
                              accept="image/*"
                              style={{ display: 'none' }}
                              onChange={(e) => {
                                if (e.target.files?.[0]) {
                                  handleOptionImageUpload(qIndex, optIndex, e.target.files[0]);
                                  e.target.value = '';
                                }
                              }}
                            />

                            {optImg ? (
                              <div className={styles.optionImagePreviewBox}>
                                <img
                                  src={getFullFileUrl(optImg)}
                                  alt={`گزینه ${label}`}
                                  className={styles.optionImageThumbnail}
                                  onClick={() => setLightboxImage(getFullFileUrl(optImg))}
                                  title="کلیک برای بزرگنمایی تصویر گزینه"
                                />
                                <button
                                  type="button"
                                  className={styles.optionImageRemoveBtn}
                                  onClick={() => removeOptionImage(qIndex, optIndex)}
                                  title="حذف عکس این گزینه"
                                >
                                  &times;
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                className={styles.optionImageUploadBtn}
                                onClick={() => document.getElementById(`opt_img_${qIndex}_${optIndex}`)?.click()}
                                title={`افزودن تصویر برای گزینه ${label}`}
                              >
                                <HiOutlinePhoto />
                                <span>عکس گزینه</span>
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
                <button type="submit" className="btn btn-primary" disabled={submittingQuiz}>
                  {submittingQuiz ? 'در حال انتشار...' : 'انتشار و فعال‌سازی آزمون'}
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => setShowCreateModal(false)}>
                  انصراف
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Taking Online Exam (Student Screen) */}
      {takingQuiz && (
        <div className={styles.modalBackdrop}>
          <div className={styles.modalContent} style={{ maxWidth: '850px' }}>
            {/* Sticky Live Timer Header */}
            <div className={styles.liveExamHeader}>
              <div>
                <h2 style={{ fontSize: '1.25rem', margin: 0 }}>{takingQuiz.title}</h2>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px', fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>
                  <span>کلاس: {takingQuiz.class_name}</span>
                  {takingQuiz.class_grade && <span>({takingQuiz.class_grade})</span>}
                  <span>• مدت آزمون: {takingQuiz.duration_minutes} دقیقه</span>
                </div>
              </div>

              {!attemptResult && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div
                    className={`${styles.timerBox} ${
                      isExamLocked
                        ? styles.timerUrgent
                        : secondsLeft <= 120
                        ? styles.timerUrgent
                        : secondsLeft <= 600
                        ? styles.timerWarning
                        : styles.timerNormal
                    }`}
                  >
                    <HiOutlineClock />
                    <span>
                      {isExamLocked ? '00:00 (پایان موعد)' : formatTimer(secondsLeft)}
                    </span>
                  </div>

                  <button className={styles.closeBtn} onClick={() => setTakingQuiz(null)} title="بستن">
                    &times;
                  </button>
                </div>
              )}
            </div>

            {/* Locked Warning Banner */}
            {isExamLocked && !attemptResult && (
              <div className={styles.lockedExamBanner}>
                <HiOutlineLockClosed style={{ fontSize: '1.35rem', flexShrink: 0 }} />
                <div>
                  <strong>زمان آزمون به پایان رسید!</strong> سیستم به صورت خودکار امتحان را بست و امکان ویرایش یا بارگذاری پاسخ جدید مسدود گردید.
                </div>
              </div>
            )}

            {attemptResult ? (
              <div style={{ textAlign: 'center', padding: '24px 0' }}>
                <div style={{ fontSize: '3.5rem' }}>🏆</div>
                <h2 style={{ color: '#10b981', marginTop: '6px' }}>پاسخنامه شما با موفقیت ثبت شد!</h2>

                <div
                  style={{
                    background: 'rgba(99, 102, 241, 0.1)',
                    border: '1px solid rgba(99, 102, 241, 0.3)',
                    padding: '20px',
                    borderRadius: 'var(--radius-2xl)',
                    margin: '20px 0',
                  }}
                >
                  <div style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                    {takingQuiz.questions && takingQuiz.questions.length > 0 ? (
                      `نمره کسب‌شده: ${attemptResult.score} از ${attemptResult.total_points}`
                    ) : (
                      'برگه پاسخنامه و فایل‌های ارسالی با موفقیت تحویل دبیر شد'
                    )}
                  </div>

                  {attemptResult.answers && typeof attemptResult.answers === 'string' && (
                    (() => {
                      try {
                        const parsed = JSON.parse(attemptResult.answers);
                        return (
                          <div style={{ marginTop: '12px' }}>
                            {parsed.auto_submitted && (
                              <div style={{ fontSize: '0.82rem', color: '#ef4444', marginBottom: '8px' }}>
                                ⏱️ ثبت خودکار پس از پایان زمان قانونی آزمون
                              </div>
                            )}
                            {parsed.percentage !== undefined && (
                              <div style={{ display: 'flex', justifyContent: 'center', gap: '16px', fontSize: '0.875rem' }}>
                                <span style={{ color: '#10b981' }}>درست: {parsed.correctCount}</span>
                                <span style={{ color: '#ef4444' }}>نادرست: {parsed.wrongCount}</span>
                                <span style={{ color: '#94a3b8' }}>نزده: {parsed.blankCount}</span>
                                <strong style={{ color: '#38bdf8' }}>تراز سنجشی: %{parsed.percentage}</strong>
                              </div>
                            )}
                            {parsed.student_files && parsed.student_files.length > 0 && (
                              <div style={{ marginTop: '12px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                تعداد برگه‌های پاسخ ارسالی: {parsed.student_files.length} فایل
                              </div>
                            )}
                          </div>
                        );
                      } catch (e) {
                        return null;
                      }
                    })()
                  )}
                </div>

                <div>
                  <button className="btn btn-primary" onClick={() => setTakingQuiz(null)}>
                    بستن و بازگشت به لیست آزمون‌ها
                  </button>
                </div>
              </div>
            ) : (
              <div>
                {/* 📄 نمایش آنلاین فایل سوالات آزمون دبیر */}
                {takingQuiz.attachments && takingQuiz.attachments.length > 0 && (
                  <div className={styles.examFileCard}>
                    <div className={styles.examFileHeader}>
                      <div>
                        <strong style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.95rem' }}>
                          <HiOutlineDocumentText style={{ color: '#6366f1', fontSize: '1.25rem' }} />
                          <span>برگه سوالات آزمون ({takingQuiz.attachments.length} فایل پیوست)</span>
                        </strong>
                        <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: '2px 0 0' }}>
                          سوالات را مطالعه کرده و پاسخ‌ها را در کادر زیر ثبت یا عکس پاسخنامه را آپلود کنید.
                        </p>
                      </div>

                      <div className={styles.examFileButtons}>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => setShowInlineFile(!showInlineFile)}
                        >
                          <HiOutlineEye />
                          <span>{showInlineFile ? 'پنهان کردن پیش‌نمایش' : 'مشاهده برگه در همین صفحه'}</span>
                        </button>
                        {takingQuiz.attachments.map((att, i) => (
                          <a
                            key={i}
                            href={getFullFileUrl(att.url)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn btn-primary btn-sm"
                          >
                            <HiOutlineDocumentArrowDown />
                            <span>دانلود / باز کردن {att.originalname || 'فایل'}</span>
                          </a>
                        ))}
                      </div>
                    </div>

                    {/* پیش‌نمایش داخل صفحه در صورت کلیک */}
                    {showInlineFile && takingQuiz.attachments[0] && (
                      <div style={{ marginTop: '8px', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-lg)', overflow: 'hidden', background: '#fff' }}>
                        {takingQuiz.attachments[0].url.endsWith('.pdf') ? (
                          <iframe
                            src={getFullFileUrl(takingQuiz.attachments[0].url)}
                            style={{ width: '100%', height: '480px', border: 'none' }}
                            title="پیش‌نمایش سوالات آزمون"
                          />
                        ) : (
                          <img
                            src={getFullFileUrl(takingQuiz.attachments[0].url)}
                            alt="برگه سوالات"
                            style={{ width: '100%', maxHeight: '550px', objectFit: 'contain' }}
                          />
                        )}
                      </div>
                    )}
                  </div>
                )}

                {takingQuiz.has_negative_marking && takingQuiz.questions?.length > 0 && (
                  <div
                    style={{
                      background: 'rgba(239, 68, 68, 0.1)',
                      border: '1px solid rgba(239, 68, 68, 0.25)',
                      padding: '10px 14px',
                      borderRadius: 'var(--radius-lg)',
                      marginBottom: '16px',
                      fontSize: '0.8125rem',
                      color: '#fca5a5',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                    }}
                  >
                    <span>⚠️</span>
                    <span><strong>قانون نمره منفی فعال است:</strong> هر ۳ پاسخ نادرست ۱ پاسخ درست را باطل می‌کند.</span>
                  </div>
                )}

                {/* سوالات تستی آنلاین (در صورت وجود) */}
                {takingQuiz.questions?.map((q, idx) => {
                  const anyOptionHasImage = q.options?.some((o) => typeof o === 'object' && o?.image_url);

                  return (
                    <div key={q.id} className={styles.quizQuestionBox}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <h4 style={{ fontSize: '1rem', fontWeight: 700, margin: 0 }}>
                          سوال {idx + 1} {q.question_text ? `: ${q.question_text}` : ''}
                        </h4>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', background: 'var(--bg-surface)', padding: '2px 8px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                          {q.points || 1} نمره
                        </span>
                      </div>

                      {/* عکس صورت سوال (در صورت وجود) */}
                      {q.question_image_url && (
                        <div className={styles.questionImageBox}>
                          <img
                            src={getFullFileUrl(q.question_image_url)}
                            alt={`تصویر سوال ${idx + 1}`}
                            className={styles.questionImageDisplay}
                            onClick={() => setLightboxImage(getFullFileUrl(q.question_image_url))}
                            title="کلیک برای بزرگنمایی تصویر سوال"
                          />
                          <span style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            <HiOutlineMagnifyingGlassPlus />
                            <span>برای مشاهده در ابعاد بزرگتر روی عکس کلیک کنید</span>
                          </span>
                        </div>
                      )}

                      {/* گزینه‌های سوال */}
                      <div className={anyOptionHasImage ? styles.optionsGridResponsive : styles.optionsListVertical}>
                        {q.options?.map((opt, optIdx) => {
                          const optText = typeof opt === 'string' ? opt : (opt?.text || '');
                          const optImg = typeof opt === 'object' ? (opt?.image_url || '') : '';
                          const isSelected = studentAnswers[q.id] === String(optIdx);

                          if (anyOptionHasImage || optImg) {
                            return (
                              <button
                                key={optIdx}
                                type="button"
                                disabled={isExamLocked}
                                className={`${styles.optionCardBtn} ${isSelected ? styles.optionSelected : ''}`}
                                onClick={() => setStudentAnswers({ ...studentAnswers, [q.id]: String(optIdx) })}
                              >
                                <div className={styles.optionCardHeader}>
                                  <span style={{
                                    width: '24px',
                                    height: '24px',
                                    borderRadius: '50%',
                                    background: isSelected ? 'var(--primary-500)' : 'var(--bg-hover)',
                                    color: isSelected ? '#fff' : 'var(--text-primary)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: '0.78rem',
                                    fontWeight: 700,
                                    flexShrink: 0,
                                  }}>
                                    {['الف', 'ب', 'ج', 'د'][optIdx]}
                                  </span>
                                  {optText && <span style={{ flex: 1, textAlign: 'right' }}>{optText}</span>}
                                </div>

                                {optImg && (
                                  <img
                                    src={getFullFileUrl(optImg)}
                                    alt={`گزینه ${['الف', 'ب', 'ج', 'د'][optIdx]}`}
                                    className={styles.optionImageDisplay}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setLightboxImage(getFullFileUrl(optImg));
                                    }}
                                    title="کلیک برای مشاهده بزرگنمایی تصویر این گزینه"
                                  />
                                )}
                              </button>
                            );
                          }

                          return (
                            <button
                              key={optIdx}
                              type="button"
                              disabled={isExamLocked}
                              className={`${styles.optionSelectBtn} ${isSelected ? styles.optionSelected : ''}`}
                              onClick={() => setStudentAnswers({ ...studentAnswers, [q.id]: String(optIdx) })}
                            >
                              <span style={{ fontWeight: 700 }}>{['الف', 'ب', 'ج', 'د'][optIdx]})</span>
                              <span>{optText}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}

                {/* 📝 بخش آپلود برگه پاسخنامه یا یادداشت تشریحی دانش‌آموز */}
                <div style={{ background: 'var(--bg-hover)', borderRadius: 'var(--radius-xl)', padding: '16px', border: '1px solid var(--border-color)', marginTop: '16px' }}>
                  <label style={{ fontSize: '0.875rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <HiOutlineArrowUpTray style={{ color: '#06b6d4' }} />
                    <span>آپلود عکس یا PDF پاسخنامه دست‌نویس دانش‌آموز (اختیاری/تشریحی)</span>
                  </label>

                  <input
                    type="file"
                    ref={studentFileInputRef}
                    style={{ display: 'none' }}
                    multiple
                    disabled={isExamLocked}
                    onChange={handleStudentFileUpload}
                  />

                  <div
                    className={styles.uploadDropzone}
                    style={{ marginTop: '8px', opacity: isExamLocked ? 0.5 : 1, cursor: isExamLocked ? 'not-allowed' : 'pointer' }}
                    onClick={() => {
                      if (!isExamLocked) studentFileInputRef.current?.click();
                    }}
                  >
                    <HiOutlineArrowUpTray className={styles.dropzoneIcon} />
                    <div>
                      <strong>{isExamLocked ? 'آپلود بسته شد' : 'برای بارگذاری فایل‌های پاسخنامه خود کلیک کنید'}</strong>
                      <p style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginTop: '2px' }}>
                        عکس‌های برگه پاسخنامه یا فایل PDF پاسخ‌های خود را اضافه کنید.
                      </p>
                    </div>
                  </div>

                  {studentUploading && (
                    <p style={{ fontSize: '0.8125rem', color: 'var(--primary-500)', marginTop: '6px' }}>
                      در حال بارگذاری فایل پاسخنامه...
                    </p>
                  )}

                  {studentFiles.length > 0 && (
                    <div className={styles.attachmentList}>
                      {studentFiles.map((file, i) => (
                        <div key={i} className={styles.attachmentChip}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <HiOutlineDocumentText style={{ color: '#06b6d4', fontSize: '1.25rem' }} />
                            <span>{file.originalname || `برگه پاسخنامه ${i + 1}`}</span>
                          </div>
                          {!isExamLocked && (
                            <HiOutlineXMark
                              style={{ cursor: 'pointer', color: '#ef4444' }}
                              onClick={() => removeStudentFile(i)}
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  <div style={{ marginTop: '12px' }}>
                    <label style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                      یادداشت یا پاسخ متنی تکمیلی:
                    </label>
                    <textarea
                      className="input"
                      rows={2}
                      disabled={isExamLocked}
                      placeholder="در صورت تمایل می‌توانید پاسخ‌های متنی یا یادداشت خود را اینجا بنویسید..."
                      value={studentNote}
                      onChange={(e) => setStudentNote(e.target.value)}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '12px', marginTop: '20px' }}>
                  <button
                    className="btn btn-primary"
                    style={{ flex: 1 }}
                    onClick={() => handleSubmitAttempt(false)}
                    disabled={submittingAttempt || isExamLocked}
                  >
                    {submittingAttempt
                      ? 'در حال تحویل و ثبت پاسخنامه...'
                      : isExamLocked
                      ? 'زمان آزمون تمام شده است (آزمون بسته شد)'
                      : 'ثبت نهایی و تحویل برگه آزمون'}
                  </button>
                  <button className="btn btn-secondary" onClick={() => setTakingQuiz(null)}>
                    بستن
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal: View Participants, Entry Times & Results (Teacher) */}
      {resultsQuiz && (() => {
        const enrolledStudents = resultsQuiz?.class_students || [];
        const attempts = resultsQuiz?.attempts || [];

        // Build unified roster
        const studentMap = new Map();

        // 1. Add enrolled students
        enrolledStudents.forEach((st) => {
          studentMap.set(st.student_id, {
            student_id: st.student_id,
            student_name: st.student_name,
            student_code: st.student_code,
            student_avatar: st.student_avatar,
            student_phone: st.student_phone,
            has_entered: false,
            attempt: null,
            status: 'not_started',
          });
        });

        // 2. Overlay attempts
        attempts.forEach((att) => {
          const existing = studentMap.get(att.student_id) || {
            student_id: att.student_id,
            student_name: att.student_name,
            student_code: att.student_code,
            student_avatar: att.student_avatar,
            student_phone: att.student_phone,
          };

          let status = 'active';
          const isCompleted = !!att.completed_at;
          const isAuto = !!att.answers_data?.auto_submitted;

          if (isCompleted) {
            status = isAuto ? 'auto_submitted' : 'completed';
          } else {
            const startMs = att.started_at ? new Date(att.started_at).getTime() : Date.now();
            const elapsedMinutes = Math.floor((Date.now() - startMs) / 60000);
            if (resultsQuiz.duration_minutes && elapsedMinutes >= resultsQuiz.duration_minutes + 2) {
              status = 'time_up';
            } else {
              status = 'active';
            }
          }

          studentMap.set(att.student_id, {
            ...existing,
            has_entered: true,
            attempt: att,
            status,
          });
        });

        const roster = Array.from(studentMap.values());
        const totalEnrolled = roster.length;
        const enteredCount = roster.filter((s) => s.has_entered).length;
        const activeCount = roster.filter((s) => s.status === 'active').length;
        const completedCount = roster.filter((s) => s.status === 'completed' || s.status === 'auto_submitted' || s.status === 'time_up').length;
        const notStartedCount = roster.filter((s) => !s.has_entered).length;

        const filteredRoster = roster.filter((s) => {
          if (participantFilter === 'entered') return s.has_entered;
          if (participantFilter === 'active') return s.status === 'active';
          if (participantFilter === 'completed') return s.status === 'completed' || s.status === 'auto_submitted' || s.status === 'time_up';
          if (participantFilter === 'not_started') return !s.has_entered;
          return true;
        });

        return (
          <div className={styles.modalBackdrop} onClick={() => setResultsQuiz(null)}>
            <div className={styles.modalContent} onClick={(e) => e.stopPropagation()} style={{ maxWidth: '850px' }}>
              {/* هدر مدال همراه با ساعت و دکمه‌های پرینت و استعلام لحظه‌ای */}
              <div className={styles.modalHeader}>
                <div>
                  <h2 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span>📋 لیست شرکت‌کنندگان و ساعت ورود:</span>
                    <span style={{ color: 'var(--primary-500)' }}>{resultsQuiz.title}</span>
                  </h2>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8125rem', color: 'var(--text-tertiary)', marginTop: '4px', flexWrap: 'wrap' }}>
                    <span>کلاس: <strong>{resultsQuiz.class_name}</strong></span>
                    {resultsQuiz.class_grade && <span>({resultsQuiz.class_grade})</span>}
                    <span>• مدت قانونی آزمون: <strong>{resultsQuiz.duration_minutes} دقیقه</strong></span>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <button
                    type="button"
                    className={styles.liveRefreshBtn}
                    onClick={() => handleOpenResults(resultsQuiz, true)}
                    disabled={refreshingList}
                    title="بروزرسانی لحظه‌ای ساعت ورود دانش‌آموزان"
                  >
                    <HiOutlineArrowPath className={refreshingList ? 'spin' : ''} />
                    <span>{refreshingList ? 'در حال استعلام...' : 'استعلام لحظه‌ای ورود 🔄'}</span>
                  </button>

                  <button
                    type="button"
                    className={styles.printReportBtn}
                    onClick={() => window.print()}
                    title="چاپ یا خروجی PDF لیست حضور و غیاب آزمون"
                  >
                    <HiOutlinePrinter />
                    <span>چاپ گزارش حضور 🖨️</span>
                  </button>

                  <button className={styles.closeBtn} onClick={() => setResultsQuiz(null)}>
                    &times;
                  </button>
                </div>
              </div>

              {/* نوار پایش زنده خودکار */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '10px 0 12px', background: 'rgba(99, 102, 241, 0.05)', padding: '8px 12px', borderRadius: 'var(--radius-lg)', border: '1px dashed rgba(99, 102, 241, 0.25)', flexWrap: 'wrap', gap: '6px' }}>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                  🕒 به محض اینکه هر دانش‌آموز وارد آزمون شود، زمان دقیق ورود (ثانیه، دقیقه و ساعت) در این لیست ثبت و قابل رویت است.
                </span>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', cursor: 'pointer', fontWeight: 650, color: liveMonitoring ? '#6366f1' : 'var(--text-tertiary)' }}>
                  <input
                    type="checkbox"
                    checked={liveMonitoring}
                    onChange={(e) => setLiveMonitoring(e.target.checked)}
                  />
                  <span>پایش زنده خودکار (هر ۱۲ ثانیه)</span>
                </label>
              </div>

              {/* کارت‌های خلاصه وضعیت و آمار لحظه‌ای */}
              <div className={styles.participantsSummaryGrid}>
                <div className={styles.participantSummaryCard}>
                  <span className={styles.participantSummaryNum}>{totalEnrolled}</span>
                  <span className={styles.participantSummaryTitle}>👥 کل اعضای کلاس</span>
                </div>
                <div className={styles.participantSummaryCard} style={{ borderColor: 'rgba(14, 165, 233, 0.4)' }}>
                  <span className={styles.participantSummaryNum} style={{ color: '#0284c7' }}>{enteredCount}</span>
                  <span className={styles.participantSummaryTitle}>🚪 کل واردشدگان به آزمون</span>
                </div>
                <div className={styles.participantSummaryCard} style={{ borderColor: 'rgba(16, 185, 129, 0.4)' }}>
                  <span className={styles.participantSummaryNum} style={{ color: '#059669' }}>{activeCount}</span>
                  <span className={styles.participantSummaryTitle}>🟢 در حال آزمون (آنلاین)</span>
                </div>
                <div className={styles.participantSummaryCard} style={{ borderColor: 'rgba(99, 102, 241, 0.4)' }}>
                  <span className={styles.participantSummaryNum} style={{ color: '#6366f1' }}>{completedCount}</span>
                  <span className={styles.participantSummaryTitle}>✅ پاسخنامه تحویل داده شده</span>
                </div>
                <div className={styles.participantSummaryCard} style={{ borderColor: 'rgba(239, 68, 68, 0.3)' }}>
                  <span className={styles.participantSummaryNum} style={{ color: '#ef4444' }}>{notStartedCount}</span>
                  <span className={styles.participantSummaryTitle}>⏳ هنوز وارد نشده (غایب)</span>
                </div>
              </div>

              {/* زبانه‌های فیلتر */}
              <div className={styles.participantFilterTabs}>
                <button
                  type="button"
                  className={`${styles.participantFilterTab} ${participantFilter === 'all' ? styles.participantFilterTabActive : ''}`}
                  onClick={() => setParticipantFilter('all')}
                >
                  <span>همه دانش‌آموزان</span>
                  <span className={styles.participantTabBadge}>{totalEnrolled}</span>
                </button>
                <button
                  type="button"
                  className={`${styles.participantFilterTab} ${participantFilter === 'entered' ? styles.participantFilterTabActive : ''}`}
                  onClick={() => setParticipantFilter('entered')}
                >
                  <span>واردشده‌ها (دارای ساعت ورود)</span>
                  <span className={styles.participantTabBadge}>{enteredCount}</span>
                </button>
                <button
                  type="button"
                  className={`${styles.participantFilterTab} ${participantFilter === 'active' ? styles.participantFilterTabActive : ''}`}
                  onClick={() => setParticipantFilter('active')}
                >
                  <span>🟢 در حال آزمون</span>
                  <span className={styles.participantTabBadge}>{activeCount}</span>
                </button>
                <button
                  type="button"
                  className={`${styles.participantFilterTab} ${participantFilter === 'completed' ? styles.participantFilterTabActive : ''}`}
                  onClick={() => setParticipantFilter('completed')}
                >
                  <span>✅ تحویل‌داده‌شده</span>
                  <span className={styles.participantTabBadge}>{completedCount}</span>
                </button>
                <button
                  type="button"
                  className={`${styles.participantFilterTab} ${participantFilter === 'not_started' ? styles.participantFilterTabActive : ''}`}
                  onClick={() => setParticipantFilter('not_started')}
                >
                  <span>⏳ غایب / هنوز وارد نشده</span>
                  <span className={styles.participantTabBadge}>{notStartedCount}</span>
                </button>
              </div>

              {/* لیست کارت‌های دانش‌آموزان */}
              {loadingResults ? (
                <div style={{ textAlign: 'center', padding: '30px 0' }}>
                  <div className="spinner" style={{ margin: '0 auto' }}></div>
                  <p style={{ marginTop: '10px', fontSize: '0.8125rem', color: 'var(--text-tertiary)' }}>در حال بارگذاری لیست شرکت‌کنندگان...</p>
                </div>
              ) : filteredRoster.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-tertiary)' }}>
                  دانش‌آموزی با این وضعیت یافت نشد.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '520px', overflowY: 'auto', paddingRight: '4px' }}>
                  {filteredRoster.map((student) => {
                    const att = student.attempt;
                    const answersData = att?.answers_data || {};
                    const studentFiles = answersData.student_files || [];

                    return (
                      <div key={student.student_id} className={styles.participantRowCard}>
                        <div className={styles.participantHeaderRow}>
                          <div className={styles.participantInfoBox}>
                            <div className="avatar">
                              {student.student_name?.charAt(0) || 'د'}
                            </div>
                            <div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <strong style={{ fontSize: '0.95rem' }}>{student.student_name}</strong>
                                {student.student_code && (
                                  <span style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', background: 'var(--bg-surface)', padding: '1px 6px', borderRadius: 'var(--radius-sm)' }}>
                                    کد: {student.student_code}
                                  </span>
                                )}
                              </div>
                              {student.student_phone && (
                                <span style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                                  <HiOutlinePhone style={{ fontSize: '0.8rem' }} />
                                  <span>{student.student_phone}</span>
                                </span>
                              )}
                            </div>
                          </div>

                          {/* نشانگر ساعت ورود و وضعیت فعلی */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            {student.has_entered ? (
                              <>
                                <div className={styles.entryTimeBadge}>
                                  <HiOutlineClock />
                                  <span>ساعت ورود: <strong>{formatPersianTime(att.started_at)}</strong></span>
                                </div>

                                {student.status === 'active' && (
                                  <span className={styles.statusBadgeActive}>
                                    🟢 در حال پاسخگویی به آزمون
                                  </span>
                                )}

                                {student.status === 'completed' && (
                                  <span className={styles.statusBadgeCompleted}>
                                    ✅ پاسخنامه تحویل داده شد
                                  </span>
                                )}

                                {student.status === 'auto_submitted' && (
                                  <span className={styles.statusBadgeAuto}>
                                    ⏱️ بسته شدن خودکار (پایان زمان)
                                  </span>
                                )}

                                {student.status === 'time_up' && (
                                  <span className={styles.statusBadgeAuto}>
                                    ⚠️ زمان آزمون سپری شده
                                  </span>
                                )}
                              </>
                            ) : (
                              <span className={styles.statusBadgeNotStarted}>
                                ⏳ هنوز وارد آزمون نشده (غایب)
                              </span>
                            )}

                            {/* نمره در صورت وجود سوالات تستی و ثبت پاسخنامه */}
                            {student.has_entered && resultsQuiz.questions && resultsQuiz.questions.length > 0 && att.completed_at && (
                              <span
                                style={{
                                  fontSize: '0.95rem',
                                  fontWeight: 800,
                                  padding: '3px 9px',
                                  borderRadius: 'var(--radius-md)',
                                  background: (att.score / (att.total_points || 1)) >= 0.5 ? 'rgba(5, 150, 105, 0.12)' : 'rgba(220, 38, 38, 0.12)',
                                  color: (att.score / (att.total_points || 1)) >= 0.5 ? '#059669' : '#dc2626',
                                  border: `1px solid ${(att.score / (att.total_points || 1)) >= 0.5 ? 'rgba(5, 150, 105, 0.25)' : 'rgba(220, 38, 38, 0.25)'}`,
                                }}
                              >
                                نمره: {att.score} از {att.total_points}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* جزئیات زمان‌بندی و برگه‌های ارسالی */}
                        {student.has_entered ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.78rem', color: 'var(--text-secondary)', background: 'var(--bg-surface)', padding: '10px 12px', borderRadius: 'var(--radius-lg)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                              <span>
                                📅 تاریخ ورود: <strong>{formatPersianDate(att.started_at)}</strong>
                              </span>
                              {att.completed_at && (
                                <span>
                                  🏁 ساعت تحویل: <strong>{formatPersianTime(att.completed_at)}</strong>
                                </span>
                              )}
                              <span>
                                ⏱️ مدت زمان حضور در آزمون: <strong>{calculateDurationMinutes(att.started_at, att.completed_at)}</strong>
                              </span>
                            </div>

                            {/* فایل‌های پاسخنامه ارسالی دانش‌آموز */}
                            {studentFiles.length > 0 && (
                              <div style={{ marginTop: '4px', borderTop: '1px dashed var(--border-color)', paddingTop: '6px' }}>
                                <strong style={{ display: 'block', marginBottom: '4px', color: 'var(--text-primary)' }}>
                                  📎 برگه‌های پاسخنامه آپلود شده ({studentFiles.length} فایل):
                                </strong>
                                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                  {studentFiles.map((f, fi) => (
                                    <a
                                      key={fi}
                                      href={getFullFileUrl(f.url)}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="btn btn-secondary btn-sm"
                                      style={{ fontSize: '0.72rem', padding: '3px 8px' }}
                                    >
                                      <HiOutlineDocumentArrowDown />
                                      <span>مشاهده برگه {fi + 1} ({f.originalname || 'فایل'})</span>
                                    </a>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* یادداشت دانش‌آموز */}
                            {answersData.student_note && (
                              <div style={{ marginTop: '2px' }}>
                                <strong>📝 یادداشت دانش‌آموز:</strong> {answersData.student_note}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', fontStyle: 'italic', padding: '4px 0' }}>
                            ⚠️ این دانش‌آموز در این کلاس عضو است اما تا این لحظه به جلسه آزمون وارد نشده است.
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* 🔍 Lightbox Image Viewer */}
      {lightboxImage && (
        <div className={styles.lightboxModal} onClick={() => setLightboxImage(null)}>
          <div className={styles.lightboxContent} onClick={(e) => e.stopPropagation()}>
            <button
              className={styles.lightboxCloseBtn}
              onClick={() => setLightboxImage(null)}
              title="بستن (ESC)"
            >
              &times;
            </button>
            <img src={lightboxImage} alt="بزرگنمایی تصویر" className={styles.lightboxImg} />
          </div>
        </div>
      )}
    </div>
  );
}
