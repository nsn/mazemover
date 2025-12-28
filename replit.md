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
- Resolution: 768x432, letterbox mode
- Tiles: 32x32 pixels with 8-pixel center door openings
- 5 tile types: Cul-de-sac, Straight, L, T, Cross
- Plots positioned beside odd-indexed grid tiles (1, 3, 5...)
- Turn phases: Draw -> Place -> Push

## Controls
- **Click preview tile** - Rotate tile 90 degrees clockwise (Place phase)
- **Click plot** - Place tile on that plot
- **Click placed tile** - Rotate tile 90 degrees clockwise (Push phase)
- **Click highlighted row/column** - Push tile into grid
- **Click darkened area** - Cancel placement, return to preview
- **R key** - Rotate current tile
- **Space key** - Execute push (when tile is placed)

## Map Objects System
- MapObject types: Player, Enemy, Item, Exit
- Properties: gridPosition, pixelOffset (for animation), renderOrder, sprite, name
- Objects move with their tile when pushed
- Objects pushed off-grid are destroyed (logged to console)
- Factory methods: createPlayer(), createEnemy(), createItem(), createExit()

## Grid Initialization Rules
- Corner tiles: Always L-shaped, oriented with openings pointing inward
- Immovable edge tiles (even indices on edges): Never cul-de-sac tiles
- Tile weights configurable in config.ts (currently all equal)

## Recent Changes
- 2025-12-28: Implemented Map Objects system (Player, Enemy, Item, Exit)
- 2025-12-28: Added corner tile and edge tile initialization rules
- 2025-12-28: Added tile weights to configuration
- 2025-12-27: Enhanced UI with tile preview area and row/column highlighting
- 2025-12-27: Implemented Phase 3 (Input & Turn Management) with animation
- 2025-12-27: Added red/green visual indicators for plot states
- 2025-12-27: Implemented Phase 1 (Core data structures) and Phase 2 (Rendering)
- 2025-12-27: Fixed plot positions to align with odd-indexed tiles
- 2025-12-27: Added WebGL support check with fallback message
