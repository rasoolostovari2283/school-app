const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const config = require('../config');

/**
 * Multer storage configuration — saves files with UUID-based names
 */
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.isAbsolute(config.upload.dir)
      ? config.upload.dir
      : path.resolve(__dirname, '../../uploads');
    if (!fs.existsSync(uploadPath)) {
      try {
        fs.mkdirSync(uploadPath, { recursive: true });
      } catch (e) {}
    }
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const filename = `${uuidv4()}${ext}`;
    cb(null, filename);
  },
});

/**
 * File filter — allows images, documents, presentations, archives, audio, and video
 */
const fileFilter = (req, file, cb) => {
  const allowedMimes = [
    // Images
    'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
    // Documents & Office
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
    'text/csv',
    // Archives
    'application/zip',
    'application/x-zip-compressed',
    'application/x-rar-compressed',
    'application/vnd.rar',
    'application/x-7z-compressed',
    'application/octet-stream',
    // Audio
    'audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/webm', 'audio/mp4', 'audio/x-m4a', 'audio/m4a', 'audio/aac',
    // Video
    'video/mp4', 'video/webm', 'video/quicktime',
  ];

  const ext = path.extname(file.originalname).toLowerCase();
  const allowedExts = [
    '.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg',
    '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt', '.csv',
    '.zip', '.rar', '.7z',
    '.mp3', '.wav', '.ogg', '.webm', '.mp4', '.m4a', '.aac', '.mov'
  ];

  if (allowedMimes.includes(file.mimetype) || allowedExts.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error('فرمت فایل مجاز نیست (فقط PDF، Word، Excel، PowerPoint، تصویر یا ZIP مجاز است)'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: config.upload.maxFileSize,
  },
});

module.exports = upload;
