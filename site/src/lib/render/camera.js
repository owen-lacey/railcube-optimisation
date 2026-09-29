// Applying a camera description to a mounted `<poly-camera>`.
//
// Split out of the one viewer there used to be, because there is more than one
// now and they all need the zoom scaling below — two copies of the calibration
// constants would be two copies to get wrong. It is `stage.js` that binds it
// these days, exactly once per element: a second binding on the same camera
// would clobber the first on every resize.

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

/**
 * What a `<poly-camera>` shows before anything is described: the classic
 * isometric angle. The viewers' markup reads these, so there is one copy of them,
 * and a hand-moved view starts from them when a description names no rotation.
 */
export const CAMERA = { 'rot-x': 65, 'rot-y': 45, zoom: 4, target: '0,0,0' };

const numbers = target => String(target).split(',').map(Number);

/**
 * A description with someone's hand on the camera: `view` is what they have done
 * to it, `{ rotX, rotY, zoomBy, offset }`, and null when nobody has touched it.
 *
 * It is an *adjustment* rather than a camera, and that is the whole reason it is
 * here and not in the controls. The stage rewrites the description whenever it
 * likes — a resize, a `frameTo`, every frame of a `panTo` — and a camera the
 * controls had set absolutely would be overwritten each time. Composed on top
 * instead, the turn and the pan survive all of that, and a zoom stays the same
 * *proportion* of whatever the frame is. The rotation is the exception: it is
 * absolute, because nothing describes a rotation that ever changes.
 */
export function adjusted(described, view) {
  if (!view) return described;
  const base = { ...CAMERA, ...described };
  return {
    ...base,
    'rot-x': view.rotX,
    'rot-y': view.rotY,
    zoom: Number(base.zoom) * view.zoomBy,
    target: numbers(base.target).map((v, a) => v + view.offset[a]).join(','),
  };
}

/** Bind camera handling to a mounted `<poly-camera>`. */
export function createCamera(cameraEl) {
  let described = {};
  let view = null;

  /** (Re-)apply the current description at the element's current size. */
  function applyCamera() {
    const width = cameraEl.clientWidth || REFERENCE_WIDTH;
    const height = cameraEl.clientHeight || REFERENCE_HEIGHT;
    // Whichever dimension runs out first is the one that decides the fit, so a
    // tall narrow card and a wide short one are both framed by their tighter
    // side rather than always by width.
    const fit = Math.min(width, height * (REFERENCE_WIDTH / REFERENCE_HEIGHT));
    for (const [attr, value] of Object.entries(adjusted(described, view))) {
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

  /**
   * The hand-moved view in force — or, when nobody has touched the camera, the one
   * that changes nothing, which is where a first gesture starts from.
   */
  function currentView() {
    if (view) return view;
    const base = { ...CAMERA, ...described };
    return { rotX: Number(base['rot-x']), rotY: Number(base['rot-y']), zoomBy: 1, offset: [0, 0, 0] };
  }

  /** Put a hand-moved view on the camera. */
  function adjust(next) {
    view = next;
    applyCamera();
  }

  return { frameTo, applyCamera, view: currentView, adjust };
}
