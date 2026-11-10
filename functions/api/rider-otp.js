// Cloudflare Pages Function: POST /api/rider-otp   (Rider App "Forgot password")
//   { action: "send",  phone }                      -> sends a 6-digit code by SMS to the rider's number
//   { action: "reset", phone, code, password }      -> checks the code and sets the new password
//
// Rules: the code lives 5 minutes, works once, 5 wrong tries kill it, one SMS per 60 seconds, at most 5 SMS per hour per number.
// Only a hash of the code is stored (collection riderOtps, no client access: the Firestore rules deny everything there).
// Always answers "ok" to "send" even for an unknown number, so nobody can test which numbers are riders.
// Secrets: FIREBASE_SA_LIVE / FIREBASE_SA_TEST (as create-rider.js) and the SMS_* secrets (see _lib/sms.js).
// On staging/test hosts, when no SMS company is set up yet, the code is returned in the reply as devCode so the flow can be tested.
// On the live host it never is.
import { accessToken, isTestHost, loadSa } from '../_lib/google.js';
import { sendSms, smsConfigured } from '../_lib/sms.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...CORS } });
const fail = (code, status, extra) => json({ ok: false, code, ...(extra || {}) }, status);

const PHONE = /^01[0-9]{9}$/;
const TTL = 5 * 60 * 1000, COOLDOWN = 60 * 1000, HOUR = 3600 * 1000, MAX_PER_HOUR = 5, MAX_TRIES = 5;

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS });
}

const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
const hashCode = async (phone, code) => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('cholvo-rider:' + phone + ':' + code)));
const newCode = () => String(crypto.getRandomValues(new Uint32Array(1))[0] % 1000000).padStart(6, '0');

export async function onRequestPost({ request, env }) {
  try {
    const host = new URL(request.url).hostname, test = isTestHost(host);
    const loaded = loadSa(env, test);
    if (loaded.code) return fail(loaded.code, 503);
    const project = loaded.sa.project_id;

    let body;
    try { body = await request.json(); } catch (_) { return fail('bad_request', 400); }
    const action = String((body && body.action) || '');
    const phone = String((body && body.phone) || '').trim();
    if (!PHONE.test(phone)) return fail('bad_request', 400);

    const token = await accessToken(loaded.sa);
    const H = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };
    const fs = 'https://firestore.googleapis.com/v1/projects/' + project + '/databases/(default)/documents/riderOtps/' + phone;
    const idt = 'https://identitytoolkit.googleapis.com/v1/projects/' + project + '/accounts:';

    const readOtp = async () => {
      const r = await fetch(fs, { headers: H });
      if (r.status === 404) return null;
      if (!r.ok) throw new Error('read');
      const f = (await r.json()).fields || {};
      const n = k => (f[k] && f[k].integerValue !== undefined ? Number(f[k].integerValue) : 0);
      return { hash: (f.hash && f.hash.stringValue) || '', expires: n('expires'), tries: n('tries'), sentAt: n('sentAt'), hourStart: n('hourStart'), hourCount: n('hourCount') };
    };
    const writeOtp = async o => {
      const fields = {};
      for (const k of Object.keys(o)) fields[k] = typeof o[k] === 'string' ? { stringValue: o[k] } : { integerValue: String(Math.round(o[k])) };
      const r = await fetch(fs, { method: 'PATCH', headers: H, body: JSON.stringify({ fields }) });
      if (!r.ok) throw new Error('write');
    };
    const delOtp = () => fetch(fs, { method: 'DELETE', headers: H }).catch(() => {});
    const findUser = async () => {
      const lk = await fetch(idt + 'lookup', { method: 'POST', headers: H, body: JSON.stringify({ email: [phone + '@rider.cholvo.app'] }) });
      if (!lk.ok) throw new Error('lookup');
      return ((await lk.json()).users || [])[0] || null;
    };

    const now = Date.now();

    if (action === 'send') {
      const old = await readOtp();
      if (old && now - old.sentAt < COOLDOWN) return fail('rate_limited', 429, { wait: Math.ceil((COOLDOWN - (now - old.sentAt)) / 1000) });
      let hourStart = old && now - old.hourStart < HOUR ? old.hourStart : now;
      let hourCount = old && now - old.hourStart < HOUR ? old.hourCount : 0;
      if (hourCount >= MAX_PER_HOUR) return fail('rate_limited', 429, { wait: Math.ceil((hourStart + HOUR - now) / 1000) });

      const user = await findUser();
      if (!user) return json({ ok: true });                       // same answer as a real rider

      const code = newCode();
      if (!smsConfigured(env) && !test) return fail('sms_not_configured', 503);
      await writeOtp({ hash: await hashCode(phone, code), expires: now + TTL, tries: 0, sentAt: now, hourStart, hourCount: hourCount + 1 });
      if (!smsConfigured(env)) return json({ ok: true, devCode: code, testMode: true });   // staging only
      const sms = await sendSms(env, phone, 'Cholvo Rider: your code is ' + code + '. It is valid for 5 minutes. Do not share it.');
      if (!sms.ok) { await delOtp(); return fail(sms.code, 502); }
      return json({ ok: true });
    }

    if (action === 'reset') {
      const code = String((body && body.code) || '').trim();
      const password = typeof (body && body.password) === 'string' ? body.password : '';
      if (!/^[0-9]{6}$/.test(code)) return fail('bad_code', 400);
      if (password.length < 6) return fail('weak_password', 400);
      if (password.length > 128) return fail('bad_request', 400);

      const o = await readOtp();
      if (!o || !o.hash) return fail('bad_code', 400);
      if (now > o.expires) { await delOtp(); return fail('expired', 400); }
      if (o.tries >= MAX_TRIES) { await delOtp(); return fail('too_many', 429); }
      if ((await hashCode(phone, code)) !== o.hash) {
        await writeOtp({ hash: o.hash, expires: o.expires, tries: o.tries + 1, sentAt: o.sentAt, hourStart: o.hourStart, hourCount: o.hourCount });
        return fail('bad_code', 400);
      }
      await delOtp();                                              // one use only
      const user = await findUser();
      if (!user || !user.localId) return fail('bad_code', 400);
      const up = await fetch(idt + 'update', {
        method: 'POST', headers: H,
        // validSince signs the rider out on every other phone
        body: JSON.stringify({ localId: user.localId, password, validSince: String(Math.floor(Date.now() / 1000)) }),
      });
      if (!up.ok) {
        const ej = await up.json().catch(() => ({}));
        if (/WEAK_PASSWORD/.test((ej.error && ej.error.message) || '')) return fail('weak_password', 400);
        throw new Error('update');
      }
      return json({ ok: true });
    }
    return fail('bad_request', 400);
  } catch (_) {
    return fail('server_error', 502);   // never include secrets or raw errors
  }
}
