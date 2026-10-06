import assert from 'node:assert/strict';
import {makeScrambleQa} from './ScrambleSimulationHarness.mjs';
import {quiet,seeded,withQaRandom} from './LivingCampSimulationHarness.mjs';
const {scrambleNodes,resolveScrambleNode}=await import('../src/modules/systems/ScrambleConversation.js');
import {captureConvergence,tracePlayerAction} from './ConvergenceDiagnostics.mjs';
const {default:ScrambleActivityPlan}=await import('../src/modules/systems/ScrambleActivityPlan.js');
const same=(a,b)=>String(a)===String(b);
const semantic=x=>Array.isArray(x)?x.map(semantic):x&&typeof x==='object'?Object.fromEntries(Object.entries(x).filter(([k])=>!['timestamp','updatedAt','startedAt','savedAt','recordedAt'].includes(k)).map(([k,v])=>[k,semantic(v)])):x;

// Configure an unlocked danger, trusted ally and uncertain middle voter, not
// final commitments/ballots. Every player action uses actual conversation
// checkpoint RNG and physical semantic time. NPC actions remain production.
export function runViableCounterplay({seed=73,reload=false,npcBottom=false}={}) {
 const rng=seeded(seed);
 return quiet(()=>withQaRandom(rng,()=>{
  const s=makeScrambleQa({seed,start:false}),gm=s.gm,A=gm.systems.allianceSystem;
  s.strategy.isActive=true;s.strategy.startedForPhaseKey=`${gm.day}-postChallenge`;s.strategy.playerTribeSafe=false;
  s.strategy.scramble=new ScrambleActivityPlan(gm,s.strategy,{rngState:seed});A.reset();s.memory.deserialize({});
  s.strategy.seedNpcIntentTargetsForPhase();s.activity.ensureStarted();s.idle();
  const people=s.activity.npcs(),[opponent,ally,swing,target,other,extra]=people;
  const endangered=npcBottom?extra:gm.player;
  const lean=(p,t)=>{s.strategy.updateNpcIntentTarget(p.id,t.id,{reason:'personal_preference',absoluteConfidence:.2,intentStatus:'lean'});s.strategy.reasoning.state(p.id).preferredTargetId=t.id;};
  for(const p of [opponent,swing,other])lean(p,endangered);
  lean(ally,target);if(npcBottom)lean(endangered,opponent);
  const pact=A.createAlliance({memberIds:[endangered.id,ally.id],type:'core'});
  pact.memberStates[ally.id].priority=.85;pact.memberStates[ally.id].commitment=.85;
  gm.systems.trustSystem.setTrust(ally.id,endangered.id,85);gm.systems.trustSystem.setTrust(swing.id,endangered.id,70);
  gm.systems.trustSystem.setTrust(endangered.id,ally.id,85);
  gm.systems.trustSystem.setTrust(swing.id,ally.id,75);
  const actions=[],milestones=[],checkpoint=label=>{milestones.push(label);if(reload)s.restore();};
  const actor=id=>s.strategy.reasoning.person(id);
  checkpoint('initial-danger');
  // The player owns an attributed warning and a claim worth verifying.
  // The alleged swing has made no pledge; the source can be wrong.
  s.strategy.reasoning.statement({id:'danger',speakerId:opponent.id,listenerIds:[endangered.id],subjectId:endangered.id,
    topic:'safety',stance:'warned',mode:'hearsay',attributedId:other.id});
  s.strategy.reasoning.statement({id:'alleged-swing',speakerId:opponent.id,listenerIds:[endangered.id],subjectId:endangered.id,
    topic:'commitment',stance:'yes',mode:'hearsay',attributedId:swing.id});
  checkpoint('warning');
  if(npcBottom)s.memory.recordCampClaim({id:'owned-danger',speakerId:opponent.id,listenerIds:[endangered.id],subjectId:endangered.id,
    topic:'safety',stance:'warned',origin:'firsthand',confidence:.8,confidenceByListener:{[endangered.id]:.8},day:gm.day,campTime:gm.dayTimer});
  if(!npcBottom){
    const talk=(id,choose)=>{
      const npc=actor(id);assert.ok(s.activity.beginConversation(npc,{location:gm.player.location,strategy:true}));
      const m=s.strategy.reasoning,node=choose(scrambleNodes(m,{player:gm.player,npc}));assert.ok(node,'owned contextual action exists');
      actions.push(tracePlayerAction(m,gm.player,npc,node,()=>resolveScrambleNode(m,node,npc.id)));
      s.activity.finishConversation({strategy:true,turns:1});checkpoint(node.id);return actions.at(-1);
    };
    talk(swing.id,nodes=>nodes.find(n=>n.id==='verify:alleged-swing'));
    talk(ally.id,nodes=>nodes.find(n=>n.id===`counter:${target.id}`));
    talk(ally.id,nodes=>nodes.find(n=>n.id===`commit:${target.id}`));
    // Re-resolve by ID after restore. Sharing a genuinely heard ally's response
    // supplies a real second number, unlike a bare unsupported alternate pitch.
    const heard=s.strategy.reasoning.knowledge(gm.player.id).find(e=>same(e.speakerId,ally.id)&&same(e.subjectId,target.id)&&e.topic==='commitment');
    if(heard){
      talk(swing.id,nodes=>nodes.find(n=>n.id===`share:${heard.id}`));
      talk(swing.id,nodes=>nodes.find(n=>n.id===`counter:${target.id}`));
      talk(swing.id,nodes=>nodes.find(n=>n.id===`commit:${target.id}`));
    }
  }else{
    // Owned starting support: one truthful tentative ally and one actual player
    // pledge, not pre-set NPC ballots. Then ordinary physical NPC planning runs.
    const m=s.strategy.reasoning,before=m.state(endangered.id).intendedVoteId;
    m.statement({id:'ally-open',speakerId:ally.id,listenerIds:[endangered.id],subjectId:target.id,
      topic:'target',stance:'consider'});
    m.commit({id:'outsider-pledge',speakerId:gm.player.id,listenerIds:[endangered.id],targetId:target.id});
    actions.push({action:'received-counter-support',before,after:m.state(endangered.id).intendedVoteId});checkpoint('counter-support');
    s.activity.interrupt(actor(endangered.id),'seek-counter-numbers');
    while(gm.dayTimer>0){s.wait(Math.min(60,gm.dayTimer));if(gm.dayTimer===1800||gm.dayTimer===300)checkpoint(`npc-time:${gm.dayTimer}`);}
    actions.push(...s.strategy.scramble.history.filter(e=>e.type==='conversation_resolved'&&same(e.actorId,endangered.id)).map(e=>({action:'autonomous-conversation',...e})));
  }
  const m=s.strategy.reasoning,final=captureConvergence(m,[ally.id,swing.id,endangered.id]);
  return {seed,npcBottom,actions,milestones,final,swingId:swing.id,allyId:ally.id,targetId:target.id,endangeredId:endangered.id,
    swingMoved:same(final[swing.id].targetId,target.id),remaining:gm.dayTimer,rngState:rng.state(),
    projection:semantic({strategy:s.strategy.serialize(),memory:s.memory.serialize(),alliances:A.serialize(),camp:s.activity.serialize()})};
 }));
}
