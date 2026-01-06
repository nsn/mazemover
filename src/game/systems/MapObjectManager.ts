import { ObjectType, type MapObject, type GridPosition, type PlotPosition, Direction, type MapObjectCallback, AIType, type TileInstance, type Stats } from "../types";
import { GRID_ROWS, GRID_COLS } from "../config";
import { EnemyDatabase } from "./EnemyDatabase";

export interface EnemyConfig {
  name?: string;
  movementSpeed?: number;
  color?: { r: number; g: number; b: number };
  aiType?: AIType;
  protectedTile?: TileInstance;
  stats?: Stats;
}

let nextId = 1;

export class MapObjectManager {
  private objects: Map<number, MapObject> = new Map();
  private enemyDatabase: EnemyDatabase;

  constructor(enemyDatabase: EnemyDatabase) {
    this.enemyDatabase = enemyDatabase;
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
    onExit?: MapObjectCallback
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
      currentHP: stats ? stats.hp : undefined,
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
      { x: 0, y: -4 }  // Sprite offset to lift player sprite up
    );
    player.isInStartLevelSequence = true;  // Will be managed by StartLevelSequence
    console.log(`[MapObjectManager] Created player with stats:`, player.stats);
    return player;
  }

  createEnemy(gridPosition: GridPosition, enemyId: string, protectedTile?: TileInstance): MapObject {
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
      enemyDef.stats
    );

    enemy.aiType = enemyDef.aiType;
    if (protectedTile) {
      enemy.protectedTile = protectedTile;
    }
    if (enemyDef.color) {
      (enemy as any).color = enemyDef.color;
    }
    console.log(`[MapObjectManager] Created ${enemyDef.name} with stats:`, enemy.stats);
    return enemy;
  }

  // Convenience methods for creating specific enemy types
  createRedEnemy(gridPosition: GridPosition): MapObject {
    return this.createEnemy(gridPosition, "red_hunter");
  }

  createYellowEnemy(gridPosition: GridPosition): MapObject {
    return this.createEnemy(gridPosition, "yellow_hunter");
  }

  createGreenEnemy(gridPosition: GridPosition): MapObject {
    return this.createEnemy(gridPosition, "green_hunter");
  }

  createGuardian(gridPosition: GridPosition, protectedTile: TileInstance): MapObject {
    return this.createEnemy(gridPosition, "guardian", protectedTile);
  }

  getEnemies(): MapObject[] {
    return this.getAllObjects().filter(obj => obj.type === ObjectType.Enemy);
  }

  createItem(gridPosition: GridPosition, name: string = "Item"): MapObject {
    return this.createObject(ObjectType.Item, gridPosition, name, "item", 50, 1, undefined, { x: 0, y: 0 });
  }

  createExit(gridPosition: GridPosition, name: string = "Exit", onEnter?: MapObjectCallback): MapObject {
    return this.createObject(ObjectType.Exit, gridPosition, name, "exit", 10, 0, undefined, { x: 0, y: 0 }, onEnter);
  }

  getExit(): MapObject | undefined {
    return this.getAllObjects().find(obj => obj.type === ObjectType.Exit);
  }

  checkInteractions(mob: MapObject, previousPosition: GridPosition): void {
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
    }
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
}
