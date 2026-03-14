/**
 * store.js — In-memory key/value store for local testing.
 * Replaces Redis. Entries auto-expire using setTimeout.
 */

const store = new Map(); // key → { value, timer }

const memStore = {
  /** Set a key with a TTL in seconds (0 = no expiry) */
  set(key, value, ttlSeconds = 0) {
    if (store.has(key)) clearTimeout(store.get(key).timer);
    const entry = { value };
    if (ttlSeconds > 0) {
      entry.timer = setTimeout(() => store.delete(key), ttlSeconds * 1000);
      entry.timer.unref?.(); // don't block process exit
    }
    store.set(key, entry);
  },

  get(key) {
    return store.has(key) ? store.get(key).value : null;
  },

  del(key) {
    if (store.has(key)) {
      clearTimeout(store.get(key).timer);
      store.delete(key);
    }
  },

  has(key) {
    return store.has(key);
  },
};

module.exports = memStore;