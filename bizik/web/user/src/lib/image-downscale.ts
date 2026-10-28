/**
 * Shrink a picked photo before it is uploaded.
 *
 * KYC submissions were failing in production and the nginx log said why: the
 * POST was answered `499`, which is nginx for "the client hung up", at exactly
 * 30 seconds, twice in a row. Nothing was broken on the server - the request
 * never finished arriving. The body was large enough that nginx spooled it to a
 * temporary file on disk.
 *
 * The cause was that the page read each photo straight through `readAsDataURL`
 * with no resizing. A current phone camera produces a 3-8 MB JPEG, base64 adds
 * another third, and a submission carries three of them: 12-30 MB of JSON over
 * a Cameroonian mobile uplink. That cannot finish inside any sensible timeout.
 *
 * Capping the long edge at 1600px and re-encoding as JPEG takes a 6 MB photo to
 * roughly 300 KB, a 20x reduction, which is the difference between half a
 * minute and about a second. It costs nothing in verification quality: 1600px
 * is far more than an ID document needs to be read, and the face match works on
 * a much smaller crop than that.
 */

/** Long edge, in pixels, that a document photo is reduced to. */
const MAX_EDGE = 1600;

/** JPEG quality. High enough that small print on an ID stays legible. */
const QUALITY = 0.82;

/**
 * Decode a file into something drawable, keeping the camera's rotation.
 *
 * EXIF orientation matters more here than anywhere else in the app: phones
 * record "this photo is rotated 90 degrees" as metadata rather than rotating
 * the pixels, and a canvas redraw throws that metadata away. Get it wrong and
 * every ID arrives sideways - which a human reviewer can squint through, but
 * which quietly ruins OCR and face matching.
 */
async function decode(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      // Older Safari rejects the options argument; fall through to <img>,
      // which applies EXIF orientation on its own.
    }
  }
  const url = URL.createObjectURL(file);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('could not decode image'));
      image.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** The original bytes, unchanged, as a data URL. */
function readUnchanged(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error('read failed'));
    reader.readAsDataURL(file);
  });
}

/**
 * Read a picked image as a data URL, downscaled where that is possible.
 *
 * Never throws for an image it cannot process. A browser without canvas, or a
 * format it refuses to decode (an iPhone HEIC, say), falls back to the original
 * bytes: a slow upload is a worse experience, but a blocked one stops somebody
 * verifying their identity at all, and that is the thing the whole account
 * depends on.
 */
export async function imageToDataUrl(file: File): Promise<string> {
  try {
    const source = await decode(file);
    const width = source.width;
    const height = source.height;
    if (!width || !height) return readUnchanged(file);

    // Only ever shrink. Upscaling a small photo would add bytes and no detail.
    const scale = Math.min(1, MAX_EDGE / Math.max(width, height));
    const targetWidth = Math.round(width * scale);
    const targetHeight = Math.round(height * scale);

    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const context = canvas.getContext('2d');
    if (!context) return readUnchanged(file);
    context.drawImage(source, 0, 0, targetWidth, targetHeight);
    if ('close' in source) source.close();

    const dataUrl = canvas.toDataURL('image/jpeg', QUALITY);
    // A canvas that produced nothing usable (tainted, or out of memory on a low
    // end device) returns a stub. Send the original rather than a blank image,
    // which would be rejected as unreadable and look like the user's fault.
    if (!dataUrl.startsWith('data:image/jpeg') || dataUrl.length < 1024) {
      return readUnchanged(file);
    }
    return dataUrl;
  } catch {
    return readUnchanged(file);
  }
}
