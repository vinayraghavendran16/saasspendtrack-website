/* Public sales total only. Count distinct eligible US companies with a
   captured, unrefunded payment on the Founding 25 Razorpay page. */
(() => {
  const capacity = 25;
  const verifiedSales = null; // Populate with { paidCompanies, verifiedOn } from Razorpay after reconciling sales.
  if (!verifiedSales || !Number.isInteger(verifiedSales.paidCompanies) || verifiedSales.paidCompanies < 0) return;
  const verifiedDate = new Date(verifiedSales.verifiedOn + 'T00:00:00Z');
  if (!Number.isFinite(verifiedDate.getTime())) return;

  const remaining = Math.max(0, capacity - verifiedSales.paidCompanies);
  const date = new Intl.DateTimeFormat('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC',
  }).format(verifiedDate);
  const status = remaining === 0
    ? 'The founding offer is sold out.'
    : remaining + ' of ' + capacity + ' company spots left · Verified ' + date;
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
