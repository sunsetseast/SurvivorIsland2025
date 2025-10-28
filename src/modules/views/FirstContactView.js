// src/views/FirstContactView.js
//
// Continuous challenge with individual survivor motion, correct spawn per first
// assigned leg, visible sidelines/bleachers, scoreboard, Jeff’s centered bubble
// (shows only during pauses), and a post-challenge Performance Breakdown.
//
// Paste over your existing file. Requires: createElement, clearChildren, gameManager.

import { createElement, clearChildren } from '../utils/DOMUtils.js';
import gameManager from '../core/GameManager.js';

// ---------- tiny helpers ----------
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const getKey = (tribe) => tribe?.id ?? tribe?.name ?? tribe?.tribeName;

// stable jitter per id (keeps stacks from overlapping)
function jitter(id, spread = 6) {
  const x = Math.sin(id * 999) * 43758.5453;
  return ((x - Math.floor(x)) - 0.5) * 2 * spread;
}

// ---------- tuning ----------
const CFG = {
  base: 0.050,          // base movement per second
  alpha: 0.040,         // trait influence scaling
  tickHz: 30,           // update rate
  errPause: [180, 420], // ms pause on small “error” event
  stagePauseMs: 1400,
  leadPauseMs: 1600,
  closePauseMs: 1600,
  finishPauseMs: 2000,
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

// ---------- Jeff bubble (centered; shows only during pauses) ----------
class JeffBubble {
  constructor(root) {
    this.root = root;
    this.wrap = createElement('div', { style:`
      position:absolute; inset:0; display:none; align-items:center; justify-content:center; z-index:4000;
      pointer-events:auto;
    `});
    const panel = createElement('div', { style:`
      display:flex; gap:12px; align-items:center; max-width:min(85vw,720px);
      background:rgba(0,0,0,.75); color:#fff; border-radius:14px; padding:14px 18px;
      box-shadow:0 8px 24px rgba(0,0,0,.55); text-shadow:1px 1px 2px #000;
      font-family:'Survivant',sans-serif; font-weight:bold; line-height:1.25; font-size:1.05rem;
    `});
    const img = createElement('img', { src:'Assets/jeff-screen.png', style:`
      width:64px; height:64px; border-radius:50%; object-fit:cover; object-position:center 30%; border:2px solid #fff;
    `});
    this.textEl = createElement('div', {});
    panel.append(img, this.textEl);
    this.wrap.appendChild(panel);
    root.appendChild(this.wrap);

    this.wrap.addEventListener('click', () => {
      this.hide();
      if (this.onResume) this.onResume();
    });
  }
  show(text) { this.textEl.textContent = text; this.wrap.style.display = 'flex'; }
  hide() { this.wrap.style.display = 'none'; }
}

const FirstContactView = {
  render(container) {
    this.container = container;
    clearChildren(container);
    container.style.position = 'relative';
    container.style.overflow = 'hidden';

    // data
    this.tribes = gameManager.getTribes();
    this.playerTribe = gameManager.getPlayerTribe();
    this.isThree = this.tribes.length === 3;

    // layout
    this._buildBands();
    this._buildLanes();
    this._buildScoreboard();
    this.jeff = new JeffBubble(container);

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
      totalScores: {},
      stageScores: SEGMENTS.reduce((m,s)=> (m[s.id]={}, m), {}),
      events: []
    };
    this.tribes.forEach(t => {
      const k = getKey(t);
      this.state.progressByTribe[k] = 0;
      this.state.lastSegIdx[k] = -1;
      this.state.totalScores[k] = 0;
    });

    // lines
    this.lines = {
      enter: {
        mud:   ["Into the mud—pure grit!", "Crawl, fight, claw—welcome to the mud."],
        knots: ["Knots now—dexterity and patience.", "Hands shaking, minds racing—untie it!"],
        toss:  ["Bean-bag toss—touch matters.", "Every miss is a gift to the other tribe."],
        puzzle:["Final puzzle—everything on the line.", "It always comes down to the puzzle!"]
      },
      lead: ["Lead change! Momentum swing!", "New leaders—what a surge!", "Bang—lead flips!"],
      close: ["Neck and neck—photo finish coming!", "Nothing in it!", "Dead even!"],
      finish: ["{tribe} hits the mat! Immunity!", "{tribe} locks it in!"]
    };

    // GO
    this._announce(`Three… two… one… GO!`, CFG.stagePauseMs);
    this._setRunningForCurrentStage();
    this._tick();
  },

  // ---------- layout ----------
  _buildBands() {
    const bands = createElement('div', { style:`position:absolute; inset:0; z-index:1;` });
    this.container.appendChild(bands);
    this.bandRects = [];
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
      this.bandRects.push({ topPct, heightPct });
    });
  },

  _buildLanes() {
    const lanes = createElement('div', { style:`position:absolute; inset:0; z-index:2;` });
    this.container.appendChild(lanes);
    const W = this.container.clientWidth || 800;
    const laneW = Math.floor(W / this.tribes.length);
    this.lanes = [];
    this.sidelines = {};      // [tribeKey][segIdx] -> {x,y,count}
    this.bleachersY = (this.container.clientHeight||600) * (1 - SEGMENTS[3].end) + CFG.bleachersYPad;
    this.bleachersSlots = {}; // [tribeKey] -> counter

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
        const y = (this.container.clientHeight||600) * (yPct/100) - 60;
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
    this.container.appendChild(root);

    this._stageDots = {};  // [tribeKey][segIdx] -> dot
    this._stageBadge = {}; // [tribeKey] -> span

    this.tribes.forEach(t => {
      const key = getKey(t);
      const wrap = createElement('div', { style:`display:flex; align-items:center; gap:6px;` });
      const name = t.tribeName || t.name || `Tribe ${t.id}`;
      const label = createElement('span', { style:`color:${t.color || t.tribeColor || '#fff'}; text-shadow:1px 1px 2px #000;` }, name);
      const badge = createElement('span', { style:`margin-left:6px; padding:2px 6px; border-radius:6px; background:rgba(0,0,0,.4); color:#fff; font-size:.75rem;` }, 'START');
      this._stageBadge[key] = badge;
      wrap.append(label, badge);
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

        const i = this.state.lastSegIdx[k];
        const label = ['MUD','KNOTS','TOSS','PUZZLE'][Math.max(0,i)];
        this._stageBadge[k].textContent = label;
      });
    };
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
                 color:#fff; text-shadow:1px 1px 2px #000; z-index:11;`
        }, (ms.survivor.firstName || '').split(' ')[0]);
        this.container.append(img,label);
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
    const W = this.container.clientWidth || 800;
    const laneW = Math.floor(W / this.tribes.length);
    const idx = this.tribes.findIndex(t => getKey(t)===getKey(tribe));
    return idx*laneW;
  },

  _segmentRect(segIdx) {
    const H = this.container.clientHeight || 600;
    const r = this.bandRects[segIdx];
    const top = (r.topPct/100) * H;
    const height = (r.heightPct/100) * H;
    return { top, height };
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
    return (CFG.base * (1 + CFG.alpha*T)) * R * F * C * L;
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

      // stage entry commentary once per tribe per stage
      if (this.state.lastSegIdx[key] !== segIdx) {
        this.state.lastSegIdx[key] = segIdx;
        this._announce(pick(this.lines.enter[SEGMENTS[segIdx].id] || ["Go!"]), CFG.stagePauseMs);
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
    this.jeff.show(text);
    const now = performance.now();
    this.state.pausedUntil = now + (pauseMs || CFG.stagePauseMs);
    this.jeff.onResume = () => { this.state.pausedUntil = 0; this.jeff.hide(); };
  },

  _maybeLeadChange() {
    const order = Object.entries(this.state.progressByTribe).sort(([,a],[,b])=>b-a).map(([k])=>k);
    const leader = order[0];
    if (leader !== this._prevLeader && this._prevLeader != null) {
      this._announce(pick(this.lines.lead), CFG.leadPauseMs);
    }
    if (order.length>=2) {
      const gap = Math.abs(this.state.progressByTribe[order[0]] - this.state.progressByTribe[order[1]]);
      if (this.state.progressByTribe[order[0]] > 0.75 && gap < 0.03) {
        this._announce(pick(this.lines.close), CFG.closePauseMs);
      }
    }
    this._prevLeader = leader;
  },

  _tick() {
    const now = performance.now();
    const dt = Math.min(200, now - this.state.lastTick) / 1000;
    this.state.lastTick = now;

    if (now < this.state.pausedUntil) { requestAnimationFrame(() => this._tick()); return; }

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
          if (Math.random() < this._errChance(ms.survivor)*dt*CFG.tickHz) {
            const pause = lerp(CFG.errPause[0], CFG.errPause[1], Math.random());
            ms._errUntil = now + pause;
            this.state.events.push({ type:'error', seg: seg.id, tribeKey:key, survivor:ms.survivor, ms:pause|0 });
          }
        }
        if (ms._errUntil && now < ms._errUntil) return;

        // progress & position
        const speed = this._speed(ms, seg) * dt;
        ms.perLeg[segIdx] = clamp((ms.perLeg[segIdx]||0) + speed, 0, 1);

        const r = this._segmentRect(segIdx);
        const laneX = this._laneX(ms.tribe);
        const x = laneX + (this.container.clientWidth/this.tribes.length)/2 + jitter(ms.survivor.id, 8) - CFG.avatar.size/2;
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
          if (nextIdx===-1) this._placeInBleachers(ms);
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
        const tname = tribe.tribeName || tribe.name || `Tribe ${tribe.id}`;
        this._announce(pick(this.lines.finish).replace('{tribe}', tname), CFG.finishPauseMs);
      }
    });

    // HUD & lead logic
    this._updateScoreboard();
    this._maybeLeadChange();

    // end?
    const allDone = this.tribes.every(t => this.state.progressByTribe[getKey(t)] >= 1);
    if (allDone) { setTimeout(()=> this._showFinalResults(), 800); return; }

    requestAnimationFrame(() => this._tick());
  },

  // ---------- final summary ----------
  _showFinalResults() {
    clearChildren(this.container);
    this.container.style.backgroundImage = `url('Assets/jeff-screen.png')`;

    const sorted = Object.entries(this.state.totalScores)
      .sort(([,a],[,b]) => b - a)
      .map(([tribeKey, score]) => ({ 
        tribe: this.tribes.find(t => (t.id || t.name || t.tribeName) === tribeKey), 
        score,
        tribeKey 
      }));

    const winners = sorted.slice(0, this.isThree ? 2 : 1);
    const losers  = sorted.slice(this.isThree ? 2 : 1);

    const colorHex = (name)=>({ red:'#FF0000', blue:'#0066FF', orange:'#FF8C00', green:'#228B22', purple:'#8A2BE2' }[name] || '#FFFFFF');
    const colorTribe = (tribe) => {
      const name = tribe?.name || tribe?.tribeName || 'Tribe';
      const hex = colorHex(tribe?.color || tribe?.tribeColor);
      return `<span style="color:${hex}; font-weight:bold; text-shadow:1px 1px 2px black;">${name}</span>`;
    };

    let text;
    if (this.isThree) {
      const w1=winners[0]?.tribe, w2=winners[1]?.tribe, l=losers[0]?.tribe;
      text = `${colorTribe(w1)} and ${colorTribe(w2)} win immunity! ${colorTribe(l)}, I’ll be seeing you at Tribal Council.`;
    } else {
      const w=winners[0]?.tribe, l=losers[0]?.tribe;
      text = `${colorTribe(w)} wins immunity! ${colorTribe(l)}, grab your torches and head to Tribal Council.`;
    }

    // parchment
    const wrap = createElement('div', { style:`position:absolute; top:30px; left:50%; transform:translateX(-50%); width:100%; max-width:320px; z-index:1000;` });
    const parch = createElement('img', { src:'Assets/parch-landscape.png', style:`width:100%; max-width:320px; max-height:180px; display:block; margin:0 auto;` });
    const txt = createElement('div', { style:`position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); width:80%; max-width:260px; color:#fff; font-family:'Survivant',sans-serif; font-size:.9rem; font-weight:bold; line-height:1.2; text-align:center; text-shadow:0 1px 0 #000,0 2px 0 #000,0 3px 0 #000,0 4px 4px rgba(0,0,0,.5);` });
    txt.innerHTML = text;
    wrap.append(parch, txt);

    const btnRow = createElement('div', { style:`position:absolute; top:220px; left:50%; transform:translateX(-50%); display:flex; gap:12px;` });
    const nextBtn = createElement('button', {
      style:`width:140px; height:50px; background:url('Assets/rect-button.png') center/cover no-repeat; border:none; color:#fff; font-family:'Survivant',sans-serif; font-size:1rem; font-weight:bold; cursor:pointer; text-shadow:1px 1px 2px black;`,
      onclick:()=>{ /* your flow to next screen */ }
    }, 'Continue');
    const brkBtn = createElement('button', {
      style:`width:200px; height:50px; background:url('Assets/rect-button.png') center/cover no-repeat; border:none; color:#fff; font-family:'Survivant',sans-serif; font-size:1rem; font-weight:bold; cursor:pointer; text-shadow:1px 1px 2px black;`,
      onclick:()=> this._showBreakdownPopup()
    }, 'Performance Breakdown');
    btnRow.append(nextBtn, brkBtn);

    this.container.append(wrap, btnRow);
  },

  _showBreakdownPopup() {
    const overlay = createElement('div', { style:`position:absolute; inset:0; background:rgba(0,0,0,.6); z-index:5000; display:flex; align-items:center; justify-content:center;` });
    const card = createElement('div', { style:`width:min(92vw,780px); max-height:80vh; overflow:auto; background:rgba(0,0,0,.85); border-radius:12px; padding:14px; color:#fff; font-family:'Survivant',sans-serif; box-shadow:0 8px 24px rgba(0,0,0,.5); position:relative;` });
    const title = createElement('div', { style:`font-size:1.2rem; font-weight:bold; text-align:center; margin-bottom:10px; color:#f3d37a;` }, 'Performance Breakdown');
    const close = createElement('div', { style:`position:absolute; right:12px; top:8px; cursor:pointer; font-weight:bold;` }, '✕');
    close.onclick = ()=> overlay.remove();

    const content = createElement('div', { style:`display:flex; flex-direction:column; gap:10px;` });
    SEGMENTS.forEach((seg,idx)=> {
      const row = createElement('div', { style:`background:rgba(255,255,255,.08); border-radius:10px; padding:10px;` });
      row.appendChild(createElement('div', { style:`font-size:1rem; margin-bottom:6px; color:#f3d37a;` }, seg.name));

      // MVP/LVP heuristic: best/worst legScore among assigned
      const perfs = [];
      this.tribes.forEach(tribe => {
        const key = getKey(tribe);
        (this.participants[key][idx]||[]).forEach(s => {
          const score = this._legScore(s, seg);
          perfs.push({ survivor:s, tribe, score });
        });
      });
      perfs.sort((a,b)=>b.score-a.score);
      const mvp = perfs[0], lvp = perfs[perfs.length-1];

      const line = createElement('div', { style:`display:flex; justify-content:space-between; gap:10px; flex-wrap:wrap;` });
      const mk = (tag, p) => `${tag}: ${p?.survivor?.firstName || '—'} (${p?.tribe?.tribeName || p?.tribe?.name || ''})`;
      line.append(createElement('div', {}, mk('MVP', mvp)), createElement('div', {}, mk('LVP', lvp)));
      row.appendChild(line);

      content.appendChild(row);
    });

    card.append(title, content, close);
    overlay.appendChild(card);
    this.container.appendChild(overlay);
  }
};

export default FirstContactView;