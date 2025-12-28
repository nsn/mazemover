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
    console.log("[TurnManager] startNewTurn");
    this.objectManager.resetAllTurnMovement();
    this.state.currentTile = this.deck.draw();
    this.state.selectedPlot = null;
    this.state.turnPhase = TurnPhase.PlayerTurn;
    this.state.hasPlacedTile = false;
    this.state.hasMovedPlayer = false;
    console.log("[TurnManager] New turn started - tile:", this.state.currentTile?.type);
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
    console.log("[TurnManager] enterTilePlacement - canPlace:", this.canPlaceTile());
    if (this.canPlaceTile()) {
      this.state.turnPhase = TurnPhase.TilePlacement;
      this.onStateChange();
    }
  }

  selectPlot(plot: PlotPosition): void {
    console.log("[TurnManager] selectPlot:", plot, "phase:", this.state.turnPhase);
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
    console.log("[TurnManager] executePush - tile:", this.state.currentTile?.type, "plot:", this.state.selectedPlot);
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
    console.log("[TurnManager] Push complete - hasPlacedTile:", this.state.hasPlacedTile, "phase:", this.state.turnPhase);
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
    console.log("[TurnManager] cancelPlacement - phase:", this.state.turnPhase);
    if (this.state.turnPhase === TurnPhase.TilePlacement) {
      this.state.selectedPlot = null;
      this.state.turnPhase = TurnPhase.PlayerTurn;
      this.onStateChange();
    }
  }

  markPlayerMoved(): void {
    console.log("[TurnManager] markPlayerMoved");
    this.state.hasMovedPlayer = true;
  }

  hasPlayerMoved(): boolean {
    return this.state.hasMovedPlayer;
  }

  startEnemyTurn(): void {
    console.log("[TurnManager] startEnemyTurn");
    this.state.turnPhase = TurnPhase.EnemyTurn;
    this.onStateChange();
  }
}
