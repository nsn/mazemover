import { TileType, type EdgeMask, type Orientation } from "../types";

const BASE_EDGES: Record<TileType, EdgeMask> = {
  [TileType.CulDeSac]: { north: true, east: false, south: false, west: false },
  [TileType.Straight]: { north: true, east: false, south: true, west: false },
  [TileType.L]: { north: true, east: true, south: false, west: false },
  [TileType.T]: { north: true, east: true, south: false, west: true },
  [TileType.Cross]: { north: true, east: true, south: true, west: true },
};

export function getBaseEdges(type: TileType): EdgeMask {
  return { ...BASE_EDGES[type] };
}

export function rotateEdges(edges: EdgeMask, times: number): EdgeMask {
  let result = { ...edges };
  for (let i = 0; i < times; i++) {
    result = {
      north: result.west,
      east: result.north,
      south: result.east,
      west: result.south,
    };
  }
  return result;
}

export function getTileEdges(type: TileType, orientation: Orientation): EdgeMask {
  return rotateEdges(getBaseEdges(type), orientation);
}

export function rotateTile(orientation: Orientation): Orientation {
  return ((orientation + 1) % 4) as Orientation;
}

export function getRandomTileType(): TileType {
  const types = Object.values(TileType);
  return types[Math.floor(Math.random() * types.length)];
}

export function getRandomOrientation(): Orientation {
  return Math.floor(Math.random() * 4) as Orientation;
}

export function createRandomTile(): { type: TileType; orientation: Orientation } {
  return {
    type: getRandomTileType(),
    orientation: getRandomOrientation(),
  };
}
