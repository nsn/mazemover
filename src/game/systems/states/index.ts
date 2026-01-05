/**
 * State Pattern Implementation for TurnManager
 *
 * @module states
 *
 * @description
 * This module implements the State pattern for managing game turns and player phases.
 * The architecture uses a two-level hierarchy:
 *
 * **Level 1: Turn Ownership (TurnState)**
 * - PlayerTurnState: Manages player turn and delegates to PlayerPhaseState
 * - EnemyTurnState: Simple state for enemy turn
 *
 * **Level 2: Player Phases (PlayerPhaseState)**
 * - AwaitingActionState: Default state, waiting for player input
 * - TilePlacementState: Placing a tile into the grid
 * - MovingState: Player movement (mostly handled externally)
 * - RotatingTileState: Rotating the tile player is standing on
 *
 * @example
 * ```typescript
 * import { PlayerTurnState, AwaitingActionState, StateContext } from "./states";
 *
 * // Create context
 * const context: StateContext = {
 *   state: gameState,
 *   objectManager: manager,
 *   deck: tileDeck,
 *   onStateChange: renderCallback,
 * };
 *
 * // Create player turn with default phase
 * const playerTurn = new PlayerTurnState(new AwaitingActionState());
 * playerTurn.onEnter(context);
 *
 * // Delegate to phase
 * playerTurn.enterTilePlacement(context);
 * ```
 *
 * @see {@link interfaces.ts} for core interfaces (StateContext, TurnState, PlayerPhaseState)
 * @see {@link PlayerTurnState} for player turn coordinator
 * @see {@link EnemyTurnState} for enemy turn state
 */

// Core interfaces
export type { StateContext, TurnState, PlayerPhaseState } from "./interfaces";

// Turn states
export { PlayerTurnState } from "./PlayerTurnState";
export { EnemyTurnState } from "./EnemyTurnState";

// Player phase states
export { AwaitingActionState } from "./phases/AwaitingActionState";
export { TilePlacementState } from "./phases/TilePlacementState";
export { MovingState } from "./phases/MovingState";
export { RotatingTileState } from "./phases/RotatingTileState";
