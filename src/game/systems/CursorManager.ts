import { k } from "../../kaplayCtx";
import { PlayerPhase, Direction, TurnOwner } from "../types";
import type { TurnManager } from "./TurnManager";
import { PREVIEW_X, PREVIEW_Y } from "../config";
import { findReachableTiles } from "./Pathfinding";
import { isWallBlocking } from "./WallBump";
import {
  screenToGrid,
  getEnemyAtPosition,
  isMouseOverPreviewTile,
} from "./PositionUtils";

// Centralized cursor definitions
const CURSORS = {
  default: "url('/cursors/pointer_a.png'), auto",
  rotate: "url('/cursors/rotate_cw.png'), auto",
  push_left: "url('/cursors/navigation_w.png'), auto",
  push_right: "url('/cursors/navigation_e.png'), auto",
  push_up: "url('/cursors/navigation_n.png'), auto",
  push_down: "url('/cursors/navigation_s.png'), auto",
  place: "url('/cursors/cursor_copy.png'), auto",
  confirm: "url('/cursors/cursor_confirm.png'), auto",
  cancel: "url('/cursors/cursor_disabled.png'), auto",
  move_left: "url('/cursors/arrow_w.png'), auto",
  move_right: "url('/cursors/arrow_e.png'), auto",
  move_up: "url('/cursors/arrow_n.png'), auto",
  move_down: "url('/cursors/arrow_s.png'), auto",
  demolish: "url('/cursors/tool_pickaxe.png'), auto",
  attack: "url('/cursors/tool_sword_a.png'), auto",
} as const;

type CursorType = keyof typeof CURSORS;

export class CursorManager {
  private currentCursorType: CursorType;

  constructor() {
    this.currentCursorType = "default";
  }

  /**
   * Check if mouse is over any rendered plot object
   */
  private isMouseOverPlot(mousePos: { x: number; y: number }): boolean {
    const plotObjects = k.get("plot");
    for (const plotObj of plotObjects) {
      if ((plotObj as any).hasPoint && (plotObj as any).hasPoint(mousePos)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Check if mouse is over the current tile being placed
   */
  private isMouseOverCurrentTile(mousePos: { x: number; y: number }): boolean {
    const currentTiles = k.get("currentTile");
    for (const tile of currentTiles) {
      if ((tile as any).hasPoint && (tile as any).hasPoint(mousePos)) {
        return true;
      }
    }
    return false;
  }

  initialize(): void {
    this.changeCursorType("default");
    console.log("[CursorManager] Initialized with CSS cursors");
  }

  update(turnManager: TurnManager): void {
    const state = turnManager.getState();
    const mousePos = k.mousePos();

    const newCursorType = this.determineCursorType(state, mousePos, turnManager);

    if (newCursorType !== this.currentCursorType) {
      this.changeCursorType(newCursorType);
    }
  }

  private determineCursorType(state: any, mousePos: any, turnManager: TurnManager): CursorType {
    // ROTATING TILE MODE: Check for rotate or confirm/cancel cursors
    if (state.playerPhase === PlayerPhase.RotatingTile) {
      return this.getRotationModeCursor(mousePos, state, turnManager);
    }

    // TILE PLACEMENT STATE: Check for rotate or place/push cursors
    if (state.playerPhase === PlayerPhase.TilePlacement) {
      // Check if hovering over the tile at the selected plot position (for rotation)
      if (state.selectedPlot && this.isMouseOverCurrentTile(mousePos)) {
        return "rotate";
      }

      // Check if hovering over preview tile (for rotation)
      if (!state.selectedPlot && isMouseOverPreviewTile(mousePos.x, mousePos.y, PREVIEW_X, PREVIEW_Y)) {
        return "rotate";
      }

      // Check if hovering over selected plot's affected row/column (push cursor)
      if (state.selectedPlot) {
        const pushCursor = this.getPushCursor(mousePos, state.selectedPlot);
        if (pushCursor) return pushCursor;
      }

      // Check if hovering over a plot (place cursor)
      if (state.currentTile && this.isMouseOverPlot(mousePos)) {
        return "place";
      }

      // Hovering outside affected area - show cancel cursor
      return "cancel";
    }

    // NORMAL GAMEPLAY: Check grid for navigation, combat, demolish cursors
    if (state.turnOwner === TurnOwner.Player) {
      const player = turnManager.getObjectManager().getPlayer();
      if (!player || player.movesRemaining <= 0) {
        // Check if hovering over plots (can still place tiles)
        if (state.currentTile && this.isMouseOverPlot(mousePos)) {
          return "place";
        }
        return "default";
      }

      const gridPos = screenToGrid(mousePos.x, mousePos.y);
      if (!gridPos) {
        // Not over grid, check if over plots
        if (state.currentTile && this.isMouseOverPlot(mousePos)) {
          return "place";
        }
        return "default";
      }

      // Check if hovering over player's current tile (show rotate cursor in AwaitingAction state)
      if (state.playerPhase === PlayerPhase.AwaitingAction &&
          gridPos.row === player.gridPosition.row &&
          gridPos.col === player.gridPosition.col) {
        return "rotate";
      }

      // Calculate reachable tiles (no caching)
      // Note: Player doesn't avoid dangerous tiles - treat as flying for pathfinding to allow all tiles
      const moves = turnManager.getObjectManager().getAvailableMoves(player);
      const reachableTiles = findReachableTiles(state.grid, player.gridPosition, moves, [], true);
      const target = reachableTiles.find(t => t.position.row === gridPos.row && t.position.col === gridPos.col);

      // Check if enemy at position (attack cursor)
      if (target && target.path.length > 1) {
        const enemy = getEnemyAtPosition(mousePos.x, mousePos.y, turnManager);
        if (enemy) return "attack";

        // Movement cursor
        return this.getDirectionalMoveCursor(gridPos, player.gridPosition);
      }

      // Check if wall blocking adjacent tile (demolish cursor)
      const dRow = Math.abs(gridPos.row - player.gridPosition.row);
      const dCol = Math.abs(gridPos.col - player.gridPosition.col);
      const isAdjacent = (dRow === 1 && dCol === 0) || (dRow === 0 && dCol === 1);
      if (isAdjacent && isWallBlocking(state.grid, player.gridPosition, gridPos)) {
        return "demolish";
      }

      // Check if over plots
      if (state.currentTile && this.isMouseOverPlot(mousePos)) {
        return "place";
      }
    }

    return "default";
  }

  private getRotationModeCursor(mousePos: any, state: any, turnManager: TurnManager): CursorType {
    if (!state.rotatingTilePosition) return "cancel";

    const gridPos = screenToGrid(mousePos.x, mousePos.y);
    if (!gridPos) return "cancel";

    // Hovering over the rotating tile -> rotate cursor
    if (gridPos.row === state.rotatingTilePosition.row && gridPos.col === state.rotatingTilePosition.col) {
      return "rotate";
    }

    // Check if reachable from rotating position (confirm cursor)
    const player = turnManager.getObjectManager().getPlayer();
    if (!player) return "cancel";

    const moves = turnManager.getObjectManager().getAvailableMoves(player);
    const reachable = findReachableTiles(state.grid, state.rotatingTilePosition, moves, [], true);
    const isReachable = reachable.some(t => t.position.row === gridPos.row && t.position.col === gridPos.col && t.path.length > 1);

    return isReachable ? "confirm" : "cancel";
  }

  private getPushCursor(mousePos: any, selectedPlot: any): CursorType | null {
    const gridPos = screenToGrid(mousePos.x, mousePos.y);
    if (!gridPos) return null;

    // Check if in affected row/column
    const isAffected =
      (selectedPlot.direction === Direction.North || selectedPlot.direction === Direction.South) ?
        gridPos.col === selectedPlot.col :
        gridPos.row === selectedPlot.row;

    if (!isAffected) return null;

    switch (selectedPlot.direction) {
      case Direction.North: return "push_up";
      case Direction.South: return "push_down";
      case Direction.East: return "push_right";
      case Direction.West: return "push_left";
      default: return null;
    }
  }

  private getDirectionalMoveCursor(targetPos: any, playerPos: any): CursorType {
    const rowDiff = targetPos.row - playerPos.row;
    const colDiff = targetPos.col - playerPos.col;

    // Adjacent tiles - exact direction
    if (Math.abs(rowDiff) === 1 && colDiff === 0) {
      return rowDiff < 0 ? "move_up" : "move_down";
    }
    if (Math.abs(colDiff) === 1 && rowDiff === 0) {
      return colDiff < 0 ? "move_left" : "move_right";
    }

    // Non-adjacent - primary direction
    if (Math.abs(rowDiff) >= Math.abs(colDiff)) {
      return rowDiff < 0 ? "move_up" : "move_down";
    }
    return colDiff < 0 ? "move_left" : "move_right";
  }

  private changeCursorType(type: CursorType): void {
    k.canvas.style.cursor = CURSORS[type];
    this.currentCursorType = type;
  }
}
