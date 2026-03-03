import { k } from "../kaplayCtx";
import { loadAssets, loadEnemyDatabase, enemyDatabase, loadItemDatabase, itemDatabase } from "./assets";
import { TurnManager } from "./systems/TurnManager";
import { CursorManager } from "./systems/CursorManager";
import { TileType, type TileInstance, type Orientation, type GridPosition, PlayerPhase, Direction } from "./types";
import { TILE_SIZE, GRID_OFFSET_X, GRID_OFFSET_Y, GRID_ROWS, GRID_COLS } from "./config";
import {
  drawGridWithOverlay,
  drawDecayOverlay,
  drawPlots,
  drawPlot,
  drawCurrentTile,
  clearGrid,
} from "./render/GridRenderer";
import {
  drawMapObjects,
  clearMapObjects,
} from "./render/MapObjectRenderer";
import { findReachableTiles } from "./systems/Pathfinding";
import { getPlotPositions } from "./core/Grid";
import type { PlotPosition } from "./types";
import { screenToGrid } from "./systems/PositionUtils";
import { isWallBlocking, openWall } from "./systems/WallBump";
import { executeCombat } from "./systems/Combat";
import { spawnScrollingText } from "./systems/ScrollingCombatText";
import { equipItemFromInventory, applyEquipmentBonuses } from "./systems/EquipmentManager";
import { resetGlobalLevel } from "./mainScene";

// Tutorial phase definitions
const TOTAL_PHASES = 8;

interface TutorialPhase {
  instruction: string;
  setupGrid: () => TileInstance[][];
  setupObjects: (tm: TurnManager) => void;
  checkComplete: (tm: TurnManager, state: TutorialState) => boolean;
  targetPosition?: GridPosition;
  solutionPlot?: PlotPosition;
}

interface TutorialState {
  currentPhase: number;
  phaseComplete: boolean;
  targetReached: boolean;
  enemyDefeated: boolean;
  itemUsed: boolean;
  wallBroken: boolean;
  playerHealed: boolean;
  initialHP: number;
  hasRotated: boolean;
}

// Helper to create a tile
function tile(type: TileType, orientation: Orientation, decay: number = 0): TileInstance {
  return { type, orientation, decay };
}

// Phase 1: Basic Movement - Simple path to target
function createPhase1Grid(): TileInstance[][] {
  const T = TileType;
  return [
    [tile(T.L, 1), tile(T.T, 2), tile(T.L, 2), tile(T.T, 2), tile(T.L, 2), tile(T.T, 2), tile(T.L, 2)],
    [tile(T.T, 1), tile(T.Cross, 0), tile(T.Straight, 1), tile(T.Cross, 0), tile(T.Straight, 1), tile(T.Cross, 0), tile(T.T, 3)],
    [tile(T.L, 0), tile(T.Straight, 0), tile(T.L, 3), tile(T.Straight, 0), tile(T.L, 3), tile(T.Straight, 0), tile(T.T, 3)],
    [tile(T.T, 1), tile(T.Cross, 0), tile(T.Straight, 1), tile(T.Cross, 0), tile(T.Straight, 1), tile(T.Cross, 0), tile(T.T, 3)],
    [tile(T.L, 0), tile(T.Straight, 0), tile(T.L, 3), tile(T.Straight, 0), tile(T.L, 3), tile(T.Straight, 0), tile(T.T, 3)],
    [tile(T.T, 1), tile(T.Cross, 0), tile(T.Straight, 1), tile(T.Cross, 0), tile(T.Straight, 1), tile(T.Cross, 0), tile(T.T, 3)],
    [tile(T.L, 0), tile(T.T, 0), tile(T.L, 3), tile(T.T, 0), tile(T.L, 3), tile(T.T, 0), tile(T.L, 3)],
  ];
}

// Phase 2: Tile Rotation - Need to rotate to open path
function createPhase2Grid(): TileInstance[][] {
  const T = TileType;
  // Player starts at (3,3) on L(0) which has north+east open
  // Must rotate to L(1) (east+south) to connect to the Straight below
  return [
    [tile(T.L, 1), tile(T.T, 2), tile(T.L, 2), tile(T.T, 2), tile(T.L, 2), tile(T.T, 2), tile(T.L, 2)],
    [tile(T.T, 1), tile(T.L, 1), tile(T.CulDeSac, 0), tile(T.CulDeSac, 0), tile(T.CulDeSac, 0), tile(T.CulDeSac, 0), tile(T.T, 3)],
    [tile(T.L, 0), tile(T.Straight, 0), tile(T.CulDeSac, 1), tile(T.CulDeSac, 1), tile(T.CulDeSac, 1), tile(T.CulDeSac, 1), tile(T.T, 3)],
    [tile(T.T, 1), tile(T.CulDeSac, 2), tile(T.CulDeSac, 2), tile(T.L, 0), tile(T.CulDeSac, 0), tile(T.CulDeSac, 0), tile(T.T, 3)],
    [tile(T.L, 0), tile(T.CulDeSac, 3), tile(T.CulDeSac, 3), tile(T.Straight, 0), tile(T.CulDeSac, 1), tile(T.CulDeSac, 1), tile(T.T, 3)],
    [tile(T.T, 1), tile(T.CulDeSac, 0), tile(T.CulDeSac, 0), tile(T.L, 0), tile(T.CulDeSac, 2), tile(T.CulDeSac, 2), tile(T.T, 3)],
    [tile(T.L, 0), tile(T.T, 0), tile(T.L, 3), tile(T.T, 0), tile(T.L, 3), tile(T.T, 0), tile(T.L, 3)],
  ];
}

// Phase 3: Tile Placement - Push a tile to create path
// Player at (3,4), target at (3,6), blocked at (3,5) by CulDeSac
// Push from top at col 5 shifts Cross from (2,5) down to (3,5)
function createPhase3Grid(): TileInstance[][] {
  const T = TileType;
  return [
    [tile(T.L, 1), tile(T.T, 2), tile(T.T, 2), tile(T.T, 2), tile(T.T, 2), tile(T.T, 2), tile(T.L, 2)],
    [tile(T.T, 1), tile(T.Cross, 0), tile(T.Cross, 0), tile(T.Cross, 0), tile(T.Cross, 0), tile(T.Cross, 0), tile(T.T, 3)],
    [tile(T.T, 1), tile(T.Cross, 0), tile(T.Cross, 0), tile(T.Cross, 0), tile(T.Cross, 0), tile(T.Cross, 0), tile(T.T, 3)],
    [tile(T.T, 1), tile(T.Cross, 0), tile(T.Cross, 0), tile(T.Cross, 0), tile(T.Cross, 0), tile(T.CulDeSac, 0), tile(T.CulDeSac, 3)],
    [tile(T.T, 1), tile(T.Cross, 0), tile(T.Cross, 0), tile(T.Cross, 0), tile(T.Cross, 0), tile(T.Cross, 0), tile(T.T, 3)],
    [tile(T.T, 1), tile(T.Cross, 0), tile(T.Cross, 0), tile(T.Cross, 0), tile(T.Cross, 0), tile(T.Cross, 0), tile(T.T, 3)],
    [tile(T.L, 0), tile(T.T, 0), tile(T.T, 0), tile(T.T, 0), tile(T.T, 0), tile(T.T, 0), tile(T.L, 3)],
  ];
}

// Phase 4-8: Use a more open grid for combat/items/decay
function createOpenGrid(): TileInstance[][] {
  const T = TileType;
  return [
    [tile(T.L, 1), tile(T.T, 2), tile(T.T, 2), tile(T.T, 2), tile(T.T, 2), tile(T.T, 2), tile(T.L, 2)],
    [tile(T.T, 1), tile(T.Cross, 0), tile(T.Cross, 0), tile(T.Cross, 0), tile(T.Cross, 0), tile(T.Cross, 0), tile(T.T, 3)],
    [tile(T.T, 1), tile(T.Cross, 0), tile(T.Cross, 0), tile(T.Cross, 0), tile(T.Cross, 0), tile(T.Cross, 0), tile(T.T, 3)],
    [tile(T.T, 1), tile(T.Cross, 0), tile(T.Cross, 0), tile(T.Cross, 0), tile(T.Cross, 0), tile(T.Cross, 0), tile(T.T, 3)],
    [tile(T.T, 1), tile(T.Cross, 0), tile(T.Cross, 0), tile(T.Cross, 0), tile(T.Cross, 0), tile(T.Cross, 0), tile(T.T, 3)],
    [tile(T.T, 1), tile(T.Cross, 0), tile(T.Cross, 0), tile(T.Cross, 0), tile(T.Cross, 0), tile(T.Cross, 0), tile(T.T, 3)],
    [tile(T.L, 0), tile(T.T, 0), tile(T.T, 0), tile(T.T, 0), tile(T.T, 0), tile(T.T, 0), tile(T.L, 3)],
  ];
}

// Phase 6: Decay grid - some tiles have high decay
function createDecayGrid(): TileInstance[][] {
  const T = TileType;
  return [
    [tile(T.L, 1), tile(T.T, 2), tile(T.T, 2), tile(T.T, 2), tile(T.T, 2, 5), tile(T.T, 2, 5), tile(T.L, 2, 5)],
    [tile(T.T, 1), tile(T.Cross, 0), tile(T.Cross, 0), tile(T.Cross, 0), tile(T.Cross, 0, 5), tile(T.Cross, 0), tile(T.T, 3, 5)],
    [tile(T.T, 1), tile(T.Cross, 0), tile(T.Cross, 0), tile(T.Cross, 0), tile(T.Cross, 0, 5), tile(T.Cross, 0, 5), tile(T.T, 3, 5)],
    [tile(T.T, 1), tile(T.Cross, 0), tile(T.Cross, 0), tile(T.Cross, 0), tile(T.Cross, 0), tile(T.Cross, 0), tile(T.T, 3)],
    [tile(T.T, 1), tile(T.Cross, 0), tile(T.Cross, 0), tile(T.Cross, 0), tile(T.Cross, 0), tile(T.Cross, 0), tile(T.T, 3)],
    [tile(T.T, 1), tile(T.Cross, 0), tile(T.Cross, 0), tile(T.Cross, 0), tile(T.Cross, 0), tile(T.Cross, 0), tile(T.T, 3)],
    [tile(T.L, 0), tile(T.T, 0), tile(T.T, 0), tile(T.T, 0), tile(T.T, 0), tile(T.T, 0), tile(T.L, 3)],
  ];
}

// Phase 7: Wall breaking grid - wall blocks the only path
function createWallGrid(): TileInstance[][] {
  const T = TileType;
  return [
    [tile(T.L, 1), tile(T.T, 2), tile(T.L, 2), tile(T.T, 2), tile(T.L, 2), tile(T.T, 2), tile(T.L, 2)],
    [tile(T.T, 1), tile(T.L, 1), tile(T.CulDeSac, 0), tile(T.CulDeSac, 0), tile(T.CulDeSac, 0), tile(T.L, 2), tile(T.T, 3)],
    [tile(T.L, 0), tile(T.Straight, 0), tile(T.CulDeSac, 1), tile(T.CulDeSac, 1), tile(T.CulDeSac, 1), tile(T.Straight, 0), tile(T.T, 3)],
    [tile(T.T, 1), tile(T.L, 3), tile(T.CulDeSac, 2), tile(T.CulDeSac, 2), tile(T.CulDeSac, 0), tile(T.L, 0), tile(T.T, 3)],
    [tile(T.L, 0), tile(T.CulDeSac, 3), tile(T.CulDeSac, 3), tile(T.CulDeSac, 3), tile(T.CulDeSac, 1), tile(T.Straight, 0), tile(T.T, 3)],
    [tile(T.T, 1), tile(T.L, 0), tile(T.CulDeSac, 0), tile(T.CulDeSac, 0), tile(T.CulDeSac, 2), tile(T.L, 3), tile(T.T, 3)],
    [tile(T.L, 0), tile(T.T, 0), tile(T.L, 3), tile(T.T, 0), tile(T.L, 3), tile(T.T, 0), tile(T.L, 3)],
  ];
}

interface TutorialText {
  phase: number;
  instruction: string;
}

interface TutorialTexts {
  phases: TutorialText[];
}

export function createTutorialScene(): void {
  k.scene("tutorial", async () => {
    await loadAssets();
    await loadEnemyDatabase();
    await loadItemDatabase();

    // Load tutorial texts from JSON
    let tutorialTexts: TutorialTexts = { phases: [] };
    try {
      const response = await fetch("/tutorial.json");
      if (response.ok) {
        tutorialTexts = await response.json();
      }
    } catch (error) {
      console.error("Failed to load tutorial texts:", error);
    }

    // Helper to get instruction text for a phase
    function getInstruction(phaseNum: number): string {
      const phase = tutorialTexts.phases.find(p => p.phase === phaseNum);
      return phase?.instruction ?? `Phase ${phaseNum}`;
    }

    // Tutorial state
    const tutorialState: TutorialState = {
      currentPhase: 1,
      phaseComplete: false,
      targetReached: false,
      enemyDefeated: false,
      itemUsed: false,
      wallBroken: false,
      playerHealed: false,
      initialHP: 0,
      hasRotated: false,
    };

    // Cursor manager
    const cursorManager = new CursorManager();
    cursorManager.initialize();

    // Turn manager (will be recreated for each phase)
    let turnManager: TurnManager;
    let isAnimating = false;

    // Context menu state for phase 5
    interface ContextMenuState {
      visible: boolean;
      x: number;
      y: number;
      inventoryIndex: number;
      options: { label: string; action: string }[];
    }
    const contextMenu: ContextMenuState = {
      visible: false,
      x: 0,
      y: 0,
      inventoryIndex: -1,
      options: [],
    };

    // Phase definitions
    const phases: TutorialPhase[] = [
      // Phase 1: Basic Movement
      {
        instruction: getInstruction(1),
        setupGrid: createPhase1Grid,
        setupObjects: (tm) => {
          const player = tm.getObjectManager().createPlayer({ row: 3, col: 1 }, "Player1");
          player.isInStartLevelSequence = false;
        },
        checkComplete: (tm) => {
          const player = tm.getObjectManager().getPlayer();
          return player?.gridPosition.row === 3 && player?.gridPosition.col === 5;
        },
        targetPosition: { row: 3, col: 5 },
      },
      // Phase 2: Tile Rotation
      {
        instruction: getInstruction(2),
        setupGrid: createPhase2Grid,
        setupObjects: (tm) => {
          const player = tm.getObjectManager().createPlayer({ row: 3, col: 3 }, "Player1");
          player.isInStartLevelSequence = false;
        },
        checkComplete: (tm) => {
          const player = tm.getObjectManager().getPlayer();
          return player?.gridPosition.row === 5 && player?.gridPosition.col === 3;
        },
        targetPosition: { row: 5, col: 3 },
      },
      // Phase 3: Tile Placement
      {
        instruction: getInstruction(3),
        setupGrid: createPhase3Grid,
        setupObjects: (tm) => {
          const player = tm.getObjectManager().createPlayer({ row: 3, col: 4 }, "Player1");
          player.isInStartLevelSequence = false;
          // Set a Cross tile as the current tile to push
          const state = tm.getState();
          state.currentTile = { type: TileType.CulDeSac, orientation: 0, decay: 0 };
          // Note: tile placement mode is set in setupPhase after startPlayerTurn
        },
        checkComplete: (tm) => {
          const player = tm.getObjectManager().getPlayer();
          return player?.gridPosition.row === 3 && player?.gridPosition.col === 6;
        },
        targetPosition: { row: 3, col: 6 },
        solutionPlot: { row: -1, col: 5, direction: Direction.South },
      },
      // Phase 4: Combat
      {
        instruction: getInstruction(4),
        setupGrid: createOpenGrid,
        setupObjects: (tm) => {
          const player = tm.getObjectManager().createPlayer({ row: 3, col: 1 }, "Player1");
          player.isInStartLevelSequence = false;
          const enemy = tm.getObjectManager().createEnemy({ row: 3, col: 5 }, "goblin");
          enemy.isInStartLevelSequence = false;
        },
        checkComplete: (_tm, state) => {
          return state.enemyDefeated;
        },
      },
      // Phase 5: Items & Inventory
      {
        instruction: getInstruction(5),
        setupGrid: createOpenGrid,
        setupObjects: (tm) => {
          const player = tm.getObjectManager().createPlayer({ row: 3, col: 1 }, "Player1");
          player.isInStartLevelSequence = false;
          if (player.currentHP !== undefined) {
            player.currentHP = 5; // Start with low HP
          }
          const enemy = tm.getObjectManager().createEnemy({ row: 3, col: 3 }, "goblin");
          enemy.isInStartLevelSequence = false;
          // Give items
          const state = tm.getState();
          state.inventory[0] = { definitionId: "spatula", remainingCharges: -1 };
          state.inventory[1] = { definitionId: "apple", remainingCharges: 1 };
        },
        checkComplete: (_tm, state) => {
          // Just need to defeat the enemy
          return state.enemyDefeated;
        },
      },
      // Phase 6: Decay & Repair
      {
        instruction: getInstruction(6),
        setupGrid: createDecayGrid,
        setupObjects: (tm) => {
          const player = tm.getObjectManager().createPlayer({ row: 5, col: 1 }, "Player1");
          player.isInStartLevelSequence = false;
          // Place 4 cement items around the level
          const objManager = tm.getObjectManager();
          const cement1 = objManager.createItem({ row: 3, col: 2 }, "cement");
          cement1.isInStartLevelSequence = false;
          const cement2 = objManager.createItem({ row: 3, col: 4 }, "cement");
          cement2.isInStartLevelSequence = false;
          const cement3 = objManager.createItem({ row: 1, col: 2 }, "cement");
          cement3.isInStartLevelSequence = false;
          const cement4 = objManager.createItem({ row: 2, col: 3 }, "cement");
          cement4.isInStartLevelSequence = false;
        },
        checkComplete: (tm) => {
          const player = tm.getObjectManager().getPlayer();
          return player?.gridPosition.row === 1 && player?.gridPosition.col === 5;
        },
        targetPosition: { row: 1, col: 5 },
      },
      // Phase 7: Wall Breaking
      {
        instruction: getInstruction(7),
        setupGrid: createWallGrid,
        setupObjects: (tm) => {
          const player = tm.getObjectManager().createPlayer({ row: 3, col: 1 }, "Player1");
          player.isInStartLevelSequence = false;
          // Add single pickaxe to inventory
          const state = tm.getState();
          state.inventory[0] = { definitionId: "pickaxe", remainingCharges: 18 };
        },
        checkComplete: (tm) => {
          const player = tm.getObjectManager().getPlayer();
          return player?.gridPosition.row === 3 && player?.gridPosition.col === 5;
        },
        targetPosition: { row: 3, col: 5 },
      },
      // Phase 8: Summary
      {
        instruction: getInstruction(8),
        setupGrid: createOpenGrid,
        setupObjects: (tm) => {
          const player = tm.getObjectManager().createPlayer({ row: 3, col: 1 }, "Player1");
          player.isInStartLevelSequence = false;
          tm.getObjectManager().createExit({ row: 3, col: 5 }, "Exit");
        },
        checkComplete: (tm) => {
          const player = tm.getObjectManager().getPlayer();
          const exit = tm.getObjectManager().getExit();
          if (player && exit &&
              player.gridPosition.row === exit.gridPosition.row &&
              player.gridPosition.col === exit.gridPosition.col) {
            // Player reached exit - start the game
            return true;
          }
          return false;
        },
        targetPosition: { row: 3, col: 5 },
      },
    ];

    // Setup phase
    function setupPhase(phaseNum: number): void {
      tutorialState.currentPhase = phaseNum;
      tutorialState.phaseComplete = false;
      tutorialState.targetReached = false;
      tutorialState.enemyDefeated = false;
      tutorialState.itemUsed = false;
      tutorialState.wallBroken = false;
      tutorialState.playerHealed = false;
      tutorialState.hasRotated = false;

      const phase = phases[phaseNum - 1];

      // Create new turn manager with the phase's grid
      turnManager = new TurnManager(() => {}, enemyDatabase, itemDatabase, () => {}, 1);
      const state = turnManager.getState();

      // Set the custom grid
      state.grid = phase.setupGrid();
      state.isInStartLevelSequence = false;
      state.isBossRoom = true; // Disable decay mechanics

      // Setup objects for this phase
      phase.setupObjects(turnManager);

      // Track initial HP for phase 5
      const player = turnManager.getObjectManager().getPlayer();
      if (player?.currentHP !== undefined) {
        tutorialState.initialHP = player.currentHP;
      }

      turnManager.startPlayerTurn();

      // Phase 3: Enter tile placement mode after startPlayerTurn (which resets phase)
      if (phaseNum === 3) {
        turnManager.enterTilePlacement();
      }
    }

    // Render function
    function render(): void {
      // Clear everything
      clearGrid();
      clearMapObjects();
      k.destroyAll("tutorialUI");
      k.destroyAll("targetMarker");
      k.destroyAll("reachableHighlight");
      k.destroyAll("contextMenu");
      k.destroyAll("contextMenuOption");

      const state = turnManager.getState();
      const phase = phases[tutorialState.currentPhase - 1];
      const player = turnManager.getObjectManager().getPlayer();

      // Draw grid
      drawGridWithOverlay(state.grid, state.selectedPlot, GRID_OFFSET_X, GRID_OFFSET_Y, GRID_ROWS, GRID_COLS, TILE_SIZE, 640, 360, false, new Set());
      drawDecayOverlay(state.grid, GRID_OFFSET_X, GRID_OFFSET_Y, TILE_SIZE, false, new Set());

      // Draw plots and current tile for tile placement mode
      if (tutorialState.currentPhase === 3 && phase.solutionPlot && turnManager.isTilePlacement()) {
        // Phase 3: Show only solution plot, or tile at plot if selected
        if (state.selectedPlot) {
          // Plot is selected - show the tile there (can be rotated)
          if (state.currentTile) {
            drawCurrentTile(state.currentTile, state.selectedPlot, GRID_OFFSET_X, GRID_OFFSET_Y, GRID_ROWS, GRID_COLS, TILE_SIZE);
          }
        } else {
          // No plot selected yet - show the plot arrow
          drawPlot(phase.solutionPlot, false, PlayerPhase.TilePlacement, GRID_OFFSET_X, GRID_OFFSET_Y, GRID_ROWS, GRID_COLS, TILE_SIZE);
        }
      } else if (state.playerPhase === PlayerPhase.TilePlacement) {
        const plots = getPlotPositions(GRID_ROWS, GRID_COLS);
        drawPlots(plots, state.selectedPlot, state.playerPhase, GRID_OFFSET_X, GRID_OFFSET_Y, GRID_ROWS, GRID_COLS, TILE_SIZE);
      }

      // Draw target marker (skip for phase 8 since it has a real exit object)
      if (phase.targetPosition && tutorialState.currentPhase < 8) {
        const targetX = GRID_OFFSET_X + phase.targetPosition.col * TILE_SIZE + TILE_SIZE / 2;
        const targetY = GRID_OFFSET_Y + phase.targetPosition.row * TILE_SIZE + TILE_SIZE / 2;

        // Golden highlight
        k.add([
          k.rect(TILE_SIZE - 4, TILE_SIZE - 4),
          k.pos(targetX, targetY),
          k.anchor("center"),
          k.color(255, 215, 0),
          k.opacity(0.4),
          k.z(1),
          "targetMarker",
        ]);

        // Exit sprite on top
        k.add([
          k.sprite("exit"),
          k.pos(targetX, targetY),
          k.anchor("center"),
          k.z(3),
          "targetMarker",
        ]);
      }

      // Draw reachable tiles
      if (player && state.playerPhase !== PlayerPhase.TilePlacement) {
        const moves = turnManager.getObjectManager().getAvailableMoves(player);
        const reachable = findReachableTiles(state.grid, player.gridPosition, moves, [], true);

        for (const tile of reachable) {
          if (tile.path.length <= 1) continue; // Skip current position
          const x = GRID_OFFSET_X + tile.position.col * TILE_SIZE + TILE_SIZE / 2;
          const y = GRID_OFFSET_Y + tile.position.row * TILE_SIZE + TILE_SIZE / 2;

          k.add([
            k.circle(6),
            k.pos(x, y),
            k.anchor("center"),
            k.color(100, 200, 255),
            k.opacity(0.6),
            k.z(2),
            "reachableHighlight",
          ]);
        }
      }

      // Draw map objects
      const mapObjects = turnManager.getMapObjects();
      drawMapObjects(mapObjects, GRID_OFFSET_X, GRID_OFFSET_Y, TILE_SIZE, false, new Set());

      // Draw tutorial header and instructions on the right side of the grid
      const instructionX = GRID_OFFSET_X + GRID_COLS * TILE_SIZE + 20;
      const headerY = GRID_OFFSET_Y + 10;

      // Tutorial header
      k.add([
        k.text(`Tutorial - Step ${tutorialState.currentPhase} of ${TOTAL_PHASES}`, { font: "saga", size: 16 }),
        k.pos(instructionX, headerY),
        k.color(255, 215, 0),
        k.z(101),
        "tutorialUI",
      ]);

      // Instructions below header
      const instructionLines = phase.instruction.split("\n");
      const instructionY = headerY + 30;

      instructionLines.forEach((line, i) => {
        k.add([
          k.text(line, { font: "saga", size: 14 }),
          k.pos(instructionX, instructionY + i * 20),
          k.color(255, 255, 255),
          k.z(101),
          "tutorialUI",
        ]);
      });

      // Draw inventory for phases 5+
      if (tutorialState.currentPhase >= 5 && tutorialState.currentPhase < 8) {
        const invX = GRID_OFFSET_X + GRID_COLS * TILE_SIZE + 20;
        let currentY = 200;

        // Draw equipped weapon for phases 5-7
        if (tutorialState.currentPhase >= 5) {
          k.add([
            k.text("Weapon:", { font: "saga", size: 14 }),
            k.pos(invX, currentY),
            k.color(255, 255, 255),
            k.z(101),
            "tutorialUI",
          ]);

          const mainHandItem = state.equipment?.[1]; // MainHand is index 1
          if (mainHandItem && mainHandItem.definitionId) {
            const weaponDef = itemDatabase.getItem(mainHandItem.definitionId);
            if (weaponDef) {
              k.add([
                k.sprite(weaponDef.sprite, { frame: weaponDef.frame }),
                k.pos(invX, currentY + 18),
                k.z(102),
                "tutorialUI",
              ]);
              k.add([
                k.text(weaponDef.name, { font: "saga", size: 12 }),
                k.pos(invX + 35, currentY + 22),
                k.color(200, 200, 200),
                k.z(101),
                "tutorialUI",
              ]);
            }
          } else {
            k.add([
              k.text("(none)", { font: "saga", size: 12 }),
              k.pos(invX, currentY + 22),
              k.color(150, 150, 150),
              k.z(101),
              "tutorialUI",
            ]);
          }
          currentY += 55;
        }

        k.add([
          k.text("Inventory:", { font: "saga", size: 14 }),
          k.pos(invX, currentY),
          k.color(255, 255, 255),
          k.z(101),
          "tutorialUI",
        ]);

        // Draw inventory items
        state.inventory.forEach((item, i) => {
          if (!item) return;
          const itemDef = itemDatabase.getItem(item.definitionId);
          if (!itemDef) return;

          const slotX = invX + (i % 3) * 35;
          const slotY = currentY + 20 + Math.floor(i / 3) * 35;

          k.add([
            k.sprite(itemDef.sprite, { frame: itemDef.frame }),
            k.pos(slotX, slotY),
            k.z(102),
            k.area(),
            "tutorialUI",
            "inventorySlot",
            { itemIndex: i },
          ]);
        });

        // Draw HP
        if (player?.currentHP !== undefined && player?.stats) {
          k.add([
            k.text(`HP: ${player.currentHP}/${player.stats.hp}`, { font: "saga", size: 14 }),
            k.pos(invX, currentY + 100),
            k.color(255, 100, 100),
            k.z(101),
            "tutorialUI",
          ]);
        }
      }

      // Draw context menu if visible
      drawContextMenu();
    }

    // Handle clicks
    async function handleClick(): Promise<void> {
      if (isAnimating) return;

      const pos = k.mousePos();
      const state = turnManager.getState();
      const player = turnManager.getObjectManager().getPlayer();
      const phase = phases[tutorialState.currentPhase - 1];

      // Phase 8: Player can move to reach the exit (no special handling needed)

      // Handle context menu clicks first
      if (contextMenu.visible) {
        const menuOptions = k.get("contextMenuOption");
        for (const option of menuOptions) {
          if ((option as any).hasPoint && (option as any).hasPoint(pos)) {
            const action = (option as any).action;
            handleContextMenuAction(action);
            return;
          }
        }
        // Click outside context menu - close it
        hideContextMenu();
        return;
      }

      // Check for inventory clicks (phases 5+)
      if (tutorialState.currentPhase >= 5) {
        const invSlots = k.get("inventorySlot");
        for (const slot of invSlots) {
          if ((slot as any).hasPoint && (slot as any).hasPoint(pos)) {
            // Phase 5: Left-click does nothing, must use right-click context menu
            if (tutorialState.currentPhase === 5) {
              return;
            }

            // Phase 6+: Direct item use
            const itemIndex = (slot as any).itemIndex;
            const item = state.inventory[itemIndex];
            if (!item) return;

            const itemDef = itemDatabase.getItem(item.definitionId);
            if (!itemDef) return;

            // Handle item use
            if (itemDef.type === "Equipment" && itemDef.slot) {
              equipItemFromInventory(state.inventory, state.equipment, itemIndex, itemDatabase);
              if (player) {
                applyEquipmentBonuses(player, state.equipment, itemDatabase);
              }
            } else if (itemDef.type === "Consumable") {
              if (itemDef.id === "apple" && player?.currentHP !== undefined && player?.stats) {
                player.currentHP = Math.min(player.currentHP + 5, player.stats.hp);
                tutorialState.playerHealed = true;
              } else if (itemDef.id === "cement" && player) {
                // Repair adjacent tiles
                const playerPos = player.gridPosition;
                const tilesToRepair = [
                  playerPos,
                  { row: playerPos.row - 1, col: playerPos.col },
                  { row: playerPos.row + 1, col: playerPos.col },
                  { row: playerPos.row, col: playerPos.col - 1 },
                  { row: playerPos.row, col: playerPos.col + 1 },
                ];
                for (const tilePos of tilesToRepair) {
                  if (tilePos.row >= 0 && tilePos.row < GRID_ROWS &&
                      tilePos.col >= 0 && tilePos.col < GRID_COLS) {
                    state.grid[tilePos.row][tilePos.col].decay = 0;
                  }
                }
                tutorialState.itemUsed = true;
              }
              item.remainingCharges--;
              if (item.remainingCharges <= 0) {
                state.inventory[itemIndex] = null;
              }
            }
            render();
            checkPhaseComplete();
            return;
          }
        }
      }

      // Handle phase 3 tile placement (only while in tile placement mode)
      if (tutorialState.currentPhase === 3 && phase.solutionPlot && turnManager.isTilePlacement()) {
        const plot = phase.solutionPlot;

        if (!state.selectedPlot) {
          // No plot selected yet - check if clicking on the solution plot
          const plotX = GRID_OFFSET_X + plot.col * TILE_SIZE + TILE_SIZE / 2;
          const plotY = GRID_OFFSET_Y - TILE_SIZE / 2; // Top row plot
          const dist = Math.sqrt((pos.x - plotX) ** 2 + (pos.y - plotY) ** 2);

          if (dist < TILE_SIZE / 2) {
            // Select the plot (place tile there)
            turnManager.selectPlot(plot);
            render();
            return;
          }
        } else {
          // Plot is selected - check for rotate or push
          const gridPos = screenToGrid(pos.x, pos.y);

          // Check if clicking on the current tile at the plot (to rotate)
          const currentTileObjs = k.get("currentTile");
          for (const tileObj of currentTileObjs) {
            if ((tileObj as any).hasPoint && (tileObj as any).hasPoint(pos)) {
              // Rotate the tile
              turnManager.rotateTile();
              render();
              return;
            }
          }

          // Check if clicking on a tile in the affected column (to push)
          if (gridPos && gridPos.col === plot.col) {
            // Click in affected column - execute push
            turnManager.executePush();
            render();
            checkPhaseComplete();
            return;
          }
        }

        // In phase 3 tile placement, ignore clicks elsewhere (don't cancel)
        return;
      }

      // Handle tile placement mode (other phases)
      if (state.playerPhase === PlayerPhase.TilePlacement) {
        const plots = getPlotPositions(GRID_ROWS, GRID_COLS);
        for (const plot of plots) {
          // Calculate plot screen position
          let plotX: number, plotY: number;
          if (plot.row === -1) {
            plotX = GRID_OFFSET_X + plot.col * TILE_SIZE + TILE_SIZE / 2;
            plotY = GRID_OFFSET_Y - TILE_SIZE / 2;
          } else if (plot.row === GRID_ROWS) {
            plotX = GRID_OFFSET_X + plot.col * TILE_SIZE + TILE_SIZE / 2;
            plotY = GRID_OFFSET_Y + GRID_ROWS * TILE_SIZE + TILE_SIZE / 2;
          } else if (plot.col === -1) {
            plotX = GRID_OFFSET_X - TILE_SIZE / 2;
            plotY = GRID_OFFSET_Y + plot.row * TILE_SIZE + TILE_SIZE / 2;
          } else {
            plotX = GRID_OFFSET_X + GRID_COLS * TILE_SIZE + TILE_SIZE / 2;
            plotY = GRID_OFFSET_Y + plot.row * TILE_SIZE + TILE_SIZE / 2;
          }

          const dist = Math.sqrt((pos.x - plotX) ** 2 + (pos.y - plotY) ** 2);
          if (dist < TILE_SIZE / 2) {
            turnManager.selectPlot(plot);
            if (state.selectedPlot) {
              turnManager.executePush();
            }
            render();
            return;
          }
        }

        // Cancel placement on click elsewhere
        turnManager.cancelPlacement();
        render();
        return;
      }

      // Handle rotation mode
      if (state.playerPhase === PlayerPhase.RotatingTile) {
        const gridPos = screenToGrid(pos.x, pos.y);
        if (gridPos && player &&
            gridPos.row === player.gridPosition.row &&
            gridPos.col === player.gridPosition.col) {
          turnManager.rotatePlayerTile();
          render();
          return;
        }
        // Confirm rotation on click elsewhere
        turnManager.confirmRotation();
        tutorialState.hasRotated = true;
        render();
        checkPhaseComplete();
        return;
      }

      // Check for grid clicks
      const gridPos = screenToGrid(pos.x, pos.y);
      if (!gridPos || !player) return;

      // Click on player = enter rotation mode (only phase 2, before first rotation)
      if (gridPos.row === player.gridPosition.row &&
          gridPos.col === player.gridPosition.col &&
          tutorialState.currentPhase === 2 &&
          !tutorialState.hasRotated) {
        turnManager.enterRotationMode();
        render();
        return;
      }

      // Check for wall bump (phase 7)
      if (tutorialState.currentPhase === 7) {
        const dRow = Math.abs(gridPos.row - player.gridPosition.row);
        const dCol = Math.abs(gridPos.col - player.gridPosition.col);
        const isAdjacent = (dRow === 1 && dCol === 0) || (dRow === 0 && dCol === 1);

        if (isAdjacent && isWallBlocking(state.grid, player.gridPosition, gridPos)) {
          // Check if pickaxe is equipped (MainHand is index 1)
          const mainHandItem = state.equipment?.[1];
          const hasPickaxe = mainHandItem?.definitionId === "pickaxe";

          if (!hasPickaxe) {
            // Show message that pickaxe is required
            const bumpX = GRID_OFFSET_X + gridPos.col * TILE_SIZE + TILE_SIZE / 2;
            const bumpY = GRID_OFFSET_Y + gridPos.row * TILE_SIZE + TILE_SIZE / 2;
            spawnScrollingText({
              text: "Equip pickaxe!",
              x: bumpX,
              y: bumpY,
              color: { r: 255, g: 100, b: 100 },
              fontSize: 12,
              behavior: "fade",
            });
            render();
            return;
          }

          // Check if bumping same wall or different wall
          const isSameTarget = state.wallBumpTarget &&
            state.wallBumpTarget.row === gridPos.row &&
            state.wallBumpTarget.col === gridPos.col;

          if (isSameTarget) {
            state.wallBumpCount++;
          } else {
            state.wallBumpCount = 1;
            state.wallBumpTarget = { ...gridPos };
          }

          // Show bump feedback
          const bumpX = GRID_OFFSET_X + gridPos.col * TILE_SIZE + TILE_SIZE / 2;
          const bumpY = GRID_OFFSET_Y + gridPos.row * TILE_SIZE + TILE_SIZE / 2;
          spawnScrollingText({
            text: `${state.wallBumpCount}/3`,
            x: bumpX,
            y: bumpY,
            color: { r: 255, g: 200, b: 100 },
            fontSize: 14,
            behavior: "static",
          });

          if (state.wallBumpCount >= 3) {
            openWall(state.grid, player.gridPosition, gridPos);
            state.wallBumpCount = 0;
            state.wallBumpTarget = null;
            tutorialState.wallBroken = true;
          }
          render();
          return;
        }
      }

      // Try to move
      const moves = turnManager.getObjectManager().getAvailableMoves(player);
      const enemyPositions = turnManager.getObjectManager().getEnemies().map(e => e.gridPosition);
      const reachable = findReachableTiles(state.grid, player.gridPosition, moves, enemyPositions, true);
      const target = reachable.find(
        (t) => t.position.row === gridPos.row && t.position.col === gridPos.col
      );

      // Also check if clicking on adjacent enemy (for combat)
      const enemies = turnManager.getObjectManager().getEnemies();
      const enemyAtTarget = enemies.find(
        (e) => e.gridPosition.row === gridPos.row && e.gridPosition.col === gridPos.col
      );

      // Handle combat with adjacent enemy
      if (enemyAtTarget) {
        const dRow = Math.abs(gridPos.row - player.gridPosition.row);
        const dCol = Math.abs(gridPos.col - player.gridPosition.col);
        const isAdjacent = (dRow === 1 && dCol === 0) || (dRow === 0 && dCol === 1);

        if (isAdjacent) {
          // Execute combat
          const result = executeCombat(player, enemyAtTarget);

          // Spawn SCT for damage on enemy
          const enemyX = GRID_OFFSET_X + enemyAtTarget.gridPosition.col * TILE_SIZE + TILE_SIZE / 2;
          const enemyY = GRID_OFFSET_Y + enemyAtTarget.gridPosition.row * TILE_SIZE + TILE_SIZE / 2;

          if (result.attackerAttack.hit) {
            const damageText = result.attackerAttack.critical
              ? `${result.attackerAttack.damage}!`
              : `${result.attackerAttack.damage}`;
            const damageColor = result.attackerAttack.critical
              ? { r: 255, g: 255, b: 100 }  // Yellow for crits
              : { r: 255, g: 100, b: 100 };  // Red for normal hits

            spawnScrollingText({
              text: damageText,
              x: enemyX,
              y: enemyY,
              color: damageColor,
              fontSize: result.attackerAttack.critical ? 24 : 16,
              behavior: result.attackerAttack.critical ? "bounce" : "static",
            });
          } else {
            spawnScrollingText({
              text: "MISS",
              x: enemyX,
              y: enemyY,
              color: { r: 150, g: 150, b: 150 },
              fontSize: 16,
              behavior: "fade",
            });
          }

          if (result.attackerAttack.defenderDied) {
            turnManager.getObjectManager().destroyObject(enemyAtTarget);
            tutorialState.enemyDefeated = true;
            // Move onto the tile after enemy dies
            player.gridPosition = { ...gridPos };
          }
          // Enemy turn after combat
          executeEnemyTurns();
          render();
          checkPhaseComplete();
          return;
        }
      }

      if (target && target.path.length > 1) {
        // Move player
        player.gridPosition = { ...gridPos };

        // Check for item pickup
        const itemsAtPosition = turnManager.getObjectManager().getAllObjects().filter(
          obj => obj.type === "Item" &&
                 obj.gridPosition.row === gridPos.row &&
                 obj.gridPosition.col === gridPos.col
        );
        for (const itemObj of itemsAtPosition) {
          // Add to inventory
          const emptySlot = state.inventory.findIndex(slot => slot === null);
          const itemId = (itemObj as any).itemId as string | undefined;
          if (emptySlot !== -1 && itemId) {
            const itemDef = itemDatabase.getItem(itemId);
            if (itemDef) {
              state.inventory[emptySlot] = {
                definitionId: itemId,
                remainingCharges: itemDef.charges ?? -1,
              };
              turnManager.getObjectManager().destroyObject(itemObj);
            }
          }
        }

        // Phase 6: Check for fall-through on dangerous tiles (decay >= 4)
        if (tutorialState.currentPhase === 6) {
          const currentTile = state.grid[gridPos.row][gridPos.col];
          if (currentTile.decay >= 4) {
            // Player fell through! Reset to phase 5
            spawnScrollingText({
              text: "FELL!",
              x: GRID_OFFSET_X + gridPos.col * TILE_SIZE + TILE_SIZE / 2,
              y: GRID_OFFSET_Y + gridPos.row * TILE_SIZE + TILE_SIZE / 2,
              color: { r: 255, g: 100, b: 100 },
              fontSize: 20,
              behavior: "bounce",
            });
            setupPhase(5);
            render();
            return;
          }
        }

        // Enemy turn after player moves
        executeEnemyTurns();
        render();
        checkPhaseComplete();
      }
    }

    // Execute enemy turns (simplified for tutorial)
    function executeEnemyTurns(): void {
      if (tutorialState.currentPhase < 4 || tutorialState.currentPhase >= 8) return;

      const enemies = turnManager.getObjectManager().getEnemies();
      const player = turnManager.getObjectManager().getPlayer();
      if (!player) return;

      const state = turnManager.getState();

      for (const enemy of enemies) {
        // Simple hunter AI: move 1 tile toward player
        const currentDist = Math.abs(enemy.gridPosition.row - player.gridPosition.row) +
                           Math.abs(enemy.gridPosition.col - player.gridPosition.col);

        // Try each adjacent direction and pick the one that gets closer
        const directions = [
          { row: -1, col: 0 },  // North
          { row: 1, col: 0 },   // South
          { row: 0, col: -1 },  // West
          { row: 0, col: 1 },   // East
        ];

        let bestMove = null;
        let bestDist = currentDist;

        for (const dir of directions) {
          const newRow = enemy.gridPosition.row + dir.row;
          const newCol = enemy.gridPosition.col + dir.col;

          // Check bounds
          if (newRow < 0 || newRow >= GRID_ROWS || newCol < 0 || newCol >= GRID_COLS) continue;

          // Check if tile is passable (simplified: just check it's not the player's tile)
          if (newRow === player.gridPosition.row && newCol === player.gridPosition.col) continue;

          // Check tile connectivity
          const fromTile = state.grid[enemy.gridPosition.row][enemy.gridPosition.col];
          const toTile = state.grid[newRow][newCol];
          if (!tilesConnect(fromTile, toTile, dir)) continue;

          const newDist = Math.abs(newRow - player.gridPosition.row) +
                         Math.abs(newCol - player.gridPosition.col);

          if (newDist < bestDist) {
            bestDist = newDist;
            bestMove = { row: newRow, col: newCol };
          }
        }

        if (bestMove) {
          enemy.gridPosition = { ...bestMove };
        }
      }
    }

    // Check if two tiles connect in a given direction
    function tilesConnect(from: TileInstance, to: TileInstance, dir: { row: number; col: number }): boolean {
      const fromEdges = getTileEdges(from);
      const toEdges = getTileEdges(to);

      if (dir.row === -1) return fromEdges.north && toEdges.south;      // Moving north
      if (dir.row === 1) return fromEdges.south && toEdges.north;       // Moving south
      if (dir.col === -1) return fromEdges.west && toEdges.east;        // Moving west
      if (dir.col === 1) return fromEdges.east && toEdges.west;         // Moving east
      return false;
    }

    // Get the open edges of a tile based on type and orientation
    function getTileEdges(tile: TileInstance): { north: boolean; east: boolean; south: boolean; west: boolean } {
      const baseEdges: Record<string, boolean[]> = {
        [TileType.CulDeSac]: [true, false, false, false],   // N
        [TileType.Straight]: [true, false, true, false],    // N, S
        [TileType.L]: [true, true, false, false],           // N, E
        [TileType.T]: [true, true, false, true],            // N, E, W
        [TileType.Cross]: [true, true, true, true],         // All
      };

      const edges = baseEdges[tile.type] || [false, false, false, false];
      // Rotate edges based on orientation (clockwise)
      const rotated = [...edges];
      for (let i = 0; i < tile.orientation; i++) {
        const last = rotated.pop()!;
        rotated.unshift(last);
      }

      return { north: rotated[0], east: rotated[1], south: rotated[2], west: rotated[3] };
    }

    // Check if phase is complete
    function checkPhaseComplete(): void {
      const phase = phases[tutorialState.currentPhase - 1];
      if (phase.checkComplete(turnManager, tutorialState)) {
        // Phase 8 completion starts the game
        if (tutorialState.currentPhase === TOTAL_PHASES) {
          resetGlobalLevel();
          k.go("main");
          return;
        }
        // Advance to next phase
        if (tutorialState.currentPhase < TOTAL_PHASES) {
          tutorialState.currentPhase++;
          setupPhase(tutorialState.currentPhase);
        }
        render();
      }
    }

    // Handle right-click
    function handleRightClick(): void {
      if (tutorialState.currentPhase >= 5 && tutorialState.currentPhase < 8) {
        const pos = k.mousePos();

        // Close context menu if visible
        if (contextMenu.visible) {
          hideContextMenu();
          return;
        }

        // Check for right-click on inventory item
        const invSlots = k.get("inventorySlot");
        for (const slot of invSlots) {
          if ((slot as any).hasPoint && (slot as any).hasPoint(pos)) {
            const itemIndex = (slot as any).itemIndex;
            showContextMenu(pos.x, pos.y, itemIndex);
            return;
          }
        }
      }
    }

    // Show context menu for inventory item
    function showContextMenu(x: number, y: number, inventoryIndex: number): void {
      const state = turnManager.getState();
      const item = state.inventory[inventoryIndex];
      if (!item) return;

      const itemDef = itemDatabase.getItem(item.definitionId);
      if (!itemDef) return;

      // Build menu options based on item type
      const options: { label: string; action: string }[] = [];

      if (itemDef.type === "Consumable") {
        options.push({ label: "Use", action: "use" });
      } else if (itemDef.type === "Equipment" && itemDef.slot) {
        options.push({ label: "Equip", action: "equip" });
      }

      options.push({ label: "Drop", action: "drop" });

      contextMenu.visible = true;
      contextMenu.x = x;
      contextMenu.y = y;
      contextMenu.inventoryIndex = inventoryIndex;
      contextMenu.options = options;

      render();
    }

    // Hide context menu
    function hideContextMenu(): void {
      if (contextMenu.visible) {
        contextMenu.visible = false;
        render();
      }
    }

    // Draw context menu
    function drawContextMenu(): void {
      if (!contextMenu.visible) return;

      const menuWidth = 50;
      const optionHeight = 16;
      const padding = 6;
      const menuHeight = contextMenu.options.length * optionHeight + padding * 2;
      const mousePos = k.mousePos();

      // Draw background bubble
      k.add([
        k.sprite("bubble", { width: menuWidth, height: menuHeight }),
        k.pos(contextMenu.x, contextMenu.y),
        k.z(200),
        k.area(),
        "contextMenu",
      ]);

      // Draw menu options
      contextMenu.options.forEach((option, index) => {
        const optionX = contextMenu.x + padding;
        const optionY = contextMenu.y + padding + index * optionHeight;
        const optionWidth = menuWidth - padding * 2;

        // Check if mouse is hovering over this option
        const isHovered = mousePos.x >= optionX && mousePos.x <= optionX + optionWidth &&
                          mousePos.y >= optionY && mousePos.y <= optionY + optionHeight;

        // Option background (for click detection)
        k.add([
          k.rect(optionWidth, optionHeight),
          k.pos(optionX, optionY),
          k.color(0, 0, 0),
          k.opacity(0),
          k.area(),
          k.z(201),
          "contextMenuOption",
          { optionIndex: index, action: option.action },
        ]);

        // Option text - white when hovered, dark brown otherwise
        const textColor = isHovered ? { r: 255, g: 255, b: 255 } : { r: 72, g: 59, b: 58 };
        k.add([
          k.text(option.label, { font: "saga", size: 12 }),
          k.pos(optionX + 2, optionY + 2),
          k.color(textColor.r, textColor.g, textColor.b),
          k.z(202),
          "contextMenu",
        ]);
      });
    }

    // Handle context menu action
    function handleContextMenuAction(action: string): void {
      const state = turnManager.getState();
      const item = state.inventory[contextMenu.inventoryIndex];
      const player = turnManager.getObjectManager().getPlayer();

      if (!item) {
        hideContextMenu();
        return;
      }

      const itemDef = itemDatabase.getItem(item.definitionId);

      if (action === "drop") {
        state.inventory[contextMenu.inventoryIndex] = null;
        hideContextMenu();
        return;
      }

      if (action === "use" && itemDef?.type === "Consumable") {
        if (itemDef.id === "apple" && player?.currentHP !== undefined && player?.stats) {
          player.currentHP = Math.min(player.currentHP + 5, player.stats.hp);
          tutorialState.playerHealed = true;
        } else if (itemDef.id === "cement" && player) {
          // Repair adjacent tiles
          const playerPos = player.gridPosition;
          const tilesToRepair = [
            playerPos,
            { row: playerPos.row - 1, col: playerPos.col },
            { row: playerPos.row + 1, col: playerPos.col },
            { row: playerPos.row, col: playerPos.col - 1 },
            { row: playerPos.row, col: playerPos.col + 1 },
          ];
          for (const tilePos of tilesToRepair) {
            if (tilePos.row >= 0 && tilePos.row < GRID_ROWS &&
                tilePos.col >= 0 && tilePos.col < GRID_COLS) {
              state.grid[tilePos.row][tilePos.col].decay = 0;
            }
          }
          tutorialState.itemUsed = true;
        }
        item.remainingCharges--;
        if (item.remainingCharges <= 0) {
          state.inventory[contextMenu.inventoryIndex] = null;
        }
        hideContextMenu();
        checkPhaseComplete();
        return;
      }

      if (action === "equip" && itemDef?.type === "Equipment" && itemDef.slot) {
        equipItemFromInventory(state.inventory, state.equipment, contextMenu.inventoryIndex, itemDatabase);
        if (player) {
          applyEquipmentBonuses(player, state.equipment, itemDatabase);
        }
        hideContextMenu();
        checkPhaseComplete();
        return;
      }

      hideContextMenu();
    }

    // Handle space key for tile placement
    function handleSpace(): void {
      if (tutorialState.currentPhase === 3 || tutorialState.currentPhase >= 6) {
        const state = turnManager.getState();
        if (state.playerPhase === PlayerPhase.AwaitingAction && state.currentTile) {
          turnManager.enterTilePlacement();
          render();
        }
      }
    }

    // Handle mouse move for cursor updates
    function handleMouseMove(): void {
      // Re-render when context menu is visible to update hover highlighting
      if (contextMenu.visible) {
        render();
        return;
      }

      if (tutorialState.currentPhase <= 8) {
        cursorManager.update(turnManager);

        // Override rotate cursor if rotation not allowed in current phase
        // Only phase 2 allows rotation (before first rotation)
        const canRotate = tutorialState.currentPhase === 2 && !tutorialState.hasRotated;

        if (!canRotate) {
          // Check if cursor is currently rotate and reset to default
          const currentCursor = k.canvas.style.cursor;
          if (currentCursor.includes("rotate")) {
            k.canvas.style.cursor = "url('/cursors/pointer_a.png'), auto";
          }
        }
      }
    }

    // Initialize
    setupPhase(1);
    render();

    // Event handlers
    k.onMousePress("left", handleClick);
    k.onMousePress("right", handleRightClick);
    k.onMouseMove(handleMouseMove);
    k.onKeyPress("space", handleSpace);
    k.onKeyPress("escape", () => k.go("title"));
  });
}
