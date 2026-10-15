'use client';
import { useState } from 'react';
import useAuthStore from '../../../stores/authStore';
import styles from './children.module.css';

export default function ChildrenPage() {
  const { user } = useAuthStore();

  const demoChildren = [
    {
      id: 'c1',
      name: 'علی رضایی',
      grade: 'پایه یازدهم تجربی',
      school: 'دبیرستان هوشمند شهید بهشتی',
      attendance_rate: '۹۸٪',
      last_grade: '۱۹.۷۵ (شیمی پیشرفته)',
      pending_assignments: 1,
    },
    {
      id: 'c2',
      name: 'سارا رضایی',
      grade: 'پایه نهم',
      school: 'دبیرستان دخترانه فرزانگان',
      attendance_rate: '۱۰۰٪',
      last_grade: '۲۰ (ریاضیات پایه)',
      pending_assignments: 0,
    },
  ];

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>فرزندان من</h1>
        <p className={styles.subtitle}>
          مشاهده وضعیت تحصیلی، حضور و غیاب، و تکالیف فرزندان در سامانه هوشمند مدرسه
        </p>
      </div>

      <div className={styles.grid}>
        {demoChildren.map((child) => (
          <div key={child.id} className={styles.childCard}>
            <div className={styles.childHeader}>
              <div className={styles.childAvatar}>
                {child.name.charAt(0)}
              </div>
              <div>
                <h3 className={styles.childName}>{child.name}</h3>
                <span className={styles.childMeta}>
                  {child.grade} • {child.school}
                </span>
              </div>
            </div>

            <div className={styles.metricsGlassBox}>
              <div className={styles.metricItem}>
                <span className={styles.metricLabel}>درصد حضور کلاسی:</span>
                <span className={styles.metricValSuccess}>{child.attendance_rate}</span>
              </div>
              <div className={styles.metricItem}>
                <span className={styles.metricLabel}>آخرین ارزیابی ثبت شده:</span>
                <span className={styles.metricValPrimary}>{child.last_grade}</span>
              </div>
            </div>

            <div className={styles.cardFooter}>
              <span>تکالیف در انتظار انجام:</span>
              <span className={`badge ${child.pending_assignments > 0 ? 'badge-warning' : 'badge-success'}`}>
                {child.pending_assignments > 0 ? `${child.pending_assignments} تکلیف فعال` : 'همه انجام شده'}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
