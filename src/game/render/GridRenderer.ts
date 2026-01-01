import { k } from "../../kaplayCtx";
import { TileType, Direction, PlayerPhase, type TileInstance, type PlotPosition, type MapObject } from "../types";
import { COLORS } from "../config";
import { TileFrames } from "../assets";

function getTileFrame(type: TileType): number {
  switch (type) {
    case TileType.CulDeSac: return TileFrames.CulDeSac;
    case TileType.Straight: return TileFrames.Straight;
    case TileType.L: return TileFrames.L;
    case TileType.T: return TileFrames.T;
    case TileType.Cross: return TileFrames.Cross;
  }
}

function orientationToAngle(orientation: number): number {
  return orientation * 90;
}

function directionToAngle(direction: Direction): number {
  return direction * 90;
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
  const frame = getTileFrame(tile.type);
  const angle = orientationToAngle(tile.orientation);

  const tileObj = k.add([
    k.sprite("tiles", { frame }),
    k.pos(x, y),
    k.anchor("center"),
    k.rotate(angle),
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
  const angle = directionToAngle(plot.direction);

  const isGreen = isSelected && playerPhase === PlayerPhase.TilePlacement;
  const tintColor = isGreen
    ? k.rgb(100, 255, 100)
    : k.rgb(255, 100, 100);

  const plotObj = k.add([
    k.sprite("tiles", { frame: TileFrames.Plot }),
    k.pos(x, y),
    k.anchor("center"),
    k.rotate(angle),
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
  screenHeight: number
): void {
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
  const frame = getTileFrame(tile.type);
  const angle = orientationToAngle(tile.orientation);

  const tileObj = k.add([
    k.sprite("tiles", { frame }),
    k.pos(x, y),
    k.anchor("center"),
    k.rotate(angle),
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
  onComplete: () => void
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
    const isAffected = (affectedRow !== -1 && obj.gridPosition.row === affectedRow) ||
                      (affectedCol !== -1 && obj.gridPosition.col === affectedCol);
    if (isAffected) {
      const x = gridOffsetX + obj.gridPosition.col * tileSize + tileSize / 2;
      const y = gridOffsetY + obj.gridPosition.row * tileSize + tileSize / 2;
      const objSprite = k.add([
        k.sprite(obj.sprite),
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
    const x = gridOffsetX + obj.gridPosition.col * tileSize + tileSize / 2 + obj.pixelOffset.x;
    const y = gridOffsetY + obj.gridPosition.row * tileSize + tileSize / 2 + obj.pixelOffset.y;
    const components: any[] = [
      k.sprite(obj.sprite),
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
 * Clears all grid-related visual elements
 */
export function clearGrid(): void {
  k.destroyAll("gridTile");
  k.destroyAll("plot");
  k.destroyAll("currentTile");
  k.destroyAll("overlay");
  k.destroyAll("highlightArea");
}
