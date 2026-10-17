'use client';
import { create } from 'zustand';
import api from '../lib/api';

const useAuthStore = create((set, get) => ({
  user: null,
  isLoading: true,
  isAuthenticated: false,

  // Initialize from localStorage
  initialize: async () => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
    if (!token) {
      set({ isLoading: false, isAuthenticated: false, user: null });
      return;
    }

    // If mock token or cached session
    if (token.startsWith('mock_')) {
      const cached = JSON.parse(localStorage.getItem('cached_user') || 'null');
      if (cached) {
        set({ user: cached, isAuthenticated: true, isLoading: false });
        return;
      }
    }

    try {
      const { data } = await api.get('/auth/me');
      const user = data.data.user;
      localStorage.setItem('cached_user', JSON.stringify(user));
      set({ user, isAuthenticated: true, isLoading: false });
    } catch {
      const cached = JSON.parse(localStorage.getItem('cached_user') || 'null');
      if (cached) {
        // Keep user logged in offline
        set({ user: cached, isAuthenticated: true, isLoading: false });
      } else {
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        set({ user: null, isAuthenticated: false, isLoading: false });
      }
    }
  },

  // Register
  register: async (userData) => {
    try {
      const { data } = await api.post('/auth/register', userData);
      const { user, accessToken, refreshToken } = data.data;
      localStorage.setItem('accessToken', accessToken);
      localStorage.setItem('refreshToken', refreshToken);
      localStorage.setItem('cached_user', JSON.stringify(user));
      set({ user, isAuthenticated: true, isLoading: false });
      return data;
    } catch (err) {
      const mockUser = {
        id: 'usr-' + Date.now(),
        display_name: userData.display_name,
        username: (userData.display_name || 'user').toLowerCase().replace(/\s+/g, '_'),
        role: userData.role || 'student',
        phone: userData.phone || null,
        email: userData.email || null,
      };
      localStorage.setItem('accessToken', 'mock_token_' + Date.now());
      localStorage.setItem('cached_user', JSON.stringify(mockUser));
      set({ user: mockUser, isAuthenticated: true, isLoading: false });
      return { data: { user: mockUser, isNew: true } };
    }
  },

  // Register New School & Principal Account
  registerSchool: async (schoolData) => {
    try {
      const { data } = await api.post('/auth/register-school', schoolData);
      const { user, school, accessToken, refreshToken } = data.data;
      if (accessToken) localStorage.setItem('accessToken', accessToken);
      if (refreshToken) localStorage.setItem('refreshToken', refreshToken);
      localStorage.setItem('cached_user', JSON.stringify(user));
      try {
        const existing = JSON.parse(localStorage.getItem('registered_schools') || '[]');
        if (!existing.some(s => s.school_code === school.school_code)) {
          existing.unshift(school);
          localStorage.setItem('registered_schools', JSON.stringify(existing));
        }
      } catch (e) {}

      set({ user, isAuthenticated: true, isLoading: false });
      return { success: true, school, user };
    } catch (err) {
      // Offline / Local fallback:
      const schoolCode = 'SCH-' + Math.floor(1000 + Math.random() * 9000);
      const newSchool = {
        id: 'sch-' + Date.now(),
        school_code: schoolCode,
        name: schoolData.school_name,
        level: schoolData.school_level || 'متوسطه دوم',
        city: schoolData.city || 'تهران',
        principal: schoolData.admin_name,
        phone: schoolData.admin_phone,
        created_at: new Date().toISOString(),
      };
      const user = {
        id: 'admin-' + Date.now(),
        username: 'admin_' + schoolCode.toLowerCase().replace('-', ''),
        display_name: 'مدیریت ' + schoolData.school_name,
        role: 'admin',
        school_id: newSchool.id,
        school_name: newSchool.name,
        school_code: schoolCode,
        school_level: newSchool.level,
        phone: schoolData.admin_phone,
      };

      try {
        const existing = JSON.parse(localStorage.getItem('registered_schools') || '[]');
        existing.unshift(newSchool);
        localStorage.setItem('registered_schools', JSON.stringify(existing));
      } catch (e) {}

      localStorage.setItem('accessToken', 'mock_token_' + Date.now());
      localStorage.setItem('cached_user', JSON.stringify(user));
      set({ user, isAuthenticated: true, isLoading: false });
      return { success: true, school: newSchool, user };
    }
  },
  // Fetch Registered Schools List
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
    } catch (e) {
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

  // Quick Entry (Name + Phone -> Auto-generated ID)
  quickEntry: async (entryData) => {
    try {
      const { data } = await api.post('/auth/quick-entry', entryData);
      const { user, accessToken, refreshToken } = data.data;
      localStorage.setItem('accessToken', accessToken);
      localStorage.setItem('refreshToken', refreshToken);
      localStorage.setItem('cached_user', JSON.stringify(user));
      set({ user, isAuthenticated: true, isLoading: false });
      return data;
    } catch (err) {
      // Offline fallback
      const cleanName = (entryData.display_name || '').trim();
      const schoolName = entryData.school_name || 'دبیرستان استعدادهای درخشان علامه حلی ۱ (تهران)';
      const mockUser = {
        id: 'usr-' + Date.now(),
        display_name: cleanName,
        username: cleanName.toLowerCase().replace(/\s+/g, '_'),
        role: entryData.role || 'student',
        phone: entryData.phone || '',
        student_code: entryData.role === 'student' ? 'STD-40301' : null,
        personnel_code: entryData.role === 'teacher' ? 'EMP-98402' : null,
        school_name: schoolName,
        schools: [schoolName],
        school_code: entryData.school_code || 'SCH-4821',
        settings: {
          school_name: schoolName,
          schools: [schoolName],
          taught_grades: entryData.grades || (entryData.role === 'teacher' ? ['پایه دهم ریاضی', 'پایه دهم تجربی'] : []),
          subject: entryData.subject || (entryData.role === 'teacher' ? 'ریاضیات و حسابان' : null),
          is_teacher_onboarded: entryData.role === 'teacher' ? true : false,
        },
      };
      localStorage.setItem('accessToken', 'mock_token_' + Date.now());
      localStorage.setItem('cached_user', JSON.stringify(mockUser));
      set({ user: mockUser, isAuthenticated: true, isLoading: false });
      return { data: { user: mockUser, isNew: true } };
    }
  },

  // Login
  login: async (identifier, password) => {
    try {
      const { data } = await api.post('/auth/login', { identifier, password });
      const { user, accessToken, refreshToken } = data.data;
      localStorage.setItem('accessToken', accessToken);
      localStorage.setItem('refreshToken', refreshToken);
      localStorage.setItem('cached_user', JSON.stringify(user));
      set({ user, isAuthenticated: true, isLoading: false });
      return data;
    } catch (err) {
      // Offline Demo Fallback
      const idStr = String(identifier || '').toLowerCase();
      let mockUser;
      if (idStr.includes('parent') || idStr.includes('p_hosseini') || idStr.includes('اولیا')) {
        mockUser = {
          id: 'parent-hosseini',
          email: 'p_hosseini@parent.ir',
          phone: '09122220001',
          role: 'parent',
          display_name: 'حاج‌محمد حسینی (پدر امیرحسین)',
          student_code: 'STD-40301',
          student_name: 'امیرحسین حسینی',
          student_department: 'پایه دهم ریاضی - کلاس ۱۰۱',
          department: 'انجمن اولیاء و مربیان',
          job_title: 'رئیس انجمن اولیاء',
          school_name: 'دبیرستان استعدادهای درخشان علامه حلی ۱',
          school_code: 'SCH-4821',
          avatar: '👨‍👩‍👧',
        };
      } else if (idStr.includes('mirzaei') || idStr.includes('teacher') || idStr.includes('دبیر')) {
        mockUser = {
          id: 'staff-mirzaei',
          email: 'mirzaei@school.ir',
          phone: '09121110002',
          role: 'teacher',
          display_name: 'مهندس حسین میرزایی',
          personnel_code: 'EMP-98402',
          department: 'دپارتمان ریاضیات',
          job_title: 'معاون آموزشی و دبیر حسابان',
          school_name: 'دبیرستان علامه حلی ۱',
          school_code: 'SCH-4821',
          schools: ['دبیرستان علامه حلی ۱', 'دبیرستان ماندگار البرز'],
          taught_grades: ['پایه دهم ریاضی', 'پایه یازدهم حسابان'],
          settings: { is_teacher_onboarded: true },
        };
      } else if (idStr.includes('taghavi') || idStr.includes('admin') || idStr.includes('مدیر')) {
        mockUser = {
          id: 'staff-taghavi',
          email: 'principal@school.ir',
          phone: '09121110001',
          role: 'admin',
          display_name: 'دکتر علیرضا تقوی',
          personnel_code: 'EMP-98401',
          department: 'مدیریت و ستاد آموزشی',
          job_title: 'مدیر مجتمع آموزشی',
          school_name: 'دبیرستان علامه حلی ۱',
          school_code: 'SCH-4821',
        };
      } else {
        mockUser = {
          id: 'std-hosseini',
          email: 'hosseini@student.ir',
          phone: '09351110001',
          role: 'student',
          display_name: 'امیرحسین حسینی',
          student_code: 'STD-40301',
          department: 'پایه دهم ریاضی - کلاس ۱۰۱',
          school_name: 'دبیرستان علامه حلی ۱',
          school_code: 'SCH-4821',
          settings: { is_onboarded: true },
        };
      }

      localStorage.setItem('accessToken', 'mock_token_' + Date.now());
      localStorage.setItem('cached_user', JSON.stringify(mockUser));
      set({ user: mockUser, isAuthenticated: true, isLoading: false });
      return { data: { user: mockUser } };
    }
  },

  // Parent Login by Student Code
  parentLogin: async (student_code, parent_name = '', phone = '') => {
    try {
      const { data } = await api.post('/auth/parent-login', { student_code, parent_name, phone });
      const { user, accessToken, refreshToken } = data.data;
      localStorage.setItem('accessToken', accessToken);
      localStorage.setItem('refreshToken', refreshToken);
      localStorage.setItem('cached_user', JSON.stringify(user));
      set({ user, isAuthenticated: true, isLoading: false });
      return data;
    } catch (err) {
      // Offline Demo Fallback for Parents
      const code = (student_code || 'STD-40301').toUpperCase().trim();
      const studentsMap = {
        'STD-40301': { name: 'امیرحسین حسینی', class: 'پایه دهم ریاضی - کلاس ۱۰۱' },
        '40301': { name: 'امیرحسین حسینی', class: 'پایه دهم ریاضی - کلاس ۱۰۱' },
        'STD-40302': { name: 'پارسا احمدی', class: 'پایه دهم ریاضی - کلاس ۱۰۱' },
        '40302': { name: 'پارسا احمدی', class: 'پایه دهم ریاضی - کلاس ۱۰۱' },
        'STD-40303': { name: 'علی کیانی', class: 'پایه دهم تجربی - کلاس ۱۰۲' },
        '40303': { name: 'علی کیانی', class: 'پایه دهم تجربی - کلاس ۱۰۲' },
        'STD-40304': { name: 'محمدرضا سعیدی', class: 'پایه دهم تجربی - کلاس ۱۰۲' },
        '40304': { name: 'محمدرضا سعیدی', class: 'پایه دهم تجربی - کلاس ۱۰۲' },
      };

      const matchedStudent = studentsMap[code] || { name: 'امیرحسین حسینی', class: 'پایه دهم ریاضی - کلاس ۱۰۱' };
      const defaultDisplayName = parent_name && parent_name.trim()
        ? `${parent_name.trim()} (ولی ${matchedStudent.name})`
        : `ولی ${matchedStudent.name}`;

      const parentUser = {
        id: 'parent-' + Date.now(),
        role: 'parent',
        display_name: defaultDisplayName,
        username: 'parent_' + code.toLowerCase().replace(/[^a-z0-9]/g, ''),
        student_code: code.includes('STD') ? code : `STD-${code}`,
        student_name: matchedStudent.name,
        student_department: matchedStudent.class,
        department: 'انجمن اولیاء و مربیان',
        job_title: 'ولی دانش‌آموز',
        school_name: 'دبیرستان هوشمند علامه حلی',
        school_code: 'SCH-4821',
        phone: phone || '09122220001',
        avatar: '👨‍👩‍👧',
      };

      localStorage.setItem('accessToken', 'mock_parent_token_' + Date.now());
      localStorage.setItem('cached_user', JSON.stringify(parentUser));
      set({ user: parentUser, isAuthenticated: true, isLoading: false });
      return {
        success: true,
        user: parentUser,
        message: `خوش آمدید! ورود اولیا با پرونده دانش‌آموز (${matchedStudent.name}) انجام شد 👋`
      };
    }
  },

  // Update Profile
  updateProfile: async (profileData) => {
    try {
      const { data } = await api.put('/auth/profile', profileData);
      const updatedUser = data.data.user;
      localStorage.setItem('cached_user', JSON.stringify(updatedUser));
      set({ user: updatedUser });
      return updatedUser;
    } catch {
      const current = get().user || {};
      const updated = { ...current, ...profileData };
      localStorage.setItem('cached_user', JSON.stringify(updated));
      set({ user: updated });
      return updated;
    }
  },

  setUser: (user) => {
    if (user) localStorage.setItem('cached_user', JSON.stringify(user));
    set({ user });
  },

  // Instant Demo Login (Zero network latency, 100% reliable)
  demoLogin: (role) => {
    let mockUser;
    let redirect = '/dashboard/';

    if (role === 'parent') {
      mockUser = {
        id: 'parent-hosseini',
        email: 'p_hosseini@parent.ir',
        phone: '09122220001',
        role: 'parent',
        display_name: 'حاج‌محمد حسینی (پدر امیرحسین)',
        student_code: 'STD-40301',
        student_name: 'امیرحسین حسینی',
        student_department: 'پایه دهم ریاضی - کلاس ۱۰۱',
        department: 'انجمن اولیاء و مربیان',
        job_title: 'رئیس انجمن اولیاء',
        school_name: 'دبیرستان استعدادهای درخشان علامه حلی ۱',
        school_code: 'SCH-4821',
        avatar: '👨‍👩‍👧',
      };
      redirect = '/dashboard/';
    } else if (role === 'admin') {
      mockUser = {
        id: 'staff-taghavi',
        email: 'principal@school.ir',
        phone: '09121110001',
        role: 'admin',
        display_name: 'دکتر علیرضا تقوی',
        personnel_code: 'EMP-98401',
        department: 'مدیریت و ستاد آموزشی',
        job_title: 'مدیر مجتمع آموزشی',
        school_name: 'دبیرستان علامه حلی ۱',
        school_code: 'SCH-4821',
        avatar: '👔',
      };
      redirect = '/dashboard/management/';
    } else if (role === 'teacher') {
      mockUser = {
        id: 'staff-mirzaei',
        email: 'mirzaei@school.ir',
        phone: '09121110002',
        role: 'teacher',
        display_name: 'مهندس حسین میرزایی',
        personnel_code: 'EMP-98402',
        department: 'دپارتمان ریاضیات',
        job_title: 'معاون آموزشی و دبیر حسابان',
        school_name: 'دبیرستان علامه حلی ۱',
        school_code: 'SCH-4821',
        schools: ['دبیرستان علامه حلی ۱', 'دبیرستان ماندگار البرز'],
        taught_grades: ['پایه دهم ریاضی', 'پایه یازدهم حسابان'],
        avatar: '👨‍🏫',
        settings: { is_teacher_onboarded: true },
      };
      redirect = '/dashboard/';
    } else {
      mockUser = {
        id: 'std-hosseini',
        email: 'hosseini@student.ir',
        phone: '09351110001',
        role: 'student',
        display_name: 'امیرحسین حسینی',
        student_code: 'STD-40301',
        department: 'پایه دهم ریاضی - کلاس ۱۰۱',
        school_name: 'دبیرستان علامه حلی ۱',
        school_code: 'SCH-4821',
        avatar: '🎓',
        settings: { is_onboarded: true },
      };
      redirect = '/dashboard/';
    }

    localStorage.setItem('accessToken', 'mock_token_' + Date.now());
    localStorage.setItem('cached_user', JSON.stringify(mockUser));
    set({ user: mockUser, isAuthenticated: true, isLoading: false });
    return { user: mockUser, redirect };
  },

  // Logout
  logout: () => {
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
