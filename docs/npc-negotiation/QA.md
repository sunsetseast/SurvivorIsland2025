# Negotiation certification

Baseline is merged #359, `a5925cae0d2aeeef94b9e623b6ca8563248edbf5`. The untouched baseline full suite passed 991 tests, zero failures/skips. All commands below use Node 24.19.0. Final results are recorded after the bounded-meeting reply correction.

## Automated checks

| Command | Passed | Failed | Skipped |
|---|---:|---:|---:|
| `node --test --test-concurrency=2` | 1042 | 0 | 0 |
| `node --test --test-concurrency=2 test/*Conversation*.test.mjs test/*StrategicTask*.test.mjs test/NpcInitiative*.test.mjs test/NpcNegotiation.test.mjs` | 227 | 0 | 0 |
| `node --test test/NpcNegotiation.test.mjs` | 51 | 0 | 0 |
| `node --test test/StrategicDelegationNaturalSimulation.test.mjs test/NpcInitiativeNaturalSimulation.test.mjs` | 24 | 0 | 0 |

The focused and standalone checks are subsets of the full suite, not additional independent test totals. `git diff --check` passes.

The 51 new tests cover original refusal, an active alternate proposal, questioning/accepting/rejecting/conditionally accepting it, cover agreement, legitimate player counteroffers, bounded chains, unrelated promises, withholding through View, character-dependent tactics, proper owned evidence/source handling, actual warnings to the human, no hidden lie detection, no forced human ballot, explicit withdrawal, ordinary work availability, protected meetings, urgent reprioritization, retry cooldown, unmet-condition follow-up, consumption of the final resolved NPC reply, phase-correct refusal/pressure, independently heard group replies, and isolation from private listener knowledge.

## Replay

Eleven new fixtures round-trip the actual `createSavePayload`/production restore boundary at opening, why, evidence, numbers, original rejection, alternate pending, alternate question, conditional acceptance, agreement, withholding and unresolved discussion. Checkpoint, canonical knowledge, receipts, obligations, trust and vote state are compared after JSON normalization. Existing initiative coverage retains invitation/defer, last sightings, traveling, moving listener, private paired movement and termination states. The natural matrix additionally compares complete uninterrupted and reload scrambles, random/checkpoint state and final individual ballots; see SIMULATION and RESULTS.

Back navigation and repeated rendering do not resolve new speech. Replaying a semantic receipt does not add another promise or trust consequence. Failed private relocation preserves the invitation and recovers Talk now. Successful paired movement retains the existing save/travel contract.

## Rendered QA

Chromium headless shell **155.0.8059.39**, Playwright, desktop Linux. Every suite uses **375×812, 430×932, 844×390 and 1280×800**.

| Runner | Checks | Errors | Additional runs |
|---|---:|---:|---|
| `qa/NpcNegotiationRenderedQA.mjs` | 72 | 0 | Four viewports |
| `qa/NpcInitiativeRenderedQA.mjs` | 56 | 0 | Four viewports |
| `qa/ConversationRenderedQA.mjs` | 136 | 0 | Four viewports |
| `qa/ScrambleExperienceRenderedQA.mjs` | 89 | 0 | Six full rendered playthroughs |

New scenes exercise a long NPC name, original proposal, genuinely active alternate subject, why-answer, conditional person picker, keyboard Back without agreement, ordered transcript, valid subjectless withholding, unavailable private walk, visible recovery explanation, explicit protection-deal consent individual group replies, and pre-immunity hypothetical proposals/refusals. Existing suites retain strategic requests, approach/defer/refusal, tasks, bring clarification, confrontations, category navigation and scramble presentation.

Checks include no horizontal overflow, at least 44×44 CSS-pixel controls, scrolling each control into a reachable viewport, keyboard activation, participant names and absence of private motive/AI-state text. Representative portrait counteroffer and landscape private-failure screenshots were inspected. Screenshots remain QA outputs rather than committed bulk assets.

Reproduce using installed Playwright, optionally setting `PLAYWRIGHT_MODULE` and `CAMP_QA_EXECUTABLE` for the local browser binary, then run each runner above. These are Chromium viewport checks. **No physical iPhone or native Safari testing was performed.** Real-device safe-area behavior, touch scrolling and Safari layout remain a device-validation limitation.

## Intentional behavior change and limitations

The no-formal-alliance convergence capability fixture retains seed 80, whose independent negotiations now fragment its vote. It adds fixed seed 81, which still forms a six-of-seven informal majority, and verifies meaningful intention changes in both. No failed seed is hidden and no production agreement score or vote math is retuned to restore its previous outcome.

The bounded NPC meeting records the final already-resolved response before ending, so a condition/commitment cannot disappear from its summary merely because the continuation budget expired. If there is no agreement, it ends unresolved. A prerequisite check can still fail physically or receive refusal; the system does not guarantee a completed plan.

Simulation and runtime limitations are disclosed in SIMULATION. Human policy scripts show possible engagement paths, not evidence of real-human persuasive effectiveness. No physical-device performance claim is made.
