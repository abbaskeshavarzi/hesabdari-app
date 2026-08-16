# Runbook — رفع مشکلات رایج Supabase در پروژه «نوبر»

مشکلاتی که ممکنه با این پروژه (Next.js + Supabase + GitHub Pages) پیش بیاد و راه‌حل قدم‌به‌قدمش.

---

## ۱. بعد از لاگین، صفحه سفید می‌مونه یا مستقیم به `/login` برمی‌گرده

**علت محتمل:** `.env.local` (یا Secrets گیت‌هاب) مقدار `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY` نداره یا اشتباهه.

**رفع:**
1. توی Codespace، فایل `.env.local` رو باز کن و مطمئن شو هر دو مقدار درست از Supabase Dashboard → Settings → API کپی شدن.
2. برای سایت زنده (GitHub Pages)، این دو مقدار باید توی **GitHub repo → Settings → Secrets and variables → Actions** هم ثبت شده باشن، وگرنه build با مقدار خالی ساخته می‌شه.
3. بعد از تغییر Secrets، باید یه `push` جدید بزنی (یا workflow رو دستی از تب Actions دوباره اجرا کنی) تا build جدید با مقدار درست ساخته بشه.

---

## ۲. خطای «۴۲۵۰۱ — دسترسی لازم را ندارید» یا داده هیچ‌جا نشون داده نمی‌شه

**علت محتمل:** مشکل RLS (Row Level Security) — یا policy درست تعریف نشده، یا session کاربر منقضی شده.

**رفع:**
1. مطمئن شو کاربر واقعاً لاگینه (Layout.js این رو چک می‌کنه؛ اگه صفحه خالیه یا ریدایرکت شد، یعنی session نداره — دوباره لاگین کن).
2. توی Supabase Dashboard → Authentication → Users چک کن که حساب کاربر هنوز فعاله و حذف نشده.
3. توی Supabase Dashboard → Table Editor → (نام جدول) → RLS Policies، مطمئن شو policy برای `authenticated` وجود داره.
4. اگه یه RPC جدید اضافه کردی و این خطا رو گرفتی، احتمالاً خط `grant execute on function ... to authenticated` رو فراموش کردی — دوباره SQL migration رو چک کن.

---

## ۳. خطای «function ... is not unique» یا «ambiguous function»

**علت:** یه تابع RPC با همون اسم ولی امضای پارامتر متفاوت قبلاً وجود داشته و migration جدید فقط `create or replace` زده، نه `drop function if exists`.

**رفع:**
1. توی Supabase Dashboard → SQL Editor این کوئری رو بزن تا همه‌ی نسخه‌های تابع رو ببینی:
   ```sql
   select proname, pg_get_function_identity_arguments(oid)
   from pg_proc
   where proname = 'نام_تابع';
   ```
2. برای هر نسخه‌ی اضافه، این رو اجرا کن (با امضای دقیق همون ردیف):
   ```sql
   drop function نام_تابع(امضای دقیق);
   ```
3. بعد دوباره `create or replace function` نسخه‌ی درست رو اجرا کن.

---

## ۴. بعد از push و build موفق، سایت زنده هنوز نسخه‌ی قدیمی رو نشون می‌ده

**علت:** کش سرویس‌ورکر PWA (`public/sw.js` با استراتژی stale-while-revalidate).

**رفع:**
1. تب مرورگر رو **کامل ببند** (نه فقط رفرش) و دوباره باز کن.
2. اگه هنوز قدیمیه: تنظیمات مرورگر → Site settings → پاک کردن داده‌های سایت، یا حالت ناشناس رو برای تست امتحان کن.
3. مطمئن شو توی تب **Actions** گیت‌هاب واقعاً آخرین build سبز و کامل شده (نه در حال اجرا یا failed).

---

## ۵. صفحات با basePath اشتباه لینک می‌شن یا ۴۰۴ می‌دن (فقط روی سایت زنده، نه لوکال)

**علت:** یه مسیر یا لینک جایی توی کد هاردکد شده (بدون `NEXT_PUBLIC_BASE_PATH`)، در حالی که سایت زیر `/hesabdari-app/` منتشر می‌شه.

**رفع:** اون فایل خاص رو پیدا کن و مسیر مطلق رو با `process.env.NEXT_PUBLIC_BASE_PATH` جایگزین کن (شبیه الگوی بقیه‌ی فایل‌های پروژه). لینک‌های `next/link` با `href` نسبی نیازی به این کار ندارن، فقط `<img src="/...">`، fetch مستقیم به فایل عمومی، یا service worker باید هماهنگ باشن.

---

## ۶. خطای `Failed to fetch` یا صفحه هیچ داده‌ای نشون نمی‌ده، بدون پیام خطای مشخص

**علت محتمل:** قطعی اینترنت گوشی، یا Supabase project موقتاً pause شده (پلن رایگان بعد از مدت عدم استفاده pause می‌شه).

**رفع:**
1. اتصال اینترنت گوشی رو چک کن.
2. توی Supabase Dashboard چک کن پروژه «Active» باشه؛ اگه «Paused» بود، دکمه‌ی Restore/Resume رو بزن (چند دقیقه طول می‌کشه).

---

## ۷. Migration SQL با خطا اجرا نمی‌شه

**علت رایج:** ترتیب اجرا رعایت نشده، یا جدول/تابعی که migration بهش وابسته‌ست هنوز ساخته نشده.

**رفع:** migrationها رو **دقیقاً به ترتیب شماره** اجرا کن (از `supabase-schema.sql` شروع تا آخرین شماره). اگه یه migration رو رد کردی، اول اون رو جداگانه اجرا کن.

---

## نکته‌ی کلی برای هر مشکل ناشناخته
1. متن دقیق پیام خطا (از Supabase Dashboard → Logs، یا کنسول مرورگر، یا تب Actions) رو برام کپی کن.
2. بگو دقیقاً کدوم صفحه/عملیات باعثش شده.
3. با این دو تا اطلاعات، معمولاً می‌شه سریع مشکل رو پیدا کرد.
