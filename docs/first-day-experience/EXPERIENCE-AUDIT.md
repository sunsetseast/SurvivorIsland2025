# Actual first-play investigation

## Method and limits

Started from current main, merged #360 (`f0ef5f78e352bf57da5007c31ba94c0f8d9fb9da`). Launched the actual `index.html` in local Chromium headless shell 155.0.8059.39 through Playwright at 375×812. The cloud browser could not connect to the local server, so local Chromium was used. This is an automated browser-agent playthrough of production controls, not an independent human playtest or native Safari test.

New Game → choose Jeremy → two tribes → introduction → Begin Day 1 → Resources → Start Camp. No cast, relationships, conversations, commitments, challenge outcome or ballot was injected. The production setup made Moto (Ozzy, Tyson, Jay, Russell, Yul, Wendell, Tony, Jeremy, Boston Rob) and Luvu (Natalie, Cirie, Michele, Sandra, Carolyn, Kim, Parvati, Andrea, Kelley). Boston Rob directed camp. Long gaps between investigation commands allowed the real pre-immunity clock to keep advancing; this is not a calibrated human pacing study.

The first day initially used the baseline UI. After reproducing defects, normal reload → Continue resumed that same save in the candidate. Subsequent production controls exercised the fixes. Read-only state inspection followed observed outcomes; hidden diagnostic information was not used to choose player actions. Controlled QA fixtures and natural simulations are separately labelled in QA.md.

## What actually happened

| Stage | Player-visible evidence | Available choice / interpretation |
|---|---|---|
| Season setup | Recognizable contestant portraits, tribe identity, leadership friction and a Resources role | Choose whom to play, tribe setup and camp role. These give useful identity and a reason to contribute. |
| First roster | Tribe portraits and People nearby · 0; little direction toward active camp | Profiles worked, but arrow exploration was required. This looked more like a roster than a social environment. |
| Camp navigation | Several quiet places; campfire/shelter headings could describe the previous location | Arrows were functional. The stale heading was misleading; the movement picker was unavailable in ordinary camp. |
| Beach | Jay and Boston Rob gathering food | Talk or Help. The player checked on Jay, continued the conversation, ended it, then helped with gathering. |
| Work | Repeated actual shake/food attempts produced camp resources and consumed time | Useful cooperation. The visible copy and later recap connected contribution to the player's Resources role. |
| Independent social activity | Tyson and Jay talked nearby; Tony and Boston Rob talked quietly. Wendell departed toward camp; Rob arrived. A public remark said “That wood pile’s getting thin.” | Approach a group, watch or follow a witnessed departure. These were actual production activities, not spawned scenes. |
| Watching | “You linger nearby for a minute. They keep their voices low.” | Watching cost one minute and did not reveal a complete secret conversation. The later recap mentioned catching only a few words. |
| Camp recap | Leadership tension; work needs; Jay dependable; Jay/Wendell and Russell/Wendell finding time together | An understandable summary grounded in witnessed camp, without a hidden vote tally. |
| First immunity | Role selection and live race; Moto won | No forced loss. Standings incorrectly said Tribe undefined while the tribe rows had correct names. |
| Winning return — baseline | Old Summary with Continue to Challenge; no normal return-event continuation | A genuine blocker, not an intentional quiet winning camp. |
| Winning return — fixed, same save | Existing return dialogue: Wendell credited Ozzy. Player chose “Yeah, they were huge for us.” Feedback explained raising Ozzy's stock. Continue advanced the existing safe-tribe round. | A specific, understandable social consequence. No fabricated scramble or player Tribal while immune. |
| Day 2 | Fishing/navigation/work, witnessed private groups, normal save/Continue, then Last Flag | Paid Move around camp made destinations understandable. The player took two flags on their turn; Moto legitimately won again. |
| Next-round arrival | Jeff's introduction revealed Michele had been voted out of Luvu | The other tribe played a round independently of the human. The audit did not pretend to witness its private camp or Tribal discussion. |

The extended Jeremy check continued into Day 3 using ordinary water/work and challenge controls and reached Day 4. A second new season as Sandra showed a different beach grouping (Michele, Cirie, Andrea and Carolyn working), a specific Michele check-in (“I’m glad you came over. How are you doing out here?”), and an autonomous Kelley approach at the Water Well. The invitation stayed explicit: Talk now / Give me a minute / Not right now. The browser driver used the wrong exact accessible label, so this approach was missed while the live clock advanced; it is not counted as an accepted conversation. The long interactive browser process later expired. A fresh ordinary Sandra path was used for the remaining transition check, with work actions and no time injection. The extended Sandra path reached Day 4: Galang won the first live immunity race, Last Flag (the player took one flag on their turn), and the Day 3 Survival Instinct completion. The third result had no clear result moment; a read-only check afterward confirmed the actual canonical win. No outcome was selected or rerolled. Across the two audited seasons, six natural wins meant neither human attended Tribal yet. This is the precise missing experiential gate, not a claim that Tribal is unreachable. Primary first-day evidence does **not** establish the quality of a losing human tribe's first Tribal; separate rendered scramble and simulation checks exercise that production path. No loss was manufactured to make the audit more exciting.

## Measured experience, without conflating layers

### Supplemental ordinary three-tribe season

Continued the existing draft with another actual new season at 375×812: **Michele**, Wood role, Tagi (Boston Rob, Michele, Yul, Kelley, Tony, Carolyn); Bayon (Kim, Wendell, Cirie, Russell, Sandra, Ozzy); Nuku (Parvati, Jay, Natalie, Tyson, Andrea, Jeremy). These casts were produced by ordinary three-tribe setup. Nothing was injected to obtain an approach or loss. The browser profile and production JSON checkpoints preserved the run across normal reload/Continue; the restored camp opened at the roster, so navigation back into camp was explicit and paid.

| Observed stage | What the player actually saw / did |
|---|---|
| First camp | Entered the beach, moved to the jungle, saw Rob looking around and Kelley/Tony doing wood work; checked in with Rob and continued a personal conversation. Witnessed departures remained followable. |
| Work and search | Actual firewood taps collected two wood per recorded attempt and billed five minutes. Casual and aggressive idol searches found nothing; their time was consumed normally. No award or clock value was injected. |
| Natural human encounter | Carolyn independently came over. The player explicitly chose Talk now. “Hey, you doing okay? This place takes some getting used to.” The player continued a personal exchange and chose End chat. This is an accepted production approach, not an assigned QA scene. |
| New blocker | With several workers nearby, the jungle resource menu's lower choice was visibly beneath the rail and could not be clicked. The unchanged season/save demonstrated the fix: ordinary Hunt for an Idol opened and resolved afterward. Console review also found five null-reference errors as resource clicks replaced the view during bubbling; after the local-reference fix, both work-entry/return paths produced zero new errors in the same resumed season. |
| First immunity | Ordinary Auto Assign/Confirm Roles and the live race gave Bayon first and Tagi second; both were immune. The attempted exact-uppercase Skip selector failed; a later case-insensitive click used the ordinary Skip control. No result was selected or rerolled. |
| Return | Sit this one out left Tony representing Tagi on the journey. Jeff correctly named Nuku for Tribal, but an earlier journey line incorrectly claimed only one immune tribe. The player publicly celebrated the win in the return beat; the ordinary safe-tribe flow advanced to Day 2. |
| Day 2 social attention | Yul independently requested a quiet word. Talk now remained explicit. His opening was “Mind if I sit with you a minute? How are you doing?” The player asked a future-vote question through Read the Game; Yul remained undecided, with no forced player promise. |
| Independent game | A nearby Yul/Tony private meeting was visible. It ended before the driver completed its second Approach click; this is a missed live opportunity, not proof of a broken group conversation. Challenge arrival later revealed Parvati's elimination from Nuku. |
| Last Flag | The player sat Carolyn out through the ordinary selection and took two flags on their turn. Bayon took the last flag; Tagi and Nuku won. Continue advanced to Day 3. |
| Third challenge / endpoint | Ordinary work, Tree Mail, Survival Instinct intro, role controls and Complete Challenge advanced to Day 4. A read-only result check afterward confirmed the canonical Day 3 immunity win. Its unclear result moment is the same deferred challenge-presentation weakness seen in the previous two seasons. |

The two accepted social encounters support early involvement without establishing that every new player receives one. They do not replace the 48-case Day 1 comparison or prove human enjoyment. Repeated firewood attempts intentionally shortened the audit through actual controls; this work-heavy policy is not a representative pacing study. Pre-camp kept progressing between commands, and slow driver choices missed other invitations. The recorded excerpts and four additional screenshots are selective evidence, not a complete island-wide event log.

This additional season stops at Day 4 after three legitimate wins. Across the three reported seasons, nine immune rounds have not yielded a human losing-tribe scramble/Tribal playthrough. That experiential gate remains open; the game is not claimed to make Tribal unreachable or to be certified for human enjoyment. No loss, commitment or ballot was injected to satisfy the audit. The useful next gate is human phone/full-season certification, including later challenge presentation and the first legitimate player Tribal.

As this browser-agent player, Carolyn's unsolicited check-in and Yul's later approach made the existing intelligence directly accessible. Other people working, leaving and meeting gave context for my choices. The blocked resource menu interrupted that experience more than missing additional strategy mechanics did. Yul's future-oriented menu still led to a generic spoken vote question, so some dialogue copy remains uneven. The correct response is selective editing informed by phone playtesting, not another engine rebuild.

A read-only production save snapshot after the Day 2 return recorded 21 NPC-led semantic conversations across the elapsed camp periods and no player-target invitation history. That is internal activity, not 21 conversations watched by the player. The player actually opened one check-in with Jay and saw multiple nearby group/departure/arrival projections; no autonomous human-directed conversation was accepted in this primary run.

The same snapshot held **41 Day 1 player-owned camp observations**: 20 listened, 11 seen-together, seven departed, one watched, one absence and one arrival. Ownership means physically available evidence; it does not establish that the browser agent read every narration. Forty-seven Day 1 camp-log entries included work/setup/checkpoint records, not 47 separate player choices. Natural-matrix measurements cover activity and approaches more comprehensively; they are not substituted for these UI observations.

The visible/actionable/consequential chain was clearest for work and observation: Jay was visibly gathering → Talk/Help was available → actual contribution consumed camp time → the recap connected Jay and the player with useful work. A quieter chain was also real: private group visible → watch available → guarded response and limited information → recap retained uncertainty. No claim is made that every observed meeting changed the human's strategy.

## First-person critique of the observed UI

As the browser-agent player, I knew who I was and what camp needed, but the first roster did not clearly tell me how to join the inhabited camp. Once I found the beach, work and nearby groups gave me useful actions. The private voices staying private was a strength. Generic check-in wording and developer banners weakened the illusion. The challenge-return blocker was much more consequential than adding another strategic mechanic.

With the fixes, I can enter camp explicitly, choose a paid route, recognize the correct location and leave an action popup reliably. The return from immunity now continues the season. This supports a playable Survivor opening, but it does not certify enjoyment, convincing persuasion for a real person, or an earned human Tribal surprise. Those require the phone checklist and full-season playability testing.

## Good enough — no further architectural work recommended

Preserve real work/help, localized social groups, witnessed movement, private watching, the camp recap and challenge-result reactions. Preserve the existing progressive conversation categories, explicit response agency, canonical memory, physical reservations, task/condition ownership, semantic replay and independent vote convergence. Targeted correctness remains appropriate; another conversation or approach architecture pass is not justified by this audit.

## Selected screenshots

Actual production evidence: [guarded observation](evidence/private-camp-observation.webp), [blocked #360 winning return](evidence/blocked-winning-return.webp), [same-save recovered return](evidence/recovered-winning-return.webp), [natural Kelley invitation](evidence/natural-kelley-invitation.webp). Final rendered new-season entry: [portrait](evidence/camp-entry-portrait.webp), [landscape](evidence/camp-entry-landscape.webp). Screenshots are losslessly encoded without compositing or altered contents.

Supplemental actual production evidence: [blocked jungle actions](evidence/blocked-jungle-actions.webp), [same-season recovered jungle actions](evidence/recovered-jungle-actions.webp), [accepted Carolyn conversation](evidence/natural-carolyn-conversation.webp), [accepted Yul conversation](evidence/natural-yul-conversation.webp).
