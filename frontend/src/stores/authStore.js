import { create } from 'zustand';
import api from '@/lib/api';

function purgeParallelRoleCaches() {
  if (typeof window === 'undefined') return;
  try {
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (
        k &&
        (k.startsWith('mgmt_teachers_') ||
          k.startsWith('mgmt_students_') ||
          k.startsWith('mgmt_classes_') ||
          k.startsWith('mgmt_parents_') ||
          k.startsWith('mock_'))
      ) {
        keysToRemove.push(k);
      }
    }
    keysToRemove.forEach((k) => localStorage.removeItem(k));
  } catch {
    // ignore storage errors
  }
}

const DEMO_ACCOUNTS = {
  admin: {
    phone: '09121110001',
    password: '123456',
    display_name: 'دکتر علیرضا تقوی',
    school_code: 'SCH-1001',
    redirect: '/dashboard/management/',
  },
  teacher: {
    phone: '09121110004',
    password: '123456',
    display_name: 'استاد مسعود اکبری',
    school_code: 'SCH-1001',
    redirect: '/dashboard/',
  },
  counselor: {
    phone: '09121110003',
    password: '123456',
    display_name: 'دکتر فاطمه صادقی',
    school_code: 'SCH-1001',
    redirect: '/dashboard/discipline/',
  },
  financial_officer: {
    phone: '09121110007',
    password: '123456',
    display_name: 'مهندس سعید رضایی',
    school_code: 'SCH-1001',
    redirect: '/dashboard/finance/',
  },
  student: {
    phone: '09351110001',
    password: '123456',
    display_name: 'امیرحسین حسینی',
    school_code: 'SCH-1001',
    redirect: '/dashboard/',
  },
  parent: {
    phone: '09122220001',
    password: '123456',
    student_code: 'STD-40301',
    display_name: 'حاج‌محمد حسینی (پدر امیرحسین)',
    school_code: 'SCH-1001',
    redirect: '/dashboard/',
  },
};

export const useAuthStore = create((set, get) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,
  locale: 'fa',

  initialize: async () => {
    try {
      if (typeof window === 'undefined') {
        set({ isLoading: false });
        return;
      }

      purgeParallelRoleCaches();

      const token = localStorage.getItem('accessToken');
      const savedLocale = localStorage.getItem('locale') || 'fa';
      set({ locale: savedLocale });

      if (!token) {
        localStorage.removeItem('user_profile');
        set({ isLoading: false, isAuthenticated: false, user: null });
        return;
      }

      const { data } = await api.get('/auth/profile');
      const profile = data.data;
      localStorage.setItem('user_profile', JSON.stringify(profile));
      set({
        user: profile,
        isAuthenticated: true,
        locale: profile.locale || savedLocale,
        isLoading: false,
      });
    } catch {
      if (typeof window !== 'undefined') {
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('user_profile');
      }
      set({ user: null, isAuthenticated: false, isLoading: false });
    }
  },

  registerSchool: async ({ school_name, school_level, city, admin_name, admin_phone, admin_password }) => {
    const { data } = await api.post('/auth/register-school', {
      school_name,
      school_level,
      city,
      admin_name,
      admin_phone,
      admin_password,
    });
    const { user, school, accessToken, refreshToken } = data.data;
    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('refreshToken', refreshToken);
    localStorage.setItem('user_profile', JSON.stringify(user));

    set({
      user,
      isAuthenticated: true,
      locale: user.locale || 'fa',
    });
    return { user, school };
  },

  quickEntry: async ({ display_name, phone, role, password, school_name, school_code, grades, subject }) => {
    const { data } = await api.post('/auth/quick-entry', {
      display_name,
      phone,
      role,
      password,
      school_name,
      school_code,
      grades,
      subject,
    });
    const { user, accessToken, refreshToken, isNew } = data.data;
    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('refreshToken', refreshToken);
    localStorage.setItem('user_profile', JSON.stringify(user));
    set({
      user,
      isAuthenticated: true,
      locale: user.locale || 'fa',
    });
    return { user, isNew };
  },

  login: async (identifier, password, captchaId = null, captchaAnswer = null, options = {}) => {
    const { data } = await api.post('/auth/login', {
      identifier,
      email: identifier,
      password,
      captchaId,
      captchaAnswer,
      school_id: options.school_id || undefined,
      school_code: options.school_code || undefined,
    });
    const { user, accessToken, refreshToken } = data.data;
    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('refreshToken', refreshToken);
    localStorage.setItem('user_profile', JSON.stringify(user));
    set({
      user,
      isAuthenticated: true,
      locale: user.locale || 'fa',
    });
    return user;
  },

  parentLogin: async ({ student_identifier, parent_name, parent_phone, relation, password, school_name }) => {
    const { data } = await api.post('/auth/parent-login', {
      student_identifier,
      parent_name,
      parent_phone,
      relation,
      password,
      school_name,
    });
    const { user, student, accessToken, refreshToken } = data.data;
    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('refreshToken', refreshToken);
    localStorage.setItem('user_profile', JSON.stringify(user));
    set({
      user,
      isAuthenticated: true,
      locale: user.locale || 'fa',
    });
    return { user, student };
  },

  demoLogin: async (role = 'admin') => {
    const account = DEMO_ACCOUNTS[role] || DEMO_ACCOUNTS.admin;
    const { data } = await api.post('/auth/login', {
      identifier: account.phone,
      email: account.phone,
      password: account.password,
      school_code: account.school_code,
    });
    const { user, accessToken, refreshToken } = data.data;
    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('refreshToken', refreshToken);
    localStorage.setItem('user_profile', JSON.stringify(user));
    set({
      user,
      isAuthenticated: true,
      locale: user.locale || 'fa',
    });
    return { user, redirect: account.redirect };
  },

  register: async (userData) => {
    const { data } = await api.post('/auth/register', userData);
    const { user, accessToken, refreshToken } = data.data;
    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('refreshToken', refreshToken);
    localStorage.setItem('user_profile', JSON.stringify(user));
    set({ user, isAuthenticated: true });
    return user;
  },

  logout: async () => {
    const refreshToken = typeof window !== 'undefined' ? localStorage.getItem('refreshToken') : null;
    try {
      await api.post('/auth/logout', { refreshToken });
    } catch {
      // Ignore network errors during logout cleanup
    }
    if (typeof window !== 'undefined') {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      localStorage.removeItem('user_profile');
      purgeParallelRoleCaches();
    }
    set({ user: null, isAuthenticated: false });
  },

  revokeAllSessions: async () => {
    await api.post('/auth/revoke-sessions');
    if (typeof window !== 'undefined') {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      localStorage.removeItem('user_profile');
    }
    set({ user: null, isAuthenticated: false });
  },

  updateProfile: async (updates) => {
    const { data } = await api.put('/auth/profile', updates);
    localStorage.setItem('user_profile', JSON.stringify(data.data));
    set({ user: data.data });
    return data.data;
  },

  refreshProfile: async () => {
    const { data } = await api.get('/auth/profile');
    localStorage.setItem('user_profile', JSON.stringify(data.data));
    set({ user: data.data });
    return data.data;
  },

  setLocale: (locale) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('locale', locale);
      document.documentElement.dir = locale === 'fa' ? 'rtl' : 'ltr';
      document.documentElement.lang = locale;
    }
    set({ locale });
  },

  t: (fa, en) => (get().locale === 'fa' ? fa : en),
}));

export default useAuthStore;

