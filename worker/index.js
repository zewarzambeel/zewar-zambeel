// Cloudflare Worker entry: builds real pages for products/categories and serves everything else from /public.
import { handle, sitemap } from '../lib/ssr.js';

const STORE = 'https://ceoscxhxwanjaaaabhrc.supabase.co/storage/v1/object/public/';
const IMMUTABLE = 'public, max-age=31536000, immutable';

// Safety net for resized images. Normally Cloudflare answers /cdn-cgi/image/... before this Worker runs.
// If a request does reach the Worker, resize it here (only our own storage files are allowed).
async function resized(request, url) {
  const m = url.pathname.match(/^\/cdn-cgi\/image\/([^/]+)\/(https?:\/\/.+)$/);
  if (!m || !m[2].startsWith(STORE) || m[2].includes('..')) return new Response('Bad image request', { status: 400 });
  const opt = Object.fromEntries(m[1].split(',').map((kv) => kv.split('=')));
  const width = Math.min(Math.max(parseInt(opt.width, 10) || 800, 40), 2000);
  const quality = Math.min(Math.max(parseInt(opt.quality, 10) || 85, 50), 95);
  const format = /image\/webp/.test(request.headers.get('accept') || '') ? 'webp' : 'jpeg';
  const common = { cacheTtl: 31536000, cacheEverything: true };
  let r;
  try { r = await fetch(m[2], { cf: { ...common, image: { width, quality, format, fit: 'scale-down' } } }); } catch (e) { r = null; }
  if (!r || !r.ok || !(r.headers.get('content-type') || '').startsWith('image/')) r = await fetch(m[2], { cf: common }); // resizing unavailable: serve the original
  if (!r.ok) return new Response('Image not found', { status: 404 });
  const h = new Headers({ 'content-type': r.headers.get('content-type') || 'image/jpeg', 'cache-control': IMMUTABLE, vary: 'Accept' });
  return new Response(r.body, { status: 200, headers: h });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/cdn-cgi/image/') && (request.method === 'GET' || request.method === 'HEAD')) return resized(request, url);
    if (url.pathname === '/sitemap.xml') return sitemap();
    return handle({ request, env, next: () => env.ASSETS.fetch(request) });
  },
};
