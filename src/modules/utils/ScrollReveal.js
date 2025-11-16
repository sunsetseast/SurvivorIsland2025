// src/modules/utils/ScrollReveal.js
export function setupScrollReveal() {
  const cards = Array.from(document.querySelectorAll('.survivor-card'));
  const container = document.querySelector('#survivor-stack');
  if (!container || cards.length === 0) return;

  // Reveal cards as they intersect
  const revealObserver = new IntersectionObserver(entries => {
    // ⛔ Do nothing if a flip is in progress (prevents our code from re-focusing)
    if (window.__siFlipping) return;

    entries.forEach(entry => {
      entry.target.classList.toggle('reveal', entry.isIntersecting);
    });
  }, {
    threshold: 0.25
  });

  cards.forEach(card => revealObserver.observe(card));

  const onScroll = () => {
    // ⛔ Pause focus logic during flip to prevent auto jumping
    if (window.__siFlipping) return;

    const containerRect = container.getBoundingClientRect();
    const containerCenter = containerRect.top + containerRect.height / 2;

    let closestCard = null;
    let minDistance = Infinity;

    cards.forEach(card => {
      const rect = card.getBoundingClientRect();
      const cardCenter = rect.top + rect.height / 2;
      const distance = Math.abs(containerCenter - cardCenter);
      if (distance < minDistance) { minDistance = distance; closestCard = card; }
    });

    cards.forEach(card => card.classList.remove('focused'));
    if (closestCard) closestCard.classList.add('focused');
  };

  container.addEventListener('scroll', onScroll, { passive: true });
}