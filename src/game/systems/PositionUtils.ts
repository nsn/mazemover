import { TILE_SIZE, GRID_OFFSET_X, GRID_OFFSET_Y, GRID_ROWS, GRID_COLS, INVENTORY, EQUIPMENT, UI } from "../config";
import { type GridPosition, type PlotPosition, Direction } from "../types";
import { type TurnManager } from "./TurnManager";
import { inventorySlotPos, equipmentSlotPos, getEquipmentSlotGridPos } from "../render/UIRenderer";

/**
 * Converts screen coordinates to grid position
 * Returns null if outside grid bounds
 */
export function screenToGrid(screenX: number, screenY: number): GridPosition | null {
  const col = Math.floor((screenX - GRID_OFFSET_X) / TILE_SIZE);
  const row = Math.floor((screenY - GRID_OFFSET_Y) / TILE_SIZE);

  if (row >= 0 && row < GRID_ROWS && col >= 0 && col < GRID_COLS) {
    return { row, col };
  }
  return null;
}

/**
 * Checks if mouse is hovering over a plot
 * Returns the plot if hovering, null otherwise
 */
export function getPlotAtPosition(mouseX: number, mouseY: number, plots: PlotPosition[]): PlotPosition | null {
  const gridPos = screenToGrid(mouseX, mouseY);
  if (!gridPos) return null;

  // Check if mouse is near an edge of the tile to determine plot direction
  const localX = (mouseX - GRID_OFFSET_X) % TILE_SIZE;
  const localY = (mouseY - GRID_OFFSET_Y) % TILE_SIZE;

  const edgeThreshold = TILE_SIZE * 0.3; // 30% of tile size

  let direction: Direction | null = null;
  if (localY < edgeThreshold) direction = Direction.North;
  else if (localY > TILE_SIZE - edgeThreshold) direction = Direction.South;
  else if (localX < edgeThreshold) direction = Direction.West;
  else if (localX > TILE_SIZE - edgeThreshold) direction = Direction.East;

  if (direction === null) return null;

  // Find matching plot
  return plots.find(p =>
    p.row === gridPos.row &&
    p.col === gridPos.col &&
    p.direction === direction
  ) || null;
}

/**
 * Checks if mouse is hovering over an enemy
 * Returns the enemy if hovering, null otherwise
 */
export function getEnemyAtPosition(mouseX: number, mouseY: number, turnManager: TurnManager): any | null {
  const gridPos = screenToGrid(mouseX, mouseY);
  if (!gridPos) return null;

  const enemies = turnManager.getObjectManager().getEnemies();
  return enemies.find(e =>
    e.gridPosition.row === gridPos.row &&
    e.gridPosition.col === gridPos.col
  ) || null;
}

/**
 * Checks if mouse is hovering over the player
 */
export function isMouseOverPlayer(mouseX: number, mouseY: number, turnManager: TurnManager): boolean {
  const gridPos = screenToGrid(mouseX, mouseY);
  if (!gridPos) return false;

  const player = turnManager.getObjectManager().getPlayer();
  if (!player) return false;

  return player.gridPosition.row === gridPos.row &&
         player.gridPosition.col === gridPos.col;
}

/**
 * Checks if mouse is hovering over an inventory item
 * Returns the item instance if hovering, null otherwise
 */
export function getInventoryItemAtPosition(mouseX: number, mouseY: number, turnManager: TurnManager): { item: any, index: number } | null {
  const state = turnManager.getState();

  // Calculate inventory base position (same as in render function)
  const headerHeight = 16;
  const spacing = 8;
  const equipmentHeight = EQUIPMENT.SLOTS_Y * (EQUIPMENT.SLOT_SIZE + EQUIPMENT.SLOT_SPACING) - EQUIPMENT.SLOT_SPACING;
  const inventoryHeaderY = UI.Y + UI.PADDING + headerHeight + equipmentHeight + spacing;
  const inventorySlotsX = UI.X + UI.PADDING;
  const inventorySlotsY = inventoryHeaderY + headerHeight;

  for (let i = 0; i < state.inventory.length; i++) {
    const item = state.inventory[i];
    if (!item) continue;

    const col = i % INVENTORY.SLOTS_X;
    const row = Math.floor(i / INVENTORY.SLOTS_X);
    const pos = inventorySlotPos(col, row, inventorySlotsX, inventorySlotsY);

    if (mouseX >= pos.x && mouseX <= pos.x + INVENTORY.SLOT_SIZE &&
        mouseY >= pos.y && mouseY <= pos.y + INVENTORY.SLOT_SIZE) {
      return { item, index: i };
    }
  }
  return null;
}

/**
 * Get the equipment slot index at the mouse position (regardless of whether there's an item)
 */
export function getEquipmentSlotAtPosition(mouseX: number, mouseY: number): number | null {
  // Calculate equipment base position (same as in render function)
  const headerHeight = 16;
  const equipmentSlotsX = UI.X + UI.PADDING;
  const equipmentSlotsY = UI.Y + UI.PADDING + headerHeight;

  for (let i = 0; i < 5; i++) {
    const gridPos = getEquipmentSlotGridPos(i);
    if (!gridPos) continue;

    const pos = equipmentSlotPos(gridPos.col, gridPos.row, equipmentSlotsX, equipmentSlotsY);

    if (mouseX >= pos.x && mouseX <= pos.x + EQUIPMENT.SLOT_SIZE &&
        mouseY >= pos.y && mouseY <= pos.y + EQUIPMENT.SLOT_SIZE) {
      return i;
    }
  }
  return null;
}

/**
 * Checks if mouse is hovering over an equipment item
 * Returns the item instance if hovering, null otherwise
 */
export function getEquipmentItemAtPosition(mouseX: number, mouseY: number, turnManager: TurnManager): { item: any, index: number } | null {
  const state = turnManager.getState();

  // Calculate equipment base position (same as in render function)
  const headerHeight = 16;
  const equipmentSlotsX = UI.X + UI.PADDING;
  const equipmentSlotsY = UI.Y + UI.PADDING + headerHeight;

  for (let i = 0; i < state.equipment.length; i++) {
    const item = state.equipment[i];
    if (!item) continue;

    const gridPos = getEquipmentSlotGridPos(i);
    if (!gridPos) continue;

    const pos = equipmentSlotPos(gridPos.col, gridPos.row, equipmentSlotsX, equipmentSlotsY);

    if (mouseX >= pos.x && mouseX <= pos.x + EQUIPMENT.SLOT_SIZE &&
        mouseY >= pos.y && mouseY <= pos.y + EQUIPMENT.SLOT_SIZE) {
      return { item, index: i };
    }
  }
  return null;
}

/**
 * Checks if mouse is over the preview tile (for rotation)
 */
export function isMouseOverPreviewTile(mouseX: number, mouseY: number, previewX: number, previewY: number): boolean {
  const previewSize = TILE_SIZE * 1.5; // Preview is scaled 1.5x
  return mouseX >= previewX - previewSize / 2 &&
         mouseX <= previewX + previewSize / 2 &&
         mouseY >= previewY - previewSize / 2 &&
         mouseY <= previewY + previewSize / 2;
}
