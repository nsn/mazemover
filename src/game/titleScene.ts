import { k } from "../kaplayCtx";
import { loadAssets } from "./assets";
import { resetGlobalLevel } from "./mainScene";

interface MenuItem {
  label: string;
  action: string;
}

const menuItems: MenuItem[] = [
  { label: "Start Game", action: "start" },
  { label: "Tutorial", action: "tutorial" },
  { label: "Credits", action: "credits" },
];

export function createTitleScene(): void {
  k.scene("title", async () => {
    await loadAssets();

    // Draw background
    k.add([
      k.sprite("title"),
      k.pos(320, 180),
      k.anchor("center"),
      k.z(0),
    ]);

    const centerX = 435;
    const titleY = 75;
    const menuStartY = 180;
    const menuItemHeight = 40;
    const menuItemWidth = 200;

    // Track hovered menu item
    let hoveredIndex = -1;

    // Draw title
    k.add([
      k.text("Master Mason", { font: "sctfont", size: 48 }),
      k.pos(centerX, titleY),
      k.anchor("center"),
      k.color(255, 255, 255),
      k.z(100),
      "title",
    ]);

    // Draw subtitle
    k.add([
      k.text("Maze Moving Mayhem", { font: "saga", size: 16 }),
      k.pos(centerX, titleY + 28),
      k.anchor("center"),
      k.color(256, 127, 64),
      k.z(100),
      "title",
    ]);

    // Draw menu items
    function drawMenu(): void {
      // Clear existing menu items
      k.destroyAll("menuItem");
      k.destroyAll("menuBg");

      menuItems.forEach((item, index) => {
        const itemY = menuStartY + index * menuItemHeight;
        const isHovered = index === hoveredIndex;

        // Menu item background using bubble sprite
        k.add([
          k.sprite("bubble", { width: menuItemWidth, height: menuItemHeight - 8 }),
          k.pos(centerX - menuItemWidth / 2, itemY),
          k.z(99),
          k.area(),
          "menuBg",
          { menuIndex: index },
        ]);

        // Menu item text
        const textColor = isHovered ? { r: 255, g: 255, b: 255 } : { r: 72, g: 59, b: 58 };
        k.add([
          k.text(item.label, { font: "saga", size: 32 }),
          k.pos(centerX, itemY + (menuItemHeight - 8) / 2),
          k.anchor("center"),
          k.color(textColor.r, textColor.g, textColor.b),
          k.z(100),
          "menuItem",
        ]);
      });
    }

    // Initial draw
    drawMenu();

    // Handle mouse movement for hover effects
    k.onMouseMove(() => {
      const mousePos = k.mousePos();
      let newHoveredIndex = -1;

      menuItems.forEach((_, index) => {
        const itemY = menuStartY + index * menuItemHeight;
        const itemX = centerX - menuItemWidth / 2;

        if (mousePos.x >= itemX && mousePos.x <= itemX + menuItemWidth &&
            mousePos.y >= itemY && mousePos.y <= itemY + menuItemHeight - 8) {
          newHoveredIndex = index;
        }
      });

      if (newHoveredIndex !== hoveredIndex) {
        hoveredIndex = newHoveredIndex;
        drawMenu();
      }
    });

    // Handle mouse clicks
    k.onMousePress("left", () => {
      if (hoveredIndex === -1) return;

      const action = menuItems[hoveredIndex].action;

      if (action === "start") {
        // Reset global state and start the game
        resetGlobalLevel();
        k.go("main");
      } else if (action === "tutorial") {
        k.go("tutorial");
      } else if (action === "credits") {
        k.go("credits");
      }
    });

    // Draw footer
    k.add([
      k.text("Press Enter or click to select", { font: "sctfont", size: 16 }),
      k.pos(centerX, 340),
      k.anchor("center"),
      k.color(150, 150, 150),
      k.z(100),
      "title",
    ]);

    // Handle keyboard input
    k.onKeyPress("enter", () => {
      if (hoveredIndex >= 0) {
        const action = menuItems[hoveredIndex].action;
        if (action === "start") {
          resetGlobalLevel();
          k.go("main");
        }
      } else {
        // Default to start game if nothing hovered
        resetGlobalLevel();
        k.go("main");
      }
    });

    // Allow arrow keys to navigate menu
    k.onKeyPress("down", () => {
      hoveredIndex = (hoveredIndex + 1) % menuItems.length;
      drawMenu();
    });

    k.onKeyPress("up", () => {
      hoveredIndex = hoveredIndex <= 0 ? menuItems.length - 1 : hoveredIndex - 1;
      drawMenu();
    });
  });
}
