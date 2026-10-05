import fs from 'node:fs';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {makeScrambleQa} from './ScrambleSimulationHarness.mjs';
import {CAST,quiet,seeded,withQaRandom} from './LivingCampSimulationHarness.mjs';
import {validateNaturalStrategy,runNaturalStrategy,NATURAL_FAMILIES} from './StrategicBehaviorHarness.mjs';
const {default:ScrambleActivityPlan}=await import('../src/modules/systems/ScrambleActivityPlan.js');
const {default:TribalCouncilSystem}=await import('../src/modules/systems/TribalCouncilSystem.js');
const {finishTribal}=await import('./TribalQaHarness.mjs');
const same=(a,b)=>a!=null&&b!=null&&String(a)===String(b);
const semantic=x=>Array.isArray(x)?x.map(semantic):x&&typeof x==='object'?Object.fromEntries(Object.entries(x).filter(([k])=>!['timestamp','updatedAt','startedAt','savedAt','recordedAt'].includes(k)).map(([k,v])=>[k,semantic(v)])):x;

// Controlled social structure and diverse personal wishes, not staged plans,
// commitments, assignments, motives, or ballots. Movement/planner negotiate.
export function runNegotiatedVote({size=7,structure='majority',seed=73,reload=false}={}) {
 return quiet(()=>withQaRandom(seeded(seed),()=>{
  const s=makeScrambleQa({seed,start:false,names:Array.from({length:size-1},(_,i)=>CAST[(seed+i)%CAST.length].firstName)}),gm=s.gm,A=gm.systems.allianceSystem;
  s.strategy.isActive=true;s.strategy.startedForPhaseKey=`${gm.day}-postChallenge`;s.strategy.playerTribeSafe=false;s.strategy.scramble=new ScrambleActivityPlan(gm,s.strategy,{rngState:seed});A.reset();s.memory.deserialize({});
  for(const p of gm.getPlayerTribe().members){p.campActivity=null;gm.systems.npcLocationSystem.updateNpcLocation(p.id,'beach');}gm.player.location='beach';
  s.strategy.seedNpcIntentTargetsForPhase();const people=s.activity.npcs(),groups=[];
  const form=(ids,type='core')=>{const a=A.createAlliance({memberIds:ids,type});for(const id of ids){a.memberStates[id].priority=.88;a.memberStates[id].commitment=.9;}groups.push({id:a.id,memberIds:ids});return a;};
  if(structure==='divided'){const n=Math.floor((size-1)/2);form(people.slice(0,n).map(p=>p.id));form(people.slice(n,2*n).map(p=>p.id));}
  else if(structure!=='no-alliance') {const group=people.slice(0,Math.min(5,size-2)).map(p=>p.id);form(group,structure==='voting-bloc'?'voting_bloc':'core');if(structure==='secret-core')form(group.slice(0,3));}
  const initial=Object.fromEntries(people.map(p=>[p.id,{preference:s.strategy.reasoning.state(p.id).preferredTargetId,lean:s.strategy.reasoning.state(p.id).intendedVoteId}]));
  const milestones=[];const save=label=>{milestones.push(label);if(reload)s.restore();};save('phase-start');
  s.activity.ensureStarted();s.strategy.scramble.scheduleAlliances();let first=false,commit=false,meeting=false,viable=false,five=false;
  while(gm.dayTimer>0){s.wait(Math.min(60,gm.dayTimer));const m=s.strategy.reasoning;
   if(!first&&m.metrics.statements){first=true;save('first-pitch');}if(!commit&&m.metrics.commitments){commit=true;save('first-commitment');}
   if(!meeting&&s.strategy.scramble.meetings.some(x=>x.status==='completed')){meeting=true;save('meeting');}
   if(!viable&&people.some(p=>m.planSupport(p.id).plans.some(x=>x.support>=Math.floor(size/2)))){viable=true;save('viable-plan');}
   if(!five&&gm.dayTimer<=300){five=true;save('final-five');}
  }
  save('before-Tribal');const m=s.strategy.reasoning,final=Object.fromEntries(people.map(p=>[p.id,{targetId:m.state(p.id).intendedVoteId,preference:m.state(p.id).preferredTargetId,reason:m.state(p.id).reason,status:m.state(p.id).intentStatus,history:m.state(p.id).intentHistory||[]} ]));
  const tribal=new TribalCouncilSystem(gm,{publish(){}}),summary=finishTribal({gm,tribal,members:gm.getPlayerTribe().members},{playerTargetId:people[0].id});
  const votes=summary.initialVotes.filter(v=>!same(v.voterId,gm.player.id)),counts=new Map();for(const v of votes)counts.set(String(v.targetId),(counts.get(String(v.targetId))||0)+1);
  return {size,structure,seed,initial,final,groups,distinctTargets:counts.size,leadingShare:Math.max(...counts.values())/votes.length,groupAlignment:groups.map(g=>{const c=new Map();for(const id of g.memberIds){const t=String(final[id].targetId);c.set(t,(c.get(t)||0)+1);}return Math.max(...c.values());}),votes:votes.map(v=>({voterId:v.voterId,targetId:v.targetId})),meetings:s.strategy.scramble.meetings,metrics:m.metrics,milestones,projection:semantic({strategy:s.strategy.serialize(),memory:s.memory.serialize(),alliances:A.serialize(),camp:s.activity.serialize(),votes:summary.initialVotes})};
 }));
}
export function concentration(results) {
 const table={};for(const family of NATURAL_FAMILIES){const rounds=results.filter(r=>r.family===family).flatMap(r=>r.rounds),avg=key=>rounds.reduce((n,r)=>n+(r.convergence?.[key]||0),0)/Math.max(1,rounds.length),sum=key=>rounds.reduce((n,r)=>n+(r.convergence?.[key]||0),0),ballots=sum('ballots');
 table[family]={rounds:rounds.length,distinctTargets:avg('distinctTargets'),leadingShare:avg('leadingShare'),secondShare:avg('secondShare'),initialIntentionRetention:rounds.reduce((n,r)=>n+r.stableFraction,0)/Math.max(1,rounds.length),initialProvisionalRetention:sum('provisionalRetention')/Math.max(1,sum('provisionalVoters')),finalPreferenceMatch:sum('preferenceMatches')/Math.max(1,ballots),compromises:sum('compromises'),commitments:rounds.reduce((n,r)=>n+(r.metrics.commitments||0),0),planAligned:sum('planAligned'),rogue:sum('rogue'),splitAssigned:sum('splitAssigned'),lateFlips:rounds.reduce((n,r)=>n+(r.metrics.lateFlips||0),0),intentionChanges:rounds.reduce((n,r)=>n+(r.metrics.intentionChanges||0),0),intentMatched:sum('intentMatched')/Math.max(1,ballots),reasons:rounds.reduce((a,r)=>{for(const[k,v]of Object.entries(r.convergence?.reasons||{}))a[k]=(a[k]||0)+v;return a;},{})};}
 return table;
}
export function baselineConcentration(report) {
 return Object.fromEntries(NATURAL_FAMILIES.map(family=>{const rounds=report.results.filter(r=>r.family===family).flatMap(r=>r.rounds),stats=rounds.map(r=>{const votes=r.votes.filter(v=>Object.hasOwn(r.initialIntent,String(v.voterId))),counts=new Map();for(const v of votes)counts.set(String(v.targetId),(counts.get(String(v.targetId))||0)+1);const sorted=[...counts.values()].sort((a,b)=>b-a);return {distinctTargets:counts.size,leadingShare:sorted[0]/votes.length,secondShare:(sorted[1]||0)/votes.length};});return [family,{rounds:rounds.length,...Object.fromEntries(['distinctTargets','leadingShare','secondShare'].map(k=>[k,stats.reduce((n,r)=>n+r[k],0)/stats.length])),initialIntentionRetention:rounds.reduce((n,r)=>n+r.stableFraction,0)/rounds.length}];}));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const results=validateNaturalStrategy({seedsPerFamily:Number(process.env.CONVERGENCE_SEEDS||4),roundLimit:4,onResult:(r,n)=>{console.log(JSON.stringify({progress:n,family:r.family,rounds:r.rounds.length,restore:true,distinct:r.rounds.reduce((a,x)=>a+x.convergence.distinctTargets,0)/r.rounds.length,leading:r.rounds.reduce((a,x)=>a+x.convergence.leadingShare,0)/r.rounds.length}));fs.writeFileSync('/tmp/convergence-trajectory-'+r.seed+'.json',JSON.stringify(r));}});
 const controlled=[];for(const size of [5,6,7,8,10])for(const structure of ['majority','divided','no-alliance','secret-core']){const a=runNegotiatedVote({size,structure,seed:73+size}),b=runNegotiatedVote({size,structure,seed:73+size,reload:true});assert.deepEqual(b.projection,a.projection);controlled.push({...a,projection:undefined,restoreEquivalent:true});}
 const activePlayer=[];for(const seed of [408,418,428,438]){const a=runNaturalStrategy('player-bottom',{seed,activePlayer:true}),b=runNaturalStrategy('player-bottom',{seed,activePlayer:true,reload:true});assert.deepEqual(b.projection,a.projection);assert.equal(b.rngState,a.rngState);activePlayer.push({seed,actions:a.playerActions,rounds:a.rounds,metrics:a.metrics,restoreEquivalent:true});}
 const baseline=JSON.parse(fs.readFileSync('docs/strategy-refinement/qa/natural-results.json','utf8'));
 const smells=[];for(const r of results)for(const round of r.rounds){const c=round.convergence;if(c.distinctTargets>=4&&r.family==='strong-majority'&&!c.splitAssigned)smells.push({family:r.family,seed:r.seed,round:round.round,type:'strong-majority-fragmentation'});if(c.leadingShare>.95)smells.push({family:r.family,seed:r.seed,round:round.round,type:'near-unanimity-review'});if(round.metrics.intentionChanges>c.ballots*3)smells.push({family:r.family,seed:r.seed,round:round.round,type:'flip-chaos-review'});}
 const report={baseline:'1ce249c3c984b619bf1784abf7a2134e2e3ed0db',setup:'Same #352 cast rotation, seeds, initial structures/circumstances and four-round policy. First-round majority circumstances are staged in that comparison; controlled runs use diverse startup preferences and no pre-set plans/commitments/ballots. Active player uses physical semantic conversation nodes.',summary:{runs:results.length,tribals:results.reduce((n,r)=>n+r.rounds.length,0),controlledRuns:controlled.length,activePlayerRuns:activePlayer.length},before:baselineConcentration(baseline),after:concentration(results),smells,results,controlled,activePlayer};
 fs.writeFileSync(process.env.CONVERGENCE_OUTPUT||'/tmp/vote-convergence-results.json',JSON.stringify(report,null,2));console.log(JSON.stringify({summary:report.summary,after:report.after,smells:smells.length}));
}
