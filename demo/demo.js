const walkthrough = document.querySelector('#walkthrough');
let seekableCopy;

async function openChapter(time) {
  if (walkthrough.seekable.length && walkthrough.seekable.end(0) >= time &&
      walkthrough.seekable.end(0) > 0) {
    walkthrough.currentTime = time;
    await walkthrough.play();
    return;
  }

  // Some proxies serve the MP4 without byte ranges. A local copy supports seeking.
  seekableCopy ??= fetch(walkthrough.querySelector('source').src)
    .then((response) => {
      if (!response.ok) throw new Error('Walkthrough unavailable');
      return response.blob();
    })
    .then((blob) => URL.createObjectURL(blob))
    .catch((error) => {
      seekableCopy = undefined;
      throw error;
    });

  const source = await seekableCopy;
  if (walkthrough.src !== source) walkthrough.src = source;
  if (!walkthrough.readyState) {
    await new Promise((resolve, reject) => {
      walkthrough.addEventListener('loadedmetadata', resolve, { once: true });
      walkthrough.addEventListener('error', reject, { once: true });
    });
  }
  walkthrough.currentTime = time;
  await walkthrough.play();
}

document.querySelectorAll('[data-demo-time]').forEach((chapter) => {
  chapter.addEventListener('click', (event) => {
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || walkthrough.error) return;

    event.preventDefault();
    openChapter(Number(chapter.dataset.demoTime)).catch(() => {
      window.location.assign(chapter.href);
    });
    walkthrough.focus();
    if (!window.matchMedia('(min-width: 761px)').matches) {
      walkthrough.scrollIntoView({ block: 'center' });
    }
  });
});
