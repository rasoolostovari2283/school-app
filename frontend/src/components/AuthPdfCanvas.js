'use client';

import { useEffect, useRef, useState } from 'react';
import { HiOutlineDocumentArrowDown } from 'react-icons/hi2';
import api from '../lib/api';

function loadPdfJsLib() {
  if (typeof window === 'undefined') return Promise.resolve(null);
  const existing = window.pdfjsLib || window['pdfjs-dist/build/pdf'];
  if (existing) {
    if (!existing.GlobalWorkerOptions?.workerSrc) {
      existing.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js';
    }
    return Promise.resolve(existing);
  }
  return new Promise((resolve, reject) => {
    let script = document.querySelector('script[data-pdfjs="true"]');
    if (!script) {
      script = document.createElement('script');
      script.setAttribute('data-pdfjs', 'true');
      script.src = '/pdf.js';
      document.head.appendChild(script);
    }
    const getLib = () => {
      const lib = window.pdfjsLib || window['pdfjs-dist/build/pdf'];
      if (lib) {
        lib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js';
        return lib;
      }
      return null;
    };
    const ready = getLib();
    if (ready) {
      resolve(ready);
      return;
    }
    script.addEventListener('load', () => {
      const lib = getLib();
      if (lib) resolve(lib);
      else reject(new Error('خطا در بارگذاری موتور نمایش PDF'));
    });
    script.addEventListener('error', () => reject(new Error('خطا در بارگذاری اسکریپت PDF')));
  });
}

/**
 * Renders an authenticated PDF URL onto responsive <canvas> pages using PDF.js,
 * guaranteeing crisp in-app viewing inside Android Capacitor WebView as well as Desktop.
 */
export default function AuthPdfCanvas({ resolvedUrl, onDownload, maxHeight = '60vh' }) {
  const canvasWrapRef = useRef(null);
  const [pdfDoc, setPdfDoc] = useState(null);
  const [pageNum, setPageNum] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [loadingPdf, setLoadingPdf] = useState(true);
  const [renderingPage, setRenderingPage] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    let cancelled = false;
    if (!resolvedUrl) {
      setErrorMsg('آدرس فایل PDF معتبر نیست');
      setLoadingPdf(false);
      return;
    }
    setLoadingPdf(true);
    setErrorMsg('');
    setPageNum(1);

    (async () => {
      try {
        const res = await api.get(resolvedUrl, { responseType: 'arraybuffer', baseURL: '' });
        if (cancelled) return;
        const pdfjs = await loadPdfJsLib();
        if (!pdfjs || cancelled) return;
        const doc = await pdfjs.getDocument({ data: new Uint8Array(res.data) }).promise;
        if (cancelled) return;
        setPdfDoc(doc);
        setTotalPages(doc.numPages || 1);
        setLoadingPdf(false);
      } catch (err) {
        if (cancelled) return;
        console.error('PDF preview load error:', err);
        setErrorMsg('امکان بارگذاری پیش‌نمایش PDF وجود ندارد؛ از دکمه دانلود فایل استفاده کنید.');
        setLoadingPdf(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [resolvedUrl]);

  useEffect(() => {
    let cancelled = false;
    if (!pdfDoc || !canvasWrapRef.current) return;

    (async () => {
      setRenderingPage(true);
      try {
        const page = await pdfDoc.getPage(pageNum);
        if (cancelled) return;
        const baseViewport = page.getViewport({ scale: 1 });
        const containerW = Math.max(280, (canvasWrapRef.current?.clientWidth || 560) - 24);
        const dpr = typeof window !== 'undefined' ? Math.min(2, window.devicePixelRatio || 1) : 1;
        const scale = Math.max(1.2, (containerW / baseViewport.width) * dpr);
        const viewport = page.getViewport({ scale });

        const canvas = canvasWrapRef.current?.querySelector('canvas');
        if (!canvas) return;
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.style.width = '100%';
        canvas.style.height = 'auto';

        const ctx = canvas.getContext('2d', { alpha: false });
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        await page.render({ canvasContext: ctx, viewport }).promise;
      } catch (err) {
        if (!cancelled) console.error('PDF render page error:', err);
      } finally {
        if (!cancelled) setRenderingPage(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pdfDoc, pageNum]);

  if (loadingPdf) {
    return (
      <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
        در حال بارگذاری و رندر صفحات PDF...
      </div>
    );
  }

  if (errorMsg) {
    return (
      <div style={{ padding: '24px 16px', textAlign: 'center', fontSize: '0.85rem' }}>
        <p style={{ color: '#ef4444', marginBottom: '10px' }}>{errorMsg}</p>
        {onDownload && (
          <button type="button" className="btn btn-primary btn-sm" onClick={onDownload}>
            <HiOutlineDocumentArrowDown />
            <span>دانلود فایل PDF</span>
          </button>
        )}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', width: '100%' }}>
      {totalPages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={pageNum <= 1 || renderingPage}
            onClick={() => setPageNum((p) => Math.max(1, p - 1))}
          >
            صفحه قبل
          </button>
          <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)' }}>
            صفحه {pageNum} از {totalPages}
          </span>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={pageNum >= totalPages || renderingPage}
            onClick={() => setPageNum((p) => Math.min(totalPages, p + 1))}
          >
            صفحه بعد
          </button>
        </div>
      )}
      <div
        ref={canvasWrapRef}
        style={{
          width: '100%',
          maxHeight,
          overflowY: 'auto',
          background: '#f8fafc',
          borderRadius: '10px',
          padding: '8px',
          border: '1px solid var(--border-color)',
          textAlign: 'center',
        }}
      >
        <canvas style={{ borderRadius: '6px', boxShadow: '0 2px 10px rgba(0,0,0,0.08)', maxWidth: '100%' }} />
      </div>
    </div>
  );
}
