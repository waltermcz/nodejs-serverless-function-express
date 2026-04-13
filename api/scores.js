/**
 * POST /api/scores   — submit a quiz score
 * GET  /api/scores   — retrieve aggregate stats for the current session
 *
 * API Layer — score submission and validation endpoint.
 *
 * POST validates the incoming payload against the scores.json schema,
 * cross-checks the locationId against locations.json (so invalid IDs are
 * rejected), computes a grade and badge, then returns the enriched record.
 *
 * In-memory leaderboard:
 *   Vercel serverless instances can be reused ("warm starts"), so the
 *   module-level Map acts as a best-effort session leaderboard. It is not
 *   durable across cold starts. In a production system this would be
 *   replaced by a database write (e.g. Vercel KV, Postgres, Redis).
 *   The architecture is identical — only the storage back-end changes.
 *
 * POST body (JSON)
 *   { locationId: string, correct: number, total: number }
 *
 * POST response
 *   201 { record: ScoreRecord, grade: string, badge: string, message: string }
 *   400 { error: string }     — validation failure
 *   404 { error: string }     — unknown locationId
 *   500 { error: string }
 *
 * GET response
 *   200 { scores: ScoreRecord[], totals: { correct, total, percent, locationCount } }
 *
 * Big-O
 *   POST validation:      O(n) — scan locations array to verify locationId
 *   GET aggregate:        O(n) — iterate leaderboard Map
 */

const fs   = require('fs');
const path = require('path');

const LOCATIONS_PATH = path.join(__dirname, '..', 'public', 'data', 'locations.json');

// ── In-memory leaderboard ────────────────────────────────────────────────────
// Map<locationId, ScoreRecord>  — most recent submission per location.
// Module-level so it persists across warm invocations within the same instance.
const leaderboard = new Map();

// ── Grade / badge helpers ─────────────────────────────────────────────────────

/**
 * Convert a percentage to a letter grade.
 * @param {number} percent  0–100
 * @returns {string}
 */
function computeGrade(percent) {
  if (percent === 100) return 'A+';
  if (percent >= 90)   return 'A';
  if (percent >= 80)   return 'B';
  if (percent >= 70)   return 'C';
  if (percent >= 60)   return 'D';
  return 'F';
}

/**
 * Award a sustainability-themed badge based on score.
 * @param {number} percent
 * @returns {string}
 */
function computeBadge(percent) {
  if (percent === 100) return 'Sustainability Champion';
  if (percent >= 75)   return 'Eco Advocate';
  if (percent >= 50)   return 'Green Learner';
  return 'Campus Explorer';
}

// ── Request handler ───────────────────────────────────────────────────────────

module.exports = (req, res) => {
  res.setHeader('Content-Type', 'application/json');

  // ── GET — return session leaderboard ─────────────────────────────────────
  if (req.method === 'GET') {
    const scores = Array.from(leaderboard.values());
    let correct = 0, total = 0;
    for (const r of scores) { correct += r.correct; total += r.total; }
    return res.status(200).json({
      scores,
      totals: {
        correct,
        total,
        percent: total === 0 ? 0 : Math.round((correct / total) * 100),
        locationCount: scores.length,
      },
    });
  }

  // ── POST — validate and record a score ───────────────────────────────────
  if (req.method === 'POST') {
    const { locationId, correct, total } = req.body ?? {};

    // ── Input validation ─────────────────────────────────────────────────
    if (!locationId || typeof locationId !== 'string') {
      return res.status(400).json({ error: 'locationId is required and must be a string' });
    }
    if (typeof correct !== 'number' || typeof total !== 'number') {
      return res.status(400).json({ error: 'correct and total must be numbers' });
    }
    if (correct < 0 || total < 0) {
      return res.status(400).json({ error: 'correct and total must be non-negative' });
    }
    if (correct > total) {
      return res.status(400).json({ error: 'correct cannot exceed total' });
    }
    if (total === 0) {
      return res.status(400).json({ error: 'total must be greater than 0' });
    }

    // ── Cross-check locationId against the data layer ────────────────────
    // Ensures the API rejects submissions for locations that don't exist.
    let locations;
    try {
      locations = JSON.parse(fs.readFileSync(LOCATIONS_PATH, 'utf8'));
    } catch (err) {
      console.error('[api/scores] Failed to read locations file:', err.message);
      return res.status(500).json({ error: 'Could not validate location data' });
    }

    const locationExists = locations.some(loc => loc.id === locationId);
    if (!locationExists) {
      return res.status(404).json({
        error: `Unknown locationId "${locationId}". Valid IDs: ${locations.map(l => l.id).join(', ')}`,
      });
    }

    // ── Build and store the record ────────────────────────────────────────
    const percent = Math.round((correct / total) * 100);
    const record  = {
      locationId,
      correct,
      total,
      percent,
      completedAt: new Date().toISOString(),
    };
    leaderboard.set(locationId, record);

    const grade  = computeGrade(percent);
    const badge  = computeBadge(percent);
    const message = percent === 100
      ? 'Perfect score — well done!'
      : `You got ${correct} of ${total} right. Keep exploring!`;

    return res.status(201).json({ record, grade, badge, message });
  }

  // ── Other methods ─────────────────────────────────────────────────────────
  return res.status(405).json({ error: `Method ${req.method} not allowed` });
};
