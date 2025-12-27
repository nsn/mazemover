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
  width: 768,
  height: 432,
  background: [0, 0, 0],
  global: false,
  letterbox: true,
});
