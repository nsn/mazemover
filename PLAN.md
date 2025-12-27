# Moving Maze - Software Architecture Plan

## Overview
A turn-based 2D maze game written in TypeScript using the Kaplay.js library. Single player vs AI, fully playable in browser with no backend.

## Game Specifications
- Rectangular grid with odd-numbered dimensions (>= 3)
- Tiles are 32x32 pixels
- Door openings are center 8 pixels on edges
- Turn-based tile placement with row/column push mechanics

## Tile Types
| Type | Open Edges | Description |
|------|------------|-------------|
| Cul-de-sac | 1 | Dead end |
| Straight | 2 (opposing) | Corridor |
| L | 2 (adjacent) | Corner |
| T | 3 | T-junction |
| Cross | 4 | Intersection |

## File Structure

```
src/
├── main.ts                    # Bootstrap - initializes Kaplay and loads game
├── game/
│   ├── index.ts               # GameApp entry point, scene setup
│   ├── config.ts              # Grid dimensions, tile size (32px), door size (8px), constants
│   ├── types.ts               # TypeScript interfaces and types
│   ├── core/
│   │   ├── Tile.ts            # Tile class with rotation, edge masks, type definitions
│   │   ├── Grid.ts            # Grid matrix, plot positions, push mechanics
│   │   └── TileDeck.ts        # Random tile drawing with weighted probabilities
│   ├── render/
│   │   └── GridRenderer.ts    # Kaplay entities for tiles, plots, arrows
│   └── systems/
│       ├── InputController.ts # Click handling for rotation, placement, pushing
│       └── TurnManager.ts     # Turn state machine (draw → place → push)
```

## Core Types (types.ts)

### TileType
```typescript
enum TileType {
  CulDeSac,   // 1 open edge
  Straight,   // 2 opposing open edges
  L,          // 2 adjacent open edges
  T,          // 3 open edges
  Cross       // 4 open edges
}
```

### EdgeMask
Bitmask representing open edges:
- Bit 0 (1): North
- Bit 1 (2): East
- Bit 2 (4): South
- Bit 3 (8): West

### Orientation
Rotation in 90-degree increments: 0, 90, 180, 270

### Key Interfaces
- **TileInstance**: Type + orientation + grid position
- **PlotPosition**: Location around grid for tile insertion (row, column, direction)
- **GameState**: Current tile, grid state, turn phase

## Game Mechanics

### Grid Initialization
- Create odd-sized grid (e.g., 5x5, 7x7)
- Fill with random tiles in random orientations
- Generate plot positions beside even-indexed tiles (0, 2, 4...)

### Turn Flow
1. **Draw Phase**: Player receives a random tile
2. **Place Phase**: Click a plot to position the tile there
3. **Rotate Phase**: Click the tile to rotate 90° clockwise (optional, repeatable)
4. **Push Phase**: Arrow turns green; click to push row/column

### Push Mechanics
- New tile slides into the grid from the plot position
- All tiles in that row/column shift by one position
- The tile at the opposite end is pushed out and removed

### Visual Indicators
- Red arrows: Plot available but tile not yet placed
- Green arrows: Tile placed, ready to push
- Tile highlights on hover/selection

## Implementation Phases

### Phase 1: Core Data Structures
- Tile class with edge masks and rotation
- Grid class with matrix operations
- Plot position calculation

### Phase 2: Rendering
- Kaplay scene setup
- Tile sprite rendering based on type and orientation
- Plot and arrow rendering

### Phase 3: Input & Turn Management
- Click detection for plots, tiles, arrows
- Turn state machine enforcement
- Push animation and state updates

### Phase 4: AI (Future)
- Path finding
- Strategic tile placement
- Turn execution
