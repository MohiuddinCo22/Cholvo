/* Coverage explorer: search + division tabs + district list + rate card. Rates come from calculator.js (window.CholvoCalc). */
(() => {
  const root = document.getElementById('cvList'); if (!root || !window.CholvoCalc) return;
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
  const $ = s => document.querySelector(s), tabs = $('#cvTabs'), card = $('#cvCard'), q = $('#cvq'), empty = $('#cvEmpty');
  const C = window.CholvoCalc, taka = n => '৳' + n;
  let div = 'All', sel = 'Chattogram';
  const calcName = n => n === 'Chattogram' ? 'Chattogram City' : n === 'Dhaka' ? 'Dhaka City' : n;

  function drawTabs() {
    const items = [['All', all.length], ...Object.entries(DIVISIONS).map(([d, l]) => [d, l.length])];
    tabs.innerHTML = items.map(([d, c]) => `<button type="button" role="tab" aria-selected="${d === div}" class="${d === div ? 'on' : ''}" data-d="${d}">${d} <small>${c}</small></button>`).join('');
  }
  function drawList() {
    const term = q.value.trim().toLowerCase();
    const rows = all.filter(x => (div === 'All' || x.d === div) && x.n.toLowerCase().includes(term));
    root.innerHTML = rows.map(x => `<button type="button" class="${x.n === sel ? 'on' : ''}${x.n === 'Chattogram' ? ' hub' : ''}" data-n="${x.n}" aria-pressed="${x.n === sel}"><span>${x.n}</span>${x.n === 'Chattogram' ? '<small>CHOLVO hub</small>' : `<small>${x.d}</small>`}</button>`).join('');
    empty.hidden = rows.length > 0;
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
  root.onclick = e => { const b = e.target.closest('button'); if (!b) return; sel = b.dataset.n; drawList(); drawCard(); };
  q.oninput = drawList;
  drawTabs(); drawList(); drawCard();
})();
