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
      turnPhase: TurnPhase.PlayerTurn,
      hasPlacedTile: false,
      hasMovedPlayer: false,
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
    this.objectManager.resetAllTurnMovement();
    this.state.currentTile = this.deck.draw();
    this.state.selectedPlot = null;
    this.state.turnPhase = TurnPhase.PlayerTurn;
    this.state.hasPlacedTile = false;
    this.state.hasMovedPlayer = false;
    this.onStateChange();
  }

  isPlayerTurn(): boolean {
    return this.state.turnPhase === TurnPhase.PlayerTurn;
  }

  isTilePlacement(): boolean {
    return this.state.turnPhase === TurnPhase.TilePlacement;
  }

  canPlaceTile(): boolean {
    return !this.state.hasPlacedTile && this.state.currentTile !== null;
  }

  enterTilePlacement(): void {
    if (this.canPlaceTile()) {
      this.state.turnPhase = TurnPhase.TilePlacement;
      this.onStateChange();
    }
  }

  selectPlot(plot: PlotPosition): void {
    if (this.state.turnPhase === TurnPhase.TilePlacement) {
      if (this.state.selectedPlot && this.isSelectedPlot(plot)) {
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
    this.state.currentTile = null;
    this.state.selectedPlot = null;
    this.state.hasPlacedTile = true;
    this.state.turnPhase = TurnPhase.PlayerTurn;
    this.onStateChange();
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
      this.state.turnPhase === TurnPhase.TilePlacement &&
      this.state.selectedPlot !== null &&
      this.state.currentTile !== null
    );
  }

  cancelPlacement(): void {
    if (this.state.turnPhase === TurnPhase.TilePlacement) {
      this.state.selectedPlot = null;
      this.state.turnPhase = TurnPhase.PlayerTurn;
      this.onStateChange();
    }
  }

  markPlayerMoved(): void {
    this.state.hasMovedPlayer = true;
  }

  hasPlayerMoved(): boolean {
    return this.state.hasMovedPlayer;
  }

  startEnemyTurn(): void {
    this.state.turnPhase = TurnPhase.EnemyTurn;
    this.onStateChange();
  }
}
