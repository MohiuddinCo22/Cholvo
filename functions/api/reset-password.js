// Cloudflare Pages Function: POST /api/reset-password   body: { "rid": "<32 chars>", "password": "<new password>" }
//
// Merchant "forgot password" - the last step. The merchant app creates passwordResets/{rid} (status "pending"),
// the admin approves it in admin.html, and only then does this function accept the new password:
//   1. the request must exist, be "approved", not used yet, and approved less than 24 hours ago
//   2. the merchant account for that phone must exist and not be blocked
//   3. the request is marked "used" first (atomic, so it works only once), then the password is changed
//
// Secrets (Cloudflare Pages > Settings > Variables and Secrets) - never put these in the repo:
//   FIREBASE_SA_LIVE   service-account JSON of the live project   (chovo-35252)
//   FIREBASE_SA_TEST   service-account JSON of the staging project (cholvo-staging)
// Create one in Firebase console > Project settings > Service accounts > Generate new private key,
// then paste the WHOLE json file as the secret value.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...CORS } });
const fail = (code, status) => json({ ok: false, code }, status);

const RID = /^[A-Za-z0-9]{32}$/;
const PHONE = /^01[0-9]{9}$/;
const VALID_MS = 24 * 60 * 60 * 1000; // an approval is valid for 24 hours
const MIN_PW = 6, MAX_PW = 128;

// Same hosts that env.js / media.js treat as staging. Everything else (cholvo.pages.dev) is live.
const isTestHost = h => h === 'localhost' || h === '127.0.0.1' || /\.cholvo\.pages\.dev$/.test(h) || /\.app\.github\.dev$/.test(h);

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function onRequestPost({ request, env }) {
  let claimed = null; // { docUrl } once the request has been marked used, so we can undo it if the password change fails
  let token = null;
  try {
    const test = isTestHost(new URL(request.url).hostname);
    const saJson = test ? env.FIREBASE_SA_TEST : env.FIREBASE_SA_LIVE;
    if (!saJson) return fail('not_configured', 503);
    let sa;
    try { sa = JSON.parse(saJson); } catch (_) { return fail('not_configured', 503); }
    const project = sa.project_id;
    if (!project || !sa.client_email || !sa.private_key) return fail('not_configured', 503);

    let body;
    try { body = await request.json(); } catch (_) { return fail('bad_request', 400); }
    const rid = String((body && body.rid) || '');
    const password = typeof (body && body.password) === 'string' ? body.password : '';
    if (!RID.test(rid)) return fail('bad_request', 400);
    if (password.length < MIN_PW) return fail('weak_password', 400);
    if (password.length > MAX_PW) return fail('bad_request', 400);

    token = await accessToken(sa);
    const auth = { Authorization: 'Bearer ' + token };
    const fs = 'https://firestore.googleapis.com/v1/projects/' + project + '/databases/(default)/documents/';

    // 1. the approved request
    const rr = await fetch(fs + 'passwordResets/' + rid, { headers: auth });
    if (rr.status === 404) return fail('not_found', 404);
    if (!rr.ok) throw new Error('firestore read');
    const rdoc = await rr.json();
    const f = rdoc.fields || {};
    const status = f.status && f.status.stringValue;
    const phone = f.phone && f.phone.stringValue;
    const decided = f.decidedAt && f.decidedAt.timestampValue ? Date.parse(f.decidedAt.timestampValue) : 0;
    if (status === 'used') return fail('used', 409);
    if (status === 'rejected') return fail('rejected', 403);
    if (status !== 'approved') return fail('not_approved', 403);
    if (!PHONE.test(phone || '')) return fail('not_found', 404);
    if (!decided || Date.now() - decided > VALID_MS) return fail('expired', 403);

    // 2. the merchant account
    const lk = await fetch('https://identitytoolkit.googleapis.com/v1/projects/' + project + '/accounts:lookup', {
      method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: [phone + '@cholvo.app'] }),
    });
    if (!lk.ok) throw new Error('lookup');
    const user = ((await lk.json()).users || [])[0];
    if (!user || !user.localId) return fail('no_account', 404);
    const md = await fetch(fs + 'merchants/' + user.localId, { headers: auth });
    if (!md.ok) return fail('no_account', 404);
    const m = (await md.json()).fields || {};
    if (!m.blocked || m.blocked.booleanValue !== false) return fail('blocked', 403);

    // 3. claim the request (fails if somebody else used it a moment ago), then change the password
    const docUrl = fs + 'passwordResets/' + rid;
    const nowIso = new Date().toISOString();
    const claim = await fetch(docUrl + '?updateMask.fieldPaths=status&updateMask.fieldPaths=usedAt&currentDocument.updateTime=' + encodeURIComponent(rdoc.updateTime), {
      method: 'PATCH', headers: { ...auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: { status: { stringValue: 'used' }, usedAt: { timestampValue: nowIso } } }),
    });
    if (!claim.ok) return fail('used', 409);
    claimed = { docUrl };

    const up = await fetch('https://identitytoolkit.googleapis.com/v1/projects/' + project + '/accounts:update', {
      method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' },
      // validSince signs the merchant out everywhere else, so an old/stolen session stops working
      body: JSON.stringify({ localId: user.localId, password, validSince: String(Math.floor(Date.now() / 1000)) }),
    });
    if (!up.ok) {
      const ej = await up.json().catch(() => ({}));
      await undoClaim(claimed, token);
      const msg = (ej.error && ej.error.message) || '';
      if (/WEAK_PASSWORD/.test(msg)) return fail('weak_password', 400);
      throw new Error('update');
    }
    return json({ ok: true });
  } catch (e) {
    if (claimed && token) await undoClaim(claimed, token).catch(() => {});
    return fail('server', 502); // never include secrets or raw errors in the reply
  }
}

async function undoClaim(claimed, token) {
  await fetch(claimed.docUrl + '?updateMask.fieldPaths=status', {
    method: 'PATCH', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: { status: { stringValue: 'approved' } } }),
  });
}

// ---- Google service-account login (JWT signed with WebCrypto, no libraries) ----
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
  const jwt = head + '.' + claims + '.' + b64u(sig);
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=' + encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer') + '&assertion=' + encodeURIComponent(jwt),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new Error('token');
  return j.access_token;
}
