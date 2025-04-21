
import { GameManager } from './GameManager.js';
import { ScreenManager } from './ScreenManager.js';
import { EventManager, GameEvents } from './EventManager.js';

const gameManager = new GameManager();
const screenManager = new ScreenManager();
const eventManager = new EventManager();

export {
  gameManager,
  screenManager,
  eventManager,
  GameEvents
};
