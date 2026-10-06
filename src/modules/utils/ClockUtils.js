import { scrambleCountdown } from '../ui/ScramblePresentation.js';
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

  const gm = globalThis.window?.gameManager;
  const scramble = gm?.gamePhase === 'postChallenge' && !gm.systems?.strategyPhaseSystem?.playerTribeSafe;
  const countdown = scrambleCountdown(dayTimer);
  timeText.innerText = scramble ? countdown.text : displayTime;
  const clock = document.getElementById('camp-clock');
  if (clock) {
    clock.classList.toggle('scramble-clock', scramble); clock.dataset.urgency = scramble ? countdown.tier : '';
    clock.setAttribute('aria-label', scramble ? `Tribal in ${Math.floor(total / 60)} minutes ${seconds} seconds` : `Day ${currentDay}`);
  }
  dayText.classList?.toggle?.('scramble-clock-label', scramble);
  dayText.innerText = scramble ? countdown.label : `Day ${currentDay}`;
}
