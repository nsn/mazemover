import type { PlayerPhaseState, StateContext } from "../interfaces";
import type { PlotPosition } from "../../../types";
import { PlayerPhase } from "../../../types";
import { AwaitingActionState } from "./AwaitingActionState";

/**
 * MovingState - Indicates player is in movement mode
 *
 * @description
 * This state exists primarily as a flag. The actual movement logic
 * is handled externally in the animation system (movePlayerAlongPath).
 *
 * **Lifecycle:**
 * - Entered from: AwaitingActionState via startMoving()
 * - Exits to: AwaitingActionState (then TurnManager transitions to enemy turn)
 *
 * **Responsibilities:**
 * - Set playerPhase flag for rendering system
 * - Provide completion/cancellation methods
 * - Movement execution happens outside this state
 *
 * **State-Specific Data:**
 * - No state-specific data (movement path handled externally)
 *
 * **Note:**
 * This state may be unused in current implementation as movement
 * can happen directly from AwaitingAction without entering Moving phase.
 * The state exists for future extensibility and to represent the
 * "player is moving" concept in the state machine.
 *
 * **Valid Transitions:**
 * - completeMove() → AwaitingActionState (then enemy turn via TurnManager)
 * - cancelMoving() → AwaitingActionState
 *
 * @example
 * ```typescript
 * const moving = new MovingState();
 * moving.onEnter(context);
 *
 * // Movement animation happens externally...
 *
 * // When animation completes:
 * const awaiting = moving.completeMove(context);
 * if (awaiting) {
 *   playerTurn.transitionToPhase(context, awaiting);
 *   // TurnManager then calls startEnemyTurn()
 * }
 * ```
 */
export class MovingState implements PlayerPhaseState {
  readonly phaseName = "Moving";

  /**
   * Called when entering Moving phase
   *
   * @param context - State context with dependencies
   *
   * @remarks
   * Sets the player phase flag and triggers render.
   *
   * **Side Effects:**
   * - Sets `context.state.playerPhase = PlayerPhase.Moving`
   * - Calls `context.onStateChange()` to trigger render
   *
   * **Note:**
   * Actual movement logic is triggered externally by detecting this phase.
   */
  onEnter(context: StateContext): void {
    console.log("[MovingState] Entering Moving phase");
    context.state.playerPhase = PlayerPhase.Moving;
    context.onStateChange();
  }

  /**
   * Called when exiting Moving phase
   *
   * @param _context - State context (unused)
   *
   * @remarks
   * No cleanup needed for Moving.
   * Does NOT call onStateChange (next phase will).
   */
  onExit(_context: StateContext): void {
    console.log("[MovingState] Exiting Moving phase");
    // No cleanup needed
  }

  /**
   * Enter tile placement (no-op in Moving)
   *
   * @returns null (not handled by this state)
   *
   * @remarks
   * Cannot enter tile placement while moving.
   * Must complete or cancel movement first.
   */
  enterTilePlacement(_context: StateContext): PlayerPhaseState | null {
    return null;
  }

  /**
   * Select plot (no-op in Moving)
   *
   * @returns null (not handled by this state)
   */
  selectPlot(_context: StateContext, _plot: PlotPosition): PlayerPhaseState | null {
    return null;
  }

  /**
   * Rotate tile (no-op in Moving)
   *
   * @remarks
   * Cannot rotate tile while moving.
   */
  rotateTile(_context: StateContext): void {
    // Cannot rotate while moving
  }

  /**
   * Execute push (no-op in Moving)
   *
   * @returns null (not handled by this state)
   */
  executePush(_context: StateContext): PlayerPhaseState | null {
    return null;
  }

  /**
   * Cancel placement (no-op in Moving)
   *
   * @returns null (not handled by this state)
   */
  cancelPlacement(_context: StateContext): PlayerPhaseState | null {
    return null;
  }

  /**
   * Start moving (no-op, already in Moving)
   *
   * @returns null (already in this state)
   */
  startMoving(_context: StateContext): PlayerPhaseState | null {
    return null;
  }

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
   */
  completeMove(context: StateContext): PlayerPhaseState | null {
    console.log("[MovingState] Completing move, returning to AwaitingAction");
    context.onStateChange();

    // Return to AwaitingAction
    return new AwaitingActionState();
  }

  /**
   * Cancel movement and return to AwaitingAction
   *
   * @param context - State context with dependencies
   * @returns AwaitingActionState
   *
   * @remarks
   * Called when player cancels movement before completing it.
   *
   * **Side Effects:**
   * - Calls `context.onStateChange()`
   */
  cancelMoving(context: StateContext): PlayerPhaseState | null {
    console.log("[MovingState] Cancelling movement, returning to AwaitingAction");
    context.onStateChange();

    // Return to AwaitingAction
    return new AwaitingActionState();
  }

  /**
   * Enter rotation mode (no-op in Moving)
   *
   * @returns null (not handled by this state)
   *
   * @remarks
   * Cannot enter rotation mode while moving.
   * Must complete or cancel movement first.
   */
  enterRotationMode(_context: StateContext): PlayerPhaseState | null {
    return null;
  }

  /**
   * Rotate player tile (no-op in Moving)
   *
   * @remarks
   * Cannot rotate tile while moving.
   */
  rotatePlayerTile(_context: StateContext): void {
    // Cannot rotate while moving
  }

  /**
   * Confirm rotation (no-op in Moving)
   *
   * @returns null (not handled by this state)
   */
  confirmRotation(_context: StateContext): PlayerPhaseState | null {
    return null;
  }

  /**
   * Cancel rotation (no-op in Moving)
   *
   * @returns null (not handled by this state)
   */
  cancelRotation(_context: StateContext): PlayerPhaseState | null {
    return null;
  }
}
