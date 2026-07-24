/**
 * GST API client — talks to this app's own /api/gst serverless proxy.
 * No credentials live here: WhiteBooks secrets stay server-side in Vercel env vars.
 */
import axios from "axios";
import type { GstReturnType, GstTaxpayer, GstFilingRecord } from "../types";

const http = axios.create({ timeout: 60000, headers: { Accept: "application/json" } });

/** Single static endpoint: /api/gst?action=… (a dynamic route would lose to the SPA rewrite). */
async function gstCall(action: string, params: Record<string, any>): Promise<any> {
    try {
        const res = await http.get("/api/gst", { params: { action, ...params } });
        return res.data;
    } catch (err: any) {
        const e = err?.response?.data?.error ?? err?.message ?? "GST request failed";
        throw new Error(typeof e === "string" ? e : e?.message || "GST request failed");
    }
}

type Result = { ok: boolean; data?: any; message?: string; empty?: boolean };
const asResult = (b: any): Result => {
    if (b === "" || b == null) return { ok: false, empty: true, message: "No data — the session may have expired" };
    if (b?.status_cd === "1") return { ok: true, data: b.data };
    return { ok: false, message: b?.status_desc || b?.error?.message || "Request failed" };
};

export const gstAPI = {
    /** Public taxpayer lookup (no OTP). */
    search: async (gstin: string): Promise<{ ok: boolean; taxpayer?: GstTaxpayer; message?: string }> => {
        const b = await gstCall("search", { gstin });
        if (b?.status_cd === "1" && b?.data) return { ok: true, taxpayer: { gstin, ...b.data } };
        return { ok: false, message: b?.status_desc || b?.error?.message || "Taxpayer not found" };
    },

    /** Filing status for a financial year (no OTP). */
    track: async (gstin: string, fy: string): Promise<GstFilingRecord[]> => {
        const b = await gstCall("track", { gstin, fy });
        return b?.data?.EFiledlist || [];
    },

    /** Step 1 — send OTP to the taxpayer, returns a txn. */
    otpRequest: async (gstin: string, gstUsername: string): Promise<{ ok: boolean; txn?: string; message?: string }> => {
        const b = await gstCall("otp-request", { gstin, gst_username: gstUsername });
        const txn = b?.header?.txn;
        if (b?.status_cd === "1" && txn) return { ok: true, txn };
        return { ok: false, message: b?.status_desc || b?.error?.message || "Could not send OTP" };
    },

    /** Step 2 — verify OTP, activating the ~6-hour session. */
    verifyOtp: async (gstin: string, gstUsername: string, txn: string, otp: string): Promise<{ ok: boolean; txn?: string; message?: string }> => {
        const b = await gstCall("verify-otp", { gstin, gst_username: gstUsername, txn, otp });
        if (b?.status_cd === "1") return { ok: true, txn: b?.header?.txn || txn };
        return { ok: false, message: b?.status_desc || b?.error?.message || "OTP verification failed" };
    },

    /** Extend the session before it lapses. */
    refresh: async (gstin: string, gstUsername: string, txn: string): Promise<boolean> => {
        const b = await gstCall("refresh", { gstin, gst_username: gstUsername, txn });
        return b?.status_cd === "1";
    },

    /** One section of GSTR-1 / GSTR-2A / GSTR-2B. */
    fetchSection: async (rtn: GstReturnType, section: string, gstin: string, retPeriod: string, txn: string, gstUsername: string): Promise<Result> =>
        asResult(await gstCall("fetch", { rtn, section, gstin, ret_period: retPeriod, txn, gst_username: gstUsername })),

    /** GSTR-3B summary (retsum). */
    fetch3b: async (gstin: string, retPeriod: string, txn: string, gstUsername: string): Promise<Result> =>
        asResult(await gstCall("gstr3b", { gstin, ret_period: retPeriod, txn, gst_username: gstUsername })),

    /** Electronic Cash / Credit ledger over a date range (DD-MM-YYYY). */
    fetchLedger: async (kind: "cash" | "credit", gstin: string, frdt: string, todt: string, txn: string, gstUsername: string): Promise<Result> =>
        asResult(await gstCall("ledger", { kind, gstin, frdt, todt, txn, gst_username: gstUsername })),
};
