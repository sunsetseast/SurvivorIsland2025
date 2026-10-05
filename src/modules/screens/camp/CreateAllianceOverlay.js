import { gameManager } from '../../core/index.js';
import { button,text,showAllianceDialog,hideAllianceDialog } from './AllianceOverlayUI.js';
let selected=null;
export function openCreateAllianceOverlay(){const gm=gameManager,player=gm.getPlayerSurvivor?.()||gm.player,system=gm.systems.allianceSystem,grid=document.getElementById('create-alliance-members'),start=document.getElementById('create-alliance-create-button');selected=null;grid.replaceChildren();start.disabled=true;
  for(const p of gm.getPlayerTribe?.()?.members||[])if(!p.isPlayer&&system.together(player.id,p.id)&&p.campActivity?.interruptible!==false){const b=button(`${p.firstName} · Nearby`,()=>{selected=p.id;for(const n of grid.querySelectorAll('button'))n.setAttribute('aria-pressed',n===b?'true':'false');start.disabled=false;});b.setAttribute('aria-pressed','false');grid.append(b);}
  if(!grid.children.length)grid.append(text('No one nearby is available. Approach someone at camp to talk.','p'));
  start.textContent='Start conversation';start.onclick=()=>{const id=selected;if(id==null)return;closeCreateAllianceOverlay();gm.systems.conversationSystem.startAllianceConversation(id);};
  document.getElementById('create-alliance-cancel-button').onclick=closeCreateAllianceOverlay;showAllianceDialog('create-alliance-overlay',closeCreateAllianceOverlay);
}
export function closeCreateAllianceOverlay(){hideAllianceDialog('create-alliance-overlay');selected=null;}
if(typeof window!=='undefined')Object.assign(window,{openCreateAllianceOverlay,closeCreateAllianceOverlay});
