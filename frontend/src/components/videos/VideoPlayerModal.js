'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import {
  HiOutlineXMark,
  HiOutlineArrowDownTray,
  HiOutlineArrowsPointingOut,
  HiOutlineArrowsPointingIn,
  HiOutlinePlus,
  HiOutlineTrash,
  HiOutlineEye,
  HiOutlineEyeSlash,
  HiOutlineCog6Tooth,
  HiOutlineAcademicCap,
  HiOutlineFolder,
} from 'react-icons/hi2';
import { FaFilePdf } from 'react-icons/fa';
import api, { getApiBaseUrl } from '@/lib/api';
import styles from '@/app/dashboard/videos/videos.module.css';

const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

function buildAuthedUrl(relativePath) {
  if (!relativePath) return '';
  if (relativePath.startsWith('http://') || relativePath.startsWith('https://')) {
    return relativePath;
  }
  const apiBase = getApiBaseUrl().replace(/\/api\/v1\/?$/, '');
  const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : '';
  const sep = relativePath.includes('?') ? '&' : '?';
  return `${apiBase}${relativePath}${token ? `${sep}token=${encodeURIComponent(token)}` : ''}`;
}

export default function VideoPlayerModal({
  video,
  canManage,
  onClose,
  onVideoUpdated,
  onDownloadVideo,
}) {
  const videoRef = useRef(null);
  const playerWrapperRef = useRef(null);
  const pdfInputRef = useRef(null);

  const [playbackRate, setPlaybackRate] = useState(() => {
    if (typeof window === 'undefined') return 1;
    const saved = Number(localStorage.getItem('educonnect_playback_rate'));
    return PLAYBACK_RATES.includes(saved) ? saved : 1;
  });

  const qualities =
    Array.isArray(video?.qualities) && video.qualities.length > 0
      ? video.qualities
      : [{ label: 'اصلی (خودکار)', key: 'original', stream_url: video?.stream_url || `/api/v1/videos/${video?.id}/stream` }];

  const [selectedQualityKey, setSelectedQualityKey] = useState(qualities[0].key);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [previewPdfId, setPreviewPdfId] = useState(null);
  const [isUploadingPdf, setIsUploadingPdf] = useState(false);
  const [deletingPdfId, setDeletingPdfId] = useState(null);

  const currentQuality = qualities.find((q) => q.key === selectedQualityKey) || qualities[0];
  const streamSrc = buildAuthedUrl(currentQuality?.stream_url || `/api/v1/videos/${video?.id}/stream`);

  // Apply playbackRate whenever video element or rate changes
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.playbackRate = playbackRate;
    }
    if (typeof window !== 'undefined') {
      localStorage.setItem('educonnect_playback_rate', String(playbackRate));
    }
  }, [playbackRate, selectedQualityKey]);

  // Listen to browser fullscreen changes
  useEffect(() => {
    const handleFsChange = () => {
      const fsEl =
        document.fullscreenElement ||
        document.webkitFullscreenElement ||
        document.mozFullScreenElement ||
        document.msFullscreenElement;
      setIsFullscreen(Boolean(fsEl));
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    document.addEventListener('webkitfullscreenchange', handleFsChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFsChange);
      document.removeEventListener('webkitfullscreenchange', handleFsChange);
    };
  }, []);

  // Keyboard shortcuts: Esc to close (when not fullscreen), F for fullscreen
  const toggleFullscreen = useCallback(async () => {
    try {
      const target = playerWrapperRef.current || videoRef.current;
      if (!target) return;
      const fsEl = document.fullscreenElement || document.webkitFullscreenElement;
      if (!fsEl) {
        if (target.requestFullscreen) {
          await target.requestFullscreen();
        } else if (target.webkitRequestFullscreen) {
          target.webkitRequestFullscreen();
        } else if (videoRef.current?.webkitEnterFullscreen) {
          videoRef.current.webkitEnterFullscreen();
        }
      } else {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        } else if (document.webkitExitFullscreen) {
          document.webkitExitFullscreen();
        }
      }
    } catch {
      toast.error('امکان تغییر حالت تمام‌صفحه در این مرورگر وجود ندارد.');
    }
  }, []);

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
      if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        toggleFullscreen();
      } else if (e.key === 'Escape' && !document.fullscreenElement) {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, toggleFullscreen]);

  // Seamless quality switching preserving currentTime & play state
  const handleQualityChange = (newKey) => {
    if (newKey === selectedQualityKey) return;
    const vidEl = videoRef.current;
    const prevTime = vidEl ? vidEl.currentTime : 0;
    const wasPlaying = vidEl ? !vidEl.paused : false;

    setSelectedQualityKey(newKey);

    setTimeout(() => {
      const el = videoRef.current;
      if (!el) return;
      const restore = () => {
        try {
          el.currentTime = prevTime;
          el.playbackRate = playbackRate;
          if (wasPlaying) el.play().catch(() => {});
        } catch {
          // ignore seek error on initial load
        }
        el.removeEventListener('loadedmetadata', restore);
      };
      el.addEventListener('loadedmetadata', restore);
    }, 0);
  };

  const handleAttachPdfFiles = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const formData = new FormData();
    files.forEach((file) => formData.append('pdfs', file));

    setIsUploadingPdf(true);
    try {
      const res = await api.post(`/videos/${video.id}/pdf`, formData);
      if (res.data?.data?.video) {
        onVideoUpdated(res.data.data.video);
        toast.success('فایل PDF با موفقیت به پایین ویدیو اضافه شد.');
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'خطا در آپلود فایل PDF');
    } finally {
      setIsUploadingPdf(false);
      if (pdfInputRef.current) pdfInputRef.current.value = '';
    }
  };

  const handleDeletePdf = async (pdfId) => {
    if (!window.confirm('آیا از حذف این فایل PDF مطمئن هستید؟')) return;
    setDeletingPdfId(pdfId);
    try {
      const res = await api.delete(`/videos/${video.id}/pdf/${pdfId}`);
      if (res.data?.data?.video) {
        if (previewPdfId === pdfId) setPreviewPdfId(null);
        onVideoUpdated(res.data.data.video);
        toast.success('فایل PDF حذف شد.');
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'خطا در حذف فایل PDF');
    } finally {
      setDeletingPdfId(null);
    }
  };

  const handleDownloadPdf = async (pdf) => {
    try {
      const res = await api.get(`/videos/${video.id}/pdf/${pdf.id}/download`, {
        responseType: 'blob',
      });
      const blobUrl = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = pdf.file_name || 'attachment.pdf';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(blobUrl);
    } catch {
      toast.error('خطا در دانلود فایل PDF');
    }
  };

  if (!video) return null;

  const pdfList = Array.isArray(video.pdfs) ? video.pdfs : [];

  return (
    <div className={styles.modalOverlay} onClick={onClose} dir="rtl">
      <div className={styles.playerModal} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className={styles.playerModalHeader}>
          <div>
            <h2 className={styles.playerTitle}>{video.title}</h2>
            <div className={styles.playerMetaRow}>
              {Array.isArray(video.folders) &&
                video.folders.map((f) => (
                  <span key={f.name} className={styles.metaChip}>
                    <HiOutlineFolder /> {f.name}
                  </span>
                ))}
              {Array.isArray(video.target_classes) &&
                video.target_classes.map((c) => (
                  <span key={c.id} className={styles.classChip}>
                    <HiOutlineAcademicCap /> {c.name}
                    {c.grade ? ` (${c.grade})` : ''}
                  </span>
                ))}
            </div>
          </div>
          <button type="button" className={styles.iconCloseBtn} onClick={onClose} aria-label="بستن">
            <HiOutlineXMark />
          </button>
        </div>

        {/* Video Player + Controls Bar */}
        <div ref={playerWrapperRef} className={styles.playerStage}>
          <video
            ref={videoRef}
            key={streamSrc}
            src={streamSrc}
            controls
            controlsList=""
            playsInline
            className={styles.videoElement}
            onLoadedMetadata={() => {
              if (videoRef.current) videoRef.current.playbackRate = playbackRate;
            }}
          />

          <div className={styles.playerControlBar}>
            {/* Speed Control */}
            <div className={styles.controlGroup}>
              <span className={styles.controlLabel}>سرعت پخش:</span>
              <div className={styles.speedPillRow}>
                {PLAYBACK_RATES.map((rate) => (
                  <button
                    key={rate}
                    type="button"
                    className={`${styles.speedPill} ${playbackRate === rate ? styles.speedPillActive : ''}`}
                    onClick={() => setPlaybackRate(rate)}
                  >
                    {rate}x
                  </button>
                ))}
              </div>
            </div>

            {/* Quality Selector + Fullscreen + Download */}
            <div className={styles.controlGroup}>
              <label className={styles.qualitySelectWrap}>
                <HiOutlineCog6Tooth />
                <span>کیفیت:</span>
                <select
                  value={selectedQualityKey}
                  onChange={(e) => handleQualityChange(e.target.value)}
                  className={styles.qualitySelect}
                >
                  {qualities.map((q) => (
                    <option key={q.key} value={q.key}>
                      {q.label}
                    </option>
                  ))}
                </select>
              </label>

              <button
                type="button"
                className={styles.playerActionBtn}
                onClick={toggleFullscreen}
                title="تغییر حالت تمام‌صفحه (کلید F)"
              >
                {isFullscreen ? <HiOutlineArrowsPointingIn /> : <HiOutlineArrowsPointingOut />}
                <span>{isFullscreen ? 'خروج از تمام‌صفحه' : 'تمام‌صفحه'}</span>
              </button>

              <button
                type="button"
                className={`${styles.playerActionBtn} ${styles.downloadBtn}`}
                onClick={() => onDownloadVideo(video)}
              >
                <HiOutlineArrowDownTray />
                <span>دانلود ویدیو</span>
              </button>
            </div>
          </div>
        </div>

        {/* Description */}
        {video.description && (
          <div className={styles.videoDescBox}>
            <p>{video.description}</p>
          </div>
        )}

        {/* Attached PDFs Section Underneath Video */}
        <div className={styles.pdfSection}>
          <div className={styles.pdfSectionHeader}>
            <h3 className={styles.pdfSectionTitle}>
              <FaFilePdf className={styles.pdfIconRed} />
              جزوه‌ها و فایل‌های PDF پیوست ({pdfList.length})
            </h3>
            {canManage && (
              <div>
                <input
                  ref={pdfInputRef}
                  type="file"
                  accept="application/pdf,.pdf"
                  multiple
                  hidden
                  onChange={handleAttachPdfFiles}
                />
                <button
                  type="button"
                  className={styles.addPdfInlineBtn}
                  onClick={() => pdfInputRef.current?.click()}
                  disabled={isUploadingPdf}
                >
                  <HiOutlinePlus />
                  <span>{isUploadingPdf ? 'در حال آپلود...' : 'افزودن فایل PDF'}</span>
                </button>
              </div>
            )}
          </div>

          {pdfList.length === 0 ? (
            <p className={styles.emptyPdfText}>
              هنوز فایل PDF برای این ویدیو ثبت نشده است.
            </p>
          ) : (
            <div className={styles.pdfList}>
              {pdfList.map((pdf) => {
                const isPreviewing = previewPdfId === pdf.id;
                const viewUrl = buildAuthedUrl(pdf.view_url || `/api/v1/videos/${video.id}/pdf/${pdf.id}/view`);
                return (
                  <div key={pdf.id} className={styles.pdfCard}>
                    <div className={styles.pdfCardTop}>
                      <div className={styles.pdfInfo}>
                        <FaFilePdf className={styles.pdfIconRed} />
                        <span className={styles.pdfFileName}>{pdf.file_name}</span>
                      </div>
                      <div className={styles.pdfCardActions}>
                        <button
                          type="button"
                          className={styles.pdfBtnSecondary}
                          onClick={() => setPreviewPdfId(isPreviewing ? null : pdf.id)}
                        >
                          {isPreviewing ? <HiOutlineEyeSlash /> : <HiOutlineEye />}
                          <span>{isPreviewing ? 'بستن پیش‌نمایش' : 'مشاهده آنلاین'}</span>
                        </button>
                        <button
                          type="button"
                          className={styles.pdfBtnPrimary}
                          onClick={() => handleDownloadPdf(pdf)}
                        >
                          <HiOutlineArrowDownTray />
                          <span>دانلود PDF</span>
                        </button>
                        {canManage && pdf.id !== 'legacy' && (
                          <button
                            type="button"
                            className={styles.pdfBtnDanger}
                            onClick={() => handleDeletePdf(pdf.id)}
                            disabled={deletingPdfId === pdf.id}
                            title="حذف PDF"
                          >
                            <HiOutlineTrash />
                          </button>
                        )}
                      </div>
                    </div>

                    {isPreviewing && (
                      <div className={styles.pdfViewerFrameWrap}>
                        <iframe
                          src={viewUrl}
                          title={pdf.file_name}
                          className={styles.pdfViewerFrame}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
