/* Hero scene: pointer tilt for the CSS 3D parcel + example status cycle (uses the real tracking statuses). */
(() => {
  const scene = document.getElementById('scene'); if (!scene) return;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const txt = document.getElementById('stTxt'), bar = document.getElementById('stBar');
  const S = ['Order Received', 'Picked Up', 'On the Way', 'Dropped Off', 'Delivered'];
  let i = 0;
  const show = () => { txt.textContent = S[i]; bar.style.width = ((i + 1) / S.length * 100) + '%'; };
  show();
  if (reduced) { i = 2; show(); return; }
  let t = setInterval(() => { i = (i + 1) % S.length; show(); }, 2200), vis = true;
  new IntersectionObserver(e => { vis = e[0].isIntersecting; clearInterval(t); if (vis) t = setInterval(() => { i = (i + 1) % S.length; show(); }, 2200); }).observe(scene);
  if (matchMedia('(hover:hover)').matches) scene.addEventListener('pointermove', e => {
    const r = scene.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - .5, y = (e.clientY - r.top) / r.height - .5;
    scene.style.setProperty('--ry', (x * 22) + 'deg'); scene.style.setProperty('--rx', (-y * 14) + 'deg');
  });
  scene.addEventListener('pointerleave', () => { scene.style.setProperty('--ry', '0deg'); scene.style.setProperty('--rx', '0deg'); });
})();
