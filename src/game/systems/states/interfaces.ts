import type { GameState, PlotPosition } from "../../types";
import type { MapObjectManager } from "../MapObjectManager";
import type { TileDeck } from "../../core/TileDeck";

/**
 * StateContext - Dependency injection container for state classes
 *
 * @description
 * Provides all dependencies needed by state classes without requiring
 * them to depend directly on TurnManager or global state.
 *
 * **Benefits:**
 * - Easy to mock for testing
 * - Clear dependency contract
 * - States remain decoupled from TurnManager
 *
 * **Usage:**
 * Pass to every state method that needs to access game state or services.
 *
 * @property state - Shared game state (grid, currentTile, etc.)
 * @property objectManager - Manages map objects (player, enemies)
 * @property deck - Tile deck for drawing/discarding tiles
 * @property onStateChange - Callback to trigger re-render
 *
 * @example
 * ```typescript
 * const context: StateContext = {
 *   state: gameState,
 *   objectManager: manager,
 *   deck: tileDeck,
 *   onStateChange: renderCallback,
 * };
 * state.onEnter(context);
 * ```
 */
export interface StateContext {
  state: GameState;
  objectManager: MapObjectManager;
  deck: TileDeck;
  onStateChange: () => void;
}

/**
 * TurnState - Interface for top-level turn ownership states
 *
 * @description
 * Represents who owns the current turn (Player or Enemy). This is the top level
 * of the two-level state hierarchy. Implementations:
 * - PlayerTurnState: Manages player turn and delegates to PlayerPhaseState
 * - EnemyTurnState: Simple state for enemy turn
 *
 * **Lifecycle:**
 * - onEnter() called when transitioning to this state
 * - onExit() called when transitioning away from this state
 *
 * **State Transitions:**
 * ```
 * PlayerTurnState ⟷ EnemyTurnState
 * ```
 *
 * **Responsibilities:**
 * - Set turnOwner flag in GameState
 * - Manage turn-specific initialization/cleanup
 * - Provide transition methods to other turn states
 *
 * @example
 * ```typescript
 * class MyTurnState implements TurnState {
 *   readonly name = "MyTurn";
 *
 *   onEnter(context: StateContext): void {
 *     context.state.turnOwner = TurnOwner.Player;
 *     context.onStateChange();
 *   }
 *
 *   onExit(context: StateContext): void {
 *     // Cleanup if needed
 *   }
 *
 *   isPlayerTurn(): boolean { return true; }
 *   isEnemyTurn(): boolean { return false; }
 *
 *   startEnemyTurn(context: StateContext): TurnState {
 *     return new EnemyTurnState();
 *   }
 * }
 * ```
 */
export interface TurnState {
  /**
   * Human-readable name for this state (for debugging)
   */
  readonly name: string;

  /**
   * Called when entering this state
   *
   * @param context - State context with dependencies
   *
   * @remarks
   * Should:
   * - Set `context.state.turnOwner` to appropriate value
   * - Initialize any turn-specific state
   * - Call `context.onStateChange()` to trigger render
   */
  onEnter(context: StateContext): void;

  /**
   * Called when exiting this state
   *
   * @param context - State context with dependencies
   *
   * @remarks
   * Should:
   * - Clean up any turn-specific state
   * - May NOT call onStateChange (next state will do that)
   */
  onExit(context: StateContext): void;

  /**
   * Check if this is a player turn state
   *
   * @returns true if this is PlayerTurnState
   */
  isPlayerTurn(): boolean;

  /**
   * Check if this is an enemy turn state
   *
   * @returns true if this is EnemyTurnState
   */
  isEnemyTurn(): boolean;

  /**
   * Transition to player turn
   *
   * @param context - State context with dependencies
   * @returns New PlayerTurnState instance
   *
   * @remarks
   * Called after enemy turn completes to start new player turn.
   * Should create fresh PlayerTurnState with AwaitingActionState as default phase.
   */
  startPlayerTurn(context: StateContext): TurnState;

  /**
   * Transition to enemy turn
   *
   * @param context - State context with dependencies
   * @returns New EnemyTurnState instance
   *
   * @remarks
   * Called after player completes their move to yield turn to enemies.
   */
  startEnemyTurn(context: StateContext): TurnState;
}

/**
 * PlayerPhaseState - Interface for player turn sub-states
 *
 * @description
 * Represents the specific phase within a player's turn. This is the second level
 * of the two-level state hierarchy. Implementations:
 * - AwaitingActionState: Default state, waiting for player input
 * - TilePlacementState: Placing a tile into the grid
 * - MovingState: Player movement (mostly handled externally)
 * - RotatingTileState: Rotating the tile player is standing on
 *
 * **Lifecycle:**
 * - onEnter() called when transitioning to this phase
 * - onExit() called when transitioning away from this phase
 *
 * **State Transitions:**
 * ```
 * AwaitingAction → TilePlacement → AwaitingAction
 *                → RotatingTile → AwaitingAction
 *                → Moving → AwaitingAction
 * ```
 *
 * **Design Pattern:**
 * Methods return `PlayerPhaseState | null`:
 * - Return new PlayerPhaseState object = transition to that state
 * - Return null = stay in current state
 * - Makes transitions explicit and testable
 *
 * **Default Implementations:**
 * Most methods should return null (no-op) by default. Only the state
 * that handles that action should return a new state or null.
 *
 * @example
 * ```typescript
 * class MyPhaseState implements PlayerPhaseState {
 *   readonly phaseName = "MyPhase";
 *
 *   onEnter(context: StateContext): void {
 *     context.state.playerPhase = PlayerPhase.AwaitingAction;
 *     context.onStateChange();
 *   }
 *
 *   onExit(context: StateContext): void {
 *     // Cleanup phase-specific state
 *   }
 *
 *   enterTilePlacement(context: StateContext): PlayerPhaseState | null {
 *     if (context.state.currentTile) {
 *       return new TilePlacementState();
 *     }
 *     return null; // Can't enter without a tile
 *   }
 *
 *   // Other methods return null (not handled by this state)
 *   startMoving(): PlayerPhaseState | null { return null; }
 *   // ... etc
 * }
 * ```
 */
export interface PlayerPhaseState {
  /**
   * Human-readable name for this phase (for debugging)
   */
  readonly phaseName: string;

  /**
   * Called when entering this phase
   *
   * @param context - State context with dependencies
   *
   * @remarks
   * Should:
   * - Set `context.state.playerPhase` to appropriate value
   * - Initialize any phase-specific state in GameState
   * - Call `context.onStateChange()` to trigger render
   */
  onEnter(context: StateContext): void;

  /**
   * Called when exiting this phase
   *
   * @param context - State context with dependencies
   *
   * @remarks
   * Should:
   * - Clean up any phase-specific state in GameState
   * - May NOT call onStateChange (next phase will do that)
   */
  onExit(context: StateContext): void;

  // === Tile Placement Methods ===

  /**
   * Enter tile placement mode
   *
   * @param context - State context with dependencies
   * @returns TilePlacementState if tile available, null otherwise
   *
   * @remarks
   * Transitions from AwaitingAction to TilePlacement.
   * Only succeeds if `context.state.currentTile` is not null.
   *
   * **Side Effects:**
   * - None (TilePlacementState.onEnter handles state changes)
   *
   * **Default Implementation:**
   * Most states return null (no-op).
   */
  enterTilePlacement(context: StateContext): PlayerPhaseState | null;

  /**
   * Select a plot for tile placement
   *
   * @param context - State context with dependencies
   * @param plot - The plot position that was clicked
   * @returns AwaitingActionState if push executed, null if plot just selected
   *
   * @remarks
   * Behavior depends on whether a plot is already selected:
   * - First click: Store plot in `context.state.selectedPlot`, return null
   * - Second click on same plot: Execute push, return AwaitingActionState
   * - Click on different plot: Update selection, return null
   *
   * **Side Effects:**
   * - Updates `context.state.selectedPlot`
   * - On push: Calls objectManager.handlePush(), updates grid, auto-draws new tile
   * - Calls `context.onStateChange()`
   *
   * **Default Implementation:**
   * Only TilePlacementState handles this, others return null.
   */
  selectPlot(context: StateContext, plot: PlotPosition): PlayerPhaseState | null;

  /**
   * Rotate the current tile in hand (clockwise 90°)
   *
   * @param context - State context with dependencies
   *
   * @remarks
   * Rotates `context.state.currentTile`, not a grid tile.
   * This is different from rotatePlayerTile which rotates grid tiles.
   *
   * **Side Effects:**
   * - Updates `context.state.currentTile.orientation`
   * - Calls `context.onStateChange()`
   *
   * **Default Implementation:**
   * TilePlacementState and AwaitingActionState handle this.
   * Other states do nothing (no-op).
   */
  rotateTile(context: StateContext): void;

  /**
   * Execute the tile push into the grid
   *
   * @param context - State context with dependencies
   * @returns AwaitingActionState after push completes, null if can't push
   *
   * @remarks
   * Pushes `context.state.currentTile` into the grid at `context.state.selectedPlot`.
   * Auto-draws a new tile after successful push.
   *
   * **Side Effects:**
   * - Calls `objectManager.handlePush()` to move objects
   * - Updates grid via `pushTileIntoGrid()`
   * - Discards ejected tile to deck
   * - Auto-draws new tile into `context.state.currentTile`
   * - Clears `context.state.selectedPlot`
   * - Calls `context.onStateChange()`
   *
   * **Preconditions:**
   * - `context.state.currentTile` must not be null
   * - `context.state.selectedPlot` must not be null
   *
   * **Default Implementation:**
   * Only TilePlacementState handles this, others return null.
   */
  executePush(context: StateContext): PlayerPhaseState | null;

  /**
   * Cancel tile placement and return to AwaitingAction
   *
   * @param context - State context with dependencies
   * @returns AwaitingActionState if was in TilePlacement, null otherwise
   *
   * @remarks
   * Clears selected plot and exits tile placement mode.
   *
   * **Side Effects:**
   * - Clears `context.state.selectedPlot`
   * - Calls `context.onStateChange()`
   *
   * **Default Implementation:**
   * Only TilePlacementState handles this, others return null.
   */
  cancelPlacement(context: StateContext): PlayerPhaseState | null;

  // === Movement Methods ===

  /**
   * Enter movement mode
   *
   * @param context - State context with dependencies
   * @returns MovingState if movement allowed, null otherwise
   *
   * @remarks
   * Transitions from AwaitingAction to Moving.
   * Actual movement execution happens externally in animation system.
   *
   * **Side Effects:**
   * - None (MovingState.onEnter handles state changes)
   *
   * **Default Implementation:**
   * Most states return null (no-op).
   */
  startMoving(context: StateContext): PlayerPhaseState | null;

  /**
   * Complete player movement and yield to enemies
   *
   * @param context - State context with dependencies
   * @returns AwaitingActionState (TurnManager will then transition to enemy turn)
   *
   * @remarks
   * Called after movement animation completes.
   * Returns to AwaitingAction, then TurnManager transitions to enemy turn.
   *
   * **Side Effects:**
   * - Calls `context.onStateChange()`
   *
   * **Note:**
   * The enemy turn transition happens in TurnManager, not here.
   *
   * **Default Implementation:**
   * Only MovingState handles this, others return null.
   */
  completeMove(context: StateContext): PlayerPhaseState | null;

  /**
   * Cancel movement and return to AwaitingAction
   *
   * @param context - State context with dependencies
   * @returns AwaitingActionState if was in Moving, null otherwise
   *
   * @remarks
   * Called when player cancels movement before completing it.
   *
   * **Side Effects:**
   * - Calls `context.onStateChange()`
   *
   * **Default Implementation:**
   * Only MovingState handles this, others return null.
   */
  cancelMoving(context: StateContext): PlayerPhaseState | null;

  // === Tile Rotation Methods ===

  /**
   * Enter rotation mode for the tile player is standing on
   *
   * @param context - State context with dependencies
   * @returns RotatingTileState with player's position, null if can't rotate
   *
   * @remarks
   * Allows player to rotate the grid tile they're standing on.
   * Screen darkens all tiles except rotating tile and reachable destinations.
   *
   * **Side Effects:**
   * - None (RotatingTileState.onEnter handles state changes)
   *
   * **Preconditions:**
   * - Player must exist (objectManager.getPlayer() returns player)
   *
   * **Default Implementation:**
   * Only AwaitingActionState handles this, others return null.
   */
  enterRotationMode(context: StateContext): PlayerPhaseState | null;

  /**
   * Rotate the grid tile at rotatingTilePosition (clockwise 90°)
   *
   * @param context - State context with dependencies
   *
   * @remarks
   * Rotates a tile in the grid, not the currentTile in hand.
   * This is different from rotateTile which rotates the tile in hand.
   * Can be called multiple times to rotate 180°, 270°, etc.
   *
   * **Side Effects:**
   * - Updates `context.state.grid[row][col].orientation`
   * - Calls `context.onStateChange()`
   *
   * **Preconditions:**
   * - `context.state.rotatingTilePosition` must not be null
   *
   * **Default Implementation:**
   * Only RotatingTileState handles this, others do nothing (no-op).
   */
  rotatePlayerTile(context: StateContext): void;

  /**
   * Confirm rotation and return to AwaitingAction
   *
   * @param context - State context with dependencies
   * @returns AwaitingActionState if was in RotatingTile, null otherwise
   *
   * @remarks
   * Keeps the rotation that was applied and exits rotation mode.
   *
   * **Side Effects:**
   * - Clears `context.state.rotatingTilePosition`
   * - Clears `context.state.originalTileOrientation`
   * - Calls `context.onStateChange()`
   *
   * **Default Implementation:**
   * Only RotatingTileState handles this, others return null.
   */
  confirmRotation(context: StateContext): PlayerPhaseState | null;

  /**
   * Cancel rotation, restore original orientation, return to AwaitingAction
   *
   * @param context - State context with dependencies
   * @returns AwaitingActionState if was in RotatingTile, null otherwise
   *
   * @remarks
   * Undoes all rotations by restoring the original tile orientation.
   *
   * **Side Effects:**
   * - Restores `context.state.grid[row][col].orientation` from originalTileOrientation
   * - Clears `context.state.rotatingTilePosition`
   * - Clears `context.state.originalTileOrientation`
   * - Calls `context.onStateChange()`
   *
   * **Preconditions:**
   * - `context.state.rotatingTilePosition` must not be null
   * - `context.state.originalTileOrientation` must not be null
   *
   * **Default Implementation:**
   * Only RotatingTileState handles this, others return null.
   */
  cancelRotation(context: StateContext): PlayerPhaseState | null;
}
