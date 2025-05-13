# دلاربان | سیستم پایش ارزش دارایی‌های فیزیکی

<p align="center">
  <img src="https://img.shields.io/badge/Version-1.0.0-brightgreen?logo=v&logoColor=white" alt="Version">
  <img src="https://img.shields.io/badge/Node.js-16.x-blue?logo=node.js&logoColor=white" alt="Node.js">
  <img src="https://img.shields.io/badge/License-MIT-success?logo=opensourceinitiative&logoColor=white" alt="License">
  <img src="https://img.shields.io/github/stars/MahdiGraph/DollarBaan?style=social" alt="Stars">
  <img src="https://img.shields.io/github/forks/MahdiGraph/DollarBaan?style=social" alt="Forks">
</p>

<p align="center">
  <img src="public/assets/img/dashboard.jpg" alt="داشبورد دلاربان" width="800">
</p>

## 📋 معرفی

**دلاربان** یک ابزار متن‌باز برای پایش و مدیریت ارزش دارایی‌های فیزیکی است. با این برنامه می‌توانید سرمایه‌گذاری‌های خود در انواع ارز، طلا، سکه و رمزارز را ثبت کرده و ارزش آن‌ها را به صورت لحظه‌ای پایش کنید.

این برنامه به طور خاص برای کاربران فارسی‌زبان طراحی شده و با بهره‌گیری از API نوسان، اطلاعات قیمت دارایی‌های مختلف را به صورت خودکار به‌روزرسانی می‌کند.

با دلاربان می‌توانید:

- سرمایه‌گذاری‌های خود را در انواع دارایی ثبت کنید
- از نمودارهای تحلیلی برای بررسی روند قیمت و ارزش پورتفوی استفاده کنید
- سود و زیان سرمایه‌گذاری‌های خود را محاسبه کنید
- از قیمت‌های به‌روز بازار بهره‌مند شوید

## ✨ ویژگی‌های اصلی

- **رابط کاربری Glass Morphism**: رابط زیبا با قابلیت تغییر تم روشن/تاریک
- **به‌روزرسانی قیمت‌ها**: دریافت خودکار قیمت‌های به‌روز از API نوسان
- **نمودارهای تحلیلی**: نمایش روند تغییرات قیمت و ارزش سرمایه‌گذاری‌ها
- **تقویم شمسی**: کار با تاریخ‌های هجری شمسی
- **پشتیبانی از SQLite و MySQL**: انعطاف‌پذیری در انتخاب پایگاه داده
- **مدیریت کش**: بهینه‌سازی عملکرد و کاهش درخواست‌های API
- **رابط کاربری واکنش‌گرا**: طراحی متناسب با دسکتاپ و موبایل

## 🔧 پیش‌نیازها
<div dir="rtl">
- **Node.js** <sub>(الزامی)</sub>: نسخه 16.x یا بالاتر
- **کلید وب سرویس نوسان** <sub>(الزامی)</sub>: برای دریافت از [Navasan.tech](https://navasan.tech) ثبت‌نام کنید (دارای پلن رایگان)
- **پایگاه داده** <sub>(اختیاری)</sub>:
  - **SQLite** <sub>(پیشفرض)</sub>: به صورت پیش‌فرض (بدون نیاز به نصب اضافی)
  - **MySQL/MariaDB** <sub>(اختیاری)</sub>: در صورت تمایل به استفاده
</div>
## 💻 نصب و راه‌اندازی

### دانلود و نصب وابستگی‌ها
<div dir="ltr">```bash
# کلون کردن مخزن
git clone https://github.com/MahdiGraph/DollarBaan.git
cd DollarBaan

# نصب وابستگی‌ها
npm install
```</div>

### تنظیم فایل .env

فایل `.env.template` را به `.env` تغییر نام دهید و API Key خود را در آن قرار دهید:
<div dir="ltr">```bash
# کپی فایل نمونه
cp .env.template .env

# ویرایش فایل
nano .env
```</div>
حداقل، شما باید مقدار `API_KEY` را تنظیم کنید. سایر تنظیمات پیش‌فرض برای شروع کار مناسب هستند.

### انتخاب پایگاه داده

دلاربان به طور پیش‌فرض از SQLite استفاده می‌کند که بدون نیاز به تنظیمات اضافی کار می‌کند. برای استفاده از MySQL، تنظیمات مربوطه را در فایل `.env` تغییر دهید.

### اجرای برنامه
<div dir="ltr">```bash
# اجرای مستقیم در محیط development
npm run dev

# یا استفاده از PM2 در محیط production
npm install -g pm2
pm2 start ecosystem.config.js
```

پس از اجرا، برنامه روی پورت 3000 در دسترس خواهد بود:

```
http://localhost:3000
```</div>

## 🚀 مدیریت با PM2

برای مدیریت برنامه در محیط production، از دستورات PM2 استفاده کنید:
<div dir="ltr">```bash
# مشاهده وضعیت
pm2 status

# راه‌اندازی مجدد
pm2 restart DollarBaan

# توقف برنامه
pm2 stop DollarBaan

# حذف از لیست PM2
pm2 delete DollarBaan

# تنظیم اجرای خودکار در هنگام راه‌اندازی سیستم
pm2 startup
pm2 save
```</div>

## 📊 کاربردها

دلاربان برای این گروه‌ها مناسب است:

- **سرمایه‌گذاران فردی**: ثبت و پیگیری سرمایه‌گذاری‌های شخصی در ارز، طلا و رمزارز
- **مشاوران مالی**: کمک به ردیابی و مدیریت سبد دارایی‌های مشتریان
- **تحلیلگران بازار**: بررسی روند قیمت‌ها و عملکرد دارایی‌های مختلف
- **کسب‌وکارهای کوچک**: مدیریت دارایی‌های شرکت و ردیابی ارزش آن‌ها

## 🔑 اهمیت API Key نوسان

برای دریافت قیمت‌های به‌روز از سرویس نوسان، نیاز به API Key دارید:

1. در [navasan.tech](https://navasan.tech) ثبت‌نام کنید
2. یک API Key دریافت کنید (پلن رایگان کافی است)
3. کلید را در فایل `.env` در بخش `API_KEY` قرار دهید

## 🖥️ نحوه استفاده

1. وارد آدرس `http://localhost:3000` شوید
2. با نام کاربری و رمز عبور تعیین شده در فایل `.env` وارد شوید (پیش‌فرض: admin/changeit)
3. در داشبورد اصلی:
   - سرمایه‌گذاری جدید اضافه کنید
   - آخرین قیمت‌ها را مشاهده کنید
   - نمودارها و گزارش‌های تحلیلی را بررسی کنید
   - قیمت‌ها را به‌روزرسانی کنید

## 🔄 رفع اشکال

در صورت بروز مشکل، موارد زیر را بررسی کنید:

- **کلید وب سرویس**: اطمینان از صحت و اعتبار API Key نوسان
- **دسترسی‌های فایل**: بررسی دسترسی‌های نوشتن برای پوشه‌های `logs` و `sessions`
- **وابستگی‌ها**: اطمینان از نصب کامل وابستگی‌ها
- **تنظیمات لاگ**: تغییر `LOG_LEVEL` به `debug` برای مشاهده جزئیات بیشتر

## 🔧 فناوری‌های استفاده شده

- **بک‌اند**: Node.js، Express، Sequelize
- **پایگاه داده**: SQLite (پیش‌فرض)، MySQL (اختیاری)
- **فرانت‌اند**: JavaScript، Chart.js، Bootstrap
- **رابط کاربری**: Glass Morphism
- **تاریخ شمسی**: moment-jalaali
- **پردازش زمانبندی شده**: node-cron
- **مدیریت پروسه**: PM2
- **فونت فارسی**: وزیرمتن

## 🙏 قدردانی

- با تشکر از [Navasan.tech](https://navasan.tech) برای ارائه API قیمت‌های لحظه‌ای
- با تشکر ویژه از [Saber Rastikerdar](https://github.com/rastikerdar) برای فونت [وزیرمتن](https://github.com/rastikerdar/vazirmatn)

## 📄 مجوز استفاده

این پروژه تحت مجوز MIT منتشر شده است. برای جزئیات بیشتر به فایل LICENSE مراجعه کنید.

## 🤝 مشارکت

از مشارکت شما در توسعه این پروژه استقبال می‌کنیم! لطفاً برای هرگونه پیشنهاد یا گزارش مشکل، یک issue جدید در [مخزن گیت‌هاب](https://github.com/MahdiGraph/DollarBaan) ایجاد کنید.

---

## English Summary

**DollarBaan** is an open-source financial asset tracker that helps you monitor investments in foreign currencies, gold, coins, and cryptocurrencies. With real-time price updates from Navasan API, it provides analytical charts and performance metrics for your portfolio.

The application features a responsive Glass Morphism UI with dark/light themes, full Persian (Jalali) calendar support, and works with both SQLite and MySQL databases.

Licensed under MIT license. Contributions are welcome!

---

<p align="center">
  <strong>دلاربان</strong> | پایش لحظه‌ای دارایی فیزیکی شما
</p>
