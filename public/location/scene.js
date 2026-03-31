const permissionScreen = document.getElementById('permission-screen');
const arContainer = document.getElementById('ar-container');
const loader = document.getElementById('loader');
const startBtn = document.getElementById('start-btn');

// ── Permissions ────────────────────────────────────────────────────────────
// Make sure that the user allows location assess to Safari
async function requestPermissions() {
  return new Promise((resolve) => {
    startBtn.addEventListener('click', async () => {
      try {
        // Step 1 — camera
        try {
          await navigator.mediaDevices.getUserMedia({ video: true });
        } catch (err) {
          console.error('[location] Camera denied:', err);
          startBtn.textContent = 'Camera access denied — check browser settings';
          startBtn.disabled = true;
          resolve(false);
          return;
        }

        // Step 2 — geolocation
        try {
          await new Promise((res, rej) => {
            navigator.geolocation.getCurrentPosition(res, rej, {
              enableHighAccuracy: true,
              timeout: 15000,
            });
          });
        } catch (err) {
          const msg = {
            1: 'Location permission denied — enable it in browser settings',
            2: 'Location unavailable — try moving outdoors',
            3: 'Location timed out — try again',
          }[err.code] ?? `Location error (code ${err.code})`;
          console.error('[location] Geolocation error:', err.code, err.message);
          startBtn.textContent = msg;
          startBtn.disabled = true;
          resolve(false);
          return;
        }

        // Step 3 — device orientation (iOS 13+ requires explicit permission)
        if (typeof DeviceOrientationEvent !== 'undefined' &&
            typeof DeviceOrientationEvent.requestPermission === 'function') {
          try {
            const orientResult = await DeviceOrientationEvent.requestPermission();
            if (orientResult !== 'granted') {
              console.warn('[location] Device orientation denied');
            }
          } catch (err) {
            console.warn('[location] Device orientation permission error:', err);
          }
        }

        permissionScreen.classList.add('hidden');
        arContainer.classList.remove('hidden');
        resolve(true);
      } catch (err) {
        console.error('[location] Unexpected error:', err);
        startBtn.textContent = 'Something went wrong — please refresh and try again';
        startBtn.disabled = true;
        resolve(false);
      }
    }, { once: true });
  });
}

function showLoader() { loader.classList.remove('hidden'); }
function hideLoader() { loader.classList.add('hidden'); }

// ── Data ───────────────────────────────────────────────────────────────────

async function loadLocations() {
  const res = await fetch('../data/locations.json');
  return res.json();
}

// ── Distance ───────────────────────────────────────────────────────────────

/**
 * Haversine formula — returns the great-circle distance in metres
 * between two GPS coordinates.
 */
function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371000; // Earth radius in metres
  const toRad = (deg) => deg * (Math.PI / 180);

  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Formats a raw metre value into a readable string.
 * < 1000m → "42m"
 * >= 1000m → "1.2km"
 */
function formatDistance(metres) {
  if (metres < 1000) {
    return `${Math.round(metres)}m away`;
  }
  return `${(metres / 1000).toFixed(1)}km away`;
}

// ── Scene building ─────────────────────────────────────────────────────────

function buildLocationEntities(locations) {
  return locations.map(loc => `
    <a-entity
      id="loc-${loc.id}"
      gps-entity-place="latitude: ${loc.lat}; longitude: ${loc.lng};"
      look-at="[gps-camera]"
    >
      <a-box
        color="${loc.color}"
        scale="${loc.scale}"
        opacity="0.85"
        animation="property: rotation; to: 0 360 0; loop: true; dur: 5000; easing: linear"
      ></a-box>
      <a-text
        id="label-${loc.id}"
        value="${loc.label}\nLocating..."
        align="center"
        color="#ffffff"
        position="0 20 0"
        scale="30 30 30"
        wrap-count="20"
      ></a-text>
    </a-entity>
  `).join('');
}

// ── Live GPS tracking ──────────────────────────────────────────────────────

let watchId = null;

function startTracking(locations) {
  if (!navigator.geolocation) {
    console.warn('[location] Geolocation not supported');
    return;
  }

  watchId = navigator.geolocation.watchPosition(
    (position) => {
      const userLat = position.coords.latitude;
      const userLng = position.coords.longitude;
      dbg(`GPS: ${userLat.toFixed(5)}, ${userLng.toFixed(5)}`);

      locations.forEach(loc => {
        const distanceMetres = haversineDistance(userLat, userLng, loc.lat, loc.lng);
        dbg(`${loc.label}: ${Math.round(distanceMetres)}m`);
        const el = document.querySelector(`#loc-${loc.id}`);
        if (el && el.object3D) {
          const p = el.object3D.position;
          dbg(`  3D pos: ${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)}`);
        }
        const label = document.querySelector(`#label-${loc.id}`);

        if (label) {
          label.setAttribute('value', `${loc.label}\n${formatDistance(distanceMetres)}`);
        }
      });
    },
    (err) => {
      dbg(`GPS error: ${err.code} ${err.message}`);
    },
    {
      enableHighAccuracy: true,
      maximumAge: 2000,      // accept cached position up to 2s old
      timeout: 10000,
    }
  );
}

function stopTracking() {
  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }
}

// ── Debug overlay ──────────────────────────────────────────────────────────

const debugEl = document.createElement('div');
debugEl.style.cssText = 'position:fixed;top:0;left:0;right:0;background:rgba(0,0,0,0.7);color:#fff;font-size:12px;padding:8px;z-index:9999;max-height:40vh;overflow-y:auto;';
document.body.appendChild(debugEl);

const toggleBtn = document.createElement('button');
toggleBtn.textContent = 'Hide Logs';
toggleBtn.style.cssText = `
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 10000;
  font-size: 14px;
  font-weight: 600;
  padding: 10px 24px;
  border-radius: 999px;
  border: none;
  background: rgba(0,0,0,0.75);
  color: #fff;
  backdrop-filter: blur(6px);
  box-shadow: 0 2px 12px rgba(0,0,0,0.4);
`;
toggleBtn.addEventListener('click', () => {
  const isHidden = debugEl.style.display === 'none';
  debugEl.style.display = isHidden ? 'block' : 'none';
  toggleBtn.textContent = isHidden ? 'Hide Logs' : 'Show Logs';
});
document.body.appendChild(toggleBtn);

function dbg(msg) {
  console.log('[debug]', msg);
  const line = document.createElement('div');
  line.textContent = `${new Date().toLocaleTimeString()} ${msg}`;
  debugEl.prepend(line);
}

// ── Init ───────────────────────────────────────────────────────────────────

async function initScene() {
  const granted = await requestPermissions();
  if (!granted) return;

  dbg('Permissions granted');
  showLoader();

  const locations = await loadLocations();
  dbg(`Loaded ${locations.length} locations`);

  arContainer.innerHTML = `
    <a-scene
      embedded
      arjs="sourceType: webcam; videoTexture: true; debugUIEnabled: false;"
      vr-mode-ui="enabled: false"
    >
      <a-box position="0 0 -5" color="#ff0000" scale="2 2 2"></a-box>
      ${buildLocationEntities(locations)}
      <a-camera gps-camera="gpsMinDistance: 5"></a-camera>
    </a-scene>
  `;
  dbg('Scene injected');

  const scene = arContainer.querySelector('a-scene');
  scene.addEventListener('loaded', () => {
    dbg('Scene loaded');
    const hasGpsCamera = AFRAME.components['gps-camera'] !== undefined;
    const hasGpsEntity = AFRAME.components['gps-entity-place'] !== undefined;
    dbg(`gps-camera registered: ${hasGpsCamera}`);
    dbg(`gps-entity-place registered: ${hasGpsEntity}`);
    hideLoader();
    startTracking(locations);
  });

  scene.addEventListener('error', (e) => dbg(`Scene error: ${e.detail}`));

  // Clean up watcher if the user navigates away
  window.addEventListener('beforeunload', stopTracking);
}

initScene();
