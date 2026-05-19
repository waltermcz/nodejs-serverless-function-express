# Campus Sustainability AR

An augmented reality web app that lets students explore campus sustainability initiatives through their phone camera. Built with AR.js, A-Frame, Three.js, and deployed on Vercel.

---

## What's Built

### Experiences

| Experience | Path | Description |
|---|---|---|
| **Marker AR** | `/marker` | Point a camera at a printed `.patt` marker to reveal a 3D sustainability overlay (solar panels, recycling data, etc.) |
| **Campus Location AR** | `/location` | GPS-anchored AR — walk near a campus POI and a 3D model + info card appear via AR.js location-based mode |
| **Phenology Walk** | `/phenology` | Split-view portal showing Central Park today vs. 2050; Three.js particle systems (blossoms, leaves) render above a live camera feed, with device-orientation parallax |
| **Marker Creator** | `/marker-creator` | 3-step in-browser tool: capture photo → quality-validate → generate a `.patt` file; downloads locally or saves via API |
| **Memory Anchors** | — | GPS-pinned notes across campus — stub/in progress |

### Engine Layer (`public/src/`)

- **`ProximityManager.js`** — wraps `navigator.geolocation.watchPosition`; fires `onEnter`/`onExit` callbacks when the user crosses each POI's individual `proximityThreshold` radius (Haversine distance, O(n) per GPS tick)
- **`QuizEngine.js`** — Map-backed quiz engine with per-location scoring, BFS topic-graph traversal to surface related sustainability concepts, and first-attempt-only scoring
- **`ScoreTracker.js`** — persistent score store across sessions
- **`SceneSelector.js`** — routing helper between experiences
- **`AssetLoader.js`** — preloads GLB models and textures
- **`markers/`** — `marker-validator.js` (image quality checks), `pattern-generator.js` (canvas-to-.patt conversion), `marker-objects.js`

### API (`api/`)

| Route | Method | Purpose |
|---|---|---|
| `/api/markers` | POST | Save a generated `.patt` file to disk (dev only; returns `501` on Vercel where the FS is read-only — client falls back to browser download) |
| `/api/locations` | GET | Serve `locations.json` |
| `/api/quiz` | GET | Serve `quiz.json` |
| `/api/scores` | GET/POST | Read/write `scores.json` |

### Data (`public/data/`)

- **`locations.json`** — 4 campus POIs with GPS coords, `proximityThreshold`, model URL, and sustainability copy
- **`quiz.json`** — per-location multiple-choice questions with explanations
- **`topics.json`** — edge list for the BFS topic graph (solar-energy → renewable-energy → ev-charging…)
- **`phenology.json`** — waypoint definitions for the Phenology Walk
- **`assets.json`** / **`scores.json`** — asset manifest and score persistence

### Room Wrapper (`room-wrapper/`)

A separate Three.js + TypeScript portfolio scene (baked GLB room with monitor screen, coffee steam particles, galaxy/tunnel shader experiences). Uses Webpack, React UI components, and Draco-compressed models. Not part of the AR flow — it's a standalone 3-D room scene bundled independently.

---

## Local Development

```bash
npm i -g vercel
vercel dev        # serves both /api routes and /public at localhost:3000
```

The Marker Creator's "Save to project" button writes `.patt` files to `public/assets/markers/` during local dev. On Vercel it returns a 501 and the browser download fallback fires automatically.

---

## How to Improve

### Short term

- **Replace placeholder GPS coords** — `locations.json` uses Brooklyn coordinates (`40.697…, -73.916…`). Update to your actual campus POIs.
- **Add real GLB models** — `modelUrl` fields in `locations.json` point to paths like `/assets/models/solar-panel.glb` that don't exist yet. Create or source low-poly models and drop them in `public/assets/models/`.
- **Wire up Memory Anchors** — the card on the home screen is marked "In Progress". The `ProximityManager` and API skeleton are already in place; the main work is the UI for creating and reading anchors.
- **Persist scores server-side** — `scores.json` is a flat file. For multi-user use, replace it with a database (Vercel KV, PlanetScale, Supabase, etc.).
- **Expand the quiz** — `quiz.json` has minimal questions. Add more per location with varied `topic` values to enrich the BFS graph traversal.

### Medium term

- **User accounts / leaderboard** — add auth (Clerk, NextAuth) so quiz scores are tied to a student ID and can be displayed publicly.
- **Admin panel for markers** — right now new `.patt` files require local dev or a manual upload. A simple password-protected page backed by Vercel Blob storage would let campus staff add markers without touching code.
- **Improve GPS accuracy** — `ProximityManager` uses raw `watchPosition`. On Android, GPS jitter can cause false enter/exit events. Add a dead-band filter: only fire `onExit` if the user has been outside the radius for ≥ 3 consecutive readings.
- **Offline support** — cache `locations.json`, `quiz.json`, and GLB assets in a Service Worker so the app works when campus Wi-Fi is spotty.
- **Accessibility** — AR canvas experiences have no screen-reader path. Add ARIA live regions for quiz feedback and proximity alerts.

### Longer term

- **Real phenology data** — the Phenology Walk copy is placeholder. Partner with a biology or environmental studies department to source actual plant observation data.
- **Multi-campus support** — abstract `locations.json` into a campus ID parameter so the same codebase can serve multiple schools.
- **Native app wrapper** — wrap with Capacitor or Expo to get better camera access, push notifications for "you're near a sustainability spot!", and App Store distribution.

---

## Suggestions

- **Marker quality** — AR.js marker tracking degrades badly on glossy or low-contrast prints. Print markers at ≥ 10 cm, matte finish, high contrast. The built-in `marker-validator.js` scores images before generating `.patt` files — surface that score to the person printing.
- **Coordinate system** — AR.js location-based mode uses the device compass, which is unreliable indoors and near metal. For indoor installations, use marker-based AR instead of GPS.
- **Three.js version pinning** — `phenology/scene.js` imports Three.js `r165` from a CDN. Pin the version in a local `package.json` and bundle it to avoid breaking changes from CDN updates.
- **`.patt` file storage** — the Vercel read-only FS means generated markers are never persisted in production. Consider storing them in [Vercel Blob](https://vercel.com/docs/storage/vercel-blob) and serving them from there.

---

## Key Documentation & Examples

### AR.js
- [AR.js Documentation](https://ar-js-org.github.io/AR.js-Docs/) — official docs covering marker-based, location-based, and image-tracking modes
- [AR.js GitHub](https://github.com/AR-js-org/AR.js) — source, issues, and community examples
- [Location-Based AR tutorial](https://ar-js-org.github.io/AR.js-Docs/location-based/) — the pattern used in `/location`

### A-Frame
- [A-Frame docs](https://aframe.io/docs/) — component system, primitives, entity-component-system architecture
- [A-Frame School](https://aframe.io/aframe-school/) — interactive beginner tutorials

### Three.js
- [Three.js docs](https://threejs.org/docs/) — reference for the renderer, geometries, and shaders used in the Phenology Walk and room-wrapper
- [Three.js Journey](https://threejs-journey.com/) — the course the room-wrapper scene pattern is based on
- [Three.js examples](https://threejs.org/examples/) — live demos for particles, shaders, and post-processing

### AR Marker Tools
- [AR.js Marker Training](https://ar-js-org.github.io/AR.js/three.js/examples/marker-training/examples/generator.html) — official online `.patt` generator (what `pattern-generator.js` replicates locally)
- [Hiro / Kanji reference markers](https://github.com/artoolkit/artoolkit5/tree/master/doc/patterns) — standard test patterns for AR.js

### Vercel
- [Vercel Serverless Functions](https://vercel.com/docs/functions/serverless-functions) — how the `api/` routes work
- [Vercel Blob storage](https://vercel.com/docs/storage/vercel-blob) — recommended path for persisting generated `.patt` files in production
- [Vercel KV](https://vercel.com/docs/storage/vercel-kv) — Redis-compatible KV store for replacing `scores.json`

### Phenology / Environmental Data
- [USA National Phenology Network](https://www.usanpn.org/data) — real plant observation data that could back the Phenology Walk
- [NOAA Climate Data](https://www.ncei.noaa.gov/access/search/index) — temperature and precipitation projections for 2050 scenarios

---

## Project Structure

```
/
├── api/                    # Vercel serverless functions
│   ├── markers.js          # POST — save .patt file (dev only)
│   ├── locations.js        # GET  — campus POI data
│   ├── quiz.js             # GET  — quiz questions
│   └── scores.js           # GET/POST — score persistence
├── public/
│   ├── index.html          # Home screen with experience cards
│   ├── marker/             # AR.js marker-based AR experience
│   ├── location/           # AR.js GPS location-based AR experience
│   ├── phenology/          # Three.js + camera Phenology Walk
│   ├── marker-creator/     # .patt file generation tool
│   ├── src/
│   │   ├── ProximityManager.js   # GPS proximity engine
│   │   ├── QuizEngine.js         # Quiz + BFS topic graph
│   │   ├── ScoreTracker.js
│   │   ├── SceneSelector.js
│   │   ├── AssetLoader.js
│   │   └── markers/              # Validator + pattern generator
│   └── data/
│       ├── locations.json        # Campus POI definitions
│       ├── quiz.json             # Quiz questions per location
│       └── topics.json           # BFS topic graph edges
└── room-wrapper/           # Standalone Three.js room scene (separate bundle)
```
