// Google Merchant Center product feed, generated live from the database so price and stock never go stale.
// /feed.tsv (tab separated, recommended for Merchant Center) and /feed.csv (for Google Sheets / IMPORTDATA).
const SITE = 'https://zewarzambeel.com';
const SU = 'https://ceoscxhxwanjaaaabhrc.supabase.co';
const SK = 'sb_publishable_YYSMbCX3m3Oeby8Xn-PXtA_3wYJ9wX_';
const COLS = ['id', 'title', 'description', 'link', 'image_link', 'availability', 'price', 'sale_price', 'brand', 'condition', 'google_product_category', 'identifier_exists', 'product_type', 'color', 'material', 'gender', 'age_group'];

const slug = (t) => String(t || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);

// Google taxonomy by category name (checked in this order)
const TAX = [
  [/ring/i, 'Apparel & Accessories > Jewelry > Rings', 'Jewelry > Rings'],
  [/ear/i, 'Apparel & Accessories > Jewelry > Earrings', 'Jewelry > Earrings'],
  [/bracelet|bangle/i, 'Apparel & Accessories > Jewelry > Bracelets', 'Jewelry > Bangles & Bracelets'],
  [/pendant|necklace|chain|set/i, 'Apparel & Accessories > Jewelry > Necklaces', 'Jewelry > Necklaces & Sets'],
  [/hair/i, 'Apparel & Accessories > Clothing Accessories > Hair Accessories', 'Hair Accessories'],
  [/nail/i, 'Health & Beauty > Personal Care > Cosmetics > Nail Care', 'Beauty > Artificial Nails'],
];
const COLORS = ['gold', 'silver', 'rose gold', 'black', 'white', 'red', 'maroon', 'pink', 'blue', 'green', 'purple', 'orange', 'yellow', 'brown', 'beige', 'grey', 'gray', 'golden', 'multicolor', 'transparent', 'peach', 'navy'];

export function cleanDesc(text, name, cat) {
  let t = String(text || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  t = t.replace(/,?\s*(?:available online at [A-Za-z ]+ for|available at [A-Za-z ]+ for|priced at|offered at|for only)\s*Rs\.?\s*[\d,]+(?:\.\d+)?/gi, '');
  const keep = t.split(/(?<=[.!?])\s+/).filter((s) => !/deliver|shipping|\border\b|\bshop\b|whatsapp|cash on|product photos|explore the other|rs\.?\s*\d/i.test(s));
  t = keep.join(' ').replace(/\s+([,.])/g, '$1').trim();
  if (t.length < 60) t = (t ? t + ' ' : '') + `Artificial jewellery and accessories from Zewar Zambeel's ${cat || 'jewellery'} collection.`;
  return t.slice(0, 4900);
}

export function colorOf(p) {
  const fromList = (p.colors || []).map((c) => String(c).split('|')[0].trim()).filter(Boolean);
  const uniq = [...new Set(fromList.map((c) => c.replace(/\b\w/g, (m) => m.toUpperCase())))];
  if (uniq.length) return uniq.slice(0, 3).join(' / ');
  const n = String(p.name || '').toLowerCase();
  const found = COLORS.filter((c) => new RegExp('\\b' + c + '\\b').test(n)).filter((c, i, a) => !a.some((o) => o !== c && o.includes(c)));
  return found.slice(0, 3).map((c) => c.replace(/\b\w/g, (m) => m.toUpperCase())).join(' / ');
}

export function rowOf(p, cat) {
  const cname = cat ? cat.name : '';
  const t = TAX.find((x) => x[0].test(cname)) || [0, 'Apparel & Accessories > Jewelry', 'Jewelry'];
  const price = Math.round(+p.price || 0), cmp = Math.round(+p.compare_price || 0);
  const sale = cmp > price && price > 0;
  const instock = p.in_stock !== false && !(p.stock_qty !== null && p.stock_qty !== undefined && +p.stock_qty <= 0);
  return {
    id: 'ZZ-' + String(p.id).replace(/-/g, '').slice(0, 8).toUpperCase(),
    title: String(p.name || '').replace(/\s+/g, ' ').trim().slice(0, 150),
    description: cleanDesc(p.description, p.name, cname.toLowerCase()),
    link: `${SITE}/p/${p.id}/${slug(p.slug || p.name)}`,
    image_link: (p.images && p.images[0]) || '',
    availability: instock ? 'in_stock' : 'out_of_stock',
    price: (sale ? cmp : price) + ' PKR',
    sale_price: sale ? price + ' PKR' : '',
    brand: 'Zewar Zambeel', condition: 'new',
    google_product_category: t[1], identifier_exists: 'no', product_type: t[2],
    color: colorOf(p), material: '', gender: 'female', age_group: 'adult',
  };
}

const q = (v) => '"' + String(v).replace(/"/g, '""') + '"';
export function render(rows, fmt) {
  const clean = (v) => String(v ?? '').replace(/[\t\r\n]+/g, ' ').trim();
  if (fmt === 'tsv') return [COLS.join('\t'), ...rows.map((r) => COLS.map((c) => clean(r[c])).join('\t'))].join('\n') + '\n';
  return [COLS.join(','), ...rows.map((r) => COLS.map((c) => q(clean(r[c]))).join(','))].join('\n') + '\n';
}

const get = async (path) => {
  const r = await fetch(SU + '/rest/v1/' + path, { headers: { apikey: SK, authorization: 'Bearer ' + SK } });
  if (!r.ok) throw new Error('Database error ' + r.status);
  return r.json();
};

export async function handleFeed(request) {
  const fmt = new URL(request.url).pathname.endsWith('.tsv') ? 'tsv' : 'csv';
  try {
    const [cats, prods] = await Promise.all([
      get('categories?select=id,name'),
      get('products?select=id,name,slug,description,price,compare_price,images,colors,in_stock,stock_qty,category_id&is_active=eq.true&order=created_at.desc&limit=2000'),
    ]);
    const cm = new Map(cats.map((c) => [c.id, c]));
    const rows = prods.filter((p) => p.images && p.images[0] && +p.price > 0).map((p) => rowOf(p, cm.get(p.category_id)));
    return new Response(render(rows, fmt), { headers: {
      'content-type': fmt === 'tsv' ? 'text/tab-separated-values; charset=utf-8' : 'text/csv; charset=utf-8',
      'cache-control': 'public, max-age=900', 'x-robots-tag': 'noindex', 'content-disposition': `inline; filename="zewar-zambeel-feed.${fmt}"`,
    } });
  } catch (e) { return new Response('Feed temporarily unavailable', { status: 503, headers: { 'cache-control': 'no-store' } }); }
}
