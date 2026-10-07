import test from 'node:test';
import assert from 'node:assert/strict';
import {quiet} from '../qa/LivingCampSimulationHarness.mjs';
import {makeConversationStrategyQa} from '../qa/ConversationStrategyHarness.mjs';
import {naturalPlayerRequest} from '../qa/PlayerStrategicRequestHarness.mjs';
import {TASK_PURPOSES,suggestedConversationActions,conversationCapabilities} from '../src/modules/systems/ConversationActionCatalog.js';
import {taskAction} from '../src/modules/systems/StrategicTaskActions.js';
const check=(name,fn)=>test(name,()=>quiet(fn));
function assignment(purpose) {
 const s=makeConversationStrategyQa(),sand=s.by('Sandra'),m=s.by('Michele'),t=s.by('Tony'),p=s.by('Parvati');
 s.act('promise',s.gm.player,sand,{subjectId:t.id});s.act('promise',m,sand,{subjectId:t.id});
 const claim=s.e.knowledge(sand.id).find(k=>k.topic==='commitment'&&k.speakerId===m.id);
 s.memory.recordCampClaim({id:'shared-argument',speakerId:sand.id,subjectId:m.id,listenerIds:[s.gm.player.id],topic:'public_conflict',stance:'argument',origin:'firsthand',day:s.gm.day,campTime:s.gm.dayTimer});
 const objective=s.e.objectives.establish(sand.id,{type:'blindside',targetId:t.id,explicit:true});
 const r=s.act('delegate',sand,s.gm.player,{subjectId:m.id,requestedAction:purpose,planTargetId:['decoy','backup','split'].includes(purpose)?p.id:t.id,primaryTargetId:t.id,
 claimId:['verify_rumor','pass_info','leak','protect_source'].includes(purpose)?claim.id:null,eventId:purpose==='repair'?'shared-argument':null,objectiveId:objective.id,keepSourcePrivate:purpose==='protect_source'});
 assert.equal(r.responses[0].stance,'pending');return {...s,objective,assigned:s.task()};
}
for(const [purpose] of TASK_PURPOSES) {
 check(`${purpose}: accept → real semantic action → receipt → report → objective → restore`,()=>{
  const s=assignment(purpose),t=s.assigned,m=s.by('Michele'),sand=s.by('Sandra'),player=s.gm.player;
  assert.equal(s.e.tasks.playerRequests(player.id)[0].status,'Requested');s.e.tasks.respond(t.id,player.id,true);
  assert.equal(s.gm.taskSystem.getVisibleTasksForPlayer(s.gm).strategicRequests[0].status,'Active');s.restore();const restored=s.e.tasks.get(t.id);
  assert.equal(suggestedConversationActions(s.e,player.id,[m.id])[0].delegationId,t.id);
  const {type,delegationId,requesterId,...fields}=taskAction(s.e,restored);assert.ok(type);
  s.act(type,player,s.by('Jeremy'),fields);assert.equal(restored.executionReceipt,undefined);
  const r=s.act(type,player,m,fields);assert.equal(r.invalid,undefined);assert.equal(restored.executionReceipt,r.actionId);
  if(purpose==='bring'){assert.equal(restored.status,'ready_to_walk');assert.ok(s.e.tasks.beginBring(t.id,player.id));assert.equal(restored.outcome.stance,'arrived');}
  else {assert.equal(restored.status,'awaiting_report');assert.equal(s.e.tasks.knownTasks(sand.id)[0].report,null);s.act('report',player,sand,{delegationId:t.id,truthMode:'truth'});}
  assert.equal(restored.status,'reported');assert.ok(s.e.knowledge(sand.id).some(k=>k.topic==='task_report'&&k.delegationId===t.id));
  s.e.objectives.evaluate(sand.id,s.gm.dayTimer);assert.ok(s.e.objectives.objective(sand.id).processedReports.length);
  const before=JSON.stringify(s.e.tasks.serialize());s.restore();assert.equal(JSON.stringify(s.e.tasks.serialize()),before);
 });
 check(`${purpose}: declined, privately ignored and expired are different`,()=>{
  const a=assignment(purpose);a.e.tasks.respond(a.assigned.id,a.gm.player.id,false);assert.equal(a.e.tasks.knownTasks(a.by('Sandra').id)[0].publicStatus,'refused');assert.equal(a.assigned.executionReceipt,undefined);
  const b=assignment(purpose),t=b.assigned,sand=b.by('Sandra');b.e.tasks.respond(t.id,b.gm.player.id,true);
  const known=JSON.stringify(b.e.tasks.knownTasks(sand.id)),reliability=b.e.tasks.reliability(sand.id,b.gm.player.id);
  assert.ok(b.e.tasks.ignore(t.id,b.gm.player.id));assert.equal(JSON.stringify(b.e.tasks.knownTasks(sand.id)),known);assert.equal(b.e.tasks.reliability(sand.id,b.gm.player.id),reliability);
  b.restore();assert.equal(b.e.tasks.get(t.id).status,'ignored');b.gm.gamePhase='tribalCouncil';b.e.tasks.expire();assert.equal(b.e.tasks.get(t.id).status,'expired');assert.equal(b.e.tasks.knownTasks(sand.id)[0].publicStatus,'accepted');
 });
 check(`${purpose}: real objective naturally selects and physically approaches human`,()=>{
  const s=naturalPlayerRequest({purpose});assert.equal(s.plan.type,'approach_player');assert.equal(s.plan.agenda.requestedAction,purpose);assert.equal(s.initialActivity.type,'travel');
  const t=s.openIncoming();assert.equal(t.status,'pending');assert.equal(s.e.tasks.plan(s.gm.player,s.gm.dayTimer),null);
  s.buttons.find(b=>b.label==='Agree to the request').onClick();assert.equal(t.publicStatus,'accepted');assert.ok(taskAction(s.e,t));assert.equal(s.gm.taskSystem.getVisibleTasksForPlayer(s.gm).strategicRequests[0].requester,'Sandra');
 });
 check(`${purpose}: false success report does not invent target execution or a vote`,()=>{
  const s=assignment(purpose),t=s.assigned,m=s.by('Michele'),sand=s.by('Sandra');s.e.tasks.respond(t.id,s.gm.player.id,true);
  const before=JSON.stringify(s.strategy.reasoning.state(m.id));s.act('report',s.gm.player,sand,{delegationId:t.id,truthMode:'fabrication'});
  assert.equal(t.executionReceipt,undefined);assert.equal(JSON.stringify(s.strategy.reasoning.state(m.id)),before);
  assert.ok(s.e.knowledge(sand.id).some(k=>k.topic==='task_report'&&k.delegationId===t.id&&k.speakerId===s.gm.player.id));
  assert.equal(s.memory.memory[m.id].conversationHistory.some(h=>h.action?.delegationId===t.id),false);s.restore();assert.equal(s.e.tasks.get(t.id).executionReceipt,undefined);
 });
}
function bring({reload=false,moved=false,refuse=false}={}) {
 const s=naturalPlayerRequest(),t=s.openIncoming(),sand=s.by('Sandra'),m=s.by('Michele');
 s.buttons.find(b=>b.label==='Agree to the request').onClick();s.conversation.endConversation();const destination=t.destination;
 s.move(s.e.place(m.id));assert.match(s.suggestions(m)[0].label,/Sandra wants to talk/);
 if(refuse){s.gm.systems.trustSystem.setTrust(m.id,s.gm.player.id,5);s.gm.systems.trustSystem.setTrust(m.id,sand.id,5);}
 const fields=taskAction(s.e,t),r=s.act(fields.type,s.gm.player,m,fields);if(refuse)return {s,t,r};
 assert.equal(r.responses[0].stance,'coming');assert.equal(t.status,'ready_to_walk');assert.ok(s.e.tasks.beginBring(t.id,s.gm.player.id));
 assert.equal(s.gm.player.campActivity.type,'travel');assert.equal(m.campActivity.external,true);assert.equal(s.e.present(m.id,destination),false);
 if(moved){s.activity.interrupt(sand,'leave');s.activity.start(sand,{type:'idle_at_camp',location:'rockyShore',duration:1800});}
 let saved=false;
 for(let i=0;i<20&&s.gm.player.campActivity?.type==='travel';i++){
  s.wait(30);if(reload&&!saved&&s.gm.player.campActivity?.type==='travel'){
   const pair=JSON.stringify([s.gm.player.campActivity,s.by('Michele').campActivity]),tasks=JSON.stringify(s.e.tasks.serialize());s.restore();saved=true;
   assert.equal(JSON.stringify([s.gm.player.campActivity,s.by('Michele').campActivity]),pair);assert.equal(JSON.stringify(s.e.tasks.serialize()),tasks);
  }
 }
 assert.equal(s.gm.player.location,destination);assert.equal(s.e.place(m.id),destination);
 return {s,t:s.e.tasks.get(t.id),r,saved};
}
check('natural human bring completes real multi-hop travel and offers a meeting without automatic votes',()=>{
 const {s,t}=bring();assert.equal(t.outcome.stance,'arrived');assert.equal(t.status,'reported');assert.equal(s.e.together(s.gm.player.id,s.by('Sandra').id),true);
 assert.equal(t.meetingIds.length,2);assert.equal(s.e.promises(s.by('Michele').id).some(p=>p.targetId===s.by('Tony').id),false);
 assert.equal(s.e.tasks.playerRequests(s.gm.player.id)[0].status,'Completed');
});
check('save/load during human paired travel preserves route and task identically',()=>{const {s,t,saved}=bring({reload:true});assert.ok(saved);assert.equal(t.outcome.stance,'arrived');assert.equal(s.e.tasks.playerRequests(s.gm.player.id)[0].status,'Completed');});
check('requested contestant independently refuses and requester movement cannot teleport the pair',()=>{
 const refused=bring({refuse:true});assert.equal(refused.r.responses[0].stance,'refused');assert.equal(refused.t.status,'awaiting_report');assert.equal(refused.s.gm.player.campActivity?.type==='travel',false);
 const moved=bring({moved:true});assert.equal(moved.t.outcome.stance,'requester_moved');assert.equal(moved.t.status,'awaiting_report');assert.notEqual(moved.s.gm.player.location,moved.s.e.place(moved.s.by('Sandra').id));
});
check('natural refusal immediately informs and adapts requester, with no human execution',()=>{
 const s=naturalPlayerRequest(),t=s.openIncoming();s.buttons.find(b=>b.label==='Decline the request').onClick();assert.equal(t.status,'refused');assert.equal(t.executionReceipt,undefined);
 assert.ok(s.e.objectives.evaluate(s.by('Sandra').id,s.gm.dayTimer).revision>0);assert.notEqual(s.e.objectives.plan(s.by('Sandra'),s.gm.dayTimer)?.targetId,s.gm.player.id);
});
check('accepted then ignored request stays unknown; requester naturally follows up using elapsed time',()=>{
 const s=naturalPlayerRequest(),t=s.openIncoming(),sand=s.by('Sandra');s.buttons.find(b=>b.label==='Agree to the request').onClick();
 const before=JSON.stringify(s.e.tasks.knownTasks(sand.id));s.e.tasks.ignore(t.id,s.gm.player.id);assert.equal(JSON.stringify(s.e.tasks.knownTasks(sand.id)),before);
 s.activity.finishConversation();s.activity.interrupt(sand,'qa_wait');s.activity.start(sand,{type:'idle_at_camp',location:s.gm.player.location,duration:1800});s.wait(901);
 const follow=s.e.objectives.plan(sand,s.gm.dayTimer);assert.equal(follow.agenda.purpose,'objective_followup');assert.equal(follow.agenda.followTaskId,t.id);assert.equal(t.executionReceipt,undefined);
});
check('doing nothing expires privately without requiring Leave undone',()=>{
 const s=assignment('recruit'),t=s.assigned,sand=s.by('Sandra');s.e.tasks.respond(t.id,s.gm.player.id,true);const known=JSON.stringify(s.e.tasks.knownTasks(sand.id));
 s.gm.dayTimer=0;s.e.tasks.expire();assert.equal(t.status,'expired');assert.equal(JSON.stringify(s.e.tasks.knownTasks(sand.id)),known);
});
check('player may leak request or warn target instead without falsely completing bring',()=>{
 const s=assignment('bring'),t=s.assigned;s.e.tasks.respond(t.id,s.gm.player.id,true);const request=s.e.knowledge(s.gm.player.id).find(k=>k.id===t.requestClaimId);assert.ok(request);
 s.act('share',s.gm.player,s.by('Tony'),{claimId:request.id});assert.ok(s.e.knowledge(s.by('Tony').id).some(k=>k.speakerId===s.gm.player.id&&k.evidenceIds.includes(request.id)));
 s.act('warn',s.gm.player,s.by('Michele'),{subjectId:s.by('Michele').id});assert.equal(t.executionReceipt,undefined);assert.equal(t.status,'queued');assert.equal(s.e.tasks.knownTasks(s.by('Sandra').id)[0].report,null);
});
check('reliability affects intermediary selection only after owned failure evidence',()=>{
 const good=naturalPlayerRequest(),bad=naturalPlayerRequest({lowReliability:true});assert.equal(good.plan.targetId,good.gm.player.id);assert.notEqual(bad.plan?.targetId,bad.gm.player.id);
 const s=assignment('recruit'),t=s.assigned,sand=s.by('Sandra');s.e.tasks.respond(t.id,s.gm.player.id,true);const old=s.e.tasks.reliability(sand.id,s.gm.player.id);s.e.tasks.ignore(t.id,s.gm.player.id);assert.equal(s.e.tasks.reliability(sand.id,s.gm.player.id),old);
 s.act('report',s.gm.player,sand,{delegationId:t.id,truthMode:'truth',reportStance:'not_done'});assert.ok(s.e.tasks.reliability(sand.id,s.gm.player.id)<old);
});
check('NPC hedge may be reconsidered while a human hedge never becomes automatic acceptance',()=>{
 const s=assignment('recruit'),t=s.assigned;s.e.tasks.respond(t.id,s.gm.player.id,'hedge');assert.equal(t.status,'hedged');s.restore();assert.equal(s.e.tasks.plan(s.gm.player,s.gm.dayTimer),null);
 const n=makeConversationStrategyQa(),sand=n.by('Sandra'),j=n.by('Jeremy'),m=n.by('Michele');n.gm.systems.trustSystem.setTrust(j.id,sand.id,30);n.act('delegate',sand,j,{subjectId:m.id,requestedAction:'recruit',planTargetId:n.by('Tony').id});const nt=n.task();assert.equal(nt.status,'hedged');
 n.gm.systems.trustSystem.setTrust(j.id,sand.id,95);n.act('follow_task',sand,j,{delegationId:nt.id});assert.equal(nt.publicStatus,'accepted');assert.equal(nt.status,'queued');
});
check('wrong voting subject cannot satisfy recruitment; unresolved task cannot be reported into acceptance',()=>{
 const s=assignment('recruit'),t=s.assigned,m=s.by('Michele');s.act('report',s.gm.player,s.by('Sandra'),{delegationId:t.id,truthMode:'fabrication'});assert.equal(t.status,'pending');
 s.e.tasks.respond(t.id,s.gm.player.id,true);s.act('ask_vote',s.gm.player,m,{subjectId:s.by('Parvati').id});assert.equal(t.executionReceipt,undefined);
});
check('idol protection invariant is enforced by resolver, including generic deal alias',()=>{
 const s=makeConversationStrategyQa(),j=s.by('Jeremy');s.gm.player.hasIdol=false;
 for(const type of ['idol_protect','deal'])assert.equal(s.act(type,s.gm.player,j,{dealType:'IDOL_PROTECTION'}).invalid,'no_idol');
 assert.equal(Object.keys(s.gm.systems.dealSystem.dealsById).length,0);
});
check('pre camp retains light strategy with future wording; post camp asks for an actual vote',()=>{
 const s=makeConversationStrategyQa(),j=s.by('Jeremy'),t=s.by('Tony');s.gm.gamePhase='preChallenge';s.strategy.isActive=false;
 assert.match(conversationCapabilities(s.e,s.gm.player.id,[j.id]).find(d=>d.type==='promise').label,/if we lose/);
 const before=s.act('promise',s.gm.player,j,{subjectId:t.id});assert.match(before.playerLine,/If we lose/);
 s.gm.gamePhase='postChallenge';s.strategy.isActive=true;assert.equal(conversationCapabilities(s.e,s.gm.player.id,[j.id]).find(d=>d.type==='promise').label,'Promise your vote');
});
check('simultaneous NPC approaches retain one invitation and restore the same waiting state',()=>{
 const s=makeConversationStrategyQa(),sand=s.by('Sandra'),j=s.by('Jeremy');for(const p of [sand,j]){s.activity.interrupt(p,'request');const a=s.activity.start(p,{type:'approach_player',location:'beach',duration:45,purpose:'gather_intel'});s.strategy.scramble.resolve(p,a,s.gm.dayTimer-45);}
 assert.equal(s.strategy.scramble.invitation.npcId,sand.id);assert.equal(sand.campActivity.type,'approach_wait');assert.equal(j.campActivity.type,'observe');
 const before=JSON.stringify([sand.campActivity,j.campActivity,s.strategy.scramble.invitation]);s.restore();assert.equal(JSON.stringify([s.by('Sandra').campActivity,s.by('Jeremy').campActivity,s.strategy.scramble.invitation]),before);
});
check('false recruitment report belongs to requester; only later direct contradiction damages reliability',()=>{
 const s=naturalPlayerRequest({purpose:'recruit'}),t=s.openIncoming(),sand=s.by('Sandra'),m=s.by('Michele');s.buttons.find(b=>b.label==='Agree to the request').onClick();
 const before=JSON.stringify(s.strategy.reasoning.state(m.id)),trust=s.gm.getTrust(sand.id,s.gm.player.id);s.act('report',s.gm.player,sand,{delegationId:t.id,truthMode:'fabrication'});
 assert.equal(t.executionReceipt,undefined);assert.equal(JSON.stringify(s.strategy.reasoning.state(m.id)),before);assert.equal(s.gm.getTrust(sand.id,s.gm.player.id),trust);
 const report=s.e.knowledge(sand.id).find(k=>k.topic==='commitment'&&k.delegationId===t.id&&k.speakerId===s.gm.player.id);assert.ok(report);assert.equal(report.evidenceIds.length,0);
 s.conversation.endConversation();s.move(s.e.place(m.id));s.activity.interrupt(sand,'verify');s.activity.start(sand,{type:'idle_at_camp',location:s.gm.player.location,duration:1200});
 s.act('verify',sand,m,{claimId:report.id});assert.ok(s.e.knowledge(sand.id).some(k=>k.refutesClaimId===report.id));assert.ok(s.gm.getTrust(sand.id,s.gm.player.id)<trust);
});
check('same planner can prefer an NPC intermediary or personal work over the human',()=>{
 const s=naturalPlayerRequest(),sand=s.by('Sandra'),j=s.by('Jeremy'),m=s.by('Michele');s.gm.systems.trustSystem.setTrust(sand.id,j.id,100);
 for(let i=0;i<3;i++)s.memory.recordCampObservation({id:`npc-connection:${i}`,actorId:j.id,participantIds:[m.id],witnessIds:[sand.id],type:'seen_together',location:'beach',day:s.gm.day,campTime:s.gm.dayTimer});
 for(let i=0;i<2;i++)s.memory.recordConversationObligation({id:`npc-success:${i}`,kind:'task',speakerId:j.id,requesterId:sand.id,targetId:m.id,status:'reported:committed',day:s.gm.day},[sand.id]);
 assert.equal(s.e.objectives.plan(sand,s.gm.dayTimer).targetId,j.id);
 const personal=naturalPlayerRequest({lowReliability:true});for(const id of [personal.gm.player.id,personal.by('Jeremy').id,personal.by('Parvati').id])personal.gm.systems.trustSystem.setTrust(personal.by('Sandra').id,id,0);
 personal.by('Sandra').gameplayStyle='Power Player';const plan=personal.e.objectives.plan(personal.by('Sandra'),personal.gm.dayTimer);assert.equal(plan.agenda.purpose,'objective_recruit');assert.equal(plan.targetId,personal.by('Michele').id);
});
check('truthful failed reports distinguish not attempted, could not reach and independent refusal',()=>{
 for(const reportStance of ['not_done','unreached']){const s=assignment('bring'),t=s.assigned;s.e.tasks.respond(t.id,s.gm.player.id,true);s.act('report',s.gm.player,s.by('Sandra'),{delegationId:t.id,truthMode:'truth',reportStance});assert.equal(t.reports.at(-1).reported,reportStance);assert.equal(t.executionReceipt,undefined);}
 const {s,t,r}=bring({refuse:true});assert.equal(r.responses[0].stance,'refused');const sand=s.by('Sandra');s.move(s.e.place(sand.id));const before=s.gm.getTrust(sand.id,s.gm.player.id);s.act('report',s.gm.player,sand,{delegationId:t.id,truthMode:'truth'});assert.equal(t.reports.at(-1).reported,'refused');assert.equal(s.gm.getTrust(sand.id,s.gm.player.id),before);
});
