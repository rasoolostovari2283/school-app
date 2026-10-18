import axios from 'axios';

export function getApiBaseUrl() {
  if (typeof window !== 'undefined') {
    const customUrl = localStorage.getItem('server_api_url') || localStorage.getItem('educonnect_server_url');
    if (customUrl) {
      let clean = customUrl.replace(/\/+$/, '');
      if (clean.includes(':3000')) clean = clean.replace(':3000', ':5000');
      if (clean.includes(':3001')) clean = clean.replace(':3001', ':5000');
      return clean + (clean.includes('/api/v1') ? '' : '/api/v1');
    }

    const host = window.location.hostname;
    // When accessed from a mobile phone / other device on the LAN
    if (host && host !== 'localhost' && host !== '127.0.0.1') {
      return `${window.location.protocol}//${host}:5000/api/v1`;
    }
  }

  return process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api/v1';
}

const api = axios.create({
  baseURL: getApiBaseUrl(),
  timeout: 15000,
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
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor — handle token refresh
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

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
