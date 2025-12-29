import { k } from "../kaplayCtx";

export async function loadAssets(): Promise<void> {
  await k.loadSprite("tiles", "/tiles.png", {
    sliceX: 6,
    sliceY: 1,
    anims: {
      culdesac: 0,
      straight: 1,
      l: 2,
      t: 3,
      cross: 4,
      plot: 5,
    },
  });

  await k.loadFont("blocky", "/blocky.ttf", {size: 9} );
  
  await k.loadBitmapFont("bblocky", "/blocky.png", 5, 7, {
    //chars: `ABCDEFGHIJKLMNOPQRSTUVWXYZ      abcdefghijklmnopqrstuvwxyz      01234567890      !"#$%&'()*+,-./:;<=>?[]\\^_\`{}|~@∎`,
    chars: `ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz01234567890!"#$%&'()*+,-./:;<=>?[]\\^_\`{}|~@∎ `,
  });

  await k.loadSprite("player", "/player.png");
  await k.loadSprite("enemy", "/enemy.png");
  await k.loadSprite("exit", "/exit.png");
}

export const TileFrames = {
  CulDeSac: 0,
  Straight: 1,
  L: 2,
  T: 3,
  Cross: 4,
  Plot: 5,
} as const;
