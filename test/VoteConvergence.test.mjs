import test from 'node:test';
import assert from 'node:assert/strict';
import { makeScrambleQa } from '../qa/ScrambleSimulationHarness.mjs';
import { quiet } from '../qa/LivingCampSimulationHarness.mjs';
import {allianceOpening} from '../src/modules/systems/AllianceConversation.js';
import {scrambleNodes,resolveScrambleNode} from '../src/modules/systems/ScrambleConversation.js';
import {getCampBehaviorProfile} from '../src/modules/systems/CampBehaviorProfile.js';
import {captureConvergence,classifyBallot} from '../qa/ConvergenceDiagnostics.mjs';
const {default:ScrambleActivityPlan}=await import('../src/modules/systems/ScrambleActivityPlan.js');
const {default:TribalCouncilSystem}=await import('../src/modules/systems/TribalCouncilSystem.js');

function setup(options={}) {
  const s=makeScrambleQa({start:false,...options});
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

function opening(s,owner,ally,target,{fake=false}={}) {
 const a=s.A.createAlliance({memberIds:[s.gm.player.id,owner,ally],type:'core',sincerityMap:fake?{[owner]:'fake'}:{}});
 if(fake)s.m.state(owner).pitchesByAudience[s.gm.player.id]={topic:'target',subjectId:target};
 assert.ok(s.activity.beginConversation(s.m.person(owner),{location:'beach',strategy:true}));
 s.activity.reserveConversationGroup([ally]);const cp=s.activity.conversation.checkpoint;cp.allianceId=a.id;
 return {lines:allianceOpening({gm:s.gm,player:s.gm.player,npc:s.m.person(owner),context:{allianceId:a.id},cp}),a};
}
check('truthful weak group preference is tentative language and is not a promise',s=>{
 const [owner,ally,target]=s.ids;lean(s,owner,target);const {lines}=opening(s,owner,ally,target);
 const speech=lines.filter(l=>l.name===s.m.person(owner).firstName).at(-1);
 assert.match(speech.text,/where my head is/);assert.doesNotMatch(speech.text,/I’m voting/);
 const claim=s.m.knowledge(s.gm.player.id).find(e=>e.id.endsWith(`alliance-opening:${owner}`));
 assert.equal(claim.topic,'target');assert.equal(claim.stance,'consider');assert.equal(s.m.state(owner).committedTargetId,null);
});
check('truthful mature opening records the commitment it actually says',s=>{
 const [owner,ally,target]=s.ids;lean(s,owner,target);s.m.state(owner).committedTargetId=target;s.m.state(owner).intentStatus='committed';
 const {lines}=opening(s,owner,ally,target);assert.match(lines.filter(l=>l.name===s.m.person(owner).firstName).at(-1).text,/I’m voting/);
 assert.ok(s.m.knowledge(s.gm.player.id).some(e=>e.speakerId===owner&&e.topic==='commitment'&&e.stance==='yes'));
});
check('provisional and unsettled wording never manufactures a pledge',s=>{
 const [owner,,target]=s.ids;lean(s,owner,target);s.m.state(owner).intentStatus='provisional';
 assert.match(s.m.voteStatement(owner).line,/leaning/);assert.equal(s.m.voteStatement(owner).topic,'target');
 s.m.state(owner).intendedVoteId=null;assert.match(s.m.voteStatement(owner).line,/still figuring/);
});
check('accepted assignment opening describes its secondary vote rather than the primary',s=>{
 const [owner,ally,primary,secondary]=s.ids;s.m.split(ally,primary,secondary,{[ally]:primary,[owner]:secondary},[ally]);s.m.acceptSplit(owner);
 const {lines}=opening(s,owner,ally,secondary);const speech=lines.filter(l=>l.name===s.m.person(owner).firstName).at(-1);
 assert.match(speech.text,/vote is supposed to be/);assert.ok(speech.text.includes(s.m.person(secondary).firstName));assert.equal(s.m.state(owner).intendedVoteId,secondary);
});
check('fake group speaker maintains public cover without revealing or rewriting private ballot',s=>{
 const [owner,ally,publicTarget,privateTarget]=s.ids;lean(s,owner,privateTarget);
 const {lines}=opening(s,owner,ally,publicTarget,{fake:true});const speech=lines.filter(l=>l.name===s.m.person(owner).firstName).at(-1);
 assert.ok(speech.text.includes(s.m.person(publicTarget).firstName));assert.ok(!speech.text.includes(s.m.person(privateTarget).firstName));
 assert.equal(s.m.state(owner).intendedVoteId,privateTarget);
 assert.ok(s.m.knowledge(s.gm.player.id).some(e=>e.speakerId===owner&&e.subjectId===publicTarget));
});
check('immature preference against interlocutor does not invent a settled blindside decoy',s=>{
 const [owner,listener]=s.ids;lean(s,owner,listener);
 const agenda=s.m.agenda(owner,listener,{plan:true});assert.ok(!['reassure_target','spread_decoy'].includes(agenda.purpose));
 const r=s.m.resolveAgenda(s.m.person(listener),s.m.person(owner),{id:'weak-read',agenda:{purpose:'gather_intel',key:'weak',knownEvidence:[]}},()=>0);
 assert.equal(r.outcome,'uncertain');assert.equal(s.m.metrics.decoys||0,0);
});
check('weak target preference does not render knowingly false safety reassurance',s=>{
 const [owner]=s.ids;lean(s,owner,s.gm.player.id);assert.ok(s.activity.beginConversation(s.m.person(owner),{location:'beach',strategy:true}));
 const node=scrambleNodes(s.m,{player:s.gm.player,npc:s.m.person(owner)}).find(n=>n.id==='safety_read');
 const r=resolveScrambleNode(s.m,node,owner);assert.doesNotMatch(r.line,/You’re fine/);assert.equal(s.m.metrics.reassurances||0,0);
});
check('stale split acceptance cannot overwrite an already activated backup',s=>{
 const [owner,ally,primary,secondary]=s.ids;lean(s,ally,primary);s.m.split(owner,primary,secondary,{[ally]:primary},[owner]);
 s.m.backup(owner,primary,secondary,[ally]);s.m.activateBackup(owner,'suspected_idol');
 assert.equal(s.m.acceptSplit(ally),false);assert.equal(s.m.state(ally).intendedVoteId,secondary);
});
check('player pledge adds a second credible number and moves a real NPC intention',s=>{
 const [owner,ally,preferred,target]=s.ids;lean(s,owner,preferred);evidence(s,owner,ally,target);assert.equal(s.m.planSupport(owner).plans[0].confirmed.length,1);
 say(s,s.gm.player.id,owner,target,{topic:'commitment',stance:'yes'});
 assert.equal(s.m.state(owner).intendedVoteId,target);assert.equal(s.m.state(owner).preferredTargetId,preferred);
});
check('Tribal maturity caps distinguish provisional input from an actual pledge',s=>{
 const [owner,target]=s.ids,tribal=new TribalCouncilSystem(s.gm,{publish(){}});
 const weights={};for(const status of ['lean','provisional','committed','assignment','final']){
 s.strategy.updateNpcIntentTarget(owner,target,{absoluteConfidence:.9,intentStatus:status});weights[status]=tribal._getStrategyIntentWeight(s.m.person(owner),s.m.person(target));}
 assert.deepEqual(weights,{lean:.25,provisional:.65,committed:.9,assignment:.9,final:.9});
});
check('diagnostics retain owner-known plan after eliminated target is no longer legal',s=>{
 const [owner,ally,target]=s.ids;lean(s,owner,target);evidence(s,owner,ally,target);const before=captureConvergence(s.m,[owner]);
 s.m.person(target).isOut=true;s.gm.day+=1;assert.equal(s.m.planSupport(owner).plans.length,0);
 assert.equal(classifyBallot(before[owner],target),'known_plan');
});
check('diagnostic rogue classification exempts holdouts, backups and competing known plans',s=>{
 const [owner,ally,primary,secondary]=s.ids;lean(s,owner,secondary);majority(s,owner,primary);let snapshot=captureConvergence(s.m,[owner])[owner];
 assert.notEqual(classifyBallot(snapshot,secondary),'intentional_outside_known_plans');
 snapshot={...snapshot,status:'final',confidence:.8,reason:'personal_holdout'};assert.equal(classifyBallot(snapshot,secondary),'protected_holdout');
 snapshot={...snapshot,reason:'strategic_compromise',backup:secondary};assert.equal(classifyBallot(snapshot,secondary),'active_backup');
 snapshot={...snapshot,backup:null,coalitions:[{targetId:secondary,weight:.8}]};assert.equal(classifyBallot(snapshot,secondary),'coalition_plan');
});
check('old save migration preserves explicit promise and strong provisional direction',s=>{
 const payload=s.strategy.serialize(),[a,b]=s.ids;for(const id of [a,b])delete payload.strategic.states[id].intentStatus;
 payload.strategic.states[a].committedTargetId=s.ids[2];payload.strategic.states[b].reason='negotiated';payload.strategic.states[b].confidence=.7;
 s.strategy.deserialize(payload);assert.equal(s.m.state(a).intentStatus,'committed');assert.equal(s.m.state(b).intentStatus,'provisional');assert.equal(s.m.state(b).committedTargetId,null);
});
test('a fake meeting convener is not automatically assigned the split they propose',()=>quiet(()=>{
 const s=setup({names:['Cirie','Tony','Sandra','Parvati','Jeremy','Natalie','Yul','Michele']}),group=s.activity.npcs().slice(0,7);
 group.sort((a,b)=>getCampBehaviorProfile(b).strategyDrive-getCampBehaviorProfile(a).strategyDrive);
 const owner=group[0],primary=s.activity.npcs().at(-1),secondary=s.gm.player;
 const a=s.A.createAlliance({memberIds:group.map(p=>p.id),type:'core',sincerityMap:{[owner.id]:'fake'}});
 for(const p of group){lean(s,p.id,p.id===owner.id?secondary.id:primary.id);if(p.id!==owner.id)s.m.state(p.id).committedTargetId=primary.id;
 for(const other of group)if(p!==other)s.gm.systems.trustSystem.setTrust(p.id,other.id,80);}
 evidence(s,owner.id,owner.id,primary.id,{topic:'idol_suspicion',stance:'possible'});
 const accepted=[],original=s.m.acceptSplit.bind(s.m);s.m.acceptSplit=id=>{accepted.push(id);return original(id);};
 s.m.resolveMeeting(group,{id:'fake-split',allianceId:a.id},()=>0);
 assert.equal(s.m.metrics.splitPlans,1);assert.ok(!accepted.includes(owner.id));assert.notEqual(s.m.state(owner.id).intentStatus,'assignment');
}));
test('all six negotiated 4–2 assignments survive ordinary pitches and expiry',()=>quiet(()=>{
 const s=setup({names:['Cirie','Tony','Sandra','Parvati','Jeremy','Natalie','Yul','Michele']}),group=s.ids.slice(0,6),[primary,secondary]=s.ids.slice(6);
 // Eight eligible ballots: the observer lost their vote. No final NPC ballot
 // is injected; acceptance goes through production split/acceptance APIs.
 s.gm.player.hasVote=false;
 const assignments=Object.fromEntries(group.map((id,i)=>[id,i<4?primary:secondary]));
 s.m.split(group[0],primary,secondary,assignments,[group[0]]);for(const id of group)s.m.acceptSplit(id);
 s.gm.dayTimer=0;for(const id of group){s.m.adoption(id,group[0],primary,{random:()=>0});s.m.reconsiderVote(id,{eventId:'split-expiry',final:true});}
 assert.deepEqual(group.map(id=>s.m.state(id).intendedVoteId),[primary,primary,primary,primary,secondary,secondary]);
}));
