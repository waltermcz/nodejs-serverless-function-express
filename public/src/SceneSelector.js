/**
 * SceneSelector — Requirement 2 core component
 *
 * Maps location IDs to their full scene configuration using a JavaScript Map
 * (hash map). Every lookup is O(1) average-case, regardless of how many campus
 * locations are registered. An alternative linear search through an array would
 * be O(n) per lookup and degrade as new POIs are added.
 *
 * Hash map chosen over:
 *  - Array.find()   → O(n) per lookup; poor as dataset grows
 *  - switch/if-else → O(n) worst-case; requires code changes per new location
 *  - Object literal → works, but Map preserves insertion order, supports any
 *                     key type, and exposes size/iteration APIs natively
 *
 * Big-O summary
 *  select(id)          → O(1) average, O(n) worst (hash collision, rare)
 *  register(location)  → O(1) average
 *  getNearest(lat,lng) → O(n) — must compare all entries; no spatial index
 *  all()               → O(n) — iterator over every entry
 */
export class SceneSelector {
  /** @param {Array<{id:string, lat:number, lng:number, [key:string]:any}>} locations */
  constructor(locations = []) {
    // _map: locationId (string) → full location config object
    this._map = new Map();
    for (const loc of locations) {
      this._map.set(loc.id, loc);
    }
  }

  // ── CRUD ──────────────────────────────────────────────────────────────────

  /**
   * Register a new location at runtime (e.g. fetched from an API).
   * O(1) average.
   */
  register(location) {
    if (!location?.id) throw new Error('SceneSelector.register: location must have an id');
    this._map.set(location.id, location);
  }

  /**
   * Remove a location by id. O(1) average.
   * @returns {boolean} true if an entry was removed
   */
  deregister(id) {
    return this._map.delete(id);
  }

  // ── Queries ───────────────────────────────────────────────────────────────

  /**
   * O(1) hash map lookup — the core algorithm for this component.
   * Returns the scene config, or null if the id is not registered.
   * @param {string} id
   * @returns {object|null}
   */
  select(id) {
    return this._map.get(id) ?? null;
  }

  /**
   * Returns true if a location id is registered. O(1) average.
   */
  has(id) {
    return this._map.has(id);
  }

  /**
   * Linear scan to find the nearest registered location to (userLat, userLng).
   * O(n) — unavoidable without a spatial index (k-d tree), which is overkill
   * for ≤ 20 campus POIs.
   *
   * @param {number} userLat
   * @param {number} userLng
   * @returns {{ location: object, distanceMetres: number }|null}
   */
  getNearest(userLat, userLng) {
    let nearest = null;
    let minDist = Infinity;

    for (const loc of this._map.values()) {
      const d = haversine(userLat, userLng, loc.lat, loc.lng);
      if (d < minDist) {
        minDist = d;
        nearest = loc;
      }
    }

    return nearest ? { location: nearest, distanceMetres: minDist } : null;
  }

  /**
   * Returns all registered locations sorted by distance from (userLat, userLng).
   * Useful for rendering a proximity-ordered list in the UI.
   * O(n log n) — dominated by the sort.
   */
  getAllSortedByDistance(userLat, userLng) {
    return [...this._map.values()]
      .map(loc => ({
        location: loc,
        distanceMetres: haversine(userLat, userLng, loc.lat, loc.lng),
      }))
      .sort((a, b) => a.distanceMetres - b.distanceMetres);
  }

  /** Number of registered locations. O(1). */
  get size() {
    return this._map.size;
  }

  /** Iterate all registered location configs. O(n). */
  all() {
    return this._map.values();
  }
}

// ── Haversine helper (kept internal to this module) ───────────────────────────

/**
 * Great-circle distance between two GPS coordinates, in metres.
 * Used only by SceneSelector; haversineDistance in scene.js handles display.
 */
function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = d => d * (Math.PI / 180);
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
