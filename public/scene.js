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
  scene.addEventListener('loaded', hideLoader);
}

initScene();
