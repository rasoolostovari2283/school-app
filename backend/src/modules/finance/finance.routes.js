const express = require('express');
const router = express.Router();
const db = require('../../config/database');
const { authenticate } = require('../../middleware/auth');
const { v4: uuidv4 } = require('uuid');

router.use(authenticate);

/**
 * GET /api/v1/finance/ledger
 * Returns tuition summary and list of installments for student or parent's child
 */
router.get('/ledger', async (req, res, next) => {
  try {
    let studentId = req.query.student_id || req.user.id;

    if (req.user.role === 'parent') {
      const firstChild = await db('parent_student_links')
        .where('parent_id', req.user.id)
        .first();
      if (firstChild) studentId = firstChild.student_id;
    }

    let ledger = await db('tuition_ledgers')
      .where('student_id', studentId)
      .first();

    // If no ledger exists, create a default one for this student
    if (!ledger) {
      const defaultTotal = 25000000; // 25 million Tomans
      ledger = {
        id: uuidv4(),
        student_id: studentId,
        academic_year: '۱۴۰۳-۱۴۰۴',
        total_amount: defaultTotal,
        discount_amount: 3000000,
        discount_reason: 'تخفیف رتبه برتر و دانش‌آموزان ممتاز',
        paid_amount: 11000000,
        balance: defaultTotal - 3000000 - 11000000,
        status: 'partial',
      };
      await db('tuition_ledgers').insert(ledger);

      // Create installments
      const installments = [
        {
          id: uuidv4(),
          ledger_id: ledger.id,
          installment_number: 1,
          title: 'پیش‌پرداخت ثبت‌نام و شهریه ثابت',
          amount: 6000000,
          due_date: '۱۴۰۳/۰۶/۲۵',
          status: 'verified',
          paid_at: '۱۴۰۳/۰۶/۲۰',
          tracking_number: 'TRX-948102',
          bank_name: 'بانک ملی ایران',
        },
        {
          id: uuidv4(),
          ledger_id: ledger.id,
          installment_number: 2,
          title: 'قسط اول (مهرماه - کلاس‌های المپیاد)',
          amount: 5000000,
          due_date: '۱۴۰۳/۰۷/۳۰',
          status: 'verified',
          paid_at: '۱۴۰۳/۰۷/۲۸',
          tracking_number: 'TRX-953841',
          bank_name: 'بانک ملت',
        },
        {
          id: uuidv4(),
          ledger_id: ledger.id,
          installment_number: 3,
          title: 'قسط دوم (آذرماه - کارگاه‌های علمی)',
          amount: 5500000,
          due_date: '۱۴۰۳/۰۹/۳۰',
          status: 'pending',
          paid_at: null,
          tracking_number: null,
          bank_name: null,
        },
        {
          id: uuidv4(),
          ledger_id: ledger.id,
          installment_number: 4,
          title: 'قسط سوم و تسویه‌حساب نهایی (بهمن‌ماه)',
          amount: 5500000,
          due_date: '۱۴۰۳/۱۱/۳۰',
          status: 'pending',
          paid_at: null,
          tracking_number: null,
          bank_name: null,
        },
      ];
      await db('tuition_installments').insert(installments);
    }

    const installments = await db('tuition_installments')
      .where('ledger_id', ledger.id)
      .orderBy('installment_number', 'asc');

    const student = await db('users').where('id', studentId).first();

    res.json({
      success: true,
      data: {
        student: {
          id: student.id,
          display_name: student.display_name,
          student_code: student.student_code || 'STD-140301',
        },
        ledger,
        installments,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/finance/pay-installment/:id
 * Submit payment receipt & tracking number for an installment
 */
router.post('/pay-installment/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { tracking_number, bank_name, receipt_url } = req.body;

    const installment = await db('tuition_installments').where('id', id).first();
    if (!installment) {
      return res.status(404).json({ success: false, message: 'قسط مورد نظر یافت نشد' });
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
 * Accountant/Teacher verifies payment
 */
router.post('/verify-installment/:id', async (req, res, next) => {
  try {
    if (req.user.role !== 'teacher') {
      return res.status(403).json({ success: false, message: 'فقط واحد حسابداری یا مدیریت مجاز به تایید فیش هستند' });
    }

    const { id } = req.params;
    const installment = await db('tuition_installments').where('id', id).first();
    if (!installment) return res.status(404).json({ success: false, message: 'قسط یافت نشد' });

    await db('tuition_installments').where('id', id).update({
      status: 'verified',
      verified_by: req.user.id,
    });

    // Update ledger paid amount & balance
    const ledger = await db('tuition_ledgers').where('id', installment.ledger_id).first();
    if (ledger) {
      const newPaid = ledger.paid_amount + installment.amount;
      const newBalance = Math.max(0, ledger.balance - installment.amount);
      await db('tuition_ledgers').where('id', ledger.id).update({
        paid_amount: newPaid,
        balance: newBalance,
        status: newBalance === 0 ? 'settled' : 'partial',
      });
    }

    res.json({ success: true, message: 'فیش واریزی تایید شد و مانده حساب به‌روزرسانی گردید.' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
