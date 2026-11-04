'use client';
import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import {
  getApiBaseUrl,
  setApiBaseUrl,
  resetToDefaultWifi,
  probeServer,
  autoDetectServer,
  DEFAULT_LOCAL_API,
  DEFAULT_TUNNEL_API,
} from '../../lib/api';

export default function ServerConnectionBar() {
  const [currentUrl, setCurrentUrl] = useState('');
  const [status, setStatus] = useState('checking'); // 'connected' | 'error' | 'checking'
  const [statusText, setStatusText] = useState('در حال بررسی اتصال سرور...');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [customInput, setCustomInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Check connection on mount
  useEffect(() => {
    checkConnection();
  }, []);

  const checkConnection = async (targetUrl) => {
    setStatus('checking');
    setStatusText('در حال تست ارتباط...');
    const urlToCheck = targetUrl || getApiBaseUrl();
    setCurrentUrl(urlToCheck);

    const probe = await probeServer(urlToCheck);
    if (probe.success) {
      setStatus('connected');
      const label = urlToCheck.includes('pinggy')
        ? 'تونل آنلاین پینگی (اینترنت همراه)'
        : urlToCheck.includes('192.168.1')
        ? 'وای‌فای مدرسه (شبکه محلی)'
        : 'سرور اختصاصی';
      setStatusText(`متصل: ${label}`);
    } else {
      // Auto fallback check
      const detected = await autoDetectServer();
      if (detected.success) {
        setStatus('connected');
        setCurrentUrl(detected.url);
        const label = detected.url.includes('pinggy')
          ? 'تونل آنلاین پینگی (اینترنت همراه)'
          : 'وای‌فای مدرسه (شبکه محلی)';
        setStatusText(`متصل خودکار: ${label}`);
      } else {
        setStatus('error');
        setStatusText('عدم اتصال به سرور (برای تنظیم کلیک کنید)');
      }
    }
  };

  const handleSelectPreset = async (url, label) => {
    setIsLoading(true);
    const toastId = toast.loading(`در حال اتصال به ${label}...`);
    setApiBaseUrl(url);
    setCurrentUrl(url);

    const probe = await probeServer(url);
    if (probe.success) {
      setStatus('connected');
      setStatusText(`متصل: ${label}`);
      toast.success(`اتصال برقرار شد (${label}) 🚀`, { id: toastId });
      setIsModalOpen(false);
    } else {
      setStatus('error');
      setStatusText(`عدم پاسخ سریع از ${label} (ذخیره شد)`);
      toast.error(`پاسخ سریع دریافت نشد، اما آدرس به عنوان پیش‌فرض ذخیره گردید.`, { id: toastId, duration: 4000 });
      setIsModalOpen(false);
    }
    setIsLoading(false);
  };

  const handleAutoDetect = async () => {
    setIsLoading(true);
    const toastId = toast.loading('در حال شناسایی و جستجوی خودکار سرور فعال...');
    const detected = await autoDetectServer();
    if (detected.success) {
      setCurrentUrl(detected.url);
      setStatus('connected');
      const label = detected.url.includes('pinggy')
        ? 'تونل اینترنت پینگی'
        : 'وای‌فای محلی';
      setStatusText(`متصل: ${label}`);
      toast.success(`سرور با موفقیت شناسایی شد: ${label} ✅`, { id: toastId });
      setIsModalOpen(false);
    } else {
      setStatus('error');
      setStatusText('هیچ سرور فعالی یافت نشد');
      toast.error('هیچ سرور فعالی در شبکه یا اینترنت پاسخ نداد.', { id: toastId });
    }
    setIsLoading(false);
  };

  const handleForceSave = (rawUrl) => {
    let input = (rawUrl || customInput).trim();
    if (!input) {
      toast.error('لطفاً آدرس سرور یا لینک جدید را وارد نمایید');
      return;
    }
    if (!input.startsWith('http://') && !input.startsWith('https://')) {
      input = 'https://' + input;
    }
    const finalUrl = setApiBaseUrl(input);
    setCurrentUrl(finalUrl);
    setStatus('connected');
    setStatusText('تنظیم دستی سرور');
    toast.success('آدرس بدون معطلی و تست، مستقیماً ذخیره شد! 💾');
    setIsModalOpen(false);
    setCustomInput('');
  };

  const handleResetWifi = () => {
    const defaultUrl = resetToDefaultWifi();
    setCurrentUrl(defaultUrl);
    setStatus('checking');
    setStatusText('بازنشانی به وای‌فای پیش‌فرض');
    toast.success('آدرس با موفقیت به وای‌فای مدرسه (192.168.1.104) بازنشانی شد! 📶');
    checkConnection(defaultUrl);
    setIsModalOpen(false);
  };

  const handleSaveCustom = async () => {
    if (!customInput.trim()) {
      toast.error('لطفاً آدرس سرور یا لینک تونل را وارد نمایید');
      return;
    }
    let input = customInput.trim();
    if (!input.startsWith('http://') && !input.startsWith('https://')) {
      input = 'https://' + input;
    }
    setIsLoading(true);
    const toastId = toast.loading('در حال تست آدرس جدید...');
    const probe = await probeServer(input);
    if (probe.success) {
      const finalUrl = setApiBaseUrl(input);
      setCurrentUrl(finalUrl);
      setStatus('connected');
      setStatusText('متصل به آدرس سفارشی');
      toast.success('آدرس با موفقیت تایید و ذخیره شد! 🎉', { id: toastId });
      setIsModalOpen(false);
      setCustomInput('');
    } else {
      const finalUrl = setApiBaseUrl(input);
      setCurrentUrl(finalUrl);
      setStatus('connected');
      setStatusText('آدرس ذخیره شد (منتظر درخواست)');
      toast.success('آدرس با موفقیت ذخیره شد و در درخواست‌ها اعمال می‌شود. 💾', { id: toastId, duration: 4500 });
      setIsModalOpen(false);
      setCustomInput('');
    }
    setIsLoading(false);
  };

  return (
    <>
      {/* Top Banner on Login Screen */}
      <div
        onClick={() => setIsModalOpen(true)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: status === 'connected'
            ? 'rgba(16, 185, 129, 0.12)'
            : status === 'checking'
            ? 'rgba(59, 130, 246, 0.12)'
            : 'rgba(239, 68, 68, 0.14)',
          border: `1px solid ${
            status === 'connected'
              ? 'rgba(16, 185, 129, 0.35)'
              : status === 'checking'
              ? 'rgba(59, 130, 246, 0.35)'
              : 'rgba(239, 68, 68, 0.4)'
          }`,
          borderRadius: '14px',
          padding: '10px 14px',
          margin: '0 0 16px 0',
          cursor: 'pointer',
          transition: 'all 0.2s ease',
          backdropFilter: 'blur(8px)',
        }}
        title="برای تغییر یا بررسی سرور کلیک کنید"
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.85rem' }}>
          <span
            style={{
              width: '10px',
              height: '10px',
              borderRadius: '50%',
              background: status === 'connected' ? '#10b981' : status === 'checking' ? '#3b82f6' : '#ef4444',
              boxShadow: status === 'connected'
                ? '0 0 8px #10b981'
                : status === 'checking'
                ? '0 0 8px #3b82f6'
                : '0 0 8px #ef4444',
              display: 'inline-block',
              animation: status === 'checking' ? 'pulse 1.5s infinite' : 'none',
            }}
          />
          <div style={{ display: 'flex', flexDirection: 'column', textAlign: 'right' }}>
            <span style={{ fontWeight: '600', color: status === 'connected' ? '#10b981' : status === 'checking' ? '#3b82f6' : '#ef4444' }}>
              {statusText}
            </span>
            <span style={{ fontSize: '0.72rem', opacity: 0.75, direction: 'ltr', textAlign: 'right', marginTop: '2px' }}>
              {currentUrl || 'نامشخص'}
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setIsModalOpen(true);
          }}
          style={{
            background: 'var(--primary-color, #4f46e5)',
            color: '#fff',
            border: 'none',
            borderRadius: '8px',
            padding: '5px 11px',
            fontSize: '0.78rem',
            fontWeight: '600',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
          }}
        >
          <span>تغییر سرور</span>
          <span>⚙️</span>
        </button>
      </div>

      {/* Modal Dialog for Server Setup */}
      {isModalOpen && (
        <div
          onClick={() => setIsModalOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.72)',
            zIndex: 99999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
            backdropFilter: 'blur(5px)',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'var(--bg-card, #1e293b)',
              color: 'var(--text-primary, #f8fafc)',
              borderRadius: '20px',
              maxWidth: '480px',
              width: '100%',
              padding: '24px',
              boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
              border: '1px solid rgba(255,255,255,0.12)',
              direction: 'rtl',
              textAlign: 'right',
              maxHeight: '90vh',
              overflowY: 'auto',
            }}
          >
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '1.4rem' }}>🌐</span>
                <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 'bold' }}>
                  تنظیمات اتصال به سرور و تونل اینترنت
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                style={{
                  background: 'rgba(255,255,255,0.1)',
                  border: 'none',
                  borderRadius: '50%',
                  width: '32px',
                  height: '32px',
                  color: 'inherit',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                ✕
              </button>
            </div>

            <p style={{ fontSize: '0.86rem', opacity: 0.85, lineHeight: '1.6', marginBottom: '18px' }}>
              اگر از <strong>اینترنت سیم‌کارت (ایرانسل/همراه اول)</strong> استفاده می‌کنید، گزینه «تونل اینترنت» را انتخاب کنید. اگر به <strong>وای‌فای مدرسه</strong> متصلید، گزینه «وای‌فای محلی» را بزنید:
            </p>

            {/* Quick Presets */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' }}>
              {/* Tunnel Option (Mobile Data) */}
              <button
                type="button"
                disabled={isLoading}
                onClick={() => handleSelectPreset(DEFAULT_TUNNEL_API, 'تونل آنلاین پینگی (اینترنت همراه)')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '14px',
                  borderRadius: '12px',
                  border: currentUrl.includes('pinggy') ? '2px solid #10b981' : '1px solid rgba(255,255,255,0.1)',
                  background: currentUrl.includes('pinggy') ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255,255,255,0.04)',
                  color: 'inherit',
                  cursor: 'pointer',
                  textAlign: 'right',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{ fontSize: '1.6rem' }}>🚀</span>
                  <div>
                    <div style={{ fontWeight: 'bold', fontSize: '0.95rem' }}>
                      اینترنت همراه و سیم‌کارت (تونل آنلاین)
                    </div>
                    <div style={{ fontSize: '0.75rem', opacity: 0.7, direction: 'ltr', textAlign: 'right', marginTop: '2px' }}>
                      {DEFAULT_TUNNEL_API}
                    </div>
                  </div>
                </div>
                {currentUrl.includes('pinggy') && <span style={{ color: '#10b981', fontWeight: 'bold' }}>✓ فعال</span>}
              </button>

              {/* Local Wi-Fi Primary IP 102 */}
              <button
                type="button"
                disabled={isLoading}
                onClick={() => handleSelectPreset('http://192.168.1.102/api/v1', 'وای‌فای سرور (192.168.1.102)')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '14px',
                  borderRadius: '12px',
                  border: currentUrl.includes('192.168.1.102') ? '2px solid #10b981' : '1px solid rgba(255,255,255,0.1)',
                  background: currentUrl.includes('192.168.1.102') ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255,255,255,0.04)',
                  color: 'inherit',
                  cursor: 'pointer',
                  textAlign: 'right',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{ fontSize: '1.6rem' }}>📶</span>
                  <div>
                    <div style={{ fontWeight: 'bold', fontSize: '0.95rem' }}>
                      وای‌فای سرور فعلی (192.168.1.102)
                    </div>
                    <div style={{ fontSize: '0.75rem', opacity: 0.7, direction: 'ltr', textAlign: 'right', marginTop: '2px' }}>
                      http://192.168.1.102/api/v1
                    </div>
                  </div>
                </div>
                {currentUrl.includes('192.168.1.102') && <span style={{ color: '#10b981', fontWeight: 'bold' }}>✓ فعال</span>}
              </button>

              {/* Local Wi-Fi Primary IP 104 */}
              <button
                type="button"
                disabled={isLoading}
                onClick={() => handleSelectPreset('http://192.168.1.104/api/v1', 'وای‌فای سرور (192.168.1.104)')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '14px',
                  borderRadius: '12px',
                  border: currentUrl.includes('192.168.1.104') ? '2px solid #10b981' : '1px solid rgba(255,255,255,0.1)',
                  background: currentUrl.includes('192.168.1.104') ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255,255,255,0.04)',
                  color: 'inherit',
                  cursor: 'pointer',
                  textAlign: 'right',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{ fontSize: '1.6rem' }}>📶</span>
                  <div>
                    <div style={{ fontWeight: 'bold', fontSize: '0.95rem' }}>
                      وای‌فای سرور اصلی (192.168.1.104)
                    </div>
                    <div style={{ fontSize: '0.75rem', opacity: 0.7, direction: 'ltr', textAlign: 'right', marginTop: '2px' }}>
                      http://192.168.1.104/api/v1
                    </div>
                  </div>
                </div>
                {currentUrl.includes('192.168.1.104') && <span style={{ color: '#10b981', fontWeight: 'bold' }}>✓ فعال</span>}
              </button>

              {/* Local Wi-Fi Secondary IP 108 */}
              <button
                type="button"
                disabled={isLoading}
                onClick={() => handleSelectPreset('http://192.168.1.108/api/v1', 'وای‌فای سرور (192.168.1.108)')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '14px',
                  borderRadius: '12px',
                  border: currentUrl.includes('192.168.1.108') ? '2px solid #10b981' : '1px solid rgba(255,255,255,0.1)',
                  background: currentUrl.includes('192.168.1.108') ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255,255,255,0.04)',
                  color: 'inherit',
                  cursor: 'pointer',
                  textAlign: 'right',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{ fontSize: '1.6rem' }}>📶</span>
                  <div>
                    <div style={{ fontWeight: 'bold', fontSize: '0.95rem' }}>
                      وای‌فای سرور ۲ (192.168.1.108)
                    </div>
                    <div style={{ fontSize: '0.75rem', opacity: 0.7, direction: 'ltr', textAlign: 'right', marginTop: '2px' }}>
                      http://192.168.1.108/api/v1
                    </div>
                  </div>
                </div>
                {currentUrl.includes('192.168.1.108') && <span style={{ color: '#10b981', fontWeight: 'bold' }}>✓ فعال</span>}
              </button>

              {/* Auto Detect */}
              <button
                type="button"
                disabled={isLoading}
                onClick={handleAutoDetect}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  padding: '12px',
                  borderRadius: '12px',
                  border: '1px solid #4f46e5',
                  background: 'rgba(79, 70, 229, 0.15)',
                  color: '#818cf8',
                  fontWeight: '600',
                  fontSize: '0.9rem',
                  cursor: 'pointer',
                }}
              >
                <span>🔄</span>
                <span>تست و شناسایی خودکار هوشمند (Auto Detect)</span>
              </button>

              {/* Reset to Default Wi-Fi */}
              <button
                type="button"
                disabled={isLoading}
                onClick={handleResetWifi}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  padding: '10px',
                  borderRadius: '12px',
                  border: '1px dashed #f59e0b',
                  background: 'rgba(245, 158, 11, 0.1)',
                  color: '#fbbf24',
                  fontWeight: '600',
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                }}
              >
                <span>📶</span>
                <span>پاکسازی حافظه و بازنشانی به وای‌فای مدرسه (192.168.1.104)</span>
              </button>
            </div>

            {/* Custom URL Input Section */}
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '16px' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', marginBottom: '8px' }}>
                ✏️ وارد کردن آدرس سرور / لینک جدید تونل پینگی:
              </label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <input
                  type="text"
                  placeholder="https://...run.pinggy-free.link"
                  value={customInput}
                  onChange={(e) => setCustomInput(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '10px',
                    border: '1px solid rgba(255,255,255,0.2)',
                    background: 'rgba(0,0,0,0.25)',
                    color: '#fff',
                    fontSize: '0.85rem',
                    outline: 'none',
                    direction: 'ltr',
                  }}
                />
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    disabled={isLoading}
                    onClick={handleSaveCustom}
                    style={{
                      flex: 1,
                      padding: '10px 12px',
                      borderRadius: '10px',
                      border: 'none',
                      background: '#10b981',
                      color: '#fff',
                      fontWeight: 'bold',
                      fontSize: '0.82rem',
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    🔍 تست و اتصال
                  </button>
                  <button
                    type="button"
                    disabled={isLoading}
                    onClick={() => handleForceSave()}
                    style={{
                      flex: 1,
                      padding: '10px 12px',
                      borderRadius: '10px',
                      border: '1px solid #6366f1',
                      background: 'rgba(99, 102, 241, 0.2)',
                      color: '#a5b4fc',
                      fontWeight: 'bold',
                      fontSize: '0.82rem',
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    💾 ذخیره مستقیم (بدون معطلی)
                  </button>
                </div>
              </div>
            </div>

            <div style={{ marginTop: '16px', textAlign: 'center' }}>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'rgba(255,255,255,0.6)',
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                }}
              >
                بستن پنجره
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
