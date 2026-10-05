# Dynamic Survivor coalitions

Alliances are relationships each contestant values and understands differently. Shared IDs do not guarantee loyalty. The player notebook reflects owned conversation/evidence, including a possibly mistaken read of a fake pact or an alliance that secretly excluded them.

Read the [baseline audit](AUDIT.md), [source inventory](BASELINE-SOURCE-INVENTORY.md), and [validation report](VALIDATION.md).

## API guide

- `getAllianceAffinity(fromId,toId)` / `getEffectiveAllianceStrength`: asymmetric strategic protection. Use this instead of `areAllied` for strategic consumers.
- `getAlliancePriorityForMember` / `getRankedAlliancesForMember`: independent overlapping loyalties. `getCommittedAllianceId` is a compatibility projection of the current highest rank.
- `getKnownAlliances(ownerId)`: safe player notebook DTO. Do not render `getAlliance`/`getAllAlliances` engine objects.
- `propose` / `respond`, `proposeRecruitment` / `respondRecruitment`, `formGroup`: physical contact and individual consent. Proposal internals include private sincerity and must not be rendered.
- `exclude`, `leave`, `distance`, `disclose`, `raiseConcern`, `recommit`: distinguish objective action, private choice and statements the listener actually heard.
- `captureRoundPlan` / `resolveMeeting`: coordination snapshots built on #350 minds; never a second vote-intention store.
- `processPostTribalFallout` / `perceiveBetrayal`: objective assigned-vote outcomes versus evidence-based owner reactions.
- `onTribeSwap`, `onMerge`, `onElimination`: preserve history and maintain operational eligibility.

Creation/member mutation/disband/commit aliases remain engine and save compatibility primitives. They must not be called by management UI to simulate consent. New serialized state is version 2; no DOM is saved.

## Reproduce QA

```sh
npm test
npm run qa:alliances
# Supply an installed Playwright package and browser runtimes for rendered QA.
PLAYWRIGHT_MODULE=/path/to/playwright npm run qa:alliances:rendered
ALLIANCE_QA_BROWSER=webkit PLAYWRIGHT_MODULE=/path/to/playwright npm run qa:alliances:rendered
```

`ALLIANCE_QA_OUTPUT` writes the deterministic simulation report. `ALLIANCE_RENDERED_OUTPUT` selects the screenshot/results directory. Playwright is QA infrastructure, not a production dependency.
