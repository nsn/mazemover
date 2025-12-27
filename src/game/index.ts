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
} from "./render/GridRenderer";
import { loadAssets } from "./assets";
import { TurnPhase } from "./types";

let turnManager: TurnManager;
let inputController: InputController;
let isAnimating = false;

export async function initGame(): Promise<void> {
  await loadAssets();

  k.onMousePress(() => {
    console.log("Global mouse press at:", k.mousePos());
  });

  k.onTouchStart(() => {
    console.log("Touch start detected");
  });

  turnManager = new TurnManager(render);
  inputController = new InputController(turnManager);
  inputController.setOnPushRequested(() => {
    if (!isAnimating && turnManager.canPush()) {
      executePushWithAnimation();
    }
  });

  turnManager.startNewTurn();
}

function handlePlotClick(plot: Parameters<typeof turnManager.selectPlot>[0]): void {
  console.log("Plot clicked:", plot);
  if (isAnimating) {
    console.log("Ignored - animating");
    return;
  }
  turnManager.selectPlot(plot);
}

function handleTileClick(): void {
  console.log("Tile clicked");
  if (isAnimating) {
    console.log("Ignored - animating");
    return;
  }
  turnManager.rotateTile();
}

function handleRowColClick(): void {
  console.log("Row/Col clicked");
  if (isAnimating) {
    console.log("Ignored - animating");
    return;
  }
  if (turnManager.canPush()) {
    console.log("Executing push");
    executePushWithAnimation();
  }
}

function handleBackgroundClick(): void {
  console.log("Background clicked");
  if (isAnimating) {
    console.log("Ignored - animating");
    return;
  }
  turnManager.cancelPlacement();
}

async function executePushWithAnimation(): Promise<void> {
  const state = turnManager.getState();
  if (!state.currentTile || !state.selectedPlot) return;

  isAnimating = true;
  clearAllTiles();

  await animatePush(
    state.grid,
    state.selectedPlot,
    state.currentTile,
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

  if (state.turnPhase === TurnPhase.Place && state.currentTile) {
    drawGridWithOverlay(state.grid, null, () => {}, () => {});
    drawPreviewTile(state.currentTile, handleTileClick);
    const plots = turnManager.getPlots();
    drawPlots(plots, null, state.turnPhase, handlePlotClick);
  } else if (state.turnPhase === TurnPhase.Push && state.currentTile && state.selectedPlot) {
    drawGridWithOverlay(
      state.grid,
      state.selectedPlot,
      handleRowColClick,
      handleBackgroundClick
    );
    drawCurrentTile(state.currentTile, state.selectedPlot, handleTileClick);
    const plots = turnManager.getPlots();
    drawPlots(plots, state.selectedPlot, state.turnPhase, handlePlotClick);
  } else {
    drawGridWithOverlay(state.grid, null, () => {}, () => {});
  }
}

export function getGameState() {
  return turnManager.getState();
}
