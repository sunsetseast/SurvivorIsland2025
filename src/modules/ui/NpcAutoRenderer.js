import npcLocationSystem from '../systems/NpcLocationSystem.js';
import { gameManager } from '../core/index.js';
import eventManager, { GameEvents } from '../core/EventManager.js';
import { createElement } from '../utils/index.js';
import { normalizeLocationKey, physicalCampLocation } from '../locations/LocationUtils.js';
import CampInteractionSystem from '../systems/CampInteractionSystem.js';
import { campGroups, clusterPortraitLayout, publicCampCues, placeName, LOCATION_MOOD } from './CampPresentation.js';
import { buildNearbyScramble, buildPlayerScrambleRead, isScramble, scrambleCountdown } from './ScramblePresentation.js';
import { ScrambleNotebook } from './ScrambleNotebook.js';
import { routeBetween } from '../systems/CampActivitySystem.js';
import { APPROACH_SECONDS } from '../systems/CampInteractionSystem.js';
import { CampNarrationQueue, narrationBeat, NARRATION } from './CampNarration.js';

// One renderer owns every physical camp location. Layout/labels are projected
// from semantic state; only transient DOM/focus lives here.
export class NpcAutoRenderer {
  constructor(gm = null) {
    this._gm = gm; this.initialized = false; this.lastViewName = null;
    this.signature = null; this.unsubscribers = [];
    this.sheet = null; this.narration = new CampNarrationQueue();
  }
  get gm() { return this._gm || gameManager; }
  initialize() {
    if (this.initialized) return;
    this.initialized = true;
    this.notebook = new ScrambleNotebook(this.gm);
    this.interactions = new CampInteractionSystem(this.gm);
    this.gm.systems.campInteractionSystem = this.interactions;
    const on = (event, fn) => this.unsubscribers.push(eventManager.subscribe(event, fn));
    const resize = () => {
      if (this.resizeFrame) return;
      this.resizeFrame = requestAnimationFrame(() => { this.resizeFrame = null; this.signature = null; this.refresh(); });
    };
    globalThis.window?.addEventListener?.('resize', resize);
    this.unsubscribers.push(() => globalThis.window?.removeEventListener?.('resize', resize));
    on(GameEvents.CAMP_VIEW_LOADED, ({ viewName }) => {
      if (this.helping?.view !== normalizeLocationKey(viewName)) this.helping = null;
      this.closeSheet(false); this.lastViewName = normalizeLocationKey(viewName); this.renderFor(this.lastViewName);
    });
    on('npc:locationUpdated', ({ reason } = {}) => { if (!reason?.startsWith('activity:')) this.refresh(); });
    on('camp:activityChanged', () => this.refresh());
    on('camp:timeAdvanced', () => {
      if (this.awaitReadCueClose && !this.gm.systems.campActivitySystem.conversation) {
        if (this.livePresentationCue) this.livePresentationCue.at = this.gm.dayTimer;
        this.awaitReadCueClose = false;
      }
      this.refresh(); this.narrate();
    });
    on('camp:readUpdated', () => { this.refresh(); this.readCue(); });
    on('camp:travelPresented', ({ from, to, seconds }) => {
      this.livePresentationCue = { at: this.gm.dayTimer, text: `${placeName(from)} → ${placeName(to)} · ${seconds < 60 ? `${seconds} sec` : `${Math.floor(seconds / 60)} min${seconds % 60 ? ` ${seconds % 60} sec` : ''}`}` };
      const beat = this.npcLayer?.querySelector('.camp-observable-beat'); if (beat) beat.textContent = this.presentationText();
    });
    on(GameEvents.CAMP_EVENT_STARTED, () => { this.interactions.missDepartures(); this.closeSheet(); this.resetNarration(); this.clear(); });
    on(GameEvents.GAME_STATE_CHANGED, ({ newState }) => { if (newState !== 'camp') { this.interactions.missDepartures(); this.closeSheet(false); this.resetNarration(); this.clear(); } });
    on(GameEvents.GAME_PHASE_CHANGED, () => { this.interactions.missDepartures(); this.closeSheet(); this.resetNarration(); this.refresh(); });
    on(GameEvents.GAME_LOADED, () => {
      this.notebook.close(false); this.restoredAt = this.gm.dayTimer; this.awaitReadCueClose = false; this.livePresentationCue = null;
      this.seedReadCues(); this.lastCountdownTier = scrambleCountdown(this.gm.dayTimer).tier;
      this.closeSheet(); this.helping = null; this.expandedMinigameView = null; this.interactions.watching = null; this.signature = null;
      if (globalThis.window?.campScreen) window.campScreen.campHelp = null;
      // Rebuild groups, but do not replay old live announcements after reload.
      this.resetNarration();
      this.refresh();
    });
    on(GameEvents.TRIBES_CREATED, () => {
      (this.gm.systems.npcLocationSystem || npcLocationSystem).assignLocations(this.gm.gamePhase || 'preChallenge');
    });
  }
  clear() {
    document.getElementById('npc-layer')?.replaceChildren(); this.signature = null;
  }
  refresh() {
    if (this.sheet?.groupId) {
      const groups = campGroups(this.gm, this.lastViewName);
      if (!groups.some(g => g.id === this.sheet.groupId && g.activityId === this.sheet.activityId)) this.closeSheet();
    }
    if (this.lastViewName && this.gm.gameState === 'camp') this.renderFor(this.lastViewName);
  }
  renderFor(viewName) {
    this.lastViewName = normalizeLocationKey(viewName);
    const camp = document.getElementById('camp-content');
    if (!camp) return;
    const place = physicalCampLocation(this.lastViewName);
    if (!place || this.gm.flags?.campEventActive) { this.clear(); return; }
    let layer = camp.querySelector('#npc-layer');
    if (!layer) { layer = createElement('div', { id: 'npc-layer' }); camp.appendChild(layer); this.signature = null; }
    this.npcLayer = layer;
    let groups = this.interactions?.available ? this.interactions.seeGroups(this.lastViewName) : campGroups(this.gm, this.lastViewName);
    const post = isScramble(this.gm);
    document.getElementById('camp-screen')?.classList.toggle('scramble-camp', post);
    const projection = post ? buildNearbyScramble(this.gm, this.lastViewName) : null;
    if (post) { groups = projection.groups; this.phaseCue(); }
    const departures = this.interactions?.recentDepartures() || [];
    const width = Math.min(350, Math.max(180, (camp.clientWidth || 375) - 24));
    const handsOn = this.lastViewName !== place;
    const minigame = handsOn || place === 'tribeFlag' || this.helping?.view === this.lastViewName;
    const expanded = this.expandedMinigameView === this.lastViewName;
    const cues = publicCampCues(groups, this.gm.getPlayerTribe?.());
    const signature = JSON.stringify({ groups, scramble: post ? { invitation: projection.invitation, conversation: this.gm.systems.campActivitySystem.conversation?.activityId, tier: scrambleCountdown(this.gm.dayTimer).tier } : null, departures: departures.map(e => e.id), cues, width, minigame, expanded });
    if (signature === this.signature && layer.firstChild) return;
    const focusKey = layer.contains(document.activeElement) ? document.activeElement?.dataset?.focusKey : null;
    const scrollTop = layer.querySelector('.camp-presence')?.scrollTop || 0;
    const previousCards = new Map([...layer.querySelectorAll('.camp-cluster')].map(card => [card.dataset.projection, card]));
    const previousPeople = new Set([...layer.querySelectorAll('[data-npc-id]')].map(node => node.dataset.npcId));
    this.signature = signature;
    layer.replaceChildren();
    const rail = createElement('section', { className: `npc-icon-container camp-presence ${minigame ? `minigame ${expanded ? 'expanded' : 'collapsed'}` : ''}`, 'aria-label': 'People nearby',
      dataset: { location: place }, style: { '--camp-tribe-color': this.gm.getPlayerTribe?.()?.color || this.gm.getPlayerTribe?.()?.tribeColor || '#d7b36c' } });
    const header = createElement('div', { className: 'camp-presence-heading' }, LOCATION_MOOD[place] || 'Nearby');
    if (minigame) {
      const toggle = this.action(`${this.helping ? `Helping ${this.helping.name} · ` : ''}People nearby · ${groups.reduce((n,g) => n + g.members.length, 0)}`, 'nearby-toggle', () => {
        this.expandedMinigameView = expanded ? null : this.lastViewName; this.signature = null; this.refresh();
      });
      toggle.setAttribute('aria-expanded', String(expanded)); header.replaceChildren(toggle);
    }
    rail.appendChild(header);
    rail.appendChild(createElement('p', { className: 'camp-observable-beat', role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' }));
    rail.querySelector('.camp-observable-beat').textContent = this.presentationText();
    layer.appendChild(rail);
    const contentWidth = rail.clientWidth - 2 * (parseFloat(getComputedStyle(rail).paddingLeft) || 0);
    const clusters = createElement('div', { className: 'camp-clusters' });
    const groupWidth = Math.min(150, Math.max(120, (contentWidth - 12) / 2));
    for (const [groupIndex, group] of groups.entries()) {
      const cardWidth = post || group.members.length > 1 ? contentWidth : groupWidth;
      const projection = JSON.stringify({ group, cardWidth, handsOn, cue: cues[groupIndex] });
      const previous = previousCards.get(projection);
      if (previous) { clusters.appendChild(previous); continue; }
      const card = createElement('article', { className: `camp-cluster ${group.engaged ? 'engaged' : 'nearby'} ${group.privacy === 'private' ? 'quiet' : ''} ${post && group.members.length === 1 ? 'scramble-solo' : ''}`,
        style: { width: `${cardWidth}px` }, dataset: { groupId: group.id, projection } });
      const layout = clusterPortraitLayout(group.members.length, cardWidth);
      const portraits = createElement('div', { className: 'camp-portraits', style: { height: `${layout.height}px` } });
      group.members.forEach((member, index) => {
        const box = layout.boxes[index];
        const holder = createElement('div', { className: `camp-person ${previousPeople.has(String(member.id)) || this.restoredAt === this.gm.dayTimer ? '' : 'camp-arriving'}`,
          style: { left: `${box.x}px`, top: `${box.y}px` } });
        const button = createElement('button', { type: 'button', className: 'npc-icon camp-portrait',
          'aria-label': `${member.name}: ${member.label}. ${handsOn ? 'Nearby' : group.social ? 'Approach group' : 'Talk'}`,
          disabled: handsOn || member.busy, dataset: { npcId: member.id, focusKey: `portrait:${member.id}` } });
        const initial = () => createElement('span', { className: 'camp-portrait-initial', 'aria-hidden': 'true' }, member.name.slice(0,1));
        if (member.avatarUrl) {
          const image = createElement('img', { src: member.avatarUrl, alt: '', loading: 'lazy' });
          image.addEventListener('error', () => button.replaceChildren(initial()), { once: true });
          button.appendChild(image);
        } else button.appendChild(initial());
        button.addEventListener('click', () => group.social ? this.openGroup(group) : this.talk(member, group));
        holder.appendChild(button);
        holder.appendChild(createElement('span', { className: 'camp-person-name' }, member.name));
        if (member.cue) holder.appendChild(createElement('span', { className: 'camp-work-cue', 'aria-hidden': 'true', title: member.label }, member.cue));
        portraits.appendChild(holder);
      });
      card.appendChild(portraits);
      if (post) card.appendChild(createElement('h3', { className: 'scramble-group-names' }, group.names));
      const label = createElement('p', { className: 'camp-activity-label' });
      if (group.privacy === 'private') label.appendChild(createElement('span', { className: 'camp-private-glyph', 'aria-hidden': 'true' }, '◌ '));
      label.appendChild(document.createTextNode(group.social ? group.label : group.members[0].label));
      card.appendChild(label);
      if (cues[groupIndex]) card.appendChild(createElement('p', { className: 'camp-public-cue' }, cues[groupIndex]));
      const actions = createElement('div', { className: 'camp-context-actions' });
      if (post && group.meetingId && !handsOn) {
        actions.appendChild(this.action('Join', `meeting:${group.meetingId}`, () => { this.closeSheet(false); this.gm.systems.strategyPhaseSystem.scramble.attend(group.meetingId); this.focusConversation(); }));
        actions.lastChild.setAttribute('aria-label','Join alliance meeting');
      } else if (!handsOn && group.social && this.interactions?.available) {
        actions.appendChild(this.action('Approach', `group:${group.id}`, () => this.openGroup(group)));
      } else if (post && !handsOn && !group.members[0].busy) {
        actions.appendChild(this.action('Talk', `talk:${group.members[0].id}`, () => this.talk(group.members[0], group)));
      } else if (!handsOn && group.members[0].helpView && this.interactions?.available) {
        const member = group.members[0];
        actions.appendChild(this.action('Help', `help:${member.id}`, () => {
          if (!this.interactions.currentGroup(group) || !this.interactions.visible(member.id)) return;
          this.helping = { view: member.helpView, name: member.name };
          window.campScreen?.loadView?.(member.helpView, { help: { npcId: member.id, activityId: group.activityId, location: group.location } });
          document.querySelector('#action-buttons button')?.focus({ preventScroll: true });
        }));
      }
      card.appendChild(actions); clusters.appendChild(card);
    }
    const strategy = this.gm.systems.strategyPhaseSystem;
    if (!handsOn && strategy?.isActive && this.gm.gamePhase === 'postChallenge') {
      const invitation = projection?.invitation;
      if (invitation) {
        const person = this.interactions.person(invitation.npcId);
        const notice = createElement('div', {className:'scramble-invitation'});
        notice.appendChild(createElement('strong', {}, `${person.firstName} came looking for you`));
        notice.appendChild(createElement('p', {}, '“Can we talk?”'));
        const talk = this.action('Talk', `invite:${invitation.activityId}`, () => {
          this.closeSheet(false); this.gm.systems.conversationSystem.startNpcConversation(person, strategy.scramble.invitation?.purpose,
            {initiatedByNpc:true, approachAccepted:true, context:{phase:'post'}, location:this.gm.player.location}); this.focusConversation();
        }); talk.setAttribute('aria-label', `${person.firstName} wants to talk`); notice.appendChild(talk);
        notice.appendChild(this.action('Not now', `decline:${invitation.activityId}`, () => { this.gm.systems.conversationSystem._handleApproachDeclined(person); this.focusConversation(); this.refresh(); }));
        rail.appendChild(notice);
      }
      const reservation = this.gm.systems.campActivitySystem.conversation;
      if (reservation && !document.querySelector('#conversation-overlay')) {
        rail.appendChild(this.action('Resume conversation', `resume:${reservation.activityId}`, () => {
          if(reservation.checkpoint?.allianceOpened)this.gm.systems.conversationSystem.startAllianceConversation(reservation.npcId,reservation.checkpoint.allianceId,{allianceProposalId:reservation.checkpoint.allianceProposalId,location:reservation.location,groupParticipantIds:reservation.groupIds});
          else this.gm.systems.conversationSystem.startPlayerConversation({ npcId: reservation.npcId, phase: 'post', context: { location: reservation.location } });
          this.focusConversation();
        }));
      }
    }
    if (!groups.length) clusters.appendChild(createElement('p', { className: 'camp-empty' }, 'A quiet moment here.'));
    rail.appendChild(clusters);
    if (departures.length && !handsOn) {
      const routes = createElement('div', { className: 'camp-departures' });
      routes.appendChild(createElement('p', { className: 'camp-departure-heading' }, 'Just left'));
      for (const entry of departures) {
        const person = this.interactions.person(entry.actorId);
        const trail = createElement('div', { className: 'camp-witnessed-departure' });
        const names = [person, ...(entry.participantIds || []).map(id => this.interactions.person(id))].filter(Boolean);
        const portraits = createElement('div', { className: 'camp-departure-portraits', 'aria-hidden': 'true' });
        for (const p of names) if (p.avatarUrl) portraits.appendChild(createElement('img', { src: p.avatarUrl, alt: '', className: 'camp-leaving-portrait' }));
        trail.appendChild(portraits);
        const description = createElement('div', { className: 'camp-departure-description' });
        description.appendChild(createElement('strong', {}, names.map(p => p.firstName).join(' & ')));
        const direction = createElement('span', {});
        direction.appendChild(createElement('span', { 'aria-hidden': 'true' }, '↗ '));
        direction.appendChild(document.createTextNode(`Heading toward ${placeName(entry.location)}`));
        description.appendChild(direction); trail.appendChild(description);
        trail.appendChild(this.action(`Follow ${person.firstName} · 2 min`, `follow:${entry.id}`, () => {
          const result = this.interactions.follow(entry); this.refresh(); this.narrate();
          if (this.interactions.available) this.showResult(result.text);
        }));
        routes.appendChild(trail);
      }
      rail.insertBefore(routes, clusters);
    }
    if (post && !handsOn) {
      const tools = createElement('nav', { className:'scramble-camp-tools', 'aria-label':'Camp actions' });
      const reservation = this.gm.systems.campActivitySystem.conversation;
      if (!reservation) tools.appendChild(this.action('Move', 'scramble:move', () => this.openMove()));
      tools.appendChild(this.action('What I Know', 'scramble:read', () => this.notebook.open()));
      if (!reservation) tools.appendChild(this.action('Wait · 1 minute', 'scramble:wait', () => { this.gm.consumeCampTime(60,{source:'scramble_wait'}); this.refresh(); }));
      rail.appendChild(tools);
    }
    rail.scrollTop = scrollTop;
    if (focusKey) {
      const next = [...layer.querySelectorAll('[data-focus-key]')].find(e => e.dataset.focusKey === focusKey) ||
        layer.querySelector('button:not(:disabled)') || document.querySelector('.camp-nav-button');
      next?.focus({ preventScroll: true });
    }
  }
  openMove() {
    const origin = this.gm.player.location;
    const destinations = ['beach','shelter','campfire','waterWell','rockyShore','jungleTrail','mountainTrail','waterfallTrail','tribeFlag'];
    const routes = destinations.map(to => ({to,seconds:routeBetween(origin,to).length*30})).filter(r => r.seconds);
    this.openSheet('Move around camp', `You’re at ${placeName(origin)}.`, routes.map(r => [`${placeName(r.to)} · ${r.seconds<60?`${r.seconds} sec`:`${r.seconds/60} min`}`, () => { this.closeSheet(false); window.campScreen?.loadView(r.to); }]));
  }
  presentationText() {
    if (this.narration.current?.text) return this.narration.current.text;
    return this.livePresentationCue && this.livePresentationCue.at - this.gm.dayTimer <= 60 ? this.livePresentationCue.text : '';
  }
  seedReadCues() {
    const read = buildPlayerScrambleRead(this.gm);
    this.readCueKeys = new Set([...read.yourPromises,...read.contradictions].map(r=>r.key));
  }
  readCue() {
    if (!isScramble(this.gm)) return;
    const read = buildPlayerScrambleRead(this.gm), keys = this.readCueKeys || new Set();
    const promise = read.yourPromises.find(r=>!keys.has(r.key)), conflict = read.contradictions.find(r=>!keys.has(r.key));
    this.seedReadCues();
    if (!promise && !conflict) return;
    this.livePresentationCue = {at:this.gm.dayTimer,text:promise ? `Promise remembered. ${promise.text}` : `Different stories. ${conflict.text}`};
    this.awaitReadCueClose = Boolean(this.gm.systems.campActivitySystem.conversation);
    const beat = this.npcLayer?.querySelector('.camp-observable-beat'); if(beat) beat.textContent=this.presentationText();
  }
  phaseCue() {
    const tier=scrambleCountdown(this.gm.dayTimer).tier;
    if (this.lastCountdownTier && !['final','last'].includes(this.lastCountdownTier) && ['final','last'].includes(tier))
      this.livePresentationCue={at:this.gm.dayTimer,text:'Final scramble. Tribal is close.'};
    else if(!this.lastCountdownTier && this.gm.dayTimer===3600) this.livePresentationCue={at:3600,text:'Back at camp. One hour before Tribal. Time moves when you act.'};
    this.lastCountdownTier=tier;
  }
  action(text, key, callback) {
    const button = createElement('button', { type: 'button', className: 'camp-context-button', dataset: { focusKey: key } }, text);
    let running = false;
    button.addEventListener('click', () => {
      if (button.disabled || running || !button.isConnected) return;
      running = true;
      try { callback(); } finally { running = false; }
    }); return button;
  }
  talk(member, group, context = {}) {
    this.closeSheet(false);
    if (this.gm.systems.campActivitySystem?.active) {
      if (!this.interactions.currentGroup(group) || !this.interactions.visible(member.id)) return;
      this.gm.systems.conversationSystem?.startPlayerConversation?.({ npcId: member.id, phase: this.gm.gamePhase === 'postChallenge' ? 'post' : 'pre', context: { location: group.location, ...context } });
      this.focusConversation();
    } else {
      const survivor = this.gm.getPlayerTribe?.()?.members.find(p => String(p.id) === String(member.id));
      eventManager.publish(GameEvents.NPC_CONFRONTATION, { survivor, location: group.location });
    }
  }
  focusConversation() {
    const conversation = this.gm.systems.conversationSystem;
    const session = conversation?.nodeSession || conversation?.conversationSession;
    const first = document.querySelector('#conversation-overlay button:not(:disabled)');
    if (!session || !first) return;
    first.focus({ preventScroll: true });
    const previousClose = session.onClose;
    session.onClose = (...args) => {
      try { previousClose?.(...args); } finally {
        // The existing close hook runs before activities are released. Wait
        // for that synchronous work before focusing a reconstructed control.
        queueMicrotask(() => {
          if (!this.interactions.available || document.querySelector('#conversation-overlay')) return;
          this.refresh();
          (this.npcLayer?.querySelector('button:not(:disabled)') || document.querySelector('.camp-nav-button'))?.focus({ preventScroll: true });
        });
      }
    };
  }
  openGroup(group) {
    if (!this.interactions?.available) return;
    const names = group.members.map(p => p.name).join(' & ');
    this.openSheet(names, group.label, [
      ['Approach', () => {
        const result = this.interactions.approach(group); this.refresh(); this.narrate();
        if (!this.interactions.available) return;
        const responseGroup = campGroups(this.gm, this.lastViewName).find(g => g.members.some(p => String(p.id) === String(group.members[0].id)));
        this.openSheet(names, result.text, [
          ...(result.join ? [['Join conversation', () => {
            this.closeSheet(false); this.interactions.join(group, result.context); this.refresh(); this.focusConversation();
          }]] : result.relocated || result.movedOn || !responseGroup ? [] : [['Talk', () => this.talk(responseGroup.members[0], responseGroup, { interruptedGroup: true, observedPrivacy: group.privacy })]]),
          ['Leave', () => this.closeSheet()]
        ]);
        const anchor = result.join ? group : !result.relocated && !result.movedOn ? responseGroup : null;
        if (anchor && this.sheet) { this.sheet.groupId = anchor.id; this.sheet.activityId = anchor.activityId; }
      }],
      ['Watch nearby · 1 minute', () => {
        const result = this.interactions.watch(group); this.refresh(); this.narrate();
        if (this.interactions.available) this.showResult(result.text);
      }],
      ['Leave', () => this.closeSheet()]
    ]);
    if (this.sheet) {
      const status = this.sheet.dialog.querySelector('p'); status.classList.add('camp-sheet-status');
      status.after(createElement('p', { className: 'camp-sheet-helper' }, `Approaching takes about ${APPROACH_SECONDS} seconds.`));
      this.sheet.groupId = group.id; this.sheet.activityId = group.activityId;
    }
  }
  openSheet(title, body, actions) {
    const previous = this.sheet?.returnFocus || document.activeElement;
    this.closeSheet(false);
    const dialog = createElement('dialog', { className: 'camp-encounter-sheet', 'aria-labelledby': 'camp-encounter-title' });
    dialog.appendChild(createElement('h2', { id: 'camp-encounter-title' }, title));
    dialog.appendChild(createElement('p', {}, body));
    const buttons = createElement('div', { className: 'camp-sheet-actions' });
    for (const [label, callback] of actions) buttons.appendChild(this.action(label, label, callback));
    dialog.appendChild(buttons);
    dialog.addEventListener('cancel', event => { event.preventDefault(); this.closeSheet(); });
    dialog.addEventListener('click', event => { if (event.target === dialog) {
      const b = dialog.getBoundingClientRect(); if (event.clientX < b.left || event.clientX > b.right || event.clientY < b.top || event.clientY > b.bottom) this.closeSheet();
    } });
    document.body.appendChild(dialog); this.sheet = { dialog, returnFocus: previous };
    dialog.showModal(); buttons.querySelector('button')?.focus();
  }
  showResult(text) { this.openSheet(isScramble(this.gm) && this.interactions.watching ? `Watching ${placeName(this.gm.player.location)}` : 'Around camp', text, [['Back to camp', () => this.closeSheet()]]); }
  closeSheet(restoreFocus = true) {
    if (!this.sheet) return;
    const { dialog, returnFocus } = this.sheet; this.sheet = null;
    dialog.close(); dialog.remove();
    if (restoreFocus) {
      if (returnFocus?.isConnected && returnFocus !== document.body && !returnFocus.disabled) returnFocus.focus({ preventScroll: true });
      else (this.npcLayer?.querySelector('button:not(:disabled)') || document.querySelector('.camp-nav-button'))?.focus({ preventScroll: true });
    }
  }
  resetNarration() {
    clearTimeout(this.narrationTimer); this.narrationTimer = null;
    this.narration.reset(this.ownedObservations());
    const node = this.npcLayer?.querySelector('.camp-observable-beat');
    if (node) node.textContent = '';
    this.lastNarrationPhase = this.gm.systems.campActivitySystem?.phaseId;
  }
  ownedObservations() {
    return this.gm.systems.socialMemorySystem?.getCampObservations?.(this.gm.getPlayerSurvivor?.()?.id, { day: this.gm.day }) || [];
  }
  narrate() {
    if (!this.interactions?.available) { this.resetNarration(); return; }
    const phase = this.gm.systems.campActivitySystem.phaseId;
    if (this.lastNarrationPhase !== phase) {
      this.lastNarrationPhase = phase;
      clearTimeout(this.narrationTimer); this.narrationTimer = null;
      this.narration.reset();
    }
    const owned = this.ownedObservations(), playerId = this.gm.getPlayerSurvivor()?.id;
    const name = id => String(id) === String(playerId) ? 'You' : this.gm.getPlayerTribe()?.members.find(p => String(p.id) === String(id))?.firstName || 'Someone';
    const now = Date.now();
    this.narration.ingest(owned, entry => {
      const beat = narrationBeat(entry, owned, name, playerId);
      const claim = entry.type === 'overheard_statement' && this.gm.systems.socialMemorySystem.getCampClaims(playerId)
        .find(c => c.acquisition === 'overheard' && String(c.sourceId) === String(entry.actorId) && String(c.subjectId) === String(entry.subjectId) && c.campTime === entry.campTime);
      if (beat && claim) beat.text = this.interactions.statementText({ firstName: name(entry.actorId) }, claim);
      return beat;
    }, this.gm.dayTimer, now);
    const beat = this.narration.advance(this.gm.dayTimer, now);
    const node = this.npcLayer?.querySelector('.camp-observable-beat');
    if (node && node.textContent !== this.presentationText()) node.textContent = this.presentationText();
    if (!this.narrationTimer && beat) this.narrationTimer = setTimeout(() => {
      this.narrationTimer = null; this.narrate();
    }, Math.max(1, NARRATION.dwellMs - (now - beat.displayedAt)));
  }
  dispose() {
    this.resetNarration(); this.closeSheet(false); this.notebook?.close(false); this.unsubscribers.forEach(unsubscribe => unsubscribe());
    this.unsubscribers = []; this.initialized = false;
    if (this.resizeFrame) cancelAnimationFrame(this.resizeFrame); this.resizeFrame = null; this.clear();
  }
}
export default new NpcAutoRenderer();
