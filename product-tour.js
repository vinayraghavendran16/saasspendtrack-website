/* The page scroll controls the tour. Short and narrow screens keep each graphic with its chapter. */
(() => {
  const tour = document.querySelector('.product-tour');
  if (!tour) return;

  const steps = [...tour.querySelectorAll('.tour-step')];
  const links = [...tour.querySelectorAll('.tour-nav a')];
  const stage = tour.querySelector('.tour-stage');
  const progress = tour.querySelector('.tour-progress span');
  const panels = steps.map(step => step.querySelector('.workflow-art').cloneNode(true));
  stage.append(...panels);
  tour.classList.add('tour-ready');

  let frame = null;
  let current = -1;
  function updateTour() {
    frame = null;
    const activationLine = window.innerHeight * 0.48;
    const positions = steps.map(step => step.getBoundingClientRect().top);
    const active = positions.reduce((latest, top, index) => top <= activationLine ? index : latest, 0);
    if (active !== current) {
      current = active;
      panels.forEach((panel, index) => panel.classList.toggle('tour-panel-active', index === active));
      links.forEach((link, index) => {
        if (index === active) link.setAttribute('aria-current', 'location');
        else link.removeAttribute('aria-current');
      });
    }
    const distance = positions[positions.length - 1] - positions[0];
    const fraction = distance > 0 ? Math.min(1, Math.max(0, (activationLine - positions[0]) / distance)) : 0;
    progress.style.transform = 'scaleX(' + fraction + ')';
  }

  function scheduleTour() {
    if (frame === null) frame = requestAnimationFrame(updateTour);
  }
  window.addEventListener('scroll', scheduleTour, { passive: true });
  window.addEventListener('resize', scheduleTour);
  window.addEventListener('pageshow', scheduleTour);
  updateTour();
})();
