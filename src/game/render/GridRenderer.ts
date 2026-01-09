import { k } from "../../kaplayCtx";
import { TileType, Direction, PlayerPhase, ObjectType, type TileInstance, type PlotPosition, type MapObject } from "../types";
import { COLORS } from "../config";
import { TileFrames, BrickFrames } from "../assets";

/**
 * Gets the sprite frame for a tile based on type and orientation
 * @param type The tile type
 * @param direction The tile's orientation (0=North/0°, 1=East/90°, 2=South/180°, 3=West/270°)
 * @returns The frame index in the 6x4 sprite sheet
 */
function getTileFrame(type: TileType, direction: Direction): number {
  // Get base column for tile type
  let column: number;
  switch (type) {
    case TileType.CulDeSac: column = TileFrames.CulDeSac; break;
    case TileType.Straight: column = TileFrames.Straight; break;
    case TileType.L: column = TileFrames.L; break;
    case TileType.T: column = TileFrames.T; break;
    case TileType.Cross: column = TileFrames.Cross; break;
  }

  // Calculate frame: row (direction) * 6 + column (type)
  // Row 0 = North (0°), Row 1 = East (90°), Row 2 = South (180°), Row 3 = West (270°)
  return direction * 6 + column;
}

/**
 * Gets the correct brick frame for a grid position based on its location
 * @param row Grid row position
 * @param col Grid column position
 * @param rows Total number of rows
 * @param cols Total number of columns
 * @returns The brick animation frame index
 */
function getBrickFrame(row: number, col: number, rows: number, cols: number): number {
  const isTopEdge = row === 0;
  const isBottomEdge = row === rows - 1;
  const isLeftEdge = col === 0;
  const isRightEdge = col === cols - 1;

  // Corners
  if (isTopEdge && isLeftEdge) return BrickFrames.NW;
  if (isTopEdge && isRightEdge) return BrickFrames.NE;
  if (isBottomEdge && isLeftEdge) return BrickFrames.SW;
  if (isBottomEdge && isRightEdge) return BrickFrames.SE;

  // Edges
  if (isTopEdge) return BrickFrames.N;
  if (isBottomEdge) return BrickFrames.S;
  if (isLeftEdge) return BrickFrames.W;
  if (isRightEdge) return BrickFrames.E;

  // Center/interior
  return BrickFrames.C;
}

/**
 * Draws the brick background layer for the entire grid
 * @param rows Number of rows in the grid
 * @param cols Number of columns in the grid
 * @param gridOffsetX X offset of the grid in pixels
 * @param gridOffsetY Y offset of the grid in pixels
 * @param tileSize Size of each tile in pixels
 */
export function drawBrickLayer(
  rows: number,
  cols: number,
  gridOffsetX: number,
  gridOffsetY: number,
  tileSize: number,
  isInStartLevelSequence: boolean = false,
  revealedTiles: Set<string> = new Set()
): void {
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      // Skip unrevealed tiles during start level sequence
      if (isInStartLevelSequence && !revealedTiles.has(`${r},${c}`)) {
        continue;
      }

      const frame = getBrickFrame(r, c, rows, cols);
      const x = gridOffsetX + c * tileSize + tileSize / 2;
      const y = gridOffsetY + r * tileSize + tileSize / 2;

      k.add([
        k.sprite("bricks", { frame }),
        k.pos(x, y),
        k.anchor("center"),
        k.z(-1), // Below everything else
        "brickLayer",
      ]);
    }
  }
}

/**
 * Calculates screen position for a plot (tile placement zone)
 * @param plot The plot position to convert
 * @param gridOffsetX X offset of the grid in pixels
 * @param gridOffsetY Y offset of the grid in pixels
 * @param gridRows Number of rows in the grid
 * @param gridCols Number of columns in the grid
 * @param tileSize Size of each tile in pixels
 */
export function getPlotScreenPos(
  plot: PlotPosition,
  gridOffsetX: number,
  gridOffsetY: number,
  gridRows: number,
  gridCols: number,
  tileSize: number
): { x: number; y: number } {
  let x: number;
  let y: number;

  if (plot.row === -1) {
    x = gridOffsetX + plot.col * tileSize + tileSize / 2;
    y = gridOffsetY - tileSize / 2;
  } else if (plot.row === gridRows) {
    x = gridOffsetX + plot.col * tileSize + tileSize / 2;
    y = gridOffsetY + gridRows * tileSize + tileSize / 2;
  } else if (plot.col === -1) {
    x = gridOffsetX - tileSize / 2;
    y = gridOffsetY + plot.row * tileSize + tileSize / 2;
  } else {
    x = gridOffsetX + gridCols * tileSize + tileSize / 2;
    y = gridOffsetY + plot.row * tileSize + tileSize / 2;
  }

  return { x, y };
}

/**
 * Draws a single tile at the specified position
 * @param tile The tile to draw
 * @param x X position in pixels
 * @param y Y position in pixels
 * @param tag Optional tag for the game object
 */
export function drawTile(
  tile: TileInstance,
  x: number,
  y: number,
  tag?: string
): ReturnType<typeof k.add> {
  const frame = getTileFrame(tile.type, tile.orientation);

  const tileObj = k.add([
    k.sprite("tiles", { frame }),
    k.pos(x, y),
    k.anchor("center"),
    tag ? tag : "tile",
  ]);

  return tileObj;
}

/**
 * Draws the entire grid of tiles
 * @param grid 2D array of tiles
 * @param gridOffsetX X offset of the grid in pixels
 * @param gridOffsetY Y offset of the grid in pixels
 * @param tileSize Size of each tile in pixels
 */
export function drawGrid(
  grid: TileInstance[][],
  gridOffsetX: number,
  gridOffsetY: number,
  tileSize: number
): void {
  for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < grid[r].length; c++) {
      const tile = grid[r][c];
      if (tile) {
        const x = gridOffsetX + c * tileSize + tileSize / 2;
        const y = gridOffsetY + r * tileSize + tileSize / 2;
        drawTile(tile, x, y, "gridTile");
      }
    }
  }
}

/**
 * Draws a single plot (tile placement zone)
 * @param plot The plot position
 * @param isSelected Whether this plot is selected
 * @param playerPhase Current player phase
 * @param gridOffsetX X offset of the grid in pixels
 * @param gridOffsetY Y offset of the grid in pixels
 * @param gridRows Number of rows in the grid
 * @param gridCols Number of columns in the grid
 * @param tileSize Size of each tile in pixels
 */
export function drawPlot(
  plot: PlotPosition,
  isSelected: boolean,
  playerPhase: PlayerPhase,
  gridOffsetX: number,
  gridOffsetY: number,
  gridRows: number,
  gridCols: number,
  tileSize: number
): ReturnType<typeof k.add> {
  const { x, y } = getPlotScreenPos(plot, gridOffsetX, gridOffsetY, gridRows, gridCols, tileSize);
  const frame = plot.direction * 6 + TileFrames.Plot;

  const isGreen = isSelected && playerPhase === PlayerPhase.TilePlacement;
  const tintColor = isGreen
    ? k.rgb(100, 255, 100)
    : k.rgb(255, 100, 100);

  const plotObj = k.add([
    k.sprite("tiles", { frame }),
    k.pos(x, y),
    k.anchor("center"),
    k.area(),
    k.color(tintColor),
    k.opacity(isSelected ? 1 : 0.7),
    "plot",
    { plotData: plot },
  ]);

  return plotObj;
}

/**
 * Draws all plots
 * @param plots Array of plot positions
 * @param selectedPlot Currently selected plot
 * @param playerPhase Current player phase
 * @param gridOffsetX X offset of the grid in pixels
 * @param gridOffsetY Y offset of the grid in pixels
 * @param gridRows Number of rows in the grid
 * @param gridCols Number of columns in the grid
 * @param tileSize Size of each tile in pixels
 */
export function drawPlots(
  plots: PlotPosition[],
  selectedPlot: PlotPosition | null,
  playerPhase: PlayerPhase,
  gridOffsetX: number,
  gridOffsetY: number,
  gridRows: number,
  gridCols: number,
  tileSize: number
): void {
  for (const plot of plots) {
    const isSelected = selectedPlot !== null &&
      selectedPlot.row === plot.row &&
      selectedPlot.col === plot.col;
    drawPlot(plot, isSelected, playerPhase, gridOffsetX, gridOffsetY, gridRows, gridCols, tileSize);
  }
}

/**
 * Draws the grid with optional overlay and highlight
 * @param grid 2D array of tiles
 * @param selectedPlot Currently selected plot (for overlay)
 * @param gridOffsetX X offset of the grid in pixels
 * @param gridOffsetY Y offset of the grid in pixels
 * @param gridRows Number of rows in the grid
 * @param gridCols Number of columns in the grid
 * @param tileSize Size of each tile in pixels
 * @param screenWidth Width of the screen in pixels
 * @param screenHeight Height of the screen in pixels
 */
export function drawGridWithOverlay(
  grid: TileInstance[][],
  selectedPlot: PlotPosition | null,
  gridOffsetX: number,
  gridOffsetY: number,
  gridRows: number,
  gridCols: number,
  tileSize: number,
  screenWidth: number,
  screenHeight: number,
  isInStartLevelSequence: boolean = false,
  revealedTiles: Set<string> = new Set()
): void {
  // Draw brick background layer first
  drawBrickLayer(gridRows, gridCols, gridOffsetX, gridOffsetY, tileSize, isInStartLevelSequence, revealedTiles);

  const gridWidth = gridCols * tileSize;
  const gridHeight = gridRows * tileSize;

  if (selectedPlot) {
    const isHorizontal = selectedPlot.col === -1 || selectedPlot.col === gridCols;
    const highlightRow = isHorizontal ? selectedPlot.row : -1;
    const highlightCol = isHorizontal ? -1 : selectedPlot.col;

    k.add([
      k.rect(screenWidth, screenHeight),
      k.pos(0, 0),
      k.color(...COLORS.overlay),
      k.opacity(0.6),
      "overlay",
    ]);

    for (let r = 0; r < grid.length; r++) {
      for (let c = 0; c < grid[r].length; c++) {
        const tile = grid[r][c];
        if (tile) {
          // Skip unrevealed tiles during start level sequence
          if (isInStartLevelSequence && !revealedTiles.has(`${r},${c}`)) {
            continue;
          }

          const x = gridOffsetX + c * tileSize + tileSize / 2;
          const y = gridOffsetY + r * tileSize + tileSize / 2;
          const isDarkened = (highlightRow !== -1 && r !== highlightRow) ||
                            (highlightCol !== -1 && c !== highlightCol);

          const tileObj = drawTile(tile, x, y, "gridTile");
          if (isDarkened) {
            (tileObj as any).opacity = 0.3;
          }
        }
      }
    }

    if (highlightRow !== -1) {
      k.add([
        k.rect(gridWidth, tileSize),
        k.pos(gridOffsetX, gridOffsetY + highlightRow * tileSize),
        k.color(255, 255, 255),
        k.opacity(0),
        k.area(),
        "highlightArea",
      ]);
    } else if (highlightCol !== -1) {
      k.add([
        k.rect(tileSize, gridHeight),
        k.pos(gridOffsetX + highlightCol * tileSize, gridOffsetY),
        k.color(255, 255, 255),
        k.opacity(0),
        k.area(),
        "highlightArea",
      ]);
    }
  } else {
    for (let r = 0; r < grid.length; r++) {
      for (let c = 0; c < grid[r].length; c++) {
        const tile = grid[r][c];
        if (tile) {
          // Skip unrevealed tiles during start level sequence
          if (isInStartLevelSequence && !revealedTiles.has(`${r},${c}`)) {
            continue;
          }

          const x = gridOffsetX + c * tileSize + tileSize / 2;
          const y = gridOffsetY + r * tileSize + tileSize / 2;
          drawTile(tile, x, y, "gridTile");
        }
      }
    }
  }
}

/**
 * Draws the current tile being placed at a plot position
 * @param tile The tile to draw
 * @param plot The plot position
 * @param gridOffsetX X offset of the grid in pixels
 * @param gridOffsetY Y offset of the grid in pixels
 * @param gridRows Number of rows in the grid
 * @param gridCols Number of columns in the grid
 * @param tileSize Size of each tile in pixels
 */
export function drawCurrentTile(
  tile: TileInstance,
  plot: PlotPosition,
  gridOffsetX: number,
  gridOffsetY: number,
  gridRows: number,
  gridCols: number,
  tileSize: number
): ReturnType<typeof k.add> {
  const { x, y } = getPlotScreenPos(plot, gridOffsetX, gridOffsetY, gridRows, gridCols, tileSize);
  const frame = getTileFrame(tile.type, tile.orientation);

  const tileObj = k.add([
    k.sprite("tiles", { frame }),
    k.pos(x, y),
    k.anchor("center"),
    k.area(),
    "currentTile",
  ]);

  return tileObj;
}

/**
 * Animates a tile push operation
 * @param grid The grid of tiles
 * @param plot The plot position where the push originates
 * @param newTile The new tile being pushed in
 * @param objects Map objects that may be affected by the push
 * @param gridOffsetX X offset of the grid in pixels
 * @param gridOffsetY Y offset of the grid in pixels
 * @param gridRows Number of rows in the grid
 * @param gridCols Number of columns in the grid
 * @param tileSize Size of each tile in pixels
 * @param onComplete Callback when animation completes
 */
export async function animatePush(
  grid: TileInstance[][],
  plot: PlotPosition,
  newTile: TileInstance,
  objects: MapObject[],
  gridOffsetX: number,
  gridOffsetY: number,
  gridRows: number,
  gridCols: number,
  tileSize: number,
  onComplete: () => void,
  isInStartLevelSequence: boolean = false,
  revealedTiles: Set<string> = new Set()
): Promise<void> {
  const duration = 0.2;
  const { x: startX, y: startY } = getPlotScreenPos(plot, gridOffsetX, gridOffsetY, gridRows, gridCols, tileSize);

  let deltaX = 0;
  let deltaY = 0;

  if (plot.direction === Direction.South) {
    deltaY = tileSize;
  } else if (plot.direction === Direction.North) {
    deltaY = -tileSize;
  } else if (plot.direction === Direction.East) {
    deltaX = tileSize;
  } else if (plot.direction === Direction.West) {
    deltaX = -tileSize;
  }

  const isVertical = plot.row === -1 || plot.row === gridRows;
  const affectedRow = isVertical ? -1 : plot.row;
  const affectedCol = isVertical ? plot.col : -1;

  k.destroyAll("gridTile");
  k.destroyAll("mapObject");

  for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < grid[r].length; c++) {
      const tile = grid[r][c];
      if (tile) {
        // Skip unrevealed tiles during start level sequence
        if (isInStartLevelSequence && !revealedTiles.has(`${r},${c}`)) {
          continue;
        }

        const isAffected = (affectedRow !== -1 && r === affectedRow) ||
                          (affectedCol !== -1 && c === affectedCol);
        if (!isAffected) {
          const x = gridOffsetX + c * tileSize + tileSize / 2;
          const y = gridOffsetY + r * tileSize + tileSize / 2;
          drawTile(tile, x, y, "gridTile");
        }
      }
    }
  }

  const newTileObj = drawTile(newTile, startX, startY, "animatingTile");

  const affectedTileObjs: ReturnType<typeof k.add>[] = [];

  if (isVertical) {
    const col = plot.col;
    for (let r = 0; r < grid.length; r++) {
      const tile = grid[r][col];
      if (tile) {
        // Skip unrevealed tiles during start level sequence
        if (isInStartLevelSequence && !revealedTiles.has(`${r},${col}`)) {
          continue;
        }

        const x = gridOffsetX + col * tileSize + tileSize / 2;
        const y = gridOffsetY + r * tileSize + tileSize / 2;
        const tileObj = drawTile(tile, x, y, "animatingTile");
        affectedTileObjs.push(tileObj);
      }
    }
  } else {
    const row = plot.row;
    for (let c = 0; c < grid[row].length; c++) {
      const tile = grid[row][c];
      if (tile) {
        // Skip unrevealed tiles during start level sequence
        if (isInStartLevelSequence && !revealedTiles.has(`${row},${c}`)) {
          continue;
        }

        const x = gridOffsetX + c * tileSize + tileSize / 2;
        const y = gridOffsetY + row * tileSize + tileSize / 2;
        const tileObj = drawTile(tile, x, y, "animatingTile");
        affectedTileObjs.push(tileObj);
      }
    }
  }

  const animatingObjectObjs: ReturnType<typeof k.add>[] = [];
  const staticObjects: MapObject[] = [];

  for (const obj of objects) {
    // Skip objects in start level sequence
    if (obj.isInStartLevelSequence) {
      continue;
    }

    const isAffected = (affectedRow !== -1 && obj.gridPosition.row === affectedRow) ||
                      (affectedCol !== -1 && obj.gridPosition.col === affectedCol);
    if (isAffected) {
      const x = gridOffsetX + obj.gridPosition.col * tileSize + tileSize / 2 + obj.spriteOffset.x;
      const y = gridOffsetY + obj.gridPosition.row * tileSize + tileSize / 2 + obj.spriteOffset.y;

      // Player plays idle animation when being pushed, others use frame 0
      const spriteConfig = obj.type === ObjectType.Player
        ? { anim: "idle", flipX: obj.flipX }
        : { frame: 0, flipX: obj.flipX };

      const objSprite = k.add([
        k.sprite(obj.sprite, spriteConfig),
        k.pos(x, y),
        k.anchor("center"),
        "animatingObject",
      ]);
      animatingObjectObjs.push(objSprite);
    } else {
      staticObjects.push(obj);
    }
  }

  // Draw static objects using simple rendering (not importing MapObjectRenderer to avoid circular deps)
  const sorted = [...staticObjects].sort((a, b) => a.renderOrder - b.renderOrder);
  for (const obj of sorted) {
    // Skip objects in start level sequence
    if (obj.isInStartLevelSequence) {
      continue;
    }

    const x = gridOffsetX + obj.gridPosition.col * tileSize + tileSize / 2 + obj.pixelOffset.x + obj.spriteOffset.x;
    const y = gridOffsetY + obj.gridPosition.row * tileSize + tileSize / 2 + obj.pixelOffset.y + obj.spriteOffset.y;

    // Player plays idle animation when standing still, others use frame 0
    let spriteConfig;
    if (obj.type === ObjectType.Player) {
      spriteConfig = { anim: "idle", flipX: obj.flipX };
    } else {
      spriteConfig = { frame: 0, flipX: obj.flipX };
    }

    const components: any[] = [
      k.sprite(obj.sprite, spriteConfig),
      k.pos(x, y),
      k.anchor("center"),
      "mapObject",
    ];
    const color = (obj as any).color;
    if (color) {
      components.push(k.color(color.r, color.g, color.b));
    }
    k.add(components);
  }

  const allAnimating = [newTileObj, ...affectedTileObjs, ...animatingObjectObjs];
  for (const gameObj of allAnimating) {
    const startPos = (gameObj as any).pos.clone();
    const endPos = k.vec2(startPos.x + deltaX, startPos.y + deltaY);
    k.tween(
      startPos,
      endPos,
      duration,
      (val) => {
        (gameObj as any).pos = val;
      },
      k.easings.easeOutQuad
    );
  }

  await k.wait(duration);

  k.destroyAll("animatingTile");
  k.destroyAll("animatingObject");
  onComplete();
}

/**
 * Draws decay overlays for all tiles in the grid
 * @param grid The game grid
 * @param offsetX X offset for the grid
 * @param offsetY Y offset for the grid
 * @param tileSize Size of each tile
 */
export function drawDecayOverlay(
  grid: TileInstance[][],
  offsetX: number,
  offsetY: number,
  tileSize: number
): void {
  for (let row = 0; row < grid.length; row++) {
    for (let col = 0; col < grid[row].length; col++) {
      const tile = grid[row][col];
      if (tile && tile.decay > 0) {
        const x = offsetX + col * tileSize + tileSize / 2;
        const y = offsetY + row * tileSize + tileSize / 2;

        k.add([
          k.sprite("decay", { frame: tile.decay }),
          k.pos(x, y),
          k.anchor("center"),
          k.z(5), // Above tiles (z=1) but below objects
          "decayOverlay",
        ]);
      }
    }
  }
}

/**
 * Clears all grid-related visual elements
 */
export function clearGrid(): void {
  k.destroyAll("brickLayer");
  k.destroyAll("gridTile");
  k.destroyAll("plot");
  k.destroyAll("currentTile");
  k.destroyAll("overlay");
  k.destroyAll("highlightArea");
  k.destroyAll("decayOverlay");
}
