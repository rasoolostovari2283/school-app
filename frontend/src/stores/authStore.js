'use client';
import { create } from 'zustand';
import api from '../lib/api';

const useAuthStore = create((set, get) => ({
  user: null,
  isLoading: true,
  isAuthenticated: false,

  initialize: async () => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
    if (!token || token.startsWith('mock_')) {
      if (typeof window !== 'undefined' && token && token.startsWith('mock_')) {
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('cached_user');
      }
      set({ isLoading: false, isAuthenticated: false, user: null });
      return;
    }

    try {
      const { data } = await api.get('/auth/me');
      const user = data.data.user;
      if (!user.original_role) user.original_role = user.role;
      localStorage.setItem('cached_user', JSON.stringify(user));
      set({ user, isAuthenticated: true, isLoading: false });
    } catch {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      localStorage.removeItem('cached_user');
      set({ user: null, isAuthenticated: false, isLoading: false });
    }
  },

  register: async (userData) => {
    const { data } = await api.post('/auth/register', userData);
    const { user, accessToken, refreshToken } = data.data;
    if (!user.original_role) user.original_role = user.role;
    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('refreshToken', refreshToken);
    localStorage.setItem('cached_user', JSON.stringify(user));
    set({ user, isAuthenticated: true, isLoading: false });
    return data;
  },

  registerSchool: async (schoolData) => {
    const { data } = await api.post('/auth/register-school', schoolData);
    const { user, school, accessToken, refreshToken } = data.data;
    if (accessToken) localStorage.setItem('accessToken', accessToken);
    if (refreshToken) localStorage.setItem('refreshToken', refreshToken);
    localStorage.setItem('cached_user', JSON.stringify(user));
    try {
      const existing = JSON.parse(localStorage.getItem('registered_schools') || '[]');
      if (!existing.some((s) => s.school_code === school.school_code)) {
        existing.unshift(school);
        localStorage.setItem('registered_schools', JSON.stringify(existing));
      }
    } catch (_e) {}

    set({ user, isAuthenticated: true, isLoading: false });
    return { success: true, school, user };
  },

  fetchSchools: async () => {
    let apiSchools = [];
    try {
      const res = await api.get('/auth/schools');
      if (res.data?.success && Array.isArray(res.data.data)) {
        apiSchools = res.data.data;
      }
    } catch (e) {
      console.warn('Could not fetch schools from API:', e.message);
    }

    let localSchools = [];
    try {
      localSchools = JSON.parse(localStorage.getItem('registered_schools') || '[]');
    } catch (_e) {
      localSchools = [];
    }

    const schoolMap = new Map();
    localSchools.forEach((s) => {
      const cleanName = s.name || s.school_name;
      if (cleanName) {
        schoolMap.set(cleanName, {
          id: s.school_code || s.id || cleanName,
          name: cleanName,
          code: s.school_code || s.code || '',
          city: s.city || 'ایران',
          level: s.level || s.school_level || 'متوسطه دوم',
          is_registered: true,
        });
      }
    });

    apiSchools.forEach((s) => {
      if (s.name && !schoolMap.has(s.name)) {
        schoolMap.set(s.name, s);
      }
    });

    return Array.from(schoolMap.values());
  },

  quickEntry: async (entryData) => {
    const { data } = await api.post('/auth/quick-entry', entryData);
    const { user, accessToken, refreshToken } = data.data;
    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('refreshToken', refreshToken);
    localStorage.setItem('cached_user', JSON.stringify(user));
    set({ user, isAuthenticated: true, isLoading: false });
    return data;
  },

  login: async (identifier, password) => {
    const { data } = await api.post('/auth/login', { identifier, password });
    const { user, accessToken, refreshToken } = data.data;
    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('refreshToken', refreshToken);
    localStorage.setItem('cached_user', JSON.stringify(user));
    set({ user, isAuthenticated: true, isLoading: false });
    return data;
  },

  parentLogin: async (student_code, parent_name = '', phone = '') => {
    const rawCheck = (student_code || '').trim().toUpperCase();
    if (rawCheck.startsWith('SCH-')) {
      throw {
        response: {
          data: {
            message: 'کد «' + rawCheck + '» کد اختصاصی مدرسه و مدیریت است. لطفاً از تب ورود سریع یا ورود با نام کاربری استفاده فرمایید.',
          },
        },
      };
    }
    const { data } = await api.post('/auth/parent-login', { student_code, parent_name, phone });
    const { user, accessToken, refreshToken } = data.data;
    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('refreshToken', refreshToken);
    localStorage.setItem('cached_user', JSON.stringify(user));
    set({ user, isAuthenticated: true, isLoading: false });
    return data;
  },

  updateProfile: async (profileData) => {
    const { data } = await api.put('/auth/profile', profileData);
    const updatedUser = data.data.user;
    localStorage.setItem('cached_user', JSON.stringify(updatedUser));
    set({ user: updatedUser });
    return updatedUser;
  },

  changePassword: async ({ current_password, new_password }) => {
    const { data } = await api.post('/auth/change-password', { current_password, new_password });
    return data;
  },

  setUser: (user) => {
    if (user) localStorage.setItem('cached_user', JSON.stringify(user));
    set({ user });
  },

  logout: async () => {
    try {
      await api.post('/auth/logout');
    } catch (_e) {
      // Best-effort server cookie clear
    }
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('cached_user');
    set({ user: null, isAuthenticated: false });
    if (typeof window !== 'undefined') {
      window.location.href = '/login/';
    }
  },
}));

export default useAuthStore;
