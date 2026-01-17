import { k } from "../../kaplayCtx";
import { PlayerPhase, Direction, TurnOwner } from "../types";
import type { TurnManager } from "./TurnManager";
import type { PlotPosition } from "../types";
import { TILE_SIZE, GRID_OFFSET_X, GRID_OFFSET_Y, GRID_ROWS, GRID_COLS } from "../config";
import { findReachableTiles } from "./Pathfinding";
import { isWallBlocking } from "./WallBump";

// Centralized cursor definitions - easy to extend with new cursor types
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
  private cachedReachableTiles: any[] = [];
  private lastPlayerPosition: { row: number; col: number } | null = null;
  private lastGridHash: string = "";
  private lastEnemyHash: string = "";

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

    // Update reachable tiles cache if player moved or grid changed
    this.updateReachableCache(state, turnManager);

    const newCursorType = this.determineCursorType(state, mousePos, turnManager);

    // Only update CSS if cursor type changed (optimization)
    if (newCursorType !== this.currentCursorType) {
      this.changeCursorType(newCursorType);
    }
  }

  private updateReachableCache(state: any, turnManager: TurnManager): void {
    const player = turnManager.getObjectManager().getPlayer();
    if (!player) {
      this.cachedReachableTiles = [];
      return;
    }

    // Create a simple hash of grid state (just check if grid reference changed)
    const gridHash = JSON.stringify(state.grid.map((row: any[]) => row.map(t => `${t.type}${t.orientation}`)));

    // Create hash of enemy positions (enemies block movement)
    const enemies = turnManager.getObjectManager().getEnemies();
    const enemyHash = JSON.stringify(enemies.map(e => `${e.gridPosition.row},${e.gridPosition.col}`));

    // Check if player position or grid changed or enemies changed
    const playerMoved = !this.lastPlayerPosition ||
                        this.lastPlayerPosition.row !== player.gridPosition.row ||
                        this.lastPlayerPosition.col !== player.gridPosition.col;
    const gridChanged = this.lastGridHash !== gridHash;
    const enemiesChanged = this.lastEnemyHash !== enemyHash;

    if (playerMoved || gridChanged || enemiesChanged) {
      const moves = turnManager.getObjectManager().getAvailableMoves(player);
      this.cachedReachableTiles = findReachableTiles(state.grid, player.gridPosition, moves);
      this.lastPlayerPosition = { ...player.gridPosition };
      this.lastGridHash = gridHash;
      this.lastEnemyHash = enemyHash;
    }
  }

  private determineCursorType(state: any, mousePos: any, turnManager: TurnManager): CursorType {
    // Check if in rotation mode
    if (state.playerPhase === PlayerPhase.RotatingTile) {
      return this.getRotationModeCursor(mousePos, state, turnManager);
    }

    // Check if hovering over currentTile (rotation)
    if (this.shouldShowRotateCursor(state, mousePos)) {
      return "rotate";
    }

    // Check if hovering over a plot (directional push)
    const plotCursor = this.getPlotCursor(state, mousePos);
    if (plotCursor) {
      return plotCursor;
    }

    // Check if hovering over an enemy (attack)
    const attackCursor = this.getAttackCursor(mousePos, state, turnManager);
    if (attackCursor) {
      return attackCursor;
    }

    // Check if hovering over a reachable tile (movement)
    const moveCursor = this.getMoveCursor(mousePos, state, turnManager);
    if (moveCursor) {
      return moveCursor;
    }

    // Check if hovering over a wall that can be demolished
    const demolishCursor = this.getDemolishCursor(mousePos, state, turnManager);
    if (demolishCursor) {
      return demolishCursor;
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

  private getMoveCursor(mousePos: any, state: any, turnManager: TurnManager): CursorType | null {
    // Only show move cursors during player turn and not in tile placement
    if (state.turnOwner !== TurnOwner.Player || state.playerPhase === PlayerPhase.TilePlacement) {
      return null;
    }

    // Get player
    const player = turnManager.getObjectManager().getPlayer();
    if (!player || player.movesRemaining <= 0) {
      return null;
    }

    // Calculate which grid cell the mouse is over
    const gridCol = Math.floor((mousePos.x - GRID_OFFSET_X) / TILE_SIZE);
    const gridRow = Math.floor((mousePos.y - GRID_OFFSET_Y) / TILE_SIZE);

    // Check if mouse is within grid bounds
    if (gridRow < 0 || gridRow >= GRID_ROWS || gridCol < 0 || gridCol >= GRID_COLS) {
      return null;
    }

    // Use cached reachable tiles instead of recalculating
    const target = this.cachedReachableTiles.find(
      (t) => t.position.row === gridRow && t.position.col === gridCol
    );

    if (!target || target.path.length <= 1) {
      return null;
    }

    // Calculate direction from player to target
    const rowDiff = gridRow - player.gridPosition.row;
    const colDiff = gridCol - player.gridPosition.col;

    // For adjacent tiles, show exact direction
    if (Math.abs(rowDiff) === 1 && colDiff === 0) {
      return rowDiff < 0 ? "move_up" : "move_down";
    } else if (Math.abs(colDiff) === 1 && rowDiff === 0) {
      return colDiff < 0 ? "move_left" : "move_right";
    }

    // For non-adjacent tiles, show primary direction
    // Prioritize vertical movement if both row and col differ
    if (Math.abs(rowDiff) >= Math.abs(colDiff)) {
      return rowDiff < 0 ? "move_up" : "move_down";
    } else {
      return colDiff < 0 ? "move_left" : "move_right";
    }
  }

  private getRotationModeCursor(mousePos: any, state: any, turnManager: TurnManager): CursorType {
    if (!state.rotatingTilePosition) {
      return "cancel";
    }

    const gridCol = Math.floor((mousePos.x - GRID_OFFSET_X) / TILE_SIZE);
    const gridRow = Math.floor((mousePos.y - GRID_OFFSET_Y) / TILE_SIZE);

    // Check if within grid bounds
    if (gridRow < 0 || gridRow >= GRID_ROWS || gridCol < 0 || gridCol >= GRID_COLS) {
      return "cancel";
    }

    // Check if hovering over the rotating tile
    if (gridRow === state.rotatingTilePosition.row && gridCol === state.rotatingTilePosition.col) {
      return "rotate";
    }

    // Check if hovering over a reachable tile (use cache from rotating position)
    const player = turnManager.getObjectManager().getPlayer();
    if (!player) {
      return "cancel";
    }

    // In rotation mode, we need to recalculate from rotating position (not from player position)
    // This is a special case that still needs findReachableTiles, but only in rotation mode
    const moves = turnManager.getObjectManager().getAvailableMoves(player);
    const reachable = findReachableTiles(state.grid, state.rotatingTilePosition, moves);

    const isReachable = reachable.some(
      (t) => t.position.row === gridRow && t.position.col === gridCol && t.path.length > 1
    );

    return isReachable ? "confirm" : "cancel";
  }

  private getAttackCursor(mousePos: any, state: any, turnManager: TurnManager): CursorType | null {
    // Only show attack cursor during player turn and not in tile placement
    if (state.turnOwner !== TurnOwner.Player || state.playerPhase === PlayerPhase.TilePlacement) {
      return null;
    }

    // Get player
    const player = turnManager.getObjectManager().getPlayer();
    if (!player || player.movesRemaining <= 0) {
      return null;
    }

    // Calculate which grid cell the mouse is over
    const gridCol = Math.floor((mousePos.x - GRID_OFFSET_X) / TILE_SIZE);
    const gridRow = Math.floor((mousePos.y - GRID_OFFSET_Y) / TILE_SIZE);

    // Check if mouse is within grid bounds
    if (gridRow < 0 || gridRow >= GRID_ROWS || gridCol < 0 || gridCol >= GRID_COLS) {
      return null;
    }

    // Use cached reachable tiles instead of recalculating
    const target = this.cachedReachableTiles.find(
      (t) => t.position.row === gridRow && t.position.col === gridCol
    );

    if (!target || target.path.length <= 1) {
      return null;
    }

    // Check if there's an enemy at this position
    const enemies = turnManager.getObjectManager().getEnemies();
    const enemyAtPosition = enemies.find(
      (enemy) => enemy.gridPosition.row === gridRow && enemy.gridPosition.col === gridCol
    );

    if (enemyAtPosition) {
      return "attack";
    }

    return null;
  }

  private getDemolishCursor(mousePos: any, state: any, turnManager: TurnManager): CursorType | null {
    // Only show demolish cursor during player turn and not in tile placement
    if (state.turnOwner !== TurnOwner.Player || state.playerPhase === PlayerPhase.TilePlacement) {
      return null;
    }

    // Get player
    const player = turnManager.getObjectManager().getPlayer();
    if (!player || player.movesRemaining <= 0) {
      return null;
    }

    // Calculate which grid cell the mouse is over
    const gridCol = Math.floor((mousePos.x - GRID_OFFSET_X) / TILE_SIZE);
    const gridRow = Math.floor((mousePos.y - GRID_OFFSET_Y) / TILE_SIZE);

    // Check if mouse is within grid bounds
    if (gridRow < 0 || gridRow >= GRID_ROWS || gridCol < 0 || gridCol >= GRID_COLS) {
      return null;
    }

    const targetPos = { row: gridRow, col: gridCol };

    // Check if this is an adjacent tile blocked by a wall
    const dRow = Math.abs(targetPos.row - player.gridPosition.row);
    const dCol = Math.abs(targetPos.col - player.gridPosition.col);
    const isAdjacent = (dRow === 1 && dCol === 0) || (dRow === 0 && dCol === 1);

    if (!isAdjacent) {
      return null;
    }

    // Check if there's a wall blocking the move
    if (isWallBlocking(state.grid, player.gridPosition, targetPos)) {
      return "demolish";
    }

    return null;
  }

  private changeCursorType(type: CursorType): void {
    k.canvas.style.cursor = CURSORS[type];
    this.currentCursorType = type;
  }
}
