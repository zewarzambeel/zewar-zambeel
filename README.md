# Zewar Zambeel website

- `public/` — storefront, admin panel, static assets and robots.txt
- `worker/index.js` — Cloudflare Worker entry point
- `lib/ssr.js` — server-rendered product/category pages, metadata, structured data and XML sitemap
- `wrangler.jsonc` — Cloudflare Workers + static assets configuration

## Deployment

This project is deployed as a Cloudflare Worker with static assets (not Cloudflare Pages Functions).

- Production branch: `main`
- Deploy command: `npx wrangler deploy`
- Static asset directory: `public`
- Worker entry: `worker/index.js`

## Data and SEO

Products and categories are read from Supabase. Product/category SEO metadata is read from their `meta_title` and `meta_description` fields, with safe fallbacks to the public name and description. Canonical URLs and storefront links use each record's `slug` while retaining its ID in the route for stable lookup.

The Worker serves:
- Server-rendered product and category HTML with canonical, Open Graph, Twitter and JSON-LD metadata
- `/sitemap.xml` with active product/category URLs and product images
- Static storefront/admin assets from `public/`

The Supabase publishable key is used for public catalog reads. Never put a Supabase secret/service-role key in client or Worker source. Keep database access protected by appropriate Row Level Security policies.

Products, categories, stock and prices remain managed in Supabase; do not hard-code product data in this repository.
