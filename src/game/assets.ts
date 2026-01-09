import { k } from "../kaplayCtx";
import { EnemyDatabase } from "./systems/EnemyDatabase";

export async function loadAssets(): Promise<void> {
  await k.loadSprite("tiles", "/tiles.png", {
    sliceX: 6,
    sliceY: 4,
  });

  await k.loadSprite("bricks", "/bricks.png", {
    sliceX: 3,
    sliceY: 3,
    anims: {
      NW: 0,
      N: 1,
      NE: 2,
      W: 3,
      C: 4,
      E: 5,
      SW: 6,
      S: 7,
      SE: 8,
    },
  });

  await k.loadSprite("inventory", "/inventory.png")

  await k.loadSprite("mason", "/mason.png", {
    sliceX: 11,
    sliceY: 118,
    anims: {
      idle: {from : 0, to: 3, loop: true},
      walk: {from : 110, to: 113, loop: true},
      drop: {from : 186, to: 197, loop: false, speed: 10},
    }
  });

  await k.loadBitmapFont("bblocky", "/blocky.png", 5, 7, {
    //chars: `ABCDEFGHIJKLMNOPQRSTUVWXYZ      abcdefghijklmnopqrstuvwxyz      01234567890      !"#$%&'()*+,-./:;<=>?[]\\^_\`{}|~@∎`,
    chars: `ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz01234567890!"#$%&'()*+,-./:;<=>?[]\\^_\`{}|~@∎ `,
  });

  await k.loadBitmapFont("3x5", "/font_3x5.png", 4, 6, {
    chars: `ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+-=:.,()/\\?!'% `,
  });

  await k.loadSprite("player", "/player.png");
  await k.loadSprite("enemy", "/enemy.png");
  await k.loadSprite("exit", "/exit.png");
  await k.loadSprite("skip_button", "/skip_button.png");
}

export const TileFrames = {
  CulDeSac: 0,
  Straight: 1,
  L: 2,
  T: 3,
  Cross: 4,
  Plot: 5,
} as const;

export const BrickFrames = {
  NW: 0,
  N: 1,
  NE: 2,
  W: 3,
  C: 4,
  E: 5,
  SW: 6,
  S: 7,
  SE: 8,
} as const;

// Global enemy database instance
export const enemyDatabase = new EnemyDatabase();

export async function loadEnemyDatabase(): Promise<void> {
  await enemyDatabase.load("/enemies.json");
}
