import { k } from "../../kaplayCtx";
import { type TileInstance, type MapObject, type GameState, TileType, Direction } from "../types";
import { TileFrames } from "../assets";
import { INVENTORY } from "../config";

function getTileFrame(type: TileType, direction: Direction): number {
  // Get base column for tile type
  let column: number;
  switch (type) {
    case TileType.CulDeSac: column = TileFrames.CulDeSac; break;
    case TileType.Straight: column = TileFrames.Straight; break;
    case TileType.L: column = TileFrames.L; break;
    case TileType.T: column = TileFrames.T; break;
    case TileType.Cross: column = TileFrames.Cross; break;
  }

  // Calculate frame: row (direction) * 6 + column (type)
  return direction * 6 + column;
}

/**
 * Draws player stats in the UI
 * @param player The player object with stats
 * @param x X coordinate for stats display
 * @param y Y coordinate for stats display
 */
export function drawPlayerStats(player: MapObject, x: number, y: number): void {
  if (!player.stats || player.currentHP === undefined) return;

  const lineHeight = 16;

  // Display HP with current/max format
  k.add([
    k.text(`HP: ${player.currentHP}/${player.stats.hp}`, { font: "saga", size: 16 }),
    k.pos(x, y),
    k.color(255, 100, 100),
    "playerStats",
  ]);

  // Display ATK
  k.add([
    k.text(`ATK: ${player.stats.atk}`, { font: "saga", size: 16 }),
    k.pos(x, y + lineHeight),
    k.color(255, 200, 100),
    "playerStats",
  ]);

  // Display DEF
  k.add([
    k.text(`DEF: ${player.stats.def}`, { font: "saga", size: 16 }),
    k.pos(x, y + lineHeight * 2),
    k.color(100, 200, 255),
    "playerStats",
  ]);

  // Display AGI
  k.add([
    k.text(`AGI: ${player.stats.agi}`, { font: "saga", size: 16 }),
    k.pos(x, y + lineHeight * 3),
    k.color(100, 255, 100),
    "playerStats",
  ]);
}

/**
 * Draws the skip turn button
 * @param x X coordinate for button center
 * @param y Y coordinate for button center
 */
export function drawSkipButton(x: number, y: number): void {
  k.add([
    k.sprite("skip_button"),
    k.pos(x, y),
    k.anchor("center"),
    k.area(),
    k.z(100),
    "skipButton",
  ]);
}

/**
 * Draws the preview tile with label
 * @param tile The tile to preview
 * @param x X coordinate for tile center
 * @param y Y coordinate for tile center
 */
export function drawPreviewTile(
  tile: TileInstance,
  x: number,
  y: number
): ReturnType<typeof k.add> {
  k.add([
    k.text("next tile", { font: "3x5", size: 12 }),
    k.pos(x, y - 40),
    k.color(200, 200, 200),
    "previewLabel",
  ]);

  const frame = getTileFrame(tile.type, tile.orientation);

  const tileObj = k.add([
    k.sprite("tiles", { frame }),
    k.pos(x, y),
    k.anchor("center"),
    k.scale(1.5),
    k.area(),
    "previewTile",
  ]);

  return tileObj;
}

/**
 * Draws debug object count in bottom left corner
 */
export function drawDebugInfo(): void {
  const objCount = k.debug.numObjects();
  k.add([
    k.text(`Objects: ${objCount}`, { font: "3x5", size: 10 }),
    k.pos(10, 350),
    k.color(150, 150, 150),
    k.z(2000),
    "debugInfo",
  ]);
}

/**
 * Draws state machine information at the bottom center of the canvas
 */
export function drawStateMachineInfo(state: GameState, player: MapObject | null): void {
  const lines: string[] = [];

  // Turn owner and phase
  lines.push(`Turn: ${state.turnOwner} | Phase: ${state.playerPhase}`);

  // Player moves
  if (player) {
    lines.push(`Moves: ${player.movesRemaining}`);
  }

  // Wall bump info
  if (state.wallBumpCount > 0) {
    const target = state.wallBumpTarget ? `(${state.wallBumpTarget.row},${state.wallBumpTarget.col})` : "none";
    lines.push(`Wall Bumps: ${state.wallBumpCount}/3 Target: ${target}`);
  }

  // Animation state (from external)
  // We'll pass this as a parameter

  const text = lines.join(" | ");
  const textObj = k.make([
    k.text(text, { font: "3x5", size: 10 }),
    k.color(200, 200, 100),
  ]);

  const textWidth = textObj.width;

  k.add([
    k.text(text, { font: "3x5", size: 10 }),
    k.pos(320 - textWidth / 2, 350),
    k.color(200, 200, 100),
    k.z(2000),
    "stateMachineInfo",
  ]);
}

/**
 * Calculates the position of an inventory slot
 * @param inventoryX X coordinate of inventory top-left
 * @param inventoryY Y coordinate of inventory top-left
 * @param slotCol Slot column index (0-based)
 * @param slotRow Slot row index (0-based)
 * @param padding Border padding (e.g., 9-patch border size)
 * @returns Object with x and y coordinates for the slot
 */
export function slotPos(
  inventoryX: number,
  inventoryY: number,
  slotCol: number,
  slotRow: number,
  padding: number = 8
): { x: number; y: number } {
  return {
    x: inventoryX + slotCol * (INVENTORY.SLOT_SIZE + INVENTORY.SLOT_SPACING) + padding,
    y: inventoryY + slotRow * (INVENTORY.SLOT_SIZE + INVENTORY.SLOT_SPACING) + padding,
  };
}

/**
 * Draws the inventory background sprite
 * @param x X coordinate for inventory center
 * @param y Y coordinate for inventory center
 */
export function drawInventoryBackground(x: number, y: number): void {
  const pathsize = 8
  const width = INVENTORY.SLOTS_X * (INVENTORY.SLOT_SIZE + INVENTORY.SLOT_SPACING) - INVENTORY.SLOT_SPACING + 2 * pathsize
  const height = INVENTORY.SLOTS_Y * (INVENTORY.SLOT_SIZE + INVENTORY.SLOT_SPACING) - INVENTORY.SLOT_SPACING + 2 * pathsize
  k.add([
    k.sprite("9patch", {
      width: width,
      height: height,
    }),
    k.pos(x, y),
    "inventoryBackground",
  ]);

  for (let i = 0; i < INVENTORY.SLOTS_X; i++) {
    for (let j = 0; j < INVENTORY.SLOTS_Y; j++) {
      const pos = slotPos(x, y, i, j, pathsize);
      k.add([
        k.sprite("inventoryslot"),
        k.pos(pos.x, pos.y),
        "inventorySlot",
      ]);
    }
  }
}

/**
 * Clears all UI elements
 */
export function clearUI(): void {
  k.destroyAll("playerStats");
  k.destroyAll("skipButton");
  k.destroyAll("previewTile");
  k.destroyAll("previewLabel");
  k.destroyAll("debugInfo");
  k.destroyAll("stateMachineInfo");
  k.destroyAll("inventoryBackground");
  k.destroyAll("inventorySlot");
  k.destroyAll("sagaText");
}
