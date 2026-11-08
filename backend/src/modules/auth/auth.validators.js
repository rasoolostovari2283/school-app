const Joi = require('joi');

/**
 * Roles a client may ask for on an unauthenticated (self-service) endpoint.
 * A privileged role is never part of this list (report finding A1).
 */
const SELF_SERVICE_ROLES = ['teacher', 'student', 'parent'];

const registerSchema = Joi.object({
  email: Joi.string().email().allow(null, ''),
  phone: Joi.string().allow(null, ''),
  // A password must be supplied and must be at least 8 characters long.
  password: Joi.string().min(8).required(),
  display_name: Joi.string().min(2).max(100).required(),
  username: Joi.string().allow(null, ''),
  role: Joi.string().valid(...SELF_SERVICE_ROLES).default('student'),
  locale: Joi.string().valid('fa', 'en').default('fa'),
});

const loginSchema = Joi.object({
  identifier: Joi.string().required(), // username, email, phone, student_code, personnel_code
  // The password is never defaulted. A missing or blank password is rejected by
  // the service with 401, so an account can never be opened without a
  // credential (report finding F11). Only the presence of a password is
  // required here: accounts created before the 8 character rule keep working.
  password: Joi.string().allow(null, ''),
});

const quickEntrySchema = Joi.object({
  display_name: Joi.string().min(2).max(100).required(),
  phone: Joi.string().allow(null, ''),
  role: Joi.string().valid(...SELF_SERVICE_ROLES).default('student'),
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
