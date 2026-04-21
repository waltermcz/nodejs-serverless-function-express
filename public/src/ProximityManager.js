/**
 * ProximityManager — Engine Layer
 *
 * Wraps the browser Geolocation API and fires callbacks when the user
 * enters or exits the proximity radius of a known campus location.
 *
 * Key improvement over the inline GPS code in scene.js:
 *   Each location's `proximityThreshold` (metres) is read directly from
 *   locations.json rather than using a single global QUIZ_TRIGGER_RADIUS
 *   constant. This lets each POI have a physically appropriate trigger zone
 *   (e.g., the large campus garden at 30 m vs. the tight EV bay at 20 m).
 *
 * Data structures
 *  _locations  Map<locationId, location>  — O(1) lookup per POI
 *  _inside     Set<locationId>            — O(1) enter/exit state check
 *
 * Algorithm: linear scan over all locations per GPS update — O(n).
 * n ≤ ~20 campus POIs so the constant factor is irrelevant in practice.
 *
 * Big-O summary
 *  start() / stop()     → O(1)
 *  nearest(lat, lng)    → O(n) — full scan to find closest POI
 *  distanceTo(...)      → O(1) — Haversine formula
 *  _handlePosition(...) → O(n) — checks every POI each GPS update
 */
export class ProximityManager {
  /**
   * @param {Array<{id:string, lat:number, lng:number, proximityThreshold?:number}>} locations
   * @param {{
   *   onEnter?:    (event: ProximityEvent) => void,
   *   onExit?:     (event: ProximityEvent) => void,
   *   onPosition?: (event: PositionEvent)  => void,
   * }} callbacks
   */
  constructor(locations, { onEnter, onExit, onPosition } = {}) {
    // O(n) construction — Map for O(1) per-location lookup thereafter
    this._locations  = new Map(locations.map(loc => [loc.id, loc]));
    this._onEnter    = onEnter    ?? (() => {});
    this._onExit     = onExit     ?? (() => {});
    this._onPosition = onPosition ?? (() => {});

    // Tracks which locationIds the user is currently inside — O(1) membership
    this._inside  = new Set();
    this._watchId = null;
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  /** Start watching GPS. Safe to call multiple times — will not double-start. */
  start() {
    if (this._watchId !== null || !navigator.geolocation) return;
    this._watchId = navigator.geolocation.watchPosition(
      pos => this._handlePosition(pos),
      err => console.warn('[ProximityManager] GPS error:', err.code, err.message),
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 10000 }
    );
  }

  /** Stop watching GPS and release the watch handle. */
  stop() {
    if (this._watchId !== null) {
      navigator.geolocation.clearWatch(this._watchId);
      this._watchId = null;
    }
  }

  // ── Static helpers ────────────────────────────────────────────────────────

  /**
   * Great-circle distance between two GPS coordinates using the Haversine
   * formula. Returns metres. O(1).
   *
   * Accuracy: < 0.1% error for distances under ~500 km — more than
   * sufficient for campus-scale proximity checks.
   */
  static distanceTo(lat1, lng1, lat2, lng2) {
    const R = 6_371_000; // Earth's mean radius in metres
    const toRad = d => d * (Math.PI / 180);
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  /** Human-readable distance string. O(1). */
  static formatDistance(metres) {
    return metres < 1000
      ? `${Math.round(metres)}m away`
      : `${(metres / 1000).toFixed(1)}km away`;
  }

  // ── Instance methods ──────────────────────────────────────────────────────

  /**
   * Find the nearest location to a given GPS coordinate. O(n).
   * @returns {{ location, distanceMetres } | null}
   */
  nearest(lat, lng) {
    let best = null;
    let bestDist = Infinity;
    for (const loc of this._locations.values()) {
      const d = ProximityManager.distanceTo(lat, lng, loc.lat, loc.lng);
      if (d < bestDist) { bestDist = d; best = loc; }
    }
    return best ? { location: best, distanceMetres: bestDist } : null;
  }

  /**
   * Snapshot of which locationIds the user is currently inside. O(1).
   * Returns a new Set so callers cannot mutate internal state.
   */
  get insideLocations() {
    return new Set(this._inside);
  }

  // ── Private ───────────────────────────────────────────────────────────────

  /**
   * Called on every GPS update. O(n) — iterates all locations.
   * Fires onEnter / onExit when the user crosses a threshold boundary,
   * and always fires onPosition so callers can update distance labels.
   */
  _handlePosition(position) {
    const { latitude: userLat, longitude: userLng } = position.coords;

    // Collect distance data for all locations so onPosition can use it
    const distances = [];

    for (const loc of this._locations.values()) {
      const distanceMetres = ProximityManager.distanceTo(userLat, userLng, loc.lat, loc.lng);
      // Use per-location threshold; fall back to 20 m if field is missing
      const threshold = loc.proximityThreshold ?? 20;
      const wasInside = this._inside.has(loc.id);
      const isInside  = distanceMetres <= threshold;

      // ── Enter event ──────────────────────────────────────────────────────
      if (isInside && !wasInside) {
        this._inside.add(loc.id);
        this._onEnter({ location: loc, distanceMetres, userLat, userLng });
      }

      // ── Exit event ───────────────────────────────────────────────────────
      if (!isInside && wasInside) {
        this._inside.delete(loc.id);
        this._onExit({ location: loc, distanceMetres, userLat, userLng });
      }

      distances.push({ location: loc, distanceMetres });
    }

    // Always fire onPosition so callers can update AR label text etc.
    this._onPosition({ userLat, userLng, distances });
  }
}

/**
 * @typedef {{ location: object, distanceMetres: number, userLat: number, userLng: number }} ProximityEvent
 * @typedef {{ userLat: number, userLng: number, distances: Array<{location: object, distanceMetres: number}> }} PositionEvent
 */
