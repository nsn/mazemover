import { TurnOwner, PlayerPhase, type PlotPosition, type GameState, type MapObject } from "../types";
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
      turnOwner: TurnOwner.Player,
      playerPhase: PlayerPhase.AwaitingAction,
      hasPlacedTile: false,
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

  // === Turn Control ===

  startPlayerTurn(): void {
    console.log("[TurnManager] startPlayerTurn");
    this.objectManager.resetAllTurnMovement();
    this.state.currentTile = this.deck.draw();
    this.state.selectedPlot = null;
    this.state.turnOwner = TurnOwner.Player;
    this.state.playerPhase = PlayerPhase.AwaitingAction;
    console.log("[TurnManager] Player turn started - tile:", this.state.currentTile?.type);
    this.onStateChange();
  }

  startEnemyTurn(): void {
    console.log("[TurnManager] startEnemyTurn");
    this.state.turnOwner = TurnOwner.Enemy;
    this.onStateChange();
  }

  // === State Queries ===

  isPlayerTurn(): boolean {
    return this.state.turnOwner === TurnOwner.Player;
  }

  isEnemyTurn(): boolean {
    return this.state.turnOwner === TurnOwner.Enemy;
  }

  isAwaitingAction(): boolean {
    return this.isPlayerTurn() && this.state.playerPhase === PlayerPhase.AwaitingAction;
  }

  isTilePlacement(): boolean {
    return this.isPlayerTurn() && this.state.playerPhase === PlayerPhase.TilePlacement;
  }

  isMoving(): boolean {
    return this.isPlayerTurn() && this.state.playerPhase === PlayerPhase.Moving;
  }

  canPlaceTile(): boolean {
    return this.isPlayerTurn() && this.state.currentTile !== null;
  }

  canMove(): boolean {
    return this.isPlayerTurn() && this.state.playerPhase !== PlayerPhase.Moving;
  }

  // === Tile Placement ===

  enterTilePlacement(): void {
    console.log("[TurnManager] enterTilePlacement - canPlace:", this.canPlaceTile());
    if (this.canPlaceTile()) {
      this.state.playerPhase = PlayerPhase.TilePlacement;
      this.onStateChange();
    }
  }

  selectPlot(plot: PlotPosition): void {
    console.log("[TurnManager] selectPlot:", plot, "phase:", this.state.playerPhase);
    if (this.isTilePlacement()) {
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
    this.state.selectedPlot = null;
    this.state.playerPhase = PlayerPhase.AwaitingAction;

    // Auto-draw new tile for continuous placement
    this.state.currentTile = this.deck.draw();
    console.log("[TurnManager] Push complete - auto-drew new tile:", this.state.currentTile?.type);
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
      this.isTilePlacement() &&
      this.state.selectedPlot !== null &&
      this.state.currentTile !== null
    );
  }

  cancelPlacement(): void {
    console.log("[TurnManager] cancelPlacement - phase:", this.state.playerPhase);
    if (this.isTilePlacement()) {
      this.state.selectedPlot = null;
      this.state.playerPhase = PlayerPhase.AwaitingAction;
      this.onStateChange();
    }
  }

  // === Movement ===

  startMoving(): void {
    if (this.canMove()) {
      console.log("[TurnManager] startMoving");
      this.state.playerPhase = PlayerPhase.Moving;
      this.onStateChange();
    }
  }

  completeMove(): void {
    console.log("[TurnManager] completeMove - yielding to enemies");
    this.state.playerPhase = PlayerPhase.AwaitingAction;
    this.startEnemyTurn();
  }

  cancelMoving(): void {
    if (this.isMoving()) {
      console.log("[TurnManager] cancelMoving");
      this.state.playerPhase = PlayerPhase.AwaitingAction;
      this.onStateChange();
    }
  }
}
