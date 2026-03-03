import "./style.css";
import { createTitleScene } from "./game/titleScene";
import { createMainScene } from "./game/mainScene";
import { createCreditsScene } from "./game/creditsScene";
import { createTutorialScene } from "./game/tutorialScene";
import { k } from "./kaplayCtx";

// Create all scenes
createTitleScene();
createMainScene();
createCreditsScene();
createTutorialScene();

// Start with the title screen
k.go("title");
