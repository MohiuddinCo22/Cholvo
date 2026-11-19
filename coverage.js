/* Coverage explorer: search + division tabs + hex tile map + rate card. Rates come from calculator.js (window.CholvoCalc). */
(() => {
  const root = document.getElementById('cvMap'); if (!root || !window.CholvoCalc) return;
  const DIVISIONS = {
    'Dhaka': ['Dhaka', 'Faridpur', 'Gazipur', 'Gopalganj', 'Kishoreganj', 'Madaripur', 'Manikganj', 'Munshiganj', 'Narayanganj', 'Narsingdi', 'Rajbari', 'Shariatpur', 'Tangail'],
    'Chattogram': ['Bandarban', 'Brahmanbaria', 'Chandpur', 'Chattogram', "Cox's Bazar", 'Cumilla', 'Feni', 'Khagrachhari', 'Lakshmipur', 'Noakhali', 'Rangamati'],
    'Rajshahi': ['Bogura', 'Chapainawabganj', 'Joypurhat', 'Naogaon', 'Natore', 'Pabna', 'Rajshahi', 'Sirajganj'],
    'Khulna': ['Bagerhat', 'Chuadanga', 'Jashore', 'Jhenaidah', 'Khulna', 'Kushtia', 'Magura', 'Meherpur', 'Narail', 'Satkhira'],
    'Barishal': ['Barguna', 'Barishal', 'Bhola', 'Jhalokathi', 'Patuakhali', 'Pirojpur'],
    'Sylhet': ['Habiganj', 'Moulvibazar', 'Sunamganj', 'Sylhet'],
    'Rangpur': ['Dinajpur', 'Gaibandha', 'Kurigram', 'Lalmonirhat', 'Nilphamari', 'Panchagarh', 'Rangpur', 'Thakurgaon'],
    'Mymensingh': ['Jamalpur', 'Mymensingh', 'Netrokona', 'Sherpur']
  };
  const all = Object.entries(DIVISIONS).flatMap(([d, list]) => list.map(n => ({ n, d })));
  /* Hex tile map: [district, row, col]. Odd rows sit half a cell to the right, so the shape follows Bangladesh. */
  const GRID = [['Panchagarh',0,1],['Thakurgaon',1,0],['Nilphamari',1,1],['Lalmonirhat',1,3],['Kurigram',1,4],['Dinajpur',2,1],['Rangpur',2,2],['Gaibandha',2,3],
    ['Joypurhat',3,1],['Jamalpur',3,3],['Sherpur',3,4],['Netrokona',3,5],['Sunamganj',3,7],['Chapainawabganj',4,1],['Naogaon',4,2],['Bogura',4,3],['Mymensingh',4,5],['Sylhet',4,8],
    ['Rajshahi',5,1],['Natore',5,2],['Sirajganj',5,3],['Tangail',5,4],['Kishoreganj',5,5],['Habiganj',5,6],['Moulvibazar',5,7],
    ['Meherpur',6,1],['Kushtia',6,2],['Pabna',6,3],['Manikganj',6,4],['Gazipur',6,5],['Narsingdi',6,6],['Brahmanbaria',6,7],
    ['Chuadanga',7,1],['Jhenaidah',7,2],['Rajbari',7,3],['Dhaka',7,4],['Narayanganj',7,5],['Cumilla',7,6],
    ['Magura',8,2],['Faridpur',8,3],['Munshiganj',8,5],['Chandpur',8,6],['Feni',8,7],['Khagrachhari',8,8],
    ['Jashore',9,1],['Narail',9,2],['Gopalganj',9,3],['Madaripur',9,4],['Shariatpur',9,5],['Lakshmipur',9,6],['Noakhali',9,7],
    ['Satkhira',10,2],['Khulna',10,3],['Bagerhat',10,4],['Jhalokathi',10,5],['Bhola',10,6],['Rangamati',10,8],
    ['Pirojpur',11,4],['Barishal',11,5],['Chattogram',11,7],['Barguna',12,4],['Patuakhali',12,5],['Bandarban',12,8],["Cox's Bazar",13,8]];
  const TINT = { Dhaka: '#BFD7FF', Chattogram: '#C9C3F5', Rajshahi: '#BDEBD3', Khulna: '#F6E3A6', Barishal: '#F9C9D4', Sylhet: '#AEE6EA', Rangpur: '#D9E4A8', Mymensingh: '#E7CDB4' };
  const LABEL = { Panchagarh: 'Pancha|garh', Thakurgaon: 'Thakur|gaon', Nilphamari: 'Nilpha|mari', Lalmonirhat: 'Lalmoni|rhat', Joypurhat: 'Joypur|hat', Chapainawabganj: 'Chapai|Nawab|ganj', Netrokona: 'Netro|kona', Sunamganj: 'Sunam|ganj', Moulvibazar: 'Moulvi|bazar', Brahmanbaria: 'Brahman|baria', Kishoreganj: 'Kishore|ganj', Narayanganj: 'Narayan|ganj', Munshiganj: 'Munshi|ganj', Shariatpur: 'Shariat|pur', Madaripur: 'Madari|pur', Gopalganj: 'Gopal|ganj', Manikganj: 'Manik|ganj', Chuadanga: 'Chua|danga', Jhenaidah: 'Jhenai|dah', Khagrachhari: 'Khagra|chhari', Lakshmipur: 'Laksh|mipur', Jhalokathi: 'Jhalo|kathi', Patuakhali: 'Patua|khali', Chattogram: 'Chatto|gram', Mymensingh: 'Mymen|singh', Gaibandha: 'Gaiban|dha', Bandarban: 'Bandar|ban', Rangamati: 'Ranga|mati', Sirajganj: 'Siraj|ganj', "Cox's Bazar": "Cox's|Bazar" };
  const divOf = Object.fromEntries(all.map(x => [x.n, x.d]));
  const PW = 60, PH = 52, R = 29, HUB = 'Chattogram';
  const pos = (r, c) => [c * PW + (r % 2 ? PW / 2 : 0) + PW / 2, r * PH + PH / 2 + 8];
  const hexPts = (cx, cy, r) => [0, 1, 2, 3, 4, 5].map(k => { const a = Math.PI / 180 * (60 * k - 30); return (cx + r * Math.cos(a)).toFixed(1) + ',' + (cy + r * Math.sin(a)).toFixed(1); }).join(' ');
  const esc = s => s.replace(/'/g, '&#39;');
  const XY = Object.fromEntries(GRID.map(([n, r, c]) => [n, pos(r, c)]));
  const $ = s => document.querySelector(s), tabs = $('#cvTabs'), card = $('#cvCard'), q = $('#cvq'), empty = $('#cvEmpty');
  const C = window.CholvoCalc, taka = n => '৳' + n;
  let div = 'All', sel = 'Chattogram', view = window.CHOLVO_GEO ? 'geo' : 'hex';
  const calcName = n => n === 'Chattogram' ? 'Chattogram City' : n === 'Dhaka' ? 'Dhaka City' : n;

  function drawTabs() {
    const items = [['All', all.length], ...Object.entries(DIVISIONS).map(([d, l]) => [d, l.length])];
    tabs.innerHTML = items.map(([d, c]) => `<button type="button" role="tab" aria-selected="${d === div}" class="${d === div ? 'on' : ''}" data-d="${d}">${TINT[d] ? `<i style="background:${TINT[d]}"></i>` : ''}${d} <small>${c}</small></button>`).join('');
  }
  const GEO = window.CHOLVO_GEO;
  function buildGeo() {
    if (!GEO) return false;
    const cells = all.map(({ n }) => { const d = divOf[n], [x, y] = GEO.c[n], hub = n === HUB;
      return `<g class="hx gx${hub ? ' hub' : ''}" data-n="${esc(n)}" tabindex="0" role="button" aria-label="${esc(n)}, ${d} division" style="--t:${TINT[d]}"><path d="${GEO.paths[n]}"/>${hub ? `<circle class="hubpin" cx="${x}" cy="${y}" r="5"/><circle class="pulse" cx="${x}" cy="${y}" r="7"/>` : ''}<text class="gl" x="${x}" y="${y - 9}">${esc(n)}</text></g>`; }).join('');
    root.insertAdjacentHTML('afterbegin', `<svg class="v-geo" viewBox="0 0 ${GEO.w} ${GEO.h}" role="group" aria-label="Map of Bangladesh districts"><defs><filter id="cvSh2" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#071A3A" flood-opacity=".35"/></filter></defs>
      <text class="sea" x="${GEO.w * .08}" y="${GEO.h * .9}">Bay of Bengal</text><text class="sea" x="${GEO.w * .93}" y="${GEO.h * .72}" text-anchor="end">Myanmar</text><text class="sea" x="${GEO.w * .08}" y="${GEO.h * .08}">India</text>
      <g class="compass" transform="translate(${GEO.w - 30} 30)"><circle r="17"/><path d="M0-12 L5 4 L0 1 L-5 4Z"/><text y="-21">N</text></g>
      ${cells}<path class="route" id="cvRouteG" d=""/></svg>`);
    return true;
  }
  function buildMap() {
    const W = 10 * PW + 10, H = 14 * PH + 24;
    const cells = GRID.map(([n]) => {
      const [x, y] = XY[n], d = divOf[n], lines = (LABEL[n] || n).split('|'), hub = n === HUB;
      const t = lines.map((l, i) => `<tspan x="${x}" dy="${i ? 10.5 : -(lines.length - 1) * 5.25 + 3.5}">${esc(l)}</tspan>`).join('');
      return `<g class="hx${hub ? ' hub' : ''}" data-n="${esc(n)}" tabindex="0" role="button" aria-label="${esc(n)}, ${d} division" style="--t:${TINT[d]}"><polygon points="${hexPts(x, y, R)}"/>${hub ? `<circle class="pulse" cx="${x}" cy="${y}" r="${R - 6}"/>` : ''}<text x="${x}" y="${y}">${t}</text></g>`;
    }).join('');
    root.insertAdjacentHTML('beforeend', `<svg class="v-hex" viewBox="0 0 ${W} ${H}" role="group" aria-label="Map of Bangladesh districts"><defs><filter id="cvSh" x="-30%" y="-30%" width="160%" height="170%"><feDropShadow dx="0" dy="5" stdDeviation="5" flood-color="#071A3A" flood-opacity=".28"/></filter></defs>
      <text class="sea" x="${PW * 1.2}" y="${H - 70}">Bay of Bengal</text><text class="sea" x="${PW * 7.6}" y="${H - 14}" text-anchor="middle">Myanmar</text><text class="sea" x="${PW * 0.55}" y="${PH * 1.1}" transform="rotate(-90 ${PW * 0.55} ${PH * 1.1})" style="display:none">India</text>
      <g class="compass" transform="translate(${W - 34} 34)"><circle r="17"/><path d="M0-12 L5 4 L0 1 L-5 4Z"/><text y="-21">N</text></g>
      <path class="route" id="cvRoute" d=""/>${cells}</svg>`);
  }
  function drawList() {
    const term = q.value.trim().toLowerCase(), hit = n => (div === 'All' || divOf[n] === div) && n.toLowerCase().includes(term);
    let count = 0;
    root.querySelectorAll('.hx').forEach(g => { const first = g.closest('svg').classList.contains(view === 'geo' ? 'v-geo' : 'v-hex'); const n = g.dataset.n, on = hit(n); g.classList.toggle('dim', !on); g.classList.toggle('sel', n === sel); g.setAttribute('aria-pressed', n === sel); if (on && first) count++; });
    root.querySelectorAll('.hx.sel').forEach(s => s.parentNode.insertBefore(s, s.parentNode.querySelector('.route')));
    empty.hidden = count > 0;
    const curve = (a, b) => a === b ? '' : `M${a[0]} ${a[1]} Q${(a[0] + b[0]) / 2 - (b[1] - a[1]) * .2} ${(a[1] + b[1]) / 2 + (b[0] - a[0]) * .2} ${b[0]} ${b[1]}`;
    $('#cvRoute').setAttribute('d', curve(XY[HUB], XY[sel]));
    if (GEO) $('#cvRouteG').setAttribute('d', curve(GEO.c[HUB], GEO.c[sel]));
    const pk = $('#cvPick'); if (pk) pk.innerHTML = `<b>${sel}</b><span>${divOf[sel]} division</span><a href="#cvCard">See rates ↓</a>`;
  }
  function drawCard() {
    const x = all.find(i => i.n === sel), home = sel === 'Chattogram', row = (k, v) => `<div><dt>${k}</dt><dd>${v}</dd></div>`;
    const reg = (w, s = 'regular', d = 'home') => taka(C.charge(!home ? false : true, w, s, d));
    card.innerHTML = `<p class="cv-div">${x.d} division</p><h3>${x.n}</h3>
     <p class="cv-from">${home ? 'Inside Chattogram City' : 'From Chattogram City'}</p>
     <dl>${row('Regular, 0.5 kg', reg(.5))}${row('Regular, 1 kg', reg(1))}${home ? row('Express, 0.5 kg', reg(.5, 'express')) : ''}${row('Point delivery, 0.5 kg', reg(.5, 'regular', 'point'))}${row('Each extra kg', '+' + taka(C.RATES.perKgAfterFirst))}</dl>
     <p class="cv-note">${home ? `Outside the city, charges start at ${taka(C.charge(false, .5, 'regular', 'home'))}.` : 'Express is available only inside one district.'}</p>
     <a class="btn b-or" href="#pricing" id="cvCalc">Calculate exact charge</a>`;
    $('#cvCalc').onclick = () => {
      const f = $('#from'), t = $('#to'); f.value = 'Chattogram City'; t.value = calcName(sel);
      t.dispatchEvent(new Event('change', { bubbles: true }));
    };
  }
  tabs.onclick = e => { const b = e.target.closest('button'); if (!b) return; div = b.dataset.d; drawTabs(); drawList(); };
  const pick = g => { sel = g.dataset.n; drawList(); drawCard(); };
  root.onclick = e => { const g = e.target.closest('.hx'); if (g) pick(g); };
  root.onkeydown = e => { const g = e.target.closest('.hx'); if (g && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); pick(g); } };
  const tip = $('#cvTip');
  root.onmouseover = e => { const g = e.target.closest('.hx'); if (!g || g.classList.contains('dim')) { tip.classList.remove('on'); return; } const b = g.getBoundingClientRect(), p = root.getBoundingClientRect(); tip.innerHTML = `<b>${g.dataset.n}</b><span>${divOf[g.dataset.n]}</span>`; tip.style.left = (b.left - p.left + b.width / 2) + 'px'; tip.style.top = (b.top - p.top) + 'px'; tip.classList.add('on'); };
  root.onmouseleave = () => tip.classList.remove('on');
  q.oninput = drawList;
  buildGeo(); buildMap(); root.dataset.view = view;
  const vt = $('#cvView'); if (vt) { vt.hidden = !GEO; vt.onclick = e => { const b = e.target.closest('button'); if (!b) return; view = b.dataset.v; root.dataset.view = view; vt.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); drawList(); }; }
  drawTabs(); drawList(); drawCard();
})();
