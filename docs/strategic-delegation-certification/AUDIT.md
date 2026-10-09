# Strategic task reliability audit

Baseline: merged #357, `96e632e0d1b5ea16787e6976e766737f5937d70e`.
This pass preserves #356–#357's architecture and #353–#354's vote authority.

## Production paths and findings

| Finding in #357 | Actual path | Focused correction |
| --- | --- | --- |
| A worker refusing suppressed the underlying purpose/target | `StrategicWorkPlanner.candidates → add`, `StrategicTaskSystem.create/respond`, `StrategicObjectivePlanner.intermediary` | Suppression distinguishes an assignment refusal from a spoken report of target refusal. Only that worker is cooled for the exact question. Other intermediaries and personal work remain available. |
| Different questions collapsed into one purpose/target pair | `add`, objective work receipts, known tasks | Shared work identity includes objective, purpose, recipient, voting subject, primary target, source claim, event, conditions and dependencies. Refusal-induced objective revisions are not “new evidence.” |
| Subjective task reports were checked using generic contact | `reportProposition → evaluateReportEvidence → verifyReport` | Check the actual speech act, audience, subject and information. A check-in is not reassurance, an apology or delivery of a cover story. |
| Records after the report could support an earlier completion claim | `evaluateReportEvidence` | Persist report-time metadata and canonical semantic order; use the request-to-report interval, not the request-to-current-time interval. |
| An old attributed report could be compared with a changed position | Resolver's ordinary `verify` path, typed task reports | Verify the historical statement within the same report window. Later withdrawal does not disprove what was said earlier. |
| Exposure and idol danger shared the split-generation gate | Work planner contingency candidates | Exposure may justify reassurance, decoy or backup. Split requires owned, unchallenged protection evidence and the existing `splitCapacity` arithmetic. Weak hearsay can produce verification first. |
| A late intermediary chain could be physically infeasible | Objective planner execution choice; natural trace inspection | Compare remaining time with minimum request, travel, target-conversation and report reservations. Prefer a feasible personal action or no action. This is a lower bound, not a promise of success. |

## Refusal, attempts and retries

`publicStatus: refused` describes the delegate's answer to the assignment.
It is not evidence of the target's position. A requester-owned report saying
the target refused is a different event. An unreachable target, unfinished
assignment, hedge and conditional answer retain their existing distinct states.

The exact refused worker/question is unavailable for 900 countdown seconds,
measured from the answer (including a later refusal after hedging).
The requester may choose someone else or act personally. Target-refusal reports
cool the exact proposal; active assignments and recent personal receipts still
suppress redundant work. New source evidence, subjects, conditions or objectives
can justify a different question. No refusal remotely changes anyone's vote.

The existing maturation gates, bounded five-candidate list, pending-request
limits, conversation recency, visibility and physical scheduling remain intact.
We did not increase task quotas, loosen convergence or retune contestant ratings.

## Execution evidence and report types

The canonical `SocialMemorySystem.conversationHistory` now carries additive
spoken semantic metadata: listeners, information fingerprint, event, source
privacy and semantic order. Claims retain phase/order through `CampKnowledge`
and `ScrambleStrategy.statement`. These are participant-owned records, not a new
conversation-history authority or a copy of hidden task execution.

| Layer | Meaning | Not implied |
| --- | --- | --- |
| Contact | These people spoke during the relevant interval | The assigned action occurred |
| Attempt | An appropriate semantic action was addressed to the target | Target agreed or believed it |
| Response | The target's actual spoken answer | Private sincerity or final ballot |
| Effectiveness | A delegate's interpretation or supported strategic result | Objective proof that reassurance, repair or deception succeeded |

`TASK_ACTIONS` remains the common player/NPC semantic equivalence contract.
An ordinary eligible action can complete work without a special suggestion or
delegation ID. Subject, requested information and relevant incident must match.
The resulting task receipt stores action, time and response separately.

Typed reports assert contact and attempted work where the account claims it.
Warning and information delivery verify the intended claim; source protection
checks attribution in the target's heard delivery. Recruitment checks attributed
historical speech, not the target's current vote. Bring checks the invitation
and response. Reassurance, repair and decoy effectiveness remain subjective.
“I did not finish/do it” does not claim that no unrelated or partial contact occurred.

## Time convention and persistence

Camp time is **remaining seconds, decreasing**. A record supporting completed
work must satisfy `requestTime >= recordTime >= reportTime`, on the same day
and, when available, phase. Same-tick semantic order must lie after the request
and before the report. The convention is documented beside `withinReportWindow`.
Post-report work cannot validate an earlier completion claim.

Report day/time/order, request order, canonical participant metadata, resolver
exchange order and selected-work receipts serialize through their existing
owners. Missing legacy metadata is optional; old records are not given invented
timestamps, evidence or knowledge. Specific legacy heard deliveries can still
be checked. A generic old conversation is not upgraded into a successful task.

## Fallible discovery and consequences

The evaluator has no trust, vote or reliability effects. The target is asked
through a real semantic conversation. They consult **their own** records and
can give a direct denial, an uncertain recollection, or deliberately cover the
delegate. Clipped earlier history produces uncertainty, not categorical denial.
An absence of records is a fallible recollection, never proof of intent to lie.

Only the account actually spoken reaches the requester. Existing provenance,
source confidence and `learnReportEvidence` decide whether it is a suspicious
inconsistency or credible contradiction. A direct account carries more weight
than hearsay. Trust consequences require owned evidence, are bounded, and are
idempotent on replay. Outsiders do not inherit the dispute. Confrontation and
repair continue through the established action catalog. A target protecting a
delegate may falsely confirm the report without changing their own private vote.

## Authority and limits

The planner plans conversations; tasks schedule real camp execution and reports.
Neither writes ballots. ScrambleStrategy's intentions/convergence and Tribal's
production ballot execution remain authoritative. Alliance/deal ownership,
player choice, paired bring travel, mobile UI and contestant data are preserved.

The natural matrix complements controlled mechanism tests. It is not evidence
that every purpose emerges in every tribe, nor proof that NPCs play perfectly.
See `SIMULATION.md` and `QA.md` for measured outcomes and limitations.
