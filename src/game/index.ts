import { k } from "../kaplayCtx";
import { TurnManager } from "./systems/TurnManager";
import { InputController } from "./systems/InputController";
import { CursorManager } from "./systems/CursorManager";
import { ClickManager, type ClickCallbacks } from "./systems/ClickManager";
import {
  drawPlots,
  drawCurrentTile,
  animatePush,
  drawGridWithOverlay,
  clearGrid,
  drawDecayOverlay,
} from "./render/GridRenderer";
import {
  drawMapObjects,
  clearMapObjects,
} from "./render/MapObjectRenderer";
import {
  drawPreviewTile,
  drawDebugInfo,
  drawLevelInfo,
  drawStateMachineInfo,
  drawUI,
  updateEquipmentSlotHighlighting,
  updateDescription,
  clearUI,
} from "./render/UIRenderer";
import { getInventoryItemAtPosition, getEquipmentItemAtPosition, getEquipmentSlotAtPosition, screenToGrid } from "./systems/PositionUtils";
import { equipItemFromInventory, unequipItemToInventory, applyEquipmentBonuses, getOccupiedSlots, isSlotBlocked } from "./systems/EquipmentManager";
import { TurnOwner, PlayerPhase, ObjectType, AIType, TileType, type PlotPosition, type GridPosition, type MapObject, type TileInstance } from "./types";
import { findReachableTiles, type ReachableTile } from "./systems/Pathfinding";
import { spawnScrollingText } from "./systems/ScrollingCombatText";
import { TILE_SIZE, GRID_OFFSET_X, GRID_OFFSET_Y, GRID_ROWS, GRID_COLS, PREVIEW_X, PREVIEW_Y, DECAY_PROGRESSION, getFallChance } from "./config";
import { calculateAllEnemyMoves, type EnemyMove } from "./systems/EnemyAI";
import { executeCombat, checkForCombat } from "./systems/Combat";
import { isWallBlocking, openWall } from "./systems/WallBump";
import { applyRandomDecayToTile } from "./core/Grid";
import { fallThroughFloor, enterBossRoom, showGameOver, resetGlobalLevel } from "./mainScene";
import { getTileEdges } from "./core/Tile";

let turnManager: TurnManager;
let clickManager: ClickManager;
let isAnimating = false;
let lastHoveredItemId: string | null = null;
let lastHighlightedSlots: number[] = [];
let hoveredTilePosition: GridPosition | null = null;
let connectedTiles: GridPosition[] = [];

// Context menu state
interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  inventoryIndex: number;
  options: { label: string; action: string }[];
}
let contextMenu: ContextMenuState = {
  visible: false,
  x: 0,
  y: 0,
  inventoryIndex: -1,
  options: [],
};

/**
 * Plays a gray magic effect on the specified tiles (for repair items like cement and bricks)
 * Creates expanding/fading gray circles on each affected tile
 */
function playRepairEffect(tiles: GridPosition[]): void {
  const EFFECT_DURATION = 0.4;

  for (const pos of tiles) {
    const x = GRID_OFFSET_X + pos.col * TILE_SIZE + TILE_SIZE / 2;
    const y = GRID_OFFSET_Y + pos.row * TILE_SIZE + TILE_SIZE / 2;

    // Create gray magic effect circle
    const effect = k.add([
      k.circle(TILE_SIZE / 2),
      k.pos(x, y),
      k.anchor("center"),
      k.color(128, 128, 128), // Gray color
      k.opacity(0.6),
      k.scale(0.3),
      k.z(150),
      "repairEffect",
    ]);

    // Scale up animation
    k.tween(
      0.3,
      1.2,
      EFFECT_DURATION,
      (val) => {
        effect.scale = k.vec2(val, val);
      },
      k.easings.easeOutQuad
    );

    // Fade out animation
    k.tween(
      0.6,
      0,
      EFFECT_DURATION,
      (val) => { effect.opacity = val; },
      k.easings.easeOutQuad
    ).onEnd(() => {
      k.destroy(effect);
    });
  }
}

/**
 * Shows the context menu for an inventory item
 */
function showContextMenu(x: number, y: number, inventoryIndex: number): void {
  const state = turnManager.getState();
  const item = state.inventory[inventoryIndex];
  if (!item) return;

  const itemDatabase = turnManager.getObjectManager().getItemDatabase();
  const itemDef = itemDatabase.getItem(item.definitionId);
  if (!itemDef) return;

  // Build menu options based on item type
  const options: { label: string; action: string }[] = [];

  if (itemDef.type === "Consumable") {
    options.push({ label: "Use", action: "use" });
  } else if (itemDef.type === "Equipment" && itemDef.slot) {
    options.push({ label: "Equip", action: "equip" });
  }

  options.push({ label: "Drop", action: "drop" });

  contextMenu = {
    visible: true,
    x,
    y,
    inventoryIndex,
    options,
  };

  render();
}

/**
 * Hides the context menu
 */
function hideContextMenu(): void {
  if (contextMenu.visible) {
    contextMenu.visible = false;
    render();
  }
}

/**
 * Draws the context menu using the bubble slice9 sprite
 */
function drawContextMenu(): void {
  if (!contextMenu.visible) return;

  const menuWidth = 50;
  const optionHeight = 16;
  const padding = 6;
  const menuHeight = contextMenu.options.length * optionHeight + padding * 2;
  const mousePos = k.mousePos();

  // Draw background bubble
  k.add([
    k.sprite("bubble", { width: menuWidth, height: menuHeight }),
    k.pos(contextMenu.x, contextMenu.y),
    k.z(200),
    k.area(),
    "contextMenu",
  ]);

  // Draw menu options
  contextMenu.options.forEach((option, index) => {
    const optionX = contextMenu.x + padding;
    const optionY = contextMenu.y + padding + index * optionHeight;
    const optionWidth = menuWidth - padding * 2;

    // Check if mouse is hovering over this option
    const isHovered = mousePos.x >= optionX && mousePos.x <= optionX + optionWidth &&
                      mousePos.y >= optionY && mousePos.y <= optionY + optionHeight;

    // Option background (for click detection)
    k.add([
      k.rect(optionWidth, optionHeight),
      k.pos(optionX, optionY),
      k.color(0, 0, 0),
      k.opacity(0),
      k.area(),
      k.z(201),
      "contextMenuOption",
      { optionIndex: index, action: option.action },
    ]);

    // Option text - white when hovered, dark brown otherwise
    const textColor = isHovered ? { r: 255, g: 255, b: 255 } : { r: 72, g: 59, b: 58 };
    k.add([
      k.text(option.label, { font: "saga", size: 12 }),
      k.pos(optionX + 2, optionY + 2),
      k.color(textColor.r, textColor.g, textColor.b),
      k.z(202),
      "contextMenu",
    ]);
  });
}

/**
 * Handles context menu option selection
 */
function handleContextMenuAction(action: string): void {
  const state = turnManager.getState();
  const item = state.inventory[contextMenu.inventoryIndex];

  if (!item) {
    hideContextMenu();
    return;
  }

  const itemDatabase = turnManager.getObjectManager().getItemDatabase();
  const itemDef = itemDatabase.getItem(item.definitionId);
  const player = turnManager.getObjectManager().getPlayer();

  if (action === "drop") {
    // Remove item from inventory (destroy it)
    state.inventory[contextMenu.inventoryIndex] = null;
    hideContextMenu();
    return;
  }

  if (action === "use" && itemDef?.type === "Consumable") {
    // Use the consumable (same logic as left-click)
    useConsumableItem(contextMenu.inventoryIndex, item, itemDef, player ?? null, state);
    hideContextMenu();
    return;
  }

  if (action === "equip" && itemDef?.type === "Equipment" && itemDef.slot) {
    // Equip the item
    const success = equipItemFromInventory(
      state.inventory,
      state.equipment,
      contextMenu.inventoryIndex,
      itemDatabase
    );

    if (success && player) {
      applyEquipmentBonuses(player, state.equipment, itemDatabase);
    }
    hideContextMenu();
    return;
  }

  hideContextMenu();
}

/**
 * Uses a consumable item (extracted for reuse)
 */
function useConsumableItem(
  inventoryIndex: number,
  item: { definitionId: string; remainingCharges: number },
  itemDef: { id: string; type: string; sprite: string; frame: number },
  player: MapObject | null,
  state: { inventory: any[]; grid: any[][]; buffs: any[] }
): void {
  // Consume the item based on its type
  if (itemDef.id === "apple") {
    if (player && player.currentHP !== undefined && player.stats) {
      const maxHP = player.stats.hp;
      const healAmount = 5;
      player.currentHP = Math.min(player.currentHP + healAmount, maxHP);
    }
  } else if (itemDef.id === "ham") {
    if (player && player.currentHP !== undefined && player.stats) {
      const maxHP = player.stats.hp;
      player.currentHP = maxHP;
    }
  } else if (itemDef.id === "feather") {
    if (player) {
      player.flying = true;
      state.buffs.push({
        id: "flying",
        name: "Flying",
        iconSprite: itemDef.sprite,
        iconFrame: itemDef.frame,
      });
    }
  } else if (itemDef.id === "cement") {
    if (player) {
      const playerPos = player.gridPosition;
      const tilesToRestore = [
        { row: playerPos.row, col: playerPos.col },
        { row: playerPos.row - 1, col: playerPos.col },
        { row: playerPos.row + 1, col: playerPos.col },
        { row: playerPos.row, col: playerPos.col - 1 },
        { row: playerPos.row, col: playerPos.col + 1 },
      ];

      const affectedTiles: GridPosition[] = [];
      tilesToRestore.forEach(pos => {
        if (pos.row >= 0 && pos.row < GRID_ROWS &&
            pos.col >= 0 && pos.col < GRID_COLS) {
          affectedTiles.push(pos);
          const tile = state.grid[pos.row][pos.col];
          if (tile && tile.decay > 0) {
            tile.decay = 0;
          }
        }
      });

      playRepairEffect(affectedTiles);
    }
  } else if (itemDef.id === "bricks") {
    const affectedTiles: GridPosition[] = [];
    for (let row = 0; row < GRID_ROWS; row++) {
      for (let col = 0; col < GRID_COLS; col++) {
        const tile = state.grid[row][col];
        if (tile && tile.decay > 0) {
          affectedTiles.push({ row, col });
          const decayReduction = Math.floor(Math.random() * 3) + 1;
          tile.decay = Math.max(0, tile.decay - decayReduction);
        }
      }
    }

    playRepairEffect(affectedTiles);
  }

  // Decrease charges
  item.remainingCharges--;

  // Remove item if charges depleted
  if (item.remainingCharges <= 0) {
    state.inventory[inventoryIndex] = null;
  }

  render();
}

/**
 * Finds all tiles connected to a given position without breaking walls
 * Uses flood fill algorithm with canMove checks
 */
function findConnectedTiles(
  grid: TileInstance[][],
  start: GridPosition
): GridPosition[] {
  const connected: GridPosition[] = [];
  const visited = new Set<string>();
  const queue: GridPosition[] = [start];

  const key = (pos: GridPosition) => `${pos.row},${pos.col}`;
  visited.add(key(start));

  while (queue.length > 0) {
    const current = queue.shift()!;
    connected.push(current);

    // Check all four cardinal neighbors
    const neighbors: GridPosition[] = [
      { row: current.row - 1, col: current.col }, // North
      { row: current.row + 1, col: current.col }, // South
      { row: current.row, col: current.col - 1 }, // West
      { row: current.row, col: current.col + 1 }, // East
    ];

    for (const neighbor of neighbors) {
      const neighborKey = key(neighbor);

      // Skip if already visited
      if (visited.has(neighborKey)) {
        continue;
      }

      // Skip if out of bounds
      if (neighbor.row < 0 || neighbor.row >= GRID_ROWS ||
          neighbor.col < 0 || neighbor.col >= GRID_COLS) {
        continue;
      }

      // Check if we can move from current to neighbor (no wall blocking)
      const fromTile = grid[current.row][current.col];
      const toTile = grid[neighbor.row][neighbor.col];

      if (!fromTile || !toTile) {
        continue;
      }

      const fromEdges = getTileEdges(fromTile.type, fromTile.orientation);
      const toEdges = getTileEdges(toTile.type, toTile.orientation);

      const dRow = neighbor.row - current.row;
      const dCol = neighbor.col - current.col;

      let canMove = false;
      if (dRow === -1 && dCol === 0) {
        canMove = fromEdges.north && toEdges.south;
      } else if (dRow === 1 && dCol === 0) {
        canMove = fromEdges.south && toEdges.north;
      } else if (dRow === 0 && dCol === -1) {
        canMove = fromEdges.west && toEdges.east;
      } else if (dRow === 0 && dCol === 1) {
        canMove = fromEdges.east && toEdges.west;
      }

      if (canMove) {
        visited.add(neighborKey);
        queue.push(neighbor);
      }
    }
  }

  return connected;
}

/**
 * Selects a random item with tier <= maxTier, preferring items close to maxTier
 * Uses weighted distribution: items with tier == maxTier are 3x more likely,
 * tier == maxTier-1 are 2x more likely, others are 1x
 */
function selectItemByTier(maxTier: number, itemDatabase: any): string | null {
  const allItems = itemDatabase.getAllItems();

  const eligibleItems = allItems.filter((item: any) => item.tier <= maxTier);

  if (eligibleItems.length === 0) {
    return null;
  }

  // Create weighted array based on tier proximity to maxTier
  const weightedItems: string[] = [];
  for (const item of eligibleItems) {
    const tierDiff = maxTier - item.tier;
    let weight = 1;

    if (tierDiff === 0) {
      weight = 3; // Same tier: 3x weight
    } else if (tierDiff === 1) {
      weight = 2; // One tier below: 2x weight
    }
    // tierDiff >= 2: 1x weight (default)

    for (let i = 0; i < weight; i++) {
      weightedItems.push(item.id);
    }
  }

  // Select random item from weighted array
  const selectedId = weightedItems[Math.floor(Math.random() * weightedItems.length)];
  return selectedId;
}

async function handleClick(): Promise<void> {
  // Block all input during animations
  if (isAnimating) {
    return;
  }

  const pos = k.mousePos();

  // Check for context menu option clicks first
  if (contextMenu.visible) {
    const menuOptions = k.get("contextMenuOption");
    for (const option of menuOptions) {
      if ((option as any).hasPoint && (option as any).hasPoint(pos)) {
        const action = (option as any).action;
        handleContextMenuAction(action);
        return;
      }
    }
    // Click outside context menu - close it
    hideContextMenu();
    return;
  }

  const state = turnManager.getState();
  const itemDatabase = turnManager.getObjectManager().getItemDatabase();
  const player = turnManager.getObjectManager().getPlayer();

  // Check for inventory item clicks first (equip or consume item)
  const inventoryItem = getInventoryItemAtPosition(pos.x, pos.y, turnManager);
  if (inventoryItem) {
    const item = state.inventory[inventoryItem.index];
    if (!item) return;

    const itemDef = itemDatabase.getItem(item.definitionId);
    if (!itemDef) return;

    // Check if item is a consumable
    if (itemDef.type === "Consumable") {

      // Consume the item based on its type
      if (itemDef.id === "apple") {
        if (player && player.currentHP !== undefined && player.stats) {
          const maxHP = player.stats.hp;
          const healAmount = 5;
          player.currentHP = Math.min(player.currentHP + healAmount, maxHP);
        }
      } else if (itemDef.id === "ham") {
        if (player && player.currentHP !== undefined && player.stats) {
          const maxHP = player.stats.hp;
          player.currentHP = maxHP;
        }
      } else if (itemDef.id === "feather") {
        if (player) {
          // Grant flying ability
          player.flying = true;

          // Add flying buff to state
          state.buffs.push({
            id: "flying",
            name: "Flying",
            iconSprite: itemDef.sprite,
            iconFrame: itemDef.frame,
          });
        }
      } else if (itemDef.id === "cement") {
        if (player) {
          const playerPos = player.gridPosition;

          // Current tile plus adjacent tiles in four cardinal directions
          const tilesToRestore = [
            { row: playerPos.row, col: playerPos.col },     // Current tile
            { row: playerPos.row - 1, col: playerPos.col }, // North
            { row: playerPos.row + 1, col: playerPos.col }, // South
            { row: playerPos.row, col: playerPos.col - 1 }, // West
            { row: playerPos.row, col: playerPos.col + 1 }, // East
          ];

          // Collect valid tiles and remove decay from each
          const affectedTiles: GridPosition[] = [];
          tilesToRestore.forEach(pos => {
            if (pos.row >= 0 && pos.row < GRID_ROWS &&
                pos.col >= 0 && pos.col < GRID_COLS) {
              affectedTiles.push(pos);
              const tile = state.grid[pos.row][pos.col];
              if (tile && tile.decay > 0) {
                tile.decay = 0;
              }
            }
          });

          // Play repair effect on affected tiles
          playRepairEffect(affectedTiles);
        }
      } else if (itemDef.id === "bricks") {
        // Collect all tiles with decay and decrease their decay by a random value between 1 and 3
        const affectedTiles: GridPosition[] = [];
        for (let row = 0; row < GRID_ROWS; row++) {
          for (let col = 0; col < GRID_COLS; col++) {
            const tile = state.grid[row][col];
            if (tile && tile.decay > 0) {
              affectedTiles.push({ row, col });
              const decayReduction = Math.floor(Math.random() * 3) + 1; // Random 1-3
              tile.decay = Math.max(0, tile.decay - decayReduction);
            }
          }
        }

        // Play repair effect on all affected tiles
        playRepairEffect(affectedTiles);
      }

      // Decrease charges
      item.remainingCharges--;

      // Remove item if charges depleted
      if (item.remainingCharges <= 0) {
        state.inventory[inventoryItem.index] = null;
      }

      render();
      return; // Don't process other clicks if we clicked a consumable
    }

    // Try to equip if it's equipment
    const success = equipItemFromInventory(
      state.inventory,
      state.equipment,
      inventoryItem.index,
      itemDatabase
    );

    if (success && player) {
      // Apply stat bonuses after equipping
      applyEquipmentBonuses(player, state.equipment, itemDatabase);

      render();
    }
    return; // Don't process other clicks if we clicked an inventory item
  }

  // Check for equipment item clicks (unequip item)
  const equipmentItem = getEquipmentItemAtPosition(pos.x, pos.y, turnManager);
  if (equipmentItem) {
    const success = unequipItemToInventory(
      state.inventory,
      state.equipment,
      equipmentItem.index,
      itemDatabase
    );

    if (success && player) {
      // Apply stat bonuses after unequipping (removes bonuses)
      applyEquipmentBonuses(player, state.equipment, itemDatabase);

      render();
    }
    return; // Don't process other clicks if we clicked an equipment item
  }

  // Check if clicking on a blocked equipment slot (e.g., right hand when two-handed weapon equipped in left)
  const clickedSlotIndex = getEquipmentSlotAtPosition(pos.x, pos.y);
  if (clickedSlotIndex !== null && isSlotBlocked(state.equipment, clickedSlotIndex, itemDatabase)) {
    // Find the item that's blocking this slot
    for (let i = 0; i < state.equipment.length; i++) {
      const item = state.equipment[i];
      if (!item || i === clickedSlotIndex) continue;

      const itemDef = itemDatabase.getItem(item.definitionId);
      if (!itemDef || !itemDef.slot) continue;

      if (Array.isArray(itemDef.slot)) {
        const occupiedSlots = getOccupiedSlots(itemDef);
        if (occupiedSlots.includes(clickedSlotIndex)) {
          // This item is blocking the clicked slot - unequip it
          const success = unequipItemToInventory(
            state.inventory,
            state.equipment,
            i,
            itemDatabase
          );

          if (success && player) {
            applyEquipmentBonuses(player, state.equipment, itemDatabase);

            render();
          }
          return;
        }
      }
    }
  }

  // Handle normal game clicks
  clickManager.handleLeftClick(pos, turnManager, isAnimating);
}

async function movePlayerAlongPath(player: MapObject, path: GridPosition[]): Promise<void> {
  if (path.length <= 1) {
    render();
    return;
  }

  // Reset wall bump counter on successful movement
  turnManager.resetWallBumpCounter();

  isAnimating = true;

  try {
  const stepDuration = 0.15;

  k.destroyAll("reachableHighlight");

  const mapObjs = k.get("mapObject");
  for (const obj of mapObjs) {
    const objData = (obj as any).objectData as MapObject;
    if (objData.id === player.id) {
      obj.destroy();
      break;
    }
  }

  const from = path[0];
  const startX = GRID_OFFSET_X + from.col * TILE_SIZE + TILE_SIZE / 2 + player.spriteOffset.x;
  const startY = GRID_OFFSET_Y + from.row * TILE_SIZE + TILE_SIZE / 2 + player.spriteOffset.y;

  // Determine facing direction from first move
  let shouldFlip = player.flipX;
  if (path.length > 1) {
    const firstMove = path[1];
    if (firstMove.col < from.col) {
      shouldFlip = true;  // Moving left
      player.flipX = true;
    } else if (firstMove.col > from.col) {
      shouldFlip = false;  // Moving right
      player.flipX = false;
    }
    // If moving only vertically, keep current facing
  }

  const movingSprite = k.add([
    k.sprite(player.sprite, { anim: "walk", flipX: shouldFlip }),
    k.pos(startX, startY),
    k.anchor("center"),
    k.z(2), // Above decay overlay and tiles
    "movingPlayer",
  ]);

  const objectManager = turnManager.getObjectManager();

  for (let i = 1; i < path.length; i++) {
    const previousPosition = { ...player.gridPosition };
    const to = path[i];

    // Check if there will be combat at this position
    const objectsAtPosition = objectManager.getObjectsAtPosition(to.row, to.col);
    const enemy = checkForCombat(player, objectsAtPosition);

    const tileCenterX = GRID_OFFSET_X + to.col * TILE_SIZE + TILE_SIZE / 2 + player.spriteOffset.x;
    const tileCenterY = GRID_OFFSET_Y + to.row * TILE_SIZE + TILE_SIZE / 2 + player.spriteOffset.y;

    let endX = tileCenterX;
    let endY = tileCenterY;

    // If combat will occur, stop 16 pixels before the tile center
    if (enemy) {
      const deltaX = tileCenterX - movingSprite.pos.x;
      const deltaY = tileCenterY - movingSprite.pos.y;
      const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

      if (distance > 0) {
        const stopDistance = Math.max(0, distance - 16);
        const ratio = stopDistance / distance;
        endX = movingSprite.pos.x + deltaX * ratio;
        endY = movingSprite.pos.y + deltaY * ratio;
      }
    }

    const currentPos = movingSprite.pos.clone();

    k.tween(
      currentPos,
      k.vec2(endX, endY),
      stepDuration,
      (val) => {
        movingSprite.pos = val;
      },
      k.easings.easeOutQuad
    );

    await Promise.race([
      k.wait(stepDuration),
      new Promise(resolve => setTimeout(resolve, 1000)) // 1s timeout
    ]);

    player.gridPosition.row = to.row;
    player.gridPosition.col = to.col;

    if (enemy) {
      const combatResult = executeCombat(player, enemy);

      // Spawn SCT for attacker's damage on defender
      const defenderX = GRID_OFFSET_X + enemy.gridPosition.col * TILE_SIZE + TILE_SIZE / 2 + enemy.spriteOffset.x;
      const defenderY = GRID_OFFSET_Y + enemy.gridPosition.row * TILE_SIZE + TILE_SIZE / 2 + enemy.spriteOffset.y;

      if (combatResult.attackerAttack.hit) {
        const damageText = combatResult.attackerAttack.critical
          ? `${combatResult.attackerAttack.damage}!`
          : `${combatResult.attackerAttack.damage}`;
        const damageColor = combatResult.attackerAttack.critical
          ? { r: 255, g: 255, b: 100 }  // Yellow for crits
          : { r: 255, g: 100, b: 100 };  // Red for normal hits

        spawnScrollingText({
          text: damageText,
          x: defenderX,
          y: defenderY,
          color: damageColor,
          fontSize: combatResult.attackerAttack.critical ? 24 : 16,
          behavior: combatResult.attackerAttack.critical ? "bounce" : "static",
        });
      } else {
        spawnScrollingText({
          text: "MISS",
          x: defenderX,
          y: defenderY,
          color: { r: 150, g: 150, b: 150 },
          fontSize: 16,
          behavior: "fade",
        });
      }

      // Check if king took damage (but didn't die) - teleport to random immovable tile
      if (enemy.aiType === AIType.King && combatResult.attackerAttack.hit && !combatResult.attackerAttack.defenderDied) {
        teleportKingToRandomImmovableTile(enemy, objectManager);
      }

      // Remove dead enemy and bounce player back to previous position
      if (combatResult.attackerAttack.defenderDied) {
        // Play poof animation at enemy position
        const poofSprite = k.add([
          k.sprite("poof", { anim: "poof" }),
          k.pos(defenderX, defenderY),
          k.anchor("center"),
          k.z(150),
        ]);

        // Destroy poof sprite when animation completes
        poofSprite.onAnimEnd(() => {
          k.destroy(poofSprite);
        });

        // Check for item/bomb drop
        const enemyPos = enemy.gridPosition;
        console.log(`[Combat] Enemy defeated: ${enemy.name} (id: ${enemy.id}) at (${enemyPos.row},${enemyPos.col})`);
        console.log(`[Combat] Enemy spawnedByKing: ${enemy.spawnedByKing}, tier: ${enemy.tier}, dropChance: ${enemy.dropChance}`);

        // Check if tile is empty (no other MapObjects except player and the defeated enemy)
        const objectsAtPosition = objectManager.getAllObjects().filter(obj =>
          obj.gridPosition.row === enemyPos.row &&
          obj.gridPosition.col === enemyPos.col &&
          obj.id !== enemy.id &&
          obj.type !== ObjectType.Player  // Player can be on the tile (killed the enemy there)
        );

        console.log(`[Combat] Objects at enemy position (excluding player): ${objectsAtPosition.length}`);
        if (objectsAtPosition.length > 0) {
          console.log(`[Combat] Tile occupied, no drop. Objects:`, objectsAtPosition.map(o => `${o.name} (${o.type})`));
        }

        if (objectsAtPosition.length === 0) {
          const state = turnManager.getState();

          // If enemy was spawned by king, drop bomb with 1/3 chance
          if (enemy.spawnedByKing) {
            const bombRoll = Math.random();
            const bombChance = 0.5;
            console.log(`[Combat] King-spawned enemy - bomb drop roll: ${bombRoll.toFixed(3)} vs ${bombChance.toFixed(3)}`);
            if (bombRoll < bombChance) {
              objectManager.createBomb(enemyPos);
              console.log(`[Combat] ✓ Bomb dropped at (${enemyPos.row},${enemyPos.col})`);
            } else {
              console.log(`[Combat] ✗ No bomb dropped (rolled too high)`);
            }
          }

          // Item drop logic (can drop in addition to bombs for king-spawned enemies)
          let dropChance = enemy.dropChance ?? 0.1;
          const enemyTier = enemy.tier ?? 1;

          // In boss room, triple the drop rate for king-spawned enemies
          if (state.isBossRoom && enemy.spawnedByKing) {
            dropChance = Math.min(dropChance * 3, 1.0);  // Cap at 100%
            console.log(`[Combat] Boss room bonus - drop chance tripled: ${(dropChance / 3).toFixed(3)} -> ${dropChance.toFixed(3)}`);
          }

          const dropRoll = Math.random();
          console.log(`[Combat] Item drop roll: ${dropRoll.toFixed(3)} vs dropChance: ${dropChance.toFixed(3)} (tier: ${enemyTier})`);

          if (dropRoll < dropChance) {
            const itemDatabase = objectManager.getItemDatabase();
            const selectedItemId = selectItemByTier(enemyTier, itemDatabase);

            console.log(`[Combat] Item drop success! Selected item: ${selectedItemId}`);

            if (selectedItemId) {
              objectManager.createItem(enemyPos, selectedItemId);
              console.log(`[Combat] ✓ Item dropped: ${selectedItemId} (tier ${enemyTier})`);
            } else {
              console.log(`[Combat] ✗ No item ID selected (selectItemByTier returned null)`);
            }
          } else {
            console.log(`[Combat] ✗ No item dropped (rolled too high)`);
          }
        }

        objectManager.destroyObject(enemy);

        // Check if king was defeated in boss room - trigger victory
        const state = turnManager.getState();
        if (state.isBossRoom && enemy.aiType === AIType.King) {
          // Delay victory screen slightly to let animations finish
          k.wait(0.5, () => {
            k.add([
              k.rect(640, 360),
              k.pos(0, 0),
              k.color(0, 0, 0),
              k.opacity(0.8),
              k.z(1000),
              "victoryOverlay",
            ]);
            k.add([
              k.text("VICTORY!", { size: 48 }),
              k.pos(320, 130),
              k.anchor("center"),
              k.color(255, 215, 0),
              k.z(1001),
              "victoryText",
            ]);
            k.add([
              k.text("You defeated the King!", { size: 24 }),
              k.pos(320, 190),
              k.anchor("center"),
              k.color(255, 255, 255),
              k.z(1001),
              "victoryText",
            ]);
            k.add([
              k.text("The dungeon is saved!", { size: 20 }),
              k.pos(320, 230),
              k.anchor("center"),
              k.color(200, 200, 200),
              k.z(1001),
              "victoryText",
            ]);
            k.add([
              k.text("Click to return to title", { size: 16 }),
              k.pos(320, 290),
              k.anchor("center"),
              k.color(150, 150, 150),
              k.z(1001),
              "victoryText",
            ]);

            // Click to return to title
            k.onMousePress("left", () => {
              resetGlobalLevel();
              k.go("title");
            });
          });
        }
      }

      // Always bounce player back to previous position after combat
      const bounceX = GRID_OFFSET_X + previousPosition.col * TILE_SIZE + TILE_SIZE / 2;
      const bounceY = GRID_OFFSET_Y + previousPosition.row * TILE_SIZE + TILE_SIZE / 2;

      const bouncePos = movingSprite.pos.clone();
      k.tween(
        bouncePos,
        k.vec2(bounceX, bounceY),
        stepDuration,
        (val) => {
          movingSprite.pos = val;
        },
        k.easings.easeOutQuad
      );

      await Promise.race([
        k.wait(stepDuration),
        new Promise(resolve => setTimeout(resolve, 1000)) // 1s timeout
      ]);

      player.gridPosition.row = previousPosition.row;
      player.gridPosition.col = previousPosition.col;

      // Stop movement after combat
      break;
    }

    objectManager.checkInteractions(player, previousPosition, turnManager.getState().inventory);
  }

  k.destroyAll("movingPlayer");
  turnManager.getObjectManager().spendMovement(player, path.length - 1);

  isAnimating = false;

  // Check if player falls through the floor (if not flying)
  if (!player.flying) {
    const currentTile = turnManager.getState().grid[player.gridPosition.row][player.gridPosition.col];
    const fallChance = getFallChance(currentTile.decay);

    if (fallChance > 0) {
      const roll = Math.random();

      if (roll < fallChance) {
        // Set animating to prevent other actions during fall
        isAnimating = true;

        try {
          // Play fall animation
          const playerX = GRID_OFFSET_X + player.gridPosition.col * TILE_SIZE + TILE_SIZE / 2;
          const playerY = GRID_OFFSET_Y + player.gridPosition.row * TILE_SIZE + TILE_SIZE / 2 - 4;

          const fallSprite = k.add([
            k.sprite("mason", { anim: "fall" }),
            k.pos(playerX, playerY),
            k.anchor("center"),
            k.z(player.renderOrder),
            "fallingPlayer",
          ]);

          // Wait for fall animation to complete
          await new Promise<void>((resolve) => {
            fallSprite.onAnimEnd(() => {
              k.destroy(fallSprite);
              resolve();
            });
          });
        } catch (error) {
          console.error("[Fall] Error during fall animation:", error);
          k.destroyAll("fallingPlayer");
        } finally {
          // Reset animating flag before scene transition
          isAnimating = false;
        }

        // Transition to next level (going deeper)
        fallThroughFloor(turnManager.getState());

        // Don't continue with normal turn flow
        return;
      }
    }
  }

  turnManager.completeMove();
  await executeEnemyTurns();
  // startPlayerTurn() is now called inside executeEnemyTurns()
  } catch (error) {
    console.error("[movePlayerAlongPath] Error during player movement:", error);
    k.destroyAll("movingPlayer");
    isAnimating = false;
    render();
  }
}

async function skipPlayerTurn(_player: MapObject): Promise<void> {
  isAnimating = true;
  isAnimating = false;

  turnManager.completeMove();
  await executeEnemyTurns();
  // startPlayerTurn() is now called inside executeEnemyTurns()
}

async function animateWallBump(player: MapObject, targetPos: GridPosition): Promise<void> {
  isAnimating = true;

  try {
    // Remove player from map objects (will be rendered as moving sprite)
    const mapObjs = k.get("mapObject");
    for (const obj of mapObjs) {
      const objData = (obj as any).objectData as MapObject;
      if (objData.id === player.id) {
        obj.destroy();
        break;
      }
    }

    const from = player.gridPosition;
    const startX = GRID_OFFSET_X + from.col * TILE_SIZE + TILE_SIZE / 2 + player.spriteOffset.x;
    const startY = GRID_OFFSET_Y + from.row * TILE_SIZE + TILE_SIZE / 2 + player.spriteOffset.y;

    // Calculate bump direction - move 25% toward the wall
    const dRow = targetPos.row - from.row;
    const dCol = targetPos.col - from.col;
    const bumpX = startX + (dCol * TILE_SIZE * 0.25);
    const bumpY = startY + (dRow * TILE_SIZE * 0.25);

    // Determine facing direction
    if (dCol < 0) {
      player.flipX = true;  // Moving left
    } else if (dCol > 0) {
      player.flipX = false;  // Moving right
    }

    const movingSprite = k.add([
      k.sprite(player.sprite, { anim: "walk", flipX: player.flipX }),
      k.pos(startX, startY),
      k.anchor("center"),
      k.z(2), // Above decay overlay and tiles
      "movingPlayer",
    ]);

    const bumpDuration = 0.08;

    // Bump forward with timeout fallback
    const forwardPos = movingSprite.pos.clone();
    k.tween(
      forwardPos,
      k.vec2(bumpX, bumpY),
      bumpDuration,
      (val) => {
        movingSprite.pos = val;
      },
      k.easings.easeOutQuad
    );

    // Use Promise.race to add timeout protection
    await Promise.race([
      k.wait(bumpDuration),
      new Promise(resolve => setTimeout(resolve, 500)) // 500ms timeout
    ]);

    // Bounce back with timeout fallback
    const backPos = movingSprite.pos.clone();
    k.tween(
      backPos,
      k.vec2(startX, startY),
      bumpDuration,
      (val) => {
        movingSprite.pos = val;
      },
      k.easings.easeInQuad
    );

    await Promise.race([
      k.wait(bumpDuration),
      new Promise(resolve => setTimeout(resolve, 500)) // 500ms timeout
    ]);
  } catch (error) {
    console.error("[WallBump] Error during wall bump animation:", error);
  } finally {
    // Guaranteed cleanup
    k.destroyAll("movingPlayer");
    isAnimating = false;
    render();
  }
}

async function handleWallBump(player: MapObject, targetPos: GridPosition): Promise<void> {
  const state = turnManager.getState();

  // Check if player has required equipment to break walls
  // Need either: two-handed weapon OR both MainHand (index 1) AND OffHand (index 2)
  const mainHandItem = state.equipment[1];
  const offHandItem = state.equipment[2];

  let hasRequiredEquipment = false;

  if (mainHandItem !== null && offHandItem !== null) {
    // Both hands have items (two separate weapons)
    hasRequiredEquipment = true;
  } else if (mainHandItem !== null && offHandItem === null) {
    // Check if MainHand item is a two-handed weapon
    const itemDb = turnManager.getObjectManager().getItemDatabase();
    const itemDef = itemDb.getItem(mainHandItem.definitionId);
    if (itemDef && Array.isArray(itemDef.slot)) {
      // Two-handed weapon (occupies multiple slots)
      hasRequiredEquipment = true;
    }
  }

  if (!hasRequiredEquipment) {
    return;
  }

  // Check if this is the same wall as before
  const isSameTarget = state.wallBumpTarget &&
    state.wallBumpTarget.row === targetPos.row &&
    state.wallBumpTarget.col === targetPos.col;

  if (isSameTarget) {
    state.wallBumpCount++;
  } else {
    state.wallBumpCount = 1;
    state.wallBumpTarget = { ...targetPos };
  }

  // Animate the bump
  await animateWallBump(player, targetPos);

  // Decrease charges for equipped items
  for (let i = 0; i < state.equipment.length; i++) {
    const item = state.equipment[i];
    if (item && item.remainingCharges > -1) {
      item.remainingCharges--;

      // Remove item if charges depleted
      if (item.remainingCharges <= 0) {
        state.equipment[i] = null;

        // Reapply equipment bonuses to update player stats
        const objectManager = turnManager.getObjectManager();
        const player = objectManager.getPlayer();
        if (player) {
          const itemDb = objectManager.getItemDatabase();
          applyEquipmentBonuses(player, state.equipment, itemDb);
        }
      }
    }
  }

  // Apply decay to both tiles involved in the wall bump
  // Each gets a random decay increase from 0 to ON_WALL_BREAK
  applyRandomDecayToTile(state.grid, player.gridPosition.row, player.gridPosition.col, DECAY_PROGRESSION.ON_WALL_BREAK, turnManager.getObjectManager());
  applyRandomDecayToTile(state.grid, targetPos.row, targetPos.col, DECAY_PROGRESSION.ON_WALL_BREAK, turnManager.getObjectManager());

  // Check if we've reached 3 bumps
  if (state.wallBumpCount >= 3) {
    openWall(state.grid, player.gridPosition, targetPos);
    state.wallBumpCount = 0;
    state.wallBumpTarget = null;
    render();  // Re-render to show opened wall
  }

  // Spend movement point
  turnManager.getObjectManager().spendMovement(player, 1);
  render();  // Update UI to show remaining moves

  // Check if player has moves remaining, otherwise trigger enemy turn
  if (player.movesRemaining <= 0) {
    await executeEnemyTurns();
  }
}

/**
 * Teleports the king to a random immovable tile (even row AND even col)
 */
function teleportKingToRandomImmovableTile(king: MapObject, objectManager: any): void {
  // Find all immovable tiles (even row AND even col)
  const immovableTiles: GridPosition[] = [];
  for (let row = 0; row < GRID_ROWS; row++) {
    for (let col = 0; col < GRID_COLS; col++) {
      // Immovable tiles have even row AND even col
      if (row % 2 === 0 && col % 2 === 0) {
        // Check if tile is empty (no other objects)
        const objectsAtPosition = objectManager.getAllObjects().filter((obj: MapObject) =>
          obj.gridPosition.row === row &&
          obj.gridPosition.col === col &&
          obj.id !== king.id
        );

        if (objectsAtPosition.length === 0) {
          immovableTiles.push({ row, col });
        }
      }
    }
  }

  if (immovableTiles.length > 0) {
    // Pick random immovable tile
    const targetTile = immovableTiles[Math.floor(Math.random() * immovableTiles.length)];

    // Create teleport visual effect at old position
    const oldX = GRID_OFFSET_X + king.gridPosition.col * TILE_SIZE + TILE_SIZE / 2;
    const oldY = GRID_OFFSET_Y + king.gridPosition.row * TILE_SIZE + TILE_SIZE / 2;

    const teleportOut = k.add([
      k.circle(16),
      k.pos(oldX, oldY),
      k.anchor("center"),
      k.color(255, 215, 0),  // Gold
      k.opacity(0.8),
      k.z(150),
      "kingTeleport",
    ]);

    k.tween(0.8, 0, 0.3, (val) => { teleportOut.opacity = val; }, k.easings.easeOutQuad);

    // Update king position
    king.gridPosition = { ...targetTile };

    // Create teleport visual effect at new position
    const newX = GRID_OFFSET_X + targetTile.col * TILE_SIZE + TILE_SIZE / 2;
    const newY = GRID_OFFSET_Y + targetTile.row * TILE_SIZE + TILE_SIZE / 2;

    const teleportIn = k.add([
      k.circle(16),
      k.pos(newX, newY),
      k.anchor("center"),
      k.color(255, 215, 0),  // Gold
      k.opacity(0),
      k.z(150),
      "kingTeleport",
    ]);

    k.tween(0, 0.8, 0.3, (val) => { teleportIn.opacity = val; }, k.easings.easeInQuad);

    // Clean up effects after animation
    k.wait(0.3, () => {
      teleportOut.destroy();
      teleportIn.destroy();
    });
  }
}

/**
 * Process all bombs on the field, decrementing their timers and handling explosions
 */
async function processBombs(): Promise<void> {
  const objectManager = turnManager.getObjectManager();
  const bombs = objectManager.getBombs();

  if (bombs.length === 0) return;

  for (const bomb of bombs) {
    if (bomb.bombTurnsRemaining === undefined) continue;

    // Decrement timer
    bomb.bombTurnsRemaining--;

    // Check if bomb should explode
    if (bomb.bombTurnsRemaining <= 0) {
      await explodeBomb(bomb);
    }
  }

  // Render to update bomb animations
  render();
}

/**
 * Handle bomb explosion: spawn explosions in cardinal directions, deal damage, increase decay
 */
async function explodeBomb(bomb: MapObject): Promise<void> {
  isAnimating = true;

  const objectManager = turnManager.getObjectManager();
  const state = turnManager.getState();
  const centerPos = bomb.gridPosition;
  const explosionPositions: GridPosition[] = [];

  // Always explode in center
  explosionPositions.push({ row: centerPos.row, col: centerPos.col });

  // Get the edges of the bomb's tile to check for walls
  const bombTile = state.grid[centerPos.row][centerPos.col];
  const bombTileEdges = getTileEdges(bombTile.type, bombTile.orientation);

  // Check each cardinal direction
  const directions = [
    { row: -1, col: 0, name: "North", edge: "north" as const },
    { row: 1, col: 0, name: "South", edge: "south" as const },
    { row: 0, col: -1, name: "West", edge: "west" as const },
    { row: 0, col: 1, name: "East", edge: "east" as const }
  ];

  for (const dir of directions) {
    const adjRow = centerPos.row + dir.row;
    const adjCol = centerPos.col + dir.col;

    // Check bounds
    if (adjRow < 0 || adjRow >= GRID_ROWS || adjCol < 0 || adjCol >= GRID_COLS) {
      continue;
    }

    // Check if there's a wall blocking this direction
    const isWallBlocking = !bombTileEdges[dir.edge];

    if (isWallBlocking) {
      // Wall blocks this direction - destroy the wall by opening all edges
      bombTile.type = TileType.Cross;
      bombTile.orientation = 0;
      // Don't spawn explosion in this direction - the wall absorbed it
    } else {
      // No wall blocking - explosion spreads to adjacent tile
      explosionPositions.push({ row: adjRow, col: adjCol });
    }
  }

  // Spawn explosion sprites
  const explosionSprites: any[] = [];
  for (const pos of explosionPositions) {
    const expX = GRID_OFFSET_X + pos.col * TILE_SIZE + TILE_SIZE / 2;
    const expY = GRID_OFFSET_Y + pos.row * TILE_SIZE + TILE_SIZE / 2;

    const expSprite = k.add([
      k.sprite("explosion", { anim: "explode" }),
      k.pos(expX, expY),
      k.anchor("center"),
      k.z(200),  // High z-index to be above everything
      "explosion",
    ]);

    explosionSprites.push(expSprite);

    // Deal damage to any mob on this tile
    const mobsOnTile = objectManager.getAllObjects().filter(obj =>
      obj.gridPosition.row === pos.row &&
      obj.gridPosition.col === pos.col &&
      (obj.type === ObjectType.Player || obj.type === ObjectType.Enemy)
    );

    for (const mob of mobsOnTile) {
      if (mob.currentHP !== undefined) {
        mob.currentHP = Math.max(0, mob.currentHP - 10);

        // Show damage text
        spawnScrollingText({
          text: "10",
          x: expX,
          y: expY,
          color: { r: 255, g: 100, b: 0 },  // Orange for explosion damage
          fontSize: 20,
          behavior: "bounce",
        });

        // Check if king took damage (but didn't die) - teleport to random immovable tile
        if (mob.type === ObjectType.Enemy && mob.aiType === AIType.King && mob.currentHP > 0) {
          teleportKingToRandomImmovableTile(mob, objectManager);
        }

        // Check if mob died
        if (mob.currentHP <= 0) {
          if (mob.type === ObjectType.Player) {
            // Player died from explosion
            showGameOver();
            return;
          } else {
            objectManager.destroyObject(mob);
          }
        }
      }
    }

    // Increase tile decay by 1 (unless in boss room)
    if (!state.isBossRoom && pos.row >= 0 && pos.row < state.grid.length &&
        pos.col >= 0 && pos.col < state.grid[0].length) {
      const tile = state.grid[pos.row][pos.col];
      if (tile) {
        tile.decay = Math.min(tile.decay + 1, 10);  // Max decay is 10
      }
    }
  }

  // Wait for explosion animation
  const explosionDuration = 0.5;
  await Promise.race([
    k.wait(explosionDuration),
    new Promise(resolve => setTimeout(resolve, 1000))
  ]);

  // Destroy explosion sprites
  for (const sprite of explosionSprites) {
    sprite.destroy();
  }

  // Destroy the bomb object
  objectManager.destroyObject(bomb);

  isAnimating = false;
  render();
}

async function executeEnemyTurns(): Promise<void> {
  const state = turnManager.getState();
  const objectManager = turnManager.getObjectManager();
  const player = objectManager.getPlayer();
  if (!player) return;

  const enemyMoves = calculateAllEnemyMoves(state.grid, objectManager, player.gridPosition);

  for (const move of enemyMoves) {
    await animateEnemyMove(move);
  }

  // Process bombs after enemy turns
  await processBombs();

  turnManager.startPlayerTurn();
  render();
}

/**
 * Animates a healing action from healer to target enemy
 */
async function animateHealing(healer: MapObject, target: MapObject): Promise<void> {
  isAnimating = true;

  try {
    const healDuration = 0.5;
    const healAmount = Math.max(1, Math.floor(healer.stats?.agi || 1));  // Heal based on healer's agility stat

    // Calculate positions
    const healerX = GRID_OFFSET_X + healer.gridPosition.col * TILE_SIZE + TILE_SIZE / 2 + healer.spriteOffset.x;
    const healerY = GRID_OFFSET_Y + healer.gridPosition.row * TILE_SIZE + TILE_SIZE / 2 + healer.spriteOffset.y;

    const targetX = GRID_OFFSET_X + target.gridPosition.col * TILE_SIZE + TILE_SIZE / 2 + target.spriteOffset.x;
    const targetY = GRID_OFFSET_Y + target.gridPosition.row * TILE_SIZE + TILE_SIZE / 2 + target.spriteOffset.y;

    // Create visual effect - pulsing circle from healer to target
    const effectStart = k.add([
      k.circle(8),
      k.pos(healerX, healerY),
      k.anchor("center"),
      k.color(0, 255, 100),  // Green for healing
      k.opacity(0.8),
      k.z(3),
      "healEffect",
    ]);

    const effectEnd = k.add([
      k.circle(8),
      k.pos(targetX, targetY),
      k.anchor("center"),
      k.color(0, 255, 100),  // Green for healing
      k.opacity(0),
      k.z(3),
      "healEffect",
    ]);

    // Fade out start effect, fade in end effect
    k.tween(
      0.8,
      0,
      healDuration,
      (val) => {
        effectStart.opacity = val;
      },
      k.easings.linear
    );

    k.tween(
      0,
      0.8,
      healDuration,
      (val) => {
        effectEnd.opacity = val;
      },
      k.easings.linear
    );

    await Promise.race([
      k.wait(healDuration),
      new Promise(resolve => setTimeout(resolve, 1000))
    ]);

    // Apply healing
    if (target.currentHP !== undefined && target.stats?.hp !== undefined) {
      const hpBefore = target.currentHP;
      target.currentHP = Math.min(target.currentHP + healAmount, target.stats.hp);
      const actualHeal = target.currentHP - hpBefore;

      // Show heal text
      spawnScrollingText({
        text: `+${actualHeal}`,
        x: targetX,
        y: targetY,
        color: { r: 0, g: 255, b: 100 },  // Green for healing
        fontSize: 16,
        behavior: "static",
      });
    }

    // Cleanup effects
    effectStart.destroy();
    effectEnd.destroy();

  } catch (error) {
    console.error("[Healing] Error during healing:", error);
  } finally {
    isAnimating = false;
  }
}

/**
 * Animates a ranged attack from enemy to player
 */
async function animateRangedAttack(enemy: MapObject): Promise<void> {
  isAnimating = true;

  try {
    const player = turnManager.getObjectManager().getPlayer();
    if (!player) {
      console.warn("[RangedAttack] No player found");
      return;
    }

    const projectileSprite = enemy.projectile || "arrow";
    const attackDuration = 0.3;

    // Calculate start and end positions
    const startX = GRID_OFFSET_X + enemy.gridPosition.col * TILE_SIZE + TILE_SIZE / 2 + enemy.spriteOffset.x;
    const startY = GRID_OFFSET_Y + enemy.gridPosition.row * TILE_SIZE + TILE_SIZE / 2 + enemy.spriteOffset.y;

    const endX = GRID_OFFSET_X + player.gridPosition.col * TILE_SIZE + TILE_SIZE / 2 + player.spriteOffset.x;
    const endY = GRID_OFFSET_Y + player.gridPosition.row * TILE_SIZE + TILE_SIZE / 2 + player.spriteOffset.y;

    // Calculate angle for projectile rotation
    const deltaX = endX - startX;
    const deltaY = endY - startY;
    const angle = Math.atan2(deltaY, deltaX) * (180 / Math.PI);

    // Create projectile sprite
    const projectile = k.add([
      k.sprite(projectileSprite, { anim: "idle" }),
      k.pos(startX, startY),
      k.anchor("center"),
      k.rotate(angle + 90), // Adjust for sprite orientation (assuming arrow points up by default)
      k.z(3), // Above enemies and player
      "projectile",
    ]);

    // Animate projectile movement
    const projectilePos = projectile.pos.clone();
    k.tween(
      projectilePos,
      k.vec2(endX, endY),
      attackDuration,
      (val) => {
        projectile.pos = val;
      },
      k.easings.linear
    );

    await Promise.race([
      k.wait(attackDuration),
      new Promise(resolve => setTimeout(resolve, 1000))
    ]);

    // Projectile reached player, execute combat
    const combatResult = executeCombat(enemy, player);

    // Show damage text
    if (combatResult.attackerAttack.hit) {
      const damageText = combatResult.attackerAttack.critical
        ? `${combatResult.attackerAttack.damage}!`
        : `${combatResult.attackerAttack.damage}`;
      const damageColor = combatResult.attackerAttack.critical
        ? { r: 255, g: 255, b: 100 }  // Yellow for crits
        : { r: 255, g: 100, b: 100 };  // Red for normal hits

      spawnScrollingText({
        text: damageText,
        x: endX,
        y: endY,
        color: damageColor,
        fontSize: combatResult.attackerAttack.critical ? 24 : 16,
        behavior: combatResult.attackerAttack.critical ? "bounce" : "static",
      });
    } else {
      spawnScrollingText({
        text: "MISS",
        x: endX,
        y: endY,
        color: { r: 150, g: 150, b: 150 },
        fontSize: 16,
        behavior: "fade",
      });
    }

    // Destroy projectile
    projectile.destroy();

    // Check if player died
    if (combatResult.attackerAttack.defenderDied) {
      showGameOver();
      return;
    }

  } catch (error) {
    console.error("[RangedAttack] Error during ranged attack:", error);
  } finally {
    isAnimating = false;
  }
}

/**
 * Animates a teleport from current position to target position
 */
async function animateTeleport(enemy: MapObject, targetPos: GridPosition): Promise<void> {
  isAnimating = true;

  try {
    const teleportDuration = 0.4;

    // Calculate start and end positions
    const startX = GRID_OFFSET_X + enemy.gridPosition.col * TILE_SIZE + TILE_SIZE / 2 + enemy.spriteOffset.x;
    const startY = GRID_OFFSET_Y + enemy.gridPosition.row * TILE_SIZE + TILE_SIZE / 2 + enemy.spriteOffset.y;

    const endX = GRID_OFFSET_X + targetPos.col * TILE_SIZE + TILE_SIZE / 2 + enemy.spriteOffset.x;
    const endY = GRID_OFFSET_Y + targetPos.row * TILE_SIZE + TILE_SIZE / 2 + enemy.spriteOffset.y;

    // Find the enemy sprite
    const mapObjs = k.get("mapObject");
    let enemySprite: any = null;
    for (const obj of mapObjs) {
      const objData = (obj as any).objectData as MapObject;
      if (objData && objData.id === enemy.id) {
        enemySprite = obj;
        break;
      }
    }

    if (!enemySprite) {
      console.warn(`[Teleport] Could not find sprite for enemy ${enemy.id}`);
      return;
    }

    // Create poof effect at start position
    const poofStart = k.add([
      k.sprite("poof", { anim: "poof" }),
      k.pos(startX, startY),
      k.anchor("center"),
      k.z(3),
      "teleportEffect",
    ]);

    // Fade out enemy sprite
    const originalOpacity = enemySprite.opacity ?? 1;
    k.tween(
      originalOpacity,
      0,
      teleportDuration / 2,
      (val) => {
        enemySprite.opacity = val;
      },
      k.easings.easeInQuad
    );

    await Promise.race([
      k.wait(teleportDuration / 2),
      new Promise(resolve => setTimeout(resolve, 500))
    ]);

    // Update enemy position
    enemy.gridPosition = { ...targetPos };
    enemy.pixelOffset = { x: 0, y: 0 };

    // Move sprite to new position (instantly)
    enemySprite.pos = k.vec2(endX, endY);

    // Create poof effect at end position
    const poofEnd = k.add([
      k.sprite("poof", { anim: "poof" }),
      k.pos(endX, endY),
      k.anchor("center"),
      k.z(3),
      "teleportEffect",
    ]);

    // Fade in enemy sprite at new position
    k.tween(
      0,
      originalOpacity,
      teleportDuration / 2,
      (val) => {
        enemySprite.opacity = val;
      },
      k.easings.easeOutQuad
    );

    await Promise.race([
      k.wait(teleportDuration / 2),
      new Promise(resolve => setTimeout(resolve, 500))
    ]);

    // Cleanup effects
    poofStart.destroy();
    poofEnd.destroy();

    // After teleporting, check if adjacent to player and attack if so
    const player = turnManager.getObjectManager().getPlayer();
    if (player) {
      const distance = manhattanDistance(enemy.gridPosition, player.gridPosition);
      if (distance === 1) {
        const combatResult = executeCombat(enemy, player);

        // Show damage text
        if (combatResult.attackerAttack.hit) {
          const damageText = combatResult.attackerAttack.critical
            ? `${combatResult.attackerAttack.damage}!`
            : `${combatResult.attackerAttack.damage}`;
          const damageColor = combatResult.attackerAttack.critical
            ? { r: 255, g: 255, b: 100 }
            : { r: 255, g: 100, b: 100 };

          spawnScrollingText({
            text: damageText,
            x: endX + TILE_SIZE / 2,
            y: endY,
            color: damageColor,
            fontSize: combatResult.attackerAttack.critical ? 24 : 16,
            behavior: combatResult.attackerAttack.critical ? "bounce" : "static",
          });
        } else {
          spawnScrollingText({
            text: "MISS",
            x: endX + TILE_SIZE / 2,
            y: endY,
            color: { r: 150, g: 150, b: 150 },
            fontSize: 16,
            behavior: "fade",
          });
        }

        // Check if player died
        if (combatResult.attackerAttack.defenderDied) {
          showGameOver();
          return;
        }
      }
    }

  } catch (error) {
    console.error("[Teleport] Error during teleport:", error);
  } finally {
    isAnimating = false;
    render();
  }
}

function manhattanDistance(a: GridPosition, b: GridPosition): number {
  return Math.abs(a.row - b.row) + Math.abs(a.col - b.col);
}

/**
 * Animates a summon action - creates a skeleton with rise animation
 */
async function animateSummon(summoner: MapObject, summonPos: GridPosition): Promise<void> {
  isAnimating = true;

  try {
    const summonDuration = 0.5;

    // Calculate summoner position
    const summonerX = GRID_OFFSET_X + summoner.gridPosition.col * TILE_SIZE + TILE_SIZE / 2 + summoner.spriteOffset.x;
    const summonerY = GRID_OFFSET_Y + summoner.gridPosition.row * TILE_SIZE + TILE_SIZE / 2 + summoner.spriteOffset.y;

    // Create purple visual effect on summoner only
    const summonEffect = k.add([
      k.circle(8),
      k.pos(summonerX, summonerY),
      k.anchor("center"),
      k.color(150, 50, 200),  // Purple for summoning
      k.opacity(0.8),
      k.z(3),
      "summonEffect",
    ]);

    // Pulse effect - fade out then back in
    k.tween(
      0.8,
      0,
      summonDuration,
      (val) => {
        summonEffect.opacity = val;
      },
      k.easings.linear
    );

    await Promise.race([
      k.wait(summonDuration),
      new Promise(resolve => setTimeout(resolve, 1000))
    ]);

    // Cleanup effect
    summonEffect.destroy();

    // Create skeleton at summon position
    const objectManager = turnManager.getObjectManager();
    const skeleton = objectManager.createEnemy(summonPos, "skeleton");

    // Calculate skeleton sprite position
    const skeletonX = GRID_OFFSET_X + summonPos.col * TILE_SIZE + TILE_SIZE / 2 + skeleton.spriteOffset.x;
    const skeletonY = GRID_OFFSET_Y + summonPos.row * TILE_SIZE + TILE_SIZE / 2 + skeleton.spriteOffset.y;

    // Manually create skeleton sprite with rise animation (since render() is blocked by isAnimating)
    const skeletonSprite = k.add([
      k.sprite("skeleton", { anim: "rise" }),
      k.pos(skeletonX, skeletonY),
      k.anchor("center"),
      k.z(2),
      "summonedSkeleton",
    ]);

    // Wait for rise animation to complete
    // Rise animation is frames 4-7 (4 frames), assuming default animation speed
    const riseAnimDuration = 0.6;
    await Promise.race([
      k.wait(riseAnimDuration),
      new Promise(resolve => setTimeout(resolve, 1000))
    ]);

    // Destroy the temporary sprite
    skeletonSprite.destroy();

    // The skeleton object exists in objectManager, it will be rendered normally on next render()

  } catch (error) {
    console.error("[Summon] Error during summon:", error);
  } finally {
    isAnimating = false;
    render();
  }
}

/**
 * Animates a boss spawn action - king spawns a random enemy
 */
async function animateBossSpawn(king: MapObject, enemyType: string, spawnPos: GridPosition): Promise<void> {
  isAnimating = true;

  try {
    const spawnDuration = 0.5;

    // Calculate king position
    const kingX = GRID_OFFSET_X + king.gridPosition.col * TILE_SIZE + TILE_SIZE / 2 + king.spriteOffset.x;
    const kingY = GRID_OFFSET_Y + king.gridPosition.row * TILE_SIZE + TILE_SIZE / 2 + king.spriteOffset.y;

    // Create golden/orange visual effect on king
    const bossEffect = k.add([
      k.circle(12),
      k.pos(kingX, kingY),
      k.anchor("center"),
      k.color(255, 215, 0),  // Gold for boss spawn
      k.opacity(0.8),
      k.z(3),
      "bossSpawnEffect",
    ]);

    // Pulse effect - fade out then back in
    k.tween(
      0.8,
      0,
      spawnDuration,
      (val) => {
        bossEffect.opacity = val;
      },
      k.easings.linear
    );

    await Promise.race([
      k.wait(spawnDuration),
      new Promise(resolve => setTimeout(resolve, 1000))
    ]);

    // Cleanup effect
    bossEffect.destroy();

    // Create enemy at spawn position
    const objectManager = turnManager.getObjectManager();
    const spawnedEnemy = objectManager.createEnemy(spawnPos, enemyType);
    spawnedEnemy.spawnedByKing = true;  // Mark enemy as spawned by king for bomb drops

    // Calculate spawn position
    const spawnX = GRID_OFFSET_X + spawnPos.col * TILE_SIZE + TILE_SIZE / 2 + spawnedEnemy.spriteOffset.x;
    const spawnY = GRID_OFFSET_Y + spawnPos.row * TILE_SIZE + TILE_SIZE / 2 + spawnedEnemy.spriteOffset.y;

    // Check if spawned enemy has a rise animation (like skeleton)
    const hasRiseAnim = enemyType === "skeleton";

    // Manually create enemy sprite (since render() is blocked by isAnimating)
    const spawnedSprite = k.add([
      k.sprite(enemyType, { anim: hasRiseAnim ? "rise" : "idle" }),
      k.pos(spawnX, spawnY),
      k.anchor("center"),
      k.z(2),
      "bossSpawnedEnemy",
    ]);

    // If it has a rise animation, wait for it
    if (hasRiseAnim) {
      const riseAnimDuration = 0.6;
      await Promise.race([
        k.wait(riseAnimDuration),
        new Promise(resolve => setTimeout(resolve, 1000))
      ]);
    } else {
      // Brief pause for other enemies
      await Promise.race([
        k.wait(0.3),
        new Promise(resolve => setTimeout(resolve, 500))
      ]);
    }

    // Destroy the temporary sprite
    spawnedSprite.destroy();

    // The enemy object exists in objectManager, it will be rendered normally on next render()

  } catch (error) {
    console.error("[BossSpawn] Error during boss spawn:", error);
  } finally {
    isAnimating = false;
    render();
  }
}

async function animateEnemyMove(move: EnemyMove): Promise<void> {
  const { enemy, path, isRangedAttack, isHealingAction, healTarget, isTeleportAction, isSummonAction, summonPosition, isBossSpawnAction, bossSpawnEnemyType, bossSpawnPosition } = move;

  // Check if this is a healing action
  if (isHealingAction && healTarget) {
    await animateHealing(enemy, healTarget);
    return;
  }

  // Check if this is a ranged attack
  if (isRangedAttack) {
    await animateRangedAttack(enemy);
    return;
  }

  // Check if this is a teleport action
  if (isTeleportAction) {
    await animateTeleport(enemy, path[path.length - 1]);
    return;
  }

  // Check if this is a summon action
  if (isSummonAction && summonPosition) {
    await animateSummon(enemy, summonPosition);
    return;
  }

  // Check if this is a boss spawn action
  if (isBossSpawnAction && bossSpawnEnemyType && bossSpawnPosition) {
    await animateBossSpawn(enemy, bossSpawnEnemyType, bossSpawnPosition);
    return;
  }

  if (path.length <= 1) return;

  isAnimating = true;

  try {
    const stepDuration = 0.12;

    const mapObjs = k.get("mapObject");
  for (const obj of mapObjs) {
    const objData = (obj as any).objectData as MapObject;
    if (objData.id === enemy.id) {
      obj.destroy();
      break;
    }
  }

  const from = path[0];
  const startX = GRID_OFFSET_X + from.col * TILE_SIZE + TILE_SIZE / 2 + enemy.spriteOffset.x;
  const startY = GRID_OFFSET_Y + from.row * TILE_SIZE + TILE_SIZE / 2 + enemy.spriteOffset.y;

  // Determine facing direction from first move
  let shouldFlip = enemy.flipX;
  if (path.length > 1) {
    const firstMove = path[1];
    if (firstMove.col < from.col) {
      shouldFlip = true;  // Moving left
      enemy.flipX = true;
    } else if (firstMove.col > from.col) {
      shouldFlip = false;  // Moving right
      enemy.flipX = false;
    }
    // If moving only vertically, keep current facing
  }

  const color = (enemy as any).color;
  const spriteComponents: any[] = [
    k.sprite(enemy.sprite, { anim: "idle", flipX: shouldFlip }),
    k.pos(startX, startY),
    k.anchor("center"),
    k.z(2), // Above decay overlay and tiles
    "movingEnemy",
  ];
  if (color) {
    spriteComponents.push(k.color(color.r, color.g, color.b));
  }

  const movingSprite = k.add(spriteComponents);
  const objectManager = turnManager.getObjectManager();

  for (let i = 1; i < path.length; i++) {
    const previousPos = path[i - 1];
    const to = path[i];

    // Check if there will be combat at this position
    const objectsAtPosition = objectManager.getObjectsAtPosition(to.row, to.col);
    const target = checkForCombat(enemy, objectsAtPosition);

    // Check if another enemy is blocking this position
    const blockingEnemy = objectsAtPosition.find(obj =>
      obj.id !== enemy.id &&
      obj.type === ObjectType.Enemy
    );

    // If blocked by another enemy, stop movement here
    if (blockingEnemy) {
      break;
    }

    const tileCenterX = GRID_OFFSET_X + to.col * TILE_SIZE + TILE_SIZE / 2 + enemy.spriteOffset.x;
    const tileCenterY = GRID_OFFSET_Y + to.row * TILE_SIZE + TILE_SIZE / 2 + enemy.spriteOffset.y;

    let endX = tileCenterX;
    let endY = tileCenterY;

    // If combat will occur, stop 16 pixels before the tile center
    if (target) {
      const deltaX = tileCenterX - movingSprite.pos.x;
      const deltaY = tileCenterY - movingSprite.pos.y;
      const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

      if (distance > 0) {
        const stopDistance = Math.max(0, distance - 16);
        const ratio = stopDistance / distance;
        endX = movingSprite.pos.x + deltaX * ratio;
        endY = movingSprite.pos.y + deltaY * ratio;
      }
    }

    const currentPos = movingSprite.pos.clone();

    k.tween(
      currentPos,
      k.vec2(endX, endY),
      stepDuration,
      (val) => {
        movingSprite.pos = val;
      },
      k.easings.easeOutQuad
    );

    await Promise.race([
      k.wait(stepDuration),
      new Promise(resolve => setTimeout(resolve, 1000)) // 1s timeout
    ]);

    enemy.gridPosition.row = to.row;
    enemy.gridPosition.col = to.col;

    if (target) {
      const combatResult = executeCombat(enemy, target);

      // Spawn SCT for attacker's damage on defender
      const defenderX = GRID_OFFSET_X + target.gridPosition.col * TILE_SIZE + TILE_SIZE / 2 + target.spriteOffset.x;
      const defenderY = GRID_OFFSET_Y + target.gridPosition.row * TILE_SIZE + TILE_SIZE / 2 + target.spriteOffset.y;

      if (combatResult.attackerAttack.hit) {
        const damageText = combatResult.attackerAttack.critical
          ? `${combatResult.attackerAttack.damage}!`
          : `${combatResult.attackerAttack.damage}`;
        const damageColor = combatResult.attackerAttack.critical
          ? { r: 255, g: 255, b: 100 }  // Yellow for crits
          : { r: 255, g: 100, b: 100 };  // Red for normal hits

        spawnScrollingText({
          text: damageText,
          x: defenderX,
          y: defenderY,
          color: damageColor,
          fontSize: combatResult.attackerAttack.critical ? 24 : 16,
          behavior: combatResult.attackerAttack.critical ? "bounce" : "static",
        });
      } else {
        spawnScrollingText({
          text: "MISS",
          x: defenderX,
          y: defenderY,
          color: { r: 150, g: 150, b: 150 },
          fontSize: 16,
          behavior: "fade",
        });
      }

      // Check if target (player) died
      if (combatResult.attackerAttack.defenderDied) {
        // Clean up moving sprite before showing game over
        movingSprite.destroy();
        showGameOver();
        return;
      } else {
        // Defender survived - bounce enemy back to previous position
        const bounceX = GRID_OFFSET_X + previousPos.col * TILE_SIZE + TILE_SIZE / 2;
        const bounceY = GRID_OFFSET_Y + previousPos.row * TILE_SIZE + TILE_SIZE / 2;

        const bouncePos = movingSprite.pos.clone();
        k.tween(
          bouncePos,
          k.vec2(bounceX, bounceY),
          stepDuration,
          (val) => {
            movingSprite.pos = val;
          },
          k.easings.easeOutQuad
        );

        await Promise.race([
          k.wait(stepDuration),
          new Promise(resolve => setTimeout(resolve, 1000)) // 1s timeout
        ]);

        enemy.gridPosition.row = previousPos.row;
        enemy.gridPosition.col = previousPos.col;

        // Stop movement after bounce
        break;
      }
    }
  }
  } catch (error) {
    console.error("[animateEnemyMove] Error during enemy movement:", error);
  } finally {
    k.destroyAll("movingEnemy");
    turnManager.getObjectManager().spendMovement(enemy, path.length - 1);

    isAnimating = false;
    render();
  }
}

function handleRightClick(): void {
  if (isAnimating) return;

  const pos = k.mousePos();

  // Close context menu if visible and right-click outside
  if (contextMenu.visible) {
    hideContextMenu();
    return;
  }

  // Check for right-click on inventory item
  const inventoryItem = getInventoryItemAtPosition(pos.x, pos.y, turnManager);
  if (inventoryItem) {
    showContextMenu(pos.x, pos.y, inventoryItem.index);
    return;
  }

  // Pass to click manager for other right-click actions
  clickManager.handleRightClick(pos, turnManager, isAnimating);
}

function handleMouseMove(): void {
  // Don't process during animations
  if (isAnimating) {
    return;
  }

  // Re-render when context menu is visible to update hover highlighting
  if (contextMenu.visible) {
    render();
    return;
  }

  const state = turnManager.getState();
  const mousePos = k.mousePos();

  // Use the screenToGrid utility from PositionUtils
  const gridPos = screenToGrid(mousePos.x, mousePos.y);

  // If not over a grid tile, clear hover state
  if (!gridPos) {
    if (hoveredTilePosition !== null) {
      hoveredTilePosition = null;
      connectedTiles = [];
      render();
    }
    return;
  }

  // Check if the cursor is showing "default" (no special action)
  // We need to check the cursor manager's internal state
  // For now, we'll check if we're in a state where tile highlighting makes sense
  const isPlayerTurn = state.turnOwner === TurnOwner.Player;
  const isTilePlacement = state.playerPhase === PlayerPhase.TilePlacement;
  const isRotating = state.playerPhase === PlayerPhase.RotatingTile;

  // Only highlight when:
  // - Not in tile placement mode (plots would be showing)
  // - Not in rotation mode (rotation overlay would be showing)
  // - Not over a reachable/actionable tile
  const shouldHighlight = isPlayerTurn && !isTilePlacement && !isRotating;

  if (!shouldHighlight) {
    if (hoveredTilePosition !== null) {
      hoveredTilePosition = null;
      connectedTiles = [];
      render();
    }
    return;
  }

  // Check if we're hovering over a tile that would cause a cursor change
  const player = turnManager.getObjectManager().getPlayer();
  if (player && player.movesRemaining > 0) {
    // Check if hovering over player's current tile (rotate cursor shows)
    const isPlayerTile = (gridPos.row === player.gridPosition.row &&
                         gridPos.col === player.gridPosition.col);

    const moves = turnManager.getObjectManager().getAvailableMoves(player);
    const reachable = findReachableTiles(state.grid, player.gridPosition, moves, [], true);
    const isReachable = reachable.some(t => t.position.row === gridPos.row && t.position.col === gridPos.col && t.path.length > 1);

    // Check if it's an adjacent wall that could be bumped
    const dRow = Math.abs(gridPos.row - player.gridPosition.row);
    const dCol = Math.abs(gridPos.col - player.gridPosition.col);
    const isAdjacent = (dRow === 1 && dCol === 0) || (dRow === 0 && dCol === 1);
    const isBlockedWall = isAdjacent && isWallBlocking(state.grid, player.gridPosition, gridPos);

    // Don't highlight if cursor would change (player tile, reachable tile, or wall)
    if (isPlayerTile || isReachable || isBlockedWall) {
      if (hoveredTilePosition !== null) {
        hoveredTilePosition = null;
        connectedTiles = [];
        render();
      }
      return;
    }
  }

  // Check if position has changed
  if (hoveredTilePosition &&
      hoveredTilePosition.row === gridPos.row &&
      hoveredTilePosition.col === gridPos.col) {
    return; // Same tile, no update needed
  }

  // Update hovered tile and find connected tiles
  hoveredTilePosition = gridPos;
  connectedTiles = findConnectedTiles(state.grid, gridPos);
  render();
}

async function tryMovePlayerInDirection(rowDelta: number, colDelta: number): Promise<void> {
  if (isAnimating) return;
  if (!turnManager.isPlayerTurn() || turnManager.isTilePlacement()) return;

  const player = turnManager.getObjectManager().getPlayer();
  if (!player || player.movesRemaining <= 0) return;

  const targetRow = player.gridPosition.row + rowDelta;
  const targetCol = player.gridPosition.col + colDelta;

  // Check if target is within grid bounds
  if (targetRow < 0 || targetRow >= GRID_ROWS || targetCol < 0 || targetCol >= GRID_COLS) {
    return;
  }

  const state = turnManager.getState();
  const targetPos = { row: targetRow, col: targetCol };
  const moves = turnManager.getObjectManager().getAvailableMoves(player);
  const reachable = findReachableTiles(state.grid, player.gridPosition, moves, [], true);

  const target = reachable.find(
    (t) => t.position.row === targetRow && t.position.col === targetCol
  );

  if (target && target.path.length > 1) {
    movePlayerAlongPath(player, target.path);
  } else {
    // Check if this is a wall bump (adjacent tile blocked by wall)
    const dRow = Math.abs(targetPos.row - player.gridPosition.row);
    const dCol = Math.abs(targetPos.col - player.gridPosition.col);
    const isAdjacent = (dRow === 1 && dCol === 0) || (dRow === 0 && dCol === 1);

    if (isAdjacent && isWallBlocking(state.grid, player.gridPosition, targetPos)) {
      await handleWallBump(player, targetPos);
    }
  }
}

async function handleMoveUp(): Promise<void> {
  await tryMovePlayerInDirection(-1, 0);
}

async function handleMoveDown(): Promise<void> {
  await tryMovePlayerInDirection(1, 0);
}

async function handleMoveLeft(): Promise<void> {
  await tryMovePlayerInDirection(0, -1);
}

async function handleMoveRight(): Promise<void> {
  await tryMovePlayerInDirection(0, 1);
}


// Manager setters for scene initialization
export function setTurnManager(tm: TurnManager): void {
  turnManager = tm;
}

export function setInputController(_ic: InputController): void {
  // Stored in scene scope
}

export function setCursorManager(_cm: CursorManager): void {
  // Stored in scene scope
}

export function resetAnimationFlag(): void {
  isAnimating = false;
}

// Initialize all game event handlers
export function initializeGameHandlers(
  tm: TurnManager,
  ic: InputController,
  cm: CursorManager
): void {
  // Reset module-level state (in case scene reloaded)
  isAnimating = false;
  lastHoveredItemId = null;
  lastHighlightedSlots = [];
  hoveredTilePosition = null;
  connectedTiles = [];

  // Initialize click manager with callbacks
  const clickCallbacks: ClickCallbacks = {
    onSkipTurn: () => {
      const player = tm.getObjectManager().getPlayer();
      if (player) skipPlayerTurn(player);
    },
    onRotatePlayerTile: () => {
      tm.rotatePlayerTile();
      render();
    },
    onConfirmRotation: async () => {
      tm.confirmRotation();
      render();
      // Rotating a tile ends the player's turn - execute enemy turns
      await executeEnemyTurns();
    },
    onCancelRotation: () => {
      tm.cancelRotation();
      render();
    },
    onPlayerClicked: () => {
      tm.enterRotationMode();
      render();
    },
    onMovePlayer: (path: GridPosition[]) => {
      const player = tm.getObjectManager().getPlayer();
      if (player) movePlayerAlongPath(player, path);
    },
    onWallBump: (targetPos: GridPosition) => {
      const player = tm.getObjectManager().getPlayer();
      if (player) handleWallBump(player, targetPos);
    },
    onRotateTile: () => {
      tm.rotateTile();
    },
    onRotateTileCounterClockwise: () => {
      tm.rotateTileCounterClockwise();
    },
    onEnterTilePlacement: () => {
      tm.enterTilePlacement();
    },
    onExecutePush: () => {
      if (tm.canPush()) {
        executePushWithAnimation();
      }
    },
    onSelectPlot: (plot: PlotPosition) => {
      tm.selectPlot(plot);
    },
    onCancelPlacement: () => {
      tm.cancelPlacement();
    },
  };

  clickManager = new ClickManager(clickCallbacks);

  // Set up mouse event handlers
  k.onMousePress("left", handleClick);
  k.onMousePress("right", handleRightClick);
  k.onMouseMove(handleMouseMove);

  // Set up keyboard event handlers using predefined buttons from kaplayCtx
  k.onButtonPress("up", handleMoveUp);
  k.onButtonPress("down", handleMoveDown);
  k.onButtonPress("left", handleMoveLeft);
  k.onButtonPress("right", handleMoveRight);

  // Debug button - instantly enter boss room
  k.onButtonPress("debug", () => {
    if (isAnimating) return;

    // Call enterBossRoom to set the global state
    enterBossRoom();

    // Reload the main scene to enter boss room
    k.go("main");
  });

  // Abort button - exit tile placement, rotation mode, or context menu
  k.onButtonPress("abort", () => {
    if (isAnimating) return;

    // Close context menu first if visible
    if (contextMenu.visible) {
      hideContextMenu();
      return;
    }

    if (tm.isTilePlacement()) {
      tm.cancelPlacement();
    } else if (tm.isRotatingTile()) {
      tm.cancelRotation();
    }
  });

  // Set up input controller callbacks
  ic.setOnPushRequested(() => {
    if (!isAnimating && tm.canPush()) {
      executePushWithAnimation();
    }
  });

  ic.setIsAnimating(() => isAnimating);

  // Register cursor update callback
  k.onDraw(() => {
    cm.update(tm);
  });

  // Register hover detection for item descriptions (runs every frame)
  k.onDraw(() => {
    if (isAnimating) return;

    const mousePos = k.mousePos();

    // Only check hover if mouse is in the UI area (right side of screen)
    // UI starts at GRID_OFFSET_X + GRID_COLS * TILE_SIZE
    const uiStartX = GRID_OFFSET_X + GRID_COLS * TILE_SIZE;
    const state = tm.getState();
    const itemDatabase = tm.getObjectManager().getItemDatabase();

    if (mousePos.x < uiStartX) {
      // Mouse is over the game grid, not UI - clear any existing hover
      if (lastHoveredItemId !== null) {
        lastHoveredItemId = null;
        k.destroyAll("descriptionText");
      }
      if (lastHighlightedSlots.length > 0) {
        lastHighlightedSlots = [];
        updateEquipmentSlotHighlighting([], state.equipment, itemDatabase);
      }
      return;
    }

    let hoveredItemId: string | null = null;
    let highlightedSlots: number[] = [];

    // Check inventory for hover using shared utility
    const inventoryItem = getInventoryItemAtPosition(mousePos.x, mousePos.y, tm);
    if (inventoryItem) {
      hoveredItemId = inventoryItem.item.definitionId;

      // Determine which equipment slots should be highlighted
      const itemDef = itemDatabase.getItem(inventoryItem.item.definitionId);
      if (itemDef) {
        highlightedSlots = getOccupiedSlots(itemDef);
      }
    }

    // Check equipment for hover using shared utility
    if (!hoveredItemId) {
      const equipmentItem = getEquipmentItemAtPosition(mousePos.x, mousePos.y, tm);
      if (equipmentItem) {
        hoveredItemId = equipmentItem.item.definitionId;
      }
    }

    // Update equipment slot highlighting if changed
    const slotsChanged = highlightedSlots.length !== lastHighlightedSlots.length ||
      !highlightedSlots.every((slot, i) => slot === lastHighlightedSlots[i]);

    if (slotsChanged) {
      lastHighlightedSlots = highlightedSlots;
      updateEquipmentSlotHighlighting(highlightedSlots, state.equipment, itemDatabase);
    }

    // Only update description if hovered item changed
    if (hoveredItemId !== lastHoveredItemId) {
      lastHoveredItemId = hoveredItemId;

      // Clear previous description
      k.destroyAll("descriptionText");
      k.destroyAll("descriptionBackground");

      // Update description with hovered item (or empty if no item)
      const itemDef = hoveredItemId ? itemDatabase.getItem(hoveredItemId) : undefined;
      updateDescription(itemDef);
    }
  });
}

function clearAll(): void {
  clearGrid();
  clearMapObjects();
  clearUI();
  k.destroyAll("rotationOverlay");
  k.destroyAll("connectedTilesHighlight");
  k.destroyAll("contextMenu");
  k.destroyAll("contextMenuOption");
  lastHoveredItemId = null; // Reset hover state so description updates after render
  lastHighlightedSlots = []; // Reset equipment slot highlights
}

async function executePushWithAnimation(): Promise<void> {
  const state = turnManager.getState();
  if (!state.currentTile || !state.selectedPlot) return;

  isAnimating = true;
  clearAll();

  const mapObjects = turnManager.getMapObjects();

  try {
    await animatePush(
      state.grid,
      state.selectedPlot,
      state.currentTile,
      mapObjects,
      GRID_OFFSET_X,
      GRID_OFFSET_Y,
      GRID_ROWS,
      GRID_COLS,
      TILE_SIZE,
      () => {
        isAnimating = false;
        turnManager.executePush();
      },
      state.isInStartLevelSequence,
      state.revealedTiles
    );

    // Pushing a tile ends the player's turn - execute enemy turns
    await executeEnemyTurns();
  } catch (error) {
    console.error("[executePushWithAnimation] Error during push animation:", error);
    isAnimating = false;
    turnManager.executePush();
    render();
  }
}

function drawRotationOverlay(
  rotatingPos: GridPosition,
  reachableTiles: ReachableTile[],
  gridOffsetX: number,
  gridOffsetY: number,
  tileSize: number
): void {
  // Create a set of positions that should NOT be darkened
  const activeTiles = new Set<string>();

  // Add rotating tile position
  activeTiles.add(`${rotatingPos.row},${rotatingPos.col}`);

  // Add reachable tile positions
  for (const tile of reachableTiles) {
    activeTiles.add(`${tile.position.row},${tile.position.col}`);
  }

  // Draw dark overlay on all non-active tiles
  for (let r = 0; r < GRID_ROWS; r++) {
    for (let c = 0; c < GRID_COLS; c++) {
      const key = `${r},${c}`;
      if (!activeTiles.has(key)) {
        const x = gridOffsetX + c * tileSize;
        const y = gridOffsetY + r * tileSize;

        k.add([
          k.rect(tileSize, tileSize),
          k.pos(x, y),
          k.color(0, 0, 0),
          k.opacity(0.6),
          k.z(5),
          "rotationOverlay",
        ]);
      }
    }
  }
}

/**
 * Draws subtle highlight overlay on connected tiles
 */
function drawConnectedTilesHighlight(
  connectedTiles: GridPosition[],
  gridOffsetX: number,
  gridOffsetY: number,
  tileSize: number
): void {
  for (const tile of connectedTiles) {
    const x = gridOffsetX + tile.col * tileSize;
    const y = gridOffsetY + tile.row * tileSize;

    k.add([
      k.rect(tileSize, tileSize),
      k.pos(x, y),
      k.color(255, 255, 255),
      k.opacity(0.1),
      k.z(3), // Above tiles but below objects
      "connectedTilesHighlight",
    ]);
  }
}

export function render(): void {
  if (isAnimating) {
    return;
  }

  clearAll();

  const state = turnManager.getState();
  const mapObjects = turnManager.getMapObjects();
  const player = turnManager.getObjectManager().getPlayer();

  // Get item database for UI rendering
  const itemDatabase = turnManager.getObjectManager().getItemDatabase();

  // Draw the entire UI panel
  drawUI(player || null, state, itemDatabase);

  // Draw level info
  drawLevelInfo(state.currentLevel);

  // Draw saga font sample text
  // k.add([
  //   k.text("The quick brown Fox jumps over the lazy Dog.", { font: "saga", size: 16 }),
  //   k.pos(GRID_OFFSET_X, 10),
  //   k.color(255, 255, 255),
  //   k.z(100),
  //   "sagaText",
  // ]);

  if (state.turnOwner === TurnOwner.Player) {
    if (state.playerPhase === PlayerPhase.RotatingTile) {
      // Rotation mode rendering
      drawGridWithOverlay(state.grid, null, GRID_OFFSET_X, GRID_OFFSET_Y, GRID_ROWS, GRID_COLS, TILE_SIZE, 640, 360, state.isInStartLevelSequence, state.revealedTiles);
      drawDecayOverlay(state.grid, GRID_OFFSET_X, GRID_OFFSET_Y, TILE_SIZE, state.isInStartLevelSequence, state.revealedTiles);

      // Draw darkening overlay on non-active tiles
      if (state.rotatingTilePosition && player) {
        const moves = turnManager.getObjectManager().getAvailableMoves(player);
        const reachable = findReachableTiles(state.grid, state.rotatingTilePosition, moves, [], true);
        drawRotationOverlay(state.rotatingTilePosition, reachable, GRID_OFFSET_X, GRID_OFFSET_Y, TILE_SIZE);
      }

      drawMapObjects(mapObjects, GRID_OFFSET_X, GRID_OFFSET_Y, TILE_SIZE, state.isInStartLevelSequence, state.revealedTiles);
      if (state.currentTile) {
        drawPreviewTile(state.currentTile, PREVIEW_X, PREVIEW_Y);
      }
    } else if (state.playerPhase === PlayerPhase.TilePlacement && state.currentTile) {
      drawGridWithOverlay(state.grid, state.selectedPlot, GRID_OFFSET_X, GRID_OFFSET_Y, GRID_ROWS, GRID_COLS, TILE_SIZE, 640, 360, state.isInStartLevelSequence, state.revealedTiles);
      drawDecayOverlay(state.grid, GRID_OFFSET_X, GRID_OFFSET_Y, TILE_SIZE, state.isInStartLevelSequence, state.revealedTiles);

      drawMapObjects(mapObjects, GRID_OFFSET_X, GRID_OFFSET_Y, TILE_SIZE, state.isInStartLevelSequence, state.revealedTiles);
      const plots = turnManager.getPlots();
      drawPlots(plots, state.selectedPlot, state.playerPhase, GRID_OFFSET_X, GRID_OFFSET_Y, GRID_ROWS, GRID_COLS, TILE_SIZE);
      if (state.selectedPlot) {
        drawCurrentTile(state.currentTile, state.selectedPlot, GRID_OFFSET_X, GRID_OFFSET_Y, GRID_ROWS, GRID_COLS, TILE_SIZE);
      } else {
        drawPreviewTile(state.currentTile, PREVIEW_X, PREVIEW_Y);
      }
    } else {
      drawGridWithOverlay(state.grid, null, GRID_OFFSET_X, GRID_OFFSET_Y, GRID_ROWS, GRID_COLS, TILE_SIZE, 640, 360, state.isInStartLevelSequence, state.revealedTiles);
      drawDecayOverlay(state.grid, GRID_OFFSET_X, GRID_OFFSET_Y, TILE_SIZE, state.isInStartLevelSequence, state.revealedTiles);

      // Draw connected tiles highlight when hovering
      if (connectedTiles.length > 0) {
        drawConnectedTilesHighlight(connectedTiles, GRID_OFFSET_X, GRID_OFFSET_Y, TILE_SIZE);
      }

      drawMapObjects(mapObjects, GRID_OFFSET_X, GRID_OFFSET_Y, TILE_SIZE, state.isInStartLevelSequence, state.revealedTiles);
      if (state.currentTile) {
        drawPreviewTile(state.currentTile, PREVIEW_X, PREVIEW_Y);
        const plots = turnManager.getPlots();
        drawPlots(plots, null, state.playerPhase, GRID_OFFSET_X, GRID_OFFSET_Y, GRID_ROWS, GRID_COLS, TILE_SIZE);
      }
    }
  } else {
    // Enemy turn - still show plots and tile preview
    drawGridWithOverlay(state.grid, null, GRID_OFFSET_X, GRID_OFFSET_Y, GRID_ROWS, GRID_COLS, TILE_SIZE, 640, 360, state.isInStartLevelSequence, state.revealedTiles);
    drawDecayOverlay(state.grid, GRID_OFFSET_X, GRID_OFFSET_Y, TILE_SIZE, state.isInStartLevelSequence, state.revealedTiles);

    drawMapObjects(mapObjects, GRID_OFFSET_X, GRID_OFFSET_Y, TILE_SIZE, state.isInStartLevelSequence, state.revealedTiles);

    // Keep showing the tile preview and plots during enemy turn
    if (state.currentTile) {
      drawPreviewTile(state.currentTile, PREVIEW_X, PREVIEW_Y);
      const plots = turnManager.getPlots();
      drawPlots(plots, null, state.playerPhase, GRID_OFFSET_X, GRID_OFFSET_Y, GRID_ROWS, GRID_COLS, TILE_SIZE);
    }
  }

  // Draw context menu if visible
  drawContextMenu();

  // Draw debug info
  drawDebugInfo();
  drawStateMachineInfo(state, player || null, isAnimating);
}

export function getGameState() {
  return turnManager.getState();
}
