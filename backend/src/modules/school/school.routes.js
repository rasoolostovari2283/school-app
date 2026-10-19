const express = require('express');
const router = express.Router();
const db = require('../../config/database');
const { authenticate, authorize } = require('../../middleware/auth');

/**
 * Normalize website URL so it always has http:// or https:// protocol
 */
function normalizeUrl(url) {
  if (!url || typeof url !== 'string') return '';
  let trimmed = url.trim();
  if (!trimmed) return '';
  if (!/^https?:\/\//i.test(trimmed)) {
    trimmed = 'https://' + trimmed;
  }
  return trimmed;
}

/**
 * GET /api/v1/school/website
 * Retrieve the current school website link for any authenticated role
 */
router.get('/website', authenticate, async (req, res, next) => {
  try {
    let websiteUrl = '';
    let schoolName = '';

    // 1. Check system_settings table
    try {
      const setting = await db('system_settings').where({ key: 'school_website' }).first();
      if (setting && setting.value) {
        websiteUrl = setting.value;
      }
    } catch (e) {
      console.warn('Could not read from system_settings:', e.message);
    }

    // 2. Check schools table as fallback or context
    try {
      let schoolQuery = db('schools');
      if (req.user && req.user.school_id) {
        schoolQuery = schoolQuery.where({ id: req.user.school_id });
      }
      const school = await schoolQuery.first();
      if (school) {
        schoolName = school.name || '';
        if (!websiteUrl && school.website) {
          websiteUrl = school.website;
        }
      }
    } catch (e) {
      console.warn('Could not read from schools table:', e.message);
    }

    return res.json({
      success: true,
      data: {
        website_url: websiteUrl,
        school_name: schoolName,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/v1/school/website
 * Admin/Manager sets and saves the school website URL
 */
router.put('/website', authenticate, authorize('admin', 'manager'), async (req, res, next) => {
  try {
    const rawUrl = req.body?.website_url || req.body?.url || '';
    const normalized = normalizeUrl(rawUrl);

    // 1. Upsert into system_settings
    try {
      const existing = await db('system_settings').where({ key: 'school_website' }).first();
      if (existing) {
        await db('system_settings')
          .where({ key: 'school_website' })
          .update({
            value: normalized,
            updated_at: db.fn.now(),
          });
      } else {
        await db('system_settings').insert({
          key: 'school_website',
          value: normalized,
          updated_at: db.fn.now(),
        });
      }
    } catch (e) {
      console.warn('Error saving to system_settings:', e.message);
    }

    // 2. Also update schools table
    try {
      let schoolQuery = db('schools');
      if (req.user && req.user.school_id) {
        schoolQuery = schoolQuery.where({ id: req.user.school_id });
      }
      const school = await schoolQuery.first();
      if (school) {
        await db('schools').where({ id: school.id }).update({ website: normalized });
      } else {
        // Update all or first school
        await db('schools').update({ website: normalized });
      }
    } catch (e) {
      console.warn('Error updating schools table website:', e.message);
    }

    return res.json({
      success: true,
      message: 'آدرس وب‌سایت مدرسه با موفقیت ذخیره شد',
      data: {
        website_url: normalized,
      },
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
