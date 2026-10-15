'use client';
import { create } from 'zustand';
import api from '../lib/api';

const useClassStore = create((set, get) => ({
  classes: [],
  currentClass: null,
  isLoading: false,

  fetchClasses: async () => {
    set({ isLoading: true });
    try {
      const { data } = await api.get('/classes');
      set({ classes: data.data.classes, isLoading: false });
    } catch {
      set({ isLoading: false });
    }
  },

  fetchClassById: async (id) => {
    try {
      const { data } = await api.get(`/classes/${id}`);
      set({ currentClass: data.data.class });
      return data.data.class;
    } catch {
      return null;
    }
  },

  createClass: async (classData) => {
    const { data } = await api.post('/classes', classData);
    const newClass = data.data.class;
    set((state) => ({ classes: [newClass, ...state.classes] }));
    return newClass;
  },

  joinClass: async (joinCode) => {
    const { data } = await api.post('/classes/join', { join_code: joinCode });
    get().fetchClasses();
    return data.data.class;
  },

  deleteClass: async (classId) => {
    await api.delete(`/classes/${classId}`);
    set((state) => ({
      classes: state.classes.filter((c) => c.id !== classId),
      currentClass: state.currentClass?.id === classId ? null : state.currentClass,
    }));
  },
}));

export default useClassStore;
