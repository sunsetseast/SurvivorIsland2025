import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { makeScrambleQa } from './ScrambleSimulationHarness.mjs';
import { CAST, quiet, seeded, withQaRandom } from './LivingCampSimulationHarness.mjs';
const { finishTribal } = await import('./TribalQaHarness.mjs');
const {default:ScrambleActivityPlan,ScrambleState}=await import('../src/modules/systems/ScrambleActivityPlan.js');
const {default:TribalCouncilSystem}=await import('../src/modules/systems/TribalCouncilSystem.js');
const {default:DealSystem}=await import('../src/modules/systems/DealSystem.js');
const {default:DealConsequencesSystem}=await import('../src/modules/systems/DealConsequencesSystem.js');
const same=(a,b)=>String(a)===String(b);
export const NATURAL_FAMILIES=['no-alliance','strong-majority','divided','competing-blocs','idol-concern','fake-alliance','secret-core','player-bottom','npc-bottom','target-warned'];
let deals,consequences;
const semantic=x=>Array.isArray(x)?x.map(semantic):x&&typeof x==='object'?Object.fromEntries(Object.entries(x).filter(([k])=>!['timestamp','updatedAt','startedAt','savedAt','recordedAt'].includes(k)).map(([k,v])=>[k,semantic(v)])):x;
const digest=x=>createHash('sha256').update(JSON.stringify(semantic(x))).digest('hex');
function projection(s){return semantic({day:s.gm.day,time:s.gm.dayTimer,phase:s.gm.gamePhase,strategy:s.strategy.serialize(),camp:s.activity.serialize(),memory:s.memory.serialize(),alliances:s.gm.systems.allianceSystem.serialize(),trust:s.gm.systems.trustSystem.serialize(),deals:s.gm.systems.dealSystem.serialize(),consequences:s.gm.systems.dealConsequencesSystem.serialize(),tribals:s.gm.tribalCouncilLog,survivors:s.gm.survivors.map(p=>({id:p.id,isOut:p.isOut,campActivity:p.campActivity,tribeId:p.tribeId,dealIds:p.dealIds})),completed:[...(s.gm._completedTribalKeys||[])],stages:[...(s.gm._tribalCompletionStages||[])]});}
export function runNaturalStrategy(family,{seed=401,reload=false,roundLimit=4,castSize=9}={}){
 return quiet(()=>{const rng=seeded(seed);return withQaRandom(rng,()=>{
 const oldNow=Date.now;Date.now=()=>1800000000000+seed;
 try{
 const offset=seed%CAST.length,names=Array.from({length:castSize},(_,i)=>CAST[(offset+i)%CAST.length].firstName);
 const s=makeScrambleQa({seed,start:false,names}),gm=s.gm,A=gm.systems.allianceSystem;
 A.reset();s.memory.deserialize({});gm.isMerged=false;gm.jury=[];gm.showGameOverScreen=()=>{gm.gameState='gameover';};gm._completedTribalKeys=new Set();gm._tribalCompletionStages=new Map();gm._tribalCompletionInFlight=new Set();
 if(!deals){deals=new DealSystem(gm);deals.initialize();consequences=new DealConsequencesSystem(gm);consequences.initialize();}deals.reset();consequences.reset();gm.systems.dealSystem=deals;gm.systems.dealConsequencesSystem=consequences;
 const ids=[gm.player.id,...gm.getPlayerTribe().members.filter(p=>!p.isPlayer).map(p=>p.id)];
 const form=(roster,type='core',extra={})=>A.createAlliance({memberIds:roster,type,...extra});
 let majority;
 if(family==='idol-concern')majority=form(ids.slice(1,9));
 else if(family!=='no-alliance')majority=form(ids.slice(0,family==='strong-majority'||family==='secret-core'||family.endsWith('bottom')||family==='target-warned'?7:4));
 if(family==='secret-core')form(ids.slice(1,4),'core',{secrecy:'secret'});
 if(family==='competing-blocs'){form([ids[1],...ids.slice(5,9)],'voting_bloc');majority.memberStates[ids[1]].priority=.82;}
 if(family==='fake-alliance')form(ids.slice(0,2),'final_two',{sincerityMap:{[ids[1]]:'fake'}});
 const rounds=[],milestones=[],metrics={},contactPairs=new Map();let redundant=0;
 const checkpoint=label=>{milestones.push(label);if(reload)s.restore();};
 for(let round=0;round<roundLimit&&!gm.player.isOut;round++){
  const live=gm.getPlayerTribe().members.filter(p=>!p.isOut);if(live.length<4)break;
  gm.gamePhase='postChallenge';gm.gameState='camp';gm.dayTimer=3600;gm.flags={};s.strategy.reset();s.strategy.isActive=true;s.strategy.startedForPhaseKey=`${gm.day}-postChallenge`;s.strategy.scrambleState=ScrambleState.ACTIVE;s.strategy.scramble=new ScrambleActivityPlan(gm,s.strategy,{rngState:seed+round*97});s.activity.phaseId=s.activity.phase;s.activity.conversation=null;
  for(const p of live){p.campActivity=null;p.hasVote=true;p.hasImmunity=p.isPlayer&&['no-alliance','divided','idol-concern','competing-blocs'].includes(family);p.tribeId=1;gm.systems.npcLocationSystem.updateNpcLocation(p.id,'beach');}gm.player.location='beach';
  s.strategy.seedNpcIntentTargetsForPhase();
  if(round===0&&['strong-majority','secret-core','player-bottom','npc-bottom','target-warned','fake-alliance','idol-concern'].includes(family)){
   const target=family==='player-bottom'?ids[0]:family==='npc-bottom'||family==='target-warned'?ids[2]:family==='fake-alliance'?ids[0]:ids.at(-1);
   const insiders=family.endsWith('bottom')||family==='target-warned'?ids.slice(1,7).filter(id=>!same(id,target)):family==='fake-alliance'?[ids[1]]:family==='idol-concern'?ids.slice(1,9):ids.slice(1,7);
   for(const id of insiders.filter(id=>!same(id,target))){s.strategy.updateNpcIntentTarget(id,target,{absoluteConfidence:.85,reason:'qa:initial-majority'});s.strategy.reasoning.state(id).committedTargetId=target;if(family==='idol-concern')s.strategy.reasoning.state(id).preferredTargetId=target;}
   if(family.endsWith('bottom'))A.exclude({allianceId:majority.id,proposerId:insiders[0],memberId:target,participantIds:insiders});
  }
  if(family==='idol-concern'){
   const leader=A.person(A.influential(majority,A.localMembers(majority))[0]),target=s.strategy.reasoning.state(leader.id).intendedVoteId;
   if(round===0)for(const id of majority.memberIds)for(const other of majority.memberIds)if(!same(id,other))gm.systems.trustSystem.setTrust(id,other,80);
   if(target)s.memory.recordCampClaim({id:`idol:${round}`,speakerId:leader.id,subjectId:target,topic:'idol_suspicion',stance:'possible',origin:'firsthand',confidence:.8,day:gm.day,campTime:gm.dayTimer});
  }
  if(round===2){gm.isMerged=true;A.onMerge();}
  checkpoint('after-initial-plan');s.activity.ensureStarted();s.strategy.scramble.scheduleAlliances();
  let priorStatements=0,first=false,meeting=false,warning=false,backup=false,leak=false;const changesBefore=s.strategy.reasoning.metrics.intentionChanges||0;
  const initial=Object.fromEntries(live.filter(p=>!p.isPlayer).map(p=>[p.id,s.strategy.reasoning.state(p.id).intendedVoteId]));
  while(gm.dayTimer>0){s.wait(Math.min(60,gm.dayTimer));const m=s.strategy.reasoning;
   if(!first&&(m.metrics.statements||0)>0){first=true;checkpoint('after-first-strategic-conversation');}
   if(!meeting&&s.strategy.scramble.meetings.some(x=>x.status==='completed')){meeting=true;checkpoint('after-alliance-meeting');}
   if(!warning&&(m.metrics.warnings||0)>0){warning=true;checkpoint('after-warning');}
   if(!backup&&(m.metrics.backups||0)>0){backup=true;checkpoint('after-backup-formation');}
   if(!leak&&(m.metrics.planLeaks||0)>0){leak=true;checkpoint('after-plan-leak');}
   if(gm.dayTimer===300)checkpoint('near-final-five-minutes');
   const history=s.strategy.scramble.history.filter(x=>x.type==='conversation_resolved');
   for(const e of history.slice(priorStatements)){const pair=[e.actorId,...e.participantIds].map(String).sort().join(':');const prior=contactPairs.get(pair);if(prior?.day===gm.day&&prior.at-e.campTime<420)redundant++;contactPairs.set(pair,{day:gm.day,at:e.campTime});}
   priorStatements=history.length;
  }
  checkpoint('immediately-before-Tribal');
  const m=s.strategy.reasoning;for(const [k,v] of Object.entries(m.metrics))metrics[k]=(metrics[k]||0)+v;
  metrics.strategicConversations=(metrics.strategicConversations||0)+s.strategy.scramble.history.filter(e=>e.type==='conversation_resolved').length;
  const votesBefore=Object.fromEntries(live.filter(p=>!p.isPlayer).map(p=>[p.id,m.state(p.id).intendedVoteId]));
  const playerTarget=live.find(p=>!p.isPlayer&&!p.hasImmunity)?.id;
  const tribal=new TribalCouncilSystem(gm,{publish(){}}),summary=finishTribal({gm,tribal,members:live},{playerTargetId:playerTarget});gm.handleTribalCouncilComplete(summary);
  for(const p of live.filter(p=>!p.isPlayer)){const dangerous=m.state(p.id).safetyBelief<.45,targeted=summary.initialVotes.some(v=>same(v.targetId,p.id));const key=dangerous?(targeted?'correctDangerBeliefs':'falseDangerBeliefs'):(targeted?'missedDangerBeliefs':'correctSafetyBeliefs');metrics[key]=(metrics[key]||0)+1;}
  const stable=Object.entries(initial).filter(([id,target])=>same(votesBefore[id],target)).length;
  rounds.push({round:round+1,day:summary.day,members:live.length,eliminatedId:summary.eliminatedId,initialIntent:initial,finalIntent:votesBefore,stableFraction:stable/Math.max(1,Object.keys(initial).length),votes:summary.initialVotes.map(v=>({voterId:v.voterId,targetId:v.targetId})),metrics:{...m.metrics,strategicConversations:s.strategy.scramble.history.filter(e=>e.type==='conversation_resolved').length},dangerReads:live.filter(p=>!p.isPlayer).map(p=>({id:p.id,safety:m.state(p.id).safetyBelief,targeted:summary.initialVotes.some(v=>same(v.targetId,p.id))}))});
  checkpoint('after-Tribal');
 }
 return {family,seed,rounds,milestones,metrics:{...metrics,...A.metrics,repeatedContactWithinSevenMinutes:redundant,playerEliminated:Boolean(gm.player.isOut)},projection:projection(s),rngState:rng.state()};
 }finally{Date.now=oldNow;}
 });});
}
// Controlled circumstances, unforced production scheduling/resolution. No split plan
// or motive is injected, and the group travels and spends six semantic minutes.
export function runSplitOpportunity({seed=73,reload=false}={}) {
 return quiet(()=>withQaRandom(seeded(seed),()=>{
  const s=makeScrambleQa({seed,names:['Cirie','Parvati','Tony','Natalie','Carolyn','Yul','Sandra','Jeremy','Michele','Ozzy']}),m=()=>s.strategy.reasoning,A=s.gm.systems.allianceSystem;
  s.idle();s.strategy.scramble.meetings=[];A.reset();s.memory.deserialize({});
  const group=s.activity.npcs().slice(0,8),primary=s.activity.npcs()[8].id;
  A.createAlliance({memberIds:group.map(p=>p.id),type:'core'});
  for(const p of group){s.strategy.updateNpcIntentTarget(p.id,primary,{absoluteConfidence:.9});m().state(p.id).preferredTargetId=primary;m().state(p.id).committedTargetId=primary;
   for(const other of group)if(p!==other)s.gm.systems.trustSystem.setTrust(p.id,other.id,80);
   s.memory.recordCampClaim({id:'risk:'+p.id,speakerId:p.id,subjectId:primary,topic:'idol_suspicion',stance:'possible',origin:'firsthand',confidence:.9,day:s.gm.day,campTime:s.gm.dayTimer});}
  s.strategy.scramble.scheduleAlliances();let saved=false;
  while(s.gm.dayTimer>0){s.wait(60);if(!saved&&m().metrics.splitPlans){saved=true;if(reload)s.restore();}}
  const splits=Object.values(m().plans).filter(p=>p.assignments);
  return {seed,metrics:{...m().metrics},splits,opposition:s.gm.getPlayerTribe().members.length-group.length,meetings:s.strategy.scramble.meetings.map(x=>({status:x.status,outcome:x.outcome})),projection:semantic({strategy:s.strategy.serialize(),memory:s.memory.serialize(),alliances:A.serialize(),camp:s.activity.serialize()})};
 }));
}
export function validateNaturalStrategy({seedsPerFamily=4,roundLimit=4,onResult=null,families=NATURAL_FAMILIES}={}){
 const results=[];let i=0;
 for(const family of families)for(let n=0;n<seedsPerFamily;n++){
 const seed=401+i++,a=runNaturalStrategy(family,{seed,roundLimit}),b=runNaturalStrategy(family,{seed,roundLimit,reload:true});
 assert.deepEqual(b.projection,a.projection,`${family}/${seed} semantic restore`);assert.equal(b.rngState,a.rngState,`${family}/${seed} RNG restore`);
 results.push({family,seed,rounds:a.rounds,milestones:b.milestones,metrics:a.metrics,saveLoadEquivalent:true,stateHash:digest(a.projection),rngState:a.rngState});
 onResult?.(results.at(-1),results.length);
 }
 return results;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const results=validateNaturalStrategy({seedsPerFamily:Number(process.env.STRATEGY_QA_SEEDS||4),roundLimit:Number(process.env.STRATEGY_QA_ROUNDS||4),onResult:(r,n)=>console.log(JSON.stringify({progress:n,family:r.family,rounds:r.rounds.length,restore:true}))});const summary={runs:results.length,rounds:results.reduce((n,r)=>n+r.rounds.length,0),metrics:results.reduce((a,r)=>{for(const[k,v]of Object.entries(r.metrics))if(typeof v==='number')a[k]=(a[k]||0)+v;return a;},{})};const report={baseline:'050c11f2beab194acfb690a6cd98112d230f778c',setup:'Production cast, configured initial coalition structures and initial majority circumstances; all subsequent planner actions, movement, statements, adoption, plans and votes use production systems. Player challenge immunity in four families permits longer trajectories. Other player eliminations end the run.',summary,results};fs.writeFileSync(process.env.STRATEGY_QA_OUTPUT||'/tmp/strategy-refinement-results.json',JSON.stringify(report,null,2));console.log(JSON.stringify(summary));}
