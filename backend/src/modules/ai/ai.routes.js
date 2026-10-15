const express = require('express');
const router = express.Router();
const aiService = require('./ai.service');
const { authenticate } = require('../../middleware/auth');

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

module.exports = router;
