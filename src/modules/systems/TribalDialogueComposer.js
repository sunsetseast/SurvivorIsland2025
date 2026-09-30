const first = member => String(member?.firstName || member?.name || 'Someone').trim().split(/\s+/)[0];
const choose = (items, seed) => items[Math.abs([...String(seed)].reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) | 0, 7)) % items.length];

/** A line is generated once for the question plan, never during a DOM render. */
export function composeNpcAnswer({ speaker, topic, mood, knowledge, strategy, members = [], day = 0 }) {
  const style = String(speaker?.gameplayStyle || '').toLowerCase();
  const honesty = Number(speaker?.honesty ?? speaker?.traits?.honesty ?? 5);
  const deception = Number(speaker?.deception ?? speaker?.traits?.deception ?? 5);
  const intent = strategy?.getNpcTargetIntent?.(speaker?.id);
  const guarded = deception > honesty || style.includes('shadow') || style.includes('charmer');
  const danger = knowledge?.perceivedDanger(speaker) ?? 0;
  const personalFacts = knowledge?.factsFor(speaker?.id) || [];
  const hasAllies = Boolean(knowledge?.getKnownAllies(speaker?.id)?.length);
  const hasPromise = personalFacts.some(fact => ['rememberedPromise', 'deal'].includes(fact.type));
  const hasBetrayal = personalFacts.some(fact => fact.type === 'rememberedBetrayal' ||
    fact.type === 'campObservation' && fact.details?.topic === 'betrayal');
  const discoveredLie = personalFacts.some(fact => fact.type === 'discoveredLie' ||
    fact.type === 'campObservation' && fact.details?.topic === 'confirmed_lie' && fact.confidence >= .7);
  const seed = `${day}:${speaker?.id}:${topic}`;
  const known = personalFacts.find(fact => fact.subjectId
    && fact.subjectId !== String(speaker?.id) && ['NAME_MENTION', 'targetProposed', 'rumor', 'previousElimination'].includes(fact.type));
  const named = members.find(member => String(member.id) === known?.subjectId);
  const framing = style.includes('power') || Number(speaker?.aggression) >= 7
    ? ['We have to own the vote we make.', 'If someone wants to make a move, they should say it.',
      'I would rather be direct than spend the night guessing.', 'Sooner or later, somebody has to make a choice.']
    : style.includes('social') || Number(speaker?.social) >= 7
      ? ['Relationships brought us here, but one of us still leaves.', 'I care about these people. That makes tonight harder.',
        'The hard part is looking somebody in the eye afterward.', 'A conversation can matter more than a promise.']
      : ['Every conversation changes what you think you know.', 'You can plan all day and still be surprised tonight.',
        'The numbers on paper never tell you how people feel.', 'I am trying to understand where everyone stands.'];
  const stance = danger >= .52
    ? ['I have heard enough to know I should listen carefully.', 'I am keeping my eyes open tonight.',
      'People have been careful with their words around me.', 'I do not think tonight is as simple as it looks.']
    : guarded && intent?.targetId
      ? ['I feel good about the conversations I had.', 'I think the group knows what it needs to do.',
        'I am listening more than I am talking.', 'I have not settled on a name.']
      : mood === 'confident'
        ? ['I know who has stood with me.', 'I have tried to be clear with people.',
          'I have put my trust in a few people here.', 'I feel settled about the choice I made.']
        : ['I can only speak for the conversations I was part of.', 'I do not want to pretend I know every vote.',
          'There are pieces of tonight I still cannot see.', 'I have heard people say different things.'];
  const topical = {
    idol_paranoia: ['An idol can change everything, even when nobody knows where it is.',
      'You have to leave room for a surprise at the urn.'],
    tribal_history: ['I remember how the last council ended.', 'Last time taught me to listen closely.'],
    alliance_cracks: ['Loyalty has to survive a hard vote.', 'A promise means more when it costs you something.'],
    big_threat: ['Winning together and living together are different things.',
      'Strength can make you valuable and vulnerable.']
  };
  const campBelief = personalFacts.filter(fact => fact.type === 'campClaim' &&
    fact.details?.topic === 'idol_suspicion' && !fact.details?.challenged && fact.confidence >= .2 &&
    !['unlikely', 'denied', 'no'].includes(fact.details?.stance))
    .sort((a, b) => b.confidence - a.confidence)[0];
  if (topic === 'idol_paranoia' && campBelief) topical.idol_paranoia =
    campBelief.details.provenance === 'firsthand'
      ? ['I have seen someone searching. That does not tell me what they found.']
      : ['I have heard talk about someone searching. Talk is not proof of an idol.'];
  if (topic === 'alliance_cracks' && (hasAllies || hasPromise)) topical.alliance_cracks = guarded
    ? ['I have heard promises, but tonight is when they have to mean something.',
      'People know what they said to me. I am listening to what they say now.']
    : ['I have people I trust. I still have to make my own decision.',
      'Commitments matter to me, especially when this gets uncomfortable.'];
  if (topic === 'tribal_history' && (hasBetrayal || discoveredLie)) topical.tribal_history = [
    'Trust gets harder after somebody lets you down.',
    'I remember what was said to me. Tonight tells me what it was worth.'
  ];
  const reference = named ? ` What ${first(named)} said has stayed with me.` : '';
  const opening = topical[topic] ? choose(topical[topic], seed) : choose(framing, seed);
  const line = `${opening} ${choose(stance, `${seed}:stance`)}${reference}`;
  return { text: `${first(speaker)}: “${line}”`, disclosure: guarded ? 'GUARDED' : 'OPEN',
    lied: guarded && Boolean(intent?.targetId) && Number(intent.confidence) >= .7
      && line.includes('I have not settled on a name.') };
}
