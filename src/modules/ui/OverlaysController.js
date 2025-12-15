let initialized = false;
let currentInventoryPage = 1;

function hideMenuAndOverlay() {
  const menuCard = document.getElementById('menu-card');
  const menuOverlay = document.getElementById('menu-overlay');

  if (menuCard) menuCard.style.display = 'none';
  if (menuOverlay) menuOverlay.style.display = 'none';
}

function handleMapClick() {
  hideMenuAndOverlay();
  const mapOverlay = document.getElementById('map-overlay');
  if (mapOverlay) mapOverlay.style.display = 'block';
}

function handleBagClick() {
  hideMenuAndOverlay();
  const inventoryOverlay = document.getElementById('inventory-overlay');
  if (inventoryOverlay) inventoryOverlay.style.display = 'block';
}

function handleHandshakeClick() {
  hideMenuAndOverlay();

  if (typeof window.openRelationshipsOverlay === 'function') {
    window.resetRelationshipsOverlayToPlayer = true;
    window.openRelationshipsOverlay();
  } else {
    console.error('openRelationshipsOverlay is not defined.');
  }
}

function toggleInventoryPage() {
  const inventoryImage = document.getElementById('inventory-image');
  const inventoryValues = document.getElementById('inventory-values');

  if (!inventoryImage || !inventoryValues) {
    currentInventoryPage = 1;
    return;
  }

  if (currentInventoryPage === 1) {
    inventoryImage.src = 'Assets/inventory2.png';
    inventoryValues.style.display = 'none';
    currentInventoryPage = 2;
  } else {
    inventoryImage.src = 'Assets/inventory1.png';
    inventoryValues.style.display = 'block';
    currentInventoryPage = 1;
  }
}

function resetInventoryPage() {
  const inventoryImage = document.getElementById('inventory-image');
  const inventoryValues = document.getElementById('inventory-values');

  if (inventoryImage) inventoryImage.src = 'Assets/inventory1.png';
  if (inventoryValues) inventoryValues.style.display = 'block';
  currentInventoryPage = 1;
}

function closeInventoryOverlay() {
  const inventoryOverlay = document.getElementById('inventory-overlay');
  if (inventoryOverlay) inventoryOverlay.style.display = 'none';
  resetInventoryPage();
}

function goToView(viewName) {
  const menuCard = document.getElementById('menu-card');
  const menuOverlay = document.getElementById('menu-overlay');
  const mapOverlay = document.getElementById('map-overlay');

  if (menuCard) menuCard.style.display = 'none';
  if (menuOverlay) menuOverlay.style.display = 'none';
  if (mapOverlay) mapOverlay.style.display = 'none';

  const campContent = document.getElementById('camp-content');
  if (campContent) {
    campContent.style.transform = 'scaleX(1)';
  }

  window.previousCampView = null;

  if (window.campScreen && typeof window.campScreen.loadView === 'function') {
    window.campScreen.loadView(viewName);
  }
}

function handleInventoryOverlayClick(event) {
  const inventoryOverlay = document.getElementById('inventory-overlay');
  const inventoryNavButton = document.getElementById('inventory-nav-button');

  if (!inventoryOverlay) return;

  if (inventoryNavButton && inventoryNavButton.contains(event.target)) {
    return;
  }

  if (event.target === inventoryOverlay) {
    closeInventoryOverlay();
  }
}

function handleInventoryEscape(event) {
  if (event.key !== 'Escape') return;

  const inventoryOverlay = document.getElementById('inventory-overlay');
  if (inventoryOverlay && inventoryOverlay.style.display === 'block') {
    closeInventoryOverlay();
  }
}

function setupInventoryOverlay() {
  const inventoryOverlay = document.getElementById('inventory-overlay');
  const inventoryNavButton = document.getElementById('inventory-nav-button');

  if (!inventoryOverlay) return;

  inventoryOverlay.addEventListener('click', handleInventoryOverlayClick);
  document.addEventListener('keydown', handleInventoryEscape);

  if (inventoryNavButton) {
    inventoryNavButton.addEventListener('click', (event) => {
      event.stopPropagation();
      toggleInventoryPage();
    });
  }
}

function handleRelationshipsOverlayClick(event) {
  const relationshipsOverlay = document.getElementById('relationships-overlay');
  const relationshipsGrid = document.getElementById('relationships-grid');

  if (!relationshipsOverlay) return;

  if (!relationshipsGrid || !relationshipsGrid.contains(event.target)) {
    relationshipsOverlay.style.display = 'none';
  }
}

function handleRelationshipsGridClick(event) {
  event.stopPropagation();
}

function handleRelationshipsEscape(event) {
  if (event.key !== 'Escape') return;

  const relationshipsOverlay = document.getElementById('relationships-overlay');
  if (relationshipsOverlay && relationshipsOverlay.style.display === 'block') {
    relationshipsOverlay.style.display = 'none';
  }
}

function setupRelationshipsOverlay() {
  const relationshipsOverlay = document.getElementById('relationships-overlay');
  const relationshipsGrid = document.getElementById('relationships-grid');

  if (!relationshipsOverlay) return;

  relationshipsOverlay.addEventListener('click', handleRelationshipsOverlayClick);

  if (relationshipsGrid) {
    relationshipsGrid.addEventListener('click', handleRelationshipsGridClick);
  }

  document.addEventListener('keydown', handleRelationshipsEscape);
}

function setupMapHotspots() {
  const mapOverlay = document.getElementById('map-overlay');
  if (!mapOverlay) return;

  mapOverlay.addEventListener('click', (event) => {
    const hotspot = event.target.closest('.map-hotspot');
    if (!hotspot || !mapOverlay.contains(hotspot)) return;

    const viewName = hotspot.dataset.view;
    if (viewName) {
      goToView(viewName);
    }
  });
}

function setRelationshipsTribeName(tribeName) {
  const tribeNameElement = document.getElementById('relationships-tribe-name');
  if (tribeNameElement) {
    tribeNameElement.textContent = (tribeName || '').toUpperCase();
  }
}

function setupButtons() {
  const menuMapButton = document.getElementById('menu-map-button');
  const menuBagButton = document.getElementById('menu-bag-button');
  const menuHandshakeButton = document.getElementById('menu-handshake-button');

  if (menuMapButton) {
    menuMapButton.addEventListener('click', handleMapClick);
  }

  if (menuBagButton) {
    menuBagButton.addEventListener('click', handleBagClick);
  }

  if (menuHandshakeButton) {
    menuHandshakeButton.addEventListener('click', handleHandshakeClick);
  }
}

function initializeOverlays() {
  if (initialized) return;
  initialized = true;

  setupButtons();
  setupInventoryOverlay();
  setupRelationshipsOverlay();
  setupMapHotspots();

  window.setRelationshipsTribeName = setRelationshipsTribeName;
}

export function initOverlaysController() {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeOverlays, { once: true });
  } else {
    initializeOverlays();
  }
}

export { toggleInventoryPage };
