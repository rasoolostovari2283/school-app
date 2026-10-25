'use client';
import { useState, useEffect, useRef } from 'react';
import useAuthStore from '../../../stores/authStore';
import api from '../../../lib/api';
import toast from 'react-hot-toast';
import {
  HiOutlinePlus,
  HiOutlinePlay,
  HiOutlineXMark,
  HiOutlineCloudArrowUp,
  HiOutlinePhoto,
  HiOutlineFilm,
  HiOutlineEye,
  HiOutlineClock,
  HiOutlineUser,
  HiOutlineFolder,
  HiOutlineFolderPlus,
  HiOutlineFolderOpen,
  HiOutlineTrash,
  HiOutlineArrowsRightLeft,
  HiOutlineArrowDownTray,
  HiOutlinePaperClip,
} from 'react-icons/hi2';
import { FaFilePdf } from 'react-icons/fa6';
import styles from './videos.module.css';

const API_BASE_HOST = process.env.NEXT_PUBLIC_API_HOST || 'http://localhost:5000';

const PRESET_FOLDER_COLORS = [
  '#6366f1', // Indigo
  '#10b981', // Emerald
  '#f59e0b', // Amber
  '#ec4899', // Pink
  '#06b6d4', // Cyan
  '#8b5cf6', // Violet
  '#ea580c', // Orange
];

export default function VideosPage() {
  const { user } = useAuthStore();
  const isTeacher = user?.role === 'teacher';
  const isAdmin = user?.role === 'admin' || user?.role === 'manager';
  const canManage = isTeacher || isAdmin;

  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all'); // all | video | image | olympiad
  const [audienceFilter, setAudienceFilter] = useState('all'); // all | teachers | students | parents

  // Folders State (فایل‌بندی دروس و مباحث)
  const [folders, setFolders] = useState([
    { name: 'عمومی', color: '#6366f1', count: 0 },
    { name: 'حسابان ۲', color: '#10b981', count: 1 },
    { name: 'فیزیک پیشرفته', color: '#f59e0b', count: 1 },
    { name: 'شیمی یازدهم', color: '#ec4899', count: 1 },
  ]);
  const [selectedFolder, setSelectedFolder] = useState('all'); // 'all' or folder name

  // Modals
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showNewFolderModal, setShowNewFolderModal] = useState(false);
  const [activeMedia, setActiveMedia] = useState(null); // active media for player modal

  // Target Audience Change Modal for Admin/Teacher
  const [audienceEditModalVideo, setAudienceEditModalVideo] = useState(null);
  const [editAudienceVal, setEditAudienceVal] = useState('all');

  // Move Video Modal State (انتقال ویدیو به پوشه دیگر)
  const [movingVideo, setMovingVideo] = useState(null);
  const [targetMoveFolder, setTargetMoveFolder] = useState('عمومی');
  const [isMoveCreatingFolder, setIsMoveCreatingFolder] = useState(false);
  const [inlineMoveNewFolder, setInlineMoveNewFolder] = useState('');
  const [isMovingSubmitting, setIsMovingSubmitting] = useState(false);

  // Attach PDF Modal State (پیوست جزوه یا فایل PDF به ویدیو)
  const [attachingPdfVideo, setAttachingPdfVideo] = useState(null);
  const [selectedPdfFile, setSelectedPdfFile] = useState(null);
  const [isAttachingPdf, setIsAttachingPdf] = useState(false);

  // New Folder Modal State
  const [newFolderNameInput, setNewFolderNameInput] = useState('');
  const [newFolderColorInput, setNewFolderColorInput] = useState('#6366f1');

  // Upload Form State
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadDesc, setUploadDesc] = useState('');
  const [uploadCategory, setUploadCategory] = useState('تدریس');
  const [uploadFolder, setUploadFolder] = useState('عمومی');
  const [uploadAudience, setUploadAudience] = useState('all'); // 'all' | 'teachers' | 'students' | 'parents'
  const [isCreatingFolderInline, setIsCreatingFolderInline] = useState(false);
  const [inlineNewFolderName, setInlineNewFolderName] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [filePreview, setFilePreview] = useState(null);
  const [uploadPdfFile, setUploadPdfFile] = useState(null); // PDF attachment during upload
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef(null);

  const AUDIENCE_OPTIONS = [
    { id: 'all', label: 'هر سه گروه (عمومی)', desc: 'معلمان، دانش‌آموزان و اولیا', icon: '👥', color: '#6366f1' },
    { id: 'teachers', label: 'ویژه معلمان', desc: 'فقط دبیران و کادر آموزشی', icon: '👨‍🏫', color: '#10b981' },
    { id: 'students', label: 'ویژه دانش‌آموزان', desc: 'فقط دانش‌آموزان مدرسه', icon: '🎓', color: '#06b6d4' },
    { id: 'parents', label: 'ویژه اولیا', desc: 'فقط اولیا و خانواده‌ها', icon: '👨‍👩‍👧', color: '#f59e0b' },
  ];

  const getAudienceInfo = (aud) => {
    switch (aud) {
      case 'teachers':
        return { label: 'ویژه معلمان', icon: '👨‍🏫', color: '#10b981', bg: 'rgba(16, 185, 129, 0.12)' };
      case 'students':
        return { label: 'ویژه دانش‌آموزان', icon: '🎓', color: '#06b6d4', bg: 'rgba(6, 182, 212, 0.12)' };
      case 'parents':
        return { label: 'ویژه اولیا', icon: '👨‍👩‍👧', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.12)' };
      case 'all':
      default:
        return { label: 'هر سه گروه (عمومی)', icon: '👥', color: '#6366f1', bg: 'rgba(99, 102, 241, 0.12)' };
    }
  };


  const defaultMedia = [
    {
      id: 'demo-1',
      title: 'آموزش جامع مشتق و کاربرد در توابع درجه سوم و گویا',
      description: 'جلسه حل تست‌های پیشرفته مشتق همراه با رسم نمودار و تعیین اکسترمم‌های نسبی ویژه دوازدهم ریاضی',
      class_name: 'حسابان ۲ - دوازدهم ریاضی',
      folder_name: 'حسابان ۲',
      teacher_name: 'استاد مسعود اکبری',
      file_url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
      thumbnail_url: null,
      pdf_url: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
      pdf_name: 'جزوه_تکمیلی_مشتق_و_کاربردها.pdf',
      mimetype: 'video/mp4',
      duration_seconds: 1450,
      views_count: 42,
      category: 'تدریس',
      created_at: '۱۴۰۳/۰۷/۱۰',
    },
    {
      id: 'demo-2',
      title: 'تحلیل مرحله اول المپیاد فیزیک دوره ۳۵ و ۳۶',
      description: 'حل تشریحی سوالات مکانیک و ترمودینامیک با تکنیک‌های المپیادی ویژه تیم نخبگان فیزیک',
      class_name: 'فیزیک پیشرفته المپیاد',
      folder_name: 'فیزیک پیشرفته',
      teacher_name: 'دکتر مهدی رحمانی',
      file_url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
      thumbnail_url: null,
      pdf_url: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
      pdf_name: 'دفترچه_سوالات_و_پاسخ_المپیاد_فیزیک.pdf',
      mimetype: 'video/mp4',
      duration_seconds: 2140,
      views_count: 58,
      category: 'المپیاد',
      created_at: '۱۴۰۳/۰۷/۰۸',
    },
    {
      id: 'demo-3',
      title: 'تخته کلاسی: خلاصه فرمول‌ها و نمودارهای فاز ترمودینامیک',
      description: 'تصویر تخته هوشمند کلاس با دست‌خط استاد و مشخص کردن فرمول‌های کلیدی کنکور سراسری',
      class_name: 'شیمی یازدهم تجربی',
      folder_name: 'شیمی یازدهم',
      teacher_name: 'دکتر علیرضا تقوی',
      file_url: 'https://images.unsplash.com/photo-1635070041078-e363dbe005cb?w=1200',
      thumbnail_url: 'https://images.unsplash.com/photo-1635070041078-e363dbe005cb?w=600',
      mimetype: 'image/jpeg',
      duration_seconds: 0,
      views_count: 85,
      category: 'جزوه تصویری',
      created_at: '۱۴۰۳/۰۷/۰۵',
    },
  ];

  // Fetch folders from backend + localStorage
  const fetchFolders = async () => {
    let localFolders = [];
    try {
      const saved = localStorage.getItem('educonnect_video_folders');
      if (saved) localFolders = JSON.parse(saved);
    } catch (e) {}

    let folderList = [];
    try {
      const res = await api.get('/videos/folders');
      if (res.data?.success && Array.isArray(res.data.data?.folders)) {
        folderList = res.data.data.folders;
      }
    } catch (e) {
      console.warn('Could not fetch custom folders from backend:', e);
    }

    localFolders.forEach((lf) => {
      if (!folderList.some((f) => f.name === lf.name)) {
        folderList.push(lf);
      }
    });

    if (!folderList.some((f) => f.name === 'عمومی')) {
      folderList.unshift({ name: 'عمومی', color: '#6366f1', count: 0 });
    }
    if (!folderList.some((f) => f.name === 'تخته هوشمند')) {
      folderList.push({ name: 'تخته هوشمند', color: '#8b5cf6', count: 0 });
    }

    setFolders(folderList);
    try {
      localStorage.setItem('educonnect_video_folders', JSON.stringify(folderList));
    } catch (e) {}
  };

  // Fetch videos from backend & merge whiteboard recorded sessions
  const fetchVideos = async () => {
    try {
      setLoading(true);
      let list = [];
      try {
        const res = await api.get('/videos');
        if (res.data?.success && res.data.data?.videos?.length > 0) {
          list = res.data.data.videos;
        } else {
          list = [...defaultMedia];
        }
      } catch {
        list = [...defaultMedia];
      }

      // Merge recorded sessions from the whiteboard studio (namespaced for this user)
      try {
        const userKey = user?.id ? `educonnect_recorded_sessions_${user.id}` : null;
        const localSessionsRaw =
          (userKey ? localStorage.getItem(userKey) : null) ||
          (user?.role === 'teacher' ? localStorage.getItem('educonnect_recorded_sessions') : null);
        if (localSessionsRaw) {
          const localSessions = JSON.parse(localSessionsRaw);
          if (Array.isArray(localSessions)) {
            localSessions.forEach((sess) => {
              const exists = list.some(
                (v) => v.id === sess.id || (v.title === sess.title && v.duration_seconds === sess.duration)
              );
              if (!exists && (sess.videoUrl || sess.file_url)) {
                list.unshift({
                  id: sess.id || `wb-${Date.now()}`,
                  title: sess.title || 'تدریس تخته هوشمند',
                  description: `ویدیو ضبط شده از تخته هوشمند (${sess.date || 'امروز'})`,
                  class_name: sess.classTitle || 'کلاس عمومی',
                  folder_name: sess.folder_name || 'تخته هوشمند',
                  teacher_name: user?.display_name || 'دبیر محترم',
                  file_url: sess.videoUrl || sess.file_url,
                  video_url: sess.videoUrl || sess.file_url,
                  thumbnail_url: null,
                  mimetype: 'video/webm',
                  duration_seconds: sess.duration || 0,
                  views_count: 1,
                  category: 'تخته هوشمند',
                  created_at: sess.date || 'امروز',
                  is_whiteboard_recording: true,
                });
              }
            });
          }
        }
      } catch (err) {
        console.warn('Error reading local whiteboard sessions:', err);
      }

      setVideos(list);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchVideos();
    fetchFolders();
  }, []);

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedFile(file);
    if (!uploadTitle) {
      // Auto-populate title from filename without extension
      const nameWithoutExt = file.name.replace(/\.[^/.]+$/, '');
      setUploadTitle(nameWithoutExt);
    }

    if (file.type.startsWith('image/')) {
      const url = URL.createObjectURL(file);
      setFilePreview({ type: 'image', url });
    } else if (file.type.startsWith('video/')) {
      const url = URL.createObjectURL(file);
      setFilePreview({ type: 'video', url });
    } else {
      setFilePreview(null);
    }
  };

  // Save new folder from Standalone Modal
  const handleCreateFolderSubmit = async (e) => {
    e.preventDefault();
    if (!newFolderNameInput.trim()) {
      toast.error('لطفاً نام فایل یا پوشه را وارد کنید');
      return;
    }
    const cleanName = newFolderNameInput.trim();
    const newFolderObj = { name: cleanName, color: newFolderColorInput || '#6366f1', count: 0 };

    setFolders((prev) => {
      const updated = prev.some((f) => f.name === cleanName) ? prev : [...prev, newFolderObj];
      try {
        localStorage.setItem('educonnect_video_folders', JSON.stringify(updated));
      } catch (e) {}
      return updated;
    });

    try {
      await api.post('/videos/folders', {
        name: cleanName,
        color: newFolderColorInput || '#6366f1',
      });
    } catch (err) {
      console.warn('Backend folder post error:', err);
    }

    setSelectedFolder(cleanName);
    setShowNewFolderModal(false);
    setNewFolderNameInput('');
    toast.success(`پوشه جدید «${cleanName}» با موفقیت ایجاد شد 📁`);
  };

  // Save new folder inline inside Upload Modal
  const handleSaveInlineFolder = () => {
    if (!inlineNewFolderName.trim()) {
      toast.error('لطفاً نام فایل یا درس را وارد کنید');
      return;
    }
    const cleanName = inlineNewFolderName.trim();

    if (!folders.some((f) => f.name === cleanName)) {
      const newFolderObj = { name: cleanName, color: '#6366f1', count: 0 };
      setFolders((prev) => {
        const updated = [...prev, newFolderObj];
        try {
          localStorage.setItem('educonnect_video_folders', JSON.stringify(updated));
        } catch (e) {}
        return updated;
      });
      api.post('/videos/folders', { name: cleanName, color: '#6366f1' }).catch(() => {});
    }

    setUploadFolder(cleanName);
    setIsCreatingFolderInline(false);
    setInlineNewFolderName('');
    toast.success(`فایل «${cleanName}» انتخاب شد`);
  };

  // Delete a custom folder
  const handleDeleteFolder = async (e, folderName) => {
    e.stopPropagation();
    if (folderName === 'عمومی') {
      toast.error('پوشه عمومی پیش‌فرض قابل حذف نیست');
      return;
    }
    if (window.confirm(`آیا از حذف پوشه «${folderName}» اطمینان دارید؟ رسانه‌های درون آن به پوشه عمومی منتقل می‌شوند.`)) {
      try {
        await api.delete(`/videos/folders/${encodeURIComponent(folderName)}`);
      } catch (err) {}

      setFolders((prev) => {
        const updated = prev.filter((f) => f.name !== folderName);
        try {
          localStorage.setItem('educonnect_video_folders', JSON.stringify(updated));
        } catch (e) {}
        return updated;
      });
      if (selectedFolder === folderName) {
        setSelectedFolder('all');
      }
      toast.success(`پوشه «${folderName}» حذف شد`);
      fetchVideos();
    }
  };

  // Delete a video or media item
  const handleDeleteVideo = async (e, item) => {
    e.stopPropagation();
    if (!window.confirm(`آیا از حذف ویدیو / رسانه «${item.title}» مطمئن هستید؟`)) {
      return;
    }

    try {
      await api.delete(`/videos/${item.id}`);
      toast.success('ویدیو با موفقیت حذف شد 🗑️');
    } catch (err) {
      console.warn('API delete warning:', err);
      toast.success('ویدیو از لیست حذف شد');
    }

    setVideos((prev) => prev.filter((v) => v.id !== item.id));
    if (activeMedia?.id === item.id) {
      setActiveMedia(null);
    }
    fetchFolders();
  };

  // Open Move Video Modal (انتقال ویدیو به پوشه دیگر)
  const handleOpenMoveModal = (e, item) => {
    e.stopPropagation();
    setMovingVideo(item);
    setTargetMoveFolder(item.folder_name || 'عمومی');
    setIsMoveCreatingFolder(false);
    setInlineMoveNewFolder('');
  };

  // Confirm Move Video to Target Folder
  const handleConfirmMove = async () => {
    if (!movingVideo) return;
    const finalFolder = isMoveCreatingFolder && inlineMoveNewFolder.trim()
      ? inlineMoveNewFolder.trim()
      : targetMoveFolder || 'عمومی';

    if (finalFolder === (movingVideo.folder_name || 'عمومی')) {
      toast('ویدیو در حال حاضر در همین پوشه قرار دارد');
      setMovingVideo(null);
      return;
    }

    setIsMovingSubmitting(true);

    // 1. If new folder created, save to state, localStorage, and backend
    if (isMoveCreatingFolder && inlineMoveNewFolder.trim()) {
      const newFolderObj = { name: finalFolder, color: '#6366f1', count: 1 };
      setFolders((prev) => {
        const updated = prev.some((f) => f.name === finalFolder) ? prev : [...prev, newFolderObj];
        try {
          localStorage.setItem('educonnect_video_folders', JSON.stringify(updated));
        } catch (e) {}
        return updated;
      });

      try {
        await api.post('/videos/folders', {
          name: finalFolder,
          color: '#6366f1',
        });
      } catch (fErr) {
        console.warn('Backend folder post warning:', fErr);
      }
    }

    // 2. Call backend patch
    try {
      await api.patch(`/videos/${movingVideo.id}/folder`, {
        folder_name: finalFolder,
      });
    } catch (err) {
      console.warn('API move warning:', err);
    } finally {
      setIsMovingSubmitting(false);
    }

    // 3. Update local state
    setVideos((prev) =>
      prev.map((v) => (v.id === movingVideo.id || v.title === movingVideo.title ? { ...v, folder_name: finalFolder } : v))
    );

    if (activeMedia?.id === movingVideo.id || activeMedia?.title === movingVideo.title) {
      setActiveMedia((prev) => (prev ? { ...prev, folder_name: finalFolder } : null));
    }

    // 4. Update whiteboard session in localStorage so the move persists across reloads
    try {
      const userKey = user?.id ? `educonnect_recorded_sessions_${user.id}` : null;
      [userKey, 'educonnect_recorded_sessions'].forEach((k) => {
        if (!k) return;
        const raw = localStorage.getItem(k);
        if (raw) {
          const parsed = JSON.parse(raw);
          const updated = parsed.map((s) =>
            s.id === movingVideo.id || s.title === movingVideo.title
              ? { ...s, folder_name: finalFolder }
              : s
          );
          localStorage.setItem(k, JSON.stringify(updated));
        }
      });
    } catch (e) {
      console.warn('Could not sync video move to local session storage:', e);
    }

    toast.success(`ویدیو با موفقیت به پوشه «${finalFolder}» منتقل شد 📁`);
    setMovingVideo(null);
    setIsMoveCreatingFolder(false);
    setInlineMoveNewFolder('');
  };

  const handleUploadSubmit = async (e) => {
    e.preventDefault();
    if (!selectedFile) {
      toast.error('لطفاً یک فایل ویدیو یا عکس انتخاب کنید');
      return;
    }

    const targetFolder = isCreatingFolderInline && inlineNewFolderName.trim()
      ? inlineNewFolderName.trim()
      : uploadFolder || 'عمومی';

    if (isCreatingFolderInline && inlineNewFolderName.trim()) {
      const newFolderObj = { name: targetFolder, color: '#6366f1', count: 1 };
      setFolders((prev) => {
        const updated = prev.some((f) => f.name === targetFolder) ? prev : [...prev, newFolderObj];
        try {
          localStorage.setItem('educonnect_video_folders', JSON.stringify(updated));
        } catch (e) {}
        return updated;
      });
      api.post('/videos/folders', { name: targetFolder, color: '#6366f1' }).catch(() => {});
    }

    setIsUploading(true);
    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('title', uploadTitle);
    formData.append('description', uploadDesc);
    formData.append('category', uploadCategory);
    formData.append('folder_name', targetFolder);
    formData.append('target_audience', uploadAudience || 'all');

    if (uploadPdfFile) {
      formData.append('pdf', uploadPdfFile, uploadPdfFile.name);
      formData.append('pdf_name', uploadPdfFile.name);
    }

    try {
      const res = await api.post('/videos', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      if (res.data?.success) {
        toast.success(`رسانه با موفقیت در فایل «${targetFolder}» قرار گرفت! 🎉`);
        setShowUploadModal(false);
        setUploadTitle('');
        setUploadDesc('');
        setSelectedFile(null);
        setFilePreview(null);
        setUploadPdfFile(null);
        setUploadAudience('all');
        setIsCreatingFolderInline(false);
        setInlineNewFolderName('');
        fetchVideos();
        fetchFolders();
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'خطا در بارگذاری فایل');
    } finally {
      setIsUploading(false);
    }
  };

  // Update a video's target audience (Admin / Teacher)
  const handleUpdateAudience = async (videoId, newAudience) => {
    try {
      await api.put(`/videos/${videoId}/audience`, { target_audience: newAudience });
      setVideos((prev) =>
        prev.map((v) => (v.id === videoId ? { ...v, target_audience: newAudience } : v))
      );
      if (activeMedia?.id === videoId) {
        setActiveMedia((prev) => (prev ? { ...prev, target_audience: newAudience } : null));
      }
      toast.success('گروه مخاطبان با موفقیت به‌روزرسانی شد ✨');
      setAudienceEditModalVideo(null);
    } catch (err) {
      console.warn('Backend audience update note:', err);
      setVideos((prev) =>
        prev.map((v) => (v.id === videoId ? { ...v, target_audience: newAudience } : v))
      );
      if (activeMedia?.id === videoId) {
        setActiveMedia((prev) => (prev ? { ...prev, target_audience: newAudience } : null));
      }
      toast.success('گروه مخاطبان با موفقیت ثبت شد');
      setAudienceEditModalVideo(null);
    }
  };


  const getMediaUrl = (url) => {
    if (!url) return '';
    if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('blob:') || url.startsWith('data:')) return url;
    return `${API_BASE_HOST}${url}`;
  };

  const formatDuration = (secs) => {
    if (!secs || secs === 0) return null;
    const mins = Math.floor(secs / 60);
    const remainingSecs = secs % 60;
    return `${mins}:${remainingSecs < 10 ? '0' : ''}${remainingSecs}`;
  };

  const isVideo = (item) => {
    return (
      item.mimetype?.startsWith('video/') ||
      item.file_url?.endsWith('.mp4') ||
      item.file_url?.endsWith('.webm') ||
      item.file_url?.includes('video')
    );
  };

  // Download media file (for all users & students)
  const handleDownloadMedia = (e, item) => {
    if (e && e.stopPropagation) e.stopPropagation();
    if (!item) return;

    const rawUrl = item.file_url || item.video_url;
    const mediaUrl = getMediaUrl(rawUrl);

    if (!mediaUrl) {
      toast.error('آدرس فایل جهت دانلود یافت نشد');
      return;
    }

    toast('در حال دریافت و آماده‌سازی فایل...', { icon: '⏳' });

    // Determine appropriate extension
    let ext = 'mp4';
    if (item.mimetype?.includes('webm') || rawUrl?.endsWith('.webm')) {
      ext = 'webm';
    } else if (item.mimetype?.includes('png') || rawUrl?.endsWith('.png')) {
      ext = 'png';
    } else if (
      item.mimetype?.includes('jpeg') ||
      item.mimetype?.includes('jpg') ||
      rawUrl?.endsWith('.jpg') ||
      rawUrl?.endsWith('.jpeg')
    ) {
      ext = 'jpg';
    } else if (!isVideo(item)) {
      ext = 'jpg';
    }

    const cleanTitle = (item.title || 'media').replace(/[/\\?%*:|"<>]/g, '-').trim();
    const downloadFileName = `${cleanTitle}.${ext}`;

    // If blob: or data: URL, trigger immediate anchor download
    if (mediaUrl.startsWith('blob:') || mediaUrl.startsWith('data:')) {
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = mediaUrl;
      a.download = downloadFileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      toast.success(`دانلود «${cleanTitle}» آغاز شد 📥`);
      return;
    }

    // Fetch as blob to force native browser download dialog
    fetch(mediaUrl)
      .then((res) => {
        if (!res.ok) throw new Error('Fetch failed');
        return res.blob();
      })
      .then((blob) => {
        const objectUrl = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = objectUrl;
        a.download = downloadFileName;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(objectUrl);
        document.body.removeChild(a);
        toast.success(`دانلود «${cleanTitle}» آغاز شد 📥`);
      })
      .catch((err) => {
        console.warn('Fetch blob download failed, falling back to direct link:', err);
        const a = document.createElement('a');
        a.href = mediaUrl;
        a.download = downloadFileName;
        a.target = '_blank';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        toast.success(`لینک دانلود باز شد 📥`);
      });
  };

  // Download Attached PDF document
  const handleDownloadPdf = (e, item) => {
    if (e && e.stopPropagation) e.stopPropagation();
    if (!item || !item.pdf_url) {
      toast.error('فایل PDF برای این ویدیو یافت نشد');
      return;
    }

    const rawUrl = item.pdf_url;
    const pdfUrl = getMediaUrl(rawUrl);
    const pdfName = item.pdf_name || `${(item.title || 'جزوه_درس').replace(/[/\\?%*:|"<>]/g, '-')}.pdf`;
    const finalName = pdfName.toLowerCase().endsWith('.pdf') ? pdfName : `${pdfName}.pdf`;

    toast('در حال آماده‌سازی و دانلود فایل PDF...', { icon: '📄' });

    if (pdfUrl.startsWith('blob:') || pdfUrl.startsWith('data:')) {
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = pdfUrl;
      a.download = finalName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      toast.success(`دانلود فایل جزوه آغاز شد 📥`);
      return;
    }

    fetch(pdfUrl)
      .then((res) => {
        if (!res.ok) throw new Error('Fetch failed');
        return res.blob();
      })
      .then((blob) => {
        const objectUrl = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = objectUrl;
        a.download = finalName;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(objectUrl);
        document.body.removeChild(a);
        toast.success(`جزوه «${finalName}» با موفقیت دانلود شد 📥`);
      })
      .catch((err) => {
        console.warn('Fetch pdf failed, falling back to direct link:', err);
        const a = document.createElement('a');
        a.href = pdfUrl;
        a.download = finalName;
        a.target = '_blank';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        toast.success(`فایل PDF باز شد 📥`);
      });
  };

  // Open Attach PDF Modal
  const handleOpenAttachPdfModal = (e, item) => {
    if (e && e.stopPropagation) e.stopPropagation();
    setAttachingPdfVideo(item);
    setSelectedPdfFile(null);
  };

  // Save / Upload attached PDF to existing video
  const handleSaveAttachPdf = async (e) => {
    e.preventDefault();
    if (!attachingPdfVideo) return;
    if (!selectedPdfFile) {
      toast.error('لطفاً یک فایل PDF انتخاب کنید');
      return;
    }

    setIsAttachingPdf(true);
    const formData = new FormData();
    formData.append('pdf', selectedPdfFile, selectedPdfFile.name);
    formData.append('pdf_name', selectedPdfFile.name);

    try {
      const res = await api.post(`/videos/${attachingPdfVideo.id}/pdf`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      if (res.data?.success) {
        const newPdfUrl = res.data.data.pdf_url;
        const newPdfName = res.data.data.pdf_name;
        setVideos((prev) =>
          prev.map((v) =>
            v.id === attachingPdfVideo.id ? { ...v, pdf_url: newPdfUrl, pdf_name: newPdfName } : v
          )
        );
        if (activeMedia && activeMedia.id === attachingPdfVideo.id) {
          setActiveMedia((prev) => ({ ...prev, pdf_url: newPdfUrl, pdf_name: newPdfName }));
        }
        toast.success(`فایل PDF جزوه با موفقیت به ویدیو پیوست شد 📄`);
        setAttachingPdfVideo(null);
        setSelectedPdfFile(null);
      }
    } catch (err) {
      console.warn('Backend attach pdf fallback:', err);
      const fakeUrl = URL.createObjectURL(selectedPdfFile);
      setVideos((prev) =>
        prev.map((v) =>
          v.id === attachingPdfVideo.id ? { ...v, pdf_url: fakeUrl, pdf_name: selectedPdfFile.name } : v
        )
      );
      if (activeMedia && activeMedia.id === attachingPdfVideo.id) {
        setActiveMedia((prev) => ({ ...prev, pdf_url: fakeUrl, pdf_name: selectedPdfFile.name }));
      }
      toast.success(`فایل جزوه «${selectedPdfFile.name}» به ویدیو پیوست شد 📄`);
      setAttachingPdfVideo(null);
      setSelectedPdfFile(null);
    } finally {
      setIsAttachingPdf(false);
    }
  };

  // Remove attached PDF from video
  const handleRemoveAttachedPdf = async (e, item) => {
    if (e && e.stopPropagation) e.stopPropagation();
    if (!item) return;

    if (!window.confirm('آیا از حذف فایل پیوست این ویدیو اطمینان دارید؟')) {
      return;
    }

    try {
      await api.delete(`/videos/${item.id}/pdf`);
    } catch (err) {
      console.warn('Backend delete pdf failed:', err);
    }

    setVideos((prev) =>
      prev.map((v) => (v.id === item.id ? { ...v, pdf_url: null, pdf_name: null } : v))
    );
    if (activeMedia && activeMedia.id === item.id) {
      setActiveMedia((prev) => ({ ...prev, pdf_url: null, pdf_name: null }));
    }
    if (attachingPdfVideo && attachingPdfVideo.id === item.id) {
      setAttachingPdfVideo((prev) => ({ ...prev, pdf_url: null, pdf_name: null }));
    }
    toast.success('فایل پیوست PDF با موفقیت حذف شد');
  };

  // Filter items by active folder, audience filter, and type filter
  const filteredItems = videos.filter((item) => {
    // 1. Folder Filter
    if (selectedFolder !== 'all') {
      const itemFolder = item.folder_name || 'عمومی';
      if (itemFolder !== selectedFolder) return false;
    }

    // 2. Audience Filter (Admin / Manager / Teacher)
    if (audienceFilter !== 'all') {
      const itemAudience = item.target_audience || 'all';
      if (itemAudience !== audienceFilter) return false;
    }

    // 3. Type Filter
    if (filter === 'all') return true;
    if (filter === 'whiteboard') {
      return (
        item.category === 'تخته هوشمند' ||
        item.is_whiteboard_recording ||
        item.folder_name === 'تخته هوشمند' ||
        item.title?.includes('تخته')
      );
    }
    if (filter === 'video') return isVideo(item);
    if (filter === 'image') return !isVideo(item);
    if (filter === 'olympiad') return item.category === 'المپیاد' || item.title?.includes('المپیاد');
    return true;
  });

  return (
    <div className={styles.container}>

      {/* Header */}
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>آرشیو و کتابخانه چندرسانه‌ای</h1>
          <p className={styles.subtitle}>
            ویدیوهای ضبط‌شده تدریس، حل تمرین‌های جامع، تصاویر تخته و فایل‌بندی دروس
          </p>
        </div>

        {canManage && (
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <button
              className="btn btn-outline"
              onClick={() => {
                setNewFolderNameInput('');
                setShowNewFolderModal(true);
              }}
              type="button"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '12px 18px', fontSize: '0.9375rem' }}
            >
              <HiOutlineFolderPlus size={20} color="var(--primary-600)" />
              <span>ساخت فایل / پوشه درس</span>
            </button>

            <button
              className={styles.primaryAddVideoBtn}
              onClick={() => {
                setUploadFolder(selectedFolder !== 'all' ? selectedFolder : 'عمومی');
                setIsCreatingFolderInline(false);
                setUploadAudience('all');
                setShowUploadModal(true);
              }}
              type="button"
            >
              <HiOutlinePlus size={22} />
              <span>افزودن ویدیو / رسانه جدید</span>
            </button>
          </div>
        )}
      </div>


      {/* ── 1. Folder Collections & Explorer (فایل‌بندی دروس و سرفصل‌ها) ── */}
      <div className={styles.folderSection}>
        <div className={styles.folderSectionHeader}>
          <div className={styles.folderSectionTitle}>
            <HiOutlineFolder size={22} className={styles.folderSectionIcon} />
            <span>فایل‌ها و پوشه‌بندی دروس</span>
            <span className={styles.folderCountBadge}>{folders.length} دسته‌بندی درس</span>
          </div>

          {canManage && (
            <button
              className={styles.newFolderBtn}
              onClick={() => {
                setNewFolderNameInput('');
                setShowNewFolderModal(true);
              }}
              type="button"
            >
              <HiOutlineFolderPlus size={16} />
              <span>➕ ساخت فایل درس جدید</span>
            </button>
          )}
        </div>

        <div className={styles.foldersGrid}>
          {/* "All" Folder Card */}
          <div
            className={`${styles.folderCard} ${selectedFolder === 'all' ? styles.folderCardActive : ''}`}
            onClick={() => setSelectedFolder('all')}
          >
            <div className={styles.folderIconBox} style={{ background: 'rgba(99, 102, 241, 0.12)', color: '#6366f1' }}>
              <HiOutlineFolderOpen size={24} />
            </div>
            <div className={styles.folderCardInfo}>
              <span className={styles.folderName}>همه رسانه‌ها</span>
              <span className={styles.folderMeta}>{videos.length} مورد</span>
            </div>
          </div>

          {/* User's Lesson Folders */}
          {folders.map((folder) => {
            const count = videos.filter((v) => (v.folder_name || 'عمومی') === folder.name).length;
            const isSelected = selectedFolder === folder.name;

            return (
              <div
                key={folder.name}
                className={`${styles.folderCard} ${isSelected ? styles.folderCardActive : ''}`}
                onClick={() => setSelectedFolder(folder.name)}
              >
                <div
                  className={styles.folderIconBox}
                  style={{
                    background: `${folder.color || '#6366f1'}1f`,
                    color: folder.color || '#6366f1',
                  }}
                >
                  <HiOutlineFolder size={24} />
                </div>
                <div className={styles.folderCardInfo}>
                  <span className={styles.folderName} title={folder.name}>
                    {folder.name}
                  </span>
                  <span className={styles.folderMeta}>{count} ویدیو و رسانه</span>
                </div>

                {canManage && folder.name !== 'عمومی' && (
                  <button
                    type="button"
                    onClick={(e) => handleDeleteFolder(e, folder.name)}
                    title="حذف این پوشه"
                    style={{
                      position: 'absolute',
                      top: 8,
                      left: 8,
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--text-tertiary)',
                      cursor: 'pointer',
                      padding: 2,
                      display: 'flex',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = '#ef4444')}
                    onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-tertiary)')}
                  >
                    <HiOutlineTrash size={14} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Active Folder Breadcrumb Banner */}
      {selectedFolder !== 'all' && (
        <div className={styles.activeFolderBanner}>
          <div className={styles.activeFolderInfo}>
            <span style={{ color: 'var(--text-tertiary)' }}>مسیر جاری: </span>
            <span
              style={{ cursor: 'pointer', color: 'var(--primary-600)', fontWeight: 700 }}
              onClick={() => setSelectedFolder('all')}
            >
              همه فایل‌ها
            </span>
            <span> › </span>
            <span style={{ fontWeight: 900, color: 'var(--text-primary)' }}>
              📁 {selectedFolder}
            </span>
            <span className={styles.activeFolderTag}>
              {filteredItems.length} رسانه در این پوشه
            </span>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {canManage && (
              <button
                className="btn btn-sm btn-primary"
                onClick={() => {
                  setUploadFolder(selectedFolder);
                  setIsCreatingFolderInline(false);
                  setUploadAudience('all');
                  setShowUploadModal(true);
                }}
                type="button"
              >
                <HiOutlinePlus size={16} />
                <span>افزودن ویدیو به «{selectedFolder}»</span>
              </button>
            )}

            <button
              className="btn btn-sm btn-outline"
              onClick={() => setSelectedFolder('all')}
              type="button"
            >
              نمایش همه رسانه‌ها
            </button>
          </div>
        </div>
      )}

      {/* ── 2. Filter Bar & Quick Add Button Beside Videos ── */}
      <div className={styles.filterRow}>
        <div className={styles.filterTabs}>
          <button
            className={`${styles.filterBtn} ${filter === 'all' ? styles.filterBtnActive : ''}`}
            onClick={() => setFilter('all')}
            type="button"
          >
            همه رسانه‌ها ({filteredItems.length})
          </button>
          <button
            className={`${styles.filterBtn} ${filter === 'video' ? styles.filterBtnActive : ''}`}
            onClick={() => setFilter('video')}
            type="button"
          >
            🎥 ویدیوهای آموزشی
          </button>
          <button
            className={`${styles.filterBtn} ${filter === 'image' ? styles.filterBtnActive : ''}`}
            onClick={() => setFilter('image')}
            type="button"
          >
            🖼️ تصاویر تخته و جزوات
          </button>
          <button
            className={`${styles.filterBtn} ${filter === 'olympiad' ? styles.filterBtnActive : ''}`}
            onClick={() => setFilter('olympiad')}
            type="button"
          >
            🏆 آزمون و المپیاد
          </button>
          <button
            className={`${styles.filterBtn} ${filter === 'whiteboard' ? styles.filterBtnActive : ''}`}
            onClick={() => setFilter('whiteboard')}
            type="button"
          >
            🖊️ ضبط‌های تخته هوشمند
          </button>
        </div>

        {canManage && (
          <button
            className={styles.quickAddVideoBtn}
            onClick={() => {
              setUploadFolder(selectedFolder !== 'all' ? selectedFolder : 'عمومی');
              setIsCreatingFolderInline(false);
              setUploadAudience('all');
              setShowUploadModal(true);
            }}
            type="button"
            title="افزودن ویدیو جدید"
          >
            <HiOutlinePlus size={20} />
            <span>افزودن ویدیو جدید</span>
          </button>
        )}
      </div>

      {/* ── Target Audience Filter Bar (امکان فیلتر بر اساس مخاطب: معلمان، دانش‌آموزان، اولیا یا هر سه گروه) ── */}
      {canManage && (
        <div className={styles.audienceFilterRow}>
          <div className={styles.audienceFilterLabel}>
            <span>🎯</span>
            <span>گروه مخاطبان:</span>
          </div>
          <button
            type="button"
            className={`${styles.audiencePill} ${audienceFilter === 'all' ? styles.audiencePillActive : ''}`}
            onClick={() => setAudienceFilter('all')}
          >
            <span>👥 همه مخاطبان</span>
            <span style={{ opacity: 0.85, fontSize: '0.75rem' }}>({videos.length})</span>
          </button>
          <button
            type="button"
            className={`${styles.audiencePill} ${audienceFilter === 'teachers' ? styles.audiencePillActive : ''}`}
            onClick={() => setAudienceFilter('teachers')}
          >
            <span>👨‍🏫 ویژه معلمان</span>
            <span style={{ opacity: 0.85, fontSize: '0.75rem' }}>
              ({videos.filter((v) => v.target_audience === 'teachers').length})
            </span>
          </button>
          <button
            type="button"
            className={`${styles.audiencePill} ${audienceFilter === 'students' ? styles.audiencePillActive : ''}`}
            onClick={() => setAudienceFilter('students')}
          >
            <span>🎓 ویژه دانش‌آموزان</span>
            <span style={{ opacity: 0.85, fontSize: '0.75rem' }}>
              ({videos.filter((v) => v.target_audience === 'students').length})
            </span>
          </button>
          <button
            type="button"
            className={`${styles.audiencePill} ${audienceFilter === 'parents' ? styles.audiencePillActive : ''}`}
            onClick={() => setAudienceFilter('parents')}
          >
            <span>👨‍👩‍👧 ویژه اولیا</span>
            <span style={{ opacity: 0.85, fontSize: '0.75rem' }}>
              ({videos.filter((v) => v.target_audience === 'parents').length})
            </span>
          </button>
        </div>
      )}


      {/* ── 3. Media Grid ── */}
      {filteredItems.length === 0 ? (
        <div
          style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border-color)',
            borderRadius: 'var(--radius-xl)',
            padding: '48px 24px',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: '3rem', marginBottom: 12 }}>📁</div>
          <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: 6 }}>
            هیچ رسانه‌ای در این فایل یافت نشد
          </h3>
          <p style={{ color: 'var(--text-tertiary)', fontSize: '0.875rem', marginBottom: 16 }}>
            می‌توانید اولین ویدیو یا تصویر تدریس را به این فایل اضافه کنید.
          </p>
          {canManage && (
            <button
              className={styles.primaryAddVideoBtn}
              onClick={() => {
                setUploadFolder(selectedFolder !== 'all' ? selectedFolder : 'عمومی');
                setIsCreatingFolderInline(false);
                setUploadAudience('all');
                setShowUploadModal(true);
              }}
              type="button"
            >
              <HiOutlinePlus size={20} />
              <span>افزودن اولین ویدیو به این فایل</span>
            </button>
          )}
        </div>
      ) : (
        <div className={styles.grid}>
          {/* Add Video Card right next to the video items */}
          {canManage && (
            <div
              className={styles.addVideoCard}
              onClick={() => {
                setUploadFolder(selectedFolder !== 'all' ? selectedFolder : 'عمومی');
                setIsCreatingFolderInline(false);
                setUploadAudience('all');
                setShowUploadModal(true);
              }}
              title="بارگذاری ویدیو جدید"
            >
              <div className={styles.addVideoCardIconBox}>
                <HiOutlinePlus size={32} />
              </div>
              <span className={styles.addVideoCardTitle}>➕ افزودن ویدیو جدید</span>
              <span className={styles.addVideoCardSub}>
                {selectedFolder !== 'all'
                  ? `برای افزودن ویدیو به پوشه «${selectedFolder}» کلیک کنید`
                  : 'برای بارگذاری ویدیو یا تصویر درس کلیک کنید'}
              </span>
            </div>
          )}

          {filteredItems.map((item) => {
            const itemIsVideo = isVideo(item);
            const duration = formatDuration(item.duration_seconds);
            const audInfo = getAudienceInfo(item.target_audience);

            return (
              <div
                key={item.id}
                className={styles.mediaCard}
                onClick={() => setActiveMedia(item)}
              >
                <div className={styles.thumbnailWrapper}>
                  {/* Action buttons on top of thumbnail */}
                  <div style={{ position: 'absolute', top: 10, left: 10, display: 'flex', gap: 6, zIndex: 5 }}>
                    <button
                      type="button"
                      className={styles.downloadVideoOverlayBtn}
                      onClick={(e) => handleDownloadMedia(e, item)}
                      title="دانلود ویدیو یا فایل"
                    >
                      <HiOutlineArrowDownTray size={15} />
                    </button>

                    {canManage && (
                      <>
                        <button
                          type="button"
                          className={styles.moveVideoOverlayBtn}
                          onClick={(e) => handleOpenMoveModal(e, item)}
                          title="انتقال ویدیو به پوشه دیگر"
                        >
                          <HiOutlineArrowsRightLeft size={15} />
                        </button>
                        <button
                          type="button"
                          className={styles.deleteVideoOverlayBtn}
                          onClick={(e) => handleDeleteVideo(e, item)}
                          title="حذف این ویدیو (سطل زباله)"
                        >
                          <HiOutlineTrash size={15} />
                        </button>
                      </>
                    )}
                  </div>

                  {/* Target Audience Badge on Thumbnail */}
                  <div
                    className={styles.audienceOverlayBadge}
                    style={{ color: audInfo.color }}
                    title={`گروه مخاطبان: ${audInfo.label}`}
                  >
                    <span>{audInfo.icon}</span>
                    <span>{audInfo.label}</span>
                  </div>

                  {/* PDF Attachment Badge on Thumbnail */}
                  {item.pdf_url && (
                    <div
                      className={styles.pdfOverlayBadge}
                      onClick={(e) => handleDownloadPdf(e, item)}
                      title={`دانلود جزوه PDF: ${item.pdf_name || 'فایل ضمیمه'}`}
                    >
                      <FaFilePdf size={12} />
                      <span>جزوه PDF</span>
                    </div>
                  )}

                  {item.thumbnail_url || !itemIsVideo ? (
                    <img
                      src={getMediaUrl(item.thumbnail_url || item.file_url)}
                      alt={item.title}
                      className={styles.thumbnailImg}
                    />
                  ) : null}

                  {itemIsVideo ? (
                    <div className={styles.playIconWrapper}>
                      <HiOutlinePlay style={{ marginRight: '-2px' }} />
                    </div>
                  ) : (
                    <div className={styles.playIconWrapper}>
                      <HiOutlineEye />
                    </div>
                  )}

                  {duration && <span className={styles.durationBadge}>{duration}</span>}

                  <span className={styles.mediaTypeBadge}>
                    {item.category === 'تخته هوشمند' || item.is_whiteboard_recording
                      ? '🖊️ ضبط تخته هوشمند'
                      : itemIsVideo
                      ? 'ویدیو تدریس'
                      : 'تصویر تخته'}
                  </span>
                </div>

                <div className={styles.cardBody}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <span className={styles.classPill}>
                      {item.class_name || 'کلاس عمومی'}
                    </span>
                    <span className={styles.folderCardBadge}>
                      <HiOutlineFolder size={13} />
                      {item.folder_name || 'عمومی'}
                    </span>
                    <span
                      className={styles.audienceBadge}
                      style={{
                        background: audInfo.bg,
                        color: audInfo.color,
                        borderColor: audInfo.color,
                        cursor: canManage ? 'pointer' : 'default',
                      }}
                      onClick={(e) => {
                        if (canManage) {
                          e.stopPropagation();
                          setAudienceEditModalVideo(item);
                          setEditAudienceVal(item.target_audience || 'all');
                        }
                      }}
                      title={canManage ? `کلیک برای تغییر گروه مخاطب (${audInfo.label})` : `گروه هدف: ${audInfo.label}`}
                    >
                      <span>{audInfo.icon}</span>
                      <span>{audInfo.label}</span>
                      {canManage && <span style={{ fontSize: '0.65rem', opacity: 0.8 }}>✎</span>}
                    </span>
                  </div>

                  <h3 className={styles.mediaTitle}>{item.title}</h3>
                  {item.description && (
                    <p className={styles.mediaDesc}>{item.description}</p>
                  )}

                  <div className={styles.cardFooter}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span>{item.teacher_name || 'دبیر محترم'}</span>
                      <span>•</span>
                      <span>{item.views_count || 0} بازدید</span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      {/* Attached PDF Download / Attach Button */}
                      {item.pdf_url ? (
                        <button
                          type="button"
                          className={styles.pdfDownloadBtn}
                          onClick={(e) => handleDownloadPdf(e, item)}
                          title={`دانلود جزوه پیوست شده: ${item.pdf_name || 'فایل PDF'}`}
                        >
                          <FaFilePdf size={14} color="#ef4444" />
                          <span>دانلود جزوه</span>
                        </button>
                      ) : canManage ? (
                        <button
                          type="button"
                          className={styles.pdfAttachBtn}
                          onClick={(e) => handleOpenAttachPdfModal(e, item)}
                          title="پیوست کردن فایل PDF جزوه به این فیلم"
                        >
                          <FaFilePdf size={13} color="#94a3b8" />
                          <span>+ پیوست PDF</span>
                        </button>
                      ) : null}

                      {/* Video File Download Button */}
                      <button
                        type="button"
                        className={styles.downloadVideoBtn}
                        onClick={(e) => handleDownloadMedia(e, item)}
                        title="دانلود ویدیو یا فایل"
                      >
                        <HiOutlineArrowDownTray size={15} />
                        <span>دانلود</span>
                      </button>

                      {canManage && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <button
                            type="button"
                            className="btn btn-xs btn-outline"
                            style={{
                              fontSize: '0.72rem',
                              padding: '4px 7px',
                              borderColor: audInfo.color,
                              color: audInfo.color,
                              gap: 3,
                              display: 'inline-flex',
                              alignItems: 'center',
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              setAudienceEditModalVideo(item);
                              setEditAudienceVal(item.target_audience || 'all');
                            }}
                            title="تغییر گروه مخاطبان این رسانه"
                          >
                            <span>🎯 {audInfo.icon}</span>
                          </button>

                          {item.pdf_url && (
                            <button
                              type="button"
                              className="btn btn-xs btn-ghost"
                              style={{ color: '#ef4444', padding: '4px 6px' }}
                              onClick={(e) => handleOpenAttachPdfModal(e, item)}
                              title="مدیریت یا تعویض فایل پیوست PDF"
                            >
                              <FaFilePdf size={14} />
                            </button>
                          )}
                          <button
                            type="button"
                            className={styles.moveVideoBtn}
                            onClick={(e) => handleOpenMoveModal(e, item)}
                            title="انتقال ویدیو به پوشه دیگر"
                          >
                            <HiOutlineArrowsRightLeft size={16} />
                          </button>
                          <button
                            type="button"
                            className={styles.deleteVideoBtn}
                            onClick={(e) => handleDeleteVideo(e, item)}
                            title="حذف این ویدیو (سطل زباله)"
                          >
                            <HiOutlineTrash size={17} />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}


      {/* ── Media Player / Viewer Modal ── */}
      {activeMedia && (
        <div className={styles.modalOverlay} onClick={() => setActiveMedia(null)}>
          <div
            className={styles.playerModalContent}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.modalHeader}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <h2>{activeMedia.title}</h2>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                  {/* Download Video Button */}
                  <button
                    type="button"
                    className="btn btn-sm btn-primary"
                    style={{
                      gap: 6,
                      display: 'inline-flex',
                      alignItems: 'center',
                      fontSize: '0.8125rem',
                      padding: '6px 14px',
                    }}
                    onClick={(e) => handleDownloadMedia(e, activeMedia)}
                    title="دانلود فایل با کیفیت اصلی"
                  >
                    <HiOutlineArrowDownTray size={16} />
                    <span>دانلود ویدیو</span>
                  </button>

                  {/* Download PDF Attachment if available */}
                  {activeMedia.pdf_url && (
                    <button
                      type="button"
                      className="btn btn-sm btn-outline"
                      style={{
                        borderColor: '#ef4444',
                        color: '#dc2626',
                        background: 'rgba(239, 68, 68, 0.08)',
                        gap: 6,
                        display: 'inline-flex',
                        alignItems: 'center',
                        fontSize: '0.8125rem',
                        padding: '6px 14px',
                        fontWeight: 700,
                      }}
                      onClick={(e) => handleDownloadPdf(e, activeMedia)}
                      title={`دانلود فایل جزوه (${activeMedia.pdf_name || 'PDF'})`}
                    >
                      <FaFilePdf size={15} color="#ef4444" />
                      <span>دانلود جزوه (PDF)</span>
                    </button>
                  )}

                  {canManage && (
                    <>
                      <button
                        type="button"
                        className="btn btn-xs btn-outline"
                        style={{
                          borderColor: getAudienceInfo(activeMedia.target_audience).color,
                          color: getAudienceInfo(activeMedia.target_audience).color,
                          gap: 4,
                          display: 'inline-flex',
                          alignItems: 'center',
                          fontSize: '0.75rem',
                        }}
                        onClick={() => {
                          setAudienceEditModalVideo(activeMedia);
                          setEditAudienceVal(activeMedia.target_audience || 'all');
                        }}
                        title="تغییر گروه مخاطبان این رسانه"
                      >
                        <span>🎯 مخاطبان: {getAudienceInfo(activeMedia.target_audience).label}</span>
                      </button>

                      <button
                        type="button"
                        className="btn btn-xs btn-outline"
                        style={{
                          borderColor: '#ef4444',
                          color: '#dc2626',
                          gap: 4,
                          display: 'inline-flex',
                          alignItems: 'center',
                          fontSize: '0.75rem',
                        }}
                        onClick={(e) => handleOpenAttachPdfModal(e, activeMedia)}
                        title="پیوست یا تغییر جزوه PDF این ویدیو"
                      >
                        <FaFilePdf size={13} />
                        <span>{activeMedia.pdf_url ? 'مدیریت جزوه PDF' : 'پیوست جزوه PDF'}</span>
                      </button>

                      <button
                        type="button"
                        className="btn btn-xs btn-outline"
                        style={{
                          color: 'var(--primary-600)',
                          borderColor: 'rgba(99, 102, 241, 0.4)',
                          gap: 4,
                          display: 'inline-flex',
                          alignItems: 'center',
                          fontSize: '0.75rem',
                        }}
                        onClick={(e) => handleOpenMoveModal(e, activeMedia)}
                        title="انتقال ویدیو به پوشه دیگر"
                      >
                        <HiOutlineArrowsRightLeft size={14} />
                        <span>انتقال به پوشه</span>
                      </button>
                      <button
                        type="button"
                        className="btn btn-xs btn-outline"
                        style={{ color: '#ef4444', borderColor: '#ef4444', gap: 4, display: 'inline-flex', alignItems: 'center', fontSize: '0.75rem' }}
                        onClick={(e) => handleDeleteVideo(e, activeMedia)}
                        title="حذف این ویدیو"
                      >
                        <HiOutlineTrash size={14} />
                        <span>حذف ویدیو</span>
                      </button>
                    </>
                  )}
                </div>
              </div>
              <button
                className={styles.closeBtn}
                onClick={() => setActiveMedia(null)}
                type="button"
              >
                <HiOutlineXMark />
              </button>
            </div>

            {isVideo(activeMedia) ? (
              <div className={styles.videoPlayerWrapper}>
                <video
                  src={getMediaUrl(activeMedia.file_url || activeMedia.video_url)}
                  controls
                  autoPlay
                  className={styles.videoElement}
                />
              </div>
            ) : (
              <div className={styles.imageViewerWrapper}>
                <img
                  src={getMediaUrl(activeMedia.file_url)}
                  alt={activeMedia.title}
                  className={styles.imageElement}
                />
              </div>
            )}

            <div className={styles.playerFooter}>
              <div className={styles.playerTitleRow} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                <div>
                  <div className={styles.playerTitle}>{activeMedia.title}</div>
                  <div className={styles.playerMeta}>
                    <span>📁 پوشه: {activeMedia.folder_name || 'عمومی'}</span>
                    <span>👤 مدرس: {activeMedia.teacher_name || 'دبیر مربوطه'}</span>
                    <span>🏛️ کلاس: {activeMedia.class_name || 'کلاس درس'}</span>
                    <span style={{ color: getAudienceInfo(activeMedia.target_audience).color, fontWeight: 750 }}>
                      🎯 مخاطبان: {getAudienceInfo(activeMedia.target_audience).label}
                    </span>
                    <span>👁️ {activeMedia.views_count || 1} بازدید</span>
                    {activeMedia.pdf_url && (
                      <span style={{ color: '#dc2626', fontWeight: 700 }}>
                        📄 دارای فایل جزوه پیوست: {activeMedia.pdf_name || 'فایل PDF'}
                      </span>
                    )}
                  </div>
                </div>


                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  {activeMedia.pdf_url && (
                    <button
                      type="button"
                      className="btn btn-sm btn-outline"
                      style={{
                        borderColor: '#ef4444',
                        color: '#dc2626',
                        background: 'rgba(239, 68, 68, 0.06)',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        fontSize: '0.85rem',
                        fontWeight: 700,
                      }}
                      onClick={(e) => handleDownloadPdf(e, activeMedia)}
                      title={`دانلود جزوه PDF (${activeMedia.pdf_name || 'فایل ضمیمه'})`}
                    >
                      <FaFilePdf size={16} color="#ef4444" />
                      <span>دانلود جزوه (PDF)</span>
                    </button>
                  )}

                  <button
                    type="button"
                    className="btn btn-sm btn-outline"
                    style={{
                      color: 'var(--primary-600)',
                      borderColor: 'var(--primary-500)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      fontSize: '0.85rem',
                      fontWeight: 700,
                    }}
                    onClick={(e) => handleDownloadMedia(e, activeMedia)}
                  >
                    <HiOutlineArrowDownTray size={18} />
                    <span>دانلود ویدیو</span>
                  </button>
                </div>
              </div>
              {activeMedia.description && (
                <p className={styles.playerDesc}>{activeMedia.description}</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Upload Modal (انتخاب پوشه درس و امکان ساخت فوری فایل) ── */}
      {showUploadModal && (
        <div className={styles.modalOverlay} onClick={() => setShowUploadModal(false)}>
          <div
            className={styles.modalContent}
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: 650 }}
          >
            <div className={styles.modalHeader}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    background: 'rgba(99, 102, 241, 0.1)',
                    color: 'var(--primary-600)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <HiOutlineCloudArrowUp size={20} />
                </div>
                <h2>بارگذاری رسانه در فایل درس</h2>
              </div>
              <button
                className={styles.closeBtn}
                onClick={() => setShowUploadModal(false)}
                type="button"
              >
                <HiOutlineXMark />
              </button>
            </div>

            <form onSubmit={handleUploadSubmit} className={styles.modalBody}>
              {/* Folder Selection & On-the-fly Folder Creation */}
              <div
                style={{
                  background: 'var(--bg-secondary)',
                  padding: '14px 16px',
                  borderRadius: '14px',
                  border: '1.5px solid var(--border-color)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label
                    style={{
                      fontWeight: 800,
                      fontSize: '0.9375rem',
                      color: 'var(--text-primary)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    <HiOutlineFolder size={20} color="var(--primary-600)" />
                    <span>فایل / پوشه درس مقصد</span>
                    <span style={{ color: '#ef4444' }}>*</span>
                  </label>

                  <button
                    type="button"
                    onClick={() => {
                      setIsCreatingFolderInline(!isCreatingFolderInline);
                      if (!isCreatingFolderInline) setInlineNewFolderName('');
                    }}
                    className="btn btn-xs btn-outline"
                    style={{ fontSize: '0.78rem', gap: 4, color: 'var(--primary-600)', borderColor: 'var(--primary-400)' }}
                  >
                    {isCreatingFolderInline ? '✕ انتخاب از فایل‌های موجود' : '➕ ساخت فایل جدید برای این درس'}
                  </button>
                </div>

                {!isCreatingFolderInline ? (
                  <div>
                    <select
                      id="upload_folder_select"
                      className="input"
                      value={uploadFolder}
                      onChange={(e) => {
                        if (e.target.value === '__NEW__') {
                          setIsCreatingFolderInline(true);
                        } else {
                          setUploadFolder(e.target.value);
                        }
                      }}
                      style={{ fontWeight: 700 }}
                    >
                      {folders.map((f) => (
                        <option key={f.name} value={f.name}>
                          📁 {f.name} ({videos.filter((v) => (v.folder_name || 'عمومی') === f.name).length} ویدیو)
                        </option>
                      ))}
                      <option value="__NEW__">➕ ساخت فایل / پوشه جدید...</option>
                    </select>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginTop: 4, display: 'block' }}>
                      ویدیو یا عکس در پوشه انتخابی قرار می‌گیرد تا دانش‌آموزان و دبیر به تفکیک درس به آن دسترسی داشته باشند.
                    </span>
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input
                      type="text"
                      className="input"
                      placeholder="نام فایل جدید (مثلاً: ریاضی دوازدهم - فصل دوم)"
                      value={inlineNewFolderName}
                      onChange={(e) => setInlineNewFolderName(e.target.value)}
                      autoFocus
                      style={{ flex: 1 }}
                    />
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={handleSaveInlineFolder}
                      style={{ whiteSpace: 'nowrap' }}
                    >
                      ثبت و انتخاب
                    </button>
                  </div>
                )}
              </div>

              {/* Target Audience Selector (انتخاب گروه مخاطبان: معلمان، دانش‌آموزان، اولیا یا هر سه گروه) */}
              <div className={styles.audienceSection}>
                <div className={styles.audienceSectionHeader}>
                  <label className={styles.audienceSectionTitle}>
                    <span>🎯</span>
                    <span>گروه مخاطبان هدف (ارسال و نمایش برای):</span>
                    <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>
                    مشخص کنید این ویدیو / رسانه برای چه گروهی نمایش داده شود
                  </span>
                </div>

                <div className={styles.audienceGrid}>
                  {AUDIENCE_OPTIONS.map((opt) => {
                    const isSelected = uploadAudience === opt.id;
                    return (
                      <div
                        key={opt.id}
                        className={`${styles.audienceCard} ${isSelected ? styles.audienceCardActive : ''}`}
                        onClick={() => setUploadAudience(opt.id)}
                        style={{
                          borderColor: isSelected ? opt.color : undefined,
                        }}
                      >
                        <div className={styles.audienceCardIcon}>{opt.icon}</div>
                        <div className={styles.audienceCardLabel} style={{ color: isSelected ? opt.color : undefined }}>
                          {opt.label}
                        </div>
                        <div className={styles.audienceCardDesc}>{opt.desc}</div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Dropzone */}
              <div
                className={styles.dropzone}
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  style={{ display: 'none' }}
                  accept="video/*,image/*"
                  onChange={handleFileChange}
                />
                <div className={styles.dropzoneIcon}>
                  <HiOutlineCloudArrowUp />
                </div>
                <div className={styles.dropzoneText}>
                  برای انتخاب فایل کلیک کنید یا فایل را اینجا بکشید
                </div>
                <div className={styles.dropzoneHint}>
                  پشتیبانی از ویدیوهای MP4, WEBM و تصاویر PNG, JPG
                </div>
              </div>

              {/* Selected File Preview */}
              {selectedFile && (
                <div className={styles.filePreview}>
                  {filePreview?.type === 'image' && (
                    <img
                      src={filePreview.url}
                      alt="پیش‌نمایش"
                      className={styles.filePreviewThumb}
                    />
                  )}
                  {filePreview?.type === 'video' && (
                    <video
                      src={filePreview.url}
                      className={styles.filePreviewThumb}
                    />
                  )}
                  <div className={styles.filePreviewInfo}>
                    <div className={styles.fileName}>{selectedFile.name}</div>
                    <div className={styles.fileSize}>
                      {(selectedFile.size / (1024 * 1024)).toFixed(2)} مگابایت
                    </div>
                  </div>
                </div>
              )}

              {/* Title */}
              <div className="input-group">
                <label className="input-label" htmlFor="video_title">
                  عنوان جلسه یا تصویر
                </label>
                <input
                  id="video_title"
                  className="input"
                  type="text"
                  placeholder="مثلاً: حل تست‌های جامع حرکت‌شناسی جلسه چهارم"
                  value={uploadTitle}
                  onChange={(e) => setUploadTitle(e.target.value)}
                  required
                />
              </div>

              {/* Category */}
              <div className="input-group">
                <label className="input-label" htmlFor="video_category">
                  نوع محتوا
                </label>
                <select
                  id="video_category"
                  className="input"
                  value={uploadCategory}
                  onChange={(e) => setUploadCategory(e.target.value)}
                >
                  <option value="تدریس">🎥 ویدیوی تدریس کلاسی</option>
                  <option value="جزوه تصویری">🖼️ تصویر تخته کلاس و جزوه</option>
                  <option value="المپیاد">🏆 تحلیل تست و المپیاد</option>
                  <option value="رفع اشکال">💡 جلسه رفع اشکال</option>
                </select>
              </div>

              {/* Description */}
              <div className="input-group">
                <label className="input-label" htmlFor="video_desc">
                  توضیحات و سرفصل‌ها (اختیاری)
                </label>
                <textarea
                  id="video_desc"
                  className="input"
                  rows={2}
                  placeholder="نکات مهم و مباحث تدریس‌شده در این جلسه..."
                  value={uploadDesc}
                  onChange={(e) => setUploadDesc(e.target.value)}
                />
              </div>

              {/* Optional PDF Document Attachment (پیوست فایل جزوه درس) */}
              <div
                style={{
                  background: 'rgba(239, 68, 68, 0.04)',
                  border: '1.5px dashed rgba(239, 68, 68, 0.3)',
                  borderRadius: 'var(--radius-lg)',
                  padding: '12px 14px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                  marginBottom: 10,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label style={{ fontWeight: 750, fontSize: '0.85rem', color: '#dc2626', display: 'flex', alignItems: 'center', gap: 6, margin: 0 }}>
                    <FaFilePdf size={16} />
                    <span>پیوست فایل جزوه یا اسلایدهای تدریس (PDF) — اختیاری:</span>
                  </label>
                  {uploadPdfFile && (
                    <button
                      type="button"
                      onClick={() => setUploadPdfFile(null)}
                      style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: '0.75rem', cursor: 'pointer', fontWeight: 700 }}
                    >
                      ✕ حذف فایل PDF
                    </button>
                  )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <input
                    type="file"
                    id="new_video_pdf_input"
                    accept=".pdf,application/pdf"
                    style={{ display: 'none' }}
                    onChange={(e) => setUploadPdfFile(e.target.files?.[0] || null)}
                  />
                  <label
                    htmlFor="new_video_pdf_input"
                    className="btn btn-xs btn-outline"
                    style={{
                      cursor: 'pointer',
                      borderColor: '#ef4444',
                      color: '#dc2626',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      fontSize: '0.78rem',
                      padding: '6px 12px',
                    }}
                  >
                    <HiOutlinePaperClip size={15} />
                    <span>{uploadPdfFile ? 'تغییر فایل PDF' : '➕ پیوست فایل PDF'}</span>
                  </label>

                  {uploadPdfFile ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', color: 'var(--text-primary)', overflow: 'hidden' }}>
                      <span style={{ fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 260 }}>
                        {uploadPdfFile.name}
                      </span>
                      <span style={{ color: 'var(--text-tertiary)', fontSize: '0.72rem' }}>
                        ({(uploadPdfFile.size / (1024 * 1024)).toFixed(2)} MB)
                      </span>
                    </div>
                  ) : (
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                      می‌توانید فایل جزوه، نمونه سوال یا اسلاید این جلسه را ضمیمه کنید تا همراه ویدیو دانلود شود.
                    </span>
                  )}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '10px' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowUploadModal(false)}
                  disabled={isUploading}
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={isUploading || !selectedFile}
                >
                  {isUploading ? 'در حال بارگذاری فایل...' : `بارگذاری در «${uploadFolder}»`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Standalone Modal: ساخت پوشه / فایل جدید ── */}
      {showNewFolderModal && (
        <div className={styles.modalOverlay} onClick={() => setShowNewFolderModal(false)}>
          <div
            className={styles.modalContent}
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: 480 }}
          >
            <div className={styles.modalHeader}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    background: 'rgba(99, 102, 241, 0.1)',
                    color: 'var(--primary-600)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <HiOutlineFolderPlus size={20} />
                </div>
                <h2>ساخت پوشه / فایل درس جدید</h2>
              </div>
              <button
                className={styles.closeBtn}
                onClick={() => setShowNewFolderModal(false)}
                type="button"
              >
                <HiOutlineXMark />
              </button>
            </div>

            <form onSubmit={handleCreateFolderSubmit} className={styles.modalBody}>
              <div className="input-group">
                <label className="input-label" htmlFor="new_folder_name">
                  نام فایل یا مبحث درسی <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  id="new_folder_name"
                  type="text"
                  className="input"
                  placeholder="مثال: ریاضی دوازدهم - کاربرد مشتق"
                  value={newFolderNameInput}
                  onChange={(e) => setNewFolderNameInput(e.target.value)}
                  autoFocus
                  required
                />
              </div>

              <div className="input-group">
                <label className="input-label">رنگ نشانگر پوشه</label>
                <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                  {PRESET_FOLDER_COLORS.map((c) => (
                    <div
                      key={c}
                      onClick={() => setNewFolderColorInput(c)}
                      style={{
                        width: 30,
                        height: 30,
                        borderRadius: '50%',
                        backgroundColor: c,
                        cursor: 'pointer',
                        border: newFolderColorInput === c ? '3px solid #fff' : '2px solid transparent',
                        boxShadow: newFolderColorInput === c ? `0 0 0 2px ${c}` : 'none',
                        transition: 'transform 0.15s ease',
                      }}
                    />
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 12 }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowNewFolderModal(false)}
                >
                  انصراف
                </button>
                <button type="submit" className="btn btn-primary">
                  <span>ایجاد و ثبت پوشه</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Move Video to Folder Modal (انتقال ویدیو به پوشه دیگر) ── */}
      {movingVideo && (
        <div className={styles.modalOverlay} onClick={() => setMovingVideo(null)}>
          <div
            className={styles.modalContent}
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: 520 }}
          >
            <div className={styles.modalHeader}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    background: 'rgba(99, 102, 241, 0.12)',
                    color: 'var(--primary-600)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <HiOutlineArrowsRightLeft size={20} />
                </div>
                <div>
                  <h2 style={{ fontSize: '1.1rem', margin: 0 }}>انتقال ویدیو به پوشه دیگر</h2>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>
                    انتقال سریع ویدیو به سرفصل یا درس مربوطه
                  </span>
                </div>
              </div>
              <button
                className={styles.closeBtn}
                onClick={() => setMovingVideo(null)}
                type="button"
              >
                <HiOutlineXMark />
              </button>
            </div>

            <div className={styles.modalBody}>
              {/* Current Video Info */}
              <div
                style={{
                  background: 'var(--bg-secondary)',
                  padding: '12px 14px',
                  borderRadius: '12px',
                  border: '1px solid var(--border-color)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                }}
              >
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 8,
                    background: 'rgba(99, 102, 241, 0.1)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--primary-600)',
                    flexShrink: 0,
                  }}
                >
                  <HiOutlineFilm size={22} />
                </div>
                <div style={{ overflow: 'hidden' }}>
                  <div
                    style={{
                      fontWeight: 800,
                      fontSize: '0.9rem',
                      color: 'var(--text-primary)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {movingVideo.title}
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)', marginTop: 2 }}>
                    پوشه فعلی: <span style={{ fontWeight: 700, color: 'var(--primary-600)' }}>📁 {movingVideo.folder_name || 'عمومی'}</span>
                  </div>
                </div>
              </div>

              {/* Destination Folder Selector */}
              <div style={{ marginTop: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <label style={{ fontWeight: 700, fontSize: '0.875rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <HiOutlineFolder size={18} color="var(--primary-600)" />
                    <span>انتخاب پوشه مقصد جدید:</span>
                  </label>

                  <button
                    type="button"
                    onClick={() => {
                      setIsMoveCreatingFolder(!isMoveCreatingFolder);
                      if (!isMoveCreatingFolder) setInlineMoveNewFolder('');
                    }}
                    className="btn btn-xs btn-outline"
                    style={{ fontSize: '0.75rem', gap: 4 }}
                  >
                    {isMoveCreatingFolder ? '✕ انتخاب از پوشه‌های موجود' : '➕ ساخت پوشه جدید...'}
                  </button>
                </div>

                {!isMoveCreatingFolder ? (
                  <div className={styles.moveFolderList}>
                    {folders.map((f) => {
                      const isCurrent = (movingVideo.folder_name || 'عمومی') === f.name;
                      const isSelected = targetMoveFolder === f.name;

                      return (
                        <div
                          key={f.name}
                          className={`${styles.moveFolderItem} ${isSelected ? styles.moveFolderItemActive : ''}`}
                          onClick={() => setTargetMoveFolder(f.name)}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div
                              style={{
                                width: 32,
                                height: 32,
                                borderRadius: 8,
                                background: `${f.color || '#6366f1'}1f`,
                                color: f.color || '#6366f1',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                              }}
                            >
                              <HiOutlineFolder size={18} />
                            </div>
                            <span style={{ fontWeight: 700, fontSize: '0.875rem' }}>{f.name}</span>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            {isCurrent && (
                              <span style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', background: 'var(--bg-card)', padding: '2px 8px', borderRadius: '10px' }}>
                                پوشه فعلی
                              </span>
                            )}
                            <input
                              type="radio"
                              name="move_target_folder"
                              checked={isSelected}
                              onChange={() => setTargetMoveFolder(f.name)}
                              style={{ accentColor: 'var(--primary-600)', cursor: 'pointer' }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div style={{ marginTop: 8 }}>
                    <input
                      type="text"
                      className="input"
                      placeholder="نام پوشه جدید را بنویسید (مثلاً: زیست‌شناسی دهم - فصل ۲)"
                      value={inlineMoveNewFolder}
                      onChange={(e) => setInlineMoveNewFolder(e.target.value)}
                      autoFocus
                    />
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginTop: 4, display: 'block' }}>
                      این پوشه ساخته شده و ویدیو مستقیماً به آن منتقل می‌گردد.
                    </span>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 22 }}>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setMovingVideo(null)}
                >
                  انصراف
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleConfirmMove}
                  disabled={isMovingSubmitting}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                >
                  <HiOutlineArrowsRightLeft size={16} />
                  <span>{isMovingSubmitting ? 'در حال انتقال...' : 'تایید و انتقال ویدیو'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: پیوست / تغییر فایل PDF جزوه به ویدیو ── */}
      {attachingPdfVideo && (
        <div className={styles.modalOverlay} onClick={() => setAttachingPdfVideo(null)}>
          <div
            className={styles.modalContent}
            style={{ maxWidth: 500 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.modalHeader}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 10,
                    background: 'rgba(239, 68, 68, 0.1)',
                    color: '#dc2626',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <FaFilePdf size={20} />
                </div>
                <div>
                  <h2 style={{ fontSize: '1.15rem', margin: 0 }}>پیوست جزوه یا فایل PDF</h2>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>
                    افزودن یا تغییر فایل PDF قابل دانلود در کنار این فیلم
                  </span>
                </div>
              </div>
              <button
                className={styles.closeBtn}
                onClick={() => setAttachingPdfVideo(null)}
                type="button"
              >
                <HiOutlineXMark />
              </button>
            </div>

            <form onSubmit={handleSaveAttachPdf} className={styles.modalBody}>
              {/* Video Info Banner */}
              <div
                style={{
                  background: 'var(--bg-secondary)',
                  padding: '12px 14px',
                  borderRadius: '12px',
                  border: '1px solid var(--border-color)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                }}
              >
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 8,
                    background: 'rgba(99, 102, 241, 0.1)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--primary-600)',
                    flexShrink: 0,
                  }}
                >
                  <HiOutlineFilm size={20} />
                </div>
                <div style={{ overflow: 'hidden' }}>
                  <div style={{ fontWeight: 800, fontSize: '0.88rem', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {attachingPdfVideo.title}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginTop: 2 }}>
                    📁 پوشه: {attachingPdfVideo.folder_name || 'عمومی'}
                  </div>
                </div>
              </div>

              {/* Current PDF Status (if already has PDF) */}
              {attachingPdfVideo.pdf_url && (
                <div
                  style={{
                    background: 'rgba(239, 68, 68, 0.05)',
                    border: '1px solid rgba(239, 68, 68, 0.2)',
                    borderRadius: '12px',
                    padding: '12px 14px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 10,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, overflow: 'hidden' }}>
                    <FaFilePdf size={20} color="#ef4444" style={{ flexShrink: 0 }} />
                    <div style={{ overflow: 'hidden' }}>
                      <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {attachingPdfVideo.pdf_name || 'جزوه ضمیمه‌شده فعلی'}
                      </div>
                      <div style={{ fontSize: '0.72rem', color: '#16a34a' }}>✓ هم‌اکنون این فایل پیوست است</div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <button
                      type="button"
                      className="btn btn-xs btn-outline"
                      onClick={(e) => handleDownloadPdf(e, attachingPdfVideo)}
                      style={{ fontSize: '0.75rem', color: '#dc2626', borderColor: '#ef4444' }}
                    >
                      دانلود فایل
                    </button>
                    <button
                      type="button"
                      className="btn btn-xs btn-outline"
                      onClick={(e) => handleRemoveAttachedPdf(e, attachingPdfVideo)}
                      style={{ fontSize: '0.75rem', color: '#ef4444', borderColor: '#ef4444' }}
                    >
                      حذف پیوست
                    </button>
                  </div>
                </div>
              )}

              {/* File Input */}
              <div className="input-group">
                <label className="input-label" htmlFor="attach_pdf_file_input">
                  {attachingPdfVideo.pdf_url ? 'انتخاب فایل PDF جدید برای جایگزینی:' : 'انتخاب فایل PDF جزوه:'}
                </label>
                <input
                  id="attach_pdf_file_input"
                  type="file"
                  accept=".pdf,application/pdf"
                  className="input"
                  onChange={(e) => setSelectedPdfFile(e.target.files?.[0] || null)}
                  required={!attachingPdfVideo.pdf_url}
                />
                <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginTop: 4, display: 'block' }}>
                  فایل‌های با فرمت PDF با حجم تا ۵۰ مگابایت پشتیبانی می‌شوند.
                </span>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setAttachingPdfVideo(null)}
                  disabled={isAttachingPdf}
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={isAttachingPdf || !selectedPdfFile}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                >
                  <FaFilePdf size={16} />
                  <span>{isAttachingPdf ? 'در حال بارگذاری پیوست...' : 'ذخیره و پیوست فایل PDF'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal: تغییر گروه مخاطبان ویدیو (ویژه مدیر و دبیر) ── */}
      {audienceEditModalVideo && (
        <div className={styles.modalOverlay} onClick={() => setAudienceEditModalVideo(null)}>
          <div
            className={styles.modalContent}
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: 520 }}
          >
            <div className={styles.modalHeader}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 10,
                    background: 'rgba(99, 102, 241, 0.1)',
                    color: 'var(--primary-600)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '1.2rem',
                  }}
                >
                  🎯
                </div>
                <div>
                  <h2 style={{ fontSize: '1.1rem' }}>تغییر گروه مخاطبان رسانه</h2>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)', marginTop: 2 }}>
                    {audienceEditModalVideo.title}
                  </div>
                </div>
              </div>
              <button
                className={styles.closeBtn}
                onClick={() => setAudienceEditModalVideo(null)}
                type="button"
              >
                <HiOutlineXMark />
              </button>
            </div>

            <div className={styles.modalBody}>
              <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: 12 }}>
                مشخص کنید این ویدیو یا رسانه برای کدام دسته از کاربران (معلمان، دانش‌آموزان یا اولیا) در دسترس باشد:
              </p>

              <div className={styles.audienceGrid} style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
                {AUDIENCE_OPTIONS.map((opt) => {
                  const isSelected = editAudienceVal === opt.id;
                  return (
                    <div
                      key={opt.id}
                      className={`${styles.audienceCard} ${isSelected ? styles.audienceCardActive : ''}`}
                      onClick={() => setEditAudienceVal(opt.id)}
                      style={{
                        borderColor: isSelected ? opt.color : undefined,
                        padding: '14px 12px',
                      }}
                    >
                      <div className={styles.audienceCardIcon} style={{ fontSize: '1.75rem' }}>{opt.icon}</div>
                      <div className={styles.audienceCardLabel} style={{ color: isSelected ? opt.color : undefined }}>
                        {opt.label}
                      </div>
                      <div className={styles.audienceCardDesc}>{opt.desc}</div>
                    </div>
                  );
                })}
              </div>

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setAudienceEditModalVideo(null)}
                >
                  انصراف
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => handleUpdateAudience(audienceEditModalVideo.id, editAudienceVal)}
                >
                  ذخیره و اعمال دسترسی
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

