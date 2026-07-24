import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import {
    HiOutlinePlus, HiOutlineArrowPath, HiOutlineChevronRight, HiOutlineMagnifyingGlass,
    HiOutlineTrash, HiOutlineXMark, HiOutlineUserGroup,
} from "react-icons/hi2";
import { gstAPI } from "../api/gst";
import { listClients, upsertClient, removeClient } from "../utils/gstSession";
import { cacheGet, cacheSet } from "../utils/cache";
import { fyList, periodLabel, fyFilingGrid, filingSummary } from "../utils/gst";
import type { FilingCell } from "../utils/gst";
import type { GstClient } from "../types";

const TRACK_TTL = 6 * 60 * 60 * 1000;

async function loadTrack(gstin: string, fy: string, force = false): Promise<any[]> {
    const key = `track:${gstin}:${fy}`;
    if (!force) { const c = await cacheGet<any[]>(key, TRACK_TTL); if (c) return c; }
    const ef = await gstAPI.track(gstin, fy);
    await cacheSet(key, ef);
    return ef;
}

interface Status { gstr1: FilingCell[]; gstr3b: FilingCell[]; }

export default function Home() {
    const navigate = useNavigate();
    const [clients, setClients] = useState<GstClient[]>(listClients());
    const [fy, setFy] = useState(fyList()[0]);
    const [statuses, setStatuses] = useState<Record<string, Status>>({});
    const [loading, setLoading] = useState(false);
    const [showAdd, setShowAdd] = useState(false);

    const loadAll = async (force = false) => {
        const list = listClients();
        if (!list.length) { setStatuses({}); return; }
        setLoading(true);
        const next: Record<string, Status> = {};
        await Promise.all(list.map(async (c) => {
            try {
                const ef = await loadTrack(c.gstin, fy, force);
                next[c.gstin] = { gstr1: fyFilingGrid(ef, fy, "GSTR1"), gstr3b: fyFilingGrid(ef, fy, "GSTR3B") };
            } catch { /* skip failed client */ }
        }));
        setStatuses(next);
        setLoading(false);
    };

    useEffect(() => { loadAll(); /* eslint-disable-next-line */ }, [fy, clients.length]);

    const del = (gstin: string) => { removeClient(gstin); setClients(listClients()); };

    return (
        <div className="page">
            {/* Toolbar */}
            <div className="flex items-center justify-between gap-3 mb-5">
                <div>
                    <h1 className="h1">Clients</h1>
                    <p className="muted text-sm mt-0.5">{clients.length} GSTIN{clients.length !== 1 ? "s" : ""} · filing status FY {fy}</p>
                </div>
                <div className="flex items-center gap-2">
                    <select className="input btn-sm w-auto" value={fy} onChange={(e) => setFy(e.target.value)} style={{ minHeight: 34 }}>
                        {fyList(6).map((y) => <option key={y} value={y}>FY {y}</option>)}
                    </select>
                    <button className="btn btn-ghost btn-sm" onClick={() => loadAll(true)} disabled={loading} title="Refresh">
                        <HiOutlineArrowPath className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
                    </button>
                    <button className="btn btn-primary btn-sm" onClick={() => setShowAdd((s) => !s)}>
                        <HiOutlinePlus className="w-4 h-4" /> Add
                    </button>
                </div>
            </div>

            {showAdd && <AddClient onDone={() => { setShowAdd(false); setClients(listClients()); }} onCancel={() => setShowAdd(false)} />}

            {/* Legend */}
            <div className="flex flex-wrap gap-3 mb-3 text-xs muted">
                <Legend cls="cell-ok" label="Filed on time" />
                <Legend cls="cell-late" label="Filed late" />
                <Legend cls="cell-bad" label="Not filed" />
                <Legend cls="cell-upcoming" label="Not due yet" />
            </div>

            {clients.length === 0 ? (
                <div className="card p-12 text-center relative overflow-hidden flex flex-col items-center justify-center">
                    <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: "radial-gradient(circle at center, var(--color-primary) 2px, transparent 2px)", backgroundSize: "24px 24px" }} />
                    <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4 animate-float relative z-10" style={{ background: "var(--color-primary-soft)" }}>
                        <HiOutlineUserGroup className="w-8 h-8" style={{ color: "var(--color-primary)" }} />
                    </div>
                    <p className="font-bold text-lg relative z-10" style={{ color: "var(--color-text)" }}>No clients yet</p>
                    <p className="muted text-sm mt-1.5 mb-6 max-w-sm relative z-10">Add a client GSTIN to instantly track its GST filing status month-by-month.</p>
                    <button className="btn btn-primary relative z-10 shadow-lg shadow-indigo-500/20" onClick={() => setShowAdd(true)}>
                        <HiOutlinePlus className="w-5 h-5" /> Add your first client
                    </button>
                </div>
            ) : (
                <div className="space-y-2.5">
                    {clients.map((c) => (
                        <div key={c.gstin} className="card card-hover p-3.5 flex items-center gap-3 cursor-pointer" onClick={() => navigate(`/client/${c.gstin}`)}>
                            <div className="min-w-0 flex-1">
                                <p className="font-semibold truncate" style={{ color: "var(--color-text)" }}>{c.tradeName || c.legalName || c.gstin}</p>
                                <p className="font-mono text-xs truncate muted">{c.gstin}</p>
                                <div className="mt-2 space-y-1.5">
                                    <StripRow label="GSTR-1" cells={statuses[c.gstin]?.gstr1} loading={loading && !statuses[c.gstin]} />
                                    <StripRow label="GSTR-3B" cells={statuses[c.gstin]?.gstr3b} loading={loading && !statuses[c.gstin]} />
                                </div>
                            </div>
                            <div className="flex flex-col items-end gap-2 shrink-0">
                                <button onClick={(e) => { e.stopPropagation(); del(c.gstin); }} className="p-1.5 rounded-lg" style={{ color: "var(--color-text-muted)" }} title="Remove">
                                    <HiOutlineTrash className="w-4 h-4" />
                                </button>
                                <HiOutlineChevronRight className="w-5 h-5" style={{ color: "var(--color-text-muted)" }} />
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

function Legend({ cls, label }: { cls: string; label: string }) {
    return <span className="flex items-center gap-1.5"><span className={`${cls} w-3 h-3 rounded`} style={{ minHeight: 0, padding: 0 }} /> {label}</span>;
}

function StripRow({ label, cells, loading }: { label: string; cells?: FilingCell[]; loading?: boolean }) {
    const summ = cells ? filingSummary(cells) : null;
    return (
        <div className="flex items-center gap-2">
            <span className="text-[10px] font-semibold w-14 shrink-0 muted">{label}</span>
            <div className="flex gap-[3px] flex-wrap">
                {cells
                    ? cells.map((c) => <span key={c.period} title={`${periodLabel(c.period)} · ${c.state}`} className={`${STATE_TO_CELL[c.state]} rounded-[3px]`} style={{ width: 15, height: 15, minHeight: 0, padding: 0 }} />)
                    : Array.from({ length: 12 }).map((_, i) => <span key={i} className={`rounded-[3px] ${loading ? "skeleton" : ""}`} style={{ width: 15, height: 15, background: "var(--color-surface-hover)", opacity: loading ? 1 : 0.3 }} />)}
            </div>
            {summ && (summ.late > 0 || summ.notfiled > 0) && (
                <span className="text-[10px] font-semibold" style={{ color: summ.notfiled ? "var(--color-bad)" : "var(--color-late)" }}>
                    {summ.notfiled ? `${summ.notfiled} pending` : `${summ.late} late`}
                </span>
            )}
        </div>
    );
}

const STATE_TO_CELL: Record<string, string> = { ontime: "cell-ok", late: "cell-late", notfiled: "cell-bad", upcoming: "cell-upcoming" };

function AddClient({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
    const [gstin, setGstin] = useState("");
    const [gu, setGu] = useState("");
    const [tp, setTp] = useState<{ tradeNam?: string; lgnm?: string } | null>(null);
    const [busy, setBusy] = useState(false);
    const valid = /^[0-9A-Z]{15}$/.test(gstin);

    const lookup = async () => {
        if (!valid) return toast.error("Enter a valid 15-char GSTIN");
        setBusy(true); setTp(null);
        try {
            const r = await gstAPI.search(gstin);
            if (r.ok && r.taxpayer) setTp(r.taxpayer);
            else toast.error(r.message || "Not found");
        } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
    };
    const save = () => {
        if (!valid) return toast.error("Enter a valid GSTIN");
        upsertClient({ gstin, gstUsername: gu.trim(), tradeName: tp?.tradeNam, legalName: tp?.lgnm });
        toast.success("Client added");
        onDone();
    };

    return (
        <div className="card p-4 mb-4 animate-fade-in">
            <div className="flex items-center justify-between mb-3">
                <h2 className="h2">Add client</h2>
                <button onClick={onCancel} className="p-1 muted"><HiOutlineXMark className="w-5 h-5" /></button>
            </div>
            <label className="label">GSTIN</label>
            <div className="flex gap-2 mb-3">
                <input className="input font-mono" placeholder="e.g. 32HAOPP1162B1ZX" maxLength={15} value={gstin}
                    onChange={(e) => setGstin(e.target.value.toUpperCase().replace(/[^0-9A-Z]/g, ""))} onKeyDown={(e) => e.key === "Enter" && lookup()} />
                <button className="btn btn-ghost shrink-0" onClick={lookup} disabled={!valid || busy}>
                    {busy ? <span className="w-4 h-4 border-2 rounded-full animate-spin" style={{ borderColor: "var(--color-border)", borderTopColor: "var(--color-primary)" }} /> : <HiOutlineMagnifyingGlass className="w-4 h-4" />}
                </button>
            </div>
            {tp && (
                <div className="rounded-lg p-2.5 mb-3 text-sm" style={{ background: "var(--color-primary-soft)" }}>
                    <span className="font-semibold" style={{ color: "var(--color-text)" }}>{tp.tradeNam || tp.lgnm}</span>
                    {tp.lgnm && tp.tradeNam && <span className="muted"> · {tp.lgnm}</span>}
                </div>
            )}
            <label className="label">GST portal username <span className="muted">(optional — needed later for reports)</span></label>
            <input className="input mb-3" placeholder="gst.gov.in login" value={gu} autoCapitalize="none" onChange={(e) => setGu(e.target.value.trim())} />
            <div className="flex gap-2 justify-end">
                <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
                <button className="btn btn-primary" onClick={save} disabled={!valid}>Add client</button>
            </div>
        </div>
    );
}
