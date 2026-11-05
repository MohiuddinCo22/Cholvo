// Cloudflare Pages Function: POST /api/media
// Receives a voice message and/or photos from the website or the merchant app and forwards them to a PRIVATE Telegram group.
// Secrets (Cloudflare Pages > Settings > Variables and Secrets) - never put these in the repo:
//   TELEGRAM_BOT_TOKEN   bot token from @BotFather
//   TELEGRAM_CHAT_LIVE   chat id of the "Cholvo Orders (Live)" group (used on cholvo.pages.dev)
//   TELEGRAM_CHAT_TEST   chat id of the "Cholvo Orders (Test)" group (used on preview / localhost hosts)
//   TURNSTILE_SECRET     Cloudflare Turnstile secret key (guests on the live site are checked with it)

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...CORS } });

const TN = /^CHV-[A-HJ-NP-Z2-9]{6}$/;
const PHONE = /^01[0-9]{9}$/;
const MAX_VOICE = 4 * 1024 * 1024;   // ~60 s of mp3 is well under this
const MAX_PHOTO = 4 * 1024 * 1024;   // the browser shrinks photos before sending
const MAX_PHOTOS = 3;
const MAX_BODY = 18 * 1024 * 1024;
const PROJECT = { live: 'chovo-35252', test: 'cholvo-staging' };

// Same hosts that env.js treats as staging. Everything else (cholvo.pages.dev, GitHub Pages) is live.
const isTestHost = h => h === 'localhost' || h === '127.0.0.1' || /\.cholvo\.pages\.dev$/.test(h) || /\.app\.github\.dev$/.test(h);

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function onRequestPost({ request, env }) {
  try {
    const test = isTestHost(new URL(request.url).hostname);
    const token = env.TELEGRAM_BOT_TOKEN;
    const chat = test ? env.TELEGRAM_CHAT_TEST : env.TELEGRAM_CHAT_LIVE;
    if (!token || !chat) return json({ error: 'Voice and photo sending is not set up yet.' }, 503);

    if (!(request.headers.get('content-type') || '').includes('multipart/form-data')) return json({ error: 'Bad request' }, 400);
    if ((+request.headers.get('content-length') || 0) > MAX_BODY) return json({ error: 'Files are too large.' }, 413);

    const fd = await request.formData();
    const tn = String(fd.get('tn') || '');
    const type = String(fd.get('type') || '');
    const phone = String(fd.get('phone') || '');
    const text = String(fd.get('text') || '').slice(0, 900);
    if (!TN.test(tn)) return json({ error: 'Bad tracking number' }, 400);
    if (type !== 'book' && type !== 'order') return json({ error: 'Bad order type' }, 400);
    if (!PHONE.test(phone)) return json({ error: 'Please enter a valid phone number (01XXXXXXXXX).' }, 400);

    const isFile = v => v && typeof v === 'object' && typeof v.arrayBuffer === 'function';
    const voice = isFile(fd.get('voice')) ? fd.get('voice') : null;
    const photos = fd.getAll('photo').filter(isFile);
    if (!voice && !photos.length) return json({ error: 'Nothing to send' }, 400);
    if (photos.length > MAX_PHOTOS) return json({ error: 'You can send up to 3 photos.' }, 400);
    if (voice && (voice.size === 0 || voice.size > MAX_VOICE || !/^audio\//.test(voice.type))) return json({ error: 'The voice message is too long or not supported.' }, 400);
    for (const p of photos) if (p.size === 0 || p.size > MAX_PHOTO || !/^image\/(jpeg|png|webp)$/.test(p.type)) return json({ error: 'A photo is too large or not supported.' }, 400);

    // Who is sending: an approved merchant (checked with their own login token) or a guest (robot check).
    let who = 'Guest (website)';
    const idToken = String(fd.get('idToken') || '');
    if (idToken) {
      const m = await approvedMerchant(idToken, test ? PROJECT.test : PROJECT.live);
      if (!m) return json({ error: 'Merchant login could not be verified. Please log in again.' }, 401);
      who = 'Merchant: ' + (m.businessName || m.phone || m.uid);
    } else if (!test) {
      const ok = await turnstileOk(fd.get('cf-turnstile-response'), env.TURNSTILE_SECRET, request.headers.get('CF-Connecting-IP'));
      if (!ok) return json({ error: 'Robot check failed. Please try again.' }, 403);
    }

    const label = type === 'order' ? 'Order anything' : 'Book delivery';
    const head = [
      (test ? '🧪 TEST — ' : '') + '🎤📷 NEW MEDIA ORDER',
      'Tracking: ' + tn,
      'Type: ' + label,
      'From: ' + who,
      'Phone: ' + phone,
      'Voice: ' + (voice ? 'yes' : 'no') + ' · Photos: ' + photos.length,
      text ? '\nDetails:\n' + text : '',
    ].filter(Boolean).join('\n');

    await tg(token, 'sendMessage', form({ chat_id: chat, text: head.slice(0, 4000) }));

    if (voice) {
      const ext = /mpeg|mp3/.test(voice.type) ? 'mp3' : /mp4|m4a|aac/.test(voice.type) ? 'm4a' : /ogg|opus/.test(voice.type) ? 'ogg' : 'webm';
      const playable = ext !== 'webm'; // Telegram plays mp3/m4a/ogg as voice; other formats go as a file
      const f = form({ chat_id: chat, caption: tn });
      f.append(playable ? 'voice' : 'document', new File([await voice.arrayBuffer()], tn + '.' + ext, { type: voice.type }));
      await tg(token, playable ? 'sendVoice' : 'sendDocument', f);
    }

    if (photos.length === 1) {
      const f = form({ chat_id: chat, caption: tn });
      f.append('photo', new File([await photos[0].arrayBuffer()], tn + '.jpg', { type: photos[0].type }));
      await tg(token, 'sendPhoto', f);
    } else if (photos.length > 1) {
      const f = form({ chat_id: chat });
      const media = [];
      for (let i = 0; i < photos.length; i++) {
        f.append('p' + i, new File([await photos[i].arrayBuffer()], tn + '-' + (i + 1) + '.jpg', { type: photos[i].type }));
        media.push({ type: 'photo', media: 'attach://p' + i, ...(i === 0 ? { caption: tn } : {}) });
      }
      f.append('media', JSON.stringify(media));
      await tg(token, 'sendMediaGroup', f);
    }

    return json({ ok: true });
  } catch (e) {
    return json({ error: 'Could not send. Please try again.' }, 502);
  }
}

function form(obj) {
  const f = new FormData();
  for (const [k, v] of Object.entries(obj)) f.append(k, v);
  return f;
}

async function tg(token, method, body) {
  const r = await fetch('https://api.telegram.org/bot' + token + '/' + method, { method: 'POST', body });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.ok) throw new Error('Telegram ' + method + ' failed'); // never include the token in errors
}

async function turnstileOk(response, secret, ip) {
  if (!response || !secret) return false; // fail closed if the secret is missing
  const b = new FormData();
  b.append('secret', secret);
  b.append('response', String(response));
  if (ip) b.append('remoteip', ip);
  const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: b });
  const j = await r.json().catch(() => ({}));
  return j.success === true;
}

// Asks Firestore for merchants/{uid} using the merchant's own login token.
// Firestore itself validates the token and the rules only allow a merchant to read their own document,
// so a 200 answer proves the login is real. We also require blocked == false.
async function approvedMerchant(idToken, project) {
  try {
    const part = idToken.split('.')[1];
    if (!part) return null;
    const payload = JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/')));
    const uid = payload.user_id || payload.sub;
    if (!uid || payload.aud !== project || !/^[A-Za-z0-9]{10,64}$/.test(uid)) return null;
    const r = await fetch('https://firestore.googleapis.com/v1/projects/' + project + '/databases/(default)/documents/merchants/' + uid,
      { headers: { Authorization: 'Bearer ' + idToken } });
    if (!r.ok) return null;
    const d = (await r.json()).fields || {};
    if (!d.blocked || d.blocked.booleanValue !== false) return null;
    return { uid, phone: d.phone && d.phone.stringValue, businessName: d.businessName && d.businessName.stringValue };
  } catch (_) { return null; }
}
