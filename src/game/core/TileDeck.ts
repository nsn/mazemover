import { TileType, type TileInstance } from "../types";
import { getRandomOrientation } from "./Tile";

const TILE_WEIGHTS: Record<TileType, number> = {
  [TileType.CulDeSac]: 1,
  [TileType.Straight]: 2,
  [TileType.L]: 3,
  [TileType.T]: 3,
  [TileType.Cross]: 1,
};

function createRandomTileInstance(): TileInstance {
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

function shuffle<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export class TileDeck {
  private drawPile: TileInstance[] = [];
  private discardPile: TileInstance[] = [];

  constructor(totalTiles: number) {
    for (let i = 0; i < totalTiles; i++) {
      this.drawPile.push(createRandomTileInstance());
    }
    this.drawPile = shuffle(this.drawPile);
  }

  draw(): TileInstance {
    if (this.drawPile.length === 0) {
      this.reshuffleDiscard();
    }

    const tile = this.drawPile.pop();
    if (!tile) {
      return createRandomTileInstance();
    }
    return tile;
  }

  peek(): TileInstance | null {
    if (this.drawPile.length === 0) {
      this.reshuffleDiscard();
    }
    return this.drawPile.length > 0 ? this.drawPile[this.drawPile.length - 1] : null;
  }

  discard(tile: TileInstance): void {
    this.discardPile.push(tile);
  }

  private reshuffleDiscard(): void {
    if (this.discardPile.length === 0) return;
    this.drawPile = shuffle(this.discardPile);
    this.discardPile = [];
  }

  getDrawPileCount(): number {
    return this.drawPile.length;
  }

  getDiscardPileCount(): number {
    return this.discardPile.length;
  }
}
