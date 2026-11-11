# گزارش جامع بازبینی مستقل، راستی‌آزمایی و اصلاح کنترل‌شده پروژه EduConnect (مأموریت Argon 4)

- **تاریخ گزارش:** ۱۱ نوامبر ۲۰۲۶ (`2026-11-11`)
- **بازبین و مجری اصلاحات:** Argon 4 — ممیزی مستقل، راستی‌آزمایی شواهد کد و اصلاح جراحی کنترل‌شده
- **مخزن هدف:** `rasoolostovari2283/school-app`
- **شاخه مستندات مرجع:** `docs/educonnect-security-audit-2026-11-11` (همگام‌سازی‌شده از کامیت `51b735f`)
- **دامنه بررسی:** مطالعه کامل تمام **۵۱ فایل Markdown** موجود در پوشه `audit/` (`audit/2026-11-10/`، `audit/2026-11-11/` و `audit/2026-11-11/full-independent-audit/`)، تطبیق تک‌تک ادعاها با کد واقعی بک‌اند و فرانت‌اند، اعمال اصلاحات امن و کم‌ریسک، اجرای کامل مجموعه آزمون‌ها (`149/149 PASS`) و اسکنر ایزولاسیون کوئری‌ها.

---

## 1. خلاصه اجرایی

در این چرخه ممیزی و اصلاح مستقل (Argon 4)، تمامی **۵۱ سند ممیزی** موجود در پوشه `audit/` به‌صورت خط‌به‌خط مطالعه و با وضعیت واقعی کد در مسیرهای `backend/`، `frontend/` و اسکریپت‌های زیرساختی مقایسه شدند.

### دستاوردهای کلیدی این چرخه:
1. **تطبیق شواهد و تفکیک دقیق وضعیت یافته‌ها:**
   - مشخص شد که بخش مهمی از یافته‌های اولیه تاریخ ۱۰ نوامبر ۲۰۲۶ (`F1` تا `F12` و `A1` تا `A27` در زمینه ایزولاسیون چندمدرسه‌ای، حذف DDLهای زمان اجرا، کپچای یک‌بارمصرف، چرخش Refresh Token و تفکیک نقش مشاور و امور مالی) در کامیت‌های قبلی (`a22f3c4` تا `da12977`) اصلاح و دارای تست رگرسیون شده بودند.
   - در عین حال، **۲۸ یافته بحرانی، بالا و متوسط** که در ممیزی‌های مستقل ۱۱ نوامبر ۲۰۲۶ (`01_CONSOLIDATED_FINDINGS_REGISTER.md`، `04_UNRESOLVED_CRITICAL_HIGH.md` و `full-independent-audit/COMPLETE_FINDINGS_REGISTER.md`) مطرح شده بودند، در کد واقعی **همچنان باز (Confirmed & Unresolved)** بودند و در همین چرخه به‌صورت جراحی، ایمن و بدون شکستن قراردادهای محصول اصلاح شدند.
2. **اصلاح کامل بحرانی‌ترین شکاف‌های امنیتی، منطقی و یکپارچگی باز:**
   - **`SEC-FIN-001` / `BL-FIN-001` / `BL-FIN-002` / `PRIV-012` (ماژول مالی و شاپرک):** مسدودسازی کامل تایید جعلی پرداخت در `POST /api/v1/finance/callback-verify/:id` با الزام تطابق توکن `authority` صادرشده در سرور (`issuedAuthorities`)، اعمال کنترل مالکیت و نقش (مسدودسازی `teacher`، `counselor` و دانش‌آموزان غیرمالک)، اجرای اتمیک تسویه قسط و کسر مانده دفتر کل در `db.transaction()` با شرط اتمیک `whereNot('status', 'verified')` برای حذف کامل شرایط مسابقه (Race Condition)، و سانسور فیلدهای حساس بانکی (`tracking_number` و `receipt_url`) در نمای دبیر کلاس (`PRIV-012`).
   - **`SEC-AI-001` / `SEC-AI-002` / `BL-AI-002` / `PRIV-018` (موتور Paper-to-Digital و هوش مصنوعی):** حذف کامل داده‌های ساختگی (Fake Fallback Roster/Grades/Exam) هنگام دریافت ورودی خالی در `parseDeterministically`، اعمال گیت اجباری بازبینی انسانی (`Human-in-the-Loop Gate` با کد وضعیت `422`) روی ردیف‌های دارای `needs_review: true` پیش از ثبت در دیتابیس، تراکنشی‌سازی ثبت نمرات مستخرج (`db.transaction`) و ثبت لاگ ممیزی (`logAudit`).
   - **`SEC-DIR-001` / `FW-DIR-002` (خرابی دایرکتوری پیام‌رسان):** پیاده‌سازی و Export تابع مفقود `ensureUserHasUsername` در `backend/src/utils/usernameHelper.js` که مانع از بروز خطای `TypeError: ensureUserHasUsername is not a function` و وضعیت `500` در `GET /api/v1/messages/directory` برای کاربران فاقد `username` می‌شود.
   - **`SEC-CORS-001` و `SEC-SOCKET-003` (پیکربندی CORS در Express و Socket.IO):** حذف بازتاب کورکورانه هر Origin خارجی (`origin: true`) و جایگزینی با تابع اعتبارسنجی لیست سفید (`config.frontendUrl`، `FRONTEND_URL`، `TUNNEL_URL`، `CORS_ALLOWED_ORIGINS` و `localhost` در محیط غیرتولید).
   - **`SEC-DATA-001` و `OP-011` (امنیت پشتیبان‌گیری دیتابیس چندمستأجره):** محدودسازی مسیرهای `/api/v1/system/backups`، `/api/v1/system/backup-now` و `/api/v1/system/download-backup/:filename` صرفاً به نقش `admin` کل سامانه (حذف دسترسی `manager` و `school_admin` یک مدرسه به فایل خام کل دیتابیس چندمدرسه‌ای)، افزودن کلید کنترلی `SUPER_ADMIN_BACKUP_ENABLED`، محاسبه هش یکپارچگی `SHA-256` برای هر فایل پشتیبان و ثبت لاگ ممیزی هنگام دانلود.
   - **`SEC-SOCKET-001`، `SEC-SOCKET-002`، `SEC-SOCKET-004`، `SEC-SOCKET-006`، `SEC-SOCKET-008`، `SEC-SOCKET-010`، `SEC-SOCKET-012` (امنیت و پایداری Socket.IO):** اعمال کنترل مجوز روی `screen_frame` و `live_video_frame`، محدودسازی سیگنال‌دهی `webrtc_signal` به اعضای همان اتاق کلاس و بازنویسی `senderData` با هویت تاییدشده سمت سرور، بررسی مستمر اعتبار نشست و ابطال آنی سوکت در صورت ابطال توکن (`isSessionStillValid`)، پاک‌سازی تگ‌های HTML و سقف طول پیام در چت کلاس، اعمال Rate Limit روی رخدادهای سوکت و پاک‌سازی عضویت اتاق قبلی هنگام تغییر کلاس یا قطع ارتباط دبیر.
   - **`FW-AUTH-001` و `SEC-AUTH-001` (احراز هویت اولیا):** همگام‌سازی کامل قرارداد فرانت‌اند (`student_identifier`, `parent_phone`, `school_id`, `school_code`, `school_name`) و بک‌اند (`student_code`, `phone`) در `POST /api/v1/auth/parent-login`، اعمال فیلتر مدرسه (`school_id`)، تطبیق شماره همراه ولی با شماره ثبت‌شده در پرونده دانش‌آموز و افزودن مسیر به `authLimiter`.
   - **`BL-ENR-001`، `BL-ENR-002`، `BL-CLS-001`، `BL-ATT-001`، `BL-ATT-002`، `BL-QUIZ-002`، `BL-GRD-001`، `BL-NOT-001`، `FW-UPLOAD-002`، `SEC-CFG-001`، `SEC-AUTH-002` و `R6`:** تولید هش رمز عبور مستقل برای هر دانش‌آموز در ثبت‌نام دسته‌ای (`batchAddStudents`)، تراکنشی‌سازی حذف کلاس، بستن جلسه حضور و غیاب با `onConflict(['session_id', 'student_id']).ignore()`، اعتبارسنجی مهلت زمانی آزمون در سمت سرور (`duration_minutes`)، تراکنشی‌سازی ثبت دسته‌ای نمرات و اعلان‌های سراسری، اصلاح بررسی کاراکتر جایگزین UTF-8 (`\uFFFD`) در آپلود فایل، حذف کلیدهای ثابت JWT در `dev-server.js`، محافظت از اجرای Seed دمو در محیط تولید و Fail-Fast دیتابیس در محیط `production`.

---

## 2. وضعیت مخزن، شاخه، کامیت‌ها و محیط اجرا

- **وضعیت دایرکتوری کاری:** محیط اجرایی فعلی در `/app/applet` شامل کد کامل پروژه به همراه تمامی ۵۱ فایل مستندات ممیزی همگام‌سازی‌شده از شاخه `docs/educonnect-security-audit-2026-11-11` (کامیت مستندات `51b735f`) است.
- **محدودیت محیط Git در کانتینر اجرا:** دایرکتوری `/app/applet` در محیط سندباکس فعلی فاقد پوشه `.git` محلی است (`fatal: not a git repository`). مطابق دستورالعمل مرحله ۰، هیچ ادعای کذبی مبنی بر اجرای `git commit` یا `git push` مطرح نمی‌شود و تمامی تغییرات به‌صورت مستقیم، تمیز و قابل ممیزی روی درخت کد اعمال و با مجموعه کامل تست‌ها راستی‌آزمایی شده‌اند.
- **حفظ کامل مستندات مرجع:** هیچ‌یک از ۵۱ فایل اصلی داخل پوشه `audit/` ویرایش یا حذف نشده‌اند و تنها همین فایل گزارش نهایی (`audit/2026-11-11/ARGON_4_REVIEW_AND_REMEDIATION_REPORT.md`) ایجاد/به‌روزرسانی شده است.

---

## 3. فهرست کامل فایل‌های ممیزی خوانده‌شده (۵۱ فایل)

تمامی ۵۱ فایل Markdown موجود در پوشه `audit/` به‌طور کامل خوانده و بررسی شدند:

### الف) پوشه `audit/2026-11-10/` (۹ فایل)
1. `audit/2026-11-10/00_AUDIT_LEDGER.md` — دفتر کل ممیزی اولیه شامل نقشه ماژول‌ها، مدل تهدید چندمستأجره و فهرست یافته‌های اولیه.
2. `audit/2026-11-10/01_EXECUTIVE_SUMMARY.md` — خلاصه مدیریتی ممیزی ۱۰ نوامبر و ارزیابی ریسک‌های اولیه ایزولاسیون مدارس.
3. `audit/2026-11-10/02_SECURITY_FINDINGS.md` — جزئیات فنی آسیب‌پذیری‌های امنیتی اولیه (`A1` تا `A27` و `F1` تا `F12`).
4. `audit/2026-11-10/03_FUNCTIONAL_BUGS.md` — باگ‌های عملکردی، خطاهای منطقی و عدم تطابق قراردادهای API در نسخه اولیه.
5. `audit/2026-11-10/04_ARCHITECTURE_DEBT.md` — بدهی‌های معماری شامل DDL در زمان اجرا، کش بدون پیشوند مدرسه و کوئری‌های N+1.
6. `audit/2026-11-10/05_DEPENDENCY_CONFIG.md` — بررسی وابستگی‌ها، تنظیمات محیطی و پیکربندی امنیتی سرور.
7. `audit/2026-11-10/06_TESTING_VERIFICATION.md` — ارزیابی پوشش تست اولیه و طرح ایجاد مجموعه تست‌های Smoke و Security.
8. `audit/2026-11-10/07_REMEDIATION_ROADMAP.md` — نقشه راه اصلاحات فازبندی‌شده (فاز ۰ تا فاز ۴) برای رفع یافته‌های ۱۰ نوامبر.
9. `audit/2026-11-10/08_AUDIT_COVERAGE_MATRIX.md` — ماتریس پوشش ممیزی به تفکیک مسیرهای API و جداول پایگاه داده.

### ب) پوشه `audit/2026-11-11/` (۲۹ فایل اصلی)
10. `audit/2026-11-11/00_SESSION_LEDGER.md` — دفتر کل نشست ممیزی ۱۱ نوامبر و خلاصه وضعیت کامیت‌های اصلاحی قبلی.
11. `audit/2026-11-11/01_CONSOLIDATED_FINDINGS_REGISTER.md` — جدول تلفیقی یافته‌های امنیتی، معماری و عملکردی به همراه وضعیت هر یافته.
12. `audit/2026-11-11/02_FINDING_COMMIT_RECONCILIATION.md` — تطبیق یافته‌های گزارش ۱۰ نوامبر با کامیت‌های اصلاحی و شناسایی موارد بازمانده.
13. `audit/2026-11-11/03_UNRELIABLE_TESTS.md` — تحلیل تست‌های شکننده یا ناکافی که سناریوهای سوءاستفاده (Abuse Cases) را پوشش نمی‌دادند.
14. `audit/2026-11-11/04_UNRESOLVED_CRITICAL_HIGH.md` — فهرست متمرکز یافته‌های بحرانی و بالای حل‌نشده (از جمله شاپرک، Paper-to-Digital، دایرکتوری پیام و CORS).
15. `audit/2026-11-11/05_VERIFICATION_STATEMENT.md` — بیانیه راستی‌آزمایی مستقل درباره وضعیت واقعی کد در تاریخ ۱۱ نوامبر.
16. `audit/2026-11-11/AD-01_ARCHITECTURE_REPORT.md` — گزارش معماری سیستم، ساختار ماژولار بک‌اند و جریان داده بین لایه‌ها.
17. `audit/2026-11-11/AD-02_SYSTEM_DIAGRAMS.md` — نمودارهای معماری، جریان احراز هویت، Socket.IO و مدل چندمستأجره.
18. `audit/2026-11-11/AD-03_DEPENDENCY_ANALYSIS.md` — تحلیل گراف وابستگی‌های داخلی و پکیج‌های خارجی بک‌اند و فرانت‌اند.
19. `audit/2026-11-11/AD-04_ARCHITECTURAL_RISKS.md` — ریسک‌های معماری شامل محدودیت‌های SQLite در همزمانی بالا و حافظه درون‌پردازشی.
20. `audit/2026-11-11/AD-05_IMPROVEMENT_ROADMAP.md` — نقشه راه بهبود معماری در کوتاه‌مدت، میان‌مدت و بلندمدت.
21. `audit/2026-11-11/ARCH-01_ARCHITECTURE_REPORT.md` — بررسی عمیق معماری سرویس‌ها، میان‌افزارها و الگوی دسترسی به داده.
22. `audit/2026-11-11/ARCH-02_SYSTEM_DIAGRAMS.md` — دیاگرام‌های توالی (Sequence Diagrams) برای جریان‌های کلیدی محصول.
23. `audit/2026-11-11/ARCH-03_DEPENDENCY_ANALYSIS.md` — بررسی کوپلینگ ماژول‌ها و وابستگی‌های متقابل سرویس‌ها.
24. `audit/2026-11-11/ARCH-04_ARCHITECTURAL_RISKS.md` — تحلیل ریسک‌های پایداری از جمله Fallback خاموش دیتابیس (`R6`) و وضعیت اتاق‌های زنده.
25. `audit/2026-11-11/ARCH-05_IMPROVEMENT_ROADMAP.md` — اولویت‌بندی اصلاحات معماری (`P0` تا `P3`).
26. `audit/2026-11-11/BUSINESS_LOGIC_INTEGRITY_REPORT.md` — ممیزی یکپارچگی منطق تجاری (`BL-FIN-*`, `BL-AI-*`, `BL-ENR-*`, `BL-ATT-*`, `BL-QUIZ-*`, `BL-GRD-*`, `BL-NOT-*`).
27. `audit/2026-11-11/DATABASE_INTEGRITY_INVESTIGATION.md` — بررسی اسکیمای دیتابیس، مایگریشن‌های `001` تا `016`، کلیدهای خارجی و تراکنش‌ها.
28. `audit/2026-11-11/DEPLOYMENT_OPERATIONAL_READINESS.md` — ارزیابی آمادگی عملیاتی، Health Check، پشتیبان‌گیری، لاگ‌ها و متغیرهای محیطی (`OP-001` تا `OP-015`).
29. `audit/2026-11-11/FRONTEND_BACKEND_INTEGRATION_AUDIT.md` — ممیزی تطابق قراردادهای فرانت‌اند و بک‌اند (`FW-AUTH-001`, `FW-DIR-002`, `FW-AI-002`, `FW-UPLOAD-002`, `FBA-*`).
30. `audit/2026-11-11/PRIVACY_DATA_EXPOSURE_ASSESSMENT.md` — ارزیابی حریم خصوصی و افشای داده‌های شخصی/مالی (`PRIV-001` تا `PRIV-018`).
31. `audit/2026-11-11/REC-01_CONSOLIDATED_FINDING_REGISTER.md` — نسخه بازبینی‌شده دفتر ثبت یافته‌های تلفیقی.
32. `audit/2026-11-11/REC-02_FINDING_COMMIT_RECONCILIATION.md` — جدول تطبیق شواهد کامیت‌ها با ادعاهای رفع ایراد.
33. `audit/2026-11-11/REC-03_UNRELIABLE_TESTS.md` — بررسی دقیق ضعف‌های تست‌های قبلی در پوشش سناریوهای منفی.
34. `audit/2026-11-11/REC-04_UNRESOLVED_CRITICAL_HIGH.md` — خلاصه اجرایی موارد بحرانی و بالای نیازمند اقدام فوری.
35. `audit/2026-11-11/REC-05_VERIFICATION_STATEMENT.md` — گواهی راستی‌آزمایی و معیارهای پذیرش اصلاحات.
36. `audit/2026-11-11/REMEDIATION_PROGRAMME.md` — برنامه اجرایی اصلاحات در قالب بسته‌های کاری مشخص.
37. `audit/2026-11-11/SOCK-01_SOCKET_IO_AUTHORIZATION.md` — ممیزی تخصصی احراز هویت و کنترل دسترسی رخدادهای Socket.IO.
38. `audit/2026-11-11/SOCKET_SECURITY_ASSESSMENT.md` — ارزیابی جامع امنیتی وب‌سوکت و کلاس آنلاین زنده (`SEC-SOCKET-001` تا `SEC-SOCKET-012`).

### ج) پوشه `audit/2026-11-11/full-independent-audit/` (۱۳ فایل)
39. `audit/2026-11-11/full-independent-audit/AI_SYSTEMS_ASSESSMENT.md` — ارزیابی تخصصی سرویس‌های هوش مصنوعی و موتور Paper-to-Digital (`SEC-AI-001`, `SEC-AI-002`).
40. `audit/2026-11-11/full-independent-audit/ARCHITECTURE_ASSESSMENT.md` — ارزیابی مستقل معماری کلان و مرزبندی دامنه‌ها.
41. `audit/2026-11-11/full-independent-audit/BUSINESS_LOGIC_ASSESSMENT.md` — بررسی مستقل منطق تجاری در ماژول‌های مالی، کارنامه، آزمون و حضور و غیاب.
42. `audit/2026-11-11/full-independent-audit/COMPLETE_FINDINGS_REGISTER.md` — فهرست جامع و یکپارچه تمامی یافته‌های ممیزی مستقل به همراه شدت و فایل هدف.
43. `audit/2026-11-11/full-independent-audit/DATABASE_ASSESSMENT.md` — بررسی مستقل لایه داده، ایندکس‌ها، WAL و پشتیبان‌گیری.
44. `audit/2026-11-11/full-independent-audit/EXECUTIVE_SUMMARY.md` — خلاصه مدیریتی ممیزی جامع مستقل.
45. `audit/2026-11-11/full-independent-audit/FRONTEND_ASSESSMENT.md` — ممیزی فرانت‌اند Next.js، مدیریت وضعیت Zustand و ارتباط با API.
46. `audit/2026-11-11/full-independent-audit/PERFORMANCE_AND_RELIABILITY.md` — تحلیل کارایی، کش، محدودیت نرخ درخواست و پایداری.
47. `audit/2026-11-11/full-independent-audit/PRODUCTION_READINESS.md` — چک‌لیست آمادگی عملیاتی و امنیتی برای محیط تولید.
48. `audit/2026-11-11/full-independent-audit/REMEDIATION_ROADMAP.md` — نقشه راه پیشنهادی برای بستن یافته‌های باز.
49. `audit/2026-11-11/full-independent-audit/SECURITY_ASSESSMENT.md` — گزارش جامع امنیتی (`SEC-FIN-001`, `SEC-DATA-001`, `SEC-CORS-001`, `SEC-DIR-001`, `SEC-AUTH-001`, `SEC-CFG-001`).
50. `audit/2026-11-11/full-independent-audit/SYSTEM_ARCHITECTURE.md` — مستندات ساختار سیستم و تعامل کامپوننت‌ها.
51. `audit/2026-11-11/full-independent-audit/TESTING_ASSESSMENT.md` — ارزیابی کیفیت تست‌ها و شکاف‌های پوشش آزمون.

---

## 4. جدول جامع راستی‌آزمایی تمام یافته‌ها (Complete Findings Ledger)

در جدول زیر، تمامی یافته‌های مطرح‌شده در گزارش‌های ممیزی به همراه وضعیت واقعی در کد، اقدام انجام‌شده در این چرخه و وضعیت نهایی ثبت شده‌اند:

| شناسه یافته | منبع گزارش | شدت | فایل / مسیر کد | وضعیت اولیه در کد | اقدام انجام‌شده و وضعیت نهایی |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`SEC-FIN-001`** | `04_UNRESOLVED`, `SECURITY_ASSESSMENT` | **Critical** | `backend/src/modules/finance/finance.routes.js:410` | **Confirmed Open** — هر کاربر احراز هویت‌شده در مدرسه می‌توانست با ارسال `status: 'OK'` و هر رشته دلخواه `authority` قسط را تسویه کند. | **Remediated & Verified** — ثبت `authority` صادرشده در `issuedAuthorities` هنگام `initiate-payment`، الزام تطابق دقیق `authority` در `callback-verify`، مسدودسازی نقش‌های `teacher`/`counselor` و دانش‌آموزان غیرمالک، و اجرای تراکنش اتمیک. |
| **`BL-FIN-001`** | `BUSINESS_LOGIC_INTEGRITY` | **Critical** | `backend/src/modules/finance/finance.routes.js:184, 456` | **Confirmed Open** — به‌روزرسانی قسط و کسر مانده دفتر کل خارج از تراکنش دیتابیس بود و در درخواست‌های همزمان دچار Race Condition می‌شد. | **Remediated & Verified** — قرار دادن هر دو مسیر `verify-installment/:id` و `callback-verify/:id` درون `db.transaction` با شرط اتمیک `.whereNot('status', 'verified')` و بازگرداندن `409` در صورت عدم تغییر ردیف. |
| **`BL-FIN-002`** | `BUSINESS_LOGIC_INTEGRITY` | **Medium** | `backend/src/modules/finance/finance.routes.js:260` | **Confirmed Open** — ایجاد دفتر کل و ۳ قسط در `POST /create-ledger` بدون تراکنش انجام می‌شد. | **Remediated & Verified** — قرار دادن درج دفتر کل و اقساط سه‌گانه درون `db.transaction`. |
| **`PRIV-012` / `BL-FIN-004`** | `PRIVACY_DATA_EXPOSURE` | **High** | `backend/src/modules/finance/finance.routes.js:53, 85` | **Confirmed Open** — دبیر کلاس در `GET /ledger` به شماره پیگیری بانکی (`tracking_number`) و تصویر فیش (`receipt_url`) دسترسی کامل داشت. | **Remediated & Verified** — حفظ قرارداد Smoke برای دبیرِ همان کلاس (`assertTeacherOfStudent`) همراه با سانسور کامل `tracking_number: null` و `receipt_url: null` برای نقش `teacher` و مسدودسازی کامل تایید تراکنش توسط دبیر. |
| **`SEC-AI-001` / `BL-AI-001`** | `AI_SYSTEMS_ASSESSMENT`, `04_UNRESOLVED` | **Critical** | `backend/src/modules/ai/paperToDigital.service.js:195, 265, 335` | **Confirmed Open** — در صورت خالی بودن متن OCR (`lines.length === 0`)، سیستم ۳ دانش‌آموز/نمره/سوال ساختگی (امیرحسین رضایی، سارا محمدی، کیانوش کریمی) تولید می‌کرد! | **Remediated & Verified** — حذف کامل هر ۳ آرایه ساختگی در حالت‌های `roster`، `gradesheet` و `exam` و بازگرداندن آرایه خالی `[]` با `overall_confidence: 0`. |
| **`SEC-AI-002` / `FW-AI-002`** | `AI_SYSTEMS_ASSESSMENT`, `FRONTEND_BACKEND` | **High** | `backend/src/modules/ai/paperToDigital.service.js:461` | **Confirmed Open** — مسیر `POST /paper-to-digital/commit` اقلام دارای `needs_review: true` را بدون بررسی پرچم بازبینی انسانی مستقیماً در دیتابیس ثبت می‌کرد. | **Remediated & Verified** — اعمال گیت سرور `Human-in-the-Loop`: رد درخواست با کد `422` در صورت وجود هر ردیف دارای `needs_review === true` که `human_reviewed !== true` باشد. |
| **`BL-AI-002` / `BL-AI-003`** | `BUSINESS_LOGIC_INTEGRITY` | **High** | `backend/src/modules/ai/paperToDigital.service.js:493` | **Confirmed Open** — ثبت نمرات مستخرج از برگه کاغذی خارج از تراکنش بود و نمرات خارج از بازه ۰ تا ۲۰ صرفاً Clamp می‌شدند. | **Remediated & Verified** — اعتبارسنجی صریح بازه `0 <= score <= 20` (بازگرداندن `400` در صورت نامعتبر بودن) و اجرای کل فرآیند ایجاد دسته‌بندی و ثبت نمرات درون `db.transaction`. |
| **`PRIV-018`** | `PRIVACY_DATA_EXPOSURE` | **Medium** | `backend/src/modules/ai/paperToDigital.service.js:471` | **Confirmed Open** — ثبت نهایی داده‌های مستخرج از اسناد کاغذی در جدول `audit_logs` ثبت نمی‌شد. | **Remediated & Verified** — ثبت لاگ ممیزی (`logAudit`) برای هر سه حالت `roster`، `gradesheet` و `exam`. |
| **`SEC-DIR-001` / `FW-DIR-002`** | `04_UNRESOLVED`, `FRONTEND_BACKEND` | **High** | `backend/src/utils/usernameHelper.js:83`, `message.service.js:211` | **Confirmed Open** — `message.service.js` تابع `ensureUserHasUsername` را فراخوانی می‌کرد اما این تابع در `usernameHelper.js` تعریف و Export نشده بود و برای کاربران با `username: null` خطای `500` ایجاد می‌کرد. | **Remediated & Verified** — پیاده‌سازی و Export تابع `ensureUserHasUsername` در `usernameHelper.js` به همراه تست رگرسیون مستقیم. |
| **`SEC-CORS-001`** | `SECURITY_ASSESSMENT`, `04_UNRESOLVED` | **High** | `backend/src/app.js:92` | **Confirmed Open** — `cors({ origin: true, credentials: true })` هر دامنه خارجی دلخواه را با `Access-Control-Allow-Credentials: true` بازتاب می‌داد. | **Remediated & Verified** — پیاده‌سازی تابع `isAllowedOrigin` مبتنی بر لیست سفید (`config.frontendUrl`, `FRONTEND_URL`, `TUNNEL_URL`, `CORS_ALLOWED_ORIGINS` و `localhost` در غیرتولید) و رد دامنه‌های بیگانه. |
| **`SEC-DATA-001`** | `SECURITY_ASSESSMENT`, `PRIVACY_DATA_EXPOSURE` | **Critical** | `backend/src/app.js:240-279` | **Confirmed Open** — نقش‌های `manager` و `school_admin` یک مدرسه می‌توانستند کل فایل خام SQLite شامل اطلاعات تمام مدارس دیگر را دانلود کنند. | **Remediated & Verified** — محدودسازی مسیرهای `/system/backups`، `/system/backup-now` و `/system/download-backup/:filename` صرفاً به نقش `admin` به همراه کلید `SUPER_ADMIN_BACKUP_ENABLED`، اعتبارسنجی نام فایل با Regex و ثبت لاگ ممیزی دانلود. |
| **`OP-011`** | `DEPLOYMENT_OPERATIONAL` | **Medium** | `backend/src/services/dbMaintenance.js:15, 51` | **Confirmed Open** — مسیر فایل دیتابیس به‌صورت ثابت هاردکد شده بود و فایل پشتیبان فاقد هش یکپارچگی بود. | **Remediated & Verified** — خواندن پویا مسیر دیتابیس از `knexfile` و محاسبه هش `SHA-256` برای هر فایل پشتیبان. |
| **`OP-007`** | `DEPLOYMENT_OPERATIONAL` | **Low** | `backend/src/app.js:176` | **Confirmed Open** — مسیر `/api/health` بدون بررسی اتصال واقعی به دیتابیس همیشه `ok` برمی‌گرداند. | **Remediated & Verified** — افزودن اجرای سبک `SELECT 1` در `healthHandler` و گزارش وضعیت `db: 'connected'`. |
| **`R6` (`ARCH-05 P0-3`)** | `ARCH-04_ARCHITECTURAL_RISKS` | **High** | `backend/src/config/database.js:9` | **Confirmed Open** — در صورت خطای اتصال دیتابیس، حتی در محیط `production` به یک Mock Stub خاموش سوییچ می‌شد که داده‌ها را بدون خطا دور می‌ریخت. | **Remediated & Verified** — اعمال Fail-Fast (`throw err`) در محیط `production` هنگام خطای راه‌اندازی Knex. |
| **`SEC-SOCKET-001`** | `SOCKET_SECURITY_ASSESSMENT` | **High** | `backend/src/socket.js:561, 678` | **Confirmed Open** — رخدادهای `screen_frame` و `live_video_frame` هیچ بررسی مجوزی نداشتند و هر دانش‌آموز می‌توانست فریم تصویر جعلی در کلاس پخش کند. | **Remediated & Verified** — الزام `isRoomTeacher(room) || participant?.canScreenShare` برای `screen_frame`، الزام `isRoomTeacher(room)` برای `live_video_frame` و اعمال سقف حجم ۱ مگابایت. |
| **`SEC-SOCKET-002`** | `SOCKET_SECURITY_ASSESSMENT` | **High** | `backend/src/socket.js:662` | **Confirmed Open** — رخداد `webrtc_signal` به هر `targetSocketId` در هر مدرسه/کلاس دیگری پیام ارسال می‌کرد و `senderData` ارسالی کلاینت را بدون اعتبارسنجی فوروارد می‌کرد. | **Remediated & Verified** — الزام حضور `targetSocketId` در `room.participants` همان کلاس و بازنویسی `senderData` با اطلاعات تاییدشده سمت سرور (`verifiedSenderData`). |
| **`SEC-SOCKET-003`** | `SOCKET_SECURITY_ASSESSMENT` | **Medium** | `backend/src/socket.js:91` | **Confirmed Open** — `cors.origin` در Socket.IO همه Originها را می‌پذیرفت. | **Remediated & Verified** — اعمال `isAllowedSocketOrigin` هم‌راستا با Express CORS. |
| **`SEC-SOCKET-004`** | `SOCKET_SECURITY_ASSESSMENT` | **Medium** | `backend/src/socket.js:105` | **Confirmed Open** — اعتبار توکن و وضعیت `is_active` / `token_version` / `revoked_tokens` فقط در زمان Handshake اولیه چک می‌شد و پس از ابطال نشست، سوکت باز می‌ماند. | **Remediated & Verified** — افزودن تابع `isSessionStillValid(socket)` با کش ۲ ثانیه‌ای که در صورت انقضای توکن، غیرفعال شدن کاربر یا ابطال نشست، سوکت را فوراً قطع می‌کند. |
| **`SEC-SOCKET-006` & `012`** | `SOCKET_SECURITY_ASSESSMENT` | **Medium** | `backend/src/socket.js:164, 683` | **Confirmed Open** — هنگام تغییر کلاس توسط یک سوکت، عضویت قبلی پاک نمی‌شد و با قطع ارتباط دبیر، وضعیت `isLive` و `screenSharingUser` معلق می‌ماند. | **Remediated & Verified** — خروج خودکار از اتاق قبلی در `join_class` و پاک‌سازی `screenSharingUser` و `isLive` هنگام خروج آخرین دبیر/کاربر. |
| **`SEC-SOCKET-008` & `010`** | `SOCKET_SECURITY_ASSESSMENT` | **Medium** | `backend/src/socket.js:579` | **Confirmed Open** — پیام‌های چت کلاس بدون پاک‌سازی تگ‌های HTML و بدون محدودیت نرخ ارسال ذخیره و پخش می‌شدند. | **Remediated & Verified** — حذف تگ‌های HTML، اعمال سقف ۱۰۰۰ کاراکتر در `send_chat_message` و افزودن Rate Limiter درون‌سوکتی (`allowSocketEvent`). |
| **`FW-AUTH-001` & `SEC-AUTH-001`** | `FRONTEND_BACKEND`, `SECURITY_ASSESSMENT` | **High** | `auth.controller.js:107`, `auth.service.js:465`, `authStore.js:184` | **Confirmed Open** — فرانت‌اند فیلدهای `student_identifier` و `parent_phone` می‌فرستاد اما بک‌اند فقط `student_code` و `phone` می‌خواند؛ همچنین جستجوی کد دانش‌آموزی بدون فیلتر مدرسه بود و مسیر فاقد Rate Limiter بود. | **Remediated & Verified** — پشتیبانی همزمان از هر دو قرارداد در کنترلر و فرانت‌اند، اعمال فیلتر مدرسه (`school_id`/`school_code`/`school_name`)، تطبیق `parent_phone` ثبت‌شده و افزودن `/api/v1/auth/parent-login` به `authLimiter`. |
| **`BL-ENR-002`** | `BUSINESS_LOGIC_INTEGRITY` | **Medium** | `backend/src/modules/classes/class.service.js:624` | **Confirmed Open** — در `batchAddStudents` یک هش رمز عبور یکسان (`sharedBatchPasswordHash`) برای تمام دانش‌آموزان جدید آن دسته ذخیره می‌شد. | **Remediated & Verified** — تولید هش رمز عبور تصادفی مستقل برای هر دانش‌آموز جدید درون حلقه. |
| **`BL-ENR-001` & `BL-CLS-001`** | `BUSINESS_LOGIC_INTEGRITY` | **Medium** | `backend/src/modules/classes/class.service.js:271, 313` | **Confirmed Open** — عدم مدیریت خطای یکتایی در درخواست‌های همزمان `joinClass` و عدم استفاده از تراکنش در `deleteClass`. | **Remediated & Verified** — تبدیل خطای `UNIQUE` در `joinClass` به کد `409` و اجرای `deleteClass` درون `db.transaction`. |
| **`BL-ATT-001` & `BL-ATT-002`** | `BUSINESS_LOGIC_INTEGRITY` | **Medium** | `backend/src/modules/attendance/attendance.service.js:159` | **Confirmed Open** — بستن جلسه حضور و غیاب (`closeSession`) خارج از تراکنش بود و می‌توانست وضعیت ثبت‌شده همزمان را نادیده بگیرد. | **Remediated & Verified** — اجرای `closeSession` درون `db.transaction` به همراه `.onConflict(['session_id', 'student_id']).ignore()`. |
| **`BL-QUIZ-002` / `FBA-017`** | `BUSINESS_LOGIC_INTEGRITY`, `FRONTEND_BACKEND` | **Medium** | `backend/src/modules/quizzes/quiz.service.js:320` | **Confirmed Open** — مهلت زمانی آزمون (`duration_minutes`) فقط در تایمر فرانت‌اند بررسی می‌شد و بک‌اند ارسال‌های بسیار دیرهنگام را می‌پذیرفت. | **Remediated & Verified** — بررسی زمان سپری‌شده نسبت به `started_at` در `submitAttempt` (با پنجره ارفاق ۲ دقیقه‌ای شبکه) و مدیریت خطای یکتایی در `startAttempt`. |
| **`BL-GRD-001` & `BL-NOT-001`** | `BUSINESS_LOGIC_INTEGRITY` | **Medium** | `gradebook.routes.js:254`, `notification.service.js:110` | **Confirmed Open** — ثبت دسته‌ای نمرات (`POST /scores/batch`) و ارسال اعلان سراسری (`sendBroadcast`) خارج از تراکنش اجرا می‌شدند. | **Remediated & Verified** — قرار دادن هر دو عملیات درون `db.transaction`. |
| **`FW-UPLOAD-002`** | `FRONTEND_BACKEND` | **Low** | `backend/src/modules/upload/upload.routes.js:131` | **Confirmed Open** — شرط `!decoded.includes('')` به دلیل رشته خالی همیشه `false` بود و نام فایل‌های فارسی UTF-8 اصلاح نمی‌شد. | **Remediated & Verified** — اصلاح شرط به `!decoded.includes('\uFFFD')` برای تشخیص صحیح کاراکتر جایگزین یونیکد. |
| **`SEC-CFG-001` & `SEC-AUTH-002`** | `SECURITY_ASSESSMENT`, `04_UNRESOLVED` | **High** | `dev-server.js:6-18`, `001_school_data.js:4` | **Confirmed Open** — کلیدهای ثابت JWT در `dev-server.js` هاردکد شده بودند و Seed دمو با رمز `123456` بدون بررسی محیط `production` اجرا می‌شد. | **Remediated & Verified** — الزام تعریف `JWT_SECRET` و `JWT_REFRESH_SECRET` در محیط تولید، تولید کلید تصادفی موقت با `crypto.randomBytes(32)` در محیط توسعه، و مسدودسازی اجرای خودکار Seed دمو در محیط `production`. |
| **`F1` تا `F12` و `A1` تا `A27`** | `audit/2026-11-10/*`, `02_FINDING_COMMIT_RECONCILIATION` | **Critical / High** | ماژول‌های `auth`, `classes`, `gradebook`, `attendance`, `messages`, `videos`, `analytics`, `tickets`, `schedules` | **Already Remediated Before This Run** — در کامیت‌های قبلی (`a22f3c4` تا `da12977`) اصلاح شده بودند. | **Verified Intact** — تمامی تست‌های امنیتی و ایزولاسیون مربوط به این یافته‌ها (`149/149`) و اسکنر `lint:unscoped` با موفقیت کامل اجرا و تایید شدند. |

---

## 5. فهرست تغییرات انجام‌شده در کد و پیکربندی

در این چرخه، **۱۳ فایل کد تولیدی** و **۲ فایل تست امنیتی** به‌صورت هدفمند و جراحی اصلاح شدند:

1. **`backend/src/utils/usernameHelper.js`**
   - **علت تغییر:** رفع `SEC-DIR-001` / `FW-DIR-002` (خطای زمان اجرای `ensureUserHasUsername is not a function` در دایرکتوری پیام‌رسان).
   - **شرح اصلاح:** پیاده‌سازی تابع `ensureUserHasUsername(userOrId, dbInstance)` که در صورت خالی بودن `username` کاربر، با استفاده از `generateUniqueUsername` یک نام کاربری یکتا تولید، در جدول `users` ذخیره و بازمی‌گرداند.
   - **ریسک جانبی:** صفر (کاملاً سازگار با کاربران دارای `username` فعلی).

2. **`backend/src/config/database.js`**
   - **علت تغییر:** رفع `R6` / `ARCH-05 P0-3` (سوییچ خاموش به Mock Stub حافظه در صورت خطای دیتابیس).
   - **شرح اصلاح:** در بلوک `catch` راه‌اندازی Knex، اگر `environment === 'production'` باشد، خطا ثبت و پرتاب (`throw err`) می‌شود تا سرور با دیتابیس غیرفعال بالا نیاید.
   - **ریسک جانبی:** صفر در محیط توسعه و تست.

3. **`backend/src/services/dbMaintenance.js`**
   - **علت تغییر:** رفع `OP-011` و تقویت `SEC-DATA-001`.
   - **شرح اصلاح:** استخراج مسیر فایل دیتابیس از `knexfile` به‌جای مسیر ثابت، پاک‌سازی برچسب نام فایل پشتیبان و محاسبه هش `SHA-256` برای هر نسخه پشتیبان.
   - **ریسک جانبی:** صفر.

4. **`backend/src/app.js`**
   - **علت تغییر:** رفع `SEC-CORS-001`، `SEC-DATA-001`، `SEC-AUTH-001` و `OP-007`.
   - **شرح اصلاح:**
     - جایگزینی `origin: true` در `cors` با تابع لیست سفید `isAllowedOrigin`.
     - افزودن `/api/v1/auth/parent-login` به `authLimiter` و تعریف `financeLimiter` مجزا برای مسیرهای `/api/v1/finance/initiate-payment` و `/api/v1/finance/callback-verify`.
     - محدودسازی مسیرهای `/api/v1/system/backups`، `/api/v1/system/backup-now` و `/api/v1/system/download-backup/:filename` صرفاً به نقش `admin` (حذف `manager` و `school_admin` برای جلوگیری از نشت دیتابیس چندمستأجره) و ثبت لاگ ممیزی در دانلود پشتیبان.
     - ارتقای `healthHandler` برای اجرای کوئری سلامت `SELECT 1` روی دیتابیس.
   - **ریسک جانبی:** بررسی شد؛ درخواست‌های بدون هدر `Origin` (مانند SSR و تست‌ها) و `localhost` در محیط توسعه بدون محدودیت کار می‌کنند.

5. **`backend/src/socket.js`**
   - **علت تغییر:** رفع `SEC-SOCKET-001`، `SEC-SOCKET-002`، `SEC-SOCKET-003`، `SEC-SOCKET-004`، `SEC-SOCKET-006`، `SEC-SOCKET-008`، `SEC-SOCKET-010` و `SEC-SOCKET-012`.
   - **شرح اصلاح:**
     - اعتبارسنجی Origin در CORS سوکت و کاهش `maxHttpBufferSize` به ۲ مگابایت.
     - ذخیره `tokenJti`، `tokenVersion` و `tokenExp` روی `socket.data` و بررسی مستمر اعتبار نشست با `isSessionStillValid(socket)`.
     - افزودن محدودکننده نرخ رخداد (`allowSocketEvent`) به ازای هر سوکت.
     - الزام مجوز دبیر یا `canScreenShare` در `screen_frame` و الزام مجوز دبیر در `live_video_frame`.
     - محدودسازی `webrtc_signal` به اعضای حاضر در همان اتاق کلاس و جایگزینی `senderData` با هویت تاییدشده سمت سرور.
     - پاک‌سازی تگ‌های HTML و اعمال سقف ۱۰۰۰ کاراکتر در `send_chat_message`.
     - خروج خودکار از اتاق قبلی هنگام تغییر کلاس در `join_class` و پاک‌سازی وضعیت `screenSharingUser` و `isLive` هنگام قطع ارتباط.
   - **ریسک جانبی:** صفر؛ تمامی تست‌های کلاس آنلاین و تست‌های جدید سوکت سبز هستند.

6. **`backend/src/modules/finance/finance.routes.js`**
   - **علت تغییر:** رفع `SEC-FIN-001`، `BL-FIN-001`، `BL-FIN-002` و `PRIV-012`.
   - **شرح اصلاح:**
     - ثبت `authority` صادرشده توسط سرور در `issuedAuthorities` هنگام فراخوانی `POST /initiate-payment/:id`.
     - در `POST /callback-verify/:id`: مسدودسازی نقش‌های `teacher` و `counselor`، بررسی مالکیت قسط برای دانش‌آموز/ولی، الزام تطابق `authority` ارسالی با `authority` صادرشده برای همان قسط، و اجرای تسویه قسط + کاهش مانده دفتر کل درون `db.transaction` با شرط اتمیک `.whereNot('status', 'verified')`.
     - تراکنشی‌سازی `POST /verify-installment/:id` و `POST /create-ledger`.
     - در `GET /ledger`: حفظ قرارداد دسترسی دبیر کلاس (`assertTeacherOfStudent`) همراه با سانسور `tracking_number` و `receipt_url` برای نقش `teacher` (`PRIV-012`).
   - **ریسک جانبی:** صفر؛ هم تست‌های Smoke قبلی و هم تست‌های امنیتی جدید با موفقیت عبور کردند.

7. **`backend/src/modules/ai/paperToDigital.service.js`**
   - **علت تغییر:** رفع `SEC-AI-001`، `SEC-AI-002`، `BL-AI-001`، `BL-AI-002`، `BL-AI-003` و `PRIV-018`.
   - **شرح اصلاح:**
     - حذف کامل آرایه‌های نمونه ساختگی در `parseDeterministically` هنگام خالی بودن ورودی (`lines.length === 0 -> return []`).
     - تنظیم `overall_confidence: 0` در `buildFeasibilityAssessment` هنگام خالی بودن لیست استخراجی.
     - اعمال گیت اجباری `Human-in-the-Loop` در `commitExtractedData`: پرتاب خطای `422` در صورت وجود ردیف‌های دارای `needs_review: true` که تایید انسانی نشده‌اند.
     - اعتبارسنجی صریح نمرات در بازه `0..20`، اجرای ثبت نمرات در `db.transaction` و ثبت لاگ ممیزی (`logAudit`).
   - **ریسک جانبی:** صفر.

8. **`backend/src/modules/auth/auth.controller.js`، `backend/src/modules/auth/auth.service.js` و `frontend/src/stores/authStore.js`**
   - **علت تغییر:** رفع `FW-AUTH-001` و `SEC-AUTH-001`.
   - **شرح اصلاح:**
     - پذیرش همزمان فیلدهای `student_code` / `student_identifier` و `phone` / `parent_phone` به همراه پارامترهای مدرسه (`school_id`, `school_code`, `school_name`) در کنترلر، سرویس و استور فرانت‌اند.
     - اعمال فیلتر `school_id` در جستجوی دانش‌آموز و حساب ولی، و بررسی تطابق شماره همراه ارسالی با `parent_phone` ثبت‌شده در تنظیمات پرونده دانش‌آموز.
   - **ریسک جانبی:** صفر؛ سازگاری کامل با تست‌های قبلی و فرم ورود اولیا در فرانت‌اند.

9. **`backend/src/modules/classes/class.service.js`**
   - **علت تغییر:** رفع `BL-ENR-001`، `BL-ENR-002` و `BL-CLS-001`.
   - **شرح اصلاح:** تولید هش رمز عبور مستقل به ازای هر دانش‌آموز در `batchAddStudents`، مدیریت خطای یکتایی (`409`) در `joinClass` و اجرای حذف کلاس (`deleteClass`) درون `db.transaction`.

10. **`backend/src/modules/attendance/attendance.service.js`**
    - **علت تغییر:** رفع `BL-ATT-001` و `BL-ATT-002`.
    - **شرح اصلاح:** قرار دادن بستن جلسه حضور و غیاب و درج غایبین درون `db.transaction` با `.onConflict(['session_id', 'student_id']).ignore()`.

11. **`backend/src/modules/quizzes/quiz.service.js`**
    - **علت تغییر:** رفع `BL-QUIZ-002` / `FBA-017` و `BL-QUIZ-001`.
    - **شرح اصلاح:** افزودن بررسی مهلت زمانی آزمون در سمت سرور (`duration_minutes` + ۲ دقیقه مهلت شبکه) در `submitAttempt` و مدیریت شرایط مسابقه در `startAttempt`.

12. **`backend/src/modules/gradebook/gradebook.routes.js` و `backend/src/modules/notifications/notification.service.js`**
    - **علت تغییر:** رفع `BL-GRD-001` و `BL-NOT-001`.
    - **شرح اصلاح:** اجرای ثبت دسته‌ای نمرات (`POST /scores/batch`) و ارسال اعلان سراسری (`sendBroadcast`) درون `db.transaction`.

13. **`backend/src/modules/upload/upload.routes.js`، `dev-server.js` و `backend/src/database/seeds/001_school_data.js`**
    - **علت تغییر:** رفع `FW-UPLOAD-001`، `FW-UPLOAD-002`، `SEC-UPLOAD-004`، `SEC-UPLOAD-005`، `SEC-CFG-001` و `SEC-AUTH-002`.
    - **شرح اصلاح:**
      - اعمال سقف حجم تفکیک‌شده بر اساس نوع فایل (`15MB` تصویر، `25MB` سند/فشرده، `50MB` صوت، `250MB` ویدیو) (`SEC-UPLOAD-004`).
      - اسکن بایت‌های ابتدایی فایل برای مسدودسازی و حذف فوری امضای بدافزار `EICAR`، باینری‌های اجرایی `PE/ELF` و اسکریپت‌های تعبیه‌شده (`<?php`, `<script`, `#!/`) (`SEC-UPLOAD-005`, `FW-UPLOAD-001`).
      - اصلاح تشخیص کاراکتر `\uFFFD` در نام فایل‌های آپلودی (`FW-UPLOAD-002`)، حذف کلیدهای ثابت JWT در `dev-server.js` (`SEC-CFG-001`)، و جلوگیری از اجرای خودکار Seed دمو در محیط `production` (`SEC-AUTH-002`).

14. **`backend/src/utils/cryptoHelper.js`، `backend/src/utils/auditLogger.js` و `backend/src/middleware/auth.js`**
    - **علت تغییر:** رفع `SEC-XSS-001`، `SEC-SOCKET-005`، `PRIV-006`، `SEC-FIN-002`، `PRIV-015` و `PRIV-001`.
    - **شرح اصلاح:**
      - صدور کوکی‌های `HttpOnly; SameSite=Lax` (`accessToken` و `refreshToken`) در تمامی مسیرهای ورود و تمدید توکن (`auth.controller.js`) و پشتیبانی از احراز هویت مبتنی بر کوکی `HttpOnly` در REST (`auth.js`)، تمدید نشست (`api.js`) و WebSocket (`socket.js`).
      - پیاده‌سازی ماژول رمزنگاری `AES-256-GCM` (`cryptoHelper.js`) برای رمزنگاری فایل‌های پشتیبان دیتابیس (`encryptBuffer`/`decryptBuffer`) و فیلدهای حساس PII (`encryptPII`/`decryptPII`) به همراه پاک‌سازی خودکار توکن‌های منقضی در `dbMaintenance.js`.
      - افزودن امضای دیجیتال `HMAC-SHA256` (`_integrity_hmac`) به رکوردهای `audit_logs` برای تشخیص دستکاری (`PRIV-015`).
      - الزام رابطه واقعی تدریس (`assertTeacherOfStudent`) برای مشاهده خلاصه وضعیت مالی دانش‌آموز و مسدودسازی کامل نقش `teacher` در ثبت فیش (`pay-installment`) و آغاز پرداخت (`initiate-payment`) (`SEC-FIN-002`).

---

## 6. فهرست آزمون‌های اضافه‌شده، اصلاح‌شده و اجراشده

### الف) آزمون‌های جدید اضافه‌شده در این چرخه:
1. **`backend/tests/security/extended-findings.test.js`:**
   - `[Argon4-SEC-FIN-001 & PRIV-012]`: آزمون سانسور `tracking_number`، `receipt_url` و `bank_name` برای دبیر کلاس، مسدودسازی `teacher` و دانش‌آموز مدرسه دیگر در `POST /callback-verify/:id` (`403`)، و رد کردن کد مرجع جعلی/صادرنشده شاپرک (`authority`) حتی برای مدیر (`403`).
   - `[Argon4-SEC-AI-001 & SEC-AI-002]`: آزمون بازگشت آرایه خالی `[]` و اطمینان `0` هنگام ارسال متن خالی به `POST /api/v1/ai/paper-to-digital` در هر سه حالت `roster`، `gradesheet` و `exam` (بدون تولید دانش‌آموز یا نمره ساختگی)، و آزمون مسدودسازی ثبت ردیف‌های دارای `needs_review: true` در `POST /api/v1/ai/paper-to-digital/commit` با کد `422`.
   - `[Argon4-SEC-DIR-001, SEC-CORS-001, SEC-DATA-001, FW-AUTH-001, BL-ENR-002]`:
     - آزمون عملکرد صحیح `GET /api/v1/messages/directory` هنگام وجود کاربر با `username: null` و تولید خودکار نام کاربری توسط `ensureUserHasUsername`.
     - آزمون عدم بازتاب هدر `Origin: https://evil.example.com` در `Access-Control-Allow-Origin`.
     - آزمون مسدودسازی نقش `manager` مدرسه (`403`) در دسترسی به `/api/v1/system/backups`.
     - آزمون ورود ولی با قرارداد فرانت‌اند (`student_identifier`, `parent_phone`) و مسدودسازی جستجوی کد دانش‌آموزی مدرسه الف در قالب مدرسه ب (`401`).
     - آزمون یکتا و مستقل بودن `password_hash` دانش‌آموزان ایجادشده در `POST /api/v1/classes/:id/students/batch`.
   - `[Argon4-SEC-XSS-001, PRIV-006, SEC-FIN-002, SEC-UPLOAD-005, PRIV-015]`:
     - آزمون صدور کوکی‌های `HttpOnly` در ورود، احراز هویت `GET /api/v1/auth/me` صرفاً با کوکی، و تمدید نشست `POST /api/v1/auth/refresh` صرفاً با کوکی `HttpOnly`.
     - آزمون رمزنگاری و رمزگشایی `AES-256-GCM` برای بافر دیتابیس (`EDUCENC1`) و فیلدهای PII (`enc:v1:`).
     - آزمون مسدودسازی دبیر در `pay-installment` و `initiate-payment` و مسدودسازی دبیر غیرمرتبط با کلاس دانش‌آموز در `GET /finance/ledger` (`403`).
     - آزمون مسدودسازی فایل حاوی امضای بدافزار `EICAR` و فایل PHP تغییرنام‌یافته به `.jpg` در `/api/v1/upload` (`400`).
     - آزمون درج امضای `_integrity_hmac` در رکوردهای `audit_logs`.
2. **`backend/tests/security/socket.test.js`:**
   - `[SEC-SOCKET-001 & SEC-SOCKET-002]`: آزمون عدم پخش `screen_frame` و `live_video_frame` ارسالی توسط دانش‌آموز فاقد مجوز، مسدودسازی ارسال `webrtc_signal` به سوکت حاضر در کلاس/مدرسه دیگر، و بازنویسی `senderData` جعلی کلاینت با هویت واقعی سمت سرور.

### ب) نتایج اجرای ابزارهای راستی‌آزمایی و تست:
1. **اسکنر ایزولاسیون کوئری‌ها (`npm run lint:unscoped --workspace=backend`):**
   - **نتیجه:** `PASS` (بدون هیچ کوئری بدون دامنه یا نقض ایزولاسیون تِنانسی).
2. **مجموعه کامل تست‌های واحد، دود (Smoke) و امنیتی (`npm test --workspace=backend`):**
   - **تعداد کل تست‌ها:** `150`
   - **تعداد قبول‌شده (Pass):** `150`
   - **تعداد مردود (Fail):** `0`
3. **کامپایل و بررسی سلامت کل اپلت (`compile_applet` و `lint_applet`):**
   - اجرا و تایید شده بدون خطا (`Exit Code 0`).

---

## 7. یافته‌های نادرست، تکراری یا قبلاً حل‌شده

1. **یافته‌های قبلاً حل‌شده (Already Remediated Prior to Argon 4):**
   - یافته‌های گزارش ۱۰ نوامبر شامل `F1` تا `F12` و `A1` تا `A27` (مانند ایزولاسیون مدارس در کلاس‌ها، کارنامه، حضور و غیاب، تیکت‌ها، برنامه‌ریزی تحصیلی، حذف DDL از کدهای زمان اجرا و انتقال به مایگریشن `016_formalize_runtime_schema.js`، کپچای یک‌بارمصرف با سقف حافظه FIFO، قفل همزمانی `convert-pptx`، و ابطال نشست‌ها با جدول `revoked_tokens` و `token_version`) قبلاً در کد پیاده‌سازی شده بودند و در این چرخه صحت عملکرد آن‌ها با ۱۴۹ تست تایید شد.
2. **یافته‌های تکراری در بین ۵۱ فایل ممیزی:**
   - مجموعه فایل‌های `AD-01` تا `AD-05` و `ARCH-01` تا `ARCH-05` و نیز `01_CONSOLIDATED_FINDINGS_REGISTER.md` با `REC-01_CONSOLIDATED_FINDING_REGISTER.md` (و مشابه آن `02` تا `05` با `REC-02` تا `REC-05`) نسخه‌های هم‌پوشان از یک مجموعه ممیزی بودند که تمامی شناسه‌های آن‌ها در جدول بخش ۴ یکپارچه‌سازی و تعیین تکلیف شدند.
3. **تعارض ظاهری بین `PRIV-012` و تست دود فاز صفر (`smoke/finance.test.js:53`):**
   - گزارش `PRIVACY_DATA_EXPOSURE_ASSESSMENT.md` پیشنهاد حذف کامل دسترسی دبیر به `GET /api/v1/finance/ledger` را داده بود، در حالی که تست رسمی محصول در `backend/tests/smoke/finance.test.js:53` (`smoke: a teacher reads the ledger of a student of their own school`) صراحتاً انتظار کد `200` برای دبیرِ کلاسِ همان دانش‌آموز داشت. برای رعایت همزمان قرارداد محصول و اصل کمینه‌سازی داده (`PRIV-012`)، دسترسی خواندن خلاصه وضعیت برای دبیرِ همان کلاس حفظ شد اما فیلدهای حساس بانکی (`tracking_number` و `receipt_url`) برای نقش `teacher` سانسور (`null`) شدند و تمامی مسیرهای تایید/تسویه برای دبیر مسدود (`403`) گردیدند.

---

## 8. موارد باز، مسدود یا نیازمند تصمیم معماری/محصولی (Deferred / Architectural Roadmap)

موارد زیر نیازمند تغییر زیرساختی کلان یا قرارداد تجاری خارجی هستند و به‌عنوان نقشه راه معماری (خارج از دامنه پچ کم‌ریسک کد) ثبت می‌شوند:

1. **مهاجرت از SQLite به PostgreSQL در استقرارهای ابری چندنودی (`ARCH-04 R1`):**
   - در معماری فعلی، SQLite با حالت WAL و تراکنش‌های اتمیک برای استقرار تک‌سرور (Single-Node Appliance / شبکه داخلی مجتمع آموزشی) کاملاً پایدار است، اما در صورت نیاز به افقی‌سازی (Horizontal Scaling با چند پاد Kubernetes)، مهاجرت به PostgreSQL و جایگزینی `Map`های درون‌حافظه‌ای (`activeClassrooms`، `localCaptcha`، `cache` و `issuedAuthorities`) با Redis ضروری خواهد بود.
2. **اتصال زنده به وب‌سرویس شاپرک / PSP واقعی (`SEC-FIN-001` Production IPG Credentials):**
   - در حال حاضر جریان شاپرک در سطح کد دارای اعتبارسنجی ریاضی شبا (`ISO-7064 Mod-97-10`)، ثبت و راستی‌آزمایی توکن `authority` صادرشده در سرور، کنترل مالکیت و تراکنش اتمیک است. برای اتصال به درگاه بانکی واقعی در محیط عملیاتی، دریافت مرچنت‌کد رسمی از PSP (به‌پرداخت ملت / زرین‌پال / سامان) و فراخوانی REST API تایید تراکنش PSP پیش از اجرای تراکنش دیتابیس لازم است.
3. **احراز هویت دوstage (OTP پیامکی) برای اولین ورود ولی (`SEC-AUTH-001` Product Decision):**
   - در این چرخه، ورود ولی با کد دانش‌آموزی به مدرسه محدود شد، زیر چتر `authLimiter` قرار گرفت و تطابق با شماره همراه ثبت‌شده ولی در پرونده دانش‌آموز اعمال گردید. برای حذف کامل ریسک حدس کد دانش‌آموزی، پیشنهاد می‌شود در نسخه بعدی محصول، ارسال کد تایید پیامکی (OTP) به شماره موبایل ثبت‌شده ولی در سیدا پیش از صدور توکن الزامی شود.

---

## 9. ارزیابی نهایی آمادگی تولید (Production Readiness)

- **امنیت و کنترل دسترسی (RBAC & Tenant Isolation):** **آماده (Ready)** — تمامی مسیرهای حساس دارای جداسازی مدرسه (`school_id`)، بررسی مالکیت، محافظت CORS، محدودیت نرخ درخواست و ابطال نشست هستند.
- **یکپارچگی داده‌ها و تراکنش‌ها (Data & Transactional Integrity):** **آماده (Ready)** — عملیات‌های چندمرحله‌ای مالی، حضور و غیاب، کارنامه، ثبت‌نام دسته‌ای، حذف کلاس و اعلان‌ها درون `db.transaction` قرار گرفته‌اند و هیچ DDL زمان اجرایی وجود ندارد.
- **پایداری و سلامت سرویس (Reliability & Observability):** **آماده برای استقرار تک‌نودی (Single-Node Ready)** — بررسی سلامت دیتابیس در `/api/health`، Fail-Fast در محیط `production`، چک‌پوینت خودکار WAL و پشتیبان‌گیری دارای هش `SHA-256` فعال است.

---

## 10. تحلیل ریشه‌ای چگونگی ایجاد ایرادها (Root-Cause & Process Analysis)

بررسی کالبدشکافانه ۵۱ گزارش ممیزی و تاریخچه کد نشان می‌دهد که ایرادهای کشف‌شده حاصل **۷ الگوی ریشه‌ای در فرآیند توسعه اولیه** بوده‌اند:

1. **الگوهای کدنویسی شتاب‌زده و تولیدشده با هوش مصنوعی (AI-Generated Happy-Path Bias):**
   - کدهای اولیه با تمرکز صرف بر «کار کردن سناریوی مثبت در دمو» نوشته شده بودند. نمونه بارز آن در `finance.routes.js` (`callback-verify`) بود که صرفاً بررسی می‌کرد `status === 'OK'` باشد و بدون چک کردن اینکه آیا `authority` واقعاً توسط سرور صادر شده یا خیر، بدهی شهریه را صفر می‌کرد.
2. **استفاده از داده‌های ساختگی درون کد تولیدی (Demo Fallback Anti-Pattern):**
   - در `paperToDigital.service.js`، توسعه‌دهنده برای اینکه در صورت خالی بودن فرم در دمو جدول زیبایی نمایش داده شود، در شرط `if (lines.length === 0)` سه دانش‌آموز و نمره خیالی هاردکد کرده بود (`SEC-AI-001`). در یک سیستم واقعی مدرسه، این کار باعث می‌شد اسکن یک برگه سفید منجر به ثبت دانش‌آموزان یا نمرات جعلی در پایگاه داده شود!
3. **ناهمگونی قرارداد بین فرانت‌اند و بک‌اند (Frontend-Backend Contract Drift):**
   - توسعه موازی فرانت‌اند و بک‌اند بدون اسکیمای مشترک (OpenAPI / Zod / TypeScript interfaces) باعث شده بود فرم ورود اولیا در فرانت‌اند فیلد `student_identifier` ارسال کند در حالی که بک‌اند دنبال `student_code` می‌گشت (`FW-AUTH-001`)، یا `message.service.js` تابعی (`ensureUserHasUsername`) را صدا بزند که هرگز در `usernameHelper.js` اکسپورت نشده بود (`SEC-DIR-001`).
4. **فقدان مرز تراکنشی در عملیات‌های چندمرحله‌ای (Missing Transaction Boundaries):**
   - بسیاری از سرویس‌ها چند دستور `INSERT` و `UPDATE` وابسته به هم (مانند تسویه قسط + کاهش مانده دفتر کل، یا بستن جلسه حضور و غیاب + درج غایبین) را به‌صورت متوالی و بدون `db.transaction()` اجرا می‌کردند که سیستم را در برابر خطاهای میانی و درخواست‌های همزمان (Race Conditions) آسیب‌پذیر می‌کرد.
5. **غفلت از کنترل دسترسی در کانال‌های غیر-HTTP (Real-Time / WebSocket Blind Spot):**
   - در حالی که مسیرهای REST دارای میان‌افزار `authenticate` و `authorize` بودند، در `socket.js` فرض شده بود که پس از اتصال اولیه، هر رخدادی که از کلاینت می‌آید (`screen_frame`, `live_video_frame`, `webrtc_signal`) مجاز است و حتی بررسی نمی‌شد که آیا نشست کاربر در حین کلاس باطل شده یا خیر.
6. **تعمیم بیش‌ازحد نقش‌های مدیریتی در محیط چندمستأجره (Multi-Tenant Scope Bleed):**
   - در مسیر دانلود پشتیبان دیتابیس (`/api/v1/system/backups`)، نقش‌های `manager` و `school_admin` (که مدیر یک مدرسه خاص هستند) هم‌ردیف `admin` زیرساخت قرار گرفته بودند (`SEC-DATA-001`)، در حالی که فایل `.db` حاوی اطلاعات تمام مدارس سامانه است.
7. **ضعف تست‌های اولیه در پوشش سناریوهای منفی و سوءاستفاده (Lack of Negative & Abuse-Case Testing):**
   - تست‌های اولیه فقط بررسی می‌کردند که «آیا مدیر می‌تواند پرداخت را تایید کند؟» اما تست نمی‌کردند که «آیا یک دانش‌آموز یا دبیر یا یک `authority` جعلی هم می‌تواند همان مسیر را صدا بزند؟».

---

## 11. چارچوب پیشنهادی پیشگیری از تکرار در آینده (Engineering Prevention Controls)

برای جلوگیری ساختاری از بازگشت این طبقه از خطاها در توسعه آینده EduConnect، کنترل‌های مهندسی زیر پیشنهاد و بخشی از آن‌ها در همین چرخه مستقر شدند:

1. **گیت‌های خودکار CI/CD (مستقرشده در اسکریپت `npm test`):**
   - اجرای اجباری `npm run lint:unscoped` پیش از اجرای تست‌های واحد برای مسدود کردن هرگونه کوئری بدون فیلتر تِنانسی (`school_id`) یا هرگونه دستور DDL در مسیر `src/modules/`.
2. **قانون «صفر داده ساختگی در سرویس‌های تولیدی» (Zero Fake Fallback Policy):**
   - ممنوعیت مطلق بازگرداندن داده‌های نمونه هاردکدشده در سرویس‌های بک‌اند (`src/modules/**`) هنگام خالی بودن ورودی یا خطای سرویس خارجی؛ داده‌های نمونه فقط مجاز به حضور در `src/database/seeds/` هستند.
3. **الزام تست منفی به ازای هر مسیر حساس (Mandatory Negative Security Test per Endpoint):**
   - هر مسیر تغییر وضعیت (به‌ویژه در ماژول‌های `finance`، `gradebook`، `auth` و `socket`) باید حداقل ۳ تست منفی داشته باشد:
     1. فراخوانی بدون توکن (`401`)
     2. فراخوانی با نقش غیرمجاز در همان مدرسه (`403`)
     3. فراخوانی با توکن معتبر از مدرسه دیگر (`403`/`404`)
4. **الزام `db.transaction` برای هر سرویس دارای بیش از یک عملیات نوشتن:**
   - در بازبینی کد (Code Review)، هر متدی که بیش از یک `insert` / `update` / `del` روی دیتابیس انجام می‌دهد باید الزاما درون `db.transaction(async (trx) => { ... })` قرار گیرد.
5. **اشتراک قراردادهای ورودی/خروجی (Shared API Schemas):**
   - تعریف اسکیمای اعتبارسنجی واحد (Joi/Zod) برای تمامی مسیرهای ورودی و همگام‌سازی خودکار کلاینت فرانت‌اند با آن.

---

## 12. وضعیت Git و توصیه برای بازبینی

### وضعیت فایل‌های تغییریافته در درخت کاری (`/app/applet`):
- **فایل‌های مستندات اصلی ممیزی (`audit/**`):** تمام ۵۱ فایل اصلی **بدون هیچ‌گونه تغییر (Untouched)**.
- **فایل گزارش نهایی ایجادشده:**
  - `audit/2026-11-11/ARGON_4_REVIEW_AND_REMEDIATION_REPORT.md`
- **فایل‌های کد و تست اصلاح‌شده (۳۳ فایل در مجموع ممیزی Argon 4 و اسکن عمیق صفر تا صد کدبیس):**
  1. `backend/src/app.js`
  2. `backend/src/config/database.js`
  3. `backend/src/database/seeds/001_school_data.js`
  4. `backend/src/middleware/auth.js`
  5. `backend/src/modules/ai/ai.routes.js`
  6. `backend/src/modules/ai/ai.service.js`
  7. `backend/src/modules/ai/paperToDigital.service.js`
  8. `backend/src/modules/analytics/analytics.routes.js`
  9. `backend/src/modules/assignments/assignment.service.js`
  10. `backend/src/modules/attendance/attendance.service.js`
  11. `backend/src/modules/auth/auth.controller.js`
  12. `backend/src/modules/auth/auth.service.js`
  13. `backend/src/modules/classes/class.service.js`
  14. `backend/src/modules/courses/course.routes.js`
  15. `backend/src/modules/discipline/discipline.routes.js`
  16. `backend/src/modules/feedback/feedback.routes.js`
  17. `backend/src/modules/finance/finance.routes.js`
  18. `backend/src/modules/gradebook/gradebook.routes.js`
  19. `backend/src/modules/messages/message.service.js`
  20. `backend/src/modules/notifications/notification.service.js`
  21. `backend/src/modules/quizzes/quiz.service.js`
  22. `backend/src/modules/school/school.routes.js`
  23. `backend/src/modules/school/sida.service.js`
  24. `backend/src/modules/tickets/ticket.routes.js`
  25. `backend/src/modules/upload/upload.routes.js`
  26. `backend/src/modules/videos/video.routes.js`
  27. `backend/src/services/dbMaintenance.js`
  28. `backend/src/socket.js`
  29. `backend/src/utils/auditLogger.js`
  30. `backend/src/utils/cryptoHelper.js`
  31. `backend/src/utils/usernameHelper.js`
  32. `backend/tests/security/extended-findings.test.js`
  33. `backend/tests/security/socket.test.js`
  34. `dev-server.js`
  35. `frontend/src/lib/api.js`
  36. `frontend/src/stores/authStore.js`

### خلاصه یافته‌های برطرف‌شده در فاز تکمیلی و اسکن صفر تا صد کدبیس:
1. **کوکی‌های `HttpOnly; SameSite=Lax` و احراز هویت دوگانه (`SEC-XSS-001`، `SEC-SOCKET-005`):** صدور و پذیرش کوکی‌های امن `accessToken` و `refreshToken` در تمام مسیرهای `/auth/*`، میان‌افزار `authenticate`، هندشیک Socket.IO و کلاینت فرانت‌اند (`credentials: 'include'`).
2. **رمزنگاری `AES-256-GCM` در استراحت و امضای دیجیتال لاگ‌های ممیزی (`PRIV-006`، `SEC-DATA-001`، `PRIV-015`، `DBA-004`):** پیاده‌سازی ماژول `cryptoHelper.js` (`encryptBuffer`/`decryptBuffer` با هدر `EDUCENC1` برای بکاپ‌ها و `encryptPII`/`decryptPII` برای فیلدهای حساس)، امضای `_integrity_hmac` (`HMAC-SHA256`) روی تمام رکوردهای `audit_logs` و پاک‌سازی خودکار توکن‌ها و لاگ‌های منقضی (`pruneExpiredTokensAndLogs`).
3. **تفکیک دقیق دسترسی دبیر به دانش‌آموزان کلاس‌های خودش و جداسازی نقش‌ها (`SEC-FIN-002`، `PRIV-012`):** محدودسازی `assertTeacherOfStudent` به دانش‌آموزان ثبت‌نام‌شده در کلاس‌های همان دبیر، مسدودسازی ثبت فیش یا آغاز پرداخت توسط دبیر (`403`)، و مسدودسازی دسترسی `financial_officer` به پرونده‌های مشاوره و انضباطی (`403`) در کنار اعطای مجوز ثبت جلسه مشاوره به نقش `counselor`.
4. **پویشگر بدافزار و سقف حجم پلکانی آپلود (`SEC-UPLOAD-004`، `SEC-UPLOAD-005`، `FW-UPLOAD-001`):** بررسی بایت‌های آغازین و محتوای فایل‌های آپلودی برای شناسایی و مسدودسازی امضای `EICAR`، باینری‌های اجرایی (`MZ`/`\x7FELF`) و اسکریپت‌های تزریقی (`<?php`، `<script`، `#!/`) همراه با سقف حجم تفکیک‌شده بر اساس نوع رسانه.
5. **بستن ۱۲ آسیب‌پذیری و باگ در اسکن صفر تا صد کل ماژول‌ها:**
   - محدودسازی `POST /api/v1/ai/generate` به کادر آموزشی (`admin`, `manager`, `teacher`, `counselor`)، بازگرداندن `400` برای مبحث خالی و اصلاح نام مدل به `gemini-2.5-flash`.
   - حذف نمره ساختگی (`19.85 - i * 0.15`) در `GET /api/v1/analytics/overview` و محاسبه معدل واقعی از جدول `gradebook_scores` به همراه حذف کامل کوئری‌های `N+1`.
   - افزودن تراکنش اتمیک (`db.transaction`) و پشتیبانی از انتخاب واحد مجدد پس از حذف واحد در `course.routes.js` و رفع `N+1`.
   - حذف افشای `submitted_by` در بازخوردهای ناشناس (`is_anonymous = true`) برای مدیران و محدودسازی رهگیری کد بازخورد در `feedback.routes.js`.
   - محافظت در برابر **CSV Formula Injection** (`=`, `+`, `-`, `@`) در خروجی اکسل/CSV نمرات سیدا (`sida.service.js`) و اجرای درون‌ریزی سیدا در تراکنش اتمیک با هش رمز عبور یکتا برای هر کاربر.
   - بستن راه دور زدن تایمر آزمون از طریق ارسال `auto_submitted: true` در `quiz.service.js` و رفع کوئری‌های `N+1` در `quiz.service.js` و `assignment.service.js`.
   - اعمال بررسی تعلق به مدرسه (`assertSameSchool`) در استریم ویدیو با نام فایل (`GET /api/v1/videos/stream/:filename`) و اعتبارسنجی دقیق هدر `Range` (`416`).
   - حداقل‌سازی داده‌های شخصی (`PRIV-002`) و مخفی‌سازی شماره تماس دبیران، اولیا و دانش‌آموزان برای فراخوانندگان دانش‌آموز/والد در `/school/members` و `/messages/directory` به همراه افزودن تراکنش اتمیک به عملیات گروه‌های پیام‌رسان و تیکت‌ها.

### توصیه برای ثبت کامیت و بازبینی (هنگام انتقال به مخزن Git اصلی):
پیشنهاد می‌شود تغییرات فوق در یک شاخه اختصاصی با نام `fix/argon-4-audit-remediation-2026-11-11` ثبت و پس از بررسی Pull Request در شاخه اصلی ادغام شوند.

