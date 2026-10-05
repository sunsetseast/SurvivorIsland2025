# Post-immunity strategic behavior refinement

Baseline current main: `050c11f2beab194acfb690a6cd98112d230f778c` (merged #351). This pass uses #349's physical/time planner, #350's individual minds and #351's coalitions. Cast ratings, Tribal resolution and those architectures are preserved.

[Integration audit](AUDIT.md) · [Exact baseline call-site inventory](BASELINE-INVENTORY.md) · [Validation and limitations](VALIDATION.md)

## Behavioral changes

The existing agenda selector now ranks consequential verification and owned danger first, then plan maintenance, advancing an unsettled vote, missing intelligence and useful coalition opportunities. It evaluates bounded local candidates; owned projections are reused only within one synchronous selection. There is no global combination search, quota, external AI or new clock.

A heard committed supporter is not a swing. A heard committed opponent is not an undecided recruit. Unknown positions usually prompt questions, with late urgent recruiting available when time is nearly gone. A trusted friend may warn someone without belonging to the same formal coalition. Cover stories address an actual target; deceptive contestants do not automatically lie to every outsider. Plausible alternative names use the speaker's evidence, trust and affinity. Backups require a concrete risk and split proposals require both piles to beat the possible opposition. Proposal viability does not guarantee every participant accepts or follows it.

Known sincere coalition consensus holds against unsupported alternate pitches when the owner is committed and has no relevant concern. Once no useful remaining action survives the existing evidence receipts and mutual contact recency, the planner chooses observation or idle camp activity. Urgent new verification can override recent contact. Completed group meetings record every actual pair; disagreement can leave a bounded private loyalty-check intention in the existing individual state.

## Coalition and knowledge integration

NPC strategic bonuses use NPC→player affinity and directional trust. Personally known rosters drive dialogue menus. Ranked personal priorities govern competing commitments; dormant records are not operational blocs. Existing binary membership wrappers remain for identifying social objects and duplicate pacts.

Formation friction uses bounded active strategic load: local operating pacts count by type, commitment and priority; high-priority dormant relationships retain a smaller weight; low-value historical records no longer permanently fill a five-object ceiling. Existing duplicate, recent proposal, physical contact and purpose guards remain.

Outsider disclosure and denial reach Tribal as private **claims**, with roster, confidence, challenge, provenance and attribution retained. Personal membership remains a separate fact kind. Inferred meetings remain observations. Public Jeff knowledge receives none of these private facts. Information relays carry the claimed roster and source chain, not engine confirmation. Returned semantic details can produce low-confidence leak suspicion, never psychic proof or trust loss.

Safety refresh uses owned name mentions, warnings, contradictions, ally hedging, known betrayal and repeated witnessed private groups. Absence remains weak, uncertain evidence. Trusted reassurance can help, but cannot erase several strong contrary accounts. Hidden votes and secret exclusions are not safety inputs. No danger meter or vote dashboard was added.

## Player choices and touched UI

Offers support sincere acceptance and **Agree, but keep your options open**. Both create the accepted social pact; the second privately seeds lower cover commitment and affinity. Proposals have the same bounded choice. NPCs hear acceptance and cannot inspect the player's private commitment. The notebook never labels a pact fake. Player priority answers support honest description, privacy and deliberate reassurance; NPC answers may hedge or maintain cover instead of revealing rankings.

Meeting introductions use their scheduled purpose while dialogue continues to use each speaker's own state. Warning openings and verification wording preserve source attribution. Recap additions report owned alliance claims/denials, backups and conflicting accounts. A small summary-row contrast/font fix keeps those notes readable on the existing light surface; no layout redesign.

## Persistence and replay

Existing strategy serialization carries reciprocal contacts plus contact day, bounded motive receipts, optional follow-up and safety evidence references. Missing fields in old saves default safely; legacy same-day numeric contacts remain useful. Backups retain bounded evidence references that prompted formation: that same concern does not immediately activate insurance, while new owned evidence can. Old backups lacking references retain compatibility behavior. Receipt checks precede resolution side effects, so restore does not reroll a prior response or duplicate warnings/offers/plans. Decorative timestamps are excluded from QA comparisons; semantic times, RNG and receipts are compared.

## Reproduce

```sh
npm test
node --test test/StrategicBehaviorRefinement.test.mjs test/StrategicBehaviorHarness.test.mjs
STRATEGY_QA_SEEDS=4 STRATEGY_QA_ROUNDS=4 STRATEGY_QA_OUTPUT=/tmp/strategy-results.json npm run qa:strategy
PLAYWRIGHT_MODULE=/path/to/playwright npm run qa:strategy:rendered
STRATEGY_QA_BROWSER=webkit PLAYWRIGHT_MODULE=/path/to/playwright npm run qa:strategy:rendered
```

Playwright/browser installations are QA-only and do not add a game dependency. The harness uses actual GameManager JSON payload restore and actual production Tribal ballots/completion, with UI and persistence side effects stubbed. It tests season stretches, not an autonomous whole-season challenge/jury solver.
