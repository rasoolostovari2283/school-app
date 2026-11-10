const express = require('express');
const router = express.Router();
const aiService = require('./ai.service');
const paperToDigitalService = require('./paperToDigital.service');
const { authenticate, authorize } = require('../../middleware/auth');

router.use(authenticate);

router.post('/generate', async (req, res, next) => {
  try {
    const { type, topic, count } = req.body;
    const result = await aiService.generateContent({ type, topic, count });
    res.json({
      success: true,
      data: result,
      source: result.mode === 'domestic_engine' ? 'شبکه ملی اطلاعات (موتور محلی)' : 'هوش ابری',
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/ai/paper-to-digital
 * Extracts structured Roster, Grade Sheet, or Exam Questions from scanned paper image or OCR text
 * along with an honest engineering feasibility & confidence report.
 */
router.post('/paper-to-digital', authorize('admin', 'manager', 'teacher', 'counselor'), async (req, res, next) => {
  try {
    const result = await paperToDigitalService.extractFromPaper(req.body || {});
    res.json({
      success: true,
      message: `${result.items.length} مورد از سند کاغذی استخراج شد (${result.feasibility_assessment.flagged_for_human_review} مورد نیازمند بازبینی انسانی پیش از ثبت نهایی)`,
      data: result,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/ai/paper-to-digital/commit
 * Commits human-verified extracted paper items into the database (Roster -> Sida Import, Grade Sheet -> Gradebook, Exam -> Quiz)
 */
router.post('/paper-to-digital/commit', authorize('admin', 'manager', 'teacher'), async (req, res, next) => {
  try {
    const result = await paperToDigitalService.commitExtractedData(req.user, req.body || {});
    res.status(201).json({
      success: true,
      message: `اطلاعات بازبینی‌شده سند کاغذی با موفقیت در دیتابیس ثبت گردید (${result.committed_count} رکورد).`,
      data: result,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
