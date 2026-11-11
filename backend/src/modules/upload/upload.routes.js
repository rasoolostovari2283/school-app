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

const TIERED_MAX_SIZE_BYTES = {
  image: 15 * 1024 * 1024,      // 15 MB for images
  document: 25 * 1024 * 1024,   // 25 MB for PDFs, Office docs, archives
  audio: 50 * 1024 * 1024,      // 50 MB for audio lessons/voice notes
  video: 250 * 1024 * 1024,     // 250 MB for educational videos
};

/**
 * Validates per-category file size limits, magic bytes, and scans for EICAR / executable / script payloads
 * (SEC-UPLOAD-004, SEC-UPLOAD-005, FW-UPLOAD-001)
 */
function verifyAndScanUploadedFile(file) {
  if (!file || !file.path || !fs.existsSync(file.path)) {
    throw new Error('فایل بارگذاری‌شده یافت نشد');
  }

  const mime = String(file.mimetype || '').toLowerCase();
  const ext = path.extname(file.originalname || file.filename || '').toLowerCase();

  // 1. Tiered size limit check (SEC-UPLOAD-004)
  let maxAllowedBytes = TIERED_MAX_SIZE_BYTES.document;
  if (mime.startsWith('image/')) {
    maxAllowedBytes = TIERED_MAX_SIZE_BYTES.image;
  } else if (mime.startsWith('audio/')) {
    maxAllowedBytes = TIERED_MAX_SIZE_BYTES.audio;
  } else if (mime.startsWith('video/')) {
    maxAllowedBytes = TIERED_MAX_SIZE_BYTES.video;
  }

  if (file.size > maxAllowedBytes) {
    const maxMb = Math.round(maxAllowedBytes / (1024 * 1024));
    const err = new Error(`حجم فایل بیش از سقف مجاز برای این نوع فایل (${maxMb} مگابایت) است`);
    err.statusCode = 400;
    throw err;
  }

  // 2. Read header/sample bytes for signature & malware scanning (SEC-UPLOAD-005, FW-UPLOAD-001)
  const sampleSize = Math.min(file.size || 0, 16384);
  if (sampleSize > 0) {
    const buffer = Buffer.alloc(sampleSize);
    const fd = fs.openSync(file.path, 'r');
    try {
      fs.readSync(fd, buffer, 0, sampleSize, 0);
    } finally {
      fs.closeSync(fd);
    }

    const asciiSample = buffer.toString('latin1');

    // EICAR standard antivirus signature
    if (asciiSample.includes('EICAR-STANDARD-ANTIVIRUS-TEST-FILE')) {
      const err = new Error('فایل آلوده به امضای بدافزار (EICAR) شناسایی و مسدود شد');
      err.statusCode = 400;
      throw err;
    }

    // Reject Windows PE ('MZ') and Linux ELF ('\x7FELF') binaries disguised as other extensions
    if (
      (buffer.length >= 2 && buffer[0] === 0x4d && buffer[1] === 0x5a && !['.doc', '.xls', '.ppt'].includes(ext)) ||
      (buffer.length >= 4 && buffer[0] === 0x7f && buffer[1] === 0x45 && buffer[2] === 0x4c && buffer[3] === 0x46)
    ) {
      const err = new Error('بارگذاری فایل‌های اجرایی باینری (PE/ELF) مجاز نیست');
      err.statusCode = 400;
      throw err;
    }

    // Reject embedded server-side / XSS active scripts inside non-video/archive files
    if (/<\?php|<script[\s>]|#!/i.test(asciiSample.slice(0, 2048))) {
      const err = new Error('محتوای اسکریپتی غیرمجاز در فایل بارگذاری‌شده شناسایی شد');
      err.statusCode = 400;
      throw err;
    }
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

      // Verify tiered size limits & malware/script signatures before accepting any file
      for (const f of uploadedFiles) {
        try {
          verifyAndScanUploadedFile(f);
        } catch (scanErr) {
          for (const cleanupFile of uploadedFiles) {
            try {
              if (cleanupFile?.path && fs.existsSync(cleanupFile.path)) {
                fs.unlinkSync(cleanupFile.path);
              }
            } catch (_e) {}
          }
          return res.status(scanErr.statusCode || 400).json({
            success: false,
            message: scanErr.message,
          });
        }
      }

      const mapped = await Promise.all(
        uploadedFiles.map(async (f) => {
          let cleanName = f.originalname;
          try {
            // Busboy decodes headers as latin1 by default; fix UTF-8 Persian/Arabic chars
            const decoded = Buffer.from(f.originalname, 'latin1').toString('utf8');
            if (!decoded.includes('\uFFFD')) {
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
