import { k } from "../kaplayCtx";
import { TurnManager } from "./systems/TurnManager";
import { InputController } from "./systems/InputController";
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
import { TurnPhase, type PlotPosition, type GridPosition, type MapObject } from "./types";
import { findReachableTiles, type ReachableTile } from "./systems/Pathfinding";
import { TILE_SIZE, GRID_OFFSET_X, GRID_OFFSET_Y } from "./config";
import { calculateAllEnemyMoves, type EnemyMove } from "./systems/EnemyAI";

let turnManager: TurnManager;
let inputController: InputController;
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

    player.gridPosition.row = to.row;
    player.gridPosition.col = to.col;
  }

  k.destroyAll("movingPlayer");
  turnManager.getObjectManager().spendMovement(player, path.length - 1);
  turnManager.markPlayerMoved();

  isAnimating = false;
  exitMovementMode();
  render();
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

async function endPlayerTurn(): Promise<void> {
  if (isAnimating) return;
  if (!turnManager.isPlayerTurn()) return;

  console.log("Ending player turn");
  turnManager.startEnemyTurn();
  await executeEnemyTurns();
  turnManager.startNewTurn();
}

export async function initGame(): Promise<void> {
  await loadAssets();

  k.onMousePress("left", handleClick);
  k.onMousePress("right", handleRightClick);
  k.onKeyPress("enter", () => endPlayerTurn());
  k.onKeyPress("e", () => endPlayerTurn());

  turnManager = new TurnManager(render);
  inputController = new InputController(turnManager);
  inputController.setOnPushRequested(() => {
    if (!isAnimating && turnManager.canPush()) {
      executePushWithAnimation();
    }
  });

  const objManager = turnManager.getObjectManager();
  objManager.createPlayer({ row: 3, col: 3 }, "Player1");
  objManager.createRedEnemy({ row: 0, col: 0 });
  objManager.createYellowEnemy({ row: 0, col: 6 });
  objManager.createGreenEnemy({ row: 6, col: 0 });

  turnManager.startNewTurn();
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

  if (state.turnPhase === TurnPhase.PlayerTurn) {
    drawGridWithOverlay(state.grid, null);
    if (isMovementMode) {
      drawReachableTiles(reachableTiles);
    }
    drawMapObjects(mapObjects);
    if (state.currentTile && !state.hasPlacedTile) {
      drawPreviewTile(state.currentTile);
      const plots = turnManager.getPlots();
      drawPlots(plots, null, state.turnPhase);
    }
  } else if (state.turnPhase === TurnPhase.TilePlacement && state.currentTile) {
    drawGridWithOverlay(state.grid, state.selectedPlot);
    drawMapObjects(mapObjects);
    const plots = turnManager.getPlots();
    drawPlots(plots, state.selectedPlot, state.turnPhase);
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
  }
}

export function getGameState() {
  return turnManager.getState();
}
