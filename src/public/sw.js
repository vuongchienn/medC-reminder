const CACHE_NAME = 'medreminder-cache-v3';
const ASSETS = ['/', '/css/styles.css', '/js/app.js', '/manifest.json', '/icons/medreminder-icon.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))));
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request)));
});

self.addEventListener('push', (event) => {
  const data = event.data?.json() || {};
  event.waitUntil(self.registration.showNotification(data.title || 'Nhắc uống thuốc', {
    body: data.body || 'Đã đến giờ uống thuốc.',
    icon: '/icons/medreminder-icon.png',
    badge: '/icons/medreminder-icon.png',
    data: { url: data.url || '/' },
    tag: 'medicine-reminder',
    renotify: true
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow(event.notification.data?.url || '/'));
});


self.addEventListener('push', (event) => {
  const data = event.data.json();
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      data: { reminderId: data.reminderId, url: data.url },
      actions: data.actions || []
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const { reminderId } = event.notification.data;

  if (event.action === 'taken' || event.action === 'skip') {
    const endpoint = event.action === 'taken'
      ? `/api/reminders/${reminderId}/taken`
      : `/api/reminders/${reminderId}/skip`;

    event.waitUntil(
      fetch(endpoint, {
        method: 'POST',
        credentials: 'include' // gửi kèm cookie/session để xác thực user
      }).catch((err) => console.error('Notification action failed:', err))
    );
    return;
  }

  // Nhấn vào phần thân thông báo (không phải nút) → mở app như bình thường
  event.waitUntil(clients.openWindow(event.notification.data.url || '/'));
});