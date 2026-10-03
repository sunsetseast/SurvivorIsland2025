import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { CAST, SCENARIOS, TRIBE_MIXES, rotatedCastTribes, makeLivingCampQa, runLivingCamp,
  seeded, withQaRandom, quiet, aggregate } from '../qa/LivingCampSimulationHarness.mjs';
import { auditWork, auditSocial } from '../qa/LivingCampSkillAudit.mjs';
import { getCampBehaviorProfile as profile, campWorkSkill, campLieAttemptChance,
  campStatementConfidence } from '../src/modules/systems/CampBehaviorProfile.js';
import { ownedCampKnowledge } from '../src/modules/systems/CampKnowledge.js';
import { refreshNpcCampNeeds } from '../src/modules/systems/CampSustenance.js';
import { resolveNpcCampExchange } from '../src/modules/systems/CampSocialResolution.js';
import { LocationKeys as L } from '../src/modules/core/LocationKeys.js';

const cast = name => CAST.find(s => s.firstName === name);
const actor = (setup, name) => setup.activity.npcs().find(s => s.firstName === name);
const weight = (setup, npc, type) => setup.activity.scoreChoices(npc).find(c => c.type === type)?.weight || 0;
const ratio = (metrics, key) => metrics.seconds[key] / Object.values(metrics.seconds).reduce((a, b) => a + b, 0);

test('campcraft is the only change to every approved #344 production field, including runtime defaults', () => {
  const baseline = JSON.parse(fs.readFileSync(new URL('./fixtures/approved-cast-344.json', import.meta.url)));
  assert.deepEqual(CAST.map(({ campcraft, ...previous }) => previous), baseline);
  assert.deepEqual(CAST.map(s => s.campcraft), [8,5,5,9,5,5,5,5,7,5,5,5,5,5,10,5,5,5]);
});

test('construction expertise dominates shelter skill; strength, effort and leadership do not substitute for it', () => {
  const w = profile(cast('Wendell')), r = profile(cast('Boston Rob'));
  assert.ok(w.shelterSkill > .85 && r.shelterSkill > .8);
  assert.equal(Math.max(...CAST.map(s => profile(s).shelterSkill)), w.shelterSkill);
  const expert = { campcraft: 10, strength: 5, dexterity: 5, laziness: 8 };
  const strongNovice = { campcraft: 2, strength: 10, dexterity: 10, laziness: 1 };
  assert.ok(profile(expert).shelterSkill > profile(strongNovice).shelterSkill + .3);
  assert.equal(profile({ ...expert, leader: 1 }).shelterSkill, profile({ ...expert, leader: 10 }).shelterSkill);
  for (const type of ['fish', 'build_fire', 'gather_firewood'])
    assert.equal(campWorkSkill({ campcraft: 1 }, type), campWorkSkill({ campcraft: 10 }, type));
  assert.equal(profile({}).shelterSkill, profile({ campcraft: 5 }).shelterSkill);
});

test('firsthand owner sharing an existing claim is direct; three subsequent owners retain a weakening source chain', () => quiet(() => {
  const s = makeLivingCampQa({ names: ['Tony','Jeremy','Yul','Kim','Michele'] }), m = s.memory;
  const [a,b,c,d,subject] = s.activity.npcs();
  m.recordCampClaim({ id: 'seen', speakerId: a.id, subjectId: subject.id, topic: 'idol_suspicion',
    stance: 'searching', origin: 'firsthand', confidence: .95, day: 1 });
  for (const [from,to] of [[a,b],[b,c],[c,d]]) assert.ok(m.shareCampClaim({ fromId: from.id, toId: to.id, claimId: 'seen' }));
  const claims = [a,b,c,d].map(n => m.getCampClaims(n.id)[0]);
  assert.deepEqual(claims.map(c => c.origin), ['firsthand','direct_statement','hearsay','hearsay']);
  assert.deepEqual(claims.slice(1).map(c => c.sourceId), [a.id,b.id,c.id]);
  assert.deepEqual(claims.slice(1).map(c => c.sourceChain), [[a.id],[a.id,b.id],[a.id,b.id,c.id]]);
  claims.slice(1).forEach((c,i) => assert.ok(c.confidence < claims[i].confidence));
  assert.equal(m.getCampClaims(subject.id).length, 0);
  const save = JSON.parse(JSON.stringify(m.serialize())); m.deserialize(save);
  assert.deepEqual([a,b,c,d].map(n => m.getCampClaims(n.id)[0]), JSON.parse(JSON.stringify(claims)));
  assert.equal(m.shareCampClaim({ fromId: a.id, toId: b.id, claimId: 'seen' }), false);
}));

test('original participant statements are direct too; old hearsay stays hearsay, never becomes firsthand', () => quiet(() => {
  const s = makeLivingCampQa(), [a,b,c] = s.activity.npcs(), m = s.memory;
  m.recordCampClaim({ id: 'own', speakerId: a.id, subjectId: c.id, topic: 'target', stance: 'consider' });
  m.shareCampClaim({ fromId: a.id, toId: b.id, claimId: 'own' });
  assert.equal(m.getCampClaims(b.id)[0].origin, 'direct_statement');
  const save = JSON.parse(JSON.stringify(m.serialize()));
  save.memory[a.id].campClaims[0].origin = 'hearsay';
  save.memory[b.id].campClaims = []; m.deserialize(save);
  m.shareCampClaim({ fromId: a.id, toId: b.id, claimId: 'own' });
  assert.equal(m.getCampClaims(b.id)[0].origin, 'hearsay');
}));

test('honesty changes lie frequency while deception changes credibility, including rare capable honest liars', () => quiet(() => {
  const s = makeLivingCampQa({ names: ['Tony','Jeremy','Yul','Kim'] });
  const [a,b,c] = s.activity.npcs(), rng = seeded(819);
  s.gm.systems.npcLocationSystem.updateNpcLocation(a.id, L.WATER_WELL);
  s.gm.systems.npcLocationSystem.updateNpcLocation(b.id, L.WATER_WELL);
  const sample = (honesty, deception) => {
    a.honesty = honesty; a.deception = deception; a.risk = 10;
    let lies = 0, confidence = 0;
    for (let i = 0; i < 2000; i++) {
      s.memory.deserialize(null); s.gm.systems.trustSystem.setTrust(a.id, b.id, 75);
      s.memory.recordCampClaim({ id: 'known', speakerId: a.id, subjectId: c.id, topic: 'idol_suspicion',
        stance: 'possible', confidence: .8, day: 1 });
      const outcome = resolveNpcCampExchange({ gm: s.gm, memory: s.memory, speaker: a, listener: b, random: rng,
        activity: { id: `talk:${i}`, type: 'strategy_conversation', targetId: b.id, location: L.WATER_WELL, endsAt: 6000 } });
      if (outcome.type === 'lie') {
        lies++; const claim = s.memory.getCampClaims(b.id).at(-1); confidence += claim.confidence;
        assert.equal(claim.truthfulness, undefined); assert.equal(claim.challenged, undefined);
        assert.ok(ownedCampKnowledge(s.memory,b.id).every(c => !('truthfulness' in c)));
      }
    }
    return { lies, confidence: confidence / lies };
  };
  const effective = sample(1,10), awkward = sample(1,1), honest = sample(10,10);
  assert.ok(effective.lies > 90 && awkward.lies > 90);
  assert.ok(effective.confidence > awkward.confidence + .08);
  assert.ok(honest.lies > 0 && honest.lies < effective.lies / 5);
  assert.equal(campLieAttemptChance(profile({ honesty: 1, deception: 1 })), campLieAttemptChance(profile({ honesty: 1, deception: 10 })));
  assert.ok(campStatementConfidence(.8, profile({ deception: 10 })) > campStatementConfidence(.8, profile({ deception: 1 })));
}));

test('owned contradictory firsthand evidence changes source reliability/trust once, never hidden truth alone', () => quiet(() => {
  const s = makeLivingCampQa(), [a,b,c] = s.activity.npcs(), m = s.memory;
  m.recordCampClaim({ id: 'cover', speakerId: a.id, listenerIds: [b.id], subjectId: c.id,
    topic: 'idol_suspicion', stance: 'unlikely', truthfulness: false, confidence: .7 });
  const trust = s.gm.getTrust(a.id,b.id);
  assert.equal(m.getCampClaims(b.id)[0].challenged, undefined);
  assert.equal(s.gm.getTrust(a.id,b.id), trust);
  m.recordCampClaim({ id: 'evidence', speakerId: b.id, subjectId: c.id, topic: 'idol_suspicion',
    stance: 'searching', origin: 'firsthand', confidence: .95 });
  assert.ok(m.getCampClaims(b.id)[0].challenged);
  assert.equal(s.gm.getTrust(a.id,b.id), trust - 2);
  const reliability = m.getCampSourceReliability(b.id,a.id);
  m.deserialize(JSON.parse(JSON.stringify(m.serialize())));
  m.recordCampClaim({ id: 'evidence-again', speakerId: b.id, subjectId: c.id, topic: 'idol_suspicion',
    stance: 'searching', origin: 'firsthand', confidence: .95 });
  assert.equal(m.getCampSourceReliability(b.id,a.id), reliability);
  assert.equal(s.gm.getTrust(a.id,b.id), trust - 2);
}));

test('all nine scenario families reproduce exactly across mid-phase production JSON save/load over four days', () => {
  for (const [i,scenario] of SCENARIOS.entries()) {
    const options = { scenario, seed: 11+i, days: 4, names: Object.values(TRIBE_MIXES)[i % 5] };
    const original = runLivingCamp(options), restored = runLivingCamp({ ...options, reload: true });
    assert.deepEqual(restored.semantic, original.semantic, scenario);
    assert.deepEqual(restored.handoffs, original.handoffs, scenario);
    // Reproducibility includes RNG, output, owned memory, needs, relationships,
    // pending blocks and reputation application, not just a statistical score.
    if (i === 0) assert.deepEqual(runLivingCamp(options).semantic, original.semantic);
  }
});

test('old saves retain their own ratings and missing campcraft uses neutral fallback', () => quiet(() => {
  const s = makeLivingCampQa(), payload = JSON.parse(JSON.stringify(s.gm.createSavePayload()));
  const id = s.activity.npcs()[0].id;
  for (const member of [...payload.gameManager.survivors, ...payload.gameManager.tribes.flatMap(t => t.members)]) {
    delete member.campcraft; member.firemaking = 3;
  }
  assert.ok(s.gm.restoreSavePayload(payload));
  const restored = s.activity.npcs().find(n => n.id === id);
  assert.equal(restored.firemaking, 3); assert.ok(!('campcraft' in restored));
  assert.equal(profile(restored).shelterSkill, profile({ ...restored, campcraft: 5 }).shelterSkill);
}));

test('late unfinished work cannot be shortened into a full outcome at Tree Mail', () => quiet(() => {
  const s = makeLivingCampQa(), a = s.activity.npcs()[0];
  s.activity.phaseId = s.activity.phase; s.gm.dayTimer = 20;
  const block = s.activity.start(a, { type: 'gather_firewood', location: L.JUNGLE_TRAIL }, 20);
  const wood = s.tribe.stockpile.firewood;
  s.activity.advance(20,0);
  assert.equal(block.endsAt, -400); assert.equal(s.tribe.stockpile.firewood, wood);
  assert.ok(!s.activity.resolved.has(block.id));
}));

test('search limits/disabled idols stop impossible blocks, while social risk still suppresses legal opportunities', () => quiet(() => {
  const s = makeLivingCampQa(), a = actor(s,'Tony');
  const available = weight(s,a,'idol_hunt'); assert.ok(available > 0);
  window.campScreen.currentView = L.FIREWOOD; s.gm.player.location = L.JUNGLE_TRAIL;
  assert.ok(weight(s,a,'idol_hunt') < available);
  const idols = s.gm.systems.idolSystem;
  // Use the production count key/method, without depending on a hidden find.
  idols._incrementCasualSearch(a.id,L.JUNGLE_TRAIL);
  idols._incrementCasualSearch(a.id,L.JUNGLE_TRAIL);
  assert.equal(weight(s,a,'idol_hunt'), 0);
  idols.startNewCampPhase('test'); s.gm.gameSettings.enableIdols = false;
  assert.equal(weight(s,a,'idol_hunt'), 0);
}));

test('NPC needs consume bounded real supplies at camp; eliminated/player/searching actors do not receive phantom meals', () => quiet(() => {
  const s = makeLivingCampQa(), a = s.activity.npcs()[0];
  a.water = a.hunger = 40; const water = s.tribe.stockpile.water;
  refreshNpcCampNeeds(s.gm,a,L.JUNGLE_TRAIL); assert.equal(a.water,40);
  refreshNpcCampNeeds(s.gm,a,L.BEACH); assert.equal(a.water,52); assert.equal(a.hunger,52);
  assert.equal(s.tribe.stockpile.water,water-1);
  s.tribe.stockpile.water = 0; s.tribe.stockpile.coconuts = 0; a.water = a.hunger = 40;
  refreshNpcCampNeeds(s.gm,a,L.BEACH); assert.equal(a.water,40); assert.equal(a.hunger,40);
  a.isOut = true; s.tribe.stockpile.water = 10;
  refreshNpcCampNeeds(s.gm,a,L.BEACH); assert.equal(a.water,40);
  const p = s.gm.player; p.water = 40; refreshNpcCampNeeds(s.gm,p,L.BEACH); assert.equal(p.water,40);
}));

test('missing palms can be supplied by existing NPC foraging, with one contribution event', () => quiet(() => {
  const s = makeLivingCampQa(), a = s.activity.npcs()[0];
  s.tribe.shelter = 0; s.tribe.stockpile.palms = 0; s.tribe.stockpile.coconuts = 30;
  const block = s.activity.start(a,{type:'gather_food',location:L.BEACH},7200);
  assert.equal(s.activity.complete(a,block,6780),true);
  assert.equal(s.activity.complete(a,block,6780),false);
  assert.equal(s.tribe.stockpile.palms,1);
  assert.equal(s.gm.campLog.filter(e => e.id === block.id).length,1);
  assert.equal(s.gm.campLog.at(-1).resources.palms,1);
  assert.ok(s.activity.reputationEvents.has(block.id));
}));

test('earned alliance cohesion survives JSON restore; old saves without cohesion still derive a valid value', () => quiet(() => {
  const s = makeLivingCampQa(), alliances = s.gm.systems.allianceSystem;
  alliances.alliances[0].cohesion = 21;
  const payload = JSON.parse(JSON.stringify(s.gm.createSavePayload()));
  assert.ok(s.gm.restoreSavePayload(payload));
  assert.equal(alliances.alliances[0].cohesion,21);
  delete payload.systems.allianceSystem.alliances[0].cohesion;
  assert.ok(s.gm.restoreSavePayload(payload));
  assert.ok(Number.isFinite(alliances.alliances[0].cohesion) && alliances.alliances[0].cohesion > 21);
}));

test('context overrides personality without creating busywork or deterministic choices', () => quiet(() => {
  const s = makeLivingCampQa({ names: ['Russell','Ozzy','Tony','Kim','Cirie','Wendell'] });
  s.tribe.stockpile.water = 50; const russell = actor(s,'Russell');
  const routine = weight(s,russell,'collect_water');
  s.tribe.stockpile.water = 0;
  assert.ok(weight(s,russell,'collect_water') > routine * 3);
  const ozzy = actor(s,'Ozzy'), rested = weight(s,ozzy,'rest');
  ozzy.rest = 1; assert.ok(weight(s,ozzy,'rest') > rested * 3);
  s.tribe.fire = 3; s.tribe.shelter = 4;
  for (const n of [actor(s,'Kim'),actor(s,'Wendell')]) {
    assert.equal(weight(s,n,'build_fire'),0); assert.equal(weight(s,n,'tend_fire'),0);
    assert.equal(weight(s,n,'build_shelter'),0);
  }
  // Even the exhausted provider and reluctant worker retain multiple options.
  assert.ok(s.activity.scoreChoices(ozzy).length > 5 && s.activity.scoreChoices(russell).length > 5);
}));

test('production advantage-sharing and honesty tendencies emerge in equal private ally opportunities', () => {
  const rows = auditSocial({ opportunities: 1000 }), row = name => rows.find(r => r.name === name);
  assert.ok(row('Jeremy').disclosureRate > row('Kelley').disclosureRate + .1);
  assert.ok(row('Parvati').disclosureRate > row('Kelley').disclosureRate + .1);
  assert.ok(row('Russell').lieRate > row('Yul').lieRate + .02);
  assert.ok(rows.every(r => r.disclosureRate < .4 && r.lieRate < .12));
});

test('fixed-seed equal-opportunity fire/fishing/construction distributions distinguish ability without guarantees', () => {
  const rows = auditWork({ attempts: 600 });
  const row = (name,type,condition=100,responsible=false) => rows.find(r => r.name===name&&r.type===type&&r.condition===condition&&r.responsible===responsible);
  assert.ok(row('Boston Rob','build_fire').successRate > row('Cirie','build_fire').successRate + .25);
  assert.ok(row('Wendell','build_shelter').successRate > row('Custom','build_shelter').successRate + .1);
  assert.ok(row('Ozzy','fish').outputPer100 > row('Cirie','fish').outputPer100 + 80);
  for (const name of ['Boston Rob','Wendell','Ozzy','Tony','Jay','Cirie','Custom']) {
    const healthy = row(name,'build_fire'), depleted = row(name,'build_fire',20);
    assert.ok(healthy.successRate > .3 && healthy.successRate < .9);
    assert.ok(depleted.successRate < healthy.successRate);
  }
});

test('real production casts allocate diverse time, retain strategy under pressure, and survive without human chores', () => {
  const runs = [];
  for (let seed=1;seed<=6;seed++) for (const names of rotatedCastTribes(seed))
    for (const scenario of ['normal','paranoia','mixed']) runs.push(runLivingCamp({seed,names,scenario,days:3}));
  const summary = aggregate(runs), metric = name => summary.contestants[cast(name).id];
  assert.ok(ratio(metric('Ozzy'),'work') > ratio(metric('Russell'),'work'));
  assert.ok(metric('Ozzy').fishingOutput / metric('Ozzy').responsibilityPhases > metric('Cirie').fishingOutput / metric('Cirie').responsibilityPhases);
  assert.ok(ratio(metric('Tony'),'idol') > ratio(metric('Michele'),'idol'));
  assert.ok(ratio(metric('Tony'),'investigate') > ratio(metric('Kim'),'investigate'));
  assert.ok(ratio(metric('Cirie'),'social') + ratio(metric('Cirie'),'strategy') > ratio(metric('Ozzy'),'social') + ratio(metric('Ozzy'),'strategy'));
  for (const survivor of CAST) {
    const m = metric(survivor.firstName);
    assert.ok(ratio(m,'work') > .05 && ratio(m,'work') < .65, survivor.firstName);
    assert.ok(ratio(m,'idol') < .25 && ratio(m,'rest') < .5, survivor.firstName);
    assert.ok(ratio(m,'social') + ratio(m,'strategy') > .04, survivor.firstName);
  }
  assert.ok(Object.values(summary.contestants).some(m => m.strategyInterruptions > 0));
  for (const h of Object.values(summary.health)) {
    assert.ok(h.fire/h.phases > 2 && h.shelter/h.phases > 2);
    assert.ok(h.hunger/h.phases > 45 && h.hydration/h.phases > 45 && h.rest/h.phases > 35);
  }
});

test('all five tribe compositions remain viable in shortage/exhaustion and ordinary camp still includes social time', () => {
  for (const names of Object.values(TRIBE_MIXES)) for (const scenario of ['shortage','exhausted']) {
    const run = runLivingCamp({ names, scenario, days:4, seed:81 });
    const end = run.daily.at(-1);
    assert.ok(end.hunger > 40 && end.hydration > 40 && end.rest > 5, `${scenario}: ${names}`);
    assert.ok(end.fire > 0 && end.shelter > 0);
    assert.ok(Object.values(run.metrics).some(m => m.strategyConversations > 0));
  }
});
