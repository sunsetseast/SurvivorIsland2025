import test from 'node:test';
import assert from 'node:assert/strict';
import { makeScrambleQa } from '../qa/ScrambleSimulationHarness.mjs';
import { quiet } from '../qa/LivingCampSimulationHarness.mjs';
const {default:ScrambleActivityPlan}=await import('../src/modules/systems/ScrambleActivityPlan.js');
const {default:TribalCouncilSystem}=await import('../src/modules/systems/TribalCouncilSystem.js');

function setup() {
  const s=makeScrambleQa({start:false});
  s.strategy.isActive=true;s.strategy.playerTribeSafe=false;
  s.strategy.scramble=new ScrambleActivityPlan(s.gm,s.strategy,{rngState:73});
  s.strategy.seedNpcIntentTargetsForPhase();s.idle();s.gm.systems.allianceSystem.reset();s.memory.deserialize({});
  const ids=s.activity.npcs().map(p=>p.id);
  return {...s,ids,A:s.gm.systems.allianceSystem,get m(){return s.strategy.reasoning;}};
}
const check=(name,fn)=>test(name,()=>quiet(()=>fn(setup())));
const lean=(s,id,target)=>{s.m.state(id).preferredTargetId=target;s.strategy.updateNpcIntentTarget(id,target,{reason:'personal_preference',absoluteConfidence:.2,intentStatus:'lean'});};
const say=(s,speaker,listener,target,extra={})=>s.m.statement({id:`test:${Object.keys(s.m.resolved).length}`,speakerId:speaker,listenerIds:[listener],subjectId:target,random:()=>0,...extra});
const evidence=(s,owner,voter,target,extra={})=>s.memory.recordCampClaim({id:`owned:${owner}:${voter}:${s.memory.getCampClaims(owner).length}`,speakerId:voter,listenerIds:[owner],subjectId:target,topic:'commitment',stance:'yes',origin:'participant',confidence:.8,confidenceByListener:{[owner]:.8},day:s.gm.day,campTime:s.gm.dayTimer,...extra});
function majority(s,owner,target,exclude=[]) { for(const id of s.ids.filter(id=>id!==owner&&id!==target&&!exclude.includes(id)).slice(0,4))evidence(s,owner,id,target); }

check('startup is a personal preference and weak lean, never a commitment',s=>{
 for(const id of s.ids){const st=s.m.state(id);assert.ok(st.preferredTargetId);assert.equal(st.intendedVoteId,st.preferredTargetId);
 assert.equal(st.committedTargetId,null);assert.equal(st.intentStatus,'lean');assert.equal(s.strategy.getNpcTargetIntent(id).confidence,.2);}
});
check('Tribal caps weak lean authority and ignores board pressure against a direct intent',s=>{
 const [id,target,other]=s.ids;lean(s,id,target);const tribal=new TribalCouncilSystem(s.gm,{publish(){}});
 s.gm.flags.tribalTargetBoard={heatMap:{[other]:9}};
 assert.equal(tribal._getStrategyIntentWeight(s.m.person(id),s.m.person(target)),.2);
 assert.equal(tribal._getStrategyIntentWeight(s.m.person(id),s.m.person(other)),0);
});
check('a real explicit promise matures the speaker ballot without changing preference',s=>{
 const [id,listener,preferred,target]=s.ids;lean(s,id,preferred);
 s.m.commit({id:'commit',speakerId:id,listenerIds:[listener],targetId:target,random:()=>0});
 assert.equal(s.m.state(id).intentStatus,'committed');assert.equal(s.m.state(id).intendedVoteId,target);assert.equal(s.m.state(id).preferredTargetId,preferred);
});
check('credible majority creates strategic compromise while preference stays intact',s=>{
 const [id,preferred,target]=s.ids;lean(s,id,preferred);majority(s,id,target);
 s.m.reconsiderVote(id,{eventId:'majority'});assert.equal(s.m.state(id).intendedVoteId,target);
 assert.equal(s.m.state(id).preferredTargetId,preferred);assert.equal(s.m.state(id).reason,'viable_majority');
});
check('one casual pitch does not immediately replace a personal preference',s=>{
 const [id,preferred,target,speaker]=s.ids;lean(s,id,preferred);say(s,speaker,id,target);
 assert.equal(s.m.state(id).intendedVoteId,preferred);
});
check('actual commitments outweigh hedges and open answers',s=>{
 const [id,voter,target]=s.ids;say(s,voter,id,target,{topic:'commitment',stance:'hedge'});
 const weak=s.m.planSupport(id).plans[0].support;s.gm.dayTimer-=60;
 say(s,voter,id,target,{topic:'commitment',stance:'yes'});assert.ok(s.m.planSupport(id).plans[0].support>weak*2);
 assert.equal(s.m.planSupport(id).plans[0].confirmed.length,1);
});
check('unknown private ballots contribute no owner support',s=>{
 const [owner,target]=s.ids;lean(s,owner,target);const before=s.m.planSupport(owner);
 for(const voter of s.ids.filter(x=>x!==target&&x!==owner))s.strategy.updateNpcIntentTarget(voter,target,{absoluteConfidence:.95});
 assert.deepEqual(s.m.planSupport(owner),before);
});
check('attributed hearsay and direct commitment count one voter',s=>{
 const [owner,voter,target,source]=s.ids;say(s,source,owner,target,{topic:'commitment',stance:'yes',mode:'hearsay',attributedId:voter});
 const weak=s.m.planSupport(owner).plans[0].support;s.gm.dayTimer-=60;say(s,voter,owner,target,{topic:'commitment',stance:'yes'});
 const p=s.m.planSupport(owner);assert.equal(p.accounts.length,1);assert.equal(p.plans[0].confirmed.length,1);assert.ok(p.plans[0].support>weak);
});
check('new direct correction overrides stale attributed vote without deleting history',s=>{
 const [owner,voter,old,next]=s.ids;say(s,voter,owner,old,{topic:'commitment',stance:'yes'});s.gm.dayTimer-=2400;
 say(s,voter,owner,next,{topic:'commitment',stance:'yes'});
 assert.equal(s.m.planSupport(owner).accounts[0].targetId,next);assert.equal(s.memory.getCampClaims(owner).length,2);
});
check('unsupported weak rumor cannot replace a fresh direct pledge',s=>{
 const [owner,voter,old,next,source]=s.ids;say(s,voter,owner,old,{topic:'commitment',stance:'yes'});s.gm.dayTimer-=60;
 say(s,source,owner,next,{mode:'hearsay',attributedId:voter});assert.equal(s.m.planSupport(owner).accounts[0].targetId,old);
});
check('stale commitment gradually loses support at semantic time',s=>{
 const [owner,voter,target]=s.ids;say(s,voter,owner,target,{topic:'commitment',stance:'yes'});const early=s.m.viability(owner,target);
 s.gm.dayTimer-=2400;assert.ok(s.m.viability(owner,target)<early);
});
check('high priority personally attended coalition proposal exerts social gravity',s=>{
 const [owner,other,preferred,target]=s.ids;lean(s,owner,preferred);const a=s.A.createAlliance({memberIds:[owner,other,s.ids[4]],type:'core'});
 a.memberStates[owner].priority=.95;a.memberStates[owner].commitment=.95;
 s.A.captureRoundPlan(a.id,[owner,other,s.ids[4]],{targetId:target,outcome:'proposed'},'meeting');
 s.m.reconsiderVote(owner,{eventId:'meeting'});assert.equal(s.m.state(owner).intendedVoteId,target);assert.equal(s.m.state(owner).reason,'alliance_consensus');
});
check('stronger overlapping pact beats a weak majority plan',s=>{
 const [owner,ally,preferred,target]=s.ids;lean(s,owner,preferred);
 const a=s.A.createAlliance({memberIds:[owner,ally,s.ids[4]],type:'temporary'}),b=s.A.createAlliance({memberIds:[owner,ally],type:'final_two'});
 a.memberStates[owner].priority=.2;a.memberStates[owner].commitment=.3;b.memberStates[owner].priority=.95;b.memberStates[owner].commitment=.95;
 s.A.captureRoundPlan(a.id,[owner,ally],{targetId:target,outcome:'tentative_consensus'},'weak');
 s.A.captureRoundPlan(b.id,[owner,ally],{targetId:preferred,outcome:'consensus'},'strong');
 s.m.reconsiderVote(owner,{eventId:'competition'});assert.equal(s.m.state(owner).intendedVoteId,preferred);
});
check('a secret meeting absent from owned evidence gives no gravity',s=>{
 const [owner,ally,target]=s.ids;const a=s.A.createAlliance({memberIds:[owner,ally,s.ids[3]],type:'core'});
 s.A.captureRoundPlan(a.id,[ally,s.ids[3]],{targetId:target,outcome:'consensus'},'secret');
 assert.deepEqual(s.m.knownAlliancePlans(owner),[]);
});
check('dead preference is abandoned under normal flexibility',s=>{
 const [owner,preferred,target]=s.ids;lean(s,owner,preferred);s.gm.dayTimer=600;majority(s,owner,target);
 s.m.reconsiderVote(owner,{eventId:'dead',final:true});assert.equal(s.m.state(owner).intendedVoteId,target);assert.equal(s.m.state(owner).preferredTargetId,preferred);
});
check('low flexibility and protected alternate can deliberately hold out',s=>{
 const [owner,preferred,target]=s.ids;lean(s,owner,preferred);s.m.state(owner).flexibility=0;
 const a=s.A.createAlliance({memberIds:[owner,target],type:'final_two'});for(const k of ['priority','commitment','loyalty'])a.memberStates[owner][k]=1;
 majority(s,owner,target);s.m.reconsiderVote(owner,{eventId:'holdout',final:true});
 assert.equal(s.m.state(owner).intendedVoteId,preferred);assert.equal(s.m.state(owner).reason,'personal_holdout');
});
check('fake alliance creates public consent while private plan remains independent',s=>{
 const [owner,ally,target,secret]=s.ids;lean(s,owner,secret);
 const a=s.A.createAlliance({memberIds:[owner,ally,s.ids[4]],type:'core',sincerityMap:{[owner]:'fake'}});
 s.A.captureRoundPlan(a.id,[owner,ally,s.ids[4]],{targetId:target,outcome:'consensus'},'cover');
 s.m.commit({id:'cover',speakerId:owner,listenerIds:[ally],targetId:target,lie:true,random:()=>0});s.m.reconsiderVote(owner,{eventId:'fake'});
 assert.equal(s.m.state(owner).intendedVoteId,secret);assert.ok(s.m.knowledge(ally).some(e=>e.topic==='commitment'&&e.subjectId===target));
});
check('accepted split assignments remain distinct during reconsideration and expiry',s=>{
 const [a,b,primary,secondary]=s.ids;s.m.split(a,primary,secondary,{[a]:primary,[b]:secondary},[a]);s.m.acceptSplit(a);s.m.acceptSplit(b);
 majority(s,b,primary);s.gm.dayTimer=0;for(const id of [a,b])s.m.reconsiderVote(id,{eventId:'expiry',final:true});
 assert.equal(s.m.state(a).intendedVoteId,primary);assert.equal(s.m.state(b).intendedVoteId,secondary);assert.equal(s.m.state(b).intentStatus,'assignment');
});
check('active backup stays authoritative only for informed participating minds',s=>{
 const [a,b,primary,secondary,unknown]=s.ids;lean(s,b,primary);lean(s,unknown,primary);
 s.m.backup(a,primary,secondary,[b]);s.m.activateBackup(a,'suspected_idol');s.m.reconsiderVote(b,{eventId:'backup',final:true});
 assert.equal(s.m.state(b).intendedVoteId,secondary);assert.equal(s.m.state(unknown).intendedVoteId,primary);
});
check('ordinary pitches cannot collapse a previously accepted split assignment',s=>{
 const [a,b,primary,secondary]=s.ids;s.m.split(a,primary,secondary,{[a]:primary,[b]:secondary},[a]);s.m.acceptSplit(b);
 assert.equal(s.m.adoption(b,a,primary,{belief:true,random:()=>0}),'hedge');assert.equal(s.m.state(b).intendedVoteId,secondary);
});
check('ordinary pitches cannot undo an explicitly activated known backup',s=>{
 const [a,b,primary,secondary]=s.ids;lean(s,b,primary);s.m.backup(a,primary,secondary,[b]);s.m.activateBackup(a,'suspected_idol');
 assert.equal(s.m.adoption(b,a,primary,{belief:true,random:()=>0}),'hedge');assert.equal(s.m.state(b).intendedVoteId,secondary);
});
check('final unresolved ballot crystallizes from owned evidence without RNG draw',s=>{
 const [owner,preferred,target]=s.ids;lean(s,owner,preferred);majority(s,owner,target);s.gm.dayTimer=0;const rng=s.strategy.scramble.rngState;
 s.m.reconsiderVote(owner,{eventId:'expiry',final:true});assert.equal(s.m.state(owner).intendedVoteId,target);assert.equal(s.m.state(owner).intentStatus,'final');assert.equal(s.strategy.scramble.rngState,rng);
});
check('late credible evidence can justify a change instead of rerolling',s=>{
 const [owner,early,late]=s.ids;lean(s,owner,early);s.gm.dayTimer=240;majority(s,owner,late);
 s.m.reconsiderVote(owner,{eventId:'late'});assert.equal(s.m.state(owner).intendedVoteId,late);assert.equal(s.m.metrics.lateFlips,1);
});
check('player promise affects listener support but hedge is not confirmed',s=>{
 const [owner,target]=s.ids;say(s,s.gm.player.id,owner,target,{topic:'commitment',stance:'hedge'});assert.equal(s.m.planSupport(owner).plans[0].confirmed.length,0);
 s.gm.dayTimer-=60;s.m.commit({id:'player',speakerId:s.gm.player.id,listenerIds:[owner],targetId:target,random:()=>0});assert.equal(s.m.planSupport(owner).plans[0].confirmed[0],s.gm.player.id);
});
check('player never has an automatic convergence decision',s=>{
 const [preferred,target]=s.ids;s.m.state(s.gm.player.id).intendedVoteId=preferred;majority(s,s.gm.player.id,target);
 assert.equal(s.m.reconsiderVote(s.gm.player.id,{eventId:'player',final:true}),null);assert.equal(s.m.state(s.gm.player.id).intendedVoteId,preferred);
});
check('reconsideration replay receipt survives production JSON restore',s=>{
 const [owner,preferred,target]=s.ids;lean(s,owner,preferred);majority(s,owner,target);
 s.m.reconsiderVote(owner,{eventId:'once'});const before=s.m.serialize(),rng=s.strategy.scramble.rngState;s.restore();s.m.reconsiderVote(owner,{eventId:'once'});
 assert.deepEqual(s.m.serialize(),before);assert.equal(s.strategy.scramble.rngState,rng);
});
check('statement replay cannot duplicate a convergence event',s=>{
 const [owner,voter,target]=s.ids;const args={id:'once',speakerId:voter,listenerIds:[owner],subjectId:target,topic:'commitment',stance:'yes',random:()=>0};
 s.m.statement(args);const before=s.m.serialize();s.m.statement(args);assert.deepEqual(s.m.serialize(),before);
});
check('old rich saves infer maturity without inventing a promise',s=>{
 const payload=s.strategy.serialize(),id=s.ids[0];delete payload.strategic.states[id].intentStatus;payload.strategic.states[id].reason='seed:startPhase';
 s.strategy.deserialize(payload);assert.equal(s.m.state(id).intentStatus,'lean');assert.equal(s.m.state(id).committedTargetId,null);
});
