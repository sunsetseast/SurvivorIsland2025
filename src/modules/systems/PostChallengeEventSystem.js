import JourneyReturnCampEvent from '../events/JourneyReturnCampEvent.js';
import FirstWinEvent from '../events/FirstWinEvent.js';
import FirstLossEvent from '../events/FirstLossEvent.js';

export default class PostChallengeEventSystem {
  constructor({ gameManager, challengeManager, campScreen }) {
    this.gameManager = gameManager;
    this.challengeManager = challengeManager;
    this.campScreen = campScreen;
    this.queue = [];
  }

  buildQueue() {
    const result = this.challengeManager.getLastChallengeResult?.();
    if (!result) {
      console.info('[PostChallengeEventSystem] queue build skipped: no challenge result found');
      return [];
    }

    this.queue = [];

    // Journey return camp reaction is always the first narrative beat after challenge.
    this.queue.push(JourneyReturnCampEvent);

    if (FirstWinEvent.isEligible(result, this.gameManager)) {
      this.queue.push(FirstWinEvent);
    }

    if (FirstLossEvent.isEligible(result, this.gameManager)) {
      this.queue.push(FirstLossEvent);
    }

    console.info('[PostChallengeEventSystem] queue built', {
      count: this.queue.length,
      events: this.queue.map((module) => module?.id || module?.name || 'unknown')
    });
    return this.queue;
  }

  async run() {
    console.log('PostChallengeEventSystem running');
    console.info('[PostChallengeEventSystem] run start', {
      day: this.gameManager?.day,
      phase: this.gameManager?.gamePhase
    });
    const queue = this.buildQueue();
    const result = this.challengeManager.getLastChallengeResult?.();

    for (const EventModule of queue) {
      const eventName = EventModule?.id || EventModule?.name || 'unknown_event';
      console.log('[PostChallengeEventSystem] event start', eventName);
      console.info('[PostChallengeEventSystem] event start', { eventName });
      await EventModule.runScripted({
        gameManager: this.gameManager,
        challengeManager: this.challengeManager,
        campScreen: this.campScreen
      });
      console.info('[PostChallengeEventSystem] event end', { eventName });
    }

    if (result?.playerTribeWon) {
      console.info('[PostChallengeEventSystem] event queue complete after immunity win; ending post challenge phase');
      await this.gameManager.endPostChallengePhase();
      return;
    }

    console.info('[PostChallengeEventSystem] event queue complete after immunity loss; starting timed strategy phase');
    await this.gameManager.systems?.strategyPhaseSystem?.startPostChallengePhase?.({
      source: 'PostChallengeEventSystem.run'
    });
  }
}
