import { TurnPhase, type PlotPosition, type GameState, type MapObject } from "../types";
import { createGrid, getPlotPositions, pushTileIntoGrid } from "../core/Grid";
import { TileDeck } from "../core/TileDeck";
import { rotateTile, rotateTileCounterClockwise } from "../core/Tile";
import { GRID_COLS, GRID_ROWS } from "../config";
import { MapObjectManager } from "./MapObjectManager";

export type TurnManagerCallback = () => void;

export class TurnManager {
  private state: GameState;
  private onStateChange: TurnManagerCallback;
  private deck: TileDeck;
  private objectManager: MapObjectManager;

  constructor(onStateChange: TurnManagerCallback, extraTiles: number = 1) {
    this.onStateChange = onStateChange;
    const n = Math.max(1, extraTiles);
    const totalTiles = GRID_ROWS * GRID_COLS + n;
    this.deck = new TileDeck(totalTiles);
    this.objectManager = new MapObjectManager();
    this.state = {
      grid: createGrid(GRID_ROWS, GRID_COLS, this.deck),
      currentTile: null,
      selectedPlot: null,
      turnPhase: TurnPhase.Draw,
    };
  }

  getObjectManager(): MapObjectManager {
    return this.objectManager;
  }

  getMapObjects(): MapObject[] {
    return this.objectManager.getAllObjects();
  }

  getState(): GameState {
    return this.state;
  }

  getPlots(): PlotPosition[] {
    return getPlotPositions(GRID_ROWS, GRID_COLS);
  }

  startNewTurn(): void {
    this.state.currentTile = this.deck.draw();
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
    if (this.state.currentTile) {
      this.state.currentTile = {
        ...this.state.currentTile,
        orientation: rotateTile(this.state.currentTile.orientation),
      };
      this.onStateChange();
    }
  }

  rotateTileCounterClockwise(): void {
    if (this.state.currentTile) {
      this.state.currentTile = {
        ...this.state.currentTile,
        orientation: rotateTileCounterClockwise(this.state.currentTile.orientation),
      };
      this.onStateChange();
    }
  }

  executePush(): void {
    if (!this.state.currentTile || !this.state.selectedPlot) return;

    this.objectManager.handlePush(this.state.selectedPlot);

    const { newGrid, ejectedTile } = pushTileIntoGrid(
      this.state.grid,
      this.state.selectedPlot,
      this.state.currentTile
    );

    this.deck.discard(ejectedTile);
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
