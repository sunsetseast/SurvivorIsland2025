# Conversations as social strategy

This change starts at current main `c16b7afa` (#355). Living Camp, formal alliances, individual vote intention, strategic convergence and Tribal execution remain authoritative. The baseline call-path audit is in [BASELINE-AUDIT.md](BASELINE-AUDIT.md).

## Ownership

| Module                                      | Responsibility                                                                                                                                           |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ConversationSystem                          | Start/resume/end, physical reservations, group identity, accessibility, transcript and DOM orchestration. Existing alliance dialog remains routed here.  |
| ConversationView                            | Suggestions, categories, intent groups, subject/condition/purpose/source selection, navigation and resolved transcript rendering.                        |
| ConversationActionCatalog                   | 72 reusable capabilities, valid subjects and phase/context availability.                                                                                 |
| ConversationActionHandlers                  | Independent resolver coverage; missing, duplicate and unreachable semantics fail validation.                                                             |
| ConversationResolver                        | Resolve one utterance, individual reactions, semantic effects, logical follow-ups and durable action receipts.                                           |
| ConversationCharacter                       | Interpret existing production ratings and gameplay style without retuning contestant data.                                                               |
| SocialMemorySystem / CampKnowledge          | Owner-specific claims, evidence, source chains, credibility, contradictions, remembered conversation history and obligations.                            |
| StrategicObjectivePlanner                   | Bounded multi-step recruitment, conditions, intermediaries, reported failures, visibility, leaks and contingencies above the existing agenda.            |
| StrategicTaskSystem                         | Acceptance, refusal/hedging, search, physical performance, spoken reports, failed/ignored work and false reports.                                        |
| ScrambleStrategy / StrategyPhaseSystem      | Existing authoritative preference, intended vote, commitment, persuasion, perceived numbers, backup, split, decoy and #353–#354 convergence.             |
| AllianceSystem / AllianceConversation       | All new formal alliances, core/temporary coalitions, voting blocs and endgame agreements; membership, exclusion, secrecy, ranking, repair and departure. |
| DealSystem / DealConsequencesSystem         | Specific vote, information, mutual/ idol protection obligations and consequences that the affected contestant actually learns.                           |
| CampActivity / Presence / Interaction       | Semantic time, routes, real arrivals, availability, witnesses and bounded overhearing.                                                                   |
| ConversationEvents / ConversationProtection | Witnessed challenge/Tribal memories; narrow protection-promise adapter at the existing idol execution boundary.                                          |
| TribalCouncil / TribalKnowledgeModel        | Individual final intentions and owned evidence, followed by actual ballots and plays.                                                                    |

`ConversationSystem.js` shrinks from 16,748 to 3,099 lines (including formatting). Disabled tree/flow generations and their reachable-only-through-obsolete-diagnostics dependencies were removed after the audit. Existing externally tested stance/deal/intel helpers remain compatible; they are not the live menu or a new strategic brain. `ScrambleConversation` remains an adapter for existing tested checkpoint callers, and `AllianceConversation` keeps its specialized depth.

## Semantic action and resolution

An action includes a stable `actionId`, type/speech act/topic, speaker, actual listeners, valid subject, proposition, delivery, truth mode, alleged source, evidence, conditions, secrecy, requested work, objective/task/alliance/deal references and semantic day/phase/time/location/activity context. Some values are derived at resolution rather than accepted from the UI. All listeners must actually be present; a destination coordinate during travel does not qualify.

The catalog describes possibilities. The resolver handles effects. A catalog entry cannot acquire behavior merely by being added to the menu: the independent handler registry and execution coverage must agree. The same action/resolver handles player-to-NPC, NPC-to-NPC, NPC-to-player and each member of a real group. The player chooses their own answers; an NPC question never automatically discloses or commits the human's intention. NPC alliance motives route to the existing authoritative proposal/recruitment conversation.

Established autonomous short-term scramble agendas are adapted through `ScrambleStrategy.resolveAgenda`, preserving its RNG, adoption, information sharing and certified convergence. New objective/task conversations use the same canonical statement, adoption, commit, backup and split operations. Pre-immunity timed exchanges retain information sharing, observed gossip, cautious strategy, occasional deception, idol disclosure and bonding rather than collapsing to one generic social interaction.

Pitching, asking for a vote, pressure, negotiation, promises, conditional promises, cover promises and withdrawal have distinct semantics. A pitch is not a promise. A player pitch records a provisional preference in the existing individual strategy model; a real promise uses `commit`. Pressure records a risky interaction and can damage trust; protectors and hostile contestants can refuse or counter. NPCs evaluate their own interest, owned support, alliance affinity, safety, existing commitment/flexibility, source credibility, history and character.

Social Genius favors consensus/repair, Power Player favors direct commitment and delegation, Shadow Strategist favors low visibility/intermediaries, Competitive values shields, Wildcard has more flexibility, and Lethal Charmer has more cover/deception. These adapters affect decisions rather than only response text. They remain sensitive to real alliances, evidence and history.

## Knowledge and memory

There is no new shared belief map. `SocialMemorySystem` owns claims and observations; `CampKnowledge` produces a read-only projection for a specific person. Social reads use that owner's conversations, observations, work/company impressions and relationships. Leadership reads track the people making proposals; proximity reads track witnessed company. They never rank hidden global threat.

Truth, hearsay, inference/speculation, fabrication, selective disclosure and concealment are distinct. Listener memory says who told them something, with attribution, source chain, evidence, confidence and conditions. Hidden falsity/sincerity and a deliberate leak-test marker stay in the speaker's record. A hearsay promise is not a promise owned by the alleged voter. A bluff about Jeremy does not alter Jeremy's ballot. Verification with Jeremy may confirm/deny/cover; verification with a third party can only corroborate their own evidence or refer the question to Jeremy. A contradiction creates uncertainty rather than exposing which account is objectively true.

Groups hear each public utterance, with independent NPC reactions and independent promises. An absent participant, a person in transit, and a formal ally elsewhere receive no content. The existing CampInteraction overhearing rules remain responsible for fragments versus intelligible statements. No group belief or group ballot exists.

Conversation history is bounded to 100 records per owner; obligations to 80. Meaningful statements also enter the existing bounded camp claim/source architecture. Promises retain owner, audience, target, condition and state. A condition activates only from the speaker's owned confirmation, without notifying remote listeners. Unmet conditions are not broken promises. Tribal settles the speaker's private outcome; other contestants need owned attribution evidence before remembering a breach or applying trust/betrayal consequences. History and obligations survive later rounds.

Secrecy agreements record who accepted, which exchange/claim they cover and allowed recipients/source use. Protected sources are withheld when asked; incidental sharing is not treated as proof of a leak. A leak updates the leaker's private obligation, not the source's remote state. A returned protected/test story can support an uncertain inference with evidence IDs. The listener does not learn that an original utterance was a deliberate leak test.

Recent-event options use actual owned incidents, public challenge outcomes and witnessed Tribal outcomes/idol plays. Challenge scores and other people's secret ballots are excluded. A contestant remembers their own ballot. Apology/admission subjects are restricted to relevant personally owned incidents; a challenge loss does not manufacture a vote betrayal.

## Objectives and work

An objective stores owner, goal/target/rationale, desired outcome, believed individual support, required majority, confidence, risks, secrecy, backup, deadline, revision, dependent tasks and performed conversation steps. Current autonomous goals are round-scoped; their records and the social consequences remain durable. Long-term alliance priorities and histories continue in the existing systems.

Evaluation runs at semantic activity boundaries, with a 120-second cache and relevant-event invalidation. It processes a failure report once, prioritizes voters required by conditional support, uses owned idol/leak concerns and can abandon an incompatible move. New spontaneous planning requires a concrete intention and personally heard support so it does not displace the established early scramble agenda. Explicit goals can start earlier. Candidate sets are tribe-bounded; there are no per-frame all-pairs loops.

The planner never writes a ballot. Its steps are real conversations. It can recruit, delegate through a trusted committed ally, wait for reports, wait to reduce visibility, propose insurance, or test the return of information. Existing alliance meetings still coordinate independently negotiated split assignments and backup activation.

Task lifecycle:

1. The requester and delegate speak while co-present. Acceptance considers trust, alliance, character, risk, own interests and workload. A public acceptance may conceal ignoring or leaking.
2. Accepted work queues in Living Camp. The delegate uses their owned sightings and bounded search, travels the existing route, waits if the intended person is visibly busy, and reserves a real timed conversation. An unavailable person does not become a recruited boolean.
3. The target responds normally: commit, condition, lean, refuse, cover or other relevant answer. The performed receipt, actual spoken target and evidence remain private execution state.
4. The delegate physically returns to the requester or approaches the human. The requester can also ask for a follow-up while co-present.
5. The report is a new utterance. It may be incomplete, truthful or false. Only the spoken report reaches the requester. Reported conditions and actual named targets retain attribution; failure does not secretly rewrite the target's vote.
6. Owned task memory records acceptance, performance and reported outcome. A delegate's false-report memory is private. Tasks expire at the next round; completed/failed history persists.

A human delegate accepts/refuses explicitly, performs a matching real conversation and can report the result or intentionally fabricate success. Human requesters choose the person, purpose, relevant voting/secondary/decoy target, information and attribution policy. Recruitment, verification, warning, reassurance, information, repair, backup/split communication, bringing someone over and leaking use semantic actions. Bringing someone requires willingness and existing paired physical movement; it does not teleport a participant into the session.

The deterministic Sandra–Jeremy–Michele scenario recruits Jeremy, delegates recruitment, follows Jeremy's actual route to Michele, gets her independent conditional answer, physically reports back and transfers Parvati's requirement to Sandra. Refusal, fake acceptance, ignored work, leaking and false reports are controlled variants. A save in delegated travel produces an identical final simulation projection.

## Player interface

Approximately 2–4 contextual suggestions sit above six durable categories. Strategy, information, relationship and idol categories have smaller intent groups; delegation additionally groups purposes. Selection then chooses only missing subjects, conditions, payload and source/attribution. Explicit bluff labels appear before a player fabricates, while NPC cover responses carry no lie-detector label. A resumed transcript renders an already resolved result.

After an answer, follow-ups derive from the resolved act: numbers, reasons, sources, evidence, negotiation, promises, more recruitment, task reports, insurance, loyalty or another topic. Backup and delegation follow-ups select their own appropriate subject rather than silently reusing the primary vote target. Back only changes navigation. End/escape remains visible while transcript and options scroll independently. Group identities wrap; full names remain in transcript and accessible participant labels.

## Persistence and execution

`ConversationSystem.serialize().semantic` owns action receipts/sequence and objective/task execution records. The existing SocialMemory serializer owns claims, conditions, secrecy and history. CampActivity owns the active reservation/checkpoint/transcript, route, scheduled activity IDs and physical state in both camp phases. GameManager's existing ordered save/restore loads these systems together. Old saves without semantic payload get empty new state without losing existing social/strategy/alliance/deal data.

Each meaningful action resolves once using a keyed semantic checkpoint/season seed. The same receipt supplies displayed response, logical stance and follow-ups. Rendering, Back and reload do not reroll or apply effects again. Receipts are bounded to the most recent 500 exchanges; active checkpoint transcript/last outcome persists separately. Task acceptance/execution/report receipts and route goals are persisted, so a mid-route reload continues the same work.

At expiry, #353–#354 still reconsider and converge each individual's actual state. Objective beliefs and public promises do not become ballots. Backups/split assignments/commitments feed the existing model. The only new Tribal execution adapter lets an idol holder consider an accepted protection promise using warnings/positions they personally heard, their character and own danger. It receives no ballot/tally and can decline protection. Existing idol registration, nullification and Deal consequences execute the result.

## Review scope

Dialogue is a finite semantic vocabulary with generated templates, not unrestricted natural-language input. Objectives are bounded round plans rather than a search of every possible future season. Source inference remains uncertain; controlled tests prove mechanisms and isolation, while full-season emergent story quality remains a playtest judgment. No camp rebuild, continuous movement, new UI framework, contestant-data retuning or replacement vote solver is included.
