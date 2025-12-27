import { k } from "../../kaplayCtx";
import type { TurnManager } from "./TurnManager";

export type PushCallback = () => void;

export class InputController {
  private turnManager: TurnManager;
  private onPushRequested: PushCallback | null = null;

  constructor(turnManager: TurnManager) {
    this.turnManager = turnManager;
    this.setupKeyboardControls();
  }

  setOnPushRequested(callback: PushCallback): void {
    this.onPushRequested = callback;
  }

  setupKeyboardControls(): void {
    k.onKeyPress("r", () => {
      this.turnManager.rotateTile();
    });

    k.onKeyPress("space", () => {
      if (this.turnManager.canPush() && this.onPushRequested) {
        this.onPushRequested();
      }
    });
  }
}
