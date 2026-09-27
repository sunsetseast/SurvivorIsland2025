import { clearChildren } from '../utils/DOMUtils.js';
import { TRIBAL_PACING, tribalMotionDelay } from './TribalPacing.js';

export default class TribalBeatRunner {
  constructor({ container, beats = [], renderBeat, onCue } = {}) {
    this.container = container;
    this.beats = Array.isArray(beats) ? beats : [];
    this.renderBeat = renderBeat;
    this.onCue = onCue;
    this.currentIndex = -1;
    this.advanceUnlocked = true;
    this.autoAdvanceTimer = null;
    this.skipUnlockTimer = null;
    this.updateAdvanceState = null;
  }

  start(index = 0) {
    if (!this.container || typeof this.renderBeat !== 'function' || this.beats.length === 0) return;
    this.goTo(index);
  }

  setBeats(beats = [], { index = 0, autoRender = true } = {}) {
    this._clearBeatTimers();
    this.beats = Array.isArray(beats) ? beats : [];
    if (!this.beats.length) {
      this.currentIndex = -1;
      clearChildren(this.container);
      return;
    }

    const clamped = Math.max(0, Math.min(index, this.beats.length - 1));
    this.currentIndex = clamped;
    if (autoRender) {
      this._renderCurrent();
    }
  }

  next({ force = false } = {}) {
    if (!force && !this.canAdvance()) return false;
    this.goTo(this.currentIndex + 1, { force: true });
    return true;
  }

  goTo(index, { force = false } = {}) {
    if (!this.beats.length) return;
    if (index < 0 || index >= this.beats.length) return;
    if (!force && index > this.currentIndex && !this.canAdvance()) return;

    this._clearBeatTimers();

    const previousBeat = this.beats[this.currentIndex];
    previousBeat?.onExit?.({
      index: this.currentIndex,
      beat: previousBeat,
      nextIndex: index
    });

    this.currentIndex = index;
    this._renderCurrent();
  }

  getCurrentBeat() {
    if (this.currentIndex < 0 || this.currentIndex >= this.beats.length) return null;
    return this.beats[this.currentIndex];
  }

  canAdvance() {
    return this.advanceUnlocked;
  }

  destroy() {
    this._clearBeatTimers();
    const currentBeat = this.getCurrentBeat();
    currentBeat?.onExit?.({
      index: this.currentIndex,
      beat: currentBeat,
      nextIndex: -1
    });
    this.currentIndex = -1;
    this.beats = [];
    clearChildren(this.container);
  }

  _renderCurrent({ runOnEnter = true } = {}) {
    const beat = this.getCurrentBeat();
    if (!beat) return;

    clearChildren(this.container);
    if (runOnEnter) {
      beat.onEnter?.({ index: this.currentIndex, beat });
      this._announceCue(beat);
    }

    if (runOnEnter) {
      this.advanceUnlocked = !Number.isFinite(Number(beat.canSkipAfterMs)) || Number(beat.canSkipAfterMs) <= 0;
    }

    this.updateAdvanceState = this.renderBeat(beat, {
      index: this.currentIndex,
      next: () => this.getCurrentBeat() === beat && this.next(),
      goTo: (index) => { if (this.getCurrentBeat() === beat) this.goTo(index); },
      setBeats: (beats, options) => { if (this.getCurrentBeat() === beat) this.setBeats(beats, options); },
      getCurrentBeat: () => this.getCurrentBeat(),
      canAdvance: () => this.canAdvance(),
      metadata: {
        pauseMs: Number(beat.pauseMs) || 0,
        canSkipAfterMs: Number(beat.canSkipAfterMs) || 0,
        autoAdvance: Boolean(beat.autoAdvance),
        sfx: beat.sfx || null,
        musicCue: beat.musicCue || null,
        cameraTargetIds: beat.cameraTargetIds || [],
        reactionTargetIds: beat.reactionTargetIds || [],
        mood: beat.mood || null
      }
    });

    if (runOnEnter) {
      const skipDelay = beat.parchment?.show
        ? Math.max(tribalMotionDelay(Number(beat.canSkipAfterMs) || 0),
          tribalMotionDelay(TRIBAL_PACING.parchmentRaise) + tribalMotionDelay(TRIBAL_PACING.parchmentReadMin))
        : tribalMotionDelay(Number(beat.canSkipAfterMs) || 0);
      if (skipDelay > 0) {
        this.skipUnlockTimer = setTimeout(() => {
          if (this.getCurrentBeat() !== beat) return;
          this.advanceUnlocked = true;
          this.updateAdvanceState?.();
        }, skipDelay);
      }

      if (beat.autoAdvance && !beat.requiresDecision) {
        const pauseMs = Math.max(tribalMotionDelay(Number(beat.pauseMs) || 0), skipDelay,
          tribalMotionDelay(TRIBAL_PACING.minimumAutoHold));
        this.autoAdvanceTimer = setTimeout(() => {
          if (this.getCurrentBeat() === beat) this.next({ force: true });
        }, pauseMs);
      }
    }
  }

  _announceCue(beat) {
    if (typeof this.onCue !== 'function') return;
    this.onCue({
      sfx: beat.sfx || null,
      musicCue: beat.musicCue || null,
      cameraTargetIds: beat.cameraTargetIds || [],
      reactionTargetIds: beat.reactionTargetIds || [],
      mood: beat.mood || null,
      beat
    });
  }

  _clearBeatTimers() {
    if (this.autoAdvanceTimer) clearTimeout(this.autoAdvanceTimer);
    if (this.skipUnlockTimer) clearTimeout(this.skipUnlockTimer);
    this.autoAdvanceTimer = null;
    this.skipUnlockTimer = null;
    this.updateAdvanceState = null;
  }
}
