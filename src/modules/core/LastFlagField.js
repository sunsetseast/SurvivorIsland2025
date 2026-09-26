export const FLAG_COLORS = ['green', 'purple', 'red', 'orange', 'blue'];
export const LAST_FLAG_INTRO_ART = 'Assets/Challenge/LastFlag/last-flag-intro.png';
export const LAST_FLAG_BOARD_ART = 'Assets/Challenge/LastFlag/last-flag-board.png';

// GameManager creates tribes with these semantic tokens. The hex entries are
// the explicit palettes used by the existing tribe views, for restored casts.
const knownHex = {
  '#ff0000': 'red', '#d64541': 'red',
  '#0066ff': 'blue', '#0000ff': 'blue', '#3498db': 'blue',
  '#ff8c00': 'orange', '#ffa500': 'orange', '#e67e22': 'orange',
  '#228b22': 'green', '#008000': 'green', '#27ae60': 'green',
  '#8a2be2': 'purple', '#800080': 'purple', '#9b59b6': 'purple'
};
const displayHex = {
  red: '#d64541', blue: '#3498db', orange: '#e67e22',
  green: '#27ae60', purple: '#9b59b6'
};

export function tribeColorToken(tribe) {
  for (const value of [tribe?.tribeColor, tribe?.color]) {
    const color = typeof value === 'string' ? value.trim().toLowerCase() : '';
    if (FLAG_COLORS.includes(color)) return color;
    if (knownHex[color]) return knownHex[color];
  }
  return null;
}

export function tribeDisplayColor(tribe) {
  const token = tribeColorToken(tribe);
  if (token) return displayHex[token];
  const raw = tribe?.tribeColor || tribe?.color;
  return typeof raw === 'string' && /^#[0-9a-f]{6}$/i.test(raw) ? raw : '#f4ca78';
}

function hash(value) {
  let result = 2166136261;
  for (const char of String(value)) result = Math.imul(result ^ char.charCodeAt(0), 16777619);
  return result >>> 0;
}

export function lastFlagSeed(tribes, day) {
  return hash(`${day}|${tribes.map(tribe => `${tribe.tribeId ?? tribe.id}:${(tribe.members || [])
    .filter(member => !member.isOut).map(member => member.id).join(',')}`).join('|')}`);
}

export function selectLastFlagFieldColor(tribes, day) {
  const active = (tribes || []).filter(tribe => (tribe.members || []).some(member => !member.isOut));
  const used = new Set(active.map(tribeColorToken).filter(Boolean));
  if (active.some(tribe => !tribeColorToken(tribe))) {
    console.warn('[Last Flag] Unknown tribe color; selecting from known unclaimed flag colors.');
  }
  const available = FLAG_COLORS.filter(color => !used.has(color));
  return available[hash(`${lastFlagSeed(active, day)}|field-color`) % available.length];
}

export const lastFlagAsset = color => `Assets/Challenge/LastFlag/flag-${color}.png`;

// Fixed removal order: perimeter, inner ring, center. All coordinates are
// percentages of the supplied board image, never of the viewport.
const ring = (count, radiusX, radiusY, firstAngle, label) => Array.from({ length: count }, (_, index) => {
  const angle = firstAngle + (Math.PI * 2 * index / count);
  return { x: 50 + radiusX * Math.cos(angle), y: 51 + radiusY * Math.sin(angle), ring: label };
});
export const BOARD_FLAG_SLOTS = [
  ...ring(14, 27, 22, -Math.PI / 2, 'outer'),
  ...ring(6, 12, 10, -Math.PI / 2, 'inner'),
  { x: 50, y: 51, ring: 'center' }
];

// The ground in the front-facing site art recedes toward the horizon.
export const CINEMATIC_FLAG_SLOTS = BOARD_FLAG_SLOTS.map(({ x, y, ring }) => ({
  x: 50 + (x - 50) * (.7 + (y - 29) / 65),
  y: 69 + (y - 51) * .43,
  scale: .72 + (y - 29) / 80,
  ring
}));
