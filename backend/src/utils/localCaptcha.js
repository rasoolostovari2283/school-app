/**
 * ═══════════════════════════════════════════════════════════════════════════
 * EduConnect — Zero-Dependency Domestic SVG Captcha Generator
 * 100% Offline-Safe for Iran National Intranet (بدون نیاز به اینترنت بین‌الملل)
 * ═══════════════════════════════════════════════════════════════════════════
 */

class LocalCaptcha {
  /**
   * Generates a simple math challenge or alphanumeric code in SVG format
   * @returns {{ id: string, text: string, svg: string }}
   */
  generate() {
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

    const id = Math.random().toString(36).substring(2, 10);

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
      text: solution,
      svg: `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`,
    };
  }
}

module.exports = new LocalCaptcha();
