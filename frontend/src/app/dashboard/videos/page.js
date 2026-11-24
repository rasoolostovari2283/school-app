'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import toast from 'react-hot-toast';
import {
  HiOutlineFolder,
  HiOutlineFolderPlus,
  HiOutlinePlus,
  HiOutlinePlay,
  HiOutlineArrowDownTray,
  HiOutlineArrowsRightLeft,
  HiOutlineShare,
  HiOutlineTrash,
  HiOutlinePencilSquare,
  HiOutlineAcademicCap,
  HiOutlineMagnifyingGlass,
  HiOutlineFilm,
  HiOutlineEye,
} from 'react-icons/hi2';
import { FaFilePdf } from 'react-icons/fa';
import useAuthStore from '@/stores/authStore';
import api from '@/lib/api';
import VideoPlayerModal from '@/components/videos/VideoPlayerModal';
import FolderModal from '@/components/videos/FolderModal';
import UploadVideoModal from '@/components/videos/UploadVideoModal';
import MoveShareModal from '@/components/videos/MoveShareModal';
import styles from './videos.module.css';

export default function VideosPage() {
  const user = useAuthStore((s) => s.user);
  const role = String(user?.role || '').toLowerCase();
  const canManage = ['teacher', 'admin', 'manager', 'principal', 'school_admin', 'super_admin'].includes(role);

  const [folders, setFolders] = useState([]);
  const [totalVideosCount, setTotalVideosCount] = useState(0);
  const [videos, setVideos] = useState([]);
  const [dbClasses, setDbClasses] = useState([]);
  const [dbGrades, setDbGrades] = useState([]);
  const [loading, setLoading] = useState(true);

  const [selectedFolder, setSelectedFolder] = useState('all');
  const [selectedClassFilter, setSelectedClassFilter] = useState('all');
  const [selectedGradeFilter, setSelectedGradeFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Modals
  const [activeVideo, setActiveVideo] = useState(null);
  const [folderModalState, setFolderModalState] = useState({ open: false, folder: null });
  const [uploadModalState, setUploadModalState] = useState({ open: false, defaultFolder: 'عمومی' });
  const [moveShareState, setMoveShareState] = useState({ open: false, video: null, tab: 'move' });

  const fetchClassesOptions = useCallback(async () => {
    try {
      const res = await api.get('/videos/classes-options');
      const classesList = res.data?.data?.classes || [];
      const gradesList = res.data?.data?.grades || [];
      setDbClasses(classesList);
      setDbGrades(gradesList);
    } catch {
      // Fallback to /classes if needed
      try {
        const fallback = await api.get('/classes');
        const list = fallback.data?.data?.classes || [];
        setDbClasses(list);
        setDbGrades(Array.from(new Set(list.map((c) => c.grade).filter(Boolean))));
      } catch {
        setDbClasses([]);
      }
    }
  }, []);

  const fetchFolders = useCallback(async () => {
    try {
      const res = await api.get('/videos/folders');
      setFolders(res.data?.data?.folders || []);
      setTotalVideosCount(res.data?.data?.total_videos ?? 0);
    } catch {
      setFolders([]);
    }
  }, []);

  const fetchVideos = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (selectedFolder && selectedFolder !== 'all') params.folder = selectedFolder;
      if (selectedClassFilter && selectedClassFilter !== 'all') params.class_id = selectedClassFilter;
      if (selectedGradeFilter && selectedGradeFilter !== 'all') params.grade = selectedGradeFilter;
      if (searchQuery.trim()) params.search = searchQuery.trim();

      const res = await api.get('/videos', { params });
      setVideos(res.data?.data?.videos || []);
    } catch (err) {
      toast.error(err.response?.data?.message || 'خطا در دریافت لیست ویدیوها');
    } finally {
      setLoading(false);
    }
  }, [selectedFolder, selectedClassFilter, selectedGradeFilter, searchQuery]);

  useEffect(() => {
    fetchClassesOptions();
    fetchFolders();
  }, [fetchClassesOptions, fetchFolders]);

  useEffect(() => {
    fetchVideos();
  }, [fetchVideos]);

  const refreshAll = useCallback(async () => {
    await Promise.all([fetchFolders(), fetchVideos()]);
  }, [fetchFolders, fetchVideos]);

  const handleDeleteFolder = async (folder, e) => {
    e.stopPropagation();
    if (!window.confirm(`پوشه «${folder.name}» حذف شود؟ ویدیوهای آن به پوشه عمومی منتقل می‌شوند.`)) return;
    try {
      await api.delete(`/videos/folders/${encodeURIComponent(folder.id || folder.name)}`);
      toast.success('پوشه حذف شد.');
      if (selectedFolder === folder.name) setSelectedFolder('all');
      await refreshAll();
    } catch (err) {
      toast.error(err.response?.data?.message || 'خطا در حذف پوشه');
    }
  };

  const handleDeleteVideo = async (video) => {
    if (!window.confirm(`آیا از حذف ویدیوی «${video.title}» مطمئن هستید؟`)) return;
    try {
      await api.delete(`/videos/${video.id}`);
      toast.success('ویدیو حذف شد.');
      if (activeVideo?.id === video.id) setActiveVideo(null);
      await refreshAll();
    } catch (err) {
      toast.error(err.response?.data?.message || 'خطا در حذف ویدیو');
    }
  };

  const handleDownloadVideo = async (video) => {
    const toastId = toast.loading('در حال آماده‌سازی دانلود ویدیو...');
    try {
      const res = await api.get(`/videos/${video.id}/download`, {
        responseType: 'blob',
        timeout: 10 * 60 * 1000,
      });
      const blob = new Blob([res.data], { type: video.mimetype || 'video/mp4' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${(video.title || 'video').replace(/[<>:"/\\|?*]+/g, '_')}.mp4`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast.success('دانلود ویدیو آغاز شد.', { id: toastId });
    } catch {
      toast.error('خطا در دانلود ویدیو', { id: toastId });
    }
  };

  const handleVideoUpdated = (updatedVideo) => {
    if (!updatedVideo) return;
    setVideos((prev) => prev.map((v) => (v.id === updatedVideo.id ? updatedVideo : v)));
    if (activeVideo?.id === updatedVideo.id) {
      setActiveVideo(updatedVideo);
    }
    fetchFolders();
  };

  const activeFolderObj = useMemo(
    () => folders.find((f) => f.name === selectedFolder) || null,
    [folders, selectedFolder]
  );

  return (
    <div className={styles.pageContainer} dir="rtl">
      {/* Page Header */}
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>
            <HiOutlineFilm />
            <span>ویدیوهای آموزشی</span>
          </h1>
          <p className={styles.pageSubtitle}>
            {canManage
              ? 'مدیریت پوشه‌ها، تعیین پایه و کلاس‌های مجاز از دیتابیس، آپلود ویدیو، پیوست PDF و اشتراک بین پوشه‌ها'
              : 'مشاهده، پخش و دانلود ویدیوها و جزوه‌های PDF منتشرشده برای کلاس‌های شما'}
          </p>
        </div>

        {canManage && (
          <div className={styles.headerActions}>
            <button
              type="button"
              className={styles.btnSecondary}
              onClick={() => setFolderModalState({ open: true, folder: null })}
            >
              <HiOutlineFolderPlus />
              <span>ساخت پوشه جدید</span>
            </button>
            <button
              type="button"
              className={styles.btnPrimary}
              onClick={() =>
                setUploadModalState({
                  open: true,
                  defaultFolder: selectedFolder === 'all' ? 'عمومی' : selectedFolder,
                })
              }
            >
              <HiOutlinePlus />
              <span>آپلود ویدیو</span>
            </button>
          </div>
        )}
      </div>

      {/* Folders Grid */}
      <section className={styles.foldersSection}>
        <div className={styles.foldersGrid}>
          {/* All Videos Card */}
          <div
            role="button"
            tabIndex={0}
            className={`${styles.folderCard} ${selectedFolder === 'all' ? styles.folderCardActive : ''}`}
            onClick={() => setSelectedFolder('all')}
            onKeyDown={(e) => e.key === 'Enter' && setSelectedFolder('all')}
          >
            <div className={styles.folderCardTop}>
              <span className={styles.folderIconWrap} style={{ backgroundColor: '#6366f120', color: '#6366f1' }}>
                <HiOutlineFolder />
              </span>
              <span className={styles.folderCountBadge}>{totalVideosCount} ویدیو</span>
            </div>
            <div className={styles.folderName}>همه ویدیوها</div>
            <div className={styles.folderMetaText}>نمایش تمام ویدیوهای در دسترس</div>
          </div>

          {/* User / Class Folders */}
          {folders.map((folder) => {
            const isSelected = selectedFolder === folder.name;
            return (
              <div
                key={folder.id || folder.name}
                role="button"
                tabIndex={0}
                className={`${styles.folderCard} ${isSelected ? styles.folderCardActive : ''}`}
                style={{ '--folder-accent': folder.color || '#6366f1' }}
                onClick={() => setSelectedFolder(folder.name)}
                onKeyDown={(e) => e.key === 'Enter' && setSelectedFolder(folder.name)}
              >
                <div className={styles.folderCardTop}>
                  <span
                    className={styles.folderIconWrap}
                    style={{
                      backgroundColor: `${folder.color || '#6366f1'}22`,
                      color: folder.color || '#6366f1',
                    }}
                  >
                    <HiOutlineFolder />
                  </span>

                  <div className={styles.folderQuickActions}>
                    {/* Explicit + button directly on each folder to upload video inside it */}
                    {canManage && (
                      <button
                        type="button"
                        className={styles.folderPlusBtn}
                        title={`افزودن ویدیو به پوشه ${folder.name}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setUploadModalState({ open: true, defaultFolder: folder.name });
                        }}
                      >
                        <HiOutlinePlus />
                      </button>
                    )}
                    {canManage && (
                      <button
                        type="button"
                        className={styles.folderIconBtn}
                        title="ویرایش نام، پایه و کلاس‌های پوشه"
                        onClick={(e) => {
                          e.stopPropagation();
                          setFolderModalState({ open: true, folder });
                        }}
                      >
                        <HiOutlinePencilSquare />
                      </button>
                    )}
                    {canManage && folder.name !== 'عمومی' && (
                      <button
                        type="button"
                        className={`${styles.folderIconBtn} ${styles.dangerIconBtn}`}
                        title="حذف پوشه"
                        onClick={(e) => handleDeleteFolder(folder, e)}
                      >
                        <HiOutlineTrash />
                      </button>
                    )}
                  </div>
                </div>

                <div className={styles.folderName}>{folder.name}</div>
                <div className={styles.folderMetaRow}>
                  <span className={styles.folderCountBadge}>{folder.count || 0} ویدیو</span>
                  {folder.grade && <span className={styles.gradeTag}>پایه {folder.grade}</span>}
                </div>

                {Array.isArray(folder.target_classes) && folder.target_classes.length > 0 && (
                  <div className={styles.folderClassChips}>
                    {folder.target_classes.slice(0, 3).map((cls) => (
                      <span key={cls.id} className={styles.miniClassChip}>
                        {cls.name}
                      </span>
                    ))}
                    {folder.target_classes.length > 3 && (
                      <span className={styles.miniClassChip}>+{folder.target_classes.length - 3}</span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Active Folder Banner */}
      {activeFolderObj && (
        <div className={styles.activeFolderBanner}>
          <div>
            <strong>پوشه فعال: {activeFolderObj.name}</strong>
            {activeFolderObj.target_classes?.length > 0 && (
              <span className={styles.bannerSub}>
                {' '}• کلاس‌های مجاز: {activeFolderObj.target_classes.map((c) => c.name).join('، ')}
              </span>
            )}
          </div>
          {canManage && (
            <button
              type="button"
              className={styles.btnPrimarySm}
              onClick={() => setUploadModalState({ open: true, defaultFolder: activeFolderObj.name })}
            >
              <HiOutlinePlus />
              <span>افزودن ویدیو به این پوشه</span>
            </button>
          )}
        </div>
      )}

      {/* Filters & Search Bar */}
      <div className={styles.filterBar}>
        <div className={styles.searchBox}>
          <HiOutlineMagnifyingGlass />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="جستجو در عنوان یا توضیحات ویدیو..."
            className={styles.searchInput}
          />
        </div>

        <div className={styles.filterSelects}>
          {dbGrades.length > 0 && (
            <select
              value={selectedGradeFilter}
              onChange={(e) => setSelectedGradeFilter(e.target.value)}
              className={styles.filterSelect}
            >
              <option value="all">همه پایه‌ها</option>
              {dbGrades.map((g) => (
                <option key={g} value={g}>
                  پایه {g}
                </option>
              ))}
            </select>
          )}

          {dbClasses.length > 0 && (
            <select
              value={selectedClassFilter}
              onChange={(e) => setSelectedClassFilter(e.target.value)}
              className={styles.filterSelect}
            >
              <option value="all">همه کلاس‌ها</option>
              {dbClasses.map((cls) => (
                <option key={cls.id} value={cls.id}>
                  {cls.name} {cls.grade ? `(پایه ${cls.grade})` : ''}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Videos Grid */}
      {loading ? (
        <div className={styles.emptyState}>در حال بارگذاری ویدیوها...</div>
      ) : videos.length === 0 && !canManage ? (
        <div className={styles.emptyState}>
          هنوز ویدیویی برای کلاس‌های شما در این بخش منتشر نشده است.
        </div>
      ) : (
        <div className={styles.videosGrid}>
          {/* Explicit + Upload Card inside the grid for Teacher/Admin */}
          {canManage && (
            <button
              type="button"
              className={styles.addVideoCard}
              onClick={() =>
                setUploadModalState({
                  open: true,
                  defaultFolder: selectedFolder === 'all' ? 'عمومی' : selectedFolder,
                })
              }
            >
              <span className={styles.addVideoPlusCircle}>
                <HiOutlinePlus />
              </span>
              <span className={styles.addVideoLabel}>افزودن ویدیوی جدید</span>
              <span className={styles.addVideoSub}>
                در پوشه {selectedFolder === 'all' ? 'عمومی' : selectedFolder}
              </span>
            </button>
          )}

          {videos.map((video) => {
            const pdfCount = Array.isArray(video.pdfs) ? video.pdfs.length : video.pdf_url ? 1 : 0;
            return (
              <article key={video.id} className={styles.videoCard}>
                <div
                  role="button"
                  tabIndex={0}
                  className={styles.videoThumbArea}
                  onClick={() => setActiveVideo(video)}
                  onKeyDown={(e) => e.key === 'Enter' && setActiveVideo(video)}
                >
                  <div className={styles.playOverlay}>
                    <span className={styles.playCircle}>
                      <HiOutlinePlay />
                    </span>
                  </div>
                  <div className={styles.thumbTopBadges}>
                    <span className={styles.categoryBadge}>{video.category || 'آموزشی'}</span>
                    {pdfCount > 0 && (
                      <span className={styles.pdfCountBadge}>
                        <FaFilePdf /> {pdfCount} PDF
                      </span>
                    )}
                  </div>
                  <div className={styles.thumbBottomMeta}>
                    <span>
                      <HiOutlineEye /> {video.views_count || 0} بازدید
                    </span>
                  </div>
                </div>

                <div className={styles.videoCardBody}>
                  <h3 className={styles.videoCardTitle} onClick={() => setActiveVideo(video)}>
                    {video.title}
                  </h3>
                  {video.description && (
                    <p className={styles.videoCardDesc}>{video.description}</p>
                  )}

                  {/* Folders & DB Classes badges */}
                  <div className={styles.badgeWrap}>
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
                        </span>
                      ))}
                  </div>

                  {/* Card Action Bar */}
                  <div className={styles.cardActions}>
                    <button
                      type="button"
                      className={styles.cardActionPrimary}
                      onClick={() => setActiveVideo(video)}
                    >
                      <HiOutlinePlay /> پخش
                    </button>

                    <button
                      type="button"
                      className={styles.cardActionBtn}
                      title="دانلود ویدیو"
                      onClick={() => handleDownloadVideo(video)}
                    >
                      <HiOutlineArrowDownTray />
                    </button>

                    {canManage && (
                      <>
                        <button
                          type="button"
                          className={styles.cardActionBtn}
                          title="انتقال به پوشه دیگر"
                          onClick={() => setMoveShareState({ open: true, video, tab: 'move' })}
                        >
                          <HiOutlineArrowsRightLeft />
                        </button>
                        <button
                          type="button"
                          className={styles.cardActionBtn}
                          title="اشتراک در چند پوشه"
                          onClick={() => setMoveShareState({ open: true, video, tab: 'share' })}
                        >
                          <HiOutlineShare />
                        </button>
                        <button
                          type="button"
                          className={styles.cardActionBtn}
                          title="تعیین کلاس‌های مجاز"
                          onClick={() => setMoveShareState({ open: true, video, tab: 'classes' })}
                        >
                          <HiOutlineAcademicCap />
                        </button>
                        <button
                          type="button"
                          className={`${styles.cardActionBtn} ${styles.dangerIconBtn}`}
                          title="حذف ویدیو"
                          onClick={() => handleDeleteVideo(video)}
                        >
                          <HiOutlineTrash />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Modals */}
      {activeVideo && (
        <VideoPlayerModal
          video={activeVideo}
          canManage={canManage}
          onClose={() => setActiveVideo(null)}
          onVideoUpdated={handleVideoUpdated}
          onDownloadVideo={handleDownloadVideo}
        />
      )}

      {folderModalState.open && (
        <FolderModal
          initialFolder={folderModalState.folder}
          dbClasses={dbClasses}
          dbGrades={dbGrades}
          onClose={() => setFolderModalState({ open: false, folder: null })}
          onSaved={() => {
            setFolderModalState({ open: false, folder: null });
            refreshAll();
          }}
        />
      )}

      {uploadModalState.open && (
        <UploadVideoModal
          defaultFolderName={uploadModalState.defaultFolder}
          folders={folders}
          dbClasses={dbClasses}
          dbGrades={dbGrades}
          onClose={() => setUploadModalState({ open: false, defaultFolder: 'عمومی' })}
          onUploaded={() => {
            setUploadModalState({ open: false, defaultFolder: 'عمومی' });
            refreshAll();
          }}
        />
      )}

      {moveShareState.open && moveShareState.video && (
        <MoveShareModal
          video={moveShareState.video}
          initialTab={moveShareState.tab}
          folders={folders}
          dbClasses={dbClasses}
          onClose={() => setMoveShareState({ open: false, video: null, tab: 'move' })}
          onUpdated={(updated) => {
            handleVideoUpdated(updated);
            setMoveShareState({ open: false, video: null, tab: 'move' });
            refreshAll();
          }}
        />
      )}
    </div>
  );
}
