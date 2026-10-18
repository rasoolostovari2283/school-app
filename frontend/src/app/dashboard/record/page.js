'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import toast, { Toaster } from 'react-hot-toast';
import useAuthStore from '../../../stores/authStore';
import {
  HiPlus,
  HiOutlinePencil,
  HiOutlinePaintBrush,
  HiOutlineArrowUturnLeft,
  HiOutlineArrowUturnRight,
  HiOutlineTrash,
  HiOutlineArrowDownTray,
  HiOutlineCloudArrowUp,
  HiOutlinePlay,
  HiOutlinePause,
  HiOutlineStop,
  HiOutlineVideoCamera,
  HiOutlineCheck,
  HiOutlineXMark,
  HiOutlineSquares2X2,
  HiOutlineSparkles,
  HiOutlineMicrophone,
  HiOutlineEye,
  HiOutlineClock,
  HiOutlineCalendar,
  HiOutlineAcademicCap,
  HiOutlineDocumentText,
  HiOutlineChevronRight,
  HiOutlineChevronLeft,
  HiOutlineMagnifyingGlassPlus,
  HiOutlineMagnifyingGlassMinus,
  HiOutlineArrowsPointingOut,
  HiOutlinePhoto,
  HiOutlineFilm,
  HiOutlineSpeakerWave,
  HiOutlineSpeakerXMark,
  HiOutlineArrowsRightLeft,
  HiOutlineFolder,
  HiOutlineFolderPlus,
  HiOutlineShare,
  HiOutlinePaperAirplane,
  HiOutlineMagnifyingGlass,
  HiOutlineBars3,
  HiOutlineChevronDown,
} from 'react-icons/hi2';
import { LuEraser } from 'react-icons/lu';
import { FaFilePdf, FaFilePowerpoint } from 'react-icons/fa6';
import { loadPptxPresentation } from '../../../lib/pptxRenderer';
import api from '../../../lib/api';
import styles from './record.module.css';

// Pre-defined color palette
const PALETTE_COLORS = [
  { name: 'مشکی', value: '#1e293b' },
  { name: 'سرمه‌ای', value: '#2563eb' },
  { name: 'قرمز', value: '#ef4444' },
  { name: 'سبز', value: '#10b981' },
  { name: 'طلایی / زرد', value: '#f59e0b' },
  { name: 'بنفش', value: '#8b5cf6' },
  { name: 'سفید', value: '#ffffff' },
];

const BRUSH_SIZES = [
  { label: 'نازک', size: 2, dotSize: 4 },
  { label: 'متوسط', size: 5, dotSize: 7 },
  { label: 'ضخیم', size: 10, dotSize: 11 },
  { label: 'خیلی ضخیم', size: 18, dotSize: 16 },
];

export default function ClassRecordStudioPage() {
  // ── States for Setup & Studio ──
  const [showNewModal, setShowNewModal] = useState(false);
  const [isStudioOpen, setIsStudioOpen] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [previewVideoUrl, setPreviewVideoUrl] = useState(null);

  // New Project Form
  const [projectName, setProjectName] = useState('');
  const [selectedClassId, setSelectedClassId] = useState('');
  const [boardType, setBoardType] = useState('white'); // 'white' | 'grid' | 'blackboard'
  const [recordAudio, setRecordAudio] = useState(true);
  const [classesList, setClassesList] = useState([]);

  // Whiteboard Tool States
  const [tool, setTool] = useState('pen'); // 'pen' | 'highlighter' | 'eraser' | 'line' | 'arrow' | 'rect' | 'circle'
  const [currentColor, setCurrentColor] = useState('#1e293b');
  const [brushSize, setBrushSize] = useState(5);
  const [isDrawing, setIsDrawing] = useState(false);
  const [showToolsMenu, setShowToolsMenu] = useState(false);

  // Recording States
  const [recStatus, setRecStatus] = useState('idle'); // 'idle' | 'recording' | 'paused'
  const [recSeconds, setRecSeconds] = useState(0);
  const [recordedBlob, setRecordedBlob] = useState(null);
  const [recordedVideoUrl, setRecordedVideoUrl] = useState(null);
  const [isUploading, setIsUploading] = useState(false);

  // Gallery of previous sessions
  const [recordedSessions, setRecordedSessions] = useState([]);

  // Move Session to Folder State (پوشه‌بندی و انتقال ویدیوهای ضبط شده)
  const [movingSession, setMovingSession] = useState(null);
  const [targetFolder, setTargetFolder] = useState('تخته هوشمند');
  const [isCreatingNewFolder, setIsCreatingNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [availableFolders, setAvailableFolders] = useState([
    { name: 'عمومی', color: '#6366f1' },
    { name: 'تخته هوشمند', color: '#8b5cf6' },
    { name: 'حسابان ۲', color: '#10b981' },
    { name: 'فیزیک پیشرفته', color: '#f59e0b' },
    { name: 'شیمی یازدهم', color: '#ec4899' },
  ]);

  // Save Modal Destination Folder State (پوشه ذخیره‌سازی ویدیو در بخش ویدیوها و رسانه‌ها)
  const [saveTargetFolder, setSaveTargetFolder] = useState('تخته هوشمند');
  const [isSaveCreatingFolder, setIsSaveCreatingFolder] = useState(false);
  const [saveNewFolderName, setSaveNewFolderName] = useState('');

  const { user } = useAuthStore();
  const router = useRouter();

  // Share to Messages State (اشتراک‌گذاری فیلم ضبط شده در پیام‌ها)
  const [showShareModal, setShowShareModal] = useState(false);
  const [sharingSession, setSharingSession] = useState(null);
  const [shareDirectory, setShareDirectory] = useState({ staff: [], students: [], all: [] });
  const [isLoadingDirectory, setIsLoadingDirectory] = useState(false);
  const [shareRoleTab, setShareRoleTab] = useState('all'); // 'all' | 'teacher' | 'student'
  const [shareSearch, setShareSearch] = useState('');
  const [selectedRecipient, setSelectedRecipient] = useState(null);
  const [shareMessageText, setShareMessageText] = useState('سلام، ویدیوی ضبط شده روی تخته هوشمند خدمت شما 🎬');
  const [isSendingShare, setIsSendingShare] = useState(false);

  // Canvas Refs
  const canvasRef = useRef(null);
  const drawingCanvasRef = useRef(null); // Offscreen canvas holding pure user strokes
  const startPosRef = useRef({ x: 0, y: 0 });
  const historyRef = useRef([]); // Undo snapshots of drawingCanvas
  const redoRef = useRef([]);

  // Document, Image & Video Media States & Refs
  const [docType, setDocType] = useState('pdf'); // 'pdf' | 'pptx' | 'image' | 'video'
  const [pdfDocument, setPdfDocument] = useState(null);
  const [pptxPresentation, setPptxPresentation] = useState(null);
  const [pdfTotalPages, setPdfTotalPages] = useState(0);
  const [pdfCurrentPage, setPdfCurrentPage] = useState(1);
  const [pdfFileName, setPdfFileName] = useState('');
  const [isLoadingPdf, setIsLoadingPdf] = useState(false);
  const [pdfZoom, setPdfZoom] = useState(1.0);
  const [pdfFitMode, setPdfFitMode] = useState('fit-width'); // 'fit-width' | 'fit-height'
  const [pdfOffsetY, setPdfOffsetY] = useState(0);
  const pdfCanvasRef = useRef(null);
  const pdfImageRef = useRef(null);
  const docFileInputRef = useRef(null);
  const imageFileInputRef = useRef(null);
  const videoFileInputRef = useRef(null);
  const videoElementRef = useRef(null);
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const [videoDuration, setVideoDuration] = useState(0);
  const [videoCurrentTime, setVideoCurrentTime] = useState(0);
  const [isVideoMuted, setIsVideoMuted] = useState(false);
  const pageCacheRef = useRef(new Map());

  // Whiteboard Multi-Page & PDF Export States & Refs
  const [boardCurrentPage, setBoardCurrentPage] = useState(1);
  const [boardTotalPages, setBoardTotalPages] = useState(1);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const boardPagesRef = useRef([
    { pageNum: 1, drawingDataUrl: null, history: [], redo: [], boardType: 'white' }
  ]);

  // MediaRecorder Refs
  const mediaRecorderRef = useRef(null);
  const recordedChunksRef = useRef([]);
  const timerIntervalRef = useRef(null);
  const micStreamRef = useRef(null);

  // ── 1. Load initial data (classes & saved recordings) ──
  useEffect(() => {
    // Pre-warm PDF.js engine in the background for instant zero-wait file opening
    getPdfJs().catch(() => {});

    // Load classes for teacher
    const fetchClasses = async () => {
      try {
        const res = await api.get('/classes');
        if (res.data?.data?.classes) {
          setClassesList(res.data.data.classes);
          if (res.data.data.classes.length > 0) {
            setSelectedClassId(res.data.data.classes[0].id);
          }
        }
      } catch (err) {
        console.warn('Could not load classes list:', err);
      }
    };
    fetchClasses();

    // Load saved local recordings
    loadUserRecordings();

    // Fetch folders for whiteboard video categorization
    fetchAvailableFolders();
  }, [user?.id]);

  const getStorageKey = useCallback(() => {
    return user?.id ? `educonnect_recorded_sessions_${user.id}` : 'educonnect_recorded_sessions';
  }, [user?.id]);

  const loadUserRecordings = () => {
    try {
      const userKey = user?.id ? `educonnect_recorded_sessions_${user.id}` : null;
      let saved = userKey ? localStorage.getItem(userKey) : null;
      if (!saved) {
        saved = localStorage.getItem('educonnect_recorded_sessions');
      }
      if (saved) {
        setRecordedSessions(JSON.parse(saved));
      } else {
        setRecordedSessions([]);
      }
    } catch (e) {
      console.warn('LocalStorage load error:', e);
    }
  };

  // Save recordings to localStorage on change (namespaced per user & global)
  const saveSessionsToLocal = (sessions) => {
    setRecordedSessions(sessions);
    try {
      const key = getStorageKey();
      localStorage.setItem(key, JSON.stringify(sessions));
      localStorage.setItem('educonnect_recorded_sessions', JSON.stringify(sessions));
    } catch (e) {
      console.warn('LocalStorage limit:', e);
    }
  };

  // Fetch available course & media folders from backend + localStorage
  const fetchAvailableFolders = async () => {
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
      console.warn('Could not fetch folders from backend, using local:', e);
    }

    localFolders.forEach((lf) => {
      if (!folderList.some((f) => f.name === lf.name)) {
        folderList.push(lf);
      }
    });

    if (!folderList.some((f) => f.name === 'عمومی')) {
      folderList.unshift({ name: 'عمومی', color: '#6366f1' });
    }
    if (!folderList.some((f) => f.name === 'تخته هوشمند')) {
      folderList.push({ name: 'تخته هوشمند', color: '#8b5cf6' });
    }

    setAvailableFolders(folderList);
    try {
      localStorage.setItem('educonnect_video_folders', JSON.stringify(folderList));
    } catch (e) {}
  };

  // ── Share Video to Messages Handlers ──
  const fetchShareDirectory = async () => {
    setIsLoadingDirectory(true);
    try {
      const res = await api.get('/messages/directory');
      if (res.data?.success && res.data.data) {
        setShareDirectory(res.data.data);
      }
    } catch (err) {
      console.warn('Failed to load message directory:', err);
      toast.error('خطا در دریافت لیست معلمان و دوستان');
    } finally {
      setIsLoadingDirectory(false);
    }
  };

  const handleOpenShareModal = (session) => {
    setSharingSession(session);
    setSelectedRecipient(null);
    setShareSearch('');
    setShareRoleTab('all');
    setShareMessageText(`سلام، ویدیوی ضبط شده روی تخته هوشمند («${session.title || 'جلسه'}») خدمت شما 🎬`);
    setShowShareModal(true);
    fetchShareDirectory();
  };

  const getFilteredRecipients = () => {
    let list = [];
    if (shareRoleTab === 'teacher') {
      list = shareDirectory.staff || [];
    } else if (shareRoleTab === 'student') {
      list = shareDirectory.students || [];
    } else {
      list = shareDirectory.all || [];
    }

    list = list.filter((u) => u.id !== user?.id);

    if (shareSearch.trim()) {
      const q = shareSearch.trim().toLowerCase().replace(/^@/, '');
      list = list.filter((u) => {
        const name = (u.display_name || '').toLowerCase();
        const username = (u.username || '').toLowerCase();
        const dept = (u.department || '').toLowerCase();
        const job = (u.job_title || '').toLowerCase();
        return name.includes(q) || username.includes(q) || dept.includes(q) || job.includes(q);
      });
    }
    return list;
  };

  const handleSendShare = async () => {
    if (!selectedRecipient) {
      toast.error('لطفاً ابتدا معلم یا دوست مورد نظر را انتخاب فرمایید');
      return;
    }
    if (!sharingSession) return;

    setIsSendingShare(true);
    try {
      let finalVideoUrl = sharingSession.videoUrl;

      // If videoUrl is a local blob (blob:http...) or not yet uploaded to server, upload it first to get permanent URL
      if (!finalVideoUrl || finalVideoUrl.startsWith('blob:')) {
        let blobToUpload = recordedBlob;
        if (!blobToUpload && finalVideoUrl) {
          try {
            const resp = await fetch(finalVideoUrl);
            blobToUpload = await resp.blob();
          } catch (bErr) {
            console.warn('Failed to fetch blob from videoUrl:', bErr);
          }
        }

        if (blobToUpload) {
          const formData = new FormData();
          const fileName = `${sharingSession.title || 'تخته_هوشمند'}.webm`;
          formData.append('file', blobToUpload, fileName);
          const uploadRes = await api.post('/upload', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
          });
          if (uploadRes.data?.data?.url) {
            finalVideoUrl = uploadRes.data.data.url;
            const updatedSessions = recordedSessions.map((s) =>
              s.id === sharingSession.id ? { ...s, videoUrl: finalVideoUrl } : s
            );
            saveSessionsToLocal(updatedSessions);
          }
        }
      }

      if (!finalVideoUrl) {
        toast.error('آدرس ویدیوی ضبط شده معتبر نیست');
        setIsSendingShare(false);
        return;
      }

      // Send message with video attachment to selected teacher or classmate
      const attachmentItem = {
        name: sharingSession.title || 'ویدیوی تخته هوشمند',
        originalname: `${sharingSession.title || 'ویدیو'}.webm`,
        url: finalVideoUrl,
        is_video: true,
        mimetype: 'video/webm',
        duration_seconds: sharingSession.duration || 0,
      };

      await api.post('/messages', {
        receiver_id: selectedRecipient.id,
        content: shareMessageText.trim() || 'ویدیوی ضبط شده روی تخته هوشمند 🎬',
        attachments: [attachmentItem],
      });

      const recipientName = selectedRecipient.display_name;
      const recipientId = selectedRecipient.id;
      setShowShareModal(false);

      toast.success(
        (t) => (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span>ویدیو با موفقیت برای <strong>{recipientName}</strong> ارسال شد! 🎉</span>
            <button
              onClick={() => {
                toast.dismiss(t.id);
                router.push(`/dashboard/messages?user=${recipientId}`);
              }}
              style={{
                alignSelf: 'flex-start',
                background: 'var(--primary-600)',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                padding: '4px 10px',
                fontSize: '0.75rem',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              مشاهده در پیام‌ها 💬
            </button>
          </div>
        ),
        { duration: 6000 }
      );
    } catch (err) {
      console.error('Failed to share video in messages:', err);
      toast.error(err.response?.data?.message || 'خطا در ارسال ویدیو در پیام‌ها');
    } finally {
      setIsSendingShare(false);
    }
  };

  // Open Move Modal for Whiteboard Session
  const handleOpenMoveModal = (session) => {
    setMovingSession(session);
    setTargetFolder(session.folder_name || 'تخته هوشمند');
    setIsCreatingNewFolder(false);
    setNewFolderName('');
    fetchAvailableFolders();
  };

  // Confirm Move Whiteboard Session to Target Folder
  const handleConfirmMove = async () => {
    if (!movingSession) return;
    const finalFolder = isCreatingNewFolder && newFolderName.trim()
      ? newFolderName.trim()
      : targetFolder || 'تخته هوشمند';

    // 1. If new folder created, immediately add to availableFolders and localStorage
    if (isCreatingNewFolder && newFolderName.trim()) {
      const newFolderObj = { name: finalFolder, color: '#8b5cf6', count: 1 };
      setAvailableFolders((prev) => {
        const updated = prev.some((f) => f.name === finalFolder) ? prev : [...prev, newFolderObj];
        try {
          localStorage.setItem('educonnect_video_folders', JSON.stringify(updated));
        } catch (e) {}
        return updated;
      });

      // Also create on backend if accessible
      try {
        await api.post('/videos/folders', { name: finalFolder, color: '#8b5cf6' });
      } catch (e) {
        console.warn('Backend folder creation note:', e);
      }
    }

    // 2. Update local recordedSessions state & storage
    const updated = recordedSessions.map((s) =>
      s.id === movingSession.id || s.title === movingSession.title ? { ...s, folder_name: finalFolder } : s
    );
    saveSessionsToLocal(updated);

    try {
      const globalKey = 'educonnect_recorded_sessions';
      const raw = localStorage.getItem(globalKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        const updatedGlobal = parsed.map((s) =>
          s.id === movingSession.id || s.title === movingSession.title ? { ...s, folder_name: finalFolder } : s
        );
        localStorage.setItem(globalKey, JSON.stringify(updatedGlobal));
      }
    } catch (e) {}

    // 3. Update backend video folder if video exists on server
    try {
      if (movingSession.id) {
        await api.patch(`/videos/${movingSession.id}/folder`, { folder_name: finalFolder });
      }
    } catch (e) {
      console.warn('Backend patch video folder note:', e);
    }

    toast.success(`ویدیو با موفقیت به پوشه «${finalFolder}» منتقل شد 📁`);
    setMovingSession(null);
    setIsCreatingNewFolder(false);
    setNewFolderName('');
    setTargetFolder(finalFolder);
  };

  // ── 2. Canvas Setup & Drawing Engine ──

  // ── 2.2 Composite Canvas Rendering Engine (Ultra-High DPI & Responsive) ──
  const renderCompositeCanvas = useCallback(() => {
    const mainCanvas = canvasRef.current;
    const drawingCanvas = drawingCanvasRef.current;
    if (!mainCanvas || !drawingCanvas) return;

    const ctx = mainCanvas.getContext('2d');
    const dpr = Math.min(typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1, 3);
    const cssWidth = Math.round(mainCanvas.width / dpr);
    const cssHeight = Math.round(mainCanvas.height / dpr);

    ctx.save();
    // Scale coordinate matrix by dpr so all operations below use standard CSS pixels
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Draw Board Background
    if (boardType === 'blackboard') {
      ctx.fillStyle = '#1a2e22';
      ctx.fillRect(0, 0, cssWidth, cssHeight);

      // Blackboard subtle chalk grain
      const grad = ctx.createRadialGradient(cssWidth / 2, cssHeight / 2, 50, cssWidth / 2, cssHeight / 2, Math.max(cssWidth, cssHeight) / 1.2);
      grad.addColorStop(0, 'rgba(255, 255, 255, 0.03)');
      grad.addColorStop(1, 'rgba(0, 0, 0, 0.2)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, cssWidth, cssHeight);
    } else if (boardType === 'grid') {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, cssWidth, cssHeight);

      // Grid lines
      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 1;
      const gridSize = 32;
      ctx.beginPath();
      for (let x = gridSize; x < cssWidth; x += gridSize) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, cssHeight);
      }
      for (let y = gridSize; y < cssHeight; y += gridSize) {
        ctx.moveTo(0, y);
        ctx.lineTo(cssWidth, y);
      }
      ctx.stroke();
    } else {
      // Pure Whiteboard
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, cssWidth, cssHeight);
    }

    // Set high-quality image smoothing
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    // Draw PDF page, Image worksheet, or Video frame if open (Ultra-High Resolution)
    const mediaSource = pdfCanvasRef.current || pdfImageRef.current || videoElementRef.current;
    if (mediaSource) {
      const srcW = mediaSource.videoWidth || mediaSource.width;
      const srcH = mediaSource.videoHeight || mediaSource.height;

      if (srcW && srcH) {
        const isMobile = cssWidth < 768;
        let drawW, drawH;
        if (pdfFitMode === 'fit-width') {
          // On mobile, use comfortable full-screen readable width so small text is never crushed
          const targetW = (isMobile ? (cssWidth - 16) : Math.min(cssWidth - 60, Math.max(920, cssWidth * 0.72))) * pdfZoom;
          const scale = targetW / srcW;
          drawW = targetW;
          drawH = srcH * scale;
        } else {
          // Fits height
          const targetH = (cssHeight - (isMobile ? 90 : 150)) * pdfZoom;
          const scale = targetH / srcH;
          drawW = srcW * scale;
          drawH = targetH;
        }

        const drawX = (cssWidth - drawW) / 2;
        const baseY = pdfFitMode === 'fit-width' ? (isMobile ? 55 : 80) : (cssHeight - drawH) / 2;
        const drawY = baseY + pdfOffsetY;

        // Draw subtle shadow and clean container for media
        ctx.save();
        ctx.shadowColor = 'rgba(0, 0, 0, 0.28)';
        ctx.shadowBlur = isMobile ? 12 : 28;
        ctx.shadowOffsetY = isMobile ? 3 : 6;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(drawX, drawY, drawW, drawH);
        ctx.restore();

        ctx.drawImage(mediaSource, drawX, drawY, drawW, drawH);
      }
    }

    // Draw user strokes from offscreen drawingCanvas
    ctx.drawImage(drawingCanvas, 0, 0, cssWidth, cssHeight);
    ctx.restore();
  }, [boardType, pdfZoom, pdfFitMode, pdfOffsetY]);

  // Adjust canvas size to window/container with Retina / High-DPI support
  const initCanvases = useCallback(() => {
    const mainCanvas = canvasRef.current;
    if (!mainCanvas) return;

    const cssWidth = window.innerWidth;
    const cssHeight = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);

    if (!drawingCanvasRef.current) {
      drawingCanvasRef.current = document.createElement('canvas');
    }
    const drawingCanvas = drawingCanvasRef.current;

    // Preserve existing drawings on resize if any
    let tempImgData = null;
    if (drawingCanvas.width > 0 && drawingCanvas.height > 0) {
      try {
        tempImgData = drawingCanvas.getContext('2d').getImageData(0, 0, drawingCanvas.width, drawingCanvas.height);
      } catch (e) {}
    }

    // High-DPI backing buffer
    mainCanvas.width = Math.round(cssWidth * dpr);
    mainCanvas.height = Math.round(cssHeight * dpr);
    mainCanvas.style.width = `${cssWidth}px`;
    mainCanvas.style.height = `${cssHeight}px`;

    drawingCanvas.width = cssWidth;
    drawingCanvas.height = cssHeight;

    if (tempImgData) {
      drawingCanvas.getContext('2d').putImageData(tempImgData, 0, 0);
    }

    renderCompositeCanvas();
  }, [renderCompositeCanvas]);

  useEffect(() => {
    if (isStudioOpen) {
      initCanvases();
      window.addEventListener('resize', initCanvases);
      return () => window.removeEventListener('resize', initCanvases);
    }
  }, [isStudioOpen, initCanvases]);

  // Push state to undo stack
  const saveHistorySnapshot = useCallback(() => {
    const dCanvas = drawingCanvasRef.current;
    if (!dCanvas) return;
    const dCtx = dCanvas.getContext('2d');
    const snapshot = dCtx.getImageData(0, 0, dCanvas.width, dCanvas.height);

    historyRef.current.push(snapshot);
    if (historyRef.current.length > 25) {
      historyRef.current.shift();
    }
    redoRef.current = [];
  }, []);

  // Undo / Redo
  const handleUndo = () => {
    const dCanvas = drawingCanvasRef.current;
    if (!dCanvas || historyRef.current.length === 0) return;
    const dCtx = dCanvas.getContext('2d');

    // Save current to redo
    const current = dCtx.getImageData(0, 0, dCanvas.width, dCanvas.height);
    redoRef.current.push(current);

    const prev = historyRef.current.pop();
    dCtx.putImageData(prev, 0, 0);
    renderCompositeCanvas();
  };

  const handleRedo = () => {
    const dCanvas = drawingCanvasRef.current;
    if (!dCanvas || redoRef.current.length === 0) return;
    const dCtx = dCanvas.getContext('2d');

    const current = dCtx.getImageData(0, 0, dCanvas.width, dCanvas.height);
    historyRef.current.push(current);

    const next = redoRef.current.pop();
    dCtx.putImageData(next, 0, 0);
    renderCompositeCanvas();
  };

  // Clear Current Board Page Canvas
  const handleClearBoard = () => {
    if (window.confirm('آیا از پاک کردن برگه جاری تخته مطمئن هستید؟')) {
      saveHistorySnapshot();
      const dCanvas = drawingCanvasRef.current;
      if (dCanvas) {
        const dCtx = dCanvas.getContext('2d');
        dCtx.clearRect(0, 0, dCanvas.width, dCanvas.height);
      }
      if (boardPagesRef.current[boardCurrentPage - 1]) {
        boardPagesRef.current[boardCurrentPage - 1].drawingDataUrl = null;
        boardPagesRef.current[boardCurrentPage - 1].history = [];
        boardPagesRef.current[boardCurrentPage - 1].redo = [];
      }
      historyRef.current = [];
      redoRef.current = [];
      renderCompositeCanvas();
      toast.success('محتوای برگه جاری کاملاً پاک شد');
    }
  };

  // Pointer Events for Drawing
  const getCanvasCoords = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  };

  const startDrawing = (e) => {
    const coords = getCanvasCoords(e);
    startPosRef.current = coords;
    setIsDrawing(true);
    saveHistorySnapshot();

    const dCanvas = drawingCanvasRef.current;
    if (!dCanvas) return;
    const dCtx = dCanvas.getContext('2d');

    dCtx.beginPath();
    dCtx.moveTo(coords.x, coords.y);

    if (tool === 'eraser') {
      dCtx.globalCompositeOperation = 'destination-out';
      dCtx.lineWidth = brushSize * 4;
      dCtx.lineCap = 'round';
      dCtx.lineJoin = 'round';
      dCtx.lineTo(coords.x, coords.y);
      dCtx.stroke();
      renderCompositeCanvas();
    } else if (tool === 'pen') {
      dCtx.globalCompositeOperation = 'source-over';
      dCtx.strokeStyle = currentColor;
      dCtx.lineWidth = brushSize;
      dCtx.lineCap = 'round';
      dCtx.lineJoin = 'round';
      dCtx.lineTo(coords.x, coords.y);
      dCtx.stroke();
      renderCompositeCanvas();
    } else if (tool === 'highlighter') {
      dCtx.globalCompositeOperation = 'source-over';
      dCtx.strokeStyle = currentColor;
      dCtx.globalAlpha = 0.35;
      dCtx.lineWidth = brushSize * 3.5;
      dCtx.lineCap = 'square';
      dCtx.lineJoin = 'miter';
      dCtx.lineTo(coords.x, coords.y);
      dCtx.stroke();
      dCtx.globalAlpha = 1.0;
      renderCompositeCanvas();
    }
  };

  const draw = (e) => {
    if (!isDrawing) return;
    const coords = getCanvasCoords(e);
    const dCanvas = drawingCanvasRef.current;
    if (!dCanvas) return;
    const dCtx = dCanvas.getContext('2d');

    if (tool === 'pen') {
      dCtx.globalCompositeOperation = 'source-over';
      dCtx.strokeStyle = currentColor;
      dCtx.lineWidth = brushSize;
      dCtx.lineCap = 'round';
      dCtx.lineJoin = 'round';
      dCtx.lineTo(coords.x, coords.y);
      dCtx.stroke();
      renderCompositeCanvas();
    } else if (tool === 'eraser') {
      dCtx.globalCompositeOperation = 'destination-out';
      dCtx.lineWidth = brushSize * 4;
      dCtx.lineCap = 'round';
      dCtx.lineJoin = 'round';
      dCtx.lineTo(coords.x, coords.y);
      dCtx.stroke();
      renderCompositeCanvas();
    } else if (tool === 'highlighter') {
      dCtx.globalCompositeOperation = 'source-over';
      dCtx.strokeStyle = currentColor;
      dCtx.globalAlpha = 0.35;
      dCtx.lineWidth = brushSize * 3.5;
      dCtx.lineCap = 'square';
      dCtx.lineJoin = 'miter';
      dCtx.lineTo(coords.x, coords.y);
      dCtx.stroke();
      dCtx.globalAlpha = 1.0;
      renderCompositeCanvas();
    } else {
      // Shape tools: preview dynamically on main composite canvas
      renderCompositeCanvas();
      const mainCanvas = canvasRef.current;
      if (!mainCanvas) return;
      const mCtx = mainCanvas.getContext('2d');
      mCtx.save();
      mCtx.strokeStyle = currentColor;
      mCtx.lineWidth = brushSize;
      mCtx.lineCap = 'round';

      const startX = startPosRef.current.x;
      const startY = startPosRef.current.y;
      const curX = coords.x;
      const curY = coords.y;

      if (tool === 'line') {
        mCtx.beginPath();
        mCtx.moveTo(startX, startY);
        mCtx.lineTo(curX, curY);
        mCtx.stroke();
      } else if (tool === 'arrow') {
        mCtx.beginPath();
        mCtx.moveTo(startX, startY);
        mCtx.lineTo(curX, curY);
        mCtx.stroke();
        // Arrow head
        const angle = Math.atan2(curY - startY, curX - startX);
        const headLen = Math.max(14, brushSize * 2.5);
        mCtx.beginPath();
        mCtx.moveTo(curX, curY);
        mCtx.lineTo(curX - headLen * Math.cos(angle - Math.PI / 6), curY - headLen * Math.sin(angle - Math.PI / 6));
        mCtx.moveTo(curX, curY);
        mCtx.lineTo(curX - headLen * Math.cos(angle + Math.PI / 6), curY - headLen * Math.sin(angle + Math.PI / 6));
        mCtx.stroke();
      } else if (tool === 'rect') {
        mCtx.strokeRect(startX, startY, curX - startX, curY - startY);
      } else if (tool === 'circle') {
        mCtx.beginPath();
        const rx = Math.abs((curX - startX) / 2);
        const ry = Math.abs((curY - startY) / 2);
        const cx = Math.min(startX, curX) + rx;
        const cy = Math.min(startY, curY) + ry;
        mCtx.ellipse(cx, cy, rx, ry, 0, 0, 2 * Math.PI);
        mCtx.stroke();
      }
      mCtx.restore();
    }
  };

  const stopDrawing = (e) => {
    if (!isDrawing) return;
    setIsDrawing(false);

    const dCanvas = drawingCanvasRef.current;
    if (!dCanvas) return;
    const dCtx = dCanvas.getContext('2d');

    // If shape, commit permanently to offscreen drawingCanvas
    if (['line', 'arrow', 'rect', 'circle'].includes(tool)) {
      const coords = getCanvasCoords(e);
      const startX = startPosRef.current.x;
      const startY = startPosRef.current.y;
      const curX = coords.x;
      const curY = coords.y;

      dCtx.save();
      dCtx.globalCompositeOperation = 'source-over';
      dCtx.strokeStyle = currentColor;
      dCtx.lineWidth = brushSize;
      dCtx.lineCap = 'round';

      if (tool === 'line') {
        dCtx.beginPath();
        dCtx.moveTo(startX, startY);
        dCtx.lineTo(curX, curY);
        dCtx.stroke();
      } else if (tool === 'arrow') {
        dCtx.beginPath();
        dCtx.moveTo(startX, startY);
        dCtx.lineTo(curX, curY);
        dCtx.stroke();
        const angle = Math.atan2(curY - startY, curX - startX);
        const headLen = Math.max(14, brushSize * 2.5);
        dCtx.beginPath();
        dCtx.moveTo(curX, curY);
        dCtx.lineTo(curX - headLen * Math.cos(angle - Math.PI / 6), curY - headLen * Math.sin(angle - Math.PI / 6));
        dCtx.moveTo(curX, curY);
        dCtx.lineTo(curX - headLen * Math.cos(angle + Math.PI / 6), curY - headLen * Math.sin(angle + Math.PI / 6));
        dCtx.stroke();
      } else if (tool === 'rect') {
        dCtx.strokeRect(startX, startY, curX - startX, curY - startY);
      } else if (tool === 'circle') {
        dCtx.beginPath();
        const rx = Math.abs((curX - startX) / 2);
        const ry = Math.abs((curY - startY) / 2);
        const cx = Math.min(startX, curX) + rx;
        const cy = Math.min(startY, curY) + ry;
        dCtx.ellipse(cx, cy, rx, ry, 0, 0, 2 * Math.PI);
        dCtx.stroke();
      }
      dCtx.restore();
    }

    dCtx.closePath();
    renderCompositeCanvas();
  };

  // Insert Text tool
  const handleInsertText = () => {
    const text = window.prompt('متن مورد نظر برای درج روی تخته را وارد کنید:');
    if (!text || !text.trim()) return;

    saveHistorySnapshot();
    const dCanvas = drawingCanvasRef.current;
    if (!dCanvas) return;
    const dCtx = dCanvas.getContext('2d');

    dCtx.save();
    dCtx.font = `bold ${Math.max(22, brushSize * 4)}px Vazirmatn, Tahoma, sans-serif`;
    dCtx.fillStyle = currentColor;
    dCtx.textAlign = 'right';
    dCtx.direction = 'rtl';
    dCtx.fillText(text, dCanvas.width / 2, dCanvas.height / 2);
    dCtx.restore();

    renderCompositeCanvas();
    toast.success('متن در وسط تخته درج شد');
  };

  // ── 2.5 Document (PDF & PowerPoint) Rendering & Navigation Engine ──

  // Robust, zero-bundler-conflict loader for Mozilla PDF.js (uses local /pdf.js & /pdf.worker.min.js)
  const getPdfJs = async () => {
    if (typeof window === 'undefined') return null;
    const existingLib = window.pdfjsLib || window['pdfjs-dist/build/pdf'];
    if (existingLib) {
      if (!existingLib.GlobalWorkerOptions?.workerSrc) {
        existingLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js';
      }
      return existingLib;
    }

    return new Promise((resolve, reject) => {
      let script = document.querySelector('script[data-pdfjs="true"]');
      if (!script) {
        script = document.createElement('script');
        script.setAttribute('data-pdfjs', 'true');
        script.src = '/pdf.js';
        document.head.appendChild(script);
      }

      const checkLib = () => {
        const lib = window.pdfjsLib || window['pdfjs-dist/build/pdf'];
        if (lib) {
          lib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js';
          return lib;
        }
        return null;
      };

      const found = checkLib();
      if (found) return resolve(found);

      script.addEventListener('load', () => {
        const lib = checkLib();
        if (lib) {
          resolve(lib);
        } else {
          setTimeout(() => {
            const retryLib = checkLib();
            if (retryLib) resolve(retryLib);
            else reject(new Error('کتابخانه PDF.js بارگذاری نشد'));
          }, 150);
        }
      });
      script.addEventListener('error', () => {
        reject(new Error('خطا در بارگذاری اسکریپت PDF'));
      });
    });
  };

  const renderPdfPage = async (doc, pageNum) => {
    try {
      setIsLoadingPdf(true);
      const dpr = typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1;
      const pdfScale = Math.max(2.6, Math.min(3.6, dpr * 1.5));

      // 1. Instant Cache Check (0ms response)
      if (pageCacheRef.current.has(pageNum)) {
        pdfCanvasRef.current = pageCacheRef.current.get(pageNum);
        pdfImageRef.current = null;
        renderCompositeCanvas();
        setIsLoadingPdf(false);

        // Pre-render next page in background if not already in cache
        if (doc && pageNum < doc.numPages && !pageCacheRef.current.has(pageNum + 1)) {
          setTimeout(async () => {
            try {
              const nextP = await doc.getPage(pageNum + 1);
              const vp = nextP.getViewport({ scale: pdfScale });
              const c = document.createElement('canvas');
              c.width = vp.width;
              c.height = vp.height;
              const cx = c.getContext('2d', { alpha: false });
              cx.imageSmoothingEnabled = true;
              cx.imageSmoothingQuality = 'high';
              cx.fillStyle = '#ffffff';
              cx.fillRect(0, 0, c.width, c.height);
              await nextP.render({ canvasContext: cx, viewport: vp, intent: 'display' }).promise;
              pageCacheRef.current.set(pageNum + 1, c);
            } catch (e) {}
          }, 40);
        }
        return;
      }

      // 2. High-speed 4K UHD Render (DPI-aware scale ensures crisp text on mobile & retina)
      const page = await doc.getPage(pageNum);
      const viewport = page.getViewport({ scale: pdfScale });
      const offscreen = document.createElement('canvas');
      offscreen.width = viewport.width;
      offscreen.height = viewport.height;
      const ctx = offscreen.getContext('2d', { alpha: false });
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      // Solid white background for perfect contrast
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, offscreen.width, offscreen.height);

      await page.render({
        canvasContext: ctx,
        viewport,
        intent: 'display',
      }).promise;

      pageCacheRef.current.set(pageNum, offscreen);
      pdfCanvasRef.current = offscreen;
      pdfImageRef.current = null;
      renderCompositeCanvas();
      setIsLoadingPdf(false);

      // Pre-render next page in background so scrolling is 100% instant
      if (doc && pageNum < doc.numPages && !pageCacheRef.current.has(pageNum + 1)) {
        setTimeout(async () => {
          try {
            const nextP = await doc.getPage(pageNum + 1);
            const vp = nextP.getViewport({ scale: pdfScale });
            const c = document.createElement('canvas');
            c.width = vp.width;
            c.height = vp.height;
            const cx = c.getContext('2d', { alpha: false });
            cx.imageSmoothingEnabled = true;
            cx.imageSmoothingQuality = 'high';
            cx.fillStyle = '#ffffff';
            cx.fillRect(0, 0, c.width, c.height);
            await nextP.render({ canvasContext: cx, viewport: vp, intent: 'display' }).promise;
            pageCacheRef.current.set(pageNum + 1, c);
          } catch (e) {}
        }, 40);
      }
    } catch (err) {
      console.error('Error rendering PDF page:', err);
      setIsLoadingPdf(false);
      toast.error('خطا در رسم صفحه PDF');
    }
  };

  const handlePdfFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    pageCacheRef.current.clear();
    const lowerName = file.name.toLowerCase();
    const isPptx = lowerName.endsWith('.pptx') || lowerName.endsWith('.ppt');

    if (isPptx) {
      try {
        toast.loading('در حال تبدیل اسلایدهای پاورپوینت با کیفیت و هندسه اصلی...', { id: 'doc-load' });

        let pdfDataArray = null;

        // 1. Try High-Fidelity Server Conversion (Office PowerPoint -> 100% Vector PDF)
        try {
          const formData = new FormData();
          formData.append('file', file);
          const response = await api.post('/videos/convert-pptx', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
            responseType: 'arraybuffer',
            timeout: 90000,
          });

          if (response && response.data && response.data.byteLength > 500) {
            pdfDataArray = new Uint8Array(response.data);
          }
        } catch (serverErr) {
          console.warn('Backend PPTX conversion failed, falling back to client parser:', serverErr);
        }

        if (pdfDataArray) {
          const pdfjs = await getPdfJs();
          const loadingTask = pdfjs.getDocument({ data: pdfDataArray });
          const doc = await loadingTask.promise;

          setPdfDocument(doc);
          setPptxPresentation(null);
          setDocType('pptx');
          setPdfTotalPages(doc.numPages);
          setPdfCurrentPage(1);
          setPdfFileName(file.name);
          setPdfZoom(1.0);
          setPdfOffsetY(0);

          await renderPdfPage(doc, 1);
          toast.success(`ارائه پاورپوینت «${file.name}» با دقت ۱۰۰٪ و بدون افت شکل بارگذاری شد (${doc.numPages} اسلاید) 📊`, { id: 'doc-load' });
          e.target.value = '';
          return;
        }

        // 2. Fallback to client-side parser if backend is unavailable
        const arrayBuffer = await file.arrayBuffer();
        const pres = await loadPptxPresentation(arrayBuffer);

        setPptxPresentation(pres);
        setPdfDocument(null);
        setDocType('pptx');
        setPdfTotalPages(pres.numPages);
        setPdfCurrentPage(1);
        setPdfFileName(file.name);
        setPdfZoom(1.0);
        setPdfOffsetY(0);

        const slideCanvas = await pres.renderSlideCanvas(0);
        if (slideCanvas) {
          pdfCanvasRef.current = slideCanvas;
          pdfImageRef.current = null;
          renderCompositeCanvas();
        }
        toast.success(`ارائه پاورپوینت «${file.name}» بارگذاری شد (${pres.numPages} اسلاید) 📊`, { id: 'doc-load' });
      } catch (err) {
        console.error('PPTX load error:', err);
        toast.error(err.message || 'خطا در بارگذاری فایل پاورپوینت', { id: 'doc-load' });
      }
    } else if (file.type === 'application/pdf' || lowerName.endsWith('.pdf')) {
      try {
        toast.loading('در حال پردازش صفحه با کیفیت فوق‌العاده بالا...', { id: 'doc-load' });
        const arrayBuffer = await file.arrayBuffer();
        const pdfjs = await getPdfJs();
        const loadingTask = pdfjs.getDocument({ data: new Uint8Array(arrayBuffer) });
        const doc = await loadingTask.promise;

        setPdfDocument(doc);
        setPptxPresentation(null);
        setDocType('pdf');
        setPdfTotalPages(doc.numPages);
        setPdfCurrentPage(1);
        setPdfFileName(file.name);
        setPdfZoom(1.0);
        setPdfOffsetY(0);
        await renderPdfPage(doc, 1);
        toast.success(`فایل «${file.name}» با وضوح بالا بارگذاری شد (${doc.numPages} صفحه)`, { id: 'doc-load' });
      } catch (err) {
        console.error('PDF error:', err);
        toast.error('خطا در باز کردن فایل PDF', { id: 'doc-load' });
      }
    }
    e.target.value = '';
  };

  const handleImageFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    pageCacheRef.current.clear();
    if (videoElementRef.current) {
      videoElementRef.current.pause();
      videoElementRef.current.src = '';
      videoElementRef.current = null;
    }
    setIsVideoPlaying(false);

    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        pdfImageRef.current = img;
        pdfCanvasRef.current = null;
        setPdfDocument(null);
        setPptxPresentation(null);
        setDocType('image');
        setPdfTotalPages(1);
        setPdfCurrentPage(1);
        setPdfFileName(file.name);
        setPdfZoom(1.0);
        setPdfOffsetY(0);
        renderCompositeCanvas();
        toast.success(`تصویر «${file.name}» روی تخته قرار گرفت 🖼️`);
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleVideoFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    pageCacheRef.current.clear();
    if (videoElementRef.current) {
      videoElementRef.current.pause();
      videoElementRef.current.src = '';
      videoElementRef.current = null;
    }

    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.src = url;
    video.playsInline = true;
    video.crossOrigin = 'anonymous';
    video.loop = false;

    video.onloadedmetadata = () => {
      videoElementRef.current = video;
      pdfCanvasRef.current = null;
      pdfImageRef.current = null;
      setPdfDocument(null);
      setPptxPresentation(null);
      setDocType('video');
      setPdfTotalPages(1);
      setPdfCurrentPage(1);
      setPdfFileName(file.name);
      setPdfZoom(1.0);
      setPdfOffsetY(0);
      setVideoDuration(video.duration || 0);
      setVideoCurrentTime(0);
      setIsVideoPlaying(false);
      renderCompositeCanvas();
      toast.success(`فیلم آموزشی «${file.name}» روی تخته قرار گرفت 🎬`);
    };

    video.ontimeupdate = () => {
      setVideoCurrentTime(video.currentTime);
      renderCompositeCanvas();
    };

    video.onended = () => {
      setIsVideoPlaying(false);
      renderCompositeCanvas();
    };

    video.onerror = () => {
      toast.error('خطا در پخش فایل ویدیویی');
    };

    e.target.value = '';
  };

  const togglePlayVideo = () => {
    const video = videoElementRef.current;
    if (!video) return;
    if (video.paused) {
      video.play().then(() => {
        setIsVideoPlaying(true);
        const loop = () => {
          if (!video.paused && !video.ended) {
            renderCompositeCanvas();
            requestAnimationFrame(loop);
          } else {
            setIsVideoPlaying(false);
            renderCompositeCanvas();
          }
        };
        requestAnimationFrame(loop);
      }).catch((e) => console.warn('Video play error:', e));
    } else {
      video.pause();
      setIsVideoPlaying(false);
      renderCompositeCanvas();
    }
  };

  const handleSeekVideo = (e) => {
    const video = videoElementRef.current;
    if (!video) return;
    const time = parseFloat(e.target.value);
    video.currentTime = time;
    setVideoCurrentTime(time);
    renderCompositeCanvas();
  };

  const toggleMuteVideo = () => {
    const video = videoElementRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setIsVideoMuted(video.muted);
  };

  const formatVideoTime = (secs) => {
    const s = Math.floor(secs || 0);
    const m = Math.floor(s / 60);
    const rem = s % 60;
    return `${m}:${rem < 10 ? '0' : ''}${rem}`;
  };

  const handleNextPdfPage = async () => {
    if (isLoadingPdf) return;
    if (pptxPresentation && pdfCurrentPage < pdfTotalPages) {
      const next = pdfCurrentPage + 1;
      setPdfCurrentPage(next);
      setPdfOffsetY(0);
      setIsLoadingPdf(true);
      const canvas = await pptxPresentation.renderSlideCanvas(next - 1);
      if (canvas) {
        pdfCanvasRef.current = canvas;
        pdfImageRef.current = null;
        renderCompositeCanvas();
      }
      setIsLoadingPdf(false);
    } else if (pdfDocument && pdfCurrentPage < pdfTotalPages) {
      const next = pdfCurrentPage + 1;
      setPdfCurrentPage(next);
      setPdfOffsetY(0);
      renderPdfPage(pdfDocument, next);
    }
  };

  const handlePrevPdfPage = async () => {
    if (isLoadingPdf) return;
    if (pptxPresentation && pdfCurrentPage > 1) {
      const prev = pdfCurrentPage - 1;
      setPdfCurrentPage(prev);
      setPdfOffsetY(0);
      setIsLoadingPdf(true);
      const canvas = await pptxPresentation.renderSlideCanvas(prev - 1);
      if (canvas) {
        pdfCanvasRef.current = canvas;
        pdfImageRef.current = null;
        renderCompositeCanvas();
      }
      setIsLoadingPdf(false);
    } else if (pdfDocument && pdfCurrentPage > 1) {
      const prev = pdfCurrentPage - 1;
      setPdfCurrentPage(prev);
      setPdfOffsetY(0);
      renderPdfPage(pdfDocument, prev);
    }
  };

  const handleClosePdf = () => {
    pageCacheRef.current.clear();
    if (videoElementRef.current) {
      videoElementRef.current.pause();
      videoElementRef.current.src = '';
      videoElementRef.current = null;
    }
    setIsVideoPlaying(false);
    setPdfDocument(null);
    setPptxPresentation(null);
    setPdfTotalPages(0);
    setPdfCurrentPage(1);
    setPdfFileName('');
    setPdfZoom(1.0);
    setPdfOffsetY(0);
    pdfCanvasRef.current = null;
    pdfImageRef.current = null;
    renderCompositeCanvas();
    toast('محتوا از روی تخته برداشته شد');
  };

  // ── 2.8 Whiteboard Multi-Page Navigation & PDF Export Engine ──

  // Save current active page drawing & history to boardPagesRef
  const saveCurrentPageData = useCallback(() => {
    if (!drawingCanvasRef.current) return;
    const currentIdx = boardCurrentPage - 1;
    const dataUrl = drawingCanvasRef.current.toDataURL();

    if (!boardPagesRef.current[currentIdx]) {
      boardPagesRef.current[currentIdx] = { pageNum: currentIdx + 1 };
    }
    boardPagesRef.current[currentIdx] = {
      pageNum: currentIdx + 1,
      drawingDataUrl: dataUrl,
      history: [...historyRef.current],
      redo: [...redoRef.current],
      boardType: boardType,
    };
  }, [boardCurrentPage, boardType]);

  // Load a target page into drawingCanvasRef & restore history
  const loadPageData = useCallback((targetPageNum) => {
    const targetIdx = targetPageNum - 1;
    const pageData = boardPagesRef.current[targetIdx];

    const drawCanvas = drawingCanvasRef.current;
    if (!drawCanvas) return;
    const drawCtx = drawCanvas.getContext('2d');
    drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);

    if (pageData && pageData.drawingDataUrl) {
      const img = new Image();
      img.onload = () => {
        drawCtx.drawImage(img, 0, 0);
        historyRef.current = pageData.history ? [...pageData.history] : [];
        redoRef.current = pageData.redo ? [...pageData.redo] : [];
        renderCompositeCanvas();
      };
      img.src = pageData.drawingDataUrl;
    } else {
      historyRef.current = [];
      redoRef.current = [];
      renderCompositeCanvas();
    }
  }, [renderCompositeCanvas]);

  const handleNextBoardPage = () => {
    if (boardCurrentPage < boardTotalPages) {
      saveCurrentPageData();
      const next = boardCurrentPage + 1;
      setBoardCurrentPage(next);
      loadPageData(next);
      toast(`انتقال به برگه ${next}`, { id: 'page-nav', duration: 1500 });
    } else {
      handleAddNewBoardPage();
    }
  };

  const handlePrevBoardPage = () => {
    if (boardCurrentPage > 1) {
      saveCurrentPageData();
      const prev = boardCurrentPage - 1;
      setBoardCurrentPage(prev);
      loadPageData(prev);
      toast(`انتقال به برگه ${prev}`, { id: 'page-nav', duration: 1500 });
    }
  };

  const handleAddNewBoardPage = () => {
    saveCurrentPageData();
    const newPageNum = boardTotalPages + 1;
    boardPagesRef.current.push({
      pageNum: newPageNum,
      drawingDataUrl: null,
      history: [],
      redo: [],
      boardType: boardType,
    });
    setBoardTotalPages(newPageNum);
    setBoardCurrentPage(newPageNum);

    const drawCanvas = drawingCanvasRef.current;
    if (drawCanvas) {
      const drawCtx = drawCanvas.getContext('2d');
      drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
    }
    historyRef.current = [];
    redoRef.current = [];
    renderCompositeCanvas();
    toast.success(`برگه شماره ${newPageNum} ایجاد شد 📄✨`, { id: 'page-nav' });
  };

  const handleDeleteBoardPage = () => {
    if (boardTotalPages <= 1) {
      handleClearBoard();
      return;
    }
    if (window.confirm(`آیا از حذف برگه شماره ${boardCurrentPage} مطمئن هستید؟`)) {
      const remainingPages = boardPagesRef.current.filter((_, idx) => idx !== boardCurrentPage - 1);
      remainingPages.forEach((p, idx) => { p.pageNum = idx + 1; });
      boardPagesRef.current = remainingPages;
      const newTotal = remainingPages.length;
      const newCurrent = Math.min(boardCurrentPage, newTotal);
      setBoardTotalPages(newTotal);
      setBoardCurrentPage(newCurrent);
      loadPageData(newCurrent);
      toast.success(`برگه حذف شد (تعداد باقی‌مانده: ${newTotal})`, { id: 'page-nav' });
    }
  };

  // Universal Client Download Engine (Desktop, Mobile & Android WebView compatible)
  const triggerDownloadFile = async (data, filename, mimeType = 'application/octet-stream') => {
    try {
      let blob;
      if (data instanceof Blob) {
        blob = data;
      } else if (typeof data === 'string' && data.startsWith('blob:')) {
        try {
          const res = await fetch(data);
          blob = await res.blob();
        } catch (e) {
          blob = new Blob([data], { type: mimeType });
        }
      } else if (typeof data === 'string' && data.startsWith('data:')) {
        const a = document.createElement('a');
        a.href = data;
        a.download = filename;
        a.target = '_self';
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
          try {
            document.body.removeChild(a);
          } catch (e) {}
        }, 500);
        return true;
      } else {
        blob = new Blob([data], { type: mimeType });
      }

      // 1. Try Blob URL with anchor click
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = filename;
      a.target = '_self';
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        try {
          document.body.removeChild(a);
          URL.revokeObjectURL(blobUrl);
        } catch (e) {}
      }, 800);
      return true;
    } catch (err) {
      console.warn('Standard blob download failed, trying FileReader DataURL fallback:', err);
      // 2. Data URL Fallback (critical for Android WebView & Mobile)
      try {
        if (data instanceof Blob) {
          const reader = new FileReader();
          reader.onload = function () {
            const a = document.createElement('a');
            a.href = reader.result;
            a.download = filename;
            a.target = '_self';
            a.style.display = 'none';
            document.body.appendChild(a);
            a.click();
            setTimeout(() => {
              try {
                document.body.removeChild(a);
              } catch (e) {}
            }, 500);
          };
          reader.readAsDataURL(data);
          return true;
        }
      } catch (err2) {
        console.error('All download methods failed:', err2);
      }
      return false;
    }
  };

  // Generate & Download Ultra-HD Multi-Page PDF of Whiteboard Pages
  const handleExportPdf = async () => {
    if (isExportingPdf) return;
    setIsExportingPdf(true);
    const loadingToast = toast.loading('در حال آماده‌سازی و ساخت فایل PDF جزوه...');

    try {
      // 1. Save current active page data first
      try {
        saveCurrentPageData();
      } catch (saveErr) {
        console.warn('saveCurrentPageData warning:', saveErr);
      }

      // 2. Safe Dynamic import of jsPDF (handles both default & named exports across all bundlers)
      const jspdfModule = await import('jspdf');
      const JsPdfConstructor = jspdfModule.jsPDF || jspdfModule.default;
      if (!JsPdfConstructor) {
        throw new Error('کتابخانه ساخت PDF بارگذاری نشد.');
      }

      const mainCanvas = canvasRef.current;
      const width = Math.max(800, mainCanvas?.width || 1920);
      const height = Math.max(600, mainCanvas?.height || 1080);
      const orientation = width >= height ? 'landscape' : 'portrait';

      const doc = new JsPdfConstructor({
        orientation,
        unit: 'px',
        format: [width, height],
        hotfixes: ['px_scaling'],
      });

      // Create an offscreen helper canvas to composite each page identically
      const offscreen = document.createElement('canvas');
      offscreen.width = width;
      offscreen.height = height;
      const offCtx = offscreen.getContext('2d');
      if (offCtx) {
        offCtx.imageSmoothingEnabled = true;
        offCtx.imageSmoothingQuality = 'high';
      }

      const totalP = Math.max(1, boardPagesRef.current?.length || 1);

      for (let i = 0; i < totalP; i++) {
        const page = boardPagesRef.current?.[i] || {};
        offCtx.clearRect(0, 0, width, height);

        // A. Draw Board Background
        const pageBg = page.boardType || boardType;
        if (pageBg === 'blackboard') {
          offCtx.fillStyle = '#1a2e22';
          offCtx.fillRect(0, 0, width, height);
          try {
            const grad = offCtx.createRadialGradient(width / 2, height / 2, 50, width / 2, height / 2, Math.max(width, height) / 1.2);
            grad.addColorStop(0, 'rgba(255, 255, 255, 0.03)');
            grad.addColorStop(1, 'rgba(0, 0, 0, 0.2)');
            offCtx.fillStyle = grad;
            offCtx.fillRect(0, 0, width, height);
          } catch (e) {}
        } else if (pageBg === 'grid') {
          offCtx.fillStyle = '#ffffff';
          offCtx.fillRect(0, 0, width, height);
          offCtx.strokeStyle = '#e2e8f0';
          offCtx.lineWidth = 1;
          const gridSize = 32;
          offCtx.beginPath();
          for (let x = gridSize; x < width; x += gridSize) {
            offCtx.moveTo(x, 0);
            offCtx.lineTo(x, height);
          }
          for (let y = gridSize; y < height; y += gridSize) {
            offCtx.moveTo(0, y);
            offCtx.lineTo(width, y);
          }
          offCtx.stroke();
        } else {
          offCtx.fillStyle = '#ffffff';
          offCtx.fillRect(0, 0, width, height);
        }

        // B. Draw underlying media (PDF slide or Image) if opened
        const mediaSource = pdfCanvasRef.current || pdfImageRef.current;
        if (mediaSource) {
          try {
            const srcW = mediaSource.width;
            const srcH = mediaSource.height;
            if (srcW && srcH) {
              let drawW, drawH;
              if (pdfFitMode === 'fit-width') {
                const targetW = Math.min(width - 60, Math.max(920, width * 0.72)) * (pdfZoom || 1.0);
                const scale = targetW / srcW;
                drawW = targetW;
                drawH = srcH * scale;
              } else {
                const targetH = (height - 150) * (pdfZoom || 1.0);
                const scale = targetH / srcH;
                drawW = srcW * scale;
                drawH = targetH;
              }
              const drawX = (width - drawW) / 2;
              const baseY = pdfFitMode === 'fit-width' ? 80 : (height - drawH) / 2;
              const drawY = baseY + (pdfOffsetY || 0);

              offCtx.save();
              offCtx.drawImage(mediaSource, drawX, drawY, drawW, drawH);
              offCtx.restore();
            }
          } catch (mediaErr) {
            console.warn('Could not draw mediaSource onto PDF page:', mediaErr);
          }
        }

        // C. Draw strokes of this page
        if (page.drawingDataUrl) {
          await new Promise((resolve) => {
            const img = new Image();
            const timer = setTimeout(resolve, 1500);
            img.onload = () => {
              clearTimeout(timer);
              try {
                offCtx.drawImage(img, 0, 0);
              } catch (e) {}
              resolve();
            };
            img.onerror = () => {
              clearTimeout(timer);
              resolve();
            };
            img.src = page.drawingDataUrl;
          });
        } else if (i === boardCurrentPage - 1 && drawingCanvasRef.current) {
          try {
            offCtx.drawImage(drawingCanvasRef.current, 0, 0);
          } catch (drawErr) {
            console.warn('Could not draw current active strokes:', drawErr);
          }
        }

        // D. Discreet Branding & Page Numbering
        try {
          offCtx.save();
          offCtx.font = 'bold 15px Vazirmatn, Tahoma, sans-serif';
          offCtx.fillStyle = pageBg === 'blackboard' ? 'rgba(255,255,255,0.7)' : 'rgba(30, 41, 59, 0.65)';
          const pageLabel = `برگه ${i + 1} از ${totalP}`;
          offCtx.fillText(pageLabel, 36, height - 24);

          if (projectName) {
            const titleText = `${projectName} • ${new Date().toLocaleDateString('fa-IR')}`;
            const textWidth = offCtx.measureText(titleText).width;
            offCtx.fillText(titleText, width - 36 - textWidth, height - 24);
          }
          offCtx.restore();
        } catch (e) {}

        // E. Add page to PDF
        let imgData = null;
        try {
          imgData = offscreen.toDataURL('image/jpeg', 0.92);
        } catch (taintErr) {
          console.warn('Canvas toDataURL failed (likely tainted), trying PNG:', taintErr);
          try {
            imgData = offscreen.toDataURL('image/png');
          } catch (e2) {
            console.error('Canvas export completely failed:', e2);
          }
        }

        if (imgData && imgData !== 'data:,') {
          if (i > 0) {
            doc.addPage([width, height], orientation);
          }
          doc.addImage(imgData, 'JPEG', 0, 0, width, height, undefined, 'FAST');
        }
      }

      const cleanName = (projectName || 'جزوه_تخته_هوشمند')
        .replace(/[/\\?%*:|"<>]/g, '-')
        .replace(/\s+/g, '_')
        .trim();
      const dateStr = new Date().toLocaleDateString('fa-IR').replace(/\//g, '-');
      const fileName = `${cleanName}_${dateStr}.pdf`;

      // Multi-channel download (Blob + DataURL + jsPDF doc.save fallback)
      let downloaded = false;
      try {
        const pdfBlob = doc.output('blob');
        if (pdfBlob && pdfBlob.size > 0) {
          downloaded = await triggerDownloadFile(pdfBlob, fileName, 'application/pdf');
        }
      } catch (blobErr) {
        console.warn('doc.output(blob) failed:', blobErr);
      }

      if (!downloaded) {
        try {
          doc.save(fileName);
          downloaded = true;
        } catch (saveErr) {
          console.warn('doc.save() failed:', saveErr);
        }
      }

      toast.dismiss(loadingToast);
      if (downloaded) {
        toast.success(`فایل PDF جزوه با ${totalP} برگه با موفقیت دانلود شد 📄✨`, { duration: 4500 });
      } else {
        toast.error('خطا در دریافت و ذخیره فایل PDF');
      }
    } catch (err) {
      console.error('PDF export error:', err);
      toast.dismiss(loadingToast);
      toast.error('خطا در ایجاد فایل PDF جزوه: ' + (err.message || 'مشکل در پردازش تصاویر'));
    } finally {
      setIsExportingPdf(false);
    }
  };

  // Scroll wheel navigation on slides with smooth debounce
  const lastScrollTimeRef = useRef(0);

  const handleCanvasWheel = (e) => {
    if (pdfTotalPages > 1) {
      // 1. Ctrl + Wheel -> Zoom in / out
      if (e.ctrlKey) {
        e.preventDefault();
        if (e.deltaY < 0) {
          setPdfZoom((prev) => Math.min(3.0, +(prev + 0.1).toFixed(1)));
        } else {
          setPdfZoom((prev) => Math.max(0.2, +(prev - 0.1).toFixed(1)));
        }
        return;
      }

      // 2. Shift + Wheel -> Fine-grained vertical Pan
      if (e.shiftKey) {
        setPdfOffsetY((prev) => prev - e.deltaY * 0.7);
        return;
      }

      // 3. Normal Wheel -> Next / Previous Page Navigation with smooth debounce
      const now = Date.now();
      if (now - lastScrollTimeRef.current > 300) {
        if (e.deltaY > 15) {
          if (pdfCurrentPage < pdfTotalPages && !isLoadingPdf) {
            lastScrollTimeRef.current = now;
            handleNextPdfPage();
          }
        } else if (e.deltaY < -15) {
          if (pdfCurrentPage > 1 && !isLoadingPdf) {
            lastScrollTimeRef.current = now;
            handlePrevPdfPage();
          }
        }
      }
    } else if (pdfCanvasRef.current || pdfImageRef.current) {
      // Single page document or image -> scroll vertically
      setPdfOffsetY((prev) => prev - e.deltaY * 0.7);
    }
  };

  // Keyboard navigation for PowerPoint slides and Whiteboard pages
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;
      if (pdfTotalPages > 1) {
        if (e.key === 'ArrowLeft' || e.key === 'ArrowDown' || e.key === 'PageDown') {
          e.preventDefault();
          handleNextPdfPage();
        } else if (e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'PageUp') {
          e.preventDefault();
          handlePrevPdfPage();
        }
      } else if (boardTotalPages > 1) {
        if (e.key === 'PageDown') {
          e.preventDefault();
          handleNextBoardPage();
        } else if (e.key === 'PageUp') {
          e.preventDefault();
          handlePrevBoardPage();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [pdfTotalPages, pdfCurrentPage, isLoadingPdf, boardTotalPages, boardCurrentPage]);

  // ── 3. Screen / Canvas & Mic Recording Engine ──

  const startRecording = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    try {
      // 1. Explicitly prompt and request microphone permission FIRST if audio is enabled
      let micStream = null;
      if (recordAudio) {
        const permToast = toast.loading('در حال اتصال به میکروفون 🎙️...');
        try {
          micStream = await navigator.mediaDevices.getUserMedia({
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
              sampleRate: 48000,
            },
          });
          micStreamRef.current = micStream;
          toast.dismiss(permToast);
          toast.success('میکروفون با موفقیت متصل شد 🎙️ صدای تدریس شما روی ویدیو ضبط خواهد شد', { duration: 3500 });
        } catch (micErr) {
          toast.dismiss(permToast);
          console.warn('Microphone permission denied or not available:', micErr);
          toast.error('دسترسی به میکروفون داده نشد یا میکروفون متصل نیست! ویدیو بدون صدا ضبط خواهد شد ⚠️', { duration: 4500 });
        }
      }

      // 2. Capture 30FPS canvas video stream
      const canvasStream = canvas.captureStream(30);

      // 3. Compose unified stream containing both video and audio tracks
      const tracks = [...canvasStream.getVideoTracks()];
      if (micStream && micStream.getAudioTracks().length > 0) {
        tracks.push(...micStream.getAudioTracks());
      }
      const combinedStream = new MediaStream(tracks);

      // 4. Determine supported MIME type (prefer Opus for crystal-clear audio recording)
      let mimeType = 'video/webm;codecs=vp9,opus';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'video/webm;codecs=vp8,opus';
        if (!MediaRecorder.isTypeSupported(mimeType)) {
          mimeType = 'video/webm';
        }
      }

      recordedChunksRef.current = [];
      const mediaRecorder = new MediaRecorder(combinedStream, {
        mimeType,
        audioBitsPerSecond: 128000,
        videoBitsPerSecond: 2500000,
      });

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          recordedChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const mime = mediaRecorder.mimeType || 'video/webm';
        const blob = new Blob(recordedChunksRef.current, { type: mime });
        const videoUrl = URL.createObjectURL(blob);
        setRecordedBlob(blob);
        setRecordedVideoUrl(videoUrl);
        fetchAvailableFolders();
        const classObj = classesList.find((c) => c.id === selectedClassId);
        setSaveTargetFolder(classObj?.name || 'تخته هوشمند');
        setIsSaveCreatingFolder(false);
        setSaveNewFolderName('');
        setShowSaveModal(true);

        // Stop microphone tracks cleanly
        if (micStreamRef.current) {
          micStreamRef.current.getTracks().forEach((t) => t.stop());
          micStreamRef.current = null;
        }
      };

      mediaRecorder.start(1000); // 1-second chunks
      mediaRecorderRef.current = mediaRecorder;
      setRecStatus('recording');
      setRecSeconds(0);

      // Timer
      timerIntervalRef.current = setInterval(() => {
        setRecSeconds((prev) => prev + 1);
      }, 1000);

      toast.success('ضبط تخته و تدریس آغاز شد 🔴', { duration: 3000 });
    } catch (err) {
      console.error('Failed to start recording:', err);
      toast.error('خطا در آغاز ضبط تصویر یا صدا');
    }
  };

  const pauseRecording = () => {
    if (mediaRecorderRef.current && recStatus === 'recording') {
      mediaRecorderRef.current.pause();
      setRecStatus('paused');
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      toast('ضبط موقتاً متوقف شد ⏸️');
    }
  };

  const resumeRecording = () => {
    if (mediaRecorderRef.current && recStatus === 'paused') {
      mediaRecorderRef.current.resume();
      setRecStatus('recording');
      timerIntervalRef.current = setInterval(() => {
        setRecSeconds((prev) => prev + 1);
      }, 1000);
      toast.success('ادامه ضبط تدریس ▶️');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && (recStatus === 'recording' || recStatus === 'paused')) {
      try {
        if (mediaRecorderRef.current.state !== 'inactive') {
          mediaRecorderRef.current.requestData();
        }
      } catch (e) {
        console.warn('requestData error:', e);
      }
      mediaRecorderRef.current.stop();
      setRecStatus('idle');
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
    }
  };

  // Format seconds to HH:MM:SS
  const formatTimer = (totalSeconds) => {
    const hrs = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(hrs)}:${pad(mins)}:${pad(secs)}`;
  };

  // ── 4. Project Modal & Studio Launch ──

  const handleStartNewProject = (e) => {
    e.preventDefault();
    if (!projectName.trim()) {
      toast.error('لطفاً عنوان یا مبحث تدریس را وارد کنید');
      return;
    }
    // Initialize board pages with a fresh sheet
    boardPagesRef.current = [
      { pageNum: 1, drawingDataUrl: null, history: [], redo: [], boardType: boardType }
    ];
    setBoardCurrentPage(1);
    setBoardTotalPages(1);
    const dCanvas = drawingCanvasRef.current;
    if (dCanvas) {
      const dCtx = dCanvas.getContext('2d');
      dCtx.clearRect(0, 0, dCanvas.width, dCanvas.height);
    }
    historyRef.current = [];
    redoRef.current = [];
    setShowNewModal(false);
    setIsStudioOpen(true);
    toast.success(`استودیوی تدریس «${projectName}» آماده شد ✨`);
  };

  const handleExitStudio = () => {
    if (recStatus === 'recording' || recStatus === 'paused') {
      if (!window.confirm('ضبط در جریان است. آیا مایلید ضبط را پایان داده و خارج شوید؟')) {
        return;
      }
      stopRecording();
    }
    setIsStudioOpen(false);
  };

  // ── 5. Video Saving & Publishing ──

  // Direct file download (Supports Desktop, Mobile & Android WebView)
  const handleDownloadVideo = async () => {
    const cleanName = (projectName || 'جلسه_تدریس_تخته_هوشمند')
      .replace(/[/\\?%*:|"<>]/g, '-')
      .replace(/\s+/g, '_')
      .trim();
    const dateStr = new Date().toLocaleDateString('fa-IR').replace(/\//g, '-');
    const fileName = `${cleanName}_${dateStr}.webm`;

    const loadingToast = toast.loading('در حال آماده‌سازی فایل ویدیوی کلاس...');

    try {
      if (recordedBlob && recordedBlob.size > 0) {
        const ok = await triggerDownloadFile(recordedBlob, fileName, 'video/webm');
        toast.dismiss(loadingToast);
        if (ok) {
          toast.success('ویدیوی کلاس با موفقیت دانلود شد 📥');
        } else {
          toast.error('خطا در دانلود ویدیو');
        }
        return;
      }

      if (recordedVideoUrl) {
        const ok = await triggerDownloadFile(recordedVideoUrl, fileName, 'video/webm');
        toast.dismiss(loadingToast);
        if (ok) {
          toast.success('ویدیوی کلاس با موفقیت دانلود شد 📥');
        } else {
          toast.error('خطا در دانلود ویدیو');
        }
        return;
      }

      if (recordedChunksRef.current && recordedChunksRef.current.length > 0) {
        const mime = mediaRecorderRef.current?.mimeType || 'video/webm';
        const fallbackBlob = new Blob(recordedChunksRef.current, { type: mime });
        setRecordedBlob(fallbackBlob);
        const ok = await triggerDownloadFile(fallbackBlob, fileName, mime);
        toast.dismiss(loadingToast);
        if (ok) {
          toast.success('ویدیوی کلاس با موفقیت دانلود شد 📥');
          return;
        }
      }

      toast.dismiss(loadingToast);
      toast.error('فایل ویدیوی ضبط شده هنوز آماده نشده یا در دسترس نیست.');
    } catch (err) {
      console.error('handleDownloadVideo error:', err);
      toast.dismiss(loadingToast);
      toast.error('خطا در دانلود فایل ویدیو');
    }
  };

  // Save to School Video Archive API and Navigate to Videos
  const handlePublishToArchive = async () => {
    setIsUploading(true);
    const classObj = classesList.find((c) => c.id === selectedClassId);
    const finalFolder = isSaveCreatingFolder && saveNewFolderName.trim()
      ? saveNewFolderName.trim()
      : saveTargetFolder || classObj?.name || 'تخته هوشمند';

    if (isSaveCreatingFolder && saveNewFolderName.trim()) {
      const newFolderObj = { name: finalFolder, color: '#8b5cf6', count: 1 };
      setAvailableFolders((prev) => {
        const updated = prev.some((f) => f.name === finalFolder) ? prev : [...prev, newFolderObj];
        try {
          localStorage.setItem('educonnect_video_folders', JSON.stringify(updated));
        } catch (e) {}
        return updated;
      });
      api.post('/videos/folders', { name: finalFolder, color: '#8b5cf6' }).catch(() => {});
    }

    const videoTitle = projectName || 'تدریس تخته هوشمند';
    const sessionDate = new Date().toLocaleDateString('fa-IR');

    let currentBlob = recordedBlob;
    let localVideoUrl = recordedVideoUrl;

    if (!localVideoUrl && currentBlob) {
      localVideoUrl = URL.createObjectURL(currentBlob);
      setRecordedVideoUrl(localVideoUrl);
    }

    if (!currentBlob && recordedChunksRef.current && recordedChunksRef.current.length > 0) {
      currentBlob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
      setRecordedBlob(currentBlob);
      if (!localVideoUrl) {
        localVideoUrl = URL.createObjectURL(currentBlob);
        setRecordedVideoUrl(localVideoUrl);
      }
    }

    const localSession = {
      id: `wb-${Date.now()}`,
      title: videoTitle,
      date: sessionDate,
      duration: recSeconds,
      classTitle: classObj?.name || 'کلاس عمومی',
      videoUrl: localVideoUrl,
      file_url: localVideoUrl,
      sizeBytes: currentBlob?.size || 0,
      folder_name: finalFolder,
      category: 'تخته هوشمند',
      is_whiteboard_recording: true,
      created_at: sessionDate,
    };

    // 1. Immediately store session locally so it is guaranteed to show in Videos section
    saveSessionsToLocal([localSession, ...recordedSessions.filter((s) => s.id !== localSession.id)]);

    try {
      const globalKey = 'educonnect_recorded_sessions';
      let existingGlobal = [];
      const raw = localStorage.getItem(globalKey);
      if (raw) existingGlobal = JSON.parse(raw);
      localStorage.setItem(
        globalKey,
        JSON.stringify([localSession, ...existingGlobal.filter((s) => s.id !== localSession.id)])
      );
    } catch (e) {
      console.warn('Global sessions cache write error:', e);
    }

    // 2. Upload to backend if blob is available
    if (currentBlob) {
      try {
        const formData = new FormData();
        const fileName = `${projectName || 'تدریس'}.webm`;
        formData.append('file', currentBlob, fileName);
        formData.append('title', videoTitle);
        formData.append('description', `تدریس ضبط شده با تخته هوشمند در تاریخ ${sessionDate}`);
        if (selectedClassId) {
          formData.append('class_id', selectedClassId);
        }
        formData.append('folder_name', finalFolder);
        formData.append('category', 'تخته هوشمند');
        formData.append('duration_seconds', recSeconds);

        // Optional quick notes PDF export
        try {
          if (typeof window !== 'undefined' && boardPagesRef.current?.length > 0) {
            saveCurrentPageData();
            const { jsPDF } = await import('jspdf');
            const mainCanvas = canvasRef.current;
            const width = mainCanvas?.width || 1280;
            const height = mainCanvas?.height || 720;
            const doc = new jsPDF({
              orientation: width >= height ? 'landscape' : 'portrait',
              unit: 'px',
              format: [width, height],
            });
            const page = boardPagesRef.current[0];
            if (page?.drawingDataUrl) {
              doc.addImage(page.drawingDataUrl, 'JPEG', 0, 0, width, height);
              const pdfBlob = doc.output('blob');
              if (pdfBlob && pdfBlob.size > 500) {
                formData.append('pdf', pdfBlob, `جزوه-${videoTitle}.pdf`);
                formData.append('pdf_name', `جزوه-${videoTitle}.pdf`);
              }
            }
          }
        } catch (pdfErr) {
          console.warn('PDF note generation skipped in video publish:', pdfErr);
        }

        const res = await api.post('/videos', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });

        if (res.data?.data?.video) {
          const serverVideo = res.data.data.video;
          localSession.id = serverVideo.id;
          localSession.videoUrl = serverVideo.file_url || serverVideo.video_url || localVideoUrl;
          localSession.file_url = serverVideo.file_url || serverVideo.video_url || localVideoUrl;
          localSession.pdf_url = serverVideo.pdf_url;
          localSession.pdf_name = serverVideo.pdf_name;
          saveSessionsToLocal([localSession, ...recordedSessions.filter((s) => s.id !== localSession.id)]);
        }
      } catch (err) {
        console.warn('Backend video upload note (saved in local archive):', err);
      }
    }

    toast.success(`ویدیو با موفقیت در پوشه «${finalFolder}» ذخیره شد و در حال انتقال به بخش ویدیوها... 🎉`);
    setShowSaveModal(false);
    setIsStudioOpen(false);
    setIsUploading(false);

    // 3. Seamlessly redirect to the videos page
    router.push('/dashboard/videos');
  };

  // Finish and save locally + auto background upload to videos
  const handleSaveLocallyAndClose = () => {
    const classObj = classesList.find((c) => c.id === selectedClassId);
    const finalFolder = isSaveCreatingFolder && saveNewFolderName.trim()
      ? saveNewFolderName.trim()
      : saveTargetFolder || classObj?.name || 'تخته هوشمند';

    if (isSaveCreatingFolder && saveNewFolderName.trim()) {
      const newFolderObj = { name: finalFolder, color: '#8b5cf6', count: 1 };
      setAvailableFolders((prev) => {
        const updated = prev.some((f) => f.name === finalFolder) ? prev : [...prev, newFolderObj];
        try {
          localStorage.setItem('educonnect_video_folders', JSON.stringify(updated));
        } catch (e) {}
        return updated;
      });
      api.post('/videos/folders', { name: finalFolder, color: '#8b5cf6' }).catch(() => {});
    }

    if (recordedBlob) {
      try {
        const formData = new FormData();
        const fileName = `${projectName || 'تدریس'}.webm`;
        formData.append('file', recordedBlob, fileName);
        formData.append('title', projectName || 'تدریس تخته هوشمند');
        formData.append('description', `تدریس ضبط شده با تخته هوشمند در تاریخ ${new Date().toLocaleDateString('fa-IR')}`);
        if (selectedClassId) formData.append('class_id', selectedClassId);
        formData.append('folder_name', finalFolder);
        formData.append('category', 'تخته هوشمند');
        formData.append('duration_seconds', recSeconds);

        api.post('/videos', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        }).catch((e) => console.warn('Background upload video error:', e));
      } catch (e) {}
    }

    const newSession = {
      id: Date.now().toString(),
      title: projectName || 'جلسه تدریس هوشمند',
      date: new Date().toLocaleDateString('fa-IR'),
      duration: recSeconds,
      classTitle: classObj?.name || 'کلاس عمومی',
      videoUrl: recordedVideoUrl,
      sizeBytes: recordedBlob?.size || 0,
      folder_name: finalFolder,
      category: 'تخته هوشمند',
    };
    saveSessionsToLocal([newSession, ...recordedSessions]);
    toast.success(`جلسه در پوشه «${finalFolder}» و بخش ویدیوها ذخیره شد ✅`);
    setShowSaveModal(false);
    setIsStudioOpen(false);
  };

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER: Fullscreen Studio OR Recordings Hub
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className={styles.container}>
      <Toaster position="top-center" />

      {/* ── 1. Top Hub Header / Hero Card ── */}
      <div className={styles.heroCard}>
        <div className={styles.heroContent}>
          <span className={styles.heroBadge}>
            <HiOutlineVideoCamera size={16} />
            استودیوی تعاملی و تخته هوشمند
          </span>
          <h1 className={styles.title}>ضبط کلاس و تدریس آنلاین</h1>
          <p className={styles.subtitle}>
            با استفاده از تخته سفید هوشمند، قلم، پاک‌کن و ابزارهای هندسی تدریس کنید و همزمان تصویر تخته و صدای خود را با
            کیفیت بالا ضبط نمایید.
          </p>
        </div>

        <div className={styles.heroActions}>
          <button
            id="start-new-record-btn"
            className={styles.newRecordBtn}
            onClick={() => {
              setProjectName('');
              setShowNewModal(true);
            }}
          >
            <HiPlus size={22} />
            <span>شروع تدریس و ضبط جدید</span>
          </button>
        </div>
      </div>

      {/* ── 2. Previous Recorded Sessions Gallery ── */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)' }}>
            جلسات تدریس ضبط شده ({recordedSessions.length})
          </h2>
          {recordedSessions.length > 0 && (
            <span style={{ fontSize: '0.875rem', color: 'var(--text-tertiary)' }}>
              ذخیره محلی و آماده پخش / دانلود
            </span>
          )}
        </div>

        {recordedSessions.length === 0 ? (
          <div
            style={{
              background: 'var(--bg-card)',
              border: '2px dashed var(--border-color)',
              borderRadius: 'var(--radius-2xl)',
              padding: '48px 24px',
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 16,
            }}
          >
            <div
              style={{
                width: 72,
                height: 72,
                borderRadius: '50%',
                background: 'rgba(99, 102, 241, 0.1)',
                color: 'var(--primary-600)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '2rem',
              }}
            >
              <HiOutlineVideoCamera />
            </div>
            <div>
              <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: 6 }}>
                هنوز جلسه‌ای ضبط نشده است
              </h3>
              <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', maxWidth: 440 }}>
                برای شروع اولین تدریس و باز کردن تخته سفید، روی دکمه «شروع تدریس و ضبط جدید» (+) کلیک کنید.
              </p>
            </div>
            <button
              className={styles.newRecordBtn}
              onClick={() => {
                setProjectName('');
                setShowNewModal(true);
              }}
            >
              <HiPlus size={20} />
              <span>ایجاد اولین جلسه ضبط</span>
            </button>
          </div>
        ) : (
          <div className={styles.recordingsGrid}>
            {recordedSessions.map((session) => (
              <div key={session.id} className={styles.recordingCard}>
                <div className={styles.videoThumb}>
                  {/* Action buttons overlay */}
                  <div style={{ position: 'absolute', top: 8, left: 8, display: 'flex', gap: 6, zIndex: 3 }}>
                    <button
                      type="button"
                      style={{
                        width: 30,
                        height: 30,
                        borderRadius: '50%',
                        background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
                        border: '1px solid rgba(255, 255, 255, 0.3)',
                        color: '#ffffff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                        boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenShareModal(session);
                      }}
                      title="اشتراک‌گذاری ویدیو با معلم یا دوستان در پیام‌ها"
                    >
                      <HiOutlineShare size={14} />
                    </button>
                    {session.videoUrl && (
                      <a
                        href={session.videoUrl}
                        download={`${session.title}.webm`}
                        style={{
                          width: 30,
                          height: 30,
                          borderRadius: '50%',
                          background: 'rgba(15, 23, 42, 0.75)',
                          border: '1px solid rgba(255, 255, 255, 0.2)',
                          color: '#38bdf8',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                        }}
                        onClick={(e) => e.stopPropagation()}
                        title="دانلود ویدیو"
                      >
                        <HiOutlineArrowDownTray size={14} />
                      </a>
                    )}
                    <button
                      type="button"
                      style={{
                        width: 30,
                        height: 30,
                        borderRadius: '50%',
                        background: 'rgba(15, 23, 42, 0.75)',
                        border: '1px solid rgba(255, 255, 255, 0.2)',
                        color: '#c7d2fe',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenMoveModal(session);
                      }}
                      title="انتقال به پوشه درس"
                    >
                      <HiOutlineArrowsRightLeft size={14} />
                    </button>
                    <button
                      type="button"
                      style={{
                        width: 30,
                        height: 30,
                        borderRadius: '50%',
                        background: 'rgba(15, 23, 42, 0.75)',
                        border: '1px solid rgba(255, 255, 255, 0.2)',
                        color: '#fca5a5',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (window.confirm('آیا از حذف این جلسه اطمینان دارید؟')) {
                          saveSessionsToLocal(recordedSessions.filter((s) => s.id !== session.id));
                        }
                      }}
                      title="حذف ویدیو"
                    >
                      <HiOutlineTrash size={14} />
                    </button>
                  </div>

                  {session.videoUrl ? (
                    <video src={session.videoUrl} preload="metadata" />
                  ) : (
                    <div style={{ color: '#94a3b8' }}>
                      <HiOutlineVideoCamera size={48} />
                    </div>
                  )}
                  {session.videoUrl && (
                    <div
                      className={styles.playOverlay}
                      onClick={() => {
                        setPreviewVideoUrl(session.videoUrl);
                        setShowPreviewModal(true);
                      }}
                    >
                      <div className={styles.playCircle}>
                        <HiOutlinePlay style={{ marginRight: -3 }} />
                      </div>
                    </div>
                  )}
                  <div className={styles.durationBadge}>{formatTimer(session.duration || 0)}</div>
                </div>

                <div className={styles.cardBody}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginBottom: 4 }}>
                    <h3 className={styles.cardTitle}>{session.title}</h3>
                    <span
                      style={{
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        color: 'var(--primary-600)',
                        background: 'rgba(99, 102, 241, 0.1)',
                        border: '1px solid rgba(99, 102, 241, 0.2)',
                        padding: '2px 8px',
                        borderRadius: 'var(--radius-md)',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        whiteSpace: 'nowrap',
                      }}
                      title="پوشه درس در بخش ویدیوها"
                    >
                      <HiOutlineFolder size={12} />
                      {session.folder_name || 'تخته هوشمند'}
                    </span>
                  </div>

                  <div className={styles.cardMeta}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <HiOutlineAcademicCap size={15} />
                      {session.classTitle}
                    </span>
                    <span>•</span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <HiOutlineCalendar size={15} />
                      {session.date}
                    </span>
                  </div>

                  <div className={styles.cardActions} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <button
                        type="button"
                        className="btn btn-sm btn-primary"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          fontSize: '0.8125rem',
                          background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
                          color: '#fff',
                          fontWeight: 700,
                          borderRadius: 'var(--radius-lg)',
                          padding: '6px 12px',
                          border: 'none',
                          cursor: 'pointer',
                          boxShadow: '0 2px 8px rgba(99, 102, 241, 0.25)',
                        }}
                        onClick={() => handleOpenShareModal(session)}
                        title="اشتراک‌گذاری این فیلم با معلم یا دوستان در بخش پیام‌ها"
                      >
                        <HiOutlinePaperAirplane size={14} style={{ transform: 'rotate(180deg)' }} />
                        <span>اشتراک‌گذاری در پیام‌ها</span>
                      </button>

                      {session.videoUrl && (
                        <a
                          href={session.videoUrl}
                          download={`${session.title}.webm`}
                          className="btn btn-sm btn-outline"
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.8125rem', padding: '6px 10px' }}
                          title="دانلود ویدیو"
                        >
                          <HiOutlineArrowDownTray size={14} />
                          <span>دانلود</span>
                        </a>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                      <button
                        className="btn btn-sm btn-ghost"
                        style={{ color: 'var(--primary-600)', padding: '6px 8px' }}
                        onClick={() => handleOpenMoveModal(session)}
                        title="انتقال به پوشه / تغییر پوشه درس"
                        type="button"
                      >
                        <HiOutlineArrowsRightLeft size={16} />
                      </button>
                      <button
                        className="btn btn-sm btn-ghost"
                        style={{ color: '#ef4444', padding: '6px 8px' }}
                        onClick={() => {
                          if (window.confirm('آیا مایلید این جلسه از لیست شما حذف شود؟')) {
                            saveSessionsToLocal(recordedSessions.filter((s) => s.id !== session.id));
                          }
                        }}
                        title="حذف این ویدیو"
                        type="button"
                      >
                        <HiOutlineTrash size={16} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── 3. Modal: New Project / Session Prompt (As requested) ── */}
      {showNewModal && (
        <div className={styles.modalBackdrop}>
          <div className={styles.modalContent}>
            <div className={styles.modalHeader}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 12,
                    background: 'rgba(99, 102, 241, 0.1)',
                    color: 'var(--primary-600)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '1.25rem',
                  }}
                >
                  <HiPlus />
                </div>
                <h2>تنظیمات جلسه تدریس جدید</h2>
              </div>
              <button className={styles.closeBtn} onClick={() => setShowNewModal(false)}>
                <HiOutlineXMark />
              </button>
            </div>

            <form onSubmit={handleStartNewProject} className={styles.formGrid}>
              <div className="form-group">
                <label className="form-label" style={{ fontWeight: 800, fontSize: '1rem', marginBottom: 8, display: 'block' }}>
                  نام پروژه / موضوع تدریس <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  type="text"
                  className={styles.largeTopicInput}
                  placeholder="مثال: فصل ۳ ریاضی دوازدهم - حل تمرین مشتق"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  autoFocus
                  required
                />
              </div>

              {classesList.length > 0 && (
                <div className="form-group">
                  <label className="form-label">کلاس / گروه درسی مرتبط</label>
                  <select
                    className="form-input"
                    value={selectedClassId}
                    onChange={(e) => setSelectedClassId(e.target.value)}
                  >
                    <option value="">کلاس عمومی / بدون انتخاب</option>
                    {classesList.map((cls) => (
                      <option key={cls.id} value={cls.id}>
                        {cls.name} ({cls.grade || 'مقطع عمومی'})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="form-group">
                <label className="form-label">نوع تخته تدریس</label>
                <div className={styles.boardChoiceGrid}>
                  <div
                    className={`${styles.boardChoiceCard} ${boardType === 'white' ? styles.boardChoiceCardActive : ''}`}
                    onClick={() => setBoardType('white')}
                  >
                    <div style={{ fontSize: '1.5rem', marginBottom: 4 }}>📋</div>
                    <div style={{ fontWeight: 800, fontSize: '0.875rem' }}>تخته سفید</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>مدرن و تمیز</div>
                  </div>

                  <div
                    className={`${styles.boardChoiceCard} ${boardType === 'grid' ? styles.boardChoiceCardActive : ''}`}
                    onClick={() => setBoardType('grid')}
                  >
                    <div style={{ fontSize: '1.5rem', marginBottom: 4 }}>📐</div>
                    <div style={{ fontWeight: 800, fontSize: '0.875rem' }}>شطرنجی ریاضی</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>رسم نمودار و فرمول</div>
                  </div>

                  <div
                    className={`${styles.boardChoiceCard} ${boardType === 'blackboard' ? styles.boardChoiceCardActive : ''}`}
                    onClick={() => setBoardType('blackboard')}
                  >
                    <div style={{ fontSize: '1.5rem', marginBottom: 4 }}>🎓</div>
                    <div style={{ fontWeight: 800, fontSize: '0.875rem' }}>تخته سیاه کلاسیک</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>سبک سنتی مدرسه</div>
                  </div>
                </div>
              </div>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: 'var(--bg-secondary)',
                  padding: '12px 16px',
                  borderRadius: 'var(--radius-lg)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <HiOutlineMicrophone size={20} color="var(--primary-600)" />
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>ضبط صدای معلم</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                      دریافت و ادغام همزمان صدای میکروفون در ویدیو
                    </div>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={recordAudio}
                  onChange={(e) => setRecordAudio(e.target.checked)}
                  style={{ width: 18, height: 18, cursor: 'pointer' }}
                />
              </div>

              <div className={styles.modalActions}>
                <button type="button" className="btn btn-outline" onClick={() => setShowNewModal(false)}>
                  انصراف
                </button>
                <button type="submit" className="btn btn-primary" style={{ minWidth: 160 }}>
                  <HiOutlinePlay size={18} />
                  <span>ورود به تخته هوشمند</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── 4. Fullscreen Whiteboard Studio ── */}
      {isStudioOpen && (
        <div className={styles.studioWrapper}>
          {/* Top Floating Glass Toolbar */}
          <div className={styles.topToolbar}>
            {/* 1. Essential Tools: Pen & Eraser */}
            <div className={styles.toolGroup}>
              <button
                className={`${styles.toolBtn} ${tool === 'pen' ? styles.toolBtnActive : ''}`}
                onClick={() => setTool('pen')}
                title="قلم معمولی"
              >
                <HiOutlinePencil />
              </button>

              <button
                className={`${styles.toolBtn} ${tool === 'eraser' ? styles.toolBtnActive : ''}`}
                onClick={() => setTool('eraser')}
                title="پاک‌کن"
              >
                <LuEraser size={21} />
              </button>
            </div>

            <div className={styles.toolDivider} />

            {/* 2. Color Palette */}
            <div className={styles.toolGroup}>
              {PALETTE_COLORS.map((c) => (
                <div
                  key={c.value}
                  className={`${styles.colorPill} ${currentColor === c.value ? styles.colorPillSelected : ''}`}
                  style={{ backgroundColor: c.value }}
                  onClick={() => setCurrentColor(c.value)}
                  title={c.name}
                />
              ))}
            </div>

            <div className={styles.toolDivider} />

            {/* 3. Dropdown Menu for All Other Whiteboard Capabilities */}
            <div className={styles.menuContainer}>
              <button
                className={`${styles.menuToggleBtn} ${showToolsMenu ? styles.menuToggleBtnActive : ''}`}
                onClick={() => setShowToolsMenu((prev) => !prev)}
                title="مشاهده تمام ابزارها و قابلیت‌های تخته"
              >
                <HiOutlineBars3 size={18} />
                <span>سایر ابزارها</span>
                <HiOutlineChevronDown
                  size={14}
                  style={{
                    transform: showToolsMenu ? 'rotate(180deg)' : 'none',
                    transition: 'transform 0.2s',
                  }}
                />
              </button>

              {showToolsMenu && (
                <div className={styles.toolsDropdownMenu}>
                  {/* Section: Highlighter & Brush Size */}
                  <div className={styles.dropdownSection}>
                    <span className={styles.dropdownSectionTitle}>قلم و ضخامت</span>
                    <div className={styles.dropdownRow}>
                      <button
                        className={`${styles.menuItemBtn} ${tool === 'highlighter' ? styles.menuItemBtnActive : ''}`}
                        onClick={() => {
                          setTool('highlighter');
                          setShowToolsMenu(false);
                        }}
                        title="ماژیک هایلایتر"
                      >
                        <HiOutlinePaintBrush size={16} />
                        <span>هایلایتر</span>
                      </button>

                      {BRUSH_SIZES.map((b) => (
                        <button
                          key={b.size}
                          className={`${styles.menuItemBtn} ${brushSize === b.size ? styles.menuItemBtnActive : ''}`}
                          onClick={() => setBrushSize(b.size)}
                          title={`ضخامت: ${b.label}`}
                          style={{ padding: '6px 8px' }}
                        >
                          <div
                            style={{
                              width: b.dotSize,
                              height: b.dotSize,
                              borderRadius: '50%',
                              backgroundColor: currentColor,
                            }}
                          />
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Section: Geometric Shapes & Text */}
                  <div className={styles.dropdownSection}>
                    <span className={styles.dropdownSectionTitle}>اشکال هندسی و متن</span>
                    <div className={styles.dropdownRow}>
                      <button
                        className={`${styles.menuItemBtn} ${tool === 'line' ? styles.menuItemBtnActive : ''}`}
                        onClick={() => {
                          setTool('line');
                          setShowToolsMenu(false);
                        }}
                      >
                        <span>╱ خط</span>
                      </button>
                      <button
                        className={`${styles.menuItemBtn} ${tool === 'arrow' ? styles.menuItemBtnActive : ''}`}
                        onClick={() => {
                          setTool('arrow');
                          setShowToolsMenu(false);
                        }}
                      >
                        <span>➔ فلش</span>
                      </button>
                      <button
                        className={`${styles.menuItemBtn} ${tool === 'rect' ? styles.menuItemBtnActive : ''}`}
                        onClick={() => {
                          setTool('rect');
                          setShowToolsMenu(false);
                        }}
                      >
                        <span>▭ مستطیل</span>
                      </button>
                      <button
                        className={`${styles.menuItemBtn} ${tool === 'circle' ? styles.menuItemBtnActive : ''}`}
                        onClick={() => {
                          setTool('circle');
                          setShowToolsMenu(false);
                        }}
                      >
                        <span>◯ دایره</span>
                      </button>
                      <button
                        className={styles.menuItemBtn}
                        onClick={() => {
                          handleInsertText();
                          setShowToolsMenu(false);
                        }}
                      >
                        <HiOutlineDocumentText size={15} />
                        <span>متن تایپی</span>
                      </button>
                    </div>
                  </div>

                  {/* Section: Media & Documents */}
                  <div className={styles.dropdownSection}>
                    <span className={styles.dropdownSectionTitle}>بارگذاری فایل و رسانه روی تخته</span>
                    <div className={styles.dropdownRow}>
                      <button
                        className={styles.menuItemBtn}
                        onClick={() => {
                          docFileInputRef.current?.click();
                          setShowToolsMenu(false);
                        }}
                        title="PDF و اسلاید پاورپوینت"
                      >
                        <FaFilePdf size={14} color="#ef4444" />
                        <span>PDF / پاورپوینت</span>
                      </button>

                      <button
                        className={styles.menuItemBtn}
                        onClick={() => {
                          imageFileInputRef.current?.click();
                          setShowToolsMenu(false);
                        }}
                        title="عکس یا کاربرگ"
                      >
                        <HiOutlinePhoto size={15} color="#10b981" />
                        <span>عکس / کاربرگ</span>
                      </button>

                      <button
                        className={styles.menuItemBtn}
                        onClick={() => {
                          videoFileInputRef.current?.click();
                          setShowToolsMenu(false);
                        }}
                        title="پخش فیلم آموزشی"
                      >
                        <HiOutlineFilm size={15} color="#8b5cf6" />
                        <span>فیلم آموزشی</span>
                      </button>
                    </div>
                  </div>

                  {/* Section: Board Background & Actions */}
                  <div className={styles.dropdownSection}>
                    <span className={styles.dropdownSectionTitle}>پس‌زمینه تخته و عملیات</span>
                    <div className={styles.dropdownRow}>
                      <button
                        className={styles.menuItemBtn}
                        onClick={() => {
                          const next = boardType === 'white' ? 'grid' : boardType === 'grid' ? 'blackboard' : 'white';
                          setBoardType(next);
                          toast(`نوع تخته: ${next === 'white' ? 'سفید' : next === 'grid' ? 'شطرنجی' : 'تخته سیاه'}`);
                        }}
                      >
                        <HiOutlineSquares2X2 size={15} />
                        <span>{boardType === 'white' ? 'تخته سفید' : boardType === 'grid' ? 'شطرنجی' : 'تخته سیاه'}</span>
                      </button>
                      <button className={styles.menuItemBtn} onClick={handleUndo} title="بازگردانی">
                        <HiOutlineArrowUturnLeft size={15} />
                        <span>Undo</span>
                      </button>
                      <button className={styles.menuItemBtn} onClick={handleRedo} title="انجام مجدد">
                        <HiOutlineArrowUturnRight size={15} />
                        <span>Redo</span>
                      </button>
                      <button
                        className={styles.menuItemBtn}
                        onClick={() => {
                          handleClearBoard();
                          setShowToolsMenu(false);
                        }}
                        style={{ color: '#ef4444' }}
                      >
                        <HiOutlineTrash size={15} />
                        <span>پاک کردن برگه</span>
                      </button>
                    </div>
                  </div>

                  {/* Section: Multi-Page Sheets & Export */}
                  <div className={styles.dropdownSection}>
                    <span className={styles.dropdownSectionTitle}>برگه‌های تخته ({boardCurrentPage} از {boardTotalPages})</span>
                    <div className={styles.dropdownRow}>
                      <button
                        className={styles.menuItemBtn}
                        onClick={handlePrevBoardPage}
                        disabled={boardCurrentPage <= 1}
                        style={{ opacity: boardCurrentPage <= 1 ? 0.4 : 1 }}
                      >
                        <HiOutlineChevronRight size={14} />
                        <span>برگه قبل</span>
                      </button>
                      <button
                        className={styles.menuItemBtn}
                        onClick={handleNextBoardPage}
                      >
                        <span>برگه بعد</span>
                        <HiOutlineChevronLeft size={14} />
                      </button>
                      <button
                        className={styles.menuItemBtn}
                        onClick={handleAddNewBoardPage}
                        style={{ color: '#6366f1' }}
                      >
                        <HiPlus size={14} />
                        <span>برگه جدید</span>
                      </button>
                      {boardTotalPages > 1 && (
                        <button
                          className={styles.menuItemBtn}
                          onClick={handleDeleteBoardPage}
                          style={{ color: '#ef4444' }}
                        >
                          <HiOutlineTrash size={14} />
                          <span>حذف برگه</span>
                        </button>
                      )}
                      <button
                        className={styles.menuItemBtn}
                        onClick={() => {
                          handleExportPdf();
                          setShowToolsMenu(false);
                        }}
                        style={{ color: '#10b981', fontWeight: 800 }}
                      >
                        <FaFilePdf size={14} />
                        <span>دانلود جزوه</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Hidden File Inputs */}
            <input
              type="file"
              ref={docFileInputRef}
              onChange={handlePdfFileSelect}
              accept=".pdf,.pptx,.ppt,application/pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation"
              style={{ display: 'none' }}
            />
            <input
              type="file"
              ref={imageFileInputRef}
              onChange={handleImageFileSelect}
              accept="image/*"
              style={{ display: 'none' }}
            />
            <input
              type="file"
              ref={videoFileInputRef}
              onChange={handleVideoFileSelect}
              accept="video/*"
              style={{ display: 'none' }}
            />

            <div className={styles.toolDivider} />

            {/* 4. Exit studio button */}
            <button
              className={styles.toolBtn}
              onClick={handleExitStudio}
              style={{ color: '#ef4444' }}
              title="خروج از استودیو"
            >
              <HiOutlineXMark size={20} />
            </button>
          </div>

          {/* Prominent Floating Banner to Close Open File/Video and Return to Whiteboard */}
          {pdfFileName && (
            <div className={styles.floatingMediaCloseHeader}>
              <div className={styles.floatingMediaInfo}>
                {docType === 'video' ? (
                  <HiOutlineFilm size={16} color="#a78bfa" />
                ) : (
                  <FaFilePdf size={16} color="#ef4444" />
                )}
                <span>
                  {docType === 'video' ? 'فیلم آموزشی' : 'فایل باز شده'}: <strong>{pdfFileName}</strong>
                </span>
              </div>
              <button
                className={styles.floatingMediaCloseAction}
                onClick={handleClosePdf}
                title="بستن و بازگشت به تخته سفید"
              >
                <HiOutlineXMark size={16} />
                <span>بستن و بازگشت به تخته</span>
              </button>
            </div>
          )}

          {/* Floating Document / Media Controls (Ultra HD Controller) */}
          {pdfFileName && (
            <div className={styles.pdfControlBar}>
              <div
                className={styles.pdfBadge}
                style={{
                  background:
                    docType === 'video'
                      ? 'rgba(139, 92, 246, 0.12)'
                      : docType === 'image'
                      ? 'rgba(16, 185, 129, 0.12)'
                      : docType === 'pptx'
                      ? 'rgba(234, 88, 12, 0.12)'
                      : 'rgba(239, 68, 68, 0.1)',
                  color:
                    docType === 'video'
                      ? '#8b5cf6'
                      : docType === 'image'
                      ? '#10b981'
                      : docType === 'pptx'
                      ? '#ea580c'
                      : '#ef4444',
                }}
              >
                {docType === 'video' ? (
                  <HiOutlineFilm size={14} />
                ) : docType === 'image' ? (
                  <HiOutlinePhoto size={14} />
                ) : docType === 'pptx' ? (
                  <FaFilePowerpoint size={14} />
                ) : (
                  <FaFilePdf size={14} />
                )}
                <span>
                  {docType === 'video'
                    ? 'فیلم آموزشی'
                    : docType === 'image'
                    ? 'تصویر'
                    : docType === 'pptx'
                    ? 'پاورپوینت'
                    : 'PDF HD'}
                </span>
              </div>

              <span className={styles.pdfTitle} title={pdfFileName}>
                {pdfFileName}
              </span>

              {/* Video Player Controls */}
              {docType === 'video' && (
                <div className={styles.pdfNavGroup} style={{ gap: 8, padding: '2px 8px' }}>
                  <button
                    className={styles.pdfPageBtn}
                    onClick={togglePlayVideo}
                    title={isVideoPlaying ? 'توقف موقت (Pause)' : 'پخش فیلم (Play)'}
                    style={{ color: '#8b5cf6', fontSize: '1rem' }}
                  >
                    {isVideoPlaying ? <HiOutlinePause size={17} /> : <HiOutlinePlay size={17} />}
                  </button>

                  <span className={styles.pdfPageText} style={{ minWidth: 70, direction: 'ltr', fontSize: '0.75rem' }}>
                    {formatVideoTime(videoCurrentTime)} / {formatVideoTime(videoDuration)}
                  </span>

                  <input
                    type="range"
                    min={0}
                    max={videoDuration || 0}
                    step="0.1"
                    value={videoCurrentTime}
                    onChange={handleSeekVideo}
                    title="عقب / جلو بردن فیلم"
                    style={{
                      width: 100,
                      accentColor: '#8b5cf6',
                      cursor: 'pointer',
                      height: 5,
                    }}
                  />

                  <button
                    className={styles.pdfPageBtn}
                    onClick={toggleMuteVideo}
                    title={isVideoMuted ? 'وصل صدا' : 'قطع صدا'}
                    style={{ color: isVideoMuted ? '#ef4444' : 'inherit' }}
                  >
                    {isVideoMuted ? <HiOutlineSpeakerXMark size={16} /> : <HiOutlineSpeakerWave size={16} />}
                  </button>
                </div>
              )}

              {/* Slide Navigation (for multi-page PDF & PPTX) */}
              {pdfTotalPages > 1 && (
                <div className={styles.pdfNavGroup}>
                  <button
                    className={styles.pdfPageBtn}
                    onClick={handlePrevPdfPage}
                    disabled={pdfCurrentPage <= 1 || isLoadingPdf}
                    title={docType === 'pptx' ? 'اسلاید قبل' : 'صفحه قبل'}
                  >
                    <HiOutlineChevronRight />
                  </button>

                  <span className={styles.pdfPageText}>
                    {docType === 'pptx'
                      ? `اسلاید ${pdfCurrentPage} از ${pdfTotalPages}`
                      : `صفحه ${pdfCurrentPage} از ${pdfTotalPages}`}
                  </span>

                  <button
                    className={styles.pdfPageBtn}
                    onClick={handleNextPdfPage}
                    disabled={pdfCurrentPage >= pdfTotalPages || isLoadingPdf}
                    title={docType === 'pptx' ? 'اسلاید بعد' : 'صفحه بعد'}
                  >
                    <HiOutlineChevronLeft />
                  </button>
                </div>
              )}

              {/* Zoom & Fit Controls */}
              <div className={styles.pdfNavGroup}>
                <button
                  className={styles.pdfPageBtn}
                  onClick={() => setPdfZoom((prev) => Math.max(0.2, +(prev - 0.1).toFixed(1)))}
                  title="کوچک‌نمایی / زوم به عقب (-)"
                >
                  <HiOutlineMagnifyingGlassMinus />
                </button>

                <button
                  className={styles.pdfPageBtn}
                  onClick={() => {
                    setPdfZoom(1.0);
                    setPdfOffsetY(0);
                    toast.success('اندازه زوم روی ۱۰۰٪ تنظیم شد');
                  }}
                  title="کلیک برای بازنشانی زوم به ۱۰۰٪ (اندازه استاندارد)"
                  style={{
                    fontSize: '0.75rem',
                    fontWeight: 800,
                    padding: '0 6px',
                    minWidth: 46,
                    textAlign: 'center',
                    background: pdfZoom === 1.0 ? 'rgba(99, 102, 241, 0.1)' : 'transparent',
                    color: pdfZoom === 1.0 ? 'var(--primary-600)' : 'inherit',
                    borderRadius: 6,
                    border: 'none',
                    cursor: 'pointer',
                  }}
                >
                  {Math.round(pdfZoom * 100)}%
                </button>

                <button
                  className={styles.pdfPageBtn}
                  onClick={() => setPdfZoom((prev) => Math.min(3.0, +(prev + 0.1).toFixed(1)))}
                  title="بزرگ‌نمایی (+)"
                >
                  <HiOutlineMagnifyingGlassPlus />
                </button>

                <button
                  className={styles.pdfPageBtn}
                  onClick={() => setPdfFitMode((prev) => (prev === 'fit-width' ? 'fit-height' : 'fit-width'))}
                  title={pdfFitMode === 'fit-width' ? 'تغییر به ارتفاع کامل' : 'تغییر به عرض کامل'}
                  style={{ color: pdfFitMode === 'fit-width' ? 'var(--primary-600)' : 'inherit' }}
                >
                  <HiOutlineArrowsPointingOut />
                </button>
              </div>

              <button
                className={styles.pdfCloseBtnProminent}
                onClick={handleClosePdf}
                title="بستن و برداشتن محتوا از روی تخته"
              >
                <HiOutlineXMark size={16} />
                <span>بستن و بازگشت به تخته</span>
              </button>
            </div>
          )}

          {/* Interactive Whiteboard Canvas Area (Supports mouse wheel scroll on slides/pages) */}
          <div
            className={styles.canvasArea}
            onWheel={handleCanvasWheel}
            style={{
              cursor:
                tool === 'eraser'
                  ? 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'24\' height=\'24\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'%23ef4444\' stroke-width=\'2\' stroke-linecap=\'round\' stroke-linejoin=\'round\'%3E%3Cpath d=\'m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21\'/%3E%3Cpath d=\'M22 21H7\'/%3E%3Cpath d=\'m5 11 9 9\'/%3E%3C/svg%3E") 4 20, auto'
                  : 'crosshair',
            }}
          >
            <canvas
              ref={canvasRef}
              className={styles.canvasElement}
              onPointerDown={startDrawing}
              onPointerMove={draw}
              onPointerUp={stopDrawing}
              onPointerCancel={stopDrawing}
            />
          </div>

          {/* Bottom Floating Recording Bar (As requested: "گزینه شروع ریکورد از صفحه پایین صفحه قرار داشته باشه") */}
          <div className={styles.bottomControlBar}>
            {/* Status indicator */}
            <div className={styles.recStatus}>
              <div
                className={`${styles.recDot} ${recStatus === 'recording' ? styles.recDotPulsing : ''}`}
                style={{
                  backgroundColor:
                    recStatus === 'recording' ? '#ef4444' : recStatus === 'paused' ? '#f59e0b' : '#94a3b8',
                }}
              />
              <span>
                {recStatus === 'recording' ? 'در حال ضبط' : recStatus === 'paused' ? 'متوقف موقت' : 'آماده ضبط'}
              </span>
            </div>

            {/* Timer display */}
            <div className={styles.recTimer}>{formatTimer(recSeconds)}</div>

            {/* Record / Pause / Stop Buttons */}
            {recStatus === 'idle' ? (
              <button className={styles.recBtnStart} onClick={startRecording}>
                <HiOutlinePlay size={20} />
                <span>شروع ضبط تدریس</span>
              </button>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {recStatus === 'recording' ? (
                  <button className={styles.recBtnPause} onClick={pauseRecording}>
                    <HiOutlinePause size={18} />
                    <span>توقف موقت</span>
                  </button>
                ) : (
                  <button className={styles.recBtnPause} onClick={resumeRecording}>
                    <HiOutlinePlay size={18} />
                    <span>ادامه ضبط</span>
                  </button>
                )}

                <button className={styles.recBtnStop} onClick={stopRecording}>
                  <HiOutlineStop size={20} />
                  <span>پایان و ذخیره ویدیو</span>
                </button>
              </div>
            )}

            {/* Lesson Title Badge */}
            <div className={styles.lessonTag} title={projectName}>
              {projectName || 'تدریس آزاد'}
            </div>
          </div>
        </div>
      )}

      {/* ── 5. Modal: Save & Review Video (Shown upon stop recording) ── */}
      {showSaveModal && (
        <div className={styles.modalBackdrop}>
          <div className={styles.modalContent} style={{ maxWidth: 640 }}>
            <div className={styles.modalHeader}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 12,
                    background: 'rgba(16, 185, 129, 0.1)',
                    color: '#10b981',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '1.25rem',
                  }}
                >
                  <HiOutlineCheck />
                </div>
                <h2>ضبط تدریس با موفقیت انجام شد</h2>
              </div>
              <button className={styles.closeBtn} onClick={() => setShowSaveModal(false)}>
                <HiOutlineXMark />
              </button>
            </div>

            {recordedVideoUrl && (
              <video
                src={recordedVideoUrl}
                controls
                autoPlay
                className={styles.previewPlayer}
              />
            )}

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                gap: 10,
                background: 'var(--bg-secondary)',
                padding: '12px 14px',
                borderRadius: 'var(--radius-lg)',
                marginBottom: 16,
                fontSize: '0.85rem',
              }}
            >
              <div>
                <span style={{ color: 'var(--text-tertiary)' }}>موضوع: </span>
                <span style={{ fontWeight: 700 }}>{projectName || 'تدریس تخته هوشمند'}</span>
              </div>
              <div>
                <span style={{ color: 'var(--text-tertiary)' }}>مدت زمان: </span>
                <span style={{ fontWeight: 700, fontFamily: 'monospace' }}>{formatTimer(recSeconds)}</span>
              </div>
              <div>
                <span style={{ color: 'var(--text-tertiary)' }}>فرمت ذخیره: </span>
                <span style={{ fontWeight: 700 }}>WebM Video HD</span>
              </div>
              <div>
                <span style={{ color: 'var(--text-tertiary)' }}>حجم فایل: </span>
                <span style={{ fontWeight: 700 }}>
                  {recordedBlob ? (recordedBlob.size / (1024 * 1024)).toFixed(2) + ' مگابایت' : '-'}
                </span>
              </div>
            </div>

            {/* Folder Selection for Saved Whiteboard Video */}
            <div
              style={{
                background: 'var(--bg-secondary)',
                padding: '12px 14px',
                borderRadius: 'var(--radius-lg)',
                marginBottom: 16,
                border: '1px solid var(--border-color)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 8,
                }}
              >
                <label
                  style={{
                    fontWeight: 750,
                    fontSize: '0.875rem',
                    color: 'var(--text-primary)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <HiOutlineFolder size={18} color="var(--primary-600)" />
                  <span>پوشه مقصد در بخش ویدیوها و رسانه‌ها:</span>
                </label>

                <button
                  type="button"
                  onClick={() => {
                    setIsSaveCreatingFolder(!isSaveCreatingFolder);
                    if (!isSaveCreatingFolder) setSaveNewFolderName('');
                  }}
                  className="btn btn-xs btn-outline"
                  style={{ fontSize: '0.75rem', gap: 4 }}
                >
                  {isSaveCreatingFolder ? '✕ انتخاب از پوشه‌ها' : '➕ ساخت پوشه جدید...'}
                </button>
              </div>

              {!isSaveCreatingFolder ? (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <select
                    className="select"
                    value={saveTargetFolder}
                    onChange={(e) => {
                      if (e.target.value === '__NEW__') {
                        setIsSaveCreatingFolder(true);
                        setSaveNewFolderName('');
                      } else {
                        setSaveTargetFolder(e.target.value);
                      }
                    }}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: 'var(--radius-md)',
                      fontSize: '0.875rem',
                      fontWeight: 600,
                    }}
                  >
                    {availableFolders.map((f) => (
                      <option key={f.name} value={f.name}>
                        📁 {f.name}
                      </option>
                    ))}
                    <option value="__NEW__">➕ ساخت پوشه یا درس جدید...</option>
                  </select>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                  <input
                    type="text"
                    className="input"
                    placeholder="نام پوشه جدید (مثلاً: ریاضی دهم - فصل ۲)"
                    value={saveNewFolderName}
                    onChange={(e) => setSaveNewFolderName(e.target.value)}
                    autoFocus
                    style={{
                      flex: 1,
                      padding: '8px 12px',
                      borderRadius: 'var(--radius-md)',
                      border: '1.5px solid var(--primary-500)',
                      fontSize: '0.875rem',
                    }}
                  />
                </div>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn btn-outline"
                  style={{
                    flex: '1 1 150px',
                    minWidth: '130px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    padding: '11px 14px',
                    fontSize: '0.875rem',
                  }}
                  onClick={handleDownloadVideo}
                >
                  <HiOutlineArrowDownTray size={18} />
                  <span>دانلود ویدیو تدریس / کلاس</span>
                </button>

                <button
                  type="button"
                  className="btn btn-primary"
                  style={{
                    flex: '1.4 1 200px',
                    minWidth: '170px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    padding: '11px 16px',
                    fontSize: '0.875rem',
                    fontWeight: 800,
                    background: 'linear-gradient(135deg, #10b981, #059669)',
                    borderColor: '#059669',
                    color: '#ffffff',
                    boxShadow: '0 4px 14px rgba(16, 185, 129, 0.35)',
                    cursor: isUploading ? 'not-allowed' : 'pointer',
                  }}
                  onClick={handlePublishToArchive}
                  disabled={isUploading}
                >
                  <HiOutlineCloudArrowUp size={20} />
                  <span>{isUploading ? 'در حال ثبت و انتقال...' : 'ذخیره و نمایش در بخش ویدیوها'}</span>
                </button>
              </div>

              {/* Download Whiteboard Notes as PDF */}
              <button
                type="button"
                className="btn btn-outline"
                style={{
                  width: '100%',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  borderColor: '#ef4444',
                  color: '#dc2626',
                  background: 'rgba(239, 68, 68, 0.05)',
                  fontWeight: 700,
                  padding: '11px 16px',
                  fontSize: '0.875rem',
                }}
                onClick={handleExportPdf}
                disabled={isExportingPdf}
              >
                <FaFilePdf size={18} color="#ef4444" />
                <span>
                  {isExportingPdf
                    ? 'در حال آماده‌سازی فایل PDF...'
                    : `دانلود فایل PDF جزوه (${boardTotalPages} برگه نوشته شده)`}
                </span>
              </button>

              <button
                type="button"
                className="btn btn-primary"
                style={{
                  width: '100%',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  fontWeight: 800,
                  padding: '11px 16px',
                  background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
                  color: 'white',
                  boxShadow: '0 4px 14px rgba(99, 102, 241, 0.3)',
                  fontSize: '0.875rem',
                }}
                onClick={() => {
                  const classObj = classesList.find((c) => c.id === selectedClassId);
                  const folderName = classObj?.name || 'تخته هوشمند';
                  const newSession = {
                    id: Date.now().toString(),
                    title: projectName || 'جلسه تدریس هوشمند',
                    date: new Date().toLocaleDateString('fa-IR'),
                    duration: recSeconds,
                    classTitle: classObj?.name || 'کلاس عمومی',
                    videoUrl: recordedVideoUrl,
                    sizeBytes: recordedBlob?.size || 0,
                    folder_name: folderName,
                    category: 'تخته هوشمند',
                  };
                  saveSessionsToLocal([newSession, ...recordedSessions]);
                  setShowSaveModal(false);
                  setIsStudioOpen(false);
                  handleOpenShareModal(newSession);
                }}
              >
                <HiOutlinePaperAirplane size={18} style={{ transform: 'rotate(180deg)' }} />
                <span>ذخیره و ارسال برای معلم یا دوستان</span>
              </button>

              <button
                type="button"
                className="btn btn-ghost"
                style={{ width: '100%', fontSize: '0.85rem', color: 'var(--text-tertiary)', padding: '10px' }}
                onClick={handleSaveLocallyAndClose}
              >
                ذخیره در پنل و بستن پنجره
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 6. Preview Modal for Previous Recordings ── */}
      {showPreviewModal && (
        <div className={styles.modalBackdrop}>
          <div className={styles.modalContent} style={{ maxWidth: 720 }}>
            <div className={styles.modalHeader}>
              <h2>پیش‌نمایش جلسه ضبط شده</h2>
              <button className={styles.closeBtn} onClick={() => setShowPreviewModal(false)}>
                <HiOutlineXMark />
              </button>
            </div>

            {previewVideoUrl && (
              <video
                src={previewVideoUrl}
                controls
                autoPlay
                className={styles.previewPlayer}
              />
            )}

            <div className={styles.modalActions}>
              <button
                type="button"
                className="btn btn-primary"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
                  fontWeight: 700,
                }}
                onClick={() => {
                  setShowPreviewModal(false);
                  const sessionObj = recordedSessions.find((s) => s.videoUrl === previewVideoUrl) || {
                    id: Date.now().toString(),
                    title: projectName || 'جلسه تخته هوشمند',
                    videoUrl: previewVideoUrl,
                    duration: recSeconds,
                    date: new Date().toLocaleDateString('fa-IR'),
                  };
                  handleOpenShareModal(sessionObj);
                }}
              >
                <HiOutlinePaperAirplane style={{ transform: 'rotate(180deg)' }} />
                <span>اشتراک‌گذاری در پیام‌ها</span>
              </button>
              <a
                href={previewVideoUrl}
                download="class-recording.webm"
                className="btn btn-outline"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
              >
                <HiOutlineArrowDownTray size={18} />
                دانلود ویدیو
              </a>
              <button className="btn btn-ghost" onClick={() => setShowPreviewModal(false)}>
                بستن
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 7. Move Whiteboard Video to Folder Modal (انتقال و پوشه‌بندی ویدیوهای تخته هوشمند) ── */}
      {movingSession && (
        <div className={styles.modalBackdrop} onClick={() => setMovingSession(null)}>
          <div
            className={styles.modalContent}
            style={{ maxWidth: 520 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.modalHeader}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div
                  style={{
                    width: 38,
                    height: 38,
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
                  <h2 style={{ fontSize: '1.15rem', margin: 0 }}>انتقال و پوشه‌بندی ویدیو</h2>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>
                    می‌خواهید این ویدیو در کدام پوشه قرار گیرد؟
                  </span>
                </div>
              </div>
              <button
                className={styles.closeBtn}
                onClick={() => setMovingSession(null)}
                type="button"
              >
                <HiOutlineXMark />
              </button>
            </div>

            {/* Current Video Info Banner */}
            <div
              style={{
                background: 'var(--bg-secondary)',
                padding: '12px 14px',
                borderRadius: '12px',
                border: '1px solid var(--border-color)',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                marginBottom: 16,
              }}
            >
              <div
                style={{
                  width: 42,
                  height: 42,
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
                  {movingSession.title}
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)', marginTop: 2 }}>
                  پوشه فعلی:{' '}
                  <span style={{ fontWeight: 700, color: 'var(--primary-600)' }}>
                    📁 {movingSession.folder_name || 'تخته هوشمند'}
                  </span>
                </div>
              </div>
            </div>

            {/* Destination Folder Selector */}
            <div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 10,
                }}
              >
                <label
                  style={{
                    fontWeight: 750,
                    fontSize: '0.875rem',
                    color: 'var(--text-primary)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <HiOutlineFolder size={18} color="var(--primary-600)" />
                  <span>انتخاب پوشه یا درس مقصد:</span>
                </label>

                <button
                  type="button"
                  onClick={() => {
                    setIsCreatingNewFolder(!isCreatingNewFolder);
                    if (!isCreatingNewFolder) setNewFolderName('');
                  }}
                  className="btn btn-xs btn-outline"
                  style={{ fontSize: '0.75rem', gap: 4 }}
                >
                  {isCreatingNewFolder ? '✕ انتخاب از پوشه‌های موجود' : '➕ ساخت پوشه جدید...'}
                </button>
              </div>

              {!isCreatingNewFolder ? (
                <div className={styles.moveFolderList}>
                  {availableFolders.map((f) => {
                    const isCurrent = (movingSession.folder_name || 'تخته هوشمند') === f.name;
                    const isSelected = targetFolder === f.name;

                    return (
                      <div
                        key={f.name}
                        className={`${styles.moveFolderItem} ${
                          isSelected ? styles.moveFolderItemActive : ''
                        }`}
                        onClick={() => setTargetFolder(f.name)}
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
                            <span
                              style={{
                                fontSize: '0.7rem',
                                color: 'var(--text-tertiary)',
                                background: 'var(--bg-card)',
                                padding: '2px 8px',
                                borderRadius: '10px',
                              }}
                            >
                              پوشه فعلی
                            </span>
                          )}
                          <input
                            type="radio"
                            name="wb_move_target_folder"
                            checked={isSelected}
                            onChange={() => setTargetFolder(f.name)}
                            style={{ accentColor: 'var(--primary-600)', cursor: 'pointer' }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div style={{ marginTop: 6 }}>
                  <input
                    type="text"
                    className="input"
                    placeholder="نام پوشه جدید را بنویسید (مثلاً: حسابان ۲ - فصل مشتق)"
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    autoFocus
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      borderRadius: 'var(--radius-lg)',
                      border: '1.5px solid var(--primary-500)',
                      fontSize: '0.9rem',
                    }}
                  />
                  <span
                    style={{
                      fontSize: '0.75rem',
                      color: 'var(--text-tertiary)',
                      marginTop: 4,
                      display: 'block',
                    }}
                  >
                    این پوشه ساخته شده و ویدیو مستقیماً به آن منتقل می‌گردد.
                  </span>
                </div>
              )}
            </div>

            {/* Modal Actions */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: 10,
                marginTop: 22,
                borderTop: '1px solid var(--border-color)',
                paddingTop: 16,
              }}
            >
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => setMovingSession(null)}
              >
                انصراف
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleConfirmMove}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                <HiOutlineFolder size={18} />
                <span>انتقال به این پوشه</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 8. Share Video to Messages Modal (اشتراک‌گذاری ویدیو در گفتگو و پیام‌ها با معلم یا دوستان) ── */}
      {showShareModal && sharingSession && (
        <div className={styles.modalBackdrop} onClick={() => !isSendingShare && setShowShareModal(false)}>
          <div
            className={styles.modalContent}
            style={{ maxWidth: 620 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.modalHeader}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 10,
                    background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
                    color: 'white',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '1.2rem',
                    boxShadow: '0 4px 10px rgba(99, 102, 241, 0.3)',
                  }}
                >
                  <HiOutlinePaperAirplane style={{ transform: 'rotate(180deg)' }} />
                </div>
                <div>
                  <h2 style={{ fontSize: '1.125rem', fontWeight: 800, margin: 0 }}>
                    اشتراک‌گذاری ویدیو در گفتگو و پیام‌ها
                  </h2>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', margin: 0 }}>
                    ارسال مستقیم این ویدیو برای معلم مورد نظر یا هم‌کلاسی‌ها
                  </p>
                </div>
              </div>
              <button
                className={styles.closeBtn}
                onClick={() => setShowShareModal(false)}
                disabled={isSendingShare}
                type="button"
              >
                <HiOutlineXMark />
              </button>
            </div>

            {/* Video preview banner */}
            <div className={styles.shareVideoBanner}>
              <div className={styles.shareVideoIcon}>🎬</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className={styles.shareVideoTitle}>{sharingSession.title || 'ویدیوی تخته هوشمند'}</div>
                <div className={styles.shareVideoMeta}>
                  <span>⏱️ مدت: {formatTimer(sharingSession.duration || 0)}</span>
                  <span>•</span>
                  <span>📅 {sharingSession.date || 'امروز'}</span>
                  <span>•</span>
                  <span style={{ color: '#818cf8', fontWeight: 700 }}>🔒 ویدیوی تخته هوشمند</span>
                </div>
              </div>
            </div>

            {/* Category tabs */}
            <div className={styles.shareTabs}>
              <button
                type="button"
                className={`${styles.shareTabBtn} ${shareRoleTab === 'all' ? styles.shareTabBtnActive : ''}`}
                onClick={() => setShareRoleTab('all')}
              >
                🌟 همه مخاطبان ({shareDirectory.all?.filter((u) => u.id !== user?.id).length || 0})
              </button>
              <button
                type="button"
                className={`${styles.shareTabBtn} ${shareRoleTab === 'teacher' ? styles.shareTabBtnActive : ''}`}
                onClick={() => setShareRoleTab('teacher')}
              >
                👨‍🏫 دبیران و معلمان ({shareDirectory.staff?.length || 0})
              </button>
              <button
                type="button"
                className={`${styles.shareTabBtn} ${shareRoleTab === 'student' ? styles.shareTabBtnActive : ''}`}
                onClick={() => setShareRoleTab('student')}
              >
                🎓 هم‌کلاسی‌ها و دوستان ({shareDirectory.students?.filter((u) => u.id !== user?.id).length || 0})
              </button>
            </div>

            {/* Search Input */}
            <div className={styles.shareSearchBox}>
              <input
                type="text"
                className={styles.shareSearchInput}
                placeholder="جستجو با نام، نام خانوادگی یا آیدی (مثلاً @ali)..."
                value={shareSearch}
                onChange={(e) => setShareSearch(e.target.value)}
              />
              <HiOutlineMagnifyingGlass className={styles.shareSearchIcon} />
            </div>

            {/* Recipients List */}
            <div className={styles.recipientsList}>
              {isLoadingDirectory ? (
                <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '0.875rem' }}>
                  در حال بارگذاری لیست مخاطبان...
                </div>
              ) : getFilteredRecipients().length === 0 ? (
                <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '0.875rem' }}>
                  مخاطبی با این مشخصات یافت نشد
                </div>
              ) : (
                getFilteredRecipients().map((person) => {
                  const isSelected = selectedRecipient?.id === person.id;
                  const isTeacher = person.role === 'teacher';
                  return (
                    <div
                      key={person.id}
                      className={`${styles.recipientItem} ${isSelected ? styles.recipientItemSelected : ''}`}
                      onClick={() => setSelectedRecipient(person)}
                    >
                      <div className={styles.recipientAvatar}>
                        {person.display_name?.charAt(0) || '👤'}
                      </div>
                      <div className={styles.recipientInfo}>
                        <div className={styles.recipientNameRow}>
                          <span className={styles.recipientName}>{person.display_name}</span>
                          {person.username && (
                            <span className={styles.recipientHandle}>@{person.username}</span>
                          )}
                          <span
                            className={`${styles.recipientRoleBadge} ${
                              isTeacher ? styles.recipientRoleTeacher : styles.recipientRoleStudent
                            }`}
                          >
                            {isTeacher ? '👨‍🏫 دبیر' : '🎓 دانش‌آموز'}
                          </span>
                        </div>
                        <div className={styles.recipientSub}>
                          {isTeacher
                            ? `مدرس ${person.department || 'دروس کلاسی'}`
                            : `دانش‌آموز ${person.department || ''}`}
                        </div>
                      </div>

                      {/* Checkmark or select indicator */}
                      <div
                        style={{
                          width: 22,
                          height: 22,
                          borderRadius: '50%',
                          border: isSelected ? 'none' : '2px solid var(--border-color)',
                          background: isSelected ? '#10b981' : 'transparent',
                          color: 'white',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '0.8125rem',
                          flexShrink: 0,
                          transition: 'all 0.2s ease',
                        }}
                      >
                        {isSelected && <HiOutlineCheck />}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Custom message note */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 700, marginBottom: 6, color: 'var(--text-primary)' }}>
                متن همراه ویدیو در پیام:
              </label>
              <textarea
                className="input"
                rows={2}
                style={{ width: '100%', fontSize: '0.8125rem', padding: '8px 12px', resize: 'vertical' }}
                value={shareMessageText}
                onChange={(e) => setShareMessageText(e.target.value)}
                placeholder="متنی برای مخاطب بنویسید..."
              />
            </div>

            {/* Footer Buttons */}
            <div className={styles.modalActions}>
              <button
                type="button"
                className="btn btn-primary"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  fontWeight: 800,
                  padding: '10px 22px',
                  background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
                  boxShadow: '0 4px 14px rgba(99, 102, 241, 0.3)',
                }}
                onClick={handleSendShare}
                disabled={!selectedRecipient || isSendingShare}
              >
                <HiOutlinePaperAirplane style={{ transform: 'rotate(180deg)' }} />
                <span>
                  {isSendingShare
                    ? 'در حال آماده‌سازی و ارسال...'
                    : selectedRecipient
                    ? `ارسال برای ${selectedRecipient.display_name} 🚀`
                    : 'ابتدا یک مخاطب را انتخاب کنید'}
                </span>
              </button>

              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setShowShareModal(false)}
                disabled={isSendingShare}
              >
                انصراف
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
