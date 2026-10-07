# Strategic work intelligence

This extends merged #356. ConversationResolver still resolves spoken actions, StrategicTaskSystem still owns requests/execution/reporting, SocialMemory still owns beliefs, and ScrambleStrategy still owns intentions and convergence. No ballot writer, contestant-data retuning or new task framework is introduced.

## Identify the need before choosing the messenger

StrategicObjectivePlanner asks the small, stateless StrategicWorkPlanner for useful next work at camp activity boundaries. The selector reads the owner's last 80 owned knowledge entries, current-day accounts, owned incidents/observations, own alliance affinity and publicly known assignment/report history. It considers at most six general connections, four recent useful information items and twelve incidents; returns the five strongest needs; then compares a single need's recipient against self and eligible intermediaries. It does not evaluate all pairs every frame.

Each candidate has an existing purpose, recipient, optional voting subject/primary target, owned claim/event references, required knowledge, dependency references, reason, secrecy need and a semantic deadline. Temporary value, visibility and urgency weights choose a job; they are removed from the saved selected job. Selection uses no random purpose sampling.

| Purpose | Reason for generating it |
| --- | --- |
| recruit | A relevant independently willing voter is missing |
| verify_vote | A needed account is secondhand, challenged or conditional; fresh direct firm support prevents redundant verification |
| verify_rumor | An important owned idol/safety/alliance account is weak or conflicting; credible returned verification suppresses repeated checks of the same answer |
| warn | Owned credible danger concerns a valued ally; delivery carries the actual attributed evidence |
| reassure | Observed nerves or wavering threaten an alliance or concealed move |
| decoy | A concealed move has a nervous target and an available cover target |
| gather | A potential connection lacks a useful read |
| bring | A connected/conditional person needs a private meeting |
| repair | A real incident damaged a useful relationship; personally responsible owners favor direct repair |
| pass_info | A useful ally has not legitimately heard an important account |
| check_loyalty | Owned alliance doubt/exclusion warrants a conversation |
| backup | Owned idol/exposure risk calls for an available alternative |
| split | Owned risk and directly confirmed coalition accounts pass the existing opposition/minimum arithmetic |
| leak | A believable owned alternate story supports a deliberate cover need and the character tolerates the risk |
| protect_source | A useful account needs distribution under a real secrecy obligation |

The selector never looks up a target's secret idol, private objective, future ballot or hidden task outcome. Split capacity is a read-only ScrambleStrategy helper given the owner's confirmed accounts. Proposing a split or backup still runs the existing resolver and requires individual responses; a meeting creates no shared brain or consensus.

## Self, NPC, human, or wait

Intermediary weights include owner trust, own alliance affinity, owned alignment, witnessed/reported connection to the recipient, known reliability, prior refusals, known workload, secrecy risk and character delegation/visibility preferences. There is no human bonus or blanket archetype gate. Social connectors can be better intermediaries for any character; sensitive, urgent or personally owed work can remain personal. If a bringing organizer goes personally, the resulting meeting discusses the plan directly rather than asking somebody to visit the organizer who is already there.

Social Genius emphasizes private verification, relationships and reassurance; Power Player emphasizes commitments/contingencies; Shadow Strategist emphasizes intermediaries and source protection; Competitive values shields and useful allies; Wildcard weighs risk/alternatives; Lethal Charmer weighs cover and relationship leverage. These are weights from existing character profiles, not forced scripts.

Two known pending assignments bound divided labor. Pending bring work gives the requester a bounded wait at the meeting location. Recipient recency, intermediary recency, recent-work receipts, already relayed equivalent claims, reported completion and refusal suppress repetition. Strong personally confirmed plans with no owned risk quiet down. A new report or contradiction changes the next need; conditional prerequisites use the existing owner-specific condition evaluation. No unrestricted dependency graph is introduced.

Ordinary post-immunity objectives retain #356's maturation boundary (confident own move plus personally heard support); explicit proposals can start sooner. Pre-immunity and safe-tribe work stays social/informational. No precise split, immediate vote verification, recruitment or cover campaign emerges there. CampActivitySystem now routes pre-immunity objective/task activities into the same semantic executor after real arrival. An approaching NPC reserves the existing conversation, offers the existing invitation and leaves the human's task response explicit.

## Bring negotiation

The existing come_with_me action stores asking_reason, maybe_later, ready_to_walk or refused. A question is not failure. Known reason, truthful vague explanation, admitted uncertainty, respected secrecy, owned safety evidence, additional owned information, explicit bluff and backing off are available only when meaningful. The first contextual task options contain the clarification.

The listener reconsideration uses the resolved initial context, not a second independent roll. Tried explanations are removed while the question is unresolved. A later invitation has a semantic cooldown and reevaluates changed circumstances. NPC delegates use the same options; privacy-respecting fallback does not silently reveal the protected reason.

Revealing a protected known reason forwards the actual request as an attributed claim. Secrecy use-without-name is enforced even for an otherwise allowed recipient. Only the delegate privately owns their violation initially. A story returning to the requester can produce the existing low-confidence leak inference; it does not remotely announce guilt. Fabrications remain claims to listeners.

Accepted bring work continues through #356's paired graph travel, task arrival and group-conversation offer. Save/load retains both travelers. Moving requesters are not teleported or located through hidden information. An arrival does not assign anybody a vote.

## Reports, evidence and continuity

StrategicTaskReports constructs a machine-readable task_result proposition from the spoken report: delegate/recipient/requester, request time/day, contact/delivery/invitation assertions and optional impression. Information-delivery assertions concern the assigned story, not any unrelated chat. Source protection can be contradicted by attribution the recipient actually heard.

Reassurance, repair and decoy success are interpretations. Their claimed contact is verifiable, but a difference in feelings is not proof of a lie. Truthful reports forward only answer claim IDs already owned by the delegate, preserving attribution, hearsay, conditions and refutation references. This lets verified idol evidence or a voter's answer alter the requester's next work. False reports never create target conversations or acquire target evidence.

When physically asked to verify a report, the target responds from their own claims/history. They can also strategically misrepresent their answer. The requester learns only the resulting statement. A source denial can create owned task_report_dispute evidence: suspicious_inconsistency or credible_contradiction, confidence and evidence IDs. Weak hearsay has mild reliability impact; stronger direct evidence may upgrade it. Credible contradiction affects trust and future delegation but does not prove intent to deceive.

Owned disputes rank a real confrontation. Human recipients can admit, stand by the report, explain a misunderstanding or apologize using the actual incident. The existing repair/confrontation engine records those actions. Truthful failure is distinguished from refusal or accepted-but-admitted unfinished work; hidden ignored/execution state never penalizes a remote requester.

## Persistence and ownership

Existing conversation serialization stores tasks, objective records, selected semantic jobs, work receipts, pending negotiation/base result/tried explanations/retry time, execution and answer receipts, reports and dispute confidence. Existing SocialMemory stores obligations, attributed statements, incident/evidence chains and long-term source reliability. Old records use optional defaults; no new save framework or unrelated migration is needed.

The existing player Strategic Requests and assigned-request views remain projections of legitimate knowledge. They show no ranking score, private sincerity, hidden objective or execution mode. Manual player delegation still supports all fifteen purposes independently of autonomous policy. Back, rendering and replay never perform an action; resolved action IDs reuse receipts.

The planner influences individual intentions only through actual conversations. ScrambleStrategy remains authoritative for adoption, commitment, split/backup activation and #353–#354 convergence. Tribal executes those final individual intentions.
