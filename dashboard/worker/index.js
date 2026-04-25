// Merged into sw.js by next-pwa at build time via customWorkerDir: 'worker'

self.addEventListener('push', function (event) {
  if (!event.data) return;

  var payload;
  try {
    payload = event.data.json();
  } catch (_) {
    payload = { title: 'Transaksi Baru', body: event.data.text() };
  }

  var title = payload.title || 'Transaksi Baru';
  var options = {
    body: payload.body || '',
    icon: payload.icon || '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    data: payload.data || { url: '/transactions' },
    vibrate: [200, 100, 200],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  var targetUrl = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then(function (wins) {
        for (var i = 0; i < wins.length; i++) {
          if (wins[i].url.indexOf(targetUrl) !== -1 && 'focus' in wins[i]) {
            return wins[i].focus();
          }
        }
        if (clients.openWindow) return clients.openWindow(targetUrl);
      })
  );
});
