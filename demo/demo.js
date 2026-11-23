const walkthrough = document.querySelector('#walkthrough');
const chapterStatus = document.querySelector('#chapter-status');
const chapters = document.querySelectorAll('[data-demo-time]');
let seekableCopy;
let latestRequest = 0;

function canSeekTo(time) {
  for (let index = 0; index < walkthrough.seekable.length; index += 1) {
    if (walkthrough.seekable.start(index) <= time && walkthrough.seekable.end(index) > time) {
      return true;
    }
  }
  return false;
}

function waitForMetadata() {
  if (walkthrough.readyState >= 1) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const cleanup = () => {
      walkthrough.removeEventListener('loadedmetadata', loaded);
      walkthrough.removeEventListener('error', failed);
    };
    const loaded = () => { cleanup(); resolve(); };
    const failed = () => { cleanup(); reject(new Error('Walkthrough unavailable')); };
    walkthrough.addEventListener('loadedmetadata', loaded);
    walkthrough.addEventListener('error', failed);
  });
}

function loadSeekableCopy() {
  // A local copy enables seeking when a proxy serves the MP4 without byte ranges.
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
  return seekableCopy;
}

async function openChapter(chapter) {
  const request = ++latestRequest;
  const time = Number(chapter.dataset.demoTime);
  walkthrough.pause();
  chapterStatus.textContent = 'Opening chapter…';

  try {
    if (!canSeekTo(time)) {
      const source = await loadSeekableCopy();
      if (request !== latestRequest) return;
      if (walkthrough.src !== source) walkthrough.src = source;
      await waitForMetadata();
    }
    if (request !== latestRequest) return;
    walkthrough.currentTime = time;
    chapters.forEach((link) => link.removeAttribute('aria-current'));
    chapter.setAttribute('aria-current', 'true');
    chapterStatus.textContent = '';
    walkthrough.play().catch(() => {
      if (request === latestRequest) chapterStatus.textContent = 'Press play to start this chapter.';
    });
  } catch {
    if (request === latestRequest) chapterStatus.textContent = 'Could not open this chapter. Try again or use the player controls.';
  }
}

chapters.forEach((chapter) => {
  chapter.addEventListener('click', (event) => {
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || walkthrough.error) return;

    event.preventDefault();
    openChapter(chapter);
    walkthrough.focus();
    if (!window.matchMedia('(min-width: 761px)').matches) {
      walkthrough.scrollIntoView({ block: 'center' });
    }
  });
});
