# Living Camp physical presence validation

## Baseline and scope

Started from current main **000bcf1e0f2481566564905979d78969b4a6d126**, the merge of #347. Foundations #341–#347 remain intact. Baseline `npm test`: **318/318**. Main was rechecked before publishing.

Inspected CampActivitySystem start/completion/routes, NpcLocationSystem lookup/residency, CampInteractionSystem, CampPresentation/NpcAutoRenderer/CampNarration, SocialMemorySystem, CampSocialResolution/CampKnowledge, IdolSystem/NpcIdolHuntAI/IdolPossession, ConversationSystem entry/callbacks, CampScreen navigation, Shelter Help, TaskSystem/SocialEngine witnesses, save reconstruction, existing camp tests and production rendered fixtures. Searched location equality, witness/bystander, overhearing, arrival/departure, grouping and investigation paths.

The concrete mismatch was `start(travel)`: destination assignment, origin departure **and destination arrival** happened immediately. UI excluded travelers, but raw destination checks still admitted them as witnesses, bystanders and conversation candidates. Player navigation also set the destination view before paying time; Follow navigated before its timed block.

**No contestant data, camp economy, activity probabilities, work coefficients, behavioral traits, fishing/fire formulas, Strategy target math or Tribal logic were tuned.** No new movement/dialogue/memory engine.

## Physical contract and event ordering

`locations/CampPresence.js` is the shared semantic contract: an eligible, active contestant must match the physical camp location and have neither a `travel` nor `follow` block. Out/eliminated/absent contestants are excluded. Player `location` is authoritative, including normalized minigame subviews; the view being opened is not a witness location.

Raw NPC location storage still identifies the current route-step destination for routing/save compatibility. It is **not evidence of presence**. Shared presence now drives nearby projection/actions, lookup/counts, departure/arrival witnesses, work observation/reputation/cooperation, conversation participants/bystanders/entry callbacks, overhearing, investigation and Follow outcomes. Idol/task/social witness consumers inherit it through `getSurvivorsAtLocation`. Routing, planned meeting locations and goal selection retain destination lookups intentionally. Historical departure witnesses used for later absence impressions remain historical evidence.

Travel completion explicitly:

1. Settles all arrivals at the boundary, including both paired actors.
2. Records actual destination witnesses at that boundary.
3. Continues routes, then goal activities.
4. Publishes complete activity state. Intermediate location updates do not publish half-assembled pairs.

Each step stores its origin and uses the existing activity identity: `:departure` at start, `:arrival` at completion. SocialMemory's existing dedupe plus resolved activity IDs make completion idempotent. Intermediate route nodes may have arrival and onward departure at the same boundary; travelers occupy neither endpoint between boundaries. Return notifications close Follow on actual return, rather than an inbound route marker.

An independent arrival already accepted into a new shared activity cannot be interrupted through its completed travel object. Unavailable companions cannot be relocated or added to arrival memory. Existing externally paid NPC approaches arrive before opening a conversation, without immediately selecting another route.

Player travel remains synchronous and costs the original **30 seconds per route step**. Follow remains **120 seconds**, Approach **45**, Watch **60**. Paid walking/following excludes destination evidence during time advancement. Follow cannot see an unfinished destination goal or navigate over a phase/event handoff. No encounter outcome probabilities changed.

## Save compatibility

Production JSON restoration at **20/45 seconds** retains transit, route, pairing, IDs and remaining time. After 25 seconds, arrival occurs once. CampActivitySystem restores after its location/memory dependencies.

For an older in-flight save missing the origin field, recover it from that actor's existing departure. Remove only that step's premature arrival and corresponding arrival impression increment; retain other owned observations/claims. The genuine completion computes current witnesses anew. Already completed historical events are not retroactively reconstructed: their true former witness locations cannot be recovered safely. UI queues, dialogs, focus and animations remain transient; reload seeds narration from saved knowledge without replay.

## Nearby presentation and concrete findings

| Finding | Focused correction |
| --- | --- |
| A generic direction string gave departures little identity | Compact **Just left** strip: names, paired portraits, direction, contextual Follow; missed strip disappears |
| Arrival knowledge and portraits disagreed | Real owned arrival observation drives restrained pair/relevant-return narration; ordinary traffic stays visual |
| Equal-looking social/nearby entries weakened group cohesion | Shared activity/action, subtle portrait connector, subdued quiet group and explicit **Talking quietly** label |
| Every public group could repeat the same need line | Deterministic activity-keyed variants from public stockpile/fire/shelter only; one local cue per need topic |
| Repeated Approach explanation dominated the sheet | Names, status and short timing helper; meaningful Approach/Watch/Leave choices retained |
| Symbol-only badges disappeared with unavailable fonts | Compact Work/Fish/Fire/Water/Rest/Quiet text, alongside full activity labels and accessible portrait descriptions |
| Wood/bamboo entry diagnostics covered the clock | Gate those two entry banners behind existing debug mode; minigame behavior unchanged |

Stable card reuse, single narration dwell timer, reduced motion, native dialogs, Escape/focus restoration, 44px controls, dynamic viewport/safe-area rules and rail scrolling remain. No polling, DOM observers or independent visual movement clock.

## Rendered QA

**168 controlled scene checks per engine**: inherited 96 crowd scenes, all 32 #347 variants, and 40 movement/presence variants. Additional real encounter/minigame/recap checks and five natural sequences run in each engine. Zero uncaught page errors.

| Engine | 375×812 | 430×932 | 844×390 | 1280×800 |
| --- | --- | --- | --- | --- |
| Chromium 141.0.7390.37 | Pass | Pass | Pass | Pass |
| Linux WebKit 26.5 | Pass | Pass | Pass | Pass |

Beach solo/pair departure and missed Follow; Water Well private/public groups, inbound exclusion and completion arrival; Jungle ambiguous search, late investigator and Follow result; Campfire workers, multiple public groups/cue dedupe; Shelter rest/work/Help and arrivals; Rocky Shore fishers, arrival and existing Fishing Help. Mid-route production restore, stable portrait DOM, keyboard/Escape, orientation focus, dialog/action bounds, body overflow, reduced motion, narration queue/reload, actual Help fishing/shelter/fire and recap scrolling are checked.

Captures were visually reviewed, including both engines, all physical locations, arrivals/departures, phone/landscape sheets and Help. Scenery remains identifiable; six-person scenes use the existing inner rail scroll instead of covering the whole location. Arrival pairs may require scrolling to reach their actions in a crowded phone rail. This is an intentional space tradeoff, not an omniscient map.

**No physical iPhone, iOS simulator or Apple Safari was tested.** Linux WebKit is an engine check. Hardware safe areas, Safari browser-chrome contraction and on-screen keyboard behavior remain device validation items; encounter sheets have no text inputs.

## Natural movement playtests

Five 24-step camp sequences per engine, production cast and two camp hours, seeds 47–51. No NPC choices are forced after natural setup. Player choices use local groups/departures; real dialogue and work UI are used, with production methods for timed observation/navigation. These are camp-loop playtests, not full-season human/device playthroughs.

| Player | Camp time remaining | NPC work completions | Owned observations | Local group configurations | Recorded arrivals | Early arrivals |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Passive | 96:00 | 9 | 10 | 4 | 41 | 0 |
| Worker | 56:30 | 8 | 17 | 7 | 63 | 0 |
| Social | 80:30 | 8 | 31 | 8 | 23 | 0 |
| Spy | 67:30 | 18 | 48 | 14 | 54 | 0 |
| Mixed | 32:00 | 22 | 46 | 5 | 126 | 0 |

Both engines produced these semantic results. Audits found zero in-transit nearby portraits. These seeds did not produce paired relocations; controlled paired routes/arrival/save checks cover them explicitly.

- People stay busy and groups change. They become interactable after arrival; inbound destination portraits stay absent.
- Follow strips make the opening spatially clear. Spy/mixed play found ordinary work, lost trails and personal caught-following outcomes, while spending real time.
- Watch often yields no useful words; it does not guarantee hidden strategy. Social play had a moved-on Approach and welcomed conversations, with existing conversation time paid separately.
- Pair departures are legible in controlled captures. Pair arrival cues appear at completion, once; quiet traffic often remains visual. Public chatter stays stable and deduped through refreshes.
- Helping remains integrated; original Fishing/Shelter/Fire and tribe-water timing/reputation checks pass. No economy adjustment was made.
- The rail still looks like an interface, but grouping, readable actions and departure identity improve hierarchy. At 375px, crowded groups need inner scrolling; scenery/clock/navigation remain visible. Landscape sheets/actions remain reachable.
- Owned recaps match observed/told evidence and omit unseen events. Quiet/distant activity can still be missed. Existing encounter choice/result stages remain; no extra Follow stage was added.

## Verification and reproduction

- Full `npm test`: **336/336** (318 prior tests retained; 18 new).
- Focused presentation/narration, physical presence, activity, social intelligence, behavior validation, production behavior, camp/save contracts and SeasonEngine suite: **168/168**.
- Chromium and Linux WebKit rendered QA: **168 checks each**, plus interactions and five gameplay sequences each.
- `git diff --check`: pass.

```sh
npm test
PLAYWRIGHT_MODULE=/path/to/playwright CHROMIUM_EXECUTABLE_PATH=/path/to/headless_shell \
  CAMP_QA_OUTPUT=/tmp/camp-presence-chromium node qa/LivingCampRenderedQA.mjs
PLAYWRIGHT_MODULE=/path/to/playwright CAMP_QA_BROWSER=webkit \
  CAMP_QA_OUTPUT=/tmp/camp-presence-webkit node qa/LivingCampRenderedQA.mjs
```

Playwright/browser runtime dependencies remain external QA tooling, not game dependencies. This environment used locally extracted Linux WebKit libraries because system package installation was unavailable; its bundle ran the real WebKit engine. Machine-readable results are in [living-camp-physical-presence-qa-results.json](living-camp-physical-presence-qa-results.json); representative reviewed captures are under `docs/images/living-camp-presence-*`.

Deferred: continuous walking/pathfinding, art-specific portrait relocation, new dialogue/UI engines, physical iPhone verification and retroactive reconstruction of completed legacy witness history.
