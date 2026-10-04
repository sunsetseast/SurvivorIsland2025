import assert from 'node:assert/strict';
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
import {makeScrambleQa} from './ScrambleSimulationHarness.mjs';
import {quiet} from './LivingCampSimulationHarness.mjs';
import {scrambleNodes,resolveScrambleNode} from '../src/modules/systems/ScrambleConversation.js';
const { default: TribalCouncilSystem } = await import('../src/modules/systems/TribalCouncilSystem.js');
const family=['majority-decoy','split-vote','player-bottom','player-swing','verified-lie','player-lie','fake-reassurance','backup-activation','alliance-disagreement','reload-conversation','idol-rumor'];
function scene(scenario,seed) {
 const s=makeScrambleQa({seed,scenario:scenario==='player-bottom'?'player-danger':scenario==='player-swing'?'swing-player':'divided'});s.idle();s.strategy.scramble.meetings=[];s.strategy.scramble.nextApproachAt=3300;
 const [a,b,c,d]=s.activity.npcs(),player=s.gm.player;
 const m=()=>s.strategy.reasoning;
 const say=(id,speaker,listener,subject,extra={})=>m().statement({id,speakerId:speaker.id,listenerIds:[listener.id],subjectId:subject.id,random:()=>0,...extra});
 if(scenario==='majority-decoy') {for(const npc of s.activity.npcs())if(npc.id!==c.id)s.strategy.updateNpcIntentTarget(npc.id,c.id,{absoluteConfidence:.8});
   m().decoy(a.id,d.id,[c.id]);say('decoy',a,c,d,{mode:'decoy'});assert.equal(s.strategy.getNpcTargetIntent(a.id).targetId,c.id);assert.equal(m().knowledge(player.id).length,0);}
 if(scenario==='split-vote') {const plan=m().split(a.id,c.id,d.id,{[a.id]:c.id,[b.id]:d.id,[s.activity.npcs()[4].id]:c.id},[a.id]);
   assert.equal(plan.counts[c.id],2);m().acceptSplit(a.id);m().acceptSplit(b.id);assert.notEqual(s.strategy.getNpcTargetIntent(a.id).targetId,s.strategy.getNpcTargetIntent(b.id).targetId);}
 if(scenario==='player-bottom') {assert.equal(m().voteRead(player.id).targetId,null);say('warning',a,player,player,{topic:'safety',stance:'warned'});
   assert.ok(m().recap().statements.some(e=>e.topic==='safety'));s.activity.beginConversation(a,{location:'beach',strategy:true});
   const pitch=scrambleNodes(m(),{player,npc:a}).find(n=>n.id===`counter:${c.id}`);resolveScrambleNode(m(),pitch,a.id);s.activity.finishConversation({strategy:true});}
 if(scenario==='player-swing') {m().commit({id:'promise-a',speakerId:player.id,listenerIds:[a.id],targetId:c.id,random:()=>0});
   m().commit({id:'promise-b',speakerId:player.id,listenerIds:[b.id],targetId:d.id,random:()=>0});assert.equal(s.memory.getCampClaims(a.id).some(e=>e.id==='promise-b'),false);
   assert.equal(m().recap().promises.length,2);}
 if(scenario==='verified-lie') {say('account-a',a,player,c);say('account-b',b,player,d,{attributedId:a.id});assert.ok(m().contradictions(player.id).length);}
 if(scenario==='player-lie') {say('fabricated',player,b,b,{topic:'safety',stance:'warned',mode:'deliberate_lie',attributedId:c.id});
   const reliability=s.memory.getCampSourceReliability(b.id,player.id);say('source-denial',c,b,b,{topic:'safety',stance:'denied',refutesClaimId:'fabricated'});
   assert.ok(s.memory.getCampSourceReliability(b.id,player.id)<reliability);assert.equal(s.memory.getCampSourceReliability(d.id,player.id),.75);}
 if(scenario==='fake-reassurance') {s.strategy.updateNpcIntentTarget(a.id,player.id);say('safe',a,player,player,{topic:'safety',stance:'yes',mode:'reassurance_lie'});assert.equal(s.strategy.getNpcTargetIntent(a.id).targetId,player.id);}
 if(scenario==='backup-activation') {s.strategy.updateNpcIntentTarget(c.id,a.id);s.strategy.updateNpcIntentTarget(b.id,c.id);m().backup(a.id,c.id,d.id,[b.id]);assert.equal(m().activateBackup(c.id,'suspected_idol'),false);
   m().activateBackup(a.id,'suspected_idol');assert.equal(s.strategy.getNpcTargetIntent(b.id).targetId,d.id);assert.equal(s.strategy.getNpcTargetIntent(c.id).targetId,a.id);}
 if(scenario==='alliance-disagreement') {s.strategy.updateNpcIntentTarget(a.id,c.id);s.strategy.updateNpcIntentTarget(b.id,d.id);m().state(a.id).preferredTargetId=c.id;m().state(b.id).preferredTargetId=d.id;
   const result=m().resolveMeeting([a,b],{id:'disputed-meeting'},()=>.99);assert.equal(result.outcome,'disagreement');assert.notEqual(m().state(a.id).preferredTargetId,m().state(b.id).preferredTargetId);}
 if(scenario==='reload-conversation') {s.activity.beginConversation(a,{location:'beach',strategy:true});
   const nodes=scrambleNodes(m(),{player,npc:a});for(const node of [nodes.find(n=>n.id.startsWith('bluff_warning:')),nodes.find(n=>n.id.startsWith('commit:'))])resolveScrambleNode(m(),node,a.id);}
 if(scenario==='idol-rumor') {s.gm.systems.idolSystem.searchHistory.set(String(a.id),{count:1,day:s.gm.day,location:'jungleTrail'});
   s.memory.recordCampObservation({id:'search-seen',actorId:a.id,type:'idol_search_seen',witnessIds:[b.id],location:'jungleTrail',day:s.gm.day,campTime:3600});
   s.memory.shareCampObservation({fromId:b.id,toId:c.id,observationId:'search-seen'});assert.equal(m().idolAnswer(a.id).ownsIdol,false);assert.equal(m().searched(a.id),true);}
 s.strategy.scramble.scheduleAlliances();
 return s;
}
function projection(s) {return {time:s.gm.dayTimer,state:s.strategy.reasoning.serialize(),intents:[...s.strategy.npcIntentTargets],
 metadata:[...s.strategy.npcIntentMeta],board:s.strategy.tribalTargetBoard,facts:s.strategy.strategyFacts,
 memory:s.gm.systems.socialMemorySystem.serialize(),deals:s.gm.systems.dealSystem.serialize(),alliances:s.gm.systems.allianceSystem.serialize(),
 activities:s.gm.getPlayerTribe().members.map(p=>[p.id,p.location,p.campActivity]),reservation:s.activity.conversation,
 scramble:s.strategy.scramble.serialize(),recap:s.strategy.getPlayerStrategyRecap()};}
function run(scenario,reload,seed) {return quiet(()=>{
 const s=scene(scenario,seed);const milestones=[],actions=[];let halfway=false;
 // Restore after scenario choices as well as at exactly halfway through autonomous time.
 if(reload)s.restore();
 if(s.activity.conversation) {const cp=s.activity.conversation.checkpoint,before=JSON.stringify(projection(s));
   for(const id of Object.keys(cp.choices).filter(id=>!id.startsWith('roll:'))) {const n=scrambleNodes(s.strategy.reasoning,{player:s.gm.player,npc:s.activity.npcs()[0]}).find(n=>n.id===id);if(n)assert.equal(resolveScrambleNode(s.strategy.reasoning,n,s.activity.npcs()[0].id).replay,true);}
   assert.equal(JSON.stringify(projection(s)),before);s.activity.finishConversation({strategy:true});actions.push('complete_saved_conversation');}
 for(const npc of s.activity.npcs())if(npc.campActivity?.type==='idle_at_camp')npc.campActivity=null;
 s.activity.ensureStarted();
 while(s.gm.dayTimer>0) {if(!halfway&&s.gm.dayTimer<=1860){s.wait(s.gm.dayTimer-1800);halfway=true;milestones.push({remaining:1800,restored:reload});if(reload)s.restore();}
   if(s.strategy.scramble.invitation&&!s.activity.conversation) {const npc=s.activity.npcs().find(p=>p.id===s.strategy.scramble.invitation.npcId);
     if(npc&&s.present(npc,s.gm.player.location)){s.strategy.scramble.clearInvitation();if(s.activity.beginConversation(npc,{location:s.gm.player.location,strategy:true})){
       const nodes=scrambleNodes(s.strategy.reasoning,{player:s.gm.player,npc});resolveScrambleNode(s.strategy.reasoning,nodes.find(n=>n.id==='vote_read'),npc.id);
       s.activity.finishConversation({strategy:true});actions.push('npc_approach_conversation');continue;}}
   }
   s.wait(Math.min(60,s.gm.dayTimer));actions.push('wait');}
 s.strategy.computeTribalTargetBoard();
 const finalInputs=s.activity.npcs().map(p=>({id:p.id,...s.strategy.getNpcTargetIntent(p.id)}));
 const metrics=s.strategy.reasoning.metrics;
 const tribal=new TribalCouncilSystem(s.gm,{publish(){}});tribal.buildTribeContext(1);
 const tribalWeights=finalInputs.map(input=>({id:input.id,targetId:input.targetId,
   weight:input.targetId?tribal._getStrategyIntentWeight(s.activity.npcs().find(p=>p.id===input.id),s.gm.getPlayerTribe().members.find(p=>p.id===input.targetId)):0}));
 return {scenario,seed,semanticMinutes:60,saveMilestones:milestones,actions:actions.length,metrics,tribalWeights,
   activityHistory:s.strategy.scramble.history.length,strategicConversations:s.strategy.scramble.history.filter(e=>e.type==='conversation_resolved').length,
   playerApproaches:s.strategy.scramble.history.filter(e=>e.type==='npc_approach').length,
   deals:Object.keys(s.gm.systems.dealSystem.dealsById).length,rumors:Object.values(s.gm.systems.socialMemorySystem.memory).reduce((n,m)=>n+(m.campClaims||[]).filter(c=>c.origin==='hearsay').length,0),
   meetings:s.strategy.scramble.meetings.map(m=>({id:m.id,status:m.status,outcome:m.outcome?.outcome})),
   finalTargetBoard:s.strategy.tribalTargetBoard,tribalIndividualInputs:finalInputs,projection:projection(s)};
 });}
export function validateIntelligenceHarness() {return family.map((scenario,i)=>{const seed=73+i,normal=run(scenario,false,seed),restored=run(scenario,true,seed);
 assert.deepEqual(restored.projection,normal.projection,`${scenario} production save/load equivalent`);
 const {projection,...report}=normal;return {...report,saveLoadEquivalent:true};});}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {const report=validateIntelligenceHarness();
 if(process.env.STRATEGY_QA_OUTPUT)fs.writeFileSync(process.env.STRATEGY_QA_OUTPUT,JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));}
