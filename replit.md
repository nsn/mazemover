# Moving Maze

## Overview
A turn-based 2D maze game using Kaplay.js and TypeScript. Single player vs AI (AI not yet implemented). Features a rectangular grid with 5 tile types that players can place and push into the grid.

## Project Structure
- `src/` - TypeScript source files
  - `game/` - Game logic
    - `core/` - Data structures (Tile, Grid, TileDeck)
    - `systems/` - Game systems (TurnManager, InputController, MapObjectManager)
    - `render/` - Kaplay rendering (GridRenderer)
    - `types.ts` - Type definitions
    - `config.ts` - Game constants
    - `index.ts` - Game initialization
  - `kaplayCtx.ts` - Kaplay context initialization
  - `main.ts` - Entry point
- `public/` - Static assets
- `PLAN.md` - Detailed architecture plan

## Development
- Run `npm run dev` to start the development server on port 5000
- Run `npm run build` to build for production (outputs to `dist/`)

## Tech Stack
- Vite 7.x
- TypeScript 5.x
- Kaplay (game framework)

## Game Mechanics
- Resolution: 640x360, letterbox mode
- Tiles: 32x32 pixels with 8-pixel center door openings
- 5 tile types: Cul-de-sac, Straight, L, T, Cross
- Plots positioned beside odd-indexed grid tiles (1, 3, 5...)
- Turn phases: Draw -> Place -> Push

## Controls
- **Click player** - Enter movement mode, see reachable tiles
- **Click reachable tile** - Move player (automatically ends turn, triggers enemies)
- **Click preview tile** - Enter tile placement mode (or rotate if already placing)
- **Click plot** - Select plot for tile placement
- **Click highlighted row/column** - Push tile into grid
- **Click darkened area** - Cancel placement
- **R key** - Rotate current tile
- **Space key** - Execute push (when tile is placed)

## Turn Structure (Two-Tiered)
**Top Level**: TurnOwner (Player or Enemy)

**Player Turn Sub-Phases** (PlayerPhase):
1. **AwaitingAction** - Player can place tiles or initiate movement
2. **TilePlacement** - Player is placing a tile (doesn't end turn)
3. **Moving** - Player is moving (completing movement ends turn)

**Flow**:
- Player turn starts with a tile drawn
- Player can place tile (returns to AwaitingAction after push)
- Player can move (moving **automatically yields turn to enemies**)
- After enemies move, new player turn starts

## Map Objects System
- MapObject types: Player, Enemy, Item, Exit
- Properties: gridPosition, pixelOffset (for animation), renderOrder, sprite, name
- Movement properties: movementSpeed, movementAccumulator, movesRemaining
- Callback properties: onEnter, onExit - triggered when a mob steps on/off the object's tile
- Objects move with their tile when pushed
- Objects pushed off-grid are destroyed (logged to console)
- Factory methods: createPlayer(), createEnemy(), createItem(), createExit()

## Exit Stairs
- 16x16 pixel sprite placed on a random immovable edge tile at game start
- Player spawns on a random immovable tile on the opposing edge
- When player steps on the exit tile, victory overlay is displayed
- Uses onEnter callback with (mob, isPlayer) parameters

## Movement System
- Fractional speed accumulation: speed 0.5 = move 1 tile every 2 turns
- Click player to see reachable tiles (green highlight)
- Click highlighted tile to move player smoothly along path
- Click anywhere else to cancel movement mode
- Pathfinding uses flood-fill through connected tile doors
- Movement resets at the start of each turn

## Grid Initialization Rules
- Corner tiles: Always L-shaped, oriented with openings pointing inward
- Immovable edge tiles (even indices on edges): Never cul-de-sac tiles
- Tile weights configurable in config.ts (currently all equal)

## Recent Changes
- 2025-12-28: Added exit stairs map object with victory condition
- 2025-12-28: Added onEnter/onExit callbacks to MapObject system
- 2025-12-28: Player now spawns on opposite edge from exit
- 2025-12-28: Added 3 enemy types (red speed 2, yellow speed 0.5, green speed 1) with chase AI
- 2025-12-28: Implemented player movement with pathfinding and smooth animation
- 2025-12-28: Added fractional movement speed accumulation system
- 2025-12-28: Fixed push animation to keep entire grid visible (only affected row/col animates)
- 2025-12-28: Map objects now animate smoothly with their tiles during push
- 2025-12-28: Updated player sprite to 16x16 pixels
- 2025-12-28: Implemented Map Objects system (Player, Enemy, Item, Exit)
- 2025-12-28: Added corner tile and edge tile initialization rules
- 2025-12-28: Added tile weights to configuration
- 2025-12-27: Enhanced UI with tile preview area and row/column highlighting
- 2025-12-27: Implemented Phase 3 (Input & Turn Management) with animation
- 2025-12-27: Added red/green visual indicators for plot states
- 2025-12-27: Implemented Phase 1 (Core data structures) and Phase 2 (Rendering)
- 2025-12-27: Fixed plot positions to align with odd-indexed tiles
- 2025-12-27: Added WebGL support check with fallback message
