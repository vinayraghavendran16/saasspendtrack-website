/* Keep campaign context when a visitor goes from the site to the app. */
function updateCampaignLink(link, attribution = {}) {
  const current = new URL(window.location.href);
  const destination = new URL(link.href);
  for (const [key, value] of current.searchParams) {
    if (/^utm_[a-z_]+$/.test(key) || key === 'hero_hook' || key === 'hero_assignment') {
      destination.searchParams.set(key, value);
    }
  }
  for (const [key, value] of Object.entries(attribution)) {
    destination.searchParams.set(key, value);
  }
  link.href = destination.href;
}
