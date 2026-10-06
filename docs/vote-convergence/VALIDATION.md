# Vote-convergence completion and certification

## Exact source and publication boundary

Current-main baseline: `3c8cafad03bc3af89eaa25d54856c1b34dc9c8ad` (merge of #353).
Exact implementation commit executed by the harness and local tests: `11a8ed54950b9f79115226e277ba55df8c68efd6`.
Runnable-source SHA-256: `d0c98bf769cd4dbcce04227b814dd268e945957316b9a9060cee359870f80e98` (203 files).
Generated: `2026-10-06T04:41:13.974Z`.

The raw artifacts identify the implementation commit they actually executed.
The final publication adds only this report, the audit and raw evidence; its
exact SHA and repeated full/focused test results are attested in the draft PR
description after checking out that published commit. A document cannot embed
its own Git commit hash. The runnable fingerprint is checked unchanged between
the implementation and report-only final head. No prior unpublished #353 local
number is used as current-tree evidence.

## Incomplete-publication audit and reconstruction

[COMPLETION-AUDIT.md](COMPLETION-AUDIT.md) contains the already-merged, missing,
unrecoverable and revalidation checklist. [AUDIT.md](AUDIT.md) preserves the
historical #353 root-cause audit. Lost final local source/test bodies cannot be
reconstructed byte-for-byte; documented defects were repaired directly.

Preserved: stable personal preference, weak .20 startup lean, maturity,
owner-only `planSupport()`, direct/hedge/hearsay weighting, stale decay and
source de-duplication, owned coalition plans, event receipts, final-five/expiry
reconsideration, target-board fallback, player ballot freedom and existing
split/backup protections. No new strategy, coalition, memory or timing engine.

Reconstructed narrow fixes:

- Truthful group wording records the same speech act: weak wish, provisional
  lean, actual promise, accepted assignment, final expectation or undecided.
  Cover can publicly cooperate without revealing/changing its private ballot.
- A weak preference to target the listener is not a settled blindside and does
  not invoke automatic decoy/reassurance behavior. A fake convener no longer
  auto-accepts its own split; ordinary rational compromise remains possible.
- Stale split acceptance cannot overwrite an already activated known backup.
- Tribal caps lean authority at .25 and provisional authority at .65; pledged,
  assignment and final input remain confidence-based. Ritual/other math stays
  unchanged; actual ballots still come from Tribal scoring.
- QA resolves restored participants by ID, captures owned plans before Tribal
  cleanup and distinguishes deliberate off-plan intent from uncertainty,
  protected holdouts, backups, splits, competing plans and Tribal divergence.
- Adoption tracing reports the existing evaluated score/guard only. A received
  weak player pitch is not miscounted as a newly recruited supporter. Ratings,
  persuasion thresholds and RNG decisions are unchanged.
- `npm run qa:convergence` executes the certification matrix.

## Automated verification

| Tree / suite | Total | Passed | Failed |
| --- | ---: | ---: | ---: |
| Current-main baseline | 624 | 623 | 1 |
| Implementation full suite (`npm test`) | 646 | 646 | 0 |
| Focused convergence / harness / certification | 57 | 57 | 0 |

**22 new tests**. The baseline failure was the existing late-change QA policy
missing a physical opening in its narrow window; the search now covers the
final ten minutes while retaining real movement/eligibility. New coverage
includes maturity wording/speech acts, hidden cover, fake split convener,
accepted 4–2 and stale-backup protection, restored actor identity, pre-Tribal
classification, migration/replay and successful/unsuccessful player/NPC
counterplay. `git diff --check` passes. Exact final-head checks are repeated and
recorded in the PR description. These are local Node checks; **GitHub Actions
did not run**, and the repository contains no Actions workflow.

## Comparable #352 natural matrix

40 deterministic trajectories, four seeds per family, up to four rounds:
**145 current-tree Tribals**, versus 142 in the committed #352 artifact.
Different player survival lengths change denominators. Each trajectory uses
production cast data, physical movement, semantic conversations/meetings,
actual Tribal scoring and post-Tribal lifecycle. Merge occurs in round three
where the player survives; challenge immunity in four families allows longer
trajectories. Starting coalitions and first-round majority circumstances are
configured to match #352 (including strong initial support). This is comparable
autonomous progression, **not wholly unstaged initial plan formation**. The
separate mixed-preference negotiations below inject no final commitments/plans.

NPC initial ballots only, before idols/revotes. Shares are per-Tribal means;
preference/lean/compromise rates use the applicable voter denominator.
"Initial lean retained" excludes configured mature first-round intentions;
the historical whole-initial-intention measure is also in `summary.json`.
Preference match compares final actual ballot to independently retained desire.
Compromise counts pre-Tribal intention differing from desire for an identified
social reason. Commitment totals count actions, not distinct voters. Late flips
are changes in the final five semantic minutes. No percentage is a tuning quota.

| Family | Tribals #352 / now | Distinct targets #352 → now | Leading share #352 → now | Second share now | Preference match | Initial lean retained | Social compromise |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| no-alliance | 16 / 16 | 5.1875 → 2.6875 | 33.51% → 71.79% | 20.31% | 46.21% | 46.21% | 53.79% |
| strong-majority | 16 / 16 | 4.5625 → 2.0000 | 46.27% → 86.28% | 13.72% | 18.18% | 20.37% | 81.82% |
| divided | 16 / 16 | 5.0625 → 3.3750 | 40.28% → 59.29% | 23.26% | 52.27% | 52.27% | 46.21% |
| competing-blocs | 16 / 16 | 5.1250 → 3.3750 | 37.76% → 61.72% | 21.09% | 54.55% | 54.55% | 45.45% |
| idol-concern | 16 / 16 | 4.3750 → 2.3750 | 47.22% → 74.57% | 19.18% | 51.52% | 36.00% | 48.48% |
| fake-alliance | 10 / 13 | 4.8000 → 2.9231 | 39.58% → 58.65% | 27.99% | 43.52% | 44.23% | 56.48% |
| secret-core | 16 / 16 | 3.6250 → 2.9375 | 60.16% → 66.23% | 22.31% | 34.85% | 39.81% | 65.15% |
| player-bottom | 4 / 4 | 4.0000 → 1.0000 | 66.67% → 100.00% | 0.00% | 8.33% | 0.00% | 91.67% |
| npc-bottom | 16 / 16 | 4.1875 → 3.1875 | 52.08% → 66.49% | 19.01% | 37.12% | 42.86% | 61.36% |
| target-warned | 16 / 16 | 4.6250 → 2.0000 | 45.75% → 83.25% | 16.75% | 21.97% | 25.89% | 78.03% |

| Family | Compromises | Commitment actions | Plan-aligned ballots | Intentional rogues | Split-assigned ballots | Intent changes | Late flips |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| no-alliance | 71 | 365 | 78 | 4 | 0 | 77 | 8 |
| strong-majority | 108 | 459 | 109 | 0 | 0 | 124 | 5 |
| divided | 61 | 290 | 65 | 2 | 0 | 82 | 11 |
| competing-blocs | 60 | 287 | 67 | 2 | 0 | 73 | 13 |
| idol-concern | 64 | 375 | 91 | 4 | 0 | 139 | 9 |
| fake-alliance | 61 | 322 | 59 | 4 | 0 | 88 | 12 |
| secret-core | 86 | 339 | 95 | 2 | 0 | 111 | 14 |
| player-bottom | 33 | 191 | 34 | 0 | 0 | 33 | 1 |
| npc-bottom | 81 | 360 | 79 | 2 | 0 | 89 | 7 |
| target-warned | 103 | 533 | 107 | 2 | 0 | 121 | 5 |

Final pre-Tribal reason distribution (raw per-owner states and ballot
classifications are included in `natural-results.json`):

- **no-alliance**: `explicit_commitment` 88, `personal_preference` 21, `viable_majority` 18, `strategic_compromise` 3, `self_preservation` 1, `alliance_consensus` 1
- **strong-majority**: `explicit_commitment` 107, `personal_preference` 6, `alliance_consensus` 2, `viable_majority` 12, `strategic_compromise` 5
- **divided**: `explicit_commitment` 71, `viable_majority` 11, `personal_preference` 34, `alliance_consensus` 8, `strategic_compromise` 3, `backup:target_aware` 2, `self_preservation` 3
- **competing-blocs**: `personal_preference` 36, `strategic_compromise` 8, `explicit_commitment` 71, `viable_majority` 16, `alliance_consensus` 1
- **idol-concern**: `explicit_commitment` 95, `personal_preference` 18, `alliance_consensus` 3, `viable_majority` 8, `self_preservation` 7, `strategic_compromise` 1
- **fake-alliance**: `explicit_commitment` 69, `personal_preference` 20, `viable_majority` 10, `strategic_compromise` 6, `self_preservation` 2, `alliance_consensus` 1
- **secret-core**: `personal_preference` 15, `explicit_commitment` 92, `viable_majority` 5, `strategic_compromise` 8, `alliance_consensus` 11, `self_preservation` 1
- **player-bottom**: `explicit_commitment` 35, `viable_majority` 1
- **npc-bottom**: `explicit_commitment` 81, `personal_preference` 32, `strategic_compromise` 8, `viable_majority` 6, `alliance_consensus` 5
- **target-warned**: `explicit_commitment` 109, `strategic_compromise` 5, `personal_preference` 6, `viable_majority` 9, `alliance_consensus` 3

Strong-majority coordination substantially improves, with zero strong-majority
fragmentation flags. Divided/competing families remain more fragmented than
majorities; they improve but do not universally become two-plan votes.
No-alliance tribes show real temporary compromise without mandatory new formal
alliances, but residual fragmentation remains. Fake-alliance votes remain less
concentrated than sincere majorities, consistent with public support differing
from private intent; this does not prove every such difference was deception.

Smell review across natural plus controlled cases: **0 strong-majority**, **4
near-unanimity**, **2 excessive-fragmentation**, **0 flip-chaos**. The four
unanimous NPC votes are the intentionally configured player-bottom first round,
not season-wide convergence. Fragmentation flags are divided seed410 round2
and controlled six-person no-alliance seed79. The ten-person informal controlled
case also has five targets and is disclosed below, even though its larger
denominator does not trip the smell threshold. Flags are diagnostics, not
silently discarded failures.

## Controlled social negotiation

20 structure/size cases, each paired with production JSON restore. Starting
coalitions, trust/priority context and diverse weak preferences are configured;
no final targets, commitments, split assignments, motives or ballots are
injected. Real planners move, meet and negotiate during the semantic hour.

| Tribe size | Majority alignment | Divided alignment / targets | No-alliance targets | Inner-core alignment |
| ---: | ---: | --- | ---: | ---: |
| 5 | 3 | [2, 2] / 2 | 2 | 3 |
| 6 | 4 | [1, 1] / 4 | 5 | 3 |
| 7 | 5 | [3, 3] / 2 | 3 | 3 |
| 8 | 5 | [3, 3] / 2 | 3 | 3 |
| 10 | 5 | [4, 4] / 2 | 5 | 3 |

Seven-person sincere majority: **5/5 coalition members aligned**, actual NPC
ballots form two targets; preferences remain independently stored. Eight-person
divided tribe: **3/3 in each bloc**, two different plans/ballot targets. Inner
core: 3/3 coordination at every tested size; owned-plan tests prevent gravity
or UI knowledge from reaching nonparticipants. Eight-person no-alliance:
five of seven NPC ballots share a plan, three targets overall. Six-person
informal case remains five different votes; ten-person informal case also has
five targets. Six-person divided case has four targets and only 1/1 alignment:
successful eight-person acceptance is not a universal small-tribe guarantee.
Focused tests separately preserve dead-preference compromise, protected
low-flexibility holdout, fake public assent/private dissent and round voting blocs.

## Active player-bottom investigation

32 seven-person cases; all **128 actions** completed physically: vote read,
verification, counter-pitch, commitment. Restored fixtures re-resolve current
actors, so absence of movement is not attributed to stale references. Results:
**0 immediate intention shifts, 0 survivals**. This failure is retained.

At every counter-pitch the player had **zero owned credible alternate support**.
The listener had zero perceived alternate viability in **27/32** cases.
Directional listener→player trust was 50 and affinity 0; listeners were chosen
as available known outsiders, not by owned pivotal-voter evidence. The policy
often verified an uncommitted story and then selected a heard/fallback name
without recruiting a supporting ally or sharing a second number. Existing
commitments further resisted some attempts. Evaluated scores ranged
**0.1163–0.6933**: 9 refusals, 20 hedges, 2 commitments,
1 open response. The two commitments reaffirmed an already matching intention;
they were not flips. **2 newly credible supporters** were heard at the
counter-pitch step. A pledge made afterward can supply the player's own vote
to the listener, but does not make this unsupported policy a viable coalition.

`active-player-results.json` records owned evidence, alternate support,
directional trust/affinity, listener intention/pledge/flexibility/viability,
actual adoption score/guard/outcome, physical approach attempts and the before/
after source projections at every action. Rejection does not justify a player
buff; no threshold or cast rating was changed.

## Viable counterplay capability

Separate seven-person controlled opportunities configure unlocked danger,
a trusted ally and uncertain swing. The player verifies the attributed swing
story, approaches an ally, actually earns/hears a pledge where accepted,
commits, shares that real source and then counter-pitches/commits to the swing.
No final NPC vote is injected. **8/16
player cases move the swing's real intention** (seed74 is a focused passing
example; seed73 is an explicit rejection). The swing's original preference can
remain against the player while its intention changes to the viable alternate.

For NPC-bottom, one owned tentative ally and one actual player pledge supply
the controlled initial route; the endangered NPC then uses ordinary autonomous
physical planning for the semantic hour. **6/16
NPC cases move the swing**. These are capability tests, not population survival
rates or proof that arbitrary bottom players can always escape. Source chains,
time, checkpoints and directional relationships remain production behavior.

## Split, backup, expiry and knowledge boundaries

The broad comparable matrix produces **zero split plans**. The separate
favorable 11-person production opportunity configures eight trusted supporters,
credible idol evidence and existing primary support; it injects no split or
backup plan/motive. The real meeting generates **one viable 4–4 split**, **one
backup and one activation**, with individual assignments and matching restore.
Each arm has four against three outside voters. This is a favorable controlled
opportunity, not broad natural split emergence.

Focused acceptance negotiates/accepts a 4–2 assignment through production APIs
and verifies ordinary adoption plus expiry cannot collapse it. Activated backup
stays authoritative for informed participants; uninformed minds do not switch.
Stale split acceptance cannot undo it. Fake/cover convener may announce a split
without accepting it privately. Fresh direct commitment replaces attributed
hearsay for the same voter; stale corrections preserve history, not duplicate
votes. Secret plans require actual participation plus owned plan evidence.
Expiry reconsideration uses existing owned state without a random final reroll;
Tribal still scores ballots. The player's ballot is never auto-converged.

## Save/load certification

**125/125 paired cases match** uninterrupted
versus production JSON restore, including semantic projections and explicit RNG:
40 natural, 20 controlled, 32 insufficient active-player policies, 16 viable
player, 16 viable NPC and 1 split opportunity. Projections include owned memory,
strategic minds, coalition state, occupancy, trust/deals/lifecycle and actual
ballots as applicable. Nondeterministic wall-clock bookkeeping is excluded;
semantic time and RNG are retained. Existing checkpoint/receipt tests prevent
duplicate statement, promise, intention history, compromise count or time charge.

Milestones observed in paired drivers: `after-Tribal`, `after-alliance-meeting`, `after-backup-formation`, `after-first-commitment`, `after-first-strategic-conversation`, `after-initial-plan`, `after-plan-leak`, `after-viable-plan`, `after-warning`, `before-Tribal`, `commit:11`, `counter-support`, `counter:11`, `final-five`, `first-commitment`, `first-pitch`, `immediately-before-Tribal`, `initial-danger`, `meeting`, `near-final-five-minutes`, `npc-time:1800`, `npc-time:300`, `phase-start`, `phase-start-before-preferences`, `share:1:postChallenge:12:counter_promise:11:9`, `verify:alleged-swing`, `warning`.
Warning/leak/backup boundaries are conditional on events actually happening;
this is not a claim that every trajectory generated every capability.
`restore-results.json` contains matching state hashes and RNG for every pair.

## Rendered and physical-device status

**No new rendered QA ran.** Playwright Chromium + Linux WebKit installation was
attempted; Chrome for Testing151/Playwrightv1234 download returned an empty or
truncated archive (`End of central directory record signature not found`). No
usable browser was installed, so neither engine rendered this tree. No old
screenshots are reused. No layout/CSS changed; production wording/ownership is
covered by semantic tests. **No physical iPhone/iOS Safari verification**.
Linux WebKit would not constitute that real-device verification in any case.

## Final decision gate

| Gate | Decision | Evidence / limitation |
| --- | --- | --- |
| A. Exact final tree verified? | Yes, final-head attestation in draft PR | Full646/focused57 and unchanged runnable fingerprint checked after report publication; no CI claim. |
| B. Strong-majority structurally credible? | Yes | Mixed-preference seven-person coalition5/5; natural targets4.5625→2.0000. |
| C. Divided tribes form meaningful plans? | Yes, with exceptions | Eight-person3/3 opposing blocs/two targets; six-person divided failure remains. |
| D. Informal coordination exists? | Yes | Eight-person5/7 on one plan; natural5.1875→2.6875 targets; small/large residual fragments. |
| E. Split/backup intact? | Yes | Accepted4–2, active informed backup, fake convener/stale-accept guards and paired opportunity. |
| F. Viable player counterplay moves NPCs? | Yes | 8/16 controlled real swing shifts; unsupported simple policy0/32 retained. |
| G. Save/load equivalent? | Yes | 125/125 semantic and RNG pairs, plus checkpoint tests. |
| H. Remaining blocker before UI/UX? | None in convergence capability | Rendered/device checks outstanding; broad split emergence rare and informal/divided exceptions disclosed. |

**Go for the dedicated post-immunity UI/UX and presentation pass. Stop strategy
tuning here.** This certifies controlled capabilities plus substantially improved
multi-round coordination; it does not promise universal two-target votes or
player survival. Future work should communicate owned leans/promises,
contradictions, group tension, travel/urgency and Before Tribal clearly, then
verify real iPhone interaction, while preserving the simulation.
