import { getCampBehaviorProfile } from './CampBehaviorProfile.js';
const same=(a,b)=>a!=null&&b!=null&&String(a)===String(b);
const response={commit:'I’m voting that way. I’m with you.',open:'I could do that. Let me talk to people.',hedge:'Maybe. I’m not committing yet.',refuse:'I don’t think that works for me.'};

// Small semantic nodes consumed by the existing ConversationSystem renderer.
export function scrambleNodes(model,{player,npc,context={},topic='strategy'}) {
  const reservation=model.gm.systems.campActivitySystem.conversation;
  const prefix=reservation?.activityId || 'unavailable';
  const listeners=[npc.id,...(reservation?.groupIds||[])].filter((x,i,a)=>a.findIndex(y=>same(x,y))===i);
  const name=id=>model.person(id)?.firstName||'someone';
  const node=(id,label,line,resolve)=>({id,buttonText:label,playerLine:line,semanticResolve:resolve});
  const emit=(id,subjectId,options={},random)=>model.statement({id:`${prefix}:${id}`,speakerId:player.id,listenerIds:listeners,subjectId,...options,random});
  const npcSay=(id,subjectId,options={},random)=>model.statement({id:`${prefix}:${id}`,speakerId:npc.id,listenerIds:[player.id],subjectId,...options,random});
  const owned=model.knowledge(player.id), state=model.states[String(npc.id)];
  const playerPlan=model.states[String(player.id)]?.intendedVoteId || [...owned].reverse().find(e=>['target','commitment'].includes(e.topic)&&!['denied','no','protect'].includes(e.stance))?.subjectId;
  const nodes=[node('vote_read','What have you heard?','What do you think the vote is?',random=>{
    const decoy=state?.decoys.find(d=>d.audienceIds.some(id=>same(id,player.id)));
    const read=model.voteRead(npc.id); const target=decoy?.targetId||read.targetId;
    if(!target)return {line:'Nobody has really given me a name. I’m still trying to figure it out.'};
    npcSay('vote_read',target,{mode:decoy?'decoy':'inference',stance:'consider'},random);
    return {line:decoy?`I’m hearing ${name(target)}.`:`I’ve heard ${name(target)}${read.alternatives.length?' and another name':''}. I’m not certain.`};
  }),node('not_commit','I’m not committing yet.','I want to talk to people before I commit.',()=>({line:'Fair. Let me know where you land.'})),
    node('safety_read','Is my name coming up?','Have you heard my name?',random=>{
      const evidence=model.knowledge(npc.id).find(e=>['target','safety'].includes(e.topic)&&same(e.subjectId,player.id)&&!['denied','no','protect'].includes(e.stance));
      if(evidence&&(model.gm.getTrust?.(npc.id,player.id)??50)>55){npcSay('safety_read',player.id,{topic:'safety',stance:'warned',mode:'hearsay',sourceChain:evidence.sourceChain},random);return {line:'I have heard your name. You should check in with people.'};}
      if(same(state?.intendedVoteId,player.id)&&getCampBehaviorProfile(npc).honesty<.7){npcSay('safety_read',player.id,{topic:'safety',stance:'yes',mode:'reassurance_lie'},random);return {line:'You’re fine. Don’t worry.'};}
      return {line:'Nobody has told me that. I can’t promise anything.'};
    })];
  for(const target of model.members.filter(p=>!same(p.id,player.id)&&!same(p.id,npc.id)&&model.strategy.isTargetIdAvailable(p.id))) {
    nodes.push(node(`counter:${target.id}`,`What if we do ${target.firstName}?`,`What if we vote ${target.firstName}?`,random=>{
      const statement=emit(`counter:${target.id}`,target.id,{},random),outcomes=[];
      for(const id of listeners){const outcome=model.adoption(id,player.id,target.id,{belief:statement?.belief[String(id)],random});outcomes.push(outcome);
        if(outcome==='commit')model.commit({id:`${prefix}:counter_promise:${target.id}:${id}`,speakerId:id,listenerIds:[player.id],targetId:target.id,random});}
      return {line:response[outcomes[0]],outcomes};
    }));
    nodes.push(node(`commit:${target.id}`,`Commit to ${target.firstName}.`,`I’m voting ${target.firstName}.`,random=>{
      model.commit({id:`${prefix}:commit:${target.id}`,speakerId:player.id,listenerIds:listeners,targetId:target.id,random});return {line:'Okay. I’ll keep that in mind.'};
    }));
    nodes.push(node(`bluff_vote:${target.id}`,`Bluff: promise ${target.firstName}.`,`I’m voting ${target.firstName}.`,random=>{
      model.commit({id:`${prefix}:bluff_vote:${target.id}`,speakerId:player.id,listenerIds:listeners,targetId:target.id,lie:true,random});return {line:'Okay. I’ll keep that in mind.'};
    }));
  }
  for(const claim of owned.filter(e=>['target','safety','commitment','idol_suspicion','idol_possession'].includes(e.topic)&&!same(e.speakerId,player.id)).slice(-5)) {
    const source=name(claim.attributedId||claim.speakerId),subject=name(claim.subjectId);
    nodes.push(node(`share:${claim.id}`,`${source} mentioned ${subject}.`,`${source} mentioned ${subject}.`,random=>{
      emit(`share:${claim.id}`,claim.subjectId,{topic:claim.topic,stance:claim.stance,mode:'hearsay',attributedId:claim.attributedId||claim.speakerId,sourceChain:claim.sourceChain},random);
      return {line:'That’s useful to know. I’ll check it out.'};
    }));
    if(same(claim.attributedId||claim.speakerId,npc.id))nodes.push(node(`verify:${claim.id}`,`Did you mention ${subject}?`,`I heard you mentioned ${subject}. Is that right?`,random=>{
      const history=model.memory.memory[String(npc.id)]?.campClaims||[];
      const prior=history.find(e=>same(e.speakerId,npc.id)&&same(e.subjectId,claim.subjectId)&&e.topic===claim.topic&&e.stance===claim.stance);
      const said=Boolean(prior);
      const fabricate=!said&&getCampBehaviorProfile(npc).honesty<.45&&random()<.3;
      npcSay(`verify:${claim.id}`,claim.subjectId,{topic:claim.topic,stance:said||fabricate?claim.stance:'denied',mode:fabricate||prior?.truthfulness===false?'deliberate_lie':'truthful',refutesClaimId:said||fabricate?null:claim.id},random);
      model.count('verificationAttempts');return {line:said||fabricate?'Yes. That’s what I told them.':'I didn’t say that. You should ask them where that came from.'};
    }));
  }
  const sources=model.members.filter(p=>!same(p.id,player.id)&&!same(p.id,npc.id)).slice(0,3);
  for(const source of sources)nodes.push(node(`bluff_warning:${source.id}`,`Bluff: ${source.firstName} said your name.`,`${source.firstName} said you’re the vote.`,random=>{
    const result=emit(`bluff_warning:${source.id}`,npc.id,{topic:'safety',stance:'warned',mode:'deliberate_lie',attributedId:source.id},random);
    return {line:result?.belief[String(npc.id)]?'Really? I need to go talk to them.':'That doesn’t match what I’ve heard. I’ll check.'};
  }));
  for(const claim of owned.filter(e=>e.topic==='safety'&&same(e.subjectId,player.id)))nodes.push(node(`confront:${claim.id}`,'I heard my name is coming up.','I heard my name is coming up. What do you know?',random=>{
    emit(`confront:${claim.id}`,player.id,{topic:'safety',stance:'warned',mode:'hearsay',attributedId:claim.attributedId||claim.speakerId,sourceChain:claim.sourceChain},random);
    return {line:'There are different stories going around. Ask who actually said it.'};
  }));
  const idol=[node('idol_looked','Have you looked?','Have you looked for an idol?',random=>{
    const searched=model.searched(npc.id),admit=searched&&random()<getCampBehaviorProfile(npc).honesty;
    npcSay('idol_looked',npc.id,{topic:'idol_search',stance:admit?'yes':'no',mode:searched&&!admit?'deliberate_lie':'truthful'},random);
    return {line:admit?'Yeah, a little. I haven’t told many people.':'No, I’ve been around camp.'};
  }),node('idol_found','Did you find anything?','Did you find an idol?',random=>{
    const possession=model.idolAnswer(npc.id).ownsIdol,profile=getCampBehaviorProfile(npc);
    const disclose=possession&&(model.gm.getTrust?.(npc.id,player.id)??50)>65&&random()<profile.advantageSharing;
    npcSay('idol_found',npc.id,{topic:'idol_possession',stance:disclose?'yes':'no',mode:possession&&!disclose?'deliberate_lie':'truthful'},random);
    return {line:disclose?'Yes. Keep that between us.':'No idol to show you.'};
  }),node('bluff_idol','Bluff: I have an idol.','I have an idol.',random=>{
    emit('bluff_idol',player.id,{topic:'idol_possession',stance:'yes',mode:'deliberate_lie'},random);return {line:'Okay. I’ll think about what that means.'};
  })];
  if(listeners.length>=2)for(const target of model.members.filter(p=>!same(p.id,player.id)&&!listeners.some(id=>same(id,p.id))&&model.strategy.isTargetIdAvailable(p.id)).slice(0,3)) {
    nodes.push(node(`backup:${target.id}`,`Keep ${target.firstName} as backup?`,`Could ${target.firstName} be our backup?`,random=>{
      const primary=playerPlan;
      if(!primary)return {line:'We should settle the main name before choosing a backup.'};
      model.backup(player.id,primary,target.id,listeners);emit(`backup:${target.id}`,target.id,{topic:'backup',stance:'possible'},random);return {line:'That could be a backup. We still need to settle the main plan.'};
    }));
  }
  if (listeners.length >= 2 && playerPlan) {
    const primary = playerPlan;
    for (const secondary of model.members.filter(p => !same(p.id, primary) && !same(p.id, player.id) &&
        !listeners.some(id => same(id, p.id)) && model.strategy.isTargetIdAvailable(p.id)).slice(0, 2))
      nodes.push(node(`split_vote:${secondary.id}`, `Propose a split with ${secondary.firstName}.`, 'Could we divide our votes as insurance?', random => {
        const participants = [player.id, ...listeners];
        const assignments = Object.fromEntries(participants.map((id,i) => [id, i < Math.ceil(participants.length * .66) ? primary : secondary.id]));
        const plan = model.split(player.id, primary, secondary.id, assignments, [player.id, npc.id]);
        if (!plan) return { line: 'We need two valid targets before we can talk about a split.' };
        const outcomes = [];
        for (const id of listeners) {
          const assigned = plan.assignments[id]; if (!assigned) continue;
          const statement = model.statement({ id: `${prefix}:split_vote:${secondary.id}:${id}`, speakerId: player.id,
            listenerIds: [id], subjectId: assigned, topic: 'split_assignment', stance: 'yes', random });
          const outcome = model.adoption(id, player.id, assigned, { belief: statement?.belief[String(id)], random });
          if (outcome === 'commit') model.acceptSplit(id); outcomes.push(outcome);
        }
        return { line: outcomes.every(x => x === 'commit') ? 'We have assignments. Keep checking that everyone stays with it.' : 'Some of us are open to that. Don’t count it as settled yet.', outcomes };
      }));
  }
  if(topic==='idol')return idol;
  if(topic==='confront')return nodes.filter(n=>/bluff_warning|confront:|verify:/.test(n.id));
  if(topic==='gossip')return [nodes[0],node('close_with','Who are you close with?','Who do you feel good with?',()=>{
    const friend=model.members.filter(p=>!same(p.id,npc.id)&&!same(p.id,player.id)).sort((a,b)=>(model.gm.getTrust?.(npc.id,b.id)??50)-(model.gm.getTrust?.(npc.id,a.id)??50))[0];
    return {line:friend&&(model.gm.getTrust?.(npc.id,friend.id)??50)>55?`I feel good with ${friend.firstName}. That’s my relationship; I can’t tell you their vote.`:'I’m still building relationships. I’m not sure who I can count on.'};
  }),node('known_pair','Who’s working together?','Who do you think is together?',random=>{
    const pair=model.knownPair(npc.id);if(!pair)return {line:'I don’t have much to go on.'};
    const ids=pair.ids.filter(id=>!same(id,npc.id));if(ids.length<2)return {line:'I’ve only seen a few conversations. I’m not sure.'};
    npcSay('known_pair',ids[0],{topic:'social_pair',stance:'possible',mode:'inference'},random);return {line:`I’ve seen ${ids.map(name).join(' and ')} together. That doesn’t mean I know their plan.`};
  }),...['threat','asset','dead_weight','suspicious'].map(opinion=>node(`opinion:${opinion}`,`Who seems ${opinion.replace('_',' ')}?`,'What’s your personal read?',()=>{
    const candidates=model.members.filter(p=>!same(p.id,npc.id)&&!same(p.id,player.id));
    const score=p=>{
      const trust=model.gm.getTrust?.(npc.id,p.id)??50;
      const impressions=model.memory.memory[String(npc.id)]?.campImpressions?.[String(p.id)]||{};
      if(opinion==='threat')return p.threat??0;
      if(opinion==='asset')return trust+(impressions.work?.count||0)*4;
      return 100-trust+(impressions.role_neglect?.count||0)*4+(opinion==='suspicious'?(impressions.absence?.count||0)*3:0);
    };
    const person=candidates.sort((a,b)=>score(b)-score(a))[0];
    return {line:person?`My personal read is ${person.firstName}. That’s an opinion, not a vote count.`:'I’m still figuring people out.'};
  }))];
  return nodes;
}
export function resolveScrambleNode(model,node,npcId) {
  const reservation=model.gm.systems.campActivitySystem.conversation;
  if(!reservation||!same(reservation.npcId,npcId))return null;
  const result=model.choice(node.id,random=>node.semanticResolve(random));
  if(result&&!result.replay)model.checkpoint(reservation).lastLine=result.line;return result;
}
