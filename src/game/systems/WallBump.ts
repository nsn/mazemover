import { type TileInstance, type GridPosition, type Orientation, Direction, TileType } from "../types";
import { getTileEdges } from "../core/Tile";
import { increaseRandomDecay } from "../core/Grid";
import { DECAY_PROGRESSION } from "../config";

/**
 * Checks if a move from one position to another is blocked by a wall
 */
export function isWallBlocking(
  grid: TileInstance[][],
  from: GridPosition,
  to: GridPosition
): boolean {
  const rows = grid.length;
  const cols = grid[0].length;

  // Check bounds
  if (to.row < 0 || to.row >= rows || to.col < 0 || to.col >= cols) {
    return false;
  }

  // Only adjacent tiles can have walls between them
  const dRow = to.row - from.row;
  const dCol = to.col - from.col;
  const isAdjacent = (Math.abs(dRow) === 1 && dCol === 0) || (Math.abs(dCol) === 1 && dRow === 0);

  if (!isAdjacent) {
    return false;
  }

  const fromTile = grid[from.row][from.col];
  const toTile = grid[to.row][to.col];

  if (!fromTile || !toTile) {
    return false;
  }

  const fromEdges = getTileEdges(fromTile.type, fromTile.orientation);
  const toEdges = getTileEdges(toTile.type, toTile.orientation);

  // Check if there's a wall (no opening on both sides)
  if (dRow === -1 && dCol === 0) {
    // Moving north
    return !fromEdges.north || !toEdges.south;
  } else if (dRow === 1 && dCol === 0) {
    // Moving south
    return !fromEdges.south || !toEdges.north;
  } else if (dRow === 0 && dCol === -1) {
    // Moving west
    return !fromEdges.west || !toEdges.east;
  } else if (dRow === 0 && dCol === 1) {
    // Moving east
    return !fromEdges.east || !toEdges.west;
  }

  return false;
}

/**
 * Calculates which direction the wall is facing
 */
export function getWallDirection(from: GridPosition, to: GridPosition): Direction | null {
  const dRow = to.row - from.row;
  const dCol = to.col - from.col;

  if (dRow === -1 && dCol === 0) return Direction.North;
  if (dRow === 1 && dCol === 0) return Direction.South;
  if (dRow === 0 && dCol === -1) return Direction.West;
  if (dRow === 0 && dCol === 1) return Direction.East;

  return null;
}

/**
 * Finds the best tile type and orientation to add a required opening while preserving existing ones
 * Returns the new tile type and orientation, or null if impossible
 */
function findBestTileUpgrade(
  currentTile: TileInstance,
  requiredDirection: Direction
): { type: TileType; orientation: Orientation; preservedCount: number } | null {
  const currentEdges = getTileEdges(currentTile.type, currentTile.orientation);
  console.log(`[findBestTileUpgrade] Current: ${currentTile.type} orient ${currentTile.orientation}, edges:`, currentEdges);
  console.log(`[findBestTileUpgrade] Need opening in direction: ${requiredDirection}`);

  // Try all tile types in order of preference (fewest openings first to minimize changes)
  const tileTypes: TileType[] = [TileType.L, TileType.Straight, TileType.T, TileType.Cross];

  let bestOption: { type: TileType; orientation: Orientation; preservedCount: number } | null = null;

  for (const tileType of tileTypes) {
    // Try all 4 orientations
    for (let orient = 0; orient < 4; orient++) {
      const testOrientation = orient as Orientation;
      const testEdges = getTileEdges(tileType, testOrientation);

      // Check if this orientation has the required opening
      let hasRequired = false;
      switch (requiredDirection) {
        case Direction.North: hasRequired = testEdges.north; break;
        case Direction.South: hasRequired = testEdges.south; break;
        case Direction.East: hasRequired = testEdges.east; break;
        case Direction.West: hasRequired = testEdges.west; break;
      }

      if (!hasRequired) continue;

      // Count how many existing openings are preserved
      let preservedCount = 0;
      if (currentEdges.north && testEdges.north) preservedCount++;
      if (currentEdges.south && testEdges.south) preservedCount++;
      if (currentEdges.east && testEdges.east) preservedCount++;
      if (currentEdges.west && testEdges.west) preservedCount++;

      // Update best if this is better (more preserved, or same preserved but simpler tile type)
      if (!bestOption ||
          preservedCount > bestOption.preservedCount ||
          (preservedCount === bestOption.preservedCount && tileType === currentTile.type)) {
        bestOption = { type: tileType, orientation: testOrientation, preservedCount };
      }
    }
  }

  if (bestOption) {
    console.log(`[findBestTileUpgrade] Best: ${bestOption.type} orient ${bestOption.orientation}, preserves ${bestOption.preservedCount} openings`);
  }

  return bestOption;
}

/**
 * Opens a wall between two tiles by upgrading tile types to create the required openings
 * Modifies the grid to update tile types and orientations
 */
export function openWall(
  grid: TileInstance[][],
  from: GridPosition,
  to: GridPosition,
  objectManager?: { getObjectsAtPosition(row: number, col: number): any[] }
): boolean {
  console.log(`[openWall] START - from: ${from.row},${from.col} to: ${to.row},${to.col}`);

  const wallDir = getWallDirection(from, to);
  console.log(`[openWall] Wall direction:`, wallDir);
  if (wallDir === null) return false;

  const fromTile = grid[from.row][from.col];
  const toTile = grid[to.row][to.col];
  console.log(`[openWall] From tile:`, fromTile?.type, fromTile?.orientation);
  console.log(`[openWall] To tile:`, toTile?.type, toTile?.orientation);

  if (!fromTile || !toTile) return false;

  // Calculate opposite direction for the "to" tile
  const oppositeDir = ((wallDir + 2) % 4) as Direction;
  console.log(`[openWall] Opposite direction:`, oppositeDir);

  // Find best tile upgrades for both tiles
  const fromUpgrade = findBestTileUpgrade(fromTile, wallDir);
  const toUpgrade = findBestTileUpgrade(toTile, oppositeDir);

  if (!fromUpgrade || !toUpgrade) {
    console.warn("[WallBump] Cannot create opening - impossible tile configuration");
    return false;
  }

  console.log(`[openWall] From tile: ${fromTile.type} → ${fromUpgrade.type}, orientation ${fromUpgrade.orientation}`);
  console.log(`[openWall] To tile: ${toTile.type} → ${toUpgrade.type}, orientation ${toUpgrade.orientation}`);

  // Update grid with new tile types and orientations, preserving decay
  grid[from.row][from.col] = {
    type: fromUpgrade.type,
    orientation: fromUpgrade.orientation,
    decay: fromTile.decay,
  };
  grid[to.row][to.col] = {
    type: toUpgrade.type,
    orientation: toUpgrade.orientation,
    decay: toTile.decay,
  };

  // Increase decay on random tiles due to wall breaking
  for (let i = 0; i < DECAY_PROGRESSION.ON_WALL_BREAK; i++) {
    increaseRandomDecay(grid, objectManager);
  }

  console.log(`[WallBump] Opened wall from ${from.row},${from.col} to ${to.row},${to.col}`);
  return true;
}
