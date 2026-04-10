/**
 * Campus Sustainability AR — Location Scene
 *
 * Integrates three CS engineering modules:
 *   SceneSelector  — O(1) hash map lookup for location configs
 *   AssetLoader    — priority queue for progressive 3D asset loading
 *   QuizEngine     — JSON-backed quiz with BFS topic graph
 */
import { SceneSelector } from '../src/SceneSelector.js';
import { AssetLoader }   from '../src/AssetLoader.js';
import { QuizEngine }    from '../src/QuizEngine.js';

// ── DOM refs ─────────────────────────────────────────────────────────────────

const permissionScreen = document.getElementById('permission-screen');
const arContainer      = document.getElementById('ar-container');
const loader           = document.getElementById('loader');
const startBtn         = document.getElementById('start-btn');

// ── Engine instances (initialised after data loads) ───────────────────────────

let sceneSelector = null;   // SceneSelector instance
let assetLoader   = null;   // AssetLoader instance
let quizEngine    = null;   // QuizEngine instance

// ── Proximity threshold for quiz trigger (metres) ─────────────────────────────
const QUIZ_TRIGGER_RADIUS = 20;

// ── Active quiz state ─────────────────────────────────────────────────────────
const quizState = {
  locationId:    null,
  questionIndex: 0,
  active:        false,
};

// ── Permissions ───────────────────────────────────────────────────────────────

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

// ── Data loading ──────────────────────────────────────────────────────────────

async function loadLocations() {
  const res = await fetch('../data/locations.json');
  return res.json();
}

async function loadQuizData() {
  const res = await fetch('../data/quiz.json');
  return res.json();
}

async function loadAssetManifest() {
  const res = await fetch('../data/assets.json');
  return res.json();
}

// ── Distance helpers ──────────────────────────────────────────────────────────

/**
 * Haversine formula — great-circle distance in metres.
 */
function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (deg) => deg * (Math.PI / 180);
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatDistance(metres) {
  return metres < 1000
    ? `${Math.round(metres)}m away`
    : `${(metres / 1000).toFixed(1)}km away`;
}

// ── Scene building ────────────────────────────────────────────────────────────

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

// ── Live GPS tracking + proximity quiz trigger ────────────────────────────────

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

      // Use SceneSelector to find the nearest POI in O(n) — then do O(1)
      // lookups per-location for label updates.
      const nearestResult = sceneSelector.getNearest(userLat, userLng);

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

      // ── Quiz trigger ────────────────────────────────────────────────────────
      // When the nearest POI is within QUIZ_TRIGGER_RADIUS metres and the quiz
      // is not already open, open it. SceneSelector.select() is O(1).
      if (
        nearestResult &&
        nearestResult.distanceMetres <= QUIZ_TRIGGER_RADIUS &&
        !quizState.active
      ) {
        const locationConfig = sceneSelector.select(nearestResult.location.id);
        if (locationConfig && quizEngine.questionCount(locationConfig.id) > 0) {
          openQuiz(locationConfig.id, locationConfig.label);
        }
      }
    },
    (err) => {
      dbg(`GPS error: ${err.code} ${err.message}`);
    },
    {
      enableHighAccuracy: true,
      maximumAge: 2000,
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

// ── Quiz UI ───────────────────────────────────────────────────────────────────

const quizOverlay      = document.getElementById('quiz-overlay');
const quizLocationName = document.getElementById('quiz-location-name');
const quizScoreEl      = document.getElementById('quiz-score');
const quizQuestionEl   = document.getElementById('quiz-question');
const quizOptionsEl    = document.getElementById('quiz-options');
const quizFeedbackEl   = document.getElementById('quiz-feedback');
const quizRelatedSec   = document.getElementById('quiz-related-section');
const quizTopicsEl     = document.getElementById('quiz-topics');
const quizNextBtn      = document.getElementById('quiz-next');
const quizCloseBtn     = document.getElementById('quiz-close');

function openQuiz(locationId, locationLabel) {
  quizState.locationId    = locationId;
  quizState.questionIndex = 0;
  quizState.active        = true;

  quizLocationName.textContent = locationLabel;
  quizOverlay.classList.add('active');
  renderQuestion();
}

function closeQuiz() {
  quizState.active = false;
  quizOverlay.classList.remove('active');
}

function renderQuestion() {
  const { locationId, questionIndex } = quizState;
  const question = quizEngine.getQuestion(locationId, questionIndex);

  if (!question) {
    // All questions answered — show final score
    const score = quizEngine.getScore(locationId);
    quizQuestionEl.textContent = `Quiz complete! You scored ${score.correct} / ${score.total} (${score.percent}%)`;
    quizOptionsEl.innerHTML    = '';
    quizFeedbackEl.classList.add('hidden');
    quizRelatedSec.classList.add('hidden');
    quizNextBtn.classList.add('hidden');
    updateScoreDisplay(locationId);
    return;
  }

  // Render question text
  quizQuestionEl.textContent = `Q${questionIndex + 1}. ${question.q}`;

  // Render answer options as buttons
  quizOptionsEl.innerHTML = question.options.map((opt, i) => `
    <button class="quiz-option" data-index="${i}">${opt}</button>
  `).join('');

  // Attach click handlers to option buttons
  quizOptionsEl.querySelectorAll('.quiz-option').forEach(btn => {
    btn.addEventListener('click', () => handleAnswer(Number(btn.dataset.index)));
  });

  quizFeedbackEl.classList.add('hidden');
  quizRelatedSec.classList.add('hidden');
  quizNextBtn.classList.add('hidden');
  updateScoreDisplay(locationId);
}

function handleAnswer(chosenIndex) {
  const { locationId, questionIndex } = quizState;
  const result = quizEngine.checkAnswer(locationId, questionIndex, chosenIndex);
  const question = quizEngine.getQuestion(locationId, questionIndex);

  // Disable all options and highlight correct / wrong
  quizOptionsEl.querySelectorAll('.quiz-option').forEach((btn, i) => {
    btn.disabled = true;
    if (i === result.correctIndex) btn.classList.add('correct');
    if (i === chosenIndex && !result.correct) btn.classList.add('wrong');
  });

  // Show explanation
  quizFeedbackEl.textContent = result.explanation || (result.correct ? '✓ Correct!' : '✗ Not quite.');
  quizFeedbackEl.classList.remove('hidden');

  // BFS: show related topics from the current question's topic
  if (question?.topic) {
    const related = quizEngine.getRelatedTopics(question.topic, 2)
      .filter(({ depth }) => depth > 0)   // exclude seed itself
      .slice(0, 5);                        // cap at 5 chips

    if (related.length > 0) {
      quizTopicsEl.innerHTML = related
        .map(({ topic }) => `<span class="topic-chip">${formatTopic(topic)}</span>`)
        .join('');
      quizRelatedSec.classList.remove('hidden');
    }
  }

  updateScoreDisplay(locationId);

  const hasNext = questionIndex + 1 < quizEngine.questionCount(locationId);
  quizNextBtn.textContent = hasNext ? 'Next →' : 'Finish';
  quizNextBtn.classList.remove('hidden');
}

quizNextBtn.addEventListener('click', () => {
  quizState.questionIndex += 1;
  renderQuestion();
});

quizCloseBtn.addEventListener('click', closeQuiz);

function updateScoreDisplay(locationId) {
  const { correct, total } = quizEngine.getScore(locationId);
  quizScoreEl.textContent = `Score: ${correct} / ${total}`;
}

/** "solar-energy" → "Solar Energy" */
function formatTopic(topic) {
  return topic.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// ── Debug overlay ─────────────────────────────────────────────────────────────

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

// ── Init ──────────────────────────────────────────────────────────────────────

async function initScene() {
  const granted = await requestPermissions();
  if (!granted) return;

  dbg('Permissions granted');
  showLoader();

  // Load all data sources in parallel
  const [locations, quizData, assetManifest] = await Promise.all([
    loadLocations(),
    loadQuizData(),
    loadAssetManifest(),
  ]);
  dbg(`Loaded ${locations.length} locations, ${quizData.length} quiz sets`);

  // ── Initialise engines ──────────────────────────────────────────────────────

  // SceneSelector: build hash map from location array — O(n) construction
  sceneSelector = new SceneSelector(locations);
  dbg(`SceneSelector ready — ${sceneSelector.size} locations indexed`);

  // QuizEngine: build DB + topic graph — O(V+E) construction
  quizEngine = new QuizEngine(quizData);
  dbg('QuizEngine ready — topic graph built');

  // AssetLoader: enqueue all assets by priority, begin background loading
  assetLoader = new AssetLoader();
  for (const asset of assetManifest) {
    assetLoader.enqueue(asset);   // O(log n) per insert into min-heap
  }
  dbg(`AssetLoader: ${assetLoader.pendingCount} assets queued`);
  // Preload runs in the background — does not block AR scene startup
  assetLoader.preloadAll().then(() => dbg('All assets preloaded'));

  // ── Build A-Frame scene ─────────────────────────────────────────────────────

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
    dbg(`gps-camera registered: ${AFRAME.components['gps-camera'] !== undefined}`);
    dbg(`gps-entity-place registered: ${AFRAME.components['gps-entity-place'] !== undefined}`);
    hideLoader();
    startTracking(locations);
  });

  scene.addEventListener('error', (e) => dbg(`Scene error: ${e.detail}`));
  window.addEventListener('beforeunload', stopTracking);
}

initScene();
