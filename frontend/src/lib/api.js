import axios from 'axios';

export const DEFAULT_LOCAL_API = 'http://localhost:3000/api/v1';
export const DEFAULT_TUNNEL_API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api/v1';

// Explicit allow-list of permitted API origins (#29/A17)
export const ALLOWED_API_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:5000',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:3001',
  'http://127.0.0.1:5000',
  ...(process.env.NEXT_PUBLIC_API_URL ? [new URL(process.env.NEXT_PUBLIC_API_URL, 'http://localhost:3000').origin] : []),
];

// Clean up any legacy unrelated LAN/tunnel URLs stored in browser localStorage
function purgeLegacyStorageUrls() {
  if (typeof window === 'undefined') return;
  try {
    const keys = ['server_api_url', 'educonnect_server_url'];
    for (const key of keys) {
      const val = localStorage.getItem(key);
      if (
        val &&
        (val.includes('192.168.') ||
          val.includes('pinggy') ||
          val.includes('trycloudflare') ||
          val.includes(':5000'))
      ) {
        localStorage.removeItem(key);
      }
    }
  } catch {
    // ignore storage errors
  }
}

export function isAllowedApiOrigin(candidateUrl) {
  if (!candidateUrl || typeof candidateUrl !== 'string') return false;
  try {
    const base = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
    const parsed = new URL(candidateUrl, base);
    if (typeof window !== 'undefined' && parsed.origin === window.location.origin) {
      return true;
    }
    return ALLOWED_API_ORIGINS.includes(parsed.origin);
  } catch {
    return false;
  }
}

export function getApiBaseUrl() {
  if (typeof window !== 'undefined') {
    purgeLegacyStorageUrls();

    // Always prefer the same-origin proxy (/api/v1 on current window.location.origin)
    // unless a valid same-origin override is explicitly set
    const customUrl = localStorage.getItem('server_api_url') || localStorage.getItem('educonnect_server_url');
    if (customUrl && isAllowedApiOrigin(customUrl)) {
      try {
        const parsed = new URL(customUrl, window.location.origin);
        if (parsed.origin === window.location.origin) {
          const clean = customUrl.trim().replace(/\/+$/, '');
          return clean.endsWith('/api/v1') ? clean : `${clean}/api/v1`;
        }
      } catch {
        // fallback to window.location.origin
      }
    }

    return `${window.location.origin}/api/v1`;
  }

  return process.env.NEXT_PUBLIC_API_URL || DEFAULT_LOCAL_API;
}

export function setApiBaseUrl(url) {
  if (typeof window === 'undefined') return DEFAULT_LOCAL_API;
  if (!url || !isAllowedApiOrigin(url)) {
    localStorage.removeItem('server_api_url');
    localStorage.removeItem('educonnect_server_url');
    return getApiBaseUrl();
  }
  const clean = url.trim().replace(/\/+$/, '');
  const finalUrl = clean.endsWith('/api/v1') ? clean : `${clean}/api/v1`;
  localStorage.setItem('server_api_url', finalUrl);
  localStorage.setItem('educonnect_server_url', finalUrl);
  return finalUrl;
}

export function resetToDefaultWifi() {
  if (typeof window === 'undefined') return DEFAULT_LOCAL_API;
  localStorage.removeItem('server_api_url');
  localStorage.removeItem('educonnect_server_url');
  return getApiBaseUrl();
}

export async function probeServer(url, timeoutMs = 3500) {
  const target = url || getApiBaseUrl();
  if (!target || typeof target !== 'string' || !isAllowedApiOrigin(target)) {
    return { success: false };
  }
  try {
    const clean = target.trim().replace(/\/+$/, '');
    const healthUrl = clean.endsWith('/api/v1')
      ? clean.replace('/api/v1', '/api/health')
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
  purgeLegacyStorageUrls();
  const sameOriginApi = `${window.location.origin}/api/v1`;
  const res = await probeServer(sameOriginApi, 3500);
  if (res && res.success) {
    setApiBaseUrl(res.url);
    return { success: true, url: res.url, data: res.data };
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
