const state = {
  initialized: false,
};

function handleBackdropClick(event) {
  const overlay = document.getElementById('social-menu-overlay');
  const panel = document.getElementById('social-menu-panel');

  if (!overlay) return;

  if (event.target === overlay && (!panel || !panel.contains(event.target))) {
    closeSocialMenuOverlay();
  }
}

function handleEscape(event) {
  if (event.key !== 'Escape') return;
  closeSocialMenuOverlay();
}

function setupSocialMenuOverlay() {
  if (state.initialized) return;

  const overlay = document.getElementById('social-menu-overlay');
  const relationshipsButton = document.getElementById('social-relationships-button');
  const alliancesButton = document.getElementById('social-alliances-button');
  const closeButton = document.getElementById('social-menu-close-button');

  if (overlay) {
    overlay.addEventListener('click', handleBackdropClick);
  }

  if (relationshipsButton) {
    relationshipsButton.addEventListener('click', () => {
      closeSocialMenuOverlay();
      if (typeof window !== 'undefined') {
        window.resetRelationshipsOverlayToPlayer = true;
      }
      if (typeof window !== 'undefined' && typeof window.openRelationshipsOverlay === 'function') {
        window.openRelationshipsOverlay();
      }
    });
  }

  if (alliancesButton) {
    alliancesButton.addEventListener('click', () => {
      closeSocialMenuOverlay();
      if (typeof window !== 'undefined' && typeof window.openAlliancesOverlay === 'function') {
        window.openAlliancesOverlay();
      }
    });
  }

  if (closeButton) {
    closeButton.addEventListener('click', () => {
      closeSocialMenuOverlay();
    });
  }

  state.initialized = true;
}

export function openSocialMenuOverlay() {
  setupSocialMenuOverlay();
  const overlay = document.getElementById('social-menu-overlay');
  if (!overlay) return;

  overlay.style.display = 'flex';
  document.addEventListener('keydown', handleEscape);
}

export function closeSocialMenuOverlay() {
  const overlay = document.getElementById('social-menu-overlay');
  if (!overlay) return;

  overlay.style.display = 'none';
  document.removeEventListener('keydown', handleEscape);
}

if (typeof window !== 'undefined') {
  window.openSocialMenuOverlay = openSocialMenuOverlay;
  window.closeSocialMenuOverlay = closeSocialMenuOverlay;
}
