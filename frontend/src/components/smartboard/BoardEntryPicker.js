'use client';

import React, { useState } from 'react';
import {
  HiOutlineComputerDesktop,
  HiOutlineSparkles,
  HiOutlineCheckCircle,
  HiOutlineArrowLeft,
} from 'react-icons/hi2';
import styles from '../../app/dashboard/record/record.module.css';

export default function BoardEntryPicker({ userRole, onSelectBoard }) {
  const [sessionTitle, setSessionTitle] = useState('');
  const isTeacher = ['teacher', 'admin', 'manager'].includes(userRole);

  const handleEnter = (type) => {
    const cleanTitle =
      sessionTitle.trim() ||
      (isTeacher ? 'جلسه تدریس تخته هوشمند' : 'یادداشت و تمرین تخته هوشمند');
    onSelectBoard({ boardType: type, title: cleanTitle });
  };

  return (
    <div className={styles.entryPage} data-testid="smartboard-entry-picker">
      <div className={styles.entryHero}>
        <div className={styles.entryHeroBadge}>
          <HiOutlineComputerDesktop />
          <span>{isTeacher ? 'استودیو تدریس و تخته هوشمند معلم' : 'تخته هوشمند و دفتر تمرین دانش‌آموز'}</span>
        </div>
        <h1 className={styles.entryHeroTitle}>ورود به تخته هوشمند</h1>
        <p className={styles.entryHeroSub}>
          پیش از شروع، نوع صفحه تخته را انتخاب کنید. درون تخته می‌توانید با قلم و پاک‌کن بنویسید، فایل‌های PDF، Word، PowerPoint، عکس و ویدیو باز کنید، در کنار آن‌ها نت بردارید و کلاس خود را با صدا ضبط کنید.
        </p>

        <div className={styles.entryTitleField}>
          <label htmlFor="smartboard-session-title" className={styles.entryTitleLabel}>
            عنوان جلسه یا جزوه (اختیاری)
          </label>
          <input
            id="smartboard-session-title"
            type="text"
            className={styles.entryTitleInput}
            placeholder="مثلاً: فصل اول فیزیک دهم — حرکت شناسی"
            value={sessionTitle}
            onChange={(e) => setSessionTitle(e.target.value)}
            data-testid="smartboard-title-input"
          />
        </div>
      </div>

      <div className={styles.entryGrid}>
        <button
          type="button"
          className={styles.entryCard}
          onClick={() => handleEnter('white')}
          data-testid="choose-white-board"
        >
          <div className={`${styles.entryPreview} ${styles.entryPreviewWhite}`}>
            <div className={styles.previewDoodleWhite}>
              <span className={styles.previewTag}>ساده و خوانا</span>
            </div>
          </div>
          <div className={styles.entryCardBody}>
            <div className={styles.entryCardHeader}>
              <h2>صفحه سفید</h2>
              <HiOutlineCheckCircle className={styles.entryCheckIcon} />
            </div>
            <p>مناسب برای تدریس عمومی، خلاصه‌نویسی، حاشیه‌نویسی روی PDF و جزوه و حل تمرین‌های تشریحی.</p>
            <span className={styles.entryCardCta}>
              <span>ورود با صفحه سفید</span>
              <HiOutlineArrowLeft />
            </span>
          </div>
        </button>

        <button
          type="button"
          className={styles.entryCard}
          onClick={() => handleEnter('grid')}
          data-testid="choose-grid-board"
        >
          <div className={`${styles.entryPreview} ${styles.entryPreviewGrid}`}>
            <div className={styles.previewDoodleGrid}>
              <span className={styles.previewTagGrid}>مختصات و رسم دقیق</span>
            </div>
          </div>
          <div className={styles.entryCardBody}>
            <div className={styles.entryCardHeader}>
              <h2>صفحه شطرنجی</h2>
              <HiOutlineSparkles className={styles.entryCheckIcon} />
            </div>
            <p>مناسب برای ریاضی، فیزیک، هندسه، رسم نمودار مختصات و نوشتن منظم معادلات و جدول‌ها.</p>
            <span className={styles.entryCardCta}>
              <span>ورود با صفحه شطرنجی</span>
              <HiOutlineArrowLeft />
            </span>
          </div>
        </button>
      </div>
    </div>
  );
}
