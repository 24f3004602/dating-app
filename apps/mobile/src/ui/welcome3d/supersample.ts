/**
 * Smooth edges without multisampling (stage 21b, D122). On Android, Expo's GL has no
 * multisampled buffers (expo-gl leaves renderbufferStorageMultisample unimplemented, and
 * its msaaSamples prop is iOS only), so the scene is drawn at twice the size into a plain
 * texture and drawn down onto the screen: at exactly half size, each screen pixel's
 * linear sample is the average of four (a 4x supersample). The texture keeps sRGB
 * values, so flat colours come back exact and the averaging happens in linear light.
 */
import {
  type Camera,
  LinearFilter,
  Mesh,
  MeshBasicMaterial,
  OrthographicCamera,
  PlaneGeometry,
  type Scene,
  Scene as ThreeScene,
  SRGBColorSpace,
  WebGLRenderer,
  type WebGLRendererParameters,
  WebGLRenderTarget,
} from "three";

/** three.js's own render, kept before React Three Fiber wraps it (see `render` below). */
const OWN_RENDER = Symbol("three's own render");
type Kept = WebGLRenderer & { [OWN_RENDER]?: WebGLRenderer["render"] };

/** Makes the scene's renderer, keeping its own render. */
export function makeRenderer(params: WebGLRendererParameters): WebGLRenderer {
  const renderer = new WebGLRenderer(params) as Kept;
  renderer[OWN_RENDER] = renderer.render;
  return renderer;
}

export class Supersampler {
  readonly factor: number;
  private target: WebGLRenderTarget;
  private screen = new ThreeScene();
  private camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private quad: Mesh<PlaneGeometry, MeshBasicMaterial>;

  constructor(factor = 2) {
    this.factor = factor;
    this.target = new WebGLRenderTarget(1, 1, {
      minFilter: LinearFilter,
      magFilter: LinearFilter,
      generateMipmaps: false,
      depthBuffer: true,
      stencilBuffer: false,
      colorSpace: SRGBColorSpace,
    });
    this.quad = new Mesh(
      new PlaneGeometry(2, 2),
      new MeshBasicMaterial({ map: this.target.texture, depthTest: false, depthWrite: false, toneMapped: false }),
    );
    this.screen.add(this.quad);
  }

  /** The drawing buffer's size, in pixels. */
  setSize(width: number, height: number): void {
    this.target.setSize(Math.max(1, Math.round(width * this.factor)), Math.max(1, Math.round(height * this.factor)));
  }

  /**
   * Draws `scene` into the big texture, then the texture onto the screen. The first pass
   * calls three's own render (kept by `makeRenderer`): on phones React Three Fiber wraps
   * `gl.render` to end the frame (expo-gl's endFrameEXP), which must happen once, after
   * the second pass, or the phone would show an unfinished frame.
   */
  render(gl: WebGLRenderer, scene: Scene, camera: Camera): void {
    const own = (gl as Kept)[OWN_RENDER] ?? gl.render;
    const before = gl.getRenderTarget();
    gl.setRenderTarget(this.target);
    own.call(gl, scene, camera);
    gl.setRenderTarget(before);
    gl.render(this.screen, this.camera);
  }

  dispose(): void {
    this.target.dispose();
    this.quad.geometry.dispose();
    this.quad.material.dispose();
  }
}
