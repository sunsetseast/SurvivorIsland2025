# Validation

## Exact automated results

Baseline merged #358: **939 passed, 0 failed, 0 skipped**. Final candidate: **991 passed, 0 failed, 0 skipped**, including **52 new tests** (48 initiative mechanism/continuity checks and four natural-production integration/replay checks). No tests were removed or marked skipped.

| Command | Pass | Fail | Skip | Duration |
| --- | ---: | ---: | ---: | ---: |
| `node --test --test-concurrency=2 --test-reporter=tap --test-reporter-destination=/tmp/complete359.tap` | 991 | 0 | 0 | 63,340.365 ms |
| Focused command below | 376 | 0 | 0 | 33,510.579 ms |

```sh
node --test --test-concurrency=2 --test-reporter=tap \
  --test-reporter-destination=/tmp/focused359.tap \
  test/Conversation*.test.mjs test/NpcInitiative*.test.mjs \
  test/AutonomousStrategicWork.test.mjs test/PlayerStrategicRequests.test.mjs \
  test/StrategicTask*.test.mjs test/PostImmunityScramble.test.mjs \
  test/CampPhysicalPresence.test.mjs test/StrategicDelegationNaturalSimulation.test.mjs
```

The complete suite covers Living Camp behavior, physical presence, all conversation/task purposes, source-chain knowledge, memory, alliance ownership, old-save compatibility, convergence, Tribal, seasons and challenges. Focused checks preserve refusal/reassignment, delegation/report chronology and all #358 reliability invariants.

New `NpcInitiative.test.mjs` covers production-selected social/warning/alliance motives, both listener directions, owned/stale sightings, movement and bounded failed search, busy listeners and exclusive reservations, explicit pre/post consent, deferral/rude refusal, new evidence vs repeat cooldown, paired private walks, actual NPC/NPC memory, initiating why/numbers negotiation, conditions, lean/refusal/cover promises, bounded follow-ups, idempotence, phase/elimination cleanup, observed movement without private content, character weighting, mutual-wait recovery and urgent replacement of routine work.

New natural integration tests require actual NPC semantic exchanges, independent Tribal ballots, zero illegal movement, bounded pending intentions and production JSON equality. They configure starting conditions rather than inject an approach or desired outcome. A pressure case deliberately has no pre-camp window.

## Rendered QA

Chromium **153.0.8010.0**, headless, all four viewports: **375×812, 430×932, 844×390, 1280×800**.

| Runner | Checks passed | Errors | Additional playthroughs |
| --- | ---: | ---: | ---: |
| `node qa/ConversationRenderedQA.mjs` | 136 | 0 | — |
| `node qa/ScrambleExperienceRenderedQA.mjs` | 89 | 0 | 6 |
| `node qa/NpcInitiativeRenderedQA.mjs` | 56 | 0 | — |
| Total | 281 | 0 | 6 |

Required Playwright module/browser executable can be selected through `PLAYWRIGHT_MODULE` and `CAMP_QA_EXECUTABLE`. Output directories use `CONVERSATION_QA_OUTPUT`, `CAMP_QA_OUTPUT`, and `INITIATIVE_RENDERED_OUTPUT` respectively; these are QA dependencies, not game dependencies.

The new runner exercises pre attention, a real **2.1-second wait with no auto-acceptance**, explicit deferral with unchanged trust, long names, private strategic attention, keyboard acceptance, NPC proposal and why follow-up, nested conditional voter selection, restored negotiation, explicit refusal, real paired private travel and arrival, and long group transcript. Existing suites retain strategic requests, task contextual suggestions, bring clarification, reporting/disputes, protected sources, group membership and scramble navigation coverage.

Every rendered scene checks horizontal overflow, reachable controls after scrolling, buttons at least 44×44, and no hidden-intention text. Conversation and options regions scroll independently with existing safe-area layout. Final visual inspection caught a legacy CSS rule positioning decline before Talk and a dark pre-immunity invitation line; both were corrected and the new runner now asserts the speech color. Final portrait invitation and landscape continuation screenshots were inspected. Screenshots/raw logs are not committed.

**Physical iPhone verification was not performed.** These are browser viewport checks, not actual Safari/device/touch-hardware or performance certification.

## Natural comparison and persistence

`qa/NpcInitiativeNaturalSimulation.mjs`: **400 paired seeds, ten families, eight human policies; 1,600 total baseline/candidate/uninterrupted/reloaded scrambles**. **800/800 production JSON comparisons matched; zero impossible-travel or non-present-action diagnostics.** Exact funnel, unfavorable results and methodology are in SIMULATION.md and RESULTS.json.

Mechanism replay covers identified, traveling, waiting, invited, deferred, relocating, in-conversation, resolved, abandoned and expired states, plus uninterrupted/reloaded negotiation and paired walks. Natural replay compares canonical knowledge, promises, reports, objectives, task state, physical routes/reservations, trust, intentions, RNG and ballots. Human invitations remain pending; reloading does not imply consent.

## Intentional changes and limitations

- Screen entry, phase introduction, midpoint and routine scramble timer no longer issue NPC meetings. SocialEngine compatibility APIs and old save fields remain loadable without scheduling authority.
- Pre-immunity no longer accepts attention or reserves human conversation automatically.
- Normal deferral/decline no longer applies a fixed relationship penalty; rude dismissal is a distinct bounded social action.
- NPC follow-ups use semantic replies and canonical conditions; player intention/ballot is not automatically changed.
- Owned sightings replace remote live-location planning. This causes real missed opportunities and lower aggregate conversation volume. Routine low-value blind searching and mutual-wait deadlocks found during simulation were fixed; the measured residual opportunity loss is disclosed.
- Controlled scheduler-dependent fixtures were refreshed (70/26/80) while preserving real adoption, physical and convergence assertions. Natural comparison seeds/outcomes were not selected to guarantee success.
- Mean whole-simulation runtime and serialization cost increased; mobile hardware performance remains unmeasured. No continuous all-pairs planner or external AI dependency was introduced.
- No new vote model, task engine, memory authority or Tribal rule was introduced. Specialized alliance group meetings remain canonical.

`git diff --check`: passed. Required audit/design/simulation/QA documents and compact machine-readable results are included. This draft makes no claim of perfect NPC play, a guaranteed player survival, or independently certified human-perceived realism.
