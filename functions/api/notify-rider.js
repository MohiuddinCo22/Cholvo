// Cloudflare Pages Function: POST /api/notify-rider   body: { idToken, tn }
// The admin panel calls this right after assigning an order. It sends a push notification (Firebase Cloud Messaging)
// to the phone of the rider the order is assigned to. Only the admin may call it (same check as create-rider.js).
// Title/text come from config/riderSystem (notifTitle / notifBody, set in admin > Rider Cash); {tn} {pickup} {drop} {charge} can be used.
// Secrets: FIREBASE_SA_LIVE / FIREBASE_SA_TEST (already used by create-rider.js). Web-standard code only.
import { accessToken, isTestHost, loadSa } from '../_lib/google.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...CORS } });
const fail = (code, status) => json({ ok: false, code }, status);
const TN = /^[A-Za-z0-9_-]{3,40}$/;

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function onRequestPost({ request, env }) {
  try {
    const test = isTestHost(new URL(request.url).hostname);
    const loaded = loadSa(env, test);
    if (loaded.code) return fail(loaded.code, 503);
    const project = loaded.sa.project_id;

    let body;
    try { body = await request.json(); } catch (_) { return fail('bad_request', 400); }
    const idToken = String((body && body.idToken) || ''), tn = String((body && body.tn) || '');
    if (!idToken || !TN.test(tn)) return fail('bad_request', 400);

    const fs = 'https://firestore.googleapis.com/v1/projects/' + project + '/databases/(default)/documents/';
    // admin check: only the admin may list `riders` (firestore.rules)
    const who = await fetch(fs + 'riders?pageSize=1', { headers: { Authorization: 'Bearer ' + idToken } });
    if (!who.ok) return fail('not_admin', 403);

    const token = await accessToken(loaded.sa);
    const H = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };
    const str = f => (f && f.stringValue) || '';

    const od = await fetch(fs + 'orders/' + tn, { headers: H });
    if (!od.ok) return fail('no_order', 404);
    const o = (await od.json()).fields || {};
    const riderId = str(o.riderId);
    if (!riderId) return fail('no_rider', 409);

    const rd = await fetch(fs + 'riders/' + riderId, { headers: H });
    if (!rd.ok) return fail('no_rider', 404);
    const fcmToken = str(((await rd.json()).fields || {}).fcmToken);
    if (!fcmToken) return json({ ok: false, code: 'no_token' });

    let cfg = {};
    const cd = await fetch(fs + 'config/riderSystem', { headers: H });
    if (cd.ok) cfg = (await cd.json()).fields || {};
    const pickup = str(o.pickup) || str(o.from) || str(o.vendor) || '—', drop = str(o.drop) || str(o.addr) || '—';
    const num = f => (f && (f.integerValue || f.doubleValue)) || '';
    const charge = num(o.deliveryCharge) || num(o.deliveryFee) || num(cfg.perDelivery);   // shown in the notification and the rider app popup
    const fill = s => s.replace(/\{tn\}/g, tn).replace(/\{pickup\}/g, pickup).replace(/\{drop\}/g, drop).replace(/\{charge\}/g, charge);
    const title = fill(str(cfg.notifTitle) || '🛵 New delivery').slice(0, 80);
    const text = fill(str(cfg.notifBody) || '{tn}: {pickup} → {drop}' + (charge ? ' · ৳{charge}' : '')).slice(0, 200);

    const r = await fetch('https://fcm.googleapis.com/v1/projects/' + project + '/messages:send', {
      method: 'POST', headers: H,
      body: JSON.stringify({ message: {
        token: fcmToken,
        notification: { title, body: text },
        data: { tn, kind: 'assigned', pickup: pickup.slice(0, 200), drop: drop.slice(0, 200), charge: String(charge) },
        android: { priority: 'HIGH', ttl: '60s', notification: { channel_id: 'orders', notification_priority: 'PRIORITY_MAX', visibility: 'PUBLIC', default_vibrate_timings: true } },
      } }),
    });
    if (r.ok) return json({ ok: true, sent: true });
    const ej = await r.json().catch(() => ({}));
    if (r.status === 404 || /UNREGISTERED|INVALID_ARGUMENT/.test(JSON.stringify(ej))) {
      // old / invalid phone token: forget it, the rider app saves a fresh one at the next start
      await fetch(fs + 'riders/' + riderId + '?updateMask.fieldPaths=fcmToken', { method: 'PATCH', headers: H, body: JSON.stringify({ fields: {} }) }).catch(() => {});
      return json({ ok: false, code: 'no_token' });
    }
    return fail('fcm_failed', 502);
  } catch (_) {
    return fail('server_error', 502);
  }
}
