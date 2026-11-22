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

  setUser: (user) => {
    if (typeof window !== 'undefined') {
      if (user) {
        localStorage.setItem('user_profile', JSON.stringify(user));
      } else {
        localStorage.removeItem('user_profile');
      }
    }
    set({ user, isAuthenticated: Boolean(user) });
  },

  fetchSchools: async (query = '') => {
    try {
      const params = query && String(query).trim() ? { q: String(query).trim() } : undefined;
      const { data } = await api.get('/auth/schools', { params });
      return data?.data || [];
    } catch {
      return [];
    }
  },

  findSchoolByUsername: async (username) => {
    const clean = String(username || '').trim().replace(/^@/, '');
    if (!clean) {
      throw new Error('نام کاربری مدرسه را وارد کنید');
    }
    const { data } = await api.get(`/auth/schools/by-username/${encodeURIComponent(clean)}`);
    return data?.data;
  },

  findStudentByUsername: async (username, schoolId = null) => {
    const clean = String(username || '').trim().replace(/^@/, '');
    if (!clean) {
      throw new Error('نام کاربری دانش‌آموز را وارد کنید');
    }
    const params = schoolId ? { school_id: schoolId } : undefined;
    const { data } = await api.get(`/auth/students/by-username/${encodeURIComponent(clean)}`, { params });
    return data?.data;
  },

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

      // Immediately hydrate from cached user_profile so route transitions never flash or block
      let cachedProfile = null;
      try {
        const rawCached = localStorage.getItem('user_profile');
        if (rawCached) {
          const parsed = JSON.parse(rawCached);
          if (parsed && parsed.id) {
            cachedProfile = parsed;
            set({
              user: parsed,
              isAuthenticated: true,
              locale: parsed.locale || savedLocale,
              isLoading: false,
            });
          }
        }
      } catch {
        // ignore invalid cached json
      }

      const { data } = await api.get('/auth/me');
      const profile = data?.data?.user || data?.data;
      if (!profile || !profile.id) {
        throw new Error('Invalid profile');
      }
      localStorage.setItem('user_profile', JSON.stringify(profile));
      set({
        user: profile,
        isAuthenticated: true,
        locale: profile.locale || savedLocale,
        isLoading: false,
      });
    } catch (err) {
      const status = err?.response?.status;
      // Only clear credentials if token is explicitly rejected (401/403) or no cached user exists
      if (status === 401 || status === 403 || !get().user) {
        if (typeof window !== 'undefined') {
          localStorage.removeItem('accessToken');
          localStorage.removeItem('refreshToken');
          localStorage.removeItem('user_profile');
        }
        set({ user: null, isAuthenticated: false, isLoading: false });
      } else {
        set({ isLoading: false });
      }
    }
  },

  registerSchool: async ({
    school_name,
    school_level,
    majors = [],
    city,
    admin_name,
    admin_phone,
    admin_password,
  }) => {
    const { data } = await api.post('/auth/register-school', {
      school_name,
      school_level,
      majors,
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
      isLoading: false,
      locale: user.locale || 'fa',
    });
    return { user, school, data: { user, school } };
  },

  registerStudent: async (payload) => {
    const { data } = await api.post('/auth/register-student', payload);
    const { user, student, school, accessToken, refreshToken } = data.data;
    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('refreshToken', refreshToken);
    localStorage.setItem('user_profile', JSON.stringify(user));

    set({
      user,
      isAuthenticated: true,
      isLoading: false,
      locale: user.locale || 'fa',
    });
    return { user, student, school, data: { user, student, school } };
  },

  registerTeacher: async (payload) => {
    const { data } = await api.post('/auth/register-teacher', payload);
    const { user, teacher, school, accessToken, refreshToken } = data.data;
    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('refreshToken', refreshToken);
    localStorage.setItem('user_profile', JSON.stringify(user));

    set({
      user,
      isAuthenticated: true,
      isLoading: false,
      locale: user.locale || 'fa',
    });
    return { user, teacher, school, data: { user, teacher, school } };
  },

  registerParent: async (payload) => {
    const { data } = await api.post('/auth/register-parent', payload);
    const { user, parent, student, school, accessToken, refreshToken } = data.data;
    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('refreshToken', refreshToken);
    localStorage.setItem('user_profile', JSON.stringify(user));

    set({
      user,
      isAuthenticated: true,
      isLoading: false,
      locale: user.locale || 'fa',
    });
    return { user, parent, student, school, data: { user, parent, student, school } };
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
      isLoading: false,
      locale: user.locale || 'fa',
    });
    return { user, isNew, data: { user, isNew } };
  },

  login: async (identifier, password, captchaId = null, captchaAnswer = null, options = {}) => {
    const { data } = await api.post('/auth/login', {
      identifier,
      password,
      captcha_id: captchaId || undefined,
      captcha_answer: captchaAnswer ?? undefined,
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
      isLoading: false,
      locale: user.locale || 'fa',
    });
    return { ...user, user, data: { user } };
  },

  parentLogin: async (arg1, arg2, arg3) => {
    let payload = {};
    if (typeof arg1 === 'string') {
      payload = {
        student_code: arg1,
        student_identifier: arg1,
        parent_name: typeof arg2 === 'string' ? arg2 : undefined,
        phone: typeof arg3 === 'string' ? arg3 : undefined,
      };
    } else if (arg1 && typeof arg1 === 'object') {
      const {
        student_identifier,
        student_code,
        parent_name,
        parent_phone,
        phone,
        relation,
        password,
        school_name,
        school_code,
        school_id,
      } = arg1;
      const resolvedCode = student_code || student_identifier;
      const resolvedPhone = phone || parent_phone;
      payload = {
        student_code: resolvedCode,
        student_identifier: resolvedCode,
        parent_name,
        phone: resolvedPhone,
        parent_phone: resolvedPhone,
        relation,
        password,
        school_name,
        school_code,
        school_id,
      };
    }

    const { data } = await api.post('/auth/parent-login', payload);
    const { user, student, accessToken, refreshToken } = data.data;
    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('refreshToken', refreshToken);
    localStorage.setItem('user_profile', JSON.stringify(user));
    set({
      user,
      isAuthenticated: true,
      isLoading: false,
      locale: user.locale || 'fa',
    });
    return { user, student, message: data.message, data: { user, student } };
  },

  demoLogin: async (role = 'admin') => {
    const account = DEMO_ACCOUNTS[role] || DEMO_ACCOUNTS.admin;
    let resData = null;
    try {
      const { data } = await api.post('/auth/demo-login', { role });
      resData = data.data;
    } catch {
      const { data } = await api.post('/auth/login', {
        identifier: account.phone,
        password: account.password,
        school_code: account.school_code,
      });
      resData = data.data;
    }
    const { user, accessToken, refreshToken } = resData;
    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('refreshToken', refreshToken);
    localStorage.setItem('user_profile', JSON.stringify(user));
    set({
      user,
      isAuthenticated: true,
      isLoading: false,
      locale: user.locale || 'fa',
    });
    return { user, redirect: account.redirect, data: { user, redirect: account.redirect } };
  },

  register: async (userData) => {
    const { data } = await api.post('/auth/register', userData);
    const { user, accessToken, refreshToken } = data.data;
    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('refreshToken', refreshToken);
    localStorage.setItem('user_profile', JSON.stringify(user));
    set({ user, isAuthenticated: true, isLoading: false });
    return { ...user, user, data: { user } };
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
    const profile = data?.data?.user || data?.data;
    localStorage.setItem('user_profile', JSON.stringify(profile));
    set({ user: profile });
    return profile;
  },

  refreshProfile: async () => {
    const { data } = await api.get('/auth/me');
    const profile = data?.data?.user || data?.data;
    localStorage.setItem('user_profile', JSON.stringify(profile));
    set({ user: profile });
    return profile;
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

