'use client';

import { useState, useMemo } from 'react';
import toast from 'react-hot-toast';
import {
  HiOutlineXMark,
  HiOutlineArrowsRightLeft,
  HiOutlineShare,
  HiOutlineAcademicCap,
} from 'react-icons/hi2';
import api from '@/lib/api';
import styles from '@/app/dashboard/videos/videos.module.css';

export default function MoveShareModal({
  video,
  initialTab = 'move',
  folders = [],
  dbClasses = [],
  onClose,
  onUpdated,
}) {
  const [activeTab, setActiveTab] = useState(initialTab); // 'move' | 'share' | 'classes'
  const [moveTargetFolder, setMoveTargetFolder] = useState(video?.folder_name || 'عمومی');
  const [newInlineFolder, setNewInlineFolder] = useState('');
  const [sharedFolders, setSharedFolders] = useState(() =>
    Array.isArray(video?.folder_names) && video.folder_names.length > 0
      ? video.folder_names
      : [video?.folder_name || 'عمومی']
  );
  const [selectedClassIds, setSelectedClassIds] = useState(() =>
    Array.isArray(video?.target_class_ids) ? video.target_class_ids : []
  );
  const [saving, setSaving] = useState(false);

  const allFolderNames = useMemo(() => {
    const set = new Set(['عمومی']);
    folders.forEach((f) => f.name && set.add(f.name));
    if (video?.folder_name) set.add(video.folder_name);
    return Array.from(set);
  }, [folders, video]);

  const toggleSharedFolder = (name) => {
    setSharedFolders((prev) => {
      if (prev.includes(name)) {
        const next = prev.filter((x) => x !== name);
        return next.length > 0 ? next : prev;
      }
      return [...prev, name];
    });
  };

  const toggleClassId = (id) => {
    setSelectedClassIds((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    );
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      let res;
      if (activeTab === 'move') {
        const target = newInlineFolder.trim() || moveTargetFolder || 'عمومی';
        res = await api.patch(`/videos/${video.id}/folder`, { folder_name: target });
        toast.success(`ویدیو به پوشه «${target}» منتقل شد.`);
      } else if (activeTab === 'share') {
        const list = newInlineFolder.trim()
          ? Array.from(new Set([...sharedFolders, newInlineFolder.trim()]))
          : sharedFolders;
        res = await api.put(`/videos/${video.id}/folders`, { folder_names: list });
        toast.success('اشتراک‌گذاری ویدیو بین پوشه‌ها ذخیره شد.');
      } else {
        res = await api.put(`/videos/${video.id}/classes`, { class_ids: selectedClassIds });
        toast.success('کلاس‌های مجاز این ویدیو به‌روزرسانی شد.');
      }
      onUpdated(res.data?.data?.video);
    } catch (err) {
      toast.error(err.response?.data?.message || 'خطا در ذخیره تغییرات');
    } finally {
      setSaving(false);
    }
  };

  if (!video) return null;

  return (
    <div className={styles.modalOverlay} onClick={onClose} dir="rtl">
      <div className={styles.formModal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>مدیریت پوشه‌ها و دسترسی «{video.title}»</h2>
          <button type="button" className={styles.iconCloseBtn} onClick={onClose}>
            <HiOutlineXMark />
          </button>
        </div>

        <div className={styles.tabRow}>
          <button
            type="button"
            className={`${styles.tabBtn} ${activeTab === 'move' ? styles.tabBtnActive : ''}`}
            onClick={() => setActiveTab('move')}
          >
            <HiOutlineArrowsRightLeft /> انتقال پوشه
          </button>
          <button
            type="button"
            className={`${styles.tabBtn} ${activeTab === 'share' ? styles.tabBtnActive : ''}`}
            onClick={() => setActiveTab('share')}
          >
            <HiOutlineShare /> اشتراک در چند پوشه
          </button>
          <button
            type="button"
            className={`${styles.tabBtn} ${activeTab === 'classes' ? styles.tabBtnActive : ''}`}
            onClick={() => setActiveTab('classes')}
          >
            <HiOutlineAcademicCap /> کلاس‌های مجاز
          </button>
        </div>

        <form onSubmit={handleSave} className={styles.modalForm}>
          {activeTab === 'move' && (
            <>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>انتخاب پوشه مقصد</label>
                <select
                  value={moveTargetFolder}
                  onChange={(e) => setMoveTargetFolder(e.target.value)}
                  className={styles.selectInput}
                >
                  {allFolderNames.map((fName) => (
                    <option key={fName} value={fName}>
                      {fName}
                    </option>
                  ))}
                </select>
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>یا ساخت پوشه جدید و انتقال به آن (اختیاری)</label>
                <input
                  type="text"
                  value={newInlineFolder}
                  onChange={(e) => setNewInlineFolder(e.target.value)}
                  placeholder="نام پوشه جدید..."
                  className={styles.textInput}
                />
              </div>
            </>
          )}

          {activeTab === 'share' && (
            <>
              <p className={styles.helperMuted}>
                پوشه‌هایی که می‌خواهید این ویدیو هم‌زمان در آن‌ها نمایش داده شود را انتخاب کنید (بدون تکرار فایل):
              </p>
              <div className={styles.checkboxGrid}>
                {allFolderNames.map((fName) => {
                  const checked = sharedFolders.includes(fName);
                  return (
                    <label
                      key={fName}
                      className={`${styles.checkboxCard} ${checked ? styles.checkboxCardChecked : ''}`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleSharedFolder(fName)}
                      />
                      <span className={styles.checkboxCardTitle}>{fName}</span>
                    </label>
                  );
                })}
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>افزودن به پوشه جدید (اختیاری)</label>
                <input
                  type="text"
                  value={newInlineFolder}
                  onChange={(e) => setNewInlineFolder(e.target.value)}
                  placeholder="نام پوشه جدید..."
                  className={styles.textInput}
                />
              </div>
            </>
          )}

          {activeTab === 'classes' && (
            <>
              <p className={styles.helperMuted}>
                کلاس‌هایی که دانش‌آموزان آن‌ها اجازه دیدن این ویدیو را دارند انتخاب کنید:
              </p>
              <div className={styles.checkboxGrid}>
                {dbClasses.map((cls) => {
                  const checked = selectedClassIds.includes(cls.id);
                  return (
                    <label
                      key={cls.id}
                      className={`${styles.checkboxCard} ${checked ? styles.checkboxCardChecked : ''}`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleClassId(cls.id)}
                      />
                      <div>
                        <div className={styles.checkboxCardTitle}>{cls.name}</div>
                        <div className={styles.checkboxCardSub}>
                          {[cls.grade && `پایه ${cls.grade}`, cls.subject].filter(Boolean).join(' • ')}
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
            </>
          )}

          <div className={styles.modalFooter}>
            <button type="button" className={styles.btnSecondary} onClick={onClose}>
              انصراف
            </button>
            <button type="submit" className={styles.btnPrimary} disabled={saving}>
              {saving ? 'در حال ذخیره...' : 'ذخیره تغییرات'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
