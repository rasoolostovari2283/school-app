'use client';

import React, { useState, useRef, useEffect } from 'react';
import {
  HiOutlinePencil,
  HiOutlineArrowUturnLeft,
  HiOutlineArrowUturnRight,
  HiOutlineTrash,
  HiOutlineArrowDownTray,
  HiOutlineEllipsisHorizontalCircle,
  HiOutlineDocumentText,
  HiOutlinePhoto,
  HiOutlineFilm,
  HiOutlineRectangleStack,
  HiOutlineSquares2X2,
  HiOutlineChevronRight,
  HiOutlineChevronLeft,
  HiOutlinePlus,
  HiOutlineXMark,
  HiOutlineArrowRightOnRectangle,
} from 'react-icons/hi2';
import { LuEraser } from 'react-icons/lu';
import { FaFilePdf, FaFileWord, FaFilePowerpoint } from 'react-icons/fa6';
import styles from '../../app/dashboard/record/record.module.css';

export const PEN_COLORS = [
  { name: 'مشکی', value: '#0f172a' },
  { name: 'آبی', value: '#2563eb' },
  { name: 'قرمز', value: '#dc2626' },
  { name: 'سبز', value: '#059669' },
  { name: 'نارنجی', value: '#ea580c' },
  { name: 'بنفش', value: '#7c3aed' },
  { name: 'قهوه‌ای', value: '#78350f' },
  { name: 'سفید', value: '#ffffff' },
];

export const PEN_SIZES = [
  { label: 'نازک', size: 2 },
  { label: 'متوسط', size: 5 },
  { label: 'ضخیم', size: 10 },
  { label: 'خیلی ضخیم', size: 18 },
];

export const ERASER_SIZES = [
  { label: 'کوچک', size: 12 },
  { label: 'متوسط', size: 24 },
  { label: 'بزرگ', size: 40 },
  { label: 'خیلی بزرگ', size: 64 },
];

export default function SmartboardToolbar({
  title,
  boardType,
  onChangeBoardType,
  tool,
  onSelectTool,
  penColor,
  onChangePenColor,
  penSize,
  onChangePenSize,
  eraserSize,
  onChangeEraserSize,
  onUndo,
  onRedo,
  onClearActiveBoard,
  // File uploads
  onTriggerUpload,
  activeMedia,
  onCloseMedia,
  // Split note board
  isSplitNotesOpen,
  onToggleSplitNotes,
  // Board multi-page (when no doc or for whiteboard pages)
  boardPage,
  boardTotalPages,
  onPrevBoardPage,
  onNextBoardPage,
  onAddBoardPage,
  // Export / Save
  isExporting,
  onDownloadPdf,
  onDownloadPng,
  onDownloadActiveMedia,
  // Exit studio
  onExitBoard,
}) {
  const [openMenu, setOpenMenu] = useState(null); // null | 'pen' | 'eraser' | 'more' | 'export'
  const toolbarRef = useRef(null);

  useEffect(() => {
    if (!openMenu) return;
    const handleOutside = (e) => {
      if (toolbarRef.current && !toolbarRef.current.contains(e.target)) {
        setOpenMenu(null);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('touchstart', handleOutside);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('touchstart', handleOutside);
    };
  }, [openMenu]);

  const handlePenClick = () => {
    onSelectTool('pen');
    setOpenMenu((prev) => (prev === 'pen' ? null : 'pen'));
  };

  const handleEraserClick = () => {
    onSelectTool('eraser');
    setOpenMenu((prev) => (prev === 'eraser' ? null : 'eraser'));
  };

  return (
    <header className={styles.topToolbar} ref={toolbarRef} data-testid="smartboard-toolbar">
      {/* Right Section: Title & Board Type Toggle */}
      <div className={styles.toolbarGroup}>
        <button
          type="button"
          className={styles.iconActionBtn}
          onClick={onExitBoard}
          title="بازگشت به انتخاب صفحه"
          aria-label="بازگشت به انتخاب صفحه"
        >
          <HiOutlineArrowRightOnRectangle />
        </button>

        <div className={styles.boardTitleBox}>
          <span className={styles.boardTitleText}>{title}</span>
          <div className={styles.boardModeSwitch} role="group" aria-label="نوع صفحه تخته">
            <button
              type="button"
              className={`${styles.modeSwitchBtn} ${boardType === 'white' ? styles.modeSwitchActive : ''}`}
              onClick={() => onChangeBoardType('white')}
              data-testid="switch-white-board"
            >
              سفید
            </button>
            <button
              type="button"
              className={`${styles.modeSwitchBtn} ${boardType === 'grid' ? styles.modeSwitchActive : ''}`}
              onClick={() => onChangeBoardType('grid')}
              data-testid="switch-grid-board"
            >
              شطرنجی
            </button>
          </div>
        </div>
      </div>

      {/* Center Section: Pen, Eraser, More (PDF/Word/PPTX/Video/Photo), Side Notes */}
      <div className={styles.toolbarGroup}>
        {/* PEN TOOL + POPOVER */}
        <div className={styles.popoverAnchor}>
          <button
            type="button"
            className={`${styles.toolBtn} ${tool === 'pen' ? styles.toolBtnActive : ''}`}
            onClick={handlePenClick}
            aria-expanded={openMenu === 'pen'}
            data-testid="tool-pen-btn"
          >
            <HiOutlinePencil />
            <span>قلم</span>
            <span
              className={styles.colorDotPreview}
              style={{
                backgroundColor: penColor,
                borderColor: penColor === '#ffffff' ? '#94a3b8' : 'rgba(255,255,255,0.65)',
              }}
            />
          </button>

          {openMenu === 'pen' && (
            <div className={styles.popoverPanel} data-testid="pen-popover">
              <div className={styles.popoverSectionTitle}>رنگ‌بندی قلم</div>
              <div className={styles.colorGrid}>
                {PEN_COLORS.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    aria-label={`رنگ ${c.name}`}
                    title={c.name}
                    className={`${styles.colorSwatch} ${penColor === c.value ? styles.colorSwatchActive : ''}`}
                    style={{ backgroundColor: c.value }}
                    onClick={() => onChangePenColor(c.value)}
                    data-testid={`pen-color-${c.value.replace('#', '')}`}
                  />
                ))}
              </div>

              <div className={styles.popoverSectionTitle} style={{ marginTop: 12 }}>
                سایزبندی قلم ({penSize} پیکسل)
              </div>
              <div className={styles.sizePresetRow}>
                {PEN_SIZES.map((p) => (
                  <button
                    key={p.size}
                    type="button"
                    className={`${styles.sizePresetBtn} ${penSize === p.size ? styles.sizePresetActive : ''}`}
                    onClick={() => onChangePenSize(p.size)}
                    data-testid={`pen-size-${p.size}`}
                  >
                    <span
                      className={styles.sizeDot}
                      style={{
                        width: Math.min(18, Math.max(4, p.size)),
                        height: Math.min(18, Math.max(4, p.size)),
                        background: penColor === '#ffffff' ? '#334155' : penColor,
                      }}
                    />
                    <span>{p.label}</span>
                  </button>
                ))}
              </div>
              <input
                type="range"
                min={1}
                max={28}
                value={penSize}
                onChange={(e) => onChangePenSize(Number(e.target.value))}
                className={styles.rangeSlider}
                aria-label="تنظیم ضخامت قلم"
              />
            </div>
          )}
        </div>

        {/* ERASER TOOL + POPOVER */}
        <div className={styles.popoverAnchor}>
          <button
            type="button"
            className={`${styles.toolBtn} ${tool === 'eraser' ? styles.toolBtnActive : ''}`}
            onClick={handleEraserClick}
            aria-expanded={openMenu === 'eraser'}
            data-testid="tool-eraser-btn"
          >
            <LuEraser />
            <span>پاک‌کن</span>
          </button>

          {openMenu === 'eraser' && (
            <div className={styles.popoverPanel} data-testid="eraser-popover">
              <div className={styles.popoverSectionTitle}>
                سایزبندی پاک‌کن ({eraserSize} پیکسل)
              </div>
              <div className={styles.sizePresetRow}>
                {ERASER_SIZES.map((er) => (
                  <button
                    key={er.size}
                    type="button"
                    className={`${styles.sizePresetBtn} ${eraserSize === er.size ? styles.sizePresetActive : ''}`}
                    onClick={() => onChangeEraserSize(er.size)}
                    data-testid={`eraser-size-${er.size}`}
                  >
                    <span>{er.label}</span>
                  </button>
                ))}
              </div>
              <input
                type="range"
                min={8}
                max={80}
                value={eraserSize}
                onChange={(e) => onChangeEraserSize(Number(e.target.value))}
                className={styles.rangeSlider}
                aria-label="تنظیم اندازه پاک‌کن"
              />
              <button
                type="button"
                className={styles.clearBoardBtn}
                onClick={() => {
                  onClearActiveBoard();
                  setOpenMenu(null);
                }}
                data-testid="clear-board-btn"
              >
                <HiOutlineTrash />
                <span>پاک کردن کل نوشته‌های صفحه</span>
              </button>
            </div>
          )}
        </div>

        {/* MORE / OTHER ITEMS DROPDOWN (PDF, Word, PowerPoint, Video, Image) */}
        <div className={styles.popoverAnchor}>
          <button
            type="button"
            className={`${styles.toolBtn} ${openMenu === 'more' || activeMedia ? styles.toolBtnAccent : ''}`}
            onClick={() => setOpenMenu((prev) => (prev === 'more' ? null : 'more'))}
            aria-expanded={openMenu === 'more'}
            data-testid="tool-more-btn"
          >
            <HiOutlineEllipsisHorizontalCircle />
            <span>سایر موارد</span>
          </button>

          {openMenu === 'more' && (
            <div className={styles.moreDropdown} data-testid="more-media-menu">
              <div className={styles.popoverSectionTitle}>افزودن فایل و رسانه از دستگاه</div>
              <button
                type="button"
                className={styles.moreMenuItem}
                onClick={() => {
                  setOpenMenu(null);
                  onTriggerUpload('pdf');
                }}
                data-testid="menu-upload-pdf"
              >
                <FaFilePdf style={{ color: '#ef4444' }} />
                <span>بارگذاری فایل PDF (پی‌دی‌اف)</span>
              </button>
              <button
                type="button"
                className={styles.moreMenuItem}
                onClick={() => {
                  setOpenMenu(null);
                  onTriggerUpload('word');
                }}
                data-testid="menu-upload-word"
              >
                <FaFileWord style={{ color: '#2563eb' }} />
                <span>بارگذاری فایل Word (ورد)</span>
              </button>
              <button
                type="button"
                className={styles.moreMenuItem}
                onClick={() => {
                  setOpenMenu(null);
                  onTriggerUpload('pptx');
                }}
                data-testid="menu-upload-pptx"
              >
                <FaFilePowerpoint style={{ color: '#ea580c' }} />
                <span>بارگذاری فایل PowerPoint (پاورپوینت)</span>
              </button>
              <button
                type="button"
                className={styles.moreMenuItem}
                onClick={() => {
                  setOpenMenu(null);
                  onTriggerUpload('video');
                }}
                data-testid="menu-upload-video"
              >
                <HiOutlineFilm style={{ color: '#7c3aed' }} />
                <span>بارگذاری و پخش ویدیو</span>
              </button>
              <button
                type="button"
                className={styles.moreMenuItem}
                onClick={() => {
                  setOpenMenu(null);
                  onTriggerUpload('image');
                }}
                data-testid="menu-upload-image"
              >
                <HiOutlinePhoto style={{ color: '#059669' }} />
                <span>بارگذاری عکس</span>
              </button>

              {activeMedia && (
                <button
                  type="button"
                  className={`${styles.moreMenuItem} ${styles.moreMenuItemDanger}`}
                  onClick={() => {
                    setOpenMenu(null);
                    onCloseMedia();
                  }}
                >
                  <HiOutlineXMark />
                  <span>بستن فایل فعلی ({activeMedia.name})</span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* SIDE-BY-SIDE WHITE NOTE BOARD TOGGLE */}
        <button
          type="button"
          className={`${styles.toolBtn} ${isSplitNotesOpen ? styles.toolBtnSuccess : ''}`}
          onClick={onToggleSplitNotes}
          aria-pressed={isSplitNotesOpen}
          data-testid="toggle-split-notes-btn"
          title="باز کردن صفحه سفید کناری برای نت‌برداری کنار فایل"
        >
          <HiOutlineSquares2X2 />
          <span>صفحه سفید کناری (نت)</span>
        </button>

        {/* Undo / Redo */}
        <div className={styles.miniActionGroup}>
          <button
            type="button"
            className={styles.iconActionBtn}
            onClick={onUndo}
            title="بازگشت حرکت قبل"
            aria-label="بازگشت حرکت قبل"
          >
            <HiOutlineArrowUturnRight />
          </button>
          <button
            type="button"
            className={styles.iconActionBtn}
            onClick={onRedo}
            title="انجام مجدد"
            aria-label="انجام مجدد"
          >
            <HiOutlineArrowUturnLeft />
          </button>
        </div>
      </div>

      {/* Left Section: Board Pages & Download / Save */}
      <div className={styles.toolbarGroup}>
        {!activeMedia && (
          <div className={styles.pageNavPill}>
            <button
              type="button"
              className={styles.pageNavBtn}
              onClick={onPrevBoardPage}
              disabled={boardPage <= 1}
              aria-label="صفحه قبلی تخته"
            >
              <HiOutlineChevronRight />
            </button>
            <span className={styles.pageNavText}>
              صفحه {boardPage} از {boardTotalPages}
            </span>
            <button
              type="button"
              className={styles.pageNavBtn}
              onClick={onNextBoardPage}
              disabled={boardPage >= boardTotalPages}
              aria-label="صفحه بعدی تخته"
            >
              <HiOutlineChevronLeft />
            </button>
            <button
              type="button"
              className={styles.pageAddBtn}
              onClick={onAddBoardPage}
              title="افزودن صفحه جدید"
              aria-label="افزودن صفحه جدید"
              data-testid="add-board-page-btn"
            >
              <HiOutlinePlus />
            </button>
          </div>
        )}

        {/* SAVE & DOWNLOAD DROPDOWN */}
        <div className={styles.popoverAnchor}>
          <button
            type="button"
            className={styles.exportPrimaryBtn}
            onClick={() => setOpenMenu((prev) => (prev === 'export' ? null : 'export'))}
            disabled={isExporting}
            data-testid="export-menu-btn"
          >
            <HiOutlineArrowDownTray />
            <span>{isExporting ? 'در حال آماده‌سازی...' : 'ذخیره و دانلود'}</span>
          </button>

          {openMenu === 'export' && (
            <div className={`${styles.moreDropdown} ${styles.dropdownLeftAlign}`} data-testid="export-menu">
              <div className={styles.popoverSectionTitle}>ذخیره نوشته‌ها و فایل تدریس‌شده</div>
              <button
                type="button"
                className={styles.moreMenuItem}
                onClick={() => {
                  setOpenMenu(null);
                  onDownloadPdf();
                }}
                data-testid="download-pdf-btn"
              >
                <HiOutlineDocumentText style={{ color: '#ef4444' }} />
                <span>دانلود فایل کامل PDF (تخته + فایل + نت‌ها)</span>
              </button>
              <button
                type="button"
                className={styles.moreMenuItem}
                onClick={() => {
                  setOpenMenu(null);
                  onDownloadPng();
                }}
                data-testid="download-png-btn"
              >
                <HiOutlineRectangleStack style={{ color: '#2563eb' }} />
                <span>دانلود تصویر صفحه فعلی (PNG)</span>
              </button>
              {activeMedia && (
                <button
                  type="button"
                  className={styles.moreMenuItem}
                  onClick={() => {
                    setOpenMenu(null);
                    onDownloadActiveMedia?.();
                  }}
                  title="دانلود فایل اصلی بازشده روی تخته"
                >
                  <HiOutlineArrowDownTray style={{ color: '#10b981' }} />
                  <span>دانلود فایل بارگذاری‌شده ({activeMedia.name || 'فایل'})</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
