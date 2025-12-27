import { k } from "../../kaplayCtx";
import { TileType, type TileInstance, type PlotPosition } from "../types";
import { TILE_SIZE, GRID_OFFSET_X, GRID_OFFSET_Y, GRID_COLS, GRID_ROWS } from "../config";
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
  isActive: boolean,
  onClick: () => void
): ReturnType<typeof k.add> {
  const { x, y } = getPlotScreenPos(plot);

  const plotObj = k.add([
    k.sprite("tiles", { frame: TileFrames.Plot }),
    k.pos(x, y),
    k.anchor("center"),
    k.area(),
    k.opacity(isActive ? 1 : 0.6),
    "plot",
  ]);

  plotObj.onClick(onClick);

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

  tileObj.onClick(onClick);

  return tileObj;
}
