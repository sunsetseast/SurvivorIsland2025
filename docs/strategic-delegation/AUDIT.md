# Autonomous delegation baseline audit

Baseline: current main `96f0b377a3159eb044c73b7a3581de934b748d67`, merged #356. This is an intelligence/continuity extension of that architecture.

## Actual production pipeline

CampActivitySystem.chooseNext → StrategicObjectivePlanner.plan (semantic scheduled activity boundary) → evaluate → ScrambleStrategy.refresh/planSupport → establish an objective without `work`. The planner compares self with owner-trusted intermediaries. A chosen human uses approach_player → actual graph travel → ScrambleActivityPlan arrival/invitation → ConversationView.startNpc → objectives.execute → ConversationResolver.delegate → StrategicTaskSystem.create. Only the co-present spoken request creates the task; humans explicitly respond.

Accepted NPC work goes through StrategicTaskSystem.plan → legitimate location/search → camp travel → execute → shared taskAction/resolver → independent target response/receipt → travel to requester → report. Human work appears in existing TaskSystem/CampScreen Strategic Requests, receives a first contextual suggestion, and equivalent normal semantic actions produce the same receipt. Requesters learn spoken reports; objective evaluation uses owned claims and public task acceptance.

## Production writers and gaps

| Field/path | Baseline production writer | Finding |
| --- | --- | --- |
| objective.work | establish accepts optional work; evaluate calls establish without it | No normal situation-to-work producer exists. PlayerStrategicRequestHarness explicitly assigns work for the purpose matrix. Historical saved/explicit work remains executable. |
| requestedAction | ObjectivePlanner.plan uses work.purpose, otherwise recruit or secrecy/connection-based bring | Ordinary objective delegation is recruit/bring. |
| requestedAction | ConversationView.choose selects any TASK_PURPOSES entry | Player manual delegation supports all 15; this is player agency, not autonomous policy. |
| requestedAction/task creation | ConversationResolver resolves delegate/bring; tasks.create stores requested purpose and owned context | Mechanism supports all 15, but does not choose strategic needs. |
| contingency | ObjectivePlanner chooses objective_backup/objective_leak_test on explicit objectives | These are personal semantic actions, not general delegated backup/leak work. |
| short-term agenda | ScrambleStrategy.agenda identifies verify_story, warn_ally, establish_backup, check_loyalty, spread_decoy, reassure_target, gather_intel, share_intel and alliance_repair | Useful existing motives, normally acted on directly; not translated into delegated work. |

Natural baseline delegated purposes: **recruit, bring**. The other thirteen can be player-requested, restored, or explicitly supplied by tests/explicit callers; baseline tests injecting work do not prove autonomous generation. No other runtime writer of work was found in repository searches. NPC openings and old approach intentions may warn/pitch/share, but do not supply objective.work.

## Needs, evidence and phase boundaries

| Existing purpose | Need / owned evidence | Phase / personal-work consideration |
| --- | --- | --- |
| recruit | Missing support for owned intended target | Post urgency; early discussions remain hypothetical. Direct influence may beat delegation. |
| verify_vote | Hearsay/conditional/challenged voter account; no fresh direct firm confirmation | Post; ask the actual attributed voter, never hidden vote. |
| verify_rumor | Weak/conflicting idol/safety/alliance claim | Either phase; actual owned claim required. Protect attribution when needed. |
| warn | Credible owned danger concerning a valued ally | Either phase; personal warning when urgent/sensitive. |
| reassure | Owned fear/wavering/suspicion, relevant alliance/cover need | Either phase; do not reassure everybody. |
| decoy | Existing cover strategy, nervous target, plausible alternate | Post; avoid without concealment need. Honest characters resist. |
| gather | Important unknown connection/voter, missing useful account | Either phase; quiet social information before immunity. |
| bring | Need for private group coordination, dissent/conditional support or distributed connections | Either phase; arrival is not agreement. |
| repair | Owned real conflict with strategically valued person | Either phase; personal apology preferred when responsibility is personal. |
| pass_info | Owned relevant claim and an ally who has not legitimately heard it | Either phase; recipient knowledge must be inferred from owned audience/source evidence. |
| check_loyalty | Owned alliance doubt/dissent/contradiction | Either phase; no private alliance priority lookup. |
| backup | Owned idol/awareness risk, actual primary and available alternate | Post; existing strategy owns proposal/activation. |
| split | Owned risk plus sufficient directly confirmed coalition for existing opposition/minimum arithmetic | Post only; a task cannot manufacture numbers or consent. |
| leak | Deliberate cover/information-control need, owned story, appropriate risky character | Post cover; never random purpose selection. |
| protect_source | Important owned information, legitimate recipient need and real secrecy/source obligation | Either phase; do not reveal protected attribution through UI. |

Social Genius emphasizes gather/verify/repair/reassure; Power Player emphasizes recruit/verify/contingency and may take over; Shadow Strategist emphasizes intermediaries/source protection/loyalty/information control; Competitive emphasizes useful ally warnings/direct practical work; Wildcard weighs alternatives/leaks more strongly; Lethal Charmer emphasizes reassurance/selective disclosure/social connectors. Circumstances, trust, reliability and urgency still decide.

## Continuity gaps

Bring currently returns coming/ask_why/later/refused, but recordOutcome sends ask_why/later to awaiting_report. Generic follow-ups do not answer the specific request. Reports mostly store text; recruitment has a commitment/refutesClaimId dispute path, other purposes lack comparable verifiable propositions. Generalizing these needs owned claims and preserved negotiation state, not an omniscient comparison to task execution.

The new work layer must remain a bounded need selector within ObjectivePlanner. It must never write a ballot, auto-answer a human, read another contestant's private task mode, or teleport information. Player-selected purposes remain unrestricted by autonomous preferences.

## Completion trace

The implementation adds StrategicWorkPlanner.candidates between objective evaluation and intermediary selection. It replaces the generic recruit/bring default and the old separate objective-only backup/leak branches with context-derived work routed through existing taskAction/ConversationResolver. Explicit/restored work remains compatible. All fifteen purposes now have situation-derived coverage without objective.work; a non-explicit mature verification objective additionally exercises the full physical human approach/accept/perform/report pipeline.

The audit also found that pre-immunity CampActivitySystem completion did not execute selected objective/task conversations, despite its scheduler calling the planner. That completion now uses the same executor after actual arrival and holds the existing physical conversation reservation for an incoming player invitation. Safe tribes/pre-immunity do not generate immediate vote verification or numerical split assignments.

Reports now preserve contact/delivery assertions separately from impressions, plus actual heard answer references. Bring retains asking_reason/maybe_later with specific continuation. Source breaches and report contradictions enter owned canonical evidence; no requester reads hidden task execution. See [ARCHITECTURE.md](ARCHITECTURE.md) for ownership/bounds and [QA.md](QA.md) for exact coverage and rendered evidence.
