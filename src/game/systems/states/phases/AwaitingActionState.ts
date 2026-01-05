import type { PlayerPhaseState, StateContext } from "../interfaces";
import type { PlotPosition } from "../../../types";
import { PlayerPhase } from "../../../types";
import { rotateTile } from "../../../core/Tile";
import { TilePlacementState } from "./TilePlacementState";
import { RotatingTileState } from "./RotatingTileState";

/**
 * AwaitingActionState - Default player phase waiting for player input
 *
 * @description
 * The starting state of each player turn. Player can:
 * - Enter tile placement mode (if they have a tile)
 * - Enter rotation mode (click their sprite)
 * - Move directly to a reachable tile
 *
 * **Lifecycle:**
 * - Entered from: Player turn start, after completing other actions (tile placement, rotation, movement)
 * - Exits to: TilePlacementState, RotatingTileState, or (via TurnManager) to MovingState
 *
 * **Responsibilities:**
 * - Display available tiles and plots
 * - Show player stats
 * - Wait for player input
 * - Allow tile rotation in hand
 * - Provide transitions to other phases
 *
 * **State-Specific Data:**
 * - Uses `state.currentTile` (should be non-null from turn start)
 * - No phase-specific data stored
 *
 * **Valid Transitions:**
 * - enterTilePlacement() → TilePlacementState (if currentTile exists)
 * - enterRotationMode() → RotatingTileState (if player exists)
 * - rotateTile() → null (stays in AwaitingAction, rotates tile in hand)
 * - (All other operations return null - not handled by this state)
 *
 * @example
 * ```typescript
 * const awaiting = new AwaitingActionState();
 * awaiting.onEnter(context);
 *
 * // Player presses space to enter tile placement
 * const tilePlacement = awaiting.enterTilePlacement(context);
 * if (tilePlacement) {
 *   playerTurn.transitionToPhase(context, tilePlacement);
 * }
 *
 * // Or player clicks their sprite to enter rotation
 * const rotating = awaiting.enterRotationMode(context);
 * if (rotating) {
 *   playerTurn.transitionToPhase(context, rotating);
 * }
 * ```
 */
export class AwaitingActionState implements PlayerPhaseState {
  readonly phaseName = "AwaitingAction";

  /**
   * Called when entering AwaitingAction phase
   *
   * @param context - State context with dependencies
   *
   * @remarks
   * Sets the player phase flag and triggers render.
   *
   * **Side Effects:**
   * - Sets `context.state.playerPhase = PlayerPhase.AwaitingAction`
   * - Calls `context.onStateChange()` to trigger render
   */
  onEnter(context: StateContext): void {
    console.log("[AwaitingActionState] Entering AwaitingAction phase");
    context.state.playerPhase = PlayerPhase.AwaitingAction;
    context.onStateChange();
  }

  /**
   * Called when exiting AwaitingAction phase
   *
   * @param _context - State context (unused)
   *
   * @remarks
   * No cleanup needed for AwaitingAction.
   * Does NOT call onStateChange (next phase will).
   */
  onExit(_context: StateContext): void {
    console.log("[AwaitingActionState] Exiting AwaitingAction phase");
    // No cleanup needed
  }

  /**
   * Enter tile placement mode
   *
   * @param context - State context with dependencies
   * @returns TilePlacementState if tile available, null otherwise
   *
   * @remarks
   * Only succeeds if `context.state.currentTile` is not null.
   *
   * **Preconditions:**
   * - `context.state.currentTile` must not be null
   *
   * **Side Effects:**
   * - None (TilePlacementState.onEnter handles state changes)
   */
  enterTilePlacement(context: StateContext): PlayerPhaseState | null {
    if (!context.state.currentTile) {
      console.log("[AwaitingActionState] Cannot enter tile placement - no tile available");
      return null;
    }

    console.log("[AwaitingActionState] Entering tile placement mode");
    return new TilePlacementState();
  }

  /**
   * Select a plot (no-op in AwaitingAction)
   *
   * @returns null (not handled by this state)
   *
   * @remarks
   * Plot selection is only handled in TilePlacementState.
   */
  selectPlot(_context: StateContext, _plot: PlotPosition): PlayerPhaseState | null {
    return null;
  }

  /**
   * Rotate the current tile in hand (clockwise 90°)
   *
   * @param context - State context with dependencies
   *
   * @remarks
   * Rotates `context.state.currentTile` orientation.
   * Stays in AwaitingAction after rotation.
   *
   * **Side Effects:**
   * - Updates `context.state.currentTile.orientation`
   * - Calls `context.onStateChange()`
   *
   * **Preconditions:**
   * - `context.state.currentTile` must not be null
   */
  rotateTile(context: StateContext): void {
    if (!context.state.currentTile) {
      return;
    }

    console.log("[AwaitingActionState] Rotating tile in hand");
    context.state.currentTile = {
      ...context.state.currentTile,
      orientation: rotateTile(context.state.currentTile.orientation),
    };
    context.onStateChange();
  }

  /**
   * Execute push (no-op in AwaitingAction)
   *
   * @returns null (not handled by this state)
   *
   * @remarks
   * Push execution is only handled in TilePlacementState.
   */
  executePush(_context: StateContext): PlayerPhaseState | null {
    return null;
  }

  /**
   * Cancel placement (no-op in AwaitingAction)
   *
   * @returns null (not handled by this state)
   *
   * @remarks
   * Nothing to cancel in AwaitingAction.
   */
  cancelPlacement(_context: StateContext): PlayerPhaseState | null {
    return null;
  }

  /**
   * Start moving (no-op in AwaitingAction)
   *
   * @returns null (not handled by this state)
   *
   * @remarks
   * Movement is typically handled directly by TurnManager without
   * entering a separate MovingState. This may be unused in current implementation.
   */
  startMoving(_context: StateContext): PlayerPhaseState | null {
    return null;
  }

  /**
   * Complete move (no-op in AwaitingAction)
   *
   * @returns null (not handled by this state)
   *
   * @remarks
   * Move completion is only handled in MovingState.
   */
  completeMove(_context: StateContext): PlayerPhaseState | null {
    return null;
  }

  /**
   * Cancel moving (no-op in AwaitingAction)
   *
   * @returns null (not handled by this state)
   *
   * @remarks
   * Nothing to cancel in AwaitingAction.
   */
  cancelMoving(_context: StateContext): PlayerPhaseState | null {
    return null;
  }

  /**
   * Enter rotation mode for the tile player is standing on
   *
   * @param context - State context with dependencies
   * @returns RotatingTileState with player's position, null if can't rotate
   *
   * @remarks
   * Allows player to rotate the grid tile they're standing on.
   *
   * **Preconditions:**
   * - Player must exist (objectManager.getPlayer() returns player)
   *
   * **Side Effects:**
   * - None (RotatingTileState.onEnter handles state changes)
   */
  enterRotationMode(context: StateContext): PlayerPhaseState | null {
    const player = context.objectManager.getPlayer();
    if (!player) {
      console.log("[AwaitingActionState] Cannot enter rotation mode - no player");
      return null;
    }

    console.log("[AwaitingActionState] Entering rotation mode at player position");
    return new RotatingTileState(player.gridPosition);
  }

  /**
   * Rotate player tile (no-op in AwaitingAction)
   *
   * @remarks
   * Tile rotation is only handled in RotatingTileState.
   */
  rotatePlayerTile(_context: StateContext): void {
    // Only RotatingTileState handles this
  }

  /**
   * Confirm rotation (no-op in AwaitingAction)
   *
   * @returns null (not handled by this state)
   *
   * @remarks
   * Nothing to confirm in AwaitingAction.
   */
  confirmRotation(_context: StateContext): PlayerPhaseState | null {
    return null;
  }

  /**
   * Cancel rotation (no-op in AwaitingAction)
   *
   * @returns null (not handled by this state)
   *
   * @remarks
   * Nothing to cancel in AwaitingAction.
   */
  cancelRotation(_context: StateContext): PlayerPhaseState | null {
    return null;
  }
}
