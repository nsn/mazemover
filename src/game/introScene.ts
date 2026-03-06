import { k } from "../kaplayCtx";
import { loadAssets } from "./assets";

export function createIntroScene(): void {
  k.scene("intro", async () => {
    await loadAssets();

    const centerX = 320;
    let paragraphs: string[] = [];

    // Load intro from markdown file
    try {
      const response = await fetch("/intro.md");
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
        k.pos(centerX, 220),
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

    // Handle mouse click
    k.onMousePress(() => {
      advanceParagraph();
    });
  });
}
