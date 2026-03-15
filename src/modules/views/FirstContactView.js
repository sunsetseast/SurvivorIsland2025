// src/views/FirstContactView.js
//
// Continuous challenge with individual survivor motion, correct spawn per first
// assigned leg, visible sidelines/bleachers, scoreboard, Jeff’s centered bubble
// (shows only during pauses), and a post-challenge Performance Breakdown.
//
// Paste over your existing file. Requires: createElement, clearChildren, gameManager.

import { createElement, clearChildren } from '../utils/DOMUtils.js';
import { gameManager } from '../core/GameManager.js';
import JourneySelectionEvent from '../events/JourneySelectionEvent.js';
import RiskProtectJourneyEvent from '../events/RiskProtectJourneyEvent.js';
import JourneyBeatUI from '../ui/JourneyBeatUI.js';

// ---------- tiny helpers ----------
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const getKey = (tribe) => tribe?.id ?? tribe?.name ?? tribe?.tribeName;

const renderTemplate = (str, ctx = {}) =>
  str
    .replaceAll('{leader}', ctx.leader || '')
    .replaceAll('{trailer}', ctx.trailer || '')
    .replaceAll('{winner}', ctx.winner || '')
    .replaceAll('{winnerA}', ctx.winnerA || '')
    .replaceAll('{winnerB}', ctx.winnerB || '')
    .replaceAll('{loser}', ctx.loser || '')
    .replaceAll('{tribe}', ctx.tribe || '')
    .replaceAll('{name}', ctx.name || '');

const isHexColor = (val) => typeof val === 'string' && /^#([0-9a-fA-F]{6})$/.test(val.trim());
const TRIBE_COLOR_MAP = {
  red: '#FF0000',
  blue: '#0066FF',
  orange: '#FF8C00',
  green: '#228B22',
  purple: '#8A2BE2',
  yellow: '#FFD700',
  gold: '#FFD700',
  pink: '#FF69B4'
};

const getTribeName = (tribe) => tribe?.tribeName || tribe?.name || 'Tribe';
const getTribeColor = (tribe) => {
  const direct = tribe?.color;
  if (isHexColor(direct)) return direct.trim();
  const alt = tribe?.tribeColor;
  if (isHexColor(alt)) return alt.trim();

  const name = getTribeName(tribe).toLowerCase();
  if (TRIBE_COLOR_MAP[name]) return TRIBE_COLOR_MAP[name];

  if (typeof direct === 'string' && TRIBE_COLOR_MAP[direct.toLowerCase()]) return TRIBE_COLOR_MAP[direct.toLowerCase()];
  if (typeof alt === 'string' && TRIBE_COLOR_MAP[alt.toLowerCase()]) return TRIBE_COLOR_MAP[alt.toLowerCase()];

  return '#fff';
};

const tribeSpan = (tribe, textOverride) => {
  const text = textOverride || getTribeName(tribe);
  const color = getTribeColor(tribe);
  return `<span style="color:${color}; font-weight:900; text-shadow: 1px 1px 2px #000;">${text}</span>`;
};

const survivorSpan = (survivor, tribe, isYou = false) => {
  const base = survivor?.firstName || survivor?.name || 'Survivor';
  const text = isYou ? `${base} (You)` : base;
  const color = getTribeColor(tribe);
  return `<span style="color:${color}; font-weight:900; text-shadow: 1px 1px 2px #000;">${text}</span>`;
};

// stable jitter per id (keeps stacks from overlapping)
function jitter(id, spread = 6) {
  const x = Math.sin(id * 999) * 43758.5453;
  return ((x - Math.floor(x)) - 0.5) * 2 * spread;
}

// ---------- tuning ----------
const CFG = {
  base: 0.050,          // base movement per second
  alpha: 0.040,         // trait influence scaling
  speedMult: 1.60,
  tickHz: 30,           // update rate
  errPause: [180, 420], // ms pause on small “error” event
  stagePauseMs: 700,
  leadPauseMs: 1600,
  closePauseMs: 1600,
  finishPauseMs: 900,
  avatar: { size: 48, labelSize: 10 },
  sidelineOffsetX: 14,
  bleachersYPad: 40
};

// course segments
const SEGMENTS = [
  { id:'mud',    name:'MUD CRAWL',      start:0.00, end:0.25, bg:'Assets/Challenge/mud-crawl.png',     weights:{ strength:.30, endurance:.30, dexterity:.20, balance:.20 }, combine:'min' },
  { id:'knots',  name:'UNTIE KNOTS',    start:0.25, end:0.50, bg:'Assets/Challenge/untie-knots.png',   weights:{ dexterity:.45, puzzles:.25, focus:.20, endurance:.10 },   combine:'mean' },
  { id:'toss',   name:'BEAN-BAG TOSS',  start:0.50, end:0.75, bg:'Assets/Challenge/bean-bag-toss.png', weights:{ dexterity:.50, focus:.30, strength:.20 },                 combine:'weighted' },
  { id:'puzzle', name:'VERTICAL PUZZLE',start:0.75, end:1.00, bg:'Assets/Challenge/vertical-puzzle.png',weights:{ puzzles:.50, memory:.30, focus:.20 },                      combine:'max' }
];

// ---------- Jeff bubble (docked near scoreboard; shows only during pauses) ----------
class JeffBubble {
  constructor(root) {
    this.root = root;
    this.mode = 'topBelowScoreboard';
    this.scoreboardEl = null;
    this.wrap = createElement('div', { style:`
      position:absolute; left:50%; transform:translate(-50%, 0);
      display:none; z-index:4000; pointer-events:none;
      transition: top 280ms ease, bottom 280ms ease, transform 280ms ease, opacity 180ms ease;
    `});
    const panel = createElement('div', { style:`
      display:flex; gap:12px; align-items:center; max-width:min(85vw,720px);
      background:rgba(0,0,0,.75); color:#fff; border-radius:14px; padding:14px 18px;
      box-shadow:0 8px 24px rgba(0,0,0,.55); text-shadow:1px 1px 2px #000;
      font-family:'Survivant',sans-serif; font-weight:bold; line-height:1.25; font-size:1.05rem;
      pointer-events:auto;
    `});
    const img = createElement('img', { src:'Assets/jeff-screen.png', style:`
      width:64px; height:64px; border-radius:50%; object-fit:cover; object-position:center 30%; border:2px solid #fff;
    `});
    this.textEl = createElement('div', {});
    panel.append(img, this.textEl);
    this.wrap.appendChild(panel);
    root.appendChild(this.wrap);

    panel.addEventListener('click', () => {
      this.hide();
      if (this.onResume) this.onResume();
    });
  }
  setDock(mode = 'topBelowScoreboard', scoreboardEl = this.scoreboardEl) {
    this.mode = mode;
    this.scoreboardEl = scoreboardEl;
    if (!this.scoreboardEl) return;

    const wasHidden = this.wrap.style.display === 'none';
    const containerRect = this.root.getBoundingClientRect();
    const prevTop = (!wasHidden && this.wrap.offsetParent) ? (this.wrap.getBoundingClientRect().top - containerRect.top) : null;

    const sb = this.scoreboardEl;
    this.wrap.style.top = 'auto';
    this.wrap.style.bottom = 'auto';

    if (mode === 'topBelowScoreboard') {
      const top = sb.offsetTop + sb.offsetHeight + 8;
      this.wrap.style.top = `${top}px`;
    } else {
      const bottom = sb.offsetHeight + 16;
      this.wrap.style.bottom = `${bottom}px`;
    }

    if (prevTop != null) {
      const newTop = this.wrap.getBoundingClientRect().top - containerRect.top;
      const delta = prevTop - newTop;
      this.wrap.style.transform = `translate(-50%, ${delta}px)`;
      this.wrap.getBoundingClientRect();
      this.wrap.style.transform = 'translate(-50%, 0)';
    } else {
      this.wrap.style.transform = 'translate(-50%, 0)';
    }
  }
  show(text) { this.textEl.innerHTML = text; this.wrap.style.display = 'block'; this.setDock(this.mode); }
  hide() { this.wrap.style.display = 'none'; }
}

const FirstContactView = {
  render(container) {
    this.container = container;
    this._destroyed = false;
    clearChildren(container);
    container.style.position = 'absolute';
    container.style.inset = '0';
    container.style.width = '100%';
    container.style.height = '100%';
    container.style.margin = '0';
    container.style.padding = '0';
    container.style.backgroundColor = '#000';
    container.style.backgroundImage = '';
    container.style.overflow = 'hidden';

    const root = createElement('div', {
      id: 'first-contact-root',
      style: 'position:relative; width:100%; height:100%; overflow:hidden;'
    });
    container.appendChild(root);
    this._rootEl = root;

    // data
    this.tribes = gameManager.getTribes();
    this.playerTribe = gameManager.getPlayerTribe();
    this.isThree = this.tribes.length === 3;

    // layout
    this._buildBands();
    this._buildLanes();
    this._buildScoreboard();
    this._buildSkipButton();
    this.jeff = new JeffBubble(root);
    this.jeff.setDock('topBelowScoreboard', this.scoreboardEl);

    this._onResize = () => {
      if (this.jeff) this.jeff.setDock(this.jeff.mode, this.scoreboardEl);
    };
    window.addEventListener('resize', this._onResize);
    window.addEventListener('orientationchange', this._onResize);

    // assignments + spawn
    this._assignParticipants();
    this._spawnAvatars();

    // race state
    this.state = {
      lastTick: performance.now(),
      pausedUntil: 0,
      finishedOrder: [],
      progressByTribe: {},
      lastSegIdx: {},
      stageScores: SEGMENTS.reduce((m,s)=> (m[s.id]={}, m), {}),
      globalLastAnnouncedSegIdx: -1,
      lastLeadKey: null,
      lastNarrationAt: 0,
      narrationCooldownMs: 2200,
      events: [],
      lastLineGlobal: null,
      lastLineByCategory: {},
      pendingLead: null,
      neckAndNeckSegs: {},
      segmentCallouts: {},
      lastSurvivorCalloutId: null,
      lastMomentumGap: null,
      puzzleUnified: false,
      puzzleAllInFired: false,
      finishSoonCalled: false,
      challengeThreatApplied: false
    };
    this._completionHandled = false;
    this._stopTicking = false;
    this._skipInProgress = false;
    this._isSkipping = false;
    this.tribes.forEach(t => {
      const k = getKey(t);
      this.state.progressByTribe[k] = 0;
      this.state.lastSegIdx[k] = -1;
    });

    // lines
    this.lines = {
      start: [
        "Survivors ready?! This is for reward and immunity—GO!",
        "This challenge sets the tone—immunity is on the line—GO!",
        "First challenge of the game—everybody wants momentum—GO!",
        "Immunity up for grabs—let’s find out who came to play—GO!"
      ],

      enter: {
        mud: [
          "{leader} hits the mud first—dig deep!",
          "{leader} out in front—straight into the mud!",
          "{leader} first to the mud crawl—this is where it gets ugly!",
          "{leader} takes the early advantage—mud crawl underway!"
        ],
        knots: [
          "{leader} first to the knots—this is all about focus!",
          "{leader} now at the knots—don’t rush it!",
          "{leader} hits the knots station—precision matters here!",
          "{leader} in the lead—and now it’s knots!"
        ],
        toss: [
          "{leader} first to the toss—this can swing fast!",
          "{leader} at the toss—one mistake and you’re chasing!",
          "{leader} leads into the toss—this is a pressure moment!",
          "{leader} first to the toss—here we go!"
        ],
        puzzle: [
          "{leader} first to the puzzle—this is where you can win it!",
          "{leader} hits the puzzle first—this is the finish line!",
          "{leader} to the puzzle—can they close it out?",
          "{leader} leads them to the puzzle—now it’s brains and nerves!"
        ]
      },

      leadChange: [
        "{leader} takes the lead!",
        "{leader} surges in front—{trailer} now chasing!",
        "{leader} jumps ahead—momentum shift!",
        "{leader} out in front now—big swing!",
        "{leader} takes over—{trailer} has to respond!",
        "{leader} seizes the advantage—{trailer} falling behind!"
      ],

      neckAndNeck: [
        "Neck and neck—this is tight!",
        "Nobody giving an inch—this is dead even!",
        "This is close—every second matters!",
        "Toe to toe—one clean moment could decide it!",
        "This is a straight-up race—no separation!"
      ],

      widening: [
        "{leader} is opening it up—{trailer} running out of time!",
        "{leader} starting to pull away!",
        "{leader} creating distance—{trailer} has to find another gear!",
        "{leader} stretching the lead—{trailer} in trouble!",
        "{leader} pulling ahead in a big way!"
      ],

      struggleTribe: [
        "{trailer} is losing time right here!",
        "{trailer} struggling—this is where they’re bleeding seconds!",
        "{trailer} can’t afford this—immunity is slipping away!",
        "{trailer} has to clean this up fast!",
        "{trailer} stuck—this is costly!"
      ],

      carry: [
        "{name} is a machine for {tribe} right now!",
        "{tribe} getting a huge push from {name}!",
        "{name} is flying—{tribe} loves what they’re getting!",
        "{name} is bringing it—big effort for {tribe}!",
        "That’s the pace you want—{name} powering {tribe}!"
      ],

      drag: [
        "{name} struggling for {tribe}—they’re losing ground!",
        "{tribe} needs more out of {name} right now!",
        "{name} looks rattled—{tribe} paying for it!",
        "{name} cannot find the rhythm—{tribe} falling behind!",
        "{tribe} is getting slowed down by {name}!"
      ],

      comeback: [
        "{trailer} is closing the gap!",
        "{trailer} making a move—this is getting interesting!",
        "{trailer} creeping back in—don’t count them out!",
        "{trailer} clawing their way back into it!",
        "{trailer} responding—this race isn’t over!"
      ],

      puzzleAllIn: [
        "All tribes on the puzzle—this is where it’s decided!",
        "Everybody at the puzzle—now it’s pure execution!",
        "This is it—all on the puzzle—who wants it more?",
        "No more running—all puzzle—immunity is right here!"
      ],

      finishSoon: [
        "{leader} on the verge—can they finish?",
        "{leader} is right there—don’t blow it now!",
        "{leader} is one step away!",
        "{leader} can taste it—finish this!",
        "{leader} so close—close it out!"
      ],

      winOne: [
        "{winner} wins immunity!",
        "{winner} takes it—immunity is theirs!",
        "{winner} wins! {loser} will head back to camp without immunity!",
        "{winner} gets it done—immunity for {winner}!"
      ],

      winTwo: [
        "{winnerA} and {winnerB} win immunity!",
        "{winnerA} and {winnerB} are safe tonight!",
        "{winnerA} and {winnerB} pull it off—immunity for both tribes!"
      ]
    };

    // GO
    this._speakLine('start', this.lines.start, {}, CFG.stagePauseMs);
    this._setRunningForCurrentStage();
    this._tick();
  },

  _buildSkipButton() {
    if (!this._rootEl) return;
    if (this._skipButton) {
      this._skipButton.remove();
    }
    this._skipButton = createElement('button', {
      style: `
        position: absolute;
        right: 16px;
        bottom: 16px;
        z-index: 5000;
        padding: 6px 12px;
        border-radius: 8px;
        border: 1px solid rgba(255,255,255,0.7);
        background: rgba(0,0,0,0.55);
        color: #fff;
        font-family: 'Survivant', sans-serif;
        font-size: 0.85rem;
        font-weight: bold;
        letter-spacing: 0.5px;
        cursor: pointer;
        text-transform: uppercase;
      `,
      onclick: () => this._skipChallenge()
    }, 'Skip');
    this._rootEl.appendChild(this._skipButton);
  },

  _removeSkipButton() {
    if (this._skipButton) {
      this._skipButton.remove();
      this._skipButton = null;
    }
  },

  _skipChallenge() {
    if (this._skipInProgress || this._completionHandled) return;
    this._skipInProgress = true;
    this._stopTicking = true;
    this._isSkipping = true;
    this.state.pausedUntil = 0;
    if (this.jeff) this.jeff.hide();
    if (this._resultsTimeout) {
      clearTimeout(this._resultsTimeout);
      this._resultsTimeout = null;
    }
    if (this._skipButton) {
      this._skipButton.disabled = true;
      this._skipButton.style.cursor = 'default';
      this._skipButton.style.opacity = '0.6';
    }

    const stepMs = 1000 / CFG.tickHz;
    let now = performance.now();
    let safety = 0;
    while (!this._completionHandled && safety < 20000) {
      const dt = stepMs / 1000;
      now += stepMs;
      const done = this._advanceSimulation(now, dt, { immediateResults: true });
      if (done) break;
      safety += 1;
    }

    this._isSkipping = false;
    this._skipInProgress = false;
  },

  _handleSurvivorCallouts(now, cooldownPassed) {
    if (!cooldownPassed) return;

    const playerId = gameManager.getPlayerSurvivor()?.id;

    for (const tribe of this.tribes) {
      const key = getKey(tribe);
      const progress = this.state.progressByTribe[key] || 0;
      const segIdx = this._segmentIndexFromProgress(progress);
      if (segIdx < 0) continue;

      const parts = (this.participants[key]?.[segIdx] || [])
        .map(p => this.memberMap[key].find(ms => ms.survivor.id === p.id))
        .filter(Boolean);
      const running = parts.filter(ms => ms.status === 'running' && ms.runningIdx === segIdx && typeof ms._lastSpeed === 'number');
      if (!running.length) continue;

      const avg = running.reduce((sum, ms) => sum + ms._lastSpeed, 0) / running.length;
      if (avg <= 0) continue;

      if (!this.state.segmentCallouts[segIdx]) this.state.segmentCallouts[segIdx] = { carry: 0, drag: 0 };

      const best = running.reduce((m, ms) => (ms._lastSpeed > m._lastSpeed ? ms : m), running[0]);
      const worst = running.reduce((m, ms) => (ms._lastSpeed < m._lastSpeed ? ms : m), running[0]);

      const tribeDisplay = tribeSpan(tribe);
      const bestDisplay = best ? survivorSpan(best.survivor, tribe, best?.survivor?.id === playerId) : survivorSpan(null, tribe);
      const worstDisplay = worst ? survivorSpan(worst.survivor, tribe, worst?.survivor?.id === playerId) : survivorSpan(null, tribe);

      if (
        best &&
        best._lastSpeed > avg * 1.2 &&
        this.state.segmentCallouts[segIdx].carry < 1 &&
        best.survivor.id !== this.state.lastSurvivorCalloutId
      ) {
        this.state.segmentCallouts[segIdx].carry += 1;
        this.state.lastSurvivorCalloutId = best.survivor.id;
        this._speakLine('carry', this.lines.carry, { name: bestDisplay, tribe: tribeDisplay }, 0);
        return;
      }

      if (
        worst &&
        worst._lastSpeed < avg * 0.8 &&
        this.state.segmentCallouts[segIdx].drag < 1 &&
        worst.survivor.id !== this.state.lastSurvivorCalloutId
      ) {
        this.state.segmentCallouts[segIdx].drag += 1;
        this.state.lastSurvivorCalloutId = worst.survivor.id;
        this._speakLine('drag', this.lines.drag, { name: worstDisplay, tribe: tribeDisplay }, 0);
        return;
      }
    }
  },

  // ---------- layout ----------
  _buildBands() {
    const bands = createElement('div', { style:`position:absolute; inset:0; z-index:1;` });
    this._rootEl.appendChild(bands);
    this.bandsRoot = bands;
    this.bandRects = [];
    this.bandEls = [];
    SEGMENTS.forEach(seg => {
      const topPct = (1 - seg.end) * 100;
      const heightPct = (seg.end - seg.start) * 100;
      const el = createElement('div', { style:`
        position:absolute; left:0; top:${topPct}% ; width:100%; height:${heightPct}%;
        background:url('${seg.bg}') center/cover no-repeat; opacity:.95;
        border-top:1px solid rgba(255,255,255,.25);
      `});
      const label = createElement('div', { style:`
        position:absolute; left:10px; top:${topPct+2}% ; color:#fff; font-family:'Survivant',sans-serif;
        font-weight:bold; text-shadow:1px 1px 2px #000; font-size:1.0rem;
        background:rgba(0,0,0,.35); padding:2px 6px; border-radius:6px; z-index:2;
      `}, seg.name);
      bands.append(el, label);
      this.bandEls.push(el, label);
      this.bandRects.push({ topPct, heightPct });
    });
  },

  _buildLanes() {
    const lanes = createElement('div', { style:`position:absolute; inset:0; z-index:2;` });
    this._rootEl.appendChild(lanes);
    const W = this._rootEl.clientWidth || 800;
    const laneW = Math.floor(W / this.tribes.length);
    this.lanes = [];
    this.sidelines = {};      // [tribeKey][segIdx] -> {x,y,count}
    this.bleachersY = (this._rootEl.clientHeight||600) * (1 - SEGMENTS[3].end) + CFG.bleachersYPad;
    this.bleachersSlots = {}; // [tribeKey] -> counter
    this.finishedSlots = {};  // [tribeKey] -> counter

    this.tribes.forEach((tribe, i) => {
      const lane = createElement('div', { style:`
        position:absolute; top:0; bottom:0; left:${i*laneW}px; width:${laneW}px;
        border-right:${i<this.tribes.length-1 ? '2px solid rgba(255,255,255,.25)' : 'none'};
      `});
      lanes.appendChild(lane);
      this.lanes.push(lane);

      const key = getKey(tribe);
      this.sidelines[key] = {};
      SEGMENTS.forEach((s, idx) => {
        const yPct = (1 - s.start) * 100;
        const y = (this._rootEl.clientHeight||600) * (yPct/100) - 60;
        const x = (i*laneW) + CFG.sidelineOffsetX;
        this.sidelines[key][idx] = { x, y, count: 0 };
      });
      this.bleachersSlots[key] = 0;
    });
  },

  _buildScoreboard() {
    const root = createElement('div', { style:`
      position:absolute; left:50%; transform:translateX(-50%);
      top:8px; z-index:3000; width:min(92%,760px);
      background:rgba(0,0,0,.55); color:#fff; border-radius:10px;
      padding:8px 10px; box-shadow:0 4px 12px rgba(0,0,0,.4);
      font-family:'Survivant',sans-serif; font-weight:bold;
    `});
    const orderEl = createElement('div', { style:`display:flex; justify-content:center; gap:14px; font-size:.95rem; text-shadow:1px 1px 2px #000; flex-wrap:wrap;` });
    const rowsEl  = createElement('div', { style:`display:flex; justify-content:center; gap:14px; margin-top:6px; flex-wrap:wrap;` });
    root.append(orderEl, rowsEl);
    this._rootEl.appendChild(root);
    this.scoreboardEl = root;
    this.scoreboardDock = 'top';

    this._stageDots = {};   // [tribeKey][segIdx] -> dot
    this._statusBadge = {}; // [tribeKey] -> span

    this.tribes.forEach(t => {
      const key = getKey(t);
      const wrap = createElement('div', { style:`display:flex; align-items:center; gap:10px; min-width:170px;` });
      const name = t.tribeName || t.name || `Tribe ${t.id}`;
      const textCol = createElement('div', { style:`display:flex; flex-direction:column; gap:2px;` });
      const label = createElement('span', { style:`color:${t.color || t.tribeColor || '#fff'}; text-shadow:1px 1px 2px #000;` }, name);
      const badge = createElement('span', { style:`padding:2px 6px; border-radius:6px; background:rgba(0,0,0,.4); color:#fff; font-size:.75rem; align-self:flex-start;` }, 'WAITING: MUD');
      this._statusBadge[key] = badge;
      textCol.append(label, badge);
      wrap.append(textCol);
      this._stageDots[key] = {};
      for (let i=0;i<4;i++){
        const dot = createElement('div', { style:`width:12px; height:12px; border-radius:50%; background:#555; border:2px solid ${t.color || t.tribeColor || '#fff'};` });
        wrap.appendChild(dot);
        this._stageDots[key][i] = dot;
      }
      rowsEl.appendChild(wrap);
    });

    this._updateScoreboard = () => {
      const order = Object.entries(this.state.progressByTribe).sort(([,a],[,b])=>b-a).map(([k])=>k);
      const leader = order[0];
      const leaderPct = this.state.progressByTribe[leader] || 0;
      orderEl.innerHTML = '';
      order.forEach((k,idx) => {
        const tribe = this.tribes.find(t => getKey(t)===k);
        const name = tribe?.tribeName || tribe?.name || `Tribe ${tribe?.id}`;
        const gap = (leaderPct - (this.state.progressByTribe[k]||0))*100;
        const text = idx===0 ? `1) ${name}` : `${idx+1}) ${name}  ${gap>0?`+${gap.toFixed(1)}%`:''}`;
        orderEl.appendChild(createElement('span', { style:`color:${tribe?.color || tribe?.tribeColor || '#fff'};` }, text));

        const progress = this.state.progressByTribe[k] || 0;
        const segIdx = this._segmentIndexFromProgress(progress);
        const labels = ['MUD','KNOTS','TOSS','PUZZLE'];
        const seg = segIdx >= 0 ? SEGMENTS[segIdx] : null;
        const epsilon = 0.0001;
        let statusText = 'FINISHED';
        if (progress < 1 && seg) {
          const running = progress > (seg.start + epsilon) && progress < (seg.end - epsilon);
          statusText = `${running ? 'RUNNING' : 'WAITING'}: ${labels[segIdx]}`;
        }
        this._statusBadge[k].textContent = statusText;
      });
    };
  },

  _maybeDockHudForLaterLegs() {
    const allPastKnots = this.tribes.every(t => (this.state.progressByTribe[getKey(t)] || 0) >= SEGMENTS[1].end);

    if (!allPastKnots) {
      if (this.scoreboardDock !== 'top') {
        this.scoreboardDock = 'top';
        if (this.scoreboardEl) {
          this.scoreboardEl.style.bottom = 'auto';
          this.scoreboardEl.style.top = '8px';
        }
      }
      if (this.jeff) this.jeff.setDock('topBelowScoreboard', this.scoreboardEl);
      return;
    }

    if (this.scoreboardDock !== 'bottom') {
      this.scoreboardDock = 'bottom';
      if (this.scoreboardEl) {
        this.scoreboardEl.style.top = 'auto';
        this.scoreboardEl.style.bottom = '8px';
      }
    }
    if (this.jeff) this.jeff.setDock('aboveBottomScoreboard', this.scoreboardEl);
  },

  // ---------- assignments & spawn ----------
  _assignParticipants() {
    this.participants = {}; // [tribeKey][segIdx] = survivors[]
    this.memberMap = {};    // [tribeKey] = survivorStates[]

    SEGMENTS.forEach((seg, idx) => {
      this.tribes.forEach(tribe => {
        const key = getKey(tribe);
        if (!this.participants[key]) this.participants[key] = {};
        // use roles if present; else auto-pick best two by leg score
        let parts = tribe.members.filter(s => s.roles?.includes(seg.id));
        if (!parts.length) {
          parts = [...tribe.members].sort((a,b)=> this._legScore(b, seg) - this._legScore(a, seg)).slice(0,2);
        }
        this.participants[key][idx] = parts;
      });
    });

    // build per-member state
    this.tribes.forEach(tribe => {
      const key = getKey(tribe);
      this.memberMap[key] = tribe.members.map(m => {
        // find first assigned leg (-1 if none)
        let firstIdx = -1;
        for (let i=0;i<SEGMENTS.length;i++){
          if (this.participants[key][i]?.some(s => s.id === m.id)) { firstIdx = i; break; }
        }
        return {
          survivor: m,
          tribe,
          firstIdx,
          runningIdx: -1,
          status: firstIdx===-1 ? 'bleachers' : 'waiting',
          perLeg: { 0:0, 1:0, 2:0, 3:0 },
          fatigueLegs: 0,
          legLuck: {},
          avatar: null,
          label: null
        };
      });
    });
  },

  _spawnAvatars() {
    const size = CFG.avatar.size;
    this.memberMap && Object.values(this.memberMap).forEach(list => {
      list.forEach(ms => {
        const img = createElement('img', {
          src: ms.survivor.avatarUrl || `Assets/Avatars/${(ms.survivor.firstName||'').toLowerCase()}.jpeg`,
          style:`position:absolute; width:${size}px; height:${size}px; border-radius:50%; object-fit:cover;
                 border:3px solid ${ms.tribe.color || ms.tribe.tribeColor || '#fff'}; z-index:10;`
        });
        const label = createElement('div', {
          style:`position:absolute; font-family:'Survivant',sans-serif; font-size:${CFG.avatar.labelSize}px;
                 color:${ms.tribe.color || ms.tribe.tribeColor || '#fff'}; text-shadow:1px 1px 2px #000; z-index:11;`
        }, (ms.survivor.firstName || '').split(' ')[0]);
        this._rootEl.append(img,label);
        ms.avatar = img; ms.label = label;

        if (ms.status === 'bleachers') {
          this._placeInBleachers(ms);
        } else {
          this._placeInSideline(ms, ms.firstIdx);
        }
      });
    });
  },

  _laneX(tribe) {
    const W = this._rootEl.clientWidth || 800;
    const laneW = Math.floor(W / this.tribes.length);
    const idx = this.tribes.findIndex(t => getKey(t)===getKey(tribe));
    return idx*laneW;
  },

  _segmentRect(segIdx) {
    const H = this._rootEl.clientHeight || 600;
    const r = this.bandRects[segIdx];
    const top = (r.topPct/100) * H;
    const height = (r.heightPct/100) * H;
    return { top, height };
  },

  _segmentIndexFromProgress(progress) {
    return SEGMENTS.findIndex(s => progress < s.end);
  },

  _placeInSideline(ms, segIdx) {
    const key = getKey(ms.tribe);
    const slot = this.sidelines[key][segIdx];
    const x = slot.x + (slot.count* (CFG.avatar.size+4) % 90) + jitter(ms.survivor.id, 4);
    const y = slot.y - Math.floor(slot.count/4)*(CFG.avatar.size+6) + jitter(ms.survivor.id+7, 4);
    slot.count++;
    ms.avatar.style.left = `${x}px`;
    ms.avatar.style.top = `${y}px`;
    ms.label.style.left = `${x}px`;
    ms.label.style.top = `${y + CFG.avatar.size + 2}px`;
  },

  _placeInBleachers(ms) {
    const key = getKey(ms.tribe);
    const laneX = this._laneX(ms.tribe);
    const x = laneX + 14 + (this.bleachersSlots[key]%5)*(CFG.avatar.size+6) + jitter(ms.survivor.id,4);
    const y = this.bleachersY - Math.floor(this.bleachersSlots[key]/5)*(CFG.avatar.size+10) + jitter(ms.survivor.id+3,4);
    this.bleachersSlots[key]++;
    ms.avatar.style.left = `${x}px`;
    ms.avatar.style.top = `${y}px`;
    ms.label.style.left = `${x}px`;
    ms.label.style.top = `${y + CFG.avatar.size + 2}px`;
  },

  _placeFinished(ms) {
    const tribeIdx = this.tribes.findIndex(t => getKey(t) === getKey(ms.tribe));
    const key = getKey(ms.tribe);
    if (this.finishedSlots[key] == null) this.finishedSlots[key] = 0;

    const slot = this.finishedSlots[key]++;
    const W = this._rootEl.clientWidth || 800;
    const H = this._rootEl.clientHeight || 600;
    const pad = 8;

    const setPos = (x, y) => {
      ms.avatar.style.left = `${x}px`;
      ms.avatar.style.top = `${y}px`;
      ms.label.style.left = `${x}px`;
      ms.label.style.top = `${y + CFG.avatar.size + 2}px`;
    };

    if (!this.isThree) {
      const x = tribeIdx === 0 ? pad : (W - CFG.avatar.size - pad);
      const y = 60 + slot * (CFG.avatar.size + 10);
      setPos(x, y);
      return;
    }

    if (tribeIdx === 0 || tribeIdx === 2) {
      const x = tribeIdx === 0 ? pad : (W - CFG.avatar.size - pad);
      const y = 60 + slot * (CFG.avatar.size + 10);
      setPos(x, y);
      return;
    }

    const scoreboardBottomY = H - 8;
    const y = scoreboardBottomY - 90;
    const xStart = Math.floor(W * 0.25);
    const x = xStart + slot * (CFG.avatar.size + 8);
    setPos(x, y);
  },

  // ---------- sim math ----------
  _traitBlend(survivor, weights) {
    let sum = 0;
    for (const [k,w] of Object.entries(weights)) sum += (survivor[k]||0) * w;
    return sum / (1 + 0.06*sum); // diminishing returns
  },
  _readiness(s) {
    const water=(s.water ?? 100)/100, hunger=(s.hunger ?? 100)/100, rest=(s.rest ?? 100)/100;
    return 0.4*water + 0.3*hunger + 0.3*rest;
  },
  _stamina(s) {
    const end=(s.endurance||0)/10, fort=(s.fortitude||0)/10;
    return 0.7*end + 0.3*fort;
  },
  _fatigue(ms) {
    const S = this._stamina(ms.survivor);
    const legs = ms.fatigueLegs || 0;
    return 1 - 0.08 * legs * (1 - S);
  },
  _pressureFactor(segId, s) {
    if (segId==='toss' || segId==='puzzle') {
      const f = ((s.focus||0) + (s.fortitude||0)) / 20;
      return 1 + 0.06*(f - 0.5);
    }
    return 1;
  },
  _errChance(s) {
    const d=(s.dexterity||0), a=(s.awareness||0), f=(s.focus||0);
    const q=(d+a+f)/3;
    return Math.max(0, 0.04 - 0.002*q); // ~0..4%
  },
  _legScore(s, seg) {
    return this._traitBlend(s, seg.weights) * (0.7 + 0.3*this._readiness(s));
  },
  _speed(ms, seg) {
    const s = ms.survivor;
    const T = this._traitBlend(s, seg.weights);
    const R = this._readiness(s);
    const F = this._fatigue(ms);
    const C = this._pressureFactor(seg.id, s);
    if (ms.legLuck[seg.id] == null) ms.legLuck[seg.id] = lerp(0.97, 1.03, Math.random());
    const L = ms.legLuck[seg.id] * lerp(0.985, 1.015, Math.random());
    return (CFG.base * (1 + CFG.alpha*T)) * R * F * C * L * CFG.speedMult;
  },

  // ---------- race control ----------
  _setRunningForCurrentStage() {
    this.tribes.forEach(tribe => {
      const key = getKey(tribe);
      const overall = this.state.progressByTribe[key];
      const segIdx = SEGMENTS.findIndex(s => overall < s.end);
      if (segIdx < 0) return;

      const parts = this.participants[key][segIdx] || [];
      const list = this.memberMap[key];

      list.forEach(ms => {
        if (parts.some(p => p.id===ms.survivor.id)) {
          if (ms.runningIdx !== segIdx) {
            ms.runningIdx = segIdx;
            ms.status = 'running';
            ms.fatigueLegs += (ms.runningIdx> -1 ? 1 : 0);
          }
        }
      });

      if (this.state.lastSegIdx[key] !== segIdx) {
        this.state.lastSegIdx[key] = segIdx;
        const dot = this._stageDots[key]?.[segIdx];
        if (dot) dot.style.background = '#0f0';
      }
    });
  },

  _combineProgress(key, segIdx) {
    const seg = SEGMENTS[segIdx];
    const parts = (this.participants[key][segIdx]||[]).map(p => this.memberMap[key].find(ms=>ms.survivor.id===p.id));
    if (!parts.length) return 0;
    const vals = parts.map(ms => ms.perLeg[segIdx] || 0);

    if (seg.combine==='min') return Math.min(...vals);
    if (seg.combine==='mean') return vals.reduce((a,b)=>a+b,0)/vals.length;
    if (seg.combine==='weighted') {
      let wsum=0, ssum=0;
      parts.forEach(ms=>{
        const w = (ms.survivor.focus||0) + (ms.survivor.dexterity||0) + 1;
        wsum += w; ssum += (ms.perLeg[segIdx]||0) * w;
      });
      return ssum / wsum;
    }
    if (seg.combine==='max') {
      const max = Math.max(...vals);
      const spread = (Math.max(...vals) - Math.min(...vals));
      return clamp(max - 0.15*spread, 0, 1);
    }
    return vals.reduce((a,b)=>a+b,0)/vals.length;
  },

  _announce(text, pauseMs) {
    if (this._isSkipping) {
      this.state.pausedUntil = 0;
      return;
    }
    this.jeff.show(text);
    const now = performance.now();
    const pause = pauseMs ?? CFG.stagePauseMs;
    this.state.pausedUntil = pause > 0 ? now + pause : now;
    this.jeff.onResume = () => { this.state.pausedUntil = 0; this.jeff.hide(); };
  },

  _maybeUnifyPuzzle(now) {
    if (this.state.puzzleUnified) return;
    const puzzleStart = SEGMENTS[3].start;
    const allAtPuzzle = this.tribes.every(t => (this.state.progressByTribe[getKey(t)] || 0) >= puzzleStart);
    if (!allAtPuzzle) return;

    this.state.puzzleUnified = true;
    if (this.bandsRoot) this.bandsRoot.style.display = 'none';
    if (this.bandEls) this.bandEls.forEach(el => el.style.display = 'none');
    this._rootEl.style.backgroundImage = `url('${SEGMENTS[3].bg}')`;
    this._rootEl.style.backgroundSize = 'cover';

    if (!this.state.puzzleAllInFired && (now - this.state.lastNarrationAt >= this.state.narrationCooldownMs)) {
      this.state.puzzleAllInFired = true;
      this._speakLine('puzzleAllIn', this.lines.puzzleAllIn, {}, CFG.stagePauseMs);
    }
  },

  _pickLine(categoryKey, lines, context = {}) {
    if (!lines || !lines.length) return null;
    const lastIdx = this.state.lastLineByCategory[categoryKey];
    const lastGlobal = this.state.lastLineGlobal;
    let idx = Math.floor(Math.random() * lines.length);
    let attempts = 0;

    const chooseRendered = (i) => renderTemplate(lines[i], context);

    while (attempts < lines.length * 2) {
      const rendered = chooseRendered(idx);
      if (idx !== lastIdx && rendered !== lastGlobal) {
        this.state.lastLineByCategory[categoryKey] = idx;
        this.state.lastLineGlobal = rendered;
        return rendered;
      }
      idx = (idx + 1) % lines.length;
      attempts++;
    }

    const rendered = chooseRendered(idx);
    this.state.lastLineByCategory[categoryKey] = idx;
    this.state.lastLineGlobal = rendered;
    return rendered;
  },

  _speakLine(categoryKey, lines, context = {}, pauseMs) {
    const text = this._pickLine(categoryKey, lines, context);
    if (!text) return;
    this.state.lastNarrationAt = performance.now();
    this._announce(text, pauseMs);
  },

  _handleNarration() {
    if (this._isSkipping) return;
    const entries = Object.entries(this.state.progressByTribe);
    if (!entries.length) return;

    const sorted = [...entries].sort(([,a],[,b]) => b - a);
    const leaderKey = sorted[0][0];
    const leaderProgress = sorted[0][1];
    const leaderSegIdx = this._segmentIndexFromProgress(leaderProgress);
    const secondProgress = sorted[1]?.[1];
    const gap = secondProgress == null ? 1 : Math.abs(leaderProgress - secondProgress);
    const now = performance.now();
    const leaderTribe = this.tribes.find(t => getKey(t) === leaderKey);
    const trailerKey = sorted[1]?.[0];
    const trailerTribe = trailerKey ? this.tribes.find(t => getKey(t) === trailerKey) : null;
    const leaderName = tribeSpan(leaderTribe);
    const trailerName = trailerTribe ? tribeSpan(trailerTribe) : tribeSpan(null);
    const cooldownPassed = now - this.state.lastNarrationAt >= this.state.narrationCooldownMs;

    // segment entry beat (leader reaching new segment)
    if (leaderSegIdx > this.state.globalLastAnnouncedSegIdx && leaderSegIdx >= 0) {
      this.state.globalLastAnnouncedSegIdx = leaderSegIdx;
      this._speakLine(`enter-${SEGMENTS[leaderSegIdx].id}`, this.lines.enter[SEGMENTS[leaderSegIdx].id], { leader: leaderName }, CFG.stagePauseMs);
      return;
    }

    // debounce lead changes
    if (!this.state.pendingLead || this.state.pendingLead.leaderKey !== leaderKey) {
      this.state.pendingLead = { leaderKey, since: now };
    }

    if (this.state.pendingLead && this.state.pendingLead.leaderKey === leaderKey && gap >= 0.02 && (now - this.state.pendingLead.since) >= 2000 && cooldownPassed && this.state.lastLeadKey !== leaderKey) {
      this.state.lastLeadKey = leaderKey;
      this._speakLine('leadChange', this.lines.leadChange, { leader: leaderName, trailer: trailerName }, CFG.leadPauseMs);
      return;
    }

    // neck and neck once per segment
    if (secondProgress != null && gap < 0.02 && cooldownPassed && leaderSegIdx >= 0 && !this.state.neckAndNeckSegs[leaderSegIdx]) {
      this.state.neckAndNeckSegs[leaderSegIdx] = true;
      this._speakLine('neckAndNeck', this.lines.neckAndNeck, {}, CFG.closePauseMs);
      return;
    }

    // momentum swings
    if (secondProgress != null) {
      const lastGap = this.state.lastMomentumGap;
      if (lastGap != null && Math.abs(gap - lastGap) >= 0.04 && cooldownPassed) {
        if (gap > lastGap && gap >= 0.05) {
          this._speakLine('widening', this.lines.widening, { leader: leaderName, trailer: trailerName }, CFG.leadPauseMs);
          this.state.lastMomentumGap = gap;
          return;
        }
        if (gap < lastGap && gap <= 0.12) {
          this._speakLine('comeback', this.lines.comeback, { leader: leaderName, trailer: trailerName }, CFG.leadPauseMs);
          this.state.lastMomentumGap = gap;
          return;
        }
      }
      this.state.lastMomentumGap = gap;
    }

    // struggle call when gap is significant
    if (secondProgress != null && gap > 0.1 && cooldownPassed) {
      this._speakLine('struggleTribe', this.lines.struggleTribe, { trailer: trailerName, leader: leaderName }, CFG.leadPauseMs);
      return;
    }

    // finish line tease
    if (!this.state.finishSoonCalled && leaderProgress >= 0.9 && cooldownPassed) {
      this.state.finishSoonCalled = true;
      this._speakLine('finishSoon', this.lines.finishSoon, { leader: leaderName }, CFG.finishPauseMs);
      return;
    }

    this._handleSurvivorCallouts(now, cooldownPassed);
  },

  _handleCompletion({ immediate = false } = {}) {
    if (this._completionHandled) return;
    this._completionHandled = true;
    this._applyChallengeThreatAdjustments();
    this._removeSkipButton();

    if (immediate) {
      if (this._resultsTimeout) {
        clearTimeout(this._resultsTimeout);
        this._resultsTimeout = null;
      }
      this._showFinalResults();
      return;
    }

    this._resultsTimeout = setTimeout(() => {
      this._resultsTimeout = null;
      this._showFinalResults();
    }, 800);
  },

  _advanceSimulation(now, dt, { immediateResults = false } = {}) {
    if (this._destroyed) return true;
    if (!this._isSkipping && now < this.state.pausedUntil) {
      return false;
    }
    if (this._isSkipping) {
      this.state.pausedUntil = 0;
    }

    // per-survivor motion
    this.tribes.forEach(tribe => {
      const key = getKey(tribe);
      const list = this.memberMap[key];

      list.forEach(ms => {
        if (ms.status !== 'running') return;
        const segIdx = ms.runningIdx;
        const seg = SEGMENTS[segIdx];

        // small error events
        if (!ms._errUntil || now > ms._errUntil) {
          if (Math.random() < this._errChance(ms.survivor) * dt * CFG.tickHz) {
            const pause = lerp(CFG.errPause[0], CFG.errPause[1], Math.random());
            ms._errUntil = now + pause;
            this.state.events.push({ type:'error', seg: seg.id, tribeKey:key, survivor:ms.survivor, ms:pause|0 });
          }
        }
        if (ms._errUntil && now < ms._errUntil) return;

        // progress & position
        const speed = this._speed(ms, seg) * dt;
        ms._lastSpeed = speed;
        ms.perLeg[segIdx] = clamp((ms.perLeg[segIdx]||0) + speed, 0, 1);

        const r = this._segmentRect(segIdx);
        const laneX = this._laneX(ms.tribe);
        const x = laneX + (this._rootEl.clientWidth/this.tribes.length)/2 + jitter(ms.survivor.id, 8) - CFG.avatar.size/2;
        const y = r.top + r.height - (r.height * ms.perLeg[segIdx]) - CFG.avatar.size/2;
        ms.avatar.style.left = `${x}px`; ms.avatar.style.top = `${y}px`;
        ms.label.style.left = `${x}px`;  ms.label.style.top = `${y + CFG.avatar.size + 2}px`;

        // done with this leg -> park
        if (ms.perLeg[segIdx] >= 1) {
          ms.status = 'waiting';
          ms.runningIdx = -1;
          let nextIdx = -1;
          for (let i=segIdx+1;i<SEGMENTS.length;i++){
            const isAssigned = this.participants[key][i]?.some(p => p.id===ms.survivor.id);
            if (isAssigned){ nextIdx = i; break; }
          }
          if (nextIdx===-1) this._placeFinished(ms);
          else this._placeInSideline(ms, nextIdx);
        }
      });

      // combine tribe progress
      const overall = this.state.progressByTribe[key];
      const curSeg = SEGMENTS.findIndex(s => overall < s.end);
      if (curSeg >= 0) {
        const frac = this._combineProgress(key, curSeg);
        const prevEnd = curSeg === 0 ? 0 : SEGMENTS[curSeg-1].end;
        const segSpan = SEGMENTS[curSeg].end - prevEnd;
        this.state.progressByTribe[key] = clamp(prevEnd + frac * segSpan, 0, 1);

        // entering next segment?
        const nextSeg = SEGMENTS.findIndex(s => this.state.progressByTribe[key] < s.end);
        if (nextSeg !== curSeg) this._setRunningForCurrentStage();
      }

      // finished tribe?
      if (this.state.progressByTribe[key] >= 1 && !this.state.finishedOrder.includes(key)) {
        this.state.finishedOrder.push(key);
        const tname = tribeSpan(tribe);
        this._announce(`${tname} hits the mat!`, CFG.finishPauseMs);
      }
    });

    this._maybeUnifyPuzzle(now);

    // HUD & lead logic
    this._updateScoreboard();
    this._maybeDockHudForLaterLegs();
    this._handleNarration();

    // end?
    const allDone = this.tribes.every(t => this.state.progressByTribe[getKey(t)] >= 1);
    if (allDone) {
      this._handleCompletion({ immediate: immediateResults });
      return true;
    }

    return false;
  },

  _tick() {
    if (this._destroyed || this._stopTicking) return;
    const now = performance.now();
    const dt = Math.min(200, now - this.state.lastTick) / 1000;
    this.state.lastTick = now;

    const done = this._advanceSimulation(now, dt);
    if (done) return;

    requestAnimationFrame(() => this._tick());
  },

  // ---------- final summary ----------
  _findSurvivorById(id) {
    if (!id) return null;
    const direct = gameManager.survivors?.find(s => s.id === id);
    if (direct) return direct;

    for (const tribe of this.tribes || []) {
      const found = (tribe.members || []).find(s => s.id === id);
      if (found) return found;
    }

    return null;
  },

  _applyChallengeThreatAdjustments() {
    if (this.state.challengeThreatApplied) return;

    const stagePerformance = this._computeStagePerformance();
    const playerId = gameManager.getPlayerSurvivor()?.id;

    const applyDelta = (perf, delta) => {
      if (!perf?.survivor?.id) return;
      const survivor = this._findSurvivorById(perf.survivor.id);
      if (!survivor) return;

      const updated = (survivor.challengeThreat ?? 50) + delta;
      survivor.challengeThreat = Math.max(0, Math.min(100, updated));

      if (survivor.id === playerId) window.refreshMenuCard?.();
    };

    Object.values(stagePerformance).forEach(({ mvp, lvp }) => {
      applyDelta(mvp, 3);
      applyDelta(lvp, -3);
    });

    this.state.challengeThreatApplied = true;
  },

  _computeStagePerformance() {
    const stats = {};
    SEGMENTS.forEach((seg, idx) => {
      const perfs = [];
      this.tribes.forEach(tribe => {
        const key = getKey(tribe);
        (this.participants[key][idx]||[]).forEach(s => {
          const score = this._legScore(s, seg);
          perfs.push({ survivor:s, tribe, score });
        });
      });
      perfs.sort((a,b)=>b.score-a.score);
      stats[seg.id] = { mvp: perfs[0] || null, lvp: perfs[perfs.length-1] || null };
    });
    return stats;
  },

  _buildResults() {
    const stagePerformance = this._computeStagePerformance();
    const playerTribe = gameManager.getPlayerTribe?.();
    const playerTribeKey = getKey(playerTribe);
    const playerMemberIds = new Set((playerTribe?.members || []).map((member) => member?.id).filter(Boolean));
    const stagePerformanceCompact = {};
    const playerTribeStagePerformance = {
      stage1: { mvp: null, lvp: null },
      stage2: { mvp: null, lvp: null },
      stage3: { mvp: null, lvp: null },
      stage4: { mvp: null, lvp: null }
    };
    const mvpCounts = new Map();
    const lvpCounts = new Map();

    Object.entries(stagePerformance).forEach(([segId, info]) => {
      const stageIndex = SEGMENTS.findIndex(seg => seg.id === segId);
      const stageKey = `stage${stageIndex + 1}`;
      stagePerformanceCompact[segId] = {
        mvp: info.mvp ? { survivorId: info.mvp.survivor.id, tribeKey: getKey(info.mvp.tribe) } : null,
        lvp: info.lvp ? { survivorId: info.lvp.survivor.id, tribeKey: getKey(info.lvp.tribe) } : null
      };

      const mvpId = info?.mvp?.survivor?.id;
      const lvpId = info?.lvp?.survivor?.id;
      if (stageKey && playerMemberIds.has(mvpId)) {
        playerTribeStagePerformance[stageKey].mvp = mvpId;
        mvpCounts.set(mvpId, (mvpCounts.get(mvpId) || 0) + 1);
      }
      if (stageKey && playerMemberIds.has(lvpId)) {
        playerTribeStagePerformance[stageKey].lvp = lvpId;
        lvpCounts.set(lvpId, (lvpCounts.get(lvpId) || 0) + 1);
      }
    });

    const pickOverall = (countsMap) => {
      const entries = Array.from(countsMap.entries()).sort((a, b) => b[1] - a[1]);
      if (!entries.length) return null;
      if (entries.length > 1 && entries[0][1] === entries[1][1]) return null;
      return entries[0][0] || null;
    };

    const winningTribeKeys = this.isThree ? this.state.finishedOrder.slice(0,2) : this.state.finishedOrder.slice(0,1);
    const playerTribeWon = winningTribeKeys.some((key) => String(key) === String(playerTribeKey));
    const playerTribeMvpCandidates = Array.from(mvpCounts.keys());
    const playerTribeLvpCandidates = Array.from(lvpCounts.keys());
    const currentDay = gameManager.getDay?.() || 1;

    return {
      challengeKey: 'first_contact',
      challengeName: 'First Contact',
      challengeDay: currentDay,
      finishedOrder: [...this.state.finishedOrder],
      winningTribeKey: this.state.finishedOrder[0],
      winningTribeKeys,
      playerTribeKey,
      playerTribeWon,
      stagePerformance: stagePerformanceCompact,
      playerTribeStagePerformance,
      playerTribeMvpCandidates,
      playerTribeLvpCandidates,
      playerTribeOverallMvp: pickOverall(mvpCounts),
      playerTribeOverallLvp: pickOverall(lvpCounts)
    };
  },

  _applyImmunityResults(result) {
    if (!result) return;
    const tribes = gameManager.getTribes?.() || [];
    const winningKeys = new Set();
    const normalizedWinningKeys = new Set();

    const addKeyVariants = (value) => {
      if (value == null) return;
      const trimmed = typeof value === 'string' ? value.trim() : value;
      const lower = typeof trimmed === 'string' ? trimmed.toLowerCase() : null;

      winningKeys.add(trimmed);
      if (typeof trimmed === 'number') {
        winningKeys.add(String(trimmed));
        normalizedWinningKeys.add(String(trimmed).trim().toLowerCase());
      }
      if (typeof trimmed === 'string') {
        winningKeys.add(trimmed);
        normalizedWinningKeys.add(trimmed.toLowerCase());
      }
      if (lower != null) {
        winningKeys.add(lower);
      }
    };

    if (Array.isArray(result.winningTribeKeys)) {
      result.winningTribeKeys.forEach((key) => addKeyVariants(key));
    }
    if (result.winningTribeKey) {
      addKeyVariants(result.winningTribeKey);
    }

    tribes.forEach((tribe) => {
      const keys = new Set();
      const normalizedKeys = new Set();
      [tribe?.id, tribe?.tribeName, tribe?.name, tribe?.tribeColor, tribe?.color].forEach((value) => {
        if (value == null) return;
        const trimmed = typeof value === 'string' ? value.trim() : value;
        const lower = typeof trimmed === 'string' ? trimmed.toLowerCase() : null;
        keys.add(trimmed);
        if (typeof trimmed === 'number') {
          keys.add(String(trimmed));
          normalizedKeys.add(String(trimmed).trim().toLowerCase());
        }
        if (typeof trimmed === 'string') {
          keys.add(trimmed);
          normalizedKeys.add(trimmed.toLowerCase());
        }
        if (lower != null) {
          keys.add(lower);
        }
      });

      let isImmune = false;
      for (const key of keys) {
        if (winningKeys.has(key)) {
          isImmune = true;
          break;
        }
        const normalized = typeof key === 'string' ? key.trim().toLowerCase() : String(key).trim().toLowerCase();
        if (normalizedWinningKeys.has(normalized)) {
          isImmune = true;
          break;
        }
      }
      if (!isImmune) {
        for (const normalizedKey of normalizedKeys) {
          if (normalizedWinningKeys.has(normalizedKey)) {
            isImmune = true;
            break;
          }
        }
      }

      tribe.hasImmunity = isImmune;
      tribe.isImmune = isImmune;
      if (isImmune) {
        tribe.immunityWins = (tribe.immunityWins || 0) + 1;
      }
    });
  },

  async _showNoJourneyOutro(container, result) {
    const ui = new JourneyBeatUI(container);
    const winnersKeys = Array.isArray(result?.winningTribeKeys)
      ? result.winningTribeKeys
      : result?.winningTribeKey
        ? [result.winningTribeKey]
        : [];
    const winnerKeySet = new Set(winnersKeys.map((key) => String(key)));
    const losers = (this.tribes || []).filter((tribe) => !winnerKeySet.has(String(getKey(tribe))));
    const loser = losers[0] || null;
    const loserLine = loser
      ? `${tribeSpan(loser)}, I’ll see you tonight at Tribal Council — where someone will be the first Survivor voted out of the game.`
      : 'I’ll see the losing tribe tonight at Tribal Council — where someone will be the first Survivor voted out of the game.';

    const showBeat = (textLines) => new Promise((resolve) => {
      ui.setSceneBackground('Assets/jeff-screen.png');
      ui.renderBeat({
        textLines,
        buttons: [{ label: 'Continue', onClick: () => resolve() }]
      });
    });

    try {
      await showBeat([
        'For everyone not going on the journey, you’ll head back to camp and wait for your tribemates to return before Tribal Council.'
      ]);
      await showBeat([loserLine]);
    } finally {
      ui.destroy();
      JourneyBeatUI.forceCleanup(container);
    }
  },

  _showFinalResults() {
    this.cleanupResultsUI();
    clearChildren(this._rootEl);
    this._rootEl.style.backgroundImage = `url('Assets/jeff-screen.png')`;
    this._rootEl.style.backgroundSize = 'cover';
    this._rootEl.style.backgroundPosition = 'center';
    this._rootEl.style.backgroundRepeat = 'no-repeat';

    const winnersKeys = this.isThree ? this.state.finishedOrder.slice(0, 2) : this.state.finishedOrder.slice(0, 1);
    const loserKeys = this.tribes.map(t => getKey(t)).filter(k => !winnersKeys.includes(k));
    const winners = winnersKeys.map(k => this.tribes.find(t => getKey(t) === k)).filter(Boolean);
    const losers = loserKeys.map(k => this.tribes.find(t => getKey(t) === k)).filter(Boolean);

    let text;
    if (this.isThree) {
      const w1 = winners[0], w2 = winners[1], l = losers[0];
      const rendered = this._pickLine('winTwo', this.lines.winTwo, {
        winnerA: tribeSpan(w1),
        winnerB: tribeSpan(w2)
      });
      const base = rendered || `${tribeSpan(w1)} and ${tribeSpan(w2)} win immunity!`;
      text = `${base} ${l ? `${tribeSpan(l)}, I’ll be seeing you at Tribal Council.` : ''}`;
    } else {
      const w = winners[0], l = losers[0];
      const rendered = this._pickLine('winOne', this.lines.winOne, {
        winner: tribeSpan(w),
        loser: tribeSpan(l)
      });
      text = rendered || `${tribeSpan(w)} wins immunity! ${l ? `${tribeSpan(l)}, grab your torches and head to Tribal Council.` : ''}`;
    }

    // parchment
    const resultsOverlay = createElement('div', {
      className: 'challenge-results-overlay',
      style: 'position:absolute; inset:0; z-index:4500;'
    });
    const wrap = createElement('div', { style:`position:absolute; top:30px; left:50%; transform:translateX(-50%); width:100%; max-width:320px; z-index:1000;` });
    const parch = createElement('img', { src:'Assets/parch-landscape.png', style:`width:100%; max-width:320px; max-height:180px; display:block; margin:0 auto;` });
    const txt = createElement('div', { style:`position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); width:80%; max-width:260px; color:#fff; font-family:'Survivant',sans-serif; font-size:.9rem; font-weight:bold; line-height:1.2; text-align:center; text-shadow:0 1px 0 #000,0 2px 0 #000,0 3px 0 #000,0 4px 4px rgba(0,0,0,.5);` });
    txt.innerHTML = text;
    wrap.append(parch, txt);

    const btnRow = createElement('div', { style:`position:absolute; top:220px; left:50%; transform:translateX(-50%); display:flex; gap:12px;` });
    const nextBtn = createElement('button', {
      style:`width:140px; height:50px; background:url('Assets/rect-button.png') center/cover no-repeat; border:none; color:#fff; font-family:'Survivant',sans-serif; font-size:1rem; font-weight:bold; cursor:pointer; text-shadow:1px 1px 2px black;`
    }, 'Continue');
    const brkBtn = createElement('button', {
      style:`width:200px; height:50px; background:url('Assets/rect-button.png') center/cover no-repeat; border:none; color:#fff; font-family:'Survivant',sans-serif; font-size:1rem; font-weight:bold; cursor:pointer; text-shadow:1px 1px 2px black;`
    }, 'Performance Breakdown');
    const handleContinue = async () => {
      if (nextBtn.disabled) return;
      nextBtn.disabled = true;

      this.cleanupResultsUI();

      const activeContainer = this.container;
      this.destroy();
      if (activeContainer) {
        clearChildren(activeContainer);
      }
      JourneyBeatUI.forceCleanup(activeContainer);

      const player = gameManager.getPlayerSurvivor();
      const tribes = gameManager.getTribes();
      const playerTribe = gameManager.getPlayerTribe();

      const results = this._buildResults();
      this._applyImmunityResults(results);

      const selectionResult = await JourneySelectionEvent.run(activeContainer, {
        gameManager,
        tribes,
        player,
        playerTribe,
        challengeKey: 'firstContact',
        day: gameManager.getDay()
      });

      if (selectionResult?.playerWasSelected) {
        await RiskProtectJourneyEvent.run(activeContainer, {
          gameManager,
          journey: gameManager.journey,
          player,
          relationshipSystem: gameManager.systems.relationshipSystem
        });
      } else {
        await this._showNoJourneyOutro(activeContainer, results);
      }

      if (window.challengeScreen && typeof window.challengeScreen.completeChallenge === 'function') {
        window.challengeScreen.completeChallenge(results);
      } else {
        gameManager.advanceGamePhase();
        gameManager.setGameState('camp');
      }
    };
    const handleBreakdown = () => this._showBreakdownPopup();
    nextBtn.addEventListener('click', handleContinue, { once: true });
    brkBtn.addEventListener('click', handleBreakdown);
    btnRow.append(nextBtn, brkBtn);

    resultsOverlay.append(wrap, btnRow);
    this._rootEl.append(resultsOverlay);
    this._resultsOverlay = resultsOverlay;
    this._resultsContinueBtn = nextBtn;
    this._resultsBreakdownBtn = brkBtn;
    this._onResultsContinue = handleContinue;
    this._onResultsBreakdown = handleBreakdown;
  },

  _showBreakdownPopup() {
    if (this._breakdownEl) {
      this._breakdownEl.remove();
      this._breakdownEl = null;
    }
    const overlay = createElement('div', {
      className: 'performance-breakdown-overlay',
      style:`position:absolute; inset:0; background:rgba(0,0,0,0.6); z-index:5000; display:flex; align-items:center; justify-content:center;`
    });
    const card = createElement('div', { style:`width:min(92vw,780px); max-height:80vh; overflow:auto; background:rgba(0,0,0,0.85); border-radius:12px; padding:14px; color:#fff; font-family:'Survivant',sans-serif; box-shadow:0 8px 24px rgba(0,0,0,.5); position:relative;` });
    const title = createElement('div', { style:`font-size:1.2rem; font-weight:bold; text-align:center; margin-bottom:10px; color:#f3d37a;` }, 'Performance Breakdown');
    const close = createElement('div', { style:`position:absolute; right:12px; top:8px; cursor:pointer; font-weight:bold;` }, '✕');
    const handleClose = () => {
      overlay.remove();
      if (this._breakdownEl === overlay) {
        this._breakdownEl = null;
      }
      if (this._breakdownCloseBtn === close) {
        this._breakdownCloseBtn = null;
        this._onBreakdownClose = null;
      }
    };
    close.addEventListener('click', handleClose);

    const content = createElement('div', { style:`display:flex; flex-direction:column; gap:10px;` });
    const stagePerformance = this._computeStagePerformance();
    const playerId = gameManager.getPlayerSurvivor()?.id;
    SEGMENTS.forEach((seg,idx)=> {
      const row = createElement('div', { style:`background:rgba(255,255,255,.08); border-radius:10px; padding:10px;` });
      row.appendChild(createElement('div', { style:`font-size:1rem; margin-bottom:6px; color:#f3d37a;` }, seg.name));

      const { mvp, lvp } = stagePerformance[seg.id] || {};

      const line = createElement('div', { style:`display:flex; justify-content:space-between; gap:10px; flex-wrap:wrap;` });
      const mk = (tag, p) => {
        const wrap = createElement('div', { style:`display:flex; align-items:center; gap:6px; flex-wrap:wrap;` });
        wrap.appendChild(createElement('span', { style:'font-weight:bold;' }, `${tag}:`));
        if (!p) { wrap.appendChild(createElement('span', {}, '—')); return wrap; }

        const baseName = p?.survivor?.firstName || 'Survivor';
        const tribeColor = p?.tribe?.color || p?.tribe?.tribeColor || '#fff';
        const nameIsPlayer = p?.survivor?.id === playerId;
        const nameStyle = nameIsPlayer ? 'color:#f3d37a; text-shadow:1px 1px 2px #000;' : `color:${tribeColor}; text-shadow:1px 1px 2px #000;`;
        const name = nameIsPlayer ? `${baseName} (You)` : baseName;
        const tribeText = p?.tribe?.tribeName || p?.tribe?.name || '';

        wrap.append(
          createElement('span', { style:nameStyle }, name),
          createElement('span', { style:`color:${tribeColor}; text-shadow:1px 1px 2px #000;` }, `(${tribeText})`)
        );
        return wrap;
      };
      line.append(mk('MVP', mvp), mk('LVP', lvp));
      row.appendChild(line);

      content.appendChild(row);
    });

    card.append(title, content, close);
    overlay.appendChild(card);
    this._rootEl.appendChild(overlay);
    this._breakdownEl = overlay;
    this._breakdownCloseBtn = close;
    this._onBreakdownClose = handleClose;
  },

  cleanupResultsUI() {
    if (this._resultsTimeout) {
      clearTimeout(this._resultsTimeout);
      this._resultsTimeout = null;
    }
    this._removeSkipButton();
    if (this._resultsContinueBtn && this._onResultsContinue) {
      this._resultsContinueBtn.removeEventListener('click', this._onResultsContinue);
    }
    if (this._resultsBreakdownBtn && this._onResultsBreakdown) {
      this._resultsBreakdownBtn.removeEventListener('click', this._onResultsBreakdown);
    }
    if (this._breakdownCloseBtn && this._onBreakdownClose) {
      this._breakdownCloseBtn.removeEventListener('click', this._onBreakdownClose);
    }
    if (this._resultsOverlay) {
      this._resultsOverlay.remove();
    }
    if (this._breakdownEl) {
      this._breakdownEl.remove();
    }
    if (this._rootEl) {
      this._rootEl.querySelectorAll('.challenge-results-overlay, .performance-breakdown-overlay').forEach(el => el.remove());
    }
    this._resultsOverlay = null;
    this._resultsContinueBtn = null;
    this._resultsBreakdownBtn = null;
    this._onResultsContinue = null;
    this._onResultsBreakdown = null;
    this._breakdownEl = null;
    this._breakdownCloseBtn = null;
    this._onBreakdownClose = null;
  },

  cleanupOverlays() {
    this.cleanupResultsUI();
  },

  destroy() {
    this._destroyed = true;
    this.cleanupResultsUI();
    if (this._rootEl) {
      this._rootEl.remove();
      this._rootEl = null;
    }
    if (this._onResize) {
      window.removeEventListener('resize', this._onResize);
      window.removeEventListener('orientationchange', this._onResize);
      this._onResize = null;
    }
    this.jeff = null;
    this.container = null;
  }
};

export default FirstContactView;
