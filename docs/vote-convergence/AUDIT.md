# Vote convergence audit

Baseline: current main `1ce249c3c984b619bf1784abf7a2134e2e3ed0db` (merged #352). Baseline full suite: **589 passing tests**. No cast attributes or Tribal ritual code changed.

## Verified baseline

The committed #352 natural report is the source of the before comparison, not an estimate from the task description. NPC ballots are selected by voter IDs in each round's `initialIntent`; the player ballot is excluded. Average per-Tribal strong-majority concentration: **4.5625 distinct targets**, **46.267% on the leading target**. No-alliance: **5.1875 targets**, **33.507% leading share**. Initial-intent retention was 92.969–100% across the ten families. The existing harness has staged initial majority circumstances in several first rounds; it does not prove that a mixed-preference majority spontaneously negotiated those starting intentions. Later rounds independently seed preferences.

## Active paths and findings

| Path | Merged behavior | Focused change |
| --- | --- | --- |
| `StrategyPhaseSystem.seedNpcIntentTargetsForPhase` | Legal targets sampled from relationship, existing owned camp preference, and threat inputs; `updateNpcIntentTarget` immediately writes a .35 actual intent. | Keep the independent preference sample and compatible target-bearing lean; mark it `lean`, confidence .20, with no commitment. |
| `ScrambleStrategy.state` / `setIntent` | Preferred, intended and committed IDs already separate, but no maturity. Initial preference also fills intended ID; history only metrics. | Small maturity field and bounded intention-change history. Preference remains stable when the ballot changes. |
| `adoption` | Preferred-match .22 plus current-match .13; viability capped at .13; an open response often never updates intent. | Remove early-seed authority; asymmetric affinity and owned support contribute. Keep genuine promises costly to break and established-plan guard. |
| `voteRead` / `viability` | Latest iteration per attributed source; target pitches count like commitments in reads. Viability only counts promises and gives self a full vote even for a seed. | One owner-derived support projection: attributed-voter deduplication, speech strength, provenance, freshness, confidence and challenge status. A weak own lean is fractional. |
| `resolveMeeting` | Everyone presents a position; adoption usually weak; group outcome aggregates final individual positions. | Explicit proposal, individual consideration and spoken agreement; no automatic agreement by roster. Preserve fake public consent and private intent. |
| `AllianceSystem.resolveMeeting` → reasoning | **Alliance ID lost:** camp activity retains `meetingId`, not `allianceId`; reasoning cannot obtain the coalition to evaluate fake membership/context. | Pass the already known alliance ID explicitly at this boundary. No occupancy/movement rewrite. |
| `AllianceSystem.captureRoundPlan` | Coalition's attempted plan, participant commitments, split reference and public history. | Existing representation also carries a `proposed` plan during actual negotiation. Only attendees with owned plan language use its gravity. Final capture remains the attempted coalition plan, not a ballot overwrite. |
| `AllianceConversation` | Per-speaker group opening already checks cover; calls adoption, commitment and capture APIs for interaction choices. | Small wording correction: locked actual vote versus uncommitted lean. Existing participant-by-participant callbacks remain authoritative. |
| `ScrambleActivityPlan` | Physical conversations and travel; finite semantic meeting/conversation blocks; needs-driven scheduling. | Architecture unchanged. Strategy phase checks final-five/expiry independently, and received evidence/meeting completion triggers reconsideration. |
| `agenda` / `resolveAgenda` | Contextual motives from #352; ordinary autonomous pitches often still `target/consider` even if speaker actually committed. Intel exchange does not produce a reply agreement. | Mature pitches convey their real stance; a numbers pitch can relay one actually owned attributed supporter; an intel exchange can end with individual acceptance. Suppress ordinary recruitment of an owner-known dead plan. |
| `_getStrategyIntentWeight` / `_scoreNpcTarget` | Direct intent gets up to 1; alternate targets still receive board fallback even when a direct intent exists. | Cap weak lean at .25 and omit aggregate fallback when direct intent exists. All other score terms and ballot resolution retained. |
| Target board | Compatibility aggregate of private intents and alliance attempts. | Computed after independent final crystallization; never an input to reconsideration. |
| Player intent / recap | Player intent is their own setting/statement; actual Tribal selection remains free. Owner-scoped recap distinguishes statement topics. | No automatic player reconsideration; hedge never counted as confirmed. No vote dashboard/danger meter/new recap truth. |
| Save/load | Existing strategy JSON persists all mind state, plans and replay checkpoints. | New maturity/history/receipts ride existing serialization. Old rich state infers lean/provisional/committed maturity; old maps still migrate. No derived support cache serialized. |
| #352 harness / tests | Production movement, semantic time, conversation, actual Tribal and post-Tribal lifecycle; multiple rounds and production JSON restore. | Preserve original comparison setup and add diagnostics/boundaries. Separate mixed-preference controlled runs and active player policy. |

## Compatibility and non-authoritative paths

`npcIntentTargets`, `npcIntentMeta`, `getNpcTargetIntent`, `allianceTargets` and target board remain projections/bridges, not another strategy engine. `beginStrategyBeats`, timer watcher, `runStrategyBeat` and `triggerNpcScramble` remain inert; no hidden timer or final reroll reintroduced. Legacy alliance target pickers are not the semantic meeting authority. `TribalCouncilSystem` still scores and resolves ballots; intended votes do not pre-write them. Existing ConversationSystem checkpoints own replay and time charges.

## Decision boundaries and safeguards

Reconsideration runs on received target/commitment/alliance-plan statements, physical meeting proposal/completion, entry into the final five minutes, and expiry. Candidate set is bounded to own preference/current/commitment, four known plans, personally known coalition plans, and already accepted assignment/backup. It never reads other contestants' intended ballots or the board. New decisions use no random draw. Current promises and target protection add resistance; low-flexibility protection can produce a deliberate holdout. Accepted split votes and activated, informed backups survive ordinary convergence. A fake coalition claim has almost no real gravity for its fake member.

The system does not assume a counted vote is true: a trusted player lie or fake member's public promise can create a believed majority. Direct statements still need credibility, and latest contradictory statements preserve uncertainty. No global majority or cross-camp communication was added.
