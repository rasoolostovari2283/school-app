const express = require('express');
const router = express.Router();
const db = require('../../config/database');
const {
  authenticate,
  authorize,
  assertSameSchool,
  assertTeacherOfStudent,
  forbiddenError,
} = require('../../middleware/auth');
const { logAudit } = require('../../utils/auditLogger');

router.use(authenticate);

/**
 * GET /api/v1/finance/ledger
 * Returns tuition summary and list of installments without side effects on read (#8/F2, #10/F12)
 */
router.get('/ledger', async (req, res, next) => {
  try {
    let studentId = req.user.id;

    if (req.user.role === 'student') {
      if (req.query.student_id && req.query.student_id !== req.user.id) {
        throw forbiddenError('شما فقط مجاز به مشاهده وضعیت مالی خودتان هستید');
      }
      studentId = req.user.id;
    } else if (req.user.role === 'parent') {
      const childIds = await db('parent_student_links')
        .where('parent_id', req.user.id)
        .pluck('student_id');
      if (req.user.student_code) {
        const byCode = await db('users')
          .where({ student_code: req.user.student_code, role: 'student', school_id: req.user.school_id })
          .first();
        if (byCode && !childIds.includes(byCode.id)) {
          childIds.push(byCode.id);
        }
      }
      const requestedId = req.query.student_id || childIds[0];
      if (!requestedId || !childIds.includes(requestedId)) {
        throw forbiddenError('شما فقط مجاز به مشاهده وضعیت مالی فرزند خود هستید');
      }
      studentId = requestedId;
    } else if (req.query.student_id && req.query.student_id !== req.user.id) {
      const targetStudent = await assertTeacherOfStudent(req.user, req.query.student_id);
      assertSameSchool(req.user, targetStudent);
      studentId = targetStudent.id;
    }

    const student = await db('users').where('id', studentId).first();
    if (!student) {
      return res.status(404).json({ success: false, message: 'دانش‌آموز یافت نشد' });
    }
    assertSameSchool(req.user, student);

    const ledger = await db('tuition_ledgers')
      .where('student_id', studentId)
      .first();

    const installments = ledger
      ? await db('tuition_installments')
          .where('ledger_id', ledger.id)
          .orderBy('installment_number', 'asc')
      : [];

    res.json({
      success: true,
      data: {
        student: {
          id: student.id,
          display_name: student.display_name,
          student_code: student.student_code || 'STD-140301',
        },
        ledger: ledger || null,
        installments,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/finance/pay-installment/:id
 * Submit payment receipt & tracking number for an installment (#8/F2)
 */
router.post('/pay-installment/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { tracking_number, bank_name, receipt_url } = req.body;

    const installment = await db('tuition_installments').where('id', id).first();
    if (!installment) {
      return res.status(404).json({ success: false, message: 'قسط مورد نظر یافت نشد' });
    }

    const ledger = await db('tuition_ledgers').where('id', installment.ledger_id).first();
    if (!ledger) {
      return res.status(404).json({ success: false, message: 'دفتر کل شهریه یافت نشد' });
    }

    const student = await db('users').where('id', ledger.student_id).first();
    assertSameSchool(req.user, student);

    if (req.user.role === 'student') {
      if (ledger.student_id !== req.user.id) {
        throw forbiddenError('شما فقط مجاز به ثبت فیش برای اقساط خودتان هستید');
      }
    } else if (req.user.role === 'parent') {
      const link = await db('parent_student_links')
        .where({ parent_id: req.user.id, student_id: ledger.student_id })
        .first();
      const matchedCode = req.user.student_code && student && req.user.student_code === student.student_code;
      if (!link && !matchedCode) {
        throw forbiddenError('شما فقط مجاز به ثبت فیش برای فرزند خود هستید');
      }
    } else {
      await assertTeacherOfStudent(req.user, ledger.student_id);
    }

    await db('tuition_installments')
      .where('id', id)
      .update({
        status: 'submitted',
        tracking_number: tracking_number || 'TRX-' + Date.now().toString().slice(-6),
        bank_name: bank_name || 'درگاه شتاب / فیش بانکی',
        receipt_url: receipt_url || null,
        paid_at: new Date().toLocaleDateString('fa-IR'),
      });

    res.json({
      success: true,
      message: 'فیش واریزی با موفقیت ثبت شد و در صف تایید حسابداری قرار گرفت! ✅',
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/finance/verify-installment/:id
 * School administrator/manager verifies payment (#9/F7)
 */
router.post('/verify-installment/:id', authorize('admin', 'manager'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const installment = await db('tuition_installments').where('id', id).first();
    if (!installment) {
      return res.status(404).json({ success: false, message: 'قسط یافت نشد' });
    }

    const ledger = await db('tuition_ledgers').where('id', installment.ledger_id).first();
    if (!ledger) {
      return res.status(404).json({ success: false, message: 'دفتر کل شهریه یافت نشد' });
    }

    const student = await db('users').where('id', ledger.student_id).first();
    assertSameSchool(req.user, student);

    if (installment.status === 'verified') {
      return res.status(409).json({
        success: false,
        message: 'این قسط قبلاً تایید و در مانده حساب اعمال شده است',
      });
    }

    await db('tuition_installments').where('id', id).update({
      status: 'verified',
      verified_by: req.user.id,
    });

    const newPaid = ledger.paid_amount + installment.amount;
    const newBalance = Math.max(0, ledger.balance - installment.amount);
    await db('tuition_ledgers').where('id', ledger.id).update({
      paid_amount: newPaid,
      balance: newBalance,
      status: newBalance === 0 ? 'settled' : 'partial',
    });

    logAudit({
      userId: req.user.id,
      userName: req.user.display_name,
      userRole: req.user.role,
      action: 'VERIFY_INSTALLMENT',
      module: 'FINANCE',
      targetId: id,
      details: { ledger_id: ledger.id, student_id: ledger.student_id, amount: installment.amount },
      ip: req.ip,
    });

    res.json({ success: true, message: 'فیش واریزی تایید شد و مانده حساب به‌روزرسانی گردید.' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
