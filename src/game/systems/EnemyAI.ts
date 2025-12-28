import { type TileInstance, type GridPosition, type MapObject, ObjectType, AIType } from "../types";
import { findReachableTiles } from "./Pathfinding";
import { MapObjectManager } from "./MapObjectManager";

function manhattanDistance(a: GridPosition, b: GridPosition): number {
  return Math.abs(a.row - b.row) + Math.abs(a.col - b.col);
}

export interface EnemyMove {
  enemy: MapObject;
  path: GridPosition[];
}

function findTilePosition(grid: TileInstance[][], tile: TileInstance): GridPosition | null {
  for (let row = 0; row < grid.length; row++) {
    for (let col = 0; col < grid[row].length; col++) {
      if (grid[row][col] === tile) {
        return { row, col };
      }
    }
  }
  return null;
}

function calculateHunterMove(
  grid: TileInstance[][],
  enemy: MapObject,
  playerPos: GridPosition,
  blockedPositions: GridPosition[]
): EnemyMove | null {
  const moves = enemy.movesRemaining;
  if (moves <= 0) {
    return null;
  }

  const reachable = findReachableTiles(grid, enemy.gridPosition, moves, blockedPositions);
  if (reachable.length === 0) {
    return null;
  }

  const currentDistance = manhattanDistance(enemy.gridPosition, playerPos);

  let bestMove: EnemyMove | null = null;
  let bestDistance = currentDistance;

  for (const tile of reachable) {
    const distance = manhattanDistance(tile.position, playerPos);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestMove = { enemy, path: tile.path };
    }
  }

  return bestMove;
}

function calculateGuardianMove(
  grid: TileInstance[][],
  enemy: MapObject,
  playerPos: GridPosition,
  blockedPositions: GridPosition[]
): EnemyMove | null {
  const moves = enemy.movesRemaining;
  if (moves <= 0) {
    return null;
  }

  if (!enemy.protectedTile) {
    return null;
  }

  const protectedPos = findTilePosition(grid, enemy.protectedTile);
  if (!protectedPos) {
    return null;
  }

  const reachable = findReachableTiles(grid, enemy.gridPosition, moves, blockedPositions);
  
  const currentDistToProtected = manhattanDistance(enemy.gridPosition, protectedPos);
  const currentDistToPlayer = manhattanDistance(enemy.gridPosition, playerPos);
  const currentScore = currentDistToProtected + currentDistToPlayer;

  let bestMove: EnemyMove | null = null;
  let bestScore = currentScore;

  for (const tile of reachable) {
    const distToProtected = manhattanDistance(tile.position, protectedPos);
    const distToPlayer = manhattanDistance(tile.position, playerPos);
    const score = distToProtected + distToPlayer;
    
    if (score < bestScore) {
      bestScore = score;
      bestMove = { enemy, path: tile.path };
    }
  }

  return bestMove;
}

export function calculateEnemyMove(
  grid: TileInstance[][],
  enemy: MapObject,
  playerPos: GridPosition,
  blockedPositions: GridPosition[] = []
): EnemyMove | null {
  const aiType = enemy.aiType || AIType.Hunter;
  
  switch (aiType) {
    case AIType.Hunter:
      return calculateHunterMove(grid, enemy, playerPos, blockedPositions);
    case AIType.Guardian:
      return calculateGuardianMove(grid, enemy, playerPos, blockedPositions);
    default:
      return calculateHunterMove(grid, enemy, playerPos, blockedPositions);
  }
}

export function calculateAllEnemyMoves(
  grid: TileInstance[][],
  objectManager: MapObjectManager,
  playerPos: GridPosition
): EnemyMove[] {
  const enemies = objectManager.getAllObjects().filter(
    (obj) => obj.type === ObjectType.Enemy
  );

  const moves: EnemyMove[] = [];
  const occupiedPositions: GridPosition[] = enemies.map(e => ({ ...e.gridPosition }));
  
  for (const enemy of enemies) {
    const otherEnemyPositions = occupiedPositions.filter(
      pos => !(pos.row === enemy.gridPosition.row && pos.col === enemy.gridPosition.col)
    );
    
    const move = calculateEnemyMove(grid, enemy, playerPos, otherEnemyPositions);
    if (move && move.path.length > 1) {
      moves.push(move);
      const enemyIndex = occupiedPositions.findIndex(
        pos => pos.row === enemy.gridPosition.row && pos.col === enemy.gridPosition.col
      );
      if (enemyIndex !== -1) {
        const finalPos = move.path[move.path.length - 1];
        occupiedPositions[enemyIndex] = { ...finalPos };
      }
    }
  }

  return moves;
}
