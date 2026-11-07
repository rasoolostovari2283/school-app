const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');

let sharp = null;
try {
  // On Linux x86_64, prebuilt libvips requires SSSE3 / SSE4.2 instructions (x86-64-v2).
  // Older host CPUs (e.g. AMD Phenom II / Athlon) will instantly crash the entire process with SIGILL (Illegal instruction).
  let isCpuCompatible = true;
  if (process.platform === 'linux' && fs.existsSync('/proc/cpuinfo')) {
    const cpuInfo = fs.readFileSync('/proc/cpuinfo', 'utf8');
    if (!cpuInfo.includes('ssse3')) {
      isCpuCompatible = false;
    }
  }

  if (isCpuCompatible) {
    sharp = require('sharp');
  } else {
    console.warn('⚠️ [Image Optimization] Host CPU lacks SSSE3 instructions. Bypassing native Sharp to prevent SIGILL crash.');
  }
} catch (e) {
  console.warn('⚠️ [Image Optimization] Sharp could not be loaded:', e.message);
  sharp = null;
}

const upload = require('../../middleware/upload');
const { authenticate } = require('../../middleware/auth');

router.use(authenticate);

/**
 * Optimizes an uploaded image using Sharp:
 * - Auto-rotates orientation according to EXIF metadata
 * - Downscales ultra-large images to max 1920x1920
 * - Compresses with quality 82
 * - Generates a companion thumbnail for lightning-fast preview rendering
 */
async function processImageOptimization(file) {
  if (!sharp || !file || !file.mimetype || !file.mimetype.startsWith('image/')) {
    return { thumbUrl: null };
  }
  if (file.mimetype === 'image/svg+xml' || file.mimetype === 'image/gif') {
    return { thumbUrl: null };
  }

  const filePath = file.path;
  const dir = path.dirname(filePath);
  const ext = path.extname(file.filename);
  const baseName = path.basename(file.filename, ext);
  const thumbFilename = `thumb_${baseName}${ext}`;
  const thumbPath = path.join(dir, thumbFilename);

  try {
    const metadata = await sharp(filePath).metadata();
    
    // Create fast preview thumbnail (320px)
    await sharp(filePath)
      .rotate()
      .resize({ width: 320, height: 320, fit: 'inside', withoutEnlargement: true })
      .toFile(thumbPath);

    // If original image is oversized (e.g. 4000x3000 from mobile camera), downscale & compress
    if (metadata.width > 1920 || metadata.height > 1920 || file.size > 1.5 * 1024 * 1024) {
      const tempOptimizedPath = path.join(dir, `opt_${file.filename}`);
      let pipeline = sharp(filePath).rotate().resize({
        width: 1920,
        height: 1920,
        fit: 'inside',
        withoutEnlargement: true,
      });

      if (file.mimetype === 'image/jpeg' || file.mimetype === 'image/jpg') {
        pipeline = pipeline.jpeg({ quality: 82, mozjpeg: true });
      } else if (file.mimetype === 'image/png') {
        pipeline = pipeline.png({ compressionLevel: 8 });
      } else if (file.mimetype === 'image/webp') {
        pipeline = pipeline.webp({ quality: 82 });
      }

      await pipeline.toFile(tempOptimizedPath);

      // Replace original file with optimized file if smaller
      const newStat = fs.statSync(tempOptimizedPath);
      if (newStat.size < file.size) {
        fs.unlinkSync(filePath);
        fs.renameSync(tempOptimizedPath, filePath);
        file.size = newStat.size;
      } else {
        try { fs.unlinkSync(tempOptimizedPath); } catch (e) {}
      }
    }

    return { thumbUrl: `/uploads/${thumbFilename}` };
  } catch (err) {
    // If sharp fails on corrupt image, fail-open to preserve original upload
    return { thumbUrl: null };
  }
}

/**
 * POST /api/v1/upload
 * Supports single file ('file') or multiple files ('files', 'attachments', etc.)
 */
router.post('/', (req, res, next) => {
  upload.any()(req, res, async (err) => {
    if (err) {
      return res.status(400).json({
        success: false,
        message: err.message || 'خطا در اعتبارسنجی فایل بارگذاری‌شده',
      });
    }

    try {
      const uploadedFiles = req.files || [];

      if (uploadedFiles.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'هیچ فایلی برای بارگذاری ارسال نشده است',
        });
      }

      const mapped = await Promise.all(
        uploadedFiles.map(async (f) => {
          let cleanName = f.originalname;
          try {
            // Busboy decodes headers as latin1 by default; fix UTF-8 Persian/Arabic chars
            const decoded = Buffer.from(f.originalname, 'latin1').toString('utf8');
            if (!decoded.includes('')) {
              cleanName = decoded;
            }
          } catch (e) {}

          const { thumbUrl } = await processImageOptimization(f);

          return {
            originalname: cleanName,
            filename: f.filename,
            size: f.size,
            mimetype: f.mimetype,
            url: `/uploads/${f.filename}`,
            thumb_url: thumbUrl || `/uploads/${f.filename}`,
          };
        })
      );

      res.status(201).json({
        success: true,
        message: 'فایل(ها) با موفقیت در فضای داخلی ذخیره و بهینه‌سازی شد',
        data: {
          files: mapped,
          file: mapped[0], // for single file convenience
          url: mapped[0].url,
          thumb_url: mapped[0].thumb_url,
        },
      });
    } catch (catchErr) {
      res.status(500).json({
        success: false,
        message: 'خطا در پردازش فایل: ' + catchErr.message,
      });
    }
  });
});

module.exports = router;
