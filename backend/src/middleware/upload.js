const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const config = require('../config');

const mimeToExtMap = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/bmp': '.bmp',
  'image/heic': '.heic',
  'image/heif': '.heif',
  'application/pdf': '.pdf',
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/vnd.ms-excel': '.xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
  'application/vnd.ms-powerpoint': '.ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx',
  'text/plain': '.txt',
  'text/csv': '.csv',
  'application/zip': '.zip',
  'application/x-zip-compressed': '.zip',
  'application/x-rar-compressed': '.rar',
  'application/vnd.rar': '.rar',
  'application/x-7z-compressed': '.7z',
  'audio/mpeg': '.mp3',
  'audio/mp3': '.mp3',
  'audio/wav': '.wav',
  'audio/ogg': '.ogg',
  'audio/webm': '.webm',
  'audio/mp4': '.m4a',
  'audio/x-m4a': '.m4a',
  'audio/m4a': '.m4a',
  'audio/aac': '.aac',
  'video/mp4': '.mp4',
  'video/webm': '.webm',
  'video/quicktime': '.mov',
};

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
    let ext = path.extname(file.originalname || '').toLowerCase().replace(/[^a-z0-9.]/g, '');
    if (!ext && file.mimetype) {
      ext = mimeToExtMap[file.mimetype] || '';
    }
    const filename = `${uuidv4()}${ext || '.bin'}`;
    cb(null, filename);
  },
});

/**
 * File filter — validates safe educational extensions and blocks scripts/executables
 */
const fileFilter = (req, file, cb) => {
  let ext = path.extname(file.originalname || '').toLowerCase();
  if (!ext && file.mimetype) {
    ext = mimeToExtMap[file.mimetype] || '';
  }

  // Strict blacklist for executables, web scripts, and active content
  const blockedExts = [
    '.exe', '.bat', '.cmd', '.sh', '.php', '.phtml', '.php3', '.php4', '.php5',
    '.py', '.js', '.mjs', '.cjs', '.vbs', '.msi', '.com', '.scr', '.jar',
    '.html', '.htm', '.xhtml', '.svg', '.svgz', '.htaccess', '.env', '.config'
  ];

  if (blockedExts.includes(ext)) {
    return cb(new Error('بارگذاری این فرمت فایل به دلایل امنیتی مجاز نمی‌باشد.'), false);
  }

  const allowedExts = [
    // Images
    '.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.jfif', '.heic', '.heif',
    // Documents & Office
    '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.pps', '.ppsx', '.txt', '.csv', '.rtf', '.odt', '.ods', '.odp',
    // Archives
    '.zip', '.rar', '.7z',
    // Audio & Video
    '.mp3', '.wav', '.ogg', '.webm', '.mp4', '.m4a', '.aac', '.mov', '.m4v'
  ];

  if ((ext && allowedExts.includes(ext)) || (file.mimetype && mimeToExtMap[file.mimetype])) {
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
    files: 30,
  },
});

module.exports = upload;
