import { k } from "../kaplayCtx";
import { loadAssets, loadEnemyDatabase, enemyDatabase, loadItemDatabase, itemDatabase } from "./assets";
import { TurnManager } from "./systems/TurnManager";
import { InputController } from "./systems/InputController";
import { CursorManager } from "./systems/CursorManager";
import { StartLevelSequence } from "./systems/StartLevelSequence";
import { GRID_ROWS, GRID_COLS, STARTING_LEVEL, STARTING_ITEMS, ITEM_DROP_PROBABILITY, ENEMY_BUDGET_MODIFIER } from "./config";
import { getImmovableEdgeTiles, getOppositeSide, getRandomTileOnSide } from "./core/Grid";
import { applyEquipmentBonuses } from "./systems/EquipmentManager";
import type { GridPosition } from "./types";
import type { EnemyDatabase } from "./systems/EnemyDatabase";
import {
  initializeGameHandlers,
  setTurnManager,
  setInputController,
  setCursorManager,
  render,
  resetAnimationFlag,
} from "./index";

// Global state that persists across scene reloads
let globalCurrentLevel = STARTING_LEVEL;
let globalIsAscending = false;  // True if ascending toward surface, false if descending deeper
let globalInventory: (import("./types").ItemInstance | null)[] | null = null;
let globalEquipment: (import("./types").ItemInstance | null)[] | null = null;
let globalIsBossRoom = false;  // True if in boss room
let globalPlayerHP: number | null = null;  // Player's current HP that persists between levels

export function resetGlobalLevel(): void {
  globalCurrentLevel = STARTING_LEVEL;
  globalIsAscending = false;
  globalInventory = null;
  globalEquipment = null;
  globalIsBossRoom = false;
  globalPlayerHP = null;
}

export function enterBossRoom(): void {
  globalIsBossRoom = true;
  globalCurrentLevel = 0;  // Set to 0 for boss room
}

/**
 * Generates a list of enemies for a given level based on budget formula
 * Budget = Math.max(STARTING_LEVEL - current_level + ENEMY_BUDGET_MODIFIER, ENEMY_BUDGET_MODIFIER)
 * Randomly selects enemies whose tier sum doesn't exceed the budget
 * Places them on random non-edge tiles
 */
function generateEnemiesForLevel(level: number, enemyDb: EnemyDatabase): { enemyId: string, position: GridPosition }[] {
  // Calculate enemy budget
  const budget = Math.max(STARTING_LEVEL - level + ENEMY_BUDGET_MODIFIER, ENEMY_BUDGET_MODIFIER);

  // Get all available enemy types
  const allEnemyIds = enemyDb.getAllEnemyIds();
  if (allEnemyIds.length === 0) {
    return [];
  }

  // Get tier for each enemy type
  const enemyTiers = new Map<string, number>();
  for (const enemyId of allEnemyIds) {
    const enemyDef = enemyDb.getEnemyDefinition(enemyId);
    if (enemyDef) {
      enemyTiers.set(enemyId, enemyDef.tier);
    }
  }

  // Randomly select enemies until budget is exhausted
  const selectedEnemies: string[] = [];
  let remainingBudget = budget;

  while (remainingBudget > 0) {
    // Filter enemies that fit in remaining budget
    const affordableEnemies = allEnemyIds.filter(id => {
      const tier = enemyTiers.get(id) || 1;
      return tier <= remainingBudget;
    });

    if (affordableEnemies.length === 0) {
      // No more enemies fit in budget
      break;
    }

    // Randomly select one affordable enemy
    const selectedId = affordableEnemies[Math.floor(Math.random() * affordableEnemies.length)];
    const tier = enemyTiers.get(selectedId) || 1;

    selectedEnemies.push(selectedId);
    remainingBudget -= tier;
  }

  // Generate non-edge tile positions
  const nonEdgePositions: GridPosition[] = [];
  for (let row = 1; row < GRID_ROWS - 1; row++) {
    for (let col = 1; col < GRID_COLS - 1; col++) {
      nonEdgePositions.push({ row, col });
    }
  }

  // Shuffle positions
  for (let i = nonEdgePositions.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [nonEdgePositions[i], nonEdgePositions[j]] = [nonEdgePositions[j], nonEdgePositions[i]];
  }

  // Assign positions to enemies
  const result: { enemyId: string, position: GridPosition }[] = [];
  for (let i = 0; i < selectedEnemies.length && i < nonEdgePositions.length; i++) {
    result.push({
      enemyId: selectedEnemies[i],
      position: nonEdgePositions[i]
    });
  }

  return result;
}

export function fallThroughFloor(currentState: import("./types").GameState): void {
  // Save current inventory and equipment before falling
  globalInventory = [...currentState.inventory];
  globalEquipment = [...currentState.equipment];

  // Increment global level counter (going deeper into dungeon)
  globalCurrentLevel++;
  globalIsAscending = false;  // Falling deeper (descending)

  // Generate new level
  k.go("main");
}

export function showGameOver(): void {
  // Show game over overlay
  k.add([
    k.rect(640, 360),
    k.pos(0, 0),
    k.color(0, 0, 0),
    k.opacity(0.8),
    k.z(1000),
    "gameOverOverlay",
  ]);
  k.add([
    k.text("GAME OVER", { size: 48 }),
    k.pos(320, 150),
    k.anchor("center"),
    k.color(255, 80, 80),
    k.z(1001),
    "gameOverText",
  ]);
  k.add([
    k.text("You have been defeated!", { size: 24 }),
    k.pos(320, 220),
    k.anchor("center"),
    k.color(255, 255, 255),
    k.z(1001),
    "gameOverText",
  ]);
  k.add([
    k.text("Click to return to title", { size: 16 }),
    k.pos(320, 280),
    k.anchor("center"),
    k.color(150, 150, 150),
    k.z(1001),
    "gameOverText",
  ]);

  // Click to return to title
  k.onMousePress("left", () => {
    resetGlobalLevel();
    k.go("title");
  });
}

export function createMainScene(): void {
  k.scene("main", async () => {
    await loadAssets();
    await loadEnemyDatabase();
    await loadItemDatabase();

    // Initialize managers
    const cursorManager = new CursorManager();
    cursorManager.initialize();
    setCursorManager(cursorManager);

    const turnManager = new TurnManager(render, enemyDatabase, itemDatabase, resetAnimationFlag);
    setTurnManager(turnManager);

    // Set current level and direction from global counter
    const state = turnManager.getState();
    state.currentLevel = globalCurrentLevel;
    state.isAscending = globalIsAscending;
    state.isBossRoom = globalIsBossRoom;

    // If in boss room, set all tile decay to 0
    if (globalIsBossRoom) {
      for (let row = 0; row < state.grid.length; row++) {
        for (let col = 0; col < state.grid[row].length; col++) {
          state.grid[row][col].decay = 0;
        }
      }
    }

    // Initialize or restore inventory and equipment
    let restoredEquipment = false;
    if (globalInventory === null || globalEquipment === null) {
      // First time starting the game - initialize with starting items
      STARTING_ITEMS.forEach((itemId, index) => {
        const itemDef = itemDatabase.getItem(itemId);
        const charges = itemDef ? itemDef.charges : -1;
        state.inventory[index] = { definitionId: itemId, remainingCharges: charges };
      });

      // Save to global state
      globalInventory = [...state.inventory];
      globalEquipment = [...state.equipment];
    } else {
      // Continuing from previous level - restore saved inventory and equipment
      state.inventory = [...globalInventory];
      state.equipment = [...globalEquipment];
      restoredEquipment = true;
    }

    const inputController = new InputController(turnManager);
    setInputController(inputController);

    // Set up all event handlers
    initializeGameHandlers(turnManager, inputController, cursorManager);

    // Create game objects
    const objManager = turnManager.getObjectManager();

    // Prepare exit tile position (used for exit and player spawn in normal levels)
    const immovableEdges = getImmovableEdgeTiles(GRID_ROWS, GRID_COLS);
    const exitTile = immovableEdges[Math.floor(Math.random() * immovableEdges.length)];

    // Create exit (but not in boss room)
    if (!globalIsBossRoom) {
      objManager.createExit(
        { row: exitTile.row, col: exitTile.col },
        "Exit Stairs",
        (_mob, isPlayer) => {
          if (isPlayer) {
            // Save current inventory, equipment, and HP before transitioning
            const currentState = turnManager.getState();
            globalInventory = [...currentState.inventory];
            globalEquipment = [...currentState.equipment];
            const playerObj = turnManager.getObjectManager().getPlayer();
            if (playerObj?.currentHP !== undefined) {
              globalPlayerHP = playerObj.currentHP;
            }

            // Decrement global level counter
            globalCurrentLevel--;
            globalIsAscending = true;  // Ascending toward surface

            if (globalCurrentLevel === 0 && !globalIsBossRoom) {
              // Entering boss room!
              globalIsBossRoom = true;
              k.go("main");
            } else if (globalCurrentLevel < 0 || globalIsBossRoom) {
              // Victory - escaped after defeating boss or went past level 0!
              k.add([
                k.rect(640, 360),
                k.pos(0, 0),
                k.color(0, 0, 0),
                k.opacity(0.8),
                k.z(1000),
                "victoryOverlay",
              ]);
              k.add([
                k.text("VICTORY!", { size: 48 }),
                k.pos(320, 150),
                k.anchor("center"),
                k.color(255, 215, 0),
                k.z(1001),
                "victoryText",
              ]);
              k.add([
                k.text("You escaped the dungeon!", { size: 24 }),
                k.pos(320, 220),
                k.anchor("center"),
                k.color(255, 255, 255),
                k.z(1001),
                "victoryText",
              ]);
            } else {
              // Generate new level
              k.go("main");
            }
          }
        }
      );
    }

    // Boss room setup or normal level setup
    if (globalIsBossRoom) {
      // Boss room: spawn player at 2/6, king at 2/2
      objManager.createPlayer({ row: 2, col: 6 }, "Player1");

      // Restore player HP and apply equipment bonuses
      const player = objManager.getPlayer();
      if (player) {
        if (globalPlayerHP !== null && player.currentHP !== undefined) {
          player.currentHP = globalPlayerHP;
        }
        if (restoredEquipment) {
          try {
            applyEquipmentBonuses(player, state.equipment, itemDatabase);
          } catch (error) {
            // Error applying equipment bonuses
          }
        }
      }

      // Spawn king at position 2/2
      const king = objManager.createEnemy({ row: 2, col: 2 }, "king");
      king.isInStartLevelSequence = true;
    } else {
      // Normal level setup
      // Create player on opposite side from exit
      const oppositeSide = getOppositeSide(exitTile.side);
      const playerTile = getRandomTileOnSide(oppositeSide, GRID_ROWS, GRID_COLS);
      objManager.createPlayer({ row: playerTile.row, col: playerTile.col }, "Player1");

      // Restore player HP and apply equipment bonuses
      const player = objManager.getPlayer();
      if (player) {
        if (globalPlayerHP !== null && player.currentHP !== undefined) {
          player.currentHP = globalPlayerHP;
        }
        if (restoredEquipment) {
          try {
            applyEquipmentBonuses(player, state.equipment, itemDatabase);
          } catch (error) {
            // Error applying equipment bonuses
          }
        }
      }

      // Generate and create enemies based on level budget
      const enemiesToSpawn = generateEnemiesForLevel(globalCurrentLevel, enemyDatabase);
      enemiesToSpawn.forEach(({ enemyId, position }) => {
        const enemy = objManager.createEnemy(position, enemyId);
        enemy.isInStartLevelSequence = true;
      });

      // Spawn random items on empty tiles (tier based on level)
      objManager.spawnRandomItems(ITEM_DROP_PROBABILITY, globalCurrentLevel);
    }

    // Create and start the level sequence
    const startSequence = new StartLevelSequence(
      turnManager.getState(),
      objManager,
      () => {
        render();
      },
      () => {
        turnManager.startPlayerTurn();
      }
    );

    // Start the sequence (async, but we don't await)
    startSequence.start();
  });
}

