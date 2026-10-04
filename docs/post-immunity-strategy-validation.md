# Strategic intelligence validation

Baseline main: **699624e719c3875f62916b3d1de9e44b33cd0877** (#349), **387 tests**. See [strategic contract and audit](post-immunity-strategy-intelligence.md).

## Automated and deterministic validation

- Full `npm test`: **458/458**, including **71 new** focused intelligence tests and all prior coverage.
- Focused intelligence: **71/71**.
- Eleven complete production-cast 60-minute scenarios: uninterrupted versus production JSON restore after scenario choices and again at exactly 30 minutes remaining; equivalent rich strategy, participant/route state, statement ownership/source chains, promises, plans, RNG, alliances, deals, checkpoint, recap, final target board and individual Tribal inputs.
- Inherited six-scenario #349 harness remains part of `npm test`, including actual physical approaches/meetings, late counter callback, immunity and halfway restoration.
- Chromium **141.0.7390.37** and Linux WebKit **26.5**: **44 controlled scramble checks + three natural sequences per engine**, zero uncaught errors.
- Inherited Living Camp rendered regression: **168 checks + five gameplay sequences per engine**, zero uncaught errors.
- `git diff --check`: pass.

Coverage includes independent preference/vote/pitch/commitment, decoys, backup knowledge/activation, separate split assignments/defection, genuine unknown/conflicting vote reads, all provenance types, initially convincing/weak lies, no psychic trust penalty, later owner-scoped source denial, informal/formal promise distinction, group disagreement, purposeful verification/warnings, approach recency, traveler/participant exclusion, immunity, genuine inventory/search facts and admission, read-only recap, semantic checkpoints, repeat-safe formal deals and keyed RNG. A prior pitch test was updated to assert the new contract (speaking a name does not itself overwrite the speaker's vote); its physical/recipient checks remain.

## Scenario findings

Production-shaped cast: Ozzy, Tony, Cirie, Sandra, Wendell, Jeremy and the player. Contextual tribe relationships/strategic setup are controlled; production trait ratings are unchanged. Autonomous continuation uses production clock, routes, activity occupancy, alliance gatherings and save/restore. UI/autosave transitions alone are stubbed in the simulation harness. Diagnostic counts are observations, not tuning targets.

| Scenario | NPC conversations | Approaches | Intention changes | Result |
| --- | ---: | ---: | ---: | --- |
| majority-decoy | 35 | 2 | 11 | Save/load equivalent |
| split-vote | 33 | 3 | 9 | Save/load equivalent |
| player-bottom | 30 | 4 | 8 | Save/load equivalent |
| player-swing | 31 | 2 | 6 | Save/load equivalent |
| verified-lie | 32 | 4 | 7 | Save/load equivalent |
| player-lie | 30 | 3 | 4 | Save/load equivalent |
| fake-reassurance | 30 | 2 | 8 | Save/load equivalent |
| backup-activation | 26 | 6 | 10 | Save/load equivalent |
| alliance-disagreement | 34 | 1 | 7 | Save/load equivalent |
| reload-conversation | 30 | 4 | 6 | Save/load equivalent |
| idol-rumor | 34 | 2 | 6 | Save/load equivalent |

Aggregate diagnostics: 82 intentionChanges, 450 statements, 46 deliberateLies, 8 decoys, 404 truthfulStatements, 162 hedges, 41 warnings, 50 commitments, 32 reassurances, 18 contradictionsDiscovered, 1 splitPlans, 8 verificationAttempts, 1 backups.

Motive distribution: 252 recruit_swing, 32 warn_ally, 31 reassure_target, 5 spread_decoy, 9 counter_pitch, 8 verify_story.

The majority-decoy case proves a false audience statement does not rewrite the real plan. Split assignments differ and can defect. Player-bottom begins without omniscient danger knowledge and gains a legitimate warning/counter opportunity. The swing player can make incompatible private promises. Verified accounts remain uncertain; a credible source denial can later discredit a player fabrication for one owner. False reassurance leaves the speaker's actual player target intact. Backup activation preserves uninformed/dissenting votes. Alliance meetings can complete with disagreement or cancel naturally when participants cannot gather. Mid-conversation restoration replays neither choices nor billing. Idol search history, witnessed search and hearsay remain distinct from possession.

Some autonomous meetings reach tentative consensus; others disagree or cancel. No automatic NPC formal deals occur. The harness proves bounded strategic/information behavior and reproducibility, not perfect Survivor realism or guaranteed player survival. See the architecture document's Alliance/Deal and UI limitations.

## Rendered and gameplay QA

Both engines tested six production-rendered locations (Beach, Water Well, Campfire, Shelter, Jungle Trail, Rocky Shore) at **375×812, 430×932, 844×390, 1280×800**. Includes nearby private groups, physical approaches, actual alliance attendance, paid navigation, frozen reading, current clock, resumed conversation, explicit bluff outcome, focus/keyboard Escape after option replacement and orientation change, once-only four-minute billing for two strategic choices, owned summary and reduced motion. Natural passive/social/mixed sequences exercise waiting, navigation and group approaches; inherited Living Camp sequences additionally cover worker/spy/mixed, Help minigames, Follow/Watch, travel pairs and owned narration.

Captures were visually reviewed, including phone bluff and resumed landscape dialogue, alliance groups and WebKit contextual dialogue/summary. Context-first choices remain compact; landscape scrolls within the existing dialogue and keeps End chat reachable. Presence continues using the inherited stable portraits/rail. No CSS/art rebuild was needed. Some fixture/location art has an existing sparse composition; no new scenery or layout redesign is claimed.

Concrete issues found/fixed: focus fell outside the overlay after replacing options, preventing Escape from releasing/billing a conversation; resolved continuation text could mutate a checkpoint on replay; group proposals could derive a primary from hidden NPC intention; backup triggers could notify a remote informed ally; existing post gossip/target reads could report engine-wide assessments as knowledge; idol admissions could invent/re-roll search history. These now have focused or rendered coverage.

**Linux WebKit was actually run. No physical iPhone, iOS simulator or Apple Safari verification is claimed.** Browser binaries and extracted Linux dependencies are external QA tooling, not game dependencies.

## Reproduction

```sh
npm test
node --test test/StrategicIntelligence.test.mjs
STRATEGY_QA_OUTPUT=/tmp/strategy-results.json node qa/StrategicIntelligenceHarness.mjs
PLAYWRIGHT_MODULE=/path/to/playwright CAMP_QA_BROWSER=chromium node qa/ScrambleRenderedQA.mjs
PLAYWRIGHT_MODULE=/path/to/playwright CAMP_QA_BROWSER=webkit node qa/ScrambleRenderedQA.mjs
PLAYWRIGHT_MODULE=/path/to/playwright CAMP_QA_BROWSER=chromium node qa/LivingCampRenderedQA.mjs
PLAYWRIGHT_MODULE=/path/to/playwright CAMP_QA_BROWSER=webkit node qa/LivingCampRenderedQA.mjs
git diff --check
```

Optional Chromium executable override: `CHROMIUM_EXECUTABLE_PATH`. WebKit needs its Linux runtime dependencies. Machine-readable [simulation](post-immunity-strategy-simulation-results.json) and [rendered](post-immunity-strategy-rendered-results.json) reports and [reviewed captures](qa/post-immunity-strategy) are committed.
