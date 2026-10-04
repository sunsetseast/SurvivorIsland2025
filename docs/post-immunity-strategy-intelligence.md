# Post-immunity strategic contract

Baseline: main **699624e719c3875f62916b3d1de9e44b33cd0877**, merged #341–#349. This builds on the [semantic scramble architecture](post-immunity-scramble-architecture.md). It does not replace its clock, physical activity system, routes, presence contract, or phase lifecycle.

## Runtime audit and ownership

The active path is challenge result → PostChallengeEventSystem/return events → StrategyPhaseSystem activation → CampActivitySystem semantic boundaries → ScrambleActivityPlan located travel/conversations/meetings → individual intent projection and target board → owned post-challenge summary → existing TribalCouncilSystem. CampScreen reentry and production restore retain the same phase; no new heartbeat or real-time progression is introduced.

| Component | Authoritative responsibility after this change |
| --- | --- |
| StrategyPhaseSystem | Phase lifecycle, initial valid target selection, rich strategic reality, validated intent writes, facts, alliance/board compatibility projections, Tribal handoff |
| ScrambleStrategy | Individual preference/vote/commitment, audience statements, motives, contextual adoption, backup/split plans, owner-specific read projections and semantic conversation checkpoints |
| ScrambleActivityPlan | Persisted autonomous RNG, physical partner/approach planning, gathering/meeting scheduling and resolution at camp boundaries |
| CampActivitySystem / CampPresence | Sole activity clock and actual physical world: movement/arrival, co-presence, participants, reservations, cancellation and once-only conversation billing |
| ConversationSystem / ScrambleConversation | Existing interactive dialogue renderer plus contextual semantic choice adapters; formal deal/alliance menus remain compatible |
| SocialMemorySystem / CampKnowledge | Sole owned information store and read projection; claims, observations, audience/source chains, confidence, contradictions and source reliability |
| CampSocialResolution | Unchanged pre-immunity exchanges; active losing-tribe post-immunity exchange delegates to the single strategic agenda |
| SocialEngine | Existing pre-immunity behavior and compatibility dialogue support; independent POST_CHALLENGE chatter remains disabled by #349 |
| AllianceSystem / DealSystem | Existing membership, sincerity, formal persistent deals and post-Tribal resolution; optional explicit IDs/RNG make conversation creation repeat-safe |
| TribalCouncilSystem | Existing ballot math, direct intent weight and weaker target-board influence. No voting or ritual rewrite |
| TribalKnowledgeModel | Imports additional owned statement topics, preserving private/rumor visibility and actual recipient boundaries |

Audit of writes/read paths: Strategy's `updateNpcIntentTarget` remains the validated intent write boundary. Seeding supplies the initial preference. Autonomous activity resolution formerly picked another action/target, overwrote the speaker, rolled listener trust, then invoked an unrelated CampSocialResolution exchange. It now resolves one agenda or a meeting with each attendee's position. Main post-immunity NPC openings and Strategy/Gossip/Idol/Confront routes use the semantic adapter; accepted legacy counter entry points delegate into it. Old NPC response builders, target pitch menu internals and pre-camp dialogue remain compatibility/pre-immunity code, not an additional autonomous strategy engine.

#349's real-time strategy beat/final reroll, independent post chatter, personal-target lock/final lock and separate alliance lock-in remain disabled/demoted. No path is reactivated here. The `npcIntentTargets`/`npcIntentMeta` maps and `allianceTargets` remain save/API compatibility state; actual rich individual intended votes drive `getNpcTargetIntent()` and the board's individual input. SocialMemory's older target preference/request and generic promise formats remain readable, but are not globally treated as current majority knowledge.

## Reality, statement, knowledge, commitment and plan

`StrategyPhaseSystem.reasoning.states[id]` is a dedicated phase structure, not extra permanent Survivor fields:

| Concept | Meaning |
| --- | --- |
| `preferredTargetId` | Personal preference, retained when persuasion changes the actual vote |
| `intendedVoteId` | Current actual intended ballot, including an accepted split assignment |
| `committedTargetId` | Actual commitment; acknowledgement/hedging alone does not set it |
| `pitchesByAudience` | What was most recently said to each audience; never implicitly overwrites the private vote |
| `promises` | Informal statements made to recipients, including conflicting promises |
| `backup` / `splitPlan` | Known backup/trigger or individual/full split knowledge, separate from compliance |
| `decoys` | Speaker-owned false plan, audience, purpose, origin and phase expiry; hidden from listeners |
| `confidence` / `flexibility` | Bounded settlement and willingness to reconsider using existing traits |
| `perceivedMajority` / `safetyBelief` / `urgency` | Derived from owned information and remaining semantic time, not the true global vote distribution |
| `lastContacts` | Semantic recency preventing one person monopolizing approaches |

Example: Sandra prefers Tony, intends Michele, and reassures Tony. The reassurance is an audience-scoped safety statement. It changes neither Sandra's preference nor actual vote. Tony owns what Sandra said and an initial confidence; he does not receive her hidden `reassurance_lie` marker.

`getNpcTargetIntent(id)` still returns `{ targetId, confidence, reason, updatedAt }`, projected from actual intention with immunity validation. The player may have no current intent. A truthful explicit player commitment sets mutable current intent; a bluff records the promise without changing it. The actual player ballot remains a later Tribal choice.

## Motives and coherent conversations

Planning evaluates a bounded motive against available physically present people: recruit swing, verify an alleged source, warn an endangered ally, reassure the target, distribute a decoy, establish backup, counter-pitch, check loyalty, or gather information. Candidate scoring uses the speaker's trust, owned commitments/evidence, urgency and 420-second semantic contact recency. Approaches are ranked, not first-in-array selection. The existing physical route and reservation must complete before dialogue begins.

An agenda records purpose, initiator/listeners, subject, desired outcome, known evidence IDs and message mode. A conversation resolves this agenda rather than combining a random pitch and unrelated gossip/intent injection. Verification checks the alleged source's own statement history; they can confirm, deny or knowingly continue a lie. Final minutes raise urgency and strengthen an already matching plan; there is no final random target reroll.

Adoption considers personal preference, current vote, commitment, target relationship, trust, message credibility, known vote viability, flexibility, safety/urgency and remaining time. Small uncertainty comes from persisted semantic RNG. Response levels are refusal, hedge, openness and commitment. Positive acknowledgement need not change a vote. No exact probabilities or numeric effects appear in the dialogue.

Autonomous alliance meetings first record all attending positions, then each member weighs the information they actually heard. Outcomes can be consensus, tentative consensus or disagreement. Only an actual majority projects a target into the existing alliance bridge. Preferences are retained. Owned idol risk can lead to a backup/split proposal; dissent remains possible. Interactive multi-speaker negotiation is deferred, while existing ConversationSystem group reservations allow individual pitches/promises and bounded backup/split proposals now.

## Provenance and deception

Statements use SocialMemory claims with actual audience, immediate speaker, alleged original source, capped source chain, speech act, semantic time and per-listener confidence. Firsthand observation, direct statement, relayed hearsay, inference/speculation and deliberate fabrication stay distinct. The hidden false marker remains only with its speaker. Relays strip it; overhearing still requires the inherited physical/privacy rules and rare semantic roll.

Player options explicitly support truthful commitments, owned story sharing, speculation, fabricated-source warnings, false vote promises and idol bluffs. Contextual confrontation requires owned evidence or an explicit bluff. NPCs can float decoys and falsely reassure a target. No name-specific AI branches or personality calibration were added.

Initial credibility uses trust, source reliability, the existing deception/delivery trait, listener skepticism and contradictions with owned evidence. The engine's truth flag is not an input. A lie can initially be believed; a weak statement can remain uncertain. A credible denial by the alleged original source can later discredit the relayer, only for listeners who actually hear that contradiction. Equal conflicting accounts create uncertainty rather than deciding hidden truth.

Vote reads count latest owned accounts by alleged voter/source and permit uncertainty or no answer. They never read other NPCs' actual intentions or the target board. Target-name gossip uses the same owned evidence. Pair claims require witnessed togetherness, hearsay or an alliance the speaker belongs to. Opinion topics use the speaker's own assessments/relationships and are labeled opinions. Idol possession uses `ownsUsableIdol`; search admissions use durable actual search history. Whether the NPC admits that history is a separate strategic response, resolved once. Searching, observed searching, hearsay suspicion and possession never become synonymous.

## Backups and splits

Backups have a primary, alternative, informed participants and bounded trigger: suspected idol, target awareness, invalid primary or lost believed votes. Knowledge alone is not consent. Activation notifies only co-present informed people and preserves an unrelated individual plan. An informed ally elsewhere can react only when they independently obtain the trigger. Uninformed contestants never switch telepathically.

A split records intended counts and individual assignments. Full-knowledge members retain both targets/assignment map; other informed members retain their own assignment. Assignment is not compliance: a participant may reject, accept or later defect. Current Tribal receives actual individual intentions, not the plan's ideal counts. Player proposals use owned plan information or the player's optional current intent, never another NPC's hidden vote.

## Save, replay and RNG

Strategy serializes rich state, plans, statement outcome IDs and diagnostics beside #349's phase/planner state. IdolSystem adds bounded per-person count/latest search history, preserving history across camp-phase resets. Old saves migrate existing intent maps; they do not invent a player commitment or confirmed idol history.

CampActivity's existing reservation includes a small checkpoint: activity/NPC/group/location identity, purpose/agenda, captured semantic RNG seed, resolved choices, covered topics, emitted statement/commitment IDs, turn count and last continuation line. No transcript HTML, DOM, dialog state or focus is serialized. Production restore closes UI but keeps occupancy; Resume rebuilds context. Resolved choices return the prior result without trust changes, statements, promises, facts, rerolls or extra time. Closing bills the existing reservation once. Formal deal/alliance IDs, RNG and timestamps are semantic within the scramble; their APIs and ordinary outside-phase behavior remain compatible.

The autonomous planner retains its persisted RNG. Meaningful dialogue uses deterministic keyed draws from the saved reservation seed/activity/choice identity; choosing the same option after restore cannot reroll it. Cosmetic legacy wording is not guaranteed deterministic.

## Player recap boundary

The read-only recap projects player-owned statements/warnings, personal observations, known contradictions, promises made/to the player, their own mutable intent and their actual formal deals. It neither initializes unseen owners nor reads other contestants' intent/hidden truth/private alliance membership. The existing summary adds human-readable heard information and promises. Full Before Tribal presentation, legacy Journey metric categories and polished wording remain a later UI pass.

## Next recommended pass: strategic intent and conversation refinement

The requested primitives now exist; deeper strategy can refine their interactions without adding another heartbeat. Useful next work: nuanced promise strength, loyalty/viability estimates, negotiated backup triggers, interpretation of changed minds versus deception, careful leak-test propagation, decoy expiration before phase end, probabilistic voter-specific warning/reassurance wording and more sophisticated player-on-bottom counters. The current bounded adoption model allows escape or failure; it is not a coalition solver. Source denial can mislead an honest listener too. Narrative and recap wording should communicate that uncertainty. Cosmetic fallback lines and non-strategic legacy exchanges remain candidates for the later conversation/UI pass.

## Upcoming dedicated Alliance overhaul

Preserved APIs/data reveal these remaining weaknesses: sincerity is largely a real/fake flag; membership and target projection do not model alliance priority, overlapping cores, suballiances versus temporary voting blocs or secrecy norms deeply. Invitations/removals, outsider discovery, leader/equal influence, fractures/defections, alliance-specific promises, cohesion, betrayal and post-Tribal lifecycle need their own pass. Autonomous meetings now allow distinct positions, but interactive discussion still addresses one primary speaker with reserved companions. Full multi-speaker group UX is deliberately deferred. Backup/split knowledge primitives are available for the overhaul; an alliance object no longer needs to erase individual preferences.

DealSystem remains formal/persistent, while informal promises remain statements. Existing Vote Together/Mutual Protection/Final Two resolution is preserved. SHARE_INFO and IDOL_PROTECTION fulfillment semantics remain incomplete and belong in the Alliance/Deal pass. No new automatic formal deals are generated by autonomous NPC agendas.

No contestant ratings, camp economy/work coefficients, calibrated behavior profiles, Strategy baseline target-selection math or Tribal voting/ritual math were tuned. No external AI, new memory database, continuous movement engine or UI framework was introduced.
