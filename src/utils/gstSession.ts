/**
 * GST taxpayer sessions & client registry (browser-side).
 * =======================================================
 * WhiteBooks gives a 6-hour session `txn` after OTP. We keep it in the browser
 * (sessionStorage) and replay it on each fetch — the serverless proxy stays
 * stateless and no secret is ever stored here. GSTINs the AM has used are kept
 * in a small localStorage registry (they aren't in ERPNext yet).
 */
import type { GstSession, GstClient } from "../types";

const SESSION_KEY = "naqd_gst_sessions"; // sessionStorage: { [gstin]: GstSession }
const REGISTRY_KEY = "naqd_gst_clients";  // localStorage:   GstClient[]

// Sessions expire slightly before WhiteBooks' 6h so we never send a dead txn.
const SESSION_TTL_MS = 5.5 * 60 * 60 * 1000;

function readSessions(): Record<string, GstSession> {
    try {
        return JSON.parse(sessionStorage.getItem(SESSION_KEY) || "{}");
    } catch {
        return {};
    }
}
function writeSessions(map: Record<string, GstSession>) {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(map));
}

/** Active, non-expired session for a GSTIN — or null. */
export function getSession(gstin: string): GstSession | null {
    const s = readSessions()[gstin];
    if (!s) return null;
    if (Date.now() - s.authAt > SESSION_TTL_MS) {
        clearSession(gstin);
        return null;
    }
    return s;
}

export function setSession(s: GstSession) {
    const map = readSessions();
    map[s.gstin] = s;
    writeSessions(map);
}

export function clearSession(gstin: string) {
    const map = readSessions();
    delete map[gstin];
    writeSessions(map);
}

/** Minutes remaining on a session, floored at 0. */
export function sessionMinutesLeft(s: GstSession): number {
    return Math.max(0, Math.round((SESSION_TTL_MS - (Date.now() - s.authAt)) / 60000));
}

// ── Client (GSTIN) registry ──

export function listClients(): GstClient[] {
    try {
        const arr: GstClient[] = JSON.parse(localStorage.getItem(REGISTRY_KEY) || "[]");
        return arr.sort((a, b) => (b.lastUsed || 0) - (a.lastUsed || 0));
    } catch {
        return [];
    }
}

export function upsertClient(c: GstClient) {
    const arr = listClients().filter((x) => x.gstin !== c.gstin);
    arr.unshift({ ...c, lastUsed: Date.now() });
    localStorage.setItem(REGISTRY_KEY, JSON.stringify(arr.slice(0, 100)));
}

export function removeClient(gstin: string) {
    localStorage.setItem(REGISTRY_KEY, JSON.stringify(listClients().filter((x) => x.gstin !== gstin)));
}

export function getClient(gstin: string): GstClient | null {
    return listClients().find((x) => x.gstin === gstin) || null;
}
