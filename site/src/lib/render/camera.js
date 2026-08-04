// Applying a camera description to a mounted `<poly-camera>`.
//
// Split out of `viewer.js` because there is more than one viewer now: the track
// viewer and the tumbler both mount a camera and both need the zoom scaling
// below, and two copies of the calibration constants would be two copies to get
// wrong.

// Every camera in the scene catalogue — the auto-framed ones and the hand-tuned
// ones alike — was calibrated against the old spike's fixed 900px-wide canvas.
// Here a viewer might be a 320px card or a full-width hero, so the zoom has to
// be scaled by how wide it actually is, or a layout framed to fit is cropped on
// every card.
const REFERENCE_WIDTH = 900;
const REFERENCE_HEIGHT = 700;
// A little slack so a layout framed to exactly fill the box does not touch the
// edges — the framing measures cubes, and a train riding on the outside of the
// top ones sits proud of that.
const MARGIN = 0.88;

/** Bind camera handling to a mounted `<poly-camera>`. */
export function createCamera(cameraEl) {
  let described = {};

  /** (Re-)apply the current description at the element's current size. */
  function applyCamera() {
    const width = cameraEl.clientWidth || REFERENCE_WIDTH;
    const height = cameraEl.clientHeight || REFERENCE_HEIGHT;
    // Whichever dimension runs out first is the one that decides the fit, so a
    // tall narrow card and a wide short one are both framed by their tighter
    // side rather than always by width.
    const fit = Math.min(width, height * (REFERENCE_WIDTH / REFERENCE_HEIGHT));
    for (const [attr, value] of Object.entries(described)) {
      const scaled = attr === 'zoom'
        ? Number(value) * (fit / REFERENCE_WIDTH) * MARGIN
        : value;
      cameraEl.setAttribute(attr, String(scaled));
    }
  }

  /** Apply a camera description — only the attributes it names. */
  function frameTo(camera) {
    described = camera ?? {};
    applyCamera();
  }

  return { frameTo, applyCamera };
}
