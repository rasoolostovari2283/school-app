'use client';

import { useState, useEffect } from 'react';
import {
  HiOutlineArrowPath,
  HiOutlineShieldCheck,
  HiOutlineSparkles,
  HiOutlineCog6Tooth,
} from 'react-icons/hi2';
import {
  getApiBaseUrl,
  setApiBaseUrl,
  probeServer,
  resetToDefaultWifi,
} from '@/lib/api';
import toast from 'react-hot-toast';

export default function ServerConnectionBar({ onConnected }) {
  const [status, setStatus] = useState('checking'); // 'checking' | 'online' | 'offline'
  const [pingMs, setPingMs] = useState(null);
  const [showConfig, setShowConfig] = useState(false);
  const [customUrlInput, setCustomUrlInput] = useState('');

  const checkCurrentServer = async (targetUrl, silent = true) => {
    const urlToTest = targetUrl || getApiBaseUrl();
    setStatus('checking');
    const t0 = Date.now();
    const res = await probeServer(urlToTest, 4000);
    if (res && res.success) {
      setPingMs(Date.now() - t0);
      setStatus('online');
      setCustomUrlInput(res.url);
      onConnected?.(res.url);
      if (!silent) {
        toast.success('اتصال امن به هسته مرکزی ادوکانکت برقرار است');
      }
      return true;
    }

    // If a stale custom URL was stored, try same-origin fallback automatically
    if (typeof window !== 'undefined' && !targetUrl) {
      const sameOrigin = `${window.location.origin}/api/v1`;
      if (urlToTest !== sameOrigin) {
        const fallbackRes = await probeServer(sameOrigin, 3500);
        if (fallbackRes && fallbackRes.success) {
          resetToDefaultWifi();
          setPingMs(Date.now() - t0);
          setStatus('online');
          setCustomUrlInput(fallbackRes.url);
          onConnected?.(fallbackRes.url);
          return true;
        }
      }
    }

    setStatus('offline');
    if (!silent) {
      toast.error('عدم پاسخگویی سرور؛ لطفاً آدرس سرور را بررسی نمایید');
    }
    return false;
  };

  useEffect(() => {
    const activeUrl = getApiBaseUrl();
    setCustomUrlInput(activeUrl);
    checkCurrentServer(activeUrl, true);
  }, []);

  const handleSaveCustomServer = async () => {
    if (!customUrlInput || !customUrlInput.trim()) {
      resetToDefaultWifi();
      const defUrl = getApiBaseUrl();
      setCustomUrlInput(defUrl);
      await checkCurrentServer(defUrl, false);
      setShowConfig(false);
      return;
    }
    const normalized = setApiBaseUrl(customUrlInput.trim());
    setCustomUrlInput(normalized);
    const ok = await checkCurrentServer(normalized, false);
    if (ok) {
      setShowConfig(false);
    }
  };

  return (
    <div className="mb-4" dir="rtl">
      <div
        className={`flex items-center justify-between gap-2 px-3.5 py-2 rounded-2xl border text-xs transition-all shadow-sm backdrop-blur-md ${
          status === 'online'
            ? 'bg-emerald-50/90 border-emerald-200/80 text-emerald-900'
            : status === 'checking'
            ? 'bg-indigo-50/90 border-indigo-200/80 text-indigo-900'
            : 'bg-amber-50/90 border-amber-200/80 text-amber-900'
        }`}
      >
        <div className="flex items-center gap-2 min-w-0">
          {status === 'online' ? (
            <span className="relative flex h-2.5 w-2.5 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
            </span>
          ) : status === 'checking' ? (
            <HiOutlineArrowPath className="w-4 h-4 text-indigo-600 animate-spin shrink-0" />
          ) : (
            <span className="h-2.5 w-2.5 rounded-full bg-amber-500 shrink-0"></span>
          )}

          <span className="font-bold truncate flex items-center gap-1.5">
            {status === 'online' && (
              <>
                <HiOutlineShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>متصل به هسته یکپارچه ادوکانکت</span>
                {pingMs !== null && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-emerald-100 text-emerald-700 font-mono">
                    {pingMs}ms
                  </span>
                )}
              </>
            )}
            {status === 'checking' && 'در حال همگام‌سازی امن با سرور مرکزی...'}
            {status === 'offline' && 'عدم ارتباط با سرور (جهت تنظیم آدرس کلیک کنید)'}
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-white/80 text-[10px] font-bold text-slate-600 border border-slate-200/60">
            <HiOutlineSparkles className="w-3 h-3 text-indigo-500" />
            سیدا + شاپرک + هوش مصنوعی
          </span>
          <button
            type="button"
            onClick={() => setShowConfig((prev) => !prev)}
            className="flex items-center gap-1 px-2 py-1 rounded-xl font-bold bg-white/90 hover:bg-white text-slate-700 border border-slate-200/80 transition shadow-2xs"
            title="تنظیم آدرس سرور"
          >
            <HiOutlineCog6Tooth className="w-3.5 h-3.5" />
            <span className="hidden xs:inline">سرور</span>
          </button>
          <button
            type="button"
            onClick={() => checkCurrentServer(getApiBaseUrl(), false)}
            className="flex items-center gap-1 px-2.5 py-1 rounded-xl font-bold bg-white/90 hover:bg-white text-slate-700 border border-slate-200/80 transition shadow-2xs"
            title="بررسی مجدد اتصال"
          >
            <HiOutlineArrowPath className={`w-3.5 h-3.5 ${status === 'checking' ? 'animate-spin' : ''}`} />
            <span>بروزرسانی</span>
          </button>
        </div>
      </div>

      {(showConfig || status === 'offline') && (
        <div className="mt-2 p-2.5 rounded-2xl bg-white/95 border border-slate-200 shadow-sm text-xs flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <input
            type="text"
            dir="ltr"
            value={customUrlInput}
            onChange={(e) => setCustomUrlInput(e.target.value)}
            placeholder="https://your-server.trycloudflare.com or http://192.168.1.100:5000"
            className="flex-1 px-3 py-1.5 rounded-xl border border-slate-300 text-slate-800 font-mono text-[11px] focus:outline-none focus:border-indigo-500"
          />
          <div className="flex items-center gap-1.5 justify-end">
            <button
              type="button"
              onClick={handleSaveCustomServer}
              className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold transition"
            >
              ذخیره و اتصال
            </button>
            <button
              type="button"
              onClick={async () => {
                const defUrl = resetToDefaultWifi();
                setCustomUrlInput(defUrl);
                await checkCurrentServer(defUrl, false);
              }}
              className="px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold transition"
            >
              پیش‌فرض
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
