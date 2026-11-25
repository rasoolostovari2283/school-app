'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import toast from 'react-hot-toast';
import {
  HiOutlineChevronRight,
  HiOutlineChevronLeft,
  HiOutlineXMark,
  HiOutlinePlay,
  HiOutlinePause,
  HiOutlineSpeakerWave,
  HiOutlineSpeakerXMark,
  HiOutlinePlus,
  HiOutlineTrash,
  HiOutlineDocumentText,
  HiOutlineSquares2X2,
} from 'react-icons/hi2';
import useAuthStore from '../../../stores/authStore';
import { loadPptxPresentation } from '../../../lib/pptxRenderer';
import { loadWordDocument } from '../../../lib/docxRenderer';
import BoardEntryPicker from '../../../components/smartboard/BoardEntryPicker';
import SmartboardToolbar from '../../../components/smartboard/SmartboardToolbar';
import SmartboardRecorderBar from '../../../components/smartboard/SmartboardRecorderBar';
import RecordingActionModal from '../../../components/smartboard/RecordingActionModal';
import styles from './record.module.css';

const MAIN_CANVAS_W = 1440;
const MAIN_CANVAS_H = 900;
const NOTE_CANVAS_W = 900;
const NOTE_CANVAS_H = 1100;
const REC_CANVAS_W = 1280;
const REC_CANVAS_H = 720;

// Robust loader for local Mozilla PDF.js (/pdf.js + /pdf.worker.min.js)
async function getPdfJs() {
  if (typeof window === 'undefined') return null;
  const existing = window.pdfjsLib || window['pdfjs-dist/build/pdf'];
  if (existing) {
    if (!existing.GlobalWorkerOptions?.workerSrc) {
      existing.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js';
    }
    return existing;
  }

  return new Promise((resolve, reject) => {
    let script = document.querySelector('script[data-pdfjs="true"]');
    if (!script) {
      script = document.createElement('script');
      script.setAttribute('data-pdfjs', 'true');
      script.src = '/pdf.js';
      document.head.appendChild(script);
    }

    const findLib = () => {
      const lib = window.pdfjsLib || window['pdfjs-dist/build/pdf'];
      if (lib) {
        lib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js';
        return lib;
      }
      return null;
    };

    const immediate = findLib();
    if (immediate) return resolve(immediate);

    script.addEventListener('load', () => {
      const lib = findLib();
      if (lib) return resolve(lib);
      setTimeout(() => {
        const retry = findLib();
        if (retry) resolve(retry);
        else reject(new Error('کتابخانه PDF بارگذاری نشد'));
      }, 150);
    });
    script.addEventListener('error', () => reject(new Error('خطا در بارگذاری ابزار نمایش PDF')));
  });
}

function drawBoardBackground(ctx, width, height, type) {
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  if (type !== 'grid') return;

  const step = 32;
  ctx.save();
  ctx.lineWidth = 1;

  ctx.strokeStyle = '#e2e8f0';
  ctx.beginPath();
  for (let x = step; x < width; x += step) {
    ctx.moveTo(x + 0.5, 0);
    ctx.lineTo(x + 0.5, height);
  }
  for (let y = step; y < height; y += step) {
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(width, y + 0.5);
  }
  ctx.stroke();

  ctx.strokeStyle = '#cbd5e1';
  ctx.beginPath();
  for (let x = step * 5; x < width; x += step * 5) {
    ctx.moveTo(x + 0.5, 0);
    ctx.lineTo(x + 0.5, height);
  }
  for (let y = step * 5; y < height; y += step * 5) {
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(width, y + 0.5);
  }
  ctx.stroke();
  ctx.restore();
}

function drawContained(ctx, source, srcW, srcH, boxX, boxY, boxW, boxH) {
  if (!source || !srcW || !srcH) return;
  const scale = Math.min(boxW / srcW, boxH / srcH);
  const drawW = srcW * scale;
  const drawH = srcH * scale;
  const offsetX = boxX + (boxW - drawW) / 2;
  const offsetY = boxY + (boxH - drawH) / 2;
  ctx.drawImage(source, offsetX, offsetY, drawW, drawH);
}

function loadImageFromUrl(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

function restoreCanvasFromDataUrl(canvas, dataUrl) {
  if (!canvas) return Promise.resolve();
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!dataUrl) return Promise.resolve();
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve();
    };
    img.onerror = () => resolve();
    img.src = dataUrl;
  });
}

export default function SmartBoardPage() {
  const { user } = useAuthStore();

  // Entry & session state
  const [hasEnteredBoard, setHasEnteredBoard] = useState(false);
  const [sessionTitle, setSessionTitle] = useState('جلسه تخته هوشمند');
  const [boardType, setBoardType] = useState('white'); // 'white' | 'grid'

  // Drawing tool state
  const [tool, setTool] = useState('pen'); // 'pen' | 'eraser'
  const [penColor, setPenColor] = useState('#0f172a');
  const [penSize, setPenSize] = useState(5);
  const [eraserSize, setEraserSize] = useState(24);
  const [activePane, setActivePane] = useState('main'); // 'main' | 'notes'

  // Whiteboard multi-page state (used when no document is loaded)
  const [boardPage, setBoardPage] = useState(1);
  const [boardTotalPages, setBoardTotalPages] = useState(1);
  const boardSnapshotsRef = useRef({}); // { [pageNum]: dataUrl }

  // Side-by-side white note board state
  const [isSplitNotesOpen, setIsSplitNotesOpen] = useState(false);
  const [notePage, setNotePage] = useState(1);
  const [noteTotalPages, setNoteTotalPages] = useState(1);
  const noteSnapshotsRef = useRef({}); // { [pageNum]: dataUrl }

  // Uploaded file / media state
  const [activeMedia, setActiveMedia] = useState(null);
  const [isLoadingMedia, setIsLoadingMedia] = useState(false);
  const [videoPlaying, setVideoPlaying] = useState(false);
  const [videoMuted, setVideoMuted] = useState(false);
  const [videoProgress, setVideoProgress] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);

  // Document engine refs
  const pdfDocRef = useRef(null);
  const wordDocRef = useRef(null);
  const pptxDocRef = useRef(null);
  const imageElRef = useRef(null);
  const docAnnotationsRef = useRef({}); // { [`${mediaId}_p${pageNum}`]: dataUrl }

  // Canvas & media element refs
  const docRenderCanvasRef = useRef(null);
  const mainDrawCanvasRef = useRef(null);
  const notesDrawCanvasRef = useRef(null);
  const videoElRef = useRef(null);

  // Drawing pointer refs
  const drawingPaneRef = useRef(null); // null | 'main' | 'notes'
  const lastPointRef = useRef(null);

  // Undo / Redo history per pane
  const mainHistoryRef = useRef({ undo: [], redo: [] });
  const notesHistoryRef = useRef({ undo: [], redo: [] });

  // Hidden file inputs
  const pdfInputRef = useRef(null);
  const wordInputRef = useRef(null);
  const pptxInputRef = useRef(null);
  const videoInputRef = useRef(null);
  const imageInputRef = useRef(null);

  // Export state
  const [isExporting, setIsExporting] = useState(false);

  // Recording state
  const [recStatus, setRecStatus] = useState('idle'); // 'idle' | 'recording' | 'paused'
  const [recSeconds, setRecSeconds] = useState(0);
  const [micEnabled, setMicEnabled] = useState(true);
  const [recordedBlob, setRecordedBlob] = useState(null);
  const [recordedUrl, setRecordedUrl] = useState(null);
  const [showRecordingModal, setShowRecordingModal] = useState(false);

  const mediaRecorderRef = useRef(null);
  const recChunksRef = useRef([]);
  const recTimerRef = useRef(null);
  const recRafRef = useRef(null);
  const recCanvasRef = useRef(null);
  const recStreamsRef = useRef([]);
  const recSecondsRef = useRef(0);

  // Live state mirrors for requestAnimationFrame recording loop
  const stateRef = useRef({});
  stateRef.current = {
    boardType,
    isSplitNotesOpen,
    activeMedia,
  };

  // Optional ?autostart=1 convenience support
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('autostart') === '1') {
      const mode = params.get('board') === 'grid' ? 'grid' : 'white';
      setBoardType(mode);
      setHasEnteredBoard(true);
    }
  }, []);

  // Cleanup blob URLs and streams on unmount
  useEffect(() => {
    return () => {
      if (recTimerRef.current) clearInterval(recTimerRef.current);
      if (recRafRef.current) cancelAnimationFrame(recRafRef.current);
      recStreamsRef.current.forEach((s) => s.getTracks().forEach((t) => t.stop()));
      if (recordedUrl) URL.revokeObjectURL(recordedUrl);
    };
  }, [recordedUrl]);

  const handleSelectInitialBoard = ({ boardType: chosenType, title }) => {
    setBoardType(chosenType);
    setSessionTitle(title);
    setHasEnteredBoard(true);
  };

  // ── Canvas History Helpers ──
  const pushUndoSnapshot = useCallback((pane) => {
    const canvas = pane === 'notes' ? notesDrawCanvasRef.current : mainDrawCanvasRef.current;
    if (!canvas) return;
    const hist = pane === 'notes' ? notesHistoryRef.current : mainHistoryRef.current;
    hist.undo.push(canvas.toDataURL('image/png'));
    if (hist.undo.length > 30) hist.undo.shift();
    hist.redo = [];
  }, []);

  const handleUndo = useCallback(async () => {
    const pane = activePane === 'notes' && isSplitNotesOpen ? 'notes' : 'main';
    const canvas = pane === 'notes' ? notesDrawCanvasRef.current : mainDrawCanvasRef.current;
    const hist = pane === 'notes' ? notesHistoryRef.current : mainHistoryRef.current;
    if (!canvas || hist.undo.length === 0) {
      toast('حرکت قبلی برای بازگشت وجود ندارد', { id: 'undo-empty' });
      return;
    }
    hist.redo.push(canvas.toDataURL('image/png'));
    const prev = hist.undo.pop();
    await restoreCanvasFromDataUrl(canvas, prev);
  }, [activePane, isSplitNotesOpen]);

  const handleRedo = useCallback(async () => {
    const pane = activePane === 'notes' && isSplitNotesOpen ? 'notes' : 'main';
    const canvas = pane === 'notes' ? notesDrawCanvasRef.current : mainDrawCanvasRef.current;
    const hist = pane === 'notes' ? notesHistoryRef.current : mainHistoryRef.current;
    if (!canvas || hist.redo.length === 0) {
      toast('حرکت بعدی برای انجام مجدد وجود ندارد', { id: 'redo-empty' });
      return;
    }
    hist.undo.push(canvas.toDataURL('image/png'));
    const next = hist.redo.pop();
    await restoreCanvasFromDataUrl(canvas, next);
  }, [activePane, isSplitNotesOpen]);

  const clearCanvasPane = useCallback(
    (pane) => {
      const canvas = pane === 'notes' ? notesDrawCanvasRef.current : mainDrawCanvasRef.current;
      if (!canvas) return;
      pushUndoSnapshot(pane);
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (pane === 'notes') {
        delete noteSnapshotsRef.current[notePage];
      } else if (activeMedia) {
        delete docAnnotationsRef.current[`${activeMedia.id}_p${activeMedia.currentPage}`];
      } else {
        delete boardSnapshotsRef.current[boardPage];
      }
    },
    [activeMedia, boardPage, notePage, pushUndoSnapshot]
  );

  // ── Pointer Drawing Engine ──
  const getCanvasPoint = (e, canvas) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / Math.max(1, rect.width);
    const scaleY = canvas.height / Math.max(1, rect.height);
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const handlePointerDown = (pane) => (e) => {
    if (e.button !== undefined && e.button !== 0 && e.pointerType === 'mouse') return;
    const canvas = pane === 'notes' ? notesDrawCanvasRef.current : mainDrawCanvasRef.current;
    if (!canvas) return;
    e.preventDefault();
    canvas.setPointerCapture?.(e.pointerId);

    setActivePane(pane);
    pushUndoSnapshot(pane);

    const pt = getCanvasPoint(e, canvas);
    drawingPaneRef.current = pane;
    lastPointRef.current = pt;

    const ctx = canvas.getContext('2d');
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (tool === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.strokeStyle = 'rgba(0,0,0,1)';
      ctx.lineWidth = eraserSize;
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = penColor;
      ctx.lineWidth = penSize;
    }
    ctx.beginPath();
    ctx.moveTo(pt.x, pt.y);
    ctx.lineTo(pt.x + 0.1, pt.y + 0.1);
    ctx.stroke();
    ctx.restore();
  };

  const handlePointerMove = (pane) => (e) => {
    if (drawingPaneRef.current !== pane) return;
    const canvas = pane === 'notes' ? notesDrawCanvasRef.current : mainDrawCanvasRef.current;
    if (!canvas || !lastPointRef.current) return;
    e.preventDefault();

    const pt = getCanvasPoint(e, canvas);
    const prev = lastPointRef.current;
    const ctx = canvas.getContext('2d');

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (tool === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.strokeStyle = 'rgba(0,0,0,1)';
      ctx.lineWidth = eraserSize;
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = penColor;
      ctx.lineWidth = penSize;
    }
    ctx.beginPath();
    ctx.moveTo(prev.x, prev.y);
    ctx.lineTo(pt.x, pt.y);
    ctx.stroke();
    ctx.restore();

    lastPointRef.current = pt;
  };

  const persistCurrentPaneSnapshot = useCallback(
    (pane) => {
      const canvas = pane === 'notes' ? notesDrawCanvasRef.current : mainDrawCanvasRef.current;
      if (!canvas) return;
      const dataUrl = canvas.toDataURL('image/png');
      if (pane === 'notes') {
        noteSnapshotsRef.current[notePage] = dataUrl;
      } else if (activeMedia) {
        docAnnotationsRef.current[`${activeMedia.id}_p${activeMedia.currentPage}`] = dataUrl;
      } else {
        boardSnapshotsRef.current[boardPage] = dataUrl;
      }
    },
    [activeMedia, boardPage, notePage]
  );

  const handlePointerUp = (pane) => (e) => {
    if (drawingPaneRef.current !== pane) return;
    const canvas = pane === 'notes' ? notesDrawCanvasRef.current : mainDrawCanvasRef.current;
    canvas?.releasePointerCapture?.(e.pointerId);
    drawingPaneRef.current = null;
    lastPointRef.current = null;
    persistCurrentPaneSnapshot(pane);
  };

  useEffect(() => {
    if (!isSplitNotesOpen) return;
    const timer = setTimeout(() => {
      restoreCanvasFromDataUrl(notesDrawCanvasRef.current, noteSnapshotsRef.current[notePage]);
    }, 30);
    return () => clearTimeout(timer);
  }, [isSplitNotesOpen, notePage]);

  // ── Whiteboard Multi-Page Navigation ──
  const switchBoardPage = async (targetPage) => {
    if (targetPage < 1 || targetPage > boardTotalPages || targetPage === boardPage) return;
    persistCurrentPaneSnapshot('main');
    setBoardPage(targetPage);
    mainHistoryRef.current = { undo: [], redo: [] };
    await restoreCanvasFromDataUrl(mainDrawCanvasRef.current, boardSnapshotsRef.current[targetPage]);
  };

  const handleAddBoardPage = async () => {
    persistCurrentPaneSnapshot('main');
    const nextPage = boardTotalPages + 1;
    setBoardTotalPages(nextPage);
    setBoardPage(nextPage);
    mainHistoryRef.current = { undo: [], redo: [] };
    await restoreCanvasFromDataUrl(mainDrawCanvasRef.current, null);
    toast.success(`صفحه ${nextPage} تخته ایجاد شد`);
  };

  // ── Side Notes Multi-Page Navigation ──
  const switchNotePage = async (targetPage) => {
    if (targetPage < 1 || targetPage > noteTotalPages || targetPage === notePage) return;
    persistCurrentPaneSnapshot('notes');
    setNotePage(targetPage);
    notesHistoryRef.current = { undo: [], redo: [] };
    await restoreCanvasFromDataUrl(notesDrawCanvasRef.current, noteSnapshotsRef.current[targetPage]);
  };

  const handleAddNotePage = async () => {
    persistCurrentPaneSnapshot('notes');
    const nextPage = noteTotalPages + 1;
    setNoteTotalPages(nextPage);
    setNotePage(nextPage);
    notesHistoryRef.current = { undo: [], redo: [] };
    await restoreCanvasFromDataUrl(notesDrawCanvasRef.current, null);
  };

  // ── Document Rendering Engine (PDF, Word, PowerPoint) ──
  const renderPaginatedDocPage = useCallback(async (mediaObj, pageNum) => {
    const canvas = docRenderCanvasRef.current;
    if (!canvas || !mediaObj) return;

    try {
      if (mediaObj.type === 'pdf' && pdfDocRef.current) {
        const page = await pdfDocRef.current.getPage(pageNum);
        const unscaled = page.getViewport({ scale: 1 });
        const scale = Math.min(1400 / unscaled.width, 1800 / unscaled.height, 2.2);
        const viewport = page.getViewport({ scale });
        canvas.width = Math.round(viewport.width);
        canvas.height = Math.round(viewport.height);
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: ctx, viewport }).promise;
      } else if (mediaObj.type === 'word' && wordDocRef.current) {
        await wordDocRef.current.renderPage(pageNum, canvas);
      } else if (mediaObj.type === 'pptx' && pptxDocRef.current) {
        const slideCanvas = await pptxDocRef.current.renderSlideCanvas(pageNum - 1);
        canvas.width = slideCanvas.width;
        canvas.height = slideCanvas.height;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(slideCanvas, 0, 0);
      }
    } catch (_err) {
      toast.error(`خطا در نمایش صفحه ${pageNum} فایل`);
    }
  }, []);

  useEffect(() => {
    if (!activeMedia) return;
    if (['pdf', 'word', 'pptx'].includes(activeMedia.type)) {
      renderPaginatedDocPage(activeMedia, activeMedia.currentPage);
    }
  }, [activeMedia, renderPaginatedDocPage]);

  const goToDocPage = async (targetPage) => {
    if (!activeMedia) return;
    if (targetPage < 1 || targetPage > activeMedia.totalPages || targetPage === activeMedia.currentPage) return;

    if (mainDrawCanvasRef.current) {
      docAnnotationsRef.current[`${activeMedia.id}_p${activeMedia.currentPage}`] =
        mainDrawCanvasRef.current.toDataURL('image/png');
    }

    const updated = { ...activeMedia, currentPage: targetPage };
    setActiveMedia(updated);
    mainHistoryRef.current = { undo: [], redo: [] };

    await restoreCanvasFromDataUrl(
      mainDrawCanvasRef.current,
      docAnnotationsRef.current[`${activeMedia.id}_p${targetPage}`]
    );
  };

  // ── Trigger Upload From Device (PDF / Word / PPTX / Video / Image) ──
  const handleTriggerUpload = (kind) => {
    if (kind === 'pdf') pdfInputRef.current?.click();
    else if (kind === 'word') wordInputRef.current?.click();
    else if (kind === 'pptx') pptxInputRef.current?.click();
    else if (kind === 'video') videoInputRef.current?.click();
    else if (kind === 'image') imageInputRef.current?.click();
  };

  const handleCloseMedia = async () => {
    if (activeMedia?.url) {
      URL.revokeObjectURL(activeMedia.url);
    }
    pdfDocRef.current = null;
    wordDocRef.current = null;
    pptxDocRef.current = null;
    imageElRef.current = null;
    setActiveMedia(null);
    setVideoPlaying(false);
    mainHistoryRef.current = { undo: [], redo: [] };
    await restoreCanvasFromDataUrl(mainDrawCanvasRef.current, boardSnapshotsRef.current[boardPage]);
  };

  const handleFileSelected = (kind) => async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    if (!activeMedia) {
      persistCurrentPaneSnapshot('main');
    } else if (activeMedia.url) {
      URL.revokeObjectURL(activeMedia.url);
    }

    setIsLoadingMedia(true);
    const mediaId = `${kind}_${Date.now()}`;

    try {
      pdfDocRef.current = null;
      wordDocRef.current = null;
      pptxDocRef.current = null;
      imageElRef.current = null;
      mainHistoryRef.current = { undo: [], redo: [] };

      if (kind === 'pdf') {
        const arrayBuffer = await file.arrayBuffer();
        const pdfjs = await getPdfJs();
        const pdfDoc = await pdfjs.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
        pdfDocRef.current = pdfDoc;
        setActiveMedia({
          id: mediaId,
          type: 'pdf',
          name: file.name,
          totalPages: pdfDoc.numPages || 1,
          currentPage: 1,
        });
        toast.success(`فایل PDF «${file.name}» (${pdfDoc.numPages} صفحه) باز شد`);
      } else if (kind === 'word') {
        const arrayBuffer = await file.arrayBuffer();
        const wordDoc = await loadWordDocument(arrayBuffer, file.name);
        wordDocRef.current = wordDoc;
        setActiveMedia({
          id: mediaId,
          type: 'word',
          name: file.name,
          totalPages: wordDoc.totalPages || 1,
          currentPage: 1,
        });
        toast.success(`فایل Word «${file.name}» (${wordDoc.totalPages} صفحه) باز شد`);
      } else if (kind === 'pptx') {
        const arrayBuffer = await file.arrayBuffer();
        const pptx = await loadPptxPresentation(arrayBuffer);
        pptxDocRef.current = pptx;
        setActiveMedia({
          id: mediaId,
          type: 'pptx',
          name: file.name,
          totalPages: pptx.numPages || 1,
          currentPage: 1,
        });
        toast.success(`فایل PowerPoint «${file.name}» (${pptx.numPages} اسلاید) باز شد`);
      } else if (kind === 'image') {
        const url = URL.createObjectURL(file);
        const img = await loadImageFromUrl(url);
        imageElRef.current = img;
        setActiveMedia({
          id: mediaId,
          type: 'image',
          name: file.name,
          url,
          totalPages: 1,
          currentPage: 1,
        });
        toast.success(`تصویر «${file.name}» روی تخته قرار گرفت`);
      } else if (kind === 'video') {
        const url = URL.createObjectURL(file);
        setVideoPlaying(false);
        setVideoProgress(0);
        setVideoDuration(0);
        setActiveMedia({
          id: mediaId,
          type: 'video',
          name: file.name,
          url,
          totalPages: 1,
          currentPage: 1,
        });
        toast.success(`ویدیو «${file.name}» آماده پخش روی تخته است`);
      }

      await restoreCanvasFromDataUrl(mainDrawCanvasRef.current, null);
    } catch (err) {
      toast.error(err?.message || 'خطا در باز کردن فایل انتخاب‌شده');
    } finally {
      setIsLoadingMedia(false);
    }
  };

  // ── Video Playback Controls ──
  const toggleVideoPlay = () => {
    const vid = videoElRef.current;
    if (!vid) return;
    if (vid.paused) {
      vid.play().catch(() => {});
      setVideoPlaying(true);
    } else {
      vid.pause();
      setVideoPlaying(false);
    }
  };

  const toggleVideoMute = () => {
    const vid = videoElRef.current;
    if (!vid) return;
    vid.muted = !vid.muted;
    setVideoMuted(vid.muted);
  };

  // ── Composite Frame Renderer (Recording + PNG/PDF Export) ──
  const renderCompositeFrame = useCallback((targetCanvas) => {
    const ctx = targetCanvas.getContext('2d');
    const W = targetCanvas.width;
    const H = targetCanvas.height;
    const { boardType: curBoardType, isSplitNotesOpen: splitOpen, activeMedia: curMedia } = stateRef.current;

    ctx.fillStyle = '#f1f5f9';
    ctx.fillRect(0, 0, W, H);

    const dividerW = splitOpen ? 6 : 0;
    const notesW = splitOpen ? Math.round(W * 0.36) : 0;
    const mainW = W - notesW - dividerW;
    const mainX = splitOpen ? notesW + dividerW : 0;

    // 1. Main Pane
    ctx.save();
    ctx.beginPath();
    ctx.rect(mainX, 0, mainW, H);
    ctx.clip();
    ctx.translate(mainX, 0);
    drawBoardBackground(ctx, mainW, H, curMedia ? 'white' : curBoardType);

    if (curMedia) {
      if (['pdf', 'word', 'pptx'].includes(curMedia.type) && docRenderCanvasRef.current) {
        const dc = docRenderCanvasRef.current;
        if (dc.width > 0 && dc.height > 0) {
          drawContained(ctx, dc, dc.width, dc.height, 16, 16, mainW - 32, H - 32);
        }
      } else if (curMedia.type === 'image' && imageElRef.current) {
        const img = imageElRef.current;
        drawContained(ctx, img, img.naturalWidth, img.naturalHeight, 16, 16, mainW - 32, H - 32);
      } else if (curMedia.type === 'video' && videoElRef.current && videoElRef.current.readyState >= 2) {
        const vid = videoElRef.current;
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, 0, mainW, H);
        drawContained(ctx, vid, vid.videoWidth || 1280, vid.videoHeight || 720, 12, 12, mainW - 24, H - 24);
      }
    }

    if (mainDrawCanvasRef.current) {
      ctx.drawImage(mainDrawCanvasRef.current, 0, 0, mainW, H);
    }
    ctx.restore();

    // 2. Side-by-Side White Note Board (when open)
    if (splitOpen) {
      ctx.fillStyle = '#cbd5e1';
      ctx.fillRect(notesW, 0, dividerW, H);

      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, notesW, H);
      ctx.clip();
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, notesW, H);

      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(0, 0, notesW, 38);
      ctx.strokeStyle = '#e2e8f0';
      ctx.beginPath();
      ctx.moveTo(0, 38);
      ctx.lineTo(notesW, 38);
      ctx.stroke();

      ctx.fillStyle = '#334155';
      ctx.font = '600 15px Vazirmatn, Tahoma, sans-serif';
      ctx.direction = 'rtl';
      ctx.textAlign = 'right';
      ctx.fillText('صفحه سفید نت‌برداری', notesW - 14, 24);

      if (notesDrawCanvasRef.current) {
        ctx.drawImage(notesDrawCanvasRef.current, 0, 38, notesW, H - 38);
      }
      ctx.restore();
    }
  }, []);

  // ── Export & Download (PNG & Multi-Page PDF & Original File) ──
  const handleDownloadPng = () => {
    try {
      const exportCanvas = document.createElement('canvas');
      exportCanvas.width = 1600;
      exportCanvas.height = 900;
      try {
        renderCompositeFrame(exportCanvas);
      } catch (_frameErr) {
        const ctx = exportCanvas.getContext('2d');
        drawBoardBackground(ctx, 1600, 900, boardType);
        if (mainDrawCanvasRef.current) {
          ctx.drawImage(mainDrawCanvasRef.current, 0, 0, 1600, 900);
        }
      }

      const safeTitle = (sessionTitle || 'smartboard').replace(/[\\/:*?"<>|]/g, '_');
      const filename = `${safeTitle}.png`;

      try {
        const dataUrl = exportCanvas.toDataURL('image/png');
        const link = document.createElement('a');
        link.download = filename;
        link.href = dataUrl;
        link.target = '_blank';
        document.body.appendChild(link);
        link.click();
        setTimeout(() => {
          try { document.body.removeChild(link); } catch (_e) {}
        }, 800);
        toast.success('تصویر صفحه تخته (PNG) دانلود شد 🖼️');
      } catch (_secErr) {
        if (mainDrawCanvasRef.current) {
          const link = document.createElement('a');
          link.download = filename;
          link.href = mainDrawCanvasRef.current.toDataURL('image/png');
          link.target = '_blank';
          document.body.appendChild(link);
          link.click();
          setTimeout(() => {
            try { document.body.removeChild(link); } catch (_e) {}
          }, 800);
          toast.success('تصویر نقاشی‌های تخته دانلود شد');
        } else {
          toast.error('خطا در ذخیره تصویر صفحه');
        }
      }
    } catch (_err) {
      toast.error('خطا در ذخیره تصویر صفحه');
    }
  };

  const handleDownloadActiveMedia = () => {
    if (!activeMedia) return;
    try {
      const filename = activeMedia.name || 'smartboard-file';
      if (activeMedia.file) {
        const url = URL.createObjectURL(activeMedia.file);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.target = '_blank';
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
          try { document.body.removeChild(a); } catch (_e) {}
          URL.revokeObjectURL(url);
        }, 1000);
        toast.success(`فایل «${filename}» دانلود شد 📥`);
      } else if (activeMedia.url) {
        const a = document.createElement('a');
        a.href = activeMedia.url;
        a.download = filename;
        a.target = '_blank';
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
          try { document.body.removeChild(a); } catch (_e) {}
        }, 1000);
        toast.success(`فایل «${filename}» دانلود شد 📥`);
      }
    } catch (e) {
      toast.error('خطا در دانلود فایل بازشده');
    }
  };

  const handleDownloadPdf = async () => {
    setIsExporting(true);
    try {
      persistCurrentPaneSnapshot('main');
      if (isSplitNotesOpen) persistCurrentPaneSnapshot('notes');

      const { jsPDF } = await import('jspdf');
      const pdf = new jsPDF({ orientation: 'landscape', unit: 'px', format: [1280, 720] });
      const pageCanvas = document.createElement('canvas');
      pageCanvas.width = 1280;
      pageCanvas.height = 720;
      let hasAddedFirstPage = false;

      const appendCanvasToPdf = (canvas) => {
        if (hasAddedFirstPage) pdf.addPage([1280, 720], 'landscape');
        pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, 1280, 720);
        hasAddedFirstPage = true;
      };

      if (activeMedia) {
        renderCompositeFrame(pageCanvas);
        appendCanvasToPdf(pageCanvas);
      } else {
        const pCtx = pageCanvas.getContext('2d');
        for (let p = 1; p <= boardTotalPages; p += 1) {
          drawBoardBackground(pCtx, 1280, 720, boardType);
          const snap = p === boardPage ? mainDrawCanvasRef.current?.toDataURL('image/png') : boardSnapshotsRef.current[p];
          if (snap) {
            const img = await loadImageFromUrl(snap).catch(() => null);
            if (img) pCtx.drawImage(img, 0, 0, 1280, 720);
          }
          appendCanvasToPdf(pageCanvas);
        }
      }

      const savedNotePageNums = Object.keys(noteSnapshotsRef.current)
        .map(Number)
        .filter((n) => !Number.isNaN(n))
        .sort((a, b) => a - b);
      for (const nPage of savedNotePageNums) {
        if (isSplitNotesOpen && activeMedia && nPage === notePage) continue;
        const snap = noteSnapshotsRef.current[nPage];
        if (!snap) continue;
        const pCtx = pageCanvas.getContext('2d');
        pCtx.fillStyle = '#ffffff';
        pCtx.fillRect(0, 0, 1280, 720);
        const img = await loadImageFromUrl(snap).catch(() => null);
        if (img) drawContained(pCtx, img, img.naturalWidth, img.naturalHeight, 40, 20, 1200, 680);
        appendCanvasToPdf(pageCanvas);
      }

      const safeTitle = (sessionTitle || 'smartboard-notes').replace(/[\\/:*?"<>|]/g, '_');
      pdf.save(`${safeTitle}.pdf`);
      toast.success('فایل کامل PDF با موفقیت ذخیره و دانلود شد');
    } catch (_err) {
      toast.error('خطا در ساخت فایل PDF');
    } finally {
      setIsExporting(false);
    }
  };

  // ── Recording Engine (Composite Canvas + Microphone Audio -> WebM) ──
  const stopRecCleanup = () => {
    if (recTimerRef.current) {
      clearInterval(recTimerRef.current);
      recTimerRef.current = null;
    }
    if (recRafRef.current) {
      cancelAnimationFrame(recRafRef.current);
      recRafRef.current = null;
    }
    recStreamsRef.current.forEach((stream) => stream.getTracks().forEach((t) => t.stop()));
    recStreamsRef.current = [];
  };

  const handleStartRecording = async () => {
    if (typeof window === 'undefined' || typeof MediaRecorder === 'undefined') {
      toast.error('مرورگر شما از قابلیت ضبط ویدیو پشتیبانی نمی‌کند');
      return;
    }

    try {
      const recCanvas = document.createElement('canvas');
      recCanvas.width = REC_CANVAS_W;
      recCanvas.height = REC_CANVAS_H;
      recCanvasRef.current = recCanvas;
      renderCompositeFrame(recCanvas);

      const canvasStream = recCanvas.captureStream(24);
      const tracks = [...canvasStream.getVideoTracks()];
      const activeStreams = [canvasStream];

      if (micEnabled && navigator.mediaDevices?.getUserMedia) {
        try {
          const audioStream = await navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: true, noiseSuppression: true },
          });
          activeStreams.push(audioStream);
          audioStream.getAudioTracks().forEach((t) => tracks.push(t));
        } catch (_micErr) {
          toast('میکروفون در دسترس نبود؛ ضبط تصویر صفحه بدون صدا ادامه می‌یابد', { icon: '🔇' });
        }
      }

      recStreamsRef.current = activeStreams;
      const combinedStream = new MediaStream(tracks);

      const preferredTypes = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
      const mimeType = preferredTypes.find((m) => MediaRecorder.isTypeSupported(m)) || '';

      const recorder = mimeType ? new MediaRecorder(combinedStream, { mimeType }) : new MediaRecorder(combinedStream);
      recChunksRef.current = [];

      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) recChunksRef.current.push(ev.data);
      };

      recorder.onstop = () => {
        stopRecCleanup();
        const blob = new Blob(recChunksRef.current, { type: mimeType || 'video/webm' });
        if (recordedUrl) URL.revokeObjectURL(recordedUrl);
        const url = URL.createObjectURL(blob);
        setRecordedBlob(blob);
        setRecordedUrl(url);
        setRecStatus('idle');
        setShowRecordingModal(true);
        toast.success('ضبط کلاس پایان یافت. می‌توانید ویدیو را ذخیره یا ارسال کنید.');
      };

      mediaRecorderRef.current = recorder;
      recorder.start(250);

      const paintLoop = () => {
        if (recCanvasRef.current && mediaRecorderRef.current?.state !== 'inactive') {
          if (mediaRecorderRef.current?.state === 'recording') {
            renderCompositeFrame(recCanvasRef.current);
          }
          recRafRef.current = requestAnimationFrame(paintLoop);
        }
      };
      recRafRef.current = requestAnimationFrame(paintLoop);

      recSecondsRef.current = 0;
      setRecSeconds(0);
      setRecStatus('recording');
      recTimerRef.current = setInterval(() => {
        if (mediaRecorderRef.current?.state === 'recording') {
          recSecondsRef.current += 1;
          setRecSeconds(recSecondsRef.current);
        }
      }, 1000);
    } catch (_err) {
      stopRecCleanup();
      toast.error('خطا در شروع ضبط ویدیو');
    }
  };

  const handlePauseOrResumeRecording = () => {
    const rec = mediaRecorderRef.current;
    if (!rec) return;
    if (rec.state === 'recording') {
      rec.pause();
      setRecStatus('paused');
    } else if (rec.state === 'paused') {
      rec.resume();
      setRecStatus('recording');
    }
  };

  const handleStopRecording = () => {
    const rec = mediaRecorderRef.current;
    if (!rec || rec.state === 'inactive') return;
    rec.stop();
  };

  if (!hasEnteredBoard) {
    return <BoardEntryPicker userRole={user?.role} onSelectBoard={handleSelectInitialBoard} />;
  }

  const isPaginatedDoc = activeMedia && ['pdf', 'word', 'pptx'].includes(activeMedia.type);

  return (
    <div className={styles.studioShell} data-testid="smartboard-studio">
      <input
        ref={pdfInputRef}
        type="file"
        accept=".pdf,application/pdf"
        className={styles.hiddenInput}
        onChange={handleFileSelected('pdf')}
        data-testid="upload-pdf-input"
      />
      <input
        ref={wordInputRef}
        type="file"
        accept=".docx,.doc,.txt,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        className={styles.hiddenInput}
        onChange={handleFileSelected('word')}
        data-testid="upload-word-input"
      />
      <input
        ref={pptxInputRef}
        type="file"
        accept=".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation"
        className={styles.hiddenInput}
        onChange={handleFileSelected('pptx')}
        data-testid="upload-pptx-input"
      />
      <input
        ref={videoInputRef}
        type="file"
        accept="video/*,.mp4,.webm,.mov"
        className={styles.hiddenInput}
        onChange={handleFileSelected('video')}
        data-testid="upload-video-input"
      />
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        className={styles.hiddenInput}
        onChange={handleFileSelected('image')}
        data-testid="upload-image-input"
      />

      <SmartboardToolbar
        title={sessionTitle}
        boardType={boardType}
        onChangeBoardType={setBoardType}
        tool={tool}
        onSelectTool={setTool}
        penColor={penColor}
        onChangePenColor={setPenColor}
        penSize={penSize}
        onChangePenSize={setPenSize}
        eraserSize={eraserSize}
        onChangeEraserSize={setEraserSize}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onClearActiveBoard={() => clearCanvasPane(activePane === 'notes' && isSplitNotesOpen ? 'notes' : 'main')}
        onTriggerUpload={handleTriggerUpload}
        activeMedia={activeMedia}
        onCloseMedia={handleCloseMedia}
        isSplitNotesOpen={isSplitNotesOpen}
        onToggleSplitNotes={() => setIsSplitNotesOpen((prev) => !prev)}
        boardPage={boardPage}
        boardTotalPages={boardTotalPages}
        onPrevBoardPage={() => switchBoardPage(boardPage - 1)}
        onNextBoardPage={() => switchBoardPage(boardPage + 1)}
        onAddBoardPage={handleAddBoardPage}
        isExporting={isExporting}
        onDownloadPdf={handleDownloadPdf}
        onDownloadPng={handleDownloadPng}
        onDownloadActiveMedia={handleDownloadActiveMedia}
        onExitBoard={() => setHasEnteredBoard(false)}
      />

      <div className={`${styles.workspaceArea} ${isSplitNotesOpen ? styles.workspaceSplit : ''}`}>
        <section
          className={`${styles.mainPane} ${!activeMedia && boardType === 'grid' ? styles.gridSurface : styles.whiteSurface} ${
            activePane === 'main' ? styles.paneFocused : ''
          }`}
          data-testid="main-board-pane"
          data-board-type={boardType}
        >
          {activeMedia && (
            <div className={styles.mediaHeaderBar} data-testid="active-media-bar">
              <div className={styles.mediaNameBadge}>
                <HiOutlineDocumentText />
                <span>{activeMedia.name}</span>
              </div>
              <div className={styles.mediaHeaderActions}>
                {!isSplitNotesOpen && (
                  <button
                    type="button"
                    className={styles.mediaQuickNoteBtn}
                    onClick={() => setIsSplitNotesOpen(true)}
                  >
                    <HiOutlineSquares2X2 />
                    <span>باز کردن صفحه سفید کناری</span>
                  </button>
                )}
                <button
                  type="button"
                  className={styles.mediaCloseBtn}
                  onClick={handleCloseMedia}
                  title="بستن فایل"
                  data-testid="close-media-btn"
                >
                  <HiOutlineXMark />
                  <span>بستن فایل</span>
                </button>
              </div>
            </div>
          )}

          <div className={styles.boardStage}>
            {isLoadingMedia && (
              <div className={styles.loadingOverlay}>در حال آماده‌سازی و نمایش فایل روی تخته...</div>
            )}

            {isPaginatedDoc && (
              <div className={styles.docCanvasWrap}>
                <canvas
                  ref={docRenderCanvasRef}
                  className={styles.docRenderCanvas}
                  data-testid="doc-render-canvas"
                />
              </div>
            )}

            {activeMedia?.type === 'image' && (
              <div className={styles.docCanvasWrap}>
                <img
                  src={activeMedia.url}
                  alt={activeMedia.name}
                  className={styles.mediaImageEl}
                  data-testid="board-uploaded-image"
                />
              </div>
            )}

            {activeMedia?.type === 'video' && (
              <div className={styles.videoStageWrap}>
                <video
                  ref={videoElRef}
                  src={activeMedia.url}
                  crossOrigin="anonymous"
                  className={styles.mediaVideoEl}
                  playsInline
                  onTimeUpdate={(e) => setVideoProgress(e.currentTarget.currentTime)}
                  onLoadedMetadata={(e) => setVideoDuration(e.currentTarget.duration || 0)}
                  onEnded={() => setVideoPlaying(false)}
                  data-testid="board-uploaded-video"
                />
              </div>
            )}

            <canvas
              ref={mainDrawCanvasRef}
              width={MAIN_CANVAS_W}
              height={MAIN_CANVAS_H}
              className={`${styles.drawCanvas} ${tool === 'eraser' ? styles.eraserCursor : styles.penCursor}`}
              onPointerDown={handlePointerDown('main')}
              onPointerMove={handlePointerMove('main')}
              onPointerUp={handlePointerUp('main')}
              onPointerCancel={handlePointerUp('main')}
              data-testid="main-draw-canvas"
            />
          </div>

          {isPaginatedDoc && (
            <div className={styles.docPaginationBar} data-testid="doc-pagination-bar">
              <button
                type="button"
                className={styles.docPageBtn}
                disabled={activeMedia.currentPage <= 1}
                onClick={() => goToDocPage(activeMedia.currentPage - 1)}
                data-testid="doc-prev-page-btn"
              >
                <HiOutlineChevronRight />
                <span>صفحه قبل</span>
              </button>
              <span className={styles.docPageCounter} data-testid="doc-page-indicator">
                صفحه {activeMedia.currentPage} از {activeMedia.totalPages}
              </span>
              <button
                type="button"
                className={styles.docPageBtn}
                disabled={activeMedia.currentPage >= activeMedia.totalPages}
                onClick={() => goToDocPage(activeMedia.currentPage + 1)}
                data-testid="doc-next-page-btn"
              >
                <span>صفحه بعد</span>
                <HiOutlineChevronLeft />
              </button>
            </div>
          )}

          {activeMedia?.type === 'video' && (
            <div className={styles.videoControlsBar} data-testid="board-video-controls">
              <button type="button" className={styles.vidCtrlBtn} onClick={toggleVideoPlay}>
                {videoPlaying ? <HiOutlinePause /> : <HiOutlinePlay />}
                <span>{videoPlaying ? 'توقف' : 'پخش'}</span>
              </button>
              <input
                type="range"
                min={0}
                max={Math.max(1, videoDuration)}
                step={0.1}
                value={videoProgress}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  if (videoElRef.current) videoElRef.current.currentTime = val;
                  setVideoProgress(val);
                }}
                className={styles.vidSeekSlider}
                aria-label="جابجایی زمان ویدیو"
              />
              <button type="button" className={styles.vidCtrlBtn} onClick={toggleVideoMute}>
                {videoMuted ? <HiOutlineSpeakerXMark /> : <HiOutlineSpeakerWave />}
              </button>
            </div>
          )}
        </section>

        {isSplitNotesOpen && (
          <aside
            className={`${styles.notesPane} ${activePane === 'notes' ? styles.paneFocused : ''}`}
            data-testid="split-notes-pane"
          >
            <div className={styles.notesHeader}>
              <div className={styles.notesHeaderTitle}>
                <span>صفحه سفید نت‌برداری</span>
              </div>
              <div className={styles.notesHeaderActions}>
                <button
                  type="button"
                  className={styles.noteMiniBtn}
                  disabled={notePage <= 1}
                  onClick={() => switchNotePage(notePage - 1)}
                  title="صفحه قبلی نت"
                  aria-label="صفحه قبلی نت"
                >
                  <HiOutlineChevronRight />
                </button>
                <span className={styles.notePageLabel}>
                  نت {notePage}/{noteTotalPages}
                </span>
                <button
                  type="button"
                  className={styles.noteMiniBtn}
                  disabled={notePage >= noteTotalPages}
                  onClick={() => switchNotePage(notePage + 1)}
                  title="صفحه بعدی نت"
                  aria-label="صفحه بعدی نت"
                >
                  <HiOutlineChevronLeft />
                </button>
                <button
                  type="button"
                  className={styles.noteMiniBtn}
                  onClick={handleAddNotePage}
                  title="صفحه جدید نت"
                  aria-label="صفحه جدید نت"
                >
                  <HiOutlinePlus />
                </button>
                <button
                  type="button"
                  className={styles.noteMiniBtn}
                  onClick={() => clearCanvasPane('notes')}
                  title="پاک کردن صفحه نت"
                  aria-label="پاک کردن صفحه نت"
                >
                  <HiOutlineTrash />
                </button>
                <button
                  type="button"
                  className={styles.noteMiniBtn}
                  onClick={() => setIsSplitNotesOpen(false)}
                  title="بستن صفحه نت"
                  aria-label="بستن صفحه نت"
                >
                  <HiOutlineXMark />
                </button>
              </div>
            </div>

            <div className={styles.notesCanvasWrap}>
              <canvas
                ref={notesDrawCanvasRef}
                width={NOTE_CANVAS_W}
                height={NOTE_CANVAS_H}
                className={`${styles.notesCanvas} ${tool === 'eraser' ? styles.eraserCursor : styles.penCursor}`}
                onPointerDown={handlePointerDown('notes')}
                onPointerMove={handlePointerMove('notes')}
                onPointerUp={handlePointerUp('notes')}
                onPointerCancel={handlePointerUp('notes')}
                data-testid="notes-canvas"
              />
            </div>
          </aside>
        )}
      </div>

      <SmartboardRecorderBar
        recStatus={recStatus}
        recSeconds={recSeconds}
        micEnabled={micEnabled}
        onToggleMic={() => setMicEnabled((prev) => !prev)}
        onStartRecording={handleStartRecording}
        onPauseOrResume={handlePauseOrResumeRecording}
        onStopRecording={handleStopRecording}
        hasFinishedRecording={Boolean(recordedUrl)}
        onOpenRecordingModal={() => setShowRecordingModal(true)}
      />

      <RecordingActionModal
        isOpen={showRecordingModal}
        onClose={() => setShowRecordingModal(false)}
        recordedBlob={recordedBlob}
        recordedUrl={recordedUrl}
        durationSeconds={recSeconds}
        defaultTitle={sessionTitle}
        userRole={user?.role}
      />
    </div>
  );
}
