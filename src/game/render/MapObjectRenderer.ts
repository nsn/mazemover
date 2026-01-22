import { k } from "../../kaplayCtx";
import { type MapObject, ObjectType } from "../types";
import { logger } from "../utils/logger";

/**
 * Draws all map objects (player, enemies, items, exits) on the grid
 * @param objects Array of map objects to render
 * @param gridOffsetX X offset of the grid in pixels
 * @param gridOffsetY Y offset of the grid in pixels
 * @param tileSize Size of each tile in pixels
 * @param isInStartLevelSequence Whether the game is in the start level sequence
 * @param revealedTiles Set of revealed tiles during start level sequence
 */
export function drawMapObjects(
  objects: MapObject[],
  gridOffsetX: number,
  gridOffsetY: number,
  tileSize: number,
  isInStartLevelSequence: boolean = false,
  revealedTiles: Set<string> = new Set()
): void {
  logger.time("[drawMapObjects] Total");
  const sorted = [...objects].sort((a, b) => a.renderOrder - b.renderOrder);

  for (const obj of sorted) {
    // Skip objects that are still in the start level sequence (not yet spawned)
    if (obj.isInStartLevelSequence) {
      continue;
    }

    // Skip objects whose tiles haven't been revealed yet during start level sequence
    if (isInStartLevelSequence && !revealedTiles.has(`${obj.gridPosition.row},${obj.gridPosition.col}`)) {
      continue;
    }
    const x = gridOffsetX + obj.gridPosition.col * tileSize + tileSize / 2 + obj.pixelOffset.x + obj.spriteOffset.x;
    const y = gridOffsetY + obj.gridPosition.row * tileSize + tileSize / 2 + obj.pixelOffset.y + obj.spriteOffset.y;

    // Player plays drop animation during start, idle when standing still
    // Enemies play idle animation
    // Items use the sprite atlas specified in obj.sprite with frame number from obj.frame
    // Others use frame 0
    let spriteConfig;
    let spriteName = obj.sprite;

    if (obj.type === ObjectType.Player) {
      const anim = obj.isPlayingDropAnimation ? (obj.entryAnimationName || "drop") : "idle";
      spriteConfig = { anim, flipX: obj.flipX };
    } else if (obj.type === ObjectType.Enemy) {
      spriteConfig = { anim: "idle", flipX: obj.flipX };
    } else if (obj.type === ObjectType.Item) {
      spriteConfig = { frame: obj.frame ?? 0, flipX: obj.flipX };
    } else {
      spriteConfig = { frame: 0, flipX: obj.flipX };
    }

    const components: any[] = [
      k.sprite(spriteName, spriteConfig),
      k.pos(x, y),
      k.anchor("center"),
      k.area(),
      k.z(2), // Above decay overlay (z=1) and tiles (z=0)
      "mapObject",
      { objectData: obj },
    ];

    const color = (obj as any).color;
    if (color) {
      components.push(k.color(color.r, color.g, color.b));
    }

    k.add(components);
  }
  logger.timeEnd("[drawMapObjects] Total");
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
