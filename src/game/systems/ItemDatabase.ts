import type { ItemDefinition } from "../types";

export class ItemDatabase {
  private items: Map<string, ItemDefinition> = new Map();

  async load(path: string): Promise<void> {
    console.log(`[ItemDatabase] Loading items from ${path}...`);
    try {
      const response = await fetch(path);
      if (!response.ok) {
        throw new Error(`Failed to load items: ${response.statusText}`);
      }

      const data = await response.json();

      // Load equipment items
      if (data.equipment) {
        for (const [id, itemData] of Object.entries(data.equipment)) {
          const item = itemData as any;
          this.items.set(id, {
            id,
            name: item.name,
            type: "Equipment",
            sprite: item.sprite,
            frame: item.frame,
            tier: item.tier ?? 1,  // Default to tier 1
            charges: item.charges ?? -1,  // Default to infinite for equipment
            statBonuses: item.statBonuses,
            slot: item.slot,
            description: item.description,
          });
        }
      }

      // Load consumable items
      if (data.consumables) {
        for (const [id, itemData] of Object.entries(data.consumables)) {
          const item = itemData as any;
          this.items.set(id, {
            id,
            name: item.name,
            type: "Consumable",
            sprite: item.sprite,
            frame: item.frame,
            tier: item.tier ?? 1,  // Default to tier 1
            charges: item.charges ?? 1,  // Default to 1 for consumables
            statBonuses: item.statBonuses,
            description: item.description,
          });
        }
      }

      console.log(`[ItemDatabase] Loaded ${this.items.size} items`);
    } catch (error) {
      console.error("[ItemDatabase] Error loading items:", error);
      throw error;
    }
  }

  getItem(id: string): ItemDefinition | undefined {
    return this.items.get(id);
  }

  getAllItems(): ItemDefinition[] {
    return Array.from(this.items.values());
  }

  getEquipment(): ItemDefinition[] {
    return this.getAllItems().filter(item => item.type === "Equipment");
  }

  getConsumables(): ItemDefinition[] {
    return this.getAllItems().filter(item => item.type === "Consumable");
  }
}
