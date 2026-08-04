// نمایش تاریخ به تقویم شمسی با اعداد فارسی، در همه‌جای اپ استفاده می‌شود
export function formatJalali(dateStr) {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleDateString('fa-IR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch (e) {
    return dateStr;
  }
}

// نسخه کوتاه‌تر برای جدول‌ها (مثلاً ۱۴۰۴/۵/۱۴)
export function formatJalaliShort(dateStr) {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleDateString('fa-IR');
  } catch (e) {
    return dateStr;
  }
}
