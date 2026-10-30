import axios from 'axios';

export const DEFAULT_LOCAL_API = 'http://192.168.1.104/api/v1';
export const DEFAULT_TUNNEL_API = 'https://xpbov-89-43-89-22.run.pinggy-free.link/api/v1';

export function getApiBaseUrl() {
  if (typeof window !== 'undefined') {
    const customUrl = localStorage.getItem('server_api_url') || localStorage.getItem('educonnect_server_url');
    if (customUrl) {
      let clean = customUrl.trim().replace(/\/+$/, '');
      if (clean.includes(':5000')) clean = clean.replace(':5000', '');
      return clean.endsWith('/api/v1') ? clean : `${clean}/api/v1`;
    }

    const host = window.location.hostname;
    // When accessed from a browser on the local network (e.g. http://192.168.1.108)
    if (host && host !== 'localhost' && host !== '127.0.0.1') {
      const portPart = window.location.port ? `:${window.location.port}` : '';
      return `${window.location.protocol}//${host}${portPart}/api/v1`;
    }
  }

  return process.env.NEXT_PUBLIC_API_URL || DEFAULT_LOCAL_API;
}

export function setApiBaseUrl(url) {
  if (typeof window === 'undefined') return;
  if (!url) {
    localStorage.removeItem('server_api_url');
    localStorage.removeItem('educonnect_server_url');
    return DEFAULT_LOCAL_API;
  }
  let clean = url.trim().replace(/\/+$/, '');
  const finalUrl = clean.endsWith('/api/v1') ? clean : `${clean}/api/v1`;
  localStorage.setItem('server_api_url', finalUrl);
  localStorage.setItem('educonnect_server_url', finalUrl);
  return finalUrl;
}

export function resetToDefaultWifi() {
  if (typeof window === 'undefined') return DEFAULT_LOCAL_API;
  localStorage.removeItem('server_api_url');
  localStorage.removeItem('educonnect_server_url');
  localStorage.setItem('server_api_url', DEFAULT_LOCAL_API);
  return DEFAULT_LOCAL_API;
}

export async function probeServer(url) {
  try {
    const clean = url.trim().replace(/\/+$/, '');
    const testUrl = clean.endsWith('/api/v1') ? `${clean}/system/app-version` : `${clean}/api/v1/system/app-version`;
    const res = await axios.get(testUrl, {
      timeout: 8000,
    });
    if (res.status === 200 || (res.data && res.data.success)) {
      return { success: true, data: res.data };
    }
  } catch (e) {
    try {
      const clean = url.trim().replace(/\/+$/, '');
      const healthUrl = clean.endsWith('/api/v1') ? clean.replace('/api/v1', '/api/health') : `${clean}/api/health`;
      const res2 = await axios.get(healthUrl, { timeout: 6000 });
      if (res2.status === 200 || (res2.data && res2.data.success)) {
        return { success: true, data: res2.data };
      }
    } catch (e2) {}
    return { success: false, error: e.message };
  }
  return { success: false };
}

export async function autoDetectServer() {
  if (typeof window === 'undefined') return { success: false };
  const current = localStorage.getItem('server_api_url');
  const candidates = [
    DEFAULT_LOCAL_API,
    'http://192.168.1.108/api/v1',
    DEFAULT_TUNNEL_API,
    current,
  ].filter(Boolean);

  // Remove duplicates
  const uniqueCandidates = [...new Set(candidates)];

  for (const url of uniqueCandidates) {
    const result = await probeServer(url);
    if (result.success) {
      const clean = url.trim().replace(/\/+$/, '');
      const finalBase = clean.endsWith('/api/v1') ? clean : `${clean}/api/v1`;
      setApiBaseUrl(finalBase);
      return { success: true, url: finalBase, data: result.data };
    }
  }
  return { success: false };
}

const api = axios.create({
  baseURL: getApiBaseUrl(),
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor — attach token and dynamic baseURL
api.interceptors.request.use(
  (config) => {
    config.baseURL = getApiBaseUrl();
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem('accessToken');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    }
    // If uploading FormData, delete Content-Type so browser/Axios sets boundary multipart correctly
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

// Response interceptor — handle token refresh and network failover
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // 1. Automatic Network Failover (Switch between local Wi-Fi and online Pinggy tunnel)
    if (!error.response && !originalRequest._retryNetwork && typeof window !== 'undefined') {
      originalRequest._retryNetwork = true;
      const currentUrl = getApiBaseUrl();
      const fallbackUrl = currentUrl.includes('pinggy') ? DEFAULT_LOCAL_API : DEFAULT_TUNNEL_API;

      const probe = await probeServer(fallbackUrl);
      if (probe.success) {
        localStorage.setItem('server_api_url', fallbackUrl);
        originalRequest.baseURL = fallbackUrl;
        return api(originalRequest);
      }
    }

    // 2. Token refresh handler
    if (error.response?.status === 401 && error.response?.data?.code === 'TOKEN_EXPIRED' && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        const refreshToken = localStorage.getItem('refreshToken');
        if (!refreshToken) throw new Error('No refresh token');

        const currentBaseUrl = getApiBaseUrl();
        const { data } = await axios.post(`${currentBaseUrl}/auth/refresh`, { refreshToken });
        localStorage.setItem('accessToken', data.data.accessToken);
        localStorage.setItem('refreshToken', data.data.refreshToken);

        originalRequest.headers.Authorization = `Bearer ${data.data.accessToken}`;
        return api(originalRequest);
      } catch (refreshError) {
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        if (typeof window !== 'undefined') {
          window.location.href = '/login/';
        }
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

export default api;
