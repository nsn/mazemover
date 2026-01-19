import { k } from "../kaplayCtx";
import { loadAssets, loadEnemyDatabase, enemyDatabase, loadItemDatabase, itemDatabase } from "./assets";
import { TurnManager } from "./systems/TurnManager";
import { InputController } from "./systems/InputController";
import { CursorManager } from "./systems/CursorManager";
import { StartLevelSequence } from "./systems/StartLevelSequence";
import { GRID_ROWS, GRID_COLS, STARTING_LEVEL, STARTING_ITEMS } from "./config";
import { getImmovableEdgeTiles, getOppositeSide, getRandomTileOnSide } from "./core/Grid";
import { applyEquipmentBonuses } from "./systems/EquipmentManager";
import {
  initializeGameHandlers,
  setTurnManager,
  setInputController,
  setCursorManager,
  render,
} from "./index";

// Global state that persists across scene reloads
let globalCurrentLevel = STARTING_LEVEL;
let globalInventory: (import("./types").ItemInstance | null)[] | null = null;
let globalEquipment: (import("./types").ItemInstance | null)[] | null = null;

export function resetGlobalLevel(): void {
  globalCurrentLevel = STARTING_LEVEL;
  globalInventory = null;
  globalEquipment = null;
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

    const turnManager = new TurnManager(render, enemyDatabase, itemDatabase);
    setTurnManager(turnManager);

    // Set current level from global counter
    const state = turnManager.getState();
    state.currentLevel = globalCurrentLevel;
    console.log(`[MainScene] Starting at level ${globalCurrentLevel}`);

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
          console.log(`[Game] Player reached the exit! Descending to level: ${globalCurrentLevel}`);

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

    // Create enemies (will be spawned by StartLevelSequence)
    const goblin1 = objManager.createEnemy({ row: 3, col: 3 }, "goblin");
    const goblin2 = objManager.createEnemy({ row: 3, col: 2 }, "goblin");
    const goblin3 = objManager.createEnemy({ row: 2, col: 3 }, "goblin");

    // Mark all objects as part of start level sequence
    goblin1.isInStartLevelSequence = true;
    goblin2.isInStartLevelSequence = true;
    goblin3.isInStartLevelSequence = true;

    // Spawn random items on empty tiles (5% chance per tile)
    objManager.spawnRandomItems(0.05);

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
