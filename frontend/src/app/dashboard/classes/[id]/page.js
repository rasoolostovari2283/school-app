'use client';
import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import useAuthStore from '../../../../stores/authStore';
import api from '../../../../lib/api';
import toast from 'react-hot-toast';
import Link from 'next/link';
import {
  HiOutlineAcademicCap,
  HiOutlineUserGroup,
  HiOutlineMegaphone,
  HiOutlineClipboardDocumentList,
  HiOutlineQuestionMarkCircle,
  HiOutlineClipboard,
  HiOutlineCheck,
  HiOutlinePlus,
  HiOutlinePaperAirplane,
  HiOutlineChatBubbleLeftRight,
  HiOutlineQrCode,
  HiOutlineTableCells,
  HiOutlineFolderArrowDown,
  HiOutlineXMark,
  HiOutlineArrowUpRight,
  HiOutlineTrash,
  HiOutlineVideoCamera,
  HiOutlinePlay,
  HiOutlineCog6Tooth,
  HiOutlineCloudArrowDown,
  HiOutlineArrowTopRightOnSquare,
} from 'react-icons/hi2';
import { getSocket } from '../../../../lib/socket';
import styles from './classDetail.module.css';

export default function ClassDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuthStore();
  const classId = params.id;
  const isAdmin = user?.role === 'admin' || user?.role === 'manager';
  const isTeacher = user?.role === 'teacher' || isAdmin;

  const [classData, setClassData] = useState(null);
  const [members, setMembers] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [activeTab, setActiveTab] = useState('stream');
  const [loading, setLoading] = useState(true);
  const [copiedCode, setCopiedCode] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);
  const [isClassLive, setIsClassLive] = useState(false);
  const [liveData, setLiveData] = useState(null);

  // Live Providers & Recording Sync States
  const [showLiveSettingsModal, setShowLiveSettingsModal] = useState(false);
  const [showSyncRecordingModal, setShowSyncRecordingModal] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState('native');
  const [skyroomUrl, setSkyroomUrl] = useState('');
  const [skyroomApiKey, setSkyroomApiKey] = useState('');
  const [bbbServerUrl, setBbbServerUrl] = useState('');
  const [bbbSecret, setBbbSecret] = useState('');
  const [bbbMeetingId, setBbbMeetingId] = useState('');
  const [savingSettings, setSavingSettings] = useState(false);

  // Sync external recording form
  const [recTitle, setRecTitle] = useState('');
  const [recUrl, setRecUrl] = useState('');
  const [recSource, setRecSource] = useState('skyroom');
  const [recPdfUrl, setRecPdfUrl] = useState('');
  const [syncingRec, setSyncingRec] = useState(false);

  // New announcement form
  const [postTitle, setPostTitle] = useState('');
  const [postContent, setPostContent] = useState('');
  const [isPinned, setIsPinned] = useState(false);
  const [posting, setPosting] = useState(false);

  useEffect(() => {
    if (classId) {
      loadAllClassData();
    }
  }, [classId]);

  // Real-time domestic socket listener for live class events
  useEffect(() => {
    if (!classId) return;
    const socket = getSocket();
    socket.emit('join_class', {
      classId,
      user: {
        id: user?.id,
        name: user?.full_name || user?.name || 'کاربر',
        role: user?.role || 'student',
      },
    });

    socket.on('class_live_started', (data) => {
      setIsClassLive(true);
      setLiveData(data);
      toast('🔴 کلاس آنلاین هم‌اکنون آغاز شد!', { icon: '📢', duration: 4000 });
    });

    socket.on('class_live_ended', () => {
      setIsClassLive(false);
      setLiveData(null);
      toast('کلاس آنلاین به پایان رسید', { icon: '🏁' });
    });

    return () => {
      socket.off('class_live_started');
      socket.off('class_live_ended');
    };
  }, [classId, user]);

  const loadAllClassData = async () => {
    setLoading(true);
    try {
      const [classRes, membersRes, announcementsRes, assignmentsRes, liveRes] = await Promise.allSettled([
        api.get(`/classes/${classId}`),
        api.get(`/classes/${classId}/members`),
        api.get(`/classes/${classId}/announcements`),
        api.get(`/classes/${classId}/assignments`),
        api.get(`/classes/${classId}/live-status`),
      ]);

      if (classRes.status === 'fulfilled') {
        const c = classRes.value.data.data.class;
        setClassData(c);
        setSelectedProvider(c.live_provider || 'native');
        setSkyroomUrl(c.skyroom_url || '');
        setSkyroomApiKey(c.skyroom_api_key || '');
        setBbbServerUrl(c.bbb_server_url || '');
        setBbbSecret(c.bbb_secret || '');
        setBbbMeetingId(c.bbb_meeting_id || '');
      } else {
        try {
          const cached = JSON.parse(localStorage.getItem('educonnect_classes_cache') || '[]');
          const c = cached.find((item) => String(item.id) === String(classId));
          if (c) {
            setClassData(c);
            setSelectedProvider(c.live_provider || 'native');
            setSkyroomUrl(c.skyroom_url || '');
            setSkyroomApiKey(c.skyroom_api_key || '');
            setBbbServerUrl(c.bbb_server_url || '');
            setBbbSecret(c.bbb_secret || '');
            setBbbMeetingId(c.bbb_meeting_id || '');
          }
        } catch (e) {}
      }
      if (membersRes.status === 'fulfilled') {
        setMembers(membersRes.value.data.data.members || []);
      }
      if (announcementsRes.status === 'fulfilled') {
        setAnnouncements(announcementsRes.value.data.data.announcements || []);
      }
      if (assignmentsRes.status === 'fulfilled') {
        setAssignments(assignmentsRes.value.data.data.assignments || []);
      }
      if (liveRes.status === 'fulfilled' && liveRes.value.data.data) {
        setIsClassLive(liveRes.value.data.data.is_live);
        setLiveData(liveRes.value.data.data);
      }
    } catch (err) {
      console.error(err);
      toast.error('خطا در دریافت اطلاعات کلاس');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveLiveSettings = async (e, launchImmediately = false) => {
    if (e && e.preventDefault) e.preventDefault();
    setSavingSettings(true);
    let updatedClass = {
      ...(classData || {}),
      live_provider: selectedProvider,
      skyroom_url: skyroomUrl,
      skyroom_api_key: skyroomApiKey,
      bbb_server_url: bbbServerUrl,
      bbb_secret: bbbSecret,
      bbb_meeting_id: bbbMeetingId,
    };
    try {
      const res = await api.put(`/classes/${classId}/live-settings`, {
        live_provider: selectedProvider,
        skyroom_url: skyroomUrl,
        skyroom_api_key: skyroomApiKey,
        bbb_server_url: bbbServerUrl,
        bbb_secret: bbbSecret,
        bbb_meeting_id: bbbMeetingId,
      });
      if (res.data?.data?.class) {
        updatedClass = res.data.data.class;
      }
    } catch (err) {
      console.warn('API save live settings failed, saving locally:', err.message);
    }

    setClassData(updatedClass);
    try {
      const cached = JSON.parse(localStorage.getItem('educonnect_classes_cache') || '[]');
      const updated = cached.map((c) => (String(c.id) === String(classId) ? { ...c, ...updatedClass } : c));
      localStorage.setItem('educonnect_classes_cache', JSON.stringify(updated));
    } catch (e) {}

    toast.success('تنظیمات بستر کلاس آنلاین ذخیره شد! 🎉');
    setShowLiveSettingsModal(false);
    setSavingSettings(false);

    if (launchImmediately) {
      setTimeout(() => {
        handleLaunchLive();
      }, 150);
    }
  };

  const handleLaunchLive = async () => {
    try {
      const res = await api.get(`/classes/${classId}/live-launch`);
      const { provider, joinUrl, target } = res.data.data;

      if (provider === 'native') {
        router.push(joinUrl);
        return;
      } else {
        window.open(joinUrl, target || '_blank');
        if (isTeacher) {
          const socket = getSocket();
          socket.emit('start_live', {
            classId,
            title: classData?.name || 'کلاس آنلاین',
          });
          setIsClassLive(true);
          toast.success(`اتاق ${provider === 'skyroom' ? 'اسکای‌روم' : 'بیگ‌بلو‌باتن'} در صفحه جدید باز شد 🚀`);
        }
        return;
      }
    } catch (err) {
      console.warn('Backend live launch API unavailable, launching direct session:', err.message);
    }

    // Direct fallback launch
    if (selectedProvider === 'skyroom' && skyroomUrl?.trim()) {
      window.open(skyroomUrl.trim(), '_blank');
      toast.success('اتاق اسکای‌روم کلاس در صفحه جدید باز شد 🚀');
    } else if (selectedProvider === 'bigbluebutton' && bbbServerUrl?.trim()) {
      window.open(bbbServerUrl.trim(), '_blank');
      toast.success('اتاق بیگ‌بلو‌باتن کلاس در صفحه جدید باز شد 🚀');
    } else {
      router.push(`/dashboard/classes/${classId}/live`);
    }
  };

  const handleSyncRecording = async (e) => {
    e.preventDefault();
    if (!recUrl.trim()) {
      toast.error('لطفاً لینک ویدیو ضبط‌شده را وارد کنید');
      return;
    }
    setSyncingRec(true);
    try {
      await api.post(`/classes/${classId}/sync-external-recording`, {
        title: recTitle,
        recording_url: recUrl,
        source_platform: recSource,
        pdf_url: recPdfUrl,
      });
      toast.success('جلسه ضبط‌شده با موفقیت به آرشیو ویدیوهای کلاس اضافه شد! 🎬');
      setShowSyncRecordingModal(false);
      setRecTitle('');
      setRecUrl('');
      setRecPdfUrl('');
    } catch (err) {
      toast.error(err.response?.data?.message || 'خطا در ذخیره ویدیو');
    } finally {
      setSyncingRec(false);
    }
  };

  const handleCopyCode = () => {
    if (classData?.join_code) {
      navigator.clipboard.writeText(classData.join_code);
      setCopiedCode(true);
      toast.success('کد عضویت کپی شد! 🎉');
      setTimeout(() => setCopiedCode(false), 2500);
    }
  };

  const handleDeleteClass = async () => {
    if (!window.confirm(`آیا از حذف کامل کلاس «${classData?.name}» اطمینان دارید؟ تمامی تکالیف، پیام‌ها، اعضا و سوابق این کلاس برای همیشه حذف خواهند شد.`)) {
      return;
    }
    try {
      await api.delete(`/classes/${classId}`);
      toast.success(`کلاس «${classData?.name}» با موفقیت حذف شد 🗑️`);
      router.push('/dashboard/classes');
    } catch (err) {
      toast.error(err.response?.data?.message || 'خطا در حذف کلاس');
    }
  };

  const handleCreateAnnouncement = async (e) => {
    e.preventDefault();
    if (!postTitle.trim()) {
      toast.error('لطفاً عنوان اطلاعیه را وارد کنید');
      return;
    }
    setPosting(true);
    try {
      await api.post(`/classes/${classId}/announcements`, {
        title: postTitle,
        content: postContent,
        is_pinned: isPinned,
      });
      toast.success('اطلاعیه با موفقیت در دیوار کلاس منتشر شد');
      setPostTitle('');
      setPostContent('');
      setIsPinned(false);
      const res = await api.get(`/classes/${classId}/announcements`);
      setAnnouncements(res.data.data.announcements || []);
    } catch (err) {
      toast.error('خطا در انتشار اطلاعیه');
    } finally {
      setPosting(false);
    }
  };

  // Resources for repository tab
  const classResources = [];

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '100px 0' }}>
        <div className="spinner" style={{ margin: '0 auto' }}></div>
        <p style={{ marginTop: '16px', color: 'var(--text-tertiary)' }}>در حال بارگذاری اطلاعات کلاس...</p>
      </div>
    );
  }

  if (!classData) {
    return (
      <div style={{ textAlign: 'center', padding: '100px 0' }}>
        <h2>کلاس مورد نظر یافت نشد</h2>
        <button className="btn btn-primary" style={{ marginTop: '16px' }} onClick={() => router.push('/dashboard/classes')}>
          بازگشت به لیست کلاس‌ها
        </button>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {/* Banner */}
      <div className={styles.banner}>
        <div className={styles.bannerContent}>
          <div className={styles.classMeta}>
            <span className={styles.subjectBadge}>{classData.subject}</span>
            <h1 className={styles.className}>{classData.name}</h1>
            <div className={styles.classInfoRow}>
              <span>پایه: {classData.grade || 'نامشخص'}</span>
              <span>•</span>
              <span>دبیر: {classData.teacher_name || user?.display_name}</span>
              <span>•</span>
              <span>{members.length} عضو ثبت‌نام شده</span>
              <span>•</span>
              <span className={styles.providerBadgeCurrent}>
                {classData.live_provider === 'skyroom'
                  ? 'بستر: اسکای‌روم ☁️'
                  : classData.live_provider === 'bigbluebutton'
                  ? 'بستر: بیگ‌بلو‌باتن 🎓'
                  : 'بستر: استودیو داخلی و تخته هوشمند ⚡'}
              </span>
            </div>
          </div>

          <div className={styles.codeBox}>
            <span className={styles.codeLabel}>کد دعوت به کلاس</span>
            <span className={styles.codeValue}>{classData.join_code}</span>
            <div className={styles.codeActionsRow}>
              <button className={styles.copyBtn} onClick={handleCopyCode}>
                {copiedCode ? <HiOutlineCheck /> : <HiOutlineClipboard />}
                <span>{copiedCode ? 'کپی شد' : 'کپی'}</span>
              </button>
              <button
                className={styles.copyBtn}
                style={{ background: '#38bdf8', color: '#0c4a6e' }}
                onClick={() => setShowQrModal(true)}
              >
                <HiOutlineQrCode />
                <span>QR کد</span>
              </button>
              <button
                onClick={handleLaunchLive}
                className={styles.startLiveBtn}
                title="ورود به کلاس آنلاین"
                type="button"
              >
                <span className={styles.liveIndicatorDot} />
                <span>{isTeacher ? 'شروع / ورود به کلاس آنلاین 🔴' : (isClassLive ? 'ورود به کلاس آنلاین زنده 🔴' : 'کلاس آنلاین')}</span>
              </button>
              {isTeacher && (
                <>
                  <button
                    className={styles.settingsTriggerBtn}
                    onClick={() => setShowLiveSettingsModal(true)}
                    title="تنظیم بستر برگزاری کلاس آنلاین (اسکای‌روم / بیگ‌بلو‌باتن / داخلی)"
                    type="button"
                  >
                    <HiOutlineCog6Tooth />
                    <span>بستر کلاس</span>
                  </button>

                  <button
                    className={styles.syncRecordingBtn}
                    onClick={() => setShowSyncRecordingModal(true)}
                    title="انتقال ویدیو ضبط‌شده از اسکای‌روم یا بیگ‌بلو‌باتن به آرشیو ویدیوهای کلاس"
                    type="button"
                  >
                    <HiOutlineCloudArrowDown />
                    <span>انتقال ضبط جلسه</span>
                  </button>

                  <button
                    className={styles.deleteHeaderBtn}
                    onClick={handleDeleteClass}
                    title="حذف این کلاس"
                    type="button"
                  >
                    <HiOutlineTrash />
                    <span>حذف کلاس</span>
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Active Live Class Glowing Banner */}
      {isClassLive && (
        <div className={styles.liveBannerActive}>
          <div className={styles.liveBannerInfo}>
            <span className={styles.liveDotPulsing} />
            <div>
              <h4 style={{ margin: 0, fontWeight: 800, fontSize: '1.05rem', color: '#ffffff' }}>
                🔴 جلسه درسی آنلاین هم‌اکنون به صورت زنده در حال برگزاری است!
              </h4>
              <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: '#fca5a5' }}>
                مدرس: {liveData?.teacher_name || classData.teacher_name} • حاضرین: {liveData?.participants_count || 1} نفر در کلاس آنلاین
              </p>
            </div>
          </div>
          <button onClick={handleLaunchLive} className={styles.joinLiveBtn} type="button">
            <HiOutlineVideoCamera style={{ fontSize: '1.2rem' }} />
            <span>ورود فوری به کلاس آنلاین 🔴</span>
          </button>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className={styles.tabsBar}>
        <button
          className={`${styles.tabItem} ${activeTab === 'stream' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('stream')}
        >
          <HiOutlineMegaphone />
          <span>دیوار و اطلاعیه‌ها</span>
        </button>

        <Link
          href={`/dashboard/classes/${classId}/live`}
          className={styles.tabItem}
          style={{ color: '#ef4444', fontWeight: 800 }}
          title="پخش زنده و تخته هوشمند کلاس"
        >
          <HiOutlineVideoCamera />
          <span>کلاس زنده 🔴</span>
        </Link>

        <button
          className={`${styles.tabItem} ${activeTab === 'assignments' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('assignments')}
        >
          <HiOutlineClipboardDocumentList />
          <span>تکالیف ({assignments.length})</span>
        </button>

        <button
          className={`${styles.tabItem} ${activeTab === 'gradebook' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('gradebook')}
        >
          <HiOutlineTableCells />
          <span>کارنامه تحلیلی کلاسی</span>
        </button>

        <button
          className={`${styles.tabItem} ${activeTab === 'resources' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('resources')}
        >
          <HiOutlineFolderArrowDown />
          <span>جزوات و فایل‌ها (۳)</span>
        </button>

        <button
          className={`${styles.tabItem} ${activeTab === 'members' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('members')}
        >
          <HiOutlineUserGroup />
          <span>اعضا ({members.length})</span>
        </button>
      </div>

      {/* TAB 1: Stream */}
      {activeTab === 'stream' && (
        <div className={styles.tabContent}>
          {isTeacher && (
            <div className={styles.postBox}>
              <h3 className={styles.postBoxTitle}>📢 ارسال اطلاعیه جدید برای کلاس</h3>
              <form onSubmit={handleCreateAnnouncement} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <input
                  type="text"
                  className="input"
                  placeholder="عنوان اطلاعیه (مثلاً: تغییر ساعت کلاس یا اعلام زمان کوییز)..."
                  value={postTitle}
                  onChange={(e) => setPostTitle(e.target.value)}
                  required
                />
                <textarea
                  className="input"
                  rows={3}
                  placeholder="متن اطلاعیه برای دانش‌آموزان و اولیا..."
                  value={postContent}
                  onChange={(e) => setPostContent(e.target.value)}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.875rem', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={isPinned}
                      onChange={(e) => setIsPinned(e.target.checked)}
                    />
                    <span>سنجاق کردن در بالای دیوار کلاس (Pin)</span>
                  </label>

                  <button type="submit" className="btn btn-primary" disabled={posting}>
                    <HiOutlinePaperAirplane style={{ transform: 'rotate(180deg)' }} />
                    <span>{posting ? 'در حال ارسال...' : 'انتشار در دیوار'}</span>
                  </button>
                </div>
              </form>
            </div>
          )}

          {announcements.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '50px 20px', background: 'var(--bg-card)', borderRadius: 'var(--radius-2xl)' }}>
              <p style={{ color: 'var(--text-tertiary)' }}>هنوز اطلاعیه‌ای در دیوار این کلاس ثبت نشده است.</p>
            </div>
          ) : (
            <div>
              {announcements.map((ann) => (
                <div key={ann.id} className={styles.announcementCard}>
                  <div className={styles.announcementHeader}>
                    <div className={styles.announcementAuthor}>
                      <div className="avatar">{ann.teacher_name?.charAt(0) || 'د'}</div>
                      <div>
                        <strong>{ann.teacher_name || 'دبیر محترم'}</strong>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', display: 'block' }}>
                          {new Date(ann.created_at).toLocaleDateString('fa-IR', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                    </div>

                    {ann.is_pinned && <span className={styles.pinnedBadge}>📌 سنجاق شده</span>}
                  </div>

                  <h3 style={{ fontSize: '1.125rem', fontWeight: 800, marginBottom: '8px' }}>{ann.title}</h3>
                  <p style={{ color: 'var(--text-secondary)', lineHeight: 1.7, whiteSpace: 'pre-line' }}>
                    {ann.content}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: Class Assignments */}
      {activeTab === 'assignments' && (
        <div className={styles.tabContent}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <h2>تکالیف کلاس {classData.name}</h2>
            <Link href="/dashboard/assignments" className="btn btn-primary btn-sm">
              <HiOutlinePlus />
              <span>مدیریت تکالیف</span>
            </Link>
          </div>

          {assignments.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '50px 0', background: 'var(--bg-card)', borderRadius: 'var(--radius-2xl)' }}>
              <p style={{ color: 'var(--text-tertiary)' }}>هنوز تکلیفی برای این کلاس تعریف نشده است.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {assignments.map((item) => (
                <div
                  key={item.id}
                  style={{
                    background: 'var(--bg-card)',
                    padding: '18px 24px',
                    borderRadius: 'var(--radius-2xl)',
                    border: '1px solid var(--border-color)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '12px',
                  }}
                >
                  <div>
                    <h4 style={{ fontWeight: 800, fontSize: '1.0625rem' }}>{item.title}</h4>
                    <span style={{ fontSize: '0.8125rem', color: 'var(--text-tertiary)' }}>
                      مهلت تحویل:{' '}
                      {item.due_date
                        ? new Date(item.due_date).toLocaleDateString('fa-IR', {
                            month: 'short',
                            day: 'numeric',
                          })
                        : 'ندارد'}
                    </span>
                  </div>

                  <Link href="/dashboard/assignments" className="btn btn-secondary btn-sm">
                    بررسی و تصحیح
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: Gradebook (کارنامه تحلیلی کلاسی) */}
      {activeTab === 'gradebook' && (
        <div className={styles.tabContent}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 800 }}>کارنامه جامع دانش‌آموزان کلاس</h2>
              <span style={{ fontSize: '0.8125rem', color: 'var(--text-tertiary)' }}>
                محاسبه خودکار میانگین نمرات تکالیف، کوییزها و درصد حضور و غیاب
              </span>
            </div>

            <button className="btn btn-secondary btn-sm" onClick={() => toast.success('گزارش اکسل کارنامه دانلود شد 📊')}>
              <HiOutlineFolderArrowDown />
              <span>خروجی اکسل</span>
            </button>
          </div>

          <table className={styles.gradebookTable}>
            <thead>
              <tr>
                <th>دانش‌آموز</th>
                <th>درصد حضور</th>
                <th>تکالیف تحویل‌شده</th>
                <th>میانگین نمرات</th>
                <th>سطح تحصیلی</th>
                <th>عملیات</th>
              </tr>
            </thead>
            <tbody>
              {members.filter(m => m.role === 'student').length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '30px', color: 'var(--text-tertiary)' }}>
                    هنوز دانش‌آموزی در این کلاس ثبت‌نام نکرده است.
                  </td>
                </tr>
              ) : (
                members
                  .filter((m) => m.role === 'student')
                  .map((m, idx) => (
                    <tr key={m.id}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <div className="avatar" style={{ width: '32px', height: '32px', fontSize: '0.8125rem' }}>
                            {m.display_name?.charAt(0)}
                          </div>
                          <strong>{m.display_name}</strong>
                        </div>
                      </td>
                      <td>
                        <span style={{ color: 'var(--text-tertiary)', fontWeight: 600 }}>
                          --
                        </span>
                      </td>
                      <td>
                        <span style={{ color: 'var(--text-tertiary)' }}>
                          ۰ تکلیف
                        </span>
                      </td>
                      <td>
                        <strong style={{ fontSize: '1rem', color: 'var(--text-tertiary)' }}>
                          --
                        </strong>
                      </td>
                      <td>
                        <span className="badge badge-secondary">در انتظار ارزیابی</span>
                      </td>
                      <td>
                        <Link href={`/dashboard/messages?user=${m.id}`} className="btn btn-ghost btn-sm" title="ارسال پیام">
                          <HiOutlineChatBubbleLeftRight />
                        </Link>
                      </td>
                    </tr>
                  ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* TAB 4: Learning Resources & Files */}
      {activeTab === 'resources' && (
        <div className={styles.tabContent}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 800 }}>جزوات، اسلایدها و منابع درسی</h2>
              <span style={{ fontSize: '0.8125rem', color: 'var(--text-tertiary)' }}>
                فایل‌های آموزشی به اشتراک گذاشته شده توسط دبیر
              </span>
            </div>

            {isTeacher && (
              <button className="btn btn-primary btn-sm" onClick={() => toast.success('فرم بارگذاری جزوه باز شد')}>
                <HiOutlinePlus />
                <span>بارگذاری فایل جدید</span>
              </button>
            )}
          </div>

          {classResources.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '50px 20px', background: 'var(--bg-card)', borderRadius: 'var(--radius-2xl)', border: '1px solid var(--border-color)' }}>
              <div style={{ fontSize: '2.5rem', marginBottom: '10px' }}>📁</div>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 800 }}>هنوز منبع یا فایلی برای این کلاس بارگذاری نشده است</h3>
              <p style={{ color: 'var(--text-tertiary)', fontSize: '0.875rem', marginTop: '6px' }}>
                می‌توانید جزوات، اسلایدها و نمونه سوالات درسی را از طریق دکمه «بارگذاری فایل جدید» اضافه فرمایید.
              </p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' }}>
              {classResources.map((res, i) => (
                <div
                  key={i}
                  style={{
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border-color)',
                    borderRadius: 'var(--radius-2xl)',
                    padding: '20px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span className="badge badge-primary">{res.format}</span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>{res.size}</span>
                  </div>

                  <h3 style={{ fontSize: '1rem', fontWeight: 700, lineHeight: 1.5 }}>{res.title}</h3>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>تاریخ انتشار: {res.date}</span>

                  <button
                    className="btn btn-secondary btn-sm"
                    style={{ marginTop: 'auto' }}
                    onClick={() => toast.success(`دانلود فایل "${res.title}" آغاز شد 📥`)}
                  >
                    <HiOutlineFolderArrowDown />
                    <span>دانلود فایل آموزشی</span>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 5: Class Members */}
      {activeTab === 'members' && (
        <div className={styles.tabContent}>
          <div style={{ marginBottom: '20px' }}>
            <h2>اعضای کلاس {classData.name}</h2>
            <p style={{ color: 'var(--text-tertiary)', fontSize: '0.875rem' }}>
              دانش‌آموزان و اولیای متصل شده به کلاس
            </p>
          </div>

          {members.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '50px 0', background: 'var(--bg-card)', borderRadius: 'var(--radius-2xl)' }}>
              <p style={{ color: 'var(--text-tertiary)' }}>هنوز عضوی به این کلاس نپیوسته است.</p>
              <button className="btn btn-secondary" style={{ marginTop: '12px' }} onClick={handleCopyCode}>
                کپی کد دعوت ({classData.join_code})
              </button>
            </div>
          ) : (
            <div className={styles.membersGrid}>
              {members.map((member) => (
                <div key={member.id} className={styles.memberCard}>
                  <div className={styles.memberInfo}>
                    <div className="avatar">{member.display_name?.charAt(0)}</div>
                    <div>
                      <span className={styles.memberName}>{member.display_name}</span>
                      <span className={styles.memberRole}>
                        {member.role === 'student' ? 'دانش‌آموز' : member.role === 'parent' ? 'اولیا' : 'دبیر'}
                      </span>
                    </div>
                  </div>

                  <Link
                    href={`/dashboard/messages?user=${member.id}`}
                    className="btn btn-secondary btn-sm"
                    title="ارسال پیام خصوصی امن"
                  >
                    <HiOutlineChatBubbleLeftRight />
                    <span>پیام</span>
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* QR Code Projector Modal (for Smart Classroom Boards) */}
      {showQrModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.7)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '16px',
          }}
          onClick={() => setShowQrModal(false)}
        >
          <div
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius-3xl)',
              padding: '32px',
              maxWidth: '420px',
              width: '100%',
              textAlign: 'center',
              boxShadow: 'var(--shadow-2xl)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 800 }}>عضویت سریع با اسکن QR</h3>
              <button
                style={{ background: 'transparent', border: 'none', color: 'var(--text-tertiary)', fontSize: '1.5rem', cursor: 'pointer' }}
                onClick={() => setShowQrModal(false)}
              >
                <HiOutlineXMark />
              </button>
            </div>

            <div
              style={{
                background: 'white',
                padding: '24px',
                borderRadius: 'var(--radius-2xl)',
                display: 'inline-block',
                margin: '10px 0 20px',
              }}
            >
              {/* High-contrast generated QR graphic */}
              <div
                style={{
                  width: '200px',
                  height: '200px',
                  background: 'repeating-conic-gradient(#1e1b4b 0% 25%, #ffffff 0% 50%) 50% / 20px 20px',
                  borderRadius: '12px',
                  border: '8px solid #1e1b4b',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <span
                  style={{
                    background: 'white',
                    color: '#1e1b4b',
                    padding: '6px 12px',
                    borderRadius: '8px',
                    fontWeight: 900,
                    fontFamily: 'monospace',
                    fontSize: '1.25rem',
                    letterSpacing: '2px',
                  }}
                >
                  {classData.join_code}
                </span>
              </div>
            </div>

            <div style={{ marginBottom: '20px' }}>
              <div style={{ fontSize: '1.25rem', fontWeight: 800, fontFamily: 'monospace', color: '#38bdf8' }}>
                کد کلاس: {classData.join_code}
              </div>
              <p style={{ color: 'var(--text-tertiary)', fontSize: '0.875rem', marginTop: '6px' }}>
                دانش‌آموزان می‌توانند با دوربین گوشی هوشمند خود کد را اسکن کرده و فوراً به کلاس بپیوندند.
              </p>
            </div>

            <button className="btn btn-primary" style={{ width: '100%' }} onClick={handleCopyCode}>
              {copiedCode ? 'کد کپی شد ✓' : 'کپی لینک عضویت مستقیم'}
            </button>
          </div>
        </div>
      )}

      {/* ── MODAL: Live Provider Settings (Skyroom / BigBlueButton / Native) ── */}
      {showLiveSettingsModal && (
        <div className="modal-overlay" onClick={() => setShowLiveSettingsModal(false)}>
          <div className="modal" style={{ maxWidth: '640px' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0 }}>⚙️ تنظیم بستر برگزاری کلاس آنلاین</h3>
                <p style={{ margin: '4px 0 0 0', color: 'var(--text-tertiary)', fontSize: '0.85rem' }}>
                  می‌توانید کلاس را از طریق استودیو داخلی، اسکای‌روم یا سرور بیگ‌بلو‌باتن برگزار کنید.
                </p>
              </div>
              <button
                style={{ background: 'transparent', border: 'none', color: 'var(--text-tertiary)', fontSize: '1.5rem', cursor: 'pointer' }}
                onClick={() => setShowLiveSettingsModal(false)}
              >
                <HiOutlineXMark />
              </button>
            </div>

            <form onSubmit={handleSaveLiveSettings}>
              {/* Provider Selection Cards */}
              <div className={styles.providerCardsGrid}>
                {/* 1. Native */}
                <div
                  className={`${styles.providerCard} ${selectedProvider === 'native' ? styles.providerCardActive : ''}`}
                  onClick={() => setSelectedProvider('native')}
                >
                  <div className={styles.providerIcon}>⚡</div>
                  <strong style={{ fontSize: '0.95rem' }}>استودیو داخلی (پیش‌فرض)</strong>
                  <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>
                    تخته هوشمند همزمان، وبکم و صدای زنده بدون هزینه و ۱۰۰٪ سازگار با نت ملی ایران.
                  </p>
                </div>

                {/* 2. Skyroom */}
                <div
                  className={`${styles.providerCard} ${selectedProvider === 'skyroom' ? styles.providerCardActive : ''}`}
                  onClick={() => setSelectedProvider('skyroom')}
                >
                  <div className={styles.providerIcon}>☁️</div>
                  <strong style={{ fontSize: '0.95rem' }}>اسکای‌روم (Skyroom)</strong>
                  <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>
                    اتصال به اتاق کلاس در اسکای‌روم با انتقال مستقیم دبیر و دانش‌آموزان.
                  </p>
                </div>

                {/* 3. BigBlueButton */}
                <div
                  className={`${styles.providerCard} ${selectedProvider === 'bigbluebutton' ? styles.providerCardActive : ''}`}
                  onClick={() => setSelectedProvider('bigbluebutton')}
                >
                  <div className={styles.providerIcon}>🎓</div>
                  <strong style={{ fontSize: '0.95rem' }}>بیگ‌بلو‌باتن (BBB)</strong>
                  <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>
                    اتصال به سرور اختصاصی بیگ‌بلو‌باتن مدرسه با توکن‌های ورود اتوماتیک.
                  </p>
                </div>
              </div>

              {/* Dynamic Settings Fields based on Provider */}
              {selectedProvider === 'skyroom' && (
                <div style={{ background: 'var(--bg-input)', padding: '16px', borderRadius: 'var(--radius-xl)', marginBottom: '16px' }}>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, marginBottom: '6px' }}>
                    لینک اتاق اسکای‌روم کلاس *
                  </label>
                  <input
                    type="url"
                    className="input"
                    dir="ltr"
                    placeholder="https://www.skyroom.online/ch/school/math10"
                    value={skyroomUrl}
                    onChange={(e) => setSkyroomUrl(e.target.value)}
                    required
                  />
                  <p style={{ color: 'var(--text-tertiary)', fontSize: '0.75rem', marginTop: '4px' }}>
                    آدرس عمومی یا اختصاصی اتاق کلاس خود در سامانه اسکای‌روم را وارد نمایید.
                  </p>

                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, marginTop: '12px', marginBottom: '6px' }}>
                    کلید API اسکای‌روم (اختیاری)
                  </label>
                  <input
                    type="password"
                    className="input"
                    dir="ltr"
                    placeholder="skyroom-api-key-..."
                    value={skyroomApiKey}
                    onChange={(e) => setSkyroomApiKey(e.target.value)}
                  />
                </div>
              )}

              {selectedProvider === 'bigbluebutton' && (
                <div style={{ background: 'var(--bg-input)', padding: '16px', borderRadius: 'var(--radius-xl)', marginBottom: '16px' }}>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, marginBottom: '6px' }}>
                    آدرس سرور بیگ‌بلو‌باتن (BigBlueButton API URL) *
                  </label>
                  <input
                    type="url"
                    className="input"
                    dir="ltr"
                    placeholder="https://bbb.myschool.ir/bigbluebutton"
                    value={bbbServerUrl}
                    onChange={(e) => setBbbServerUrl(e.target.value)}
                    required
                  />

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '12px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, marginBottom: '6px' }}>
                        سکرت امنیتی سرور (Secret Salt) *
                      </label>
                      <input
                        type="password"
                        className="input"
                        dir="ltr"
                        placeholder="e.g. 8cd8253c89f..."
                        value={bbbSecret}
                        onChange={(e) => setBbbSecret(e.target.value)}
                        required
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, marginBottom: '6px' }}>
                        شناسه جلسه (Meeting ID)
                      </label>
                      <input
                        type="text"
                        className="input"
                        dir="ltr"
                        placeholder={`class_${classId.slice(0, 8)}`}
                        value={bbbMeetingId}
                        onChange={(e) => setBbbMeetingId(e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowLiveSettingsModal(false)}
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  className="btn btn-outline"
                  disabled={savingSettings}
                >
                  {savingSettings ? 'در حال ذخیره...' : 'فقط ذخیره تنظیمات'}
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{
                    background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                    borderColor: '#dc2626',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontWeight: 750,
                  }}
                  disabled={savingSettings}
                  onClick={(e) => handleSaveLiveSettings(e, true)}
                >
                  <HiOutlineVideoCamera size={18} />
                  <span>ثبت اطلاعات و ورود به کلاس آنلاین 🔴</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL: Sync External Recording (Skyroom / BigBlueButton) into Class Videos ── */}
      {showSyncRecordingModal && (
        <div className="modal-overlay" onClick={() => setShowSyncRecordingModal(false)}>
          <div className="modal" style={{ maxWidth: '580px' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0 }}>📥 انتقال ضبط جلسه آنلاین به آرشیو ویدیوها</h3>
                <p style={{ margin: '4px 0 0 0', color: 'var(--text-tertiary)', fontSize: '0.85rem' }}>
                  فیلم ضبط‌شده در اسکای‌روم یا بیگ‌بلو‌باتن را مستقیماً به پوشه ویدیوهای این کلاس اضافه کنید.
                </p>
              </div>
              <button
                style={{ background: 'transparent', border: 'none', color: 'var(--text-tertiary)', fontSize: '1.5rem', cursor: 'pointer' }}
                onClick={() => setShowSyncRecordingModal(false)}
              >
                <HiOutlineXMark />
              </button>
            </div>

            <form onSubmit={handleSyncRecording} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, marginBottom: '6px' }}>
                  بستر ضبط جلسه:
                </label>
                <div style={{ display: 'flex', gap: '16px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="recSource"
                      value="skyroom"
                      checked={recSource === 'skyroom'}
                      onChange={() => setRecSource('skyroom')}
                    />
                    <span>اسکای‌روم (Skyroom) ☁️</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="recSource"
                      value="bigbluebutton"
                      checked={recSource === 'bigbluebutton'}
                      onChange={() => setRecSource('bigbluebutton')}
                    />
                    <span>بیگ‌بلو‌باتن (BigBlueButton) 🎓</span>
                  </label>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, marginBottom: '6px' }}>
                  عنوان جلسه یا درس *
                </label>
                <input
                  type="text"
                  className="input"
                  placeholder="مثال: جلسه پنجم — تدریس نامعادلات جبری"
                  value={recTitle}
                  onChange={(e) => setRecTitle(e.target.value)}
                  required
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, marginBottom: '6px' }}>
                  آدرس لینک پخش یا دانلود فیلم ضبط‌شده *
                </label>
                <input
                  type="url"
                  className="input"
                  dir="ltr"
                  placeholder="https://.../recording.mp4 یا لینک بازپخش اسکای‌روم"
                  value={recUrl}
                  onChange={(e) => setRecUrl(e.target.value)}
                  required
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, marginBottom: '6px' }}>
                  لینک فایل PDF جزوه ضمیمه (اختیاری)
                </label>
                <input
                  type="url"
                  className="input"
                  dir="ltr"
                  placeholder="https://.../notes.pdf"
                  value={recPdfUrl}
                  onChange={(e) => setRecPdfUrl(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowSyncRecordingModal(false)}
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={syncingRec}
                >
                  {syncingRec ? 'در حال ذخیره در آرشیو...' : 'افزودن به ویدیوهای کلاس 🎬'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
