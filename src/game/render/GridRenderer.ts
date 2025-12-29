import { k } from "../../kaplayCtx";
import { TileType, Direction, PlayerPhase, type TileInstance, type PlotPosition, type MapObject } from "../types";
import { TILE_SIZE, GRID_OFFSET_X, GRID_OFFSET_Y, GRID_COLS, GRID_ROWS, PREVIEW_X, PREVIEW_Y, COLORS } from "../config";
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

export function getPlotScreenPos(plot: PlotPosition): { x: number; y: number } {
  let x: number;
  let y: number;

  if (plot.row === -1) {
    x = GRID_OFFSET_X + plot.col * TILE_SIZE + TILE_SIZE / 2;
    y = GRID_OFFSET_Y - TILE_SIZE / 2;
  } else if (plot.row === GRID_ROWS) {
    x = GRID_OFFSET_X + plot.col * TILE_SIZE + TILE_SIZE / 2;
    y = GRID_OFFSET_Y + GRID_ROWS * TILE_SIZE + TILE_SIZE / 2;
  } else if (plot.col === -1) {
    x = GRID_OFFSET_X - TILE_SIZE / 2;
    y = GRID_OFFSET_Y + plot.row * TILE_SIZE + TILE_SIZE / 2;
  } else {
    x = GRID_OFFSET_X + GRID_COLS * TILE_SIZE + TILE_SIZE / 2;
    y = GRID_OFFSET_Y + plot.row * TILE_SIZE + TILE_SIZE / 2;
  }

  return { x, y };
}

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

export function drawGrid(grid: TileInstance[][]): void {
  for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < grid[r].length; c++) {
      const tile = grid[r][c];
      if (tile) {
        const x = GRID_OFFSET_X + c * TILE_SIZE + TILE_SIZE / 2;
        const y = GRID_OFFSET_Y + r * TILE_SIZE + TILE_SIZE / 2;
        drawTile(tile, x, y, "gridTile");
      }
    }
  }
}

export function drawPlot(
  plot: PlotPosition,
  isSelected: boolean,
  playerPhase: PlayerPhase
): ReturnType<typeof k.add> {
  const { x, y } = getPlotScreenPos(plot);
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

export function drawPlots(
  plots: PlotPosition[],
  selectedPlot: PlotPosition | null,
  playerPhase: PlayerPhase
): void {
  for (const plot of plots) {
    const isSelected = selectedPlot !== null &&
      selectedPlot.row === plot.row &&
      selectedPlot.col === plot.col;
    drawPlot(plot, isSelected, playerPhase);
  }
}

export function clearAllTiles(): void {
  k.destroyAll("gridTile");
  k.destroyAll("plot");
  k.destroyAll("currentTile");
  k.destroyAll("previewTile");
  k.destroyAll("previewLabel");
  k.destroyAll("overlay");
  k.destroyAll("highlightArea");
  k.destroyAll("mapObject");
  k.destroyAll("reachableHighlight");
  k.destroyAll("movingPlayer");
}

export function drawMapObjects(objects: MapObject[]): void {
  const sorted = [...objects].sort((a, b) => a.renderOrder - b.renderOrder);

  for (const obj of sorted) {
    const x = GRID_OFFSET_X + obj.gridPosition.col * TILE_SIZE + TILE_SIZE / 2 + obj.pixelOffset.x;
    const y = GRID_OFFSET_Y + obj.gridPosition.row * TILE_SIZE + TILE_SIZE / 2 + obj.pixelOffset.y;

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

export function drawReachableTiles(tiles: { position: { row: number; col: number } }[]): void {
  for (const tile of tiles) {
    const x = GRID_OFFSET_X + tile.position.col * TILE_SIZE + TILE_SIZE / 2;
    const y = GRID_OFFSET_Y + tile.position.row * TILE_SIZE + TILE_SIZE / 2;

    k.add([
      k.rect(TILE_SIZE - 2, TILE_SIZE - 2),
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

export function drawPreviewTile(
  tile: TileInstance
): ReturnType<typeof k.add> {
  k.add([
    k.text("AZ az 10 !@", { font: "bblocky", size: 14 }),
    k.pos(PREVIEW_X, PREVIEW_Y - 40),
    k.anchor("center"),
    k.color(200, 200, 200),
    "previewLabel",
  ]);

  const frame = getTileFrame(tile.type);
  const angle = orientationToAngle(tile.orientation);

  const tileObj = k.add([
    k.sprite("tiles", { frame }),
    k.pos(PREVIEW_X, PREVIEW_Y),
    k.anchor("center"),
    k.rotate(angle),
    k.scale(1.5),
    k.area(),
    "previewTile",
  ]);

  return tileObj;
}

export function drawGridWithOverlay(
  grid: TileInstance[][],
  selectedPlot: PlotPosition | null
): void {
  const gridWidth = GRID_COLS * TILE_SIZE;
  const gridHeight = GRID_ROWS * TILE_SIZE;

  if (selectedPlot) {
    const isHorizontal = selectedPlot.col === -1 || selectedPlot.col === GRID_COLS;
    const highlightRow = isHorizontal ? selectedPlot.row : -1;
    const highlightCol = isHorizontal ? -1 : selectedPlot.col;

    k.add([
      k.rect(640, 360),
      k.pos(0, 0),
      k.color(...COLORS.overlay),
      k.opacity(0.6),
      "overlay",
    ]);

    for (let r = 0; r < grid.length; r++) {
      for (let c = 0; c < grid[r].length; c++) {
        const tile = grid[r][c];
        if (tile) {
          const x = GRID_OFFSET_X + c * TILE_SIZE + TILE_SIZE / 2;
          const y = GRID_OFFSET_Y + r * TILE_SIZE + TILE_SIZE / 2;
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
        k.rect(gridWidth, TILE_SIZE),
        k.pos(GRID_OFFSET_X, GRID_OFFSET_Y + highlightRow * TILE_SIZE),
        k.color(255, 255, 255),
        k.opacity(0),
        k.area(),
        "highlightArea",
      ]);
    } else if (highlightCol !== -1) {
      k.add([
        k.rect(TILE_SIZE, gridHeight),
        k.pos(GRID_OFFSET_X + highlightCol * TILE_SIZE, GRID_OFFSET_Y),
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
          const x = GRID_OFFSET_X + c * TILE_SIZE + TILE_SIZE / 2;
          const y = GRID_OFFSET_Y + r * TILE_SIZE + TILE_SIZE / 2;
          drawTile(tile, x, y, "gridTile");
        }
      }
    }
  }
}

export function drawCurrentTile(
  tile: TileInstance,
  plot: PlotPosition
): ReturnType<typeof k.add> {
  const { x, y } = getPlotScreenPos(plot);
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

export async function animatePush(
  grid: TileInstance[][],
  plot: PlotPosition,
  newTile: TileInstance,
  objects: MapObject[],
  onComplete: () => void
): Promise<void> {
  const duration = 0.2;
  const { x: startX, y: startY } = getPlotScreenPos(plot);

  let deltaX = 0;
  let deltaY = 0;

  if (plot.direction === Direction.South) {
    deltaY = TILE_SIZE;
  } else if (plot.direction === Direction.North) {
    deltaY = -TILE_SIZE;
  } else if (plot.direction === Direction.East) {
    deltaX = TILE_SIZE;
  } else if (plot.direction === Direction.West) {
    deltaX = -TILE_SIZE;
  }

  const isVertical = plot.row === -1 || plot.row === GRID_ROWS;
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
          const x = GRID_OFFSET_X + c * TILE_SIZE + TILE_SIZE / 2;
          const y = GRID_OFFSET_Y + r * TILE_SIZE + TILE_SIZE / 2;
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
        const x = GRID_OFFSET_X + col * TILE_SIZE + TILE_SIZE / 2;
        const y = GRID_OFFSET_Y + r * TILE_SIZE + TILE_SIZE / 2;
        const tileObj = drawTile(tile, x, y, "animatingTile");
        affectedTileObjs.push(tileObj);
      }
    }
  } else {
    const row = plot.row;
    for (let c = 0; c < grid[row].length; c++) {
      const tile = grid[row][c];
      if (tile) {
        const x = GRID_OFFSET_X + c * TILE_SIZE + TILE_SIZE / 2;
        const y = GRID_OFFSET_Y + row * TILE_SIZE + TILE_SIZE / 2;
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
      const x = GRID_OFFSET_X + obj.gridPosition.col * TILE_SIZE + TILE_SIZE / 2;
      const y = GRID_OFFSET_Y + obj.gridPosition.row * TILE_SIZE + TILE_SIZE / 2;
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

  drawMapObjects(staticObjects);

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
