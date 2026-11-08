# EduConnect 🎓

پلتفرم یکپارچه مدیریت کلاس و ارتباط هوشمند معلمان، اولیا و دانش‌آموزان

## پیش‌نیازها

- Node.js 18+ (برای اجرای برنامه) — **Node.js 24.14+ برای اجرای تست‌ها** (`node:test` از `expectFailure` پشتیبانی می‌کند از نسخهٔ ۲۴.۱۴ به بعد)
- PostgreSQL 14+
- Redis (اختیاری — برای session/cache)

## راه‌اندازی

### ۱. پایگاه‌داده
```bash
# ساخت دیتابیس در PostgreSQL
createdb educonnect

# اجرای migration ها
cd backend
npm run migrate
```

### ۲. بک‌اند
```bash
cd backend
cp .env.example .env
# ویرایش .env و تنظیم اطلاعات دیتابیس
npm install
npm run dev
# → http://localhost:5000
```

### ۳. فرانت‌اند
```bash
cd frontend
npm install
npm run dev
# → http://localhost:3000
```

## تست‌ها / Tests

### تنها دستور تست / The single test command

```bash
cd backend
npm test
```

این دستور ابتدا lint رَچ‌شوندهٔ «کوئری‌های بدون محدوده» و سپس کل مجموعهٔ تست
`node:test` را اجرا می‌کند:

| بخش | مسیر | توضیح |
|------|-------|-------|
| Characterization smoke tests | `backend/tests/smoke/` | رفتار فعلی endpoint‌های اصلی — باید همیشه سبز بمانند |
| Fixture invariants | `backend/tests/fixtures/` | تضمین `users.school_id` و جداسازی دو مدرسه |
| Security regression tests | `backend/tests/security/` | تست‌های منفی برای یافته‌های گزارش امنیتی |
| CI lint tests | `backend/tests/ci/` | تست‌های خودِ lint |
| Helpers | `backend/tests/support/` | ابزارهای تست (توسط glob اجرا نمی‌شوند) |

هر تست در یک پروسهٔ مستقل اجرا می‌شود و پایگاه‌دادهٔ SQLite موقت و
پورتِ آزادِ مخصوص خودش را دارد؛ بنابراین تست‌ها روی دیتابیس توسعه یا
تولید اثری ندارند و می‌توانند موازی اجرا شوند.

### تست‌های «شکستِ مورد انتظار» / Expected-failing tests

تست‌های `backend/tests/security/` با تابع `expectFailure` نوشته شده‌اند
(معادل `test.failing` در `node:test`). هر تست **رفتار مطلوب** را assert
می‌کند و بنابراین **امروز باید شکست بخورد**. وقتی در فازهای بعدی
برنامهٔ اصلاح امنیتی یافتهٔ مربوطه برطرف شود، تست شروع به پاس شدن می‌کند و
runner آن را به‌عنوان خطا گزارش می‌دهد — این دقیقاً سیگنالی است که باید
wrapper `expectFailure` حذف شود.

نام هر تست شمارهٔ یافتهٔ گزارش امنیتی را دارد (مثلاً `[A13]`)، پس می‌توان
مستقیماً آن را با یافته متناظر در گزارش تطبیق داد.

> یافته‌هایی که هنوز اصلاح نشده‌اند عمداً «سبز» هستند: یعنی تست شکست خورده
> و `expectFailure` آن را موفق حساب کرده است. اگر `npm test` خطا داد، یعنی
> یک تستِ معمولی (smoke یا lint) شکست خورده است.

### Ratcheting lint

```bash
cd backend
npm run lint:unscoped
```

این lint کوئری‌هایی را پیدا می‌کند که فقط با کلید اصلی (`db('…').where({ id:
req.params.x })`) رکورد را می‌خوانند و آن را به مدرسهٔ درخواست‌کننده وصل
نمی‌کنند — شکل غالب آسیب‌پذیری در گزارش امنیتی. خطاهای موجود امروز در
`backend/scripts/unscoped-queries.baseline.json` ثبت شده‌اند؛ فقط خطای **جدید**
ساخت را fail می‌کند. پس از اصلاح یک مورد، baseline را سخت‌تر کنید:

```bash
node scripts/lint-unscoped-queries.js --update
```

## ساختار پروژه

```
educonnect/
├── backend/          # Express.js + PostgreSQL API
│   ├── src/
│   │   ├── config/       # تنظیمات DB, JWT, Redis
│   │   ├── middleware/   # Auth, Upload, Error Handler
│   │   ├── modules/      # Auth, Classes, Assignments, Quizzes, Attendance, Messages, Notifications
│   │   └── database/     # Migrations
│   ├── scripts/          # ابزارهای خطایابی و lint
│   ├── tests/            # مجموعهٔ تست خودکار (node:test)
│   └── package.json
│
├── frontend/         # Next.js PWA
│   ├── src/
│   │   ├── app/          # Pages (App Router)
│   │   ├── components/   # UI & Layout components
│   │   ├── lib/          # API client
│   │   └── stores/       # Zustand state management
│   └── package.json
│
└── README.md
```

## API Endpoints

| Module | Base URL |
|--------|----------|
| Auth | `/api/v1/auth` |
| Classes | `/api/v1/classes` |
| Assignments | `/api/v1/classes/:classId/assignments` |
| Quizzes | `/api/v1/classes/:classId/quizzes` |
| Attendance | `/api/v1/classes/:classId/attendance` |
| Messages | `/api/v1/messages` |
| Notifications | `/api/v1/notifications` |

## نقش‌ها

- **معلم (Teacher):** ساخت کلاس، تعیین تکلیف، کوییز، نمره‌دهی، حضور و غیاب
- **دانش‌آموز (Student):** عضویت در کلاس، ارسال تکلیف، شرکت در کوییز
- **والد (Parent):** مشاهده وضعیت فرزند، پیام‌رسانی با معلم

## لایسنس

MIT
