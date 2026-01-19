import { type TileInstance, type GridPosition } from "../types";
import { getTileEdges } from "../core/Tile";
import { getFallChance, AI } from "../config";

export interface ReachableTile {
  position: GridPosition;
  distance: number;
  path: GridPosition[];
}

function canMove(
  grid: TileInstance[][],
  from: GridPosition,
  to: GridPosition
): boolean {
  const rows = grid.length;
  const cols = grid[0].length;

  if (to.row < 0 || to.row >= rows || to.col < 0 || to.col >= cols) {
    return false;
  }

  const fromTile = grid[from.row][from.col];
  const toTile = grid[to.row][to.col];

  if (!fromTile || !toTile) {
    return false;
  }

  const fromEdges = getTileEdges(fromTile.type, fromTile.orientation);
  const toEdges = getTileEdges(toTile.type, toTile.orientation);

  const dRow = to.row - from.row;
  const dCol = to.col - from.col;

  if (dRow === -1 && dCol === 0) {
    return fromEdges.north && toEdges.south;
  } else if (dRow === 1 && dCol === 0) {
    return fromEdges.south && toEdges.north;
  } else if (dRow === 0 && dCol === -1) {
    return fromEdges.west && toEdges.east;
  } else if (dRow === 0 && dCol === 1) {
    return fromEdges.east && toEdges.west;
  }

  return false;
}

export function findReachableTiles(
  grid: TileInstance[][],
  start: GridPosition,
  maxDistance: number,
  blockedPositions: GridPosition[] = [],
  isFlying: boolean = false
): ReachableTile[] {
  if (maxDistance <= 0) {
    return [];
  }

  const reachable: Map<string, ReachableTile> = new Map();
  const queue: ReachableTile[] = [
    { position: { ...start }, distance: 0, path: [{ ...start }] },
  ];

  const key = (pos: GridPosition) => `${pos.row},${pos.col}`;
  const visited = new Set<string>();
  visited.add(key(start));

  const blockedSet = new Set(blockedPositions.map(p => key(p)));

  while (queue.length > 0) {
    const current = queue.shift()!;

    if (current.distance > 0) {
      reachable.set(key(current.position), current);
    }

    if (current.distance >= maxDistance) {
      continue;
    }

    const neighbors: GridPosition[] = [
      { row: current.position.row - 1, col: current.position.col },
      { row: current.position.row + 1, col: current.position.col },
      { row: current.position.row, col: current.position.col - 1 },
      { row: current.position.row, col: current.position.col + 1 },
    ];

    for (const neighbor of neighbors) {
      const neighborKey = key(neighbor);

      if (visited.has(neighborKey)) {
        continue;
      }

      if (blockedSet.has(neighborKey)) {
        continue;
      }

      // Non-flying entities avoid tiles with high fall chance
      if (!isFlying) {
        const rows = grid.length;
        const cols = grid[0].length;
        if (neighbor.row >= 0 && neighbor.row < rows && neighbor.col >= 0 && neighbor.col < cols) {
          const neighborTile = grid[neighbor.row][neighbor.col];
          if (neighborTile) {
            const fallChance = getFallChance(neighborTile.decayLevel);
            if (fallChance >= AI.FALL_AVOIDANCE_THRESHOLD) {
              continue; // Skip this tile - too dangerous
            }
          }
        }
      }

      if (canMove(grid, current.position, neighbor)) {
        visited.add(neighborKey);
        queue.push({
          position: { ...neighbor },
          distance: current.distance + 1,
          path: [...current.path, { ...neighbor }],
        });
      }
    }
  }

  return Array.from(reachable.values());
}

export function getPathTo(
  grid: TileInstance[][],
  start: GridPosition,
  target: GridPosition,
  maxDistance: number,
  isFlying: boolean = false
): GridPosition[] | null {
  const reachable = findReachableTiles(grid, start, maxDistance, [], isFlying);
  const targetKey = `${target.row},${target.col}`;

  for (const tile of reachable) {
    if (`${tile.position.row},${tile.position.col}` === targetKey) {
      return tile.path;
    }
  }

  return null;
}
