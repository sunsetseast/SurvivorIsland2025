# Post-immunity experience audit

Baseline `de886893af9cd799e131ef7b967839052ed23966`, merge of #354. Fresh baseline: 646/646 Node tests.

| Active owner / flow | Current experience and change boundary |
| --- | --- |
| PostChallengeEventSystem / CampScreen | First-loss and journey beats precede camp; later losses return to Beach. Keep challenge/event presentation, add concise one-hour orientation. |
| ClockUtils | Ornate HH:MM:SS has weak urgency hierarchy. Use semantic MM:SS, final-five tiers; reading never ticks. |
| CampActivitySystem / ScrambleActivityPlan | Authoritative physical travel, occupancy, invitations and meetings. Reuse; arrival remains distinct from departure. |
| CampPresentation / NpcAutoRenderer | Real co-location/shared activity already groups people. Arc portraits and large solo cards dominate phones. Consolidate compact groups, invitation hierarchy, physical movement and owned cues; reuse stable cards. |
| CampInteractionSystem | Watch 60 seconds, Approach 45, Follow 120, post-cost revalidation. Keep all eligibility/costs; show purposeful sheets/results. |
| CampNarrationQueue | Owner-only deduplicated observation narration. Reuse queue; presentation cues have semantic expiry, no heartbeat/replayed arrivals. |
| ConversationSystem / ScrambleConversation | Checkpointed semantic choices already work; Keep talking adds an extra menu step. Show context choices immediately, own promises, all physical speakers. More retains deeper topics. |
| AllianceConversation | Actual multi-person transcript exists, including #354 maturity and cover wording. Replace primary-avatar emphasis with compact participant strip; do not change group resolution. |
| ScrambleStrategy / AllianceSystem | Convergence, affinity, split/backup, exclusions and priorities are frozen. UI never reads NPC strategic state or raw member metrics. |
| SocialMemory / CampKnowledge | Owner projection preserves source, attribution and uncertainty. Self-authored private bluff promises require a narrowly self-owned read. Hedges/hearsay/overhearing must not become personal promises. |
| Alliance notebook | #351 read is safe, overlapping relationships supported. Link existing notebook rather than creating another management system. |
| PostChallengeSummaryView | Old system-style journey metrics/target-lock language and image/div Continue control. Replace with owned notes and semantic Head to Tribal CTA. |
| Expiry / Tribal | Existing StrategyPhaseSystem ends once, crystallizes, opens summary/autosaves. Existing proceedAfterSummary owns handoff; recap must not reseed/reconsider/lock ballots. |
| Restore | Canonical actors/systems precede GAME_LOADED. Rebuild projection/invitation/Resume without saved DOM or old cues. Group re-reservation initially drops non-interruptible existing participants: narrowly preserve the same physical reservation. |
| Accessibility/mobile | Keep safe areas/dvh/reduced-motion foundations. Test 44px, focus/Escape, readable transcript and End/More at 844×390. |

Legacy target-lock overlays and hidden general social timers remain compatibility paths, not reactivated. Pre-immunity and Tribal ritual remain unchanged. Complete rendered findings, exact-tree tests and known limitations live in VALIDATION.md. The prior scratch workspace was replaced before publication: all acceptance claims are rerun, not inherited.
