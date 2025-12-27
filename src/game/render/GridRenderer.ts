import { k } from "../../kaplayCtx";
import { TileType, Direction, TurnPhase, type TileInstance, type PlotPosition } from "../types";
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
  turnPhase: TurnPhase,
  onClick: () => void
): ReturnType<typeof k.add> {
  const { x, y } = getPlotScreenPos(plot);
  const angle = directionToAngle(plot.direction);

  const isGreen = isSelected && turnPhase === TurnPhase.Push;
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
  ]);

  plotObj.onClick(onClick);

  return plotObj;
}

export function drawPlots(
  plots: PlotPosition[],
  selectedPlot: PlotPosition | null,
  turnPhase: TurnPhase,
  onPlotClick: (plot: PlotPosition) => void
): void {
  for (const plot of plots) {
    const isSelected = selectedPlot !== null &&
      selectedPlot.row === plot.row &&
      selectedPlot.col === plot.col;
    drawPlot(plot, isSelected, turnPhase, () => onPlotClick(plot));
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

export async function animatePush(
  grid: TileInstance[][],
  plot: PlotPosition,
  newTile: TileInstance,
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

  const newTileObj = drawTile(newTile, startX, startY, "animatingTile");

  const affectedTiles: ReturnType<typeof k.add>[] = [];

  if (plot.row === -1 || plot.row === GRID_ROWS) {
    const col = plot.col;
    for (let r = 0; r < grid.length; r++) {
      const tile = grid[r][col];
      if (tile) {
        const x = GRID_OFFSET_X + col * TILE_SIZE + TILE_SIZE / 2;
        const y = GRID_OFFSET_Y + r * TILE_SIZE + TILE_SIZE / 2;
        const tileObj = drawTile(tile, x, y, "animatingTile");
        affectedTiles.push(tileObj);
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
        affectedTiles.push(tileObj);
      }
    }
  }

  k.destroyAll("gridTile");

  const allTiles = [newTileObj, ...affectedTiles];
  for (const tileObj of allTiles) {
    const startPos = (tileObj as any).pos.clone();
    const endPos = k.vec2(startPos.x + deltaX, startPos.y + deltaY);
    k.tween(
      startPos,
      endPos,
      duration,
      (val) => {
        (tileObj as any).pos = val;
      },
      k.easings.easeOutQuad
    );
  }

  await k.wait(duration);

  k.destroyAll("animatingTile");
  onComplete();
}
