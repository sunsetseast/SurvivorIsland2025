// Coordinates are measured on the 1024 × 1536 Tribal backgrounds. Each point
// is the center of the visible TOP surface of a stump, not its middle.
export const TRIBAL_ART_WIDTH = 1024;
export const TRIBAL_ART_HEIGHT = 1536;

const measured = {
  2: [[374, 839], [653, 839]],
  3: [[245, 850], [510, 781], [775, 850]],
  4: [[160, 855], [385, 808], [613, 808], [817, 855]],
  5: [[100, 869], [300, 869], [500, 869], [700, 869], [910, 869]],
  6: [[84, 833], [245, 817], [397, 816], [580, 816], [744, 817], [900, 833]],
  7: [[240, 805], [414, 775], [590, 775], [780, 805], [335, 888], [509, 860], [686, 888]],
  8: [[200, 817], [375, 781], [545, 781], [720, 817], [260, 894], [440, 863], [615, 863], [790, 894]],
  9: [[160, 817], [340, 781], [510, 781], [690, 781], [870, 817], [255, 884], [430, 860], [610, 860], [780, 884]],
  10: [[82, 830], [255, 780], [430, 780], [600, 780], [785, 830], [164, 915], [340, 882], [510, 860], [685, 882], [862, 915]],
  11: [[84, 817], [256, 780], [432, 780], [610, 780], [782, 817], [155, 918], [335, 882], [510, 860], [688, 882], [862, 918], [938, 817]],
  12: [[107, 849], [260, 849], [420, 849], [597, 849], [763, 849], [920, 849], [77, 902], [243, 908], [420, 908], [604, 908], [787, 908], [943, 902]]
};

// The later backgrounds have a rear and a front row. Keep depth and scale with
// each physical slot so all beats use the same perspective.
export const TRIBAL_SEAT_LAYOUTS = Object.freeze(Object.fromEntries(
  Object.entries(measured).map(([count, points]) => [count, Object.freeze(points.map(([x, y], index) => {
    const front = Number(count) >= 7 && y >= (Number(count) === 12 ? 890 : 850);
    const crowded = Number(count) >= 10;
    const width = Number(count) >= 11 ? (front ? 72 : 68) : crowded ? (front ? 85 : 75)
      : front ? 100 : Number(count) <= 4 ? 130 : 100;
    const height = Number(count) >= 11 ? (front ? 84 : 86) : crowded ? (front ? 100 : 95)
      : front ? 118 : Number(count) <= 4 ? 160 : 126;
    return Object.freeze({ id: `stump-${index + 1}`, x, y, width, height, depth: front ? 3 : 2 });
  }))])
));

export function assignTribalSeats(members = [], count = members.length) {
  const slots = TRIBAL_SEAT_LAYOUTS[Math.max(2, Math.min(12, Number(count) || 2))] || [];
  return new Map(members.map((member, index) => [String(member.id), slots[index]?.id]));
}

export function getTribalSeat(count, slotId) {
  return TRIBAL_SEAT_LAYOUTS[Math.max(2, Math.min(12, Number(count) || 2))]?.find(slot => slot.id === slotId) || null;
}
