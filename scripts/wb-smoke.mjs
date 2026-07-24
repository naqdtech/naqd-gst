#!/usr/bin/env node
/**
 * WhiteBooks credential smoke test — no side effects.
 * Calls /public/search (public taxpayer lookup: no OTP, doesn't touch any filing).
 *
 * Usage (from repo root):
 *   WB_CLIENT_ID=... WB_CLIENT_SECRET=... WB_EMAIL=you@x.com \
 *   [WB_BASE_URL=https://api.whitebooks.in] node scripts/wb-smoke.mjs [GSTIN]
 *
 * Default base = production. Sandbox base is usually https://apisandbox.whitebooks.in
 * Default GSTIN = WhiteBooks sample 29AAAAA0000A1Z5
 */

const BASE = (process.env.WB_BASE_URL || "https://api.whitebooks.in").replace(/\/$/, "");
const { WB_CLIENT_ID, WB_CLIENT_SECRET, WB_EMAIL, WB_IP } = process.env;
const GSTIN = (process.argv[2] || "29AAAAA0000A1Z5").toUpperCase();

const mask = (s) => (!s ? "(missing)" : s.length <= 6 ? "***" : `${s.slice(0, 3)}…${s.slice(-3)}`);

console.log("── WhiteBooks smoke test ──────────────────────────────");
console.log("base       :", BASE);
console.log("client_id  :", mask(WB_CLIENT_ID));
console.log("secret     :", mask(WB_CLIENT_SECRET));
console.log("email      :", WB_EMAIL || "(missing)");
console.log("gstin      :", GSTIN, "| state_cd:", GSTIN.slice(0, 2));
console.log("───────────────────────────────────────────────────────");

if (!WB_CLIENT_ID || !WB_CLIENT_SECRET || !WB_EMAIL) {
    console.error("\n✗ Set WB_CLIENT_ID, WB_CLIENT_SECRET and WB_EMAIL in the environment first.");
    process.exit(2);
}

const headers = {
    Accept: "application/json",
    client_id: WB_CLIENT_ID,
    client_secret: WB_CLIENT_SECRET,
    state_cd: GSTIN.slice(0, 2),
};
if (WB_IP) headers.ip_address = WB_IP;

const qs = new URLSearchParams({ email: WB_EMAIL, gstin: GSTIN, action: "TP" }).toString();
const url = `${BASE}/public/search?${qs}`;
console.log("GET", url, "\n");

try {
    const t0 = Date.now();
    const res = await fetch(url, { headers });
    const ms = Date.now() - t0;
    const text = await res.text();
    let body;
    try { body = JSON.parse(text); } catch { body = text; }

    console.log(`HTTP ${res.status} ${res.statusText}  (${ms} ms)`);
    console.log(typeof body === "string" ? body.slice(0, 2000) : JSON.stringify(body, null, 2).slice(0, 4000));

    // WhiteBooks returns HTTP 200 even on errors; the real status is in status_cd.
    const ok = body && body.status_cd === "1";
    if (ok) {
        console.log("\n✓ Credentials WORK — taxpayer record returned (status_cd=1).");
    } else if (body && /not registered/i.test(body.status_desc || "")) {
        console.log("\n✗ WB_EMAIL is not a registered WhiteBooks email. Use the email tied to your WhiteBooks account.");
    } else {
        console.log("\n△ Reached WhiteBooks but no clean record — inspect body above (check client_id/secret, base URL, or that the account/sandbox is enabled).");
    }
} catch (e) {
    console.error("\n✗ Request failed:", e?.message || e);
    process.exit(1);
}
