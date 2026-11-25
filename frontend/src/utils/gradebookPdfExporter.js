import { jsPDF } from 'jspdf';

/**
 * Generates and directly downloads a clean, RTL Persian-shaped PDF file for any class grade table
 * using HTML5 Canvas 2D (preserving exact Persian shaping & tabular digits) + jsPDF.
 * Never calls window.open so it works reliably inside iframes and desktop/mobile browsers.
 */
export async function exportGradeTableToPdf({
  title = 'لیست نمرات کلاس',
  subtitle = '',
  schoolName = '',
  teacherName = '',
  columns = [],
  rows = [],
  stats = null,
  fileName = 'class-grades.pdf',
  returnBlobOnly = false,
}) {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  // Wait for web fonts (Vazirmatn) if available
  try {
    if (document.fonts && document.fonts.ready) {
      await document.fonts.ready;
    }
  } catch (_e) {}

  const fontFamily = '"Vazirmatn", "IRANSans", "Tahoma", "Arial", sans-serif';
  const PAGE_W = 1600; // high-DPI landscape canvas width (A4 landscape ratio)
  const PAGE_H = 1131;
  const PAD_X = 64;
  const HEADER_H = 148;
  const TABLE_HEADER_H = 52;
  const ROW_H = 44;
  const FOOTER_STATS_H = stats ? 132 : 44;
  const BOTTOM_PAD = 42;

  const usableFirstPageRows = Math.max(
    6,
    Math.floor((PAGE_H - HEADER_H - TABLE_HEADER_H - FOOTER_STATS_H - BOTTOM_PAD) / ROW_H)
  );
  const usableNextPageRows = Math.max(
    8,
    Math.floor((PAGE_H - 90 - TABLE_HEADER_H - FOOTER_STATS_H - BOTTOM_PAD) / ROW_H)
  );

  // Split rows across pages
  const pages = [];
  if (rows.length === 0) {
    pages.push([]);
  } else {
    let idx = 0;
    while (idx < rows.length) {
      const cap = pages.length === 0 ? usableFirstPageRows : usableNextPageRows;
      pages.push(rows.slice(idx, idx + cap));
      idx += cap;
    }
  }

  const pdf = new jsPDF({
    orientation: 'landscape',
    unit: 'pt',
    format: 'a4',
  });
  const pdfWidth = pdf.internal.pageSize.getWidth();
  const pdfHeight = pdf.internal.pageSize.getHeight();

  const tableW = PAGE_W - PAD_X * 2;
  const totalWeight = columns.reduce((acc, c) => acc + (c.weight || 1), 0) || 1;
  const colWidths = columns.map((c) => ((c.weight || 1) / totalWeight) * tableW);

  // RTL column X positions: column 0 is rightmost!
  const colRects = [];
  let cursorRight = PAGE_W - PAD_X;
  for (let i = 0; i < columns.length; i += 1) {
    const w = colWidths[i];
    const x = cursorRight - w;
    colRects.push({ x, w, align: columns[i].align || 'center' });
    cursorRight = x;
  }

  const drawClippedText = (ctx, text, x, y, maxW, align = 'center') => {
    const str = String(text ?? '—');
    ctx.save();
    ctx.beginPath();
    ctx.rect(x + 6, y - 22, Math.max(10, maxW - 12), 36);
    ctx.clip();
    ctx.direction = 'rtl';
    ctx.textBaseline = 'middle';
    if (align === 'right') {
      ctx.textAlign = 'right';
      ctx.fillText(str, x + maxW - 12, y);
    } else if (align === 'left') {
      ctx.textAlign = 'left';
      ctx.fillText(str, x + 12, y);
    } else {
      ctx.textAlign = 'center';
      ctx.fillText(str, x + maxW / 2, y);
    }
    ctx.restore();
  };

  const dateStr = new Date().toLocaleDateString('fa-IR');

  for (let pIdx = 0; pIdx < pages.length; pIdx += 1) {
    const pageRows = pages[pIdx];
    const isLastPage = pIdx === pages.length - 1;
    const canvas = document.createElement('canvas');
    canvas.width = PAGE_W;
    canvas.height = PAGE_H;
    const ctx = canvas.getContext('2d');

    // Clean white page background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, PAGE_W, PAGE_H);

    // Top accent rule
    ctx.fillStyle = '#4f46e5';
    ctx.fillRect(0, 0, PAGE_W, 8);

    let y = 36;
    if (pIdx === 0) {
      // Header Title (right aligned for RTL)
      ctx.direction = 'rtl';
      ctx.fillStyle = '#0f172a';
      ctx.font = `800 30px ${fontFamily}`;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'top';
      ctx.fillText(title, PAGE_W - PAD_X, y);

      // Left metadata (date & page)
      ctx.fillStyle = '#475569';
      ctx.font = `600 18px ${fontFamily}`;
      ctx.textAlign = 'left';
      ctx.fillText(`تاریخ صدور: ${dateStr}`, PAD_X, y + 6);
      if (schoolName) {
        ctx.fillText(schoolName, PAD_X, y + 36);
      }

      // Subtitle & Teacher
      ctx.textAlign = 'right';
      ctx.fillStyle = '#475569';
      ctx.font = `500 20px ${fontFamily}`;
      const metaLine = [subtitle, teacherName ? `دبیر: ${teacherName}` : '']
        .filter(Boolean)
        .join('  ·  ');
      if (metaLine) {
        ctx.fillText(metaLine, PAGE_W - PAD_X, y + 46);
      }

      // Hairline divider
      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(PAD_X, HEADER_H - 18);
      ctx.lineTo(PAGE_W - PAD_X, HEADER_H - 18);
      ctx.stroke();

      y = HEADER_H;
    } else {
      ctx.direction = 'rtl';
      ctx.fillStyle = '#334155';
      ctx.font = `700 20px ${fontFamily}`;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'top';
      ctx.fillText(`${title} (ادامه — صفحه ${pIdx + 1})`, PAGE_W - PAD_X, y);
      y = 84;
    }

    // Table Header
    ctx.fillStyle = '#f1f5f9';
    ctx.fillRect(PAD_X, y, tableW, TABLE_HEADER_H);
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(PAD_X, y, tableW, TABLE_HEADER_H);

    ctx.fillStyle = '#1e293b';
    ctx.font = `700 18px ${fontFamily}`;
    for (let cIdx = 0; cIdx < columns.length; cIdx += 1) {
      const rect = colRects[cIdx];
      drawClippedText(ctx, columns[cIdx].label, rect.x, y + TABLE_HEADER_H / 2, rect.w, rect.align);
      if (cIdx > 0) {
        ctx.beginPath();
        ctx.moveTo(rect.x + rect.w, y);
        ctx.lineTo(rect.x + rect.w, y + TABLE_HEADER_H);
        ctx.stroke();
      }
    }
    y += TABLE_HEADER_H;

    // Table Rows
    if (pageRows.length === 0) {
      ctx.strokeStyle = '#e2e8f0';
      ctx.strokeRect(PAD_X, y, tableW, ROW_H);
      ctx.fillStyle = '#64748b';
      ctx.font = `500 18px ${fontFamily}`;
      drawClippedText(ctx, 'هنوز نمره یا دانش‌آموزی برای این کلاس ثبت نشده است', PAD_X, y + ROW_H / 2, tableW, 'center');
      y += ROW_H;
    } else {
      for (let rIdx = 0; rIdx < pageRows.length; rIdx += 1) {
        const rowCells = pageRows[rIdx];
        if (rIdx % 2 === 1) {
          ctx.fillStyle = '#f8fafc';
          ctx.fillRect(PAD_X, y, tableW, ROW_H);
        }
        ctx.strokeStyle = '#e2e8f0';
        ctx.lineWidth = 1;
        ctx.strokeRect(PAD_X, y, tableW, ROW_H);

        for (let cIdx = 0; cIdx < columns.length; cIdx += 1) {
          const rect = colRects[cIdx];
          const val = rowCells[cIdx] ?? '—';
          ctx.fillStyle = cIdx === 1 ? '#0f172a' : '#334155';
          ctx.font = cIdx === 1 ? `700 17px ${fontFamily}` : `600 17px ${fontFamily}`;
          drawClippedText(ctx, val, rect.x, y + ROW_H / 2, rect.w, rect.align);

          if (cIdx > 0) {
            ctx.beginPath();
            ctx.moveTo(rect.x + rect.w, y);
            ctx.lineTo(rect.x + rect.w, y + ROW_H);
            ctx.stroke();
          }
        }
        y += ROW_H;
      }
    }

    // 4 Stat Boxes at the bottom of the last page
    if (isLastPage && stats) {
      const statsTop = Math.min(y + 28, PAGE_H - FOOTER_STATS_H - BOTTOM_PAD + 12);
      const boxGap = 18;
      const boxW = (tableW - boxGap * 3) / 4;
      const boxH = 92;

      const statCards = [
        {
          label: 'تعداد دانش‌آموزان',
          value: `${stats.total_students ?? 0} نفر`,
          color: '#0f172a',
        },
        {
          label: 'میانگین نمرات کلاس',
          value: stats.class_average != null ? String(stats.class_average) : '—',
          color: '#4f46e5',
        },
        {
          label: 'بالاترین نمره کلاس',
          value: stats.highest_score != null ? String(stats.highest_score) : '—',
          color: '#059669',
        },
        {
          label: 'درصد قبولی کلاس',
          value: `${stats.pass_rate ?? 0}٪`,
          color: '#d97706',
        },
      ];

      // Draw RTL right-to-left
      for (let i = 0; i < statCards.length; i += 1) {
        const card = statCards[i];
        const bx = PAGE_W - PAD_X - (i + 1) * boxW - i * boxGap;

        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(bx, statsTop, boxW, boxH);
        ctx.strokeStyle = '#cbd5e1';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(bx, statsTop, boxW, boxH);

        ctx.direction = 'rtl';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        ctx.fillStyle = '#64748b';
        ctx.font = `600 17px ${fontFamily}`;
        ctx.fillText(card.label, bx + boxW / 2, statsTop + 28);

        ctx.fillStyle = card.color;
        ctx.font = `800 28px ${fontFamily}`;
        ctx.fillText(card.value, bx + boxW / 2, statsTop + 64);
      }
    }

    // Page footer number
    ctx.direction = 'rtl';
    ctx.fillStyle = '#94a3b8';
    ctx.font = `500 15px ${fontFamily}`;
    ctx.textAlign = 'center';
    ctx.fillText(`صفحه ${pIdx + 1} از ${pages.length}`, PAGE_W / 2, PAGE_H - 22);

    if (pIdx > 0) pdf.addPage();
    const imgData = canvas.toDataURL('image/png');
    pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight, undefined, 'FAST');
  }

  const safeName = String(fileName || 'class-grades.pdf')
    .replace(/[\\/:*?"<>|]+/g, '_')
    .trim();
  const finalName = safeName.endsWith('.pdf') ? safeName : `${safeName}.pdf`;
  const pdfBlob = pdf.output('blob');

  if (returnBlobOnly) {
    return { blob: pdfBlob, fileName: finalName };
  }

  try {
    await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        try {
          const link = document.createElement('a');
          link.href = reader.result;
          link.download = finalName;
          link.target = '_blank';
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          resolve();
        } catch (e) {
          reject(e);
        }
      };
      reader.onerror = reject;
      reader.readAsDataURL(pdfBlob);
    });
  } catch {
    pdf.save(finalName);
  }

  return { blob: pdfBlob, fileName: finalName };
}
