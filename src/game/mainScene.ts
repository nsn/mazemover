import { k } from "../kaplayCtx";
import { loadAssets, loadEnemyDatabase, enemyDatabase, loadItemDatabase, itemDatabase } from "./assets";
import { TurnManager } from "./systems/TurnManager";
import { InputController } from "./systems/InputController";
import { CursorManager } from "./systems/CursorManager";
import { StartLevelSequence } from "./systems/StartLevelSequence";
import { GRID_ROWS, GRID_COLS, STARTING_LEVEL } from "./config";
import { getImmovableEdgeTiles, getOppositeSide, getRandomTileOnSide } from "./core/Grid";
import {
  initializeGameHandlers,
  setTurnManager,
  setInputController,
  setCursorManager,
  render,
} from "./index";

// Global level counter that persists across scene reloads
let globalCurrentLevel = STARTING_LEVEL;

export function resetGlobalLevel(): void {
  globalCurrentLevel = STARTING_LEVEL;
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

    // Add starting items to inventory
    state.inventory[0] = { definitionId: "mell", remainingCharges: -1 };
    state.inventory[1] = { definitionId: "pickaxe", remainingCharges: -1 };
    state.inventory[2] = { definitionId: "punch", remainingCharges: -1 };
    console.log("[MainScene] Added starting items to inventory: Mell, Pickaxe, Punch");

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
    const startSequence = new StartLevelSequence(
      turnManager.getState(),
      objManager,
      render, // Render callback
      () => {
        console.log("[MainScene] Level sequence complete, starting player turn");
        turnManager.startPlayerTurn();
      }
    );

    // Start the sequence (async, but we don't await)
    startSequence.start();
  });
}

export async function startGame(): Promise<void> {
  createMainScene();
  k.go("main");
}
