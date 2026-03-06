import "./style.css";
import { createTitleScene } from "./game/titleScene";
import { createMainScene } from "./game/mainScene";
import { createCreditsScene } from "./game/creditsScene";
import { createTutorialScene } from "./game/tutorialScene";
import { createIntroScene } from "./game/introScene";
import { k } from "./kaplayCtx";

// Create all scenes
createTitleScene();
createMainScene();
createCreditsScene();
createTutorialScene();
createIntroScene();

// Start with the title screen
k.go("title");
