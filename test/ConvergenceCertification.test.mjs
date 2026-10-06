import test from 'node:test';
import assert from 'node:assert/strict';
import {runViableCounterplay} from '../qa/CounterplayHarness.mjs';
import {makeScrambleQa} from '../qa/ScrambleSimulationHarness.mjs';
import {quiet} from '../qa/LivingCampSimulationHarness.mjs';
import {tracePlayerAction} from '../qa/ConvergenceDiagnostics.mjs';

test('viable physical player counterplan can move an undecided NPC with a second credible number',()=>{
 const r=runViableCounterplay({seed:74});assert.ok(r.swingMoved);
 assert.ok(r.actions.some(a=>a.action.startsWith('verify:')));
 assert.ok(r.actions.some(a=>a.action.startsWith('share:')));
 const shift=r.actions.find(a=>a.listenerId===r.swingId&&a.realIntentChanged);assert.ok(shift);
 assert.equal(shift.after.intendedVoteId,r.targetId);assert.equal(r.final[r.swingId].preference,r.endangeredId);
 assert.ok(shift.after.knownPlans.some(p=>p.targetId===r.targetId&&p.confirmed.length>=1));
 assert.ok(r.remaining<3600); // Semantic conversation costs, not reading time.
});
test('rejected player counterplan is retained as a failure rather than forced acceptance',()=>{
 const r=runViableCounterplay({seed:73});assert.equal(r.swingMoved,false);
 assert.ok(r.actions.some(a=>a.listenerId===r.swingId&&a.adoption.some(x=>x.outcome!=='commit')));
});
test('viable counterplay saves restore owned stories, actual minds and RNG at each action',()=>{
 const a=runViableCounterplay({seed:74}),b=runViableCounterplay({seed:74,reload:true});
 assert.deepEqual(b.projection,a.projection);assert.deepEqual(b.actions,a.actions);assert.equal(b.rngState,a.rngState);
});
test('endangered NPC with owned viable support can coordinate a counterplan through autonomous camp actions',()=>{
 const r=runViableCounterplay({seed:73,npcBottom:true});assert.ok(r.swingMoved);
 assert.ok(r.actions.some(a=>a.action==='autonomous-conversation'));assert.equal(r.final[r.endangeredId].targetId,r.targetId);
 assert.notEqual(r.final[r.endangeredId].preference,r.targetId);
});
test('NPC counterplan restore during physical conversations preserves individual votes and RNG',()=>{
 const a=runViableCounterplay({seed:73,npcBottom:true}),b=runViableCounterplay({seed:73,npcBottom:true,reload:true});
 assert.deepEqual(b.projection,a.projection);assert.deepEqual(b.actions,a.actions);assert.equal(b.rngState,a.rngState);
});
test('restore fixture resolves conversation participant from current actor registry',()=>quiet(()=>{
 const s=makeScrambleQa(),id=s.activity.npcs()[0].id,old=s.strategy.reasoning.person(id);
 s.restore();const current=s.strategy.reasoning.members.find(p=>p.id===id);assert.notEqual(current,old);
 s.idle();assert.ok(s.activity.beginConversation(current,{location:'beach',strategy:true}));
 assert.equal(s.activity.conversation.npcId,current.id);
}));
test('a refused counterpitch is not counted as an additional credible supporter',()=>quiet(()=>{
 const s=makeScrambleQa(),m=s.strategy.reasoning,[npc,target]=s.activity.npcs(),player=s.gm.player;
 const r=tracePlayerAction(m,player,npc,{id:`counter:${target.id}`},()=>m.statement({id:'refused-pitch',speakerId:player.id,
   listenerIds:[npc.id],subjectId:target.id,stance:'consider',confidence:.2,random:()=>0}));
 assert.ok(r.after.knownPlans.some(p=>p.uncertain.includes(player.id)));
 assert.equal(r.gainedCredibleVote,false);assert.equal(r.realIntentChanged,false);
}));
