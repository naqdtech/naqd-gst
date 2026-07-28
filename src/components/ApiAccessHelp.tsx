import React from "react";
import { HiOutlineExclamationTriangle, HiOutlineArrowTopRightOnSquare } from "react-icons/hi2";

/**
 * Explains the GST-portal "Manage API Access" prerequisite that every OTP/API
 * session depends on. `alert` = the portal just rejected the OTP for this reason
 * (loud red card); otherwise it renders as a quiet, collapsible first-time hint.
 */
const STEPS = [
    "Log in to the GST portal as this taxpayer",
    "My Profile → Manage API Access",
    "Enable API Request → Yes",
    "Set Duration to 30 days → Confirm",
];

export default function ApiAccessHelp({ alert = false }: { alert?: boolean }) {
    const steps = (
        <ol className="list-decimal ml-4 mt-1.5 space-y-1">
            {STEPS.map((s) => <li key={s}>{s}</li>)}
        </ol>
    );
    const portalLink = (
        <a
            href="https://www.gst.gov.in"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 font-medium mt-2"
            style={{ color: "var(--color-primary)" }}
        >
            Open GST portal <HiOutlineArrowTopRightOnSquare className="w-3.5 h-3.5" />
        </a>
    );

    if (alert) {
        return (
            <div className="mt-3 rounded-xl p-3 text-xs animate-fade-in" style={{ background: "var(--color-bad-soft)" }}>
                <div className="flex items-center gap-1.5 font-semibold" style={{ color: "var(--color-bad)" }}>
                    <HiOutlineExclamationTriangle className="w-4 h-4 shrink-0" /> API access isn't enabled for this GSTIN
                </div>
                <p className="mt-1" style={{ color: "var(--color-text-secondary)" }}>
                    The GST portal is refusing a session — API access is off, or its duration is ≤ 6 hours. Enable it, then resend the OTP:
                </p>
                <div style={{ color: "var(--color-text-secondary)" }}>{steps}{portalLink}</div>
            </div>
        );
    }
    return (
        <details className="mt-3 text-[11px] muted">
            <summary className="cursor-pointer select-none">First time with this client? Enable API access on the GST portal</summary>
            <div className="mt-1" style={{ color: "var(--color-text-secondary)" }}>{steps}{portalLink}</div>
        </details>
    );
}
