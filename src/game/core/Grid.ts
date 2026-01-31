import { Direction, TileType, ObjectType, type TileInstance, type PlotPosition, type Orientation } from "../types";
import { GRID_COLS, GRID_ROWS, GRID_OFFSET_X, GRID_OFFSET_Y, TILE_SIZE, DECAY_WEIGHTS, DECAY_PROGRESSION } from "../config";
import { TileDeck } from "./TileDeck";
import { logger } from "../utils/logger";

/**
 * Generates a random decay value based on configured weights.
 */
function getRandomDecay(): number {
  const entries = Object.entries(DECAY_WEIGHTS) as [string, number][];
  const totalWeight = entries.reduce((sum, [, weight]) => sum + weight, 0);

  let random = Math.random() * totalWeight;

  for (const [decayStr, weight] of entries) {
    random -= weight;
    if (random <= 0) {
      return parseInt(decayStr, 10);
    }
  }

  return 0; // Fallback
}

/**
 * Increases the decay level of a random tile in the grid.
 * The decay level will not exceed DECAY_PROGRESSION.MAX_DECAY.
 * Tiles with map objects (player, enemies, items, exits) are excluded from decay.
 *
 * @param grid The game grid
 * @param objectManager Optional MapObjectManager to check for objects on tiles
 */
export function increaseRandomDecay(grid: TileInstance[][], objectManager?: { getObjectsAtPosition(row: number, col: number): any[] }): void {
  // Collect all tiles that can have their decay increased
  const tiles: { row: number; col: number }[] = [];

  for (let row = 0; row < grid.length; row++) {
    for (let col = 0; col < grid[row].length; col++) {
      const tile = grid[row][col];

      // Skip tiles at max decay
      if (!tile || tile.decay >= DECAY_PROGRESSION.MAX_DECAY) {
        continue;
      }

      // Skip tiles with exit objects only
      if (objectManager) {
        const objectsAtPosition = objectManager.getObjectsAtPosition(row, col);
        const hasExit = objectsAtPosition.some(obj => obj.type === ObjectType.Exit);
        if (hasExit) {
          continue;
        }
      }

      tiles.push({ row, col });
    }
  }

  // If there are no tiles that can decay further, return
  if (tiles.length === 0) {
    logger.debug("[increaseRandomDecay] No tiles available to increase decay");
    return;
  }

  // Pick a random tile and increase its decay
  const randomIndex = Math.floor(Math.random() * tiles.length);
  const { row, col } = tiles[randomIndex];
  const oldDecay = grid[row][col].decay;
  grid[row][col].decay = Math.min(grid[row][col].decay + 1, DECAY_PROGRESSION.MAX_DECAY);

  logger.debug(`[increaseRandomDecay] Increased decay at (${row},${col}) from ${oldDecay} to ${grid[row][col].decay}`);
}

/**
 * Increases decay on all tiles in the pushed row or column.
 * Each tile gets a random decay increase from 0 to maxIncrease.
 * Tiles with map objects are excluded from decay.
 *
 * @param grid The game grid
 * @param plot The plot position that was pushed (determines which row/column)
 * @param maxIncrease Maximum random decay value to add (0 to this value)
 * @param objectManager Optional MapObjectManager to check for objects on tiles
 */
export function increaseDecayInPushedLine(
  grid: TileInstance[][],
  plot: PlotPosition,
  maxIncrease: number,
  objectManager?: { getObjectsAtPosition(row: number, col: number): any[] }
): void {
  // North/South pushes affect a column, East/West pushes affect a row
  const isColumn = plot.direction === Direction.North || plot.direction === Direction.South;

  logger.debug(`[increaseDecayInPushedLine] Applying decay to ${isColumn ? 'column' : 'row'} ${isColumn ? plot.col : plot.row}`);

  if (isColumn) {
    // Apply decay to all tiles in the column
    for (let row = 0; row < GRID_ROWS; row++) {
      applyRandomDecayToTile(grid, row, plot.col, maxIncrease, objectManager);
    }
  } else {
    // Apply decay to all tiles in the row
    for (let col = 0; col < GRID_COLS; col++) {
      applyRandomDecayToTile(grid, plot.row, col, maxIncrease, objectManager);
    }
  }
}

/**
 * Helper function to apply random decay to a single tile.
 *
 * @param grid The game grid
 * @param row Row of the tile
 * @param col Column of the tile
 * @param maxIncrease Maximum random decay value to add (0 to this value)
 * @param objectManager Optional MapObjectManager to check for objects on tiles
 */
export function applyRandomDecayToTile(
  grid: TileInstance[][],
  row: number,
  col: number,
  maxIncrease: number,
  objectManager?: { getObjectsAtPosition(row: number, col: number): any[] }
): void {
  const tile = grid[row][col];

  if (!tile) {
    return;
  }

  // Skip tiles with exit objects only
  if (objectManager) {
    const objectsAtPosition = objectManager.getObjectsAtPosition(row, col);
    const hasExit = objectsAtPosition.some(obj => obj.type === ObjectType.Exit);
    if (hasExit) {
      logger.debug(`[applyRandomDecayToTile] Skipping (${row},${col}) - has exit`);
      return;
    }
  }

  // Random decay increase from 0 to maxIncrease (inclusive)
  const decayIncrease = Math.floor(Math.random() * (maxIncrease + 1));

  if (decayIncrease === 0) {
    logger.debug(`[applyRandomDecayToTile] No decay added to (${row},${col})`);
    return;
  }

  const oldDecay = tile.decay;
  tile.decay = Math.min(tile.decay + decayIncrease, DECAY_PROGRESSION.MAX_DECAY);

  logger.debug(`[applyRandomDecayToTile] Increased decay at (${row},${col}) from ${oldDecay} to ${tile.decay} (+${decayIncrease})`);
}

/**
 * Returns the appropriate L-shaped corner tile for grid corners.
 * Each corner has a specific orientation to form the grid perimeter.
 */
function getCornerTile(row: number, col: number, rows: number, cols: number, isBossRoom: boolean = false): TileInstance | null {
  const isTopLeft = row === 0 && col === 0;
  const isTopRight = row === 0 && col === cols - 1;
  const isBottomLeft = row === rows - 1 && col === 0;
  const isBottomRight = row === rows - 1 && col === cols - 1;

  const decay = isBossRoom ? 0 : getRandomDecay();

  if (isTopLeft) {
    return { type: TileType.L, orientation: 1 as Orientation, decay };
  } else if (isTopRight) {
    return { type: TileType.L, orientation: 2 as Orientation, decay };
  } else if (isBottomLeft) {
    return { type: TileType.L, orientation: 0 as Orientation, decay };
  } else if (isBottomRight) {
    return { type: TileType.L, orientation: 3 as Orientation, decay };
  }

  return null;
}

/**
 * Determines if a grid position is an immovable edge tile.
 * Immovable edges are at even positions on the grid perimeter (excluding corners).
 */
function isImmovableEdge(row: number, col: number, rows: number, cols: number): boolean {
  const isTopOrBottomEdge = row === 0 || row === rows - 1;
  const isLeftOrRightEdge = col === 0 || col === cols - 1;
  const hasEvenCol = col % 2 === 0;
  const hasEvenRow = row % 2 === 0;

  return (isTopOrBottomEdge && hasEvenCol) || (isLeftOrRightEdge && hasEvenRow);
}

/**
 * Returns a T-shaped tile with the closed side facing outward for edge positions.
 * T tile orientations: 0=south closed, 1=west closed, 2=north closed, 3=east closed
 */
function getEdgeTTile(row: number, col: number, rows: number, cols: number, isBossRoom: boolean = false): TileInstance {
  const decay = isBossRoom ? 0 : getRandomDecay();

  // Determine which edge and set orientation so closed side faces outward
  if (row === 0) {
    // Top edge: closed side should face north (outward)
    return { type: TileType.T, orientation: 2 as Orientation, decay };
  } else if (row === rows - 1) {
    // Bottom edge: closed side should face south (outward)
    return { type: TileType.T, orientation: 0 as Orientation, decay };
  } else if (col === 0) {
    // Left edge: closed side should face west (outward)
    return { type: TileType.T, orientation: 1 as Orientation, decay };
  } else if (col === cols - 1) {
    // Right edge: closed side should face east (outward)
    return { type: TileType.T, orientation: 3 as Orientation, decay };
  }

  // Fallback (should never reach here for valid edge positions)
  return { type: TileType.T, orientation: 0 as Orientation, decay };
}

export type EdgeSide = "top" | "bottom" | "left" | "right";

export interface ImmovableEdgeTile {
  row: number;
  col: number;
  side: EdgeSide;
}

/**
 * Returns all immovable edge tile positions on the grid perimeter.
 * Used for placing objects like exits at fixed edge locations.
 */
export function getImmovableEdgeTiles(rows: number, cols: number): ImmovableEdgeTile[] {
  const tiles: ImmovableEdgeTile[] = [];
  
  for (let c = 0; c < cols; c++) {
    if (c % 2 === 0) {
      if (c !== 0 && c !== cols - 1) {
        tiles.push({ row: 0, col: c, side: "top" });
        tiles.push({ row: rows - 1, col: c, side: "bottom" });
      }
    }
  }
  
  for (let r = 0; r < rows; r++) {
    if (r % 2 === 0) {
      if (r !== 0 && r !== rows - 1) {
        tiles.push({ row: r, col: 0, side: "left" });
        tiles.push({ row: r, col: cols - 1, side: "right" });
      }
    }
  }
  
  return tiles;
}

/**
 * Returns the opposite side of the grid (e.g., top -> bottom, left -> right).
 * Used for placing the player opposite the exit.
 */
export function getOppositeSide(side: EdgeSide): EdgeSide {
  switch (side) {
    case "top": return "bottom";
    case "bottom": return "top";
    case "left": return "right";
    case "right": return "left";
  }
}

/**
 * Returns a random tile position on the specified side of the grid.
 * Falls back to center position if no immovable edges exist on that side.
 */
export function getRandomTileOnSide(side: EdgeSide, rows: number, cols: number): { row: number; col: number } {
  const tiles = getImmovableEdgeTiles(rows, cols).filter(t => t.side === side);
  if (tiles.length === 0) {
    switch (side) {
      case "top": return { row: 0, col: Math.floor(cols / 2) };
      case "bottom": return { row: rows - 1, col: Math.floor(cols / 2) };
      case "left": return { row: Math.floor(rows / 2), col: 0 };
      case "right": return { row: Math.floor(rows / 2), col: cols - 1 };
    }
  }
  const tile = tiles[Math.floor(Math.random() * tiles.length)];
  return { row: tile.row, col: tile.col };
}

/**
 * Determines if a grid position is an interior immovable tile.
 * Interior immovable tiles are at even row/col positions but not on the grid perimeter.
 */
function isInteriorImmovable(row: number, col: number, rows: number, cols: number): boolean {
  const hasEvenRow = row % 2 === 0;
  const hasEvenCol = col % 2 === 0;
  const isInterior = row > 0 && row < rows - 1 && col > 0 && col < cols - 1;

  return hasEvenRow && hasEvenCol && isInterior;
}

/**
 * Creates the initial game grid with fixed corners, immovable edges, and random interior tiles.
 * Ensures immovable tiles (edges and interior) are never CulDeSac tiles to maintain accessibility.
 * @param isBossRoom If true, all tiles are created with decay 0 (no decay in boss room)
 */
export function createGrid(rows: number, cols: number, deck: TileDeck, isBossRoom: boolean = false): TileInstance[][] {
  const grid: TileInstance[][] = [];
  for (let r = 0; r < rows; r++) {
    const row: TileInstance[] = [];
    for (let c = 0; c < cols; c++) {
      // Check if this position is one of the four corners (0,0), (0,6), (6,0), (6,6)
      const cornerTile = getCornerTile(r, c, rows, cols, isBossRoom);
      if (cornerTile) {
        // Corner position: place L-shaped tile with specific orientation
        row.push(cornerTile);
      } else if (isImmovableEdge(r, c, rows, cols)) {
        // Edge position at even row/col (but not corner): place T tile with closed side facing outward
        row.push(getEdgeTTile(r, c, rows, cols, isBossRoom));
      } else if (isInteriorImmovable(r, c, rows, cols)) {
        // Interior immovable position (even row AND even col, not on perimeter): draw random tile but never CulDeSac
        let tile = deck.draw();
        while (tile.type === TileType.CulDeSac) {
          deck.discard(tile);
          tile = deck.draw();
        }
        tile.decay = isBossRoom ? 0 : getRandomDecay();
        row.push(tile);
      } else {
        // Movable position (odd row OR odd col): draw any random tile from deck
        const tile = deck.draw();
        tile.decay = isBossRoom ? 0 : getRandomDecay();
        row.push(tile);
      }
    }
    grid.push(row);
  }
  return grid;
}

/**
 * Returns all plot positions (tile insertion points) around the grid perimeter.
 * Plots are placed at odd-numbered positions outside the grid.
 */
export function getPlotPositions(rows: number, cols: number): PlotPosition[] {
  const plots: PlotPosition[] = [];

  for (let c = 0; c < cols; c++) {
    if (c % 2 === 1) {
      plots.push({ row: -1, col: c, direction: Direction.South });
      plots.push({ row: rows, col: c, direction: Direction.North });
    }
  }

  for (let r = 0; r < rows; r++) {
    if (r % 2 === 1) {
      plots.push({ row: r, col: -1, direction: Direction.East });
      plots.push({ row: r, col: cols, direction: Direction.West });
    }
  }

  return plots;
}

/**
 * Pushes a new tile into the grid from a plot position, shifting all tiles in that row/column.
 * Returns the updated grid and the tile that was ejected from the opposite end.
 */
export function pushTileIntoGrid(
  grid: TileInstance[][],
  plot: PlotPosition,
  tile: TileInstance
): { newGrid: TileInstance[][]; ejectedTile: TileInstance } {
  const rows = grid.length;
  const cols = grid[0].length;
  const newGrid = grid.map(row => [...row]);

  let ejectedTile: TileInstance;

  switch (plot.direction) {
    case Direction.South:
      ejectedTile = newGrid[rows - 1][plot.col];
      for (let r = rows - 1; r > 0; r--) {
        newGrid[r][plot.col] = newGrid[r - 1][plot.col];
      }
      newGrid[0][plot.col] = tile;
      break;

    case Direction.North:
      ejectedTile = newGrid[0][plot.col];
      for (let r = 0; r < rows - 1; r++) {
        newGrid[r][plot.col] = newGrid[r + 1][plot.col];
      }
      newGrid[rows - 1][plot.col] = tile;
      break;

    case Direction.East:
      ejectedTile = newGrid[plot.row][cols - 1];
      for (let c = cols - 1; c > 0; c--) {
        newGrid[plot.row][c] = newGrid[plot.row][c - 1];
      }
      newGrid[plot.row][0] = tile;
      break;

    case Direction.West:
      ejectedTile = newGrid[plot.row][0];
      for (let c = 0; c < cols - 1; c++) {
        newGrid[plot.row][c] = newGrid[plot.row][c + 1];
      }
      newGrid[plot.row][cols - 1] = tile;
      break;
  }

  return { newGrid, ejectedTile };
}

/**
 * Converts a plot position to screen coordinates for rendering.
 * Plots are positioned just outside the grid boundary.
 */
export function getPlotScreenPosition(plot: PlotPosition): { x: number; y: number } {
  let x: number;
  let y: number;

  if (plot.row === -1) {
    x = GRID_OFFSET_X + plot.col * TILE_SIZE + TILE_SIZE / 2;
    y = GRID_OFFSET_Y - TILE_SIZE / 2;
  } else if (plot.row === GRID_ROWS) {
    x = GRID_OFFSET_X + plot.col * TILE_SIZE + TILE_SIZE / 2;
    y = GRID_OFFSET_Y + GRID_ROWS * TILE_SIZE + TILE_SIZE / 2;
  } else if (plot.col === -1) {
    x = GRID_OFFSET_X - TILE_SIZE / 2;
    y = GRID_OFFSET_Y + plot.row * TILE_SIZE + TILE_SIZE / 2;
  } else {
    x = GRID_OFFSET_X + GRID_COLS * TILE_SIZE + TILE_SIZE / 2;
    y = GRID_OFFSET_Y + plot.row * TILE_SIZE + TILE_SIZE / 2;
  }

  return { x, y };
}
