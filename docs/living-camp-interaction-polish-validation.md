# Living Camp interaction and mobile validation

Base: current main `f1c668a3c06843cf432a03907a58a315b469b656` (merged #346). #341–#346 remain the foundation. Baseline: **304/304** tests passing. Main was checked again before preparing this PR and had not moved.

## Inspection and required fixes

Read the production CampInteractionSystem, CampPresentation, NpcAutoRenderer, CampActivitySystem start/travel/completion, NpcLocationSystem, ConversationSystem entry/close, SocialMemory observation/pruning/persistence, CampScreen navigation/event gates, physical views, SummaryView, IdolPossession, living-camp.css, #346 fixture/tests and save/load reconstruction. Confirmed all three bugs in code and regression fixtures: Follow survived leaving its witnessed origin; Approach interrupted a group without walking time; live narration acknowledged all pending observations while displaying only one.

- **Follow eligibility:** direct Follow requires the player's current physical location to equal the witnessed departure's `fromLocation`. Navigation marks the owned departure `followMissed`; returning within 180 seconds or reloading cannot revive it. Target return, absence/elimination, expiry, an attempted Follow, camp events, Tree Mail and phase/end gates close the opening. Target-return notification uses the existing location update. No route-back teleport was added.
- **Follow time/consequences:** the existing **120 seconds** remain. NPCs and needs progress; losing a still-traveling target grants no firsthand result. Successful observation remains player-owned. Being caught still costs only the existing small personal trust/relationship adjustment, with a player-owned observable beat added. Ordinary results avoid redundant wording such as “tending the fire near the fire.”
- **Approach timing:** one exported `APPROACH_SECONDS = 45` is charged only when choosing Approach, for public and private groups alike. UI opening is free. An explicit `approach` player block prevents the well/shelter from mistakenly counting the walk as work. Recheck the exact activity ID and current co-presence after time advances; an ended/relocated group produces “already moved on,” without reviving or interrupting it. Approaching alone gives no relationship, trust or team-player reward.
- **Approach spam:** an owned attempt and `approachedByIds` on the actual shared activity allow one reaction. Returning to an accepted, unchanged activity offers Join without another walk/reroll; a rejected activity ends/changes. Old objects cannot operate on the new activity. The semantic guard survives memory pruning and JSON restore. Existing conversation time is still charged separately on chat close.
- **Narration:** a presentation-only queue holds at most **three pending beats**, sorted by salience then age. The displayed beat gets **5.5 seconds** to read; pending beats expire after **180 game seconds or 22 wall seconds**. Story keys merge duplicates and suppress replay; repeated witnessed departures can escalate once into an owned pattern. Routine arrivals/work/ordinary solitary departures remain visual. High priority includes actual overheard statements, caught Follow, visible searches, guarded conversations, public conflict and the player's name. Only player-owned direct witness/participant observations and actually overheard owned claims enter it. No AI intentions or other owners' memories are read.

No save migration: missed openings and approach guards use existing observation/activity serialization. Narration, dialog, focus, Helping hint, expansion and animation state are transient. Reload seeds the queue with existing observation IDs, closes stale sheets and reconstructs nearby groups without replaying evidence.

## Concrete presentation/playtest findings

| Issue found | Small correction |
| --- | --- |
| Runtime assigns a route-step destination at travel start; portraits appeared there before the 45-second step finished | Keep the runtime route/location contract. Exclude `travel` from arrived/talkable presence; show witnessed origin departure chips, paired portraits/direction, then a short arrival cue on semantic completion. No separate movement clock. |
| A new departure's Follow control waited for the next clock tick; paired updates could rebuild halfway through assembly | Publish one activity-change event after the complete start/observation operation; skip intermediate activity-driven location refreshes. |
| Unrelated state changes recreated unchanged portraits; Boston Rob crowded the next name | Reuse cards by their stable projection and leave more portrait spacing for names. Arrival motion applies only to newly present people and honors reduced motion. |
| Workers and ordinary conversation were visually similar | Small work/rest/quiet badges retain readable activity text. Public groups can voice existing shared water/wood/fire/shelter needs; private groups never get atmospheric speech. |
| Mobile Shelter supplies covered nearby people; Fire supplies covered its Helping control | Move those supply banners clear of the rail. Hide secondary Fire supplies during the challenge. |
| Fire spiral extended below landscape navigation | Scale its existing canvas presentation to the short viewport, preserving its drawing coordinates, input and formulas. Stop its existing animation loop after its canvas detaches. |
| The inherited fixture omitted the clock; full-HUD captures exposed overlap with landscape Fire rings, location text and recap headings | Render the production clock without a wall-clock timer in QA; reserve its real space and assert separation. |
| Landscape Join put End chat below the viewport | Camp-only landscape CSS uses a compact avatar beside the existing scrollable conversation and a reachable 44px exit. Existing topic/dialogue mechanics are unchanged. |
| Opening/closing an interaction could leave focus on the body or a removed control | Restore to connected controls; focus the existing conversation on entry and use its existing close hook to return focus after activities release. Stale/disappeared sheets close. |
| Help Shelter still denied an unassigned player despite a visible shelter worker | A transient Help hint validates that exact current worker/activity and allows the existing cooperative build flow with that partner. Ordinary assignment gates remain. |
| Fishing returned to Beach; its old container listener survived exit and charged another five minutes on Shelter clicks | Return to Rocky Shore, remove the listener/timer/animation on exit, ignore in-flight rapid taps and abandon callbacks after leaving. The existing attempt still costs exactly 300 seconds. |
| Fishing/Fire/Summary debug banners appeared in normal play; recap text could scroll beneath Continue and its title sat under the task shortcut | Gate those banners by debug mode, reserve navigation space in the existing recap scroller and hide the task shortcut while reviewing recap. |

Native encounter sheets use bounded `dvh`, safe-area allowances, contained touch scrolling and reachable actions. Navigation reserves the safe-area inset. Event-driven signatures remain; no polling, MutationObserver, pathfinding or new animation/dialogue/memory engine was added. The scenery and responsive presence rail remain; mobile readability took precedence over speculative in-art re-anchoring.

## Rendered QA

Production CampScreen, location/minigame renderers, activities, clock, conversation and SocialMemory; controlled scene setup only. **128 scene checks per engine (256 total)**, with additional interaction/minigame/recap captures and assertions:

| Viewport | Chromium 141.0.7390.37 | Linux Playwright WebKit 26.5 |
| --- | --- | --- |
| 375×812 | Pass | Pass |
| 430×932 | Pass | Pass |
| 844×390 | Pass | Pass |
| 1280×800 | Pass | Pass |

The inherited 96 scenes remain: six locations × 1/2/3/6 people × four sizes. Another 32 variations cover Beach public/private groups; Campfire workers/public speech; Shelter work/rest/private groups; Jungle search ambiguity/follower movement; Rocky Shore fishers/conversation; Water Well private groups. Reviewed screenshots, not just geometry: scenery visibility, crowd scrolling, names, private cues, contrast, supplies, sheets, departure/arrival order and landscape exits. Crowds intentionally scroll inside the rail; scenery remains visible above/beside it.

Browser checks include: free sheet opening versus 45-second Approach; conversation ending during the walk; group disappearance/focus; missed Follow across navigation and reload; 120-second Follow; paired route arrival after semantic completion; stable portrait DOM; both queued high-salience beats with readable dwell; queue reset with preserved memory; dialog Escape/focus/resize; reduced motion; actual Join/exchange/exit; Help fishing/shelter/fire at portrait and landscape sizes; one work-time charge; Fishing rapid taps and no orphan charge in the next view; reputation ingestion idempotence; readable recap scrolling above Continue. **No uncaught page errors** in either engine.

**No physical iPhone, iOS simulator or Apple Safari was tested.** Linux WebKit is an additional engine check, not an iPhone claim. Actual safe-area hardware, browser-chrome viewport contraction and on-screen keyboard behavior remain device-validation items; these Living Camp sheets have no text-entry fields.

## Gameplay sequences and observations

Five 24-step sequences per engine start from the production cast, six NPCs, two camp hours and seeded natural activity selection (seeds 47–51). No NPC choices are forced after setup. Players use local groups/witnessed departures, never the NPC location map. Meaningful minigame and conversation steps use the real UI; clock pacing and Watch/Approach/Follow decisions use production methods. This is a camp-loop playtest, not a full-season or human physical-device playthrough.

| Player | Played/observed | Remaining time | Completed NPC blocks |
| --- | --- | --- | --- |
| Passive | Lingered at Beach; witnessed departures, quiet stretches and continuing offscreen work | 96:00 | 10 |
| Worker | Filled tribe water through the existing 35-minute flow; separate controlled Help runs played Fishing, cooperative Shelter and Fire | 56:30 | 10 |
| Social | Five Approaches: moved-on, three welcomed chats with real exchanges, and a guarded relocation; navigated nearby locations | 79:45 | 6 |
| Spy | Three Watches with no guaranteed intel; seven Follows, including ordinary work and lost trails | 72:30 | 15 |
| Mixed | Work + Approach/Join/exchange + Watch + eight Follows + navigation; only 28:45 left while 18 NPC blocks completed | 28:45 | 18 |

Both engines produced the same semantic sequence metrics. Mixed ended with 48 owned observations and 11 distinct local group snapshots. Helping with water made a real stockpile increase; duplicate ingestion did not add reputation again. No economy coefficients changed: a quiet/passive Beach can miss busy life elsewhere, and this bounded pass does not establish a need for economy rebalancing.

| Playtest question | Answer / limit |
| --- | --- |
| Do NPCs feel busy; do groups form/break? | Yes nearby: ongoing work, shared work, social arrivals and guarded relocation; 6–18 completed blocks per sequence. Beach also has quiet stretches. |
| Is location legible without a map? | Current people/activity and witnessed directions are clear. Distant activity remains unknown. |
| Is Follow useful/risky? | Ordinary work can be found; trails are often lost; time is substantial. The caught/personal-consequence branch is covered by regression tests, not encountered in these natural seeds. |
| Is Watch interesting without guaranteed intel? | It explicitly describes a minute lingering; these natural Watches yielded no usable statement. Audibility/owned statements are covered in controlled tests. |
| Can strategy be disrupted cheaply? | Every real approach walks for 45 seconds; each original activity reacts once. Stale objects cannot interrupt its replacement. |
| Does time matter; is helping integrated? | Mixed spent over 90 minutes; NPCs/needs continued through walks, chats, tracking and work. Help uses existing task UI and rewards once. |
| Are quiet moments and missed events possible? | Yes; passive nearby evidence stayed sparse while NPC work continued. Work/travel can miss social beats; expired narration is intentionally restrained. |
| Are there too many modals? | Choice and outcome remain two short encounter stages; Join enters the existing topic menu. No additional sheet was introduced; Help opens its existing task directly. |
| Does movement still look teleporty? | The premature destination portrait is gone; departures and arrivals are ordered. It is still semantic route-step presentation, not continuous walking. |
| Does recap match local memories? | Yes: reviewed production recap captures and retained owner-bound recap tests; unseen strategy does not appear. |
| Does mobile feel cramped? | Small crowds are readable. Six-person rails intentionally scroll; supply and landscape exit overlap were fixed. More scenery anchoring is deferred. |

## Automated validation and scope

Final `npm test`: **318/318 passing**. Focused activity, presentation, narration, social-intelligence, behavior-validation/production behavior and save/load contract suites: **150/150 passing**. Existing JSON activity/memory/GameManager restore, completed-work/reputation idempotence, Day 1, SeasonEngine, Strategy and Tribal coverage remains. `git diff --check` passed.

Protected scope is unchanged: contestant ratings/campcraft, behavior-profile coefficients, fishing/fire formulas, camp economy, idol-hunt/paranoia weights, Strategy target math and Tribal knowledge. No coefficients were adjusted. Continuous movement, new art, broader cast/AI tuning, dialogue redesign and physical iOS testing are intentionally deferred.

Reproduce with an external Playwright install (no game dependency added):

```sh
npm test
node --test test/LivingCampPresentation.test.mjs test/LivingCampNarration.test.mjs test/LivingCampActivity.test.mjs test/LivingCampSocialIntelligence.test.mjs test/LivingCampValidation.test.mjs test/ProductionCampBehavior.test.mjs test/PreImmunityCampContracts.test.mjs test/SeasonEngine.test.mjs
node qa/LivingCampRenderedQA.mjs
CAMP_QA_BROWSER=webkit node qa/LivingCampRenderedQA.mjs
git diff --check
# Optional: PLAYWRIGHT_MODULE, CHROMIUM_EXECUTABLE_PATH, CAMP_QA_OUTPUT
```

Representative captures: [witnessed departure](images/living-camp-polish-departure.png), [quiet group on WebKit](images/living-camp-polish-well.png), [landscape Join](images/living-camp-polish-join.png), [landscape Fire](images/living-camp-polish-fire.png). Machine-readable engine/scenario results: [QA results](living-camp-polish-qa-results.json).
