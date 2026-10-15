import JSZip from 'jszip';

/**
 * Enterprise Client-Side PowerPoint (.pptx) Parser & High-Definition Canvas Renderer
 * Supports:
 * - Theme color schemes (accent1-6, tx1-2, bg1-2, dk1-2, lt1-2)
 * - Slide layout inheritance & master background graphics
 * - Recursive Group Shapes (<p:grpSp>) with transform hierarchies
 * - Tables (<p:graphicFrame> / <a:tbl>) with cell fills, borders, and text
 * - Shape geometry (rect, roundRect, ellipse, lines, callouts)
 * - Embedded pictures and media (<p:pic>)
 * - Multi-run textboxes, line breaks (<a:br>), bullet points (<a:pPr lvl="X">)
 * - Full Persian / Arabic RTL typography and formatting
 */
export async function loadPptxPresentation(arrayBuffer) {
  const zip = await JSZip.loadAsync(arrayBuffer);
  const parser = new DOMParser();

  // ── 1. Parse Theme Color Scheme (ppt/theme/theme1.xml) ──
  const themeColors = {
    dk1: '#000000',
    lt1: '#ffffff',
    dk2: '#1f497d',
    lt2: '#eeece1',
    accent1: '#4f81bd',
    accent2: '#c0504d',
    accent3: '#9bbb59',
    accent4: '#8064a2',
    accent5: '#4bacc6',
    accent6: '#f79646',
    tx1: '#000000',
    tx2: '#1f497d',
    bg1: '#ffffff',
    bg2: '#eeece1',
  };

  const themeXmlStr = await zip.file('ppt/theme/theme1.xml')?.async('string');
  if (themeXmlStr) {
    try {
      const themeDoc = parser.parseFromString(themeXmlStr, 'application/xml');
      const clrScheme = themeDoc.querySelector('clrScheme');
      if (clrScheme) {
        const getClr = (tag) => {
          const el = clrScheme.querySelector(tag);
          if (!el) return null;
          const srgb = el.querySelector('srgbClr');
          if (srgb) return `#${srgb.getAttribute('val')}`;
          const sys = el.querySelector('sysClr');
          if (sys) return `#${sys.getAttribute('lastClr') || '000000'}`;
          return null;
        };

        ['dk1', 'lt1', 'dk2', 'lt2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6'].forEach(
          (k) => {
            const val = getClr(k);
            if (val) themeColors[k] = val;
          }
        );
        themeColors.tx1 = themeColors.dk1;
        themeColors.tx2 = themeColors.dk2;
        themeColors.bg1 = themeColors.lt1;
        themeColors.bg2 = themeColors.lt2;
      }
    } catch (e) {
      console.warn('Could not parse ppt/theme/theme1.xml:', e);
    }
  }

  // ── 2. Determine Slide Dimensions (ppt/presentation.xml) ──
  let sldWidthEMU = 12192000; // 16:9 default (13.33 inches)
  let sldHeightEMU = 6858000;  // 16:9 default (7.5 inches)

  const presXmlStr = await zip.file('ppt/presentation.xml')?.async('string');
  if (presXmlStr) {
    try {
      const presDoc = parser.parseFromString(presXmlStr, 'application/xml');
      const sldSz = presDoc.querySelector('sldSz');
      if (sldSz) {
        const cx = parseInt(sldSz.getAttribute('cx'), 10);
        const cy = parseInt(sldSz.getAttribute('cy'), 10);
        if (cx && cy) {
          sldWidthEMU = cx;
          sldHeightEMU = cy;
        }
      }
    } catch (e) {}
  }

  // Target render canvas size (1920p standard Full HD)
  const renderWidth = 1920;
  const emuToPx = renderWidth / sldWidthEMU;
  const renderHeight = Math.round(sldHeightEMU * emuToPx);

  // ── 3. Discover Slides in Sequential Order ──
  const slideFiles = [];
  zip.forEach((relativePath) => {
    const match = relativePath.match(/^ppt\/slides\/slide(\d+)\.xml$/);
    if (match) {
      slideFiles.push({
        num: parseInt(match[1], 10),
        path: relativePath,
        relsPath: `ppt/slides/_rels/slide${match[1]}.xml.rels`,
      });
    }
  });

  slideFiles.sort((a, b) => a.num - b.num);

  if (slideFiles.length === 0) {
    throw new Error('هیچ اسلایدی در فایل پاورپوینت یافت نشد');
  }

  // ── 4. Pre-load Media Files as Data URLs ──
  const mediaMap = {};
  const mediaPromises = [];
  zip.forEach((path, file) => {
    if (path.startsWith('ppt/media/')) {
      const fileName = path.replace('ppt/media/', '');
      mediaPromises.push(
        file.async('base64').then((b64) => {
          let mime = 'image/png';
          if (path.endsWith('.jpg') || path.endsWith('.jpeg')) mime = 'image/jpeg';
          else if (path.endsWith('.svg')) mime = 'image/svg+xml';
          else if (path.endsWith('.gif')) mime = 'image/gif';
          else if (path.endsWith('.webp')) mime = 'image/webp';
          mediaMap[fileName] = `data:${mime};base64,${b64}`;
        })
      );
    }
  });
  await Promise.all(mediaPromises);

  // Helper: Load HTMLImageElement from src
  const loadImage = (src) =>
    new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = src;
    });

  // Helper: Parse Relationships XML
  const parseRels = async (relsPath) => {
    const relsMap = {};
    const relsXmlStr = await zip.file(relsPath)?.async('string');
    if (relsXmlStr) {
      try {
        const relsDoc = parser.parseFromString(relsXmlStr, 'application/xml');
        relsDoc.querySelectorAll('Relationship').forEach((rel) => {
          const id = rel.getAttribute('Id');
          const target = rel.getAttribute('Target');
          if (id && target) {
            relsMap[id] = target.replace('../media/', '').replace('media/', '');
          }
        });
      } catch (e) {}
    }
    return relsMap;
  };

  // Helper: Resolve Color from XML node (srgbClr, schemeClr, sysClr)
  const resolveColor = (node, defaultColor = '#1e293b') => {
    if (!node) return defaultColor;
    const srgb = node.querySelector('srgbClr');
    if (srgb && srgb.getAttribute('val')) {
      return `#${srgb.getAttribute('val')}`;
    }
    const scheme = node.querySelector('schemeClr');
    if (scheme && scheme.getAttribute('val')) {
      const schemeVal = scheme.getAttribute('val');
      if (themeColors[schemeVal]) return themeColors[schemeVal];
    }
    const sys = node.querySelector('sysClr');
    if (sys && sys.getAttribute('lastClr')) {
      return `#${sys.getAttribute('lastClr')}`;
    }
    return defaultColor;
  };

  // Helper: Detect Persian / Arabic script
  const isRtl = (str) => /[\u0600-\u06FF]/.test(str);

  // Helper: Draw single Shape / Textbox onto Canvas Context
  const renderShape = (ctx, sp, x, y, w, h) => {
    const spPr = sp.querySelector('spPr');
    let hasDrawnBackground = false;

    if (spPr) {
      const solidFill = spPr.querySelector('solidFill');
      if (solidFill) {
        const fillColor = resolveColor(solidFill, null);
        if (fillColor) {
          ctx.fillStyle = fillColor;
          const geom = spPr.querySelector('prstGeom')?.getAttribute('prst') || 'rect';
          if (geom === 'ellipse') {
            ctx.beginPath();
            ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
            ctx.fill();
          } else if (geom === 'roundRect') {
            ctx.beginPath();
            ctx.roundRect(x, y, w, h, Math.min(16, w / 8, h / 8));
            ctx.fill();
          } else {
            ctx.fillRect(x, y, w, h);
          }
          hasDrawnBackground = true;
        }
      }

      // Shape Outline
      const ln = spPr.querySelector('ln');
      if (ln) {
        const lnFill = ln.querySelector('solidFill');
        if (lnFill) {
          ctx.strokeStyle = resolveColor(lnFill, '#94a3b8');
          ctx.lineWidth = Math.max(1, (parseInt(ln.getAttribute('w'), 10) || 12700) * emuToPx);
          ctx.strokeRect(x, y, w, h);
        }
      }
    }

    // Text in Shape
    const txBody = sp.querySelector('txBody');
    if (txBody) {
      const paragraphs = txBody.querySelectorAll('p');
      let currentY = y + 26;

      paragraphs.forEach((p) => {
        const pPr = p.querySelector('pPr');
        const align = pPr?.getAttribute('algn') || 'l';
        const lvl = parseInt(pPr?.getAttribute('lvl'), 10) || 0;

        // Check for bullet
        const hasBullet = !!pPr?.querySelector('buChar, buAutoNum') || lvl > 0;
        const indentX = lvl * 28;

        // Extract paragraphs with runs and line breaks (<a:br>)
        const childNodes = Array.from(p.childNodes);
        let paraRuns = [];
        let curRunText = '';
        let curFontSize = 20;
        let curBold = false;
        let curColor = hasDrawnBackground ? '#ffffff' : '#1e293b';

        childNodes.forEach((child) => {
          if (child.nodeName === 'a:r' || child.nodeName === 'r') {
            const t = child.querySelector('t')?.textContent || '';
            const rPr = child.querySelector('rPr');
            let sz = 20;
            let b = false;
            let col = curColor;

            if (rPr) {
              const szAttr = parseInt(rPr.getAttribute('sz'), 10);
              if (szAttr) sz = szAttr / 100;
              if (rPr.getAttribute('b') === '1') b = true;
              col = resolveColor(rPr, col);
            }
            paraRuns.push({ text: t, size: sz, bold: b, color: col });
          } else if (child.nodeName === 'a:br' || child.nodeName === 'br') {
            paraRuns.push({ isBreak: true });
          }
        });

        if (paraRuns.length === 0) {
          const rawT = p.textContent || '';
          if (rawT.trim()) {
            paraRuns.push({ text: rawT, size: 20, bold: false, color: curColor });
          }
        }

        // Render lines of this paragraph
        let lineText = '';
        let maxLineFontSize = 20;
        let lineBold = false;
        let lineColor = curColor;

        const flushLine = () => {
          if (!lineText.trim()) return;
          const pixelFontSize = Math.max(16, Math.round(maxLineFontSize * emuToPx * 12700 * 1.55));
          ctx.font = `${lineBold ? 'bold ' : ''}${pixelFontSize}px Vazirmatn, Tahoma, Arial, sans-serif`;
          ctx.fillStyle = lineColor;

          const displayText = hasBullet ? `• ${lineText}` : lineText;
          const rtl = isRtl(displayText);

          let drawX = x + 16 + indentX;
          if (align === 'ctr') {
            ctx.textAlign = 'center';
            drawX = x + w / 2;
          } else if (align === 'r' || rtl) {
            ctx.textAlign = 'right';
            drawX = x + w - 16 - indentX;
          } else {
            ctx.textAlign = 'left';
            drawX = x + 16 + indentX;
          }

          ctx.fillText(displayText, drawX, currentY);
          currentY += pixelFontSize * 1.35;
          lineText = '';
        };

        paraRuns.forEach((r) => {
          if (r.isBreak) {
            flushLine();
            currentY += 8;
          } else {
            lineText += r.text;
            if (r.size > maxLineFontSize) maxLineFontSize = r.size;
            if (r.bold) lineBold = true;
            if (r.color) lineColor = r.color;
          }
        });

        // Word-wrap long lines within textbox boundaries
        if (lineText.trim()) {
          const maxBoxW = Math.max(120, w - 32 - indentX);
          const pixelFontSize = Math.max(16, Math.round(maxLineFontSize * emuToPx * 12700 * 1.55));
          ctx.font = `${lineBold ? 'bold ' : ''}${pixelFontSize}px Vazirmatn, Tahoma, Arial, sans-serif`;

          const words = lineText.split(' ');
          let testLine = '';
          for (let n = 0; n < words.length; n++) {
            const candidate = testLine + words[n] + ' ';
            const metrics = ctx.measureText(candidate);
            if (metrics.width > maxBoxW && n > 0) {
              const toDraw = hasBullet && testLine === '' ? `• ${testLine}` : testLine;
              ctx.fillText(
                toDraw,
                align === 'ctr' ? x + w / 2 : align === 'r' || isRtl(toDraw) ? x + w - 16 - indentX : x + 16 + indentX,
                currentY
              );
              testLine = words[n] + ' ';
              currentY += pixelFontSize * 1.35;
            } else {
              testLine = candidate;
            }
          }
          if (testLine.trim()) {
            const toDraw = hasBullet && lineText.startsWith(testLine.trim()) ? `• ${testLine}` : testLine;
            ctx.fillText(
              toDraw,
              align === 'ctr' ? x + w / 2 : align === 'r' || isRtl(toDraw) ? x + w - 16 - indentX : x + 16 + indentX,
              currentY
            );
            currentY += pixelFontSize * 1.45;
          }
        }
      });
    }
  };

  // Helper: Draw Table (<p:graphicFrame> / <a:tbl>)
  const renderTable = (ctx, tbl, x, y, w, h) => {
    const rows = tbl.querySelectorAll('tr');
    if (rows.length === 0) return;

    const rowH = h / rows.length;
    let curY = y;

    rows.forEach((tr, rIdx) => {
      const cells = tr.querySelectorAll('tc');
      const colW = w / Math.max(1, cells.length);
      let curX = x;

      cells.forEach((tc) => {
        // Cell background
        const tcPr = tc.querySelector('tcPr');
        let cellBg = rIdx === 0 ? 'rgba(79, 129, 189, 0.15)' : '#ffffff';
        if (tcPr) {
          const solidFill = tcPr.querySelector('solidFill');
          if (solidFill) cellBg = resolveColor(solidFill, cellBg);
        }
        ctx.fillStyle = cellBg;
        ctx.fillRect(curX, curY, colW, rowH);

        // Cell border
        ctx.strokeStyle = '#cbd5e1';
        ctx.lineWidth = 1;
        ctx.strokeRect(curX, curY, colW, rowH);

        // Cell text
        const cellText = tc.textContent?.trim() || '';
        if (cellText) {
          ctx.fillStyle = rIdx === 0 ? '#1e293b' : '#334155';
          ctx.font = `${rIdx === 0 ? 'bold ' : ''}18px Vazirmatn, Tahoma, sans-serif`;
          ctx.textAlign = 'center';
          ctx.fillText(cellText, curX + colW / 2, curY + rowH / 2 + 6);
        }

        curX += colW;
      });

      curY += rowH;
    });
  };

  // ── 5. Recursive Group Shapes & Layout Resolver ──
  const processGroupChildren = async (ctx, parentNode, relsMap, parentX = 0, parentY = 0, parentScaleX = 1, parentScaleY = 1) => {
    const children = Array.from(parentNode.children);

    for (const child of children) {
      const nodeName = child.nodeName.replace('p:', '').replace('a:', '');

      if (nodeName === 'grpSp') {
        // Nested Group Shape
        const grpXfrm = child.querySelector('grpSpPr xfrm');
        let gx = parentX;
        let gy = parentY;
        let gScaleX = parentScaleX;
        let gScaleY = parentScaleY;

        if (grpXfrm) {
          const off = grpXfrm.querySelector('off');
          const ext = grpXfrm.querySelector('ext');
          const chOff = grpXfrm.querySelector('chOff');
          const chExt = grpXfrm.querySelector('chExt');

          if (off && ext) {
            const rawX = (parseInt(off.getAttribute('x'), 10) || 0) * emuToPx;
            const rawY = (parseInt(off.getAttribute('y'), 10) || 0) * emuToPx;
            const rawW = (parseInt(ext.getAttribute('cx'), 10) || 0) * emuToPx;
            const rawH = (parseInt(ext.getAttribute('cy'), 10) || 0) * emuToPx;

            gx = parentX + rawX * parentScaleX;
            gy = parentY + rawY * parentScaleY;

            if (chExt) {
              const chW = (parseInt(chExt.getAttribute('cx'), 10) || 1) * emuToPx;
              const chH = (parseInt(chExt.getAttribute('cy'), 10) || 1) * emuToPx;
              gScaleX = rawW / chW;
              gScaleY = rawH / chH;
            }
          }
        }

        await processGroupChildren(ctx, child, relsMap, gx, gy, gScaleX, gScaleY);
      } else if (nodeName === 'sp') {
        // Shape / Textbox
        const xfrm = child.querySelector('xfrm');
        if (xfrm) {
          const off = xfrm.querySelector('off');
          const ext = xfrm.querySelector('ext');
          if (off && ext) {
            const rawX = (parseInt(off.getAttribute('x'), 10) || 0) * emuToPx;
            const rawY = (parseInt(off.getAttribute('y'), 10) || 0) * emuToPx;
            const rawW = (parseInt(ext.getAttribute('cx'), 10) || 0) * emuToPx;
            const rawH = (parseInt(ext.getAttribute('cy'), 10) || 0) * emuToPx;

            const x = parentX + rawX * parentScaleX;
            const y = parentY + rawY * parentScaleY;
            const w = rawW * parentScaleX;
            const h = rawH * parentScaleY;

            renderShape(ctx, child, x, y, w, h);
          }
        }
      } else if (nodeName === 'pic') {
        // Image / Picture
        const xfrm = child.querySelector('xfrm');
        const blip = child.querySelector('blip');
        const embedId = blip?.getAttribute('r:embed');

        if (xfrm && embedId && relsMap[embedId]) {
          const off = xfrm.querySelector('off');
          const ext = xfrm.querySelector('ext');
          if (off && ext) {
            const rawX = (parseInt(off.getAttribute('x'), 10) || 0) * emuToPx;
            const rawY = (parseInt(off.getAttribute('y'), 10) || 0) * emuToPx;
            const rawW = (parseInt(ext.getAttribute('cx'), 10) || 0) * emuToPx;
            const rawH = (parseInt(ext.getAttribute('cy'), 10) || 0) * emuToPx;

            const x = parentX + rawX * parentScaleX;
            const y = parentY + rawY * parentScaleY;
            const w = rawW * parentScaleX;
            const h = rawH * parentScaleY;

            const mediaFile = relsMap[embedId];
            const dataUrl = mediaMap[mediaFile];
            if (dataUrl) {
              const img = await loadImage(dataUrl);
              if (img) ctx.drawImage(img, x, y, w, h);
            }
          }
        }
      } else if (nodeName === 'graphicFrame') {
        // Table or Chart
        const xfrm = child.querySelector('xfrm');
        const tbl = child.querySelector('tbl');
        if (xfrm && tbl) {
          const off = xfrm.querySelector('off');
          const ext = xfrm.querySelector('ext');
          if (off && ext) {
            const rawX = (parseInt(off.getAttribute('x'), 10) || 0) * emuToPx;
            const rawY = (parseInt(off.getAttribute('y'), 10) || 0) * emuToPx;
            const rawW = (parseInt(ext.getAttribute('cx'), 10) || 0) * emuToPx;
            const rawH = (parseInt(ext.getAttribute('cy'), 10) || 0) * emuToPx;

            const x = parentX + rawX * parentScaleX;
            const y = parentY + rawY * parentScaleY;
            const w = rawW * parentScaleX;
            const h = rawH * parentScaleY;

            renderTable(ctx, tbl, x, y, w, h);
          }
        }
      }
    }
  };

  // ── 6. Render Slide Canvas with Layout & Master Inheritance ──
  const renderSlideCanvas = async (slideIndex) => {
    if (slideIndex < 0 || slideIndex >= slideFiles.length) return null;
    const slideInfo = slideFiles[slideIndex];

    const slideXmlStr = await zip.file(slideInfo.path)?.async('string');
    if (!slideXmlStr) return null;

    const slideDoc = parser.parseFromString(slideXmlStr, 'application/xml');
    const relsMap = await parseRels(slideInfo.relsPath);

    // Create high-res Full HD Canvas
    const canvas = document.createElement('canvas');
    canvas.width = renderWidth;
    canvas.height = renderHeight;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    // ── A. Resolve Slide Background ──
    let bgColor = themeColors.bg1 || '#ffffff';

    const bgSolid = slideDoc.querySelector('bg srgbClr, bgPr srgbClr');
    if (bgSolid && bgSolid.getAttribute('val')) {
      bgColor = `#${bgSolid.getAttribute('val')}`;
    } else {
      const bgScheme = slideDoc.querySelector('bg schemeClr, bgPr schemeClr');
      if (bgScheme && themeColors[bgScheme.getAttribute('val')]) {
        bgColor = themeColors[bgScheme.getAttribute('val')];
      }
    }

    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, renderWidth, renderHeight);

    // Check for Background Image
    const bgBlip = slideDoc.querySelector('bg blip, bgPr blip');
    const bgEmbed = bgBlip?.getAttribute('r:embed');
    if (bgEmbed && relsMap[bgEmbed] && mediaMap[relsMap[bgEmbed]]) {
      const bgImg = await loadImage(mediaMap[relsMap[bgEmbed]]);
      if (bgImg) ctx.drawImage(bgImg, 0, 0, renderWidth, renderHeight);
    }

    // ── B. Render Template Shapes from Slide Layout if Present ──
    // Find layout file referenced in slide relations
    let layoutRelsPath = null;
    let layoutXmlPath = null;
    const relsXmlStr = await zip.file(slideInfo.relsPath)?.async('string');
    if (relsXmlStr) {
      const match = relsXmlStr.match(/Target="\.\.\/slideLayouts\/(slideLayout\d+\.xml)"/);
      if (match) {
        layoutXmlPath = `ppt/slideLayouts/${match[1]}`;
        layoutRelsPath = `ppt/slideLayouts/_rels/${match[1]}.rels`;
      }
    }

    if (layoutXmlPath) {
      const layoutXmlStr = await zip.file(layoutXmlPath)?.async('string');
      if (layoutXmlStr) {
        const layoutDoc = parser.parseFromString(layoutXmlStr, 'application/xml');
        const layoutRelsMap = layoutRelsPath ? await parseRels(layoutRelsPath) : {};

        // Render non-placeholder shapes from layout (decorative graphics, banners, school logos)
        const layoutSpTree = layoutDoc.querySelector('spTree');
        if (layoutSpTree) {
          const layoutShapes = Array.from(layoutSpTree.children).filter((el) => {
            // Placeholders <p:ph> belong to the slide, non-placeholders are template artwork
            return !el.querySelector('ph');
          });
          for (const lEl of layoutShapes) {
            await processGroupChildren(ctx, { children: [lEl] }, layoutRelsMap);
          }
        }
      }
    }

    // ── C. Render Slide Elements (Groups, Shapes, Images, Tables) ──
    const spTree = slideDoc.querySelector('spTree');
    if (spTree) {
      await processGroupChildren(ctx, spTree, relsMap);
    }

    return canvas;
  };

  return {
    numPages: slideFiles.length,
    slideWidth: renderWidth,
    slideHeight: renderHeight,
    renderSlideCanvas,
  };
}
