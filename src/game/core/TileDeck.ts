import { TileType, type TileInstance } from "../types";
import { getRandomOrientation } from "./Tile";

const TILE_WEIGHTS: Record<TileType, number> = {
  [TileType.CulDeSac]: 1,
  [TileType.Straight]: 2,
  [TileType.L]: 3,
  [TileType.T]: 3,
  [TileType.Cross]: 1,
};

export function drawRandomTile(): TileInstance {
  const entries = Object.entries(TILE_WEIGHTS) as [TileType, number][];
  const totalWeight = entries.reduce((sum, [, weight]) => sum + weight, 0);

  let random = Math.random() * totalWeight;

  for (const [type, weight] of entries) {
    random -= weight;
    if (random <= 0) {
      return {
        type,
        orientation: getRandomOrientation(),
      };
    }
  }

  return {
    type: TileType.Straight,
    orientation: getRandomOrientation(),
  };
}
