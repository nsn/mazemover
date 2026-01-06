import { k } from "../kaplayCtx";
import { loadAssets, loadEnemyDatabase, enemyDatabase } from "./assets";
import { TurnManager } from "./systems/TurnManager";
import { InputController } from "./systems/InputController";
import { CursorManager } from "./systems/CursorManager";
import { StartLevelSequence } from "./systems/StartLevelSequence";
import { GRID_ROWS, GRID_COLS } from "./config";
import { getImmovableEdgeTiles, getOppositeSide, getRandomTileOnSide } from "./core/Grid";
import {
  initializeGameHandlers,
  setTurnManager,
  setInputController,
  setCursorManager,
  render,
} from "./index";

export function createMainScene(): void {
  k.scene("main", async () => {
    console.log("[MainScene] Loading assets...");
    await loadAssets();
    await loadEnemyDatabase();

    console.log("[MainScene] Initializing game systems...");

    // Initialize managers
    const cursorManager = new CursorManager();
    cursorManager.initialize();
    setCursorManager(cursorManager);

    const turnManager = new TurnManager(render, enemyDatabase);
    setTurnManager(turnManager);

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
          console.log("[Game] Player reached the exit! Victory!");
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
            k.text("You escaped the maze!", { size: 24 }),
            k.pos(320, 220),
            k.anchor("center"),
            k.color(255, 255, 255),
            k.z(1001),
            "victoryText",
          ]);
        }
      }
    );

    // Create player on opposite side from exit
    const oppositeSide = getOppositeSide(exitTile.side);
    const playerTile = getRandomTileOnSide(oppositeSide, GRID_ROWS, GRID_COLS);
    objManager.createPlayer({ row: playerTile.row, col: playerTile.col }, "Player1");

    // Create enemies (will be spawned by StartLevelSequence)
    const redEnemy = objManager.createRedEnemy({ row: 3, col: 3 });
    const yellowEnemy = objManager.createYellowEnemy({ row: 3, col: 2 });
    const greenEnemy = objManager.createGreenEnemy({ row: 2, col: 3 });

    // Mark all objects as part of start level sequence
    redEnemy.isInStartLevelSequence = true;
    yellowEnemy.isInStartLevelSequence = true;
    greenEnemy.isInStartLevelSequence = true;

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
