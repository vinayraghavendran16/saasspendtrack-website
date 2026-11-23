/* Public sales total only. Count distinct eligible US companies with a
   captured, unrefunded payment on the Founding 25 Razorpay page. */
(() => {
  const capacity = 25;
  const heldBack = 7;
  const verifiedSales = { paidCompanies: 0, verifiedOn: "2026-11-24" };
  if (!verifiedSales || !Number.isInteger(verifiedSales.paidCompanies) || verifiedSales.paidCompanies < 0) return;
  const verifiedDate = new Date(verifiedSales.verifiedOn + 'T00:00:00Z');
  if (!Number.isFinite(verifiedDate.getTime())) return;

  const remaining = Math.max(0, capacity - heldBack - verifiedSales.paidCompanies);
  const date = new Intl.DateTimeFormat('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC',
  }).format(verifiedDate);
  const status = remaining === 0
    ? 'The founding offer is currently unavailable.'
    : remaining + (remaining === 1 ? ' founding spot left' : ' founding spots left') + ' · As of ' + date;
  for (const label of document.querySelectorAll('[data-founding-availability]')) {
    label.textContent = status;
    label.hidden = false;
  }
  if (remaining > 0) {
    for (const link of document.querySelectorAll('[data-founding-checkout]')) {
      link.hidden = false;
      link.parentElement.classList.add('founding-checkout-available');
    }
  }
})();
