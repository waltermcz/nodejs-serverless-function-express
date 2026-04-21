/**
 * ScoreTracker — Engine Layer
 *
 * Persists quiz scores to localStorage so progress survives page refreshes.
 * The storage schema is defined as a contract in public/data/scores.json.
 *
 * Design decision: all methods are static.
 * ScoreTracker has no mutable instance state — it is a thin persistence
 * adapter over a single localStorage key. Static methods keep call-sites
 * clean (ScoreTracker.save(...) vs new ScoreTracker().save(...)) and make
 * the stateless intent explicit.
 *
 * Data structures
 *  localStorage['campus-ar-scores']  JSON array of ScoreRecord objects
 *  Parsed in memory as               Array<ScoreRecord> (small, ≤ n locations)
 *
 * Big-O summary (n = number of persisted score records, ≤ campus POI count)
 *  save(locationId, score)  → O(n) — scan to find existing record, then write
 *  load(locationId)         → O(n) — linear scan of small array
 *  loadAll()                → O(n) — JSON.parse + return
 *  clear()                  → O(1) — single localStorage.removeItem
 *  isCompleted(locationId)  → O(n) — delegates to load()
 *
 * Schema (matches scores.json contract)
 * {
 *   locationId:  string  — matches id in locations.json
 *   correct:     number  — questions answered correctly
 *   total:       number  — questions attempted
 *   percent:     number  — correct / total * 100, rounded
 *   completedAt: string  — ISO 8601 timestamp of last save
 * }
 */
export class ScoreTracker {
  static STORAGE_KEY = 'campus-ar-scores';

  // ── Write ─────────────────────────────────────────────────────────────────

  /**
   * Persist a score for a location.
   * Overwrites any previous record for the same locationId. O(n).
   *
   * @param {string} locationId
   * @param {{ correct: number, total: number, percent: number }} score
   */
  static save(locationId, { correct, total, percent }) {
    const all    = ScoreTracker.loadAll();
    const record = {
      locationId,
      correct,
      total,
      percent,
      completedAt: new Date().toISOString(),
    };

    const idx = all.findIndex(r => r.locationId === locationId);
    if (idx >= 0) {
      all[idx] = record;   // update existing
    } else {
      all.push(record);    // new entry
    }

    localStorage.setItem(ScoreTracker.STORAGE_KEY, JSON.stringify(all));
  }

  // ── Read ──────────────────────────────────────────────────────────────────

  /**
   * Load the persisted score for one location.
   * Returns null if the user has not yet attempted this location. O(n).
   *
   * @param {string} locationId
   * @returns {ScoreRecord|null}
   */
  static load(locationId) {
    return ScoreTracker.loadAll().find(r => r.locationId === locationId) ?? null;
  }

  /**
   * Load all persisted score records. Returns [] if storage is empty. O(n).
   * @returns {ScoreRecord[]}
   */
  static loadAll() {
    try {
      return JSON.parse(localStorage.getItem(ScoreTracker.STORAGE_KEY) ?? '[]');
    } catch {
      // Corrupted storage — treat as empty rather than crashing
      return [];
    }
  }

  // ── Utility ───────────────────────────────────────────────────────────────

  /**
   * Returns true if the user has a saved score for this location. O(n).
   * Useful for rendering "visited" badges on POI labels.
   */
  static isCompleted(locationId) {
    const record = ScoreTracker.load(locationId);
    return record !== null && record.total > 0;
  }

  /**
   * Aggregate totals across all persisted locations. O(n).
   * @returns {{ correct: number, total: number, percent: number, locationCount: number }}
   */
  static getTotals() {
    const all = ScoreTracker.loadAll();
    let correct = 0, total = 0;
    for (const r of all) {
      correct += r.correct;
      total   += r.total;
    }
    return {
      correct,
      total,
      percent: total === 0 ? 0 : Math.round((correct / total) * 100),
      locationCount: all.length,
    };
  }

  /**
   * Erase all stored scores. Useful for testing / user-initiated reset. O(1).
   */
  static clear() {
    localStorage.removeItem(ScoreTracker.STORAGE_KEY);
  }
}

/**
 * @typedef {{
 *   locationId:  string,
 *   correct:     number,
 *   total:       number,
 *   percent:     number,
 *   completedAt: string
 * }} ScoreRecord
 */
