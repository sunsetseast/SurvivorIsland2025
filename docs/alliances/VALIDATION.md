# Alliance validation

Baseline main: `364fdeaa6d17f20dc3e301b648c0e1023e621302`.

## Automated checks

- Baseline: **458 passed / 0 failed**.
- Final branch: **540 passed / 0 failed**: the 458 existing checks, 81 focused alliance/privacy/consent tests, and the 12-family multi-round harness check.
- `git diff --check` passes. New coalition code is formatted; surrounding #341–#350 systems receive narrow integration changes.

Existing fixtures were updated where they asserted the replaced binary-alliance API, raw model keys, raw target-map voting influence, or administrative disband semantics. The #350 dissent/persuasion tests still pass using the original persuasion calibration. The attended-meeting test exercises actual production reservations; only rendering is stubbed in its Node environment.

## Production-shaped deterministic harness

The harness uses actual GameManager serialization/restoration/completion, AllianceSystem, initialized DealSystem and DealConsequencesSystem event listeners, SocialMemory, Trust, semantic camp activities, #350 minds and actual TribalCouncil ballots/idols/ties/revotes. It never resurrects eliminated contestants. Scripted challenge safety and scenario intentions/consent fixtures make the intended coalition case reproducible; production attributes are unchanged. Swap/merge geography is a controlled fixture exercising the production alliance lifecycle hooks and real physical-presence contract; it is not a full randomized season generator.

There are **12 families**, seeds **191–202**, and **34 actual completed Tribals per run** (**68** across uninterrupted and interrupted runs). Eleven families finish three rounds. Player-bottom ends after its first actual blindside; the terminal state is intentional, not a fabricated recovery. All 12 end projections are equal under production save/restore.

| Family | Completed rounds | Restore equivalent |
| --- | ---: | --- |
| tight-core | 3 | Yes |
| majority-inner-core | 3 | Yes |
| competing-blocs | 3 | Yes |
| fake-alliance | 3 | Yes |
| player-bottom | 1 | Yes |
| split-vote | 3 | Yes |
| hidden-defection | 3 | Yes |
| discovered-betrayal | 3 | Yes |
| tribe-swap | 3 | Yes |
| merge-reunion | 3 | Yes |
| final-two-majority | 3 | Yes |
| recruitment | 3 | Yes |

Meaningful boundaries include a pending fake offer; pending recruitment before response; separated old allies; multiple-speaker group checkpoints; mid-scramble and after autonomous activity; and all **34** actual completion interruptions after deal evaluation but before alliance fallout. Each family exercises the boundaries relevant to it. End comparison includes coalition states/priorities/secrecy/history/plans, beliefs/memory, directional trust, explicit deals and consequence receipts, minds/activities, exact objective ballots, eliminated contestants and partial completion receipts. Only legacy nonsemantic timestamp decoration is omitted; semantic clock, RNG and references are retained.

Full reports: [simulation](qa/simulation-results.json), [Chromium](qa/chromium-results.json), [Linux WebKit](qa/webkit-results.json).

## Diagnostics

These totals include controlled scenario setup and autonomous formation. They are diagnostics, not production frequency estimates or tuning targets. A fake acceptance is an accepted relationship containing at least one fake member, not necessarily an NPC-originated offer.

| Diagnostic | Total |
| --- | ---: |
| alliancesFormed | 53 |
| proposals | 61 |
| fakeAllianceAcceptance | 22 |
| overlappingAlliances | 32 |
| recruitmentAttempts | 2 |
| recruitmentRejected | 1 |
| meetings | 97 |
| missedMeetings | 7 |
| fractures | 0 |
| defections | 2 |
| hiddenDefections | 2 |
| discoveredBetrayals | 1 |
| votingBlocsExpired | 4 |
| dormantAlliances | 3 |
| reactivatedAlliances | 2 |
| mergeReunions | 2 |
| exclusions | 1 |
| playerBottomRecovery | 0 |
| playerBottomFailure | 1 |
| Mean alliances per contestant, averaged across family endpoints | 1.45 |
| Recruitment rejection ratio in this bounded sample | 1 / 2 |

Hidden defections and later discovery are separate counters; discovery does not rewrite engine ballots. No fractures were forced just to generate a nonzero metric. The player-bottom case records one failure and no artificial recovery. Focused tests separately exercise warning discovery and a legal counter-alliance attempt.

## Rendered responsive QA

**80 rendered scenes passed**: ten experiences × four viewports × two browser engines. Chromium **134.0.6998.35** and Linux WebKit **26.5**; 375×812, 430×932, 844×390 and 1280×800. Experiences: overlap overview, member detail, conversation starter, NPC fake pact proposal, group negotiation, disagreement, recruitment, owned strain, dormant swap alliance and a secretly excluded player.

Assertions cover dialog viewport fit, 44px enabled controls, focus containment/Tab/Escape, dialog stacking above camp controls, free reading time, no hidden sincerity/numeric loyalty/priority/cohesion in visible text, fake-pact acceptance privacy, and the starter opening a conversation without creating a world alliance. Reduced-motion styling is checked. Landscape dialogs scroll; End Chat remains an existing production control. Safe-area and dynamic viewport rules are preserved. Screenshots were visually inspected; an overlapping task icon and difficult group transcript font/contrast were corrected and both browser matrices rerun.

The latest Chrome-for-Testing download was truncated by this environment; Chromium 134 was installed with Playwright 1.51.1. Current Linux WebKit required extracted Ubuntu runtime libraries and a QA-only browser launcher path preserving that library search path. No production dependency or application bundle was changed for browser setup.

**This is Linux browser verification, not physical iPhone/iOS Safari verification.**

Representative renders:

![Mobile overlap notebook](qa/overview-375.png)

![Landscape disagreement](qa/disagreement-844.png)

![NPC pact proposal](qa/offer-430.png)

![Dormant history](qa/dormant-1280.png)

## Practical limits and next pass

Dialogue is bounded and authored. Suspicion currently joins repeated sightings of the same roster, not arbitrary partial groups. Final Three uses linked pair promises. Information withholding needs owned evidence; no omniscient breach is inferred. Initial vote assignments are checked; additional explicit revote negotiations remain a next pass. Lifecycle/priority/formation heuristics need wider full-season sampling before drawing population-frequency conclusions. No physical iPhone verification was performed.

Recommended next post-immunity refinement: conversational renewal of blocs and revote assignments, richer owner-scoped explanations of missed meetings/partial sightings, and a broader production-season seed matrix. Continue to reuse the existing semantic camp, minds and memory.

Final privacy regression checks cover audience-specific cover pitches when a group secretly targets the listening player, and reassurance to an excluded listener without increasing genuine private commitment. Actual individual vote intentions remain unchanged.
