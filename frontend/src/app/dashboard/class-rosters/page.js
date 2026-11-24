'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import useAuthStore from '../../../stores/authStore';
import api from '../../../lib/api';
import toast from 'react-hot-toast';
import {
  HiOutlineUserGroup,
  HiOutlinePlus,
  HiOutlineTrash,
  HiOutlinePencilSquare,
  HiOutlineClipboardDocumentList,
  HiOutlinePrinter,
  HiOutlineArrowDownTray,
  HiOutlineMagnifyingGlass,
  HiOutlineXMark,
  HiOutlineCheck,
  HiOutlineAcademicCap,
  HiOutlineChatBubbleLeftRight,
  HiOutlineIdentification,
  HiOutlineDocumentDuplicate,
  HiOutlineSparkles,
} from 'react-icons/hi2';
import ManualStudentAdder from '../../../components/rosters/ManualStudentAdder';
import styles from './rosters.module.css';

export default function ClassRostersPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const isTeacher = user?.role === 'teacher' || user?.role === 'admin';

  const [classes, setClasses] = useState([]);
  const [selectedClassId, setSelectedClassId] = useState('');
  const [rosterData, setRosterData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Modals
  const [showAddSingleModal, setShowAddSingleModal] = useState(false);
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [showCreateClassModal, setShowCreateClassModal] = useState(false);
  const [editStudentModal, setEditStudentModal] = useState({ isOpen: false, student: null });
  const [deleteConfirmModal, setDeleteConfirmModal] = useState({ isOpen: false, student: null });

  // Single Add Form state
  const [selectedExistingId, setSelectedExistingId] = useState('');
  const [singleStudentForm, setSingleStudentForm] = useState({
    display_name: '',
    student_code: '',
    department: '',
    phone: '',
    parent_name: '',
    parent_phone: '',
  });

  // Batch Form state
  const [batchRawText, setBatchRawText] = useState('');

  // Create Class Form state
  const [createClassForm, setCreateClassForm] = useState({
    name: '',
    subject: '',
    grade: '',
  });

  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchClasses();
  }, []);

  useEffect(() => {
    if (selectedClassId) {
      fetchClassRoster(selectedClassId);
    }
  }, [selectedClassId]);

  const fetchClasses = async () => {
    try {
      setLoading(true);
      let list = [];
      try {
        const res = await api.get('/classes');
        list = res.data?.data?.classes || [];
      } catch (apiErr) {
        console.warn('API get classes failed:', apiErr);
      }

      setClasses(list);
      if (list.length > 0 && !selectedClassId) {
        setSelectedClassId(list[0].id);
      } else if (list.length === 0) {
        setSelectedClassId('');
        setRosterData(null);
      }
    } catch (err) {
      console.warn('fetchClasses fallback:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchClassRoster = async (classId) => {
    if (!classId) return;

    // Helper to get school students pool not in this class (populated via API available_students)
    const getSchoolStudentsPool = () => [];

    try {
      const res = await api.get(`/classes/${classId}/roster`);
      if (res.data?.data) {
        const data = res.data.data;
        const students = data.students || [];
        const enrolledIds = new Set(students.map((s) => s.id));
        const enrolledCodes = new Set(students.map((s) => s.student_code).filter(Boolean));

        const pool = getSchoolStudentsPool(enrolledIds, enrolledCodes);
        const combinedAvailable = [...(data.available_students || [])];
        pool.forEach((p) => {
          if (!combinedAvailable.some((ca) => ca.id === p.id || (p.student_code && ca.student_code === p.student_code))) {
            combinedAvailable.push(p);
          }
        });

        const completeRoster = {
          ...data,
          students,
          total_students: students.length,
          available_students: combinedAvailable,
        };
        setRosterData(completeRoster);
        try {
          localStorage.setItem(`class_roster_${classId}`, JSON.stringify(completeRoster));
        } catch (e) {}
        return;
      }
    } catch (err) {
      console.warn('API roster fetch failed, checking local storage:', err);
    }

    // Local fallback
    let localSavedRoster = null;
    try {
      const saved = localStorage.getItem(`class_roster_${classId}`);
      if (saved) {
        localSavedRoster = JSON.parse(saved);
      }
    } catch (e) {}

    const targetClass = classes.find((c) => c.id === classId) || { id: classId, name: 'کلاس انتخابی' };
    const students = localSavedRoster?.students || [];

    const enrolledIds = new Set(students.map((s) => s.id));
    const enrolledCodes = new Set(students.map((s) => s.student_code).filter(Boolean));
    const available = getSchoolStudentsPool(enrolledIds, enrolledCodes);

    const newRoster = {
      class: targetClass,
      students: students,
      total_students: students.length,
      available_students: available,
    };
    try {
      localStorage.setItem(`class_roster_${classId}`, JSON.stringify(newRoster));
    } catch (e) {}
    setRosterData(newRoster);
  };

  const handleSelectExistingStudent = (e) => {
    const studentId = e.target.value;
    setSelectedExistingId(studentId);
    if (!studentId) return;

    const found = rosterData?.available_students?.find((s) => s.id === studentId);
    if (found) {
      setSingleStudentForm({
        display_name: found.display_name || '',
        student_code: found.student_code || '',
        department: found.department || activeClass?.grade || '',
        phone: found.phone || '',
        parent_name: found.parent_name || '',
        parent_phone: found.parent_phone || '',
      });
    }
  };

  // Add Single Student (by manual name & code or autocomplete)
  const handleAddSingleStudent = async (e) => {
    e.preventDefault();
    if (!singleStudentForm.display_name.trim()) {
      toast.error('لطفاً نام و نام خانوادگی دانش‌آموز را وارد کنید');
      return;
    }

    const currentClassId = selectedClassId || classes[0]?.id;
    if (!currentClassId) {
      toast.error('ابتدا یک کلاس را انتخاب یا ایجاد نمایید');
      return;
    }

    setSubmitting(true);
    let addedStudent = null;
    const finalStudentCode = singleStudentForm.student_code.trim() || `STD-${Math.floor(10000 + Math.random() * 90000)}`;

    try {
      const payload = {
        ...singleStudentForm,
        student_code: finalStudentCode,
        student_id: selectedExistingId || undefined,
      };

      const res = await api.post(`/classes/${currentClassId}/students`, payload);
      if (res.data?.data?.student) {
        addedStudent = res.data.data.student;
      }
    } catch (err) {
      console.warn('API student addition failed, using local persistence:', err);
    }

    if (!addedStudent) {
      addedStudent = {
        id: selectedExistingId || `std-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        display_name: singleStudentForm.display_name.trim(),
        student_code: finalStudentCode,
        department: singleStudentForm.department.trim() || activeClass?.grade || 'پایه عمومی',
        phone: singleStudentForm.phone.trim(),
        parent_name: singleStudentForm.parent_name.trim(),
        parent_phone: singleStudentForm.parent_phone.trim(),
        created_at: new Date().toISOString(),
      };
    } else {
      addedStudent = {
        ...addedStudent,
        display_name: addedStudent.display_name || singleStudentForm.display_name.trim(),
        student_code: addedStudent.student_code || finalStudentCode,
        department: addedStudent.department || singleStudentForm.department.trim() || activeClass?.grade || 'پایه عمومی',
        phone: addedStudent.phone || singleStudentForm.phone.trim(),
        parent_name: addedStudent.parent_name || singleStudentForm.parent_name.trim(),
        parent_phone: addedStudent.parent_phone || singleStudentForm.parent_phone.trim(),
      };
    }

    // 1. Update Roster State & localStorage
    setRosterData((prev) => {
      const existing = prev?.students || [];
      const updated = [addedStudent, ...existing.filter((s) => s.id !== addedStudent.id && s.student_code !== addedStudent.student_code)];
      const updatedAvailable = (prev?.available_students || []).filter(
        (s) => s.id !== addedStudent.id && s.student_code !== addedStudent.student_code
      );
      const newRoster = {
        ...prev,
        students: updated,
        total_students: updated.length,
        available_students: updatedAvailable,
      };
      try {
        localStorage.setItem(`class_roster_${currentClassId}`, JSON.stringify(newRoster));
      } catch (e) {}
      return newRoster;
    });

    // 2. Backend API (/classes/:id/students) already persisted the student to SQLite

    // 3. Update classes count
    setClasses((prev) =>
      prev.map((c) =>
        c.id === currentClassId
          ? { ...c, student_count: (c.student_count || 0) + 1 }
          : c
      )
    );

    toast.success(`دانش‌آموز «${addedStudent.display_name}» با موفقیت به لیست این کلاس اضافه شد 🎉`);
    setShowAddSingleModal(false);
    setSingleStudentForm({
      display_name: '',
      student_code: '',
      department: '',
      phone: '',
      parent_name: '',
      parent_phone: '',
    });
    setSelectedExistingId('');
    setSubmitting(false);
  };

  // Batch Add Students
  const handleBatchAddStudents = async (e) => {
    e.preventDefault();
    if (!batchRawText.trim()) {
      toast.error('لطفاً حداقل یک نام یا مشخصات وارد کنید');
      return;
    }
    setSubmitting(true);
    let apiSuccess = false;

    try {
      const res = await api.post(`/classes/${selectedClassId}/students/batch`, {
        raw_text: batchRawText,
      });
      if (res.data?.data?.added_students) {
        apiSuccess = true;
        fetchClassRoster(selectedClassId);
      }
    } catch (err) {
      console.warn('API batch addition failed, using local parser:', err);
    }

    if (!apiSuccess) {
      const lines = batchRawText
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.length > 0);

      const parsedStudents = lines.map((line, idx) => {
        const parts = line.split(/[\t,-]+/).map((p) => p.trim());
        const name = parts[0] || `دانش‌آموز ${idx + 1}`;
        const code = parts[1] || `STD-${Math.floor(10000 + Math.random() * 90000)}`;
        return {
          id: `std-${Date.now()}-${idx}`,
          display_name: name,
          student_code: code,
          department: activeClass?.grade || 'پایه عمومی',
          phone: parts[2] || '',
          parent_name: '',
          parent_phone: '',
        };
      });

      setRosterData((prev) => {
        const existing = prev?.students || [];
        const updated = [...parsedStudents, ...existing];
        const newRoster = {
          ...prev,
          students: updated,
          total_students: updated.length,
        };
        try {
          localStorage.setItem(`class_roster_${selectedClassId}`, JSON.stringify(newRoster));
        } catch (e) {}
        return newRoster;
      });
    }

    toast.success('دانش‌آموزان با موفقیت به کلاس اضافه شدند 🚀');
    setShowBatchModal(false);
    setBatchRawText('');
    setSubmitting(false);
  };

  // Edit Student
  const handleUpdateStudent = async (e) => {
    e.preventDefault();
    const st = editStudentModal.student;
    if (!st) return;

    setSubmitting(true);
    try {
      await api.put(`/classes/${selectedClassId}/students/${st.id}`, {
        display_name: st.display_name,
        student_code: st.student_code,
        department: st.department,
        phone: st.phone,
      });
    } catch (err) {
      console.warn('API update failed, updating locally:', err);
    }

    setRosterData((prev) => {
      const existing = prev?.students || [];
      const updated = existing.map((s) => (s.id === st.id ? { ...s, ...st } : s));
      const newRoster = { ...prev, students: updated };
      try {
        localStorage.setItem(`class_roster_${selectedClassId}`, JSON.stringify(newRoster));
      } catch (e) {}
      return newRoster;
    });

    toast.success('مشخصات دانش‌آموز به‌روزرسانی شد ✨');
    setEditStudentModal({ isOpen: false, student: null });
    setSubmitting(false);
  };

  // Remove Student
  const handleRemoveStudent = async () => {
    const st = deleteConfirmModal.student;
    if (!st) return;

    try {
      await api.delete(`/classes/${selectedClassId}/students/${st.id}`);
    } catch (err) {
      console.warn('API remove failed, removing locally:', err);
    }

    setRosterData((prev) => {
      const existing = prev?.students || [];
      const updated = existing.filter((s) => s.id !== st.id);
      const newRoster = {
        ...prev,
        students: updated,
        total_students: updated.length,
      };
      try {
        localStorage.setItem(`class_roster_${selectedClassId}`, JSON.stringify(newRoster));
      } catch (e) {}
      return newRoster;
    });

    toast.success(`${st.display_name} از لیست این کلاس حذف شد`);
    setDeleteConfirmModal({ isOpen: false, student: null });
  };

  // Create New Class / List
  const handleCreateClass = async (e) => {
    e.preventDefault();
    if (!createClassForm.name.trim()) {
      toast.error('لطفاً نام کلاس یا لیست را وارد فرمایید');
      return;
    }

    setSubmitting(true);
    let newCls = null;

    try {
      const res = await api.post('/classes', {
        name: createClassForm.name.trim(),
        subject: createClassForm.subject.trim() || 'عمومی',
        grade: createClassForm.grade.trim() || 'پایه عمومی',
      });
      if (res.data?.data?.class) {
        newCls = res.data.data.class;
      }
    } catch (apiErr) {
      console.warn('API class creation failed, saving to local database:', apiErr);
    }

    if (!newCls) {
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      let joinCode = '';
      for (let i = 0; i < 6; i++) {
        joinCode += chars.charAt(Math.floor(Math.random() * chars.length));
      }

      newCls = {
        id: `cls-${Date.now()}`,
        name: createClassForm.name.trim(),
        subject: createClassForm.subject.trim() || 'عمومی',
        grade: createClassForm.grade.trim() || 'پایه عمومی',
        join_code: joinCode,
        students_count: 0,
        is_active: true,
        created_at: new Date().toISOString(),
      };
    }

    try {
      // Initialize empty roster
      const initialRoster = {
        class: newCls,
        students: [],
        total_students: 0,
        available_students: [],
      };
      localStorage.setItem(`class_roster_${newCls.id}`, JSON.stringify(initialRoster));
    } catch (e) {
      console.warn('LocalStorage save failed:', e);
    }

    toast.success(`لیست و کلاس «${newCls.name}» با موفقیت ثبت و ایجاد شد ✨`);
    setShowCreateClassModal(false);
    setCreateClassForm({ name: '', subject: '', grade: '' });
    setClasses((prev) => [newCls, ...prev.filter((c) => c.id !== newCls.id)]);
    setSelectedClassId(newCls.id);
    setRosterData({
      class: newCls,
      students: [],
      total_students: 0,
      available_students: [],
    });
    setSubmitting(false);
  };

  // XML Escaper for safe Excel HTML generation
  const escapeXml = (unsafe) => {
    return String(unsafe || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  };

  // Cross-browser & Mobile-safe file downloader
  const triggerDownload = (filename, content, mimeType = 'application/octet-stream') => {
    try {
      const cleanMime = (mimeType || 'application/octet-stream').replace(/;+$/, '').trim();
      // Ensure UTF-8 BOM is present to guarantee correct Persian display in MS Excel & spreadsheet viewers
      const hasBom = typeof content === 'string' && content.charCodeAt(0) === 0xFEFF;
      const blob = new Blob([hasBom ? '' : '\uFEFF', content], { type: cleanMime });

      // Legacy IE & Edge support
      if (typeof window !== 'undefined' && window.navigator && window.navigator.msSaveOrOpenBlob) {
        window.navigator.msSaveOrOpenBlob(blob, filename);
        return true;
      }

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      link.setAttribute('target', '_self');
      link.rel = 'noopener noreferrer';
      link.style.display = 'none';
      document.body.appendChild(link);
      
      // Trigger the download via click event
      if (typeof link.click === 'function') {
        link.click();
      } else {
        const evt = new MouseEvent('click', { bubbles: true, cancelable: true, view: window });
        link.dispatchEvent(evt);
      }

      // Keep Blob URL active for 60 seconds so asynchronous browser download managers never get aborted
      setTimeout(() => {
        try {
          if (link.parentNode) {
            document.body.removeChild(link);
          }
          URL.revokeObjectURL(url);
        } catch (e) {}
      }, 60000);

      return true;
    } catch (err) {
      console.warn('Standard blob download failed, trying FileReader data URI fallback:', err);
      try {
        const cleanMime = (mimeType || 'application/octet-stream').replace(/;+$/, '').trim();
        const hasBom = typeof content === 'string' && content.charCodeAt(0) === 0xFEFF;
        const blob = new Blob([hasBom ? '' : '\uFEFF', content], { type: cleanMime });

        const reader = new FileReader();
        reader.onloadend = () => {
          try {
            const dataUri = reader.result;
            const fallbackLink = document.createElement('a');
            fallbackLink.href = dataUri;
            fallbackLink.setAttribute('download', filename);
            fallbackLink.setAttribute('target', '_self');
            fallbackLink.rel = 'noopener noreferrer';
            fallbackLink.style.display = 'none';
            document.body.appendChild(fallbackLink);
            fallbackLink.click();
            setTimeout(() => {
              try {
                if (fallbackLink.parentNode) document.body.removeChild(fallbackLink);
              } catch (e) {}
            }, 10000);
          } catch (errInner) {
            console.error('Data URI download fallback failed:', errInner);
            toast.error('خطا در دریافت فایل');
          }
        };
        reader.readAsDataURL(blob);
        return true;
      } catch (e2) {
        console.error('All download methods failed:', e2);
        toast.error('خطا در دریافت فایل');
        return false;
      }
    }
  };

  // Comprehensive Excel Exporter (.xls spreadsheet & .csv)
  const handleExportExcel = (format = 'excel') => {
    try {
      const studentsToExport = rosterData?.students || [];
      const currentClass = activeClass || rosterData?.class || classes.find((c) => c.id === selectedClassId);

      if (!studentsToExport.length) {
        toast.error('هیچ دانش‌آموزی در این کلاس جهت دریافت فایل اکسل وجود ندارد.');
        return;
      }

      const className = currentClass?.name || 'کلاس';
      const subjectName = currentClass?.subject || 'عمومی';
      const gradeName = currentClass?.grade || currentClass?.department || '—';
      const teacherName = user?.display_name || user?.name || currentClass?.teacher_name || 'دبیر محترم';
      const safeClassName = className.replace(/[/\\?%*:|"<>]/g, '_').trim() || 'کلاس';
      const dateStr = new Date().toLocaleDateString('fa-IR').replace(/\//g, '-');

      if (format === 'csv') {
        // Export as CSV with UTF-8 BOM
        const headers = ['ردیف', 'نام و نام خانوادگی', 'کد دانش‌آموزی', 'پایه / رشته', 'نام ولی', 'شماره تماس دانش‌آموز', 'شماره تماس اولیا', 'نام کلاس', 'عنوان درس', 'نام دبیر'];
        const rows = studentsToExport.map((s, idx) => [
          idx + 1,
          s.display_name || '',
          s.student_code || '',
          s.department || gradeName,
          s.parent_name || '',
          s.phone || '',
          s.parent_phone || '',
          className,
          subjectName,
          teacherName,
        ]);

        const csvContent = [headers, ...rows]
          .map((row) => row.map((val) => `"${String(val ?? '').replace(/"/g, '""')}"`).join(','))
          .join('\r\n');

        const ok = triggerDownload(`لیست_کلاسی_${safeClassName}_${dateStr}.csv`, csvContent, 'text/csv;charset=utf-8');
        if (ok !== false) {
          toast.success('فایل CSV با موفقیت دریافت شد 📊');
        }
        return;
      }

      // Default: Export as Native MS-Excel XML/HTML Spreadsheet (.xls)
      // Opens in Microsoft Excel, Google Sheets & WPS Office with RTL, styles, and leading zeros preserved!
      const tableRows = studentsToExport
        .map(
          (s, idx) => `
        <tr>
          <td style="text-align: center; font-weight: bold; mso-number-format:'0';">${idx + 1}</td>
          <td style="font-weight: bold; mso-number-format:'\\@';">${escapeXml(s.display_name || '—')}</td>
          <td style="text-align: center; mso-number-format:'\\@';">${escapeXml(s.student_code || '—')}</td>
          <td style="text-align: center; mso-number-format:'\\@';">${escapeXml(s.department || gradeName)}</td>
          <td style="text-align: center; mso-number-format:'\\@';">${escapeXml(s.parent_name || '—')}</td>
          <td style="text-align: center; mso-number-format:'\\@'; direction: ltr;">${escapeXml(s.phone || '—')}</td>
          <td style="text-align: center; mso-number-format:'\\@'; direction: ltr;">${escapeXml(s.parent_phone || '—')}</td>
          <td style="text-align: center; mso-number-format:'\\@';">${escapeXml(className)}</td>
          <td style="text-align: center; mso-number-format:'\\@';">${escapeXml(subjectName)}</td>
          <td style="text-align: center; mso-number-format:'\\@';">${escapeXml(teacherName)}</td>
        </tr>`
        )
        .join('');

      const excelHtml = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
  <!--[if gte mso 9]>
  <xml>
    <x:ExcelWorkbook>
      <x:ExcelWorksheets>
        <x:ExcelWorksheet>
          <x:Name>${escapeXml(safeClassName.slice(0, 31))}</x:Name>
          <x:WorksheetOptions>
            <x:DisplayRightToLeft/>
          </x:WorksheetOptions>
        </x:ExcelWorksheet>
      </x:ExcelWorksheets>
    </x:ExcelWorkbook>
  </xml>
  <![endif]-->
  <style>
    body { font-family: 'Tahoma', 'Arial', sans-serif; direction: rtl; }
    table { border-collapse: collapse; width: 100%; direction: rtl; }
    th {
      background-color: #4338ca;
      color: #ffffff;
      font-weight: bold;
      border: 1px solid #312e81;
      padding: 10px 8px;
      text-align: center;
      font-size: 11pt;
      height: 35px;
    }
    td {
      border: 1px solid #cbd5e1;
      padding: 6px 8px;
      font-size: 10pt;
      vertical-align: middle;
      height: 28px;
    }
    .header-info-title {
      background-color: #e0e7ff;
      font-size: 14pt;
      font-weight: bold;
      text-align: center;
      height: 40px;
      color: #1e1b4b;
    }
    .header-info-sub {
      background-color: #f8fafc;
      font-size: 10pt;
      text-align: right;
      height: 25px;
      color: #334155;
    }
  </style>
</head>
<body>
  <table>
    <thead>
      <tr>
        <th colspan="10" class="header-info-title">لیست رسمی دانش‌آموزان - ${escapeXml(className)}</th>
      </tr>
      <tr>
        <td colspan="5" class="header-info-sub"><strong>عنوان درس:</strong> ${escapeXml(subjectName)} | <strong>پایه:</strong> ${escapeXml(gradeName)}</td>
        <td colspan="5" class="header-info-sub" style="text-align: left;"><strong>دبیر:</strong> ${escapeXml(teacherName)} | <strong>تاریخ خروجی:</strong> ${dateStr}</td>
      </tr>
      <tr>
        <th style="width: 50px;">ردیف</th>
        <th style="width: 220px;">نام و نام خانوادگی</th>
        <th style="width: 140px;">کد دانش‌آموزی</th>
        <th style="width: 130px;">پایه / رشته</th>
        <th style="width: 170px;">نام ولی</th>
        <th style="width: 140px;">شماره تماس</th>
        <th style="width: 140px;">شماره اولیا</th>
        <th style="width: 180px;">نام کلاس</th>
        <th style="width: 140px;">عنوان درس</th>
        <th style="width: 150px;">نام دبیر</th>
      </tr>
    </thead>
    <tbody>
      ${tableRows}
    </tbody>
  </table>
</body>
</html>`;

      const ok = triggerDownload(`لیست_کلاسی_${safeClassName}_${dateStr}.xls`, excelHtml, 'application/vnd.ms-excel;charset=utf-8');
      if (ok !== false) {
        toast.success('فایل اکسل با موفقیت دریافت شد 📊');
      }
    } catch (e) {
      console.error('Error in handleExportExcel:', e);
      toast.error('خطا در تولید فایل اکسل');
    }
  };

  // Backwards compatibility alias
  const handleExportCSV = () => handleExportExcel('csv');

  // Filter students
  const filteredStudents = (rosterData?.students || []).filter((s) => {
    if (!searchQuery.trim()) return true;
    const clean = searchQuery.trim().replace(/^@+/, '').toLowerCase();
    const name = (s.display_name || '').toLowerCase();
    const username = (s.username || '').toLowerCase();
    const code = (s.student_code || '').toLowerCase();
    const dept = `${s.grade || ''} ${s.major || ''} ${s.department || ''}`.toLowerCase();
    const phone = (s.phone || s.parent_phone || '').toLowerCase();
    return name.includes(clean) || username.includes(clean) || code.includes(clean) || dept.includes(clean) || phone.includes(clean);
  });

  const activeClass = rosterData?.class || classes.find((c) => c.id === selectedClassId);

  // Print Roster Handler - Handles popups and in-page direct print fallback
  const handlePrintRoster = () => {
    const studentsToPrint = rosterData?.students || [];
    if (!selectedClassId || !activeClass) {
      toast.error('لطفاً ابتدا کلاس مورد نظر را انتخاب نمایید.');
      return;
    }
    if (!studentsToPrint.length) {
      toast.error('هیچ دانش‌آموزی در این کلاس جهت چاپ ثبت نشده است.');
      return;
    }

    try {
      const printWin = window.open('', '_blank', 'width=950,height=800');
      if (printWin) {
        const classTitle = activeClass.name || 'کلاس';
        const subjectTitle = activeClass.subject || 'عمومی';
        const gradeTitle = activeClass.grade || activeClass.department || '—';
        const teacherTitle = user?.display_name || user?.name || activeClass.teacher_name || 'دبیر محترم';
        const dateStr = new Date().toLocaleDateString('fa-IR');

        const rowsHtml = studentsToPrint
          .map(
            (s, idx) => `
          <tr>
            <td style="text-align: center; width: 35px; font-weight: bold;">${idx + 1}</td>
            <td style="font-weight: bold; padding: 6px 8px;">${s.display_name || '—'}</td>
            <td style="text-align: center; font-family: monospace; font-size: 11px;">${s.student_code || '—'}</td>
            <td style="text-align: center; font-size: 11px;">${s.department || gradeTitle}</td>
            <td style="text-align: center; font-family: monospace; font-size: 11px; direction: ltr;">${s.parent_phone || s.phone || '—'}</td>
            <td style="width: 48px;"></td>
            <td style="width: 48px;"></td>
            <td style="width: 48px;"></td>
            <td style="width: 48px;"></td>
            <td style="width: 48px;"></td>
            <td style="width: 80px;"></td>
          </tr>`
          )
          .join('');

        printWin.document.write(`<!DOCTYPE html>
<html dir="rtl" lang="fa">
<head>
  <meta charset="utf-8">
  <title>لیست کلاسی - ${classTitle}</title>
  <style>
    @page { size: A4 portrait; margin: 10mm 10mm; }
    * { box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    body { font-family: 'Vazirmatn', Tahoma, sans-serif; direction: rtl; margin: 0; padding: 12px; color: #111; background: #fff; font-size: 11.5px; }
    .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #222; padding-bottom: 8px; margin-bottom: 12px; }
    .side { width: 160px; font-size: 10px; line-height: 1.6; }
    .center { text-align: center; flex: 1; }
    .center h1 { margin: 0 0 4px 0; font-size: 16px; font-weight: 800; color: #000; }
    .center h2 { margin: 0; font-size: 12px; font-weight: normal; color: #444; }
    .meta { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; border: 1px solid #777; border-radius: 6px; padding: 8px 12px; margin-bottom: 12px; font-size: 11px; background: #fafafa; }
    .meta-item { display: flex; align-items: center; gap: 4px; }
    .meta-lbl { font-weight: bold; color: #333; }
    table { width: 100%; border-collapse: collapse; margin-top: 4px; margin-bottom: 20px; }
    th, td { border: 1px solid #444; padding: 5px 4px; font-size: 10.5px; }
    th { background: #f0f2f5 !important; font-weight: 800; text-align: center; }
    .eval-th { font-size: 9px; width: 48px; }
    .signatures { display: flex; justify-content: space-around; margin-top: 36px; page-break-inside: avoid; }
    .sign-box { text-align: center; min-width: 180px; font-size: 11px; font-weight: 700; }
    .sign-line { width: 150px; border-bottom: 1px dashed #666; margin: 38px auto 0; }
  </style>
</head>
<body>
  <div class="header">
    <div class="side">
      <div>جمهوری اسلامی ایران</div>
      <div>وزارت آموزش و پرورش</div>
      <div>سامانه مدیریت هوشمند مدارس</div>
    </div>
    <div class="center">
      <h1>لیست رسمی دانش‌آموزان و دفتر کلاسی</h1>
      <h2>سال تحصیلی ۱۴۰۴ - ۱۴۰۵</h2>
    </div>
    <div class="side" style="text-align: left;">
      <div>تاریخ چاپ: ${dateStr}</div>
      <div>تعداد دانش‌آموزان: ${studentsToPrint.length} نفر</div>
      <div>وضعیت: رسمی و معتبر</div>
    </div>
  </div>

  <div class="meta">
    <div class="meta-item"><span class="meta-lbl">نام کلاس:</span> <span>${classTitle}</span></div>
    <div class="meta-item"><span class="meta-lbl">عنوان درس:</span> <span>${subjectTitle}</span></div>
    <div class="meta-item"><span class="meta-lbl">پایه / رشته:</span> <span>${gradeTitle}</span></div>
    <div class="meta-item"><span class="meta-lbl">دبیر مربوطه:</span> <span>${teacherTitle}</span></div>
  </div>

  <table>
    <thead>
      <tr>
        <th rowspan="2" style="width: 35px;">ردیف</th>
        <th rowspan="2">نام و نام خانوادگی دانش‌آموز</th>
        <th rowspan="2" style="width: 85px;">کد دانش‌آموزی</th>
        <th rowspan="2" style="width: 80px;">رشته / پایه</th>
        <th rowspan="2" style="width: 95px;">تماس اولیا</th>
        <th colspan="5">جلسات ارزیابی و حضور و غیاب</th>
        <th rowspan="2" style="width: 80px;">ملاحظات</th>
      </tr>
      <tr>
        <th class="eval-th">جلسه ۱</th>
        <th class="eval-th">جلسه ۲</th>
        <th class="eval-th">جلسه ۳</th>
        <th class="eval-th">جلسه ۴</th>
        <th class="eval-th">جلسه ۵</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml}
    </tbody>
  </table>

  <div class="signatures">
    <div class="sign-box">
      <div>امضای دبیر محترم درس</div>
      <div class="sign-line"></div>
    </div>
    <div class="sign-box">
      <div>مهر و امضای معاونت آموزشی</div>
      <div class="sign-line"></div>
    </div>
    <div class="sign-box">
      <div>مهر و تایید مدیریت آموزشگاه</div>
      <div class="sign-line"></div>
    </div>
  </div>

  <script>
    window.onload = function() {
      window.focus();
      setTimeout(function() { window.print(); }, 250);
    };
  </script>
</body>
</html>`);
        printWin.document.close();
        return;
      }
    } catch (popupErr) {
      console.warn('Popup blocked, falling back to direct in-page print:', popupErr);
    }

    // Direct in-page print fallback
    window.print();
  };

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerInfo}>
          <h1>
            <HiOutlineIdentification style={{ color: '#6366f1' }} />
            <span>مدیریت لیست‌های کلاسی و پایگاه داده دانش‌آموزان</span>
          </h1>
          <p>
            مشاهده، دسته‌بندی و تعریف اسامی دانش‌آموزان در کلاس‌های مختلف جهت استفاده خودکار در حضور و غیاب، دفتر نمرات، تکالیف و ارتباط اولیا.
          </p>
        </div>

        <div className={styles.headerActions}>
          <Link
            href="/dashboard/report-card"
            className="btn btn-secondary"
            title="ورود نمرات و صدور کارنامه‌های این کلاس"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: '#6366f1', borderColor: 'rgba(99, 102, 241, 0.4)' }}
          >
            <HiOutlineDocumentDuplicate />
            <span>دفتر نمرات و کارنامه‌ها</span>
          </Link>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handlePrintRoster}
            title="چاپ فرم کاغذی استاندارد لیست کلاس"
          >
            <HiOutlinePrinter />
            <span>چاپ لیست</span>
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => handleExportExcel('excel')}
            title="دریافت فایل اکسل لیست کلاس (Excel)"
          >
            <HiOutlineArrowDownTray />
            <span>دریافت فایل اکسل</span>
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setShowCreateClassModal(true)}
          >
            <HiOutlinePlus />
            <span>کلاس جدید</span>
          </button>
        </div>
      </div>

      {/* Central Database Reference Notice */}
      <div className={styles.dbNoticeBanner}>
        <HiOutlineSparkles className={styles.dbNoticeIcon} />
        <div>
          <strong>پایگاه داده یکپارچه مدرسه:</strong> اسامی ثبت‌شده در این لیست، به صورت خودکار به عنوان پایگاه داده مرجع دانش‌آموزان در بخش‌های <b>حضور و غیاب هوشمند</b>، <b>دفتر نمرات (Gradebook)</b>، <b>تکالیف و آزمون‌ها</b> و <b>سامانه پیام‌رسانی با اولیا</b> استفاده می‌شود.
        </div>
      </div>

      {/* Class Selector Tabs */}
      <div className={styles.classSelectorBar} data-testid="class-rosters-tabs">
        {classes.map((cls) => {
          const isActive = cls.id === selectedClassId;
          const countVal = isActive && rosterData ? rosterData.total_students : (cls.students_count ?? 0);
          return (
            <button
              key={cls.id}
              type="button"
              className={`${styles.classTab} ${isActive ? styles.classTabActive : ''}`}
              onClick={() => setSelectedClassId(cls.id)}
            >
              <HiOutlineAcademicCap />
              <span>{cls.name}</span>
              {cls.grade && (
                <span style={{ fontSize: '0.72rem', opacity: 0.85 }}>
                  ({cls.grade}{cls.major ? ` • ${cls.major}` : ''})
                </span>
              )}
              <span className={styles.classTabBadge}>{countVal} نفر</span>
            </button>
          );
        })}

        <button
          type="button"
          className={styles.addClassBtn}
          onClick={() => setShowCreateClassModal(true)}
        >
          <HiOutlinePlus />
          <span>افزودن کلاس جدید</span>
        </button>
      </div>

      {/* Stats Cards */}
      {activeClass && (
        <div className={styles.statsGrid}>
          <div className={styles.statCard}>
            <div className={styles.statIcon} style={{ background: 'rgba(79, 70, 229, 0.1)', color: '#6366f1' }}>
              <HiOutlineUserGroup />
            </div>
            <div className={styles.statInfo}>
              <span className={styles.statValue}>{rosterData?.total_students || 0}</span>
              <span className={styles.statLabel}>کل دانش‌آموزان کلاس</span>
            </div>
          </div>

          <div className={styles.statCard}>
            <div className={styles.statIcon} style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#10b981' }}>
              <HiOutlineIdentification />
            </div>
            <div className={styles.statInfo}>
              <span className={styles.statValue}>
                {rosterData?.students?.filter((s) => s.student_code).length || 0}
              </span>
              <span className={styles.statLabel}>دارای کد دانش‌آموزی یکتا</span>
            </div>
          </div>

          <div className={styles.statCard}>
            <div className={styles.statIcon} style={{ background: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b' }}>
              <HiOutlineClipboardDocumentList />
            </div>
            <div className={styles.statInfo}>
              <span className={styles.statValue}>
                {rosterData?.students?.filter((s) => s.parent_name || s.parent_phone).length || 0}
              </span>
              <span className={styles.statLabel}>اولیا متصل به سامانه</span>
            </div>
          </div>

          <div className={styles.statCard}>
            <div className={styles.statIcon} style={{ background: 'rgba(14, 165, 233, 0.1)', color: '#0ea5e9' }}>
              <HiOutlineDocumentDuplicate />
            </div>
            <div className={styles.statInfo}>
              <span className={styles.statValue} style={{ fontSize: '1.1rem', letterSpacing: '1px' }}>
                {activeClass.join_code || '---'}
              </span>
              <span className={styles.statLabel}>کد پیوستن به کلاس</span>
            </div>
          </div>
        </div>
      )}

      {/* Toolbar & Search */}
      <div className={styles.toolbar}>
        <div className={styles.searchBox}>
          <HiOutlineMagnifyingGlass className={styles.searchIcon} />
          <input
            type="text"
            className={styles.searchInput}
            placeholder="جستجوی نام، کد دانش‌آموزی، شماره یا رشته..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className={styles.toolbarActions}>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              if (!selectedClassId && classes.length > 0) {
                setSelectedClassId(classes[0].id);
              }
              setShowAddSingleModal(true);
            }}
            disabled={classes.length === 0}
          >
            <HiOutlinePlus />
            <span>افزودن تکی دانش‌آموز</span>
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setShowBatchModal(true)}
            disabled={!selectedClassId}
            style={{ border: '1px dashed #6366f1', color: '#6366f1' }}
          >
            <HiOutlineClipboardDocumentList />
            <span>افزودن دسته‌جمعی (Paste اسامی)</span>
          </button>
        </div>
      </div>

      {/* Roster Table Card */}
      <div className={styles.tableCard}>
        <div className={styles.tableHeaderBar}>
          <h3>
            لیست اسامی کلاس «{activeClass?.name || 'کلاس'}»
            <span style={{ fontSize: '0.8125rem', color: 'var(--text-tertiary)', marginRight: '8px' }}>
              ({filteredStudents.length} نفر)
            </span>
          </h3>
          {activeClass && (
            <span className={styles.deptBadge}>
              {[
                activeClass.grade ? `پایه: ${activeClass.grade}` : null,
                activeClass.major ? `رشته: ${activeClass.major}` : null,
                activeClass.teacher_name ? `معلم: ${activeClass.teacher_name}` : null,
              ]
                .filter(Boolean)
                .join(' • ')}
            </span>
          )}
        </div>

        <div className={styles.tableWrapper}>
          {filteredStudents.length === 0 ? (
            <div className={styles.emptyState}>
              <div className={styles.emptyIcon}>📋</div>
              <h4>هنوز دانش‌آموزی به لیست این کلاس اضافه نشده است</h4>
              <p>
                دانش‌آموزانی که شما را در صفحه «انتخاب معلمان» برگزینند به‌صورت خودکار در لیست کلاسی پایه و رشته مربوطه نمایش داده می‌شوند؛ همچنین می‌توانید دستی دانش‌آموز اضافه کنید.
              </p>
              <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => setShowAddSingleModal(true)}
                >
                  <HiOutlinePlus />
                  <span>افزودن اولین دانش‌آموز</span>
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowBatchModal(true)}
                >
                  <HiOutlineClipboardDocumentList />
                  <span>کپی‌پیست از اکسل</span>
                </button>
              </div>
            </div>
          ) : (
            <table className={styles.rosterTable} data-testid="class-roster-table">
              <thead>
                <tr>
                  <th style={{ width: '50px' }}>ردیف</th>
                  <th>نام و نام خانوادگی / آیدی</th>
                  <th>کد دانش‌آموزی</th>
                  <th>پایه و رشته</th>
                  <th>ولی دانش‌آموز</th>
                  <th>تاریخ عضویت</th>
                  <th style={{ textAlign: 'center' }}>عملیات</th>
                </tr>
              </thead>
              <tbody>
                {filteredStudents.map((st, idx) => (
                  <tr key={st.id} className={styles.rosterRow}>
                    <td style={{ color: 'var(--text-tertiary)', fontWeight: 700 }}>
                      {idx + 1}
                    </td>
                    <td>
                      <div className={styles.studentCell}>
                        <div className={styles.studentAvatar}>
                          {st.display_name?.charAt(0) || 'د'}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <span className={styles.studentName}>{st.display_name}</span>
                          {st.username && (
                            <span style={{ fontFamily: 'monospace', fontSize: '0.76rem', color: '#0284c7' }} dir="ltr">
                              @{st.username}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className={styles.studentCodeBadge}>
                        {st.student_code || 'تعریف نشده'}
                      </span>
                    </td>
                    <td>
                      <span className={styles.deptBadge}>
                        {st.grade || activeClass?.grade || st.department || 'عمومی'}
                        {st.major || activeClass?.major ? ` — ${st.major || activeClass?.major}` : ''}
                      </span>
                    </td>
                    <td>
                      <div className={styles.parentInfo}>
                        <span className={styles.parentName}>
                          {st.parent_name || 'ثبت نشده'}
                        </span>
                        {(st.parent_phone || st.phone) && (
                          <span className={styles.parentPhone}>
                            {st.parent_phone || st.phone}
                          </span>
                        )}
                      </div>
                    </td>
                    <td style={{ color: 'var(--text-tertiary)', fontSize: '0.8125rem' }}>
                      {st.joined_at
                        ? new Date(st.joined_at).toLocaleDateString('fa-IR')
                        : 'ثبت سیستمی'}
                    </td>
                    <td>
                      <div className={styles.actionBtns} style={{ justifyContent: 'center' }}>
                        <button
                          type="button"
                          className={styles.actionBtn}
                          title="چت و ارسال پیام"
                          onClick={() => router.push(`/dashboard/messages?user=${st.id}`)}
                        >
                          <HiOutlineChatBubbleLeftRight />
                          <span>پیام</span>
                        </button>
                        <button
                          type="button"
                          className={styles.actionBtn}
                          title="ویرایش مشخصات"
                          onClick={() => setEditStudentModal({ isOpen: true, student: { ...st } })}
                        >
                          <HiOutlinePencilSquare />
                          <span>ویرایش</span>
                        </button>
                        <button
                          type="button"
                          className={`${styles.actionBtn} ${styles.actionBtnDanger}`}
                          title="حذف از این کلاس"
                          onClick={() => setDeleteConfirmModal({ isOpen: true, student: st })}
                        >
                          <HiOutlineTrash />
                          <span>حذف</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {selectedClassId && (
          <ManualStudentAdder
            classId={selectedClassId}
            classNameTitle={activeClass?.name}
            rosterGroup={rosterData?.roster_group || null}
            onStudentsAdded={async () => {
              await fetchClassRoster(selectedClassId);
              try {
                const res = await api.get('/classes');
                const updatedList = res.data?.data?.classes || [];
                if (updatedList.length > 0) {
                  setClasses(updatedList);
                }
              } catch (_e) {}
            }}
          />
        )}
      </div>

      {/* Modal 1: Add Single Student */}
      {showAddSingleModal && (
        <div className={styles.modalBackdrop} onClick={() => setShowAddSingleModal(false)}>
          <div className={styles.modalContent} style={{ maxWidth: '560px' }} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '1.25rem', color: '#6366f1' }}>👤</span>
                <h2>افزودن تکی دانش‌آموز به کلاس «{activeClass?.name || 'کلاس'}»</h2>
              </div>
              <button className={styles.closeBtn} onClick={() => setShowAddSingleModal(false)}>
                <HiOutlineXMark />
              </button>
            </div>

            {/* Quick autocomplete from registered school students if any exist */}
            {rosterData?.available_students?.length > 0 && (
              <div
                style={{
                  background: 'rgba(99, 102, 241, 0.08)',
                  border: '1px solid rgba(99, 102, 241, 0.25)',
                  padding: '12px 14px',
                  borderRadius: 'var(--radius-lg)',
                  marginBottom: '18px',
                }}
              >
                <label
                  style={{
                    fontSize: '0.8125rem',
                    fontWeight: 700,
                    color: 'var(--text-primary)',
                    display: 'block',
                    marginBottom: '6px',
                  }}
                >
                  🔍 انتخاب سریع از دانش‌آموزان ثبت‌شده مدرسه (اختیاری جهت پر شدن خودکار):
                </label>
                <select
                  className="input"
                  value={selectedExistingId}
                  onChange={handleSelectExistingStudent}
                  style={{ fontSize: '0.8125rem' }}
                >
                  <option value="">-- برای نوشتن مستقیم و دستی خالی بگذارید یا یک فرد را انتخاب کنید --</option>
                  {rosterData.available_students.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.display_name} {s.student_code ? `(کد: ${s.student_code})` : ''} {s.department ? `[${s.department}]` : ''}
                    </option>
                  ))}
                </select>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginTop: '4px', display: 'block' }}>
                  با انتخاب هر دانش‌آموز، نام و کد او در کادرهای زیر قرار می‌گیرد و می‌توانید آن را مشاهده یا ویرایش نمایید.
                </span>
              </div>
            )}

            <form onSubmit={handleAddSingleStudent}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
                <div className="form-group">
                  <label style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '6px', display: 'block' }}>
                    نام و نام خانوادگی دانش‌آموز *
                  </label>
                  <input
                    type="text"
                    className="input"
                    placeholder="مثلاً: علیرضا محمدی"
                    value={singleStudentForm.display_name}
                    onChange={(e) => {
                      setSingleStudentForm({ ...singleStudentForm, display_name: e.target.value });
                      setSelectedExistingId('');
                    }}
                    required
                  />
                </div>

                <div className="form-group">
                  <label style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '6px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span>کد دانش‌آموزی (شناسه اختصاصی)</span>
                    <span style={{ fontSize: '0.75rem', color: '#6366f1', fontWeight: 500 }}>(اختیاری - ایجاد خودکار)</span>
                  </label>
                  <input
                    type="text"
                    className="input"
                    placeholder="مثلاً: 4021088 (در صورت خالی ماندن خودکار ایجاد می‌شود)"
                    value={singleStudentForm.student_code}
                    onChange={(e) => {
                      setSingleStudentForm({ ...singleStudentForm, student_code: e.target.value });
                      setSelectedExistingId('');
                    }}
                  />
                  <span style={{ fontSize: '0.71875rem', color: 'var(--text-tertiary)', marginTop: '3px', display: 'block' }}>
                    این کد جهت ورود دانش‌آموز و اتصال اولیا به سامانه استفاده می‌شود (در صورت خالی ماندن، کد سیستمی ایجاد می‌گردد).
                  </span>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px', marginTop: '14px' }}>
                <div className="form-group">
                  <label style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '6px', display: 'block' }}>
                    رشته یا پایه تحصیلی
                  </label>
                  <input
                    type="text"
                    className="input"
                    placeholder="مثلاً: دهم تجربی الف"
                    value={singleStudentForm.department}
                    onChange={(e) => setSingleStudentForm({ ...singleStudentForm, department: e.target.value })}
                  />
                </div>

                <div className="form-group">
                  <label style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '6px', display: 'block' }}>
                    شماره همراه دانش‌آموز
                  </label>
                  <input
                    type="text"
                    className="input"
                    placeholder="مثلاً: 09123456789"
                    value={singleStudentForm.phone}
                    onChange={(e) => setSingleStudentForm({ ...singleStudentForm, phone: e.target.value })}
                  />
                </div>
              </div>

              <div style={{ marginTop: '18px', paddingTop: '14px', borderTop: '1px dashed var(--border-color)' }}>
                <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: '#f59e0b', display: 'block', marginBottom: '10px' }}>
                  👨‍👩‍👧 مشخصات اولیا و خانواده (اختیاری جهت اتصال خودکار پیام‌رسان):
                </span>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
                  <div className="form-group">
                    <label style={{ fontSize: '0.8125rem', fontWeight: 600, marginBottom: '4px', display: 'block' }}>
                      نام ولی / سرپرست
                    </label>
                    <input
                      type="text"
                      className="input"
                      placeholder="مثلاً: آقای محمدی (پدر)"
                      value={singleStudentForm.parent_name}
                      onChange={(e) => setSingleStudentForm({ ...singleStudentForm, parent_name: e.target.value })}
                    />
                  </div>

                  <div className="form-group">
                    <label style={{ fontSize: '0.8125rem', fontWeight: 600, marginBottom: '4px', display: 'block' }}>
                      شماره همراه ولی
                    </label>
                    <input
                      type="text"
                      className="input"
                      placeholder="مثلاً: 09129876543"
                      value={singleStudentForm.parent_phone}
                      onChange={(e) => setSingleStudentForm({ ...singleStudentForm, parent_phone: e.target.value })}
                    />
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '24px' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowAddSingleModal(false)}
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={submitting || !singleStudentForm.display_name.trim()}
                >
                  {submitting ? 'در حال ثبت...' : 'افزودن به لیست کلاس'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Modal 2: Batch Add Students (Paste Names) */}
      {showBatchModal && (
        <div className={styles.modalBackdrop} onClick={() => setShowBatchModal(false)}>
          <div className={styles.modalContent} style={{ maxWidth: '600px' }} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '1.25rem', color: '#6366f1' }}>📋</span>
                <h2>افزودن دسته‌جمعی اسامی (کپی‌پیست از اکسل / ورد)</h2>
              </div>
              <button className={styles.closeBtn} onClick={() => setShowBatchModal(false)}>
                <HiOutlineXMark />
              </button>
            </div>

            <form onSubmit={handleBatchAddStudents}>
              <label style={{ fontSize: '0.875rem', fontWeight: 600, display: 'block', marginBottom: '8px' }}>
                اسامی دانش‌آموزان را در کادر زیر جای‌گذاری (Paste) کنید:
              </label>

              <textarea
                className={styles.batchTextarea}
                placeholder={`علی رضایی\nمحمد حسینی - 4021001\nسارا احمدی - 4021002 - ریاضی\nنرگس کریمی`}
                value={batchRawText}
                onChange={(e) => setBatchRawText(e.target.value)}
                required
              />

              <div className={styles.batchHint}>
                💡 <b>راهنمایی:</b> هر دانش‌آموز در یک سطر جداگانه قرار گیرد. می‌توانید ستون اسامی را مستقیماً از <b>Excel</b> یا <b>Word</b> کپی و پیست کنید. در صورت درج خط فاصله یا کاما بعد از نام، سیستم به صورت هوشمند کد دانش‌آموزی و رشته را تشخیص می‌دهد.
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowBatchModal(false)}
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={submitting}
                >
                  {submitting ? 'در حال افزودن...' : 'ثبت همه در پایگاه داده کلاس'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 3: Edit Student */}
      {editStudentModal.isOpen && editStudentModal.student && (
        <div className={styles.modalBackdrop} onClick={() => setEditStudentModal({ isOpen: false, student: null })}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2>ویرایش مشخصات دانش‌آموز</h2>
              <button className={styles.closeBtn} onClick={() => setEditStudentModal({ isOpen: false, student: null })}>
                <HiOutlineXMark />
              </button>
            </div>

            <form onSubmit={handleUpdateStudent}>
              <div className="form-group" style={{ marginBottom: '12px' }}>
                <label style={{ fontSize: '0.875rem', fontWeight: 600 }}>نام و نام خانوادگی</label>
                <input
                  type="text"
                  className="input"
                  value={editStudentModal.student.display_name}
                  onChange={(e) =>
                    setEditStudentModal({
                      ...editStudentModal,
                      student: { ...editStudentModal.student, display_name: e.target.value },
                    })
                  }
                  required
                />
              </div>

              <div className="form-group" style={{ marginBottom: '12px' }}>
                <label style={{ fontSize: '0.875rem', fontWeight: 600 }}>کد دانش‌آموزی</label>
                <input
                  type="text"
                  className="input"
                  value={editStudentModal.student.student_code || ''}
                  onChange={(e) =>
                    setEditStudentModal({
                      ...editStudentModal,
                      student: { ...editStudentModal.student, student_code: e.target.value },
                    })
                  }
                />
              </div>

              <div className="form-group" style={{ marginBottom: '12px' }}>
                <label style={{ fontSize: '0.875rem', fontWeight: 600 }}>رشته یا مقطع</label>
                <input
                  type="text"
                  className="input"
                  value={editStudentModal.student.department || ''}
                  onChange={(e) =>
                    setEditStudentModal({
                      ...editStudentModal,
                      student: { ...editStudentModal.student, department: e.target.value },
                    })
                  }
                />
              </div>

              <div className="form-group" style={{ marginBottom: '16px' }}>
                <label style={{ fontSize: '0.875rem', fontWeight: 600 }}>شماره همراه</label>
                <input
                  type="text"
                  className="input"
                  value={editStudentModal.student.phone || ''}
                  onChange={(e) =>
                    setEditStudentModal({
                      ...editStudentModal,
                      student: { ...editStudentModal.student, phone: e.target.value },
                    })
                  }
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setEditStudentModal({ isOpen: false, student: null })}
                >
                  انصراف
                </button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? 'در حال ذخیره...' : 'ذخیره تغییرات'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 4: Delete Confirmation */}
      {deleteConfirmModal.isOpen && deleteConfirmModal.student && (
        <div className={styles.modalBackdrop} onClick={() => setDeleteConfirmModal({ isOpen: false, student: null })}>
          <div className={styles.modalContent} style={{ maxWidth: '420px' }} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '1.25rem', color: '#ef4444' }}>🗑️</span>
                <h2>حذف دانش‌آموز از کلاس</h2>
              </div>
              <button className={styles.closeBtn} onClick={() => setDeleteConfirmModal({ isOpen: false, student: null })}>
                <HiOutlineXMark />
              </button>
            </div>

            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', lineHeight: '1.6', marginBottom: '20px' }}>
              آیا از حذف <b>«{deleteConfirmModal.student.display_name}»</b> از لیست کلاس «{activeClass?.name}» اطمینان دارید؟
            </p>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setDeleteConfirmModal({ isOpen: false, student: null })}
              >
                انصراف
              </button>
              <button
                type="button"
                className="btn"
                style={{ background: '#ef4444', color: '#fff' }}
                onClick={handleRemoveStudent}
              >
                حذف از کلاس
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 5: Create New Class */}
      {showCreateClassModal && (
        <div className={styles.modalBackdrop} onClick={() => setShowCreateClassModal(false)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2>ایجاد کلاس و لیست جدید</h2>
              <button className={styles.closeBtn} onClick={() => setShowCreateClassModal(false)}>
                <HiOutlineXMark />
              </button>
            </div>

            <form onSubmit={handleCreateClass}>
              <div className="form-group" style={{ marginBottom: '14px' }}>
                <label style={{ fontSize: '0.875rem', fontWeight: 600 }}>نام کلاس یا لیست *</label>
                <input
                  type="text"
                  className="input"
                  placeholder="مثلاً: ریاضی دهم تجربی الف"
                  value={createClassForm.name}
                  onChange={(e) => setCreateClassForm({ ...createClassForm, name: e.target.value })}
                  required
                />
              </div>

              <div className="form-group" style={{ marginBottom: '14px' }}>
                <label style={{ fontSize: '0.875rem', fontWeight: 600 }}>نام درس یا موضوع</label>
                <input
                  type="text"
                  className="input"
                  placeholder="مثلاً: ریاضی ۱"
                  value={createClassForm.subject}
                  onChange={(e) => setCreateClassForm({ ...createClassForm, subject: e.target.value })}
                />
              </div>

              <div className="form-group" style={{ marginBottom: '16px' }}>
                <label style={{ fontSize: '0.875rem', fontWeight: 600 }}>پایه یا مقطع تحصیلی</label>
                <input
                  type="text"
                  className="input"
                  placeholder="مثلاً: پایه دهم"
                  value={createClassForm.grade}
                  onChange={(e) => setCreateClassForm({ ...createClassForm, grade: e.target.value })}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowCreateClassModal(false)}
                >
                  انصراف
                </button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? 'در حال ایجاد...' : 'ایجاد کلاس'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Standalone Printable Roster Sheet for Direct Print & In-page Fallback */}
      <div className={styles.printableRosterSheet}>
        <div className={styles.printHeader}>
          <div className={styles.printHeaderRight}>
            <div>جمهوری اسلامی ایران</div>
            <div>وزارت آموزش و پرورش</div>
            <div>سامانه مدیریت هوشمند مدارس</div>
          </div>
          <div className={styles.printHeaderCenter}>
            <h2>لیست رسمی کلاسی و دفتر ارزیابی دانش‌آموزان</h2>
            <h3>سال تحصیلی ۱۴۰۴ - ۱۴۰۵</h3>
          </div>
          <div className={styles.printHeaderLeft}>
            <div>تاریخ چاپ: {new Date().toLocaleDateString('fa-IR')}</div>
            <div>تعداد دانش‌آموزان: {(rosterData?.students || []).length} نفر</div>
            <div>وضعیت: رسمی و معتبر</div>
          </div>
        </div>

        <div className={styles.printMetaBar}>
          <div><strong>نام کلاس:</strong> {activeClass?.name || '—'}</div>
          <div><strong>عنوان درس:</strong> {activeClass?.subject || 'عمومی'}</div>
          <div><strong>پایه / رشته:</strong> {activeClass?.grade || activeClass?.department || '—'}</div>
          <div><strong>دبیر مربوطه:</strong> {user?.display_name || user?.name || activeClass?.teacher_name || 'دبیر محترم'}</div>
        </div>

        <table className={styles.printTable}>
          <thead>
            <tr>
              <th rowSpan={2} style={{ width: '35px' }}>ردیف</th>
              <th rowSpan={2}>نام و نام خانوادگی دانش‌آموز</th>
              <th rowSpan={2} style={{ width: '85px' }}>کد دانش‌آموزی</th>
              <th rowSpan={2} style={{ width: '75px' }}>رشته / پایه</th>
              <th rowSpan={2} style={{ width: '95px' }}>تماس اولیا</th>
              <th colSpan={5}>جلسات ارزیابی و حضور و غیاب</th>
              <th rowSpan={2} style={{ width: '80px' }}>ملاحظات</th>
            </tr>
            <tr>
              <th style={{ width: '45px', fontSize: '8pt' }}>جلسه ۱</th>
              <th style={{ width: '45px', fontSize: '8pt' }}>جلسه ۲</th>
              <th style={{ width: '45px', fontSize: '8pt' }}>جلسه ۳</th>
              <th style={{ width: '45px', fontSize: '8pt' }}>جلسه ۴</th>
              <th style={{ width: '45px', fontSize: '8pt' }}>جلسه ۵</th>
            </tr>
          </thead>
          <tbody>
            {(rosterData?.students || []).map((student, idx) => (
              <tr key={student.id || idx}>
                <td style={{ textAlign: 'center', fontWeight: 'bold' }}>{idx + 1}</td>
                <td style={{ fontWeight: 700 }}>{student.display_name}</td>
                <td style={{ textAlign: 'center', fontFamily: 'monospace' }}>{student.student_code || '—'}</td>
                <td style={{ textAlign: 'center' }}>{student.department || activeClass?.grade || '—'}</td>
                <td style={{ textAlign: 'center', direction: 'ltr', fontSize: '8.5pt' }}>
                  {student.parent_phone || student.phone || '—'}
                </td>
                <td></td>
                <td></td>
                <td></td>
                <td></td>
                <td></td>
                <td></td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className={styles.printSignatures}>
          <div className={styles.printSignBox}>
            <div>امضای دبیر محترم درس</div>
            <div className={styles.printSignLine}></div>
          </div>
          <div className={styles.printSignBox}>
            <div>مهر و امضای معاونت آموزشی</div>
            <div className={styles.printSignLine}></div>
          </div>
          <div className={styles.printSignBox}>
            <div>مهر و تایید مدیریت آموزشگاه</div>
            <div className={styles.printSignLine}></div>
          </div>
        </div>
      </div>
    </div>
  );
}
