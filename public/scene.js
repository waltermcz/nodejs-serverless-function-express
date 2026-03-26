import { requestCameraPermission, showLoader, hideLoader } from './src/components/ar-loader.js';
import { getMarkerTemplate, attachMarkerModels } from './src/markers/marker-objects.js';

async function initScene() {
  const granted = await requestCameraPermission();
  if (!granted) return;

  showLoader();

  const arContainer = document.getElementById('ar-container');
  arContainer.innerHTML = `
    <a-scene
      embedded
      arjs="sourceType: webcam; debugUIEnabled: false;"
      vr-mode-ui="enabled: false"
    >
      ${getMarkerTemplate()}
      <a-entity camera></a-entity>
    </a-scene>
  `;

  const scene = arContainer.querySelector('a-scene');
  scene.addEventListener('loaded', () => {
    hideLoader();
    enablePinchZoom();
    attachMarkerModels(scene);
  });
}

function enablePinchZoom() {
  let currentScale = 1;
  let startDistance = null;
  const MIN_SCALE = 0.5;
  const MAX_SCALE = 3;

  function getDistance(touches) {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.hypot(dx, dy);
  }

  function applyScale(scale) {
    const targets = document.querySelectorAll('video, .a-canvas');
    targets.forEach(el => {
      el.style.transform = `scale(${scale})`;
    });
  }

  document.addEventListener('touchstart', (e) => {
    if (e.touches.length === 2) {
      startDistance = getDistance(e.touches);
    }
  });

  document.addEventListener('touchmove', (e) => {
    if (e.touches.length === 2 && startDistance !== null) {
      const newDistance = getDistance(e.touches);
      const delta = newDistance / startDistance;
      const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, currentScale * delta));
      applyScale(newScale);
    }
  });

  document.addEventListener('touchend', (e) => {
    if (e.touches.length < 2 && startDistance !== null) {
      const targets = document.querySelectorAll('video, .a-canvas');
      if (targets.length > 0) {
        const current = new DOMMatrix(getComputedStyle(targets[0]).transform);
        currentScale = current.a;
      }
      startDistance = null;
    }
  });
}

initScene();
