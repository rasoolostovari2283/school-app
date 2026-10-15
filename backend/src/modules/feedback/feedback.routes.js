const express = require('express');
const router = express.Router();
const db = require('../../config/database');
const { authenticate } = require('../../middleware/auth');
const { v4: uuidv4 } = require('uuid');

router.use(authenticate);

/**
 * GET /api/v1/feedback — list user's feedback tickets
 */
router.get('/', async (req, res, next) => {
  try {
    let query = db('feedback').orderBy('created_at', 'desc');
    // Non-admin users only see their own
    if (req.user.role !== 'admin') {
      query = query.where('submitted_by', req.user.id);
    }
    const tickets = await query;
    res.json({ success: true, data: { tickets } });
  } catch (err) { next(err); }
});

/**
 * POST /api/v1/feedback — submit anonymous feedback
 */
router.post('/', async (req, res, next) => {
  try {
    const trackingCode = `FB-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    const ticket = {
      id: uuidv4(),
      tracking_code: trackingCode,
      category: req.body.category || 'general',
      message: req.body.message,
      submitted_by: req.body.is_anonymous ? null : req.user.id,
      is_anonymous: req.body.is_anonymous !== false,
    };

    await db('feedback').insert(ticket);

    res.status(201).json({
      success: true,
      message: 'بازخورد شما با موفقیت ثبت شد',
      data: { ticket, tracking_code: trackingCode },
    });
  } catch (err) { next(err); }
});

/**
 * GET /api/v1/feedback/track/:code — track feedback by code
 */
router.get('/track/:code', async (req, res, next) => {
  try {
    const ticket = await db('feedback').where('tracking_code', req.params.code).first();
    if (!ticket) {
      return res.status(404).json({ success: false, message: 'بازخوردی با این کد پیگیری یافت نشد' });
    }
    res.json({ success: true, data: { ticket } });
  } catch (err) { next(err); }
});

/**
 * GET /api/v1/academic-calendar — list academic events
 */
router.get('/academic-calendar', async (req, res, next) => {
  try {
    const events = await db('academic_events').orderBy('start_date', 'asc');
    res.json({ success: true, data: { events } });
  } catch (err) { next(err); }
});

module.exports = router;
