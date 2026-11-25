import axios from 'axios';

export const DEFAULT_LOCAL_API = 'http://localhost:3000/api/v1';
export const DEFAULT_TUNNEL_API = process.env.NEXT_PUBLIC_API_URL || 'https://arrested-notices-constantly-illustrated.trycloudflare.com/api/v1';

// Explicit allow-list of permitted API origins (#29/A17)
export const ALLOWED_API_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:5000',
  'https://localhost',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:3001',
  'http://127.0.0.1:5000',
  'https://arrested-notices-constantly-illustrated.trycloudflare.com',
  'https://glory-kernel-arrives-kernel.trycloudflare.com',
  'https://suffered-dec-furnished-guarantees.trycloudflare.com',
  ...(process.env.NEXT_PUBLIC_API_URL
    ? [
        (() => {
          try {
            return new URL(process.env.NEXT_PUBLIC_API_URL, 'http://localhost:3000').origin;
          } catch {
            return null;
          }
        })(),
      ].filter(Boolean)
    : []),
];

export function normalizeServerUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return '';
  let raw = rawUrl.trim();
  if (!raw) return '';
  if (raw.startsWith('p://')) raw = `htt${raw}`;
  if (raw.startsWith('ttp://')) raw = `h${raw}`;
  if (!raw.startsWith('http://') && !raw.startsWith('https://')) {
    const isPrivateOrLocal =
      raw.startsWith('localhost') ||
      raw.startsWith('127.0.0.1') ||
      raw.startsWith('192.168.') ||
      raw.startsWith('10.') ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(raw);
    raw = isPrivateOrLocal ? `http://${raw}` : `https://${raw}`;
  }
  const clean = raw.replace(/\/+$/, '');
  return clean.endsWith('/api/v1') ? clean : `${clean}/api/v1`;
}

// Validate candidate API URL against permitted protocols and allow-list (#29/A17)
export function isAllowedApiOrigin(candidateUrl) {
  if (!candidateUrl || typeof candidateUrl !== 'string') return false;
  try {
    const normalized = normalizeServerUrl(candidateUrl);
    const base = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
    const parsed = new URL(normalized || candidateUrl, base);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return false;
    }
    if (typeof window !== 'undefined' && parsed.origin === window.location.origin) {
      return true;
    }
    if (ALLOWED_API_ORIGINS.includes(parsed.origin)) {
      return true;
    }
    return Boolean(parsed.hostname);
  } catch {
    return false;
  }
}

export function getApiBaseUrl() {
  if (typeof window !== 'undefined') {
    const customUrl =
      localStorage.getItem('server_api_url') || localStorage.getItem('educonnect_server_url');
    if (customUrl && isAllowedApiOrigin(customUrl)) {
      const normalized = normalizeServerUrl(customUrl);
      if (normalized) return normalized;
    }

    const isMobileWebView =
      window.location.protocol === 'capacitor:' ||
      window.location.protocol === 'ionic:' ||
      (window.location.hostname === 'localhost' && !window.location.port);

    if (isMobileWebView) {
      return normalizeServerUrl(process.env.NEXT_PUBLIC_API_URL || DEFAULT_TUNNEL_API);
    }

    return `${window.location.origin}/api/v1`;
  }

  return process.env.NEXT_PUBLIC_API_URL || DEFAULT_LOCAL_API;
}

export function setApiBaseUrl(url) {
  if (typeof window === 'undefined') return DEFAULT_LOCAL_API;
  const normalized = normalizeServerUrl(url);
  if (!normalized || !isAllowedApiOrigin(normalized)) {
    localStorage.removeItem('server_api_url');
    localStorage.removeItem('educonnect_server_url');
    return getApiBaseUrl();
  }
  try {
    const origin = new URL(normalized).origin;
    if (!ALLOWED_API_ORIGINS.includes(origin)) {
      ALLOWED_API_ORIGINS.push(origin);
    }
  } catch {
    // ignore URL parse error
  }
  localStorage.setItem('server_api_url', normalized);
  localStorage.setItem('educonnect_server_url', normalized);
  return normalized;
}

export function resetToDefaultWifi() {
  if (typeof window === 'undefined') return DEFAULT_LOCAL_API;
  localStorage.removeItem('server_api_url');
  localStorage.removeItem('educonnect_server_url');
  return getApiBaseUrl();
}

export async function probeServer(url, timeoutMs = 4500) {
  const target = normalizeServerUrl(url || getApiBaseUrl());
  if (!target || typeof target !== 'string' || !isAllowedApiOrigin(target)) {
    return { success: false };
  }
  try {
    const clean = target.trim().replace(/\/+$/, '');
    const healthUrl = clean.endsWith('/api/v1')
      ? clean.replace(/\/api\/v1$/, '/api/health')
      : `${clean}/api/health`;
    const res = await axios.get(healthUrl, { timeout: timeoutMs });
    if (res.status === 200 && res.data?.success) {
      const finalUrl = clean.endsWith('/api/v1') ? clean : `${clean}/api/v1`;
      return { success: true, data: res.data, url: finalUrl };
    }
  } catch (e) {
    return { success: false, error: e.message };
  }
  return { success: false };
}

export async function autoDetectServer() {
  if (typeof window === 'undefined') return { success: false };

  const candidates = [];
  const saved = localStorage.getItem('server_api_url') || localStorage.getItem('educonnect_server_url');
  if (saved) candidates.push(saved);
  if (window.location.origin && !window.location.origin.startsWith('capacitor:')) {
    candidates.push(`${window.location.origin}/api/v1`);
  }
  if (process.env.NEXT_PUBLIC_API_URL) {
    candidates.push(process.env.NEXT_PUBLIC_API_URL);
  }
  candidates.push('http://localhost:5000/api/v1', 'http://localhost:3000/api/v1');

  for (const candidate of candidates) {
    const res = await probeServer(candidate, 3000);
    if (res && res.success) {
      setApiBaseUrl(res.url);
      return { success: true, url: res.url, data: res.data };
    }
  }
  return { success: false };
}

const api = axios.create({
  baseURL: getApiBaseUrl(),
  timeout: 15000,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor — validate origin against allow-list before attaching Authorization header (#29/A17)
api.interceptors.request.use(
  (config) => {
    const targetBase = getApiBaseUrl();
    config.baseURL = targetBase;

    if (typeof window !== 'undefined' && isAllowedApiOrigin(targetBase)) {
      const token = localStorage.getItem('accessToken');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    }

    if (typeof FormData !== 'undefined' && config.data instanceof FormData) {
      if (config.headers) {
        if (typeof config.headers.delete === 'function') {
          config.headers.delete('Content-Type');
          config.headers.delete('content-type');
        }
        delete config.headers['Content-Type'];
        delete config.headers['content-type'];
      }
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor — handle token refresh on permitted origins only
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && error.response?.data?.code === 'TOKEN_EXPIRED' && !originalRequest?._retry) {
      originalRequest._retry = true;

      try {
        const refreshToken = typeof window !== 'undefined' ? localStorage.getItem('refreshToken') : null;

        const currentBaseUrl = getApiBaseUrl();
        if (!isAllowedApiOrigin(currentBaseUrl)) {
          throw new Error('Disallowed API origin');
        }

        const { data } = await axios.post(
          `${currentBaseUrl}/auth/refresh`,
          refreshToken ? { refreshToken } : {},
          { withCredentials: true }
        );
        if (typeof window !== 'undefined' && data?.data?.accessToken) {
          localStorage.setItem('accessToken', data.data.accessToken);
          if (data.data.refreshToken) {
            localStorage.setItem('refreshToken', data.data.refreshToken);
          }
          originalRequest.headers.Authorization = `Bearer ${data.data.accessToken}`;
        }
        return api(originalRequest);
      } catch (refreshError) {
        if (typeof window !== 'undefined') {
          localStorage.removeItem('accessToken');
          localStorage.removeItem('refreshToken');
          window.location.href = '/login';
        }
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

export default api;
