import { requestCameraPermission, showLoader, hideLoader } from './shared/components/ar-loader.js';

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
      <a-marker preset="hiro">
        <a-entity
          geometry="primitive: box; depth: 0.5; height: 0.5; width: 0.5"
          material="color: #e25822; opacity: 0.85"
          position="0 0.25 0"
          animation="property: rotation; to: 0 360 0; loop: true; dur: 4000; easing: linear"
        ></a-entity>
        <a-text
          value="Geothermal\nEnergy"
          align="center"
          position="0 1 0"
          color="#ffffff"
          width="2"
        ></a-text>
      </a-marker>

      <a-entity camera></a-entity>
    </a-scene>
  `;

  const scene = arContainer.querySelector('a-scene');
  scene.addEventListener('loaded', () => {
    hideLoader();
    enablePinchZoom();
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
