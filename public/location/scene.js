/**
 * Campus Sustainability AR — Location Scene
 *
 * Integrates three CS engineering modules:
 *   SceneSelector  — O(1) hash map lookup for location configs
 *   AssetLoader    — priority queue for progressive 3D asset loading
 *   QuizEngine     — JSON-backed quiz with BFS topic graph
 */
import { SceneSelector }    from '../src/SceneSelector.js';
import { AssetLoader }      from '../src/AssetLoader.js';
import { QuizEngine }       from '../src/QuizEngine.js';
import { ProximityManager } from '../src/ProximityManager.js';
import { ScoreTracker }     from '../src/ScoreTracker.js';

// ── DOM refs ─────────────────────────────────────────────────────────────────

const permissionScreen = document.getElementById('permission-screen');
const arContainer      = document.getElementById('ar-container');
const loader           = document.getElementById('loader');
const startBtn         = document.getElementById('start-btn');

// ── Engine instances (initialised after data loads) ───────────────────────────

let sceneSelector    = null;   // SceneSelector instance
let assetLoader      = null;   // AssetLoader instance
let quizEngine       = null;   // QuizEngine instance
let proximityManager = null;   // ProximityManager instance

// ── Active quiz state ─────────────────────────────────────────────────────────
const quizState = {
  locationId:        null,
  questionIndex:     0,
  active:            false,
  dismissedLocations: new Set(), // locations the user has manually closed — never auto-reopen
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

async function loadTopics() {
  const res = await fetch('../data/topics.json');
  const data = await res.json();
  return data.edges;  // QuizEngine only needs the edge list
}

async function loadAssetManifest() {
  const res = await fetch('../data/assets.json');
  return res.json();
}

// Distance helpers are provided by ProximityManager as static methods:
//   ProximityManager.distanceTo(lat1, lng1, lat2, lng2) → metres
//   ProximityManager.formatDistance(metres)             → string

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
        class="clickable"
        data-location-id="${loc.id}"
        data-location-label="${loc.label}"
      ></a-box>
      <a-text
        id="label-${loc.id}"
        value="${loc.label}\nTap to quiz"
        align="center"
        color="#ffffff"
        position="0 20 0"
        scale="30 30 30"
        wrap-count="20"
        class="clickable"
        data-location-id="${loc.id}"
        data-location-label="${loc.label}"
      ></a-text>
    </a-entity>
  `).join('');
}

// ── Live GPS tracking + proximity quiz trigger ────────────────────────────────
// Handled by ProximityManager. Initialised in initScene() once locations load.
//
// onEnter  — fires when user crosses into a location's proximityThreshold.
//            Each location carries its own threshold (metres) from locations.json
//            instead of the old global QUIZ_TRIGGER_RADIUS constant.
// onPosition — fires on every GPS update; used to refresh AR distance labels.

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
  // Mark this location as dismissed so the proximity trigger won't reopen it
  if (quizState.locationId) {
    quizState.dismissedLocations.add(quizState.locationId);
  }
  quizState.active = false;
  quizOverlay.classList.remove('active');
}

function renderQuestion() {
  const { locationId, questionIndex } = quizState;
  const question = quizEngine.getQuestion(locationId, questionIndex);

  if (!question) {
    // All questions answered — persist score and show final result
    const score = quizEngine.getScore(locationId);
    ScoreTracker.save(locationId, score);   // persist to localStorage
    dbg(`Score saved: ${locationId} ${score.correct}/${score.total}`);
    renderProgressHUD(_summaryLocations);
    checkAllComplete(_summaryLocations);

    // Submit to API Layer — fire-and-forget, does not block the UI
    fetch('/api/scores', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ locationId, correct: score.correct, total: score.total }),
    })
      .then(r => r.json())
      .then(data => dbg(`API score: ${data.grade} — ${data.badge}`))
      .catch(err => dbg(`API score submit failed: ${err.message}`));

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

// ── Client Layer: Progress HUD ────────────────────────────────────────────────

const progressHud  = document.getElementById('progress-hud');
const hudDotsEl    = progressHud.querySelector('.hud-dots');

/**
 * Rebuild the HUD dots and count from localStorage via ScoreTracker.
 * Called once on init (restores prior session) and after every quiz save.
 * O(n) where n = location count.
 *
 * @param {Array<{id:string, label:string}>} locations
 */
function renderProgressHUD(locations) {
  const completedCount = locations.filter(loc => ScoreTracker.isCompleted(loc.id)).length;

  // Rebuild dot nodes — one coloured dot per location
  hudDotsEl.innerHTML = locations.map(loc => {
    const done = ScoreTracker.isCompleted(loc.id);
    return `<span class="hud-dot${done ? ' done' : ''}" title="${loc.label}"></span>`;
  }).join('');

  // Re-append the count span (innerHTML nuked it)
  const count = document.createElement('span');
  count.className  = 'hud-count';
  count.id         = 'hud-count';
  count.textContent = `${completedCount} / ${locations.length}`;
  hudDotsEl.appendChild(count);

  progressHud.classList.add('visible');
}

// ── Client Layer: Summary Panel ───────────────────────────────────────────────

const summaryPanel      = document.getElementById('summary-panel');
const summaryTotalEl    = document.getElementById('summary-total-score');
const summaryRowsEl     = document.getElementById('summary-rows');
const summaryCloseBtn   = document.getElementById('summary-close');
const summaryResetBtn   = document.getElementById('summary-reset');

let _summaryLocations = []; // set in initScene so reset can re-render HUD

/**
 * If every location has a saved score, open the summary panel.
 * Called after each quiz save. O(n).
 *
 * @param {Array<{id:string, label:string}>} locations
 */
function checkAllComplete(locations) {
  const allDone = locations.every(loc => ScoreTracker.isCompleted(loc.id));
  if (allDone) openSummaryPanel(locations);
}

/**
 * Populate and slide up the summary panel. O(n).
 * @param {Array<{id:string, label:string}>} locations
 */
function openSummaryPanel(locations) {
  const totals = ScoreTracker.getTotals();

  // Headline score
  summaryTotalEl.textContent = `${totals.correct} / ${totals.total} (${totals.percent}%)`;

  // Per-location rows
  summaryRowsEl.innerHTML = locations.map(loc => {
    const record = ScoreTracker.load(loc.id);
    if (!record) return '';
    const scoreClass = record.percent === 100 ? '' : ' partial';
    return `
      <div class="summary-row">
        <span class="summary-row-label">${loc.label}</span>
        <span class="summary-row-score${scoreClass}">${record.correct} / ${record.total} (${record.percent}%)</span>
      </div>`;
  }).join('');

  summaryPanel.classList.add('active');
}

summaryCloseBtn.addEventListener('click', () => {
  summaryPanel.classList.remove('active');
});

summaryResetBtn.addEventListener('click', () => {
  ScoreTracker.clear();
  dbg('Progress reset');
  summaryPanel.classList.remove('active');
  renderProgressHUD(_summaryLocations);
});

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

// ── POI tap-to-quiz ───────────────────────────────────────────────────────────

/**
 * After the A-Frame scene loads, attach click/tap listeners to every POI box
 * and label. Tapping any POI opens its quiz immediately — no GPS proximity needed.
 * This makes the quiz accessible from any location, including during demos.
 */
function attachPOIClickHandlers() {
  document.querySelectorAll('[data-location-id]').forEach(el => {
    el.addEventListener('click', () => {
      const locationId    = el.getAttribute('data-location-id');
      const locationLabel = el.getAttribute('data-location-label');
      if (locationId && locationLabel && !quizState.active) {
        dbg(`POI tapped: ${locationId}`);
        openQuiz(locationId, locationLabel);
      }
    });
  });
}

// ── Init ──────────────────────────────────────────────────────────────────────

async function initScene() {
  const granted = await requestPermissions();
  if (!granted) return;

  dbg('Permissions granted');
  showLoader();

  // Load all data sources in parallel
  const [locations, quizData, topicEdges, assetManifest] = await Promise.all([
    loadLocations(),
    loadQuizData(),
    loadTopics(),
    loadAssetManifest(),
  ]);
  dbg(`Loaded ${locations.length} locations, ${quizData.length} quiz sets`);

  // ── Initialise engines ──────────────────────────────────────────────────────

  // Store locations for progress HUD and summary panel (both need the full list)
  _summaryLocations = locations;

  // SceneSelector: build hash map from location array — O(n) construction
  sceneSelector = new SceneSelector(locations);
  dbg(`SceneSelector ready — ${sceneSelector.size} locations indexed`);

  // Render HUD immediately — restores any saved progress from a prior session
  renderProgressHUD(locations);

  // QuizEngine: build DB + topic graph — O(V+E) construction
  quizEngine = new QuizEngine(quizData, topicEdges);
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
  // ── ProximityManager ────────────────────────────────────────────────────
  // Replaces the inline startTracking / stopTracking + haversine code.
  // Each location's proximityThreshold (from locations.json) is used
  // instead of the old global QUIZ_TRIGGER_RADIUS = 20 constant.
  proximityManager = new ProximityManager(locations, {

    // Fires when the user walks into a location's radius — trigger quiz
    onEnter({ location }) {
      dbg(`Entered proximity: ${location.id} (threshold ${location.proximityThreshold}m)`);
      if (!quizState.active && !quizState.dismissedLocations.has(location.id)) {
        const config = sceneSelector.select(location.id);  // O(1) hash map lookup
        if (config && quizEngine.questionCount(config.id) > 0) {
          openQuiz(config.id, config.label);
        }
      }
    },

    // Fires on every GPS update — refresh the distance label on each AR marker
    onPosition({ distances }) {
      for (const { location, distanceMetres } of distances) {
        dbg(`${location.label}: ${Math.round(distanceMetres)}m`);
        const label = document.querySelector(`#label-${location.id}`);
        if (label) {
          const visited = ScoreTracker.isCompleted(location.id) ? ' ✓' : '';
          label.setAttribute(
            'value',
            `${location.label}${visited}\n${ProximityManager.formatDistance(distanceMetres)}\nTap to quiz`
          );
        }
      }
    },
  });

  scene.addEventListener('loaded', () => {
    dbg('Scene loaded');
    dbg(`gps-camera registered: ${AFRAME.components['gps-camera'] !== undefined}`);
    dbg(`gps-entity-place registered: ${AFRAME.components['gps-entity-place'] !== undefined}`);
    hideLoader();
    proximityManager.start();
    attachPOIClickHandlers();
  });

  scene.addEventListener('error', (e) => dbg(`Scene error: ${e.detail}`));
  window.addEventListener('beforeunload', () => proximityManager.stop());
}

initScene();
