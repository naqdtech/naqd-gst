import React, { useMemo, useState } from "react";
import toast from "react-hot-toast";
import {
    HiOutlineShieldCheck, HiOutlineKey, HiOutlineArrowPath, HiOutlineArrowDownTray,
    HiOutlineClock, HiOutlineCheckCircle,
} from "react-icons/hi2";
import { gstAPI } from "../api/gst";
import { getSession, setSession, clearSession, sessionMinutesLeft } from "../utils/gstSession";
import { upsertClient, getClient } from "../utils/gstSession";
import { cacheGet, cacheSet } from "../utils/cache";
import {
    fyList, fyPeriods, periodLabel, flattenGstr2b, totalsGstr2b,
    flattenInvSection, isInvoiceSection, GSTR1_SECTIONS, GSTR2A_SECTIONS, parse3b, ledgerRows,
} from "../utils/gst";
import { downloadJson, downloadCsv, downloadWorkbook } from "../utils/gstExport";
import { inr } from "../utils/format";
import type { GstSession } from "../types";
import type { TaxBlock } from "../utils/gst";

const REPORT_TTL = 24 * 60 * 60 * 1000;

async function cached<T>(key: string, producer: () => Promise<T | null>): Promise<T | null> {
    const c = cacheGet<T>(key, REPORT_TTL);
    if (c) return c;
    const v = await producer();
    if (v != null) cacheSet(key, v);
    return v;
}

type ReportType = "gstr2b" | "gstr2a" | "gstr1" | "gstr3b" | "cash" | "credit";
const REPORTS: { key: ReportType; label: string; kind: "month" | "range" }[] = [
    { key: "gstr2b", label: "GSTR-2B", kind: "month" },
    { key: "gstr2a", label: "GSTR-2A", kind: "month" },
    { key: "gstr1", label: "GSTR-1 / 1A", kind: "month" },
    { key: "gstr3b", label: "GSTR-3B", kind: "month" },
    { key: "cash", label: "Cash ledger", kind: "range" },
    { key: "credit", label: "Credit ledger", kind: "range" },
];

/** YYYY-MM-DD (date input) → DD-MM-YYYY (API). */
const toApiDate = (iso: string) => iso.split("-").reverse().join("-");
const fyStartISO = (fy: string) => `${fy.slice(0, 4)}-04-01`;
const todayISO = () => new Date().toISOString().slice(0, 10);

export default function GstReports({ gstin, gstUsername }: { gstin: string; gstUsername?: string }) {
    const [session, setSess] = useState<GstSession | null>(getSession(gstin));
    if (!session) return <OtpPanel gstin={gstin} gstUsername={gstUsername} onDone={(s) => setSess(s)} />;
    return <Runner session={session} onEnd={() => { clearSession(gstin); setSess(null); }} />;
}

// ── OTP ──
function OtpPanel({ gstin, gstUsername, onDone }: { gstin: string; gstUsername?: string; onDone: (s: GstSession) => void }) {
    const [gu, setGu] = useState(gstUsername || getClient(gstin)?.gstUsername || "");
    const [txn, setTxn] = useState("");
    const [otp, setOtp] = useState("");
    const [stage, setStage] = useState<"idle" | "sent">("idle");
    const [busy, setBusy] = useState(false);

    const send = async () => {
        if (!gu.trim()) return toast.error("Enter the GST portal username");
        setBusy(true);
        try {
            const r = await gstAPI.otpRequest(gstin, gu.trim());
            if (r.ok && r.txn) { setTxn(r.txn); setStage("sent"); toast.success("OTP sent to the taxpayer's registered mobile/email"); }
            else toast.error(r.message || "Could not send OTP");
        } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
    };
    const verify = async () => {
        if (!/^\d{6}$/.test(otp)) return toast.error("Enter the 6-digit OTP");
        setBusy(true);
        try {
            const r = await gstAPI.verifyOtp(gstin, gu.trim(), txn, otp);
            if (r.ok && r.txn) {
                const s: GstSession = { gstin, gstUsername: gu.trim(), txn: r.txn, authAt: Date.now() };
                setSession(s);
                const c = getClient(gstin);
                if (c) upsertClient({ ...c, gstUsername: gu.trim() });
                toast.success("Session active for ~6 hours");
                onDone(s);
            } else toast.error(r.message || "OTP verification failed");
        } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
    };

    return (
        <div className="card p-5 max-w-md mx-auto">
            <div className="flex items-center gap-2 mb-1">
                <HiOutlineShieldCheck className="w-5 h-5" style={{ color: "var(--color-primary)" }} />
                <h2 className="h2">Authenticate to view reports</h2>
            </div>
            <p className="muted text-sm mb-4">A one-time OTP unlocks all reports for this client for ~6 hours.</p>
            <label className="label">GST portal username</label>
            <input className="input mb-3" placeholder="gst.gov.in login of this GSTIN" value={gu} autoCapitalize="none" onChange={(e) => setGu(e.target.value.trim())} />
            {stage === "idle" ? (
                <button className="btn btn-primary w-full" onClick={send} disabled={busy}>
                    <HiOutlineShieldCheck className="w-5 h-5" /> {busy ? "Sending OTP…" : "Send OTP"}
                </button>
            ) : (
                <div className="animate-fade-in">
                    <label className="label">Enter OTP</label>
                    <input className="input mb-3 text-center text-lg tracking-[0.4em] font-mono" placeholder="––––––" inputMode="numeric" maxLength={6} autoFocus
                        value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))} onKeyDown={(e) => e.key === "Enter" && verify()} />
                    <div className="grid grid-cols-2 gap-2">
                        <button className="btn btn-ghost" onClick={send} disabled={busy}>Resend</button>
                        <button className="btn btn-primary" onClick={verify} disabled={busy || otp.length !== 6}><HiOutlineKey className="w-5 h-5" /> Verify</button>
                    </div>
                </div>
            )}
            <p className="text-[11px] muted mt-3">OTP goes to the taxpayer's GST-registered mobile/email. API access must be enabled on the GST portal.</p>
        </div>
    );
}

// ── Report runner ──
function Runner({ session, onEnd }: { session: GstSession; onEnd: () => void }) {
    const { gstin } = session;
    const [type, setType] = useState<ReportType>("gstr2b");
    const [fy, setFy] = useState(fyList()[0]);
    const periods = useMemo(() => fyPeriods(fy), [fy]);
    const [period, setPeriod] = useState(() => fyPeriods(fyList()[0])[0]);
    const [frdt, setFrdt] = useState(fyStartISO(fyList()[0]));
    const [todt, setTodt] = useState(todayISO());
    const [loading, setLoading] = useState(false);
    const [report, setReport] = useState<{ type: ReportType; raw: any; label: string } | null>(null);

    const kind = REPORTS.find((r) => r.key === type)!.kind;

    const run = async () => {
        setLoading(true); setReport(null);
        try {
            const s = session;
            if (type === "gstr2b") {
                const raw = await cached(`rep:${gstin}:2b:${period}`, async () => { const r = await gstAPI.fetchSection("gstr2b", "all", gstin, period, s.txn, s.gstUsername); return r.ok ? r.data : null; });
                raw ? setReport({ type, raw, label: periodLabel(period) }) : toast.error("No GSTR-2B for this period (or session expired)");
            } else if (type === "gstr1" || type === "gstr2a") {
                const secs = type === "gstr1" ? GSTR1_SECTIONS : GSTR2A_SECTIONS;
                const raw = await cached(`rep:${gstin}:${type}:${period}`, async () => {
                    const acc: Record<string, any> = {};
                    for (const sec of secs) { try { const r = await gstAPI.fetchSection(type, sec, gstin, period, s.txn, s.gstUsername); if (r.ok && r.data) acc[sec] = (r.data as any)[sec] ?? r.data; } catch { /* skip */ } }
                    return Object.keys(acc).length ? acc : null;
                });
                raw ? setReport({ type, raw, label: periodLabel(period) }) : toast.error("No data for this period (or session expired)");
            } else if (type === "gstr3b") {
                const raw = await cached(`rep:${gstin}:3b:${period}`, async () => { const r = await gstAPI.fetch3b(gstin, period, s.txn, s.gstUsername); return r.ok ? r.data : null; });
                raw ? setReport({ type, raw, label: periodLabel(period) }) : toast.error("No GSTR-3B for this period (or session expired)");
            } else {
                const f = toApiDate(frdt), t = toApiDate(todt);
                const raw = await cached(`rep:${gstin}:${type}:${f}_${t}`, async () => { const r = await gstAPI.fetchLedger(type as "cash" | "credit", gstin, f, t, s.txn, s.gstUsername); return r.ok ? r.data : null; });
                raw ? setReport({ type, raw, label: `${f} – ${t}` }) : toast.error("No ledger data (or session expired)");
            }
        } catch (e: any) { toast.error(e.message); } finally { setLoading(false); }
    };

    return (
        <div>
            {/* session banner */}
            <div className="flex items-center justify-between mb-3 text-xs">
                <span className="chip chip-ok"><HiOutlineCheckCircle className="w-3.5 h-3.5" /> Session active</span>
                <span className="flex items-center gap-3 muted">
                    <span className="flex items-center gap-1"><HiOutlineClock className="w-3.5 h-3.5" /> {sessionMinutesLeft(session)}m left</span>
                    <button className="underline" onClick={onEnd}>End</button>
                </span>
            </div>

            {/* report type */}
            <div className="flex gap-1.5 overflow-x-auto pb-1 mb-3">
                {REPORTS.map((r) => (
                    <button key={r.key} onClick={() => { setType(r.key); setReport(null); }} className="btn btn-sm shrink-0"
                        style={{ background: type === r.key ? "var(--color-primary)" : "var(--color-surface)", color: type === r.key ? "#fff" : "var(--color-text-secondary)", border: `1px solid ${type === r.key ? "var(--color-primary)" : "var(--color-border)"}` }}>
                        {r.label}
                    </button>
                ))}
            </div>

            {/* period / date selector */}
            {kind === "month" ? (
                <div className="flex gap-2 mb-3">
                    <select className="input flex-1" value={fy} onChange={(e) => { setFy(e.target.value); setPeriod(fyPeriods(e.target.value)[0]); }}>
                        {fyList(6).map((y) => <option key={y} value={y}>FY {y}</option>)}
                    </select>
                    <select className="input flex-1" value={period} onChange={(e) => setPeriod(e.target.value)}>
                        {periods.map((p) => <option key={p} value={p}>{periodLabel(p)}</option>)}
                    </select>
                </div>
            ) : (
                <div className="flex gap-2 mb-3 items-end">
                    <div className="flex-1"><label className="label">From</label><input type="date" className="input" value={frdt} max={todt} onChange={(e) => setFrdt(e.target.value)} /></div>
                    <div className="flex-1"><label className="label">To</label><input type="date" className="input" value={todt} min={frdt} max={todayISO()} onChange={(e) => setTodt(e.target.value)} /></div>
                </div>
            )}

            <button className="btn btn-primary w-full mb-4" onClick={run} disabled={loading}>
                {loading ? <span className="w-5 h-5 border-2 rounded-full animate-spin" style={{ borderColor: "rgba(255,255,255,.4)", borderTopColor: "#fff" }} /> : <HiOutlineArrowPath className="w-5 h-5" />}
                {loading ? "Fetching…" : `Fetch ${REPORTS.find((r) => r.key === type)!.label}`}
            </button>

            {report && report.type === "gstr2b" && <Gstr2bView data={report.raw} name={`GSTR2B_${gstin}_${period}`} />}
            {report && (report.type === "gstr1" || report.type === "gstr2a") && <InvoiceView sections={report.raw} kind={report.type} name={`${report.type}_${gstin}_${period}`} />}
            {report && report.type === "gstr3b" && <Gstr3bView data={report.raw} name={`GSTR3B_${gstin}_${period}`} />}
            {report && (report.type === "cash" || report.type === "credit") && <LedgerView data={report.raw} label={report.type === "cash" ? "Electronic Cash Ledger" : "Electronic Credit Ledger"} name={`${report.type}ledger_${gstin}`} />}
        </div>
    );
}

// ── shared bits ──
function Tiles({ items }: { items: [string, string, boolean?][] }) {
    return (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
            {items.map(([label, value, accent], i) => (
                <div key={i} className="card p-3">
                    <p className="text-[11px] muted">{label}</p>
                    <p className="text-lg font-bold mt-0.5" style={{ color: accent ? "var(--color-primary)" : "var(--color-text)" }}>{value}</p>
                </div>
            ))}
        </div>
    );
}
function DownloadRow({ onXlsx, onCsv, onJson, disabled }: { onXlsx?: () => void; onCsv?: () => void; onJson: () => void; disabled?: boolean }) {
    return (
        <div className="flex gap-2 mb-3 flex-wrap">
            {onXlsx && <button className="btn btn-ghost btn-sm" onClick={onXlsx} disabled={disabled}><HiOutlineArrowDownTray className="w-4 h-4" /> Excel</button>}
            {onCsv && <button className="btn btn-ghost btn-sm" onClick={onCsv} disabled={disabled}><HiOutlineArrowDownTray className="w-4 h-4" /> CSV</button>}
            <button className="btn btn-ghost btn-sm" onClick={onJson}><HiOutlineArrowDownTray className="w-4 h-4" /> JSON</button>
        </div>
    );
}

// ── GSTR-2B ──
function Gstr2bView({ data, name }: { data: any; name: string }) {
    const rows = useMemo(() => flattenGstr2b(data), [data]);
    const t = useMemo(() => totalsGstr2b(data, ""), [data]);
    return (
        <div className="animate-fade-in">
            <Tiles items={[["Taxable value", inr(t.taxable, 2)], ["Total ITC", inr(t.tax, 2), true], ["Documents", String(t.docs)], ["CGST+SGST", inr(t.cgst + t.sgst, 0)]]} />
            <DownloadRow onXlsx={() => downloadWorkbook(`${name}.xlsx`, [{ name: "GSTR-2B", rows }])} onCsv={() => downloadCsv(`${name}.csv`, rows)} onJson={() => downloadJson(`${name}.json`, data)} disabled={!rows.length} />
            {rows.length > 0 && (
                <div className="card overflow-x-auto">
                    <table className="data-table">
                        <thead><tr><th>Supplier</th><th>Invoice</th><th className="text-right">Taxable</th><th className="text-right">ITC</th><th className="text-center">Avl</th></tr></thead>
                        <tbody>
                            {rows.map((r, i) => (
                                <tr key={i}>
                                    <td><div className="max-w-[160px] truncate">{r.supplier || r.supplier_gstin}</div><div className="font-mono text-[10px] muted">{r.supplier_gstin}</div></td>
                                    <td>{r.inv_no}<div className="text-[10px] muted">{r.inv_date}</div></td>
                                    <td className="text-right">{inr(r.taxable, 0)}</td>
                                    <td className="text-right">{inr((+r.igst || 0) + (+r.cgst || 0) + (+r.sgst || 0), 0)}</td>
                                    <td className="text-center"><span className={`chip ${r.itc_avl === "Y" ? "chip-ok" : "chip-bad"}`}>{r.itc_avl}</span></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

// ── GSTR-1 / GSTR-2A (multi-section) ──
function InvoiceView({ sections, kind, name }: { sections: Record<string, any>; kind: string; name: string }) {
    const rows = useMemo(() => Object.entries(sections).flatMap(([s, arr]) => (isInvoiceSection(s) ? flattenInvSection(arr, s.toUpperCase()) : [])), [sections]);
    const t = rows.reduce((a, r) => { a.taxable += r.taxable; a.igst += r.igst; a.cgst += r.cgst; a.sgst += r.sgst; a.cess += r.cess; return a; }, { taxable: 0, igst: 0, cgst: 0, sgst: 0, cess: 0 });
    const tax = t.igst + t.cgst + t.sgst + t.cess;
    const extras = Object.entries(sections).filter(([s, a]) => !isInvoiceSection(s) && (Array.isArray(a) ? a.length : a)).map(([s, a]) => `${s.toUpperCase()}${Array.isArray(a) ? ` (${a.length})` : ""}`);
    const sheets = [{ name: "Invoices", rows }, ...Object.entries(sections).filter(([s, a]) => !isInvoiceSection(s) && Array.isArray(a) && a.length).map(([s, a]) => ({ name: s.toUpperCase().slice(0, 28), rows: a as any[] }))];
    return (
        <div className="animate-fade-in">
            <Tiles items={[["Taxable value", inr(t.taxable, 2)], [kind === "gstr1" ? "Total tax" : "Total ITC", inr(tax, 2), true], ["Invoices", String(rows.length)], ["Sections", String(Object.keys(sections).length)]]} />
            <DownloadRow onXlsx={() => downloadWorkbook(`${name}.xlsx`, sheets)} onCsv={() => downloadCsv(`${name}.csv`, rows)} onJson={() => downloadJson(`${name}.json`, sections)} disabled={!rows.length && !extras.length} />
            {extras.length > 0 && <p className="text-[11px] muted mb-2">Also in the download: {extras.join(", ")}</p>}
            {rows.length > 0 && (
                <div className="card overflow-x-auto">
                    <table className="data-table">
                        <thead><tr><th>Sec</th><th>{kind === "gstr1" ? "Buyer" : "Supplier"} / Doc</th><th className="text-right">Taxable</th><th className="text-right">Tax</th></tr></thead>
                        <tbody>
                            {rows.map((r, i) => (
                                <tr key={i}>
                                    <td className="text-[10px] muted">{r.section}</td>
                                    <td>{r.doc_no}<div className="font-mono text-[10px] muted">{r.ctin} · {r.doc_date}</div></td>
                                    <td className="text-right">{inr(r.taxable, 0)}</td>
                                    <td className="text-right">{inr(r.tax, 0)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

// ── GSTR-3B ──
function Gstr3bView({ data, name }: { data: any; name: string }) {
    const blocks: TaxBlock[] = useMemo(() => parse3b(data), [data]);
    return (
        <div className="animate-fade-in">
            <DownloadRow onJson={() => downloadJson(`${name}.json`, data)} />
            {blocks.length === 0 && <div className="card p-4 muted text-sm">Fetched, but couldn't map the summary — the raw data is in the JSON download.</div>}
            {blocks.map((b) => (
                <div key={b.block} className="card overflow-x-auto mb-3">
                    <div className="px-3 pt-3"><h3 className="font-semibold text-sm" style={{ color: "var(--color-text)" }}><span className="muted">{b.block}</span> · {b.label}</h3></div>
                    <table className="data-table mt-2">
                        <thead><tr><th>Particulars</th><th className="text-right">Taxable</th><th className="text-right">IGST</th><th className="text-right">CGST</th><th className="text-right">SGST</th><th className="text-right">Cess</th></tr></thead>
                        <tbody>
                            {b.rows.map((r, i) => (
                                <tr key={i}>
                                    <td>{r.label}</td>
                                    <td className="text-right">{r.txval != null ? inr(r.txval, 0) : "—"}</td>
                                    <td className="text-right">{inr(r.igst, 0)}</td>
                                    <td className="text-right">{inr(r.cgst, 0)}</td>
                                    <td className="text-right">{inr(r.sgst, 0)}</td>
                                    <td className="text-right">{inr(r.cess, 0)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ))}
        </div>
    );
}

// ── Ledgers ──
function LedgerView({ data, label, name }: { data: any; label: string; name: string }) {
    const rows = useMemo(() => ledgerRows(data), [data]);
    const cols = useMemo(() => {
        const set = new Set<string>();
        for (const r of rows) for (const k of Object.keys(r)) if (typeof r[k] !== "object") set.add(k);
        return Array.from(set).slice(0, 10);
    }, [rows]);
    return (
        <div className="animate-fade-in">
            <div className="flex items-center justify-between mb-2"><h3 className="h2">{label}</h3><span className="chip chip-muted">{rows.length} entries</span></div>
            <DownloadRow onCsv={() => downloadCsv(`${name}.csv`, rows)} onJson={() => downloadJson(`${name}.json`, data)} disabled={!rows.length} />
            {rows.length > 0 ? (
                <div className="card overflow-x-auto">
                    <table className="data-table">
                        <thead><tr>{cols.map((c) => <th key={c} className={/amt|bal|amount/i.test(c) ? "text-right" : ""}>{c}</th>)}</tr></thead>
                        <tbody>
                            {rows.map((r, i) => (
                                <tr key={i}>{cols.map((c) => <td key={c} className={/amt|bal|amount/i.test(c) ? "text-right" : ""}>{typeof r[c] === "number" ? inr(r[c], 0) : String(r[c] ?? "")}</td>)}</tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ) : <div className="card p-4 muted text-sm">No transactions in this range — the raw data is in the JSON download.</div>}
        </div>
    );
}
