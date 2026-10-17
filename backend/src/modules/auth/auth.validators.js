const Joi = require('joi');

const registerSchema = Joi.object({
  email: Joi.string().email().allow(null, ''),
  phone: Joi.string().allow(null, ''),
  password: Joi.string().min(4).allow(null, ''),
  display_name: Joi.string().min(2).max(100).required(),
  username: Joi.string().allow(null, ''),
  role: Joi.string().valid('teacher', 'student', 'parent', 'admin').default('student'),
  locale: Joi.string().valid('fa', 'en').default('fa'),
});

const loginSchema = Joi.object({
  identifier: Joi.string().required(), // username, email, phone, student_code, personnel_code
  password: Joi.string().allow(null, '').default('123456'),
});

const quickEntrySchema = Joi.object({
  display_name: Joi.string().min(2).max(100).required(),
  phone: Joi.string().allow(null, ''),
  role: Joi.string().valid('teacher', 'student', 'parent', 'admin').default('student'),
  password: Joi.string().allow(null, ''),
  school_name: Joi.string().allow(null, ''),
  school_code: Joi.string().allow(null, ''),
  grades: Joi.array().items(Joi.string()).allow(null),
  subject: Joi.string().allow(null, ''),
}).unknown(true);

const updateProfileSchema = Joi.object({
  display_name: Joi.string().min(2).max(100),
  username: Joi.string().min(2).max(50).allow(null, ''),
  avatar_url: Joi.string().uri().allow(null, ''),
  locale: Joi.string().valid('fa', 'en'),
  settings: Joi.object(),
});

module.exports = { registerSchema, loginSchema, quickEntrySchema, updateProfileSchema };
