/* Cholvo: road distance + delivery charge for the price calculator.
   Distance comes from /api/route (Cloudflare Pages Function, key stays secret on the server). */
(() => {
  const $ = s => document.querySelector(s);
  const form = $('#calcForm'), pick = $('#pick'), del = $('#addr'), dist = $('#dist'), out = $('#out'), codEl = $('#cod');
  if (!form || !pick || !del || !dist || !out) return;

  pick.required = true; del.required = true;
  const hint = dist.parentElement.querySelector('.hint');
  const HINT_AUTO = 'Calculated automatically from pickup and delivery addresses.';
  const HINT_MANUAL = 'Automatic distance failed. Type the distance in km and press Calculate.';

  let manual = false;
  const setManual = on => {
    manual = on;
    dist.readOnly = !on; dist.required = on;
    dist.placeholder = on ? 'Enter km' : 'Auto';
    if (hint) hint.textContent = on ? HINT_MANUAL : HINT_AUTO;
    if (!on) dist.value = '';
  };
  setManual(false);
  // new addresses typed -> go back to automatic distance
  [pick, del].forEach(i => i.addEventListener('input', () => { if (manual) setManual(false); }));

  // add the city when the person did not type it
  const place = v => {
    let a = v.trim();
    if (!/chattogram|chittagong|ctg/i.test(a)) a += ', Chattogram';
    return a + ', Bangladesh';
  };

  async function roadKm() {
    const params = new URLSearchParams({ origin: place(pick.value), destination: place(del.value) });
    const res = await fetch('/api/route?' + params);
    let data = {};
    try { data = await res.json(); } catch (_) {}
    if (!res.ok || typeof data.distanceKm !== 'number') throw new Error(data.error || 'Could not calculate road distance');
    return data.distanceKm;
  }

  const money = n => '৳' + n.toFixed(2).replace(/\.00$/, '');

  // up to 1 km 80 | 2 km 100 | 3 km 120 | 5 km 140 | then +10 per extra km (part km counts as full)
  function deliveryCharge(km) {
    if (!Number.isFinite(km) || km <= 0) throw new Error('Invalid road distance');
    if (km <= 1) return 80;
    if (km <= 2) return 100;
    if (km <= 3) return 120;
    if (km <= 5) return 140;
    return 140 + Math.ceil(km - 5) * 10;
  }

  function show(km) {
    const cod = Math.max(0, +codEl.value || 0);
    const delivery = deliveryCharge(km);
    const codFee = cod * 0.01;
    out.className = '';
    out.innerHTML = `
      <div class="row"><span>Distance by road</span><span>${km.toFixed(1)} km</span></div>
      <div class="row"><span>Delivery charge</span><span>${money(delivery)}</span></div>
      <div class="row"><span>COD charge (1% of ${money(cod)})</span><span>${money(codFee)}</span></div>
      <div class="total"><span>Grand total</span><b>${money(delivery + codFee)}</b></div>`;
  }

  form.onsubmit = async e => {
    e.preventDefault();
    const btn = form.querySelector('button[type=submit]');
    if (manual) {
      const km = +dist.value;
      if (km > 0) show(km); else { out.className = 'empty'; out.textContent = 'Please enter a distance in km.'; }
      return;
    }
    btn.disabled = true; out.className = 'empty'; out.textContent = 'Checking distance…';
    try {
      const km = await roadKm();
      dist.value = km.toFixed(1);
      show(km);
    } catch (err) {
      setManual(true);
      out.className = 'empty';
      out.textContent = 'Could not find the distance. Add the area name to both addresses, or type the distance in km and press Calculate.';
    }
    btn.disabled = false;
  };
})();
