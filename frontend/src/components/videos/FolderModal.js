'use client';

import { useState, useMemo } from 'react';
import toast from 'react-hot-toast';
import { HiOutlineXMark, HiOutlineFolderPlus, HiOutlineAcademicCap } from 'react-icons/hi2';
import api from '@/lib/api';
import styles from '@/app/dashboard/videos/videos.module.css';

const PRESET_COLORS = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#ef4444'];

export default function FolderModal({
  initialFolder = null,
  dbClasses = [],
  dbGrades = [],
  onClose,
  onSaved,
}) {
  const isEditing = Boolean(initialFolder?.id);
  const [name, setName] = useState(initialFolder?.name || '');
  const [color, setColor] = useState(initialFolder?.color || PRESET_COLORS[0]);
  const [selectedGrade, setSelectedGrade] = useState(initialFolder?.grade || '');
  const [selectedClassIds, setSelectedClassIds] = useState(() =>
    Array.isArray(initialFolder?.target_class_ids) ? initialFolder.target_class_ids : []
  );
  const [submitting, setSubmitting] = useState(false);

  const filteredClasses = useMemo(() => {
    if (!selectedGrade) return dbClasses;
    return dbClasses.filter((c) => (c.grade || '').trim() === selectedGrade.trim());
  }, [dbClasses, selectedGrade]);

  const toggleClass = (classId) => {
    setSelectedClassIds((prev) =>
      prev.includes(classId) ? prev.filter((id) => id !== classId) : [...prev, classId]
    );
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
    if (!name.trim()) {
      toast.error('لطفاً نام پوشه را وارد کنید.');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        name: name.trim(),
        color,
        grade: selectedGrade || '',
        class_ids: selectedClassIds,
      };

      const res = isEditing
        ? await api.put(`/videos/folders/${initialFolder.id}`, payload)
        : await api.post('/videos/folders', payload);

      toast.success(isEditing ? 'پوشه با موفقیت ویرایش شد.' : 'پوشه جدید ساخته شد.');
      onSaved(res.data?.data?.folder);
    } catch (err) {
      toast.error(err.response?.data?.message || 'خطا در ذخیره پوشه');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={styles.modalOverlay} onClick={onClose} dir="rtl">
      <div className={styles.formModal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>
            <HiOutlineFolderPlus />
            <span>{isEditing ? 'ویرایش پوشه و کلاس‌های مجاز' : 'ساخت پوشه ویدیو جدید'}</span>
          </h2>
          <button type="button" className={styles.iconCloseBtn} onClick={onClose}>
            <HiOutlineXMark />
          </button>
        </div>

        <form onSubmit={handleSubmit} className={styles.modalForm}>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>نام پوشه *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="مثلاً: فصل اول ریاضی دهم"
              className={styles.textInput}
              required
            />
          </div>

          <div className={styles.formGroup}>
            <label className={styles.formLabel}>رنگ پوشه</label>
            <div className={styles.colorSwatches}>
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`${styles.colorSwatch} ${color === c ? styles.colorSwatchActive : ''}`}
                  style={{ backgroundColor: c }}
                  onClick={() => setColor(c)}
                  aria-label={`رنگ ${c}`}
                />
              ))}
            </div>
          </div>

          <div className={styles.formGroup}>
            <label className={styles.formLabel}>پایه تحصیلی (از دیتابیس)</label>
            <select
              value={selectedGrade}
              onChange={(e) => setSelectedGrade(e.target.value)}
              className={styles.selectInput}
            >
              <option value="">همه پایه‌ها</option>
              {dbGrades.map((g) => (
                <option key={g} value={g}>
                  پایه {g}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.formGroup}>
            <div className={styles.labelRowBetween}>
              <label className={styles.formLabel}>
                <HiOutlineAcademicCap /> کلاس‌های مجاز برای نمایش در پنل دانش‌آموزان
              </label>
              {filteredClasses.length > 0 && (
                <button type="button" className={styles.linkBtn} onClick={selectAllVisibleClasses}>
                  انتخاب / لغو همه
                </button>
              )}
            </div>

            {filteredClasses.length === 0 ? (
              <p className={styles.helperMuted}>
                کلاسی در دیتابیس برای این فیلتر ثبت نشده است. ابتدا کلاس‌ها را در بخش کلاس‌ها تعریف کنید.
              </p>
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

          <div className={styles.modalFooter}>
            <button type="button" className={styles.btnSecondary} onClick={onClose}>
              انصراف
            </button>
            <button type="submit" className={styles.btnPrimary} disabled={submitting}>
              {submitting ? 'در حال ذخیره...' : isEditing ? 'ذخیره تغییرات' : 'ساخت پوشه'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
