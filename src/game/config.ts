export const TILE_SIZE = 32;
export const DOOR_SIZE = 8;
export const GRID_COLS = 7;
export const GRID_ROWS = 7;

export const GRID_OFFSET_X = 160;
export const GRID_OFFSET_Y = Math.floor((432 - GRID_ROWS * TILE_SIZE) / 2);

export const PLOT_SIZE = TILE_SIZE;
export const ARROW_SIZE = 16;

export const PREVIEW_X = GRID_OFFSET_X + GRID_COLS * TILE_SIZE + TILE_SIZE * 3;
export const PREVIEW_Y = Math.floor(432 / 2);

export const COLORS = {
  wall: [80, 80, 80] as [number, number, number],
  floor: [200, 200, 200] as [number, number, number],
  door: [180, 180, 180] as [number, number, number],
  arrowRed: [255, 80, 80] as [number, number, number],
  arrowGreen: [80, 255, 80] as [number, number, number],
  plotBg: [40, 40, 40] as [number, number, number],
  overlay: [0, 0, 0] as [number, number, number],
};

export const TILE_WEIGHTS = {
  CulDeSac: 1,
  Straight: 1,
  L: 1,
  T: 1,
  Cross: 1,
} as const;
