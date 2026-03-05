import { clearChildren } from '../utils/DOMUtils.js';

export default class TribalBeatRunner {
  constructor({ container, beats = [], renderBeat } = {}) {
    this.container = container;
    this.beats = Array.isArray(beats) ? beats : [];
    this.renderBeat = renderBeat;
    this.currentIndex = -1;
  }

  start(index = 0) {
    if (!this.container || typeof this.renderBeat !== 'function' || this.beats.length === 0) return;
    this.goTo(index);
  }

  setBeats(beats = [], { index = 0, autoRender = true } = {}) {
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

  next() {
    this.goTo(this.currentIndex + 1);
  }

  goTo(index) {
    if (!this.beats.length) return;
    if (index < 0 || index >= this.beats.length) return;

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

  destroy() {
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

  _renderCurrent() {
    const beat = this.getCurrentBeat();
    if (!beat) return;

    clearChildren(this.container);
    beat.onEnter?.({ index: this.currentIndex, beat });

    this.renderBeat(beat, {
      index: this.currentIndex,
      next: () => this.next(),
      goTo: (index) => this.goTo(index),
      setBeats: (beats, options) => this.setBeats(beats, options),
      getCurrentBeat: () => this.getCurrentBeat()
    });
  }
}
