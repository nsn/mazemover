import { k } from "../kaplayCtx";
import { TurnManager } from "./systems/TurnManager";
import { InputController } from "./systems/InputController";
import { CursorManager } from "./systems/CursorManager";
import {
  drawPlots,
  clearAllTiles,
  drawCurrentTile,
  animatePush,
  drawPreviewTile,
  drawGridWithOverlay,
  drawMapObjects,
  drawReachableTiles,
} from "./render/GridRenderer";
import { loadAssets } from "./assets";
import { TurnOwner, PlayerPhase, type PlotPosition, type GridPosition, type MapObject } from "./types";
import { findReachableTiles, type ReachableTile } from "./systems/Pathfinding";
import { TILE_SIZE, GRID_OFFSET_X, GRID_OFFSET_Y, GRID_ROWS, GRID_COLS } from "./config";
import { calculateAllEnemyMoves, type EnemyMove } from "./systems/EnemyAI";
import { getImmovableEdgeTiles, getOppositeSide, getRandomTileOnSide } from "./core/Grid";

let turnManager: TurnManager;
let inputController: InputController;
let cursorManager: CursorManager;
let isAnimating = false;
let isMovementMode = false;
let reachableTiles: ReachableTile[] = [];
let selectedPlayer: MapObject | null = null;

function handleClick(): void {
  if (isAnimating) {
    console.log("Click ignored - animating");
    return;
  }

  const pos = k.mousePos();
  console.log("Click at:", pos);

  if (isMovementMode && selectedPlayer) {
    const reachableHighlights = k.get("reachableHighlight");
    for (const highlight of reachableHighlights) {
      if ((highlight as any).hasPoint && (highlight as any).hasPoint(pos)) {
        const targetPos = (highlight as any).gridPos as GridPosition;
        console.log("Reachable tile hit - moving to:", targetPos);
        const target = reachableTiles.find(
          (t) => t.position.row === targetPos.row && t.position.col === targetPos.col
        );
        if (target) {
          movePlayerAlongPath(selectedPlayer, target.path);
        }
        return;
      }
    }

    // Check if clicking on the player sprite itself (to skip turn)
    const mapObjs = k.get("mapObject");
    for (const obj of mapObjs) {
      if ((obj as any).hasPoint && (obj as any).hasPoint(pos)) {
        const objData = (obj as any).objectData as MapObject;
        if (objData.type === "Player" && objData === selectedPlayer) {
          console.log("Same player clicked - skipping turn");
          skipPlayerTurn(selectedPlayer);
          return;
        }
      }
    }

    console.log("Click outside reachable - canceling movement mode");
    exitMovementMode();
    render();
    return;
  }

  const mapObjs = k.get("mapObject");
  for (const obj of mapObjs) {
    if ((obj as any).hasPoint && (obj as any).hasPoint(pos)) {
      const objData = (obj as any).objectData as MapObject;
      if (objData.type === "Player" && objData.movesRemaining > 0) {
        console.log("Player clicked - entering movement mode");
        enterMovementMode(objData);
        return;
      }
    }
  }

  // Check if clicked on a reachable grid tile (direct move without entering movement mode first)
  if (turnManager.isPlayerTurn() && !turnManager.isTilePlacement()) {
    const player = turnManager.getObjectManager().getPlayer();
    if (player && player.movesRemaining > 0) {
      const clickedGridCol = Math.floor((pos.x - GRID_OFFSET_X) / TILE_SIZE);
      const clickedGridRow = Math.floor((pos.y - GRID_OFFSET_Y) / TILE_SIZE);
      
      if (clickedGridRow >= 0 && clickedGridRow < GRID_ROWS && 
          clickedGridCol >= 0 && clickedGridCol < GRID_COLS) {
        const state = turnManager.getState();
        const moves = turnManager.getObjectManager().getAvailableMoves(player);
        const reachable = findReachableTiles(state.grid, player.gridPosition, moves);
        const target = reachable.find(
          (t) => t.position.row === clickedGridRow && t.position.col === clickedGridCol
        );
        if (target && target.path.length > 1) {
          console.log("Direct move to reachable tile:", target.position);
          movePlayerAlongPath(player, target.path);
          return;
        }
      }
    }
  }

  const currentTiles = k.get("currentTile");
  for (const tile of currentTiles) {
    if ((tile as any).hasPoint && (tile as any).hasPoint(pos)) {
      console.log("Current tile hit - rotating");
      turnManager.rotateTile();
      return;
    }
  }

  const previewTiles = k.get("previewTile");
  for (const tile of previewTiles) {
    if ((tile as any).hasPoint && (tile as any).hasPoint(pos)) {
      if (turnManager.isPlayerTurn() && turnManager.canPlaceTile()) {
        console.log("Preview tile hit - entering tile placement");
        turnManager.enterTilePlacement();
      } else if (turnManager.isTilePlacement()) {
        console.log("Preview tile hit - rotating");
        turnManager.rotateTile();
      }
      return;
    }
  }

  const highlightAreas = k.get("highlightArea");
  for (const area of highlightAreas) {
    if ((area as any).hasPoint && (area as any).hasPoint(pos)) {
      console.log("Highlight area hit - pushing");
      if (turnManager.canPush()) {
        executePushWithAnimation();
      }
      return;
    }
  }

  const plots = k.get("plot");
  for (const plot of plots) {
    if ((plot as any).hasPoint && (plot as any).hasPoint(pos)) {
      const plotData = (plot as any).plotData as PlotPosition;
      console.log("Plot hit:", plotData);
      if (turnManager.isPlayerTurn() && turnManager.canPlaceTile()) {
        turnManager.enterTilePlacement();
        turnManager.selectPlot(plotData);
      } else if (turnManager.isTilePlacement()) {
        turnManager.selectPlot(plotData);
      }
      return;
    }
  }

  if (turnManager.isTilePlacement()) {
    console.log("Background hit - canceling");
    turnManager.cancelPlacement();
  }
}

function enterMovementMode(player: MapObject): void {
  selectedPlayer = player;
  isMovementMode = true;
  const state = turnManager.getState();
  const moves = turnManager.getObjectManager().getAvailableMoves(player);
  reachableTiles = findReachableTiles(state.grid, player.gridPosition, moves);
  console.log("Reachable tiles:", reachableTiles.length);
  render();
}

function exitMovementMode(): void {
  isMovementMode = false;
  selectedPlayer = null;
  reachableTiles = [];
}

async function movePlayerAlongPath(player: MapObject, path: GridPosition[]): Promise<void> {
  if (path.length <= 1) {
    exitMovementMode();
    render();
    return;
  }

  isAnimating = true;
  const stepDuration = 0.15;

  k.destroyAll("reachableHighlight");

  const mapObjs = k.get("mapObject");
  for (const obj of mapObjs) {
    const objData = (obj as any).objectData as MapObject;
    if (objData.id === player.id) {
      obj.destroy();
      break;
    }
  }

  const from = path[0];
  const startX = GRID_OFFSET_X + from.col * TILE_SIZE + TILE_SIZE / 2;
  const startY = GRID_OFFSET_Y + from.row * TILE_SIZE + TILE_SIZE / 2;

  const movingSprite = k.add([
    k.sprite(player.sprite),
    k.pos(startX, startY),
    k.anchor("center"),
    "movingPlayer",
  ]);

  const objectManager = turnManager.getObjectManager();
  
  for (let i = 1; i < path.length; i++) {
    const previousPosition = { ...player.gridPosition };
    const to = path[i];

    const endX = GRID_OFFSET_X + to.col * TILE_SIZE + TILE_SIZE / 2;
    const endY = GRID_OFFSET_Y + to.row * TILE_SIZE + TILE_SIZE / 2;

    const currentPos = movingSprite.pos.clone();

    k.tween(
      currentPos,
      k.vec2(endX, endY),
      stepDuration,
      (val) => {
        movingSprite.pos = val;
      },
      k.easings.easeOutQuad
    );

    await k.wait(stepDuration);

    player.gridPosition.row = to.row;
    player.gridPosition.col = to.col;
    
    objectManager.checkInteractions(player, previousPosition);
  }

  k.destroyAll("movingPlayer");
  turnManager.getObjectManager().spendMovement(player, path.length - 1);

  isAnimating = false;
  exitMovementMode();

  turnManager.completeMove();
  await executeEnemyTurns();
  turnManager.startPlayerTurn();
}

async function skipPlayerTurn(_player: MapObject): Promise<void> {
  console.log("Skipping player turn - passing to enemies");

  isAnimating = true;

  k.destroyAll("reachableHighlight");

  exitMovementMode();

  isAnimating = false;

  turnManager.completeMove();
  await executeEnemyTurns();
  turnManager.startPlayerTurn();
}

async function executeEnemyTurns(): Promise<void> {
  const state = turnManager.getState();
  const objectManager = turnManager.getObjectManager();
  const player = objectManager.getPlayer();
  if (!player) return;

  const enemyMoves = calculateAllEnemyMoves(state.grid, objectManager, player.gridPosition);

  for (const move of enemyMoves) {
    await animateEnemyMove(move);
  }
}

async function animateEnemyMove(move: EnemyMove): Promise<void> {
  const { enemy, path } = move;
  if (path.length <= 1) return;

  isAnimating = true;
  const stepDuration = 0.12;

  const mapObjs = k.get("mapObject");
  for (const obj of mapObjs) {
    const objData = (obj as any).objectData as MapObject;
    if (objData.id === enemy.id) {
      obj.destroy();
      break;
    }
  }

  const from = path[0];
  const startX = GRID_OFFSET_X + from.col * TILE_SIZE + TILE_SIZE / 2;
  const startY = GRID_OFFSET_Y + from.row * TILE_SIZE + TILE_SIZE / 2;

  const color = (enemy as any).color;
  const spriteComponents: any[] = [
    k.sprite(enemy.sprite),
    k.pos(startX, startY),
    k.anchor("center"),
    "movingEnemy",
  ];
  if (color) {
    spriteComponents.push(k.color(color.r, color.g, color.b));
  }

  const movingSprite = k.add(spriteComponents);

  for (let i = 1; i < path.length; i++) {
    const to = path[i];
    const endX = GRID_OFFSET_X + to.col * TILE_SIZE + TILE_SIZE / 2;
    const endY = GRID_OFFSET_Y + to.row * TILE_SIZE + TILE_SIZE / 2;
    const currentPos = movingSprite.pos.clone();

    k.tween(
      currentPos,
      k.vec2(endX, endY),
      stepDuration,
      (val) => {
        movingSprite.pos = val;
      },
      k.easings.easeOutQuad
    );

    await k.wait(stepDuration);

    enemy.gridPosition.row = to.row;
    enemy.gridPosition.col = to.col;
  }

  k.destroyAll("movingEnemy");
  turnManager.getObjectManager().spendMovement(enemy, path.length - 1);

  isAnimating = false;
  render();
}

function handleRightClick(): void {
  if (isAnimating) return;

  const pos = k.mousePos();

  const currentTiles = k.get("currentTile");
  for (const tile of currentTiles) {
    if ((tile as any).hasPoint && (tile as any).hasPoint(pos)) {
      console.log("Current tile right-click - rotating CCW");
      turnManager.rotateTileCounterClockwise();
      return;
    }
  }

  const previewTiles = k.get("previewTile");
  for (const tile of previewTiles) {
    if ((tile as any).hasPoint && (tile as any).hasPoint(pos)) {
      console.log("Preview tile right-click - rotating CCW");
      turnManager.rotateTileCounterClockwise();
      return;
    }
  }
}


export async function initGame(): Promise<void> {
  await loadAssets();

  cursorManager = new CursorManager();
  cursorManager.initialize();

  k.onMousePress("left", handleClick);
  k.onMousePress("right", handleRightClick);

  turnManager = new TurnManager(render);
  inputController = new InputController(turnManager);
  inputController.setOnPushRequested(() => {
    if (!isAnimating && turnManager.canPush()) {
      executePushWithAnimation();
    }
  });

  // Register cursor update callback
  k.onDraw(() => {
    cursorManager.update(turnManager);
  });

  const objManager = turnManager.getObjectManager();
  
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
  
  const oppositeSide = getOppositeSide(exitTile.side);
  const playerTile = getRandomTileOnSide(oppositeSide, GRID_ROWS, GRID_COLS);
  objManager.createPlayer({ row: playerTile.row, col: playerTile.col }, "Player1");
  
  objManager.createRedEnemy({ row: 3, col: 3 });
  objManager.createYellowEnemy({ row: 3, col: 2 });
  objManager.createGreenEnemy({ row: 2, col: 3 });

  turnManager.startPlayerTurn();
}

async function executePushWithAnimation(): Promise<void> {
  const state = turnManager.getState();
  if (!state.currentTile || !state.selectedPlot) return;

  isAnimating = true;
  clearAllTiles();

  const mapObjects = turnManager.getMapObjects();

  await animatePush(
    state.grid,
    state.selectedPlot,
    state.currentTile,
    mapObjects,
    () => {
      isAnimating = false;
      turnManager.executePush();
    }
  );
}

function render(): void {
  if (isAnimating) return;

  clearAllTiles();

  const state = turnManager.getState();
  const mapObjects = turnManager.getMapObjects();
  
  if (state.turnOwner === TurnOwner.Player) {
    if (state.playerPhase === PlayerPhase.TilePlacement && state.currentTile) {
      drawGridWithOverlay(state.grid, state.selectedPlot);
      drawMapObjects(mapObjects);
      const plots = turnManager.getPlots();
      drawPlots(plots, state.selectedPlot, state.playerPhase);
      if (state.selectedPlot) {
        drawCurrentTile(state.currentTile, state.selectedPlot);
      } else {
        drawPreviewTile(state.currentTile);
      }
    } else {
      drawGridWithOverlay(state.grid, null);
      if (isMovementMode) {
        drawReachableTiles(reachableTiles);
      }
      drawMapObjects(mapObjects);
      if (state.currentTile) {
        drawPreviewTile(state.currentTile);
        const plots = turnManager.getPlots();
        drawPlots(plots, null, state.playerPhase);
      }
    }
  } else {
    drawGridWithOverlay(state.grid, null);
    drawMapObjects(mapObjects);
  }
}

export function getGameState() {
  return turnManager.getState();
}
