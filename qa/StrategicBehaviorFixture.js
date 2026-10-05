import './AlliancePresentationFixture.js';
const {scrambleNodes}=await import('../src/modules/systems/ScrambleConversation.js');
const {default:summary}=await import('../src/modules/views/PostChallengeSummaryView.js');
const {gm,activity,strategy}=window.allianceQa;
window.behaviorQa={gm,activity,strategy,scene(kind){
 document.querySelector('#refinement-summary')?.remove();
 const scene=window.allianceQa.scene(['offer','sincere','cover'].includes(kind)?'offer':'group');
 const c=gm.systems.conversationSystem,A=gm.systems.allianceSystem,m=strategy.reasoning,npc=A.person(scene.ids[1]);
 if(kind==='group')return scene;
 if(['offer','sincere','cover'].includes(kind))return scene;
 if(kind==='bottom'){
  c.closeConversation('fixture');const a=A.getAlliance('qa:majority');A.exclude({allianceId:a.id,proposerId:scene.ids[1],memberId:scene.ids[0],participantIds:scene.ids.slice(1,5)});
  strategy.updateNpcIntentTarget(npc.id,scene.ids[0],{absoluteConfidence:.9});
  c.startAllianceConversation(npc.id,a.id,{groupParticipantIds:[npc.id,scene.ids[2]]});return scene;
 }
 c.closeConversation('fixture');
 for(const p of activity.npcs()){p.campActivity=null;activity.start(p,{type:'idle_at_camp',location:'beach',duration:3000});}
 gm.player.campActivity=null;
 if(kind==='warning'){
  m.statement({id:'fixture:danger',speakerId:scene.ids[2],listenerIds:[npc.id],subjectId:gm.player.id,topic:'safety',stance:'warned',random:()=>0});
  strategy.updateNpcIntentTarget(npc.id,scene.ids[6]);
  c.startNpcConversation(npc,'warning',{initiatedByNpc:true,location:'beach',context:{phase:'post',agenda:m.agenda(npc.id,gm.player.id)}});
  [...document.querySelectorAll('#conversation-overlay button')].find(b=>b.textContent==='Talk now').click();
 }else if(kind==='verification'){
  m.statement({id:'fixture:attributed',speakerId:scene.ids[2],listenerIds:[gm.player.id],subjectId:scene.ids[6],topic:'target',mode:'hearsay',attributedId:npc.id,random:()=>0});
  c.startPlayerConversation({npcId:npc.id,phase:'post',context:{location:'beach'}});
  const node=scrambleNodes(m,{player:gm.player,npc,context:{},topic:'confront'}).find(n=>n.id.startsWith('verify:'));
  c._runConversationNode({player:gm.player,npc,node,context:{}});
 }else if(kind==='recap'){
  A.disclose({speakerId:npc.id,listenerId:gm.player.id,allianceId:'qa:core'});
  m.statement({id:'fixture:warning',speakerId:scene.ids[2],listenerIds:[gm.player.id],subjectId:gm.player.id,topic:'safety',stance:'warned',random:()=>0});
  const container=document.createElement('div');container.id='refinement-summary';container.className='refinement-qa-summary';document.body.append(container);summary(container);
 }
 return scene;
},accept(cover=false){const dialog=document.querySelector('#conversation-overlay');const button=[...dialog.querySelectorAll('button')].find(b=>b.textContent=== (cover?'Agree, but keep your options open':'Accept pact'));button.click();return {count:gm.systems.allianceSystem.alliances.length,time:gm.dayTimer};}};
window.behaviorQaReady=true;
