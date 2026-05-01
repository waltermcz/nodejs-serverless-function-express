/**
 * GET /api/locations
 *
 * API Layer — serves campus sustainability POI data.
 * Reads from the canonical data source (public/data/locations.json) so the
 * client and the API always stay in sync — there is exactly one source of
 * truth for location data.
 *
 * Query parameters
 *   ?fields=id,label,lat,lng   Comma-separated field projection.
 *                              Returns only the requested fields per location.
 *                              Omit to receive the full object.
 *
 * Examples
 *   GET /api/locations
 *   GET /api/locations?fields=id,label,lat,lng,color
 *
 * Response
 *   200 { locations: Location[], count: number }
 *   500 { error: string }
 *
 * Big-O
 *   Reading JSON file:          O(n)  — n = number of locations
 *   Field projection (if used): O(n * f)  — f = number of requested fields
 */

const fs   = require('fs');
const path = require('path');

const LOCATIONS_PATH = path.join(__dirname, '..', 'public', 'data', 'locations.json');

module.exports = (req, res) => {
  // Only GET is supported
  if (req.method !== 'GET') {
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  let locations;
  try {
    locations = JSON.parse(fs.readFileSync(LOCATIONS_PATH, 'utf8'));
  } catch (err) {
    console.error('[api/locations] Failed to read data file:', err.message);
    return res.status(500).json({ error: 'Could not load location data' });
  }

  // ── Optional field projection ────────────────────────────────────────────
  // ?fields=id,label,lat,lng returns only those keys per location.
  // Allows the client to request a lightweight payload when full details
  // are not needed (e.g. building the proximity manager on the server).
  const { fields } = req.query;
  if (fields) {
    const allowed = new Set(fields.split(',').map(f => f.trim()).filter(Boolean));
    locations = locations.map(loc =>
      Object.fromEntries(
        Object.entries(loc).filter(([key]) => allowed.has(key))
      )
    );
  }

  // Cache for 60 seconds — location data changes infrequently
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate');
  res.setHeader('Content-Type', 'application/json');

  return res.status(200).json({
    locations,
    count: locations.length,
  });
};
