import { gameManager } from '../../core/index.js';
import { button,text,showAllianceDialog,hideAllianceDialog } from './AllianceOverlayUI.js';
export function openManageAllianceOverlay(id){const gm=gameManager,player=gm.getPlayerSurvivor?.()||gm.player,system=gm.systems.allianceSystem,a=system.getKnownAlliances(player.id).find(a=>a.id===id);if(!a)return;
  document.getElementById('manage-alliance-title').textContent=a.name;const input=document.getElementById('manage-alliance-name-input');input.value=a.name;
  const members=document.getElementById('manage-alliance-members');members.replaceChildren(text(`Your read: ${a.read}`,'p'));
  const nearby=[];for(const memberId of a.memberIds){if(String(memberId)===String(player.id))continue;const p=system.person(memberId);if(!p)continue;const available=system.together(player.id,p.id)&&p.campActivity?.interruptible!==false;if(available)nearby.push(p);
    const b=button(`Talk to ${p.firstName}${available?'':' · Elsewhere'}`,()=>{closeManageAllianceOverlay();gm.systems.conversationSystem.startAllianceConversation(p.id,id);});b.disabled=!available;members.append(b);}
  if(a.lastDiscussedTargetId)members.append(text(`Last discussed: ${system.person(a.lastDiscussedTargetId)?.firstName||'a name'}`,'p'));for(const recent of a.recent)members.append(text(recent,'p'));
  document.getElementById('manage-alliance-save-button').onclick=()=>{system.updateAllianceName(id,input.value,player.id);document.getElementById('manage-alliance-title').textContent=system.getAllianceDisplayName(id,player.id);};
  const talk=document.getElementById('manage-alliance-talk-button');talk.disabled=!nearby.length;talk.onclick=()=>{closeManageAllianceOverlay();gm.systems.conversationSystem.startAllianceConversation(nearby[0].id,id,{groupParticipantIds:nearby.map(p=>p.id)});};
  document.getElementById('manage-alliance-distance-button').onclick=()=>{system.distance(player.id,id);document.getElementById('manage-alliance-commit-status').textContent='You are privately keeping more options open. To tell an ally, talk to them.';};
  document.getElementById('manage-alliance-commit-status').textContent='Your notebook label is private. Social changes happen through conversations.';
  document.getElementById('manage-alliance-close-button').onclick=closeManageAllianceOverlay;showAllianceDialog('manage-alliance-overlay',closeManageAllianceOverlay);
}
export function closeManageAllianceOverlay(){hideAllianceDialog('manage-alliance-overlay');}
if(typeof window!=='undefined')Object.assign(window,{openManageAllianceOverlay,closeManageAllianceOverlay});
