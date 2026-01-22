import kaplay from "kaplay";

function isWebGLSupported(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return !!(
      window.WebGLRenderingContext &&
      (canvas.getContext("webgl") || canvas.getContext("experimental-webgl"))
    );
  } catch {
    return false;
  }
}

if (!isWebGLSupported()) {
  document.body.innerHTML = `
    <div style="display: flex; justify-content: center; align-items: center; height: 100vh; font-family: sans-serif; text-align: center; padding: 20px;">
      <div>
        <h2>WebGL Not Supported</h2>
        <p>Your browser doesn't support WebGL, which is required for this game.</p>
        <p>Please try enabling hardware acceleration or using a different browser.</p>
      </div>
    </div>
  `;
  throw new Error("WebGL not supported");
}

export const k = kaplay({
  width: 640,
  height: 360,
  background: [0, 0, 0],
  buttons: {
    left: {
      keyboard: ["left", "a", "h"],
    },
    right: {
      keyboard: ["right", "d", "l"],
    },
    up: {
      keyboard: ["up", "w", "k"],
    },
    down: {
      keyboard: ["down", "s", "j"],
    },
  },
  global: false,
  letterbox: true,
  touchToMouse: true,
  crisp: true,
  debug: true,
  pixelDensity: 1,
});
