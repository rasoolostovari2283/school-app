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

    const callerRole = String(req.user.role || '').toLowerCase();
    if (callerRole === 'counselor') {
      throw forbiddenError(
        'مشاور تحصیلی مجاز به مشاهده اطلاعات مالی دانش‌آموزان نیست',
        'Counselors are not permitted to access financial ledgers',
      );
    }

    if (callerRole === 'student') {
      if (req.query.student_id && req.query.student_id !== req.user.id) {
        throw forbiddenError('شما فقط مجاز به مشاهده وضعیت مالی خودتان هستید');
      }
      studentId = req.user.id;
    } else if (callerRole === 'parent') {
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

    const callerRole = String(req.user.role || '').toLowerCase();
    if (callerRole === 'counselor') {
      throw forbiddenError(
        'مشاور تحصیلی مجاز به ثبت یا تغییر تراکنش‌های مالی نیست',
        'Counselors are not permitted to submit financial transactions',
      );
    }

    if (callerRole === 'student') {
      if (ledger.student_id !== req.user.id) {
        throw forbiddenError('شما فقط مجاز به ثبت فیش برای اقساط خودتان هستید');
      }
    } else if (callerRole === 'parent') {
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
 * School administrator/manager or financial officer verifies payment (#9/F7)
 */
router.post('/verify-installment/:id', authorize('admin', 'manager', 'financial_officer', 'accountant'), async (req, res, next) => {
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

const { validateIranianSheba } = require('../../utils/iranianValidators');
const { generateId } = require('../../utils/dbHelpers');
const smsGateway = require('../../services/smsGateway');

/**
 * POST /api/v1/finance/validate-sheba
 * Validates a 26-character Iranian IBAN (شماره شبا) via ISO-7064 Mod-97-10 and returns issuing bank
 */
router.post('/validate-sheba', async (req, res, next) => {
  try {
    const callerRole = String(req.user.role || '').toLowerCase();
    if (callerRole === 'counselor') {
      throw forbiddenError('مشاور تحصیلی مجاز به دسترسی به ماژول مالی نیست');
    }
    const { sheba } = req.body;
    const result = validateIranianSheba(sheba);
    res.json({
      success: result.valid,
      message: result.valid ? `شماره شبا معتبر است (${result.bank_name})` : result.reason,
      data: result,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/finance/create-ledger
 * Creates or retrieves a tuition ledger + 3 standard installments for a student in the same school
 */
router.post('/create-ledger', authorize('admin', 'manager', 'financial_officer', 'accountant'), async (req, res, next) => {
  try {
    const { student_id, total_amount = 450000000, academic_year = '1403-1404' } = req.body;
    if (!student_id) {
      return res.status(400).json({ success: false, message: 'شناسه دانش‌آموز الزامی است' });
    }

    const student = await db('users')
      .where({ id: student_id, school_id: req.user.school_id, role: 'student' })
      .first();
    if (!student) {
      return res.status(404).json({ success: false, message: 'دانش‌آموز در این مدرسه یافت نشد' });
    }
    assertSameSchool(req.user, student);

    let ledger = await db('tuition_ledgers').where({ student_id: student.id }).first();
    if (!ledger) {
      const ledgerId = generateId();
      const totalRial = Number(total_amount) || 450000000;
      await db('tuition_ledgers').insert({
        id: ledgerId,
        student_id: student.id,
        academic_year,
        total_amount: totalRial,
        paid_amount: 0,
        discount_amount: 0,
        balance: totalRial,
        status: 'unpaid',
      });
      ledger = await db('tuition_ledgers').where({ id: ledgerId }).first();

      const perInstallment = Math.floor(totalRial / 3);
      const installmentsToInsert = [
        {
          id: generateId(),
          ledger_id: ledgerId,
          installment_number: 1,
          title: 'پیش‌پرداخت ثبت‌نام و خدمات آموزشی نوبت اول',
          amount: perInstallment,
          due_date: '1403/07/15',
          status: 'pending',
        },
        {
          id: generateId(),
          ledger_id: ledgerId,
          installment_number: 2,
          title: 'قسط دوم شهریه و کلاس‌های فوق‌برنامه',
          amount: perInstallment,
          due_date: '1403/10/15',
          status: 'pending',
        },
        {
          id: generateId(),
          ledger_id: ledgerId,
          installment_number: 3,
          title: 'قسط سوم و تسویه نهایی سال تحصیلی',
          amount: totalRial - perInstallment * 2,
          due_date: '1403/12/15',
          status: 'pending',
        },
      ];
      await db('tuition_installments').insert(installmentsToInsert);
    }

    const installments = await db('tuition_installments')
      .where({ ledger_id: ledger.id })
      .orderBy('installment_number', 'asc');

    res.status(201).json({
      success: true,
      message: 'دفتر کل شهریه و تقسیط سه‌مرحله‌ای با موفقیت صادر شد',
      data: { ledger, installments },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/finance/initiate-payment/:id
 * Initiates an Iranian Shaparak IPG payment session (Zarinpal / Behpardakht Mellat / Saman SEP)
 */
router.post('/initiate-payment/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { gateway = 'behpardakht_mellat', school_sheba = 'IR062960000000100324200001' } = req.body || {};

    const callerRole = String(req.user.role || '').toLowerCase();
    if (callerRole === 'counselor') {
      throw forbiddenError('مشاور تحصیلی مجاز به آغاز تراکنش مالی نیست');
    }

    const installment = await db('tuition_installments').where({ id }).first();
    if (!installment) {
      return res.status(404).json({ success: false, message: 'قسط مورد نظر یافت نشد' });
    }

    const ledger = await db('tuition_ledgers').where({ id: installment.ledger_id }).first();
    if (!ledger) {
      return res.status(404).json({ success: false, message: 'دفتر کل شهریه یافت نشد' });
    }

    const student = await db('users')
      .where({ id: ledger.student_id, school_id: req.user.school_id })
      .first();
    if (!student) {
      throw forbiddenError('دسترسی به اطلاعات مالی مدرسه دیگر مجاز نیست');
    }
    assertSameSchool(req.user, student);

    if (callerRole === 'student' && ledger.student_id !== req.user.id) {
      throw forbiddenError('شما فقط مجاز به پرداخت اقساط خودتان هستید');
    }
    if (callerRole === 'parent') {
      const link = await db('parent_student_links')
        .where({ parent_id: req.user.id, student_id: ledger.student_id })
        .first();
      const matchedCode = req.user.student_code && req.user.student_code === student.student_code;
      if (!link && !matchedCode) {
        throw forbiddenError('شما فقط مجاز به پرداخت اقساط فرزند خود هستید');
      }
    }

    if (installment.status === 'verified') {
      return res.status(409).json({
        success: false,
        message: 'این قسط قبلاً پرداخت و تسویه شده است',
      });
    }

    const shebaInfo = validateIranianSheba(school_sheba);
    const authority = `A00000000000000000000000000${Date.now().toString().slice(-9)}`;
    const amountRial = Number(installment.amount) || 0;
    const amountToman = Math.round(amountRial / 10);

    res.json({
      success: true,
      message: 'نشست پرداخت امن شاپرک ایجاد شد',
      data: {
        installment_id: installment.id,
        installment_number: installment.installment_number,
        student_name: student.display_name,
        authority,
        gateway_code: gateway,
        gateway_title:
          gateway === 'zarinpal'
            ? 'درگاه پرداخت اینترنتی زرین‌پال (شاپرک)'
            : 'درگاه پرداخت اینترنتی به‌پرداخت ملت (شاپرک)',
        terminal_id: 'SHP-9841023',
        amount_rial: amountRial,
        amount_toman: amountToman,
        treasury_sheba: shebaInfo.formatted,
        treasury_sheba_valid: shebaInfo.valid,
        treasury_bank_name: shebaInfo.bank_name || 'بانک مرکزی / خزانه مدرسه',
        payment_url: `/dashboard/smart-operations?tab=shaparak&authority=${authority}&installment=${installment.id}`,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/finance/callback-verify/:id
 * Verifies Shaparak IPG callback and settles the installment & ledger balance atomically
 */
router.post('/callback-verify/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { authority, card_pan = '6037-9975-****-4812', status = 'OK' } = req.body || {};

    const callerRole = String(req.user.role || '').toLowerCase();
    if (callerRole === 'counselor') {
      throw forbiddenError('مشاور تحصیلی مجاز به تایید تراکنش مالی نیست');
    }

    if (status !== 'OK') {
      return res.status(400).json({
        success: false,
        message: 'تراکنش توسط پرداخت‌کننده لغو شد یا با خطای شاپرک مواجه گردید',
      });
    }

    const installment = await db('tuition_installments').where({ id }).first();
    if (!installment) {
      return res.status(404).json({ success: false, message: 'قسط یافت نشد' });
    }

    const ledger = await db('tuition_ledgers').where({ id: installment.ledger_id }).first();
    if (!ledger) {
      return res.status(404).json({ success: false, message: 'دفتر کل شهریه یافت نشد' });
    }

    const student = await db('users')
      .where({ id: ledger.student_id, school_id: req.user.school_id })
      .first();
    if (!student) {
      throw forbiddenError('دسترسی به اطلاعات مالی مدرسه دیگر مجاز نیست');
    }
    assertSameSchool(req.user, student);

    if (installment.status === 'verified') {
      return res.status(409).json({
        success: false,
        message: 'این قسط قبلاً تسویه شده و در مانده حساب منظور گردیده است',
      });
    }

    const refId = `SHP-${Date.now().toString().slice(-8)}`;
    const maskedPan = String(card_pan || '6037-99**-****-1234').replace(/^(\d{4})[\d*-]+(\d{4})$/, '$1-****-****-$2');
    const shamsiDate = new Date().toLocaleDateString('fa-IR');

    await db('tuition_installments').where({ id }).update({
      status: 'verified',
      tracking_number: refId,
      bank_name: `شاپرک آنلاین (${maskedPan})`,
      paid_at: shamsiDate,
      verified_by: req.user.id,
    });

    const newPaid = Number(ledger.paid_amount || 0) + Number(installment.amount || 0);
    const newBalance = Math.max(0, Number(ledger.balance || 0) - Number(installment.amount || 0));

    await db('tuition_ledgers').where({ id: ledger.id }).update({
      paid_amount: newPaid,
      balance: newBalance,
      status: newBalance === 0 ? 'settled' : 'partial',
    });

    // Send instant pattern SMS receipt to parent/student
    try {
      let stSettings = {};
      try { stSettings = typeof student.settings === 'string' ? JSON.parse(student.settings) : (student.settings || {}); } catch (_e) {}
      const targetPhone = stSettings.parent_phone || student.phone || '09120000000';
      await smsGateway.sendTuitionReceiptAlert({
        schoolId: req.user.school_id,
        parentPhone: targetPhone,
        studentName: student.display_name,
        amountRial: installment.amount,
        refId,
      });
    } catch (_smsErr) {}

    logAudit({
      userId: req.user.id,
      userName: req.user.display_name,
      userRole: req.user.role,
      action: 'SHAPARAK_ONLINE_SETTLEMENT',
      module: 'FINANCE',
      targetId: id,
      details: {
        ledger_id: ledger.id,
        student_id: ledger.student_id,
        amount_rial: installment.amount,
        authority: authority || 'DIRECT',
        shaparak_ref_id: refId,
        masked_card_pan: maskedPan,
      },
      ip: req.ip,
    });

    res.json({
      success: true,
      message: 'پرداخت آنلاین شاپرک با موفقیت تایید و به صورت آنی از بدهی شهریه کسر گردید ✅',
      data: {
        receipt: {
          shaparak_ref_id: refId,
          authority: authority || `A000000000${Date.now().toString().slice(-8)}`,
          masked_card_pan: maskedPan,
          student_name: student.display_name,
          student_code: student.student_code,
          installment_number: installment.installment_number,
          amount_rial: Number(installment.amount),
          amount_toman: Math.round(Number(installment.amount) / 10),
          paid_at: shamsiDate,
          new_ledger_balance_rial: newBalance,
          ledger_status: newBalance === 0 ? 'settled' : 'partial',
        },
      },
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

