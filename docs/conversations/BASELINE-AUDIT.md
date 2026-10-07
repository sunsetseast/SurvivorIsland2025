# Conversation baseline audit

Baseline: `c16b7afa18f8a1637c87da4f80a266ec787189df`, current main / merged #355. Baseline full suite: 682 passed, 0 failed, 0 skipped (`npm test`, Node 24.19.0).

## Actual entry paths

| Entry | Live path | Phase / ownership |
|---|---|---|
| Camp Talk / Approach / Join | CampInteractionSystem.approach → startPlayerConversation → _startConversation → _showTopicSelection → _buildMainTopics → _renderMainMenu / _runConversationNode | Both camp phases; CampActivity reserves physical participants |
| NPC invitation | GAME_PHASE_CHANGED / pre semantic midpoint → _queuePhaseInvitations / _scheduleMeetingInvitation → SocialEngine.pickBestIntentForPlayer → pending meeting → CAMP_VIEW_LOADED → _startConversation → _startNpcInitiatedConversation; post ScrambleActivityPlan approach_player → approach_wait → startNpcConversation → startConversation | Pre uses scheduled intent + overlapping purpose generation; post uses ScrambleStrategy agenda. SocialEngine.showDialogue is a compatibility entry, with no normal production caller found |
| Camp conflict | NPC_CONFRONTATION event → _handleNpcConfrontation → conversation reservation / confrontation UI | Camp only |
| Alliance UI / meeting | startAllianceConversation → _renderAllianceConversation → allianceOpening / allianceChoices | AllianceSystem authorizes membership/proposals; checkpoint stores resolved choices |
| NPC to NPC | CampActivitySystem.complete → CampSocialResolution.resolveNpcCampExchange (pre/shared work), or ScrambleActivityPlan.resolve → ScrambleStrategy.resolveAgenda (post) | Real timed blocks, arrival eligibility, individual speakers |
| NPC group meeting | ScrambleActivityPlan.resolve → AllianceSystem.resolveMeeting → ScrambleStrategy.resolveMeeting | Independent intentions; physically attending members only |
| Save resume | GameManager.restoreSavePayload → systems.deserialize (CampActivity last) → CampScreen presentation → start/resume reserved conversation | Post checkpoint persists; pre reservation/transcript currently dropped |

## Boundaries inspected

ConversationSystem mixes UI/session/navigation, menu generation, stance selection, effects, source selection, deals, local npcMemory, disabled intent/flow renderers and diagnostics. ScrambleConversation is a small post-only semantic adapter. AllianceConversation provides rich authoritative formation, recruitment, exclusion, secrecy, priority, round plan, split and departure flows. ScrambleStrategy owns individual intention, commitments, perceived support, decoys, backup, split, persuasion and final reconsideration. StrategyPhaseSystem wraps phase scheduling and #353–#354 convergence. ScrambleActivityPlan schedules real travel, meetings and approaches.

CampActivitySystem owns timed work/social/travel blocks, arrivals and conversation reservations; CampInteractionSystem owns Join/Watch/Follow/Approach and bounded overhearing. CampSocialResolution resolves pre camp content. CampKnowledge projects owned SocialMemory claims/observations. SocialMemorySystem preserves source chains, contradictions, reliability, promises, betrayal and structured history. AllianceSystem owns formal relationships and individual sincerity/priority. DealSystem owns explicit obligations; DealConsequencesSystem applies known breaches directionally. TribalCouncilSystem consumes existing final intentions; TribalKnowledgeModel projects individual evidence, public ritual and history, excluding global vote boards. GameManager serializes registered systems; SaveManager normalizes/version-wraps payloads.

Relevant tests: all LivingCamp*, CampPhysicalPresence, PreImmunityCampContracts, PostImmunityScramble, StrategicIntelligence, StrategicBehavior*, Alliance*, VoteConvergence*, ConvergenceCertification, StrategyPhaseSystem and Tribal*; rendered harnesses under qa/ include scramble experience, living camp, alliances, strategy and convergence diagnostics.

## Player path inventory

The table below is extracted from current-main live topic builders and follow-up/deal/pick menus. IDs inside a builder include nested branches, not proof that every branch is offered in every context.

| Builder / route | Action and nested branch IDs |
|---|---|
| _buildBuildConnectionNodes | check_in, check_in_push, share_laugh, compliment, compliment_real, compliment_build, bond_one_on_one |
| _buildVibeCheckNodes | camp_vibe, camp_calm, camp_chaos, holding_up, whats_bugging, bugging_align, bugging_disagree, bugging_names, feel_safe, safe_protect, safe_protect_deal, safe_names, strategy_style, strategy_respect, strategy_help_us, strategy, strategy_risky, are_we_good, good_hear, good_fix, good_defensive |
| _buildGossipNodes | close_with, threat, asset, asset_support, asset_danger, asset_neutral, dead_weight, suspicious, name_coming_up, working_together, quick_read |
| _buildIdolTalkNodes | idol_looked, idol_found, idol_player_looked, idol_player_not, idol_found_direct, idol_chatter |
| _buildStrategyNodes | vote_read, vote_read_agree, vote_read_help, pitch_target, deflect_target, backup_plan, offer_deal, alliances, strategy |
| _buildConfrontNodes | call_out_tension, tension_deny, tension_own, tension_source, confront_rumor, rumor_no_name, rumor_name, apologize |
| _showTalkAboutSomeoneSelect | dynamic subject / response selection |
| _showTalkAboutSomeoneAngles | trust_them, how_you_see, dangerous, idol, said_your_name, said_name, aligned_with, loved |
| _buildTalkAboutSomeoneNode | dynamic subject / response selection |
| _showNameSourceFollowup | dynamic subject / response selection |
| _showTargetPitchMenu | strategy |
| _showDealTypeMenu | vote_together, core_alliance, protect, final2, share_info, idol_protect, strategy |
| _showApologyMenu | confront |

Post semantic paths: vote_read, safety_read, not_commit, counter:<target>, commit:<target>, bluff_vote:<target>, share:<owned-claim>, verify:<owned-claim>, bluff_warning:<source>, confront:<claim>, numbers_read, backup:<target>, split_vote:<target>; idol_looked, idol_found, bluff_idol; gossip close_with, known_pair and opinion threat/asset/dead_weight/suspicious. Eligibility derives from current tribe/valid targets/owned claims and group presence.

Alliance paths: pending invitation accept/hedge/refuse; formation alliance/core/final_two/final_three/voting_bloc; discuss/oppose/alternate target, independent commitments, membership recruitment/exclusion, disclosure/concealment, priority, loyalty repair, suspicion, backup, split, secrecy, departure and endgame agreements. Generic Deal routes still contain historical Final Two / alliance names, although _createDeal redirects some active aliases to AllianceConversation. DealSystem itself still permits FINAL_TWO, leaving an ownership boundary to consolidate.

NPC intents: vote_pitch, alliance_pitch, warning, information/verification, check-in and pressure/confrontation derive from purpose weights plus intent normalization pre; post agenda motives include gather_intel, recruit_swing, counter_pitch, check_loyalty, warn_ally, verify_story, share_intel, reassure_target, spread_decoy, establish_backup and alliance motives. No persistent multi-step task lifecycle currently joins those motives.

## Findings

1. One-on-one and group physical reservations are established by CampActivity. Post semantic listeners are distinct, but generic pre responses primarily emphasize the chosen NPC. Group alliance dialogue already preserves per-person positions.
2. Relationship/trust effects and canonical structured/social events coexist with ConversationSystem npcMemory and strategic-memory helpers. These stores overlap; new strategic meaning should live in existing owned SocialMemory claims, not another belief store.
3. Many generic nodes return to a category with no useful semantic continuation. Ask-for-vote, pitch and pressure are not consistently separate. Apology menus can be generic rather than owned-event-specific.
4. Pre idol_looked renders a random yes/no answer and independently draws for nextNodes. Rendered answer and follow-up can disagree. Generic pre gossip/duo/idol suspicion paths read hidden runtime scores. Post owned reads are substantially safer.
5. ownedCampKnowledge deliberately strips hidden truth markers; listeners inherit claims. ScrambleStrategy.statement validates physical co-presence and records attributed sources. shareCampClaim historically copies a claim under its original id and source; deliberate re-sharing/selected details require careful attribution.
6. Post checkpoints cache choice outcomes and random draw receipts. Back is generally navigation. Several legacy paths use independent Math.random/getRandomInt/Date.now and do not persist resolved pre exchanges.
7. Formal vote promises currently have yes/cover semantics, but conditional obligations are not represented in a unified lifecycle. Objectives, delegation, actual task execution and requester reports are missing.
8. save/load preserves post camp activities/routes and semantic checkpoints. Pre conversation reservation is intentionally omitted; ConversationSystem serializes local memory but not live transcript semantics.
9. Tribal convergence remains the right execution boundary: spoken plans must feed individual intention through existing persuasion/commit APIs, never force a group ballot.

## Legacy reachability evidence

A conservative AST member-reference traversal starts from public methods, event subscriptions, all externally referenced methods (including tests/QA), and their transitive this.method references. Constant-disabled entry bodies only traverse their live guard. Diagnostics are kept as roots, so diagnostic-only legacy builders are not misclassified as production routes. No method is deleted based only on age or name. Dynamic member calls require manual review before removal.

Constant LEGACY_INTENT_SYSTEM_DISABLED is true. runConversationExchange returns before its old exchange implementation; _startNodeConversation, _startNodeFlowConversation, deterministic intent entry points, _buildDialogue and _startConversationFlow either route to current topics or return before old bodies. PRE_CHALLENGE_TREE.categories and template/response libraries are empty. The old _showCategoryMenu family is internally connected but has no normal current entry from startPlayerConversation. Old flow and target dialogue builders are unreachable behind those guards; several old confrontation builders survive only because diagnostic validators construct them.

Conservatively unreachable methods before changes:

| Method | Baseline line | Lines |
|---|---:|---:|
| _appendTranscriptLine | 822 | 6 |
| _runNpcApproachPickNode | 2318 | 61 |
| _selectNpcApproachOpenerRoute | 3034 | 25 |
| _openingLineAllowsImmediatePick | 3060 | 4 |
| _nodeRequiresImmediatePick | 3065 | 8 |
| _resolveNpcOpeningLine | 3073 | 13 |
| _buildNpcOpeningFallbackNode | 3087 | 16 |
| _showAllianceDoubtMenu | 4934 | 45 |
| _resolveAllianceDoubt | 4980 | 22 |
| _runExchangeStep | 5471 | 130 |
| _showFollowupOptions | 5602 | 49 |
| _showExchangeOutcome | 5652 | 20 |
| _initializeExchangeState | 5673 | 42 |
| _getPreChallengeChoiceById | 5716 | 7 |
| _buildFollowupPlayerLine | 5734 | 14 |
| _applyFollowupActionEffects | 5749 | 36 |
| _resolveExchangeResponse | 5786 | 32 |
| _resolveExchangeIntel | 5819 | 45 |
| _resolveIntelQuality | 5865 | 12 |
| _upgradeIntelQuality | 5878 | 6 |
| _buildConcreteIntel | 5885 | 39 |
| _getPivotIntelPacket | 5925 | 16 |
| _resolveFollowupDeltas | 5942 | 45 |
| _mergeExchangeDeltas | 5988 | 7 |
| _applyExchangeStepEffects | 5996 | 71 |
| _formatExchangeOutcome | 6068 | 11 |
| _shouldOfferFollowup | 6080 | 6 |
| _shouldBackfirePress | 6087 | 8 |
| _shouldCave | 6096 | 38 |
| _registerPress | 6135 | 13 |
| _logExchangeDebug | 6149 | 8 |
| _makeButtonLabelFromLine | 6205 | 25 |
| _showChallengePerformanceMenu | 7170 | 68 |
| _playerHasRecentNegativeAction | 7631 | 10 |
| _promptTargetSelection | 7642 | 51 |
| _promptRecruitSelection | 7792 | 51 |
| _startNodeConversation | 7987 | 42 |
| _startNodeFlowConversation | 8030 | 51 |
| _isDeterministicIntent | 8082 | 3 |
| _startDeterministicConversation | 8086 | 19 |
| _startDeterministicNodeConversation | 8106 | 51 |
| _buildDeterministicNodes | 8158 | 58 |
| _getNpcSayVerb | 9129 | 5 |
| _formatNpcResponse | 9184 | 5 |
| _buildAllianceInviteDialogue | 11470 | 23 |
| _generateAllianceName | 11494 | 11 |
| _selectIntentResponses | 11915 | 6 |
| _resolveConversationFlow | 11922 | 6 |
| _startConversationFlow | 11929 | 62 |
| _renderConversationStep | 11992 | 258 |
| _advanceConversation | 12251 | 29 |
| _applyFlowChoiceEffects | 12281 | 151 |
| _safeBuildNpcLine | 12461 | 30 |
| _safeFormatConversationLine | 12492 | 15 |
| _buildConfrontRefusalNode | 12902 | 66 |
| _buildConfrontResolutionLine | 13956 | 41 |
| _buildNameDropDetailQuestion | 14011 | 4 |
| _buildNameDropSourceResolution | 14016 | 8 |
| _buildNameDropRefusalResolution | 14025 | 4 |
| _buildNameDropCautionResolution | 14030 | 4 |
| _buildNameDropSupportResolution | 14035 | 4 |
| _buildNameDropDetailResolution | 14040 | 11 |
| _resolveSnitchImpact | 14052 | 10 |
| _pickIntentTemplate | 14110 | 11 |
| _buildRubbingWrongResponse | 14122 | 52 |
| _buildAskIntelDialogue | 14175 | 140 |
| _buildTalkSpecificDialogue | 14316 | 287 |
| _buildPitchTargetDialogue | 14604 | 66 |
| _buildDeflectDialogue | 14671 | 41 |
| _buildVerifyStoryDialogue | 14713 | 52 |
| _buildChallengeDebriefDialogue | 14766 | 69 |
| _buildIdolTalkDialogue | 14836 | 133 |
| _buildSplitVoteDialogue | 14970 | 22 |
| _buildChallengePerformanceDialogue | 14993 | 34 |
| _buildTargetingDialogue | 15028 | 56 |
| _buildHardStrategyLine | 15198 | 18 |
| _buildHardStrategyResponses | 15217 | 17 |
| _describeDeal | 15290 | 20 |
| _getMood | 15461 | 3 |
| _applyApproachStanceBias | 15542 | 8 |
| _resolveApproachInfluence | 15635 | 16 |
| _buildNavOptions | 15952 | 3 |
| _findIdolHolderInTribe | 16666 | 5 |

The conservative scan identifies 3,090 unreachable method lines. Further cleanup is possible after migrating active menu/approach routing and replacing obsolete diagnostics. External helper contracts exercised by existing tests must remain covered.
