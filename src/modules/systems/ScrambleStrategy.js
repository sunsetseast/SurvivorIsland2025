import { isCampPhysicallyPresent, eligibleCampMember } from '../locations/CampPresence.js';
import { getCampBehaviorProfile } from './CampBehaviorProfile.js';
import { ownedCampKnowledge } from './CampKnowledge.js';
import { ownsUsableIdol } from './IdolPossession.js';
const same = (a,b) => a != null && b != null && String(a) === String(b);
const bounded = n => Math.max(0, Math.min(1, Number(n) || 0));
const negative = e => ['no','denied','protect','unlikely'].includes(e.stance);
const copy = x => JSON.parse(JSON.stringify(x));

// Strategic reality lives here; statements and beliefs live in existing SocialMemory.
// This model has no clock, movement loop, dialogue DOM, or global vote solver.
export default class ScrambleStrategy {
  constructor(gm, strategy, payload = {}) {
    this.gm = gm; this.strategy = strategy;
    this.states = payload.states || {}; this.plans = payload.plans || {};
    this.resolved = payload.resolved || {}; this.metrics = payload.metrics || {};
  }
  get memory() { return this.gm?.systems?.socialMemorySystem; }
  get members() { return (this.gm?.getPlayerTribe?.()?.members || []).filter(p => eligibleCampMember(this.gm,p)); }
  person(id) { return this.members.find(p => same(p.id,id)); }
  present(p, place) { return isCampPhysicallyPresent(p,this.gm.systems.npcLocationSystem,place,this.gm); }
  together(a,b) { const place = a?.isPlayer ? a.location : this.gm.systems.npcLocationSystem.getLocation(a?.id);
    return this.present(a,place) && this.present(b,place); }
  count(key) { this.metrics[key] = (this.metrics[key] || 0) + 1; }
  state(id) {
    const profile = getCampBehaviorProfile(this.person(id));
    return this.states[String(id)] ||= { preferredTargetId:null, intendedVoteId:null, committedTargetId:null,
      confidence:.5, flexibility:bounded(.25 + profile.riskTolerance*.35), backup:null, splitPlan:null,
      decoys:[], pitchesByAudience:{}, promises:[], perceivedMajority:null, safetyBelief:.6,
      urgency:0, lastContacts:{}, reason:'unknown', updatedAt:null };
  }
  setIntent(id,target,meta) { const s = this.state(id); const old = s.intendedVoteId;
    if (s.preferredTargetId == null) s.preferredTargetId = target;
    s.intendedVoteId = target; Object.assign(s,meta); s.confidence = bounded(s.confidence);
    if (old != null && !same(old,target)) this.count('intentionChanges');
  }
  migrate() { for (const [id,target] of this.strategy.npcIntentTargets) if (!this.states[String(id)])
    this.setIntent(id,target,this.strategy.npcIntentMeta.get(id) || {}); }
  knowledge(id) { if (!this.memory?.memory?.[String(id)]) return [];
    return ownedCampKnowledge(this.memory,id,this.gm.day).filter(e => e.day === this.gm.day && e.confidence >= .15); }
  voteRead(id) {
    const accounts = new Map();
    for (const e of this.knowledge(id)) {
      if (!['target','commitment'].includes(e.topic) || negative(e) || same(e.speakerId,id) ||
        !this.strategy.isTargetIdAvailable(e.subjectId)) continue;
      accounts.set(String(e.attributedId ?? e.sourceId ?? e.speakerId),e);
    }
    const counts = new Map();
    for (const e of accounts.values()) counts.set(e.subjectId,(counts.get(e.subjectId) || 0) + e.confidence*(e.challenged?.45:1));
    const ordered = [...counts].sort((a,b) => b[1]-a[1]);
    return { targetId:ordered[0]?.[0] ?? null, confidence:bounded((ordered[0]?.[1] || 0)/Math.max(1,accounts.size)),
      alternatives:ordered.slice(1).map(([id])=>id), evidenceIds:[...accounts.values()].map(e=>e.id) };
  }
  viability(id,target) {
    const votes = new Map();
    if (same(this.states[String(id)]?.intendedVoteId,target)) votes.set(String(id),1);
    for (const e of this.knowledge(id)) if (e.topic === 'commitment' && !negative(e))
      votes.set(String(e.attributedId ?? e.speakerId),same(e.subjectId,target) ? e.confidence : 0);
    return [...votes.values()].reduce((a,b)=>a+b,0);
  }
  refresh(id) { const s=this.state(id); s.perceivedMajority=this.voteRead(id);
    const warnings=this.knowledge(id).filter(e=>e.topic==='safety' && same(e.subjectId,id) && ['warned','mentioned'].includes(e.stance));
    s.safetyBelief=bounded(.7-warnings.reduce((a,e)=>a+e.confidence*.35,0));
    s.urgency=bounded((1-s.safetyBelief)*.6+(this.gm.dayTimer<=600?.35:.05)); return s; }
  contradictions(id) { return (this.memory?.memory?.[String(id)]?.campClaims || []).filter(e=>e.day===this.gm.day && e.contradicts?.length); }
  credibility(speaker,listener,{subjectId,topic,stance,attributedId,mode}) {
    const profile=getCampBehaviorProfile(speaker), skeptical=getCampBehaviorProfile(listener);
    const contrary=this.knowledge(listener.id).some(e=>e.topic===topic &&
      (same(e.subjectId,subjectId) && negative(e)!==negative({stance}) ||
       ['target','commitment'].includes(topic) && same(e.attributedId??e.speakerId,attributedId??speaker.id) && !same(e.subjectId,subjectId)));
    // No hidden truth or lie mode affects initial belief. Only plausibility/owned contradictions do.
    return bounded(.2+(this.gm.getTrust?.(listener.id,speaker.id)??50)/100*.34+
      (this.memory.getCampSourceReliability?.(listener.id,speaker.id)??.75)*.2+profile.deception*.18-
      skeptical.paranoiaDrive*.12-(contrary?.22:0)-(mode==='speculation'?.12:0));
  }
  statement({id,speakerId,listenerIds=[],subjectId,topic='target',stance='consider',mode='truthful',
    attributedId=null,sourceChain=null,refutesClaimId=null,random=()=>this.strategy.random()}) {
    if (this.resolved[id]) return this.resolved[id];
    const speaker=this.person(speakerId); if (!id || !speaker || !this.person(subjectId) ||
      ['target','commitment','split_assignment'].includes(topic) && !this.strategy.isTargetIdAvailable(subjectId)) return null;
    const listeners=listenerIds.map(id=>this.person(id)).filter(p=>p&&!same(p.id,speakerId)&&this.together(speaker,p));
    if (!listeners.length) return null;
    const belief={}; const confidences={};
    for (const listener of listeners) { const score=this.credibility(speaker,listener,{subjectId,topic,stance,mode,attributedId});
      belief[String(listener.id)]=random()<score; confidences[String(listener.id)]=belief[String(listener.id)]?Math.max(.55,score):.2; }
    const hiddenFalse=['deliberate_lie','decoy','reassurance_lie'].includes(mode);
    this.memory.recordCampClaim({id,speakerId,listenerIds:listeners.map(p=>p.id),subjectId,topic,stance,
      origin:mode==='speculation'||mode==='inference'?'inference':'participant',
      attributedId:attributedId??speakerId, sourceChain:sourceChain||[attributedId??speakerId,speakerId].filter((v,i,a)=>a.indexOf(v)===i),
      speechAct:topic,refutesClaimId,confidence:.8,confidenceByListener:confidences,
      day:this.gm.day,campTime:this.gm.dayTimer,salience:'high',...(hiddenFalse?{truthfulness:false}:{})});
    const state=this.state(speakerId);
    for (const listener of listeners) { state.pitchesByAudience[String(listener.id)]={id,subjectId,topic,stance,mode};
      state.lastContacts[String(listener.id)]=this.gm.dayTimer; this.refresh(listener.id);
      if (this.contradictions(listener.id).some(e=>e.id===id)) this.count('contradictionsDiscovered'); }
    if (topic==='commitment') { state.promises.push({id,subjectId,audienceIds:listeners.map(p=>p.id),stance}); state.promises=state.promises.slice(-24); }
    const result={id,belief,listenerIds:listeners.map(p=>p.id)}; this.resolved[id]=result;
    this.count('statements'); this.count(hiddenFalse?'deliberateLies':mode==='hearsay'?'rumors':mode==='speculation'?'speculations':'truthfulStatements');
    if(topic==='safety')this.count(stance==='yes'?'reassurances':'warnings');
    if(topic==='commitment')this.count('commitments'); if(mode==='decoy')this.count('decoys');
    this.strategy.logFact({type:topic==='target'?'targetProposed':'strategicStatement',speakerId,targetId:subjectId,
      participantIds:listeners.map(p=>p.id),statementTopic:topic,activityId:id});
    const cp=this.gm.systems.campActivitySystem?.conversation?.checkpoint;
    if(cp&&id.startsWith(cp.activityId)) {if(!cp.statementIds.includes(id))cp.statementIds.push(id);
      if(topic==='commitment'&&!cp.commitmentIds.includes(id))cp.commitmentIds.push(id);}
    return result;
  }
  adoption(listenerId,speakerId,target,{belief=true,random=()=>this.strategy.random()}={}) {
    const listener=this.person(listenerId),speaker=this.person(speakerId);
    if(!listener||listener.isPlayer||!speaker||!this.together(listener,speaker)||same(listenerId,target)||!this.strategy.isTargetIdAvailable(target))return 'refuse';
    const s=this.refresh(listenerId), trust=(this.gm.getTrust?.(listenerId,speakerId)??50)/100;
    const relationship=this.gm.systems.relationshipSystem?.getRelationship?.(listenerId,target)??50;
    const rel=typeof relationship==='number'?relationship:relationship.value??50;
    const score=.12+trust*.23+(belief?.18:0)+(same(s.preferredTargetId,target)?.22:0)+
      (same(s.intendedVoteId,target)?.13:0)+Math.min(.13,this.viability(listenerId,target)*.045)+s.urgency*.1-
      (s.committedTargetId&&!same(s.committedTargetId,target)?.19:0)-(rel>70?.12:0)+
      (same(s.intendedVoteId,target)&&this.gm.dayTimer<=600?.1:0)+(random()-.5)*.12;
    const outcome=score>=.64?'commit':score>=.47?'open':score>=.31?'hedge':'refuse';
    if(outcome==='commit'||outcome==='open'&&s.flexibility>.5&&score>.54)
      this.strategy.updateNpcIntentTarget(listenerId,target,{reason:'strategic_adoption',absoluteConfidence:outcome==='commit'?.76:.48,lateVolatility:this.gm.dayTimer<=600});
    if(outcome==='commit')s.committedTargetId=target; if(outcome==='hedge'||outcome==='open')this.count('hedges'); return outcome;
  }
  commit({id,speakerId,listenerIds,targetId,lie=false,random}) {
    if(this.resolved[id])return this.resolved[id];
    if(!this.strategy.isTargetIdAvailable(targetId)||same(speakerId,targetId))return null;
    const result=this.statement({id,speakerId,listenerIds,subjectId:targetId,topic:'commitment',stance:'yes',mode:lie?'deliberate_lie':'truthful',random});
    if(result&&!lie&&this.strategy.isTargetIdAvailable(targetId)&&!same(speakerId,targetId)) {
      this.gm.systems.allianceSystem?.recordPlanSupport?.(speakerId,targetId,listenerIds);
      const s=this.state(speakerId); s.committedTargetId=targetId;
      if(this.person(speakerId)?.isPlayer){s.intendedVoteId=targetId;this.strategy.personalTargetId=targetId;}
      else this.strategy.updateNpcIntentTarget(speakerId,targetId,{reason:'explicit_commitment',absoluteConfidence:.8});
    }return result;
  }
  decoy(ownerId,targetId,audienceIds,purpose='hide_blindside') {
    if(!this.strategy.isTargetIdAvailable(targetId))return null;
    const s=this.state(ownerId), key=`${ownerId}:${targetId}:${purpose}`;
    let plan=s.decoys.find(p=>p.id===key); if(!plan){plan={id:key,targetId,audienceIds:[...audienceIds],purpose,originatorId:ownerId,knowinglyFalse:true,expiresAt:0};s.decoys.push(plan);s.decoys=s.decoys.slice(-3);}
    return plan;
  }
  backup(ownerId,primaryTargetId,targetId,informedIds=[],trigger='suspected_idol') {
    if(!this.strategy.isTargetIdAvailable(targetId)||same(primaryTargetId,targetId))return null;
    const ids=[ownerId,...informedIds].filter((id,i,a)=>a.findIndex(x=>same(x,id))===i&&this.person(id)&&(same(id,ownerId)||this.together(this.person(ownerId),this.person(id))));
    const plan={id:`backup:${ownerId}:${primaryTargetId}:${targetId}`,primaryTargetId,targetId,informedIds:ids,trigger,active:false};
    this.plans[plan.id]=plan;for(const id of ids)this.state(id).backup=copy(plan);this.count('backups');return plan;
  }
  activateBackup(ownerId,trigger) {
    const known=this.state(ownerId).backup,plan=this.plans[known?.id];
    if(!plan||!this.strategy.isTargetIdAvailable(plan.targetId)||known.active||plan.trigger!==trigger||!plan.informedIds.some(id=>same(id,ownerId)))return false;
    plan.active=true;
    const owner=this.person(ownerId);
    const listeners=plan.informedIds.filter(id=>!same(id,ownerId)&&this.together(owner,this.person(id)));
    this.statement({id:`${plan.id}:activate:${ownerId}`,speakerId:ownerId,listenerIds:listeners,subjectId:plan.targetId,topic:'backup',stance:'activated'});
    for(const id of [ownerId,...listeners]) {
      const state=this.state(id);state.backup.active=true;
      // Knowing a backup isn't consenting to abandon an unrelated plan.
      if(!this.person(id)?.isPlayer&&!same(id,plan.targetId)&&(same(id,ownerId)||same(state.intendedVoteId,plan.primaryTargetId)||same(state.committedTargetId,plan.primaryTargetId)))
        this.strategy.updateNpcIntentTarget(id,plan.targetId,{reason:`backup:${trigger}`,absoluteConfidence:.65,lateVolatility:this.gm.dayTimer<=600});
    }
    return true;
  }
  split(ownerId,primaryTargetId,secondaryTargetId,assignments,fullKnowledgeIds=[ownerId]) {
    if(!this.strategy.isTargetIdAvailable(primaryTargetId)||!this.strategy.isTargetIdAvailable(secondaryTargetId)||same(primaryTargetId,secondaryTargetId))return null;
    const valid=Object.entries(assignments).filter(([id,target])=>this.person(id)&&(same(id,ownerId)||this.together(this.person(ownerId),this.person(id)))&&!same(id,target)&&[primaryTargetId,secondaryTargetId].some(t=>same(t,target)));
    const plan={id:`split:${ownerId}:${primaryTargetId}:${secondaryTargetId}`,ownerId,primaryTargetId,secondaryTargetId,assignments:Object.fromEntries(valid),fullKnowledgeIds:[...fullKnowledgeIds],counts:{}};
    for(const [,target] of valid)plan.counts[target]=(plan.counts[target]||0)+1;
    this.plans[plan.id]=plan;
    for(const [id,target] of valid)this.state(id).splitPlan=fullKnowledgeIds.some(x=>same(x,id))?{...copy(plan),assignedVoteId:target}:{id:plan.id,ownerId,assignedVoteId:target};
    this.count('splitPlans');return plan;
  }
  acceptSplit(id) {const s=this.state(id),target=s.splitPlan?.assignedVoteId;
    if(!target||!this.strategy.isTargetIdAvailable(target)||this.person(id)?.isPlayer)return false;
    if(same(s.intendedVoteId,target)&&same(s.committedTargetId,target))return true;
    this.strategy.updateNpcIntentTarget(id,target,{reason:'accepted_split',absoluteConfidence:.75});s.committedTargetId=target;return true;}
  react(id) {
    const plan = this.states[String(id)]?.backup;
    if (!plan || plan.active) return false;
    const owned = this.knowledge(id);
    const triggered = plan.trigger === 'suspected_idol' && owned.some(e =>
      ['idol_suspicion','idol_possession'].includes(e.topic) && same(e.subjectId,plan.primaryTargetId) && !negative(e)) ||
      plan.trigger === 'target_aware' && owned.some(e => e.topic === 'safety' && same(e.subjectId,plan.primaryTargetId) && e.stance === 'warned') ||
      plan.trigger === 'target_unavailable' && !this.strategy.isTargetIdAvailable(plan.primaryTargetId) ||
      plan.trigger === 'lost_votes' && this.viability(id,plan.primaryTargetId) < 1.5;
    return triggered ? this.activateBackup(id,plan.trigger) : false;
  }
  agenda(speakerId,listenerId,{plan=false}={}) {
    const s=this.refresh(speakerId), owned=this.knowledge(speakerId), profile=getCampBehaviorProfile(this.person(speakerId));
    const disputed=this.contradictions(speakerId).at(-1);
    const verify=owned.find(e=>same(e.attributedId,listenerId)&&!same(e.speakerId,listenerId)&&!negative(e));
    let purpose='recruit_swing',primarySubject=s.intendedVoteId,messageMode='truthful',knownEvidence=[];
    if(verify&&(disputed||verify.provenance==='hearsay')){purpose='verify_story';primarySubject=verify.subjectId;knownEvidence=[verify.id];messageMode='question';}
    else if(owned.some(e=>['safety','target'].includes(e.topic)&&same(e.subjectId,listenerId)&&!negative(e))&&
      (this.gm.getTrust?.(speakerId,listenerId)??50)>60){purpose='warn_ally';primarySubject=listenerId;messageMode='warning';}
    else if(s.decoys.some(p=>p.audienceIds.some(id=>same(id,listenerId)))){purpose='spread_decoy';primarySubject=s.decoys.find(p=>p.audienceIds.some(id=>same(id,listenerId))).targetId;messageMode='decoy';}
    else if(same(s.intendedVoteId,listenerId)&&profile.honesty<.7){purpose='reassure_target';primarySubject=listenerId;messageMode='reassurance_lie';}
    else if(owned.some(e=>['idol_suspicion','idol_possession'].includes(e.topic)&&same(e.subjectId,s.intendedVoteId)&&!negative(e))){purpose='establish_backup';}
    else if(s.safetyBelief<.4){purpose='counter_pitch';}
    else if(this.viability(speakerId,s.intendedVoteId)>this.members.length/2){purpose='check_loyalty';}
    else if(!primarySubject){purpose='gather_intel';messageMode='question';}
    if(plan&&purpose==='reassure_target'&&s.confidence>=.6&&profile.honesty<.5){
      const target=this.members.find(p=>!same(p.id,speakerId)&&!same(p.id,listenerId)&&this.strategy.isTargetIdAvailable(p.id));
      if(target){this.decoy(speakerId,target.id,[listenerId]);purpose='spread_decoy';primarySubject=target.id;messageMode='decoy';}}
    const allianceMotive = ['recruit_swing','check_loyalty','gather_intel'].includes(purpose) ? this.gm.systems.allianceSystem?.npcMotive?.(speakerId,listenerId) : null;
    if (allianceMotive) purpose=allianceMotive.purpose;
    return {allianceMotive,purpose,initiatorId:speakerId,listenerIds:[listenerId],primarySubject,desiredOutcome:purpose==='verify_story'?'verify':'support',knownEvidence,messageMode};
  }
  candidateScore(speakerId,listenerId) {
    const s=this.refresh(speakerId),last=s.lastContacts[String(listenerId)];
    if(last!=null&&last-this.gm.dayTimer<420)return -Infinity;
    const agenda=this.agenda(speakerId,listenerId), trust=(this.gm.getTrust?.(speakerId,listenerId)??50)/100;
    const motive={alliance_offer:1.4,alliance_recruitment:1.7,alliance_reunion:1.5,verify_story:2,warn_ally:2.5,reassure_target:1.5,spread_decoy:1.7,counter_pitch:1.6,establish_backup:1.4,check_loyalty:1.1,recruit_swing:1,gather_intel:.6}[agenda.purpose];
    const known=this.knowledge(speakerId).find(e=>e.topic==='commitment'&&same(e.speakerId,listenerId));
    return motive+trust*.6+s.urgency*.4-(known&&same(known.subjectId,s.intendedVoteId)?.5:0);
  }
  choosePartner(actor,candidates) {return candidates.filter(p=>p&&!same(p.id,actor.id)&&
    this.present(p,p.isPlayer?p.location:this.gm.systems.npcLocationSystem.getLocation(p.id))).map(p=>({p,score:this.candidateScore(actor.id,p.id)}))
    .filter(x=>Number.isFinite(x.score)).sort((a,b)=>b.score-a.score)[0]?.p||null;}
  resolveAgenda(actor,listener,activity,random=()=>this.strategy.random()) {
    if(!this.together(actor,listener))return null;
    const agenda=activity.agenda||this.agenda(actor.id,listener.id,{plan:true}),prefix=activity.id;
    this.count(`motive:${agenda.purpose}`);const id=`${prefix}:agenda:${listener.id}`;
    if(this.resolved[id])return this.resolved[id];
    if(agenda.allianceMotive){const result=this.gm.systems.allianceSystem.resolveNpcMotive(actor.id,listener.id,agenda.allianceMotive,id,random);this.resolved[id]={status:result?.status||'unresolved'};return this.resolved[id];}
    let topic='target',stance='consider',subjectId=agenda.primarySubject,mode=agenda.messageMode;
    if(agenda.purpose==='verify_story') {
      this.count('verificationAttempts');const known=this.knowledge(actor.id).find(e=>agenda.knownEvidence.includes(e.id));
      const prior=(this.memory.memory[String(listener.id)]?.campClaims||[]).find(e=>same(e.speakerId,listener.id)&&same(e.subjectId,subjectId)&&e.topic===known?.topic);
      const lie=!prior&&getCampBehaviorProfile(listener).honesty<.45&&random()<.35;
      return this.statement({id,speakerId:listener.id,listenerIds:[actor.id],subjectId,topic:known?.topic||'target',stance:prior||lie?'mentioned':'denied',
        mode:lie||prior?.truthfulness===false?'deliberate_lie':'truthful',refutesClaimId:prior||lie?null:known?.id,random});
    }
    if(agenda.purpose==='warn_ally'){topic='safety';stance='warned';}
    if(agenda.purpose==='reassure_target'){topic='safety';stance='yes';}
    if(!subjectId){const read=this.voteRead(listener.id);subjectId=read.targetId;if(!subjectId)return {outcome:'unknown'};
      return this.statement({id,speakerId:listener.id,listenerIds:[actor.id],subjectId,mode:'inference',random});}
    const result=this.statement({id,speakerId:actor.id,listenerIds:[listener.id],subjectId,topic,stance,mode,random});
    if(result)this.gm.systems.campInteractionSystem?.hearExchange?.({speaker:actor,listener,activity,claimId:id,random});
    if(topic==='target'&&result){const outcome=this.adoption(listener.id,actor.id,subjectId,{belief:result.belief[String(listener.id)],random});
      if(outcome==='commit')this.commit({id:`${prefix}:promise:${listener.id}`,speakerId:listener.id,listenerIds:[actor.id],targetId:subjectId,random});
      if(agenda.purpose==='establish_backup'){const next=this.members.find(p=>!same(p.id,subjectId)&&!same(p.id,actor.id)&&!same(p.id,listener.id)&&this.strategy.isTargetIdAvailable(p.id));
        if(next)this.backup(actor.id,subjectId,next.id,[listener.id]);}return {...result,outcome};}
    return result;
  }
  resolveMeeting(participants,activity,random=()=>this.strategy.random()) {
    const coalition=this.gm.systems.allianceSystem?.getAlliance?.(activity.allianceId);
    const cover=id=>['fake','cover'].includes(coalition?.memberStates[id]?.sincerity);
    const positions=participants.map(p=>{const s=this.state(p.id);return {id:p.id,preferredTargetId:s.preferredTargetId,intendedVoteId:cover(p.id)?s.decoys[0]?.targetId||coalition?.roundPlan?.primaryTargetId||s.preferredTargetId:s.intendedVoteId};});
    // Everyone contributes their own position before anyone weighs the discussion.
    for(const p of positions)if(p.intendedVoteId)this.statement({id:`${activity.id}:position:${p.id}`,speakerId:p.id,listenerIds:participants.filter(x=>!same(x.id,p.id)).map(x=>x.id),subjectId:p.intendedVoteId,random});
    for(const p of participants){if(cover(p.id))continue;const read=this.voteRead(p.id);if(!read.targetId)continue;
      const speaker=participants.find(x=>!same(x.id,p.id)&&same(positions.find(y=>same(y.id,x.id))?.intendedVoteId,read.targetId));
      if(speaker)this.adoption(p.id,speaker.id,read.targetId,{random});}
    const counts=new Map();for(const p of participants){const target=cover(p.id)?positions.find(x=>same(x.id,p.id))?.intendedVoteId:this.state(p.id).intendedVoteId;if(target)counts.set(target,(counts.get(target)||0)+1);}
    const [target,votes]=[...counts].sort((a,b)=>b[1]-a[1])[0]||[];
    const outcome=votes===participants.length?'consensus':votes>participants.length/2?'tentative_consensus':'disagreement';
    const owner = participants[0];
    const risk = target && this.knowledge(owner.id).some(e => ['idol_suspicion','idol_possession'].includes(e.topic) && same(e.subjectId,target) && !negative(e));
    if (outcome !== 'disagreement' && risk) {
      const secondary = positions.find(p => p.intendedVoteId && !same(p.intendedVoteId,target) &&
        this.strategy.isTargetIdAvailable(p.intendedVoteId))?.intendedVoteId || this.members.find(p =>
          !same(p.id,target) && !participants.some(member => same(member.id,p.id)) && this.strategy.isTargetIdAvailable(p.id))?.id;
      if (secondary) {
        this.backup(owner.id,target,secondary,participants.slice(1).map(p=>p.id));
        if (participants.length >= 4) {
          const assignments = Object.fromEntries(participants.map((p,i)=>[p.id,i<Math.ceil(participants.length*.66)?target:secondary]));
          const plan=this.split(owner.id,target,secondary,assignments,[owner.id]);
          if (plan) for (const participant of participants) {
            const assigned=plan.assignments[participant.id];
            if (assigned && !same(participant.id,owner.id) && this.adoption(participant.id,owner.id,assigned,{random})==='commit') this.acceptSplit(participant.id);
          }
        }
      }
    }
    return {positions,outcome,targetId:outcome==='disagreement'?null:target};
  }
  searched(id) {return (this.gm.systems.idolSystem?.getSearchHistory?.(id)?.count||0)>0||
    (this.memory?.memory?.[String(id)]?.campObservations||[]).some(e=>same(e.actorId,id)&&e.type==='idol_search')||
    (this.gm.systems.idolSystem?.casualSearchCounts?.get(id)||0)>0;}
  idolAnswer(id) {return {searched:this.searched(id),ownsIdol:ownsUsableIdol(this.person(id),this.gm.systems.idolSystem)};}
  knownPair(id) {
    const owned=(this.memory?.memory?.[String(id)]?.campObservations||[]).filter(e=>e.type==='seen_together'&&e.day===this.gm.day&&e.confidence>=.2);
    const e=owned.at(-1);if(e)return {ids:[e.actorId,...(e.participantIds||[])].filter((x,i,a)=>a.indexOf(x)===i),provenance:e.origin==='hearsay'?'hearsay':'inference',evidenceId:e.id};
    const alliance=this.gm.systems.allianceSystem?.getAlliancesForSurvivor?.(id)?.find(a=>a.active!==false);
    const ids=(this.gm.systems.allianceSystem?.knownRoster?.(id,alliance?.id)||[]).filter(x=>!same(x,id)&&this.person(x));return ids.length>=2?{ids:ids.slice(0,2),provenance:'direct_statement'}:null;
  }
  recap(id=this.gm.player?.id) {
    const owned=this.knowledge(id);const ownPromises=(this.memory?.memory?.[String(id)]?.campClaims||[]).filter(e=>same(e.speakerId,id)&&e.topic==='commitment'&&e.day===this.gm.day).map(e=>({id:e.id,subjectId:e.subjectId,audienceIds:e.audienceIds,stance:e.stance}));
    return {currentVoteIntent:this.states[String(id)]?.intendedVoteId??null,statements:owned.filter(e=>e.kind==='claim'),
      groups:owned.filter(e=>e.topic==='seen_together'),promises:ownPromises,contradictions:this.contradictions(id).map(e=>({id:e.id,conflicts:[...e.contradicts]})),
      deals:(this.gm.systems.dealSystem?.getKnownDealsForSurvivor?.(id)||this.gm.systems.dealSystem?.getAllDeals?.()||Object.values(this.gm.systems.dealSystem?.dealsById||{})).filter(d=>(d.participantIds||d.parties||[]).some(x=>same(x,id)))};
  }
  checkpoint(reservation) {if(!reservation)return null;return reservation.checkpoint ||= {activityId:reservation.activityId,npcId:reservation.npcId,
    participants:[reservation.npcId,...(reservation.groupIds||[])],location:reservation.location,purpose:reservation.strategy?'strategy':'check_in',
    seed:this.strategy.scramble?.rngState??1,choices:{},topics:[],statementIds:[],commitmentIds:[],turnCount:0};}
  choice(key,resolve) {
    const reservation=this.gm.systems.campActivitySystem.conversation,cp=this.checkpoint(reservation);if(!cp)return null;
    if(cp.choices[key])return {...copy(cp.choices[key]),replay:true};
    let draw=0;const random=()=>{const text=`${cp.seed}:${cp.activityId}:${key}:${draw++}`;let n=2166136261;
      for(let i=0;i<text.length;i++)n=Math.imul(n^text.charCodeAt(i),16777619);return (n>>>0)/4294967296;};
    const result=resolve(random)||{};cp.choices[key]=copy(result);
    if(!key.startsWith('roll:')){cp.turnCount++;cp.topics.push(key);reservation.turns=cp.turnCount;reservation.topics=cp.topics.join(' ');}
    return result;
  }
  serialize(){return copy({states:this.states,plans:this.plans,resolved:this.resolved,metrics:this.metrics});}
}
