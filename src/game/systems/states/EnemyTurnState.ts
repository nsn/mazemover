import type { TurnState, StateContext } from "./interfaces";
import { TurnOwner } from "../../types";
import { PlayerTurnState } from "./PlayerTurnState";
import { AwaitingActionState } from "./phases/AwaitingActionState";

/**
 * EnemyTurnState - Represents enemy turn (no player input)
 *
 * @description
 * Simple state that marks turnOwner as Enemy. The actual enemy
 * movement logic is handled externally via executeEnemyTurns() which
 * is called by the game loop after entering this state.
 *
 * **Lifecycle:**
 * - Entered from: PlayerTurnState via startEnemyTurn() (after player completes move)
 * - Exits to: PlayerTurnState via startPlayerTurn() (after all enemies move)
 *
 * **Responsibilities:**
 * - Set turnOwner flag to Enemy
 * - Trigger render with enemy turn UI
 * - Provide transition back to player turn
 *
 * **State-Specific Data:**
 * - None (completely stateless)
 *
 * **Note:**
 * Enemy AI execution happens outside the state machine. The game loop
 * detects this state via `turnOwner === TurnOwner.Enemy` and executes
 * enemy logic externally. This state exists primarily to set the turnOwner
 * flag correctly.
 *
 * **Valid Transitions:**
 * - startPlayerTurn() → PlayerTurnState (after all enemies move)
 *
 * @example
 * ```typescript
 * const enemyTurn = new EnemyTurnState();
 * enemyTurn.onEnter(context);
 * // Enemy AI executes externally...
 * const playerTurn = enemyTurn.startPlayerTurn(context);
 * ```
 */
export class EnemyTurnState implements TurnState {
  readonly name = "EnemyTurn";

  /**
   * Called when entering enemy turn
   *
   * @param context - State context with dependencies
   *
   * @remarks
   * Sets turnOwner to Enemy and triggers render to show enemy turn UI.
   *
   * **Side Effects:**
   * - Sets `context.state.turnOwner = TurnOwner.Enemy`
   * - Calls `context.onStateChange()` to trigger render
   *
   * **Note:**
   * The actual enemy movement logic is triggered externally by the game loop
   * which detects the turnOwner change.
   */
  onEnter(context: StateContext): void {
    console.log("[EnemyTurnState] Entering enemy turn");
    context.state.turnOwner = TurnOwner.Enemy;
    context.onStateChange();
  }

  /**
   * Called when exiting enemy turn
   *
   * @param _context - State context (unused)
   *
   * @remarks
   * No cleanup needed for enemy turn state.
   * Does NOT call onStateChange (PlayerTurnState.onEnter will).
   */
  onExit(_context: StateContext): void {
    console.log("[EnemyTurnState] Exiting enemy turn");
    // No cleanup needed
  }

  /**
   * Check if this is a player turn
   *
   * @returns Always false for EnemyTurnState
   */
  isPlayerTurn(): boolean {
    return false;
  }

  /**
   * Check if this is an enemy turn
   *
   * @returns Always true for EnemyTurnState
   */
  isEnemyTurn(): boolean {
    return true;
  }

  /**
   * Transition to player turn
   *
   * @param _context - State context (unused for transition)
   * @returns New PlayerTurnState instance with AwaitingActionState
   *
   * @remarks
   * Called after all enemies have completed their moves.
   * Creates a fresh player turn with default AwaitingAction phase.
   *
   * **Side Effects:**
   * - Calls objectManager.resetAllTurnMovement() via TurnManager
   * - Auto-draws new tile via TurnManager
   *
   * **Note:**
   * Some initialization happens in TurnManager.startPlayerTurn() rather than here:
   * - resetAllTurnMovement()
   * - deck.draw() for new tile
   */
  startPlayerTurn(_context: StateContext): TurnState {
    console.log("[EnemyTurnState] Transitioning to player turn");
    return new PlayerTurnState(new AwaitingActionState());
  }

  /**
   * Transition to enemy turn (no-op, already in enemy turn)
   *
   * @param _context - State context (unused)
   * @returns this (stays in enemy turn)
   *
   * @remarks
   * Called when trying to start enemy turn while already in enemy turn.
   * This is a no-op that returns self.
   */
  startEnemyTurn(_context: StateContext): TurnState {
    console.log("[EnemyTurnState] Already in enemy turn, ignoring startEnemyTurn");
    return this;
  }
}
