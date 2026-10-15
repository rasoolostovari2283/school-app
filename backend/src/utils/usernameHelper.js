/**
 * Helper to generate smart, memorable usernames / IDs based on Persian Full Names
 * e.g., 'علی کیانی' -> 'ali_kiani'
 */

const nameDictionary = {
  'علی': 'ali', 'محمد': 'mohammad', 'رضا': 'reza', 'امیر': 'amir', 'حسین': 'hossein',
  'امیرحسین': 'amirhossein', 'علیرضا': 'alireza', 'محمدرضا': 'mohammadreza',
  'مهدی': 'mehdi', 'حسن': 'hassan', 'احمد': 'ahmad', 'پارسا': 'parsa', 'کیان': 'kian',
  'سارا': 'sara', 'فاطمه': 'fatemeh', 'زهرا': 'zahra', 'مریم': 'maryam', 'مسعود': 'masoud',
  'نیما': 'nima', 'سینا': 'sina', 'آرش': 'arash', 'پوریا': 'pouria', 'امید': 'omid',
  'نوید': 'navid', 'پرهام': 'parham', 'سامان': 'saman', 'بهرام': 'bahram', 'کوروش': 'kourosh',
  'داریوش': 'dariush', 'فرزاد': 'farzad', 'فرهاد': 'farhad', 'شاهین': 'shahin', 'مانی': 'mani',
  'حسینی': 'hosseini', 'احمدی': 'ahmadi', 'کیانی': 'kiani', 'سعیدی': 'saeedi', 'صادقی': 'sadeghi',
  'تقوی': 'taghavi', 'میرزایی': 'mirzaei', 'اکبری': 'akbari', 'جلالی': 'jalali', 'رحمانی': 'rahmani',
  'کریمی': 'karimi', 'رضایی': 'rezaei', 'محمدی': 'mohammadi', 'موسوی': 'mousavi', 'نوری': 'nouri',
  'سهرابی': 'sohrabi', 'طاهری': 'taheri', 'کاظمی': 'kazemi', 'حیدری': 'heidari', 'جعفری': 'jafari',
  'مرادی': 'moradi', 'باقری': 'bagheri', 'ابراهیمی': 'ebrahimi', 'صالحی': 'salehi', 'نجفی': 'najafi'
};

const charMap = {
  'ا': 'a', 'آ': 'a', 'ب': 'b', 'پ': 'p', 'ت': 't', 'ث': 's', 'ج': 'j', 'چ': 'ch',
  'ح': 'h', 'خ': 'kh', 'د': 'd', 'ذ': 'z', 'ر': 'r', 'ز': 'z', 'ژ': 'zh', 'س': 's',
  'ش': 'sh', 'ص': 's', 'ض': 'z', 'ط': 't', 'ظ': 'z', 'ع': 'a', 'غ': 'gh', 'ف': 'f',
  'ق': 'gh', 'ک': 'k', 'گ': 'g', 'ل': 'l', 'م': 'm', 'ن': 'n', 'و': 'v', 'ه': 'h',
  'ی': 'i', 'ئ': 'y', 'ي': 'i', 'ك': 'k', 'ة': 'h'
};

function transliterateWord(word) {
  const cleanWord = word.trim().replace(/[ًٌٍَُِّْ]/g, ''); // Remove vowels/tanwin
  if (nameDictionary[cleanWord]) return nameDictionary[cleanWord];
  
  let res = '';
  for (let i = 0; i < cleanWord.length; i++) {
    const c = cleanWord[i];
    if (charMap[c] !== undefined) res += charMap[c];
    else if (/[a-z0-9]/i.test(c)) res += c.toLowerCase();
  }
  return res;
}

function generateBaseUsername(displayName) {
  if (!displayName || typeof displayName !== 'string') return 'user';
  
  let cleaned = displayName
    .replace(/(دکتر|مهندس|استاد|سرکار|خانم|آقای|سید|سیده)\s*/gi, '')
    .trim();

  // If user already typed english name or username
  if (/^[a-zA-Z0-9_\-\.]+$/.test(cleaned)) {
    return cleaned.toLowerCase().replace(/[^a-z0-9_]/g, '_');
  }

  const words = cleaned.split(/\s+/).filter(Boolean);
  const latinWords = words.map(transliterateWord).filter(Boolean);
  let base = latinWords.join('_').toLowerCase();
  base = base.replace(/[^a-z0-9_]/g, '').replace(/^_+|_+$/g, '');
  return base || 'user';
}

/**
 * Generate a guaranteed unique username in the users table
 */
async function generateUniqueUsername(db, displayName, excludeUserId = null) {
  const base = generateBaseUsername(displayName);
  let candidate = base;
  let counter = 1;

  while (true) {
    let query = db('users').where({ username: candidate });
    if (excludeUserId) {
      query = query.andWhere('id', '!=', excludeUserId);
    }
    const exists = await query.first();
    if (!exists) {
      return candidate;
    }
    counter++;
    candidate = `${base}_${counter}`;
  }
}

module.exports = {
  generateBaseUsername,
  generateUniqueUsername,
};
