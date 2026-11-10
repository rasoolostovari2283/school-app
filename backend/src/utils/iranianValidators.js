/**
 * ═══════════════════════════════════════════════════════════════════════════
 * EduConnect — Iranian National Standards, Banking & Persian Normalization
 * Implements:
 *   1. Persian/Arabic Digit & Character Normalization (۰-۹, ٠-٩ -> 0-9, ي/ك -> ی/ک)
 *   2. Iranian 10-Digit National Code (کد ملی) Official Modulo-11 Checksum
 *   3. Iranian Banking Sheba / IBAN (شماره شبا) ISO-7064 Mod-97-10 Validator + Bank Resolver
 *   4. Iranian Mobile Phone Normalizer (+98 / 0098 / 9 -> 09xxxxxxxxx)
 * ═══════════════════════════════════════════════════════════════════════════
 */

const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';

const IRANIAN_BANK_CODES = {
  '010': 'بانک مرکزی جمهوری اسلامی ایران',
  '011': 'بانک صنعت و معدن',
  '012': 'بانک ملت',
  '013': 'بانک رفاه کارگران',
  '014': 'بانک مسکن',
  '015': 'بانک سپه',
  '016': 'بانک کشاورزی',
  '017': 'بانک ملی ایران',
  '018': 'بانک تجارت',
  '019': 'بانک صادرات ایران',
  '020': 'بانک توسعه صادرات',
  '021': 'پست بانک ایران',
  '022': 'بانک توسعه تعاون',
  '054': 'بانک پارسیان',
  '055': 'بانک اقتصاد نوین',
  '056': 'بانک سامان',
  '057': 'بانک پاسارگاد',
  '058': 'بانک سرمایه',
  '059': 'بانک سینا',
  '060': 'بانک قرض‌الحسنه مهر ایران',
  '061': 'بانک شهر',
  '062': 'بانک آینده',
  '064': 'بانک گردشگری',
  '066': 'بانک دی',
  '069': 'بانک ایران زمین',
  '070': 'بانک قرض‌الحسنه رسالت',
  '078': 'بانک خاورمیانه',
};

function normalizePersianDigits(input) {
  if (input === null || input === undefined) return input;
  const str = String(input);
  let out = '';
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    const pIdx = PERSIAN_DIGITS.indexOf(ch);
    if (pIdx !== -1) {
      out += String(pIdx);
      continue;
    }
    const aIdx = ARABIC_DIGITS.indexOf(ch);
    if (aIdx !== -1) {
      out += String(aIdx);
      continue;
    }
    out += ch;
  }
  return out;
}

function normalizePersianChars(input) {
  if (input === null || input === undefined) return input;
  return String(input)
    .replace(/[\u064A\u0649\u06CC]/g, 'ی') // Arabic Yeh / Alef Maksura -> Persian Yeh
    .replace(/[\u0643\u06A9]/g, 'ک')       // Arabic Kaf -> Persian Kaf
    .replace(/\u0629/g, 'ه')               // Teh Marbuta -> Heh
    .replace(/[\u200B-\u200D\uFEFF]/g, (m) => (m === '\u200C' ? '\u200C' : ''));
}

function normalizePersianText(input) {
  if (typeof input !== 'string') return input;
  return normalizePersianChars(normalizePersianDigits(input));
}

function deepNormalizePayload(value, keyName = '', depth = 0) {
  if (depth > 8 || value === null || value === undefined) return value;

  // Do not mutate base64 image payloads or raw cryptographic signatures
  if (
    typeof keyName === 'string' &&
    (keyName.includes('base64') || keyName.includes('image_data') || keyName === 'receipt_url' || keyName === 'avatar_url')
  ) {
    return value;
  }

  if (typeof value === 'string') {
    if (value.startsWith('data:image/') || value.length > 50000) {
      return value;
    }
    return normalizePersianText(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => deepNormalizePayload(item, keyName, depth + 1));
  }

  if (typeof value === 'object') {
    const normalized = {};
    for (const [k, v] of Object.entries(value)) {
      normalized[k] = deepNormalizePayload(v, k, depth + 1);
    }
    return normalized;
  }

  return value;
}

/**
 * Validates Iranian 10-digit National Code (کد ملی) using Modulo-11 algorithm.
 * Returns { valid: boolean, formatted: string, reason?: string }
 */
function validateIranianNationalCode(rawCode) {
  if (rawCode === null || rawCode === undefined || rawCode === '') {
    return { valid: false, formatted: '', reason: 'کد ملی وارد نشده است' };
  }

  let cleaned = normalizePersianDigits(String(rawCode)).replace(/[\s\-_]/g, '');
  if (!/^\d+$/.test(cleaned)) {
    return { valid: false, formatted: cleaned, reason: 'کد ملی فقط باید شامل ارقام باشد' };
  }

  // Left-pad 8 or 9 digit national codes with leading zeros (common when Excel strips leading 00)
  if (cleaned.length >= 8 && cleaned.length < 10) {
    cleaned = cleaned.padStart(10, '0');
  }

  if (cleaned.length !== 10) {
    return { valid: false, formatted: cleaned, reason: 'کد ملی باید دقیقاً ۱۰ رقم باشد' };
  }

  // Reject identical repeated digits (e.g., 0000000000, 1111111111)
  if (/^(\d)\1{9}$/.test(cleaned)) {
    return { valid: false, formatted: cleaned, reason: 'کد ملی با ارقام تکراری نامعتبر است' };
  }

  const check = parseInt(cleaned[9], 10);
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += parseInt(cleaned[i], 10) * (10 - i);
  }
  const remainder = sum % 11;
  const isValid = (remainder < 2 && check === remainder) || (remainder >= 2 && check === 11 - remainder);

  if (!isValid) {
    return {
      valid: false,
      formatted: cleaned,
      reason: 'رقم کنترل کد ملی طبق الگوریتم ثبت احوال معتبر نیست',
    };
  }

  return { valid: true, formatted: cleaned };
}

/**
 * Normalizes and validates Iranian mobile numbers to 09xxxxxxxxx
 */
function normalizeIranianMobile(rawPhone) {
  if (!rawPhone) return { valid: false, formatted: '' };
  let cleaned = normalizePersianDigits(String(rawPhone)).replace(/[\s\-().]/g, '');
  if (cleaned.startsWith('+98')) cleaned = '0' + cleaned.slice(3);
  else if (cleaned.startsWith('0098')) cleaned = '0' + cleaned.slice(4);
  else if (cleaned.startsWith('98') && cleaned.length === 12) cleaned = '0' + cleaned.slice(2);
  else if (cleaned.startsWith('9') && cleaned.length === 10) cleaned = '0' + cleaned;

  const valid = /^09\d{9}$/.test(cleaned);
  return {
    valid,
    formatted: cleaned,
    reason: valid ? undefined : 'شماره موبایل باید ۱۱ رقم و با ۰۹ شروع شود',
  };
}

/**
 * Validates Iranian 26-character IBAN / Sheba (IR + 24 digits) via ISO-7064 Mod-97-10
 */
function validateIranianSheba(rawSheba) {
  if (!rawSheba) {
    return { valid: false, formatted: '', reason: 'شماره شبا وارد نشده است' };
  }
  let cleaned = normalizePersianDigits(String(rawSheba))
    .replace(/[\s\-_]/g, '')
    .toUpperCase();

  if (/^\d{24}$/.test(cleaned)) {
    cleaned = 'IR' + cleaned;
  }

  if (!/^IR\d{24}$/.test(cleaned)) {
    return {
      valid: false,
      formatted: cleaned,
      reason: 'شماره شبا باید با IR شروع شود و شامل ۲۴ رقم باشد (مجموعاً ۲۶ کاراکتر)',
    };
  }

  // Move 'IR' (1827) and 2 check digits to the end, then compute Mod 97
  const rearranged = cleaned.slice(4) + '1827' + cleaned.slice(2, 4);
  let remainder = 0n;
  try {
    remainder = BigInt(rearranged) % 97n;
  } catch (_e) {
    return { valid: false, formatted: cleaned, reason: 'ساختار عددی شبا نامعتبر است' };
  }

  if (remainder !== 1n) {
    return {
      valid: false,
      formatted: cleaned,
      reason: 'رقم کنترل شماره شبا طبق استاندارد بانک مرکزی (ISO-7064) معتبر نیست',
    };
  }

  const bankCode = cleaned.slice(4, 7);
  const bankName = IRANIAN_BANK_CODES[bankCode] || 'بانک عضو شبکه شتاب';

  return {
    valid: true,
    formatted: cleaned,
    bank_code: bankCode,
    bank_name: bankName,
  };
}

module.exports = {
  normalizePersianDigits,
  normalizePersianChars,
  normalizePersianText,
  deepNormalizePayload,
  validateIranianNationalCode,
  normalizeIranianMobile,
  validateIranianSheba,
};
