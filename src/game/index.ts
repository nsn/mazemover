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
import { TurnPhase, type PlotPosition } from "./types";

let turnManager: TurnManager;
let inputController: InputController;
let isAnimating = false;

function handleClick(): void {
  if (isAnimating) {
    console.log("Click ignored - animating");
    return;
  }

  const pos = k.mousePos();
  console.log("Click at:", pos);

  // Check current tile FIRST (it's drawn on top of the plot)
  const currentTiles = k.get("currentTile");
  for (const tile of currentTiles) {
    if ((tile as any).hasPoint && (tile as any).hasPoint(pos)) {
      console.log("Current tile hit - rotating");
      turnManager.rotateTile();
      return;
    }
  }

  // Check preview tile
  const previewTiles = k.get("previewTile");
  for (const tile of previewTiles) {
    if ((tile as any).hasPoint && (tile as any).hasPoint(pos)) {
      console.log("Preview tile hit - rotating");
      turnManager.rotateTile();
      return;
    }
  }

  // Check highlight areas (for push action)
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

  // Check plots
  const plots = k.get("plot");
  for (const plot of plots) {
    if ((plot as any).hasPoint && (plot as any).hasPoint(pos)) {
      const plotData = (plot as any).plotData as PlotPosition;
      console.log("Plot hit:", plotData);
      turnManager.selectPlot(plotData);
      return;
    }
  }

  // Background click during Push phase cancels placement
  if (turnManager.isPushPhase()) {
    console.log("Background hit - canceling");
    turnManager.cancelPlacement();
  }
}

function handleRightClick(): void {
  if (isAnimating) return;

  const pos = k.mousePos();

  // Check current tile
  const currentTiles = k.get("currentTile");
  for (const tile of currentTiles) {
    if ((tile as any).hasPoint && (tile as any).hasPoint(pos)) {
      console.log("Current tile right-click - rotating CCW");
      turnManager.rotateTileCounterClockwise();
      return;
    }
  }

  // Check preview tile
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

  k.onMousePress(handleClick);
  k.onMousePress("right", handleRightClick);

  turnManager = new TurnManager(render);
  inputController = new InputController(turnManager);
  inputController.setOnPushRequested(() => {
    if (!isAnimating && turnManager.canPush()) {
      executePushWithAnimation();
    }
  });

  turnManager.startNewTurn();
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
    drawGridWithOverlay(state.grid, null);
    drawPreviewTile(state.currentTile);
    const plots = turnManager.getPlots();
    drawPlots(plots, null, state.turnPhase);
  } else if (state.turnPhase === TurnPhase.Push && state.currentTile && state.selectedPlot) {
    drawGridWithOverlay(state.grid, state.selectedPlot);
    const plots = turnManager.getPlots();
    drawPlots(plots, state.selectedPlot, state.turnPhase);
    drawCurrentTile(state.currentTile, state.selectedPlot);
  } else {
    drawGridWithOverlay(state.grid, null);
  }
}

export function getGameState() {
  return turnManager.getState();
}
