# Delegation intelligence QA

Baseline: merged #356, main `96f0b377a3159eb044c73b7a3581de934b748d67`: **826 passed, 0 failed, 0 skipped**. Node **24.19.0**; rendered Chromium **153.0.8010.0**, headless.

| Validation | Result |
| --- | --- |
| `node --test --test-reporter=spec` | **891 passed, 0 failed, 0 skipped**; all 826 existing tests retained, 65 new tests |
| Focused command below | **209 passed, 0 failed, 0 skipped**; existing 144 conversation/parity contracts plus 65 new tests |
| `node qa/ConversationRenderedQA.mjs` | **104 checks**, 4 viewports, 0 page errors; existing 76 plus 28 continuity checks |
| `node qa/ScrambleExperienceRenderedQA.mjs` | **89 checks**, 6 timed playthroughs, 0 page errors; every playthrough saves/restores and reaches Before Tribal |
| `git diff --check` | Pass |

Focused command:

```sh
node --test test/ConversationSemantics.test.mjs test/ConversationDelegation.test.mjs test/ConversationIntegration.test.mjs test/PlayerStrategicRequests.test.mjs test/ConversationParityCompatibility.test.mjs test/ConversationRemovalParity.test.mjs test/AutonomousStrategicWork.test.mjs test/StrategicTaskContinuity.test.mjs
```

Rendered runners use `PLAYWRIGHT_MODULE` to select an installed Playwright module, `CAMP_QA_EXECUTABLE` to select Chromium, and `CONVERSATION_QA_OUTPUT` / `CAMP_QA_OUTPUT` for output folders. Checked results and selected screenshots are in [qa/](qa/); full scene sets can be regenerated with these commands. Reports retain the original run metadata.

## New deterministic coverage

AutonomousStrategicWork has a natural owned-circumstance matrix for **each of all 15 purposes**, followed by real semantic execution. A second matrix selects a trusted human connector for each purpose and leaves acceptance pending. Neither matrix sets objective.work or specifies a requested purpose as the planner's input. Objectives describe legitimate goals; circumstances/evidence cause the work choice.

A separate ordinary, non-explicit objective test obtains support, encounters secondhand uncertainty, selects verification and a human, physically travels to the human, offers the request, waits for explicit acceptance, records actual target conversation, receives a spoken report and reevaluates. Other tests prove NPC/self alternatives, stable-plan inactivity, two-pending-request limits, pre-immunity semantic execution and physical incoming requests. Ranking scores are absent from saved selected jobs.

StrategicTaskContinuity covers why/later intermediate states, specific valid explanations, NPC privacy-aware continuation, removal of repeated unconvincing explanations, human bluffs, source breaches discovered through returning stories, ordinary and production save/load, deterministic action replay, invalid explanation ownership, conditional prerequisites and phase/safe-tribe sanity. Comparable styles produce materially different weights and choices.

Seven non-recruitment report purposes have false-performed-work/evidence/dispute tests. Further tests distinguish subjective feelings from claimed contact, assigned information from unrelated chat, exposed source attribution, weak hearsay from credible direct contradictions, evidence-based upgrades, and incident-specific human confrontation replies. A truthful verification report forwards only heard answer claims as attributed hearsay and creates new contingency needs; no false report creates a target conversation. Explicit cover reassurance remains deliberate fabrication without revealing hidden falsity to its listener.

The existing #356 all-purpose lifecycle, human accept/refuse/ignore/fabricate, paired travel, moved requester, alliance/group, old-save/removal parity, Living Camp, convergence and Tribal suites remain green. They provide the retained execution contracts; the new matrices specifically prove need generation rather than test-injected work.

## Rendered scenes

All scenes run at **375×812**, **430×932**, **844×390**, **1280×800**. The added scenes are bring clarification, meaningful reconsideration, unresolved later, false-report confrontation, delegated decoy first option and protected-source selection/delivery. Existing scenes retain incoming Agree/Decline/Hedge, multiple long requests, Left undone, Ready to report, active-request group, long names/transcripts and nested navigation.

Assertions check no horizontal overflow, fitted dialog/footer, persistent End/Close, at least 44×44 targets, every option/task control scrollable into reach, independent transcript/options regions, unchanged memory on Back, checkpoint resume, actual pending negotiation and no protected source name in delivered dialogue. Selected screenshots were visually inspected.

| Evidence | Viewport |
| --- | --- |
| [Bring clarification](qa/bring-clarification-375.png) | 375×812 |
| [Report confrontation](qa/report-confrontation-430.png) | 430×932 |
| [Landscape clarification](qa/bring-clarification-844.png) | 844×390 |
| [Protected-source delivery](qa/protected-source-delivery-1280.png) | 1280×800 |
| [Multiple requests](qa/strategic-requests-375.png) | 375×812 |

## Intentional changes and limits

Ordinary objectives can now select all existing work purposes from owned needs. Pre-immunity work reaches the existing semantic executor. Why/later remain unresolved, and tried explanations/cooldowns stop repetition. Typed reports and heard answers affect later work; credible owned disputes affect reliability and permit confrontation. Secrecy requests to omit attribution apply even to allowed recipients. Requested player fabrication is explicitly spoken and labeled; normal equivalent actions still satisfy assignments.

The planner remains bounded and preserves the ordinary #356 maturation gate. Scenario matrices deliberately configure legitimate circumstances, not a claim that all fifteen purposes occur in every season. Social interpretations and source denials are beliefs, not omniscient lie proofs. Existing split/group coordination still needs individual agreement. No Tribal, vote solver or contestant-data retuning occurred.

**Physical iPhone verification was not performed.** These are Chromium viewport and scrolling checks, not Safari/device testing. Actual safe-area insets, browser chrome, touch scrolling, keyboard behavior and device performance remain to be checked on physical hardware; CSS retains the existing safe-area and independent-scroll layout.
