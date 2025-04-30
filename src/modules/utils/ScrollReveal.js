// src/utils/scrollReveal.js
export function setupScrollReveal() {
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('reveal');
      }
    });
  }, {
    threshold: 0.3
  });

  document.querySelectorAll('.survivor-card').forEach(card => {
    observer.observe(card);
  });
}