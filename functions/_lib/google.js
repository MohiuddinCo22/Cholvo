// Shared helpers for server functions: service-account login (Google OAuth) + staging/live switch.
// Web-standard APIs only (fetch, crypto.subtle), so the same code runs on Cloudflare Pages Functions and on Node 18+.
export const isTestHost = h => h === 'localhost' || h === '127.0.0.1' || /\.cholvo\.pages\.dev$/.test(h) || /\.app\.github\.dev$/.test(h);

export function loadSa(env, test) {
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

export async function accessToken(sa) {
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
