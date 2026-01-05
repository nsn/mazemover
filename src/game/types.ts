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
  Guardian: "Guardian",
} as const;

export type AIType = (typeof AIType)[keyof typeof AIType];

export interface Stats {
  hp: number;
  atk: number;
  def: number;
  agi: number;
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
  playingDropAnimation: boolean;  // True if player is playing the drop animation (on game start)
  renderOrder: number;
  sprite: string;
  movementSpeed: number;
  movementAccumulator: number;
  movesRemaining: number;
  stats?: Stats;
  currentHP?: number;
  onEnter?: MapObjectCallback;
  onExit?: MapObjectCallback;
  aiType?: AIType;
  protectedTile?: TileInstance;
}
