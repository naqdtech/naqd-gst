import React, { useMemo, useState } from "react";
import toast from "react-hot-toast";
import { HiOutlineArrowPath, HiOutlineClock, HiOutlineCheckCircle, HiOutlineArrowDownTray, HiOutlineScale } from "react-icons/hi2";
import { gstAPI } from "../api/gst";
import { sessionMinutesLeft } from "../utils/gstSession";
import { cacheGet, cacheSet } from "../utils/cache";
import {
    fyList, fyPeriods, periodLabel, GSTR1_SECTIONS, GSTR2A_SECTIONS,
    sumSections, total2bItc, totals3b, taxTotalTax,
} from "../utils/gst";
import { downloadJson } from "../utils/gstExport";
import { inr } from "../utils/format";
import OtpGate from "./OtpGate";
import type { GstSession } from "../types";
import type { TaxTotal } from "../utils/gst";

const TTL = 24 * 60 * 60 * 1000;

/** Fetch a return, reusing the SAME cache keys the Reports tab writes (so comparison is near-free). */
async function loadReturn(type: string, gstin: string, period: string, s: GstSession): Promise<any | null> {
    const short = type === "gstr2b" ? "2b" : type === "gstr3b" ? "3b" : type;
    const key = `rep:${gstin}:${short}:${period}`;
    const c = cacheGet<any>(key, TTL);
    if (c) return c;
    let raw: any = null;
    if (type === "gstr2b") { const r = await gstAPI.fetchSection("gstr2b", "all", gstin, period, s.txn, s.gstUsername); raw = r.ok ? r.data : null; }
    else if (type === "gstr3b") { const r = await gstAPI.fetch3b(gstin, period, s.txn, s.gstUsername); raw = r.ok ? r.data : null; }
    else {
        const secs = type === "gstr1" ? GSTR1_SECTIONS : GSTR2A_SECTIONS;
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
    const [fy, setFy] = useState(fyList()[0]);
    const periods = useMemo(() => fyPeriods(fy), [fy]);
    const [period, setPeriod] = useState(fyPeriods(fyList()[0])[0]);
    const [loading, setLoading] = useState(false);
    const [t, setT] = useState<Totals | null>(null);

    const run = async () => {
        setLoading(true); setT(null);
        try {
            const [g1, g2a, g2b, g3] = await Promise.all([
                loadReturn("gstr1", gstin, period, session),
                loadReturn("gstr2a", gstin, period, session),
                loadReturn("gstr2b", gstin, period, session),
                loadReturn("gstr3b", gstin, period, session),
            ]);
            if (!g1 && !g2a && !g2b && !g3) { toast.error("No data for this period (or session expired)"); return; }
            const t3 = g3 ? totals3b(g3) : null;
            setT({
                g1: g1 ? sumSections(g1) : null,
                g2a: g2a ? sumSections(g2a) : null,
                g2b: g2b ? total2bItc(g2b) : null,
                g3out: t3 ? t3.outward : null,
                g3itc: t3 ? t3.itc : null,
            });
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

            <div className="flex gap-2 mb-3">
                <select className="input flex-1" value={fy} onChange={(e) => { setFy(e.target.value); setPeriod(fyPeriods(e.target.value)[0]); }}>
                    {fyList(6).map((y) => <option key={y} value={y}>FY {y}</option>)}
                </select>
                <select className="input flex-1" value={period} onChange={(e) => setPeriod(e.target.value)}>
                    {periods.map((p) => <option key={p} value={p}>{periodLabel(p)}</option>)}
                </select>
            </div>
            <button className="btn btn-primary w-full mb-4" onClick={run} disabled={loading}>
                {loading ? <span className="w-5 h-5 border-2 rounded-full animate-spin" style={{ borderColor: "rgba(255,255,255,.4)", borderTopColor: "#fff" }} /> : <HiOutlineScale className="w-5 h-5" />}
                {loading ? "Comparing…" : "Compare returns"}
            </button>

            {t && (
                <div className="animate-fade-in">
                    <div className="flex justify-end mb-2">
                        <button className="btn btn-ghost btn-sm" onClick={() => downloadJson(`compare_${gstin}_${period}.json`, t)}><HiOutlineArrowDownTray className="w-4 h-4" /> JSON</button>
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
