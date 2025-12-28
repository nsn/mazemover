import { ObjectType, type MapObject, type GridPosition, type PlotPosition, Direction } from "../types";
import { GRID_ROWS, GRID_COLS } from "../config";

let nextId = 1;

export class MapObjectManager {
  private objects: Map<number, MapObject> = new Map();

  createObject(
    type: ObjectType,
    gridPosition: GridPosition,
    name: string,
    sprite: string,
    renderOrder: number = 0,
    movementSpeed: number = 1
  ): MapObject {
    const obj: MapObject = {
      id: nextId++,
      name,
      type,
      gridPosition: { ...gridPosition },
      pixelOffset: { x: 0, y: 0 },
      renderOrder,
      sprite,
      movementSpeed,
      movementAccumulator: 0,
      movesRemaining: 0,
    };
    this.objects.set(obj.id, obj);
    return obj;
  }

  createPlayer(gridPosition: GridPosition, name: string = "Player"): MapObject {
    return this.createObject(ObjectType.Player, gridPosition, name, "player", 100);
  }

  createEnemy(gridPosition: GridPosition, name: string = "Enemy"): MapObject {
    return this.createObject(ObjectType.Enemy, gridPosition, name, "enemy", 90);
  }

  createItem(gridPosition: GridPosition, name: string = "Item"): MapObject {
    return this.createObject(ObjectType.Item, gridPosition, name, "item", 50);
  }

  createExit(gridPosition: GridPosition, name: string = "Exit"): MapObject {
    return this.createObject(ObjectType.Exit, gridPosition, name, "exit", 10);
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
