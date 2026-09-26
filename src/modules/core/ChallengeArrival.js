const keyOf = tribe => tribe?.tribeId ?? tribe?.id;
const nameOf = tribe => tribe?.tribeName || tribe?.name || 'Tribe';

// Round history includes both visible votes and off-screen NPC Tribal outcomes.
// Match the exact previous day so an interrupted round never reveals stale news.
export function buildChallengeArrival({ day, tribes = [], survivors = [], seasonHistory = [], tribalHistory = [] }) {
  const activeTribes = tribes.filter(tribe => (tribe?.members || []).some(member => !member.isOut));
  const previousDay = Number(day) - 1;
  const round = [...seasonHistory].reverse().find(entry => (
    entry?.type === 'roundComplete' && Number(entry.day) === previousDay && entry.eliminatedId != null
  ));
  const visibleTribal = [...tribalHistory].reverse().find(entry => (
    Number(entry?.day) === previousDay && entry.eliminatedId != null
  ));
  const recordedTribal = [...seasonHistory].reverse().find(entry => (
    entry?.type === 'tribal' && Number(entry.day) === previousDay && entry.eliminatedId != null
  ));
  const record = round || recordedTribal || visibleTribal || null;
  const losingKey = record?.unsafeTribe ?? record?.attendingTribeId;
  const returning = activeTribes.find(tribe => String(keyOf(tribe)) === String(losingKey));
  const eliminated = survivors.find(member => String(member.id) === String(record?.eliminatedId));
  const named = eliminated?.name || visibleTribal?.eliminatedName;
  const previous = returning && named ? {
    tribeKey: keyOf(returning),
    tribeName: nameOf(returning),
    tribeColor: returning.tribeColor || returning.color || '#f4ca78',
    eliminatedId: record.eliminatedId,
    eliminatedName: named,
    eliminatedPortrait: eliminated?.avatarUrl || eliminated?.portraitUrl || null,
    mode: record.tribalMode || (record.eliminationType === 'off-screen-npc-tribal' ? 'offscreen' : 'visible')
  } : null;
  const ordered = previous
    ? [...activeTribes.filter(tribe => tribe !== returning), returning]
    : activeTribes;
  const arrival = tribe => ({
    key: keyOf(tribe), name: nameOf(tribe), color: tribe.tribeColor || tribe.color || '#f4ca78',
    members: (tribe.members || []).filter(member => !member.isOut).map(member => ({
      id: member.id, name: member.firstName || member.name || 'Survivor',
      portrait: member.avatarUrl || member.portraitUrl || null
    }))
  });
  const arrivals = ordered.map(arrival);
  const beats = [{ title: 'Challenge beach', text: 'Jeff is waiting at the challenge site. Come on in!', label: 'JEFF', action: 'Bring them in' }];
  if (previous) {
    const safe = arrivals.slice(0, -1);
    beats.push({ title: 'The tribes arrive', text: `${safe.map(tribe => tribe.name).join(' and ')} — come on in!`, label: 'JEFF', tribes: safe, action: 'Next' });
    beats.push({ title: 'Returning from Tribal', text: `${previous.tribeName}, come on in.`, label: 'JEFF', tribes: arrivals.slice(-1), action: 'First look' });
    beats.push({ title: 'Getting your first look', text: `${safe.map(tribe => tribe.name).join(' and ')}, getting your first look at the new ${previous.tribeName}.`, label: 'JEFF', reveal: previous, action: 'Continue' });
  } else {
    beats.push({ title: 'The tribes arrive', text: 'Come on in, guys!', label: 'JEFF', tribes: arrivals, action: 'Continue' });
  }
  beats.push(
    { title: 'Today’s challenge', text: 'Ready to get to today’s immunity challenge?', label: 'JEFF', action: 'The stakes' },
    { title: 'Immunity is on the line', text: activeTribes.length === 3
      ? 'Two tribes will earn immunity. The one left without it goes to Tribal Council tonight.'
      : 'One tribe wins immunity. The other goes to Tribal Council tonight.', label: 'JEFF', action: 'Hear the rules' },
    { title: 'The rules', text: activeTribes.length === 3
      ? 'Twenty-one flags. All three tribes rotate turns, one contestant at a time. Take one, two, or three. The tribe taking the final flag wins immunity and steps out. The other two start again with twenty-one flags for the second immunity.'
      : 'Twenty-one flags. Tribes alternate turns, rotating contestants through their lineups. Take one, two, or three. The tribe taking the final flag wins immunity.', label: 'JEFF', action: 'Continue' }
  );
  if (Math.max(...activeTribes.map(tribe => (tribe.members || []).filter(member => !member.isOut).length))
    > Math.min(...activeTribes.map(tribe => (tribe.members || []).filter(member => !member.isOut).length))) {
    beats.push({ title: 'Sitting out', text: 'Uneven numbers. We’ll match the smallest tribe’s lineup. Extra players, you’re sitting somebody out of Last Flag.', label: 'JEFF', sitOut: true, action: 'Continue' });
  }
  beats.push(
    { title: 'LAST FLAG', text: 'The last flag wins immunity.', label: 'JEFF', titleCard: true, action: 'Take your spots' },
    { title: 'Survivors Ready?', text: 'These are your lineups. Stay sharp. Survivors ready? Go!', label: 'JEFF', lineup: true, action: 'Start Last Flag' }
  );
  return { arrivals, previous, beats };
}

export default buildChallengeArrival;
