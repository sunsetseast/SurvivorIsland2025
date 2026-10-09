import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';

// One QA policy/observer, two source roots. Every game decision uses that root's
// production systems; no purpose, objective, intention, promise or ballot is seeded.
const ROOT = path.resolve(process.env.DELEGATION_SOURCE_ROOT || path.join(path.dirname(fileURLToPath(import.meta.url)), '..'));
const load = (file) => import(pathToFileURL(path.join(ROOT, file)).href);
const { makeScrambleQa } = await load('qa/ScrambleSimulationHarness.mjs');
const { CAST, quiet, seeded, withQaRandom } = await load('qa/LivingCampSimulationHarness.mjs');
const { default: ScrambleActivityPlan, ScrambleState } = await load('src/modules/systems/ScrambleActivityPlan.js');
const { default: TribalCouncilSystem } = await load('src/modules/systems/TribalCouncilSystem.js');
const { finishTribal } = await load('qa/TribalQaHarness.mjs');
const { default: DealConsequencesSystem } = await load('src/modules/systems/DealConsequencesSystem.js');
const { routeBetween } = await load('src/modules/systems/CampActivitySystem.js');
const { taskAction } = await load('src/modules/systems/StrategicTaskActions.js');
export const FAMILIES = ['stable-majority', 'fragile-majority', 'divided-tribe', 'fluid', 'secret-coalition',
  'idol-concern', 'betrayal-leaking', 'time-pressure', 'player-bottom', 'conflicted-loyalties'];
export const POLICIES = ['passive', 'loyal', 'active', 'deceptive', 'unreliable', 'reliable', 'counter', 'survival'];
const same = (a, b) => String(a) === String(b);
const copy = (x) => JSON.parse(JSON.stringify(x));
export function semanticProjection(x) {
  if (Array.isArray(x)) return x.map(semanticProjection);
  if (!x || typeof x !== 'object') return x;
  return Object.fromEntries(Object.entries(x).filter(([k]) => !['savedAt', 'timestamp', 'updatedAt', 'recordedAt'].includes(k))
    .map(([k, v]) => [k, semanticProjection(v)]));
}
const hash = (x) => createHash('sha256').update(JSON.stringify(semanticProjection(x))).digest('hex');
const count = (obj, key, n = 1) => { obj[key] = (obj[key] || 0) + n; };
function sourceFingerprint(root) {
  const digest = createHash('sha256');
  const visit = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(file);
      else { digest.update(path.relative(root, file)); digest.update(fs.readFileSync(file)); }
    }
  };
  visit(path.join(root, 'src')); return digest.digest('hex');
}
const SOURCE_FINGERPRINT = sourceFingerprint(ROOT);

export function runNaturalDelegation({ family = 'fluid', policy = 'passive', seed = 1, reload = false, traceLimit = 300, approachQa = false, approachResponse = 'participate' } = {}) {
  if (!FAMILIES.includes(family) || !POLICIES.includes(policy)) throw Error('Unknown natural scenario/policy');
  const began = performance.now(), rng = seeded(seed);
  return quiet(() => withQaRandom(rng, () => {
    const oldNow = Date.now; Date.now = () => 1800000000000 + seed;
    try {
      const size = [6, 8, 10][seed % 3], offset = seed % CAST.length;
      const names = Array.from({ length: size }, (_, i) => CAST[(offset + i * 5) % CAST.length].firstName);
      assert.equal(new Set(names).size, size, 'a natural tribe has unique contestants');
      const s = makeScrambleQa({ seed, start: false, names }), gm = s.gm;
      const e = s.conversation.engine, A = gm.systems.allianceSystem;
      let player = gm.player;
      gm.day = 7; gm.isMerged = false; gm.gamePhase = 'preChallenge'; gm.dayTimer = 1200;
      gm.flags = {}; gm.gameHistory = { tribals: [] }; gm.jury = [];
      gm._completedTribalKeys = new Set(); gm._tribalCompletionStages = new Map(); gm._tribalCompletionInFlight = new Set();
      gm.systems.dealConsequencesSystem = new DealConsequencesSystem(gm);
      A.reset(); s.memory.deserialize({}); e.deserialize();
      let npcs = s.activity.npcs(), members = s.activity.members();
      const initial = { family, policy, seed, cast: members.map(p => ({ id: p.id, name: p.firstName,
        style: p.gameplayStyle })), alliances: [], information: [], relationships: 'seeded social history, not vote plans', idols: [] };
      const form = (ids, secrecy = 'secret') => {
        initial.alliances.push({ id: `natural:${initial.alliances.length}`, memberIds: ids, secrecy });
      };
      if (family === 'stable-majority') form([player.id, ...npcs.slice(0, Math.ceil(members.length / 2)).map(p => p.id)], 'public');
      if (family === 'fragile-majority') form([player.id, ...npcs.slice(0, Math.floor(members.length / 2) - 1).map(p => p.id)]);
      if (['divided-tribe', 'time-pressure', 'betrayal-leaking'].includes(family)) {
        form(npcs.slice(0, Math.floor(size / 2)).map(p => p.id));
        form(npcs.slice(Math.floor(size / 2)).map(p => p.id));
      }
      if (family === 'secret-coalition') form(npcs.slice(0, Math.ceil(size / 2)).map(p => p.id));
      if (family === 'idol-concern') form(npcs.slice(0, size - 2).map(p => p.id));
      if (family === 'player-bottom') form(npcs.slice(0, Math.ceil(size * .7)).map(p => p.id));
      if (family === 'conflicted-loyalties') {
        form([player.id, ...npcs.slice(0, Math.floor(size / 2)).map(p => p.id)]);
        form(npcs.slice(1).map(p => p.id));
      }
      if (family === 'betrayal-leaking') {
        // A connector belongs to competing groups; the owner has a prior,
        // attributed concern, not omniscient knowledge of future betrayal.
        form([npcs[0].id, ...npcs.slice(Math.floor(size / 2)).map(p => p.id)]);
      }
      A.deserialize({ alliances: initial.alliances.map(a => ({ ...a, active: true, tribeId: 1, name: a.id, type: 'core' })) });
      for (const a of members) for (const b of members) if (!same(a.id, b.id)) {
        const allies = initial.alliances.some(x => x.memberIds.includes(a.id) && x.memberIds.includes(b.id));
        const trust = allies ? 66 + Math.floor(rng() * 20) : 35 + Math.floor(rng() * 30);
        gm.systems.trustSystem.setTrust(a.id, b.id, trust);
        gm.systems.relationshipSystem.setRelationship(a.id, b.id,
          family === 'player-bottom' && (a.isPlayer || b.isPlayer) ? 16 + Math.floor(rng() * 20) : trust);
      }
      // Initial information is explicitly seeded, owner-specific and fallible.
      // It is never an injected objective, requested work, commitment or outcome.
      if (family === 'idol-concern') {
        const holder = npcs.at(-1), observer = npcs[0], strong = seed % 2 === 0;
        holder.hasIdol = strong;
        if (strong) gm.systems.idolSystem.getSurvivorInventory(holder.id).idols = [{ id: 'natural-owned-idol', isUsed: false }];
        initial.idols.push({ holderId: holder.id, possessed: strong, publiclyKnown: false });
        const claim = { id: 'natural:owned-protection', speakerId: observer.id, subjectId: holder.id,
          listenerIds: [], topic: 'idol_suspicion', stance: 'possible', origin: strong ? 'firsthand' : 'hearsay',
          confidence: strong ? .8 : .35, day: gm.day, campTime: gm.dayTimer };
        s.memory.recordCampClaim(claim); initial.information.push(claim);
      }
      if (family === 'betrayal-leaking') {
        const claim = { id: 'natural:prior-loyalty-concern', speakerId: npcs[1].id,
          subjectId: npcs[0].id, listenerIds: [npcs[2].id], topic: 'alliance_doubt',
          stance: 'uncertain', origin: 'hearsay', confidence: .55,
          day: gm.day, campTime: gm.dayTimer };
        s.memory.recordCampClaim(claim); initial.information.push(claim);
      }
      s.conversation._renderMenu = () => {}; s.conversation._clearOverlay = () => {};
      s.conversation._showNpcApproachOverlay = () => {};
      const trace = [], metrics = { generated: {}, selected: {}, executed: {}, self: {}, npcDelegation: {}, playerDelegation: {},
        responses: {}, reports: {}, status: {}, style: {}, plannerCalls: 0, candidateCalls: 0, candidateCount: 0,
        maxQueue: 0, maxCandidateSet: 0, movement: 0, impossibleTravel: 0, nonPresentActions: 0, repeatedRequests: 0,
        redundantVerification: 0, repeatedAgenda: 0, playerActions: 0, counterAttempts: 0,
        disputes: 0, reassignments: 0, objectiveAbandoned: 0, followups: 0, reportsDelivered: 0, quietPlannerCalls: 0,
        initialObjectives: 0, targetFlips: 0, saveBytes: 0, restoreMs: 0, restoreBoundaries: [] };
      let restoreCount = 0, turn = 0, traceOmitted = 0, incomingActorId=null;
      const approaches={funnel:{},observed:{},styles:{},maxPending:0,interruptions:0};
      const approachTrace=[];
      const observeApproach=(stage,actorId,targetId,detail={})=>{
        if(!approachQa)return;
        const direction=e.person(targetId)?.isPlayer?'player':'npc',key=`${gm.gamePhase}:${direction}:${stage}`;
        count(approaches.observed,key);
        if(approachTrace.length<traceLimit)approachTrace.push({stage,actorId,targetId,phase:gm.gamePhase,campTime:gm.dayTimer,...copy(detail)});
      };
      if(approachQa&&e.initiative){
        const originalNote=e.initiative.note.bind(e.initiative);
        e.initiative.note=(i,stage,detail)=>{originalNote(i,stage,detail);
          count(approaches.funnel,`${gm.gamePhase}:${e.person(i.targetId)?.isPlayer?'player':'npc'}:${stage}`);
          const style=approaches.styles[e.person(i.actorId)?.gameplayStyle] ||= {};count(style,stage);
          if(stage==='invitation_offered')approaches.interruptions++;
          if(approachTrace.length<traceLimit)approachTrace.push({stage,intentionId:i.id,actorId:i.actorId,targetId:i.targetId,
            phase:gm.gamePhase,campTime:gm.dayTimer,reason:i.reason,evidenceIds:i.evidenceIds||i.agenda?.knownEvidence||[],...copy(detail||{})});
        };
      }
      const seenInvitations=new Set();
      const observeInvitation=()=>{
        if(!approachQa)return;
        const invitation=e.initiative?.invitation||s.strategy.scramble?.invitation;
        if(invitation&&!seenInvitations.has(invitation.activityId)){seenInvitations.add(invitation.activityId);
          observeApproach('invitation_offered',invitation.npcId,player.id);}
      };
      const captureNpcAction=(actor,listener,id,result,action)=>{
        if(!actor?.isPlayer&&result&&!result.invalid&&!result.replay){
          observeApproach('semantic_action',actor.id,listener?.id,{actionId:id,action});
          if(!listener?.isPlayer)observeApproach('response_obtained',actor.id,listener?.id);
        }
      };
      for(const method of ['executeAgenda','resolveCampAgenda']){
        const original=e[method].bind(e);e[method]=(actor,listener,activity,...rest)=>{
          const result=original(actor,listener,activity,...rest);
          if(method==='executeAgenda')captureNpcAction(actor,listener,activity.id,result,activity.agenda?.purpose);
          return result;
        };
      }
      const pendingCheckpoints = new Set();
      const emit = (type, detail = {}) => { if (trace.length < traceLimit) trace.push({ type, day: gm.day, campTime: gm.dayTimer, ...copy(detail) }); else traceOmitted++; };
      const snapshot = () => {
        const payload = copy(gm.createSavePayload()), game = payload.gameManager;
        // Saves intentionally relink tribe-member copies to the authoritative
        // survivor records. NPC residency is the location system, not the old
        // cosmetic survivor.location field. Compare both authoritative stores.
        game.tribes.forEach(t => { t.members = t.members.map(p => p.id); });
        game.survivors.forEach(p => { if (!p.isPlayer) delete p.location; });
        game.flags.campEventActive ??= false;
        return semanticProjection({ payload, rngState: rng.state() });
      };
      const checkpoint = (label) => {
        if (metrics.restoreBoundaries.includes(label)) return;
        metrics.restoreBoundaries.push(label);
        const payload = copy(gm.createSavePayload()); metrics.saveBytes = Math.max(metrics.saveBytes, JSON.stringify(payload).length);
        if (reload) {
          const before = snapshot(), randomState = rng.state(), t = performance.now();
          assert.ok(gm.restoreSavePayload(payload), `restore ${label}`); rng.restore(randomState);
          player = gm.player; npcs = s.activity.npcs(); members = s.activity.members();
          metrics.restoreMs += performance.now() - t; restoreCount++;
          assert.deepEqual(snapshot(), before, `immediate JSON restoration: ${family}/${seed}/${label}`);
        }
      };
      const originalCandidates = e.objectives.workPlanner.candidates.bind(e.objectives.workPlanner);
      e.objectives.workPlanner.candidates = (actor, objective, now) => {
        const candidates = originalCandidates(actor, objective, now);
        metrics.candidateCalls++; metrics.candidateCount += candidates.length;
        metrics.maxCandidateSet = Math.max(metrics.maxCandidateSet, candidates.length);
        for (const w of candidates) count(metrics.generated, w.purpose);
        if (candidates.length) emit('needs', { ownerId: actor.id, objectiveId: objective.id,
          candidates: candidates.map(w => ({ purpose: w.purpose, targetId: w.targetId, subjectId: w.subjectId,
            reason: w.reason, evidenceIds: w.requiredKnowledge, key: w.key })) });
        return candidates;
      };
      const originalPlan = e.objectives.plan.bind(e.objectives);
      const agendaKeys = new Map();
      e.objectives.plan = (actor, now) => {
        metrics.plannerCalls++; const result = originalPlan(actor, now);
        if (!result) metrics.quietPlannerCalls++;
        if (result?.agenda?.work) {
          const w = result.agenda.work, delegated = result.agenda.purpose === 'objective_delegate';
          count(metrics.selected, w.purpose);
          count(delegated ? e.person(result.targetId)?.isPlayer ? metrics.playerDelegation : metrics.npcDelegation : metrics.self, w.purpose);
          const style = metrics.style[actor.gameplayStyle] ||= { selected: {}, self: 0, delegated: 0, private: 0 };
          count(style.selected, w.purpose); style[delegated ? 'delegated' : 'self']++;
          if (w.secrecyNeed) style.private++;
          if (w.purpose === 'verify_vote' && e.model?.planSupport(actor.id).accounts.some(k =>
            same(k.voterId, w.targetId) && k.confirmed && same(k.targetId, objectiveTarget(result.objectiveId)))) metrics.redundantVerification++;
          if (agendaKeys.get(actor.id) === w.key) metrics.repeatedAgenda++;
          agendaKeys.set(actor.id, w.key);
          emit('selected_work', { ownerId: actor.id, objectiveId: result.objectiveId, purpose: w.purpose,
            targetId: w.targetId, executorId: delegated ? result.targetId : actor.id,
            choice: delegated ? e.person(result.targetId)?.isPlayer ? 'player' : 'npc' : 'self',
            reason: w.reason, evidenceIds: w.requiredKnowledge, location: result.location });
        }
        return result;
      };
      const originalResolve = e.resolve.bind(e);
      const seenRequests = new Map();
      e.resolve = (a) => {
        const r = originalResolve(a);
        if (r.replay || r.invalid) return r;
        captureNpcAction(e.person(a.speakerId),e.person(a.listenerIds[0]),a.actionId,r,a.type);
        assert.ok(a.listenerIds.every(id => e.together(a.speakerId, id)), 'semantic conversation must be co-present');
        emit('conversation', { actionId: a.actionId, speakerId: a.speakerId, listenerIds: a.listenerIds,
          action: a.type, subjectId: a.subjectId, taskId: a.delegationId, objectiveId: a.objectiveId,
          location: e.place(a.speakerId), responses: r.responses });
        if (a.type === 'delegate') {
          const task = Object.values(e.tasks.records).findLast(t => t.requestClaimId?.startsWith(a.actionId));
          if (task) {
            count(metrics.responses, task.publicStatus);
            const key = task.workKey || `${task.objectiveId}:${task.purpose}:${task.targetId}:${task.subjectId}`;
            const prior = seenRequests.get(key);
            if (prior && prior.delegateId === task.delegateId && prior.time - gm.dayTimer < 900) metrics.repeatedRequests++;
            if (prior && prior.delegateId !== task.delegateId) metrics.reassignments++;
            seenRequests.set(key, { delegateId: task.delegateId, time: gm.dayTimer });
            pendingCheckpoints.add(task.publicStatus === 'pending' ? 'player-request-pending' : 'task-response-resolved');
          }
        }
        if (a.type === 'follow_task') metrics.followups++;
        if (a.type === 'report') { metrics.reportsDelivered++; pendingCheckpoints.add('report-delivered'); }
        if (a.delegationId && !['report', 'follow_task'].includes(a.type)) {
          const task = e.tasks.get(a.delegationId);
          if (task && same(task.delegateId, a.speakerId) && a.listenerIds.some(id => same(id, task.targetId))) count(metrics.executed, task.purpose);
        }
        return r;
      };
      const originalStart = s.activity.start.bind(s.activity);
      const objectiveTarget = (id) => e.objectives.records[id]?.targetId;
      s.activity.start = (actor, plan, now) => {
        const a = originalStart(actor, plan, now);
        if(approachQa&&!actor.isPlayer&&a){
          const target=a.targetId||a.goal?.targetId;
          if(target&&['approach_player','strategy_conversation','travel'].includes(a.type))
            observeApproach(a.type==='travel'?'travel_started':'approach_started',actor.id,target,{activityId:a.id});
        }
        if (a?.type === 'travel') {
          metrics.movement++;
          if (s.present(actor, a.location) || a.duration < 45) metrics.impossibleTravel++;
          emit('travel', { actorId: actor.id, taskId: a.taskId || a.goal?.taskId,
            from: a.fromLocation, to: a.location, endsAt: a.endsAt });
        }
        return a;
      };
      const act = (type, listener, fields = {}) => {
        const action=e.action(type, { speakerId: player.id, listenerIds: [listener.id], ...fields });
        const r = e.resolve(action);
        if(approachQa)e.initiative?.afterPlayerAction(listener,action,r);
        if(!r.invalid&&approachQa&&same(listener.id,incomingActorId))observeApproach('response_obtained',listener.id,player.id,{action:type});
        if (!r.invalid) { metrics.playerActions++; if (['pitch', 'ask_vote', 'delegate'].includes(type)) metrics.counterAttempts++; }
        return r;
      };
      const finish = () => { incomingActorId=null;if (s.activity.conversation) s.activity.finishConversation({ strategy: true, turns: 1 }); s.conversation.nodeSession = null; };
      const speak = (npc, operation) => {
        if (!npc || !e.together(player.id, npc.id) || !s.activity.beginConversation(npc, { location: player.location, strategy: true })) return false;
        operation(npc); finish(); return true;
      };
      const ownedTarget = (counter = false) => {
        const claims = e.knowledge(player.id).filter(k => ['target', 'commitment'].includes(k.topic) &&
          !same(k.subjectId, player.id) && !['denied', 'no'].includes(k.stance));
        const mentioned = [...claims].reverse().find(k => e.person(k.subjectId) && !same(k.subjectId, player.id));
        const pool = members.filter(p => !p.isPlayer && !p.isOut && !p.hasImmunity);
        return counter ? pool.find(p => !same(p.id, mentioned?.subjectId) &&
          !initial.alliances.some(a => a.memberIds.includes(player.id) && a.memberIds.includes(p.id)))?.id || pool[0]?.id
          : mentioned?.subjectId || pool[0]?.id;
      };
      const stepPlayer = () => {
        if (policy === 'passive' || (!s.strategy.isActive&&!approachQa) || gm.dayTimer < 150 || s.activity.conversation || player.campActivity?.type === 'travel') return;
        const invitation = e.initiative?.invitation || s.strategy.scramble?.invitation;
        if (invitation && e.together(player.id, invitation.npcId)) {
          const npc = e.person(invitation.npcId);
          if(approachQa&&approachResponse!=='participate'&&e.initiative){
            e.initiative.respond(approachResponse==='reject'?'decline':'defer');return;
          }
          const accepted=approachQa&&e.initiative ? e.initiative.respond('accept') :
            (s.strategy.scramble.clearInvitation(),s.activity.beginConversation(npc,{location:player.location,strategy:true}));
          if(accepted) {
            incomingActorId=npc.id;
            observeApproach('invitation_accepted',npc.id,player.id);
            observeApproach('conversation_started',npc.id,player.id);
            (()=>{
            // Production NPC presentation executes the real offered action,
            // but only this policy chooses the human's response.
            if(!(approachQa&&e.initiative))s.conversation.view.startNpc(npc, { agenda: invitation.agenda });
            if(approachQa&&e.initiative){
              const checkpoint=s.activity.conversation?.checkpoint,negotiation=checkpoint?.npcNegotiation||checkpoint?.semanticLast;
              if((negotiation?.proposal||['pitch','ask_vote','press'].includes(negotiation?.type))&&negotiation.subjectId){
                if(policy==='deceptive')act('cover_promise',npc,{subjectId:negotiation.subjectId});
                else if(policy==='counter')act('reply',npc,{subjectId:negotiation.subjectId,stance:'refused'});
                else {act('numbers',npc,{subjectId:negotiation.subjectId});
                  act('reply',npc,{subjectId:negotiation.subjectId,stance:'consider'});}
              }
            }
            const request = Object.values(e.tasks.records).findLast(t => same(t.delegateId, player.id) && t.publicStatus === 'pending');
            if (request) {
              const response = policy === 'counter' ? false : policy === 'active' && turn % 3 === 0 ? 'hedge' : true;
              e.tasks.respond(request.id, player.id, response);
              count(metrics.responses, response === 'hedge' ? 'player_hedged' : response ? 'player_accepted' : 'player_refused');
              observeApproach('response_obtained',npc.id,player.id,{taskId:request.id,response});
              emit('player_response', { taskId: request.id, response }); pendingCheckpoints.add('task-accepted');
              if (policy === 'unreliable') e.tasks.ignore(request.id, player.id);
            }
            const report = e.tasks.knownTasks(player.id).find(t => same(t.requesterId, npc.id) && t.publicStatus === 'accepted' && !t.report);
            if (report && ['deceptive', 'unreliable'].includes(policy)) act('report', npc, { delegationId: report.id, truthMode: 'fabrication' });
            })();finish();return;
          }
        }
        if(!s.strategy.isActive)return;
        const tasks = e.tasks.playerRequests(player.id);
        const ready = tasks.find(t => t.canReport && e.together(player.id, t.requesterId));
        if (ready && speak(e.person(ready.requesterId), n => act('report', n, { delegationId: ready.id,
          ...(policy === 'deceptive' ? { truthMode: 'fabrication' } : {}) }))) return;
        const request = Object.values(e.tasks.records).find(t => same(t.delegateId, player.id) &&
          t.publicStatus === 'accepted' && ['queued', 'finding', 'asking_reason', 'maybe_later'].includes(t.status));
        if (request && !['unreliable', 'counter'].includes(policy)) {
          const target = e.person(request.targetId);
          if (e.together(player.id, target?.id)) {
            const action = request.status === 'asking_reason' ? e.tasks.bringOptions(request, player.id)[0] : taskAction(e, request);
            if (action && speak(target, n => act(action.type, n, action))) {
              if (request.status === 'ready_to_walk') e.tasks.beginBring(request.id, player.id);
              return;
            }
          }
          const seen = s.memory.getCampObservations(player.id).findLast(k => same(k.actorId, request.targetId) && k.location);
          const destination = seen?.toLocation || seen?.location;
          const route = destination && routeBetween(player.location, destination);
          if (route?.length && gm.dayTimer > route.length * 45 + 180) {
            // Ordinary human navigation is synchronous per edge. A player task
            // is not attached to this trip unless it really is paired bring travel.
            for (const place of route) {
              const block = s.activity.start(player, { type: 'travel', location: place, external: true });
              gm.consumeCampTime(45, { source: 'camp_travel' });
              s.activity.complete(player, block);
            }
            return;
          }
        }
        if (turn % 4 !== 0 || gm.dayTimer < 300) return;
        const nearby = npcs.filter(n => e.together(player.id, n.id) && n.campActivity?.interruptible !== false);
        const npc = nearby[(turn / 4 + seed) % Math.max(1, nearby.length)];
        if (!npc) return;
        speak(npc, n => {
          const target = ownedTarget(['counter', 'survival'].includes(policy));
          if (turn % 8 === 0) act('vote_read', n);
          else if (policy === 'loyal') act('promise', n, { subjectId: target });
          else if (policy === 'deceptive') {
            const claim = e.knowledge(player.id).filter(k => ['target', 'commitment'].includes(k.topic)).at(-1);
            if (claim) act('leak', n, { claimId: claim.id });
            else act('cover_promise', n, { subjectId: target });
          } else if (policy === 'active' && turn % 12 === 0) {
            const targetPerson = nearby.find(p => !same(p.id, n.id));
            if (targetPerson) act('delegate', n, { subjectId: targetPerson.id, planTargetId: target, requestedAction: 'recruit' });
            else act('ask_vote', n, { subjectId: target });
          } else act('ask_vote', n, { subjectId: target });
        });
      };
      // Natural pre-immunity camp creates observations and social history.
      s.activity.phaseId = s.activity.phase;
      s.activity.ensureStarted();
      while (gm.dayTimer > 0) {
        observeInvitation();if(approachQa)stepPlayer();
        gm.consumeCampTime(Math.min(60, gm.dayTimer), { source: 'natural_pre_wait' });
        if(approachQa)approaches.maxPending=Math.max(approaches.maxPending,e.initiative?.intentions.filter(i=>!['resolved','expired','abandoned'].includes(i.status)).length||0);
      }
      gm.gamePhase = 'postChallenge'; gm.dayTimer = family === 'time-pressure' ? 360 : 3600;
      gm.flags = {}; s.strategy.reset(); s.strategy.isActive = true; s.strategy.playerTribeSafe = false;
      s.strategy.startedForPhaseKey = `${gm.day}-postChallenge`; s.strategy.scrambleState = ScrambleState.ACTIVE;
      s.strategy.scramble = new ScrambleActivityPlan(gm, s.strategy, { rngState: seed });
      s.activity.phaseId = s.activity.phase; s.activity.conversation = null;
      for (const p of members) { p.campActivity = null; p.hasVote = true; p.hasImmunity = false; }
      e.tasks.expire(); e.objectives.deserialize();
      s.strategy.seedNpcIntentTargetsForPhase(); // Certified production selection, not QA-written targets.
      checkpoint('objective-start');
      const initialIntents = Object.fromEntries(npcs.map(p => [p.id, s.strategy.reasoning.state(p.id).intendedVoteId]));
      s.activity.ensureStarted(); s.strategy.scramble.scheduleAlliances();
      let previous = initialIntents;
      while (gm.dayTimer > 0 && turn++ < 180) {
        observeInvitation();stepPlayer();
        if(approachQa)approaches.maxPending=Math.max(approaches.maxPending,e.initiative?.intentions.filter(i=>!['resolved','expired','abandoned'].includes(i.status)).length||0);
        gm.consumeCampTime(Math.min(45, gm.dayTimer), { source: 'natural_scramble_wait' });
        for (const label of pendingCheckpoints) checkpoint(label);
        pendingCheckpoints.clear();
        const records = Object.values(e.tasks.records);
        metrics.maxQueue = Math.max(metrics.maxQueue, records.filter(t => !['reported', 'refused', 'expired', 'ignored'].includes(t.status)).length);
        if (records.some(t => t.status === 'finding')) checkpoint('delegate-traveling');
        if (members.some(p => p.campActivity?.goal?.agenda?.work)) checkpoint('intermediary-traveling');
        if (s.strategy.scramble.invitation) checkpoint('player-approached');
        if (records.some(t => t.status === 'awaiting_report')) checkpoint('report-pending');
        if (records.some(t => t.disputedBy?.length)) checkpoint('dispute-discovered');
        if (records.some(t => t.outcome)) checkpoint('task-response-resolved');
        if (Object.values(s.strategy.reasoning.states).some(t => t.backup?.active)) checkpoint('backup-activated');
        if (gm.dayTimer <= 300) checkpoint('final-five-minutes');
        const intents = Object.fromEntries(npcs.map(p => [p.id, s.strategy.reasoning.state(p.id).intendedVoteId]));
        for (const [id, target] of Object.entries(intents)) if (!same(target, previous[id])) {
          metrics.targetFlips++; emit('intention_change', { ownerId: id, from: previous[id], to: target });
        }
        previous = intents;
      }
      assert.equal(gm.dayTimer, 0); checkpoint('before-Tribal');
      const finalIntent = Object.fromEntries(npcs.map(p => [p.id, s.strategy.reasoning.state(p.id).intendedVoteId]));
      const playerTarget = ownedTarget(['counter', 'survival'].includes(policy));
      const tribal = new TribalCouncilSystem(gm, { publish() {} });
      const summary = finishTribal({ gm, tribal, members }, { playerTargetId: playerTarget });
      emit('Tribal', { votes: summary.initialVotes, eliminatedId: summary.eliminatedId });
      checkpoint('after-Tribal');
      const ballots = summary.initialVotes.map(v => ({ voterId: v.voterId, targetId: v.targetId }));
      e.tasks.expire();
      const tasks = Object.values(e.tasks.records);
      metrics.attemptedTasks = tasks.filter(t => t.executionReceipt).length;
      metrics.reportedTasks = tasks.filter(t => t.reports.length).length;
      const taskResults = tasks.map(t => ({ id: t.id, purpose: t.purpose, requesterId: t.requesterId,
        delegateId: t.delegateId, targetId: t.targetId, publicStatus: t.publicStatus, status: t.status,
        attempted: Boolean(t.executionReceipt), action: t.outcome?.actionType || null,
        response: t.outcome?.stance || null, reports: t.reports.map(r => ({ stance: r.reported, day: r.day, campTime: r.campTime })) }));
      for (const t of tasks) {
        count(metrics.status, t.status);
        for (const r of t.reports) {
          const owned = s.memory.getCampClaims(t.delegateId);
          const claim = owned.find(k => k.id.startsWith(r.id) && k.topic === 'task_report');
          count(metrics.reports, claim?.truthfulness === false ? 'fabricated' : 'truthful_or_interpretation');
        }
        if (t.disputedBy?.length) metrics.disputes++;
      }
      const objectives = Object.values(e.objectives.records);
      metrics.objectiveAbandoned = objectives.filter(o => o.status === 'abandoned').length;
      metrics.initialObjectives = objectives.length;
      const votes = {}; ballots.forEach(v => count(votes, v.targetId));
      const actualNpc = ballots.filter(v => !same(v.voterId, player.id));
      const tribalIntent = Object.fromEntries(npcs.map(p => [p.id, s.strategy.reasoning.state(p.id).intendedVoteId]));
      const aligned = actualNpc.filter(v => same(v.targetId, tribalIntent[v.voterId])).length;
      const plans = Object.values(s.strategy.reasoning.plans);
      metrics.strategy = copy(s.strategy.reasoning.metrics);
      metrics.obligations = {};
      for (const person of members) for (const obligation of s.memory.getConversationObligations(person.id))
        count(metrics.obligations, `${obligation.kind}:${obligation.status}`);
      const result = { family, policy, seed, initial, metrics, initialIntents, finalIntent, tribalIntent, ballots,
        sourceFingerprint: SOURCE_FINGERPRINT,
        outcome: { eliminatedId: summary.eliminatedId, playerSurvived: !same(summary.eliminatedId, player.id),
          distinctTargets: Object.keys(votes).length, leadingVotes: Math.max(...Object.values(votes)),
          npcIntentAlignment: aligned, npcBallots: actualNpc.length, backups: plans.filter(p => p.id.startsWith('backup:')).length,
          splits: plans.filter(p => p.assignments).length, competingObjectives: new Set(objectives.map(o => o.targetId)).size },
        ...(approachQa?{approaches,approachTrace,approachResponse}:{}),taskResults, trace, traceOmitted, restoreCount, projection: snapshot(), rngState: rng.state() };
      result.stateHash = hash(result.projection); result.metrics.runtimeMs = performance.now() - began;
      return result;
    } finally { Date.now = oldNow; }
  }));
}

export async function certifyNatural({ seedsPerFamily = 40, baselineRoot, outputDir, workers = 4 } = {}) {
  if (!baselineRoot || !outputDir) throw Error('baselineRoot and outputDir required');
  fs.mkdirSync(outputDir, { recursive: true });
  const jobs = FAMILIES.flatMap((family, i) => Array.from({ length: seedsPerFamily }, (_, n) => ({
    family, seed: 358000 + i * 100 + n, policy: POLICIES[n % POLICIES.length] })));
  const roots = { baseline: baselineRoot, candidate: ROOT };
  const fingerprints = Object.fromEntries(Object.entries(roots).map(([version, root]) => [version, sourceFingerprint(root)]));
  const results = [];
  let next = 0, completed = 0;
  const work = async () => {
    while (next < jobs.length) {
      const job = jobs[next++], pair = {};
      for (const [version, root] of Object.entries(roots)) {
        const destination = path.join(outputDir, `${version}-${job.seed}.json`);
        // Resume only an identical-source, identical-job successful JSON replay.
        // Cached baseline runs never hide a changed candidate implementation.
        if (fs.existsSync(destination)) {
          const cached = JSON.parse(fs.readFileSync(destination, 'utf8'));
          if (cached.sourceFingerprint === fingerprints[version] && cached.restoreEquivalent && Array.isArray(cached.taskResults) &&
              cached.family === job.family && cached.policy === job.policy && cached.seed === job.seed) {
            pair[version] = cached; continue;
          }
        }
        await new Promise((resolve, reject) => {
          const child = spawn(process.execPath, [fileURLToPath(import.meta.url), '--case', JSON.stringify(job), destination],
            { env: { ...process.env, DELEGATION_SOURCE_ROOT: root }, stdio: ['ignore', 'pipe', 'pipe'] });
          let output = ''; child.stdout.on('data', d => output += d); child.stderr.on('data', d => output += d);
          child.on('error', reject); child.on('exit', code => code === 0 ? resolve() : reject(Error(`${version}/${JSON.stringify(job)}\n${output.slice(-5000)}`)));
        });
        pair[version] = JSON.parse(fs.readFileSync(destination, 'utf8'));
      }
      results.push({ job, ...pair });
      console.log(JSON.stringify({ completed: ++completed, total: jobs.length, ...job }));
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, workers) }, work));
  results.sort((a, b) => a.job.seed - b.job.seed);
  fs.writeFileSync(path.join(outputDir, 'results.json'), JSON.stringify(results) + '\n');
  return results;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv[2] === '--case') {
    const job = JSON.parse(process.argv[3]);
    const a = runNaturalDelegation(job), b = runNaturalDelegation({ ...job, reload: true, traceLimit: 0 });
    assert.deepEqual(b.projection, a.projection, `full scramble replay ${job.seed}`);
    assert.equal(b.rngState, a.rngState);
    const { projection, ...result } = a;
    result.restoreEquivalent = true; result.restoreBoundaries = b.metrics.restoreBoundaries;
    result.restoreMs = b.metrics.restoreMs;
    fs.writeFileSync(process.argv[4], JSON.stringify(result));
  } else await certifyNatural({ seedsPerFamily: Number(process.env.DELEGATION_SEEDS || 40),
    baselineRoot: process.env.DELEGATION_BASELINE_ROOT, outputDir: process.env.DELEGATION_OUTPUT_DIR || '/tmp/delegation-certification' });
}
