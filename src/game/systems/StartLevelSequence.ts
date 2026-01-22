import { k } from "../../kaplayCtx";
import type { GameState, MapObject } from "../types";
import type { MapObjectManager } from "./MapObjectManager";
import { START_LEVEL, GRID_OFFSET_X, GRID_OFFSET_Y, TILE_SIZE, GRID_ROWS, GRID_COLS } from "../config";

/**
 * StartLevelSequence - Manages the animated sequence at the start of each level
 *
 * Sequence:
 * 1. Reveal grid tiles one by one
 * 2. Spawn enemies and objects one by one
 * 3. Play player drop animation
 * 4. Transition to normal gameplay
 */
export class StartLevelSequence {
  private state: GameState;
  private objectManager: MapObjectManager;
  private onComplete: () => void;
  private onRender: () => void;
  private isRunning: boolean = false;

  constructor(state: GameState, objectManager: MapObjectManager, onRender: () => void, onComplete: () => void) {
    this.state = state;
    this.objectManager = objectManager;
    this.onRender = onRender;
    this.onComplete = onComplete;
  }

  /**
   * Starts the level start sequence
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.warn("[StartLevelSequence] Sequence already running");
      return;
    }

    this.isRunning = true;
    console.log("[StartLevelSequence] Starting level sequence");

    try {
      // Step 1: Reveal grid
      await this.revealGrid();

      // Step 2: Spawn objects sequentially
      await this.spawnObjects();

      // Step 3: Play player drop animation
      await this.playPlayerDropAnimation();

      // Step 4: Complete sequence
      this.complete();
    } catch (error) {
      console.error("[StartLevelSequence] Error during sequence:", error);
      this.complete();
    }
  }

  /**
   * Reveals the grid tiles with a staggered animation
   */
  private async revealGrid(): Promise<void> {
    console.log("[StartLevelSequence] Revealing grid");

    const totalTiles = GRID_ROWS * GRID_COLS;
    const delayPerTile = START_LEVEL.GRID_REVEAL_DURATION / totalTiles;

    // Create array of all tile positions
    const positions: { row: number; col: number }[] = [];
    for (let r = 0; r < GRID_ROWS; r++) {
      for (let c = 0; c < GRID_COLS; c++) {
        positions.push({ row: r, col: c });
      }
    }

    // Reveal tiles one by one from center outward (spiral pattern)
    const orderedPositions = this.spiralOrder(positions);

    for (let i = 0; i < orderedPositions.length; i++) {
      const pos = orderedPositions[i];
      this.revealTile(pos.row, pos.col);

      // Wait before revealing next tile
      if (i < orderedPositions.length - 1) {
        await this.wait(delayPerTile * 1000);
      }
    }

    // Wait for fade-in to complete
    await this.wait(START_LEVEL.FADE_IN_DURATION * 1000);
  }

  /**
   * Orders positions in a spiral pattern from center
   */
  private spiralOrder(positions: { row: number; col: number }[]): { row: number; col: number }[] {
    const centerRow = Math.floor(GRID_ROWS / 2);
    const centerCol = Math.floor(GRID_COLS / 2);

    // Sort by Manhattan distance from center
    return positions.sort((a, b) => {
      const distA = Math.abs(a.row - centerRow) + Math.abs(a.col - centerCol);
      const distB = Math.abs(b.row - centerRow) + Math.abs(b.col - centerCol);
      return distA - distB;
    });
  }

  /**
   * Reveals a single tile with fade-in animation
   */
  private revealTile(row: number, col: number): void {
    // Add tile to revealed set
    this.state.revealedTiles.add(`${row},${col}`);

    // Trigger render to show the newly revealed tile
    this.onRender();
  }

  /**
   * Spawns all map objects sequentially
   */
  private async spawnObjects(): Promise<void> {
    console.log("[StartLevelSequence] Spawning objects");

    // Get all objects marked for start sequence (excluding player)
    const objects = this.objectManager.getAllObjects()
      .filter(obj => obj.isInStartLevelSequence && obj.type !== "Player");

    // Spawn each object with a delay
    for (let i = 0; i < objects.length; i++) {
      await this.spawnObject(objects[i]);

      // Wait before spawning next object
      if (i < objects.length - 1) {
        await this.wait(START_LEVEL.OBJECT_SPAWN_DELAY * 1000);
      }
    }
  }

  /**
   * Spawns a single object with fade-in animation
   */
  private async spawnObject(obj: MapObject): Promise<void> {
    console.log(`[StartLevelSequence] Spawning ${obj.name}`);

    const x = GRID_OFFSET_X + obj.gridPosition.col * TILE_SIZE + TILE_SIZE / 2 + obj.spriteOffset.x;
    const y = GRID_OFFSET_Y + obj.gridPosition.row * TILE_SIZE + TILE_SIZE / 2 + obj.spriteOffset.y;

    // Create a temporary spawn effect
    const spawnEffect = k.add([
      k.circle(TILE_SIZE / 2),
      k.pos(x, y),
      k.anchor("center"),
      k.color(255, 255, 255),
      k.opacity(0.5),
      k.scale(0.5),
      k.z(150),
      "spawnEffect",
    ]);

    // Scale up and fade out
    k.tween(
      0.5,
      1.5,
      START_LEVEL.FADE_IN_DURATION,
      (val) => {
        spawnEffect.scale = k.vec2(val, val);
      },
      k.easings.easeOutQuad
    );

    k.tween(
      0.5,
      0,
      START_LEVEL.FADE_IN_DURATION,
      (val) => spawnEffect.opacity = val,
      k.easings.easeOutQuad
    ).onEnd(() => {
      k.destroy(spawnEffect);
    });

    // Mark object as no longer in sequence (so it renders normally)
    obj.isInStartLevelSequence = false;

    // Trigger render to show the object
    this.onRender();

    // Wait for spawn animation to complete
    await this.wait(START_LEVEL.FADE_IN_DURATION * 1000);
  }

  /**
   * Plays the player entry animation (rise or drop based on direction)
   */
  private async playPlayerDropAnimation(): Promise<void> {
    const player = this.objectManager.getPlayer();
    if (!player) {
      console.warn("[StartLevelSequence] No player found");
      return;
    }

    // Choose animation based on whether player is ascending or descending
    const animationName = this.state.isAscending ? "rise" : "drop";
    console.log(`[StartLevelSequence] Playing player ${animationName} animation`);

    // Wait before starting animation
    await this.wait(START_LEVEL.PLAYER_DROP_DELAY * 1000);

    // Create a temporary sprite to track animation duration
    const entrySprite = k.add([
      k.sprite("mason", { anim: animationName }),
      k.pos(-1000, -1000), // Off-screen
      k.opacity(0),
      "entryAnimationTracker",
    ]);

    // Mark player as no longer in sequence and playing entry animation
    player.isInStartLevelSequence = false;
    player.isPlayingDropAnimation = true;
    player.entryAnimationName = animationName;  // Store which animation to play

    // Trigger render to show the player with entry animation
    this.onRender();

    // Wait for animation to complete
    return new Promise<void>((resolve) => {
      entrySprite.onAnimEnd(() => {
        console.log(`[StartLevelSequence] ${animationName} animation completed`);
        player.isPlayingDropAnimation = false;
        this.onRender(); // Render to show idle animation
        resolve();
      });
    });
  }

  /**
   * Completes the sequence and transitions to normal gameplay
   */
  private complete(): void {
    console.log("[StartLevelSequence] Sequence complete");
    this.isRunning = false;
    this.state.isInStartLevelSequence = false;

    // Mark all remaining objects as no longer in sequence
    const allObjects = this.objectManager.getAllObjects();
    for (const obj of allObjects) {
      obj.isInStartLevelSequence = false;
    }

    this.onComplete();
  }

  /**
   * Helper to wait for a specified duration
   */
  private wait(ms: number): Promise<void> {
    return new Promise(resolve => k.wait(ms / 1000, resolve));
  }

  /**
   * Checks if sequence is currently running
   */
  isActive(): boolean {
    return this.isRunning;
  }
}
