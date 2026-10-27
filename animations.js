/* Lightweight entrance animations. If JS or IntersectionObserver is unavailable, content remains visible. */
document.addEventListener("DOMContentLoaded", () => {
  const targets = document.querySelectorAll("main section, .strip, .svc button, .why div, .slabs div, .result, footer .fgrid > div, .how-step");
  const reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduced || !("IntersectionObserver" in window)) return;
  targets.forEach((el, index) => {
    if (el.closest(".modal")) return;
    el.classList.add("reveal-ready");
    el.style.transitionDelay = `${Math.min(index % 4, 3) * 55}ms`;
  });
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.08, rootMargin: "0px 0px -24px 0px" });
  targets.forEach(el => observer.observe(el));
});
