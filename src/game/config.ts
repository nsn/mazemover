export const TILE_SIZE = 32;
export const DOOR_SIZE = 8;
export const GRID_COLS = 7;
export const GRID_ROWS = 7;

export const GRID_OFFSET_X = 96;
export const GRID_OFFSET_Y = Math.floor((360 - GRID_ROWS * TILE_SIZE) / 2);

export const PLOT_SIZE = TILE_SIZE;
export const ARROW_SIZE = 16;

export const PREVIEW_X = GRID_OFFSET_X + GRID_COLS * TILE_SIZE + TILE_SIZE * 3;
export const PREVIEW_Y = Math.floor(360 / 2);

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
  CulDeSac: 5,
  Straight: 12,
  L: 20,
  T: 18,
  Cross: 5,
} as const;

export const DECAY_WEIGHTS = {
  0: 30,
  1: 10,
  2: 5,
  3: 0,
  4: 0,
  5: 0,
} as const;

// Decay Progression Configuration
export const DECAY_PROGRESSION = {
  MAX_DECAY: 5,                    // Maximum decay level a tile can reach
  ON_TILE_PLACEMENT: 2,            // Number of tiles to decay when placing a tile
  ON_WALL_BREAK: 1,                // Number of tiles to decay when breaking a wall
  ON_TILE_ROTATION: 2,             // Number of tiles to decay when rotating player's tile
} as const;

// Combat Configuration
export const COMBAT = {
  BASE_HIT: 70,           // Base hit chance percentage
  HIT_MODIFIER: 5,        // Multiplier for AGI difference
  TO_HIT: 100,            // Threshold for successful hit (toHitRoll must be <= this)
  CRIT_CHANCE: 95,        // Threshold for critical hit (toHitRoll must be >= this)
  CRIT_MULT: 2,           // Critical hit damage multiplier
} as const;

// Start Level Sequence Configuration
export const START_LEVEL = {
  GRID_REVEAL_DURATION: 1.1,     // Duration in seconds to reveal the grid
  OBJECT_SPAWN_DELAY: 0.1,       // Delay in seconds between spawning each object
  PLAYER_DROP_DELAY: 0.2,        // Delay before player drop animation starts
  FADE_IN_DURATION: 0.15,         // Duration of fade-in for each tile/object
} as const;

// Inventory Configuration
export const INVENTORY = {
  X: GRID_OFFSET_X + GRID_COLS * TILE_SIZE + (640 - (GRID_OFFSET_X + GRID_COLS * TILE_SIZE)) / 2,
  Y: 180,
  SLOTS_X: 5,
  SLOTS_Y: 2,
  SLOT_SIZE: 26,
  SLOT_SPACING: 2,
  PATCH_SIZE: 8,  // 9-patch border size
}

// Logging Configuration
export const LOG_LEVEL = {
  NONE: 0,
  ERROR: 1,
  WARN: 2,
  INFO: 3,
  DEBUG: 4,
} as const;

export const CURRENT_LOG_LEVEL = LOG_LEVEL.DEBUG; // Change to LOG_LEVEL.NONE to disable all logging
