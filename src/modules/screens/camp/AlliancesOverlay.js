import { gameManager } from '../../core/index.js';
import { openCreateAllianceOverlay } from './CreateAllianceOverlay.js';
import { openManageAllianceOverlay } from './ManageAllianceOverlay.js';
import { text,button,showAllianceDialog,hideAllianceDialog } from './AllianceOverlayUI.js';
export function renderAlliancesGrid(){const gm=gameManager,player=gm.getPlayerSurvivor?.()||gm.player,system=gm.systems?.allianceSystem,grid=document.getElementById('alliances-grid');if(!grid||!player)return;grid.replaceChildren();
  for(const a of system?.getKnownAlliances?.(player.id)||[]){const card=button('',()=>openManageAllianceOverlay(a.id),'alliance-existing-slot');
    card.append(text(a.name,'strong','alliance-title'),text(a.memberIds.map(id=>String(id)===String(player.id)?'You':system.person(id)?.firstName||'Former member').join(' · ')),text(`${a.type.replaceAll('_',' ')} alliance`),text(`Your read: ${a.read}`));
    if(a.lastDiscussedTargetId)card.append(text(`Last discussed: ${system.person(a.lastDiscussedTargetId)?.firstName||'a target'}`));if(a.recent.length)card.append(text(`Recent: ${a.recent.at(-1)}`));grid.append(card);}
  grid.append(button('Start alliance conversation',()=>openCreateAllianceOverlay(),'alliance-existing-slot'));
  for(const suspicion of system?.inferAlliances?.(player.id)||[])grid.append(text(`You have repeatedly seen ${suspicion.memberIds.map(id=>system.person(id)?.firstName||'someone').join(' · ')} together. They may be working together.`,'p','alliance-suspicion'));
}
export function openAlliancesOverlay(){renderAlliancesGrid();document.getElementById('alliances-close-button').onclick=closeAlliancesOverlay;showAllianceDialog('alliances-overlay',closeAlliancesOverlay);}
export function closeAlliancesOverlay(){hideAllianceDialog('alliances-overlay');}
if(typeof window!=='undefined')Object.assign(window,{openAlliancesOverlay,closeAlliancesOverlay});
