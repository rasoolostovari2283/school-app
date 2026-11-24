'use client';

import { useState, useMemo } from 'react';
import toast from 'react-hot-toast';
import {
  HiOutlineXMark,
  HiOutlineCloudArrowUp,
  HiOutlineAcademicCap,
  HiOutlineFolder,
} from 'react-icons/hi2';
import { FaFilePdf } from 'react-icons/fa';
import api from '@/lib/api';
import styles from '@/app/dashboard/videos/videos.module.css';

export default function UploadVideoModal({
  defaultFolderName = 'عمومی',
  folders = [],
  dbClasses = [],
  dbGrades = [],
  onClose,
  onUploaded,
}) {
  const initialFolderObj = folders.find((f) => f.name === defaultFolderName);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('آموزشی');
  const [selectedFolderNames, setSelectedFolderNames] = useState(() => [defaultFolderName || 'عمومی']);
  const [selectedGrade, setSelectedGrade] = useState(initialFolderObj?.grade || '');
  const [selectedClassIds, setSelectedClassIds] = useState(() =>
    Array.isArray(initialFolderObj?.target_class_ids) ? initialFolderObj.target_class_ids : []
  );
  const [videoFile, setVideoFile] = useState(null);
  const [pdfFiles, setPdfFiles] = useState([]);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);

  const filteredClasses = useMemo(() => {
    if (!selectedGrade) return dbClasses;
    return dbClasses.filter((c) => (c.grade || '').trim() === selectedGrade.trim());
  }, [dbClasses, selectedGrade]);

  const toggleClass = (classId) => {
    setSelectedClassIds((prev) =>
      prev.includes(classId) ? prev.filter((id) => id !== classId) : [...prev, classId]
    );
  };

  const toggleFolder = (folderName) => {
    setSelectedFolderNames((prev) => {
      if (prev.includes(folderName)) {
        const next = prev.filter((f) => f !== folderName);
        return next.length > 0 ? next : ['عمومی'];
      }
      return [...prev, folderName];
    });
  };

  const selectAllVisibleClasses = () => {
    const visibleIds = filteredClasses.map((c) => c.id);
    const allSelected = visibleIds.every((id) => selectedClassIds.includes(id));
    if (allSelected) {
      setSelectedClassIds((prev) => prev.filter((id) => !visibleIds.includes(id)));
    } else {
      setSelectedClassIds((prev) => Array.from(new Set([...prev, ...visibleIds])));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!videoFile) {
      toast.error('لطفاً فایل ویدیو را انتخاب کنید.');
      return;
    }
    if (!title.trim()) {
      toast.error('لطفاً عنوان ویدیو را وارد کنید.');
      return;
    }
    if (dbClasses.length > 0 && selectedClassIds.length === 0) {
      toast.error('لطفاً حداقل یک کلاس از لیست کلاس‌های دیتابیس انتخاب کنید تا در پنل دانش‌آموزان نمایش داده شود.');
      return;
    }

    const formData = new FormData();
    formData.append('file', videoFile);
    formData.append('title', title.trim());
    formData.append('description', description.trim());
    formData.append('category', category);
    formData.append('target_audience', 'students');
    formData.append('is_published', 'true');
    formData.append('folder_name', selectedFolderNames[0] || 'عمومی');
    formData.append('folder_names', JSON.stringify(selectedFolderNames));
    formData.append('grade', selectedGrade || '');
    formData.append('class_ids', JSON.stringify(selectedClassIds));

    pdfFiles.forEach((pdf) => formData.append('pdfs', pdf));

    setIsUploading(true);
    setUploadProgress(0);
    try {
      const res = await api.post('/videos', formData, {
        timeout: 10 * 60 * 1000,
        onUploadProgress: (evt) => {
          if (evt.total) {
            setUploadProgress(Math.round((evt.loaded * 100) / evt.total));
          }
        },
      });
      toast.success('ویدیو با موفقیت منتشر شد و در پنل دانش‌آموزان کلاس‌های انتخاب‌شده نمایش داده می‌شود.');
      onUploaded(res.data?.data?.video);
    } catch (err) {
      toast.error(err.response?.data?.message || 'خطا در آپلود ویدیو');
    } finally {
      setIsUploading(false);
    }
  };

  const allFolderNames = useMemo(() => {
    const names = new Set(['عمومی']);
    folders.forEach((f) => {
      if (f.name) names.add(f.name);
    });
    if (defaultFolderName) names.add(defaultFolderName);
    return Array.from(names);
  }, [folders, defaultFolderName]);

  return (
    <div className={styles.modalOverlay} onClick={onClose} dir="rtl">
      <div className={styles.formModalLarge} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>
            <HiOutlineCloudArrowUp />
            <span>آپلود و انتشار ویدیوی جدید</span>
          </h2>
          <button type="button" className={styles.iconCloseBtn} onClick={onClose}>
            <HiOutlineXMark />
          </button>
        </div>

        <form onSubmit={handleSubmit} className={styles.modalForm}>
          <div className={styles.twoColGrid}>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>عنوان ویدیو *</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="مثلاً: جلسه سوم - حل تمرین معادلات"
                className={styles.textInput}
                required
              />
            </div>

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>دسته‌بندی</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className={styles.selectInput}
              >
                <option value="آموزشی">آموزشی</option>
                <option value="حل تمرین">حل تمرین</option>
                <option value="المپیاد">المپیاد</option>
                <option value="مرور امتحان">مرور امتحان</option>
              </select>
            </div>
          </div>

          <div className={styles.formGroup}>
            <label className={styles.formLabel}>توضیحات</label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="توضیحات کوتاه درباره محتوای این جلسه..."
              className={styles.textareaInput}
            />
          </div>

          {/* Multi-folder selection */}
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>
              <HiOutlineFolder /> پوشه(های) مقصد (امکان نمایش هم‌زمان در چند پوشه)
            </label>
            <div className={styles.chipSelectorRow}>
              {allFolderNames.map((fName) => {
                const active = selectedFolderNames.includes(fName);
                return (
                  <button
                    key={fName}
                    type="button"
                    className={`${styles.selectableChip} ${active ? styles.selectableChipActive : ''}`}
                    onClick={() => toggleFolder(fName)}
                  >
                    {fName}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Grade + DB Classes selection */}
          <div className={styles.formGroup}>
            <div className={styles.labelRowBetween}>
              <label className={styles.formLabel}>
                <HiOutlineAcademicCap /> انتخاب کلاس‌های مجاز از دیتابیس (نمایش در پنل دانش‌آموزان) *
              </label>
              <div className={styles.inlineControls}>
                <select
                  value={selectedGrade}
                  onChange={(e) => setSelectedGrade(e.target.value)}
                  className={styles.miniSelect}
                >
                  <option value="">همه پایه‌ها</option>
                  {dbGrades.map((g) => (
                    <option key={g} value={g}>
                      پایه {g}
                    </option>
                  ))}
                </select>
                {filteredClasses.length > 0 && (
                  <button type="button" className={styles.linkBtn} onClick={selectAllVisibleClasses}>
                    انتخاب همه
                  </button>
                )}
              </div>
            </div>

            {filteredClasses.length === 0 ? (
              <p className={styles.helperMuted}>کلاسی در دیتابیس یافت نشد.</p>
            ) : (
              <div className={styles.checkboxGrid}>
                {filteredClasses.map((cls) => {
                  const checked = selectedClassIds.includes(cls.id);
                  return (
                    <label
                      key={cls.id}
                      className={`${styles.checkboxCard} ${checked ? styles.checkboxCardChecked : ''}`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleClass(cls.id)}
                      />
                      <div>
                        <div className={styles.checkboxCardTitle}>{cls.name}</div>
                        <div className={styles.checkboxCardSub}>
                          {[cls.grade && `پایه ${cls.grade}`, cls.subject, `${cls.students_count || 0} دانش‌آموز`]
                            .filter(Boolean)
                            .join(' • ')}
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          {/* File Pickers: Video + PDFs */}
          <div className={styles.twoColGrid}>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>فایل ویدیو *</label>
              <input
                type="file"
                accept="video/*"
                onChange={(e) => {
                  const f = e.target.files?.[0] || null;
                  setVideoFile(f);
                  if (f && !title.trim()) {
                    setTitle(f.name.replace(/\.[^/.]+$/, ''));
                  }
                }}
                className={styles.fileInput}
                required
              />
              {videoFile && (
                <span className={styles.fileMetaHint}>
                  {videoFile.name} ({(videoFile.size / (1024 * 1024)).toFixed(1)} MB)
                </span>
              )}
            </div>

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>
                <FaFilePdf className={styles.pdfIconRed} /> فایل(های) PDF پیوست پایین ویدیو (اختیاری)
              </label>
              <input
                type="file"
                accept="application/pdf,.pdf"
                multiple
                onChange={(e) => setPdfFiles(Array.from(e.target.files || []))}
                className={styles.fileInput}
              />
              {pdfFiles.length > 0 && (
                <span className={styles.fileMetaHint}>
                  {pdfFiles.length} فایل PDF انتخاب شد
                </span>
              )}
            </div>
          </div>

          {isUploading && (
            <div className={styles.progressWrap}>
              <div className={styles.progressBar} style={{ width: `${uploadProgress}%` }} />
              <span className={styles.progressText}>در حال آپلود... {uploadProgress}%</span>
            </div>
          )}

          <div className={styles.modalFooter}>
            <button type="button" className={styles.btnSecondary} onClick={onClose} disabled={isUploading}>
              انصراف
            </button>
            <button type="submit" className={styles.btnPrimary} disabled={isUploading}>
              {isUploading ? `در حال انتشار (${uploadProgress}%)` : 'آپلود و انتشار برای کلاس‌ها'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
