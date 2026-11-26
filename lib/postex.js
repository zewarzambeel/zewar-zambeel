// PostEx courier integration (server side only). The PostEx token lives in the Worker secret POSTEX_TOKEN
// and is never sent to the browser. Every request must come from a logged-in admin (Supabase JWT).
const PX = 'https://api.postex.pk/services/integration/api/order';
const SU = 'https://ceoscxhxwanjaaaabhrc.supabase.co';
const SK = 'sb_publishable_YYSMbCX3m3Oeby8Xn-PXtA_3wYJ9wX_';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHIPPED = ['Booked', 'PostEx WareHouse', 'Out For Delivery', 'Picked By PostEx', 'En-Route to PostEx warehouse', 'Attempted', 'Out For Return'];

const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
const fail = (message, status = 400) => json({ ok: false, message }, status);

export function normPhone(p) {
  let d = String(p || '').replace(/\D/g, '');
  if (d.startsWith('0092')) d = d.slice(4);
  else if (d.startsWith('92')) d = d.slice(2);
  else if (d.startsWith('0')) d = d.slice(1);
  return d.length === 10 && d[0] === '3' ? '0' + d : '';
}

export function buildOrder(o, cod, pickup) {
  const detail = (o.items || []).map((i) => `${i.name}${i.size ? ' / ' + i.size : ''}${i.color ? ' / ' + String(i.color).split('|')[0] : ''} x${i.qty}`).join('; ').slice(0, 400);
  const body = {
    cityName: String(o.city || '').trim(),
    customerName: String(o.customer_name || '').trim(),
    customerPhone: normPhone(o.phone),
    deliveryAddress: [o.address, o.area, o.city].filter(Boolean).join(', '),
    invoiceDivision: 1,
    invoicePayment: cod,
    items: (o.items || []).reduce((a, i) => a + (+i.qty || 0), 0) || 1,
    orderDetail: detail,
    orderRefNumber: String(o.order_no),
    orderType: 'Normal',
    transactionNotes: String(o.notes || '').slice(0, 200),
  };
  if (pickup) body.pickupAddressCode = pickup;
  return body;
}

async function adminOf(request) {
  const jwt = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!jwt) return null;
  const r = await fetch(SU + '/auth/v1/user', { headers: { apikey: SK, authorization: 'Bearer ' + jwt } });
  if (!r.ok) return null;
  const u = await r.json().catch(() => null);
  return u && u.id && u.role === 'authenticated' && !u.is_anonymous ? jwt : null;
}

const sb = async (jwt, path, method = 'GET', body) => {
  const r = await fetch(SU + '/rest/v1/' + path, {
    method,
    headers: { apikey: SK, authorization: 'Bearer ' + jwt, 'content-type': 'application/json', prefer: 'return=representation' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => null);
  if (!r.ok) throw new Error((j && j.message) || 'Database error');
  return j;
};

const px = (env, path, init = {}) =>
  fetch(PX + path, { ...init, headers: { token: env.POSTEX_TOKEN, 'content-type': 'application/json', ...(init.headers || {}) }, signal: AbortSignal.timeout(20000) });

const ok200 = (j) => j && String(j.statusCode) === '200';

async function getOrder(jwt, id) {
  if (!UUID.test(String(id || ''))) throw new Error('Invalid order');
  const [o] = await sb(jwt, 'orders?id=eq.' + id + '&select=*');
  if (!o) throw new Error('Order not found');
  return o;
}

async function create(env, jwt, b) {
  const o = await getOrder(jwt, b.order_id);
  if (o.postex_tracking) return fail('This order is already sent to PostEx (' + o.postex_tracking + ')');
  if (o.status === 'cancelled') return fail('This order is cancelled');
  const cod = b.cod_amount === undefined || b.cod_amount === null || b.cod_amount === '' ? +o.total : +b.cod_amount;
  if (!(cod >= 0) || cod > 1000000) return fail('Enter a valid amount to collect');
  const phone = normPhone(o.phone);
  if (!phone) return fail('The customer phone number is not a valid Pakistani mobile number: ' + o.phone);
  try { // clear message when PostEx does not deliver to this city
    const cr = await px(env, '/v2/get-operational-city?operationalCityType=Delivery');
    const cj = await cr.json().catch(() => null);
    const list = cj && Array.isArray(cj.dist) ? cj.dist.filter((c) => String(c.isDeliveryCity) !== 'false').map((c) => String(c.operationalCityName).trim().toLowerCase()) : [];
    if (list.length && !list.includes(String(o.city).trim().toLowerCase())) return fail('PostEx does not deliver to "' + o.city + '" (check the city name).');
  } catch (e) { /* skip the pre-check, PostEx will validate */ }
  let pickup = '';
  try { const [s] = await sb(jwt, 'settings?key=eq.postex_pickup_code&select=value'); pickup = s && s.value ? String(s.value).trim() : ''; } catch (e) { /* optional */ }
  const r = await px(env, '/v3/create-order', { method: 'POST', body: JSON.stringify(buildOrder(o, cod, pickup)) });
  const j = await r.json().catch(() => null);
  if (!r.ok || !ok200(j) || !j.dist || !j.dist.trackingNumber) return fail('PostEx: ' + ((j && (j.statusMessage || j.message)) || 'could not create the order (HTTP ' + r.status + ')'));
  const tn = String(j.dist.trackingNumber).trim();
  await sb(jwt, 'orders?id=eq.' + o.id, 'PATCH', {
    postex_tracking: tn, postex_status: j.dist.orderStatus || 'UnBooked', postex_cod_amount: cod,
    postex_booked_at: new Date().toISOString(), postex_synced_at: new Date().toISOString(),
    ...(o.status === 'new' ? { status: 'confirmed' } : {}),
  });
  return json({ ok: true, tracking: tn, status: j.dist.orderStatus || 'UnBooked' });
}

async function status(env, jwt, b) {
  const ids = Array.isArray(b.order_ids) ? b.order_ids.filter((x) => UUID.test(String(x))).slice(0, 30) : [];
  const q = ids.length ? 'id=in.(' + ids.join(',') + ')' : 'status=not.in.(delivered,cancelled)&order=created_at.desc&limit=30';
  const rows = await sb(jwt, 'orders?select=id,order_no,status,postex_tracking,postex_status&postex_tracking=not.is.null&' + q);
  const out = [];
  for (const o of rows) {
    try {
      const r = await px(env, '/v1/track-order/' + encodeURIComponent(o.postex_tracking));
      const j = await r.json().catch(() => null);
      if (!r.ok || !ok200(j) || !j.dist) { out.push({ order_no: o.order_no, error: (j && j.statusMessage) || 'HTTP ' + r.status }); continue; }
      const st = String(j.dist.transactionStatus || '').trim();
      const patch = { postex_status: st || o.postex_status, postex_synced_at: new Date().toISOString() };
      if (st === 'Delivered' && o.status !== 'delivered' && o.status !== 'cancelled') patch.status = 'delivered';
      else if (SHIPPED.includes(st) && (o.status === 'new' || o.status === 'confirmed')) patch.status = 'shipped';
      await sb(jwt, 'orders?id=eq.' + o.id, 'PATCH', patch);
      out.push({ order_no: o.order_no, status: patch.postex_status, order_status: patch.status || o.status });
    } catch (e) { out.push({ order_no: o.order_no, error: e.message }); }
  }
  return json({ ok: true, results: out });
}

async function cancel(env, jwt, b) {
  const o = await getOrder(jwt, b.order_id);
  if (!o.postex_tracking) return json({ ok: true, skipped: true });
  const r = await px(env, '/v1/cancel-order', { method: 'PUT', body: JSON.stringify({ trackingNumber: o.postex_tracking }) });
  const j = await r.json().catch(() => null);
  if (!r.ok || (j && j.statusCode && !ok200(j))) return fail('PostEx: ' + ((j && (j.statusMessage || j.message)) || 'could not cancel (HTTP ' + r.status + ')'));
  await sb(jwt, 'orders?id=eq.' + o.id, 'PATCH', { postex_status: 'Cancelled', postex_synced_at: new Date().toISOString() });
  return json({ ok: true });
}

async function awb(env, b) {
  const t = (Array.isArray(b.tracking) ? b.tracking : []).map((x) => String(x).trim()).filter((x) => /^[A-Za-z0-9-]{4,40}$/.test(x)).slice(0, 10);
  if (!t.length) return fail('No tracking number');
  const r = await px(env, '/v1/get-invoice?trackingNumbers=' + encodeURIComponent(t.join(',')));
  const ct = r.headers.get('content-type') || '';
  if (!r.ok || !/pdf/i.test(ct)) { const j = await r.json().catch(() => null); return fail('PostEx: ' + ((j && (j.statusMessage || j.message)) || 'could not get the airway bill (HTTP ' + r.status + ')')); }
  return new Response(r.body, { status: 200, headers: { 'content-type': 'application/pdf', 'cache-control': 'no-store' } });
}

export async function handlePostex(request, env) {
  if (request.method !== 'POST') return fail('Method not allowed', 405);
  const jwt = await adminOf(request);
  if (!jwt) return fail('Please log in to the admin panel again', 401);
  const b = await request.json().catch(() => null);
  if (!b || typeof b.action !== 'string') return fail('Bad request');
  if (b.action === 'ping') return json({ ok: true, configured: !!env.POSTEX_TOKEN });
  if (!env.POSTEX_TOKEN) return fail('PostEx is not connected yet: the POSTEX_TOKEN secret is not set in Cloudflare.', 503);
  try {
    if (b.action === 'create') return await create(env, jwt, b);
    if (b.action === 'status') return await status(env, jwt, b);
    if (b.action === 'cancel') return await cancel(env, jwt, b);
    if (b.action === 'awb') return await awb(env, b);
    return fail('Unknown action');
  } catch (e) {
    return fail(e.name === 'TimeoutError' ? 'PostEx did not respond in time, please try again' : e.message || 'Something went wrong', 500);
  }
}
