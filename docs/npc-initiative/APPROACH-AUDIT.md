# Approach audit

Baseline: merged #358, `6df6d2412e7f6db30e45a34807474a2e3ed004f3`.

## Actual initiation authorities

| Entry | Production call path | Physical/dialogue outcome |
| --- | --- | --- |
| Phase introduction / navigation | ConversationSystem phase event → `_queuePhaseInvitations` → `_scheduleMeetingInvitation` → pendingMeetings → CAMP_VIEW_LOADED | SocialEngine weighted intent or relationship fallback; navigation opens approach overlay. Not a new semantic need. |
| Pre-camp midpoint | camp:timeAdvanced crossing 4800 → `_scheduleMeetingInvitation` | Same phase invitation authority, separate from camp activity choice. |
| SocialEngine | shouldTriggerBeatNow / pickBestIntentForPlayer called by phase invitation generator | Random beat gate, phase/day caps and 300-second global / 600–900 per-person cooldowns. Its standalone dialogue/choice APIs have no runtime caller beyond debug/compatibility. |
| Routine scramble player approach | ScrambleActivityPlan.onBoundary → nextApproachAt → candidateScore → agenda → approach_player | Independent 600-second cadence, reads current player location. Arrival creates approach_wait invitation; UI Talk explicitly starts conversation. |
| Objective/task approach | CampActivitySystem.chooseNext → StrategicObjectivePlanner.plan → tasks.plan or workPlanner candidates → approach_player / strategy_conversation | Stronger owned strategic reason. Post arrival uses scramble invitation; pre arrival reserves conversation before offering consent. |
| Ordinary NPC/NPC scramble | CampActivitySystem.chooseNext → ScrambleActivityPlan.plan → choosePartner / agenda → route / strategy_conversation → resolve → executeAgenda | Actual co-present reservation and individual response. Partner selection and destination use current global location, rather than owned sightings. |
| Ordinary pre NPC/NPC | CampActivitySystem.scoreChoices → work companionship / socialize / strategy_conversation → CampSocialResolution → ConversationResolver.resolveCampAgenda | Actual conversation and memory, but initiating intent is mostly chosen at resolution, after movement. Work companionship must remain intact. |
| NPC_CONFRONTATION | ConversationSystem._handleNpcConfrontation → startNpcConversation | Separate direct entry; pre path can synchronously traverse to screen location. |
| Alliance group | ScrambleActivityPlan.scheduleAlliances → gathering → physical reservations → AllianceSystem.resolveMeeting | Independent member positions; preserve this specialized group coordination. |

## Consent and continuity defects

`_showNpcApproachOverlay` schedules acceptance after 1800 wall-clock milliseconds pre-immunity. Decline applies fixed -2 relationship and irritation, irrespective of context. Pre objective arrival may reserve human activity before consent. `startNpcConversation` may synchronously consume an entire route, and legacy reservations can assign a remote location. These paths compete with normal camp availability.

ConversationView.startNpc resolves one semantic opening (objective/task, alliance, agenda or social mapping), stores its line and returns the generic player menu. Incoming assignments/deals have explicit responses, but a strategic pitch has no durable initiating negotiation continuation. Back/render does not duplicate semantic receipts; preserve that property.

## Ownership and authority

ScrambleStrategy agenda uses speaker-owned evidence, intended target, known positions, affinity and character. It supplies genuine warnings, verification, recruitment, cover, backup, loyalty and alliance motives. StrategicWorkPlanner and StrategicObjectivePlanner already choose meaningful delegated/personal work; do not replace them. SocialMemory/CampKnowledge own attributed claims, observations, promises, task reports and contradictions. CampActivitySystem owns movement, arrival, availability, exclusive reservations and semantic time. ConversationResolver owns spoken actions and receipts. AllianceSystem owns formal alliances. Tribal convergence remains individual intention authority.

Physical legality is already enforced on arrival (in-transit contestants absent). Remote partner reservations are forbidden. Moving or busy NPC targets commonly degrade into observation without retaining the original ordinary motive. A second arriving player approach cannot overwrite the first, but no shared phase-independent intention lifecycle manages retries, deferral or abandonment.

## Persistence / presentation

ConversationSystem serializes semantic engine state, moods and legacy local memory; camp serializes reservations and activities; scramble serializes invitations/meetings/RNG. Conversation checkpoints preserve transcript and resolved results. NpcAutoRenderer shows post-only inline invitation; pre uses blocking overlay. An approach_wait activity is retained on load only if the scramble invitation owns it. A unified lifecycle must preserve that reservation ownership pre/post and migrate old invitations without inventing dialogue.

## Consolidation boundary

Replace phase/screen beat generation and routine cadence with one bounded initiative coordinator. Adapt existing objective/task activity plans into its physical/invitation/outcome lifecycle. Keep specialized alliance gathering, work companionship, semantic resolution and canonical memory. Route explicit/debug/confrontation approach entries through that coordinator. Use owned recent sightings or bounded camp search rather than live remote coordinates. Persist only selected meaningful intentions and recency; derived candidate scores remain transient.

## Baseline path → final authoritative path

| Previous entry | Change | Coverage |
| --- | --- | --- |
| Phase/navigation/midpoint SocialEngine invitation beats | Removed as runtime initiators; shared semantic checkpoint motives replace them | production pre social/warning selection; no timer; navigation does not start consent |
| Scramble 600-second player cadence | Removed; nextApproachAt remains inert save compatibility | owned warning, human/NPC candidate parity, fresh urgent evidence and routine suppression |
| Objective/task approach | Adapted to shared arrival/invitation lifecycle; pre no longer auto-reserves human | natural delegation suites, refusal recovery, real task opening/response and explicit consent |
| Ordinary NPC/NPC approach | Shared selected intention, owned sightings and actual co-present reservation | NPC/NPC receipt, mutual-wait recovery, passive natural scrambles |
| Shared work companionship | Retained; remote social destinations now use owned sightings | all Living Camp production/physical suites |
| NPC_CONFRONTATION/debug entry | Routed through coordinator; no synchronous remote conversation | actual event/context motive and physical eligibility tests |
| Alliance group meeting | Retained under canonical AllianceSystem | existing group/alliance and rendered group coverage |
| 1800ms acceptance overlay | Timer removed; inline attention with explicit talk/defer/decline | real 2.1s rendered wait, pending JSON restore, no reservation before acceptance |
| Post-only invitation storage | Shared initiative payload; legacy invitation migrated once | phase transition/expiry, JSON state matrix and natural replay |
| One-line NPC opening → generic menu | Checkpointed initiative choices and bounded semantic follow-ups | why/numbers/conditional/refusal/cover agreement, replay, touch/keyboard QA |

SocialEngine's old beat and debug APIs remain available for compatibility, but the production phase and navigation code no longer calls them to generate meetings. Legacy pendingMeetings metadata can load without becoming an invitation authority. No old dialogue tree or vote model is restored.
