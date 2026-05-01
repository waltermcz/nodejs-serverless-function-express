/**
 * POST /api/markers
 * Saves a generated .patt file to public/assets/markers/ during local development.
 *
 * On Vercel production the filesystem is read-only, so this endpoint returns a
 * 501 and the client falls back to a direct browser download.
 *
 * Body: { name: string, data: string }
 * Response: { success: true, path: string } | { error: string }
 */
const fs = require('fs');
const path = require('path');

module.exports = (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { name, data } = req.body ?? {};

  if (!name || typeof data !== 'string') {
    return res.status(400).json({ error: 'Missing required fields: name, data' });
  }

  // Allow only alphanumeric, hyphens, and underscores to prevent path traversal
  const safeName = name.replace(/[^a-zA-Z0-9_-]/g, '');
  if (!safeName) {
    return res.status(400).json({ error: 'Invalid marker name — use letters, numbers, hyphens, or underscores' });
  }

  const markersDir = path.resolve(__dirname, '..', 'public', 'assets', 'markers');
  const filePath = path.join(markersDir, `${safeName}.patt`);

  // Ensure the resolved path stays inside markersDir (belt-and-suspenders guard)
  if (!filePath.startsWith(markersDir + path.sep) && filePath !== markersDir) {
    return res.status(400).json({ error: 'Invalid path' });
  }

  try {
    fs.writeFileSync(filePath, data, 'utf8');
    res.status(200).json({ success: true, path: `/assets/markers/${safeName}.patt` });
  } catch (err) {
    // Production Vercel: read-only filesystem — tell the client to use the download fallback
    if (err.code === 'EROFS' || err.code === 'EACCES') {
      return res.status(501).json({ error: 'filesystem_readonly' });
    }
    console.error('[api/markers] write failed:', err);
    res.status(500).json({ error: 'Failed to save marker file' });
  }
};
