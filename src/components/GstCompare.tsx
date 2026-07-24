import React, { useMemo, useState } from "react";
import toast from "react-hot-toast";
import { HiOutlineArrowPath, HiOutlineClock, HiOutlineCheckCircle, HiOutlineArrowDownTray, HiOutlineScale } from "react-icons/hi2";
import { gstAPI } from "../api/gst";
import { sessionMinutesLeft } from "../utils/gstSession";
import { cacheGet, cacheSet } from "../utils/cache";
import {
    fyList, fyPeriods, periodLabel, GSTR1_SECTIONS, GSTR2A_SECTIONS, getPeriodsBetween,
    sumSections, total2bItc, totals3b, taxTotalTax, taxZero,
} from "../utils/gst";
import { downloadJson } from "../utils/gstExport";
import { inr } from "../utils/format";
import OtpGate from "./OtpGate";
import type { GstSession } from "../types";
import type { TaxTotal } from "../utils/gst";

const TTL = 24 * 60 * 60 * 1000;

/** Fetch a return, reusing the SAME cache keys the Reports tab writes (so comparison is near-free). */
async function loadReturn(type: string, gstin: string, period: string, s: GstSession, fetchMode: "essential" | "all"): Promise<any | null> {
    const short = type === "gstr2b" ? "2b" : type === "gstr3b" ? "3b" : type;
    const isMultiSec = type === "gstr1" || type === "gstr2a";
    const key = isMultiSec && fetchMode === "essential" ? `rep:${gstin}:${short}:${period}:ess` : `rep:${gstin}:${short}:${period}`;
    const c = cacheGet<any>(key, TTL);
    if (c) return c;
    let raw: any = null;
    if (type === "gstr2b") { const r = await gstAPI.fetchSection("gstr2b", "all", gstin, period, s.txn, s.gstUsername); raw = r.ok ? r.data : null; }
    else if (type === "gstr3b") { const r = await gstAPI.fetch3b(gstin, period, s.txn, s.gstUsername); raw = r.ok ? r.data : null; }
    else {
        let secs = type === "gstr1" ? GSTR1_SECTIONS : GSTR2A_SECTIONS;
        if (fetchMode === "essential") {
            secs = type === "gstr1" ? ["b2b", "cdnr", "b2cs", "hsnsum"] : ["b2b", "cdn"];
        }
        const acc: Record<string, any> = {};
        for (const sec of secs) { try { const r = await gstAPI.fetchSection(type as any, sec, gstin, period, s.txn, s.gstUsername); if (r.ok && r.data) acc[sec] = (r.data as any)[sec] ?? r.data; } catch { /* skip */ } }
        raw = Object.keys(acc).length ? acc : null;
    }
    if (raw != null) cacheSet(key, raw);
    return raw;
}

export default function GstCompare({ gstin, gstUsername }: { gstin: string; gstUsername?: string }) {
    return <OtpGate gstin={gstin} gstUsername={gstUsername}>{(session, end) => <Runner session={session} onEnd={end} />}</OtpGate>;
}

interface Totals { g1: TaxTotal | null; g2a: TaxTotal | null; g2b: TaxTotal | null; g3out: TaxTotal | null; g3itc: TaxTotal | null; }

function Runner({ session, onEnd }: { session: GstSession; onEnd: () => void }) {
    const { gstin } = session;
    const [fromFy, setFromFy] = useState(fyList()[0]);
    const fromPeriods = useMemo(() => fyPeriods(fromFy), [fromFy]);
    const [fromPeriod, setFromPeriod] = useState(() => fyPeriods(fyList()[0])[0]);
    
    const [toFy, setToFy] = useState(fyList()[0]);
    const toPeriods = useMemo(() => fyPeriods(toFy), [toFy]);
    const [toPeriod, setToPeriod] = useState(() => fyPeriods(fyList()[0])[11] || fyPeriods(fyList()[0])[0]);
    
    const [fetchMode, setFetchMode] = useState<"essential" | "all">("essential");
    const [loading, setLoading] = useState(false);
    const [t, setT] = useState<Totals | null>(null);
    const [activeRange, setActiveRange] = useState("");

    const creditsEst = useMemo(() => {
        const count = getPeriodsBetween(fromPeriod, toPeriod).length;
        const g1 = fetchMode === "essential" ? 4 : GSTR1_SECTIONS.length;
        const g2a = fetchMode === "essential" ? 2 : GSTR2A_SECTIONS.length;
        return count * (g1 + g2a + 2); // +2 for 2B and 3B
    }, [fromPeriod, toPeriod, fetchMode]);

    const run = async () => {
        const range = getPeriodsBetween(fromPeriod, toPeriod);
        if (!range.length) return toast.error("Invalid period range (From must be before To)");
        
        setLoading(true); setT(null); setActiveRange("");
        try {
            const ag1 = taxZero(), ag2a = taxZero(), ag2b = taxZero(), ag3out = taxZero(), ag3itc = taxZero();
            let hasG1 = false, hasG2a = false, hasG2b = false, hasG3 = false;
            
            await Promise.all(range.map(async (p) => {
                const [g1, g2a, g2b, g3] = await Promise.all([
                    loadReturn("gstr1", gstin, p, session, fetchMode),
                    loadReturn("gstr2a", gstin, p, session, fetchMode),
                    loadReturn("gstr2b", gstin, p, session, fetchMode),
                    loadReturn("gstr3b", gstin, p, session, fetchMode),
                ]);
                
                if (g1) { hasG1 = true; const st = sumSections(g1); ag1.taxable+=st.taxable; ag1.igst+=st.igst; ag1.cgst+=st.cgst; ag1.sgst+=st.sgst; ag1.cess+=st.cess; }
                if (g2a) { hasG2a = true; const st = sumSections(g2a); ag2a.taxable+=st.taxable; ag2a.igst+=st.igst; ag2a.cgst+=st.cgst; ag2a.sgst+=st.sgst; ag2a.cess+=st.cess; }
                if (g2b) { hasG2b = true; const st = total2bItc(g2b); ag2b.taxable+=st.taxable; ag2b.igst+=st.igst; ag2b.cgst+=st.cgst; ag2b.sgst+=st.sgst; ag2b.cess+=st.cess; }
                if (g3) {
                    hasG3 = true;
                    const st = totals3b(g3);
                    ag3out.taxable+=st.outward.taxable; ag3out.igst+=st.outward.igst; ag3out.cgst+=st.outward.cgst; ag3out.sgst+=st.outward.sgst; ag3out.cess+=st.outward.cess;
                    ag3itc.taxable+=st.itc.taxable; ag3itc.igst+=st.itc.igst; ag3itc.cgst+=st.itc.cgst; ag3itc.sgst+=st.itc.sgst; ag3itc.cess+=st.itc.cess;
                }
            }));
            
            if (!hasG1 && !hasG2a && !hasG2b && !hasG3) { toast.error("No data for this range"); return; }
            
            setT({
                g1: hasG1 ? ag1 : null,
                g2a: hasG2a ? ag2a : null,
                g2b: hasG2b ? ag2b : null,
                g3out: hasG3 ? ag3out : null,
                g3itc: hasG3 ? ag3itc : null,
            });
            setActiveRange(range.length === 1 ? periodLabel(range[0]) : `${periodLabel(range[0])} – ${periodLabel(range[range.length-1])}`);
        } catch (e: any) { toast.error(e.message); } finally { setLoading(false); }
    };

    return (
        <div>
            <div className="flex items-center justify-between mb-3 text-xs">
                <span className="chip chip-ok"><HiOutlineCheckCircle className="w-3.5 h-3.5" /> Session active</span>
                <span className="flex items-center gap-3 muted">
                    <span className="flex items-center gap-1"><HiOutlineClock className="w-3.5 h-3.5" /> {sessionMinutesLeft(session)}m left</span>
                    <button className="underline" onClick={onEnd}>End</button>
                </span>
            </div>

            <div className="flex flex-col gap-2 mb-3">
                <div className="flex gap-2 items-end">
                    <div className="flex-1"><label className="label">From</label>
                    <select className="input" value={fromFy} onChange={(e) => { setFromFy(e.target.value); setFromPeriod(fyPeriods(e.target.value)[0]); }}>
                        {fyList(6).map((y) => <option key={y} value={y}>FY {y}</option>)}
                    </select>
                    </div>
                    <div className="flex-1">
                    <select className="input" value={fromPeriod} onChange={(e) => setFromPeriod(e.target.value)}>
                        {fromPeriods.map((p) => <option key={p} value={p}>{periodLabel(p)}</option>)}
                    </select>
                    </div>
                </div>
                <div className="flex gap-2 items-end">
                    <div className="flex-1"><label className="label">To</label>
                    <select className="input" value={toFy} onChange={(e) => { setToFy(e.target.value); setToPeriod(fyPeriods(e.target.value)[0]); }}>
                        {fyList(6).map((y) => <option key={y} value={y}>FY {y}</option>)}
                    </select>
                    </div>
                    <div className="flex-1">
                    <select className="input" value={toPeriod} onChange={(e) => setToPeriod(e.target.value)}>
                        {toPeriods.map((p) => <option key={p} value={p}>{periodLabel(p)}</option>)}
                    </select>
                    </div>
                </div>
            </div>
            
            <div className="mb-3 px-1 flex items-center gap-2">
                <input type="checkbox" id="fetchModeCmp" checked={fetchMode === "all"} onChange={(e) => setFetchMode(e.target.checked ? "all" : "essential")} />
                <label htmlFor="fetchModeCmp" className="text-sm muted select-none cursor-pointer">Include all minor sections (consumes more API credits)</label>
            </div>
            <p className="text-[11px] muted mb-2 px-1">Estimated API credits: <b>~{creditsEst}</b></p>
            
            <button className="btn btn-primary w-full mb-4" onClick={run} disabled={loading}>
                {loading ? <span className="w-5 h-5 border-2 rounded-full animate-spin" style={{ borderColor: "rgba(255,255,255,.4)", borderTopColor: "#fff" }} /> : <HiOutlineScale className="w-5 h-5" />}
                {loading ? "Comparing…" : "Compare returns"}
            </button>

            {t && (
                <div className="animate-fade-in">
                    <h3 className="h2 text-center mb-3">Reconciliation for {activeRange}</h3>
                    <div className="flex justify-end mb-2">
                        <button className="btn btn-ghost btn-sm" onClick={() => downloadJson(`compare_${gstin}_${fromPeriod}-${toPeriod}.json`, t)}><HiOutlineArrowDownTray className="w-4 h-4" /> JSON</button>
                    </div>
                    <CompareCard title="GSTR-1 vs GSTR-3B" subtitle="Outward supplies / tax liability" aLabel="GSTR-1" bLabel="GSTR-3B · 3.1" a={t.g1} b={t.g3out} showTaxable />
                    <CompareCard title="GSTR-2B vs GSTR-3B" subtitle="ITC available vs ITC claimed" aLabel="GSTR-2B" bLabel="GSTR-3B · Tbl 4" a={t.g2b} b={t.g3itc} />
                    <CompareCard title="GSTR-2A vs GSTR-3B" subtitle="ITC (2A) vs ITC claimed" aLabel="GSTR-2A" bLabel="GSTR-3B · Tbl 4" a={t.g2a} b={t.g3itc} />
                    <p className="text-[11px] muted text-center mt-2">Small differences are often timing (e.g. amendments, IMS). GSTR-3B totals use table 3.1 (outward) and table 4 net ITC.</p>
                </div>
            )}
        </div>
    );
}

const HEADS: [keyof TaxTotal, string][] = [["taxable", "Taxable value"], ["igst", "IGST"], ["cgst", "CGST"], ["sgst", "SGST"], ["cess", "Cess"]];

function CompareCard({ title, subtitle, aLabel, bLabel, a, b, showTaxable }: {
    title: string; subtitle: string; aLabel: string; bLabel: string; a: TaxTotal | null; b: TaxTotal | null; showTaxable?: boolean;
}) {
    if (!a || !b) {
        return (
            <div className="card p-4 mb-3">
                <h3 className="h2">{title}</h3>
                <p className="muted text-sm mt-1">{!a ? `${aLabel} ` : ""}{!a && !b ? "and " : ""}{!b ? `${bLabel} ` : ""}not available for this period.</p>
            </div>
        );
    }
    const heads = HEADS.filter(([k]) => showTaxable || k !== "taxable");
    const rows = heads.map(([k, label]) => ({ label, av: a[k], bv: b[k], diff: a[k] - b[k] }));
    rows.push({ label: "Total tax", av: taxTotalTax(a), bv: taxTotalTax(b), diff: taxTotalTax(a) - taxTotalTax(b) });
    const mismatches = rows.filter((r) => Math.abs(r.diff) >= 1).length;
    return (
        <div className="card overflow-hidden mb-3">
            <div className="flex items-center justify-between p-3 pb-2 gap-2">
                <div><h3 className="font-semibold text-sm" style={{ color: "var(--color-text)" }}>{title}</h3><p className="text-[11px] muted">{subtitle}</p></div>
                <span className={`chip ${mismatches ? "chip-bad" : "chip-ok"}`}>{mismatches ? `${mismatches} mismatch${mismatches > 1 ? "es" : ""}` : "Matched"}</span>
            </div>
            <div className="overflow-x-auto">
                <table className="data-table">
                    <thead><tr><th>Head</th><th className="text-right">{aLabel}</th><th className="text-right">{bLabel}</th><th className="text-right">Difference</th></tr></thead>
                    <tbody>
                        {rows.map((r, i) => {
                            const match = Math.abs(r.diff) < 1;
                            return (
                                <tr key={i} style={i === rows.length - 1 ? { fontWeight: 700 } : undefined}>
                                    <td>{r.label}</td>
                                    <td className="text-right">{inr(r.av, 0)}</td>
                                    <td className="text-right">{inr(r.bv, 0)}</td>
                                    <td className="text-right">
                                        <span className={`chip ${match ? "chip-ok" : "chip-bad"}`}>{match ? "✓" : (r.diff > 0 ? "+" : "") + inr(r.diff, 0)}</span>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
