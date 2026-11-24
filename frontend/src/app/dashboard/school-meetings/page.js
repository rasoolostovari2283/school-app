'use client';

import { useState, useEffect, useCallback } from 'react';
import { io } from 'socket.io-client';
import toast from 'react-hot-toast';
import {
  HiOutlineVideoCamera,
  HiOutlinePhoto,
  HiOutlineFilm,
  HiOutlineDocumentText,
  HiOutlineMegaphone,
  HiOutlinePlus,
  HiOutlineTrash,
  HiOutlineArrowDownTray,
  HiOutlinePlay,
  HiOutlineXMark,
  HiOutlineArrowPath,
  HiOutlineBookmark,
} from 'react-icons/hi2';
import useAuthStore from '@/stores/authStore';
import api, { getApiBaseUrl } from '@/lib/api';
import LiveWebinarRoom from '@/components/schoolMeetings/LiveWebinarRoom';
import styles from './schoolMeetings.module.css';

const PRINCIPAL_ROLES = new Set(['admin', 'manager', 'principal', 'school_admin', 'super_admin']);

const MEDIA_TABS = [
  { key: 'video', label: 'فیلم‌ها و جلسات ضبط‌شده', icon: HiOutlineFilm, accept: 'video/*' },
  { key: 'photo', label: 'عکس‌ها و تصاویر', icon: HiOutlinePhoto, accept: 'image/*' },
  { key: 'file', label: 'فایل‌ها و مستندات', icon: HiOutlineDocumentText, accept: '.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.zip,.txt' },
];

function buildAuthedUrl(relativePath) {
  if (!relativePath) return '';
  if (relativePath.startsWith('http://') || relativePath.startsWith('https://')) return relativePath;
  const base = getApiBaseUrl().replace(/\/api\/v1\/?$/, '');
  const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : '';
  const sep = relativePath.includes('?') ? '&' : '?';
  return `${base}${relativePath}${token ? `${sep}token=${encodeURIComponent(token)}` : ''}`;
}

export default function SchoolMeetingsPage() {
  const user = useAuthStore((s) => s.user);
  const role = String(user?.role || '').toLowerCase();
  const isPrincipal = PRINCIPAL_ROLES.has(role);

  // Active live webinar
  const [activeWebinar, setActiveWebinar] = useState(null);
  const [inWebinarRoom, setInWebinarRoom] = useState(false);
  const [webinarTitleInput, setWebinarTitleInput] = useState('');
  const [startingWebinar, setStartingWebinar] = useState(false);

  // Notice board (تابلو اعلانات)
  const [notices, setNotices] = useState([]);
  const [noticeTitle, setNoticeTitle] = useState('');
  const [noticeContent, setNoticeContent] = useState('');
  const [noticePinned, setNoticePinned] = useState(false);
  const [postingNotice, setPostingNotice] = useState(false);

  // Categorized media/files (photo | video | file)
  const [activeTab, setActiveTab] = useState('video');
  const [items, setItems] = useState([]);
  const [counts, setCounts] = useState({ video: 0, photo: 0, file: 0 });
  const [loadingItems, setLoadingItems] = useState(true);

  // Upload modal
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadMediaType, setUploadMediaType] = useState('video');
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadGroup, setUploadGroup] = useState('عمومی');
  const [uploadDesc, setUploadDesc] = useState('');
  const [uploadFile, setUploadFile] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);

  // Preview modal (video player or photo lightbox)
  const [previewItem, setPreviewItem] = useState(null);

  const fetchActiveWebinar = useCallback(async () => {
    try {
      const res = await api.get('/school-meetings/webinar/active');
      setActiveWebinar(res.data?.data?.active_session || null);
    } catch {
      setActiveWebinar(null);
    }
  }, []);

  const fetchNotices = useCallback(async () => {
    try {
      const res = await api.get('/school-meetings/notices');
      setNotices(res.data?.data?.notices || []);
    } catch {
      setNotices([]);
    }
  }, []);

  const fetchItems = useCallback(async () => {
    setLoadingItems(true);
    try {
      const res = await api.get('/school-meetings/items', { params: { media_type: activeTab } });
      setItems(res.data?.data?.items || []);
      if (res.data?.data?.counts) setCounts(res.data.data.counts);
    } catch {
      setItems([]);
    } finally {
      setLoadingItems(false);
    }
  }, [activeTab]);

  useEffect(() => {
    fetchActiveWebinar();
    fetchNotices();
  }, [fetchActiveWebinar, fetchNotices]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  // Real-time Socket listener so teachers see live webinar start/end & notices instantly
  useEffect(() => {
    const socketBaseUrl = getApiBaseUrl().replace(/\/api\/v1\/?$/, '');
    const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : '';
    if (!token) return undefined;

    const socket = io(socketBaseUrl, {
      auth: { token },
      transports: ['websocket', 'polling'],
    });

    socket.on('school_webinar_started', ({ session }) => {
      if (session) {
        setActiveWebinar(session);
        toast.success(`وبینار زنده «${session.title}» توسط مدیر مدرسه آغاز شد!`);
      }
    });

    socket.on('school_webinar_ended', () => {
      setActiveWebinar(null);
    });

    socket.on('school_notice_updated', () => {
      fetchNotices();
    });

    return () => {
      socket.disconnect();
    };
  }, [fetchNotices]);

  const handleStartOrEnterWebinar = async () => {
    if (isPrincipal) {
      if (activeWebinar) {
        setInWebinarRoom(true);
        return;
      }
      setStartingWebinar(true);
      try {
        const res = await api.post('/school-meetings/webinar/start', {
          title: webinarTitleInput.trim() || 'جلسه وبینار زنده مدرسه',
        });
        const session = res.data?.data?.session;
        if (session) {
          setActiveWebinar(session);
          setInWebinarRoom(true);
          toast.success('اتاق وبینار زنده ایجاد شد؛ معلمان مدرسه اکنون می‌توانند وارد شوند.');
        }
      } catch (err) {
        toast.error(err.response?.data?.message || 'خطا در شروع وبینار زنده');
      } finally {
        setStartingWebinar(false);
      }
    } else {
      if (!activeWebinar) {
        toast('در حال حاضر وبینار زنده‌ای توسط مدیر شروع نشده است.');
        return;
      }
      setInWebinarRoom(true);
    }
  };

  const handleCreateNotice = async (e) => {
    e.preventDefault();
    if (!noticeContent.trim()) {
      toast.error('لطفاً متن اعلان را وارد کنید.');
      return;
    }
    setPostingNotice(true);
    try {
      await api.post('/school-meetings/notices', {
        title: noticeTitle.trim(),
        content: noticeContent.trim(),
        is_pinned: noticePinned,
      });
      setNoticeTitle('');
      setNoticeContent('');
      setNoticePinned(false);
      toast.success('یادداشت روی تابلو اعلانات ثبت شد و در پنل معلمان نمایش داده می‌شود.');
      fetchNotices();
    } catch (err) {
      toast.error(err.response?.data?.message || 'خطا در ثبت اعلان');
    } finally {
      setPostingNotice(false);
    }
  };

  const handleDeleteNotice = async (id) => {
    if (!window.confirm('این یادداشت از تابلو اعلانات حذف شود؟')) return;
    try {
      await api.delete(`/school-meetings/notices/${id}`);
      toast.success('اعلان حذف شد.');
      fetchNotices();
    } catch {
      toast.error('خطا در حذف اعلان');
    }
  };

  const handleUploadSubmit = async (e) => {
    e.preventDefault();
    if (!uploadFile) {
      toast.error('لطفاً فایل مورد نظر را انتخاب کنید.');
      return;
    }

    const formData = new FormData();
    formData.append('file', uploadFile);
    formData.append('media_type', uploadMediaType);
    formData.append('title', uploadTitle.trim() || uploadFile.name);
    formData.append('category_group', uploadGroup.trim() || 'عمومی');
    formData.append('description', uploadDesc.trim());

    setIsUploading(true);
    setUploadProgress(0);
    try {
      await api.post('/school-meetings/items', formData, {
        timeout: 10 * 60 * 1000,
        onUploadProgress: (evt) => {
          if (evt.total) setUploadProgress(Math.round((evt.loaded * 100) / evt.total));
        },
      });
      toast.success('محتوا با موفقیت بارگذاری شد و در پنل معلمان مدرسه شما نمایش داده می‌شود.');
      setShowUploadModal(false);
      setUploadTitle('');
      setUploadDesc('');
      setUploadFile(null);
      setActiveTab(uploadMediaType);
      fetchItems();
    } catch (err) {
      toast.error(err.response?.data?.message || 'خطا در بارگذاری فایل');
    } finally {
      setIsUploading(false);
    }
  };

  const handleDeleteItem = async (item) => {
    if (!window.confirm(`«${item.title}» حذف شود؟`)) return;
    try {
      await api.delete(`/school-meetings/items/${item.id}`);
      toast.success('حذف شد.');
      fetchItems();
    } catch {
      toast.error('خطا در حذف مورد');
    }
  };

  const handleDownloadItem = async (item) => {
    const toastId = toast.loading('در حال دانلود...');
    try {
      const res = await api.get(`/school-meetings/items/${item.id}/download`, {
        responseType: 'blob',
        timeout: 10 * 60 * 1000,
      });
      const blobUrl = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = item.file_name || item.title || 'download';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(blobUrl);
      toast.success('دانلود آغاز شد.', { id: toastId });
    } catch {
      toast.error('خطا در دانلود فایل', { id: toastId });
    }
  };

  const openUploadForTab = (type) => {
    setUploadMediaType(type);
    setShowUploadModal(true);
  };

  return (
    <div className={styles.pageContainer} dir="rtl">
      {/* 1. TOP LIVE WEBINAR BANNER (ورود به اتاق وبینار زنده) */}
      <section className={styles.webinarHero}>
        <div className={styles.webinarHeroText}>
          <div className={styles.heroTitleRow}>
            <HiOutlineVideoCamera className={styles.heroIcon} />
            <h1>جلسات آنلاین مدرسه</h1>
            {activeWebinar && <span className={styles.livePill}>● وبینار زنده فعال است</span>}
          </div>
          <p>
            {isPrincipal
              ? 'از اینجا اتاق وبینار زنده مدرسه را (مشابه اسکای‌روم) ایجاد کنید، جلسه را ضبط و ذخیره کنید و فایل‌ها، فیلم‌ها، عکس‌ها و اعلانات را برای معلمان مدرسه خود منتشر کنید.'
              : 'به اتاق وبینار زنده مدرسه وارد شوید و به فیلم‌ها، جلسات ضبط‌شده، عکس‌ها، فایل‌ها و تابلو اعلانات مدیر مدرسه دسترسی داشته باشید.'}
          </p>
        </div>

        <div className={styles.webinarHeroActions}>
          {isPrincipal && !activeWebinar && (
            <input
              type="text"
              value={webinarTitleInput}
              onChange={(e) => setWebinarTitleInput(e.target.value)}
              placeholder="عنوان جلسه وبینار (مثلاً شورای دبیران)..."
              className={styles.heroInput}
            />
          )}

          <button
            type="button"
            className={`${styles.enterWebinarBtn} ${!isPrincipal && !activeWebinar ? styles.enterWebinarBtnDisabled : ''}`}
            onClick={handleStartOrEnterWebinar}
            disabled={startingWebinar || (!isPrincipal && !activeWebinar)}
          >
            <HiOutlineVideoCamera />
            <span>
              {startingWebinar
                ? 'در حال ایجاد اتاق...'
                : activeWebinar
                ? `ورود به اتاق وبینار زنده (${activeWebinar.title})`
                : isPrincipal
                ? 'ورود به اتاق وبینار زنده (ساخت تماس)'
                : 'ورود به اتاق وبینار زنده (در انتظار شروع مدیر)'}
            </span>
          </button>

          {!isPrincipal && !activeWebinar && (
            <button type="button" className={styles.refreshBtn} onClick={fetchActiveWebinar} title="بررسی مجدد">
              <HiOutlineArrowPath />
            </button>
          )}
        </div>
      </section>

      {/* 2. NOTICE BOARD (تابلو اعلانات) */}
      <section className={styles.noticeBoardCard}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>
            <HiOutlineMegaphone />
            <span>تابلو اعلانات جلسات مدرسه</span>
          </h2>
        </div>

        {isPrincipal && (
          <form onSubmit={handleCreateNotice} className={styles.noticeForm}>
            <div className={styles.noticeFormRow}>
              <input
                type="text"
                value={noticeTitle}
                onChange={(e) => setNoticeTitle(e.target.value)}
                placeholder="عنوان کوتاه (اختیاری)..."
                className={styles.textInput}
              />
              <label className={styles.pinCheckbox}>
                <input
                  type="checkbox"
                  checked={noticePinned}
                  onChange={(e) => setNoticePinned(e.target.checked)}
                />
                <span>سنجاق در بالا</span>
              </label>
            </div>
            <textarea
              rows={2}
              value={noticeContent}
              onChange={(e) => setNoticeContent(e.target.value)}
              placeholder="متن یادداشت یا اطلاعیه برای معلمان مدرسه را اینجا بنویسید..."
              className={styles.textareaInput}
              required
            />
            <div className={styles.noticeFormFooter}>
              <button type="submit" className={styles.btnPrimary} disabled={postingNotice}>
                <HiOutlinePlus />
                <span>{postingNotice ? 'در حال ثبت...' : 'ثبت روی تابلو اعلانات'}</span>
              </button>
            </div>
          </form>
        )}

        {notices.length === 0 ? (
          <p className={styles.helperMuted}>هنوز یادداشتی روی تابلو اعلانات ثبت نشده است.</p>
        ) : (
          <div className={styles.noticeList}>
            {notices.map((n) => (
              <div key={n.id} className={`${styles.noticeItem} ${n.is_pinned ? styles.noticePinned : ''}`}>
                <div className={styles.noticeItemTop}>
                  <div className={styles.noticeTitleWrap}>
                    {n.is_pinned && <HiOutlineBookmark className={styles.pinIcon} />}
                    <strong>{n.title || 'اطلاعیه مدیریت'}</strong>
                    <span className={styles.noticeDate}>
                      {n.author_name ? `${n.author_name} • ` : ''}
                      {new Date(n.created_at).toLocaleDateString('fa-IR')}
                    </span>
                  </div>
                  {isPrincipal && (
                    <button
                      type="button"
                      className={styles.iconDangerBtn}
                      onClick={() => handleDeleteNotice(n.id)}
                      title="حذف اعلان"
                    >
                      <HiOutlineTrash />
                    </button>
                  )}
                </div>
                <p className={styles.noticeContent}>{n.content}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 3. ORGANIZED 3-GROUP MEDIA & FILES SECTION (فیلم | عکس | فایل) */}
      <section className={styles.mediaSection}>
        <div className={styles.mediaHeaderBar}>
          <div className={styles.mediaTabsRow}>
            {MEDIA_TABS.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.key}
                  type="button"
                  className={`${styles.mediaTabBtn} ${activeTab === tab.key ? styles.mediaTabActive : ''}`}
                  onClick={() => setActiveTab(tab.key)}
                >
                  <Icon />
                  <span>{tab.label}</span>
                  <span className={styles.tabCountBadge}>{counts[tab.key] || 0}</span>
                </button>
              );
            })}
          </div>

          {isPrincipal && (
            <button
              type="button"
              className={styles.btnPrimary}
              onClick={() => openUploadForTab(activeTab)}
            >
              <HiOutlinePlus />
              <span>
                {activeTab === 'video'
                  ? 'آپلود فیلم جدید'
                  : activeTab === 'photo'
                  ? 'آپلود عکس جدید'
                  : 'آپلود فایل جدید'}
              </span>
            </button>
          )}
        </div>

        {loadingItems ? (
          <div className={styles.emptyBox}>در حال بارگذاری...</div>
        ) : items.length === 0 ? (
          <div className={styles.emptyBox}>
            هنوز موردی در این دسته‌بندی بارگذاری نشده است.
          </div>
        ) : (
          <div className={styles.itemsGrid}>
            {items.map((item) => {
              const streamSrc = buildAuthedUrl(item.stream_url);
              return (
                <article key={item.id} className={styles.itemCard}>
                  {/* Thumbnail / Visual Area */}
                  {item.media_type === 'photo' ? (
                    <div className={styles.photoPreviewBox} onClick={() => setPreviewItem(item)}>
                      <img src={streamSrc} alt={item.title} className={styles.photoThumb} />
                    </div>
                  ) : item.media_type === 'video' ? (
                    <div className={styles.videoThumbBox} onClick={() => setPreviewItem(item)}>
                      <span className={styles.playCircle}>
                        <HiOutlinePlay />
                      </span>
                      {item.is_recording && (
                        <span className={styles.recordedBadge}>ضبط‌شده از وبینار زنده</span>
                      )}
                    </div>
                  ) : (
                    <div className={styles.fileThumbBox}>
                      <HiOutlineDocumentText className={styles.fileBigIcon} />
                      <span className={styles.fileExtTag}>
                        {(item.file_name || '').split('.').pop()?.toUpperCase() || 'FILE'}
                      </span>
                    </div>
                  )}

                  {/* Body */}
                  <div className={styles.itemCardBody}>
                    <div className={styles.itemMetaTags}>
                      <span className={styles.groupBadge}>{item.category_group || 'عمومی'}</span>
                      <span className={styles.dateBadge}>
                        {new Date(item.created_at).toLocaleDateString('fa-IR')}
                      </span>
                    </div>
                    <h3 className={styles.itemTitle}>{item.title}</h3>
                    {item.description && <p className={styles.itemDesc}>{item.description}</p>}

                    <div className={styles.itemCardActions}>
                      {(item.media_type === 'video' || item.media_type === 'photo') && (
                        <button
                          type="button"
                          className={styles.btnPrimarySm}
                          onClick={() => setPreviewItem(item)}
                        >
                          <HiOutlinePlay />
                          <span>{item.media_type === 'video' ? 'پخش آفلاین' : 'مشاهده'}</span>
                        </button>
                      )}

                      <button
                        type="button"
                        className={styles.btnSecondarySm}
                        onClick={() => handleDownloadItem(item)}
                      >
                        <HiOutlineArrowDownTray />
                        <span>دانلود</span>
                      </button>

                      {isPrincipal && (
                        <button
                          type="button"
                          className={styles.iconDangerBtn}
                          onClick={() => handleDeleteItem(item)}
                          title="حذف"
                        >
                          <HiOutlineTrash />
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* Upload Modal (Principal/Manager) */}
      {showUploadModal && (
        <div className={styles.modalOverlay} onClick={() => setShowUploadModal(false)}>
          <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3>بارگذاری در بخش جلسات آنلاین مدرسه</h3>
              <button type="button" className={styles.iconCloseBtn} onClick={() => setShowUploadModal(false)}>
                <HiOutlineXMark />
              </button>
            </div>

            <form onSubmit={handleUploadSubmit} className={styles.modalForm}>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>گروه‌بندی محتوا *</label>
                <div className={styles.typeRadioRow}>
                  {MEDIA_TABS.map((t) => (
                    <button
                      key={t.key}
                      type="button"
                      className={`${styles.typePill} ${uploadMediaType === t.key ? styles.typePillActive : ''}`}
                      onClick={() => setUploadMediaType(t.key)}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className={styles.formGroup}>
                <label className={styles.formLabel}>عنوان *</label>
                <input
                  type="text"
                  value={uploadTitle}
                  onChange={(e) => setUploadTitle(e.target.value)}
                  placeholder="عنوان عکس، فیلم یا فایل..."
                  className={styles.textInput}
                  required
                />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.formLabel}>زیرگروه (برای نظم بیشتر)</label>
                <input
                  type="text"
                  value={uploadGroup}
                  onChange={(e) => setUploadGroup(e.target.value)}
                  placeholder="مثلاً: شورای دبیران، بخشنامه‌ها، کارگاه آموزشی"
                  className={styles.textInput}
                />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.formLabel}>توضیحات</label>
                <textarea
                  rows={2}
                  value={uploadDesc}
                  onChange={(e) => setUploadDesc(e.target.value)}
                  className={styles.textareaInput}
                />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.formLabel}>انتخاب فایل *</label>
                <input
                  type="file"
                  accept={MEDIA_TABS.find((t) => t.key === uploadMediaType)?.accept || '*/*'}
                  onChange={(e) => {
                    const f = e.target.files?.[0] || null;
                    setUploadFile(f);
                    if (f && !uploadTitle.trim()) setUploadTitle(f.name.replace(/\.[^/.]+$/, ''));
                  }}
                  className={styles.textInput}
                  required
                />
              </div>

              {isUploading && (
                <div className={styles.progressTrack}>
                  <div className={styles.progressFill} style={{ width: `${uploadProgress}%` }} />
                </div>
              )}

              <div className={styles.modalFooter}>
                <button type="button" className={styles.btnSecondary} onClick={() => setShowUploadModal(false)}>
                  انصراف
                </button>
                <button type="submit" className={styles.btnPrimary} disabled={isUploading}>
                  {isUploading ? `در حال آپلود (${uploadProgress}%)` : 'بارگذاری و نمایش برای معلمان'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Offline Video / Photo Preview Modal */}
      {previewItem && (
        <div className={styles.modalOverlay} onClick={() => setPreviewItem(null)}>
          <div className={styles.previewModalCard} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3>{previewItem.title}</h3>
              <button type="button" className={styles.iconCloseBtn} onClick={() => setPreviewItem(null)}>
                <HiOutlineXMark />
              </button>
            </div>
            <div className={styles.previewBody}>
              {previewItem.media_type === 'video' ? (
                <video
                  src={buildAuthedUrl(previewItem.stream_url)}
                  controls
                  autoPlay
                  className={styles.previewVideoEl}
                />
              ) : (
                <img
                  src={buildAuthedUrl(previewItem.stream_url)}
                  alt={previewItem.title}
                  className={styles.previewImgEl}
                />
              )}
              {previewItem.description && <p className={styles.previewDesc}>{previewItem.description}</p>}
            </div>
            <div className={styles.modalFooter}>
              <button
                type="button"
                className={styles.btnPrimary}
                onClick={() => handleDownloadItem(previewItem)}
              >
                <HiOutlineArrowDownTray /> دانلود فایل
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Skyroom-Style Live Webinar Room Overlay */}
      {inWebinarRoom && activeWebinar && (
        <LiveWebinarRoom
          session={activeWebinar}
          user={user}
          isPrincipal={isPrincipal}
          onLeave={() => {
            setInWebinarRoom(false);
            fetchActiveWebinar();
          }}
          onRecordingSaved={() => {
            setActiveTab('video');
            fetchItems();
          }}
        />
      )}
    </div>
  );
}
