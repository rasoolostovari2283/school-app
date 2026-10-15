'use client';
import { useState, useEffect, useRef } from 'react';
import {
  HiOutlinePhoneXMark,
  HiOutlineMicrophone,
  HiOutlineVideoCamera,
  HiOutlineComputerDesktop,
  HiOutlineSpeakerWave,
  HiOutlineShieldCheck,
  HiOutlineArrowsPointingOut,
  HiOutlineSignal,
} from 'react-icons/hi2';
import styles from './CallModal.module.css';

export default function CallModal({
  isOpen,
  onClose,
  callType = 'video',
  partner,
  isGroup = false,
}) {
  const [callStatus, setCallStatus] = useState('calling'); // calling | connected | ended
  const [duration, setDuration] = useState(0);
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(callType === 'audio');
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [audioLevel, setAudioLevel] = useState(40);

  const localVideoRef = useRef(null);
  const localStreamRef = useRef(null);
  const timerRef = useRef(null);
  const audioCtxRef = useRef(null);

  // Synthesize realistic calling tone using Web Audio API (0 external dependency)
  useEffect(() => {
    if (!isOpen) return;

    setCallStatus('calling');
    setDuration(0);
    setIsVideoOff(callType === 'audio');

    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) {
        audioCtxRef.current = new AudioContext();
        // Play gentle calling beep
        playCallChime();
      }
    } catch (e) {
      console.log('Web Audio not available', e);
    }

    // Try camera access
    if (callType === 'video' && navigator?.mediaDevices?.getUserMedia) {
      navigator.mediaDevices
        .getUserMedia({ video: true, audio: true })
        .then((stream) => {
          localStreamRef.current = stream;
          if (localVideoRef.current) {
            localVideoRef.current.srcObject = stream;
          }
        })
        .catch((err) => {
          console.log('Camera access skipped or simulated:', err);
        });
    }

    // Simulate connection after 2 seconds
    const connectTimer = setTimeout(() => {
      setCallStatus('connected');
    }, 2000);

    return () => {
      clearTimeout(connectTimer);
      stopTracks();
      if (audioCtxRef.current) {
        audioCtxRef.current.close().catch(() => {});
      }
    };
  }, [isOpen, callType]);

  // Duration timer
  useEffect(() => {
    if (callStatus === 'connected') {
      timerRef.current = setInterval(() => {
        setDuration((prev) => prev + 1);
        // Randomize audio visualizer amplitude
        setAudioLevel(Math.floor(25 + Math.random() * 55));
      }, 1000);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [callStatus]);

  const playCallChime = () => {
    try {
      if (!audioCtxRef.current) return;
      const ctx = audioCtxRef.current;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, ctx.currentTime);
      gain.gain.setValueAtTime(0.05, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.6);
    } catch (e) {}
  };

  const stopTracks = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }
  };

  const handleEndCall = () => {
    setCallStatus('ended');
    stopTracks();
    setTimeout(() => {
      onClose();
    }, 600);
  };

  const toggleMic = () => {
    setIsMicMuted((prev) => !prev);
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) audioTrack.enabled = isMicMuted;
    }
  };

  const toggleVideo = () => {
    setIsVideoOff((prev) => !prev);
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) videoTrack.enabled = isVideoOff;
    }
  };

  const toggleScreenShare = () => {
    setIsScreenSharing((prev) => !prev);
  };

  const formatDuration = (sec) => {
    const mins = Math.floor(sec / 60);
    const secs = sec % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  if (!isOpen) return null;

  return (
    <div className={styles.overlay}>
      <div className={styles.callCard}>
        {/* Top Status Bar */}
        <div className={styles.statusBar}>
          <div className={styles.securityTag}>
            <HiOutlineShieldCheck style={{ color: '#10b981', fontSize: '1.25rem' }} />
            <span>پروتکل امن داخلی ادوکانکت (AES-256)</span>
          </div>

          <div className={styles.networkBadge}>
            <HiOutlineSignal style={{ color: '#06b6d4' }} />
            <span>شبکه ملی اطلاعات • تاخیر: ۳ms</span>
          </div>

          <div className={styles.timerTag}>
            {callStatus === 'connected' ? (
              <span className={styles.activeTimer}>● {formatDuration(duration)}</span>
            ) : (
              <span className={styles.connectingText}>در حال برقراری ارتباط...</span>
            )}
          </div>
        </div>

        {/* Video / Call Room Area */}
        <div className={styles.mediaStage}>
          {/* Main Remote Tile */}
          <div className={styles.remoteTile}>
            {callType === 'video' ? (
              <div className={styles.simulatedVideo}>
                <div className={styles.cyberGrid} />
                <div className={styles.remoteAvatar}>
                  {partner?.name?.charAt(0) || partner?.display_name?.charAt(0) || '🎓'}
                </div>
                <div className={styles.remoteDetails}>
                  <h3>{partner?.name || partner?.display_name || 'کاربر ادوکانکت'}</h3>
                  <div className={styles.personnelBadgeRow}>
                    {partner?.personnel_code && (
                      <span className={styles.codeBadge}>کد پرسنلی: {partner.personnel_code}</span>
                    )}
                    {partner?.student_code && (
                      <span className={styles.codeBadge}>کد دانش‌آموزی: {partner.student_code}</span>
                    )}
                    <span className={styles.roleTag}>
                      {isGroup
                        ? 'گروه گفتگوی کلاسی'
                        : partner?.role === 'teacher'
                        ? 'دبیر / کادر مدرسه'
                        : partner?.role === 'student'
                        ? 'دانش‌آموز'
                        : 'اولیا'}
                    </span>
                  </div>
                </div>

                {/* Animated Voice Visualizer Waves */}
                <div className={styles.voiceVisualizer}>
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((i) => (
                    <span
                      key={i}
                      className={styles.audioBar}
                      style={{
                        height: `${Math.max(10, Math.sin(i + duration) * audioLevel + 15)}px`,
                        animationDelay: `${i * 0.08}s`,
                      }}
                    />
                  ))}
                </div>
              </div>
            ) : (
              /* Audio Only Call View */
              <div className={styles.audioOnlyStage}>
                <div className={styles.pulsingHalo}>
                  <div className={styles.audioAvatar}>
                    {partner?.name?.charAt(0) || partner?.display_name?.charAt(0) || '📞'}
                  </div>
                </div>
                <h2 className={styles.audioPartnerName}>
                  {partner?.name || partner?.display_name}
                </h2>
                <p className={styles.audioSubText}>
                  {callStatus === 'connected' ? 'تماس صوتی رمزنگاری‌شده فعال است' : 'در حال زنگ خوردن...'}
                </p>

                <div className={styles.voiceVisualizer} style={{ marginTop: '24px' }}>
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16].map((i) => (
                    <span
                      key={i}
                      className={styles.audioBar}
                      style={{
                        height: `${Math.max(8, Math.sin(i * 1.5 + duration) * (isMicMuted ? 6 : audioLevel) + 12)}px`,
                      }}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Self Video PIP (Picture in Picture) */}
            {callType === 'video' && (
              <div className={styles.pipTile}>
                {isVideoOff ? (
                  <div className={styles.pipAvatarOff}>
                    <span>دوربین خاموش</span>
                  </div>
                ) : (
                  <video
                    ref={localVideoRef}
                    autoPlay
                    playsInline
                    muted
                    className={styles.localVideo}
                  />
                )}
                <div className={styles.pipLabel}>تصویر شما</div>
              </div>
            )}
          </div>
        </div>

        {/* Bottom Control Dock */}
        <div className={styles.controlDock}>
          <button
            className={`${styles.ctrlBtn} ${isMicMuted ? styles.ctrlBtnOff : ''}`}
            onClick={toggleMic}
            title={isMicMuted ? 'فعال کردن میکروفون' : 'قطع میکروفون'}
          >
            <HiOutlineMicrophone />
            <span>{isMicMuted ? 'بی‌صدا' : 'صدا فعال'}</span>
          </button>

          {callType === 'video' && (
            <button
              className={`${styles.ctrlBtn} ${isVideoOff ? styles.ctrlBtnOff : ''}`}
              onClick={toggleVideo}
              title={isVideoOff ? 'روشن کردن دوربین' : 'خاموش کردن دوربین'}
            >
              <HiOutlineVideoCamera />
              <span>{isVideoOff ? 'دوربین خاموش' : 'دوربین روشن'}</span>
            </button>
          )}

          <button
            className={`${styles.ctrlBtn} ${isScreenSharing ? styles.ctrlBtnActive : ''}`}
            onClick={toggleScreenShare}
            title="اشتراک‌گذاری صفحه نمایش"
          >
            <HiOutlineComputerDesktop />
            <span>{isScreenSharing ? 'توقف اشتراک' : 'اشتراک صفحه'}</span>
          </button>

          <button
            className={`${styles.ctrlBtn} ${styles.endCallBtn}`}
            onClick={handleEndCall}
            title="پایان تماس"
          >
            <HiOutlinePhoneXMark />
            <span>قطع تماس</span>
          </button>
        </div>
      </div>
    </div>
  );
}
