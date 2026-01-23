import { k } from "../../kaplayCtx";
import type { TurnManager } from "./TurnManager";

export type PushCallback = () => void;
export type IsAnimatingCallback = () => boolean;

export class InputController {
  private turnManager: TurnManager;
  private onPushRequested: PushCallback | null = null;
  private isAnimating: IsAnimatingCallback = () => false;

  constructor(turnManager: TurnManager) {
    this.turnManager = turnManager;
    this.setupKeyboardControls();
  }

  setOnPushRequested(callback: PushCallback): void {
    this.onPushRequested = callback;
  }

  setIsAnimating(callback: IsAnimatingCallback): void {
    this.isAnimating = callback;
  }

  setupKeyboardControls(): void {
    k.onKeyPress("r", () => {
      // Block input during animations or start level sequence
      if (this.isAnimating() || this.turnManager.getState().isInStartLevelSequence) {
        return;
      }
      this.turnManager.rotateTile();
    });

    k.onKeyPress("space", () => {
      // Block input during animations or start level sequence
      if (this.isAnimating() || this.turnManager.getState().isInStartLevelSequence) {
        return;
      }
      if (this.turnManager.canPush() && this.onPushRequested) {
        this.onPushRequested();
      }
    });
  }
}
