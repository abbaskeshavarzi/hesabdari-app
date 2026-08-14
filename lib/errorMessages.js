// این فایل خطاهای خام Supabase/Postgres را به پیام‌های فارسی قابل‌فهم برای کاربر تبدیل می‌کند.

const CODE_MESSAGES = {
  '23505': 'این مورد قبلاً ثبت شده و تکراری است.',
  '23503': 'این مورد به رکورد دیگری (مثل فاکتور یا کالا) وصل است و امکان حذف یا تغییرش نیست.',
  '23502': 'یکی از فیلدهای الزامی خالی مانده است.',
  '42501': 'دسترسی لازم برای انجام این کار را ندارید. لطفاً دوباره وارد حساب شوید.',
  '22P02': 'یکی از مقادیر واردشده معتبر نیست.',
};

function hasPersian(text) {
  return /[\u0600-\u06FF]/.test(text || '');
}

/**
 * یک خطای Supabase (یا هر خطای JS دیگری) را می‌گیرد و پیام فارسیِ قابل‌نمایش برمی‌گرداند.
 * @param {any} error - آبجکت خطا (از supabase یا catch)
 * @param {string} fallback - پیام پیش‌فرض در صورت نامشخص بودن نوع خطا
 */
export function friendlyError(error, fallback = 'خطایی رخ داد. لطفاً دوباره تلاش کنید.') {
  if (!error) return fallback;

  // خطای شبکه/عدم اتصال
  if (error.message === 'Failed to fetch' || error.name === 'TypeError') {
    return 'ارتباط با سرور برقرار نشد. اتصال اینترنت گوشی را بررسی کنید.';
  }

  if (error.code && CODE_MESSAGES[error.code]) {
    return CODE_MESSAGES[error.code];
  }

  // پیام‌های سفارشی که خودمان در توابع دیتابیسی (RPC) با RAISE EXCEPTION به فارسی نوشته‌ایم
  if (error.message && hasPersian(error.message)) {
    // اگر پیام پسوند فنی postgres داشت (مثل "CONTEXT:")، فقط خط اول را نگه می‌داریم
    return error.message.split('\n')[0];
  }

  return fallback;
}
