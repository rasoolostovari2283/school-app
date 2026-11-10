'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuthStore } from '@/stores/authStore';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import {
  HiOutlineBanknotes,
  HiOutlineCheckCircle,
  HiOutlineClock,
  HiOutlineReceiptPercent,
  HiOutlineDocumentCheck,
  HiOutlineCreditCard,
  HiOutlinePrinter,
  HiOutlineShieldCheck,
  HiOutlineUserGroup,
  HiOutlineSparkles,
  HiOutlinePlusCircle,
  HiOutlineArrowPath,
} from 'react-icons/hi2';

export default function FinancePage() {
  const { user } = useAuthStore();
  const [ledger, setLedger] = useState(null);
  const [installments, setInstallments] = useState([]);
  const [studentInfo, setStudentInfo] = useState(null);
  const [loading, setLoading] = useState(true);

  // Student directory for Admin / Financial Officer / Teacher
  const [students, setStudents] = useState([]);
  const [selectedStudentId, setSelectedStudentId] = useState('');

  // Manual receipt modal state
  const [payingItem, setPayingItem] = useState(null);
  const [trackingNumber, setTrackingNumber] = useState('');
  const [bankName, setBankName] = useState('بانک ملت / کارت به کارت');
  const [submitting, setSubmitting] = useState(false);

  // Shaparak Online IPG state
  const [shaparakSession, setShaparakSession] = useState(null);
  const [shaparakProcessing, setShaparakProcessing] = useState(false);
  const [lastReceipt, setLastReceipt] = useState(null);

  // Sheba (IBAN) validator state
  const [shebaInput, setShebaInput] = useState('IR062960000000100324200001');
  const [shebaResult, setShebaResult] = useState(null);
  const [validatingSheba, setValidatingSheba] = useState(false);

  // Create Ledger modal state for Admin / Financial Officer
  const [showCreateLedger, setShowCreateLedger] = useState(false);
  const [newLedgerForm, setNewLedgerForm] = useState({
    academic_year: '1403-1404',
    total_amount: 450000000,
  });

  const role = String(user?.role || '').toLowerCase();
  const canVerify = ['admin', 'manager', 'school_admin', 'principal', 'headmaster', 'financial_officer', 'accountant'].includes(role);
  const isStaff = canVerify || role === 'teacher';

  const fetchStudentsList = useCallback(async () => {
    if (!isStaff) return;
    try {
      const { data } = await api.get('/school/members');
      const list = data?.data?.students || [];
      setStudents(list);
      if (list.length > 0 && !selectedStudentId) {
        setSelectedStudentId(list[0].id);
      }
    } catch {
      // ignore if student/parent
    }
  }, [isStaff, selectedStudentId]);

  const fetchLedger = useCallback(async (targetStudentId) => {
    setLoading(true);
    try {
      const sid = targetStudentId || selectedStudentId;
      const query = isStaff && sid ? `?student_id=${encodeURIComponent(sid)}` : '';
      const { data } = await api.get(`/finance/ledger${query}`);
      setStudentInfo(data.data?.student || null);
      setLedger(data.data?.ledger || null);
      setInstallments(data.data?.installments || []);
    } catch (err) {
      toast.error(err.response?.data?.message || 'خطا در دریافت اطلاعات مالی');
    } finally {
      setLoading(false);
    }
  }, [isStaff, selectedStudentId]);

  useEffect(() => {
    if (isStaff) {
      fetchStudentsList();
    } else {
      fetchLedger('');
    }
  }, [isStaff, fetchStudentsList, fetchLedger]);

  useEffect(() => {
    if (isStaff && selectedStudentId) {
      fetchLedger(selectedStudentId);
    }
  }, [isStaff, selectedStudentId, fetchLedger]);

  const handlePaySubmit = async (e) => {
    e.preventDefault();
    if (!payingItem) return;
    setSubmitting(true);
    try {
      const { data } = await api.post(`/finance/pay-installment/${payingItem.id}`, {
        tracking_number: trackingNumber,
        bank_name: bankName,
      });
      toast.success(data.message || 'فیش پرداخت با موفقیت ثبت شد');
      setPayingItem(null);
      setTrackingNumber('');
      fetchLedger(selectedStudentId);
    } catch (err) {
      toast.error(err.response?.data?.message || 'خطا در ثبت پرداخت');
    } finally {
      setSubmitting(false);
    }
  };

  const handleInitiateShaparak = async (inst) => {
    setShaparakProcessing(true);
    try {
      const { data } = await api.post(`/finance/initiate-payment/${inst.id}`, {
        gateway: 'behpardakht_mellat',
        school_sheba: shebaInput,
      });
      setShaparakSession({
        ...data.data,
        installment: inst,
      });
      toast.success('نشست امن درگاه شاپرک ایجاد شد');
    } catch (err) {
      toast.error(err.response?.data?.message || 'خطا در اتصال به درگاه شاپرک');
    } finally {
      setShaparakProcessing(false);
    }
  };

  const handleConfirmShaparakPayment = async () => {
    if (!shaparakSession?.installment) return;
    setShaparakProcessing(true);
    try {
      const { data } = await api.post(`/finance/callback-verify/${shaparakSession.installment.id}`, {
        authority: shaparakSession.authority,
        card_pan: '6037-9975-****-4812',
        status: 'OK',
      });
      setLastReceipt(data.data?.receipt || null);
      setShaparakSession(null);
      toast.success(data.message || 'تراکنش شاپرک با موفقیت تایید و تسویه شد');
      fetchLedger(selectedStudentId);
    } catch (err) {
      toast.error(err.response?.data?.message || 'خطا در تایید تراکنش شاپرک');
    } finally {
      setShaparakProcessing(false);
    }
  };

  const handleVerify = async (id) => {
    try {
      const { data } = await api.post(`/finance/verify-installment/${id}`);
      toast.success(data.message || 'فیش تایید و در دفتر کل ثبت شد');
      fetchLedger(selectedStudentId);
    } catch (err) {
      toast.error(err.response?.data?.message || 'خطا در تایید فیش');
    }
  };

  const handleValidateSheba = async () => {
    setValidatingSheba(true);
    try {
      const { data } = await api.post('/finance/validate-sheba', { sheba: shebaInput });
      setShebaResult(data.data);
      if (data.data?.valid) {
        toast.success(`شماره شبا معتبر است (${data.data.bank_name || data.data.bankName || 'بانک مرکزی'})`);
      } else {
        toast.error(data.message || 'شماره شبا نامعتبر است');
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'خطا در اعتبارسنجی شبا');
    } finally {
      setValidatingSheba(false);
    }
  };

  const handleCreateLedger = async (e) => {
    e.preventDefault();
    if (!selectedStudentId) {
      toast.error('ابتدا یک دانش‌آموز را انتخاب کنید');
      return;
    }
    setSubmitting(true);
    try {
      const { data } = await api.post('/finance/create-ledger', {
        student_id: selectedStudentId,
        academic_year: newLedgerForm.academic_year,
        total_amount: Number(newLedgerForm.total_amount),
      });
      toast.success(data.message || 'دفتر کل شهریه و اقساط صادر شد');
      setShowCreateLedger(false);
      fetchLedger(selectedStudentId);
    } catch (err) {
      toast.error(err.response?.data?.message || 'خطا در صدور دفتر کل شهریه');
    } finally {
      setSubmitting(false);
    }
  };

  const formatRial = (num) => Number(num || 0).toLocaleString('fa-IR');
  const formatToman = (num) => Math.round(Number(num || 0) / 10).toLocaleString('fa-IR');

  const totalAmount = Number(ledger?.total_amount || ledger?.total_tuition || 0);
  const discountAmount = Number(ledger?.discount_amount || 0);
  const paidAmount = Number(ledger?.paid_amount || 0);
  const totalNet = Math.max(0, totalAmount - discountAmount);
  const remaining = ledger?.balance !== undefined ? Number(ledger.balance) : Math.max(0, totalNet - paidAmount);
  const paidPercent = totalNet > 0 ? Math.min(100, Math.round((paidAmount / totalNet) * 100)) : 0;

  return (
    <div style={{ direction: 'rtl', maxWidth: '1240px', margin: '0 auto', paddingBottom: '3rem' }}>
      {/* Header Banner */}
      <div
        style={{
          background: 'linear-gradient(135deg, #064e3b 0%, #0f172a 60%, #1e1b4b 100%)',
          borderRadius: '26px',
          padding: '1.85rem 2.2rem',
          color: '#fff',
          marginBottom: '1.5rem',
          boxShadow: '0 18px 40px -12px rgba(6, 78, 59, 0.4)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1.25rem',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.45rem', flexWrap: 'wrap' }}>
            <span
              style={{
                background: 'rgba(16, 185, 129, 0.22)',
                border: '1px solid rgba(52, 211, 153, 0.45)',
                color: '#6ee7b7',
                padding: '0.22rem 0.85rem',
                borderRadius: '999px',
                fontSize: '0.75rem',
                fontWeight: 800,
              }}
            >
              متصل به شبکه شاپرک و اعتبارسنجی شبا (ISO-7064)
            </span>
            <span style={{ fontSize: '0.8rem', color: '#cbd5e1' }}>
              سال تحصیلی {ledger?.academic_year || '۱۴۰۳-۱۴۰۴'}
            </span>
          </div>
          <h1 style={{ fontSize: '1.65rem', fontWeight: 900, margin: 0, display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <HiOutlineBanknotes className="w-8 h-8 text-emerald-400" />
            <span>امور مالی، شهریه، اقساط و درگاه پرداخت شاپرک</span>
          </h1>
          <p style={{ color: '#cbd5e1', fontSize: '0.9rem', marginTop: '0.45rem', marginBottom: 0 }}>
            مدیریت شفاف شهریه، بورسیه‌های تحصیلی، پرداخت آنلاین شاپرک (به‌پرداخت ملت / زرین‌پال) و صدور رسید رسمی
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
          {canVerify && (
            <button
              type="button"
              onClick={() => setShowCreateLedger(true)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.45rem',
                background: 'linear-gradient(135deg, #10b981, #059669)',
                border: 'none',
                color: '#fff',
                padding: '0.7rem 1.2rem',
                borderRadius: '14px',
                fontWeight: 800,
                fontSize: '0.85rem',
                cursor: 'pointer',
                boxShadow: '0 8px 20px -6px rgba(16, 185, 129, 0.5)',
              }}
            >
              <HiOutlinePlusCircle style={{ fontSize: '1.15rem' }} />
              صدور دفتر کل شهریه جدید
            </button>
          )}
          <button
            type="button"
            onClick={() => window.print()}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              background: 'rgba(255,255,255,0.12)',
              border: '1px solid rgba(255,255,255,0.25)',
              color: '#fff',
              padding: '0.7rem 1.2rem',
              borderRadius: '14px',
              fontWeight: 700,
              fontSize: '0.85rem',
              cursor: 'pointer',
            }}
          >
            <HiOutlinePrinter style={{ fontSize: '1.1rem' }} />
            چاپ صورت‌حساب رسمی
          </button>
        </div>
      </div>

      {/* Staff Student Selector & Sheba Validator Row */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: isStaff ? 'repeat(auto-fit, minmax(320px, 1fr))' : '1fr',
          gap: '1rem',
          marginBottom: '1.5rem',
        }}
      >
        {isStaff && (
          <div
            style={{
              background: 'var(--bg-secondary, #fff)',
              border: '1px solid var(--border-color, #e2e8f0)',
              borderRadius: '20px',
              padding: '1.15rem 1.35rem',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              gap: '0.75rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '0.88rem', fontWeight: 900, color: 'var(--text-primary, #0f172a)', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                <HiOutlineUserGroup className="w-5 h-5 text-indigo-600" />
                انتخاب دانش‌آموز جهت بررسی پرونده مالی
              </span>
              <button
                type="button"
                onClick={() => fetchLedger(selectedStudentId)}
                style={{
                  background: '#f1f5f9',
                  border: 'none',
                  borderRadius: '10px',
                  padding: '0.35rem 0.65rem',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.3rem',
                }}
              >
                <HiOutlineArrowPath className="w-3.5 h-3.5" />
                بروزرسانی
              </button>
            </div>

            <select
              value={selectedStudentId}
              onChange={(e) => setSelectedStudentId(e.target.value)}
              style={{
                width: '100%',
                padding: '0.7rem 0.9rem',
                borderRadius: '12px',
                border: '1px solid #cbd5e1',
                fontSize: '0.88rem',
                fontWeight: 700,
                background: '#f8fafc',
                color: '#0f172a',
              }}
            >
              {students.length === 0 ? (
                <option value="">در حال بارگذاری دانش‌آموزان...</option>
              ) : (
                students.map((st) => (
                  <option key={st.id} value={st.id}>
                    {st.display_name} ({st.student_code || st.department || 'دانش‌آموز'})
                  </option>
                ))
              )}
            </select>
          </div>
        )}

        {/* Sheba (IBAN) Validator Card */}
        <div
          style={{
            background: 'var(--bg-secondary, #fff)',
            border: '1px solid var(--border-color, #e2e8f0)',
            borderRadius: '20px',
            padding: '1.15rem 1.35rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.65rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.88rem', fontWeight: 900, color: 'var(--text-primary, #0f172a)', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
              <HiOutlineShieldCheck className="w-5 h-5 text-emerald-600" />
              اعتبارسنجی شماره شبا حساب خزانه مدرسه (ISO-7064 Mod-97)
            </span>
            {shebaResult && (
              <span
                style={{
                  fontSize: '0.75rem',
                  fontWeight: 800,
                  padding: '0.2rem 0.65rem',
                  borderRadius: '999px',
                  background: shebaResult.valid ? '#dcfce7' : '#fee2e2',
                  color: shebaResult.valid ? '#166534' : '#991b1b',
                }}
              >
                {shebaResult.valid ? `✓ ${shebaResult.bank_name || shebaResult.bankName}` : '✗ شبا نامعتبر'}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <input
              type="text"
              dir="ltr"
              value={shebaInput}
              onChange={(e) => setShebaInput(e.target.value)}
              placeholder="IR062960000000100324200001"
              style={{
                flex: 1,
                padding: '0.6rem 0.85rem',
                borderRadius: '12px',
                border: '1px solid #cbd5e1',
                fontFamily: 'monospace',
                fontSize: '0.85rem',
                background: '#f8fafc',
              }}
            />
            <button
              type="button"
              onClick={handleValidateSheba}
              disabled={validatingSheba}
              style={{
                padding: '0.6rem 1rem',
                borderRadius: '12px',
                border: 'none',
                background: '#0f172a',
                color: '#fff',
                fontWeight: 800,
                fontSize: '0.8rem',
                cursor: 'pointer',
              }}
            >
              {validatingSheba ? '...' : 'بررسی شبا'}
            </button>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      {ledger && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))',
            gap: '1rem',
            marginBottom: '1.5rem',
          }}
        >
          <div
            style={{
              background: 'var(--bg-secondary, #fff)',
              border: '1px solid var(--border-color, #e2e8f0)',
              borderRadius: '20px',
              padding: '1.25rem',
            }}
          >
            <div style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 700 }}>شهریه مصوب سالانه</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 900, color: 'var(--text-primary, #0f172a)', marginTop: '0.35rem', fontVariantNumeric: 'tabular-nums' }}>
              {formatToman(totalAmount)} <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>تومان</span>
            </div>
            <div style={{ fontSize: '0.73rem', color: '#64748b', marginTop: '0.2rem' }}>
              معادل {formatRial(totalAmount)} ریال {studentInfo?.display_name ? `• ${studentInfo.display_name}` : ''}
            </div>
          </div>

          <div
            style={{
              background: 'rgba(139, 92, 246, 0.06)',
              border: '1px solid rgba(139, 92, 246, 0.25)',
              borderRadius: '20px',
              padding: '1.25rem',
            }}
          >
            <div style={{ fontSize: '0.8rem', color: '#7c3aed', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              <HiOutlineReceiptPercent /> تخفیف و بورسیه نخبگان
            </div>
            <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#6d28d9', marginTop: '0.35rem', fontVariantNumeric: 'tabular-nums' }}>
              {formatToman(discountAmount)} <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>تومان</span>
            </div>
            <div style={{ fontSize: '0.73rem', color: '#7c3aed', marginTop: '0.2rem', fontWeight: 600 }}>
              معادل {formatRial(discountAmount)} ریال بورسیه علمی
            </div>
          </div>

          <div
            style={{
              background: 'rgba(16, 185, 129, 0.06)',
              border: '1px solid rgba(16, 185, 129, 0.25)',
              borderRadius: '20px',
              padding: '1.25rem',
            }}
          >
            <div style={{ fontSize: '0.8rem', color: '#059669', fontWeight: 700 }}>مجموع پرداخت‌شده ({paidPercent.toLocaleString('fa-IR')}٪)</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#047857', marginTop: '0.35rem', fontVariantNumeric: 'tabular-nums' }}>
              {formatToman(paidAmount)} <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>تومان</span>
            </div>
            <div style={{ width: '100%', height: '6px', background: '#d1fae5', borderRadius: '999px', marginTop: '0.55rem', overflow: 'hidden' }}>
              <div style={{ width: `${paidPercent}%`, height: '100%', background: '#10b981', borderRadius: '999px' }} />
            </div>
          </div>

          <div
            style={{
              background: remaining > 0 ? 'rgba(245, 158, 11, 0.07)' : 'rgba(16, 185, 129, 0.07)',
              border: `1px solid ${remaining > 0 ? 'rgba(245, 158, 11, 0.3)' : 'rgba(16, 185, 129, 0.3)'}`,
              borderRadius: '20px',
              padding: '1.25rem',
            }}
          >
            <div style={{ fontSize: '0.8rem', color: remaining > 0 ? '#d97706' : '#059669', fontWeight: 700 }}>
              مانده قابل پرداخت
            </div>
            <div style={{ fontSize: '1.4rem', fontWeight: 900, color: remaining > 0 ? '#b45309' : '#047857', marginTop: '0.35rem', fontVariantNumeric: 'tabular-nums' }}>
              {formatToman(remaining)} <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>تومان</span>
            </div>
            <div style={{ fontSize: '0.73rem', color: '#64748b', marginTop: '0.2rem' }}>
              معادل {formatRial(remaining)} ریال
            </div>
          </div>
        </div>
      )}

      {/* Official Shaparak Receipt Banner if recently paid */}
      {lastReceipt && (
        <div
          style={{
            background: 'linear-gradient(135deg, #ecfdf5, #f0fdf4)',
            border: '1px solid #86efac',
            borderRadius: '20px',
            padding: '1.25rem 1.5rem',
            marginBottom: '1.5rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '1rem',
          }}
        >
          <div>
            <div style={{ fontWeight: 900, color: '#065f46', fontSize: '0.98rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <HiOutlineSparkles className="w-5 h-5 text-emerald-600" />
              رسید رسمی تراکنش شاپرک با موفقیت صادر شد و پیامک خدماتی برای ولی ارسال گردید
            </div>
            <div style={{ fontSize: '0.82rem', color: '#047857', marginTop: '0.35rem', display: 'flex', gap: '1.2rem', flexWrap: 'wrap' }}>
              <span>شماره مرجع شاپرک: <strong dir="ltr">{lastReceipt.shaparak_ref_id}</strong></span>
              <span>کارت پرداخت‌کننده: <strong dir="ltr">{lastReceipt.masked_card_pan}</strong></span>
              <span>مبلغ تسویه‌شده: <strong>{formatToman(lastReceipt.amount_rial)} تومان ({formatRial(lastReceipt.amount_rial)} ریال)</strong></span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setLastReceipt(null)}
            style={{
              background: '#fff',
              border: '1px solid #86efac',
              color: '#065f46',
              borderRadius: '10px',
              padding: '0.4rem 0.85rem',
              fontSize: '0.78rem',
              fontWeight: 800,
              cursor: 'pointer',
            }}
          >
            بستن رسید
          </button>
        </div>
      )}

      {/* Installments Table */}
      <div
        style={{
          background: 'var(--bg-secondary, #fff)',
          border: '1px solid var(--border-color, #e2e8f0)',
          borderRadius: '22px',
          padding: '1.5rem',
          boxShadow: '0 4px 20px -4px rgba(15, 23, 42, 0.04)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
          <h3 style={{ margin: 0, fontWeight: 900, fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <HiOutlineDocumentCheck style={{ color: '#10b981', fontSize: '1.35rem' }} />
            جدول زمان‌بندی اقساط و وضعیت تسویه شاپرک
          </h3>
          <span style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 600 }}>
            تعداد کل اقساط: {installments.length.toLocaleString('fa-IR')} قسط
          </span>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '2.5rem', color: '#64748b', fontWeight: 700 }}>
            در حال فراخوانی اطلاعات دفتر کل مالی...
          </div>
        ) : installments.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2.5rem', color: '#64748b' }}>
            <p style={{ fontWeight: 700, marginBottom: '0.75rem' }}>هنوز دفتر کل شهریه برای این دانش‌آموز صادر نشده است.</p>
            {canVerify && (
              <button
                type="button"
                onClick={() => setShowCreateLedger(true)}
                style={{
                  background: '#10b981',
                  color: '#fff',
                  border: 'none',
                  padding: '0.65rem 1.25rem',
                  borderRadius: '12px',
                  fontWeight: 800,
                  cursor: 'pointer',
                }}
              >
                + صدور فوری دفتر کل شهریه برای این دانش‌آموز
              </button>
            )}
          </div>
        ) : (
          <div style={{ display: 'grid', gap: '0.9rem' }}>
            {installments.map((inst) => {
              const isPaid = inst.status === 'verified' || inst.status === 'paid';
              const isSubmitted = inst.status === 'submitted' || inst.status === 'under_review';
              const tracking = inst.tracking_number || inst.tracking_code;
              const bank = inst.bank_name || inst.payment_method;

              return (
                <div
                  key={inst.id}
                  style={{
                    border: '1px solid var(--border-color, #e2e8f0)',
                    borderRadius: '18px',
                    padding: '1.15rem 1.35rem',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '1rem',
                    background: isPaid ? 'rgba(16, 185, 129, 0.03)' : 'var(--bg-primary, #f8fafc)',
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                      <span
                        style={{
                          background: '#0f172a',
                          color: '#fff',
                          padding: '0.2rem 0.65rem',
                          borderRadius: '8px',
                          fontSize: '0.75rem',
                          fontWeight: 800,
                        }}
                      >
                        قسط {inst.installment_number?.toLocaleString('fa-IR')}
                      </span>
                      <span style={{ fontWeight: 900, fontSize: '0.98rem', color: 'var(--text-primary, #0f172a)' }}>
                        {inst.title || `قسط شماره ${inst.installment_number?.toLocaleString('fa-IR')} شهریه سال تحصیلی`}
                      </span>
                      <span
                        style={{
                          padding: '0.22rem 0.7rem',
                          borderRadius: '999px',
                          fontSize: '0.74rem',
                          fontWeight: 800,
                          background: isPaid
                            ? 'rgba(16, 185, 129, 0.15)'
                            : isSubmitted
                            ? 'rgba(59, 130, 246, 0.15)'
                            : 'rgba(245, 158, 11, 0.15)',
                          color: isPaid ? '#059669' : isSubmitted ? '#2563eb' : '#d97706',
                        }}
                      >
                        {isPaid
                          ? '✓ تسویه و تایید شده'
                          : isSubmitted
                          ? '⏳ فیش ثبت شد (در انتظار تایید امور مالی)'
                          : 'سررسید / در انتظار پرداخت'}
                      </span>
                    </div>

                    <div style={{ display: 'flex', gap: '1.25rem', marginTop: '0.55rem', fontSize: '0.82rem', color: '#64748b', flexWrap: 'wrap' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                        <HiOutlineClock /> سررسید: {inst.due_date}
                      </span>
                      {tracking && <span>کد پیگیری: <strong dir="ltr">{tracking}</strong></span>}
                      {bank && <span>بانک / درگاه: {bank}</span>}
                      {inst.paid_at && <span>تاریخ پرداخت: {inst.paid_at}</span>}
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                    <div style={{ textAlign: 'left', fontVariantNumeric: 'tabular-nums', marginLeft: '0.4rem' }}>
                      <div style={{ fontSize: '1.15rem', fontWeight: 900, color: 'var(--text-primary, #0f172a)' }}>
                        {formatToman(inst.amount)} تومان
                      </div>
                      <div style={{ fontSize: '0.72rem', color: '#64748b' }}>
                        ({formatRial(inst.amount)} ریال)
                      </div>
                    </div>

                    {!isPaid && (
                      <>
                        <button
                          type="button"
                          onClick={() => handleInitiateShaparak(inst)}
                          disabled={shaparakProcessing}
                          style={{
                            background: 'linear-gradient(135deg, #10b981, #059669)',
                            color: '#fff',
                            border: 'none',
                            padding: '0.6rem 1.05rem',
                            borderRadius: '12px',
                            fontWeight: 800,
                            fontSize: '0.82rem',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.4rem',
                            boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)',
                          }}
                        >
                          <HiOutlineCreditCard style={{ fontSize: '1.05rem' }} />
                          پرداخت آنلاین شاپرک
                        </button>

                        {inst.status === 'pending' && (
                          <button
                            type="button"
                            onClick={() => setPayingItem(inst)}
                            style={{
                              background: '#f1f5f9',
                              color: '#334155',
                              border: '1px solid #cbd5e1',
                              padding: '0.6rem 0.95rem',
                              borderRadius: '12px',
                              fontWeight: 700,
                              fontSize: '0.8rem',
                              cursor: 'pointer',
                            }}
                          >
                            ثبت فیش بانکی
                          </button>
                        )}
                      </>
                    )}

                    {canVerify && !isPaid && (
                      <button
                        type="button"
                        onClick={() => handleVerify(inst.id)}
                        style={{
                          background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
                          color: '#fff',
                          border: 'none',
                          padding: '0.6rem 1rem',
                          borderRadius: '12px',
                          fontWeight: 800,
                          fontSize: '0.8rem',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.35rem',
                        }}
                      >
                        <HiOutlineCheckCircle style={{ fontSize: '1.05rem' }} />
                        تایید نهایی امور مالی
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Shaparak Online Payment Gateway Modal */}
      {shaparakSession && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '1rem',
          }}
        >
          <div
            style={{
              background: '#fff',
              borderRadius: '24px',
              padding: '1.85rem',
              width: '100%',
              maxWidth: '480px',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
              <span style={{ background: '#dcfce7', color: '#166534', fontSize: '0.75rem', fontWeight: 800, padding: '0.25rem 0.75rem', borderRadius: '999px' }}>
                {shaparakSession.gateway_title || 'درگاه امن شاپرک'}
              </span>
              <span style={{ fontFamily: 'monospace', fontSize: '0.78rem', color: '#64748b' }}>
                Terminal: {shaparakSession.terminal_id}
              </span>
            </div>

            <h3 style={{ marginTop: 0, marginBottom: '0.5rem', fontWeight: 900, fontSize: '1.2rem', color: '#0f172a' }}>
              پرداخت برخط قسط شماره {shaparakSession.installment_number?.toLocaleString('fa-IR')}
            </h3>

            <div
              style={{
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: '16px',
                padding: '1rem',
                marginBottom: '1.25rem',
                fontSize: '0.85rem',
                display: 'grid',
                gap: '0.45rem',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748b' }}>مبلغ قابل پرداخت:</span>
                <strong style={{ color: '#059669' }}>{formatRial(shaparakSession.amount_toman * 10)} ریال ({shaparakSession.amount_toman?.toLocaleString('fa-IR')} تومان)</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748b' }}>شناسه مرجع شاپرک:</span>
                <strong dir="ltr" style={{ fontFamily: 'monospace' }}>{shaparakSession.authority}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748b' }}>حساب شبا خزانه مدرسه:</span>
                <strong>{shaparakSession.treasury_bank_name}</strong>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.6rem' }}>
              <button
                type="button"
                onClick={() => setShaparakSession(null)}
                style={{
                  padding: '0.7rem 1.2rem',
                  borderRadius: '12px',
                  border: '1px solid #cbd5e1',
                  background: '#fff',
                  color: '#334155',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                انصراف
              </button>
              <button
                type="button"
                disabled={shaparakProcessing}
                onClick={handleConfirmShaparakPayment}
                style={{
                  padding: '0.7rem 1.4rem',
                  borderRadius: '12px',
                  border: 'none',
                  background: 'linear-gradient(135deg, #10b981, #059669)',
                  color: '#fff',
                  fontWeight: 900,
                  cursor: 'pointer',
                }}
              >
                {shaparakProcessing ? 'در حال تایید شاپرک...' : 'تکمیل پرداخت و دریافت رسید شاپرک'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manual Receipt Modal */}
      {payingItem && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.65)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '1rem',
          }}
        >
          <form
            onSubmit={handlePaySubmit}
            style={{
              background: 'var(--bg-secondary, #fff)',
              borderRadius: '22px',
              padding: '1.75rem',
              width: '100%',
              maxWidth: '460px',
            }}
          >
            <h3 style={{ marginTop: 0, fontWeight: 900 }}>ثبت مشخصات فیش بانکی قسط {payingItem.installment_number?.toLocaleString('fa-IR')}</h3>
            <p style={{ fontSize: '0.88rem', color: '#64748b' }}>
              مبلغ قسط: <strong>{formatToman(payingItem.amount)} تومان ({formatRial(payingItem.amount)} ریال)</strong>
            </p>

            <div style={{ display: 'grid', gap: '0.85rem', marginTop: '1rem' }}>
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 700 }}>نام بانک / روش پرداخت</label>
                <select
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                  style={{ width: '100%', padding: '0.7rem', borderRadius: '12px', border: '1px solid #cbd5e1', marginTop: '0.25rem' }}
                >
                  <option value="بانک ملت / کارت به کارت">بانک ملت / کارت به کارت</option>
                  <option value="بانک ملی ایران / پایا شبا">بانک ملی ایران / پایا شبا</option>
                  <option value="بانک سامان / فیش واریزی">بانک سامان / فیش واریزی</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 700 }}>شماره پیگیری بانکی (حداقل ۵ کاراکتر)</label>
                <input
                  required
                  minLength={5}
                  value={trackingNumber}
                  onChange={(e) => setTrackingNumber(e.target.value)}
                  placeholder="مثلاً TRK-98451200"
                  style={{ width: '100%', padding: '0.7rem', borderRadius: '12px', border: '1px solid #cbd5e1', marginTop: '0.25rem' }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.6rem', marginTop: '1.5rem' }}>
              <button
                type="button"
                onClick={() => setPayingItem(null)}
                style={{ padding: '0.65rem 1.2rem', borderRadius: '12px', border: '1px solid #cbd5e1', background: 'transparent', cursor: 'pointer' }}
              >
                انصراف
              </button>
              <button
                type="submit"
                disabled={submitting}
                style={{ padding: '0.65rem 1.4rem', borderRadius: '12px', border: 'none', background: '#10b981', color: '#fff', fontWeight: 800, cursor: 'pointer' }}
              >
                {submitting ? 'در حال ثبت...' : 'ثبت فیش پرداخت'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Create Ledger Modal for Admin / Financial Officer */}
      {showCreateLedger && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.65)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '1rem',
          }}
        >
          <form
            onSubmit={handleCreateLedger}
            style={{
              background: '#fff',
              borderRadius: '22px',
              padding: '1.75rem',
              width: '100%',
              maxWidth: '480px',
            }}
          >
            <h3 style={{ marginTop: 0, fontWeight: 900 }}>صدور دفتر کل شهریه و تقسیط خودکار</h3>
            <div style={{ display: 'grid', gap: '0.85rem', marginTop: '1rem' }}>
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 700 }}>سال تحصیلی</label>
                <input
                  type="text"
                  required
                  value={newLedgerForm.academic_year}
                  onChange={(e) => setNewLedgerForm({ ...newLedgerForm, academic_year: e.target.value })}
                  style={{ width: '100%', padding: '0.65rem', borderRadius: '10px', border: '1px solid #cbd5e1', marginTop: '0.25rem' }}
                />
              </div>
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 700 }}>شهریه مصوب کل (به ریال)</label>
                <input
                  type="number"
                  required
                  value={newLedgerForm.total_amount}
                  onChange={(e) => setNewLedgerForm({ ...newLedgerForm, total_amount: e.target.value })}
                  style={{ width: '100%', padding: '0.65rem', borderRadius: '10px', border: '1px solid #cbd5e1', marginTop: '0.25rem' }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.6rem', marginTop: '1.5rem' }}>
              <button
                type="button"
                onClick={() => setShowCreateLedger(false)}
                style={{ padding: '0.65rem 1.2rem', borderRadius: '12px', border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer' }}
              >
                انصراف
              </button>
              <button
                type="submit"
                disabled={submitting}
                style={{ padding: '0.65rem 1.4rem', borderRadius: '12px', border: 'none', background: '#10b981', color: '#fff', fontWeight: 800, cursor: 'pointer' }}
              >
                {submitting ? 'در حال صدور...' : 'صدور دفتر کل و اقساط'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
