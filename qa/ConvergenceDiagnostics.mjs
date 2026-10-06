// Developer diagnostics only. Capture before Tribal removes a target or advances
// the day; later ballot classification uses this immutable owned projection.
const same=(a,b)=>a!=null&&b!=null&&String(a)===String(b);
const copy=x=>JSON.parse(JSON.stringify(x));
export function captureConvergence(model,ids) {
  return Object.fromEntries(ids.map(id=>{
    const s=model.state(id),support=model.planSupport(id),coalitions=model.knownAlliancePlans(id);
    return [id,copy({targetId:s.intendedVoteId,preference:s.preferredTargetId,status:s.intentStatus,
      reason:s.reason,confidence:s.confidence,commitment:s.committedTargetId,history:s.intentHistory||[],
      split:s.splitPlan?.assignedVoteId??null,splitAccepted:s.intentStatus==='assignment'&&same(s.committedTargetId,s.splitPlan?.assignedVoteId),
      backup:s.backup?.active?s.backup.targetId:null,safety:s.safetyBelief,knownPlans:support.plans,
      coalitions:coalitions.map(p=>({targetId:p.targetId,weight:p.weight,allianceId:p.allianceId}))})];
  }));
}
export function classifyBallot(snapshot,target) {
  if(snapshot.splitAccepted&&same(snapshot.split,target))return 'split_assignment';
  if(same(snapshot.backup,target))return 'active_backup';
  if(snapshot.reason==='personal_holdout'&&same(snapshot.targetId,target))return 'protected_holdout';
  if(snapshot.coalitions.some(p=>p.weight>.25&&same(p.targetId,target)))return 'coalition_plan';
  const meaningful=snapshot.knownPlans.filter(p=>p.support>=.85);
  if(meaningful.some(p=>same(p.targetId,target)))return 'known_plan';
  // An engine ballot diverging from intended input is not an intentional rogue.
  // An uncertain voter or a loyalty holdout is not one either. This remains a
  // diagnostic inference from the voter perspective, never global majority.
  if(!same(snapshot.targetId,target))return 'tribal_divergence';
  if(meaningful.length&&['committed','final'].includes(snapshot.status)&&snapshot.confidence>=.45)
    return 'intentional_outside_known_plans';
  return meaningful.length?'unresolved_outside_known_plans':'no_known_plan';
}
export function listenerAssessment(model,playerId,listenerId,targetId) {
  const s=model.state(listenerId),A=model.gm.systems.allianceSystem;
  return {listenerId,targetId,intendedVoteId:s.intendedVoteId,commitment:s.committedTargetId,
    status:s.intentStatus,flexibility:s.flexibility,trust:model.gm.getTrust(listenerId,playerId),
    allianceAffinity:A.getAllianceAffinity(listenerId,playerId),viability:targetId==null?null:model.viability(listenerId,targetId),
    knownPlans:copy(model.planSupport(listenerId).plans),coalitions:copy(model.knownAlliancePlans(listenerId).map(p=>({targetId:p.targetId,weight:p.weight}))),
    speakerOwnedSupport:targetId==null?null:model.planSupport(playerId).plans.find(p=>same(p.targetId,targetId))||null};
}
export function tracePlayerAction(model,player,npc,node,resolve) {
  const targetId=node.id.split(':')[1],target=model.person(targetId)?.id??null;
  const before=listenerAssessment(model,player.id,npc.id,target),owned=copy(model.knowledge(player.id));
  const adoption=[],original=model.adoption;
  model.adoption=function(listener,speaker,subject,options={}) {
    const assessment=listenerAssessment(this,speaker,listener,subject);
    return original.call(this,listener,speaker,subject,{...options,trace:result=>adoption.push({...assessment,...result})});
  };
  let result;try{result=resolve();}finally{model.adoption=original;}
  const after=listenerAssessment(model,player.id,npc.id,target);
  return {action:node.id,listenerId:npc.id,targetId:target,ownedEvidence:owned,before,after,adoption,line:result?.line,
    gainedCredibleVote:(after.knownPlans.find(p=>same(p.targetId,target))?.support||0)>(before.knownPlans.find(p=>same(p.targetId,target))?.support||0),
    realIntentChanged:!same(before.intendedVoteId,after.intendedVoteId)};
}
