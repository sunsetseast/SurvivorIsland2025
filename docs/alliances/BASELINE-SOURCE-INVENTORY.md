# Baseline source inventory

Baseline: `364fdeaa6d17f20dc3e301b648c0e1023e621302` (merged #350).

Generated from production JavaScript/HTML/CSS, not the modified branch. Broad alliance dialogue inventory is restricted to ConversationSystem and DealSystem to remain reviewable. The audit explains which matches are active or compatibility paths.

## areAllied

```text
src/modules/screens/camp/AlliancesOverlay.js:34:  if (typeof allianceSystem.areAllied === 'function') {
src/modules/screens/camp/AlliancesOverlay.js:35:    return allianceSystem.areAllied(playerId, memberId);
src/modules/systems/CampActivitySystem.js:102:        (this.gm.systems?.allianceSystem?.areAllied?.(npc.id, s.id) ? 25 : 0) +
src/modules/systems/CampActivitySystem.js:259:      const ally = this.npcs().find(s => !same(s.id, npc.id) && this.gm.systems?.allianceSystem?.areAllied?.(npc.id, s.id));
src/modules/systems/SocialEngine.js:246:        const alliedWithPlayer = allianceSystem?.areAllied?.(player.id, npc.id) ?? false;
src/modules/systems/AllianceSystem.js:309:  areAllied(id1, id2) {
src/modules/systems/CampSocialResolution.js:17:  const allied = gm.systems?.allianceSystem?.areAllied?.(speaker.id, listener.id) || false;
src/modules/systems/ConversationSystem.js:6577:        if (this.gameManager.systems?.allianceSystem?.areAllied?.(this.gameManager.getPlayerSurvivor?.()?.id, npc?.id)) {
src/modules/systems/ConversationSystem.js:11524:    const alreadyAllied = allianceSystem?.areAllied?.(playerId, survivor.id);
src/modules/systems/ConversationSystem.js:11813:    const alreadyAllied = allianceSystem?.areAllied?.(player?.id, survivor.id);
src/modules/systems/ConversationSystem.js:15734:      if (allianceSystem?.areAllied?.(player?.id, survivor.id)) score += 6;
src/modules/systems/ConversationSystem.js:15999:    const allied = allianceSystem?.areAllied?.(player?.id, npc?.id) || false;
```

## getCommittedAllianceId

```text
src/modules/screens/camp/AlliancesOverlay.js:108:  const committedId = player ? allianceSystem?.getCommittedAllianceId?.(player.id) : null;
src/modules/screens/camp/ManageAllianceOverlay.js:41:  const committedId = allianceSystem?.getCommittedAllianceId?.(player?.id) ?? null;
src/modules/screens/camp/ManageAllianceOverlay.js:155:      const committedId = allianceSystem.getCommittedAllianceId?.(player.id);
src/modules/systems/SocialEngine.js:238:        const committedAllianceId = memorySystem?.getCommittedAllianceId?.(npc.id) || null;
src/modules/systems/SocialEngine.js:244:        if (committedAllianceId) reasons.push("committed alliance plan");
src/modules/systems/SocialEngine.js:312:        if (committedAllianceId && phase === "post") {
src/modules/systems/AllianceSystem.js:194:      if (this.getCommittedAllianceId(memberId) === allianceId) {
src/modules/systems/AllianceSystem.js:241:    if (this.getCommittedAllianceId(survivorId) === allianceId) {
src/modules/systems/AllianceSystem.js:401:  getCommittedAllianceId(survivorId) {
src/modules/systems/AllianceSystem.js:403:    const memoryValue = this.socialMemorySystem?.getCommittedAllianceId?.(survivorId);
src/modules/systems/SocialMemorySystem.js:63:                committedAllianceId: null,
src/modules/systems/SocialMemorySystem.js:631:    getCommittedAllianceId(npcId) {
src/modules/systems/SocialMemorySystem.js:633:        return this.memory[npcId].committedAllianceId ?? null;
src/modules/systems/SocialMemorySystem.js:638:        this.memory[npcId].committedAllianceId = allianceIdOrNull || null;
src/modules/systems/ConversationSystem.js:11471:    const committedAllianceId = allianceSystem?.getCommittedAllianceId?.(npc?.id);
src/modules/systems/ConversationSystem.js:11472:    if (committedAllianceId) {
src/modules/systems/ConversationSystem.js:11473:      const committedAlliance = allianceSystem?.getAlliance?.(committedAllianceId);
```

## cohesion

```text
src/modules/screens/camp/ManageAllianceOverlay.js:81:    const strengthValue = alliance.strength ?? alliance.cohesion;
src/modules/systems/ConversationSystem.js:4926:          const best = sharedAlliances.sort((a, b) => (b.cohesion ?? 50) - (a.cohesion ?? 50))[0];
src/modules/systems/AllianceSystem.js:92:      cohesion: 50,
src/modules/systems/AllianceSystem.js:98:    normalized.cohesion = this.computeCohesion(normalized);
src/modules/systems/AllianceSystem.js:212:      alliance.cohesion = this.computeCohesion(alliance);
src/modules/systems/AllianceSystem.js:237:      alliance.cohesion = this.computeCohesion(alliance);
src/modules/systems/AllianceSystem.js:280:        if (Number.isFinite(alliance.cohesion)) restored.cohesion = Math.max(0, Math.min(100, alliance.cohesion));
src/modules/systems/AllianceSystem.js:369:        if (a.cohesion !== b.cohesion) return b.cohesion - a.cohesion;
src/modules/systems/AllianceSystem.js:381:      if (!best || best.cohesion < 30) {
src/modules/systems/AllianceSystem.js:515:      if (!Number.isFinite(alliance.cohesion)) {
src/modules/systems/AllianceSystem.js:516:        alliance.cohesion = this.computeCohesion(alliance);
src/modules/systems/AllianceSystem.js:522:      let cohesionPenalty = 0;
src/modules/systems/AllianceSystem.js:526:          cohesionPenalty += 3;
src/modules/systems/AllianceSystem.js:538:            cohesionPenalty += 1;
src/modules/systems/AllianceSystem.js:543:      if (cohesionPenalty <= 0) return;
src/modules/systems/AllianceSystem.js:545:      alliance.cohesion = Math.max(0, Math.min(100, alliance.cohesion - cohesionPenalty));
src/modules/systems/AllianceSystem.js:547:        ? `${alliance.notes} | post_tribal_fallout:-${cohesionPenalty}`
src/modules/systems/AllianceSystem.js:548:        : `post_tribal_fallout:-${cohesionPenalty}`;
src/modules/systems/AllianceSystem.js:550:      this._publish(GameEvents.ALLIANCE_UPDATED, { alliance, cohesionPenalty, tribalDay: tribalSummary.day });
src/modules/core/GameManager.js:210:    // cohesion. Retrying that completion must resume after completed side effects.
```

## sincerityMap

```text
src/modules/systems/AllianceSystem.js:78:    const sincerityMap = { ...(alliance.sincerityMap || {}) };
src/modules/systems/AllianceSystem.js:80:      sincerityMap[id] = this._normalizeSincerity(sincerityMap[id]);
src/modules/systems/AllianceSystem.js:93:      sincerityMap,
src/modules/systems/AllianceSystem.js:147:    sincerityMap = {},
src/modules/systems/AllianceSystem.js:161:      resolvedSincerityMap[id] = this._normalizeSincerity(sincerityMap?.[id]);
src/modules/systems/AllianceSystem.js:173:      sincerityMap: resolvedSincerityMap,
src/modules/systems/AllianceSystem.js:211:      alliance.sincerityMap[survivorId] = this._normalizeSincerity(sincerity);
src/modules/systems/AllianceSystem.js:228:    delete alliance.sincerityMap[survivorId];
src/modules/systems/AllianceSystem.js:365:        const aReal = a.sincerityMap?.[survivor.id] === 'real' ? 1 : 0;
src/modules/systems/AllianceSystem.js:366:        const bReal = b.sincerityMap?.[survivor.id] === 'real' ? 1 : 0;
src/modules/systems/ConversationSystem.js:2952:      sincerityMap: uniqueMemberIds.reduce((acc, id) => {
src/modules/systems/ConversationSystem.js:4840:          const sincerityMap = {
src/modules/systems/ConversationSystem.js:4852:            sincerityMap
src/modules/systems/ConversationSystem.js:4855:          if (createdAlliance && allianceType !== 'voting_bloc' && sincerityMap[npc.id] === 'real') {
src/modules/systems/ConversationSystem.js:11558:    const createAlliance = ({ memberIds = [], type = 'core', sincerityMap = null, targetId = null } = {}) => {
src/modules/systems/ConversationSystem.js:11568:        sincerityMap,
src/modules/systems/ConversationSystem.js:11648:        sincerityMap: {
src/modules/systems/ConversationSystem.js:11673:        sincerityMap: {
src/modules/systems/ConversationSystem.js:11724:            sincerityMap: {
src/modules/systems/ConversationSystem.js:11752:                  sincerityMap: {
```

## leaderId

```text
src/modules/screens/camp/CreateAllianceOverlay.js:105:      leaderId: player.id,
src/modules/views/ShelterView.js:22:  const leaderId = tribe?.day1Plan?.leaderId != null ? String(tribe.day1Plan.leaderId) : null;
src/modules/views/ShelterView.js:24:    leaderId === pid ||
src/modules/events/Day1CampAssignmentResolver.js:44:function roleScore(profile, roleKey, { leaderId = null, currentRoleProfiles = [] } = {}) {
src/modules/events/Day1CampAssignmentResolver.js:50:  if (roleKey === 'shelter' && normalizeId(profile.id) === normalizeId(leaderId)) score += 10;
src/modules/events/Day1CampAssignmentResolver.js:89:function fillRole({ assignments, unassigned, roleKey, target, config, leaderId }) {
src/modules/events/Day1CampAssignmentResolver.js:92:    const candidate = sortCandidates(unassigned, roleKey, { leaderId, currentRoleProfiles })[0];
src/modules/events/Day1CampAssignmentResolver.js:127:export function resolveDay1Assignments({ members = [], playerId = null, requestedRole = null, scan = null, leaderId = null } = {}) {
src/modules/events/Day1CampAssignmentResolver.js:143:    fillRole({ assignments, unassigned, roleKey, target: config.required[roleKey], config, leaderId });
src/modules/events/Day1CampAssignmentResolver.js:146:    fillRole({ assignments, unassigned, roleKey, target: config.preferred[roleKey], config, leaderId });
src/modules/events/Day1CampAssignmentResolver.js:152:      .sort((a, b) => roleScore(profile, b, { leaderId, currentRoleProfiles: assignments[b] }) - roleScore(profile, a, { leaderId, currentRoleProfiles: assignments[a] }))[0]
src/modules/events/Day1CampAssignmentResolver.js:166:export function buildSuggestedDay1Assignments({ members = [], playerId = null, scan = null, leaderId = null } = {}) {
src/modules/events/Day1CampAssignmentResolver.js:167:  const automatic = resolveDay1Assignments({ members, playerId, scan, leaderId });
src/modules/events/Day1CampAssignmentResolver.js:171:export function rebalanceDay1Assignments({ members = [], playerId = null, roleKey, scan = null, leaderId = null } = {}) {
src/modules/events/Day1CampAssignmentResolver.js:172:  return resolveDay1Assignments({ members, playerId, requestedRole: roleKey, scan, leaderId });
src/modules/events/Day1CampAssignmentResolver.js:178:    leaderId: leadership?.topLeader?.id ?? leadership?.operationalLeader?.id ?? null,
src/modules/events/Day1CampMemory.js:348:      leaderId: canonicalMemory.operationalLeaderId,
src/modules/events/Day1FirstImpressionsEvent.js:209:    leaderId: leadership.operationalLeader?.id
src/modules/events/Day1FirstImpressionsEvent.js:279:      leaderId: leadership.operationalLeader?.id
src/modules/systems/AllianceSystem.js:90:      leaderId: alliance.leaderId ?? memberIds[0] ?? null,
src/modules/systems/AllianceSystem.js:145:    leaderId = null,
src/modules/systems/AllianceSystem.js:171:      leaderId: leaderId ?? normalizedMembers[0] ?? null,
src/modules/systems/AllianceSystem.js:371:        const aLeader = a.leaderId === survivor.id ? 1 : 0;
src/modules/systems/AllianceSystem.js:372:        const bLeader = b.leaderId === survivor.id ? 1 : 0;
src/modules/systems/ConversationSystem.js:2949:      leaderId: npc.id,
src/modules/systems/ConversationSystem.js:4850:            leaderId: player.id,
src/modules/systems/ConversationSystem.js:11566:        leaderId: survivor.id,
```

## alliance targets

```text
src/modules/systems/ScrambleActivityPlan.js:142:      if (result.targetId) this.strategy.allianceTargets.set(meeting.allianceId, result.targetId);
src/modules/systems/StrategyPhaseSystem.js:60:    this.allianceTargets = new Map();
src/modules/systems/StrategyPhaseSystem.js:91:      allianceTargets: Array.from(this.allianceTargets.entries()),
src/modules/systems/StrategyPhaseSystem.js:120:    this.allianceTargets = new Map(Array.isArray(payload.allianceTargets) ? payload.allianceTargets : []);
src/modules/systems/StrategyPhaseSystem.js:355:        const resolveCurrentTargetId = () => this.allianceTargets.get(allianceKey);
src/modules/systems/StrategyPhaseSystem.js:369:          this.logFact({ type: 'allianceTargetConfirmed', allianceId: allianceKey, targetId: target?.id || null });
src/modules/systems/StrategyPhaseSystem.js:385:              this.allianceTargets.set(allianceKey, selected);
src/modules/systems/StrategyPhaseSystem.js:386:              this.logFact({ type: 'allianceTarget', allianceId: allianceKey, targetId: selected });
src/modules/systems/StrategyPhaseSystem.js:559:      increment(this.allianceTargets.get(allianceId));
src/modules/systems/StrategyPhaseSystem.js:937:    const detail = [fact.action, fact.targetId, fact.allianceId].filter(Boolean).join(' | ');
src/modules/systems/AllianceSystem.js:94:      targetId: alliance.targetId ?? null,
src/modules/systems/AllianceSystem.js:525:        if (alliance.memberIds.some(id => sameSurvivorId(id, vote.targetId))) {
src/modules/systems/SocialEngine.js:252:        const allianceTarget = alliances.find(entry => entry?.targetId)?.targetId || null;
src/modules/systems/SocialEngine.js:253:        const votingBlocTarget = alliances.find(entry => entry?.type === "votingBloc" && entry?.targetId)?.targetId || null;
src/modules/systems/SocialEngine.js:255:        let targetId = votingBlocTarget || allianceTarget || null;
src/modules/systems/SocialEngine.js:257:            reasons.push(`alliance target ${this._resolveName(targetId) || targetId}`);
src/modules/systems/ConversationSystem.js:4830:          this._scrambleModel().commit({ id: `${cp.activityId}:deal_promise:npc`, speakerId: npc.id, listenerIds: [player.id], targetId: target.id, lie: allianceOutcome?.sincerity === 'fake' });
src/modules/systems/ConversationSystem.js:15503:    if (top.type === 'alliance' && targetId) {
```

## alliance dialogue and deals

```text
src/modules/systems/DealSystem.js:8:  IDOL_PROTECTION: 'IDOL_PROTECTION',
src/modules/systems/DealSystem.js:9:  FINAL_TWO: 'FINAL_TWO',
src/modules/systems/DealSystem.js:10:  SHARE_INFO: 'SHARE_INFO',
src/modules/systems/DealSystem.js:394:      if (deal.type === DealTypes.FINAL_TWO || deal.type === 'FINAL_THREE') {
src/modules/systems/ConversationSystem.js:58:    { topicId: 'strategy', nodeId: 'alliances' },
src/modules/systems/ConversationSystem.js:103:  alliance_commitment: 'alliance_commitment',
src/modules/systems/ConversationSystem.js:205:      return 'allianceInterest';
src/modules/systems/ConversationSystem.js:311:      window.ConversationDebug.testAlliancePitch = () => this._debugStartNpcApproach({ intentType: 'alliance_pitch' });
src/modules/systems/ConversationSystem.js:325:      allianceSystem: this.gameManager?.systems?.allianceSystem || null,
src/modules/systems/ConversationSystem.js:1918:    const { trustSystem, relationshipSystem, allianceSystem, dealSystem } = this._getConversationSystems();
src/modules/systems/ConversationSystem.js:1935:    const sharedAlliances = allianceSystem?.getAlliancesForSurvivor?.(player?.id) || [];
src/modules/systems/ConversationSystem.js:1936:    const hasSharedAlliance = sharedAlliances.some(alliance => alliance.memberIds?.includes?.(npc?.id));
src/modules/systems/ConversationSystem.js:2372:    const alliancePlan = type === 'alliance_pitch'
src/modules/systems/ConversationSystem.js:2384:      alliancePlan,
src/modules/systems/ConversationSystem.js:2397:      alliancePlan,
src/modules/systems/ConversationSystem.js:2401:      responseOptions: this._buildNpcIntentResponses({ type, target, alliancePlan, infoNeed })
src/modules/systems/ConversationSystem.js:2419:      alliance_pitch: trust >= 55 ? 3 : 1
src/modules/systems/ConversationSystem.js:2428:    if (purposeId === NPC_APPROACH_PURPOSES.OFFER_DEAL) weights.alliance_pitch += 4;
src/modules/systems/ConversationSystem.js:2433:    if (style.includes('social') || style.includes('charmer')) weights.alliance_pitch += 2;
src/modules/systems/ConversationSystem.js:2459:      alliance: 'alliance_pitch',
src/modules/systems/ConversationSystem.js:2460:      alliance_pitch: 'alliance_pitch',
src/modules/systems/ConversationSystem.js:2461:      deal: 'alliance_pitch',
src/modules/systems/ConversationSystem.js:2484:      alliance_pitch: 'strategy',
src/modules/systems/ConversationSystem.js:2543:      else if (type === 'alliance_pitch') score = rel + trust + teamPlayer * 0.25 - suspicion * 0.2;
src/modules/systems/ConversationSystem.js:2576:    if (type === 'alliance_pitch') reasonBits.push('they want something stable');
src/modules/systems/ConversationSystem.js:2583:    const allianceSystem = this.gameManager.systems?.allianceSystem;
src/modules/systems/ConversationSystem.js:2584:    const shared = allianceSystem?.getSharedAlliances?.(npc?.id, player?.id) || [];
src/modules/systems/ConversationSystem.js:2594:    const third = this._chooseNpcIntentTarget({ npc, player, type: 'alliance_pitch', context });
src/modules/systems/ConversationSystem.js:2609:      { key: 'alliance_read', label: target ? `who ${target.firstName} is close with` : 'who is working together' },
src/modules/systems/ConversationSystem.js:2620:  _buildNpcIntentOpeningLine({ npc, type, target, reason, alliancePlan, infoNeed }) {
src/modules/systems/ConversationSystem.js:2631:    if (type === 'alliance_pitch') {
src/modules/systems/ConversationSystem.js:2632:      const names = alliancePlan?.memberNames?.filter(Boolean).join(', ') || `you and ${npc.firstName}`;
src/modules/systems/ConversationSystem.js:2633:      if (alliancePlan?.mode === 'recommit') return 'I want to make sure our alliance is still real. I need us steady.';
src/modules/systems/ConversationSystem.js:2642:  _buildNpcIntentResponses({ type, target, alliancePlan, infoNeed }) {
src/modules/systems/ConversationSystem.js:2668:    if (type === 'alliance_pitch') {
src/modules/systems/ConversationSystem.js:2669:      const group = alliancePlan?.memberNames?.filter(Boolean).join(', ') || 'that';
src/modules/systems/ConversationSystem.js:2671:        { key: 'accept_alliance', label: 'Accept', playerLine: `${group} works for me. I’m in.` },
src/modules/systems/ConversationSystem.js:2756:    if (type === 'alliance_pitch') {
src/modules/systems/ConversationSystem.js:2757:      if (option.key === 'accept_alliance') return { npcLine: 'Good. Quiet and real. We don’t need everyone knowing.', trust: 4, relationship: 3, status: 'accepted' };
src/modules/systems/ConversationSystem.js:2775:    const agreeOption = intent.responseOptions?.find(option => ['agree', 'thank', 'accept_alliance', 'share_truth', 'agree_concern', 'warm'].includes(option.key));
src/modules/systems/ConversationSystem.js:2876:    const accepted = ['agree', 'thank', 'accept_alliance', 'share_truth', 'agree_concern', 'warm'].includes(option.key);
src/modules/systems/ConversationSystem.js:2893:    if (intent.type === 'alliance_pitch') {
src/modules/systems/ConversationSystem.js:2918:        alliancePlan: intent.alliancePlan || null,
src/modules/systems/ConversationSystem.js:2927:    const allianceSystem = this.gameManager.systems?.allianceSystem;
src/modules/systems/ConversationSystem.js:2928:    const accepted = option.key === 'accept_alliance';
src/modules/systems/ConversationSystem.js:2935:      pickedThirdId: intent.alliancePlan?.memberIds?.find(id => String(id) !== String(npc.id) && String(id) !== String(player.id)) || null,
src/modules/systems/ConversationSystem.js:2939:      pitchType: intent.alliancePlan?.mode || 'npc_pitch',
src/modules/systems/ConversationSystem.js:2942:    if (!accepted || !allianceSystem?.createAlliance || intent.alliancePlan?.mode === 'recommit') return;
src/modules/systems/ConversationSystem.js:2943:    const memberIds = (intent.alliancePlan?.memberIds || [npc.id, player.id]).filter(Boolean);
src/modules/systems/ConversationSystem.js:2945:    allianceSystem.createAlliance({
src/modules/systems/ConversationSystem.js:3063:      'alliance_suspect',
src/modules/systems/ConversationSystem.js:3718:              type: 'alliance_suspect',
src/modules/systems/ConversationSystem.js:3728:              type: 'alliance_suspect',
src/modules/systems/ConversationSystem.js:4082:    const allianceSystem = this.gameManager.systems?.allianceSystem;
src/modules/systems/ConversationSystem.js:4083:    const sharedAlliances = allianceSystem?.getAlliancesForSurvivor?.(player.id) || [];
src/modules/systems/ConversationSystem.js:4084:    const shared = sharedAlliances.filter(alliance => alliance.memberIds?.includes?.(npc.id));
src/modules/systems/ConversationSystem.js:4178:        id: 'alliances',
src/modules/systems/ConversationSystem.js:4181:        tooltip: shared.length === 0 ? 'No shared alliance' : '',
src/modules/systems/ConversationSystem.js:4182:        playerLine: 'Let’s talk alliance.',
src/modules/systems/ConversationSystem.js:4184:          DEFAULT: [() => shared.length ? 'Which piece do you want to tighten up?' : 'We don’t share an alliance yet.']
src/modules/systems/ConversationSystem.js:4188:            this._renderMenu(npc, this._fmtNarration('No shared alliance yet.'), [], { onBack: () => this._renderSubMenu({ player, npc, context, topic: { id: 'strategy', nodes: this._buildStrategyNodes({ player, npc, context }) } }), showEnd: true });
src/modules/systems/ConversationSystem.js:4195:    return this._scrambleModel() ? [...scrambleNodes(this._scrambleModel(), { player, npc, context }), ...legacy.filter(n => ['offer_deal','alliances'].includes(n.id))] : legacy;
src/modules/systems/ConversationSystem.js:4674:      { id: 'core_alliance', label: 'Offer alliance' },
src/modules/systems/ConversationSystem.js:4773:    const allianceSystem = this.gameManager?.systems?.allianceSystem;
src/modules/systems/ConversationSystem.js:4786:      core_alliance: DealTypes.MUTUAL_PROTECTION,
src/modules/systems/ConversationSystem.js:4788:      final2: DealTypes.FINAL_TWO,
src/modules/systems/ConversationSystem.js:4789:      share_info: DealTypes.SHARE_INFO,
src/modules/systems/ConversationSystem.js:4790:      idol_protect: DealTypes.IDOL_PROTECTION
src/modules/systems/ConversationSystem.js:4793:    const allianceTypeMap = {
src/modules/systems/ConversationSystem.js:4795:      core_alliance: 'core',
src/modules/systems/ConversationSystem.js:4799:    const allianceType = allianceTypeMap[dealType] || null;
src/modules/systems/ConversationSystem.js:4800:    let allianceOutcome = null; let draw = 0;
src/modules/systems/ConversationSystem.js:4801:    if (status === 'accepted' && allianceType && allianceSystem?.evaluateAllianceOffer) {
src/modules/systems/ConversationSystem.js:4802:      allianceOutcome = allianceSystem.evaluateAllianceOffer({
src/modules/systems/ConversationSystem.js:4805:        type: allianceType,
src/modules/systems/ConversationSystem.js:4807:        random: () => this._scrambleRandom(`alliance:${semanticKey}:${draw++}`)
src/modules/systems/ConversationSystem.js:4810:      if (!allianceOutcome?.accepted) {
src/modules/systems/ConversationSystem.js:4830:          this._scrambleModel().commit({ id: `${cp.activityId}:deal_promise:npc`, speakerId: npc.id, listenerIds: [player.id], targetId: target.id, lie: allianceOutcome?.sincerity === 'fake' });
src/modules/systems/ConversationSystem.js:4834:        if (allianceType && allianceSystem?.createAlliance) {
src/modules/systems/ConversationSystem.js:4835:          const name = allianceType === 'final_two'
src/modules/systems/ConversationSystem.js:4837:            : allianceType === 'voting_bloc'
src/modules/systems/ConversationSystem.js:4842:            [npc.id]: allianceOutcome?.sincerity || 'real'
src/modules/systems/ConversationSystem.js:4845:          const createdAlliance = allianceSystem.createAlliance({
src/modules/systems/ConversationSystem.js:4847:            type: allianceType,
src/modules/systems/ConversationSystem.js:4855:          if (createdAlliance && allianceType !== 'voting_bloc' && sincerityMap[npc.id] === 'real') {
src/modules/systems/ConversationSystem.js:4856:            allianceSystem.commitToAlliance?.({ survivorId: npc.id, allianceId: createdAlliance.id });
src/modules/systems/ConversationSystem.js:4865:          outcome: allianceOutcome?.sincerity === 'fake' ? 'fake' : 'accepted',
src/modules/systems/ConversationSystem.js:4866:          isFake: allianceOutcome?.sincerity === 'fake',
src/modules/systems/ConversationSystem.js:4868:          pitchType: allianceType || dealType,
src/modules/systems/ConversationSystem.js:4875:        if (allianceType) {
src/modules/systems/ConversationSystem.js:4881:            outcome: allianceOutcome?.reason || 'refused',
src/modules/systems/ConversationSystem.js:4884:            pitchType: allianceType,
src/modules/systems/ConversationSystem.js:4913:          this._applyExchangeEffects({ player, npc, deltas: { trust: this._scrambleInt(2, 6) }, contextTag: 'alliance_recommit' });
src/modules/systems/ConversationSystem.js:4922:        label: 'Prioritize alliance',
src/modules/systems/ConversationSystem.js:4925:          session?.addYou?.('Which alliance matters most?');
src/modules/systems/ConversationSystem.js:4947:          const alliance = sharedAlliances[0];
src/modules/systems/ConversationSystem.js:4948:          const size = alliance.memberIds?.length || 2;
src/modules/systems/ConversationSystem.js:4967:    const alliance = sharedAlliances[0];
src/modules/systems/ConversationSystem.js:4969:      .filter(member => alliance.memberIds?.includes?.(member.id) && member.id !== player.id);
src/modules/systems/ConversationSystem.js:5016:      this._applyExchangeEffects({ player, npc, deltas: { trust: -2, suspicion: 1 }, contextTag: 'alliance_doubt_low' });
src/modules/systems/ConversationSystem.js:5027:    this._applyExchangeEffects({ player, npc, deltas: { trust: 2 }, contextTag: 'alliance_doubt_reassure' });
src/modules/systems/ConversationSystem.js:5195:    } else if (category === 'alliance') {
src/modules/systems/ConversationSystem.js:5196:      addOption('Check alliance commitment', () => this._startConversation(survivor, {
src/modules/systems/ConversationSystem.js:5197:        intentOverride: POST_PHASE_INTENTS.alliance_commitment,
src/modules/systems/ConversationSystem.js:5202:      addOption('Swap alliance intel', () => this._startConversation(survivor, {
src/modules/systems/ConversationSystem.js:6577:        if (this.gameManager.systems?.allianceSystem?.areAllied?.(this.gameManager.getPlayerSurvivor?.()?.id, npc?.id)) {
src/modules/systems/ConversationSystem.js:9813:          topics, strategy: /strateg|vote|alliance|target|warning|idol|deal|gossip|rumor|name/i.test(topics)
src/modules/systems/ConversationSystem.js:10743:    if (intent === 'allianceInvite') {
src/modules/systems/ConversationSystem.js:11451:    const allianceSystem = this.gameManager.systems?.allianceSystem;
src/modules/systems/ConversationSystem.js:11465:    const alliances = allianceSystem?.getAlliancesForSurvivor?.(npc?.id) || [];
src/modules/systems/ConversationSystem.js:11466:    const hasOtherAlliance = alliances.some(alliance => !alliance.memberIds.includes(player?.id));
src/modules/systems/ConversationSystem.js:11471:    const committedAllianceId = allianceSystem?.getCommittedAllianceId?.(npc?.id);
src/modules/systems/ConversationSystem.js:11473:      const committedAlliance = allianceSystem?.getAlliance?.(committedAllianceId);
src/modules/systems/ConversationSystem.js:11481:    const recentMemory = socialMemory?.getMemory?.(npc?.id)?.allianceInvites || [];
src/modules/systems/ConversationSystem.js:11519:    const allianceSystem = this.gameManager.systems?.allianceSystem;
src/modules/systems/ConversationSystem.js:11524:    const alreadyAllied = allianceSystem?.areAllied?.(playerId, survivor.id);
src/modules/systems/ConversationSystem.js:11555:      socialLog.relationship.push({ id: toId, with: logName, amount: delta, context: 'allianceInvite' });
src/modules/systems/ConversationSystem.js:11559:      if (!allianceSystem?.createAlliance) return null;
src/modules/systems/ConversationSystem.js:11562:      return allianceSystem.createAlliance({
src/modules/systems/ConversationSystem.js:11597:      this._rememberConversation(survivor, 'allianceInvite', option, meeting);
src/modules/systems/ConversationSystem.js:11605:    const gateAndRollAcceptance = (pitchType = null, allianceType = 'core') => {
src/modules/systems/ConversationSystem.js:11615:      const evalResult = allianceSystem?.evaluateAllianceOffer?.({
src/modules/systems/ConversationSystem.js:11618:        type: allianceType
src/modules/systems/ConversationSystem.js:11635:      this._rememberConversation(survivor, 'allianceInvite', option, meeting);
src/modules/systems/ConversationSystem.js:11654:        allianceSystem?.commitToAlliance?.({ survivorId: survivor.id, allianceId: createdAlliance.id });
src/modules/systems/ConversationSystem.js:11657:      this._rememberConversation(survivor, 'allianceInvite', option, meeting);
src/modules/systems/ConversationSystem.js:11679:      this._rememberConversation(survivor, 'allianceInvite', option, meeting);
src/modules/systems/ConversationSystem.js:11699:            intentOverride: 'allianceInvite',
src/modules/systems/ConversationSystem.js:11708:            intentOverride: 'allianceInvite',
src/modules/systems/ConversationSystem.js:11716:        const threshold = allianceSystem?.minRelationshipForInvite || 60;
src/modules/systems/ConversationSystem.js:11733:          this._rememberConversation(survivor, 'allianceInvite', option, meeting);
src/modules/systems/ConversationSystem.js:11758:                  allianceSystem?.commitToAlliance?.({ survivorId: survivor.id, allianceId: createdAlliance.id });
src/modules/systems/ConversationSystem.js:11761:                this._rememberConversation(survivor, 'allianceInvite', option, meeting);
src/modules/systems/ConversationSystem.js:11774:                this._rememberConversation(survivor, 'allianceInvite', option, meeting);
src/modules/systems/ConversationSystem.js:11791:      this._rememberConversation(survivor, 'allianceInvite', option, meeting);
src/modules/systems/ConversationSystem.js:11801:      this._rememberConversation(survivor, 'allianceInvite', option, meeting);
src/modules/systems/ConversationSystem.js:11811:    const allianceSystem = this.gameManager.systems?.allianceSystem;
src/modules/systems/ConversationSystem.js:11813:    const alreadyAllied = allianceSystem?.areAllied?.(player?.id, survivor.id);
src/modules/systems/ConversationSystem.js:11817:      : this._pickIntentTemplate('allianceInvite', initiator).replace('{npc}', survivor.firstName);
src/modules/systems/ConversationSystem.js:11820:      { key: 'acceptFaithful', label: 'Ask for a tight alliance together.' },
src/modules/systems/ConversationSystem.js:11829:      : (initiator === 'player' ? playerInitiatedResponses : RESPONSE_LIBRARY.allianceInvite);
src/modules/systems/ConversationSystem.js:11831:    return { text, responses, context: { ...context, intent: 'allianceInvite', location: context.location, alreadyAllied } };
src/modules/systems/ConversationSystem.js:11835:    const allianceSystem = this.gameManager.systems?.allianceSystem;
src/modules/systems/ConversationSystem.js:11836:    const alliances = allianceSystem?.getAllAlliances?.() || allianceSystem?.alliances || [];
src/modules/systems/ConversationSystem.js:11838:    alliances.forEach(a => {
src/modules/systems/ConversationSystem.js:12093:    if (intent === POST_PHASE_INTENTS.alliance_commitment) {
src/modules/systems/ConversationSystem.js:12122:    if (resolvedIntent === 'allianceInvite') {
src/modules/systems/ConversationSystem.js:14574:      } else if (intel?.type === 'alliance') {
src/modules/systems/ConversationSystem.js:15497:        claim.topic === 'alliance' ? 'alliance' : claim.topic === 'target' || claim.topic === 'warning' ? 'target' : 'gossip',
src/modules/systems/ConversationSystem.js:15503:    if (top.type === 'alliance' && targetId) {
src/modules/systems/ConversationSystem.js:15580:    const alliance = Array.isArray(survivor.alliance) ? survivor.alliance : [];
src/modules/systems/ConversationSystem.js:15587:      if (alliance.includes(other.id)) return;
src/modules/systems/ConversationSystem.js:15665:    const alliance = Array.isArray(survivor.alliance) ? survivor.alliance : [];
src/modules/systems/ConversationSystem.js:15669:      if (other.id === survivor.id || other.isPlayer || alliance.includes(other.id)) return;
src/modules/systems/ConversationSystem.js:15733:      const allianceSystem = this.gameManager.systems?.allianceSystem;
src/modules/systems/ConversationSystem.js:15734:      if (allianceSystem?.areAllied?.(player?.id, survivor.id)) score += 6;
src/modules/systems/ConversationSystem.js:15894:    const allianceSystem = this.gameManager.systems?.allianceSystem;
src/modules/systems/ConversationSystem.js:15925:        const dealScore = allianceSystem?.scoreDealAcceptance?.({ offererId: player?.id, receiverId: npc?.id }) ?? acceptChance;
src/modules/systems/ConversationSystem.js:15933:        const dealScore = allianceSystem?.scoreDealAcceptance?.({ offererId: player?.id, receiverId: npc?.id }) ?? acceptChance;
src/modules/systems/ConversationSystem.js:15995:    const allianceSystem = this.gameManager.systems?.allianceSystem;
src/modules/systems/ConversationSystem.js:15999:    const allied = allianceSystem?.areAllied?.(player?.id, npc?.id) || false;
src/modules/systems/ConversationSystem.js:16657:      case POST_PHASE_INTENTS.alliance_commitment:
```

## Alliance HTML/CSS and shared overlay presentation

```text
index.html:316:      <div id="social-menu-overlay" class="overlay-backdrop" style="display: none">
index.html:317:        <div class="overlay-panel" id="social-menu-panel">
index.html:319:          <div class="overlay-panel-buttons">
index.html:323:            <button id="social-alliances-button" class="rect-button full">
index.html:332:      <div id="alliances-overlay" class="overlay-backdrop" style="display: none">
index.html:333:        <div class="overlay-panel" id="alliances-panel">
index.html:335:          <div id="alliances-grid" class="alliances-grid"></div>
index.html:336:          <button id="alliances-close-button" class="rect-button small">Close</button>
index.html:340:      <div id="create-alliance-overlay" class="overlay-backdrop" style="display: none">
index.html:341:        <div class="overlay-panel" id="create-alliance-panel">
index.html:343:          <div class="alliance-form-body">
index.html:344:            <div id="create-alliance-members" class="alliance-chip-grid"></div>
index.html:345:            <div class="overlay-panel-buttons row">
index.html:346:              <button id="create-alliance-create-button" class="rect-button" disabled>Create</button>
index.html:347:              <button id="create-alliance-cancel-button" class="rect-button secondary">Cancel</button>
index.html:354:      <div id="manage-alliance-overlay" class="overlay-backdrop" style="display: none">
index.html:355:        <div class="overlay-panel" id="manage-alliance-panel">
index.html:356:          <h2 id="manage-alliance-title">Alliance</h2>
index.html:357:          <div class="alliance-form-body">
index.html:358:            <label class="input-label" for="manage-alliance-name-input">Alliance Name</label>
index.html:359:            <input id="manage-alliance-name-input" type="text" class="text-input" placeholder="Alliance Name" />
index.html:360:            <div id="manage-alliance-members" class="alliance-member-list"></div>
index.html:361:            <div id="manage-alliance-commit-status" class="input-helper"></div>
index.html:362:            <div class="overlay-panel-buttons">
index.html:363:              <button id="manage-alliance-save-button" class="rect-button">Save Name</button>
index.html:364:              <button id="manage-alliance-commit-button" class="rect-button">Commit</button>
index.html:365:              <button id="manage-alliance-leave-button" class="rect-button danger">Leave Alliance</button>
index.html:366:              <button id="manage-alliance-close-button" class="rect-button secondary">Close</button>
styles.css:1462:.chat-option-alliance {
styles.css:1688:.relationship-list, .alliance-list {
styles.css:1771:.alliance-item {
styles.css:1777:.alliance-item:last-child {
styles.css:1783:.alliance-header {
styles.css:1790:.alliance-name {
styles.css:1796:.alliance-strength {
styles.css:1804:.alliance-members {
styles.css:1808:.alliance-member {
styles.css:1814:.alliance-member-avatar {
styles.css:1829:.alliance-member-name {
styles.css:1893:.alliance-button, .close-button {
styles.css:1902:.alliance-button {
styles.css:1907:.alliance-button:hover {
styles.css:1920:.no-alliances {
styles.css:3060:.overlay-backdrop {
styles.css:3073:.overlay-panel {
styles.css:3086:.overlay-panel h2 {
styles.css:3091:.overlay-panel-buttons {
styles.css:3105:.alliances-grid {
styles.css:3113:.alliance-slot {
styles.css:3127:.alliance-slot.primary {
styles.css:3132:.alliance-slot-badge {
styles.css:3146:.alliance-add-slot {
styles.css:3154:.alliance-add-slot img {
styles.css:3162:.alliance-add-slot:active {
styles.css:3166:.alliance-slot-members {
styles.css:3174:.alliance-slot-avatar {
styles.css:3183:.alliance-slot-extra {
styles.css:3197:.alliance-slot-name {
styles.css:3204:.alliance-form-body {
styles.css:3210:.alliance-chip-grid {
styles.css:3216:.alliance-chip {
styles.css:3230:.alliance-chip img {
styles.css:3239:.alliance-chip.selected {
styles.css:3244:.alliance-member-list {
styles.css:3250:.alliance-member-row {
styles.css:3260:.alliance-member-avatar {
styles.css:3269:.alliance-member-info {
styles.css:3276:.alliance-member-name {
styles.css:3280:.alliance-member-strength {
styles.css:3285:.overlay-panel-buttons.row {
```
