import { k } from "../../kaplayCtx";
import { Direction, type TileInstance, type PlotPosition } from "../types";
import { getTileEdges } from "../core/Tile";
import { TILE_SIZE, DOOR_SIZE, GRID_OFFSET_X, GRID_OFFSET_Y, COLORS, GRID_COLS, GRID_ROWS } from "../config";

export function drawTile(
  tile: TileInstance,
  x: number,
  y: number,
  tag?: string
): ReturnType<typeof k.add> {
  const edges = getTileEdges(tile.type, tile.orientation);
  const halfTile = TILE_SIZE / 2;

  const tileObj = k.add([
    k.pos(x, y),
    k.anchor("center"),
    tag ? tag : "tile",
  ]);

  tileObj.add([
    k.rect(TILE_SIZE, TILE_SIZE),
    k.color(...COLORS.wall),
    k.anchor("center"),
  ]);

  tileObj.add([
    k.rect(TILE_SIZE - 8, TILE_SIZE - 8),
    k.color(...COLORS.floor),
    k.anchor("center"),
  ]);

  if (edges.north) {
    tileObj.add([
      k.rect(DOOR_SIZE, 8),
      k.color(...COLORS.floor),
      k.anchor("center"),
      k.pos(0, -halfTile + 4),
    ]);
  }

  if (edges.south) {
    tileObj.add([
      k.rect(DOOR_SIZE, 8),
      k.color(...COLORS.floor),
      k.anchor("center"),
      k.pos(0, halfTile - 4),
    ]);
  }

  if (edges.east) {
    tileObj.add([
      k.rect(8, DOOR_SIZE),
      k.color(...COLORS.floor),
      k.anchor("center"),
      k.pos(halfTile - 4, 0),
    ]);
  }

  if (edges.west) {
    tileObj.add([
      k.rect(8, DOOR_SIZE),
      k.color(...COLORS.floor),
      k.anchor("center"),
      k.pos(-halfTile + 4, 0),
    ]);
  }

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
  isActive: boolean,
  onClick: () => void
): ReturnType<typeof k.add> {
  const { x, y } = getPlotScreenPos(plot);

  const plotObj = k.add([
    k.pos(x, y),
    k.rect(TILE_SIZE - 4, TILE_SIZE - 4),
    k.color(...COLORS.plotBg),
    k.anchor("center"),
    k.area(),
    "plot",
  ]);

  plotObj.onClick(onClick);

  const arrowColor = isActive ? COLORS.arrowGreen : COLORS.arrowRed;
  const arrowRotation = getArrowRotation(plot.direction);

  plotObj.add([
    k.polygon([
      k.vec2(0, -6),
      k.vec2(6, 6),
      k.vec2(-6, 6),
    ]),
    k.color(...arrowColor),
    k.anchor("center"),
    k.rotate(arrowRotation),
  ]);

  return plotObj;
}

function getPlotScreenPos(plot: PlotPosition): { x: number; y: number } {
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

function getArrowRotation(direction: Direction): number {
  switch (direction) {
    case Direction.South: return 180;
    case Direction.North: return 0;
    case Direction.East: return 90;
    case Direction.West: return 270;
  }
}

export function drawPlots(
  plots: PlotPosition[],
  selectedPlot: PlotPosition | null,
  onPlotClick: (plot: PlotPosition) => void
): void {
  for (const plot of plots) {
    const isActive = selectedPlot !== null &&
      selectedPlot.row === plot.row &&
      selectedPlot.col === plot.col;
    drawPlot(plot, isActive, () => onPlotClick(plot));
  }
}

export function clearAllTiles(): void {
  k.destroyAll("gridTile");
  k.destroyAll("plot");
  k.destroyAll("currentTile");
}

export function drawCurrentTile(
  tile: TileInstance,
  plot: PlotPosition,
  onClick: () => void
): ReturnType<typeof k.add> {
  const { x, y } = getPlotScreenPos(plot);
  const tileObj = drawTile(tile, x, y, "currentTile");
  
  const clickArea = tileObj.add([
    k.rect(TILE_SIZE, TILE_SIZE),
    k.color(255, 255, 255),
    k.opacity(0),
    k.anchor("center"),
    k.area(),
  ]);

  clickArea.onClick(onClick);
  
  return tileObj;
}
