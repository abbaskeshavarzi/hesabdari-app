# راهنمای ساخت تابع RPC جدید — پروژه «نوبر»

این راهنما بر اساس الگوهایی نوشته شده که در ۱۰ migration قبلی این پروژه (خصوصاً `create_invoice_with_items`، `delete_invoice_and_restore_stock`، `get_dashboard_stats`) رعایت شده. هر بار خواستی یه تابع دیتابیسی جدید بسازی، این چک‌لیست رو دنبال کن.

## چه موقع به RPC نیاز داری (نه چند کوئری جدا از فرانت)؟
اگه عملیات شامل **چند مرحله‌ی به‌هم‌وابسته** است که باید یا همه با هم انجام بشن یا هیچ‌کدوم (مثلاً «ثبت فاکتور + کسر موجودی»)، حتماً RPC بساز. اگه فقط یه `select`/`insert` ساده‌ست، نیازی به RPC نیست — مستقیم از `supabase.from(...)` استفاده کن.

## ساختار استاندارد تابع

```sql
create or replace function نام_تابع(پارامترها)
returns نوع_بازگشتی
language plpgsql
security definer
set search_path = public
as $$
declare
  -- متغیرها
begin
  -- منطق اصلی
  -- در صورت خطا: raise exception 'پیام فارسی قابل‌فهم';
  return ...;
end;
$$;

revoke all on function نام_تابع(امضای دقیق پارامترها) from public;
grant execute on function نام_تابع(امضای دقیق پارامترها) to authenticated;
```

## چک‌لیست الزامی (به ترتیب)

1. **`security definer` + `set search_path = public`** — همیشه با هم بیان، هیچ‌وقت یکی بدون اون یکی. این جلوی حمله‌ی search_path hijacking رو می‌گیره.

2. **`revoke all ... from public` + `grant execute ... to authenticated`** — بدون این دو خط، هر کاربر ناشناس (anon) هم می‌تونه تابع رو صدا بزنه. این نکته اجباریه، نه اختیاری.

3. **پیام خطا با `RAISE EXCEPTION` به فارسی** — چون `lib/errorMessages.js` (تابع `friendlyError`) پیام‌های فارسی رو مستقیم به کاربر نشون می‌ده، خود متن خطای Postgres باید از اول فارسی و قابل‌فهم باشه. مثال:
   ```sql
   if v_stock < p_quantity then
     raise exception 'موجودی کالای % کافی نیست.', v_product_name;
   end if;
   ```

4. **عملیات چندمرحله‌ای همیشه در یه تراکنش ضمنی تابع** — چون کل تابع خودش یه تراکنشه، نیازی به `begin/commit` دستی نیست؛ فقط مطمئن شو همه‌ی `insert`/`update`/`delete`های به‌هم‌وابسته داخل همون تابع باشن (نه پخش‌شده بین چند فراخوانی جدا از فرانت).

5. **قفل ردیف در صورت رقابت هم‌زمان (مثل کسر موجودی)** — از `select ... for update` استفاده کن تا دو فاکتور هم‌زمان موجودی رو غلط کسر نکنن (همون الگویی که در `create_invoice_with_items` هست).

6. **اگه امضای تابع قبلاً وجود داشته و داری تغییرش می‌دی**، قبل از `create or replace function`، این خط رو اضافه کن:
   ```sql
   drop function if exists نام_تابع(امضای دقیق نسخه‌ی قبلی);
   ```
   وگرنه Supabase دو تابع هم‌نام با امضای متفاوت نگه می‌داره و کاربر با خطای «ambiguous function» مواجه می‌شه.

7. **اگه فقط خواندنی و بدون فیلتر خاصه (مثل `get_dashboard_stats`)**، لازم نیست پارامتر بگیره — ولی حتماً همون‌جا کامنت بذار که چرا `security definer` امنه (مثلاً: «چون داشبورد منطقاً خلاصه‌ی کل داده‌ست»).

8. **فایل migration جدید رو با شماره‌ی بعدی نام‌گذاری کن** (مثلاً `supabase-migration-11-...sql`) و در `project-context.md` به فهرست migrationها و فهرست RPCها اضافه‌ش کن.

## سمت فرانت‌اند (فراخوانی از React)
```javascript
const { data, error } = await supabase.rpc('نام_تابع', { p_param: value });
if (error) {
  setError(friendlyError(error, 'پیام پیش‌فرض فارسی'));
  return;
}
```
همیشه از `friendlyError` (در `lib/errorMessages.js`) استفاده کن، نه پیام خطای ثابت جداگونه — تا رفتار همه‌ی صفحات یکسان بمونه.

## چون این محیط (sandbox) به اینترنت/دیتابیس واقعی دسترسی نداره
تابع فقط با بازبینی دستی syntax تأیید می‌شه، نه اجرای واقعی. حتماً بعد از اجرای SQL در Supabase Dashboard، یه تست دستی واقعی (مثلاً ثبت یه رکورد آزمایشی) روی سایت زنده انجام بده تا مطمئن بشی تابع درست کار می‌کنه.
