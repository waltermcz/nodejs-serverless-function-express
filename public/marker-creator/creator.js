/**
 * creator.js
 * Orchestrates the 3-step marker creation pipeline:
 *   Step 0 – Capture  : live camera preview, take photo or upload
 *   Step 1 – Validate : show preview, run quality checks, name the marker
 *   Step 2 – Result   : download .patt file or save to project via API
 */

import { validateMarker }    from '../src/markers/marker-validator.js';
import { generatePatternFile } from '../src/markers/pattern-generator.js';

// ── DOM references ────────────────────────────────────────────────────────────
const video          = document.getElementById('camera-video');
const captureBtn     = document.getElementById('btn-capture');
const flipBtn        = document.getElementById('btn-flip');
const fileInput      = document.getElementById('file-input');
const captureStatus  = document.getElementById('capture-status');

const previewCanvas  = document.getElementById('preview-canvas');
const validationCard = document.getElementById('validation-card');
const scoreBadge     = document.getElementById('score-badge');
const scoreBar       = document.getElementById('score-bar');
const messageList    = document.getElementById('message-list');
const markerPreview  = document.getElementById('marker-preview-canvas');
const markerNameInput = document.getElementById('marker-name');
const generateBtn    = document.getElementById('btn-generate');
const retakeBtn      = document.getElementById('btn-retake');
const validateStatus = document.getElementById('validate-status');

const resultPath     = document.getElementById('result-path');
const downloadBtn    = document.getElementById('btn-download');
const saveProjectBtn = document.getElementById('btn-save-project');
const resultStatus   = document.getElementById('result-status');
const newMarkerBtn   = document.getElementById('btn-new');

// ── State ─────────────────────────────────────────────────────────────────────
let stream       = null;
let facingMode   = 'environment'; // rear camera by default
let capturedBitmap = null;        // ImageBitmap of the captured frame
let patternData  = null;          // generated .patt string

// ── Step navigation ───────────────────────────────────────────────────────────
function showStep(index) {
  document.querySelectorAll('.step').forEach((el, i) => {
    el.classList.toggle('active', i === index);
  });
  document.querySelectorAll('.step-dot').forEach((dot, i) => {
    dot.classList.toggle('active', i === index);
    dot.classList.toggle('done',   i < index);
  });
}

// ── Camera ────────────────────────────────────────────────────────────────────
async function startCamera() {
  stopCamera();
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode, width: { ideal: 1280 }, height: { ideal: 1280 } },
    });
    video.srcObject = stream;
    captureStatus.textContent = 'Ready — point at the image you want to use as a marker.';
    captureStatus.className = 'status-msg';
  } catch (err) {
    captureStatus.textContent = 'Camera access denied. Use the Upload button instead.';
    captureStatus.className = 'status-msg err';
    captureBtn.disabled = true;
    flipBtn.disabled = true;
  }
}

function stopCamera() {
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
}

captureBtn.addEventListener('click', async () => {
  if (!stream) return;
  const w = video.videoWidth;
  const h = video.videoHeight;
  const tmp = new OffscreenCanvas(w, h);
  tmp.getContext('2d').drawImage(video, 0, 0);
  capturedBitmap = await createImageBitmap(tmp);
  stopCamera();
  showValidateStep();
});

flipBtn.addEventListener('click', () => {
  facingMode = facingMode === 'environment' ? 'user' : 'environment';
  startCamera();
});

fileInput.addEventListener('change', async () => {
  const file = fileInput.files[0];
  if (!file) return;
  capturedBitmap = await createImageBitmap(file);
  stopCamera();
  showValidateStep();
  fileInput.value = '';
});

// ── Validate step ─────────────────────────────────────────────────────────────
function showValidateStep() {
  showStep(1);

  // Draw the captured image into the preview canvas
  previewCanvas.width  = capturedBitmap.width;
  previewCanvas.height = capturedBitmap.height;
  previewCanvas.getContext('2d').drawImage(capturedBitmap, 0, 0);

  // Run validation
  const result = validateMarker(capturedBitmap);
  renderValidation(result);
  renderMarkerPreview(capturedBitmap);

  generateBtn.disabled = !result.valid;
  if (result.valid) {
    validateStatus.textContent = '';
  } else {
    validateStatus.textContent = 'Fix the issues above before generating.';
    validateStatus.className = 'status-msg err';
  }
}

function renderValidation({ valid, score, errors, warnings, metrics }) {
  // Score badge
  const badgeClass = score >= 65 ? 'good' : score >= 35 ? 'warn' : 'bad';
  scoreBadge.textContent = `${score}/100`;
  scoreBadge.className = `score-badge ${badgeClass}`;
  scoreBar.style.width = `${score}%`;

  validationCard.className = `validation-card ${valid ? 'valid' : 'invalid'}`;

  // Message list
  messageList.innerHTML = '';
  const append = (text, cls, icon) => {
    const li = document.createElement('li');
    li.innerHTML = `<span class="icon">${icon}</span><span class="${cls}">${text}</span>`;
    messageList.appendChild(li);
  };

  for (const msg of errors)   append(msg, 'msg-error',   '✕');
  for (const msg of warnings) append(msg, 'msg-warning', '⚠');
  if (errors.length === 0 && warnings.length === 0) {
    append('Looks good — this image should track reliably.', 'msg-ok', '✓');
  }

  // Metrics line
  const metricsLi = document.createElement('li');
  metricsLi.innerHTML = `<span class="icon" style="visibility:hidden">·</span>
    <span style="color:#444;font-size:0.75rem">
      contrast ${metrics.stdDev} · edges ${metrics.edgeDensityPct}%
    </span>`;
  messageList.appendChild(metricsLi);
}

/** Draws the captured image inside a thick black AR marker border on markerPreview. */
function renderMarkerPreview(src) {
  const size = 160;
  const border = 20; // black border thickness in px
  const ctx = markerPreview.getContext('2d');

  // White background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);

  // Black border
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(border, border, size - border * 2, size - border * 2);

  // Inner image
  ctx.drawImage(src, border, border, size - border * 2, size - border * 2);
}

retakeBtn.addEventListener('click', () => {
  capturedBitmap = null;
  patternData = null;
  captureBtn.disabled = false;
  captureStatus.textContent = 'Ready — point at the image you want to use as a marker.';
  captureStatus.className = 'status-msg';
  showStep(0);
  startCamera();
});

// ── Slug helper: turn any string into a safe filename ─────────────────────────
function toSlug(raw) {
  return raw.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'marker';
}

// ── Generate step ─────────────────────────────────────────────────────────────
generateBtn.addEventListener('click', () => {
  if (!capturedBitmap) return;

  validateStatus.textContent = 'Generating…';
  validateStatus.className = 'status-msg';

  // Small delay so the browser paints the status before blocking on canvas ops
  setTimeout(() => {
    try {
      patternData = generatePatternFile(capturedBitmap);
      const name = toSlug(markerNameInput.value || 'marker');
      markerNameInput.value = name;

      resultPath.textContent = `assets/markers/${name}.patt`;
      showStep(2);
    } catch (err) {
      console.error('[creator] generatePatternFile failed:', err);
      validateStatus.textContent = 'Generation failed — see console for details.';
      validateStatus.className = 'status-msg err';
    }
  }, 50);
});

// ── Result step: download ─────────────────────────────────────────────────────
downloadBtn.addEventListener('click', () => {
  if (!patternData) return;
  const name = toSlug(markerNameInput.value || 'marker');
  const blob = new Blob([patternData], { type: 'text/plain' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `${name}.patt`;
  a.click();
  URL.revokeObjectURL(url);
  resultStatus.textContent = `Downloaded ${name}.patt — drop it into public/assets/markers/.`;
  resultStatus.className = 'status-msg ok';
});

// ── Result step: save to project via API ──────────────────────────────────────
saveProjectBtn.addEventListener('click', async () => {
  if (!patternData) return;

  const name = toSlug(markerNameInput.value || 'marker');
  resultStatus.textContent = 'Saving…';
  resultStatus.className = 'status-msg';

  try {
    const res = await fetch('/api/markers', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ name, data: patternData }),
    });
    const json = await res.json();

    if (res.ok && json.success) {
      resultStatus.textContent = `Saved to ${json.path}`;
      resultStatus.className = 'status-msg ok';
      saveProjectBtn.textContent = '✓ Saved';
      saveProjectBtn.disabled = true;
    } else if (json.error === 'filesystem_readonly') {
      resultStatus.textContent = 'Production filesystem is read-only — use Download instead.';
      resultStatus.className = 'status-msg err';
    } else {
      resultStatus.textContent = json.error ?? 'Save failed.';
      resultStatus.className = 'status-msg err';
    }
  } catch {
    resultStatus.textContent = 'Could not reach API — use Download instead.';
    resultStatus.className = 'status-msg err';
  }
});

// ── Reset for another marker ──────────────────────────────────────────────────
newMarkerBtn.addEventListener('click', () => {
  capturedBitmap = null;
  patternData    = null;
  markerNameInput.value = '';
  saveProjectBtn.textContent = 'Save to project (dev only)';
  saveProjectBtn.disabled = false;
  resultStatus.textContent = '';
  showStep(0);
  startCamera();
});

// ── Boot ──────────────────────────────────────────────────────────────────────
startCamera();
