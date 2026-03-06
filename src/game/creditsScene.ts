import { k } from "../kaplayCtx";
import { loadAssets } from "./assets";

const SCROLL_SPEED = 40;
const START_Y = 400;

export function createCreditsScene(): void {
  k.scene("credits", async () => {
    await loadAssets();

    const centerX = 320;
    let creditsText = "Loading credits...";

    // Load credits from markdown file
    try {
      const response = await fetch("credits.md");
      if (response.ok) {
        creditsText = await response.text();
      } else {
        creditsText = "Failed to load credits.";
      }
    } catch (error) {
      creditsText = "Failed to load credits.";
    }

    // Parse markdown into simple display format
    // Remove # headers and convert to plain text with some formatting
    const lines = creditsText.split("\n").map(line => {
      // Remove markdown header symbols but keep the text
      if (line.startsWith("# ")) {
        return { text: line.substring(2), size: 32, color: { r: 255, g: 255, b: 255 } };
      } else if (line.startsWith("## ")) {
        return { text: line.substring(3), size: 20, color: { r: 200, g: 200, b: 100 } };
      } else if (line.startsWith("---")) {
        return { text: "", size: 12, color: { r: 100, g: 100, b: 100 } };
      } else {
        return { text: line, size: 16, color: { r: 180, g: 180, b: 180 } };
      }
    });

    // Calculate line heights and positions
    const lineSpacing = 8;
    const creditObjects: { obj: ReturnType<typeof k.add>, y: number, height: number }[] = [];
    let yPos = START_Y;
    let totalHeight = 0;

    for (const line of lines) {
      if (line.text.trim() === "") {
        yPos += line.size / 2; // Empty lines add half spacing
        continue;
      }

      const obj = k.add([
        k.text(line.text, { font: "saga", size: line.size }),
        k.pos(centerX, yPos),
        k.anchor("center"),
        k.color(line.color.r, line.color.g, line.color.b),
        k.z(100),
        "credits",
      ]);

      const lineHeight = line.size + lineSpacing;
      creditObjects.push({ obj: obj as unknown as ReturnType<typeof k.add>, y: yPos, height: lineHeight });
      totalHeight += lineHeight;
      yPos += lineHeight;
    }

    // Draw footer instruction
    k.add([
      k.text("Press any key or click to return", { font: "saga", size: 12 }),
      k.pos(centerX, 340),
      k.anchor("center"),
      k.color(100, 100, 100),
      k.z(100),
      "credits",
    ]);

    // Scroll direction: -1 = up, 1 = down
    let scrollDir = -1;
    let atTop = false;
    let atBottom = false;

    // Scroll credits
    k.onUpdate(() => {
      const dt = k.dt();
      let lowestY = -Infinity;
      let highestY = Infinity;

      for (const credit of creditObjects) {
        credit.y += scrollDir * SCROLL_SPEED * dt;
        (credit.obj as unknown as { pos: { y: number } }).pos.y = credit.y;
        lowestY = Math.max(lowestY, credit.y);
        highestY = Math.min(highestY, credit.y);
      }

      // Check if last line reached top of screen
      if (lowestY < 10 && !atTop) {
        atTop = true;
        scrollDir = 1;
      }
      // Check if first line is fully visible
      else if (highestY > 50 && !atBottom) {
        atBottom = true;
        scrollDir = -1;
      }

      // Reset flags when scrolling past middle area
      if (atTop && lowestY > 100) {
        atTop = false;
      }
      if (atBottom && highestY < 20) {
        atBottom = false;
      }
    });

    // Return to title on any key press
    k.onKeyPress(() => {
      k.go("title");
    });

    // Return to title on any mouse click
    k.onMousePress(() => {
      k.go("title");
    });
  });
}
