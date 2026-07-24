/**
 * Type definitions — Naqd GST
 */

export type GstReturnType = "gstr1" | "gstr2a" | "gstr2b";

/** Public taxpayer record from /public/search. */
export interface GstTaxpayer {
    gstin: string;
    lgnm?: string;      // legal name
    tradeNam?: string;  // trade name
    sts?: string;       // status, e.g. "Active"
    dty?: string;       // taxpayer type, e.g. "Regular"
    ctb?: string;       // constitution of business
    rgdt?: string;      // registration date
    nba?: string[];     // nature of business activity
    pradr?: { addr?: Record<string, string>; ntr?: string };
}

/** One filed-return row from /public/rettrack. */
export interface GstFilingRecord {
    ret_prd: string;   // MMYYYY
    rtntype: string;   // "GSTR1" | "GSTR3B" | ...
    status: string;    // "Filed"
    dof?: string;      // date of filing (DD-MM-YYYY)
    arn?: string;
    valid?: string;
}

/** Locally-held ~6-hour taxpayer session (only `txn` ever leaves the browser). */
export interface GstSession {
    gstin: string;
    gstUsername: string;
    txn: string;
    authAt: number;    // epoch ms when the OTP session was activated
}

/** A saved GSTIN in the browser-side client registry. */
export interface GstClient {
    gstin: string;
    gstUsername: string;
    tradeName?: string;
    legalName?: string;
    lastUsed?: number;
}

// GSTR-2B (subset of the auto-drafted statement)
export interface Gstr2bInvoice {
    inum: string;      // invoice no
    typ?: string;
    dt?: string;       // invoice date
    val?: number;      // invoice value
    pos?: string;
    rev?: string;      // reverse charge Y/N
    itcavl?: string;   // ITC available Y/N
    rsn?: string;      // reason if ITC not available
    txval?: number;    // taxable value
    igst?: number; cgst?: number; sgst?: number; cess?: number;
    imsStatus?: string;
}
export interface Gstr2bSupplier {
    ctin: string;      // supplier GSTIN
    trdnm?: string;    // supplier trade name
    supprd?: string;   // supplier's return period
    supfildt?: string; // supplier's filing date
    inv?: Gstr2bInvoice[];
    txval?: number; igst?: number; cgst?: number; sgst?: number; cess?: number; ttldocs?: number;
}

/** Normalised per-period totals used by aggregate views. */
export interface GstPeriodTotals {
    ret_period: string;    // MMYYYY
    docs: number;
    taxable: number;
    igst: number; cgst: number; sgst: number; cess: number;
    tax: number;           // igst+cgst+sgst+cess
}
