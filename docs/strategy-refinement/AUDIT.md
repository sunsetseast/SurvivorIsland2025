# Behavioral integration audit

Baseline current main: **050c11f2beab194acfb690a6cd98112d230f778c** (merged #351). Baseline full suite: **540 passed, 0 failed**. #341–#351 are completed foundations.

## Authoritative and compatibility paths

| System | Verified current-main responsibility / gap |
| --- | --- |
| ScrambleStrategy | Authoritative individual intentions, owned statements, adoption, backups/splits and semantic checkpoints. Agenda defaults to recruit_swing without testing the listener's owned commitment; contacts update only the speaker; refresh safety only sums direct warnings. Candidate recency rejects every urgent follow-up alike. |
| ScrambleActivityPlan | Authoritative bounded physical planner. Need-based meetings and priority scheduling preserved. Every available partner yields a four-minute strategy action even when the vote is settled. Meeting purpose is scheduled but not used in content. |
| StrategyPhaseSystem | Owns activation, intended-vote map, board projection, RNG and semantic serialization; old hidden timer/chatter paths disabled. No new clock or strategy store needed. |
| AllianceSystem | Authoritative member affinity, priorities, secrecy, lifecycle, exclusion and fallout. Formation and NPC motive guards count all believed objects, including historical dormant coalitions. Expansion compares listener's actual intention instead of a heard position. |
| AllianceConversation / ConversationSystem | Authoritative bounded coalition dialogue and #350 adapter. Player acceptance has sincere/hedge/decline, but no accepted private cover choice. General stance, split acceptance and ST5 bonus use binary membership. Legacy invite text implies automatic solidarity. |
| SocialMemorySystem / CampKnowledge | Authoritative owned claims, observations, source chains, contradictions and projection. Contradicted statement trust penalty uses symmetric changeTrust despite owner-specific evidence. No new memory engine required. |
| CampSocialResolution / CampActivitySystem | Physical contact, observations, semantic completion and occupancy authoritative. Claim-based trust gain uses symmetric base change; completion lacks group contact recency. |
| SocialEngine | Compatibility pre-camp / general intent planner; Living Scramble delegation stays disabled. Old binary alliance motivation and stale targetId fallback are inappropriate when this planner legitimately runs. Trust direction reads player→NPC for NPC motivation. |
| DealSystem / DealConsequencesSystem | Explicit promises and knowledge-aware objective fallout already work. Preserve contracts and owned consequence receipts; no new promise engine. |
| TrustSystem | Directional override with symmetric base propagation is sound; audit consumers instead of replacing it. |
| TribalKnowledgeModel | Session projection imports personal alliance notebook plus selected camp topics. Outsider disclosure/denial and claimed rosters are omitted. Need distinct owned claim/inference facts, not confirmed membership. |
| TribalCouncilSystem | Asymmetric affinity already protects voter-specific targets. Preserve vote math, resolution, presentation and pacing. Only knowledge projection integration needs changes. |
| PostChallengeSummaryView | Uses player-visible strategy facts and owned recap, but generic mention wording does not identify alliance disclosure/denial and contradiction uncertainty. Small wording additions only. |
| Save/load | GameManager production payload already persists strategy minds, RNG, camp reservations, memories, coalitions and completion receipts. Extend existing state defaults for bounded follow-up/cooldown receipts and symmetric contact, without DOM. |
| Existing harnesses | #350 six controlled scramble families; #351 twelve controlled alliance families with actual Tribal and production save/restore. They validate mechanisms, but staged plans are not evidence of organic motive emergence. Add natural seeded multi-round runs separately. |

## Every membership / commitment consumer

[Exact baseline inventory](BASELINE-INVENTORY.md).

- AllianceSystem getSharedAlliances/areAllied definitions and canForm duplicate-type guard: **A, shared social object**. Keep binary membership for duplicate formation, never protection.
- AllianceSystem npcMotive shared relationships: **A** to locate existing pacts; operational/priority and **C** heard vote checks govern their usefulness.
- AllianceSystem ensureNpcCommitments/clearCommitment: **D**, compatibility highest personal priority projection. Retain independent rankings.
- SocialMemorySystem getter: compatibility projection, **D**, no exclusive loyalty guarantee.
- ConversationSystem _buildNpcAlliancePlan and legacy _resolveNpcAllianceIntentState: **C/A**, personally known relationship for dialogue/recommitment; consent is still required.
- ConversationSystem ST5 effects, _evaluateDealResponse split and _computeNpcStance: **B**, NPC→player actual affinity; migrate. Stance trust must use NPC→player.
- ConversationSystem computeAllianceAcceptChance: **D/C**, weighted relevant personal priorities and known roster; replace exclusive primary penalty.
- ConversationSystem _buildAllianceInviteDialogue: **C**, shared claim does not imply “solid”; route existing coalition conversation and offer overlapping pacts.
- SocialEngine _planIntentForNpc: **B/C/D**, NPC affinity, personally known relationships and meaningful local ranked plan; no stale generic target.

## Behavioral findings

All requested defects are reproducible as integration/selection limitations, not missing architecture. Natural backups and splits exist in meeting resolution, but the baseline split guard (four attendees and 2/3 allocation) does not ensure both piles beat the opposition. Verification can follow attributed claims, but the default recruiting fallback dominates and repeated evidence is not individually cooled down. Decoys are created only while planning reassurance against one's actual target, choosing the first eligible alternate without plausibility ranking. Leaks already pass through real conversations but need purposeful selection, chain continuity and owner-only inference. Stable vote maintenance currently has no explicit settled-action exit.

Changes in this pass must remain bounded within these systems, use actual physical contact and camp time, and preserve individual intentions and knowledge. No production contestant attributes, external AI, new clock, new memory store, global voter dashboard or danger meter.
