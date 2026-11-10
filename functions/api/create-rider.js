// Cloudflare Pages Function: POST /api/create-rider
// body: { idToken: "<admin's Firebase login token>", name, phone, password, vehicleType?, vehicleNumber? }
//
// The admin page calls this to give a rider a login for the Rider App:
//   1. proves the caller is the admin (Firestore itself checks the token: only the admin may list `riders`)
//   2. creates the Firebase login  <phone>@rider.cholvo.app  with the given password
//   3. creates riders/{uid} (the rider's document id IS the login uid) with approvalStatus APPROVED
// Secrets (same ones reset-password.js uses): FIREBASE_SA_LIVE, FIREBASE_SA_TEST.
// Open /api/create-rider in a browser to see whether this site is set up (no secrets are shown).

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...CORS } });
const fail = (code, status) => json({ ok: false, code }, status);

const PHONE = /^01[0-9]{9}$/;
const MIN_PW = 6, MAX_PW = 128;
const isTestHost = h => h === 'localhost' || h === '127.0.0.1' || /\.cholvo\.pages\.dev$/.test(h) || /\.app\.github\.dev$/.test(h);

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function onRequestGet({ request, env }) {
  const host = new URL(request.url).hostname, test = isTestHost(host);
  const out = { host, uses: test ? 'FIREBASE_SA_TEST (staging)' : 'FIREBASE_SA_LIVE (live)' };
  const loaded = loadSa(env, test);
  if (loaded.code) { out.ok = false; out.problem = loaded.code; return json(out); }
  out.project_id = loaded.sa.project_id;
  try { await accessToken(loaded.sa); out.ok = true; out.problem = null; }
  catch (_) { out.ok = false; out.problem = 'google_login_failed'; }
  return json(out);
}

export async function onRequestPost({ request, env }) {
  try {
    const test = isTestHost(new URL(request.url).hostname);
    const loaded = loadSa(env, test);
    if (loaded.code) return fail(loaded.code, 503);
    const sa = loaded.sa, project = sa.project_id;

    let body;
    try { body = await request.json(); } catch (_) { return fail('bad_request', 400); }
    const idToken = String((body && body.idToken) || '');
    const name = String((body && body.name) || '').trim();
    const phone = String((body && body.phone) || '').trim();
    const password = typeof (body && body.password) === 'string' ? body.password : '';
    const vehicleType = String((body && body.vehicleType) || '').slice(0, 30);
    const vehicleNumber = String((body && body.vehicleNumber) || '').slice(0, 30);
    if (!idToken || !name || name.length > 120 || !PHONE.test(phone)) return fail('bad_request', 400);
    if (password.length < MIN_PW) return fail('weak_password', 400);
    if (password.length > MAX_PW) return fail('bad_request', 400);

    // 1. admin check: only the admin may list `riders` (firestore.rules), so a 200 answer proves it
    const fs = 'https://firestore.googleapis.com/v1/projects/' + project + '/databases/(default)/documents/';
    const who = await fetch(fs + 'riders?pageSize=1', { headers: { Authorization: 'Bearer ' + idToken } });
    if (!who.ok) return fail('not_admin', 403);

    const token = await accessToken(sa);
    const auth = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };

    // 2. login (uid is chosen by Google and returned as localId)
    const email = phone + '@rider.cholvo.app';
    const cr = await fetch('https://identitytoolkit.googleapis.com/v1/projects/' + project + '/accounts', {
      method: 'POST', headers: auth, body: JSON.stringify({ email, password, displayName: name, emailVerified: false }),
    });
    const cj = await cr.json().catch(() => ({}));
    if (!cr.ok) {
      const m = (cj && cj.error && cj.error.message) || '';
      if (/EMAIL_EXISTS/.test(m)) return fail('exists', 409);
      if (/WEAK_PASSWORD/.test(m)) return fail('weak_password', 400);
      throw new Error('create login');
    }
    const uid = cj.localId;

    // 3. rider document (id = uid)
    const fields = {
      name: { stringValue: name }, phone: { stringValue: phone }, active: { booleanValue: true },
      approvalStatus: { stringValue: 'APPROVED' }, isOnline: { booleanValue: false },
      authUid: { stringValue: uid }, createdAt: { timestampValue: new Date().toISOString() },
    };
    if (vehicleType) fields.vehicleType = { stringValue: vehicleType };
    if (vehicleNumber) fields.vehicleNumber = { stringValue: vehicleNumber };
    const wr = await fetch(fs + 'riders/' + uid, { method: 'PATCH', headers: auth, body: JSON.stringify({ fields }) });
    if (!wr.ok) {
      // undo the login so the admin can try again with the same number
      await fetch('https://identitytoolkit.googleapis.com/v1/projects/' + project + '/accounts:delete', {
        method: 'POST', headers: auth, body: JSON.stringify({ localId: uid }),
      }).catch(() => {});
      throw new Error('rider doc');
    }
    return json({ ok: true, uid });
  } catch (e) {
    return fail('server_error', 502); // never include secrets or details
  }
}

function loadSa(env, test) {
  const raw = test ? env.FIREBASE_SA_TEST : env.FIREBASE_SA_LIVE;
  if (!raw) return { code: test ? 'no_secret_test' : 'no_secret_live' };
  let sa;
  try { sa = JSON.parse(raw); } catch (_) { return { code: 'secret_not_json' }; }
  if (!sa || typeof sa !== 'object') return { code: 'secret_not_json' };
  if (!sa.project_id || !sa.client_email || !sa.private_key) return { code: 'secret_missing_fields' };
  return { sa };
}

const b64u = buf => {
  const bytes = buf instanceof ArrayBuffer ? new Uint8Array(buf) : new TextEncoder().encode(buf);
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

async function accessToken(sa) {
  const now = Math.floor(Date.now() / 1000);
  const head = b64u(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64u(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/cloud-platform https://www.googleapis.com/auth/datastore',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now, exp: now + 3600,
  }));
  const pem = sa.private_key.replace(/-----(BEGIN|END) PRIVATE KEY-----/g, '').replace(/\s+/g, '');
  const der = Uint8Array.from(atob(pem), c => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', der.buffer, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(head + '.' + claims));
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=' + encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer') + '&assertion=' + encodeURIComponent(head + '.' + claims + '.' + b64u(sig)),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new Error('token');
  return j.access_token;
}
