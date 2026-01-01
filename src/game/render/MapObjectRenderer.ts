import { k } from "../../kaplayCtx";
import { type MapObject } from "../types";

/**
 * Draws all map objects (player, enemies, items, exits) on the grid
 * @param objects Array of map objects to render
 * @param gridOffsetX X offset of the grid in pixels
 * @param gridOffsetY Y offset of the grid in pixels
 * @param tileSize Size of each tile in pixels
 */
export function drawMapObjects(
  objects: MapObject[],
  gridOffsetX: number,
  gridOffsetY: number,
  tileSize: number
): void {
  const sorted = [...objects].sort((a, b) => a.renderOrder - b.renderOrder);

  for (const obj of sorted) {
    const x = gridOffsetX + obj.gridPosition.col * tileSize + tileSize / 2 + obj.pixelOffset.x;
    const y = gridOffsetY + obj.gridPosition.row * tileSize + tileSize / 2 + obj.pixelOffset.y;

    const components: any[] = [
      k.sprite(obj.sprite),
      k.pos(x, y),
      k.anchor("center"),
      k.area(),
      "mapObject",
      { objectData: obj },
    ];

    const color = (obj as any).color;
    if (color) {
      components.push(k.color(color.r, color.g, color.b));
    }

    k.add(components);
  }
}

/**
 * Draws reachable tile highlights for movement
 * @param tiles Array of reachable tile positions
 * @param gridOffsetX X offset of the grid in pixels
 * @param gridOffsetY Y offset of the grid in pixels
 * @param tileSize Size of each tile in pixels
 */
export function drawReachableTiles(
  tiles: { position: { row: number; col: number } }[],
  gridOffsetX: number,
  gridOffsetY: number,
  tileSize: number
): void {
  for (const tile of tiles) {
    const x = gridOffsetX + tile.position.col * tileSize + tileSize / 2;
    const y = gridOffsetY + tile.position.row * tileSize + tileSize / 2;

    k.add([
      k.rect(tileSize - 2, tileSize - 2),
      k.pos(x, y),
      k.anchor("center"),
      k.color(100, 255, 100),
      k.opacity(0.3),
      k.area(),
      "reachableHighlight",
      { gridPos: tile.position },
    ]);
  }
}

/**
 * Clears all map object related visuals
 */
export function clearMapObjects(): void {
  k.destroyAll("mapObject");
  k.destroyAll("reachableHighlight");
  k.destroyAll("movingPlayer");
  k.destroyAll("movingEnemy");
}
