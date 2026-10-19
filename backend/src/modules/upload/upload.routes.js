const express = require('express');
const router = express.Router();
const upload = require('../../middleware/upload');
const { authenticate } = require('../../middleware/auth');

router.use(authenticate);

/**
 * POST /api/v1/upload
 * Supports single file ('file') or multiple files ('files')
 */
router.post('/', (req, res, next) => {
  upload.fields([{ name: 'file', maxCount: 1 }, { name: 'files', maxCount: 10 }])(req, res, (err) => {
    if (err) {
      return res.status(400).json({
        success: false,
        message: err.message || 'خطا در اعتبارسنجی فایل بارگذاری‌شده',
      });
    }

    try {
      const uploadedFiles = [];

      if (req.files?.file && req.files.file.length > 0) {
        uploadedFiles.push(...req.files.file);
      }
      if (req.files?.files && req.files.files.length > 0) {
        uploadedFiles.push(...req.files.files);
      }

      if (uploadedFiles.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'هیچ فایلی برای بارگذاری ارسال نشده است',
        });
      }

      const mapped = uploadedFiles.map((f) => ({
        originalname: f.originalname,
        filename: f.filename,
        size: f.size,
        mimetype: f.mimetype,
        url: `/uploads/${f.filename}`,
      }));

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
