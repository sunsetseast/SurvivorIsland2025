# QA record

Node **24.19.0**; headless **Chromium 153.0.8010.0**, Linux. Baseline is
merged #357 at `96e632e0d1b5ea16787e6976e766737f5937d70e`.

## Automated suites

| Exact command | Passed | Failed | Skipped |
| --- | ---: | ---: | ---: |
| Baseline checkout: `node --test --test-concurrency=2 --test-reporter=tap` | 891 | 0 | 0 |
| Candidate: `node --test --test-concurrency=2 --test-reporter=tap` | 939 | 0 | 0 |
| `node --test --test-concurrency=2 --test-reporter=tap test/Conversation*.test.mjs test/PlayerStrategicRequests.test.mjs test/StrategicTask*.test.mjs test/AutonomousStrategicWork.test.mjs test/StrategicDelegationNaturalSimulation.test.mjs` | 257 | 0 | 0 |
| `node --test --test-reporter=tap test/StrategicTaskReliability.test.mjs` | 28 | 0 | 0 |

The candidate adds **48 tests**: 28 task-reliability tests and 20 natural-harness
tests. No existing test was deleted, weakened or skipped. The whole candidate
suite took **67,046.794680 ms**; the baseline rerun took **70,333.930364 ms**.
Those are concurrent desktop QA timings, not a controlled performance claim.

Controlled coverage includes six worker-refusal purposes, precise work identity,
replacement human selection with real incoming approach/explicit acceptance/
travel/normal vote-read/report/replan, personal fallback, target-refusal cooling,
new evidence, late hedge refusal and JSON restoration, false subjective reports,
ordinary equivalent reassurance, countdown and same-tick report chronology,
late work after a report, changed-mind historical verification, honest unfinished
work, target cover lies, owner-specific disputes and protection/exposure split
gating. Existing #357 controlled autonomous circumstances still cover all 15
purposes, styles, bring negotiation, source protection and player agency.

Natural tests exercise all ten families and eight information-limited policies,
unique production cast IDs, real presence, bounded work/queues, independent
ballots and whole-scramble JSON replay. The larger multi-seed comparison is
separate from these 20 Node tests; see `SIMULATION.md` and retained results.

## Rendered coverage

`qa/ConversationRenderedQA.mjs` keeps all original **104** checks and adds **32**
reliability scenes/checks: reassigned incoming request and acceptance, ordinary
equivalent reassurance, incomplete reporting, relevant task verification,
competing requests, conditional follow-up and a group after delegated work.
Incoming speech and denial text are asserted, not merely button geometry.

`qa/ScrambleExperienceRenderedQA.mjs` preserves **89** checks and six actual
scramble playthroughs (seeds 79–84). No framework or conversation UI redesign
was introduced.

Both runners cover **375×812, 430×932, 844×390 and 1280×800**. Geometry checks
cover horizontal overflow, pinned navigation, viewport fit, 44px tap controls
(allowing only subpixel rounding), independent scrolling and reachable task
controls. Existing checks cover Back/End, nested choices, long names/transcript,
participant labels, request states, ignored work, protected attribution and group
conversation. Screenshots of portrait incoming requests, landscape verification
and report choices were visually inspected. Large screenshots remain transient,
not committed as noisy repository assets.

The runners use `PLAYWRIGHT_MODULE` and `CAMP_QA_EXECUTABLE` when browser tooling
is installed outside the repository. No tooling dependencies are added to the game.
This is **not physical iPhone, Safari, real touch or VoiceOver verification**.
Safe-area and scroll styling is retained, but actual-device readiness remains
a manual follow-up.

Final rendered result: **136 conversation checks, 0 errors** and **89 scramble
checks, six playthroughs, 0 errors**. `git diff --check` passes. Natural comparison:
**400 paired seeds, 1,600 executions including 800 restored replays, 0 replay
mismatches, 0 detected impossible departures**. Exact per-family and boundary
counts are retained in the machine-readable summaries. These are distinct from
the Node test counts above, not extra tests added to that denominator.

## Save/load and performance

The natural comparison runs production JSON restoration at observed meaningful
boundaries and compares complete semantic/physical state and final ballots with
an uninterrupted run. Canonical exchange order and report clocks persist; late
evidence cannot retroactively validate an old report. Existing save migration,
in-transit absence, paired travel, participant ownership and vote-convergence
contracts remain in the full suite.

`SUMMARY.json` records exact replay-boundary coverage, source digests, planning
calls/candidate counts, queue maxima, serialization size, restore overhead and
per-run/p95 time. The harness pins the inherited QA random stream separately;
see the reproducibility limitation in `SIMULATION.md`. Rare states not naturally
encountered are not claimed as covered by the matrix alone.

## Intentional changes and unresolved limits

Worker refusal now leaves the underlying need alive and cools that worker from
their actual answer time. Relevant semantic delivery—not any contact—is required
to substantiate an attempt. Reports refer to historical speech within their
chronological interval. Subjective success stays subjective. Exposure alone
cannot authorize an idol split. Infeasible late delegation chains are avoided.

No changes to contestant base data, convergence arithmetic, ballot ownership,
Tribal rules, alliances, challenges or the fundamental conversation/task engine.

Intermediate checks caught an import-cycle regression introduced by the first
route-feasibility implementation; it was fixed by querying CampActivitySystem's
existing route authority. The final 939-test run is clean. Natural expiry and
sparse rare events are documented, not disguised as success. The final record
does not claim flawless strategy, statistical blindside certification or
physical-device testing.
