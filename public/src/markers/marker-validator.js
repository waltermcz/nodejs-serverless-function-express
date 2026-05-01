/**
 * marker-validator.js
 * Analyses a captured image to determine whether it will produce a reliable AR marker.
 *
 * Validation pipeline:
 *   1. Contrast  — std-dev of grayscale must exceed MIN_STDDEV
 *   2. Edge density — Sobel edge ratio must exceed MIN_EDGE_DENSITY
 *   3. Symmetry  — four-fold symmetry is a soft warning (tracking ambiguity risk)
 *   4. Near-solid — combined low contrast + low edges triggers a texture warning
 */

const ANALYSIS_SIZE = 64;
const MIN_STDDEV = 25;
const MIN_EDGE_DENSITY = 0.05;
const SYMMETRY_THRESHOLD = 1.65; // combined quadrant-pair similarity

/**
 * Converts RGBA pixel array to a flat Uint8Array of grayscale values.
 */
function toGrayscale(rgba, count) {
  const gray = new Uint8Array(count);
  for (let i = 0; i < count; i++) {
    gray[i] = Math.round(0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2]);
  }
  return gray;
}

/**
 * Counts pixels whose Sobel gradient magnitude exceeds threshold.
 */
function sobelEdgeDensity(gray, size) {
  let edgeCount = 0;
  for (let y = 1; y < size - 1; y++) {
    for (let x = 1; x < size - 1; x++) {
      const gx =
        -gray[(y - 1) * size + (x - 1)] + gray[(y - 1) * size + (x + 1)] +
        -2 * gray[y * size + (x - 1)]   + 2 * gray[y * size + (x + 1)] +
        -gray[(y + 1) * size + (x - 1)] + gray[(y + 1) * size + (x + 1)];
      const gy =
        -gray[(y - 1) * size + (x - 1)] - 2 * gray[(y - 1) * size + x] - gray[(y - 1) * size + (x + 1)] +
         gray[(y + 1) * size + (x - 1)] + 2 * gray[(y + 1) * size + x] + gray[(y + 1) * size + (x + 1)];
      if (Math.sqrt(gx * gx + gy * gy) > 30) edgeCount++;
    }
  }
  return edgeCount / ((size - 2) ** 2);
}

/**
 * Extracts a flattened array of grayscale values for one quadrant.
 */
function quadrant(gray, size, qx, qy) {
  const half = size / 2;
  const out = [];
  for (let y = qy * half; y < (qy + 1) * half; y++) {
    for (let x = qx * half; x < (qx + 1) * half; x++) {
      out.push(gray[y * size + x]);
    }
  }
  return out;
}

/**
 * Returns a 0–1 similarity score between two equal-length arrays.
 * 1.0 = identical, 0.0 = maximally different.
 */
function similarity(a, b) {
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff += Math.abs(a[i] - b[i]);
  return 1 - diff / (a.length * 255);
}

/**
 * Validates whether imageSource will produce a reliable AR.js marker.
 *
 * @param {HTMLImageElement|HTMLVideoElement|HTMLCanvasElement|ImageBitmap} imageSource
 * @returns {{ valid: boolean, score: number, errors: string[], warnings: string[], metrics: object }}
 */
export function validateMarker(imageSource) {
  const canvas = document.createElement('canvas');
  canvas.width = ANALYSIS_SIZE;
  canvas.height = ANALYSIS_SIZE;
  canvas.getContext('2d').drawImage(imageSource, 0, 0, ANALYSIS_SIZE, ANALYSIS_SIZE);

  const rgba = canvas.getContext('2d').getImageData(0, 0, ANALYSIS_SIZE, ANALYSIS_SIZE).data;
  const gray = toGrayscale(rgba, ANALYSIS_SIZE * ANALYSIS_SIZE);

  const errors = [];
  const warnings = [];

  // 1. Contrast (standard deviation of luminance)
  const mean = gray.reduce((a, b) => a + b, 0) / gray.length;
  const variance = gray.reduce((sum, v) => sum + (v - mean) ** 2, 0) / gray.length;
  const stdDev = Math.sqrt(variance);

  if (stdDev < MIN_STDDEV) {
    errors.push('Image lacks contrast — try a photo with stronger light and dark areas.');
  }

  // 2. Edge density via Sobel filter
  const edgeDensity = sobelEdgeDensity(gray, ANALYSIS_SIZE);

  if (edgeDensity < MIN_EDGE_DENSITY) {
    errors.push('Not enough visual detail — markers need distinct edges to track reliably.');
  }

  // 3. Near-solid warning (passes contrast/edge minimums but barely)
  if (stdDev < 50 && edgeDensity < 0.1 && errors.length === 0) {
    warnings.push('Image is fairly uniform — markers with rich textures and sharp edges track better.');
  }

  // 4. Four-fold symmetry warning (ambiguous orientation)
  const [q1, q2, q3, q4] = [
    quadrant(gray, ANALYSIS_SIZE, 0, 0),
    quadrant(gray, ANALYSIS_SIZE, 1, 0),
    quadrant(gray, ANALYSIS_SIZE, 0, 1),
    quadrant(gray, ANALYSIS_SIZE, 1, 1),
  ];
  const symmetryScore = similarity(q1, q4) + similarity(q2, q3);
  if (symmetryScore > SYMMETRY_THRESHOLD) {
    warnings.push('High symmetry detected — use an asymmetric image to avoid tracking ambiguity.');
  }

  // Quality score 0–100
  const contrastScore = Math.min(50, (stdDev / 128) * 50);
  const edgeScore = Math.min(50, edgeDensity * 500);
  const score = Math.round(Math.max(0, contrastScore + edgeScore));

  return {
    valid: errors.length === 0,
    score,
    errors,
    warnings,
    metrics: {
      stdDev: Math.round(stdDev),
      edgeDensityPct: Math.round(edgeDensity * 100),
    },
  };
}
