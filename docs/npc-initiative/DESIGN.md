# Autonomous social initiative

## One approach lifecycle

`ConversationResolver.initiative` owns a bounded `NpcInitiative` coordinator. It selects and remembers an intended interaction; it does not resolve dialogue, create private knowledge, choose ballots, or duplicate objective/task planning. CampActivitySystem asks it for a plan at semantic activity boundaries, executes graph movement, validates availability and reserves the actual meeting. ConversationResolver resolves spoken actions exactly once. SocialMemory/CampKnowledge remain the canonical owners of claims, promises, observations and provenance.

The lifecycle is identified → seeking opportunity → traveling / waiting → invitation or NPC meeting → conversation → response → resolved, follow-up needed, abandoned or expired. One meaningful active intention per NPC is allowed. Historical intentions are bounded to 80, trace entries to 500, and current-day recency to 240. Candidate scores are derived and are not saved.

Both phases use this lifecycle. The pre-camp phase/screen/midpoint invitation generator and the routine 600-second scramble invitation scheduler no longer initiate encounters. Compatibility fields can be loaded, but cannot independently issue approaches. Specialized AllianceSystem group gatherings and ordinary shared camp work remain intact.

## Motives and targets

Existing StrategicObjectivePlanner/StrategicWorkPlanner/StrategicTaskSystem plans enter through an adapter into the same physical lifecycle. They retain authority over useful strategic work and its execution/reporting. Ordinary post-immunity motives reuse ScrambleStrategy.agenda. Pre-immunity candidates use owned danger, contradictory claims, witnessed repeated meetings, real remembered conflict, alliance opportunities and meaningful lack of contact. Social check-ins are genuine connection opportunities, not guaranteed manipulation.

The coordinator evaluates at most six socially relevant listeners at a semantic boundary. Trust, closeness, existing character profiles, owned evidence, intended target, prior contact, visibility, remaining time and physical opportunity affect ranking. Human and NPC listeners share selection rules. No human preference or hidden future ballot is added. A private motive, spoken proposition and hoped-for result are stored separately; only the spoken words and visibly requested privacy are shown to the player.

Routine motives wait for a sighting when a listener's whereabouts are unknown, then return control to ordinary camp work. Known nearby opportunities outrank speculative expeditions. Important objective work and urgent evidence may justify a bounded search. A new credible warning can replace an old routine activity at a semantic checkpoint; trivial repeat motives cannot bypass recency.

## Location and opportunity

`locate()` accepts actual co-presence or the actor's same-day arrived/departed/work/seen-together observations from the last 900 countdown seconds. A witnessed departure records direction, not magical presence at the destination. Remote live coordinates are not a planning oracle. The engine can check actual arrival legality, but planning estimates use owned locations or a conservative search allowance.

At most two common camp search locations and three attempts are permitted. Missing/moving targets cause waiting, another legitimate sighting, or abandonment; they never trigger infinite tracking. Busy listeners cannot be reserved in parallel. Two NPCs waiting for each other can speak only once they are truly co-present. If another NPC already holds the human's attention invitation, a second arriving NPC waits without overwriting it.

CampActivitySystem remains authoritative for in-transit absence, routes, time, interruptibility, paired travel and exclusive reservations. No spoken action occurs before actual arrival. Private relocation requires explicit human choice and a real paired graph walk; arrival presents attention again rather than auto-starting dialogue.

## Invitation and player agency

The camp renders a compact inline nearby cue/attention card, not an automatically opening modal. It identifies the approaching contestant and shows what they actually said. Talk now, Give me a minute and Not right now remain pending until chosen. A quiet/private invitation may offer Walk somewhere quiet. Incoming attention never hijacks an existing conversation, player travel, non-interruptible activity or camp event.

Deferral retains the meaningful need and permits a later attempt without an arbitrary relationship penalty. Decline records an observed dismissal and lets the NPC reconsider alternatives. A deliberately rude dismissal can have a bounded, character-aware social consequence. Important objective work stays unresolved if the player declines before a task was even requested; no phantom refusal/acceptance is created.

The old 1.8-second acceptance timer is removed. Compatibility/debug overlay presentation also requires explicit choice. Screen navigation no longer starts a legacy pending meeting.

## NPC initiative in dialogue

ConversationView.startNpc executes the offered semantic opening and checkpoints an initiating negotiation. Responses include asking why, asking for real numbers, considering, declining, a firm or conditional promise, and explicitly labelled player bluff agreement. Conditional support uses canonical promise conditions. A lean/refusal/withholding `reply` is a semantic response without manufacturing a promise or ballot.

The NPC answers questions through existing resolver knowledge and can make one bounded follow-up commitment request or a character-sensitive alternative after resistance. A negotiation permits at most three follow-up rounds. Settled, conditional and unresolved responses stop repeated pressure. Back/render/reload do not re-execute speech. The player can change topic or leave at any point.

A condition-pending intention can later generate one fresh follow-up when the initiating NPC legitimately owns evidence that the condition became true and the same target remains relevant. It cannot silently decide that the human agreed. Task assignments continue through the existing Accept / Refuse / Hedge and Strategic Requests flows.

## NPC/NPC and groups

The same selected intention becomes an actual physically reserved NPC meeting. Its agenda/task/objective executes through existing ConversationResolver, ScrambleStrategy and StrategicTaskSystem. Listener evaluation remains individual. The listener may refuse, hedge, conceal, lie or counter. An endangered contestant can use a bounded counter-pitch during an existing meeting when its owned position supports one.

Bringing people together and formal alliance meetings keep their existing physical and independent-stance contracts. Arrival is not consensus. The coordinator does not become another group agreement engine.

## Privacy and continuity

Approach movement is observable through existing camp observations. Witnesses may know who approached whom or left together, but not unoverheard content or private motives. Source disclosure is still a resolver/knowledge action, and secrecy obligations remain canonical. UI never displays private intention IDs, evidence ratings, hidden targets, sincerity or manipulation labels.

Intention outcomes distinguish advanced, resisted and discussed goals based on actual semantic results and owner-known positions. Accepted/refused/hedged delegation responses are linked only after a real task conversation. Finishing an ordinary camp activity does not erase an important intention. Elimination, phase change, obsolete objective, impossible timing or bounded failed opportunities expire it.

## Save/load and authority

The existing conversation engine payload includes the additive initiative state: selected intentions, context/evidence IDs, invitations, recency, bounded trace and sequence. Camp activities retain intention IDs and paired routes. Reservations checkpoint NPC negotiation, conditions, transcript and resolved action receipts. Legacy scramble invitations migrate only if there is no new initiative state; an empty current invitation cannot resurrect an old one.

JSON replay preserves pending consent, movement, waits, refusals, deferred meetings, negotiation rounds, conditions and semantic receipts. Restoring a UI does not reopen an unrelated conversation, teleport anyone, reroll a reply or duplicate promises. The objective/work/task systems and social memory retain their own save ownership.

No code here writes a Tribal ballot. ScrambleStrategy intention/commitment and the certified #353–#354 convergence remain authoritative; a spoken promise can still be cover or can be broken.
