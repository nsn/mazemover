import { TurnPhase, type PlotPosition, type GameState } from "../types";
import { createGrid, getPlotPositions, pushTileIntoGrid } from "../core/Grid";
import { drawRandomTile } from "../core/TileDeck";
import { rotateTile } from "../core/Tile";
import { GRID_COLS, GRID_ROWS } from "../config";

export type TurnManagerCallback = () => void;

export class TurnManager {
  private state: GameState;
  private onStateChange: TurnManagerCallback;

  constructor(onStateChange: TurnManagerCallback) {
    this.onStateChange = onStateChange;
    this.state = {
      grid: createGrid(GRID_ROWS, GRID_COLS),
      currentTile: null,
      selectedPlot: null,
      turnPhase: TurnPhase.Draw,
    };
  }

  getState(): GameState {
    return this.state;
  }

  getPlots(): PlotPosition[] {
    return getPlotPositions(GRID_ROWS, GRID_COLS);
  }

  startNewTurn(): void {
    this.state.currentTile = drawRandomTile();
    this.state.selectedPlot = null;
    this.state.turnPhase = TurnPhase.Place;
    this.onStateChange();
  }

  selectPlot(plot: PlotPosition): void {
    if (this.state.turnPhase === TurnPhase.Place) {
      this.state.selectedPlot = plot;
      this.state.turnPhase = TurnPhase.Push;
      this.onStateChange();
    } else if (this.state.turnPhase === TurnPhase.Push) {
      if (this.isSelectedPlot(plot)) {
        this.executePush();
      } else {
        this.state.selectedPlot = plot;
        this.onStateChange();
      }
    }
  }

  rotateTile(): void {
    if (this.state.currentTile && this.state.turnPhase === TurnPhase.Push) {
      this.state.currentTile = {
        ...this.state.currentTile,
        orientation: rotateTile(this.state.currentTile.orientation),
      };
      this.onStateChange();
    }
  }

  executePush(): void {
    if (!this.state.currentTile || !this.state.selectedPlot) return;

    const { newGrid } = pushTileIntoGrid(
      this.state.grid,
      this.state.selectedPlot,
      this.state.currentTile
    );

    this.state.grid = newGrid;
    this.startNewTurn();
  }

  isSelectedPlot(plot: PlotPosition): boolean {
    return (
      this.state.selectedPlot !== null &&
      this.state.selectedPlot.row === plot.row &&
      this.state.selectedPlot.col === plot.col
    );
  }

  canPush(): boolean {
    return (
      this.state.turnPhase === TurnPhase.Push &&
      this.state.selectedPlot !== null &&
      this.state.currentTile !== null
    );
  }

  isPlacePhase(): boolean {
    return this.state.turnPhase === TurnPhase.Place;
  }

  isPushPhase(): boolean {
    return this.state.turnPhase === TurnPhase.Push;
  }

  cancelPlacement(): void {
    if (this.state.turnPhase === TurnPhase.Push) {
      this.state.selectedPlot = null;
      this.state.turnPhase = TurnPhase.Place;
      this.onStateChange();
    }
  }
}
