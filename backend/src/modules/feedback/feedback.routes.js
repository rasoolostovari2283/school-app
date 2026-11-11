const express = require('express');
const router = express.Router();
const db = require('../../config/database');
const { authenticate, isSchoolAdmin } = require('../../middleware/auth');
const { v4: uuidv4 } = require('uuid');

router.use(authenticate);

/**
 * GET /api/v1/feedback — list user's feedback tickets scoped to school
 */
router.get('/', async (req, res, next) => {
  try {
    let query = db('feedback')
      .leftJoin('users as submitter', 'submitter.id', 'feedback.submitted_by')
      .select('feedback.*')
      .orderBy('feedback.created_at', 'desc');

    if (isSchoolAdmin(req.user)) {
      query = query.where('submitter.school_id', req.user.school_id);
    } else {
      query = query.where('feedback.submitted_by', req.user.id);
    }

    const rawTickets = await query;
    const tickets = rawTickets.map((t) => {
      if (t.is_anonymous && t.submitted_by !== req.user.id) {
        return { ...t, submitted_by: null };
      }
      return t;
    });
    res.json({ success: true, data: { tickets } });
  } catch (err) { next(err); }
});

/**
 * POST /api/v1/feedback — submit feedback
 */
router.post('/', async (req, res, next) => {
  try {
    if (!req.body?.message || !String(req.body.message).trim()) {
      return res.status(400).json({ success: false, message: 'متن بازخورد الزامی است' });
    }
    const trackingCode = `FB-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    const ticket = {
      id: uuidv4(),
      tracking_code: trackingCode,
      category: req.body.category || 'general',
      message: String(req.body.message).trim(),
      submitted_by: req.user.id,
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
    const canTrackAllSchool = isSchoolAdmin(req.user) || ['teacher', 'counselor'].includes(req.user.role);
    const ticket = await db('feedback')
      .leftJoin('users as submitter', 'submitter.id', 'feedback.submitted_by')
      .where('feedback.tracking_code', req.params.code)
      .andWhere(function () {
        this.where('feedback.submitted_by', req.user.id);
        if (canTrackAllSchool && req.user.school_id) {
          this.orWhere('submitter.school_id', req.user.school_id);
        }
      })
      .select('feedback.*')
      .first();
    if (!ticket) {
      return res.status(404).json({ success: false, message: 'بازخوردی با این کد پیگیری یافت نشد' });
    }
    if (ticket.is_anonymous && ticket.submitted_by !== req.user.id) {
      ticket.submitted_by = null;
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
