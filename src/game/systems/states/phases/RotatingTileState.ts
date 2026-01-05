import type { PlayerPhaseState, StateContext } from "../interfaces";
import type { PlotPosition, GridPosition } from "../../../types";
import { PlayerPhase } from "../../../types";
import { rotateTile } from "../../../core/Tile";
import { AwaitingActionState } from "./AwaitingActionState";

/**
 * RotatingTileState - Handles rotation of tile at player's position
 *
 * @description
 * Active when player clicks their sprite to rotate the tile they're standing on.
 * The screen darkens all tiles except the rotating tile and reachable destinations.
 *
 * **Lifecycle:**
 * - Entered from: AwaitingActionState via enterRotationMode()
 * - Exits to: AwaitingActionState (after confirm or cancel)
 *
 * **Constructor:**
 * Accepts GridPosition to store which tile is being rotated.
 *
 * **Responsibilities:**
 * - Store original orientation for cancellation
 * - Rotate grid tile (not tile in hand!) clockwise 90°
 * - Allow confirmation (keep rotation) or cancellation (restore original)
 * - Show visual overlay darkening non-active tiles
 *
 * **State-Specific Data:**
 * - Stores `state.rotatingTilePosition` (from constructor GridPosition)
 * - Stores `state.originalTileOrientation` for undo
 * - Both cleared on exit (confirm or cancel)
 *
 * **Interaction Flow:**
 * 1. Enter state → store position and original orientation
 * 2. Player clicks rotating tile or presses R → rotate 90° CW
 * 3. Player can repeat rotation multiple times
 * 4. Player clicks reachable tile or presses Space → confirm and move (via TurnManager)
 * 5. Player presses Escape or right-clicks → cancel, restore original
 *
 * **Valid Transitions:**
 * - rotatePlayerTile() → null (stays in state, tile rotated)
 * - confirmRotation() → AwaitingActionState (keeps rotation)
 * - cancelRotation() → AwaitingActionState (restores original orientation)
 *
 * @example
 * ```typescript
 * const playerPos = { row: 3, col: 4 };
 * const rotating = new RotatingTileState(playerPos);
 * rotating.onEnter(context);
 *
 * // Rotate tile 90° clockwise
 * rotating.rotatePlayerTile(context);
 *
 * // Confirm rotation
 * const awaiting = rotating.confirmRotation(context);
 * if (awaiting) {
 *   playerTurn.transitionToPhase(context, awaiting);
 * }
 *
 * // Or cancel to restore original
 * const awaiting2 = rotating.cancelRotation(context);
 * ```
 */
export class RotatingTileState implements PlayerPhaseState {
  readonly phaseName = "RotatingTile";

  /**
   * The grid position of the tile being rotated
   * @private
   */
  private readonly position: GridPosition;

  /**
   * Creates a new RotatingTileState
   *
   * @param position - The grid position of the tile to rotate (typically player's position)
   *
   * @remarks
   * The position is stored to identify which tile is being rotated.
   * Original orientation is stored in onEnter() for undo capability.
   */
  constructor(position: GridPosition) {
    this.position = position;
  }

  /**
   * Called when entering RotatingTile phase
   *
   * @param context - State context with dependencies
   *
   * @remarks
   * Sets the player phase flag, stores rotation state, and triggers render.
   *
   * **Side Effects:**
   * - Sets `context.state.playerPhase = PlayerPhase.RotatingTile`
   * - Stores `context.state.rotatingTilePosition = this.position`
   * - Stores `context.state.originalTileOrientation = grid[row][col].orientation`
   * - Calls `context.onStateChange()` to trigger render with darkened overlay
   */
  onEnter(context: StateContext): void {
    console.log("[RotatingTileState] Entering RotatingTile phase at position:", this.position);

    const { row, col } = this.position;
    const tile = context.state.grid[row][col];

    context.state.playerPhase = PlayerPhase.RotatingTile;
    context.state.rotatingTilePosition = { row, col };
    context.state.originalTileOrientation = tile.orientation;

    context.onStateChange();
  }

  /**
   * Called when exiting RotatingTile phase
   *
   * @param context - State context with dependencies
   *
   * @remarks
   * Clears rotation state when leaving this phase.
   * Does NOT call onStateChange (next phase will).
   *
   * **Side Effects:**
   * - Clears `context.state.rotatingTilePosition = null`
   * - Clears `context.state.originalTileOrientation = null`
   */
  onExit(context: StateContext): void {
    console.log("[RotatingTileState] Exiting RotatingTile phase");
    context.state.rotatingTilePosition = null;
    context.state.originalTileOrientation = null;
  }

  /**
   * Enter tile placement (no-op in RotatingTile)
   *
   * @returns null (not handled by this state)
   *
   * @remarks
   * Cannot enter tile placement while rotating.
   * Must confirm or cancel rotation first.
   */
  enterTilePlacement(_context: StateContext): PlayerPhaseState | null {
    return null;
  }

  /**
   * Select plot (no-op in RotatingTile)
   *
   * @returns null (not handled by this state)
   */
  selectPlot(_context: StateContext, _plot: PlotPosition): PlayerPhaseState | null {
    return null;
  }

  /**
   * Rotate tile in hand (no-op in RotatingTile)
   *
   * @remarks
   * In rotation mode, we rotate grid tiles not the tile in hand.
   * Use rotatePlayerTile() instead.
   */
  rotateTile(_context: StateContext): void {
    // In rotation mode, rotate grid tile not tile in hand
  }

  /**
   * Execute push (no-op in RotatingTile)
   *
   * @returns null (not handled by this state)
   */
  executePush(_context: StateContext): PlayerPhaseState | null {
    return null;
  }

  /**
   * Cancel placement (no-op in RotatingTile)
   *
   * @returns null (not handled by this state)
   */
  cancelPlacement(_context: StateContext): PlayerPhaseState | null {
    return null;
  }

  /**
   * Start moving (no-op in RotatingTile)
   *
   * @returns null (not handled by this state)
   *
   * @remarks
   * Cannot start moving while in rotation mode.
   * Must confirm or cancel rotation first.
   */
  startMoving(_context: StateContext): PlayerPhaseState | null {
    return null;
  }

  /**
   * Complete move (no-op in RotatingTile)
   *
   * @returns null (not handled by this state)
   */
  completeMove(_context: StateContext): PlayerPhaseState | null {
    return null;
  }

  /**
   * Cancel moving (no-op in RotatingTile)
   *
   * @returns null (not handled by this state)
   */
  cancelMoving(_context: StateContext): PlayerPhaseState | null {
    return null;
  }

  /**
   * Enter rotation mode (no-op, already in RotatingTile)
   *
   * @returns null (already in this state)
   */
  enterRotationMode(_context: StateContext): PlayerPhaseState | null {
    return null;
  }

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
   * - `context.state.rotatingTilePosition` must not be null (guaranteed by onEnter)
   */
  rotatePlayerTile(context: StateContext): void {
    if (!context.state.rotatingTilePosition) {
      console.warn("[RotatingTileState] Cannot rotate - no rotatingTilePosition");
      return;
    }

    const { row, col } = context.state.rotatingTilePosition;
    const tile = context.state.grid[row][col];

    console.log("[RotatingTileState] Rotating grid tile at", { row, col }, "from", tile.orientation);

    context.state.grid[row][col] = {
      ...tile,
      orientation: rotateTile(tile.orientation),
    };

    context.onStateChange();
  }

  /**
   * Confirm rotation and return to AwaitingAction
   *
   * @param context - State context with dependencies
   * @returns AwaitingActionState
   *
   * @remarks
   * Keeps the rotation that was applied and exits rotation mode.
   *
   * **Side Effects:**
   * - Calls `context.onStateChange()` (via onExit and AwaitingAction.onEnter)
   *
   * **Note:**
   * onExit() clears rotatingTilePosition and originalTileOrientation.
   */
  confirmRotation(context: StateContext): PlayerPhaseState | null {
    console.log("[RotatingTileState] Confirming rotation");
    context.onStateChange();

    // Return to AwaitingAction
    return new AwaitingActionState();
  }

  /**
   * Cancel rotation, restore original orientation, return to AwaitingAction
   *
   * @param context - State context with dependencies
   * @returns AwaitingActionState
   *
   * @remarks
   * Undoes all rotations by restoring the original tile orientation.
   *
   * **Side Effects:**
   * - Restores `context.state.grid[row][col].orientation` from originalTileOrientation
   * - Calls `context.onStateChange()` (via onExit and AwaitingAction.onEnter)
   *
   * **Preconditions:**
   * - `context.state.rotatingTilePosition` must not be null (guaranteed by onEnter)
   * - `context.state.originalTileOrientation` must not be null (guaranteed by onEnter)
   */
  cancelRotation(context: StateContext): PlayerPhaseState | null {
    if (!context.state.rotatingTilePosition || context.state.originalTileOrientation === null) {
      console.warn("[RotatingTileState] Cannot cancel - missing rotation state");
      // Return to AwaitingAction anyway to recover
      return new AwaitingActionState();
    }

    const { row, col } = context.state.rotatingTilePosition;
    console.log("[RotatingTileState] Cancelling rotation, restoring original orientation:", context.state.originalTileOrientation);

    // Restore original orientation
    context.state.grid[row][col] = {
      ...context.state.grid[row][col],
      orientation: context.state.originalTileOrientation,
    };

    context.onStateChange();

    // Return to AwaitingAction
    return new AwaitingActionState();
  }
}
