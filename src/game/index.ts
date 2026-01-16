import { k } from "../kaplayCtx";
import { TurnManager } from "./systems/TurnManager";
import { InputController } from "./systems/InputController";
import { CursorManager } from "./systems/CursorManager";
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
  drawReachableTiles,
  clearMapObjects,
} from "./render/MapObjectRenderer";
import {
  drawPlayerStats,
  drawPreviewTile,
  drawSkipButton,
  drawDebugInfo,
  drawLevelInfo,
  drawStateMachineInfo,
  drawInventoryBackground,
  drawInventoryItems,
  clearUI,
} from "./render/UIRenderer";
import { TurnOwner, PlayerPhase, ObjectType, type PlotPosition, type GridPosition, type MapObject } from "./types";
import { findReachableTiles, type ReachableTile } from "./systems/Pathfinding";
import { spawnScrollingText } from "./systems/ScrollingCombatText";
import { TILE_SIZE, GRID_OFFSET_X, GRID_OFFSET_Y, GRID_ROWS, GRID_COLS, PREVIEW_X, PREVIEW_Y, DECAY_PROGRESSION } from "./config";
import { calculateAllEnemyMoves, type EnemyMove } from "./systems/EnemyAI";
import { executeCombat, checkForCombat } from "./systems/Combat";
import { isWallBlocking, openWall } from "./systems/WallBump";
import { applyRandomDecayToTile } from "./core/Grid";

let turnManager: TurnManager;
let isAnimating = false;
let isMovementMode = false;
let reachableTiles: ReachableTile[] = [];
let selectedPlayer: MapObject | null = null;

async function handleClick(): Promise<void> {
  logger.debug("[handleClick] Called - isAnimating:", isAnimating);

  if (isAnimating) {
    logger.debug("Click ignored - animating");
    return;
  }

  // Block input during start level sequence
  if (turnManager.getState().isInStartLevelSequence) {
    logger.debug("Click ignored - start level sequence playing");
    return;
  }

  const pos = k.mousePos();
  logger.debug("Click at:", pos);

  // Check for skip button click
  const skipButtons = k.get("skipButton");
  for (const button of skipButtons) {
    if ((button as any).hasPoint && (button as any).hasPoint(pos)) {
      logger.debug("Skip button clicked");
      const player = turnManager.getObjectManager().getPlayer();
      if (player) {
        skipPlayerTurn(player);
      }
      return;
    }
  }

  // Handle rotation mode clicks
  if (turnManager.isRotatingTile()) {
    const state = turnManager.getState();
    if (!state.rotatingTilePosition) {
      turnManager.cancelRotation();
      render();
      return;
    }

    const clickedGridCol = Math.floor((pos.x - GRID_OFFSET_X) / TILE_SIZE);
    const clickedGridRow = Math.floor((pos.y - GRID_OFFSET_Y) / TILE_SIZE);

    // Check if clicked on the rotating tile
    if (clickedGridRow === state.rotatingTilePosition.row &&
        clickedGridCol === state.rotatingTilePosition.col) {
      logger.debug("Rotating player tile");
      turnManager.rotatePlayerTile();
      render();
      return;
    }

    // Check if clicked on a reachable tile
    const player = turnManager.getObjectManager().getPlayer();
    if (player && clickedGridRow >= 0 && clickedGridRow < GRID_ROWS &&
        clickedGridCol >= 0 && clickedGridCol < GRID_COLS) {
      const moves = turnManager.getObjectManager().getAvailableMoves(player);
      const reachable = findReachableTiles(state.grid, state.rotatingTilePosition, moves);
      const target = reachable.find(
        (t) => t.position.row === clickedGridRow && t.position.col === clickedGridCol
      );

      if (target && target.path.length > 1) {
        logger.debug("Confirming rotation and moving to:", target.position);
        turnManager.confirmRotation();
        movePlayerAlongPath(player, target.path);
        return;
      }
    }

    // Clicked outside reachable tiles - cancel rotation
    logger.debug("Canceling rotation");
    turnManager.cancelRotation();
    render();
    return;
  }

  if (isMovementMode && selectedPlayer) {
    const reachableHighlights = k.get("reachableHighlight");
    for (const highlight of reachableHighlights) {
      if ((highlight as any).hasPoint && (highlight as any).hasPoint(pos)) {
        const targetPos = (highlight as any).gridPos as GridPosition;
        logger.debug("Reachable tile hit - moving to:", targetPos);
        const target = reachableTiles.find(
          (t) => t.position.row === targetPos.row && t.position.col === targetPos.col
        );
        if (target) {
          movePlayerAlongPath(selectedPlayer, target.path);
        }
        return;
      }
    }

    logger.debug("Click outside reachable - canceling movement mode");
    exitMovementMode();
    render();
    return;
  }

  const mapObjs = k.get("mapObject");
  for (const obj of mapObjs) {
    if ((obj as any).hasPoint && (obj as any).hasPoint(pos)) {
      const objData = (obj as any).objectData as MapObject;
      if (objData.type === "Player" && objData.movesRemaining > 0) {
        logger.debug("Player clicked - entering rotation mode");
        turnManager.enterRotationMode();
        render();
        return;
      }
    }
  }

  // Check if clicked on a reachable grid tile (direct move without entering movement mode first)
  logger.debug("[handleClick] Checking tile click - isPlayerTurn:", turnManager.isPlayerTurn(), "isTilePlacement:", turnManager.isTilePlacement());
  if (turnManager.isPlayerTurn() && !turnManager.isTilePlacement()) {
    const player = turnManager.getObjectManager().getPlayer();
    logger.debug("[handleClick] Player found:", !!player, "moves:", player?.movesRemaining);
    if (player && player.movesRemaining > 0) {
      const clickedGridCol = Math.floor((pos.x - GRID_OFFSET_X) / TILE_SIZE);
      const clickedGridRow = Math.floor((pos.y - GRID_OFFSET_Y) / TILE_SIZE);
      logger.debug("[handleClick] Grid click at:", clickedGridRow, clickedGridCol);

      if (clickedGridRow >= 0 && clickedGridRow < GRID_ROWS &&
          clickedGridCol >= 0 && clickedGridCol < GRID_COLS) {
        const state = turnManager.getState();
        const targetPos = { row: clickedGridRow, col: clickedGridCol };
        const moves = turnManager.getObjectManager().getAvailableMoves(player);
        const reachable = findReachableTiles(state.grid, player.gridPosition, moves);
        const target = reachable.find(
          (t) => t.position.row === clickedGridRow && t.position.col === clickedGridCol
        );
        if (target && target.path.length > 1) {
          logger.debug("Direct move to reachable tile:", target.position);
          movePlayerAlongPath(player, target.path);
          return;
        }

        // Check if this is a wall bump (adjacent tile blocked by wall)
        const dRow = Math.abs(targetPos.row - player.gridPosition.row);
        const dCol = Math.abs(targetPos.col - player.gridPosition.col);
        const isAdjacent = (dRow === 1 && dCol === 0) || (dRow === 0 && dCol === 1);
        logger.debug("[handleClick] isAdjacent:", isAdjacent);

        if (isAdjacent) {
          const wallBlocking = isWallBlocking(state.grid, player.gridPosition, targetPos);
          logger.debug("[handleClick] Wall blocking:", wallBlocking);
          if (wallBlocking) {
            logger.debug("Wall bump detected - calling handleWallBump");
            await handleWallBump(player, targetPos);
            logger.debug("Wall bump completed - returning from handleClick");
            return;
          }
        }
      }
    }
  }

  const currentTiles = k.get("currentTile");
  for (const tile of currentTiles) {
    if ((tile as any).hasPoint && (tile as any).hasPoint(pos)) {
      logger.debug("Current tile hit - rotating");
      turnManager.rotateTile();
      return;
    }
  }

  const previewTiles = k.get("previewTile");
  for (const tile of previewTiles) {
    if ((tile as any).hasPoint && (tile as any).hasPoint(pos)) {
      if (turnManager.isPlayerTurn() && turnManager.canPlaceTile()) {
        logger.debug("Preview tile hit - entering tile placement");
        turnManager.enterTilePlacement();
      } else if (turnManager.isTilePlacement()) {
        logger.debug("Preview tile hit - rotating");
        turnManager.rotateTile();
      }
      return;
    }
  }

  const highlightAreas = k.get("highlightArea");
  for (const area of highlightAreas) {
    if ((area as any).hasPoint && (area as any).hasPoint(pos)) {
      logger.debug("Highlight area hit - pushing");
      if (turnManager.canPush()) {
        executePushWithAnimation();
      }
      return;
    }
  }

  const plots = k.get("plot");
  for (const plot of plots) {
    if ((plot as any).hasPoint && (plot as any).hasPoint(pos)) {
      const plotData = (plot as any).plotData as PlotPosition;
      logger.debug("Plot hit:", plotData);
      if (turnManager.isPlayerTurn() && turnManager.canPlaceTile()) {
        turnManager.enterTilePlacement();
        turnManager.selectPlot(plotData);
      } else if (turnManager.isTilePlacement()) {
        turnManager.selectPlot(plotData);
      }
      return;
    }
  }

  if (turnManager.isTilePlacement()) {
    logger.debug("Background hit - canceling");
    turnManager.cancelPlacement();
  }
}

function exitMovementMode(): void {
  isMovementMode = false;
  selectedPlayer = null;
  reachableTiles = [];
}

async function movePlayerAlongPath(player: MapObject, path: GridPosition[]): Promise<void> {
  logger.debug("[movePlayerAlongPath] START - path length:", path.length, "isAnimating before:", isAnimating);

  if (path.length <= 1) {
    exitMovementMode();
    render();
    return;
  }

  // Reset wall bump counter on successful movement
  turnManager.resetWallBumpCounter();

  isAnimating = true;
  logger.debug("[movePlayerAlongPath] isAnimating set to true");
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
    await k.wait(stepDuration);
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

      await k.wait(stepDuration);

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
  exitMovementMode();
  logger.debug("[movePlayerAlongPath] Exited movement mode");

  turnManager.completeMove();
  logger.debug("[movePlayerAlongPath] Move completed, executing enemy turns");
  await executeEnemyTurns();
  logger.debug("[movePlayerAlongPath] Enemy turns complete");
  // startPlayerTurn() is now called inside executeEnemyTurns()
  logger.debug("[movePlayerAlongPath] END");
}

async function skipPlayerTurn(_player: MapObject): Promise<void> {
  logger.debug("Skipping player turn - passing to enemies");

  isAnimating = true;

  k.destroyAll("reachableHighlight");

  exitMovementMode();

  isAnimating = false;

  turnManager.completeMove();
  await executeEnemyTurns();
  // startPlayerTurn() is now called inside executeEnemyTurns()
}

async function animateWallBump(player: MapObject, targetPos: GridPosition): Promise<void> {
  logger.debug(`[WallBump] Animating bump from ${player.gridPosition.row},${player.gridPosition.col} toward ${targetPos.row},${targetPos.col}`);

  isAnimating = true;

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

  // Bump forward
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

  await k.wait(bumpDuration);

  // Bounce back
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

  await k.wait(bumpDuration);

  k.destroyAll("movingPlayer");
  isAnimating = false;
  render();
}

async function handleWallBump(player: MapObject, targetPos: GridPosition): Promise<void> {
  logger.debug("[handleWallBump] START - player moves:", player.movesRemaining);
  const state = turnManager.getState();

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

async function animateEnemyMove(move: EnemyMove): Promise<void> {
  const { enemy, path } = move;
  if (path.length <= 1) return;

  isAnimating = true;
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

    await k.wait(stepDuration);

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

        await k.wait(stepDuration * 0.3);
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

        await k.wait(stepDuration);

        enemy.gridPosition.row = previousPos.row;
        enemy.gridPosition.col = previousPos.col;

        // Stop movement after bounce
        break;
      }
    }
  }

  k.destroyAll("movingEnemy");
  turnManager.getObjectManager().spendMovement(enemy, path.length - 1);

  isAnimating = false;
  render();
}

function handleRightClick(): void {
  if (isAnimating) return;

  // Cancel rotation mode on right-click
  if (turnManager.isRotatingTile()) {
    logger.debug("Right-click - canceling rotation");
    turnManager.cancelRotation();
    render();
    return;
  }

  const pos = k.mousePos();

  const currentTiles = k.get("currentTile");
  for (const tile of currentTiles) {
    if ((tile as any).hasPoint && (tile as any).hasPoint(pos)) {
      logger.debug("Current tile right-click - rotating CCW");
      turnManager.rotateTileCounterClockwise();
      return;
    }
  }

  const previewTiles = k.get("previewTile");
  for (const tile of previewTiles) {
    if ((tile as any).hasPoint && (tile as any).hasPoint(pos)) {
      logger.debug("Preview tile right-click - rotating CCW");
      turnManager.rotateTileCounterClockwise();
      return;
    }
  }
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
  const reachable = findReachableTiles(state.grid, player.gridPosition, moves);

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

// Initialize all game event handlers
export function initializeGameHandlers(
  tm: TurnManager,
  ic: InputController,
  cm: CursorManager
): void {
  // Set up mouse event handlers
  k.onMousePress("left", handleClick);
  k.onMousePress("right", handleRightClick);

  // Set up keyboard event handlers using predefined buttons from kaplayCtx
  k.onButtonPress("up", handleMoveUp);
  k.onButtonPress("down", handleMoveDown);
  k.onButtonPress("left", handleMoveLeft);
  k.onButtonPress("right", handleMoveRight);

  // Set up input controller callback
  ic.setOnPushRequested(() => {
    if (!isAnimating && tm.canPush()) {
      executePushWithAnimation();
    }
  });

  // Register cursor update callback
  k.onDraw(() => {
    logger.time("[Frame] CursorUpdate");
    cm.update(tm);
    logger.timeEnd("[Frame] CursorUpdate");
  });
}

function clearAll(): void {
  clearGrid();
  clearMapObjects();
  clearUI();
  k.destroyAll("rotationOverlay");
}

async function executePushWithAnimation(): Promise<void> {
  const state = turnManager.getState();
  if (!state.currentTile || !state.selectedPlot) return;

  isAnimating = true;
  clearAll();

  const mapObjects = turnManager.getMapObjects();

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

let renderCallCount = 0;
export function render(): void {
  renderCallCount++;
  logger.debug(`[Render] Call #${renderCallCount}`);
  logger.time("[Render] Total");
  if (isAnimating) return;

  logger.time("[Render] clearAll");
  clearAll();
  logger.timeEnd("[Render] clearAll");

  const state = turnManager.getState();
  const mapObjects = turnManager.getMapObjects();
  const player = turnManager.getObjectManager().getPlayer();

  // Calculate UI positions
  const statsX = 8;
  const statsY = 8;
  const skipButtonX = GRID_OFFSET_X + GRID_COLS * TILE_SIZE + TILE_SIZE * 3;
  const skipButtonY = 360 / 2 + 80;

  logger.time("[Render] UI Setup");
  // Draw inventory background
  drawInventoryBackground();

  // Draw inventory items
  const itemDatabase = turnManager.getObjectManager().getItemDatabase();
  drawInventoryItems(state.inventory, itemDatabase);

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

  // Draw player stats UI
  if (player) {
    drawPlayerStats(player, statsX, statsY);
  }
  logger.timeEnd("[Render] UI Setup");

  logger.time("[Render] Main Scene");
  if (state.turnOwner === TurnOwner.Player) {
    if (state.playerPhase === PlayerPhase.RotatingTile) {
      // Rotation mode rendering
      logger.time("[Render] drawGrid");
      drawGridWithOverlay(state.grid, null, GRID_OFFSET_X, GRID_OFFSET_Y, GRID_ROWS, GRID_COLS, TILE_SIZE, 640, 360, state.isInStartLevelSequence, state.revealedTiles);
      logger.timeEnd("[Render] drawGrid");

      logger.time("[Render] drawDecay");
      drawDecayOverlay(state.grid, GRID_OFFSET_X, GRID_OFFSET_Y, TILE_SIZE, state.isInStartLevelSequence, state.revealedTiles);
      logger.timeEnd("[Render] drawDecay");

      // Draw darkening overlay on non-active tiles
      if (state.rotatingTilePosition && player) {
        logger.time("[Render] rotationOverlay");
        const moves = turnManager.getObjectManager().getAvailableMoves(player);
        const reachable = findReachableTiles(state.grid, state.rotatingTilePosition, moves);
        drawRotationOverlay(state.rotatingTilePosition, reachable, GRID_OFFSET_X, GRID_OFFSET_Y, TILE_SIZE);
        logger.timeEnd("[Render] rotationOverlay");
      }

      drawMapObjects(mapObjects, GRID_OFFSET_X, GRID_OFFSET_Y, TILE_SIZE, state.isInStartLevelSequence, state.revealedTiles);
      if (state.currentTile) {
        drawPreviewTile(state.currentTile, PREVIEW_X, PREVIEW_Y);
      }
      drawSkipButton(skipButtonX, skipButtonY);
    } else if (state.playerPhase === PlayerPhase.TilePlacement && state.currentTile) {
      logger.time("[Render] drawGrid");
      drawGridWithOverlay(state.grid, state.selectedPlot, GRID_OFFSET_X, GRID_OFFSET_Y, GRID_ROWS, GRID_COLS, TILE_SIZE, 640, 360, state.isInStartLevelSequence, state.revealedTiles);
      logger.timeEnd("[Render] drawGrid");

      logger.time("[Render] drawDecay");
      drawDecayOverlay(state.grid, GRID_OFFSET_X, GRID_OFFSET_Y, TILE_SIZE, state.isInStartLevelSequence, state.revealedTiles);
      logger.timeEnd("[Render] drawDecay");

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
      logger.time("[Render] drawGrid");
      drawGridWithOverlay(state.grid, null, GRID_OFFSET_X, GRID_OFFSET_Y, GRID_ROWS, GRID_COLS, TILE_SIZE, 640, 360, state.isInStartLevelSequence, state.revealedTiles);
      logger.timeEnd("[Render] drawGrid");

      logger.time("[Render] drawDecay");
      drawDecayOverlay(state.grid, GRID_OFFSET_X, GRID_OFFSET_Y, TILE_SIZE, state.isInStartLevelSequence, state.revealedTiles);
      logger.timeEnd("[Render] drawDecay");

      if (isMovementMode) {
        drawReachableTiles(reachableTiles, GRID_OFFSET_X, GRID_OFFSET_Y, TILE_SIZE);
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
    logger.time("[Render] drawGrid");
    drawGridWithOverlay(state.grid, null, GRID_OFFSET_X, GRID_OFFSET_Y, GRID_ROWS, GRID_COLS, TILE_SIZE, 640, 360, state.isInStartLevelSequence, state.revealedTiles);
    logger.timeEnd("[Render] drawGrid");

    logger.time("[Render] drawDecay");
    drawDecayOverlay(state.grid, GRID_OFFSET_X, GRID_OFFSET_Y, TILE_SIZE, state.isInStartLevelSequence, state.revealedTiles);
    logger.timeEnd("[Render] drawDecay");

    drawMapObjects(mapObjects, GRID_OFFSET_X, GRID_OFFSET_Y, TILE_SIZE, state.isInStartLevelSequence, state.revealedTiles);

    // Keep showing the tile preview and plots during enemy turn
    if (state.currentTile) {
      drawPreviewTile(state.currentTile, PREVIEW_X, PREVIEW_Y);
      const plots = turnManager.getPlots();
      drawPlots(plots, null, state.playerPhase, GRID_OFFSET_X, GRID_OFFSET_Y, GRID_ROWS, GRID_COLS, TILE_SIZE);
    }
  }
  logger.timeEnd("[Render] Main Scene");

  // Draw debug info
  drawDebugInfo();
  drawStateMachineInfo(state, player || null);

  logger.timeEnd("[Render] Total");
}

export function getGameState() {
  return turnManager.getState();
}
