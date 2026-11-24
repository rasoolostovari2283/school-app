'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import toast from 'react-hot-toast';
import {
  HiOutlineMicrophone,
  HiOutlineVideoCamera,
  HiOutlineVideoCameraSlash,
  HiOutlineComputerDesktop,
  HiOutlineHandRaised,
  HiOutlineChatBubbleLeftRight,
  HiOutlineUsers,
  HiOutlinePhoneXMark,
  HiOutlinePaperAirplane,
  HiOutlineStopCircle,
  HiOutlineArrowDownTray,
  HiOutlineCloudArrowUp,
} from 'react-icons/hi2';
import api, { getApiBaseUrl } from '@/lib/api';
import styles from '@/app/dashboard/school-meetings/schoolMeetings.module.css';

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

function formatDuration(seconds) {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return hrs > 0 ? `${pad(hrs)}:${pad(mins)}:${pad(secs)}` : `${pad(mins)}:${pad(secs)}`;
}

function RemoteVideoTile({ participant, stream }) {
  const videoRef = useRef(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  return (
    <div className={styles.videoTile}>
      {stream ? (
        <video ref={videoRef} autoPlay playsInline className={styles.tileVideo} />
      ) : (
        <div className={styles.tileAvatar}>
          <span>{(participant?.fullName || 'ک').slice(0, 1)}</span>
        </div>
      )}
      <div className={styles.tileBadgeRow}>
        <span className={styles.tileName}>
          {participant?.fullName || 'شرکت‌کننده'}
          {participant?.isHost ? ' (مدیر)' : ' (معلم)'}
        </span>
        {participant?.handRaised && <span className={styles.handBadge}>✋</span>}
        {participant?.micOn === false && <span className={styles.mutedBadge}>🔇</span>}
      </div>
    </div>
  );
}

export default function LiveWebinarRoom({
  session,
  user,
  isPrincipal,
  onLeave,
  onRecordingSaved,
}) {
  const socketRef = useRef(null);
  const localStreamRef = useRef(null);
  const screenStreamRef = useRef(null);
  const localVideoRef = useRef(null);
  const peersRef = useRef(new Map()); // socketId -> RTCPeerConnection

  // Recording refs
  const mediaRecorderRef = useRef(null);
  const recordedChunksRef = useRef([]);
  const recordStreamRef = useRef(null);

  const [participants, setParticipants] = useState([]);
  const [remoteStreams, setRemoteStreams] = useState({}); // socketId -> MediaStream
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [sideTab, setSideTab] = useState('chat'); // 'chat' | 'participants'

  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [screenSharing, setScreenSharing] = useState(false);
  const [handRaised, setHandRaised] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);

  // Recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSec, setRecordingSec] = useState(0);
  const [recordedBlob, setRecordedBlob] = useState(null);
  const [recordedPreviewUrl, setRecordedPreviewUrl] = useState('');
  const [showSaveRecordingModal, setShowSaveRecordingModal] = useState(false);
  const [recordingTitle, setRecordingTitle] = useState(
    `${session?.title || 'وبینار زنده مدرسه'} - ${new Date().toLocaleDateString('fa-IR')}`
  );
  const [savingRecording, setSavingRecording] = useState(false);
  const [pendingCloseAfterSave, setPendingCloseAfterSave] = useState(false);

  // Session elapsed timer
  useEffect(() => {
    const timer = setInterval(() => setElapsedSec((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  // Recording timer
  useEffect(() => {
    if (!isRecording) return undefined;
    const timer = setInterval(() => setRecordingSec((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, [isRecording]);

  const cleanupPeer = useCallback((socketId) => {
    const pc = peersRef.current.get(socketId);
    if (pc) {
      pc.close();
      peersRef.current.delete(socketId);
    }
    setRemoteStreams((prev) => {
      if (!prev[socketId]) return prev;
      const next = { ...prev };
      delete next[socketId];
      return next;
    });
  }, []);

  const createPeerConnection = useCallback(
    (targetSocketId, isInitiator) => {
      if (peersRef.current.has(targetSocketId)) {
        return peersRef.current.get(targetSocketId);
      }
      const pc = new RTCPeerConnection(ICE_SERVERS);
      peersRef.current.set(targetSocketId, pc);

      const activeStream = screenStreamRef.current || localStreamRef.current;
      if (activeStream) {
        activeStream.getTracks().forEach((track) => pc.addTrack(track, activeStream));
      }

      pc.ontrack = (event) => {
        const [stream] = event.streams;
        if (stream) {
          setRemoteStreams((prev) => ({ ...prev, [targetSocketId]: stream }));
        }
      };

      pc.onicecandidate = (event) => {
        if (event.candidate && socketRef.current) {
          socketRef.current.emit('school_webinar_signal', {
            targetSocketId,
            signal: { type: 'ice-candidate', candidate: event.candidate },
          });
        }
      };

      pc.onconnectionstatechange = () => {
        if (['failed', 'closed', 'disconnected'].includes(pc.connectionState)) {
          cleanupPeer(targetSocketId);
        }
      };

      if (isInitiator) {
        pc.createOffer()
          .then((offer) => pc.setLocalDescription(offer))
          .then(() => {
            socketRef.current?.emit('school_webinar_signal', {
              targetSocketId,
              signal: { type: 'offer', sdp: pc.localDescription },
            });
          })
          .catch(() => {});
      }

      return pc;
    },
    [cleanupPeer]
  );

  // Initialize local media & Socket.IO WebRTC room
  useEffect(() => {
    let mounted = true;
    const socketBaseUrl = getApiBaseUrl().replace(/\/api\/v1\/?$/, '');
    const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : '';

    async function startRoom() {
      try {
        const media = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        if (!mounted) {
          media.getTracks().forEach((t) => t.stop());
          return;
        }
        localStreamRef.current = media;
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = media;
        }
      } catch {
        // Fallback to audio-only or listen-only mode if camera/mic blocked
        try {
          const audioOnly = await navigator.mediaDevices.getUserMedia({ audio: true });
          if (mounted) {
            localStreamRef.current = audioOnly;
            setCamOn(false);
          }
        } catch {
          if (mounted) {
            setCamOn(false);
            setMicOn(false);
            toast('ورود در حالت شنونده (دسترسی میکروفون/دوربین غیرفعال است).');
          }
        }
      }

      const socket = io(socketBaseUrl, {
        auth: { token },
        transports: ['websocket', 'polling'],
      });
      socketRef.current = socket;

      socket.on('connect', () => {
        socket.emit('school_webinar_join', { sessionId: session?.id });
      });

      socket.on('school_webinar_init', ({ participants: list = [], chat = [] }) => {
        setParticipants(list);
        setChatMessages(chat);
        // Initiate WebRTC offers to all already-present peers
        list.forEach((p) => {
          if (p.socketId !== socket.id) {
            createPeerConnection(p.socketId, true);
          }
        });
      });

      socket.on('school_webinar_participant_joined', ({ participant }) => {
        if (!participant) return;
        setParticipants((prev) => [
          ...prev.filter((p) => p.socketId !== participant.socketId),
          participant,
        ]);
        toast(`${participant.fullName} وارد وبینار شد.`);
      });

      socket.on('school_webinar_participant_updated', ({ participant }) => {
        if (!participant) return;
        setParticipants((prev) =>
          prev.map((p) => (p.socketId === participant.socketId ? participant : p))
        );
      });

      socket.on('school_webinar_participant_left', ({ socketId }) => {
        setParticipants((prev) => prev.filter((p) => p.socketId !== socketId));
        cleanupPeer(socketId);
      });

      socket.on('school_webinar_signal', async ({ fromSocketId, signal }) => {
        if (!fromSocketId || !signal) return;
        const pc = createPeerConnection(fromSocketId, false);
        try {
          if (signal.type === 'offer') {
            await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            socket.emit('school_webinar_signal', {
              targetSocketId: fromSocketId,
              signal: { type: 'answer', sdp: pc.localDescription },
            });
          } else if (signal.type === 'answer') {
            await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
          } else if (signal.type === 'ice-candidate' && signal.candidate) {
            await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
          }
        } catch {
          // ignore transient WebRTC race
        }
      });

      socket.on('school_webinar_chat_message', ({ message }) => {
        if (message) setChatMessages((prev) => [...prev, message]);
      });

      socket.on('school_webinar_ended', () => {
        toast('جلسه وبینار توسط مدیر مدرسه پایان یافت.');
        if (!isPrincipal) {
          onLeave();
        }
      });
    }

    startRoom();

    return () => {
      mounted = false;
      if (socketRef.current) {
        socketRef.current.emit('school_webinar_leave');
        socketRef.current.disconnect();
      }
      peersRef.current.forEach((pc) => pc.close());
      peersRef.current.clear();
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      screenStreamRef.current?.getTracks().forEach((t) => t.stop());
      recordStreamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [session?.id, isPrincipal, onLeave, createPeerConnection, cleanupPeer]);

  const toggleMic = () => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const next = !micOn;
    stream.getAudioTracks().forEach((t) => {
      t.enabled = next;
    });
    setMicOn(next);
    socketRef.current?.emit('school_webinar_media_state', { micOn: next });
  };

  const toggleCam = () => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const next = !camOn;
    stream.getVideoTracks().forEach((t) => {
      t.enabled = next;
    });
    setCamOn(next);
    socketRef.current?.emit('school_webinar_media_state', { camOn: next });
  };

  const replaceVideoTrackForPeers = (newTrack) => {
    peersRef.current.forEach((pc) => {
      const sender = pc.getSenders().find((s) => s.track && s.track.kind === 'video');
      if (sender && newTrack) {
        sender.replaceTrack(newTrack).catch(() => {});
      }
    });
  };

  const toggleScreenShare = async () => {
    if (screenSharing) {
      screenStreamRef.current?.getTracks().forEach((t) => t.stop());
      screenStreamRef.current = null;
      const camTrack = localStreamRef.current?.getVideoTracks()?.[0];
      if (camTrack) replaceVideoTrackForPeers(camTrack);
      if (localVideoRef.current && localStreamRef.current) {
        localVideoRef.current.srcObject = localStreamRef.current;
      }
      setScreenSharing(false);
      socketRef.current?.emit('school_webinar_media_state', { screenSharing: false });
      return;
    }

    try {
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true,
      });
      screenStreamRef.current = displayStream;
      const screenTrack = displayStream.getVideoTracks()[0];
      replaceVideoTrackForPeers(screenTrack);
      if (localVideoRef.current) localVideoRef.current.srcObject = displayStream;
      setScreenSharing(true);
      socketRef.current?.emit('school_webinar_media_state', { screenSharing: true });

      screenTrack.onended = () => {
        screenStreamRef.current = null;
        const camTrack = localStreamRef.current?.getVideoTracks()?.[0];
        if (camTrack) replaceVideoTrackForPeers(camTrack);
        if (localVideoRef.current && localStreamRef.current) {
          localVideoRef.current.srcObject = localStreamRef.current;
        }
        setScreenSharing(false);
        socketRef.current?.emit('school_webinar_media_state', { screenSharing: false });
      };
    } catch {
      toast.error('اشتراک صفحه لغو شد.');
    }
  };

  const toggleHand = () => {
    const next = !handRaised;
    setHandRaised(next);
    socketRef.current?.emit('school_webinar_hand', { handRaised: next });
  };

  // Start / Stop Webinar Recording (captures tab/screen + microphone audio)
  const startRecording = async () => {
    try {
      let captureStream;
      try {
        const displayStream = await navigator.mediaDevices.getDisplayMedia({
          video: { frameRate: 24 },
          audio: true,
        });
        const tracks = [...displayStream.getVideoTracks()];
        const audioTracks = [...displayStream.getAudioTracks()];
        if (localStreamRef.current) {
          localStreamRef.current.getAudioTracks().forEach((t) => audioTracks.push(t.clone()));
        }
        captureStream = new MediaStream([...tracks, ...audioTracks]);
      } catch {
        // Fallback to recording local camera + mic if user skips screen selection
        if (!localStreamRef.current) {
          toast.error('هیچ ورودی تصویر یا صدایی برای ضبط یافت نشد.');
          return;
        }
        captureStream = localStreamRef.current;
      }

      recordStreamRef.current = captureStream;
      recordedChunksRef.current = [];

      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
        ? 'video/webm;codecs=vp9,opus'
        : MediaRecorder.isTypeSupported('video/webm')
        ? 'video/webm'
        : '';

      const recorder = mimeType
        ? new MediaRecorder(captureStream, { mimeType })
        : new MediaRecorder(captureStream);

      recorder.ondataavailable = (evt) => {
        if (evt.data && evt.data.size > 0) {
          recordedChunksRef.current.push(evt.data);
        }
      };

      recorder.onstop = () => {
        const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
        setRecordedBlob(blob);
        const url = URL.createObjectURL(blob);
        setRecordedPreviewUrl(url);
        setIsRecording(false);
        setShowSaveRecordingModal(true);
      };

      mediaRecorderRef.current = recorder;
      recorder.start(1000);
      setRecordingSec(0);
      setIsRecording(true);
      toast.success('ضبط ویدیوی جلسه آغاز شد.');
    } catch {
      toast.error('مرورگر شما اجازه شروع ضبط ویدیو را نداد.');
    }
  };

  const stopRecording = (closeAfter = false) => {
    setPendingCloseAfterSave(closeAfter);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    recordStreamRef.current?.getTracks().forEach((t) => t.stop());
    recordStreamRef.current = null;
  };

  const handleEndOrLeave = async () => {
    if (isRecording) {
      stopRecording(true);
      if (isPrincipal && session?.id) {
        try {
          await api.post(`/school-meetings/webinar/${session.id}/end`);
        } catch {
          // ignore
        }
      }
      return;
    }

    if (recordedBlob && !showSaveRecordingModal) {
      setPendingCloseAfterSave(true);
      setShowSaveRecordingModal(true);
      return;
    }

    if (isPrincipal && session?.id) {
      try {
        await api.post(`/school-meetings/webinar/${session.id}/end`);
      } catch {
        // ignore
      }
    }
    onLeave();
  };

  const handleSaveRecordingToServer = async () => {
    if (!recordedBlob) return;
    setSavingRecording(true);
    try {
      const fileName = `webinar_${Date.now()}.webm`;
      const file = new File([recordedBlob], fileName, { type: 'video/webm' });
      const formData = new FormData();
      formData.append('file', file);
      formData.append('media_type', 'video');
      formData.append('title', recordingTitle.trim() || 'ضبط وبینار زنده مدرسه');
      formData.append('category_group', 'جلسات ضبط‌شده وبینار');
      formData.append('description', `ضبط‌شده از جلسه زنده «${session?.title || 'وبینار مدرسه'}»`);
      formData.append('is_recording', 'true');
      if (session?.id) formData.append('webinar_session_id', session.id);

      await api.post('/school-meetings/items', formData, { timeout: 10 * 60 * 1000 });
      toast.success('ویدیوی ضبط‌شده با موفقیت در بخش جلسات آنلاین ذخیره شد و برای مدیر و معلمان قابل مشاهده است.');
      setShowSaveRecordingModal(false);
      setRecordedBlob(null);
      if (onRecordingSaved) onRecordingSaved();
      if (pendingCloseAfterSave) onLeave();
    } catch (err) {
      toast.error(err.response?.data?.message || 'خطا در ذخیره ویدیوی ضبط‌شده');
    } finally {
      setSavingRecording(false);
    }
  };

  const handleDownloadRecordingLocally = () => {
    if (!recordedPreviewUrl) return;
    const a = document.createElement('a');
    a.href = recordedPreviewUrl;
    a.download = `${(recordingTitle || 'webinar_recording').replace(/[<>:"/\\|?*]+/g, '_')}.webm`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const sendChat = (e) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    socketRef.current?.emit('school_webinar_chat', { text: chatInput.trim() });
    setChatInput('');
  };

  const remoteParticipants = participants.filter((p) => p.socketId !== socketRef.current?.id);

  return (
    <div className={styles.webinarOverlay} dir="rtl">
      {/* Top Bar */}
      <header className={styles.webinarTopBar}>
        <div className={styles.webinarTitleGroup}>
          <span className={styles.liveDotBadge}>● زنده</span>
          <h2 className={styles.webinarRoomTitle}>{session?.title || 'اتاق وبینار زنده مدرسه'}</h2>
          <span className={styles.timerChip}>{formatDuration(elapsedSec)}</span>
        </div>

        <div className={styles.webinarTopRight}>
          {isRecording && (
            <span className={styles.recordingIndicator}>
              ● در حال ضبط {formatDuration(recordingSec)}
            </span>
          )}
          <span className={styles.participantCountChip}>
            <HiOutlineUsers /> {participants.length} نفر آنلاین
          </span>
        </div>
      </header>

      {/* Main Content: Stage + Side Panel */}
      <div className={styles.webinarBody}>
        <div className={styles.webinarStage}>
          <div className={styles.videoGrid}>
            {/* Local Self Tile */}
            <div className={styles.videoTile}>
              <video ref={localVideoRef} autoPlay muted playsInline className={styles.tileVideo} />
              <div className={styles.tileBadgeRow}>
                <span className={styles.tileName}>
                  شما ({user?.full_name || user?.username || 'کاربر'})
                  {isPrincipal ? ' - مدیر' : ' - معلم'}
                </span>
                {handRaised && <span className={styles.handBadge}>✋</span>}
                {!micOn && <span className={styles.mutedBadge}>🔇</span>}
              </div>
            </div>

            {/* Remote Participants */}
            {remoteParticipants.map((p) => (
              <RemoteVideoTile
                key={p.socketId}
                participant={p}
                stream={remoteStreams[p.socketId]}
              />
            ))}
          </div>
        </div>

        {/* Skyroom-style Side Panel: Chat & Participants */}
        <aside className={styles.webinarSidebar}>
          <div className={styles.sidebarTabs}>
            <button
              type="button"
              className={`${styles.sidebarTab} ${sideTab === 'chat' ? styles.sidebarTabActive : ''}`}
              onClick={() => setSideTab('chat')}
            >
              <HiOutlineChatBubbleLeftRight /> گفتگوی زنده
            </button>
            <button
              type="button"
              className={`${styles.sidebarTab} ${sideTab === 'participants' ? styles.sidebarTabActive : ''}`}
              onClick={() => setSideTab('participants')}
            >
              <HiOutlineUsers /> حاضران ({participants.length})
            </button>
          </div>

          {sideTab === 'chat' ? (
            <div className={styles.chatPanel}>
              <div className={styles.chatMessages}>
                {chatMessages.length === 0 ? (
                  <p className={styles.emptyChat}>پیامی در گفتگو ارسال نشده است.</p>
                ) : (
                  chatMessages.map((msg) => (
                    <div key={msg.id} className={styles.chatBubble}>
                      <div className={styles.chatSender}>
                        {msg.senderName} {msg.isHost ? '(مدیر)' : ''}
                      </div>
                      <div className={styles.chatText}>{msg.text}</div>
                    </div>
                  ))
                )}
              </div>
              <form onSubmit={sendChat} className={styles.chatForm}>
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="پیام خود را بنویسید..."
                  className={styles.chatInput}
                />
                <button type="submit" className={styles.chatSendBtn} aria-label="ارسال">
                  <HiOutlinePaperAirplane />
                </button>
              </form>
            </div>
          ) : (
            <div className={styles.participantsList}>
              {participants.map((p) => (
                <div key={p.socketId} className={styles.participantRow}>
                  <div>
                    <strong>{p.fullName}</strong>
                    <span className={styles.roleTag}>{p.isHost ? 'مدیر' : 'معلم'}</span>
                  </div>
                  <div className={styles.participantIcons}>
                    {p.handRaised && <span>✋</span>}
                    <span>{p.micOn ? '🎙️' : '🔇'}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </aside>
      </div>

      {/* Bottom Skyroom Control Dock */}
      <footer className={styles.webinarDock}>
        <button
          type="button"
          className={`${styles.dockBtn} ${!micOn ? styles.dockBtnOff : ''}`}
          onClick={toggleMic}
        >
          <HiOutlineMicrophone />
          <span>{micOn ? 'میکروفون باز' : 'میکروفون بسته'}</span>
        </button>

        <button
          type="button"
          className={`${styles.dockBtn} ${!camOn ? styles.dockBtnOff : ''}`}
          onClick={toggleCam}
        >
          {camOn ? <HiOutlineVideoCamera /> : <HiOutlineVideoCameraSlash />}
          <span>{camOn ? 'دوربین باز' : 'دوربین بسته'}</span>
        </button>

        <button
          type="button"
          className={`${styles.dockBtn} ${screenSharing ? styles.dockBtnActive : ''}`}
          onClick={toggleScreenShare}
        >
          <HiOutlineComputerDesktop />
          <span>{screenSharing ? 'توقف اشتراک صفحه' : 'اشتراک صفحه'}</span>
        </button>

        <button
          type="button"
          className={`${styles.dockBtn} ${handRaised ? styles.dockBtnActive : ''}`}
          onClick={toggleHand}
        >
          <HiOutlineHandRaised />
          <span>{handRaised ? 'پایین آوردن دست' : 'بالا بردن دست'}</span>
        </button>

        {/* Record Video Button */}
        <button
          type="button"
          className={`${styles.dockBtn} ${isRecording ? styles.dockBtnRecording : ''}`}
          onClick={() => (isRecording ? stopRecording(false) : startRecording())}
        >
          <HiOutlineStopCircle />
          <span>{isRecording ? 'توقف ضبط ویدیو' : 'ضبط ویدیو'}</span>
        </button>

        <button type="button" className={styles.dockLeaveBtn} onClick={handleEndOrLeave}>
          <HiOutlinePhoneXMark />
          <span>{isPrincipal ? 'پایان جلسه وبینار' : 'خروج از وبینار'}</span>
        </button>
      </footer>

      {/* Post-Recording Save to Online Meetings Modal */}
      {showSaveRecordingModal && recordedBlob && (
        <div className={styles.saveRecOverlay}>
          <div className={styles.saveRecCard}>
            <h3>ذخیره ویدیوی ضبط‌شده در بخش جلسات آنلاین</h3>
            <p className={styles.helperMuted}>
              ویدیوی ضبط‌شده را می‌توانید مستقیماً در بخش «جلسات آنلاین مدرسه» ذخیره کنید تا به‌صورت آفلاین در پنل مدیر و معلمان نمایش داده شود.
            </p>

            {recordedPreviewUrl && (
              <video src={recordedPreviewUrl} controls className={styles.recPreviewVideo} />
            )}

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>عنوان ویدیوی ضبط‌شده</label>
              <input
                type="text"
                value={recordingTitle}
                onChange={(e) => setRecordingTitle(e.target.value)}
                className={styles.textInput}
              />
            </div>

            <div className={styles.saveRecActions}>
              {isPrincipal && (
                <button
                  type="button"
                  className={styles.btnPrimary}
                  onClick={handleSaveRecordingToServer}
                  disabled={savingRecording}
                >
                  <HiOutlineCloudArrowUp />
                  <span>{savingRecording ? 'در حال ذخیره...' : 'ذخیره در بخش جلسات آنلاین'}</span>
                </button>
              )}

              <button
                type="button"
                className={styles.btnSecondary}
                onClick={handleDownloadRecordingLocally}
              >
                <HiOutlineArrowDownTray />
                <span>دانلود فایل روی دستگاه</span>
              </button>

              <button
                type="button"
                className={styles.btnGhost}
                onClick={() => {
                  setShowSaveRecordingModal(false);
                  if (pendingCloseAfterSave) onLeave();
                }}
              >
                بستن
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
