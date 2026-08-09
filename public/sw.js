// سرویس‌ورکر ساده — فقط برای شرایط نصب‌پذیری PWA در اندروید/کروم لازم است
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request));
});
