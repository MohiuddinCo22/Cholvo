/* CHOLVO entrance animations; separate from calculator and order logic */
document.addEventListener("DOMContentLoaded", () => {
  const targets = document.querySelectorAll(
    "main section, .strip, .svc button, .why div, .slabs div, .result, footer .fgrid > div"
  );

  targets.forEach((el, index) => {
    if (el.closest(".modal")) return;
    el.classList.add("reveal-ready");
    el.style.transitionDelay = `${Math.min(index % 4, 3) * 70}ms`;
  });

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
      !("IntersectionObserver" in window)) {
    targets.forEach(el => el.classList.add("is-visible"));
    return;
  }

  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.08, rootMargin: "0px 0px -30px 0px" });

  targets.forEach(el => observer.observe(el));
});
