import { type TileInstance, type GridPosition, type MapObject, ObjectType, AIType } from "../types";
import { findReachableTiles } from "./Pathfinding";
import { MapObjectManager } from "./MapObjectManager";
import { getTileEdges } from "../core/Tile";

function manhattanDistance(a: GridPosition, b: GridPosition): number {
  return Math.abs(a.row - b.row) + Math.abs(a.col - b.col);
}

/**
 * Checks if there's a straight line of sight between two positions with no blocking walls
 * @param grid The game grid
 * @param from Starting position
 * @param to Target position
 * @returns true if there's a clear line of sight, false otherwise
 */
function hasLineOfSight(
  grid: TileInstance[][],
  from: GridPosition,
  to: GridPosition
): boolean {
  const rows = grid.length;
  const cols = grid[0].length;

  // Check if positions are in a straight line (same row or same column)
  const isSameRow = from.row === to.row;
  const isSameCol = from.col === to.col;

  console.log(`[LOS] Checking from (${from.row},${from.col}) to (${to.row},${to.col}): sameRow=${isSameRow}, sameCol=${isSameCol}`);

  if (!isSameRow && !isSameCol) {
    console.log(`[LOS] Not in straight line - no LOS`);
    return false; // Not a straight line
  }

  // Check each tile along the path
  if (isSameRow) {
    // Horizontal line of sight
    const direction = from.col < to.col ? 1 : -1;

    for (let col = from.col; col !== to.col; col += direction) {
      const currentPos = { row: from.row, col };
      const nextPos = { row: from.row, col: col + direction };

      // Check bounds
      if (nextPos.col < 0 || nextPos.col >= cols) {
        return false;
      }

      const currentTile = grid[currentPos.row][currentPos.col];
      const nextTile = grid[nextPos.row][nextPos.col];

      if (!currentTile || !nextTile) {
        return false;
      }

      // Check if there's an opening in the correct direction
      const currentEdges = getTileEdges(currentTile.type, currentTile.orientation);
      const nextEdges = getTileEdges(nextTile.type, nextTile.orientation);

      if (direction > 0) {
        // Moving east
        if (!currentEdges.east || !nextEdges.west) {
          console.log(`[LOS] Wall blocking at (${currentPos.row},${currentPos.col}) -> (${nextPos.row},${nextPos.col}) moving east`);
          return false; // Wall blocking
        }
      } else {
        // Moving west
        if (!currentEdges.west || !nextEdges.east) {
          console.log(`[LOS] Wall blocking at (${currentPos.row},${currentPos.col}) -> (${nextPos.row},${nextPos.col}) moving west`);
          return false; // Wall blocking
        }
      }
    }
  } else {
    // Vertical line of sight
    const direction = from.row < to.row ? 1 : -1;

    for (let row = from.row; row !== to.row; row += direction) {
      const currentPos = { row, col: from.col };
      const nextPos = { row: row + direction, col: from.col };

      // Check bounds
      if (nextPos.row < 0 || nextPos.row >= rows) {
        return false;
      }

      const currentTile = grid[currentPos.row][currentPos.col];
      const nextTile = grid[nextPos.row][nextPos.col];

      if (!currentTile || !nextTile) {
        return false;
      }

      // Check if there's an opening in the correct direction
      const currentEdges = getTileEdges(currentTile.type, currentTile.orientation);
      const nextEdges = getTileEdges(nextTile.type, nextTile.orientation);

      if (direction > 0) {
        // Moving south
        if (!currentEdges.south || !nextEdges.north) {
          console.log(`[LOS] Wall blocking at (${currentPos.row},${currentPos.col}) -> (${nextPos.row},${nextPos.col}) moving south`);
          return false; // Wall blocking
        }
      } else {
        // Moving north
        if (!currentEdges.north || !nextEdges.south) {
          console.log(`[LOS] Wall blocking at (${currentPos.row},${currentPos.col}) -> (${nextPos.row},${nextPos.col}) moving north`);
          return false; // Wall blocking
        }
      }
    }
  }

  console.log(`[LOS] Clear line of sight!`);
  return true; // Clear line of sight
}

export interface EnemyMove {
  enemy: MapObject;
  path: GridPosition[];
  isRangedAttack?: boolean;  // True if this is a ranged attack instead of movement
  isHealingAction?: boolean;  // True if this is a healing action instead of movement
  healTarget?: MapObject;  // Target to heal (only for healing actions)
  isTeleportAction?: boolean;  // True if this is a teleport action
  isSummonAction?: boolean;  // True if this is a summon action
  summonPosition?: GridPosition;  // Position where skeleton will be summoned
  isBossSpawnAction?: boolean;  // True if this is a boss spawn action
  bossSpawnEnemyType?: string;  // Type of enemy to spawn (only for boss spawn actions)
  bossSpawnPosition?: GridPosition;  // Position where enemy will be spawned
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

  const reachable = findReachableTiles(grid, enemy.gridPosition, moves, blockedPositions, enemy.flying);
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

/**
 * Calculates ranged enemy behavior
 * If line of sight exists, perform ranged attack instead of moving
 * Otherwise, move toward player like Hunter
 */
function calculateRangedMove(
  grid: TileInstance[][],
  enemy: MapObject,
  playerPos: GridPosition,
  blockedPositions: GridPosition[]
): EnemyMove | null {
  // Check if we have line of sight to player
  const hasLOS = hasLineOfSight(grid, enemy.gridPosition, playerPos);
  console.log(`[RangedAI] Enemy ${enemy.id} at (${enemy.gridPosition.row},${enemy.gridPosition.col}) checking LOS to player at (${playerPos.row},${playerPos.col}): ${hasLOS}`);

  if (hasLOS) {
    // Perform ranged attack - no movement, just mark as ranged attack
    console.log(`[RangedAI] Enemy ${enemy.id} has line of sight - performing ranged attack`);
    return {
      enemy,
      path: [enemy.gridPosition], // Stay in place
      isRangedAttack: true,
    };
  }

  // No line of sight, behave like Hunter (move toward player)
  console.log(`[RangedAI] Enemy ${enemy.id} no line of sight - moving toward player`);
  return calculateHunterMove(grid, enemy, playerPos, blockedPositions);
}

/**
 * Calculates healer enemy behavior
 * If there's a wounded ally with LOS, heal them instead of moving
 * Otherwise, move toward player like Hunter
 */
function calculateHealerMove(
  grid: TileInstance[][],
  enemy: MapObject,
  playerPos: GridPosition,
  blockedPositions: GridPosition[],
  allEnemies: MapObject[]
): EnemyMove | null {
  // Find wounded allies (enemies that are not at full HP)
  const woundedAllies = allEnemies.filter(ally =>
    ally.id !== enemy.id &&
    ally.currentHP !== undefined &&
    ally.stats?.hp !== undefined &&
    ally.currentHP < ally.stats.hp &&
    ally.currentHP > 0  // Not dead
  );

  console.log(`[HealerAI] Enemy ${enemy.id} found ${woundedAllies.length} wounded allies`);

  // Check each wounded ally for line of sight
  for (const ally of woundedAllies) {
    const hasLOS = hasLineOfSight(grid, enemy.gridPosition, ally.gridPosition);
    console.log(`[HealerAI] Enemy ${enemy.id} checking LOS to wounded ally ${ally.id} at (${ally.gridPosition.row},${ally.gridPosition.col}): ${hasLOS}`);

    if (hasLOS) {
      // Heal this ally
      console.log(`[HealerAI] Enemy ${enemy.id} has line of sight to wounded ally - performing heal`);
      return {
        enemy,
        path: [enemy.gridPosition], // Stay in place
        isHealingAction: true,
        healTarget: ally,
      };
    }
  }

  // No wounded allies with LOS, behave like Hunter (move toward player and attack normally)
  console.log(`[HealerAI] Enemy ${enemy.id} no wounded allies with LOS - moving toward player to attack`);
  const hunterMove = calculateHunterMove(grid, enemy, playerPos, blockedPositions);
  if (hunterMove) {
    console.log(`[HealerAI] Enemy ${enemy.id} will move ${hunterMove.path.length - 1} tiles toward player`);
  }
  return hunterMove;
}

/**
 * Calculates teleporter enemy behavior
 * Tracks movement count and teleports next to player every 5 moves
 * Between teleports, moves toward player like Hunter
 */
function calculateTeleporterMove(
  grid: TileInstance[][],
  enemy: MapObject,
  playerPos: GridPosition,
  blockedPositions: GridPosition[]
): EnemyMove | null {
  const TELEPORT_THRESHOLD = 5;

  // Initialize counter if not set
  if (enemy.teleportCounter === undefined) {
    enemy.teleportCounter = 0;
  }

  // Increment counter
  enemy.teleportCounter++;
  console.log(`[TeleporterAI] Enemy ${enemy.id} counter: ${enemy.teleportCounter}/${TELEPORT_THRESHOLD}`);

  // Check if ready to teleport
  if (enemy.teleportCounter >= TELEPORT_THRESHOLD) {
    // Find unoccupied tiles adjacent to player
    const adjacentPositions: GridPosition[] = [
      { row: playerPos.row - 1, col: playerPos.col },     // North
      { row: playerPos.row + 1, col: playerPos.col },     // South
      { row: playerPos.row, col: playerPos.col - 1 },     // West
      { row: playerPos.row, col: playerPos.col + 1 },     // East
    ];

    // Filter for valid, unoccupied positions
    const validPositions = adjacentPositions.filter(pos => {
      // Check bounds
      if (pos.row < 0 || pos.row >= grid.length || pos.col < 0 || pos.col >= grid[0].length) {
        return false;
      }

      // Check if position is blocked by another enemy
      const isBlocked = blockedPositions.some(blocked =>
        blocked.row === pos.row && blocked.col === pos.col
      );

      return !isBlocked;
    });

    if (validPositions.length > 0) {
      // Pick random adjacent position
      const targetPos = validPositions[Math.floor(Math.random() * validPositions.length)];
      console.log(`[TeleporterAI] Enemy ${enemy.id} teleporting to (${targetPos.row},${targetPos.col})`);

      // Reset counter
      enemy.teleportCounter = 0;

      // Return teleport action with path from current position to target
      return {
        enemy,
        path: [enemy.gridPosition, targetPos],
        isTeleportAction: true,
      };
    } else {
      console.log(`[TeleporterAI] Enemy ${enemy.id} has no valid teleport positions`);
      // No valid positions, don't reset counter - will try again next turn
    }
  }

  // Not ready to teleport or no valid positions, behave like Hunter
  console.log(`[TeleporterAI] Enemy ${enemy.id} moving normally toward player`);
  return calculateHunterMove(grid, enemy, playerPos, blockedPositions);
}

/**
 * Calculates summoner enemy behavior
 * Tracks movement count and summons a skeleton every 5 moves
 * Between summons, moves toward player like Hunter
 */
function calculateSummonerMove(
  grid: TileInstance[][],
  enemy: MapObject,
  playerPos: GridPosition,
  blockedPositions: GridPosition[]
): EnemyMove | null {
  const SUMMON_THRESHOLD = 5;

  // Initialize counter if not set
  if (enemy.summonCounter === undefined) {
    enemy.summonCounter = 0;
  }

  // Increment counter
  enemy.summonCounter++;
  console.log(`[SummonerAI] Enemy ${enemy.id} counter: ${enemy.summonCounter}/${SUMMON_THRESHOLD}`);

  // Check if ready to summon
  if (enemy.summonCounter >= SUMMON_THRESHOLD) {
    // Find all unoccupied tiles in the grid
    const unoccupiedPositions: GridPosition[] = [];

    for (let row = 0; row < grid.length; row++) {
      for (let col = 0; col < grid[0].length; col++) {
        const pos = { row, col };

        // Check if position is blocked by another enemy
        const isBlocked = blockedPositions.some(blocked =>
          blocked.row === pos.row && blocked.col === pos.col
        );

        // Check if position is the player's position
        const isPlayer = pos.row === playerPos.row && pos.col === playerPos.col;

        // Check if position is the summoner's own position
        const isSelf = pos.row === enemy.gridPosition.row && pos.col === enemy.gridPosition.col;

        if (!isBlocked && !isPlayer && !isSelf) {
          unoccupiedPositions.push(pos);
        }
      }
    }

    if (unoccupiedPositions.length > 0) {
      // Pick random unoccupied position
      const summonPos = unoccupiedPositions[Math.floor(Math.random() * unoccupiedPositions.length)];
      console.log(`[SummonerAI] Enemy ${enemy.id} summoning skeleton at (${summonPos.row},${summonPos.col})`);

      // Reset counter
      enemy.summonCounter = 0;

      // Return summon action (summoner stays in place)
      return {
        enemy,
        path: [enemy.gridPosition],
        isSummonAction: true,
        summonPosition: summonPos,
      };
    } else {
      console.log(`[SummonerAI] Enemy ${enemy.id} has no valid summon positions`);
      // No valid positions, don't reset counter - will try again next turn
    }
  }

  // Not ready to summon or no valid positions, behave like Hunter
  console.log(`[SummonerAI] Enemy ${enemy.id} moving normally toward player`);
  return calculateHunterMove(grid, enemy, playerPos, blockedPositions);
}

/**
 * Calculates king enemy behavior (final boss)
 * Stays in place and spawns a random enemy every 3 turns
 */
function calculateKingMove(
  grid: TileInstance[][],
  enemy: MapObject,
  playerPos: GridPosition,
  blockedPositions: GridPosition[]
): EnemyMove | null {
  const SPAWN_THRESHOLD = 3;

  // Initialize counter if not set
  if (enemy.kingSpawnCounter === undefined) {
    enemy.kingSpawnCounter = 0;
  }

  // Increment counter
  enemy.kingSpawnCounter++;
  console.log(`[KingAI] Enemy ${enemy.id} counter: ${enemy.kingSpawnCounter}/${SPAWN_THRESHOLD}`);

  // Check if ready to spawn
  if (enemy.kingSpawnCounter >= SPAWN_THRESHOLD) {
    // Find all unoccupied tiles in the grid
    const unoccupiedPositions: GridPosition[] = [];

    for (let row = 0; row < grid.length; row++) {
      for (let col = 0; col < grid[0].length; col++) {
        const pos = { row, col };

        // Check if position is blocked by another enemy
        const isBlocked = blockedPositions.some(blocked =>
          blocked.row === pos.row && blocked.col === pos.col
        );

        // Check if position is the player's position
        const isPlayer = pos.row === playerPos.row && pos.col === playerPos.col;

        // Check if position is the king's own position
        const isSelf = pos.row === enemy.gridPosition.row && pos.col === enemy.gridPosition.col;

        if (!isBlocked && !isPlayer && !isSelf) {
          unoccupiedPositions.push(pos);
        }
      }
    }

    if (unoccupiedPositions.length > 0) {
      // Pick random unoccupied position
      const spawnPos = unoccupiedPositions[Math.floor(Math.random() * unoccupiedPositions.length)];

      // Pick random enemy type (excluding king)
      const enemyTypes = ["goblin", "bat", "archer", "brute", "shaman", "assassin", "skeleton", "summoner"];
      const randomEnemyType = enemyTypes[Math.floor(Math.random() * enemyTypes.length)];

      console.log(`[KingAI] Enemy ${enemy.id} spawning ${randomEnemyType} at (${spawnPos.row},${spawnPos.col})`);

      // Reset counter
      enemy.kingSpawnCounter = 0;

      // Return boss spawn action (king stays in place)
      return {
        enemy,
        path: [enemy.gridPosition],
        isBossSpawnAction: true,
        bossSpawnEnemyType: randomEnemyType,
        bossSpawnPosition: spawnPos,
      };
    } else {
      console.log(`[KingAI] Enemy ${enemy.id} has no valid spawn positions`);
      // No valid positions, don't reset counter - will try again next turn
    }
  }

  // King doesn't move - stay in place
  console.log(`[KingAI] Enemy ${enemy.id} standing still`);
  return null;
}

export function calculateEnemyMove(
  grid: TileInstance[][],
  enemy: MapObject,
  playerPos: GridPosition,
  blockedPositions: GridPosition[] = [],
  allEnemies: MapObject[] = []
): EnemyMove | null {
  console.log(`[calculateEnemyMove] Enemy ${enemy.id} (${enemy.name}): aiType=${enemy.aiType}, movesRemaining=${enemy.movesRemaining}`);

  // Check AI type and dispatch to appropriate function
  if (enemy.aiType === AIType.Ranged) {
    return calculateRangedMove(grid, enemy, playerPos, blockedPositions);
  }

  if (enemy.aiType === AIType.Healer) {
    return calculateHealerMove(grid, enemy, playerPos, blockedPositions, allEnemies);
  }

  if (enemy.aiType === AIType.Teleporter) {
    return calculateTeleporterMove(grid, enemy, playerPos, blockedPositions);
  }

  if (enemy.aiType === AIType.Summoner) {
    return calculateSummonerMove(grid, enemy, playerPos, blockedPositions);
  }

  if (enemy.aiType === AIType.King) {
    return calculateKingMove(grid, enemy, playerPos, blockedPositions);
  }

  // Default to Hunter behavior
  return calculateHunterMove(grid, enemy, playerPos, blockedPositions);
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
  // Track positions by enemy ID for reliable updates
  const occupiedPositions = new Map<number, GridPosition>();
  for (const enemy of enemies) {
    occupiedPositions.set(enemy.id, { ...enemy.gridPosition });
  }

  for (const enemy of enemies) {
    // Get all other enemy positions (excluding this enemy)
    const otherEnemyPositions: GridPosition[] = [];
    for (const [enemyId, pos] of occupiedPositions) {
      if (enemyId !== enemy.id) {
        otherEnemyPositions.push(pos);
      }
    }

    const move = calculateEnemyMove(grid, enemy, playerPos, otherEnemyPositions, enemies);
    if (move) {
      console.log(`[calculateAllEnemyMoves] Enemy ${enemy.id}: isRangedAttack=${move.isRangedAttack}, isHealingAction=${move.isHealingAction}, isTeleportAction=${move.isTeleportAction}, isSummonAction=${move.isSummonAction}, isBossSpawnAction=${move.isBossSpawnAction}, path.length=${move.path.length}`);
      // Include ranged attacks, healing actions, teleport actions, summon actions, boss spawn actions, and movement
      if (move.isRangedAttack || move.isHealingAction || move.isTeleportAction || move.isSummonAction || move.isBossSpawnAction || move.path.length > 1) {
        console.log(`[calculateAllEnemyMoves] Adding move for enemy ${enemy.id}`);
        moves.push(move);
        // Update this enemy's position in the map (only if actually moving or teleporting)
        if (!move.isRangedAttack && !move.isHealingAction && !move.isSummonAction && !move.isBossSpawnAction) {
          const finalPos = move.path[move.path.length - 1];
          occupiedPositions.set(enemy.id, { ...finalPos });
        }
      }
    }
  }

  return moves;
}
