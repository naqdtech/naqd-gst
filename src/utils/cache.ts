/**
 * Tiny localStorage + Memory cache with TTL — keeps WhiteBooks API usage down (#16).
 * Public data (filing status via rettrack) is cheap to cache for hours.
 * Large JSON payloads (GSTR-2B, multi-month GSTR-1) often exceed the 5MB localStorage quota.
 * The memory Map ensures they stay cached during the SPA session even if localStorage fails.
 */

const memCache = new Map<string, { t: number; v: unknown }>();

export function cacheGet<T>(key: string, ttlMs: number): T | null {
    const mem = memCache.get(key);
    if (mem && (Date.now() - mem.t <= ttlMs)) return mem.v as T;

    try {
        const raw = localStorage.getItem("gcache:" + key);
        if (!raw) return null;
        const { t, v } = JSON.parse(raw);
        if (Date.now() - t > ttlMs) return null;
        memCache.set(key, { t, v }); // populate memory
        return v as T;
    } catch {
        return null;
    }
}

export function cacheSet(key: string, v: unknown) {
    memCache.set(key, { t: Date.now(), v });
    try {
        localStorage.setItem("gcache:" + key, JSON.stringify({ t: Date.now(), v }));
    } catch {
        /* quota — ignore, memory cache will handle it */
    }
}

/** Age of a cached entry in minutes, or null if absent. */
export function cacheAgeMin(key: string): number | null {
    const mem = memCache.get(key);
    if (mem) return Math.round((Date.now() - mem.t) / 60000);

    try {
        const raw = localStorage.getItem("gcache:" + key);
        if (!raw) return null;
        return Math.round((Date.now() - JSON.parse(raw).t) / 60000);
    } catch {
        return null;
    }
}
