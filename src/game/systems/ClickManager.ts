import { k } from "../../kaplayCtx";
import { PlayerPhase, TurnOwner, type PlotPosition, type GridPosition } from "../types";
import type { TurnManager } from "./TurnManager";
import { PREVIEW_X, PREVIEW_Y } from "../config";
import { findReachableTiles } from "./Pathfinding";
import { isWallBlocking } from "./WallBump";
import {
  screenToGrid,
  isMouseOverPlayer,
  isMouseOverPreviewTile,
} from "./PositionUtils";

/**
 * Callbacks for actions that the ClickManager can trigger
 */
export interface ClickCallbacks {
  onSkipTurn: () => void;
  onRotatePlayerTile: () => void;
  onConfirmRotationAndMove: (path: GridPosition[]) => void;
  onCancelRotation: () => void;
  onPlayerClicked: () => void;
  onMovePlayer: (path: GridPosition[]) => void;
  onWallBump: (targetPos: GridPosition) => void;
  onRotateTile: () => void;
  onRotateTileCounterClockwise: () => void;
  onEnterTilePlacement: () => void;
  onExecutePush: () => void;
  onSelectPlot: (plot: PlotPosition) => void;
  onCancelPlacement: () => void;
}

/**
 * Manages click detection and delegates to appropriate handlers based on game state.
 * Uses shared PositionUtils for consistent position detection.
 */
export class ClickManager {
  private callbacks: ClickCallbacks;

  constructor(callbacks: ClickCallbacks) {
    this.callbacks = callbacks;
  }

  /**
   * Handles a left mouse click based on current game state
   * @returns true if click was handled, false otherwise
   */
  handleLeftClick(mousePos: { x: number; y: number }, turnManager: TurnManager, isAnimating: boolean): boolean {
    if (isAnimating) {
      console.log("[ClickManager] Click ignored - animating");
      return false;
    }

    const state = turnManager.getState();

    // Block input during start level sequence
    if (state.isInStartLevelSequence) {
      console.log("[ClickManager] Click ignored - start level sequence");
      return false;
    }

    // Check for skip button click
    if (this.checkSkipButton(mousePos)) {
      this.callbacks.onSkipTurn();
      return true;
    }

    // Handle rotation mode clicks
    if (state.playerPhase === PlayerPhase.RotatingTile) {
      return this.handleRotationModeClick(mousePos, turnManager);
    }

    // Handle tile placement mode clicks
    if (state.playerPhase === PlayerPhase.TilePlacement && state.currentTile) {
      return this.handleTilePlacementClick(mousePos, turnManager);
    }

    // Handle normal gameplay clicks
    if (state.turnOwner === TurnOwner.Player) {
      return this.handleNormalGameplayClick(mousePos, turnManager);
    }

    return false;
  }

  /**
   * Handles a right mouse click
   */
  handleRightClick(mousePos: { x: number; y: number }, turnManager: TurnManager, isAnimating: boolean): boolean {
    if (isAnimating) return false;

    const state = turnManager.getState();

    // Cancel rotation mode on right-click
    if (state.playerPhase === PlayerPhase.RotatingTile) {
      console.log("[ClickManager] Right-click - canceling rotation");
      this.callbacks.onCancelRotation();
      return true;
    }

    // Check if right-clicking on preview/current tile for counter-clockwise rotation
    if (isMouseOverPreviewTile(mousePos.x, mousePos.y, PREVIEW_X, PREVIEW_Y)) {
      console.log("[ClickManager] Preview tile right-click - rotating CCW");
      this.callbacks.onRotateTileCounterClockwise();
      return true;
    }

    return false;
  }

  private checkSkipButton(mousePos: { x: number; y: number }): boolean {
    const skipButtons = k.get("skipButton");
    for (const button of skipButtons) {
      if ((button as any).hasPoint && (button as any).hasPoint(mousePos)) {
        console.log("[ClickManager] Skip button clicked");
        return true;
      }
    }
    return false;
  }

  private handleRotationModeClick(mousePos: { x: number; y: number }, turnManager: TurnManager): boolean {
    const state = turnManager.getState();
    if (!state.rotatingTilePosition) {
      this.callbacks.onCancelRotation();
      return true;
    }

    const gridPos = screenToGrid(mousePos.x, mousePos.y);
    if (!gridPos) {
      // Click outside grid - cancel rotation
      console.log("[ClickManager] Canceling rotation - click outside grid");
      this.callbacks.onCancelRotation();
      return true;
    }

    // Check if clicked on the rotating tile
    if (gridPos.row === state.rotatingTilePosition.row &&
        gridPos.col === state.rotatingTilePosition.col) {
      console.log("[ClickManager] Rotating player tile");
      this.callbacks.onRotatePlayerTile();
      return true;
    }

    // Check if clicked on a reachable tile
    const player = turnManager.getObjectManager().getPlayer();
    if (player) {
      const moves = turnManager.getObjectManager().getAvailableMoves(player);
      const reachable = findReachableTiles(state.grid, state.rotatingTilePosition, moves);
      const target = reachable.find(
        (t) => t.position.row === gridPos.row && t.position.col === gridPos.col
      );

      if (target && target.path.length > 1) {
        console.log("[ClickManager] Confirming rotation and moving to:", target.position);
        this.callbacks.onConfirmRotationAndMove(target.path);
        return true;
      }
    }

    // Clicked outside reachable tiles - cancel rotation
    console.log("[ClickManager] Canceling rotation - click outside reachable");
    this.callbacks.onCancelRotation();
    return true;
  }

  private handleTilePlacementClick(mousePos: { x: number; y: number }, _turnManager: TurnManager): boolean {
    // Check if clicking on the current tile being placed (rotate)
    const currentTiles = k.get("currentTile");
    for (const tile of currentTiles) {
      if ((tile as any).hasPoint && (tile as any).hasPoint(mousePos)) {
        console.log("[ClickManager] Current tile hit - rotating");
        this.callbacks.onRotateTile();
        return true;
      }
    }

    // Check if clicking on preview tile (rotate)
    if (isMouseOverPreviewTile(mousePos.x, mousePos.y, PREVIEW_X, PREVIEW_Y)) {
      console.log("[ClickManager] Preview tile hit - rotating");
      this.callbacks.onRotateTile();
      return true;
    }

    // Check if clicking on highlight area (push)
    const highlightAreas = k.get("highlightArea");
    for (const area of highlightAreas) {
      if ((area as any).hasPoint && (area as any).hasPoint(mousePos)) {
        console.log("[ClickManager] Highlight area hit - pushing");
        this.callbacks.onExecutePush();
        return true;
      }
    }

    // Check if clicking on a plot (use rendered plot objects)
    const plotObjects = k.get("plot");
    for (const plotObj of plotObjects) {
      if ((plotObj as any).hasPoint && (plotObj as any).hasPoint(mousePos)) {
        const plotData = (plotObj as any).plotData as PlotPosition;
        console.log("[ClickManager] Plot hit:", plotData);
        this.callbacks.onSelectPlot(plotData);
        return true;
      }
    }

    // Background click - cancel placement
    console.log("[ClickManager] Background hit - canceling placement");
    this.callbacks.onCancelPlacement();
    return true;
  }

  private handleNormalGameplayClick(mousePos: { x: number; y: number }, turnManager: TurnManager): boolean {
    const state = turnManager.getState();
    const player = turnManager.getObjectManager().getPlayer();
    if (!player) return false;

    // Check if clicking on player sprite (enter rotation mode)
    if (isMouseOverPlayer(mousePos.x, mousePos.y, turnManager) && player.movesRemaining > 0) {
      console.log("[ClickManager] Player clicked - entering rotation mode");
      this.callbacks.onPlayerClicked();
      return true;
    }

    // Check if clicking on preview tile (enter placement or rotate)
    if (isMouseOverPreviewTile(mousePos.x, mousePos.y, PREVIEW_X, PREVIEW_Y)) {
      if (turnManager.canPlaceTile()) {
        console.log("[ClickManager] Preview tile hit - entering tile placement");
        this.callbacks.onEnterTilePlacement();
        return true;
      }
    }

    // Check for direct movement to grid tile
    if (player.movesRemaining > 0) {
      const gridPos = screenToGrid(mousePos.x, mousePos.y);
      if (gridPos) {
        const moves = turnManager.getObjectManager().getAvailableMoves(player);
        const reachable = findReachableTiles(state.grid, player.gridPosition, moves);
        const target = reachable.find(
          (t) => t.position.row === gridPos.row && t.position.col === gridPos.col
        );

        if (target && target.path.length > 1) {
          console.log("[ClickManager] Direct move to reachable tile:", target.position);
          this.callbacks.onMovePlayer(target.path);
          return true;
        }

        // Check if this is a wall bump (adjacent tile blocked by wall)
        const dRow = Math.abs(gridPos.row - player.gridPosition.row);
        const dCol = Math.abs(gridPos.col - player.gridPosition.col);
        const isAdjacent = (dRow === 1 && dCol === 0) || (dRow === 0 && dCol === 1);

        if (isAdjacent && isWallBlocking(state.grid, player.gridPosition, gridPos)) {
          console.log("[ClickManager] Wall bump detected");
          this.callbacks.onWallBump(gridPos);
          return true;
        }
      }
    }

    // Check if clicking on a plot (enter placement)
    if (state.currentTile && turnManager.canPlaceTile()) {
      const plotObjects = k.get("plot");
      for (const plotObj of plotObjects) {
        if ((plotObj as any).hasPoint && (plotObj as any).hasPoint(mousePos)) {
          const plotData = (plotObj as any).plotData as PlotPosition;
          console.log("[ClickManager] Plot hit - entering placement:", plotData);
          this.callbacks.onEnterTilePlacement();
          this.callbacks.onSelectPlot(plotData);
          return true;
        }
      }
    }

    return false;
  }
}
