'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import useAuthStore from '../../../../../stores/authStore';
import { getSocket } from '../../../../../lib/socket';
import api, { getApiBaseUrl } from '../../../../../lib/api';
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
  const { user } = useAuthStore();
  const queryClassId =
    typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('classId') : null;
  const classId = queryClassId || params?.id;
  const isTeacher = user?.role === 'teacher' || user?.role === 'admin' || user?.role === 'manager';
  const [hasWhiteboardAccess, setHasWhiteboardAccess] = useState(false);
  const [hasMicAccess, setHasMicAccess] = useState(false);
  const [hasScreenAccess, setHasScreenAccess] = useState(false);
  const [hasCameraAccess, setHasCameraAccess] = useState(false);
  const [wbRequestSent, setWbRequestSent] = useState(false);
  const [pendingRequests, setPendingRequests] = useState([]);

  const canDraw = isTeacher || hasWhiteboardAccess;
  const canUseMic = isTeacher || hasMicAccess;
  const canUseScreen = isTeacher || hasScreenAccess;
  const canUseCamera = isTeacher || hasCameraAccess;

  const activeBoardFileRef = useRef(null);
  const videoBroadcastIntervalRef = useRef(null);
  const [remoteVideoData, setRemoteVideoData] = useState(null);
  const stopCameraRef = useRef(null);

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
  const toolsMenuRef = useRef(null);

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
    const dpr = Math.min(typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1, 3);
    const cssWidth = Math.round(mainCanvas.width / dpr);
    const cssHeight = Math.round(mainCanvas.height / dpr);

    ctx.save();
    // Scale coordinate matrix by dpr so all operations below use standard CSS pixels
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // A. Draw Board Background
    if (boardType === 'blackboard') {
      ctx.fillStyle = '#1e3a2f';
      ctx.fillRect(0, 0, cssWidth, cssHeight);

      const grad = ctx.createRadialGradient(cssWidth / 2, cssHeight / 2, 50, cssWidth / 2, cssHeight / 2, Math.max(cssWidth, cssHeight) / 1.2);
      grad.addColorStop(0, 'rgba(255, 255, 255, 0.03)');
      grad.addColorStop(1, 'rgba(0, 0, 0, 0.25)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, cssWidth, cssHeight);
    } else if (boardType === 'grid') {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, cssWidth, cssHeight);

      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 1;
      const gridSize = 28;
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
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, cssWidth, cssHeight);
    }

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    // B. Draw PDF Slide, PPTX Slide, Worksheet Image, Video Frame, or Remote Broadcast Image
    const mediaSource = pdfCanvasRef.current || pdfImageRef.current || videoElementRef.current || remoteDocImageRef.current;
    if (mediaSource) {
      const srcW = mediaSource.videoWidth || mediaSource.naturalWidth || mediaSource.width;
      const srcH = mediaSource.videoHeight || mediaSource.naturalHeight || mediaSource.height;

      if (srcW && srcH) {
        const isMobile = cssWidth < 768;
        let drawW, drawH;
        if (pdfFitMode === 'fit-width') {
          const targetW = (isMobile ? (cssWidth - 16) : Math.min(cssWidth - 60, Math.max(860, cssWidth * 0.75))) * pdfZoom;
          const scale = targetW / srcW;
          drawW = targetW;
          drawH = srcH * scale;
        } else {
          const targetH = (cssHeight - (isMobile ? 90 : 140)) * pdfZoom;
          const scale = targetH / srcH;
          drawW = srcW * scale;
          drawH = targetH;
        }

        const drawX = (cssWidth - drawW) / 2;
        const baseY = pdfFitMode === 'fit-width' ? (isMobile ? 55 : 70) : (cssHeight - drawH) / 2;
        const drawY = baseY + pdfOffsetY;

        ctx.save();
        ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
        ctx.shadowBlur = isMobile ? 12 : 24;
        ctx.shadowOffsetY = isMobile ? 3 : 6;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(drawX, drawY, drawW, drawH);
        ctx.restore();

        ctx.drawImage(mediaSource, drawX, drawY, drawW, drawH);
      }
    }

    // C. Draw User & Real-time Strokes from Offscreen Canvas
    ctx.drawImage(drawingCanvas, 0, 0, cssWidth, cssHeight);
    ctx.restore();
  }, [boardType, pdfZoom, pdfFitMode, pdfOffsetY]);

  // Adjust canvas resolution to parent container with Retina / High-DPI support
  const initCanvases = useCallback(() => {
    const mainCanvas = canvasRef.current;
    if (!mainCanvas) return;

    const parent = mainCanvas.parentElement;
    const cssWidth = parent?.clientWidth || window.innerWidth;
    const cssHeight = parent?.clientHeight || window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);

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
    initCanvases();
    window.addEventListener('resize', initCanvases);
    return () => window.removeEventListener('resize', initCanvases);
  }, [initCanvases]);

  // Close tools dropdown menu when clicking outside
  useEffect(() => {
    if (!showToolsMenu) return;
    const handleOutsideClick = (e) => {
      if (toolsMenuRef.current && !toolsMenuRef.current.contains(e.target)) {
        setShowToolsMenu(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('touchstart', handleOutsideClick);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('touchstart', handleOutsideClick);
    };
  }, [showToolsMenu]);

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
    } else if (stroke.tool === 'triangle') {
      ctx.beginPath();
      ctx.moveTo((stroke.start.x + stroke.end.x) / 2, stroke.start.y);
      ctx.lineTo(stroke.start.x, stroke.end.y);
      ctx.lineTo(stroke.end.x, stroke.end.y);
      ctx.closePath();
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
      activeBoardFileRef.current = null;
      setDocType(null);
      setPdfFileName('');
      setPdfCurrentPage(1);
      setPdfTotalPages(0);
      renderCompositeCanvas();
      return;
    }

    const baseTitle = (remoteDoc.fileName || 'سند_کلاس').replace(/\.[^/.]+$/, '');
    activeBoardFileRef.current = {
      dataUrl: remoteDoc.pageDataUrl,
      name: `${baseTitle}_صفحه_${remoteDoc.currentPage || 1}.jpg`,
      mimeType: 'image/jpeg',
    };

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

  const playRequestChime = useCallback(() => {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(660, now);
      osc.frequency.setValueAtTime(880, now + 0.12);
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.36);
      setTimeout(() => {
        try { ctx.close(); } catch (_) {}
      }, 450);
    } catch (_) {}
  }, []);

  const handleRequestPermission = useCallback((permissionType) => {
    if (isTeacher) return;
    const socket = getSocket();
    socket.emit('request_permission', {
      classId: String(classId),
      permissionType,
    });
    setHandRaised(true);
    if (permissionType === 'whiteboard') setWbRequestSent(true);

    const msgMap = {
      mic: 'درخواست اجازه میکروفون برای معلم ارسال شد 🎙️✋',
      camera: 'درخواست اجازه دوربین برای معلم ارسال شد 📷✋',
      screen: 'درخواست اجازه اشتراک صفحه برای معلم ارسال شد 🖥️✋',
      whiteboard: 'درخواست اجازه نوشتن روی تخته برای معلم ارسال شد ✏️✋',
    };
    toast.success(msgMap[permissionType] || 'درخواست اجازه برای معلم ارسال شد ✋', {
      duration: 4000,
      style: { background: '#f59e0b', color: '#1e293b', fontWeight: 'bold' },
    });
  }, [classId, isTeacher]);

  const startMic = useCallback(async () => {
    if (!canUseMic) {
      handleRequestPermission('mic');
      return;
    }

    if (!navigator?.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
      toast.error('مرورگر یا دستگاه از ضبط میکروفون پشتیبانی نمی‌کند.');
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
      if (typeof MediaRecorder !== 'undefined' && !MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'audio/webm';
      }

      const recorderOptions = typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(mimeType)
        ? { mimeType }
        : undefined;
      const recorder = new MediaRecorder(stream, recorderOptions);
      audioRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          const reader = new FileReader();
          reader.onloadend = () => {
            const res = reader.result;
            if (typeof res === 'string') {
              const base64Data = res.split(',')[1];
              if (base64Data) {
                getSocket().emit('audio_chunk', { classId: String(classId), chunk: base64Data });
              }
            }
          };
          reader.readAsDataURL(e.data);
        }
      };

      recorder.start(400); // 400ms slices for smooth real-time speech
      setIsMicOn(true);
      getSocket().emit('toggle_mic', { classId: String(classId), micOn: true });
      toast.success('میکروفون روشن شد 🎙️ صدای شما برای اعضای کلاس پخش می‌شود');
    } catch (err) {
      console.error('Mic start error:', err);
      toast.error('دسترسی به میکروفون داده نشد! لطفاً مجوز میکروفون را در تنظیمات گوشی یا مرورگر فعال کنید.');
    }
  }, [canUseMic, classId, handleRequestPermission]);

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
    getSocket().emit('stop_screen_share', { classId: String(classId) });
  }, [classId]);

  const startScreenShare = useCallback(async () => {
    if (!canUseScreen) {
      handleRequestPermission('screen');
      return;
    }

    if (!navigator?.mediaDevices || typeof navigator.mediaDevices.getDisplayMedia !== 'function') {
      toast.error('اشتراک‌گذاری مستقیم صفحه در وب‌ویو موبایل پشتیبانی نمی‌شود؛ می‌توانید فایل PDF، تصویر یا ویدیو را روی تخته باز کنید.');
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

      getSocket().emit('start_screen_share', { classId: String(classId) });
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
          getSocket().emit('screen_frame', { classId: String(classId), frame: frameData });
        }
      }, 350);

      toast.success('🖥️ اشتراک‌گذاری صفحه نمایش آغاز شد!');
    } catch (err) {
      console.error('Screen sharing error:', err);
      if (err.name !== 'NotAllowedError') {
        toast.error('خطا در آغاز اشتراک صفحه نمایش');
      }
    }
  }, [canUseScreen, classId, handleRequestPermission, stopScreenShare, user]);

  const toggleScreenShare = useCallback(() => {
    if (isScreenSharing) {
      stopScreenShare();
      toast('اشتراک صفحه پایان یافت ⏹️', { icon: '⏹️', duration: 2500 });
    } else {
      startScreenShare();
    }
  }, [isScreenSharing, stopScreenShare, startScreenShare]);

  const handleToggleStudentPermission = useCallback((targetParticipant, permissionType, forceAllowed) => {
    if (!isTeacher) return;
    const socket = getSocket();
    let currentVal = false;
    if (permissionType === 'whiteboard') currentVal = !!targetParticipant.canDraw;
    if (permissionType === 'mic') currentVal = !!targetParticipant.canMic;
    if (permissionType === 'screen') currentVal = !!targetParticipant.canScreenShare;
    if (permissionType === 'camera') currentVal = !!targetParticipant.canCamera;

    const nextVal = typeof forceAllowed === 'boolean' ? forceAllowed : !currentVal;
    socket.emit('set_student_permission', {
      classId: String(classId),
      targetSocketId: targetParticipant.socketId,
      targetUserId: targetParticipant.userId,
      permissionType,
      allowed: nextVal,
    });

    setParticipants((prev) =>
      prev.map((p) => {
        if (p.socketId === targetParticipant.socketId || (targetParticipant.userId && p.userId === targetParticipant.userId)) {
          const updated = { ...p };
          if (permissionType === 'whiteboard') updated.canDraw = nextVal;
          if (permissionType === 'mic') updated.canMic = nextVal;
          if (permissionType === 'screen') updated.canScreenShare = nextVal;
          if (permissionType === 'camera') updated.canCamera = nextVal;
          if (nextVal) updated.handRaised = false;
          return updated;
        }
        return p;
      })
    );

    if (nextVal) {
      setPendingRequests((prev) =>
        prev.filter(
          (req) =>
            !(
              (req.socketId === targetParticipant.socketId ||
                (targetParticipant.userId && req.userId === targetParticipant.userId)) &&
              (req.permissionType === permissionType || req.permissionType === 'general')
            )
        )
      );
    }

    const permLabel =
      permissionType === 'whiteboard'
        ? 'تخته هوشمند'
        : permissionType === 'mic'
        ? 'میکروفون'
        : permissionType === 'camera'
        ? 'دوربین'
        : 'اشتراک صفحه';

    toast(
      nextVal
        ? `دسترسی «${permLabel}» برای «${targetParticipant.name || 'دانش‌آموز'}» فعال شد ✅`
        : `دسترسی «${permLabel}» برای «${targetParticipant.name || 'دانش‌آموز'}» غیرفعال شد 🔒`,
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
      classId: String(classId),
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
          if (permissionType === 'camera') updated.canCamera = allowed;
          return updated;
        }
        return p;
      })
    );

    if (allowed) {
      setPendingRequests((prev) =>
        prev.filter((req) => req.permissionType !== permissionType && req.permissionType !== 'general')
      );
    }

    const permLabel =
      permissionType === 'whiteboard'
        ? 'تخته هوشمند'
        : permissionType === 'mic'
        ? 'میکروفون'
        : permissionType === 'camera'
        ? 'دوربین'
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
      classId: String(classId),
      targetSocketId: target.socketId,
      targetUserId: target.userId,
    });
    setParticipants((prev) =>
      prev.map((p) =>
        p.socketId === target.socketId || (target.userId && p.userId === target.userId)
          ? { ...p, handRaised: false }
          : p
      )
    );
    setPendingRequests((prev) =>
      prev.filter(
        (req) => req.socketId !== target.socketId && !(target.userId && req.userId === target.userId)
      )
    );
    toast('درخواست دانش‌آموز بسته شد 👌', { icon: '👌', duration: 2500 });
  }, [classId]);

  const handleToggleHandRaise = useCallback(() => {
    const socket = getSocket();
    const nextState = !handRaised;
    socket.emit('toggle_hand_raise', { classId: String(classId) });
    setHandRaised(nextState);

    if (nextState) {
      toast.success('دست شما بالا رفت! اعلان فوری برای معلم ارسال شد ✋', {
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
    stopCameraRef.current = stopCamera;
    playAudioChunkRef.current = playAudioChunk;
    handleToggleStudentPermissionRef.current = handleToggleStudentPermission;
    handleLowerHandRef.current = handleLowerHand;
  });

  // Fetch class details for title & subject
  useEffect(() => {
    if (!classId) return;
    const fetchClassDetails = async () => {
      try {
        const res = await api.get(`/classes/${classId}`);
        if (res.data?.data?.class) {
          setClassData(res.data.data.class);
          return;
        }
      } catch (e) {
        console.warn('Could not fetch class details from API:', e);
      }

      try {
        const cached = JSON.parse(localStorage.getItem('educonnect_classes_cache') || '[]');
        const found = cached.find((c) => String(c.id) === String(classId));
        if (found) {
          setClassData(found);
        }
      } catch (err) {}
    };
    fetchClassDetails();
  }, [classId]);

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

    const emitJoinClass = () => {
      socket.emit('join_class', { classId: String(classId), user: currentUserData });
    };

    emitJoinClass();
    socket.on('connect', emitJoinClass);

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
      if (data.canCamera !== undefined) {
        setHasCameraAccess(!!data.canCamera);
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
        playRequestChime();
        const reqId = `${data.userId || data.socketId}_whiteboard`;
        setPendingRequests((prev) => {
          const filtered = prev.filter((item) => item.id !== reqId);
          return [
            {
              id: reqId,
              socketId: data.socketId,
              userId: data.userId,
              name: data.name || 'دانش‌آموز',
              permissionType: 'whiteboard',
              timestamp: Date.now(),
            },
            ...filtered,
          ];
        });
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

    // ── Multi-Permission Changed Listener (Mic, Camera, Screen, Whiteboard) ──
    socket.on('student_permission_changed', (data) => {
      setParticipants((prev) =>
        prev.map((p) => {
          if (p.socketId === data.socketId || (data.userId && p.userId === data.userId)) {
            const updated = { ...p };
            if (data.permissionType === 'whiteboard') updated.canDraw = data.allowed;
            if (data.permissionType === 'mic') updated.canMic = data.allowed;
            if (data.permissionType === 'screen') updated.canScreenShare = data.allowed;
            if (data.permissionType === 'camera') updated.canCamera = data.allowed;
            if (data.allowed) updated.handRaised = false;
            return updated;
          }
          return p;
        })
      );

      if (data.allowed) {
        setPendingRequests((prev) =>
          prev.filter(
            (req) =>
              !(
                (req.socketId === data.socketId || (data.userId && req.userId === data.userId)) &&
                (req.permissionType === data.permissionType || req.permissionType === 'general')
              )
          )
        );
      }

      const isMe = (user?.id && data.userId === user.id) || data.socketId === socket.id;
      if (isMe) {
        if (data.allowed) {
          setHandRaised(false);
        }
        if (data.permissionType === 'whiteboard') {
          setHasWhiteboardAccess(data.allowed);
          if (data.allowed) setWbRequestSent(false);
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
        } else if (data.permissionType === 'camera') {
          setHasCameraAccess(data.allowed);
          toast(data.allowed ? '📷 دبیر اجازه روشن کردن دوربین را به شما داد!' : '🔒 دسترسی دوربین توسط دبیر برداشته شد.', {
            icon: data.allowed ? '📷' : '🔒',
            duration: 4500,
          });
          if (!data.allowed) {
            stopCameraRef.current?.();
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
            if (data.permissionType === 'camera') updated.canCamera = data.allowed;
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
        } else if (data.permissionType === 'camera') {
          setHasCameraAccess(data.allowed);
          if (!data.allowed) stopCameraRef.current?.();
          toast(data.allowed ? '📷 دبیر اجازه دوربین را برای همه فعال کرد!' : '🔒 دوربین همه قفل شد', { icon: data.allowed ? '📷' : '🔒', duration: 4000 });
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

    socket.on('participant_camera_changed', (data) => {
      setParticipants((prev) =>
        prev.map((p) => (p.socketId === data.socketId ? { ...p, cameraOn: data.cameraOn } : p))
      );
      if (!data.cameraOn) {
        setRemoteVideoData((prev) => (prev && prev.senderSocketId === data.socketId ? null : prev));
      }
    });

    // Dedicated permission request notification for teacher (Mic, Camera, Screen, Whiteboard)
    socket.on('student_permission_requested', (data) => {
      if (!isTeacher) return;
      playRequestChime();
      const pType = data.permissionType || 'general';
      const reqId = `${data.userId || data.socketId}_${pType}`;
      setPendingRequests((prev) => {
        const filtered = prev.filter((item) => item.id !== reqId);
        return [
          {
            id: reqId,
            socketId: data.socketId,
            userId: data.userId,
            name: data.name || 'دانش‌آموز',
            permissionType: pType,
            timestamp: data.timestamp || Date.now(),
          },
          ...filtered,
        ];
      });
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

      if (!data.handRaised) {
        setPendingRequests((prev) =>
          prev.filter((req) => req.socketId !== data.socketId && !(data.userId && req.userId === data.userId))
        );
      }

      if (data.handRaised && isTeacher) {
        playRequestChime();
        setPendingRequests((prev) => {
          const hasSpecific = prev.some(
            (req) =>
              (req.socketId === data.socketId || (data.userId && req.userId === data.userId)) &&
              req.permissionType !== 'general'
          );
          if (hasSpecific) return prev;
          const reqId = `${data.userId || data.socketId}_general`;
          const filtered = prev.filter((item) => item.id !== reqId);
          return [
            {
              id: reqId,
              socketId: data.socketId,
              userId: data.userId,
              name: data.name || 'دانش‌آموز',
              permissionType: 'general',
              timestamp: Date.now(),
            },
            ...filtered,
          ];
        });

        toast(
          (t) => (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div style={{ fontWeight: 'bold', fontSize: '0.85rem' }}>
                ✋ <strong>{data.name}</strong> درخواست اجازه دارد:
              </div>
              <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                <button
                  onClick={() => {
                    handleToggleStudentPermissionRef.current?.({ socketId: data.socketId, userId: data.userId, name: data.name }, 'mic', true);
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
                  🎤 میکروفون
                </button>
                <button
                  onClick={() => {
                    handleToggleStudentPermissionRef.current?.({ socketId: data.socketId, userId: data.userId, name: data.name }, 'camera', true);
                    toast.dismiss(t.id);
                  }}
                  style={{
                    background: '#0ea5e9',
                    color: '#fff',
                    border: 'none',
                    padding: '4px 8px',
                    borderRadius: 5,
                    cursor: 'pointer',
                    fontSize: '0.74rem',
                    fontWeight: 700,
                  }}
                >
                  📷 دوربین
                </button>
                <button
                  onClick={() => {
                    handleToggleStudentPermissionRef.current?.({ socketId: data.socketId, userId: data.userId, name: data.name }, 'whiteboard', true);
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
                  ✏️ تخته
                </button>
                <button
                  onClick={() => {
                    handleToggleStudentPermissionRef.current?.({ socketId: data.socketId, userId: data.userId, name: data.name }, 'screen', true);
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
                  🖥️ اسکرین
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
                  👌 بستن
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

    // Live Webcam Video Frame (Teacher or Authorized Student)
    socket.on('live_video_frame', (payload) => {
      if (payload && typeof payload === 'object') {
        if (payload.senderSocketId === socket.id) return;
        setRemoteVideoData(payload.frame ? payload : null);
        setRemoteTeacherFrame(payload.frame || null);
      } else {
        setRemoteVideoData(payload ? { frame: payload, senderName: 'استاد کلاس' } : null);
        setRemoteTeacherFrame(payload || null);
      }
    });

    return () => {
      socket.off('connect', emitJoinClass);
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
      socket.off('student_permission_requested');
      socket.off('student_permission_changed');
      socket.off('participant_mic_changed');
      socket.off('participant_camera_changed');
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
    handleRequestPermission('whiteboard');
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
      } else if (tool === 'triangle') {
        mCtx.beginPath();
        mCtx.moveTo((startX + curX) / 2, startY);
        mCtx.lineTo(startX, curY);
        mCtx.lineTo(curX, curY);
        mCtx.closePath();
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
    } else if (['line', 'arrow', 'rect', 'circle', 'triangle'].includes(tool)) {
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
      } else if (tool === 'triangle') {
        dCtx.beginPath();
        dCtx.moveTo((startX + curX) / 2, startY);
        dCtx.lineTo(startX, curY);
        dCtx.lineTo(curX, curY);
        dCtx.closePath();
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
      const dpr = typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1;
      const pdfScale = Math.max(2.6, Math.min(3.6, dpr * 1.5));

      if (pageCacheRef.current.has(pageNum)) {
        pdfCanvasRef.current = pageCacheRef.current.get(pageNum);
        pdfImageRef.current = null;
        renderCompositeCanvas();
        setIsLoadingPdf(false);
        broadcastCurrentSlide(pageNum, doc.numPages);
        return;
      }

      const page = await doc.getPage(pageNum);
      const viewport = page.getViewport({ scale: pdfScale });
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
          activeBoardFileRef.current = {
            blob: file,
            name: file.name,
            mimeType: file.type || 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
          };
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
        activeBoardFileRef.current = {
          blob: file,
          name: file.name,
          mimeType: file.type || 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        };
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
        activeBoardFileRef.current = {
          blob: file,
          name: file.name,
          mimeType: 'application/pdf',
        };
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
    activeBoardFileRef.current = {
      blob: file,
      name: file.name,
      mimeType: file.type || 'image/png',
    };
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
    activeBoardFileRef.current = {
      blob: file,
      name: file.name,
      mimeType: file.type || 'video/mp4',
    };
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
    activeBoardFileRef.current = null;
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
      // 1. Explicitly prompt and request microphone permission FIRST
      let micStream = null;
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
        toast.success('میکروفون متصل شد 🎙️ صدای کلاس ضبط می‌شود', { duration: 3000 });
      } catch (micErr) {
        toast.dismiss(permToast);
        console.warn('Microphone permission denied or not available:', micErr);
        toast.error('دسترسی به میکروفون داده نشد یا میکروفون در دسترس نیست! ویدیو بدون صدا ضبط خواهد شد ⚠️', { duration: 4000 });
      }

      // 2. Capture 30FPS canvas video stream
      const canvasStream = canvas.captureStream(30);

      // 3. Compose unified stream containing both video and audio tracks
      const tracks = [...canvasStream.getVideoTracks()];
      if (micStream && micStream.getAudioTracks().length > 0) {
        tracks.push(...micStream.getAudioTracks());
      }
      const combinedStream = new MediaStream(tracks);

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

  const triggerLiveDownloadFile = async (data, filename, mimeType = 'application/octet-stream') => {
    try {
      let blob = null;
      if (data instanceof Blob) {
        blob = data;
      } else if (typeof data === 'string' && (data.startsWith('data:') || data.startsWith('blob:'))) {
        try {
          const resp = await fetch(data);
          blob = await resp.blob();
        } catch (fetchErr) {
          console.warn('Could not fetch URI into Blob:', fetchErr);
        }
      } else if (data !== undefined && data !== null) {
        blob = new Blob([data], { type: mimeType });
      }

      if (!blob) return false;

      const isCapacitorOrMobileWebView =
        typeof window !== 'undefined' &&
        Boolean(
          window.Capacitor?.isNativePlatform?.() ||
            /Android|wv|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '')
        );

      // 1. On Capacitor / Mobile WebView (or if direct blob anchor could be blocked),
      // relay via authenticated backend one-time HTTPS download capability
      if (isCapacitorOrMobileWebView) {
        try {
          const formData = new FormData();
          const safeUploadName =
            filename && filename.includes('.')
              ? filename
              : `${filename || 'class_file'}.${mimeType?.includes('pdf') ? 'pdf' : mimeType?.includes('webm') ? 'webm' : 'png'}`;
          formData.append('file', blob, safeUploadName);
          formData.append('filename', filename || safeUploadName);

          const res = await api.post('/upload/temp-download', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
            timeout: 120000,
          });

          const downloadPath = res.data?.data?.downloadPath;
          if (downloadPath) {
            const rawApiBase = typeof getApiBaseUrl === 'function' ? getApiBaseUrl() : '';
            const backendOrigin = rawApiBase
              ? rawApiBase.replace(/\/api\/v1\/?$/, '')
              : typeof window !== 'undefined'
              ? window.location.origin
              : '';
            const fullDownloadUrl = `${backendOrigin}${downloadPath}`;

            const opened = typeof window !== 'undefined' ? window.open(fullDownloadUrl, '_blank', 'noopener,noreferrer') : null;
            if (!opened) {
              const link = document.createElement('a');
              link.href = fullDownloadUrl;
              link.download = filename || safeUploadName;
              link.target = '_blank';
              link.rel = 'noopener noreferrer';
              link.style.display = 'none';
              document.body.appendChild(link);
              link.click();
              setTimeout(() => {
                try { document.body.removeChild(link); } catch (_) {}
              }, 2000);
            }
            return true;
          }
        } catch (relayErr) {
          console.warn('Temp download HTTPS relay failed, falling back to browser download:', relayErr);
        }
      }

      // 2. Desktop & fallback browser Blob URL download (with 60s lifetime)
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = filename || 'download';
      a.rel = 'noopener noreferrer';
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        try {
          if (a.parentNode) document.body.removeChild(a);
          URL.revokeObjectURL(blobUrl);
        } catch (_) {}
      }, 60000);
      return true;
    } catch (err) {
      console.error('triggerLiveDownloadFile error:', err);
      return false;
    }
  };

  const stopRecordingSession = () => {
    if (mediaRecorderRef.current && (recStatus === 'recording' || recStatus === 'paused')) {
      try {
        if (mediaRecorderRef.current.state !== 'inactive') {
          mediaRecorderRef.current.requestData();
        }
      } catch (e) {}
      mediaRecorderRef.current.stop();
      setRecStatus('idle');
      if (recTimerIntervalRef.current) {
        clearInterval(recTimerIntervalRef.current);
        recTimerIntervalRef.current = null;
      }
    }
  };

  // Download recorded video directly (Desktop, Mobile & Android WebView compatible)
  const handleDownloadVideo = async () => {
    const cleanName = (saveTitle || 'کلاس_آنلاین')
      .replace(/[/\\?%*:|"<>]/g, '-')
      .replace(/\s+/g, '_')
      .trim();
    const dateStr = new Date().toLocaleDateString('fa-IR').replace(/\//g, '-');
    const fileName = `${cleanName}_${dateStr}.webm`;

    const loadingToast = toast.loading('در حال آماده‌سازی ویدیوی کلاس...');

    try {
      if (recordedBlob && recordedBlob.size > 0) {
        const ok = await triggerLiveDownloadFile(recordedBlob, fileName, 'video/webm');
        toast.dismiss(loadingToast);
        if (ok) {
          toast.success('ویدیو با موفقیت دانلود شد 📥');
        } else {
          toast.error('خطا در دانلود ویدیو');
        }
        return;
      }

      if (recordedVideoUrl) {
        const ok = await triggerLiveDownloadFile(recordedVideoUrl, fileName, 'video/webm');
        toast.dismiss(loadingToast);
        if (ok) {
          toast.success('ویدیو با موفقیت دانلود شد 📥');
        } else {
          toast.error('خطا در دانلود ویدیو');
        }
        return;
      }

      if (recordedChunksRef.current && recordedChunksRef.current.length > 0) {
        const mime = mediaRecorderRef.current?.mimeType || 'video/webm';
        const fallbackBlob = new Blob(recordedChunksRef.current, { type: mime });
        setRecordedBlob(fallbackBlob);
        const ok = await triggerLiveDownloadFile(fallbackBlob, fileName, mime);
        toast.dismiss(loadingToast);
        if (ok) {
          toast.success('ویدیو با موفقیت دانلود شد 📥');
          return;
        }
      }

      toast.dismiss(loadingToast);
      toast.error('فایل ویدیوی کلاس هنوز آماده نشده است.');
    } catch (err) {
      console.error('handleDownloadVideo error:', err);
      toast.dismiss(loadingToast);
      toast.error('خطا در دانلود فایل ویدیو');
    }
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
        formData.append('class_id', String(classId));
        formData.append('class_ids', JSON.stringify([String(classId)]));
        formData.append('target_class_ids', JSON.stringify([String(classId)]));
      }
      formData.append('folder_name', classData?.name || 'کلاس‌های آنلاین');
      formData.append('category', 'کلاس آنلاین');
      formData.append('target_audience', 'teacher_students');
      formData.append('is_published', 'true');

      await api.post('/videos', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      toast.success('ویدیو با موفقیت در بخش ویدیوهای کلاس ذخیره شد ☁️🎥');
      setShowSaveModal(false);
    } catch (err) {
      console.error('Publish error:', err);
      toast.error(err?.response?.data?.message || 'خطا در ذخیره ویدیو در آرشیو');
    } finally {
      setIsUploading(false);
    }
  };

  // ── 10. Export Board (PNG & Multi-page PDF & Active Board File) ──
  const handleDownloadBoardPng = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const safeClassName = (classData?.name || 'کلاس').replace(/[/\\?%*:|"<>]/g, '_').trim();
    const dateStr = new Date().toLocaleDateString('fa-IR').replace(/\//g, '-');
    const fileName = `تخته_هوشمند_${safeClassName}_${dateStr}.png`;
    const loadingToast = toast.loading('در حال آماده‌سازی تصویر تخته...');

    try {
      let blob = await new Promise((resolve) => {
        try {
          canvas.toBlob((b) => resolve(b), 'image/png');
        } catch (_) {
          resolve(null);
        }
      });

      // Fallback clean composite if main canvas is cross-origin tainted
      if (!blob) {
        const off = document.createElement('canvas');
        off.width = canvas.width || 1280;
        off.height = canvas.height || 720;
        const offCtx = off.getContext('2d');
        offCtx.fillStyle = boardType === 'blackboard' ? '#0f172a' : '#ffffff';
        offCtx.fillRect(0, 0, off.width, off.height);
        if (drawingCanvasRef.current) {
          offCtx.drawImage(drawingCanvasRef.current, 0, 0, off.width, off.height);
        }
        blob = await new Promise((resolve) => off.toBlob((b) => resolve(b), 'image/png'));
      }

      const ok = blob ? await triggerLiveDownloadFile(blob, fileName, 'image/png') : false;
      toast.dismiss(loadingToast);
      if (ok) {
        toast.success('تصویر تخته هوشمند با موفقیت دانلود شد 🖼️');
      } else {
        toast.error('خطا در دانلود تصویر تخته');
      }
    } catch (err) {
      console.error('handleDownloadBoardPng error:', err);
      toast.dismiss(loadingToast);
      toast.error('خطا در دانلود تصویر تخته');
    }
  };

  const handleDownloadActiveBoardFile = async () => {
    const activeFile = activeBoardFileRef.current;
    if (!activeFile) {
      toast.error('فایل یا تصویر فعالی روی تخته وجود ندارد.');
      return;
    }
    const loadingToast = toast.loading('در حال آماده‌سازی فایل برای دانلود...');
    try {
      const payload = activeFile.blob || activeFile.dataUrl;
      const ok = await triggerLiveDownloadFile(
        payload,
        activeFile.name || pdfFileName || 'فایل_کلاس',
        activeFile.mimeType || 'application/octet-stream'
      );
      toast.dismiss(loadingToast);
      if (ok) {
        toast.success('فایل کلاس با موفقیت دانلود شد 📥');
      } else {
        toast.error('خطا در دانلود فایل کلاس');
      }
    } catch (err) {
      console.error('handleDownloadActiveBoardFile error:', err);
      toast.dismiss(loadingToast);
      toast.error('خطا در دانلود فایل کلاس');
    }
  };

  const handleExportPdfBooklet = async () => {
    const loadingToast = toast.loading('در حال ساخت فایل PDF جزوه تخته...');
    try {
      try {
        saveCurrentBoardPageData();
      } catch (e) {}

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

      const offscreen = document.createElement('canvas');
      offscreen.width = width;
      offscreen.height = height;
      const offCtx = offscreen.getContext('2d');
      if (offCtx) {
        offCtx.imageSmoothingEnabled = true;
        offCtx.imageSmoothingQuality = 'high';
      }

      const pages = boardPagesRef.current || [];
      const totalP = Math.max(1, pages.length);

      for (let i = 0; i < totalP; i++) {
        const p = pages[i] || {};
        offCtx.clearRect(0, 0, width, height);

        // BG
        offCtx.fillStyle = p.boardType === 'blackboard' ? '#1e3a2f' : '#ffffff';
        offCtx.fillRect(0, 0, width, height);

        // Media if open
        const mediaSource = pdfCanvasRef.current || pdfImageRef.current;
        if (mediaSource) {
          try {
            offCtx.drawImage(mediaSource, 40, 40, width - 80, height - 80);
          } catch (mErr) {}
        }

        // Strokes
        if (p.drawingDataUrl) {
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
            img.src = p.drawingDataUrl;
          });
        }

        // Page number
        try {
          offCtx.font = 'bold 16px Vazirmatn, sans-serif';
          offCtx.fillStyle = '#64748b';
          offCtx.fillText(`برگه ${i + 1} از ${totalP} • ${classData?.name || 'کلاس'}`, 40, height - 20);
        } catch (e) {}

        let imgData = null;
        try {
          imgData = offscreen.toDataURL('image/jpeg', 0.92);
        } catch (taintErr) {
          try {
            imgData = offscreen.toDataURL('image/png');
          } catch (e2) {}
        }

        if (imgData && imgData !== 'data:,') {
          if (i > 0) doc.addPage([width, height], orientation);
          doc.addImage(imgData, 'JPEG', 0, 0, width, height, undefined, 'FAST');
        }
      }

      const safeClassName = (classData?.name || 'کلاس').replace(/[/\\?%*:|"<>]/g, '_').trim();
      const fileName = `جزوه_تخته_${safeClassName}.pdf`;

      let downloaded = false;
      try {
        const pdfBlob = doc.output('blob');
        if (pdfBlob && pdfBlob.size > 0) {
          downloaded = await triggerLiveDownloadFile(pdfBlob, fileName, 'application/pdf');
        }
      } catch (blobErr) {}

      if (!downloaded) {
        try {
          doc.save(fileName);
          downloaded = true;
        } catch (sErr) {}
      }

      toast.dismiss(loadingToast);
      if (downloaded) {
        toast.success('جزوه PDF با موفقیت دانلود شد 📄✨');
      } else {
        toast.error('خطا در دریافت و ذخیره فایل PDF');
      }
    } catch (e) {
      console.error('PDF error:', e);
      toast.dismiss(loadingToast);
      toast.error('خطا در دانلود فایل PDF: ' + (e.message || ''));
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
    router.push(`/dashboard/classes/1/?classId=${encodeURIComponent(String(classId))}`);
  };

  // Keep local <video> attached whenever camera turns active
  useEffect(() => {
    if (cameraActive && localVideoRef.current && mediaStreamRef.current) {
      if (localVideoRef.current.srcObject !== mediaStreamRef.current) {
        localVideoRef.current.srcObject = mediaStreamRef.current;
      }
      localVideoRef.current.play?.().catch(() => {});
    }
  }, [cameraActive]);

  // Clean up all hardware tracks and timers when leaving classroom
  useEffect(() => {
    return () => {
      if (videoBroadcastIntervalRef.current) {
        clearInterval(videoBroadcastIntervalRef.current);
        videoBroadcastIntervalRef.current = null;
      }
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;
      }
      if (micMediaStreamRef.current) {
        micMediaStreamRef.current.getTracks().forEach((track) => track.stop());
        micMediaStreamRef.current = null;
      }
      if (screenBroadcastIntervalRef.current) {
        clearInterval(screenBroadcastIntervalRef.current);
        screenBroadcastIntervalRef.current = null;
      }
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach((track) => track.stop());
        screenStreamRef.current = null;
      }
    };
  }, []);

  // ── 12. Camera & Webcam (Teacher & Authorized Student) ──
  const toggleCamera = async () => {
    if (!canUseCamera) {
      handleRequestPermission('camera');
      return;
    }

    if (!cameraActive) {
      if (!navigator?.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
        toast.error('دستگاه یا مرورگر از دوربین پشتیبانی نمی‌کند.');
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 640 }, height: { ideal: 360 }, facingMode: 'user' },
          audio: false,
        });
        mediaStreamRef.current = stream;
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }
        setCameraActive(true);
        getSocket().emit('toggle_camera', { classId: String(classId), cameraOn: true });
        toast.success('دوربین فعال شد 📷');

        const frameCanvas = document.createElement('canvas');
        frameCanvas.width = 320;
        frameCanvas.height = 180;
        const frameCtx = frameCanvas.getContext('2d');

        if (videoBroadcastIntervalRef.current) {
          clearInterval(videoBroadcastIntervalRef.current);
        }
        videoBroadcastIntervalRef.current = setInterval(() => {
          if (!mediaStreamRef.current || !mediaStreamRef.current.active) {
            clearInterval(videoBroadcastIntervalRef.current);
            videoBroadcastIntervalRef.current = null;
            return;
          }
          if (localVideoRef.current && localVideoRef.current.readyState >= 2) {
            frameCtx.drawImage(localVideoRef.current, 0, 0, 320, 180);
            const frameData = frameCanvas.toDataURL('image/jpeg', 0.45);
            getSocket().emit('live_video_frame', { classId: String(classId), frame: frameData });
          }
        }, 600);
      } catch (err) {
        console.error('Camera error:', err);
        toast.error('دسترسی به دوربین داده نشد! لطفاً مجوز دوربین برنامه را در تنظیمات گوشی یا مرورگر فعال کنید.');
      }
    } else {
      stopCamera();
    }
  };

  const stopCamera = () => {
    if (videoBroadcastIntervalRef.current) {
      clearInterval(videoBroadcastIntervalRef.current);
      videoBroadcastIntervalRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }
    setCameraActive(false);
    getSocket().emit('toggle_camera', { classId: String(classId), cameraOn: false });
    getSocket().emit('live_video_frame', { classId: String(classId), frame: null });
  };



  // ── 14. Chat Sending ──
  const handleSendMessage = (e) => {
    e.preventDefault();
    const text = chatInput.trim();
    if (!text) return;
    try {
      const socket = getSocket();
      socket.emit('send_chat_message', { classId: String(classId), text });
      setChatInput('');
    } catch (err) {
      console.error('Chat error:', err);
      toast.error('خطا در ارسال پیام');
    }
  };

  // ── 15. Copy Direct Live Class Invite Link ──
  const handleCopyClassLink = () => {
    if (typeof window !== 'undefined') {
      const url = `${window.location.origin}/dashboard/classes/1/live/?classId=${encodeURIComponent(String(classId))}`;
      navigator.clipboard?.writeText(url);
      toast.success('لینک ورود مستقیم به کلاس آنلاین کپی شد! می‌توانید آن را برای دانش‌آموزان بفرستید 📋', {
        duration: 5000,
        icon: '🔗',
      });
    }
  };

  return (
    <div className={styles.liveContainer}>

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
              if (isLive && isTeacher) {
                setShowCloseModal(true);
              } else {
                router.push(`/dashboard/classes/1/?classId=${encodeURIComponent(String(classId))}`);
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

          {/* Copy Direct Class Invite Link (Google Meet Style) */}
          <button
            className={styles.headerBtn}
            onClick={handleCopyClassLink}
            title="کپی لینک ورود مستقیم به کلاس برای ارسال به دانش‌آموزان"
            style={{ borderColor: 'rgba(56, 189, 248, 0.4)', background: 'rgba(56, 189, 248, 0.12)' }}
          >
            <HiOutlineSparkles style={{ color: '#38bdf8', fontSize: '1.1rem' }} />
            <span>لینک دعوت 🔗</span>
          </button>

          {/* Microphone Toggle (Teacher or Student) */}
          <button
            className={`${styles.headerBtn} ${isMicOn ? styles.micBtnActive : ''} ${!canUseMic ? styles.headerBtnDisabled : ''}`}
            onClick={() => {
              if (!canUseMic) {
                handleRequestPermission('mic');
                return;
              }
              toggleMic();
            }}
            title={
              isMicOn
                ? 'میکروفون روشن است (کلیک برای قطع صدا)'
                : canUseMic
                ? 'روشن کردن میکروفون'
                : 'میکروفون قفل است - کلیک برای ارسال درخواست اجازه به معلم'
            }
          >
            <HiOutlineMicrophone style={{ color: isMicOn ? '#34d399' : 'inherit', fontSize: '1.1rem' }} />
            <span>{isMicOn ? 'میکروفون روشن 🎙️' : canUseMic ? 'میکروفون' : 'درخواست میکروفون 🔒'}</span>
          </button>

          {/* Screen Sharing Toggle */}
          <button
            className={`${styles.headerBtn} ${isScreenSharing ? styles.screenShareBtnActive : ''} ${!canUseScreen ? styles.headerBtnDisabled : ''}`}
            onClick={() => {
              if (!canUseScreen) {
                handleRequestPermission('screen');
                return;
              }
              toggleScreenShare();
            }}
            title={
              isScreenSharing
                ? 'توقف اشتراک صفحه نمایش'
                : canUseScreen
                ? 'اشتراک‌گذاری صفحه نمایش'
                : 'اشتراک صفحه قفل است - کلیک برای ارسال درخواست اجازه به معلم'
            }
          >
            <HiOutlineTv style={{ color: isScreenSharing ? '#60a5fa' : 'inherit', fontSize: '1.1rem' }} />
            <span>{isScreenSharing ? 'توقف اشتراک ⏹️' : canUseScreen ? 'اشتراک صفحه 🖥️' : 'درخواست اسکرین 🔒'}</span>
          </button>

          {/* Webcam Toggle */}
          <button
            className={`${styles.headerBtn} ${cameraActive ? styles.headerBtnActive : ''} ${!canUseCamera ? styles.headerBtnDisabled : ''}`}
            onClick={toggleCamera}
            title={
              canUseCamera
                ? 'روشن/خاموش کردن دوربین'
                : 'دوربین قفل است - کلیک برای ارسال درخواست اجازه به معلم'
            }
          >
            {cameraActive ? <HiOutlineVideoCamera /> : <HiOutlineVideoCameraSlash />}
            <span>{cameraActive ? 'دوربین روشن' : canUseCamera ? 'وبکم' : 'درخواست دوربین 🔒'}</span>
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

          {/* Teacher Raised Hands & Permission Requests Quick Counter in Top Bar */}
          {isTeacher &&
            (pendingRequests.length > 0 ||
              participants.filter((p) => p.role !== 'teacher' && p.role !== 'admin' && p.handRaised).length > 0) && (
            <button
              className={`${styles.headerBtn} ${styles.handRaisedBtnActive}`}
              onClick={() => setActiveTab('participants')}
              title="مشاهده درخواست‌های اجازه دانش‌آموزان"
              style={{ background: '#f59e0b', color: '#1e293b', fontWeight: 800, animation: 'pulse 1.5s infinite' }}
            >
              <FaHandPaper />
              <span>
                {Math.max(
                  pendingRequests.length,
                  participants.filter((p) => p.role !== 'teacher' && p.role !== 'admin' && p.handRaised).length
                )}{' '}
                درخواست اجازه ✋
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
              onClick={() => router.push(`/dashboard/classes/1/?classId=${encodeURIComponent(String(classId))}`)}
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
            <span>گفتگو</span>
            {chatMessages.length > 0 && <span className={styles.countBadge}>{chatMessages.length}</span>}
          </button>

          <button
            className={`${styles.headerBtn} ${activeTab === 'participants' ? styles.headerBtnActive : ''}`}
            onClick={() => setActiveTab(activeTab === 'participants' ? null : 'participants')}
            title="لیست حاضرین آنلاین"
          >
            <HiOutlineUserGroup />
            <span>حاضرین</span>
            {participants.length > 0 && <span className={styles.countBadge}>{participants.length}</span>}
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

          {/* Floating Persistent Teacher Pending Permission Requests Banner */}
          {isTeacher && pendingRequests.length > 0 && (
            <div className={styles.teacherPendingRequestsBar}>
              {pendingRequests.slice(0, 3).map((req) => {
                const reqLabelMap = {
                  mic: 'میکروفون 🎙️',
                  camera: 'دوربین 📷',
                  screen: 'اشتراک صفحه 🖥️',
                  whiteboard: 'تخته هوشمند ✏️',
                  general: 'اجازه صحبت / سوال ✋',
                };
                const targetObj = {
                  socketId: req.socketId,
                  userId: req.userId,
                  name: req.name,
                };
                return (
                  <div key={req.id} className={styles.pendingReqCard}>
                    <div className={styles.pendingReqTitle}>
                      <span>✋ <strong>{req.name}</strong>:</span>
                      <span className={styles.pendingReqType}>{reqLabelMap[req.permissionType] || 'اجازه'}</span>
                    </div>
                    <div className={styles.pendingReqActions}>
                      {req.permissionType === 'general' ? (
                        <>
                          <button
                            type="button"
                            className={styles.pendingGrantBtn}
                            onClick={() => handleToggleStudentPermission(targetObj, 'mic', true)}
                          >
                            🎙️ میکروفون
                          </button>
                          <button
                            type="button"
                            className={styles.pendingGrantBtn}
                            onClick={() => handleToggleStudentPermission(targetObj, 'camera', true)}
                          >
                            📷 دوربین
                          </button>
                          <button
                            type="button"
                            className={styles.pendingGrantBtn}
                            onClick={() => handleToggleStudentPermission(targetObj, 'whiteboard', true)}
                          >
                            ✏️ تخته
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          className={styles.pendingGrantBtn}
                          onClick={() => handleToggleStudentPermission(targetObj, req.permissionType, true)}
                        >
                          ✅ تایید و اجازه
                        </button>
                      )}
                      <button
                        type="button"
                        className={styles.pendingDismissBtn}
                        onClick={() => handleLowerHand(targetObj)}
                        title="رد یا بستن درخواست"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Floating Student Permission Notifications */}
          {!isTeacher && hasMicAccess && !isMicOn && (
            <div className={styles.studentFloatingPermissionNotice}>
              <span>🎙️ دبیر اجازه صحبت داد! برای صحبت کردن دکمه میکروفون بالا را بزنید</span>
            </div>
          )}
          {!isTeacher && hasCameraAccess && !cameraActive && (
            <div className={styles.studentFloatingPermissionNotice} style={{ bottom: '176px', background: 'rgba(14, 165, 233, 0.95)' }}>
              <span>📷 دبیر اجازه دوربین داد! برای فعال‌سازی روی دکمه وبکم بالا بزنید</span>
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
                  className={styles.docDownloadBtn}
                  onClick={handleDownloadActiveBoardFile}
                  title="دانلود فایل در حال نمایش"
                >
                  <HiOutlineArrowDownTray size={16} />
                  <span>دانلود فایل</span>
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

          {/* Floating Live Webcam Box (Teacher or Authorized Student) */}
          <div className={styles.floatingWebcam}>
            {cameraActive ? (
              <video ref={localVideoRef} autoPlay playsInline muted className={styles.webcamVideo} />
            ) : remoteVideoData?.frame || remoteTeacherFrame ? (
              <img
                src={remoteVideoData?.frame || remoteTeacherFrame}
                alt="تصویر زنده دوربین"
                className={styles.webcamVideo}
              />
            ) : (
              <div className={styles.webcamOffPlaceholder}>
                {isTeacher ? (
                  <>
                    <HiOutlineVideoCameraSlash style={{ fontSize: '2rem' }} />
                    <span>دوربین شما خاموش است</span>
                  </>
                ) : (
                  <>
                    <HiOutlineVideoCamera style={{ fontSize: '2rem' }} />
                    <span>تصویر زنده استاد</span>
                  </>
                )}
              </div>
            )}
            <div className={styles.webcamBadge}>
              <span>
                {cameraActive
                  ? isTeacher
                    ? 'تصویر شما (معلم)'
                    : 'دوربین شما (دانش‌آموز)'
                  : remoteVideoData?.senderName || 'استاد کلاس'}
              </span>
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

              {/* 1. Essential Tools: Pen, Eraser, and Active Shape indicator */}
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

                {['line', 'arrow', 'rect', 'circle', 'triangle'].includes(tool) && (
                  <button
                    className={`${styles.toolBtn} ${styles.toolBtnActive}`}
                    onClick={() => {
                      setTool('pen');
                      toast('به قلم معمولی بازگشتید ✏️', { duration: 1500 });
                    }}
                    title="ابزار هندسی فعال است. برای بازگشت به قلم کلیک کنید"
                    style={{ background: '#6366f1', color: '#fff', fontSize: '1.05rem', fontWeight: 900 }}
                  >
                    {tool === 'line' && '╱'}
                    {tool === 'arrow' && '➔'}
                    {tool === 'rect' && '▭'}
                    {tool === 'circle' && '◯'}
                    {tool === 'triangle' && '△'}
                  </button>
                )}
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

              {/* Direct File & Media Upload Buttons */}
              {isTeacher && (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <button
                      type="button"
                      className={styles.toolBtn}
                      onClick={() => docFileInputRef.current?.click()}
                      title="بارگذاری اسلاید یا فایل PDF روی تخته"
                      style={{
                        background: 'rgba(59, 130, 246, 0.15)',
                        color: '#60a5fa',
                        borderColor: 'rgba(96, 165, 250, 0.35)',
                        fontSize: '0.82rem',
                        fontWeight: 700,
                        padding: '5px 10px',
                        width: 'auto',
                        borderRadius: '8px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                      }}
                    >
                      <FaFilePdf size={14} />
                      <span>بارگذاری فایل / PDF</span>
                    </button>
                    <button
                      type="button"
                      className={styles.toolBtn}
                      onClick={() => imageFileInputRef.current?.click()}
                      title="بارگذاری عکس یا کاربرگ روی تخته"
                      style={{
                        background: 'rgba(16, 185, 129, 0.15)',
                        color: '#34d399',
                        borderColor: 'rgba(52, 211, 153, 0.35)',
                        fontSize: '0.82rem',
                        fontWeight: 700,
                        padding: '5px 10px',
                        width: 'auto',
                        borderRadius: '8px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                      }}
                    >
                      <HiOutlinePhoto size={15} />
                      <span>عکس / تصویر</span>
                    </button>
                  </div>
                  <div className={styles.toolDivider} />
                </>
              )}

              {/* 3. Dropdown Menu for All Other Features & Tools */}
              <div className={styles.menuContainer} ref={toolsMenuRef}>
                <button
                  className={`${styles.menuToggleBtn} ${showToolsMenu ? styles.menuToggleBtnActive : ''}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowToolsMenu((prev) => !prev);
                  }}
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
                    {/* Section 1: بارگذاری فایل و رسانه (برای معلم) */}
                    {isTeacher && (
                      <div className={styles.dropdownSection}>
                        <span className={styles.dropdownSectionTitle}>
                          <span>📁</span>
                          <span>باز کردن فایل و رسانه روی تخته</span>
                        </span>
                        <div className={styles.dropdownRow}>
                          <button
                            type="button"
                            className={styles.menuItemBtn}
                            onClick={() => {
                              docFileInputRef.current?.click();
                              setShowToolsMenu(false);
                            }}
                            title="بارگذاری اسلاید پاورپوینت یا کتابچه PDF"
                            style={{ color: '#60a5fa', fontWeight: 800 }}
                          >
                            <FaFilePdf size={14} />
                            <span>PDF / پاورپوینت</span>
                          </button>

                          <button
                            type="button"
                            className={styles.menuItemBtn}
                            onClick={() => {
                              imageFileInputRef.current?.click();
                              setShowToolsMenu(false);
                            }}
                            title="بارگذاری کاربرگ و عکس روی تخته"
                            style={{ color: '#34d399', fontWeight: 800 }}
                          >
                            <HiOutlinePhoto size={15} />
                            <span>عکس / کاربرگ</span>
                          </button>

                          <button
                            type="button"
                            className={styles.menuItemBtn}
                            onClick={() => {
                              videoFileInputRef.current?.click();
                              setShowToolsMenu(false);
                            }}
                            title="بارگذاری و پخش فیلم آموزشی روی تخته"
                            style={{ color: '#a78bfa', fontWeight: 800 }}
                          >
                            <HiOutlineFilm size={15} />
                            <span>فیلم آموزشی</span>
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Section 2: اشکال هندسی */}
                    <div className={styles.dropdownSection}>
                      <span className={styles.dropdownSectionTitle}>
                        <span>📐</span>
                        <span>اشکال هندسی (خط، فلش، اشکال)</span>
                      </span>
                      <div className={styles.dropdownRow}>
                        <button
                          type="button"
                          className={`${styles.menuItemBtn} ${tool === 'line' ? styles.menuItemBtnActive : ''}`}
                          onClick={() => {
                            setTool('line');
                            setShowToolsMenu(false);
                            toast('ابزار خط صاف فعال شد ╱', { duration: 1800 });
                          }}
                          title="رسم خط صاف و مستقیم"
                        >
                          <FaSlash size={12} />
                          <span>خط</span>
                        </button>
                        <button
                          type="button"
                          className={`${styles.menuItemBtn} ${tool === 'arrow' ? styles.menuItemBtnActive : ''}`}
                          onClick={() => {
                            setTool('arrow');
                            setShowToolsMenu(false);
                            toast('ابزار فلش جهت‌دار فعال شد ➔', { duration: 1800 });
                          }}
                          title="پیکان / فلش جهت‌دار"
                        >
                          <FaArrowRight size={12} />
                          <span>فلش</span>
                        </button>
                        <button
                          type="button"
                          className={`${styles.menuItemBtn} ${tool === 'rect' ? styles.menuItemBtnActive : ''}`}
                          onClick={() => {
                            setTool('rect');
                            setShowToolsMenu(false);
                            toast('ابزار مستطیل و کادر فعال شد ▭', { duration: 1800 });
                          }}
                          title="مستطیل / کادر"
                        >
                          <FaRegSquare size={12} />
                          <span>مستطیل</span>
                        </button>
                        <button
                          type="button"
                          className={`${styles.menuItemBtn} ${tool === 'circle' ? styles.menuItemBtnActive : ''}`}
                          onClick={() => {
                            setTool('circle');
                            setShowToolsMenu(false);
                            toast('ابزار دایره و بیضی فعال شد ◯', { duration: 1800 });
                          }}
                          title="دایره / بیضی"
                        >
                          <FaRegCircle size={12} />
                          <span>دایره</span>
                        </button>
                        <button
                          type="button"
                          className={`${styles.menuItemBtn} ${tool === 'triangle' ? styles.menuItemBtnActive : ''}`}
                          onClick={() => {
                            setTool('triangle');
                            setShowToolsMenu(false);
                            toast('ابزار مثلث فعال شد △', { duration: 1800 });
                          }}
                          title="رسم مثلث هندسی"
                        >
                          <span>△ مثلث</span>
                        </button>
                        <button
                          type="button"
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

                    {/* Section 3: Highlighter & Brush Sizes */}
                    <div className={styles.dropdownSection}>
                      <span className={styles.dropdownSectionTitle}>
                        <span>🖌️</span>
                        <span>قلم و ضخامت</span>
                      </span>
                      <div className={styles.dropdownRow}>
                        <button
                          type="button"
                          className={`${styles.menuItemBtn} ${tool === 'highlighter' ? styles.menuItemBtnActive : ''}`}
                          onClick={() => {
                            setTool('highlighter');
                            setShowToolsMenu(false);
                            toast('ماژیک هایلایتر فعال شد 🖌️', { duration: 1800 });
                          }}
                          title="ماژیک هایلایتر فسفری"
                        >
                          <HiOutlinePaintBrush size={16} />
                          <span>هایلایتر</span>
                        </button>

                        {BRUSH_SIZES.map((b) => (
                          <button
                            key={b.size}
                            type="button"
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

              <button
                type="button"
                className={styles.drawerCloseBtn}
                onClick={() => setActiveTab(null)}
                title="بستن و بازگشت به تخته"
              >
                <HiOutlineXMark />
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
                              className={`${styles.urgentActionBtn} ${styles.urgentBtnScreen}`}
                              onClick={() => handleToggleStudentPermission(p, 'camera')}
                              title="اجازه روشن کردن دوربین"
                            >
                              <HiOutlineVideoCamera />
                              <span>{p.canCamera ? 'قطع دوربین' : 'اجازه دوربین 📷'}</span>
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

                      {/* Camera bulk */}
                      <div>
                        <div style={{ fontSize: '0.74rem', color: '#94a3b8', marginBottom: '4px', fontWeight: 600 }}>دوربین دانش‌آموزان:</div>
                        <div className={styles.teacherWbActions}>
                          <button
                            type="button"
                            className={styles.bulkWbBtn}
                            onClick={() => handleToggleAllStudentsPermission('camera', true)}
                            title="اجازه دوربین به همه دانش‌آموزان"
                          >
                            📷 باز برای همه
                          </button>
                          <button
                            type="button"
                            className={`${styles.bulkWbBtn} ${styles.bulkWbBtnRevoke}`}
                            onClick={() => handleToggleAllStudentsPermission('camera', false)}
                            title="قفل کردن دوربین همه دانش‌آموزان"
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
                                <span className={p.canCamera ? styles.wbAllowedBadge : styles.wbLockedBadge}>
                                  📷 {p.canCamera ? 'دوربین مجاز' : 'دوربین قفل'}
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
                              className={`${styles.permPill} ${p.canCamera ? styles.permPillActive : styles.permPillLocked}`}
                              onClick={() => handleToggleStudentPermission(p, 'camera')}
                              title="کلیک برای فعال/غیرفعال کردن دسترسی به دوربین"
                            >
                              📷 دوربین {p.canCamera ? 'فعال ✅' : 'قفل 🔒'}
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
