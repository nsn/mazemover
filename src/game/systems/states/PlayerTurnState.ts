import type { TurnState, PlayerPhaseState, StateContext } from "./interfaces";
import type { PlotPosition } from "../../types";
import { TurnOwner } from "../../types";
import { EnemyTurnState } from "./EnemyTurnState";
import { AwaitingActionState } from "./phases/AwaitingActionState";

/**
 * PlayerTurnState - Manages player turn and coordinates between player phases
 *
 * @description
 * This is the top-level state when it's the player's turn. It contains and manages
 * transitions between different PlayerPhaseState objects (AwaitingAction, TilePlacement,
 * Moving, RotatingTile).
 *
 * **Lifecycle:**
 * - Entered from: EnemyTurnState via startPlayerTurn()
 * - Exits to: EnemyTurnState via startEnemyTurn()
 *
 * **Current Phase Management:**
 * - Maintains reference to current PlayerPhaseState
 * - Calls onEnter/onExit lifecycle hooks during transitions
 * - Triggers render after each phase change via context.onStateChange()
 *
 * **Transition Responsibilities:**
 * - Delegates all operations to current phase
 * - Handles phase-to-phase transitions via transitionToPhase()
 * - Special case: Methods that return to AwaitingAction may trigger enemy turn externally
 *
 * **Architecture:**
 * ```
 * PlayerTurnState
 * └── currentPhase: PlayerPhaseState
 *     ├── AwaitingActionState (default)
 *     ├── TilePlacementState
 *     ├── MovingState
 *     └── RotatingTileState
 * ```
 *
 * @example
 * ```typescript
 * // Create player turn with default phase
 * const playerTurn = new PlayerTurnState(new AwaitingActionState());
 * playerTurn.onEnter(context);
 *
 * // Delegate to current phase
 * const newPhase = playerTurn.currentPhase.enterTilePlacement(context);
 * if (newPhase) {
 *   playerTurn.transitionToPhase(context, newPhase);
 * }
 * ```
 *
 * @see PlayerPhaseState for phase-specific behavior
 * @see AwaitingActionState for default phase implementation
 */
export class PlayerTurnState implements TurnState {
  readonly name = "PlayerTurn";

  /**
   * Current player phase state
   * @private
   */
  private _currentPhase: PlayerPhaseState;

  /**
   * Creates a new PlayerTurnState
   *
   * @param initialPhase - The initial player phase (typically AwaitingActionState)
   *
   * @remarks
   * The initial phase's onEnter() will be called when this turn state's onEnter() is called.
   */
  constructor(initialPhase: PlayerPhaseState) {
    this._currentPhase = initialPhase;
  }

  /**
   * Get the current player phase
   *
   * @returns The current PlayerPhaseState
   *
   * @remarks
   * Exposed as read-only property for delegation and testing.
   */
  get currentPhase(): PlayerPhaseState {
    return this._currentPhase;
  }

  /**
   * Called when entering player turn
   *
   * @param context - State context with dependencies
   *
   * @remarks
   * Sets turnOwner to Player and enters the initial phase.
   *
   * **Side Effects:**
   * - Sets `context.state.turnOwner = TurnOwner.Player`
   * - Calls `currentPhase.onEnter(context)`
   * - Calls `context.onStateChange()` to trigger render
   */
  onEnter(context: StateContext): void {
    console.log(`[PlayerTurnState] Entering player turn with phase: ${this._currentPhase.phaseName}`);
    context.state.turnOwner = TurnOwner.Player;
    this._currentPhase.onEnter(context);
    context.onStateChange();
  }

  /**
   * Called when exiting player turn
   *
   * @param context - State context with dependencies
   *
   * @remarks
   * Exits the current phase before transitioning to enemy turn.
   *
   * **Side Effects:**
   * - Calls `currentPhase.onExit(context)`
   * - Does NOT call onStateChange (EnemyTurnState.onEnter will)
   */
  onExit(context: StateContext): void {
    console.log(`[PlayerTurnState] Exiting player turn from phase: ${this._currentPhase.phaseName}`);
    this._currentPhase.onExit(context);
  }

  /**
   * Check if this is a player turn
   *
   * @returns Always true for PlayerTurnState
   */
  isPlayerTurn(): boolean {
    return true;
  }

  /**
   * Check if this is an enemy turn
   *
   * @returns Always false for PlayerTurnState
   */
  isEnemyTurn(): boolean {
    return false;
  }

  /**
   * Transition to player turn (creates fresh turn)
   *
   * @param _context - State context (unused for transition)
   * @returns New PlayerTurnState instance with AwaitingActionState
   *
   * @remarks
   * Called when starting a new player turn. Always creates a fresh
   * PlayerTurnState to ensure proper lifecycle (onExit/onEnter) is triggered.
   *
   * **Note:**
   * Even if already in PlayerTurnState, this returns a NEW instance to
   * ensure onExit/onEnter are called and state is reset properly.
   */
  startPlayerTurn(_context: StateContext): TurnState {
    console.log("[PlayerTurnState] Starting new player turn");
    return new PlayerTurnState(new AwaitingActionState());
  }

  /**
   * Transition to enemy turn
   *
   * @param _context - State context (unused for transition)
   * @returns New EnemyTurnState instance
   *
   * @remarks
   * Called after player completes their move to yield turn to enemies.
   * This is typically triggered by TurnManager after completeMove() returns to AwaitingAction.
   */
  startEnemyTurn(_context: StateContext): TurnState {
    console.log("[PlayerTurnState] Transitioning to enemy turn");
    return new EnemyTurnState();
  }

  /**
   * Transition to a new player phase
   *
   * @param context - State context with dependencies
   * @param newPhase - The new PlayerPhaseState to transition to
   *
   * @remarks
   * Handles the phase transition lifecycle:
   * 1. Call current phase's onExit()
   * 2. Switch to new phase
   * 3. Call new phase's onEnter()
   *
   * **Side Effects:**
   * - Calls `currentPhase.onExit(context)`
   * - Updates `_currentPhase` to `newPhase`
   * - Calls `newPhase.onEnter(context)` (which calls onStateChange)
   *
   * @example
   * ```typescript
   * const newPhase = currentPhase.enterTilePlacement(context);
   * if (newPhase) {
   *   playerTurnState.transitionToPhase(context, newPhase);
   * }
   * ```
   */
  transitionToPhase(context: StateContext, newPhase: PlayerPhaseState): void {
    console.log(`[PlayerTurnState] Transitioning from ${this._currentPhase.phaseName} to ${newPhase.phaseName}`);

    // Exit current phase
    this._currentPhase.onExit(context);

    // Switch to new phase
    this._currentPhase = newPhase;

    // Enter new phase (will call onStateChange)
    this._currentPhase.onEnter(context);
  }

  // === Delegation Methods ===
  // These methods delegate to the current phase and handle transitions

  /**
   * Delegate: Enter tile placement mode
   *
   * @param context - State context with dependencies
   *
   * @remarks
   * Delegates to current phase and transitions if phase returns new state.
   */
  enterTilePlacement(context: StateContext): void {
    const newPhase = this._currentPhase.enterTilePlacement(context);
    if (newPhase) {
      this.transitionToPhase(context, newPhase);
    }
  }

  /**
   * Delegate: Select a plot for tile placement
   *
   * @param context - State context with dependencies
   * @param plot - The plot position that was clicked
   *
   * @remarks
   * Delegates to current phase and transitions if phase returns new state.
   */
  selectPlot(context: StateContext, plot: PlotPosition): void {
    const newPhase = this._currentPhase.selectPlot(context, plot);
    if (newPhase) {
      this.transitionToPhase(context, newPhase);
    }
  }

  /**
   * Delegate: Rotate the current tile in hand
   *
   * @param context - State context with dependencies
   *
   * @remarks
   * Delegates to current phase (no phase transition for rotation).
   */
  rotateTile(context: StateContext): void {
    this._currentPhase.rotateTile(context);
  }

  /**
   * Delegate: Execute the tile push into the grid
   *
   * @param context - State context with dependencies
   *
   * @remarks
   * Delegates to current phase and transitions if phase returns new state.
   */
  executePush(context: StateContext): void {
    const newPhase = this._currentPhase.executePush(context);
    if (newPhase) {
      this.transitionToPhase(context, newPhase);
    }
  }

  /**
   * Delegate: Cancel tile placement
   *
   * @param context - State context with dependencies
   *
   * @remarks
   * Delegates to current phase and transitions if phase returns new state.
   */
  cancelPlacement(context: StateContext): void {
    const newPhase = this._currentPhase.cancelPlacement(context);
    if (newPhase) {
      this.transitionToPhase(context, newPhase);
    }
  }

  /**
   * Delegate: Enter movement mode
   *
   * @param context - State context with dependencies
   *
   * @remarks
   * Delegates to current phase and transitions if phase returns new state.
   */
  startMoving(context: StateContext): void {
    const newPhase = this._currentPhase.startMoving(context);
    if (newPhase) {
      this.transitionToPhase(context, newPhase);
    }
  }

  /**
   * Delegate: Complete player movement
   *
   * @param context - State context with dependencies
   *
   * @remarks
   * Delegates to current phase and transitions if phase returns new state.
   * Note: TurnManager will then call startEnemyTurn() after this completes.
   */
  completeMove(context: StateContext): void {
    const newPhase = this._currentPhase.completeMove(context);
    if (newPhase) {
      this.transitionToPhase(context, newPhase);
    }
  }

  /**
   * Delegate: Cancel movement
   *
   * @param context - State context with dependencies
   *
   * @remarks
   * Delegates to current phase and transitions if phase returns new state.
   */
  cancelMoving(context: StateContext): void {
    const newPhase = this._currentPhase.cancelMoving(context);
    if (newPhase) {
      this.transitionToPhase(context, newPhase);
    }
  }

  /**
   * Delegate: Enter rotation mode
   *
   * @param context - State context with dependencies
   *
   * @remarks
   * Delegates to current phase and transitions if phase returns new state.
   */
  enterRotationMode(context: StateContext): void {
    const newPhase = this._currentPhase.enterRotationMode(context);
    if (newPhase) {
      this.transitionToPhase(context, newPhase);
    }
  }

  /**
   * Delegate: Rotate the grid tile at player's position
   *
   * @param context - State context with dependencies
   *
   * @remarks
   * Delegates to current phase (no phase transition for rotation).
   */
  rotatePlayerTile(context: StateContext): void {
    this._currentPhase.rotatePlayerTile(context);
  }

  /**
   * Delegate: Confirm rotation
   *
   * @param context - State context with dependencies
   *
   * @remarks
   * Delegates to current phase and transitions if phase returns new state.
   */
  confirmRotation(context: StateContext): void {
    const newPhase = this._currentPhase.confirmRotation(context);
    if (newPhase) {
      this.transitionToPhase(context, newPhase);
    }
  }

  /**
   * Delegate: Cancel rotation
   *
   * @param context - State context with dependencies
   *
   * @remarks
   * Delegates to current phase and transitions if phase returns new state.
   */
  cancelRotation(context: StateContext): void {
    const newPhase = this._currentPhase.cancelRotation(context);
    if (newPhase) {
      this.transitionToPhase(context, newPhase);
    }
  }
}
