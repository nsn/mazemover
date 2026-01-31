export const TileType = {
  CulDeSac: "CulDeSac",
  Straight: "Straight",
  L: "L",
  T: "T",
  Cross: "Cross",
} as const;

export type TileType = (typeof TileType)[keyof typeof TileType];

export const Direction = {
  North: 0,
  East: 1,
  South: 2,
  West: 3,
} as const;

export type Direction = (typeof Direction)[keyof typeof Direction];

export type EdgeMask = {
  north: boolean;
  east: boolean;
  south: boolean;
  west: boolean;
};

export type Orientation = 0 | 1 | 2 | 3;

export interface TileInstance {
  type: TileType;
  orientation: Orientation;
  decay: number;  // Decay level: 0 = no decay, higher values = worse condition
}

export interface GridPosition {
  row: number;
  col: number;
}

export interface PlotPosition {
  row: number;
  col: number;
  direction: Direction;
}

export const TurnOwner = {
  Player: "Player",
  Enemy: "Enemy",
} as const;

export type TurnOwner = (typeof TurnOwner)[keyof typeof TurnOwner];

export const PlayerPhase = {
  AwaitingAction: "AwaitingAction",
  TilePlacement: "TilePlacement",
  Moving: "Moving",
  RotatingTile: "RotatingTile",
} as const;

export type PlayerPhase = (typeof PlayerPhase)[keyof typeof PlayerPhase];

export interface GameState {
  grid: TileInstance[][];
  currentTile: TileInstance | null;
  selectedPlot: PlotPosition | null;
  turnOwner: TurnOwner;
  playerPhase: PlayerPhase;
  hasPlacedTile: boolean;
  rotatingTilePosition: GridPosition | null;
  originalTileOrientation: Orientation | null;
  isInStartLevelSequence: boolean;  // True during the start level animation sequence
  revealedTiles: Set<string>;  // Set of "row,col" strings for revealed tiles during start sequence
  wallBumpCount: number;  // Number of consecutive wall bumps
  wallBumpTarget: GridPosition | null;  // Target tile of current wall bump sequence
  currentLevel: number;  // Current dungeon level (counts down from STARTING_LEVEL to 0)
  isAscending: boolean;  // True if player is ascending (going toward surface), false if descending (going deeper)
  inventory: (ItemInstance | null)[];  // Player inventory - array of item instances or null for empty slots
  equipment: (ItemInstance | null)[];  // Player equipment - 5 slots: [0=Head, 1=LeftHand, 2=RightHand, 3=Legs, 4=Torso]
  buffs: Buff[];  // Active buffs on the player
}

export const ObjectType = {
  Player: "Player",
  Enemy: "Enemy",
  Item: "Item",
  Exit: "Exit",
} as const;

export type ObjectType = (typeof ObjectType)[keyof typeof ObjectType];

export const AIType = {
  Hunter: "Hunter",
  Ranged: "Ranged",
  Healer: "Healer",
  Teleporter: "Teleporter",
  Summoner: "Summoner",
  King: "King",
} as const;

export type AIType = (typeof AIType)[keyof typeof AIType];

export interface Stats {
  hp: number;
  atk: number;
  def: number;
  agi: number;
}

export const ItemType = {
  Equipment: "Equipment",
  Consumable: "Consumable",
} as const;

export type ItemType = (typeof ItemType)[keyof typeof ItemType];

export const EquipmentSlot = {
  Head: "Head",
  MainHand: "MainHand",
  OffHand: "OffHand",
  Legs: "Legs",
  Torso: "Torso",
} as const;

export type EquipmentSlot = (typeof EquipmentSlot)[keyof typeof EquipmentSlot];

export interface ItemDefinition {
  id: string;
  name: string;
  type: ItemType;
  sprite: string;  // Sprite atlas name (e.g., "items")
  frame: number;   // Frame index within the sprite atlas
  tier: number;  // Item tier, typically 1-3
  charges: number;  // Negative = infinite, default -1 for equipment, 1 for consumables
  statBonuses?: Partial<Stats>;  // Stat bonuses for equipment
  slot?: EquipmentSlot | EquipmentSlot[];  // Single slot or array for two-handed weapons
  description?: string;
}

export interface ItemInstance {
  definitionId: string;
  remainingCharges: number;
}

export interface Buff {
  id: string;           // Unique identifier for this buff instance
  name: string;         // Display name
  iconSprite: string;   // Sprite name for icon
  iconFrame: number;    // Frame index for icon
}

export type MapObjectCallback = (mob: MapObject, isPlayer: boolean) => void;

export interface MapObject {
  id: number;
  name: string;
  type: ObjectType;
  gridPosition: GridPosition;
  pixelOffset: { x: number; y: number };
  spriteOffset: { x: number; y: number };  // Offset for sprite rendering (e.g., to lift sprite up)
  flipX: boolean;  // True if sprite is flipped horizontally (facing left)
  isInStartLevelSequence: boolean;  // True if object is part of start level sequence
  isPlayingDropAnimation: boolean;  // True if player is currently playing drop animation
  entryAnimationName?: string;  // Name of entry animation to play ("drop" or "rise")
  renderOrder: number;
  sprite: string;
  frame?: number;  // Frame index for items (optional, used when sprite is an atlas)
  movementSpeed: number;
  movementAccumulator: number;
  movesRemaining: number;
  stats?: Stats;
  baseStats?: Stats;  // Base stats before equipment bonuses
  currentHP?: number;
  flying: boolean;  // True if entity is flying (immune to ground hazards)
  tier?: number;  // Enemy tier (only for enemies)
  dropChance?: number;  // Item drop probability on death (only for enemies)
  remainingCharges?: number;  // Remaining charges (only for items with charges)
  onEnter?: MapObjectCallback;
  onExit?: MapObjectCallback;
  aiType?: AIType;
  projectile?: string;  // Projectile sprite name for ranged enemies (default: "arrow")
  teleportCounter?: number;  // Counter for teleporter enemies - teleports when reaching threshold
  summonCounter?: number;  // Counter for summoner enemies - summons skeleton when reaching threshold
  kingSpawnCounter?: number;  // Counter for king enemy - spawns random enemy when reaching threshold
}
