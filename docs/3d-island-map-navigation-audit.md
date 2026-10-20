# Survivor Island 3D experiment — map and navigation audit (initial pass)

**Status:** first source-backed layout pass; no 3D geometry has been approved. **Original game remains untouched.**

## Sources of truth

1. `Assets/map.png` — original island map. Its visual landmarks, coastline, compass and relative positions require direct image inspection before approving world coordinates.
2. `src/modules/views/*View.js` — **actual navigation arrow callbacks**; these convey directional design intent, including context-sensitive arrows.
3. `src/modules/systems/NpcLocationSystem.js` — `ISLAND_LOCATION_GRAPH` is the simulation's connectivity graph, **not a compass map**.
4. `Assets/Screens/*` — reference backgrounds for the look and perspective of each scene.

## Directional arrows confirmed in source

| View | Arrow | Destination | Notes |
|---|---|---|---|
| Beach | Up | Rocky shore | |
| Beach | Right | Tribe flag | |
| Rocky shore | Down | Beach | |
| Tribe flag | Left | Beach | |
| Tribe flag | Right | Campfire | |
| Campfire | Up | Tribe flag | |
| Campfire | Down | Shelter | |
| Shelter | Left | Campfire | |
| Shelter | Down | Fork 1 | |
| Fork 1 | Left | Mountain trail | |
| Fork 1 | Down | Shelter | |
| Fork 1 | Right | Jungle trail | |
| Fork 2 | Left | Jungle trail | |
| Fork 2 | Down | Mountain trail | |
| Fork 2 | Right | Shelter | |
| Fork 3 | Left | Shelter | |
| Fork 3 | Down | Jungle trail | |
| Fork 3 | Right | Mountain trail | |
| Mountain trail | Up/Down | Fork 2 or Tree Mail | Direction reverses depending on previous view |
| Tree Mail | Left | Mountain trail | |
| Tree Mail | Right | Waterfall trail | |
| Waterfall trail | Left | Tree Mail | |
| Waterfall trail | Right | Water well | |
| Water well | Left | Waterfall trail | |
| Water well | Right | Jungle trail | |
| Jungle trail | Up/Down | Fork 3 or Water well | Direction depends on previous view |

The fork screens cannot be collapsed into one junction without changing player navigation. Mountain trail and jungle trail have **context-sensitive** directional arrows. Arrow direction is screen-relative and is not guaranteed to be a fixed global compass bearing.

## Required reconciliation before 3D terrain

- Visually inspect the full-resolution `Assets/map.png`; record coastlines, compass (if any), camp location, mountain, inland water and intended routes. **Do not invent geographic details not visible in the image.**
- Compare map labels and icon placements with each directional edge above. Log conflicts rather than silently moving locations.
- Inspect the camera framing and scene perspective in each `Assets/Screens` image. Determine whether the player turns between scenes; screen-relative left/right/up/down may change orientation.
- Extract all conditional navigation branches from the views, including `previousCampView` and fork logic; write automated checks that preserve the original transitions.
- Build a 2D annotated coordinate blueprint first, then derive a 3D walkable navigation mesh with the same topology. Mark invented distances and elevations as design proposals.
- Keep `main`, existing saves and original 2D screens untouched. Add an opt-in experimental entry only after the 3D vertical slice is functional and tested.

## Prototype acceptance criteria

1. Third-person character can travel between beach, tribe flag, campfire, shelter and a fork in the **same order and orientation justified by the original map and view arrows**.
2. Three independently moving NPC stand-ins and one talk interaction demonstrate the experience; these must not mutate real game state.
3. The original map is accessible in the prototype as an image overlay.
4. Document any disagreement between source art, arrows and NPC graph; no arbitrary final world positions.
5. No merge or deployment without explicit approval.

## Implementation boundary

This document is a **layout audit**, not a claim that a playable 3D scene exists. The next development step is to reconcile the original image and conditional arrows and implement a self-contained playable vertical slice on this branch.
