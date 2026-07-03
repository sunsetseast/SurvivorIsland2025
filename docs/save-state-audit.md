# Save-State Audit

This audit tracks state that must survive a save/load cycle for Survivor Island. The current foundation uses a versioned world payload from `GameManager.createSavePayload()` and restores it with `GameManager.restoreSavePayload(payload)`.

Guiding rule: save plain world state only. Do not save DOM nodes, event listeners, timeout IDs, interval IDs, or open overlay objects.

| State | Owner file/system | Currently saved? | Needed for save? | Risk if missing | Proposed serialize/deserialize approach |
|---|---|---:|---:|---|---|
| Save version and save timestamp | `src/modules/core/SaveManager.js` | yes | yes | Old saves become hard to migrate safely. | Store `saveVersion` and `savedAt` on every payload; normalize legacy single-slot saves. |
| App/game version | `src/modules/core/GameManager.js` | partial | yes | Harder to diagnose save incompatibilities. | Capture `.version-info` text when available; later replace with a central app version constant. |
| Game phase/current screen | `src/modules/core/GameManager.js` | yes | yes | Loading may resume to the wrong screen or phase. | Save `gameState` and `gamePhase`; restore defensively and call `_updateScreenForState()`. |
| Day | `src/modules/core/GameManager.js` | yes | yes | Challenge, strategy, and event progression drift. | Save `day`; default to day 1 if missing. |
| Day timer/time state | `src/modules/core/GameManager.js` | yes | yes | Camp/post-challenge timing resets or skips. | Save `dayTimer` and `timeSpeed`; do not save timer IDs. |
| Player | `src/modules/core/GameManager.js` | yes | yes | Conversations, tribe lookup, inventory, and voting lose player identity. | Save `player` and `playerId`; restore from saved player or survivor list. |
| Survivors | `src/modules/core/GameManager.js` | yes | yes | Stats, eliminated state, advantages, suspicion, tasks, and social state can be lost. | Save full `survivors` list as JSON; normalize missing `laziness` on restore. |
| Tribes and tribe membership | `src/modules/core/GameManager.js` | yes | yes | Tribe composition, stockpiles, colors, and water plans may reset. | Save full `tribes`; initialize water plans after restore. |
| Journey/progression | `src/modules/core/GameManager.js`, `src/modules/events/*Journey*` | yes | yes | Risk/protect, return events, lost votes, or extra votes may disappear. | Save `journey` and journey flags in `flags`; deeper event-specific migration can be added later. |
| Jury/finalists/winner | `src/modules/core/GameManager.js` | yes | yes | Finale/endgame state becomes invalid. | Save `jury`, `finalists`, and `winner`; default to empty/null. |
| Merge/shuffle state | `src/modules/core/GameManager.js` | yes | yes | Tribe count and merge logic may repeat. | Save `mergeAt`, `isTribesShuffled`, and `isMerged`. |
| Flags | `src/modules/core/GameManager.js` | yes | yes | One-time events can replay or skipped gates can reopen. | Save `flags` object as plain JSON; default to initial Day 1 flag object. |
| Camp log | `src/modules/core/GameManager.js` | yes | yes | Player loses narrative history and camp summaries. | Save `campLog`; default to empty array. |
| Game history | `src/modules/core/GameManager.js` | yes | yes | Tribals, winners, and progression summaries may disappear. | Save `gameHistory`; default to `{ tribals: [] }`. |
| Tribal council log | `src/modules/core/GameManager.js` | yes | yes | Past votes and eliminated records become unavailable. | Save `tribalCouncilLog`; default to empty array. |
| Generic game state/inventories | `src/modules/core/GameManager.js`, `src/modules/systems/InventorySystem.js` | yes | yes | Player/NPC inventory UI can lose items. | Save `state`, including `state.inventories`; `InventorySystem` already stores there. |
| Relationship state | `src/modules/systems/RelationshipSystem.js` | yes | yes | NPC social dynamics reset to neutral/random. | Added `serialize()` / `deserialize()` for relationship map, default value, and thresholds. |
| Trust state | `src/modules/systems/TrustSystem.js` | yes | yes | NPC trust calculations reset. | Existing `serialize()` / `deserialize()` used by world payload. |
| Alliance state | `src/modules/systems/AllianceSystem.js` | yes | yes | Alliances, fake/real sincerity, targets, and commitments vanish. | Added `serialize()` / `deserialize()` for alliances and commitment map. |
| Deal state | `src/modules/systems/DealSystem.js` | yes | yes | Promises and betrayals lose continuity. | Existing `serialize()` / `deserialize()` used by world payload. |
| Idol/advantage state | `src/modules/systems/IdolSystem.js`, survivor objects, `InventorySystem` | partial | yes | Hidden idol location, clues, found/used status, and inventories may reset. | Added `IdolSystem.serialize()` / `deserialize()` for idol/clue maps, inventories, casual searches, and spawn state; survivor advantages remain in `survivors`. |
| Social memory | `src/modules/systems/SocialMemorySystem.js` | yes | yes | NPCs forget lies, secrets, promises, targeting, gossip, and reliability. | Added `serialize()` / `deserialize()` for memory, intel events, social events, and structured events. |
| Conversation memory | `src/modules/systems/ConversationSystem.js` | partial | yes | NPC conversation continuity and local memory can reset. | Added narrow `serialize()` / `deserialize()` for moods, `_memoryLog`, and `npcMemory`; active overlays/sessions are intentionally not saved. |
| Strategy target board / intentions | `src/modules/systems/StrategyPhaseSystem.js` | yes | yes | Tribal Council may ignore post-challenge strategy after load. | Added `serialize()` / `deserialize()` for target board, personal target, alliance targets, NPC intentions, facts, queues, and phase markers; timer IDs are excluded. |
| Challenge manager state | `src/modules/core/ChallengeManager.js` | yes | yes | Last challenge result, immunity, and post-challenge events may lose context. | Added `serialize()` / `deserialize()` for `currentChallenge` and `challengeResults`; registered challenge manager as a system. |
| Task/camp simulation state | `src/modules/systems/TaskSimulationSystem.js`, `TaskSystem`, survivor/tribe objects, `flags` | partial | yes | Mid/end checkpoint reports may rerun or camp resources may drift. | Current checkpoint flags and stockpiles are saved through `flags` and `tribes`; deeper `TaskSystem` serializer still needs review. |
| Active post-challenge state | `src/modules/systems/PostChallengeEventSystem.js`, `StrategyPhaseSystem`, `flags` | partial | yes | Scripted event queues or pending return-camp moments may replay incorrectly. | Save strategy state and flags now; document event runner/queue state for a later focused pass. |
| Active tribal council state | `src/modules/systems/TribalCouncilSystem.js`, `TribalCouncilView` | partial | yes if mid-tribal save is allowed | Mid-vote/revote state could be lost or double-resolved. | Do not support exact mid-tribal resume yet; save logs/history after completion. Add `TribalCouncilSystem.serialize()` only after defining supported save points. |
| NPC locations | `src/modules/systems/NpcLocationSystem.js`, survivor objects | unknown | yes | NPCs may appear in wrong locations after load. | Audit singleton internals and add serializer if it owns state not mirrored on survivors. |
| Social engine cooldowns/caps | `src/modules/systems/SocialEngine.js` | no | yes | NPC approach pacing may reset after load. | Add serializer later for phase type, cooldowns, per-phase counts, and chatter keys after confirming maps/sets are plain. |
| Dialogue queue | `src/modules/systems/DialogueSystem.js` | no | no for foundation | Resuming an open dialogue exactly is risky. | Clear/rebuild UI after load; do not save active dialogue queue until exact modal resume is designed. |
| Event manager subscribers/history | `src/modules/core/EventManager.js` | no | no | Saving subscribers would corrupt runtime behavior. | Do not save. Re-register listeners during normal initialization. |
| Timer IDs/interval IDs | `TimerManager`, systems with timeouts | no | no | Restoring stale IDs would break timers. | Save semantic time (`dayTimer`, phase state) only; recreate timers from restored phase. |

## Current Foundation Coverage

- `GameManager.createSavePayload()` now returns one JSON-safe world payload.
- `GameManager.restoreSavePayload(payload)` restores defensively from both new and legacy single-slot payloads.
- `SaveManager` owns localStorage, versioning, payload normalization, and JSON safety.
- `window.SaveDebug.snapshot()` returns the current payload.
- `window.SaveDebug.inspect()` returns a compact critical-state summary.
- `window.SaveDebug.roundTrip()` stringifies/parses/restores and reports obvious critical-field drift.

## Known Follow-Up Work

- Decide whether saves are allowed during active Tribal Council. If yes, add an explicit `TribalCouncilSystem.serialize()` and resume flow.
- Audit `TaskSystem`, `NpcLocationSystem`, and `SocialEngine` for state that is not already represented in `GameManager.flags`, survivor objects, or tribe objects.
- Add save migrations when `saveVersion` increases.
- Add profiles/save slots only after the world payload is stable.
