# Natural delegation certification

## Method

`qa/StrategicDelegationNaturalSimulation.mjs` runs the existing production
Living Camp, semantic resolver, objective/work/task planners, SocialMemory,
ScrambleStrategy and TribalCouncilSystem together. It reuses the Living Camp,
scramble and Tribal QA harnesses; it is not a parallel game engine.

There are 400 paired cases: **40 seeds in each of 10 families**, and five cases
per player policy in each family. Each version also runs a JSON-restored replay:
**1,600 complete camp/Tribal executions** in the comparison. The baseline is
merged #357 (`96e632e0d1b5ea16787e6976e766737f5937d70e`). Candidate source is
frozen before execution. Results carry a digest of the entire production `src`
directory; aggregation rejects mixed-source versions and missing replay success.

Seed ranges are `358000–358039`, `358100–358139`, through
`358900–358939`. Casts rotate through actual `GameData.getSurvivors()` records,
with 6, 8 or 10 NPCs plus the player. All six production gameplay styles are
represented. Their ratings are not retuned. Natural setup seeds social history,
formal starting alliance memberships and, in two families, explicitly attributed
owned information. It never assigns `objective.work`, task purposes, intentions,
commitments, final votes or a desired winner.

The camp runs 20 minutes of pre-immunity activity followed by a 60-minute losing
tribe scramble (six minutes in the time-pressure family). The production phase
seeder establishes initial NPC preferences. Existing planners subsequently make
their own choices. The actual Tribal runner resolves votes, idols and elimination.

| Family | Seeded starting condition; not scripted outcome |
| --- | --- |
| Stable majority | Public majority-sized alliance and compatible social history |
| Fragile majority | Smaller secret core; additional votes must come from outside it |
| Divided tribe | Two competing groups |
| Fluid | No formal starting alliances |
| Secret coalition | Concealed NPC coalition; outsiders are not given membership knowledge |
| Idol concern | One owner has weak hearsay or stronger observed protection evidence; actual possession is separately seeded in the stronger cases |
| Betrayal/leaking | Overlapping groups and a prior attributed loyalty concern; no leak or defection is forced |
| Time pressure | Competing groups with only six scramble minutes |
| Player bottom | Low player relationships and a majority-sized NPC group; no ballot against the player is forced |
| Conflicted loyalties | Overlapping player/NPC alliances |

## Player policies and information boundaries

Passive does not act strategically. Loyal follows owned coalition information.
Active asks, pitches, delegates and follows up. Deceptive uses cover promises,
owned leaks and false reports. Unreliable may accept and leave work undone.
Reliable attempts the assignment and reports its real result. Counter tries an
alternative to the heard leading story. Survival seeks a plausible alternative
outside the player's own alliance.

These are deliberately limited policies, not an omniscient optimization bot.
They use player-owned claims, observations, personal membership and public cast
eligibility. They respond explicitly to physically received invitations. They
do not inspect private NPC objectives, hidden commitments or unknown alliances.
Normal semantic actions, reservations and real travel execute their choices.
An unreliable player's private Ignore does not notify the requester.

## Measurement and replay

QA observes production planning calls, candidate reasons/evidence, selected work,
self/NPC/player execution choice, semantic responses, travel, reports, intention
changes and final ballots. No observer changes the planner's choice. Generated
counts are candidate **appearances**, not unique tasks or quotas; selected counts
can include continued attempts to obtain a physical opportunity. Task execution
events, unique attempted tasks, reported tasks and expired work are separate.

Only participants can execute recorded semantic actions. Departure is checked
for in-transit absence. All tribes have unique IDs. Candidate lists and queues
are bounded. The complete comparison checks every successful JSON replay's
knowledge, task/objective state, reservations, positions, claims/receipts, trust,
intentions, ballots and semantic RNG state. No comparison equates a report with
hidden success.

Checkpoints are outside the production call stack; restoring inside a resolver
would leave stale local references and is not a legitimate save boundary.
Observed boundaries include objective start, intermediary/delegate travel,
incoming approach, pending/accepted request, response/report/dispute, backup,
last five minutes and before/after Tribal. Not all rare boundaries occur naturally
in every family; `SUMMARY.json` gives exact observed coverage. Controlled suites
add bring negotiation, paired travel and dispute restoration.

The JSON payload is the production save payload. The inherited QA harness pins
the legacy global random stream and clock separately for repeatable experiments;
it does not introduce a new production RNG/save architecture. Save comparisons
normalize cosmetic duplicate tribe-member references, legacy NPC location copies
and absent/false event flags. Authoritative residency, player location, active
activities and semantic state remain in the comparison. This is not a promise
that unseeded browser randomness will be identical across real reloads; resolved
semantic choices must remain durable and do not reroll.

## Results and interpretation

| Measured result across 400 cases/version | #357 | Candidate |
| --- | ---: | ---: |
| Successful whole-scramble JSON replay | 400 | 400 |
| Actual task records | 125 | 116 |
| Unique tasks attempted through conversation | 52 | 49 |
| Tasks with at least one spoken report | 42 | 41 |
| Final `reported` task status | 28 | 27 |
| Expired task records | 92 | 86 |
| Assignment answers: accepted / hedged / refused | 109 / 9 / 5 | 103 / 9 / 3 |
| Candidate appearances / candidate calls | 17,952 / 3,735 | 18,032 / 3,749 |
| Objective planner calls returning no dedicated work | 43,060 / 45,016 | 43,068 / 45,020 |
| Largest candidate list / camp-wide pending queue | 5 / 4 | 5 / 4 |
| Same worker/question repeated within 900 seconds | 0 | 0 |
| Verification selected despite matching direct firm information | 2 | 2 |
| Recorded same-work intermediary changes | 2 | 1 |
| Travel edges / detected impossible departures | 51,767 / 0 | 51,638 / 0 |
| Persistent NPC intention / initial ballot diagnostic agreement | 3,012 / 3,200 | 3,013 / 3,200 |
| Strict initial-vote majority outcomes | 278 | 277 |
| Player survived | 292 | 292 |
| Backup plans / activations / split plans | 8 / 1 / 0 | 8 / 1 / 0 |
| Mean / p95 uninterrupted runtime, ms | 841.19 / 1,767.25 | 827.41 / 1,689.50 |
| Largest production JSON payload, bytes | 590,111 | 612,166 |
| Total measured restoration time, ms | 2,147.70 | 2,074.49 |

Task generation/selection is **not** the whole NPC game. Production's ordinary
ScrambleStrategy actions also ran: candidate metrics include 891 story-verification
attempts, 1,935 ally-warning attempts, 495 decoy statements, 715 deliberate lies,
99 plan leaks and 821 discovered statement contradictions. Those are not
automatically classified as delegated tasks or discovered task-report lies.

Ten objective work purposes appeared as candidates, nine were selected, and six
had task-linked attempt events. No natural delegated repair, decoy, split, leak
or protected-source work was generated in this matrix; bring appeared three
times as a candidate but was not selected. There were **zero** observed task-report
disputes or fabricated task reports. The engine's ordinary deceptive play is
real, but these runs alone do not certify delegated-deception discovery rates.
The controlled all-purpose and false-report suites cover those mechanisms.

The adverse result is retained: task completion/report counts fell slightly,
and observed reassignments fell rather than rose. The physical deadline gate
removes some chains before they can be accepted/refused. We do not claim that
fewer events demonstrate stronger strategy; the refusal fix is substantiated
by the real replacement-approach regression scenario. Most tasks still expire,
so the comparison does not establish universally reliable task execution.

| Candidate player survival by family | Survived / 40 |
| --- | ---: |
| Stable majority / fragile majority | 40 / 38 |
| Divided / fluid | 35 / 32 |
| Secret coalition / idol concern | 28 / 18 |
| Betrayal-leaking / time pressure | 26 / 22 |
| Player bottom / conflicted loyalties | 19 / 34 |

All corresponding baseline survival counts are identical. Across 50 cases per
policy, passive/loyal/active/deceptive/unreliable/reliable/counter/survival counts
are 41/35/38/35/33/37/34/39. Different seeds/casts are assigned to the policies:
these are **not** evidence that being passive is a better strategy. Active human
actions total 501; passive performs none. Only one actual incoming human task
request and acceptance occurred; two player-intermediary approaches were selected.

| Production style | Selected self work | Selected intermediary work |
| --- | ---: | ---: |
| Social Genius | 141 | 15 |
| Power Player | 166 | 23 |
| Shadow Strategist | 140 | 25 |
| Competitive | 161 | 20 |
| Wildcard | 187 | 26 |
| Lethal Charmer | 172 | 14 |

The Shadow Strategist delegated a larger fraction than the Social Genius or
Lethal Charmer; the Power Player selected more vote verification than either.
These are descriptive production outcomes, not rigid scripts or statistically
matched personality experiments. Sparse private objective work makes strong
claims about source protection or archetypal deception unjustified here.

The retained machine-readable results are `results/SUMMARY.json`,
`results/SEEDS.json` and ten representative traces in `results/TRACES.json`.
Summary definitions state exactly what each metric counts. Full bulky transient
logs and screenshots are not committed. Trace truncation is recorded explicitly,
not presented as a complete life history.

The comparison is a correctness/continuity certification, not a ranking of
“perfect Survivor play.” Reports and task volume can decrease when infeasible
chains are rejected. A stable plan need not generate additional errands.
Actual ballot agreement with a persistent intention is diagnostic: the certified
Tribal/convergence resolver may legitimately adapt at execution. We do not force
ballots to equal an objective or change its existing arithmetic to raise a metric.

## Detected pathologies and focused changes

* Refusal paralysis: controlled production-shaped traces demonstrated that a
  worker's refusal could erase useful work. Exact assignment identity and
  worker-specific cooling preserve the need and allow replacement/personal work.
* Chronology inversion and generic-contact proof: controlled tests demonstrate
  late or unrelated contact incorrectly supporting an old success account.
  Canonical semantic receipts and the request-to-report interval fix the cause.
* Late chains: natural traces showed an assignment starting when the minimum
  request/travel/exchange/report chain could not finish. The planner now checks
  that lower bound. It does not assume where a hidden target will move next.
* Protection/exposure confusion: suspicion is not a reason for a precise idol
  split. Owned protection evidence and existing capacity are now both required.
* Late hedge refusal: cooling is measured from the actual later refusal, not
  the original request, and survives JSON restoration.
* Harness defect, not gameplay defect: an initial rotation stride repeated
  contestant IDs in larger tribes. A coprime stride and uniqueness assertions
  corrected the fixture before certification. Mid-call restoration was also
  removed; comparisons use legitimate between-event checkpoints.

No base contestant ratings, majority solver, task-success quotas or broad
strategy weights were tuned. Existing mature-objective and quiet-plan gates
remain intact. The full suite also caught an import cycle in the initial travel
check; querying the existing CampActivity instance removes that regression.

## Limitations

Natural rare work is genuinely rare: this matrix is not designed to manufacture
all 15 purposes. Existing production-shaped **controlled** circumstances cover
all 15 and character weighting, while this matrix tests unconstrained outcomes.
It cannot substantiate population-level claims about blindside quality, leak
discovery, conditional promises or split success when those events did not occur.
There is no invented “successful blindside” metric based only on an elimination.

Some accepted work remains unfinished or expires. That includes passive human
targets, ignored work, lost opportunities and deadlines; expiry is not silently
upgraded into target refusal or success. Natural human intermediary requests
and report disputes are too sparse here to certify their frequency or strategic
quality statistically. Controlled physical and epistemic tests remain essential.

The policies are simple, single-round experiments at day seven, not human
playtesting or a full-season realism study. Starting relationship history is
seeded, not generated over six full episodes. Style totals reflect different
production contestants/situations, not perfectly matched archetype experiments.
Desktop CPU timings under concurrent QA are not iPhone performance measurements.
Actual device/Safari/touch testing remains outstanding.

## Reproduce

```sh
git worktree add --detach /tmp/survivor-baseline-357 96e632e0d1b5ea16787e6976e766737f5937d70e
DELEGATION_SEEDS=40 \
DELEGATION_BASELINE_ROOT=/tmp/survivor-baseline-357 \
DELEGATION_OUTPUT_DIR=/tmp/survivor-delegation-358 \
node qa/StrategicDelegationNaturalSimulation.mjs
node qa/SummarizeStrategicDelegation.mjs \
  /tmp/survivor-delegation-358/results.json /tmp/survivor-delegation-summary
```

Run against a fixed checkout. Successful identical-source/job replay results
can be resumed; changed source invalidates that version's cached case.
