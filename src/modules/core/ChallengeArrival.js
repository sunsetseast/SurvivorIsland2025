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
  const beats = [{ title: 'Challenge beach', text: 'Jeff waits at the challenge course. The tribes are on their way.', label: 'JEFF', action: 'Bring them in' }];
  if (previous) {
    const safe = arrivals.slice(0, -1);
    beats.push({ title: 'The tribes arrive', text: `${safe.map(tribe => tribe.name).join(' and ')} — come on in!`, label: 'JEFF', tribes: safe, action: 'Next' });
    beats.push({ title: 'Returning from Tribal', text: `${previous.tribeName}, come on in.`, label: 'JEFF', tribes: arrivals.slice(-1), action: 'First look' });
    beats.push({ title: 'Getting your first look', text: `${safe.map(tribe => tribe.name).join(' and ')}, getting your first look at the new ${previous.tribeName}.`, label: 'JEFF', reveal: previous, action: 'Continue' });
  } else {
    beats.push({ title: 'The tribes arrive', text: 'Come on in, guys!', label: 'JEFF', tribes: arrivals, action: 'Continue' });
  }
  beats.push(
    { title: 'Today’s challenge', text: 'Ready to get to today’s immunity challenge?', label: 'JEFF', action: 'Hear the rules' },
    { title: 'Last Flag', text: 'Twenty-one flags. The tribes alternate. One contestant at a time, rotating through your lineup. Take one, two, or three flags on your turn. Take the last flag to win.', label: 'JEFF', action: 'The stakes' },
    { title: 'Immunity is on the line', text: activeTribes.length === 3
      ? 'Two tribes will be safe tonight. One tribe loses and goes to Tribal Council, where somebody will be voted out.'
      : 'The winning tribe is safe tonight. Losers, Tribal Council, where somebody will be voted out.', label: 'JEFF', action: 'Take your spots' },
    { title: 'Take your spots', text: 'Alright. Take your spots. Here we go.', label: 'JEFF', action: 'Start Last Flag' }
  );
  return { arrivals, previous, beats };
}

export default buildChallengeArrival;
