import { Matrix4, OrthographicCamera } from "three";

/**
 * An oblique view (stage 21a, D119): the plane z = 0 is drawn face-on, exactly where
 * the flat SVG draws the map, and a point at depth z moves by (shearX, shearY) x z on
 * screen. So the map's face never moves while its depth shows, and tilting the view
 * (changing the shear) leaves the page's words and the station rails lined up.
 */
export class ObliqueCamera extends OrthographicCamera {
  /** React Three Fiber leaves a manual camera's projection alone on resize. */
  manual = true;
  shearX = 0;
  shearY = 0;

  setShear(x: number, y: number): void {
    this.shearX = x;
    this.shearY = y;
    this.updateProjectionMatrix();
  }

  override updateProjectionMatrix(): void {
    super.updateProjectionMatrix();
    // Called by the base constructor too, before this class's fields exist.
    const sx = this.shearX ?? 0;
    const sy = this.shearY ?? 0;
    // In view space the map's face (world z = 0) sits at z = -position.z.
    const d = this.position.z;
    const shear = new Matrix4().set(1, 0, sx, sx * d, 0, 1, sy, sy * d, 0, 0, 1, 0, 0, 0, 0, 1);
    this.projectionMatrix.multiply(shear);
    this.projectionMatrixInverse.copy(this.projectionMatrix).invert();
  }
}
