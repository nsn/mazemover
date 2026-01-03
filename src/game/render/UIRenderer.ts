import { k } from "../../kaplayCtx";
import { type TileInstance, type MapObject, TileType, Direction } from "../types";
import { TileFrames } from "../assets";

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

  const lineHeight = 8;

  // Display player name
  k.add([
    k.text(player.name, { font: "3x5", size: 12 }),
    k.pos(x, y),
    k.color(255, 255, 255),
    "playerStats",
  ]);

  // Display HP with current/max format
  k.add([
    k.text(`HP: ${player.currentHP}/${player.stats.hp}`, { font: "3x5", size: 12 }),
    k.pos(x, y + lineHeight),
    k.color(255, 100, 100),
    "playerStats",
  ]);

  // Display ATK
  k.add([
    k.text(`ATK: ${player.stats.atk}`, { font: "3x5", size: 12 }),
    k.pos(x, y + lineHeight * 2),
    k.color(255, 200, 100),
    "playerStats",
  ]);

  // Display DEF
  k.add([
    k.text(`DEF: ${player.stats.def}`, { font: "3x5", size: 12 }),
    k.pos(x, y + lineHeight * 3),
    k.color(100, 200, 255),
    "playerStats",
  ]);

  // Display AGI
  k.add([
    k.text(`AGI: ${player.stats.agi}`, { font: "3x5", size: 12 }),
    k.pos(x, y + lineHeight * 4),
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
 * @param labelText Optional label text to display above the tile
 */
export function drawPreviewTile(
  tile: TileInstance,
  x: number,
  y: number,
  labelText?: string
): ReturnType<typeof k.add> {
  if (labelText) {
    k.add([
      k.text(labelText, { font: "3x5", size: 12 }),
      k.pos(x, y - 40),
      k.color(200, 200, 200),
      "previewLabel",
    ]);
  }

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
 * Clears all UI elements
 */
export function clearUI(): void {
  k.destroyAll("playerStats");
  k.destroyAll("skipButton");
  k.destroyAll("previewTile");
  k.destroyAll("previewLabel");
  k.destroyAll("debugInfo");
}
