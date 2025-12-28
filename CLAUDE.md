# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

MazeMover is a turn-based roguelike dungeon game built with Kaplay (game engine) and TypeScript. The core mechanic combines procedural maze generation with a sliding puzzle system where players manipulate maze tiles to navigate while being chased by enemies.

## Development Commands

```bash
# Start development server with hot reload
npm run dev

# Build for production (TypeScript compile + Vite bundle)
npm run build

# Preview production build
npm preview
```

## Architecture Overview

### State Machine Core

The `TurnManager` (src/game/systems/TurnManager.ts) is the central orchestrator implementing a turn-based state machine:

- **Turn Flow**: Player Turn → Tile Placement → Player Movement → Enemy Turns → Player Turn
- **Player Phases**: `AwaitingAction` → `TilePlacement` → `Movement`
- **State Transitions**: Every state change triggers a render callback to update UI

All game state lives in TurnManager. Other systems query this state to make decisions.

### Key Systems Interaction

```
TurnManager (state machine)
    ↓ queries/updates
Grid (7x7 maze structure) + MapObjectManager (entities)
    ↓ uses
Pathfinding (BFS for reachable tiles) + EnemyAI (movement decisions)
    ↓ triggers
GridRenderer (visualization)
```

**Critical Control Flow**:
1. User input (click/keyboard) → InputController or main click handler
2. TurnManager validates action against current state
3. Update grid/entities via Grid functions or MapObjectManager
4. TurnManager state change triggers render()
5. Render checks state and calls appropriate GridRenderer functions

### Core Domain: Grid & Tiles

**Grid Structure** (src/game/core/Grid.ts):
- 7x7 grid with fixed corners and perimeter tiles at even positions
- 5x5 mutable interior where tiles can be pushed
- **Plot Positions**: 12 virtual positions outside grid (top/bottom/left/right at columns/rows 1, 3, 5) where tiles are pushed in/out

**Tile System** (src/game/core/Tile.ts):
- 5 base types: `CulDeSac`, `Straight`, `L`, `T`, `Cross`
- Each tile has an `EdgeMask` pattern: `{north, east, south, west}` boolean flags
- Rotations cyclically shift edge flags: `(orientation + 1) % 4`
- Movement validation: adjacent tiles must have matching open edges (e.g., moving north requires `fromTile.north && toTile.south`)

**Push Mechanics**:
- Player selects a plot position
- New tile pushes into grid, all tiles in that row/column shift
- Entity at ejected position gets destroyed
- Implemented in `pushTileIntoGrid()` (Grid.ts)

### Entity System

**MapObjectManager** (src/game/systems/MapObjectManager.ts) manages all entities through a unified `MapObject` interface:
- Player, enemies, exit stairs, future items/traps
- Tracks positions on grid, movement budgets (movementAccumulator)
- Handles push mechanics (entities move when tiles shift)
- Supports interaction callbacks: `onEnter()`, `onExit()`

**Movement Accumulator Pattern**:
```typescript
// Allows fractional speeds (e.g., enemy with speed 0.5 moves every other turn)
movesRemaining = floor(movementAccumulator + movementSpeed)
movementAccumulator = (movementAccumulator + movementSpeed) % 1
```

### AI & Pathfinding

**Pathfinding** (src/game/systems/Pathfinding.ts):
- BFS algorithm finds all reachable tiles within movement budget
- Returns both positions and shortest paths
- Respects edge connections and blocked positions (for enemy collision avoidance)

**Enemy AI Types** (src/game/systems/EnemyAI.ts):
- **Hunter**: Greedy pathfinding toward player (minimizes Manhattan distance)
- **Guardian**: Protects a specific tile while pursuing player (balances both distances)
- **Multi-enemy coordination**: `calculateAllEnemyMoves()` ensures enemies block each other's paths by maintaining shared `occupiedPositions` array

### Coordinate Systems

- **Grid coordinates**: `{row, col}` (0-indexed, 0-6)
- **Screen coordinates**: `{x, y}` in pixels
- **Constants**: `TILE_SIZE = 32`, `GRID_OFFSET_X`, `GRID_OFFSET_Y` (src/game/config.ts)
- **Directions**: `Direction` enum (North=0, East=1, South=2, West=3) maps to `Orientation` type

### Rendering & Kaplay Integration

**Kaplay Tags** (for sprite management):
- `gridTile`: Main maze tiles
- `plot`: Placement zones UI
- `previewTile`: Current tile preview
- `mapObject`: Entities (player, enemies, exit)
- `movingPlayer`/`movingEnemy`: Animated movement sprites
- `reachableHighlight`: Movement range visualization

Click handling (src/game/index.ts `handleClick()`):
1. Query Kaplay objects by tag at click position
2. Priority order determines which object was clicked
3. Pass to TurnManager for state-appropriate handling

## Important Patterns

### Adding New Enemy Types
1. Add new `AIType` enum value in types.ts
2. Create `calculateNewTypeMove()` function in EnemyAI.ts
3. Add case to `calculateEnemyMove()` switch statement
4. Configure in `MapObjectManager.createEnemy()` or enemy spawn logic

### Adding Map Objects (Items, Traps, etc.)
1. Use `MapObjectManager.createObject()` with appropriate type
2. Define `onEnter`/`onExit` callbacks for interaction logic
3. Add sprite rendering in `GridRenderer.renderMapObjects()`
4. See exit stairs implementation (MapObjectManager.ts:247) as reference

### Modifying Grid Generation
- Core logic in `createGrid()` (Grid.ts:150)
- Fixed structure: corners are always L-tiles, edges at even positions immutable
- Tile weights controlled in `TileDeck.ts` weighted random selection
- For special terrain/layouts, modify `initializeGrid()` or post-process grid

### State Transitions
All state changes must go through TurnManager methods:
- `startPlayerTurn()`: Resets movement, draws new tile
- `handlePlotSelection()`: Validates and executes tile placement
- `handlePlayerMovement()`: Validates move, triggers enemy turns after
- `executeEnemyTurns()`: Coordinates all enemy movement

Never directly mutate grid or entity positions outside these flows.

## TypeScript Configuration

- Strict mode enabled with all linting checks
- Vite bundler mode: `allowImportingTsExtensions`, `verbatimModuleSyntax`
- No test infrastructure currently configured
- Import paths use `.ts` extensions (required by Vite bundler mode)

## File Organization

```
src/
├── main.ts              # Kaplay initialization, entry point
├── kaplayCtx.ts         # Shared Kaplay context instance
├── game/
│   ├── index.ts         # Game loop, input handling, main orchestration
│   ├── types.ts         # Centralized type definitions (Direction, GameState, MapObject, etc.)
│   ├── config.ts        # Constants (GRID_SIZE, TILE_SIZE, movement speeds)
│   ├── assets.ts        # Sprite/asset loading
│   ├── core/            # Domain logic (Grid, Tile, TileDeck)
│   ├── systems/         # Game systems (TurnManager, AI, Pathfinding, Input, MapObjects)
│   └── render/          # UI rendering (GridRenderer)
```

Core domain logic (core/) is pure logic with no Kaplay dependencies. Systems and render depend on Kaplay context.
