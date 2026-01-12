import { k } from "../../kaplayCtx";

export type ScrollingTextBehavior = "fade" | "static" | "bounce";

export interface ScrollingTextOptions {
  text: string;
  x: number;
  y: number;
  color?: { r: number; g: number; b: number };
  opacity?: number;
  duration?: number;
  riseSpeed?: number;
  fontSize?: number;
  behavior?: ScrollingTextBehavior;
}

/**
 * Spawns a scrolling combat text with configurable behavior
 * @param options Configuration for the scrolling text
 *
 * Behaviors:
 * - "fade": Scrolls up continuously and fades out (for misses)
 * - "static": Scrolls up 16px, then stays in place and disappears (for normal hits)
 * - "bounce": Scrolls up 32px, bounces down 16px, stays and disappears (for crits)
 */
export function spawnScrollingText(options: ScrollingTextOptions): void {
  const {
    text,
    x,
    y,
    color = { r: 255, g: 255, b: 255 },
    opacity = 1,
    duration = 1.0,
    riseSpeed = 100,
    fontSize = 16,
    behavior = "fade",
  } = options;

  const startY = y;

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
      behavior,
      startY,
      phase: "rising", // "rising" | "falling" | "static"
    },
  ]);

  // Update function to handle movement and behavior
  textObj.onUpdate(() => {
    const dt = k.dt();
    const obj = textObj as any;
    obj.lifetime += dt;

    if (obj.behavior === "fade") {
      // Original behavior: scroll up and fade
      textObj.pos.y -= obj.riseSpeed * dt;
      const lifeRatio = obj.lifetime / obj.maxLifetime;
      textObj.opacity = Math.max(0, 1 - lifeRatio);
    } else if (obj.behavior === "static") {
      // Scroll up 16px, then stay in place
      const targetY = obj.startY - 16;
      if (obj.phase === "rising") {
        textObj.pos.y -= obj.riseSpeed * dt;
        if (textObj.pos.y <= targetY) {
          textObj.pos.y = targetY;
          obj.phase = "static";
        }
      }
      // Stay at position without fading
    } else if (obj.behavior === "bounce") {
      // Scroll up 32px, then down 16px, then stay
      const peakY = obj.startY - 32;
      const restY = obj.startY - 16;

      if (obj.phase === "rising") {
        textObj.pos.y -= obj.riseSpeed * dt;
        if (textObj.pos.y <= peakY) {
          textObj.pos.y = peakY;
          obj.phase = "falling";
        }
      } else if (obj.phase === "falling") {
        textObj.pos.y += obj.riseSpeed * dt;
        if (textObj.pos.y >= restY) {
          textObj.pos.y = restY;
          obj.phase = "static";
        }
      }
      // Stay at position without fading
    }

    // Destroy when lifetime exceeded
    if (obj.lifetime >= obj.maxLifetime) {
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
