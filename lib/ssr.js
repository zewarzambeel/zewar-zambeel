// Server-side page builder for the Cloudflare Worker.
// Search engines get real page metadata, product details and structured data
// for every product and category URL. Browsers then run the normal shop script on top.

export const SITE = 'https://zewarzambeel.com';
const SU = 'https://ceoscxhxwanjaaaabhrc.supabase.co';
const SK = 'sb_publishable_YYSMbCX3m3Oeby8Xn-PXtA_3wYJ9wX_';
const BRAND = 'Zewar Zambeel';
const HOME_TITLE = 'Zewar Zambeel | Artificial Jewellery Pakistan';
const HOME_DESC = 'Zewar Zambeel - modern artificial jewellery. Necklaces, earrings, bangles, rings and sets delivered across Pakistan.';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => '&#' + c.charCodeAt(0) + ';');
export const slug = (t) => String(t || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
const money = (n) => 'Rs. ' + Number(n).toLocaleString('en-US');
const clip = (s, n) => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s; };
const json = (o) => JSON.stringify(o).replace(/</g, '\\u003c');
const pLink = (p) => `/p/${p.id}/${slug(p.slug || p.name)}`;
const cLink = (c) => `/c/${c.id}/${slug(c.slug || c.name)}`;
const img0 = (p) => (p.images && p.images[0]) || '';

async function sb(path) {
  try {
    const r = await fetch(SU + '/rest/v1/' + path, { headers: { apikey: SK }, cf: { cacheTtl: 60, cacheEverything: true } });
    if (!r.ok) return null;
    const j = await r.json();
    return Array.isArray(j) ? j : null;
  } catch (e) { return null; }
}

/* ---------- HTML pieces (same class names as the shop script, so they look the same) ---------- */
const card = (p) => {
  const o = Number(p.compare_price) > Number(p.price);
  return `<a class="card" href="${pLink(p)}"><div class="im">${o ? `<i>Save ${Math.round(100 - p.price / p.compare_price * 100)}%</i>` : ''}${p.in_stock === false ? '<i class="so">Sold out</i>' : ''}<img loading="lazy" src="${esc(img0(p))}" alt="${esc(p.name)}"></div><h3>${esc(p.name)}</h3><div class="pr">${o ? `<s>${money(p.compare_price)}</s>` : ''}<b>${money(p.price)}</b></div></a>`;
};
const grid = (a) => a.length ? `<div class="grid">${a.map(card).join('')}</div>` : '';
const stars = (n) => '<span class="st">' + '★'.repeat(n) + '<u>' + '★'.repeat(5 - n) + '</u></span>';

function homeBody(cats, prods, hasBanners) {
  const feat = prods.filter((p) => p.is_featured).slice(0, 8);
  const tile = (c) => {
    const first = prods.find((p) => p.category_id == c.id);
    const im = c.image_url || (first ? img0(first) : '');
    return `<a class="cat" href="${cLink(c)}"><div style="background-image:url('${esc(im)}')"></div>${esc(String(c.name).toUpperCase())}</a>`;
  };
  const hero = hasBanners
    ? '<h1 class="vh">Zewar Zambeel - Artificial Jewellery in Pakistan</h1>'
    : '<div class="hero"><h1 class="brand">Zewar Zambeel</h1><p>Modern artificial jewellery, delivered across Pakistan</p><a class="btn" href="/c/all">Shop now</a></div>';
  return hero + '<h2>Our Collections</h2><div class="cats">' + cats.map(tile).join('') + '</div>' +
    (feat.length ? '<h2>Our Most Loved</h2>' + grid(feat) : '') +
    '<h2>New Arrivals</h2>' + grid(prods.slice(0, 12)) + '<p class="pad"><a class="btn" href="/c/all">View all</a></p>';
}

function productBody(p, reviews, cat, related) {
  const o = Number(p.compare_price) > Number(p.price);
  const imgs = p.images || [];
  const rv = reviews.length
    ? reviews.map((r) => `<div class="ri">${stars(r.rating)}<p>${esc(r.comment)}</p><b>${esc(r.name)}</b></div>`).join('')
    : '<p>No reviews for this item yet.</p>';
  const breadcrumb = `<nav aria-label="Breadcrumb" class="pad" style="max-width:1200px;padding-bottom:0"><a href="/">Home</a>${cat ? ` &rsaquo; <a href="${cLink(cat)}">${esc(cat.name)}</a>` : ''} &rsaquo; <span aria-current="page">${esc(p.name)}</span></nav>`;
  const more = related.length ? `<section aria-label="Related products"><h2>More from ${esc(cat ? cat.name : 'Zewar Zambeel')}</h2>${grid(related)}</section>` : '';
  return `${breadcrumb}<div class="pdp"><div><img id="big" src="${esc(imgs[0] || '')}" alt="${esc(p.name)}"><div class="th">${imgs.map((u) => `<img src="${esc(u)}" alt="${esc(p.name)}">`).join('')}</div></div><div><div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px"><h1 style="font-size:22px">${esc(p.name)}</h1></div><div class="pr" style="font-size:18px;margin:6px 0">${o ? `<s>${money(p.compare_price)}</s>` : ''}<b>${money(p.price)}</b></div>${p.in_stock === false ? '<p><b>Sold out</b></p>' : ''}<p class="desc">${esc(p.description || '')}</p><div class="rl"><h3>Customer reviews</h3>${rv}</div></div></div>${more}`;
}

/* ---------- Page wrapper: put title, description, social tags and structured data into the shell ---------- */
function build(shell, o) {
  const head = [
    `<link rel="canonical" href="${esc(o.canonical)}">`,
    o.noindex ? '<meta name="robots" content="noindex,follow">' : '<meta name="robots" content="index,follow,max-image-preview:large">',
    `<meta property="og:site_name" content="${BRAND}">`,
    `<meta property="og:type" content="${o.type || 'website'}">`,
    `<meta property="og:title" content="${esc(o.title)}">`,
    `<meta property="og:description" content="${esc(o.desc)}">`,
    `<meta property="og:url" content="${esc(o.canonical)}">`,
    `<meta property="og:image" content="${esc(o.image || SITE + '/logo.png')}">`,
    '<meta name="twitter:card" content="summary_large_image">',
    ...(o.ld || []).map((d) => `<script type="application/ld+json">${json(d)}</script>`),
  ].join('\n');
  let h = shell;
  h = h.replace(/<title>[\s\S]*?<\/title>/, () => `<title>${esc(o.title)}</title>`);
  h = h.replace(/<meta name="description"[^>]*>/, () => `<meta name="description" content="${esc(o.desc)}">`);
  h = h.replace('</head>', () => head + '\n</head>');
  if (o.body) h = h.replace(/<main id="app">[\s\S]*?<\/main>/, () => `<main id="app">${o.body}</main>`);
  return h;
}

const crumbs = (items) => ({
  '@context': 'https://schema.org', '@type': 'BreadcrumbList',
  itemListElement: items.map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: it[0], item: SITE + it[1] })),
});

/* ---------- Request handler ---------- */
const NOINDEX = new Set(['cart', 'checkout', 'wish', 'review', 's']);
const OKID = /^[A-Za-z0-9_-]{1,64}$/;

export async function handle({ request, env, next }) {
  if (request.method !== 'GET' && request.method !== 'HEAD') return next();
  const url = new URL(request.url);
  const path = url.pathname;
  if (/\.[A-Za-z0-9]{2,5}$/.test(path) || path === '/admin') return next(); // real files: pass through

  const seg = path.replace(/^\/+|\/+$/g, '').split('/');
  const kind = seg[0];
  const sA = await env.ASSETS.fetch(new URL('/', url));
  const shell = await sA.text();
  const send = (html, status = 200) => {
    const h = new Headers({ 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=0, must-revalidate' });
    if (url.hostname.endsWith('.pages.dev') || url.hostname.endsWith('.workers.dev')) h.set('x-robots-tag', 'noindex'); // only the real domain should be indexed
    return new Response(request.method === 'HEAD' ? null : html, { status, headers: h });
  };
  const redirect = (to) => Response.redirect(url.origin + to + url.search, 301);
  const notFound = () => send(build(shell, {
    title: 'Page not found | ' + BRAND, desc: HOME_DESC, canonical: SITE + '/', noindex: true,
    body: '<div class="pad" style="text-align:center"><h2>Page not found</h2><p>Sorry, we could not find that page.</p><br><a class="btn" href="/">Back to home</a></div>',
  }), 404);

  try {
    if (kind === '') {
      const [cats, prods, set] = await Promise.all([
        sb('categories?select=*&order=sort_order'),
        sb('products?select=id,name,price,compare_price,images,in_stock,is_featured,is_active,category_id,created_at&order=created_at.desc'),
        sb('settings?select=*&key=eq.banners'),
      ]);
      if (!cats || !prods) return send(build(shell, { title: HOME_TITLE, desc: HOME_DESC, canonical: SITE + '/' }));
      const live = prods.filter((p) => p.is_active !== false);
      const liveCats = cats.filter((c) => c.is_active !== false);
      let hasB = false;
      try { hasB = JSON.parse((set && set[0] && set[0].value) || '[]').some((b) => b && b.d); } catch (e) { /* no banners */ }
      return send(build(shell, {
        title: HOME_TITLE, desc: HOME_DESC, canonical: SITE + '/', image: SITE + '/logo.png',
        ld: [
          {
            '@context': 'https://schema.org',
            '@type': 'OnlineStore',
            name: BRAND,
            url: SITE + '/',
            logo: SITE + '/logo.png',
            areaServed: { '@type': 'Country', name: 'Pakistan' },
            hasShippingService: {
              '@type': 'ShippingService',
              '@id': SITE + '/#shipping-policy',
              name: 'Standard delivery across Pakistan',
              description: 'Delivery is available across Pakistan. Estimated delivery is usually 3-4 days. Delivery charges vary by city and are shown at checkout.',
              fulfillmentType: 'https://schema.org/FulfillmentTypeDelivery',
              shippingConditions: [{
                '@type': 'ShippingConditions',
                shippingDestination: { '@type': 'DefinedRegion', addressCountry: 'PK' },
                transitTime: {
                  '@type': 'ServicePeriod',
                  duration: { '@type': 'QuantitativeValue', minValue: 3, maxValue: 4, unitCode: 'DAY' },
                },
              }],
            },
            hasMerchantReturnPolicy: {
              '@type': 'MerchantReturnPolicy',
              '@id': SITE + '/#return-policy',
              applicableCountry: 'PK',
              returnPolicyCategory: 'https://schema.org/MerchantReturnNotPermitted',
              description: 'Returns and refunds are not offered. Exchanges are available within 2 days of delivery only for items that arrive damaged or are not the item ordered. Items must be unused and in original packaging. Customers should contact Zewar Zambeel with clear photos to request an exchange.',
            },
          },
          { '@context': 'https://schema.org', '@type': 'WebSite', name: BRAND, url: SITE + '/', potentialAction: { '@type': 'SearchAction', target: SITE + '/s/{search_term_string}', 'query-input': 'required name=search_term_string' } },
        ],
        body: homeBody(liveCats, live, hasB),
      }));
    }

    if (kind === 'p' && seg[1]) {
      const id = decodeURIComponent(seg[1]);
      if (!OKID.test(id)) return notFound();
      const [rows, reviewsRaw] = await Promise.all([
        sb('products?select=*&id=eq.' + encodeURIComponent(id)),
        sb('reviews?select=*&is_approved=eq.true&product_id=eq.' + encodeURIComponent(id) + '&order=created_at.desc&limit=20'),
      ]);
      if (rows === null) return send(build(shell, { title: HOME_TITLE, desc: HOME_DESC, canonical: SITE + path, noindex: true }));
      const p = rows[0];
      if (!p || p.is_active === false) return notFound();
      const want = pLink(p);
      if (path.replace(/\/+$/, '') !== want) return redirect(want);
      const cats = p.category_id ? await sb('categories?select=id,name&id=eq.' + encodeURIComponent(p.category_id)) : null;
      const cat = cats && cats[0];
      const reviews = reviewsRaw || [];
      const relatedRows = p.category_id
        ? await sb('products?select=id,name,price,compare_price,images,in_stock,slug,category_id&category_id=eq.' + encodeURIComponent(p.category_id) + '&is_active=eq.true&order=created_at.desc&limit=8')
        : [];
      const related = (relatedRows || []).filter((item) => item.id !== p.id).slice(0, 4);
      const canonical = SITE + want;
      const title = clip(p.meta_title, 65) || `${p.name} | ${BRAND}`;
      const desc = clip(p.meta_description, 160) || clip(p.description, 155) || `Buy ${p.name} artificial jewellery online from ${BRAND} for ${money(p.price)}. Cash on Delivery across Pakistan.`;
      const prodLd = {
        '@context': 'https://schema.org', '@type': 'Product', name: p.name, sku: String(p.id),
        image: (p.images || []).slice(0, 6), description: clip(p.description, 500) || desc,
        brand: { '@type': 'Brand', name: BRAND },
        offers: {
          '@type': 'Offer',
          url: canonical,
          priceCurrency: 'PKR',
          price: String(Number(p.price)),
          itemCondition: 'https://schema.org/NewCondition',
          availability: p.in_stock === false ? 'https://schema.org/OutOfStock' : 'https://schema.org/InStock',
          shippingDetails: {
            '@type': 'OfferShippingDetails',
            hasShippingService: { '@id': SITE + '/#shipping-policy' },
          },
          hasMerchantReturnPolicy: { '@id': SITE + '/#return-policy' },
        },
      };
      if (reviews.length) {
        prodLd.aggregateRating = { '@type': 'AggregateRating', ratingValue: (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1), reviewCount: reviews.length };
        prodLd.review = reviews.slice(0, 5).map((r) => ({ '@type': 'Review', author: { '@type': 'Person', name: r.name }, reviewRating: { '@type': 'Rating', ratingValue: r.rating, bestRating: 5 }, reviewBody: r.comment }));
      }
      return send(build(shell, {
        title, desc, canonical, type: 'product', image: img0(p), body: productBody(p, reviews, cat, related),
        ld: [prodLd, crumbs([['Home', '/'], ...(cat ? [[cat.name, cLink(cat)]] : []), [p.name, want]])],
      }));
    }

    if (kind === 'c' && seg[1]) {
      const id = decodeURIComponent(seg[1]);
      if (id === 'all') {
        const prods = await sb('products?select=*&order=created_at.desc');
        if (!prods) return send(build(shell, { title: HOME_TITLE, desc: HOME_DESC, canonical: SITE + '/c/all' }));
        const live = prods.filter((p) => p.is_active !== false);
        return send(build(shell, {
          title: `All Artificial Jewellery | ${BRAND}`,
          desc: `Browse all ${live.length} artificial jewellery designs from ${BRAND}. Necklaces, earrings, bangles, rings and sets. Delivered across Pakistan with Cash on Delivery.`,
          canonical: SITE + '/c/all', image: live[0] ? img0(live[0]) : '',
          body: '<h1 class="t">All Jewellery</h1>' + (grid(live) || '<p class="pad">No products yet.</p>'),
          ld: [crumbs([['Home', '/'], ['All Jewellery', '/c/all']])],
        }));
      }
      if (!OKID.test(id)) return notFound();
      const [crow, prods] = await Promise.all([
        sb('categories?select=*&id=eq.' + encodeURIComponent(id)),
        sb('products?select=*&category_id=eq.' + encodeURIComponent(id) + '&order=created_at.desc'),
      ]);
      if (crow === null || prods === null) return send(build(shell, { title: HOME_TITLE, desc: HOME_DESC, canonical: SITE + path, noindex: true }));
      const c = crow[0];
      // Inactive categories must not remain indexable through direct URLs.
      if (!c || c.is_active === false) return notFound();
      const want = cLink(c);
      if (path.replace(/\/+$/, '') !== want) return redirect(want);
      const live = prods.filter((p) => p.is_active !== false);
      const lowest = live.length ? Math.min(...live.map((p) => Number(p.price))) : 0;
      return send(build(shell, {
        title: clip(c.meta_title, 65) || `${c.name} - Artificial Jewellery Pakistan | ${BRAND}`,
        desc: clip(c.meta_description, 160) || `Shop ${c.name} artificial jewellery online at ${BRAND}. ${live.length} designs${lowest ? ' starting from ' + money(lowest) : ''}. Delivered across Pakistan with Cash on Delivery.`,
        canonical: SITE + want, image: live[0] ? img0(live[0]) : '',
        body: `<h1 class="t">${esc(c.name)}</h1><p class="pad">${esc(c.description || `Explore our ${c.name} collection at Zewar Zambeel. Discover elegant artificial jewellery designs, with delivery available across Pakistan and Cash on Delivery.`)}</p>` + (grid(live) || '<p class="pad">No products yet.</p>'),
        ld: [crumbs([['Home', '/'], [c.name, want]])],
      }));
    }

    if (NOINDEX.has(kind)) return send(build(shell, { title: BRAND, desc: HOME_DESC, canonical: SITE + '/', noindex: true }));
    return notFound();
  } catch (e) {
    return send(build(shell, { title: HOME_TITLE, desc: HOME_DESC, canonical: SITE + path, noindex: true })); // never break the shop
  }
}

/* ---------- /sitemap.xml ---------- */
export async function sitemap() {
  const [cats, prods] = await Promise.all([
    sb('categories?select=*&order=sort_order'),
    sb('products?select=*&order=created_at.desc'),
  ]);
  const u = (loc, im) => `<url><loc>${esc(SITE + loc)}</loc>${im ? `<image:image><image:loc>${esc(im)}</image:loc></image:image>` : ''}</url>`;
  const live = (prods || []).filter((p) => p.is_active !== false);
  const liveCats = (cats || []).filter((c) => c.is_active !== false);
  const out = [u('/'), u('/c/all')]
    .concat(liveCats.map((c) => u(cLink(c))))
    .concat(live.map((p) => u(pLink(p), img0(p))));
  return new Response('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n' + out.join('\n') + '\n</urlset>\n',
    { headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=300' } });
}
