/**
 * @module ClockUtils
 * Handles UI updates for the in-game camp clock
 */

export function updateCampClockUI(dayTimer, currentDay) {
  const timerEl = document.getElementById('day-timer');
  const dayEl = document.getElementById('day-label');
  if (!timerEl || !dayEl) return;

  const min = Math.floor(dayTimer / 60);
  const sec = Math.floor(dayTimer % 60);
  timerEl.textContent = `${min}:${sec.toString().padStart(2, '0')}`;
  dayEl.textContent = `Day ${currentDay}`;
}