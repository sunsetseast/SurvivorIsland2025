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

    // Journey return camp reaction is the first narrative beat when a journey return is pending.
    if (JourneyReturnCampEvent.isEligible(result, this.gameManager)) {
      this.queue.push(JourneyReturnCampEvent);
    }

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
    const result = this.challengeManager.getLastChallengeResult?.();
    const isDay1FirstContact = (result?.challengeDay === 1) || (result?.challengeKey === 'first_contact' && this.gameManager?.day === 1);

    if (isDay1FirstContact) {
      const journeyContext = JourneyReturnCampEvent.getPendingContext?.(this.gameManager);
      const hasPendingJourneyReturn = Boolean(journeyContext?.journeyerId);
      const playerWasJourneyer = Boolean(journeyContext?.isPlayerJourneyer || this.gameManager?.journey?.selection?.playerWasSelected);

      if (result?.playerTribeWon) {
        if (!playerWasJourneyer) {
          await FirstWinEvent.runScripted({
            gameManager: this.gameManager,
            challengeManager: this.challengeManager,
            campScreen: this.campScreen
          });
        }

        if (hasPendingJourneyReturn) {
          if (playerWasJourneyer) {
            await JourneyReturnCampEvent.simulatePart1IfPlayerAway({
              gameManager: this.gameManager,
              strategyPhaseSystem: null,
              journeyerId: journeyContext.journeyerId
            });
            await JourneyReturnCampEvent.startPart2({
              gameManager: this.gameManager,
              strategyPhaseSystem: null,
              journeyerId: journeyContext.journeyerId,
              isPlayerJourneyer: true
            });
          } else {
            await JourneyReturnCampEvent.startPart1({
              gameManager: this.gameManager,
              strategyPhaseSystem: null,
              journeyerId: journeyContext.journeyerId
            });
            this.campScreen?.loadView?.('tribeFlag');
            await new Promise((resolve) => setTimeout(resolve, 16000));
            await JourneyReturnCampEvent.startPart2({
              gameManager: this.gameManager,
              strategyPhaseSystem: null,
              journeyerId: journeyContext.journeyerId,
              isPlayerJourneyer: false
            });
          }
          JourneyReturnCampEvent.markHandled?.(this.gameManager);
        }

        await this.gameManager.endPostChallengePhase();
        return;
      }

      await this.gameManager.systems?.strategyPhaseSystem?.startPostChallengePhase?.({
        source: 'PostChallengeEventSystem.run.day1-loss'
      });

      if (!playerWasJourneyer) {
        await FirstLossEvent.runScripted({
          gameManager: this.gameManager,
          challengeManager: this.challengeManager,
          campScreen: this.campScreen
        });
      }

      if (hasPendingJourneyReturn) {
        if (playerWasJourneyer) {
          await JourneyReturnCampEvent.simulatePart1IfPlayerAway({
            gameManager: this.gameManager,
            strategyPhaseSystem: this.gameManager.systems?.strategyPhaseSystem || null,
            journeyerId: journeyContext.journeyerId
          });
          await JourneyReturnCampEvent.startPart2({
            gameManager: this.gameManager,
            strategyPhaseSystem: this.gameManager.systems?.strategyPhaseSystem || null,
            journeyerId: journeyContext.journeyerId,
            isPlayerJourneyer: true
          });
        } else {
          await JourneyReturnCampEvent.startPart1({
            gameManager: this.gameManager,
            strategyPhaseSystem: this.gameManager.systems?.strategyPhaseSystem || null,
            journeyerId: journeyContext.journeyerId
          });
          await JourneyReturnCampEvent.startPart2({
            gameManager: this.gameManager,
            strategyPhaseSystem: this.gameManager.systems?.strategyPhaseSystem || null,
            journeyerId: journeyContext.journeyerId,
            isPlayerJourneyer: false
          });
        }
        JourneyReturnCampEvent.markHandled?.(this.gameManager);
      }

      return;
    }

    const queue = this.buildQueue();

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
