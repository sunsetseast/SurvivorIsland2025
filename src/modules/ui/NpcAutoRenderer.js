import npcLocationSystem from '../systems/NpcLocationSystem.js';
import { gameManager } from '../core/index.js';
import eventManager, { GameEvents } from '../core/EventManager.js';
import { createElement } from '../utils/index.js';
import { normalizeLocationKey, physicalCampLocation } from '../locations/LocationUtils.js';
import CampInteractionSystem from '../systems/CampInteractionSystem.js';
import { campGroups, clusterPortraitLayout, campObservationLine, LOCATION_MOOD } from './CampPresentation.js';

// One renderer owns every physical camp location. Layout/labels are projected
// from semantic state; only transient DOM/focus lives here.
export class NpcAutoRenderer {
  constructor(gm = null) {
    this._gm = gm; this.initialized = false; this.lastViewName = null;
    this.signature = null; this.seenNarration = new Set(); this.unsubscribers = [];
    this.sheet = null; this.lastBeatAt = Infinity;
  }
  get gm() { return this._gm || gameManager; }
  initialize() {
    if (this.initialized) return;
    this.initialized = true;
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
      this.closeSheet(false); this.lastViewName = normalizeLocationKey(viewName); this.renderFor(this.lastViewName);
    });
    on('npc:locationUpdated', () => this.refresh());
    on('camp:timeAdvanced', () => { this.refresh(); this.narrate(); });
    on(GameEvents.CAMP_EVENT_STARTED, () => { this.closeSheet(false); this.clear(); });
    on(GameEvents.GAME_STATE_CHANGED, ({ newState }) => { if (newState !== 'camp') { this.closeSheet(false); this.clear(); } });
    on(GameEvents.GAME_PHASE_CHANGED, () => { this.closeSheet(false); this.refresh(); });
    on(GameEvents.GAME_LOADED, () => {
      this.closeSheet(false); this.interactions.watching = null; this.signature = null;
      // Rebuild groups, but do not replay old live announcements after reload.
      this.seenNarration = new Set(this.ownedObservations().map(e => e.id));
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
    const groups = this.interactions?.available ? this.interactions.seeGroups(this.lastViewName) : campGroups(this.gm, this.lastViewName);
    const departures = this.interactions?.recentDepartures() || [];
    const width = Math.min(350, Math.max(180, (camp.clientWidth || 375) - 24));
    const handsOn = this.lastViewName !== place;
    const minigame = handsOn || place === 'tribeFlag';
    const expanded = this.expandedMinigameView === this.lastViewName;
    const signature = JSON.stringify({ groups, departures: departures.map(e => e.id), width, minigame, expanded });
    if (signature === this.signature && layer.firstChild) return;
    const focusKey = layer.contains(document.activeElement) ? document.activeElement?.dataset?.focusKey : null;
    const scrollTop = layer.querySelector('.camp-presence')?.scrollTop || 0;
    this.signature = signature;
    layer.replaceChildren();
    const rail = createElement('section', { className: `npc-icon-container camp-presence ${minigame ? `minigame ${expanded ? 'expanded' : 'collapsed'}` : ''}`, 'aria-label': 'People nearby',
      dataset: { location: place }, style: { '--camp-tribe-color': this.gm.getPlayerTribe?.()?.color || this.gm.getPlayerTribe?.()?.tribeColor || '#d7b36c' } });
    const header = createElement('div', { className: 'camp-presence-heading' }, LOCATION_MOOD[place] || 'Nearby');
    if (minigame) {
      const toggle = this.action(`People nearby · ${groups.reduce((n,g) => n + g.members.length, 0)}`, 'nearby-toggle', () => {
        this.expandedMinigameView = expanded ? null : this.lastViewName; this.signature = null; this.refresh();
      });
      toggle.setAttribute('aria-expanded', String(expanded)); header.replaceChildren(toggle);
    }
    rail.appendChild(header);
    rail.appendChild(createElement('p', { className: 'camp-observable-beat', role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' }));
    layer.appendChild(rail);
    const contentWidth = rail.clientWidth - 2 * (parseFloat(getComputedStyle(rail).paddingLeft) || 0);
    const clusters = createElement('div', { className: 'camp-clusters' });
    const groupWidth = Math.min(150, Math.max(120, (contentWidth - 12) / 2));
    for (const group of groups) {
      const cardWidth = group.members.length > 1 ? contentWidth : groupWidth;
      const card = createElement('article', { className: `camp-cluster ${group.engaged ? 'engaged' : 'nearby'} ${group.privacy === 'private' ? 'quiet' : ''}`,
        style: { width: `${cardWidth}px` }, dataset: { groupId: group.id } });
      const layout = clusterPortraitLayout(group.members.length, cardWidth);
      const portraits = createElement('div', { className: 'camp-portraits', style: { height: `${layout.height}px` } });
      group.members.forEach((member, index) => {
        const box = layout.boxes[index];
        const holder = createElement('div', { className: `camp-person ${member.travelling ? 'travelling' : ''}`,
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
        portraits.appendChild(holder);
      });
      card.appendChild(portraits);
      card.appendChild(createElement('p', { className: 'camp-activity-label' },
        group.social ? `${group.privacy === 'private' ? '◌ ' : ''}${group.label}` : group.members[0].label));
      const actions = createElement('div', { className: 'camp-context-actions' });
      if (!handsOn && group.social && this.interactions?.available) {
        actions.appendChild(this.action('Approach', `group:${group.id}`, () => this.openGroup(group)));
      } else if (!handsOn && group.members[0].helpView && this.interactions?.available) {
        const member = group.members[0];
        actions.appendChild(this.action('Help', `help:${member.id}`, () => {
          if (!this.interactions.visible(member.id)) return;
          window.campScreen?.loadView?.(member.helpView);
        }));
      }
      card.appendChild(actions); clusters.appendChild(card);
    }
    if (!groups.length) clusters.appendChild(createElement('p', { className: 'camp-empty' }, 'A quiet moment here.'));
    rail.appendChild(clusters);
    if (departures.length && !handsOn) {
      const routes = createElement('div', { className: 'camp-departures' });
      for (const entry of departures) {
        const person = this.interactions.person(entry.actorId);
        routes.appendChild(this.action(`Follow ${person.firstName}`, `follow:${entry.id}`, () => {
          const result = this.interactions.follow(entry); this.refresh(); this.showResult(result.text);
        }));
      }
      rail.insertBefore(routes, clusters);
    }
    rail.scrollTop = scrollTop;
    if (focusKey) {
      const next = [...layer.querySelectorAll('[data-focus-key]')].find(e => e.dataset.focusKey === focusKey) ||
        layer.querySelector('button:not(:disabled)') || document.querySelector('.camp-nav-button');
      next?.focus({ preventScroll: true });
    }
  }
  action(text, key, callback) {
    const button = createElement('button', { type: 'button', className: 'camp-context-button', dataset: { focusKey: key } }, text);
    button.addEventListener('click', callback); return button;
  }
  talk(member, group, context = {}) {
    this.closeSheet(false);
    if (this.gm.systems.campActivitySystem?.active) {
      if (!this.interactions.visible(member.id)) return;
      this.gm.systems.conversationSystem?.startPlayerConversation?.({ npcId: member.id, phase: 'pre', context: { location: group.location, ...context } });
    } else {
      const survivor = this.gm.getPlayerTribe?.()?.members.find(p => String(p.id) === String(member.id));
      eventManager.publish(GameEvents.NPC_CONFRONTATION, { survivor, location: group.location });
    }
  }
  openGroup(group) {
    if (!this.interactions?.available) return;
    if (this.lastNarrationPhase !== this.gm.systems.campActivitySystem.phaseId) {
      this.lastNarrationPhase = this.gm.systems.campActivitySystem.phaseId; this.lastBeatAt = Infinity;
    }
    const names = group.members.map(p => p.name).join(' & ');
    this.openSheet(names, `${group.label}. You can walk over, linger nearby, or leave.`, [
      ['Approach', () => {
        const result = this.interactions.approach(group); this.refresh();
        this.openSheet(names, result.text, [
          ...(result.join ? [['Join conversation', () => {
            this.closeSheet(false); this.interactions.join(group, result.context); this.refresh();
          }]] : result.relocated ? [] : [['Talk', () => this.talk(group.members[0], group, { interruptedGroup: true, observedPrivacy: group.privacy })]]),
          ['Leave', () => this.closeSheet()]
        ]);
        if (result.join && this.sheet) { this.sheet.groupId = group.id; this.sheet.activityId = group.activityId; }
      }],
      ['Watch nearby · 1 minute', () => {
        const result = this.interactions.watch(group); this.refresh(); this.showResult(result.text);
      }],
      ['Leave', () => this.closeSheet()]
    ]);
    if (this.sheet) { this.sheet.groupId = group.id; this.sheet.activityId = group.activityId; }
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
  showResult(text) { this.openSheet('Around camp', text, [['Back to camp', () => this.closeSheet()]]); }
  closeSheet(restoreFocus = true) {
    if (!this.sheet) return;
    const { dialog, returnFocus } = this.sheet; this.sheet = null;
    dialog.close(); dialog.remove();
    if (restoreFocus) {
      if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
      else (this.npcLayer?.querySelector('button:not(:disabled)') || document.querySelector('.camp-nav-button'))?.focus({ preventScroll: true });
    }
  }
  ownedObservations() {
    return this.gm.systems.socialMemorySystem?.getCampObservations?.(this.gm.getPlayerSurvivor?.()?.id, { day: this.gm.day }) || [];
  }
  narrate() {
    if (!this.interactions?.available) return;
    const name = id => this.gm.getPlayerTribe()?.members.find(p => String(p.id) === String(id))?.firstName || 'Someone';
    const pending = this.ownedObservations().filter(e => !this.seenNarration.has(e.id));
    for (const e of pending) this.seenNarration.add(e.id);
    if (this.seenNarration.size > 150) this.seenNarration = new Set(this.ownedObservations().map(e => e.id));
    const priority = e => ['idol_search_seen', 'conversation_guarded', 'overheard_name', 'overheard_fragment', 'overheard_statement', 'public_conflict'].includes(e.type) ? 3 :
      e.type === 'departed' && (e.participantIds?.length || (this.gm.systems.socialMemorySystem.getCampImpression(this.gm.player?.id, e.actorId, 'absence')?.count || 0) >= 2) ? 2 :
      e.type === 'seen_together' || e.type === 'arrived' ? 1 : 0;
    const beat = pending.filter(e => e.origin !== 'hearsay' && priority(e) > 0 &&
      e.campTime - this.gm.dayTimer < 180).sort((a, b) => priority(b) - priority(a))[0];
    if (!beat || priority(beat) < 3 && this.lastBeatAt - this.gm.dayTimer < 120) return;
    const heardClaim = beat.type === 'overheard_statement' && this.gm.systems.socialMemorySystem.getCampClaims(this.gm.player?.id)
      .find(claim => claim.acquisition === 'overheard' && String(claim.sourceId) === String(beat.actorId) &&
        String(claim.subjectId) === String(beat.subjectId) && claim.campTime === beat.campTime);
    const text = heardClaim ? this.interactions.statementText({firstName:name(beat.actorId)}, heardClaim) : campObservationLine(beat, name);
    if (text) {
      const node = this.npcLayer?.querySelector('.camp-observable-beat');
      if (node) node.textContent = text;
      this.lastBeatAt = this.gm.dayTimer;
    }
  }
  dispose() {
    this.closeSheet(false); this.unsubscribers.forEach(unsubscribe => unsubscribe());
    this.unsubscribers = []; this.initialized = false;
    if (this.resizeFrame) cancelAnimationFrame(this.resizeFrame); this.resizeFrame = null; this.clear();
  }
}
export default new NpcAutoRenderer();
