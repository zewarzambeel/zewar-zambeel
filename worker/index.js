// Cloudflare Worker entry: builds real pages for products/categories and serves everything else from /public.
import { handle, sitemap } from '../lib/ssr.js';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/sitemap.xml') return sitemap();
    return handle({ request, env, next: () => env.ASSETS.fetch(request) });
  },
};
