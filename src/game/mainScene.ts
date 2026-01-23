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

export function resetGlobalLevel(): void {
  globalCurrentLevel = STARTING_LEVEL;
  globalIsAscending = false;
  globalInventory = null;
  globalEquipment = null;
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
  console.log(`[GenerateEnemies] Level ${level}, Budget: ${budget}`);

  // Get all available enemy types
  const allEnemyIds = enemyDb.getAllEnemyIds();
  if (allEnemyIds.length === 0) {
    console.warn("[GenerateEnemies] No enemies in database");
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

  console.log(`[GenerateEnemies] Selected ${selectedEnemies.length} enemies:`, selectedEnemies);

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
  console.log("[Game] Player fell through the floor! Saved inventory and equipment state");

  // Increment global level counter (going deeper into dungeon)
  globalCurrentLevel++;
  globalIsAscending = false;  // Falling deeper (descending)
  console.log(`[Game] Falling to level: ${globalCurrentLevel}`);

  // Generate new level
  k.go("main");
}

export function createMainScene(): void {
  k.scene("main", async () => {
    console.log("[MainScene] Loading assets...");
    await loadAssets();
    await loadEnemyDatabase();
    await loadItemDatabase();

    console.log("[MainScene] Initializing game systems...");

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
    console.log(`[MainScene] Starting at level ${globalCurrentLevel}, ascending: ${globalIsAscending}`);

    // Initialize or restore inventory and equipment
    let restoredEquipment = false;
    if (globalInventory === null || globalEquipment === null) {
      // First time starting the game - initialize with starting items
      console.log("[MainScene] First game start - initializing inventory with starting items");
      STARTING_ITEMS.forEach((itemId, index) => {
        state.inventory[index] = { definitionId: itemId, remainingCharges: -1 };
      });

      // Save to global state
      globalInventory = [...state.inventory];
      globalEquipment = [...state.equipment];
    } else {
      // Continuing from previous level - restore saved inventory and equipment
      console.log("[MainScene] Continuing game - restoring inventory and equipment from previous level");
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

    // Create exit
    const immovableEdges = getImmovableEdgeTiles(GRID_ROWS, GRID_COLS);
    const exitTile = immovableEdges[Math.floor(Math.random() * immovableEdges.length)];

    objManager.createExit(
      { row: exitTile.row, col: exitTile.col },
      "Exit Stairs",
      (_mob, isPlayer) => {
        if (isPlayer) {
          // Save current inventory and equipment before transitioning
          const currentState = turnManager.getState();
          globalInventory = [...currentState.inventory];
          globalEquipment = [...currentState.equipment];
          console.log("[Game] Saved inventory and equipment state");

          // Decrement global level counter
          globalCurrentLevel--;
          globalIsAscending = true;  // Ascending toward surface
          console.log(`[Game] Player reached the exit! Ascending to level: ${globalCurrentLevel}`);

          if (globalCurrentLevel === 0) {
            // Victory - reached the surface!
            console.log("[Game] VICTORY! Player escaped the dungeon!");
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
            console.log(`[Game] Generating level ${globalCurrentLevel}...`);
            k.go("main");
          }
        }
      }
    );

    // Create player on opposite side from exit
    const oppositeSide = getOppositeSide(exitTile.side);
    const playerTile = getRandomTileOnSide(oppositeSide, GRID_ROWS, GRID_COLS);
    objManager.createPlayer({ row: playerTile.row, col: playerTile.col }, "Player1");

    // Apply equipment bonuses if we restored equipment from previous level
    if (restoredEquipment) {
      try {
        const player = objManager.getPlayer();
        if (player) {
          console.log("[MainScene] Applying equipment bonuses...");
          console.log("[MainScene] Player stats before:", player.stats);
          console.log("[MainScene] Player baseStats:", player.baseStats);
          console.log("[MainScene] Equipment:", state.equipment);
          applyEquipmentBonuses(player, state.equipment, itemDatabase);
          console.log("[MainScene] Applied equipment bonuses from restored equipment");
          console.log("[MainScene] Player stats after:", player.stats);
        } else {
          console.error("[MainScene] Could not find player to apply equipment bonuses");
        }
      } catch (error) {
        console.error("[MainScene] Error applying equipment bonuses:", error);
      }
    }

    // Generate and create enemies based on level budget
    const enemiesToSpawn = generateEnemiesForLevel(globalCurrentLevel, enemyDatabase);
    const spawnedEnemies = enemiesToSpawn.map(({ enemyId, position }) => {
      const enemy = objManager.createEnemy(position, enemyId);
      enemy.isInStartLevelSequence = true;
      return enemy;
    });

    // Spawn random items on empty tiles
    objManager.spawnRandomItems(ITEM_DROP_PROBABILITY);

    // Create and start the level sequence
    console.log("[MainScene] Starting level sequence...");
    console.log("[MainScene] Game state:", {
      isInStartLevelSequence: state.isInStartLevelSequence,
      revealedTilesCount: state.revealedTiles.size,
      hasCurrentTile: state.currentTile !== null
    });

    const startSequence = new StartLevelSequence(
      turnManager.getState(),
      objManager,
      () => {
        console.log("[MainScene] Render called from StartLevelSequence");
        render();
      },
      () => {
        console.log("[MainScene] Level sequence complete, starting player turn");
        turnManager.startPlayerTurn();
      }
    );

    // Start the sequence (async, but we don't await)
    console.log("[MainScene] Calling startSequence.start()...");
    startSequence.start();
    console.log("[MainScene] startSequence.start() called (async)");
  });
}

export async function startGame(): Promise<void> {
  createMainScene();
  k.go("main");
}
