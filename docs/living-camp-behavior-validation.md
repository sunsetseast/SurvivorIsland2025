# Living Camp behavior validation

Baseline: current main `80bf581`, merged #344. Fixed-seed QA checked September 30, 2026. These measurements describe this harness and revision, not permanent design contracts or exact television behavior.

## Reproduce

```sh
npm test
node --test test/LivingCampValidation.test.mjs test/ProductionCampBehavior.test.mjs test/LivingCampActivity.test.mjs test/LivingCampSocialIntelligence.test.mjs
node qa/LivingCampSimulationHarness.mjs --seeds 12 --days 4 --output /tmp/living-camp-final.json
node qa/LivingCampSkillAudit.mjs --output /tmp/living-camp-skills.json
# Run the same harness against 80bf581 in a separate checkout for baseline JSON.
node qa/LivingCampValidationReport.mjs --simulation /tmp/living-camp-final.json --baseline /tmp/living-camp-baseline-final.json --skills /tmp/living-camp-skills.json
git diff --check
```

The baseline comparison used this same scenario controller against unmodified #344 runtime code. No render/mobile/browser QA was performed.

## Harness boundaries

The harness runs actual CampActivitySystem decisions/completions, CampBehaviorProfile, CampTime/GameManager needs, location graph, TaskSystem/checkpoint finalization, SocialMemory, relationships, trust, alliances, deals, IdolSystem and owner-specific Strategy handoff. TribalKnowledgeModel checks that private camp memory is never Jeff-public. The singleton dependency of existing Location/Strategy is retained; only UI/storage hooks are stubbed. RNG is scoped to synchronous QA and restored afterward; production randomness is unchanged.

Six production NPCs and one inert observer occupy each tribe. The human contributes nothing and is excluded from NPC need averages. Camp phases last the existing 7,200 game seconds. Actual activity boundaries resolve inside 60-second advances. Existing inter-day tribe consumption runs; no synthetic overnight meal/sleep recovery conceals deficits. This is repeated pre-immunity camp stress, not a complete season/challenge/vote simulation.

Five compositions × nine scenarios × seeds 1–12 × four days = **2,160 phases** (227,194 non-travel block starts). Three rotating six-person cast groups × the same scenarios/seeds/days add **1,296 phases** (135,777 starts); every production contestant has equal phase exposure. Total: **3,456 phases / 362,971 starts**. Rotated duties/positions vary companionship and responsibility. The skill audit adds **1,140,000 actual work trials**, and the social audit 72,000 equal private ally opportunities.

## Scenario matrix

| Family | Controlled input |
| --- | --- |
| normal | Moderate initial supplies, unfinished fire/shelter; subsequent days carry actual state. |
| shortage | Daily water/food/wood setback and weakened fire. |
| shelter | Daily damaged roof; bamboo available, palms must actually be gathered. |
| exhausted | First-day rest 12/hunger 30, with normal ongoing needs and recovery. |
| idol | Stable camp, hidden search opportunity; an actual private holder can disclose an idol. |
| volatility | Selected owners receive an urgent warning after ten semantic camp minutes. |
| paranoia | Selected owners previously witnessed three absences by a subject. No private content is granted. |
| alliance | Stable camp and trusted pairs; private advantage-disclosure opportunity. |
| mixed | Supply setback, urgent warnings and owner-specific repeated absence. |

Provider: Ozzy/Wendell/Rob/Kim/Jeremy/Sandra. Strategist: Cirie/Parvati/Tony/Natalie/Carolyn/Yul. Low-work: Russell/Tyson/Cirie/Parvati/Carolyn/Michele. Low-campcraft: Jay/Cirie/Andrea/Kelley/Michele/Carolyn. Balanced: Ozzy/Tony/Cirie/Sandra/Wendell/Jeremy. These composition names are QA shorthand, never gameplay name conditions. Idol/alliance currently share their stable opportunity inputs; they are not independent replications of different mechanics.

## Production time allocation

Percentages include all elapsed NPC time, including unfinished blocks. Travel and idle account for the remaining percentage. Work conversations share work time and are not counted again as a separate time cost. Starts can be interrupted or fail to secure a companion; initiated-conversation counts are not transcripts or guaranteed completed exchanges.

| Contestant | Work % | Social % | Strategy % | Rest % | Idol % | Observe % | Investigate % |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Ozzy | 24.3 | 18.5 | 12.0 | 13.3 | 6.9 | 2.8 | 3.1 |
| Jay | 21.5 | 18.4 | 12.7 | 13.1 | 8.3 | 3.5 | 3.6 |
| Natalie | 23.6 | 17.3 | 13.5 | 12.6 | 7.0 | 3.3 | 3.7 |
| Boston Rob | 22.7 | 18.3 | 13.0 | 12.3 | 6.5 | 3.8 | 4.0 |
| Andrea | 22.0 | 19.4 | 13.0 | 14.3 | 5.5 | 3.4 | 4.2 |
| Jeremy | 21.9 | 18.3 | 12.3 | 13.7 | 9.7 | 2.8 | 2.5 |
| Yul | 23.5 | 20.1 | 12.7 | 14.2 | 6.2 | 2.1 | 2.3 |
| Kim | 24.7 | 19.3 | 11.7 | 12.9 | 7.8 | 1.6 | 2.4 |
| Tony | 20.4 | 18.0 | 12.1 | 11.9 | 10.0 | 4.7 | 5.0 |
| Cirie | 21.3 | 22.2 | 14.5 | 14.9 | 0.9 | 3.7 | 4.5 |
| Sandra | 22.8 | 20.6 | 12.5 | 13.7 | 4.5 | 2.9 | 3.9 |
| Kelley | 21.3 | 17.6 | 12.5 | 12.5 | 10.6 | 4.2 | 3.4 |
| Parvati | 20.8 | 20.4 | 12.6 | 13.4 | 8.7 | 2.6 | 3.1 |
| Michele | 21.9 | 24.4 | 11.4 | 13.5 | 2.8 | 3.9 | 4.7 |
| Wendell | 25.1 | 22.8 | 12.2 | 12.9 | 3.7 | 2.2 | 3.0 |
| Tyson | 19.7 | 19.4 | 13.0 | 13.5 | 9.6 | 2.9 | 3.1 |
| Carolyn | 19.7 | 17.6 | 13.2 | 13.2 | 9.1 | 4.2 | 5.0 |
| Russell | 17.8 | 17.5 | 13.7 | 12.8 | 10.7 | 5.3 | 4.6 |

Ozzy remains a provider while having substantial social/strategy time. Cirie's social/information allocation exceeds Ozzy's without eliminating work. Tony/Kelley/Russell pursue idols substantially more than Michele/Cirie, but none approach exclusive hunting. Tony investigates more than low-paranoia Yul/Kim. Sandra contributes at a typical rate; leadership does not make her the camp organizer. Russell rests about as much as others and remains very active elsewhere. Kim/Wendell favor useful work while retaining social time. Tyson's idol tendency coexists with ordinary work and measured rest.

In rotating-cast runs, 967 direct claims, 265 claim relays, 2947 observation relays, 7 deliberate covers and 19 idol disclosures were resolved. 349 work interruptions followed owned urgent information. Cover/disclosure opportunities are sparse in unrestricted camp; the controlled social audit below isolates their underlying tendencies without forcing drama.

The harness also records resource/build outcomes, initiated conversations, shared-work strategy, objective effort, duty-related seconds, ≥180-second duty effort phases, neglect events and mean relationship/trust changes. Duty-time metrics are effort proxies, not proof an objective was successfully completed or that every observer approves. Objective contribution and individual perception remain separate.

## Equal-opportunity practical skills

5,000 trials per contestant/task/condition/responsibility cell, using actual resolveWork. Supplies and needs reset between trials to isolate ability. Healthy = all three needs 100; depleted = all 20. This is controlled sampling, not a second statistical work model. Expected fire attempts are 1/p at fixed measured condition, not an estimate that ignores real phase resource/time costs.

| Contestant | Healthy success % | Depleted success % | Healthy Fire role % | Expected healthy attempts |
| --- | --- | --- | --- | --- |
| Boston Rob | 82.3 | 72.0 | 84.9 | 1.21 |
| Wendell | 81.3 | 71.2 | 84.7 | 1.23 |
| Ozzy | 79.2 | 68.8 | 82.0 | 1.26 |
| Tony | 79.1 | 68.8 | 81.4 | 1.26 |
| Jay | 50.0 | 46.4 | 53.4 | 2.00 |
| Cirie | 45.8 | 42.4 | 49.1 | 2.18 |
| Custom | 58.0 | 51.3 | 61.2 | 1.72 |

Fire's existing curve remains **unchanged**: 0.30 + 0.55 × conditioned fire skill, +0.03 when responsible, bounded at 0.30–0.88. Cirie is meaningfully weaker, elites fail roughly one in five healthy attempts, and the weak/neutral floor avoids lockout. Exhaustion matters without making fire impossible. Fire skill still derives from firemaking/focus/dexterity; campcraft does not enter it.

| Contestant | Fish output / 100 opportunities | Shelter success % |
| --- | --- | --- |
| Ozzy | 401.1 | 72.4 |
| Jay | 344.6 | 62.1 |
| Natalie | 303.6 | 63.6 |
| Boston Rob | 323.6 | 75.2 |
| Andrea | 307.5 | 64.6 |
| Jeremy | 306.9 | 61.5 |
| Yul | 303.1 | 61.9 |
| Kim | 309.2 | 64.1 |
| Tony | 272.4 | 68.1 |
| Cirie | 286.0 | 60.9 |
| Sandra | 341.6 | 61.2 |
| Kelley | 307.3 | 61.3 |
| Parvati | 286.5 | 62.3 |
| Michele | 287.5 | 63.5 |
| Wendell | 322.2 | 77.6 |
| Tyson | 301.8 | 60.7 |
| Carolyn | 294.8 | 63.4 |
| Russell | 274.1 | 62.1 |
| Custom | 299.7 | 60.6 |

Construction now uses 75% campcraft, 10% dexterity, 10% strength, 5% work drive, followed by the existing modest condition factor. Wendell and Rob are strong builders without equating leadership with technique. Campcraft does not enter fishing/gathering/fire. All previous production ratings/runtime starting fields are unchanged; see [calibration audit](survivor-cast-calibration.md).

## Social delivery and information integrity

2,000 opportunities per contestant in each of two private trusted-ally contexts: an owned sensitive claim suitable for a cover, and an actual undisclosed idol. These are opportunity rates, not expected lies/disclosures per whole camp phase.

| Contestant | Cover lie attempts % | Ally idol disclosure % |
| --- | --- | --- |
| Ozzy | 2.3 | 12.2 |
| Jay | 3.4 | 14.9 |
| Natalie | 4.5 | 16.3 |
| Boston Rob | 3.8 | 13.0 |
| Andrea | 2.7 | 10.0 |
| Jeremy | 1.5 | 23.6 |
| Yul | 0.8 | 19.9 |
| Kim | 2.6 | 17.1 |
| Tony | 7.6 | 11.9 |
| Cirie | 3.6 | 11.4 |
| Sandra | 2.5 | 22.1 |
| Kelley | 4.9 | 6.8 |
| Parvati | 5.5 | 27.7 |
| Michele | 1.5 | 17.5 |
| Wendell | 1.6 | 13.6 |
| Tyson | 4.4 | 7.8 |
| Carolyn | 2.8 | 6.8 |
| Russell | 7.1 | 16.7 |

Honesty controls willingness to attempt a cover; deception controls delivery credibility on true and false statements alike. Trust/source reliability still scale listener confidence. An honest capable deceiver rarely lies but can deliver effectively. Low deception reduces initial credibility, never reveals a hidden lie. Later owned contradictory firsthand evidence challenges the prior account and changes trust/reliability once, persisted across reload.

A firsthand owner sharing an existing claim now produces direct_statement, source A, chain [A]. Relays produce hearsay with [A,B], then [A,B,C], capped at five hops. Confidence never increases by transmission. Original participant statements are direct; inference remains speculation through its evidenceOrigin. Legacy saved hearsay is not promoted. Listeners never receive truthfulness:false. Private contents remain in their owners' SocialMemory and feed only those owners' Strategy/Tribal reasoning; Jeff cannot cite them as public facts.

## Survival and coefficient findings

Average end-of-phase NPC health/supplies across the five composition matrix (all four days). Water/food are supply units; hunger/hydration/rest are 0–100 current condition. Shelter is deliberately damaged each day in its stress family.

| Scenario / composition | Fire (0–3) | Shelter (0–4) | Water units | Food units | Hunger | Hydration | Rest |
| --- | --- | --- | --- | --- | --- | --- | --- |
| normal | 3.0 | 4.0 | 48.6 | 34.2 | 66.6 | 65.5 | 85.7 |
| shortage | 3.0 | 4.0 | 44.0 | 17.8 | 66.8 | 65.8 | 79.0 |
| shelter | 3.0 | 3.6 | 43.4 | 110.9 | 67.3 | 66.5 | 69.9 |
| exhausted | 3.0 | 4.0 | 41.5 | 12.2 | 61.6 | 64.7 | 41.7 |
| idol | 3.0 | 4.0 | 43.3 | 30.4 | 66.8 | 65.7 | 87.0 |
| volatility | 3.0 | 4.0 | 46.5 | 29.2 | 66.6 | 65.5 | 83.7 |
| paranoia | 3.0 | 4.0 | 47.1 | 32.7 | 66.9 | 65.8 | 85.1 |
| alliance | 3.0 | 4.0 | 43.3 | 30.4 | 66.8 | 65.7 | 87.0 |
| mixed | 3.0 | 4.0 | 42.9 | 16.1 | 66.6 | 65.6 | 75.6 |

| Scenario / composition | Fire (0–3) | Shelter (0–4) | Water units | Food units | Hunger | Hydration | Rest |
| --- | --- | --- | --- | --- | --- | --- | --- |
| provider | 3.0 | 4.0 | 46.9 | 42.1 | 66.3 | 65.7 | 77.1 |
| strategist | 3.0 | 4.0 | 44.1 | 30.2 | 65.8 | 65.4 | 77.4 |
| lowWork | 3.0 | 3.9 | 42.8 | 28.9 | 66.3 | 65.7 | 77.3 |
| lowCampcraft | 3.0 | 3.9 | 43.6 | 34.3 | 66.4 | 65.8 | 77.2 |
| balanced | 3.0 | 3.9 | 45.2 | 38.8 | 66.3 | 65.7 | 76.9 |

| Scenario | Baseline hunger / hydration / rest | Validated hunger / hydration / rest | Baseline / validated shelter |
| --- | --- | --- | --- |
| normal | 50.0 / 40.0 / 61.2 | 66.6 / 65.5 / 85.7 | 3.2 / 4.0 |
| shelter | 50.0 / 40.0 / 41.7 | 67.3 / 66.5 / 69.9 | 0.9 / 3.6 |
| exhausted | 2.5 / 40.0 / 3.1 | 61.6 / 64.7 / 41.7 | 3.5 / 4.0 |
| mixed | 50.0 / 40.0 / 57.2 | 66.6 / 65.6 / 75.6 | 3.5 / 4.0 |

#344 could accumulate supplies while NPC hydration/hunger fell to zero, and exhausted rest stayed near zero. NPCs now eat/drink real shared stock at supply locations after an already-timed block, only below 60 (one unit restores 12). Player interactions are unchanged. NPC foraging supplies one needed palm within its existing contribution event, eliminating a roof-material deadlock. Completed six-minute rest restores 6 instead of 2; work-choice pressure modestly falls with exhaustion (0.5–1 multiplier). Need/survival interval rates are unchanged.

Measurement also found unnecessary stockpile growth/role chores after camp was covered. Routine work base falls from 0.20 to 0.05; covered-role bonus from 1.40 to 0.05. Actual shortage pressure remains 2.40 and unmet-role bonus 1.40. Leadership response is unchanged. This leaves room for social play without weakening emergency cooperation. Healthy fire/shelter choices disappear; tending requires wood. Personal hunt limits stop already-blocked searches without using someone else's secret find. A block started just before Tree Mail no longer gets a full outcome after only its remaining few seconds.

Deliberately unchanged: fishing output/attraction, fire success/floor, shelter success curve, shortage/leadership coefficients, paranoia/investigation weights, idol opportunity/social-risk weights, travel/activity durations, urgent-strategy interruption chance, ally idol-disclosure chance and player minigames. Lie willingness remains rare and bounded; only a small honest-player floor and deception delivery factor were added. No contestant's approved ratings were retuned.

## Persistence and regression

**270/270 tests pass**, including all existing Day 1, Living Camp, production behavior, Strategy, Tribal, challenge/Last Flag, SeasonEngine and save tests, plus 18 new validation tests. Targeted Living Camp tests and git diff --check pass. No existing passing test was removed or weakened.

Four-day uninterrupted/reloaded semantic snapshots match in all nine families, saving midway every phase through GameManager.createSavePayload/restoreSavePayload with identical RNG continuation. Comparison includes pending/resolved activity IDs, resources, needs/rest fractions, owned provenance/source chains, completed social outcomes, relationships/trust, role/reputation state, alliances and Strategy handoffs. Logging wall-clock metadata is excluded; gameplay state is compared. Repeat runs with the same seed match. Old saves retain their own ratings and neutral missing campcraft.

The audit found alliance restore recomputing earned cohesion from current relationships. It now retains valid saved cohesion (bounded 0–100), with existing computation only for absent/invalid values. No alliance decision architecture changed. New tests protect entire #344 contestant objects, construction independence, direct/relay chains, honest/deceptive profiles, hidden truth, once-only contradiction consequences, blocked searches, late partial work, real sustenance, palm contribution idempotence, context overrides, composition viability and production diversity.

## Limits and next pass

This does not prove arbitrary-seed or whole-season balance. Fixed six-NPC tribes, stationary observer, paired alliances, forced daily stressors and no challenge/weather/elimination changes limit ecological realism. The harness exercises Strategy target seeding and Tribal knowledge projections, not complete post-challenge negotiations/voting. Existing suites protect those flows. It does not run twitch minigames or render UI.

Strong provider tribes have more surplus; low-work tribes remain viable. Stable fire/shelter persist unless scenario inputs weaken them. Food can still accumulate, especially when parallel roof-material foraging also brings food. Avoid adding spoilage/weather or increasing player costs to disguise this; real season-level consumption and coordinated task choice need later playtesting. Investigation choice frequency is measured, not proof that every investigation uncovers useful evidence. Private conversations/advantage disclosures remain constrained by real co-presence; many attempted social blocks bond or await another opportunity. More deliberate privacy seeking/group coordination is a follow-up, not a hidden rewrite here.

Next Living Camp pass: **experiential presentation**—organic camp groups, visibly working NPCs, walking off together, whispers, following/investigation feedback, observable suspicion, overhearing, contextual conversation initiation, visual social clusters and subtle player-readable storytelling. None of those visual systems is implemented in this validation PR.
