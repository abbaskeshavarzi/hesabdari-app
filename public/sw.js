// سرویس‌ورکر برای کارکرد آفلاین: صفحاتی که قبلاً در همین گوشی باز شده‌اند،
// حتی بدون اینترنت هم قابل مشاهده خواهند بود (چون در حافظه‌ی مرورگر کش می‌شوند).
// توجه: خواندن/ثبت اطلاعات جدید (که از طریق Supabase انجام می‌شود) همچنان به اینترنت نیاز دارد؛
// این کش فقط برای نمایش پوسته و صفحات قبلاً بازدیدشده‌ی خود اپ است.

const CACHE_NAME = 'nobar-cache-v2';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // فقط فایل‌های خود همین سایت کش می‌شوند؛ درخواست‌های Supabase (داده‌های زنده) کش نمی‌شوند
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(req);

      const networkFetch = fetch(req)
        .then((res) => {
          if (res && res.ok) cache.put(req, res.clone());
          return res;
        })
        .catch(() => null);

      // اگه نسخه‌ی کش‌شده داریم، فوری همونو نشون بده و در پس‌زمینه به‌روزش کن (سریع‌تر و آفلاین‌سازگار)
      if (cached) {
        event.waitUntil(networkFetch);
        return cached;
      }

      const netRes = await networkFetch;
      if (netRes) return netRes;

      // نه کش داریم، نه اینترنت — برای صفحات، یک پیام ساده‌ی فارسی نشون بده
      if (req.mode === 'navigate') {
        return new Response(
          `<!DOCTYPE html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
          <body style="font-family:Tahoma,sans-serif;text-align:center;padding:60px 20px;color:#333;background:#EDEFEF">
          <h2>اتصال اینترنت برقرار نیست</h2>
          <p>این صفحه قبلاً در این گوشی باز نشده تا بتوان آفلاین نشانش داد. لطفاً اینترنت را وصل کنید و دوباره امتحان کنید.</p>
          </body></html>`,
          { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
        );
      }
      return new Response('', { status: 504, statusText: 'آفلاین' });
    })
  );
});
