// Trial-only launch: payment acquisition disabled until provider validation.
const FOUNDING_CUSTOMER_CAP = 25;
for (const label of document.querySelectorAll('[data-founding-availability]')) {
  label.textContent = 'Founding offer limited to the first ' + FOUNDING_CUSTOMER_CAP + ' customers. Contact us for availability. Paid checkout is temporarily unavailable.';
}
for (const link of document.querySelectorAll('[data-plan-checkout]')) {
  const isFounding = link.dataset.planCheckout === 'founding';
  link.href = 'mailto:hello@saasspendtrack.com?subject=' + (isFounding ? 'Founding%20plan' : 'Growth%20plan');
  link.textContent = isFounding ? 'Ask about Founding' : 'Ask about Growth';
}
