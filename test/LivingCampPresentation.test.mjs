import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { makeLivingCampQa } from '../qa/LivingCampSimulationHarness.mjs';
const { default: CampInteractionSystem, overhearingChance, APPROACH_SECONDS } = await import('../src/modules/systems/CampInteractionSystem.js');
import { campGroups, visibleActivityLabel, clusterPortraitLayout, campRecap, publicCampCue } from '../src/modules/ui/CampPresentation.js';
import { ownsUsableIdol } from '../src/modules/systems/IdolPossession.js';
import { LocationKeys as L } from '../src/modules/core/LocationKeys.js';

function fixture(random = () => .99) {
  const logs = console.log; console.log = () => {};
  let s; try { s = makeLivingCampQa({ seed: 99 }); } finally { console.log = logs; }
  s.activity.phaseId = s.activity.phase;
  const npcs = s.activity.npcs(), [a,b,c,d] = npcs;
  for (const p of npcs) s.activity.start(p, { type: 'rest', location: L.BEACH, duration: 3000 });
  const view = { value: L.BEACH };
  const interactions = new CampInteractionSystem(s.gm, { random, getView: () => view.value,
    navigate: place => { view.value = place; window.campScreen.currentView = place; s.gm.player.location = place; } });
  s.gm.systems.campInteractionSystem = interactions;
  const setView = place => { interactions.leaveLocation(view.value, place); view.value = place; window.campScreen.currentView = place; s.gm.player.location = place; };
  const startPair = (type = 'strategy_conversation', location = L.WATER_WELL) => {
    s.activity.start(b, { type: 'rest', location, duration: 3000 });
    return s.activity.start(a, { type, location, targetId: b.id });
  };
  return { ...s, a,b,c,d, npcs, interactions, setView, startPair };
}

test('inventory possession blocks only the holder in a new camp phase', () => {
  const s = fixture(), idol = s.gm.systems.idolSystem;
  const state = { id: 'actual-find', tribeId: 1, locationKey: L.JUNGLE_TRAIL, isFound: false, isUsed: false };
  idol.tribeIdolStates.set(1, state);
  idol._handleIdolFound({ idolState: state, survivor: s.a, tribeId: 1, locationKey: L.JUNGLE_TRAIL, via: 'intentional' });
  assert.ok(!s.a.hasIdol);
  assert.ok(ownsUsableIdol(s.a, idol));
  s.gm.day = 2; s.activity.ensureStarted();
  assert.equal(s.activity.scoreChoices(s.a).find(c => c.type === 'idol_hunt')?.weight || 0, 0);
  assert.ok(s.activity.scoreChoices(s.b).find(c => c.type === 'idol_hunt').weight > 0);
  state.isUsed = true; assert.equal(ownsUsableIdol(s.a, idol), false);
});

test('activity labels show behavior without hidden goals or hunt enums', () => {
  assert.equal(visibleActivityLabel({ type: 'idol_hunt', targetId: 'secret' }), 'Looking around the trail');
  assert.equal(visibleActivityLabel({ type: 'investigate', targetId: 'Rachel' }), 'Watching the trail');
  assert.equal(visibleActivityLabel({ type: 'strategy_conversation', targetId: 'secret', privacy: 'private' }), 'Talking quietly');
  assert.ok(!JSON.stringify(visibleActivityLabel({ type: 'travel', location: L.JUNGLE_TRAIL, goal: { targetId: 'secret' } })).includes('secret'));
});

test('one central projection groups actual participants and separates bystanders/off-location people', () => {
  const s = fixture(); s.startPair('strategy_conversation', L.BEACH);
  s.activity.start(s.c, { type: 'build_fire', location: L.CAMPFIRE });
  s.d.isOut = true;
  const groups = campGroups(s.gm, L.BEACH), pair = groups.find(g => g.members.some(p => p.id === s.a.id));
  assert.equal(pair.members.length, 2); assert.equal(pair.privacy, 'private');
  assert.ok(!JSON.stringify(groups).includes('targetId'));
  assert.ok(!groups.some(g => g.members.some(p => p.id === s.c.id || p.id === s.d.id)));
  s.activity.interrupt(s.a); s.activity.start(s.a, { type: 'rest', location: L.BEACH });
  assert.ok(campGroups(s.gm,L.BEACH).every(g => !g.members.some(p => p.id === s.a.id) || g.members.length === 1));
});

test('normalized subview presence can hear; distant player cannot', () => {
  const s = fixture(() => 0), a = s.startPair('socialize', L.JUNGLE_TRAIL);
  s.memory.recordCampClaim({ id: 'said', speakerId: s.a.id, listenerIds: [s.b.id], subjectId: s.c.id,
    topic: 'target', stance: 'consider', day: 1, confidence: .8 });
  const exchange = { speaker: s.a, listener: s.b, activity: a, claimId: 'said' };
  s.setView(L.BEACH); assert.equal(s.interactions.hearExchange(exchange), null);
  assert.equal(s.memory.getCampClaims(s.gm.player.id).length, 0);
  s.setView(L.FIREWOOD); s.interactions.watching = { activityId: a.id };
  assert.ok(s.interactions.hearExchange(exchange));
  assert.equal(s.memory.getCampClaims(s.gm.player.id).length,0,'busy gathering yields no full strategic statement');
  assert.ok(s.memory.getCampObservations(s.gm.player.id).some(e=>e.type==='overheard_name'));
  s.setView(L.JUNGLE_TRAIL);
  s.memory.recordCampClaim({id:'said-again',speakerId:s.a.id,listenerIds:[s.b.id],subjectId:s.c.id,topic:'target',stance:'consider',day:1});
  s.interactions.hearExchange({...exchange,activity:{...a,id:'new-exchange'},claimId:'said-again'});
  s.interactions.watching={activityId:'clear-exchange'};
  s.interactions.hearExchange({...exchange,activity:{...a,id:'clear-exchange'},claimId:'said-again'});
  const received = s.memory.getCampClaims(s.gm.player.id)[0];
  assert.equal(received.origin, 'direct_statement'); assert.equal(received.acquisition, 'overheard');
  assert.equal(received.sourceId, s.a.id);
  assert.equal(s.memory.getCampClaims(s.d.id).length, 0);
});

test('quiet talk yields a fragment/name without leaking private plan or hidden lie', () => {
  const s = fixture(() => 0), a = s.startPair(); s.setView(L.WATER_WELL);
  s.memory.recordCampClaim({ id: 'lie', speakerId: s.a.id, listenerIds: [s.b.id], subjectId: s.c.id,
    topic: 'target', stance: 'denied', truthfulness: false, day: 1 });
  s.interactions.watching = { activityId: a.id };
  const text = s.interactions.hearExchange({ speaker: s.a, listener: s.b, activity: a, claimId: 'lie' });
  assert.ok(text.includes(s.c.firstName)); assert.ok(!text.includes('denied') && !text.includes('lie'));
  assert.equal(s.memory.getCampClaims(s.gm.player.id).length, 0);
  assert.equal(s.memory.getCampObservations(s.gm.player.id).find(e => e.type === 'overheard_name').subjectId, s.c.id);
  assert.equal(s.interactions.hearExchange({ speaker: s.a, listener: s.b, activity: a, claimId: 'lie' }), null);
});

test('a fully overheard false statement remains unmarked, including after JSON restore', () => {
  const s = fixture(() => 0), a = s.startPair('socialize', L.WATER_WELL); s.setView(L.WATER_WELL);
  s.memory.recordCampClaim({ id: 'false-statement', speakerId: s.a.id, listenerIds: [s.b.id], subjectId: s.c.id,
    topic: 'idol_suspicion', stance: 'unlikely', truthfulness: false, day: 1 });
  s.interactions.watching = { activityId: a.id };
  s.interactions.hearExchange({ speaker: s.a, listener: s.b, activity: a, claimId: 'false-statement' });
  s.memory.deserialize(JSON.parse(JSON.stringify(s.memory.serialize())));
  const known = s.memory.getCampClaims(s.gm.player.id)[0];
  assert.equal(known.stance, 'unlikely'); assert.equal(known.truthfulness, undefined);
  assert.equal(known.challenged, undefined); assert.deepEqual(known.sourceChain, [s.a.id]);
});

test('unnoticed overhearing belongs only to the player, not the speaker or listener', () => {
  const s = fixture(() => 0), a = s.startPair('socialize', L.WATER_WELL); s.setView(L.WATER_WELL);
  s.memory.recordCampClaim({id:'audible',speakerId:s.a.id,listenerIds:[s.b.id],subjectId:s.c.id,
    topic:'target',stance:'consider',day:1});
  s.interactions.watching = {activityId:a.id};
  s.interactions.hearExchange({speaker:s.a,listener:s.b,activity:a,claimId:'audible'});
  s.memory.deserialize(JSON.parse(JSON.stringify(s.memory.serialize())));
  assert.ok(s.memory.getCampObservations(s.gm.player.id).some(e=>e.type==='overheard_statement'));
  for (const person of [s.a,s.b,s.c,s.d])
    assert.ok(!s.memory.getCampObservations(person.id).some(e=>e.type.startsWith('overheard_')));
});

test('privacy, occupation, ambient noise and awareness bound overhearing opportunities', () => {
  const base = overhearingChance({ privacy: 'private', location: L.WATER_WELL });
  assert.ok(overhearingChance({ privacy: 'public', location: L.WATER_WELL }) > base);
  assert.ok(overhearingChance({ privacy: 'private', occupied: true, location: L.CAMPFIRE }) < base);
  assert.ok(overhearingChance({ privacy: 'private', awareness: 10, near: true }) < 1);
});

test('watching consumes one minute with ongoing NPC work and no reputation reward', () => {
  const s = fixture(), a = s.startPair('socialize', L.BEACH);
  s.activity.start(s.c, { type: 'gather_firewood', location: L.JUNGLE_TRAIL, duration: 50 });
  const group = campGroups(s.gm,L.BEACH).find(g => g.activityId === a.id);
  const before = s.gm.dayTimer, reputation = s.gm.player.teamPlayer;
  s.interactions.watch(group);
  assert.equal(before - s.gm.dayTimer, 60); assert.equal(s.gm.player.teamPlayer, reputation);
  assert.ok(s.gm.campLog.some(e => e.actorId === s.c.id));
  assert.equal(s.gm.player.campActivity, null);
});

test('private group can go quiet on approach; casual group welcomes without rewards', () => {
  const s = fixture(() => .99), a = s.startPair(); s.setView(L.WATER_WELL);
  const privateGroup = campGroups(s.gm,L.WATER_WELL).find(g => g.activityId === a.id);
  const response = s.interactions.approach(privateGroup);
  assert.ok(response.guarded); assert.equal(s.a.campActivity.type, 'idle_at_camp');
  assert.ok(s.memory.getCampObservations(s.gm.player.id).some(e => e.type === 'conversation_guarded'));
  assert.ok(!s.memory.getCampObservations(s.d.id).some(e => e.type === 'conversation_guarded'));
  const casual = s.startPair('socialize'), group = campGroups(s.gm,L.WATER_WELL).find(g => g.activityId === casual.id);
  assert.equal(s.interactions.approach(group).join,true);
});

test('pair relocation uses reserved semantic travel and owned departure witnesses', () => {
  const s = fixture(), from = L.BEACH;
  const block = s.activity.moveTogether(s.a,s.b,L.TRIBE_FLAG);
  assert.equal(s.a.campActivity.type,'travel'); assert.equal(s.b.campActivity.id,block.id);
  assert.equal(s.gm.systems.npcLocationSystem.getLocation(s.a.id),L.TRIBE_FLAG);
  assert.equal(s.gm.systems.npcLocationSystem.getLocation(s.b.id),L.TRIBE_FLAG);
  const seen = s.memory.getCampObservations(s.gm.player.id).find(e => e.type === 'departed');
  assert.equal(seen.fromLocation,from); assert.deepEqual(seen.participantIds,[s.b.id]);
  s.activity.advance(s.gm.dayTimer,s.gm.dayTimer - 45);
  assert.equal(s.a.campActivity.type,'strategy_conversation'); assert.equal(s.b.campActivity.id,s.a.campActivity.id);
  assert.equal(campGroups(s.gm,L.BEACH).some(g => g.members.some(p => p.id === s.a.id)),false);
});

test('follow costs camp time and can witness searching firsthand without public knowledge', () => {
  const s = fixture(() => .5);
  s.activity.start(s.a,{type:'travel',location:L.TRIBE_FLAG,goal:{type:'idol_hunt',location:L.CAMPFIRE,duration:500}});
  const departure = s.interactions.recentDepartures().find(e => e.actorId === s.a.id), before = s.gm.dayTimer;
  const result = s.interactions.follow(departure);
  assert.equal(before - s.gm.dayTimer,120); assert.ok(result.text.includes('brush'));
  assert.equal(s.memory.getCampClaims(s.gm.player.id)[0].origin,'firsthand');
  assert.equal(s.memory.getCampClaims(s.d.id).length,0);
  assert.ok(!s.memory.getCampObservations(s.a.id).some(e=>e.type==='idol_search_seen'), 'unnoticed target does not learn they were seen');
  assert.equal(s.gm.player.campActivity,null);
});

test('caught follow makes a small once-only consequence owned by the target', () => {
  const rolls = [.5,0]; const s = fixture(() => rolls.shift() ?? .99);
  s.activity.start(s.a,{type:'travel',location:L.TRIBE_FLAG,goal:{type:'rest',location:L.TRIBE_FLAG,duration:500}});
  const entry = s.interactions.recentDepartures().find(e => e.actorId === s.a.id);
  const trust = s.gm.getTrust(s.a.id,s.gm.player.id);
  assert.ok(s.interactions.follow(entry).caught);
  assert.equal(s.gm.getTrust(s.a.id,s.gm.player.id),trust - 1);
  assert.ok(s.memory.getCampObservations(s.a.id).some(e=>e.type==='player_following' && e.actorId===s.gm.player.id));
  assert.ok(!s.memory.getCampObservations(s.d.id).some(e=>e.type==='player_following'));
  s.interactions.follow(entry); assert.equal(s.gm.getTrust(s.a.id,s.gm.player.id),trust - 1);
});

test('ordinary follow can show work without inventing a secret', () => {
  const s = fixture(() => .5);
  s.activity.start(s.a,{type:'travel',location:L.TRIBE_FLAG,goal:{type:'build_fire',location:L.TRIBE_FLAG,duration:500}});
  const result = s.interactions.follow(s.interactions.recentDepartures().find(e=>e.actorId===s.a.id));
  assert.ok(result.text.includes('fire')); assert.equal(s.memory.getCampClaims(s.gm.player.id).length,0);
});

test('groups and travel companions reconstruct from JSON without duplicate knowledge', () => {
  const s = fixture(); const a = s.startPair('socialize',L.BEACH);
  s.interactions.seeGroups(); const groups = campGroups(s.gm,L.BEACH);
  const payload = JSON.parse(JSON.stringify(s.gm.createSavePayload()));
  assert.ok(!JSON.stringify(payload.systems).includes('watching'));
  assert.ok(s.gm.restoreSavePayload(payload));
  assert.deepEqual(campGroups(s.gm,L.BEACH),groups);
  const count = s.gm.systems.socialMemorySystem.getCampObservations(s.gm.player.id).length;
  const recovered = new CampInteractionSystem(s.gm); recovered.seeGroups();
  assert.equal(s.gm.systems.socialMemorySystem.getCampObservations(s.gm.player.id).length,count);
  assert.ok(s.activity.active); assert.ok(a.id);
});

test('joined pair reserves every participant until existing conversation finishes', () => {
  const s = fixture(), block = s.startPair('socialize', L.BEACH);
  s.gm.systems.conversationSystem = { startPlayerConversation: ({npcId,context})=>s.activity.beginConversation(s.interactions.person(npcId),context) };
  const group = campGroups(s.gm,L.BEACH).find(g=>g.activityId===block.id);
  const result = s.interactions.approach(group); assert.ok(result.join);
  assert.ok(s.interactions.join(group,result.context));
  assert.equal(s.b.campActivity.id,s.gm.player.campActivity.id); assert.equal(s.b.campActivity.interruptible,false);
  const id = s.gm.player.campActivity.id; s.activity.finishConversation({turns:1});
  assert.ok(s.a.campActivity.id !== id && s.b.campActivity.id !== id);
});

test('recap uses player observations and public supplies, never another owner private target', () => {
  const s = fixture(); s.memory.recordCampClaim({id:'secret',speakerId:s.a.id,listenerIds:[s.b.id],subjectId:s.c.id,topic:'target',stance:'consider',day:1});
  s.memory.recordCampObservation({id:'known',actorId:s.a.id,witnessIds:[s.gm.player.id],type:'work',day:1});
  const recap = campRecap(s.gm);
  assert.ok(recap.life.some(line=>line.includes(s.a.firstName)));
  assert.ok(!JSON.stringify(recap).includes(s.c.firstName));
});

for (const count of [1,2,3,6]) for (const width of [140,300,600]) test(`portrait layout ${count} people at ${width}px has separate bounded boxes`,()=>{
  const layout = clusterPortraitLayout(count,width);
  for (const [i,a] of layout.boxes.entries()) {
    assert.ok(a.x>=0 && a.x+a.width<=layout.width && a.y+a.height<=layout.height);
    for (const b of layout.boxes.slice(i+1)) assert.ok(a.x+a.width<=b.x || b.x+b.width<=a.x || a.y+a.height<=b.y || b.y+b.height<=a.y);
  }
});

test('all camp views still use only centralized NPC rendering, reduced motion and keyboard controls remain',()=>{
  for (const path of fs.readdirSync(new URL('../src/modules/views/',import.meta.url))) {
    const source=fs.readFileSync(new URL(`../src/modules/views/${path}`,import.meta.url),'utf8');
    if (path==='PostChallengeSummaryView.js') continue;
    assert.ok(!/function renderNPC|createNpcIcon|npc-icon-container/.test(source),path);
  }
  const css=fs.readFileSync(new URL('../src/styles/living-camp.css',import.meta.url),'utf8');
  assert.match(css,/prefers-reduced-motion/);assert.match(css,/min-height:44px/);assert.match(css,/focus-visible/);
});

test('an indistinct fragment does not encode a secret subject for later knowledge consumers',()=>{
  const s=fixture(()=>.3), a=s.startPair();s.setView(L.WATER_WELL);s.gm.player.awareness=10;
  s.memory.recordCampClaim({id:'unheard-plan',speakerId:s.a.id,listenerIds:[s.b.id],subjectId:s.c.id,topic:'target',stance:'consider',day:1});
  s.interactions.hearExchange({speaker:s.a,listener:s.b,activity:a,claimId:'unheard-plan'});
  const fragment=s.memory.getCampObservations(s.gm.player.id).find(e=>e.type==='overheard_fragment');
  assert.ok(fragment);assert.equal(fragment.subjectId,undefined);assert.equal(s.memory.getCampClaims(s.gm.player.id).length,0);
});

test('a dissolved group cannot reroll its response through a stale interaction',()=>{
  const s=fixture(), a=s.startPair();s.setView(L.WATER_WELL);
  const group=campGroups(s.gm,L.WATER_WELL).find(g=>g.activityId===a.id);
  assert.ok(s.interactions.approach(group).guarded);
  assert.equal(s.interactions.approach(group).join,false);
  assert.equal(s.memory.getCampObservations(s.gm.player.id).filter(e=>e.type==='conversation_guarded').length,1);
});

test('a paired route survives mid-travel JSON restore with one owner and no duplicate departure',()=>{
  const s=fixture();s.activity.moveTogether(s.a,s.b,L.CAMPFIRE);
  const originalId=s.a.campActivity.id, before=s.memory.getCampObservations(s.gm.player.id).filter(e=>e.type==='departed').length;
  const payload=JSON.parse(JSON.stringify(s.gm.createSavePayload()));s.gm.restoreSavePayload(payload);
  const [a,b]=s.gm.getPlayerTribe().members.filter(p=>p.id===s.a.id||p.id===s.b.id);
  assert.equal(a.campActivity.id,originalId);assert.equal(b.campActivity.id,originalId);assert.ok(b.campActivity.external);
  const living=s.gm.systems.campActivitySystem;living.advance(s.gm.dayTimer,s.gm.dayTimer-90);
  assert.equal(a.campActivity.type,'strategy_conversation');assert.equal(b.campActivity.id,a.campActivity.id);
  assert.equal(s.memory.getCampObservations(s.gm.player.id).filter(e=>e.type==='departed').length,before);
  assert.equal(living.complete(a,{id:originalId}),false);
});

test('watching an audible actual exchange presents the owned statement rather than a generic result',()=>{
  const s=fixture(()=>0), block=s.startPair('socialize',L.BEACH);
  s.memory.recordCampClaim({id:'spoken-once',speakerId:s.a.id,subjectId:s.c.id,topic:'target',stance:'consider',day:1});
  s.activity.random=()=>0;block.duration=60;block.endsAt=s.gm.dayTimer-60;
  s.b.campActivity.endsAt=block.endsAt;
  const group=campGroups(s.gm,L.BEACH).find(g=>g.activityId===block.id);
  const result=s.interactions.watch(group);
  assert.ok(result.text.includes(s.c.firstName));assert.ok(result.text.includes('after the challenge'));
  assert.equal(s.memory.getCampClaims(s.gm.player.id)[0].acquisition,'overheard');
  assert.equal(s.interactions.watching,null);
});

// Interaction hardening: semantic eligibility survives UI changes/reload.
function departure(s) {
  s.activity.start(s.a,{type:'travel',location:L.TRIBE_FLAG,goal:{type:'rest',location:L.TRIBE_FLAG,duration:500}});
  return s.interactions.recentDepartures().find(e=>e.actorId===s.a.id);
}
test('Follow requires the witnessed origin; leaving and returning permanently misses it, including JSON reload',()=>{
  const s=fixture(), e=departure(s);
  assert.ok(e);assert.equal(e.fromLocation,L.BEACH);
  s.setView(L.CAMPFIRE);assert.equal(s.interactions.recentDepartures().length,0);
  s.setView(L.BEACH);assert.equal(s.interactions.recentDepartures().length,0);
  const payload=JSON.parse(JSON.stringify(s.gm.createSavePayload()));s.gm.restoreSavePayload(payload);
  assert.equal(s.interactions.recentDepartures().length,0);
  const before=s.gm.dayTimer;s.interactions.follow(e);assert.equal(s.gm.dayTimer,before);
});
test('Follow closes when target returns, is out/absent, time expires, or camp is interrupted',()=>{
  for(const reason of ['return','out','absent','expired','event','phase','treeMail','end']) {
    const s=fixture(),e=departure(s);assert.ok(e);
    if(reason==='return') s.activity.start(s.a,{type:'rest',location:L.BEACH});
    if(reason==='out') s.a.isOut=true;
    if(reason==='absent') s.gm.flags.absentFromCampIds=[s.a.id];
    if(reason==='expired') s.gm.dayTimer-=181;
    if(reason==='event') { s.interactions.missDepartures();s.gm.flags.campEventActive=true; }
    if(reason==='phase') s.gm.gamePhase='postChallenge';
    if(reason==='treeMail') s.setView(L.TREE_MAIL);
    if(reason==='end') s.gm.dayTimer=0;
    assert.equal(s.interactions.recentDepartures().length,0,reason);
    if(reason==='return') {s.activity.start(s.a,{type:'rest',location:L.TRIBE_FLAG});assert.equal(s.interactions.recentDepartures().length,0);}
    if(reason==='event') {s.gm.flags.campEventActive=false;assert.equal(s.interactions.recentDepartures().length,0);}
  }
});
test('attempted Follow stays spent after JSON reload',()=>{
  const s=fixture(()=>.99),e=departure(s);s.interactions.follow(e);
  s.gm.restoreSavePayload(JSON.parse(JSON.stringify(s.gm.createSavePayload())));
  s.setView(L.BEACH);const before=s.gm.dayTimer;s.interactions.follow(e);assert.equal(s.gm.dayTimer,before);
});
for(const type of ['socialize','strategy_conversation']) test(`Approach ${type} spends the same real time, progresses work/needs and gives no approach reward`,()=>{
  const s=fixture(),block=s.startPair(type,L.WATER_WELL);s.setView(L.WATER_WELL);
  s.activity.start(s.c,{type:'gather_firewood',location:L.JUNGLE_TRAIL,duration:30});
  const group=campGroups(s.gm,L.WATER_WELL).find(g=>g.activityId===block.id);
  const before=s.gm.dayTimer,team=s.gm.player.teamPlayer,effort=s.activity.effort[s.gm.player.id]||0;
  const needs=JSON.stringify(s.gm.campNeedElapsed),trust=s.gm.getTrust(s.a.id,s.gm.player.id);
  s.interactions.approach(group);
  assert.equal(before-s.gm.dayTimer,APPROACH_SECONDS);assert.notEqual(JSON.stringify(s.gm.campNeedElapsed),needs);
  assert.ok(s.gm.campLog.some(e=>e.actorId===s.c.id));assert.equal(s.gm.player.teamPlayer,team);
  assert.equal(s.gm.getTrust(s.a.id,s.gm.player.id),trust);assert.equal(s.activity.effort[s.gm.player.id]||0,effort);
  assert.equal(s.gm.player.campActivity,null);
});
test('conversation resolving during Approach is not resurrected or interrupted through the old group',()=>{
  const s=fixture(),block=s.startPair('strategy_conversation',L.BEACH);
  block.endsAt=s.gm.dayTimer-20;block.duration=20;s.b.campActivity.endsAt=block.endsAt;
  const group=campGroups(s.gm,L.BEACH).find(g=>g.activityId===block.id);
  const result=s.interactions.approach(group);assert.ok(result.movedOn);assert.equal(result.join,false);
  assert.ok(!s.memory.getCampObservations(s.gm.player.id).some(e=>e.type==='conversation_guarded'));
  const current=s.a.campActivity?.id,before=s.gm.dayTimer;
  s.interactions.approach(group);assert.equal(s.a.campActivity?.id,current);assert.equal(s.gm.dayTimer,before);
});
test('same casual activity reacts once; subsequent choice joins without rerolling or walking twice',()=>{
  let rolls=0;const s=fixture(()=>{rolls++;return .99;});const a=s.startPair('socialize',L.BEACH);
  const group=campGroups(s.gm,L.BEACH).find(g=>g.activityId===a.id);
  s.interactions.approach(group);const before=s.gm.dayTimer,previous=rolls;
  assert.ok(s.interactions.approach(group).join);assert.equal(s.gm.dayTimer,before);assert.equal(rolls,previous);
  assert.equal(s.memory.getCampObservations(s.gm.player.id).filter(e=>e.type==='approached').length,1);
});

test('paired travelers depart before destination portraits arrive; semantic route steps and JSON restore agree',()=>{
  const s=fixture();const block=s.activity.moveTogether(s.a,s.b,L.CAMPFIRE);
  assert.ok(block);assert.equal(s.gm.systems.npcLocationSystem.getLocation(s.a.id),L.TRIBE_FLAG,'runtime route contract retained');
  const contains=(place,id)=>campGroups(s.gm,place).some(g=>g.members.some(p=>p.id===id));
  for(const place of [L.BEACH,L.TRIBE_FLAG,L.CAMPFIRE]) {assert.equal(contains(place,s.a.id),false);assert.equal(contains(place,s.b.id),false);}
  s.gm.restoreSavePayload(JSON.parse(JSON.stringify(s.gm.createSavePayload())));
  assert.equal(contains(L.TRIBE_FLAG,s.a.id),false);
  s.gm.consumeCampTime(45,{source:'clock'});assert.equal(contains(L.CAMPFIRE,s.a.id),false);
  s.gm.consumeCampTime(45,{source:'clock'});
  const pair=campGroups(s.gm,L.CAMPFIRE).find(g=>g.members.some(p=>p.id===s.a.id));
  assert.deepEqual(pair.members.map(p=>p.id).sort(),[s.a.id,s.b.id].sort());
  assert.equal(contains(L.BEACH,s.a.id),false);assert.equal(contains(L.TRIBE_FLAG,s.a.id),false);
});
test('public atmosphere uses only shared needs; private groups never get speech or secret subjects',()=>{
  const s=fixture(),block=s.startPair('socialize',L.BEACH),group=campGroups(s.gm,L.BEACH).find(g=>g.activityId===block.id);
  s.tribe.stockpile.water=0;assert.equal(publicCampCue(group,s.tribe),'“Water’s getting low.”');
  assert.equal(publicCampCue({...group,privacy:'private'},s.tribe),null);
  assert.equal(publicCampCue({...group,social:false},s.tribe),null);
  s.tribe.stockpile.water=30;s.tribe.stockpile.firewood=0;assert.match(publicCampCue(group,s.tribe),/wood/);
});

test('accepted approach guard survives observation pruning and JSON reload on the original activity',()=>{
  const s=fixture(),block=s.startPair('socialize',L.BEACH),group=campGroups(s.gm,L.BEACH).find(g=>g.activityId===block.id);
  s.interactions.approach(group);
  s.memory.memory[String(s.gm.player.id)].campObservations=[];
  s.gm.restoreSavePayload(JSON.parse(JSON.stringify(s.gm.createSavePayload())));
  const before=s.gm.dayTimer;
  assert.ok(s.interactions.approach(group).join);assert.equal(s.gm.dayTimer,before);
});

test('public cue variants stay stable per activity and dedupe each shared topic locally',async()=>{
  const {publicCampCues}=await import('../src/modules/ui/CampPresentation.js');
  const tribe={members:[{},{}],stockpile:{water:0,firewood:20},fire:3,shelter:3,secretTarget:'Hidden',idolLocation:'Hidden'};
  const groups=Array.from({length:3},(_,i)=>({id:`group-${i}`,activityId:`activity-${i}`,social:true,privacy:'public'}));
  const cues=publicCampCues(groups,tribe);assert.equal(cues.filter(Boolean).length,1);
  assert.deepEqual(publicCampCues(structuredClone(groups),tribe),cues);
  assert.deepEqual(publicCampCues(groups,{...tribe,secretTarget:'SomeoneElse',idolLocation:'Elsewhere'}),cues);
  assert.ok(cues.filter(Boolean).every(c=>/water|well/i.test(c) && !/Hidden|SomeoneElse|idol/.test(c)));
  assert.ok(publicCampCues(groups.map(g=>({...g,privacy:'private'})),tribe).every(c=>c===null));
  const variants=new Set();for(let i=0;i<12;i++) variants.add(publicCampCues([{...groups[0],activityId:`variant-${i}`}],tribe)[0]);
  assert.ok(variants.size>=2,'deterministic variety across blocks');
});
