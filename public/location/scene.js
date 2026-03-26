const permissionScreen = document.getElementById('permission-screen');
const arContainer = document.getElementById('ar-container');
const loader = document.getElementById('loader');
const startBtn = document.getElementById('start-btn');

async function requestPermissions() {
  return new Promise((resolve) => {
    startBtn.addEventListener('click', async () => {
      try {
        // Request camera
        await navigator.mediaDevices.getUserMedia({ video: true });

        // Request geolocation
        await new Promise((res, rej) => {
          navigator.geolocation.getCurrentPosition(res, rej, { timeout: 10000 });
        });

        permissionScreen.classList.add('hidden');
        arContainer.classList.remove('hidden');
        resolve(true);
      } catch (err) {
        console.error('[location] Permission denied:', err);
        startBtn.textContent = 'Permission denied — please allow camera & location';
        startBtn.disabled = true;
        resolve(false);
      }
    }, { once: true });
  });
}

function showLoader() { loader.classList.remove('hidden'); }
function hideLoader() { loader.classList.add('hidden'); }

async function loadLocations() {
  const res = await fetch('../data/locations.json');
  return res.json();
}

function buildLocationEntities(locations) {
  return locations.map(loc => `
    <a-entity
      gps-new-entity-place="latitude: ${loc.lat}; longitude: ${loc.lng};"
      look-at="[gps-new-camera]"
    >
      <a-box
        color="${loc.color}"
        scale="${loc.scale}"
        opacity="0.85"
        animation="property: rotation; to: 0 360 0; loop: true; dur: 5000; easing: linear"
      ></a-box>
      <a-text
        value="${loc.label}"
        align="center"
        color="#ffffff"
        position="0 20 0"
        scale="30 30 30"
      ></a-text>
    </a-entity>
  `).join('');
}

async function initScene() {
  const granted = await requestPermissions();
  if (!granted) return;

  showLoader();

  const locations = await loadLocations();

  arContainer.innerHTML = `
    <a-scene
      embedded
      arjs="sourceType: webcam; videoTexture: true; debugUIEnabled: false;"
      vr-mode-ui="enabled: false"
    >
      ${buildLocationEntities(locations)}
      <a-camera gps-new-camera="gpsMinDistance: 5"></a-camera>
    </a-scene>
  `;

  const scene = arContainer.querySelector('a-scene');
  scene.addEventListener('loaded', () => {
    hideLoader();
  });
}

initScene();
