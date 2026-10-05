# Validation

Baseline `050c11f2beab194acfb690a6cd98112d230f778c`: **540 passed, 0 failed**. Final full suite: **589 passed, 0 failed**. New focused suite: **49 passed** (46 behavioral/integration tests, 3 production-planner harness tests). Existing assertions were updated only for directional owned consequences, load-based capacity and purpose-aware group openings. `git diff --check` passes.

## Natural seeded season stretches

[Raw deterministic results](qa/natural-results.json): **40 trajectories, 142 actual Tribals**, four seeds per family, up to four rounds per trajectory. Each trajectory is compared with production JSON save/restore at every available checkpoint. Rotated production cast ratings are unchanged. Starting coalition structures and the initial majority vote in specified families are configured; subsequent actions, travel, conversations, adoption, plans, alliance evolution and ballots use production systems. The harness does not inject autonomous motive selections or decoy/backup/split objects. Player immunity in four families supports longer runs. A passive eliminated player ends its trajectory.

Families: no alliance, strong majority, divided tribe, competing blocs, idol concern, fake pact, secret core, player bottom, NPC bottom and threatened target (`target-warned`). The last family provides initial targeting circumstances; warnings must emerge naturally. The separate halfway-warning test deliberately supplies the warning to verify response and ownership.

| Diagnostic | Observed |
| --- | ---: |
| Strategic conversations | 6470 |
| Owned statements | 6882 |
| Recruit swing | 895 |
| Recruit known committed supporter | 0 |
| Recruit known committed opponent | 0 |
| Gather known confident position | 0 |
| Gather intelligence | 1541 |
| Verification | 185 |
| Loyalty checks | 1104 |
| Warning attempts | 1190 |
| Reassurances stated | 305 |
| Decoy statements | 333 |
| Backups created / activated | 8 / 1 |
| Split plans / viable split proposals | 0 / 0 |
| Information leaks / leak suspicions | 27 / 9 |
| Alliance offers / formed | 179 / 105 |
| Fake accepted memberships | 48 |
| Overlapping formations | 51 |
| Meetings / disagreements | 150 / 99 |
| Repairs / recruitment / exclusions | 1 / 1 / 9 |
| Intent changes / final-five-minute flips | 179 / 6 |
| Repeated pair/group contact within seven minutes | 1828 |
| Repeated identical agenda receipt after cooldown | 332 |
| Correct danger / false danger / missed danger reads | 129 / 64 / 562 |

These are diagnostics, not quotas. Statements include meeting contributions and answers, so statement counts differ from initiating motives. Decoy counts are delivered cover statements, not unique fabricated plans. Repeated contact includes urgent follow-ups and group contact; it is a flag, not proof of a wasted action. Danger diagnostics use **any received ballot** as the retrospective target criterion, including isolated minority votes; they do not estimate blindside accuracy or expose ballots to owners.

No meaningful split proposal emerged in the broader matrix. Natural expansion/repair was scarce. No new discovered-betrayal event was recorded in these trajectories. Existing #351 objective/perceived fallout and wrong-blame tests remain in the full suite; this pass does not fabricate those events to improve diagnostics.

| Family | Actual Tribals | Average initial intention retained | Passive player eliminations |
| --- | ---: | ---: | ---: |
| no-alliance | 16 | 0.993 | 0 |
| strong-majority | 16 | 0.984 | 0 |
| divided | 16 | 0.962 | 0 |
| competing-blocs | 16 | 0.977 | 0 |
| idol-concern | 16 | 0.930 | 0 |
| fake-alliance | 10 | 0.953 | 2 |
| secret-core | 16 | 0.969 | 0 |
| player-bottom | 4 | 1.000 | 4 |
| npc-bottom | 16 | 1.000 | 0 |
| target-warned | 16 | 1.000 | 0 |

## Controlled acceptance vs emergence

The seven-person, sincere five-two majority uses real planner time for a full hour: at least four of the five keep the original vote, an alliance meeting completes, and no redundant recruiting of committed supporters, backup or split appears without new information. This verifies calm behavior under controlled starting circumstances, not a population percentage.

[Split opportunity](qa/split-opportunity.json) configures a trustworthy eight-person coalition and owned idol concern. It **does not inject a plan or force the motive**: the ordinary scheduler gathers the group physically, spends six semantic minutes and proposes one viable split with both piles beating the three outsiders. Individual acceptance is still evaluated. Full phase and restore after proposal match. This is a natural action under controlled circumstances, distinct from the unconstrained multi-seed matrix.

Focused tests also cover naturally selected source verification, planner-chosen backup, plausible cover decoy, late critical action, unsafe five-two split refusal, independent recruitment/knowledge, repeated-contact restore, group-contact restore, private cover acceptance/proposal, owner-only danger response, long-season historical load, directional generic stance/deal/social consumers, claim denial at Tribal, leak roster/chain and uncertain leak inference. They validate specific mechanisms; they are not claimed as broad emergence.

## Restore comparisons

Every natural run compares full final owned memory, alliance states/history, strategic state/plans/receipts, physical camp state, trust, deals/consequences, ballots, eliminated roster, completion receipts and RNG state. Decorative wall-clock timestamps are excluded; semantic times and RNG are retained.

| Boundary | Comparisons reached |
| --- | ---: |
| after-initial-plan | 142 |
| after-first-strategic-conversation | 142 |
| after-warning | 138 |
| near-final-five-minutes | 142 |
| immediately-before-Tribal | 142 |
| after-Tribal | 142 |
| after-alliance-meeting | 112 |
| after-plan-leak | 16 |
| after-backup-formation | 8 |

Contact, group contact, cover choices, insurance evidence and repeated resolution also have dedicated JSON restore/replay tests. Checkpoints conditional on an event are exercised only when that event occurs, never forged to make a comparison pass.

## Rendered QA

**64/64** scenario/viewport checks pass: eight touched surfaces × four viewports × two engines. Chromium **134.0.6998.35** and Linux WebKit **26.5**. Viewports: **375×812, 430×932, 844×390, 1280×800**. Surfaces: NPC offer, sincere acceptance, cover acceptance, group conversation, player-bottom conversation, actual warning exchange, actual verification exchange and owned recap.

Reports: [Chromium](qa/rendered/chromium.json), [Linux WebKit](qa/rendered/webkit.json). Checks include viewport bounds, 44px buttons, Tab focus containment, Escape closing, landscape scroll, reduced motion at 375px, free reading time, accepted private-state differences and absence of hidden alliance/danger metrics. Fonts and opening animation finish before screenshots; an early screenshot taken mid-animation was discarded. Visual review verified readable parchment/dialogue and recap. The existing light summary surface needed a small text contrast fix.

Examples: [cover at 375px](qa/rendered/cover-375.png), [group in landscape](qa/rendered/group-844.png), [owned recap](qa/rendered/recap-1280.png).

**Linux WebKit is not physical iPhone/iOS Safari verification.** Safe-area/dynamic-viewport styles are retained, but actual device insets, virtual keyboard and platform behavior still need device testing. QA hosts the production recap inside a scrollable fixture surface; it does not validate a redesigned full post-immunity screen.

## Limits and next pass

This is orchestration within existing state. It is not a whole-season challenge/jury solver. The passive-player matrix demonstrates possible elimination and NPC behavior, not player recovery odds. Repeated urgent/contradiction contacts remain common; richer dialogue could explain the purpose better. Safety remains incomplete and sometimes wrong. Expansion, repair and split emergence are sparse outside favorable controlled circumstances. No percentages were tuned to hit targets.

The next recommended pass is the planned post-immunity UI/UX work: organize owned accounts, promises, group disagreements and verification paths; make who said what easier to follow; show intentional private follow-ups and available counterplay without a danger meter, real vote-count dashboard or hidden-state leaks. Follow that with physical iPhone QA and longer seasons with active player policies.
