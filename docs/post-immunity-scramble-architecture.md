# Semantic post-immunity scramble foundation

## Baseline and scope

Current main **6738830b3422c84ef34e549efa8835a77ccf235f**, merge of #348, with #341–#348 treated as completed foundations. Baseline `npm test`: **336/336**. Main was rechecked before publication.

This consolidates simulation ownership, timing and occupancy. It preserves contestant data, camp economy/work formulas, calibrated behavior profiles, AllianceSystem/DealSystem public APIs, and Tribal voting math. It does not claim to finish strategic intelligence, alliance negotiation or the post-immunity presentation overhaul.

## Audit: active runtime before this change

Traced challenge-result handoff through CampScreen/PostChallengeEventSystem, FirstLoss/FirstWin/JourneyReturn events, StrategyPhaseSystem, ConversationSystem, SocialEngine, CampActivitySystem/NpcLocationSystem, shared CampPresence, SocialMemory/CampKnowledge/CampSocialResolution, alliances/deals, summary, SeasonEngine, TribalCouncilSystem, TribalKnowledgeModel/TribalQuestionEngine, saves and production render fixtures.

Repository searches covered post-phase callers, interval/timeout owners, target/rumor mutations, target-board inputs, alliance targets, physical witnesses/groups, meeting reservations and serialization. Existing source alone was not treated as evidence of an active path.

| Active path on main | Problem or role |
| --- | --- |
| Challenge ends → phase event → StrategyPhaseSystem start, plus PostChallengeEventSystem start | Two startup callers; day-one loss could start before return narratives finished |
| CampScreen countdown | 3600 game seconds decremented by a real 1000ms interval; reading/device throttling changed available strategy time |
| Strategy `beginStrategyBeats` → `runStrategyBeat` every 12000ms | Free-floating target changes and rumor leakage without physical participants or semantic activity |
| Conversation phase intro / 60000ms mid-phase scheduler | SocialEngine offscreen chatter and separate invitations during the same phase |
| SocialEngine `runOffscreenNpcChatter(post)` | Independently generated strategic chatter, rumors and social effects |
| Strategy alliance meeting navigation / `launchAllianceConversation` | Separate modal, relocation and target/sway path with no shared occupancy/time model |
| Player/NPC ConversationSystem | Rich interactive topics, counters, alliance/deal/intel callbacks; closing paid camp time only before immunity |
| Final personal/alliance lock screens and `triggerNpcScramble` | Forced administrative choices and a separate last-minute random target mutation |
| Target board → Tribal | Individual intent/confidence plus weaker aggregate heat; useful compatibility API to preserve |

Direct intent writes are centralized in `updateNpcIntentTarget`. Its former callers were seeding, hidden beats/final scramble and accepted interactive pitches/counters. Alliance target writes came from independent meeting/lock-in UI. SocialMemory and dialogue additionally held owner-specific claims, rumors, promises and plans. `_pickChatterTarget` could choose from the global cast in a premerge camp; it now uses eligible current-tribe members only.

#348 already supplied authoritative travel/arrival/presence. CampActivitySystem was gated to pre-immunity; post-immunity roaming and strategy operated beside it. The renderer could display groups while an in-transit player was opening a destination view. Both `campGroups` and `seeGroups` now reject that knowledge/UI projection.

## After: one simulation boundary

Challenge loss or individual immunity result → return/Journey/first-loss narrative → idempotent scramble start → independent NPC initial preferences → CampActivitySystem travel/conversations/meetings/approaches → explicit player action advances GameManager camp time → due activities resolve → final minutes use the same loop → one expiry/target-board projection → owned summary → existing Tribal handoff.

| Owner | Responsibility now |
| --- | --- |
| GameManager `advanceCampTime` | Single semantic clock entry; elapsed camp needs and activity boundaries; post-immunity `source: clock` is ignored |
| CampActivitySystem | Actual blocks, routes, #348 arrivals/departures, shared participants, occupancy, player conversation reservations and restoration |
| ScrambleActivityPlan | Small strategy-mode planner/resolver inside CampActivitySystem; scheduled gatherings, owned reasons for physical approaches, existing target decisions, bounded diagnostic history and persisted RNG |
| StrategyPhaseSystem | Lifecycle, initial preferences, validated intent/confidence API, strategy facts, alliance target compatibility projection, target board and one summary/Tribal transition |
| ConversationSystem | Existing interactive dialogue and its social/alliance/deal callbacks; records purpose/meaningful turns, reserves co-present participants and bills once on completion |
| SocialEngine | Existing pre-immunity behavior and reusable intent selection/dialogue support; no independent post-immunity offscreen outcomes or wall-time invitations |
| AllianceSystem | Existing membership, commitments, acceptance and post-Tribal consequences; meetings use those same records |
| DealSystem | Existing persistent deals/promises and their interactive consequences; no new autonomous deal engine |
| TribalCouncilSystem / knowledge/question model | Existing intent/confidence and weaker heat inputs; participant ownership for strategy facts is retained in knowledge projection |

No second movement engine, strategic interval, per-frame loop, UI polling, NPC memory system or dialogue framework was added.

## Timing and physical activity contract

The losing-tribe scramble starts at **3600 semantic seconds**. Reading, rendering, resizing, an open dialogue, an NPC invitation and browser backgrounding do not advance it. Existing return-event staging delays are presentation before activation, not strategy clocks. The safe-tribe event/SeasonEngine path is preserved; it bypasses the losing-tribe scramble.

| Action/block | Semantic seconds |
| --- | ---: |
| Player movement | Existing 30 per graph edge |
| NPC movement | Existing 45 per graph edge |
| Watch / Approach / Follow | Existing 60 / 45 / 120 |
| Wait | 60, explicit nearby action |
| Check-in / gossip / target-warning-verification talk / deal negotiation | Base 90 / 120 / 180 / 300 |
| Meaningful dialogue turns | +30 each, at most six; total at most 480 |
| NPC strategy conversation / idle-observation | 240 / 120 |
| Alliance meeting | 360; player-attended meeting uses dialogue negotiation tier |

Dialogue topic navigation and reading are free. Purpose accumulates across topic changes so a deal cannot become a cheap check-in by backing out. Opening an invitation is free; accepting creates the shared block. Closing/Escape consumes the selected duration once while all NPC participants stay occupied. Save/load preserves semantic occupancy and provides **Resume conversation**, rather than persisting the modal or transcript session.

The planner selects a partner/location and the existing route engine reaches that place. If the partner has moved or become occupied by arrival, the goal becomes a short regrouping observation, not a solo conversation or invented strategic content. `isCampPhysicallyPresent` from #348 remains the sole physical contract. Raw NPC destination storage is used for planning/routes only. Traveling/following players and NPCs cannot interact or witness destination groups. Actual route-step completion determines arrival witnesses/time/IDs; paired travel keeps its existing atomic arrival ordering.

Existing allies receive scheduled gatherings, not immediate teleporting meetings. Free members travel and wait while already occupied allies finish their current conversations. Gathering has a seven-minute semantic deadline; incompatible player/other meeting reservations are never stolen. All members must arrive before one shared meeting starts. A missed gathering may cancel naturally. Active membership is required. Attending requires the actual matching activity, co-present participants and player membership; a stale object cannot clear an unrelated activity.

An NPC approach uses owned camp intelligence or that NPC's own initial intention, travels to the player's physical location, then waits for an explicit response. Moving away/semantic expiry clears the invitation. No real-time autoaccept occurs after immunity.

Strategy content is resolved before releasing shared participants. Interrupting either side of an interruptible conversation releases its exact shared activity; this fixes a discovered external-companion reservation bug. NPCs cannot be simultaneously booked into a player dialogue, alliance meeting and unrelated pitch. Meetings may project a majority of resulting individual intentions into the old alliance-target bridge; they do not set every member's intention to one alliance target.

## Removed and demoted paths

Removed the active hidden interval/action body, timer watcher, independent final target reroll, post-conversation mid-phase timeout, old alliance toast/teleport/negotiation modal and sway mutation path. Post SocialEngine offscreen chatter returns without mutation. NPC locations no longer independently roam while semantic camp activities own the post phase.

`beginStrategyBeats`, `runStrategyBeat`, `startTimerWatcher` and `triggerNpcScramble` remain inert compatibility methods. `launchAllianceConversation` can only delegate to a currently available physical meeting. Old personal-target/final lock modal helpers and sway calculations remain compatibility code with no active lifecycle caller. No new flow depends on them; existing personal target data stays mutable/save-compatible. The summary heading now says **Your Current Target**.

## Lifecycle, save/load and knowledge

States: `return_event`, `scramble_active`, `final_minutes` (≤600 seconds), `resolving`, `before_tribal`, `complete`. A day/phase start key prevents repeat starts even with a zero timer or old `force` caller. Zero-time expiry releases reservations and computes the board once; summary continuation transitions once. CampScreen re-entry rebuilds an existing scramble/summary rather than replaying return events.

GameManager's existing payload retains remaining semantic time and need accumulators. Survivor records retain current blocks/participants/routes. Strategy saves retain lifecycle, intentions/confidence, facts, target-board inputs, scheduled meetings, invitation identity/expiry and planner RNG. CampActivity saves retain resolved IDs/counters and the semantic player reservation. Dependencies restore before CampActivity validates companions/reservations. No modal DOM, focus, animation or wall timer is saved. Dialogue UI closes on restore; resume/close settles the reservation once.

A pre-change active strategy save keeps its remaining time, intentions, alliances and deals. Missing planner state is adopted once; valid old pending meeting locations are carried forward and completed meetings are not rescheduled. Legacy snapshots cannot reconstruct historical physical strategy that never existed; that history is not invented.

Simulation facts are distinct from the player recap. Merely seeing a quiet group grants `seen_together`, not its pitch. Direct pitch claims belong to the listener. Interactive statements remain in existing owned SocialMemory. The summary uses player-visible facts; Tribal retains the complete simulation fact API, with actual listeners/participants in `knownTo`. The target board and private intent/confidence remain hidden.

## Next recommended pass: Strategic intent + conversation intelligence

- Current individual target intent is still a preference/compatibility vote input. Public pitches, private vote intention, decoys, backups and split roles need distinct provenance-aware representation.
- Existing `pickAction`/`pickTargetForAction` now resolve physical conversations, but check-in/verification/warning purposes have limited differentiated AI depth. Their labels are not proof of sophisticated negotiation.
- Listener adoption uses bounded existing trust and owned exchanges, not a complete commitment/verification model. Majority setup can fracture; do not tune cast traits to make the harness preserve it.
- Conversation menus coexist with older node/intent handlers. Many responses produce camp memory or `npcMemory.currentPlan`, while only specific accepted NPC pitch/counter callbacks directly update Strategy intent. Unify meaningful agreement without treating every spoken name as a real vote.
- Audit `_buildStrategyNodes` vote-read guesses and warning/proof packets: inference can be labeled like reliable intel. Truth, rumor, speculation and deliberate lie need consistent source/time/recipient provenance; avoid omniscient majority claims and psychic lie detection.
- `ask_info` lie responses apply immediate suspicion/trust effects, while older fake-deal paths store a lie at creation. Later detection should depend on evidence, not access to hidden truth.
- Existing idol truth/disclosure paths can consult inventory for an owner's answer; verify every downstream witness/recipient rule before making any rumor a confirmed possession.
- Player-on-bottom remains reachable in the danger harness; agency, conflicting warnings, deception and late alternatives need a dedicated strategic gameplay pass.
- The legacy summary categories do not yet aggregate all owned structured conversation memory; improve that separately without restoring hidden fact leakage. Existing dialogue content/randomness is preserved, not broadly recalibrated.

## Upcoming dedicated Alliance overhaul

Membership and acceptance remain compatible; no new alliance is created merely by restoring/scheduling. Weaknesses carried forward:

- Overlapping alliances compete for the same participants; semantic occupancy prevents double booking, but there is no priority/hierarchy/sincerity/fake-alliance model in this planner.
- Gatherings use a simple fixed schedule, not adaptive coalition urgency or deliberately hidden subgroup invitations. A player can miss or join an actual meeting; remote contents are not disclosed.
- Joining currently uses the existing primary NPC interactive dialogue with the others reserved, not a complete multi-speaker target negotiation. Existing commitments/cohesion and target bridges need clearer consensus/disagreement semantics.
- Core alliances, voting blocs, Final Two/Three relationships and deals can overlap without a complete consistent priority model.
- Acceptance, adding/removing members, invitations, loyalty/betrayal, information sharing, outsider discovery, fracture/dissolution and post-Tribal consequences need coordinated review. Current records/APIs are preserved for that pass.
- The disagreement scenario begins with distinct individual preferences and scheduling does not flatten them. A completed meeting can influence people; majority projection is not binding consensus.
