# EduConnect 🎓

پلتفرم یکپارچه مدیریت کلاس و ارتباط هوشمند معلمان، اولیا و دانش‌آموزان

## پیش‌نیازها

- Node.js 18+
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

## ساختار پروژه

```
educonnect/
├── backend/          # Express.js + PostgreSQL API
│   ├── src/
│   │   ├── config/       # تنظیمات DB, JWT, Redis
│   │   ├── middleware/   # Auth, Upload, Error Handler
│   │   ├── modules/      # Auth, Classes, Assignments, Quizzes, Attendance, Messages, Notifications
│   │   └── database/     # Migrations
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
