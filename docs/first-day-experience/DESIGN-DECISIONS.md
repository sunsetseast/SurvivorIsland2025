# Decisions grounded in the first-play audit

Base: merged #360, `f0ef5f78e352bf57da5007c31ba94c0f8d9fb9da`. Findings and their classifications are in PRIORITY-FINDINGS.md. This pass changes access, presentation and two reproduced correctness defects; it adds no social or strategic authority.

## Early initiative

`NpcInitiative.candidates()` previously sorted listeners by trust, target relevance and owned mentions, then truncated to six before considering the opportunity to make contact. A nearby unfamiliar person could lose to six remote familiar people. A subject mention in history could also look like a prior conversation with that person.

Pre-immunity now evaluates at most six distinct listeners: four relationship-relevant candidates, up to two eligible unfamiliar people physically nearby, then remaining relevant candidates to fill unused slots. Nearby candidates still need the existing trust, availability, motivation, effort, cooldown and physical checks. Actual same-day contact uses the history's speaker/listener semantics. The player receives no special weight. Introductions are opportunities, not scheduled rewards.

The candidate-pool change is deliberately **pre-immunity only**. An initial wider version changed a certified post-immunity convergence fixture. There was no player-experience evidence requiring that change, so it was removed rather than adjusting the fixture or vote math. Existing urgent approaches, strategic work and post-immunity target selection remain intact.

## Time and observation

Preserve the hybrid clock: pre-immunity advances normally; post-immunity advances through actions. Reading and thinking during the scramble should not cost the player their vote preparation. An always-running scramble clock would address apparent inactivity by adding a mobile reading penalty.

The existing authoritative one-minute wait is presented as **Observe camp · 1 minute**, with the explanation “Time moves when you act or observe. Take your time reading.” It uses the same `consumeCampTime(60)` call, camp boundaries, travel and invitations. No second loop, automatic consent or remote event feed. Observation only exposes existing nearby projections; it does not reveal every island conversation.

## Finding the camp

The first roster is useful for identity and profiles but is not the lived camp. Day 1 now offers **Step into camp**, a short explanation of meeting people/work/observation, and keyboard-operable profile buttons. Entry uses the existing paid route to the beach.

The existing scramble graph picker is also available as **Move around camp** in ordinary camp. It lists destinations and travel costs, not secretly tracked contestant locations. Work subviews and exclusive conversations retain their existing restrictions. Arrow navigation remains available. Landscape entry and portraits occupy separate areas; the guide clears the task icon and navigation.

## Conversation presentation

The first-challenge Tribal outro now passes a plain tribe name to JourneyBeatUI textLines; colored HTML remains in the panels that explicitly support it. This fixes visible markup without changing the shared text renderer or challenge outcome.

The existing contextual responses and six durable categories already provide useful progressive disclosure. No additional menu layer or dialogue tree is warranted. Keep asking, considering, promising and explicitly bluffing as different existing actions; do not simplify them into one Agree button.

A small deterministic template change gives the six existing gameplay styles distinct check-in openings/replies. Tense relationships retain the existing acknowledgement that things need time. A warning addressed to its subject says “Your name…” when the speaker owns relevant danger evidence, otherwise expresses concern. It does not identify a protected source or claim certainty. Semantic resolution and receipts remain unchanged.

This is a bounded improvement, not a claim that every line now has a unique contestant voice. More words, invented biographical dialogue and external language models were rejected.

## Correctness boundaries

Historical verification of attributed speech now checks the claimed original recipient, subject, topic, day and chronology. A disclosed source chain identifies the original intermediary; task reports retain their stronger report window. The countdown runs downward, and semantic order disambiguates exchanges in the same tick. Matching old speech remains historical even after withdrawal. The canonical actual-commitment receipt carries that same order.

Verification of factual information remains distinct from claiming a specific conversation took place. An NPC may confirm what they know without inventing “I told them.” Deliberate cover stories remain possible. No absent evidence automatically punishes a supposed liar.

Clock painting is read-only. Existing challenge-return events own strategy initialization. A safe-tribe save caught by the old race resumes through that coordinator rather than jumping back to a stale summary. No change to challenge scores, off-screen Tribal rules, individual votes or elimination safety.

## Good enough; stop architectural expansion

Keep semantic resolution/receipts, physical presence and approach reservations, owner-specific memory, tasks, conditional commitments, alliance ownership and individual vote convergence. Existing contracts and replay checks are the gate, not their complexity. Real work/help, nearby groups, public remarks, watching private exchanges and the camp recap already serve their purposes.

Deferred: broad minigame keyboard cleanup, comprehensive dialogue copy editing, native Safari/device optimization and full-season pacing. These belong to a season playability pass, not another conversation/approach rebuild.
