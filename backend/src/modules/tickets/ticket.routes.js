const express = require('express');
const router = express.Router();
const db = require('../../config/database');
const {
  authenticate,
  assertSameSchool,
  forbiddenError,
} = require('../../middleware/auth');
const { v4: uuidv4 } = require('uuid');

router.use(authenticate);

/**
 * GET /api/v1/tickets
 * List tickets scoped to the requester's school
 */
router.get('/', async (req, res, next) => {
  try {
    let query = db('school_tickets')
      .join('users', 'users.id', 'school_tickets.user_id')
      .where('users.school_id', req.user.school_id)
      .select(
        'school_tickets.*',
        'users.display_name as creator_name',
        'users.role as creator_role'
      );

    if (!['teacher', 'admin', 'manager'].includes(req.user.role)) {
      query = query.where('school_tickets.user_id', req.user.id);
    }

    const tickets = await query.orderBy('school_tickets.created_at', 'desc');
    res.json({ success: true, data: { tickets } });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/tickets
 * Create new ticket
 */
router.post('/', async (req, res, next) => {
  try {
    const { department, priority, subject, message } = req.body;
    if (!department || !subject || !message) {
      return res.status(400).json({ success: false, message: 'لطفاً دپارتمان، موضوع و شرح تیکت را وارد نمایید' });
    }

    const ticketNumber = `TCK-${Date.now().toString().slice(-5)}`;
    const ticketId = uuidv4();

    const newTicket = {
      id: ticketId,
      ticket_number: ticketNumber,
      user_id: req.user.id,
      department: department || 'educational',
      priority: priority || 'normal',
      subject,
      message,
      status: 'open',
    };

    await db('school_tickets').insert(newTicket);

    await db('school_ticket_messages').insert({
      id: uuidv4(),
      ticket_id: ticketId,
      sender_id: req.user.id,
      message,
    });

    res.status(201).json({
      success: true,
      message: 'تیکت شما با موفقیت ثبت شد و به واحد مربوطه ارجاع گردید',
      data: { ticket: newTicket },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/tickets/:id
 * Get ticket details with thread messages
 */
router.get('/:id', async (req, res, next) => {
  try {
    const ticket = await db('school_tickets')
      .join('users', 'users.id', 'school_tickets.user_id')
      .select(
        'school_tickets.*',
        'users.display_name as creator_name',
        'users.role as creator_role',
        'users.school_id as creator_school_id'
      )
      .where('school_tickets.id', req.params.id)
      .first();

    if (!ticket) {
      return res.status(404).json({ success: false, message: 'تیکت یافت نشد' });
    }

    assertSameSchool(req.user, { school_id: ticket.creator_school_id });

    if (!['teacher', 'admin', 'manager'].includes(req.user.role) && ticket.user_id !== req.user.id) {
      throw forbiddenError('دسترسی غیرمجاز');
    }

    const messages = await db('school_ticket_messages')
      .join('users', 'users.id', 'school_ticket_messages.sender_id')
      .select(
        'school_ticket_messages.*',
        'users.display_name as sender_name',
        'users.role as sender_role'
      )
      .where('school_ticket_messages.ticket_id', req.params.id)
      .orderBy('school_ticket_messages.created_at', 'asc');

    res.json({ success: true, data: { ticket, messages } });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/tickets/:id/reply
 * Reply to ticket thread (same school + owner or staff only)
 */
router.post('/:id/reply', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { message, attachment_url } = req.body;
    if (!message) {
      return res.status(400).json({ success: false, message: 'متن پاسخ الزامی است' });
    }

    const ticket = await db('school_tickets').where('id', id).first();
    if (!ticket) return res.status(404).json({ success: false, message: 'تیکت یافت نشد' });

    const creator = await db('users').where('id', ticket.user_id).first();
    assertSameSchool(req.user, creator);

    if (!['teacher', 'admin', 'manager'].includes(req.user.role) && ticket.user_id !== req.user.id) {
      throw forbiddenError('شما مجاز به پاسخ به این تیکت نیستید');
    }

    const reply = {
      id: uuidv4(),
      ticket_id: id,
      sender_id: req.user.id,
      message,
      attachment_url: attachment_url || null,
    };

    await db('school_ticket_messages').insert(reply);

    const newStatus = ['teacher', 'admin', 'manager'].includes(req.user.role) ? 'resolved' : 'in_progress';
    await db('school_tickets')
      .where('id', id)
      .update({
        status: newStatus,
        updated_at: new Date().toISOString(),
      });

    res.status(201).json({ success: true, message: 'پاسخ با موفقیت ارسال شد', data: { reply } });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
