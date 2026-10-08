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
    for(const s of Object.values(this.states)) if(!s.intentStatus) {
      s.intentStatus=s.committedTargetId?'committed':s.reason==='seed:startPhase'||s.confidence<.45?'lean':'provisional';
      if(s.intentStatus==='lean')s.confidence=Math.min(.25,s.confidence);
    }
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
      confidence:.2, intentStatus:'lean', flexibility:bounded(.25 + profile.riskTolerance*.35), backup:null, splitPlan:null,
      decoys:[], pitchesByAudience:{}, promises:[], perceivedMajority:null, safetyBelief:.6,
      urgency:0, lastContacts:{}, contactDays:{}, motiveReceipts:{}, followUp:null, reason:'unknown', updatedAt:null };
  }
  setIntent(id,target,meta) { const s = this.state(id); const old = s.intendedVoteId;
    if (s.preferredTargetId == null) s.preferredTargetId = target;
    s.intendedVoteId = target; Object.assign(s,meta); s.confidence = bounded(s.confidence);
    s.intentStatus = meta.intentStatus || (meta.reason==='explicit_commitment'?'committed':
      /split/.test(meta.reason||'')?'assignment':s.confidence>=.45?'provisional':'lean');
    if(!same(old,target)) { (s.intentHistory ||= []).push({targetId:target,reason:s.reason,status:s.intentStatus,at:this.gm.dayTimer});
      s.intentHistory=s.intentHistory.slice(-16); }
    if (old != null && !same(old,target)){this.count('intentionChanges');if(this.gm.dayTimer<=300)this.count('lateFlips');}
  }
  migrate() { for (const [id,target] of this.strategy.npcIntentTargets) if (!this.states[String(id)])
    this.setIntent(id,target,this.strategy.npcIntentMeta.get(id) || {}); }
  knowledge(id) {
    const key=String(id);if(this.selectionKnowledge?.has(key))return this.selectionKnowledge.get(key);
    const owned=!this.memory?.memory?.[key]?[]:ownedCampKnowledge(this.memory,id,this.gm.day).filter(e=>e.day===this.gm.day&&e.confidence>=.15);
    this.selectionKnowledge?.set(key,owned);return owned;
  }
  // One attributed person is one possible ballot. This projection reads only
  // this owner's statements, never another mind or the compatibility board.
  planSupport(id) {
    const accounts=new Map();
    for(const e of this.knowledge(id)) {
      const voterId=e.attributedId ?? e.speakerId;
      if(!['target','commitment'].includes(e.topic)||same(voterId,id)||!this.person(voterId)||
        !this.strategy.isTargetIdAvailable(e.subjectId))continue;
      const direct=e.provenance==='direct_statement'&&same(e.speakerId,voterId);
      const pledged=e.topic==='commitment'&&['yes','commit','committed'].includes(e.stance);
      const strength=pledged?1:['intend','lean'].includes(e.stance)?.78:['hedge','open','uncertain'].includes(e.stance)?.25:.5;
      const age=Math.max(0,(e.campTime??3600)-this.gm.dayTimer);
      const freshness=Math.max(pledged?.7:.45,1-age/5400);
      const trust=(this.gm.getTrust?.(id,e.speakerId)??50)/100;
      const weight=negative(e)?0:bounded(e.confidence/(direct?.8:1)*strength*(direct?1:.7)*
        (.7+trust*.3)*freshness*(e.challenged?.55:1));
      const entry={voterId,targetId:e.subjectId,weight,confirmed:direct&&pledged&&!e.challenged&&e.confidence>=.55,
        evidenceId:e.id,at:e.campTime??3600,direct,claim:e};
      const prior=accounts.get(String(voterId));
      // A fresh direct correction defeats older hearsay. Weak new rumors can
      // reduce an old account, but cannot silently replace a direct commitment.
      if(!prior||entry.at<prior.at&&(direct||!prior.direct||e.confidence>=.5&&prior.at-entry.at>=180)||
        entry.at===prior.at&&weight>prior.weight)accounts.set(String(voterId),entry);
    }
    const plans=new Map();
    for(const entry of accounts.values())if(entry.weight>0){const key=String(entry.targetId);
      const plan=plans.get(key)||{targetId:entry.targetId,support:0,confirmed:[],likely:[],uncertain:[],evidenceIds:[]};
      plan.support+=entry.weight;plan[entry.confirmed?'confirmed':entry.weight>=.4?'likely':'uncertain'].push(entry.voterId);
      plan.evidenceIds.push(entry.evidenceId);plans.set(key,plan);}
    return {accounts:[...accounts.values()],plans:[...plans.values()].sort((a,b)=>b.support-a.support)};
  }
  voteRead(id) {
    const {accounts,plans}=this.planSupport(id),top=plans[0];
    return {targetId:top?.targetId??null,confidence:bounded((top?.support||0)/Math.max(1,accounts.length)),
      alternatives:plans.slice(1).map(p=>p.targetId),evidenceIds:accounts.map(e=>e.evidenceId)};
  }
  viability(id,target) {
    const own=this.states[String(id)],support=this.planSupport(id).plans.find(p=>same(p.targetId,target))?.support||0;
    return support+(same(own?.intendedVoteId,target)?same(own.committedTargetId,target)?1:own.intentStatus==='lean'?.25:.65:0);
  }
  hasVotePlan(id,target) {
    const s=this.state(id);
    return same(s.intendedVoteId,target) && (same(s.committedTargetId,target) ||
      s.intentStatus!=='lean' && s.confidence>=.45);
  }
  // Dialogue and its recorded speech act must describe the same stance.
  // Cover is chosen by the caller; this helper describes truthful own intent.
  voteStatement(id,target=this.state(id).intendedVoteId) {
    const s=this.state(id),name=this.person(target)?.firstName;
    if(!name)return {topic:'target',stance:'uncertain',line:'I’m still figuring it out.'};
    if(s.intentStatus==='assignment' && same(s.splitPlan?.assignedVoteId,target) && same(s.committedTargetId,target))
      return {topic:'commitment',stance:'yes',line:`My vote is supposed to be ${name}.`};
    if(same(s.committedTargetId,target))return {topic:'commitment',stance:'yes',line:`I’m voting ${name}. That is my plan.`};
    if(s.intentStatus==='final' && this.hasVotePlan(id,target))
      return {topic:'target',stance:'intend',line:`I expect to vote ${name}.`};
    if(s.intentStatus==='provisional')return {topic:'target',stance:'lean',line:`I’m leaning ${name}. I still need to confirm it.`};
    return {topic:'target',stance:'consider',line:`${name} is where my head is. I have not committed yet.`};
  }
  knownAlliancePlans(id) {
    const A=this.gm.systems.allianceSystem,owned=this.knowledge(id);
    return (A?.getAlliancesForSurvivor?.(id)||[]).filter(a=>a.roundPlan?.day===this.gm.day&&
      a.roundPlan.participantIds?.some(x=>same(x,id))&&owned.some(e=>e.allianceId===a.id&&e.topic==='alliance_plan')&&
      !['unresolved','legacy_unconfirmed','disagreement'].includes(a.roundPlan.status)).map(a=>{
        const member=a.memberStates[id],sincere=['fake','cover'].includes(member?.sincerity)?.04:1;
        return {targetId:a.roundPlan.primaryTargetId,weight:(member?.priority??.5)*(member?.commitment??.5)*sincere,
          allianceId:a.id,plan:a.roundPlan};});
  }
  reconsiderVote(id,{eventId=null,final=false}={}) {
    const person=this.person(id);if(!person||person.isPlayer)return null;
    const s=this.refresh(id),support=this.planSupport(id),coalitions=this.knownAlliancePlans(id);
    // Replay receipts are semantic, bounded, and contain no derived knowledge.
    const receipt=eventId||`final:${this.gm.day}:${final?'expiry':'five-minutes'}`;
    if(s.reconsiderationReceipts?.includes(receipt))return s.intendedVoteId;
    s.reconsiderationReceipts=[...(s.reconsiderationReceipts||[]),receipt].slice(-48);
    this.count('voteReconsiderations');
    const acceptedSplit=s.splitPlan?.assignedVoteId;
    if(acceptedSplit&&same(s.committedTargetId,acceptedSplit)&&same(s.intendedVoteId,acceptedSplit)&&
      this.strategy.isTargetIdAvailable(acceptedSplit))return acceptedSplit;
    if(s.backup?.active&&same(s.intendedVoteId,s.backup.targetId))return s.intendedVoteId;
    const candidates=[s.preferredTargetId,s.intendedVoteId,s.committedTargetId,...support.plans.slice(0,4).map(p=>p.targetId),
      ...coalitions.map(p=>p.targetId)].filter((target,i,a)=>!same(target,id)&&this.strategy.isTargetIdAvailable(target)&&a.findIndex(x=>same(x,target))===i);
    if(!candidates.length)return null;
    const affinity=target=>this.gm.systems.allianceSystem?.getAllianceAffinity?.(id,target)||0;
    const late=this.gm.dayTimer<=600,top=support.plans[0],needed=Math.floor(this.members.length/2)+1;
    const score=target=>{
      const plan=support.plans.find(p=>same(p.targetId,target)),votes=plan?.support||0;
      const gravity=coalitions.filter(p=>same(p.targetId,target)).reduce((n,p)=>Math.max(n,p.weight),0);
      const preference=same(target,s.preferredTargetId)?.65+(1-s.flexibility)*.35:0;
      const inertia=same(target,s.intendedVoteId)?s.intentStatus==='lean'?.08:.35:0;
      const promise=same(target,s.committedTargetId)?1.35+(1-s.flexibility)*.5:0;
      const numbers=votes*(late?1.8:1.5)+(plan?.confirmed.length||0)*.26;
      const feasible=votes>=needed-1? .85:0;
      const coalition=gravity*3.4;
      const danger=s.safetyBelief<.4&&same(target,top?.targetId)? .5:0;
      const rel=this.gm.systems.relationshipSystem?.getRelationship?.(id,target)??50;
      const protection=affinity(target)*(2.4+(1-s.flexibility)*2)+(typeof rel==='number'?rel:rel.value??50)/100*.25;
      return preference+inertia+promise+numbers+feasible+coalition+danger-protection;
    };
    const ranked=candidates.map(target=>({target,score:score(target)})).sort((a,b)=>b.score-a.score);
    let winner=ranked[0].target;
    const current=ranked.find(p=>same(p.target,s.intendedVoteId));
    const margin=s.committedTargetId?.35:.22;
    if(current&&!same(winner,current.target)&&ranked[0].score-current.score<margin)winner=current.target;
    if(current&&s.flexibility<.2&&affinity(winner)>.75&&!same(winner,current.target))winner=current.target;
    const plan=support.plans.find(p=>same(p.targetId,winner));
    const gravity=coalitions.find(p=>same(p.targetId,winner)&&p.weight>.25);
    const established=(plan?.confirmed.length||0)>=2||((plan?.support||0)>=.7&&
      (plan?.likely.length||0)+(plan?.uncertain.length||0)+(plan?.confirmed.length||0)>=2)||Boolean(gravity);
    // One casual mention cannot replace a preference. A repeated, trusted plan
    // can; end-of-phase resolution uses the same evidence rather than a reroll.
    if(!same(winner,s.intendedVoteId)&&!established&&!final)return s.intendedVoteId;
    const pledged=same(winner,s.committedTargetId),compromise=!same(winner,s.preferredTargetId);
    const holdout=final&&!established&&support.plans.some(p=>!same(p.targetId,winner)&&p.confirmed.length>=2);
    const reason=pledged?'explicit_commitment':gravity?'alliance_consensus':established?
      s.safetyBelief<.4?'self_preservation':'viable_majority':compromise?'strategic_compromise':'personal_preference';
    const status=pledged?'committed':established?final||late?'final':'provisional':final?'final':'lean';
    const confidence=pledged?.84:established?bounded(.62+(plan?.support||0)*.055+(gravity?.1:0)+(late?.08:0)):.2;
    const changed=!same(winner,s.intendedVoteId);
    if(changed||status!==s.intentStatus||confidence>s.confidence)
      this.strategy.updateNpcIntentTarget(id,winner,{reason:holdout?'personal_holdout':reason,absoluteConfidence:confidence,intentStatus:status,lateVolatility:late});
    if(changed&&compromise&&established)this.count('socialCompromises');
    return winner;
  }
  // Read evidence from this owner's memory; private votes/exclusions are never inputs.
  knownPosition(ownerId, personId) {
    return this.knowledge(ownerId).filter(e => ['target','commitment'].includes(e.topic) &&
      same(e.attributedId ?? e.speakerId,personId) && !negative(e))
      .sort((a,b) => (a.campTime ?? 3600)-(b.campTime ?? 3600))[0] || null;
  }
  contact(ids, at=this.gm.dayTimer) {
    const present=ids.filter((id,i,a)=>a.findIndex(x=>same(x,id))===i && this.person(id));
    for(const id of present) for(const other of present) if(!same(id,other)) {
      const state=this.state(id);state.lastContacts[String(other)]=at;
      (state.contactDays ||= {})[String(other)]=this.gm.day;
    }
  }
  recent(id,other,seconds=420) {
    const s=this.state(id),last=s.lastContacts[String(other)];
    return last!=null && (s.contactDays?.[String(other)] ?? this.gm.day)===this.gm.day &&
      last-this.gm.dayTimer>=0 && last-this.gm.dayTimer<seconds;
  }
  refresh(id) {
    const s=this.state(id),owned=this.knowledge(id);s.perceivedMajority=this.voteRead(id);
    const dangers=new Map(), reassurance=new Map();
    const add=(key,value,e)=>{const prior=dangers.get(key);if(!prior||prior.value<value)dangers.set(key,{value,id:e.id});};
    for(const e of owned) {
      const weight=e.confidence*(e.challenged?.55:1);
      if(same(e.subjectId,id) && !negative(e)) {
        if(e.topic==='safety'&&['warned','mentioned'].includes(e.stance))add(`name:${e.attributedId??e.speakerId}`,weight*.38,e);
        if(['target','commitment'].includes(e.topic))add(`name:${e.attributedId??e.speakerId}`,weight*.32,e);
        if(e.topic==='alliance_exclusion')add('exclusion',weight*.38,e);
        if(e.topic==='safety'&&e.stance==='yes')reassurance.set(String(e.speakerId),weight*(this.gm.getTrust?.(id,e.speakerId)??50)/100*.16);
      }
      const affinity=this.gm.systems.allianceSystem?.getAllianceAffinity?.(id,e.speakerId)||0;
      if(affinity>.35 && (['commitment','alliance_doubt'].includes(e.topic)&&['hedge','uncertain','denied'].includes(e.stance)))add(`hedge:${e.speakerId}`,weight*.16,e);
      if(e.challenged&&['target','commitment','safety'].includes(e.topic))add(`conflict:${e.attributedId??e.speakerId}`,weight*.12,e);
      if(['betrayal','vote_attribution'].includes(e.topic)&&affinity>.3)add(`betrayal:${e.speakerId}`,weight*.14,e);
    }
    const alliedGroups=owned.filter(e=>e.topic==='seen_together' && ![e.subjectId,...(e.memberIds||[])].some(x=>same(x,id)) &&
      (this.memory?.getCampObservations?.(id)||[]).find(x=>x.id===e.id)?.participantIds?.some(x=>
        (this.gm.systems.allianceSystem?.getAllianceAffinity?.(id,x)||0)>.35));
    if(alliedGroups.length>=2)add('private-groups',Math.min(.16,alliedGroups.length*.035),alliedGroups.at(-1));
    const danger=Math.min(.85,[...dangers.values()].reduce((n,e)=>n+e.value,0));
    const comfort=Math.min(danger>.4?.08:.18,[...reassurance.values()].reduce((n,v)=>n+v,0));
    s.safetyBelief=bounded(.72-danger+comfort);
    s.safetyEvidenceIds=[...dangers.values()].map(e=>e.id).slice(-12);
    s.urgency=bounded((1-s.safetyBelief)*.75+(this.gm.dayTimer<=600?.25:.03));return s;
  }
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
    attributedId=null,sourceChain=null,refutesClaimId=null,allianceId=null,memberIds=[],evidenceIds=[],conditions=[],commitmentStatus=null,secrecy=null,delegationId=null,location=null,activityId=null,proposition=null,speechAct=null,leakTest=false,random=()=>this.strategy.random()}) {
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
      origin:mode==='speculation'||mode==='inference'?'inference':mode==='hearsay'?'hearsay':'participant',
      attributedId:attributedId??speakerId, sourceChain:[...(sourceChain||[attributedId??speakerId]),speakerId].filter((v,i,a)=>!same(v,a[i-1])).slice(-5),
      speechAct:speechAct||topic,conditions,commitmentStatus,secrecy,delegationId,location,activityId,proposition,leakTest,refutesClaimId,allianceId,memberIds:[...memberIds],evidenceIds:[...evidenceIds],confidence:.8,confidenceByListener:confidences,
      day:this.gm.day,campTime:this.gm.dayTimer,salience:'high',...(hiddenFalse?{truthfulness:false}:{})});
    const state=this.state(speakerId);
    for (const listener of listeners) { state.pitchesByAudience[String(listener.id)]={id,subjectId,topic,stance,mode};
      this.contact([speakerId,listener.id]); this.refresh(listener.id);
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
    if(['target','commitment','alliance_plan'].includes(topic)) for(const listener of listeners)
      this.reconsiderVote(listener.id,{eventId:`evidence:${id}`});
    return result;
  }
  adoption(listenerId,speakerId,target,{belief=true,random=()=>this.strategy.random(),trace=null}={}) {
    const finish=(outcome,reason,score=null)=>{trace?.({outcome,reason,score});return outcome;};
    const listener=this.person(listenerId),speaker=this.person(speakerId);
    if(!listener||listener.isPlayer||!speaker||!this.together(listener,speaker)||same(listenerId,target)||!this.strategy.isTargetIdAvailable(target))return finish('refuse','ineligible');
    const s=this.refresh(listenerId), trust=(this.gm.getTrust?.(listenerId,speakerId)??50)/100;
    if(s.splitPlan?.assignedVoteId&&same(s.intendedVoteId,s.splitPlan.assignedVoteId)&&
      same(s.committedTargetId,s.splitPlan.assignedVoteId)&&!same(target,s.splitPlan.assignedVoteId))return finish('hedge','accepted_split');
    if(s.backup?.active&&same(s.intendedVoteId,s.backup.targetId)&&!same(target,s.backup.targetId))return finish('hedge','active_backup');
    const relationship=this.gm.systems.relationshipSystem?.getRelationship?.(listenerId,target)??50;
    const rel=typeof relationship==='number'?relationship:relationship.value??50;
    const settled=this.gm.systems.allianceSystem?.getAlliancesForSurvivor?.(listenerId).some(a=>
      a.roundPlan?.day===this.gm.day&&a.roundPlan.status==='consensus'&&a.roundPlan.participantIds?.some(id=>same(id,listenerId))&&
      same(a.roundPlan.primaryTargetId,s.intendedVoteId)&&this.gm.systems.allianceSystem.getAlliancePriorityForMember(listenerId,a.id)>.5);
    const concern=this.knowledge(listenerId).some(e=>e.confidence>=.45&&(!negative(e)&&['idol_suspicion','idol_possession','safety'].includes(e.topic)&&same(e.subjectId,s.intendedVoteId)||e.challenged&&['target','commitment'].includes(e.topic)));
    if(settled&&s.committedTargetId&&same(s.committedTargetId,s.intendedVoteId)&&!same(s.intendedVoteId,target)&&s.safetyBelief>.5&&!concern){this.count('settledPlansHeld');return finish('hedge','settled_coalition');}
    const affinity=this.gm.systems.allianceSystem?.getAllianceAffinity?.(listenerId,speakerId)||0;
    const score=.12+trust*.23+(belief?.18:0)+(same(s.preferredTargetId,target)?.14:0)+affinity*.22+
      (same(s.intendedVoteId,target)?s.intentStatus==='lean'?.04:.13:0)+Math.min(.34,this.viability(listenerId,target)*.1)+s.urgency*.1-
      (s.committedTargetId&&!same(s.committedTargetId,target)?.19:0)-(rel>70?.12:0)+
      (same(s.intendedVoteId,target)&&this.gm.dayTimer<=600?.1:0)+(random()-.5)*.12;
    const outcome=score>=.64?'commit':score>=.47?'open':score>=.31?'hedge':'refuse';
    if(outcome==='commit'||outcome==='open'&&s.flexibility>.5&&score>.54)
      this.strategy.updateNpcIntentTarget(listenerId,target,{reason:'strategic_compromise',absoluteConfidence:outcome==='commit'?.76:.48,
        intentStatus:outcome==='commit'?'committed':'provisional',lateVolatility:this.gm.dayTimer<=600});
    if(outcome==='commit')s.committedTargetId=target; if(outcome==='hedge'||outcome==='open')this.count('hedges'); return finish(outcome,'evaluated',score);
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
    const prior=this.state(ownerId).backup;if(prior&&same(prior.primaryTargetId,primaryTargetId)&&same(prior.targetId,targetId))return prior;
    // The concern that prompted insurance is not a new reason to abandon the vote.
    const triggerEvidenceIds=this.knowledge(ownerId).filter(e=>same(e.subjectId,primaryTargetId)&&['idol_suspicion','idol_possession','safety'].includes(e.topic)).map(e=>e.id).slice(-12);
    const plan={id:`backup:${ownerId}:${primaryTargetId}:${targetId}`,primaryTargetId,targetId,informedIds:ids,trigger,triggerEvidenceIds,active:false};
    this.plans[plan.id]=plan;for(const id of ids)this.state(id).backup=copy(plan);this.count('backups');return plan;
  }
  activateBackup(ownerId,trigger) {
    const known=this.state(ownerId).backup,plan=this.plans[known?.id];
    if(!plan||!this.strategy.isTargetIdAvailable(plan.targetId)||known.active||plan.trigger!==trigger||!plan.informedIds.some(id=>same(id,ownerId)))return false;
    plan.active=true;this.count('backupsActivated');
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
  // Read-only version of the opposition/minimum arithmetic used by group
  // coordination below. Callers supply their own confirmed coalition evidence.
  splitCapacity(confirmedIds, secondaryTargetId) {
    const voters=[...new Set(confirmedIds.map(String))].filter(id=>this.person(id)&&!same(id,secondaryTargetId));
    const opposition=this.members.length-voters.length, minimum=opposition+1, mainCount=voters.length-minimum;
    return {viable:mainCount>=minimum,minimum,mainCount,voterIds:voters};
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
    if(s.backup?.active&&same(s.intendedVoteId,s.backup.targetId)&&!same(target,s.backup.targetId))return false;
    if(same(s.intendedVoteId,target)&&same(s.committedTargetId,target)&&s.intentStatus==='assignment')return true;
    this.strategy.updateNpcIntentTarget(id,target,{reason:'split_assignment',absoluteConfidence:.9,intentStatus:'assignment'});s.committedTargetId=target;return true;}
  react(id) {
    const plan = this.states[String(id)]?.backup;
    if (!plan || plan.active) return false;
    const owned = this.knowledge(id);
    const triggered = plan.trigger === 'suspected_idol' && owned.some(e =>
      ['idol_suspicion','idol_possession'].includes(e.topic) && same(e.subjectId,plan.primaryTargetId) && !negative(e) && !plan.triggerEvidenceIds?.includes(e.id)) ||
      plan.trigger === 'target_aware' && owned.some(e => e.topic === 'safety' && same(e.subjectId,plan.primaryTargetId) && e.stance === 'warned' && !plan.triggerEvidenceIds?.includes(e.id)) ||
      plan.trigger === 'target_unavailable' && !this.strategy.isTargetIdAvailable(plan.primaryTargetId) ||
      plan.trigger === 'lost_votes' && this.viability(id,plan.primaryTargetId) < 1.5;
    return triggered ? this.activateBackup(id,plan.trigger) : false;
  }
  inferLeak(id) {
    const owned=this.knowledge(id),raw=this.memory?.getCampClaims?.(id)||[];
    for(const returned of owned.filter(e=>e.sourceChain?.length>=2 && !same(e.speakerId,id))){
      const sent=raw.find(e=>same(e.speakerId,id)&&['target','backup','commitment'].includes(e.topic)&&e.topic===returned.topic&&same(e.subjectId,returned.subjectId)&&e.audienceIds?.some(x=>returned.sourceChain.some(y=>same(x,y))));
      if(!sent)continue;
      const suspect=sent.audienceIds.find(x=>returned.sourceChain.some(y=>same(x,y))),key=`leak-inference:${sent.id}:${returned.id}`;
      if(raw.some(e=>e.id===key))continue;
      this.memory.recordCampClaim({id:key,speakerId:id,subjectId:suspect,topic:'alliance_doubt',stance:'uncertain',origin:'inference',confidence:.35,day:this.gm.day,campTime:this.gm.dayTimer,evidenceIds:[sent.id,returned.id],sourceChain:returned.sourceChain});
      this.count('suspectedLeaks');
    }
  }
  agenda(speakerId,listenerId,{plan=false}={}) {
    this.inferLeak(speakerId);
    const s=this.refresh(speakerId), owned=this.knowledge(speakerId), profile=getCampBehaviorProfile(this.person(speakerId));
    const affinity=this.gm.systems.allianceSystem?.getAllianceAffinity?.(speakerId,listenerId)||0;
    const position=this.knownPosition(speakerId,listenerId), support=position && same(position.subjectId,s.intendedVoteId) && position.confidence>=.5 && !position.challenged;
    const commitment=support&&position.topic==='commitment';
    const options=[],add=(purpose,priority,value,subject=s.intendedVoteId,mode='truthful',evidence=[],extra={})=>options.push({purpose,priority,value,primarySubject:subject,messageMode:mode,knownEvidence:evidence,...extra});
    const verify=owned.filter(e=>same(e.attributedId,listenerId)&&!same(e.speakerId,listenerId)&&!negative(e)&&
      ['target','commitment','safety','idol_suspicion','alliance_disclosure'].includes(e.topic)).find(e=>
        !owned.some(d=>same(d.speakerId,listenerId)&&d.topic===e.topic&&same(d.subjectId,e.subjectId)&&d.campTime<=e.campTime&&!d.challenged || d.refutesClaimId===e.id));
    if(verify){const important=verify.challenged||this.contradictions(speakerId).some(c=>c.id===verify.id)||same(verify.subjectId,speakerId)||same(verify.subjectId,s.intendedVoteId);
      add('verify_story',important?5:3,important?3:1.2,verify.subjectId,'question',[verify.id]);}
    const danger=owned.find(e=>['target','commitment','safety','alliance_exclusion'].includes(e.topic)&&same(e.subjectId,listenerId)&&!negative(e)&&(e.topic!=='safety'||e.stance!=='yes'));
    if(danger && (affinity>.3||(this.gm.getTrust?.(speakerId,listenerId)??50)>=65) && !same(s.intendedVoteId,listenerId))add('warn_ally',5,2.8,listenerId,'hearsay',[danger.id]);
    const leak=owned.find(e=>same(e.subjectId,s.intendedVoteId)&&e.topic==='safety'&&e.stance==='warned');
    const idol=owned.find(e=>['idol_suspicion','idol_possession'].includes(e.topic)&&same(e.subjectId,s.intendedVoteId)&&!negative(e)&&e.confidence>=.3);
    if((idol||leak)&&!s.backup&&affinity>.3&&!same(listenerId,s.intendedVoteId))add('establish_backup',4,2.1,s.intendedVoteId,'truthful',[(idol||leak).id],{trigger:idol?'suspected_idol':'target_aware'});
    const competing=position&&!same(position.subjectId,s.intendedVoteId);
    const concern=owned.find(e=>['alliance_doubt','alliance_exclusion','alliance_departure'].includes(e.topic)&&same(e.subjectId,listenerId));
    if(affinity>.3 && (!commitment||position?.challenged||concern) && s.intendedVoteId && !same(listenerId,s.intendedVoteId))add('check_loyalty',4,1.6,s.intendedVoteId,'question',position?[position.id]:[]);
    const existingDecoy=s.decoys.find(p=>p.audienceIds.some(x=>same(x,listenerId)));
    if(existingDecoy)add('spread_decoy',4,1.7,existingDecoy.targetId,'decoy',[],{cover:true});
    const cover=this.hasVotePlan(speakerId,listenerId)&&profile.honesty<.7;
    if(cover){const panic=owned.some(e=>same(e.subjectId,listenerId)&&['safety','idol_possession','idol_suspicion'].includes(e.topic));
      const decoy=s.decoys.find(p=>p.audienceIds.some(x=>same(x,listenerId)));
      add(decoy?'spread_decoy':'reassure_target',4,panic?2.7:1.7,decoy?.targetId||listenerId,decoy?'decoy':'reassurance_lie',[],{cover:true});}
    if(s.safetyBelief<.43 && s.intendedVoteId&&!same(s.intendedVoteId,listenerId)&&!commitment)add('counter_pitch',5,2.4,s.intendedVoteId);
    // A swing is unknown or tentatively open, not a known settled supporter or committed opponent.
    const plans=this.planSupport(speakerId).plans,current=plans.find(p=>same(p.targetId,s.intendedVoteId));
    const deadPlan=plans.some(p=>!same(p.targetId,s.intendedVoteId)&&p.confirmed.length>=Math.floor(this.members.length/2))&&
      (current?.support||0)<.75;
    if(!deadPlan&&s.intendedVoteId&&!same(s.intendedVoteId,listenerId)&&!support && (position&&position.topic!=='commitment'||position&&position.confidence<.5||!position&&this.gm.dayTimer<=300))
      add('recruit_swing',3,1.4,s.intendedVoteId);
    if(competing && s.safetyBelief<.6 && !same(s.intendedVoteId,listenerId))add('counter_pitch',3,1.6,s.intendedVoteId,'truthful',[position.id]);
    if(!position || position.challenged)add('gather_intel',2,1.1,null,'question',position?[position.id]:[]);
    const follow=s.followUp;
    if(follow&&same(follow.listenerId,listenerId)&&follow.day===this.gm.day)add(follow.purpose,4,2,follow.subjectId,'question',follow.evidenceIds||[]);
    const info=owned.filter(e=>!same(e.speakerId,speakerId)&&e.confidence>=.35&&!e.challenged&&
      ['target','commitment','backup','alliance_disclosure','safety'].includes(e.topic)&&!e.sourceChain?.some(x=>same(x,listenerId))&&!(s.motiveReceipts?.[`share_intel:${listenerId}:${e.subjectId}:${e.id}`])).at(-1);
    // Motivation reads speaker's knowledge and relationship; delivery never grants hidden listener state.
    if(info && affinity>.4 && (this.gm.getTrust?.(speakerId,listenerId)??50)>60 && profile.strategyDrive>.35)
      add('share_intel',2,1.25,info.subjectId,'hearsay',[info.id]);
    const allianceMotive=this.gm.systems.allianceSystem?.npcMotive?.(speakerId,listenerId);
    if(allianceMotive && (this.gm.dayTimer>600||['alliance_recruitment','alliance_repair'].includes(allianceMotive.purpose)))
      add(allianceMotive.purpose,cover&&allianceMotive.sincerity==='fake'?4:1,cover?2:1,s.intendedVoteId,'truthful',[],{allianceMotive});
    const now=this.gm.dayTimer,receipts=s.motiveReceipts ||= {};
    for(const x of options)x.key=`${x.purpose}:${listenerId}:${x.primarySubject}:${x.knownEvidence.join(',')}`;
    const choice=options.filter(x=>{const r=receipts[x.key];return !r||r.day!==this.gm.day||r.at-now>=900 && !['gather_intel','verify_story','reassure_target','spread_decoy'].includes(x.purpose);})
      .sort((a,b)=>b.priority-a.priority||b.value-a.value)[0];
    if(!choice)return {purpose:'settled',priority:0,value:0,primarySubject:null,knownEvidence:[],messageMode:'truthful'};
    // Decoys are only generated after selecting a valuable cover interaction.
    if(plan&&choice.purpose==='reassure_target'&&s.confidence>=.6&&profile.honesty<.5){
      const alternate=this.alternateTarget(speakerId,[speakerId,listenerId]);
      if(alternate){this.decoy(speakerId,alternate,[listenerId],leak?'contain_leak':'hide_blindside');choice.purpose='spread_decoy';choice.primarySubject=alternate;choice.messageMode='decoy';}}
    return {...choice,initiatorId:speakerId,listenerIds:[listenerId],desiredOutcome:choice.purpose==='verify_story'?'verify':'support'};
  }
  alternateTarget(ownerId,excluded=[]) {
    const s=this.state(ownerId),read=this.voteRead(ownerId);
    return this.members.filter(p=>!excluded.some(x=>same(x,p.id))&&!same(p.id,s.intendedVoteId)&&this.strategy.isTargetIdAvailable(p.id))
      .map(p=>({id:p.id,score:(read.alternatives.some(x=>same(x,p.id))?1:0)+(1-(this.gm.getTrust?.(ownerId,p.id)??50)/100)+
        (1-(this.gm.systems.allianceSystem?.getAllianceAffinity?.(ownerId,p.id)||0))})).sort((a,b)=>b.score-a.score)[0]?.id||null;
  }
  candidateScore(speakerId,listenerId) {
    const s=this.refresh(speakerId),agenda=this.agenda(speakerId,listenerId);
    if(agenda.purpose==='settled')return -Infinity;
    const receipt=s.motiveReceipts?.[agenda.key],urgent=agenda.priority>=5 && !receipt;
    if(this.recent(speakerId,listenerId)&&!urgent)return -Infinity;
    const trust=(this.gm.getTrust?.(speakerId,listenerId)??50)/100;
    const time=this.gm.dayTimer<=300 && agenda.priority<3 ? -3 : 0;
    return agenda.priority*3+agenda.value+trust*.4+time;
  }
  choosePartner(actor,candidates) {
    // Reuse bounded owner projections only within this synchronous selection.
    // A conversation or restore never inherits cached knowledge.
    this.inferLeak(actor.id);this.selectionKnowledge=new Map();
    try{return candidates.filter(p=>p&&!same(p.id,actor.id)&&this.present(p,p.isPlayer?p.location:this.gm.systems.npcLocationSystem.getLocation(p.id)))
      .map(p=>({p,score:this.candidateScore(actor.id,p.id)})).filter(x=>Number.isFinite(x.score)).sort((a,b)=>b.score-a.score)[0]?.p||null;}
    finally{this.selectionKnowledge=null;}
  }
  resolveAgenda(actor,listener,activity,random=()=>this.strategy.random()) {
    if(!this.together(actor,listener))return null;
    const agenda=activity.agenda||this.agenda(actor.id,listener.id,{plan:true}),prefix=activity.id;
    const id=`${prefix}:agenda:${listener.id}`;
    if(this.resolved[id])return this.resolved[id];
    this.count(`motive:${agenda.purpose}`);const heard=this.knownPosition(actor.id,listener.id);
    const previous=this.state(actor.id).motiveReceipts?.[agenda.key];
    if(previous?.day===this.gm.day)this.count('repeatedIdenticalAction');
    if(agenda.purpose==='gather_intel'&&heard?.confidence>=.5&&!heard.challenged)this.count('gatherKnownPosition');
    if(agenda.purpose==='recruit_swing'&&heard?.topic==='commitment'&&heard.confidence>=.5&&!heard.challenged&&!same(heard.subjectId,this.state(actor.id).intendedVoteId))this.count('recruitSettledOpponent');
    if(agenda.purpose==='recruit_swing'&&heard?.topic==='commitment'&&heard.confidence>=.5&&!heard.challenged&&same(heard.subjectId,this.state(actor.id).intendedVoteId))this.count('unnecessaryRecruitSwing');
    this.contact([actor.id,listener.id]);
    const state=this.state(actor.id);(state.motiveReceipts ||= {})[agenda.key||`${agenda.purpose}:${listener.id}:${agenda.primarySubject}:${(agenda.knownEvidence||[]).join(',')}`]={day:this.gm.day,at:this.gm.dayTimer};
    if(Object.keys(state.motiveReceipts).length>40)delete state.motiveReceipts[Object.keys(state.motiveReceipts)[0]];
    if(state.followUp&&same(state.followUp.listenerId,listener.id))state.followUp=null;
    if(agenda.allianceMotive){const result=this.gm.systems.allianceSystem.resolveNpcMotive(actor.id,listener.id,agenda.allianceMotive,id,random);this.resolved[id]={status:result?.status||'unresolved'};return this.resolved[id];}
    if(agenda.purpose==='settled')return this.resolved[id]={outcome:'settled'};
    if(agenda.purpose==='share_intel'){const e=this.knowledge(actor.id).find(e=>agenda.knownEvidence.includes(e.id));if(!e)return null;this.count('planLeaks');return this.statement({id,speakerId:actor.id,listenerIds:[listener.id],subjectId:e.subjectId,topic:e.topic,stance:e.stance,mode:'hearsay',attributedId:e.attributedId||e.speakerId,sourceChain:e.sourceChain,allianceId:e.allianceId,memberIds:e.memberIds,evidenceIds:[e.id,...(e.evidenceIds||[])].slice(-8),random});}
    if(['gather_intel','check_loyalty'].includes(agenda.purpose)){const s=this.state(listener.id),cover=this.hasVotePlan(listener.id,actor.id)||this.gm.systems.allianceSystem?.getAlliancesForSurvivor?.(listener.id).some(a=>['fake','cover'].includes(a.memberStates[listener.id]?.sincerity)&&this.gm.systems.allianceSystem.knownRoster(listener.id,a.id).some(id=>same(id,actor.id)));
      const target=cover?s.decoys.find(d=>d.audienceIds.some(x=>same(x,actor.id)))?.targetId||this.alternateTarget(listener.id,[listener.id,actor.id]):s.intendedVoteId;
      if(!target)return this.resolved[id]={outcome:'unknown'};
      if(!cover&&same(target,actor.id))return this.resolved[id]={outcome:'uncertain'};
      const committed=!cover&&same(s.committedTargetId,target);this.count(agenda.purpose==='gather_intel'?'gatherIntelAttempts':'loyaltyChecks');
      const result=this.statement({id,speakerId:listener.id,listenerIds:[actor.id],subjectId:target,topic:committed?'commitment':'target',
        stance:committed?'yes':!cover&&s.intentStatus!=='lean'?'intend':'consider',mode:cover?'decoy':'truthful',random});
      // Asking for a read can end with an actual agreement. The reply evaluates
      // this speaker's mind, rather than treating exchanged wishes as ballots.
      if(result&&!actor.isPlayer&&agenda.purpose==='gather_intel'){
        const outcome=this.adoption(actor.id,listener.id,target,{belief:result.belief[String(actor.id)],random});
        if(outcome==='commit')this.commit({id:`${prefix}:read_agreement:${actor.id}`,speakerId:actor.id,listenerIds:[listener.id],targetId:target,random});
      }
      return result;}
    if(agenda.purpose==='establish_backup'){const next=this.alternateTarget(actor.id,[actor.id,listener.id]);if(!next)return null;
      const backup=this.backup(actor.id,agenda.primarySubject,next,[listener.id],agenda.trigger||'suspected_idol');
      return this.statement({id,speakerId:actor.id,listenerIds:[listener.id],subjectId:next,topic:'backup',stance:'possible',random});}
    let topic='target',stance='consider',subjectId=agenda.primarySubject,mode=agenda.messageMode;
    if(agenda.purpose==='verify_story') {
      this.count('verificationAttempts');const known=this.knowledge(actor.id).find(e=>agenda.knownEvidence.includes(e.id));
      const prior=(this.memory.memory[String(listener.id)]?.campClaims||[]).find(e=>same(e.speakerId,listener.id)&&same(e.subjectId,subjectId)&&e.topic===known?.topic);
      const lie=!prior&&getCampBehaviorProfile(listener).honesty<.45&&random()<.35;
      return this.statement({id,speakerId:listener.id,listenerIds:[actor.id],subjectId,topic:known?.topic||'target',stance:prior?.stance|| (lie?'mentioned':'denied'),
        mode:lie||prior?.truthfulness===false?'deliberate_lie':'truthful',attributedId:listener.id,refutesClaimId:prior||lie?null:known?.id,random});
    }
    if(agenda.purpose==='warn_ally'){topic='safety';stance='warned';const e=this.knowledge(actor.id).find(e=>agenda.knownEvidence.includes(e.id));this.count('warningAttempts');return this.statement({id,speakerId:actor.id,listenerIds:[listener.id],subjectId,topic,stance,mode:'hearsay',attributedId:e?.attributedId||e?.speakerId,sourceChain:e?.sourceChain,random});}
    if(agenda.purpose==='reassure_target'){topic='safety';stance='yes';}
    if(!subjectId){const read=this.voteRead(listener.id);subjectId=read.targetId;if(!subjectId)return {outcome:'unknown'};
      return this.statement({id,speakerId:listener.id,listenerIds:[actor.id],subjectId,mode:'inference',random});}
    if(topic==='target'&&same(subjectId,state.intendedVoteId)&&mode==='truthful'){
      if(same(state.committedTargetId,subjectId)){topic='commitment';stance='yes';}
      else if(state.intentStatus!=='lean')stance='intend';
    }
    const pitching=['counter_pitch','recruit_swing'].includes(agenda.purpose);
    if(pitching){
      const supporter=this.planSupport(actor.id).accounts.filter(e=>same(e.targetId,subjectId)&&e.weight>=.3&&
        !same(e.voterId,listener.id)).sort((a,b)=>b.weight-a.weight)[0];
      if(supporter){const e=supporter.claim;this.statement({id:`${prefix}:numbers:${listener.id}`,speakerId:actor.id,listenerIds:[listener.id],
        subjectId,topic:e.topic,stance:e.stance,mode:'hearsay',attributedId:supporter.voterId,sourceChain:e.sourceChain,random});}
    }
    const result=this.statement({id,speakerId:actor.id,listenerIds:[listener.id],subjectId,topic,stance,mode,random});
    if(result)this.gm.systems.campInteractionSystem?.hearExchange?.({speaker:actor,listener,activity,claimId:id,random});
    if((topic==='target'||topic==='commitment'&&pitching)&&result){const outcome=this.adoption(listener.id,actor.id,subjectId,{belief:result.belief[String(listener.id)],random});
      if(outcome==='commit')this.commit({id:`${prefix}:promise:${listener.id}`,speakerId:listener.id,listenerIds:[actor.id],targetId:subjectId,random});
      return {...result,outcome};}
    return result;
  }
  resolveMeeting(participants,activity,random=()=>this.strategy.random()) {
    const coalition=this.gm.systems.allianceSystem?.getAlliance?.(activity.allianceId);
    const cover=id=>['fake','cover'].includes(coalition?.memberStates[id]?.sincerity);
    let proposedPlan=false;
    const positions=participants.map(p=>{const s=this.state(p.id);return {id:p.id,preferredTargetId:s.preferredTargetId,intendedVoteId:cover(p.id)?s.decoys[0]?.targetId||coalition?.roundPlan?.primaryTargetId||s.preferredTargetId:s.intendedVoteId,
      publicTargetId:null};});
    // Everyone contributes their own position before anyone weighs the discussion.
    for(const p of positions)if(p.intendedVoteId)this.statement({id:`${activity.id}:position:${p.id}`,speakerId:p.id,listenerIds:participants.filter(x=>!same(x.id,p.id)).map(x=>x.id),subjectId:p.intendedVoteId,
      stance:same(this.state(p.id).committedTargetId,p.intendedVoteId)&&!cover(p.id)?'intend':'consider',mode:cover(p.id)?'decoy':'truthful',random});
    // A coalition discusses a concrete proposal, not just a collection of
    // individual wishes. Selection uses its convener's owned public positions.
    const convener=participants[0];
    if(coalition&&participants.length>=3){
      const alternate=this.alternateTarget(convener.id,participants.map(p=>p.id));
      const candidates=[...positions.map(p=>p.intendedVoteId),alternate].filter((target,i,a)=>target&&
        !participants.some(p=>same(p.id,target))&&a.findIndex(x=>same(x,target))===i);
      const proposed=candidates.map(target=>({target,score:this.viability(convener.id,target)+
        (same(this.state(convener.id).preferredTargetId,target)?.25:0)-
        (this.gm.systems.allianceSystem.getAllianceAffinity(convener.id,target)||0)*2}))
        .sort((a,b)=>b.score-a.score)[0]?.target;
      if(proposed){
        proposedPlan=true;
        this.gm.systems.allianceSystem.captureRoundPlan(coalition.id,participants,
          {targetId:proposed,outcome:'proposed',participantCommitments:{}},`${activity.id}:proposal`);
        for(const p of participants){
          if(cover(p.id)){
            this.commit({id:`${activity.id}:agreement:${p.id}`,speakerId:p.id,listenerIds:participants.filter(x=>!same(x.id,p.id)).map(x=>x.id),targetId:proposed,lie:true,random});
            positions.find(x=>same(x.id,p.id)).publicTargetId=proposed;continue;
          }
          this.reconsiderVote(p.id,{eventId:`meeting:${activity.id}:proposal`});
          if(!p.isPlayer&&same(this.state(p.id).intendedVoteId,proposed)){
            this.commit({id:`${activity.id}:agreement:${p.id}`,speakerId:p.id,listenerIds:participants.filter(x=>!same(x.id,p.id)).map(x=>x.id),targetId:proposed,random});
            positions.find(x=>same(x.id,p.id)).publicTargetId=proposed;
          }
        }
      }
    }
    for(const p of participants){if(cover(p.id)||proposedPlan)continue;const read=this.voteRead(p.id);if(!read.targetId)continue;
      const speaker=participants.find(x=>!same(x.id,p.id)&&same(positions.find(y=>same(y.id,x.id))?.intendedVoteId,read.targetId));
      if(speaker)this.adoption(p.id,speaker.id,read.targetId,{random});}
    const counts=new Map();for(const p of participants){const position=positions.find(x=>same(x.id,p.id));
      const target=cover(p.id)?position.publicTargetId||position.intendedVoteId:this.state(p.id).intendedVoteId;
      position.publicTargetId=target;if(target)counts.set(target,(counts.get(target)||0)+1);}
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
        const opposition=this.members.length-participants.length;
        const minimum=opposition+1,mainCount=participants.length-minimum;
        if(mainCount>=minimum && getCampBehaviorProfile(owner).strategyDrive>=.5 && participants.every(p=>same(p.id,owner.id)||(this.gm.getTrust?.(owner.id,p.id)??50)>=60)) {
          const assignments = Object.fromEntries(participants.map((p,i)=>[p.id,i<mainCount?target:secondary]));
          const plan=this.split(owner.id,target,secondary,assignments,[owner.id]);
          if(plan)this.count('viableSplitPlans');
          if(plan&&!cover(owner.id))this.acceptSplit(owner.id);
          if (plan) for (const participant of participants) {
            const assigned=plan.assignments[participant.id];
            if (assigned && !same(participant.id,owner.id) && this.adoption(participant.id,owner.id,assigned,{random})==='commit') this.acceptSplit(participant.id);
          }
        }
      }
    }
    this.contact(participants.map(p=>p.id));
    for(const p of participants){const dissent=positions.find(x=>!same(x.id,p.id)&&target&&!same(x.intendedVoteId,target));if(dissent)this.state(p.id).followUp={day:this.gm.day,purpose:'check_loyalty',listenerId:dissent.id,subjectId:target,evidenceIds:[`${activity.id}:position:${dissent.id}`]};}
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
