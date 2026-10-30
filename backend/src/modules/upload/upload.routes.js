const express = require('express');
const router = express.Router();
const upload = require('../../middleware/upload');
const { authenticate } = require('../../middleware/auth');

router.use(authenticate);

/**
 * POST /api/v1/upload
 * Supports single file ('file') or multiple files ('files', 'attachments', etc.)
 */
router.post('/', (req, res, next) => {
  upload.any()(req, res, (err) => {
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

      const mapped = uploadedFiles.map((f) => {
        let cleanName = f.originalname;
        try {
          // Busboy decodes headers as latin1 by default; fix UTF-8 Persian/Arabic chars
          const decoded = Buffer.from(f.originalname, 'latin1').toString('utf8');
          if (!decoded.includes('')) {
            cleanName = decoded;
          }
        } catch (e) {}

        return {
          originalname: cleanName,
          filename: f.filename,
          size: f.size,
          mimetype: f.mimetype,
          url: `/uploads/${f.filename}`,
        };
      });

      res.status(201).json({
        success: true,
        message: 'فایل(ها) با موفقیت در فضای داخلی ذخیره شد',
        data: {
          files: mapped,
          file: mapped[0], // for single file convenience
          url: mapped[0].url,
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
