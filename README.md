# Survivor Island Game

A narrative-driven mobile game simulating the strategic and social dynamics of a survival reality show, offering an immersive gameplay experience with rich character development and dynamic tribe interactions.

## Game Overview

Survivor Island is inspired by the TV show Survivor, where players engage in a social simulation game featuring:
- Tribe dynamics and alliances
- Strategic challenges and competitions
- Tribal councils and voting mechanics
- Resource and health management systems
- Character progression and relationships

## Technical Architecture

The game is built using modern JavaScript with an ES6 module structure for better organization and maintainability.

### Core Modules

- **GameManager**: Central controller for game state and systems
- **ScreenManager**: Handles screen transitions and UI management
- **EventManager**: Provides pub-sub event system for inter-module communication
- **TimerManager**: Manages game timers and animations

### Game Systems

- **DialogueSystem**: Manages character dialogues and player choices
- **EnergySystem**: Handles player energy management
- **RelationshipSystem**: Controls relationships between survivors
- **AllianceSystem**: Manages alliances and voting blocs
- **ChallengeSystem**: Implements various game challenges
- **TribalCouncilSystem**: Handles voting and elimination mechanics
- **IdolSystem**: Manages hidden immunity idols

### Utility Modules

- **CommonUtils**: General utility functions
- **DOMUtils**: DOM manipulation helpers
- **StorageUtils**: Save/load game functionality

## Code Structure

```
/
├── Assets/            # Game assets (images, sounds)
├── src/               # Source code
│   ├── modules/       # Game modules
│   │   ├── core/      # Core game management
│   │   ├── systems/   # Game systems
│   │   ├── screens/   # Game screens
│   │   └── utils/     # Utility functions
│   └── main.js        # Game entry point
├── styles.css         # Game styles
└── index.html         # Main HTML file
```

## Architectural Decisions

### ES6 Module Pattern

The game uses ES6 modules to provide better encapsulation, cleaner dependencies, and improved code organization. This approach:

- Reduces global namespace pollution
- Explicitly declares dependencies
- Improves maintainability and debugging
- Enables better code splitting

### Event-Driven Architecture

Game components communicate through a centralized EventManager using the publish-subscribe pattern:

- Decouples systems from each other
- Allows for better extensibility
- Improves testability
- Provides a consistent way to track game events

### State Management

The game state is centralized in GameManager, providing:

- A single source of truth for game state
- Controlled state transitions
- Clean separation between state and presentation

## Development Status

Current focus areas:
- Refactoring to ES6 module structure
- Implementing core game systems
- Improving UI and interaction flow

Planned enhancements:
- More complex tribe and alliance mechanics
- Expanded character progression
- Additional challenge types
- Enhanced narrative elements

## Technical Requirements

- Modern browser with ES6 support
- Mobile-responsive design
- Touch-friendly interfaces