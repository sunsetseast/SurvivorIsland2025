import test from 'node:test';import assert from 'node:assert/strict';
import {quiet} from '../qa/LivingCampSimulationHarness.mjs';import {makeConversationStrategyQa} from '../qa/ConversationStrategyHarness.mjs';
import {PERSON_READ_ANGLES} from '../src/modules/systems/ConversationActionCatalog.js';
const check=(name,fn)=>test(name,()=>quiet(()=>fn(makeConversationStrategyQa())));
for(const [readAngle] of PERSON_READ_ANGLES)check(`parity: named-person ${readAngle} read uses owned evidence`,s=>{
 const m=s.by('Michele'),j=s.by('Jeremy'),t=s.by('Tony');
 s.memory.recordCampObservation({id:'owned-pair',actorId:t.id,participantIds:[j.id],witnessIds:[m.id],type:'seen_together',location:'beach',day:s.gm.day,campTime:s.gm.dayTimer});
 s.memory.recordCampClaim({id:'owned-idol-read',speakerId:j.id,subjectId:t.id,listenerIds:[m.id],topic:'idol_suspicion',stance:'possible',origin:'inference',day:s.gm.day,campTime:s.gm.dayTimer});
 const r=s.act('person_read',s.gm.player,m,{subjectId:t.id,readAngle});assert.equal(r.invalid,undefined);assert.ok(r.responses[0].line.length);assert.ok(r.followUps.length);
 const owned=new Set([...s.e.knowledge(m.id),...s.memory.getCampObservations(m.id)].map(k=>k.id));assert.ok((r.responses[0].evidenceIds||[]).every(id=>owned.has(id)));assert.equal(s.e.knowledge(s.by('Sandra').id).some(k=>k.id==='owned-idol-read'),false);
});
check('parity: strategy-style question has character-specific response and continuation',s=>{
 const a=s.act('strategy_style',s.gm.player,s.by('Jeremy')),b=s.act('strategy_style',s.gm.player,s.by('Sandra'));assert.notEqual(a.responses[0].line,b.responses[0].line);assert.ok(a.followUps.length);assert.doesNotMatch(a.responses[0].line,/Power Player|probability/);
});
check('#355 save restores local memory, canonical claims, alliances, old Final Two Deal and cached checkpoint',s=>{
 const j=s.by('Jeremy'),t=s.by('Tony');s.act('promise',j,s.gm.player,{subjectId:t.id});const A=s.gm.systems.allianceSystem;A.createAlliance({memberIds:[s.gm.player.id,j.id],type:'final_two'});
 s.activity.beginConversation(j,{location:'beach',strategy:true});const cp={npcId:j.id,lastLine:'Jeremy told me Tony.',turnCount:1,topicsUsed:['vote_read'],choiceOutcomes:{'vote_read:1':{line:'Jeremy told me Tony.'}}};s.activity.conversation.checkpoint=cp;
 const p=JSON.parse(JSON.stringify(s.gm.createSavePayload()));delete p.systems.conversationSystem.semantic;p.systems.conversationSystem.moods=[[j.id,'guarded']];p.systems.conversationSystem.memoryLog=[{day:1,text:'Kept a promise'}];p.systems.conversationSystem.npcMemory={[j.id]:{lastTopic:'vote_read',intel:[{topic:'legacy',text:'A remembered conversation'}]}};
 p.systems.dealSystem.dealsById.legacy={id:'legacy',type:'FINAL_TWO',parties:[s.gm.player.id,j.id],status:'ACCEPTED',terms:{},createdDay:1};
 const claims=s.e.knowledge(s.gm.player.id).map(k=>k.id),alliances=JSON.stringify(A.serialize());assert.ok(s.gm.restoreSavePayload(p));
 assert.equal(s.conversation.moods.get(j.id),'guarded');assert.equal(s.conversation.npcMemory[j.id].lastTopic,'vote_read');assert.deepEqual(s.e.tasks.serialize(),{records:{}});assert.equal(Object.keys(s.e.objectives.records).length,0);
 assert.deepEqual(s.e.knowledge(s.gm.player.id).map(k=>k.id),claims);assert.equal(JSON.stringify(A.serialize()),alliances);assert.equal(s.gm.systems.dealSystem.dealsById.legacy.type,'FINAL_TWO');
 const before=JSON.stringify(s.memory.serialize()),session=s.conversation.view.session(s.by('Jeremy'),{});assert.equal(session.transcript.at(-1).text,cp.lastLine);s.conversation.view.session(s.by('Jeremy'),{});assert.equal(session.transcript.length,1);assert.equal(JSON.stringify(s.memory.serialize()),before);assert.deepEqual(s.activity.conversation.checkpoint.choiceOutcomes,cp.choiceOutcomes);
});
check('#355 pre-immunity save resumes camp and preserves history without recreating its unsaved transcript',s=>{
 s.gm.gamePhase='preChallenge';s.strategy.isActive=false;s.activity.phaseId=s.activity.phase;s.idle();const j=s.by('Jeremy');s.act('check_in',s.gm.player,j);s.activity.beginConversation(j,{location:'beach'});
 const p=JSON.parse(JSON.stringify(s.gm.createSavePayload()));delete p.systems.conversationSystem.semantic;p.systems.campActivitySystem.conversation=null;const count=s.memory.memory[j.id].conversationHistory.length;
 assert.ok(s.gm.restoreSavePayload(p));assert.equal(s.activity.conversation,null);assert.equal(s.by('Jeremy').campActivity,null);assert.equal(s.memory.memory[j.id].conversationHistory.length,count);assert.equal(Object.keys(s.e.receipts).length,0);
});
check('bring request hides unspoken objective target',s=>{s.act('delegate',s.by('Sandra'),s.gm.player,{subjectId:s.by('Michele').id,requestedAction:'bring',planTargetId:s.by('Tony').id});assert.equal(s.task().subjectId,null);assert.doesNotMatch(s.e.tasks.playerRequests(s.gm.player.id)[0].description,/Tony/);});
check('unaccepted report does not imply human acceptance',s=>{s.act('delegate',s.by('Sandra'),s.gm.player,{subjectId:s.by('Michele').id,requestedAction:'recruit',planTargetId:s.by('Tony').id});const t=s.task();s.act('report',s.gm.player,s.by('Sandra'),{delegationId:t.id,truthMode:'fabrication'});assert.equal(t.status,'pending');assert.equal(t.reports.length,0);});
check('planner doing information work personally uses information action, not recruitment',s=>{
 const sand=s.by('Sandra'),m=s.by('Michele'),t=s.by('Tony');s.memory.recordCampClaim({id:'personal-story',speakerId:sand.id,subjectId:t.id,listenerIds:[sand.id],topic:'idol_suspicion',stance:'possible',day:s.gm.day,campTime:s.gm.dayTimer});
 const o=s.e.objectives.establish(sand.id,{type:'blindside',targetId:t.id,explicit:true,work:{purpose:'pass_info',targetId:m.id,claimId:'personal-story'}});
 const r=s.e.objectives.execute(sand,m,{id:'personal-work',objectiveId:o.id,agenda:{purpose:'objective_recruit',requestedAction:'pass_info',claimId:'personal-story'}});assert.equal(r.invalid,undefined);assert.ok(s.e.knowledge(m.id).some(k=>k.evidenceIds.includes('personal-story')));assert.equal(o.steps.at(-1).type,'share');
});
