import React, { useState } from "react";
import toast from "react-hot-toast";
import { HiOutlineShieldCheck, HiOutlineKey } from "react-icons/hi2";
import { gstAPI } from "../api/gst";
import { getSession, setSession, clearSession, upsertClient, getClient } from "../utils/gstSession";
import type { GstSession } from "../types";

/** Gates children behind an active 6-hour taxpayer session; renders the OTP flow otherwise. */
export default function OtpGate({ gstin, gstUsername, children }: {
    gstin: string; gstUsername?: string; children: (session: GstSession, end: () => void) => React.ReactNode;
}) {
    const [session, setSess] = useState<GstSession | null>(getSession(gstin));
    if (!session) return <OtpPanel gstin={gstin} gstUsername={gstUsername} onDone={setSess} />;
    return <>{children(session, () => { clearSession(gstin); setSess(null); })}</>;
}

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
                <h2 className="h2">Authenticate this client</h2>
            </div>
            <p className="muted text-sm mb-4">A one-time OTP unlocks reports & comparisons for ~6 hours.</p>
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
