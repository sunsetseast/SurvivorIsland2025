import test from 'node:test';
import assert from 'node:assert/strict';
import TribalBeatRunner from '../src/modules/screens/TribalBeatRunner.js';

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

function container() {
  return {
    children: [],
    get firstChild() { return this.children[0]; },
    appendChild(child) { this.children.push(child); },
    removeChild(child) { this.children.splice(this.children.indexOf(child), 1); }
  };
}

test('skip unlock updates the existing parchment without rendering or resetting it', async () => {
  const root = container();
  let renders = 0;
  let unlocks = 0;
  const runner = new TribalBeatRunner({ container: root, beats: [{ id: 'vote', canSkipAfterMs: 22 }],
    renderBeat: () => {
      renders += 1;
      const parchment = { visible: false, selection: 'a' };
      root.appendChild(parchment);
      setTimeout(() => { parchment.visible = true; }, 8);
      return () => { unlocks += 1; };
    } });
  runner.start();
  const original = root.firstChild;
  assert.equal(runner.canAdvance(), false);
  await delay(40);
  assert.equal(runner.canAdvance(), true);
  assert.equal(renders, 1);
  assert.equal(unlocks, 1);
  assert.equal(root.firstChild, original);
  assert.equal(original.visible, true);
  assert.equal(original.selection, 'a');
  runner.destroy();
});

test('old unlock and auto-advance timers cannot act after a beat change or teardown', async () => {
  const root = container();
  let unlocks = 0;
  let entered = 0;
  const runner = new TribalBeatRunner({ container: root,
    beats: [{ id: 'old', canSkipAfterMs: 25, pauseMs: 35, autoAdvance: true }, { id: 'new' }],
    renderBeat: () => { entered += 1; root.appendChild({}); return () => { unlocks += 1; }; } });
  runner.start();
  runner.goTo(1, { force: true });
  await delay(45);
  assert.equal(runner.getCurrentBeat().id, 'new');
  assert.equal(entered, 2);
  assert.equal(unlocks, 0);
  runner.setBeats([{ id: 'teardown', canSkipAfterMs: 25 }]);
  runner.destroy();
  await delay(40);
  assert.equal(unlocks, 0);
  assert.equal(root.children.length, 0);
});

test('passive beats advance after their hold; a decision beat never does', async () => {
  const root = container();
  let renders = 0;
  const runner = new TribalBeatRunner({ container: root,
    beats: [{ id: 'arrival', pauseMs: 28, autoAdvance: true },
      { id: 'choice', pauseMs: 20, autoAdvance: true, requiresDecision: true },
      { id: 'after' }],
    renderBeat: () => { renders++; root.appendChild({}); } });
  runner.start();
  await delay(265);
  assert.equal(runner.getCurrentBeat().id, 'choice');
  assert.equal(renders, 2);
  await delay(265);
  assert.equal(runner.getCurrentBeat().id, 'choice');
  runner.next();
  assert.equal(runner.getCurrentBeat().id, 'after');
  runner.destroy();
});

test('a detached beat control cannot advance its replacement', () => {
  const root = container();
  const controls = [];
  const runner = new TribalBeatRunner({ container: root,
    beats: [{ id: 'old' }, { id: 'new' }, { id: 'later' }],
    renderBeat: (_beat, controller) => { controls.push(controller); root.appendChild({}); } });
  runner.start();
  runner.goTo(1);
  controls[0].next();
  controls[0].goTo(2);
  controls[0].setBeats([{ id: 'wrong' }]);
  assert.equal(runner.getCurrentBeat().id, 'new');
  controls[1].next();
  assert.equal(runner.getCurrentBeat().id, 'later');
  runner.destroy();
});

test('reduced-motion parchment still appears before its action unlocks', async () => {
  const previousWindow = globalThis.window;
  globalThis.window = { matchMedia: () => ({ matches: true }) };
  const root = container();
  let renders = 0;
  const runner = new TribalBeatRunner({ container: root,
    beats: [{ id: 'parchment', parchment: { show: true }, canSkipAfterMs: 700 }],
    renderBeat: () => { renders++; root.appendChild({}); } });
  try {
    runner.start();
    await delay(190);
    assert.equal(runner.canAdvance(), false);
    await delay(170);
    assert.equal(runner.canAdvance(), true);
    assert.equal(renders, 1);
  } finally {
    runner.destroy();
    globalThis.window = previousWindow;
  }
});
