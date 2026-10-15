'use client';
import { useState, useEffect, useRef } from 'react';
import useAuthStore from '../../../stores/authStore';
import api from '../../../lib/api';
import toast from 'react-hot-toast';
import Link from 'next/link';
import {
  HiOutlineClipboardDocumentList,
  HiOutlinePlus,
  HiOutlineCalendar,
  HiOutlineClock,
  HiOutlineCheckCircle,
  HiOutlineXCircle,
  HiOutlineArrowUpTray,
  HiOutlinePaperClip,
  HiOutlineXMark,
  HiOutlineDocumentText,
  HiOutlineDocumentArrowDown,
  HiOutlinePhoto,
  HiOutlineLockClosed,
  HiOutlineLockOpen,
  HiOutlineExclamationTriangle,
  HiOutlineShieldExclamation,
  HiOutlineAcademicCap,
  HiOutlineUserGroup,
  HiOutlinePencilSquare,
  HiOutlineChatBubbleLeftRight,
} from 'react-icons/hi2';
import styles from './assignments.module.css';

export default function AssignmentsPage() {
  const { user } = useAuthStore();
  const isTeacher = user?.role === 'teacher';
  const isStudent = user?.role === 'student';
  const isParent = user?.role === 'parent';

  const [assignments, setAssignments] = useState([]);
  const [classes, setClasses] = useState([]);
  const [selectedClassId, setSelectedClassId] = useState('all');
  const [activeTab, setActiveTab] = useState('all');
  const [loading, setLoading] = useState(true);

  // Modal states: Create Assignment
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState({
    class_id: '',
    title: '',
    description: '',
    due_date: '',
    allow_late: false,
    attachments: [],
  });
  const [selectedGrade, setSelectedGrade] = useState('all');
  const [customGrade, setCustomGrade] = useState('');
  const [customClassName, setCustomClassName] = useState('');
  const [customClassSubject, setCustomClassSubject] = useState('');
  const [selectedClassMembers, setSelectedClassMembers] = useState([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [teacherUploading, setTeacherUploading] = useState(false);
  const [submittingCreate, setSubmittingCreate] = useState(false);

  // Submissions review drawer / modal for teacher
  const [reviewAssignment, setReviewAssignment] = useState(null);
  const [loadingReview, setLoadingReview] = useState(false);
  const [gradingState, setGradingState] = useState({});

  // Student submit modal
  const [submitAssignment, setSubmitAssignment] = useState(null);
  const [studentNote, setStudentNote] = useState('');
  const [studentFiles, setStudentFiles] = useState([]);
  const [studentUploading, setStudentUploading] = useState(false);
  const [submittingResponse, setSubmittingResponse] = useState(false);

  const teacherFileInputRef = useRef(null);
  const studentFileInputRef = useRef(null);

  const getFullFileUrl = (url) => {
    if (!url) return '#';
    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    const backendBase = process.env.NEXT_PUBLIC_API_URL
      ? process.env.NEXT_PUBLIC_API_URL.replace(/\/api\/v1\/?$/, '')
      : 'http://localhost:5000';
    return `${backendBase}${url.startsWith('/') ? '' : '/'}${url}`;
  };

  const getDeadlineInfo = (dueDate, allowLate) => {
    if (!dueDate) {
      return {
        hasDeadline: false,
        formattedDate: 'بدون مهلت تحویل',
        isExpired: false,
        isLocked: false,
        remainingText: 'بدون محدودیت زمانی',
        urgency: 'none',
      };
    }

    const due = new Date(dueDate);
    const now = new Date();
    const diffMs = due.getTime() - now.getTime();
    const isExpired = diffMs <= 0;
    const isAllowLate = allowLate === true || allowLate === 1 || allowLate === '1' || allowLate === 'true';
    const isLocked = isExpired && !isAllowLate;

    const formattedDate = due.toLocaleDateString('fa-IR', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    if (isExpired) {
      return {
        hasDeadline: true,
        formattedDate,
        isExpired: true,
        isLocked,
        remainingText: isLocked
          ? 'مهلت ارسال به پایان رسیده است (آپلود قفل شد)'
          : 'مهلت پایان یافته است (ارسال با تأخیر مجاز)',
        urgency: 'expired',
      };
    }

    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);
    const remHours = diffHours % 24;
    const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

    let remainingText = '';
    let urgency = 'normal';

    if (diffDays > 0) {
      remainingText = `${diffDays} روز و ${remHours} ساعت فرصت باقی است`;
    } else if (diffHours > 0) {
      remainingText = `${diffHours} ساعت و ${diffMinutes} دقیقه فرصت باقی است`;
      urgency = 'urgent';
    } else {
      remainingText = `${diffMinutes} دقیقه فرصت باقی است (فرصت پایانی!)`;
      urgency = 'urgent';
    }

    return {
      hasDeadline: true,
      formattedDate,
      isExpired: false,
      isLocked: false,
      remainingText,
      urgency,
    };
  };

  const handlePresetDeadline = (daysFromNow, hour = 23, minute = 59) => {
    const d = new Date();
    d.setDate(d.getDate() + daysFromNow);
    d.setHours(hour, minute, 0, 0);

    const pad = (n) => String(n).padStart(2, '0');
    const localIso = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    setCreateForm((prev) => ({ ...prev, due_date: localIso }));
  };

  useEffect(() => {
    fetchClasses();
    fetchAssignments();
  }, []);

  const fetchSelectedClassMembers = async (classId) => {
    if (!classId || classId === 'all') {
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

  const fetchAssignments = async () => {
    setLoading(true);
    try {
      const res = await api.get('/assignments');
      const data = res.data.data.assignments || [];
      // parse attachments
      data.forEach((a) => {
        if (typeof a.attachments === 'string') {
          try {
            a.attachments = JSON.parse(a.attachments);
          } catch (e) {
            a.attachments = [];
          }
        }
      });
      setAssignments(data);
    } catch (err) {
      console.error(err);
      toast.error('خطا در بارگذاری تکالیف');
    } finally {
      setLoading(false);
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
      toast.success(`${uploaded.length} فایل پیوست شد`);
    } catch (err) {
      toast.error('خطا در بارگذاری فایل پیوست');
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

  const handleCreateAssignment = async (e) => {
    e.preventDefault();
    if (!createForm.title.trim()) {
      toast.error('لطفاً عنوان تکلیف را وارد کنید');
      return;
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

      setSubmittingCreate(true);
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
        toast.error(err.response?.data?.message || 'خطا در ثبت کلاس جدید دستی');
        setSubmittingCreate(false);
        return;
      }
    }

    setSubmittingCreate(true);
    try {
      await api.post(`/classes/${targetClassId}/assignments`, {
        title: createForm.title.trim(),
        description: createForm.description,
        due_date: createForm.due_date ? new Date(createForm.due_date).toISOString() : null,
        allow_late: createForm.allow_late,
        attachments: createForm.attachments,
      });
      toast.success('تکلیف با فایل‌های پیوست با موفقیت منتشر شد 🎉');
      setShowCreateModal(false);
      setCustomGrade('');
      setCustomClassName('');
      setCustomClassSubject('');
      const defaultClassId = classes[0]?.id || targetClassId || '';
      setCreateForm({
        class_id: defaultClassId,
        title: '',
        description: '',
        due_date: '',
        allow_late: false,
        attachments: [],
      });
      await fetchClasses();
      fetchAssignments();
    } catch (err) {
      toast.error(err.response?.data?.message || 'خطا در ساخت تکلیف');
    } finally {
      setSubmittingCreate(false);
    }
  };

  const handleOpenReview = async (assignment) => {
    setReviewAssignment(assignment);
    setLoadingReview(true);
    try {
      const res = await api.get(`/classes/${assignment.class_id}/assignments/${assignment.id}`);
      const asg = res.data.data.assignment;
      if (asg?.submissions) {
        asg.submissions.forEach((s) => {
          if (typeof s.files === 'string') {
            try {
              s.files = JSON.parse(s.files);
            } catch (e) {
              s.files = [];
            }
          }
        });
      }
      setReviewAssignment(asg);
    } catch (err) {
      toast.error('خطا در دریافت جزئیات پاسخ‌ها');
    } finally {
      setLoadingReview(false);
    }
  };

  const handleGradeSubmission = async (submissionId) => {
    const data = gradingState[submissionId] || {};
    if (data.grade === undefined || data.grade === '') {
      toast.error('لطفاً نمره را وارد کنید');
      return;
    }
    try {
      await api.put(
        `/classes/${reviewAssignment.class_id}/assignments/${reviewAssignment.id}/submissions/${submissionId}/grade`,
        {
          grade: parseFloat(data.grade),
          feedback_text: data.feedback || '',
        }
      );
      toast.success('نمره و بازخورد با موفقیت ثبت شد ✅');
      handleOpenReview(reviewAssignment);
      fetchAssignments();
    } catch (err) {
      toast.error('خطا در ثبت نمره');
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
      toast.success('فایل پاسخ بارگذاری شد');
    } catch (err) {
      toast.error('خطا در بارگذاری فایل پاسخ');
    } finally {
      setStudentUploading(false);
    }
  };

  const removeStudentFile = (idx) => {
    setStudentFiles((prev) => prev.filter((_, i) => i !== idx),);
  };

  const handleOpenStudentSubmit = (assignment) => {
    const isAllowLate = assignment.allow_late === true || assignment.allow_late === 1 || assignment.allow_late === '1' || assignment.allow_late === 'true';
    const isPastDue = assignment.due_date && new Date() > new Date(assignment.due_date);
    if (isPastDue && !isAllowLate) {
      toast.error('مهلت ارسال این تکلیف به پایان رسیده و طبق تنظیم دبیر امکان آپلود بسته شده است ⛔');
      return;
    }

    setSubmitAssignment(assignment);
    if (assignment.submission) {
      setStudentNote(assignment.submission.student_note || '');
      let existingFiles = assignment.submission.files;
      if (typeof existingFiles === 'string') {
        try {
          existingFiles = JSON.parse(existingFiles);
        } catch (e) {
          existingFiles = [];
        }
      }
      setStudentFiles(existingFiles || []);
    } else {
      setStudentNote('');
      setStudentFiles([]);
    }
  };

  const handleStudentSubmit = async (e) => {
    e.preventDefault();
    if (!studentNote.trim() && studentFiles.length === 0) {
      toast.error('لطفاً متن پاسخ یا حداقل یک فایل پیوست ارسال کنید');
      return;
    }
    setSubmittingResponse(true);
    try {
      await api.post(`/classes/${submitAssignment.class_id}/assignments/${submitAssignment.id}/submit`, {
        student_note: studentNote,
        files: studentFiles,
      });
      toast.success('پاسخ تکلیف با فایل‌های پیوست با موفقیت ارسال شد 🚀');
      setSubmitAssignment(null);
      setStudentNote('');
      setStudentFiles([]);
      fetchAssignments();
    } catch (err) {
      toast.error(err.response?.data?.message || 'خطا در ارسال پاسخ');
    } finally {
      setSubmittingResponse(false);
    }
  };

  const filteredAssignments = assignments.filter((a) => {
    if (selectedClassId !== 'all' && a.class_id !== selectedClassId) return false;

    const isPastDue = a.due_date && new Date(a.due_date) < new Date();

    if (activeTab === 'active') return !isPastDue;
    if (activeTab === 'expired') return isPastDue;
    if (activeTab === 'submitted') return a.submission !== null;
    if (activeTab === 'pending') return a.submission === null;
    if (activeTab === 'graded') return a.submission?.status === 'graded';
    if (activeTab === 'needs_grading') return (a.submission_count || 0) > (a.graded_count || 0);
    return true;
  });

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>
            {isParent ? 'تکالیف درسی فرزند' : 'مدیریت تکالیف و تمرین‌ها'}
          </h1>
          <p className={styles.subtitle}>
            {isParent
              ? 'مشاهده تکالیف کلاسی، بررسی مهلت‌های تحویل و ارزیابی پاسخ‌ها و نمرات ثبت‌شده توسط دبیران'
              : isTeacher
              ? 'تکالیف کلاسی همراه با پیوست PDF/تصویر را منتشر و پاسخ‌های آپلود شده را تصحیح کنید'
              : 'تمرین‌ها و کاربرگ‌های درسی را دانلود و فایل پاسخ خود را آپلود کنید'}
          </p>
        </div>

        {isTeacher && (
          <button className="btn btn-primary" onClick={handleOpenCreateModal}>
            <HiOutlinePlus />
            <span>ایجاد تکلیف با فایل پیوست</span>
          </button>
        )}
      </div>

      {/* Filters Bar */}
      <div className={styles.filtersBar}>
        <div className={styles.tabList}>
          <button
            className={`${styles.tabBtn} ${activeTab === 'all' ? styles.tabActive : ''}`}
            onClick={() => setActiveTab('all')}
          >
            همه تکالیف ({assignments.length})
          </button>
          <button
            className={`${styles.tabBtn} ${activeTab === 'active' ? styles.tabActive : ''}`}
            onClick={() => setActiveTab('active')}
          >
            در جریان
          </button>
          <button
            className={`${styles.tabBtn} ${activeTab === 'expired' ? styles.tabActive : ''}`}
            onClick={() => setActiveTab('expired')}
          >
            پایان‌یافته
          </button>
          {isParent && (
            <>
              <button
                className={`${styles.tabBtn} ${activeTab === 'pending' ? styles.tabActive : ''}`}
                onClick={() => setActiveTab('pending')}
              >
                در انتظار انجام فرزند
              </button>
              <button
                className={`${styles.tabBtn} ${activeTab === 'submitted' ? styles.tabActive : ''}`}
                onClick={() => setActiveTab('submitted')}
              >
                تحویل داده شده
              </button>
              <button
                className={`${styles.tabBtn} ${activeTab === 'graded' ? styles.tabActive : ''}`}
                onClick={() => setActiveTab('graded')}
              >
                نمره‌دهی شده
              </button>
            </>
          )}
          {isTeacher && (
            <button
              className={`${styles.tabBtn} ${activeTab === 'needs_grading' ? styles.tabActive : ''}`}
              onClick={() => setActiveTab('needs_grading')}
            >
              نیاز به تصحیح
            </button>
          )}
          {isStudent && (
            <button
              className={`${styles.tabBtn} ${activeTab === 'submitted' ? styles.tabActive : ''}`}
              onClick={() => setActiveTab('submitted')}
            >
              ارسال شده‌های من
            </button>
          )}
        </div>

        <select
          className={styles.selectClass}
          value={selectedClassId}
          onChange={(e) => setSelectedClassId(e.target.value)}
        >
          <option value="all">همه کلاس‌ها و پایه‌ها</option>
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

      {/* Assignments Grid */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px 0' }}>
          <div className="spinner" style={{ margin: '0 auto' }}></div>
          <p style={{ marginTop: '12px', color: 'var(--text-tertiary)' }}>در حال بارگذاری تکالیف...</p>
        </div>
      ) : filteredAssignments.length === 0 ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>📝</div>
          <h3>هیچ تکلیفی یافت نشد</h3>
          <p style={{ color: 'var(--text-tertiary)', marginTop: '8px' }}>
            {isTeacher ? 'می‌توانید اولین تکلیف این بخش را بسازید' : 'در حال حاضر تکلیفی برای نمایش وجود ندارد'}
          </p>
        </div>
      ) : (
        <div className={styles.assignmentGrid}>
          {filteredAssignments.map((assignment) => {
            const isAllowLate = assignment.allow_late === true || assignment.allow_late === 1 || assignment.allow_late === '1' || assignment.allow_late === 'true';
            const deadline = getDeadlineInfo(assignment.due_date, isAllowLate);

            return (
              <div key={assignment.id} className={styles.card}>
                <div className={styles.cardTop}>
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <span className={styles.classBadge}>
                      🏫 {assignment.class_name || assignment.class_subject || 'کلاس'}
                    </span>
                    {assignment.class_grade && (
                      <span className={styles.gradeBadgeHighlight}>
                        🎓 {assignment.class_grade}
                      </span>
                    )}
                  </div>
                  <span
                    className={`${styles.statusBadge} ${
                      deadline.isExpired ? styles.statusExpired : styles.statusActive
                    }`}
                  >
                    {deadline.isExpired
                      ? deadline.isLocked
                        ? '🔒 مهلت پایان‌یافته (بسته)'
                        : 'پایان مهلت (تأخیر مجاز)'
                      : 'در جریان و فعال'}
                  </span>
                </div>

                <div>
                  <h3 className={styles.cardTitle}>{assignment.title}</h3>
                  <p className={styles.cardDesc}>{assignment.description || 'بدون توضیحات تکمیلی'}</p>
                </div>

                {/* Display Teacher Attachments if any */}
                {assignment.attachments && assignment.attachments.length > 0 && (
                  <div style={{ marginTop: '4px' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                      📄 فایل‌های پیوست دبیر ({assignment.attachments.length}):
                    </span>
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '6px' }}>
                      {assignment.attachments.map((att, i) => (
                        <a
                          key={i}
                          href={getFullFileUrl(att.url)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={styles.attachmentLink}
                        >
                          <HiOutlineDocumentArrowDown />
                          <span>{att.originalname || 'دانلود فایل'}</span>
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                {/* ⏱️ باکس زمان مهلت و شمارشگر معکوس ارسال فایل */}
                <div className={styles.deadlineBox}>
                  <div className={styles.deadlineToRow}>
                    <HiOutlineCalendar style={{ color: '#6366f1', fontSize: '1.05rem' }} />
                    <span>مهلت ارسال: {deadline.formattedDate}</span>
                  </div>

                  {deadline.hasDeadline && (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '6px', marginTop: '2px' }}>
                      <span
                        className={`${styles.countdownBadge} ${
                          deadline.isExpired
                            ? styles.countdownExpired
                            : deadline.urgency === 'urgent'
                            ? styles.countdownUrgent
                            : styles.countdownNormal
                        }`}
                      >
                        {deadline.isExpired ? (
                          <>
                            <HiOutlineLockClosed />
                            <span>{deadline.remainingText}</span>
                          </>
                        ) : (
                          <>
                            <HiOutlineClock />
                            <span>فرصت آپلود: {deadline.remainingText}</span>
                          </>
                        )}
                      </span>

                      {!isAllowLate && (
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <HiOutlineShieldExclamation style={{ color: '#ef4444' }} />
                          <span>قفل خودکار پس از موعد</span>
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Teacher view: submission stats */}
                {isTeacher && (
                  <div className={styles.progressContainer}>
                    <div className={styles.progressHeader}>
                      <span>پاسخ‌های دریافتی</span>
                      <span>
                        {assignment.graded_count || 0} تصحیح شده از {assignment.submission_count || 0} تحویل
                      </span>
                    </div>
                    <div className={styles.progressBar}>
                      <div
                        className={styles.progressFill}
                        style={{
                          width: `${
                            assignment.submission_count
                              ? ((assignment.graded_count || 0) / assignment.submission_count) * 100
                              : 0
                          }%`,
                        }}
                      />
                    </div>
                  </div>
                )}

                {/* Parent view: child submission status, feedback & files */}
                {isParent && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div
                      style={{
                        background: assignment.submission ? 'rgba(16, 185, 129, 0.12)' : 'rgba(245, 158, 11, 0.12)',
                        padding: '10px 14px',
                        borderRadius: 'var(--radius-lg)',
                        fontSize: '0.875rem',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        border: assignment.submission ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(245, 158, 11, 0.3)',
                      }}
                    >
                      <span style={{ fontWeight: 600 }}>وضعیت تکلیف فرزند:</span>
                      <strong style={{ color: assignment.submission ? '#10b981' : '#f59e0b' }}>
                        {assignment.submission
                          ? assignment.submission.status === 'graded'
                            ? `نمره کسب شده: ${assignment.submission.grade} از ۲۰ 🏅`
                            : 'تحویل داده شده ✓ (در انتظار ثبت نمره)'
                          : 'در انتظار انجام توسط فرزند ⏳'}
                      </strong>
                    </div>

                    {assignment.submission?.feedback_text && (
                      <div style={{ background: 'rgba(99, 102, 241, 0.08)', borderRight: '3px solid #818cf8', padding: '8px 12px', borderRadius: 'var(--radius-md)', fontSize: '0.8125rem', color: '#e2e8f0' }}>
                        <strong>نظر و بازخورد دبیر: </strong>{assignment.submission.feedback_text}
                      </div>
                    )}

                    {assignment.submission?.files && (
                      <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                        <span>فایل ارسالی فرزند:</span>
                        {(() => {
                          try {
                            const files = typeof assignment.submission.files === 'string'
                              ? JSON.parse(assignment.submission.files)
                              : assignment.submission.files;
                            return Array.isArray(files) ? files.map((f, fi) => (
                              <a
                                key={fi}
                                href={getFullFileUrl(f.url)}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#818cf8', textDecoration: 'underline' }}
                              >
                                📎 {f.name || 'دانلود فایل ارسالی'}
                              </a>
                            )) : null;
                          } catch (e) {
                            return null;
                          }
                        })()}
                      </div>
                    )}
                  </div>
                )}

                {/* Student view: submission status & alerts */}
                {isStudent && (
                  <>
                    <div
                      style={{
                        background: assignment.submission ? 'rgba(16, 185, 129, 0.1)' : 'var(--bg-hover)',
                        padding: '8px 12px',
                        borderRadius: 'var(--radius-md)',
                        fontSize: '0.8125rem',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <span>وضعیت پاسخ شما:</span>
                      <strong style={{ color: assignment.submission ? '#059669' : 'var(--text-tertiary)' }}>
                        {assignment.submission
                          ? assignment.submission.status === 'graded'
                            ? `نمره: ${assignment.submission.grade}`
                            : 'تحویل داده شده ✓'
                          : 'هنوز ارسال نشده'}
                      </strong>
                    </div>

                    {/* بنر هشدار بسته شدن آپلود برای دانش‌آموز در صورت اتمام مهلت */}
                    {deadline.isLocked && !assignment.submission && (
                      <div className={styles.lockedAlertBanner}>
                        <HiOutlineLockClosed style={{ fontSize: '1.25rem', color: '#ef4444', flexShrink: 0, marginTop: '2px' }} />
                        <div>
                          <strong>امکان آپلود بسته شد:</strong> مهلت ارسال این تکلیف در {deadline.formattedDate} به پایان رسیده و سامانه تحویل فایل قفل شده است.
                        </div>
                      </div>
                    )}
                  </>
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
                      onClick={() => handleOpenReview(assignment)}
                    >
                      <HiOutlineClipboardDocumentList />
                      <span>بررسی و تصحیح پاسخ‌ها ({assignment.submission_count || 0})</span>
                    </button>
                  ) : deadline.isLocked ? (
                    assignment.submission ? (
                      <button disabled className={styles.submittedLockedBtn} title="مهلت ارسال پایان یافته و پاسخ شما قبلاً ثبت شده است">
                        <HiOutlineCheckCircle style={{ fontSize: '1.1rem' }} />
                        <span>مهلت پایان یافته (پاسخ شما قبلاً ثبت شده)</span>
                      </button>
                    ) : (
                      <button disabled className={styles.lockedBtn} title="مهلت ارسال به پایان رسیده و سامانه بسته شده است">
                        <HiOutlineLockClosed style={{ fontSize: '1.1rem' }} />
                        <span>امکان آپلود بسته شد (پایان مهلت تحویل)</span>
                      </button>
                    )
                  ) : (
                    <button
                      className={`btn btn-sm ${assignment.submission ? 'btn-secondary' : 'btn-primary'}`}
                      style={{ width: '100%' }}
                      onClick={() => handleOpenStudentSubmit(assignment)}
                    >
                      <HiOutlineArrowUpTray />
                      <span>{assignment.submission ? 'ویرایش یا ارسال مجدد فایل' : 'ارسال پاسخ و فایل'}</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal: Create Assignment with File Attachments */}
      {showCreateModal && (
        <div className={styles.modalBackdrop} onClick={() => setShowCreateModal(false)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2>ایجاد تکلیف جدید با فایل پیوست</h2>
              <button className={styles.closeBtn} onClick={() => setShowCreateModal(false)}>
                &times;
              </button>
            </div>

            <form onSubmit={handleCreateAssignment} className={styles.form}>
              {/* انتخاب ۲ مرحله‌ای: پایه تحصیلی و کلاس با گزینه موارد دیگر */}
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

                {/* مرحله ۲: کلاس مربوطه */}
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

              {/* 👥 اعضای متصل به این کلاس و پایه یا پیش‌نمایش کلاس دستی */}
              {createForm.class_id === 'custom' ? (
                <div className={styles.classMembersBox} style={{ borderStyle: 'dashed', borderColor: '#6366f1' }}>
                  <div className={styles.classMembersHeader}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <HiOutlineUserGroup style={{ color: '#6366f1', fontSize: '1.15rem' }} />
                      <span>کلاس دستی جدید جهت انتشار تکلیف:</span>
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
                      این کلاس با عنوان <strong>{customClassName || 'تعریف‌نشده'}</strong> و پایه <strong>{selectedGrade === 'custom' ? (customGrade || 'تعریف‌نشده') : selectedGrade}</strong> به طور هم‌زمان در سیستم ثبت شده و تکلیف در آن منتشر می‌گردد. دانش‌آموزان به محض ثبت‌نام یا پیوستن، تکلیف را دریافت خواهند کرد.
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
                        <span>دانش‌آموزان دریافت‌کننده این تکلیف:</span>
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
                        هنوز دانش‌آموزی در این کلاس ثبت نام نشده است. (تکلیف ایجاد شده پس از عضویت دانش‌آموزان نمایش داده می‌شود).
                      </div>
                    )}

                    <div className={styles.targetAudienceNotice}>
                      <HiOutlineAcademicCap style={{ color: '#6366f1', fontSize: '1.25rem', flexShrink: 0 }} />
                      <span>
                        این تکلیف منحصراً برای دانش‌آموزان همین پایه ({selectedClassObj?.grade || 'انتخابی'}) در {selectedClassObj?.name} ارسال شده و فقط برای اعضای این کلاس نمایش داده می‌شود.
                      </span>
                    </div>
                  </div>
                );
              })()}

              <div className={styles.formGroup}>
                <label>عنوان تکلیف *</label>
                <input
                  type="text"
                  className="input"
                  placeholder="مثلاً: حل مسائل تحلیلی فصل ۳ فیزیک پیشرفته"
                  value={createForm.title}
                  onChange={(e) => setCreateForm({ ...createForm, title: e.target.value })}
                  required
                />
              </div>

              <div className={styles.formGroup}>
                <label>توضیحات و دستورالعمل انجام تمرین</label>
                <textarea
                  className="input"
                  rows={3}
                  placeholder="نکات مهم و شیوه پاسخ‌دهی..."
                  value={createForm.description}
                  onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
                />
              </div>

              {/* File Attachment Dropzone */}
              <div className={styles.formGroup}>
                <label>فایل‌های پیوست (PDF، عکس، اسلاید، کاربرگ)</label>
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
                >
                  <HiOutlinePaperClip className={styles.dropzoneIcon} />
                  <div>
                    <strong>برای بارگذاری فایل پیوست کلیک کنید</strong>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginTop: '2px' }}>
                      پشتیبانی از PDF، Word، تصاویر، زیپ (تا سقف ۵۰ مگابایت در فضای داخلی)
                    </p>
                  </div>
                </div>

                {teacherUploading && (
                  <p style={{ fontSize: '0.8125rem', color: 'var(--primary-500)', marginTop: '6px' }}>
                    در حال بارگذاری فایل(ها)...
                  </p>
                )}

                {/* Uploaded attachments list */}
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

              <div className={styles.formGroup}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.875rem', fontWeight: 700 }}>
                    <HiOutlineCalendar style={{ color: '#6366f1' }} />
                    <span>تاریخ و ساعت مهلت تحویل (آخرین وقت آپلود دانش‌آموز)</span>
                  </label>
                  {createForm.due_date && (
                    <button
                      type="button"
                      onClick={() => setCreateForm((prev) => ({ ...prev, due_date: '' }))}
                      style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: '0.76rem', cursor: 'pointer' }}
                    >
                      حذف مهلت
                    </button>
                  )}
                </div>

                <input
                  type="datetime-local"
                  className="input"
                  value={createForm.due_date}
                  onChange={(e) => setCreateForm({ ...createForm, due_date: e.target.value })}
                />

                {/* Quick Presets for Teacher */}
                <div className={styles.datePresetsRow}>
                  <span style={{ fontSize: '0.74rem', color: 'var(--text-tertiary)', alignSelf: 'center' }}>
                    انتخاب سریع مهلت:
                  </span>
                  <button
                    type="button"
                    className={styles.datePresetBtn}
                    onClick={() => handlePresetDeadline(1)}
                  >
                    تا فردا ساعت ۲۳:۵۹
                  </button>
                  <button
                    type="button"
                    className={styles.datePresetBtn}
                    onClick={() => handlePresetDeadline(3)}
                  >
                    ۳ روز مهلت
                  </button>
                  <button
                    type="button"
                    className={styles.datePresetBtn}
                    onClick={() => handlePresetDeadline(5)}
                  >
                    ۵ روز مهلت
                  </button>
                  <button
                    type="button"
                    className={styles.datePresetBtn}
                    onClick={() => handlePresetDeadline(7)}
                  >
                    ۱ هفته مهلت
                  </button>
                </div>
              </div>

              {/* Lock Upload After Deadline Setting */}
              <div
                className={`${styles.lockOptionCard} ${!createForm.allow_late ? styles.lockOptionCardActive : ''}`}
                onClick={() => setCreateForm((prev) => ({ ...prev, allow_late: !prev.allow_late }))}
              >
                <input
                  type="checkbox"
                  id="lock_after_deadline"
                  className={styles.lockCheckbox}
                  checked={!createForm.allow_late}
                  onChange={(e) => setCreateForm({ ...createForm, allow_late: !e.target.checked })}
                  onClick={(e) => e.stopPropagation()}
                />
                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                  <label htmlFor="lock_after_deadline" style={{ fontSize: '0.875rem', fontWeight: 750, color: 'var(--text-primary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <HiOutlineLockClosed style={{ color: !createForm.allow_late ? '#ef4444' : 'var(--text-tertiary)' }} />
                    <span>بستن و قفل خودکار امکان آپلود دانش‌آموز پس از پایان مهلت</span>
                  </label>
                  <p style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.45 }}>
                    در صورت فعال بودن این گزینه، بلافاصله پس از سررسید تاریخ و ساعت مشخص‌شده، دکمه آپلود برای دانش‌آموزان قفل شده و ارسال حل تمرین مسدود می‌گردد.
                  </p>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
                <button type="submit" className="btn btn-primary" disabled={submittingCreate}>
                  {submittingCreate ? 'در حال انتشار...' : 'انتشار تکلیف'}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowCreateModal(false)}
                >
                  انصراف
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Review Submissions (Teacher) */}
      {reviewAssignment && (
        <div className={styles.modalBackdrop} onClick={() => setReviewAssignment(null)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div>
                <h2>پاسخ‌های ارسالی: {reviewAssignment.title}</h2>
                <p style={{ fontSize: '0.8125rem', color: 'var(--text-tertiary)' }}>
                  تعداد کل پاسخ‌ها: {reviewAssignment.submissions?.length || 0}
                </p>
              </div>
              <button className={styles.closeBtn} onClick={() => setReviewAssignment(null)}>
                &times;
              </button>
            </div>

            {loadingReview ? (
              <div style={{ textAlign: 'center', padding: '30px 0' }}>
                <div className="spinner" style={{ margin: '0 auto' }}></div>
              </div>
            ) : !reviewAssignment.submissions || reviewAssignment.submissions.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-tertiary)' }}>
                هنوز هیچ دانش‌آموزی پاسخی ارسال نکرده است.
              </div>
            ) : (
              <div>
                {reviewAssignment.submissions.map((sub) => {
                  const state = gradingState[sub.id] || {
                    grade: sub.grade !== null && sub.grade !== undefined ? sub.grade : '',
                    feedback: sub.feedback_text || '',
                  };
                  return (
                    <div key={sub.id} className={styles.submissionItem}>
                      <div className={styles.submissionUser}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <div className="avatar" style={{ width: '32px', height: '32px', fontSize: '0.875rem' }}>
                            {sub.student_name?.charAt(0)}
                          </div>
                          <div>
                            <span className={styles.studentName}>{sub.student_name}</span>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', display: 'block' }}>
                              ارسال شده در:{' '}
                              {new Date(sub.submitted_at).toLocaleDateString('fa-IR', {
                                month: 'short',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                          </div>
                        </div>

                        <span
                          className={`${styles.statusBadge} ${
                            sub.status === 'graded' ? styles.statusGraded : styles.statusActive
                          }`}
                        >
                          {sub.status === 'graded' ? `نمره: ${sub.grade}` : 'در انتظار نمره'}
                        </span>
                      </div>

                      {/* Student's Uploaded Files */}
                      {sub.files && sub.files.length > 0 && (
                        <div className={styles.submissionFilesBox}>
                          <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#38bdf8' }}>
                            📎 فایل‌های ارسالی دانش‌آموز ({sub.files.length}):
                          </span>
                          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '6px' }}>
                            {sub.files.map((f, fi) => (
                              <a
                                key={fi}
                                href={`http://localhost:5000${f.url}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={styles.attachmentLink}
                              >
                                <HiOutlineDocumentArrowDown />
                                <span>{f.originalname || 'دانلود فایل حل تمرین'}</span>
                              </a>
                            ))}
                          </div>
                        </div>
                      )}

                      {sub.student_note && (
                        <div
                          style={{
                            background: 'var(--bg-card)',
                            padding: '10px',
                            borderRadius: 'var(--radius-md)',
                            fontSize: '0.875rem',
                          }}
                        >
                          <strong>یادداشت دانش‌آموز:</strong>
                          <p style={{ marginTop: '4px' }}>{sub.student_note}</p>
                        </div>
                      )}

                      <div className={styles.gradeInputGroup}>
                        <label style={{ fontSize: '0.8125rem', fontWeight: 600 }}>نمره (از ۲۰):</label>
                        <input
                          type="number"
                          step="0.25"
                          min="0"
                          max="20"
                          className={styles.gradeInput}
                          placeholder="مثلاً ۱۸.۵"
                          value={state.grade}
                          onChange={(e) =>
                            setGradingState({
                              ...gradingState,
                              [sub.id]: { ...state, grade: e.target.value },
                            })
                          }
                        />

                        <input
                          type="text"
                          className="input"
                          style={{ flex: 1, minWidth: '160px', padding: '6px 12px', fontSize: '0.8125rem' }}
                          placeholder="بازخورد برای دانش‌آموز (اختیاری)..."
                          value={state.feedback}
                          onChange={(e) =>
                            setGradingState({
                              ...gradingState,
                              [sub.id]: { ...state, feedback: e.target.value },
                            })
                          }
                        />

                        <button
                          className="btn btn-primary btn-sm"
                          onClick={() => handleGradeSubmission(sub.id)}
                        >
                          ثبت نمره
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal: Student Submit with File Upload */}
      {submitAssignment && (
        <div className={styles.modalBackdrop} onClick={() => setSubmitAssignment(null)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div>
                <h2>ارسال پاسخ و فایل تکلیف</h2>
                <p style={{ fontSize: '0.8125rem', color: 'var(--text-tertiary)' }}>{submitAssignment.title}</p>
              </div>
              <button className={styles.closeBtn} onClick={() => setSubmitAssignment(null)}>
                &times;
              </button>
            </div>

            <form onSubmit={handleStudentSubmit} className={styles.form}>
              {/* Student File Uploader */}
              <div className={styles.formGroup}>
                <label>فایل پاسخ تکلیف (عکس دست‌نویس، PDF حل تمرین، زیپ) *</label>
                <input
                  type="file"
                  ref={studentFileInputRef}
                  style={{ display: 'none' }}
                  multiple
                  onChange={handleStudentFileUpload}
                />
                <div
                  className={styles.uploadDropzone}
                  onClick={() => studentFileInputRef.current?.click()}
                >
                  <HiOutlineArrowUpTray className={styles.dropzoneIcon} />
                  <div>
                    <strong>برای انتخاب و آپلود فایل پاسخ کلیک کنید</strong>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginTop: '2px' }}>
                      می‌توانید عکس دست‌نویس یا فایل PDF پاسخ را ارسال کنید
                    </p>
                  </div>
                </div>

                {studentUploading && (
                  <p style={{ fontSize: '0.8125rem', color: 'var(--primary-500)', marginTop: '4px' }}>
                    در حال بارگذاری فایل...
                  </p>
                )}

                {/* Uploaded student files chips */}
                {studentFiles.length > 0 && (
                  <div className={styles.attachmentList}>
                    {studentFiles.map((f, i) => (
                      <div key={i} className={styles.attachmentChip}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <HiOutlineDocumentText style={{ color: '#10b981', fontSize: '1.25rem' }} />
                          <span>{f.originalname}</span>
                          <span style={{ fontSize: '0.6875rem', color: 'var(--text-tertiary)' }}>
                            ({Math.round((f.size || 0) / 1024)} KB)
                          </span>
                        </div>
                        <HiOutlineXMark
                          style={{ cursor: 'pointer', color: '#ef4444' }}
                          onClick={() => removeStudentFile(i)}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className={styles.formGroup}>
                <label>توضیحات و یادداشت به دبیر</label>
                <textarea
                  className="input"
                  rows={3}
                  placeholder="توضیح درباره نحوه پاسخ‌دهی یا نکات لازم برای دبیر..."
                  value={studentNote}
                  onChange={(e) => setStudentNote(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
                <button type="submit" className="btn btn-primary" disabled={submittingResponse}>
                  {submittingResponse ? 'در حال ارسال...' : 'ارسال نهایی پاسخ'}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setSubmitAssignment(null)}
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
