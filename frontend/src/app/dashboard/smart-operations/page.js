'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import {
  HiOutlineCpuChip,
  HiOutlineDocumentMagnifyingGlass,
  HiOutlineBanknotes,
  HiOutlineChatBubbleBottomCenterText,
  HiOutlineSparkles,
  HiOutlineCheckBadge,
  HiOutlineArrowTopRightOnSquare,
} from 'react-icons/hi2';
import api from '../../../lib/api';

const SAMPLE_SIDA_CSV = `کد ملی,نام و نام خانوادگی,نام پدر,پایه,کلاس,رشته,تلفن ولی
۰۰۲۴۵۶۷۸۹۳,امیرحسین رضایی,محمد,پایه دهم,دهم ریاضی الف,ریاضی فیزیک,۰۹۱۲۳۴۵۶۷۸۹
۰۰۱۲۳۴۵۶۷۹,سارا محمدی,علی,پایه دهم,دهم ریاضی الف,ریاضی فیزیک,۰۹۱۲۹۸۷۶۵۴۳
۰۴۹۱۲۳۴۵۶۷,کیانوش کریمی,حسن,پایه یازدهم,یازدهم تجربی ب,علوم تجربی,۰۹۳۵۱۱۱۲۲۳۳`;

const SAMPLE_PAPER_GRADESHEET = `امیرحسین رضایی | ۰۰۲۴۵۶۷۸۹۳ | ۱۹.۵ | تسلط عالی بر مباحث
سارا محمدی | ۰۰۱۲۳۴۵۶۷۹ | ۱۸.۲۵ | پاسخگویی کامل به سوالات تشریحی
کیانوش کریمی | ۰۴۹۱۲۳۴۵۶۷ | ۱۴.۷۵ | نیاز به تمرین بیشتر در بخش حد و پیوستگی`;

const SAMPLE_PAPER_ROSTER = `امیرحسین رضایی | ۰۰۲۴۵۶۷۸۹۳ | محمد | پایه دهم | دهم ریاضی الف | ۰۹۱۲۳۴۵۶۷۸۹
سارا محمدی | ۰۰۱۲۳۴۵۶۷۹ | علی | پایه دهم | دهم ریاضی الف | ۰۹۱۲۹۸۷۶۵۴۳`;

const SAMPLE_PAPER_EXAM = `۱. کدام گزینه در مورد مشتق‌پذیری تابع در نقطه گوشه صحیح است؟
الف) مشتق چپ و راست برابرند
ب) تابع پیوسته است اما مشتق‌پذیر نیست
ج) تابع ناپیوسته است
د) مشتق برابر بی‌نهایت است
پاسخ: ۲
۲. حاصل حد تابع sin(5x)/x در همسایگی صفر کدام است؟
الف) ۱
ب) ۰
ج) ۵
د) تعریف نشده
پاسخ: ۳`;

export default function SmartOperationsPage() {
  const [activeTab, setActiveTab] = useState('sida');
  const [classes, setClasses] = useState([]);
  const [selectedClassId, setSelectedClassId] = useState('');

  // Tab 1: Sida & Legacy Migration State
  const [sourceSystem, setSourceSystem] = useState('sida');
  const [sidaRawText, setSidaRawText] = useState(SAMPLE_SIDA_CSV);
  const [sidaPreview, setSidaPreview] = useState(null);
  const [sidaImporting, setSidaImporting] = useState(false);
  const [sidaExportData, setSidaExportData] = useState(null);

  // Tab 2: Paper-to-Digital State
  const [paperMode, setPaperMode] = useState('gradesheet');
  const [paperText, setPaperText] = useState(SAMPLE_PAPER_GRADESHEET);
  const [paperImageBase64, setPaperImageBase64] = useState('');
  const [paperExtraction, setPaperExtraction] = useState(null);
  const [paperExtracting, setPaperExtracting] = useState(false);
  const [paperCommitting, setPaperCommitting] = useState(false);

  // Tab 3: Shaparak & Iranian Banking State
  const [shebaInput, setShebaInput] = useState('IR062960000000100324200001');
  const [shebaResult, setShebaResult] = useState(null);
  const [studentsList, setStudentsList] = useState([]);
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [ledgerData, setLedgerData] = useState(null);
  const [activePaymentSession, setActivePaymentSession] = useState(null);
  const [lastReceipt, setLastReceipt] = useState(null);

  // Tab 4: Service SMS State
  const [smsLogs, setSmsLogs] = useState([]);
  const [smsProviderInfo, setSmsProviderInfo] = useState({ provider: 'kavenegar_service_line', sender_line: '3000770099' });
  const [manualPhone, setManualPhone] = useState('۰۹۱۲۳۴۵۶۷۸۹');
  const [manualMessage, setManualMessage] = useState('ولی گرامی، جلسه هم‌اندیشی اولیا و مربیان روز چهارشنبه ساعت ۱۶ برگزار می‌گردد.');

  const loadInitialData = useCallback(async () => {
    try {
      const [clsRes, memRes, smsRes] = await Promise.all([
        api.get('/classes').catch(() => ({ data: { data: [] } })),
        api.get('/school/members').catch(() => ({ data: { data: { students: [] } } })),
        api.get('/school/sms/logs').catch(() => ({ data: { data: { logs: [] } } })),
      ]);

      const clsList = Array.isArray(clsRes.data?.data) ? clsRes.data.data : (clsRes.data?.data?.classes || []);
      setClasses(clsList);
      if (clsList.length > 0) {
        setSelectedClassId((prev) => prev || clsList[0].id);
      }

      const sts = memRes.data?.data?.students || [];
      setStudentsList(sts);
      if (sts.length > 0) {
        setSelectedStudentId((prev) => prev || sts[0].id);
      }

      if (smsRes.data?.data) {
        setSmsLogs(smsRes.data.data.logs || []);
        setSmsProviderInfo({
          provider: smsRes.data.data.provider || 'kavenegar_service_line',
          sender_line: smsRes.data.data.sender_line || '3000770099',
        });
      }
    } catch (_e) {}
  }, []);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  // ── Tab 1 Handlers: Sida Preview, Import & Export ──
  const handleSidaPreview = async () => {
    try {
      const res = await api.post('/school/sida/preview', {
        raw_text: sidaRawText,
        source_system: sourceSystem,
      });
      setSidaPreview(res.data.data);
      toast.success(res.data.message || 'پیش‌نمایش و نگاشت ستون‌ها انجام شد');
    } catch (err) {
      toast.error(err.response?.data?.message || 'خطا در تحلیل داده‌های ورودی');
    }
  };

  const handleSidaAtomicImport = async () => {
    setSidaImporting(true);
    try {
      const res = await api.post('/school/sida/import', {
        raw_text: sidaRawText,
        source_system: sourceSystem,
        auto_create_classes: true,
        auto_link_parents: true,
      });
      toast.success(res.data.message);
      setSidaPreview(null);
      await loadInitialData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'خطا در درون‌ریزی اتمیک');
    } finally {
      setSidaImporting(false);
    }
  };

  const handleExportSidaGrades = async () => {
    if (!selectedClassId) {
      toast.error('ابتدا یک کلاس را برای خروجی سیدا انتخاب کنید');
      return;
    }
    try {
      const res = await api.get(`/school/sida/export-grades?class_id=${selectedClassId}`);
      setSidaExportData(res.data.data);
      toast.success('جدول رسمی نمرات با ساختار سیدا تولید شد');
    } catch (err) {
      toast.error(err.response?.data?.message || 'خطا در دریافت خروجی سیدا');
    }
  };

  const handleDownloadSidaCsv = () => {
    if (!sidaExportData?.csv_content) return;
    const blob = new Blob([sidaExportData.csv_content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sida-grades-${sidaExportData.class_info?.name || 'class'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── Tab 2 Handlers: Paper-to-Digital AI + Human-in-the-Loop ──
  const handlePaperModeChange = (newMode) => {
    setPaperMode(newMode);
    setPaperExtraction(null);
    if (newMode === 'gradesheet') setPaperText(SAMPLE_PAPER_GRADESHEET);
    else if (newMode === 'roster') setPaperText(SAMPLE_PAPER_ROSTER);
    else setPaperText(SAMPLE_PAPER_EXAM);
  };

  const handleImageUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setPaperImageBase64(String(reader.result || ''));
      toast.success(`تصویر سند کاغذی «${file.name}» بارگذاری شد`);
    };
    reader.readAsDataURL(file);
  };

  const handleExtractPaper = async () => {
    setPaperExtracting(true);
    try {
      const res = await api.post('/ai/paper-to-digital', {
        mode: paperMode,
        raw_ocr_text: paperText,
        image_base64: paperImageBase64 || undefined,
      });
      setPaperExtraction(res.data.data);
      toast.success(res.data.message);
    } catch (err) {
      toast.error(err.response?.data?.message || 'خطا در استخراج سند کاغذی');
    } finally {
      setPaperExtracting(false);
    }
  };

  const handleUpdateExtractedItem = (idx, field, value) => {
    if (!paperExtraction) return;
    const updated = [...paperExtraction.items];
    updated[idx] = {
      ...updated[idx],
      [field]: value,
      needs_review: false,
      review_reason: 'بازبینی و تایید شده توسط کاربر',
    };
    setPaperExtraction({
      ...paperExtraction,
      items: updated,
    });
  };

  const handleCommitPaperData = async () => {
    if (!paperExtraction?.items?.length) return;
    if ((paperMode === 'gradesheet' || paperMode === 'exam') && !selectedClassId) {
      toast.error('لطفاً کلاس مقصد را برای ثبت انتخاب کنید');
      return;
    }
    setPaperCommitting(true);
    try {
      const res = await api.post('/ai/paper-to-digital/commit', {
        mode: paperMode,
        items: paperExtraction.items,
        class_id: selectedClassId || undefined,
        category_title: 'ارزشیابی مستمر (برگه اسکن‌شده)',
        quiz_title: 'آزمون دیجیتال تبدیل‌شده از برگه کاغذی',
      });
      toast.success(res.data.message);
      await loadInitialData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'خطا در ثبت نهایی اطلاعات');
    } finally {
      setPaperCommitting(false);
    }
  };

  // ── Tab 3 Handlers: Iranian Banking, Sheba & Shaparak IPG ──
  const handleValidateSheba = async () => {
    try {
      const res = await api.post('/finance/validate-sheba', { sheba: shebaInput });
      setShebaResult(res.data.data);
      if (res.data.data?.valid) {
        toast.success(`شماره شبا معتبر است: ${res.data.data.bank_name}`);
      } else {
        toast.error(res.data.data?.reason || 'شماره شبا نامعتبر است');
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'خطا در اعتبارسنجی شبا');
    }
  };

  const handleLoadOrCreateLedger = async () => {
    if (!selectedStudentId) {
      toast.error('ابتدا یک دانش‌آموز انتخاب کنید');
      return;
    }
    try {
      const createRes = await api.post('/finance/create-ledger', {
        student_id: selectedStudentId,
        total_amount: 450000000,
      });
      setLedgerData(createRes.data.data);
      toast.success('دفتر کل شهریه و اقساط دانش‌آموز بارگذاری شد');
    } catch (_err) {
      try {
        const getRes = await api.get(`/finance/ledger?student_id=${selectedStudentId}`);
        setLedgerData(getRes.data.data);
      } catch (e2) {
        toast.error(e2.response?.data?.message || 'خطا در دریافت اطلاعات مالی');
      }
    }
  };

  const handleInitiateShaparak = async (installmentId) => {
    try {
      const res = await api.post(`/finance/initiate-payment/${installmentId}`, {
        gateway: 'behpardakht_mellat',
        school_sheba: shebaInput,
      });
      setActivePaymentSession(res.data.data);
      toast.success('نشست پرداخت شاپرک ایجاد شد');
    } catch (err) {
      toast.error(err.response?.data?.message || 'خطا در اتصال به شاپرک');
    }
  };

  const handleCompleteShaparakCallback = async () => {
    if (!activePaymentSession) return;
    try {
      const res = await api.post(`/finance/callback-verify/${activePaymentSession.installment_id}`, {
        authority: activePaymentSession.authority,
        card_pan: '6037-9975-8412-3391',
        status: 'OK',
      });
      setLastReceipt(res.data.data.receipt);
      setActivePaymentSession(null);
      toast.success(res.data.message);
      await handleLoadOrCreateLedger();
      await loadInitialData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'خطا در تایید تراکنش شاپرک');
    }
  };

  // ── Tab 4 Handlers: Pattern SMS ──
  const handleSendManualPatternSms = async () => {
    try {
      const res = await api.post('/school/sms/send-pattern', {
        receptor: manualPhone,
        template: 'educonnect-school-notice',
        message_preview: manualMessage,
      });
      toast.success(res.data.message);
      const smsRes = await api.get('/school/sms/logs');
      setSmsLogs(smsRes.data?.data?.logs || []);
    } catch (err) {
      toast.error(err.response?.data?.message || 'خطا در ارسال پیامک خدماتی');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50/70 text-slate-900 p-4 md:p-6" dir="rtl">
      {/* Top Modern Gradient Workspace Header */}
      <div
        className="rounded-3xl p-6 md:p-7 mb-6 text-white shadow-xl relative overflow-hidden"
        style={{
          background: 'linear-gradient(135deg, #1e1b4b 0%, #0f172a 55%, #064e3b 100%)',
        }}
      >
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5 relative z-10">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/20 border border-indigo-400/30 text-indigo-200 text-xs font-bold mb-2.5">
              <HiOutlineSparkles className="w-4 h-4 text-indigo-300" />
              <span>ستاد هوشمند عملیات مدرسه • زیرساخت بومی آموزش و پرورش ایران</span>
            </div>
            <h1 className="text-xl md:text-2xl font-black text-white flex items-center gap-2.5">
              <HiOutlineCpuChip className="w-8 h-8 text-emerald-400 shrink-0" />
              <span>مرکز یکپارچه سیدا، تبدیل اسناد کاغذی به دیجیتال (AI)، شاپرک و پیامک خدماتی</span>
            </h1>
            <p className="text-sm text-slate-300 mt-1.5 max-w-3xl leading-relaxed">
              تبدیل خودکار ارقام فارسی/عربی، اعتبارسنجی ریاضی کد ملی و شماره شبا (ISO-7064)، اسکن هوشمند برگه‌های دست‌نویس با تایید انسانی و مهاجرت اتمیک داده از سیدا.
            </p>

            {/* Quick KPI & Cross-Module Links */}
            <div className="flex flex-wrap items-center gap-2.5 mt-4">
              <span className="px-3 py-1 rounded-xl bg-white/10 border border-white/15 text-xs font-bold text-slate-200">
                کلاس‌های فعال: {classes.length.toLocaleString('fa-IR')}
              </span>
              <span className="px-3 py-1 rounded-xl bg-white/10 border border-white/15 text-xs font-bold text-slate-200">
                دانش‌آموزان: {studentsList.length.toLocaleString('fa-IR')} نفر
              </span>
              <Link
                href="/dashboard/report-card"
                className="inline-flex items-center gap-1 px-3 py-1 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/30 text-xs font-bold text-emerald-200 transition"
              >
                <span>کارنامه رسمی ۲۰ نمره‌ای</span>
                <HiOutlineArrowTopRightOnSquare className="w-3.5 h-3.5" />
              </Link>
              <Link
                href="/dashboard/finance"
                className="inline-flex items-center gap-1 px-3 py-1 rounded-xl bg-sky-500/20 hover:bg-sky-500/30 border border-sky-400/30 text-xs font-bold text-sky-200 transition"
              >
                <span>پورتال جامع شهریه و شاپرک</span>
                <HiOutlineArrowTopRightOnSquare className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>

          {/* Class Selector Context */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-3.5 shrink-0">
            <label className="text-xs font-extrabold text-indigo-200 whitespace-nowrap">کلاس هدف عملیات:</label>
            <select
              value={selectedClassId}
              onChange={(e) => setSelectedClassId(e.target.value)}
              className="border border-white/20 rounded-xl px-3.5 py-2 text-sm font-bold bg-slate-900/90 text-white focus:outline-none focus:ring-2 focus:ring-emerald-400 min-w-[210px]"
            >
              <option value="">انتخاب کلاس...</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.grade_level || c.grade || c.subject || 'عمومی'})
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <button
          type="button"
          onClick={() => setActiveTab('sida')}
          className={`p-4 rounded-2xl border text-right transition-all shadow-xs ${
            activeTab === 'sida'
              ? 'bg-gradient-to-br from-slate-900 to-indigo-950 text-white border-indigo-700 shadow-md scale-[1.01]'
              : 'bg-white text-slate-700 border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/30'
          }`}
        >
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-sm font-extrabold flex items-center gap-1.5">
              <HiOutlineCheckBadge className={`w-5 h-5 ${activeTab === 'sida' ? 'text-emerald-400' : 'text-indigo-600'}`} />
              ۱. همگام‌سازی سیدا و مهاجرت
            </span>
          </div>
          <div className={`text-xs ${activeTab === 'sida' ? 'text-slate-300' : 'text-slate-500'}`}>
            ورود اتمیک از سیدا/اکسل + خروجی رسمی نمرات ۲۰ نمره‌ای
          </div>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('paper')}
          className={`p-4 rounded-2xl border text-right transition-all shadow-xs ${
            activeTab === 'paper'
              ? 'bg-gradient-to-br from-slate-900 to-indigo-950 text-white border-indigo-700 shadow-md scale-[1.01]'
              : 'bg-white text-slate-700 border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/30'
          }`}
        >
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-sm font-extrabold flex items-center gap-1.5">
              <HiOutlineDocumentMagnifyingGlass className={`w-5 h-5 ${activeTab === 'paper' ? 'text-amber-400' : 'text-amber-600'}`} />
              ۲. تبدیل اسناد کاغذی (AI OCR)
            </span>
          </div>
          <div className={`text-xs ${activeTab === 'paper' ? 'text-slate-300' : 'text-slate-500'}`}>
            اسکن لیست نمرات، حضور و غیاب و برگه امتحانی با تایید معلم
          </div>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('shaparak')}
          className={`p-4 rounded-2xl border text-right transition-all shadow-xs ${
            activeTab === 'shaparak'
              ? 'bg-gradient-to-br from-slate-900 to-indigo-950 text-white border-indigo-700 shadow-md scale-[1.01]'
              : 'bg-white text-slate-700 border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/30'
          }`}
        >
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-sm font-extrabold flex items-center gap-1.5">
              <HiOutlineBanknotes className={`w-5 h-5 ${activeTab === 'shaparak' ? 'text-emerald-400' : 'text-emerald-600'}`} />
              ۳. درگاه بانکی شاپرک و شبا
            </span>
          </div>
          <div className={`text-xs ${activeTab === 'shaparak' ? 'text-slate-300' : 'text-slate-500'}`}>
            تسویه آنی شهریه، اعتبارسنجی شبا و صدور رسید رسمی
          </div>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('sms')}
          className={`p-4 rounded-2xl border text-right transition-all shadow-xs ${
            activeTab === 'sms'
              ? 'bg-gradient-to-br from-slate-900 to-indigo-950 text-white border-indigo-700 shadow-md scale-[1.01]'
              : 'bg-white text-slate-700 border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/30'
          }`}
        >
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-sm font-extrabold flex items-center gap-1.5">
              <HiOutlineChatBubbleBottomCenterText className={`w-5 h-5 ${activeTab === 'sms' ? 'text-sky-400' : 'text-sky-600'}`} />
              ۴. پیامک خدماتی و نرمال‌ساز
            </span>
          </div>
          <div className={`text-xs ${activeTab === 'sms' ? 'text-slate-300' : 'text-slate-500'}`}>
            خط خدماتی پترن (غیبت و مالی) + یکسان‌ساز کیبورد فارسی
          </div>
        </button>
      </div>

      {/* TAB 1: SIDA & LEGACY DATA MIGRATION */}
      {activeTab === 'sida' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-5">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-4 mb-4 border-b border-slate-200">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  درون‌ریزی هوشمند و مهاجرت داده از سیدا / همکلاسی / اکسل
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  تشخیص خودکار ستون‌ها، بررسی صحت کد ملی ۱۰ رقمی (Modulo-11) و ساخت خودکار کلاس‌ها و حساب اولیا
                </p>
              </div>
              <select
                value={sourceSystem}
                onChange={(e) => setSourceSystem(e.target.value)}
                className="border border-slate-300 rounded-lg px-3 py-1.5 text-xs font-medium bg-slate-50"
              >
                <option value="sida">خروجی سامانه سیدا (SIDA)</option>
                <option value="hamkelasi">نرم‌افزار همکلاسی</option>
                <option value="dayamooz">نرم‌افزار دی‌آموز</option>
                <option value="excel">فایل اکسل / CSV خام</option>
              </select>
            </div>

            <label className="block text-xs font-semibold text-slate-700 mb-2">
              متن CSV / TSV یا کپی مستقیم جدول اکسل سیدا (پشتیبانی کامل از ارقام فارسی ۰-۹):
            </label>
            <textarea
              rows={6}
              value={sidaRawText}
              onChange={(e) => setSidaRawText(e.target.value)}
              className="w-full border border-slate-300 rounded-lg p-3 text-xs font-mono bg-slate-50 text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />

            <div className="flex flex-wrap items-center gap-3 mt-4">
              <button
                type="button"
                onClick={handleSidaPreview}
                className="px-4 py-2 rounded-lg bg-slate-800 text-white text-xs font-semibold hover:bg-slate-700 transition-colors"
              >
                ۱. تحلیل هوشمند و پیش‌نمایش ستون‌ها
              </button>
              <button
                type="button"
                onClick={handleSidaAtomicImport}
                disabled={sidaImporting}
                className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 transition-colors disabled:opacity-50"
              >
                {sidaImporting ? 'در حال ثبت اتمیک...' : '۲. درون‌ریزی اتمیک با یک کلیک (کلاس + دانش‌آموز + ولی)'}
              </button>
            </div>

            {sidaPreview && (
              <div className="mt-5 pt-4 border-t border-slate-200">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                  <span className="text-xs font-bold text-slate-800">
                    نتیجه تحلیل: {sidaPreview.total_rows} ردیف ({sidaPreview.valid_count} معتبر، {sidaPreview.warning_count} هشدار)
                  </span>
                  <span className="text-xs text-blue-700 font-medium">
                    کلاس‌های شناسایی‌شده: {sidaPreview.auto_detected_classes?.join('، ')}
                  </span>
                </div>

                <div className="overflow-x-auto border border-slate-200 rounded-lg">
                  <table className="w-full text-right text-xs">
                    <thead className="bg-slate-100 text-slate-700 border-b border-slate-200">
                      <tr>
                        <th className="py-2 px-3">#</th>
                        <th className="py-2 px-3">نام و نام خانوادگی</th>
                        <th className="py-2 px-3">کد ملی (استاندارد)</th>
                        <th className="py-2 px-3">کلاس</th>
                        <th className="py-2 px-3">موبایل ولی</th>
                        <th className="py-2 px-3">وضعیت</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {sidaPreview.rows?.map((r) => (
                        <tr key={r.row_number} className="hover:bg-slate-50">
                          <td className="py-2 px-3 font-mono tabular-nums">{r.row_number}</td>
                          <td className="py-2 px-3 font-medium">{r.full_name}</td>
                          <td className="py-2 px-3 font-mono tabular-nums">
                            {r.national_code}{' '}
                            {r.national_code_valid ? (
                              <span className="text-emerald-700 font-semibold">(معتبر)</span>
                            ) : (
                              <span className="text-amber-700 font-semibold">(هشدار رقم کنترل)</span>
                            )}
                          </td>
                          <td className="py-2 px-3">{r.class_name}</td>
                          <td className="py-2 px-3 font-mono tabular-nums">{r.parent_phone || '—'}</td>
                          <td className="py-2 px-3">
                            {r.status === 'ready' ? (
                              <span className="text-emerald-700 font-semibold">آماده ثبت</span>
                            ) : (
                              <span className="text-amber-700 font-semibold">{r.warnings?.join('، ')}</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* Sida Gradebook Export Panel */}
          <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5">
            <div className="pb-4 mb-4 border-b border-slate-200">
              <h2 className="text-base font-bold text-slate-900">
                خروجی استاندارد کارنامه و نمرات برای بارگذاری در سیدا
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                تولید فایل CSV (UTF-8 با BOM فارسی) شامل کد ملی، نمره مستمر و نمره پایانی مطابق قالب سیدا آموزش و پرورش
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 mb-4">
              <button
                type="button"
                onClick={handleExportSidaGrades}
                className="px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 transition-colors"
              >
                تولید جدول خروجی سیدا برای کلاس انتخابی
              </button>
              {sidaExportData && (
                <button
                  type="button"
                  onClick={handleDownloadSidaCsv}
                  className="px-4 py-2 rounded-lg border border-slate-300 bg-white text-slate-800 text-xs font-semibold hover:bg-slate-100 transition-colors"
                >
                  دانلود فایل CSV رسمی سیدا
                </button>
              )}
            </div>

            {sidaExportData ? (
              <div className="overflow-x-auto border border-slate-200 rounded-lg">
                <table className="w-full text-right text-xs">
                  <thead className="bg-slate-100 text-slate-700 border-b border-slate-200">
                    <tr>
                      <th className="py-2 px-2.5">کد ملی / سیدا</th>
                      <th className="py-2 px-2.5">نام دانش‌آموز</th>
                      <th className="py-2 px-2.5">مستمر</th>
                      <th className="py-2 px-2.5">پایانی</th>
                      <th className="py-2 px-2.5">وضعیت</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {sidaExportData.rows?.map((row) => (
                      <tr key={row.row_number} className="hover:bg-slate-50">
                        <td className="py-2 px-2.5 font-mono tabular-nums">{row.national_code}</td>
                        <td className="py-2 px-2.5 font-medium">{row.full_name}</td>
                        <td className="py-2 px-2.5 font-mono tabular-nums">{row.continuous_score !== '' ? row.continuous_score : '—'}</td>
                        <td className="py-2 px-2.5 font-mono tabular-nums">{row.final_score !== '' ? row.final_score : '—'}</td>
                        <td className="py-2 px-2.5 font-semibold text-slate-700">{row.pass_status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-6 text-center border border-dashed border-slate-300 rounded-lg text-xs text-slate-500">
                کلاس مورد نظر را از نوار بالا انتخاب کرده و دکمه «تولید جدول خروجی سیدا» را بزنید تا لیست نمرات مستمر و پایانی آماده بارگذاری در سامانه سیدا شود.
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: PAPER-TO-DIGITAL AI & HONEST FEASIBILITY ASSESSMENT */}
      {activeTab === 'paper' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5">
            <h2 className="text-base font-bold text-slate-900 mb-1">
              استودیو تبدیل اسناد کاغذی به دیجیتال (Paper-to-Digital AI)
            </h2>
            <p className="text-xs text-slate-500 mb-4">
              پشتیبانی دوگانه از مدل چندوجهی ابری (Gemini 3.8 Flash) و موتور تحلیلگر ساختاریافته آفلاین ویژه شبکه ملی اطلاعات
            </p>

            <div className="grid grid-cols-3 gap-2 mb-4">
              <button
                type="button"
                onClick={() => handlePaperModeChange('gradesheet')}
                className={`py-2 px-2 rounded-lg border text-xs font-semibold ${
                  paperMode === 'gradesheet'
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-slate-50 text-slate-700 border-slate-200'
                }`}
              >
                لیست نمرات کاغذی
              </button>
              <button
                type="button"
                onClick={() => handlePaperModeChange('roster')}
                className={`py-2 px-2 rounded-lg border text-xs font-semibold ${
                  paperMode === 'roster'
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-slate-50 text-slate-700 border-slate-200'
                }`}
              >
                لیست کلاسی کاغذی
              </button>
              <button
                type="button"
                onClick={() => handlePaperModeChange('exam')}
                className={`py-2 px-2 rounded-lg border text-xs font-semibold ${
                  paperMode === 'exam'
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-slate-50 text-slate-700 border-slate-200'
                }`}
              >
                برگه سوالات امتحانی
              </button>
            </div>

            <div className="mb-3">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                بارگذاری تصویر اسکن/عکس برگه کاغذی (اختیاری):
              </label>
              <input
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                className="w-full text-xs text-slate-600 file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border file:border-slate-300 file:text-xs file:font-semibold file:bg-slate-50 file:text-slate-700"
              />
            </div>

            <label className="block text-xs font-semibold text-slate-700 mb-1">
              متن استخراج‌شده از اسکنر یا ردیف‌های دست‌نویس/تایپی:
            </label>
            <textarea
              rows={6}
              value={paperText}
              onChange={(e) => setPaperText(e.target.value)}
              className="w-full border border-slate-300 rounded-lg p-3 text-xs font-mono bg-slate-50 text-slate-800"
            />

            <button
              type="button"
              onClick={handleExtractPaper}
              disabled={paperExtracting}
              className="w-full mt-3 py-2.5 px-4 rounded-lg bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 transition-colors"
            >
              {paperExtracting ? 'در حال پردازش هوشمند سند کاغذی...' : 'استخراج هوشمند ساختاریافته + ارزیابی دقت'}
            </button>
          </div>

          <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-5">
            {paperExtraction ? (
              <div>
                {/* Honest Engineering & Feasibility Assessment Banner */}
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                    <span className="text-xs font-bold text-amber-900">
                      ارزیابی صادقانه مهندسی (Honest Feasibility & Accuracy Report)
                    </span>
                    <span className="text-xs font-mono tabular-nums font-bold text-amber-900">
                      ضریب اطمینان کل: {Math.round((paperExtraction.feasibility_assessment?.overall_confidence || 0.92) * 100)}%
                    </span>
                  </div>
                  <p className="text-xs text-amber-800 leading-relaxed mb-2">
                    {paperExtraction.feasibility_assessment?.honest_engineering_evaluation?.architectural_safeguard}
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-amber-900 font-medium">
                    <div className="bg-white/80 border border-amber-200 rounded p-2">
                      <strong>دقت جداول چاپی:</strong>{' '}
                      {paperExtraction.feasibility_assessment?.honest_engineering_evaluation?.printed_tables_accuracy}
                    </div>
                    <div className="bg-white/80 border border-amber-200 rounded p-2">
                      <strong>دقت دست‌خط فارسی:</strong>{' '}
                      {paperExtraction.feasibility_assessment?.honest_engineering_evaluation?.handwritten_digits_accuracy}
                    </div>
                  </div>
                </div>

                {/* Human-in-the-Loop Editable Review Grid */}
                <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                  <h3 className="text-sm font-bold text-slate-900">
                    جدول بازبینی انسانی پیش از ثبت نهایی ({paperExtraction.items?.length} مورد)
                  </h3>
                  <button
                    type="button"
                    onClick={handleCommitPaperData}
                    disabled={paperCommitting}
                    className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 transition-colors"
                  >
                    {paperCommitting ? 'در حال ثبت در دیتابیس...' : 'تایید انسانی و ثبت اتمیک در دیتابیس'}
                  </button>
                </div>

                <div className="overflow-x-auto border border-slate-200 rounded-lg">
                  <table className="w-full text-right text-xs">
                    <thead className="bg-slate-100 text-slate-700 border-b border-slate-200">
                      <tr>
                        <th className="py-2 px-3">#</th>
                        <th className="py-2 px-3">
                          {paperMode === 'exam' ? 'صورت سوال' : 'نام دانش‌آموز'}
                        </th>
                        <th className="py-2 px-3">
                          {paperMode === 'gradesheet' ? 'نمره (قابل ویرایش)' : paperMode === 'roster' ? 'کد ملی (قابل ویرایش)' : 'گزینه صحیح'}
                        </th>
                        <th className="py-2 px-3">اطمینان مدل</th>
                        <th className="py-2 px-3">وضعیت بازبینی</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {paperExtraction.items?.map((item, idx) => (
                        <tr
                          key={idx}
                          className={item.needs_review ? 'bg-amber-50/70' : 'hover:bg-slate-50'}
                        >
                          <td className="py-2 px-3 font-mono tabular-nums">{idx + 1}</td>
                          <td className="py-2 px-3 font-medium">
                            {paperMode === 'gradesheet'
                              ? item.student_name
                              : paperMode === 'roster'
                              ? item.full_name
                              : item.question_text}
                          </td>
                          <td className="py-2 px-3">
                            {paperMode === 'gradesheet' ? (
                              <input
                                type="number"
                                step="0.25"
                                min="0"
                                max="20"
                                value={item.score}
                                onChange={(e) => handleUpdateExtractedItem(idx, 'score', parseFloat(e.target.value))}
                                className="w-20 border border-slate-300 rounded px-2 py-1 font-mono tabular-nums text-xs bg-white"
                              />
                            ) : paperMode === 'roster' ? (
                              <input
                                type="text"
                                value={item.national_code}
                                onChange={(e) => handleUpdateExtractedItem(idx, 'national_code', e.target.value)}
                                className="w-28 border border-slate-300 rounded px-2 py-1 font-mono tabular-nums text-xs bg-white"
                              />
                            ) : (
                              <span className="font-mono tabular-nums">گزینه {Number(item.correct_option) + 1}</span>
                            )}
                          </td>
                          <td className="py-2 px-3 font-mono tabular-nums">
                            {Math.round((item.confidence || 0.9) * 100)}%
                          </td>
                          <td className="py-2 px-3">
                            {item.needs_review ? (
                              <span className="text-amber-800 font-semibold">{item.review_reason}</span>
                            ) : (
                              <span className="text-emerald-700 font-semibold">{item.review_reason}</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center p-8 text-center border border-dashed border-slate-300 rounded-lg text-xs text-slate-500">
                نوع سند کاغذی (لیست نمرات، لیست کلاسی یا سوالات امتحانی) را انتخاب کرده و دکمه «استخراج هوشمند ساختاریافته» را بزنید تا جدول بازبینی انسانی و گزارش ارزیابی دقت نمایش داده شود.
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: IRANIAN BANKING, SHAPARAK IPG & SHEBA VALIDATION */}
      {activeTab === 'shaparak' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5">
            <h2 className="text-base font-bold text-slate-900 mb-1">
              اعتبارسنجی شماره شبا (IBAN) خزانه مدرسه طبق استاندارد بانک مرکزی
            </h2>
            <p className="text-xs text-slate-500 mb-4">
              بررسی صحت ۲۶ کاراکتر شبا با الگوریتم ISO-7064 Mod-97-10 و تشخیص خودکار بانک عامل
            </p>

            <div className="flex gap-2 mb-3">
              <input
                type="text"
                dir="ltr"
                value={shebaInput}
                onChange={(e) => setShebaInput(e.target.value)}
                placeholder="IR062960000000100324200001"
                className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-xs font-mono tabular-nums bg-slate-50"
              />
              <button
                type="button"
                onClick={handleValidateSheba}
                className="px-4 py-2 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800"
              >
                بررسی شبا
              </button>
            </div>

            {shebaResult && (
              <div
                className={`p-3 rounded-lg border text-xs mb-5 ${
                  shebaResult.valid
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                    : 'bg-red-50 border-red-200 text-red-900'
                }`}
              >
                <div className="font-bold">
                  {shebaResult.valid ? `✓ شبا معتبر — ${shebaResult.bank_name}` : `✕ ${shebaResult.reason}`}
                </div>
                <div className="font-mono tabular-nums mt-1" dir="ltr">
                  {shebaResult.formatted}
                </div>
              </div>
            )}

            <div className="pt-4 border-t border-slate-200">
              <h3 className="text-sm font-bold text-slate-900 mb-2">
                انتخاب دانش‌آموز جهت مشاهده دفتر کل شهریه و پرداخت شاپرک
              </h3>
              <div className="flex gap-2">
                <select
                  value={selectedStudentId}
                  onChange={(e) => setSelectedStudentId(e.target.value)}
                  className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-xs bg-white"
                >
                  <option value="">انتخاب دانش‌آموز...</option>
                  {studentsList.map((st) => (
                    <option key={st.id} value={st.id}>
                      {st.name} ({st.code})
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={handleLoadOrCreateLedger}
                  className="px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700"
                >
                  بارگذاری دفتر شهریه
                </button>
              </div>
            </div>
          </div>

          <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-5">
            <h2 className="text-base font-bold text-slate-900 mb-3">
              تقسیط شهریه و تسویه آنی از طریق شبکه شاپرک (به‌پرداخت ملت / زرین‌پال)
            </h2>

            {ledgerData ? (
              <div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                  <div className="border border-slate-200 rounded-lg p-3 bg-slate-50">
                    <div className="text-xs text-slate-500">شهریه کل سال تحصیلی</div>
                    <div className="text-sm font-bold font-mono tabular-nums mt-1">
                      {Number(ledgerData.ledger?.total_amount || 0).toLocaleString('fa-IR')} ریال
                    </div>
                  </div>
                  <div className="border border-slate-200 rounded-lg p-3 bg-emerald-50">
                    <div className="text-xs text-emerald-700">مجموع پرداخت‌شده</div>
                    <div className="text-sm font-bold font-mono tabular-nums text-emerald-900 mt-1">
                      {Number(ledgerData.ledger?.paid_amount || 0).toLocaleString('fa-IR')} ریال
                    </div>
                  </div>
                  <div className="border border-slate-200 rounded-lg p-3 bg-amber-50">
                    <div className="text-xs text-amber-800">مانده بدهی</div>
                    <div className="text-sm font-bold font-mono tabular-nums text-amber-900 mt-1">
                      {Number(ledgerData.ledger?.balance || 0).toLocaleString('fa-IR')} ریال
                    </div>
                  </div>
                </div>

                <div className="overflow-x-auto border border-slate-200 rounded-lg mb-4">
                  <table className="w-full text-right text-xs">
                    <thead className="bg-slate-100 text-slate-700 border-b border-slate-200">
                      <tr>
                        <th className="py-2 px-3">قسط</th>
                        <th className="py-2 px-3">مبلغ (ریال)</th>
                        <th className="py-2 px-3">سررسید</th>
                        <th className="py-2 px-3">وضعیت</th>
                        <th className="py-2 px-3">کد رهگیری شاپرک</th>
                        <th className="py-2 px-3">عملیات</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {ledgerData.installments?.map((inst) => (
                        <tr key={inst.id} className="hover:bg-slate-50">
                          <td className="py-2.5 px-3 font-mono tabular-nums">قسط {inst.installment_number}</td>
                          <td className="py-2.5 px-3 font-mono tabular-nums font-semibold">
                            {Number(inst.amount).toLocaleString('fa-IR')}
                          </td>
                          <td className="py-2.5 px-3 font-mono tabular-nums">{inst.due_date}</td>
                          <td className="py-2.5 px-3">
                            {inst.status === 'verified' ? (
                              <span className="text-emerald-700 font-bold">تسویه‌شده (شاپرک)</span>
                            ) : (
                              <span className="text-amber-700 font-semibold">در انتظار پرداخت</span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 font-mono tabular-nums">{inst.tracking_number || '—'}</td>
                          <td className="py-2.5 px-3">
                            {inst.status !== 'verified' && (
                              <button
                                type="button"
                                onClick={() => handleInitiateShaparak(inst.id)}
                                className="px-3 py-1 rounded bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700"
                              >
                                پرداخت آنلاین شاپرک
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {activePaymentSession && (
                  <div className="border border-blue-200 bg-blue-50 rounded-lg p-4 mb-4">
                    <div className="text-xs font-bold text-blue-900 mb-1">
                      نشست فعال شاپرک: {activePaymentSession.gateway_title}
                    </div>
                    <div className="text-xs text-blue-800 font-mono tabular-nums mb-3">
                      شناسه مرجع (Authority): {activePaymentSession.authority} | مبلغ:{' '}
                      {Number(activePaymentSession.amount_toman).toLocaleString('fa-IR')} تومان
                    </div>
                    <button
                      type="button"
                      onClick={handleCompleteShaparakCallback}
                      className="px-4 py-2 rounded-lg bg-blue-700 text-white text-xs font-bold hover:bg-blue-800"
                    >
                      تکمیل تراکنش شاپرک و صدور آنی رسید دیجیتال + پیامک تسویه
                    </button>
                  </div>
                )}

                {lastReceipt && (
                  <div className="border border-emerald-300 bg-emerald-50 rounded-lg p-4 text-xs text-emerald-950">
                    <div className="font-bold text-sm mb-2">
                      رسید رسمی تراکنش شاپرک — کد رهگیری: <span className="font-mono">{lastReceipt.shaparak_ref_id}</span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      <div>دانش‌آموز: {lastReceipt.student_name}</div>
                      <div className="font-mono tabular-nums">شماره کارت: {lastReceipt.masked_card_pan}</div>
                      <div className="font-mono tabular-nums">
                        مبلغ: {Number(lastReceipt.amount_rial).toLocaleString('fa-IR')} ریال
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="p-8 text-center border border-dashed border-slate-300 rounded-lg text-xs text-slate-500">
                یک دانش‌آموز را از ستون سمت راست انتخاب کرده و روی «بارگذاری دفتر شهریه» کلیک کنید تا اقساط و درگاه شاپرک فعال شود.
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 4: SERVICE SMS GATEWAY & PERSIAN NORMALIZER */}
      {activeTab === 'sms' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5">
            <h2 className="text-base font-bold text-slate-900 mb-1">
              ارسال پیامک خدماتی پترن (عبور از بلک‌لیست مخابراتی)
            </h2>
            <p className="text-xs text-slate-500 mb-4">
              متصل به درگاه {smsProviderInfo.provider} با خط خدماتی {smsProviderInfo.sender_line}
            </p>

            <label className="block text-xs font-semibold text-slate-700 mb-1">
              شماره همراه ولی (پشتیبانی خودکار از ارقام فارسی ۰۹۱۲...):
            </label>
            <input
              type="text"
              value={manualPhone}
              onChange={(e) => setManualPhone(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs font-mono tabular-nums bg-slate-50 mb-3"
            />

            <label className="block text-xs font-semibold text-slate-700 mb-1">
              متن پیامک پترن:
            </label>
            <textarea
              rows={4}
              value={manualMessage}
              onChange={(e) => setManualMessage(e.target.value)}
              className="w-full border border-slate-300 rounded-lg p-3 text-xs bg-slate-50 mb-3"
            />

            <button
              type="button"
              onClick={handleSendManualPatternSms}
              className="w-full py-2.5 px-4 rounded-lg bg-slate-900 text-white text-xs font-bold hover:bg-slate-800"
            >
              ارسال آنی از طریق خط خدماتی
            </button>
          </div>

          <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-5">
            <h2 className="text-base font-bold text-slate-900 mb-3">
              لاگ زنده پیامک‌های خدماتی ارسالی (غیبت کلاسی، رسید شاپرک و اطلاعیه‌ها)
            </h2>

            {smsLogs.length > 0 ? (
              <div className="overflow-x-auto border border-slate-200 rounded-lg">
                <table className="w-full text-right text-xs">
                  <thead className="bg-slate-100 text-slate-700 border-b border-slate-200">
                    <tr>
                      <th className="py-2 px-3">شناسه</th>
                      <th className="py-2 px-3">گیرنده (نرمال‌شده)</th>
                      <th className="py-2 px-3">پترن</th>
                      <th className="py-2 px-3">متن پیامک</th>
                      <th className="py-2 px-3">وضعیت</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {smsLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-slate-50">
                        <td className="py-2 px-3 font-mono tabular-nums">{log.id.slice(-8)}</td>
                        <td className="py-2 px-3 font-mono tabular-nums">{log.receptor}</td>
                        <td className="py-2 px-3 font-mono">{log.template}</td>
                        <td className="py-2 px-3">{log.message_preview}</td>
                        <td className="py-2 px-3 text-emerald-700 font-semibold">{log.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-8 text-center border border-dashed border-slate-300 rounded-lg text-xs text-slate-500">
                هنوز پیامکی در این نشست ثبت نشده است. با بستن جلسه حضور و غیاب، تسویه شاپرک یا ارسال دستی از فرم مقابل، لاگ پیامک‌های خدماتی در این جدول ثبت می‌شود.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
