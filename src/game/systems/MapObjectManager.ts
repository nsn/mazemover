import { ObjectType, type MapObject, type GridPosition, type PlotPosition, Direction, type MapObjectCallback, AIType, type Stats, type ItemInstance } from "../types";
import { GRID_ROWS, GRID_COLS } from "../config";
import { EnemyDatabase } from "./EnemyDatabase";
import { ItemDatabase } from "./ItemDatabase";

export interface EnemyConfig {
  name?: string;
  movementSpeed?: number;
  color?: { r: number; g: number; b: number };
  aiType?: AIType;
  stats?: Stats;
}

let nextId = 1;

export class MapObjectManager {
  private objects: Map<number, MapObject> = new Map();
  private enemyDatabase: EnemyDatabase;
  private itemDatabase: ItemDatabase;

  constructor(enemyDatabase: EnemyDatabase, itemDatabase: ItemDatabase) {
    this.enemyDatabase = enemyDatabase;
    this.itemDatabase = itemDatabase;
  }

  createObject(
    type: ObjectType,
    gridPosition: GridPosition,
    name: string,
    sprite: string,
    renderOrder: number = 0,
    movementSpeed: number = 1,
    stats?: Stats,
    spriteOffset: { x: number; y: number } = { x: 0, y: 0 },
    onEnter?: MapObjectCallback,
    onExit?: MapObjectCallback,
    flying: boolean = false
  ): MapObject {
    const obj: MapObject = {
      id: nextId++,
      name,
      type,
      gridPosition: { ...gridPosition },
      pixelOffset: { x: 0, y: 0 },
      spriteOffset: { ...spriteOffset },
      flipX: false,  // Default facing right
      isInStartLevelSequence: false,  // Set to true for objects during start level animation
      isPlayingDropAnimation: false,  // Only used for player during start sequence
      renderOrder,
      sprite,
      movementSpeed,
      movementAccumulator: 0,
      movesRemaining: 0,
      stats: stats ? { ...stats } : undefined,
      baseStats: stats ? { ...stats } : undefined,  // Store base stats before equipment bonuses
      currentHP: stats ? stats.hp : undefined,
      flying,
      onEnter,
      onExit,
    };
    this.objects.set(obj.id, obj);
    return obj;
  }

  createPlayer(gridPosition: GridPosition, name?: string): MapObject {
    const playerDef = this.enemyDatabase.getPlayerDefinition();
    const player = this.createObject(
      ObjectType.Player,
      gridPosition,
      name || playerDef.name,
      "mason",
      100,
      1,
      playerDef.stats,
      { x: 0, y: -4 },  // Sprite offset to lift player sprite up
      undefined,  // onEnter
      undefined,  // onExit
      playerDef.flying || false  // flying
    );
    player.isInStartLevelSequence = true;  // Will be managed by StartLevelSequence
    console.log(`[MapObjectManager] Created player with stats:`, player.stats);
    return player;
  }

  createEnemy(gridPosition: GridPosition, enemyId: string): MapObject {
    const enemyDef = this.enemyDatabase.getEnemyDefinition(enemyId);
    if (!enemyDef) {
      console.error(`[MapObjectManager] Enemy definition not found: ${enemyId}`);
      throw new Error(`Enemy definition not found: ${enemyId}`);
    }

    const enemy = this.createObject(
      ObjectType.Enemy,
      gridPosition,
      enemyDef.name,
      enemyDef.sprite,
      90,
      enemyDef.movementSpeed,
      enemyDef.stats,
      { x: 0, y: 0 },  // spriteOffset
      undefined,  // onEnter
      undefined,  // onExit
      enemyDef.flying || false  // flying
    );

    enemy.aiType = enemyDef.aiType;
    enemy.tier = enemyDef.tier;
    enemy.dropChance = enemyDef.dropChance ?? 0.1;  // Default to 0.1 if not specified
    if (enemyDef.color) {
      (enemy as any).color = enemyDef.color;
    }
    console.log(`[MapObjectManager] Created ${enemyDef.name} with stats:`, enemy.stats);
    return enemy;
  }

  getEnemies(): MapObject[] {
    return this.getAllObjects().filter(obj => obj.type === ObjectType.Enemy);
  }

  createItem(gridPosition: GridPosition, itemId: string): MapObject {
    const itemDef = this.itemDatabase.getItem(itemId);
    if (!itemDef) {
      console.error(`[MapObjectManager] Item definition not found: ${itemId}`);
      throw new Error(`Item definition not found: ${itemId}`);
    }

    const item = this.createObject(
      ObjectType.Item,
      gridPosition,
      itemDef.name,
      itemDef.sprite,
      50,
      0,  // Items don't move
      undefined,
      { x: 0, y: 0 }
    );

    // Set the frame index for the item sprite
    item.frame = itemDef.frame;

    // Store the item definition ID on the object for later reference
    (item as any).itemId = itemId;

    console.log(`[MapObjectManager] Created item ${itemDef.name} (${itemId})`);
    return item;
  }

  createExit(gridPosition: GridPosition, name: string = "Exit", onEnter?: MapObjectCallback): MapObject {
    return this.createObject(ObjectType.Exit, gridPosition, name, "exit", 10, 0, undefined, { x: 0, y: 0 }, onEnter);
  }

  getExit(): MapObject | undefined {
    return this.getAllObjects().find(obj => obj.type === ObjectType.Exit);
  }

  checkInteractions(mob: MapObject, previousPosition: GridPosition, inventory?: (ItemInstance | null)[]): void {
    const isPlayer = mob.type === ObjectType.Player;
    const currentPos = mob.gridPosition;

    for (const obj of this.getAllObjects()) {
      if (obj.id === mob.id) continue;

      const wasOnTile = obj.gridPosition.row === previousPosition.row &&
                        obj.gridPosition.col === previousPosition.col;
      const isOnTile = obj.gridPosition.row === currentPos.row &&
                       obj.gridPosition.col === currentPos.col;

      if (wasOnTile && !isOnTile && obj.onExit) {
        obj.onExit(mob, isPlayer);
      }

      if (!wasOnTile && isOnTile && obj.onEnter) {
        obj.onEnter(mob, isPlayer);
      }

      // Handle item pickup for player
      if (isPlayer && isOnTile && obj.type === ObjectType.Item && inventory) {
        this.pickupItem(obj, inventory);
      }
    }
  }

  /**
   * Attempts to pick up an item and add it to the inventory
   * @param item The item object to pick up
   * @param inventory The player's inventory array
   * @returns true if item was picked up, false if inventory is full
   */
  private pickupItem(item: MapObject, inventory: (ItemInstance | null)[]): boolean {
    // Find first empty slot
    const emptySlotIndex = inventory.findIndex(slot => slot === null);

    if (emptySlotIndex === -1) {
      console.log("[MapObjectManager] Inventory is full, cannot pick up item:", item.name);
      return false;
    }

    // Get item definition to create ItemInstance
    const itemId = (item as any).itemId as string;
    if (!itemId) {
      console.error("[MapObjectManager] Item has no itemId, cannot pick up:", item.name);
      return false;
    }

    const itemDef = this.itemDatabase.getItem(itemId);
    if (!itemDef) {
      console.error("[MapObjectManager] Item definition not found for:", itemId);
      return false;
    }

    // Create item instance and add to inventory
    const itemInstance: ItemInstance = {
      definitionId: itemId,
      remainingCharges: itemDef.charges,
    };

    inventory[emptySlotIndex] = itemInstance;
    console.log(`[MapObjectManager] Picked up ${item.name} and placed in slot ${emptySlotIndex}`);

    // Remove item from map
    this.destroyObject(item);

    return true;
  }

  getObject(id: number): MapObject | undefined {
    return this.objects.get(id);
  }

  getAllObjects(): MapObject[] {
    return Array.from(this.objects.values());
  }

  getObjectsAtPosition(row: number, col: number): MapObject[] {
    return this.getAllObjects().filter(
      (obj) => obj.gridPosition.row === row && obj.gridPosition.col === col
    );
  }

  getObjectsSortedByRenderOrder(): MapObject[] {
    return this.getAllObjects().sort((a, b) => a.renderOrder - b.renderOrder);
  }

  destroyObject(obj: MapObject): void {
    console.log(`[MapObject] Destroyed: ${obj.name} (${obj.type}) at row=${obj.gridPosition.row}, col=${obj.gridPosition.col}`);
    this.objects.delete(obj.id);
  }

  handlePush(plot: PlotPosition): void {
    const rows = GRID_ROWS;
    const cols = GRID_COLS;

    const objectsToDestroy: MapObject[] = [];

    for (const obj of this.getAllObjects()) {
      const { row, col } = obj.gridPosition;
      let isAffected = false;
      let isEjected = false;

      switch (plot.direction) {
        case Direction.South:
          if (col === plot.col) {
            isAffected = true;
            if (row === rows - 1) {
              isEjected = true;
            } else {
              obj.gridPosition.row = row + 1;
            }
          }
          break;
        case Direction.North:
          if (col === plot.col) {
            isAffected = true;
            if (row === 0) {
              isEjected = true;
            } else {
              obj.gridPosition.row = row - 1;
            }
          }
          break;
        case Direction.East:
          if (row === plot.row) {
            isAffected = true;
            if (col === cols - 1) {
              isEjected = true;
            } else {
              obj.gridPosition.col = col + 1;
            }
          }
          break;
        case Direction.West:
          if (row === plot.row) {
            isAffected = true;
            if (col === 0) {
              isEjected = true;
            } else {
              obj.gridPosition.col = col - 1;
            }
          }
          break;
      }

      if (isAffected && isEjected) {
        objectsToDestroy.push(obj);
      }
    }

    for (const obj of objectsToDestroy) {
      this.destroyObject(obj);
    }
  }

  setPixelOffset(obj: MapObject, x: number, y: number): void {
    obj.pixelOffset.x = x;
    obj.pixelOffset.y = y;
  }

  resetAllPixelOffsets(): void {
    for (const obj of this.objects.values()) {
      obj.pixelOffset.x = 0;
      obj.pixelOffset.y = 0;
    }
  }

  resetTurnMovement(obj: MapObject): void {
    const total = obj.movementAccumulator + obj.movementSpeed;
    obj.movesRemaining = Math.floor(total);
    obj.movementAccumulator = total - obj.movesRemaining;
  }

  resetAllTurnMovement(): void {
    for (const obj of this.objects.values()) {
      this.resetTurnMovement(obj);
    }
  }

  getAvailableMoves(obj: MapObject): number {
    return obj.movesRemaining;
  }

  spendMovement(obj: MapObject, tiles: number = 1): boolean {
    if (obj.movesRemaining >= tiles) {
      obj.movesRemaining -= tiles;
      return true;
    }
    return false;
  }

  getPlayer(): MapObject | undefined {
    return this.getAllObjects().find(obj => obj.type === ObjectType.Player);
  }

  getItemDatabase(): ItemDatabase {
    return this.itemDatabase;
  }

  /**
   * Randomly spawns items on empty tiles
   * @param spawnChance Probability (0-1) that each empty tile will have an item
   */
  spawnRandomItems(spawnChance: number = 0.1): void {
    const allItems = this.itemDatabase.getAllItems();
    if (allItems.length === 0) {
      console.warn("[MapObjectManager] No items in database, skipping item spawn");
      return;
    }

    let itemsSpawned = 0;

    // Check each tile on the grid
    for (let row = 0; row < GRID_ROWS; row++) {
      for (let col = 0; col < GRID_COLS; col++) {
        // Check if this tile is empty (no objects on it)
        const objectsAtPosition = this.getObjectsAtPosition(row, col);
        if (objectsAtPosition.length > 0) {
          continue; // Tile is occupied
        }

        // Random chance to spawn item
        if (Math.random() < spawnChance) {
          // Select random item from database
          const randomItem = allItems[Math.floor(Math.random() * allItems.length)];
          this.createItem({ row, col }, randomItem.id);
          itemsSpawned++;
        }
      }
    }

    console.log(`[MapObjectManager] Spawned ${itemsSpawned} items on the map`);
  }
}
