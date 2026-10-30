const config = require('../config');

/**
 * Global error handling middleware
 */
const errorHandler = (err, req, res, next) => {
  console.error('❌ Error:', err.message);

  if (config.nodeEnv === 'development') {
    console.error(err.stack);
  }

  // Joi validation errors
  if (err.isJoi) {
    return res.status(400).json({
      success: false,
      message: 'خطای اعتبارسنجی',
      messageEn: 'Validation error',
      errors: err.details.map(d => ({
        field: d.path.join('.'),
        message: d.message,
      })),
    });
  }

  // Knex/PostgreSQL duplicate errors
  if (err.code === '23505' || err.message?.includes('UNIQUE constraint failed')) {
    return res.status(409).json({
      success: false,
      message: 'این مقدار یا رکورد قبلاً در سامانه ثبت شده است',
      messageEn: 'Duplicate entry',
    });
  }

  if (err.code === '23503' || err.message?.includes('FOREIGN KEY constraint failed')) {
    return res.status(400).json({
      success: false,
      message: 'رکورد مرتبط یافت نشد یا معتبر نیست',
      messageEn: 'Referenced record not found',
    });
  }

  // Multer file upload errors
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({
      success: false,
      message: 'حجم فایل بیش از حد مجاز است (حداکثر ۵۰ مگابایت)',
      messageEn: 'File size exceeds limit',
    });
  }

  const statusCode = err.statusCode || 500;
  const safeMessage = (statusCode === 500 && config.nodeEnv === 'production')
    ? 'خطای غیرمنتظره در پردازش درخواست، لطفاً مجدداً تلاش فرمایید.'
    : (err.message || 'خطای داخلی سرور');

  res.status(statusCode).json({
    success: false,
    message: safeMessage,
    messageEn: err.messageEn || 'Internal server error',
    ...(config.nodeEnv === 'development' && { stack: err.stack }),
  });
};

/**
 * 404 handler for unmatched routes
 */
const notFoundHandler = (req, res) => {
  res.status(404).json({
    success: false,
    message: 'مسیر یافت نشد',
    messageEn: 'Route not found',
    path: req.originalUrl,
  });
};

module.exports = { errorHandler, notFoundHandler };
