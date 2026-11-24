'use client';
import { useState } from 'react';
import toast from 'react-hot-toast';
import {
  HiOutlineUserGroup,
  HiOutlineSparkles,
  HiOutlineTrophy,
  HiOutlineCheckCircle,
  HiOutlineDocumentArrowDown,
} from 'react-icons/hi2';
import { exportGradeTableToPdf } from '../../utils/gradebookPdfExporter';
import styles from './GradeTableFooterSummary.module.css';

export function computeLocalClassStats(scoresList = [], { totalStudents = null, passThreshold = 12 } = {}) {
  const valid = (Array.isArray(scoresList) ? scoresList : [])
    .filter((v) => v !== null && v !== undefined && v !== '' && !Number.isNaN(Number(v)))
    .map((v) => Number(v));

  const count = totalStudents != null ? Number(totalStudents) : (Array.isArray(scoresList) ? scoresList.length : 0);
  if (valid.length === 0) {
    return {
      total_students: count,
      graded_count: 0,
      class_average: null,
      highest_score: null,
      pass_rate: 0,
    };
  }

  const sum = valid.reduce((acc, n) => acc + n, 0);
  const avg = Math.round((sum / valid.length) * 100) / 100;
  const highest = Math.round(Math.max(...valid) * 100) / 100;
  const passed = valid.filter((n) => n >= passThreshold).length;
  const passRate = Math.round((passed / valid.length) * 100);

  return {
    total_students: count,
    graded_count: valid.length,
    class_average: avg,
    highest_score: highest,
    pass_rate: passRate,
  };
}

export default function GradeTableFooterSummary({
  stats,
  pdfConfig = null,
  testIdPrefix = 'grade-table-footer',
  passThresholdLabel = 'نمره ۱۲ به بالا',
}) {
  const [exporting, setExporting] = useState(false);

  const safeStats = stats || {
    total_students: 0,
    graded_count: 0,
    class_average: null,
    highest_score: null,
    pass_rate: 0,
  };

  const handleDownloadPdf = async () => {
    if (!pdfConfig) return;
    setExporting(true);
    try {
      await exportGradeTableToPdf({
        ...pdfConfig,
        stats: safeStats,
      });
      toast.success('فایل پی‌دی‌اف نمرات با موفقیت دانلود شد');
    } catch (err) {
      console.error('PDF export error:', err);
      toast.error('خطا در ساخت فایل PDF نمرات');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className={styles.footerWrap} data-testid={testIdPrefix}>
      <div className={styles.statsGrid}>
        <div className={styles.statBox} data-testid={`${testIdPrefix}-total`}>
          <div className={styles.statHeader}>
            <span className={styles.statLabel}>تعداد دانش‌آموزان</span>
            <HiOutlineUserGroup className={styles.statIcon} style={{ color: '#6366f1' }} />
          </div>
          <span className={styles.statValue}>{safeStats.total_students ?? 0} نفر</span>
          <span className={styles.statMeta}>
            {safeStats.graded_count != null ? `${safeStats.graded_count} نفر نمره‌دهی‌شده` : 'کل اعضای کلاس'}
          </span>
        </div>

        <div className={styles.statBox} data-testid={`${testIdPrefix}-avg`}>
          <div className={styles.statHeader}>
            <span className={styles.statLabel}>میانگین نمرات کلاس</span>
            <HiOutlineSparkles className={styles.statIcon} style={{ color: '#2563eb' }} />
          </div>
          <span className={styles.statValue} style={{ color: '#2563eb' }}>
            {safeStats.class_average != null ? safeStats.class_average : '—'}
          </span>
          <span className={styles.statMeta}>محاسبه خودکار از نمرات ثبت‌شده</span>
        </div>

        <div className={styles.statBox} data-testid={`${testIdPrefix}-highest`}>
          <div className={styles.statHeader}>
            <span className={styles.statLabel}>بالاترین نمره کلاس</span>
            <HiOutlineTrophy className={styles.statIcon} style={{ color: '#059669' }} />
          </div>
          <span className={styles.statValue} style={{ color: '#059669' }}>
            {safeStats.highest_score != null ? safeStats.highest_score : '—'}
          </span>
          <span className={styles.statMeta}>بیشترین نمره ثبت‌شده</span>
        </div>

        <div className={styles.statBox} data-testid={`${testIdPrefix}-passrate`}>
          <div className={styles.statHeader}>
            <span className={styles.statLabel}>درصد قبولی کلاس</span>
            <HiOutlineCheckCircle className={styles.statIcon} style={{ color: '#d97706' }} />
          </div>
          <span className={styles.statValue} style={{ color: '#d97706' }}>
            {safeStats.graded_count > 0 ? `${safeStats.pass_rate}٪` : '—'}
          </span>
          <span className={styles.statMeta}>معیار قبولی: {passThresholdLabel}</span>
        </div>
      </div>

      {pdfConfig && (
        <div className={styles.actionsRow}>
          <span className={styles.autoNote}>
            آمار فوق به‌صورت خودکار پس از ثبت هر نمره بروزرسانی می‌شود.
          </span>
          <button
            type="button"
            className={styles.pdfBtn}
            onClick={handleDownloadPdf}
            disabled={exporting}
            data-testid="download-grades-pdf-btn"
          >
            <HiOutlineDocumentArrowDown style={{ fontSize: '1.1rem' }} />
            <span>{exporting ? 'در حال آماده‌سازی PDF...' : 'دانلود پی‌دی‌اف نمرات (PDF)'}</span>
          </button>
        </div>
      )}
    </div>
  );
}
