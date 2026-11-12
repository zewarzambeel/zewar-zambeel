# Zewar Zambeel website

- `public/`    the shop (index.html), admin panel (admin.html), logo, favicon, robots.txt
- `functions/` Cloudflare Pages Functions: real pages for every product/category + sitemap.xml
- `lib/`       code used by the functions
- `reviews.sql` run once in Supabase (SQL Editor). Not part of the website.

Cloudflare Pages settings: Framework preset None, Build command (empty), Build output directory `public`.
Products, categories, prices and reviews come live from Supabase, so no redeploy is needed when they change.
