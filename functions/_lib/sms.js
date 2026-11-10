// The ONE place that knows how to send an SMS. To change SMS company (or move to a new host), edit only this file.
//
// Secrets (Cloudflare Pages > Settings > Variables and Secrets, or your own server's environment):
//   SMS_PROVIDER   "bulksmsbd"  (more providers can be added below)
//   SMS_API_KEY    the API key from the SMS company
//   SMS_SENDER     the approved sender id / mask
//
// sendSms returns { ok: true } or { ok: false, code: 'sms_not_configured' | 'sms_failed' }.
export function smsConfigured(env) {
  return !!(env.SMS_PROVIDER && env.SMS_API_KEY);
}

export async function sendSms(env, phone, text) {
  if (!smsConfigured(env)) return { ok: false, code: 'sms_not_configured' };
  try {
    if (env.SMS_PROVIDER === 'bulksmsbd') {
      // Example provider. Check the parameters against your own SMS company's documentation before going live.
      const url = 'http://bulksmsbd.net/api/smsapi?' + new URLSearchParams({
        api_key: env.SMS_API_KEY, type: 'text', number: '88' + phone, senderid: env.SMS_SENDER || '', message: text,
      });
      const r = await fetch(url);
      return r.ok ? { ok: true } : { ok: false, code: 'sms_failed' };
    }
    return { ok: false, code: 'sms_not_configured' };
  } catch (_) {
    return { ok: false, code: 'sms_failed' };
  }
}
