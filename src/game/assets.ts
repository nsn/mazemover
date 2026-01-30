import { k } from "../kaplayCtx";
import { EnemyDatabase } from "./systems/EnemyDatabase";
import { ItemDatabase } from "./systems/ItemDatabase";
import { UI } from "./config";

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

  await k.loadSprite("decay", "/decay.png", {
    sliceX: 1,
    sliceY: 6
  });

  await k.loadSprite("inventoryslot", "/inventoryslot.png", {
    sliceX: 3,
    sliceY: 1
  });

  await k.loadSprite("woodframe", "/woodpatch.png", {
    slice9: {
        left: UI.PATCH_SIZE,
        right: UI.PATCH_SIZE,
        top: UI.PATCH_SIZE,
        bottom: UI.PATCH_SIZE,
    },
  });

  await k.loadSprite("hframe", "/hframe.png", {
    slice9: {
        left: 8,
        right: 8,
        top: 0,
        bottom: 0,
    },
  });

  await k.loadSprite("spacer", "/spacer.png", {
    sliceX: 3,
    sliceY: 1,
  });

  await k.loadSprite("items", "/items.png", {
    sliceX: 20,
    sliceY: 20,
    anims: {
      punch: 0,
      putch: 1,
      spatula: 2,
      trowel: 3,
      level: 4,
      mell: 5,
      mallet: 6,
      hammer: 7,
      pick: 8,
      pickaxe: 9,
      coif: 20,
      cap: 21,
      hat: 22,
      chausses: 40,
      trousers: 41,
      pants: 42,
      chemises: 60,
      shirt: 61,
      apron: 62,
      feather: 80,
      ham: 81,
      apple: 82,
      cement: 83,
      bricks: 84,
    }
  });

  await k.loadSprite("mason", "/mason.png", {
    sliceX: 11,
    sliceY: 118,
    anims: {
      idle: {from : 0, to: 3, loop: true},
      walk: {from : 110, to: 113, loop: true},
      drop: {from : 186, to: 197, loop: false, speed: 10},
      rise: {from : 682, to: 689, loop: false, speed: 15},
      fall: {from : 803, to: 810, loop: false, speed: 60},
    }
  });

  await k.loadSpriteAtlas("/enemies.png", {
    goblin: {x: 0, y: 0, width: 64, height: 16, sliceX: 4, anims: {idle: {from: 0, to: 3, loop: true}}},
    archer: {x: 0, y: 16, width: 64, height: 16, sliceX: 4, anims: {idle: {from: 0, to: 3, loop: true}}},
    brute: {x: 0, y: 32, width: 64, height: 16, sliceX: 4, anims: {idle: {from: 0, to: 3, loop: true}}},
    shaman: {x: 0, y: 48, width: 64, height: 16, sliceX: 4, anims: {idle: {from: 0, to: 3, loop: true}}},
    bat: {x: 0, y: 64, width: 64, height: 16, sliceX: 4, anims: {idle: {from: 0, to: 3, loop: true}}},
    assassin: {x: 0, y: 80, width: 64, height: 16, sliceX: 4, anims: {idle: {from: 0, to: 3, loop: true}}},
    summoner: {x: 0, y: 111, width: 64, height: 17, sliceX: 4, anims: {idle: {from: 0, to: 3, loop: true}}},
    skeleton: {x: 0, y: 128, width: 64, height: 16, sliceX: 4, anims: {idle: {from: 0, to: 3, loop: true}, rise: {from: 4, to: 7, loop: false}}},
  });

  await k.loadSpriteAtlas("/projectiles.png", {
    arrow: {x: 0, y: 0, width: 5, height: 10, sliceX: 2, anims: {idle: {from: 0, to: 1, loop: true}}},
  });

  await k.loadSprite("poof", "/poof.png", {
    sliceX: 6,
    sliceY: 1,
    anims: {
      poof: {from : 0, to: 5, loop: false},
    }
  });

  await k.loadBitmapFont("3x5", "/font_3x5.png", 4, 6, {
    chars: `ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+-=:.,()/\\?!'% `,
  });

  // await k.loadFont("saga","saga_8.ttf", {size: 16});
  await k.loadFont("saga","saga_8.ttf", {
    size: 16, 
    outline: {
      width: 0, 
      color: k.Color.fromArray([0,0,0,64])
    }
  });

  await k.loadFont("sctfont","saga_8.ttf", {
    size: 16, 
    outline: {
      width: 2, 
      color: k.Color.fromArray([0, 0, 0])
    }
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

// Global item database instance
export const itemDatabase = new ItemDatabase();

export async function loadItemDatabase(): Promise<void> {
  await itemDatabase.load("/items.json");
}
