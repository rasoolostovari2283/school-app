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
    // Sanitize extension and force lowercase
    const ext = path.extname(file.originalname).toLowerCase().replace(/[^a-z0-9.]/g, '');
    const filename = `${uuidv4()}${ext || '.bin'}`;
    cb(null, filename);
  },
});

/**
 * File filter — strictly validates safe educational extensions and blocks scripts/executables
 */
const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname || '').toLowerCase();

  // Strict blacklist for executables, web scripts, and active content
  const blockedExts = [
    '.exe', '.bat', '.cmd', '.sh', '.php', '.phtml', '.php3', '.php4', '.php5',
    '.py', '.js', '.mjs', '.cjs', '.vbs', '.msi', '.com', '.scr', '.jar',
    '.html', '.htm', '.xhtml', '.svg', '.svgz', '.htaccess', '.env', '.config'
  ];

  if (!ext || blockedExts.includes(ext)) {
    return cb(new Error('بارگذاری این فرمت فایل به دلایل امنیتی مجاز نمی‌باشد.'), false);
  }

  const allowedExts = [
    // Images
    '.jpg', '.jpeg', '.png', '.gif', '.webp',
    // Documents & Office
    '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt', '.csv',
    // Archives
    '.zip', '.rar', '.7z',
    // Audio & Video
    '.mp3', '.wav', '.ogg', '.webm', '.mp4', '.m4a', '.aac', '.mov'
  ];

  if (allowedExts.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error('فرمت فایل مجاز نیست (فقط PDF، Word، Excel، PowerPoint، عکس، صدا، ویدیو یا فایل فشرده مجاز است)'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: config.upload.maxFileSize || 50 * 1024 * 1024, // 50MB
    files: 10,
  },
});

module.exports = upload;
