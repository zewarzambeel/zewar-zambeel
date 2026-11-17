// Zewar Zambeel service worker.
// Makes the site installable as an app. It deliberately caches NOTHING, so customers always see live
// products, prices and stock. The only thing it does is show a small page when a page load fails offline.
const OFFLINE_HTML = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Offline | Zewar Zambeel</title><style>body{margin:0;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:24px;text-align:center;background:#000;color:#e8c875;font:16px/1.5 system-ui,Arial,sans-serif}h1{margin:0;font:400 26px Georgia,serif;letter-spacing:.06em}p{margin:0;color:#bbb}button{margin-top:8px;background:#a67a2a;color:#fff;border:0;border-radius:24px;padding:12px 32px;font:inherit;cursor:pointer}</style></head><body><h1>Zewar Zambeel</h1><p>You are offline. Please check your internet connection and try again.</p><button type="button" onclick="location.reload()">Try again</button></body></html>';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (event) => {
  const req = event.request;
  // Only page loads are handled. API calls, images, orders and everything else go straight to the network untouched.
  if (req.mode !== 'navigate') return;
  event.respondWith(
    fetch(req).catch(() => new Response(OFFLINE_HTML, {
      status: 503,
      headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
    }))
  );
});
