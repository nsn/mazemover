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

export const TurnPhase = {
  Draw: "Draw",
  Place: "Place",
  Push: "Push",
} as const;

export type TurnPhase = (typeof TurnPhase)[keyof typeof TurnPhase];

export interface GameState {
  grid: TileInstance[][];
  currentTile: TileInstance | null;
  selectedPlot: PlotPosition | null;
  turnPhase: TurnPhase;
}

export const ObjectType = {
  Player: "Player",
  Enemy: "Enemy",
  Item: "Item",
  Exit: "Exit",
} as const;

export type ObjectType = (typeof ObjectType)[keyof typeof ObjectType];

export interface MapObject {
  id: number;
  name: string;
  type: ObjectType;
  gridPosition: GridPosition;
  pixelOffset: { x: number; y: number };
  renderOrder: number;
  sprite: string;
}
