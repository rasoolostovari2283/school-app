'use client';

import React from 'react';
import {
  HiOutlineVideoCamera,
  HiOutlineStop,
  HiOutlinePause,
  HiOutlinePlay,
  HiOutlineMicrophone,
  HiOutlineSpeakerXMark,
  HiOutlineFolderArrowDown,
} from 'react-icons/hi2';
import styles from '../../app/dashboard/record/record.module.css';

function formatTimer(totalSec) {
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export default function SmartboardRecorderBar({
  recStatus, // 'idle' | 'recording' | 'paused'
  recSeconds,
  micEnabled,
  onToggleMic,
  onStartRecording,
  onPauseOrResume,
  onStopRecording,
  hasFinishedRecording,
  onOpenRecordingModal,
}) {
  const isRecording = recStatus === 'recording';
  const isPaused = recStatus === 'paused';
  const isActive = isRecording || isPaused;

  return (
    <div className={styles.recorderDockWrap}>
      <div
        className={`${styles.recorderBox} ${isRecording ? styles.recorderBoxLive : ''}`}
        data-testid="smartboard-record-box"
      >
        <div className={styles.recorderLabelGroup}>
          <span
            className={`${styles.recDot} ${
              isRecording ? styles.recDotLive : isPaused ? styles.recDotPaused : ''
            }`}
          />
          <span className={styles.recBoxTitle}>ضبط</span>
          <span className={styles.recTimer} dir="ltr" data-testid="recording-timer">
            {formatTimer(recSeconds)}
          </span>
        </div>

        <div className={styles.recorderControls}>
          <button
            type="button"
            className={`${styles.recMicBtn} ${!micEnabled ? styles.recMicOff : ''}`}
            onClick={onToggleMic}
            disabled={isActive}
            title={micEnabled ? 'میکروفون فعال است' : 'میکروفون خاموش است'}
            aria-label={micEnabled ? 'خاموش کردن میکروفون' : 'روشن کردن میکروفون'}
            data-testid="toggle-mic-btn"
          >
            {micEnabled ? <HiOutlineMicrophone /> : <HiOutlineSpeakerXMark />}
            <span>{micEnabled ? 'صدا فعال' : 'بی‌صدا'}</span>
          </button>

          {!isActive ? (
            <button
              type="button"
              className={styles.recStartBtn}
              onClick={onStartRecording}
              data-testid="start-recording-btn"
            >
              <HiOutlineVideoCamera />
              <span>شروع ضبط</span>
            </button>
          ) : (
            <>
              <button
                type="button"
                className={styles.recPauseBtn}
                onClick={onPauseOrResume}
                data-testid="pause-recording-btn"
              >
                {isPaused ? <HiOutlinePlay /> : <HiOutlinePause />}
                <span>{isPaused ? 'ادامه' : 'مکث'}</span>
              </button>
              <button
                type="button"
                className={styles.recStopBtn}
                onClick={onStopRecording}
                data-testid="stop-recording-btn"
              >
                <HiOutlineStop />
                <span>پایان ضبط</span>
              </button>
            </>
          )}

          {!isActive && hasFinishedRecording && (
            <button
              type="button"
              className={styles.recReviewBtn}
              onClick={onOpenRecordingModal}
              data-testid="open-recorded-video-modal-btn"
            >
              <HiOutlineFolderArrowDown />
              <span>مدیریت ویدیو ضبط‌شده</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
