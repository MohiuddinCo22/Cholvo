// Cloudflare Pages Function: GET /api/route?origin=...&destination=...
// Needs the secret GEOAPIFY_API_KEY (Cloudflare Pages > Settings > Variables and Secrets).
const JSON_HEADERS = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
const reply = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });

// Chattogram city centre, used to prefer local matches
const BIAS = 'proximity:91.8325,22.3569';

async function geocode(text, key) {
  const p = new URLSearchParams({ text, filter: 'countrycode:bd', bias: BIAS, limit: '1', apiKey: key });
  const r = await fetch('https://api.geoapify.com/v1/geocode/search?' + p);
  if (!r.ok) throw new Error('Address search failed');
  const f = (await r.json()).features?.[0];
  if (!f) throw new Error('Address not found: ' + text);
  const [lon, lat] = f.geometry.coordinates;
  return { lat, lon };
}

export async function onRequestGet({ request, env }) {
  try {
    const key = env.GEOAPIFY_API_KEY;
    if (!key) return reply({ error: 'Distance service is not configured' }, 500);

    const u = new URL(request.url);
    const origin = (u.searchParams.get('origin') || '').trim().slice(0, 200);
    const destination = (u.searchParams.get('destination') || '').trim().slice(0, 200);
    if (!origin || !destination) return reply({ error: 'Pickup and delivery addresses are required' }, 400);

    const [a, b] = await Promise.all([geocode(origin, key), geocode(destination, key)]);

    const p = new URLSearchParams({ waypoints: `${a.lat},${a.lon}|${b.lat},${b.lon}`, mode: 'drive', apiKey: key });
    const r = await fetch('https://api.geoapify.com/v1/routing?' + p);
    if (!r.ok) throw new Error('Road route could not be calculated');
    const meters = (await r.json()).features?.[0]?.properties?.distance;
    if (typeof meters !== 'number') throw new Error('Route distance was not returned');

    return reply({ distanceKm: Math.round(meters / 10) / 100 });
  } catch (e) {
    return reply({ error: e.message || 'Unable to calculate road distance' }, 400);
  }
}
