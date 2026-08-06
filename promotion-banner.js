const banners = [...document.querySelectorAll('[data-promotion-banner]')];
const homepageAnnouncement = document.querySelector('.announcement[data-dynamic-promotion]');
const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
fetch('/api/promotions', { headers: { Accept: 'application/json' } }).then(response => response.json()).then(data => {
  const promotion = data.promotions?.[0];
  if (!promotion) return;
  const content = `${escapeHtml(promotion.promotionMessage)} <strong>${escapeHtml(promotion.discountCode)}</strong>`;
  if (homepageAnnouncement) homepageAnnouncement.innerHTML = content;
  banners.forEach(banner => { banner.innerHTML = content; banner.hidden = false; });
}).catch(() => {});
