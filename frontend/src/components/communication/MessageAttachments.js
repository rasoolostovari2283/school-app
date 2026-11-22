'use client';

import { HiOutlineDocumentArrowDown } from 'react-icons/hi2';

const SAFE_UPLOAD_URL_RE = /^(\/uploads\/[a-zA-Z0-9._-]+|blob:[^\s]+)$/;

export function isSafeMediaUrl(url) {
  if (!url || typeof url !== 'string') return false;
  return SAFE_UPLOAD_URL_RE.test(url.trim());
}

export function classifyAttachment(file) {
  if (!file || typeof file !== 'object') return 'file';
  if (file.media_type && ['image', 'video', 'audio', 'file'].includes(file.media_type)) {
    return file.media_type;
  }

  const mime = String(file.mimetype || file.mime || '').toLowerCase();
  const url = String(file.url || '').toLowerCase();
  const name = String(file.originalname || file.name || '').toLowerCase();
  const combined = `${url} ${name}`;

  if (mime.startsWith('image/')) return 'image';
  if (file.is_voice || mime.startsWith('audio/')) return 'audio';
  if (file.is_video || mime.startsWith('video/')) return 'video';

  if (/\.(png|jpe?g|gif|webp|bmp|avif)(\?|$|\s)/i.test(combined)) return 'image';
  if (/voice[_-]?/i.test(combined) && /\.webm(\?|$|\s)/i.test(combined)) return 'audio';
  if (/\.(mp3|ogg|wav|m4a|aac|opus)(\?|$|\s)/i.test(combined)) return 'audio';
  if (/\.(mp4|mkv|mov|m4v|avi|webm)(\?|$|\s)/i.test(combined)) return 'video';

  return 'file';
}

export default function MessageAttachments({ attachments = [], styles, onPreviewImage }) {
  if (!Array.isArray(attachments) || attachments.length === 0) return null;

  const validFiles = attachments.filter((f) => f && isSafeMediaUrl(f.url));
  if (validFiles.length === 0) return null;

  return (
    <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {validFiles.map((file, idx) => {
        const mediaType = classifyAttachment(file);
        const label = file.originalname || file.name || 'فایل پیوست';

        if (mediaType === 'image') {
          return (
            <div key={`${file.url}-${idx}`} className={styles.mediaImageWrap}>
              <button
                type="button"
                className={styles.mediaImageBtn}
                onClick={() => onPreviewImage && onPreviewImage({ url: file.url, title: label })}
                aria-label={`بزرگنمایی تصویر ${label}`}
              >
                <img
                  src={file.url}
                  alt={label}
                  className={styles.mediaImage}
                  loading="lazy"
                  data-testid="chat-image-attachment"
                />
              </button>
              <div className={styles.mediaCaptionRow}>
                <span>🖼️ {label}</span>
                <a
                  href={file.url}
                  download={label}
                  className={styles.mediaDownloadLink}
                  title="دانلود تصویر"
                >
                  دانلود
                </a>
              </div>
            </div>
          );
        }

        if (mediaType === 'video') {
          return (
            <div key={`${file.url}-${idx}`} className={styles.mediaVideoWrap}>
              <video
                controls
                src={file.url}
                className={styles.mediaVideo}
                preload="metadata"
                data-testid="chat-video-attachment"
              />
              <div className={styles.mediaCaptionRow}>
                <span>🎬 {label}</span>
                <a
                  href={file.url}
                  download={label}
                  className={styles.mediaDownloadLink}
                  title="دانلود ویدیو"
                >
                  دانلود
                </a>
              </div>
            </div>
          );
        }

        if (mediaType === 'audio') {
          return (
            <div key={`${file.url}-${idx}`} className={styles.voicePlayerCard}>
              <div className={styles.voicePlayerHeader}>
                <span className={styles.voicePlayerIcon}>🎙️</span>
                <span className={styles.voicePlayerTitle}>
                  {file.is_voice ? 'پیام صوتی (ویس)' : label}
                </span>
              </div>
              <audio
                controls
                src={file.url}
                className={styles.voiceAudioElement}
                preload="metadata"
                data-testid="chat-audio-attachment"
              />
            </div>
          );
        }

        return (
          <a
            key={`${file.url}-${idx}`}
            href={file.url}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.attachmentCard}
          >
            <HiOutlineDocumentArrowDown style={{ fontSize: '1.25rem', color: '#38bdf8', flexShrink: 0 }} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
          </a>
        );
      })}
    </div>
  );
}
