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
      const res = await api.get('/classes');
      const list = res.data.data.classes || [];
      setClasses(list);
      if (list.length > 0) {
        setSelectedClassId(list[0].id);
      }
    } catch (err) {
      toast.error('خطا در دریافت لیست کلاس‌ها');
    } finally {
      setLoading(false);
    }
  };

  const fetchClassRoster = async (classId) => {
    try {
      const res = await api.get(`/classes/${classId}/roster`);
      setRosterData(res.data.data);
    } catch (err) {
      toast.error('خطا در دریافت لیست دانش‌آموزان کلاس');
    }
  };

  const handleSelectExistingStudent = (e) => {
    const studentId = e.target.value;
    setSelectedExistingId(studentId);
    if (!studentId) return;

    const found = rosterData?.available_students?.find((s) => s.id === studentId);
    if (found) {
      setSingleStudentForm((prev) => ({
        ...prev,
        display_name: found.display_name || '',
        student_code: found.student_code || '',
        department: found.department || activeClass?.grade || '',
        phone: found.phone || '',
      }));
    }
  };

  // Add Single Student (by manual name & code or autocomplete)
  const handleAddSingleStudent = async (e) => {
    e.preventDefault();
    if (!singleStudentForm.display_name.trim()) {
      toast.error('لطفاً نام و نام خانوادگی دانش‌آموز را وارد کنید');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        ...singleStudentForm,
        student_id: selectedExistingId || undefined,
      };

      await api.post(`/classes/${selectedClassId}/students`, payload);
      toast.success('دانش‌آموز با موفقیت به لیست این کلاس اضافه شد 🎉');
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
      fetchClassRoster(selectedClassId);
    } catch (err) {
      toast.error(err.response?.data?.message || 'خطا در افزودن دانش‌آموز به کلاس');
    } finally {
      setSubmitting(false);
    }
  };

  // Batch Add Students
  const handleBatchAddStudents = async (e) => {
    e.preventDefault();
    if (!batchRawText.trim()) {
      toast.error('لطفاً حداقل یک نام یا مشخصات وارد کنید');
      return;
    }
    setSubmitting(true);
    try {
      const res = await api.post(`/classes/${selectedClassId}/students/batch`, {
        raw_text: batchRawText,
      });
      toast.success(res.data.message || 'دانش‌آموزان با موفقیت به کلاس اضافه شدند 🚀');
      setShowBatchModal(false);
      setBatchRawText('');
      fetchClassRoster(selectedClassId);
    } catch (err) {
      toast.error(err.response?.data?.message || 'خطا در ثبت گروهی اسامی');
    } finally {
      setSubmitting(false);
    }
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
      toast.success('مشخصات دانش‌آموز به‌روزرسانی شد');
      setEditStudentModal({ isOpen: false, student: null });
      fetchClassRoster(selectedClassId);
    } catch (err) {
      toast.error('خطا در ویرایش مشخصات');
    } finally {
      setSubmitting(false);
    }
  };

  // Remove Student
  const handleRemoveStudent = async () => {
    const st = deleteConfirmModal.student;
    if (!st) return;

    try {
      await api.delete(`/classes/${selectedClassId}/students/${st.id}`);
      toast.success(`${st.display_name} از لیست این کلاس حذف شد`);
      setDeleteConfirmModal({ isOpen: false, student: null });
      fetchClassRoster(selectedClassId);
    } catch (err) {
      toast.error('خطا در حذف دانش‌آموز از کلاس');
    }
  };

  // Create New Class
  const handleCreateClass = async (e) => {
    e.preventDefault();
    if (!createClassForm.name.trim()) return;

    setSubmitting(true);
    try {
      const res = await api.post('/classes', createClassForm);
      const newCls = res.data.data.class;
      toast.success('کلاس جدید ایجاد شد ✨');
      setShowCreateClassModal(false);
      setCreateClassForm({ name: '', subject: '', grade: '' });
      setClasses((prev) => [newCls, ...prev]);
      setSelectedClassId(newCls.id);
    } catch (err) {
      toast.error('خطا در ایجاد کلاس');
    } finally {
      setSubmitting(false);
    }
  };

  // Export CSV
  const handleExportCSV = () => {
    if (!rosterData?.students?.length) {
      toast.error('دانش‌آموزی برای خروجی گرفتن وجود ندارد');
      return;
    }
    const headers = 'ردیف,نام و نام خانوادگی,کد دانش‌آموزی,رشته و پایه,نام ولی,شماره تماس\n';
    const rows = rosterData.students.map((s, idx) =>
      `"${idx + 1}","${s.display_name}","${s.student_code || '-'}","${s.department || '-'}","${s.parent_name || '-'}","${s.phone || s.parent_phone || '-'}"`
    ).join('\n');

    const blob = new Blob(['\uFEFF' + headers + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `لیست_کلاسی_${rosterData.class.name}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('فایل اکسل با موفقیت دانلود شد 📊');
  };

  // Filter students
  const filteredStudents = (rosterData?.students || []).filter((s) => {
    if (!searchQuery.trim()) return true;
    const clean = searchQuery.trim().toLowerCase();
    const name = (s.display_name || '').toLowerCase();
    const code = (s.student_code || '').toLowerCase();
    const dept = (s.department || '').toLowerCase();
    const phone = (s.phone || s.parent_phone || '').toLowerCase();
    return name.includes(clean) || code.includes(clean) || dept.includes(clean) || phone.includes(clean);
  });

  const activeClass = rosterData?.class || classes.find((c) => c.id === selectedClassId);

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
            onClick={() => window.print()}
            title="چاپ فرم کاغذی لیست کلاس"
          >
            <HiOutlinePrinter />
            <span>چاپ لیست</span>
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleExportCSV}
            title="دانلود خروجی اکسل"
          >
            <HiOutlineArrowDownTray />
            <span>خروجی اکسل (CSV)</span>
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
      <div className={styles.classSelectorBar}>
        {classes.map((cls) => {
          const isActive = cls.id === selectedClassId;
          return (
            <button
              key={cls.id}
              type="button"
              className={`${styles.classTab} ${isActive ? styles.classTabActive : ''}`}
              onClick={() => setSelectedClassId(cls.id)}
            >
              <HiOutlineAcademicCap />
              <span>{cls.name}</span>
              {isActive && rosterData && (
                <span className={styles.classTabBadge}>{rosterData.total_students} نفر</span>
              )}
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
            onClick={() => setShowAddSingleModal(true)}
            disabled={!selectedClassId}
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
          {activeClass?.subject && (
            <span className={styles.deptBadge}>درس: {activeClass.subject} • {activeClass.grade || 'پایه'}</span>
          )}
        </div>

        <div className={styles.tableWrapper}>
          {filteredStudents.length === 0 ? (
            <div className={styles.emptyState}>
              <div className={styles.emptyIcon}>📋</div>
              <h4>هنوز دانش‌آموزی به لیست این کلاس اضافه نشده است</h4>
              <p>
                برای تکمیل پایگاه داده این کلاس، با زدن دکمه «افزودن تکی دانش‌آموز» یا «افزودن دسته‌جمعی» اسامی را وارد نمایید.
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
            <table className={styles.rosterTable}>
              <thead>
                <tr>
                  <th style={{ width: '50px' }}>ردیف</th>
                  <th>نام و نام خانوادگی</th>
                  <th>کد دانش‌آموزی</th>
                  <th>رشته / مقطع</th>
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
                        <span className={styles.studentName}>{st.display_name}</span>
                      </div>
                    </td>
                    <td>
                      <span className={styles.studentCodeBadge}>
                        {st.student_code || 'تعریف نشده'}
                      </span>
                    </td>
                    <td>
                      <span className={styles.deptBadge}>
                        {st.department || activeClass?.grade || 'عمومی'}
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
      </div>

      {/* Modal 1: Add Single Student */}
      {showAddSingleModal && (
        <div className={styles.modalBackdrop} onClick={() => setShowAddSingleModal(false)}>
          <div className={styles.modalContent} style={{ maxWidth: '560px' }} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '1.25rem', color: '#6366f1' }}>👤</span>
                <h2>افزودن تکی دانش‌آموز به کلاس «{activeClass?.name}»</h2>
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
                  <label style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '6px', display: 'block' }}>
                    کد دانش‌آموزی (شناسه اختصاصی) *
                  </label>
                  <input
                    type="text"
                    className="input"
                    placeholder="مثلاً: 4021088"
                    value={singleStudentForm.student_code}
                    onChange={(e) => {
                      setSingleStudentForm({ ...singleStudentForm, student_code: e.target.value });
                      setSelectedExistingId('');
                    }}
                    required
                  />
                  <span style={{ fontSize: '0.71875rem', color: 'var(--text-tertiary)', marginTop: '3px', display: 'block' }}>
                    این کد جهت ورود دانش‌آموز و اتصال اولیا به سامانه استفاده می‌شود.
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
    </div>
  );
}
