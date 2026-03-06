import { k } from "../kaplayCtx";
import { loadAssets } from "./assets";
import { resetGlobalLevel } from "./mainScene";

const BUTTON_WIDTH = 50;
const BUTTON_HEIGHT = 24;
const BUTTON_X = 590;
const BUTTON_Y = 330;

export function createIntroScene(): void {
  k.scene("intro", async () => {
    await loadAssets();

    const centerX = 320;
    let paragraphs: string[] = [];

    // Load intro from markdown file
    try {
      const response = await fetch("intro.md");
      if (response.ok) {
        const introText = await response.text();
        paragraphs = introText.split("\n\n").filter(p => p.trim().length > 0);
      } else {
        paragraphs = ["Failed to load intro."];
      }
    } catch {
      paragraphs = ["Failed to load intro."];
    }

    if (paragraphs.length === 0) {
      paragraphs = ["No intro content."];
    }

    let currentIndex = 0;
    let isTransitioning = false;

    // Container for intro elements
    const introGroup: ReturnType<typeof k.add>[] = [];

    // Create fade overlay
    const fadeOverlay = k.add([
      k.rect(640, 360),
      k.pos(0, 0),
      k.color(0, 0, 0),
      k.opacity(0),
      k.z(200),
      "fadeOverlay",
    ]);

    // Display current paragraph
    function showParagraph(index: number): void {
      // Clear previous elements
      for (const obj of introGroup) {
        k.destroy(obj);
      }
      introGroup.length = 0;

      // Add intro sprite frame
      const introSprite = k.add([
        k.sprite("intro", { frame: index }),
        k.pos(centerX, 140),
        k.anchor("center"),
        k.z(100),
        "introContent",
      ]);
      introGroup.push(introSprite);

      // Add paragraph text
      const paragraphText = k.add([
        k.text(paragraphs[index], {
          font: "saga",
          size: 16,
          width: 560,
          align: "center",
        }),
        k.pos(centerX, 280),
        k.anchor("center"),
        k.color(200, 200, 200),
        k.z(100),
        "introContent",
      ]);
      introGroup.push(paragraphText);

      // Add "Press any key to continue" hint
      const hintText = k.add([
        k.text("Press any key or click to continue", { font: "saga", size: 12 }),
        k.pos(centerX, 340),
        k.anchor("center"),
        k.color(100, 100, 100),
        k.z(100),
        "introContent",
      ]);
      introGroup.push(hintText);
    }

    // Show first paragraph
    showParagraph(currentIndex);

    // Add skip button (persists across paragraphs)
    const skipBtnObj = k.add([
      k.sprite("bubble", { width: BUTTON_WIDTH, height: BUTTON_HEIGHT }),
      k.pos(BUTTON_X, BUTTON_Y),
      k.z(100),
      k.area(),
      "skipBtn",
    ]);
    skipBtnObj.onClick(() => {
      resetGlobalLevel();
      k.go("main");
    });

    const skipBtnText = k.add([
      k.text("Skip", { font: "saga", size: 16 }),
      k.pos(BUTTON_X + BUTTON_WIDTH / 2, BUTTON_Y + BUTTON_HEIGHT / 2),
      k.anchor("center"),
      k.color(72, 59, 58),
      k.z(101),
      "skipBtn",
    ]);
    skipBtnText.onUpdate(() => {
      const mousePos = k.mousePos();
      const isHovered = mousePos.x >= BUTTON_X && mousePos.x <= BUTTON_X + BUTTON_WIDTH &&
        mousePos.y >= BUTTON_Y && mousePos.y <= BUTTON_Y + BUTTON_HEIGHT;
      skipBtnText.color = isHovered ? k.rgb(255, 255, 255) : k.rgb(72, 59, 58);
    });

    // Handle advance to next paragraph
    async function advanceParagraph(): Promise<void> {
      if (isTransitioning) return;
      isTransitioning = true;

      // Fade out
      await new Promise<void>((resolve) => {
        k.tween(0, 1, 0.2, (val) => {
          fadeOverlay.opacity = val;
        }, k.easings.linear).onEnd(resolve);
      });

      currentIndex++;

      if (currentIndex >= paragraphs.length) {
        // Done with intro, go to main
        k.go("main");
        return;
      }

      showParagraph(currentIndex);

      // Fade in
      await new Promise<void>((resolve) => {
        k.tween(1, 0, 0.2, (val) => {
          fadeOverlay.opacity = val;
        }, k.easings.linear).onEnd(resolve);
      });

      isTransitioning = false;
    }

    // Handle key press
    k.onKeyPress(() => {
      advanceParagraph();
    });

    // Handle mouse click (but not on skip button)
    k.onMousePress(() => {
      const mousePos = k.mousePos();
      const isOnSkipBtn = mousePos.x >= BUTTON_X && mousePos.x <= BUTTON_X + BUTTON_WIDTH &&
        mousePos.y >= BUTTON_Y && mousePos.y <= BUTTON_Y + BUTTON_HEIGHT;
      if (!isOnSkipBtn) {
        advanceParagraph();
      }
    });
  });
}
