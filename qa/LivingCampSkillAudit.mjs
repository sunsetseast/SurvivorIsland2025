import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { CAST, makeLivingCampQa, quiet, withQaRandom } from './LivingCampSimulationHarness.mjs';
import { LocationKeys as L } from '../src/modules/core/LocationKeys.js';
import { resolveNpcCampExchange } from '../src/modules/systems/CampSocialResolution.js';

// Equal opportunities use actual work resolution. Supplies/condition are reset
// between trials to isolate ability from availability, role and fatigue.
export function auditWork({ attempts = 5000, seed = 440 } = {}) {
  return quiet(() => {
    const setup = makeLivingCampQa({ names: CAST.map(s => s.firstName), seed });
    const neutral = { id: 2000, firstName: 'Custom', location: L.BEACH };
    setup.tribe.members.push(neutral);
    if (setup.gm.survivors !== setup.tribe.members) setup.gm.survivors.push(neutral);
    return withQaRandom(setup.rng, () => {
      const results = [];
      for (const actor of [...setup.activity.npcs()]) for (const type of ['build_fire', 'fish', 'build_shelter'])
        for (const condition of [100, 20]) for (const responsible of [false, true]) {
          const assignments = setup.tribe.day1Plan.assignments;
          for (const role of Object.keys(assignments)) assignments[role] = [];
          if (responsible) assignments[type === 'build_fire' ? 'fire' : type === 'build_shelter' ? 'shelter' : 'resources'] = [actor.id];
          let wins = 0, output = 0;
          for (let i = 0; i < attempts; i++) {
            actor.rest = actor.hunger = actor.water = condition;
            setup.tribe.fire = setup.tribe.shelter = 0;
            Object.assign(setup.tribe.stockpile, { firewood: 30, bamboo: 20, palms: 10, fish1: 0 });
            setup.gm.campLog = []; setup.activity.reputationEvents.clear();
            setup.activity.resolveWork(actor, { id: `audit:${actor.id}:${type}:${condition}:${responsible}:${i}`,
              type, location: type === 'fish' ? L.ROCKY_SHORE : type === 'build_fire' ? L.CAMPFIRE : L.SHELTER }, 6000);
            output += type === 'fish' ? setup.tribe.stockpile.fish1 : setup.tribe[type === 'build_fire' ? 'fire' : 'shelter'];
            wins += type === 'fish' ? Number(setup.tribe.stockpile.fish1 > 0) : setup.tribe[type === 'build_fire' ? 'fire' : 'shelter'];
          }
          results.push({ id: actor.id, name: actor.firstName, type, condition, responsible, attempts,
            success: wins, successRate: wins / attempts, outputPer100: output / attempts * 100,
            expectedAttempts: type === 'fish' ? null : attempts / wins });
        }
      return results;
    });
  });
}

// Equal private, trusted-ally opportunities. A fresh listener does not already
// know the claim/idol; each test uses actual disclosure and hearsay resolution.
export function auditSocial({ opportunities = 2000, seed = 882 } = {}) {
  return quiet(() => {
    const setup = makeLivingCampQa({ names: CAST.map(s => s.firstName), seed });
    return withQaRandom(setup.rng, () => setup.activity.npcs().map(speaker => {
      const listener = setup.activity.npcs().find(s => s.id !== speaker.id);
      const subject = setup.activity.npcs().find(s => s.id !== speaker.id && s.id !== listener.id);
      for (const npc of setup.activity.npcs()) setup.gm.systems.npcLocationSystem.updateNpcLocation(npc.id,
        npc === speaker || npc === listener ? L.WATER_WELL : L.BEACH);
      setup.gm.systems.allianceSystem.deserialize({ alliances: [{ id: 'audit-allies', active: true,
        memberIds: [speaker.id,listener.id], tribeId: 1 }] });
      let lies = 0, lieConfidence = 0, disclosures = 0;
      for (const topic of ['cover', 'advantage']) for (let i = 0; i < opportunities; i++) {
        setup.memory.deserialize(null); setup.gm.systems.trustSystem.setTrust(speaker.id,listener.id,75);
        speaker.hasIdol = topic === 'advantage';
        if (topic === 'cover') setup.memory.recordCampClaim({ id: 'fact', speakerId: speaker.id, subjectId: subject.id,
          topic: 'idol_suspicion', stance: 'possible', origin: 'firsthand', confidence: .9, day: 1 });
        const outcome = resolveNpcCampExchange({ gm: setup.gm, memory: setup.memory, speaker, listener, random: setup.rng,
          activity: { id: `social:${i}`, type: 'strategy_conversation', targetId: listener.id, location: L.WATER_WELL, endsAt: 6000 } });
        if (outcome.type === 'lie') { lies++; lieConfidence += setup.memory.getCampClaims(listener.id).at(-1).confidence; }
        if (outcome.type === 'disclosure') disclosures++;
      }
      return { name: speaker.firstName, opportunities, lies, lieRate: lies / opportunities,
        lieConfidence: lies ? lieConfidence / lies : 0, disclosures, disclosureRate: disclosures / opportunities };
    }));
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const results = { work: auditWork(), social: auditSocial() };
  const output = process.argv.includes('--output') ? process.argv[process.argv.indexOf('--output') + 1] : null;
  if (output) fs.writeFileSync(output, JSON.stringify(results, null, 2) + '\n');
  else console.log(JSON.stringify(results, null, 2));
}
