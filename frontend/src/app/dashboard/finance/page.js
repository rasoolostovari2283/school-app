'use client';
import { useState, useEffect } from 'react';
import useAuthStore from '../../../stores/authStore';
import api from '../../../lib/api';
import toast, { Toaster } from 'react-hot-toast';
import {
  HiOutlineBanknotes,
  HiOutlineCreditCard,
  HiOutlineReceiptPercent,
  HiOutlineCheckBadge,
  HiOutlineXMark,
  HiOutlineArrowUpTray,
  HiOutlineShieldCheck,
} from 'react-icons/hi2';
import styles from './finance.module.css';

export default function FinancePage() {
  const { user } = useAuthStore();
  const isTeacher = user?.role === 'teacher';

  const [ledger, setLedger] = useState(null);
  const [installments, setInstallments] = useState([]);
  const [loading, setLoading] = useState(true);

  // Pay Modal
  const [activeInstallment, setActiveInstallment] = useState(null);
  const [trackingNumber, setTrackingNumber] = useState('');
  const [bankName, setBankName] = useState('بانک ملت / درگاه شتاب');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchFinance = async () => {
    try {
      setLoading(true);
      const res = await api.get('/finance/ledger');
      if (res.data?.success) {
        setLedger(res.data.data.ledger);
        setInstallments(res.data.data.installments || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFinance();
  }, []);

  const handlePaySubmit = async (e) => {
    e.preventDefault();
    if (!activeInstallment) return;
    setIsSubmitting(true);
    try {
      const res = await api.post(`/finance/pay-installment/${activeInstallment.id}`, {
        tracking_number: trackingNumber,
        bank_name: bankName,
      });

      if (res.data?.success) {
        toast.success(res.data.message || 'فیش واریزی با موفقیت ثبت شد! 🎉');
        setActiveInstallment(null);
        setTrackingNumber('');
        fetchFinance();
      }
    } catch (err) {
      toast.error('خطا در ثبت فیش واریزی');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVerify = async (installmentId) => {
    try {
      const res = await api.post(`/finance/verify-installment/${installmentId}`);
      if (res.data?.success) {
        toast.success(res.data.message || 'فیش تایید و ثبت قطعی شد ✅');
        fetchFinance();
      }
    } catch (err) {
      toast.error('خطا در تایید فیش');
    }
  };

  const formatToman = (amount) => {
    if (amount == null) return '۰';
    return Number(amount).toLocaleString('fa-IR') + ' تومان';
  };

  return (
    <div className={styles.container}>
      <Toaster position="top-center" />

      {/* Header */}
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>مدیریت مالی و اقساط شهریه</h1>
          <p className={styles.subtitle}>
            پیگیری وضعیت شهریه مصوب، تخفیف نخبگان و دانش‌آموزان ممتاز، ثبت فیش‌های واریزی و تسویه‌حساب مالی
          </p>
        </div>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <span className="badge badge-success">
            سال تحصیلی ۱۴۰۳-۱۴۰۴
          </span>
        </div>
      </div>

      {/* Ledger Summary Strip */}
      <div className={styles.ledgerGrid}>
        <div className={styles.ledgerCard}>
          <div className={styles.ledgerIcon} style={{ background: 'rgba(99, 102, 241, 0.1)', color: '#818cf8' }}>
            <HiOutlineBanknotes />
          </div>
          <div className={styles.ledgerInfo}>
            <span className={styles.ledgerValue}>{formatToman(ledger?.total_amount)}</span>
            <span className={styles.ledgerLabel}>کل شهریه مصوب سالانه</span>
          </div>
        </div>

        <div className={styles.ledgerCard}>
          <div className={styles.ledgerIcon} style={{ background: 'rgba(245, 158, 11, 0.1)', color: '#fbbf24' }}>
            <HiOutlineReceiptPercent />
          </div>
          <div className={styles.ledgerInfo}>
            <span className={styles.ledgerValue}>{formatToman(ledger?.discount_amount)}</span>
            <span className={styles.ledgerLabel}>تخفیف نخبگان و دانش‌آموزان برتر</span>
          </div>
        </div>

        <div className={styles.ledgerCard}>
          <div className={styles.ledgerIcon} style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#34d399' }}>
            <HiOutlineCreditCard />
          </div>
          <div className={styles.ledgerInfo}>
            <span className={styles.ledgerValue}>{formatToman(ledger?.paid_amount)}</span>
            <span className={styles.ledgerLabel}>مجموع واریزی‌های تاییدشده</span>
          </div>
        </div>

        <div className={styles.ledgerCard}>
          <div className={styles.ledgerIcon} style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#f87171' }}>
            <HiOutlineCheckBadge />
          </div>
          <div className={styles.ledgerInfo}>
            <span className={styles.ledgerValue} style={{ color: ledger?.balance === 0 ? '#34d399' : '#f87171' }}>
              {formatToman(ledger?.balance)}
            </span>
            <span className={styles.ledgerLabel}>مانده بدهی قابل پرداخت</span>
          </div>
        </div>
      </div>

      {/* Installments Table */}
      <div className={styles.tableCard}>
        <div className={styles.tableHeaderRow}>
          <h2 className={styles.tableTitle}>برنامه زمانی و جدول اقساط شهریه</h2>
          <span style={{ fontSize: '0.8125rem', color: 'var(--text-tertiary)' }}>
            وضعیت کلی پرونده: {ledger?.balance === 0 ? '✅ تسویه‌حساب کامل' : '⏳ در حال پرداخت اقساط'}
          </span>
        </div>

        <table className={styles.table}>
          <thead>
            <tr>
              <th>قسط</th>
              <th>عنوان مرحله</th>
              <th>مبلغ قسط</th>
              <th>تاریخ سررسید</th>
              <th>شماره پیگیری فیش</th>
              <th>وضعیت پرداخت</th>
              <th style={{ textAlign: 'center' }}>عملیات</th>
            </tr>
          </thead>
          <tbody>
            {installments.map((inst) => (
              <tr key={inst.id}>
                <td style={{ fontWeight: 800 }}>قسط {inst.installment_number}</td>
                <td style={{ fontWeight: 700 }}>{inst.title}</td>
                <td className={styles.amountText}>{formatToman(inst.amount)}</td>
                <td style={{ fontFamily: 'monospace' }}>{inst.due_date}</td>
                <td style={{ fontFamily: 'monospace', color: 'var(--text-secondary)' }}>
                  {inst.tracking_number || '—'}
                </td>
                <td>
                  {inst.status === 'verified' ? (
                    <span className={styles.statusVerified}>✓ تایید حسابداری</span>
                  ) : inst.status === 'submitted' ? (
                    <span className={styles.statusSubmitted}>⏳ در انتظار تایید</span>
                  ) : (
                    <span className={styles.statusPending}>پرداخت نشده</span>
                  )}
                </td>
                <td style={{ textAlign: 'center' }}>
                  {inst.status === 'verified' ? (
                    <span style={{ color: '#34d399', fontSize: '0.8125rem', fontWeight: 700 }}>تسویه شد</span>
                  ) : isTeacher && inst.status === 'submitted' ? (
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={() => handleVerify(inst.id)}
                      type="button"
                    >
                      <HiOutlineShieldCheck />
                      <span>تایید و ثبت فیش</span>
                    </button>
                  ) : (
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => setActiveInstallment(inst)}
                      type="button"
                    >
                      <HiOutlineArrowUpTray />
                      <span>ثبت فیش واریز</span>
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Modal: Submit Payment Receipt ── */}
      {activeInstallment && (
        <div className="modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div style={{ background: 'var(--bg-card)', padding: '24px', borderRadius: 'var(--radius-2xl)', maxWidth: '440px', width: '100%', border: '1px solid var(--border-color)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontWeight: 800 }}>ثبت فیش واریزی: {activeInstallment.title}</h3>
              <button onClick={() => setActiveInstallment(null)} style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: '1.25rem' }}>
                <HiOutlineXMark />
              </button>
            </div>

            <form onSubmit={handlePaySubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ padding: '12px', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-lg)', fontSize: '0.875rem' }}>
                مبلغ قابل پرداخت: <strong style={{ color: '#38bdf8' }}>{formatToman(activeInstallment.amount)}</strong>
              </div>

              <div className="input-group">
                <label className="input-label" htmlFor="pay_trx">شماره پیگیری فیش بانکی یا ارجاع کارت‌به‌کارت</label>
                <input
                  id="pay_trx"
                  type="text"
                  className="input"
                  placeholder="مثلاً: TRX-984012"
                  value={trackingNumber}
                  onChange={(e) => setTrackingNumber(e.target.value)}
                  required
                  dir="ltr"
                />
              </div>

              <div className="input-group">
                <label className="input-label" htmlFor="pay_bank">بانک مبدأ / درگاه پرداخت</label>
                <select
                  id="pay_bank"
                  className="input"
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                >
                  <option value="بانک ملی ایران">بانک ملی ایران</option>
                  <option value="بانک ملت">بانک ملت</option>
                  <option value="بانک صادرات">بانک صادرات</option>
                  <option value="بانک پاسارگاد">بانک پاسارگاد</option>
                  <option value="درگاه الکترونیکی شتاب">درگاه الکترونیکی شتاب</option>
                </select>
              </div>

              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '10px' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setActiveInstallment(null)}>
                  انصراف
                </button>
                <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
                  {isSubmitting ? 'در حال ثبت...' : 'ارسال برای تایید حسابداری'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
