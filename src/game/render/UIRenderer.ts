import { k } from "../../kaplayCtx";
import { type TileInstance, type MapObject, type GameState, TileType, Direction, type ItemInstance, type ItemDefinition } from "../types";
import { TileFrames, BrickFrames } from "../assets";
import { INVENTORY, EQUIPMENT, DESCRIPTION } from "../config";
import { type ItemDatabase } from "../systems/ItemDatabase";

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

  // Draw brick background (center frame)
  k.add([
    k.sprite("bricks", { frame: BrickFrames.C }),
    k.pos(x, y),
    k.anchor("center"),
    k.scale(1.5),
    k.z(-1),
    "previewTile",
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
 * Draws the current dungeon level display
 * @param currentLevel The current level (counts down from STARTING_LEVEL to 0)
 */
export function drawLevelInfo(currentLevel: number): void {
  k.add([
    k.text(`Level: ${currentLevel}`, { font: "saga", size: 16 }),
    k.pos(10, 10),
    k.color(255, 255, 255),
    k.z(2000),
    "levelInfo",
  ]);
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
 * @param slotCol Slot column index (0-based)
 * @param slotRow Slot row index (0-based)
 * @param padding Border padding (defaults to PATCH_SIZE)
 * @returns Object with x and y coordinates for the slot
 */
export function inventorySlotPos(
  slotCol: number,
  slotRow: number,
  padding: number = INVENTORY.PATCH_SIZE
): { x: number; y: number } {
  return {
    x: INVENTORY.X + slotCol * (INVENTORY.SLOT_SIZE + INVENTORY.SLOT_SPACING) + padding,
    y: INVENTORY.Y + slotRow * (INVENTORY.SLOT_SIZE + INVENTORY.SLOT_SPACING) + padding,
  };
}

/**
 * Calculates the position of an equipment slot
 * @param slotCol Slot column index (0-based)
 * @param slotRow Slot row index (0-based)
 * @param padding Border padding (defaults to PATCH_SIZE)
 * @returns Object with x and y coordinates for the slot
 */
export function equipmentSlotPos(
  slotCol: number,
  slotRow: number,
  padding: number = EQUIPMENT.PATCH_SIZE
): { x: number; y: number } {
  return {
    x: EQUIPMENT.X + slotCol * (EQUIPMENT.SLOT_SIZE + EQUIPMENT.SLOT_SPACING) + padding,
    y: EQUIPMENT.Y + slotRow * (EQUIPMENT.SLOT_SIZE + EQUIPMENT.SLOT_SPACING) + padding,
  };
}

/**
 * Draws the inventory background sprite
 */
export function drawInventoryBackground(): void {
  const width = INVENTORY.SLOTS_X * (INVENTORY.SLOT_SIZE + INVENTORY.SLOT_SPACING) - INVENTORY.SLOT_SPACING + 2 * INVENTORY.PATCH_SIZE
  const height = INVENTORY.SLOTS_Y * (INVENTORY.SLOT_SIZE + INVENTORY.SLOT_SPACING) - INVENTORY.SLOT_SPACING + 2 * INVENTORY.PATCH_SIZE
  k.add([
    k.sprite("9patch", {
      width: width,
      height: height,
    }),
    k.pos(INVENTORY.X, INVENTORY.Y),
    "inventoryBackground",
  ]);

  for (let i = 0; i < INVENTORY.SLOTS_X; i++) {
    for (let j = 0; j < INVENTORY.SLOTS_Y; j++) {
      const pos = inventorySlotPos(i, j, INVENTORY.PATCH_SIZE);
      k.add([
        k.sprite("inventoryslot"),
        k.pos(pos.x, pos.y),
        "inventorySlot",
      ]);
    }
  }
}

/**
 * Maps equipment slot index to grid position in cross layout
 * Layout:
 *   . H .     (. = empty, H = Head)
 *   L T R     (L = LeftHand, T = Torso, R = RightHand)
 *   . G .     (G = leGs/Legs)
 * @param slotIndex Equipment slot index (0-4)
 * @returns Object with col and row for the grid position, or null if invalid
 */
export function getEquipmentSlotGridPos(slotIndex: number): { col: number; row: number } | null {
  switch (slotIndex) {
    case 0: return { col: 1, row: 0 }; // Head - top center
    case 1: return { col: 0, row: 1 }; // LeftHand - middle left
    case 2: return { col: 2, row: 1 }; // RightHand - middle right
    case 3: return { col: 1, row: 2 }; // Legs - bottom center
    case 4: return { col: 1, row: 1 }; // Torso - middle center
    default: return null;
  }
}

/**
 * Draws the equipment background sprite
 */
export function drawEquipmentBackground(): void {
  const width = EQUIPMENT.SLOTS_X * (EQUIPMENT.SLOT_SIZE + EQUIPMENT.SLOT_SPACING) - EQUIPMENT.SLOT_SPACING + 2 * EQUIPMENT.PATCH_SIZE
  const height = EQUIPMENT.SLOTS_Y * (EQUIPMENT.SLOT_SIZE + EQUIPMENT.SLOT_SPACING) - EQUIPMENT.SLOT_SPACING + 2 * EQUIPMENT.PATCH_SIZE
  k.add([
    k.sprite("9patch", {
      width: width,
      height: height,
    }),
    k.pos(EQUIPMENT.X, EQUIPMENT.Y),
    "equipmentBackground",
  ]);

  // Draw only the 5 equipment slots in cross pattern (default state)
  drawEquipmentSlots([]);
}

/**
 * Draws equipment slots with optional highlighting
 * @param highlightedSlots Array of slot indices to highlight (frame 1)
 * @param equipment Current equipment array to check for multi-slot items
 * @param itemDatabase ItemDatabase to look up item definitions
 */
export function drawEquipmentSlots(
  highlightedSlots: number[],
  equipment?: (ItemInstance | null)[],
  itemDatabase?: ItemDatabase
): void {
  // Clear existing slots
  k.destroyAll("equipmentSlot");

  // Draw the 5 equipment slots in cross pattern
  for (let slotIndex = 0; slotIndex < 5; slotIndex++) {
    const gridPos = getEquipmentSlotGridPos(slotIndex);
    if (!gridPos) continue;

    const pos = equipmentSlotPos(gridPos.col, gridPos.row, EQUIPMENT.PATCH_SIZE);
    const isHighlighted = highlightedSlots.includes(slotIndex);

    let frame = 0; // Frame 0 = default
    if (isHighlighted) {
      frame = 1; // Frame 1 = highlighted
    }

    // Check if this slot is occupied by a multi-slot item and is NOT the first slot
    if (equipment && itemDatabase) {
      const item = equipment[slotIndex];
      if (item) {
        const itemDef = itemDatabase.getItem(item.definitionId);
        if (itemDef && itemDef.slot && Array.isArray(itemDef.slot)) {
          // This is a multi-slot item
          const occupiedSlots = itemDef.slot.map(slot => {
            switch (slot) {
              case "Head": return 0;
              case "LeftHand": return 1;
              case "RightHand": return 2;
              case "Legs": return 3;
              case "Torso": return 4;
              default: return -1;
            }
          });

          // If this is not the first slot occupied by this item, mark as disabled
          const firstSlot = Math.min(...occupiedSlots);
          if (slotIndex !== firstSlot) {
            frame = 2; // Frame 2 = disabled
          }
        }
      }
    }

    k.add([
      k.sprite("inventoryslot", { frame }),
      k.pos(pos.x, pos.y),
      "equipmentSlot",
    ]);
  }
}

/**
 * Draws inventory items in their slots
 * @param inventory Array of item instances or null for empty slots
 * @param itemDatabase ItemDatabase to get item definitions
 */
export function drawInventoryItems(inventory: (ItemInstance | null)[], itemDatabase: ItemDatabase): void {
  for (let i = 0; i < inventory.length; i++) {
    const item = inventory[i];
    if (!item) continue;

    const itemDef = itemDatabase.getItem(item.definitionId);
    if (!itemDef) {
      console.error(`[UIRenderer] Item definition not found: ${item.definitionId}`);
      continue;
    }

    // Calculate row and column from index (5 columns, 2 rows)
    const col = i % INVENTORY.SLOTS_X;
    const row = Math.floor(i / INVENTORY.SLOTS_X);
    const pos = inventorySlotPos(col, row, INVENTORY.PATCH_SIZE);

    // Draw item sprite at slot position (centered)
    k.add([
      k.sprite(itemDef.sprite, { frame: itemDef.frame }),
      k.pos(pos.x + INVENTORY.SLOT_SIZE / 2, pos.y + INVENTORY.SLOT_SIZE / 2),
      k.anchor("center"),
      k.z(1),
      "inventoryItem",
    ]);
  }
}

/**
 * Draws equipment items in their slots
 * @param equipment Array of item instances or null for empty slots
 * @param itemDatabase ItemDatabase to get item definitions
 */
export function drawEquipmentItems(equipment: (ItemInstance | null)[], itemDatabase: ItemDatabase): void {
  for (let i = 0; i < equipment.length; i++) {
    const item = equipment[i];
    if (!item) continue;

    const itemDef = itemDatabase.getItem(item.definitionId);
    if (!itemDef) {
      console.error(`[UIRenderer] Item definition not found: ${item.definitionId}`);
      continue;
    }

    // For multi-slot items, only render in the first slot
    if (itemDef.slot && Array.isArray(itemDef.slot)) {
      const occupiedSlots = itemDef.slot.map(slot => {
        switch (slot) {
          case "Head": return 0;
          case "LeftHand": return 1;
          case "RightHand": return 2;
          case "Legs": return 3;
          case "Torso": return 4;
          default: return -1;
        }
      });

      const firstSlot = Math.min(...occupiedSlots);
      if (i !== firstSlot) {
        // This is not the first slot for this multi-slot item, skip rendering
        continue;
      }
    }

    const gridPos = getEquipmentSlotGridPos(i);
    if (!gridPos) continue;

    const pos = equipmentSlotPos(gridPos.col, gridPos.row, EQUIPMENT.PATCH_SIZE);

    // Draw item sprite at slot position (centered)
    k.add([
      k.sprite(itemDef.sprite, { frame: itemDef.frame }),
      k.pos(pos.x + EQUIPMENT.SLOT_SIZE / 2, pos.y + EQUIPMENT.SLOT_SIZE / 2),
      k.anchor("center"),
      k.z(1),
      "equipmentItem",
    ]);
  }
}

/**
 * Draws the item description background widget
 */
export function drawDescriptionBackground(): void {
  k.add([
    k.sprite("9patch", {
      width: DESCRIPTION.WIDTH,
      height: DESCRIPTION.HEIGHT,
    }),
    k.pos(DESCRIPTION.X, DESCRIPTION.Y),
    k.z(100),
    "descriptionBackground",
  ]);
}

/**
 * Draws item description text
 * @param itemDef Item definition to display
 */
export function drawItemDescription(itemDef: ItemDefinition): void {
  const x = DESCRIPTION.X + DESCRIPTION.PADDING + DESCRIPTION.PATCH_SIZE;
  const y = DESCRIPTION.Y + DESCRIPTION.PADDING + DESCRIPTION.PATCH_SIZE;

  // Line 1: Item name
  k.add([
    k.text(itemDef.name, { font: "saga", size: 12 }),
    k.pos(x, y),
    k.color(255, 255, 255),
    k.z(101),
    "descriptionText",
  ]);

  // Line 2: Description (if exists)
  if (itemDef.description) {
    k.add([
      k.text(itemDef.description, { font: "saga", size: 10, width: DESCRIPTION.WIDTH - 2 * (DESCRIPTION.PADDING + DESCRIPTION.PATCH_SIZE) }),
      k.pos(x, y + DESCRIPTION.LINE_HEIGHT),
      k.color(200, 200, 200),
      k.z(101),
      "descriptionText",
    ]);
  }

  // Line 3: Stat bonuses (if exists)
  if (itemDef.statBonuses) {
    const bonuses: string[] = [];
    if (itemDef.statBonuses.hp) bonuses.push(`+${itemDef.statBonuses.hp} HP`);
    if (itemDef.statBonuses.atk) bonuses.push(`+${itemDef.statBonuses.atk} ATK`);
    if (itemDef.statBonuses.def) bonuses.push(`+${itemDef.statBonuses.def} DEF`);
    if (itemDef.statBonuses.agi) bonuses.push(`+${itemDef.statBonuses.agi} AGI`);

    if (bonuses.length > 0) {
      const bonusText = bonuses.join(", ");
      k.add([
        k.text(bonusText, { font: "saga", size: 10 }),
        k.pos(x, y + DESCRIPTION.LINE_HEIGHT * 2),
        k.color(100, 255, 100),
        k.z(101),
        "descriptionText",
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
  k.destroyAll("levelInfo");
  k.destroyAll("stateMachineInfo");
  k.destroyAll("inventoryBackground");
  k.destroyAll("inventorySlot");
  k.destroyAll("inventoryItem");
  k.destroyAll("equipmentBackground");
  k.destroyAll("equipmentSlot");
  k.destroyAll("equipmentItem");
  k.destroyAll("descriptionBackground");
  k.destroyAll("descriptionText");
  k.destroyAll("sagaText");
}
