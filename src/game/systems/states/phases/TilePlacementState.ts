import type { PlayerPhaseState, StateContext } from "../interfaces";
import type { PlotPosition } from "../../../types";
import { PlayerPhase } from "../../../types";
import { rotateTile } from "../../../core/Tile";
import { pushTileIntoGrid, increaseDecayInPushedLine } from "../../../core/Grid";
import { AwaitingActionState } from "./AwaitingActionState";
import { DECAY_PROGRESSION } from "../../../config";

/**
 * TilePlacementState - Handles tile placement/push operations
 *
 * @description
 * Active when player is placing a tile into the grid. Manages:
 * - Plot selection
 * - Tile rotation (currentTile only, not grid tiles)
 * - Push execution
 * - Auto-draw new tile after push
 *
 * **Lifecycle:**
 * - Entered from: AwaitingActionState via enterTilePlacement()
 * - Exits to: AwaitingActionState (after push or cancel)
 *
 * **Responsibilities:**
 * - Display plots as placement options
 * - Show preview of tile at selected plot
 * - Execute push into grid
 * - Handle tile rotation in hand
 * - Auto-draw new tile after successful push
 *
 * **State-Specific Data:**
 * - Uses `state.selectedPlot` to track which plot is selected
 * - Uses `state.currentTile` for tile being placed
 *
 * **Interaction Flow:**
 * 1. Player clicks plot → selectedPlot set, preview shown
 * 2. Player can rotate tile with R/Q keys
 * 3. Player clicks same plot again → executePush()
 * 4. Push completes → auto-draw → return to AwaitingAction
 * 5. Or player cancels with Escape → return to AwaitingAction
 *
 * **Valid Transitions:**
 * - selectPlot() → null (first click, stays in state)
 * - selectPlot() → AwaitingActionState (second click on same plot, executes push)
 * - executePush() → AwaitingActionState (push successful)
 * - cancelPlacement() → AwaitingActionState (cancelled)
 * - rotateTile() → null (stays in state, rotates tile in hand)
 *
 * @example
 * ```typescript
 * const tilePlacement = new TilePlacementState();
 * tilePlacement.onEnter(context);
 *
 * // First click selects plot
 * let result = tilePlacement.selectPlot(context, plotPos);
 * // result === null, stays in TilePlacement
 *
 * // Rotate tile
 * tilePlacement.rotateTile(context);
 *
 * // Second click on same plot executes push
 * result = tilePlacement.selectPlot(context, plotPos);
 * // result === AwaitingActionState, transitions back
 * ```
 */
export class TilePlacementState implements PlayerPhaseState {
  readonly phaseName = "TilePlacement";

  /**
   * Called when entering TilePlacement phase
   *
   * @param context - State context with dependencies
   *
   * @remarks
   * Sets the player phase flag and triggers render to show plots.
   *
   * **Side Effects:**
   * - Sets `context.state.playerPhase = PlayerPhase.TilePlacement`
   * - Calls `context.onStateChange()` to trigger render
   */
  onEnter(context: StateContext): void {
    console.log("[TilePlacementState] Entering TilePlacement phase");
    context.state.playerPhase = PlayerPhase.TilePlacement;
    context.onStateChange();
  }

  /**
   * Called when exiting TilePlacement phase
   *
   * @param context - State context with dependencies
   *
   * @remarks
   * Clears selected plot when leaving this phase.
   * Does NOT call onStateChange (next phase will).
   *
   * **Side Effects:**
   * - Clears `context.state.selectedPlot = null`
   */
  onExit(context: StateContext): void {
    console.log("[TilePlacementState] Exiting TilePlacement phase");
    context.state.selectedPlot = null;
  }

  /**
   * Enter tile placement (no-op, already in TilePlacement)
   *
   * @returns null (already in this state)
   */
  enterTilePlacement(_context: StateContext): PlayerPhaseState | null {
    return null;
  }

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
   */
  selectPlot(context: StateContext, plot: PlotPosition): PlayerPhaseState | null {
    // If this is the selected plot, execute push
    if (
      context.state.selectedPlot &&
      context.state.selectedPlot.row === plot.row &&
      context.state.selectedPlot.col === plot.col &&
      context.state.selectedPlot.direction === plot.direction
    ) {
      console.log("[TilePlacementState] Same plot clicked, executing push");
      return this.executePush(context);
    }

    // Otherwise, select this plot
    console.log("[TilePlacementState] Plot selected:", plot);
    context.state.selectedPlot = plot;
    context.onStateChange();
    return null;
  }

  /**
   * Rotate the current tile in hand (clockwise 90°)
   *
   * @param context - State context with dependencies
   *
   * @remarks
   * Rotates `context.state.currentTile` orientation.
   * Stays in TilePlacement after rotation.
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

    console.log("[TilePlacementState] Rotating tile in hand");
    context.state.currentTile = {
      ...context.state.currentTile,
      orientation: rotateTile(context.state.currentTile.orientation),
    };
    context.onStateChange();
  }

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
   */
  executePush(context: StateContext): PlayerPhaseState | null {
    if (!context.state.currentTile || !context.state.selectedPlot) {
      console.log("[TilePlacementState] Cannot execute push - missing tile or plot");
      return null;
    }

    console.log("[TilePlacementState] Executing push with tile:", context.state.currentTile.type);

    // Move objects affected by the push
    context.objectManager.handlePush(context.state.selectedPlot);

    // Push tile into grid and get ejected tile
    const { newGrid, ejectedTile } = pushTileIntoGrid(
      context.state.grid,
      context.state.selectedPlot,
      context.state.currentTile
    );

    // Update grid and discard ejected tile
    context.deck.discard(ejectedTile);
    context.state.grid = newGrid;

    // Increase decay on all tiles in the pushed row/column
    // Each tile gets a random decay increase from 0 to ON_TILE_PLACEMENT
    increaseDecayInPushedLine(
      context.state.grid,
      context.state.selectedPlot,
      DECAY_PROGRESSION.ON_TILE_PLACEMENT,
      context.objectManager
    );

    context.state.selectedPlot = null;

    // Auto-draw new tile for continuous placement
    context.state.currentTile = context.deck.draw();
    console.log("[TilePlacementState] Push complete, auto-drew new tile:", context.state.currentTile?.type);

    // Trigger render
    context.onStateChange();

    // Return to AwaitingAction
    return new AwaitingActionState();
  }

  /**
   * Cancel tile placement and return to AwaitingAction
   *
   * @param context - State context with dependencies
   * @returns AwaitingActionState
   *
   * @remarks
   * Clears selected plot and exits tile placement mode.
   *
   * **Side Effects:**
   * - Clears `context.state.selectedPlot`
   * - Calls `context.onStateChange()`
   */
  cancelPlacement(context: StateContext): PlayerPhaseState | null {
    console.log("[TilePlacementState] Cancelling tile placement");
    context.state.selectedPlot = null;
    context.onStateChange();

    // Return to AwaitingAction
    return new AwaitingActionState();
  }

  /**
   * Start moving (no-op in TilePlacement)
   *
   * @returns null (not handled by this state)
   */
  startMoving(_context: StateContext): PlayerPhaseState | null {
    return null;
  }

  /**
   * Complete move (no-op in TilePlacement)
   *
   * @returns null (not handled by this state)
   */
  completeMove(_context: StateContext): PlayerPhaseState | null {
    return null;
  }

  /**
   * Cancel moving (no-op in TilePlacement)
   *
   * @returns null (not handled by this state)
   */
  cancelMoving(_context: StateContext): PlayerPhaseState | null {
    return null;
  }

  /**
   * Enter rotation mode (no-op in TilePlacement)
   *
   * @returns null (not handled by this state)
   *
   * @remarks
   * Cannot enter rotation mode while in tile placement.
   * Must cancel placement first.
   */
  enterRotationMode(_context: StateContext): PlayerPhaseState | null {
    return null;
  }

  /**
   * Rotate player tile (no-op in TilePlacement)
   *
   * @remarks
   * Cannot rotate grid tiles while in tile placement mode.
   */
  rotatePlayerTile(_context: StateContext): void {
    // Not handled in tile placement
  }

  /**
   * Confirm rotation (no-op in TilePlacement)
   *
   * @returns null (not handled by this state)
   */
  confirmRotation(_context: StateContext): PlayerPhaseState | null {
    return null;
  }

  /**
   * Cancel rotation (no-op in TilePlacement)
   *
   * @returns null (not handled by this state)
   */
  cancelRotation(_context: StateContext): PlayerPhaseState | null {
    return null;
  }
}
