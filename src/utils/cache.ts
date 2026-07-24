import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "";
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || "";
export const supabase = supabaseUrl ? createClient(supabaseUrl, supabaseKey) : null;

const memCache = new Map<string, { t: number; v: unknown }>();

export async function cacheGet<T>(key: string, ttlMs: number): Promise<T | null> {
    const mem = memCache.get(key);
    if (mem && (Date.now() - mem.t <= ttlMs)) return mem.v as T;

    try {
        const raw = localStorage.getItem("gcache:" + key);
        if (raw) {
            const { t, v } = JSON.parse(raw);
            if (Date.now() - t <= ttlMs) {
                memCache.set(key, { t, v });
                return v as T;
            }
        }
    } catch { /* ignore */ }

    if (supabase) {
        try {
            const { data, error } = await supabase
                .from('gst_cache')
                .select('data, created_at')
                .eq('key', key)
                .single();
                
            if (data && !error) {
                const ts = new Date(data.created_at).getTime();
                if (Date.now() - ts <= ttlMs) {
                    memCache.set(key, { t: ts, v: data.data });
                    try { localStorage.setItem("gcache:" + key, JSON.stringify({ t: ts, v: data.data })); } catch {}
                    return data.data as T;
                }
            }
        } catch { /* ignore */ }
    }
    return null;
}

export async function cacheSet(key: string, v: unknown) {
    const ts = Date.now();
    memCache.set(key, { t: ts, v });
    try {
        localStorage.setItem("gcache:" + key, JSON.stringify({ t: ts, v }));
    } catch { /* ignore */ }

    if (supabase) {
        try {
            await supabase
                .from('gst_cache')
                .upsert({ key, data: v, created_at: new Date(ts).toISOString() });
        } catch { /* ignore */ }
    }
}
