/**
 * ═══════════════════════════════════════════════════════════════════════════
 * EduConnect — Zero-Dependency Domestic SVG Captcha Generator
 * 100% Offline-Safe for Iran National Intranet (بدون نیاز به اینترنت بین‌الملل)
 * ═══════════════════════════════════════════════════════════════════════════
 */

const crypto = require('crypto');

const CAPTCHA_TTL_MS = 5 * 60 * 1000;
const MAX_CHALLENGES = 5000;
const challenges = new Map();

function pruneExpired() {
  const now = Date.now();
  for (const [key, entry] of challenges.entries()) {
    if (entry.expiresAt <= now) {
      challenges.delete(key);
    }
  }
}

function enforceCapacityCap(maxCap = MAX_CHALLENGES) {
  while (challenges.size >= maxCap) {
    const oldestKey = challenges.keys().next().value;
    if (oldestKey === undefined) break;
    challenges.delete(oldestKey);
  }
}

class LocalCaptcha {
  constructor() {
    this.MAX_CHALLENGES = MAX_CHALLENGES;
  }

  size() {
    return challenges.size;
  }

  /**
   * Generates a simple math challenge in SVG format and stores the answer server-side
   * @returns {{ id: string, svg: string }}
   */
  generate() {
    pruneExpired();
    enforceCapacityCap( this.MAX_CHALLENGES );
    const num1 = Math.floor(Math.random() * 20) + 1;
    const num2 = Math.floor(Math.random() * 10) + 1;
    const operators = ['+', '-'];
    const op = operators[Math.floor(Math.random() * operators.length)];

    let solution;
    let label;

    if (op === '+') {
      solution = String(num1 + num2);
      label = `${num1} + ${num2} = ?`;
    } else {
      const max = Math.max(num1, num2);
      const min = Math.min(num1, num2);
      solution = String(max - min);
      label = `${max} - ${min} = ?`;
    }

    const id = crypto.randomBytes(8).toString('hex');
    challenges.set(id, {
      solution,
      expiresAt: Date.now() + CAPTCHA_TTL_MS,
    });

    // Generate lightweight SVG
    const width = 140;
    const height = 44;
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
        <rect width="100%" height="100%" fill="#1a1d2e" rx="8"/>
        <!-- Background noise lines -->
        <path d="M 10 20 Q 50 5 90 25 T 130 15" stroke="rgba(99,102,241,0.3)" fill="none" stroke-width="2"/>
        <path d="M 5 35 Q 40 40 80 20 T 135 30" stroke="rgba(6,182,212,0.25)" fill="none" stroke-width="1.5"/>
        <!-- Text -->
        <text x="50%" y="60%" text-anchor="middle" font-family="Vazirmatn, Arial, sans-serif" font-size="20" font-weight="bold" fill="#f8fafc" letter-spacing="2">
          ${label}
        </text>
      </svg>
    `.trim();

    return {
      id,
      svg: `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`,
    };
  }

  /**
   * Single-use server-side verification of a captcha challenge
   * @param {string} id
   * @param {string|number} answer
   * @returns {boolean}
   */
  verify(id, answer) {
    pruneExpired();
    if (!id || answer === undefined || answer === null) return false;
    const entry = challenges.get(String(id));
    if (!entry) return false;
    challenges.delete(String(id));
    if (entry.expiresAt <= Date.now()) return false;
    return entry.solution === String(answer).trim();
  }
}

module.exports = new LocalCaptcha();
