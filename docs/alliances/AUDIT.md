# Alliance audit and implementation boundary

Baseline main: **364fdeaa6d17f20dc3e301b648c0e1023e621302**, merged #350. #341–#350 remain foundations. The baseline suite passes **458/458**. [Baseline source inventory](BASELINE-SOURCE-INVENTORY.md) records every production match for `areAllied`, committed-alliance state, cohesion, sincerityMap, leaderId, alliance targets, and the alliance/dialogue/deal branches. Line numbers in that inventory refer to the baseline, not this branch.

## Active baseline paths

| System | Actual baseline path | Overhaul integration |
| --- | --- | --- |
| AllianceSystem | create/normalize, active roster, pairwise cohesion, real/fake sincerity, exclusive NPC commitment, direct add/remove/disband, exact-ballot fallout | Replaced by coalitions with individual state, beliefs, plans, bounded history and lifecycle; compatibility queries remain. |
| DealSystem | accepted/proposed pair promises; final pacts and voting/protection terms inspected against deciding ballots; swap/merge/elimination expiry | Keep explicit promises distinct from relationships; link endgame pacts; initial assignments, conditional idol opportunity and actual information delivery. |
| DealConsequencesSystem | accepted/refused/completed/broken event listeners apply trust and betrayal memories | Objective breach alone causes no social penalty; owned credible evidence applies directional consequences once. |
| ConversationSystem | player alliance topic/menu/invitation; NPC alliance-intent acceptance; formal coalition deals; post-immunity semantic adapter | All social formation routes require contact and consent. Legacy NPC intent may consent only for the pair; absent thirds become pending recruitment. Bounded group speakers use individual #350 state. |
| ScrambleStrategy | owner statements, intended votes, promises, backups, split assignments; autonomous group positions | Keep original persuasion calibration and individual intentions. Extend agendas with offers/recruitment/repair/reunion; fake members can make cover statements without adopting a real vote. |
| ScrambleActivityPlan | physical travel, reservations, invitation, gathering and meeting resolution | Need-driven meetings, personal overlap choice, actual attendees, real multi-speaker player participation. |
| StrategyPhaseSystem | semantic phase adapter, individual-intent maps, target board and compatibility allianceTargets | Only negotiated current-round coalition plans contribute the alliance projection; no member vote overwrite. |
| SocialMemorySystem | owned claims, observations, source chains, invitation recap and betrayal history | Coalition roster claims, disclosure, rumor provenance and objective references use the same memory. Listener copies omit speaker hidden truth. Legacy fake player recap markers migrate away. |
| RelationshipSystem / TrustSystem | existing pair relationships and symmetric trust | Existing relationships unchanged. Trust adds owned directional overrides for learned betrayal; symmetric base updates preserve those offsets. |
| CampInteractionSystem | witnessed presence, departures, overhearing and actual conversation evidence | Reused unchanged. Repeated owned observations can support tentative coalition inference, without querying hidden alliance objects. |
| CampPresentation | physical presence/activity groups; private groups read as talking quietly | Reused unchanged. NpcAutoRenderer adds a Join affordance only for a known coalition whose meeting actually invited the player. |
| TribalCouncilSystem | `_inSameAlliance` membership suppression, direct #350 intention weight, rocks concession ally check | Narrow voter-perspective affinity replacement; preserve intention weighting and every resolution/presentation path. Snapshot usable idols before existing plays for contract evaluation. |
| TribalKnowledgeModel | own alliance fact plus strategic facts; membership formerly expanded fact audiences; active engine deal statuses | Owner DTO roster facts; actual conversation participants only; owner-perceived deal promises persist after an unknown objective breach. |
| Alliances/Create/Manage overlays | member circles with repeated numeric strength; multi-select immediate create; commit and leave mutate world | Owner notebook, qualitative read, overlap cards, private name, conversation starter and private distancing; social changes through dialogue. |
| SeasonEngine swap / merge | tribe membership replacement, swap/merge events, new relationships; alliance objects largely untouched | Preserve alliance histories and priorities, mark separation dormant, reunion requires actual contact. Offscreen alliance resistance uses voter affinity. |
| GameManager elimination / Tribal completion | removes contestant from tribes; canonical outcome and deal/alliance fallout; retries | Member lifecycle/leader cleanup and activity cleanup. Persist partial completion stages so restore resumes without duplicated social fallout. |
| Save/load | JSON system serialization, survivor/location canonicalization, active semantic reservations | Alliance v2 migration plus pending consent, exclusions, round commitments, beliefs, histories, IDs and counters; no DOM stored. |

## Active versus compatibility code

The active post-immunity route is the #349 semantic camp activity adapter and #350 `ScrambleStrategy`/conversation checkpoint. Wall-clock strategy beats/watchers are already inert. `StrategyPhaseSystem` retains old lock-in/administrative strategy dialog definitions, meeting aliases and target maps for old callers/saves; the semantic startup does not use them. They are not a second alliance planner.

ConversationSystem is a large mixed-generation dialogue module. Its alliance topic and formal coalition offer entry points are active. The old invitation response is now a routing wrapper; legacy NPC intent acceptance is explicitly guarded by contact/individual consent. Old invitation construction/evaluation/portrait helpers and generic administrative alliance target helpers remain compatibility material; they no longer create an alliance from a selected roster. `areAllied` remains a membership/claim convenience in old greeting, topic and dialogue scoring branches. Tribal scoring, camp partner preference and useful strategic information sharing use explicit affinity instead. The older global-cohesion menu/recommit implementation has been replaced, not merely hidden by CSS.

`createAlliance`, `addMember`, `removeMember`, `disbandAlliance`, `commitToAlliance`, the committed-ID map and aliases remain engine/import compatibility APIs. They are not permission for an overlay to manufacture social consent. `getCommittedAllianceId` projects current highest priority; the map and SocialMemory committed-ID mirror are not the strategic source of truth. `memberIds`, sincerityMap, targetId and leaderId are compatibility projections. `getSharedAlliances`/`areAllied` do not mean protection from a vote. New strategic consumers must use voter affinity and owned evidence.

## Verification of the 33 reported baseline issues

| Issues | Verified finding on current main |
| --- | --- |
| 1–3 | The roster/type/leader/cohesion/sincerity/target record has no per-member commitment/priority/loyalty. `ensureNpcCommitments` ranks and selects one ID; sincerity is real/fake. |
| 4–5 | `areAllied`, Tribal `_inSameAlliance`, generic meeting scheduling and membership knowledge use active shared roster rather than the voter's sincerity/priority. |
| 6–7 | Cohesion is relationships plus exact-ballot penalties. Add/remove recompute it. **Qualification:** #350 deserialize already restores finite saved cohesion after normalization; reload alone is not the claimed overwrite bug. |
| 8 | Four type labels largely share runtime membership/cohesion behavior; no voting-bloc expiration. |
| 9–13 | Starter selects portraits and directly creates; absent third parties can join from a dialogue roster; existing allies are filtered; Manage removes immediately and offers exclusive commit. |
| 14–15 | Each member shows identical numeric cohesion. Global roster/sincerity are available to management logic; active-member display is not an individual belief model. |
| 16–18 | Existing physical observations/provenance are strong foundations, but no sustained coalition suspicion projection. Scheduling happens because an active object exists, with insufficient personal overlap arbitration. |
| 19–21 | #350 autonomous meetings already collect everyone's positions. Interactive meeting reserves extras while largely talking to one NPC. Old menu reassurance is scripted and prioritization uses group cohesion. |
| 22–23 | New semantic agendas lack rich formal coalition formation/recruitment; older NPC alliance offers exist in compatibility dialogue and need integration/fake consent privacy. |
| 24–25 | Leader comes mainly from creation order and removal does not deliberately replace it. Add/remove are immediate state mutation. |
| 26–29 | Elimination/swap/merge do not maintain a deliberate coalition member/lifecycle model. A bloc can remain active indefinitely. |
| 30–31 | Fallout reads exact deciding ballots, penalizes votes against shared-roster members and minority targets. It does not compare negotiated split assignments. **Qualification:** alliance fallout primarily changes global cohesion/notes; it does not itself create a per-owner betrayal belief. Those global changes can still leak through strength UI. |
| 32 | Deal break events can apply trust/betrayal consequences from exact engine attribution without victim evidence. |
| 33 | SHARE_INFO and IDOL_PROTECTION have type labels but no complete outcome obligations in the main Tribal evaluator. |

## Model and semantics

Old: one alliance object with roster, type, active flag, leader, cohesion, real/fake map and optional target; an NPC commitment ID chooses one group.

New: alliance identity/type/secrecy/lifecycle, active-roster projection, memberStates, bounded history, private labels, linked promises, roundPlan and pending consent. Each member has status, sincerity, commitment, priority, loyalty, willingnessToDefect, influence, belief in activity, perceived health, joined/contact dates and last plan support. Values are bounded internal state, never numeric player UI. History adjusts existing stability; roster mutation cannot rebuild away earned fallout.

Overlapping pair/core/majority relationships have independent priorities. Type seeds expectations without guaranteeing loyalty. Core is durable, Final Two/Three links explicit pair promises, voting bloc expires after its Tribal, temporary cooperation can become dormant. Lifecycle includes active/strained/dormant/fractured/disbanded; pending proposals represent forming relationships without prematurely creating membership. Dynamic influence orders participation; leaderId is repaired on departure/elimination and is not command authority.

Affinity combines the **voter's** sincerity/commitment/priority/loyalty/defection state and their owned roster belief. Fake membership gives very small protection. An excluded member can still sincerely protect someone who has secretly cut them out; informed exclusion supporters stop doing so. A hidden fake offer can be accepted as a real social relationship while remaining weak for its proposer. No player recap labels it fake.

Round plans describe attempted coordination, not actual votes. The existing individual minds remain authoritative. Group meetings produce multiple public positions, independent responses, objections, commitments, backups and accepted split assignments. Tentative consideration is not a binding promise. After Tribal, engine outcomes and assigned-plan defection references remain objective; only credible owned attribution changes trust or creates perceived betrayal. Wrong blame may change an owner's trust without changing actual voter history. One missed meeting does not identify betrayal.

Formation is physically gated; semantic conversation choices are replay-safe and completion charges camp time once. Candidate recruitment is a separate response; rejection belongs to the approacher. Exclusion needs a real present subgroup and appropriate support; the absent target's belief/read remains intact. Names entered in Manage are private notebook labels. Deliberate disclosure/denial travels through owner-scoped claims; a leak does not inform the other partner.

SHARE_INFO fulfills after both parties actually deliver relevant information. It does not breach from unknowable withholding. IDOL_PROTECTION distinguishes a delivered warning from an explicit play-on-partner obligation; an idol play obligation can breach only when the protected player is endangered and the holder actually has a usable idol. Unspecified old terms remain advisory instead of inventing an impossible obligation. Formal high-stakes promises use DealSystem; informal reassurance stays in memory/statements.

## Save migration and limits

Old memberIds/type/sincerityMap seed states; existing finite cohesion is preserved exactly. Legacy commitment supplies an initial priority hint once/idempotently, not exclusive loyalty. targetId becomes a legacy-unconfirmed plan hint; no invented split assignment or betrayal history. New saves retain coalition history, member beliefs, pending offers/recruitment/exclusion, secrecy, influence, round assignments, processed references and completion stages. Existing camp/strategy serialization retains meeting/reservation checkpoints.

This is bounded authored dialogue and heuristic coalition behavior, not a political party simulator or endgame solver. There is no external AI, contestant-specific production behavior or production-attribute change. Suspicion currently groups repeated observations of the same roster; it does not solve arbitrary overlapping partial sightings. Fracture thresholds and motives are contextual heuristics, not calibrated population forecasts. Final Three uses linked pair promises. Voting information breaches require owned evidence; absence of disclosure is not psychic proof. Initial negotiated ballots drive compliance; revote renegotiation is a future refinement.

Recommended next post-immunity pass: richer conversational negotiation of renewed blocs and revote assignments, wider production-season seeds to evaluate long-term coalition survival, and owned explanations of missed meetings/partial sightings. Keep those changes in the existing semantic camp, memory and individual strategy architecture.
