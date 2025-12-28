import { Direction, TileType, type TileInstance, type PlotPosition, type Orientation } from "../types";
import { GRID_COLS, GRID_ROWS, GRID_OFFSET_X, GRID_OFFSET_Y, TILE_SIZE } from "../config";
import { TileDeck } from "./TileDeck";

function getCornerTile(row: number, col: number, rows: number, cols: number): TileInstance | null {
  const isTopLeft = row === 0 && col === 0;
  const isTopRight = row === 0 && col === cols - 1;
  const isBottomLeft = row === rows - 1 && col === 0;
  const isBottomRight = row === rows - 1 && col === cols - 1;

  if (isTopLeft) {
    return { type: TileType.L, orientation: 1 as Orientation };
  } else if (isTopRight) {
    return { type: TileType.L, orientation: 2 as Orientation };
  } else if (isBottomLeft) {
    return { type: TileType.L, orientation: 0 as Orientation };
  } else if (isBottomRight) {
    return { type: TileType.L, orientation: 3 as Orientation };
  }

  return null;
}

function isImmovableEdge(row: number, col: number, rows: number, cols: number): boolean {
  const isTopOrBottomEdge = row === 0 || row === rows - 1;
  const isLeftOrRightEdge = col === 0 || col === cols - 1;
  const hasEvenCol = col % 2 === 0;
  const hasEvenRow = row % 2 === 0;

  return (isTopOrBottomEdge && hasEvenCol) || (isLeftOrRightEdge && hasEvenRow);
}

export function createGrid(rows: number, cols: number, deck: TileDeck): TileInstance[][] {
  const grid: TileInstance[][] = [];
  for (let r = 0; r < rows; r++) {
    const row: TileInstance[] = [];
    for (let c = 0; c < cols; c++) {
      const cornerTile = getCornerTile(r, c, rows, cols);
      if (cornerTile) {
        row.push(cornerTile);
      } else if (isImmovableEdge(r, c, rows, cols)) {
        let tile = deck.draw();
        while (tile.type === TileType.CulDeSac) {
          deck.discard(tile);
          tile = deck.draw();
        }
        row.push(tile);
      } else {
        row.push(deck.draw());
      }
    }
    grid.push(row);
  }
  return grid;
}

export function getPlotPositions(rows: number, cols: number): PlotPosition[] {
  const plots: PlotPosition[] = [];

  for (let c = 0; c < cols; c++) {
    if (c % 2 === 1) {
      plots.push({ row: -1, col: c, direction: Direction.South });
      plots.push({ row: rows, col: c, direction: Direction.North });
    }
  }

  for (let r = 0; r < rows; r++) {
    if (r % 2 === 1) {
      plots.push({ row: r, col: -1, direction: Direction.East });
      plots.push({ row: r, col: cols, direction: Direction.West });
    }
  }

  return plots;
}

export function pushTileIntoGrid(
  grid: TileInstance[][],
  plot: PlotPosition,
  tile: TileInstance
): { newGrid: TileInstance[][]; ejectedTile: TileInstance } {
  const rows = grid.length;
  const cols = grid[0].length;
  const newGrid = grid.map(row => [...row]);

  let ejectedTile: TileInstance;

  switch (plot.direction) {
    case Direction.South:
      ejectedTile = newGrid[rows - 1][plot.col];
      for (let r = rows - 1; r > 0; r--) {
        newGrid[r][plot.col] = newGrid[r - 1][plot.col];
      }
      newGrid[0][plot.col] = tile;
      break;

    case Direction.North:
      ejectedTile = newGrid[0][plot.col];
      for (let r = 0; r < rows - 1; r++) {
        newGrid[r][plot.col] = newGrid[r + 1][plot.col];
      }
      newGrid[rows - 1][plot.col] = tile;
      break;

    case Direction.East:
      ejectedTile = newGrid[plot.row][cols - 1];
      for (let c = cols - 1; c > 0; c--) {
        newGrid[plot.row][c] = newGrid[plot.row][c - 1];
      }
      newGrid[plot.row][0] = tile;
      break;

    case Direction.West:
      ejectedTile = newGrid[plot.row][0];
      for (let c = 0; c < cols - 1; c++) {
        newGrid[plot.row][c] = newGrid[plot.row][c + 1];
      }
      newGrid[plot.row][cols - 1] = tile;
      break;
  }

  return { newGrid, ejectedTile };
}

export function getPlotScreenPosition(plot: PlotPosition): { x: number; y: number } {
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
