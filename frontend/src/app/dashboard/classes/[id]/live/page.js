'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import toast, { Toaster } from 'react-hot-toast';
import useAuthStore from '../../../../../stores/authStore';
import { getSocket } from '../../../../../lib/socket';
import api from '../../../../../lib/api';
import {
  HiOutlinePencil,
  HiOutlinePaintBrush,
  HiOutlineTrash,
  HiOutlineVideoCamera,
  HiOutlineVideoCameraSlash,
  HiOutlineMicrophone,
  HiOutlineChatBubbleLeftRight,
  HiOutlineUserGroup,
  HiOutlineArrowsPointingOut,
  HiOutlineArrowRightOnRectangle,
  HiOutlinePaperAirplane,
  HiOutlineCheck,
  HiOutlineXMark,
  HiOutlineSparkles,
  HiOutlineClock,
  HiOutlineShieldCheck,
  HiOutlineStop,
  HiOutlinePlay,
  HiOutlinePause,
  HiOutlineArrowDownTray,
  HiOutlineDocumentText,
  HiOutlineArrowUturnLeft,
  HiOutlineArrowUturnRight,
  HiOutlinePlus,
  HiOutlineChevronRight,
  HiOutlineChevronLeft,
  HiOutlineMagnifyingGlassPlus,
  HiOutlineMagnifyingGlassMinus,
  HiOutlinePhoto,
  HiOutlineFilm,
  HiOutlineSpeakerWave,
  HiOutlineSpeakerXMark,
  HiOutlineCloudArrowUp,
  HiOutlinePower,
  HiOutlineTv,
  HiOutlineBars3,
  HiOutlineChevronDown,
} from 'react-icons/hi2';
import { LuEraser } from 'react-icons/lu';
import {
  FaHandPaper,
  FaChalkboard,
  FaArrowRight,
  FaRegSquare,
  FaRegCircle,
  FaSlash,
  FaFilePdf,
  FaFilePowerpoint,
  FaFont,
} from 'react-icons/fa';
import { loadPptxPresentation } from '../../../../../lib/pptxRenderer';
import styles from './live.module.css';

const PALETTE_COLORS = [
  { name: 'مشکی / تیره', value: '#1e293b' },
  { name: 'سرمه‌ای / آبی', value: '#2563eb' },
  { name: 'قرمز', value: '#ef4444' },
  { name: 'سبز', value: '#10b981' },
  { name: 'زرد / کهربایی', value: '#f59e0b' },
  { name: 'بنفش', value: '#8b5cf6' },
  { name: 'سفید', value: '#ffffff' },
];

const BRUSH_SIZES = [
  { label: 'نازک', size: 2, dotSize: 4 },
  { label: 'متوسط', size: 5, dotSize: 7 },
  { label: 'ضخیم', size: 10, dotSize: 11 },
  { label: 'خیلی ضخیم', size: 18, dotSize: 16 },
];

export default function LiveClassroomPage() {
  const params = useParams();
  const router = useRouter();
  const classId = params?.id;
  const { user } = useAuthStore();
  const isTeacher = user?.role === 'teacher' || user?.role === 'admin';
  const [hasWhiteboardAccess, setHasWhiteboardAccess] = useState(false);
  const [hasMicAccess, setHasMicAccess] = useState(false);
  const [hasScreenAccess, setHasScreenAccess] = useState(false);
  const [wbRequestSent, setWbRequestSent] = useState(false);

  const canDraw = isTeacher || hasWhiteboardAccess;
  const canUseMic = isTeacher || hasMicAccess;
  const canUseScreen = isTeacher || hasScreenAccess;

  // Screen sharing & audio states
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [screenSharingUser, setScreenSharingUser] = useState(null);
  const [remoteScreenFrame, setRemoteScreenFrame] = useState(null);
  const screenStreamRef = useRef(null);
  const screenBroadcastIntervalRef = useRef(null);
  const audioProcessorRef = useRef(null);
  const audioContextRef = useRef(null);

  const [isMicOn, setIsMicOn] = useState(false);
  const micMediaStreamRef = useRef(null);
  const audioRecorderRef = useRef(null);
  const audioCtxRef = useRef(null);

  const stopMicRef = useRef(null);
  const stopScreenShareRef = useRef(null);
  const playAudioChunkRef = useRef(null);
  const handleToggleStudentPermissionRef = useRef(null);
  const handleLowerHandRef = useRef(null);

  const [classData, setClassData] = useState(null);
  const [isLive, setIsLive] = useState(false);
  const [liveDuration, setLiveDuration] = useState(0);
  const [showCloseModal, setShowCloseModal] = useState(false);

  // ── Whiteboard Canvas Refs & State ──
  const canvasRef = useRef(null); // Main composite & screen-capture canvas
  const drawingCanvasRef = useRef(null); // Pure user strokes offscreen canvas
  const startPosRef = useRef({ x: 0, y: 0 });
  const isDrawingRef = useRef(false);

  // Tool states
  const [tool, setTool] = useState('pen'); // 'pen' | 'highlighter' | 'eraser' | 'line' | 'arrow' | 'rect' | 'circle'
  const [currentColor, setCurrentColor] = useState('#2563eb');
  const [brushSize, setBrushSize] = useState(5);
  const [boardType, setBoardType] = useState('white'); // 'white' | 'grid' | 'blackboard'
  const [showToolsMenu, setShowToolsMenu] = useState(false);

  // Undo / Redo stacks
  const historyRef = useRef([]);
  const redoRef = useRef([]);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  // ── Document, Slide & Media Sharing States ──
  const [docType, setDocType] = useState(null); // 'pdf' | 'pptx' | 'image' | null
  const [pdfDocument, setPdfDocument] = useState(null);
  const [pptxPresentation, setPptxPresentation] = useState(null);
  const [pdfFileName, setPdfFileName] = useState('');
  const [pdfCurrentPage, setPdfCurrentPage] = useState(1);
  const [pdfTotalPages, setPdfTotalPages] = useState(0);
  const [isLoadingPdf, setIsLoadingPdf] = useState(false);
  const [pdfZoom, setPdfZoom] = useState(1.0);
  const [pdfFitMode, setPdfFitMode] = useState('fit-width'); // 'fit-width' | 'fit-height'
  const [pdfOffsetY, setPdfOffsetY] = useState(0);

  const pdfCanvasRef = useRef(null); // Holds rendered page for teacher
  const pdfImageRef = useRef(null); // Holds loaded worksheet image
  const remoteDocImageRef = useRef(null); // Holds shared slide image for students
  const pageCacheRef = useRef(new Map());
  const docFileInputRef = useRef(null);
  const imageFileInputRef = useRef(null);
  const videoFileInputRef = useRef(null);
  const videoElementRef = useRef(null);
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const [videoDuration, setVideoDuration] = useState(0);
  const [videoCurrentTime, setVideoCurrentTime] = useState(0);
  const [isVideoMuted, setIsVideoMuted] = useState(false);
  const colorInputRef = useRef(null);

  // ── Multi-Page Whiteboard Sheets ──
  const [boardCurrentPage, setBoardCurrentPage] = useState(1);
  const [boardTotalPages, setBoardTotalPages] = useState(1);
  const boardPagesRef = useRef([
    { pageNum: 1, drawingDataUrl: null, boardType: 'white' }
  ]);

  // ── Live Class Recording States ──
  const [recStatus, setRecStatus] = useState('idle'); // 'idle' | 'recording' | 'paused'
  const [recSeconds, setRecSeconds] = useState(0);
  const [recordedBlob, setRecordedBlob] = useState(null);
  const [recordedVideoUrl, setRecordedVideoUrl] = useState(null);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [saveTitle, setSaveTitle] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const mediaRecorderRef = useRef(null);
  const recordedChunksRef = useRef([]);
  const recTimerIntervalRef = useRef(null);
  const micStreamRef = useRef(null);

  // ── Video / Audio (Webcam) ──
  const [cameraActive, setCameraActive] = useState(false);
  const [micActive, setMicActive] = useState(true);
  const localVideoRef = useRef(null);
  const [remoteTeacherFrame, setRemoteTeacherFrame] = useState(null);
  const mediaStreamRef = useRef(null);

  // ── Drawer & Interactions ──
  const [activeTab, setActiveTab] = useState('chat'); // 'chat' | 'participants'
  const [participants, setParticipants] = useState([]);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [handRaised, setHandRaised] = useState(false);
  const chatScrollRef = useRef(null);
  const liveTimerRef = useRef(null);

  // ── 1. Fetch Class Info ──
  useEffect(() => {
    if (!classId) return;
    api.get(`/classes/${classId}`)
      .then((res) => {
        const cls = res.data?.data?.class;
        setClassData(cls);
        setSaveTitle(`جلسه آنلاین ${cls?.name || 'کلاس'} - ${new Date().toLocaleDateString('fa-IR')}`);
      })
      .catch((err) => console.error('Error fetching class data:', err));
  }, [classId]);

  // ── 2. Composite Canvas Rendering Engine ──
  const renderCompositeCanvas = useCallback(() => {
    const mainCanvas = canvasRef.current;
    const drawingCanvas = drawingCanvasRef.current;
    if (!mainCanvas || !drawingCanvas) return;

    const ctx = mainCanvas.getContext('2d');
    const width = mainCanvas.width;
    const height = mainCanvas.height;

    // A. Draw Board Background
    if (boardType === 'blackboard') {
      ctx.fillStyle = '#1e3a2f';
      ctx.fillRect(0, 0, width, height);

      const grad = ctx.createRadialGradient(width / 2, height / 2, 50, width / 2, height / 2, Math.max(width, height) / 1.2);
      grad.addColorStop(0, 'rgba(255, 255, 255, 0.03)');
      grad.addColorStop(1, 'rgba(0, 0, 0, 0.25)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);
    } else if (boardType === 'grid') {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);

      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 1;
      const gridSize = 28;
      ctx.beginPath();
      for (let x = gridSize; x < width; x += gridSize) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
      }
      for (let y = gridSize; y < height; y += gridSize) {
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
      }
      ctx.stroke();
    } else {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);
    }

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    // B. Draw PDF Slide, PPTX Slide, Worksheet Image, Video Frame, or Remote Broadcast Image
    const mediaSource = pdfCanvasRef.current || pdfImageRef.current || videoElementRef.current || remoteDocImageRef.current;
    if (mediaSource) {
      const srcW = mediaSource.videoWidth || mediaSource.naturalWidth || mediaSource.width;
      const srcH = mediaSource.videoHeight || mediaSource.naturalHeight || mediaSource.height;

      if (srcW && srcH) {
        let drawW, drawH;
        if (pdfFitMode === 'fit-width') {
          const targetW = Math.min(width - 60, Math.max(860, width * 0.75)) * pdfZoom;
          const scale = targetW / srcW;
          drawW = targetW;
          drawH = srcH * scale;
        } else {
          const targetH = (height - 140) * pdfZoom;
          const scale = targetH / srcH;
          drawW = srcW * scale;
          drawH = targetH;
        }

        const drawX = (width - drawW) / 2;
        const baseY = pdfFitMode === 'fit-width' ? 70 : (height - drawH) / 2;
        const drawY = baseY + pdfOffsetY;

        ctx.save();
        ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
        ctx.shadowBlur = 24;
        ctx.shadowOffsetY = 6;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(drawX, drawY, drawW, drawH);
        ctx.restore();

        ctx.drawImage(mediaSource, drawX, drawY, drawW, drawH);
      }
    }

    // C. Draw User & Real-time Strokes from Offscreen Canvas
    ctx.drawImage(drawingCanvas, 0, 0);
  }, [boardType, pdfZoom, pdfFitMode, pdfOffsetY]);

  // Adjust canvas resolution to parent container
  const initCanvases = useCallback(() => {
    const mainCanvas = canvasRef.current;
    if (!mainCanvas) return;

    const parent = mainCanvas.parentElement;
    const width = parent?.clientWidth || window.innerWidth;
    const height = parent?.clientHeight || window.innerHeight;

    if (!drawingCanvasRef.current) {
      drawingCanvasRef.current = document.createElement('canvas');
    }
    const drawingCanvas = drawingCanvasRef.current;

    let tempImgData = null;
    if (drawingCanvas.width > 0 && drawingCanvas.height > 0) {
      try {
        tempImgData = drawingCanvas.getContext('2d').getImageData(0, 0, drawingCanvas.width, drawingCanvas.height);
      } catch (e) {}
    }

    mainCanvas.width = width;
    mainCanvas.height = height;
    drawingCanvas.width = width;
    drawingCanvas.height = height;

    if (tempImgData) {
      drawingCanvas.getContext('2d').putImageData(tempImgData, 0, 0);
    }

    renderCompositeCanvas();
  }, [renderCompositeCanvas]);

  useEffect(() => {
    initCanvases();
    window.addEventListener('resize', initCanvases);
    return () => window.removeEventListener('resize', initCanvases);
  }, [initCanvases]);

  // Undo / Redo history snapshots
  const saveHistorySnapshot = useCallback(() => {
    const dCanvas = drawingCanvasRef.current;
    if (!dCanvas) return;
    const dCtx = dCanvas.getContext('2d');
    const snapshot = dCtx.getImageData(0, 0, dCanvas.width, dCanvas.height);

    historyRef.current.push(snapshot);
    if (historyRef.current.length > 30) {
      historyRef.current.shift();
    }
    redoRef.current = [];
    setCanUndo(true);
    setCanRedo(false);
  }, []);

  const handleUndo = () => {
    if (!canDraw) return;
    const dCanvas = drawingCanvasRef.current;
    if (!dCanvas || historyRef.current.length === 0) return;
    const dCtx = dCanvas.getContext('2d');

    const current = dCtx.getImageData(0, 0, dCanvas.width, dCanvas.height);
    redoRef.current.push(current);

    const prev = historyRef.current.pop();
    dCtx.putImageData(prev, 0, 0);
    renderCompositeCanvas();

    setCanUndo(historyRef.current.length > 0);
    setCanRedo(true);

    if (canDraw) {
      broadcastCurrentBoardSnapshot();
    }
  };

  const handleRedo = () => {
    if (!canDraw) return;
    const dCanvas = drawingCanvasRef.current;
    if (!dCanvas || redoRef.current.length === 0) return;
    const dCtx = dCanvas.getContext('2d');

    const current = dCtx.getImageData(0, 0, dCanvas.width, dCanvas.height);
    historyRef.current.push(current);

    const next = redoRef.current.pop();
    dCtx.putImageData(next, 0, 0);
    renderCompositeCanvas();

    setCanUndo(true);
    setCanRedo(redoRef.current.length > 0);

    if (canDraw) {
      broadcastCurrentBoardSnapshot();
    }
  };

  // Broadcast current board drawing image to sync all students reliably
  const broadcastCurrentBoardSnapshot = () => {
    const dCanvas = drawingCanvasRef.current;
    if (!dCanvas) return;
    const dataUrl = dCanvas.toDataURL('image/png');
    const socket = getSocket();
    socket.emit('wb_sync_all', {
      classId,
      boardType,
      strokes: [{ tool: 'snapshot', dataUrl }],
      currentPage: boardCurrentPage,
    });
  };

  // Draw incoming single stroke from socket
  const drawStrokeOnCanvas = (targetCanvas, stroke) => {
    if (!targetCanvas || !stroke) return;
    const ctx = targetCanvas.getContext('2d');

    if (stroke.tool === 'snapshot' && stroke.dataUrl) {
      const img = new Image();
      img.onload = () => {
        ctx.clearRect(0, 0, targetCanvas.width, targetCanvas.height);
        ctx.drawImage(img, 0, 0);
        renderCompositeCanvas();
      };
      img.src = stroke.dataUrl;
      return;
    }

    ctx.save();

    if (stroke.tool === 'highlighter') {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = stroke.color || '#f59e0b';
      ctx.globalAlpha = 0.35;
      ctx.lineWidth = (stroke.size || 5) * 3.5;
      ctx.lineCap = 'square';
      ctx.lineJoin = 'miter';
    } else if (stroke.tool === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.lineWidth = (stroke.size || 5) * 4;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = stroke.color || '#2563eb';
      ctx.lineWidth = stroke.size || 4;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
    }

    if (stroke.tool === 'line') {
      ctx.beginPath();
      ctx.moveTo(stroke.start.x, stroke.start.y);
      ctx.lineTo(stroke.end.x, stroke.end.y);
      ctx.stroke();
    } else if (stroke.tool === 'arrow') {
      ctx.beginPath();
      ctx.moveTo(stroke.start.x, stroke.start.y);
      ctx.lineTo(stroke.end.x, stroke.end.y);
      ctx.stroke();
      const angle = Math.atan2(stroke.end.y - stroke.start.y, stroke.end.x - stroke.start.x);
      const headLen = Math.max(14, (stroke.size || 4) * 2.5);
      ctx.beginPath();
      ctx.moveTo(stroke.end.x, stroke.end.y);
      ctx.lineTo(stroke.end.x - headLen * Math.cos(angle - Math.PI / 6), stroke.end.y - headLen * Math.sin(angle - Math.PI / 6));
      ctx.moveTo(stroke.end.x, stroke.end.y);
      ctx.lineTo(stroke.end.x - headLen * Math.cos(angle + Math.PI / 6), stroke.end.y - headLen * Math.sin(angle + Math.PI / 6));
      ctx.stroke();
    } else if (stroke.tool === 'rect') {
      ctx.strokeRect(stroke.start.x, stroke.start.y, stroke.end.x - stroke.start.x, stroke.end.y - stroke.start.y);
    } else if (stroke.tool === 'circle') {
      ctx.beginPath();
      const rx = Math.abs((stroke.end.x - stroke.start.x) / 2);
      const ry = Math.abs((stroke.end.y - stroke.start.y) / 2);
      const cx = Math.min(stroke.start.x, stroke.end.x) + rx;
      const cy = Math.min(stroke.start.y, stroke.end.y) + ry;
      ctx.ellipse(cx, cy, rx, ry, 0, 0, 2 * Math.PI);
      ctx.stroke();
    } else if (stroke.tool === 'text') {
      ctx.font = `bold ${Math.max(22, (stroke.size || 5) * 4)}px Vazirmatn, Tahoma, sans-serif`;
      ctx.fillStyle = stroke.color || '#1e293b';
      ctx.textAlign = 'right';
      ctx.direction = 'rtl';
      ctx.fillText(stroke.text, stroke.x, stroke.y);
    } else if (stroke.points && stroke.points.length >= 2) {
      ctx.beginPath();
      ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
      for (let i = 1; i < stroke.points.length; i++) {
        ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
      }
      ctx.stroke();
    }

    ctx.restore();
    renderCompositeCanvas();
  };

  // ── 3. Apply Remote Document State for Students ──
  const applyRemoteDocState = (remoteDoc) => {
    if (!remoteDoc || !remoteDoc.pageDataUrl) {
      remoteDocImageRef.current = null;
      setDocType(null);
      setPdfFileName('');
      setPdfCurrentPage(1);
      setPdfTotalPages(0);
      renderCompositeCanvas();
      return;
    }

    const img = new Image();
    img.onload = () => {
      remoteDocImageRef.current = img;
      setDocType(remoteDoc.docType || 'pdf');
      setPdfFileName(remoteDoc.fileName || 'سند اشتراک‌گذاری شده');
      setPdfCurrentPage(remoteDoc.currentPage || 1);
      setPdfTotalPages(remoteDoc.totalPages || 1);
      renderCompositeCanvas();
    };
    img.src = remoteDoc.pageDataUrl;
  };

  // Broadcast current slide image to students
  const broadcastCurrentSlide = (currentPageNum, totalPagesNum) => {
    const mediaSource = pdfCanvasRef.current || pdfImageRef.current;
    if (!mediaSource) return;

    let pageDataUrl = null;
    try {
      if (mediaSource instanceof HTMLCanvasElement) {
        pageDataUrl = mediaSource.toDataURL('image/jpeg', 0.85);
      } else if (mediaSource instanceof HTMLImageElement) {
        const off = document.createElement('canvas');
        off.width = mediaSource.naturalWidth || mediaSource.width;
        off.height = mediaSource.naturalHeight || mediaSource.height;
        const cx = off.getContext('2d');
        cx.drawImage(mediaSource, 0, 0);
        pageDataUrl = off.toDataURL('image/jpeg', 0.85);
      }
    } catch (e) {
      console.warn('Could not extract page data URL:', e);
    }

    if (pageDataUrl) {
      const docState = {
        docType,
        fileName: pdfFileName,
        currentPage: currentPageNum || pdfCurrentPage,
        totalPages: totalPagesNum || pdfTotalPages,
        pageDataUrl,
      };
      getSocket().emit('wb_doc_change', { classId, docState });
    }
  };

  // ── Handlers & Communication Utilities ──
  const playAudioChunk = useCallback((base64Data) => {
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') {
        ctx.resume();
      }
      const binaryString = atob(base64Data);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      ctx.decodeAudioData(
        bytes.buffer.slice(0),
        (buffer) => {
          const source = ctx.createBufferSource();
          source.buffer = buffer;
          source.connect(ctx.destination);
          source.start(0);
        },
        () => {
          try {
            const snd = new Audio(`data:audio/webm;base64,${base64Data}`);
            snd.play().catch(() => {});
          } catch (_) {}
        }
      );
    } catch (e) {
      console.warn('Audio play chunk error:', e);
    }
  }, []);

  const stopMic = useCallback(() => {
    if (audioRecorderRef.current && audioRecorderRef.current.state !== 'inactive') {
      try { audioRecorderRef.current.stop(); } catch (_) {}
      audioRecorderRef.current = null;
    }
    if (micMediaStreamRef.current) {
      micMediaStreamRef.current.getTracks().forEach((track) => track.stop());
      micMediaStreamRef.current = null;
    }
    setIsMicOn(false);
    getSocket().emit('toggle_mic', { classId, micOn: false });
  }, [classId]);

  const startMic = useCallback(async () => {
    if (!canUseMic) {
      toast.error('شما اجازه روشن کردن میکروفون را ندارید! ابتدا دست خود را بالا ببرید تا معلم اجازه دهد ✋');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      micMediaStreamRef.current = stream;

      let mimeType = 'audio/webm;codecs=opus';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'audio/webm';
      }

      const recorder = new MediaRecorder(stream, { mimeType });
      audioRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          const reader = new FileReader();
          reader.onloadend = () => {
            const res = reader.result;
            if (typeof res === 'string') {
              const base64Data = res.split(',')[1];
              if (base64Data) {
                getSocket().emit('audio_chunk', { classId, chunk: base64Data });
              }
            }
          };
          reader.readAsDataURL(e.data);
        }
      };

      recorder.start(400); // 400ms slices for smooth real-time speech
      setIsMicOn(true);
      getSocket().emit('toggle_mic', { classId, micOn: true });
      toast.success('میکروفون روشن شد 🎙️ صدای شما برای اعضای کلاس پخش می‌شود');
    } catch (err) {
      console.error('Mic start error:', err);
      toast.error('دسترسی به میکروفون امکان‌پذیر نیست یا توسط مرورگر مسدود شده است');
    }
  }, [canUseMic, classId]);

  const toggleMic = useCallback(() => {
    if (isMicOn) {
      stopMic();
      toast('میکروفون خاموش شد 🔇', { icon: '🔇', duration: 2000 });
    } else {
      startMic();
    }
  }, [isMicOn, stopMic, startMic]);

  const stopScreenShare = useCallback(() => {
    if (screenBroadcastIntervalRef.current) {
      clearInterval(screenBroadcastIntervalRef.current);
      screenBroadcastIntervalRef.current = null;
    }
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((track) => track.stop());
      screenStreamRef.current = null;
    }
    setIsScreenSharing(false);
    getSocket().emit('stop_screen_share', { classId });
  }, [classId]);

  const startScreenShare = useCallback(async () => {
    if (!canUseScreen) {
      toast.error('اجازه اشتراک‌گذاری صفحه نمایش را ندارید! از معلم درخواست اجازه کنید ✋');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { cursor: 'always', frameRate: { ideal: 15, max: 24 } },
        audio: false,
      });
      screenStreamRef.current = stream;

      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.onended = () => {
          stopScreenShare();
          toast('اشتراک صفحه نمایش پایان یافت ⏹️', { icon: '⏹️', duration: 2500 });
        };
      }

      const screenVideo = document.createElement('video');
      screenVideo.srcObject = stream;
      screenVideo.autoplay = true;
      screenVideo.playsInline = true;
      screenVideo.muted = true;
      await screenVideo.play();

      const screenCanvas = document.createElement('canvas');
      const screenCtx = screenCanvas.getContext('2d');

      getSocket().emit('start_screen_share', { classId });
      setIsScreenSharing(true);
      setScreenSharingUser({
        userId: user?.id,
        name: user?.name || user?.full_name || 'شما',
        socketId: getSocket().id,
      });

      screenBroadcastIntervalRef.current = setInterval(() => {
        if (!screenStreamRef.current || !screenStreamRef.current.active) {
          stopScreenShare();
          return;
        }
        if (screenVideo.videoWidth > 0 && screenVideo.videoHeight > 0) {
          const targetW = Math.min(1280, screenVideo.videoWidth);
          const scale = targetW / screenVideo.videoWidth;
          const targetH = Math.round(screenVideo.videoHeight * scale);
          screenCanvas.width = targetW;
          screenCanvas.height = targetH;
          screenCtx.drawImage(screenVideo, 0, 0, targetW, targetH);
          const frameData = screenCanvas.toDataURL('image/jpeg', 0.65);
          getSocket().emit('screen_frame', { classId, frame: frameData });
        }
      }, 350);

      toast.success('🖥️ اشتراک‌گذاری صفحه نمایش آغاز شد!');
    } catch (err) {
      console.error('Screen sharing error:', err);
      if (err.name !== 'NotAllowedError') {
        toast.error('خطا در آغاز اشتراک صفحه نمایش');
      }
    }
  }, [canUseScreen, classId, stopScreenShare, user]);

  const toggleScreenShare = useCallback(() => {
    if (isScreenSharing) {
      stopScreenShare();
      toast('اشتراک صفحه پایان یافت ⏹️', { icon: '⏹️', duration: 2500 });
    } else {
      startScreenShare();
    }
  }, [isScreenSharing, stopScreenShare, startScreenShare]);

  const handleToggleStudentPermission = useCallback((targetParticipant, permissionType) => {
    if (!isTeacher) return;
    const socket = getSocket();
    let currentVal = false;
    if (permissionType === 'whiteboard') currentVal = !!targetParticipant.canDraw;
    if (permissionType === 'mic') currentVal = !!targetParticipant.canMic;
    if (permissionType === 'screen') currentVal = !!targetParticipant.canScreenShare;

    const nextVal = !currentVal;
    socket.emit('set_student_permission', {
      classId,
      targetSocketId: targetParticipant.socketId,
      targetUserId: targetParticipant.userId,
      permissionType,
      allowed: nextVal,
    });

    setParticipants((prev) =>
      prev.map((p) => {
        if (p.socketId === targetParticipant.socketId || p.userId === targetParticipant.userId) {
          const updated = { ...p };
          if (permissionType === 'whiteboard') updated.canDraw = nextVal;
          if (permissionType === 'mic') updated.canMic = nextVal;
          if (permissionType === 'screen') updated.canScreenShare = nextVal;
          return updated;
        }
        return p;
      })
    );

    const permLabel =
      permissionType === 'whiteboard'
        ? 'تخته هوشمند'
        : permissionType === 'mic'
        ? 'میکروفون'
        : 'اشتراک صفحه';

    toast(
      nextVal
        ? `دسترسی «${permLabel}» برای «${targetParticipant.name}» فعال شد ✅`
        : `دسترسی «${permLabel}» برای «${targetParticipant.name}» غیرفعال شد 🔒`,
      {
        icon: nextVal ? '✅' : '🔒',
        duration: 3000,
      }
    );
  }, [isTeacher, classId]);

  const handleToggleAllStudentsPermission = useCallback((permissionType, allowed) => {
    if (!isTeacher) return;
    const socket = getSocket();
    socket.emit('set_all_student_permission', {
      classId,
      permissionType,
      allowed,
    });

    setParticipants((prev) =>
      prev.map((p) => {
        if (p.role !== 'teacher' && p.role !== 'admin') {
          const updated = { ...p };
          if (permissionType === 'whiteboard') updated.canDraw = allowed;
          if (permissionType === 'mic') updated.canMic = allowed;
          if (permissionType === 'screen') updated.canScreenShare = allowed;
          return updated;
        }
        return p;
      })
    );

    const permLabel =
      permissionType === 'whiteboard'
        ? 'تخته هوشمند'
        : permissionType === 'mic'
        ? 'میکروفون'
        : 'اشتراک صفحه';

    toast(
      allowed
        ? `دسترسی «${permLabel}» برای همه دانش‌آموزان باز شد 🔓`
        : `دسترسی «${permLabel}» برای همه دانش‌آموزان بسته شد 🔒`,
      {
        icon: allowed ? '🔓' : '🔒',
        duration: 3500,
      }
    );
  }, [isTeacher, classId]);

  const handleLowerHand = useCallback((target) => {
    const socket = getSocket();
    socket.emit('lower_student_hand', {
      classId,
      targetSocketId: target.socketId,
      targetUserId: target.userId,
    });
    setParticipants((prev) =>
      prev.map((p) =>
        p.socketId === target.socketId || p.userId === target.userId
          ? { ...p, handRaised: false }
          : p
      )
    );
    toast('دست دانش‌آموز پایین آورده شد 👌', { icon: '👌', duration: 2500 });
  }, [classId]);

  const handleToggleHandRaise = useCallback(() => {
    const socket = getSocket();
    const nextState = !handRaised;
    socket.emit('toggle_hand_raise', { classId });
    setHandRaised(nextState);

    if (nextState) {
      toast.success('دست شما بالا رفت! معلم متوجه سوال شما شد ✋', {
        duration: 4000,
        style: { background: '#f59e0b', color: '#1e293b', fontWeight: 'bold' },
      });
    } else {
      toast('دست شما پایین آمد 👌', { icon: '👌', duration: 2500 });
    }
  }, [classId, handRaised]);

  // Keep refs updated for listeners
  useEffect(() => {
    stopMicRef.current = stopMic;
    stopScreenShareRef.current = stopScreenShare;
    playAudioChunkRef.current = playAudioChunk;
    handleToggleStudentPermissionRef.current = handleToggleStudentPermission;
    handleLowerHandRef.current = handleLowerHand;
  });

  // ── 4. Socket Connection & Setup ──
  useEffect(() => {
    if (!classId) return;
    const socket = getSocket();

    const currentUserData = {
      id: user?.id || 'guest_' + Math.random().toString(36).substr(2, 5),
      name: user?.full_name || user?.name || (isTeacher ? 'استاد کلاس' : 'دانش‌آموز'),
      role: user?.role || 'student',
      avatar: user?.avatar || null,
    };

    socket.emit('join_class', { classId, user: currentUserData });

    // Initial state from server
    socket.on('init_class_state', (data) => {
      setIsLive(data.isLive);
      if (data.isLive && data.startedAt) {
        const elapsed = Math.floor((Date.now() - new Date(data.startedAt).getTime()) / 1000);
        setLiveDuration(Math.max(0, elapsed));
      }
      if (data.boardType) setBoardType(data.boardType);
      if (data.docState) applyRemoteDocState(data.docState);
      if (data.currentPage) setBoardCurrentPage(data.currentPage);
      if (data.boardPages) {
        boardPagesRef.current = data.boardPages;
        setBoardTotalPages(data.boardPages.length);
      }
      if (data.strokes && data.strokes.length > 0) {
        data.strokes.forEach((s) => drawStrokeOnCanvas(drawingCanvasRef.current, s));
      }
      if (data.chatMessages) setChatMessages(data.chatMessages);
      if (data.participants) setParticipants(data.participants);
      if (data.canDraw !== undefined) {
        setHasWhiteboardAccess(!!data.canDraw);
      }
      if (data.canMic !== undefined) {
        setHasMicAccess(!!data.canMic);
      }
      if (data.canScreenShare !== undefined) {
        setHasScreenAccess(!!data.canScreenShare);
      }
      if (data.screenSharingUser) {
        setScreenSharingUser(data.screenSharingUser);
      }
    });

    socket.on('class_live_started', () => {
      setIsLive(true);
      setLiveDuration(0);
      toast.success('🔴 کلاس آنلاین زنده آغاز شد!');
    });

    socket.on('class_live_ended', () => {
      setIsLive(false);
      toast('جلسه آنلاین با موفقیت به پایان رسید 🏁', { icon: '👏' });
    });

    // Real-time Whiteboard Draw Event
    socket.on('wb_draw', (stroke) => {
      drawStrokeOnCanvas(drawingCanvasRef.current, stroke);
    });

    socket.on('wb_clear', () => {
      const dCanvas = drawingCanvasRef.current;
      if (dCanvas) {
        dCanvas.getContext('2d').clearRect(0, 0, dCanvas.width, dCanvas.height);
      }
      renderCompositeCanvas();
      toast('تخته توسط معلم پاک شد', { icon: '🧹' });
    });

    socket.on('wb_sync_all', (data) => {
      if (data.boardType) setBoardType(data.boardType);
      if (data.docState !== undefined) applyRemoteDocState(data.docState);
      if (data.currentPage !== undefined) setBoardCurrentPage(data.currentPage);
      if (data.strokes && data.strokes.length > 0) {
        data.strokes.forEach((s) => drawStrokeOnCanvas(drawingCanvasRef.current, s));
      }
    });

    socket.on('wb_doc_change', (docState) => {
      applyRemoteDocState(docState);
    });

    socket.on('wb_change_bg', (data) => {
      if (data.boardType) setBoardType(data.boardType);
    });

    socket.on('wb_page_change', (data) => {
      if (data.pageNum) {
        setBoardCurrentPage(data.pageNum);
        if (data.boardPages) {
          boardPagesRef.current = data.boardPages;
          setBoardTotalPages(data.boardPages.length);
          loadBoardPageData(data.pageNum, false);
        }
      }
    });

    // ── Whiteboard Permission Event Listeners ──
    socket.on('whiteboard_access_changed', (data) => {
      setParticipants((prev) =>
        prev.map((p) =>
          (p.socketId === data.socketId || p.userId === data.userId)
            ? { ...p, canDraw: data.canDraw }
            : p
        )
      );

      const isMe = (user?.id && data.userId === user.id) || data.socketId === socket.id;
      if (isMe) {
        setHasWhiteboardAccess(data.canDraw);
        if (data.canDraw) {
          setWbRequestSent(false);
          toast.success('🎉 دبیر کلاس اجازه استفاده از تخته هوشمند را به شما داد!', {
            duration: 5000,
            style: { background: '#10b981', color: '#fff', fontWeight: 'bold' },
          });
        } else {
          toast('🔒 دسترسی شما به تخته هوشمند توسط دبیر برداشته شد.', {
            icon: '🔒',
            duration: 4000,
          });
        }
      } else if (isTeacher) {
        toast(
          data.canDraw
            ? `✏️ دسترسی به تخته برای «${data.name}» فعال شد`
            : `🔒 دسترسی «${data.name}» به تخته غیرفعال شد`,
          { icon: data.canDraw ? '✅' : '🔒', duration: 3000 }
        );
      }
    });

    socket.on('all_whiteboard_access_changed', (data) => {
      setParticipants((prev) =>
        prev.map((p) =>
          p.role !== 'teacher' && p.role !== 'admin' ? { ...p, canDraw: data.canDraw } : p
        )
      );

      if (!isTeacher) {
        setHasWhiteboardAccess(data.canDraw);
        if (data.canDraw) {
          setWbRequestSent(false);
          toast.success('🎉 دبیر کلاس به همه دانش‌آموزان اجازه نوشتن روی تخته را داد!', {
            duration: 5000,
            style: { background: '#10b981', color: '#fff', fontWeight: 'bold' },
          });
        } else {
          toast('🔒 دسترسی همه دانش‌آموزان به تخته هوشمند قفل شد.', { icon: '🔒', duration: 4000 });
        }
      }
    });

    socket.on('whiteboard_access_requested', (data) => {
      if (isTeacher) {
        toast(
          (t) => (
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span>✋ <strong>{data.name}</strong> درخواست نوشتن روی تخته دارد</span>
              <button
                onClick={() => {
                  getSocket().emit('grant_whiteboard_access', {
                    classId,
                    targetSocketId: data.socketId,
                    targetUserId: data.userId,
                  });
                  toast.dismiss(t.id);
                }}
                style={{
                  background: '#10b981',
                  color: '#fff',
                  border: 'none',
                  padding: '4px 10px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontWeight: 'bold',
                  fontSize: '0.8rem',
                }}
              >
                اجازه دادن ✅
              </button>
            </div>
          ),
          { duration: 8000 }
        );
      }
    });

    // ── Multi-Permission Changed Listener (Mic, Screen, Whiteboard) ──
    socket.on('student_permission_changed', (data) => {
      setParticipants((prev) =>
        prev.map((p) => {
          if (p.socketId === data.socketId || p.userId === data.userId) {
            const updated = { ...p };
            if (data.permissionType === 'whiteboard') updated.canDraw = data.allowed;
            if (data.permissionType === 'mic') updated.canMic = data.allowed;
            if (data.permissionType === 'screen') updated.canScreenShare = data.allowed;
            return updated;
          }
          return p;
        })
      );

      const isMe = (user?.id && data.userId === user.id) || data.socketId === socket.id;
      if (isMe) {
        if (data.permissionType === 'whiteboard') {
          setHasWhiteboardAccess(data.allowed);
          toast(data.allowed ? '🎉 دبیر به شما اجازه نوشتن روی تخته را داد!' : '🔒 دسترسی تخته برداشته شد.', {
            icon: data.allowed ? '✏️' : '🔒',
            duration: 4500,
          });
        } else if (data.permissionType === 'mic') {
          setHasMicAccess(data.allowed);
          toast(data.allowed ? '🎙️ دبیر اجازه روشن کردن میکروفون را به شما داد!' : '🔇 دسترسی میکروفون توسط دبیر برداشته شد.', {
            icon: data.allowed ? '🎤' : '🔇',
            duration: 4500,
          });
          if (!data.allowed) {
            stopMicRef.current?.();
          }
        } else if (data.permissionType === 'screen') {
          setHasScreenAccess(data.allowed);
          toast(data.allowed ? '🖥️ دبیر اجازه اشتراک‌گذاری صفحه نمایش را به شما داد!' : '🔒 دسترسی اشتراک صفحه برداشته شد.', {
            icon: data.allowed ? '🖥️' : '🔒',
            duration: 4500,
          });
          if (!data.allowed) {
            stopScreenShareRef.current?.();
          }
        }
      }
    });

    socket.on('all_student_permission_changed', (data) => {
      setParticipants((prev) =>
        prev.map((p) => {
          if (p.role !== 'teacher' && p.role !== 'admin') {
            const updated = { ...p };
            if (data.permissionType === 'whiteboard') updated.canDraw = data.allowed;
            if (data.permissionType === 'mic') updated.canMic = data.allowed;
            if (data.permissionType === 'screen') updated.canScreenShare = data.allowed;
            return updated;
          }
          return p;
        })
      );

      if (!isTeacher) {
        if (data.permissionType === 'whiteboard') {
          setHasWhiteboardAccess(data.allowed);
          toast(data.allowed ? '🎉 دبیر دسترسی به تخته هوشمند را برای همه فعال کرد!' : '🔒 تخته هوشمند برای همه قفل شد', { icon: data.allowed ? '✏️' : '🔒', duration: 4000 });
        } else if (data.permissionType === 'mic') {
          setHasMicAccess(data.allowed);
          if (!data.allowed) stopMicRef.current?.();
          toast(data.allowed ? '🎙️ دبیر اجازه روشن کردن میکروفون را برای همه آزاد کرد!' : '🔇 میکروفون همه قفل شد', { icon: data.allowed ? '🎤' : '🔇', duration: 4000 });
        } else if (data.permissionType === 'screen') {
          setHasScreenAccess(data.allowed);
          if (!data.allowed) stopScreenShareRef.current?.();
          toast(data.allowed ? '🖥️ دبیر دسترسی اشتراک صفحه را برای همه فعال کرد!' : '🔒 دسترسی اشتراک صفحه برای همه بسته شد', { icon: data.allowed ? '🖥️' : '🔒', duration: 4000 });
        }
      }
    });

    socket.on('participant_mic_changed', (data) => {
      setParticipants((prev) =>
        prev.map((p) => (p.socketId === data.socketId ? { ...p, micOn: data.micOn } : p))
      );
    });

    // ── Screen Sharing Broadcast Events ──
    socket.on('screen_share_started', (data) => {
      setScreenSharingUser(data.user);
      toast(`🖥️ ${data.user?.name || 'یکی از اعضا'} صفحه نمایش خود را به اشتراک گذاشت`, {
        icon: '🖥️',
        duration: 4000,
      });
    });

    socket.on('screen_share_stopped', () => {
      setScreenSharingUser(null);
      setRemoteScreenFrame(null);
      toast('اشتراک صفحه نمایش به پایان رسید', { icon: '⏹️', duration: 2500 });
    });

    socket.on('screen_frame', (frameData) => {
      setRemoteScreenFrame(frameData);
    });

    // ── Low Latency Audio Chunk Listener ──
    socket.on('audio_chunk', (data) => {
      if (data.senderSocketId !== socket.id && data.chunk) {
        playAudioChunkRef.current?.(data.chunk);
      }
    });

    // Chat
    socket.on('new_chat_message', (msg) => {
      setChatMessages((prev) => [...prev, msg]);
      setTimeout(() => {
        if (chatScrollRef.current) {
          chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
        }
      }, 50);
    });

    // Attendance
    socket.on('participant_joined', (data) => {
      setParticipants((prev) => {
        const filtered = prev.filter((p) => p.socketId !== data.participant.socketId);
        return [...filtered, data.participant];
      });
      toast(`${data.participant.name} وارد کلاس شد`, { icon: '👋', duration: 2500 });
    });

    socket.on('participant_left', (data) => {
      setParticipants((prev) => prev.filter((p) => p.socketId !== data.socketId));
    });

    // Hand status with Teacher Quick Control
    socket.on('hand_status_changed', (data) => {
      setParticipants((prev) =>
        prev.map((p) => (p.socketId === data.socketId ? { ...p, handRaised: data.handRaised } : p))
      );

      const isMe = (user?.id && data.userId === user.id) || data.socketId === socket.id;
      if (isMe) {
        setHandRaised(data.handRaised);
      }

      if (data.handRaised && isTeacher) {
        toast(
          (t) => (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div style={{ fontWeight: 'bold', fontSize: '0.85rem' }}>
                ✋ <strong>{data.name}</strong> دستش را بالا برد و اجازه می‌خواهد:
              </div>
              <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                <button
                  onClick={() => {
                    handleToggleStudentPermissionRef.current?.({ socketId: data.socketId, userId: data.userId, canMic: false }, 'mic');
                    toast.dismiss(t.id);
                  }}
                  style={{
                    background: '#10b981',
                    color: '#fff',
                    border: 'none',
                    padding: '4px 8px',
                    borderRadius: 5,
                    cursor: 'pointer',
                    fontSize: '0.74rem',
                    fontWeight: 700,
                  }}
                >
                  🎤 اجازه میکروفون
                </button>
                <button
                  onClick={() => {
                    handleToggleStudentPermissionRef.current?.({ socketId: data.socketId, userId: data.userId, canDraw: false }, 'whiteboard');
                    toast.dismiss(t.id);
                  }}
                  style={{
                    background: '#3b82f6',
                    color: '#fff',
                    border: 'none',
                    padding: '4px 8px',
                    borderRadius: 5,
                    cursor: 'pointer',
                    fontSize: '0.74rem',
                    fontWeight: 700,
                  }}
                >
                  ✏️ اجازه تخته
                </button>
                <button
                  onClick={() => {
                    handleToggleStudentPermissionRef.current?.({ socketId: data.socketId, userId: data.userId, canScreenShare: false }, 'screen');
                    toast.dismiss(t.id);
                  }}
                  style={{
                    background: '#8b5cf6',
                    color: '#fff',
                    border: 'none',
                    padding: '4px 8px',
                    borderRadius: 5,
                    cursor: 'pointer',
                    fontSize: '0.74rem',
                    fontWeight: 700,
                  }}
                >
                  🖥️ اجازه اسکرین
                </button>
                <button
                  onClick={() => {
                    handleLowerHandRef.current?.({ socketId: data.socketId, userId: data.userId });
                    toast.dismiss(t.id);
                  }}
                  style={{
                    background: 'rgba(255,255,255,0.2)',
                    color: '#fff',
                    border: 'none',
                    padding: '4px 8px',
                    borderRadius: 5,
                    cursor: 'pointer',
                    fontSize: '0.74rem',
                  }}
                >
                  👌 پایین آوردن دست
                </button>
              </div>
            </div>
          ),
          {
            duration: 9000,
            style: { background: '#1e293b', color: '#fff', border: '1px solid #f59e0b', minWidth: '290px' },
          }
        );
      }
    });

    // Teacher Video Frame
    socket.on('live_video_frame', (frameData) => {
      setRemoteTeacherFrame(frameData);
    });

    return () => {
      socket.off('init_class_state');
      socket.off('class_live_started');
      socket.off('class_live_ended');
      socket.off('wb_draw');
      socket.off('wb_clear');
      socket.off('wb_sync_all');
      socket.off('wb_doc_change');
      socket.off('wb_change_bg');
      socket.off('wb_page_change');
      socket.off('whiteboard_access_changed');
      socket.off('all_whiteboard_access_changed');
      socket.off('all_student_permission_changed');
      socket.off('whiteboard_access_requested');
      socket.off('student_permission_changed');
      socket.off('participant_mic_changed');
      socket.off('screen_share_started');
      socket.off('screen_share_stopped');
      socket.off('screen_frame');
      socket.off('audio_chunk');
      socket.off('new_chat_message');
      socket.off('participant_joined');
      socket.off('participant_left');
      socket.off('hand_status_changed');
      socket.off('live_video_frame');
    };
  }, [classId, isTeacher, user]);

  // ── 5. Live Duration Timer ──
  useEffect(() => {
    if (isLive) {
      liveTimerRef.current = setInterval(() => {
        setLiveDuration((prev) => prev + 1);
      }, 1000);
    } else {
      clearInterval(liveTimerRef.current);
    }
    return () => clearInterval(liveTimerRef.current);
  }, [isLive]);

  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // ── 6. Pointer & Drawing Handlers (Teacher) ──
  const getCanvasCoords = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
    };
  };

  const currentFreehandStrokeRef = useRef(null);

  // ── Whiteboard Permission Handlers ──
  const handleRequestWhiteboardAccess = () => {
    if (canDraw) return;
    const socket = getSocket();
    socket.emit('request_whiteboard_access', { classId });
    setWbRequestSent(true);
    toast.success('درخواست اجازه نوشتن روی تخته برای دبیر ارسال شد ✋');
  };

  const handleGrantStudentWb = (targetParticipant) => {
    const socket = getSocket();
    socket.emit('grant_whiteboard_access', {
      classId,
      targetSocketId: targetParticipant.socketId,
      targetUserId: targetParticipant.userId,
    });
  };

  const handleRevokeStudentWb = (targetParticipant) => {
    const socket = getSocket();
    socket.emit('revoke_whiteboard_access', {
      classId,
      targetSocketId: targetParticipant.socketId,
      targetUserId: targetParticipant.userId,
    });
  };

  const handleToggleAllStudentsWb = (grant) => {
    const socket = getSocket();
    socket.emit('set_all_whiteboard_access', {
      classId,
      canDraw: grant,
    });
  };

  const startDrawing = (e) => {
    if (!canDraw) {
      toast.error('تخته هوشمند قفل است. تا زمانی که دبیر دسترسی ندهد امکان نوشتن وجود ندارد.', {
        icon: '🔒',
        id: 'wb-locked-alert',
      });
      return;
    }
    const coords = getCanvasCoords(e);
    startPosRef.current = coords;
    isDrawingRef.current = true;
    saveHistorySnapshot();

    const dCanvas = drawingCanvasRef.current;
    if (!dCanvas) return;
    const dCtx = dCanvas.getContext('2d');

    if (tool === 'pen' || tool === 'highlighter' || tool === 'eraser') {
      currentFreehandStrokeRef.current = {
        tool,
        color: currentColor,
        size: brushSize,
        points: [coords],
      };

      dCtx.beginPath();
      dCtx.moveTo(coords.x, coords.y);

      if (tool === 'eraser') {
        dCtx.globalCompositeOperation = 'destination-out';
        dCtx.lineWidth = brushSize * 4;
        dCtx.lineCap = 'round';
        dCtx.lineJoin = 'round';
        dCtx.lineTo(coords.x, coords.y);
        dCtx.stroke();
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
      } else {
        dCtx.globalCompositeOperation = 'source-over';
        dCtx.strokeStyle = currentColor;
        dCtx.lineWidth = brushSize;
        dCtx.lineCap = 'round';
        dCtx.lineJoin = 'round';
        dCtx.lineTo(coords.x, coords.y);
        dCtx.stroke();
      }

      renderCompositeCanvas();
    }
  };

  const drawMove = (e) => {
    if (!canDraw || !isDrawingRef.current) return;
    const coords = getCanvasCoords(e);
    const dCanvas = drawingCanvasRef.current;
    if (!dCanvas) return;
    const dCtx = dCanvas.getContext('2d');

    if (tool === 'pen' || tool === 'highlighter' || tool === 'eraser') {
      if (currentFreehandStrokeRef.current) {
        currentFreehandStrokeRef.current.points.push(coords);
      }

      if (tool === 'eraser') {
        dCtx.globalCompositeOperation = 'destination-out';
        dCtx.lineWidth = brushSize * 4;
        dCtx.lineCap = 'round';
        dCtx.lineJoin = 'round';
      } else if (tool === 'highlighter') {
        dCtx.globalCompositeOperation = 'source-over';
        dCtx.strokeStyle = currentColor;
        dCtx.globalAlpha = 0.35;
        dCtx.lineWidth = brushSize * 3.5;
        dCtx.lineCap = 'square';
        dCtx.lineJoin = 'miter';
      } else {
        dCtx.globalCompositeOperation = 'source-over';
        dCtx.strokeStyle = currentColor;
        dCtx.lineWidth = brushSize;
        dCtx.lineCap = 'round';
        dCtx.lineJoin = 'round';
      }

      dCtx.lineTo(coords.x, coords.y);
      dCtx.stroke();
      renderCompositeCanvas();
    } else {
      // Shape Dynamic Preview on Main Canvas
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
    if (!canDraw || !isDrawingRef.current) return;
    isDrawingRef.current = false;

    const dCanvas = drawingCanvasRef.current;
    if (!dCanvas) return;
    const dCtx = dCanvas.getContext('2d');
    const socket = getSocket();

    if (tool === 'pen' || tool === 'highlighter' || tool === 'eraser') {
      dCtx.closePath();
      const completedStroke = currentFreehandStrokeRef.current;
      currentFreehandStrokeRef.current = null;

      if (completedStroke && completedStroke.points.length >= 2) {
        socket.emit('wb_draw', { classId, stroke: completedStroke });
      }
      renderCompositeCanvas();
    } else if (['line', 'arrow', 'rect', 'circle'].includes(tool)) {
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

      const shapeStroke = {
        tool,
        color: currentColor,
        size: brushSize,
        start: { x: startX, y: startY },
        end: { x: curX, y: curY },
      };
      socket.emit('wb_draw', { classId, stroke: shapeStroke });
      renderCompositeCanvas();
    }
  };

  // Insert Persian/English Text on Board
  const handleInsertText = () => {
    if (!canDraw) {
      toast.error('شما اجازه درج متن روی تخته هوشمند را ندارید.');
      return;
    }
    const text = window.prompt('متن مورد نظر برای درج روی تخته هوشمند را وارد کنید:');
    if (!text || !text.trim()) return;

    saveHistorySnapshot();
    const dCanvas = drawingCanvasRef.current;
    if (!dCanvas) return;
    const dCtx = dCanvas.getContext('2d');

    const posX = dCanvas.width / 2;
    const posY = dCanvas.height / 2;

    dCtx.save();
    dCtx.font = `bold ${Math.max(22, brushSize * 4)}px Vazirmatn, Tahoma, sans-serif`;
    dCtx.fillStyle = currentColor;
    dCtx.textAlign = 'right';
    dCtx.direction = 'rtl';
    dCtx.fillText(text, posX, posY);
    dCtx.restore();

    renderCompositeCanvas();

    getSocket().emit('wb_draw', {
      classId,
      stroke: {
        tool: 'text',
        color: currentColor,
        size: brushSize,
        text,
        x: posX,
        y: posY,
      },
    });

    toast.success('متن روی تخته درج شد 🔤');
  };

  // Clear Whiteboard
  const handleClearWhiteboard = () => {
    if (!canDraw) {
      toast.error('شما اجازه پاک کردن تخته هوشمند را ندارید.');
      return;
    }
    if (window.confirm('آیا از پاک کردن کامل تخته هوشمند اطمینان دارید؟')) {
      saveHistorySnapshot();
      const dCanvas = drawingCanvasRef.current;
      if (dCanvas) {
        dCanvas.getContext('2d').clearRect(0, 0, dCanvas.width, dCanvas.height);
      }
      renderCompositeCanvas();
      getSocket().emit('wb_clear', { classId });
      toast.success('تخته پاک شد');
    }
  };

  const handleChangeBoardType = (type) => {
    if (!canDraw) {
      toast.error('شما اجازه تغییر تم تخته را ندارید.');
      return;
    }
    setBoardType(type);
    getSocket().emit('wb_change_bg', { classId, boardType: type });
  };

  // ── 7. Mozilla PDF.js & PowerPoint Presentation Engine ──
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
        if (lib) resolve(lib);
        else setTimeout(() => resolve(checkLib()), 200);
      });
      script.addEventListener('error', () => reject(new Error('خطا در بارگذاری PDF.js')));
    });
  };

  const renderPdfPage = async (doc, pageNum) => {
    try {
      setIsLoadingPdf(true);
      if (pageCacheRef.current.has(pageNum)) {
        pdfCanvasRef.current = pageCacheRef.current.get(pageNum);
        pdfImageRef.current = null;
        renderCompositeCanvas();
        setIsLoadingPdf(false);
        broadcastCurrentSlide(pageNum, doc.numPages);
        return;
      }

      const page = await doc.getPage(pageNum);
      const viewport = page.getViewport({ scale: 2.2 });
      const offscreen = document.createElement('canvas');
      offscreen.width = viewport.width;
      offscreen.height = viewport.height;
      const ctx = offscreen.getContext('2d', { alpha: false });
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
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
      broadcastCurrentSlide(pageNum, doc.numPages);
    } catch (err) {
      console.error('Error rendering PDF page:', err);
      setIsLoadingPdf(false);
      toast.error('خطا در رسم صفحه PDF');
    }
  };

  const handleDocumentFileSelect = async (e) => {
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
          broadcastCurrentSlide(1, pres.numPages);
        }
        toast.success(`ارائه پاورپوینت «${file.name}» بارگذاری شد (${pres.numPages} اسلاید) 📊`, { id: 'doc-load' });
      } catch (err) {
        console.error('PPTX load error:', err);
        toast.error(err.message || 'خطا در باز کردن فایل پاورپوینت', { id: 'doc-load' });
      }
    } else if (file.type === 'application/pdf' || lowerName.endsWith('.pdf')) {
      try {
        toast.loading('در حال باز کردن فایل PDF جزوه...', { id: 'doc-load' });
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
        toast.success(`جزوه PDF «${file.name}» بارگذاری شد (${doc.numPages} صفحه) 📄`, { id: 'doc-load' });
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
        broadcastCurrentSlide(1, 1);
        toast.success(`تصویر کاربرگ «${file.name}» روی تخته قرار گرفت 🖼️`);
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
    setIsVideoPlaying(false);

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
      broadcastCurrentSlide(1, 1);
      toast.success(`فیلم آموزشی «${file.name}» روی تخته قرار گرفت 🎬`);
    };

    video.ontimeupdate = () => {
      setVideoCurrentTime(video.currentTime);
      renderCompositeCanvas();
    };

    video.onended = () => {
      setIsVideoPlaying(false);
      renderCompositeCanvas();
      broadcastCurrentSlide(1, 1);
    };

    video.onerror = () => {
      toast.error('خطا در بارگذاری فایل ویدیویی');
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
          if (video && !video.paused && !video.ended) {
            renderCompositeCanvas();
            requestAnimationFrame(loop);
          } else {
            setIsVideoPlaying(false);
            renderCompositeCanvas();
            broadcastCurrentSlide(1, 1);
          }
        };
        requestAnimationFrame(loop);
      }).catch((e) => console.warn('Video play error:', e));
    } else {
      video.pause();
      setIsVideoPlaying(false);
      renderCompositeCanvas();
      broadcastCurrentSlide(1, 1);
    }
  };

  const handleSeekVideo = (e) => {
    const video = videoElementRef.current;
    if (!video) return;
    const time = parseFloat(e.target.value);
    video.currentTime = time;
    setVideoCurrentTime(time);
    renderCompositeCanvas();
    broadcastCurrentSlide(1, 1);
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

  const handleNextDocPage = async () => {
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
        broadcastCurrentSlide(next, pdfTotalPages);
      }
      setIsLoadingPdf(false);
    } else if (pdfDocument && pdfCurrentPage < pdfTotalPages) {
      const next = pdfCurrentPage + 1;
      setPdfCurrentPage(next);
      setPdfOffsetY(0);
      renderPdfPage(pdfDocument, next);
    }
  };

  const handlePrevDocPage = async () => {
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
        broadcastCurrentSlide(prev, pdfTotalPages);
      }
      setIsLoadingPdf(false);
    } else if (pdfDocument && pdfCurrentPage > 1) {
      const prev = pdfCurrentPage - 1;
      setPdfCurrentPage(prev);
      setPdfOffsetY(0);
      renderPdfPage(pdfDocument, prev);
    }
  };

  const handleCloseDocument = () => {
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
    setDocType(null);
    pdfCanvasRef.current = null;
    pdfImageRef.current = null;
    renderCompositeCanvas();

    getSocket().emit('wb_doc_change', { classId, docState: null });
    toast('محتوای سند از روی تخته برداشته شد');
  };

  // ── 8. Multi-Page Whiteboard Sheets ──
  const saveCurrentBoardPageData = () => {
    const dCanvas = drawingCanvasRef.current;
    if (!dCanvas) return;
    const currentIdx = boardCurrentPage - 1;
    const dataUrl = dCanvas.toDataURL();
    boardPagesRef.current[currentIdx] = {
      pageNum: currentIdx + 1,
      drawingDataUrl: dataUrl,
      boardType,
    };
  };

  const loadBoardPageData = (targetPageNum, broadcast = true) => {
    const dCanvas = drawingCanvasRef.current;
    if (!dCanvas) return;
    const dCtx = dCanvas.getContext('2d');
    dCtx.clearRect(0, 0, dCanvas.width, dCanvas.height);

    const pageData = boardPagesRef.current[targetPageNum - 1];
    if (pageData && pageData.drawingDataUrl) {
      const img = new Image();
      img.onload = () => {
        dCtx.drawImage(img, 0, 0);
        renderCompositeCanvas();
        if (broadcast && isTeacher) {
          getSocket().emit('wb_page_change', {
            classId,
            pageNum: targetPageNum,
            boardPages: boardPagesRef.current,
          });
        }
      };
      img.src = pageData.drawingDataUrl;
    } else {
      renderCompositeCanvas();
      if (broadcast && isTeacher) {
        getSocket().emit('wb_page_change', {
          classId,
          pageNum: targetPageNum,
          boardPages: boardPagesRef.current,
        });
      }
    }
  };

  const handleAddNewBoardPage = () => {
    if (!canDraw) {
      toast.error('تنها افراد دارای دسترسی مجاز به ایجاد برگه جدید هستند.');
      return;
    }
    saveCurrentBoardPageData();
    const newPageNum = boardTotalPages + 1;
    boardPagesRef.current.push({
      pageNum: newPageNum,
      drawingDataUrl: null,
      boardType,
    });
    setBoardTotalPages(newPageNum);
    setBoardCurrentPage(newPageNum);

    const dCanvas = drawingCanvasRef.current;
    if (dCanvas) {
      dCanvas.getContext('2d').clearRect(0, 0, dCanvas.width, dCanvas.height);
    }
    historyRef.current = [];
    redoRef.current = [];
    setCanUndo(false);
    setCanRedo(false);
    renderCompositeCanvas();

    getSocket().emit('wb_page_change', {
      classId,
      pageNum: newPageNum,
      boardPages: boardPagesRef.current,
    });
    toast.success(`برگه سفید جدید (شماره ${newPageNum}) باز شد ✨`);
  };

  const handleNextBoardPage = () => {
    if (boardCurrentPage < boardTotalPages) {
      saveCurrentBoardPageData();
      const next = boardCurrentPage + 1;
      setBoardCurrentPage(next);
      loadBoardPageData(next, true);
    }
  };

  const handlePrevBoardPage = () => {
    if (boardCurrentPage > 1) {
      saveCurrentBoardPageData();
      const prev = boardCurrentPage - 1;
      setBoardCurrentPage(prev);
      loadBoardPageData(prev, true);
    }
  };

  // ── 9. Live Session Recording Engine (MediaRecorder) ──
  const startRecordingSession = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    try {
      const stream = canvas.captureStream(30);

      // Audio track from microphone
      try {
        const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        micStreamRef.current = micStream;
        micStream.getAudioTracks().forEach((track) => stream.addTrack(track));
      } catch (micErr) {
        console.warn('Microphone not available:', micErr);
        toast('میکروفون فعال نشد، ضبط تصویر به تنهایی ادامه می‌یابد', { icon: '🎙️' });
      }

      let mimeType = 'video/webm;codecs=vp9,opus';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'video/webm;codecs=vp8,opus';
        if (!MediaRecorder.isTypeSupported(mimeType)) {
          mimeType = 'video/webm';
        }
      }

      recordedChunksRef.current = [];
      const mediaRecorder = new MediaRecorder(stream, { mimeType });

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          recordedChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
        const videoUrl = URL.createObjectURL(blob);
        setRecordedBlob(blob);
        setRecordedVideoUrl(videoUrl);
        setShowSaveModal(true);

        if (micStreamRef.current) {
          micStreamRef.current.getTracks().forEach((t) => t.stop());
          micStreamRef.current = null;
        }
      };

      mediaRecorder.start(1000);
      mediaRecorderRef.current = mediaRecorder;
      setRecStatus('recording');
      setRecSeconds(0);

      recTimerIntervalRef.current = setInterval(() => {
        setRecSeconds((prev) => prev + 1);
      }, 1000);

      toast.success('🔴 ضبط زنده کلاس و تخته آغاز شد!');
    } catch (err) {
      console.error('Recording start error:', err);
      toast.error('خطا در آغاز ضبط کلاس');
    }
  };

  const pauseRecordingSession = () => {
    if (mediaRecorderRef.current && recStatus === 'recording') {
      mediaRecorderRef.current.pause();
      setRecStatus('paused');
      if (recTimerIntervalRef.current) clearInterval(recTimerIntervalRef.current);
      toast('ضبط موقتاً متوقف شد ⏸️');
    }
  };

  const resumeRecordingSession = () => {
    if (mediaRecorderRef.current && recStatus === 'paused') {
      mediaRecorderRef.current.resume();
      setRecStatus('recording');
      recTimerIntervalRef.current = setInterval(() => {
        setRecSeconds((prev) => prev + 1);
      }, 1000);
      toast.success('ادامه ضبط جلسه ▶️');
    }
  };

  const stopRecordingSession = () => {
    if (mediaRecorderRef.current && (recStatus === 'recording' || recStatus === 'paused')) {
      mediaRecorderRef.current.stop();
      setRecStatus('idle');
      if (recTimerIntervalRef.current) {
        clearInterval(recTimerIntervalRef.current);
        recTimerIntervalRef.current = null;
      }
    }
  };

  // Download recorded video directly
  const handleDownloadVideo = () => {
    if (!recordedVideoUrl) return;
    const a = document.createElement('a');
    a.href = recordedVideoUrl;
    const cleanName = (saveTitle || 'کلاس_آنلاین').replace(/[/\\?%*:|"<>]/g, '-');
    a.download = `${cleanName}-${new Date().toLocaleDateString('fa-IR').replace(/\//g, '-')}.webm`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    toast.success('ویدیو با موفقیت دانلود شد 📥');
  };

  // Publish / Save to Class Videos Archive
  const handlePublishToArchive = async () => {
    if (!recordedBlob) return;
    setIsUploading(true);

    try {
      const formData = new FormData();
      const fileName = `${saveTitle || 'جلسه_آنلاین'}.webm`;
      formData.append('file', recordedBlob, fileName);
      formData.append('title', saveTitle || 'جلسه آنلاین کلاس');
      formData.append(
        'description',
        `جلسه ضبط شده با تخته هوشمند و تدریس تعاملی در تاریخ ${new Date().toLocaleDateString('fa-IR')}`
      );
      if (classId) {
        formData.append('class_id', classId);
      }
      formData.append('folder_name', classData?.name || 'کلاس‌های آنلاین');

      await api.post('/videos', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      toast.success('ویدیو با موفقیت در بخش ویدیوهای کلاس ذخیره شد ☁️🎥');
      setShowSaveModal(false);
    } catch (err) {
      console.error('Publish error:', err);
      toast.error('خطا در ذخیره ویدیو در آرشیو');
    } finally {
      setIsUploading(false);
    }
  };

  // ── 10. Export Board (PNG & Multi-page PDF) ──
  const handleDownloadBoardPng = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = `تخته_هوشمند_${classData?.name || 'کلاس'}_${new Date().toLocaleDateString('fa-IR').replace(/\//g, '-')}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
    toast.success('تصویر تخته هوشمند با کیفیت بالا دانلود شد 🖼️');
  };

  const handleExportPdfBooklet = async () => {
    const loadingToast = toast.loading('در حال ساخت فایل PDF جزوه تخته...');
    try {
      saveCurrentBoardPageData();
      const { jsPDF } = await import('jspdf');

      const mainCanvas = canvasRef.current;
      const width = mainCanvas?.width || 1920;
      const height = mainCanvas?.height || 1080;
      const orientation = width >= height ? 'landscape' : 'portrait';

      const doc = new jsPDF({
        orientation,
        unit: 'px',
        format: [width, height],
        hotfixes: ['px_scaling'],
      });

      const offscreen = document.createElement('canvas');
      offscreen.width = width;
      offscreen.height = height;
      const offCtx = offscreen.getContext('2d');

      const pages = boardPagesRef.current;
      for (let i = 0; i < pages.length; i++) {
        const p = pages[i];
        offCtx.clearRect(0, 0, width, height);

        // BG
        offCtx.fillStyle = p.boardType === 'blackboard' ? '#1e3a2f' : '#ffffff';
        offCtx.fillRect(0, 0, width, height);

        // Media if open
        const mediaSource = pdfCanvasRef.current || pdfImageRef.current;
        if (mediaSource) {
          offCtx.drawImage(mediaSource, 40, 40, width - 80, height - 80);
        }

        // Strokes
        if (p.drawingDataUrl) {
          await new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
              offCtx.drawImage(img, 0, 0);
              resolve();
            };
            img.onerror = () => resolve();
            img.src = p.drawingDataUrl;
          });
        }

        // Page number
        offCtx.font = 'bold 16px Vazirmatn, sans-serif';
        offCtx.fillStyle = '#64748b';
        offCtx.fillText(`برگه ${i + 1} از ${pages.length} • ${classData?.name || 'کلاس'}`, 40, height - 20);

        const imgData = offscreen.toDataURL('image/jpeg', 0.92);
        if (i > 0) doc.addPage([width, height], orientation);
        doc.addImage(imgData, 'JPEG', 0, 0, width, height, undefined, 'FAST');
      }

      doc.save(`جزوه_تخته_${classData?.name || 'کلاس'}.pdf`);
      toast.dismiss(loadingToast);
      toast.success('جزوه PDF با موفقیت دانلود شد 📄✨');
    } catch (e) {
      console.error('PDF error:', e);
      toast.dismiss(loadingToast);
      toast.error('خطا در دانلود فایل PDF');
    }
  };

  // Keyboard navigation for presentation slides & undo
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;

      // Ctrl+Z & Ctrl+Y
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        handleUndo();
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        e.preventDefault();
        handleRedo();
      }

      // Arrows for document slides
      if (pdfTotalPages > 1) {
        if (e.key === 'ArrowLeft' || e.key === 'PageDown') {
          e.preventDefault();
          handleNextDocPage();
        } else if (e.key === 'ArrowRight' || e.key === 'PageUp') {
          e.preventDefault();
          handlePrevDocPage();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [pdfTotalPages, pdfCurrentPage, isLoadingPdf]);

  // ── 11. Teacher Live Controls (Start / End) ──
  const handleToggleLive = () => {
    const socket = getSocket();
    if (!isLive) {
      socket.emit('start_live', {
        classId,
        title: classData?.name || 'کلاس آنلاین زنده',
        boardType,
      });
      setIsLive(true);
      toast.success('🔴 کلاس آنلاین آغاز شد و دانش‌آموزان در حال اتصال هستند!');
    } else {
      setShowCloseModal(true);
    }
  };

  const handleConfirmCloseClass = () => {
    setShowCloseModal(false);
    if (recStatus === 'recording' || recStatus === 'paused') {
      stopRecordingSession();
    }
    stopCamera();
    const socket = getSocket();
    socket.emit('end_live', { classId });
    setIsLive(false);
    toast.success('کلاس آنلاین با موفقیت بسته شد 🏁');
    router.push(`/dashboard/classes/${classId}`);
  };

  // ── 12. Camera & Webcam (Teacher) ──
  const toggleCamera = async () => {
    if (!cameraActive) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 640 }, height: { ideal: 360 } },
          audio: micActive,
        });
        mediaStreamRef.current = stream;
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }
        setCameraActive(true);
        toast.success('وبکم فعال شد 📷');

        const frameCanvas = document.createElement('canvas');
        frameCanvas.width = 320;
        frameCanvas.height = 180;
        const frameCtx = frameCanvas.getContext('2d');

        const broadcastInterval = setInterval(() => {
          if (!mediaStreamRef.current || !mediaStreamRef.current.active) {
            clearInterval(broadcastInterval);
            return;
          }
          if (localVideoRef.current && localVideoRef.current.readyState >= 2) {
            frameCtx.drawImage(localVideoRef.current, 0, 0, 320, 180);
            const frameData = frameCanvas.toDataURL('image/jpeg', 0.45);
            getSocket().emit('live_video_frame', { classId, frame: frameData });
          }
        }, 600);
      } catch (err) {
        console.error('Camera error:', err);
        toast.error('دسترسی به دوربین داده نشد یا مسدود است');
      }
    } else {
      stopCamera();
    }
  };

  const stopCamera = () => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }
    setCameraActive(false);
    getSocket().emit('live_video_frame', { classId, frame: null });
  };



  // ── 14. Chat Sending ──
  const handleSendMessage = (e) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    const socket = getSocket();
    socket.emit('send_chat_message', { classId, text: chatInput });
    setChatInput('');
  };

  return (
    <div className={styles.liveContainer}>
      <Toaster position="top-center" />

      {/* Hidden File Inputs */}
      <input
        type="file"
        ref={docFileInputRef}
        accept=".pdf,.pptx,.ppt,application/pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation"
        style={{ display: 'none' }}
        onChange={handleDocumentFileSelect}
      />
      <input
        type="file"
        ref={imageFileInputRef}
        accept="image/*"
        style={{ display: 'none' }}
        onChange={handleImageFileSelect}
      />
      <input
        type="file"
        ref={videoFileInputRef}
        accept="video/*,.mp4,.webm,.mkv"
        style={{ display: 'none' }}
        onChange={handleVideoFileSelect}
      />
      <input
        type="color"
        ref={colorInputRef}
        value={currentColor}
        onChange={(e) => setCurrentColor(e.target.value)}
        className={styles.colorInputHidden}
      />

      {/* ── TOP BAR ── */}
      <div className={styles.topBar}>
        <div className={styles.classInfo}>
          <button
            className={styles.headerBtn}
            onClick={() => {
              if (isLive) {
                setShowCloseModal(true);
              } else {
                router.push(`/dashboard/classes/${classId}`);
              }
            }}
            title="بازگشت به کلاس"
          >
            <HiOutlineArrowRightOnRectangle />
            <span>خروج</span>
          </button>

          <h2 className={styles.className}>{classData?.name || 'کلاس آنلاین زنده'}</h2>

          {isLive ? (
            <div className={styles.liveBadge}>
              <span className={styles.liveDot} />
              <span>پخش زنده • {formatDuration(liveDuration)}</span>
            </div>
          ) : (
            <div
              className={styles.intranetBadge}
              style={{ background: 'rgba(234, 179, 8, 0.1)', borderColor: 'rgba(234, 179, 8, 0.3)', color: '#facc15' }}
            >
              <span>آماده شروع</span>
            </div>
          )}

          {/* Recording Badge if Active */}
          {recStatus !== 'idle' && (
            <div className={styles.recLiveBadge}>
              <span className={styles.recDot} />
              <span>
                {recStatus === 'recording' ? 'REC' : 'موقتاً متوقف'} • {formatDuration(recSeconds)}
              </span>
            </div>
          )}

          <div className={styles.intranetBadge} title="متصل به شبکه ملی اطلاعات">
            <HiOutlineShieldCheck />
            <span>شبکه ملی پایدار</span>
          </div>
        </div>

        <div className={styles.headerActions}>
          {/* Recording Controls */}
          {recStatus === 'idle' ? (
            <button
              className={styles.headerBtn}
              onClick={startRecordingSession}
              title="شروع ضبط ویدیو و صدای کلاس"
              style={{ color: '#ef4444' }}
            >
              <span className={styles.recDot} />
              <span>ضبط کلاس 🔴</span>
            </button>
          ) : recStatus === 'recording' ? (
            <>
              <button className={styles.headerBtn} onClick={pauseRecordingSession} title="مکث ضبط">
                <HiOutlinePause />
                <span>مکث</span>
              </button>
              <button className={styles.headerBtn} onClick={stopRecordingSession} title="پایان ضبط" style={{ color: '#ef4444' }}>
                <HiOutlineStop />
                <span>پایان ضبط</span>
              </button>
            </>
          ) : (
            <>
              <button className={styles.headerBtn} onClick={resumeRecordingSession} title="ادامه ضبط">
                <HiOutlinePlay />
                <span>ادامه</span>
              </button>
              <button className={styles.headerBtn} onClick={stopRecordingSession} title="پایان ضبط" style={{ color: '#ef4444' }}>
                <HiOutlineStop />
                <span>پایان ضبط</span>
              </button>
            </>
          )}

          {/* Microphone Toggle (Teacher or Student) */}
          <button
            className={`${styles.headerBtn} ${isMicOn ? styles.micBtnActive : ''} ${!canUseMic ? styles.headerBtnDisabled : ''}`}
            onClick={() => {
              if (!canUseMic) {
                toast.error('دسترسی به میکروفون قفل است. برای اجازه صحبت روی دکمه «دست بالا ✋» کلیک کنید.');
                return;
              }
              toggleMic();
            }}
            title={
              isMicOn
                ? 'میکروفون روشن است (کلیک برای قطع صدا)'
                : canUseMic
                ? 'روشن کردن میکروفون'
                : 'میکروفون توسط معلم قفل است'
            }
          >
            <HiOutlineMicrophone style={{ color: isMicOn ? '#34d399' : 'inherit', fontSize: '1.1rem' }} />
            <span>{isMicOn ? 'میکروفون روشن 🎙️' : canUseMic ? 'میکروفون' : 'میکروفون 🔒'}</span>
          </button>

          {/* Screen Sharing Toggle */}
          <button
            className={`${styles.headerBtn} ${isScreenSharing ? styles.screenShareBtnActive : ''} ${!canUseScreen ? styles.headerBtnDisabled : ''}`}
            onClick={() => {
              if (!canUseScreen) {
                toast.error('دسترسی به اشتراک صفحه قفل است. از معلم درخواست اجازه کنید ✋');
                return;
              }
              toggleScreenShare();
            }}
            title={
              isScreenSharing
                ? 'توقف اشتراک صفحه نمایش'
                : canUseScreen
                ? 'اشتراک‌گذاری صفحه نمایش'
                : 'اشتراک صفحه توسط معلم قفل است'
            }
          >
            <HiOutlineTv style={{ color: isScreenSharing ? '#60a5fa' : 'inherit', fontSize: '1.1rem' }} />
            <span>{isScreenSharing ? 'توقف اشتراک ⏹️' : canUseScreen ? 'اشتراک صفحه 🖥️' : 'اشتراک صفحه 🔒'}</span>
          </button>

          {/* Webcam Toggle */}
          <button
            className={`${styles.headerBtn} ${cameraActive ? styles.headerBtnActive : ''}`}
            onClick={toggleCamera}
            title="روشن/خاموش کردن وبکم"
          >
            {cameraActive ? <HiOutlineVideoCamera /> : <HiOutlineVideoCameraSlash />}
            <span>{cameraActive ? 'دوربین روشن' : 'وبکم'}</span>
          </button>

          {/* Student Raise Hand Button in Top Bar */}
          {!isTeacher && (
            <button
              className={`${styles.headerBtn} ${handRaised ? styles.handRaisedBtnActive : styles.handRaiseBtn}`}
              onClick={handleToggleHandRaise}
              title={handRaised ? 'دست شما بالاست - کلیک برای پایین آوردن' : 'برای سوال یا اجازه صحبت دست خود را بالا ببرید'}
            >
              <FaHandPaper style={{ fontSize: '0.95rem' }} />
              <span>{handRaised ? 'دست شما بالاست ✋' : 'اجازه گرفتن ✋'}</span>
            </button>
          )}

          {/* Teacher Raised Hands Quick Counter in Top Bar */}
          {isTeacher && participants.filter((p) => p.role !== 'teacher' && p.role !== 'admin' && p.handRaised).length > 0 && (
            <button
              className={`${styles.headerBtn} ${styles.handRaisedBtnActive}`}
              onClick={() => setActiveTab('participants')}
              title="مشاهده دانش‌آموزانی که دست خود را بالا برده‌اند"
              style={{ background: '#f59e0b', color: '#1e293b', fontWeight: 800, animation: 'pulse 1.5s infinite' }}
            >
              <FaHandPaper />
              <span>
                {participants.filter((p) => p.role !== 'teacher' && p.role !== 'admin' && p.handRaised).length} نفر دست بالا ✋
              </span>
            </button>
          )}

          {/* Live class start/end: only teacher */}
          {isTeacher && (
            <button
              className={`${styles.headerBtn} ${isLive ? styles.endCallBtn : styles.headerBtnActive}`}
              onClick={handleToggleLive}
            >
              {isLive ? (
                <>
                  <HiOutlineStop />
                  <span>پایان کلاس ⏹️</span>
                </>
              ) : (
                <>
                  <span className={styles.liveDot} />
                  <span>شروع کلاس زنده 🔴</span>
                </>
              )}
            </button>
          )}

          {isTeacher ? (
            <button
              className={`${styles.headerBtn} ${styles.closeClassBtn}`}
              onClick={() => setShowCloseModal(true)}
              title="بستن و اتمام کامل جلسه کلاس آنلاین"
            >
              <HiOutlinePower />
              <span>بستن کلاس آنلاین</span>
            </button>
          ) : (
            <button
              className={`${styles.headerBtn} ${styles.leaveBtn}`}
              onClick={() => router.push(`/dashboard/classes/${classId}`)}
              title="خروج از جلسه کلاس آنلاین"
            >
              <HiOutlinePower />
              <span>خروج از کلاس</span>
            </button>
          )}

          {/* Export PNG & PDF for both teacher & students */}
          <button className={styles.headerBtn} onClick={handleDownloadBoardPng} title="ذخیره تصویر تخته به عنوان عکس PNG">
            <HiOutlineArrowDownTray />
            <span>تصویر تخته</span>
          </button>

          <button className={styles.headerBtn} onClick={handleExportPdfBooklet} title="دانلود کل برگه‌های تخته به صورت کتابچه PDF">
            <HiOutlineDocumentText />
            <span>جزوه PDF</span>
          </button>

          <button
            className={`${styles.headerBtn} ${activeTab === 'chat' ? styles.headerBtnActive : ''}`}
            onClick={() => setActiveTab(activeTab === 'chat' ? null : 'chat')}
            title="گفتگوی متنی کلاسی"
          >
            <HiOutlineChatBubbleLeftRight />
            <span>گفتگو ({chatMessages.length})</span>
          </button>

          <button
            className={`${styles.headerBtn} ${activeTab === 'participants' ? styles.headerBtnActive : ''}`}
            onClick={() => setActiveTab(activeTab === 'participants' ? null : 'participants')}
            title="لیست حاضرین آنلاین"
          >
            <HiOutlineUserGroup />
            <span>حاضرین ({participants.length})</span>
          </button>
        </div>
      </div>

      {/* ── MAIN STAGE ── */}
      <div className={styles.mainStage}>
        {/* Whiteboard Canvas Area */}
        <div className={styles.canvasArea}>
          <canvas
            ref={canvasRef}
            className={styles.whiteboardCanvas}
            onMouseDown={startDrawing}
            onMouseMove={drawMove}
            onMouseUp={stopDrawing}
            onMouseLeave={stopDrawing}
            onTouchStart={startDrawing}
            onTouchMove={drawMove}
            onTouchEnd={stopDrawing}
          />

          {/* Active Screen Sharing Overlay on Stage */}
          {screenSharingUser && (
            <div className={styles.screenShareOverlay}>
              <div className={styles.screenShareTopBar}>
                <div className={styles.screenShareInfo}>
                  <span className={styles.screenShareLiveDot} />
                  <span>
                    🖥️ در حال اشتراک‌گذاری صفحه نمایش: <strong>{screenSharingUser.name}</strong>
                  </span>
                  {isTeacher && screenSharingUser.userId !== user?.id && (
                    <span style={{ fontSize: '0.78rem', color: '#93c5fd' }}>(دانش‌آموز مجاز)</span>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {(isScreenSharing || isTeacher) && (
                    <button
                      className={styles.stopScreenShareBtn}
                      onClick={() => {
                        if (isScreenSharing) {
                          stopScreenShare();
                        } else if (isTeacher) {
                          getSocket().emit('set_student_permission', {
                            classId,
                            targetSocketId: screenSharingUser.socketId,
                            targetUserId: screenSharingUser.userId,
                            permissionType: 'screen',
                            allowed: false,
                          });
                          getSocket().emit('stop_screen_share', { classId });
                          toast('اشتراک صفحه دانش‌آموز توسط دبیر متوقف شد', { icon: '⏹️' });
                        }
                      }}
                      title="پایان دادن به اشتراک صفحه"
                    >
                      <HiOutlineStop />
                      <span>توقف اشتراک</span>
                    </button>
                  )}
                </div>
              </div>
              <div className={styles.screenShareCanvasWrap}>
                {isScreenSharing ? (
                  <div className={styles.screenShareLocalNotice}>
                    <HiOutlineTv style={{ fontSize: '3.5rem', color: '#3b82f6' }} />
                    <div>
                      <h3 style={{ margin: 0, color: '#fff', fontSize: '1.2rem' }}>صفحه نمایش شما در حال پخش است</h3>
                      <p style={{ margin: '8px 0 0', color: '#94a3b8', fontSize: '0.88rem' }}>
                        تمام اعضای کلاس تصویر زنده صفحه شما را مشاهده می‌کنند.
                      </p>
                    </div>
                  </div>
                ) : remoteScreenFrame ? (
                  <img
                    src={remoteScreenFrame}
                    alt="تصویر زنده صفحه نمایش"
                    className={styles.screenShareFrameImg}
                  />
                ) : (
                  <div className={styles.screenShareLocalNotice}>
                    <div className={styles.liveDot} style={{ width: 14, height: 14 }} />
                    <span>در حال بارگذاری فریم‌های زنده صفحه {screenSharingUser.name}...</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Floating Student Permission Notifications */}
          {!isTeacher && hasMicAccess && !isMicOn && (
            <div className={styles.studentFloatingPermissionNotice}>
              <span>🎙️ دبیر اجازه صحبت داد! برای صحبت کردن دکمه میکروفون بالا را بزنید</span>
            </div>
          )}
          {!isTeacher && hasScreenAccess && !isScreenSharing && !screenSharingUser && (
            <div className={styles.studentFloatingPermissionNotice} style={{ bottom: '130px', background: 'rgba(139, 92, 246, 0.95)' }}>
              <span>🖥️ دبیر اجازه اشتراک صفحه داد! برای شروع دکمه اشتراک صفحه بالا را بزنید</span>
            </div>
          )}

          {/* Prominent Floating Banner to Close Open File/Video and Return to Whiteboard */}
          {(docType || pdfFileName) && (
            <div className={styles.floatingMediaCloseHeader}>
              <div className={styles.floatingMediaInfo}>
                {docType === 'video' ? (
                  <HiOutlineFilm size={16} color="#a78bfa" />
                ) : (
                  <FaFilePdf size={16} color="#ef4444" />
                )}
                <span>
                  {docType === 'video' ? 'فیلم آموزشی' : 'فایل در حال نمایش'}: <strong>{pdfFileName || 'سند اشتراک‌گذاری شده'}</strong>
                </span>
              </div>
              <button
                className={styles.floatingMediaCloseAction}
                onClick={handleCloseDocument}
                title="بستن فایل و بازگشت به تخته سفید"
              >
                <HiOutlineXMark size={16} />
                <span>بستن و بازگشت به تخته</span>
              </button>
            </div>
          )}

          {/* Floating Document & Presentation Bar (if document is open) */}
          {(docType || pdfFileName) && (
            <div className={styles.docNavBar}>
              <div className={styles.docTitle}>
                {docType === 'video' ? (
                  <HiOutlineFilm color="#a78bfa" />
                ) : docType === 'pptx' ? (
                  <FaFilePowerpoint color="#ea580c" />
                ) : (
                  <FaFilePdf color="#dc2626" />
                )}
                <span>{pdfFileName}</span>
              </div>

              {/* Video Player Controls */}
              {docType === 'video' && (
                <div className={styles.videoNavGroup}>
                  {isTeacher && (
                    <button
                      className={styles.videoPlayBtn}
                      onClick={togglePlayVideo}
                      title={isVideoPlaying ? 'توقف موقت (Pause)' : 'پخش فیلم (Play)'}
                    >
                      {isVideoPlaying ? <HiOutlinePause /> : <HiOutlinePlay />}
                    </button>
                  )}
                  <span className={styles.videoTimeText}>
                    {formatVideoTime(videoCurrentTime)} / {formatVideoTime(videoDuration)}
                  </span>
                  {isTeacher && (
                    <>
                      <input
                        type="range"
                        min={0}
                        max={videoDuration || 100}
                        step={0.1}
                        value={videoCurrentTime}
                        onChange={handleSeekVideo}
                        className={styles.videoSeekBar}
                        title="نوار زمان پخش"
                      />
                      <button
                        className={styles.videoVolumeBtn}
                        onClick={toggleMuteVideo}
                        title={isVideoMuted ? 'روشن کردن صدا' : 'بی‌صدا کردن'}
                      >
                        {isVideoMuted ? <HiOutlineSpeakerXMark /> : <HiOutlineSpeakerWave />}
                      </button>
                    </>
                  )}
                </div>
              )}

              {pdfTotalPages > 1 && docType !== 'video' && (
                <div className={styles.docControls}>
                  <button
                    className={styles.docNavBtn}
                    onClick={handlePrevDocPage}
                    disabled={pdfCurrentPage <= 1 || !isTeacher}
                    title="اسلاید قبلی"
                  >
                    <HiOutlineChevronRight />
                  </button>

                  <span className={styles.docPageBadge}>
                    اسلاید {pdfCurrentPage} از {pdfTotalPages}
                  </span>

                  <button
                    className={styles.docNavBtn}
                    onClick={handleNextDocPage}
                    disabled={pdfCurrentPage >= pdfTotalPages || !isTeacher}
                    title="اسلاید بعدی"
                  >
                    <HiOutlineChevronLeft />
                  </button>
                </div>
              )}

              {/* Zoom Controls */}
              <div className={styles.docControls}>
                <button
                  className={styles.docNavBtn}
                  onClick={() => {
                    setPdfZoom((z) => Math.min(2.5, +(z + 0.15).toFixed(2)));
                    renderCompositeCanvas();
                  }}
                  title="بزرگ‌نمایی"
                >
                  <HiOutlineMagnifyingGlassPlus />
                </button>
                <button
                  className={styles.docNavBtn}
                  onClick={() => {
                    setPdfZoom((z) => Math.max(0.4, +(z - 0.15).toFixed(2)));
                    renderCompositeCanvas();
                  }}
                  title="کوچک‌نمایی"
                >
                  <HiOutlineMagnifyingGlassMinus />
                </button>
                <button
                  className={styles.docCloseBtnProminent}
                  onClick={handleCloseDocument}
                  title="بستن فایل و بازگشت به تخته"
                >
                  <HiOutlineXMark size={16} />
                  <span>بستن و بازگشت به تخته</span>
                </button>
              </div>
            </div>
          )}

          {/* Whiteboard Multi-Page Bar */}
          <div className={styles.boardPagesBar}>
            <span>برگه {boardCurrentPage} از {boardTotalPages}</span>
            <button
              className={styles.boardPageBtn}
              onClick={handlePrevBoardPage}
              disabled={boardCurrentPage <= 1}
              title="برگه قبلی"
            >
              <HiOutlineChevronRight />
            </button>
            <button
              className={styles.boardPageBtn}
              onClick={handleNextBoardPage}
              disabled={boardCurrentPage >= boardTotalPages}
              title="برگه بعدی"
            >
              <HiOutlineChevronLeft />
            </button>
            {canDraw && (
              <button
                className={styles.newBoardPageBtn}
                onClick={handleAddNewBoardPage}
                title="ایجاد برگه سفید جدید"
              >
                <HiOutlinePlus />
                <span>برگه جدید</span>
              </button>
            )}
          </div>

          {/* Floating Teacher Webcam Box */}
          <div className={styles.floatingWebcam}>
            {isTeacher ? (
              cameraActive ? (
                <video ref={localVideoRef} autoPlay playsInline muted className={styles.webcamVideo} />
              ) : (
                <div className={styles.webcamOffPlaceholder}>
                  <HiOutlineVideoCameraSlash style={{ fontSize: '2rem' }} />
                  <span>دوربین شما خاموش است</span>
                </div>
              )
            ) : remoteTeacherFrame ? (
              <img src={remoteTeacherFrame} alt="تصویر زنده استاد" className={styles.webcamVideo} />
            ) : (
              <div className={styles.webcamOffPlaceholder}>
                <HiOutlineVideoCamera style={{ fontSize: '2rem' }} />
                <span>تصویر زنده استاد</span>
              </div>
            )}
            <div className={styles.webcamBadge}>
              <span>{isTeacher ? 'تصویر شما (معلم)' : 'استاد کلاس'}</span>
            </div>
          </div>

          {/* Student Raise Hand Floating Button */}
          {!isTeacher && (
            <button
              className={`${styles.raiseHandBtn} ${handRaised ? styles.raiseHandBtnActive : ''}`}
              onClick={handleToggleHandRaise}
            >
              <FaHandPaper />
              <span>{handRaised ? 'دست شما بالاست ✋' : 'اجازه گرفتن / سوال دارم ✋'}</span>
            </button>
          )}

          {/* ── SMART WHITEBOARD TOOLBAR (OR LOCKED VIEWER BAR) ── */}
          {canDraw ? (
            <div className={styles.floatingToolbar}>
              {!isTeacher && (
                <div className={styles.studentAllowedBadge}>
                  <span>✏️ دسترسی مجاز</span>
                </div>
              )}

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
                  <LuEraser />
                </button>
              </div>

              <div className={styles.toolDivider} />

              {/* 2. Color Palette + Custom Picker */}
              <div className={styles.colorPickerWrap}>
                {PALETTE_COLORS.map((c) => (
                  <div
                    key={c.value}
                    className={`${styles.colorDot} ${currentColor === c.value ? styles.colorDotSelected : ''}`}
                    style={{ background: c.value }}
                    onClick={() => setCurrentColor(c.value)}
                    title={c.name}
                  />
                ))}
                <div
                  className={styles.colorCustomBtn}
                  onClick={() => colorInputRef.current?.click()}
                  title="انتخاب رنگ دلخواه..."
                >
                  🎨
                </div>
              </div>

              <div className={styles.toolDivider} />

              {/* 3. Dropdown Menu for All Other Features & Tools */}
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
                    {/* Section: Highlighter & Brush Sizes */}
                    <div className={styles.dropdownSection}>
                      <span className={styles.dropdownSectionTitle}>قلم و ضخامت</span>
                      <div className={styles.dropdownRow}>
                        <button
                          className={`${styles.menuItemBtn} ${tool === 'highlighter' ? styles.menuItemBtnActive : ''}`}
                          onClick={() => {
                            setTool('highlighter');
                            setShowToolsMenu(false);
                          }}
                          title="ماژیک هایلایتر فسفری"
                        >
                          <HiOutlinePaintBrush size={16} />
                          <span>هایلایتر</span>
                        </button>

                        {BRUSH_SIZES.map((b) => (
                          <button
                            key={b.size}
                            className={`${styles.menuItemBtn} ${brushSize === b.size ? styles.menuItemBtnActive : ''}`}
                            onClick={() => setBrushSize(b.size)}
                            title={`ضخامت قلم: ${b.label}`}
                            style={{ padding: '6px 8px' }}
                          >
                            <span
                              style={{
                                width: b.dotSize,
                                height: b.dotSize,
                                borderRadius: '50%',
                                display: 'inline-block',
                                background: currentColor,
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
                          title="خط‌کش / خط راست"
                        >
                          <FaSlash size={12} />
                          <span>خط</span>
                        </button>
                        <button
                          className={`${styles.menuItemBtn} ${tool === 'arrow' ? styles.menuItemBtnActive : ''}`}
                          onClick={() => {
                            setTool('arrow');
                            setShowToolsMenu(false);
                          }}
                          title="پیکان / فلش جهت‌دار"
                        >
                          <FaArrowRight size={12} />
                          <span>فلش</span>
                        </button>
                        <button
                          className={`${styles.menuItemBtn} ${tool === 'rect' ? styles.menuItemBtnActive : ''}`}
                          onClick={() => {
                            setTool('rect');
                            setShowToolsMenu(false);
                          }}
                          title="مستطیل / کادر"
                        >
                          <FaRegSquare size={12} />
                          <span>مستطیل</span>
                        </button>
                        <button
                          className={`${styles.menuItemBtn} ${tool === 'circle' ? styles.menuItemBtnActive : ''}`}
                          onClick={() => {
                            setTool('circle');
                            setShowToolsMenu(false);
                          }}
                          title="دایره / بیضی"
                        >
                          <FaRegCircle size={12} />
                          <span>دایره</span>
                        </button>
                        <button
                          className={styles.menuItemBtn}
                          onClick={() => {
                            handleInsertText();
                            setShowToolsMenu(false);
                          }}
                          title="درج متن فارسی روی تخته"
                        >
                          <FaFont size={12} />
                          <span>متن فارسی</span>
                        </button>
                      </div>
                    </div>

                    {/* Section: Document / Media Loaders (Only for teacher) */}
                    {isTeacher && (
                      <div className={styles.dropdownSection}>
                        <span className={styles.dropdownSectionTitle}>اشتراک فایل و رسانه</span>
                        <div className={styles.dropdownRow}>
                          <button
                            className={styles.menuItemBtn}
                            onClick={() => {
                              docFileInputRef.current?.click();
                              setShowToolsMenu(false);
                            }}
                            title="بارگذاری اسلاید پاورپوینت یا کتابچه PDF"
                            style={{ color: '#60a5fa' }}
                          >
                            <FaFilePdf size={14} />
                            <span>PDF / پاورپوینت</span>
                          </button>

                          <button
                            className={styles.menuItemBtn}
                            onClick={() => {
                              imageFileInputRef.current?.click();
                              setShowToolsMenu(false);
                            }}
                            title="بارگذاری کاربرگ و عکس"
                            style={{ color: '#34d399' }}
                          >
                            <HiOutlinePhoto size={15} />
                            <span>عکس / کاربرگ</span>
                          </button>

                          <button
                            className={styles.menuItemBtn}
                            onClick={() => {
                              videoFileInputRef.current?.click();
                              setShowToolsMenu(false);
                            }}
                            title="بارگذاری و پخش فیلم آموزشی"
                            style={{ color: '#a78bfa' }}
                          >
                            <HiOutlineFilm size={15} />
                            <span>فیلم آموزشی</span>
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Section: Board Theme & History */}
                    <div className={styles.dropdownSection}>
                      <span className={styles.dropdownSectionTitle}>پس‌زمینه و عملیات</span>
                      <div className={styles.dropdownRow}>
                        <button
                          className={`${styles.menuItemBtn} ${boardType === 'white' ? styles.menuItemBtnActive : ''}`}
                          onClick={() => handleChangeBoardType('white')}
                          title="تخته سفید"
                        >
                          <span>⬜ سفید</span>
                        </button>
                        <button
                          className={`${styles.menuItemBtn} ${boardType === 'grid' ? styles.menuItemBtnActive : ''}`}
                          onClick={() => handleChangeBoardType('grid')}
                          title="تخته شطرنجی ریاضی"
                        >
                          <span>🏁 شطرنجی</span>
                        </button>
                        <button
                          className={`${styles.menuItemBtn} ${boardType === 'blackboard' ? styles.menuItemBtnActive : ''}`}
                          onClick={() => handleChangeBoardType('blackboard')}
                          title="تخته سیاه گچی / سبز مدرسه‌ای"
                        >
                          <span>🟩 تخته سیاه</span>
                        </button>

                        <button
                          className={styles.menuItemBtn}
                          onClick={handleUndo}
                          disabled={!canUndo}
                          style={{ opacity: canUndo ? 1 : 0.4 }}
                          title="بازگردانی"
                        >
                          <HiOutlineArrowUturnLeft size={14} />
                          <span>Undo</span>
                        </button>

                        <button
                          className={styles.menuItemBtn}
                          onClick={handleRedo}
                          disabled={!canRedo}
                          style={{ opacity: canRedo ? 1 : 0.4 }}
                          title="انجام مجدد"
                        >
                          <HiOutlineArrowUturnRight size={14} />
                          <span>Redo</span>
                        </button>

                        <button
                          className={styles.menuItemBtn}
                          onClick={() => {
                            handleClearWhiteboard();
                            setShowToolsMenu(false);
                          }}
                          style={{ color: '#ef4444' }}
                          title="پاک کردن برگه جاری تخته"
                        >
                          <HiOutlineTrash size={14} />
                          <span>پاک کردن برگه</span>
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className={styles.lockedWhiteboardBar}>
              <div className={styles.lockedBarInfo}>
                <span className={styles.lockIcon}>🔒</span>
                <div>
                  <div className={styles.lockedBarTitle}>تخته هوشمند در حالت فقط مشاهده است</div>
                  <div className={styles.lockedBarSub}>تا زمانی که دبیر کلاس به شما دسترسی ندهد، امکان نوشتن روی تخته را ندارید.</div>
                </div>
              </div>
              <button
                className={`${styles.requestWbBtn} ${wbRequestSent ? styles.requestWbBtnSent : ''}`}
                onClick={handleRequestWhiteboardAccess}
                disabled={wbRequestSent}
              >
                <span>{wbRequestSent ? 'درخواست ارسال شد ⏳ منتظر تأیید دبیر...' : 'درخواست اجازه نوشتن روی تخته ✋'}</span>
              </button>
            </div>
          )}
        </div>

        {/* ── SIDE DRAWER (Chat & Participants) ── */}
        {activeTab && (
          <div className={styles.sideDrawer}>
            <div className={styles.drawerTabs}>
              <button
                className={`${styles.drawerTabBtn} ${activeTab === 'chat' ? styles.drawerTabBtnActive : ''}`}
                onClick={() => setActiveTab('chat')}
              >
                <HiOutlineChatBubbleLeftRight />
                <span>گفتگوی زنده</span>
              </button>

              <button
                className={`${styles.drawerTabBtn} ${activeTab === 'participants' ? styles.drawerTabBtnActive : ''}`}
                onClick={() => setActiveTab('participants')}
              >
                <HiOutlineUserGroup />
                <span>حاضرین ({participants.length})</span>
              </button>
            </div>

            {/* TAB: CHAT */}
            {activeTab === 'chat' && (
              <>
                <div className={styles.chatMessagesList} ref={chatScrollRef}>
                  {chatMessages.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '40px 10px', color: '#64748b', fontSize: '0.85rem' }}>
                      <p>هنوز پیامی ارسال نشده است.</p>
                      <p>می‌توانید سوالات و نکات درسی را اینجا بنویسید.</p>
                    </div>
                  ) : (
                    chatMessages.map((msg) => (
                      <div key={msg.id} className={styles.chatMsg}>
                        <div className={styles.chatMsgHeader}>
                          <span className={styles.chatSenderName}>
                            {msg.senderName}
                            {msg.senderRole === 'teacher' && <span className={styles.teacherTag}>معلم</span>}
                          </span>
                          <span className={styles.chatTime}>
                            {new Date(msg.createdAt).toLocaleTimeString('fa-IR', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </div>
                        <p className={styles.chatText}>{msg.text}</p>
                      </div>
                    ))
                  )}
                </div>

                <form className={styles.chatInputArea} onSubmit={handleSendMessage}>
                  <input
                    type="text"
                    className={styles.chatInput}
                    placeholder="پیام یا سوال خود را بنویسید..."
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                  />
                  <button type="submit" className={styles.sendBtn} title="ارسال">
                    <HiOutlinePaperAirplane style={{ transform: 'rotate(180deg)' }} />
                  </button>
                </form>
              </>
            )}

            {/* TAB: PARTICIPANTS */}
            {activeTab === 'participants' && (
              <div className={styles.participantsList}>
                {/* 1. Teacher Urgent Raised Hands Panel */}
                {isTeacher && participants.some((p) => p.role !== 'teacher' && p.role !== 'admin' && p.handRaised) && (
                  <div className={styles.raisedHandsUrgentCard}>
                    <div className={styles.raisedHandsUrgentHeader}>
                      <span>✋ درخواست‌های اجازه و سوال دانش‌آموزان</span>
                      <span className={styles.wbPermCount} style={{ background: 'rgba(245, 158, 11, 0.25)', color: '#fbbf24', borderColor: 'rgba(245, 158, 11, 0.4)' }}>
                        {participants.filter((p) => p.role !== 'teacher' && p.role !== 'admin' && p.handRaised).length} نفر منتظر
                      </span>
                    </div>

                    {participants
                      .filter((p) => p.role !== 'teacher' && p.role !== 'admin' && p.handRaised)
                      .map((p) => (
                        <div key={`raised_${p.socketId}`} className={styles.raisedHandItem}>
                          <div className={styles.raisedHandStudentInfo}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span style={{ fontSize: '1.1rem' }}>✋</span>
                              <span>{p.name}</span>
                            </div>
                            <button
                              type="button"
                              className={`${styles.urgentActionBtn} ${styles.urgentBtnLower}`}
                              onClick={() => handleLowerHand(p)}
                              title="پایین آوردن دست دانش‌آموز"
                            >
                              👌 بستن دست
                            </button>
                          </div>

                          <div className={styles.urgentActionBtns}>
                            <button
                              type="button"
                              className={`${styles.urgentActionBtn} ${styles.urgentBtnMic}`}
                              onClick={() => handleToggleStudentPermission(p, 'mic')}
                              title="اجازه روشن کردن میکروفون"
                            >
                              <HiOutlineMicrophone />
                              <span>{p.canMic ? 'قطع میکروفون' : 'اجازه میکروفون 🎙️'}</span>
                            </button>

                            <button
                              type="button"
                              className={`${styles.urgentActionBtn} ${styles.urgentBtnWb}`}
                              onClick={() => handleToggleStudentPermission(p, 'whiteboard')}
                              title="اجازه نوشتن روی تخته هوشمند"
                            >
                              <HiOutlinePencil />
                              <span>{p.canDraw ? 'لغو تخته' : 'اجازه تخته ✏️'}</span>
                            </button>

                            <button
                              type="button"
                              className={`${styles.urgentActionBtn} ${styles.urgentBtnScreen}`}
                              onClick={() => handleToggleStudentPermission(p, 'screen')}
                              title="اجازه اشتراک‌گذاری صفحه نمایش"
                            >
                              <HiOutlineTv />
                              <span>{p.canScreenShare ? 'لغو اشتراک' : 'اجازه اسکرین 🖥️'}</span>
                            </button>
                          </div>
                        </div>
                      ))}
                  </div>
                )}

                {/* 2. Teacher Bulk Class Permissions Controls */}
                {isTeacher && (
                  <div className={styles.teacherWbControlsCard}>
                    <div className={styles.teacherWbHeader}>
                      <span style={{ fontSize: '0.82rem', fontWeight: 800 }}>مدیریت همگانی دسترسی‌های کلاس</span>
                      <span className={styles.wbPermCount}>
                        {participants.length} شرکت‌کننده
                      </span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {/* Whiteboard bulk */}
                      <div>
                        <div style={{ fontSize: '0.74rem', color: '#94a3b8', marginBottom: '4px', fontWeight: 600 }}>تخته هوشمند:</div>
                        <div className={styles.teacherWbActions}>
                          <button
                            type="button"
                            className={styles.bulkWbBtn}
                            onClick={() => handleToggleAllStudentsPermission('whiteboard', true)}
                            title="باز کردن تخته هوشمند برای همه دانش‌آموزان"
                          >
                            🔓 باز برای همه
                          </button>
                          <button
                            type="button"
                            className={`${styles.bulkWbBtn} ${styles.bulkWbBtnRevoke}`}
                            onClick={() => handleToggleAllStudentsPermission('whiteboard', false)}
                            title="قفل کردن تخته هوشمند برای همه دانش‌آموزان"
                          >
                            🔒 قفل برای همه
                          </button>
                        </div>
                      </div>

                      {/* Microphone bulk */}
                      <div>
                        <div style={{ fontSize: '0.74rem', color: '#94a3b8', marginBottom: '4px', fontWeight: 600 }}>میکروفون دانش‌آموزان:</div>
                        <div className={styles.teacherWbActions}>
                          <button
                            type="button"
                            className={styles.bulkWbBtn}
                            onClick={() => handleToggleAllStudentsPermission('mic', true)}
                            title="اجازه میکروفون به همه دانش‌آموزان"
                          >
                            🎙️ اجازه به همه
                          </button>
                          <button
                            type="button"
                            className={`${styles.bulkWbBtn} ${styles.bulkWbBtnRevoke}`}
                            onClick={() => handleToggleAllStudentsPermission('mic', false)}
                            title="بستن میکروفون همه دانش‌آموزان"
                          >
                            🔇 بستن همه
                          </button>
                        </div>
                      </div>

                      {/* Screen share bulk */}
                      <div>
                        <div style={{ fontSize: '0.74rem', color: '#94a3b8', marginBottom: '4px', fontWeight: 600 }}>اشتراک صفحه نمایش:</div>
                        <div className={styles.teacherWbActions}>
                          <button
                            type="button"
                            className={styles.bulkWbBtn}
                            onClick={() => handleToggleAllStudentsPermission('screen', true)}
                            title="اجازه اشتراک صفحه به همه دانش‌آموزان"
                          >
                            🖥️ باز برای همه
                          </button>
                          <button
                            type="button"
                            className={`${styles.bulkWbBtn} ${styles.bulkWbBtnRevoke}`}
                            onClick={() => handleToggleAllStudentsPermission('screen', false)}
                            title="قفل کردن اشتراک صفحه همه دانش‌آموزان"
                          >
                            🔒 قفل برای همه
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* 3. Participant Cards List */}
                {participants.map((p) => {
                  const isPTeacher = p.role === 'teacher' || p.role === 'admin';
                  return (
                    <div
                      key={p.socketId}
                      className={`${styles.participantCard} ${p.handRaised ? styles.handRaisedCard : ''}`}
                    >
                      <div className={styles.participantInfo}>
                        <div className={styles.participantAvatar}>{p.name?.charAt(0) || 'ک'}</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div className={styles.participantName}>
                            {p.name}
                            {isPTeacher && ' (معلم)'}
                          </div>

                          <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginTop: '3px', flexWrap: 'wrap' }}>
                            {p.handRaised && (
                              <span className={styles.handRaiseBadge}>
                                <FaHandPaper /> دستش بالاست
                              </span>
                            )}
                            {p.micOn && (
                              <span className={styles.wbAllowedBadge} style={{ background: 'rgba(16, 185, 129, 0.25)', borderColor: '#10b981' }}>
                                🎙️ در حال صحبت
                              </span>
                            )}
                            {!isPTeacher && (
                              <div className={styles.permissionBadgesRow}>
                                <span className={p.canDraw ? styles.wbAllowedBadge : styles.wbLockedBadge}>
                                  ✏️ {p.canDraw ? 'تخته مجاز' : 'تخته قفل'}
                                </span>
                                <span className={p.canMic ? styles.wbAllowedBadge : styles.wbLockedBadge}>
                                  🎙️ {p.canMic ? 'میکرو مجاز' : 'میکرو قفل'}
                                </span>
                                <span className={p.canScreenShare ? styles.wbAllowedBadge : styles.wbLockedBadge}>
                                  🖥️ {p.canScreenShare ? 'اشتراک مجاز' : 'اشتراک قفل'}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Teacher actions per student */}
                      {isTeacher && !isPTeacher && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '8px' }}>
                          <div className={styles.permissionBadgesRow}>
                            <button
                              type="button"
                              className={`${styles.permPill} ${p.canDraw ? styles.permPillActive : styles.permPillLocked}`}
                              onClick={() => handleToggleStudentPermission(p, 'whiteboard')}
                              title="کلیک برای فعال/غیرفعال کردن دسترسی به تخته هوشمند"
                            >
                              ✏️ تخته {p.canDraw ? 'فعال ✅' : 'قفل 🔒'}
                            </button>

                            <button
                              type="button"
                              className={`${styles.permPill} ${p.canMic ? styles.permPillActive : styles.permPillLocked}`}
                              onClick={() => handleToggleStudentPermission(p, 'mic')}
                              title="کلیک برای فعال/غیرفعال کردن دسترسی به میکروفون"
                            >
                              🎙️ میکروفون {p.canMic ? 'فعال ✅' : 'قفل 🔒'}
                            </button>

                            <button
                              type="button"
                              className={`${styles.permPill} ${p.canScreenShare ? styles.permPillActive : styles.permPillLocked}`}
                              onClick={() => handleToggleStudentPermission(p, 'screen')}
                              title="کلیک برای فعال/غیرفعال کردن دسترسی به اشتراک صفحه"
                            >
                              🖥️ اشتراک {p.canScreenShare ? 'فعال ✅' : 'قفل 🔒'}
                            </button>

                            {p.handRaised && (
                              <button
                                type="button"
                                className={styles.lowerHandBtn}
                                onClick={() => handleLowerHand(p)}
                                title="پایین آوردن دست دانش‌آموز"
                              >
                                👌 پایین انداختن دست
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── RECORDING SAVE / PUBLISH MODAL ── */}
      {showSaveModal && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalContent}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>
                <span>ذخیره و دانلود جلسه ضبط شده کلاس</span>
                <span>🎥</span>
              </h3>
              <button
                className={styles.modalCloseBtn}
                onClick={() => setShowSaveModal(false)}
                title="بستن"
              >
                <HiOutlineXMark />
              </button>
            </div>

            {recordedVideoUrl && (
              <div className={styles.videoPreviewBox}>
                <video src={recordedVideoUrl} controls className={styles.videoPreview} />
              </div>
            )}

            <div className={styles.modalFormGroup}>
              <label className={styles.modalLabel}>عنوان جلسه تدریس:</label>
              <input
                type="text"
                className={styles.modalInput}
                value={saveTitle}
                onChange={(e) => setSaveTitle(e.target.value)}
                placeholder="مثلاً: تدریس مبحث مشتق ریاضی دوازدهم"
              />
            </div>

            <div className={styles.modalActions}>
              <button className={styles.secondaryBtn} onClick={handleDownloadVideo}>
                <HiOutlineArrowDownTray />
                <span>دانلود مستقیم ویدیوی کلاس</span>
              </button>

              <button
                className={styles.primaryBtn}
                onClick={handlePublishToArchive}
                disabled={isUploading}
              >
                <HiOutlineCloudArrowUp />
                <span>{isUploading ? 'در حال ذخیره‌سازی...' : 'ذخیره در آرشیو ویدیوهای کلاس'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── CLOSE ONLINE CLASS CONFIRMATION MODAL ── */}
      {showCloseModal && (
        <div className={styles.modalOverlay} onClick={() => setShowCloseModal(false)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()} style={{ maxWidth: '480px' }}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle} style={{ color: '#f87171' }}>
                <HiOutlinePower />
                <span>بستن کلاس آنلاین</span>
              </h3>
              <button
                className={styles.modalCloseBtn}
                onClick={() => setShowCloseModal(false)}
                title="انصراف"
              >
                <HiOutlineXMark />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', color: '#e2e8f0', fontSize: '0.92rem', lineHeight: '1.7' }}>
              <p style={{ margin: 0, fontWeight: 600 }}>
                آیا از بستن و پایان دادن کامل به این جلسه کلاس آنلاین اطمینان دارید؟
              </p>
              <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.25)', borderRadius: '12px', padding: '12px 14px', fontSize: '0.85rem', color: '#fca5a5' }}>
                ⚠️ با بستن کلاس، جلسه برای تمام حاضرین و دانش‌آموزان به اتمام می‌رسد و ارتباط وبکم و تصویر قطع خواهد شد. در صورت فعال بودن ضبط کلاس، فایل متوقف و ذخیره می‌گردد.
              </div>
            </div>

            <div className={styles.modalActions} style={{ marginTop: '12px' }}>
              <button
                className={styles.secondaryBtn}
                onClick={() => setShowCloseModal(false)}
              >
                انصراف و ادامه کلاس
              </button>

              <button
                className={styles.closeModalConfirmBtn}
                onClick={handleConfirmCloseClass}
              >
                <HiOutlinePower />
                <span>بله، بستن کلاس آنلاین</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
