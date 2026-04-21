/**
 * Phenology Walk — Central Park
 *
 * Portal-window-to-2050 AR camera experience with two layers of interactivity:
 *
 *   Option 1 — Device Orientation (iOS)
 *     Tilt the phone to create a subtle parallax shift on the portal position.
 *     gamma/beta axes drive a smooth lerp so motion stays fluid.
 *
 *   Option 2 — Three.js Volumetric Overlays
 *     A transparent Three.js canvas sits above the camera canvas.
 *     Per-waypoint particle systems (blossoms, leaves, wildflowers,
 *     blooms) are rendered with a scissor rect constrained to the
 *     portal arch area. The scene tilts subtly with the device,
 *     creating a parallax depth effect impossible with CSS.
 *
 * Imports
 *   ProximityManager — GPS proximity events (engine layer)
 *   THREE            — Three.js r165 via CDN
 */

import { ProximityManager } from '../src/ProximityManager.js';
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.165.0/build/three.module.js';

// ── DOM refs ──────────────────────────────────────────────────────────────────

const permissionScreen = document.getElementById('permission-screen');
const startBtn         = document.getElementById('start-btn');
const cameraSource     = document.getElementById('camera-source');
const cameraCanvas     = document.getElementById('camera-canvas');
const threeCanvas      = document.getElementById('three-canvas');
const onboarding       = document.getElementById('onboarding');
const onboardIcon      = document.getElementById('onboard-icon');
const onboardText      = document.getElementById('onboard-text');
const waypointHud      = document.getElementById('waypoint-hud');
const waypointBanner   = document.getElementById('waypoint-banner');
const waypointNameEl   = document.getElementById('waypoint-name');
const waypointDistEl   = document.getElementById('waypoint-distance');
const seasonPresentEl  = document.getElementById('season-present-text');
const seasonFutureEl   = document.getElementById('season-future-text');
const demoBar          = document.getElementById('demo-bar');
const speciesPanel     = document.getElementById('species-panel');
const speciesCloseBtn  = document.getElementById('species-close');
const panelLocationEl  = document.getElementById('panel-location');
const panelNameEl      = document.getElementById('panel-species-name');
const panelSciEl       = document.getElementById('panel-species-sci');
const panelNoteEl      = document.getElementById('panel-note');
const panelClimateEl   = document.getElementById('panel-climate-note');
const speciesNavEl     = document.getElementById('species-nav');
const eventGridEl      = document.getElementById('event-grid');

const camCtx = cameraCanvas.getContext('2d');

// ── State ─────────────────────────────────────────────────────────────────────

let phenologyData    = null;
let proximityManager = null;
let activeWaypoint   = null;
let activeSpeciesIdx = 0;
let rafId            = null;
let demoWaypointId   = null;

// Orientation state
let orientationAvailable = false;
let currentGamma         = 0;   // device tilt left/right in degrees
let currentBeta          = 70;  // device tilt forward/back (70° = typical portrait hold)
let targetGamma          = 0;
let targetBeta           = 70;

const LERP_SPEED = 0.06; // smoothing factor — lower = more sluggish

// Filter strings — set once at init
let _presentFilter = 'none';
let _futureFilter  = 'none';

// Three.js globals
let threeRenderer     = null;
let threeScene        = null;
let threeCamera       = null;
let activeParticles   = null; // { points, velocities }

// ── Permissions ───────────────────────────────────────────────────────────────

async function requestPermissions() {
  return new Promise(resolve => {
    startBtn.addEventListener('click', async () => {
      try {
        // Camera
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
          });
          cameraSource.srcObject = stream;
          await cameraSource.play();
        } catch {
          startBtn.textContent = 'Camera access denied — check browser settings';
          startBtn.disabled = true;
          resolve(false);
          return;
        }

        // Geolocation — optional, GPS proximity still works if granted
        try {
          await new Promise((res, rej) =>
            navigator.geolocation.getCurrentPosition(res, rej, {
              enableHighAccuracy: true, timeout: 8000,
            })
          );
        } catch {
          // GPS unavailable or denied — demo bar still works
        }

        // Device orientation (iOS 13+ requires explicit permission)
        if (typeof DeviceOrientationEvent?.requestPermission === 'function') {
          try {
            const result = await DeviceOrientationEvent.requestPermission();
            orientationAvailable = result === 'granted';
          } catch (_) {
            orientationAvailable = false;
          }
        } else {
          // Non-iOS: orientation available without permission prompt
          orientationAvailable = true;
        }

        permissionScreen.classList.add('hidden');
        resolve(true);
      } catch {
        startBtn.textContent = 'Something went wrong — please refresh';
        startBtn.disabled = true;
        resolve(false);
      }
    }, { once: true });
  });
}

// ── Data ──────────────────────────────────────────────────────────────────────

async function loadPhenologyData() {
  const res = await fetch('../data/phenology.json');
  return res.json();
}

// ── Season logic ──────────────────────────────────────────────────────────────

function dayOfYear(date) {
  return Math.floor((date - new Date(date.getFullYear(), 0, 0)) / 86_400_000);
}

function doyToSeason(doy) {
  if (doy < 80  || doy >= 355) return 'winter';
  if (doy < 172) return 'spring';
  if (doy < 266) return 'summer';
  return 'fall';
}

function getSeasons(date, climate) {
  const doy = dayOfYear(date);
  return {
    present: doyToSeason(doy),
    future:  doyToSeason(doy + Math.abs(climate.springPhenologyShiftDays)),
  };
}

function seasonLabel(season, year, future = false) {
  const names = { winter: 'Winter', spring: 'Spring', summer: 'Summer', fall: 'Fall' };
  return `${future ? 'Late ' : ''}${names[season]} ${year}`;
}

// ── Camera canvas ─────────────────────────────────────────────────────────────

function resizeCanvases() {
  cameraCanvas.width  = window.innerWidth;
  cameraCanvas.height = window.innerHeight;
  if (threeRenderer) {
    threeRenderer.setSize(window.innerWidth, window.innerHeight);
    threeCamera.aspect = window.innerWidth / window.innerHeight;
    threeCamera.updateProjectionMatrix();
  }
}

// ── Portal geometry ───────────────────────────────────────────────────────────

/**
 * Returns the portal bounding box, accounting for orientation parallax.
 * cx, cy  — centre of the portal arch
 * pw, ph  — width and height of the bounding rectangle
 * px, py  — top-left corner of the bounding rectangle
 */
function getPortalBounds() {
  const W = cameraCanvas.width;
  const H = cameraCanvas.height;
  const parallaxX = orientationAvailable ? currentGamma * 3 : 0;
  const parallaxY = orientationAvailable ? (currentBeta - 70) * 2 : 0;
  const cx = W / 2 + parallaxX;
  const cy = H / 2 + parallaxY;
  const pw = Math.min(W, H) * 0.6;
  const ph = pw * 1.55;
  return { cx, cy, pw, ph, px: cx - pw / 2, py: cy - ph / 2 };
}

/**
 * Traces an arch path onto the given 2D context.
 * Shape: rectangle bottom + semicircle top.
 * Call ctx.clip() or ctx.stroke()/ctx.fill() after this.
 */
function buildPortalPath(ctx, cx, cy, pw, ph) {
  const left    = cx - pw / 2;
  const right   = cx + pw / 2;
  const bottom  = cy + ph / 2;
  const archTop = cy - ph / 2 + pw / 2; // centre of the semicircle
  ctx.beginPath();
  ctx.moveTo(left, bottom);
  ctx.lineTo(left, archTop);
  ctx.arc(cx, archTop, pw / 2, Math.PI, 0, false);
  ctx.lineTo(right, bottom);
  ctx.closePath();
}

/**
 * Render the portal frame onto the camera canvas:
 *   1. Full-frame present view (present filter)
 *   2. 2050 view clipped to the arch (future filter + warm amber overlay)
 *   3. Glowing amber arch border
 *   4. "2050" label at the bottom of the portal opening
 */
function drawPortalFrame() {
  const W = cameraCanvas.width;
  const H = cameraCanvas.height;
  if (cameraSource.readyState < 2) return;
  const { cx, cy, pw, ph } = getPortalBounds();

  // 1. Present — full frame
  camCtx.filter = _presentFilter;
  camCtx.drawImage(cameraSource, 0, 0, W, H);

  // 2. 2050 — clipped to arch
  camCtx.save();
  buildPortalPath(camCtx, cx, cy, pw, ph);
  camCtx.clip();
  camCtx.filter = _futureFilter;
  camCtx.drawImage(cameraSource, 0, 0, W, H);
  camCtx.filter = 'none';
  // Warm amber tint — strong enough to see clearly during testing
  camCtx.fillStyle = 'rgba(226, 110, 30, 0.28)';
  camCtx.fillRect(0, 0, W, H);
  camCtx.restore();

  // 3. Glowing arch border — thick enough to see at a glance
  camCtx.save();
  buildPortalPath(camCtx, cx, cy, pw, ph);
  camCtx.strokeStyle = '#e2a05a';
  camCtx.lineWidth = 6;
  camCtx.shadowColor = '#e25822';
  camCtx.shadowBlur = 32;
  camCtx.stroke();
  // Inner bright highlight
  buildPortalPath(camCtx, cx, cy, pw, ph);
  camCtx.strokeStyle = 'rgba(255, 235, 180, 0.8)';
  camCtx.lineWidth = 2;
  camCtx.shadowBlur = 0;
  camCtx.stroke();
  camCtx.restore();

  // 4. "2050" label at bottom of portal
  camCtx.save();
  camCtx.font = 'bold 14px system-ui, sans-serif';
  camCtx.fillStyle = '#fff';
  camCtx.textAlign = 'center';
  camCtx.shadowColor = '#e25822';
  camCtx.shadowBlur = 10;
  camCtx.fillText('2050', cx, cy + ph / 2 - 16);
  camCtx.restore();
}

// ── Three.js setup ────────────────────────────────────────────────────────────

/**
 * Initialise the Three.js renderer with a transparent background.
 * The renderer sits on top of the camera canvas and uses a scissor rect
 * to restrict all drawing to the portal arch area.
 */
function initThreeJS() {
  threeRenderer = new THREE.WebGLRenderer({
    canvas: threeCanvas,
    alpha: true,
    antialias: false, // keep GPU load low on mobile
    powerPreference: 'low-power',
  });
  threeRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  threeRenderer.setSize(window.innerWidth, window.innerHeight);
  threeRenderer.setClearColor(0x000000, 0); // fully transparent

  threeScene = new THREE.Scene();

  threeCamera = new THREE.PerspectiveCamera(
    60,
    window.innerWidth / window.innerHeight,
    0.1,
    100,
  );
  threeCamera.position.set(0, 0, 5);
}

// ── Three.js particle systems ─────────────────────────────────────────────────

/**
 * Per-overlay-type particle configs.
 * count  — number of particles
 * colors — hex color pool (one is chosen per particle at spawn)
 * size   — world-space point size
 * speed  — downward fall speed per frame
 * spread — spawn volume extents { x, y, z }
 * drift  — horizontal sine-wave amplitude
 */
const OVERLAY_3D = {
  'cherry-blossoms': {
    count: 90, colors: [0xffb7c5, 0xffd0dc, 0xff8fab, 0xfce4ec],
    size: 0.16, speed: 0.014, spread: { x: 9, y: 14, z: 4 }, drift: 0.005,
  },
  'elm-canopy': {
    count: 65, colors: [0x7bc67e, 0xa8d5a2, 0x4caf50, 0xc8e6c9],
    size: 0.14, speed: 0.009, spread: { x: 9, y: 14, z: 4 }, drift: 0.003,
  },
  'wildflowers': {
    count: 55, colors: [0xffd54f, 0xfff176, 0xffcc02, 0xaed581],
    size: 0.13, speed: 0.007, spread: { x: 7, y: 12, z: 3 }, drift: 0.002,
  },
  'garden-blooms': {
    count: 75, colors: [0xce93d8, 0xf48fb1, 0xef9a9a, 0xfff9c4],
    size: 0.18, speed: 0.011, spread: { x: 9, y: 14, z: 4 }, drift: 0.006,
  },
};

/**
 * Build a Three.js Points object for the given overlay type.
 * Each particle gets a random position inside the spread volume and its
 * own phase offset so motion is desynchronised across the swarm.
 *
 * Returns { points, velocities, config } — velocities is a plain array
 * of per-particle motion state, mutated every frame in updateParticles().
 */
function createParticleSystem(overlayType) {
  const config = OVERLAY_3D[overlayType];
  if (!config) return null;

  const { count, colors, size, spread } = config;

  const positions  = new Float32Array(count * 3);
  const colorArr   = new Float32Array(count * 3);
  const velocities = [];

  const c = new THREE.Color();

  for (let i = 0; i < count; i++) {
    positions[i * 3]     = (Math.random() - 0.5) * spread.x;
    positions[i * 3 + 1] = (Math.random() - 0.5) * spread.y;
    positions[i * 3 + 2] = (Math.random() - 0.5) * spread.z;

    c.setHex(colors[Math.floor(Math.random() * colors.length)]);
    colorArr[i * 3]     = c.r;
    colorArr[i * 3 + 1] = c.g;
    colorArr[i * 3 + 2] = c.b;

    velocities.push({
      dy:    -(config.speed * (0.7 + Math.random() * 0.6)),
      dx:    (Math.random() - 0.5) * 0.002,
      phase: Math.random() * Math.PI * 2,
    });
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color',    new THREE.BufferAttribute(colorArr,  3));

  const material = new THREE.PointsMaterial({
    size,
    vertexColors: true,
    transparent: true,
    opacity: 0.88,
    sizeAttenuation: true,
    depthWrite: false,
  });

  const points = new THREE.Points(geometry, material);
  threeScene.add(points);

  return { points, velocities, config };
}

function removeParticleSystem() {
  if (!activeParticles) return;
  threeScene.remove(activeParticles.points);
  activeParticles.points.geometry.dispose();
  activeParticles.points.material.dispose();
  activeParticles = null;
}

/**
 * Advance particle positions by one frame.
 * Particles that fall off the bottom wrap back to the top so the
 * system runs indefinitely without allocating new objects.
 */
function updateParticles(time) {
  if (!activeParticles) return;

  const { points, velocities, config } = activeParticles;
  const pos = points.geometry.attributes.position.array;

  for (let i = 0; i < velocities.length; i++) {
    const v = velocities[i];
    const ix = i * 3;

    pos[ix]     += v.dx + Math.sin(time * 0.8 + v.phase) * config.drift;
    pos[ix + 1] += v.dy;

    // Wrap: when particle exits bottom, respawn at top
    if (pos[ix + 1] < -(config.spread.y / 2)) {
      pos[ix + 1]  = config.spread.y / 2;
      pos[ix]      = (Math.random() - 0.5) * config.spread.x;
    }
  }

  points.geometry.attributes.position.needsUpdate = true;
}

/**
 * Render the Three.js scene constrained to the portal arch bounds.
 * scissorTest ensures nothing bleeds outside the portal area.
 *
 * Device orientation is applied as a subtle rotation of the entire
 * scene — tilting the phone creates a parallax depth effect that no
 * flat CSS particle can replicate.
 */
function renderThreeScene() {
  if (!threeRenderer || !activeParticles) return;
  const W = window.innerWidth;
  const H = window.innerHeight;
  const { px, py, pw, ph } = getPortalBounds();

  threeScene.rotation.z = -currentGamma * 0.008;
  threeScene.rotation.x = (currentBeta - 70) * 0.005;

  const sx = Math.max(0, Math.floor(px));
  const sy = Math.max(0, Math.floor(H - py - ph));
  const sw = Math.min(Math.ceil(pw), W - sx);
  const sh = Math.min(Math.ceil(ph), H - sy);

  threeRenderer.setViewport(0, 0, W, H);
  threeRenderer.setScissor(sx, sy, sw, sh);
  threeRenderer.setScissorTest(true);
  threeCamera.aspect = W / H;
  threeCamera.updateProjectionMatrix();
  threeRenderer.render(threeScene, threeCamera);
}

// ── Device orientation ────────────────────────────────────────────────────────

/**
 * Listen to deviceorientation. gamma (left/right tilt) and beta (forward/back)
 * drive the portal parallax effect via smooth lerp in the render loop.
 */
function initOrientation() {
  window.addEventListener('deviceorientation', e => {
    if (e.gamma === null) return;
    targetGamma = e.gamma;
    targetBeta  = e.beta ?? 70;
  });
}

/**
 * Mouse parallax fallback for desktop/laptop testing.
 * Moving the mouse left/right shifts the portal like device tilt would.
 */
function initMouseParallax() {
  window.addEventListener('mousemove', e => {
    const cx = window.innerWidth  / 2;
    const cy = window.innerHeight / 2;
    targetGamma = ((e.clientX - cx) / cx) * 18;        // ±18° equivalent
    targetBeta  = 70 + ((e.clientY - cy) / cy) * 12;  // 58–82° range
  });
}

// ── Onboarding ────────────────────────────────────────────────────────────────

let onboardingDismissed = false;

function dismissOnboarding() {
  if (onboardingDismissed) return;
  onboardingDismissed = true;
  onboarding.classList.add('hidden');
}

/**
 * Set onboarding copy for the portal experience.
 */
function configureOnboarding() {
  onboardIcon.textContent = '🌿';
  onboardText.textContent = 'Walk near a plant or tree to see its 2050 future';
}

// ── Waypoint activation ───────────────────────────────────────────────────────

function activateWaypoint(waypoint, distanceLabel = '') {
  activeWaypoint   = waypoint;
  activeSpeciesIdx = 0;

  waypointNameEl.textContent = waypoint.label;
  waypointDistEl.textContent = distanceLabel;
  waypointBanner.classList.add('visible');

  // Swap Three.js particle system for this waypoint
  removeParticleSystem();
  activeParticles = createParticleSystem(waypoint.overlayType);

  openSpeciesPanel(waypoint, 0);
}

function deactivateWaypoint() {
  activeWaypoint = null;
  waypointBanner.classList.remove('visible');
  removeParticleSystem();
  closeSpeciesPanel();
}

// ── Species panel ─────────────────────────────────────────────────────────────

function openSpeciesPanel(waypoint, speciesIdx) {
  const species = waypoint.species[speciesIdx];
  const { climateData } = phenologyData;

  panelLocationEl.textContent = waypoint.label;
  panelNameEl.textContent     = species.name;
  panelSciEl.textContent      = species.scientificName;
  panelNoteEl.textContent     = species.note;
  panelClimateEl.textContent  =
    `Data: ${climateData.sources[0]} · Projection: ${climateData.projection}`;

  if (waypoint.species.length > 1) {
    speciesNavEl.innerHTML = waypoint.species.map((s, i) => `
      <button class="species-tab${i === speciesIdx ? ' active' : ''}" data-idx="${i}">
        ${s.name}
      </button>
    `).join('');
    speciesNavEl.querySelectorAll('.species-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        activeSpeciesIdx = Number(btn.dataset.idx);
        openSpeciesPanel(waypoint, activeSpeciesIdx);
      });
    });
  } else {
    speciesNavEl.innerHTML = '';
  }

  eventGridEl.querySelectorAll('.event-row').forEach(r => r.remove());
  for (const ev of species.events) {
    const sign = ev.shiftDays < 0 ? '' : '+';
    const row  = document.createElement('div');
    row.className = 'event-row';
    row.innerHTML = `
      <div class="event-cell name">${ev.name}</div>
      <div class="event-cell hist">${ev.historicDate}</div>
      <div class="event-cell proj">
        ${ev.projected2050Date}
        <span class="shift-badge">${sign}${ev.shiftDays}d</span>
      </div>
    `;
    eventGridEl.appendChild(row);
  }

  speciesPanel.classList.add('active');
}

function closeSpeciesPanel() {
  speciesPanel.classList.remove('active');
}

speciesCloseBtn.addEventListener('click', closeSpeciesPanel);

// ── Demo bar ──────────────────────────────────────────────────────────────────

function initDemoBar(waypoints) {
  demoBar.classList.remove('hidden');
  demoBar.querySelectorAll('.demo-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      demoBar.querySelectorAll('.demo-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      demoWaypointId = btn.dataset.demo === 'none' ? null : btn.dataset.demo;
      if (!demoWaypointId) { deactivateWaypoint(); return; }
      const wp = waypoints.find(w => w.id === demoWaypointId);
      if (wp) activateWaypoint(wp, 'demo mode');
    });
  });
  demoBar.querySelector('[data-demo="none"]').classList.add('active');
}

// ── Main render loop ──────────────────────────────────────────────────────────

function startRenderLoop() {
  function frame(timestamp) {
    const time = timestamp / 1000;

    // Smooth orientation toward targets (lerp)
    currentGamma += (targetGamma - currentGamma) * LERP_SPEED;
    currentBeta  += (targetBeta  - currentBeta)  * LERP_SPEED;

    drawPortalFrame();
    updateParticles(time);
    renderThreeScene();

    rafId = requestAnimationFrame(frame);
  }
  rafId = requestAnimationFrame(frame);
}

function stopRenderLoop() {
  if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
}

// ── Init ──────────────────────────────────────────────────────────────────────

async function init() {
  const granted = await requestPermissions();
  if (!granted) return;

  phenologyData = await loadPhenologyData();
  const { waypoints, seasonalFilters, climateData } = phenologyData;

  // Season filters
  const now     = new Date();
  const seasons = getSeasons(now, climateData);
  _presentFilter = seasonalFilters.present[seasons.present];
  _futureFilter  = seasonalFilters.future[seasons.future];

  seasonPresentEl.textContent = seasonLabel(seasons.present, now.getFullYear(), false);
  seasonFutureEl.textContent  = seasonLabel(seasons.future,  2050,              true);

  // Canvas + Three.js
  resizeCanvases();
  window.addEventListener('resize', resizeCanvases);
  initThreeJS();

  // Show UI
  cameraCanvas.classList.remove('hidden');
  threeCanvas.classList.remove('hidden');
  waypointHud.classList.remove('hidden');

  // Onboarding
  configureOnboarding();
  onboarding.classList.remove('hidden');
  setTimeout(() => dismissOnboarding(), 4000);

  // Orientation — device tilt on mobile, mouse parallax on desktop
  if (orientationAvailable) initOrientation();
  else initMouseParallax();

  // Render
  startRenderLoop();

  // GPS proximity
  proximityManager = new ProximityManager(waypoints, {
    onEnter({ location, distanceMetres }) {
      if (demoWaypointId) return;
      activateWaypoint(location, ProximityManager.formatDistance(distanceMetres));
    },
    onExit({ location }) {
      if (demoWaypointId) return;
      if (activeWaypoint?.id === location.id) deactivateWaypoint();
    },
    onPosition({ distances }) {
      if (demoWaypointId || !activeWaypoint) return;
      const match = distances.find(d => d.location.id === activeWaypoint.id);
      if (match) waypointDistEl.textContent = ProximityManager.formatDistance(match.distanceMetres);
    },
  });

  proximityManager.start();
  initDemoBar(waypoints);

  // Auto-activate first waypoint so particles show immediately for testing
  demoWaypointId = waypoints[0].id;
  activateWaypoint(waypoints[0], 'demo mode');
  demoBar.querySelector(`[data-demo="${waypoints[0].id}"]`).classList.add('active');
  demoBar.querySelector('[data-demo="none"]').classList.remove('active');

  window.addEventListener('beforeunload', () => {
    stopRenderLoop();
    proximityManager.stop();
  });
}

init();
