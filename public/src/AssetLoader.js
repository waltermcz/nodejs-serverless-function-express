/**
 * AssetLoader — Requirement 2 core component
 *
 * Loads 3D models and textures in priority order using a min-heap priority
 * queue. Lower priority numbers load first (priority 1 = most urgent).
 *
 * Why a priority queue instead of loading everything at once?
 *  - The closest POI's model should load before models the user can't see yet.
 *  - A plain array with .sort() on every insert is O(n log n); the heap keeps
 *    insert and extract both at O(log n).
 *  - A Map cache ensures each URL is fetched exactly once across the session.
 *
 * Priority queue chosen over:
 *  - FIFO queue (Array.push/shift) → no way to prioritise urgent assets
 *  - Sorted array re-sort on insert → O(n log n) insert vs O(log n) heap
 *  - fetch-all-at-once → wastes bandwidth on assets never viewed
 *
 * Big-O summary (n = items in queue)
 *  enqueue()     → O(log n) — heap sift-up
 *  dequeue()     → O(log n) — heap sift-down (extractMin)
 *  peek()        → O(1)
 *  cache lookup  → O(1) — Map.get
 *  preloadAll()  → O(n log n) — n dequeues × log n each
 */
export class AssetLoader {
  constructor() {
    this._heap  = new MinHeap();           // priority queue
    this._cache = new Map();               // url → loaded Blob URL
    this._inflight = new Set();            // urls currently fetching
    this._listeners = new Map();           // url → [resolve callbacks]
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /**
   * Add an asset to the load queue.
   * If already cached, resolves immediately.
   * If already in-flight, returns a promise that resolves when it lands.
   *
   * @param {{ url: string, priority: number, type: 'model'|'texture'|'audio', label: string }} asset
   * @returns {Promise<string>} resolves to a usable Blob URL
   */
  enqueue(asset) {
    const { url } = asset;

    // Cache hit — O(1)
    if (this._cache.has(url)) {
      return Promise.resolve(this._cache.get(url));
    }

    // Already in-flight — queue a callback instead of starting a duplicate fetch
    if (this._inflight.has(url)) {
      return new Promise(resolve => {
        if (!this._listeners.has(url)) this._listeners.set(url, []);
        this._listeners.get(url).push(resolve);
      });
    }

    // New asset — insert into min-heap, O(log n)
    this._heap.insert(asset);

    return new Promise(resolve => {
      if (!this._listeners.has(url)) this._listeners.set(url, []);
      this._listeners.get(url).push(resolve);
      // Kick off the flush loop (no-op if already running)
      this._flush();
    });
  }

  /**
   * Drain the entire queue sequentially in priority order.
   * Call this after enqueuing all initial assets.
   * @returns {Promise<void>}
   */
  async preloadAll() {
    while (!this._heap.isEmpty()) {
      const asset = this._heap.extractMin(); // O(log n)
      if (!this._cache.has(asset.url) && !this._inflight.has(asset.url)) {
        await this._fetch(asset);
      }
    }
  }

  /**
   * Retrieve a cached Blob URL synchronously.
   * Returns null if the asset hasn't finished loading.
   * @param {string} url
   * @returns {string|null}
   */
  getCached(url) {
    return this._cache.get(url) ?? null;
  }

  /** True when the queue is empty and nothing is in-flight. */
  get isIdle() {
    return this._heap.isEmpty() && this._inflight.size === 0;
  }

  /** How many assets are queued but not yet fetched. */
  get pendingCount() {
    return this._heap.size;
  }

  // ── Internals ─────────────────────────────────────────────────────────────

  /** Continuously drain the heap, one asset at a time. */
  async _flush() {
    while (!this._heap.isEmpty()) {
      const asset = this._heap.extractMin(); // O(log n) — highest priority
      if (!this._cache.has(asset.url) && !this._inflight.has(asset.url)) {
        await this._fetch(asset);
      }
    }
  }

  /**
   * Fetch a single asset, store it as a Blob URL, notify all listeners.
   * @param {{ url: string }} asset
   */
  async _fetch(asset) {
    const { url } = asset;
    this._inflight.add(url);

    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);

      this._cache.set(url, blobUrl);                     // store in O(1) Map
      (this._listeners.get(url) ?? []).forEach(fn => fn(blobUrl));
    } catch (err) {
      console.warn(`[AssetLoader] Failed to load ${url}:`, err.message);
      // Resolve listeners with the original URL as fallback
      (this._listeners.get(url) ?? []).forEach(fn => fn(url));
    } finally {
      this._inflight.delete(url);
      this._listeners.delete(url);
    }
  }
}

// ── MinHeap (internal) ────────────────────────────────────────────────────────
//
// A binary min-heap stored in a flat array. Parent of node i is at ⌊(i-1)/2⌋;
// children of node i are at 2i+1 and 2i+2.
//
// insert()      → O(log n) — append then sift-up
// extractMin()  → O(log n) — swap root with last, remove last, sift-down
// peek()        → O(1)     — read index 0

class MinHeap {
  constructor() {
    this._data = [];
  }

  get size() { return this._data.length; }
  isEmpty()  { return this._data.length === 0; }
  peek()     { return this._data[0] ?? null; }

  /** Insert an asset object. Compares by .priority (lower = higher urgency). */
  insert(item) {
    this._data.push(item);
    this._siftUp(this._data.length - 1);
  }

  /** Remove and return the item with the lowest priority number. */
  extractMin() {
    if (this.isEmpty()) return null;
    const min = this._data[0];
    const last = this._data.pop();
    if (this._data.length > 0) {
      this._data[0] = last;
      this._siftDown(0);
    }
    return min;
  }

  _siftUp(i) {
    while (i > 0) {
      const parent = Math.floor((i - 1) / 2);
      if (this._data[parent].priority <= this._data[i].priority) break;
      [this._data[parent], this._data[i]] = [this._data[i], this._data[parent]];
      i = parent;
    }
  }

  _siftDown(i) {
    const n = this._data.length;
    while (true) {
      let smallest = i;
      const l = 2 * i + 1, r = 2 * i + 2;
      if (l < n && this._data[l].priority < this._data[smallest].priority) smallest = l;
      if (r < n && this._data[r].priority < this._data[smallest].priority) smallest = r;
      if (smallest === i) break;
      [this._data[smallest], this._data[i]] = [this._data[i], this._data[smallest]];
      i = smallest;
    }
  }
}
