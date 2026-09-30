import fs from 'node:fs';
import data from '../src/modules/data/GameData.js';

const arg = key => process.argv[process.argv.indexOf(key) + 1];
const simulation = JSON.parse(fs.readFileSync(arg('--simulation')));
const baseline = JSON.parse(fs.readFileSync(arg('--baseline')));
const skills = JSON.parse(fs.readFileSync(arg('--skills')));
const cast = data.getSurvivors(), fixed = n => n.toFixed(1), percent = n => fixed(n * 100);
const table = (head, rows) => `| ${head.join(' | ')} |\n| ${head.map(() => '---').join(' | ')} |\n` +
  rows.map(row => `| ${row.join(' | ')} |`).join('\n');
const share = (m,key) => m.seconds[key] / Object.values(m.seconds).reduce((a,b) => a+b,0);
const behavior = table(['Contestant','Work %','Social %','Strategy %','Rest %','Idol %','Observe %','Investigate %'],
  cast.map(c => { const m = simulation.production.contestants[c.id];
    return [c.firstName,...['work','social','strategy','rest','idol','observe','investigate'].map(k => percent(share(m,k)))]; }));
const work = (name,type,condition=100,responsible=false) => skills.work.find(r =>
  r.name===name && r.type===type && r.condition===condition && r.responsible===responsible);
const fire = table(['Contestant','Healthy success %','Depleted success %','Healthy Fire role %','Expected healthy attempts'],
  ['Boston Rob','Wendell','Ozzy','Tony','Jay','Cirie','Custom'].map(name => [name,
    percent(work(name,'build_fire').successRate),percent(work(name,'build_fire',20).successRate),
    percent(work(name,'build_fire',100,true).successRate),work(name,'build_fire').expectedAttempts.toFixed(2)]));
const practical = table(['Contestant','Fish output / 100 opportunities','Shelter success %'],
  [...cast.map(c => c.firstName),'Custom'].map(name => [name,fixed(work(name,'fish').outputPer100),percent(work(name,'build_shelter').successRate)]));
const social = table(['Contestant','Cover lie attempts %','Ally idol disclosure %'],skills.social.map(r =>
  [r.name,percent(r.lieRate),percent(r.disclosureRate)]));
const healthTable = values => table(['Scenario / composition','Fire (0–3)','Shelter (0–4)','Water units','Food units','Hunger','Hydration','Rest'],
  Object.entries(values).map(([name,h]) => [name,...['fire','shelter','water','food','hunger','hydration','rest'].map(k => fixed(h[k]/h.phases))]));
const beforeAfter = table(['Scenario','Baseline hunger / hydration / rest','Validated hunger / hydration / rest','Baseline / validated shelter'],
  ['normal','shelter','exhausted','mixed'].map(name => {
    const a=baseline.health[name],b=simulation.health[name];
    return [name,['hunger','hydration','rest'].map(k=>fixed(a[k]/a.phases)).join(' / '),
      ['hunger','hydration','rest'].map(k=>fixed(b[k]/b.phases)).join(' / '),`${fixed(a.shelter/a.phases)} / ${fixed(b.shelter/b.phases)}`];
  }));
const socialTotal = key => Object.values(simulation.production.contestants).reduce((n,m) => n+m[key],0);
const text = `# Living Camp behavior validation

Baseline: current main \`80bf581\`, merged #344. Fixed-seed QA checked September 30, 2026. These measurements describe this harness and revision, not permanent design contracts or exact television behavior.

## Reproduce

\`\`\`sh
npm test
node --test test/LivingCampValidation.test.mjs test/ProductionCampBehavior.test.mjs test/LivingCampActivity.test.mjs test/LivingCampSocialIntelligence.test.mjs
node qa/LivingCampSimulationHarness.mjs --seeds 12 --days 4 --output /tmp/living-camp-final.json
node qa/LivingCampSkillAudit.mjs --output /tmp/living-camp-skills.json
# Run the same harness against 80bf581 in a separate checkout for baseline JSON.
node qa/LivingCampValidationReport.mjs --simulation /tmp/living-camp-final.json --baseline /tmp/living-camp-baseline-final.json --skills /tmp/living-camp-skills.json
git diff --check
\`\`\`

The baseline comparison used this same scenario controller against unmodified #344 runtime code. No render/mobile/browser QA was performed.

## Harness boundaries

The harness runs actual CampActivitySystem decisions/completions, CampBehaviorProfile, CampTime/GameManager needs, location graph, TaskSystem/checkpoint finalization, SocialMemory, relationships, trust, alliances, deals, IdolSystem and owner-specific Strategy handoff. TribalKnowledgeModel checks that private camp memory is never Jeff-public. The singleton dependency of existing Location/Strategy is retained; only UI/storage hooks are stubbed. RNG is scoped to synchronous QA and restored afterward; production randomness is unchanged.

Six production NPCs and one inert observer occupy each tribe. The human contributes nothing and is excluded from NPC need averages. Camp phases last the existing 7,200 game seconds. Actual activity boundaries resolve inside 60-second advances. Existing inter-day tribe consumption runs; no synthetic overnight meal/sleep recovery conceals deficits. This is repeated pre-immunity camp stress, not a complete season/challenge/vote simulation.

Five compositions × nine scenarios × seeds 1–12 × four days = **${simulation.phases.toLocaleString('en-US')} phases** (${simulation.choices.toLocaleString('en-US')} non-travel block starts). Three rotating six-person cast groups × the same scenarios/seeds/days add **${simulation.production.phases.toLocaleString('en-US')} phases** (${simulation.production.choices.toLocaleString('en-US')} starts); every production contestant has equal phase exposure. Total: **${(simulation.phases+simulation.production.phases).toLocaleString('en-US')} phases / ${(simulation.choices+simulation.production.choices).toLocaleString('en-US')} starts**. Rotated duties/positions vary companionship and responsibility. The skill audit adds **${skills.work.reduce((n,r)=>n+r.attempts,0).toLocaleString('en-US')} actual work trials**, and the social audit ${skills.social.reduce((n,r)=>n+r.opportunities*2,0).toLocaleString('en-US')} equal private ally opportunities.

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

${behavior}

Ozzy remains a provider while having substantial social/strategy time. Cirie's social/information allocation exceeds Ozzy's without eliminating work. Tony/Kelley/Russell pursue idols substantially more than Michele/Cirie, but none approach exclusive hunting. Tony investigates more than low-paranoia Yul/Kim. Sandra contributes at a typical rate; leadership does not make her the camp organizer. Russell rests about as much as others and remains very active elsewhere. Kim/Wendell favor useful work while retaining social time. Tyson's idol tendency coexists with ordinary work and measured rest.

In rotating-cast runs, ${socialTotal('directShared')} direct claims, ${socialTotal('hearsayShared')} claim relays, ${socialTotal('gossip')} observation relays, ${socialTotal('lies')} deliberate covers and ${socialTotal('disclosures')} idol disclosures were resolved. ${socialTotal('strategyInterruptions')} work interruptions followed owned urgent information. Cover/disclosure opportunities are sparse in unrestricted camp; the controlled social audit below isolates their underlying tendencies without forcing drama.

The harness also records resource/build outcomes, initiated conversations, shared-work strategy, objective effort, duty-related seconds, ≥180-second duty effort phases, neglect events and mean relationship/trust changes. Duty-time metrics are effort proxies, not proof an objective was successfully completed or that every observer approves. Objective contribution and individual perception remain separate.

## Equal-opportunity practical skills

5,000 trials per contestant/task/condition/responsibility cell, using actual resolveWork. Supplies and needs reset between trials to isolate ability. Healthy = all three needs 100; depleted = all 20. This is controlled sampling, not a second statistical work model. Expected fire attempts are 1/p at fixed measured condition, not an estimate that ignores real phase resource/time costs.

${fire}

Fire's existing curve remains **unchanged**: 0.30 + 0.55 × conditioned fire skill, +0.03 when responsible, bounded at 0.30–0.88. Cirie is meaningfully weaker, elites fail roughly one in five healthy attempts, and the weak/neutral floor avoids lockout. Exhaustion matters without making fire impossible. Fire skill still derives from firemaking/focus/dexterity; campcraft does not enter it.

${practical}

Construction now uses 75% campcraft, 10% dexterity, 10% strength, 5% work drive, followed by the existing modest condition factor. Wendell and Rob are strong builders without equating leadership with technique. Campcraft does not enter fishing/gathering/fire. All previous production ratings/runtime starting fields are unchanged; see [calibration audit](survivor-cast-calibration.md).

## Social delivery and information integrity

2,000 opportunities per contestant in each of two private trusted-ally contexts: an owned sensitive claim suitable for a cover, and an actual undisclosed idol. These are opportunity rates, not expected lies/disclosures per whole camp phase.

${social}

Honesty controls willingness to attempt a cover; deception controls delivery credibility on true and false statements alike. Trust/source reliability still scale listener confidence. An honest capable deceiver rarely lies but can deliver effectively. Low deception reduces initial credibility, never reveals a hidden lie. Later owned contradictory firsthand evidence challenges the prior account and changes trust/reliability once, persisted across reload.

A firsthand owner sharing an existing claim now produces direct_statement, source A, chain [A]. Relays produce hearsay with [A,B], then [A,B,C], capped at five hops. Confidence never increases by transmission. Original participant statements are direct; inference remains speculation through its evidenceOrigin. Legacy saved hearsay is not promoted. Listeners never receive truthfulness:false. Private contents remain in their owners' SocialMemory and feed only those owners' Strategy/Tribal reasoning; Jeff cannot cite them as public facts.

## Survival and coefficient findings

Average end-of-phase NPC health/supplies across the five composition matrix (all four days). Water/food are supply units; hunger/hydration/rest are 0–100 current condition. Shelter is deliberately damaged each day in its stress family.

${healthTable(simulation.health)}

${healthTable(simulation.compositions)}

${beforeAfter}

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
`;
fs.writeFileSync(new URL('../docs/living-camp-behavior-validation.md',import.meta.url),text);
