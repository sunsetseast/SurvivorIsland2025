import JourneyReturnCampEvent from '../events/JourneyReturnCampEvent.js';
import FirstWinEvent from '../events/FirstWinEvent.js';

export default class PostChallengeEventSystem {
  constructor({ gameManager, challengeManager, campScreen }) {
    this.gameManager = gameManager;
    this.challengeManager = challengeManager;
    this.campScreen = campScreen;
    this.queue = [];
  }

  buildQueue() {
    const result = this.challengeManager.getLastChallengeResult?.();
    if (!result) return [];

    this.queue = [];

    if (JourneyReturnCampEvent.isEligible(result, this.gameManager)) {
      this.queue.push(JourneyReturnCampEvent);
    }

    if (FirstWinEvent.isEligible(result, this.gameManager)) {
      this.queue.push(FirstWinEvent);
    }

    console.info('[PostChallengeEventSystem] queue built', {
      count: this.queue.length,
      events: this.queue.map((module) => module?.id || module?.name || 'unknown')
    });
    return this.queue;
  }

  async run() {
    this.buildQueue();

    for (const EventModule of this.queue) {
      const eventName = EventModule?.id || EventModule?.name || 'unknown_event';
      console.info('[PostChallengeEventSystem] event start', { eventName });
      await EventModule.runScripted({
        gameManager: this.gameManager,
        challengeManager: this.challengeManager,
        campScreen: this.campScreen
      });
      console.info('[PostChallengeEventSystem] event end', { eventName });
    }

    console.info('[PostChallengeEventSystem] scripted flow complete; ending post challenge');
    await this.gameManager.endPostChallengePhase();
  }
}
