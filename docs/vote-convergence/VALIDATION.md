# Validation status

Baseline current main: `1ce249c3c984b619bf1784abf7a2134e2e3ed0db` (merged #352).
Published implementation checkpoint: `e51406b22bbe65282675560aafe27cea14236dd7`.

**This draft is incomplete.** The workspace execution service disconnected before the final local changes and raw QA artifacts could be published. The implementation checkpoint is preserved on the PR branch. Results below describe the **final local version**, which is newer than this checkpoint; they are not a passing-validation claim for the current PR head.

## Automated checks observed before disconnection

- Baseline: 589 passing tests.
- Final local version: 630 passing tests, including 41 new convergence tests (34 model/semantic tests and 7 harness tests).
- Dedicated local convergence suite: 41 passing.
- Local `git diff --check`: passed before disconnection.
- Current published checkpoint contains 35 new tests. Its final full-suite status is not certified by the 630-test run.
- Final local logs and final artifacts have not been copied into this branch.

## Observed natural comparison

The same #352 ten-family, 40-seed matrix was run through production movement, semantic conversations, alliance meetings, actual Tribal scoring and post-Tribal lifecycle, with up to four rounds per trajectory. The final local version produced 145 Tribals, compared with 142 in the committed #352 baseline. Survival-length differences affect averages. First-round majority circumstances are staged in this comparable harness; later rounds independently seed preferences. This matrix must not be described as entirely unstaged plan formation.

The following NPC-only average distinct-ballot-target counts were observed in the final local runs. The final raw artifacts and corrected pre-Tribal plan-alignment diagnostics are still awaiting publication.

| Family | #352 baseline | Final local version |
| --- | ---: | ---: |
| No alliance | 5.1875 | 3.5625 |
| Strong majority | 4.5625 | 2.0625 |
| Divided | 5.0625 | 2.9375 |
| Competing blocs | 5.1250 | 3.4375 |
| Idol concern | 4.3750 | 2.1250 |
| Fake alliance | 4.8000 | 3.0000 |
| Secret core | 3.6250 | 2.6250 |
| Player bottom | 4.0000 | 1.2500 |
| NPC bottom | 4.1875 | 2.8125 |
| Target warned | 4.6250 | 2.2500 |

Strong-majority leading-target share improved locally from approximately 46.27% to 87.07%; no-alliance leading share from approximately 33.51% to 59.38%. These are diagnostics, not quotas. They do not establish that counterplay or split emergence is satisfactory.

## Controlled and restore validation observed locally

- Twenty mixed-preference scenarios: majority, divided, no-alliance and secret-core structures at tribe sizes 5, 6, 7, 8 and 10. No final plan, commitment, split or ballot was injected in these controlled negotiations.
- Seven-person sincere majority: all five coalition members aligned; actual NPC ballots had two targets.
- Eight-person divided scenario: two credible three-person blocs formed two principal targets.
- Some no-alliance cases still fragmented: the six-person case retained five distinct NPC targets; the ten-person case retained five targets.
- Final local controlled uninterrupted/production-JSON-restore projections and explicit RNG matched across all twenty cases.
- Final local natural matrix compared uninterrupted and restored strategic state, owned memory, alliances, camp occupancy, deals, trust, Tribal outcomes and RNG.
- Checkpoint boundaries include phase start before seeding, first pitch, first commitment, meeting, viable plan, warning/leak/backup when they occur, final five minutes and immediately before Tribal. Conversation checkpoints remain authoritative.
- The QA diagnostic was corrected locally to capture owned known plans **before** elimination/day advancement. Computing plan alignment after elimination incorrectly invalidated the just-eliminated target. Corrected final artifact assembly was interrupted by the workspace disconnection.
- The active-policy restore fixture was corrected locally to resolve participant IDs against restored actors rather than retain obsolete pre-restore objects.

## Active player policy: unsuccessful result

Thirty-two seven-person player-bottom cases were run locally with a physical, semantic policy: ask a vote read, verify an owned story, pitch an alternate, and make one commitment. All four actions completed in each case. The policy produced **zero immediate counter-pitch shifts and zero player survivals**. This is a known failed counterplay result, not a convergence acceptance claim. Controlled tests separately showed that a player promise can contribute the second credible number and change a listener's real intent; that capability did not make this simple bottom policy successful.

## Split and backup scope

The comparable natural matrix produced zero split plans. A separate favorable production opportunity with high trust, credible idol concern and enough numbers generated one backup, one mathematically viable autonomous split with 4–4 assignments, and one backup activation; no split plan or motive was injected. This remains a controlled opportunity, not broad natural split emergence. Focused local tests preserve an accepted 4–2 assignment and informed backup boundaries without collapsing them onto a primary target.

## Rendered verification

No new rendered verification was completed. Browser installation was attempted, but Chromium/WebKit downloads failed with an empty or truncated archive. No physical iPhone/iOS Safari verification was performed. Layout/CSS was unchanged; the final local dialogue wording/ownership tests passed. Older #352 screenshots are not new verification of this draft.

## Work still required before this draft is complete

1. Reconnect the workspace and publish the final local code, six remaining tests, fixture fixes and `qa:convergence` script.
2. Finish assembling and commit the raw final natural/controlled/active-policy/split results, including corrected pre-Tribal plan alignment, rogue classification, full reason distributions and smell flags.
3. Verify all final-worker restore results, rerun the necessary final checks on the exact published tree and update this document/PR description.
4. Review remaining no-alliance fragmentation, the failed active bottom policy, and lack of split emergence honestly; do not claim universal convergence.
5. Keep this PR a draft. No main merge has been requested.

After those completion checks, the next major pass should be post-immunity UI/UX and presentation: communicate weak leans versus promises, owned stories and unresolved questions clearly without a danger meter, hidden vote dashboard or objective enemy knowledge. The outstanding behavioral limitations should remain explicit rather than declaring all post-immunity behavior frozen.
