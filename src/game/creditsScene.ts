import { k } from "../kaplayCtx";
import { loadAssets } from "./assets";

export function createCreditsScene(): void {
  k.scene("credits", async () => {
    await loadAssets();

    const centerX = 320;
    let creditsText = "Loading credits...";

    // Load credits from markdown file
    try {
      const response = await fetch("/credits.md");
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

    // Draw credits
    let yPos = 60;
    const lineSpacing = 8;

    for (const line of lines) {
      if (line.text.trim() === "") {
        yPos += line.size / 2; // Empty lines add half spacing
        continue;
      }

      k.add([
        k.text(line.text, { font: "saga", size: line.size }),
        k.pos(centerX, yPos),
        k.anchor("center"),
        k.color(line.color.r, line.color.g, line.color.b),
        k.z(100),
        "credits",
      ]);

      yPos += line.size + lineSpacing;
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
