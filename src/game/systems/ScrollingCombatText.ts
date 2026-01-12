import { k } from "../../kaplayCtx";

export interface ScrollingTextOptions {
  text: string;
  x: number;
  y: number;
  color?: { r: number; g: number; b: number };
  opacity?: number;
  duration?: number;
  riseSpeed?: number;
  fontSize?: number;
}

/**
 * Spawns a scrolling combat text that moves upward and fades out
 * @param options Configuration for the scrolling text
 */
export function spawnScrollingText(options: ScrollingTextOptions): void {
  const {
    text,
    x,
    y,
    color = { r: 255, g: 255, b: 255 },
    opacity = 1,
    duration = 1.0,
    riseSpeed = 30,
    fontSize = 16,
  } = options;

  const textObj = k.add([
    k.text(text, {
      font: "sctfont",
      size: fontSize,
    }),
    k.pos(x, y),
    k.anchor("center"),
    k.color(color.r, color.g, color.b),
    k.opacity(opacity),
    k.z(1000),
    "scrollingText",
    {
      lifetime: 0,
      maxLifetime: duration,
      riseSpeed,
    },
  ]);

  // Update function to handle movement and fading
  textObj.onUpdate(() => {
    const dt = k.dt();
    (textObj as any).lifetime += dt;

    // Move upward
    textObj.pos.y -= (textObj as any).riseSpeed * dt;

    // Fade out based on lifetime
    const lifeRatio = (textObj as any).lifetime / (textObj as any).maxLifetime;
    textObj.opacity = Math.max(0, 1 - lifeRatio);

    // Destroy when lifetime exceeded
    if ((textObj as any).lifetime >= (textObj as any).maxLifetime) {
      textObj.destroy();
    }
  });
}

/**
 * Clears all scrolling text from the screen
 */
export function clearScrollingText(): void {
  k.destroyAll("scrollingText");
}
