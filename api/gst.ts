/**
 * GST Returns — single static serverless proxy for WhiteBooks.
 * ============================================================
 * Served at /api/gst?action=<action> (a STATIC route, so it is matched before the
 * vercel.json `/api/*` → ERPNext rewrite — a dynamic `[action]` route is not).
 * Self-contained: NO relative imports / `_`-helpers (those crash Vercel's ESM
 * runtime), raw Node req/res, and every path returns JSON (errors included).
 *
 * Env (Vercel → Settings → Environment Variables, never VITE_-prefixed):
 *   WB_CLIENT_ID, WB_CLIENT_SECRET, WB_EMAIL, WB_IP  (all required)
 *   WB_BASE_URL (default prod)
 * NOTE: open endpoint (no login) per product choice — keep the deploy URL private.
 */

const WB_BASE = (process.env.WB_BASE_URL || "https://api.whitebooks.in").replace(/\/$/, "");

function send(res: any, status: number, body: unknown) {
    res.statusCode = status;
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.end(JSON.stringify(body));
}

function wbConfigured(): boolean {
    return Boolean(process.env.WB_CLIENT_ID && process.env.WB_CLIENT_SECRET && process.env.WB_EMAIL && process.env.WB_IP);
}

interface WbAuth { gst_username?: string; state_cd?: string; txn?: string; }

function wbHeaders(auth: WbAuth = {}): Record<string, string> {
    const h: Record<string, string> = {
        Accept: "application/json",
        client_id: process.env.WB_CLIENT_ID || "",
        client_secret: process.env.WB_CLIENT_SECRET || "",
    };
    const ip = process.env.WB_IP;
    if (ip) h.ip_address = ip;
    if (auth.gst_username) h.gst_username = auth.gst_username;
    if (auth.state_cd) h.state_cd = auth.state_cd;
    if (auth.txn) h.txn = auth.txn;
    return h;
}

async function wbGet(path: string, query: Record<string, string | undefined> = {}, auth: WbAuth = {}): Promise<any> {
    const params = new URLSearchParams();
    params.set("email", process.env.WB_EMAIL || "");
    for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== null && v !== "") params.set(k, String(v));
    const r = await fetch(`${WB_BASE}${path}?${params.toString()}`, { headers: wbHeaders(auth) });
    const text = await r.text();
    let body: any;
    try { body = JSON.parse(text); } catch { body = text; }
    // WhiteBooks echoes client_secret/client_id back in body.header — strip them.
    if (body && typeof body === "object" && body.header && typeof body.header === "object") {
        delete body.header.client_secret;
        delete body.header.client_id;
    }
    return body;
}

const GSTIN_RE = /^[0-9A-Z]{15}$/;

export default async function handler(req: any, res: any) {
    try {
        const url = new URL(req.url || "", "http://localhost");
        const q = Object.fromEntries(url.searchParams.entries()) as Record<string, string>;
        const action = String(q.action || "");

        if (!wbConfigured()) return send(res, 500, { error: "WhiteBooks not configured (need WB_CLIENT_ID/SECRET/EMAIL/IP)" });

        const gstin = String(q.gstin || "").trim().toUpperCase();
        const state_cd = gstin.slice(0, 2);
        const gu = String(q.gst_username || "").trim();
        const txn = String(q.txn || "").trim();

        switch (action) {
            case "search": {
                if (!GSTIN_RE.test(gstin)) return send(res, 400, { error: "Valid 15-char gstin required" });
                return send(res, 200, await wbGet("/public/search", { gstin, action: "TP" }, { state_cd }));
            }
            case "track": {
                const fy = String(q.fy || "").trim();
                if (!GSTIN_RE.test(gstin)) return send(res, 400, { error: "Valid gstin required" });
                if (!/^\d{4}-\d{2}$/.test(fy)) return send(res, 400, { error: "fy required as YYYY-YY" });
                return send(res, 200, await wbGet("/public/rettrack", { gstin, fy }, { state_cd }));
            }
            case "otp-request": {
                if (!GSTIN_RE.test(gstin)) return send(res, 400, { error: "Valid gstin required" });
                if (!gu) return send(res, 400, { error: "gst_username required" });
                return send(res, 200, await wbGet("/authentication/otprequest", {}, { gst_username: gu, state_cd }));
            }
            case "verify-otp": {
                const otp = String(q.otp || "").trim();
                if (!GSTIN_RE.test(gstin)) return send(res, 400, { error: "Valid gstin required" });
                if (!gu || !txn || !otp) return send(res, 400, { error: "gst_username, txn and otp required" });
                return send(res, 200, await wbGet("/authentication/authtoken", { txn, otp }, { gst_username: gu, state_cd, txn }));
            }
            case "refresh": {
                if (!gu || !txn) return send(res, 400, { error: "gst_username and txn required" });
                return send(res, 200, await wbGet("/authentication/refreshtoken", { txn }, { gst_username: gu, state_cd, txn }));
            }
            case "fetch": {
                const rtn = String(q.rtn || "").toLowerCase();
                const section = String(q.section || (rtn === "gstr2b" ? "all" : "")).toLowerCase();
                const ret_period = String(q.ret_period || "").trim();
                if (!["gstr1", "gstr2a", "gstr2b"].includes(rtn)) return send(res, 400, { error: "rtn must be gstr1, gstr2a or gstr2b" });
                if (!/^[a-z0-9]{1,12}$/.test(section)) return send(res, 400, { error: "invalid section" });
                if (!GSTIN_RE.test(gstin)) return send(res, 400, { error: "Valid gstin required" });
                if (!/^\d{6}$/.test(ret_period)) return send(res, 400, { error: "ret_period required as MMYYYY" });
                if (!gu || !txn) return send(res, 400, { error: "gst_username and txn (session) required" });
                // Period param name differs by return (per WhiteBooks Postman collection):
                // GSTR-2B → `rtnprd`; GSTR-1 & GSTR-2A → `retperiod` (NO underscore).
                const period = rtn === "gstr2b" ? { rtnprd: ret_period } : { retperiod: ret_period };
                return send(res, 200, await wbGet(`/${rtn}/${section}`, { gstin, ...period }, { gst_username: gu, state_cd, txn }));
            }
            case "gstr3b": {
                const ret_period = String(q.ret_period || "").trim();
                if (!GSTIN_RE.test(gstin)) return send(res, 400, { error: "Valid gstin required" });
                if (!/^\d{6}$/.test(ret_period)) return send(res, 400, { error: "ret_period required as MMYYYY" });
                if (!gu || !txn) return send(res, 400, { error: "gst_username and txn (session) required" });
                return send(res, 200, await wbGet("/gstr3b/retsum", { gstin, retperiod: ret_period }, { gst_username: gu, state_cd, txn }));
            }
            case "ledger": {
                const kind = String(q.kind || "cash").toLowerCase();
                const path = kind === "credit" ? "/ledgers/itc" : "/ledgers/cashdtl";
                const frdt = String(q.frdt || "").trim();
                const todt = String(q.todt || "").trim();
                if (!GSTIN_RE.test(gstin)) return send(res, 400, { error: "Valid gstin required" });
                if (!/^\d{2}-\d{2}-\d{4}$/.test(frdt) || !/^\d{2}-\d{2}-\d{4}$/.test(todt)) return send(res, 400, { error: "frdt/todt required as DD-MM-YYYY" });
                if (!gu || !txn) return send(res, 400, { error: "gst_username and txn (session) required" });
                return send(res, 200, await wbGet(path, { gstin, frdt, todt }, { gst_username: gu, state_cd, txn }));
            }
            default:
                return send(res, 404, { error: `Unknown action: ${action || "(none)"}` });
        }
    } catch (e: any) {
        return send(res, 500, { error: "GST proxy error", detail: String(e?.message || e) });
    }
}
