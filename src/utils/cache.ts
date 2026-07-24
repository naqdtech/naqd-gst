/**
 * Tiny localStorage cache with TTL — keeps WhiteBooks API usage down (#16).
 * Public data (filing status via rettrack) is cheap to cache for hours.
 */

export function cacheGet<T>(key: string, ttlMs: number): T | null {
    try {
        const raw = localStorage.getItem("gcache:" + key);
        if (!raw) return null;
        const { t, v } = JSON.parse(raw);
        if (Date.now() - t > ttlMs) return null;
        return v as T;
    } catch {
        return null;
    }
}

export function cacheSet(key: string, v: unknown) {
    try {
        localStorage.setItem("gcache:" + key, JSON.stringify({ t: Date.now(), v }));
    } catch {
        /* quota — ignore */
    }
}

/** Age of a cached entry in minutes, or null if absent. */
export function cacheAgeMin(key: string): number | null {
    try {
        const raw = localStorage.getItem("gcache:" + key);
        if (!raw) return null;
        return Math.round((Date.now() - JSON.parse(raw).t) / 60000);
    } catch {
        return null;
    }
}
