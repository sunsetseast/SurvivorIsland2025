# First-day validation

## Exact automated results

Node 24.19.0, Linux. Base is merged #360, `f0ef5f78e352bf57da5007c31ba94c0f8d9fb9da`.

| Command | Passed | Failed | Skipped |
|---|---:|---:|---:|
| Baseline `node --test --test-concurrency=2` | 1042 | 0 | 0 |
| Candidate `node --test --test-concurrency=2` | 1052 | 0 | 0 |
| Focused command below | 319 | 0 | 0 |
| `node --test test/FirstDayExperience.test.mjs` | 10 | 0 | 0 |

Final supplemental full-suite duration: **60,393.143439 ms**, again 1052/0/0. Focused rerun: **2,508.997443 ms**, again 319/0/0. Earlier original full/focused durations were 118,576.812255 / 4,383.151621 ms under different desktop load; no speedup is inferred from that difference. The focused tests are a subset, not an extra total. No existing Node assertion was removed or weakened. `git diff --check` passes.

```sh
node --test --test-concurrency=2 test/FirstDayExperience.test.mjs test/ConversationSemantics.test.mjs test/ConversationIntegration.test.mjs test/ConversationDelegation.test.mjs test/PlayerStrategicRequests.test.mjs test/StrategicTaskContinuity.test.mjs test/StrategicTaskReliability.test.mjs test/NpcInitiative.test.mjs test/NpcNegotiation.test.mjs test/PreImmunityCampContracts.test.mjs test/CampPhysicalPresence.test.mjs
```

Ten new tests cover wrong historical recipient, legitimate hearsay's original recipient, six-candidate unfamiliar-person eligibility, mentions versus actual contact, same-tick post-report speech, changed-mind historical promises after production JSON restore, distinct deterministic social voices/replay, direct warning uncertainty/source protection, numeric tribe standings and a read-only zero-clock render. The recipient defect and clock-start side effect failed against the baseline before the fixes.

An intermediate full run exposed a factual-rumor verification regression and an overly broad post-immunity listener-pool change. The factual-versus-attributed-speech boundary was corrected, and the pool change was restricted to pre-immunity. Existing task-purpose and vote-convergence assertions pass unchanged.

## Rendered checks

Playwright with actual Chromium headless shell **155.0.8059.39**. All runners exercise **375×812, 430×932, 844×390 and 1280×800**.

| Runner | Reported coverage | Errors |
|---|---:|---:|
| `qa/FirstDayExperienceRenderedQA.mjs` | 20 grouped checks: 4 production new-season paths + 4 controlled projection checks + 4 first-challenge outro checks + 4 occupied-rail jungle menu checks + 4 three-tribe journey opening checks | 0 |
| `qa/ConversationRenderedQA.mjs` | 136 checks | 0 |
| `qa/NpcInitiativeRenderedQA.mjs` | 56 checks | 0 |
| `qa/NpcNegotiationRenderedQA.mjs` | 72 checks | 0 |
| `qa/ScrambleExperienceRenderedQA.mjs` | 89 checks, 20 scenes, 6 rendered playthroughs | 0 |
| `qa/ScrambleRenderedQA.mjs` | 44 grouped checks, 3 playtests | 0 |
| `qa/LivingCampRenderedQA.mjs` | 168 scenes, 5 playtests | 0 |

These runners use different reporting units; do not add scenes to assertion counts. The new production paths create a season using ordinary controls, handle optional leadership choices, select a role, enter camp, open a profile, take paid routes, and exit the beach dialog by button/Escape with restored focus. The empty-location check is a deliberately configured fixture. Portrait and landscape screenshots were inspected. The landscape guide was adjusted after inspection showed an overlap with the task icon; the final guide clears it and the roster.

All seven runners were rerun during the supplemental check. The jungle regression uses an explicitly labelled presentation-only obstruction in the existing rail; it does not seed strategic state. Each action must win the actual pointer hit test after scrolling, Back/Escape restore focus, reverse Tab reaches the final control, Hunt opens the real options, and Firewood/Bamboo actually load and return without an uncaught bubbling-handler exception. Portrait/landscape images were inspected. A separate controlled journey opening confirms multi-winner-safe copy without resolving any journey choice. These eight added checks are rendered regressions, not additional Node tests.

Existing coverage retains nearby groups, observed departures, arrival/transit privacy, Help, camp resource idempotence, touch sizes, landscape exits, long transcripts, explicit invitation response, task/bring clarification, negotiation/conditional choice, Back without agreement, replay and actual scramble progression. The broad camp suites enforce rail bounds and 44-pixel action controls.

Two older drivers still used removed pre-#356/359 paths (More/Confront, Build Connection and the retired approach scheduler), plus the old Follow label. They were migrated to existing semantic bluff/pitch/Connect actions and a controlled owned-evidence initiative. Replay receipt counts, checkpoint equality, exact time billing, no automatic invitation acceptance and physical-presence assertions are retained. These were stale QA drivers, not justification for restoring legacy gameplay.

Reproduce with installed Playwright. `PLAYWRIGHT_MODULE` can point to its module; newer runners accept `CAMP_QA_EXECUTABLE`, while LivingCampRenderedQA and ScrambleRenderedQA use `CHROMIUM_EXECUTABLE_PATH`. Screenshots are emitted under `/tmp`; a small evidence selection is retained beside this report.

## Production interaction checks

EXPERIENCE-AUDIT.md distinguishes the real browser path from fixtures. Jeremy's new season reached three immunity rounds through ordinary controls. The first two wins were shown by the real challenge UIs. The Day 3 legacy challenge's Complete Challenge advanced directly to Day 4; its result presentation deserves a later season audit. No forced loss, alliance, vote or debug time shortcut was used. The first winning return was blocked on #360; ordinary reload/Continue of that same save in the candidate recovered the actual return dialogue, then advanced through the existing safe-tribe round.

A second ordinary new season as Sandra tests the different starting tribe and candidate's first-day path; Kelley independently sought the player at the well. The extended transition check used a persistent browser profile, ordinary Continue, actual fishing attempts and ordinary challenge role selection. Its initial persistent-context viewport defaulted to desktop; subsequent scenes were returned to 375×812. The required four mobile/desktop dimensions are independently covered by rendered runners. Galang won the first immunity race and Last Flag through the real UIs, then Day 3 Survival Instinct through its ordinary Complete Challenge control. The Day 3 canonical result was checked read-only after it advanced directly to Day 4. The player chose one flag on their Last Flag turn; no outcome was selected or rerolled. Both seasons now stop at Day 4, after three wins each. Observations and the final endpoint are recorded in EXPERIENCE-AUDIT.md. No output from hidden diagnostic state was used to choose a ballot or manufacture a conversation. Additional scripted transition attempts encountered driver errors (a full water supply produces no second completion parchment; Beach actions is not named Center) and were not counted as successful playthroughs. The continued ordinary path uses actual fishing attempts to consume camp time. Autosaves occur at state/phase boundaries; reopening between camp actions resumes that saved checkpoint, whereas mid-action equivalence checks use an explicit production payload save. Script selector mistakes and long real-time pauses are not counted as product defects.

No uncaught page errors were observed in the original primary page. The supplemental season exposed five uncaught null-reference errors when a resource click replaced the jungle view before the backdrop handler looked up its content. The handler now uses its own retained content reference. Repeating both Firewood and Bamboo entry/return in the same restored season produced zero new page errors. The scripted rendered runners explicitly assert zero page errors; these observed production errors are not omitted from the audit. The supplemental ordinary Michele/Tagi three-tribe season includes two explicitly accepted natural approaches (Carolyn on Day 1, Yul on Day 2), same-season resource-menu recovery after save/Continue, an actual second-place immunity result, Last Flag win and Day 3 canonical immunity win. The ordinary path ends at Day 4, adding three wins to the six already recorded; the player has still not attended a losing-tribe Tribal in these UI seasons. EXPERIENCE-AUDIT.md records the continuation endpoint. Driver timeouts caused by moving listeners, case-sensitive labels and Tree Mail interrupting an expired work activity are recorded as failed driver steps, not invented product failures. A human losing-tribe Tribal experience is not inferred from immunity wins; separate rendered scramble checks and natural simulations exercise actual production Tribal resolution.

## Deterministic simulation comparison

The unchanged #358–360 production harness executes camp scheduling, actual movement, owned semantic conversation, initiative, objectives, tasks, reports, intentions, convergence and Tribal. NPC goals, work purposes, commitments and ballots are not injected. Initial relationships, alliances and evidence are explicitly labelled.

- **400 paired cases**, 40 seeds in each of the existing ten families, seeds `359000–359039`, `359100–359139`, …, `359900–359939`. Eight knowledge-limited player policies rotate: passive, loyal, active, deceptive, unreliable, reliable, counter and survival. Invitation rejection/deferral policies remain unchanged. Forty time-pressure cases have no pre-period, so 360 cases have the comparable 20-minute pre-immunity window.
- **48 additional paired Day 1 cases**, eight seeds in each of fluid, player-bottom, divided-tribe, stable-majority, secret-coalition and conflicted-loyalties. Seeds `361000–361007`, …, `361500–361507`. Two-hour pre-camp, neutral non-allied relationships except explicitly labelled seeded coalition/isolation conditions. This is a natural decision simulation with configured starts, not a production new-season UI playthrough.
- Each case runs baseline/candidate both uninterrupted and through production JSON restore: **1,792 scrambles, 896 complete replay comparisons; all 896 equivalent**. Candidate records match the original published `src` fingerprint `3c62d3d941027f2e785dd89daa40e2a4eb544e8250df2175cbc9f339ee52416b`, retained in RESULTS.json. The supplemental jungle dialog and journey text do not execute in the natural decision harness, so this 448-case matrix was not rerun or relabelled as a different build. One additional paired two-hour fluid/active case (seed 361000), using the original published head and supplemental source, ran both uninterrupted and restored: **four scrambles, two matching replay comparisons**. Final state hash, RNG state and ballots are identical across those two versions. FINAL-RECHECK.json retains both fingerprints and the exact comparison. Cache keys validate fingerprint, family, first-day mode, seed, policy and invitation response. The inherited harness pins its QA clock/global seeded random stream separately from the production payload. This checks JSON state restoration under the same deterministic environment; it does not establish identical future unseeded browser randomness across real reloads. Resolved semantic receipts remain covered independently.

| Measured outcome | #360 | Candidate |
|---|---:|---:|
| Comparable matrix: accepted pre-immunity player meetings | 25 | 30 |
| Comparable matrix: unique pre NPC conversations started | 1144 | 1182 |
| Comparable matrix: accepted post-immunity player meetings | 438 | 427 |
| Comparable matrix: unique post NPC conversations started | 9594 | 9575 |
| Day 1 matrix: accepted pre-immunity player meetings | 38 | 131 |
| Day 1 matrix: unique pre NPC conversations started | 833 | 943 |
| Day 1 matrix: unique human motives / arrivals / invitations | 148 / 53 / 52 | 305 / 194 / 189 |
| Day 1 matrix: accepted post-immunity player meetings | 96 | 95 |
| Impossible travel / non-present semantic actions, both matrices | 0 / 0 | 0 / 0 |
| Comparable matrix: player survival | 320/400 | 317/400 |
| Day 1 matrix: player survival | 40/48 | 38/48 |
| Comparable matrix: NPC ballot/intention alignment | 2949/3202 | 2937/3202 |
| Day 1 matrix: NPC ballot/intention alignment | 364/384 | 376/384 |

Unique intentions and stage events are different: retries can add multiple approaches, and one conversation can resolve several actions. RESULTS.json retains observed counts, unique-stage counts, raw funnel counts, six gameplay-style breakdowns, family results, task generation/report diagnostics and bounded traces. The observer measures physically possible player-owned exposure, not whether a real person understood every line or acted because of it.

**Unfavorable/limited results:** increased unfamiliar-person opportunity does not transform the short 20-minute pre window; its human attention remains sparse. In the two-hour matrix, accepted pre meetings have candidate median 3, range 0–7, versus baseline median 0, range 0–4. Fourteen candidate cases still accepted none. One candidate case offered 14 invitations including retries; aggregate observer interruption counts increased from 188 to 353 in that matrix. This is a phone pacing risk to evaluate, not evidence that more is automatically better. No quota or cooldown retuning was added to beautify it. Small reductions in survival/post meetings/alignment are disclosed and not tuned away. Quiet episodes remain legitimate.

Reproduce the comparable matrix:

```sh
INITIATIVE_BASELINE_ROOT=/path/to/merged-360 INITIATIVE_OUTPUT=/tmp/first-day-comparison node qa/NpcInitiativeNaturalSimulation.mjs
```

For the additional matrix import `certifyInitiative` from that runner and pass `firstDay:true`, `seedBase:361000`, `seedsPerFamily:8`, and the six families above. The full per-case logs remain scratch outputs; compact aggregates and example traces are committed to avoid megabytes of unnecessary histories.

## Performance

Natural-matrix whole-run timings use parallel workers and cached baseline records with different desktop loads; they are descriptive, not a causal speedup claim. The compact results preserve them. A separate **ten serial paired cases**, one per family with the active policy and alternating source order, ran after other QA workers completed. Each version includes uninterrupted/restore runs: 40 scrambles, 20 replay comparisons, all equivalent.

| Serial mean | #360 | Candidate |
|---|---:|---:|
| Uninterrupted whole simulation | 1001.79 ms | 1062.02 ms |
| Command including replay/import | 2403.36 ms | 2535.92 ms |
| Sampled save payload | 464476 bytes | 470286.6 bytes |
| Aggregate restore time per case | 4.98 ms | 5.98 ms |
| Objective planner calls | 87.5 | 89.2 |

This sample shows about **6.0%** more whole-run time and **1.3%** larger sampled saves, not a mobile benchmark. Listener evaluations remain bounded to six; no new persisted subsystem or trace history was added. PERFORMANCE.json retains all ten pairs, final fingerprints and measurements. Repeat with the existing harness's `--case` CLI, seeds `359002 + 100*n`, active policy, `approachQa:true`, `traceLimit:0`, switching `DELEGATION_SOURCE_ROOT` between the two roots; read top-level `restoreMs` from each case result.

## Limits and next gate

No physical iPhone, native Safari, independent human enjoyment study or full-season certification. Conversation quality is improved selectively, not exhaustively. Real-time pre-camp pauses during browser investigation are unlike ordinary human play. Later challenge presentation/minigame keyboard issues remain deferred; no contestant attributes, challenge scores or Tribal math were changed.

Conversation, initiative, memory, delegation and convergence are **good enough for now; no further architectural work recommended**. Next: use HUMAN-PLAYTEST.md on iPhone, then certify complete seasons, swaps/merge, later challenges, elimination continuity and endgame pacing.
