import api, { getApiBaseUrl } from '../lib/api';

/**
 * Detects whether the app is running inside a native Capacitor wrapper or mobile WebView
 * where <a download> with blob:/data: URIs is ignored or blocked by Android DownloadManager.
 */
export function isMobileOrNativeWebView() {
  if (typeof window === 'undefined') return false;
  return Boolean(
    window.Capacitor?.isNativePlatform?.() ||
      /Android|wv|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '')
  );
}

/**
 * Normalizes Blob / File / data: URI / blob: URI / text / bytes into a Blob.
 */
export async function toDownloadBlob(data, mimeType = 'application/octet-stream') {
  if (data instanceof Blob) return data;
  if (typeof data === 'string' && (data.startsWith('data:') || data.startsWith('blob:'))) {
    const resp = await fetch(data);
    return resp.blob();
  }
  return new Blob([data ?? ''], { type: mimeType });
}

/**
 * Reliable file downloader for Desktop Browsers, Mobile Browsers, and Android Capacitor WebView.
 * On mobile/Capacitor WebView, relays the Blob through POST /upload/temp-download to obtain a genuine
 * one-time HTTPS attachment URL so Android Chrome/DownloadManager saves it properly.
 */
export async function triggerReliableDownload(data, filename, mimeType = 'application/octet-stream') {
  try {
    const blob = await toDownloadBlob(data, mimeType);
    if (!blob) return false;

    const extFallback = mimeType?.includes('pdf')
      ? 'pdf'
      : mimeType?.includes('png')
      ? 'png'
      : mimeType?.includes('jpeg') || mimeType?.includes('jpg')
      ? 'jpg'
      : mimeType?.includes('csv')
      ? 'csv'
      : mimeType?.includes('webm')
      ? 'webm'
      : 'txt';
    const safeFilename = filename && filename.includes('.') ? filename : `${filename || 'file'}.${extFallback}`;

    if (isMobileOrNativeWebView()) {
      try {
        const formData = new FormData();
        formData.append('file', blob, safeFilename);
        formData.append('filename', safeFilename);

        const res = await api.post('/upload/temp-download', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
          timeout: 120000,
        });

        const downloadPath = res.data?.data?.downloadPath;
        if (downloadPath) {
          const rawApiBase = typeof getApiBaseUrl === 'function' ? getApiBaseUrl() : '';
          const backendOrigin = rawApiBase
            ? rawApiBase.replace(/\/api\/v1\/?$/, '')
            : window.location.origin;
          const fullDownloadUrl = `${backendOrigin}${downloadPath}`;

          const opened = window.open(fullDownloadUrl, '_blank', 'noopener,noreferrer');
          if (!opened) {
            const link = document.createElement('a');
            link.href = fullDownloadUrl;
            link.download = safeFilename;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            link.style.display = 'none';
            document.body.appendChild(link);
            link.click();
            setTimeout(() => {
              try {
                if (link.parentNode) document.body.removeChild(link);
              } catch (_) {}
            }, 2500);
          }
          return true;
        }
      } catch (relayErr) {
        console.warn('HTTPS temp-download relay failed, trying browser fallback:', relayErr);
      }
    }

    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = safeFilename;
    a.rel = 'noopener noreferrer';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      try {
        if (a.parentNode) document.body.removeChild(a);
        URL.revokeObjectURL(blobUrl);
      } catch (_) {}
    }, 60000);
    return true;
  } catch (err) {
    console.error('triggerReliableDownload error:', err);
    return false;
  }
}

/**
 * Shares a generated Blob file via Web Share API when supported (Android/iOS share sheet),
 * or falls back cleanly to downloading the file via triggerReliableDownload.
 */
export async function shareOrDownloadBlob(blob, filename, mimeType, title = '', text = '') {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function' && typeof File !== 'undefined') {
      const file = new File([blob], filename, { type: mimeType || blob.type || 'application/octet-stream' });
      if (!navigator.canShare || navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: title || filename,
          text: text || title || filename,
        });
        return { shared: true, downloaded: false };
      }
    }
  } catch (shareErr) {
    if (shareErr?.name === 'AbortError') {
      return { shared: false, cancelled: true, downloaded: false };
    }
    console.warn('Web Share API unavailable or failed, falling back to file download:', shareErr);
  }

  const downloaded = await triggerReliableDownload(blob, filename, mimeType);
  return { shared: false, downloaded };
}
