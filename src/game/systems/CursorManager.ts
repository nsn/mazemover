import { k } from "../../kaplayCtx";
import { PlayerPhase, Direction } from "../types";
import type { TurnManager } from "./TurnManager";
import type { PlotPosition } from "../types";
import { TILE_SIZE, GRID_OFFSET_X, GRID_OFFSET_Y, GRID_ROWS, GRID_COLS } from "../config";

// Centralized cursor definitions - easy to extend with new cursor types
const CURSORS = {
  default: "url('/cursors/pointer_a.png'), auto",
  rotate: "url('/cursors/rotate_cw.png'), auto",
  push_left: "url('/cursors/navigation_w.png'), auto",
  push_right: "url('/cursors/navigation_e.png'), auto",
  push_up: "url('/cursors/navigation_n.png'), auto",
  push_down: "url('/cursors/navigation_s.png'), auto",
  place: "url('/cursors/cursor_copy.png'), auto",
} as const;

type CursorType = keyof typeof CURSORS;

export class CursorManager {
  private currentCursorType: CursorType;

  constructor() {
    this.currentCursorType = "default";
  }

  initialize(): void {
    // Set default CSS cursor
    this.changeCursorType("default");
    console.log("[CursorManager] Initialized with CSS cursors");
  }

  update(turnManager: TurnManager): void {
    // Determine cursor type based on hover state
    const state = turnManager.getState();
    const mousePos = k.mousePos();
    const newCursorType = this.determineCursorType(state, mousePos);

    // Only update CSS if cursor type changed (optimization)
    if (newCursorType !== this.currentCursorType) {
      this.changeCursorType(newCursorType);
    }
  }

  private determineCursorType(state: any, mousePos: any): CursorType {
    // Check if hovering over currentTile (rotation)
    if (this.shouldShowRotateCursor(state, mousePos)) {
      return "rotate";
    }

    // Check if hovering over a plot (directional push)
    const plotCursor = this.getPlotCursor(state, mousePos);
    if (plotCursor) {
      return plotCursor;
    }

    // Default cursor
    return "default";
  }

  private shouldShowRotateCursor(state: any, mousePos: any): boolean {
    // Only show rotate cursor in TilePlacement phase with a selected plot
    if (state.playerPhase !== PlayerPhase.TilePlacement || !state.selectedPlot) {
      return false;
    }

    // Check if mouse is hovering over the currentTile
    const currentTiles = k.get("currentTile");
    for (const tile of currentTiles) {
      if ((tile as any).hasPoint && (tile as any).hasPoint(mousePos)) {
        return true;
      }
    }

    return false;
  }

  private getPlotCursor(state: any, mousePos: any): CursorType | null {
    // Show push cursors when plots are visible (player can place tiles)
    if (state.playerPhase !== PlayerPhase.AwaitingAction &&
        state.playerPhase !== PlayerPhase.TilePlacement) {
      return null;
    }

    // Don't show push cursors if no tile available to place
    if (!state.currentTile) {
      return null;
    }

    // Check if mouse is hovering over a plot
    const plots = k.get("plot");
    for (const plot of plots) {
      if ((plot as any).hasPoint && (plot as any).hasPoint(mousePos)) {
        return "place";
      }
    }

    // If a plot is selected, check if hovering over affected row/column
    if (state.playerPhase === PlayerPhase.TilePlacement && state.selectedPlot) {
      const affectedCursor = this.getAffectedRowColumnCursor(state.selectedPlot, mousePos);
      if (affectedCursor) {
        return affectedCursor;
      }
    }

    return null;
  }

  private getAffectedRowColumnCursor(selectedPlot: PlotPosition, mousePos: any): CursorType | null {
    // Calculate which grid cell the mouse is over
    const gridCol = Math.floor((mousePos.x - GRID_OFFSET_X) / TILE_SIZE);
    const gridRow = Math.floor((mousePos.y - GRID_OFFSET_Y) / TILE_SIZE);

    // Check if mouse is within grid bounds
    if (gridRow < 0 || gridRow >= GRID_ROWS || gridCol < 0 || gridCol >= GRID_COLS) {
      return null;
    }

    // Check if the mouse is over a tile in the affected row or column
    const isAffected = this.isInAffectedRowColumn(selectedPlot, gridRow, gridCol);
    if (isAffected) {
      return this.getDirectionalCursor(selectedPlot.direction);
    }

    return null;
  }

  private isInAffectedRowColumn(plot: PlotPosition, gridRow: number, gridCol: number): boolean {
    // North/South plots affect columns (vertical push)
    if (plot.direction === Direction.North || plot.direction === Direction.South) {
      return gridCol === plot.col;
    }

    // East/West plots affect rows (horizontal push)
    if (plot.direction === Direction.East || plot.direction === Direction.West) {
      return gridRow === plot.row;
    }

    return false;
  }

  private getDirectionalCursor(direction: Direction): CursorType {
    switch (direction) {
      case Direction.North:
        return "push_up";
      case Direction.East:
        return "push_right";
      case Direction.South:
        return "push_down";
      case Direction.West:
        return "push_left";
      default:
        return "default";
    }
  }

  private changeCursorType(type: CursorType): void {
    k.canvas.style.cursor = CURSORS[type];
    this.currentCursorType = type;
  }
}
