import JSZip from 'jszip';

const PERSIAN_OR_ARABIC_REGEX = /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/;

/**
 * Pure helper: extract structured text blocks (headings, paragraphs, table rows)
 * from a Word document.xml string safely via XML DOMParser (never innerHTML).
 */
export function parseWordXmlBlocks(xmlString) {
  if (!xmlString) return [];
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlString, 'application/xml');
  const body = xmlDoc.getElementsByTagNameNS('*', 'body')[0] || xmlDoc.documentElement;
  if (!body) return [];

  const blocks = [];

  const extractParagraphText = (pNode) => {
    const parts = [];
    const walk = (node) => {
      if (!node || !node.childNodes) return;
      for (let i = 0; i < node.childNodes.length; i += 1) {
        const child = node.childNodes[i];
        const local = child.localName || child.nodeName || '';
        if (local === 't') {
          parts.push(child.textContent || '');
        } else if (local === 'tab') {
          parts.push('    ');
        } else if (local === 'br' || local === 'cr') {
          parts.push('\n');
        } else {
          walk(child);
        }
      }
    };
    walk(pNode);
    return parts.join('');
  };

  for (let i = 0; i < body.childNodes.length; i += 1) {
    const node = body.childNodes[i];
    const local = node.localName || node.nodeName || '';

    if (local === 'p') {
      const rawText = extractParagraphText(node).trim();
      if (!rawText) {
        blocks.push({ type: 'spacer', text: '' });
        continue;
      }
      const pStyle = node.getElementsByTagNameNS('*', 'pStyle')[0];
      const styleVal = (pStyle?.getAttribute('w:val') || pStyle?.getAttribute('val') || '').toLowerCase();
      const hasBold = node.getElementsByTagNameNS('*', 'b').length > 0;
      const isHeading =
        styleVal.includes('heading') ||
        styleVal.includes('title') ||
        styleVal.includes('subtitle');
      const level = styleVal.includes('1') || styleVal.includes('title') ? 1 : isHeading ? 2 : 0;

      blocks.push({
        type: isHeading ? 'heading' : 'paragraph',
        level,
        bold: isHeading || hasBold,
        text: rawText,
        rtl: PERSIAN_OR_ARABIC_REGEX.test(rawText),
      });
    } else if (local === 'tbl') {
      const rows = node.getElementsByTagNameNS('*', 'tr');
      for (let r = 0; r < rows.length; r += 1) {
        const cells = rows[r].getElementsByTagNameNS('*', 'tc');
        const cellTexts = [];
        for (let c = 0; c < cells.length; c += 1) {
          const ps = cells[c].getElementsByTagNameNS('*', 'p');
          const cellLines = [];
          for (let p = 0; p < ps.length; p += 1) {
            const t = extractParagraphText(ps[p]).trim();
            if (t) cellLines.push(t);
          }
          cellTexts.push(cellLines.join(' '));
        }
        const rowLine = cellTexts.filter(Boolean).join('  |  ');
        if (rowLine) {
          blocks.push({
            type: 'table-row',
            bold: r === 0,
            text: rowLine,
            rtl: PERSIAN_OR_ARABIC_REGEX.test(rowLine),
          });
        }
      }
      blocks.push({ type: 'spacer', text: '' });
    }
  }

  return blocks;
}

/**
 * Loads a Word file (.docx or plain text fallback) and paginates it into
 * crisp high-DPI canvas pages with prev/next page navigation.
 */
export async function loadWordDocument(arrayBuffer, fileName = 'document.docx') {
  let blocks = [];

  try {
    const zip = await JSZip.loadAsync(arrayBuffer);
    const docXml = await zip.file('word/document.xml')?.async('string');
    if (docXml) {
      blocks = parseWordXmlBlocks(docXml);
    }
  } catch (_zipErr) {
    // Fallback for plain text or legacy .doc readable strings
    try {
      const decoded = new TextDecoder('utf-8', { fatal: false }).decode(arrayBuffer);
      const lines = decoded
        .replace(/\u0000/g, '')
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l.length > 0);
      blocks = lines.map((line) => ({
        type: 'paragraph',
        level: 0,
        bold: false,
        text: line,
        rtl: PERSIAN_OR_ARABIC_REGEX.test(line),
      }));
    } catch (_txtErr) {
      blocks = [];
    }
  }

  if (blocks.length === 0) {
    blocks = [
      {
        type: 'heading',
        level: 1,
        bold: true,
        text: fileName,
        rtl: PERSIAN_OR_ARABIC_REGEX.test(fileName),
      },
      {
        type: 'paragraph',
        level: 0,
        bold: false,
        text: 'محتوای متنی قابل نمایش در این سند یافت نشد. می‌توانید روی این صفحه یادداشت‌برداری کنید.',
        rtl: true,
      },
    ];
  }

  const PAGE_W = 1240;
  const PAGE_H = 1754;
  const MARGIN_X = 92;
  const MARGIN_TOP = 110;
  const MARGIN_BOTTOM = 100;
  const MAX_W = PAGE_W - MARGIN_X * 2;

  // Measure & wrap all blocks into pages using an offscreen measurement canvas
  const measureCanvas = document.createElement('canvas');
  measureCanvas.width = PAGE_W;
  measureCanvas.height = 100;
  const mCtx = measureCanvas.getContext('2d');

  const wrapTextLines = (text, font, maxWidth) => {
    mCtx.font = font;
    const rawLines = String(text || '').split('\n');
    const out = [];
    for (const raw of rawLines) {
      const words = raw.split(/\s+/).filter(Boolean);
      if (words.length === 0) {
        out.push('');
        continue;
      }
      let current = words[0];
      for (let i = 1; i < words.length; i += 1) {
        const candidate = `${current} ${words[i]}`;
        if (mCtx.measureText(candidate).width <= maxWidth) {
          current = candidate;
        } else {
          out.push(current);
          current = words[i];
        }
      }
      out.push(current);
    }
    return out;
  };

  const pages = [[]];
  let currentY = MARGIN_TOP;

  for (const block of blocks) {
    if (block.type === 'spacer') {
      currentY += 18;
      continue;
    }

    const fontSize = block.type === 'heading' ? (block.level === 1 ? 36 : 29) : block.type === 'table-row' ? 22 : 25;
    const lineHeight = Math.round(fontSize * 1.65);
    const weight = block.bold ? '700' : '400';
    const font = `${weight} ${fontSize}px Vazirmatn, Tahoma, Arial, sans-serif`;
    const lines = wrapTextLines(block.text, font, MAX_W - (block.type === 'table-row' ? 24 : 0));

    for (const line of lines) {
      if (currentY + lineHeight > PAGE_H - MARGIN_BOTTOM) {
        pages.push([]);
        currentY = MARGIN_TOP;
      }
      pages[pages.length - 1].push({
        text: line,
        font,
        fontSize,
        lineHeight,
        y: currentY,
        rtl: block.rtl,
        isHeading: block.type === 'heading',
        isTableRow: block.type === 'table-row',
      });
      currentY += lineHeight;
    }
    currentY += block.type === 'heading' ? 16 : 12;
  }

  const totalPages = Math.max(1, pages.length);

  const renderPage = async (pageNum, targetCanvas) => {
    const idx = Math.min(Math.max(1, pageNum), totalPages) - 1;
    const items = pages[idx] || [];
    targetCanvas.width = PAGE_W;
    targetCanvas.height = PAGE_H;
    const ctx = targetCanvas.getContext('2d');

    // Crisp white paper background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, PAGE_W, PAGE_H);

    // Subtle document top accent bar & header
    ctx.fillStyle = '#2563eb';
    ctx.fillRect(0, 0, PAGE_W, 8);
    ctx.fillStyle = '#64748b';
    ctx.font = '600 18px Vazirmatn, Tahoma, Arial, sans-serif';
    ctx.direction = 'rtl';
    ctx.textAlign = 'right';
    ctx.fillText(fileName, PAGE_W - MARGIN_X, 56);

    ctx.direction = 'ltr';
    ctx.textAlign = 'left';
    ctx.fillText(`${idx + 1} / ${totalPages}`, MARGIN_X, 56);

    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(MARGIN_X, 74);
    ctx.lineTo(PAGE_W - MARGIN_X, 74);
    ctx.stroke();

    for (const item of items) {
      if (item.isTableRow) {
        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(MARGIN_X, item.y - item.fontSize, MAX_W, item.lineHeight);
        ctx.strokeStyle = '#cbd5e1';
        ctx.lineWidth = 1;
        ctx.strokeRect(MARGIN_X, item.y - item.fontSize, MAX_W, item.lineHeight);
      }

      ctx.font = item.font;
      ctx.fillStyle = item.isHeading ? '#1e3a8a' : '#0f172a';
      ctx.direction = item.rtl ? 'rtl' : 'ltr';
      ctx.textAlign = item.rtl ? 'right' : 'left';
      const drawX = item.rtl
        ? PAGE_W - MARGIN_X - (item.isTableRow ? 12 : 0)
        : MARGIN_X + (item.isTableRow ? 12 : 0);
      ctx.fillText(item.text, drawX, item.y);
    }

    return targetCanvas;
  };

  return {
    fileName,
    totalPages,
    width: PAGE_W,
    height: PAGE_H,
    renderPage,
  };
}
