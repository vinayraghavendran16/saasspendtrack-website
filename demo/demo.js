const walkthrough = document.querySelector('#walkthrough');

document.querySelectorAll('[data-demo-time]').forEach((chapter) => {
  chapter.addEventListener('click', (event) => {
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || walkthrough.error) return;

    event.preventDefault();
    walkthrough.currentTime = Number(chapter.dataset.demoTime);
    walkthrough.play().catch(() => {});
    walkthrough.focus();
    if (!window.matchMedia('(min-width: 761px)').matches) {
      walkthrough.scrollIntoView({ block: 'center' });
    }
  });
});
