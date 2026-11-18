/* CHOLVO delivery charge calculator (rates are defined in RATES below). */
(() => {
  const $ = s => document.querySelector(s), form = $('#calcForm'); if (!form) return;
  const DISTRICTS = ['Bagerhat','Bandarban','Barguna','Barishal','Bhola','Bogura','Brahmanbaria','Chandpur','Chapainawabganj','Chattogram District','Chuadanga',"Cox's Bazar",'Cumilla','Dhaka District','Dinajpur','Faridpur','Feni','Gaibandha','Gazipur','Gopalganj','Habiganj','Jamalpur','Jashore','Jhalokathi','Jhenaidah','Joypurhat','Khagrachhari','Khulna','Kishoreganj','Kurigram','Kushtia','Lakshmipur','Lalmonirhat','Madaripur','Magura','Manikganj','Meherpur','Moulvibazar','Munshiganj','Mymensingh','Naogaon','Narail','Narayanganj','Narsingdi','Natore','Netrokona','Nilphamari','Noakhali','Pabna','Panchagarh','Patuakhali','Pirojpur','Rajbari','Rajshahi','Rangamati','Rangpur','Satkhira','Shariatpur','Sherpur','Sirajganj','Sunamganj','Sylhet','Tangail','Thakurgaon'];
  const RATES = {
    sameCity: { base: 65, firstExtra: 10, expressAdd: 45 },   // 0.5 kg regular home = 65, up to 1 kg +10, express home = 110
    otherDistrict: { base: 115, firstExtra: 20 },             // 0.5 kg = 115, up to 1 kg = 135
    perKgAfterFirst: 20, pointDiscount: 15, codPercent: 1, maxKg: 600
  };
  const opts = ['Chattogram City', 'Dhaka City', ...DISTRICTS].map(n => `<option>${n}</option>`).join('');
  const from = $('#from'), to = $('#to'), wt = $('#wt'), cod = $('#cod');
  from.innerHTML = to.innerHTML = opts;
  const taka = n => '৳' + (+n.toFixed(2));
  const radio = name => form.querySelector(`input[name=${name}]:checked`).value;
  const setRadio = (name, v) => form.querySelector(`input[name=${name}][value=${v}]`).checked = true;
  const name = s => s.replace(/ (City|District)$/, '');

  function charge(same, w, svc, del) {
    const r = same ? RATES.sameCity : RATES.otherDistrict;
    const regular = r.base + (w > .5 ? r.firstExtra : 0) + RATES.perKgAfterFirst * Math.ceil(Math.max(0, +(w - 1).toFixed(4)));
    if (svc === 'express') return same && del === 'home' ? regular + RATES.sameCity.expressAdd : null;
    return del === 'point' ? regular - RATES.pointDiscount : regular;
  }
  const set = (id, v) => { $(id).textContent = v; };

  function update() {
    const same = from.value === to.value, w = parseFloat(wt.value), ok = w >= .5 && w <= RATES.maxKg;
    if (!same && radio('service') === 'express') setRadio('service', 'regular');
    if (radio('service') === 'express' && radio('delivery') === 'point') setRadio('delivery', 'home');
    const svc = radio('service'), del = radio('delivery'), c = Math.max(0, +cod.value || 0), ww = ok ? w : .5;
    $('[name=service][value=express]').disabled = !same;
    $('[name=delivery][value=point]').disabled = svc === 'express';
    const label = same ? 'Inside ' + name(from.value) : name(from.value) + ' to outside ' + name(from.value);
    set('#routeTxt', label); set('#routeTxt2', label);
    const price = (id, v) => set(id, v == null ? 'Not available' : taka(v));
    price('#pReg', charge(same, ww, 'regular', del));
    price('#pExp', same ? charge(true, ww, 'express', 'home') : null);
    price('#pHome', charge(same, ww, svc, 'home'));
    price('#pPoint', svc === 'express' ? null : charge(same, ww, 'regular', 'point'));
    $('#wErr').hidden = ok; $('#wt').setAttribute('aria-invalid', !ok);
    document.querySelectorAll('#chips button').forEach(b => b.classList.toggle('on', ok && +b.dataset.w === w));
    const d = charge(same, ww, svc, del), fee = c * RATES.codPercent / 100;
    set('#total', ok ? taka(d + fee) : '—'); set('#rDel', ok ? taka(d) : '—'); set('#rCod', taka(fee));
    $('#rCodW').hidden = !c; $('#rGetW').hidden = !c || !ok;
    set('#rGet', taka(Math.max(0, c - d - fee)));
    const s = $('#save'); s.hidden = svc === 'express' || !ok;
    s.textContent = del === 'point' ? `You save ${taka(RATES.pointDiscount)} with point delivery` : `Point delivery saves you ${taka(RATES.pointDiscount)}`;
  }
  form.addEventListener('input', update); form.addEventListener('change', update);
  const step = dir => { const w = parseFloat(wt.value); wt.value = Math.min(RATES.maxKg, Math.max(.5, (isNaN(w) ? .5 : w) + dir * .5)); update(); };
  $('#wm').onclick = () => step(-1); $('#wp').onclick = () => step(1);
  $('#chips').onclick = e => { const b = e.target.closest('button'); if (b) { wt.value = b.dataset.w; update(); } };
  $('#swap').onclick = () => { [from.value, to.value] = [to.value, from.value]; update(); };
  window.CholvoCalc = { charge, RATES };
  update();
})();
