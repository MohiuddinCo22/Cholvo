/* CHOLVO hero journey: a scroll-driven CSS 3D story.
   Delivery office -> shutter opens -> van drives out -> city -> parcel lands on a doorstep.
   Pure CSS 3D + one rAF loop, no libraries. Disabled for reduced-motion (static hero shows instead). */
(() => {
  'use strict';
  const sec = document.getElementById('home');
  if (!sec || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const cam = document.getElementById('h3Cam'), world = document.getElementById('h3World');
  if (!cam || !world) return;
  sec.classList.add('h3-on');

  /* ---------- helpers ---------- */
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const sm = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
  const DEG = 180 / Math.PI;
  let seed = 11;
  const rnd = () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const rr = (a, b) => a + rnd() * (b - a);
  const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const shade = (h, f) => { const c = hex(h).map(v => f < 0 ? v * (1 + f) : v + (255 - v) * f); return `rgb(${c.map(v => Math.round(v)).join(',')})`; };
  const keys = (arr, p) => { // piecewise smooth interpolation of [[p,v],...]
    if (p <= arr[0][0]) return arr[0][1];
    for (let i = 1; i < arr.length; i++) if (p <= arr[i][0]) { const a = arr[i - 1], b = arr[i]; return lerp(a[1], b[1], sm(a[0], b[0], p)); }
    return arr[arr.length - 1][1];
  };
  const mixc = (a, b, t) => { const x = hex(a), y = hex(b); return '#' + x.map((v, i) => Math.round(lerp(v, y[i], t)).toString(16).padStart(2, '0')).join(''); };

  /* ---------- 3D builders ---------- */
  const items = []; // cullable scenery
  const mk = (cls, css) => { const e = document.createElement('div'); e.className = cls; if (css) e.style.cssText = css; return e; };
  const reg = (el, x, z, r) => { items.push({ el, x, z, r: r || 0, on: true }); return el; };
  const SH = { front: 0, right: -.2, left: -.08, back: -.3, top: .14 };

  function box(o) {
    const { w, h, d } = o, c = o.c || '#ccc', g = mk('bx' + (o.dbl ? ' dbl' : ''));
    g.style.transform = `translate3d(${o.x || 0}px,${-(o.y || 0) - h / 2}px,${o.z || 0}px)` + (o.ry ? ` rotateY(${o.ry}deg)` : '');
    const face = (n, W, H, tr) => {
      if (o.skip && o.skip.includes(n)) return;
      const f = mk('fc');
      const col = (o.fc && o.fc[n]) || shade(c, SH[n]);
      f.style.cssText = `width:${W}px;height:${H}px;margin:${-H / 2}px 0 0 ${-W / 2}px;transform:${tr};background-color:${col};${(o.img && o.img[n]) || ''}`;
      if (o.txt && o.txt[n]) { f.classList.add('tx'); f.textContent = o.txt[n][0]; f.style.cssText += o.txt[n][1] || ''; }
      g.appendChild(f);
    };
    face('front', w, h, `translateZ(${d / 2}px)`);
    face('back', w, h, `rotateY(180deg) translateZ(${d / 2}px)`);
    face('right', d, h, `rotateY(90deg) translateZ(${w / 2}px)`);
    face('left', d, h, `rotateY(-90deg) translateZ(${w / 2}px)`);
    face('top', w, d, `rotateX(90deg) translateZ(${h / 2}px)`);
    return g;
  }
  function plane(o) { // flat on the ground: w along x, l along z (before ry)
    return mk('pl', `width:${o.w}px;height:${o.l}px;margin:${-o.l / 2}px 0 0 ${-o.w / 2}px;transform:translate3d(${o.x}px,${-(o.y || 0)}px,${o.z}px) rotateY(${o.ry || 0}deg) rotateX(90deg);${o.css || ''}`);
  }
  const winTile = lit => {
    let r = '';
    for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) r += `<rect x='${i * 34 + 8}' y='${j * 44 + 10}' width='18' height='24' rx='2' fill='${rnd() < lit ? '%23FFD27A' : '%2336588F'}'/>`;
    return `background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='102' height='132'%3E${r}%3C/svg%3E");background-size:102px 132px;background-position:center bottom;`;
  };

  /* ---------- path (office door -> down the street -> left turn -> house) ---------- */
  const Z1 = 1500, R = 380, X_STOP = 3300, STEP = 10;
  const P = [];
  for (let z = -330; z < Z1 - R; z += STEP) P.push([0, z]);
  for (let i = 0; i <= 40; i++) { const t = i / 40, u = 1 - t; P.push([2 * u * t * 0 + t * t * R, u * u * (Z1 - R) + 2 * u * t * Z1 + t * t * Z1]); }
  for (let x = R + STEP; x <= X_STOP + 400; x += STEP) P.push([x, Z1]);
  const CS = [0];
  for (let i = 1; i < P.length; i++) CS.push(CS[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
  const S_START = CS[P.findIndex(q => q[1] >= -175)] || 0;
  const S_STOP = CS[P.findIndex(q => q[0] >= X_STOP)];
  const at = s => {
    s = clamp(s, 0, CS[CS.length - 1]);
    let lo = 0, hi = CS.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; CS[m] > s ? hi = m : lo = m; }
    const t = (s - CS[lo]) / ((CS[hi] - CS[lo]) || 1);
    return { x: lerp(P[lo][0], P[hi][0], t), z: lerp(P[lo][1], P[hi][1], t) };
  };

  /* ---------- scene ---------- */
  const lite = (navigator.hardwareConcurrency || 8) <= 4 || innerWidth < 760;
  const frag = document.createDocumentFragment();
  const add = (e, x, z, r) => { frag.appendChild(e); if (x !== undefined) reg(e, x, z, r); return e; };

  // ground + road
  frag.appendChild(plane({ w: 7200, l: 4800, x: 1500, z: 700, y: 0, css: 'background:radial-gradient(closest-side,#1d4a7d,#16385f 70%);-webkit-mask-image:radial-gradient(closest-side,#000 55%,transparent 100%);mask-image:radial-gradient(closest-side,#000 55%,transparent 100%)' }));
  frag.appendChild(plane({ w: 5200, l: 3400, x: 1500, z: 700, y: 1, css: 'background-image:linear-gradient(rgba(255,255,255,.07) 2px,transparent 2px),linear-gradient(90deg,rgba(255,255,255,.07) 2px,transparent 2px);background-size:120px 120px;-webkit-mask-image:radial-gradient(closest-side,#000 40%,transparent 100%);mask-image:radial-gradient(closest-side,#000 40%,transparent 100%)' }));
  frag.appendChild(plane({ w: 560, l: 330, x: 0, z: 80, y: 2, css: 'background:#5f7494;border-radius:6px' })); // forecourt
  const dashes = [];
  for (let s = 0; s < CS[CS.length - 1] - 60; s += 100) {
    const a = at(s), b = at(s + 100), ry = Math.atan2(b.x - a.x, b.z - a.z) * DEG, cx = (a.x + b.x) / 2, cz = (a.z + b.z) / 2;
    add(plane({ w: 176, l: 118, x: cx, z: cz, y: 3, ry, css: 'background:#1b2538;border-left:10px solid #6f84a6;border-right:10px solid #6f84a6' }), cx, cz, 130);
  }
  for (let s = 0; s < CS[CS.length - 1] - 40; s += 64) {
    const a = at(s), b = at(s + 20), ry = Math.atan2(b.x - a.x, b.z - a.z) * DEG;
    const d = add(plane({ w: 8, l: 34, x: a.x, z: a.z, y: 5, ry, css: '' }), a.x, a.z, 40);
    d.className += ' dash'; dashes.push({ el: d, s, on: false });
  }

  // buildings
  const pal = ['#F4F1EA', '#DCE7F7', '#FFD9B0', '#A9C0E4', '#F7B070', '#E8EEF8', '#C9D6EC'];
  function building(x, z, w, d, h, faceZ) {
    const c = pal[(rnd() * pal.length) | 0], t = winTile(rr(.35, .8)), img = { front: t, back: t, left: t, right: t };
    const g = mk('bx');
    g.style.cssText = 'transform:translate3d(0,0,0)';
    const b = box({ w, h, d, x, y: 0, z, c, img, fc: { top: '#40557f' } });
    const e = add(b, x, z, Math.max(w, d));
    if (rnd() < .6) frag.appendChild(reg(box({ w: w * .3, h: 18, d: d * .3, x: x + rr(-w / 5, w / 5), y: h, z: z + rr(-d / 5, d / 5), c: '#8296b8' }), x, z, 60));
    return e;
  }
  const lane = innerWidth < 760 ? 540 : 330; // distance from road centre line to building centre
  for (let z = 980; z < Z1 - 100; z += lite ? 260 : 200) {
    building(-lane - rr(0, 50), z + rr(-30, 30), rr(150, 210), rr(150, 190), rr(150, innerWidth < 760 ? 250 : 330));
    if (z < Z1 - 480) building(lane + rr(0, 50), z + rr(-30, 30), rr(150, 210), rr(150, 190), rr(150, innerWidth < 760 ? 250 : 330));
  }
  for (let x = 760; x < X_STOP + 500; x += lite ? 270 : 210) {
    if (x < X_STOP - 1000) building(x + rr(-20, 20), Z1 - lane - rr(0, 50), rr(150, 210), rr(150, 190), rr(160, 420));
    if (x < X_STOP - 380 || x > X_STOP + 120) building(x + rr(-20, 20), Z1 + lane + rr(0, 60) + (x > X_STOP - 380 ? 120 : 0), rr(150, 210), rr(150, 190), rr(160, 420));
  }
  // far second row (taller, for depth)
  for (let z = 760; z < Z1 + 300; z += lite ? 420 : 300) {
    building(-lane - 330 - rr(0, 80), z, rr(190, 260), rr(180, 240), rr(300, 620));
    building(lane + 330 + rr(0, 80), z, rr(190, 260), rr(180, 240), rr(300, 620));
  }
  for (let x = 900; x < X_STOP - 1100; x += lite ? 420 : 300) building(x, Z1 - lane - 330 - rr(0, 80), rr(190, 260), rr(180, 240), rr(300, 620));

  // trees + street lamps
  const tree = (x, z) => {
    frag.appendChild(reg(box({ w: 9, h: 26, d: 9, x, y: 0, z, c: '#6b4a2f' }), x, z, 40));
    frag.appendChild(reg(box({ w: 38, h: 40, d: 38, x, y: 22, z, c: '#2E8B6E' }), x, z, 40));
    frag.appendChild(reg(box({ w: 24, h: 24, d: 24, x, y: 58, z, c: '#43A885' }), x, z, 40));
  };
  const lamp = (x, z) => {
    frag.appendChild(reg(box({ w: 5, h: 92, d: 5, x, y: 0, z, c: '#32435F' }), x, z, 40));
    frag.appendChild(reg(box({ w: 24, h: 6, d: 12, x, y: 90, z, c: '#FFE9A8', fc: { front: '#FFE9A8', back: '#FFE9A8', left: '#FFE9A8', right: '#FFE9A8', top: '#fff', }, }), x, z, 40));
    frag.appendChild(reg(plane({ w: 150, l: 150, x, z, y: 6, css: 'background:radial-gradient(circle,rgba(255,215,130,.4),transparent 68%)' }), x, z, 90));
  };
  const along = (f, a, b, step, side) => { for (let s = a; s < b; s += step) { const q = at(s), n = at(s + 8); const dx = n.x - q.x, dz = n.z - q.z, L = Math.hypot(dx, dz) || 1; f(q.x - dz / L * side, q.z + dx / L * side); } };
  const sEnd = CS[CS.length - 1];
  along(tree, 260, sEnd - 500, lite ? 380 : 230, 128);
  along(tree, 320, sEnd - 700, lite ? 440 : 290, -128);
  along(lamp, 200, sEnd - 400, 330, 106);

  // ---------- CHOLVO office (open front, roller shutter, van parked inside) ----------
  const OZ = -200; // centre z
  const wall = '#E9EEF7';
  frag.appendChild(box({ w: 460, h: 4, d: 360, x: 0, y: 0, z: OZ, c: '#7C8CA6', dbl: true, skip: ['front', 'back', 'left', 'right'] }));
  frag.appendChild(box({ w: 460, h: 260, d: 16, x: 0, y: 0, z: OZ - 172, c: '#D5DDEB', dbl: true }));
  frag.appendChild(box({ w: 16, h: 260, d: 360, x: -222, y: 0, z: OZ, c: wall, dbl: true, img: { left: winTile(.6), right: winTile(.6) } }));
  frag.appendChild(box({ w: 16, h: 260, d: 360, x: 222, y: 0, z: OZ, c: wall, dbl: true, img: { left: winTile(.6), right: winTile(.6) } }));
  frag.appendChild(box({ w: 480, h: 16, d: 390, x: 0, y: 258, z: OZ - 6, c: '#0B2A5B', dbl: true }));
  frag.appendChild(box({ w: 128, h: 172, d: 18, x: -166, y: 0, z: -22, c: wall, dbl: true, fc: { front: '#E9EEF7' }, img: { front: 'background-image:linear-gradient(#F58220,#F58220);background-size:100% 10px;background-repeat:no-repeat;background-position:0 100%;' } }));
  frag.appendChild(box({ w: 128, h: 172, d: 18, x: 166, y: 0, z: -22, c: wall, dbl: true, fc: { front: '#E9EEF7' }, img: { front: 'background-image:linear-gradient(#F58220,#F58220);background-size:100% 10px;background-repeat:no-repeat;background-position:0 100%;' } }));
  frag.appendChild(box({ w: 460, h: 88, d: 18, x: 0, y: 172, z: -22, c: '#0B2A5B', dbl: true, fc: { front: '#0B2A5B' }, txt: { front: ['CHOLVO', 'font-size:58px;letter-spacing:.16em;color:#fff;text-shadow:0 4px 0 #F58220'] } }));
  frag.appendChild(box({ w: 470, h: 8, d: 22, x: 0, y: 168, z: -22, c: '#F58220', dbl: true }));
  // interior light + roller tube + shutter
  frag.appendChild(plane({ w: 300, l: 250, x: 0, z: OZ + 20, y: 7, css: 'background:radial-gradient(closest-side,rgba(255,226,160,.55),transparent)' }));
  frag.appendChild(box({ w: 206, h: 10, d: 10, x: 0, y: 172, z: -16, c: '#26344F', dbl: true }));
  const shutter = mk('pl shut', 'width:206px;height:172px;margin:0 0 0 -103px;transform:translate3d(0,-172px,-14px)');
  const shW = mk('bx'); shW.appendChild(shutter); frag.appendChild(shW);
  // parcels on a pallet inside + outside
  const parcel = (x, y, z, s, ry) => box({ w: s, h: s * .8, d: s, x, y, z, ry, c: '#F58220', fc: { top: '#FFB54A' }, img: { front: 'background-image:linear-gradient(90deg,transparent 42%,rgba(255,255,255,.55) 42% 58%,transparent 58%);', top: 'background-image:linear-gradient(90deg,transparent 42%,rgba(255,255,255,.65) 42% 58%,transparent 58%);' } });
  [[-150, 0, -150, 38, 10], [-150, 30, -150, 30, -8], [-115, 0, -230, 34, 0], [160, 0, -240, 40, 6], [150, 0, -140, 30, -12], [-150, 0, -240, 34, 4]].forEach(a => frag.appendChild(parcel(...a)));
  [[-230, 0, 60, 36, 14], [-262, 0, 40, 30, -10], [-232, 28, 56, 26, 6]].forEach(a => frag.appendChild(reg(parcel(...a), a[0], a[2], 50)));
  // neighbours
  frag.appendChild(reg(box({ w: 220, h: 200, d: 220, x: -500, y: 0, z: -160, c: '#F7B070', img: { front: winTile(.6), right: winTile(.6), left: winTile(.6) } }), -500, -160, 200));
  frag.appendChild(reg(box({ w: 220, h: 300, d: 220, x: 520, y: 0, z: -180, c: '#A9C0E4', img: { front: winTile(.6), right: winTile(.6), left: winTile(.6) } }), 520, -180, 200));

  // ---------- destination house ----------
  const HX = 3420, HZ = 1830;
  const hs = mk('bx'); hs.style.transform = `translate3d(${HX}px,0,${HZ}px) rotateY(180deg)`;
  hs.appendChild(box({ w: 230, h: 120, d: 200, x: 0, y: 0, z: 0, c: '#F4E9D8', img: { front: 'background-image:radial-gradient(circle,#36588F 0 0,transparent 0);', right: winTile(.8) } }));
  hs.appendChild(box({ w: 44, h: 76, d: 6, x: 0, y: 0, z: 100, c: '#0B2A5B', fc: { front: '#0B2A5B' } }));
  hs.appendChild(box({ w: 42, h: 6, d: 30, x: 0, y: 0, z: 114, c: '#9FB3D6' }));
  [-72, 72].forEach(wx => hs.appendChild(box({ w: 42, h: 44, d: 6, x: wx, y: 46, z: 100, c: '#FFD27A', fc: { front: '#FFD27A' } })));
  const slope = (sgn) => mk('pl', `width:250px;height:136px;margin:-68px 0 0 -125px;background:${sgn > 0 ? '#C4572B' : '#A94720'};transform:translate3d(0,-150px,${sgn * 60}px) rotateX(${sgn > 0 ? 63.43 : 116.57}deg);backface-visibility:visible`);
  const rw = mk('bx'); rw.appendChild(slope(1)); rw.appendChild(slope(-1));
  [-1, 1].forEach(sd => rw.appendChild(mk('pl', `width:200px;height:60px;margin:-30px 0 0 -100px;background:#F4E9D8;clip-path:polygon(0 100%,50% 0,100% 100%);transform:translate3d(${sd * 116}px,-150px,0) rotateY(${sd * 90}deg)`)));
  hs.appendChild(rw);
  frag.appendChild(reg(hs, HX, HZ, 200));
  frag.appendChild(reg(plane({ w: 300, l: 190, x: HX, z: 1700, y: 3, css: 'background:#6a7e9e;border-radius:6px' }), HX, 1700, 200));
  frag.appendChild(reg(plane({ w: 200, l: 200, x: HX, z: 1690, y: 6, css: 'background:radial-gradient(closest-side,rgba(255,215,130,.5),transparent)' }), HX, 1690, 200));
  tree(HX - 190, HZ - 60); tree(HX + 190, HZ - 60);

  // ---------- the van ----------
  const van = mk('bx van'); van.style.willChange = 'transform';
  const V = (o) => van.appendChild(box(o));
  const orange = '#F58220', navy = '#0B2A5B';
  V({ w: 74, h: 78, d: 124, x: 0, y: 20, z: -26, c: orange, fc: { top: '#FFF3E4' }, img: { left: 'background-image:linear-gradient(transparent 80%,#fff 80% 88%,transparent 88%);', right: 'background-image:linear-gradient(transparent 80%,#fff 80% 88%,transparent 88%);' }, txt: { left: ['CHOLVO', 'font-size:22px;letter-spacing:.14em;color:#fff'], right: ['CHOLVO', 'font-size:22px;letter-spacing:.14em;color:#fff'], back: ['C', 'font-size:34px;color:#fff'] } });
  V({ w: 70, h: 50, d: 54, x: 0, y: 20, z: 63, c: navy, fc: { front: 'linear-gradient(#CFE3FF,#7FA6DC)', left: 'linear-gradient(transparent 20%,#CFE3FF 20% 62%,transparent 62%)', right: 'linear-gradient(transparent 20%,#CFE3FF 20% 62%,transparent 62%)', top: '#1B4A8E' } });
  V({ w: 78, h: 10, d: 12, x: 0, y: 16, z: 96, c: '#222B3F' });
  [-24, 24].forEach(hx => V({ w: 14, h: 8, d: 4, x: hx, y: 28, z: 91, c: '#FFF2B0', fc: { front: '#FFF6C8' } }));
  [-27, 27].forEach(hx => V({ w: 12, h: 8, d: 3, x: hx, y: 30, z: -89, c: '#E53935', fc: { back: '#FF5A52' } }));
  const wheels = [];
  [[-38, 62], [38, 62], [-38, -50], [38, -50]].forEach(([wx, wz]) => {
    const wh = mk('wheel', `transform:translate3d(${wx}px,-17px,${wz}px) rotateY(${wx > 0 ? 90 : -90}deg) rotate(0deg)`);
    van.appendChild(wh); wheels.push({ el: wh, wx, wz });
  });
  van.appendChild(plane({ w: 96, l: 160, x: 0, z: 10, y: 0, css: 'background:radial-gradient(closest-side,rgba(0,0,0,.5),transparent);' }));
  const beam = plane({ w: 120, l: 260, x: 0, z: 240, y: 1, css: 'background:linear-gradient(rgba(255,230,150,.5),transparent);clip-path:polygon(30% 0,70% 0,100% 100%,0 100%)' });
  van.appendChild(beam);
  frag.appendChild(van);

  // the parcel that flies to the doorstep
  const dropP = parcel(0, 0, 0, 24, 0); dropP.style.display = 'none'; frag.appendChild(dropP);

  // billboards (always face the camera)
  const mkPin = (html, cls) => { const b = mk('bb ' + cls); b.innerHTML = `<div class="bbi">${html}</div>`; frag.appendChild(b); return b; };
  const pinHub = mkPin('<span class="dot"></span><b>CHOLVO Hub</b><small>Chattogram</small>', 'hub');
  const pinVan = mkPin('<span class="live"></span><b>CHV-DEMO</b><small>On the way</small>', 'van');
  const pinEnd = mkPin('<span class="ok">&#10003;</span><b>Delivered</b><small>Parcel received</small>', 'end');

  cam.appendChild(frag);

  /* ---------- HUD / copy ---------- */
  const copy = sec.querySelector('.h3-copy'), hint = sec.querySelector('.h3-hint'), hud = sec.querySelector('.h3-hud');
  const capT = sec.querySelector('#h3Cap'), capB = sec.querySelector('#h3CapBn'), cta = sec.querySelector('.h3-cta'), dots = [...sec.querySelectorAll('.h3-steps li')], bar = sec.querySelector('#h3Bar');
  const sky = sec.querySelector('.h3-sky'), city = sec.querySelector('.h3-city'), pin = sec.querySelector('.h3-pin');
  const STAGES = [
    [0, 'Order Received', 'Your order reaches our hub', 'অর্ডার পেয়েছি'],
    [.17, 'Picked Up', 'Rider collects your parcel', 'পার্সেল তুলে নেওয়া হয়েছে'],
    [.36, 'On the Way', 'Moving across the city', 'পার্সেল পথে আছে'],
    [.8, 'Dropped Off', 'Arriving at the doorstep', 'দোরগোড়ায় পৌঁছেছে'],
    [.93, 'Delivered', 'Delivered. That is CHOLVO.', 'পার্সেল পৌঁছে গেছে']
  ];
  let stage = -1, copyOn = true, ctaOn = false, vw = innerWidth, vh = innerHeight, hh = 65, runH = 0, top0 = 0;
  const SKY = [[0, ['#071A3A', '#0B2A5B', '#F58220']], [.45, ['#0B2A5B', '#27579F', '#FFA14A']], [1, ['#123F7F', '#3A78CC', '#FFCF94']]];
  const skyAt = p => { let i = 1; while (i < SKY.length - 1 && p > SKY[i][0]) i++; const a = SKY[i - 1], b = SKY[i], t = sm(a[0], b[0], p); return a[1].map((c, k) => mixc(c, b[1][k], t)); };

  const measure = () => {
    vw = innerWidth; vh = innerHeight;
    const hd = document.querySelector('header'); hh = hd ? hd.offsetHeight : 65;
    sec.style.setProperty('--hh', hh + 'px');
    const pv = Math.max(420, vh - hh);
    runH = (vw < 760 ? 4.6 : 5.4) * pv;
    sec.style.height = (runH + pv + 72) + 'px';
    top0 = sec.getBoundingClientRect().top + scrollY;
  };

  /* ---------- per-frame render ---------- */
  let target = 0, cur = -1, lastT = 0, tt = 0, visible = true;
  const read = () => { const pv = Math.max(420, vh - hh); target = clamp((scrollY - top0) / runH); };

  function render(p, time) {
    const mobile = vw < 760, k = clamp(vw / (mobile ? 640 : 1280), mobile ? .62 : .62, 1);
    // van along the path
    const u = clamp((p - .22) / .58), e = .5 - .5 * Math.cos(Math.PI * u);
    const s = S_START + (S_STOP - S_START) * e;
    const q = at(s), a0 = at(s - 26), a1 = at(s + 26);
    let hx = a1.x - a0.x, hz = a1.z - a0.z; const hl = Math.hypot(hx, hz) || 1; hx /= hl; hz /= hl;
    const moving = u > 0 && u < 1, bob = moving ? Math.sin(time * 9) * 1.1 : 0;
    const phi = Math.atan2(hx, hz) * DEG;
    van.style.transform = `translate3d(${q.x}px,${bob}px,${q.z}px) rotateY(${phi}deg)`;
    van.style.setProperty('--wr', (s * 3.2 % 360) + 'deg');
    beam.style.opacity = sm(.5, .7, p) * .0 + (p > .2 ? .9 : 0);
    wheels.forEach(w => w.el.style.transform = `translate3d(${w.wx}px,-17px,${w.wz}px) rotateY(${w.wx > 0 ? 90 : -90}deg) rotate(${(w.wx > 0 ? 1 : -1) * (s * 3.2 % 360)}deg)`);

    // shutter
    const so = sm(.05, .2, p);
    shutter.style.transform = `translate3d(0,-172px,-14px) scaleY(${(1 - so).toFixed(3)})`;
    shutter.style.transformOrigin = '50% 0';

    // parcel drop at the doorstep
    const dt = sm(.82, .93, p);
    if (dt > 0) {
      const sx = 3330, sz = 1500, ex = HX, ez = 1688, x = lerp(sx, ex, dt), z = lerp(sz, ez, dt), y = lerp(70, 0, dt) + Math.sin(dt * Math.PI) * 120;
      dropP.style.display = ''; dropP.style.transform = `translate3d(${x}px,${-y - 10}px,${z}px) rotateY(${dt * 260}deg)`;
    } else dropP.style.display = 'none';

    // camera
    const cw = sm(.12, .36, p), fin = sm(.8, 1, p);
    let Tx = lerp(0, q.x + hx * 70, cw), Tz = lerp(-150, q.z + hz * 70, cw), Ty = lerp(-120, -50, cw);
    Tx = lerp(Tx, 3390, fin); Tz = lerp(Tz, 1660, fin); Ty = lerp(Ty, -20, fin);
    const thc = Math.atan2(hx, -hz) * DEG;
    const orbit = sm(.1, .44, p);
    const th = thc - 180 * (1 - orbit) + 88 * fin;
    const pitch = (mobile ? 8 * cw : 0) + keys([[0, 7], [.14, 10], [.4, 17], [.8, 19], [1, 40]], p);
    const D = keys([[0, 1000], [.12, 900], [.3, 900], [.46, 860], [.8, 860], [1, 1400]], p) / k;
    const sx = mobile ? 0 : lerp(vw * .2, 0, sm(0, .2, p)), sy = (mobile ? lerp(vh * .2, 0, sm(0, .2, p)) : 0) + -vh * .04 * cw;
    const PP = 1000;
    cam.style.transform = `translate3d(${sx}px,${sy}px,${PP - D}px) rotateX(${-pitch}deg) rotateY(${th}deg) translate3d(${-Tx}px,${-Ty}px,${-Tz}px)`;
    world.style.perspective = PP + 'px';

    // billboards
    const bb = (el, x, y, z, sc) => { el.style.transform = `translate3d(${x}px,${-y}px,${z}px) rotateY(${-th}deg) rotateX(${pitch}deg) scale(${sc})`; el.style.display = sc < .02 ? 'none' : ''; };
    bb(pinHub, 0, 330 + Math.sin(time * 2) * 5, OZ, (1 - sm(.18, .34, p)) * 1.0);
    bb(pinVan, q.x, 120 + Math.sin(time * 2.4) * 4, q.z, sm(.24, .32, p) * (1 - sm(.78, .84, p)) * .8);
    bb(pinEnd, HX, 205 + Math.sin(time * 2.2) * 5, HZ - 20, sm(.92, .98, p) * 1.0);

    // far scenery culling
    for (const it of items) {
      const on = Math.hypot(it.x - Tx, it.z - Tz) - it.r < 3000;
      if (on !== it.on) { it.on = on; it.el.style.display = on ? '' : 'none'; }
    }
    // route dashes light up behind the van
    for (const d of dashes) { const on = d.s + S_START * 0 < s; if (on !== d.on) { d.on = on; d.el.classList.toggle('on', on); } }

    // sky + skyline
    const [c1, c2, c3] = skyAt(p);
    sky.style.background = `linear-gradient(180deg,${c1} 0%,${c2} 38%,${c3} 66%)`;
    const horizon = vh * .46 - PP * k * Math.tan(pitch / DEG) * .55;
    city.style.transform = `translate3d(${-th * 14}px,${horizon}px,0)`;

    // copy / hint
    const co = 1 - sm(.03, .15, p);
    copy.style.opacity = co; copy.style.transform = `translate3d(0,${-(1 - co) * 40}px,0)`;
    const on = co > .02; if (on !== copyOn) { copyOn = on; copy.toggleAttribute('inert', !on); }
    hint.style.opacity = 1 - sm(0, .04, p);
    hud.style.opacity = sm(.1, .2, p);

    // stages
    let st = 0; for (let i = 0; i < STAGES.length; i++) if (p >= STAGES[i][0]) st = i;
    if (st !== stage) {
      stage = st;
      capT.textContent = STAGES[st][2]; capB.textContent = STAGES[st][3];
      dots.forEach((d, i) => { d.classList.toggle('ok', i <= st); d.classList.toggle('now', i === st); });
      hud.classList.remove('pop'); void hud.offsetWidth; hud.classList.add('pop');
    }
    bar.style.transform = `scaleX(${clamp(p)})`;
    const co2 = p > .95; if (co2 !== ctaOn) { ctaOn = co2; cta.classList.toggle('show', co2); }
  }

  let raf = 0;
  function loop(now) {
    raf = 0;
    const time = now / 1000, dt = Math.min(.25, time - (lastT || time)); lastT = time;
    read();
    cur = cur < 0 ? target : cur + (target - cur) * (1 - Math.exp(-dt * 9));
    if (Math.abs(target - cur) < .00015) cur = target;
    render(cur, time);
    if (visible) raf = requestAnimationFrame(loop);
  }
  const kick = () => { if (!raf && visible) raf = requestAnimationFrame(loop); };
  addEventListener('scroll', kick, { passive: true });
  addEventListener('resize', () => { measure(); kick(); });
  new IntersectionObserver(e => { visible = e[0].isIntersecting; if (visible) kick(); }, { rootMargin: '150px' }).observe(sec);
  addEventListener('load', () => { measure(); kick(); });
  document.fonts && document.fonts.ready.then(() => { measure(); kick(); });
  measure(); cur = -1; kick();
  window.__h3 = { render, measure, set: p => { cur = p; render(p, 1); } }; // debug hook
})();
