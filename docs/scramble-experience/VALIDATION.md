# Post-immunity player experience: validation

## Baseline and exact-tree evidence

Current-main baseline: `de886893af9cd799e131ef7b967839052ed23966` (merge #354). Fresh baseline: **646/646** Node tests. Published implementation: `50ff56bd1a629b7eb7be08c09bdd56c6db09d820`; its clean tree passed **682/682**, including **36/36 new focused presentation/privacy tests**, and `git diff --check`.

The committed Chromium/WebKit reports were generated against that published implementation, not an unpublished workspace. Both record source fingerprint `d2802b6a325c2c3db2d485800f8a29878a813bc8d89ed064ca2cf30ef00be8a2` and empty working-tree status. The final publication adds evidence and narrows one legacy QA assertion: resolving a counter-pitch hides that choice, not every other alternative. Runtime presentation/simulation files are identical to the rendered implementation. Selected reviewed PNG blobs are preserved remotely; other local captures were lost before upload. The PR records the exact final evidence commit and its repeated full/focused test result. The legacy rendered scramble harness also passes **44 checks and 3 playtests**, with zero runtime errors. The legacy rendered scramble harness also passes **44 checks and 3 playtests**, with zero runtime errors. No GitHub Actions result is claimed.

## Presentation and knowledge boundary

The camp stays primary. Compact physical groups, individual cards, genuine travel/departure cues, a prominent invitation, contextual actions, semantic MM:SS urgency tiers and a final-five cue replace competing menu hierarchy. Reading never advances time. Move/Watch/Approach/Follow retain production eligibility, reservation, travel and costs. No visual heartbeat was added.

`ScramblePresentation` builds read-only projections; `ScrambleNotebook` renders the same owned notes during camp and Before Tribal. Sources are human-readable, hearsay stays attributed, contradictory accounts stay unresolved. Explicit personal commitments are distinguished from hedges and overheard statements. The player's self-authored promises can include private cover choices. Known alliances use the existing notebook, with qualitative owner reads. Hidden NPC intentions, sincerity, priorities, exclusions, unseen meetings, split/backup plans, safety scores and global totals never populate these views. Focused tests include a proxy that rejects access to NPC strategic state, fake/excluded-member privacy and read-only/RNG invariance.

Conversations lead with bounded contextual choices; More retains existing deeper topics. Group participants stay present in a compact strip and the real transcript has multiple speakers. Exact commitment copy provides an owned promise cue. One bounded question, “Who else is with that?”, shares only the speaker's already-owned attributed evidence through existing SocialMemory. It adds no vote solver or threshold changes. Generic player-name grammar is corrected at rendering only.

One narrow non-presentation bug was necessary: resuming the same physically valid non-interruptible group reservation must preserve its participants/checkpoint. This fixes dropped participants on restore; it does not change travel, occupancy eligibility, interruption or conversation costs. Strategy, convergence, motive selection, affinity, contestant ratings, RNG, split/backup math and Tribal scoring/ritual are preserved.

## Rendered matrix

| Engine | Version | Viewports | Checks | Runtime errors |
| --- | --- | --- | ---: | ---: |
| Chromium | 134.0.6998.35 | 375×812, 430×932, 844×390, 1280×800 | 89 | 0 |
| Linux WebKit | 26.5 | same four | 89 | 0 |

Twenty scenes per viewport cover all sixteen requested experiences plus dense long content, warning, verification and player-bottom privacy. Additional checks cover group conversation restore, promise cue restore and controlled group play/handoff. Results: [full Chromium report](qa/chromium.json), [captured WebKit output](qa/webkit.json). Chromium includes screenshot hashes and bounds. WebKit completed the same 89 checks twice with zero errors; its detailed geometry/manifest file was lost during workspace replacement before publication. The committed WebKit JSON preserves the captured runner output and source metadata; it does not invent missing per-scene measurements. Selected actually reviewed captures are committed in [screenshots](qa/screenshots).

Latest Chromium download repeatedly returned empty/truncated archives; recovery used runnable Chromium 134 with Playwright 1.51.1. Linux WebKit required download-only extraction of host libraries and runtime library-path configuration. The host validator was skipped because extracted libraries were not installed system-wide; the actual WebKit process launched and rendered every check. These are Linux browser runs, **not physical iPhone or iOS Safari verification**.

## Natural scripted semantic-hour playthroughs

Identical results in both engines:

| Policy / seed | Actions | Conversations | Watches | Moves | Restores |
| --- | ---: | ---: | ---: | ---: | ---: |
| Passive observer / 79 | 45 | 0 | 8 | 9 | 1 |
| Social player / 80 | 26 | 13 | 0 | 3 | 1 |
| Strategic player / 81 | 43 | 18 | 0 | 6 | 1 |
| Player in danger / 82 | 40 | 5 | 0 | 9 | 1 |
| Alliance-heavy / 83 | 35 | 6 | 0 | 12 | 1 |
| Mobile landscape / 84 | 30 | 10 | 0 | 5 | 1 |

All reached semantic zero and Before Tribal without runtime errors. A starting known core is configured; production activity and responses then run. The danger family additionally configures one player-owned warning. These are scripted policies through production systems, not uncontrolled full-season emergence. No final ballots were injected.

**Limitation:** the alliance-heavy natural policy did not join a group meeting. Do not interpret it as proof of natural group accessibility. A separate controlled opportunity schedules an appointment, then uses real physical travel → Join → multi-speaker options → End → remaining hour → Head to Tribal. This proves interaction/handoff capability, not natural meeting frequency. The staged initial appointment is explicit in both reports. The handoff leaves strategic/alliance/memory serialization unchanged: no reseeding or read-time strategy.

## Restore, accessibility and screenshot review

Production JSON restore reconstructs 18:30, location, invitation, groups and owned notes. Resuming a group retains all participants and resolved choices. Old arrival/invitation animations and memory cues are suppressed on load. The resolved-choice regression retains exact checkpoint equality and one-time semantic billing.

Checks cover 44px actions, page overflow, ancestor clipping, End/More reachability, native-dialog focus/Escape, landscape orientation and reduced motion. Notes update live while preserving disclosure/scroll/focus. Portrait/landscape sheets use safe-area and dynamic-viewport CSS. Desktop emulation does not certify actual notch/keyboard behavior.

Actual screenshot inspection found and fixed: landscape End clipped by a parent despite valid button bounds; oversized solo portraits; low-contrast invitation copy; excessive empty conversation space; stale context prompts. The final matrix adds ancestor-clipping assertions. Reviewed final captures include dense 375px promises/long names, 18:30 restore, paired departures, portrait conversation/invitation, three-speaker landscape, desktop full tribe, private outsider group and portrait/landscape Before Tribal. No observed page overflow, clipped CTA or scroll trap remains. More can require scrolling the options region; long owned notes scroll independently of the reachable Continue/Close controls.

## Final gate

| Gate | Result |
| --- | --- |
| A: nearby physical people | Yes |
| B: groups vs individuals | Yes |
| C: arrivals/departures | Yes |
| D: approaches noticeable | Yes |
| E: contextual conversation | Yes |
| F: names/promises/contradictions without hidden truth | Yes |
| G: multi-speaker alliance presentation | Yes, controlled opportunity; natural policy limitation above |
| H: privacy | Yes |
| I: final-five state | Yes |
| J: useful owned Before Tribal | Yes |
| K–N: four viewport sizes | Yes |
| O: Chromium | Yes |
| P: Linux WebKit | Yes |
| Q: physical iPhone | No |
| R: blocker before real-device playtesting | None found; real-device safe areas, keyboard, orientation and touch remain unverified |

Proceed to physical iPhone playtesting. Do not reopen strategy tuning based on this presentation pass. Natural group discovery and very dense information usability deserve observational playtesting; no guaranteed information discovery, player escape or group encounter is claimed.
