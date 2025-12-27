import { TurnManager } from "./systems/TurnManager";
import { InputController } from "./systems/InputController";
import { drawGrid, drawPlots, clearAllTiles, drawCurrentTile, animatePush } from "./render/GridRenderer";
import { loadAssets } from "./assets";

let turnManager: TurnManager;
let inputController: InputController;
let isAnimating = false;

export async function initGame(): Promise<void> {
  await loadAssets();

  turnManager = new TurnManager(render);
  inputController = new InputController(turnManager);
  inputController.setOnPushRequested(() => {
    if (!isAnimating) {
      executePushWithAnimation();
    }
  });

  turnManager.startNewTurn();
}

function handlePlotClick(plot: Parameters<typeof turnManager.selectPlot>[0]): void {
  if (isAnimating) return;

  if (turnManager.isPushPhase() && turnManager.isSelectedPlot(plot)) {
    executePushWithAnimation();
  } else {
    turnManager.selectPlot(plot);
  }
}

function handleTileClick(): void {
  if (isAnimating) return;
  turnManager.rotateTile();
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

  drawGrid(state.grid);

  const plots = turnManager.getPlots();
  drawPlots(plots, state.selectedPlot, state.turnPhase, handlePlotClick);

  if (state.currentTile && state.selectedPlot) {
    drawCurrentTile(
      state.currentTile,
      state.selectedPlot,
      handleTileClick
    );
  }
}

export function getGameState() {
  return turnManager.getState();
}
