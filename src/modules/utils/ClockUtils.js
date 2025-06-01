/**
 * @module ClockUtils
 * Handles UI updates for the in-game camp clock
 */

export function updateCampClockUI(dayTimer, currentDay) {
  // Use the correct element IDs from CampScreen.js
  const timeText = document.getElementById('clock-time-text');
  const dayText = document.getElementById('clock-day-text');

  if (!(timeText instanceof HTMLElement) || !(dayText instanceof HTMLElement)) return;

  // Format time to match CampScreen's format (HH:MM:SS)
  const total = Math.max(0, Math.floor(dayTimer));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;

  const displayTime = 
    `${hours.toString().padStart(2, '0')}:` +
    `${minutes.toString().padStart(2, '0')}:` +
    `${seconds.toString().padStart(2, '0')}`;

  timeText.innerText = displayTime;
  dayText.innerText = `Day ${currentDay}`;
}