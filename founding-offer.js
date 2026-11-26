// Add the USD annual checkout URLs here once the payment pages are ready.
const FOUNDING_CHECKOUT_URL = '';
const GROWTH_CHECKOUT_URL = '';
const FOUNDING_CUSTOMER_CAP = 25;
// Update from verified, unrefunded founding purchases, or close the offer at checkout.
const FOUNDING_CUSTOMERS_PAID = 0;

const foundingAvailable = FOUNDING_CUSTOMERS_PAID < FOUNDING_CUSTOMER_CAP;
for (const label of document.querySelectorAll('[data-founding-availability]')) {
  label.textContent = foundingAvailable
    ? 'Limited to the first ' + FOUNDING_CUSTOMER_CAP + ' customers worldwide. After that, new customers pay the $2,000 annual Growth price.'
    : 'The founding cohort is full. New customers can join Growth at $2,000/year.';
}
for (const link of document.querySelectorAll('[data-plan-checkout]')) {
  const isFounding = link.dataset.planCheckout === 'founding';
  const checkoutUrl = isFounding ? FOUNDING_CHECKOUT_URL : GROWTH_CHECKOUT_URL;
  if (isFounding && !foundingAvailable) {
    link.hidden = true;
    continue;
  }
  if (checkoutUrl) {
    link.href = checkoutUrl;
    link.textContent = isFounding ? 'Buy Founding' : 'Buy Growth';
  }
}
