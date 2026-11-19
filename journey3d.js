/* CHOLVO hero journey, WebGL2 edition.
   A realistic golden-hour city rendered on the GPU (instanced meshes, shadow map, fog, procedural sky/facades).
   Scroll drives the camera: office -> shutter opens -> van drives out -> city -> parcel lands on a doorstep.
   Falls back to journey.js (CSS 3D) if WebGL2 is not available. */
(() => {
  'use strict';
  const sec = document.getElementById('home');
  if (!sec || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const fallback = () => { sec.classList.remove('h3-gl'); const s = document.createElement('script'); s.src = 'journey.js'; document.body.appendChild(s); };
  const canvas = document.getElementById('h3Canvas');
  let gl = null;
  try { gl = canvas && canvas.getContext('webgl2', { antialias: true, alpha: false, powerPreference: 'high-performance' }); } catch (e) { }
  if (!gl) { fallback(); return; }
  try { init(); } catch (err) { console.error('CHOLVO 3D failed, using fallback', err); fallback(); }

  function init() {
    sec.classList.add('h3-on', 'h3-gl');
    ['.h3-sky', '.h3-city', '.h3-world'].forEach(q => { const e = sec.querySelector(q); if (e) e.remove(); });

    /* ---------- math ---------- */
    const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
    const lerp = (a, b, t) => a + (b - a) * t;
    const sm = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
    const DEG = 180 / Math.PI;
    const keys = (arr, p) => { if (p <= arr[0][0]) return arr[0][1]; for (let i = 1; i < arr.length; i++) if (p <= arr[i][0]) { const a = arr[i - 1], b = arr[i]; return lerp(a[1], b[1], sm(a[0], b[0], p)); } return arr[arr.length - 1][1]; };
    let seed = 7;
    const rnd = () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
    const rr = (a, b) => a + rnd() * (b - a);
    const pick = a => a[(rnd() * a.length) | 0];
    const L = h => [1, 3, 5].map(i => Math.pow(parseInt(h.slice(i, i + 2), 16) / 255, 2.2));
    const mixv = (a, b, t) => a.map((v, i) => lerp(v, b[i], t));

    const M4 = {
      id() { const o = new Float32Array(16); o[0] = o[5] = o[10] = o[15] = 1; return o; },
      mul(a, b) { const o = new Float32Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s; } return o; },
      persp(f, asp, n, fa, m8, m9) { const t = 1 / Math.tan(f / 2), o = new Float32Array(16); o[0] = t / asp; o[5] = t; o[8] = m8; o[9] = m9; o[10] = (fa + n) / (n - fa); o[11] = -1; o[14] = 2 * fa * n / (n - fa); return o; },
      look(e, t, u) {
        let zx = e[0] - t[0], zy = e[1] - t[1], zz = e[2] - t[2], l = Math.hypot(zx, zy, zz); zx /= l; zy /= l; zz /= l;
        let xx = u[1] * zz - u[2] * zy, xy = u[2] * zx - u[0] * zz, xz = u[0] * zy - u[1] * zx; l = Math.hypot(xx, xy, xz); xx /= l; xy /= l; xz /= l;
        const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
        return new Float32Array([xx, yx, zx, 0, xy, yy, zy, 0, xz, yz, zz, 0, -(xx * e[0] + xy * e[1] + xz * e[2]), -(yx * e[0] + yy * e[1] + yz * e[2]), -(zx * e[0] + zy * e[1] + zz * e[2]), 1]);
      },
      ortho(l, r, b, t, n, f) { const o = new Float32Array(16); o[0] = 2 / (r - l); o[5] = 2 / (t - b); o[10] = -2 / (f - n); o[12] = -(r + l) / (r - l); o[13] = -(t + b) / (t - b); o[14] = -(f + n) / (f - n); o[15] = 1; return o; },
      T(x, y, z) { const o = M4.id(); o[12] = x; o[13] = y; o[14] = z; return o; },
      S(x, y, z) { const o = M4.id(); o[0] = x; o[5] = y; o[10] = z; return o; },
      Ry(a) { const c = Math.cos(a), s = Math.sin(a), o = M4.id(); o[0] = c; o[2] = -s; o[8] = s; o[10] = c; return o; },
      Rz(a) { const c = Math.cos(a), s = Math.sin(a), o = M4.id(); o[0] = c; o[1] = s; o[4] = -s; o[5] = c; return o; },
      trs(x, y, z, sx, sy, sz, ry) { const c = Math.cos(ry), s = Math.sin(ry), o = new Float32Array(16); o[0] = c * sx; o[2] = -s * sx; o[5] = sy; o[8] = s * sz; o[10] = c * sz; o[12] = x; o[13] = y; o[14] = z; o[15] = 1; return o; }
    };

    /* ---------- meshes ---------- */
    const meshes = [];
    function mkMesh(v, ix) {
      const vbo = gl.createBuffer(), ebo = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, vbo); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(v), gl.STATIC_DRAW);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ebo); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(ix), gl.STATIC_DRAW);
      const m = { vbo, ebo, count: ix.length }; meshes.push(m); return m;
    }
    const quadIx = (v, a, b, c, d, n, uv) => { const o = v.length / 8; [a, b, c, d].forEach((p, i) => v.push(p[0], p[1], p[2], n[0], n[1], n[2], uv[i][0], uv[i][1])); return [o, o + 1, o + 2, o, o + 2, o + 3]; };
    const UVQ = [[0, 0], [1, 0], [1, 1], [0, 1]];
    function meshCube() {
      const v = [], ix = [];
      [[[0, 0, 1], [1, 0, 0], [0, 1, 0]], [[0, 0, -1], [-1, 0, 0], [0, 1, 0]], [[1, 0, 0], [0, 0, -1], [0, 1, 0]], [[-1, 0, 0], [0, 0, 1], [0, 1, 0]], [[0, 1, 0], [1, 0, 0], [0, 0, -1]], [[0, -1, 0], [1, 0, 0], [0, 0, 1]]].forEach(([n, u, w]) => {
        const c = (a, b) => [0, 1, 2].map(i => n[i] * .5 + u[i] * .5 * a + w[i] * .5 * b);
        ix.push(...quadIx(v, c(-1, -1), c(1, -1), c(1, 1), c(-1, 1), n, UVQ));
      });
      return mkMesh(v, ix);
    }
    function meshCyl(n) {
      const v = [], ix = [];
      for (let i = 0; i <= n; i++) { const a = i / n * Math.PI * 2, c = Math.cos(a), s = Math.sin(a); v.push(c * .5, -.5, s * .5, c, 0, s, i / n, 0, c * .5, .5, s * .5, c, 0, s, i / n, 1); }
      for (let i = 0; i < n; i++) { const a = i * 2; ix.push(a, a + 2, a + 3, a, a + 3, a + 1); }
      [[.5, 1], [-.5, -1]].forEach(([y, ny]) => {
        const o = v.length / 8; v.push(0, y, 0, 0, ny, 0, .5, .5);
        for (let i = 0; i <= n; i++) { const a = i / n * Math.PI * 2; v.push(Math.cos(a) * .5, y, Math.sin(a) * .5, 0, ny, 0, .5, .5); }
        for (let i = 0; i < n; i++) ix.push(o, o + 1 + i, o + 2 + i);
      });
      return mkMesh(v, ix);
    }
    function meshSphere(la, lo) {
      const v = [], ix = [];
      for (let i = 0; i <= la; i++) { const t = i / la * Math.PI; for (let j = 0; j <= lo; j++) { const p = j / lo * Math.PI * 2, x = Math.sin(t) * Math.cos(p), y = Math.cos(t), z = Math.sin(t) * Math.sin(p); v.push(x * .5, y * .5, z * .5, x, y, z, j / lo, i / la); } }
      for (let i = 0; i < la; i++) for (let j = 0; j < lo; j++) { const a = i * (lo + 1) + j, b = a + lo + 1; ix.push(a, b, a + 1, a + 1, b, b + 1); }
      return mkMesh(v, ix);
    }
    function meshGable() { // triangular profile in XY, extruded along Z
      const v = [], ix = [], A = [-.5, -.5], B = [.5, -.5], C = [0, .5];
      let o = v.length / 8; [[A, 1], [B, 1], [C, 1]].forEach(([p, n]) => v.push(p[0], p[1], .5, 0, 0, 1, p[0] + .5, p[1] + .5)); ix.push(o, o + 1, o + 2);
      o = v.length / 8; [A, B, C].forEach(p => v.push(p[0], p[1], -.5, 0, 0, -1, p[0] + .5, p[1] + .5)); ix.push(o, o + 2, o + 1);
      const nl = [-.894, .447, 0], nr = [.894, .447, 0];
      ix.push(...quadIx(v, [-.5, -.5, -.5], [-.5, -.5, .5], [0, .5, .5], [0, .5, -.5], nl, UVQ));
      ix.push(...quadIx(v, [.5, -.5, .5], [.5, -.5, -.5], [0, .5, -.5], [0, .5, .5], nr, UVQ));
      ix.push(...quadIx(v, [-.5, -.5, -.5], [.5, -.5, -.5], [.5, -.5, .5], [-.5, -.5, .5], [0, -1, 0], UVQ));
      return mkMesh(v, ix);
    }
    function meshWedge() { // side profile in YZ (high at back z=-.5, sloping down to front z=+.5), extruded along X
      const v = [], ix = [];
      [[.5, 1], [-.5, -1]].forEach(([x, nx]) => { const o = v.length / 8;[[-.5, -.5], [-.5, .5], [.5, -.5]].forEach(p => v.push(x, p[0], p[1], nx, 0, 0, p[1] + .5, p[0] + .5)); ix.push(o, o + 1, o + 2); });
      ix.push(...quadIx(v, [-.5, -.5, -.5], [.5, -.5, -.5], [.5, -.5, .5], [-.5, -.5, .5], [0, -1, 0], UVQ));
      ix.push(...quadIx(v, [-.5, -.5, -.5], [-.5, .5, -.5], [.5, .5, -.5], [.5, -.5, -.5], [0, 0, -1], UVQ));
      ix.push(...quadIx(v, [-.5, .5, -.5], [-.5, -.5, .5], [.5, -.5, .5], [.5, .5, -.5], [0, .707, .707], UVQ));
      return mkMesh(v, ix);
    }
    function meshQuadY() { const v = [], ix = quadIx(v, [-.5, 0, .5], [.5, 0, .5], [.5, 0, -.5], [-.5, 0, -.5], [0, 1, 0], UVQ); return mkMesh(v, ix); }
    function meshQuadZ() { const v = [], ix = quadIx(v, [-.5, -.5, 0], [.5, -.5, 0], [.5, .5, 0], [-.5, .5, 0], [0, 0, 1], UVQ); return mkMesh(v, ix); }
    const mCube = meshCube(), mCyl = meshCyl(14), mSph = meshSphere(7, 12), mGab = meshGable(), mWed = meshWedge(), mQY = meshQuadY(), mQZ = meshQuadZ();

    /* ---------- batches (instanced draws) ---------- */
    const STR = 24; // floats per instance: mat4 + color(rgb,seed) + params
    class Batch {
      constructor(mesh, o = {}) { this.mesh = mesh; this.shadow = o.shadow !== false; this.glow = !!o.glow; this.dyn = !!o.dyn; this.cap = o.cap || 0; this.arr = this.dyn ? new Float32Array(this.cap * STR) : []; this.n = 0; this.parent = M4.id(); all.push(this); }
      add(m, c, p) {
        if (this.dyn) { if (this.n >= this.cap) return; const a = this.arr, o = this.n * STR; a.set(m, o); a[o + 16] = c[0]; a[o + 17] = c[1]; a[o + 18] = c[2]; a[o + 19] = c[3] || 0; a[o + 20] = p[0]; a[o + 21] = p[1]; a[o + 22] = p[2] || 0; a[o + 23] = p[3] || 0; }
        else { const a = this.arr; for (let i = 0; i < 16; i++) a.push(m[i]); a.push(c[0], c[1], c[2], c[3] || 0, p[0], p[1], p[2] || 0, p[3] || 0); }
        this.n++;
      }
      build() {
        const data = this.dyn ? this.arr : new Float32Array(this.arr); if (!this.dyn) this.arr = null;
        this.buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, this.buf); gl.bufferData(gl.ARRAY_BUFFER, data, this.dyn ? gl.DYNAMIC_DRAW : gl.STATIC_DRAW);
        this.vao = gl.createVertexArray(); gl.bindVertexArray(this.vao);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.mesh.vbo);
        gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 32, 0);
        gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 32, 12);
        gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 32, 24);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.mesh.ebo);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
        for (let i = 0; i < 4; i++) { gl.enableVertexAttribArray(3 + i); gl.vertexAttribPointer(3 + i, 4, gl.FLOAT, false, STR * 4, i * 16); gl.vertexAttribDivisor(3 + i, 1); }
        gl.enableVertexAttribArray(7); gl.vertexAttribPointer(7, 4, gl.FLOAT, false, STR * 4, 64); gl.vertexAttribDivisor(7, 1);
        gl.enableVertexAttribArray(8); gl.vertexAttribPointer(8, 4, gl.FLOAT, false, STR * 4, 80); gl.vertexAttribDivisor(8, 1);
        gl.bindVertexArray(null);
      }
      upload() { gl.bindBuffer(gl.ARRAY_BUFFER, this.buf); gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.arr, 0, this.n * STR); }
    }
    const all = [];
    const bCube = new Batch(mCube), bFlat = new Batch(mCube, { shadow: false }), bCyl = new Batch(mCyl), bSph = new Batch(mSph), bGab = new Batch(mGab), bGlow = new Batch(mQY, { shadow: false, glow: true });
    const dWorld = new Batch(mCube, { dyn: true, cap: 16 }), dWGlow = new Batch(mQY, { dyn: true, cap: 4, shadow: false, glow: true });
    const dVan = new Batch(mCube, { dyn: true, cap: 60 }), dVanCyl = new Batch(mCyl, { dyn: true, cap: 12 }), dVanWed = new Batch(mWed, { dyn: true, cap: 4 }), dVanGlow = new Batch(mQY, { dyn: true, cap: 4, shadow: false, glow: true });

    // kinds: 0 plain, 1 facade, 2 emissive, 3 road, 4 ground/pavers, 5 shutter, 6 glass
    const bx = (b, x, y, z, w, h, d, ry, c, k = 0, sp = .06, pa = 0, pb = 0) => b.add(M4.trs(x, y + h / 2, z, w, h, d, ry || 0), c, [k, sp, pa, pb]);
    const cy = (b, x, y, z, r, h, c, k = 0, sp = .05) => b.add(M4.trs(x, y + h / 2, z, r * 2, h, r * 2, 0), c, [k, sp, 0, 0]);
    const sp = (b, x, y, z, w, h, d, c, spec = .03) => b.add(M4.trs(x, y, z, w, h, d, 0), c, [0, spec, 0, 0]);

    /* ---------- path ---------- */
    const Z1 = 1500, R = 380, X_STOP = 3300, STEP = 10, HX = 3420, HZ = 1830, OZ = -210;
    const P = [];
    for (let z = -330; z < Z1 - R; z += STEP) P.push([0, z]);
    const arcI0 = P.length;
    for (let i = 0; i <= 40; i++) { const t = i / 40, u = 1 - t; P.push([t * t * R, u * u * (Z1 - R) + 2 * u * t * Z1 + t * t * Z1]); }
    const arcI1 = P.length;
    for (let x = R + STEP; x <= X_STOP + 400; x += STEP) P.push([x, Z1]);
    const CS = [0];
    for (let i = 1; i < P.length; i++) CS.push(CS[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
    const S_START = CS[P.findIndex(q => q[1] >= -175)], S_STOP = CS[P.findIndex(q => q[0] >= X_STOP)], S_END = CS[CS.length - 1];
    const sArc0 = CS[arcI0], sArc1 = CS[arcI1 - 1];
    const at = s => { s = clamp(s, 0, S_END); let lo = 0, hi = CS.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; CS[m] > s ? hi = m : lo = m; } const t = (s - CS[lo]) / ((CS[hi] - CS[lo]) || 1); return { x: lerp(P[lo][0], P[hi][0], t), z: lerp(P[lo][1], P[hi][1], t) }; };
    const frame = s => { const a = at(s - 6), b = at(s + 6), c = at(s); const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1; return { x: c.x, z: c.z, hx: dx / l, hz: dz / l, ry: Math.atan2(dx, dz) }; };
    const PS = []; for (let i = 0; i < P.length; i += 8) PS.push(P[i]);
    const distPath = (x, z) => { let m = 1e9; for (const q of PS) { const d = Math.hypot(q[0] - x, q[1] - z); if (d < m) m = d; } return m; };
    const lite = (navigator.hardwareConcurrency || 8) <= 4 || innerWidth < 760;

    /* ---------- palette ---------- */
    const asphalt = L('#2B2F36'), concrete = L('#9AA1AB'), navy = L('#0B2A5B'), orange = L('#F26A1B'), white = L('#F2F4F7'), dark = L('#1A1D24'), glass = L('#0E1722'), warm = [3.2, 2.0, 0.9];
    const facade = ['#CFC8BC', '#BDB6AA', '#E1D6C3', '#C6CED8', '#D7C4B0', '#B7C0C9', '#E9E4DA', '#A9B4C2', '#C99A7C', '#DDD0BF', '#C4BFB5'].map(L);
    const greens = ['#2F6B4A', '#3A7D4F', '#2A5E45', '#467F3E', '#336B52'].map(L);
    const awn = ['#D64545', '#2C7BE5', '#F2B134', '#2FA36B', '#F26A1B'].map(L);

    /* ---------- build: ground, road, sidewalks ---------- */
    bx(bFlat, 1500, -2, 700, 14000, 2, 9000, 0, L('#2D343C'), 4, .02, 0);
    const segs = []; { let s = 0; while (s < S_END - .5) { const inArc = s >= sArc0 - .5 && s < sArc1 - .5; let e = s + (inArc ? 34 : 420); e = Math.min(e, inArc ? sArc1 : (s < sArc0 ? sArc0 : S_END)); segs.push([s, e]); s = e; } }
    segs.forEach(([a, b]) => {
      const A = at(a), B = at(b), dx = B.x - A.x, dz = B.z - A.z, len = Math.hypot(dx, dz), ry = Math.atan2(dx, dz), hx = dx / len, hz = dz / len, cx = (A.x + B.x) / 2, cz = (A.z + B.z) / 2, arc = (b - a) < 100;
      bx(bFlat, cx, 0, cz, 200 + (arc ? 8 : 0), 1.4, len + (arc ? 3 : 0), ry, asphalt, 3, .18, a, b - a);
      [-1, 1].forEach(sg => bx(bFlat, cx + hz * sg * 136, 0, cz - hx * sg * 136, 72, 4, len + (arc ? 3 : 0), ry, concrete, 4, .04, 1));
    });
    // zebra crossings
    [520, S_STOP - 380].forEach(s => { const f = frame(s); for (let i = -4; i <= 4; i++) bx(bFlat, f.x + f.hz * i * 22, 1.5, f.z - f.hx * i * 22, 11, .4, 62, f.ry, L('#D8D8D2'), 0, .02); });
    // inner-corner pocket park
    cy(bFlat, 405, 0, 1105, 175, 3, L('#47703F'), 0, .02);
    for (let i = 0; i < 7; i++) { const a = i / 7 * 6.28, r = rr(20, 120); bx(bFlat, 405 + Math.cos(a) * r, 3, 1105 + Math.sin(a) * r, 0, 0, 0, 0, white, 0); }

    /* ---------- the CHOLVO hub ---------- */
    const wallC = L('#E4E8EF'), floorC = L('#6C7684'), roofC = L('#C8CFD9');
    bx(bCube, 0, 0, OZ, 524, 5, 364, 0, floorC, 0, .08);
    bx(bCube, 0, 0, OZ - 181, 548, 250, 18, 0, L('#D2D9E3'), 0, .04);
    [-1, 1].forEach(sg => bx(bCube, sg * 265, 0, OZ, 18, 250, 384, 0, wallC, 1, .05, 44, 52));
    bx(bCube, 0, 248, OZ, 566, 16, 404, 0, roofC, 0, .06);
    [[0, -213, 566, 10, 6], [0, 191, 566, 10, 6]].forEach(a => bx(bCube, a[0], 264, OZ + a[1], a[2], 20, a[3], 0, navy, 0, .1));
    [-1, 1].forEach(sg => bx(bCube, sg * 278, 264, OZ, 10, 20, 404, 0, navy, 0, .1));
    [-1, 1].forEach(sg => { bx(bCube, sg * 190, 0, -29, 160, 168, 20, 0, wallC, 0, .05); bx(bCube, sg * 190, 0, -17.5, 162, 10, 3, 0, orange, 0, .2); bx(bCube, sg * 190, 58, -18.4, 110, 84, 2, 0, glass, 6, 1); bx(bCube, sg * 190, 54, -18.8, 118, 4, 3, 0, dark, 0, .1); });
    bx(bCube, 0, 168, -29, 566, 82, 24, 0, navy, 0, .12);
    bx(bCube, 0, 166, -16.5, 568, 5, 3, 0, orange, 0, .3);
    bx(bCube, 0, 152, -24, 240, 18, 14, 0, L('#2A3446'), 0, .2);
    // interior: ceiling lights, racks, parcels, pallets
    for (let i = 0; i < 4; i++) bx(bCube, 0, 238, OZ + 60 - i * 85, 140, 3, 14, 0, warm, 2);
    [-1, 1].forEach(sg => { bx(bCube, sg * 235, 0, OZ - 30, 26, 150, 260, 0, L('#46546B'), 0, .3); for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) if (rnd() < .85) bx(bCube, sg * 232, 6 + r * 46, OZ + 60 - c * 62, 20, rr(24, 38), rr(30, 46), 0, pick([L('#C9A27A'), L('#D8B185'), orange]), 0, .05); });
    [[-150, -330], [160, -340], [-100, -350]].forEach(a => { bx(bCube, a[0], 0, a[1], 60, 9, 60, 0, L('#9B7B54'), 0, .04); for (let i = 0; i < 3; i++) bx(bCube, a[0] + rr(-6, 6), 9 + i * 26, a[1] + rr(-4, 4), 50, 25, 50, rr(-.2, .2), pick([L('#C9A27A'), orange, L('#D8B185')]), 0, .05); });
    // outside: bollards, cones, parcel stacks, rooftop kit
    [-1, 1].forEach(sg => { cy(bCyl, sg * 150, 0, 40, 5, 34, L('#F2C230'), 0, .3); });
    [[-215, 50], [-245, 28], [225, 60]].forEach(a => { bx(bCube, a[0], 0, a[1], 40, 24, 40, rr(-.3, .3), pick([L('#C9A27A'), orange]), 0, .05); });
    for (let i = 0; i < 4; i++) bx(bCube, rr(-200, 200), 252, rr(-340, -120), rr(30, 60), rr(18, 36), rr(30, 60), 0, L('#8C97A6'), 0, .2);
    cy(bCyl, 180, 252, -330, 26, 46, L('#7A8798'), 0, .15);
    // rooftop sign (backlit board)
    [-150, 150].forEach(x => bx(bCube, x, 264, -60, 6, 38, 6, 0, L('#46546B'), 0, .3));
    bx(bCube, 0, 296, -60, 420, 74, 10, 0, navy, 0, .15);
    bx(bCube, 0, 292, -54.5, 424, 4, 2, 0, orange, 2, 0, 0);
    bGlow.add(M4.trs(0, 2.5, 120, 520, 1, 280, 0), [.55, .35, .15, 0], [0, 0]);
    // neighbours
    [[-440, 230, 300], [455, 240, 460]].forEach(([x, w, h]) => { bx(bCube, x, 0, -200, w, h, 240, 0, pick(facade), 1, .05, 38, 50); bx(bCube, x, h, -200, w + 3, 5, 243, 0, L('#6E7683'), 0, .05); });

    /* ---------- the destination house ---------- */
    const hb = (lx, y, lz, w, h, d, c, k = 0, spc = .06, pa = 0, pb = 0, rr2 = 0) => bx(bCube, HX - lx, y, HZ - lz, w, h, d, Math.PI + rr2, c, k, spc, pa, pb);
    const cream = L('#EADFCB'), brick = L('#A9593B'), door = L('#12315E');
    bx(bFlat, HX, 0, HZ - 60, 520, 3, 380, 0, L('#4C6B3D'), 0, .02); // lawn
    bx(bFlat, HX, 3, 1665, 70, 3, 60, 0, L('#B9B4A8'), 4, .05, 1); // path
    hb(0, 0, 0, 310, 150, 250, cream, 1, .04, 46, 60); hb(0, 0, 0, 316, 6, 256, L('#8B8578'), 0, .05);
    bx(bGab, HX, 150, HZ, 290, 92, 360, Math.PI / 2, brick, 0, .08); // roof (ridge along x)
    hb(100, 214, 20, 36, 70, 36, L('#8E4A30'), 0); // chimney
    hb(0, 0, -121, 52, 96, 4, door, 0, .35);
    hb(0, 0, -136, 150, 8, 54, L('#B9B4A8'), 4, .05, 1); hb(0, 8, -156, 150, 4, 1, L('#B9B4A8'));
    [-1, 1].forEach(sg => { hb(sg * 66, 8, -150, 9, 92, 9, white, 0, .2); hb(sg * 100, 60, -122, 56, 56, 4, glass, 6, 1); hb(sg * 100, 60, -121.5, 50, 50, 1, warm, 2); hb(sg * 100, 56, -123, 64, 4, 8, white, 0, .1); });
    hb(0, 152 - 8, -145, 156, 5, 70, white, 0, .1); // porch roof
    hb(30, 100, -127, 10, 12, 8, warm, 2); // porch lamp
    bx(bFlat, HX, 0, 1690, 0, 0, 0, 0, white, 0);
    [-1, 1].forEach(sg => { for (let i = 0; i < 8; i++) { hb(sg * (130 + i * 12), 0, -180, 5, 26, 5, white, 0, .1); } hb(sg * 178, 6, -180, 100, 4, 3, white, 0, .1); hb(sg * 178, 18, -180, 100, 4, 3, white, 0, .1); });
    bGlow.add(M4.trs(HX, 7, 1690, 220, 1, 170, 0), [.85, .55, .22, 0], [0, 0]);
    const tree = (x, z, sc = 1) => { cy(bCyl, x, 0, z, 4.5 * sc, 30 * sc, L('#5E4630'), 0, .03); const g = pick(greens); bSph.add(M4.trs(x, 54 * sc, z, 52 * sc, 46 * sc, 52 * sc, 0), g, [0, .03, 0, 0]); bSph.add(M4.trs(x + 9 * sc, 70 * sc, z - 6 * sc, 36 * sc, 32 * sc, 36 * sc, 0), mixv(g, [.2, .35, .15], .35), [0, .03, 0, 0]); };
    tree(HX - 210, HZ - 150); tree(HX + 215, HZ - 130, 1.1); tree(HX + 160, HZ + 20, .9);

    /* ---------- city: buildings ---------- */
    const clearZone = (x, z) => (x > X_STOP - 1250 && z < Z1 - 110 && x < X_STOP + 900) || (z > Z1 + 110 && Math.abs(x - HX) < 470 && z < HZ + 330) || (Math.abs(x) < 330 && z > -430 && z < 40);
    function bldg(x, z, w, d, h, ry, front) {
      { const od = Math.hypot(x, z + 200); if (od < 1500) h = Math.min(h, 100 + od * .1); }
      const c = pick(facade), seed = rnd() * 90, cw = rr(30, 42), ch = rr(44, 56);
      bx(bCube, x, 0, z, w, h, d, ry, [c[0], c[1], c[2], seed], 1, .06, cw, ch);
      const sn = Math.sin(ry), cs = Math.cos(ry), W = (lx, lz) => [x + lx * cs + lz * sn, z - lx * sn + lz * cs];
      let top = h;
      if (h > 360 && rnd() < .55) { const h2 = rr(70, 190); bx(bCube, x, h, z, w * .68, h2, d * .68, ry, [c[0], c[1], c[2], seed + 9], 1, .06, cw, ch); top += h2; }
      bx(bCube, x, top, z, w + 3, 5, d + 3, ry, L('#6E7683'), 0, .05);
      if (rnd() < .7) { const p = W(rr(-w / 4, w / 4), rr(-d / 4, d / 4)); bx(bCube, p[0], top + 5, p[1], rr(24, 46), rr(14, 26), rr(24, 46), ry, L('#8E99A8'), 0, .15); }
      if (rnd() < .3) { const p = W(rr(-w / 4, w / 4), rr(-d / 4, d / 4)); cy(bCyl, p[0], top + 5, p[1], 16, 30, L('#7B5B43'), 0, .05); }
      if (front && h < 700) { const a = W(front * (w / 2 + 8), 0); bx(bCube, a[0], 41, a[1], 16, 4, d * .78, ry, pick(awn), 0, .1); }
    }
    for (let sg = -1; sg <= 1; sg += 2) for (let row = 0; row < 2; row++) {
      let s = 420;
      while (s < S_END - 160) {
        const dl = rr(150, 230), wa = rr(130, 230), mid = s + wa / 2, f = frame(mid), lat = sg * (172 + row * 330 + rr(0, 14) + dl / 2), x = f.x + f.hz * lat, z = f.z - f.hx * lat;
        const inner = sg === 1 && mid > sArc0 - 260 && mid < sArc1 + 260;
        if (!inner && !clearZone(x, z) && (row === 0 || distPath(x, z) > 300)) bldg(x, z, dl, wa, (mid < 1000 ? .45 : 1) * (row ? rr(480, 1100) : (rnd() < .25 ? rr(110, 200) : rr(260, 640))), f.ry, row ? 0 : -sg);
        s += wa + rr(26, 60);
      }
    }
    for (let gx = -2600; gx < 5200; gx += lite ? 380 : 300) for (let gz = -1700; gz < 3500; gz += lite ? 380 : 300) {
      const x = gx + rr(-60, 60), z = gz + rr(-60, 60); if (distPath(x, z) < 720 || clearZone(x, z) || (Math.abs(x) < 800 && z > -700 && z < 100)) continue;
      const far = Math.hypot(x - 1500, z - 800) / 3000; bldg(x, z, rr(150, 250), rr(150, 250), rr(420, 1000) + far * 700, 0, 0);
    }

    /* ---------- street furniture ---------- */
    const lampAt = (x, z, ry, side) => {
      cy(bCyl, x, 0, z, 2.4, 96, L('#2B3547'), 0, .3);
      const sn = Math.sin(ry), cs = Math.cos(ry), hx = x - side * 15 * cs, hz = z + side * 15 * sn;
      bx(bCube, (x + hx) / 2, 94, (z + hz) / 2, 3, 3, 3, 0, L('#2B3547'), 0); bx(bCube, hx, 92, hz, 24, 4, 11, ry, warm, 2);
      bGlow.add(M4.trs(hx, 2.8, hz, 170, 1, 170, 0), [.62, .42, .17, 0], [0, 0]);
    };
    for (let s = 440; s < S_END - 200; s += lite ? 230 : 175) {
      const f = frame(s);
      [-1, 1].forEach((sg, i) => {
        const o = sg * 140, x = f.x + f.hz * o, z = f.z - f.hx * o; if (clearZone(x, z) && z > -430 && z < 40) return;
        if (sg === 1 && s > sArc0 - 120 && s < sArc1 + 120) return;
        if (((s / 175) | 0) % 2 === (i ? 0 : 1)) tree(x, z, rr(.9, 1.2)); else if (((s / 175) | 0) % 4 === (i ? 0 : 1) + 2 % 4) lampAt(f.x + f.hz * sg * 108, f.z - f.hx * sg * 108, f.ry, sg);
      });
    }
    for (let s = 380; s < S_END - 300; s += 350) { const f = frame(s); [-1, 1].forEach(sg => lampAt(f.x + f.hz * sg * 108, f.z - f.hx * sg * 108, f.ry, sg)); }
    for (let i = 0; i < 6; i++) { const a = i / 6 * 6.28 + .4, r = rr(40, 130); tree(405 + Math.cos(a) * r, 1105 + Math.sin(a) * r, rr(1, 1.4)); }
    // parked cars along the kerb
    const car = (x, z, ry, c) => {
      bx(bCube, x, 8, z, 40, 16, 94, ry, c, 0, .55); const sn = Math.sin(ry), cs = Math.cos(ry);
      bx(bCube, x - 2 * sn * 0, 22, z, 35, 14, 50, ry, glass, 6, 1); bx(bCube, x, 36, z, 33, 3, 46, ry, c, 0, .5);
      [[-17, 30], [17, 30], [-17, -30], [17, -30]].forEach(([lx, lz]) => bCyl.add(M4.mul(M4.T(x + lx * cs + lz * sn, 8.5, z - lx * sn + lz * cs), M4.mul(M4.Ry(ry), M4.mul(M4.Rz(Math.PI / 2), M4.S(17, 6, 17)))), dark, [0, .1, 0, 0]));
    };
    const carCols = ['#E8E8EA', '#B22A2A', '#1F3F73', '#2A2D33', '#C9CDD3', '#D8B24A', '#2B7A5A'].map(L);
    for (let s = 560; s < S_END - 500; s += lite ? 300 : 190) { const f = frame(s + rr(0, 80)), sg = rnd() < .5 ? -1 : 1, o = sg * 66; if (Math.abs(s - 520) < 90 || Math.abs(s - (S_STOP - 380)) < 90) continue; const x = f.x + f.hz * o, z = f.z - f.hx * o; if (clearZone(x, z)) continue; if (sg === 1 && s > sArc0 - 60 && s < sArc1 + 60) continue; car(x, z, f.ry, pick(carCols)); }

    /* ---------- build static buffers ---------- */
    all.forEach(b => b.dyn ? b.build() : (b.n ? b.build() : (b.mesh = b.mesh, b.build())));
    [dWorld, dWGlow, dVan, dVanCyl, dVanWed, dVanGlow].forEach(b => b.arr.fill(0));

    /* ---------- shaders ---------- */
    const VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos; layout(location=1) in vec3 aNrm; layout(location=2) in vec2 aUv;
layout(location=3) in vec4 i0; layout(location=4) in vec4 i1; layout(location=5) in vec4 i2; layout(location=6) in vec4 i3;
layout(location=7) in vec4 iCol; layout(location=8) in vec4 iPar;
uniform mat4 uVP; uniform mat4 uParent;
out vec3 vW; out vec3 vN; out vec3 vLN; out vec3 vObj; flat out vec3 vSc; flat out vec4 vCol; flat out vec4 vPar;
void main(){
  mat4 Lm=mat4(i0,i1,i2,i3); mat4 M=uParent*Lm; vec4 w=M*vec4(aPos,1.0);
  vec3 sc=vec3(length(i0.xyz),length(i1.xyz),length(i2.xyz));
  vW=w.xyz; vN=normalize(mat3(M)*(aNrm/(sc*sc))); vLN=aNrm; vObj=aPos; vSc=sc; vCol=iCol; vPar=iPar;
  gl_Position=uVP*w;
}`;
    const SKY_FN = `
uniform vec3 uHorizon, uZenith, uSunDir, uSunCol;
vec3 skyCol(vec3 d){
  float h=clamp(d.y,0.0,1.0);
  vec3 c=mix(uHorizon,uZenith,pow(h,0.5));
  float sd=max(dot(d,uSunDir),0.0);
  c+=uSunCol*(pow(sd,6.0)*0.10+pow(sd,48.0)*0.25+pow(sd,600.0)*3.0);
  return c;
}`;
    const FS = `#version 300 es
precision highp float; precision highp sampler2DShadow;
in vec3 vW; in vec3 vN; in vec3 vLN; in vec3 vObj; flat in vec3 vSc; flat in vec4 vCol; flat in vec4 vPar;
uniform vec3 uEye, uSkyAmb, uGndAmb, uFogCol, uIntPos; uniform float uFog,uLit,uIntI,uVanS,uBias,uShSize,uAmbK,uNO;
uniform mat4 uLightVP; uniform sampler2DShadow uShadow;
${SKY_FN}
out vec4 o;
float h21(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
float shadowAt(vec3 wp, vec3 n){
  vec4 lp=uLightVP*vec4(wp+n*uNO,1.0); vec3 p=lp.xyz/lp.w*0.5+0.5;
  if(p.z>1.0) return 1.0;
  float ts=1.0/uShSize, s=0.0;
  for(int i=-1;i<=1;i++) for(int j=-1;j<=1;j++) s+=texture(uShadow, vec3(p.xy+vec2(float(i),float(j))*ts, p.z-uBias));
  float e=min(min(p.x,1.0-p.x),min(p.y,1.0-p.y));
  return mix(1.0, s/9.0, smoothstep(0.0,0.05,e));
}
vec3 aces(vec3 x){ return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14),0.0,1.0); }
void main(){
  int k=int(vPar.x+0.5); vec3 ln=vLN; vec3 alb=vCol.rgb; vec3 emis=vec3(0.0); float spec=vPar.y;
  if(k==1){
    if(abs(ln.y)<0.5){
      float u=(abs(ln.x)>0.5? vObj.z*vSc.z : vObj.x*vSc.x); float hh=(vObj.y+0.5)*vSc.y;
      float cw=vPar.z, ch=vPar.w; vec2 cell=vec2(floor(u/cw),floor(hh/ch)); vec2 f=vec2(fract(u/cw),fract(hh/ch));
      float win=step(0.2,f.x)*step(f.x,0.8)*step(0.28,f.y)*step(f.y,0.84);
      if(cell.y<1.0){ win=step(0.08,f.x)*step(f.x,0.92)*step(0.12,f.y)*step(f.y,0.78); }
      float lit=step(h21(cell+vCol.w),uLit);
      alb*=0.93+0.1*h21(floor(vec2(u,hh)/7.0));
      alb*=1.0-0.18*step(f.y,0.07);
      if(win>0.5){
        if(lit>0.5){ float t=h21(cell+3.0+vCol.w); emis=mix(vec3(2.4,1.5,0.7),vec3(1.5,1.7,2.0),step(0.82,t))*(0.7+0.7*h21(cell+9.0)); alb=vec3(0.05); }
        else { alb=vec3(0.025,0.035,0.05); spec=1.0; }
      } else spec=0.05;
    } else alb*=0.78;
  } else if(k==2){ emis=vCol.rgb; alb=vec3(0.0); }
  else if(k==3){
    float s=vPar.z+(vObj.z+0.5)*vSc.z; float x=vObj.x*vSc.x; float ax=abs(x);
    if(ln.y>0.5){
      float n=h21(floor(vW.xz*0.8)); alb=vec3(0.052+0.02*n)*(0.9+0.2*h21(floor(vW.xz/90.0)));
      float tr=exp(-pow((ax-34.0)/14.0,2.0)); alb*=1.0-0.18*tr;
      vec3 paint=vec3(0.62,0.6,0.52);
      float dash=step(fract(s/54.0),0.52); float center=1.0-smoothstep(1.7,2.7,ax);
      alb=mix(alb,paint,center*dash);
      float edge=1.0-smoothstep(1.0,2.0,abs(ax-91.0)); alb=mix(alb,paint*0.8,edge);
      float lit=1.0-smoothstep(uVanS-3.0,uVanS+3.0,s);
      float core=1.0-smoothstep(1.8,4.2,ax);
      emis+=vec3(1.0,0.46,0.08)*(core*2.4+exp(-ax*ax/110.0)*0.6)*lit;
      spec=0.18;
    } else alb=vec3(0.07);
  }
  else if(k==4){
    if(vPar.z>0.5){ vec2 g=abs(fract(vW.xz/24.0)-0.5); float line=smoothstep(0.455,0.5,max(g.x,g.y)); alb*=1.0-0.22*line; alb*=0.92+0.14*h21(floor(vW.xz/24.0)); }
    else alb*=0.85+0.3*h21(floor(vW.xz/420.0));
  }
  else if(k==5){ float rib=fract(vW.y/7.0); alb=vec3(mix(0.34,0.17,smoothstep(0.62,0.8,rib))); spec=0.5; }
  vec3 N=normalize(vN); vec3 V=normalize(uEye-vW);
  float ndl=max(dot(N,uSunDir),0.0); float sh=ndl>0.0? shadowAt(vW,N):1.0;
  vec3 amb=mix(uGndAmb,uSkyAmb,N.y*0.5+0.5)*uAmbK;
  vec3 col=alb*(amb+uSunCol*ndl*sh);
  bool inside=vW.z<-24.0 && abs(vW.x)<262.0 && vW.y<246.0 && vW.z>-396.0;
  if(inside){ vec3 L2=uIntPos-vW; float id=length(L2); col+=alb*vec3(1.0,0.74,0.42)*uIntI*smoothstep(430.0,30.0,id)*(0.45+0.55*max(dot(N,L2/id),0.0))*1.7; }
  vec3 R=reflect(-V,N); float fr=pow(1.0-max(dot(N,V),0.0),5.0); float F=0.04+0.96*fr;
  vec3 H=normalize(V+uSunDir); float spk=pow(max(dot(N,H),0.0),70.0)*ndl*sh;
  col+=(uSunCol*spk*0.9+skyCol(R)*F)*spec;
  col+=emis;
  float d=length(vW-uEye); float fg=1.0-exp(-pow(d*uFog,1.45)); col=mix(col,uFogCol,clamp(fg,0.0,1.0));
  col=aces(col); o=vec4(pow(col,vec3(1.0/2.2)),1.0);
}`;
    const FS_SH = `#version 300 es
precision highp float; void main(){}`;
    const FS_GLOW = `#version 300 es
precision highp float;
in vec3 vObj; flat in vec4 vCol; flat in vec4 vPar; out vec4 o;
void main(){
  float shape;
  if(vPar.x<0.5){ float r=length(vObj.xz)*2.0; shape=pow(max(1.0-r,0.0),2.2); }
  else { float cz=vObj.z+0.5; float w=0.10+0.9*cz; shape=smoothstep(1.0,0.0,abs(vObj.x*2.0)/w)*pow(max(1.0-cz,0.0),1.2); }
  o=vec4(vCol.rgb*shape,1.0);
}`;
    const VS_SKY = `#version 300 es
out vec2 vN; void main(){ vec2 p=vec2((gl_VertexID<<1)&2, gl_VertexID&2); vN=p*2.0-1.0; gl_Position=vec4(vN,0.9999,1.0); }`;
    const FS_SKY = `#version 300 es
precision highp float;
in vec2 vN; out vec4 o;
uniform vec3 uRight,uUp,uFwd; uniform vec4 uProj; uniform float uTime;
${SKY_FN}
float h21(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
float vn(vec2 p){ vec2 i=floor(p),f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(h21(i),h21(i+vec2(1,0)),f.x),mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x),f.y); }
float fbm(vec2 p){ float a=0.5,s=0.0; for(int i=0;i<4;i++){ s+=a*vn(p); p*=2.03; a*=0.5; } return s; }
vec3 aces(vec3 x){ return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14),0.0,1.0); }
void main(){
  vec3 d=normalize(uFwd+uRight*((vN.x+uProj.z)/uProj.x)+uUp*((vN.y+uProj.w)/uProj.y));
  vec3 c=skyCol(d);
  float t=1.0/max(d.y,0.05); vec2 cp=d.xz*t*0.45+vec2(uTime*0.006,0.0);
  float n=fbm(cp*1.4); float cl=smoothstep(0.5,0.82,n)*smoothstep(0.0,0.22,d.y);
  float sd=max(dot(d,uSunDir),0.0);
  vec3 cc=mix(uHorizon*1.25,vec3(1.0,0.93,0.85),0.35)+uSunCol*pow(sd,10.0)*0.12;
  c=mix(c,cc,cl*0.6);
  c=aces(c); o=vec4(pow(c,vec3(1.0/2.2)),1.0);
}`;
    const VS_DEC = `#version 300 es
precision highp float; layout(location=0) in vec3 aPos; layout(location=2) in vec2 aUv;
uniform mat4 uVP, uM; out vec2 vUv; void main(){ vUv=aUv; gl_Position=uVP*uM*vec4(aPos,1.0); }`;
    const FS_DEC = `#version 300 es
precision highp float; in vec2 vUv; out vec4 o; uniform sampler2D uTex; uniform vec4 uUV; uniform vec3 uTint; uniform float uGain;
vec3 aces(vec3 x){ return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14),0.0,1.0); }
void main(){ vec4 t=texture(uTex,mix(uUV.xy,uUV.zw,vUv)); vec3 c=aces(t.rgb*uTint*uGain); o=vec4(pow(c,vec3(1.0/2.2)),t.a); }`;

    const compile = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) + '\n' + src.split('\n').map((l, i) => (i + 1) + ': ' + l).join('\n').slice(0, 4000)); return s; };
    const prog = (vs, fs) => { const p = gl.createProgram(); gl.attachShader(p, compile(gl.VERTEX_SHADER, vs)); gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p); if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p)); const u = {}; p.u = n => u[n] !== undefined ? u[n] : (u[n] = gl.getUniformLocation(p, n)); return p; };
    const pMain = prog(VS, FS), pShadow = prog(VS, FS_SH), pGlow = prog(VS, FS_GLOW), pSky = prog(VS_SKY, FS_SKY), pDec = prog(VS_DEC, FS_DEC);

    // shadow map
    const SH = window.__h3sh || (lite ? 1536 : 2560);
    const shTex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, shTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, SH, SH, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
    const shFbo = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, shFbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, shTex, 0); gl.drawBuffers([gl.NONE]); gl.readBuffer(gl.NONE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    // decals (text atlas drawn with canvas 2D)
    const atlas = document.createElement('canvas'); atlas.width = 1024; atlas.height = 256;
    const drawAtlas = () => {
      const c = atlas.getContext('2d'); c.clearRect(0, 0, 1024, 256);
      c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = '800 150px Outfit, Arial Black, sans-serif';
      c.fillStyle = '#fff'; c.fillText('CHOLVO', 512, 64);
      c.fillStyle = '#F58220'; c.fillText('CHOLVO', 516, 200); c.fillStyle = '#fff'; c.fillText('CHOLVO', 512, 194);
    };
    drawAtlas();
    const decTex = gl.createTexture();
    const upAtlas = () => { gl.bindTexture(gl.TEXTURE_2D, decTex); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlas); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); };
    upAtlas(); document.fonts && document.fonts.ready.then(() => { drawAtlas(); upAtlas(); });
    const decVao = gl.createVertexArray(); gl.bindVertexArray(decVao); gl.bindBuffer(gl.ARRAY_BUFFER, mQZ.vbo);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 32, 0); gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 32, 24); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mQZ.ebo); gl.bindVertexArray(null);
    // UV rects in the atlas (v flipped): top row = white text, bottom row = sign text
    const UV_WHITE = [0, .5, 1, 1], UV_SIGN = [0, 0, 1, .5];

    /* ---------- sizing ---------- */
    let vw = innerWidth, vh = innerHeight, hh = 65, runH = 0, top0 = 0, scale = window.__h3scale || Math.min(devicePixelRatio || 1, lite ? 1.25 : 1.75), cw = 0, chh = 0;
    const resizeCanvas = () => { const r = canvas.getBoundingClientRect(); cw = Math.max(2, Math.round(r.width * scale)); chh = Math.max(2, Math.round(r.height * scale)); if (canvas.width !== cw || canvas.height !== chh) { canvas.width = cw; canvas.height = chh; } };
    const measure = () => {
      vw = innerWidth; vh = innerHeight;
      const hd = document.querySelector('header'); hh = hd ? hd.offsetHeight : 65; sec.style.setProperty('--hh', hh + 'px');
      const pv = Math.max(420, vh - hh); runH = (vw < 760 ? 4.6 : 5.4) * pv; sec.style.height = (runH + pv + 72) + 'px';
      top0 = sec.getBoundingClientRect().top + scrollY; resizeCanvas();
    };

    /* ---------- DOM refs ---------- */
    const copy = sec.querySelector('.h3-copy'), hint = sec.querySelector('.h3-hint'), hud = sec.querySelector('.h3-hud');
    const capT = sec.querySelector('#h3Cap'), capB = sec.querySelector('#h3CapBn'), cta = sec.querySelector('.h3-cta'), dots = [...sec.querySelectorAll('.h3-steps li')], bar = sec.querySelector('#h3Bar');
    const pins = { hub: sec.querySelector('.h3-pins .hub'), van: sec.querySelector('.h3-pins .van'), end: sec.querySelector('.h3-pins .end') };
    const STAGES = [[0, 'Your order reaches our hub', 'অর্ডার পেয়েছি'], [.17, 'Rider collects your parcel', 'পার্সেল তুলে নেওয়া হয়েছে'], [.36, 'Moving across the city', 'পার্সেল পথে আছে'], [.8, 'Arriving at the doorstep', 'দোরগোড়ায় পৌঁছেছে'], [.93, 'Delivered. That is CHOLVO.', 'পার্সেল পৌঁছে গেছে']];
    let stage = -1, copyOn = true, ctaOn = false;

    /* ---------- per-frame ---------- */
    const DAY0 = { zen: L('#10285C'), hor: L('#FF9A52'), sun: [3.0, 2.25, 1.45], sky: L('#7C96C4'), gnd: L('#6A5E58'), fog: L('#E08B55'), lit: .8, amb: .5 };
    const DAY1 = { zen: L('#2E6BC0'), hor: L('#FFD3A0'), sun: [3.3, 2.7, 1.9], sky: L('#86A8DA'), gnd: L('#6A5F55'), fog: L('#EFC59A'), lit: .35, amb: .7 };
    const SUN = (() => { const v = [-.5, .36, .78], l = Math.hypot(...v); return v.map(x => x / l); })();
    let VP = M4.id(), camState = null, tmpVan = M4.id();
    const setU3 = (pr, n, v) => gl.uniform3f(pr.u(n), v[0], v[1], v[2]);

    function update(p, time) {
      const mobile = vw < 760, k = clamp(vw / (mobile ? 640 : 1280), .62, 1);
      const u = clamp((p - .22) / .58), e = .5 - .5 * Math.cos(Math.PI * u), s = S_START + (S_STOP - S_START) * e;
      const f = frame(s), moving = u > 0 && u < 1, bob = moving ? Math.sin(time * 9) * .5 : 0;
      vanM = M4.mul(M4.T(f.x, bob, f.z), M4.Ry(f.ry));
      dVan.n = dVanCyl.n = dVanWed.n = dVanGlow.n = dWorld.n = dWGlow.n = 0;
      buildVan(s, p, time);
      // shutter + parcel
      const so = sm(.05, .2, p), shH = 160 * (1 - so);
      if (shH > 1) dWorld.add(M4.trs(0, 160 - shH / 2, -26, 222, shH, 5, 0), [.6, .62, .66, 0], [5, .5, 0, 0]);
      const dt = sm(.82, .93, p);
      if (dt > 0) {
        const x = lerp(3330, HX, dt), z = lerp(1500, 1688, dt), y = lerp(70, 8, dt) + Math.sin(dt * Math.PI) * 130;
        dWorld.add(M4.mul(M4.T(x, y + 11, z), M4.mul(M4.Ry(dt * 4.5), M4.S(26, 22, 26))), L('#D4A064'), [0, .08, 0, 0]);
        dWorld.add(M4.mul(M4.T(x, y + 11.2, z), M4.mul(M4.Ry(dt * 4.5), M4.S(27, 22.4, 6))), L('#F3E6C8'), [0, .1, 0, 0]);
      }
      dWGlow.add(M4.trs(0, 2.7, 130, 360, 1, 240, 0), [1.0 * so, .66 * so, .3 * so, 0], [0, 0]);
      [dWorld, dWGlow, dVan, dVanCyl, dVanWed, dVanGlow].forEach(b => { b.parent = b === dWorld || b === dWGlow ? M4.id() : vanM; if (b.n) b.upload(); });

      // camera
      const cwk = sm(.2, .42, p), fin = sm(.8, 1, p);
      let Tx = lerp(0, f.x + f.hx * 70, cwk), Tz = lerp(-150, f.z + f.hz * 70, cwk), Ty = lerp(120, 50, cwk);
      Tx = lerp(Tx, 3390, fin); Tz = lerp(Tz, 1660, fin); Ty = lerp(Ty, 20, fin);
      const thc = Math.atan2(f.hx, -f.hz) * DEG, orbit = sm(.3, .56, p);
      const th = (thc - 180 * (1 - orbit) + 88 * fin) / DEG;
      const pitch = ((mobile ? 8 * cwk : 0) + keys([[0, 7], [.14, 11], [.3, 16], [.42, 38], [.6, 18], [.8, 19], [1, 40]], p)) / DEG;
      const D = keys([[0, 1000], [.12, 900], [.3, 900], [.42, 760], [.58, 840], [.8, 860], [1, 1300]], p) / k;
      const sx = mobile ? 0 : lerp(vw * .2, 0, sm(0, .2, p)), sy = (mobile ? lerp(vh * .2, 0, sm(0, .2, p)) : 0) - vh * .04 * cwk;
      const dx = Math.sin(th), dz = -Math.cos(th);
      const eye = [Tx - dx * D * Math.cos(pitch), Ty + D * Math.sin(pitch), Tz - dz * D * Math.cos(pitch)];
      const PP = 1000, fov = 2 * Math.atan(Math.max(420, vh - hh) / 2 / PP);
      const asp = cw / chh, proj = M4.persp(fov, asp, 20, 9000, -2 * sx / Math.max(1, vw), 2 * sy / Math.max(1, vh - hh));
      const view = M4.look(eye, [Tx, Ty, Tz], [0, 1, 0]);
      VP = M4.mul(proj, view);
      camState = { eye, view, proj, th, pitch, Tx, Ty, Tz, D };

      // day palette
      const dd = sm(0, 1, p), pal = k2 => mixv(DAY0[k2], DAY1[k2], dd);
      camState.pal = { zen: pal('zen'), hor: pal('hor'), sun: pal('sun'), sky: pal('sky'), gnd: pal('gnd'), fog: pal('fog'), lit: lerp(DAY0.lit, DAY1.lit, dd), amb: lerp(DAY0.amb, DAY1.amb, dd) };
      camState.so = so; camState.s = s; camState.f = f;
      // pins
      projectPin(pins.hub, 0, 345 + Math.sin(time * 2) * 5, OZ, (1 - sm(.18, .34, p)) * sm(.05, .15, p));
      projectPin(pins.van, f.x, 128 + Math.sin(time * 2.4) * 4, f.z, sm(.24, .32, p) * (1 - sm(.78, .84, p)) * .85);
      projectPin(pins.end, HX, 235 + Math.sin(time * 2.2) * 5, HZ - 30, sm(.92, .98, p));
    }
    function projectPin(el, x, y, z, sc) {
      if (!el) return;
      const m = VP, cx = m[0] * x + m[4] * y + m[8] * z + m[12], cy2 = m[1] * x + m[5] * y + m[9] * z + m[13], cw2 = m[3] * x + m[7] * y + m[11] * z + m[15];
      if (cw2 <= 0 || sc < .02) { el.style.display = 'none'; return; }
      const r = canvas.getBoundingClientRect(), px = (cx / cw2 * .5 + .5) * r.width, py = (1 - (cy2 / cw2 * .5 + .5)) * r.height;
      el.style.display = ''; el.style.transform = `translate3d(${px.toFixed(1)}px,${py.toFixed(1)}px,0) scale(${sc.toFixed(3)})`;
    }
    let vanM = M4.id();
    function buildVan(s, p, time) {
      const V = (x, y, z, w, h, d, c, kd = 0, spc = .5, pa = 0) => dVan.add(M4.trs(x, y + h / 2, z, w, h, d, 0), c, [kd, spc, pa, 0]);
      const paintO = L('#F26A1B'), roofW = L('#F4F6F8'), tyre = L('#101216'), hub = L('#B5BBC6');
      V(0, 24, -36, 78, 82, 122, paintO, 0, .55); V(0, 106, -36, 74, 4, 116, roofW, 0, .45);
      [-1, 1].forEach(sg => V(sg * 39.4, 34, -36, 1.4, 12, 118, L('#0B2A5B'), 0, .3));
      V(0, 24, 50, 78, 36, 52, paintO, 0, .55);
      dVanWed.add(M4.trs(0, 60 + 14, 50, 74, 28, 52, 0), glass, [6, 1.1, 0, 0]);
      V(0, 62, 50, 78.6, 22, 30, glass, 6, 1.1);
      V(0, 86, 44, 76, 3, 40, roofW, 0, .45);
      V(0, 24, 92, 76, 22, 30, paintO, 0, .55);
      V(0, 28, 107.6, 60, 14, 2, dark, 0, .3);
      V(0, 11, 104, 78, 14, 10, dark, 0, .2); V(0, 12, -98, 78, 14, 8, dark, 0, .2);
      [-1, 1].forEach(sg => { V(sg * 27, 34, 107.8, 14, 7, 2, [6, 5.6, 4.8], 2); V(sg * 34.5, 58, -97.6, 8, 16, 2, [2.6, .12, .08], 2); V(sg * 45, 60, 68, 6, 14, 5, dark, 0, .3); });
      V(0, 20, -102.6, 28, 9, 1, white, 0, .3);
      const spin = s / 19;
      [[-33, 64], [33, 64], [-33, -62], [33, -62]].forEach(([x, z]) => {
        dVanCyl.add(M4.mul(M4.T(x, 19, z), M4.mul(M4.Rz(Math.PI / 2), M4.mul(M4.Ry(spin), M4.S(38, 15, 38)))), tyre, [0, .08, 0, 0]);
        dVanCyl.add(M4.mul(M4.T(x + (x > 0 ? 1.2 : -1.2), 19, z), M4.mul(M4.Rz(Math.PI / 2), M4.mul(M4.Ry(spin), M4.S(20, 15.5, 20)))), hub, [0, .9, 0, 0]);
        dVan.add(M4.mul(M4.T(x + (x > 0 ? 1.4 : -1.4), 19, z), M4.mul(M4.Rz(Math.PI / 2), M4.mul(M4.Ry(spin), M4.S(21, 16, 3.5)))), dark, [0, .2, 0, 0]);
        dVan.add(M4.mul(M4.T(x + (x > 0 ? 1.4 : -1.4), 19, z), M4.mul(M4.Rz(Math.PI / 2), M4.mul(M4.Ry(spin + 1.5708), M4.S(21, 16, 3.5)))), dark, [0, .2, 0, 0]);
      });
      dVanGlow.add(M4.trs(0, 1.6, 104 + 150, 190, 1, 300, 0), [.95 * sm(.2, .26, p), .82 * sm(.2, .26, p), .5 * sm(.2, .26, p), 0], [1, 0]);
    }

    function render(p, time) {
      update(p, time);
      const c = camState, pal = c.pal;
      // shadow pass
      const Ee = clamp(c.D * 1.15, 1000, 1900), lc = [c.Tx, 0, c.Tz], le = [lc[0] + SUN[0] * 3500, lc[1] + SUN[1] * 3500, lc[2] + SUN[2] * 3500];
      const lv = M4.look(le, lc, [0, 1, 0]);
      const tsz = 2 * Ee / SH; let px = lv[0] * lc[0] + lv[4] * lc[1] + lv[8] * lc[2] + lv[12], py = lv[1] * lc[0] + lv[5] * lc[1] + lv[9] * lc[2] + lv[13];
      const ox = Math.round(px / tsz) * tsz - px, oy = Math.round(py / tsz) * tsz - py;
      const lvp = M4.mul(M4.ortho(-Ee + ox, Ee + ox, -Ee + oy, Ee + oy, 100, 8000), lv);
      gl.bindFramebuffer(gl.FRAMEBUFFER, shFbo); gl.viewport(0, 0, SH, SH); gl.clear(gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.DEPTH_TEST); gl.depthMask(true); gl.colorMask(false, false, false, false); gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(2, 4);
      gl.useProgram(pShadow); gl.uniformMatrix4fv(pShadow.u('uVP'), false, lvp);
      for (const b of all) if (b.shadow && b.n) { gl.bindVertexArray(b.vao); gl.uniformMatrix4fv(pShadow.u('uParent'), false, b.parent); gl.drawElementsInstanced(gl.TRIANGLES, b.mesh.count, gl.UNSIGNED_SHORT, 0, b.n); }
      gl.colorMask(true, true, true, true); gl.disable(gl.POLYGON_OFFSET_FILL);
      // main pass
      gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, cw, chh); gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      // sky
      const v = c.view, right = [v[0], v[4], v[8]], up = [v[1], v[5], v[9]], fwd = [-v[2], -v[6], -v[10]], pj = c.proj;
      gl.disable(gl.DEPTH_TEST); gl.useProgram(pSky);
      setU3(pSky, 'uRight', right); setU3(pSky, 'uUp', up); setU3(pSky, 'uFwd', fwd); gl.uniform4f(pSky.u('uProj'), pj[0], pj[5], pj[8], pj[9]); gl.uniform1f(pSky.u('uTime'), time);
      setU3(pSky, 'uHorizon', pal.hor); setU3(pSky, 'uZenith', pal.zen); setU3(pSky, 'uSunDir', SUN); setU3(pSky, 'uSunCol', pal.sun);
      gl.bindVertexArray(null); gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.enable(gl.DEPTH_TEST);
      // opaque
      gl.useProgram(pMain);
      gl.uniformMatrix4fv(pMain.u('uVP'), false, VP); gl.uniformMatrix4fv(pMain.u('uLightVP'), false, lvp);
      setU3(pMain, 'uEye', c.eye); setU3(pMain, 'uSunDir', SUN); setU3(pMain, 'uSunCol', pal.sun); setU3(pMain, 'uSkyAmb', pal.sky); setU3(pMain, 'uGndAmb', pal.gnd); setU3(pMain, 'uFogCol', pal.fog);
      setU3(pMain, 'uHorizon', pal.hor); setU3(pMain, 'uZenith', pal.zen); setU3(pMain, 'uIntPos', [0, 150, -210]);
      gl.uniform1f(pMain.u('uFog'), .0002 * Math.min(1, 900 / c.D)); gl.uniform1f(pMain.u('uLit'), pal.lit); gl.uniform1f(pMain.u('uIntI'), .35 + .65 * c.so); gl.uniform1f(pMain.u('uVanS'), c.s);
      gl.uniform1f(pMain.u('uBias'), .0005); gl.uniform1f(pMain.u('uNO'), tsz * 2.4); gl.uniform1f(pMain.u('uShSize'), SH); gl.uniform1f(pMain.u('uAmbK'), pal.amb);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, shTex); gl.uniform1i(pMain.u('uShadow'), 0);
      for (const b of all) if (!b.glow && b.n) { gl.bindVertexArray(b.vao); gl.uniformMatrix4fv(pMain.u('uParent'), false, b.parent); gl.drawElementsInstanced(gl.TRIANGLES, b.mesh.count, gl.UNSIGNED_SHORT, 0, b.n); }
      // additive glow
      gl.useProgram(pGlow); gl.uniformMatrix4fv(pGlow.u('uVP'), false, VP);
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE); gl.depthMask(false);
      for (const b of all) if (b.glow && b.n) { gl.bindVertexArray(b.vao); gl.uniformMatrix4fv(pGlow.u('uParent'), false, b.parent); gl.drawElementsInstanced(gl.TRIANGLES, b.mesh.count, gl.UNSIGNED_SHORT, 0, b.n); }
      // decals
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.useProgram(pDec); gl.uniformMatrix4fv(pDec.u('uVP'), false, VP); gl.bindVertexArray(decVao); gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, decTex); gl.uniform1i(pDec.u('uTex'), 1);
      const dec = (m, uv, tint, gain) => { gl.uniformMatrix4fv(pDec.u('uM'), false, m); gl.uniform4f(pDec.u('uUV'), uv[0], uv[1], uv[2], uv[3]); gl.uniform3f(pDec.u('uTint'), tint[0], tint[1], tint[2]); gl.uniform1f(pDec.u('uGain'), gain); gl.drawElements(gl.TRIANGLES, mQZ.count, gl.UNSIGNED_SHORT, 0); };
      dec(M4.mul(M4.T(0, 205, -16.4), M4.S(470, 62, 1)), UV_SIGN, [1, 1, 1], 1.7);
      dec(M4.mul(M4.T(0, 300, -54.2), M4.S(380, 62, 1)), UV_SIGN, [1, 1, 1], 1.5);
      const vm = vanM; [[1, Math.PI / 2], [-1, -Math.PI / 2]].forEach(([sg, a]) => dec(M4.mul(vm, M4.mul(M4.T(sg * 39.9, 66, -36), M4.mul(M4.Ry(a), M4.S(104, 26, 1)))), UV_WHITE, [1, 1, 1], .95));
      dec(M4.mul(vm, M4.mul(M4.T(0, 78, -97.4), M4.mul(M4.Ry(Math.PI), M4.S(60, 15, 1)))), UV_WHITE, [1, 1, 1], .95);
      gl.depthMask(true); gl.disable(gl.BLEND); gl.bindVertexArray(null);

      // overlays / HUD
      const co = 1 - sm(.03, .15, p);
      copy.style.opacity = co; copy.style.transform = `translate3d(0,${-(1 - co) * 40}px,0)`;
      const on = co > .02; if (on !== copyOn) { copyOn = on; copy.toggleAttribute('inert', !on); }
      hint.style.opacity = 1 - sm(0, .04, p); hud.style.opacity = sm(.1, .2, p);
      let st = 0; for (let i = 0; i < STAGES.length; i++) if (p >= STAGES[i][0]) st = i;
      if (st !== stage) { stage = st; capT.textContent = STAGES[st][1]; capB.textContent = STAGES[st][2]; dots.forEach((d, i) => { d.classList.toggle('ok', i <= st); d.classList.toggle('now', i === st); }); hud.classList.remove('pop'); void hud.offsetWidth; hud.classList.add('pop'); }
      bar.style.transform = `scaleX(${clamp(p)})`;
      const c2 = p > .95; if (c2 !== ctaOn) { ctaOn = c2; cta.classList.toggle('show', c2); }
    }

    /* ---------- loop ---------- */
    let target = 0, cur = -1, lastT = 0, visible = true, raf = 0, slow = 0, nF = 0;
    function loop(now) {
      raf = 0; const time = now / 1000, dt = Math.min(.25, time - (lastT || time)); lastT = time;
      target = clamp((scrollY - top0) / runH);
      cur = cur < 0 ? target : cur + (target - cur) * (1 - Math.exp(-dt * 9));
      if (Math.abs(target - cur) < .00012) cur = target;
      render(cur, time);
      if (!window.__h3noadapt && dt > 0) { slow += dt > .026 ? 1 : -1; slow = clamp(slow, 0, 60); if (slow >= 45 && scale > .6) { scale = Math.max(.6, scale * .85); slow = 0; resizeCanvas(); } }
      if (visible && !(window.__h3once && cur === target)) raf = requestAnimationFrame(loop);
    }
    const kick = () => { if (!raf && visible) raf = requestAnimationFrame(loop); };
    addEventListener('scroll', kick, { passive: true });
    addEventListener('resize', () => { measure(); kick(); });
    new IntersectionObserver(e => { visible = e[0].isIntersecting; if (visible) kick(); }, { rootMargin: '150px' }).observe(sec);
    canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); cancelAnimationFrame(raf); fallback(); });
    addEventListener('load', () => { measure(); kick(); });
    document.fonts && document.fonts.ready.then(() => { measure(); kick(); });
    measure(); kick();
    window.__h3gl = { stats: () => ({ instances: all.reduce((a, b) => a + b.n, 0), drawsMain: all.filter(b => b.n).length, drawsShadow: all.filter(b => b.n && b.shadow).length }), render: (p, t) => render(p, t || 1), setScale: s => { scale = s; resizeCanvas(); } };
  }
})();
