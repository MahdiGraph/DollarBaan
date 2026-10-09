## دانلود

| سیستم‌عامل | فایل |
| --- | --- |
| ویندوز ۱۰ و ۱۱ (نصبی، پیشنهادی) | `DollarBaan-{{VERSION}}-windows-setup.exe` |
| ویندوز (بدون نصب) | `DollarBaan-{{VERSION}}-windows-portable.exe` |
| مک با تراشه اپل (M1 و جدیدتر) | `DollarBaan-{{VERSION}}-mac-arm64.dmg` |
| مک با پردازنده اینتل | `DollarBaan-{{VERSION}}-mac-x64.dmg` |
| لینوکس اوبونتو و دبیان | `DollarBaan-{{VERSION}}-linux-amd64.deb` |
| سایر توزیع‌های لینوکس | `DollarBaan-{{VERSION}}-linux-x86_64.AppImage` |
| اندروید ۷ و جدیدتر | `DollarBaan-{{VERSION}}-android.apk` |

نسخه‌های دسکتاپ و اندروید به سرور نیازی ندارند: همه داده‌ها فقط روی همان دستگاه ذخیره می‌شود و قیمت‌ها مستقیماً از [Iran Market](https://github.com/iran-market/iran-market.github.io) دریافت می‌شود. برای انتقال داده بین دستگاه‌ها از «تنظیمات ← پشتیبان‌گیری» فایل پشتیبان بگیرید و در دستگاه دیگر بازیابی کنید.

### اولین اجرا

- **ویندوز:** اگر پیام «Windows protected your PC» نمایش داده شد، روی «More info» و سپس «Run anyway» بزنید؛ این پیام به‌خاطر نداشتن امضای تجاری است.
- **مک:** فایل dmg را باز کنید و DollarBaan را به پوشه Applications بکشید. اگر بار اول پیام «Apple could not verify…» آمد، به System Settings ← Privacy & Security بروید و «Open Anyway» را بزنید؛ یا در ترمینال اجرا کنید: `xattr -dr com.apple.quarantine /Applications/DollarBaan.app`
- **لینوکس:** روی اوبونتو ۲۴.۰۴ و جدیدتر فایل deb را نصب کنید. برای AppImage ابتدا `chmod +x` بزنید و سپس اجرا کنید.
- **اندروید:** هنگام نصب، اجازه «نصب برنامه‌های ناشناس» را به مرورگر یا مدیر فایل بدهید. نسخه‌های بعدی روی همین نصب به‌روزرسانی می‌شوند و داده‌ها حفظ می‌شود.

برای اطمینان از سالم بودن فایل‌ها، هش آن‌ها را با `SHA256SUMS.txt` مقایسه کنید.
