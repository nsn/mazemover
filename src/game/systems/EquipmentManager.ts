import { EquipmentSlot, type ItemInstance, type ItemDefinition, type MapObject, type Stats } from "../types";
import { type ItemDatabase } from "./ItemDatabase";

/**
 * Maps EquipmentSlot string to equipment array index
 */
export function equipmentSlotToIndex(slot: EquipmentSlot): number {
  switch (slot) {
    case EquipmentSlot.Head: return 0;
    case EquipmentSlot.LeftHand: return 1;
    case EquipmentSlot.RightHand: return 2;
    case EquipmentSlot.Legs: return 3;
    case EquipmentSlot.Torso: return 4;
  }
}

/**
 * Get all slot indices that would be occupied by an item
 * @param itemDef Item definition
 * @returns Array of equipment slot indices
 */
export function getOccupiedSlots(itemDef: ItemDefinition): number[] {
  if (!itemDef.slot) return [];

  if (Array.isArray(itemDef.slot)) {
    // Two-handed weapon or multi-slot item
    return itemDef.slot.map(equipmentSlotToIndex);
  } else {
    // Single slot item
    return [equipmentSlotToIndex(itemDef.slot)];
  }
}

/**
 * Count empty slots in inventory
 */
export function countEmptyInventorySlots(inventory: (ItemInstance | null)[]): number {
  return inventory.filter(item => item === null).length;
}

/**
 * Find first empty inventory slot index
 */
export function findFirstEmptyInventorySlot(inventory: (ItemInstance | null)[]): number {
  return inventory.findIndex(item => item === null);
}

/**
 * Unequip an item from equipment slot to inventory
 * @param inventory Current inventory array
 * @param equipment Current equipment array
 * @param equipmentIndex Index of item in equipment to unequip
 * @param itemDatabase Item database to look up item definitions
 * @returns true if successful, false if no inventory space
 */
export function unequipItemToInventory(
  inventory: (ItemInstance | null)[],
  equipment: (ItemInstance | null)[],
  equipmentIndex: number,
  itemDatabase: ItemDatabase
): boolean {
  const itemToUnequip = equipment[equipmentIndex];
  if (!itemToUnequip) {
    console.error("[EquipmentManager] No item at equipment index", equipmentIndex);
    return false;
  }

  const itemDef = itemDatabase.getItem(itemToUnequip.definitionId);
  if (!itemDef) {
    console.error("[EquipmentManager] Item definition not found:", itemToUnequip.definitionId);
    return false;
  }

  // Check if we have inventory space
  const emptySlot = findFirstEmptyInventorySlot(inventory);
  if (emptySlot === -1) {
    console.error("[EquipmentManager] No inventory space to unequip item");
    return false;
  }

  // Get all slots this item occupies
  const slotsToFree = getOccupiedSlots(itemDef);

  // Move item to inventory
  inventory[emptySlot] = itemToUnequip;

  // Clear all equipment slots this item occupied
  for (const slotIndex of slotsToFree) {
    equipment[slotIndex] = null;
  }

  console.log(`[EquipmentManager] Unequipped ${itemDef.name} from slots ${slotsToFree.join(", ")}`);
  return true;
}

/**
 * Equip an item from inventory to equipment slots
 * @param inventory Current inventory array
 * @param equipment Current equipment array
 * @param inventoryIndex Index of item in inventory to equip
 * @param itemDatabase Item database to look up item definitions
 * @returns true if successful, false if not enough inventory space
 */
export function equipItemFromInventory(
  inventory: (ItemInstance | null)[],
  equipment: (ItemInstance | null)[],
  inventoryIndex: number,
  itemDatabase: ItemDatabase
): boolean {
  const itemToEquip = inventory[inventoryIndex];
  if (!itemToEquip) {
    console.error("[EquipmentManager] No item at inventory index", inventoryIndex);
    return false;
  }

  const itemDef = itemDatabase.getItem(itemToEquip.definitionId);
  if (!itemDef) {
    console.error("[EquipmentManager] Item definition not found:", itemToEquip.definitionId);
    return false;
  }

  if (!itemDef.slot) {
    console.error("[EquipmentManager] Item cannot be equipped (no slot):", itemDef.name);
    return false;
  }

  // Get all slots this item will occupy
  const slotsToOccupy = getOccupiedSlots(itemDef);

  // Find all items that need to be unequipped
  const itemsToUnequip: ItemInstance[] = [];
  for (const slotIndex of slotsToOccupy) {
    const currentItem = equipment[slotIndex];
    if (currentItem) {
      itemsToUnequip.push(currentItem);
    }
  }

  // Check if we have enough inventory space
  // We're removing 1 item from inventory (the one being equipped)
  // and adding N items to inventory (the ones being unequipped)
  // So we need (N - 1) empty slots
  const emptySlots = countEmptyInventorySlots(inventory);
  const requiredSlots = itemsToUnequip.length - 1; // -1 because we're removing the item being equipped

  if (requiredSlots > emptySlots) {
    console.error(
      `[EquipmentManager] Not enough inventory space. Need ${requiredSlots} empty slots, have ${emptySlots}`
    );
    return false;
  }

  // Perform the swap
  // 1. Remove item from inventory
  inventory[inventoryIndex] = null;

  // 2. Move displaced equipment items to inventory
  for (const displacedItem of itemsToUnequip) {
    const emptySlot = findFirstEmptyInventorySlot(inventory);
    if (emptySlot === -1) {
      console.error("[EquipmentManager] Failed to find empty inventory slot (should not happen)");
      return false;
    }
    inventory[emptySlot] = displacedItem;
  }

  // 3. Clear the equipment slots that will be occupied
  for (const slotIndex of slotsToOccupy) {
    equipment[slotIndex] = null;
  }

  // 4. Equip the new item
  for (const slotIndex of slotsToOccupy) {
    equipment[slotIndex] = itemToEquip;
  }

  console.log(`[EquipmentManager] Equipped ${itemDef.name} to slots ${slotsToOccupy.join(", ")}`);
  return true;
}

/**
 * Calculate total stat bonuses from all equipped items
 * @param equipment Current equipment array
 * @param itemDatabase Item database to look up item definitions
 * @returns Partial<Stats> with total bonuses
 */
export function calculateEquipmentBonuses(
  equipment: (ItemInstance | null)[],
  itemDatabase: ItemDatabase
): Partial<Stats> {
  const totalBonuses: Partial<Stats> = {
    hp: 0,
    atk: 0,
    def: 0,
    agi: 0,
  };

  // Track which items we've already counted (for multi-slot items)
  const countedItems = new Set<string>();

  for (let i = 0; i < equipment.length; i++) {
    const item = equipment[i];
    if (!item) continue;

    // Skip if we've already counted this item instance
    if (countedItems.has(item.definitionId)) continue;

    const itemDef = itemDatabase.getItem(item.definitionId);
    if (!itemDef || !itemDef.statBonuses) continue;

    // Mark this item as counted
    countedItems.add(item.definitionId);

    // Add bonuses
    if (itemDef.statBonuses.hp) totalBonuses.hp! += itemDef.statBonuses.hp;
    if (itemDef.statBonuses.atk) totalBonuses.atk! += itemDef.statBonuses.atk;
    if (itemDef.statBonuses.def) totalBonuses.def! += itemDef.statBonuses.def;
    if (itemDef.statBonuses.agi) totalBonuses.agi! += itemDef.statBonuses.agi;
  }

  return totalBonuses;
}

/**
 * Apply equipment bonuses to player's stats
 * Should be called after equipping/unequipping items
 * @param player Player object to update
 * @param equipment Current equipment array
 * @param itemDatabase Item database to look up item definitions
 */
export function applyEquipmentBonuses(
  player: MapObject,
  equipment: (ItemInstance | null)[],
  itemDatabase: ItemDatabase
): void {
  if (!player.stats || !player.baseStats) {
    console.error("[EquipmentManager] Player missing stats or baseStats");
    return;
  }

  // Calculate total bonuses from equipment
  const bonuses = calculateEquipmentBonuses(equipment, itemDatabase);

  // Apply bonuses to base stats
  player.stats.hp = player.baseStats.hp + (bonuses.hp || 0);
  player.stats.atk = player.baseStats.atk + (bonuses.atk || 0);
  player.stats.def = player.baseStats.def + (bonuses.def || 0);
  player.stats.agi = player.baseStats.agi + (bonuses.agi || 0);

  // Ensure current HP doesn't exceed new max HP
  if (player.currentHP !== undefined && player.currentHP > player.stats.hp) {
    player.currentHP = player.stats.hp;
  }

  console.log(`[EquipmentManager] Applied bonuses: HP+${bonuses.hp}, ATK+${bonuses.atk}, DEF+${bonuses.def}, AGI+${bonuses.agi}`);
}
