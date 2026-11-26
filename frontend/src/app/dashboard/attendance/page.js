'use client';
import { useState, useEffect, useRef } from 'react';
import useAuthStore from '../../../stores/authStore';
import api from '../../../lib/api';
import toast from 'react-hot-toast';
import {
  HiOutlineUserGroup,
  HiOutlineCheckCircle,
  HiOutlineClock,
  HiOutlineXCircle,
  HiOutlinePlay,
  HiOutlineStop,
  HiOutlineArrowPath,
  HiOutlineClipboardDocumentList,
  HiOutlinePrinter,
  HiOutlinePhone,
  HiOutlineSparkles,
  HiOutlineHandRaised,
  HiOutlineDocumentCheck,
  HiOutlineArrowDownTray,
  HiOutlineTableCells,
  HiOutlineDocumentText,
  HiOutlinePhoto,
  HiOutlinePaperAirplane,
  HiOutlineBuildingOffice2,
  HiOutlineAcademicCap,
  HiOutlineMagnifyingGlass,
  HiOutlineXMark,
  HiOutlineShare,
} from 'react-icons/hi2';
import {
  triggerReliableDownload,
  shareOrDownloadBlob,
  isMobileOrNativeWebView,
} from '../../../utils/mobileDownload';
import styles from './attendance.module.css';

export default function AttendancePage() {
  const { user } = useAuthStore();
  const isTeacher = user?.role === 'teacher';
  const isStudent = user?.role === 'student';
  const isAdmin = user?.role === 'admin' || user?.role === 'manager';

  // Mode: 'management_overview' (حضور و غیاب کل به تفکیک معلمان) | 'class_session' (باکس کلاسی)
  const [activeModeTab, setActiveModeTab] = useState(isAdmin ? 'management_overview' : 'class_session');

  // Shared Reports State (نتایج ارسالی معلمان به مدیریت)
  const [sharedReports, setSharedReports] = useState([]);
  const [teacherFilter, setTeacherFilter] = useState('all');
  const [mgmtSearchQuery, setMgmtSearchQuery] = useState('');

  // Share Modal State (جهت ارسال گزارش معلم به مدیریت)
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [shareNote, setShareNote] = useState('');
  const [isSharing, setIsSharing] = useState(false);

  // Detailed Modal State (جهت مشاهده ریز اسامی توسط مدیریت)
  const [selectedReportDetail, setSelectedReportDetail] = useState(null);
  const [exportPreview, setExportPreview] = useState(null);

  const [classes, setClasses] = useState([]);
  const [selectedClassId, setSelectedClassId] = useState('');
  const [activeSession, setActiveSession] = useState(null);
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [startingSession, setStartingSession] = useState(false);
  const [selectedDuration, setSelectedDuration] = useState(15); // ربع ساعت پیش‌فرض

  // Live countdown remaining seconds
  const [remainingSeconds, setRemainingSeconds] = useState(null);

  // Student check-in states
  const [checkingIn, setCheckingIn] = useState(false);
  const [studentRecord, setStudentRecord] = useState(null);

  // Past sessions history
  const [historySessions, setHistorySessions] = useState([]);
  const [viewingHistoryId, setViewingHistoryId] = useState(null);

  useEffect(() => {
    fetchClasses();
  }, []);

  useEffect(() => {
    if (selectedClassId) {
      loadSessionData();
    }
  }, [selectedClassId]);

  // Load shared attendance reports from teachers to management
  useEffect(() => {
    try {
      const saved = localStorage.getItem('school_shared_attendance_reports');
      if (saved) {
        const parsed = JSON.parse(saved);
        const filtered = Array.isArray(parsed) ? parsed.filter((r) => !r.id?.startsWith('rep-seed-')) : [];
        setSharedReports(filtered);
        localStorage.setItem('school_shared_attendance_reports', JSON.stringify(filtered));
      } else {
        setSharedReports([]);
      }
    } catch (e) {
      setSharedReports([]);
    }
  }, []);

  const handleShareWithManagement = async () => {
    if (!report) {
      toast.error('گزارشی برای اشتراک‌گذاری وجود ندارد');
      return;
    }
    setIsSharing(true);
    try {
      const currentTeacherName = user?.display_name || user?.name || 'دبیر محترم';
      const currentTeacherCode = user?.personnel_code || 'TCH-101';
      const selClass = classes.find((c) => c.id === selectedClassId);

      const newReport = {
        id: `rep-${Date.now()}`,
        teacher_name: currentTeacherName,
        teacher_code: currentTeacherCode,
        subject: selClass?.subject || 'عمومی',
        class_name: selClass?.name || 'کلاس انتخابی',
        grade: selClass?.grade || 'پایه دهم',
        date: new Date().toLocaleDateString('fa-IR'),
        time: new Date().toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }),
        created_at: new Date().toISOString(),
        present_count: report?.present_students?.length || 0,
        absent_count: report?.absent_students?.length || 0,
        late_count: report?.summary?.late || 0,
        attendance_percentage: report?.summary?.attendance_percentage || 0,
        absent_students: (report?.absent_students || []).map((s) => ({
          id: s.student_id,
          name: s.display_name,
          phone: s.phone || 'ثبت نشده',
          reason: 'عدم اعلام حضور در مهلت ربع ساعت',
        })),
        present_students: (report?.present_students || []).map((s) => ({
          id: s.student_id,
          name: s.display_name,
          time: formatClockTime(s.recorded_at),
          status: s.status,
        })),
        teacher_note: shareNote.trim() || 'گزارش رسمی حضور و غیاب توسط دبیر تایید و برای مدیریت ارسال شد.',
        status: 'submitted',
      };

      const updated = [newReport, ...sharedReports];
      setSharedReports(updated);
      try {
        localStorage.setItem('school_shared_attendance_reports', JSON.stringify(updated));
      } catch (e) {}

      // Broadcast notification to school management
      try {
        await api.post('/notifications/broadcast', {
          title: `📋 گزارش جدید حضور و غیاب: ${newReport.class_name}`,
          body: `دبیر محترم ${newReport.teacher_name} نتیجه حضور و غیاب کلاس ${newReport.class_name} را با ${newReport.present_count} حاضر و ${newReport.absent_count} غایب برای مدیریت ارسال فرمودند.`,
          category: 'administrative',
          priority: 'normal',
          target_audience: 'admin',
          is_mandatory: false,
        });
      } catch (e) {}

      toast.success(`نتیجه حضور و غیاب کلاس «${newReport.class_name}» با موفقیت برای مدیریت مجتمع ارسال شد 🚀`, { duration: 5000 });
      setIsShareModalOpen(false);
      setShareNote('');
    } catch (err) {
      toast.error('خطا در ارسال نتیجه به مدیریت');
    } finally {
      setIsSharing(false);
    }
  };

  const handleAcknowledgeReport = (reportId) => {
    const updated = sharedReports.map((r) => (r.id === reportId ? { ...r, status: 'acknowledged' } : r));
    setSharedReports(updated);
    try {
      localStorage.setItem('school_shared_attendance_reports', JSON.stringify(updated));
    } catch (e) {}
    toast.success('گزارش دبیر مورد تایید مدیریت قرار گرفت و ثبت شد ✓');
  };

  // Live countdown timer hook
  useEffect(() => {
    if (!activeSession || activeSession.status !== 'active' || !activeSession.closes_at) {
      setRemainingSeconds(null);
      return;
    }

    const calculateRemaining = () => {
      const closesAt = new Date(activeSession.closes_at).getTime();
      const now = Date.now();
      const diff = Math.max(0, Math.floor((closesAt - now) / 1000));
      setRemainingSeconds(diff);

      // If timer hits zero, refresh to finalize absent list
      if (diff <= 0) {
        toast('مهلت ربع ساعت حضور و غیاب به پایان رسید و لیست نهایی شد ⌛', { icon: '⏰' });
        loadSessionData();
      }
    };

    calculateRemaining();
    const interval = setInterval(calculateRemaining, 1000);
    return () => clearInterval(interval);
  }, [activeSession?.id, activeSession?.status, activeSession?.closes_at]);

  const fetchClasses = async () => {
    try {
      const res = await api.get('/classes');
      const list = res.data.data.classes || [];
      setClasses(list);
      if (list.length > 0) {
        setSelectedClassId(list[0].id);
      }
    } catch (err) {
      console.error(err);
      toast.error('خطا در دریافت لیست کلاس‌ها');
    } finally {
      setLoading(false);
    }
  };

  const loadSessionData = async () => {
    if (!selectedClassId) return;
    setLoading(true);
    try {
      const res = await api.get(`/classes/${selectedClassId}/attendance/sessions`);
      const sessions = res.data.data.sessions || [];
      setHistorySessions(sessions);

      // Find current active session
      const currentActive = sessions.find((s) => s.status === 'active');
      const targetSession = currentActive || sessions[0] || null;
      setActiveSession(currentActive || null);

      if (targetSession) {
        const repRes = await api.get(
          `/classes/${selectedClassId}/attendance/sessions/${targetSession.id}/report`
        );
        setReport(repRes.data.data);

        // Check if student is already recorded
        if (isStudent && user) {
          const myRec = repRes.data.data.present_students?.find((s) => s.student_id === user.id);
          if (myRec) {
            setStudentRecord(myRec);
          } else {
            setStudentRecord(null);
          }
        }
      } else {
        setReport(null);
        setStudentRecord(null);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Teacher creates on-demand attendance box (default 15 minutes)
   */
  const handleStartSession = async () => {
    if (!selectedClassId) return;
    setStartingSession(true);
    try {
      const res = await api.post(`/classes/${selectedClassId}/attendance/sessions`, {
        duration_minutes: selectedDuration,
      });
      toast.success(`باکس حضور و غیاب (${selectedDuration} دقیقه‌ای) با موفقیت فعال شد! 🎉`);
      setActiveSession(res.data.data.session);
      await loadSessionData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'خطا در ایجاد باکس حضور و غیاب');
    } finally {
      setStartingSession(false);
    }
  };

  /**
   * Teacher ends/closes active attendance box
   */
  const handleCloseSession = async () => {
    if (!activeSession) return;
    try {
      await api.put(`/classes/${selectedClassId}/attendance/sessions/${activeSession.id}/close`);
      toast.success('باکس حضور و غیاب بسته شد و لیست غایبین نهایی گردید ✅');
      await loadSessionData();
    } catch (err) {
      toast.error('خطا در بستن باکس حضور و غیاب');
    }
  };

  /**
   * Student single-click check-in: NO CODE NEEDED!
   */
  const handleStudentCheckIn = async () => {
    if (!activeSession) {
      toast.error('در حال حاضر باکس فعالی برای این کلاس باز نیست');
      return;
    }
    setCheckingIn(true);
    try {
      const res = await api.post(
        `/classes/${selectedClassId}/attendance/sessions/${activeSession.id}/check-in`
      );
      toast.success(res.data.message || 'حضور شما با موفقیت ثبت شد! ✅');
      setStudentRecord(res.data.data.record);
      await loadSessionData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'خطا در ثبت حضور');
    } finally {
      setCheckingIn(false);
    }
  };

  /**
   * Teacher manual status toggle (present, late, absent, excused)
   */
  const handleRecordStudent = async (studentId, status) => {
    const targetId = activeSession ? activeSession.id : report?.session?.id;
    if (!targetId) return;

    try {
      await api.post(`/classes/${selectedClassId}/attendance/sessions/${targetId}/record`, {
        student_id: studentId,
        status,
      });
      toast.success('وضعیت دانش‌آموز به‌روزرسانی شد');
      await loadSessionData();
    } catch (err) {
      toast.error('خطا در تغییر وضعیت');
    }
  };

  /**
   * Format Persian clock time (e.g. ۱۰:۱۵:۴۲)
   */
  const formatClockTime = (iso) => {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleTimeString('fa-IR', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    } catch (e) {
      return '—';
    }
  };

  /**
   * Copy Present List to clipboard
   */
  const handleCopyPresentList = () => {
    if (!report?.present_students?.length) {
      toast.error('دانش‌آموزی در لیست حاضرین نیست');
      return;
    }
    const lines = report.present_students.map((s, idx) => {
      const timeStr = formatClockTime(s.recorded_at);
      return `${idx + 1}. ${s.display_name} - ساعت حضور: ${timeStr}`;
    });
    const content = `📋 لیست حاضرین کلاس (${selectedClass?.name || ''}):\n${lines.join('\n')}\nتعداد کل حاضرین: ${report.present_students.length} نفر`;
    navigator.clipboard.writeText(content);
    toast.success('لیست حاضرین در حافظه کپی شد! 📋');
  };

  /**
   * Copy Absent List to clipboard
   */
  const handleCopyAbsentList = () => {
    if (!report?.absent_students?.length) {
      toast.error('دانش‌آموز غایبی وجود ندارد');
      return;
    }
    const lines = report.absent_students.map((s, idx) => {
      const phoneStr = s.phone ? ` (تماس: ${s.phone})` : '';
      return `${idx + 1}. ${s.display_name}${phoneStr}`;
    });
    const content = `❌ لیست غایبین کلاس (${selectedClass?.name || ''}) - عدم اعلام حضور در مهلت ربع ساعت:\n${lines.join('\n')}\nتعداد کل غایبین: ${report.absent_students.length} نفر`;
    navigator.clipboard.writeText(content);
    toast.success('لیست غایبین در حافظه کپی شد! 📋');
  };

  /**
   * Universal client-side & Android WebView-safe file downloader
   */
  const downloadFile = async (filename, content, mimeType = 'text/plain;charset=utf-8;') => {
    const blob = content instanceof Blob ? content : new Blob([content], { type: mimeType });
    return triggerReliableDownload(blob, filename, mimeType);
  };

  const getSafeDateString = (dateObj = new Date()) => {
    try {
      return new Intl.DateTimeFormat('fa-IR-u-nu-latn', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(dateObj).replace(/\//g, '-');
    } catch (e) {
      return new Date().toISOString().slice(0, 10);
    }
  };

  const getPersianDateText = (dateObj = new Date()) => {
    try {
      return new Intl.DateTimeFormat('fa-IR', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }).format(dateObj);
    } catch (e) {
      return new Date().toLocaleDateString('fa-IR');
    }
  };

  /**
   * Export Excel (CSV with UTF-8 BOM so Persian characters display perfectly in MS Excel)
   */
  const handleDownloadExcel = async (type = 'present') => {
    if (!report) return;
    const className = selectedClass?.name || 'کلاس';
    const dateStr = getSafeDateString();
    const BOM = '\uFEFF';

    if (type === 'present') {
      if (!report.present_students?.length) {
        toast.error('دانش‌آموزی در لیست حاضرین نیست');
        return;
      }
      const headers = ['ردیف', 'نام و نام خانوادگی', 'ساعت دقیق ثبت حضور', 'وضعیت', 'زمان پاسخ (دقیقه)', 'کلاس', 'تاریخ جلسه'];
      const rows = report.present_students.map((s, idx) => [
        idx + 1,
        s.display_name,
        formatClockTime(s.recorded_at),
        s.status === 'late' ? 'حاضر با تاخیر' : (s.status === 'excused' ? 'موجه' : 'حاضر به موقع'),
        s.elapsed_minutes !== null ? `${s.elapsed_minutes} دقیقه` : '—',
        className,
        getPersianDateText(new Date(report.session?.created_at || Date.now())),
      ]);

      const csvContent = BOM + [headers, ...rows]
        .map((row) => row.map((val) => `"${String(val ?? '').replace(/"/g, '""')}"`).join(','))
        .join('\r\n');

      const loadingToast = toast.loading('در حال آماده‌سازی فایل اکسل حاضرین...');
      const ok = await downloadFile(`لیست_حاضرین_${className.replace(/\s+/g, '_')}_${dateStr}.csv`, csvContent, 'text/csv');
      toast.dismiss(loadingToast);
      if (ok) toast.success('فایل اکسل حاضرین با موفقیت دانلود شد 📥');
      else toast.error('خطا در دانلود فایل اکسل');
    } else if (type === 'absent') {
      if (!report.absent_students?.length) {
        toast.error('دانش‌آموز غایبی وجود ندارد');
        return;
      }
      const headers = ['ردیف', 'نام و نام خانوادگی', 'شماره تماس جهت پیگیری', 'وضعیت', 'علت/توضیح', 'کلاس', 'تاریخ جلسه'];
      const rows = report.absent_students.map((s, idx) => [
        idx + 1,
        s.display_name,
        s.phone || 'ثبت نشده',
        'غایب',
        'عدم ثبت حضور در مهلت ربع ساعت',
        className,
        getPersianDateText(new Date(report.session?.created_at || Date.now())),
      ]);

      const csvContent = BOM + [headers, ...rows]
        .map((row) => row.map((val) => `"${String(val ?? '').replace(/"/g, '""')}"`).join(','))
        .join('\r\n');

      const loadingToast = toast.loading('در حال آماده‌سازی فایل اکسل غایبین...');
      const ok = await downloadFile(`لیست_غایبین_${className.replace(/\s+/g, '_')}_${dateStr}.csv`, csvContent, 'text/csv');
      toast.dismiss(loadingToast);
      if (ok) toast.success('فایل اکسل غایبین با موفقیت دانلود شد 📥');
      else toast.error('خطا در دانلود فایل اکسل');
    } else if (type === 'combined') {
      const headers = ['ردیف', 'نام و نام خانوادگی', 'وضعیت کلاسی', 'ساعت حضور / تماس', 'توضیحات', 'کلاس', 'تاریخ'];
      const presentRows = (report.present_students || []).map((s, idx) => [
        idx + 1,
        s.display_name,
        s.status === 'late' ? 'حاضر با تاخیر' : (s.status === 'excused' ? 'موجه' : 'حاضر'),
        formatClockTime(s.recorded_at),
        s.elapsed_minutes !== null ? `ثبت در دقیقه ${s.elapsed_minutes}` : 'حاضر',
        className,
        getPersianDateText(new Date(report.session?.created_at || Date.now())),
      ]);

      const absentRows = (report.absent_students || []).map((s, idx) => [
        (report.present_students?.length || 0) + idx + 1,
        s.display_name,
        'غایب',
        s.phone || 'بدون شماره',
        'عدم ثبت در مهلت ربع ساعت',
        className,
        getPersianDateText(new Date(report.session?.created_at || Date.now())),
      ]);

      const csvContent = BOM + [headers, ...presentRows, ...absentRows]
        .map((row) => row.map((val) => `"${String(val ?? '').replace(/"/g, '""')}"`).join(','))
        .join('\r\n');

      const loadingToast = toast.loading('در حال آماده‌سازی فایل اکسل جامع...');
      const ok = await downloadFile(`گزارش_جامع_حضور_غیاب_${className.replace(/\s+/g, '_')}_${dateStr}.csv`, csvContent, 'text/csv');
      toast.dismiss(loadingToast);
      if (ok) toast.success('فایل اکسل جامع کلاس با موفقیت دانلود شد 📥');
      else toast.error('خطا در دانلود فایل اکسل');
    }
  };

  /**
   * Export clean, formatted text file (.txt)
   */
  const handleDownloadText = async (type = 'present') => {
    if (!report) return;
    const className = selectedClass?.name || 'کلاس';
    const dateStr = getSafeDateString();
    const datePersian = getPersianDateText(new Date(report.session?.created_at || Date.now()));

    if (type === 'present') {
      if (!report.present_students?.length) {
        toast.error('دانش‌آموزی در لیست حاضرین نیست');
        return;
      }
      const lines = [
        '══════════════════════════════════════════════════════════',
        'گزارش رسمی حضور و غیاب کلاسی - لیست اسامی حاضرین',
        '══════════════════════════════════════════════════════════',
        `نام کلاس: ${className}`,
        `درس / موضوع: ${selectedClass?.subject || 'عمومی'}`,
        `تاریخ جلسه: ${datePersian}`,
        `تعداد کل حاضرین: ${report.present_students.length} نفر`,
        `درصد حضور کلاس: ${report.summary?.attendance_percentage || 0}%`,
        '──────────────────────────────────────────────────────────',
        'ردیف | نام و نام خانوادگی | ساعت ثبت حضور | وضعیت',
        '──────────────────────────────────────────────────────────',
        ...report.present_students.map((s, idx) => {
          const statusLabel = s.status === 'late' ? 'حاضر با تاخیر' : (s.status === 'excused' ? 'موجه' : 'حاضر به موقع');
          return `${String(idx + 1).padEnd(4)} | ${s.display_name.padEnd(22)} | ${formatClockTime(s.recorded_at).padEnd(12)} | ${statusLabel}`;
        }),
        '──────────────────────────────────────────────────────────',
        'سامانه هوشمند مدیریت آموزشی و حضور و غیاب EduConnect',
      ];

      const loadingToast = toast.loading('در حال آماده‌سازی فایل متنی حاضرین...');
      const ok = await downloadFile(`لیست_اسامی_حاضرین_${className.replace(/\s+/g, '_')}_${dateStr}.txt`, lines.join('\r\n'), 'text/plain');
      toast.dismiss(loadingToast);
      if (ok) toast.success('فایل متنی حاضرین با موفقیت دانلود شد 📄');
      else toast.error('خطا در دانلود فایل متنی');
    } else if (type === 'absent') {
      if (!report.absent_students?.length) {
        toast.error('دانش‌آموزی در لیست غایبین نیست');
        return;
      }
      const lines = [
        '══════════════════════════════════════════════════════════',
        'گزارش رسمی حضور و غیاب کلاسی - لیست اسامی غایبین',
        '══════════════════════════════════════════════════════════',
        `نام کلاس: ${className}`,
        `درس / موضوع: ${selectedClass?.subject || 'عمومی'}`,
        `تاریخ جلسه: ${datePersian}`,
        `تعداد کل غایبین: ${report.absent_students.length} نفر`,
        'توضیح: این دانش‌آموزان در مهلت ربع ساعته حضور و غیاب ثبت حضور نکرده‌اند.',
        '──────────────────────────────────────────────────────────',
        'ردیف | نام و نام خانوادگی | شماره تماس پیگیری | وضعیت',
        '──────────────────────────────────────────────────────────',
        ...report.absent_students.map((s, idx) => {
          const phone = s.phone || 'ثبت نشده';
          return `${String(idx + 1).padEnd(4)} | ${s.display_name.padEnd(22)} | ${phone.padEnd(16)} | غایب`;
        }),
        '──────────────────────────────────────────────────────────',
        'سامانه هوشمند مدیریت آموزشی و حضور و غیاب EduConnect',
      ];

      const loadingToast = toast.loading('در حال آماده‌سازی فایل متنی غایبین...');
      const ok = await downloadFile(`لیست_اسامی_غایبین_${className.replace(/\s+/g, '_')}_${dateStr}.txt`, lines.join('\r\n'), 'text/plain');
      toast.dismiss(loadingToast);
      if (ok) toast.success('فایل متنی غایبین با موفقیت دانلود شد 📄');
      else toast.error('خطا در دانلود فایل متنی');
    }
  };

  /**
   * Print / PDF of ONLY Present and Absent Lists (Isolated Clean Report)
   */
  const handlePrintOnlyLists = async (type = 'combined', forceRawPrint = false) => {
    if (!report) {
      toast.error('اطلاعات جلسه برای چاپ یافت نشد');
      return;
    }
    const className = selectedClass?.name || 'کلاس';
    const subjectName = selectedClass?.subject || 'عمومی';
    const gradeName = selectedClass?.grade || '';
    const datePersian = getPersianDateText(new Date(report.session?.created_at || Date.now()));
    const timePersian = formatClockTime(report.session?.created_at || Date.now());

    const presentList = type === 'absent' ? [] : (report.present_students || []);
    const absentList = type === 'present' ? [] : (report.absent_students || []);

    if (type === 'present' && presentList.length === 0) {
      toast.error('دانش‌آموزی در لیست حاضرین نیست');
      return;
    }
    if (type === 'absent' && absentList.length === 0) {
      toast.error('دانش‌آموزی در لیست غایبین نیست');
      return;
    }

    // On mobile / Capacitor WebView, open the rich Preview + Save + Share modal first unless user explicitly triggers raw system print
    if (!forceRawPrint && isMobileOrNativeWebView()) {
      await handleOpenExportPreview(type);
      return;
    }

    let docTitle = 'گزارش رسمی حضور و غیاب کلاسی';
    if (type === 'present') docTitle = 'لیست اسامی حاضرین کلاس';
    if (type === 'absent') docTitle = 'لیست اسامی غایبین کلاس';

    const printHtml = `
      <!DOCTYPE html>
      <html lang="fa" dir="rtl">
      <head>
        <meta charset="utf-8">
        <title>${docTitle} - ${className}</title>
        <style>
          @page {
            size: A4 portrait;
            margin: 14mm 12mm 14mm 12mm;
          }
          * {
            box-sizing: border-box;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          body {
            font-family: 'Vazirmatn', -apple-system, BlinkMacSystemFont, Tahoma, Arial, sans-serif;
            direction: rtl;
            margin: 0;
            padding: 0;
            color: #0f172a;
            background: #ffffff;
            font-size: 13px;
            line-height: 1.5;
          }
          .report-header {
            border-bottom: 2px solid #3b82f6;
            padding-bottom: 12px;
            margin-bottom: 16px;
            display: flex;
            justify-content: space-between;
            align-items: center;
          }
          .header-title-box h1 {
            font-size: 19px;
            margin: 0 0 6px 0;
            color: #1e3a8a;
            font-weight: 800;
          }
          .header-meta {
            display: flex;
            gap: 16px;
            font-size: 12px;
            color: #475569;
          }
          .stats-badge-box {
            display: flex;
            gap: 10px;
            margin-bottom: 16px;
          }
          .stat-pill {
            padding: 5px 14px;
            border-radius: 8px;
            font-size: 12px;
            font-weight: 700;
          }
          .stat-present { background: #dcfce7; color: #15803d; border: 1px solid #86efac; }
          .stat-absent { background: #fee2e2; color: #b91c1c; border: 1px solid #fca5a5; }
          .stat-ratio { background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe; }

          .section-title {
            font-size: 14px;
            font-weight: 700;
            margin: 14px 0 8px 0;
            padding: 6px 12px;
            border-radius: 6px;
          }
          .section-present { background: #f0fdf4; color: #166534; border-right: 4px solid #16a34a; }
          .section-absent { background: #fef2f2; color: #991b1b; border-right: 4px solid #dc2626; }

          table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 16px;
            page-break-inside: auto;
          }
          tr {
            page-break-inside: avoid;
            page-break-after: auto;
          }
          th, td {
            border: 1px solid #cbd5e1;
            padding: 7px 10px;
            text-align: right;
            font-size: 12px;
          }
          th {
            background-color: #f1f5f9;
            color: #334155;
            font-weight: 700;
          }
          tbody tr:nth-child(even) {
            background-color: #f8fafc;
          }
          .status-tag {
            display: inline-block;
            padding: 2px 8px;
            border-radius: 4px;
            font-size: 11px;
            font-weight: 700;
          }
          .tag-present { background: #d1fae5; color: #065f46; }
          .tag-late { background: #fef3c7; color: #92400e; }
          .tag-absent { background: #fee2e2; color: #991b1b; }
          .signature-box {
            margin-top: 28px;
            display: flex;
            justify-content: space-between;
            padding: 0 20px;
            font-size: 12px;
            font-weight: 600;
            color: #334155;
          }
          .report-footer {
            margin-top: 24px;
            padding-top: 10px;
            border-top: 1px dashed #cbd5e1;
            display: flex;
            justify-content: space-between;
            font-size: 11px;
            color: #64748b;
          }
        </style>
      </head>
      <body>
        <div class="report-header">
          <div class="header-title-box">
            <h1>${docTitle}</h1>
            <div class="header-meta">
              <span><strong>کلاس:</strong> ${className} ${gradeName ? `(${gradeName})` : ''}</span>
              <span><strong>درس:</strong> ${subjectName}</span>
              <span><strong>تاریخ جلسه:</strong> ${datePersian}</span>
              <span><strong>ساعت بازگشایی:</strong> ${timePersian}</span>
            </div>
          </div>
          <div style="text-align: left; font-size: 11px; color: #64748b;">
            سامانه هوشمند EduConnect<br>
            تاریخ چاپ: ${new Date().toLocaleDateString('fa-IR')}
          </div>
        </div>

        <div class="stats-badge-box">
          <div class="stat-pill stat-present">تعداد حاضرین: ${report.present_students?.length || 0} نفر</div>
          <div class="stat-pill stat-absent">تعداد غایبین: ${report.absent_students?.length || 0} نفر</div>
          <div class="stat-pill stat-ratio">درصد مشارکت کلاسی: ${report.summary?.attendance_percentage || 0}%</div>
        </div>

        ${(type === 'combined' || type === 'present') ? `
          <div class="section-title section-present">✓ اسامی دانش‌آموزان حاضر (${presentList.length} نفر)</div>
          ${presentList.length === 0 ? '<p style="color:#64748b; padding:10px 0;">دانش‌آموزی در لیست حاضرین ثبت نشده است.</p>' : `
          <table>
            <thead>
              <tr>
                <th style="width: 50px; text-align: center;">ردیف</th>
                <th>نام و نام خانوادگی</th>
                <th style="width: 140px; text-align: center;">ساعت ثبت حضور</th>
                <th style="width: 120px; text-align: center;">وضعیت</th>
                <th style="width: 130px; text-align: center;">زمان پس از بازگشایی</th>
              </tr>
            </thead>
            <tbody>
              ${presentList.map((s, idx) => `
                <tr>
                  <td style="text-align: center;">${idx + 1}</td>
                  <td style="font-weight: 700;">${s.display_name}</td>
                  <td style="text-align: center; direction: ltr; font-family: monospace;">${formatClockTime(s.recorded_at)}</td>
                  <td style="text-align: center;">
                    <span class="status-tag ${s.status === 'late' ? 'tag-late' : 'tag-present'}">
                      ${s.status === 'late' ? 'حاضر با تاخیر' : (s.status === 'excused' ? 'موجه' : 'حاضر به موقع ✓')}
                    </span>
                  </td>
                  <td style="text-align: center;">${s.elapsed_minutes !== null ? `${s.elapsed_minutes} دقیقه` : '—'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          `}
        ` : ''}

        ${(type === 'combined' || type === 'absent') ? `
          <div class="section-title section-absent">✕ اسامی دانش‌آموزان غایب (${absentList.length} نفر)</div>
          ${absentList.length === 0 ? '<p style="color:#16a34a; padding:10px 0; font-weight: bold;">🎉 تمامی دانش‌آموزان کلاس حاضر ثبت شده‌اند و هیچ غایبی وجود ندارد.</p>' : `
          <table>
            <thead>
              <tr>
                <th style="width: 50px; text-align: center;">ردیف</th>
                <th>نام و نام خانوادگی</th>
                <th style="width: 160px; text-align: center;">شماره تماس پیگیری</th>
                <th style="width: 100px; text-align: center;">وضعیت</th>
                <th>علت / توضیح</th>
              </tr>
            </thead>
            <tbody>
              ${absentList.map((s, idx) => `
                <tr>
                  <td style="text-align: center;">${idx + 1}</td>
                  <td style="font-weight: 700; color: #991b1b;">${s.display_name}</td>
                  <td style="text-align: center; direction: ltr; font-family: monospace;">${s.phone || 'ثبت نشده'}</td>
                  <td style="text-align: center;"><span class="status-tag tag-absent">غایب ✕</span></td>
                  <td style="color: #64748b; font-size: 11px;">عدم اعلام حضور در مهلت ربع ساعت</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          `}
        ` : ''}

        <div class="signature-box">
          <div>امضای دبیر محترم: .......................................</div>
          <div>امضای معاون / مسئول انضباطی: .......................................</div>
        </div>

        <div class="report-footer">
          <span>گزارش رسمی حضور و غیاب ثبت‌شده در سرور سامانه مدیریت آموزشی</span>
          <span>نسخه چاپی اختصاصی اسامی</span>
        </div>
      </body>
      </html>
    `;

    let printWin = null;
    try {
      printWin = window.open('', '_blank');
    } catch (_e) {}

    if (printWin) {
      printWin.document.open();
      printWin.document.write(printHtml);
      printWin.document.close();
      printWin.focus();
      setTimeout(() => {
        try {
          printWin.print();
        } catch (_pe) {}
      }, 500);
    } else {
      const printFrame = document.createElement('iframe');
      printFrame.style.position = 'fixed';
      printFrame.style.right = '0';
      printFrame.style.bottom = '0';
      printFrame.style.width = '200px';
      printFrame.style.height = '200px';
      printFrame.style.opacity = '0.01';
      printFrame.style.pointerEvents = 'none';
      printFrame.style.border = '0';
      document.body.appendChild(printFrame);

      const frameDoc = printFrame.contentWindow?.document;
      if (frameDoc) {
        frameDoc.open();
        frameDoc.write(printHtml);
        frameDoc.close();
        printFrame.contentWindow?.focus();
        setTimeout(() => {
          try {
            printFrame.contentWindow?.print();
          } catch (_pe) {
            window.print();
          }
          setTimeout(() => {
            if (document.body.contains(printFrame)) {
              document.body.removeChild(printFrame);
            }
          }, 2000);
        }, 500);
      } else {
        window.print();
      }
    }
  };

  /**
   * Helper to render crisp attendance report canvas with complete font loading
   */
  const buildAttendanceCanvas = async (type = 'combined') => {
    if (!report) return null;
    const className = selectedClass?.name || 'کلاس';
    const datePersian = getPersianDateText(new Date(report.session?.created_at || Date.now()));

    const presentList = type === 'absent' ? [] : (report.present_students || []);
    const absentList = type === 'present' ? [] : (report.absent_students || []);

    if (type === 'present' && presentList.length === 0) {
      toast.error('دانش‌آموزی در لیست حاضرین نیست');
      return null;
    }
    if (type === 'absent' && absentList.length === 0) {
      toast.error('دانش‌آموزی در لیست غایبین نیست');
      return null;
    }

    try {
      if (document.fonts?.ready) {
        await document.fonts.ready;
      }
    } catch (_fe) {}

    let mainTitle = 'گزارش تفکیکی اسامی حضور و غیاب';
    if (type === 'present') mainTitle = 'لیست اسامی حاضرین کلاس';
    if (type === 'absent') mainTitle = 'لیست اسامی غایبین کلاس';

    const width = 940;
    const rowHeight = 42;
    const headerHeight = 130;
    const sectionHeaderHeight = 44;
    const tableHeaderHeight = 36;
    const footerHeight = 60;

    let totalHeight = headerHeight + footerHeight;
    if (type === 'combined' || type === 'present') {
      totalHeight += sectionHeaderHeight + tableHeaderHeight + Math.max(presentList.length, 1) * rowHeight + 20;
    }
    if (type === 'combined' || type === 'absent') {
      totalHeight += sectionHeaderHeight + tableHeaderHeight + Math.max(absentList.length, 1) * rowHeight + 20;
    }

    const canvas = document.createElement('canvas');
    const dpr = 2;
    canvas.width = width * dpr;
    canvas.height = totalHeight * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    // Canvas Background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, totalHeight);

    // Top Accent Bar
    const gradient = ctx.createLinearGradient(0, 0, width, 0);
    gradient.addColorStop(0, '#3b82f6');
    gradient.addColorStop(0.5, '#6366f1');
    gradient.addColorStop(1, '#8b5cf6');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, 8);

    ctx.direction = 'rtl';
    ctx.textAlign = 'right';

    // Main Header Title
    let currentY = 46;
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 22px Vazirmatn, Tahoma, Arial, sans-serif';
    ctx.fillText(mainTitle, width - 36, currentY);

    currentY += 26;
    ctx.fillStyle = '#475569';
    ctx.font = '13px Vazirmatn, Tahoma, Arial, sans-serif';
    const metaStr = `کلاس: ${className}   |   درس: ${selectedClass?.subject || 'عمومی'}   |   تاریخ: ${datePersian}`;
    ctx.fillText(metaStr, width - 36, currentY);

    // Summary pills on top-left
    ctx.direction = 'ltr';
    ctx.textAlign = 'left';
    let pillX = 36;
    const drawBadge = (txt, bg, fg) => {
      ctx.font = 'bold 12px Vazirmatn, Tahoma, Arial, sans-serif';
      const tw = ctx.measureText(txt).width;
      ctx.fillStyle = bg;
      if (ctx.roundRect) {
        ctx.beginPath();
        ctx.roundRect(pillX, 32, tw + 20, 30, 8);
        ctx.fill();
      } else {
        ctx.fillRect(pillX, 32, tw + 20, 30);
      }
      ctx.fillStyle = fg;
      ctx.fillText(txt, pillX + 10, 52);
      pillX += tw + 26;
    };
    drawBadge(`حاضرین: ${report.present_students?.length || 0}`, '#dcfce7', '#15803d');
    drawBadge(`غایبین: ${report.absent_students?.length || 0}`, '#fee2e2', '#b91c1c');
    drawBadge(`مشارکت: ${report.summary?.attendance_percentage || 0}%`, '#eff6ff', '#1d4ed8');

    // Separator line
    currentY += 22;
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(36, currentY);
    ctx.lineTo(width - 36, currentY);
    ctx.stroke();
    currentY += 20;

    ctx.direction = 'rtl';

    // Helper to draw clean table
    const renderTable = (secTitle, items, isPresent) => {
      ctx.fillStyle = isPresent ? '#f0fdf4' : '#fef2f2';
      if (ctx.roundRect) {
        ctx.beginPath();
        ctx.roundRect(36, currentY, width - 72, 36, 6);
        ctx.fill();
      } else {
        ctx.fillRect(36, currentY, width - 72, 36);
      }

      ctx.fillStyle = isPresent ? '#16a34a' : '#dc2626';
      ctx.fillRect(width - 42, currentY, 6, 36);

      ctx.fillStyle = isPresent ? '#166534' : '#991b1b';
      ctx.font = 'bold 14px Vazirmatn, Tahoma, Arial, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(`${isPresent ? '✓' : '✕'} ${secTitle} (${items.length} نفر)`, width - 56, currentY + 23);

      currentY += 44;

      // Table Header Row
      ctx.fillStyle = '#f1f5f9';
      ctx.fillRect(36, currentY, width - 72, tableHeaderHeight);
      ctx.strokeStyle = '#cbd5e1';
      ctx.strokeRect(36, currentY, width - 72, tableHeaderHeight);

      ctx.fillStyle = '#334155';
      ctx.font = 'bold 12px Vazirmatn, Tahoma, Arial, sans-serif';
      ctx.fillText('ردیف', width - 50, currentY + 23);
      ctx.fillText('نام و نام خانوادگی', width - 120, currentY + 23);
      if (isPresent) {
        ctx.fillText('ساعت ثبت حضور', width - 440, currentY + 23);
        ctx.fillText('وضعیت', width - 620, currentY + 23);
        ctx.fillText('زمان پس از بازگشایی', width - 760, currentY + 23);
      } else {
        ctx.fillText('شماره تماس پیگیری', width - 440, currentY + 23);
        ctx.fillText('وضعیت', width - 620, currentY + 23);
        ctx.fillText('علت / توضیح', width - 760, currentY + 23);
      }

      currentY += tableHeaderHeight;

      if (items.length === 0) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(36, currentY, width - 72, rowHeight);
        ctx.strokeStyle = '#e2e8f0';
        ctx.strokeRect(36, currentY, width - 72, rowHeight);

        ctx.fillStyle = isPresent ? '#64748b' : '#16a34a';
        ctx.font = '13px Vazirmatn, Tahoma, Arial, sans-serif';
        ctx.fillText(
          isPresent ? 'دانش‌آموزی در لیست حاضرین ثبت نشده است.' : '🎉 هیچ دانش‌آموز غایبی وجود ندارد و همه حاضر هستند.',
          width - 60,
          currentY + 26
        );
        currentY += rowHeight + 20;
        return;
      }

      // Rows
      items.forEach((s, idx) => {
        ctx.fillStyle = idx % 2 === 0 ? '#ffffff' : '#f8fafc';
        ctx.fillRect(36, currentY, width - 72, rowHeight);
        ctx.strokeStyle = '#e2e8f0';
        ctx.strokeRect(36, currentY, width - 72, rowHeight);

        // Row index
        ctx.fillStyle = '#64748b';
        ctx.font = '12px Vazirmatn, Tahoma, Arial, sans-serif';
        ctx.fillText(String(idx + 1), width - 50, currentY + 26);

        // Name
        ctx.fillStyle = isPresent ? '#0f172a' : '#991b1b';
        ctx.font = 'bold 13px Vazirmatn, Tahoma, Arial, sans-serif';
        ctx.fillText(s.display_name || '', width - 120, currentY + 26);

        if (isPresent) {
          ctx.fillStyle = '#059669';
          ctx.font = 'bold 12px monospace, Vazirmatn, Tahoma, sans-serif';
          ctx.fillText(formatClockTime(s.recorded_at), width - 440, currentY + 26);

          ctx.fillStyle = s.status === 'late' ? '#d97706' : '#16a34a';
          ctx.font = 'bold 12px Vazirmatn, Tahoma, Arial, sans-serif';
          ctx.fillText(s.status === 'late' ? 'حاضر با تاخیر' : (s.status === 'excused' ? 'موجه' : 'حاضر به موقع ✓'), width - 620, currentY + 26);

          ctx.fillStyle = '#64748b';
          ctx.font = '12px Vazirmatn, Tahoma, Arial, sans-serif';
          ctx.fillText(s.elapsed_minutes !== null ? `${s.elapsed_minutes} دقیقه` : '—', width - 760, currentY + 26);
        } else {
          ctx.fillStyle = '#475569';
          ctx.font = '12px monospace, Vazirmatn, Tahoma, sans-serif';
          ctx.fillText(s.phone || 'ثبت نشده', width - 440, currentY + 26);

          ctx.fillStyle = '#dc2626';
          ctx.font = 'bold 12px Vazirmatn, Tahoma, Arial, sans-serif';
          ctx.fillText('غایب ✕', width - 620, currentY + 26);

          ctx.fillStyle = '#94a3b8';
          ctx.font = '11px Vazirmatn, Tahoma, Arial, sans-serif';
          ctx.fillText('عدم ثبت در مهلت ربع ساعت', width - 760, currentY + 26);
        }

        currentY += rowHeight;
      });

      currentY += 20;
    };

    if (type === 'combined' || type === 'present') {
      renderTable('اسامی دانش‌آموزان حاضر در کلاس', presentList, true);
    }
    if (type === 'combined' || type === 'absent') {
      renderTable('اسامی دانش‌آموزان غایب در کلاس', absentList, false);
    }

    // Footer
    ctx.fillStyle = '#94a3b8';
    ctx.font = '11px Vazirmatn, Tahoma, Arial, sans-serif';
    ctx.fillText('سامانه هوشمند مدیریت آموزشی EduConnect — دریافت رسمی فایل اسامی حضور و غیاب', width - 36, currentY + 16);

    return canvas;
  };

  const canvasToPngBlob = (canvas) =>
    new Promise((resolve) => {
      try {
        canvas.toBlob((blob) => resolve(blob), 'image/png');
      } catch (_e) {
        resolve(null);
      }
    });

  /**
   * Build PDF Blob containing ONLY present and absent lists
   */
  const buildAttendancePdfAsset = async (type = 'combined') => {
    const canvas = await buildAttendanceCanvas(type);
    if (!canvas) return null;

    const className = selectedClass?.name || 'کلاس';
    const dateStr = getSafeDateString();
    let mainTitle = 'گزارش تفکیکی اسامی حضور و غیاب';
    if (type === 'present') mainTitle = 'لیست اسامی حاضرین کلاس';
    if (type === 'absent') mainTitle = 'لیست اسامی غایبین کلاس';

    const filename = `PDF_${mainTitle.replace(/\s+/g, '_')}_${className.replace(/\s+/g, '_')}_${dateStr}.pdf`;
    const { jsPDF } = await import('jspdf');
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pdfWidth = 210;
    const pdfHeight = 297;
    const margin = 8;
    const printWidth = pdfWidth - margin * 2;
    const printHeight = (canvas.height / canvas.width) * printWidth;
    const maxPageContentHeight = pdfHeight - margin * 2;

    const imgData = canvas.toDataURL('image/png');

    if (printHeight <= maxPageContentHeight) {
      pdf.addImage(imgData, 'PNG', margin, margin, printWidth, printHeight);
    } else {
      let position = 0;
      let pageHeightLeft = printHeight;
      while (pageHeightLeft > 0) {
        if (position > 0) {
          pdf.addPage();
        }
        pdf.addImage(imgData, 'PNG', margin, margin - position, printWidth, printHeight);
        position += maxPageContentHeight;
        pageHeightLeft -= maxPageContentHeight;
      }
    }

    const pdfBlob = pdf.output('blob');
    return { blob: pdfBlob, filename, title: mainTitle };
  };

  /**
   * Open Visual Preview Modal with Download (PNG / PDF / Excel) & Share controls
   */
  const handleOpenExportPreview = async (type = 'combined') => {
    if (!report) {
      toast.error('اطلاعات جلسه یافت نشد');
      return;
    }
    const loadingToast = toast.loading('در حال آماده‌سازی پیش‌نمایش فایل اسامی...');
    try {
      const canvas = await buildAttendanceCanvas(type);
      toast.dismiss(loadingToast);
      if (!canvas) return;

      const dataUrl = canvas.toDataURL('image/png');
      let title = 'گزارش تفکیکی اسامی حضور و غیاب';
      if (type === 'present') title = 'لیست اسامی حاضرین کلاس';
      if (type === 'absent') title = 'لیست اسامی غایبین کلاس';

      setExportPreview({ type, title, dataUrl });
    } catch (err) {
      console.error('Preview error:', err);
      toast.dismiss(loadingToast);
      toast.error('خطا در ساخت پیش‌نمایش گزارش');
    }
  };

  /**
   * Share or Save PNG / PDF attendance list cleanly
   */
  const handleShareAttendanceFile = async (type = 'combined', format = 'image') => {
    if (!report) {
      toast.error('اطلاعات جلسه یافت نشد');
      return;
    }
    const className = selectedClass?.name || 'کلاس';
    const dateStr = getSafeDateString();
    const loadingToast = toast.loading('در حال آماده‌سازی فایل برای اشتراک‌گذاری...');
    try {
      let blob = null;
      let filename = '';
      let mimeType = 'image/png';
      let title = 'گزارش حضور و غیاب';

      if (format === 'pdf') {
        const asset = await buildAttendancePdfAsset(type);
        if (!asset) {
          toast.dismiss(loadingToast);
          return;
        }
        blob = asset.blob;
        filename = asset.filename;
        mimeType = 'application/pdf';
        title = asset.title;
      } else {
        const canvas = await buildAttendanceCanvas(type);
        if (!canvas) {
          toast.dismiss(loadingToast);
          return;
        }
        blob = await canvasToPngBlob(canvas);
        let mainTitle = 'گزارش تفکیکی اسامی حضور و غیاب';
        if (type === 'present') mainTitle = 'لیست اسامی حاضرین کلاس';
        if (type === 'absent') mainTitle = 'لیست اسامی غایبین کلاس';
        filename = `عکس_${mainTitle.replace(/\s+/g, '_')}_${className.replace(/\s+/g, '_')}_${dateStr}.png`;
        title = mainTitle;
      }

      toast.dismiss(loadingToast);
      if (!blob) {
        toast.error('خطا در ساخت فایل خروجی');
        return;
      }

      const result = await shareOrDownloadBlob(
        blob,
        filename,
        mimeType,
        title,
        `${title} — ${className}`
      );
      if (result.shared) {
        toast.success('فایل با موفقیت به اشتراک گذاشته شد 📤');
      } else if (result.downloaded) {
        toast.success('فایل برای ذخیره و اشتراک‌گذاری دانلود شد 📥');
      }
    } catch (err) {
      console.error('Share error:', err);
      toast.dismiss(loadingToast);
      toast.error('خطا در اشتراک‌گذاری فایل');
    }
  };

  /**
   * Export crisp PNG Image containing ONLY present and absent lists
   */
  const handleDownloadImage = async (type = 'combined') => {
    if (!report) {
      toast.error('اطلاعات جلسه یافت نشد');
      return;
    }
    const loadingToast = toast.loading('در حال ساخت و دانلود عکس اسامی...');
    try {
      const canvas = await buildAttendanceCanvas(type);
      if (!canvas) {
        toast.dismiss(loadingToast);
        return;
      }

      const className = selectedClass?.name || 'کلاس';
      const dateStr = getSafeDateString();
      let mainTitle = 'گزارش تفکیکی اسامی حضور و غیاب';
      if (type === 'present') mainTitle = 'لیست اسامی حاضرین کلاس';
      if (type === 'absent') mainTitle = 'لیست اسامی غایبین کلاس';

      const filename = `عکس_${mainTitle.replace(/\s+/g, '_')}_${className.replace(/\s+/g, '_')}_${dateStr}.png`;
      const pngBlob = (await canvasToPngBlob(canvas)) || canvas.toDataURL('image/png');
      const ok = await triggerReliableDownload(pngBlob, filename, 'image/png');
      toast.dismiss(loadingToast);
      if (ok) {
        toast.success('فایل عکس اسامی با موفقیت دانلود شد 🖼️');
      } else {
        toast.error('خطا در ذخیره تصویر');
      }
    } catch (_err) {
      toast.dismiss(loadingToast);
      toast.error('خطا در ذخیره تصویر');
    }
  };

  /**
   * Export official PDF document containing ONLY present and absent lists
   */
  const handleDownloadPdf = async (type = 'combined') => {
    if (!report) {
      toast.error('اطلاعات جلسه یافت نشد');
      return;
    }
    const loadingToast = toast.loading('در حال ساخت فایل PDF رسمی اسامی...');

    try {
      const asset = await buildAttendancePdfAsset(type);
      if (!asset) {
        toast.dismiss(loadingToast);
        return;
      }
      const ok = await triggerReliableDownload(asset.blob, asset.filename, 'application/pdf');
      toast.dismiss(loadingToast);
      if (ok) {
        toast.success('فایل رسمی PDF اسامی با موفقیت دانلود شد 📄📥');
      } else {
        toast.error('خطا در دانلود فایل PDF');
      }
    } catch (err) {
      console.error(err);
      toast.dismiss(loadingToast);
      toast.error('خطا در ایجاد فایل PDF');
    }
  };

  /**
   * Print Report (Defaults to isolated clean lists)
   */
  const handlePrint = () => {
    handlePrintOnlyLists('combined');
  };

  // Convert remaining seconds to MM:SS
  const formatRemainingTime = (secs) => {
    if (secs === null || secs <= 0) return '۰۰:۰۰';
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const selectedClass = classes.find((c) => c.id === selectedClassId);

  // Filtered reports for Management Overview
  const filteredSharedReports = sharedReports.filter((r) => {
    const matchesTeacher =
      teacherFilter === 'all' ||
      r.teacher_code === teacherFilter ||
      r.teacher_name === teacherFilter;
    const matchesSearch =
      !mgmtSearchQuery.trim() ||
      (r.teacher_name && r.teacher_name.toLowerCase().includes(mgmtSearchQuery.toLowerCase())) ||
      (r.class_name && r.class_name.toLowerCase().includes(mgmtSearchQuery.toLowerCase())) ||
      (r.subject && r.subject.toLowerCase().includes(mgmtSearchQuery.toLowerCase())) ||
      (r.absent_students || []).some(
        (s) => s.name && s.name.toLowerCase().includes(mgmtSearchQuery.toLowerCase())
      );
    return matchesTeacher && matchesSearch;
  });

  const uniqueTeachers = Array.from(
    new Map(
      sharedReports.map((r) => [r.teacher_code || r.teacher_name, { name: r.teacher_name, code: r.teacher_code }])
    ).values()
  );

  const totalMgmtSessions = sharedReports.length;
  const totalMgmtPresent = sharedReports.reduce((acc, r) => acc + (r.present_count || 0), 0);
  const totalMgmtAbsent = sharedReports.reduce((acc, r) => acc + (r.absent_count || 0), 0);
  const avgAttendancePercentage =
    totalMgmtSessions > 0
      ? Math.round(
          sharedReports.reduce((acc, r) => acc + (r.attendance_percentage || 0), 0) / totalMgmtSessions
        )
      : 0;

  return (
    <div className={styles.container}>
      {/* Page Header */}
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>
            <HiOutlineSparkles style={{ color: '#818cf8' }} />
            حضور و غیاب هوشمند و فوری
          </h1>
          <p className={styles.subtitle}>
            {isAdmin
              ? 'رویت کل وضعیت حضور و غیاب مدرسه به تفکیک معلمان، دریافت گزارش‌های زنده کلاسی و پیگیری غایبین'
              : isTeacher
              ? 'ایجاد باکس حضور و غیاب ۱۵ دقیقه‌ای (بدون نیاز به کد)، ثبت آنی حاضرین، اشتراک‌گذاری با مدیریت و تفکیک غایبین'
              : 'ثبت حضور با یک کلیک ساده بدون نیاز به وارد کردن هرگونه کد ورود'}
          </p>
        </div>

        {/* Class Selector Bar */}
        <div className={styles.classSelectGroup}>
          <label style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
            انتخاب کلاس:
          </label>
          <select
            className={styles.classSelect}
            value={selectedClassId}
            onChange={(e) => setSelectedClassId(e.target.value)}
          >
            {classes.map((cls) => (
              <option key={cls.id} value={cls.id}>
                {cls.name} {cls.grade ? `(${cls.grade})` : ''} - {cls.subject || 'عمومی'}
              </option>
            ))}
          </select>

          <button
            className="btn btn-secondary btn-sm"
            onClick={loadSessionData}
            title="تازه سازی اطلاعات"
          >
            <HiOutlineArrowPath />
            <span>تازه سازی</span>
          </button>
        </div>
      </div>

      {/* Mode Switcher Tabs for Teachers & Management */}
      {!isStudent && (
        <div className={styles.modeTabs} style={{ marginBottom: '22px' }}>
          <button
            type="button"
            className={`${styles.modeTabBtn} ${activeModeTab === 'management_overview' ? styles.modeTabBtnActive : ''}`}
            onClick={() => setActiveModeTab('management_overview')}
          >
            <HiOutlineBuildingOffice2 style={{ fontSize: '1.25rem', flexShrink: 0 }} />
            <span>🏛️ حضور و غیاب کل مدرسه ({sharedReports.length} جلسه)</span>
          </button>
          <button
            type="button"
            className={`${styles.modeTabBtn} ${activeModeTab === 'class_session' ? styles.modeTabBtnActive : ''}`}
            onClick={() => setActiveModeTab('class_session')}
          >
            <HiOutlineAcademicCap style={{ fontSize: '1.25rem', flexShrink: 0 }} />
            <span>👨‍🏫 ثبت و مدیریت باکس کلاسی ({selectedClass?.name || 'کلاس انتخابی'})</span>
          </button>
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px 0' }}>
          <div className="spinner" style={{ margin: '0 auto' }}></div>
          <p style={{ marginTop: '14px', color: 'var(--text-tertiary)' }}>در حال بارگذاری اطلاعات حضور و غیاب...</p>
        </div>
      ) : isStudent ? (
        /* ══════════════════════════════════════════════════════════════════
           STUDENT VIEW (نمای دانش‌آموز: ثبت بدون کد با یک دکمه)
           ══════════════════════════════════════════════════════════════════ */
        <div className={styles.studentViewBox}>
          <div style={{ fontSize: '3.5rem' }}>✋</div>
          <h2 style={{ fontSize: '1.6rem', fontWeight: 800 }}>حضور و غیاب کلاسی</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
            کلاس فعلی: <strong>{selectedClass?.name || 'کلاس'}</strong>
          </p>

          {studentRecord || (report?.present_students?.some((s) => s.student_id === user?.id)) ? (
            /* Student has successfully checked in */
            <div className={styles.successCard}>
              <div style={{ fontSize: '2rem' }}>🎉</div>
              <h3 style={{ fontSize: '1.35rem', fontWeight: 800, color: '#34d399' }}>
                حضور شما با موفقیت ثبت گردید!
              </h3>
              <p style={{ fontSize: '0.9rem', color: 'rgba(255, 255, 255, 0.85)' }}>
                ساعت دقیق اعلام حضور شما توسط سامانه ثبت شد:
              </p>
              <div className={styles.recordedTimeHero}>
                {formatClockTime(
                  studentRecord?.recorded_at ||
                    report?.present_students?.find((s) => s.student_id === user?.id)?.recorded_at
                )}
              </div>
              <span style={{ fontSize: '0.8125rem', color: '#6ee7b7' }}>
                وضعیت: حاضر در کلاس ✅
              </span>
            </div>
          ) : activeSession ? (
            /* Active session available: Single click check-in button */
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px', width: '100%' }}>
              <div
                style={{
                  background: 'rgba(99, 102, 241, 0.15)',
                  border: '1px solid rgba(129, 140, 248, 0.3)',
                  padding: '12px 24px',
                  borderRadius: 'var(--radius-2xl)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                }}
              >
                <div className={styles.pulseDot}></div>
                <span style={{ fontSize: '0.95rem', fontWeight: 600 }}>باکس حضور و غیاب باز است</span>
                <span style={{ fontFamily: 'monospace', fontWeight: 800, color: '#6ee7b7', fontSize: '1.2rem', direction: 'ltr' }}>
                  {formatRemainingTime(remainingSeconds)}
                </span>
                <span style={{ fontSize: '0.8rem', opacity: 0.8 }}>مانده از ربع ساعت</span>
              </div>

              <button
                type="button"
                className={styles.studentPresenceBtn}
                onClick={handleStudentCheckIn}
                disabled={checkingIn}
              >
                <HiOutlineHandRaised style={{ fontSize: '1.8rem' }} />
                <span>{checkingIn ? 'در حال ثبت حضور...' : 'ثبت حضور من در کلاس ✋'}</span>
              </button>

              <span style={{ fontSize: '0.85rem', color: 'var(--text-tertiary)' }}>
                نیازی به کد نیست؛ کافیست دکمه فوق را بفشارید تا ساعت حضورتان ثبت شود.
              </span>
            </div>
          ) : (
            /* No active session */
            <div className={styles.emptyStateBox} style={{ width: '100%' }}>
              <HiOutlineClock style={{ fontSize: '2.5rem', opacity: 0.6 }} />
              <p style={{ fontWeight: 600 }}>در حال حاضر باکس حضور و غیاب فعالی برای این کلاس باز نیست.</p>
              <span style={{ fontSize: '0.8125rem' }}>
                به محض اینکه دبیر باکس ۱۵ دقیقه‌ای را فعال کند، دکمه ثبت حضور در این صفحه ظاهر خواهد شد.
              </span>
            </div>
          )}
        </div>
      ) : activeModeTab === 'management_overview' ? (
        /* ══════════════════════════════════════════════════════════════════
           MANAGEMENT OVERVIEW (نمای مدیریت: حضور و غیاب کل به تفکیک معلمان)
           ══════════════════════════════════════════════════════════════════ */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Top KPI Cards for Management */}
          <div className={styles.statsGrid}>
            <div className={styles.statCard}>
              <div className={styles.statIcon} style={{ background: 'rgba(99, 102, 241, 0.15)', color: '#818cf8' }}>
                <HiOutlineBuildingOffice2 />
              </div>
              <div>
                <div className={styles.statVal}>{totalMgmtSessions} جلسه</div>
                <div className={styles.statLabel}>کل جلسات ثبت‌شده معلمان</div>
              </div>
            </div>

            <div className={styles.statCard}>
              <div className={styles.statIcon} style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#34d399' }}>
                <HiOutlineCheckCircle />
              </div>
              <div>
                <div className={styles.statVal}>{totalMgmtPresent} نفر</div>
                <div className={styles.statLabel}>مجموع دانش‌آموزان حاضر</div>
              </div>
            </div>

            <div className={styles.statCard}>
              <div className={styles.statIcon} style={{ background: 'rgba(239, 68, 68, 0.15)', color: '#f87171' }}>
                <HiOutlineXCircle />
              </div>
              <div>
                <div className={styles.statVal}>{totalMgmtAbsent} نفر</div>
                <div className={styles.statLabel}>مجموع غایبین تمام کلاس‌ها</div>
              </div>
            </div>

            <div className={styles.statCard}>
              <div className={styles.statIcon} style={{ background: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa' }}>
                <HiOutlineSparkles />
              </div>
              <div>
                <div className={styles.statVal}>{avgAttendancePercentage}%</div>
                <div className={styles.statLabel}>میانگین حضور کل مدرسه</div>
              </div>
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
                  placeholder="جستجو در نام معلم، کد دبیر، کلاس یا دانش‌آموز غایب..."
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

          {/* Teacher Breakdown Cards Grid */}
          {filteredSharedReports.length === 0 ? (
            <div className={styles.emptyStateBox}>
              <HiOutlineBuildingOffice2 style={{ fontSize: '3rem', opacity: 0.5 }} />
              <p style={{ fontWeight: 700, fontSize: '1rem' }}>گزارشی با فیلترهای انتخابی یافت نشد</p>
              <span style={{ fontSize: '0.8125rem' }}>
                دبیران می‌توانند پس از اتمام ربع ساعت حضور و غیاب، با زدن دکمه «اشتراک‌گذاری با مدیریت»، گزارش را فوراً برای شما بفرستند.
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
                          background: rep.status === 'acknowledged' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                          color: rep.status === 'acknowledged' ? '#10b981' : '#f59e0b',
                          border: `1px solid ${rep.status === 'acknowledged' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(245, 158, 11, 0.3)'}`,
                        }}
                      >
                        {rep.status === 'acknowledged' ? '✓ تایید مدیریت' : '⏳ در انتظار رویت'}
                      </span>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', marginTop: '4px', direction: 'ltr' }}>
                        {rep.date} - {rep.time}
                      </div>
                    </div>
                  </div>

                  {/* Attendance Stats Badges */}
                  <div className={styles.mgmtStatsPills}>
                    <div className={`${styles.statBadgeItem} ${styles.statBadgePresent}`}>
                      <span>✓ حاضرین:</span>
                      <strong>{rep.present_count} نفر</strong>
                    </div>
                    <div className={`${styles.statBadgeItem} ${styles.statBadgeAbsent}`}>
                      <span>✕ غایبین:</span>
                      <strong>{rep.absent_count} نفر</strong>
                    </div>
                    {rep.late_count > 0 && (
                      <div className={`${styles.statBadgeItem} ${styles.statBadgeLate}`}>
                        <span>⏰ با تاخیر:</span>
                        <strong>{rep.late_count} نفر</strong>
                      </div>
                    )}
                    <div className={`${styles.statBadgeItem} ${styles.statBadgePercent}`}>
                      <span>📊 مشارکت:</span>
                      <strong>{rep.attendance_percentage}%</strong>
                    </div>
                  </div>

                  {/* Absent Students Callout (for parent calls) */}
                  {rep.absent_students && rep.absent_students.length > 0 ? (
                    <div className={styles.absentCalloutBox}>
                      <div className={styles.absentCalloutTitle}>
                        <HiOutlinePhone style={{ fontSize: '0.9rem' }} />
                        <span>دانش‌آموزان غایب کلاس ({rep.absent_students.length} نفر جهت پیگیری با اولیا):</span>
                      </div>
                      <div className={styles.absentStudentsList}>
                        {rep.absent_students.map((st, sIdx) => (
                          <div key={sIdx} className={styles.absentStudentItem}>
                            <span>{st.name}</span>
                            {st.phone && st.phone !== 'ثبت نشده' && (
                              <span style={{ opacity: 0.8, direction: 'ltr', display: 'inline-block', marginRight: '4px' }}>
                                ({st.phone})
                              </span>
                            )}
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
                      <span>تبریک! تمامی دانش‌آموزان این کلاس حاضر بودند (بدون غایب).</span>
                    </div>
                  )}

                  {/* Teacher Notes */}
                  {rep.teacher_note && (
                    <div className={styles.teacherNotesSection}>
                      <span style={{ fontWeight: 700, color: 'var(--text-primary)', display: 'block', marginBottom: '2px' }}>
                        💬 یادداشت دبیر:
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
                      <HiOutlineDocumentCheck />
                      <span>مشاهده ریز اسامی</span>
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
           TEACHER VIEW (نمای معلم: ایجاد باکس دلخواه، تایمر و ۲ لیست تفکیک شده)
           ══════════════════════════════════════════════════════════════════ */
        <>
          {/* Active Session Banner OR Creator Box */}
          {activeSession ? (
            <div className={styles.activeSessionBanner}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div className={styles.pulseDot}></div>
                  <span style={{ fontSize: '0.875rem', fontWeight: 700, color: '#6ee7b7' }}>
                    باکس حضور و غیاب هم‌اکنون فعال است
                  </span>
                </div>
                <h2 style={{ fontSize: '1.5rem', fontWeight: 800, marginTop: '6px' }}>
                  کلاس: {selectedClass?.name || 'کلاس انتخابی'}
                </h2>
                <p style={{ fontSize: '0.875rem', opacity: 0.9, marginTop: '2px' }}>
                  دانش‌آموزان بدون نیاز به کد، فقط با زدن دکمه می‌توانند حضور خود را اعلام کنند.
                </p>
              </div>

              {/* Countdown Digital Timer */}
              <div className={styles.timerBox}>
                <div style={{ textAlign: 'center' }}>
                  <span style={{ fontSize: '0.75rem', color: '#93c5fd', display: 'block' }}>
                    زمان باقی‌مانده از ربع ساعت
                  </span>
                  <div className={styles.countdownDisplay}>
                    {formatRemainingTime(remainingSeconds)}
                  </div>
                </div>
              </div>

              {/* Controls */}
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                <button
                  className="btn btn-secondary"
                  onClick={loadSessionData}
                  title="تازه سازی آنی لیست حاضرین"
                >
                  <HiOutlineArrowPath />
                  <span>بروزرسانی زنده</span>
                </button>
                <button
                  className="btn"
                  style={{ background: '#ef4444', color: 'white', fontWeight: 700 }}
                  onClick={handleCloseSession}
                >
                  <HiOutlineStop />
                  <span>پایان و بستن زودهنگام</span>
                </button>
              </div>
            </div>
          ) : (
            /* Creation Card: Teacher launches attendance box on demand */
            <div className={styles.creatorCard}>
              <div className={styles.creatorHeader}>
                <div>
                  <h3 className={styles.creatorTitle}>
                    <HiOutlinePlay className={styles.creatorTitleIcon} />
                    ایجاد باکس حضور و غیاب کلاسی (بدون نیاز به کد)
                  </h3>
                  <p className={styles.creatorDesc}>
                    کلاس مد نظرتان را انتخاب کنید و هر وقت خواستید با فشردن دکمه زیر، باکس ثبت حضور ۱۵ دقیقه‌ای را باز کنید.
                  </p>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                  <span className={styles.durationLabel}>
                    مدت زمان مهلت:
                  </span>
                  <div className={styles.durationPills}>
                    <button
                      type="button"
                      className={`${styles.durationBtn} ${selectedDuration === 15 ? styles.durationBtnActive : ''}`}
                      onClick={() => setSelectedDuration(15)}
                    >
                      <span>۱۵ دقیقه</span>
                      <span className={styles.badgeDefault}>ربع ساعت</span>
                    </button>
                    <button
                      type="button"
                      className={`${styles.durationBtn} ${selectedDuration === 10 ? styles.durationBtnActive : ''}`}
                      onClick={() => setSelectedDuration(10)}
                    >
                      ۱۰ دقیقه
                    </button>
                    <button
                      type="button"
                      className={`${styles.durationBtn} ${selectedDuration === 20 ? styles.durationBtnActive : ''}`}
                      onClick={() => setSelectedDuration(20)}
                    >
                      ۲۰ دقیقه
                    </button>
                    <button
                      type="button"
                      className={`${styles.durationBtn} ${selectedDuration === 30 ? styles.durationBtnActive : ''}`}
                      onClick={() => setSelectedDuration(30)}
                    >
                      ۳۰ دقیقه
                    </button>
                  </div>
                </div>
              </div>

              <div className={styles.creatorFooter}>
                <div className={styles.creatorClassInfo}>
                  📍 کلاس مقصد: <strong>{selectedClass?.name || 'کلاس انتخاب نشده'}</strong>
                </div>

                <button
                  className={styles.creatorStartBtn}
                  onClick={handleStartSession}
                  disabled={startingSession}
                >
                  <HiOutlinePlay style={{ fontSize: '1.25rem' }} />
                  <span>{startingSession ? 'در حال فعال‌سازی...' : `شروع باکس حضور و غیاب (${selectedDuration} دقیقه‌ای)`}</span>
                </button>
              </div>
            </div>
          )}

          {/* Quick Stats Bento */}
          {report && (
            <div className={styles.statsGrid}>
              <div className={styles.statCard}>
                <div className={styles.statIcon} style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#10b981' }}>
                  <HiOutlineCheckCircle />
                </div>
                <div>
                  <div className={styles.statVal}>{report.summary?.present || 0}</div>
                  <div className={styles.statLabel}>اعلام حضور کرده‌ها (حاضرین)</div>
                </div>
              </div>

              <div className={styles.statCard}>
                <div className={styles.statIcon} style={{ background: 'rgba(239, 68, 68, 0.15)', color: '#ef4444' }}>
                  <HiOutlineXCircle />
                </div>
                <div>
                  <div className={styles.statVal}>{report.summary?.absent || 0}</div>
                  <div className={styles.statLabel}>حاضری نزده‌ها (غایبین)</div>
                </div>
              </div>

              <div className={styles.statCard}>
                <div className={styles.statIcon} style={{ background: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b' }}>
                  <HiOutlineClock />
                </div>
                <div>
                  <div className={styles.statVal}>{report.summary?.late || 0}</div>
                  <div className={styles.statLabel}>حاضر با تأخیر</div>
                </div>
              </div>

              <div className={styles.statCard}>
                <div className={styles.statIcon} style={{ background: 'rgba(99, 102, 241, 0.15)', color: '#6366f1' }}>
                  <HiOutlineUserGroup />
                </div>
                <div>
                  <div className={styles.statVal}>
                    {report.summary?.attendance_percentage || 0}%
                  </div>
                  <div className={styles.statLabel}>درصد کل مشارکت کلاسی</div>
                </div>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════
             THE TWO SEPARATED LISTS (تفکیک دقیق به دو لیست مجزا طبق درخواست)
             ۱. لیست حاضرین (با ساعت دقیق ثبت حضور)
             ۲. لیست غایبین (عدم اعلام حضور پس از ربع ساعت)
             ══════════════════════════════════════════════════════════════════ */}
          {report && (
            <>
              {/* Comprehensive Class Export Top Bar */}
              <div className={styles.twoListsTopBar}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <HiOutlineDocumentCheck style={{ fontSize: '1.5rem', color: '#818cf8' }} />
                  <div>
                    <span style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--text-primary)' }}>
                      گزارش و دریافت فایل اسامی حاضرین و غایبین ({selectedClass?.name || ''})
                    </span>
                    <span style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>
                      تهیه فایل تمیز و اختصاصی فقط از اسامی (عکس PNG، چاپ/PDF، اکسل و متن) بدون بخش‌های اضافی صفحه
                    </span>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <button
                    className={`${styles.downloadPillBtn} ${styles.downloadBtnImage}`}
                    onClick={() => handleDownloadImage('combined')}
                    title="دانلود فایل عکس تمیز (PNG) شامل فقط جدول اسامی حاضرین و غایبین جهت اشتراک‌گذاری"
                    style={{ fontSize: '0.85rem', padding: '7px 14px' }}
                  >
                    <HiOutlinePhoto style={{ fontSize: '1.1rem' }} />
                    <span>دریافت عکس اسامی (PNG) 🖼️</span>
                  </button>
                  <button
                    className={`${styles.downloadPillBtn} ${styles.downloadBtnPdf}`}
                    onClick={() => handleDownloadPdf('combined')}
                    title="دانلود مستقیم فایل استاندارد PDF شامل جدول اسامی حاضرین و غایبین"
                    style={{ fontSize: '0.85rem', padding: '7px 14px' }}
                  >
                    <HiOutlineDocumentText style={{ fontSize: '1.1rem' }} />
                    <span>دانلود فایل PDF اسامی 📄</span>
                  </button>
                  <button
                    className={`${styles.downloadPillBtn}`}
                    onClick={() => handleOpenExportPreview('combined')}
                    title="پیش‌نمایش اسامی همراه با گزینه‌های دانلود عکس، PDF و اشتراک‌گذاری"
                    style={{
                      fontSize: '0.85rem',
                      padding: '7px 14px',
                      background: 'rgba(16, 185, 129, 0.14)',
                      color: '#10b981',
                      borderColor: 'rgba(16, 185, 129, 0.35)',
                    }}
                  >
                    <HiOutlineShare style={{ fontSize: '1.1rem' }} />
                    <span>ذخیره و اشتراک اسامی 📤</span>
                  </button>
                  <button
                    className={`${styles.downloadPillBtn}`}
                    onClick={() => handlePrintOnlyLists('combined')}
                    title="چاپ کاغذی یا پیش‌نمایش و ذخیره لیست اسامی"
                    style={{
                      fontSize: '0.85rem',
                      padding: '7px 14px',
                      background: 'rgba(59, 130, 246, 0.12)',
                      color: '#3b82f6',
                      borderColor: 'rgba(59, 130, 246, 0.3)',
                    }}
                  >
                    <HiOutlinePrinter style={{ fontSize: '1.1rem' }} />
                    <span>چاپ و پرینت اسامی 🖨️</span>
                  </button>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => handleDownloadExcel('combined')}
                    title="دانلود فایل اکسل جامع کل کلاس شامل هر دو لیست حاضرین و غایبین"
                    style={{
                      background: 'rgba(99, 102, 241, 0.15)',
                      color: '#818cf8',
                      borderColor: 'rgba(129, 140, 248, 0.35)',
                      fontWeight: 700,
                    }}
                  >
                    <HiOutlineTableCells />
                    <span>اکسل جامع (Excel)</span>
                  </button>

                  <button
                    type="button"
                    className={styles.shareWithMgmtBtn}
                    onClick={() => setIsShareModalOpen(true)}
                    title="ارسال مستقیم نتیجه حضور و غیاب این جلسه برای دفتر مدیریت مدرسه"
                  >
                    <HiOutlinePaperAirplane style={{ fontSize: '1.1rem', transform: 'rotate(180deg)' }} />
                    <span>اشتراک‌گذاری با مدیریت 📤</span>
                  </button>
                </div>
              </div>

              <div className={styles.twoListsContainer}>
                {/* ── LIST 1: PRESENT STUDENTS (لیست حاضرین) ── */}
                <div className={styles.presentListBox}>
                  <div className={styles.listHeader}>
                    <div className={styles.listHeaderTitle}>
                      <span style={{ color: '#10b981', fontSize: '1.3rem' }}>✓</span>
                      <span style={{ color: '#34d399' }}>لیست حاضرین کلاسی</span>
                      <span className={styles.countBadgePresent}>
                        {report.present_students?.length || 0} نفر
                      </span>
                    </div>

                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={handleCopyPresentList}
                        title="کپی اسامی حاضرین در کلیپ‌بورد"
                      >
                        <HiOutlineClipboardDocumentList />
                        <span>کپی</span>
                      </button>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => handlePrintOnlyLists('present')}
                        title="چاپ یا دریافت فایل PDF اختصاصی اسامی حاضرین"
                      >
                        <HiOutlinePrinter />
                      </button>
                    </div>
                  </div>

                  {/* Export Options for Present List */}
                  <div className={styles.exportBar}>
                    <span style={{ fontSize: '0.78rem', color: '#34d399', fontWeight: 700 }}>
                      دریافت فایل فقط حاضرین:
                    </span>
                    <button
                      className={`${styles.downloadPillBtn} ${styles.downloadBtnImage}`}
                      onClick={() => handleDownloadImage('present')}
                      title="دانلود عکس اسامی حاضرین کلاس (PNG) با ساعت دقیق اعلام حضور"
                    >
                      <HiOutlinePhoto />
                      <span>عکس حاضرین (PNG)</span>
                    </button>
                    <button
                      className={`${styles.downloadPillBtn} ${styles.downloadBtnPdf}`}
                      onClick={() => handleDownloadPdf('present')}
                      title="دانلود فایل PDF رسمی اسامی حاضرین کلاس"
                    >
                      <HiOutlineDocumentText />
                      <span>فایل PDF حاضرین</span>
                    </button>
                    <button
                      className={`${styles.downloadPillBtn}`}
                      onClick={() => handlePrintOnlyLists('present')}
                      title="چاپ یا پرینت رسمی فقط از اسامی حاضرین"
                      style={{
                        background: 'rgba(59, 130, 246, 0.1)',
                        color: '#3b82f6',
                        borderColor: 'rgba(59, 130, 246, 0.25)',
                      }}
                    >
                      <HiOutlinePrinter />
                      <span>چاپ حاضرین</span>
                    </button>
                    <button
                      className={`${styles.downloadPillBtn} ${styles.downloadBtnExcel}`}
                      onClick={() => handleDownloadExcel('present')}
                      title="دانلود فایل اکسل اسامی حاضرین همراه با ساعت دقیق اعلام حضور"
                    >
                      <HiOutlineTableCells />
                      <span>فایل اکسل (Excel)</span>
                    </button>
                    <button
                      className={`${styles.downloadPillBtn} ${styles.downloadBtnText}`}
                      onClick={() => handleDownloadText('present')}
                      title="دانلود فایل متنی رسمی اسامی حاضرین"
                    >
                      <HiOutlineDocumentText />
                      <span>فایل متنی (TXT)</span>
                    </button>
                  </div>

                  {report.present_students?.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '36px 0', color: 'var(--text-tertiary)' }}>
                      هنوز هیچ دانش‌آموزی حضور خود را ثبت نکرده است.
                    </div>
                  ) : (
                    <div className={styles.studentCardList}>
                      {report.present_students.map((student, idx) => (
                        <div
                          key={student.student_id}
                          className={`${styles.studentCard} ${styles.studentCardPresent}`}
                        >
                          <div className={styles.studentMainInfo}>
                            <div className="avatar" style={{ background: '#059669', color: 'white' }}>
                              {student.display_name?.charAt(0) || idx + 1}
                            </div>
                            <div>
                              <div className={styles.studentName}>{student.display_name}</div>
                              <div className={styles.timeBadge}>
                                <HiOutlineClock />
                                <span>ساعت ثبت: {formatClockTime(student.recorded_at)}</span>
                                {student.elapsed_minutes !== null && (
                                  <span style={{ opacity: 0.8, marginRight: '4px' }}>
                                    ({student.elapsed_minutes} دقیقه پس از بازگشایی)
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Status Toggle / Actions */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span
                              style={{
                                fontSize: '0.75rem',
                                fontWeight: 700,
                                color: student.status === 'late' ? '#f59e0b' : '#10b981',
                                background: student.status === 'late' ? 'rgba(245, 158, 11, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                                padding: '4px 10px',
                                borderRadius: 'var(--radius-md)',
                              }}
                            >
                              {student.status === 'late' ? 'حاضر با تاخیر' : 'حاضر به موقع ✓'}
                            </span>

                            <button
                              className="btn btn-secondary btn-sm"
                              style={{ fontSize: '0.75rem', padding: '4px 8px', color: '#ef4444' }}
                              title="تغییر به غایب"
                              onClick={() => handleRecordStudent(student.student_id, 'absent')}
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* ── LIST 2: ABSENT STUDENTS (لیست غایبین) ── */}
                <div className={styles.absentListBox}>
                  <div className={styles.listHeader}>
                    <div className={styles.listHeaderTitle}>
                      <span style={{ color: '#ef4444', fontSize: '1.3rem' }}>✕</span>
                      <span style={{ color: '#f87171' }}>لیست غایبین کلاسی</span>
                      <span className={styles.countBadgeAbsent}>
                        {report.absent_students?.length || 0} نفر
                      </span>
                    </div>

                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={handleCopyAbsentList}
                        title="کپی اسامی غایبین در کلیپ‌بورد"
                      >
                        <HiOutlineClipboardDocumentList />
                        <span>کپی</span>
                      </button>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => handlePrintOnlyLists('absent')}
                        title="چاپ یا دریافت فایل PDF اختصاصی اسامی غایبین"
                      >
                        <HiOutlinePrinter />
                      </button>
                    </div>
                  </div>

                  {/* Export Options for Absent List */}
                  <div className={styles.exportBar}>
                    <span style={{ fontSize: '0.78rem', color: '#f87171', fontWeight: 700 }}>
                      دریافت فایل فقط غایبین:
                    </span>
                    <button
                      className={`${styles.downloadPillBtn} ${styles.downloadBtnImage}`}
                      onClick={() => handleDownloadImage('absent')}
                      title="دانلود عکس اسامی غایبین کلاس (PNG) همراه با شماره تماس جهت پیگیری"
                    >
                      <HiOutlinePhoto />
                      <span>عکس غایبین (PNG)</span>
                    </button>
                    <button
                      className={`${styles.downloadPillBtn} ${styles.downloadBtnPdf}`}
                      onClick={() => handleDownloadPdf('absent')}
                      title="دانلود فایل PDF رسمی اسامی غایبین کلاس"
                    >
                      <HiOutlineDocumentText />
                      <span>فایل PDF غایبین</span>
                    </button>
                    <button
                      className={`${styles.downloadPillBtn}`}
                      onClick={() => handlePrintOnlyLists('absent')}
                      title="چاپ یا پرینت رسمی فقط از اسامی غایبین"
                      style={{
                        background: 'rgba(239, 68, 68, 0.1)',
                        color: '#ef4444',
                        borderColor: 'rgba(239, 68, 68, 0.25)',
                      }}
                    >
                      <HiOutlinePrinter />
                      <span>چاپ غایبین</span>
                    </button>
                    <button
                      className={`${styles.downloadPillBtn} ${styles.downloadBtnExcel}`}
                      onClick={() => handleDownloadExcel('absent')}
                      title="دانلود فایل اکسل اسامی غایبین همراه با شماره تماس جهت پیگیری"
                    >
                      <HiOutlineTableCells />
                      <span>فایل اکسل (Excel)</span>
                    </button>
                    <button
                      className={`${styles.downloadPillBtn} ${styles.downloadBtnText}`}
                      onClick={() => handleDownloadText('absent')}
                      title="دانلود فایل متنی رسمی اسامی غایبین"
                    >
                      <HiOutlineDocumentText />
                      <span>فایل متنی (TXT)</span>
                    </button>
                  </div>

                {report.absent_students?.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '36px 0', color: '#34d399', fontWeight: 600 }}>
                    🎉 تبریک! همه دانش‌آموزان کلاس حاضر ثبت شده‌اند و هیچ غایبی وجود ندارد.
                  </div>
                ) : (
                  <div className={styles.studentCardList}>
                    {report.absent_students.map((student, idx) => (
                      <div
                        key={student.student_id}
                        className={`${styles.studentCard} ${styles.studentCardAbsent}`}
                      >
                        <div className={styles.studentMainInfo}>
                          <div className="avatar" style={{ background: '#dc2626', color: 'white' }}>
                            {student.display_name?.charAt(0) || idx + 1}
                          </div>
                          <div>
                            <div className={styles.studentName}>{student.display_name}</div>
                            <div className={styles.absentNotice}>
                              <span>⚠️ عدم ثبت حضور در مهلت ربع ساعت</span>
                              {student.phone && (
                                <span style={{ marginRight: '6px', opacity: 0.85 }}>
                                  | همراه: {student.phone}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Quick Action Toggles */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <button
                            className="btn btn-secondary btn-sm"
                            style={{
                              fontSize: '0.75rem',
                              padding: '4px 10px',
                              background: 'rgba(16, 185, 129, 0.15)',
                              color: '#10b981',
                              borderColor: 'rgba(16, 185, 129, 0.3)',
                            }}
                            title="ثبت دستی به عنوان حاضر"
                            onClick={() => handleRecordStudent(student.student_id, 'present')}
                          >
                            ✓ حاضر
                          </button>

                          <button
                            className="btn btn-secondary btn-sm"
                            style={{
                              fontSize: '0.75rem',
                              padding: '4px 10px',
                              background: 'rgba(56, 189, 248, 0.15)',
                              color: '#38bdf8',
                              borderColor: 'rgba(56, 189, 248, 0.3)',
                            }}
                            title="ثبت موجه (عذر بیماری یا مجاز)"
                            onClick={() => handleRecordStudent(student.student_id, 'excused')}
                          >
                            📄 موجه
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            </>
          )}

          {/* History of Past Attendance Sessions for Selected Class */}
          {historySessions.length > 0 && (
            <div
              style={{
                background: 'var(--bg-card)',
                backdropFilter: 'var(--glass-blur)',
                borderRadius: 'var(--radius-2xl)',
                border: '1px solid var(--border-color)',
                padding: 'var(--space-6)',
                marginTop: 'var(--space-4)',
              }}
            >
              <h4 style={{ fontWeight: 700, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <HiOutlineClock />
                تاریخچه جلسات قبلی حضور و غیاب این کلاس
              </h4>
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                {historySessions.slice(0, 8).map((hs, idx) => (
                  <button
                    key={hs.id}
                    type="button"
                    className="btn btn-secondary btn-sm"
                    style={{
                      background: hs.id === (activeSession?.id || report?.session?.id) ? 'var(--primary-color)' : 'rgba(255, 255, 255, 0.05)',
                      color: hs.id === (activeSession?.id || report?.session?.id) ? 'white' : 'var(--text-secondary)',
                    }}
                    onClick={async () => {
                      try {
                        const rep = await api.get(
                          `/classes/${selectedClassId}/attendance/sessions/${hs.id}/report`
                        );
                        setReport(rep.data.data);
                        setActiveSession(hs.status === 'active' ? hs : null);
                        toast.success('گزارش جلسه انتخاب‌شده بارگذاری شد');
                      } catch (err) {
                        toast.error('خطا در دریافت گزارش جلسه');
                      }
                    }}
                  >
                    <span>جلسه {historySessions.length - idx}</span>
                    <span style={{ fontSize: '0.725rem', opacity: 0.8 }}>
                      ({new Date(hs.created_at).toLocaleDateString('fa-IR')})
                    </span>
                    <span style={{ fontSize: '0.7rem', padding: '1px 6px', borderRadius: '4px', background: hs.status === 'active' ? '#059669' : 'rgba(0,0,0,0.3)' }}>
                      {hs.status === 'active' ? 'فعال' : 'بسته شده'}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* ══════════════════════════════════════════════════════════════════
         MODAL 1: SHARE REPORT WITH MANAGEMENT (اشتراک‌گذاری نتیجه با مدیریت)
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
                  اشتراک‌گذاری نتیجه حضور و غیاب با مدیریت
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
              با ارسال این گزارش، خلاصه وضعیت کلاس <strong>{selectedClass?.name || 'کلاس'}</strong> به همراه لیست دقیق حاضرین و غایبین در بخش مدیریت قرار می‌گیرد و اعلان رسمی برای مدیر ارسال خواهد شد.
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
                <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#10b981' }}>
                  {report?.present_students?.length || 0} نفر
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>حاضرین</div>
              </div>
              <div style={{ width: '1px', height: '28px', background: 'var(--border-color)' }}></div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#ef4444' }}>
                  {report?.absent_students?.length || 0} نفر
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>غایبین</div>
              </div>
              <div style={{ width: '1px', height: '28px', background: 'var(--border-color)' }}></div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#6366f1' }}>
                  {report?.summary?.attendance_percentage || 0}%
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>درصد مشارکت</div>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
                یادداشت یا توضیحات برای مدیر مدرسه (اختیاری):
              </label>
              <textarea
                rows={3}
                placeholder="مثلاً: تدریس مبحث الکتریسیته انجام شد؛ دانش‌آموز ... بدون اطلاع قبلی غایب بود و نیاز به تماس دارد..."
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
         MODAL 2: REPORT DETAIL MODAL (مشاهده ریز اسامی توسط مدیریت)
         ══════════════════════════════════════════════════════════════════ */}
      {selectedReportDetail && (
        <div className={styles.shareModalOverlay} onClick={() => setSelectedReportDetail(null)}>
          <div
            className={styles.shareModalDialog}
            style={{ maxWidth: '640px' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <h3 style={{ fontSize: '1.15rem', fontWeight: 800, margin: 0 }}>
                  ریز اسامی جلسه: {selectedReportDetail.class_name}
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

            <div style={{ maxHeight: '420px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '14px', paddingLeft: '4px' }}>
              {/* Absent list */}
              <div>
                <h4 style={{ fontSize: '0.9rem', fontWeight: 800, color: '#ef4444', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <HiOutlineXCircle />
                  <span>اسامی غایبین ({selectedReportDetail.absent_students?.length || 0} نفر)</span>
                </h4>
                {(!selectedReportDetail.absent_students || selectedReportDetail.absent_students.length === 0) ? (
                  <p style={{ fontSize: '0.8rem', color: '#10b981', margin: 0 }}>هیچ غایبی در این جلسه وجود نداشته است.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {selectedReportDetail.absent_students.map((st, i) => (
                      <div
                        key={i}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '8px 12px',
                          borderRadius: 'var(--radius-lg)',
                          background: 'rgba(239, 68, 68, 0.08)',
                          border: '1px solid rgba(239, 68, 68, 0.2)',
                          fontSize: '0.85rem',
                        }}
                      >
                        <span style={{ fontWeight: 700, color: '#dc2626' }}>{st.name}</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>{st.reason || 'غایب'}</span>
                          <span style={{ fontFamily: 'monospace', fontSize: '0.8rem', direction: 'ltr', background: 'var(--bg-card)', padding: '2px 6px', borderRadius: '4px' }}>
                            {st.phone}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Present list */}
              <div>
                <h4 style={{ fontSize: '0.9rem', fontWeight: 800, color: '#10b981', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <HiOutlineCheckCircle />
                  <span>اسامی حاضرین ({selectedReportDetail.present_students?.length || selectedReportDetail.present_count} نفر)</span>
                </h4>
                {selectedReportDetail.present_students && selectedReportDetail.present_students.length > 0 ? (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '6px' }}>
                    {selectedReportDetail.present_students.map((st, i) => (
                      <div
                        key={i}
                        style={{
                          padding: '6px 10px',
                          borderRadius: 'var(--radius-md)',
                          background: 'rgba(16, 185, 129, 0.08)',
                          border: '1px solid rgba(16, 185, 129, 0.2)',
                          fontSize: '0.8125rem',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                        }}
                      >
                        <span style={{ fontWeight: 600 }}>{st.name}</span>
                        {st.time && (
                          <span style={{ fontSize: '0.7rem', color: '#10b981', fontFamily: 'monospace', direction: 'ltr' }}>
                            {st.time}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', margin: 0 }}>
                    {selectedReportDetail.present_count} نفر حاضر در سامانه ثبت شده‌اند.
                  </p>
                )}
              </div>

              {/* Teacher note */}
              {selectedReportDetail.teacher_note && (
                <div style={{ background: 'var(--bg-surface)', padding: '10px 12px', borderRadius: 'var(--radius-lg)' }}>
                  <strong style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>توضیحات دبیر:</strong>
                  <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem' }}>{selectedReportDetail.teacher_note}</p>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '10px' }}>
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

      {/* Visual Attendance List Export Preview, Download & Share Modal */}
      {exportPreview && (
        <div className={styles.modalOverlay} onClick={() => setExportPreview(null)}>
          <div
            className={styles.modalCard}
            style={{ maxWidth: '680px', width: '95%', maxHeight: '92vh', display: 'flex', flexDirection: 'column', gap: '12px' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '10px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <HiOutlineDocumentCheck style={{ color: '#10b981', fontSize: '1.3rem' }} />
                  <span>{exportPreview.title}</span>
                </h3>
                <p style={{ margin: '4px 0 0', fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>
                  می‌توانید تصویر اسامی یا فایل PDF/اکسل را ذخیره، چاپ یا در پیام‌رسان‌ها به اشتراک بگذارید
                </p>
              </div>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setExportPreview(null)}
                title="بستن"
              >
                <HiOutlineXMark />
              </button>
            </div>

            <div style={{ overflowY: 'auto', maxHeight: '55vh', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-subtle)', background: '#ffffff', padding: '8px' }}>
              <img
                src={exportPreview.dataUrl}
                alt={exportPreview.title}
                style={{ width: '100%', height: 'auto', display: 'block', borderRadius: '8px' }}
              />
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'center', paddingTop: '6px' }}>
              <button
                type="button"
                className={`${styles.downloadPillBtn} ${styles.downloadBtnImage}`}
                onClick={() => handleDownloadImage(exportPreview.type)}
                style={{ padding: '8px 14px', fontSize: '0.84rem' }}
              >
                <HiOutlineArrowDownTray />
                <span>دانلود عکس (PNG) 🖼️</span>
              </button>

              <button
                type="button"
                className={`${styles.downloadPillBtn} ${styles.downloadBtnPdf}`}
                onClick={() => handleDownloadPdf(exportPreview.type)}
                style={{ padding: '8px 14px', fontSize: '0.84rem' }}
              >
                <HiOutlineDocumentText />
                <span>دانلود فایل PDF 📄</span>
              </button>

              <button
                type="button"
                className={`${styles.downloadPillBtn} ${styles.downloadBtnExcel}`}
                onClick={() => handleDownloadExcel(exportPreview.type)}
                style={{ padding: '8px 14px', fontSize: '0.84rem' }}
              >
                <HiOutlineTableCells />
                <span>دانلود اکسل 📊</span>
              </button>

              <button
                type="button"
                className={styles.downloadPillBtn}
                onClick={() => handleShareAttendanceFile(exportPreview.type, 'image')}
                style={{
                  padding: '8px 14px',
                  fontSize: '0.84rem',
                  background: 'rgba(16, 185, 129, 0.16)',
                  color: '#10b981',
                  borderColor: 'rgba(16, 185, 129, 0.4)',
                }}
              >
                <HiOutlineShare />
                <span>اشتراک‌گذاری عکس 📤</span>
              </button>

              <button
                type="button"
                className={styles.downloadPillBtn}
                onClick={() => handleShareAttendanceFile(exportPreview.type, 'pdf')}
                style={{
                  padding: '8px 14px',
                  fontSize: '0.84rem',
                  background: 'rgba(99, 102, 241, 0.16)',
                  color: '#818cf8',
                  borderColor: 'rgba(99, 102, 241, 0.4)',
                }}
              >
                <HiOutlineShare />
                <span>اشتراک‌گذاری PDF 📤</span>
              </button>

              <button
                type="button"
                className={styles.downloadPillBtn}
                onClick={() => handlePrintOnlyLists(exportPreview.type, true)}
                style={{
                  padding: '8px 14px',
                  fontSize: '0.84rem',
                  background: 'rgba(59, 130, 246, 0.14)',
                  color: '#3b82f6',
                  borderColor: 'rgba(59, 130, 246, 0.35)',
                }}
              >
                <HiOutlinePrinter />
                <span>چاپ مستقیم 🖨️</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
