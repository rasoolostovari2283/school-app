const { deepNormalizePayload } = require('../utils/iranianValidators');

/**
 * Global Express Middleware:
 * Automatically normalizes Persian/Arabic numerals (۰-۹, ٠-٩ -> 0-9) and
 * Arabic Yeh/Kaf (ي/ك -> ی/ک) in incoming request bodies and query parameters.
 */
function persianNormalizer(req, _res, next) {
  try {
    if (req.body && typeof req.body === 'object') {
      req.body = deepNormalizePayload(req.body);
    }
    if (req.query && typeof req.query === 'object') {
      const normalizedQuery = deepNormalizePayload(req.query);
      for (const [k, v] of Object.entries(normalizedQuery)) {
        req.query[k] = v;
      }
    }
  } catch (_err) {
    // Never block request pipeline if normalization encounters an exotic object
  }
  next();
}

module.exports = { persianNormalizer };
