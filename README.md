# Campus Sustainability AR

An augmented reality web app that lets students explore campus sustainability initiatives through their phone camera. Built with AR.js, A-Frame, Three.js, and deployed on Vercel.

---

## What's Built

### Experiences

| Experience | Path | Description |
|---|---|---|
| **Marker AR** | `/marker` | Point a camera at a printed `.patt` marker to reveal a 3D sustainability overlay (solar panels, recycling data, etc.) |
| **Campus Location AR** | `/location` | GPS-anchored AR — walk near a campus POI and a 3D model + info card appear via AR.js location-based mode |
| **CubeMap 180** | `/CubeMap` | Unfinished feature. Trying creating a room like the room-wrapper however since of plain white walls the material would be a 180 degree view somewhere in campus |
| **Marker Creator** | `/marker-creator` | 3-step in-browser tool: capture photo → quality-validate → generate a `.patt` file; downloads locally or saves via API |


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

A suggestion I have is focusing more on creating rooms like this. The reason being simplicity and the potiential of creating appealing UX/UI scenes. The way we will smooth from one scene to another will be based on transitions or animations.

---

## Local Development

### Prerequisites

- [Node.js](https://nodejs.org/) v18+
- [Vercel CLI](https://vercel.com/docs/cli): `npm i -g vercel`

### First-time setup

1. Clone the repo and install root dependencies:
   ```bash
   git clone <repo-url>
   cd nodejs-serverless-function-express
   npm install
   ```

2. Link the project to **your own** Vercel account:
   ```bash
   vercel link
   ```
   Follow the prompts — log in, pick your team/personal scope, and either create a new project or link to an existing one. This writes `.vercel/project.json` with your project ID and **auto-generates `.env.local`** with your personal `VERCEL_OIDC_TOKEN`.

3. Start the local dev server:
   ```bash
   vercel dev
   ```
   This serves both the `/api` serverless routes and the `public/` static files at `http://localhost:3000`.

### `.env.local` explained

`.env.local` is created automatically by the Vercel CLI — you should never need to edit it manually. It contains a short-lived `VERCEL_OIDC_TOKEN` used for local auth against the Vercel platform. It is gitignored and **must not be committed or shared**.

If the token expires or you see auth errors, run `vercel link` again to refresh it.

### Deploying to your own Vercel account

```bash
vercel          # preview deployment
vercel --prod   # production deployment
```

Or push to the `main` branch — if you connected your GitHub repo to Vercel during `vercel link`, every push auto-deploys.

> **Note:** The `POST /api/markers` endpoint that saves `.patt` files cannot write to disk on Vercel's read-only production filesystem. The Marker Creator will automatically fall back to a browser download in that case.

---

## Room Wrapper (Standalone Three.js Scene)

The `room-wrapper/` directory is a fully independent Three.js + TypeScript scene. It has its own `package.json` and Webpack build — install and run it separately from the main project.

```bash
cd room-wrapper
npm install
npm run dev     # webpack-dev-server, hot reload at http://localhost:8080 (or next free port)
```

For a production build:

```bash
npm run build   # outputs to room-wrapper/dist/
```

The dev server picks an available port automatically using `portfinder-sync`, so if 8080 is busy it will move up. Check the terminal output for the exact URL.

**What it contains:**
- Baked GLB room (computer, decor, environment) rendered with Three.js r137
- Interactive monitor screen with video texture layers and cursor simulation
- Coffee steam particle system (custom GLSL shaders)
- Galaxy and Tunnel shader experiences triggered from the room UI
- Spatial audio (office ambience, keyboard/mouse SFX, radio tracks)
- React UI overlay (loading screen, mute toggle, free-cam toggle, info overlay)

The room-wrapper does **not** connect to the Vercel API routes — it is self-contained and can be deployed independently (e.g., to a separate Vercel project or any static host after `npm run build`).

---

## How to Improve

### Short term

- **Replace placeholder GPS coords** — `locations.json` uses Brooklyn coordinates (`40.697…, -73.916…`). Update to your actual campus POIs. (I have had trouble with this feature, I suggest working on the cubemap feature first or settle with a QR scan, both more focused on modeling than code)
- **Add real GLB models** — `modelUrl` fields in `locations.json` point to paths like `/assets/models/solar-panel.glb` that don't exist yet. Create or source low-poly models and drop them in `public/assets/models/`.
- **Wire up Memory Anchors** — the card on the home screen is marked "In Progress". The `ProximityManager` and API skeleton are already in place; the main work is the UI for creating and reading anchors.
- **Persist scores server-side** — `scores.json` is a flat file. For multi-user use, replace it with a database if needed (Vercel KV, PlanetScale, Supabase, etc.).
- **Expand the quiz** — `quiz.json` has minimal questions. Add more per location with varied `topic` values to enrich the BFS graph traversal.

### Medium term

- **User accounts / leaderboard** — add auth (Clerk, NextAuth) so quiz scores are tied to a student ID and can be displayed publicly. (low priority)
- **Admin panel for markers** — right now new `.patt` files require local dev or a manual upload. A simple password-protected page backed by Vercel Blob storage would let campus staff add markers without touching code.
- **Improve GPS accuracy** — `ProximityManager` uses raw `watchPosition`. On Android, GPS jitter can cause false enter/exit events. Add a dead-band filter: only fire `onExit` if the user has been outside the radius for ≥ 3 consecutive readings.
- **Offline support** — cache `locations.json`, `quiz.json`, and GLB assets in a Service Worker so the app works when campus Wi-Fi is spotty.
- **Accessibility** — AR canvas experiences have no screen-reader path. Add ARIA live regions for quiz feedback and proximity alerts.


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
