/* One light scroll reveal for key blocks. Content stays visible without JS or with reduced motion. */
document.addEventListener("DOMContentLoaded", () => {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) return;
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add("is-visible"); io.unobserve(e.target); } }), { threshold: .1 });
  document.querySelectorAll(".head, .steps li, .svc a, .app, .why div").forEach(el => { if (el.closest(".modal")) return; el.classList.add("reveal"); io.observe(el); });
});
