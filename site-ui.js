/* Shared responsive navigation and entrance effects for the marketing pages. */
(() => {
  const header = document.querySelector('.site-header');
  const menu = header.querySelector('#site-menu');
  const toggle = header.querySelector('.site-menu-toggle');
  const narrow = matchMedia('(max-width: 1080px)');
  header.classList.add('site-header-ready');

  function setMenu(open) {
    menu.hidden = narrow.matches && !open;
    toggle.setAttribute('aria-expanded', String(narrow.matches && open));
  }

  setMenu(false);
  toggle.addEventListener('click', () => setMenu(toggle.getAttribute('aria-expanded') !== 'true'));
  narrow.addEventListener('change', () => setMenu(false));
  header.addEventListener('keydown', event => {
    if (event.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') {
      setMenu(false);
      toggle.focus();
    }
  });

  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  if (!document.body.classList.contains('inner-page') || reducedMotion.matches || !('IntersectionObserver' in window)) return;
  const observer = new IntersectionObserver(entries => {
    for (const { target, isIntersecting } of entries) {
      if (!isIntersecting) continue;
      target.classList.add('site-arrive');
      observer.unobserve(target);
    }
  }, { threshold: 0.14 });
  const cards = document.querySelectorAll('.detail-example, .product-page-body > section, .cmp-card, .tl-card, .tpl-card, .blog-card, .pricing-card');
  cards.forEach(card => observer.observe(card));
})();
