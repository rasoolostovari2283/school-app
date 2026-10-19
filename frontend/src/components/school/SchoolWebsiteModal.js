'use client';

import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import {
  HiOutlineGlobeAlt,
  HiOutlineXMark,
  HiOutlineCheck,
  HiOutlineArrowTopRightOnSquare,
  HiOutlineInformationCircle,
} from 'react-icons/hi2';
import api from '../../lib/api';
import styles from './SchoolWebsiteModal.module.css';

export default function SchoolWebsiteModal({
  isOpen,
  onClose,
  currentUrl,
  onSaved,
}) {
  const [urlInput, setUrlInput] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setUrlInput(currentUrl || '');
    }
  }, [isOpen, currentUrl]);

  if (!isOpen) return null;

  const handleTestLink = () => {
    if (!urlInput.trim()) {
      toast.error('ابتدا آدرس سایت را وارد کنید');
      return;
    }
    let target = urlInput.trim();
    if (!/^https?:\/\//i.test(target)) {
      target = 'https://' + target;
    }
    window.open(target, '_blank', 'noopener,noreferrer');
  };

  const handleSave = async (e) => {
    e.preventDefault();
    let normalized = urlInput.trim();
    if (normalized && !/^https?:\/\//i.test(normalized)) {
      normalized = 'https://' + normalized;
    }

    setIsSaving(true);
    try {
      const res = await api.put('/school/website', { website_url: normalized });
      const savedUrl = res.data?.data?.website_url ?? normalized;
      try {
        localStorage.setItem('school_website_url', savedUrl);
      } catch (_) {}
      if (onSaved) onSaved(savedUrl);
      toast.success('آدرس وب‌سایت مدرسه با موفقیت ذخیره شد ✅');
      onClose();
    } catch (err) {
      // Offline fallback: save to localStorage
      try {
        localStorage.setItem('school_website_url', normalized);
      } catch (_) {}
      if (onSaved) onSaved(normalized);
      toast.success('آدرس وب‌سایت مدرسه در حافظه سامانه ذخیره شد ✅');
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className={styles.modalHeader}>
          <div className={styles.modalTitleWrap}>
            <div className={styles.modalIcon}>
              <HiOutlineGlobeAlt />
            </div>
            <div>
              <h2 className={styles.modalTitle}>تنظیم وب‌سایت رسمی مدرسه</h2>
              <p className={styles.modalSubtitle}>پیوند اختصاصی سایت مدرسه برای تمام اعضای مجتمع</p>
            </div>
          </div>
          <button className={styles.closeBtn} onClick={onClose} title="بستن">
            <HiOutlineXMark />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSave}>
          <div className={styles.modalBody}>
            <div className={styles.infoBanner}>
              <HiOutlineInformationCircle size={22} style={{ flexShrink: 0, marginTop: 2 }} />
              <div>
                لینکی که در این قسمت ثبت و ذخیره می‌کنید، بر روی دکمه <strong>«وب‌سایت مدرسه»</strong> در داشبورد معلمان، دانش‌آموزان و اولیا فعال می‌شود و کاربران با کلیک روی آن مستقیماً به سایت مدرسه هدایت خواهند شد.
              </div>
            </div>

            <div className={styles.inputGroup}>
              <label htmlFor="school-url-input" className={styles.label}>
                آدرس وب‌سایت مدرسه (URL):
              </label>
              <div className={styles.urlInputWrapper}>
                <input
                  id="school-url-input"
                  type="text"
                  className={styles.urlInput}
                  placeholder="https://schoolexample.ir یا www.school.ir"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  autoFocus
                />
              </div>
              <span className={styles.helpText}>
                💡 پیشوند https:// یا http:// اختیاری است و در صورت عدم درج، به‌طور خودکار اضافه خواهد شد.
              </span>
            </div>
          </div>

          {/* Footer */}
          <div className={styles.modalFooter}>
            <div>
              {urlInput.trim() && (
                <button
                  type="button"
                  className={styles.testLinkBtn}
                  onClick={handleTestLink}
                  title="تست و باز کردن این آدرس در تب جدید"
                >
                  <HiOutlineArrowTopRightOnSquare size={16} />
                  <span>تست باز شدن لینک</span>
                </button>
              )}
            </div>

            <div className={styles.actionBtns}>
              <button type="button" className="btn btn-outline" onClick={onClose}>
                انصراف
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={isSaving}
                style={{ minWidth: 120 }}
              >
                <HiOutlineCheck size={18} />
                <span>{isSaving ? 'در حال ذخیره...' : 'ذخیره لینک سایت'}</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
