# Survivor Island

## Overview

Survivor Island is a narrative-driven mobile web game simulating the strategic and social dynamics of a survival reality show. Players engage in tribe dynamics, form alliances, compete in challenges, participate in tribal councils, and manage resources while developing relationships with AI-controlled survivors. The game follows the format of the TV show Survivor with immunity challenges, voting mechanics, and elimination gameplay.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Core Architecture Pattern

The game uses a modular ES6 architecture with clear separation of concerns:

- **Core Layer**: Central managers that orchestrate game flow
- **Systems Layer**: Independent game mechanics (relationships, alliances, conversations)
- **Views Layer**: Screen-specific rendering logic
- **UI Layer**: Reusable UI components and overlays
- **Utils Layer**: Shared helper functions

### Core Managers

| Manager | Purpose |
|---------|---------|
| `GameManager` | Central game state, survivor data, tribe management, day/phase tracking |
| `ScreenManager` | Screen transitions, history, fade/slide animations |
| `EventManager` | Pub-sub event system for decoupled module communication |
| `ChallengeManager` | Challenge definitions, mechanics, and results tracking |

### Game Systems

The game implements several interconnected systems:

- **RelationshipSystem**: Tracks survivor-to-survivor relationship values (0-100 scale) with ally/enemy/neutral thresholds
- **AllianceSystem**: Manages alliance creation, membership, and voting coordination
- **ConversationSystem**: Handles player-NPC dialogue with intent-based responses and trust calculations
- **SocialEngine**: NPC decision-making for social interactions and approach timing
- **SocialMemorySystem**: Persistent memory of social events, lies, promises, and intel
- **IdolSystem**: Hidden immunity idol placement, clue generation, and inventory management
- **NpcLocationSystem**: Assigns NPCs to camp locations each phase for dynamic encounters
- **TaskSystem/TaskSimulationSystem**: NPC task assignment and resource gathering simulation
- **StrategyPhaseSystem**: Post-challenge strategy phase rules and voting target mechanics

### Screen Flow

1. **WelcomeScreen** → New game entry
2. **CharacterSelectionScreen** → Player picks their survivor from a card-based UI
3. **TribeDivisionScreen** → Marooning sequence and tribe assignment (2 or 3 tribes)
4. **CampScreen** → Main gameplay hub with multiple view locations (beach, shelter, campfire, trails, etc.)
5. **ChallengeScreen** → Immunity/reward challenges with staged competition views
6. **TribalCouncil** → Voting and elimination mechanics

### Camp View System

CampScreen uses a location-based view system where each camp area is a separate view module:

- Views are registered in `campViews` object mapped to `LocationKeys`
- Navigation between views triggers `CAMP_VIEW_LOADED` events
- NPCs are dynamically placed at locations via `NpcLocationSystem` and rendered by `NpcAutoRenderer`

### Event-Driven Communication

The `EventManager` implements a pub-sub pattern with events like:
- `GAME_PHASE_CHANGED` - Triggers phase-specific logic
- `CAMP_VIEW_LOADED` - Updates NPC rendering for new locations
- `SURVIVOR_ELIMINATED` - Cleanup relationship data
- `DAY_ADVANCED` - Triggers new day initialization

### Data Management

- **GameData**: Static survivor definitions with attributes (physical, mental, social traits)
- **StorageUtils**: LocalStorage-based save/load functionality
- Survivors have 15+ traits across physical, mental, and social categories
- Resource tracking: water, hunger, rest, firewood, bamboo, palms, coconuts, fish

### UI Component Patterns

- Card-based survivor selection with flip animations
- Parchment-style overlays for dialogues and results
- Action bar system for camp interactions
- Custom `Survivant` font for thematic styling
- Overlay system for modals (clues, inventory, relationships, alliances)

## External Dependencies

### Server
- **Express.js** (v4.18.2): Static file serving for the single-page application

### Client-Side
- No external JavaScript libraries - vanilla ES6 modules
- Custom CSS with `@font-face` for the Survivant font
- All game assets stored in `/Assets` directory (images, avatars, backgrounds)

### Asset Structure
- `/Assets/Avatars/` - Survivor portrait images
- `/Assets/Screens/` - Background images for different screens
- `/Assets/Challenge/` - Challenge stage backgrounds
- `/Assets/Idols/` - Idol and clue UI elements
- Font: `Assets/Survivant.ttf`

### Runtime Environment
- Node.js with ES modules (`"type": "module"` in package.json)
- Browser-based game requiring no database
- State persisted to localStorage