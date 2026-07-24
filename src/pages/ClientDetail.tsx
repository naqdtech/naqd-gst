import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import {
    HiOutlineArrowLeft, HiOutlineArrowPath, HiOutlineDocumentText,
    HiOutlineScale, HiOutlineClipboardDocumentList,
} from "react-icons/hi2";
import { gstAPI } from "../api/gst";
import GstReports from "../components/GstReports";
import GstCompare from "../components/GstCompare";
import { getClient } from "../utils/gstSession";
import { cacheGet, cacheSet } from "../utils/cache";
import { fyList, periodLabel, fyFilingGrid, filingSummary, STATE_LABEL, STATE_CELL } from "../utils/gst";
import type { FilingCell } from "../utils/gst";
import type { GstClient, GstTaxpayer } from "../types";

const TRACK_TTL = 6 * 60 * 60 * 1000;
async function loadTrack(gstin: string, fy: string, force = false): Promise<any[]> {
    const key = `track:${gstin}:${fy}`;
    if (!force) { const c = await cacheGet<any[]>(key, TRACK_TTL); if (c) return c; }
    const ef = await gstAPI.track(gstin, fy);
    await cacheSet(key, ef);
    return ef;
}

type Tab = "returns" | "reports" | "compare";

export default function ClientDetail() {
    const { gstin = "" } = useParams();
    const navigate = useNavigate();
    const client: GstClient | null = getClient(gstin);
    const [tp, setTp] = useState<GstTaxpayer | null>(null);
    const [fy, setFy] = useState(fyList()[0]);
    const [tab, setTab] = useState<Tab>("returns");
    const [g1, setG1] = useState<FilingCell[] | null>(null);
    const [g3, setG3] = useState<FilingCell[] | null>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        const key = `tp:${gstin}`;
        cacheGet<GstTaxpayer>(key, 30 * 24 * 60 * 60 * 1000).then((c) => {
            if (c) { setTp(c); return; }
            gstAPI.search(gstin).then((r) => { if (r.ok && r.taxpayer) { setTp(r.taxpayer); cacheSet(key, r.taxpayer); } }).catch(() => { });
        });
    }, [gstin]);

    const loadReturns = async (force = false) => {
        setLoading(true);
        try {
            const ef = await loadTrack(gstin, fy, force);
            setG1(fyFilingGrid(ef, fy, "GSTR1"));
            setG3(fyFilingGrid(ef, fy, "GSTR3B"));
        } catch (e: any) {
            toast.error(e.message || "Failed to load filing status");
        } finally {
            setLoading(false);
        }
    };
    useEffect(() => { loadReturns(); /* eslint-disable-next-line */ }, [fy, gstin]);

    const name = client?.tradeName || tp?.tradeNam || client?.legalName || tp?.lgnm || gstin;

    return (
        <div className="page">
            <button onClick={() => navigate("/")} className="btn btn-ghost btn-sm mb-4"><HiOutlineArrowLeft className="w-4 h-4" /> Clients</button>

            <div className="card p-4 mb-4">
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <h1 className="h1 truncate">{name}</h1>
                        <p className="font-mono text-sm muted mt-0.5">{gstin}</p>
                        {tp?.lgnm && tp?.tradeNam && <p className="text-sm muted truncate">{tp.lgnm}</p>}
                    </div>
                    {tp?.sts && <span className={`chip ${tp.sts === "Active" ? "chip-ok" : "chip-muted"} shrink-0`}>{tp.sts}</span>}
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs muted">
                    {tp?.dty && <span>{tp.dty}</span>}
                    {tp?.ctb && <span>{tp.ctb}</span>}
                    {tp?.pradr?.addr?.dst && <span>{tp.pradr.addr.dst}{tp.pradr.addr.stcd ? `, ${tp.pradr.addr.stcd}` : ""}</span>}
                    {tp?.rgdt && <span>Reg. {tp.rgdt}</span>}
                </div>
            </div>

            <div className="flex gap-1 mb-4 p-1 rounded-xl w-fit" style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)" }}>
                <TabBtn active={tab === "returns"} onClick={() => setTab("returns")} icon={HiOutlineClipboardDocumentList} label="Return Status" />
                <TabBtn active={tab === "reports"} onClick={() => setTab("reports")} icon={HiOutlineDocumentText} label="Reports" />
                <TabBtn active={tab === "compare"} onClick={() => setTab("compare")} icon={HiOutlineScale} label="Compare" />
            </div>

            {tab === "returns" && (
                <>
                    <div className="flex items-center justify-between mb-3">
                        <select className="input w-auto btn-sm" value={fy} onChange={(e) => setFy(e.target.value)} style={{ minHeight: 34 }}>
                            {fyList(6).map((y) => <option key={y} value={y}>FY {y}</option>)}
                        </select>
                        <button className="btn btn-ghost btn-sm" onClick={() => loadReturns(true)} disabled={loading}>
                            <HiOutlineArrowPath className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /> Refresh
                        </button>
                    </div>
                    <YearGrid title="GSTR-1 · Outward supplies" cells={g1} loading={loading} />
                    <YearGrid title="GSTR-3B · Summary return" cells={g3} loading={loading} />
                    <p className="text-xs muted text-center mt-2">Due dates: GSTR-1 by 11th, GSTR-3B by 20th of the next month (monthly filers).</p>
                </>
            )}

            {tab === "reports" && <GstReports gstin={gstin} gstUsername={client?.gstUsername} />}
            {tab === "compare" && <GstCompare gstin={gstin} gstUsername={client?.gstUsername} />}
        </div>
    );
}

function TabBtn({ active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon: React.ComponentType<{ className?: string }>; label: string }) {
    return (
        <button onClick={onClick} className="btn btn-sm" style={{ background: active ? "var(--color-surface)" : "transparent", color: active ? "var(--color-primary)" : "var(--color-text-secondary)", boxShadow: active ? "var(--shadow-sm)" : "none", border: "none" }}>
            <Icon className="w-4 h-4" /> <span className="hidden sm:inline">{label}</span>
        </button>
    );
}

function YearGrid({ title, cells, loading }: { title: string; cells: FilingCell[] | null; loading?: boolean }) {
    const summ = cells ? filingSummary(cells) : null;
    const items: (FilingCell | null)[] = cells || Array.from({ length: 12 }, () => null);
    return (
        <div className="card p-4 mb-3">
            <div className="flex items-center justify-between mb-3 gap-2">
                <h2 className="h2">{title}</h2>
                {summ && (
                    <div className="flex gap-1.5 flex-wrap justify-end">
                        {summ.ontime > 0 && <span className="chip chip-ok">{summ.ontime} filed</span>}
                        {summ.late > 0 && <span className="chip chip-late">{summ.late} late</span>}
                        {summ.notfiled > 0 && <span className="chip chip-bad">{summ.notfiled} not filed</span>}
                    </div>
                )}
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
                {items.map((c, i) => (
                    <div key={i} className={`cell ${c ? STATE_CELL[c.state] : "cell-upcoming"}`} style={loading && !c ? { opacity: 0.5 } : undefined}>
                        <span className="text-[11px] font-semibold">{c ? periodLabel(c.period).split(" ")[0] : "—"}</span>
                        <span className="text-[10px] mt-0.5">{c ? STATE_LABEL[c.state] : ""}</span>
                        {c?.dof && <span className="text-[9px] opacity-70 mt-px">{c.dof}</span>}
                    </div>
                ))}
            </div>
        </div>
    );
}

function Placeholder({ text }: { text: string }) {
    return <div className="card p-8 text-center muted text-sm max-w-lg mx-auto">{text}</div>;
}
