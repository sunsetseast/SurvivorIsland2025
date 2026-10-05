# Current-main strategic integration inventory

Baseline: `050c11f2beab194acfb690a6cd98112d230f778c`, merge of #351. Baseline tests: 540 passed.

```text
src/modules/systems/SocialEngine.js:238:        const committedAllianceId = memorySystem?.getCommittedAllianceId?.(npc.id) || null;
src/modules/systems/SocialEngine.js:246:        const alliedWithPlayer = allianceSystem?.areAllied?.(player.id, npc.id) ?? false;
src/modules/systems/ConversationSystem.js:2617:    const shared = allianceSystem?.getSharedAlliances?.(npc?.id, player?.id) || [];
src/modules/systems/ConversationSystem.js:2964:      const shared=system.getSharedAlliances(npc.id,player.id)[0];
src/modules/systems/ConversationSystem.js:6513:        if (this.gameManager.systems?.allianceSystem?.areAllied?.(this.gameManager.getPlayerSurvivor?.()?.id, npc?.id)) {
src/modules/systems/ConversationSystem.js:11407:    const committedAllianceId = allianceSystem?.getCommittedAllianceId?.(npc?.id);
src/modules/systems/ConversationSystem.js:11451:    const alreadyAllied = allianceSystem?.areAllied?.(player?.id, survivor.id);
src/modules/systems/ConversationSystem.js:15372:      if (allianceSystem?.areAllied?.(player?.id, survivor.id)) score += 6;
src/modules/systems/ConversationSystem.js:15637:    const allied = allianceSystem?.areAllied?.(player?.id, npc?.id) || false;
src/modules/systems/AllianceSystem.js:322:  getSharedAlliances(a, b) {
src/modules/systems/AllianceSystem.js:329:  areAllied(a, b) {
src/modules/systems/AllianceSystem.js:330:    return this.getSharedAlliances(a, b).length > 0;
src/modules/systems/AllianceSystem.js:346:  getCommittedAllianceId(id) {
src/modules/systems/AllianceSystem.js:351:      const id = this.getCommittedAllianceId(p.id);
src/modules/systems/AllianceSystem.js:364:    const s = this.getMemberState(id, this.getCommittedAllianceId(id));
src/modules/systems/AllianceSystem.js:669:      !this.getSharedAlliances(a, b).some((x) => x.type === this.type(type))
src/modules/systems/AllianceSystem.js:1272:    const shared = this.getSharedAlliances(speakerId, listenerId),
src/modules/systems/SocialMemorySystem.js:631:    getCommittedAllianceId(npcId) {
```
