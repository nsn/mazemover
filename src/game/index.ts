import { k } from "../kaplayCtx";
import { TurnManager } from "./systems/TurnManager";
import { InputController } from "./systems/InputController";
import { CursorManager } from "./systems/CursorManager";
import { ClickManager, type ClickCallbacks } from "./systems/ClickManager";
import { logger } from "./utils/logger";
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
  drawSkipButton,
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
import { TurnOwner, PlayerPhase, ObjectType, type PlotPosition, type GridPosition, type MapObject, type TileInstance } from "./types";
import { findReachableTiles, type ReachableTile } from "./systems/Pathfinding";
import { spawnScrollingText } from "./systems/ScrollingCombatText";
import { TILE_SIZE, GRID_OFFSET_X, GRID_OFFSET_Y, GRID_ROWS, GRID_COLS, PREVIEW_X, PREVIEW_Y, DECAY_PROGRESSION, getFallChance } from "./config";
import { calculateAllEnemyMoves, type EnemyMove } from "./systems/EnemyAI";
import { executeCombat, checkForCombat } from "./systems/Combat";
import { isWallBlocking, openWall } from "./systems/WallBump";
import { applyRandomDecayToTile } from "./core/Grid";
import { fallThroughFloor } from "./mainScene";
import { getTileEdges } from "./core/Tile";

let turnManager: TurnManager;
let clickManager: ClickManager;
let isAnimating = false;
let lastHoveredItemId: string | null = null;
let lastHighlightedSlots: number[] = [];
let hoveredTilePosition: GridPosition | null = null;
let connectedTiles: GridPosition[] = [];

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
      console.log(`[Consumable] Using ${itemDef.name}`);

      // Consume the item based on its type
      if (itemDef.id === "apple") {
        if (player && player.currentHP !== undefined && player.stats) {
          const maxHP = player.stats.hp;
          const healAmount = 5;
          const hpBefore = player.currentHP;
          player.currentHP = Math.min(player.currentHP + healAmount, maxHP);
          const actualHeal = player.currentHP - hpBefore;

          console.log(`[Apple] Healed ${actualHeal} HP (${hpBefore} -> ${player.currentHP}/${maxHP})`);
        }
      } else if (itemDef.id === "ham") {
        if (player && player.currentHP !== undefined && player.stats) {
          const maxHP = player.stats.hp;
          const hpBefore = player.currentHP;
          player.currentHP = maxHP;
          const actualHeal = player.currentHP - hpBefore;

          console.log(`[Ham] Restored to full health: ${actualHeal} HP healed (${hpBefore} -> ${player.currentHP}/${maxHP})`);
        }
      } else if (itemDef.id === "feather") {
        if (player) {
          // Grant flying ability
          player.flying = true;
          console.log(`[Feather] Player can now fly over decayed tiles`);

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

          // Remove decay from each tile
          let restoredCount = 0;
          tilesToRestore.forEach(pos => {
            if (pos.row >= 0 && pos.row < GRID_ROWS &&
                pos.col >= 0 && pos.col < GRID_COLS) {
              const tile = state.grid[pos.row][pos.col];
              if (tile && tile.decay > 0) {
                tile.decay = 0;
                restoredCount++;
                console.log(`[Cement] Removed decay from tile (${pos.row},${pos.col})`);
              }
            }
          });

          console.log(`[Cement] Restored ${restoredCount} tiles (current + adjacent)`);
        }
      } else if (itemDef.id === "bricks") {
        // Decrease all tiles' decay by a random value between 1 and 3
        let restoredCount = 0;
        for (let row = 0; row < GRID_ROWS; row++) {
          for (let col = 0; col < GRID_COLS; col++) {
            const tile = state.grid[row][col];
            if (tile && tile.decay > 0) {
              const decayReduction = Math.floor(Math.random() * 3) + 1; // Random 1-3
              const oldDecay = tile.decay;
              tile.decay = Math.max(0, tile.decay - decayReduction);
              restoredCount++;
              console.log(`[Bricks] Reduced decay at (${row},${col}) by ${decayReduction}: ${oldDecay} -> ${tile.decay}`);
            }
          }
        }

        console.log(`[Bricks] Reduced decay on ${restoredCount} tiles`);
      }

      // Decrease charges
      item.remainingCharges--;
      console.log(`[Consumable] Charges remaining: ${item.remainingCharges}`);

      // Remove item if charges depleted
      if (item.remainingCharges <= 0) {
        console.log(`[Consumable] ${itemDef.name} depleted and removed from inventory`);
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

      // Debug log equipment slots
      console.log("[Equipment] After equipping:");
      state.equipment.forEach((item, index) => {
        const slotName = ["Head", "MainHand", "OffHand", "Legs", "Torso"][index];
        if (item) {
          const itemDef = itemDatabase.getItem(item.definitionId);
          console.log(`  [${index}] ${slotName}: ${itemDef?.name || item.definitionId}`);
        } else {
          console.log(`  [${index}] ${slotName}: empty`);
        }
      });

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

      // Debug log equipment slots
      console.log("[Equipment] After unequipping:");
      state.equipment.forEach((item, index) => {
        const slotName = ["Head", "MainHand", "OffHand", "Legs", "Torso"][index];
        if (item) {
          const itemDef = itemDatabase.getItem(item.definitionId);
          console.log(`  [${index}] ${slotName}: ${itemDef?.name || item.definitionId}`);
        } else {
          console.log(`  [${index}] ${slotName}: empty`);
        }
      });

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
          console.log(`[Equipment] Clicked blocked slot ${clickedSlotIndex}, unequipping blocking item from slot ${i}`);
          const success = unequipItemToInventory(
            state.inventory,
            state.equipment,
            i,
            itemDatabase
          );

          if (success && player) {
            applyEquipmentBonuses(player, state.equipment, itemDatabase);

            // Debug log equipment slots
            console.log("[Equipment] After unequipping (clicked blocked slot):");
            state.equipment.forEach((item, index) => {
              const slotName = ["Head", "MainHand", "OffHand", "Legs", "Torso"][index];
              if (item) {
                const itemDef = itemDatabase.getItem(item.definitionId);
                console.log(`  [${index}] ${slotName}: ${itemDef?.name || item.definitionId}`);
              } else {
                console.log(`  [${index}] ${slotName}: empty`);
              }
            });

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
  logger.debug("[movePlayerAlongPath] START - path length:", path.length, "isAnimating before:", isAnimating);

  if (path.length <= 1) {
    render();
    return;
  }

  // Reset wall bump counter on successful movement
  turnManager.resetWallBumpCounter();

  isAnimating = true;
  logger.debug("[movePlayerAlongPath] isAnimating set to true");

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
  logger.debug("[movePlayerAlongPath] Moving sprite created");

  const objectManager = turnManager.getObjectManager();

  logger.debug("[movePlayerAlongPath] Starting path loop, path.length:", path.length);
  for (let i = 1; i < path.length; i++) {
    logger.debug(`[movePlayerAlongPath] Step ${i}/${path.length - 1} - moving to:`, path[i]);
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
    logger.debug(`[movePlayerAlongPath] Starting tween to (${endX}, ${endY})`);

    k.tween(
      currentPos,
      k.vec2(endX, endY),
      stepDuration,
      (val) => {
        movingSprite.pos = val;
      },
      k.easings.easeOutQuad
    );

    logger.debug(`[movePlayerAlongPath] Waiting ${stepDuration}s for tween...`);
    await Promise.race([
      k.wait(stepDuration),
      new Promise(resolve => setTimeout(resolve, 1000)) // 1s timeout
    ]);
    logger.debug(`[movePlayerAlongPath] Tween complete`);

    player.gridPosition.row = to.row;
    player.gridPosition.col = to.col;
    logger.debug(`[movePlayerAlongPath] Updated player position to (${to.row}, ${to.col})`);

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

        // Check for item drop
        const enemyPos = enemy.gridPosition;
        const dropChance = enemy.dropChance ?? 0.1;
        const enemyTier = enemy.tier ?? 1;

        // Check if tile is empty (no other MapObjects)
        const objectsAtPosition = objectManager.getAllObjects().filter(obj =>
          obj.gridPosition.row === enemyPos.row &&
          obj.gridPosition.col === enemyPos.col &&
          obj.id !== enemy.id
        );

        if (objectsAtPosition.length === 0 && Math.random() < dropChance) {
          // Drop an item
          const itemDatabase = objectManager.getItemDatabase();
          const selectedItemId = selectItemByTier(enemyTier, itemDatabase);

          if (selectedItemId) {
            objectManager.createItem(enemyPos, selectedItemId);
            console.log(`[Combat] Enemy dropped item: ${selectedItemId} (tier ${enemyTier})`);
          }
        }

        objectManager.destroyObject(enemy);
        logger.debug("[Game] Enemy defeated - bouncing player back");
      } else {
        logger.debug("[Game] Enemy survived - bouncing player back");
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
    logger.debug(`[movePlayerAlongPath] Step ${i} complete`);
  }

  logger.debug("[movePlayerAlongPath] Path loop complete");
  k.destroyAll("movingPlayer");
  logger.debug("[movePlayerAlongPath] Movement sprite destroyed");
  turnManager.getObjectManager().spendMovement(player, path.length - 1);
  logger.debug("[movePlayerAlongPath] Movement spent");

  isAnimating = false;
  logger.debug("[movePlayerAlongPath] isAnimating set to false");

  // Check if player falls through the floor (if not flying)
  if (!player.flying) {
    const currentTile = turnManager.getState().grid[player.gridPosition.row][player.gridPosition.col];
    const fallChance = getFallChance(currentTile.decay);

    if (fallChance > 0) {
      const roll = Math.random();
      logger.debug(`[movePlayerAlongPath] Fall check: decay=${currentTile.decay}, chance=${fallChance}, roll=${roll}`);

      if (roll < fallChance) {
        console.log(`[Game] Player fell through the floor! (decay=${currentTile.decay}, chance=${fallChance}, roll=${roll})`);

        // Set animating to prevent other actions during fall
        isAnimating = true;
        console.log("[Fall] isAnimating set to true - fall animation starting");

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
          console.log("[Fall] isAnimating set to false - fall animation complete");
        }

        // Transition to next level (going deeper)
        fallThroughFloor(turnManager.getState());

        // Don't continue with normal turn flow
        logger.debug("[movePlayerAlongPath] END (player fell)");
        return;
      }
    }
  }

  turnManager.completeMove();
  logger.debug("[movePlayerAlongPath] Move completed, executing enemy turns");
  await executeEnemyTurns();
  logger.debug("[movePlayerAlongPath] Enemy turns complete");
  // startPlayerTurn() is now called inside executeEnemyTurns()
  logger.debug("[movePlayerAlongPath] END");
  } catch (error) {
    console.error("[movePlayerAlongPath] Error during player movement:", error);
    k.destroyAll("movingPlayer");
    isAnimating = false;
    console.log("[movePlayerAlongPath] isAnimating set to false - error recovery");
    render();
  }
}

async function skipPlayerTurn(_player: MapObject): Promise<void> {
  logger.debug("Skipping player turn - passing to enemies");

  isAnimating = true;
  isAnimating = false;

  turnManager.completeMove();
  await executeEnemyTurns();
  // startPlayerTurn() is now called inside executeEnemyTurns()
}

async function animateWallBump(player: MapObject, targetPos: GridPosition): Promise<void> {
  logger.debug(`[WallBump] Animating bump from ${player.gridPosition.row},${player.gridPosition.col} toward ${targetPos.row},${targetPos.col}`);

  isAnimating = true;
  console.log("[WallBump] isAnimating set to true - wall bump animation starting");

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
    console.log("[WallBump] isAnimating set to false - wall bump animation complete");
    render();
  }
}

async function handleWallBump(player: MapObject, targetPos: GridPosition): Promise<void> {
  logger.debug("[handleWallBump] START - player moves:", player.movesRemaining);
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
    logger.debug("[handleWallBump] No required equipment - wall bump has no effect");
    console.log("[WallBump] Cannot break walls without a two-handed weapon or both MainHand and OffHand equipped");
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

  logger.debug(`[WallBump] Count: ${state.wallBumpCount}/3`);

  // Animate the bump
  logger.debug("[handleWallBump] Starting animation...");
  await animateWallBump(player, targetPos);
  logger.debug("[handleWallBump] Animation complete");

  // Decrease charges for equipped items
  for (let i = 0; i < state.equipment.length; i++) {
    const item = state.equipment[i];
    if (item && item.remainingCharges > -1) {
      item.remainingCharges--;
      console.log(`[WallBump] Decreased charges for ${item.definitionId}: ${item.remainingCharges + 1} -> ${item.remainingCharges}`);

      // Remove item if charges depleted
      if (item.remainingCharges <= 0) {
        console.log(`[WallBump] Item ${item.definitionId} depleted and removed from equipment`);
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
    logger.debug("[WallBump] Breaking wall!");
    openWall(state.grid, player.gridPosition, targetPos);
    state.wallBumpCount = 0;
    state.wallBumpTarget = null;
    render();  // Re-render to show opened wall
  }

  // Spend movement point
  logger.debug("[handleWallBump] Spending movement - before:", player.movesRemaining);
  turnManager.getObjectManager().spendMovement(player, 1);
  logger.debug("[handleWallBump] Spending movement - after:", player.movesRemaining);
  render();  // Update UI to show remaining moves

  // Check if player has moves remaining, otherwise trigger enemy turn
  if (player.movesRemaining <= 0) {
    logger.debug("[handleWallBump] No moves remaining, executing enemy turns...");
    await executeEnemyTurns();
    logger.debug("[handleWallBump] Enemy turns complete");
  }
  logger.debug("[handleWallBump] END");
}

async function executeEnemyTurns(): Promise<void> {
  logger.debug("[executeEnemyTurns] START");
  const state = turnManager.getState();
  const objectManager = turnManager.getObjectManager();
  const player = objectManager.getPlayer();
  if (!player) return;

  const enemyMoves = calculateAllEnemyMoves(state.grid, objectManager, player.gridPosition);

  for (const move of enemyMoves) {
    await animateEnemyMove(move);
  }

  logger.debug("[executeEnemyTurns] Starting new player turn...");
  turnManager.startPlayerTurn();
  render();
  logger.debug("[executeEnemyTurns] END");
  logger.debug("################ TURN COMPLETE ################");
}

/**
 * Animates a healing action from healer to target enemy
 */
async function animateHealing(healer: MapObject, target: MapObject): Promise<void> {
  isAnimating = true;
  console.log(`[Healing] isAnimating set to true - enemy ${healer.id} healing ${target.id}`);

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

      console.log(`[Healing] Healed ${target.name} for ${actualHeal} HP (${hpBefore} -> ${target.currentHP}/${target.stats.hp})`);

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
    console.log("[Healing] isAnimating set to false - healing complete");
  }
}

/**
 * Animates a ranged attack from enemy to player
 */
async function animateRangedAttack(enemy: MapObject): Promise<void> {
  isAnimating = true;
  console.log(`[RangedAttack] isAnimating set to true - enemy ${enemy.id} attacking`);

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
      const objectManager = turnManager.getObjectManager();
      objectManager.destroyObject(player);
      logger.debug("[Game] Player was killed by ranged attack!");
    }

  } catch (error) {
    console.error("[RangedAttack] Error during ranged attack:", error);
  } finally {
    isAnimating = false;
    console.log("[RangedAttack] isAnimating set to false - ranged attack complete");
  }
}

/**
 * Animates a teleport from current position to target position
 */
async function animateTeleport(enemy: MapObject, targetPos: GridPosition): Promise<void> {
  isAnimating = true;
  console.log(`[Teleport] isAnimating set to true - enemy ${enemy.id} teleporting from (${enemy.gridPosition.row},${enemy.gridPosition.col}) to (${targetPos.row},${targetPos.col})`);

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
        console.log(`[Teleport] Enemy ${enemy.id} adjacent to player, executing combat`);
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
          const objectManager = turnManager.getObjectManager();
          objectManager.destroyObject(player);
          logger.debug("[Teleport] Player was killed by assassin!");
        }
      }
    }

  } catch (error) {
    console.error("[Teleport] Error during teleport:", error);
  } finally {
    isAnimating = false;
    console.log("[Teleport] isAnimating set to false - teleport complete");
    render();
  }
}

function manhattanDistance(a: GridPosition, b: GridPosition): number {
  return Math.abs(a.row - b.row) + Math.abs(a.col - b.col);
}

async function animateEnemyMove(move: EnemyMove): Promise<void> {
  const { enemy, path, isRangedAttack, isHealingAction, healTarget, isTeleportAction } = move;

  console.log(`[animateEnemyMove] Enemy ${enemy.id}: isRangedAttack=${isRangedAttack}, isHealingAction=${isHealingAction}, isTeleportAction=${isTeleportAction}, path.length=${path.length}`);

  // Check if this is a healing action
  if (isHealingAction && healTarget) {
    console.log(`[animateEnemyMove] Calling animateHealing for enemy ${enemy.id} targeting ${healTarget.id}`);
    await animateHealing(enemy, healTarget);
    return;
  }

  // Check if this is a ranged attack
  if (isRangedAttack) {
    console.log(`[animateEnemyMove] Calling animateRangedAttack for enemy ${enemy.id}`);
    await animateRangedAttack(enemy);
    return;
  }

  // Check if this is a teleport action
  if (isTeleportAction) {
    console.log(`[animateEnemyMove] Calling animateTeleport for enemy ${enemy.id}`);
    await animateTeleport(enemy, path[path.length - 1]);
    return;
  }

  if (path.length <= 1) return;

  isAnimating = true;
  console.log(`[EnemyMove] isAnimating set to true - enemy ${enemy.id} moving`);

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
      logger.debug(`[animateEnemyMove] Enemy ${enemy.id} blocked by enemy ${blockingEnemy.id} at (${to.row},${to.col})`);
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

      // Remove dead target (player) and complete movement to tile center
      if (combatResult.attackerAttack.defenderDied) {
        objectManager.destroyObject(target);
        logger.debug("[Game] Player was killed by enemy!");

        // Complete movement to tile center (was stopped 16 pixels before)
        const finalPos = movingSprite.pos.clone();
        k.tween(
          finalPos,
          k.vec2(tileCenterX, tileCenterY),
          stepDuration * 0.3,
          (val) => {
            movingSprite.pos = val;
          },
          k.easings.easeOutQuad
        );

        await Promise.race([
          k.wait(stepDuration * 0.3),
          new Promise(resolve => setTimeout(resolve, 1000)) // 1s timeout
        ]);
      } else {
        // Defender survived - bounce enemy back to previous position
        logger.debug("[Game] Defender survived - bouncing enemy back");
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
    console.log("[animateEnemyMove] isAnimating set to false - enemy animation complete");
    render();
  }
}

function handleRightClick(): void {
  const pos = k.mousePos();
  clickManager.handleRightClick(pos, turnManager, isAnimating);
}

function handleMouseMove(): void {
  // Don't process during animations
  if (isAnimating) {
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
    logger.debug("Target out of bounds");
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
    logger.debug(`Keyboard move to (${targetRow}, ${targetCol})`);
    movePlayerAlongPath(player, target.path);
  } else {
    // Check if this is a wall bump (adjacent tile blocked by wall)
    const dRow = Math.abs(targetPos.row - player.gridPosition.row);
    const dCol = Math.abs(targetPos.col - player.gridPosition.col);
    const isAdjacent = (dRow === 1 && dCol === 0) || (dRow === 0 && dCol === 1);

    if (isAdjacent && isWallBlocking(state.grid, player.gridPosition, targetPos)) {
      logger.debug("Keyboard wall bump detected");
      await handleWallBump(player, targetPos);
    } else {
      logger.debug("Target tile not reachable");
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
  console.log("[Game] Animation flag forcefully reset");
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
    onConfirmRotation: () => {
      tm.confirmRotation();
      render();
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

  // Debug button - spawn assassin at random position near player
  k.onButtonPress("debug", () => {
    const player = tm.getObjectManager().getPlayer();
    if (!player || isAnimating) return;

    const objectManager = tm.getObjectManager();

    // Spawn assassin
    const enemyType = "assassin";

    // Try to find an empty tile near the player
    const playerPos = player.gridPosition;
    const searchRadius = 3;
    const potentialPositions: GridPosition[] = [];

    for (let rowOffset = -searchRadius; rowOffset <= searchRadius; rowOffset++) {
      for (let colOffset = -searchRadius; colOffset <= searchRadius; colOffset++) {
        const row = playerPos.row + rowOffset;
        const col = playerPos.col + colOffset;

        // Check bounds
        if (row >= 0 && row < GRID_ROWS && col >= 0 && col < GRID_COLS) {
          // Check if position is empty (no objects)
          const objectsAtPos = objectManager.getObjectsAtPosition(row, col);
          if (objectsAtPos.length === 0) {
            potentialPositions.push({ row, col });
          }
        }
      }
    }

    if (potentialPositions.length > 0) {
      // Pick random empty position
      const spawnPos = potentialPositions[Math.floor(Math.random() * potentialPositions.length)];

      // Spawn enemy
      objectManager.createEnemy(spawnPos, enemyType);
      console.log(`[Debug] Spawned ${enemyType} at (${spawnPos.row},${spawnPos.col})`);

      render();
    } else {
      console.log("[Debug] No empty positions found near player");
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
  lastHoveredItemId = null; // Reset hover state so description updates after render
  lastHighlightedSlots = []; // Reset equipment slot highlights
}

async function executePushWithAnimation(): Promise<void> {
  const state = turnManager.getState();
  if (!state.currentTile || !state.selectedPlot) return;

  isAnimating = true;
  console.log("[Push] isAnimating set to true - tile push animation starting");
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
  } catch (error) {
    console.error("[executePushWithAnimation] Error during push animation:", error);
    isAnimating = false;
    console.log("[executePushWithAnimation] isAnimating set to false - error recovery");
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

let renderCallCount = 0;

export function render(): void {
  if (isAnimating) {
    return;
  }

  renderCallCount++;
  if (renderCallCount % 100 === 1) {
    // Log every 100th render to avoid console spam
    console.log("[Render] Render call #" + renderCallCount + ", isInStartLevelSequence:", turnManager?.getState()?.isInStartLevelSequence);
  }

  clearAll();

  const state = turnManager.getState();
  const mapObjects = turnManager.getMapObjects();
  const player = turnManager.getObjectManager().getPlayer();

  // Calculate UI positions
  const skipButtonX = GRID_OFFSET_X + GRID_COLS * TILE_SIZE + TILE_SIZE * 3;
  const skipButtonY = 360 / 2 + 80;

  // Get item database for UI rendering
  const itemDatabase = turnManager.getObjectManager().getItemDatabase();

  // Draw the entire UI panel
  drawUI(player || null, state, itemDatabase);

  // Draw level info
  drawLevelInfo(state.currentLevel);

  // Draw saga font sample text
  k.add([
    k.text("The quick brown Fox jumps over the lazy Dog.", { font: "saga", size: 16 }),
    k.pos(GRID_OFFSET_X, 10),
    k.color(255, 255, 255),
    k.z(100),
    "sagaText",
  ]);

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
      drawSkipButton(skipButtonX, skipButtonY);
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
      drawSkipButton(skipButtonX, skipButtonY);
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
      drawSkipButton(skipButtonX, skipButtonY);
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

  // Draw debug info
  drawDebugInfo();
  drawStateMachineInfo(state, player || null, isAnimating);
}

export function getGameState() {
  return turnManager.getState();
}
