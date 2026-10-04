# Post-immunity scramble validation

See [architecture and next-pass findings](post-immunity-scramble-architecture.md). Baseline main: **6738830b3422c84ef34e549efa8835a77ccf235f** (#348); baseline **336 tests**.

## Automated verification

- Full `npm test`: **387/387**, retaining all 336 prior tests and adding **51** focused scramble tests.
- Focused scramble/Living Camp presentation, narration, presence, activity, social intelligence, behavior and camp/save contracts: **196/196**.
- Deterministic harness: **six complete 60-minute semantic scrambles**, each compared to production JSON save/load at exactly **30 minutes remaining**.
- Chromium **141.0.7390.37** and Linux WebKit **26.5**: **40 controlled scramble checks and three gameplay sequences per engine**, zero uncaught page errors.
- Inherited #346–#348 Living Camp rendered QA: **168 checks plus five gameplay sequences per engine**, zero uncaught page errors.
- `git diff --check`: pass.

New tests cover frozen reading/rendering/real-second sources; no strategy intervals; player dialogue billing once and duration tiers; persistent purpose; other NPC/needs advancement; remote/travel interaction exclusion; player destination-group knowledge exclusion; actual arrival and mid-travel restore; exact shared reservation release/exclusivity; disabled post chatter; premerge eligible targets; NPC/player immunity; owner-only claims/facts; physical NPC approaches; pending/resumable dialogue; physical alliance gathering, attendance, cancellations, inactive alliances and stale activities; legacy save adoption; target/confidence/board preservation; unchanged individual alliance disagreement; deterministic restoration; phase/setup/expiry/summary idempotence and safe-tribe delegation.

The full suite also includes prior activity, presentation, narration, social-intelligence, behavior validation/production-cast, camp/save, SeasonEngine and Tribal knowledge/ritual coverage. Tests do not delete or replace earlier coverage.

## Deterministic architectural harness

Production cast: Ozzy, Tony, Cirie, Sandra, Wendell and Jeremy, plus the player. Uses production GameManager save/restore, CampActivity, physical routes/presence, SocialMemory, alliances/deals, Strategy and Tribal context. UI/autosave boundaries alone are stubbed. Strategic conversations occupy actual participants; player movement pays existing graph-edge time. The late-change scenario executes the existing accepted NPC counter-pitch callback after physically reaching the NPC, then pays dialogue time.

| Scenario | NPC resolved conversations | NPC route steps | Intent updates | Facts | Hearsay claims | Meetings | Save/load |
| --- | ---: | ---: | ---: | ---: | ---: | --- | --- |
| Clear majority | 32 | 21 | 43 | 67 | 1 | Completed | Equivalent |
| Divided tribe | 33 | 41 | 44 | 69 | 2 | Gathering cancelled | Equivalent |
| Player in danger | 31 | 33 | 42 | 65 | 2 | Completed | Equivalent |
| Player swing vote | 29 | 53 | 45 | 70 | 4 | Both competing blocs completed | Equivalent |
| Alliance disagreement | 29 | 23 | 38 | 63 | 2 | Completed | Equivalent |
| Late accepted counter | 32 | 21 | 40 | 64 | 1 | Completed | Equivalent |

Each run reaches semantic expiry once, projects a valid final target board and exposes resulting individual intent/confidence to the existing Tribal vote-input path. Zero early physical-presence violations. The initial divided/majority/danger preferences are inputs, not promised final votes. Scheduling does not flatten disagreement. A gathering can genuinely fail when existing conversations/travel prevent everybody arriving within its deadline; it does not steal occupied participants.

Tracked outputs include player action sequence, activity types, route steps, physical approaches, meeting times/participants, intentions/confidence, strategy facts, hearsay counts, deals (zero new autonomous deals in these runs), final heat and individual Tribal inputs. These runs validate architecture, not perfect strategic realism or final ballot distribution. Detailed outputs: [simulation results](post-immunity-scramble-simulation-results.json).

Restored/uninterrupted projections compare remaining time/lifecycle, all physical blocks and locations, intentions/confidence, facts, owner memory, alliance/deal data, meeting/invitation state, RNG/history and final board. No DOM or wall-time handles are compared or saved.

## Rendered matrix and gameplay findings

| Engine | 375×812 | 430×932 | 844×390 | 1280×800 |
| --- | --- | --- | --- | --- |
| Chromium 141 | Pass | Pass | Pass | Pass |
| Linux WebKit 26.5 | Pass | Pass | Pass | Pass |

The scramble fixture uses the production CampScreen/renderer/dialogue/clock/activity systems. All six physical views show a private pair and a separate nearby NPC. Each viewport exercises Approach sheet/Escape, local Talk, real-time reading dwell without clock change, accessible focus, reachable End chat, explicit NPC invitation response (no autoaccept), actual arrived alliance meeting attendance in one conversation overlay, participant reservation, paid navigation, final summary and reduced motion. Phone invitation bounds check **both Talk now and Maybe later**. Clock text is checked against actual semantic time after reconstruction. Portrait capture waits only for visual animation completion; it does not advance game time.

Inherited QA additionally exercises departures, paired travel/arrivals, missed Follow, destination exclusion, owner narration, Watch/Approach results, minigame Help fishing/shelter/fire, portrait reuse, orientation/focus, public-cue dedupe, save/load and recap. No horizontal body overflow; 44px action targets; no essential animation-only information.

Visually reviewed captures across both engines: local groups, crowded meeting, invitations, portrait/landscape conversations, arrival/departure inherited scenes and summary. Representative reviewed images are under `docs/images/scramble-*`. Scenery and navigation remain identifiable. Landscape uses the existing side-by-side avatar/parchment and inner options scroll. Strategy remains an existing topic in that scroll; no target/heat dashboard was added.

Natural scramble gameplay sequences use seed 81 and 12 action steps per style, save/load after step six:

| Player style | Semantic time remaining | Actual dialogues | Nearby group-count variants |
| --- | --- | ---: | ---: |
| Passive waiting | 48:00 | 0 | 1 |
| Social navigation / Approach | 39:45 | 1 | 2 |
| Mixed movement / waiting / Talk | 40:30 | 1 | 2 |

Both engines produce the same results. NPC groups remain busy, though several conversations can occupy the same visible configuration. Approach sometimes reaches a conversation that has already ended. NPC destinations are never interactive during travel. Existing Follow/Watch remain optional paid actions with the prior semantic/owner rules; their detailed outcomes are covered by the inherited camp QA. These are scripted camp-loop playtests, not a full-season human playthrough.

### Concrete findings and fixes

- **Listener moved/became busy before arrival:** the missed strategic conversation becomes regrouping, with no solo-talking display or invented content.
- **Meetings starved waiting for all members idle at once:** gather/reserve available members while other activities finish; bounded semantic deadline and no double booking.
- **Interrupting an external companion could strand the primary NPC:** release the exact shared activity, with regression coverage.
- **Accepted counter callback failed through an unbound memory method:** call the existing recorder with its owner; deterministic dialogue event IDs/time when inside a reservation.
- **Conversation topic controls were 34px; oversized End chat overlapped options:** scoped post-phase 44px controls, readable parchment/backdrop, existing scroll/navigation preserved.
- **NPC invitation Maybe later was clipped off the phone:** post-phase stacked response row, internal scroll and explicit choice-bounds assertions.
- **Rebuilt clock could retain a previous scene's time; Tribal label wrapped over digits:** refresh from semantic state and compact nonwrapping label. Safe tribes retain the normal day label.
- **Hidden simulation facts were copied into player summary:** separate complete Tribal facts from player-owned recap projection.
- **An in-transit player could get destination groups:** guard both group projection and observation entry point with the same travel semantics.

### Intentionally deferred

Strategic intent/deception/provenance overhaul, adaptive strategy goals, multi-speaker alliance negotiation, alliance sincerity/hierarchy/coalitions, autonomous NPC deals, new art/presentation framework, broader summary aggregation and continuous movement. Findings for both next passes are recorded separately in the architecture document. No economy/contestant/Tribal coefficient tuning occurred.

**No physical iPhone, iOS simulator or Apple Safari was tested.** Linux WebKit is the actual engine used here. Hardware safe areas, Safari chrome contraction and on-screen keyboard behavior still require device validation. The tested controls use current dynamic viewport/safe-area rules and contain no new text inputs. WebKit ran with locally extracted Linux host libraries; QA/browser packages are external tooling, not production dependencies.

## Reproduce

```sh
npm test
node qa/ScrambleSimulationHarness.mjs
PLAYWRIGHT_MODULE=/path/to/playwright CHROMIUM_EXECUTABLE_PATH=/path/to/headless_shell \
  CAMP_QA_BROWSER=chromium CAMP_QA_OUTPUT=/tmp/scramble-chromium node qa/ScrambleRenderedQA.mjs
PLAYWRIGHT_MODULE=/path/to/playwright CAMP_QA_BROWSER=webkit \
  CAMP_QA_OUTPUT=/tmp/scramble-webkit node qa/ScrambleRenderedQA.mjs
# Existing Living Camp regression, with the same browser variables:
node qa/LivingCampRenderedQA.mjs
git diff --check
```

Optional `SCRAMBLE_QA_OUTPUT=/path/report.json` writes deterministic harness results. [Rendered reports](post-immunity-scramble-rendered-results.json) include the complete matrix, natural sequences and inherited regression output.
