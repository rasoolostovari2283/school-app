'use client';

import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import {
  HiOutlineXMark,
  HiOutlineArrowDownTray,
  HiOutlinePaperAirplane,
  HiOutlinePlayCircle,
  HiOutlineFolder,
  HiOutlineFolderPlus,
  HiOutlineMagnifyingGlass,
  HiOutlineCheckCircle,
  HiOutlineUserGroup,
} from 'react-icons/hi2';
import api from '../../lib/api';
import styles from '../../app/dashboard/record/record.module.css';

function formatDuration(sec) {
  const m = Math.floor((sec || 0) / 60);
  const s = (sec || 0) % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export default function RecordingActionModal({
  isOpen,
  onClose,
  recordedBlob,
  recordedUrl,
  durationSeconds,
  defaultTitle,
  userRole,
}) {
  const isTeacherOrAdmin = ['teacher', 'admin', 'manager'].includes(String(userRole || '').toLowerCase());
  const [activeAction, setActiveAction] = useState('save'); // 'save' | 'messages' | 'videos'
  const [videoTitle, setVideoTitle] = useState(defaultTitle || 'ویدیو ضبط‌شده تخته هوشمند');

  // Share to Messages state
  const [contacts, setContacts] = useState([]);
  const [groups, setGroups] = useState([]);
  const [shareSearch, setShareSearch] = useState('');
  const [selectedTarget, setSelectedTarget] = useState(null); // { type: 'user'|'group', id, name, username }
  const [caption, setCaption] = useState('ویدیوی ضبط‌شده از تخته هوشمند 🎬');
  const [sendingMessage, setSendingMessage] = useState(false);
  const [loadingDirectory, setLoadingDirectory] = useState(false);

  // Publish to Videos (Teacher only) state
  const [folders, setFolders] = useState([
    { name: 'تخته هوشمند', color: '#8b5cf6' },
    { name: 'عمومی', color: '#6366f1' },
  ]);
  const [selectedFolder, setSelectedFolder] = useState('تخته هوشمند');
  const [creatingNewFolder, setCreatingNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [publishingVideo, setPublishingVideo] = useState(false);
  const [publishedSuccess, setPublishedSuccess] = useState(null);

  useEffect(() => {
    if (!isOpen) return;
    setVideoTitle(defaultTitle || 'ویدیو ضبط‌شده تخته هوشمند');
    setPublishedSuccess(null);
    setSelectedTarget(null);
    setActiveAction('save');
  }, [isOpen, defaultTitle]);

  useEffect(() => {
    if (!isOpen) return;
    if (activeAction === 'messages') {
      setLoadingDirectory(true);
      Promise.all([
        api.get('/messages/directory').catch(() => ({ data: { data: {} } })),
        api.get('/messages/conversations').catch(() => ({ data: { data: {} } })),
      ])
        .then(([dirRes, convRes]) => {
          const allContacts = dirRes.data?.data?.all || dirRes.data?.data?.default_contacts || [];
          setContacts(Array.isArray(allContacts) ? allContacts : []);
          const convs = convRes.data?.data?.conversations || [];
          const grpList = convs.filter((c) => c.type === 'group' || c.is_group);
          setGroups(grpList);
        })
        .finally(() => setLoadingDirectory(false));
    } else if (activeAction === 'videos' && isTeacherOrAdmin) {
      api
        .get('/videos/folders')
        .then((res) => {
          const list = res.data?.data?.folders || [];
          if (Array.isArray(list) && list.length > 0) {
            setFolders(list);
          }
        })
        .catch(() => {});
    }
  }, [isOpen, activeAction, isTeacherOrAdmin]);

  if (!isOpen || !recordedUrl) return null;

  const handleDownloadToDevice = () => {
    const safeName = (videoTitle || 'smartboard-recording').replace(/[\\/:*?"<>|]/g, '_');
    const a = document.createElement('a');
    a.href = recordedUrl;
    a.download = `${safeName}.webm`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    toast.success('ویدیو ضبط‌شده با موفقیت روی دستگاه ذخیره شد');
  };

  const handleSendToMessages = async () => {
    if (!recordedBlob) return;
    if (!selectedTarget) {
      toast.error('لطفاً یک مخاطب یا گروه برای ارسال انتخاب کنید');
      return;
    }

    setSendingMessage(true);
    try {
      const safeFileName = `${(videoTitle || 'smartboard').replace(/[^a-zA-Z0-9_\u0600-\u06FF-]/g, '_')}.webm`;
      const formData = new FormData();
      formData.append('file', recordedBlob, safeFileName);
      const uploadRes = await api.post('/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      const uploaded = uploadRes.data?.data?.file || uploadRes.data?.data?.files?.[0];
      if (!uploaded?.url) {
        throw new Error('خطا در بارگذاری فایل ویدیو');
      }

      const attachment = {
        url: uploaded.url,
        originalname: uploaded.originalname || safeFileName,
        mimetype: uploaded.mimetype || 'video/webm',
        size: uploaded.size || recordedBlob.size,
        media_type: 'video',
      };

      if (selectedTarget.type === 'group') {
        await api.post(`/messages/groups/${selectedTarget.id}/messages`, {
          content: caption.trim() || videoTitle,
          attachments: [attachment],
        });
      } else {
        await api.post('/messages', {
          receiver_id: selectedTarget.id,
          content: caption.trim() || videoTitle,
          attachments: [attachment],
        });
      }

      toast.success(`ویدیو با موفقیت برای «${selectedTarget.name}» در بخش پیام‌ها ارسال شد`);
      setSelectedTarget(null);
    } catch (err) {
      toast.error(err?.response?.data?.message || err.message || 'خطا در ارسال ویدیو در پیام‌ها');
    } finally {
      setSendingMessage(false);
    }
  };

  const handlePublishToVideos = async () => {
    if (!recordedBlob || !isTeacherOrAdmin) return;
    const finalFolder = creatingNewFolder ? newFolderName.trim() : selectedFolder.trim();
    if (!finalFolder) {
      toast.error('لطفاً نام پوشه ویدیویی را انتخاب یا وارد کنید');
      return;
    }
    if (!videoTitle.trim()) {
      toast.error('لطفاً عنوان ویدیو را وارد کنید');
      return;
    }

    setPublishingVideo(true);
    try {
      if (creatingNewFolder) {
        await api.post('/videos/folders', { name: finalFolder, color: '#8b5cf6' }).catch(() => {});
      }

      const safeFileName = `smartboard_${Date.now()}.webm`;
      const formData = new FormData();
      formData.append('file', recordedBlob, safeFileName);
      formData.append('title', videoTitle.trim());
      formData.append('description', `ویدیو تدریس ضبط‌شده از تخته هوشمند (${formatDuration(durationSeconds)})`);
      formData.append('folder_name', finalFolder);
      formData.append('category', 'تخته هوشمند');
      formData.append('target_audience', 'teacher_students');
      formData.append('duration_seconds', String(durationSeconds || 0));
      formData.append('is_published', 'true');

      const res = await api.post('/videos', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      const savedVideo = res.data?.data?.video;
      setPublishedSuccess({
        folder: finalFolder,
        title: savedVideo?.title || videoTitle.trim(),
      });
      toast.success(`ویدیو در پوشه «${finalFolder}» منتشر شد و برای شما و دانش‌آموزانتان قابل مشاهده است`);
    } catch (err) {
      toast.error(err?.response?.data?.message || 'خطا در انتشار ویدیو در بخش ویدیوها');
    } finally {
      setPublishingVideo(false);
    }
  };

  const normalizedSearch = shareSearch.trim().replace(/^@/, '').toLowerCase();
  const filteredContacts = contacts.filter((c) => {
    if (!normalizedSearch) return true;
    return (
      String(c.display_name || '').toLowerCase().includes(normalizedSearch) ||
      String(c.username || '').toLowerCase().includes(normalizedSearch)
    );
  });
  const filteredGroups = groups.filter((g) => {
    if (!normalizedSearch) return true;
    return (
      String(g.title || g.name || '').toLowerCase().includes(normalizedSearch) ||
      String(g.handle || '').toLowerCase().includes(normalizedSearch)
    );
  });

  return (
    <div className={styles.modalBackdrop} onClick={onClose} data-testid="recording-action-modal">
      <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <div>
            <h2>ویدیو ضبط‌شده پایان کلاس</h2>
            <p>
              مدت زمان: {formatDuration(durationSeconds)} • حجم:{' '}
              {recordedBlob ? `${(recordedBlob.size / (1024 * 1024)).toFixed(2)} مگابایت` : '—'}
            </p>
          </div>
          <button type="button" className={styles.modalCloseBtn} onClick={onClose} aria-label="بستن">
            <HiOutlineXMark />
          </button>
        </div>

        {/* Recorded Video Preview */}
        <div className={styles.videoPreviewWrap}>
          <video src={recordedUrl} controls className={styles.videoPreviewEl} />
        </div>

        {/* Title Field */}
        <div className={styles.modalField}>
          <label htmlFor="recorded-video-title">عنوان ویدیو</label>
          <input
            id="recorded-video-title"
            type="text"
            className={styles.modalInput}
            value={videoTitle}
            onChange={(e) => setVideoTitle(e.target.value)}
            data-testid="recorded-video-title-input"
          />
        </div>

        {/* Destination Action Tabs */}
        <div className={styles.modalActionTabs} role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={activeAction === 'save'}
            className={`${styles.modalActionTab} ${activeAction === 'save' ? styles.modalActionTabActive : ''}`}
            onClick={() => setActiveAction('save')}
            data-testid="tab-save-device"
          >
            <HiOutlineArrowDownTray />
            <span>ذخیره در دستگاه</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeAction === 'messages'}
            className={`${styles.modalActionTab} ${activeAction === 'messages' ? styles.modalActionTabActive : ''}`}
            onClick={() => setActiveAction('messages')}
            data-testid="tab-send-messages"
          >
            <HiOutlinePaperAirplane />
            <span>ارسال در پیام‌ها</span>
          </button>

          {isTeacherOrAdmin && (
            <button
              type="button"
              role="tab"
              aria-selected={activeAction === 'videos'}
              className={`${styles.modalActionTab} ${activeAction === 'videos' ? styles.modalActionTabActive : ''}`}
              onClick={() => setActiveAction('videos')}
              data-testid="tab-publish-videos"
            >
              <HiOutlinePlayCircle />
              <span>ارسال در بخش ویدیوها</span>
            </button>
          )}
        </div>

        {/* Panel 1: Save & Download to Device */}
        {activeAction === 'save' && (
          <div className={styles.modalPanel}>
            <p className={styles.modalHint}>
              می‌توانید فایل ویدیویی ضبط‌شده (همراه با صدای شما و محتوای تخته) را مستقیماً در دستگاه خود ذخیره و دانلود کنید.
            </p>
            <button
              type="button"
              className={styles.primaryFullBtn}
              onClick={handleDownloadToDevice}
              data-testid="download-recording-btn"
            >
              <HiOutlineArrowDownTray />
              <span>ذخیره و دانلود ویدیو (.webm)</span>
            </button>
          </div>
        )}

        {/* Panel 2: Send to App Messages */}
        {activeAction === 'messages' && (
          <div className={styles.modalPanel}>
            <div className={styles.modalSearchBox}>
              <HiOutlineMagnifyingGlass />
              <input
                type="text"
                placeholder="جستجوی نام، @نام‌کاربری مخاطب یا نام گروه..."
                value={shareSearch}
                onChange={(e) => setShareSearch(e.target.value)}
                data-testid="share-video-search-input"
              />
            </div>

            <div className={styles.recipientList}>
              {loadingDirectory ? (
                <div className={styles.recipientEmpty}>در حال بارگذاری مخاطبین مدرسه...</div>
              ) : filteredContacts.length === 0 && filteredGroups.length === 0 ? (
                <div className={styles.recipientEmpty}>مخاطب یا گروهی یافت نشد</div>
              ) : (
                <>
                  {filteredGroups.map((g) => {
                    const isSel = selectedTarget?.type === 'group' && selectedTarget.id === g.id;
                    return (
                      <button
                        key={`grp-${g.id}`}
                        type="button"
                        className={`${styles.recipientItem} ${isSel ? styles.recipientItemActive : ''}`}
                        onClick={() =>
                          setSelectedTarget({
                            type: 'group',
                            id: g.id,
                            name: g.title || g.name || 'گروه',
                          })
                        }
                      >
                        <HiOutlineUserGroup className={styles.recipientIcon} />
                        <div className={styles.recipientMeta}>
                          <strong>{g.title || g.name}</strong>
                          <span>گروه {g.handle ? `• @${g.handle}` : ''}</span>
                        </div>
                        {isSel && <HiOutlineCheckCircle className={styles.recipientCheck} />}
                      </button>
                    );
                  })}

                  {filteredContacts.map((c) => {
                    const isSel = selectedTarget?.type === 'user' && selectedTarget.id === c.id;
                    return (
                      <button
                        key={`usr-${c.id}`}
                        type="button"
                        className={`${styles.recipientItem} ${isSel ? styles.recipientItemActive : ''}`}
                        onClick={() =>
                          setSelectedTarget({
                            type: 'user',
                            id: c.id,
                            name: c.display_name,
                            username: c.username,
                          })
                        }
                        data-testid={`share-recipient-${c.username || c.id}`}
                      >
                        <div className={styles.recipientAvatar}>
                          {(c.display_name || 'ک').charAt(0)}
                        </div>
                        <div className={styles.recipientMeta}>
                          <strong>{c.display_name}</strong>
                          <span dir="ltr">
                            {c.username ? `@${c.username}` : c.role_label || ''}
                          </span>
                        </div>
                        {isSel && <HiOutlineCheckCircle className={styles.recipientCheck} />}
                      </button>
                    );
                  })}
                </>
              )}
            </div>

            <input
              type="text"
              className={styles.modalInput}
              placeholder="متن همراه ویدیو (اختیاری)..."
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
            />

            <button
              type="button"
              className={styles.primaryFullBtn}
              disabled={sendingMessage || !selectedTarget}
              onClick={handleSendToMessages}
              data-testid="confirm-send-message-video-btn"
            >
              <HiOutlinePaperAirplane />
              <span>
                {sendingMessage
                  ? 'در حال ارسال در پیام‌ها...'
                  : selectedTarget
                  ? `ارسال برای «${selectedTarget.name}»`
                  : 'ابتدا مخاطب یا گروه را انتخاب کنید'}
              </span>
            </button>
          </div>
        )}

        {/* Panel 3: Teacher-Only Publish to Videos Section with Folder Picker */}
        {activeAction === 'videos' && isTeacherOrAdmin && (
          <div className={styles.modalPanel} data-testid="publish-videos-panel">
            <div className={styles.teacherScopeNote}>
              این ویدیو در پوشه انتخاب‌شده ذخیره شده و در بخش «ویدیوها» در پنل شما و پنل <strong>دانش‌آموزان زیرمجموعه شما</strong> نمایش داده می‌شود.
            </div>

            <div className={styles.folderPickerHeader}>
              <span>انتخاب پوشه ویدیویی:</span>
              <button
                type="button"
                className={styles.inlineLinkBtn}
                onClick={() => setCreatingNewFolder((prev) => !prev)}
                data-testid="toggle-new-folder-btn"
              >
                <HiOutlineFolderPlus />
                <span>{creatingNewFolder ? 'انتخاب از پوشه‌های موجود' : '+ ساخت پوشه جدید'}</span>
              </button>
            </div>

            {creatingNewFolder ? (
              <input
                type="text"
                className={styles.modalInput}
                placeholder="نام پوشه جدید (مثلاً: فیزیک فصل ۱)"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                data-testid="new-video-folder-input"
              />
            ) : (
              <div className={styles.folderChipsGrid}>
                {folders.map((f) => (
                  <button
                    key={f.name}
                    type="button"
                    className={`${styles.folderChip} ${selectedFolder === f.name ? styles.folderChipActive : ''}`}
                    onClick={() => setSelectedFolder(f.name)}
                    data-testid={`select-folder-${f.name}`}
                  >
                    <HiOutlineFolder style={{ color: f.color || '#6366f1' }} />
                    <span>{f.name}</span>
                  </button>
                ))}
              </div>
            )}

            {publishedSuccess && (
              <div className={styles.publishSuccessBanner} data-testid="publish-video-success">
                <HiOutlineCheckCircle />
                <span>
                  ویدیو «{publishedSuccess.title}» با موفقیت در پوشه «{publishedSuccess.folder}» منتشر شد.
                </span>
              </div>
            )}

            <button
              type="button"
              className={styles.primaryFullBtn}
              disabled={publishingVideo}
              onClick={handlePublishToVideos}
              data-testid="confirm-publish-video-btn"
            >
              <HiOutlinePlayCircle />
              <span>{publishingVideo ? 'در حال انتشار در بخش ویدیوها...' : 'ارسال و انتشار در بخش ویدیوها'}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
