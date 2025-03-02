# دلاربان | سیستم پایش ارزش دارایی‌های فیزیکی

<p align="center">
  <img src="https://img.shields.io/badge/Version-1.0.0-brightgreen?logo=v&logoColor=white" alt="Version">
  <img src="https://img.shields.io/badge/Node.js-16.x-blue?logo=node.js&logoColor=white" alt="Node.js">
  <img src="https://img.shields.io/badge/Language-Persian-orange?logo=javascript&logoColor=white" alt="Language">
  <img src="https://img.shields.io/badge/License-MIT-success?logo=opensourceinitiative&logoColor=white" alt="License">
</p>

<p align="center">
  <img src="public/assets/img/dashboard.jpg" alt="داشبورد دلاربان" width="800">
</p>

## 📋 معرفی 

**دلاربان** یک سیستم مدیریت و پایش ارزش دارایی‌های فیزیکی است که به شما امکان می‌دهد سرمایه‌گذاری‌های خود در انواع دارایی‌ها (ارز، طلا، سکه، رمزارز و...) را ثبت کرده و ارزش آن‌ها را به صورت لحظه‌ای رصد کنید.

این پروژه به صورت **کاملاً متن‌باز** تحت لایسنس MIT منتشر شده و استفاده، توسعه و انتشار مجدد آن برای همه آزاد است.

با دلاربان می‌توانید:
- سرمایه‌گذاری‌های خود را در انواع مختلف دارایی ثبت و مدیریت کنید
- از نمودارهای تحلیلی برای بررسی روند ارزش دارایی‌ها استفاده کنید
- سود و زیان سرمایه‌گذاری‌های خود را به صورت دقیق محاسبه و مشاهده کنید
- به صورت خودکار از به‌روزترین قیمت‌های بازار بهره‌مند شوید

## ✨ ویژگی‌های اصلی

- **رابط کاربری زیبا و شیشه‌ای**: طراحی Glass Morphism با قابلیت تغییر تم روشن/تاریک
- **بروزرسانی خودکار قیمت‌ها**: دریافت قیمت‌های به‌روز از API نوسان
- **نمودارهای تحلیلی**: نمایش روند تغییرات قیمت و ارزش پورتفولیو
- **تقویم شمسی**: کار با تاریخ‌های هجری شمسی
- **انعطاف‌پذیری در ذخیره‌سازی**: پشتیبانی از SQLite و MySQL (پیش‌فرض: SQLite)
- **بهینه‌سازی خودکار**: پاکسازی فایل‌های session قدیمی بصورت زمانبندی شده
- **کش‌گذاری هوشمند**: افزایش سرعت بارگذاری و کاهش مصرف API
- **تجربه کاربری روان**: رابط کاربری واکنش‌گرا و مناسب برای دسکتاپ و موبایل

## 🔧 پیش‌نیازها

- **Node.js**: نسخه 16.x یا بالاتر
- **پایگاه داده**: 
  - **SQLite**: نیازی به نصب جداگانه نیست، به صورت پیش‌فرض استفاده می‌شود
  - **MySQL/MariaDB** (اختیاری): نسخه 5.7 یا بالاتر برای استفاده اختیاری
- **API Key سرویس Navasan**: برای دریافت از [Navasan.tech](https://navasan.tech) ثبت‌نام کنید (دارای پلن رایگان)

## 💻 نصب و راه‌اندازی 

### دانلود و نصب وابستگی‌ها

```bash
# کلون کردن مخزن
git clone https://github.com/MahdiGraph/DollarBaan.git
cd DollarBaan

# نصب وابستگی‌ها
npm install
```

### تنظیم فایل .env

فایل `.env.template` را به `.env` تغییر نام دهید و اطلاعات مورد نیاز را در آن وارد کنید:

```bash
# کپی فایل نمونه
cp .env.template .env

# ویرایش فایل با ویرایشگر دلخواه
nano .env  # یا هر ویرایشگر دیگری
```

حداقل، شما باید `API_KEY` را با کلید API خود از Navasan تنظیم کنید. سایر تنظیمات پیش‌فرض برای شروع کار مناسب هستند.

### تنظیم نوع پایگاه داده

دلاربان به طور پیش‌فرض از SQLite استفاده می‌کند و نیازی به تنظیم خاصی ندارد. در صورت تمایل به استفاده از MySQL:

```
DB_DIALECT=mysql
DB_NAME=dollarbaan
DB_USER=your_db_user
DB_PASSWORD=your_db_password
DB_HOST=localhost
DB_PORT=3306
```

### اجرای برنامه

#### محیط Development

```bash
# اجرای مستقیم با Node.js
node app.js
```

#### محیط Production با PM2

```bash
# نصب PM2 (در صورت نیاز)
npm install -g pm2

# اجرای برنامه با PM2
npm start
# یا مستقیم
pm2 start ecosystem.config.js
```

پس از اجرا، برنامه روی پورت تعیین شده (پیش‌فرض: 3000) در دسترس خواهد بود:

```
http://localhost:3000
```

## 🚀 مدیریت با PM2

[PM2](https://pm2.keymetrics.io/) یک مدیر پروسه برای برنامه‌های Node.js است که امکان اجرای پایدار و مدیریت راحت‌تر اپلیکیشن را فراهم می‌کند:

```bash
# مشاهده وضعیت برنامه‌ها
pm2 status

# راه‌اندازی مجدد برنامه
pm2 restart DollarBaan

# توقف برنامه
pm2 stop DollarBaan

# حذف برنامه از لیست PM2
pm2 delete DollarBaan

# تنظیم اجرای خودکار در زمان راه‌اندازی سیستم
pm2 startup
pm2 save
```

دستور `pm2 startup` اسکریپت‌های لازم برای اجرای خودکار PM2 در زمان بوت سیستم را ایجاد می‌کند. بعد از آن، دستور `pm2 save` لیست فعلی برنامه‌های در حال اجرا را ذخیره می‌کند تا هنگام راه‌اندازی مجدد سیستم، PM2 به صورت خودکار آن‌ها را اجرا کند.

## 🔑 اهمیت API Key نوسان

**توجه مهم**: این برنامه از API سرویس [Navasan.tech](https://navasan.tech) برای دریافت قیمت‌های لحظه‌ای ارز، طلا، سکه و رمزارز استفاده می‌کند. برای استفاده از دلاربان:

1. در سایت [navasan.tech](https://navasan.tech) ثبت‌نام کنید
2. یک API Key دریافت کنید (پلن رایگان کافی است)
3. کلید را در فایل `.env` در بخش `API_KEY` قرار دهید

بدون API Key معتبر، امکان دریافت قیمت‌های به‌روز وجود نخواهد داشت.

## 📁 ساختار پروژه

```
dollarbaan/
├── app.js                 # فایل اصلی اپلیکیشن
├── ecosystem.config.js    # تنظیمات PM2
├── package.json           # وابستگی‌های پروژه
├── database.sqlite        # پایگاه داده SQLite (ایجاد می‌شود)
├── .env.template          # نمونه فایل تنظیمات محیطی
├── .env                   # فایل تنظیمات محیطی (باید ایجاد شود)
├── .gitignore             # فایل‌های نادیده گرفته شده توسط git
├── LICENSE                # فایل مجوز MIT
├── logs/                  # پوشه لاگ‌ها
│   └── .gitkeep           # برای حفظ پوشه خالی در git
├── sessions/              # پوشه ذخیره نشست‌ها
│   └── .gitkeep           # برای حفظ پوشه خالی در git
└── public/                # فایل‌های استاتیک و فرانت‌اند
    ├── index.html         # صفحه اصلی
    ├── login.html         # صفحه ورود
    └── assets/            # استایل‌ها و فونت‌ها
        ├── style.css      # استایل‌های اصلی
        ├── img/           # تصاویر
        └── fonts/         # فونت‌ها
```

## 🖥️ نحوه استفاده

1. به آدرس `http://localhost:3000` (یا هر پورت تنظیم شده) بروید
2. با نام کاربری و رمز عبور تعیین شده در فایل `.env` وارد شوید (پیش‌فرض: admin/changeit)
3. از منوی اصلی می‌توانید:
   - سرمایه‌گذاری جدید اضافه کنید
   - آخرین قیمت‌ها را مشاهده کنید
   - گزارش‌های تحلیلی و نمودارها را بررسی کنید
   - قیمت‌ها را به صورت دستی بروزرسانی کنید
   - کش سیستم را پاک کنید

## 🔧 فایل پیکربندی .env

```
# ===============================================
# Database Configuration (Supports MySQL and SQLite)
# ===============================================
DB_NAME=dollarbaan              # Database name
DB_USER=root                    # Database username (for MySQL)
DB_PASSWORD=                    # Database password (for MySQL)
DB_HOST=localhost               # Database host (usually localhost for local execution)
DB_PORT=3306                    # MySQL port (for MySQL)
DB_DIALECT=sqlite               # Database type: allowed values "mysql" or "sqlite"
SQLITE_PATH=./database.sqlite   # Path to SQLite database file (used if DB_DIALECT is sqlite)

# ===============================================
# Authentication Configuration
# ===============================================
AUTH_USERNAME=admin               # Application login username
AUTH_PASSWORD=changeit            # Application login password
SESSION_SECRET=dollarbaan_secret  # Session encryption key (change to a random secure value)
SESSION_MAX_AGE=604800000         # Session validity duration in milliseconds (604800000 = 7 days)
SESSION_FILES_MAX_AGE=604800000   # How long to keep session files before cleanup (604800000 = 7 days)

# ===============================================
# Navasan API Configuration
# ===============================================
API_KEY=YOUR_NAVASAN_API_KEY      # Navasan API key for price retrieval

# ===============================================
# Server Configuration
# ===============================================
PORT=3000                          # Server port
NODE_ENV=production                # Environment (production or development)

# ===============================================
# Security Settings
# ===============================================
ALLOW_INSECURE_COOKIES=true        # Set to 'true' to allow login over HTTP in production (useful for development)
TRUST_PROXY=true                   # Set to 'true' if behind a reverse proxy that handles HTTPS

# ===============================================
# Price Update Configuration
# ===============================================
UPDATE_CRONJOB="0 0 * * *"         # Automatic price update schedule (daily at 00:00)

# ===============================================
# Chart Configuration
# ===============================================
SUMMARY_CHART_MONTHS=6             # Number of months for summary chart display
INVESTMENT_CHART_MONTHS=6          # Number of months for investment charts display
MAX_CHART_POINTS=52                # Maximum number of points in charts (for performance optimization)

# ===============================================
# Logging Configuration
# ===============================================
LOG_LEVEL=error                     # Logging level (allowed values: debug, info, warn, error)
LOG_DIR=./logs                      # Directory for storing log files

# ===============================================
# Navasan API Settings
# ===============================================
NAVASAN_BASE_URL=https://api.navasan.tech  # Base URL for Navasan API
NAVASAN_TIMEOUT=120000                     # API response timeout in milliseconds
NAVASAN_MAX_RETRIES=3                      # Maximum number of retry attempts on error
```

## 🔄 رفع اشکال

در صورت بروز مشکل، موارد زیر را بررسی کنید:

- **API Key**: اطمینان از معتبر بودن API Key نوسان
- **دسترسی‌های فایل**: بررسی دسترسی‌های نوشتن برای پوشه‌های `logs` و `sessions` و فایل دیتابیس SQLite
- **وابستگی‌ها**: اطمینان از نصب تمامی وابستگی‌ها با `npm install`
- **سطح لاگ**: تنظیم `LOG_LEVEL` به `debug` برای دریافت جزئیات بیشتر در لاگ‌ها
- **پورت**: اطمینان از آزاد بودن پورت تعیین شده

## 🔧 فناوری‌های استفاده شده

- **بک‌اند**: Node.js، Express، Sequelize
- **پایگاه داده**: SQLite (پیش‌فرض)، MySQL/MariaDB (اختیاری)
- **فرانت‌اند**: JavaScript، Chart.js، Bootstrap
- **UI/UX**: Glass Morphism، CSS3، HTML5
- **تاریخ شمسی**: moment-jalaali
- **زمان‌بندی**: node-cron
- **مدیریت پروسه**: PM2
- **فونت**: [وزیرمتن](https://github.com/rastikerdar/vazirmatn)

## 🙏 قدردانی

- با تشکر از [Navasan.tech](https://navasan.tech) برای ارائه API قیمت‌های لحظه‌ای
- با تشکر ویژه از [Saber Rastikerdar](https://github.com/rastikerdar) و تیم توسعه‌دهنده [Vazirmatn](https://github.com/rastikerdar/vazirmatn) برای توسعه این فونت زیبا و متن‌باز فارسی که در این پروژه استفاده شده است

## 📄 مجوز استفاده

این پروژه تحت مجوز MIT منتشر شده است. برای اطلاعات بیشتر به فایل LICENSE مراجعه کنید.

## 🤝 مشارکت

از مشارکت شما در توسعه این پروژه استقبال می‌کنیم! لطفاً برای هرگونه پیشنهاد یا گزارش مشکل، یک issue جدید در [مخزن گیت‌هاب](https://github.com/MahdiGraph/DollarBaan) ایجاد کنید یا pull request بفرستید.

---

<p align="center">
  <strong>دلاربان</strong> | پایش لحظه‌ای دارایی فیزیکی شما
</p>