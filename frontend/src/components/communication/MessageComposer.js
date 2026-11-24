'use client';

import { useRef } from 'react';
import {
  HiOutlinePaperAirplane,
  HiOutlineCheck,
  HiOutlinePaperClip,
  HiOutlineMicrophone,
  HiOutlineTrash,
  HiOutlinePencilSquare,
  HiOutlineXMark,
  HiOutlinePhoto,
  HiOutlineFilm,
} from 'react-icons/hi2';
import { classifyAttachment, isSafeMediaUrl } from './MessageAttachments';

export default function MessageComposer({
  styles,
  editingMessage,
  cancelEditing,
  attachedFiles,
  removeAttachment,
  isRecording,
  recordingDuration,
  formatDuration,
  cancelRecording,
  stopAndSendRecording,
  isUploadingVoice,
  uploadingFile,
  startRecording,
  onUploadFiles,
  newMessageText,
  setNewMessageText,
  onSubmit,
  sending,
  placeholder,
  recordingHint,
}) {
  const imageInputRef = useRef(null);
  const videoInputRef = useRef(null);
  const fileInputRef = useRef(null);

  const handlePickerChange = (e) => {
    onUploadFiles(e);
    if (e.target) {
      e.target.value = '';
    }
  };

  const canSend = !sending && !uploadingFile && (Boolean(newMessageText.trim()) || attachedFiles.length > 0);

  return (
    <div className={styles.inputBarContainer}>
      {editingMessage && (
        <div className={styles.editingBanner}>
          <div className={styles.editingInfo}>
            <HiOutlinePencilSquare className={styles.editingIcon} />
            <span className={styles.editingLabel}>ویرایش پیام:</span>
            <span className={styles.editingPreview}>{editingMessage.content || '...'}</span>
          </div>
          <button
            type="button"
            className={styles.cancelEditBtn}
            onClick={cancelEditing}
            title="انصراف از ویرایش"
          >
            <HiOutlineXMark />
            <span>انصراف</span>
          </button>
        </div>
      )}

      {attachedFiles.length > 0 && (
        <div className={styles.attachedFilesPreview}>
          {attachedFiles.map((f, i) => {
            const mediaType = classifyAttachment(f);
            const label = f.originalname || f.name || 'فایل';
            return (
              <div key={`${f.url || label}-${i}`} className={styles.previewThumbCard}>
                {mediaType === 'image' && isSafeMediaUrl(f.url) ? (
                  <img src={f.url} alt={label} className={styles.previewThumbImg} />
                ) : (
                  <span className={styles.previewTypeIcon}>
                    {mediaType === 'video' ? '🎬' : mediaType === 'audio' ? '🎙️' : '📎'}
                  </span>
                )}
                <span className={styles.previewChipName}>{label}</span>
                <button
                  type="button"
                  className={styles.previewRemoveBtn}
                  onClick={() => removeAttachment(i)}
                  aria-label={`حذف پیوست ${label}`}
                >
                  <HiOutlineXMark />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {isRecording ? (
        <div className={styles.recordingBar}>
          <div className={styles.recordingStatus}>
            <span className={styles.recordingDot} />
            <span className={styles.recordingTimer}>{formatDuration(recordingDuration)}</span>
            <span className={styles.recordingHint}>{recordingHint || 'در حال ضبط پیام صوتی (ویس)...'}</span>
          </div>
          <div className={styles.recordingControls}>
            <button
              type="button"
              className={styles.cancelRecordBtn}
              onClick={cancelRecording}
              title="لغو ضبط ویس"
            >
              <HiOutlineTrash />
              <span>لغو</span>
            </button>
            <button
              type="button"
              className={styles.sendRecordBtn}
              onClick={stopAndSendRecording}
              disabled={isUploadingVoice}
              title="توقف و ارسال ویس"
            >
              <HiOutlinePaperAirplane style={{ transform: 'rotate(180deg)' }} />
              <span>{isUploadingVoice ? 'در حال ارسال...' : 'ارسال ویس'}</span>
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={onSubmit} className={styles.inputBar}>
          <input
            type="file"
            ref={imageInputRef}
            accept="image/*"
            style={{ display: 'none' }}
            multiple
            onChange={handlePickerChange}
            data-testid="upload-image-input"
          />
          <input
            type="file"
            ref={videoInputRef}
            accept="video/*"
            style={{ display: 'none' }}
            onChange={handlePickerChange}
            data-testid="upload-video-input"
          />
          <input
            type="file"
            ref={fileInputRef}
            accept="audio/*,.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.zip,.txt"
            style={{ display: 'none' }}
            multiple
            onChange={handlePickerChange}
            data-testid="upload-file-input"
          />

          <div className={styles.composerMediaTools}>
            <button
              type="button"
              className={styles.attachBtn}
              onClick={() => imageInputRef.current?.click()}
              disabled={uploadingFile || isRecording}
              title="ارسال عکس"
              aria-label="ارسال عکس"
            >
              <HiOutlinePhoto />
            </button>
            <button
              type="button"
              className={styles.attachBtn}
              onClick={() => videoInputRef.current?.click()}
              disabled={uploadingFile || isRecording}
              title="ارسال ویدیو"
              aria-label="ارسال ویدیو"
            >
              <HiOutlineFilm />
            </button>
            <button
              type="button"
              className={styles.micBtn}
              onClick={startRecording}
              disabled={uploadingFile || isUploadingVoice}
              title="ضبط و ارسال ویس"
              aria-label="ضبط پیام صوتی"
            >
              <HiOutlineMicrophone />
            </button>
            <button
              type="button"
              className={styles.attachBtn}
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingFile || isRecording}
              title="پیوست فایل یا صوت"
              aria-label="پیوست فایل"
            >
              <HiOutlinePaperClip />
            </button>
          </div>

          <input
            type="text"
            className={styles.messageInput}
            placeholder={
              uploadingFile
                ? 'در حال بارگذاری رسانه...'
                : editingMessage
                ? 'ویرایش متن پیام...'
                : placeholder
            }
            value={newMessageText}
            onChange={(e) => setNewMessageText(e.target.value)}
            data-testid="chat-message-input"
          />

          <button
            type="submit"
            className={styles.sendBtn}
            disabled={!canSend}
            title={editingMessage ? 'ذخیره تغییرات' : 'ارسال پیام'}
            aria-label={editingMessage ? 'ذخیره تغییرات پیام' : 'ارسال پیام'}
            data-testid="chat-send-btn"
            style={
              editingMessage
                ? { background: 'linear-gradient(135deg, #10b981, #059669)' }
                : !canSend
                ? { opacity: 0.55, cursor: 'not-allowed' }
                : {}
            }
          >
            {editingMessage ? (
              <HiOutlineCheck style={{ fontSize: '1.25rem' }} />
            ) : (
              <HiOutlinePaperAirplane style={{ transform: 'rotate(180deg)' }} />
            )}
          </button>
        </form>
      )}
    </div>
  );
}
