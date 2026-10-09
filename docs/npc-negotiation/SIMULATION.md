# Natural negotiation simulation
## Method and reproducibility

Baseline: merged #359 `a5925cae0d2aeeef94b9e623b6ca8563248edbf5`. Candidate: this PR's final source, including the bounded final-response, group-audience and owner-only novelty corrections. `NpcInitiativeNaturalSimulation` reuses the production-shaped #358/#359 harness. Production camp activity, travel, initiative, conversations, tasks, owned knowledge, objectives, individual strategy and Tribal execute together. No NPC task purpose, objective, commitment, intended vote or final ballot is injected.

The paired matrix uses **10 families × 40 deterministic seeds = 400 cases**, each run against both versions uninterrupted and with production JSON restore: **1,600 scrambles and 800 successful replay comparisons**. The time-pressure family starts in the final six-minute scramble; the other 360 cases include twenty minutes of pre-immunity camp followed by the scramble. Casts use unchanged production data and rotate across seven-, nine- and eleven-person tribes including the human. Initial alliances, relationships and explicitly owned idol/loyalty evidence are recorded as starting conditions. These are fixtures, not scripted outcomes.

Families: stable majority, fragile majority, divided tribe, fluid/no stable alliances, secret coalition, idol concern, betrayal/leaking, time pressure, player on bottom and conflicted loyalties. Seeds are `359000 + 100 × familyIndex + n`, `n=0..39`. Each of the eight player policies appears in 50 cases: passive, loyal, active, deceptive, unreliable delegate, reliable delegate, counter-strategist and survival. Invitation policies configure 320 participation opportunities, 40 rejection cases and 40 deferral cases; passive humans still take no strategic action.

Both source versions run the same knowledge-limited policy/observer. This PR extends the old QA human policy to actually ask for numbers/evidence, consider, condition or reject incoming proposals. It does not assign desired NPC responses. Consequently these are fresh paired #359 measurements, not a reuse of the published #359 totals. Validated source/configuration-matched case results can be resumed; changed candidate source invalidates its cached cases. Exploratory incomplete runs are excluded from the final counts.

Reproduce with a detached #359 checkout and:

```sh
INITIATIVE_BASELINE_ROOT=/path/to/baseline359 INITIATIVE_OUTPUT=/tmp/negotiation-natural node qa/NpcInitiativeNaturalSimulation.mjs
```

`RESULTS.json` retains full aggregate metrics, all case identities/replay verdicts and bounded representative traces. The runner's raw outputs contain per-case counters and traces; bulk case logs/screenshots are not committed. Trace prefixes are bounded and may omit later exchanges; aggregate counters span the full simulation. They should not be read as exhaustive transcripts or causal explanations of human behavior.

## Approach funnel

Tables use **unique intention/stage pairs**. A retry does not create another unique count for that stage, though it remains in event counters. Selected intentions, located targets and completed conversations are separate denominators. Travel is unnecessary for co-present contestants. NPC meetings use actual physical reservations without a human invitation overlay.

### NPC → NPC

| Stage | #359 pre | #360 pre | #359 post | #360 post |
|---|---:|---:|---:|---:|
| motive created | 2,968 | 3,287 | 21,324 | 19,947 |
| intention selected | 2,968 | 3,287 | 21,324 | 19,947 |
| approach planned | 2,749 | 3,116 | 18,781 | 17,527 |
| travel started | 2,290 | 1,871 | 8,617 | 7,893 |
| target located | 332 | 1,279 | 9,117 | 10,428 |
| physically arrived | 332 | 1,279 | 9,117 | 10,428 |
| conversation started | 307 | 1,144 | 8,435 | 9,594 |
| semantic action | 306 | 1,143 | 8,423 | 9,592 |
| response obtained | 306 | 1,143 | 8,423 | 9,592 |
| proposal negotiated | 0 | 0 | 0 | 1,282 |
| followup needed | 0 | 0 | 0 | 9 |
| prerequisite followup | 0 | 0 | 0 | 5 |
| followup initiated | 0 | 0 | 119 | 146 |
| goal advanced | 0 | 0 | 2,888 | 3,079 |
| goal discussed | 307 | 1,144 | 5,547 | 6,515 |
| opportunity missed | 2,496 | 1,972 | 11,317 | 9,541 |
| intention resolved | 300 | 1,131 | 8,377 | 9,523 |
| intention abandoned | 1,818 | 1,250 | 11,086 | 8,255 |
| intention expired | 850 | 906 | 1,861 | 2,169 |

### NPC → human

| Stage | #359 pre | #360 pre | #359 post | #360 post |
|---|---:|---:|---:|---:|
| motive created | 61 | 56 | 1,626 | 1,423 |
| intention selected | 61 | 56 | 1,626 | 1,423 |
| approach planned | 47 | 45 | 986 | 828 |
| travel started | 16 | 16 | 608 | 551 |
| target located | 47 | 45 | 850 | 769 |
| physically arrived | 47 | 45 | 850 | 769 |
| invitation offered | 43 | 40 | 750 | 693 |
| invitation accept | 26 | 25 | 466 | 438 |
| invitation defer | 4 | 4 | 77 | 67 |
| invitation decline | 2 | 3 | 71 | 57 |
| conversation started | 26 | 25 | 466 | 438 |
| semantic action | 26 | 25 | 434 | 407 |
| response obtained | 0 | 0 | 74 | 59 |
| player engaged | 0 | 0 | 0 | 43 |
| player resisted | 0 | 0 | 0 | 53 |
| negotiation followup | 0 | 0 | 0 | 43 |
| followup needed | 0 | 0 | 16 | 6 |
| goal advanced | 0 | 0 | 0 | 0 |
| goal resisted | 0 | 0 | 0 | 20 |
| goal unresolved | 26 | 25 | 449 | 418 |
| opportunity missed | 0 | 0 | 350 | 274 |
| intention resolved | 26 | 25 | 466 | 438 |
| intention abandoned | 17 | 16 | 950 | 776 |
| intention expired | 18 | 15 | 210 | 209 |

## Negotiation quality and influence

| Diagnostic (post-immunity event counts) | #359 | #360 |
|---|---:|---:|
| NPC proposals negotiated | 0 | 1,282 |
| NPC negotiations settled | 0 | 605 |
| NPC negotiations unresolved | 0 | 668 |
| NPC conditional negotiations | 0 | 9 |
| NPC counteroffer-associated negotiations | 0 | 46 |
| Player questions | 79 | 55 |
| Player consideration | 41 | 37 |
| Player conditions | 16 | 6 |
| Player spoken agreements | 3 | 0 |
| Player explicit refusals | 14 | 20 |
| Player active alternate subjects | 0 | 4 |
| Player semantic engagement events | 0 | 61 |
| NPC follow-up speech to human | 0 | 96 |
| Subsequent player actions sharing proposal subject | 10 | 8 |

The candidate's final NPC meeting summaries distinguish settled, unresolved and conditional results. The final already-resolved answer is consumed without adding another conversational turn. Alternate proposals are real semantic actions; a human refusal and subsequent why/condition can address the alternate subject. Controlled tests prove conditional acceptance, rejection, sincere/cover acceptance and later save/load of that proposal.

There are **no human spoken agreements in this candidate matrix**, despite controlled proof that the path works. Human engagement/conditional support occurred, but these conservative scripts often considered or refused. The scripts respond to incoming proposals and task requests with a limited set of actions; they do not exhaust the social/UI options. The candidate also had fewer human meetings, questions and conditions. This is not certified as increased real-human persuasion. No policy or vote was changed to raise the agreement count. Improved classification separates engagement, resistance and condition from settlement; “goal advanced” remains a narrow spoken-agreement classification for humans.

A later action sharing a subject is an observable correlation. It is not evidence that the NPC caused the human's decision. Likewise the NPC `goal_advanced` diagnostic uses its owned account of the listener's position; it is not omniscient proof of successful persuasion or a guaranteed ballot.

## Outcomes and character

| Outcome/constraint | #359 | #360 |
|---|---:|---:|
| Replay-equivalent cases per version | 400 | 400 |
| Player survives | 322 | 320 |
| NPC ballots | 3,202 | 3,202 |
| Ballots matching captured pre-Tribal intent | 2,969 | 2,949 |
| Maximum simultaneous pending intentions | 10 | 10 |
| Impossible travel | 0 | 0 |
| Non-present semantic actions | 0 | 0 |

No survival/blindside quota is enforced. Independent refusals and concessions can fracture a vote. The no-alliance capability fixture retains seed 80's newly fragmented three-of-seven leading plan and demonstrates an informal six-of-seven majority in fixed seed 81. The certified solver is unchanged. The ballot diagnostic compares a captured pre-Tribal intention with the executed ballot; it does not assert that Council preparation can never revise an intention.

Production styles below experienced differing casts/relationships and cannot be treated as an isolated causal experiment. Controlled character tests separately assert profile-dependent flexibility, protection offers, evidence sharing and urgency/pressure; no base ratings were retuned.

| Candidate style | Selected intentions | Conversations | Negotiations | Conditional follow-ups |
|---|---:|---:|---:|---:|
| Competitive | 4,143 | 1,888 | 244 | 2 |
| Lethal Charmer | 4,089 | 1,874 | 212 | 2 |
| Power Player | 4,181 | 1,929 | 189 | 1 |
| Shadow Strategist | 4,114 | 1,807 | 236 | 0 |
| Social Genius | 4,064 | 1,868 | 203 | 5 |
| Wildcard | 4,122 | 1,835 | 198 | 5 |

## Failures, corrections and remaining realism limits

- **Ghost alternate proposal:** #359 settled the original while speaking a decorative alternate. The active proposal now changes, has its own receipt/history and reopens response choices.
- **Unrelated commitment/nondisclosure:** unrelated promises no longer settle a negotiation; withholding conveys only refusal to disclose and renders real speech.
- **Self-citing proof:** the NPC's own pitch is excluded as corroborating evidence. Protected sources remain protected; uncertainty is acknowledged.
- **Lost warning:** human pending-response handling formerly skipped information delivery. An actual warning/reassurance claim now reaches the listener before the explicit human choice.
- **Lost final reply:** an earlier candidate certification found 620 completed NPC summaries still awaiting a reply. Final resolved replies are now consumed; those undecided meetings end unresolved rather than leaving ghost response opportunities.
- **Conditional maturity gap:** a credible unresolved condition can schedule bounded physical prerequisite checks before a high-level objective matures. This does not invent confirmation or force support.
- **Availability loss:** co-present ordinary camp work and bounded waiting reduce missed opportunities. Many encounters still fail because of movement, busy listeners, cooldowns and deadlines; searching remains evidence-based. These failures are disclosed rather than removed by remote tracking.
- **Urgency/cooldown conflict:** fresh substantive owned work can replace routine intent; rejected adoption can no longer bypass retry recency. Travel and protected meetings remain protected.
- **Private relocation loss:** route/time/reservation preflight and rollback retain the original invitation on failure.
- **Audience/novelty ownership:** public follow-ups reach the exact reservation’s physically present group members, while novelty decisions consult only the initiator’s own disclosure history. Bystanders and private listener knowledge remain excluded.

Stable/quiet and fractured games remain possible. There are unresolved negotiations, abandoned/expired intentions and failed player pitches. The matrix is deterministic and production-shaped, but does not replace real human playtesting or validate every possible contestant/history. No hidden vote/position oracle or new agreement engine was added.

## Performance

The full matrix used four workers under mixed concurrent desktop QA load, with source-matched baseline cache reuse. Its runtime measurements are useful cost indicators, not isolated mobile benchmarks.

| Mean per uninterrupted scramble | #359 | #360 |
|---|---:|---:|
| Runtime (ms) | 1,539.69 | 1,746.09 |
| Objective planner calls | 89.97 | 85.34 |
| Peak save JSON length (characters) | 462,590.74 | 478,448.40 |

A separate **ten-case serial paired benchmark**, one active-player case per family (seed `359002 + 100 × familyIndex`), alternated source order after other QA runners finished. Each version again compared uninterrupted and restored runs: 40 additional scrambles and 20 matching replay comparisons. `PERFORMANCE.json` retains its exact per-family measurements.

| Serial mean | #359 | #360 |
|---|---:|---:|
| Forward simulation runtime (ms) | 1,036.39 | 1,028.37 |
| Whole two-run command incl. restore/startup (ms) | 2,516.20 | 2,398.79 |
| Restore processing (ms) | 5.31 | 4.66 |
| Objective planner calls | 86.30 | 87.50 |
| Candidate-generation calls | 9.60 | 9.80 |
| Generated candidates | 47.50 | 48.50 |
| Peak save JSON length (characters) | 443,989.80 | 464,476.00 |

The serial sample shows **0.8% lower forward runtime** and **4.6% larger mean peak JSON length**. This is a small desktop sample, not an iPhone/Safari performance result. The existing size metric counts JSON characters, not UTF-8 bytes. No per-frame all-pairs planner was added. Urgency scans use a derived checkpoint stamp; completed NPC exchanges retain compact summaries while canonical statements remain in memory. More completed semantic interactions have real processing/storage cost; this PR does not claim a speed improvement.
