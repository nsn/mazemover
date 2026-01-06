import { TurnOwner, PlayerPhase, type PlotPosition, type GameState, type MapObject } from "../types";
import { createGrid, getPlotPositions, pushTileIntoGrid } from "../core/Grid";
import { TileDeck } from "../core/TileDeck";
import { rotateTile, rotateTileCounterClockwise } from "../core/Tile";
import { GRID_COLS, GRID_ROWS } from "../config";
import { MapObjectManager } from "./MapObjectManager";
import type { EnemyDatabase } from "./EnemyDatabase";
import type { TurnState, StateContext } from "./states/interfaces";
import { PlayerTurnState, AwaitingActionState } from "./states";

export type TurnManagerCallback = () => void;

/**
 * TurnManager - Manages game turns and delegates to state objects
 *
 * @description
 * Coordinates game flow between player and enemy turns using the State pattern.
 * All turn-specific logic is delegated to TurnState and PlayerPhaseState objects
 * when `useStatePattern` is enabled.
 *
 * **Architecture:**
 * ```
 * TurnManager
 * ├── currentTurnState: TurnState (PlayerTurnState | EnemyTurnState)
 * └── stateContext: StateContext (dependencies passed to states)
 *
 * PlayerTurnState
 * └── currentPhase: PlayerPhaseState
 *     ├── AwaitingActionState (default)
 *     ├── TilePlacementState
 *     ├── MovingState
 *     └── RotatingTileState
 * ```
 *
 * **State Transitions:**
 * ```
 * Player Turn Start → AwaitingActionState
 *   → TilePlacementState → push tile → AwaitingActionState
 *   → RotatingTileState → confirm → AwaitingActionState
 *   → move player → Enemy Turn → Player Turn Start
 * ```
 *
 * **Feature Flag:**
 * Set `useStatePattern = true` to enable state pattern delegation.
 * When false, uses legacy implementation for backward compatibility.
 *
 * **Adding New States:**
 * 1. Create class implementing PlayerPhaseState
 * 2. Implement all interface methods
 * 3. Define valid transitions (return new state or null)
 * 4. Update delegation methods if needed
 *
 * @example
 * ```typescript
 * const manager = new TurnManager(renderCallback, enemyDB);
 * manager.startPlayerTurn();
 * manager.enterTilePlacement();
 * manager.selectPlot(plotPos);
 * manager.executePush();
 * ```
 */
export class TurnManager {
  private state: GameState;
  private onStateChange: TurnManagerCallback;
  private deck: TileDeck;
  private objectManager: MapObjectManager;

  // State pattern fields
  private currentTurnState: TurnState;
  private stateContext: StateContext;

  /**
   * Feature flag to enable state pattern delegation.
   * Set to true to use new state pattern implementation.
   * Set to false to use legacy implementation.
   * @private
   */
  private useStatePattern: boolean = true;

  constructor(onStateChange: TurnManagerCallback, enemyDatabase: EnemyDatabase, extraTiles: number = 1) {
    this.onStateChange = onStateChange;
    const n = Math.max(1, extraTiles);
    const totalTiles = GRID_ROWS * GRID_COLS + n;
    this.deck = new TileDeck(totalTiles);
    this.objectManager = new MapObjectManager(enemyDatabase);
    this.state = {
      grid: createGrid(GRID_ROWS, GRID_COLS, this.deck),
      currentTile: null,
      selectedPlot: null,
      turnOwner: TurnOwner.Player,
      playerPhase: PlayerPhase.AwaitingAction,
      hasPlacedTile: false,
      rotatingTilePosition: null,
      originalTileOrientation: null,
      isInStartLevelSequence: true,  // Start in sequence, will be set to false when complete
      revealedTiles: new Set<string>(),  // Empty initially, tiles revealed during start sequence
    };

    // Initialize state pattern
    this.stateContext = {
      state: this.state,
      objectManager: this.objectManager,
      deck: this.deck,
      onStateChange: this.onStateChange,
    };
    this.currentTurnState = new PlayerTurnState(new AwaitingActionState());
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

  /**
   * Start a new player turn
   *
   * @remarks
   * Resets movement counters, draws a new tile, and transitions to PlayerTurnState
   * with AwaitingActionState phase.
   *
   * **Side Effects:**
   * - Calls objectManager.resetAllTurnMovement()
   * - Draws new tile from deck
   * - Clears selectedPlot
   * - Sets turnOwner to Player
   * - Sets playerPhase to AwaitingAction
   * - Calls onStateChange() to trigger render
   */
  startPlayerTurn(): void {
    if (this.useStatePattern) {
      console.log("[TurnManager] startPlayerTurn (state pattern)");
      this.objectManager.resetAllTurnMovement();

      // Only draw a new tile if we don't have one
      // (First turn or after tile was somehow consumed without replacement)
      if (!this.state.currentTile) {
        this.state.currentTile = this.deck.draw();
        console.log("[TurnManager] Drew initial tile:", this.state.currentTile?.type);
      }

      this.state.selectedPlot = null;
      console.log("[TurnManager] Player turn started - tile:", this.state.currentTile?.type);

      // Transition to player turn state
      const oldState = this.currentTurnState;
      this.currentTurnState = oldState.startPlayerTurn(this.stateContext);
      if (oldState !== this.currentTurnState) {
        oldState.onExit(this.stateContext);
        this.currentTurnState.onEnter(this.stateContext);
      }
    } else {
      // Legacy implementation
      console.log("[TurnManager] startPlayerTurn (legacy)");
      this.objectManager.resetAllTurnMovement();

      // Only draw a new tile if we don't have one
      if (!this.state.currentTile) {
        this.state.currentTile = this.deck.draw();
      }

      this.state.selectedPlot = null;
      this.state.turnOwner = TurnOwner.Player;
      this.state.playerPhase = PlayerPhase.AwaitingAction;
      console.log("[TurnManager] Player turn started - tile:", this.state.currentTile?.type);
      this.onStateChange();
    }
  }

  /**
   * Start enemy turn
   *
   * @remarks
   * Transitions to EnemyTurnState. Enemy AI logic is executed externally.
   *
   * **Side Effects:**
   * - Sets turnOwner to Enemy
   * - Calls onStateChange() to trigger render
   */
  startEnemyTurn(): void {
    if (this.useStatePattern) {
      console.log("[TurnManager] startEnemyTurn (state pattern)");
      const oldState = this.currentTurnState;
      this.currentTurnState = oldState.startEnemyTurn(this.stateContext);
      if (oldState !== this.currentTurnState) {
        oldState.onExit(this.stateContext);
        this.currentTurnState.onEnter(this.stateContext);
      }
    } else {
      // Legacy implementation
      console.log("[TurnManager] startEnemyTurn (legacy)");
      this.state.turnOwner = TurnOwner.Enemy;
      this.onStateChange();
    }
  }

  // === State Queries ===

  isPlayerTurn(): boolean {
    if (this.useStatePattern) {
      return this.currentTurnState.isPlayerTurn();
    }
    return this.state.turnOwner === TurnOwner.Player;
  }

  isEnemyTurn(): boolean {
    if (this.useStatePattern) {
      return this.currentTurnState.isEnemyTurn();
    }
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
    if (this.useStatePattern) {
      console.log("[TurnManager] enterTilePlacement (state pattern) - canPlace:", this.canPlaceTile());
      if (this.currentTurnState instanceof PlayerTurnState) {
        this.currentTurnState.enterTilePlacement(this.stateContext);
      }
    } else {
      // Legacy implementation
      console.log("[TurnManager] enterTilePlacement (legacy) - canPlace:", this.canPlaceTile());
      if (this.canPlaceTile()) {
        this.state.playerPhase = PlayerPhase.TilePlacement;
        this.onStateChange();
      }
    }
  }

  selectPlot(plot: PlotPosition): void {
    if (this.useStatePattern) {
      console.log("[TurnManager] selectPlot (state pattern):", plot, "phase:", this.state.playerPhase);
      if (this.currentTurnState instanceof PlayerTurnState) {
        this.currentTurnState.selectPlot(this.stateContext, plot);
      }
    } else {
      // Legacy implementation
      console.log("[TurnManager] selectPlot (legacy):", plot, "phase:", this.state.playerPhase);
      if (this.isTilePlacement()) {
        if (this.state.selectedPlot && this.isSelectedPlot(plot)) {
          this.executePush();
        } else {
          this.state.selectedPlot = plot;
          this.onStateChange();
        }
      }
    }
  }

  rotateTile(): void {
    if (this.useStatePattern) {
      if (this.currentTurnState instanceof PlayerTurnState) {
        this.currentTurnState.rotateTile(this.stateContext);
      }
    } else {
      // Legacy implementation
      if (this.state.currentTile) {
        this.state.currentTile = {
          ...this.state.currentTile,
          orientation: rotateTile(this.state.currentTile.orientation),
        };
        this.onStateChange();
      }
    }
  }

  rotateTileCounterClockwise(): void {
    // Note: State pattern uses rotateTile() for clockwise rotation only
    // This method remains legacy-only for now
    if (this.state.currentTile) {
      this.state.currentTile = {
        ...this.state.currentTile,
        orientation: rotateTileCounterClockwise(this.state.currentTile.orientation),
      };
      this.onStateChange();
    }
  }

  executePush(): void {
    if (this.useStatePattern) {
      console.log("[TurnManager] executePush (state pattern) - tile:", this.state.currentTile?.type, "plot:", this.state.selectedPlot);
      if (this.currentTurnState instanceof PlayerTurnState) {
        this.currentTurnState.executePush(this.stateContext);
      }
    } else {
      // Legacy implementation
      console.log("[TurnManager] executePush (legacy) - tile:", this.state.currentTile?.type, "plot:", this.state.selectedPlot);
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
    if (this.useStatePattern) {
      console.log("[TurnManager] cancelPlacement (state pattern) - phase:", this.state.playerPhase);
      if (this.currentTurnState instanceof PlayerTurnState) {
        this.currentTurnState.cancelPlacement(this.stateContext);
      }
    } else {
      // Legacy implementation
      console.log("[TurnManager] cancelPlacement (legacy) - phase:", this.state.playerPhase);
      if (this.isTilePlacement()) {
        this.state.selectedPlot = null;
        this.state.playerPhase = PlayerPhase.AwaitingAction;
        this.onStateChange();
      }
    }
  }

  // === Movement ===

  startMoving(): void {
    if (this.useStatePattern) {
      if (this.canMove() && this.currentTurnState instanceof PlayerTurnState) {
        console.log("[TurnManager] startMoving (state pattern)");
        this.currentTurnState.startMoving(this.stateContext);
      }
    } else {
      // Legacy implementation
      if (this.canMove()) {
        console.log("[TurnManager] startMoving (legacy)");
        this.state.playerPhase = PlayerPhase.Moving;
        this.onStateChange();
      }
    }
  }

  completeMove(): void {
    if (this.useStatePattern) {
      console.log("[TurnManager] completeMove (state pattern) - yielding to enemies");
      if (this.currentTurnState instanceof PlayerTurnState) {
        this.currentTurnState.completeMove(this.stateContext);
      }
      // Then transition to enemy turn
      this.startEnemyTurn();
    } else {
      // Legacy implementation
      console.log("[TurnManager] completeMove (legacy) - yielding to enemies");
      this.state.playerPhase = PlayerPhase.AwaitingAction;
      this.startEnemyTurn();
    }
  }

  cancelMoving(): void {
    if (this.useStatePattern) {
      if (this.isMoving() && this.currentTurnState instanceof PlayerTurnState) {
        console.log("[TurnManager] cancelMoving (state pattern)");
        this.currentTurnState.cancelMoving(this.stateContext);
      }
    } else {
      // Legacy implementation
      if (this.isMoving()) {
        console.log("[TurnManager] cancelMoving (legacy)");
        this.state.playerPhase = PlayerPhase.AwaitingAction;
        this.onStateChange();
      }
    }
  }

  // === Tile Rotation ===

  isRotatingTile(): boolean {
    return this.isPlayerTurn() && this.state.playerPhase === PlayerPhase.RotatingTile;
  }

  enterRotationMode(): void {
    if (this.useStatePattern) {
      if (!this.isPlayerTurn() || !(this.currentTurnState instanceof PlayerTurnState)) return;

      const player = this.objectManager.getPlayer();
      if (!player) return;

      console.log("[TurnManager] enterRotationMode (state pattern) at position:", player.gridPosition);
      this.currentTurnState.enterRotationMode(this.stateContext);
    } else {
      // Legacy implementation
      if (!this.isPlayerTurn()) return;

      const player = this.objectManager.getPlayer();
      if (!player) return;

      const { row, col } = player.gridPosition;
      const tile = this.state.grid[row][col];

      console.log("[TurnManager] enterRotationMode (legacy) at position:", { row, col });

      this.state.rotatingTilePosition = { row, col };
      this.state.originalTileOrientation = tile.orientation;
      this.state.playerPhase = PlayerPhase.RotatingTile;
      this.onStateChange();
    }
  }

  rotatePlayerTile(): void {
    if (this.useStatePattern) {
      if (this.currentTurnState instanceof PlayerTurnState) {
        this.currentTurnState.rotatePlayerTile(this.stateContext);
      }
    } else {
      // Legacy implementation
      if (!this.isRotatingTile() || !this.state.rotatingTilePosition) return;

      const { row, col } = this.state.rotatingTilePosition;
      const tile = this.state.grid[row][col];

      console.log("[TurnManager] rotatePlayerTile (legacy) - current orientation:", tile.orientation);

      this.state.grid[row][col] = {
        ...tile,
        orientation: rotateTile(tile.orientation),
      };
      this.onStateChange();
    }
  }

  confirmRotation(): void {
    if (this.useStatePattern) {
      if (this.currentTurnState instanceof PlayerTurnState) {
        console.log("[TurnManager] confirmRotation (state pattern)");
        this.currentTurnState.confirmRotation(this.stateContext);
      }
    } else {
      // Legacy implementation
      if (!this.isRotatingTile()) return;

      console.log("[TurnManager] confirmRotation (legacy) - rotation confirmed");

      this.state.rotatingTilePosition = null;
      this.state.originalTileOrientation = null;
      this.state.playerPhase = PlayerPhase.AwaitingAction;
      this.onStateChange();
    }
  }

  cancelRotation(): void {
    if (this.useStatePattern) {
      if (this.currentTurnState instanceof PlayerTurnState) {
        console.log("[TurnManager] cancelRotation (state pattern)");
        this.currentTurnState.cancelRotation(this.stateContext);
      }
    } else {
      // Legacy implementation
      if (!this.isRotatingTile() || !this.state.rotatingTilePosition || this.state.originalTileOrientation === null) return;

      const { row, col } = this.state.rotatingTilePosition;

      console.log("[TurnManager] cancelRotation (legacy) - restoring original orientation:", this.state.originalTileOrientation);

      // Restore original orientation
      this.state.grid[row][col] = {
        ...this.state.grid[row][col],
        orientation: this.state.originalTileOrientation,
      };

      this.state.rotatingTilePosition = null;
      this.state.originalTileOrientation = null;
      this.state.playerPhase = PlayerPhase.AwaitingAction;
      this.onStateChange();
    }
  }
}
