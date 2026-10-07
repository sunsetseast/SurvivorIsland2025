# Conversation QA

Baseline: current main `c16b7afa` / #355; **682 passed, 0 failed, 0 skipped**.

Recorded results: [validation.json](qa/validation.json). Selected rendered evidence: [375×812 group](qa/group-long-transcript-375.png), [430×932 conditions](qa/conditional-selection-430.png), [844×390 group](qa/group-long-transcript-844.png), [1280×800 targets](qa/many-targets-1280.png).

## Automated validation

| Command                                                                                                                      | Result                                                                                                                                                         |
| ---------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm test -- --test-reporter=tap`                                                                                            | 733 passed, 0 failed, 0 skipped; entire existing suite plus 51 new tests                                                                                       |
| `node --test test/ConversationSemantics.test.mjs test/ConversationDelegation.test.mjs test/ConversationIntegration.test.mjs` | 51 passed: 22 semantic, 9 delegation, 20 integration                                                                                                           |
| `npm run qa:conversations:rendered`                                                                                          | 48 checks over four viewports; contextual/nested/group/pre/post/save-resume/dense-target scenes, geometry, reachable buttons, touch sizes and zero page errors |
| `npm run qa:scramble:rendered`                                                                                               | 89 checks, six timed playthroughs, zero page errors; all playthroughs reach Before Tribal after save/load                                                      |

Rendered runners require an installed Playwright module/browser. `PLAYWRIGHT_MODULE` selects the module; `CAMP_QA_EXECUTABLE` optionally selects Chromium. Tested Chromium: **153.0.8010.0**, headless. Node: **24.19.0**. Rendered environments are controlled fixtures with production UI, location, memory, activity, strategy and response logic.

New tests cover every one of the **72 catalog actions**, independent handler validation, valid subjects, meaningful continuation/end and replay without duplicate effects. They also cover NPC questions that never automatically answer for the human, actual player delegation performance, selective information handoff, private source protection and third-party verification without invented denial.

## Scenarios

| Requested scenario                   | Evidence                                                                                                                                         |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| A bonding                            | Bounded relationship movement, canonical history and continued personal conversation                                                             |
| B conflicting reads                  | Different owned evidence; throwing hidden-threat getters; observed leadership/company                                                            |
| C–F truth/hearsay/bluff/verification | Direct attribution, secondhand source chains, no alleged-voter rewrite, contradictory claims without truth revelation                            |
| G recruitment delegation             | Sandra recruits Jeremy; Jeremy travels to Michele, obtains her independent conditional answer, returns and reports                               |
| H–I failure/false reporting          | Accepted work may be ignored; requester learns only the spoken report, never hidden execution state                                              |
| J conditions                         | Required voter stored; activation needs owned confirmation; unmet conditions are not betrayal                                                    |
| K decoy                              | Audience beliefs change while sender's real intention remains distinct                                                                           |
| L leak tests                         | Different stories return as evidence for an uncertain source inference; hidden test marker stays with original speaker                           |
| M contingency                        | Existing backup/split authority and activation on new owned idol information                                                                     |
| N betrayal                           | Broken promise stays private until surviving listener obtains attributable evidence; survives reload                                             |
| O bottom player                      | Counter-pitch, vote recruitment, information, conditional promise, bluff, pressure, protection and delegation remain available                   |
| NPC variation                        | Comparable blindside produces different real reactions across six styles, alongside distinct visibility/delegation/pressure/flexibility profiles |
| Idol leverage                        | Accepted protection promise plus owned warnings can produce a real NPC idol play on an ally                                                      |
| Groups                               | Individual commitment/lean/refusal/cover, physical reservation, transcript and hearing ownership                                                 |
| Save/load                            | Identical delegated-route continuation/final projection; pre and post resolved responses/checkpoint resume; no acceptance or dialogue reroll     |

Refusal/fake-acceptance variants deliberately isolate the response from unrelated automatic alliance-meeting relocation. Ignored/leaked variants control execution mode after a real accepted assignment; separate character evaluation determines those modes in production. These are mechanism tests, not a claim that every random season follows one scripted blindside.

All prior Living Camp, physical presence/travel, social memory, alliance, strategy, convergence and Tribal tests remain in the full suite. Existing vote convergence harnesses remain unchanged. Old rendered promise selection was updated to the new progressive route; the underlying promise-memory, checkpoint and convergence assertions remain.

## Viewport checks

| Viewport | Coverage                                                                                                                                            |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| 375×812  | Suggestions, intent/subject/condition/purpose/attribution selection, resume, four-person group, long names/transcript, pre bonding/idol, 16 targets |
| 430×932  | Same portrait flow with independent transcript/option scrolling                                                                                     |
| 844×390  | Landscape height, wrapping audience, usable transcript, every option scrolls into reach, persistent End                                             |
| 1280×800 | Desktop width, dense targets, individual group responses and restored session                                                                       |

Assertions: no page horizontal overflow; dialog/footer fit viewport; each option is reachable inside its scrolling region; button targets at least 44×44; Back leaves semantic memory unchanged; End and Escape work; participant count and restored checkpoint/transcript remain correct. Screenshots were visually inspected. Long group names originally crowded a horizontal rail; the semantic audience now wraps with accessible full-name labels.

## Intentional changes and limits

Pre conversations now persist their reservation/checkpoint/transcript. Pre idol answers and follow-ups resolve together. Generic NPC social reads use owned evidence; explicit human fabrication is labeled. Votes distinguish pitch/lean/commitment/condition/cover/withdrawal. New formal agreement creation routes exclusively to AllianceSystem; historical Final Two Deal records retain their existing protection obligation for save compatibility and do not create alliance membership.

No hidden percentages, target confidence, NPC falsity, secret objective or persuasion probabilities appear in the interface. Objectives are round-scoped and bounded. Canonical social history survives rounds, but unrestricted free text and exhaustive future-round search are outside this implementation. Rendered tests exercise controlled scenes and six complete camp playthroughs, not an automated proof of every emergent season narrative.
