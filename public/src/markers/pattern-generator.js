/**
 * pattern-generator.js
 * Converts any image source into an AR.js .patt file string.
 *
 * The .patt format: 4 rotations × 3 channels (RGB) × 16 rows × 16 values.
 * Rotations are separated by a blank line. Values are space-padded to 3 chars.
 */

const SAMPLE_SIZE = 16;
const ROTATIONS = [0, 90, 180, 270];

/**
 * Samples the inner region of the source image at a given rotation angle
 * and returns the raw RGBA pixel data at SAMPLE_SIZE × SAMPLE_SIZE.
 *
 * @param {HTMLCanvasElement} srcCanvas - full source image canvas
 * @param {number} angle - rotation in degrees (0 | 90 | 180 | 270)
 */
function sampleRotation(srcCanvas, angle) {
  const w = srcCanvas.width;
  const h = srcCanvas.height;

  // Crop to square from center before sampling, to avoid distortion
  const side = Math.min(w, h);
  const cropX = (w - side) / 2;
  const cropY = (h - side) / 2;

  const temp = document.createElement('canvas');
  temp.width = SAMPLE_SIZE;
  temp.height = SAMPLE_SIZE;
  const tc = temp.getContext('2d');

  tc.save();
  tc.translate(SAMPLE_SIZE / 2, SAMPLE_SIZE / 2);
  tc.rotate((angle * Math.PI) / 180);
  tc.drawImage(srcCanvas, cropX, cropY, side, side, -SAMPLE_SIZE / 2, -SAMPLE_SIZE / 2, SAMPLE_SIZE, SAMPLE_SIZE);
  tc.restore();

  return tc.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE).data;
}

/**
 * Formats a single channel row as 16 space-padded values.
 * Matches the exact format of AR.js .patt files (padStart 3, joined with ' ').
 */
function formatRow(pixelData, rowIndex, channelOffset) {
  const values = [];
  for (let col = 0; col < SAMPLE_SIZE; col++) {
    const idx = (rowIndex * SAMPLE_SIZE + col) * 4 + channelOffset;
    values.push(pixelData[idx].toString().padStart(3));
  }
  return values.join(' ');
}

/**
 * Generates an AR.js .patt file string from any drawable image source.
 *
 * @param {HTMLImageElement|HTMLVideoElement|HTMLCanvasElement|ImageBitmap} imageSource
 * @returns {string} Content of the .patt file
 */
export function generatePatternFile(imageSource) {
  const w = imageSource.videoWidth ?? imageSource.naturalWidth ?? imageSource.width;
  const h = imageSource.videoHeight ?? imageSource.naturalHeight ?? imageSource.height;

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d').drawImage(imageSource, 0, 0);

  const sections = ROTATIONS.map((angle) => {
    const data = sampleRotation(canvas, angle);
    const rows = [];

    // R channel (offset 0), G channel (offset 1), B channel (offset 2)
    for (const channelOffset of [0, 1, 2]) {
      for (let row = 0; row < SAMPLE_SIZE; row++) {
        rows.push(formatRow(data, row, channelOffset));
      }
    }

    return rows.join('\n');
  });

  return sections.join('\n\n') + '\n';
}
