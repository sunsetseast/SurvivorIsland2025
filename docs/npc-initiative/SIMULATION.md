# Natural approach comparison

## Method and reproducibility

Baseline: merged #358, `6df6d2412e7f6db30e45a34807474a2e3ed004f3`. Candidate: the JavaScript implementation in this PR. `qa/NpcInitiativeNaturalSimulation.mjs` runs the existing #358 `StrategicDelegationNaturalSimulation` harness against two source roots. It adds observers and explicit, player-owned-information-limited attention policies; it does not inject NPC intentions, task purposes, commitments, final ballots or desired outcomes.

There are **400 paired cases: 40 seeds in each of ten families**, with baseline/candidate and uninterrupted/JSON-reloaded versions: **1,600 scrambles, 800 replay comparisons**. Seeds are `359000 + 100 * familyIndex + n`, `n=0..39`. The eight policies rotate five times per family. Cases ending in 7 reject attention and those ending in 9 defer; other participating policies accept. Passive humans never accept. The pressure family starts directly in a six-minute scramble; the other families include 20 minutes of pre-immunity camp followed by the ordinary scramble. Six/eight/ten-NPC casts rotate actual production contestants and their unchanged gameplay attributes.

Families: stable majority, fragile majority, divided tribe, fluid/no alliances, secret coalition, idol concern, betrayal/leaking, time pressure, player on the bottom, conflicted loyalties. Policies: passive, loyal, active, deceptive, unreliable delegate, reliable delegate, counter-strategist and survival. Starting relationships, formal alliances, owned rumors and occasional actual idols are labelled in each result's initial conditions. These are seeds, not scripted strategy outcomes.

The real CampActivitySystem, SocialMemory, ConversationResolver, strategic objective/work/task planners, ScrambleStrategy and Tribal systems execute. NPCs travel, reserve actual conversations, independently respond, report and reconsider. Human policies navigate from owned sightings, use ordinary semantic actions, explicitly answer assignments and may ignore or misreport. Candidate policies can additionally use the new initiating negotiation's consider/refuse/cover responses. Thus this is an end-to-end feature comparison rather than a claim that the human has identical UI capabilities in both versions.

Run:

```sh
INITIATIVE_BASELINE_ROOT=/path/to/merged-358 \
INITIATIVE_OUTPUT=/tmp/npc-initiative \
INITIATIVE_SEEDS=40 node qa/NpcInitiativeNaturalSimulation.mjs
```

`RESULTS.json` retains all 400 seed/policy cases, aggregate counters, deterministic state hashes, owned starting conditions and ten truncated example traces (40 events each). Full individual receipts/traces remain reproducible through `--case` on the existing harness. Raw logs and screenshots are not committed. The frozen simulation source fingerprint is recorded; only invitation text contrast CSS changed afterward, with final rendered QA rerun. JavaScript behavior is unchanged.

## Comparable observations

These counters observe actual production activity and semantic receipts in both roots. A semantic action is not necessarily a separate meeting. Travel counts below include travel attached to intended social/strategic encounters, not just successful meetings.

| Observation, all 400 cases | #358 | Candidate |
| --- | ---: | ---: |
| Pre NPC→NPC semantic actions | 2,458 | 890 |
| Post NPC→NPC semantic actions | 12,659 | 8,554 |
| Post NPC→player invitation instances seen | 1,627 | 841 |
| Post explicitly accepted player meetings | 1,253 | 461 |
| Post NPC→player semantic actions | 1,205 | 529 |
| Pre candidate player invitations / accepted meetings | unavailable | 48 / 26 |
| All physical movement starts | 51,082 | 52,216 |
| Impossible travel / non-present spoken actions | 0 / 0 | 0 / 0 |
| Objective planner calls | 45,584 | 36,002 |
| Task records / reported tasks | 155 / 43 | 223 / 78 |
| Reports delivered / task follow-ups | 28 / 39 | 54 / 62 |
| Target changes | 1,621 | 1,311 |
| NPC ballots matching final certified intention | 3,038 / 3,202 | 2,970 / 3,202 |
| Player survived | 315 / 400 | 322 / 400 |
| Exact production JSON replay | 400 / 400 | 400 / 400 |

The headless harness does not render #358's pre-immunity phase/navigation/timer overlay. Its pre-immunity human invitation burden is **unavailable**, not zero. Candidate pre-immunity invitations execute through physical simulation and explicit policy choice.

Post player attention instances fell from 4.07 to 2.10 per case. The passive policy received 127 total pre/post attention instances across 50 cases and accepted none; NPCs still completed their games. Overall candidate attention peaked at ten instances in a case. These are inline pending opportunities, not forced modals or automatic conversations.

Fewer conversations are not automatically a regression or an improvement: the candidate no longer selects remote listeners through live location knowledge, observes recency and can fail to locate people. Increased task reports coexist with fewer ordinary exchanges. Movement rose 2.2%; intention alignment fell from 94.88% to 92.75%. Tribal/certified convergence mathematics was not changed. The lower alignment is disclosed rather than tuned away; idols, deception and individual decisions still affect ballots. Player-bottom survival fell from 17/40 to 16/40, while time-pressure survival rose 27/40 to 29/40. Survival is not a target metric or a guaranteed player rescue.

## Complete candidate funnel

Baseline has no equivalent named intention stages, so those columns are not invented. Counts include retries and follow-up actions; they are not a single monotonic set of unique intentions. Public observers count each invitation activity ID once, whereas coordinator counters also include re-offers.

| Stage | Pre → NPC | Pre → player | Post → NPC | Post → player |
| --- | ---: | ---: | ---: | ---: |
| Motive selected / target chosen | 2,968 | 61 | 21,335 | 1,618 |
| Physical attempts planned | 6,864 | 55 | 37,475 | 1,691 |
| Travel edges started | 3,182 | 32 | 23,765 | 2,032 |
| Target physically located | 332 | 55 | 9,199 | 996 |
| Invitation offers | n/a | 49 | n/a | 849 |
| Explicit accept / defer / decline | n/a | 26 / 6 / 2 | n/a | 461 / 139 / 71 |
| Conversations started | 307 | 26 | 8,445 | 461 |
| Coordinator semantic actions | 306 | 26 | 8,554 | 429 |
| Responses observed | 306 | 0 | 8,554 | 114 |
| Goal advanced | 0 | 0 | 2,889 | 0 |
| Goal discussed / unresolved | 307 | 26 | 5,556 | 445 |
| NPC follow-up actions | 0 | 0 | 121 | 0 |

A human listener's resolver placeholder is **not** counted as a human answer. Explicit task responses and genuine player semantic replies are counted separately. A social exchange can be discussed without strategic advancement. Formal alliance effects also remain their own canonical pathway rather than manufactured generic action receipts.

The large gap between plans and arrival is real: listeners move, remain busy, sightings age, deadlines arrive and invitations go unanswered. In bounded example traces, opportunity misses include 5,116 moved and 2,371 busy cases (these are truncated-trace samples, not global totals). Failed searches stop rather than magically succeed. Maximum pending intentions was ten, one per NPC; maximum task queue was four. There is substantial remaining opportunity loss, particularly during the short pre-camp window. This PR does not call every failed approach a success or remove physical constraints to inflate a funnel.

## Discovered pathologies and fixes

| Finding | Semantic cause | Fix |
| --- | --- | --- |
| Routine strangers repeatedly crossed camp | A selected social idea justified searching even without a sighting | Routine motives wait for legitimate sightings and yield to camp work; nearby opportunities outrank speculative routes |
| Two NPCs waited for each other indefinitely | Each interruptible waiting activity was classified as a busy listener | Co-present mutually waiting contestants may reserve one actual conversation |
| Fresh warning remained behind routine work | Selection occurred only when an unrelated activity naturally finished | A meaningful semantic checkpoint can replace old routine work with new owned urgent evidence; important work/travel/reservations stay protected |
| Human paired walk was overwritten | Normal player block scheduling treated paired initiative travel as interruptible | Paired travel remains exclusive and restores its existing graph route |
| Old invitation returned after current invitation cleared | Legacy fallback was read when the new authority legitimately held null | Legacy invitation migrates once; null is authoritative afterward |
| Second approaching NPC stranded the first speaker | Concurrent attention could replace invitation ownership | First attention stays exclusive; second waits and retains/abandons its own need |
| Source/numbers questions left NPC passive | Only opening action was checkpointed | Bounded initiating negotiation persists semantic replies and follow-up requests |

No contestant attributes, vote math, task purpose scoring or challenge rules were globally retuned. Controlled convergence fixtures use refreshed deterministic seeds after the changed scheduling stream (rejected human pitch 70, successful autonomous underdog 26, no-alliance formation 80). Assertions remain real persuasion, physical legality and ballots; natural case outcomes are never selected to guarantee success.

## Character, costs and limits

All six styles participated. Candidate invitation offers: Social Genius 137, Power Player 189, Shadow Strategist 135, Competitive 145, Wildcard 131, Lethal Charmer 161. Semantic actions ranged from 1,484 to 1,595 by style. These are aggregate opportunities, not archetype quotas or proof that any style always behaves one way. Controlled tests additionally verify actual privacy, risk, flexibility and social-drive weighting. Relationships, owned evidence and timing can override tendencies.

Mean uninterrupted runtime under concurrent QA load increased **1,224 ms → 2,001 ms** per whole simulated phase sequence. Total recorded serialization bytes increased **143.8 MB → 184.9 MB** across repeated checkpoints (not a single save); roughly **359.6 KB → 462.3 KB per case** in that metric. Planning is bounded at semantic checkpoints, not rendered frames. This is a real overhead; no physical mobile runtime benchmark was taken. JSON comparisons include reservations, locations, activities, knowledge, tasks, objectives, negotiation receipts, trust, intentions, ballots and RNG, with only wall-clock metadata excluded.

The matrix supports lawful encounters, continuity, bounded queues, explicit consent and functioning independent NPC games. It does not prove perfect Survivor play, human-perceived realism, or physical iPhone performance. Some useful approaches fail; pre-immunity opportunity loss and the runtime cost remain review concerns. Serious new evidence, task refusal, conditional support, counterplay and deceptive human behavior are covered without scripted winners.
