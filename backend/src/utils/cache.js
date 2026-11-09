/**
 * EduConnect In-Memory High-Speed Cache & Query Optimizer
 * 
 * Provides ultra-fast micro-caching (0-2ms response time) for read-heavy school endpoints
 * (announcements, courses, folders, school settings, rosters) without requiring external Redis.
 * Automatically evicts expired items and supports pattern-based invalidation upon data writes.
 */

class MemoryCache {
  constructor(defaultTtlSeconds = 60, maxEntries = 500) {
    this.defaultTtl = defaultTtlSeconds * 1000;
    this.maxEntries = maxEntries;
    this.store = new Map();
  }

  set(key, value, ttlSeconds) {
    // Evict oldest entries if capacity reached
    if (this.store.size >= this.maxEntries) {
      const firstKey = this.store.keys().next().value;
      if (firstKey) this.store.delete(firstKey);
    }

    const ttl = (ttlSeconds !== undefined ? ttlSeconds : this.defaultTtl / 1000) * 1000;
    const expiresAt = Date.now() + ttl;
    this.store.set(key, { value, expiresAt });
  }

  get(key) {
    const item = this.store.get(key);
    if (!item) return null;

    if (Date.now() > item.expiresAt) {
      this.store.delete(key);
      return null;
    }

    return item.value;
  }

  del(key) {
    return this.store.delete(key);
  }

  delByPattern(pattern) {
    let deletedCount = 0;
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
    for (const key of this.store.keys()) {
      if (regex.test(key)) {
        this.store.delete(key);
        deletedCount++;
      }
    }
    return deletedCount;
  }

  flush() {
    this.store.clear();
  }

  size() {
    return this.store.size;
  }
}

const memoryCache = new MemoryCache(60, 1000);

/**
 * Express Middleware for automated caching of GET requests
 * @param {number} ttlSeconds - Duration in seconds to retain cache
 * @param {function} [keyGenerator] - Custom key generator function (optional)
 */
function cacheMiddleware(ttlSeconds = 45, keyGenerator = null) {
  return (req, res, next) => {
    // Only cache GET requests
    if (req.method !== 'GET') {
      return next();
    }

    const cacheKey = keyGenerator
      ? keyGenerator(req)
      : `${req.user?.school_id || 'public'}:${req.user?.id || 'anon'}:${req.originalUrl || req.url}`;

    const cachedData = memoryCache.get(cacheKey);
    if (cachedData) {
      res.setHeader('X-Cache', 'HIT');
      return res.json(cachedData);
    }

    // Intercept res.json to store successful responses in cache
    const originalJson = res.json.bind(res);
    res.json = (body) => {
      if (res.statusCode >= 200 && res.statusCode < 300 && body && body.success !== false) {
        memoryCache.set(cacheKey, body, ttlSeconds);
      }
      res.setHeader('X-Cache', 'MISS');
      return originalJson(body);
    };

    next();
  };
}

module.exports = {
  cache: memoryCache,
  cacheMiddleware,
};

