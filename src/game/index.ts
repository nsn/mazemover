import { TurnPhase, type PlotPosition, type GameState } from "./types";
import { createGrid, getPlotPositions, pushTileIntoGrid } from "./core/Grid";
import { drawRandomTile } from "./core/TileDeck";
import { rotateTile } from "./core/Tile";
import { drawGrid, drawPlots, clearAllTiles, drawCurrentTile } from "./render/GridRenderer";
import { GRID_COLS, GRID_ROWS } from "./config";

let gameState: GameState;

export function initGame(): void {
  gameState = {
    grid: createGrid(GRID_ROWS, GRID_COLS),
    currentTile: null,
    selectedPlot: null,
    turnPhase: TurnPhase.Draw,
  };

  startNewTurn();
  render();
}

function startNewTurn(): void {
  gameState.currentTile = drawRandomTile();
  gameState.selectedPlot = null;
  gameState.turnPhase = TurnPhase.Place;
}

function handlePlotClick(plot: PlotPosition): void {
  if (gameState.turnPhase === TurnPhase.Place) {
    gameState.selectedPlot = plot;
    gameState.turnPhase = TurnPhase.Push;
    render();
  } else if (gameState.turnPhase === TurnPhase.Push) {
    if (gameState.selectedPlot &&
        gameState.selectedPlot.row === plot.row &&
        gameState.selectedPlot.col === plot.col) {
      executePush();
    } else {
      gameState.selectedPlot = plot;
      render();
    }
  }
}

function handleTileRotate(): void {
  if (gameState.currentTile && gameState.turnPhase === TurnPhase.Push) {
    gameState.currentTile = {
      ...gameState.currentTile,
      orientation: rotateTile(gameState.currentTile.orientation),
    };
    render();
  }
}

function executePush(): void {
  if (!gameState.currentTile || !gameState.selectedPlot) return;

  const { newGrid } = pushTileIntoGrid(
    gameState.grid,
    gameState.selectedPlot,
    gameState.currentTile
  );

  gameState.grid = newGrid;
  startNewTurn();
  render();
}

function render(): void {
  clearAllTiles();

  drawGrid(gameState.grid);

  const plots = getPlotPositions(GRID_ROWS, GRID_COLS);
  drawPlots(plots, gameState.selectedPlot, handlePlotClick);

  if (gameState.currentTile && gameState.selectedPlot) {
    drawCurrentTile(
      gameState.currentTile,
      gameState.selectedPlot,
      handleTileRotate
    );
  }
}

export function getGameState(): GameState {
  return gameState;
}
