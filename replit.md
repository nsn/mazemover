# Moving Maze

## Overview
A turn-based 2D maze game using Kaplay.js and TypeScript. Single player vs AI (AI not yet implemented). Features a rectangular grid with 5 tile types that players can place and push into the grid.

## Project Structure
- `src/` - TypeScript source files
  - `game/` - Game logic
    - `core/` - Data structures (Tile, Grid, TileDeck)
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

## Recent Changes
- 2025-12-27: Implemented Phase 1 (Core data structures) and Phase 2 (Rendering)
- 2025-12-27: Fixed plot positions to align with even-indexed tiles
- 2025-12-27: Added WebGL support check with fallback message
