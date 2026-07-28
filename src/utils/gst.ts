/**
 * GST parsing & period helpers.
 */
import type { Gstr2bSupplier, GstPeriodTotals } from "../types";

export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "052026" → "May 2026" */
export function periodLabel(p: string): string {
    if (!/^\d{6}$/.test(p)) return p;
    const m = +p.slice(0, 2);
    return `${MONTHS[m - 1] || p.slice(0, 2)} ${p.slice(2)}`;
}

/**
 * True when the GST portal / GSP rejected the request because **API access isn't
 * enabled** for this GSTIN (or its "Manage API Access" duration is ≤ the 6-hour token).
 * GSTN's message: "API access is not available or user expiry Duration is less than or
 * equal to auth token expiry duration".
 */
export function isApiAccessError(msg?: string): boolean {
    const m = (msg || "").toLowerCase();
    return m.includes("api access") || m.includes("expiry duration") || m.includes("auth token expiry");
}

/** Turn a raw WhiteBooks/GSTN error into something a practitioner can act on. */
export function friendlyOtpError(msg?: string): string {
    if (isApiAccessError(msg))
        return "API access isn't enabled for this GSTIN on the GST portal (or its duration is ≤ 6 hours). Enable it under My Profile → Manage API Access (set Duration to 30 days), then resend the OTP.";
    const m = (msg || "").toLowerCase();
    if (m.includes("invalid") && m.includes("otp")) return "Incorrect OTP — check the code and try again, or resend.";
    if (m.includes("transaction")) return "This OTP session expired — please resend the OTP.";
    return msg || "Something went wrong — please try again.";
}

/** FY "2025-26" → the 12 MMYYYY periods, Apr → Mar. */
export function fyPeriods(fy: string): string[] {
    const m = fy.match(/^(\d{4})-(\d{2})$/);
    if (!m) return [];
    const y1 = +m[1];
    const out: string[] = [];
    for (let mo = 4; mo <= 12; mo++) out.push(String(mo).padStart(2, "0") + y1);
    for (let mo = 1; mo <= 3; mo++) out.push(String(mo).padStart(2, "0") + (y1 + 1));
    return out;
}

/** Get all periods between two MMYYYY strings, inclusive. */
export function getPeriodsBetween(fromP: string, toP: string): string[] {
    if (!/^\d{6}$/.test(fromP) || !/^\d{6}$/.test(toP)) return [];
    const m1 = +fromP.slice(0, 2), y1 = +fromP.slice(2);
    const m2 = +toP.slice(0, 2), y2 = +toP.slice(2);
    const start = y1 * 12 + m1, end = y2 * 12 + m2;
    if (start > end) return [];
    const out: string[] = [];
    for (let i = start; i <= end; i++) {
        let mo = i % 12, yr = Math.floor(i / 12);
        if (mo === 0) { mo = 12; yr -= 1; }
        out.push(String(mo).padStart(2, "0") + yr);
    }
    return out;
}

/** Financial year (Apr–Mar) for a date, e.g. "2026-27". */
export function currentFy(d = new Date()): string {
    const y = d.getFullYear();
    const start = d.getMonth() + 1 >= 4 ? y : y - 1;
    return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

/** Most-recent financial years for a picker. */
export function fyList(n = 5): string[] {
    const y1 = +currentFy().slice(0, 4);
    return Array.from({ length: n }, (_, i) => {
        const s = y1 - i;
        return `${s}-${String((s + 1) % 100).padStart(2, "0")}`;
    });
}

/** The 2B docdata object regardless of whether it's wrapped in {data:{data:{...}}}. */
function docdata(data: any): Record<string, Gstr2bSupplier[]> {
    return data?.data?.docdata || data?.docdata || {};
}

/** Flatten GSTR-2B docdata into invoice-level rows (for tables / export). */
export function flattenGstr2b(data: any, period?: string): Record<string, any>[] {
    const dd = docdata(data);
    const rows: Record<string, any>[] = [];
    const extract = (section: string, arr: any[]) => {
        if (!Array.isArray(arr)) return;
        const mult = section.startsWith("CDN") ? -1 : 1;
        for (const item of arr) {
            const docs = item.inv || item.nt || item.boe || item.doclist || item.isdDoc || (item.inum || item.boenum ? [item] : []);
            for (const doc of docs) {
                const baseRow = period ? { period: periodLabel(period) } : {};
                rows.push({
                    ...baseRow,
                    section,
                    supplier_gstin: item.ctin || item.portcode || "",
                    supplier: item.trdnm || "",
                    sup_period: item.supprd || "",
                    sup_filed: item.supfildt || "",
                    inv_no: doc.inum || doc.nt_num || doc.boenum || doc.docnum || "",
                    inv_date: doc.dt || doc.nt_dt || doc.boedt || doc.docdt || "",
                    inv_value: n(doc.val),
                    taxable: n(doc.txval) * mult,
                    igst: n(doc.igst) * mult,
                    cgst: n(doc.cgst) * mult,
                    sgst: n(doc.sgst) * mult,
                    cess: n(doc.cess) * mult,
                    itc_avl: doc.itcavl || doc.itcelg || "",
                    reason: doc.rsn || "",
                    ims: doc.imsStatus || "",
                });
            }
        }
    };
    
    extract("B2B", dd.b2b);
    extract("B2BA", dd.b2ba);
    extract("CDNR", dd.cdnr);
    extract("CDNRA", dd.cdnra);
    extract("IMPG", dd.impg);
    extract("IMPGSEZ", dd.impgsez);
    extract("ISD", dd.isd);
    extract("ISDA", dd.isda);
    
    return rows;
}

// ── Filing status (from public rettrack — no OTP) ──

export type FilingState = "ontime" | "late" | "notfiled" | "upcoming";
export interface FilingCell { period: string; state: FilingState; dof?: string; arn?: string; }

/** Due date for monthly filers: GSTR-1 → 11th, GSTR-3B → 20th of the next month. */
function dueDate(period: string, rtntype: string): number {
    const m = +period.slice(0, 2), y = +period.slice(2);
    const nm = m === 12 ? 0 : m;          // JS month index of the NEXT month
    const ny = m === 12 ? y + 1 : y;
    const day = rtntype === "GSTR1" ? 11 : 20;
    return new Date(ny, nm, day, 23, 59, 59).getTime();
}

/** "DD-MM-YYYY" → epoch ms, or null. */
function parseDof(dof?: string): number | null {
    const m = (dof || "").match(/^(\d{2})-(\d{2})-(\d{4})$/);
    return m ? new Date(+m[3], +m[2] - 1, +m[1]).getTime() : null;
}

/** Per-month filing grid for a return type across a FY, from a rettrack EFiledlist. */
export function fyFilingGrid(efiled: any[], fy: string, rtntype: "GSTR1" | "GSTR3B"): FilingCell[] {
    const now = Date.now();
    return fyPeriods(fy).map((period) => {
        const rec = (efiled || []).find((r) => r.ret_prd === period && r.rtntype === rtntype && r.status === "Filed");
        const due = dueDate(period, rtntype);
        if (rec) {
            const filed = parseDof(rec.dof);
            return { period, state: filed && filed > due ? "late" : "ontime", dof: rec.dof, arn: rec.arn };
        }
        return { period, state: now < due ? "upcoming" : "notfiled" };
    });
}

export function filingSummary(cells: FilingCell[]) {
    const s = { ontime: 0, late: 0, notfiled: 0, upcoming: 0 };
    for (const c of cells) s[c.state]++;
    return s;
}

export const STATE_LABEL: Record<FilingState, string> = {
    ontime: "Filed", late: "Late", notfiled: "Not filed", upcoming: "Upcoming",
};
export const STATE_CELL: Record<FilingState, string> = {
    ontime: "cell-ok", late: "cell-late", notfiled: "cell-bad", upcoming: "cell-upcoming",
};

// ── GSTR-3B summary + ledgers ──

export interface TaxRow { period?: string; label: string; txval?: number; igst: number; cgst: number; sgst: number; cess: number; }
export interface TaxBlock { block: string; label: string; rows: TaxRow[]; }

const heads = (o: any): Omit<TaxRow, "label" | "period"> => ({ txval: n(o?.txval), igst: n(o?.iamt), cgst: n(o?.camt), sgst: n(o?.samt), cess: n(o?.csamt) });

/** Parse a GSTR-3B retsum payload into readable blocks (defensive — skips absent parts). */
export function parse3b(data: any, period?: string): TaxBlock[] {
    const d = data?.data || data || {};
    const out: TaxBlock[] = [];
    const pAttr = period ? { period: periodLabel(period) } : {};
    const sup = d.sup_details || {};
    const supMap: [string, string][] = [
        ["osup_det", "Outward taxable (regular)"],
        ["osup_zero", "Outward zero-rated"],
        ["osup_nil_exmp", "Nil-rated / exempt"],
        ["isup_rev", "Inward reverse-charge"],
        ["osup_nongst", "Non-GST outward"],
    ];
    const supRows = supMap.filter(([k]) => sup[k]).map(([k, label]) => ({ ...pAttr, label, ...heads(sup[k]) }));
    if (supRows.length) out.push({ block: "3.1", label: "Outward supplies & reverse charge", rows: supRows });

    const itc = d.itc_elg || {};
    const itcRows: TaxRow[] = [];
    for (const it of (itc.itc_avl || [])) itcRows.push({ ...pAttr, label: "ITC available · " + (it.ty || ""), ...heads(it) });
    if (itc.itc_net) itcRows.push({ ...pAttr, label: "Net ITC available", ...heads(itc.itc_net) });
    for (const it of (itc.itc_rev || [])) itcRows.push({ ...pAttr, label: "ITC reversed · " + (it.ty || ""), ...heads(it) });
    for (const it of (itc.itc_inelg || [])) itcRows.push({ ...pAttr, label: "Ineligible ITC · " + (it.ty || ""), ...heads(it) });
    if (itcRows.length) out.push({ block: "4", label: "Eligible ITC", rows: itcRows });

    return out;
}

/** Normalise a ledger payload into an array of transaction rows (best-effort across shapes). */
export function ledgerRows(data: any): Record<string, any>[] {
    const d = data?.data ?? data;
    
    const findArray = (obj: any, depth = 0): any[] | null => {
        if (depth > 5 || !obj || typeof obj !== "object") return null;
        if (Array.isArray(obj)) return obj;
        for (const val of Object.values(obj)) {
            if (Array.isArray(val)) return val;
            const nested = findArray(val, depth + 1);
            if (nested) return nested;
        }
        return null;
    };
    
    const arr = findArray(d);
    return arr || [];
}

// ── Comparison (GSTR-1↔3B, 2B↔3B, 2A↔3B) ──

export interface TaxTotal { taxable: number; igst: number; cgst: number; sgst: number; cess: number; }
export const taxZero = (): TaxTotal => ({ taxable: 0, igst: 0, cgst: 0, sgst: 0, cess: 0 });
export const taxTotalTax = (t: TaxTotal) => t.igst + t.cgst + t.sgst + t.cess;

/** Sum every section of a GSTR-1/2A payload (invoice-style + flat rate-wise) into one tax total. */
export function sumSections(sections: Record<string, any>): TaxTotal {
    const t = taxZero();
    for (const [s, arr] of Object.entries(sections)) {
        if (isInvoiceSection(s)) {
            for (const r of flattenInvSection(arr, s)) { t.taxable += r.taxable; t.igst += r.igst; t.cgst += r.cgst; t.sgst += r.sgst; t.cess += r.cess; }
        } else if (Array.isArray(arr)) {
            for (const r of arr) { t.taxable += n(r.txval); t.igst += n(r.iamt); t.cgst += n(r.camt); t.sgst += n(r.samt); t.cess += n(r.csamt); }
        }
    }
    return t;
}

/** GSTR-2B ITC-available total, from itcsumm. */
export function total2bItc(data: any): TaxTotal {
    const nrs = ((data?.data?.data || data?.data || data)?.itcsumm?.itcavl?.nonrevsup) || {};
    // fall back to summing docs if itcsumm absent
    if (nrs && (nrs.igst != null || nrs.cgst != null)) return { taxable: 0, igst: n(nrs.igst), cgst: n(nrs.cgst), sgst: n(nrs.sgst), cess: n(nrs.cess) };
    const t = totalsGstr2b(data, "");
    return { taxable: t.taxable, igst: t.igst, cgst: t.cgst, sgst: t.sgst, cess: t.cess };
}

/** GSTR-3B outward (3.1) + net eligible ITC (table 4) totals. */
export function totals3b(data: any): { outward: TaxTotal; itc: TaxTotal } {
    const d = data?.data || data || {};
    const outward = taxZero();
    const sup = d.sup_details || {};
    for (const k of ["osup_det", "osup_zero", "osup_nil_exmp", "isup_rev", "osup_nongst"]) {
        const o = sup[k];
        if (o) { outward.taxable += n(o.txval); outward.igst += n(o.iamt); outward.cgst += n(o.camt); outward.sgst += n(o.samt); outward.cess += n(o.csamt); }
    }
    const itc = taxZero();
    const net = d.itc_elg?.itc_net;
    if (net) { itc.igst = n(net.iamt); itc.cgst = n(net.camt); itc.sgst = n(net.samt); itc.cess = n(net.csamt); }
    return { outward, itc };
}

const n = (v: any) => (typeof v === "number" ? v : parseFloat(v) || 0);

/** Sum GSTR-2B into period totals (taxable + tax heads). */
export function totalsGstr2b(data: any, ret_period: string): GstPeriodTotals {
    const rows = flattenGstr2b(data);
    const t: GstPeriodTotals = { ret_period, docs: rows.length, taxable: 0, igst: 0, cgst: 0, sgst: 0, cess: 0, tax: 0 };
    for (const r of rows) {
        t.taxable += n(r.taxable);
        t.igst += n(r.igst);
        t.cgst += n(r.cgst);
        t.sgst += n(r.sgst);
        t.cess += n(r.cess);
    }
    t.tax = t.igst + t.cgst + t.sgst + t.cess;
    return t;
}

// ── GSTR-1 / GSTR-2A (multi-section) ──

/** Sections fetched for the viewer (curated — most carry data; empty ones just skip). */
export const GSTR1_SECTIONS = ["b2b", "b2ba", "b2cl", "b2cla", "b2cs", "b2csa", "cdnr", "cdnra", "cdnur", "cdnura", "exp", "expa", "nil", "hsnsum"];
export const GSTR2A_SECTIONS = ["b2b", "b2ba", "cdn", "cdna", "impg", "impgsez", "isd", "tds", "tcs"];

const INVOICE_SECTIONS = new Set(["b2b", "b2ba", "cdnr", "cdnra", "cdn", "cdna", "cdnur", "cdnura", "exp", "expa", "impg", "impgsez", "isd", "isda"]);
export function isInvoiceSection(s: string): boolean {
    return INVOICE_SECTIONS.has(s.toLowerCase());
}

/** Flatten a ctin + inv[]/nt[] section (GSTR-1/2A B2B, CDN, EXP…) into invoice rows. */
export function flattenInvSection(sectionArr: any, label: string, period?: string): Record<string, any>[] {
    const rows: Record<string, any>[] = [];
    const mult = label.toLowerCase().startsWith("cdn") ? -1 : 1;
    for (const sup of (Array.isArray(sectionArr) ? sectionArr : [])) {
        const docs = sup.inv || sup.nt || sup.boe || sup.doclist || sup.isdDoc || (sup.inum || sup.boenum ? [sup] : []);
        for (const doc of (Array.isArray(docs) ? docs : [])) {
            let txval = 0, igst = 0, cgst = 0, sgst = 0, cess = 0;
            const items = doc.itms || doc.itc_elg || (doc.txval || doc.igst ? [doc] : []);
            for (const it of items) {
                const dt = it.itm_det || it || {};
                txval += n(dt.txval); igst += n(dt.iamt || dt.igst); cgst += n(dt.camt || dt.cgst); sgst += n(dt.samt || dt.sgst); cess += n(dt.csamt || dt.cess);
            }
            const baseRow = period ? { period: periodLabel(period) } : {};
            rows.push({
                ...baseRow,
                section: label,
                ctin: sup.ctin || sup.portcode || "",
                doc_no: doc.inum || doc.nt_num || doc.boenum || doc.docnum || "",
                doc_date: doc.idt || doc.nt_dt || doc.boedt || doc.docdt || "",
                value: n(doc.val),
                pos: doc.pos || "",
                type: doc.inv_typ || doc.ntty || "",
                taxable: txval * mult, 
                igst: igst * mult, 
                cgst: cgst * mult, 
                sgst: sgst * mult, 
                cess: cess * mult, 
                tax: (igst + cgst + sgst + cess) * mult,
            });
        }
    }
    return rows;
}
