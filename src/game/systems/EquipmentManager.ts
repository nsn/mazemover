import { EquipmentSlot, type ItemInstance, type ItemDefinition } from "../types";
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
