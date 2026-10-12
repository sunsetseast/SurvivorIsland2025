import test from 'node:test';
import assert from 'node:assert/strict';
import { makeScrambleQa } from '../qa/ScrambleSimulationHarness.mjs';
import { quiet } from '../qa/LivingCampSimulationHarness.mjs';
function setup(pre = false) {
  const s = makeScrambleQa({names:['Sandra','Jeremy','Michele','Tony','Parvati','Ozzy','Tyson','Jay','Boston Rob']});
  s.idle(); s.strategy.scramble.meetings=[]; s.gm.systems.allianceSystem.reset(); s.memory.deserialize({});
  if(pre){s.gm.gamePhase='preChallenge';s.strategy.isActive=false;s.activity.phaseId=s.activity.phase;}
  const e=s.conversation.engine, by=n=>s.activity.members().find(p=>p.firstName===n);
  for(const p of s.activity.members()) for(const q of s.activity.members()) if(p.id!==q.id)s.gm.systems.trustSystem.setTrust(p.id,q.id,50);
  by('Michele').gameplayStyle='Competitive'; by('Michele').honesty=10;
  const act=(type,who,to,fields={})=>e.resolve(e.action(type,{speakerId:who.id,listenerIds:[to.id],...fields}));
  return {...s,e,by,act};
}
test('historical verification cannot confirm a statement made to a different recipient',()=>quiet(()=>{
  const s=setup(), m=s.by('Michele'), j=s.by('Jeremy'), t=s.by('Tony'), sandra=s.by('Sandra');
  s.act('promise',m,j,{subjectId:t.id});
  s.act('bluff',s.gm.player,sandra,{subjectId:t.id,allegedSourceId:m.id});
  const heard=s.e.knowledge(sandra.id).find(k=>k.speakerId===s.gm.player.id&&k.attributedId===m.id&&k.topic==='commitment');
  const r=s.act('verify',sandra,m,{claimId:heard.id});
  assert.match(r.responses[0].line,/did not say/);
}));
test('a truthful secondhand account verifies against the original recipient',()=>quiet(()=>{
  const s=setup(), m=s.by('Michele'), j=s.by('Jeremy'), t=s.by('Tony'), sandra=s.by('Sandra');
  s.act('promise',m,j,{subjectId:t.id});
  const original=s.e.knowledge(j.id).find(k=>k.speakerId===m.id&&k.topic==='commitment');
  s.act('share',j,sandra,{claimId:original.id});
  const heard=s.e.knowledge(sandra.id).find(k=>k.speakerId===j.id&&k.attributedId===m.id&&k.topic==='commitment');
  assert.match(s.act('verify',sandra,m,{claimId:heard.id}).responses[0].line,/what I told/);
}));

test('a nearby unfamiliar NPC remains eligible beyond six remote familiar people',()=>quiet(()=>{
  const s=setup(true), actor=s.by('Jeremy'), newcomer=s.by('Jay');
  actor.gameplayStyle='Social Genius';s.activity.effort[actor.id]=360;
  for(const p of s.activity.members()) {
    if(p.id===actor.id||p.id===newcomer.id) continue;
    s.gm.systems.trustSystem.setTrust(actor.id,p.id,80);
    s.activity.interrupt(p);s.activity.start(p,{type:'idle_at_camp',location:'shelter',duration:3000});
  }
  assert.ok(s.e.initiative.candidates(actor).some(c=>c.targetId===newcomer.id&&c.type==='check_in'));
  assert.ok(new Set(s.e.initiative.candidates(actor).map(c=>c.targetId)).size<=6);
}));
test('hearing about a person does not count as having talked to that person',()=>quiet(()=>{
  const s=setup(true), actor=s.by('Jeremy'), newcomer=s.by('Jay'), speaker=s.by('Tony');
  actor.gameplayStyle='Social Genius';s.activity.effort[actor.id]=360;
  s.act('speculate',speaker,actor,{subjectId:newcomer.id});
  assert.ok(s.e.initiative.candidates(actor).some(c=>c.targetId===newcomer.id&&c.type==='check_in'));
  s.act('check_in',actor,newcomer);
  assert.ok(!s.e.initiative.candidates(actor).some(c=>c.targetId===newcomer.id&&c.type==='check_in'));
}));
test('later same-tick speech does not authenticate an earlier fabricated account',()=>quiet(()=>{
  const s=setup(),m=s.by('Michele'), t=s.by('Tony'), sandra=s.by('Sandra');
  s.act('bluff',s.gm.player,sandra,{subjectId:t.id,allegedSourceId:m.id});
  const heard=s.e.knowledge(sandra.id).find(k=>k.speakerId===s.gm.player.id&&k.topic==='commitment');
  s.act('promise',m,s.gm.player,{subjectId:t.id});
  assert.match(s.act('verify',sandra,m,{claimId:heard.id}).responses[0].line,/did not say/);
}));
test('an earlier personal promise remains historical after a changed mind and JSON restore',()=>quiet(()=>{
  const s=setup(), m=s.by('Michele'), t=s.by('Tony'), sandra=s.by('Sandra');
  s.act('promise',m,s.gm.player,{subjectId:t.id});
  const original=s.e.knowledge(s.gm.player.id).find(k=>k.speakerId===m.id&&k.topic==='commitment');
  s.act('share',s.gm.player,sandra,{claimId:original.id});
  const heard=s.e.knowledge(sandra.id).find(k=>k.speakerId===s.gm.player.id&&k.topic==='commitment');
  s.gm.dayTimer-=60;s.act('withdraw',m,s.gm.player,{subjectId:t.id});
  s.restore();
  const e=s.gm.systems.conversationSystem.engine;
  assert.match(e.resolve(e.action('verify',{speakerId:sandra.id,listenerIds:[m.id],claimId:heard.id})).responses[0].line,/what I told/);
}));
test('social openings have stable distinct voices without changing semantic meaning',()=>quiet(()=>{
  const s=setup(true), npc=s.by('Jeremy'), styles=['Social Genius','Power Player','Shadow Strategist','Competitive','Wildcard','Lethal Charmer'];
  const lines=styles.map(style=>{npc.gameplayStyle=style;const a=s.e.action('check_in',{speakerId:npc.id,listenerIds:[s.gm.player.id]});return s.e.sentence(a);});
  assert.equal(new Set(lines).size,6);
  npc.gameplayStyle='Social Genius';const a=s.e.action('check_in',{speakerId:npc.id,listenerIds:[s.gm.player.id]});
  const r=s.e.resolve(a);assert.deepEqual(s.e.resolve(a),{...r,replay:true});assert.equal(r.playerLine,lines[0]);
}));
test('direct warnings distinguish owned evidence from concern and do not reveal a source',()=>quiet(()=>{
  const s=setup(),npc=s.by('Jeremy'), player=s.gm.player;
  const a=s.e.action('warn',{speakerId:npc.id,listenerIds:[player.id],subjectId:player.id});
  assert.match(s.e.sentence(a),/worried you might/);
  s.memory.recordCampClaim({id:'danger',speakerId:s.by('Tony').id,listenerIds:[npc.id],subjectId:player.id,topic:'target',stance:'possible',day:s.gm.day,campTime:s.gm.dayTimer});
  const line=s.e.sentence({...a,claimId:'danger'});
  assert.match(line,/Your name came up/);assert.ok(!line.includes('Tony'));assert.ok(!line.includes(player.firstName));
  assert.match(s.e.sentence({...a,claimId:'danger',subjectId:s.by('Parvati').id,listenerIds:[s.by('Parvati').id]}),/worried you might/);
}));

// The production first-immunity race displayed “Tribe undefined” for numeric IDs.
const {firstContactTribeForKey}=await import('../src/modules/views/FirstContactView.js');
test('first challenge standings resolve numeric tribe keys to actual names',()=>{
 const tribes=[{id:1,name:'Moto'},{id:2,name:'Luvu'}];
 assert.equal(firstContactTribeForKey(tribes,'1').name,'Moto');
 assert.equal(firstContactTribeForKey(tribes,2).name,'Luvu');
 assert.equal(firstContactTribeForKey([{tribeName:'Moto'}],'Moto').tribeName,'Moto');
});
const {default:CampScreen}=await import('../src/modules/screens/CampScreen.js');
test('painting a zero post-challenge clock cannot preempt the return-event coordinator',()=>quiet(()=>{
 const s=setup();s.strategy.reset();s.gm.dayTimer=0;
 const screen=new CampScreen();screen.ensureClockUI=()=>null;
 try{screen.renderClockUI();assert.equal(s.strategy.startedForPhaseKey,null);assert.equal(s.gm.dayTimer,0);assert.equal(screen.postChallengeInitPromise,null);}
 finally{screen.unsubscribeFromCampEventStarted?.();screen.unsubscribeFromCampEventEnded?.();screen.unsubscribeStrategicRequests?.();screen.unsubscribePairedArrival?.();screen.unsubscribeFromCampCheckpoint?.();}
}));
