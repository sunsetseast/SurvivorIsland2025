# Merged #359 implementation audit

Baseline: `a5925cae0d2aeeef94b9e623b6ca8563248edbf5`. Untouched full Node suite: 991 passed, zero failed/skipped.

## Actual production flow

`CampActivitySystem.chooseNext` calls `NpcInitiative.plan`. The coordinator adopts `StrategicObjectivePlanner`/`StrategicTaskSystem` work or selects a bounded social/strategic candidate. `locate` uses co-presence and owner-specific recent sightings. `starting` checks actual presence; travel completes before a reservation. Player approaches create one explicit invitation; NPC meetings reserve actual participants. `ConversationView.startNpc` executes the selected semantic opening through `ConversationResolver` or the existing task/objective adapter. `dialogueOpening` stores an exchange checkpoint. Player actions resolve once, then `afterPlayerAction` may speak a follow-up. `ended` classifies the checkpoint. Canonical statements, obligations and history belong to SocialMemory; individual votes belong to ScrambleStrategy.

NPC/NPC activity completion executes its agenda and reads an independent listener response. The old extra follow-up only handles endangered information-seeking agendas. It does not generally negotiate a refused or conditional proposal.

## Confirmed defects before source changes

| Path | #359 behavior | Required repair |
|---|---|---|
| `afterPlayerAction`: refused reply | Sets `settled`, speaks an alternate pitch, retains original subject | Keep rejected proposal; activate and negotiate alternate |
| `afterPlayerAction`: promise/conditional | Any such action settles current exchange, even about a different subject | Match current proposition; evaluate counteroffers separately |
| `afterPlayerAction`: questions | Repeated generic request for a vote; third action terminates regardless of substance | Track answered questions, distinct arguments, bounded substantive progression |
| `ConversationView.choose`: withheld reply | Target selector runs before resolver, despite subjectless reply being valid | Bypass subject selection for nondisclosure |
| Resolver withheld reply | Uses considering commitment status; subjectless claim cannot enter camp claims | Record nondisclosure about speaker, without vote commitment |
| `respond(private)` | Clears invitation before selecting route; failed route loses invitation | Preflight movement and preserve invitation on failure |
| NPC follow-up transcript | Only initiating line displayed; material non-human responses omitted | Render resolved spoken actions in direction-aware order |
| `canListen` | Only idle or reciprocal wait; ordinary interruptible activities miss opportunities | Allow bounded co-present interruptible opportunity; keep reservations exclusive |
| Urgent activity replacement | Only fresh urgent social candidate; task/objective priority can be starved | Event-driven reevaluation of substantive strategic work |
| Human outcome instrumentation | Settled/unfinished, no progress/resistance distinction | Observe actual response and later explicitly linked action; never infer causal persuasion |
| Human warning/reassurance | Pending-player answer returns before delivering the claim | Deliver the spoken information to its legitimate listener, then await their choice |
| Conditional follow-through | Mature objectives can verify prerequisites, but early coalition formation may not yet meet objective maturity gates | Persist a bounded, physical prerequisite conversation from the actual owned condition |
| Urgent retry | Reprioritization can start a raw plan after initiative adoption rejects its recency | Apply the same semantic retry guard before abandoning current useful work |
| Reply transcript | Resolver falls back to generic action label | Render the actual refusal, consideration or nondisclosure |
| Bounded NPC meeting (candidate certification) | Last spoken continuation can have a resolved answer after the final allowed loop turn, leaving its summary awaiting a response | Consume the already-resolved final answer without another spoken turn; preserve its commitment/condition or close unresolved |
| Public group follow-up (candidate ownership review) | Newly selected NPC continuation names only its primary listener | Include the same reservation's physically present group members, resolve each independently, and exclude unrelated bystanders/reservations |
| Argument novelty (candidate ownership review) | Recipient knowledge used to decide whether a claim is new | Use the initiator's owned record of its prior disclosures; private recipient knowledge cannot alter the initiator's tactic |

## Ownership and compatibility checks

SocialMemory records statements for actual speakers/listeners, strips speaker-only truth markers and uses bounded history. AllianceSystem exposes owner-known rosters and retains formal-alliance authority. StrategicWorkPlanner already recognizes owned conditional commitments and generates verification of the required voter. No extra promise or condition store is needed. Conversation receipts and the production checkpoint already serialize through the existing save contract. Initiative diagnostic history is bounded but currently serialized; profile this separately from essential exchange state.

These are capability defects, not grounds to restore legacy trees or retune contestants. Implementation/reproductions and measured limitations are documented in DESIGN, SIMULATION and QA.

## Reproduction and final implementation

`test/NpcNegotiation.test.mjs` reproduces the original Tony rejection, pending Michele counterproposal, evidence question and conditional answer using production camp, resolver, memory and save/load. It also exercises withholding through the actual View, failed private relocation (including a failed movement commit), urgent work and retry suppression, and NPC/NPC responses. The rendered runner repeats the counterproposal and private-failure paths with long names on all four viewports.

The new `NpcNegotiation.js` extracts bounded exchange bookkeeping from NpcInitiative. It has no independent resolution RNG, knowledge store or vote solver. All newly spoken actions execute through ConversationResolver. Existing `executeAgenda` recruitment/counter-pitch openings retain ScrambleStrategy's original resolved adoption result; the adapter records the actual answer without rolling adoption a second time.

The full diff leaves ScrambleStrategy, StrategicWorkPlanner, StrategicObjectivePlanner, StrategicTaskSystem, AllianceSystem and TribalCouncil unchanged. Existing physical movement and observation remain authoritative. The deliberately expanded no-alliance test retains a newly fragmented seed and demonstrates that informal majority formation remains possible in another fixed seed; see QA and SIMULATION for that intentional behavior change.
