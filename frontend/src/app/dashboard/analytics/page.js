'use client';
import { useState, useEffect } from 'react';
import useAuthStore from '../../../stores/authStore';
import api from '../../../lib/api';
import toast from 'react-hot-toast';
import {
  HiOutlineChartBar,
  HiOutlineDocumentArrowDown,
  HiOutlinePrinter,
  HiOutlineAcademicCap,
  HiOutlineUserGroup,
  HiOutlineTrophy,
  HiOutlineCheckBadge,
} from 'react-icons/hi2';
import styles from './analytics.module.css';

export default function AnalyticsPage() {
  const { user } = useAuthStore();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchAnalytics = async () => {
    try {
      setLoading(true);
      const res = await api.get('/analytics/overview');
      if (res.data?.success) {
        setData(res.data.data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
  }, []);

  // Export to Excel (CSV with UTF-8 BOM for Persian compatibility)
  const handleExportExcel = () => {
    if (!data?.classes) return;

    let csvContent = '\uFEFF'; // UTF-8 BOM
    csvContent += 'کد کلاس,عنوان کلاس,موضوع,پایه,دبیر مربوطه,تعداد دانش‌آموز,میانگین نمرات (از ۲۰),درصد حضور,درصد قبولی\n';

    data.classes.forEach((c) => {
      csvContent += `"${c.id}","${c.name}","${c.subject}","${c.grade}","${c.teacher}","${c.students_count}","${c.average_grade}","${c.attendance_percentage}%","${c.pass_rate}%"\n`;
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `گزارش_آماری_مدرسه_${new Date().toLocaleDateString('fa-IR').replace(/\//g, '-')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('خروجی اکسل با موفقیت دانلود شد! 📊');
  };

  return (
    <div className={styles.container}>

      {/* Header */}
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>داشبورد تحلیلی، آماری و خروجی گزارش‌ها</h1>
          <p className={styles.subtitle}>
            پایش هوشمند بازدهی کلاس‌ها، توزیع تراز علمی، رتبه‌بندی نخبگان و خروجی رسمی Excel / PDF
          </p>
        </div>

        <div className={styles.exportButtons}>
          <button
            className="btn btn-primary btn-sm"
            onClick={handleExportExcel}
            type="button"
          >
            <HiOutlineDocumentArrowDown />
            <span>خروجی Excel (فارسی)</span>
          </button>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => window.print()}
            type="button"
          >
            <HiOutlinePrinter />
            <span>پرینت گزارش تحلیلی (PDF)</span>
          </button>
        </div>
      </div>

      {/* KPI Cards Strip */}
      <div className={styles.kpiGrid}>
        <div className={styles.kpiCard}>
          <div className={styles.kpiIcon} style={{ background: 'rgba(99, 102, 241, 0.1)', color: '#818cf8' }}>
            <HiOutlineUserGroup />
          </div>
          <div>
            <div className={styles.kpiVal}>{data?.schoolSummary?.total_students || 87}</div>
            <div className={styles.kpiLbl}>کل دانش‌آموزان مدرسه</div>
          </div>
        </div>

        <div className={styles.kpiCard}>
          <div className={styles.kpiIcon} style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#34d399' }}>
            <HiOutlineAcademicCap />
          </div>
          <div>
            <div className={styles.kpiVal} style={{ color: '#34d399' }}>
              {data?.schoolSummary?.overall_school_gpa || '۱۸.۷۴'}
            </div>
            <div className={styles.kpiLbl}>معدل کل مجتمع (GPA)</div>
          </div>
        </div>

        <div className={styles.kpiCard}>
          <div className={styles.kpiIcon} style={{ background: 'rgba(6, 182, 212, 0.1)', color: '#22d3ee' }}>
            <HiOutlineCheckBadge />
          </div>
          <div>
            <div className={styles.kpiVal}>{data?.schoolSummary?.overall_attendance || '۹۶.۲٪'}</div>
            <div className={styles.kpiLbl}>درصد حضور و غیاب میانگین</div>
          </div>
        </div>

        <div className={styles.kpiCard}>
          <div className={styles.kpiIcon} style={{ background: 'rgba(245, 158, 11, 0.1)', color: '#fbbf24' }}>
            <HiOutlineTrophy />
          </div>
          <div>
            <div className={styles.kpiVal}>{data?.schoolSummary?.active_olympiad_teams || 6}</div>
            <div className={styles.kpiLbl}>تیم‌های فعال المپیاد کشوری</div>
          </div>
        </div>
      </div>

      {/* Charts Grid */}
      <div className={styles.chartsGrid}>
        {/* Class Average Performance Chart */}
        <div className={styles.chartCard}>
          <h2 className={styles.chartTitle}>مقایسه بازدهی و میانگین نمرات کلاس‌ها (از ۲۰)</h2>
          <div className={styles.classBarList}>
            {data?.classes?.map((c) => (
              <div key={c.id} className={styles.classBarItem}>
                <div className={styles.classBarLabelRow}>
                  <span>{c.name} ({c.subject})</span>
                  <span style={{ color: '#38bdf8' }}>{c.average_grade} / ۲۰</span>
                </div>
                <div className={styles.classBarTrack}>
                  <div
                    className={styles.classBarFill}
                    style={{ width: `${(c.average_grade / 20) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Grade Distribution */}
        <div className={styles.chartCard}>
          <h2 className={styles.chartTitle}>توزیع درصدی سطوح نمرات کل مدرسه</h2>
          <div className={styles.distList}>
            {data?.gradeDistribution?.map((g, i) => (
              <div key={i} className={styles.distItem}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem' }}>
                  <span>{g.range}</span>
                  <strong style={{ color: '#a5b4fc' }}>{g.percentage}٪ ({g.count} نفر)</strong>
                </div>
                <div className={styles.distTrack}>
                  <div
                    className={styles.distFill}
                    style={{
                      width: `${g.percentage}%`,
                      background: i === 0 ? '#10b981' : i === 1 ? '#6366f1' : i === 2 ? '#f59e0b' : '#ef4444',
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Top Students Ranking Table */}
      <div className={styles.tableCard}>
        <div className={styles.tableHeader}>
          🏆 برترین رتبه‌های علمی و دانش‌آموزان ممتاز (تراز الف)
        </div>

        <table className={styles.rankTable}>
          <thead>
            <tr>
              <th style={{ width: '60px' }}>رتبه</th>
              <th>نام و نام خانوادگی</th>
              <th>شماره دانش‌آموزی</th>
              <th>معدل کل (GPA)</th>
              <th>افتخارات و وضعیت المپیاد</th>
            </tr>
          </thead>
          <tbody>
            {data?.topStudents?.map((st) => (
              <tr key={st.rank}>
                <td>
                  <span
                    className={`${styles.rankBadge} ${
                      st.rank === 1 ? styles.rank1 : st.rank === 2 ? styles.rank2 : styles.rank3
                    }`}
                  >
                    {st.rank}
                  </span>
                </td>
                <td style={{ fontWeight: 800 }}>{st.name}</td>
                <td style={{ fontFamily: 'monospace', color: 'var(--text-tertiary)' }}>
                  {st.student_code}
                </td>
                <td style={{ fontWeight: 900, color: '#34d399' }}>{st.gpa}</td>
                <td>
                  <span className="badge badge-primary">{st.olympiad_status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
