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

  await k.loadBitmapFont("blocky", "/5x5-Blocky.png", 5, 5, {
    chars: `ABCDEFGHIJKLMNOPQRSTUVWXYZ abcdefghijklmnopqrstuvwxyz 01234567890 !"#$%&'()*+,-./:;<=>?[]\\^_\`{}|~@∎ÄÁÀÂÅÃÇçäáàâåãÑñÏÍÌÎÜÚÙÛïíìîüúùûÖÓÒÔÕŸÝỲöóòôõÿýỳËÉÈÊëéèêÆæßðÐþÞ¿¡Œœ`,
  });
}

export const TileFrames = {
  CulDeSac: 0,
  Straight: 1,
  L: 2,
  T: 3,
  Cross: 4,
  Plot: 5,
} as const;
